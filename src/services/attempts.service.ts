/**
 * Attempts Service — uses backend API for mutations.
 * Firestore rules restrict writes to super_admin for examAttempts.
 */
import {
  collection, getDocs,
  query, orderBy, where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { apiSaveAttempt, apiGetAttempt, apiGetAttemptsByStudent, apiGetAttemptsByRoom, apiUpdateAttempt } from '../lib/api';
import type { ExamAttempt } from '../types';

const COLLECTION = 'examAttempts';

export const saveAttempt = async (data: Omit<ExamAttempt, 'id'>): Promise<string> => {
  const result = await apiSaveAttempt(data);
  return result.id;
};

export const getAttempt = async (id: string): Promise<ExamAttempt | null> => {
  try {
    const result = await apiGetAttempt(id);
    return result || null;
  } catch {
    return null;
  }
};

export const getAttemptsByStudent = async (studentId: string): Promise<ExamAttempt[]> => {
  try {
    const data = await apiGetAttemptsByStudent(studentId);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const getAttemptsByExam = async (examId: string): Promise<ExamAttempt[]> => {
  const q = query(
    collection(db, COLLECTION),
    where('examId', '==', examId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as ExamAttempt));
};

export const getAttemptsByRoom = async (roomId: string): Promise<ExamAttempt[]> => {
  try {
    const data = await apiGetAttemptsByRoom(roomId);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const getAllAttempts = async (): Promise<ExamAttempt[]> => {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as ExamAttempt));
};

export const updateAttempt = async (id: string, data: Partial<ExamAttempt>): Promise<void> => {
  await apiUpdateAttempt({ id, ...data });
};
