import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetDashboard } from '../../lib/api';
import type { LessonPlan, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { BookOpen, Radio, Trophy, XCircle, ArrowRight, Brain, Target, BarChart3, Flame, Building2, Search, Gamepad2 } from 'lucide-react';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import GamificationWidget from '../../components/gamification/GamificationWidget';
import StudentEnrollmentOnboarding from './StudentEnrollmentOnboarding';

const StudentDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { profile, organizationId } = useAuth();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasGroups, setHasGroups] = useState(true);

  useEffect(() => {
    if (profile?.uid && organizationId) {
      const load = async () => {
        try {
          const data = await apiGetDashboard();
          setLessons(data.recentLessons || []);
          setAttempts(data.recentAttempts || []);
          if (data.hasGroups === false) {
            setHasGroups(false);
          }
        } catch (e) {
          console.warn('Failed to load dashboard:', e);
        } finally {
          setLoading(false);
        }
      };
      load();
    } else {
      setLoading(false);
    }
  }, [profile?.uid, organizationId]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '🌅' : hour < 18 ? '☀️' : '🌙';

  // ═══ No Organization: Welcome + Discovery ═══
  if (!organizationId) {
    return (
      <div className="space-y-6">
        {/* Hero  */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-700 p-6 sm:p-10 text-white">
          <div className="absolute -top-16 -right-16 w-56 h-56 bg-white/5 rounded-full blur-2xl" />
          <div className="absolute bottom-0 left-1/4 w-40 h-40 bg-white/5 rounded-full blur-xl" />
          <div className="relative z-10">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">{greeting} {t('dashboard.welcome')}, {profile?.displayName?.split(' ')[0]}!</h1>
            <p className="text-violet-200 text-sm sm:text-base max-w-lg leading-relaxed">
              {t('student.welcomeMsg', 'Чтобы начать обучение, найдите и вступите в учебный центр. Это займёт всего пару секунд.')}
            </p>
            <Link
              to="/directory"
              className="inline-flex items-center gap-2 mt-5 px-5 py-3 bg-white text-violet-700 rounded-xl font-semibold text-sm hover:bg-violet-50 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-black/10"
            >
              <Search className="w-4 h-4" />
              {t('student.findOrg', 'Найти учебный центр')}
            </Link>
          </div>
        </div>

        {/* Gamification */}
        <GamificationWidget />

        {/* Global Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <Link to="/join" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 sm:p-6 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all group text-center hover:scale-[1.02] active:scale-[0.98]">
            <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Radio className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('rooms.join')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('rooms.enterCode')}</p>
          </Link>
          <Link to="/quiz/join" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 sm:p-6 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all group text-center hover:scale-[1.02] active:scale-[0.98]">
            <div className="w-12 h-12 bg-violet-500 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('nav.joinQuiz')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('student.joinQuizDesc', 'Введите код квиза')}</p>
          </Link>
          <Link to="/directory" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 sm:p-6 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all group text-center hover:scale-[1.02] active:scale-[0.98]">
            <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('nav.directory', 'Учебные центры')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('student.browseOrgsDesc', 'Каталог организаций')}</p>
          </Link>
        </div>
      </div>
    );
  }

  // ═══ Has Organization: Normal Dashboard ═══
  if (loading) return <DashboardSkeleton />;

  if (!hasGroups) {
    return <StudentEnrollmentOnboarding onComplete={() => setHasGroups(true)} />;
  }

  const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + (a.percentage || 0), 0) / attempts.length) : 0;
  const passRate = attempts.length > 0 ? Math.round((attempts.filter((a) => a.passed).length / attempts.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ═══ Hero Banner ═══ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-600 p-6 sm:p-8 text-white">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-white/5 rounded-full blur-xl" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{greeting} {t('dashboard.welcome')}, {profile?.displayName?.split(' ')[0]}!</h1>
            <p className="text-white/70 text-sm mt-1 flex items-center gap-1.5">
              <Flame className="w-4 h-4" />
              {t('studentDashboard.subtitle')}
            </p>
          </div>
          <Link to="/join" className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98] w-fit">
            <Radio className="w-4 h-4" />{t('rooms.join')}
          </Link>
        </div>
      </div>

      {/* Gamification */}
      <GamificationWidget />

      {/* ═══ Quick Actions ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Link to="/join" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 sm:p-6 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all group text-center hover:scale-[1.02] active:scale-[0.98]">
          <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <Radio className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('rooms.join')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('rooms.enterCode')}</p>
        </Link>
        <Link to="/lessons" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 sm:p-6 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all group text-center hover:scale-[1.02] active:scale-[0.98]">
          <div className="w-12 h-12 bg-violet-500 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('lessons.title')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{lessons.length} {t('studentDashboard.available')}</p>
        </Link>
        <Link to="/my-results" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 sm:p-6 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all group text-center hover:scale-[1.02] active:scale-[0.98]">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('nav.myResults')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{attempts.length} {t('studentDashboard.attempts')}</p>
        </Link>
      </div>

      {/* ═══ Stats ═══ */}
      {attempts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: t('studentDashboard.examsTaken'), value: attempts.length, icon: Target, iconBg: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200/50 dark:border-blue-800/40', text: 'text-blue-600 dark:text-blue-400' },
            { label: t('studentDashboard.avgScore'), value: `${avgScore}%`, icon: BarChart3, iconBg: 'bg-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200/50 dark:border-violet-800/40', text: 'text-violet-600 dark:text-violet-400' },
            { label: t('studentDashboard.passRate'), value: `${passRate}%`, icon: Trophy, iconBg: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200/50 dark:border-emerald-800/40', text: 'text-emerald-600 dark:text-emerald-400' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4 text-center transition-all hover:shadow-lg hover:scale-[1.02]`}>
              <div className={`${s.iconBg} w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mx-auto mb-2`}>
                <s.icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
              <p className={`text-[10px] sm:text-xs ${s.text} font-medium mt-0.5`}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Content ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Available Lessons */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('lessons.title')}</h2>
            <Link to="/lessons" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">{t('dashboard.viewAll')}<ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {lessons.slice(0, 5).map((l) => (
              <Link key={l.id} to={`/lessons/${l.id}`} className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <p className="font-medium text-slate-900 dark:text-white text-sm">{l.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l.subject} · {l.level}</p>
              </Link>
            ))}
            {lessons.length === 0 && <div className="px-5 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">{t('lessons.noLessons')}</div>}
          </div>
        </div>

        {/* Recent Results */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('exams.title')}</h2>
            <Link to="/my-results" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">{t('dashboard.viewAll')}<ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {attempts.slice(0, 5).map((a) => (
              <Link key={a.id} to={`/results/${a.id}`} className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {a.passed ? <Trophy className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                    <p className="font-medium text-slate-900 dark:text-white text-sm">{a.examTitle}</p>
                  </div>
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{a.percentage}%</p>
                </div>
                <div className="flex items-center gap-2 mt-1 ml-6">
                  {a.aiFeedback && <span className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400"><Brain className="w-3 h-3" />{t('studentDashboard.aiFeedback')}</span>}
                  <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(a.submittedAt)}</span>
                </div>
              </Link>
            ))}
            {attempts.length === 0 && <div className="px-5 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">{t('studentDashboard.noExams')}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
