/**
 * Lessons Service — uses backend API for all mutations.
 * Reads still use Firestore client for real-time capabilities where needed,
 * but writes MUST go through the backend to respect Firestore rules.
 */
import { apiGetLessons, apiGetLesson, apiCreateLesson, apiUpdateLesson, apiDeleteLesson } from '../lib/api';
import type { LessonPlan } from '../types';

export const getLessonPlans = async (): Promise<LessonPlan[]> => {
  const data = await apiGetLessons();
  return Array.isArray(data) ? data : [];
};

export const getLessonPlan = async (id: string): Promise<LessonPlan | null> => {
  try {
    const data = await apiGetLesson(id);
    return data || null;
  } catch {
    return null;
  }
};

export const createLessonPlan = async (data: Omit<LessonPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const result = await apiCreateLesson(data);
  return result.id;
};

export const updateLessonPlan = async (id: string, data: Partial<LessonPlan>): Promise<void> => {
  await apiUpdateLesson({ id, ...data });
};

export const deleteLessonPlan = async (id: string): Promise<void> => {
  await apiDeleteLesson(id);
};
