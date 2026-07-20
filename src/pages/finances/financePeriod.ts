/**
 * Период, за который смотрят финансы.
 *
 * Границы дат считает СЕРВЕР (getPeriodRange в netlify/functions), а клиент
 * передаёт только идентификатор периода. Это сознательно: как только клиент
 * начинает считать «начало квартала» сам, его арифметика неизбежно расходится
 * с серверной, и два экрана показывают разные деньги за один и тот же период.
 * Исключение — 'custom', где границы задаёт пользователь.
 */
export type FinancePeriod =
  | 'current_month'
  | 'last_month'
  | 'quarter'
  | 'half_year'
  | 'year'
  | 'all'
  | 'custom';

export interface FinanceRange {
  period: FinancePeriod;
  /** Только для period === 'custom'. Формат YYYY-MM-DD (как отдаёт <input type="date">). */
  startDate?: string;
  endDate?: string;
}

export const DEFAULT_RANGE: FinanceRange = { period: 'current_month' };

/** Пресеты в порядке возрастания охвата. 'custom' в список не входит — он включается вводом дат. */
export const PERIOD_PRESETS: { id: Exclude<FinancePeriod, 'custom'>; labelKey: string; fallback: string }[] = [
  { id: 'current_month', labelKey: 'finances.periodCurrentMonth', fallback: 'Этот месяц' },
  { id: 'last_month', labelKey: 'finances.periodLastMonth', fallback: 'Прошлый месяц' },
  { id: 'quarter', labelKey: 'finances.periodQuarter', fallback: 'Квартал' },
  { id: 'half_year', labelKey: 'finances.periodHalfYear', fallback: 'Полгода' },
  { id: 'year', labelKey: 'finances.periodYear', fallback: 'Год' },
  { id: 'all', labelKey: 'finances.periodAll', fallback: 'Всё время' },
];

/** Диапазон задан пользователем и заполнен с обеих сторон — только тогда сервер его примет. */
export const isCompleteCustomRange = (r: FinanceRange): boolean =>
  r.period === 'custom' && !!r.startDate && !!r.endDate;

/**
 * Параметры для api-finance-metrics.
 * Сервер принимает startDate/endDate только парой и только тогда игнорирует period.
 */
export const toMetricsParams = (r: FinanceRange): Record<string, string> =>
  isCompleteCustomRange(r)
    ? { period: 'custom', startDate: r.startDate!, endDate: r.endDate! }
    : { period: r.period === 'custom' ? 'current_month' : r.period };

/**
 * Параметры для api-finance-transactions.
 *
 * Формат намеренно совпадает с metrics: голая дата YYYY-MM-DD, а раскрытие её
 * в границы суток — забота сервера. Если клиент начнёт дописывать время сам
 * (скажем, `T23:59:59.999Z`), а сервер трактует ту же дату в своей локальной
 * зоне, два эндпоинта разметят один и тот же выбранный период по-разному —
 * и «Обзор» с «Платежами» разойдутся в цифрах за один и тот же день.
 */
export const toTransactionParams = (r: FinanceRange): Record<string, string> =>
  isCompleteCustomRange(r)
    ? { startDate: r.startDate!, endDate: r.endDate! }
    : { period: r.period === 'custom' ? 'current_month' : r.period };

/** Человекочитаемое имя периода для заголовков и имён CSV-файлов. */
export const periodSlug = (r: FinanceRange): string =>
  isCompleteCustomRange(r) ? `${r.startDate}_${r.endDate}` : r.period;
