import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { getLessonPlans } from '../../services/lessons.service';
import { getExams } from '../../services/exams.service';
import { getActiveRooms } from '../../services/rooms.service';
import { getAllAttempts } from '../../services/attempts.service';
import type { LessonPlan, Exam, ExamRoom, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { BookOpen, ClipboardList, Radio, Users, TrendingUp, ArrowRight, Plus, Sparkles } from 'lucide-react';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import OnboardingWizard from '../../components/onboarding/OnboardingWizard';

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLessonPlans(), getExams(), getActiveRooms(), getAllAttempts()])
      .then(([l, e, r, a]) => { setLessons(l); setExams(e); setRooms(r); setAttempts(a); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;

  const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length) : 0;

  const stats = [
    { label: t('dashboard.totalLessons'), value: lessons.length, icon: BookOpen, gradient: 'from-blue-500 to-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200/50 dark:border-blue-800/40', iconBg: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
    { label: t('dashboard.totalExams'), value: exams.length, icon: ClipboardList, gradient: 'from-violet-500 to-violet-600', bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200/50 dark:border-violet-800/40', iconBg: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400' },
    { label: t('dashboard.activeRooms'), value: rooms.length, icon: Radio, gradient: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200/50 dark:border-emerald-800/40', iconBg: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
    { label: t('dashboard.examAttempts'), value: `${avgScore}%`, icon: TrendingUp, gradient: 'from-amber-500 to-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200/50 dark:border-amber-800/40', iconBg: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '🌅 ' + t('dashboard.goodMorning', 'Доброе утро') : hour < 18 ? '☀️ ' + t('dashboard.goodAfternoon', 'Добрый день') : '🌙 ' + t('dashboard.goodEvening', 'Добрый вечер');

  return (
    <div className="space-y-6">
      {/* ═══ Hero Banner ═══ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-6 sm:p-8 text-white">
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-white/5 rounded-full blur-xl" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{greeting}, {profile?.displayName?.split(' ')[0]}!</h1>
            <p className="text-white/70 text-sm mt-1 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              {t('dashboard.subtitle', 'Управляйте вашим учебным центром')}
            </p>
          </div>
          <Link to="/lessons/new" className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98] w-fit">
            <Plus className="w-4 h-4" />{t('dashboard.createLesson')}
          </Link>
        </div>
      </div>

      {/* Onboarding */}
      <OnboardingWizard lessonsCount={lessons.length} examsCount={exams.length} />

      {/* ═══ Stat Cards ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4 sm:p-5 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]`}>
            <div className="flex items-start gap-3">
              <div className={`${s.iconBg} w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0`}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-none">{s.value}</p>
                <p className={`text-xs mt-1 ${s.text} font-medium`}>{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Content Grid ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Lessons */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('lessons.title')}</h2>
            <Link to="/lessons" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">{t('dashboard.viewAll')}<ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {lessons.slice(0, 5).map((l) => (
              <Link key={l.id} to={`/lessons/${l.id}`} className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <p className="font-medium text-slate-900 dark:text-white text-sm">{l.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l.subject} · {formatDate(l.createdAt)}</p>
              </Link>
            ))}
            {lessons.length === 0 && <div className="px-5 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">{t('lessons.noLessons')}</div>}
          </div>
        </div>

        {/* Recent Exams */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('exams.title')}</h2>
            <Link to="/exams" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">{t('dashboard.viewAll')}<ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {exams.slice(0, 5).map((e) => (
              <Link key={e.id} to={`/exams/${e.id}`} className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-900 dark:text-white text-sm">{e.title}</p>
                  <span className={e.status === 'published' ? 'badge-green text-xs' : 'badge-yellow text-xs'}>{t(`exams.${e.status}`)}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{e.subject} · {e.questionCount || 0} {t('exams.questions')}</p>
              </Link>
            ))}
            {exams.length === 0 && <div className="px-5 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">{t('exams.noExams')}</div>}
          </div>
        </div>

        {/* Active Rooms */}
        {rooms.length > 0 && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('rooms.title')}</h2>
              <Link to="/rooms" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">{t('dashboard.viewAll')}<ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {rooms.slice(0, 5).map((r) => (
                <Link key={r.id} to={`/rooms/${r.id}`} className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
                      <p className="font-medium text-slate-900 dark:text-white text-sm">{r.examTitle}</p>
                    </div>
                    <span className="font-mono text-xs text-primary-600 dark:text-primary-400">{r.code}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1"><Users className="w-3 h-3" />{r.participants.length} {t('dashboard.participants')}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Results */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('dashboard.recentResults')}</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {attempts.slice(0, 5).map((a) => (
              <div key={a.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{a.studentName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{a.examTitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900 dark:text-white">{a.percentage}%</p>
                    <span className={`text-xs ${a.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{a.passed ? t('dashboard.pass') : t('dashboard.fail')}</span>
                  </div>
                </div>
              </div>
            ))}
            {attempts.length === 0 && <div className="px-5 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">{t('dashboard.noResults')}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
