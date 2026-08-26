/**
 * KPI преподавателей — чистая агрегация и оценка активности.
 *
 * Здесь нет ни Firestore, ни I/O: только математика над уже выбранными
 * событиями. Как и payroll-engine, это даёт юнит-тестам проверять формулу KPI
 * без базы. Выборку и фильтрацию по филиалу/периоду делает api-teacher-activity,
 * а сюда передаёт готовый список событий, ростер преподавателей и их нагрузку.
 */

/**
 * Вес каждого типа действия в очках вовлечённости. Создать экзамен — заметно
 * больше труда, чем поставить одну оценку, поэтому веса разные; счётчики в
 * таблице при этом остаются «сырыми» (сколько раз), взвешивание — только для
 * итогового балла. Один источник правды и для сервера, и (через API) для UI.
 */
export const ACTIVITY_WEIGHTS = {
  grade_set: 1,
  attendance_marked: 1,
  homework_checked: 1.5,
  homework_created: 2,
  lesson_created: 3,
  quiz_created: 3,
  exam_created: 5,
  login: 0.5,
  // Работа с контингентом (кто кого и когда завёл/зачислил). Вес 0 у удаления и
  // отчисления намеренно: это тоже работа и она обязана быть в журнале, но платить
  // за неё очками — значит поощрять чистку списков ради KPI. В счётчиках и ленте
  // такие события видны наравне с остальными.
  student_created: 2,
  student_enrolled: 1,
  student_removed: 0,
  group_created: 3,
  group_deleted: 0,
} as const;

export type ActivityType = keyof typeof ACTIVITY_WEIGHTS;

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_WEIGHTS) as ActivityType[];

export function isKnownActivityType(t: string): t is ActivityType {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_WEIGHTS, t);
}

/**
 * Единица нагрузки, вместе с которой растёт объём действия.
 *
 * Оценки, посещаемость и проверка ДЗ ставятся КАЖДОМУ ученику: у преподавателя
 * со 120 учениками их втрое больше, чем у коллеги с 40, при одинаковом усердии.
 * Уроки, ДЗ, квизы и экзамены создаются на ГРУППУ. Вход в систему не зависит ни
 * от учеников, ни от групп.
 *
 * По этой карте объём делится на свой знаменатель (см. buildKpiRows) — без неё
 * рейтинг был рейтингом размера контингента, а не работы преподавателя.
 */
export type WorkloadUnit = 'student' | 'group' | 'flat';

export const ACTIVITY_SCALE: Record<ActivityType, WorkloadUnit> = {
  grade_set: 'student',
  attendance_marked: 'student',
  homework_checked: 'student',
  homework_created: 'group',
  lesson_created: 'group',
  quiz_created: 'group',
  exam_created: 'group',
  login: 'flat',
  student_created: 'student',
  student_enrolled: 'student',
  student_removed: 'student',
  group_created: 'group',
  group_deleted: 'group',
};

export interface ActivityEvent {
  actorId: string;
  actorName?: string | null;
  type: string;
  count?: number | null;
  dayKey?: string | null;
  createdAt?: string | null;
  branchId?: string | null;
}

export interface RosterTeacher {
  teacherId: string;
  name: string;
}

/** Нагрузка преподавателя: сколько учеников и групп он ведёт (знаменатель KPI). */
export interface TeacherWorkload {
  students: number;
  groups: number;
}

export interface TeacherKpiRow {
  teacherId: string;
  name: string;
  /** Сырые счётчики по каждому типу (сколько раз действие совершено). */
  counts: Record<ActivityType, number>;
  totalActions: number;
  activeDays: number;
  /** Взвешенный объём как есть, без нормировки. */
  engagementPoints: number;
  /** Нагрузка; 0 — групп за преподавателем в базе нет, взята типичная по школе. */
  students: number;
  groups: number;
  /** Очки на единицу нагрузки — то, чем преподаватели сравниваются между собой. */
  intensity: number;
  /** Вовлечённость: интенсивность к эталону когорты, 0..100. */
  engagementPct: number;
  /** Стабильность: активные дни / ожидаемые рабочие дни, 0..100. */
  consistencyPct: number;
  /** Итоговый балл 0..100 (см. buildKpiRows). */
  kpiScore: number;
  lastActivityAt: string | null;
}

export interface KpiTotals {
  teachers: number;
  activeTeachers: number;
  totalActions: number;
  avgActionsPerTeacher: number;
  /** Медианная интенсивность работающих — «типично по школе» для подписей в UI. */
  typicalIntensity: number;
  topTeacherId: string | null;
}

