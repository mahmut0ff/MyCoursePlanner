/**
 * Authenticity of Telegram webhook requests.
 *
 * `/.netlify/functions/api-telegram-webhook` is a public URL, and the handler
 * takes `chat.id` / `callback_query.from.id` as the caller's identity. Without
 * a check, one forged POST carrying a director's Telegram id approves join
 * requests (`apv:`), messages every debtor (`dir:`) or tells the staff copilot
 * to write grades. The Bot API closes this: the `secret_token` given to
 * setWebhook comes back in the `X-Telegram-Bot-Api-Secret-Token` header of
 * every update, and only Telegram and this server know it (getWebhookInfo
 * doesn't return it).
 *
 * Each bot has its own secret, all from one env var, TELEGRAM_WEBHOOK_SECRET —
 * with no fallback in source:
 *  - the global bot (@sabakhub_bot) uses it as is, so its webhook can be
 *    re-registered by hand with a single setWebhook call;
 *  - an org's own bot (webhook `?orgId=<id>`) uses HMAC-SHA256(secret,
 *    `org:<id>`). Nothing is stored: `organizationAIManager` is served whole by
 *    the unauthenticated `getSettings` action, so a stored secret would leak
 *    like the bot token does. One org's secret fits neither another org's URL
 *    nor the global bot, and the check needs no Firestore read, so a forged
 *    request is dropped before it costs a single one.
 *
 * Rollout: webhooks registered before this check carry no secret, and an
 * enforcing deploy drops their updates until they are re-registered.
 * TELEGRAM_WEBHOOK_REPORT_ONLY=true is the transition mode — nothing is
 * dropped, and every update that would be is logged. Re-register the webhooks,
 * wait for those log lines to stop, then remove the flag and redeploy.
 */
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { HandlerEvent } from '@netlify/functions';

export const TELEGRAM_WEBHOOK_PATH = '/.netlify/functions/api-telegram-webhook';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/** What Telegram accepts as secret_token (A-Z a-z 0-9 _ -), with a floor of 32 so it can't be guessed. */
const SECRET_FORMAT = /^[A-Za-z0-9_-]{32,256}$/;

function masterSecret(): string | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (SECRET_FORMAT.test(secret)) return secret;
  console.error(secret
    ? '[telegram-webhook] TELEGRAM_WEBHOOK_SECRET is malformed: it needs 32-256 characters of A-Z a-z 0-9 _ - (e.g. `openssl rand -hex 32`). Webhook updates can\'t be verified and webhooks are not registered.'
    : '[telegram-webhook] TELEGRAM_WEBHOOK_SECRET is not set: webhook updates can\'t be verified and webhooks are not registered. Set it in the Netlify site environment.');
  return null;
}

/**
 * The secret_token of a bot's webhook: the global bot's when `orgId` is empty,
 * otherwise that org's own bot's. Null when TELEGRAM_WEBHOOK_SECRET is unusable
 * (already logged).
 */
export function telegramWebhookSecret(orgId?: string | null): string | null {
  const secret = masterSecret();
  if (!secret) return null;
  return orgId ? createHmac('sha256', secret).update(`org:${orgId}`).digest('hex') : secret;
}

/** Header names keep whatever case the client sent. */
function header(event: HandlerEvent, name: string): string {
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (key.toLowerCase() === name) return String(value ?? '');
  }
  return '';
}

function verify(event: HandlerEvent, orgId?: string | null): 'ok' | 'not_configured' | 'missing' | 'mismatch' {
  const expected = telegramWebhookSecret(orgId);
  if (!expected) return 'not_configured';
  const got = header(event, SECRET_HEADER);
  if (!got) return 'missing';
  // Digests are equal-length buffers, as timingSafeEqual requires, and they
  // don't give away the secret's length either.
  const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
  return timingSafeEqual(digest(got), digest(expected)) ? 'ok' : 'mismatch';
}

/**
 * Gate for the webhook handler: null when the update may be processed,
 * otherwise the response to return without touching it.
 */
export function telegramWebhookAccessError(
  event: HandlerEvent,
  orgId?: string | null,
): { statusCode: number; body: string } | null {
  const verdict = verify(event, orgId);
  if (verdict === 'ok') return null;

  // Both come from the client: quoted, so they can't forge log lines.
  const bot = orgId ? `org:${JSON.stringify(String(orgId).slice(0, 64))}` : 'global';
  const ip = JSON.stringify(header(event, 'x-nf-client-connection-ip').slice(0, 64));

  if (String(process.env.TELEGRAM_WEBHOOK_REPORT_ONLY || '').toLowerCase() === 'true') {
    console.warn(
      `[telegram-webhook] REPORT-ONLY: would reject update (${verdict}, bot=${bot}, ip=${ip}), processing it anyway. `
      + 'Remove TELEGRAM_WEBHOOK_REPORT_ONLY once every webhook is re-registered with its secret.',
    );
    return null;
  }

  console.warn(`[telegram-webhook] rejected update (${verdict}, bot=${bot}, ip=${ip})`);
  // 200 like every other outcome of this webhook: a non-2xx makes Telegram retry.
  return { statusCode: 200, body: 'OK' };
}

/**
 * Point a bot's webhook at `url` together with its secret_token (in the POST
 * body, not the query string). Resolves to null without calling Telegram when
 * the secret isn't configured: setWebhook without secret_token would wipe the
 * secret Telegram holds, and every later update would be rejected.
 */
export async function setTelegramWebhook(botToken: string, url: string, orgId?: string | null): Promise<Response | null> {
  const secretToken = telegramWebhookSecret(orgId);
  if (!secretToken) return null;
  return fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secretToken }),
    signal: AbortSignal.timeout(5000),
  });
}
