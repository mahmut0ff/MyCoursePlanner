/**
 * Time math shared by every schedule surface (week grid, group card, classroom
 * occupancy). Kept in one place because the overlap rule has to be identical
 * everywhere: a slot is busy when two spans strictly intersect, so a lesson that
 * ends at 10:00 and one that starts at 10:00 are neighbours, not a conflict.
 */

/** Fallback length, in minutes, for an event that stores no end time. */
export const DEFAULT_EVENT_MINUTES = 45;

/** "HH:MM" → minutes since midnight, or null when absent/unparseable. */
export function timeToMins(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

/** Minutes since midnight → "HH:MM", clamped to a single day. */
export function minsToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/**
 * Weekday in the app's convention (0=Mon … 6=Sun) from a YYYY-MM-DD string.
 *
 * Parsed field-by-field on purpose: `new Date('2026-08-14')` is UTC midnight, and
 * reading it back with getDay() lands on the previous day in any timezone west of
 * UTC — which silently pointed the conflict check at the wrong weekday.
 */
export function appDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const js = new Date(y, (m || 1) - 1, d || 1).getDay(); // 0=Sun … 6=Sat
  return (js + 6) % 7;
}

export interface TimedSlot {
  startTime?: string | null;
  endTime?: string | null;
  duration?: number | null;
}

/**
 * Resolve an event to `[startMins, endMins)`. An empty end time means
 * "start + duration", the same rule the API applies when it stores the event.
 * Returns null when the start itself is unusable.
 */
export function slotSpan(slot: TimedSlot): [number, number] | null {
  const start = timeToMins(slot.startTime);
  if (start === null) return null;
  const end = timeToMins(slot.endTime) ?? start + (Number(slot.duration) || DEFAULT_EVENT_MINUTES);
  return [start, Math.max(start, end)];
}

/** True when two spans actually overlap. Touching edges do not count. */
export function spansOverlap(a: [number, number], b: [number, number]): boolean {
  return Math.max(a[0], b[0]) < Math.min(a[1], b[1]);
}

/** True when two events collide in time. Unparseable events never collide. */
export function slotsOverlap(a: TimedSlot, b: TimedSlot): boolean {
  const sa = slotSpan(a), sb = slotSpan(b);
  if (!sa || !sb) return false;
  return spansOverlap(sa, sb);
}

/** Строка недельной таблицы: один момент начала для всех семи дней. */
export interface TimeRow {
  /** Начало в минутах от полуночи. null — занятия без разбираемого времени. */
  startMins: number | null;
  /** Конец, если он общий у всех занятий строки; иначе null — врать нельзя. */
  endMins: number | null;
}

/**
 * Общая временная ось для недельной таблицы: одна строка на каждое НАЧАЛО
 * занятия, по возрастанию.
 *
 * Раньше строкой был порядковый номер урока в дне, и соседние колонки стояли на
 * одной строке, ничего общего не имея: 08:00 в понедельник рядом с 15:00 во
 * вторник. Строка-время читается поперёк недели и поперёк таблиц-кабинетов —
 * ради этого ось строится из занятий ВСЕХ показанных кабинетов сразу.
 *
 * Пустых часов ось не заводит: нет занятий в 11:00 — нет и строки. Это не сетка
 * по часам, а перечень реальных звонков.
 */
export function buildTimeRows(slots: TimedSlot[]): TimeRow[] {
  /** start → общий конец, либо null, когда концы разошлись. */
  const ends = new Map<number, number | null>();
  let untimed = false;

  for (const slot of slots) {
    const span = slotSpan(slot);
    if (!span) { untimed = true; continue; }
    const [start, end] = span;
    if (!ends.has(start)) ends.set(start, end);
    else if (ends.get(start) !== end) ends.set(start, null);
  }

  const rows: TimeRow[] = [...ends.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([startMins, endMins]) => ({ startMins, endMins }));

  // Занятие без времени не должно исчезнуть с экрана — ему отводится строка в конце.
  if (untimed) rows.push({ startMins: null, endMins: null });
  return rows;
}

/** Ключ строки для занятия: то же начало, по которому строилась ось. */
export function timeRowKey(slot: TimedSlot): number | null {
  return slotSpan(slot)?.[0] ?? null;
}

/**
 * Gaps left over on a day once `busy` is booked, within [dayStart, dayEnd).
 * Used to answer "when is this classroom free?".
 */
export function freeGaps(
  busy: TimedSlot[],
  dayStartMins: number,
  dayEndMins: number,
  minGapMins = 0,
): Array<[number, number]> {
  const spans = busy
    .map(slotSpan)
    .filter((s): s is [number, number] => s !== null)
    .map(([s, e]) => [Math.max(s, dayStartMins), Math.min(e, dayEndMins)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);

  // Merge overlapping bookings first, otherwise a nested one reopens a gap.
  const merged: Array<[number, number]> = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }

  const gaps: Array<[number, number]> = [];
  let cursor = dayStartMins;
  for (const [s, e] of merged) {
    if (s - cursor >= Math.max(1, minGapMins)) gaps.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (dayEndMins - cursor >= Math.max(1, minGapMins)) gaps.push([cursor, dayEndMins]);
  return gaps;
}
