import { ru } from 'date-fns/locale';
import type { Locale } from 'date-fns';

// date-fns ships no Kyrgyz locale, which left "last seen" strings half-Kyrgyz,
// half-Russian (a Kyrgyz template wrapping a Russian relative time). This is a
// minimal Kyrgyz `formatDistance` so relative times read in one language.
// Only formatDistance is overridden; the rest is inherited from `ru` (unused by
// formatDistanceToNow, but keeps a complete, type-valid Locale object).

const FORMAT_DISTANCE: Record<string, string> = {
  lessThanXSeconds: 'бир нече секунд',
  xSeconds: '{{count}} секунд',
  halfAMinute: 'жарым мүнөт',
  lessThanXMinutes: '{{count}} мүнөттөн аз',
  xMinutes: '{{count}} мүнөт',
  aboutXHours: 'болжол менен {{count}} саат',
  xHours: '{{count}} саат',
  xDays: '{{count}} күн',
  aboutXWeeks: 'болжол менен {{count}} апта',
  xWeeks: '{{count}} апта',
  aboutXMonths: 'болжол менен {{count}} ай',
  xMonths: '{{count}} ай',
  aboutXYears: 'болжол менен {{count}} жыл',
  xYears: '{{count}} жыл',
  overXYears: '{{count}} жылдан ашык',
  almostXYears: 'дээрлик {{count}} жыл',
};

const formatDistance: Locale['formatDistance'] = (token, count, options) => {
  const result = (FORMAT_DISTANCE[token] ?? '').replace('{{count}}', String(count));
  if (options?.addSuffix) {
    // comparison > 0 → future ("in X"); otherwise past ("X ago").
    return options.comparison && options.comparison > 0 ? `${result} кийин` : `${result} мурун`;
  }
  return result;
};

export const kyrgyz: Locale = { ...ru, code: 'ky', formatDistance };
