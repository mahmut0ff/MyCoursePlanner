import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeft, ArrowRight, Sparkles, Brain, Code2, ShieldCheck,
  GitBranch, MessageSquareCode, Rocket, Bug, Eye, Layers,
  Zap, BookOpen, Terminal, Lightbulb, Target, CheckCircle2,
} from 'lucide-react';
import LanguageSwitcher from '../../components/LanguageSwitcher';

/**
 * Открытая (публичная) страница «Что должен знать вайбкодер».
 * Контент пока зашит напрямую — по ходу дела дополним и вынесем в i18n.
 */
const VibecoderPage: React.FC = () => {
  const { t } = useTranslation();
  const { firebaseUser: user } = useAuth();

  const principles = [
    {
      icon: MessageSquareCode,
      color: 'from-indigo-500 to-violet-600',
      title: 'Чёткий промпт — половина результата',
      desc: 'ИИ не читает мысли. Описывай контекст, цель, ограничения и формат ответа. Чем конкретнее запрос — тем меньше итераций и переписываний.',
    },
    {
      icon: Eye,
      color: 'from-rose-500 to-pink-600',
      title: 'Читай то, что сгенерировал',
      desc: 'Вайбкодинг — это не «слепое доверие». Прежде чем вставить код в проект, пойми, что он делает. Непонятный код — это будущий баг.',
    },
    {
      icon: Layers,
      color: 'from-amber-500 to-orange-600',
      title: 'Дроби задачи на маленькие шаги',
      desc: 'Большая фича = десяток мелких. Маленькие задачи проще описать, проще проверить и проще откатить, если что-то пошло не так.',
    },
    {
      icon: GitBranch,
      color: 'from-emerald-500 to-teal-600',
      title: 'Коммить часто, откатывайся смело',
      desc: 'Git — твоя страховка. Рабочее состояние — в коммит. Сломал? Откатился. Без version control вайбкодинг превращается в рулетку.',
    },
    {
      icon: ShieldCheck,
      color: 'from-cyan-500 to-blue-600',
      title: 'Безопасность — не опция',
      desc: 'Не коммить ключи и пароли. Проверяй права доступа, валидацию ввода и зависимости. ИИ может предложить уязвимый паттерн — последнее слово за тобой.',
    },
    {
      icon: Bug,
      color: 'from-fuchsia-500 to-purple-600',
      title: 'Тестируй, а не надейся',
      desc: '«Выглядит правильно» ≠ «работает». Запусти, проверь крайние случаи, прочитай ошибки. Тесты экономят часы отладки.',
    },
  ];

  const skills = [
    { icon: Terminal, label: 'Основы терминала', text: 'cd, ls, git, запуск проекта — без этого никуда.' },
    { icon: GitBranch, label: 'Git и ветки', text: 'commit, branch, revert, merge-конфликты.' },
    { icon: Brain, label: 'Работа с ИИ', text: 'Промптинг, контекст, итеративный диалог.' },
    { icon: Code2, label: 'Чтение кода', text: 'Понимать чужой и сгенерированный код.' },
    { icon: ShieldCheck, label: 'Базовая безопасность', text: 'Секреты, .env, валидация, зависимости.' },
    { icon: Bug, label: 'Отладка', text: 'Читать стектрейсы, искать причину, а не симптом.' },
    { icon: BookOpen, label: 'Документация', text: 'Гуглить, читать доки, проверять версии.' },
    { icon: Target, label: 'Декомпозиция', text: 'Разбивать большое на понятные шаги.' },
  ];

  const commandments = [
    'Понимай, что ты деплоишь — не вставляй код, который не читал.',
    'Один коммит — одно осмысленное изменение.',
    'Проверяй вывод ИИ так же, как код стажёра: с уважением, но без слепого доверия.',
    'Секреты живут в .env, а не в коде и не в чате.',
    'Если не можешь объяснить, как это работает — ты ещё не закончил.',
    'Сначала рабочая версия, потом красивая. Но обязательно обе.',
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      {/* Scoped animations */}
      <style>{`
        @keyframes vc-float {
          0%, 100% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(-24px) translateX(12px); }
        }
        @keyframes vc-float-slow {
          0%, 100% { transform: translateY(0) translateX(0) scale(1); }
          50% { transform: translateY(20px) translateX(-16px) scale(1.08); }
        }
        @keyframes vc-rise {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes vc-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes vc-pulse-ring {
          0% { transform: scale(0.9); opacity: 0.7; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { opacity: 0; }
        }
        .vc-rise { opacity: 0; animation: vc-rise 0.6s cubic-bezier(0.16,1,0.3,1) forwards; }
        .vc-blob { will-change: transform; }
        .vc-blob-a { animation: vc-float 9s ease-in-out infinite; }
        .vc-blob-b { animation: vc-float-slow 11s ease-in-out infinite; }
        .vc-gradient-text {
          background: linear-gradient(110deg, #4f46e5, #8b5cf6, #ec4899, #4f46e5);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: vc-shimmer 6s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .vc-rise, .vc-blob-a, .vc-blob-b, .vc-gradient-text { animation: none !important; opacity: 1; }
          .vc-rise { transform: none; }
        }
      `}</style>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/icons/logo.png" alt="Planula" className="h-8 w-auto object-contain" />
            <span className="font-bold text-lg">Planula</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {user ? (
              <Link to="/dashboard" className="text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 px-5 py-2.5 rounded-xl shadow-lg shadow-primary-500/20 transition-all">{t('nav.dashboard') || 'Dashboard'}</Link>
            ) : (
              <>
                <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 transition-colors">{t('auth.login')}</Link>
                <Link to="/register" className="text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 px-5 py-2.5 rounded-xl shadow-lg shadow-primary-500/20 transition-all">{t('landing.heroCta')}</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50 via-violet-50/60 to-white" />
        <div className="vc-blob vc-blob-a absolute top-10 -left-20 w-80 h-80 bg-indigo-300/40 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="vc-blob vc-blob-b absolute top-24 right-0 w-96 h-96 bg-fuchsia-300/40 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="vc-blob vc-blob-a absolute -bottom-10 left-1/3 w-72 h-72 bg-amber-200/40 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-600 mb-8 transition-colors vc-rise">
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </Link>

          <div className="vc-rise" style={{ animationDelay: '0.05s' }}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/70 backdrop-blur border border-primary-100 text-primary-700 text-sm font-semibold shadow-sm mb-6">
              <Sparkles className="w-4 h-4" /> Гайд для вайбкодера
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 vc-rise" style={{ animationDelay: '0.1s' }}>
            Что должен знать <span className="vc-gradient-text">вайбкодер</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto mb-10 vc-rise" style={{ animationDelay: '0.18s' }}>
            Вайбкодинг — это создание продуктов в диалоге с ИИ. Скорость впечатляет, но без базовых
            принципов «вайб» быстро превращается в хаос. Вот фундамент, на котором держится здоровый процесс.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 vc-rise" style={{ animationDelay: '0.26s' }}>
            <a href="#principles" className="group bg-primary-600 hover:bg-primary-700 text-white font-semibold px-7 py-3.5 rounded-xl shadow-xl shadow-primary-500/25 hover:shadow-primary-500/40 transition-all flex items-center gap-2">
              <Zap className="w-5 h-5" /> Принципы
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a href="#skills" className="text-slate-700 hover:text-slate-900 font-medium px-6 py-3.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white/60 backdrop-blur transition-all flex items-center gap-2">
              <Lightbulb className="w-5 h-5" /> Навыки
            </a>
          </div>
        </div>
      </header>

      {/* Principles */}
      <section id="principles" className="px-6 py-20 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-3">6 принципов вайбкодинга</h2>
            <p className="text-slate-500 text-lg">Не правила ради правил, а то, что бережёт время и нервы.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {principles.map((p, i) => (
              <div
                key={i}
                className="vc-rise group relative bg-white rounded-3xl p-7 border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 overflow-hidden"
                style={{ animationDelay: `${0.06 * i}s` }}
              >
                <div className={`absolute -top-16 -right-16 w-40 h-40 bg-gradient-to-br ${p.color} opacity-0 group-hover:opacity-10 blur-2xl rounded-full transition-opacity duration-500`} />
                <div className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${p.color} flex items-center justify-center shadow-lg mb-5 group-hover:scale-110 group-hover:rotate-3 transition-transform`}>
                  <p.icon className="w-6 h-6 text-white" />
                  <span className="absolute top-3 right-3 text-5xl font-black text-slate-100 -z-10 group-hover:text-slate-200 transition-colors select-none" aria-hidden>{i + 1}</span>
                </div>
                <h3 className="text-lg font-bold mb-2 text-slate-900">{p.title}</h3>
                <p className="text-slate-600 leading-relaxed text-[15px]">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Skills */}
      <section id="skills" className="px-6 py-20 bg-gradient-to-b from-slate-50 to-white scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-3">Минимальный набор навыков</h2>
            <p className="text-slate-500 text-lg">Можно не быть сеньором. Но эти вещи знать придётся.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {skills.map((s, i) => (
              <div
                key={i}
                className="vc-rise group bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-lg hover:border-primary-200 transition-all duration-300"
                style={{ animationDelay: `${0.05 * i}s` }}
              >
                <div className="w-11 h-11 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center mb-4 group-hover:bg-primary-600 group-hover:text-white transition-colors">
                  <s.icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 mb-1">{s.label}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Commandments */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-[#0f172a] rounded-[2rem] p-8 md:p-14 overflow-hidden">
            <div className="absolute top-0 left-0 w-72 h-72 bg-primary-600/30 blur-3xl rounded-full -ml-20 -mt-20 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-72 h-72 bg-fuchsia-600/20 blur-3xl rounded-full -mr-20 -mb-20 pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                  <Rocket className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-white">Заповеди вайбкодера</h2>
              </div>
              <ul className="space-y-4">
                {commandments.map((c, i) => (
                  <li
                    key={i}
                    className="vc-rise flex items-start gap-4 text-slate-200 group"
                    style={{ animationDelay: `${0.08 * i}s` }}
                  >
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                    <span className="text-base md:text-lg leading-relaxed">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold mb-4">Готов вайбкодить осознанно?</h2>
          <p className="text-slate-500 text-lg mb-8">Это живой документ — мы будем дополнять его по ходу дела. Начни строить уже сейчас.</p>
          <Link to={user ? '/dashboard' : '/register'} className="group inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3.5 rounded-xl shadow-xl shadow-primary-500/25 hover:shadow-primary-500/40 transition-all">
            {user ? (t('nav.dashboard') || 'Dashboard') : t('landing.heroCta')}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0f172a] text-white py-8 px-6 text-center mt-auto">
        <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} Planula. {t('landing.rights')}</p>
      </footer>
    </div>
  );
};

export default VibecoderPage;
