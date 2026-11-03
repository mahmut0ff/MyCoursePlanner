import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/* Per-route <head> for the SPA: title, description, canonical and robots.
   Russian copy on purpose: every language shares one URL, and ru is the
   primary market. Anything not listed here is the app behind login → noindex. */

export const SITE_URL = 'https://sabakhub.kg';

const DEFAULT_TITLE = 'SabakHub — CRM для учебного центра: оплаты, журнал, расписание';
const DEFAULT_DESC = 'CRM для учебных центров, языковых школ и курсов в Кыргызстане: оплаты и должники, журнал посещаемости, расписание, зарплата преподавателей и Telegram-бот. Месяц бесплатно.';

const PAGES: Record<string, { title: string; description: string }> = {
  '/': { title: DEFAULT_TITLE, description: DEFAULT_DESC },
  '/features': {
    title: 'Возможности CRM для учебного центра: журнал, оплаты, расписание | SabakHub',
    description: 'Что умеет CRM-система SabakHub: учёт оплат и должников, журнал посещаемости, расписание и аудитории, зарплата преподавателей, экзамены, филиалы и Telegram-бот для родителей.',
  },
  '/about': {
    title: 'О SabakHub — CRM для учебных центров Кыргызстана',
    description: 'SabakHub помогает учебным центрам, школам и курсам навести порядок в деньгах, учёбе и расписании. Узнайте, кто мы и зачем это делаем.',
  },
  '/contact': {
    title: 'Контакты и демо CRM для учебного центра | SabakHub',
    description: 'Покажем CRM для вашего учебного центра или школы и перенесём данные из таблиц. Напишите или позвоните: +996 550 308 078, Бишкек.',
  },
  '/docs': {
    title: 'Документация | SabakHub',
    description: 'Как настроить SabakHub: курсы и группы, журнал, экзамены, оплаты и AI-помощник. Пошаговые инструкции для директора и преподавателей.',
  },
  '/vibecoder': {
    title: 'Что должен знать вайбкодер | SabakHub',
    description: 'Практические советы о том, как строить надёжные продукты с помощью AI: безопасность, данные и типичные ошибки.',
  },
  '/directory': {
    title: 'Учебные центры и курсы Кыргызстана — каталог | SabakHub',
    description: 'Учебные центры, курсы и школы на платформе SabakHub: направления, филиалы и контакты.',
  },
  '/crm-dlya-uchebnogo-centra': {
    title: 'CRM для учебного центра в Кыргызстане — оплаты, журнал, расписание | SabakHub',
    description: 'CRM для учебного центра: счета и должники, журнал посещаемости, расписание, зарплата учителей и Telegram-сводка директору. От 1 990 сом, первый месяц бесплатно.',
  },
  '/crm-dlya-yazykovoy-shkoly': {
    title: 'CRM для языковой школы и курсов английского | SabakHub',
    description: 'Группы по уровням, оценки A–F, онлайн-тесты с автопроверкой, домашние задания в Telegram и учёт оплат студентов. CRM для языковой школы от 1 990 сом.',
  },
  '/crm-dlya-chastnoy-shkoly': {
    title: 'Электронный журнал и CRM для частной школы | SabakHub',
    description: 'Классы, пятибалльная шкала, электронный журнал, оплата за обучение и оценки родителям в Telegram. CRM для частной школы в Кыргызстане.',
  },
  '/crm-dlya-detskogo-centra': {
    title: 'CRM для детского центра и кружков | SabakHub',
    description: 'Расписание кружков, посещаемость, ежемесячные оплаты и отчёты родителям в Telegram. CRM для детского центра от 1 990 сом, первый месяц бесплатно.',
  },
  '/crm-dlya-onlayn-shkoly': {
    title: 'CRM и платформа для онлайн-школы | SabakHub',
    description: 'Потоки, прогресс в процентах, онлайн-экзамены с автопроверкой, сертификаты с QR, ИИ-помощник и учёт оплат. Платформа для онлайн-школы.',
  },
  '/kak-vybrat-crm': {
    title: 'Как выбрать CRM для учебного центра: 6 критериев и сравнение | SabakHub',
    description: 'Чек-лист для директора: оплаты и долги, журнал, расписание, связь с родителями, зарплата учителей. Сравнение таблиц, универсальной CRM и отраслевой системы.',
  },
  '/privacy': {
    title: 'Политика конфиденциальности | SabakHub',
    description: 'Какие данные собирает SabakHub, как мы их храним и защищаем, и какие права есть у пользователей.',
  },
  '/terms': {
    title: 'Условия использования | SabakHub',
    description: 'Условия использования платформы SabakHub для учебных центров, школ и курсов.',
  },
};

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

export default function SeoHead() {
  const { pathname } = useLocation();

  useEffect(() => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/';
    const page = PAGES[path];
    // Public org profiles are indexable; their page sets its own title.
    const indexable = !!page || path.startsWith('/org/');
    const url = `${SITE_URL}${path === '/' ? '/' : path}`;

    if (page) {
      document.title = page.title;
      setMeta('name', 'description', page.description);
      setMeta('property', 'og:title', page.title);
      setMeta('property', 'og:description', page.description);
    }
    setMeta('name', 'robots', indexable ? 'index, follow' : 'noindex, nofollow');
    setMeta('property', 'og:url', url);
    setCanonical(indexable ? url : null);
  }, [pathname]);

  return null;
}
