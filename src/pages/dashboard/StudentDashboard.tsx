import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { getLessonPlans } from '../../services/lessons.service';
import { getAttemptsByStudent } from '../../services/attempts.service';
import type { LessonPlan, ExamAttempt } from '../../types';
import { formatDate } from '../../utils/grading';
import { BookOpen, Radio, Trophy, XCircle, ArrowRight, Brain } from 'lucide-react';

const StudentDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.uid) {
      Promise.all([getLessonPlans(), getAttemptsByStudent(profile.uid)])
        .then(([l, a]) => { setLessons(l); setAttempts(a); })
        .finally(() => setLoading(false));
    }
  }, [profile?.uid]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" /></div>;

  const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length) : 0;
  const passRate = attempts.length > 0 ? Math.round((attempts.filter((a) => a.passed).length / attempts.length) * 100) : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('dashboard.welcome')}, {profile?.displayName}!</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t('studentDashboard.subtitle')}</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link to="/join" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all group text-center">
          <div className="w-12 h-12 bg-primary-500/10 dark:bg-primary-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <Radio className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('rooms.join')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('rooms.enterCode')}</p>
        </Link>
        <Link to="/lessons" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all group text-center">
          <div className="w-12 h-12 bg-violet-500/10 dark:bg-violet-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <BookOpen className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('lessons.title')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{lessons.length} {t('studentDashboard.available')}</p>
        </Link>
        <Link to="/my-results" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/30 transition-all group text-center">
          <div className="w-12 h-12 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <Trophy className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('nav.myResults')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{attempts.length} {t('studentDashboard.attempts')}</p>
        </Link>
      </div>

      {/* Stats */}
      {attempts.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: t('studentDashboard.examsTaken'), value: attempts.length },
            { label: t('studentDashboard.avgScore'), value: `${avgScore}%` },
            { label: t('studentDashboard.passRate'), value: `${passRate}%` },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l.subject} · {l.level} · {l.duration}min</p>
              </Link>
            ))}
            {lessons.length === 0 && <div className="px-5 py-6 text-center text-slate-400 dark:text-slate-500 text-sm">{t('lessons.noLessons')}</div>}
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
            {attempts.length === 0 && <div className="px-5 py-6 text-center text-slate-400 dark:text-slate-500 text-sm">{t('studentDashboard.noExams')}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
