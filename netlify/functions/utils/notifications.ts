/**
 * Shared notification helper — creates in-app notifications + FCM push + Telegram.
 */
import { adminDb } from './firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';
import { sendTelegramToUser } from './telegram';

const NOTIFICATIONS = 'notifications';

export type NotificationType =
  | 'invite_received'
  | 'vacancy_app_reviewed'
  | 'added_to_group'
  | 'new_vacancy_application'
  | 'invite_accepted'
  | 'invite_declined'
  | 'exam_room_created'
  | 'exam_result_ready'
  | 'new_lesson'
  | 'new_org_registered'
  | 'trial_reminder'
  | 'trial_expired'
  | 'plan_gifted'
  | 'homework_submitted'
  | 'homework_graded'
  | 'grade_posted'
  | 'attendance_absent'
  | 'payment_received'
  | 'exam_submitted'
  | 'new_lead';

interface NotificationPayload {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, any>;
  /** Organization ID — needed for Telegram delivery */
  organizationId?: string;
}

/**
 * Create an in-app notification + attempt FCM push + attempt Telegram.
 */
export async function createNotification(payload: NotificationPayload): Promise<void> {
  const { organizationId, ...rest } = payload;
  const data = {
    ...rest,
    read: false,
    createdAt: new Date().toISOString(),
  };

  // Write to Firestore (in-app)
  await adminDb.collection(NOTIFICATIONS).add(data);

  // Attempt FCM push (best-effort, never throw)
  try {
    await sendPush(payload.recipientId, payload.title, payload.message, payload.link);
  } catch (e) {
    console.warn('FCM push failed (non-fatal):', e);
  }

  // Attempt Telegram notification (best-effort, never throw)
  try {
    // Resolve orgId: use provided or look up from user doc
    let orgId = organizationId;
    if (!orgId) {
      const userDoc = await adminDb.collection('users').doc(payload.recipientId).get();
      orgId = userDoc.data()?.activeOrgId || userDoc.data()?.organizationId;
    }
    if (orgId) {
      const tgMessage = `🔔 <b>${payload.title}</b>\n\n${payload.message}`;
      await sendTelegramToUser(orgId, payload.recipientId, tgMessage);
    }
  } catch (e) {
    console.warn('Telegram notification failed (non-fatal):', e);
  }
}

/**
 * Notify all admins and managers of an organization.
 * Uses the orgMembers sub-collection for reliable multi-tenant membership lookup.
 */
export async function notifyOrgAdmins(
  orgId: string, type: NotificationType, title: string, message: string, link?: string
): Promise<void> {
  const snap = await adminDb.collection('orgMembers').doc(orgId)
    .collection('members')
    .where('status', '==', 'active')
    .get();
  const admins = snap.docs.filter(d => {
    const role = d.data().role;
    return ['admin', 'owner', 'manager'].includes(role);
  });
  const promises = admins.map(d =>
    createNotification({ recipientId: d.data().userId || d.id, type, title, message, link, organizationId: orgId })
  );
  await Promise.allSettled(promises);
}

/**
 * Notify all students of an organization.
 * Uses the orgMembers sub-collection for reliable multi-tenant membership lookup.
 */
export async function notifyOrgStudents(
  orgId: string, type: NotificationType, title: string, message: string, link?: string
): Promise<void> {
  const snap = await adminDb.collection('orgMembers').doc(orgId)
    .collection('members')
    .where('status', '==', 'active')
    .where('role', '==', 'student')
    .get();
  const promises = snap.docs.map(d =>
    createNotification({ recipientId: d.data().userId || d.id, type, title, message, link, organizationId: orgId })
  );
  await Promise.allSettled(promises);
}

/**
 * Notify all super admins.
 */
export async function notifyAllSuperAdmins(
  type: NotificationType, title: string, message: string, link?: string
): Promise<void> {
  const snap = await adminDb.collection('users')
    .where('role', '==', 'super_admin').get();
  const promises = snap.docs.map(d =>
    createNotification({ recipientId: d.id, type, title, message, link })
  );
  await Promise.allSettled(promises);
}

/**
 * Send FCM push to a specific user (best-effort).
 * Uses DATA-ONLY messages (no `notification` key) to prevent duplication.
 * When a `notification` key is present, the OS auto-displays it AND the
 * service worker's onBackgroundMessage fires — causing double notifications
 * on mobile. Data-only messages give the SW exclusive control.
 */
async function sendPush(userId: string, title: string, body: string, link?: string): Promise<void> {
  const userDoc = await adminDb.collection('users').doc(userId).get();
  if (!userDoc.exists) return;
  const fcmTokens: string[] = userDoc.data()?.fcmTokens || [];
  if (fcmTokens.length === 0) return;

  const messaging = getMessaging();
  // Data-only message — no `notification` key!
  // The service worker reads these fields and calls showNotification() itself.
  const message = {
    data: {
      title,
      body,
      link: link || '/',
      type: 'notification',
      icon: '/icons/logo.png',
    },
    // Android: set high priority so data-only messages wake the device
    android: {
      priority: 'high' as const,
    },
    webpush: {
      headers: { Urgency: 'high' },
    },
  };

  // Send to all user's device tokens, remove invalid ones
  const invalidTokens: string[] = [];
  await Promise.allSettled(
    fcmTokens.map(async (token) => {
      try {
        await messaging.send({ ...message, token });
      } catch (err: any) {
        if (err?.code === 'messaging/invalid-registration-token' ||
            err?.code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(token);
        }
      }
    })
  );

  // Clean up invalid tokens
  if (invalidTokens.length > 0) {
    const validTokens = fcmTokens.filter(t => !invalidTokens.includes(t));
    await adminDb.collection('users').doc(userId).update({ fcmTokens: validTokens });
  }
}
