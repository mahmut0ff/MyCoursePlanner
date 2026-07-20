/**
 * Границы финансового периода — единственный источник правды для ОБОИХ
 * финансовых эндпоинтов (api-finance-metrics и api-finance-transactions).
 *
 * Раньше даты считал только metrics, а transactions фильтровал по сырым
 * `startDate`/`endDate` строкой. Из-за этого «Обзор» и «Платежи» размечали один
 * и тот же выбранный период по-разному: metrics раскрывал голую дату в границы
 * суток по локальной зоне сервера, transactions сравнивал её лексикографически
 * с полным ISO — и один и тот же день попадал в одну вкладку и выпадал из
 * другой. Клиент (src/pages/finances/financePeriod.ts) шлёт обоим одинаковые
 * параметры, значит и разбирать их должен один код.
 *
 * Зависимостей нет намеренно: util подключается из «горячих» функций.
 */

export const DATE_FORMAT_ERROR = 'Некорректный формат даты. Ожидается YYYY-MM-DD или полная ISO-дата.';
export const DATE_ORDER_ERROR = 'Дата начала не может быть позже даты окончания.';

/**
 * Границы именованного периода. Конец всегда «сегодня, конец суток», кроме
 * завершившихся периодов (last_month), у которых конец — их собственный.
 */
