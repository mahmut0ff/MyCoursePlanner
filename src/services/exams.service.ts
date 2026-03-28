/**
 * Exams Service — uses backend API for all operations.
 * Client-side Firestore reads were blocked by security rules
 * because they lacked the organizationId filter required by hasOrgAccess().
 * Now all reads go through the backend API which properly handles org-scoping.
 */
import { apiGetExams, apiGetExam, apiCreateExam, apiUpdateExam, apiDeleteExam, apiSaveQuestions } from '../lib/api';
import type { Exam, Question } from '../types';

export const getExams = async (): Promise<Exam[]> => {
  const data = await apiGetExams();
  return data as Exam[];
};

export const getExam = async (id: string): Promise<Exam | null> => {
  try {
    const data = await apiGetExam(id);
    return data as Exam;
  } catch {
    return null;
  }
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

// ---- Questions (via backend API) ----

export const getQuestions = async (examId: string): Promise<Question[]> => {
  try {
    const exam = await apiGetExam(examId);
    return (exam as any)?.questions || [];
  } catch {
    return [];
  }
};

export const setQuestion = async (examId: string, question: Question): Promise<void> => {
  await apiSaveQuestions(examId, [question]);
};

export const deleteQuestion = async (examId: string, questionId: string): Promise<void> => {
  const questions = await getQuestions(examId);
  const filtered = questions.filter(q => q.id !== questionId);
  await apiSaveQuestions(examId, filtered);
};

export const saveQuestions = async (examId: string, questions: Question[]): Promise<void> => {
  await apiSaveQuestions(examId, questions);
};
