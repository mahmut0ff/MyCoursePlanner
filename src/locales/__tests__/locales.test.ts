/**
 * Полнота локализации: каждый ключ ru.json есть в en/kg/uz, а каждый t('ключ', …)
 * из исходников есть в ru.json. Иначе в чужой локали всплывает русский фолбэк.
 * Отчёт по пробелам: `node scripts/i18n-audit.mjs`.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs без типов
import { audit, loadLocale } from '../../../scripts/i18n-audit.mjs';

const { missingInBase, report } = audit();

describe('локали', () => {
  it('все ключи из кода есть в ru.json', () => {
    expect(missingInBase).toEqual([]);
  });

  for (const code of ['en', 'kg', 'uz']) {
    it(`${code}: нет пропущенных ключей и непереведённых русских значений`, () => {
      expect(report[code].missing).toEqual([]);
      expect(report[code].untranslated).toEqual([]);
    });
  }

  it('en и uz не содержат кириллицы', () => {
    for (const code of ['en', 'uz']) {
      const flat = loadLocale(code) as Record<string, unknown>;
      const cyr = Object.entries(flat).filter(([, v]) => /[А-Яа-яЁё]/.test(String(v))).map(([k]) => k);
      expect(cyr, code).toEqual([]);
    }
  });
});
