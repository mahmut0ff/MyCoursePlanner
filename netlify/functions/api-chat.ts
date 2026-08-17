/**
 * API: Chat System
 *
 * GET  ?action=directory                    → кому этот пользователь вправе написать
 * POST ?action=createRoom                   → диалог (дедуп по детерминированному id) или группа
 * POST ?action=updateParticipants           → добавить/убрать участников группы
 * POST ?action=archiveRoom                  → архивировать / вернуть из архива
 * POST ?action=moderateMessage              → мягкое удаление сообщения
 * POST ?action=notifyMessage                → уведомить остальных участников
 *
 * Права: `chat:read` — доступ к переписке вообще, `chat:write` — начинать новые
 * комнаты, `chat:delete` — модерировать чужие сообщения. Своё сообщение автор
 * удаляет и без `chat:delete`.
 *
 * КЛЮЧЕВОЕ: список возможных собеседников считает сервер (resolveDirectory), и
 * он же валидирует любой участник-приходящий-телом. Клиент не вправе назначить
 * себе собеседника, которого справочник ему не показал, — иначе студент DM-ил бы
 * любого студента организации в обход правил, просто подделав uid в запросе.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import type { AuthUser } from './utils/auth';
import {
  verifyAuth, can, hasRole, isSuperAdmin, isRosterManager, memberHoldsRole,
  resolveBranchFilter, memberInBranchScope,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
} from './utils/auth';

const now = () => new Date().toISOString();

/** Роли, которые считаются «сотрудником» в справочнике собеседников. */
const STAFF_ROLES = ['owner', 'admin', 'manager', 'teacher', 'mentor'];

export interface DirectoryEntry {
  uid: string;
  name: string;
  role: string;
  avatarUrl: string;
}

/**
 * Кому этот пользователь вправе написать.
 *
 *  • админ / менеджер / «ведение контингента» — вся активная организация;
 *  • преподаватель — сотрудники + студенты его групп;
 *  • студент — только сотрудники.
 *
 * Филиал сужает выборку так же, как на остальных списках людей: неназначенный
 * участник виден всегда (он общеорганизационный), см. memberInBranchScope.
 */
async function resolveDirectory(
  user: AuthUser,
  orgId: string,
  requestedBranchId?: string | null,
): Promise<Map<string, DirectoryEntry>> {
  const scope = resolveBranchFilter(user, requestedBranchId);
  const out = new Map<string, DirectoryEntry>();
  if (scope === '__DENIED__') return out;

  const snap = await adminDb.collection('orgMembers').doc(orgId)
    .collection('members')
    .where('status', '==', 'active')
    .get();

  const members = snap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((m: any) => m.userId && m.userId !== user.uid)
    .filter((m: any) => memberInBranchScope(m.branchIds, scope));

  const isStaffCaller = hasRole(user, 'super_admin', 'admin', 'manager', 'teacher');
  const seesEveryone = isSuperAdmin(user) || isRosterManager(user);

  let visible = members;
  if (!seesEveryone && !isStaffCaller) {
    // Студент: только сотрудники.
    visible = members.filter((m: any) => memberHoldsRole(m, STAFF_ROLES));
  } else if (!seesEveryone) {
    // Преподаватель: сотрудники + студенты его собственных групп.
    // Запрос по одному равенству — составной индекс не нужен (их тут не деплоят),
    // «свои» группы отбираем в памяти, как это делает api-memberships.
    const groupsSnap = await adminDb.collection('groups')
      .where('organizationId', '==', orgId)
      .get();
    const mine = new Set<string>();
    groupsSnap.docs.forEach((d: any) => {
      const g = d.data();
      const teachers: string[] = g.teacherIds || [];
      if (!teachers.includes(user.uid) && g.createdBy !== user.uid) return;
      (g.studentIds || []).forEach((sid: string) => mine.add(sid));
    });
    visible = members.filter((m: any) => memberHoldsRole(m, STAFF_ROLES) || mine.has(m.userId));
  }

  const uids = [...new Set(visible.map((m: any) => m.userId))];
  const profiles = uids.length ? await getDocsByIds('users', uids) : {};

  for (const m of visible as any[]) {
    if (out.has(m.userId)) continue;
    const p: any = profiles[m.userId] || {};
    out.set(m.userId, {
      uid: m.userId,
      // Ни email, ни телефона: справочник чата — это «кому написать», а не выгрузка
      // контактов организации.
      name: m.userName || p.displayName || m.userEmail || p.email || '—',
      role: m.role || 'student',
      avatarUrl: p.avatarUrl || '',
    });
  }
  return out;
}

