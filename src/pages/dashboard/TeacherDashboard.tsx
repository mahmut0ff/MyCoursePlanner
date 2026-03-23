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
  Users, MailOpen, UserCircle2, Calendar, Briefcase,
} from 'lucide-react';

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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" /></div>;

  const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length) : 0;
  const recentAttempts = attempts.filter(a => !a.passed || a.percentage < 100).slice(0, 5);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('teacherDashboard.welcome')}, {profile?.displayName?.split(' ')[0] || ''}! 👋
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {organizationId ? t('teacherDashboard.subtitleOrg') : t('teacherDashboard.subtitleNoOrg')}
          </p>
        </div>
        <div className="flex gap-2">
          {organizationId && (
            <>
              <Link to="/lessons/new" className="btn-primary flex items-center gap-2 !py-2 text-sm"><Plus className="w-4 h-4" />{t('teacherDashboard.newLesson')}</Link>
              <Link to="/exams/new" className="btn-secondary flex items-center gap-2 !py-2 text-sm"><Plus className="w-4 h-4" />{t('teacherDashboard.newExam')}</Link>
            </>
          )}
        </div>
      </div>

      {/* Quick Actions Row (no org) */}
      {!organizationId && (
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-2xl p-6 mb-8">
          <h2 className="font-semibold text-primary-900 dark:text-primary-300 mb-2">{t('teacherDashboard.getStarted')}</h2>
          <p className="text-sm text-primary-700 dark:text-primary-400 mb-4">{t('teacherDashboard.getStartedDesc')}</p>
          <div className="flex gap-3">
            <Link to="/teacher-profile" className="btn-primary text-sm flex items-center gap-2"><UserCircle2 className="w-4 h-4" />{t('teacherDashboard.fillProfile')}</Link>
            <Link to="/vacancies" className="btn-secondary text-sm flex items-center gap-2"><Briefcase className="w-4 h-4" />{t('teacherDashboard.browseVacancies')}</Link>
            {inviteCount > 0 && (
              <Link to="/invites" className="btn-secondary text-sm flex items-center gap-2">
                <MailOpen className="w-4 h-4" />{t('teacherDashboard.viewInvites')}
                <span className="bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">{inviteCount}</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {organizationId && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: t('teacherDashboard.myLessons'), value: lessons.length, icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-500/10 dark:bg-blue-500/20' },
            { label: t('teacherDashboard.myExams'), value: exams.length, icon: ClipboardList, color: 'text-violet-500', bg: 'bg-violet-500/10 dark:bg-violet-500/20' },
            { label: t('teacherDashboard.activeRooms'), value: rooms.length, icon: Radio, color: 'text-emerald-500', bg: 'bg-emerald-500/10 dark:bg-emerald-500/20' },
            { label: t('teacherDashboard.avgScore'), value: `${avgScore}%`, icon: TrendingUp, color: 'text-amber-500', bg: 'bg-amber-500/10 dark:bg-amber-500/20' },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.bg}`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite banner */}
      {inviteCount > 0 && organizationId && (
        <Link to="/invites" className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-6 hover:shadow-md transition-all">
          <MailOpen className="w-5 h-5 text-amber-500" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('teacherDashboard.pendingInvites', { count: inviteCount })}</span>
          <ArrowRight className="w-4 h-4 text-amber-500 ml-auto" />
        </Link>
      )}

      {/* Content Grid */}
      {organizationId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              {lessons.length === 0 && <div className="px-5 py-6 text-center text-slate-400 dark:text-slate-500 text-sm">{t('lessons.noLessons')}</div>}
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
              {exams.length === 0 && <div className="px-5 py-6 text-center text-slate-400 dark:text-slate-500 text-sm">{t('exams.noExams')}</div>}
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
              {attempts.length === 0 && <div className="px-5 py-6 text-center text-slate-400 dark:text-slate-500 text-sm">{t('teacherDashboard.noResults')}</div>}
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <h2 className="font-semibold text-slate-900 dark:text-white mb-3">{t('teacherDashboard.quickLinks')}</h2>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/teacher-profile" className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <UserCircle2 className="w-4 h-4" />{t('nav.myProfile')}
              </Link>
              <Link to="/schedule" className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <Calendar className="w-4 h-4" />{t('nav.schedule')}
              </Link>
              <Link to="/vacancies" className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <Briefcase className="w-4 h-4" />{t('nav.vacancies')}
              </Link>
              <Link to="/my-applications" className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <Briefcase className="w-4 h-4" />{t('nav.myApplications')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
