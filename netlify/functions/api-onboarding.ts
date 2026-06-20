/**
 * API: Onboarding — manage an org's Telegram join codes & registration mode.
 *
 * GET  ?action=codes                    → current codes + deep links + mode
 * POST ?action=regenerate { role }      → issue a new code (invalidates the old)
 * POST ?action=setMode    { mode }      → 'auto' | 'approval' for student joins
 *
 * Admin or manager-with-settings only.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { verifyAuth, ok, unauthorized, forbidden, badRequest, jsonResponse, hasPermission } from './utils/auth';
import { getOrgOnboarding, regenerateCode, setStudentJoinMode } from './utils/onboarding';
import { TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_TOKEN } from './utils/telegram';

const deepLink = (code: string) => `https://t.me/${TELEGRAM_BOT_USERNAME}?start=join_${code}`;

/** Ensure the global bot's webhook points at our handler (idempotent, best-effort). */
function ensureWebhook(rawUrl?: string, host?: string): void {
  const origin = rawUrl ? new URL(rawUrl).origin : (host ? `https://${host}` : '');
  if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) return;
  const whUrl = `${origin}/.netlify/functions/api-telegram-webhook`;
  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(whUrl)}&allowed_updates=${encodeURIComponent('["message"]')}`).catch(() => {});
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!hasPermission(user, 'settings')) return forbidden('Недостаточно прав');
  const orgId = user.organizationId;
  if (!orgId) return badRequest('No organization context');

  const action = event.queryStringParameters?.action || 'codes';

  try {
    if (event.httpMethod === 'GET' && action === 'codes') {
      ensureWebhook(event.rawUrl, event.headers.host);
      const o = await getOrgOnboarding(orgId);
      return ok({
        studentCode: o.studentCode,
        teacherCode: o.teacherCode,
        studentJoinMode: o.studentJoinMode,
        botUsername: TELEGRAM_BOT_USERNAME,
        studentLink: deepLink(o.studentCode),
        teacherLink: deepLink(o.teacherCode),
      });
    }

    if (event.httpMethod === 'POST' && action === 'regenerate') {
      const { role } = JSON.parse(event.body || '{}');
      if (role !== 'student' && role !== 'teacher') return badRequest('role must be student or teacher');
      const code = await regenerateCode(orgId, role);
      return ok({ code, link: deepLink(code) });
    }

    if (event.httpMethod === 'POST' && action === 'setMode') {
      const { mode } = JSON.parse(event.body || '{}');
      if (mode !== 'auto' && mode !== 'approval') return badRequest('mode must be auto or approval');
      await setStudentJoinMode(orgId, mode);
      return ok({ studentJoinMode: mode });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Onboarding API error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};
