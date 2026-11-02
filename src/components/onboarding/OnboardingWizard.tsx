import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Users, Calendar, Settings2, Layers, ChevronRight, CheckCircle2, X } from 'lucide-react';

interface Props {
  orgData?: any;
  branchData?: any;
  orgCreatedAt?: any;
  dashStats?: any;
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

/* ── Operational readiness signals (shared by hook + wizard) ── */
function getOnboardingSteps(orgData: any, dashStats: any) {
  const configured = !!orgData?.institutionType
    && !!orgData?.name && orgData.name !== 'New Organization'
    && (!!orgData?.logo || !!orgData?.primaryColor || !!orgData?.branding?.logoUrl);
  return [
    { done: (dashStats?.totalCourses || 0) > 0 },
    { done: (dashStats?.totalGroups || 0) > 0 },
    { done: (dashStats?.totalStudents || 0) > 0 },
    { done: (dashStats?.totalScheduleEvents || 0) > 0 },
    { done: configured },
  ];
}

/* ── Reusable hook for parent components to access onboarding progress ── */
export function useOnboardingProgress(props: Props) {
  const { orgData, orgCreatedAt, dashStats } = props;
  const steps = getOnboardingSteps(orgData, dashStats);
  const completedCount = steps.filter(s => s.done).length;
  const totalSteps = steps.length;
  const progress = Math.round((completedCount / totalSteps) * 100);
  const allDone = completedCount === totalSteps;
  const visible = !allDone && shouldShowOnboarding(orgCreatedAt);
  return { completedCount, totalSteps, progress, allDone, visible };
}

const OnboardingWizard: React.FC<Props> = ({ orgData, orgCreatedAt, dashStats }) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  const done = getOnboardingSteps(orgData, dashStats).map(s => s.done);
  const steps = [
    { key: 'course', title: t('onboarding.admin.course.title', 'Создайте курс'), desc: t('onboarding.admin.course.desc', 'Например «Английский», «Математика» — с ценой и форматом оплаты'), icon: FolderOpen, link: '/courses', color: 'text-indigo-500', bg: 'bg-indigo-500/10', done: done[0] },
    { key: 'group', title: t('onboarding.admin.group.title', 'Добавьте группу'), desc: t('onboarding.admin.group.desc', 'Группа учеников внутри курса (поток, смена)'), icon: Layers, link: '/groups', color: 'text-blue-500', bg: 'bg-blue-500/10', done: done[1] },
    { key: 'students', title: t('onboarding.admin.students.title', 'Добавьте учеников'), desc: t('onboarding.admin.students.desc', 'Вручную, импортом из Excel или по ссылке-приглашению'), icon: Users, link: '/students', color: 'text-emerald-500', bg: 'bg-emerald-500/10', done: done[2] },
    { key: 'schedule', title: t('onboarding.admin.schedule.title', 'Составьте расписание'), desc: t('onboarding.admin.schedule.desc', 'Поставьте занятия группам в недельной сетке'), icon: Calendar, link: '/schedule', color: 'text-amber-500', bg: 'bg-amber-500/10', done: done[3] },
    { key: 'profile', title: t('onboarding.admin.profile.title', 'Профиль и брендинг'), desc: t('onboarding.admin.profile.desc', 'Тип заведения, название, логотип и цвета'), icon: Settings2, link: '/org-settings?tab=general', color: 'text-violet-500', bg: 'bg-violet-500/10', done: done[4] },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-4xl max-h-[90vh] overflow-y-auto relative">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors z-10"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        
        <div className="p-4 md:p-6 flex flex-col lg:flex-row gap-6 lg:gap-8">
        
        {/* Left Column: Intro & Setup Progress */}
        <div className="xl:w-5/12 flex flex-col justify-between">
          <div>
            <div className="w-fit inline-flex items-center gap-1.5 h-5 px-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs font-medium mb-3">
              <span className="text-xs">🚀</span>
              {t('onboarding.admin.badge', 'Быстрый старт')}
            </div>
            
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
              {t('onboarding.admin.title', 'Добро пожаловать в рабочее пространство')}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4">
              {t('onboarding.admin.subtitle', 'Для успешного запуска платформы необходимо выполнить ряд базовых шагов. Мы подготовили для вас простой чек-лист.')}
            </p>
          </div>

          <div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
              <div className="flex items-end justify-between mb-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {progress}%
                  </span>
                </div>
                <span className="text-slate-500 dark:text-slate-400 text-xs mb-1">{t('onboarding.admin.completed', 'завершено')}</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="btn-ghost mt-3 -ml-3 inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"
            >
              {t('onboarding.admin.skip', 'Пропустить пока')} <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Column: Checklists */}
        <div className="xl:w-7/12 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {steps.map((step, i) => (
            <Link
              key={step.key}
              to={step.done ? '#' : step.link}
              className={`group flex flex-col p-4 rounded-lg border transition-colors ${
                step.done
                  ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 cursor-default'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
                  step.done 
                    ? 'text-emerald-600 dark:text-emerald-400' 
                    : 'text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}>
                  {step.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <step.icon className="w-3.5 h-3.5" />}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">{t('onboarding.admin.step', 'Шаг {{n}}', { n: i + 1 })}</span>
                  {step.done && (
                    <span className="inline-flex items-center h-5 px-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                      {t('onboarding.admin.stepDone', 'Выполнено')}
                    </span>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className={`text-sm font-semibold mb-1 ${step.done ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-900 dark:text-slate-100'}`}>
                  {step.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                  {step.desc}
                </p>
              </div>

              <div className="mt-auto">
                {!step.done ? (
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">
                    {t('onboarding.admin.start', 'Приступить')} <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    {t('onboarding.admin.ready', 'Готово')} <CheckCircle2 className="w-3.5 h-3.5" />
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
