import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc,
  query, orderBy, where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ExamRoom, RoomStatus } from '../types';

const COLLECTION = 'examRooms';

const generateCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

export const createRoom = async (
  examId: string,
  examTitle: string,
  hostId: string,
  hostName: string
): Promise<ExamRoom> => {
  const code = generateCode();
  const data = {
    examId,
    examTitle,
    code,
    status: 'active' as RoomStatus,
    hostId,
    hostName,
    participants: [],
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, COLLECTION), data);
  return { id: ref.id, ...data };
};

export const getRoomByCode = async (code: string): Promise<ExamRoom | null> => {
  const q = query(
    collection(db, COLLECTION),
    where('code', '==', code.toUpperCase()),
    where('status', '==', 'active')
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as unknown as ExamRoom;
};

export const getRoom = async (id: string): Promise<ExamRoom | null> => {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as unknown as ExamRoom) : null;
};

export const getActiveRooms = async (): Promise<ExamRoom[]> => {
  const q = query(
    collection(db, COLLECTION),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as ExamRoom));
};

export const getAllRooms = async (): Promise<ExamRoom[]> => {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as ExamRoom));
};

export const joinRoom = async (roomId: string, studentId: string): Promise<void> => {
  const room = await getRoom(roomId);
  if (!room) throw new Error('Room not found');
  if (room.status !== 'active') throw new Error('Room is not active');
  if (!room.participants.includes(studentId)) {
    await updateDoc(doc(db, COLLECTION, roomId), {
      participants: [...room.participants, studentId],
    });
  }
};

export const closeRoom = async (roomId: string): Promise<void> => {
  await updateDoc(doc(db, COLLECTION, roomId), {
    status: 'closed' as RoomStatus,
    closedAt: new Date().toISOString(),
  });
};
