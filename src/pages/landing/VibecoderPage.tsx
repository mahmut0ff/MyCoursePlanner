import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ArrowLeft, Globe2, Atom, GitBranch, Server, Cloud,
  Database, FolderOpen, PlayCircle, ListChecks,
  CheckCircle2, BookOpen, Clock, ClipboardList, Users,
  Zap, UploadCloud, Bot, ShoppingCart, LayoutGrid, Rocket,
} from 'lucide-react';
import { LandingNav, LandingFooter } from '../../components/landing/LandingChrome';

/**
 * Открытая учебная страница «Что должен знать вайбкодер».
 * Это не лендинг, а пошаговый путь обучения (роадмап) со встроенными видео.
 * Контент пока зашит напрямую — по ходу дела дополним и вынесем в i18n.
 */

type Point = { term: string; text: string };
type Module = {
  id: string;
  stage: string;
  title: string;
  duration: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // tailwind text/bg accent base, e.g. 'indigo'
  intro: string;
  video?: { id: string; title: string };
  body?: string[];
  points?: Point[];
  subcards?: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }[];
};

const getModules = (t: TFunction): Module[] => [
  {
    id: 'web-basics',
    stage: t('landing.vibe.s1', 'Этап 1 · Основы'),
    title: t('landing.vibe.m1Title', 'Фронтенд и бэкенд'),
    duration: t('landing.vibe.minutes', '~{{n}} мин', { n: 10 }),
    icon: Globe2,
    accent: 'indigo',
    intro:
      t('landing.vibe.m1Intro', 'С этого начинается понимание любого веб-приложения. Прежде чем писать код, нужно увидеть, из каких двух больших частей состоит любой сайт или сервис.'),
    video: { id: 'TttUb4f5Zyg', title: t('landing.vibe.m1Video', 'Что такое фронтенд и бэкенд') },
    points: [
      { term: t('landing.vibe.p1aTerm', 'Фронтенд'), text: t('landing.vibe.p1a', 'Всё, что видит и с чем взаимодействует пользователь: страницы, кнопки, формы. Работает в браузере.') },
      { term: t('landing.vibe.p1bTerm', 'Бэкенд'), text: t('landing.vibe.p1b', 'Скрытая серверная часть: логика, база данных, обработка запросов. Пользователь её не видит.') },
      { term: t('landing.vibe.p1cTerm', 'Как они общаются'), text: t('landing.vibe.p1c', 'Фронтенд отправляет запрос на бэкенд по сети, получает данные и показывает их пользователю.') },
    ],
  },
  {
    id: 'react',
    stage: t('landing.vibe.s2', 'Этап 2 · Фронтенд'),
    title: 'React',
    duration: t('landing.vibe.minutes', '~{{n}} мин', { n: 12 }),
    icon: Atom,
    accent: 'sky',
    intro:
      t('landing.vibe.m2Intro', 'Фронтенд нашей платформы (SabakHub) написан на React — самой популярной библиотеке для построения пользовательских интерфейсов. Понимая React, ты понимаешь, как устроена видимая часть проекта.'),
    video: { id: '0q_bpnno7Ks', title: t('landing.vibe.m2Video', 'Что такое React') },
    points: [
      { term: t('landing.vibe.p2aTerm', 'Компоненты'), text: t('landing.vibe.p2a', 'Интерфейс собирается из небольших переиспользуемых блоков — как из деталей конструктора.') },
      { term: t('landing.vibe.p2bTerm', 'Состояние (state)'), text: t('landing.vibe.p2b', 'Данные, при изменении которых интерфейс автоматически перерисовывается.') },
      { term: t('landing.vibe.p2cTerm', 'Почему именно React'), text: t('landing.vibe.p2c', 'Огромная экосистема, поддержка сообщества и именно на нём построена эта платформа.') },
    ],
  },
  {
    id: 'git',
    stage: t('landing.vibe.s3', 'Этап 3 · Инструменты'),
    title: t('landing.vibe.m3Title', 'Git и GitHub'),
    duration: t('landing.vibe.minutes', '~{{n}} мин', { n: 12 }),
    icon: GitBranch,
    accent: 'emerald',
    intro:
      t('landing.vibe.m3Intro', 'Git — система контроля версий: она хранит историю всех изменений кода. GitHub — облачный сервис, где репозитории живут и где над ними работает команда. Для вайбкодера это страховка: любое рабочее состояние можно сохранить и вернуть.'),
    video: { id: 'EeARyFrZsnU', title: t('landing.vibe.m3Video', 'Что такое Git и GitHub') },
    points: [
      { term: t('landing.vibe.p3aTerm', 'Git (локально)'), text: t('landing.vibe.p3a', 'commit — сохранить состояние, ветки — параллельная работа, откат — вернуться назад.') },
      { term: t('landing.vibe.p3bTerm', 'GitHub (облако)'), text: t('landing.vibe.p3b', 'Хранение репозитория, совместная работа, pull request — обсуждение изменений.') },
      { term: t('landing.vibe.p3cTerm', 'Главное правило'), text: t('landing.vibe.p3c', 'Рабочая версия — в коммит. Сломал — откатился. Без Git вайбкодинг превращается в рулетку.') },
    ],
  },
  {
    id: 'serverless',
    stage: t('landing.vibe.s4', 'Этап 4 · Бэкенд'),
    title: t('landing.vibe.m4Title', 'Бэкенд: serverless-функции на Node.js'),
    duration: t('landing.vibe.readMinutes', '~{{n}} мин чтения', { n: 8 }),
    icon: Server,
    accent: 'violet',
    intro:
      t('landing.vibe.m4Intro', 'У нашего проекта тоже есть бэкенд — но устроен он современно. Это не один большой постоянно работающий сервер, а отдельные функции, которые запускаются «по требованию».'),
    body: [
      t('landing.vibe.m4Body1', 'Вся платформа построена на Node.js — это среда, которая позволяет запускать JavaScript не в браузере, а на сервере. То есть один и тот же язык и на фронтенде, и на бэкенде.'),
      t('landing.vibe.m4Body2', 'Фронтенд (React) — это то, что видит пользователь. А наш бэкенд — это набор функций, которые выполняются на Netlify (их называют Netlify Functions).'),
      t('landing.vibe.m4Body3', 'Такие функции называют serverless («бессерверными»): тебе не нужно поднимать и обслуживать сервер. Функция «просыпается», когда приходит запрос, выполняет задачу — например, обрабатывает платёж или отправляет уведомление — и снова «засыпает».'),
    ],
    points: [
      { term: 'Node.js', text: t('landing.vibe.p4a', 'JavaScript на сервере — на нём работает вся серверная логика проекта.') },
      { term: 'Netlify Functions', text: t('landing.vibe.p4b', 'Наши бэкенд-функции, которые запускаются по запросу с фронтенда.') },
      { term: 'Serverless', text: t('landing.vibe.p4c', 'Не нужно держать сервер постоянно — функция вызывается только когда нужна.') },
    ],
  },
  {
    id: 'cloud',
    stage: t('landing.vibe.s5', 'Этап 5 · Инфраструктура'),
    title: t('landing.vibe.m5Title', 'Облачные сервисы: Netlify и Firebase'),
    duration: t('landing.vibe.readMinutes', '~{{n}} мин чтения', { n: 8 }),
    icon: Cloud,
    accent: 'cyan',
    intro:
      t('landing.vibe.m5Intro', 'Современные приложения почти не держат «своих» серверов — они используют облачные сервисы. Облако — это чужие серверы (дата-центры), которые ты используешь через интернет, не заботясь о железе, его обслуживании и обновлениях.'),
    subcards: [
      {
        icon: Cloud,
        title: 'Netlify',
        text: t('landing.vibe.m5Netlify', 'Сюда деплоится наш фронтенд и отсюда запускаются serverless-функции (бэкенд). По сути, это «дом» для всего нашего приложения в интернете.'),
      },
      {
        icon: Database,
        title: 'Google Firebase',
        text: t('landing.vibe.m5Firebase', 'Backend-as-a-service от Google. В нашем проекте отвечает сразу за несколько вещей — база данных, вход пользователей и хранение файлов.'),
      },
    ],
    points: [
      { term: 'Firestore', text: t('landing.vibe.p5a', 'Облачная база данных Firebase, где хранятся все данные платформы.') },
      { term: 'Authentication', text: t('landing.vibe.p5b', 'Вход и регистрация пользователей — Firebase берёт это на себя.') },
      { term: 'Storage', text: t('landing.vibe.p5c', 'Хранилище файлов: аватарки, документы, изображения.') },
    ],
  },
];

