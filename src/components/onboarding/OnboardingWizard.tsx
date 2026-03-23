import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, ClipboardList, Users, UserPlus, Sparkles, ChevronRight, CheckCircle2 } from 'lucide-react';

interface Props {
  lessonsCount: number;
  examsCount: number;
  studentsCount?: number;
  teachersCount?: number;
}

const OnboardingWizard: React.FC<Props> = ({ lessonsCount, examsCount, studentsCount = 0, teachersCount = 0 }) => {
  const { t } = useTranslation();

  const steps = [
    { key: 'lesson', title: t('onboarding.step1Title'), desc: t('onboarding.step1Desc'), icon: BookOpen, link: '/lessons/new', color: 'text-blue-500', bg: 'bg-blue-500/10', done: lessonsCount > 0 },
    { key: 'exam', title: t('onboarding.step2Title'), desc: t('onboarding.step2Desc'), icon: ClipboardList, link: '/exams/new', color: 'text-violet-500', bg: 'bg-violet-500/10', done: examsCount > 0 },
    { key: 'teacher', title: t('onboarding.step3Title'), desc: t('onboarding.step3Desc'), icon: UserPlus, link: '/teachers', color: 'text-emerald-500', bg: 'bg-emerald-500/10', done: teachersCount > 0 },
    { key: 'student', title: t('onboarding.step4Title'), desc: t('onboarding.step4Desc'), icon: Users, link: '/students', color: 'text-amber-500', bg: 'bg-amber-500/10', done: studentsCount > 0 },
  ];

  const completedCount = steps.filter(s => s.done).length;
  const progress = Math.round((completedCount / steps.length) * 100);

  if (completedCount === steps.length) return null;

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-violet-600 rounded-2xl p-6 md:p-8 text-white mb-6 relative overflow-hidden">
        <div className="absolute top-[-40px] right-[-40px] w-[160px] h-[160px] rounded-full bg-white/10" />
        <div className="absolute bottom-[-30px] left-[40%] w-[100px] h-[100px] rounded-full bg-white/5" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-amber-300" />
            <span className="text-sm font-medium text-white/80">{t('onboarding.badge')}</span>
          </div>
          <h2 className="text-2xl font-extrabold mb-2">{t('onboarding.title')}</h2>
          <p className="text-white/70 text-sm max-w-xl">{t('onboarding.subtitle')}</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 max-w-xs bg-white/20 rounded-full h-2">
              <div className="bg-white rounded-full h-2 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-sm font-semibold">{completedCount}/{steps.length}</span>
          </div>
        </div>
      </div>

      {/* Steps */}
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
