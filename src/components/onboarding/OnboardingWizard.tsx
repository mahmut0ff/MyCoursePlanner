import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Palette, Bot, Grid, ChevronRight, CheckCircle2, X } from 'lucide-react';

interface Props {
  orgData?: any;
  branchData?: any;
  orgCreatedAt?: any;
}

const ONBOARDING_DISMISS_KEY = 'planula_onboarding_admin_dismissed';
const ONBOARDING_MAX_AGE_DAYS = 30;

/** Check whether the onboarding should be shown at all (new org, not dismissed) */
function shouldShowOnboarding(orgCreatedAt?: any): boolean {
  if (typeof window !== 'undefined' && localStorage.getItem(ONBOARDING_DISMISS_KEY)) {
    return false;
  }
  if (!orgCreatedAt) return true;
  
  let created = NaN;
  if (typeof orgCreatedAt === 'string' || typeof orgCreatedAt === 'number') {
    created = new Date(orgCreatedAt).getTime();
  } else if (orgCreatedAt && typeof orgCreatedAt === 'object') {
    if (orgCreatedAt.seconds) created = orgCreatedAt.seconds * 1000;
    else if (orgCreatedAt._seconds) created = orgCreatedAt._seconds * 1000;
    else if (typeof orgCreatedAt.toDate === 'function') created = orgCreatedAt.toDate().getTime();
    else if (typeof orgCreatedAt.getTime === 'function') created = orgCreatedAt.getTime();
  }

  if (isNaN(created)) return true;

  const now = Date.now();
  const daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);
  return daysSinceCreation <= ONBOARDING_MAX_AGE_DAYS;
}

/* ── Reusable hook for parent components to access onboarding progress ── */
export function useOnboardingProgress(props: Props) {
  const { orgData, branchData, orgCreatedAt } = props;
  const steps = [
    { done: !!orgData?.name && orgData.name !== 'New Organization' },
    { done: !!orgData?.branding?.logoUrl },
    { done: !!orgData?.aiSettings?.telegramBotToken || !!orgData?.aiEnabled },
    { done: !!branchData?.branches && branchData.branches.length > 0 },
  ];
  const completedCount = steps.filter(s => s.done).length;
  const totalSteps = steps.length;
  const progress = Math.round((completedCount / totalSteps) * 100);
  const allDone = completedCount === totalSteps;
  const visible = !allDone && shouldShowOnboarding(orgCreatedAt);
  return { completedCount, totalSteps, progress, allDone, visible };
}

const OnboardingWizard: React.FC<Props> = ({ orgData, branchData, orgCreatedAt }) => {
  const [dismissed, setDismissed] = useState(false);

  const steps = [
    { key: 'profile', title: 'Профиль проекта', desc: 'Укажите название учебного центра', icon: Building2, link: '/org-settings?tab=general', color: 'text-blue-500', bg: 'bg-blue-500/10', done: !!orgData?.name && orgData.name !== 'New Organization' },
    { key: 'branding', title: 'Брендинг', desc: 'Загрузите логотип и выберите цвета системы', icon: Palette, link: '/org-settings?tab=branding', color: 'text-violet-500', bg: 'bg-violet-500/10', done: !!orgData?.branding?.logoUrl },
    { key: 'ai', title: 'AI Ассистент', desc: 'Настройте Telegram-бота для учеников', icon: Bot, link: '/org-settings?tab=ai', color: 'text-emerald-500', bg: 'bg-emerald-500/10', done: !!orgData?.aiSettings?.telegramBotToken || !!orgData?.aiEnabled },
    { key: 'branches', title: 'Филиалы', desc: 'Добавьте адреса проведения занятий', icon: Grid, link: '/branches', color: 'text-amber-500', bg: 'bg-amber-500/10', done: !!branchData?.branches && branchData.branches.length > 0 },
  ];

  const completedCount = steps.filter(s => s.done).length;
  const progress = Math.round((completedCount / steps.length) * 100);

  // Don't show if all done, manually dismissed, or org is too old
  if (completedCount === steps.length || dismissed || !shouldShowOnboarding(orgCreatedAt)) return null;

  const handleDismiss = () => {
    localStorage.setItem(ONBOARDING_DISMISS_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden relative">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="p-6 md:p-10 flex flex-col lg:flex-row gap-8 lg:gap-16">
        
        {/* Left Column: Intro & Setup Progress */}
        <div className="xl:w-5/12 flex flex-col justify-between">
          <div>
            <div className="w-fit inline-flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold mb-5">
              <span className="text-sm">🚀</span>
              Быстрый старт
            </div>
            
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
              Добро пожаловать в рабочее пространство
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-6">
              Для успешного запуска платформы необходимо выполнить ряд базовых шагов. Мы подготовили для вас простой чек-лист.
            </p>
          </div>

          <div>
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700/50">
              <div className="flex items-end justify-between mb-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900 dark:text-white">
                    {progress}%
                  </span>
                </div>
                <span className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">завершено</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="mt-6 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors flex items-center gap-1.5"
            >
              Пропустить пока <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Checklists */}
        <div className="xl:w-7/12 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {steps.map((step, i) => (
            <Link
              key={step.key}
              to={step.done ? '#' : step.link}
              className={`group flex flex-col p-5 rounded-xl border transition-all ${
                step.done
                  ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30 cursor-default'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  step.done 
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' 
                    : 'bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}>
                  {step.done ? <CheckCircle2 className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Шаг {i + 1}</span>
                  {step.done && (
                    <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-md">
                      Выполнено
                    </span>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className={`text-sm font-semibold mb-1.5 ${step.done ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-900 dark:text-white'}`}>
                  {step.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                  {step.desc}
                </p>
              </div>

              <div className="mt-auto">
                {!step.done ? (
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    Приступить <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-500 flex items-center gap-1">
                    Готово <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
