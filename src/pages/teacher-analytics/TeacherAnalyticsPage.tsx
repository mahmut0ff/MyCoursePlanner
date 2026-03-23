import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { getLessonPlans } from '../../services/lessons.service';
import { getExams } from '../../services/exams.service';
import { getAllAttempts } from '../../services/attempts.service';
import type { LessonPlan, Exam, ExamAttempt } from '../../types';
import { BarChart3, BookOpen, ClipboardList, Users, TrendingUp, Award } from 'lucide-react';

const TeacherAnalyticsPage: React.FC = () => {
  const { t } = useTranslation();
  useAuth();
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getLessonPlans().catch(() => []),
      getExams().catch(() => []),
      getAllAttempts().catch(() => []),
    ]).then(([l, e, a]) => {
      setLessons(l || []);
      setExams(e || []);
      setAttempts(a || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" /></div>;

  const avgScore = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length) : 0;
  const passRate = attempts.length > 0 ? Math.round((attempts.filter(a => a.passed).length / attempts.length) * 100) : 0;
  const uniqueStudents = new Set(attempts.map(a => a.studentId || a.studentName)).size;
  const publishedExams = exams.filter(e => e.status === 'published').length;
  const draftExams = exams.filter(e => e.status === 'draft').length;

  // Score distribution
  const dist = { excellent: 0, good: 0, average: 0, poor: 0 };
  attempts.forEach(a => {
    if (a.percentage >= 90) dist.excellent++;
    else if (a.percentage >= 70) dist.good++;
    else if (a.percentage >= 50) dist.average++;
    else dist.poor++;
  });
  const maxDist = Math.max(dist.excellent, dist.good, dist.average, dist.poor, 1);

  const stats = [
    { label: t('teacherAnalytics.totalLessons'), value: lessons.length, icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-500/10 dark:bg-blue-500/20' },
    { label: t('teacherAnalytics.totalExams'), value: exams.length, icon: ClipboardList, color: 'text-violet-500', bg: 'bg-violet-500/10 dark:bg-violet-500/20' },
    { label: t('teacherAnalytics.uniqueStudents'), value: uniqueStudents, icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-500/10 dark:bg-emerald-500/20' },
    { label: t('teacherAnalytics.totalAttempts'), value: attempts.length, icon: TrendingUp, color: 'text-amber-500', bg: 'bg-amber-500/10 dark:bg-amber-500/20' },
    { label: t('teacherAnalytics.avgScore'), value: `${avgScore}%`, icon: Award, color: 'text-pink-500', bg: 'bg-pink-500/10 dark:bg-pink-500/20' },
    { label: t('teacherAnalytics.passRate'), value: `${passRate}%`, icon: BarChart3, color: 'text-cyan-500', bg: 'bg-cyan-500/10 dark:bg-cyan-500/20' },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('teacherAnalytics.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('teacherAnalytics.subtitle')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4">{t('teacherAnalytics.scoreDistribution')}</h2>
          <div className="space-y-3">
            {[
              { label: t('teacherAnalytics.excellent'), count: dist.excellent, color: 'bg-emerald-500' },
              { label: t('teacherAnalytics.good'), count: dist.good, color: 'bg-blue-500' },
              { label: t('teacherAnalytics.satisfactory'), count: dist.average, color: 'bg-amber-500' },
              { label: t('teacherAnalytics.poor'), count: dist.poor, color: 'bg-red-500' },
            ].map((d) => (
              <div key={d.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate-600 dark:text-slate-400">{d.label}</span>
                  <span className="font-medium text-slate-900 dark:text-white">{d.count}</span>
                </div>
                <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full ${d.color} rounded-full transition-all duration-500`} style={{ width: `${(d.count / maxDist) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Exam Status Breakdown */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4">{t('teacherAnalytics.examBreakdown')}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">{t('teacherAnalytics.published')}</span>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{publishedExams}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">{t('teacherAnalytics.drafts')}</span>
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">{draftExams}</span>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-900 dark:text-white">{t('teacherAnalytics.total')}</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{exams.length}</span>
              </div>
            </div>
          </div>

          {/* Top Exams */}
          {attempts.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('teacherAnalytics.topExams')}</h3>
              <div className="space-y-2">
                {exams.slice(0, 5).map(e => {
                  const examAttempts = attempts.filter(a => a.examTitle === e.title);
                  const avg = examAttempts.length > 0 ? Math.round(examAttempts.reduce((s, a) => s + a.percentage, 0) / examAttempts.length) : 0;
                  return (
                    <div key={e.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400 truncate flex-1">{e.title}</span>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-xs text-slate-400">{examAttempts.length} {t('teacherAnalytics.attempts')}</span>
                        <span className={`font-semibold ${avg >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{avg}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherAnalyticsPage;
