import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc,
  query, orderBy, where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ExamAttempt } from '../types';

const COLLECTION = 'examAttempts';

export const saveAttempt = async (data: Omit<ExamAttempt, 'id'>): Promise<string> => {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
};

export const getAttempt = async (id: string): Promise<ExamAttempt | null> => {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as unknown as ExamAttempt) : null;
};

export const getAttemptsByStudent = async (studentId: string): Promise<ExamAttempt[]> => {
  const q = query(
    collection(db, COLLECTION),
    where('studentId', '==', studentId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as ExamAttempt));
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
  const q = query(
    collection(db, COLLECTION),
    where('roomId', '==', roomId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as ExamAttempt));
};

export const getAllAttempts = async (): Promise<ExamAttempt[]> => {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as ExamAttempt));
};

export const updateAttempt = async (id: string, data: Partial<ExamAttempt>): Promise<void> => {
  await updateDoc(doc(db, COLLECTION, id), data);
};
