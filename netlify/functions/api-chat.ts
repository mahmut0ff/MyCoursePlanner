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
import { sendTelegramRaw, TELEGRAM_BOT_TOKEN } from './utils/telegram';

const now = () => new Date().toISOString();

/**
 * Телеграм-уведомления о сообщениях чата.
 *
 * Чат — самый частотный источник событий в системе, и пинг на каждое сообщение
 * превратил бы бота в то, что отключают в первый же день. Поэтому два
 * предохранителя, и оба нужны:
 *
 *  • ЧЕЛОВЕК СЕЙЧАС В ЧАТЕ. Если комната прочитана меньше двух минут назад,
 *    он смотрит на неё прямо сейчас — дублировать это в телеграм незачем.
 *  • КУЛДАУН. Об одной комнате пишем не чаще раза в 10 минут: живая переписка
 *    из тридцати реплик должна дать одно уведомление, а не тридцать.
 *
 * Момент последней отправки хранится в самой комнате
 * (participants[uid].lastTelegramAt) — рядом с lastReadAt, с которым он и
 * сравнивается. Писать туда может только сервер: клиентские правила пускают
 * участника лишь в его lastReadAt/isMuted.
 */
const TG_ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const TG_COOLDOWN_MS = 10 * 60 * 1000;

const parseTime = (v: any): number => {
  if (!v) return 0;
  const t = typeof v?.toDate === 'function' ? v.toDate().getTime() : new Date(v).getTime();
  return isNaN(t) ? 0 : t;
};

/** parse_mode: HTML — «<», «>» и «&» в тексте сломали бы разбор и отправку. */
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface TelegramDelivery {
  roomId: string;
  room: Record<string, any>;
  senderUid: string;
  senderName: string;
  preview: string;
  /** Уже отфильтрованные получатели: без автора, исключённых и заглушивших комнату. */
  recipients: string[];
  /** Базовый адрес приложения — из самого запроса, чтобы не хардкодить домен. */
  origin: string;
}

/**
 * Отправляет уведомления и возвращает uid тех, кому реально написали.
 * Никогда не бросает: чат не должен падать из-за недоступного телеграма.
 */
async function deliverTelegram(d: TelegramDelivery): Promise<string[]> {
  const nowMs = Date.now();

  // Сначала отсекаем по данным комнаты — чтобы не читать профили тех, кому
  // мы всё равно не пишем. В группе на 500 человек это разница между 500
  // чтениями на каждое сообщение и единицами.
  const eligible = d.recipients.filter((uid) => {
    const p = d.room.participants?.[uid] || {};
    if (nowMs - parseTime(p.lastReadAt) < TG_ACTIVE_WINDOW_MS) return false;
    if (nowMs - parseTime(p.lastTelegramAt) < TG_COOLDOWN_MS) return false;
    return true;
  });
  if (eligible.length === 0) return [];

  const profiles = await getDocsByIds('users', eligible);
  const isGroup = d.room.type === 'group';
  const roomTitle = isGroup ? (d.room.title || 'Групповой чат') : d.senderName;
  const link = d.origin ? `${d.origin}/chat?room=${encodeURIComponent(d.roomId)}` : '';

  const header = `💬 <b>${escapeHtml(roomTitle)}</b>`;
  const body = isGroup
    ? `<b>${escapeHtml(d.senderName)}:</b> ${escapeHtml(d.preview)}`
    : escapeHtml(d.preview);
  const text = [header, body, link ? `\n<a href="${link}">Открыть чат</a>` : '']
    .filter(Boolean).join('\n');

  const delivered: string[] = [];
  await Promise.allSettled(eligible.map(async (uid) => {
    const profile: any = profiles[uid] || {};
    const chatId = profile.telegramChatId;
    if (!chatId) return;

    // Уважаем и общий выключатель уведомлений, и категорию «Чат».
    const prefs = profile.notificationPreferences || {};
    if (prefs.pushEnabled === false || prefs.chat === false) return;

    const okSent = await sendTelegramRaw(TELEGRAM_BOT_TOKEN, chatId, text);
    if (okSent) delivered.push(uid);
  }));

  return delivered;
}

/** Роли, которые считаются «сотрудником» в справочнике собеседников. */
const STAFF_ROLES = ['owner', 'admin', 'manager', 'teacher', 'mentor'];

/**
 * Роль участника для справочника — по СОЮЗУ ролей, а не по основной.
 *
 * Мультиролевой участник (менеджер + преподаватель) в этой базе обычное дело:
 * страница преподавателей уже чинила ту же ошибку — «matching on the primary
 * `role` alone dropped them». По основной роли такой человек попадал в
 * «Персонал», хотя ведёт занятия, а в комнате оседал неверный orgRole, по
 * которому потом раскладывается список чатов.
 *
 * Преподавание перевешивает администрирование: искать собеседника по «кто мне
 * ведёт» естественнее, чем по строчке в штатном расписании.
 */
