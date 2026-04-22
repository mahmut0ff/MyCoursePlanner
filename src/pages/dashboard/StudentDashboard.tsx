import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetDashboard, orgGetTimetable, orgGetSchedule, orgGetGroups, orgGetCourses, apiGetMyMemberships, apiPublicJoin } from '../../lib/api';
import type { LessonPlan, ExamAttempt, ScheduleEvent, Group, Course } from '../../types';
import { formatDate } from '../../utils/grading';
import { BookOpen, Trophy, XCircle, Brain, Target, BarChart3, Flame, Search, Gamepad2, Play, Clock, MapPin, CalendarCheck, ArrowRight, GraduationCap, Building2, Hourglass, CheckCircle2, RefreshCw, UsersRound, UserPlus, Award } from 'lucide-react';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import GamificationWidget from '../../components/gamification/GamificationWidget';
import LeaderboardWidget from '../../components/gamification/LeaderboardWidget';
import StudentEnrollmentOnboarding from './StudentEnrollmentOnboarding';

interface PendingMembership {
  id: string;
  organizationId: string;
  organizationName: string;
  status: string;
  role: string;
  createdAt?: string;
}

const StudentDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { profile, organizationId, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasGroups, setHasGroups] = useState(true);

  // ── Pending memberships for no-org state ──
  const [pendingMemberships, setPendingMemberships] = useState<PendingMembership[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── NEW: Today's schedule + courses ──
  const [todayLessons, setTodayLessons] = useState<ScheduleEvent[]>([]);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [myCourses, setMyCourses] = useState<Course[]>([]);

  // ── Auto-join from orgSlug query param (after registration redirect) ──
  useEffect(() => {
    const orgSlug = searchParams.get('orgSlug');
    if (orgSlug && profile?.uid) {
      apiPublicJoin(orgSlug).catch(() => {});
      // Clean the URL
      searchParams.delete('orgSlug');
      setSearchParams(searchParams, { replace: true });
    }
  }, [profile?.uid, searchParams, setSearchParams]);

  // ── Load pending memberships when student has no org ──
  useEffect(() => {
    if (profile?.uid && !organizationId) {
      setPendingLoading(true);
      apiGetMyMemberships()
        .then((memberships: any[]) => {
          const pending = memberships.filter(m => m.status === 'pending' || m.status === 'invited');
          setPendingMemberships(pending);
        })
        .catch(() => {})
        .finally(() => setPendingLoading(false));
    }
  }, [profile?.uid, organizationId]);

  useEffect(() => {
    if (profile?.uid && organizationId) {
      const load = async () => {
        try {
          // Prepare today's date range for calendar events
          const today = new Date();
          const todayStr = today.toISOString().split('T')[0];

          // Load baseline dashboard data + timetable + calendar events in parallel
          const [data, timetable, calendarEvents, allGroups, allCourses] = await Promise.all([
            apiGetDashboard(),
            orgGetTimetable().catch(() => []),
            orgGetSchedule(todayStr, todayStr).catch(() => []),
            orgGetGroups().catch(() => []),
            orgGetCourses().catch(() => []),
          ]);

          setLessons(data.recentLessons || []);
          setAttempts(data.recentAttempts || []);
          if (data.hasGroups === false) {
            setHasGroups(false);
          }

          // Filter timetable to today's weekday (0=Mon..6=Sun)
          const jsDay = today.getDay(); // 0=Sun
          const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
          const timetableToday = (timetable as ScheduleEvent[])
            .filter((e: any) => e.dayOfWeek === dayOfWeek);

          // Calendar events that match today's date
          const calendarToday = (calendarEvents as ScheduleEvent[])
            .filter((e: any) => {
              if (!e.date) return false;
              return e.date === todayStr;
            });

          // Merge and deduplicate by ID, then sort by startTime
          const allToday = [...timetableToday, ...calendarToday];
          const seen = new Set<string>();
          const deduped = allToday.filter(e => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
          });
          deduped.sort((a: any, b: any) => (a.startTime || '').localeCompare(b.startTime || ''));
          setTodayLessons(deduped);

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

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
      // Also refresh memberships
      const memberships = await apiGetMyMemberships();
      const pending = (memberships as any[]).filter(m => m.status === 'pending' || m.status === 'invited');
      setPendingMemberships(pending);
    } catch {}
    setRefreshing(false);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '🌅' : hour < 18 ? '☀️' : '🌙';

  // Day name for header
  const dayNamesFull = [
    t('schedule.sunday', 'Воскресенье'), t('schedule.monday', 'Понедельник'), t('schedule.tuesday', 'Вторник'),
    t('schedule.wednesday', 'Среда'), t('schedule.thursday', 'Четверг'), t('schedule.friday', 'Пятница'), t('schedule.saturday', 'Суббота'),
  ];
  const todayName = dayNamesFull[new Date().getDay()];

  // ═══ No Organization: Welcome + Discovery + Pending Applications ═══
  if (!organizationId) {
    return (
      <div className="space-y-6 sm:space-y-8 max-w-[1400px] mx-auto pb-10">
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
              to="/catalog"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-[#46178F] rounded-2xl font-bold text-lg hover:bg-slate-50 shadow-[0_6px_0_#94a3b8] active:translate-y-[4px] active:shadow-[0_2px_0_#94a3b8] transition-all"
            >
              <Search className="w-5 h-5" />
              {t('studentDashboard.findCenterBtn')}
            </Link>
          </div>
        </div>

        {/* ═══ Pending Memberships ═══ */}
        {(pendingLoading || pendingMemberships.length > 0) && (
          <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-[2rem] overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-none">
            <div className="px-6 py-5 border-b-2 border-slate-100 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 dark:from-slate-800/80 dark:to-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-md">
                  <Hourglass className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="kahoot-font text-xl font-black text-slate-800 dark:text-white">
                    {t('studentDashboard.pendingApplications', 'Мои заявки')}
                  </h2>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {t('studentDashboard.pendingApplicationsDesc', 'Ожидают одобрения администратора')}
                  </p>
                </div>
              </div>
              <button
                onClick={handleRefreshStatus}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {t('common.refresh', 'Обновить')}
              </button>
            </div>

            {pendingLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-[3px] border-slate-200 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="p-3 sm:p-4 space-y-3">
                {pendingMemberships.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-4 p-4 sm:p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {/* Org Icon */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                      m.status === 'invited' 
                        ? 'bg-gradient-to-br from-emerald-400 to-teal-500' 
                        : 'bg-gradient-to-br from-amber-400 to-orange-500'
                    }`}>
                      <Building2 className="w-6 h-6 text-white" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                        {m.organizationName || t('studentDashboard.unknownOrg', 'Организация')}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        {m.status === 'pending' && (
                          <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                            <Hourglass className="w-3 h-3" />
                            {t('studentDashboard.statusPending', 'На рассмотрении')}
                          </span>
                        )}
                        {m.status === 'invited' && (
                          <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {t('studentDashboard.statusInvited', 'Приглашение')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status indicator */}
                    <div className="shrink-0">
                      {m.status === 'pending' && (
                        <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                      )}
                      {m.status === 'invited' && (
                        <Link
                          to="/invites"
                          className="text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          {t('studentDashboard.viewInvite', 'Принять')}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
                
                {/* Tip */}
                <div className="text-center py-3">
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {t('studentDashboard.pendingTip', 'После одобрения заявки вы сможете выбрать курс и группу')}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

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
    <div className="max-w-[1400px] mx-auto pb-10">
      {/* ═══ TWO-COLUMN LAYOUT ═══ */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ═══ LEFT COLUMN: Main content ═══ */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* ═══ Compact Hero Banner ═══ */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#46178F] via-[#5C1FB5] to-[#46178F] p-5 sm:p-6 text-white shadow-xl shadow-purple-900/10">
            <div className="absolute -top-16 -right-16 w-[280px] h-[280px] bg-white/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-1/4 w-[200px] h-[200px] bg-white/5 rounded-full blur-3xl" />
            
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="kahoot-font text-2xl sm:text-3xl font-extrabold mb-1.5 tracking-tight drop-shadow-sm">
                  {greeting} {t('dashboard.welcome')}, {profile?.displayName?.split(' ')[0]}!
                </h1>
                <p className="text-white/80 text-sm font-medium flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  {t('studentDashboard.subtitle')}
                </p>
              </div>
              
              <Link to="/join" className="inline-flex items-center gap-2 bg-yellow-400 text-yellow-900 hover:bg-yellow-300 px-5 py-3 rounded-xl font-bold text-sm shadow-[0_4px_0_#b7860b] active:translate-y-[3px] active:shadow-[0_1px_0_#b7860b] transition-all w-fit kahoot-font whitespace-nowrap">
                <Play className="w-4 h-4 fill-yellow-900" /> {t('studentDashboard.intoWaitingRoom')}
              </Link>
            </div>
          </div>

          {/* ═══ TODAY'S SCHEDULE ═══ */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-md shadow-slate-200/40 dark:shadow-none">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-slate-800/80 dark:to-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-sm">
                  <CalendarCheck className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="kahoot-font text-base font-black text-slate-800 dark:text-white">{t('studentDashboard.todaySchedule', 'Расписание на сегодня')}</h2>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{todayName}</p>
                </div>
              </div>
              <Link to="/student/schedule" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                {t('dashboard.viewAll')} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {todayLessons.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <CalendarCheck className="w-6 h-6 text-slate-400" />
                </div>
                <p className="font-bold text-slate-500 dark:text-slate-400 text-sm">{t('studentDashboard.noLessonsToday', 'Нет занятий сегодня')}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('studentDashboard.freeDay', 'Отдыхайте или повторите материал')}</p>
              </div>
            ) : (
              <div className="p-2 sm:p-3 space-y-1.5">
                {todayLessons.map((lesson, idx) => {
                  const isCurrent = currentLesson?.id === lesson.id;
                  const isNext = !currentLesson && nextLesson?.id === lesson.id;
                  const isPast = lesson.endTime ? lesson.endTime <= now : false;

                  return (
                    <div
                      key={lesson.id}
                      className={`relative flex items-center gap-3 p-3 sm:p-3.5 rounded-xl border transition-all ${
                        isCurrent
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 shadow-sm ring-1 ring-indigo-400/30'
                          : isNext
                          ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50'
                          : isPast
                          ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50 opacity-50'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {/* Lesson number */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                        isCurrent ? 'bg-indigo-500 text-white' : isNext ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}>
                        {idx + 1}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {isCurrent && (
                            <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                              {t('studentDashboard.currentlyNow', 'Сейчас')}
                            </span>
                          )}
                          {isNext && (
                            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                              {t('studentDashboard.upNext', 'Следующий')}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{lesson.title}</h4>
                        {(lesson as any).groupName && (
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">{(lesson as any).groupName}</p>
                        )}
                      </div>

                      {/* Time + Location */}
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-300">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {lesson.startTime} – {lesson.endTime}
                        </div>
                        {lesson.location && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5 justify-end">
                            <MapPin className="w-2.5 h-2.5" />
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

          {/* ═══ My Courses Summary (compact) ═══ */}
          {myCourses.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-md shadow-slate-200/40 dark:shadow-none">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-slate-800/80 dark:to-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-sm">
                    <GraduationCap className="w-4 h-4 text-white" />
                  </div>
                  <h2 className="kahoot-font text-base font-black text-slate-800 dark:text-white">{t('studentDashboard.myCourses', 'Мои курсы')}</h2>
                </div>
                <Link to="/student/courses" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
                  {t('dashboard.viewAll')} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="p-2 sm:p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {myCourses.slice(0, 4).map(course => {
                  const courseGroups = myGroups.filter(g => g.courseId === course.id);
                  return (
                    <Link
                      key={course.id}
                      to={`/courses/${course.id}`}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 bg-white dark:bg-slate-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-all group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                        <BookOpen className="w-4.5 h-4.5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-emerald-600 transition-colors">{course.title}</h4>
                        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {courseGroups.map(g => g.name).join(', ') || course.subject}
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ Quick Links (pages not in sidebar) ═══ */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { to: '/student/groups', icon: UsersRound, label: t('nav.myGroups', 'Мои группы'), color: 'text-violet-500' },
                { to: '/student/teachers', icon: UserPlus, label: t('nav.myTeachers', 'Преподаватели'), color: 'text-blue-500' },
                { to: '/certificates', icon: Award, label: t('nav.certificates', 'Сертификаты'), color: 'text-amber-500' },
              ].map(link => (
                <Link key={link.to} to={link.to} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <link.icon className={`w-4 h-4 ${link.color}`} />{link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* ═══ Quick Actions (compact 2x2 grid) ═══ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link to="/quiz/join" className="bg-[#E21B3C] hover:bg-[#c61834] text-white p-4 rounded-xl shadow-[0_4px_0_#9d1228] active:translate-y-[3px] active:shadow-[0_1px_0_#9d1228] transition-all group flex flex-col items-center text-center">
              <h3 className="kahoot-font text-sm font-bold mb-0.5">{t('studentDashboard.quizTitle')}</h3>
              <p className="text-[10px] text-white/80 font-medium">{t('studentDashboard.quickGameDesc')}</p>
            </Link>

            <Link to="/lessons" className="bg-[#D89E00] hover:bg-[#b88600] text-white p-4 rounded-xl shadow-[0_4px_0_#8f6800] active:translate-y-[3px] active:shadow-[0_1px_0_#8f6800] transition-all group flex flex-col items-center text-center">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <h3 className="kahoot-font text-sm font-bold mb-0.5">{t('studentDashboard.lessonsTitle')}</h3>
              <p className="text-[10px] text-white/80 font-medium">{lessons.length} {t('studentDashboard.available')}</p>
            </Link>

            <Link to="/my-results" className="bg-[#26890C] hover:bg-[#20740a] text-white p-4 rounded-xl shadow-[0_4px_0_#185507] active:translate-y-[3px] active:shadow-[0_1px_0_#185507] transition-all group flex flex-col items-center text-center">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <h3 className="kahoot-font text-sm font-bold mb-0.5">{t('studentDashboard.resultsTitle')}</h3>
              <p className="text-[10px] text-white/80 font-medium">{t('studentDashboard.yourSuccessDesc')}</p>
            </Link>
          </div>

          {/* Gamification Area */}
          <GamificationWidget />

          {/* ═══ Premium Stats (compact) ═══ */}
          {attempts.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t('studentDashboard.examsTaken'), value: attempts.length, icon: Target, bg: 'bg-[#46178F]', shadow: 'shadow-[#2c0e5a]' },
                { label: t('studentDashboard.avgScore'), value: `${avgScore}%`, icon: BarChart3, bg: 'bg-[#1368CE]', shadow: 'shadow-[#0c4486]' },
                { label: t('studentDashboard.passRate'), value: `${passRate}%`, icon: Trophy, bg: 'bg-[#26890C]', shadow: 'shadow-[#195a08]' },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} text-white rounded-2xl p-4 shadow-[0_4px_0_var(--tw-shadow-color)] ${s.shadow} relative overflow-hidden transition-transform hover:scale-[1.02] active:translate-y-[2px]`}>
                   <div className="absolute -right-3 -bottom-3 opacity-10">
                     <s.icon className="w-20 h-20" />
                   </div>
                   <div className="relative z-10">
                     <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-2">
                       <s.icon className="w-4 h-4 text-white" />
                     </div>
                     <p className="kahoot-font text-2xl sm:text-3xl font-black mb-0.5 drop-shadow-sm">{s.value}</p>
                     <p className="font-bold text-white/80 text-[11px]">{s.label}</p>
                   </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ Content Cards (Lessons + Results) ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Available Lessons */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-md shadow-slate-200/40 dark:shadow-none">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
                <h2 className="kahoot-font text-base font-black text-slate-800 dark:text-white">{t('lessons.title')}</h2>
                <Link to="/lessons" className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline">
                  {t('dashboard.viewAll')}
                </Link>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700 p-1.5">
                {lessons.slice(0, 4).map((l) => (
                  <Link key={l.id} to={`/lessons/${l.id}`} className="flex flex-col px-3 py-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                    <p className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-primary-600 transition-colors truncate">{l.title}</p>
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{l.subject} • {l.level}</p>
                  </Link>
                ))}
                {lessons.length === 0 && <div className="px-4 py-8 text-center font-bold text-slate-400 text-sm">{t('lessons.noLessons')}</div>}
              </div>
            </div>

            {/* Recent Results */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-md shadow-slate-200/40 dark:shadow-none">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
                <h2 className="kahoot-font text-base font-black text-slate-800 dark:text-white">{t('exams.title')}</h2>
                <Link to="/my-results" className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline">
                  {t('dashboard.viewAll')}
                </Link>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700 p-1.5">
                {attempts.slice(0, 4).map((a) => (
                  <Link key={a.id} to={`/results/${a.id}`} className="flex flex-col px-3 py-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {a.passed ? <Trophy className="w-4 h-4 text-emerald-500 fill-emerald-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 fill-red-500/20 shrink-0" />}
                        <p className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-primary-600 transition-colors truncate">{a.examTitle}</p>
                      </div>
                      <p className="kahoot-font font-black text-base text-slate-900 dark:text-white shrink-0 ml-2">{a.percentage}%</p>
                    </div>
                    <div className="flex items-center gap-2 ml-6">
                      {a.aiFeedback && <span className="flex items-center gap-1 text-[10px] font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/40 px-1.5 py-0.5 rounded"><Brain className="w-3 h-3" />AI</span>}
                      <span className="text-[10px] font-semibold text-slate-400">{formatDate(a.submittedAt)}</span>
                    </div>
                  </Link>
                ))}
                {attempts.length === 0 && <div className="px-4 py-8 text-center font-bold text-slate-400 text-sm">{t('studentDashboard.noExams')}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN: Leaderboard (sticky) ═══ */}
        <div className="lg:w-[320px] xl:w-[360px] shrink-0">
          <div className="lg:sticky lg:top-4 space-y-5">
            <LeaderboardWidget />
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
