import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { getLessonPlans } from '../../services/lessons.service';
import { getExams } from '../../services/exams.service';
import { getActiveRooms } from '../../services/rooms.service';
import {
  BookOpen, ClipboardList, Radio, UserCircle2, ChevronRight,
} from 'lucide-react';

interface Step {
  id: string;
  title: string;
  desc: string;
  icon: React.ElementType;
  link: string;
  done: boolean;
}

/**
 * Slim setup row: segmented progress + the next undone step as the action.
 * Replaces the old full-height checklist — at 3/4 done it was pushing real
 * content below the fold for the sake of three struck-through rows.
 */
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
  const allDone = completedCount === steps.length;
  const next = steps.find((s) => !s.done);

  if (loading || dismissed || allDone || !next) return null;

  const NextIcon = next.icon;
  const segments = steps.map((s) => (
    <div
      key={s.id}
      className={`h-1.5 flex-1 rounded-full ${s.done ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-700'}`}
    />
  ));
  const setupLabel = t('teacherOnboarding.setupLabel', {
    defaultValue: 'Настройка: {{done}} из {{total}}',
    done: completedCount,
    total: steps.length,
  });

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem('planula_teacher_onboarding_dismissed', 'true');
  };

  return (
    <section className="card px-4 sm:px-5 py-3">
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Progress: 4 segments + label (desktop) */}
        <div className="hidden sm:block w-32 shrink-0">
          <div className="flex gap-1 mb-1.5">{segments}</div>
          <p className="text-[11px] leading-none text-slate-500 dark:text-slate-400">{setupLabel}</p>
        </div>

        {/* Next step = the row's action */}
        <Link to={next.link} className="flex-1 min-w-0 flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
            <NextIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{next.title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{next.desc}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
        </Link>

        <button
          onClick={dismiss}
          className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0"
        >
          {t('teacherOnboarding.dismiss', 'Скрыть')}
        </button>
      </div>

      {/* Progress on mobile */}
      <div className="sm:hidden mt-2.5 flex items-center gap-2.5">
        <div className="flex gap-1 flex-1">{segments}</div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">{completedCount}/{steps.length}</p>
      </div>
    </section>
  );
};

export default TeacherOnboardingWizard;