function emptyCounts(): Record<ActivityType, number> {
  const c = {} as Record<ActivityType, number>;
  for (const t of ACTIVITY_TYPES) c[t] = 0;
  return c;
}

const ascending = (a: number, b: number) => a - b;

/** Медиана уже отсортированного по возрастанию списка; пустой — 0. */
function median(sortedAsc: number[]): number {
  if (!sortedAsc.length) return 0;
  const mid = sortedAsc.length >> 1;
  return sortedAsc.length % 2 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

/**
 * Собирает строки KPI из событий, ростера преподавателей и их нагрузки.
 *
 * Балл — половина за стабильность, половина за вовлечённость.
 *
 * Стабильность абсолютна: активные дни / ожидаемые рабочие дни периода
 * (`expectedActiveDays`). Работал почти каждый рабочий день — 100%.
 *
 * Вовлечённость сравнивает УСЕРДИЕ, А НЕ ОБЪЁМ. Сырые очки сначала делятся на
 * нагрузку (оценки и посещаемость — на учеников, созданные материалы — на
 * группы, входы — ни на что): получается интенсивность, «сколько работы на
 * единицу нагрузки». Преподаватель со 120 учениками и коллега с 40, отметившие
 * всех на всех своих занятиях, получают одинаковую интенсивность — ровно этого
 * от KPI и ждут. Без нормировки первое место доставалось самому большому
 * контингенту, а не самому старательному.
 *
 * Эталон интенсивности — вдвое выше типичной (медианной) по школе, но не выше
 * лучшего в команде. Медиана вместо максимума: один энтузиаст с тремя учениками
 * больше не обнуляет вовлечённость всех остальных. Оговорка «не выше лучшего» —
 * чтобы в ровной команде полный балл всё-таки достигался.
 *
 * Нагрузка неизвестна (преподаватель есть, групп за ним в базе нет) — берём
 * типичную по школе: делить на единицу значило бы даром посадить его в лидеры.
 *
 * Ростер добавляется первым и с нулями: преподаватель без активности ОБЯЗАН
 * попасть в таблицу — «ничего не делал» и есть главный сигнал для директора.
 */
export function buildKpiRows(
  events: ActivityEvent[],
  roster: RosterTeacher[],
  opts: { expectedActiveDays: number; workload?: Record<string, TeacherWorkload> },
): { rows: TeacherKpiRow[]; totals: KpiTotals } {
  interface Acc {
    teacherId: string;
    name: string;
    counts: Record<ActivityType, number>;
    days: Set<string>;
    points: Record<WorkloadUnit, number>;
    lastAt: string | null;
  }
  const byTeacher = new Map<string, Acc>();

  const ensure = (id: string, name: string): Acc => {
    let a = byTeacher.get(id);
    if (!a) {
      a = {
        teacherId: id, name: name || id, counts: emptyCounts(), days: new Set(),
        points: { student: 0, group: 0, flat: 0 }, lastAt: null,
      };
      byTeacher.set(id, a);
    } else if ((!a.name || a.name === a.teacherId) && name) {
      a.name = name; // подтягиваем имя, если ростер знал только id
    }
    return a;
  };

  for (const t of roster) ensure(t.teacherId, t.name);

  for (const e of events) {
    if (!e.actorId || !isKnownActivityType(e.type)) continue;
    const a = ensure(e.actorId, e.actorName || '');
    const n = typeof e.count === 'number' && e.count > 0 ? Math.round(e.count) : 1;
    a.counts[e.type] += n;
    a.points[ACTIVITY_SCALE[e.type]] += ACTIVITY_WEIGHTS[e.type] * n;
    const day = e.dayKey || (e.createdAt ? e.createdAt.slice(0, 10) : null);
    if (day) a.days.add(day);
    if (e.createdAt && (!a.lastAt || e.createdAt > a.lastAt)) a.lastAt = e.createdAt;
  }

  const accs = [...byTeacher.values()];
  const loads = new Map<string, TeacherWorkload>(accs.map(a => {
    const w = opts.workload?.[a.teacherId];
    return [a.teacherId, {
      students: Math.max(0, Math.round(w?.students || 0)),
      groups: Math.max(0, Math.round(w?.groups || 0)),
    }];
  }));
  const typicalStudents = median([...loads.values()].map(w => w.students).filter(n => n > 0).sort(ascending));
  const typicalGroups = median([...loads.values()].map(w => w.groups).filter(n => n > 0).sort(ascending));

  const measured = accs.map(a => {
    const workload = loads.get(a.teacherId)!;
    const perStudent = a.points.student / (workload.students > 0 ? workload.students : typicalStudents || 1);
    const perGroup = a.points.group / (workload.groups > 0 ? workload.groups : typicalGroups || 1);
    return { acc: a, workload, intensity: perStudent + perGroup + a.points.flat };
  });

  const working = measured.map(m => m.intensity).filter(v => v > 0).sort(ascending);
  const typicalIntensity = median(working);
  const best = working.length ? working[working.length - 1] : 0;
  const reference = typicalIntensity > 0 ? Math.min(best, typicalIntensity * 2) : best;
  const expected = Math.max(1, opts.expectedActiveDays);

  const rows: TeacherKpiRow[] = measured.map(({ acc: a, workload, intensity }) => {
    const totalActions = ACTIVITY_TYPES.reduce((s, t) => s + a.counts[t], 0);
    const activeDays = a.days.size;
    const consistency = Math.min(1, activeDays / expected);
    const engagement = reference > 0 ? Math.min(1, intensity / reference) : 0;
    const kpiScore = Math.round(100 * (0.5 * consistency + 0.5 * engagement));
    return {
      teacherId: a.teacherId,
      name: a.name,
      counts: a.counts,
      totalActions,
      activeDays,
      engagementPoints: Math.round((a.points.student + a.points.group + a.points.flat) * 10) / 10,
      students: workload.students,
      groups: workload.groups,
      intensity: Math.round(intensity * 10) / 10,
      engagementPct: Math.round(engagement * 100),
      consistencyPct: Math.round(consistency * 100),
      kpiScore,
      lastActivityAt: a.lastAt,
    };
  });

  // Рейтинг: балл, затем интенсивность, затем имя — стабильный детерминированный
  // порядок. Ничья разрывается интенсивностью, а не числом действий: иначе
  // преимущество большого контингента вернулось бы через заднюю дверь.
  rows.sort(
    (x, y) => y.kpiScore - x.kpiScore || y.intensity - x.intensity || x.name.localeCompare(y.name),
  );

  const activeTeachers = rows.filter(r => r.totalActions > 0).length;
  const totalActions = rows.reduce((s, r) => s + r.totalActions, 0);
  const totals: KpiTotals = {
    teachers: rows.length,
    activeTeachers,
    totalActions,
    avgActionsPerTeacher: rows.length ? Math.round(totalActions / rows.length) : 0,
    typicalIntensity: Math.round(typicalIntensity * 10) / 10,
    topTeacherId: rows.length && rows[0].totalActions > 0 ? rows[0].teacherId : null,
  };

  return { rows, totals };
}

/**
 * Рабочие дни в периоде [startIso, endIso], но не дальше «сейчас» (у идущего
 * месяца незачем требовать будущие дни). Воскресенье не считаем — рынок работает
 * по 6-дневке; это оценка «ожидаемых активных дней» для стабильности.
 */
export function countWorkingDays(startIso: string, endIso: string, now: Date = new Date()): number {
  const start = new Date(startIso);
  const rawEnd = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(rawEnd.getTime())) return 1;
  const end = rawEnd.getTime() < now.getTime() ? rawEnd : now;
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  if (last < cur) return 1;
  let days = 0;
  let guard = 0;
  // Потолок ~11 лет: покрывает период «Всё время» (с 2020-го) без искажения
  // знаменателя стабильности и при этом страхует от зацикливания на битой дате.
  while (cur <= last && guard++ < 4200) {
    if (cur.getUTCDay() !== 0) days++; // 0 = воскресенье
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return Math.max(1, days);
}

/**
 * Ключи месяцев 'YYYY-MM', покрывающие диапазon, с запасом ±1 месяц. Запас —
 * потому что событие штампуется днём организации (UTC+6), а границы периода
 * приходят в UTC: у стыка месяцев ключ мог бы разойтись на 6 часов. Точная
 * отсечка всё равно делается по createdAt уже в памяти — запас лишь гарантирует,
 * что нужный месяц-бакет будет выбран.
 */
export function orgMonthsBetween(startIso: string, endIso: string): string[] {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return [];
  const cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - 1, 1));
  const stop = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 1));
  const months: string[] = [];
  let guard = 0;
  while (cur <= stop && guard++ < 240) {
    months.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return months;
}
