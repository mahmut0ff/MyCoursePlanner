/**
 * Похоже ли на телефон: только цифры, пробелы, «+», скобки и дефисы, 7–15 цифр.
 * Пустое значение допустимо — телефон в формах необязателен. По номеру уходят
 * WhatsApp-напоминания и кнопка «Позвонить», поэтому «abc!!» не сохраняем.
 */
export function isPlausiblePhone(raw?: string | null): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return true;
  if (!/^[\d\s+()-]+$/.test(s)) return false;
  const digits = s.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}
