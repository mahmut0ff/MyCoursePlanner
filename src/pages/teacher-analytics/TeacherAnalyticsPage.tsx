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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-primary-600 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div>;

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
    { label: t('teacherAnalytics.totalLessons'), value: lessons.length, icon: BookOpen, color: 'text-slate-400', bg: '' },
    { label: t('teacherAnalytics.totalExams'), value: exams.length, icon: ClipboardList, color: 'text-slate-400', bg: '' },
    { label: t('teacherAnalytics.uniqueStudents'), value: uniqueStudents, icon: Users, color: 'text-slate-400', bg: '' },
    { label: t('teacherAnalytics.totalAttempts'), value: attempts.length, icon: TrendingUp, color: 'text-slate-400', bg: '' },
    { label: t('teacherAnalytics.avgScore'), value: `${avgScore}%`, icon: Award, color: 'text-slate-400', bg: '' },
    { label: t('teacherAnalytics.passRate'), value: `${passRate}%`, icon: BarChart3, color: 'text-slate-400', bg: '' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('teacherAnalytics.title')}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('teacherAnalytics.subtitle')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            <div className="flex flex-row-reverse items-start justify-between gap-3">
              <div className={`shrink-0 pt-0.5 ${s.bg}`}>
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              </div>
              <div className="flex flex-col">
                <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 order-2">{s.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 order-1">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Score Distribution */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t('teacherAnalytics.scoreDistribution')}</h2>
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
                  <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{d.count}</span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full ${d.color} rounded-full transition-all duration-500`} style={{ width: `${(d.count / maxDist) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Exam Status Breakdown */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t('teacherAnalytics.examBreakdown')}</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">{t('teacherAnalytics.published')}</span>
              <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium tabular-nums bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{publishedExams}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">{t('teacherAnalytics.drafts')}</span>
              <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium tabular-nums bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{draftExams}</span>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{t('teacherAnalytics.total')}</span>
                <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{exams.length}</span>
              </div>
            </div>
          </div>

          {/* Top Exams */}
          {attempts.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('teacherAnalytics.topExams')}</h3>
              <div className="space-y-2">
                {exams.slice(0, 5).map(e => {
                  const examAttempts = attempts.filter(a => a.examTitle === e.title);
                  const avg = examAttempts.length > 0 ? Math.round(examAttempts.reduce((s, a) => s + a.percentage, 0) / examAttempts.length) : 0;
                  return (
                    <div key={e.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400 truncate flex-1">{e.title}</span>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-xs text-slate-400">{t('counts.attempts', { count: examAttempts.length })}</span>
                        <span className={`font-semibold tabular-nums ${avg >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{avg}%</span>
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
