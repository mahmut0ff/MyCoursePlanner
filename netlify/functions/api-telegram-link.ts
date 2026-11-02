/**
 * API: Telegram Link — Generate linking codes for Telegram account binding.
 *
 * POST /api-telegram-link  body: { action: 'generate' }
 *   → Returns { code, botUsername, deepLink }
 *
 * GET /api-telegram-link
 *   → Returns current link status { linked, telegramChatId }
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, badRequest, jsonResponse } from './utils/auth';
import { generateTelegramLinkCode, getTelegramBotToken, TELEGRAM_BOT_USERNAME } from './utils/telegram';
import { setTelegramWebhook, TELEGRAM_WEBHOOK_PATH } from './utils/telegram-webhook-auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized(event);

  const orgId = user.organizationId;
  if (!orgId) return badRequest('Organization context required');

  try {
    // GET — check link status
    if (event.httpMethod === 'GET') {
      const userDoc = await adminDb.collection('users').doc(user.uid).get();
      const data = userDoc.data() || {};
      return ok({
        linked: !!data.telegramChatId,
        telegramChatId: data.telegramChatId || null,
        telegramLinkedAt: data.telegramLinkedAt || null,
      });
    }

    // POST — generate link code
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      if (body.action === 'unlink') {
        await adminDb.collection('users').doc(user.uid).update({
          telegramChatId: '',
          telegramLinkedAt: '',
        });
        return ok({ unlinked: true });
      }

      // Generate code
      const code = await generateTelegramLinkCode(orgId, user.uid);

      // Global bot instead of organization-specific
      const botUsername = TELEGRAM_BOT_USERNAME;

      const origin = event.rawUrl ? new URL(event.rawUrl).origin : `https://${event.headers.host}`;
      if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        const systemToken = getTelegramBotToken();
        if (systemToken) {
          // Re-registers the global webhook with its secret_token — the way to
          // re-arm it after a token or secret rotation. Awaited: a function can be
          // frozen the moment it returns, and an unsent request with it.
          const whUrl = `${origin}${TELEGRAM_WEBHOOK_PATH}`;
          try {
            const whRes = await setTelegramWebhook(systemToken, whUrl);
            if (whRes && !whRes.ok) console.error('[telegram] setWebhook failed:', await whRes.text());
          } catch (e) {
            console.error('[telegram] setWebhook failed:', e);
          }
        }
      }

      const deepLink = `https://t.me/${botUsername}?start=${code}`;

      return ok({
        code,
        botUsername,
        deepLink,
        expiresInMinutes: 15,
      });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Telegram Link API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
