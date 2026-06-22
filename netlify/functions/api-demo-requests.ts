/**
 * API: Demo Requests (sales lead capture from landing page).
 *
 * - POST  (public)              → submit a new demo request
 * - GET   (super_admin)         → list demo requests
 * - PATCH (super_admin)         → update status / notes on a request
 *
 * Triggered by the "Заказать демо" form on the landing page. Owners of
 * учебных центров can no longer self-register — they go through demo here.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isSuperAdmin, jsonResponse, ok, badRequest, unauthorized, forbidden, notFound } from './utils/auth';
import { notifyAllSuperAdmins, notifySuperAdminTelegram } from './utils/notifications';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';

const VALID_STATUSES = ['new', 'contacted', 'scheduled', 'done', 'rejected'] as const;
type DemoStatus = (typeof VALID_STATUSES)[number];

// Normalise a Telegram contact to a clickable URL when possible.
function normalizeTelegram(raw: string): { display: string; url: string | null } {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { display: '', url: null };
  if (/^https?:\/\//i.test(trimmed)) return { display: trimmed, url: trimmed };
  const handle = trimmed.replace(/^@+/, '').replace(/\s+/g, '');
  if (/^[A-Za-z0-9_]{3,}$/.test(handle)) {
    return { display: `@${handle}`, url: `https://t.me/${handle}` };
  }
  return { display: trimmed, url: null };
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  // ─── PUBLIC: submit a demo request ───
  if (event.httpMethod === 'POST') {
    // Throttle anonymous submissions per IP.
    const rlKey = getRateLimitKey(event, 'anon');
    if (rateLimiters.write.isLimited(rlKey)) {
      return jsonResponse(429, { error: 'Слишком много запросов. Попробуйте чуть позже.' });
    }

    let body: any;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return badRequest('Invalid JSON'); }

    const orgName = String(body.orgName || '').trim();
    const ownerName = String(body.ownerName || '').trim();
    const telegramRaw = String(body.telegram || '').trim();
    const note = String(body.note || '').trim().slice(0, 1000);

    if (!orgName || orgName.length < 2) return badRequest('Укажите название учебного центра');
    if (!ownerName || ownerName.length < 2) return badRequest('Укажите имя владельца');
    if (!telegramRaw) return badRequest('Укажите Telegram для связи');

    const telegram = normalizeTelegram(telegramRaw);
    const now = new Date().toISOString();

    const record = {
      orgName: orgName.slice(0, 120),
      ownerName: ownerName.slice(0, 120),
      telegramRaw: telegramRaw.slice(0, 200),
      telegramDisplay: telegram.display,
      telegramUrl: telegram.url,
      note,
      status: 'new' as DemoStatus,
      source: 'landing',
      ip: (event.headers['x-forwarded-for'] || event.headers['client-ip'] || '').toString().split(',')[0].trim() || null,
      userAgent: (event.headers['user-agent'] || '').toString().slice(0, 300),
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection('demoRequests').add(record);

    // Notify all super admins: in-app (bell) + Telegram (super-admin channel).
    const msg = `Учебный центр: ${record.orgName}\nВладелец: ${record.ownerName}\nTelegram: ${record.telegramDisplay}`;
    notifyAllSuperAdmins('new_lead', 'Новая заявка на демо', msg, '/admin/demo-requests').catch(() => {});
    notifySuperAdminTelegram(
      `📩 <b>Новая заявка на демо</b>\n\n` +
      `🏫 ${record.orgName}\n` +
      `👤 ${record.ownerName}\n` +
      `💬 ${record.telegramDisplay}` +
      (record.note ? `\n📝 ${record.note}` : ''),
    ).catch(() => {});

    return ok({ id: ref.id, ok: true });
  }

  // ─── PROTECTED: super-admin operations ───
  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!isSuperAdmin(user)) return forbidden();

  if (event.httpMethod === 'GET') {
    const status = event.queryStringParameters?.status;
    let query: FirebaseFirestore.Query = adminDb.collection('demoRequests');
    if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
      query = query.where('status', '==', status);
    }
    const snap = await query.orderBy('createdAt', 'desc').limit(200).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return ok({ items, total: items.length });
  }

  if (event.httpMethod === 'PATCH') {
    let body: any;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return badRequest('Invalid JSON'); }

    const id = body.id;
    if (!id) return badRequest('id required');
    const docRef = adminDb.collection('demoRequests').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) return notFound('Request not found');

    const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (body.status) {
      if (!(VALID_STATUSES as readonly string[]).includes(body.status)) return badRequest('Invalid status');
      patch.status = body.status;
    }
    if (typeof body.adminNote === 'string') patch.adminNote = String(body.adminNote).slice(0, 1000);

    await docRef.update(patch);
    return ok({ id, ...patch });
  }

  if (event.httpMethod === 'DELETE') {
    const id = event.queryStringParameters?.id;
    if (!id) return badRequest('id required');
    await adminDb.collection('demoRequests').doc(id).delete();
    return ok({ id, deleted: true });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};