const ACCENTS: Record<string, { text: string; bg: string; softBg: string; ring: string }> = {
  indigo: { text: 'text-indigo-600', bg: 'bg-indigo-600', softBg: 'bg-indigo-50', ring: 'ring-indigo-200' },
  sky: { text: 'text-sky-600', bg: 'bg-sky-600', softBg: 'bg-sky-50', ring: 'ring-sky-200' },
  emerald: { text: 'text-emerald-600', bg: 'bg-emerald-600', softBg: 'bg-emerald-50', ring: 'ring-emerald-200' },
  violet: { text: 'text-violet-600', bg: 'bg-violet-600', softBg: 'bg-violet-50', ring: 'ring-violet-200' },
  cyan: { text: 'text-cyan-600', bg: 'bg-cyan-600', softBg: 'bg-cyan-50', ring: 'ring-cyan-200' },
};

const VideoEmbed: React.FC<{ id: string; title: string }> = ({ id, title }) => (
  <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-lg ring-1 ring-slate-200 bg-slate-900">
    <iframe
      src={`https://www.youtube.com/embed/${id}`}
      title={title}
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      className="absolute inset-0 w-full h-full"
    />
  </div>
);

const VibecoderPage: React.FC = () => {
  const { t } = useTranslation();
  const modules = getModules(t);
  const [activeId, setActiveId] = useState<string>(modules[0].id);

  // Подсветка активного этапа в оглавлении
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 },
    );
    modules.forEach((m) => {
      const el = document.getElementById(m.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @keyframes vc-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .vc-rise { opacity: 0; animation: vc-rise 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
        @media (prefers-reduced-motion: reduce) { .vc-rise { animation: none; opacity: 1; transform: none; } }
      `}</style>

      <LandingNav />

      <div className="max-w-6xl mx-auto px-6 pt-28 pb-24">
        {/* Header */}
        <header className="mb-12">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-600 mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </Link>
          <div className="flex items-center gap-2 text-primary-600 font-semibold text-sm mb-3">
            <BookOpen className="w-4 h-4" /> {t('landing.vibe.path', 'Учебный путь')}
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
            {t('landing.vibe.title', 'Что должен знать вайбкодер')}
          </h1>
          <p className="text-lg text-slate-600 leading-relaxed max-w-2xl">
            {t('landing.vibe.lead', 'Пошаговый маршрут: проходи этапы по порядку — от того, как вообще устроен веб, до инфраструктуры, на которой работает эта платформа. Каждый этап — короткое видео или разбор с ключевыми понятиями.')}
          </p>
        </header>

        {/* Программа курса */}
        <section className="mb-16 rounded-3xl border border-slate-200 bg-white shadow-sm p-8 md:p-10 vc-rise">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary-50 text-primary-700 text-sm font-semibold mb-5">
            <ClipboardList className="w-4 h-4" /> {t('landing.vibe.program', 'Программа курса')}
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-3 leading-tight">
            {t('landing.vibe.programTitle', 'С нуля до продакшена за один месяц')}
          </h2>
          <p className="text-slate-600 text-lg leading-relaxed mb-8 max-w-3xl">
            {t('landing.vibe.programText', 'Мы проходим весь путь целиком — от первой строчки до готового сайта в интернете, которым могут пользоваться реальные люди. За месяц студенты с помощью ИИ делают два завершённых проекта, после которых уже могут принимать заказы и создавать сайты сами.')}
          </p>

          {/* Чему научатся */}
          <p className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">{t('landing.vibe.learnTitle', 'Чему научатся')}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {[
              { icon: Users, title: t('landing.vibe.learn1Title', 'Работа в команде'), text: t('landing.vibe.learn1', 'Совместная разработка, как в настоящих IT-проектах.') },
              { icon: Zap, title: t('landing.vibe.learn2Title', 'Современные технологии'), text: t('landing.vibe.learn2', 'Те же инструменты, что используют в индустрии сегодня.') },
              { icon: UploadCloud, title: t('landing.vibe.learn3Title', 'Публикация в интернете'), text: t('landing.vibe.learn3', 'Облачные сервисы, чтобы сайтом могли пользоваться другие.') },
              { icon: Bot, title: t('landing.vibe.learn4Title', 'Создание с ИИ'), text: t('landing.vibe.learn4', 'Строим реальные продукты в связке с искусственным интеллектом.') },
            ].map((s, i) => {
              const SIcon = s.icon;
              return (
                <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center mb-3"><SIcon className="w-5 h-5" /></div>
                  <p className="font-bold text-slate-900 mb-1">{s.title}</p>
                  <p className="text-sm text-slate-500 leading-relaxed">{s.text}</p>
                </div>
              );
            })}
          </div>

          {/* Два проекта */}
          <p className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">{t('landing.vibe.projectsTitle', 'Два реальных проекта')}</p>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 to-violet-50 p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-md"><ShoppingCart className="w-5 h-5" /></div>
                <h3 className="font-bold text-slate-900 text-lg">{t('landing.vibe.shopTitle', 'Интернет-магазин')}</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">{t('landing.vibe.shopText', 'Первый проект для всех — полноценный магазин: каталог, корзина, оформление заказа.')}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-md"><LayoutGrid className="w-5 h-5" /></div>
                <h3 className="font-bold text-slate-900 text-lg">{t('landing.vibe.choiceTitle', 'Проект на выбор')}</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">{t('landing.vibe.choiceText', 'Второй проект студент выбирает сам из списка идей, который даёт преподаватель.')}</p>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-2 text-slate-500">
            <Rocket className="w-4 h-4 text-primary-600 shrink-0" /> {t('landing.vibe.bothDone', 'Оба проекта — завершённые сайты, готовые к показу заказчикам.')}
          </div>
        </section>

        <div className="lg:grid lg:grid-cols-[230px_1fr] lg:gap-12">
          {/* Оглавление / роадмап */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4 px-3">{t('landing.vibe.programNav', 'Программа')}</p>
              <nav className="space-y-1">
                {modules.map((m, i) => {
                  const a = ACCENTS[m.accent];
                  const active = activeId === m.id;
                  return (
                    <a
                      key={m.id}
                      href={`#${m.id}`}
                      className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                        active ? `${a.softBg} ${a.text} font-semibold` : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold shrink-0 transition-colors ${
                        active ? `${a.bg} text-white` : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                      }`}>{i + 1}</span>
                      <span className="leading-tight">{m.title}</span>
                    </a>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Модули */}
          <main className="space-y-16 min-w-0">
            {modules.map((m, i) => {
              const a = ACCENTS[m.accent];
              const Icon = m.icon;
              return (
                <section key={m.id} id={m.id} className="scroll-mt-24 vc-rise">
                  {/* Заголовок этапа */}
                  <div className="flex items-start gap-4 mb-5">
                    <div className={`w-12 h-12 rounded-2xl ${a.bg} flex items-center justify-center shadow-md shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                        <span className={`text-xs font-bold uppercase tracking-wider ${a.text}`}>{m.stage}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="w-3.5 h-3.5" /> {m.duration}
                        </span>
                      </div>
                      <h2 className="text-2xl font-extrabold text-slate-900 leading-tight">
                        <span className="text-slate-300 mr-2">{i + 1}.</span>{m.title}
                      </h2>
                    </div>
                  </div>

                  {/* Вступление */}
                  <p className="text-slate-600 text-[17px] leading-relaxed mb-6 lg:pl-16">{m.intro}</p>

                  <div className="lg:pl-16 space-y-6">
                    {/* Видео */}
                    {m.video && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                          <PlayCircle className={`w-5 h-5 ${a.text}`} /> {t('landing.vibe.video', 'Видео: {{title}}', { title: m.video.title })}
                        </div>
                        <VideoEmbed id={m.video.id} title={m.video.title} />
                      </div>
                    )}

                    {/* Текстовый разбор */}
                    {m.body && (
                      <div className="space-y-4">
                        {m.body.map((p, j) => (
                          <p key={j} className="text-slate-600 leading-relaxed">{p}</p>
                        ))}
                      </div>
                    )}

                    {/* Подкарточки (например, Netlify / Firebase) */}
                    {m.subcards && (
                      <div className="grid sm:grid-cols-2 gap-4">
                        {m.subcards.map((c, j) => {
                          const CIcon = c.icon;
                          return (
                            <div key={j} className={`rounded-2xl border border-slate-100 ${a.softBg} p-5`}>
                              <div className="flex items-center gap-3 mb-2">
                                <div className={`w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm ${a.text}`}>
                                  <CIcon className="w-5 h-5" />
                                </div>
                                <h3 className="font-bold text-slate-900">{c.title}</h3>
                              </div>
                              <p className="text-sm text-slate-600 leading-relaxed">{c.text}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Ключевые понятия */}
                    {m.points && (
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5 sm:p-6">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-4">
                          <ListChecks className={`w-4 h-4 ${a.text}`} /> {t('landing.vibe.keyConcepts', 'Ключевые понятия')}
                        </div>
                        <ul className="space-y-3">
                          {m.points.map((pt, j) => (
                            <li key={j} className="flex items-start gap-3">
                              <CheckCircle2 className={`w-5 h-5 ${a.text} shrink-0 mt-0.5`} />
                              <span className="text-slate-600 leading-relaxed">
                                <span className="font-semibold text-slate-900">{pt.term}.</span> {pt.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}

            {/* Низ: статус документа */}
            <div className="lg:pl-16">
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 flex items-start gap-4">
                <FolderOpen className="w-6 h-6 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-800 mb-1">{t('landing.vibe.moreTitle', 'Продолжение следует')}</p>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {t('landing.vibe.moreText', 'Это живой учебный материал — мы будем добавлять новые этапы и видео по ходу дела: базы данных, аутентификацию, безопасность и работу с ИИ.')}
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
};

export default VibecoderPage;
