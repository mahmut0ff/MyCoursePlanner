import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeft, BookOpen, Brain, BarChart3, Shield,
  Award, Target, Gamepad2, Layers, Users, Building2,
  Lock, Sparkles, Database, CheckCircle2,
  Calendar, FileText, FileCheck2, Fingerprint, Map,
  MessageCircle, Rocket, Zap, Crown, UserPlus, FileSpreadsheet,
  Megaphone, Briefcase, Camera, Image, ArrowRight, Bot
} from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

const FeaturesPage: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();
  const [activeTab, setActiveTab] = useState('ai');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => { setIsScrolled(window.scrollY > 20); };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const featureTabs = [
    { id: 'ai', label: 'AI Magic', icon: Brain, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { id: 'teachers', label: 'Учителям', icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { id: 'students', label: 'Студентам', icon: Gamepad2, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { id: 'b2b', label: 'Организациям', icon: Building2, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { id: 'tools', label: 'Дополнительно', icon: Layers, color: 'text-amber-500', bg: 'bg-amber-500/10' }
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 pb-20 font-sans selection:bg-primary-500/30">
      
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
      <div className="pt-32 pb-16 px-6 relative overflow-hidden bg-white border-b border-slate-200/60">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary-600/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-violet-600/5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-600 mb-8 transition-colors bg-slate-100 hover:bg-slate-200 px-4 py-1.5 rounded-full">
            <ArrowLeft className="w-4 h-4" /> Назад на главную
          </Link>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold mb-6 tracking-tight bg-gradient-to-br from-slate-900 via-slate-800 to-slate-500 bg-clip-text text-transparent">
            Взгляните на все<br />возможности изнутри
          </h1>
          <p className="text-xl text-slate-500 max-w-3xl mx-auto leading-relaxed">
            Мы встроили всё необходимое для полного цикла работы учебного центра. От мощнейшей ИИ-автоматизации и геймификации до жесткого контроля финансов и посещаемости.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-12 flex flex-col lg:flex-row gap-12 items-start relative">
        
        {/* ═══ Sticky Sidebar Navigation ═══ */}
        <div className="hidden lg:block w-72 shrink-0 sticky top-28 space-y-2 relative z-20">
          <div className="bg-white rounded-3xl p-4 border border-slate-200/60 shadow-xl shadow-slate-200/40">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 px-3">Категории</h3>
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
          
          {/* SECTION 1: AI MAGIC */}
          <section id="ai" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                <Brain className="w-6 h-6 text-violet-600" />
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">AI Magic</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-violet-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mb-6 border border-violet-100">
                  <Bot className="w-6 h-6 text-violet-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">AI-Менеджер (24/7)</h3>
                <p className="text-slate-500 text-base leading-relaxed mb-6">Ваш личный ассистент на странице организации обучается на ваших данных (цены, расписание, документы) и мгновенно отвечает лидам. Без "галлюцинаций", строго по правилам.</p>
                <div className="bg-slate-50 p-5 rounded-2xl text-sm font-mono text-slate-600 border border-slate-100 relative shadow-inner">
                  <div className="absolute top-2 left-2 flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-400"></div><div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div><div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div></div>
                  <div className="mt-3">"Какая цена на курс IELTS?"<br/><span className="text-violet-500 mt-2 block font-semibold flex gap-2"><ArrowRight className="w-4 h-4 mt-0.5 shrink-0" /> "Подготовка длится 2 месяца и стоит 45 000 ₸ в месяц..."</span></div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-primary-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center mb-6 border border-primary-100">
                  <FileCheck2 className="w-6 h-6 text-primary-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Авто-проверка домашки</h3>
                <p className="text-slate-500 text-base leading-relaxed mb-6">Больше не нужно вручную проверять сотни эссе. ИИ проверяет работы по ключам, ищет плагиат и пишет детальный фидбек для студента с разбором ошибок.</p>
                <ul className="text-sm space-y-3 text-slate-600 font-medium">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0"/> Проверка плагиата (Поисковик сети)</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0"/> Выделение грамматических и смысловых ошибок</li>
                </ul>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-amber-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 border border-amber-100">
                  <Sparkles className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Генерация викторин (PDF / Text)</h3>
                <p className="text-slate-500 text-base leading-relaxed mb-6">Превратите PDF документ или скучную тему в полноценный Kahoot-квиз. Задайте промпт, и ИИ сам придумает вопросы, правильные и ложные варианты ответов.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-sky-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center mb-6 border border-sky-100">
                  <MessageCircle className="w-6 h-6 text-sky-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Голосовой помощник везде</h3>
                <p className="text-slate-500 text-base leading-relaxed mb-6">Идеально для мобильных устройств. Нажимайте на микрофон и диктуйте оценки, заметки и комментарии — нейросеть транскрибирует ваш голос сразу с учетом пунктуации!</p>
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
                    <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 uppercase tracking-wide"><LineChart className="w-3.5 h-3.5"/> Инновация</span>
                  </div>
                  <h3 className="text-3xl md:text-5xl font-extrabold text-white mb-6 leading-tight">Светофор Рисков Студента<br />(Kanban Retention System)</h3>
                  <p className="text-slate-300 text-lg leading-relaxed max-w-3xl mb-8">
                    Автоматическая панель дашбордов, анализирующая оценки, активность и посещаемость. Система раздает студентам метки "Красный", "Желтый", "Зеленый риски". Вы заранее знаете, кто может бросить учебу, и можете предпринять меры до окончания оплаты.
                  </p>
                  
                  <div className="flex flex-wrap gap-4 mt-8">
                    <div className="bg-slate-800/80 border border-slate-700 backdrop-blur-sm p-4 rounded-xl flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                      <span className="text-slate-200 text-sm font-medium">Высокий риск оттока</span>
                    </div>
                    <div className="bg-slate-800/80 border border-slate-700 backdrop-blur-sm p-4 rounded-xl flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]" />
                      <span className="text-slate-200 text-sm font-medium">Нужно наблюдение</span>
                    </div>
                    <div className="bg-slate-800/80 border border-slate-700 backdrop-blur-sm p-4 rounded-xl flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                      <span className="text-slate-200 text-sm font-medium">Студент в безопасности</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-6"><Calendar className="w-6 h-6 text-slate-700" /></div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Интерактивный Журнал</h3>
                <p className="text-slate-500 text-base leading-relaxed mb-6">Веб-аналог бумажного журнала, но гораздо удобнее. Выставляйте оценки парой кликов, отмечайте присутствие (Был / Опоздал / Не был / Уважительная) и оставляйте быстрые комментарии к каждому уроку.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-6"><BookOpen className="w-6 h-6 text-slate-700" /></div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Хранилище материалов (LMS)</h3>
                <p className="text-slate-500 text-base leading-relaxed mb-6">Прикрепляйте ссылки (YouTube), загружайте PDF, видео или картинки напрямую в курс. Студенты сразу видят их в своём приложении и учатся без скачивания на диск.</p>
              </div>

            </div>
          </section>

          {/* SECTION 3: GAMIFICATION */}
          <section id="students" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                <Gamepad2 className="w-6 h-6 text-rose-600" />
              </div>
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Геймификация Студентов</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-rose-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mb-6 border border-rose-100"><Zap className="w-6 h-6 text-rose-500" /></div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">Fire Streaks 🔥</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">Система побуждает учеников возвращаться: за регулярное обучение и посещение занятий они копят дни, которые визуально отображаются как огоньки в профиле. Пропуск урока — потеря стрика!</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-amber-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-6 border border-amber-100"><Crown className="w-6 h-6 text-amber-500" /></div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">Шкала XP и Лидерборды</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">Каждое выполненное ДЗ и пройденный тест дают XP. Набирая опыт, студенты конкурируют друг с другом в глобальном Leaderboard и переходят на новые Ранги (Новичок, Спец, Легенда).</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6 border border-indigo-100"><Gamepad2 className="w-6 h-6 text-indigo-500" /></div>
                <h3 className="text-xl font-bold text-slate-900 mb-4">Live Quiz Rooms</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">Анимационные живые Викторины для проектора прямо на занятии. Все студенты подключаются с телефонов по PIN-коду и отвечают на скорость (как в популярном Kahoot). Полный отчет в конце.</p>
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-blue-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-6"><Shield className="w-6 h-6 text-slate-700" /></div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Мультиарендность с Изоляцией</h3>
                <p className="text-slate-500 text-base leading-relaxed">Полная изоляция данных организаций на уровне NoSQL. Ваши студенты, транзакции и данные никогда не пересекаются с другими учебными центрами. Это гарантирует 100% приватность.</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-blue-500/10 transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-6"><UserPlus className="w-6 h-6 text-slate-700" /></div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Ролевая система (RBAC)</h3>
                <p className="text-slate-500 text-base leading-relaxed">Система уровней доступа: Owner, Admin, Teacher, Student. Учителя видят лишь свои группы, админы организовывают процессы, а владельцы могут просматривать финансы и аудит-логи безопасности.</p>
              </div>

              <div className="col-span-1 md:col-span-2 bg-gradient-to-r from-blue-900 to-indigo-900 p-10 md:p-14 rounded-[2rem] shadow-xl relative overflow-hidden flex flex-col md:flex-row gap-8 items-center group">
                <div className="absolute right-[-50px] top-[-50px] w-[300px] h-[300px] bg-indigo-500/20 rounded-full blur-[80px] pointer-events-none" />
                <div className="flex-1 text-left relative z-10">
                  <h3 className="text-3xl font-bold text-white mb-4">Финансовая Аналитика и Подписки</h3>
                  <p className="text-blue-100/70 text-base leading-relaxed mb-6 max-w-xl">Мощный биллинг в реальном времени: агрегация транзакций, графики прихода/расхода (Today, Week, Month, Year). Также, система включает автоматический Billing Guard: отключение SaaS аккаунта по истечении Trial/Pro периода с отсчетом таймера.</p>
                  <ul className="grid grid-cols-2 gap-3 text-sm font-medium text-white/90">
                    <li className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg border border-white/5 backdrop-blur-md">Учет Доходов</li>
                    <li className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg border border-white/5 backdrop-blur-md">Управленческие Расходы</li>
                    <li className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg border border-white/5 backdrop-blur-md">Trial & Stripe Ready</li>
                    <li className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg border border-white/5 backdrop-blur-md">Логи Транзакций</li>
                  </ul>
                </div>
                <div className="w-32 h-32 shrink-0 bg-white shadow-2xl rounded-3xl flex items-center justify-center border-4 border-indigo-200/30 relative z-10 group-hover:scale-105 transition-transform rotate-3 group-hover:rotate-0">
                  <BarChart3 className="w-16 h-16 text-indigo-600" />
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
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Секретное оружие</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 hover:shadow-xl transition-shadow flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100"><FileSpreadsheet className="w-6 h-6 text-slate-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Генератор Сертификатов (PDF)</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Выдача крутых онлайн-сертификатов по окончанию курса (в PDF формате). С уникальным QR-кодом для проверки подлинности на сайте платформы.</p>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 hover:shadow-xl transition-shadow flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100"><Image className="w-6 h-6 text-slate-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">UI Avatar Cropper</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Везде, где есть загрузка лого или аватарок — встроен идеальный редактор изображений (React Easy Crop). Все профили выглядят идеально, никаких кривых растянутых фотографий!</p>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 hover:shadow-xl transition-shadow flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100"><Briefcase className="w-6 h-6 text-slate-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Найм выпускников (Directory)</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Публичный каталог компаний и "Внутренний LinkedIn" для публикации актуальных вакансий, чтобы трудоустраивать ваших лучших студентов.</p>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 hover:shadow-xl transition-shadow flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100"><Shield className="w-6 h-6 text-slate-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Anti-Cheat System</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Блокировка жульничества студентов: предупреждение при попытке сменить вкладку с экзамена или скопировать/вставить чужой текст в поле ввода.</p>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-slate-200/60 hover:shadow-xl transition-shadow flex flex-col items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100"><MessageCircle className="w-6 h-6 text-slate-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Внутренние Workspaces</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">Discord-подобные каналы и директ-месседжи для каждой группы (Group Chat) с отправкой файлов и реалтайм оповещениями.</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-primary-600 to-indigo-600 p-8 rounded-3xl shadow-xl flex flex-col items-center justify-center gap-4 text-center group">
                <Rocket className="w-12 h-12 text-white group-hover:-translate-y-2 transition-transform" />
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">Начнем работу?</h3>
                  <p className="text-white/80 text-sm leading-relaxed mb-4">Вам понравились возможности Planula?</p>
                  <Link to="/register" className="bg-white text-primary-700 px-6 py-2.5 rounded-xl font-bold hover:bg-slate-50 transition-colors inline-block">Оформить предзаказ</Link>
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
// Include LineChart to fix TS errors
import { LineChart } from 'lucide-react';
