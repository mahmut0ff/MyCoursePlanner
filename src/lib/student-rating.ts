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
import type { Group } from '../types';

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

// ── Недопуск ──

/**
 * Порог допуска: строго ниже — «недопуск». Один на всё приложение (страница
 * недопуска, метка в рейтинге, экспорт), поэтому живёт здесь, а не хардкодится
 * числом по месту. Меняется в одной точке.
 */
export const NO_ADMISSION_THRESHOLD = 70;

/**
 * Студент в недопуске? — только когда есть на чём судить.
 *
 * Балл 0 без данных (не отмечали посещаемость и не ставили оценок) — это НЕ ноль
 * успеваемости, а её отсутствие; вешать за него метку значит наказать за то, что
 * учителя ещё не заполнили журнал. Поэтому недопуск требует `hasData`: та же
 * оговорка, по которой рейтинг не считает балл без данных (см. computeMetrics).
 */
export function isNotAdmitted(m: RatingMetrics): boolean {
  return m.hasData && m.score < NO_ADMISSION_THRESHOLD;
}

/** На сколько баллов недобор до порога (0, если студент допущен или без данных). */
export function admissionGap(m: RatingMetrics): number {
  return isNotAdmitted(m) ? NO_ADMISSION_THRESHOLD - m.score : 0;
}

/** Что тянет балл вниз — для человекочитаемой причины недопуска. */
export type AdmissionReason = 'attendance' | 'grades' | 'both' | 'none';

/**
 * Почему студент в недопуске: смотрим, какая из половин ниже порога.
 *
 * Половина «не в счёт», если её ещё нет (нет оценок / не отмечали посещаемость):
 * балл тогда держится целиком на второй, и винить отсутствующую половину нельзя —
 * ровно так же, как её не винит сам расчёт балла.
 */
export function admissionReason(m: RatingMetrics): AdmissionReason {
  if (!isNotAdmitted(m)) return 'none';
  const lowAtt = m.hasAttendance && m.attendancePct < NO_ADMISSION_THRESHOLD;
  const lowGrade = m.hasGrades && m.gradePct < NO_ADMISSION_THRESHOLD;
  if (lowAtt && lowGrade) return 'both';
  if (lowAtt) return 'attendance';
  if (lowGrade) return 'grades';
  return 'both';
}

// ── Общие типы среза (сервер api-rating отдаёт то же) ──

/** Студент в выдаче рейтинга. */
export interface RatingStudent {
  uid: string;
  name: string;
  avatarUrl: string;
  branchIds: string[];
}

/** Счётчики одной пары «студент × курс» — плоско, как их отдаёт сервер. */
export interface RatingStat extends RatingCounts {
  studentId: string;
  courseId: string;
}

/** Ответ api-rating: студенты + сырые счётчики, срез собирается на клиенте. */
export interface RatingResponse {
  period: { period: string; startIso: string; endIso: string } | null;
  students: RatingStudent[];
  stats: RatingStat[];
}

/** Одна строка рейтинга: студент + его показатели в текущем срезе. */
export interface RatingRow {
  student: RatingStudent;
  counts: RatingCounts;
  metrics: RatingMetrics;
  /** Курсы, по которым у студента есть данные в срезе — для карточки. */
  byCourse: RatingStat[];
  groupNames: string[];
  branchNames: string[];
  /** Место в рейтинге; null — данных нет, места тоже. */
  rank: number | null;
}

export interface RatingRowsInput {
  students: RatingStudent[];
  stats: RatingStat[];
  groups: Group[];
  /** id филиала → имя, для подписи под именем студента. */
  branchName: Map<string, string>;
  /** Курс среза или null для «все курсы». */
  sliceCourseId: string | null;
  /** Группа среза или null. Задаёт курс однозначно, поэтому важнее курса. */
  activeGroup: Group | null;
}

/**
 * Собирает строки рейтинга из сырого ответа сервера под выбранный срез.
 *
 * Чистая и общая: и таблица рейтинга, и страница недопуска строят строки ровно
 * так же — один срез, одна формула, одно место рейтинга. Складывает СЧЁТЧИКИ
 * (mergeCounts), а не проценты (см. WHY в шапке модуля).
 */
export function buildRatingRows(input: RatingRowsInput): RatingRow[] {
  const { students, stats, groups, branchName, sliceCourseId, activeGroup } = input;

  // Кто числится в курсе по группам — нужен, чтобы студент из группы курса
  // попадал в срез даже без единой отметки (иначе «нет данных» выглядит как
  // «его тут нет»).
  const enrolled = new Map<string, Set<string>>(); // courseId → studentIds
  const groupsOfStudent = new Map<string, Group[]>();
  for (const g of groups) {
    const ids: string[] = Array.isArray(g.studentIds) ? g.studentIds : [];
    if (g.courseId) {
      let set = enrolled.get(g.courseId);
      if (!set) { set = new Set(); enrolled.set(g.courseId, set); }
      ids.forEach(id => set!.add(id));
    }
    ids.forEach(id => {
      const list = groupsOfStudent.get(id);
      if (list) list.push(g); else groupsOfStudent.set(id, [g]);
    });
  }

  const statsOf = new Map<string, RatingStat[]>();
  for (const s of stats) {
    if (sliceCourseId && s.courseId !== sliceCourseId) continue;
    const list = statsOf.get(s.studentId);
    if (list) list.push(s); else statsOf.set(s.studentId, [s]);
  }

  const inSlice = (uid: string): boolean => {
    if (activeGroup) return (activeGroup.studentIds || []).includes(uid);
    if (sliceCourseId) return enrolled.get(sliceCourseId)?.has(uid) || statsOf.has(uid);
    return true;
  };

  const built: RatingRow[] = [];
  for (const student of students) {
    if (!inSlice(student.uid)) continue;
    const byCourse = statsOf.get(student.uid) || [];
    const counts = byCourse.reduce<RatingCounts>((acc, s) => mergeCounts(acc, s), emptyCounts());
    const metrics = computeMetrics(counts);

    const myGroups = (groupsOfStudent.get(student.uid) || [])
      .filter(g => (activeGroup ? g.id === activeGroup.id : (!sliceCourseId || g.courseId === sliceCourseId)));

    built.push({
      student,
      counts,
      metrics,
      byCourse,
      groupNames: myGroups.map(g => g.name).filter(Boolean),
      branchNames: student.branchIds.map(id => branchName.get(id) || '').filter(Boolean),
      rank: null,
    });
  }

  // Место — по итоговому баллу, одинаковый балл делит одно место. Считается ДО
  // поиска и до сортировки по колонкам: «12-й в рейтинге» не должно меняться от
  // того, что список отсортировали по имени или нашли одного.
  const ranked = built.filter(r => r.metrics.hasData).sort((a, b) => b.metrics.score - a.metrics.score);
  let lastScore = Number.NaN;
  let lastRank = 0;
  ranked.forEach((r, i) => {
    if (r.metrics.score !== lastScore) { lastRank = i + 1; lastScore = r.metrics.score; }
    r.rank = lastRank;
  });

  return built;
}
