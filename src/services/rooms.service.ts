/**
 * Rooms Service — uses backend API for mutations.
 * Firestore rules restrict writes to super_admin for examRooms.
 */
import {
  collection, doc, getDoc, getDocs,
  query, orderBy, where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { apiCreateRoom, apiJoinRoom, apiCloseRoom, apiGetRoomByCode } from '../lib/api';
import type { ExamRoom } from '../types';

const COLLECTION = 'examRooms';

export const createRoom = async (
  examId: string,
  examTitle: string,
  hostId: string,
  hostName: string
): Promise<ExamRoom> => {
  const result = await apiCreateRoom({ examId, examTitle, hostId, hostName });
  return result as ExamRoom;
};

export const getRoomByCode = async (code: string): Promise<ExamRoom | null> => {
  try {
    const result = await apiGetRoomByCode(code.toUpperCase());
    return result as ExamRoom || null;
  } catch {
    return null;
  }
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

export const joinRoom = async (roomId: string, _studentId: string): Promise<void> => {
  await apiJoinRoom(roomId);
};

export const closeRoom = async (roomId: string): Promise<void> => {
  await apiCloseRoom(roomId);
};
