/**
 * Рейтинг студентов: сырые счётчики → проценты и итоговый балл.
 *
 * Модуль намеренно ЧИСТЫЙ и общий для обеих сторон: сервер (api-rating) считает
 * только счётчики по паре «студент × курс» и ничего не решает про формулу, а
 * страница складывает эти счётчики под текущий фильтр и уже здесь превращает их
 * в проценты. Иначе смена фильтра требовала бы похода на сервер, а средние
 * пришлось бы усреднять из процентов — арифметически неверно: у курса с двумя
 * оценками и у курса с двадцатью разный вес.
 *
 * Складывать можно ТОЛЬКО счётчики (`mergeCounts`), поэтому «все курсы» — это
 * сумма сырых чисел, а не среднее средних.
 */

/** Веса итогового балла. Те же 40/60, что показывает журнал в своей колонке рейтинга. */
export const ATTENDANCE_WEIGHT = 0.4;
export const GRADE_WEIGHT = 0.6;

/**
 * Аддитивные счётчики по одной паре «студент × курс» (или их сумме).
 *
 * `scaleMax` — общий максимум шкалы, если ВСЕ учтённые оценки выставлены по
 * одной шкале; `null` — оценок нет либо шкалы разные. Значение «4.6 / 5» честно
 * только в первом случае, во втором показываем процент: после перевода академии
 * с 100-балльной на 5-балльную в истории остаются оценки обеих шкал, и делить
 * старую «87 из 100» на свежую пятёрку — это 1740 %.
 */
export interface RatingCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Сколько оценок попало в средний балл (нечисловые, которые не удалось перевести, не в счёт). */
  gradeCount: number;
  /** Σ value / maxValue × 100 — каждая оценка нормирована СВОЕЙ шкалой. */
  gradePctSum: number;
  /** Σ value — только для показа «4.6 / 5», когда шкала одна. */
  gradeValueSum: number;
  scaleMax: number | null;
  /** Последняя активность (YYYY-MM-DD): отметка в журнале или дата оценки. */
  lastActivity: string | null;
}

export function emptyCounts(): RatingCounts {
  return {
    present: 0, late: 0, absent: 0, excused: 0,
    gradeCount: 0, gradePctSum: 0, gradeValueSum: 0,
    scaleMax: null, lastActivity: null,
  };
}

/**
 * Сумма двух наборов счётчиков.
 *
 * Шкала переживает сложение, только если обе стороны в ней сходятся; сторона без
 * оценок шкалу не портит — иначе один курс без оценок обнулял бы «4.6 / 5» по
 * всем остальным.
 */
export function mergeCounts(a: RatingCounts, b: RatingCounts): RatingCounts {
  const scaleMax =
    a.gradeCount === 0 ? b.scaleMax
      : b.gradeCount === 0 ? a.scaleMax
        : a.scaleMax !== null && a.scaleMax === b.scaleMax ? a.scaleMax
          : null;

  const lastActivity =
    !a.lastActivity ? b.lastActivity
      : !b.lastActivity ? a.lastActivity
        : (a.lastActivity > b.lastActivity ? a.lastActivity : b.lastActivity);

  return {
    present: a.present + b.present,
    late: a.late + b.late,
    absent: a.absent + b.absent,
    excused: a.excused + b.excused,
    gradeCount: a.gradeCount + b.gradeCount,
    gradePctSum: a.gradePctSum + b.gradePctSum,
    gradeValueSum: a.gradeValueSum + b.gradeValueSum,
    scaleMax,
    lastActivity,
  };
}

export function sumCounts(list: RatingCounts[]): RatingCounts {
  return list.reduce(mergeCounts, emptyCounts());
}

/** Готовые к показу величины одного студента в выбранном срезе. */
export interface RatingMetrics {
  /** Отмеченных занятий всего (включая пропуски) — знаменатель посещаемости. */
  lessons: number;
  /** Был на занятии: присутствовал или опоздал. */
  attended: number;
  attendancePct: number;
  hasAttendance: boolean;
  gradeCount: number;
  /** Средняя оценка в процентах от своей шкалы. */
  gradePct: number;
  hasGrades: boolean;
  /** Средний балл в единицах шкалы («4.6»), либо null — когда шкалы разные. */
  avgGrade: number | null;
  scaleMax: number | null;
  /** Итоговый балл 0–100. */
  score: number;
  /** Есть ли вообще на чём строить рейтинг. */
  hasData: boolean;
  lastActivity: string | null;
}

const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
const clamp100 = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Итоговый балл: 40 % посещаемость + 60 % успеваемость.
 *
 * Когда одной из половин ещё нет, балл считается по второй ЦЕЛИКОМ, а не по
 * весу: студенту, которому просто ещё не выставляли оценок, вес 60 % от нуля
 * прижимал бы балл к 40 и ставил бы отличника с идеальной посещаемостью ниже
 * прогульщика с одной оценкой. Ровно та же оговорка действует в журнале.
 */
export function computeMetrics(c: RatingCounts): RatingMetrics {
  const lessons = c.present + c.late + c.absent + c.excused;
  const attended = c.present + c.late;
  const hasAttendance = lessons > 0;
  const hasGrades = c.gradeCount > 0;

  const attendancePct = clamp100(pct(attended, lessons));
  const gradePct = hasGrades ? clamp100(c.gradePctSum / c.gradeCount) : 0;

  const score =
    hasAttendance && hasGrades
      ? attendancePct * ATTENDANCE_WEIGHT + gradePct * GRADE_WEIGHT
      : hasGrades ? gradePct
        : hasAttendance ? attendancePct
          : 0;

  const avgGrade =
    hasGrades && c.scaleMax !== null
      ? Math.round((c.gradeValueSum / c.gradeCount) * 100) / 100
      : null;

  return {
    lessons,
    attended,
    attendancePct: Math.round(attendancePct),
    hasAttendance,
    gradeCount: c.gradeCount,
    gradePct: Math.round(gradePct),
    hasGrades,
    avgGrade,
    scaleMax: c.scaleMax,
    score: Math.round(score),
    hasData: hasAttendance || hasGrades,
    lastActivity: c.lastActivity,
  };
}

/** Цветовая зона показателя — общая для баллов, посещаемости и успеваемости. */
export type RatingTone = 'good' | 'warn' | 'bad';

export function toneOf(value: number): RatingTone {
  if (value >= 80) return 'good';
  if (value >= 50) return 'warn';
  return 'bad';
}
