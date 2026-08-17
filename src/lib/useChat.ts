import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  updateDoc,
  limit
} from 'firebase/firestore';
import { db, auth, storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import type { ChatRoom, ChatMessage, MessageAttachment } from '../types';
import { apiNotifyChatMessage } from './api';

/** Потолок вложения. Должен совпадать со storage.rules (25 МБ на файл чата). */
export const CHAT_MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Категории собеседников — один и тот же разрез и в фильтре списка чатов, и в
 * группировке справочника. Держится здесь, а не в компонентах: две копии этого
 * соответствия неизбежно разъедутся, и «Преподаватели» в фильтре начнут значить
 * не то же самое, что «Преподаватели» в диалоге выбора.
 *
 * Наставник (mentor) идёт к преподавателям, владелец и менеджер — к персоналу:
 * для человека, который ищет, с кем поговорить, разница между владельцем и
 * менеджером не значит ничего, а разница между ними и преподавателем — значит.
 */
export type ChatCategory = 'students' | 'teachers' | 'staff';

export const CHAT_CATEGORIES: ChatCategory[] = ['students', 'teachers', 'staff'];

export function categoryOfRole(role?: string | null): ChatCategory | null {
  if (!role) return null;
  if (role === 'student') return 'students';
  if (role === 'teacher' || role === 'mentor') return 'teachers';
  if (role === 'owner' || role === 'admin' || role === 'manager') return 'staff';
  return null;
}

/**
 * Категория комнаты в списке. У группы собеседник не один, поэтому она своя
 * отдельная категория, а не «персонал» по создателю.
 *
 * Роль собеседника берём сначала из самой комнаты (сервер проставляет `orgRole`
 * при создании), а если её там нет — из справочника: комнаты, заведённые до
 * появления этого поля, иначе выпали бы из всех фильтров разом.
 */
export function chatRoomCategory(
  room: ChatRoom,
  selfUid: string,
  directoryRoles: Record<string, string> = {},
): ChatCategory | 'groups' | null {
  if (room.type === 'group') return 'groups';
  const other = room.participantIds.find((id) => id !== selfUid);
  if (!other) return null;
  return categoryOfRole(room.participants?.[other]?.orgRole || directoryRoles[other]);
}

/** Safely extract a numeric timestamp from Firestore Timestamp or ISO string */
function parseTime(v: any): number {
  if (!v) return 0;
  if (v.toDate) return v.toDate().getTime();
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Upload an attachment to Firebase Storage for a specific chat room.
 * Resumable — иначе у больших файлов не из чего строить прогресс, и композер
 * висит молча.
 */
export async function uploadChatAttachment(
  orgId: string,
  roomId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MessageAttachment> {
  if (file.size > CHAT_MAX_FILE_SIZE) {
    throw new Error('Файл больше 25 МБ');
  }
  const extension = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
  const filePath = `chat/${orgId}/${roomId}/${fileName}`;
  const storageRef = ref(storage, filePath);

  const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      () => resolve(),
    );
  });
  const url = await getDownloadURL(storageRef);

  return {
    id: fileName,
    type: file.type.startsWith('image/') ? 'image' : 'file',
    url,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type
  };
}

/**
 * Hook to subscribe to user's chat rooms within an organization.
 * Also resolves display names for DM participants from /users collection.
 *
 * Запрос — ОДИН `array-contains` по participantIds, без `organizationId`:
 * пара «равенство + array-contains» требует составного индекса, а индексы в этом
 * проекте не деплоятся (скрипты шлют только rules и storage), так что живой чат
 * падал бы с FAILED_PRECONDITION. Организацию и архив отсеиваем в памяти — там же,
 * где уже сортируем: комнат у человека десятки, не тысячи.
 */
