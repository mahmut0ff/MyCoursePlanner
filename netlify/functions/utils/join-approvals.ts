/**
 * Join-request approvals via Telegram inline buttons.
 *
 * When a student/teacher applies (status='pending'), org admins receive a
 * Telegram message with "✅ Принять / ❌ Отклонить" buttons. Pressing a button
 * fires a callback_query that the webhook routes here:
 *   - the presser is verified to be an admin/owner/manager of the org,
 *   - the membership is flipped to active (approve) or removed (reject),
 *   - all admins' messages are reconciled by the webhook afterwards.
 *
 * A short-lived token doc (telegramApprovals/{token}) maps a button press back
 * to the applicant + org, and remembers every admin message so they can all be
 * updated once one admin decides. callback_data stays well under Telegram's
 * 64-byte limit: `apv:<16-hex>:a|r`.
 */
import { randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { getOrgLimits } from './plan-limits';
import { TELEGRAM_BOT_TOKEN } from './telegram';

const now = () => new Date().toISOString();
const tgApi = (method: string) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;

interface SentMessage { chatId: string; messageId: number; }

export interface ApprovalRecord {
  orgId: string;
  applicantUid: string;
  applicantName: string;
  role: 'student' | 'teacher';
  status: 'pending' | 'approved' | 'rejected';
  messages: SentMessage[];
  decidedByName?: string;
}

/**
 * Notify the given admins of a pending join request with Approve/Reject buttons.
 * Only admins who linked Telegram receive a button message; the token doc keeps
 * track of every sent message for later reconciliation.
 */
export async function sendJoinApprovalButtons(args: {
  orgId: string;
  applicantUid: string;
  applicantName: string;
  role: 'student' | 'teacher';
  adminUserIds: string[];
}): Promise<void> {
  if (args.adminUserIds.length === 0) return;

  const userDocs = await Promise.all(
    args.adminUserIds.map((uid) => adminDb.collection('users').doc(uid).get()),
  );
  const chatIds = userDocs
    .filter((d) => d.exists && d.data()?.telegramChatId)
    .map((d) => String(d.data()!.telegramChatId));
  if (chatIds.length === 0) return;

  const token = randomBytes(8).toString('hex'); // 16 chars
  const roleWord = args.role === 'teacher' ? 'преподаватель' : 'ученик';
  const text =
    `📨 <b>Новая заявка на вступление</b>\n\n` +
    `👤 <b>${args.applicantName}</b>\n` +
    `🎭 ${roleWord}\n\n` +
    `Принять в учебный центр?`;
  const reply_markup = {
    inline_keyboard: [[
      { text: '✅ Принять', callback_data: `apv:${token}:a` },
      { text: '❌ Отклонить', callback_data: `apv:${token}:r` },
    ]],
  };

  const sent: SentMessage[] = [];
  await Promise.allSettled(
    chatIds.map(async (chatId) => {
      try {
        const res = await fetch(tgApi('sendMessage'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup }),
        });
        const data: any = await res.json();
        if (data.ok && data.result?.message_id) sent.push({ chatId, messageId: data.result.message_id });
      } catch (e) {
        console.warn('Join-approval send failed:', e);
      }
    }),
  );

  await adminDb.collection('telegramApprovals').doc(token).set({
    orgId: args.orgId,
    applicantUid: args.applicantUid,
    applicantName: args.applicantName,
    role: args.role,
    status: 'pending',
    messages: sent,
    createdAt: now(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

/** Resolve a button presser (by Telegram chat id) to an org admin, or null. */
async function resolveOrgAdmin(orgId: string, chatId: string): Promise<{ uid: string; name: string } | null> {
  const snap = await adminDb.collection('users').where('telegramChatId', '==', String(chatId)).limit(1).get();
  if (snap.empty) return null;
  const uid = snap.docs[0].id;
  const name = snap.docs[0].data()?.displayName || '';
  const memSnap = await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(uid).get();
  if (!memSnap.exists) return null;
  const m = memSnap.data()!;
  if (m.status !== 'active' || !['admin', 'owner', 'manager'].includes(m.role)) return null;
  return { uid, name };
}

async function markApproval(token: string, status: 'approved' | 'rejected', actor: { uid: string; name: string }): Promise<void> {
  await adminDb.collection('telegramApprovals').doc(token).set(
    { status, decidedBy: actor.uid, decidedByName: actor.name, decidedAt: now() },
    { merge: true },
  );
}

export type ApprovalOutcome =
  | { ok: true; result: 'approved' | 'rejected' | 'already'; applicantName: string; applicantUid?: string; orgId?: string }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'limit' | 'handled'; applicantName?: string };

/**
 * Apply an admin's button decision to the membership.
 * `actorChatId` is the Telegram id of whoever pressed the button — it must
 * belong to an active admin/owner/manager of the org.
 */
export async function processApprovalDecision(
  token: string,
  decision: 'approve' | 'reject',
  actorChatId: string,
): Promise<ApprovalOutcome> {
  const apSnap = await adminDb.collection('telegramApprovals').doc(token).get();
  if (!apSnap.exists) return { ok: false, reason: 'not_found' };
  const ap = apSnap.data() as ApprovalRecord;

  // Already decided by another admin (or via the web app earlier).
  if (ap.status !== 'pending') return { ok: false, reason: 'handled', applicantName: ap.applicantName };

  const actor = await resolveOrgAdmin(ap.orgId, actorChatId);
  if (!actor) return { ok: false, reason: 'forbidden' };

  const memUserRef = adminDb.collection('users').doc(ap.applicantUid).collection('memberships').doc(ap.orgId);
  const memOrgRef = adminDb.collection('orgMembers').doc(ap.orgId).collection('members').doc(ap.applicantUid);
  const memSnap = await memUserRef.get();
  if (!memSnap.exists) return { ok: false, reason: 'not_found', applicantName: ap.applicantName };
  const mem = memSnap.data()!;

  // Membership was already resolved elsewhere — reconcile the token and bail.
  if (mem.status !== 'pending') {
    const reconciled = mem.status === 'active' ? 'approved' : 'rejected';
    await markApproval(token, reconciled, actor);
    return { ok: true, result: 'already', applicantName: ap.applicantName };
  }

  const ts = now();

  if (decision === 'reject') {
    const update = { status: 'removed', updatedAt: ts, leftAt: ts };
    await Promise.all([memUserRef.update(update), memOrgRef.update(update)]);
    await markApproval(token, 'rejected', actor);
    return { ok: true, result: 'rejected', applicantName: ap.applicantName };
  }

  // Approve — enforce the plan's active-member limit first.
  const limits = await getOrgLimits(ap.orgId);
  if (ap.role === 'student' && limits.maxStudents !== -1) {
    const activeSnap = await adminDb.collection('orgMembers').doc(ap.orgId).collection('members')
      .where('status', '==', 'active').where('role', '==', 'student').get();
    if (activeSnap.size >= limits.maxStudents) {
      return { ok: false, reason: 'limit', applicantName: ap.applicantName };
    }
  }

  const update = { status: 'active', joinedAt: ts, updatedAt: ts };
  await Promise.all([memUserRef.update(update), memOrgRef.update(update)]);

  // Make sure the applicant has an active-org context.
  const userDoc = await adminDb.collection('users').doc(ap.applicantUid).get();
  if (!userDoc.data()?.activeOrgId) {
    await adminDb.collection('users').doc(ap.applicantUid).update({
      activeOrgId: ap.orgId, organizationId: ap.orgId, role: mem.role, updatedAt: ts,
    }).catch(() => {});
  }

  const field = ap.role === 'student' ? 'studentsCount' : 'teachersCount';
  await adminDb.collection('organizations').doc(ap.orgId).update({ [field]: FieldValue.increment(1) }).catch(() => {});

  await markApproval(token, 'approved', actor);
  return { ok: true, result: 'approved', applicantName: ap.applicantName, applicantUid: ap.applicantUid, orgId: ap.orgId };
}
