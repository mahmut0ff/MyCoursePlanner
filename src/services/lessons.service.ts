import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { LessonPlan } from '../types';

const COLLECTION = 'lessonPlans';

export const getLessonPlans = async (): Promise<LessonPlan[]> => {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as LessonPlan));
};

export const getLessonPlan = async (id: string): Promise<LessonPlan | null> => {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as unknown as LessonPlan) : null;
};

export const createLessonPlan = async (data: Omit<LessonPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return ref.id;
};

export const updateLessonPlan = async (id: string, data: Partial<LessonPlan>): Promise<void> => {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
};

export const deleteLessonPlan = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTION, id));
};
