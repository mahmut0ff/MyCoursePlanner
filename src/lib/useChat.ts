import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
  limit
} from 'firebase/firestore';
import { db, auth, storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { ChatRoom, ChatMessage, MessageAttachment } from '../types';

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
 */
export function useChatRooms(organizationId?: string) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !organizationId) {
      setRooms([]);
      setLoading(false);
      return;
    }

    // Query rooms where user is a participant AND it belongs to the current org
    const q = query(
      collection(db, 'chatRooms'),
      where('organizationId', '==', organizationId),
      where('participantIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        let rData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatRoom));
        
        // Filter out archived unless we explicitly want them, or maybe filter in UI.
        // Sort explicitly by lastMessageAt locally since Firestore 
        // requires complex composite index for array-contains + orderBy
        rData.sort((a, b) => {
          const parseTime = (v: any) => {
            if (!v) return 0;
            if (v.toDate) return v.toDate().getTime();
            const d = new Date(v);
            return isNaN(d.getTime()) ? 0 : d.getTime();
          };
          return parseTime(b.lastMessageAt) - parseTime(a.lastMessageAt); // Descending
        });

        // Optional: Filter out rooms if the user is explicitly "isRemoved" 
        // and we want them to hide the room from the list instead of showing history.
        rData = rData.filter(room => !room.participants[user.uid]?.isRemoved);

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

  return { rooms, loading, error };
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
      // Data arrives desc, but we probably want it desc or asc in UI.
      // Usually, UI renders bottom-up. So we reverse it.
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
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
    attachments?: MessageAttachment[]
  ) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Unauthenticated');

    // Idempotent tempId
    const tempId = crypto.randomUUID();
    const msgRef = doc(db, 'chatRooms', roomId, 'messages', tempId);

    const msgData: Partial<ChatMessage> = {
      id: tempId,
      roomId,
      organizationId,
      senderId: user.uid,
      messageType: attachments?.length ? (attachments[0].type as any) : 'text',
      text,
      attachments: attachments || [],
      createdAt: new Date().toISOString(), // Fallback for optimistic UI
      updatedAt: new Date().toISOString(),
    };

    // Write the message
    await setDoc(msgRef, {
      ...msgData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(), 
    });

    // Update room metadata (lastMessageAt/Preview) so the room list stays sorted
    // Wrapped in try/catch: if Firestore rules reject, the message is still sent
    try {
      const roomRef = doc(db, 'chatRooms', roomId);
      const preview = text
        ? (text.length > 60 ? text.slice(0, 60) + '…' : text)
        : (attachments?.length ? '📎 Attachment' : '');
      await updateDoc(roomRef, {
        lastMessageAt: serverTimestamp(),
        lastMessagePreview: preview,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('Could not update room metadata:', e);
    }

    return tempId;
  }, []);

  const updateLastRead = useCallback(async (roomId: string) => {
    const user = auth.currentUser;
    if (!user) return;
    
    // We also need rule permission to update `participants.${user.uid}.lastReadAt`.
    // Let's assume we'll update firestore.rules for this too, avoiding a heavy network call to Netlify for just a read receipt.
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
      
      const lastMsg = room.lastMessageAt ? new Date(room.lastMessageAt).getTime() : 0;
      const lastRead = myParticipant.lastReadAt ? new Date(myParticipant.lastReadAt).getTime() : 0;
      
      // If lastMsg > lastRead, room is unread
      if (lastMsg > lastRead) {
        return acc + 1;
      }
      return acc;
    }, 0);
  }, [rooms, user]);

  return unreadTotal;
}
