import { ru, enUS, uz } from 'date-fns/locale';
import type { Locale } from 'date-fns';
// Глобальный экземпляр, а не '../i18n': импорт хелпера не должен инициализировать i18n
// (в тестах с моком react-i18next это включало детектор языка, и даты уходили в en).
import i18n from 'i18next';
import { kyrgyz } from './dateFnsKyrgyz';

/** Языки интерфейса. Код `kg` исторический (а не ISO `ky`) — он лежит в localStorage и настройках. */
export const UI_LANGUAGES = [
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'kg', label: 'Кыргызча', flag: '🇰🇬' },
  { code: 'uz', label: "O'zbekcha", flag: '🇺🇿' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
] as const;

const INTL: Record<string, string> = { ru: 'ru-RU', en: 'en-GB', kg: 'ky-KG', uz: 'uz-Latn-UZ' };
const DATE_FNS: Record<string, Locale> = { ru, en: enUS, kg: kyrgyz, uz };

const lang = (code?: string) => (code || i18n.language || 'ru').slice(0, 2);

/** BCP-47 тег для toLocaleDateString / Intl.* под текущий язык интерфейса. */
export const intlLocale = (code?: string): string => INTL[lang(code)] || 'ru-RU';

/**
 * Тег для ЧИСЛОВЫХ дат (без названий месяцев). ICU у `ky-KG` даёт «2026-31-10»
 * (y-dd-MM), а в Кыргызстане пишут 31.10.2026 — цифры языконезависимы, берём ru.
 */
export const numericDateLocale = (code?: string): string => (lang(code) === 'kg' ? 'ru-RU' : intlLocale(code));

/** Локаль date-fns под текущий язык интерфейса. */
export const dateFnsLocale = (code?: string): Locale => DATE_FNS[lang(code)] || ru;
