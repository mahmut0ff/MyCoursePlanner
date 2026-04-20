import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  deleteDoc, query, where, orderBy, onSnapshot, setDoc,
  limit, getCountFromServer, writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { LiveSession, LiveParticipant, LiveAnnotation, LiveReaction } from '../types';

// ---- Helpers ----

const generateJoinCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for readability
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// ---- Session CRUD ----

export const createLiveSession = async (
  lessonId: string,
  lessonTitle: string,
  organizationId: string,
  teacherId: string,
  teacherName: string
): Promise<string> => {
  const joinCode = generateJoinCode();
  const now = new Date().toISOString();

  const docRef = await addDoc(collection(db, 'liveSessions'), {
    lessonId,
    lessonTitle,
    organizationId,
    teacherId,
    teacherName,
    status: 'active',
    joinCode,
    currentSlideIndex: 0,
    focusMode: false,
    participantCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Add teacher as first participant
  await setDoc(doc(db, `liveSessions/${docRef.id}/participants`, teacherId), {
    userId: teacherId,
    name: teacherName,
    role: 'teacher',
    isOnline: true,
    joinedAt: now,
    lastActiveAt: now,
  });

  return docRef.id;
};

export const endLiveSession = async (sessionId: string): Promise<void> => {
  await updateDoc(doc(db, 'liveSessions', sessionId), {
    status: 'ended',
    updatedAt: new Date().toISOString(),
  });
};

export const getLiveSession = async (sessionId: string): Promise<LiveSession | null> => {
  const d = await getDoc(doc(db, 'liveSessions', sessionId));
  if (!d.exists()) return null;
  return { id: d.id, ...d.data() } as LiveSession;
};

export const findSessionByCode = async (code: string): Promise<LiveSession | null> => {
  const q = query(
    collection(db, 'liveSessions'),
    where('joinCode', '==', code.toUpperCase()),
    where('status', '==', 'active'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as LiveSession;
};

export const findActiveSessionForLesson = async (lessonId: string): Promise<LiveSession | null> => {
  const q = query(
    collection(db, 'liveSessions'),
    where('lessonId', '==', lessonId),
    where('status', '==', 'active'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as LiveSession;
};

// ---- Participants ----

const updateParticipantCount = async (sessionId: string) => {
  const coll = collection(db, `liveSessions/${sessionId}/participants`);
  const snap = await getCountFromServer(coll);
  await updateDoc(doc(db, 'liveSessions', sessionId), {
    participantCount: snap.data().count,
  });
};

export const joinLiveSession = async (
  sessionId: string,
  userId: string,
  name: string,
  avatarUrl?: string
): Promise<void> => {
  const now = new Date().toISOString();
  await setDoc(doc(db, `liveSessions/${sessionId}/participants`, userId), {
    userId,
    name,
    avatarUrl: avatarUrl || null,
    role: 'student',
    isOnline: true,
    joinedAt: now,
    lastActiveAt: now,
  });
  await updateParticipantCount(sessionId);
};

export const leaveLiveSession = async (sessionId: string, userId: string): Promise<void> => {
  await deleteDoc(doc(db, `liveSessions/${sessionId}/participants`, userId));
  await updateParticipantCount(sessionId);
};

export const kickParticipant = async (sessionId: string, userId: string): Promise<void> => {
  await leaveLiveSession(sessionId, userId);
};

// ---- Real-time Subscriptions ----

export const subscribeToLiveSession = (
  sessionId: string,
  callback: (session: LiveSession | null, participants: LiveParticipant[]) => void
) => {
  let session: LiveSession | null = null;
  let participants: LiveParticipant[] = [];

  const unsubSession = onSnapshot(doc(db, 'liveSessions', sessionId), (docSnap) => {
    if (docSnap.exists()) {
      session = { id: docSnap.id, ...docSnap.data() } as LiveSession;
      callback(session, participants);
    } else {
      callback(null, []);
    }
  });

  const unsubParticipants = onSnapshot(
    collection(db, `liveSessions/${sessionId}/participants`),
    (snap) => {
      participants = snap.docs.map(d => ({ ...d.data() } as LiveParticipant));
      if (session) callback(session, participants);
    }
  );

  return () => {
    unsubSession();
    unsubParticipants();
  };
};

export const subscribeToAnnotations = (
  sessionId: string,
  callback: (annotations: LiveAnnotation[]) => void
) => {
  const q = query(
    collection(db, `liveSessions/${sessionId}/annotations`),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(q, (snap) => {
    const annotations = snap.docs.map(d => ({ id: d.id, ...d.data() } as LiveAnnotation));
    callback(annotations);
  });
};

export const subscribeToReactions = (
  sessionId: string,
  callback: (reactions: LiveReaction[]) => void
) => {
  const q = query(
    collection(db, `liveSessions/${sessionId}/reactions`),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  return onSnapshot(q, (snap) => {
    const reactions = snap.docs.map(d => ({ id: d.id, ...d.data() } as LiveReaction));
    callback(reactions);
  });
};

// ---- Annotations (Drawing / Laser) ----

export const addAnnotation = async (
  sessionId: string,
  annotation: Omit<LiveAnnotation, 'id' | 'createdAt'>
): Promise<string> => {
  const docRef = await addDoc(collection(db, `liveSessions/${sessionId}/annotations`), {
    ...annotation,
    createdAt: new Date().toISOString(),
  });
  return docRef.id;
};

export const clearAnnotations = async (sessionId: string): Promise<void> => {
  const snap = await getDocs(collection(db, `liveSessions/${sessionId}/annotations`));
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
};

// ---- Cursor Updates (Throttled) ----

let cursorTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingCursor: { x: number; y: number } | null = null;

export const updateTeacherCursor = (
  sessionId: string,
  userId: string,
  x: number,
  y: number
): void => {
  pendingCursor = { x, y };

  if (cursorTimeout) return; // already scheduled

  cursorTimeout = setTimeout(async () => {
    if (pendingCursor) {
      try {
        await updateDoc(doc(db, `liveSessions/${sessionId}/participants`, userId), {
          cursorX: pendingCursor.x,
          cursorY: pendingCursor.y,
          lastActiveAt: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Failed to update cursor:', e);
      }
    }
    cursorTimeout = null;
    pendingCursor = null;
  }, 100); // 100ms throttle
};

export const clearCursorThrottle = (): void => {
  if (cursorTimeout) {
    clearTimeout(cursorTimeout);
    cursorTimeout = null;
  }
  pendingCursor = null;
};

// ---- Reactions ----

export const addReaction = async (
  sessionId: string,
  userId: string,
  userName: string,
  type: LiveReaction['type']
): Promise<void> => {
  await addDoc(collection(db, `liveSessions/${sessionId}/reactions`), {
    sessionId,
    userId,
    userName,
    type,
    createdAt: new Date().toISOString(),
  });
};
