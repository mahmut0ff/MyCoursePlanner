/**
 * API: Platform Support Desk
 *
 * A support conversation crosses the tenant boundary: on one side a member of
 * some organization, on the other the platform super admin, who belongs to
 * none. That rules out reusing `api-chat` — every action there hard-requires
 * `user.organizationId` and every rule behind it is participant-scoped.
 *
 * One thread per user, doc id === uid (`supportThreads/{uid}`), messages in a
 * subcollection. Reads happen client-side via onSnapshot under firestore.rules;
 * every write lands here so `senderSide`, the denormalised org/role snapshot and
 * the unread counters can't be spoofed from the client.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, adminAuth } from './utils/firebase-admin';
import {
  verifyAuth, isSuperAdmin, getMembershipData,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
} from './utils/auth';
import type { AuthUser } from './utils/auth';

const now = () => new Date().toISOString();

const MAX_TEXT_LENGTH = 4000;
const MAX_ATTACHMENTS = 10;
const PREVIEW_LENGTH = 80;

interface IncomingAttachment {
  id?: string;
  type?: string;
  url?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

/**
 * Attachments arrive as URLs the client already uploaded to Storage. Re-shape
 * them field by field rather than spreading: a spread would let a caller write
 * arbitrary keys into the message doc.
 */
function sanitizeAttachments(raw: unknown): IncomingAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ATTACHMENTS).flatMap((a: any) => {
    if (!a || typeof a.url !== 'string' || !a.url.startsWith('https://')) return [];
    const type = ['image', 'video', 'file'].includes(a.type) ? a.type : 'file';
    return [{
      id: String(a.id || '').slice(0, 200),
      type,
      url: a.url,
      fileName: String(a.fileName || 'file').slice(0, 300),
      fileSize: Number.isFinite(a.fileSize) ? Number(a.fileSize) : 0,
      mimeType: String(a.mimeType || '').slice(0, 200),
    }];
  });
}

function previewFor(text: string, attachments: IncomingAttachment[]): string {
  const trimmed = (text || '').trim();
  if (trimmed) {
    return trimmed.length > PREVIEW_LENGTH ? `${trimmed.slice(0, PREVIEW_LENGTH)}…` : trimmed;
  }
  if (!attachments.length) return '';
  const first = attachments[0];
  if (first.type === 'image') return '🖼 Изображение';
  if (first.type === 'video') return '🎬 Видео';
  return '📎 Вложение';
}

/**
 * Snapshot of who the user is right now, denormalised onto the thread so the
 * admin inbox can render the list without a cross-org read per row. Refreshed
 * on every user-sent message, so a role or org change catches up on its own.
 */
