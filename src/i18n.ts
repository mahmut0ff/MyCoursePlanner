import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ru from './locales/ru.json';
import { studentTermPostProcessor } from './lib/studentTerm';

// ru is bundled: it is the primary market and every language's fallback, so
// sync i18n.t() calls keep working. The other locales (~1 MB) load on demand.
const lazyLocales: Record<string, () => Promise<{ default: object }>> = {
  en: () => import('./locales/en.json'),
  kg: () => import('./locales/kg.json'),
  uz: () => import('./locales/uz.json'),
};

export const i18nReady = i18n
  .use(LanguageDetector)
  .use({
    type: 'backend',
    read(lng: string, _ns: string, cb: (err: unknown, data: object | null) => void) {
      const load = lazyLocales[lng];
      if (!load) { cb(null, {}); return; }
      load().then((m) => cb(null, m.default), (e) => cb(e, null));
    },
  })
  .use(initReactI18next)
  .use(studentTermPostProcessor)
  .init({
    resources: { ru: { translation: ru } },
    partialBundledLanguages: true,
    // «студент»/«ученик» по типу заведения — см. src/lib/studentTerm.ts
    postProcess: ['studentTerm'],
    supportedLngs: ['ru', 'en', 'kg', 'uz'],
    nonExplicitSupportedLngs: true,
    fallbackLng: 'ru',
    interpolation: { escapeValue: false },
    detection: {
      // ?lang=kg — ссылка на лендинг сразу на нужном языке (рассылки, реклама)
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
      // браузеры кыргызоязычных пользователей отдают `ky`, у нас код `kg`
      convertDetectedLanguage: (lng: string) => (lng.toLowerCase().startsWith('ky') ? 'kg' : lng),
    },
  });

// <html lang> следует за интерфейсом: экранные дикторы и переносы иначе читают всё как en.
const syncHtmlLang = (lng: string) => { document.documentElement.lang = lng === 'kg' ? 'ky' : lng; };
syncHtmlLang(i18n.resolvedLanguage || i18n.language || 'ru');
i18n.on('languageChanged', syncHtmlLang);

// `kg` — не BCP-47 (кыргызский — `ky`). Intl.PluralRules('kg') молча берёт локаль
// браузера (на русской системе — few/many), а в kg.json только _one/_other, и
// i18next уходил в русский fallback: «5 студентов» в кыргызском интерфейсе.
const pluralResolver = i18n.services.pluralResolver;
const getPluralRule = pluralResolver.getRule.bind(pluralResolver);
pluralResolver.getRule = (code: string, options?: object) => getPluralRule(code === 'kg' ? 'ky' : code, options);

export default i18n;
