import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { getLessonPlans } from '../../services/lessons.service';
import { getExams } from '../../services/exams.service';
import { getActiveRooms } from '../../services/rooms.service';
import {
  CheckCircle2, BookOpen, ClipboardList, Radio, UserCircle2,
  Sparkles, ChevronRight, Rocket,
} from 'lucide-react';

interface Step {
  id: string;
  title: string;
  desc: string;
  icon: React.ElementType;
  link: string;
  done: boolean;
}

const TeacherOnboardingWizard: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [lessons, setLessons] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('planula_teacher_onboarding_dismissed') === 'true'
  );

  useEffect(() => {
    Promise.all([
      getLessonPlans().catch(() => []),
      getExams().catch(() => []),
      getActiveRooms().catch(() => []),
    ]).then(([l, e, r]) => {
      setLessons(l || []);
      setExams(e || []);
      setRooms(r || []);
    }).finally(() => setLoading(false));
  }, []);

  const steps: Step[] = useMemo(() => [
    {
      id: 'profile',
      title: t('teacherOnboarding.step1', 'Заполните профиль'),
      desc: t('teacherOnboarding.step1Desc', 'Добавьте фото, предметы и опыт'),
      icon: UserCircle2,
      link: '/teacher-profile',
      done: Boolean(profile?.displayName && (profile as any)?.bio),
    },
    {
      id: 'lesson',
      title: t('teacherOnboarding.step2', 'Создайте первый урок'),
      desc: t('teacherOnboarding.step2Desc', 'Добавьте материалы и контент'),
      icon: BookOpen,
      link: '/lessons/new',
      done: lessons.length > 0,
    },
    {
      id: 'exam',
      title: t('teacherOnboarding.step3', 'Создайте тест'),
      desc: t('teacherOnboarding.step3Desc', 'Настройте вопросы и ответы'),
      icon: ClipboardList,
      link: '/exams/new',
      done: exams.length > 0,
    },
    {
      id: 'room',
      title: t('teacherOnboarding.step4', 'Запустите экзамен'),
      desc: t('teacherOnboarding.step4Desc', 'Откройте комнату для студентов'),
      icon: Radio,
      link: '/rooms',
      done: rooms.length > 0,
    },
  ], [lessons, exams, rooms, profile, t]);

  const completedCount = steps.filter((s) => s.done).length;
  const progressPercent = (completedCount / steps.length) * 100;
  const allDone = completedCount === steps.length;

  if (loading || dismissed || allDone) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-200/50 dark:border-emerald-800/30 bg-gradient-to-br from-emerald-50 via-teal-50 to-white dark:from-emerald-950/20 dark:via-teal-950/10 dark:to-slate-800/50 shadow-lg shadow-emerald-500/5 mb-6">
      {/* Decorative Background */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-400/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/4 w-24 h-24 bg-teal-400/10 rounded-full blur-2xl" />

      {/* Header */}
      <div className="relative z-10 px-6 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/20">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {t('teacherOnboarding.title', 'Начните работу')}
              <Sparkles className="w-4 h-4 text-emerald-500" />
            </h3>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {completedCount}/{steps.length} {t('teacherOnboarding.stepsCompleted', 'шагов выполнено')}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            localStorage.setItem('planula_teacher_onboarding_dismissed', 'true');
          }}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          {t('teacherOnboarding.dismiss', 'Скрыть')}
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mx-6 mb-4 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Steps */}
      <div className="px-4 pb-5 space-y-2">
        {steps.map((step, i) => {
          const StepIcon = step.icon;
          const isNext = !step.done && steps.slice(0, i).every((s) => s.done);

          return (
            <Link
              key={step.id}
              to={step.link}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-all group ${
                step.done
                  ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200/50 dark:border-emerald-800/30 opacity-70'
                  : isNext
                  ? 'bg-white dark:bg-slate-800 border-emerald-300 dark:border-emerald-700 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-400/20'
                  : 'bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {/* Status Icon */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                step.done
                  ? 'bg-emerald-500 text-white'
                  : isNext
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
              }`}>
                {step.done
                  ? <CheckCircle2 className="w-4 h-4" />
                  : <StepIcon className="w-4 h-4" />
                }
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${
                  step.done
                    ? 'text-emerald-700 dark:text-emerald-400 line-through'
                    : 'text-slate-900 dark:text-white'
                }`}>
                  {step.title}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{step.desc}</p>
              </div>

              {/* Arrow */}
              {!step.done && (
                <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${
                  isNext ? 'text-emerald-500 group-hover:translate-x-1' : 'text-slate-300 dark:text-slate-600'
                }`} />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default TeacherOnboardingWizard;
