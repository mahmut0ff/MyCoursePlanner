import { 
  collection, doc, getDoc, getDocs, addDoc, updateDoc, 
  deleteDoc, query, orderBy, onSnapshot, setDoc, limit, getCountFromServer 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { StudyRoom, StudyParticipant, StudyRoomMessage } from '../types';

export const getStudyRooms = async (): Promise<StudyRoom[]> => {
  const q = query(
    collection(db, 'studyRooms'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StudyRoom)).filter(r => r.status === 'active');
};

export const getStudyRoom = async (roomId: string): Promise<StudyRoom | null> => {
  const d = await getDoc(doc(db, 'studyRooms', roomId));
  if (!d.exists()) return null;
  return { id: d.id, ...d.data() } as StudyRoom;
};

export const createStudyRoom = async (data: Partial<StudyRoom>): Promise<string> => {
  const docRef = await addDoc(collection(db, 'studyRooms'), {
    ...data,
    status: 'active',
    participantsCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return docRef.id;
};

const updateParticipantsCount = async (roomId: string) => {
  const coll = collection(db, `studyRooms/${roomId}/participants`);
  const snap = await getCountFromServer(coll);
  const actualCount = snap.data().count;
  
  await updateDoc(doc(db, 'studyRooms', roomId), {
    participantsCount: actualCount
  });
};

export const joinStudyRoom = async (roomId: string, participant: Omit<StudyParticipant, 'joinedAt'>): Promise<void> => {
  const pRef = doc(db, `studyRooms/${roomId}/participants`, participant.userId);

  await setDoc(pRef, {
    ...participant,
    joinedAt: new Date().toISOString()
  });

  await updateParticipantsCount(roomId);
};

export const leaveStudyRoom = async (roomId: string, userId: string): Promise<void> => {
  await deleteDoc(doc(db, `studyRooms/${roomId}/participants`, userId));
  
  await updateParticipantsCount(roomId);
};

export const subscribeToStudyRoom = (roomId: string, callback: (room: StudyRoom | null, participants: StudyParticipant[]) => void) => {
  let room: StudyRoom | null = null;
  let participants: StudyParticipant[] = [];

  const unsubRoom = onSnapshot(doc(db, 'studyRooms', roomId), (docSnap) => {
    if (docSnap.exists()) {
      room = { id: docSnap.id, ...docSnap.data() } as StudyRoom;
      callback(room, participants);
    } else {
      callback(null, []);
    }
  });

  const unsubParticipants = onSnapshot(collection(db, `studyRooms/${roomId}/participants`), (snap) => {
    participants = snap.docs.map(d => d.data() as StudyParticipant);
    if (room) {
      callback(room, participants);
    }
  });

  return () => {
    unsubRoom();
    unsubParticipants();
  };
};

export const updateStudyRoomTimer = async (roomId: string, state: 'focus' | 'break' | 'idle', durationMinutes: number = 0): Promise<void> => {
  const updates: any = {
    timerState: state,
  };
  if (state !== 'idle' && durationMinutes > 0) {
    updates.timerEndsAt = new Date(Date.now() + durationMinutes * 60000).toISOString();
    updates.timerDuration = durationMinutes;
    updates.isTimerPaused = false;
    updates.timerTimeLeft = 0;
  } else {
    updates.timerEndsAt = null;
    updates.timerDuration = 0;
    updates.isTimerPaused = false;
    updates.timerTimeLeft = 0;
  }
  await updateDoc(doc(db, 'studyRooms', roomId), updates);
};

export const updateStudyRoomSettings = async (roomId: string, title: string, youtubeUrl: string): Promise<void> => {
  await updateDoc(doc(db, 'studyRooms', roomId), {
    title,
    youtubeUrl: youtubeUrl || null,
    updatedAt: new Date().toISOString()
  });
};

export const toggleStudyRoomTimerPause = async (roomId: string, room: StudyRoom): Promise<void> => {
  if (room.timerState === 'idle') return;
  
  const updates: any = {};
  if (room.isTimerPaused) {
    // Unpause
    updates.isTimerPaused = false;
    updates.timerEndsAt = new Date(Date.now() + (room.timerTimeLeft || 0)).toISOString();
    updates.timerTimeLeft = 0;
  } else {
    // Pause
    const endsAt = room.timerEndsAt ? new Date(room.timerEndsAt).getTime() : 0;
    const timeLeft = Math.max(0, endsAt - Date.now());
    updates.isTimerPaused = true;
    updates.timerTimeLeft = timeLeft;
    updates.timerEndsAt = null; // when paused, it's not ticking
  }
  await updateDoc(doc(db, 'studyRooms', roomId), updates);
};

export const kickParticipant = async (roomId: string, userId: string): Promise<void> => {
  await leaveStudyRoom(roomId, userId); // we can reuse leave
};

export const sendStudyRoomMessage = async (roomId: string, message: Omit<StudyRoomMessage, 'id' | 'createdAt'>): Promise<void> => {
  await addDoc(collection(db, `studyRooms/${roomId}/messages`), {
    ...message,
    createdAt: new Date().toISOString()
  });
};

export const subscribeToStudyRoomMessages = (roomId: string, callback: (messages: StudyRoomMessage[]) => void) => {
  const q = query(
    collection(db, `studyRooms/${roomId}/messages`),
    orderBy('createdAt', 'asc'),
    limit(50)
  );

  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudyRoomMessage));
    callback(messages);
  });
};
