import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { ChatRoom, ChatMessage, MessageAttachment } from '../types';
import { apiNotifyChatMessage } from './api';

/** Safely extract a numeric timestamp from Firestore Timestamp or ISO string */
function parseTime(v: any): number {
  if (!v) return 0;
  if (v.toDate) return v.toDate().getTime();
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Upload an attachment to Firebase Storage for a specific chat room.
 */
export async function uploadChatAttachment(
  orgId: string, 
  roomId: string, 
  file: File
): Promise<MessageAttachment> {
  const extension = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
  const filePath = `chat/${orgId}/${roomId}/${fileName}`;
  const storageRef = ref(storage, filePath);
  
  await uploadBytes(storageRef, file);
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
 */
export function useChatRooms(organizationId?: string) {
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
      where('organizationId', '==', organizationId),
      where('participantIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, 
      async (snapshot) => {
        let rData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatRoom));
        
        rData.sort((a, b) => parseTime(b.lastMessageAt) - parseTime(a.lastMessageAt));
        rData = rData.filter(room => !room.participants[user.uid]?.isRemoved);

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

        // Fetch missing names + avatars in parallel
        if (uidsToResolve.length > 0) {
          const newNames: Record<string, string> = {};
          const newAvatars: Record<string, string> = {};
          await Promise.all(
            [...new Set(uidsToResolve)].map(async (uid) => {
              try {
                const uDoc = await getDoc(doc(db, 'users', uid));
                const data = uDoc.data();
                newNames[uid] = data?.displayName || data?.email || uid;
                if (data?.avatarUrl) newAvatars[uid] = data.avatarUrl;
              } catch {
                newNames[uid] = uid;
              }
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
  }, [organizationId, auth.currentUser?.uid]);

  return { rooms, loading, error, nameCache, avatarCache };
}

/**
 * Hook to subscribe to messages in a specific room with pagination limit.
 */
export function useChatMessages(roomId?: string, maxLimit = 100) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

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
      limit(maxLimit)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage));
      setMessages(msgs.reverse());
      setLoading(false);
    });

    return () => unsubscribe();
  }, [roomId, maxLimit]);

  return { messages, loading };
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
    apiNotifyChatMessage(roomId, text, senderName).catch(() => {});

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

  return { sendMessage, updateLastRead };
}

/**
 * Derive global unread counts from loaded rooms.
 */
export function useUnreadCount(rooms: ChatRoom[]) {
  const user = auth.currentUser;
  
  const unreadTotal = useMemo(() => {
    if (!user || !rooms) return 0;
    
    return rooms.reduce((acc, room) => {
      const myParticipant = room.participants[user.uid];
      if (!myParticipant) return acc;
      
      const lastMsg = parseTime(room.lastMessageAt);
      const lastRead = parseTime(myParticipant.lastReadAt);
      
      if (lastMsg > 0 && lastMsg > lastRead) {
        return acc + 1;
      }
      return acc;
    }, 0);
  }, [rooms, user]);

  return unreadTotal;
}
