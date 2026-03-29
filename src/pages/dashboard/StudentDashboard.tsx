import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetDashboard } from '../../lib/api';
import type { LessonPlan, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { BookOpen, Radio, Trophy, XCircle, Brain, Target, BarChart3, Flame, Building2, Search, Gamepad2, Play } from 'lucide-react';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import GamificationWidget from '../../components/gamification/GamificationWidget';
import LeaderboardWidget from '../../components/gamification/LeaderboardWidget';
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
      <div className="space-y-6 sm:space-y-8">
        {/* Kahoot-style Premium Hero Banner */}
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#46178F] via-[#5C1FB5] to-[#46178F] p-8 sm:p-12 text-white shadow-2xl shadow-purple-900/20">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-white/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
          <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto">
            <h1 className="kahoot-font text-4xl sm:text-5xl font-extrabold mb-4 tracking-tight drop-shadow-md">
              {greeting} {t('dashboard.welcome')}, {profile?.displayName?.split(' ')[0]}!
            </h1>
            <p className="text-white/90 text-lg sm:text-xl font-medium leading-relaxed mb-6">
              {t('studentDashboard.heroTitleNoOrg')}
            </p>
            <Link
              to="/directory"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[#46178F] rounded-2xl font-bold text-lg hover:bg-slate-50 shadow-[0_6px_0_#94a3b8] active:translate-y-[4px] active:shadow-[0_2px_0_#94a3b8] transition-all"
            >
              <Search className="w-5 h-5" />
              {t('studentDashboard.findCenterBtn')}
            </Link>
          </div>
        </div>

        {/* Gamification */}
        <GamificationWidget />

        {/* Global Quick Actions (Kahoot Style) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
          {/* Action 1: Join Live Room (Red) */}
          <Link to="/join" className="bg-[#E21B3C] hover:bg-[#c61834] text-white p-5 sm:p-6 rounded-[2rem] shadow-[0_8px_0_#9d1228] active:translate-y-[6px] active:shadow-[0_2px_0_#9d1228] transition-all group flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-6 transition-transform">
              <Play className="w-8 h-8 text-white fill-white" />
            </div>
            <h3 className="kahoot-font text-xl font-bold mb-1 tracking-wide">{t('studentDashboard.joinLiveRoom')}</h3>
            <p className="text-sm text-white/80 font-medium">{t('studentDashboard.studentRoomDesc')}</p>
          </Link>

          {/* Action 2: Join Quiz (Blue) */}
          <Link to="/quiz/join" className="bg-[#1368CE] hover:bg-[#105ab3] text-white p-5 sm:p-6 rounded-[2rem] shadow-[0_8px_0_#0a4387] active:translate-y-[6px] active:shadow-[0_2px_0_#0a4387] transition-all group flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:-rotate-6 transition-transform">
              <Gamepad2 className="w-8 h-8 text-white" />
            </div>
            <h3 className="kahoot-font text-xl font-bold mb-1 tracking-wide">{t('studentDashboard.quiz')}</h3>
            <p className="text-sm text-white/80 font-medium">{t('studentDashboard.quizDesc')}</p>
          </Link>

          {/* Action 3: Directory (Green) */}
          <Link to="/directory" className="col-span-2 sm:col-span-1 bg-[#26890C] hover:bg-[#20740a] text-white p-5 sm:p-6 rounded-[2rem] shadow-[0_8px_0_#185507] active:translate-y-[6px] active:shadow-[0_2px_0_#185507] transition-all group flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-6 transition-transform">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <h3 className="kahoot-font text-xl font-bold mb-1 tracking-wide">{t('studentDashboard.directory')}</h3>
            <p className="text-sm text-white/80 font-medium">{t('studentDashboard.schoolsDesc')}</p>
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
    <div className="space-y-6 sm:space-y-8 max-w-[1400px] mx-auto pb-10">
      
      {/* ═══ Premium Hero Banner ═══ */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#46178F] via-[#5C1FB5] to-[#46178F] p-8 sm:p-10 text-white shadow-2xl shadow-purple-900/10">
        <div className="absolute -top-20 -right-20 w-[400px] h-[400px] bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[300px] h-[300px] bg-white/5 rounded-full blur-3xl" />
        
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h1 className="kahoot-font text-3xl sm:text-5xl font-extrabold mb-3 tracking-tight drop-shadow-sm">
              {greeting} {t('dashboard.welcome')}, {profile?.displayName?.split(' ')[0]}!
            </h1>
            <p className="text-white/90 text-base sm:text-lg font-medium flex items-center gap-2">
              <Flame className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              {t('studentDashboard.subtitle')}
            </p>
          </div>
          
          <Link to="/join" className="inline-flex items-center gap-2 bg-yellow-400 text-yellow-900 hover:bg-yellow-300 px-6 py-4 rounded-2xl font-bold text-lg shadow-[0_6px_0_#b7860b] active:translate-y-[4px] active:shadow-[0_2px_0_#b7860b] transition-all w-fit kahoot-font">
            <Play className="w-5 h-5 fill-yellow-900" /> {t('studentDashboard.intoWaitingRoom')}
          </Link>
        </div>
      </div>

      {/* ═══ Kahoot 3D Quick Actions ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Link to="/join" className="bg-[#E21B3C] hover:bg-[#c61834] text-white p-5 rounded-[1.5rem] shadow-[0_6px_0_#9d1228] active:translate-y-[4px] active:shadow-[0_2px_0_#9d1228] transition-all group flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Radio className="w-7 h-7 text-white" />
          </div>
          <h3 className="kahoot-font text-lg font-bold mb-1">{t('studentDashboard.liveLessonTitle')}</h3>
          <p className="text-xs text-white/80 font-medium">{t('studentDashboard.liveLessonDesc')}</p>
        </Link>
        
        <Link to="/quiz/join" className="bg-[#1368CE] hover:bg-[#105ab3] text-white p-5 rounded-[1.5rem] shadow-[0_6px_0_#0a4387] active:translate-y-[4px] active:shadow-[0_2px_0_#0a4387] transition-all group flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Gamepad2 className="w-7 h-7 text-white" />
          </div>
          <h3 className="kahoot-font text-lg font-bold mb-1">{t('studentDashboard.quizTitle')}</h3>
          <p className="text-xs text-white/80 font-medium">{t('studentDashboard.quickGameDesc')}</p>
        </Link>

        <Link to="/lessons" className="bg-[#D89E00] hover:bg-[#b88600] text-white p-5 rounded-[1.5rem] shadow-[0_6px_0_#8f6800] active:translate-y-[4px] active:shadow-[0_2px_0_#8f6800] transition-all group flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <h3 className="kahoot-font text-lg font-bold mb-1">{t('studentDashboard.lessonsTitle')}</h3>
          <p className="text-xs text-white/80 font-medium">{lessons.length} {t('studentDashboard.available')}</p>
        </Link>

        <Link to="/my-results" className="bg-[#26890C] hover:bg-[#20740a] text-white p-5 rounded-[1.5rem] shadow-[0_6px_0_#185507] active:translate-y-[4px] active:shadow-[0_2px_0_#185507] transition-all group flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Trophy className="w-7 h-7 text-white" />
          </div>
          <h3 className="kahoot-font text-lg font-bold mb-1">{t('studentDashboard.resultsTitle')}</h3>
          <p className="text-xs text-white/80 font-medium">{t('studentDashboard.yourSuccessDesc')}</p>
        </Link>
      </div>

      {/* Gamification Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <GamificationWidget />
        </div>
        <div className="lg:col-span-1">
          <LeaderboardWidget />
        </div>
      </div>

      {/* ═══ Premium Stats Glass Cards ═══ */}
      {attempts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
          {[
            { label: t('studentDashboard.examsTaken'), value: attempts.length, icon: Target, bg: 'bg-[#46178F]', shadow: 'shadow-[#2c0e5a]' },
            { label: t('studentDashboard.avgScore'), value: `${avgScore}%`, icon: BarChart3, bg: 'bg-[#1368CE]', shadow: 'shadow-[#0c4486]' },
            { label: t('studentDashboard.passRate'), value: `${passRate}%`, icon: Trophy, bg: 'bg-[#26890C]', shadow: 'shadow-[#195a08]' },
          ].map((s, i) => (
            <div key={s.label} className={`${s.bg} text-white rounded-[2rem] p-6 shadow-[0_6px_0_var(--tw-shadow-color)] ${s.shadow} relative overflow-hidden transition-transform hover:scale-[1.03] active:translate-y-[2px] active:shadow-[0_3px_0_var(--tw-shadow-color)] ${i === 2 ? 'col-span-2 sm:col-span-1 border-t border-white/10' : 'border-t border-white/10'}`}>
               <div className="absolute -right-4 -bottom-4 opacity-10">
                 <s.icon className="w-32 h-32" />
               </div>
               <div className="relative z-10">
                 <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-4">
                   <s.icon className="w-6 h-6 text-white" />
                 </div>
                 <p className="kahoot-font text-4xl sm:text-5xl font-black mb-1 drop-shadow-sm">{s.value}</p>
                 <p className="font-bold text-white/80 text-sm">{s.label}</p>
               </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Content Cards ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
        {/* Available Lessons */}
        <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-none">
          <div className="px-6 py-5 border-b-2 border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
            <h2 className="kahoot-font text-2xl font-black text-slate-800 dark:text-white drop-shadow-sm">{t('lessons.title')}</h2>
            <Link to="/lessons" className="text-sm font-bold text-primary-600 dark:text-primary-400 hover:underline">
              {t('dashboard.viewAll')}
            </Link>
          </div>
          <div className="divide-y-2 divide-slate-100 dark:divide-slate-700 p-2">
            {lessons.slice(0, 5).map((l) => (
              <Link key={l.id} to={`/lessons/${l.id}`} className="flex flex-col px-4 py-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                <p className="font-extrabold text-slate-900 dark:text-white text-base group-hover:text-primary-600 transition-colors">{l.title}</p>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-1">{l.subject} • {l.level}</p>
              </Link>
            ))}
            {lessons.length === 0 && <div className="px-6 py-10 text-center font-bold text-slate-400 text-lg">{t('lessons.noLessons')}</div>}
          </div>
        </div>

        {/* Recent Results */}
        <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-none">
          <div className="px-6 py-5 border-b-2 border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
            <h2 className="kahoot-font text-2xl font-black text-slate-800 dark:text-white drop-shadow-sm">{t('exams.title')}</h2>
            <Link to="/my-results" className="text-sm font-bold text-primary-600 dark:text-primary-400 hover:underline">
              {t('dashboard.viewAll')}
            </Link>
          </div>
          <div className="divide-y-2 divide-slate-100 dark:divide-slate-700 p-2">
            {attempts.slice(0, 5).map((a) => (
              <Link key={a.id} to={`/results/${a.id}`} className="flex flex-col px-4 py-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {a.passed ? <Trophy className="w-5 h-5 text-emerald-500 fill-emerald-500" /> : <XCircle className="w-5 h-5 text-red-500 fill-red-500/20" />}
                    <p className="font-extrabold text-slate-900 dark:text-white text-base group-hover:text-primary-600 transition-colors">{a.examTitle}</p>
                  </div>
                  <p className="kahoot-font font-black text-lg text-slate-900 dark:text-white">{a.percentage}%</p>
                </div>
                <div className="flex items-center gap-3 ml-7">
                  {a.aiFeedback && <span className="flex items-center gap-1 text-xs font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/40 px-2 py-0.5 rounded-md"><Brain className="w-3.5 h-3.5" /> AI Feedback</span>}
                  <span className="text-xs font-semibold text-slate-400">{formatDate(a.submittedAt)}</span>
                </div>
              </Link>
            ))}
            {attempts.length === 0 && <div className="px-6 py-10 text-center font-bold text-slate-400 text-lg">{t('studentDashboard.noExams')}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
