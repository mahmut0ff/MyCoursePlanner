import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeft, BookOpen, Brain, Shield,
  Gamepad2, Layers, Users, Building2,
  Sparkles, CheckCircle2,
  Calendar, FileCheck2,
  MessageCircle, Rocket, Zap, Crown, FileSpreadsheet,
  Briefcase, ArrowRight, Bot, LineChart,
  MapPin, ShieldCheck, Palette, CalendarDays,
  Globe, Smartphone, PieChart, Timer
} from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

const FeaturesPage: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  const [activeTab, setActiveTab] = useState('summary');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => { setIsScrolled(window.scrollY > 20); };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const featureTabs = [
    { id: 'summary', label: 'Всё в одном', icon: PieChart, color: 'text-slate-500', bg: 'bg-slate-500/10' },
    { id: 'ai', label: 'AI Magic', icon: Brain, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { id: 'teachers', label: 'Всё для Учителя', icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { id: 'students', label: 'Опыт Студента', icon: Gamepad2, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { id: 'b2b', label: 'B2B Администрирование', icon: Building2, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { id: 'tools', label: 'Секретное оружие', icon: Layers, color: 'text-amber-500', bg: 'bg-amber-500/10' }
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-20 font-sans selection:bg-primary-500/30">
      
      {/* ═══ Navbar ═══ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-white/80 backdrop-blur-xl border-b border-slate-200/50 shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/icons/logo.png" alt="Planula" className="h-8 w-auto object-contain" />
            <span className="font-bold text-xl tracking-tight text-slate-800">Planula</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {user ? (
              <Link to="/dashboard" className="hidden sm:inline-block text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-5 py-2.5 rounded-full transition-all shadow-lg">{t('nav.dashboard') || 'Dashboard'}</Link>
            ) : (
              <Link to="/register" className="text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 px-5 py-2.5 rounded-full transition-all shadow-lg">{t('landing.heroCta')}</Link>
            )}
          </div>
        </div>
      </nav>

      {/* ═══ Hero ═══ */}
      <div className="pt-32 pb-16 px-6 relative overflow-hidden bg-white border-b border-slate-200/60 shadow-sm">
        <div className="absolute top-[-100px] right-[-100px] w-[600px] h-[600px] bg-primary-600/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-100px] left-[-100px] w-[600px] h-[600px] bg-violet-600/5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-600 mb-8 transition-colors bg-slate-100 hover:bg-slate-200 px-4 py-1.5 rounded-full">
            <ArrowLeft className="w-4 h-4" /> Назад на главную
          </Link>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold mb-6 tracking-tight bg-gradient-to-br from-slate-900 via-slate-800 to-slate-500 bg-clip-text text-transparent">
            Энциклопедия<br />Возможностей
          </h1>
          <p className="text-xl text-slate-500 max-w-4xl mx-auto leading-relaxed">
            Мы спроектировали <strong>100% покрытие</strong> потребностей вашей школы. От автоматизации 
            работы до геймификации, умных проверок домашки ИИ и жесткого биллинга. Это больше, чем LMS. Это <strong>Planula</strong>.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-12 flex flex-col lg:flex-row gap-12 items-start relative">
        
        {/* ═══ Sticky Sidebar Navigation ═══ */}
        <div className="hidden lg:block w-72 shrink-0 sticky top-28 space-y-2 relative z-20">
          <div className="bg-white rounded-3xl p-4 border border-slate-200/60 shadow-xl shadow-slate-200/40">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 px-3">Навигация</h3>
            <div className="space-y-1">
              {featureTabs.map((tab) => (
                <button 
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    document.getElementById(tab.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-medium text-sm text-left
                    ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-white' : tab.color}`} />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ Content Stream ═══ */}
        <div className="flex-1 space-y-32">

          {/* SECTION 0: SUMMARY */}
          <section id="summary" className="scroll-mt-32">
            <div className="bg-slate-900 rounded-[2rem] p-10 md:p-14 text-center relative overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
                  <PieChart className="w-8 h-8 text-primary-400" />
                </div>
                <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6">Одна платформа заменяет десять</h2>
                <p className="text-lg text-slate-300 max-w-2xl leading-relaxed mb-8">Забудьте про 10 разных подписок (Zoom, Google Docs, Kahoot, ChatGPT, Trello, Excel, CRM). Мы уместили лучший мировой опыт в одном чистом интерфейсе.</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <span className="bg-white/10 text-white px-4 py-2 rounded-full text-sm font-medium border border-white/5">Аналитика</span>
                  <span className="bg-white/10 text-white px-4 py-2 rounded-full text-sm font-medium border border-white/5">Финансы</span>
                  <span className="bg-white/10 text-white px-4 py-2 rounded-full text-sm font-medium border border-white/5">Чат</span>
                  <span className="bg-white/10 text-white px-4 py-2 rounded-full text-sm font-medium border border-white/5">Контент LMS</span>
                  <span className="bg-white/10 text-white px-4 py-2 rounded-full text-sm font-medium border border-white/5">Gamification</span>
                </div>
              </div>
            </div>
          </section>
          
          {/* SECTION 1: AI MAGIC */}
          <section id="ai" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                <Brain className="w-6 h-6 text-violet-600" />
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">AI Magic</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mb-6 border border-violet-100">
                  <Bot className="w-6 h-6 text-violet-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Автономный AI-Ассистент</h3>
                <p className="text-slate-500 text-base leading-relaxed mb-6">Публичный бот на вашей странице-визитке отвечает лидам 24/7. Он обучается на документах, стоимости курсов и расписании Вашей организации. Никаких придуманных фактов или "галлюцинаций".</p>
                <div className="bg-slate-50 p-5 rounded-2xl text-sm font-mono text-slate-700 border border-slate-100 shadow-inner">
                  "Какая цена на курс IELTS?"<br/>
                  <span className="text-violet-600 mt-2 block font-semibold flex gap-2">
                    <ArrowRight className="w-4 h-4 mt-0.5 shrink-0" />
                    "IELTS интенсив длится 2 месяца и стоит 45 000 ₸. Включены пробные тесты."
                  </span>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mb-6 border border-violet-100">
                  <FileCheck2 className="w-6 h-6 text-violet-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Умная проверка ДЗ</h3>
                <p className="text-slate-500 text-base leading-relaxed mb-6">ИИ автоматически проверяет письменные работы студентов. Он не просто ставит балл, но и находит плагиат, выделяет грамматические ошибки и пишет развернутый отзыв-совет для ученика.</p>
                <ul className="text-sm space-y-3 text-slate-600 font-medium bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0"/> Быстрый фидбек экономит до 15 часов/нед.</li>
                </ul>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 border border-amber-100">
                  <Sparkles className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">AI Генерация Контента</h3>
                <p className="text-slate-500 text-base leading-relaxed">Загрузите PDF файл или введите тему, и ИИ мгновенно сгенерирует набор вопросов с правильными и ложными ответами для проведения Kahoot-викторины.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center mb-6 border border-sky-100">
                  <MessageCircle className="w-6 h-6 text-sky-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Voice-to-Text Speech</h3>
                <p className="text-slate-500 text-base leading-relaxed">Голосовой набор на любом экране (заметки к профилю, комментарии, чат). Нажмите иконку микрофона, и нейросеть расшифрует ваш голос с точной расстановкой запятых и точек.</p>
              </div>

            </div>
          </section>

          {/* SECTION 2: TEACHER HUB */}
          <section id="teachers" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <Users className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Рабочий стол Учителя</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="col-span-1 md:col-span-2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-10 md:p-14 rounded-[2rem] shadow-xl relative overflow-hidden group hover:shadow-2xl transition-all">
                <div className="absolute right-[-100px] top-[-100px] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[100px] group-hover:bg-emerald-500/20 transition-colors pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold px-4 py-2 rounded-full flex items-center gap-2 uppercase tracking-wide"><LineChart className="w-4 h-4"/> Killer Feature</span>
                  </div>
                  <h3 className="text-3xl md:text-5xl font-extrabold text-white mb-6 leading-tight">Светофор Рисков Студента<br />(Student Retention System)</h3>
                  <p className="text-slate-300 text-lg leading-relaxed max-w-3xl mb-8">
                    Smart Dashboard анализирует посещаемость, активность на уроках и выполнение ДЗ. Студенты автоматически распределяются по доске риска: "Красный", "Желтый", "Зеленый". Действуйте проактивно и спасайте клиентов от оттока еще до того, как они заберут деньги!
                  </p>
                  
                  <div className="flex flex-wrap gap-4 mt-8">
                    <div className="bg-slate-800/80 border border-slate-700 backdrop-blur-sm px-5 py-3 rounded-2xl flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]" />
                      <span className="text-slate-200 text-sm font-semibold">Высокий риск оттока</span>
                    </div>
                    <div className="bg-slate-800/80 border border-slate-700 backdrop-blur-sm px-5 py-3 rounded-2xl flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.9)]" />
                      <span className="text-slate-200 text-sm font-semibold">Нужно наблюдение</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-6"><Calendar className="w-6 h-6 text-slate-700" /></div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Интерактивный Журнал</h3>
                <p className="text-slate-500 text-base leading-relaxed mb-6">Мгновенное выставление оценок (A, B, C, F или 0-100) и отметка посещаемости. Присутствовал, опоздал, пропустил (уважительно/без). Быстрые комментарии к уроку видны ученикам.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-6"><CalendarDays className="w-6 h-6 text-slate-700" /></div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Расписание и Сетки</h3>
                <p className="text-slate-500 text-base leading-relaxed mb-6">Конструктор расписания уроков. Визуальная таблица занятий, проверка накладок по времени и аудиториям. Легкий перенос уроков кликом.</p>
              </div>

              <div className="col-span-1 md:col-span-2 bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-shadow flex flex-col md:flex-row gap-8 items-center">
                <div className="flex-1">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-6"><BookOpen className="w-6 h-6 text-slate-700" /></div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-4">LMS Хранилище (Видео, PDF, Тесты)</h3>
                  <p className="text-slate-500 text-base leading-relaxed">
                    Преподаватель загружает материалы прямо в структуру курса (Документы, YouTube-видео в плеере, Практические задания). У студента всё выстроено в логичную цепочку для самообучения. Никаких Google Drive и засорения Telegram чатов.
                  </p>
                </div>
              </div>

            </div>
          </section>

          {/* SECTION 3: GAMIFICATION */}
          <section id="students" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                <Gamepad2 className="w-6 h-6 text-rose-600" />
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Опыт Студента & Геймификация</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-rose-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mb-6 border border-rose-100"><Zap className="w-6 h-6 text-rose-500" /></div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">Огненные Стрики 🔥</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">Каждое посещение продлевает "огонь" непрерывного обучения. Пропуск или невыполнение ДЗ сжигает стрик. Это мотивирует студентов возвращаться на уроки каждый день.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-amber-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 border border-amber-100"><Crown className="w-6 h-6 text-amber-500" /></div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">Шкала XP и Ранги</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">Сдача заданий вовремя дает очки Опыта (XP). Система прокачки переводит учеников с ранга "Студент" до "Мастера", создавая глобальный соревновательный Ladder (Лидерборд).</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6 border border-indigo-100"><Gamepad2 className="w-6 h-6 text-indigo-500" /></div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">Аналог Kahoot (Live Quiz)</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">Живые турниры в классе! Преподаватель запускает викторину на интерактивной доске, студенты присоединяются с телефонов. Турнирная таблица, таймеры и фан.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-6 border border-blue-100"><PieChart className="w-6 h-6 text-blue-500" /></div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">Профиль и Радары Навыков</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">Графики успеваемости в стиле RPG-игр. Студент наглядно видит, где он слабее (например Граматика, Аудирование) и может прокачивать целевые зоны.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6 border border-emerald-100"><Smartphone className="w-6 h-6 text-emerald-500" /></div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">Адаптивный Mobile UI</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">Интерфейс выглядит и ведет себя как нативное приложение (App) прямо в браузере Safari/Chrome смартфона. Не нужно скачивать приложение из сторов.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-cyan-50 flex items-center justify-center mb-6 border border-cyan-100"><Globe className="w-6 h-6 text-cyan-500" /></div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">Мультиязычность</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">Вся система переведена на Русский, English и Қазақша. Каждый пользователь может использовать комфортный для себя язык независимо от остальных.</p>
              </div>

            </div>
          </section>

          {/* SECTION 4: B2B CORE */}
          <section id="b2b" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Ядро управления (B2B Admin)</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-6"><Shield className="w-6 h-6 text-slate-700" /></div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Zero-Leak Изоляция</h3>
                <p className="text-slate-500 text-base leading-relaxed">Данные вашей организации физически отрезаны от других центров на уровне БД. Ваша база клиентов 100% приватна и защищена ключами NoSQL.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-6"><MapPin className="w-6 h-6 text-slate-700" /></div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Система Филиалов</h3>
                <p className="text-slate-500 text-base leading-relaxed">Контролируйте сразу несколько точек в городе. Привязка учителей, студентов и аудиторий к конкретным филиалам и раздельная финансовая отчетность.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-6"><ShieldCheck className="w-6 h-6 text-slate-700" /></div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Журнал Аудита (Security)</h3>
                <p className="text-slate-500 text-base leading-relaxed">Ни одно редактирование оценки или оплаты не скроется. Система ведет Security Audit Trail: (Кто, Когда и Что изменил), чтобы предотвращать мошенничество персонала.</p>
              </div>

              <div className="col-span-1 md:col-span-3 bg-gradient-to-r from-blue-900 to-indigo-900 p-10 md:p-14 rounded-[2rem] shadow-xl relative overflow-hidden flex flex-col md:flex-row gap-8 items-center group">
                <div className="absolute right-[-50px] top-[-50px] w-[300px] h-[300px] bg-indigo-500/20 rounded-full blur-[80px] pointer-events-none" />
                <div className="flex-1 text-left relative z-10">
                  <div className="inline-block bg-white/10 text-white border border-white/20 px-3 py-1 rounded-full text-xs font-bold mb-5 uppercase tracking-wide">Enterprise Level</div>
                  <h3 className="text-3xl font-bold text-white mb-4">Финансовая Аналитика и Подписки</h3>
                  <p className="text-blue-100/70 text-base leading-relaxed mb-6 max-w-2xl">
                    Жесткий биллинг в реальном времени: агрегация транзакций, графики прихода/расхода (Today, Week, Month). 
                    Для самой платформы встроен автоматический **Billing Guard**: умное отключение SaaS модулей арендаторов по истечении Trial/Pro периода с реалтайм таймерами и блокировками API на Backend-уровне.
                  </p>
                  <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm font-medium text-white/90 mt-8">
                    <li className="flex items-center justify-center bg-white/10 px-4 py-3 rounded-xl border border-white/5 backdrop-blur-md">Учет Доходов</li>
                    <li className="flex items-center justify-center bg-white/10 px-4 py-3 rounded-xl border border-white/5 backdrop-blur-md">Trial-Механика</li>
                    <li className="flex items-center justify-center bg-white/10 px-4 py-3 rounded-xl border border-white/5 backdrop-blur-md">Stripe Ready</li>
                    <li className="flex items-center justify-center bg-white/10 px-4 py-3 rounded-xl border border-white/5 backdrop-blur-md">Отчетные Графики</li>
                  </ul>
                </div>
              </div>

            </div>
          </section>

          {/* SECTION 5: TOOLS */}
          <section id="tools" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <Layers className="w-6 h-6 text-amber-600" />
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Рабочие Инструменты</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 hover:shadow-xl transition-shadow flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100"><Timer className="w-6 h-6 text-slate-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Anti-Cheat на Экзаменах</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Строгие экзамены с таймерами. Защита от списывания: система фиксирует смену вкладки и блокирует copy-paste.</p>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 hover:shadow-xl transition-shadow flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100"><FileSpreadsheet className="w-6 h-6 text-slate-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Генератор Сертификатов</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Платформа сама создает и подписывает PDF-сертификаты для выпускников, присваивая им QR-коды для проверки.</p>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 hover:shadow-xl transition-shadow flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100"><MessageCircle className="w-6 h-6 text-slate-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Групповые Чаты</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Внутренний мессенджер для коммуникации групп и преподавателей. Обмен файлами, упоминания, история переписки.</p>
                </div>
              </div>
              
              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 hover:shadow-xl transition-shadow flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100"><Palette className="w-6 h-6 text-slate-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">White-Label Брендинг</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Настраиваемый интерфейс: установите свой логотип и цвета организации, чтобы платформа смотрелась как ваше личное приложение.</p>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 hover:shadow-xl transition-shadow flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100"><Briefcase className="w-6 h-6 text-slate-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Каталог Вакансий (Mini-LinkedIn)</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Публикация партнёрских вакансий. Студенты-выпускники могут подавать резюме прямо из интерфейса школы.</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-primary-600 to-indigo-600 p-8 rounded-3xl shadow-xl flex flex-col items-center justify-center gap-4 text-center group">
                <Rocket className="w-12 h-12 text-white group-hover:-translate-y-2 transition-transform" />
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">Начнем работу?</h3>
                  <p className="text-white/80 text-sm leading-relaxed mb-4">Вам понравились возможности Planula?</p>
                  <Link to="/register" className="bg-white text-primary-700 px-6 py-2.5 rounded-xl font-bold hover:bg-slate-50 transition-colors inline-block shadow-lg">Попробовать бесплатно</Link>
                </div>
              </div>

            </div>
          </section>

        </div>
      </div>

    </div>
  );
};

export default FeaturesPage;