async function buildUserSnapshot(user: AuthUser) {
  let organizationName: string | null = null;
  if (user.organizationId) {
    try {
      const orgDoc = await adminDb.collection('organizations').doc(user.organizationId).get();
      organizationName = orgDoc.data()?.name || null;
    } catch { /* org unreadable — the thread is still usable without the name */ }
  }
  return {
    userId: user.uid,
    userName: user.displayName || user.email || user.uid.slice(0, 8),
    userEmail: user.email || '',
    userRole: user.role,
    organizationId: user.organizationId,
    organizationName,
  };
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const superAdmin = isSuperAdmin(user);

  try {
    // ── SEND MESSAGE ────────────────────────────────────────────────────────
    // The only write both sides share. `threadId` is honoured for the super
    // admin (who answers into someone else's thread) and ignored for everyone
    // else, whose thread is always their own uid.
    if (action === 'send' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const text = String(body.text || '').slice(0, MAX_TEXT_LENGTH).trim();
      const attachments = sanitizeAttachments(body.attachments);

      if (!text && !attachments.length) return badRequest('Message must have text or an attachment');

      const threadId = superAdmin ? String(body.threadId || '') : user.uid;
      if (!threadId) return badRequest('threadId required');

      const side: 'user' | 'support' = superAdmin ? 'support' : 'user';
      const threadRef = adminDb.collection('supportThreads').doc(threadId);
      const threadDoc = await threadRef.get();

      // The super admin can only answer a conversation the user already opened —
      // there is no cold-outreach path, so a missing thread is a bad request
      // rather than something to create on their behalf.
      if (superAdmin && !threadDoc.exists) return notFound();

      // Replies quote a snapshot of the target rather than pointing at it, so
      // deleting the original doesn't blank out the quote in the reply.
      let replyTo: { messageId: string; text: string; senderName: string } | undefined;
      if (body.replyTo?.messageId) {
        const srcRef = threadRef.collection('messages').doc(String(body.replyTo.messageId));
        const srcDoc = await srcRef.get();
        if (srcDoc.exists && !srcDoc.data()?.deletedAt) {
          const src = srcDoc.data()!;
          const srcAtt = Array.isArray(src.attachments) ? src.attachments : [];
          replyTo = {
            messageId: srcDoc.id,
            text: previewFor(src.text || '', srcAtt),
            senderName: src.senderName || '',
          };
        }
      }

      const preview = previewFor(text, attachments);
      const msgRef = threadRef.collection('messages').doc();
      const message: Record<string, any> = {
        id: msgRef.id,
        threadId,
        senderId: user.uid,
        senderName: user.displayName || user.email || 'User',
        senderSide: side,
        text,
        attachments,
        createdAt: now(),
        updatedAt: now(),
      };
      if (replyTo) message.replyTo = replyTo;

      const batch = adminDb.batch();
      batch.set(msgRef, message);

      if (side === 'user') {
        const snapshot = await buildUserSnapshot(user);
        const existing = threadDoc.exists ? threadDoc.data()! : null;
        batch.set(threadRef, {
          id: threadId,
          ...snapshot,
          userAvatarUrl: existing?.userAvatarUrl || '',
          // A user writing into a resolved thread reopens it; an untouched
          // thread stays 'new' so the inbox can surface never-answered ones.
          status: !existing ? 'new' : existing.status === 'closed' ? 'open' : existing.status,
          lastMessageAt: now(),
          lastMessagePreview: preview,
          lastMessageFrom: 'user',
          unreadForSupport: (existing?.unreadForSupport || 0) + 1,
          unreadForUser: 0,
          createdAt: existing?.createdAt || now(),
          updatedAt: now(),
        }, { merge: true });
      } else {
        batch.update(threadRef, {
          status: 'open',
          lastMessageAt: now(),
          lastMessagePreview: preview,
          lastMessageFrom: 'support',
          unreadForSupport: 0,
          unreadForUser: (threadDoc.data()?.unreadForUser || 0) + 1,
          updatedAt: now(),
        });

        // Tell the user out-of-band — they are almost never sitting on the
        // support page when the answer lands.
        const notifRef = adminDb.collection('notifications').doc();
        batch.set(notifRef, {
          id: notifRef.id,
          recipientId: threadId,
          type: 'support_reply',
          title: '🛟 Поддержка ответила',
          body: preview,
          data: { threadId },
          read: false,
          organizationId: threadDoc.data()?.organizationId || null,
          createdAt: now(),
        });
      }

      await batch.commit();
      return ok(message);
    }

    // ── MARK READ ───────────────────────────────────────────────────────────
    // Clears only the caller's own side of the counter.
    if (action === 'markRead' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const threadId = superAdmin ? String(body.threadId || '') : user.uid;
      if (!threadId) return badRequest('threadId required');

      const threadRef = adminDb.collection('supportThreads').doc(threadId);
      if (!(await threadRef.get()).exists) return ok({ success: true });

      await threadRef.update({
        [superAdmin ? 'unreadForSupport' : 'unreadForUser']: 0,
        updatedAt: now(),
      });
      return ok({ success: true });
    }

    // ── DELETE MESSAGE ──────────────────────────────────────────────────────
    // Soft delete: the bubble stays as a tombstone so the conversation doesn't
    // silently reflow around a removed message.
    if (action === 'deleteMessage' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const threadId = superAdmin ? String(body.threadId || '') : user.uid;
      const messageId = String(body.messageId || '');
      if (!threadId || !messageId) return badRequest('threadId and messageId required');

      const msgRef = adminDb.collection('supportThreads').doc(threadId)
        .collection('messages').doc(messageId);
      const msgDoc = await msgRef.get();
      if (!msgDoc.exists) return notFound();

      // Anyone may retract their own message; the super admin moderates any.
      if (!superAdmin && msgDoc.data()?.senderId !== user.uid) {
        return forbidden('Можно удалить только своё сообщение');
      }

      await msgRef.update({ deletedAt: now(), deletedBy: user.uid, updatedAt: now() });
      return ok({ success: true });
    }

    // ── SET STATUS ──────────────────────────────────────────────────────────
    if (action === 'setStatus' && event.httpMethod === 'POST') {
      if (!superAdmin) return forbidden();
      const body = JSON.parse(event.body || '{}');
      const threadId = String(body.threadId || '');
      const status = String(body.status || '');
      if (!threadId) return badRequest('threadId required');
      if (!['new', 'open', 'closed'].includes(status)) return badRequest('Invalid status');

      await adminDb.collection('supportThreads').doc(threadId)
        .update({ status, updatedAt: now() });
      return ok({ success: true, status });
    }

    // ── USER INFO (right-hand panel) ────────────────────────────────────────
    // Super admin only, and necessarily server-side: it reads across orgs, which
    // firestore.rules would refuse for any other caller.
    if (action === 'userInfo' && event.httpMethod === 'GET') {
      if (!superAdmin) return forbidden();
      const userId = params.userId || '';
      if (!userId) return badRequest('userId required');

      const userDoc = await adminDb.collection('users').doc(userId).get();
      if (!userDoc.exists) return notFound();
      const u = userDoc.data()!;

      // Auth record carries last-sign-in and disabled state, which the profile
      // doc doesn't mirror. Absence is not fatal — render what we have.
      let lastSignInAt: string | undefined;
      let disabled: boolean | undefined;
      try {
        const record = await adminAuth.getUser(userId);
        lastSignInAt = record.metadata.lastSignInTime || undefined;
        disabled = record.disabled;
      } catch { /* auth user pruned or unreadable */ }

      const orgId: string | null = u.activeOrgId || u.organizationId || null;
      let organizationName: string | null = null;
      let organizationSlug: string | null = null;
      let planId: string | null = null;
      let institutionType: string | null = null;
      if (orgId) {
        const orgDoc = await adminDb.collection('organizations').doc(orgId).get();
        const o = orgDoc.data();
        organizationName = o?.name || null;
        organizationSlug = o?.slug || null;
        planId = o?.planId || null;
        institutionType = o?.institutionType || null;
      }

      let membershipRole: string | null = null;
      let customRoleName: string | null = null;
      const branchNames: string[] = [];
      if (orgId) {
        const membership = await getMembershipData(userId, orgId);
        membershipRole = membership?.role || null;

        if (membership?.roleId) {
          const roleDoc = await adminDb.collection('organizations').doc(orgId)
            .collection('roles').doc(membership.roleId).get();
          customRoleName = roleDoc.data()?.name || null;
        }

        // Branch ids are meaningless in the panel — resolve to names.
        for (const branchId of (membership?.branchIds || []).slice(0, 20)) {
          const bDoc = await adminDb.collection('branches').doc(branchId).get();
          if (bDoc.exists) branchNames.push(bDoc.data()?.name || branchId);
        }
      }

      const membershipsSnap = await adminDb.collection('users').doc(userId)
        .collection('memberships').get();
      const memberships = await Promise.all(membershipsSnap.docs.map(async (d) => {
        const m = d.data();
        let name = m.organizationName || '';
        if (!name) {
          const oDoc = await adminDb.collection('organizations').doc(d.id).get();
          name = oDoc.data()?.name || d.id;
        }
        return {
          organizationId: d.id,
          organizationName: name,
          role: m.role || '',
          status: m.status || '',
        };
      }));

      return ok({
        uid: userId,
        email: u.email || '',
        displayName: u.displayName || '',
        avatarUrl: u.avatarUrl || '',
        role: u.role || '',
        phone: u.phone || '',
        city: u.city || '',
        createdAt: u.createdAt || '',
        lastSignInAt,
        disabled,
        organizationId: orgId,
        organizationName,
        organizationSlug,
        planId,
        institutionType,
        branchNames,
        membershipRole,
        customRoleName,
        memberships,
      });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('api-support error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

export { handler };
