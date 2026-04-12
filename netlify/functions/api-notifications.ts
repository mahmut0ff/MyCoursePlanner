/**
 * API: Notifications — mark read, save/remove FCM tokens.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, badRequest, jsonResponse } from './utils/auth';
import { notifyOrgAdmins } from './utils/notifications';
import { FieldValue } from 'firebase-admin/firestore';

const NOTIFICATIONS = 'notifications';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // List notifications for the current user
    if ((!action || action === 'list') && event.httpMethod === 'GET') {
      const snap = await adminDb.collection(NOTIFICATIONS)
        .where('recipientId', '==', user.uid)
        .orderBy('createdAt', 'desc')
        .limit(50).get();
      const notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return ok(notifications);
    }

    // Unread count
    if (action === 'unreadCount' && event.httpMethod === 'GET') {
      const snap = await adminDb.collection(NOTIFICATIONS)
        .where('recipientId', '==', user.uid)
        .where('read', '==', false).get();
      return ok({ count: snap.size });
    }

    // Mark single notification as read
    if (action === 'markRead' && event.httpMethod === 'POST') {
      if (!body.id) return badRequest('id required');
      const doc = await adminDb.collection(NOTIFICATIONS).doc(body.id).get();
      if (!doc.exists || doc.data()?.recipientId !== user.uid) return badRequest('Not found');
      await adminDb.collection(NOTIFICATIONS).doc(body.id).update({ read: true });
      return ok({ success: true });
    }

    // Mark all notifications as read
    if (action === 'markAllRead' && event.httpMethod === 'POST') {
      const snap = await adminDb.collection(NOTIFICATIONS)
        .where('recipientId', '==', user.uid)
        .where('read', '==', false).get();
      const batch = adminDb.batch();
      snap.docs.forEach(d => batch.update(d.ref, { read: true }));
      await batch.commit();
      return ok({ success: true, count: snap.size });
    }

    // Notify about a new lead
    if (action === 'notifyNewLead' && event.httpMethod === 'POST') {
      if (!body.name) return badRequest('name required');
      const orgId = user.activeOrgId || user.organizationId;
      if (!orgId) return badRequest('org required');

      const sourceText = body.source === 'telegram_bot' ? 'через Telegram бота' :
                         body.source === 'manual' ? '(добавлена вручную)' :
                         'через AI-ассистента на сайте';
      const message = `У вас новая заявка ${sourceText}!\n\n` +
                      `👤 Имя: ${body.name}\n` +
                      `📞 Телефон: ${body.phone || 'Не указан'}\n` +
                      `${body.reason ? `🎯 Цель: ${body.reason}` : ''}`;
      
      const title = '📩 Новая заявка';
      await notifyOrgAdmins(orgId, 'new_lead', title, message, '/leads');

      return ok({ success: true });
    }

    // Save FCM token
    if (action === 'saveFcmToken' && event.httpMethod === 'POST') {
      if (!body.token) return badRequest('token required');
      await adminDb.collection('users').doc(user.uid).update({
        fcmTokens: FieldValue.arrayUnion(body.token),
      });
      return ok({ success: true });
    }

    // Remove FCM token (on logout)
    if (action === 'removeFcmToken' && event.httpMethod === 'POST') {
      if (!body.token) return badRequest('token required');
      await adminDb.collection('users').doc(user.uid).update({
        fcmTokens: FieldValue.arrayRemove(body.token),
      });
      return ok({ success: true });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('api-notifications error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

export { handler };
