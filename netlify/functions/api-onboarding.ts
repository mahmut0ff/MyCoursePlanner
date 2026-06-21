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
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, forbidden, badRequest, jsonResponse, hasPermission } from './utils/auth';
import {
  getOrgOnboarding, regenerateCode, setStudentJoinMode,
  getGroupJoinCode, regenerateGroupCode, createPendingInvite,
} from './utils/onboarding';
import { TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_TOKEN } from './utils/telegram';

const deepLink = (code: string) => `https://t.me/${TELEGRAM_BOT_USERNAME}?start=join_${code}`;
const claimLink = (token: string) => `https://t.me/${TELEGRAM_BOT_USERNAME}?start=claim_${token}`;

/** Ensure the global bot's webhook points at our handler (idempotent, best-effort). */
function ensureWebhook(rawUrl?: string, host?: string): void {
  const origin = rawUrl ? new URL(rawUrl).origin : (host ? `https://${host}` : '');
  if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) return;
  const whUrl = `${origin}/.netlify/functions/api-telegram-webhook`;
  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(whUrl)}&allowed_updates=${encodeURIComponent('["message","callback_query"]')}`).catch(() => {});
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

    // ── Per-group invite links ──
    if (event.httpMethod === 'GET' && action === 'groups') {
      const snap = await adminDb.collection('groups').where('organizationId', '==', orgId).get();
      const groups = snap.docs.map((d) => {
        const g = d.data();
        return {
          id: d.id,
          name: g.name || 'Группа',
          courseName: g.courseName || '',
          studentsCount: Array.isArray(g.studentIds) ? g.studentIds.length : 0,
          joinCode: g.joinCode || null,
          link: g.joinCode ? deepLink(g.joinCode) : null,
        };
      });
      return ok({ groups });
    }

    if (event.httpMethod === 'POST' && action === 'groupCode') {
      const { groupId } = JSON.parse(event.body || '{}');
      if (!groupId) return badRequest('groupId required');
      const res = await getGroupJoinCode(orgId, groupId);
      if (!res) return badRequest('Группа не найдена');
      return ok({ code: res.code, groupName: res.groupName, link: deepLink(res.code) });
    }

    if (event.httpMethod === 'POST' && action === 'regenGroupCode') {
      const { groupId } = JSON.parse(event.body || '{}');
      if (!groupId) return badRequest('groupId required');
      const res = await regenerateGroupCode(orgId, groupId);
      if (!res) return badRequest('Группа не найдена');
      return ok({ code: res.code, groupName: res.groupName, link: deepLink(res.code) });
    }

    // ── Bulk create from an imported / AI-extracted roster ──
    if (event.httpMethod === 'POST' && action === 'bulkCreate') {
      const body = JSON.parse(event.body || '{}');
      const students = Array.isArray(body.students) ? body.students.slice(0, 300) : [];
      const role: 'student' | 'teacher' = body.role === 'teacher' ? 'teacher' : 'student';
      const groupId = body.groupId || undefined;
      if (students.length === 0) return badRequest('students required');

      const orgSnap = await adminDb.collection('organizations').doc(orgId).get();
      const orgName = orgSnap.data()?.name || '';
      let groupName: string | undefined;
      if (groupId) {
        const gs = await adminDb.collection('groups').doc(groupId).get();
        groupName = gs.exists ? (gs.data()?.name as string) : undefined;
      }

      const results: any[] = [];
      for (const s of students) {
        const name = String(s.name || '').trim();
        const phone = String(s.phone || '').trim();
        if (!name && !phone) continue;
        try {
          const inv = await createPendingInvite({ orgId, orgName, role, name, phone, groupId, groupName });
          results.push({ name: name || 'Без имени', phone, status: inv.status, link: claimLink(inv.token) });
        } catch (e: any) {
          results.push({ name: name || 'Без имени', phone, status: 'error', error: e.message });
        }
      }
      return ok({ created: results.length, results });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Onboarding API error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};
