/**
 * Exams Service — uses backend API for mutations, Firestore client for reads.
 * Firestore rules restrict writes to super_admin, so all mutations go through api-exams.
 */
import {
  collection, doc, getDoc, getDocs,
  query, orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { apiCreateExam, apiUpdateExam, apiDeleteExam, apiSaveQuestions } from '../lib/api';
import type { Exam, Question } from '../types';

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
  const result = await apiCreateExam(data);
  return result.id;
};

export const updateExam = async (id: string, data: Partial<Exam>): Promise<void> => {
  await apiUpdateExam({ id, ...data });
};

export const deleteExam = async (id: string): Promise<void> => {
  await apiDeleteExam(id);
};

export const duplicateExam = async (id: string): Promise<string> => {
  const result = await apiCreateExam({ action: 'duplicate', examId: id });
  return result.id;
};

// ---- Questions (subcollection) ----

export const getQuestions = async (examId: string): Promise<Question[]> => {
  const q = query(collection(db, COLLECTION, examId, 'questions'), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Question));
};

export const setQuestion = async (examId: string, question: Question): Promise<void> => {
  await apiSaveQuestions(examId, [question]);
};

export const deleteQuestion = async (examId: string, questionId: string): Promise<void> => {
  // Get current questions, remove the one to delete, save rest
  const questions = await getQuestions(examId);
  const filtered = questions.filter(q => q.id !== questionId);
  await apiSaveQuestions(examId, filtered);
};

export const saveQuestions = async (examId: string, questions: Question[]): Promise<void> => {
  await apiSaveQuestions(examId, questions);
};
