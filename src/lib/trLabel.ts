// Глобальный экземпляр, а не '../i18n' (как в lib/locale.ts): каталоги подписей
// импортирует и сервер, и тесты — импорт не должен инициализировать i18n.
import i18n from 'i18next';

/** Перевод подписи из модульной константы; до инициализации i18n (сервер, тесты) — русский фолбэк. */
export const trLabel = (key: string, fallback: string, params?: Record<string, string | number>): string =>
  (i18n.isInitialized
    ? i18n.t(key, { defaultValue: fallback, ...params })
    : fallback.replace(/\{\{(\w+)\}\}/g, (m, k) => (params && k in params ? String(params[k]) : m)));

/**
 * Превращает строковое поле объекта в геттер, переводящий его при каждом чтении.
 * Так подписи из модульных констант переключаются вместе с языком, а потребители
 * продолжают читать их как обычные строки. Прочерк «—» оставляется как есть.
 */
export function localizeField<T extends object>(obj: T, field: keyof T & string, key: string): void {
  const fallback = obj[field] as unknown;
  if (typeof fallback !== 'string' || fallback === '—') return;
  Object.defineProperty(obj, field, { get: () => trLabel(key, fallback), enumerable: true, configurable: true });
}

/** localizeField для каждого ключа словаря-подписей: `{ paid: 'Оплачено' }` → `${prefix}.paid`. */
export function localizeMap<T extends Record<string, string>>(map: T, prefix: string): T {
  (Object.keys(map) as (keyof T & string)[]).forEach(k => localizeField(map, k, `${prefix}.${k}`));
  return map;
}
