/**
 * KPI преподавателей — чистая агрегация и оценка активности.
 *
 * Здесь нет ни Firestore, ни I/O: только математика над уже выбранными
 * событиями. Как и payroll-engine, это даёт юнит-тестам проверять формулу KPI
 * без базы. Выборку и фильтрацию по филиалу/периоду делает api-teacher-activity,
 * а сюда передаёт готовый список событий и ростер преподавателей.
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
} as const;

export type ActivityType = keyof typeof ACTIVITY_WEIGHTS;

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_WEIGHTS) as ActivityType[];

export function isKnownActivityType(t: string): t is ActivityType {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_WEIGHTS, t);
}

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

export interface TeacherKpiRow {
  teacherId: string;
  name: string;
  /** Сырые счётчики по каждому типу (сколько раз действие совершено). */
  counts: Record<ActivityType, number>;
  totalActions: number;
  activeDays: number;
  engagementPoints: number;
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
  topTeacherId: string | null;
}

function emptyCounts(): Record<ActivityType, number> {
  const c = {} as Record<ActivityType, number>;
  for (const t of ACTIVITY_TYPES) c[t] = 0;
  return c;
}

/**
 * Собирает строки KPI из событий и ростера преподавателей.
 *
 * `expectedActiveDays` — сколько рабочих дней в периоде: тот, кто работал почти
 * каждый рабочий день, получает 100% стабильности. Балл KPI — половина за
 * стабильность (абсолютная: приходил и работал), половина за вовлечённость
 * относительно лидера команды (points / cohortMax). Относительная часть делает
 * из этого рейтинг внутри школы, а не абсолют, привязанный к произвольной цели;
 * обе половины показываются в UI, чтобы балл не был «чёрным ящиком».
 *
 * Ростер добавляется первым и с нулями: преподаватель без активности ОБЯЗАН
 * попасть в таблицу — «ничего не делал» и есть главный сигнал для директора.
 */
export function buildKpiRows(
  events: ActivityEvent[],
  roster: RosterTeacher[],
  opts: { expectedActiveDays: number },
): { rows: TeacherKpiRow[]; totals: KpiTotals } {
  interface Acc {
    teacherId: string;
    name: string;
    counts: Record<ActivityType, number>;
    days: Set<string>;
    points: number;
    lastAt: string | null;
  }
  const byTeacher = new Map<string, Acc>();

  const ensure = (id: string, name: string): Acc => {
    let a = byTeacher.get(id);
    if (!a) {
      a = { teacherId: id, name: name || id, counts: emptyCounts(), days: new Set(), points: 0, lastAt: null };
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
    a.points += ACTIVITY_WEIGHTS[e.type] * n;
    const day = e.dayKey || (e.createdAt ? e.createdAt.slice(0, 10) : null);
    if (day) a.days.add(day);
    if (e.createdAt && (!a.lastAt || e.createdAt > a.lastAt)) a.lastAt = e.createdAt;
  }

  const accs = [...byTeacher.values()];
  const cohortMax = Math.max(1, ...accs.map(a => a.points));
  const expected = Math.max(1, opts.expectedActiveDays);

  const rows: TeacherKpiRow[] = accs.map(a => {
    const totalActions = ACTIVITY_TYPES.reduce((s, t) => s + a.counts[t], 0);
    const activeDays = a.days.size;
    const consistency = Math.min(1, activeDays / expected);
    const engagement = a.points / cohortMax;
    const kpiScore = Math.round(100 * (0.5 * consistency + 0.5 * engagement));
    return {
      teacherId: a.teacherId,
      name: a.name,
      counts: a.counts,
      totalActions,
      activeDays,
      engagementPoints: Math.round(a.points * 10) / 10,
      consistencyPct: Math.round(consistency * 100),
      kpiScore,
      lastActivityAt: a.lastAt,
    };
  });

  // Рейтинг: балл, затем объём, затем имя — стабильный детерминированный порядок.
  rows.sort(
    (x, y) => y.kpiScore - x.kpiScore || y.totalActions - x.totalActions || x.name.localeCompare(y.name),
  );

  const activeTeachers = rows.filter(r => r.totalActions > 0).length;
  const totalActions = rows.reduce((s, r) => s + r.totalActions, 0);
  const totals: KpiTotals = {
    teachers: rows.length,
    activeTeachers,
    totalActions,
    avgActionsPerTeacher: rows.length ? Math.round(totalActions / rows.length) : 0,
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
