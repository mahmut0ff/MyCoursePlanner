import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, ClipboardList, Users, UserPlus, ChevronRight, CheckCircle2, X } from 'lucide-react';

interface Props {
  lessonsCount: number;
  examsCount: number;
  studentsCount?: number;
  teachersCount?: number;
  /** ISO date string of the organization's creation date. Used to limit onboarding to new orgs only. */
  orgCreatedAt?: string;
}

const ONBOARDING_DISMISS_KEY = 'planula_onboarding_dismissed';
const ONBOARDING_MAX_AGE_DAYS = 30;

/** Check whether the onboarding should be shown at all (new org, not dismissed) */
function shouldShowOnboarding(orgCreatedAt?: string): boolean {
  // If dismissed via localStorage, don't show
  if (typeof window !== 'undefined' && localStorage.getItem(ONBOARDING_DISMISS_KEY)) {
    return false;
  }
  // If we don't have orgCreatedAt, be safe and show
  if (!orgCreatedAt) return true;
  // Only show if org was created within last N days
  const created = new Date(orgCreatedAt).getTime();
  const now = Date.now();
  const daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);
  return daysSinceCreation <= ONBOARDING_MAX_AGE_DAYS;
}

/* ── Reusable hook for parent components to access onboarding progress ── */
export function useOnboardingProgress(props: Props) {
  const { lessonsCount, examsCount, studentsCount = 0, teachersCount = 0, orgCreatedAt } = props;
  const steps = [
    { done: lessonsCount > 0 },
    { done: examsCount > 0 },
    { done: teachersCount > 0 },
    { done: studentsCount > 0 },
  ];
  const completedCount = steps.filter(s => s.done).length;
  const totalSteps = steps.length;
  const progress = Math.round((completedCount / totalSteps) * 100);
  const allDone = completedCount === totalSteps;
  const visible = !allDone && shouldShowOnboarding(orgCreatedAt);
  return { completedCount, totalSteps, progress, allDone, visible };
}

const OnboardingWizard: React.FC<Props> = ({ lessonsCount, examsCount, studentsCount = 0, teachersCount = 0, orgCreatedAt }) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  const steps = [
    { key: 'lesson', title: t('onboarding.step1Title'), desc: t('onboarding.step1Desc'), icon: BookOpen, link: '/lessons/new', color: 'text-blue-500', bg: 'bg-blue-500/10', done: lessonsCount > 0 },
    { key: 'exam', title: t('onboarding.step2Title'), desc: t('onboarding.step2Desc'), icon: ClipboardList, link: '/exams/new', color: 'text-violet-500', bg: 'bg-violet-500/10', done: examsCount > 0 },
    { key: 'teacher', title: t('onboarding.step3Title'), desc: t('onboarding.step3Desc'), icon: UserPlus, link: '/teachers', color: 'text-emerald-500', bg: 'bg-emerald-500/10', done: teachersCount > 0 },
    { key: 'student', title: t('onboarding.step4Title'), desc: t('onboarding.step4Desc'), icon: Users, link: '/students', color: 'text-amber-500', bg: 'bg-amber-500/10', done: studentsCount > 0 },
  ];

  const completedCount = steps.filter(s => s.done).length;

  // Don't show if all done, manually dismissed, or org is too old
  if (completedCount === steps.length || dismissed || !shouldShowOnboarding(orgCreatedAt)) return null;

  const handleDismiss = () => {
    localStorage.setItem(ONBOARDING_DISMISS_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="relative">
      <button
        onClick={handleDismiss}
        className="absolute -top-2 -right-2 z-10 w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all shadow-sm"
        title={t('common.dismiss', 'Скрыть')}
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {steps.map((step, i) => (
          <Link
            key={step.key}
            to={step.done ? '#' : step.link}
            className={`group bg-white dark:bg-slate-800 border rounded-2xl p-5 transition-all ${
              step.done
                ? 'border-emerald-200 dark:border-emerald-800/50 opacity-60'
                : 'border-slate-200 dark:border-slate-700 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 hover:border-primary-200 dark:hover:border-primary-800'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-11 h-11 rounded-xl ${step.done ? 'bg-emerald-100 dark:bg-emerald-900/30' : step.bg} flex items-center justify-center shrink-0`}>
                {step.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <step.icon className={`w-5 h-5 ${step.color}`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">{t('onboarding.step')} {i + 1}</span>
                  {step.done && <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">{t('onboarding.done')}</span>}
                </div>
                <h3 className={`text-sm font-semibold mt-0.5 ${step.done ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>{step.title}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{step.desc}</p>
              </div>
              {!step.done && (
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default OnboardingWizard;
