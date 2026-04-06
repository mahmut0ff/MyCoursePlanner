import { 
  collection, doc, getDoc, getDocs, addDoc, updateDoc, 
  deleteDoc, query, where, orderBy, onSnapshot, setDoc, limit 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { StudyRoom, StudyParticipant } from '../types';

export const getStudyRooms = async (): Promise<StudyRoom[]> => {
  const q = query(
    collection(db, 'studyRooms'),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StudyRoom));
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

export const joinStudyRoom = async (roomId: string, participant: Omit<StudyParticipant, 'joinedAt'>): Promise<void> => {
  const pRef = doc(db, `studyRooms/${roomId}/participants`, participant.userId);
  await setDoc(pRef, {
    ...participant,
    joinedAt: new Date().toISOString()
  });

  const roomDoc = await getDoc(doc(db, 'studyRooms', roomId));
  if (roomDoc.exists()) {
    const data = roomDoc.data();
    await updateDoc(doc(db, 'studyRooms', roomId), {
      participantsCount: (data.participantsCount || 0) + 1
    });
  }
};

export const leaveStudyRoom = async (roomId: string, userId: string): Promise<void> => {
  await deleteDoc(doc(db, `studyRooms/${roomId}/participants`, userId));
  
  const roomDoc = await getDoc(doc(db, 'studyRooms', roomId));
  if (roomDoc.exists()) {
    const data = roomDoc.data();
    const newCount = Math.max(0, (data.participantsCount || 0) - 1);
    await updateDoc(doc(db, 'studyRooms', roomId), {
      participantsCount: newCount
    });
  }
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
  } else {
    updates.timerEndsAt = null;
    updates.timerDuration = 0;
  }
  await updateDoc(doc(db, 'studyRooms', roomId), updates);
};
