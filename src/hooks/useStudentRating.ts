/**
 * Загрузка рейтинга студентов — общая для страницы рейтинга и страницы недопуска.
 *
 * Обе страницы читают один и тот же ответ api-rating (счётчики по паре «студент ×
 * курс») и собирают срез на клиенте (buildRatingRows). Держать один эффект в двух
 * местах — значит рано или поздно разъехаться на тонкости: филиал штампуется на GET
 * интерцептором, но эффект сам себя не перезапускает, поэтому `activeBranchId`
 * ОБЯЗАН быть в зависимостях (см. memory «Global branch scope») — забыть это в
 * одной из копий как раз и ломает «страница не слышит переключатель».
 */
import { useEffect, useState } from 'react';
import { useBranch } from '../contexts/BranchContext';
import { apiGetStudentRating, orgGetCourses, orgGetGroups } from '../lib/api';
import type { Course, Group } from '../types';
import type { RatingResponse } from '../lib/student-rating';

export const RATING_PERIODS = ['current_month', 'quarter', 'year', 'all'] as const;
export type RatingPeriod = (typeof RATING_PERIODS)[number];

export const RATING_PERIOD_FALLBACK: Record<RatingPeriod, string> = {
  current_month: 'Этот месяц',
  quarter: 'Квартал',
  year: 'Год',
  all: 'Всё время',
};

export interface StudentRatingState {
  data: RatingResponse | null;
  courses: Course[];
  groups: Group[];
  loading: boolean;
  error: string;
  /** Перезапросить тот же период/филиал (кнопка «Повторить»). */
  reload: () => void;
}

const EMPTY: RatingResponse = { period: null, students: [], stats: [] };

export function useStudentRating(period: RatingPeriod): StudentRatingState {
  const { activeBranchId } = useBranch();

  const [data, setData] = useState<RatingResponse | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  // activeBranchId в зависимостях: интерцептор штампует филиал на GET, но эффект
  // сам себя не перезапускает — это первое, что ломается, когда страница «не
  // слышит» переключатель (см. memory «Global branch scope»).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      apiGetStudentRating({ period }),
      orgGetCourses().catch(() => []),
      orgGetGroups().catch(() => []),
    ])
      .then(([rating, cRes, gRes]) => {
        if (!alive) return;
        setData((rating as RatingResponse) || EMPTY);
        setCourses((cRes as Course[]) || []);
        setGroups((gRes as Group[]) || []);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(e?.message || 'Не удалось загрузить рейтинг');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period, activeBranchId, reloadTick]);

  return { data, courses, groups, loading, error, reload: () => setReloadTick(n => n + 1) };
}
