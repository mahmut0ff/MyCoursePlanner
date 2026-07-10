import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { getLessonPlans } from '../../services/lessons.service';
import { getExams } from '../../services/exams.service';
import { getActiveRooms } from '../../services/rooms.service';
import { getAllAttempts } from '../../services/attempts.service';
import { apiGetPendingInviteCount } from '../../lib/api';
import type { LessonPlan, Exam, ExamRoom, ExamAttempt, Group, UserProfile } from '../../types';
import { formatDate } from '../../utils/grading';
import {
  ArrowRight, Plus, Users, MailOpen, UserCircle2,
  UsersRound, FileText, Monitor, Gamepad2, History, BarChart3, Activity, TrendingDown,
  BookOpen, ClipboardList, ChevronRight,
} from 'lucide-react';
import TeacherOnboardingWizard from '../../components/onboarding/TeacherOnboardingWizard';
import TeacherWheelOfFortune from '../../components/dashboard/TeacherWheelOfFortune';

/* Shared card-header for the list blocks: one visual vocabulary, defined once. */
const ListHeader: React.FC<{ title: React.ReactNode; to: string; linkLabel: string }> = ({ title, to, linkLabel }) => (
  <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
    <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 min-w-0">{title}</h2>
    <Link to={to} className="text-[13px] text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1 shrink-0">
      {linkLabel}<ArrowRight className="w-3.5 h-3.5" />
    </Link>
  </div>
);

export interface TeacherDashboardViewProps {
  firstName?: string;
  organizationId?: string | null;
  lessons: LessonPlan[];
  exams: Exam[];
  rooms: ExamRoom[];
  attempts: ExamAttempt[];
  inviteCount: number;
  /** Preview/testing seam: pre-seeded data for the wheel tool. */
  wheelProps?: { initialGroups: Group[]; initialStudents: UserProfile[] };
}

