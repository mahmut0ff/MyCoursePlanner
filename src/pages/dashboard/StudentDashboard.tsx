import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetDashboard, orgGetTimetable, orgGetSchedule, orgGetGroups, orgGetCourses } from '../../lib/api';
import type { LessonPlan, ExamAttempt, ScheduleEvent, Group, Course } from '../../types';
import { formatDate } from '../../utils/grading';
import { BookOpen, Trophy, XCircle, Brain, Target, BarChart3, Flame, Play, Clock, MapPin, CalendarCheck, ArrowRight, GraduationCap, Building2, UsersRound, UserPlus, Award } from 'lucide-react';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '🌅' : hour < 18 ? '☀️' : '🌙';

  // Day name for header
  const dayNamesFull = [
    t('schedule.sunday', 'Воскресенье'), t('schedule.monday', 'Понедельник'), t('schedule.tuesday', 'Вторник'),
    t('schedule.wednesday', 'Среда'), t('schedule.thursday', 'Четверг'), t('schedule.friday', 'Пятница'), t('schedule.saturday', 'Суббота'),
  ];
  const todayName = dayNamesFull[new Date().getDay()];

  // ═══ No Organization ═══
  // Аккаунты заводит центр — самостоятельно вступить нельзя, поэтому только подсказка.
  if (!organizationId) {
    return (
      <EmptyState
        icon={Building2}
        title={t('studentDashboard.noOrgTitle', 'Вы пока не состоите в учебном центре')}
        description={t('studentDashboard.noOrgHint', 'Обратитесь к администратору центра, чтобы вас добавили.')}
      />
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
    <div className="pb-10">
      {/* ═══ TWO-COLUMN LAYOUT ═══ */}
      <div className="flex flex-col lg:flex-row gap-4">

        {/* ═══ LEFT COLUMN: Main content ═══ */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ═══ Compact Hero Banner ═══ */}
          <div className="pb-1">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {greeting} {t('dashboard.welcome')}, {profile?.displayName?.split(' ')[0]}!
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  {t('studentDashboard.subtitle')}
                </p>
              </div>
              
              <Link to="/quiz/join" className="btn-primary inline-flex items-center gap-1.5 w-fit whitespace-nowrap">
                <Play className="w-3.5 h-3.5" /> {t('studentDashboard.intoWaitingRoom')}
              </Link>
            </div>
          </div>

          {/* ═══ TODAY'S SCHEDULE ═══ */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center">
                  <CalendarCheck className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('studentDashboard.todaySchedule', 'Расписание на сегодня')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{todayName}</p>
                </div>
              </div>
              <Link to="/student/schedule" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                {t('dashboard.viewAll')} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {todayLessons.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="flex items-center justify-center mx-auto mb-2">
                  <CalendarCheck className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="font-medium text-slate-700 dark:text-slate-300 text-sm">{t('studentDashboard.noLessonsToday', 'Нет занятий сегодня')}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('studentDashboard.freeDay', 'Отдыхайте или повторите материал')}</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {todayLessons.map((lesson, idx) => {
                  const isCurrent = currentLesson?.id === lesson.id;
                  const isNext = !currentLesson && nextLesson?.id === lesson.id;
                  const isPast = lesson.endTime ? lesson.endTime <= now : false;

                  return (
                    <div
                      key={lesson.id}
                      className={`relative flex items-center gap-3 px-3 py-2 rounded-md border transition-colors ${
                        isCurrent
                          ? 'bg-primary-50 dark:bg-primary-950 border-primary-300 dark:border-primary-800'
                          : isNext
                          ? 'bg-white dark:bg-slate-800 border-emerald-200 dark:border-emerald-800/50'
                          : isPast
                          ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-50'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {/* Lesson number */}
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-medium tabular-nums shrink-0 ${
                        isCurrent ? 'bg-primary-600 text-white' : isNext ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}>
                        {idx + 1}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-950">
                              {t('studentDashboard.currentlyNow', 'Сейчас')}
                            </span>
                          )}
                          {isNext && (
                            <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30">
                              {t('studentDashboard.upNext', 'Следующий')}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{lesson.title}</h4>
                        {(lesson as any).groupName && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{(lesson as any).groupName}</p>
                        )}
                      </div>

                      {/* Time + Location */}
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-xs font-medium tabular-nums text-slate-700 dark:text-slate-300">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {lesson.startTime} – {lesson.endTime}
                        </div>
                        {lesson.location && (
                          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5 justify-end">
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
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center">
                    <GraduationCap className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('studentDashboard.myCourses', 'Мои курсы')}</h2>
                </div>
                <Link to="/student/courses" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
                  {t('dashboard.viewAll')} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {myCourses.slice(0, 4).map(course => {
                  const courseGroups = myGroups.filter(g => g.courseId === course.id);
                  return (
                    <Link
                      key={course.id}
                      to={`/courses/${course.id}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                        <BookOpen className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{course.title}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {courseGroups.map(g => g.name).join(', ') || course.subject}
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 transition-colors shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ Quick Links (pages not in sidebar) ═══ */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { to: '/student/groups', icon: UsersRound, label: t('nav.myGroups', 'Мои группы'), color: 'text-slate-400' },
                { to: '/student/teachers', icon: UserPlus, label: t('nav.myTeachers', 'Преподаватели'), color: 'text-slate-400' },
                { to: '/certificates', icon: Award, label: t('nav.certificates', 'Сертификаты'), color: 'text-slate-400' },
              ].map(link => (
                <Link key={link.to} to={link.to} className="flex items-center gap-2 h-8 px-2.5 rounded-md text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <link.icon className={`w-3.5 h-3.5 ${link.color}`} />{link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* ═══ Quick Actions (compact 2x2 grid) ═══ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link to="/quiz/join" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group flex flex-col items-center text-center">
              <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-0.5">{t('studentDashboard.quizTitle')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('studentDashboard.quickGameDesc')}</p>
            </Link>

            <Link to="/lessons" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group flex flex-col items-center text-center">
              <div className="flex items-center justify-center mb-1.5">
                <BookOpen className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-0.5">{t('studentDashboard.lessonsTitle')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{lessons.length} {t('studentDashboard.available')}</p>
            </Link>

            <Link to="/my-results" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group flex flex-col items-center text-center">
              <div className="flex items-center justify-center mb-1.5">
                <Trophy className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-0.5">{t('studentDashboard.resultsTitle')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('studentDashboard.yourSuccessDesc')}</p>
            </Link>
          </div>

          {/* Gamification Area */}
          <GamificationWidget />

          {/* ═══ Premium Stats (compact) ═══ */}
          {attempts.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t('studentDashboard.examsTaken'), value: attempts.length, icon: Target },
                { label: t('studentDashboard.avgScore'), value: `${avgScore}%`, icon: BarChart3 },
                { label: t('studentDashboard.passRate'), value: `${passRate}%`, icon: Trophy },
              ].map((s) => (
                <div key={s.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                   <div className="flex flex-col">
                     <div className="self-end -mb-3.5">
                       <s.icon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                     </div>
                     <p className="order-last text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{s.value}</p>
                     <p className="text-xs text-slate-500 dark:text-slate-400 pr-5">{s.label}</p>
                   </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ Content Cards (Lessons + Results) ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Available Lessons */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('lessons.title')}</h2>
                <Link to="/lessons" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
                  {t('dashboard.viewAll')}
                </Link>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {lessons.slice(0, 4).map((l) => (
                  <Link key={l.id} to={`/lessons/${l.id}`} className="flex flex-col px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                    <p className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">{l.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l.subject} • {l.level}</p>
                  </Link>
                ))}
                {lessons.length === 0 && <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">{t('lessons.noLessons')}</div>}
              </div>
            </div>

            {/* Recent Results */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('exams.title')}</h2>
                <Link to="/my-results" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
                  {t('dashboard.viewAll')}
                </Link>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {attempts.slice(0, 4).map((a) => (
                  <Link key={a.id} to={`/results/${a.id}`} className="flex flex-col px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {a.passed ? <Trophy className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        <p className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">{a.examTitle}</p>
                      </div>
                      <p className="font-semibold text-sm tabular-nums text-slate-900 dark:text-slate-100 shrink-0 ml-2">{a.percentage}%</p>
                    </div>
                    <div className="flex items-center gap-2 ml-5">
                      {a.aiFeedback && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-950"><Brain className="w-3 h-3" />AI</span>}
                      <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(a.submittedAt)}</span>
                    </div>
                  </Link>
                ))}
                {attempts.length === 0 && <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">{t('studentDashboard.noExams')}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN: Leaderboard (sticky) ═══ */}
        <div className="lg:w-[320px] xl:w-[360px] shrink-0">
          <div className="lg:sticky lg:top-4 space-y-4">
            <LeaderboardWidget />
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
