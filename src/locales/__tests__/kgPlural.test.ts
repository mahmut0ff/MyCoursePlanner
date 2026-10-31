import { describe, it, expect } from 'vitest';
import i18n from '../../i18n';

describe('kg plurals', () => {
  it('resolves kg plurals with Kyrgyz rules, not the browser locale', async () => {
    await i18n.changeLanguage('kg');
    expect(i18n.t('lessons.list.available', { count: 5 })).toBe('5 жеткиликтүү сабак');
    expect(i18n.t('lessons.list.available', { count: 0 })).toBe('0 жеткиликтүү сабак');
    await i18n.changeLanguage('ru');
    expect(i18n.t('lessons.list.available', { count: 5 })).not.toBe('5 жеткиликтүү сабак');
  });
});