export const TeacherDashboardView: React.FC<TeacherDashboardViewProps> = ({
  firstName, organizationId, lessons, exams, rooms, attempts, inviteCount, wheelProps,
}) => {
  const { t, i18n } = useTranslation();

  // Attempts that deserve a second look: failed or below full score.
  const attentionAttempts = attempts.filter(a => !a.passed || a.percentage < 100).slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12
    ? t('teacherDashboard.greetingMorning', 'Доброе утро')
    : hour < 18
      ? t('teacherDashboard.greetingDay', 'Добрый день')
      : t('teacherDashboard.greetingEvening', 'Добрый вечер');

  const dateLocale = i18n.language?.startsWith('kg') ? 'ky' : i18n.language?.startsWith('en') ? 'en' : 'ru';
  const dateLine = new Date().toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ═══ LEFT: Main Content ═══ */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── Page header: plain, no banner ── */}
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-1">
            <div className="min-w-0">
              <p className="text-[13px] text-slate-500 dark:text-slate-400 first-letter:uppercase">{dateLine}</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white mt-0.5 truncate">
                {greeting}{firstName ? `, ${firstName}` : ''}
              </h1>
            </div>
            {organizationId && (
              <div className="flex items-center gap-2">
                <Link to="/exams/new" className="btn-secondary hidden sm:inline-flex items-center gap-1.5 text-sm">
                  <Plus className="w-4 h-4" />{t('teacherDashboard.newExam')}
                </Link>
                <Link to="/lessons/new" className="btn-primary inline-flex items-center gap-1.5 text-sm">
                  <Plus className="w-4 h-4" />{t('teacherDashboard.newLesson')}
                </Link>
              </div>
            )}
          </header>

          {/* ── No-org quick start ── */}
          {!organizationId && (
            <div className="card p-5 sm:p-6">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-1.5">{t('teacherDashboard.getStarted')}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('teacherDashboard.getStartedDesc')}</p>
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

          {/* ── Live rooms: most time-sensitive, so first ── */}
          {organizationId && rooms.length > 0 && (
            <section className="card overflow-hidden">
              <ListHeader
                to="/rooms"
                linkLabel={t('teacherDashboard.viewAll')}
                title={
                  <>
                    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    {t('teacherDashboard.liveNow', 'Идут сейчас')}
                  </>
                }
              />
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {rooms.slice(0, 4).map((r) => (
                  <Link key={r.id} to={`/rooms/${r.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{r.examTitle}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                        <Users className="w-3 h-3" />{r.participants.length} {t('teacherDashboard.participants')}
                      </p>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">{r.code}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Onboarding: one slim row (component hides itself when done/dismissed) ── */}
          {organizationId && <TeacherOnboardingWizard />}

          {/* ── Pending invites ── */}
          {inviteCount > 0 && organizationId && (
            <Link to="/invites" className="flex items-center gap-3 card px-4 py-3 hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
              <MailOpen className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('teacherDashboard.pendingInvites', { count: inviteCount })}</span>
              <ArrowRight className="w-4 h-4 text-slate-400 ml-auto shrink-0" />
            </Link>
          )}

          {/* ── Recent lessons / exams ── */}
          {organizationId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <section className="card overflow-hidden">
                <ListHeader title={t('teacherDashboard.recentLessons')} to="/lessons" linkLabel={t('teacherDashboard.viewAll')} />
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {lessons.slice(0, 5).map((l) => (
                    <Link key={l.id} to={`/lessons/${l.id}`} className="block px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{l.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{l.subject} · {formatDate(l.createdAt)}</p>
                    </Link>
                  ))}
                  {lessons.length === 0 && (
                    <div className="px-5 py-9 text-center">
                      <BookOpen className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{t('lessons.noLessons')}</p>
                      <Link to="/lessons/new" className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
                        {t('teacherDashboard.createFirstLesson', 'Создать первый урок')}
                      </Link>
                    </div>
                  )}
                </div>
              </section>

              <section className="card overflow-hidden">
                <ListHeader title={t('teacherDashboard.recentExams')} to="/exams" linkLabel={t('teacherDashboard.viewAll')} />
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {exams.slice(0, 5).map((e) => (
                    <Link key={e.id} to={`/exams/${e.id}`} className="block px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{e.title}</p>
                        <span className={`${e.status === 'published' ? 'badge-green' : 'badge-yellow'} shrink-0`}>{t(`exams.${e.status}`)}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{e.subject} · {e.questionCount || 0} {t('exams.questions')}</p>
                    </Link>
                  ))}
                  {exams.length === 0 && (
                    <div className="px-5 py-9 text-center">
                      <ClipboardList className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{t('exams.noExams')}</p>
                      <Link to="/exams/new" className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
                        {t('teacherDashboard.createFirstExam', 'Создать первый тест')}
                      </Link>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* ── Needs attention: only when there is something to look at ── */}
          {organizationId && attentionAttempts.length > 0 && (
            <section className="card overflow-hidden">
              <ListHeader title={t('teacherDashboard.attention', 'Требуют внимания')} to="/results" linkLabel={t('teacherDashboard.viewAll')} />
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {attentionAttempts.map((a) => (
                  <div key={a.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{a.studentName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{a.examTitle}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm tabular-nums">{a.percentage}%</p>
                      <p className={`text-xs ${a.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        {a.passed ? t('teacherDashboard.pass') : t('teacherDashboard.fail')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Classroom tool: collapsed by default, expands to full width ── */}
          {organizationId && <TeacherWheelOfFortune {...(wheelProps || {})} />}
        </div>

        {/* ═══ RIGHT: Quick links ═══ */}
        {organizationId && (
          <aside className="lg:w-[260px] xl:w-[280px] shrink-0">
            <div className="lg:sticky lg:top-4">
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
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
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors group"
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
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

const TeacherDashboard: React.FC = () => {
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

  return (
    <TeacherDashboardView
      firstName={profile?.displayName?.split(' ')[0]}
      organizationId={organizationId}
      lessons={lessons}
      exams={exams}
      rooms={rooms}
      attempts={attempts}
      inviteCount={inviteCount}
    />
  );
};

export default TeacherDashboard;
