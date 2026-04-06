import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetDashboard, orgGetTimetable, orgGetGroups, orgGetCourses } from '../../lib/api';
import type { LessonPlan, ExamAttempt, ScheduleEvent, Group, Course } from '../../types';
import { formatDate } from '../../utils/grading';
import { BookOpen, Radio, Trophy, XCircle, Brain, Target, BarChart3, Flame, Search, Gamepad2, Play, Clock, MapPin, CalendarCheck, ArrowRight, AlertCircle, GraduationCap } from 'lucide-react';
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

  // ── NEW: Today's schedule + courses ──
  const [todayLessons, setTodayLessons] = useState<ScheduleEvent[]>([]);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [myCourses, setMyCourses] = useState<Course[]>([]);

  useEffect(() => {
    if (profile?.uid && organizationId) {
      const load = async () => {
        try {
          // Load baseline dashboard data + schedule in parallel
          const [data, timetable, allGroups, allCourses] = await Promise.all([
            apiGetDashboard(),
            orgGetTimetable().catch(() => []),
            orgGetGroups().catch(() => []),
            orgGetCourses().catch(() => []),
          ]);

          setLessons(data.recentLessons || []);
          setAttempts(data.recentAttempts || []);
          if (data.hasGroups === false) {
            setHasGroups(false);
          }

          // Filter timetable to today's weekday
          const dayOfWeek = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
          const todayEvents = (timetable as ScheduleEvent[])
            .filter((e: any) => e.dayOfWeek === dayOfWeek)
            .sort((a: any, b: any) => (a.startTime || '').localeCompare(b.startTime || ''));
          setTodayLessons(todayEvents);

          // Get student's groups
          const studentGroups = (allGroups as Group[]).filter(g => g.studentIds?.includes(profile.uid));
          setMyGroups(studentGroups);

          // Get courses for student's groups
          const groupCourseIds = new Set(studentGroups.map(g => g.courseId));
          const studentCourses = (allCourses as Course[]).filter(c => groupCourseIds.has(c.id));
          setMyCourses(studentCourses);

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

  // Day name for header
  const dayNamesFull = [
    t('schedule.sunday', 'Воскресенье'), t('schedule.monday', 'Понедельник'), t('schedule.tuesday', 'Вторник'),
    t('schedule.wednesday', 'Среда'), t('schedule.thursday', 'Четверг'), t('schedule.friday', 'Пятница'), t('schedule.saturday', 'Суббота'),
  ];
  const todayName = dayNamesFull[new Date().getDay()];

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

  // Determine current/next lesson
  const now = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const currentLesson = todayLessons.find(l => l.startTime && l.endTime && l.startTime <= now && l.endTime > now);
  const nextLesson = todayLessons.find(l => l.startTime && l.startTime > now);

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

      {/* ═══ TODAY'S SCHEDULE — "What to do today" ═══ */}
      <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-none">
        <div className="px-6 py-5 border-b-2 border-slate-100 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-slate-800/80 dark:to-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-md">
              <CalendarCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="kahoot-font text-xl font-black text-slate-800 dark:text-white">{t('studentDashboard.todaySchedule', 'Расписание на сегодня')}</h2>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{todayName}</p>
            </div>
          </div>
          <Link to="/schedule" className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
            {t('dashboard.viewAll')} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {todayLessons.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <CalendarCheck className="w-8 h-8 text-slate-400" />
            </div>
            <p className="font-bold text-slate-500 dark:text-slate-400 text-lg">{t('studentDashboard.noLessonsToday', 'Нет занятий сегодня')}</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{t('studentDashboard.freeDay', 'Отдыхайте или повторите материал')}</p>
          </div>
        ) : (
          <div className="p-3 sm:p-4 space-y-2">
            {todayLessons.map((lesson, idx) => {
              const isCurrent = currentLesson?.id === lesson.id;
              const isNext = !currentLesson && nextLesson?.id === lesson.id;
              const isPast = lesson.endTime ? lesson.endTime <= now : false;

              return (
                <div
                  key={lesson.id}
                  className={`relative flex items-center gap-4 p-4 sm:p-5 rounded-2xl border-2 transition-all ${
                    isCurrent
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-400/30'
                      : isNext
                      ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50'
                      : isPast
                      ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50 opacity-60'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {/* Lesson number */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
                    isCurrent ? 'bg-indigo-500 text-white' : isNext ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>
                    {idx + 1}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {isCurrent && (
                        <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                          {t('studentDashboard.currentlyNow', 'Сейчас')}
                        </span>
                      )}
                      {isNext && (
                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {t('studentDashboard.upNext', 'Следующий')}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">{lesson.title}</h4>
                    {(lesson as any).groupName && (
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">{(lesson as any).groupName}</p>
                    )}
                  </div>

                  {/* Time + Location */}
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {lesson.startTime} – {lesson.endTime}
                    </div>
                    {lesson.location && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5 justify-end">
                        <MapPin className="w-3 h-3" />
                        {lesson.location}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ My Courses Summary ═══ */}
      {myCourses.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-none">
          <div className="px-6 py-5 border-b-2 border-slate-100 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-slate-800/80 dark:to-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-md">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <h2 className="kahoot-font text-xl font-black text-slate-800 dark:text-white">{t('studentDashboard.myCourses', 'Мои курсы')}</h2>
            </div>
            <Link to="/courses" className="text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
              {t('dashboard.viewAll')} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {myCourses.slice(0, 4).map(course => {
              const courseGroups = myGroups.filter(g => g.courseId === course.id);
              return (
                <Link
                  key={course.id}
                  to={`/courses/${course.id}`}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 bg-white dark:bg-slate-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-emerald-600 transition-colors">{course.title}</h4>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                      {courseGroups.map(g => g.name).join(', ') || course.subject}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

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
