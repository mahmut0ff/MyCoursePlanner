import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { getLessonPlans } from '../../services/lessons.service';
import { getExams } from '../../services/exams.service';
import { getActiveRooms } from '../../services/rooms.service';
import { getAllAttempts } from '../../services/attempts.service';
import { apiGetPendingInviteCount } from '../../lib/api';
import type { LessonPlan, Exam, ExamRoom, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import {
  BookOpen, ClipboardList, Radio, TrendingUp, ArrowRight, Plus,
  Users, MailOpen, UserCircle2, GraduationCap,
  UsersRound, FileText, Monitor, Gamepad2, History, BarChart3, Activity, TrendingDown,
  ChevronRight, ArrowUpRight,
} from 'lucide-react';
import TeacherOnboardingWizard from '../../components/onboarding/TeacherOnboardingWizard';
import TeacherWheelOfFortune from '../../components/dashboard/TeacherWheelOfFortune';

const TeacherDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { profile, organizationId } = useAuth();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [inviteCount, setInviteCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const promises: Promise<any>[] = [
      getLessonPlans().catch(() => []),
      getExams().catch(() => []),
      getActiveRooms().catch(() => []),
      getAllAttempts().catch(() => []),
      apiGetPendingInviteCount().catch(() => ({ count: 0 })),
    ];
    Promise.all(promises)
      .then(([l, e, r, a, inv]) => {
        setLessons(l || []);
        setExams(e || []);
        setRooms(r || []);
        setAttempts(a || []);
        setInviteCount(inv?.count || 0);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-slate-400" /></div>;

  const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length) : 0;
  const recentAttempts = attempts.filter(a => !a.passed || a.percentage < 100).slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '🌅' : hour < 18 ? '☀️' : '🌙';

  const stats = [
    { label: t('teacherDashboard.myLessons'), value: lessons.length, icon: BookOpen, iconBg: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200/50 dark:border-blue-800/40', text: 'text-blue-600 dark:text-blue-400' },
    { label: t('teacherDashboard.myExams'), value: exams.length, icon: ClipboardList, iconBg: 'bg-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200/50 dark:border-violet-800/40', text: 'text-violet-600 dark:text-violet-400' },
    { label: t('teacherDashboard.activeRooms'), value: rooms.length, icon: Radio, iconBg: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200/50 dark:border-emerald-800/40', text: 'text-emerald-600 dark:text-emerald-400' },
    { label: t('teacherDashboard.avgScore'), value: `${avgScore}%`, icon: TrendingUp, iconBg: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200/50 dark:border-amber-800/40', text: 'text-amber-600 dark:text-amber-400' },
  ];

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* ═══ TWO-COLUMN LAYOUT ═══ */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ═══ LEFT: Main Content ═══ */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* ── Hero Banner ── */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 p-6 sm:p-8 text-white">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute bottom-0 left-1/4 w-28 h-28 bg-white/5 rounded-full blur-xl" />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">{greeting} {t('teacherDashboard.welcome')}, {profile?.displayName?.split(' ')[0]}!</h1>
                <p className="text-white/70 text-sm mt-1 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4" />
                  {organizationId ? t('teacherDashboard.subtitleOrg') : t('teacherDashboard.subtitleNoOrg')}
                </p>
              </div>
              {organizationId && (
                <div className="flex gap-2">
                  <Link to="/lessons/new" className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98]">
                    <Plus className="w-4 h-4" />{t('teacherDashboard.newLesson')}
                  </Link>
                  <Link to="/exams/new" className="hidden sm:inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98]">
                    <Plus className="w-4 h-4" />{t('teacherDashboard.newExam')}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions for teachers without org */}
          {!organizationId && (
            <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-2xl p-5 sm:p-6">
              <h2 className="font-semibold text-primary-900 dark:text-primary-300 mb-2">{t('teacherDashboard.getStarted')}</h2>
              <p className="text-sm text-primary-700 dark:text-primary-400 mb-4">{t('teacherDashboard.getStartedDesc')}</p>
              <div className="flex flex-wrap gap-3">
                <Link to="/teacher-profile" className="btn-primary text-sm flex items-center gap-2"><UserCircle2 className="w-4 h-4" />{t('teacherDashboard.fillProfile')}</Link>
                {inviteCount > 0 && (
                  <Link to="/invites" className="btn-secondary text-sm flex items-center gap-2">
                    <MailOpen className="w-4 h-4" />{t('teacherDashboard.viewInvites')}
                    <span className="bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">{inviteCount}</span>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Teacher Onboarding Wizard */}
          {organizationId && <TeacherOnboardingWizard />}

          {/* Stats Cards */}
          {organizationId && (
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
          )}

          {/* Invite banner */}
          {inviteCount > 0 && organizationId && (
            <Link to="/invites" className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 hover:shadow-md transition-all">
              <MailOpen className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('teacherDashboard.pendingInvites', { count: inviteCount })}</span>
              <ArrowRight className="w-4 h-4 text-amber-500 ml-auto" />
            </Link>
          )}

          {/* Content Grid */}
          {organizationId && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Wheel of Fortune */}
              <TeacherWheelOfFortune />

              {/* My Lessons */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900 dark:text-white">{t('teacherDashboard.recentLessons')}</h2>
                  <Link to="/lessons" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">{t('teacherDashboard.viewAll')}<ArrowRight className="w-3.5 h-3.5" /></Link>
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

              {/* My Exams */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900 dark:text-white">{t('teacherDashboard.recentExams')}</h2>
                  <Link to="/exams" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">{t('teacherDashboard.viewAll')}<ArrowRight className="w-3.5 h-3.5" /></Link>
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
                    <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Radio className="w-4 h-4 text-emerald-500 animate-pulse" />{t('teacherDashboard.liveRooms')}</h2>
                    <Link to="/rooms" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">{t('teacherDashboard.viewAll')}<ArrowRight className="w-3.5 h-3.5" /></Link>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {rooms.slice(0, 5).map((r) => (
                      <Link key={r.id} to={`/rooms/${r.id}`} className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-slate-900 dark:text-white text-sm">{r.examTitle}</p>
                          <span className="font-mono text-xs text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded">{r.code}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1"><Users className="w-3 h-3" />{r.participants.length} {t('teacherDashboard.participants')}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Results */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900 dark:text-white">{t('teacherDashboard.recentResults')}</h2>
                  <Link to="/results" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">{t('teacherDashboard.viewAll')}<ArrowRight className="w-3.5 h-3.5" /></Link>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {recentAttempts.map((a) => (
                    <div key={a.id} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white text-sm">{a.studentName}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{a.examTitle}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-900 dark:text-white">{a.percentage}%</p>
                          <span className={`text-xs ${a.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{a.passed ? t('teacherDashboard.pass') : t('teacherDashboard.fail')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {attempts.length === 0 && <div className="px-5 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">{t('teacherDashboard.noResults')}</div>}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ═══ RIGHT: Sidebar (Quick Links) ═══ */}
        {organizationId && (
          <div className="lg:w-[260px] xl:w-[280px] shrink-0">
            <div className="lg:sticky lg:top-4 space-y-4">
              {/* Quick Access Panel */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t('teacherDashboard.quickLinks')}
                  </h3>
                </div>
                <div className="p-1.5">
                  {[
                    { to: '/groups', icon: UsersRound, label: t('nav.groups') },
                    { to: '/materials', icon: FileText, label: t('nav.materials') },
                    { to: '/rooms', icon: Monitor, label: t('nav.examRooms', 'Комнаты') },
                    { to: '/quiz/library', icon: Gamepad2, label: t('nav.quizLibrary') },
                    { to: '/quiz/sessions', icon: History, label: t('nav.quizSessions') },
                    { to: '/results', icon: BarChart3, label: t('nav.results') },
                    { to: '/teacher-analytics', icon: Activity, label: t('nav.analytics') },
                    { to: '/risk-dashboard', icon: TrendingDown, label: t('nav.riskDashboard', 'Светофор рисков') },
                    { to: '/teacher-profile', icon: UserCircle2, label: t('nav.myProfile') },
                  ].map(link => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <link.icon className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                        <span>{link.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" />
                    </Link>
                  ))}
                </div>
              </div>

              {/* Analytics CTA */}
              <Link
                to="/teacher-analytics"
                className="flex items-center justify-between w-full px-4 py-3 bg-slate-900 dark:bg-slate-700 rounded-xl text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-4 h-4 text-slate-400 group-hover:text-slate-300 transition-colors" />
                  <span className="text-sm font-medium">{t('nav.analytics')}</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;