export function useChatRooms(organizationId?: string, includeArchived = false) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Cache: uid -> displayName
  const [nameCache, setNameCache] = useState<Record<string, string>>({});
  // Cache: uid -> avatarUrl
  const [avatarCache, setAvatarCache] = useState<Record<string, string>>({});

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !organizationId) {
      setRooms([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'chatRooms'),
      where('participantIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q,
      async (snapshot) => {
        let rData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatRoom));

        rData = rData.filter(room => room.organizationId === organizationId);
        rData = rData.filter(room => !room.participants?.[user.uid]?.isRemoved);
        if (!includeArchived) rData = rData.filter(room => !room.isArchived);
        // У только что заведённой комнаты lastMessageAt пуст (сервер намеренно не
        // выдумывает активность) — тогда её место в списке определяет createdAt,
        // иначе новый диалог проваливался бы в самый низ.
        const rank = (r: ChatRoom) => parseTime(r.lastMessageAt) || parseTime(r.createdAt);
        rData.sort((a, b) => rank(b) - rank(a));

        // Resolve missing displayNames for DM counterparts
        const uidsToResolve: string[] = [];
        for (const room of rData) {
          if (room.type === 'direct') {
            const otherUid = room.participantIds.find(id => id !== user.uid);
            if (otherUid && !room.participants[otherUid]?.displayName && !nameCache[otherUid]) {
              uidsToResolve.push(otherUid);
            }
          }
        }

        // Fetch missing names + avatars (try /users first, then /orgMembers as fallback)
        if (uidsToResolve.length > 0) {
          const newNames: Record<string, string> = {};
          const newAvatars: Record<string, string> = {};
          await Promise.all(
            [...new Set(uidsToResolve)].map(async (uid) => {
              try {
                // Primary: try /users collection
                const uDoc = await getDoc(doc(db, 'users', uid));
                const data = uDoc.data();
                if (data?.displayName) {
                  newNames[uid] = data.displayName;
                  if (data.avatarUrl) newAvatars[uid] = data.avatarUrl;
                  return;
                }
              } catch {
                // Firestore rules may block cross-org user reads
              }

              // Fallback: try /orgMembers/{orgId}/members/{uid}
              if (organizationId) {
                try {
                  const memberDoc = await getDoc(doc(db, 'orgMembers', organizationId, 'members', uid));
                  const mData = memberDoc.data();
                  if (mData?.userName || mData?.userEmail) {
                    newNames[uid] = mData.userName || mData.userEmail;
                    if (mData.avatarUrl) newAvatars[uid] = mData.avatarUrl;
                    return;
                  }
                } catch {}
              }

              // Last resort: use uid slice
              newNames[uid] = uid.slice(0, 8) + '...';
            })
          );
          setNameCache(prev => ({ ...prev, ...newNames }));
          setAvatarCache(prev => ({ ...prev, ...newAvatars }));
        }

        setRooms(rData);
        setLoading(false);
      },
      (err) => {
        console.error('useChatRooms snapshot error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [organizationId, includeArchived, auth.currentUser?.uid]);

  return { rooms, loading, error, nameCache, avatarCache };
}

/**
 * Как показать комнату в списке: имя, аватар и с кем именно идёт разговор.
 * Держится рядом с useChatRooms, потому что «имя комнаты» — это три источника
 * (title группы, denormalised displayName участника, резолв по кэшу), и
 * расползание этой логики по компонентам как раз и рождает разные подписи
 * одной комнаты в списке и в шапке.
 */
export function chatRoomLabel(
  room: ChatRoom,
  selfUid: string,
  nameCache: Record<string, string> = {},
  avatarCache: Record<string, string> = {},
): { title: string; avatarUrl: string; counterpartUid: string | null } {
  if (room.type === 'group') {
    return { title: room.title || 'Групповой чат', avatarUrl: room.imageUrl || '', counterpartUid: null };
  }
  const other = room.participantIds.find((id) => id !== selfUid) || null;
  if (!other) return { title: 'Избранное', avatarUrl: '', counterpartUid: null };
  const p = room.participants?.[other];
  return {
    title: p?.displayName || nameCache[other] || '—',
    avatarUrl: p?.avatarUrl || avatarCache[other] || '',
    counterpartUid: other,
  };
}

/**
 * Hook to subscribe to messages in a specific room with pagination limit.
 * `loadMore` расширяет окно подписки — история грузится вверх по требованию,
 * а не одним запросом на всю комнату.
 */
export function useChatMessages(roomId?: string, pageSize = 60) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowSize, setWindowSize] = useState(pageSize);
  const [reachedStart, setReachedStart] = useState(false);

  // Новая комната — новое окно: иначе открытый ранее длинный диалог заставлял
  // грузить столько же сообщений и у следующего.
  useEffect(() => { setWindowSize(pageSize); setReachedStart(false); }, [roomId, pageSize]);

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'chatRooms', roomId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(windowSize)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
      setMessages(msgs.reverse());
      setReachedStart(snapshot.size < windowSize);
      setLoading(false);
    }, (err) => {
      console.warn('[chat] messages listener error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [roomId, windowSize]);

  const loadMore = useCallback(() => setWindowSize((w) => w + pageSize), [pageSize]);

  return { messages, loading, loadMore, hasMore: !reachedStart };
}

/**
 * Action hook for sending messages via Firestore directly,
 * utilizing client-side IDs for idempotency.
 */
export function useChatActions() {
  const sendMessage = useCallback(async (
    roomId: string,
    organizationId: string,
    text: string,
    attachments?: MessageAttachment[],
    replyTo?: ChatMessage['replyTo']
  ) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Unauthenticated');

    // Get sender display name
    let senderName = user.displayName || user.email || 'User';
    try {
      const uDoc = await getDoc(doc(db, 'users', user.uid));
      senderName = uDoc.data()?.displayName || senderName;
    } catch {}

    const tempId = crypto.randomUUID();
    const msgRef = doc(db, 'chatRooms', roomId, 'messages', tempId);

    const msgData: Record<string, any> = {
      id: tempId,
      roomId,
      organizationId,
      senderId: user.uid,
      senderName,
      messageType: attachments?.length ? (attachments[0].type as any) : 'text',
      text,
      attachments: attachments || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (replyTo) {
      msgData.replyTo = replyTo;
    }

    await setDoc(msgRef, {
      ...msgData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Update room metadata
    try {
      const roomRef = doc(db, 'chatRooms', roomId);
      const preview = text
        ? (text.length > 60 ? text.slice(0, 60) + '…' : text)
        : (attachments?.length ? '📎 Вложение' : '');
      await updateDoc(roomRef, {
        lastMessageAt: serverTimestamp(),
        lastMessagePreview: `${senderName}: ${preview}`,
        updatedAt: serverTimestamp(),
        [`participants.${user.uid}.lastReadAt`]: serverTimestamp(),
      });
    } catch (e) {
      console.warn('Could not update room metadata:', e);
    }

    // Fire-and-forget notification to other participants
    apiNotifyChatMessage(roomId, text).catch(() => {});

    return tempId;
  }, []);

  const updateLastRead = useCallback(async (roomId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    const roomRef = doc(db, 'chatRooms', roomId);
    try {
      await updateDoc(roomRef, {
        [`participants.${user.uid}.lastReadAt`]: serverTimestamp()
      });
    } catch (e) {
      console.warn('Could not update lastReadAt', e);
    }
  }, []);

  const setMuted = useCallback(async (roomId: string, isMuted: boolean) => {
    const user = auth.currentUser;
    if (!user) return;
    const roomRef = doc(db, 'chatRooms', roomId);
    await updateDoc(roomRef, { [`participants.${user.uid}.isMuted`]: isMuted });
  }, []);

  return { sendMessage, updateLastRead, setMuted };
}

/**
 * Непрочитанные: набор id комнат + их количество.
 *
 * Именно КОМНАТ, а не сообщений: точное число непрочитанных сообщений
 * потребовало бы счётчика на сервере при каждой отправке, а «5 диалогов ждут
 * ответа» — ровно то, что нужно бейджу в меню.
 */
export function useUnreadRooms(rooms: ChatRoom[], selfUid?: string): { unreadIds: Set<string>; unreadTotal: number } {
  // uid приходит параметром, а не из auth.currentUser: у вызывающих он и так на
  // руках, а чтение синглтона делало хук незаметно зависимым от глобального
  // состояния — в тестах он молча считал ноль непрочитанных.
  const uid = selfUid;

  return useMemo(() => {
    const unreadIds = new Set<string>();
    if (!uid || !rooms) return { unreadIds, unreadTotal: 0 };

    for (const room of rooms) {
      const me = room.participants?.[uid];
      if (!me) continue;
      // Непрочитанное — это непрочитанное СООБЩЕНИЕ, поэтому его наличие мы
      // требуем явно. Комнаты, заведённые до того, как сервер перестал ставить
      // пустой комнате lastMessageAt, иначе навсегда остались бы с фантомной
      // единицей: времени «последнего сообщения» у них нет, а сообщения нет.
      if (!room.lastMessagePreview) continue;
      const lastMsg = parseTime(room.lastMessageAt);
      const lastRead = parseTime(me.lastReadAt);
      if (lastMsg > 0 && lastMsg > lastRead) unreadIds.add(room.id);
    }
    return { unreadIds, unreadTotal: unreadIds.size };
  }, [rooms, uid]);
}

/**
 * Hook to broadcast typing status. Call `startTyping()` on key presses;
 * it auto-clears after 3s of inactivity using a debounce timer.
 */
export function useTypingIndicator(roomId?: string) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTyping = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !roomId) return;

    const typingRef = doc(db, 'chatRooms', roomId, 'typing', user.uid);
    try {
      await setDoc(typingRef, {
        displayName: user.displayName || user.email || 'User',
        timestamp: serverTimestamp(),
      });
    } catch {}

    // Clear previous timer, set new 3s auto-clear
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(typingRef);
      } catch {}
    }, 3000);
  }, [roomId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const user = auth.currentUser;
      if (user && roomId) {
        const typingRef = doc(db, 'chatRooms', roomId, 'typing', user.uid);
        import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(typingRef).catch(() => {}));
      }
    };
  }, [roomId]);

  return { startTyping };
}

/**
 * Hook to subscribe to who's typing in a room.
 * Returns array of display names currently typing (excludes self).
 */
export function useTypingStatus(roomId?: string): string[] {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!roomId) { setTypingUsers([]); return; }
    const user = auth.currentUser;

    const q = collection(db, 'chatRooms', roomId, 'typing');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const names: string[] = [];
      snapshot.docs.forEach((d) => {
        if (d.id !== user?.uid) {
          // Устаревшая запись (вкладку закрыли, таймер очистки не отработал) не
          // должна вечно показывать «печатает…».
          const ts = parseTime(d.data().timestamp);
          if (ts && Date.now() - ts > 10_000) return;
          names.push(d.data().displayName || 'Someone');
        }
      });
      setTypingUsers(names);
    }, (err) => console.warn('[chat] typing listener error:', err));

    return () => unsubscribe();
  }, [roomId]);

  return typingUsers;
}