export function getPeriodRange(period: string, now: Date = new Date()): { startIso: string; endIso: string } {
  let start: Date;
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (period) {
    case 'last_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // Day 0 of this month is the last day of the previous one, but it lands at
      // 00:00 local — which excluded every transaction booked on that final day.
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    }
    case 'quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qMonth, 1);
      break;
    }
    case 'half_year':
      start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
      start = new Date(2020, 0, 1);
      break;
    case 'current_month':
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  start.setHours(0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Период ЕЩЁ ИДЁТ, если его правая граница не в прошлом.
 *
 * Это единственное, что отличает «этот месяц» (идёт) от «прошлого месяца»
 * (закрыт), и от этого зависит, с чем корректно сравнивать — см. getPreviousRange.
 */
export function isPeriodInProgress(period: string, endIso: string, now: Date = new Date()): boolean {
  if (period === 'all') return false;
  return new Date(endIso).getTime() >= now.getTime();
}

/**
 * Parse a startDate/endDate query param into a day boundary.
 *
 * Accepts BOTH a bare `YYYY-MM-DD` and a full ISO timestamp: api-finance-
 * transactions GET already took full ISO, so a frontend sharing one date-range
 * state across both endpoints sent full ISO here too — and the old unchecked
 * `new Date(\`${raw}T00:00:00\`)` concatenation produced an invalid date, whose
 * .toISOString() threw RangeError and fell out of the handler as a 500.
 *
 * Returns null on anything unparseable so the caller can answer 400 instead.
 */
export function parseRangeBoundary(raw: string, edge: 'start' | 'end'): Date | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(isBareDate ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return null;
  // Either input form is normalised to the whole day it names.
  if (edge === 'start') d.setHours(0, 0, 0, 0);
  else d.setHours(23, 59, 59, 999);
  return d;
}

export interface RangeParams {
  period?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ResolvedRange {
  /** null — граница открыта, фильтровать по ней не нужно. */
  startIso: string | null;
  endIso: string | null;
  /** Диапазон задан пользователем обеими датами — у него нет «шага назад». */
  isCustomRange: boolean;
}

/**
 * Разбирает параметры окна ОДИНАКОВО для обоих эндпоинтов.
 *
 * Приоритет: пара startDate+endDate ВСЕГДА побеждает `period` — но только пара,
 * чтобы наполовину заполненный date-picker не переопределял окно молча.
 *
 * `defaultPeriod`:
 *  - metrics передаёт 'current_month' — у дашборда всегда есть окно;
 *  - transactions передаёт null — без явных параметров лента НЕ фильтруется по
 *    датам (PaymentHistoryModal и StudentDetailPage тянут всю историю счёта, и
 *    молчаливый дефолт «этот месяц» просто спрятал бы её).
 */
export function resolveRange(
  params: RangeParams,
  defaultPeriod: string | null,
): ResolvedRange | { error: string } {
  if (params.startDate && params.endDate) {
    const from = parseRangeBoundary(params.startDate, 'start');
    const to = parseRangeBoundary(params.endDate, 'end');
    if (!from || !to) return { error: DATE_FORMAT_ERROR };
    if (from.getTime() > to.getTime()) return { error: DATE_ORDER_ERROR };
    return { startIso: from.toISOString(), endIso: to.toISOString(), isCustomRange: true };
  }

  const period = params.period || defaultPeriod;
  if (period) {
    const { startIso, endIso } = getPeriodRange(period);
    return { startIso, endIso, isCustomRange: false };
  }

  // Односторонний фильтр: вторая граница остаётся открытой.
  let startIso: string | null = null;
  let endIso: string | null = null;
  if (params.startDate) {
    const from = parseRangeBoundary(params.startDate, 'start');
    if (!from) return { error: DATE_FORMAT_ERROR };
    startIso = from.toISOString();
  }
  if (params.endDate) {
    const to = parseRangeBoundary(params.endDate, 'end');
    if (!to) return { error: DATE_FORMAT_ERROR };
    endIso = to.toISOString();
  }
  return { startIso, endIso, isCustomRange: false };
}

/**
 * Shift a named period's start back by ONE unit of that period.
 * See getPreviousRange() for why the comparison is built this way.
 */
function shiftStartBack(period: string, start: Date): Date {
  const y = start.getFullYear();
  const m = start.getMonth();
  const d = start.getDate();
  switch (period) {
    case 'quarter': return new Date(y, m - 3, d);
    case 'half_year': return new Date(y, m - 6, d);
    case 'year': return new Date(y - 1, m, d);
    case 'last_month':
    case 'current_month':
    default: return new Date(y, m - 1, d);
  }
}

/**
 * The window that "vs прошлый период" compares against.
 *
 * For a NAMED period this is the same period one unit earlier — but whether it is
 * TRUNCATED depends on whether the current window has finished:
 *
 *  - IN PROGRESS (current_month, quarter, year… — they all end «сегодня»):
 *    truncate the previous unit to the same elapsed length. On 19 July
 *    `current_month` compares 1–19 July against 1–19 June, not 1–30 June. A
 *    director reading "vs прошлый месяц" means like-for-like month-to-date, and
 *    comparing 19 days against 30 would show a fake collapse every month.
 *
 *  - COMPLETED (last_month): compare against the FULL preceding unit. There is
 *    nothing left to elapse, so truncating June to «столько же дней, сколько уже
 *    прошло» is simply wrong — it shrinks the base and inflates every growth
 *    percentage. The previous window runs from its own start up to the instant
 *    before the current one begins.
 *
 * For an explicit custom startDate/endDate range there is no "unit" to step back
 * by, so the immediately preceding same-length window IS the right semantic.
 */
export function getPreviousRange(
  period: string,
  startIso: string,
  endIso: string,
  isCustomRange: boolean,
  now: Date = new Date(),
): { prevStartIso: string; prevEndIso: string } {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const elapsedMs = endMs - startMs;

  if (isCustomRange) {
    return {
      prevStartIso: new Date(startMs - 1 - elapsedMs).toISOString(),
      prevEndIso: new Date(startMs - 1).toISOString(),
    };
  }

  const prevStart = shiftStartBack(period, new Date(startIso));
  prevStart.setHours(0, 0, 0, 0);
  const prevStartMs = prevStart.getTime();

  // Завершившийся период сравнивается с ПОЛНЫМ предыдущим: до мгновения перед
  // началом текущего. Идущий — с тем же прошедшим отрезком; clamp защищает от
  // короткого месяца (февраль против 31-дневного марта), чтобы усечённое окно не
  // перелилось в текущее и не посчиталось дважды.
  const prevEndMs = isPeriodInProgress(period, endIso, now)
    ? Math.min(prevStartMs + elapsedMs, startMs - 1)
    : startMs - 1;

  return {
    prevStartIso: prevStart.toISOString(),
    prevEndIso: new Date(prevEndMs).toISOString(),
  };
}
