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
 * ── Границы считаются в КАЛЕНДАРЕ ОРГАНИЗАЦИИ (UTC+6), а не в зоне сервера ──
 *
 * Netlify-функция всегда выполняется в UTC, поэтому `new Date(y, m, d)` и
 * `setHours` строили сутки по UTC, тогда как весь остальной финансовый контур
 * живёт в дне организации (orgDayKey в src/lib/payment-plans.ts). Расхождение
 * существовало ровно в окне 18:00–24:00 UTC — это 00:00–06:00 по Бишкеку, шесть
 * часов каждую ночь:
 *   • платёж, датированный сегодняшним по календарю организации днём, оказывался
 *     ПОЗЖЕ правой границы и выпадал разом из «Этого месяца», «Квартала» и
 *     «Года» — и в «Обзоре», и в «Платежах», потому что окно у них общее;
 *   • в ночь на 1-е число «Этот месяц» отдавал ещё ПРЕДЫДУЩИЙ месяц и расходился
 *     с вкладкой «Оплаты за месяц», которая считает месяц через orgDayKey.
 * Директор видел, как деньги пропадают из отчёта и возвращаются к утру.
 *
 * Смещение продублировано намеренно: этот util обязан оставаться без импортов —
 * его подключают «горячие» функции. Появится часовой пояс у организации — обе
 * константы должны стать одним параметром, а не разъехаться.
 */
const ORG_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Календарные компоненты момента ГЛАЗАМИ ОРГАНИЗАЦИИ. */
function orgParts(d: Date): { y: number; m: number; day: number } {
  const shifted = new Date(d.getTime() + ORG_OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/**
 * Момент времени, который в календаре организации выглядит как указанные
 * компоненты. Именно он сравним с полем `date` операции (оно хранится как
 * абсолютный ISO-момент).
 */
function orgInstant(y: number, m: number, day: number, h = 0, mi = 0, s = 0, ms = 0): Date {
  return new Date(Date.UTC(y, m, day, h, mi, s, ms) - ORG_OFFSET_MS);
}

const orgDayStart = (y: number, m: number, day: number) => orgInstant(y, m, day, 0, 0, 0, 0);
const orgDayEnd = (y: number, m: number, day: number) => orgInstant(y, m, day, 23, 59, 59, 999);

/**
 * Значение поля `date` операции, приведённое к сравнимому с границами виду.
 *
 * Почти все писатели кладут полный ISO, но AI-копилот кладёт голую дату
 * 'YYYY-MM-DD' (api-ai-assistant → POST api-finance-transactions без
 * нормализации). Лексикографически такая строка МЕНЬШЕ полного ISO того же дня,
 * поэтому операция, датированная ПЕРВЫМ днём окна, отсекалась левой границей — и
 * «Обзор», и «Платежи» её не показывали. Сравниваем однородное с однородным:
 * голая дата разворачивается в начало того же дня организации.
 */
export function normalizeTxDate(raw: unknown): string {
  const value = String(raw ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [y, m, day] = value.split('-').map(Number);
  return orgDayStart(y, m - 1, day).toISOString();
}

/**
 * Границы именованного периода. Конец всегда «сегодня, конец суток», кроме
 * завершившихся периодов (last_month), у которых конец — их собственный.
 */
export function getPeriodRange(period: string, now: Date = new Date()): { startIso: string; endIso: string } {
  const { y, m, day } = orgParts(now);
  let start: Date;
  let end = orgDayEnd(y, m, day);

  switch (period) {
    case 'last_month': {
      start = orgDayStart(y, m - 1, 1);
      // Day 0 of this month is the last day of the previous one, but it lands at
      // 00:00 local — which excluded every transaction booked on that final day.
      end = orgDayEnd(y, m, 0);
      break;
    }
    case 'quarter': {
      const qMonth = Math.floor(m / 3) * 3;
      start = orgDayStart(y, qMonth, 1);
      break;
    }
    case 'half_year':
      start = orgDayStart(y, m - 6, 1);
      break;
    case 'year':
      start = orgDayStart(y, 0, 1);
      break;
    case 'all':
      start = orgDayStart(2020, 0, 1);
      break;
    case 'current_month':
    default:
      start = orgDayStart(y, m, 1);
      break;
  }

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
  if (isBareDate) {
    // Голая дата — это ДЕНЬ в календаре организации, а не момент по UTC:
    // пользователь выбрал её в календаре, глядя на своё «сегодня».
    const [y, m, day] = value.split('-').map(Number);
    // Date.UTC молча переполняется ('2026-13-45' превратился бы в февраль 2027),
    // тогда как раньше эту строку отбраковывал сам конструктор Date. Проверяем,
    // что компоненты вернулись теми же, — иначе это не дата, и вызывающий обязан
    // ответить 400, а не считать отчёт по выдуманному дню.
    const probe = new Date(Date.UTC(y, m - 1, day));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== day) {
      return null;
    }
    return edge === 'start' ? orgDayStart(y, m - 1, day) : orgDayEnd(y, m - 1, day);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Полный ISO — конкретный момент; разворачиваем его в те сутки, которые он
  // называет ДЛЯ ОРГАНИЗАЦИИ.
  const p = orgParts(d);
  return edge === 'start' ? orgDayStart(p.y, p.m, p.day) : orgDayEnd(p.y, p.m, p.day);
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
  // Шагаем по календарю ОРГАНИЗАЦИИ — иначе сдвинутое окно съезжало бы на сутки
  // относительно текущего в те же ночные шесть часов.
  const { y, m, day } = orgParts(start);
  switch (period) {
    case 'quarter': return orgDayStart(y, m - 3, day);
    case 'half_year': return orgDayStart(y, m - 6, day);
    case 'year': return orgDayStart(y - 1, m, day);
    case 'last_month':
    case 'current_month':
    default: return orgDayStart(y, m - 1, day);
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

  // shiftStartBack уже возвращает начало дня организации — второй нормализации
  // не нужно, а `setHours` здесь снова увёл бы границу в зону сервера.
  const prevStart = shiftStartBack(period, new Date(startIso));
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
