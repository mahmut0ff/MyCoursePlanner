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
import { BookOpen, ClipboardList, Radio, Users, TrendingUp, ArrowRight, Plus } from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  useAuth();
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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" /></div>;

  const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length) : 0;

  const stats = [
    { label: t('dashboard.totalLessons'), value: lessons.length, icon: BookOpen, gradient: 'from-blue-500 to-blue-600', bg: 'bg-blue-500/10 dark:bg-blue-500/20' },
    { label: t('dashboard.totalExams'), value: exams.length, icon: ClipboardList, gradient: 'from-violet-500 to-violet-600', bg: 'bg-violet-500/10 dark:bg-violet-500/20' },
    { label: t('dashboard.activeRooms'), value: rooms.length, icon: Radio, gradient: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-500/10 dark:bg-emerald-500/20' },
    { label: t('dashboard.examAttempts'), value: `${avgScore}%`, icon: TrendingUp, gradient: 'from-amber-500 to-amber-600', bg: 'bg-amber-500/10 dark:bg-amber-500/20' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('dashboard.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Overview of your educational center</p>
        </div>
        <div className="flex gap-2">
          <Link to="/lessons/new" className="btn-primary flex items-center gap-2 !py-2 text-sm"><Plus className="w-4 h-4" />{t('dashboard.createLesson')}</Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.bg}`}>
                <s.icon className={`w-5 h-5 bg-gradient-to-r ${s.gradient} bg-clip-text`} style={{color: `var(--tw-gradient-from)`}} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Lessons */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('lessons.title')}</h2>
            <Link to="/lessons" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">View all<ArrowRight className="w-3.5 h-3.5" /></Link>
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

        {/* Recent Exams */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">{t('exams.title')}</h2>
            <Link to="/exams" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">View all<ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {exams.slice(0, 5).map((e) => (
              <Link key={e.id} to={`/exams/${e.id}`} className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-900 dark:text-white text-sm">{e.title}</p>
                  <span className={e.status === 'published' ? 'badge-green text-xs' : 'badge-yellow text-xs'}>{e.status}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{e.subject} · {e.questionCount || 0} questions</p>
              </Link>
            ))}
            {exams.length === 0 && <div className="px-5 py-6 text-center text-slate-400 dark:text-slate-500 text-sm">{t('exams.noExams')}</div>}
          </div>
        </div>

        {/* Active Rooms */}
        {rooms.length > 0 && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('rooms.title')}</h2>
              <Link to="/rooms" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 flex items-center gap-1">View all<ArrowRight className="w-3.5 h-3.5" /></Link>
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1"><Users className="w-3 h-3" />{r.participants.length} participants</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Results */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <h2 className="font-semibold text-slate-900 dark:text-white">Recent Results</h2>
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
                    <span className={`text-xs ${a.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{a.passed ? 'Pass' : 'Fail'}</span>
                  </div>
                </div>
              </div>
            ))}
            {attempts.length === 0 && <div className="px-5 py-6 text-center text-slate-400 dark:text-slate-500 text-sm">No results yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