function directoryRole(m: { role?: string; roles?: string[] }): string {
  const held = new Set([m.role, ...(Array.isArray(m.roles) ? m.roles : [])].filter(Boolean) as string[]);
  for (const r of ['teacher', 'mentor', 'owner', 'admin', 'manager']) {
    if (held.has(r)) return r;
  }
  return m.role || 'student';
}

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
 * Филиал сужает выборку так же, как список преподавателей в api-org: участник
 * БЕЗ назначенного филиала общеорганизационный и виден всегда. Это не мелочь —
 * преподаватели и администрация как раз обычно филиала не несут (работают на
 * все), а студенты несут. Со строгим совпадением справочник под выбранным
 * филиалом схлопывался до одних студентов: написать директору было некому.
 */
async function resolveDirectory(
  user: AuthUser,
  orgId: string,
  requestedBranchId?: string | null,
): Promise<Map<string, DirectoryEntry>> {
  const scope = resolveBranchFilter(user, requestedBranchId);
  const out = new Map<string, DirectoryEntry>();
  if (scope === '__DENIED__') return out;

  // Строку приводим к массиву намеренно: у memberInBranchScope это ровно та
  // форма, где «участник без филиала остаётся виден». Строковая форма означает
  // «этот филиал и только он» и выбрасывает неназначенных.
  const peopleScope = typeof scope === 'string' ? [scope] : scope;

  const snap = await adminDb.collection('orgMembers').doc(orgId)
    .collection('members')
    .where('status', '==', 'active')
    .get();

  const members = snap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((m: any) => m.userId && m.userId !== user.uid)
    .filter((m: any) => memberInBranchScope(m.branchIds, peopleScope));

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
      role: directoryRole(m),
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
      // Роль в организации кладём в комнату, чтобы список чатов раскладывался по
      // категориям (студенты / преподаватели / персонал) без похода за профилем
      // каждого собеседника на каждый рендер.
      const orgRoleOf = (uid: string) => (uid === user.uid ? user.role : directory.get(uid)?.role || '');

      const buildParticipants = (adminUid?: string) => {
        const map: Record<string, any> = {};
        for (const uid of participantIds) {
          map[uid] = {
            role: adminUid && uid === adminUid ? 'admin' : 'member',
            joinedAt: now(),
            // Создателю комнаты нечего в ней «не прочитать»: он только что сам её
            // и завёл. С эпохой у всех подряд свежесозданный пустой диалог тут же
            // считался непрочитанным У САМОГО СОЗДАТЕЛЯ — в меню висела единица,
            // хотя ни одного сообщения не было.
            lastReadAt: uid === user.uid ? now() : '1970-01-01T00:00:00.000Z',
            isMuted: false,
            isRemoved: false,
            displayName: nameOf(uid),
            avatarUrl: avatarOf(uid),
            orgRole: orgRoleOf(uid),
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
          // Пусто, а не now(): в комнате ещё никто ничего не сказал. Время
          // «последнего сообщения» у пустой комнаты — это выдуманная активность,
          // от которой и списку, и счётчику непрочитанного становится дурно.
          // Порядок в списке при этом не страдает: сортировка падает на createdAt.
          lastMessageAt: '',
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
        lastMessageAt: '',          // см. комментарий у диалога выше
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
              orgRole: directory.get(uid)?.role || '',
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
      const targets: string[] = [];

      for (const uid of rData.participantIds) {
        if (uid === user.uid) continue;                       // себе не пишем
        if (rData.participants[uid]?.isRemoved) continue;     // исключённым не пишем
        if (rData.participants[uid]?.isMuted) continue;       // выключил уведомления — уважаем
        targets.push(uid);

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

      // Телеграм — best-effort и всегда после записи в колокольчик: отвалившийся
      // бот не должен ни ронять отправку сообщения, ни съедать уведомление в
      // приложении.
      let telegram: string[] = [];
      try {
        const origin = event.rawUrl
          ? new URL(event.rawUrl).origin
          : (event.headers?.host ? `https://${event.headers.host}` : '');
        telegram = await deliverTelegram({
          roomId, room: rData, senderUid: user.uid, senderName: displayName,
          preview, recipients: targets, origin,
        });
        if (telegram.length) {
          const stamp: Record<string, any> = { updatedAt: now() };
          telegram.forEach((uid) => { stamp[`participants.${uid}.lastTelegramAt`] = now(); });
          await roomRef.update(stamp);
        }
      } catch (e) {
        console.warn('chat telegram notify failed (non-fatal):', e);
      }

      return ok({ success: true, recipients, telegram: telegram.length });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('api-chat error:', err);
    return jsonResponse(500, { error: err.message || 'Internal error' });
  }
};

export { handler };
