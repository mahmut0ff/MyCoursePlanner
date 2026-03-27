/**
 * Shared notification helper — creates in-app notifications + sends FCM push.
 */
import { adminDb } from './firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';

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
  | 'plan_gifted';

interface NotificationPayload {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, any>;
}

/**
 * Create an in-app notification + attempt FCM push.
 */
export async function createNotification(payload: NotificationPayload): Promise<void> {
  const data = {
    ...payload,
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
}

/**
 * Notify all admins of an organization.
 */
export async function notifyOrgAdmins(
  orgId: string, type: NotificationType, title: string, message: string, link?: string
): Promise<void> {
  const snap = await adminDb.collection('users')
    .where('organizationId', '==', orgId).get();
  const admins = snap.docs.filter(d => d.data().role === 'admin');
  const promises = admins.map(d =>
    createNotification({ recipientId: d.id, type, title, message, link })
  );
  await Promise.allSettled(promises);
}

/**
 * Notify all students of an organization.
 */
export async function notifyOrgStudents(
  orgId: string, type: NotificationType, title: string, message: string, link?: string
): Promise<void> {
  const snap = await adminDb.collection('users')
    .where('organizationId', '==', orgId).get();
  const students = snap.docs.filter(d => d.data().role === 'student');
  const promises = students.map(d =>
    createNotification({ recipientId: d.id, type, title, message, link })
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
 */
async function sendPush(userId: string, title: string, body: string, link?: string): Promise<void> {
  const userDoc = await adminDb.collection('users').doc(userId).get();
  if (!userDoc.exists) return;
  const fcmTokens: string[] = userDoc.data()?.fcmTokens || [];
  if (fcmTokens.length === 0) return;

  const messaging = getMessaging();
  const message = {
    notification: { title, body },
    data: { link: link || '/', type: 'notification' },
    webpush: {
      fcmOptions: { link: link || '/' },
      notification: {
        icon: '/icons/logo.png',
        badge: '/icons/logo.png',
      },
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
