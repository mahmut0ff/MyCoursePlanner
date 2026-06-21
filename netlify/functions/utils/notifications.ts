/**
 * Shared notification helper — creates in-app notifications + FCM push + Telegram.
 */
import { adminDb } from './firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';
import { sendTelegramToUser } from './telegram';
import { sendJoinApprovalButtons } from './join-approvals';

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
  | 'payment_due'
  | 'payment_overdue'
  | 'exam_submitted'
  | 'lesson_reminder'
  | 'schedule_changed'
  | 'weekly_digest'
  | 'risk_alert'
  | 'lead_followup'
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
  /** Skip the plain Telegram message (e.g. when a richer interactive one is sent separately). */
  skipTelegram?: boolean;
}

/**
 * Create an in-app notification + attempt FCM push + attempt Telegram.
 */
export async function createNotification(payload: NotificationPayload): Promise<void> {
  const { organizationId, skipTelegram, ...rest } = payload;
  const data = {
    ...rest,
    read: false,
    createdAt: new Date().toISOString(),
  };

  // Write to Firestore (in-app)
  await adminDb.collection(NOTIFICATIONS).add(data);

  // Attempt FCM push (best-effort, never throw)
  try {
    await sendPush(payload.recipientId, payload.title, payload.message, payload.link, payload.type);
  } catch (e) {
    console.warn('FCM push failed (non-fatal):', e);
  }

  // Attempt Telegram notification (best-effort, never throw)
  if (skipTelegram) return;
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
 * Notify org admins of a pending join request.
 * Creates the usual in-app + push notifications, and — instead of a plain
 * Telegram line — sends an interactive message with "Принять / Отклонить"
 * buttons so admins can decide right from Telegram.
 */
export async function notifyJoinRequest(
  orgId: string, applicantUid: string, applicantName: string, role: 'student' | 'teacher',
): Promise<void> {
  const snap = await adminDb.collection('orgMembers').doc(orgId)
    .collection('members')
    .where('status', '==', 'active')
    .get();
  const admins = snap.docs.filter(d => ['admin', 'owner', 'manager'].includes(d.data().role));
  const adminUserIds = admins.map(d => d.data().userId || d.id);

  const roleWord = role === 'teacher' ? 'преподаватель' : 'ученик';
  const link = role === 'teacher' ? '/teachers' : '/students';

  // In-app + push only (skipTelegram) — the Telegram message is the interactive one below.
  await Promise.allSettled(
    adminUserIds.map(uid =>
      createNotification({
        recipientId: uid,
        type: 'new_vacancy_application',
        title: 'Новая заявка на вступление',
        message: `${applicantName} подал(а) заявку через Telegram (${roleWord})`,
        link,
        organizationId: orgId,
        skipTelegram: true,
      }),
    ),
  );

  // Interactive Telegram message with Approve/Reject buttons.
  await sendJoinApprovalButtons({ orgId, applicantUid, applicantName, role, adminUserIds });
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
 * Notify the members of a single group (its students + teachers), plus any
 * extra recipients. Used for schedule changes / lesson reminders.
 */
export async function notifyGroupMembers(
  orgId: string, groupId: string, type: NotificationType, title: string, message: string, link?: string, extraRecipientIds: string[] = []
): Promise<void> {
  const groupDoc = await adminDb.collection('groups').doc(groupId).get();
  if (!groupDoc.exists) return;
  const g = groupDoc.data() || {};
  const recipients = new Set<string>([
    ...(g.studentIds || []),
    ...(g.teacherIds || []),
    ...extraRecipientIds.filter(Boolean),
  ]);
  const promises = [...recipients].map(uid =>
    createNotification({ recipientId: uid, type, title, message, link, organizationId: orgId })
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
 * Map notification type → user preference key.
 */
const TYPE_TO_PREF: Record<string, string> = {
  homework_submitted: 'homework',
  homework_graded: 'homework',
  new_lesson: 'lessons',
  grade_posted: 'exams',
  exam_result_ready: 'exams',
  exam_room_created: 'exams',
  exam_submitted: 'exams',
  attendance_absent: 'schedule',
  lesson_reminder: 'schedule',
  schedule_changed: 'schedule',
};

/**
 * Send FCM push to a specific user (best-effort).
 * Checks user's notification preferences before sending.
 * Uses DATA-ONLY messages (no `notification` key) to prevent duplication.
 */
async function sendPush(userId: string, title: string, body: string, link?: string, notifType?: string): Promise<void> {
  const userDoc = await adminDb.collection('users').doc(userId).get();
  if (!userDoc.exists) return;
  const userData = userDoc.data() || {};

  // Check notification preferences
  const prefs = userData.notificationPreferences || {};
  if (prefs.pushEnabled === false) return; // User disabled all push
  if (notifType && TYPE_TO_PREF[notifType] && prefs[TYPE_TO_PREF[notifType]] === false) return; // Category disabled

  const fcmTokens: string[] = userData.fcmTokens || [];
  if (fcmTokens.length === 0) return;

  const messaging = getMessaging();
  // Data-only message — no `notification` key!
  const message = {
    data: {
      title,
      body,
      link: link || '/',
      type: 'notification',
      icon: '/icons/logo.png',
    },
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
