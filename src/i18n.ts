import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import ru from './locales/ru.json';
import kg from './locales/kg.json';
import uz from './locales/uz.json';
import { studentTermPostProcessor } from './lib/studentTerm';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .use(studentTermPostProcessor)
  .init({
    resources: { en: { translation: en }, ru: { translation: ru }, kg: { translation: kg }, uz: { translation: uz } },
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