/** Имя отправителя берём с сервера — клиентскому значению здесь верить нельзя. */
async function resolveDisplayName(uid: string): Promise<string> {
  try {
    const doc = await adminDb.collection('users').doc(uid).get();
    const d = doc.data() || {};
    return d.displayName || d.email || '';
  } catch {
    return '';
  }
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!user.organizationId) return forbidden();
  if (!can(user, 'chat', 'read')) return forbidden('Чат недоступен для этой роли');

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const orgId = user.organizationId;
  /** Право модерировать чужое: админ организации или явный грант `chat:delete`. */
  const isModerator = isSuperAdmin(user) || hasRole(user, 'admin') || can(user, 'chat', 'delete');

  try {
    // 0. DIRECTORY — кому можно написать
    if (action === 'directory' && event.httpMethod === 'GET') {
      const directory = await resolveDirectory(user, orgId, params.branchId);
      const items = [...directory.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      return ok({ items, canCreateGroup: hasRole(user, 'super_admin', 'admin', 'manager', 'teacher') });
    }

    // 1. CREATE ROOM
    if (action === 'createRoom' && event.httpMethod === 'POST') {
      if (!can(user, 'chat', 'write')) return forbidden('Нет права начинать переписку');

      const body = JSON.parse(event.body || '{}');
      const { type, title, description, imageUrl } = body;
      let participantIds: string[] = Array.isArray(body.participantIds) ? [...body.participantIds] : [];

      if (!type || !['group', 'direct'].includes(type)) return badRequest('Invalid room type');
      if (participantIds.length === 0) return badRequest('participantIds array required');

      // Auto-include creator if not present
      if (!participantIds.includes(user.uid)) {
        participantIds.push(user.uid);
      }
      participantIds = [...new Set(participantIds)];

      // Max participants safeguard
      if (participantIds.length > 500) return badRequest('Max 500 participants allowed per room');

      // Каждый названный участник должен быть в справочнике вызывающего.
      const directory = await resolveDirectory(user, orgId, params.branchId);
      const strangers = participantIds.filter((uid) => uid !== user.uid && !directory.has(uid));
      if (strangers.length) return forbidden('Этим участникам вы не можете писать');

      const nameOf = (uid: string) =>
        uid === user.uid ? (user.displayName || user.email || '') : (directory.get(uid)?.name || '');
      const avatarOf = (uid: string) => (uid === user.uid ? '' : directory.get(uid)?.avatarUrl || '');

      const buildParticipants = (adminUid?: string) => {
        const map: Record<string, any> = {};
        for (const uid of participantIds) {
          map[uid] = {
            role: adminUid && uid === adminUid ? 'admin' : 'member',
            joinedAt: now(),
            lastReadAt: '1970-01-01T00:00:00.000Z',
            isMuted: false,
            isRemoved: false,
            displayName: nameOf(uid),
            avatarUrl: avatarOf(uid),
          };
        }
        return map;
      };

      // Deduplicate Direct Messages deterministically
      if (type === 'direct') {
        if (participantIds.length !== 2) return badRequest('Direct rooms must have exactly 2 participants');

        // Deterministic ID: DM_orgId_uidA_uidB (sorted)
        const sortedUids = [...participantIds].sort();
        const deterministicId = `DM_${orgId}_${sortedUids[0]}_${sortedUids[1]}`;

        const existingDoc = await adminDb.collection('chatRooms').doc(deterministicId).get();
        if (existingDoc.exists) {
          // Un-archive if it was archived
          if (existingDoc.data()?.isArchived) {
            await existingDoc.ref.update({ isArchived: false, updatedAt: now() });
          }
          return ok({ id: deterministicId, ...existingDoc.data(), isArchived: false });
        }

        const roomData = {
          id: deterministicId,
          organizationId: orgId,
          type: 'direct',
          createdBy: user.uid,
          participantIds,
          participants: buildParticipants(),
          lastMessageAt: now(),
          lastMessagePreview: '',
          isArchived: false,
          createdAt: now(),
          updatedAt: now(),
        };

        await adminDb.collection('chatRooms').doc(deterministicId).set(roomData);
        return ok(roomData);
      }

      // Group Room Creation — студент групп не создаёт.
      if (!hasRole(user, 'super_admin', 'admin', 'manager', 'teacher')) {
        return forbidden('Students cannot create group rooms');
      }

      const roomData = {
        organizationId: orgId,
        type: 'group',
        title: title || 'New Group',
        description: description || '',
        imageUrl: imageUrl || '',
        createdBy: user.uid,
        participantIds,
        participants: buildParticipants(user.uid),
        lastMessageAt: now(),
        lastMessagePreview: '',
        isArchived: false,
        createdAt: now(),
        updatedAt: now(),
      };

      const ref = await adminDb.collection('chatRooms').add(roomData);
      await ref.update({ id: ref.id }); // Self-reference ID
      return ok({ id: ref.id, ...roomData });
    }


    // 2. UPDATE PARTICIPANTS
    if (action === 'updateParticipants' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { roomId, addUids, removeUids } = body;
      if (!roomId) return badRequest('roomId required');

      const roomRef = adminDb.collection('chatRooms').doc(roomId);
      const roomDoc = await roomRef.get();
      if (!roomDoc.exists) return notFound();

      const rData = roomDoc.data()!;
      if (rData.organizationId !== orgId) return forbidden();

      // Check caller's permission: Must be org admin or room admin
      const isRoomAdmin = rData.participants[user.uid]?.role === 'admin';

      if (!isRoomAdmin && !isModerator) {
        return forbidden('Only room admins or organization admins can manage participants');
      }

      if (rData.type === 'direct') {
        return badRequest('Cannot modify participants of a direct message room');
      }

      let newParticipantIds = [...rData.participantIds];
      const newParticipantsMap = { ...rData.participants };

      // Add users
      if (Array.isArray(addUids) && addUids.length) {
        // Те же ворота, что и на создании: добавить можно лишь того, кому этот
        // пользователь и сам вправе написать.
        const directory = await resolveDirectory(user, orgId, params.branchId);
        const strangers = addUids.filter((uid: string) => uid !== user.uid && !directory.has(uid));
        if (strangers.length) return forbidden('Этих людей вы не можете добавить');

        for (const uid of addUids) {
          if (!newParticipantIds.includes(uid)) {
            newParticipantIds.push(uid);
            newParticipantsMap[uid] = {
              role: 'member',
              joinedAt: now(),
              lastReadAt: '1970-01-01T00:00:00.000Z',
              isMuted: false,
              isRemoved: false,
              displayName: directory.get(uid)?.name || '',
              avatarUrl: directory.get(uid)?.avatarUrl || '',
            };
          } else if (newParticipantsMap[uid]?.isRemoved) {
            // Re-adding a removed user
            newParticipantsMap[uid].isRemoved = false;
            newParticipantsMap[uid].joinedAt = now();
          }
        }
      }

      // Remove users. Из `participantIds` уходят (комната пропадает из их списка,
      // и правила безопасности перестают пускать их к сообщениям), но запись в
      // `participants` остаётся с isRemoved: true — как след того, что человек тут
      // был, и чтобы его старые сообщения не потеряли автора.
      if (Array.isArray(removeUids)) {
        for (const uid of removeUids) {
          if (newParticipantsMap[uid]) {
            newParticipantsMap[uid].isRemoved = true;
            newParticipantIds = newParticipantIds.filter(id => id !== uid);
          }
        }
      }

      if (newParticipantIds.length > 500) return badRequest('Max 500 participants allowed per room');
      if (newParticipantIds.length === 0) return badRequest('В комнате должен остаться хотя бы один участник');

      await roomRef.update({
        participantIds: newParticipantIds,
        participants: newParticipantsMap,
        updatedAt: now()
      });

      return ok({ success: true, participantIds: newParticipantIds });
    }

    // 3. ARCHIVE ROOM
    if (action === 'archiveRoom' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { roomId, isArchived } = body;
      if (!roomId) return badRequest('roomId required');

      const roomRef = adminDb.collection('chatRooms').doc(roomId);
      const roomDoc = await roomRef.get();
      if (!roomDoc.exists) return notFound();

      const rData = roomDoc.data()!;
      if (rData.organizationId !== orgId) return forbidden();

      const isRoomAdmin = rData.participants[user.uid]?.role === 'admin';
      // В диалоге администратора нет по определению: обе стороны заведены как
      // 'member'. Без этой ветки собственную переписку нельзя было бы убрать из
      // списка вообще — правом на архив владел бы только админ организации.
      const isDirectParticipant = rData.type === 'direct' && rData.participantIds.includes(user.uid);

      if (!isRoomAdmin && !isModerator && !isDirectParticipant) {
        return forbidden('Only room admins or organization admins can archive the room');
      }

      await roomRef.update({
        isArchived: !!isArchived,
        updatedAt: now()
      });

      return ok({ success: true, isArchived: !!isArchived });
    }

    // 4. MODERATE MESSAGE (Admin Hard Delete / Soft Delete via Backend)
    if (action === 'moderateMessage' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { roomId, messageId } = body;
      if (!roomId || !messageId) return badRequest('roomId and messageId required');

      const msgRef = adminDb.collection('chatRooms').doc(roomId).collection('messages').doc(messageId);
      const msgDoc = await msgRef.get();

      if (!msgDoc.exists) return notFound();
      if (msgDoc.data()?.organizationId !== orgId) return forbidden();

      const isSender = msgDoc.data()?.senderId === user.uid;

      if (!isModerator && !isSender) return forbidden('Only org admins or the sender can delete this message');

      // Soft delete
      await msgRef.update({
        deletedAt: now(),
        deletedBy: user.uid,
        updatedAt: now()
      });

      return ok({ success: true });
    }

    // 5. NOTIFY NEW MESSAGE
    //
    // Одно уведомление на пару «получатель + комната», а НЕ на каждое сообщение:
    // id документа детерминирован, поэтому повторная отправка в ту же комнату
    // обновляет ту же запись (и снова поднимает её как непрочитанную), а не плодит
    // по документу на сообщение. В группе на 500 человек прежний вариант писал
    // 500 документов КАЖДЫЙ раз и топил колокольчик.
    if (action === 'notifyMessage' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { roomId, text } = body;
      if (!roomId) return badRequest('roomId required');

      const roomRef = adminDb.collection('chatRooms').doc(roomId);
      const roomDoc = await roomRef.get();
      if (!roomDoc.exists) return notFound();

      const rData = roomDoc.data()!;
      if (rData.organizationId !== orgId) return forbidden();
      if (!rData.participantIds.includes(user.uid)) return forbidden('Not a participant');

      const displayName = user.displayName || (await resolveDisplayName(user.uid)) || 'Пользователь';
      const preview = String(text || '📎 Вложение').slice(0, 80);
      const roomTitle = rData.type === 'group' ? (rData.title || 'Групповой чат') : displayName;

      const batch = adminDb.batch();
      let recipients = 0;

      for (const uid of rData.participantIds) {
        if (uid === user.uid) continue;                       // себе не пишем
        if (rData.participants[uid]?.isRemoved) continue;     // исключённым не пишем
        if (rData.participants[uid]?.isMuted) continue;       // выключил уведомления — уважаем

        const notifRef = adminDb.collection('notifications').doc(`chat_${uid}_${roomId}`);
        batch.set(notifRef, {
          id: `chat_${uid}_${roomId}`,
          recipientId: uid,
          type: 'chat_message',
          title: rData.type === 'group' ? `💬 ${roomTitle}` : `💬 ${displayName}`,
          body: rData.type === 'group' ? `${displayName}: ${preview}` : preview,
          data: { roomId, senderId: user.uid },
          read: false,
          organizationId: orgId,
          createdAt: now(),
        });
        recipients++;
      }

      if (recipients) await batch.commit();
      return ok({ success: true, recipients });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('api-chat error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

export { handler };
