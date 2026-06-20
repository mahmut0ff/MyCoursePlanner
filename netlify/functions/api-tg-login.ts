/**
 * API: Telegram passwordless login.
 * POST { ott } → exchanges a one-time token (issued by the bot) for a Firebase
 * custom token the client signs in with. Public endpoint, rate-limited by IP.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminAuth } from './utils/firebase-admin';
import { jsonResponse, badRequest } from './utils/auth';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';
import { consumeLoginToken } from './utils/onboarding';

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  if (rateLimiters.auth.isLimited(getRateLimitKey(event))) {
    return jsonResponse(429, { error: 'Слишком много попыток. Попробуйте позже.' });
  }

  try {
    const { ott } = JSON.parse(event.body || '{}');
    if (!ott) return badRequest('ott required');

    const uid = await consumeLoginToken(String(ott));
    if (!uid) return jsonResponse(401, { error: 'Ссылка для входа недействительна или истекла.' });

    const customToken = await adminAuth.createCustomToken(uid);
    return jsonResponse(200, { customToken });
  } catch (err: any) {
    console.error('TG login error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};
