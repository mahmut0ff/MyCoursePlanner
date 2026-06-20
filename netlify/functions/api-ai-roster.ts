/**
 * API: AI Roster — conversational add of students/teachers.
 * POST { text } → parses natural language ("добавь Айгуль +996.. в группу A2"),
 * pre-creates accounts and returns shareable Telegram claim links.
 * Admin / manager only, plan-gated.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, forbidden, badRequest, jsonResponse, hasRole } from './utils/auth';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';
import { getModel, parseJsonLoose, aiAllowed, hasGeminiKey, recordAiUsage } from './utils/ai';
import { createPendingInvite } from './utils/onboarding';
import { TELEGRAM_BOT_USERNAME } from './utils/telegram';

const claimLink = (token: string) => `https://t.me/${TELEGRAM_BOT_USERNAME}?start=claim_${token}`;

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!hasRole(user, 'admin', 'manager', 'super_admin')) return forbidden('Только владелец и менеджер могут добавлять людей');
  if (!aiAllowed(user)) return forbidden('AI недоступен на вашем тарифе');
  if (!user.organizationId) return badRequest('No organization context');
  if (!hasGeminiKey()) return jsonResponse(500, { error: 'GEMINI_API_KEY is not configured on the server.' });
  if (rateLimiters.ai.isLimited(getRateLimitKey(event, user.uid))) {
    return jsonResponse(429, { error: 'Слишком много запросов. Подождите немного.' });
  }

  const orgId = user.organizationId;

  try {
    const { text } = JSON.parse(event.body || '{}');
    if (!text || !String(text).trim()) return badRequest('text required');

    // Parse the natural-language command(s).
    const model = getModel({ json: true });
    const prompt = `Извлеки из текста список людей для добавления в учебный центр. Текст на русском/кыргызском.

ТЕКСT: "${String(text).trim()}"

Верни строго JSON: { "items": [{ "name": string, "phone": string (с кодом страны, если есть; иначе ""), "role": "student" | "teacher" (по умолчанию student), "groupName": string (название группы, если указано; иначе "") }] }
Только чистый JSON.`;
    const result = await model.generateContent(prompt);
    const parsed = parseJsonLoose<{ items?: any[] }>(result.response.text());
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 30) : [];
    if (items.length === 0) return ok({ data: { results: [], reply: 'Не удалось распознать, кого добавить. Уточните имя и телефон.' } });

    // Resolve org name + group names → ids.
    const [orgSnap, groupsSnap] = await Promise.all([
      adminDb.collection('organizations').doc(orgId).get(),
      adminDb.collection('groups').where('organizationId', '==', orgId).get(),
    ]);
    const orgName = orgSnap.data()?.name || '';
    const groups = groupsSnap.docs.map((d) => ({ id: d.id, name: (d.data().name || '').toLowerCase() }));
    const findGroup = (nm: string) => {
      const n = (nm || '').trim().toLowerCase();
      if (!n) return undefined;
      return groups.find((g) => g.name === n) || groups.find((g) => g.name.includes(n) || n.includes(g.name));
    };

    const results: any[] = [];
    for (const it of items) {
      const name = String(it.name || '').trim();
      const phone = String(it.phone || '').trim();
      const role: 'student' | 'teacher' = it.role === 'teacher' ? 'teacher' : 'student';
      if (!name && !phone) continue;
      const grp = findGroup(it.groupName);
      try {
        const inv = await createPendingInvite({ orgId, orgName, role, name, phone, groupId: grp?.id, groupName: it.groupName || undefined });
        results.push({ name: name || 'Без имени', phone, role, group: it.groupName || null, status: inv.status, link: claimLink(inv.token) });
      } catch (e: any) {
        results.push({ name: name || 'Без имени', phone, role, status: 'error', error: e.message });
      }
    }

    recordAiUsage(orgId, 'roster_add');
    const okCount = results.filter((r) => r.status !== 'error').length;
    return ok({ data: { results, reply: `Добавлено: ${okCount}. Отправьте каждому ссылку-приглашение для входа.` } });
  } catch (err: any) {
    console.error('AI Roster error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};
