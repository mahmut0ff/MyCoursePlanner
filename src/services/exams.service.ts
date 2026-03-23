import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, setDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Exam, Question } from '../types';
import { generateId } from '../utils/grading';

const COLLECTION = 'exams';

export const getExams = async (): Promise<Exam[]> => {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Exam));
};

export const getExam = async (id: string): Promise<Exam | null> => {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as unknown as Exam) : null;
};

export const createExam = async (data: Omit<Exam, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return ref.id;
};

export const updateExam = async (id: string, data: Partial<Exam>): Promise<void> => {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
};

export const deleteExam = async (id: string): Promise<void> => {
  // Delete all questions in subcollection first
  const qSnap = await getDocs(collection(db, COLLECTION, id, 'questions'));
  const deletes = qSnap.docs.map(d => deleteDoc(d.ref));
  await Promise.all(deletes);
  await deleteDoc(doc(db, COLLECTION, id));
};

export const duplicateExam = async (id: string): Promise<string> => {
  const exam = await getExam(id);
  if (!exam) throw new Error('Exam not found');
  const questions = await getQuestions(id);

  const { id: _id, createdAt: _c, updatedAt: _u, ...examData } = exam;
  const newId = await createExam({
    ...examData,
    title: `${examData.title} (Copy)`,
    status: 'draft',
  } as any);

  for (const q of questions) {
    const newQ = { ...q, id: generateId() };
    await setDoc(doc(db, COLLECTION, newId, 'questions', newQ.id), newQ);
  }
  return newId;
};

// ---- Questions (subcollection) ----

export const getQuestions = async (examId: string): Promise<Question[]> => {
  const q = query(collection(db, COLLECTION, examId, 'questions'), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Question));
};

export const setQuestion = async (examId: string, question: Question): Promise<void> => {
  await setDoc(doc(db, COLLECTION, examId, 'questions', question.id), question);
};

export const deleteQuestion = async (examId: string, questionId: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTION, examId, 'questions', questionId));
};

export const saveQuestions = async (examId: string, questions: Question[]): Promise<void> => {
  for (const q of questions) {
    await setDoc(doc(db, COLLECTION, examId, 'questions', q.id), q);
  }
  await updateDoc(doc(db, COLLECTION, examId), {
    questionCount: questions.length,
    updatedAt: new Date().toISOString(),
  });
};

