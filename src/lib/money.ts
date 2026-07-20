/**
 * Суффикс валюты для финансовых экранов и ростера. На биллинговых страницах
 * исторически пишется «сом» — там суффикс берётся из i18n-ключей
 * `landing.currency` / `payment.currency`, и трогать их не нужно.
 */
export const CURRENCY_SUFFIX = 'с.';

/**
 * Локаль зафиксирована намеренно. AdminDashboard уже форматирует через
 * 'ru-RU', а вкладки финансов вызывали `.toLocaleString()` без локали — на
 * машине с en-US это давало «12,500» вместо «12 500». Пин делает вывод
 * одинаковым везде и байт-в-байт совпадающим с текущим финансовым UI.
 */
const LOCALE = 'ru-RU';

export const formatMoney = (n?: number | null): string =>
  `${Number(n || 0).toLocaleString(LOCALE)} ${CURRENCY_SUFFIX}`;

/** Для дельт: настоящий минус «−», как в истории платежей. */
export const formatMoneySigned = (n?: number | null): string => {
  const v = Number(n || 0);
  const sign = v < 0 ? '−' : '+';
  return `${sign}${Math.abs(v).toLocaleString(LOCALE)} ${CURRENCY_SUFFIX}`;
};

/** Счётчики (студенты, транзакции) — те же разделители, но без валюты. */
export const formatNumber = (n?: number | null): string => Number(n || 0).toLocaleString(LOCALE);

/**
 * Изменение к прошлому периоду. Когда база нулевая, процент не определён —
 * вызывающий передаёт null/Infinity, и мы рисуем прочерк вместо «+Infinity%».
 */
export const formatPercent = (n?: number | null): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  const rounded = Math.round(n);
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded)}%`;
};
