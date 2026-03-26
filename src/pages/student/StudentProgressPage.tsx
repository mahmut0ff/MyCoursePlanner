import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgGetGrades, orgGetJournal } from '../../lib/api';
import type { Course, GradeEntry, JournalEntry } from '../../types';
import { TrendingUp, Award, BookOpen, AlertTriangle, Search, Flame, Target, Zap, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface CourseStats {
  courseId: string;
  courseTitle: string;
  gradesCount: number;
  avgScore: number | null; // out of 100
  totalAttended: number;
  totalClasses: number;
  attendanceRate: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high';
}

/* ═══ Animated ring ═══ */
const ProgressRing: React.FC<{ value: number; size?: number; stroke?: number; color: string; label: string }> = ({
  value, size = 100, stroke = 8, color, label
}) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke}
          className="text-slate-100 dark:text-slate-800" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-2xl font-black text-slate-900 dark:text-white">{value}%</span>
      </div>
      <p className="text-xs font-semibold text-slate-500 mt-2">{label}</p>
    </div>
  );
};

const StudentProgressPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [stats, setStats] = useState<CourseStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.organizationId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const allCourses = await orgGetCourses() as Course[];
        const courseIds = allCourses.map(c => c.id);
        
        const gradesPromises = courseIds.map(cId => orgGetGrades(cId).catch(() => []));
        const journalPromises = courseIds.map(cId => orgGetJournal(cId).catch(() => []));

        const gradesRes = await Promise.all(gradesPromises);
        const journalRes = await Promise.all(journalPromises);

        const newStats: CourseStats[] = [];

        allCourses.forEach((c, idx) => {
          const cGrades = gradesRes[idx] as GradeEntry[];
          const cJournal = journalRes[idx] as JournalEntry[];

          const numericGrades = cGrades.filter(g => typeof g.value === 'number' && g.value !== null);
          let avgScore = null;
          if (numericGrades.length > 0) {
            const sumPercents = numericGrades.reduce((acc, g) => acc + (g.value! / (g.maxValue || 100)) * 100, 0);
            avgScore = Math.round(sumPercents / numericGrades.length);
          }

          const totalClasses = cJournal.length;
          const totalAttended = cJournal.filter(j => j.attendance === 'present' || j.attendance === 'late').length;
          const attendanceRate = totalClasses > 0 ? Math.round((totalAttended / totalClasses) * 100) : 100;

          let riskLevel: 'low' | 'medium' | 'high' = 'low';
          if (attendanceRate < 70 || (avgScore !== null && avgScore < 50)) {
            riskLevel = 'high';
          } else if (attendanceRate < 85 || (avgScore !== null && avgScore < 70)) {
            riskLevel = 'medium';
          }

          if (totalClasses > 0 || numericGrades.length > 0) {
            newStats.push({
              courseId: c.id,
              courseTitle: c.title,
              gradesCount: numericGrades.length,
              avgScore,
              totalClasses,
              totalAttended,
              attendanceRate,
              riskLevel
            });
          }
        });

        setStats(newStats);
      } catch (err: any) {
        console.error('Progress load error:', err);
        toast.error(err.message || 'Ошибка загрузки статистики');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [profile?.uid, profile?.organizationId]);

  /* ═══ Loading ═══ */
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 p-4 sm:p-6 animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded-lg w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-6 h-32 border border-slate-200 dark:border-slate-700" />
          ))}
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 h-64 border border-slate-200 dark:border-slate-700" />
      </div>
    );
  }

  const avgTotalScore = useMemo(() => {
    const scored = stats.filter(s => s.avgScore !== null);
    if (scored.length === 0) return 0;
    return Math.round(scored.reduce((acc, s) => acc + (s.avgScore || 0), 0) / scored.length);
  }, [stats]);

  const avgTotalAttendance = useMemo(() => {
    if (stats.length === 0) return 0;
    return Math.round(stats.reduce((acc, s) => acc + s.attendanceRate, 0) / stats.length);
  }, [stats]);

  const scoreColor = avgTotalScore >= 80 ? '#10B981' : avgTotalScore >= 60 ? '#F59E0B' : '#EF4444';
  const attendColor = avgTotalAttendance >= 80 ? '#6366F1' : avgTotalAttendance >= 60 ? '#F59E0B' : '#EF4444';

  /* ═══ No Organization ═══ */
  if (!profile?.organizationId) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="relative mx-auto w-32 h-32 mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 to-indigo-500/20 rounded-full animate-pulse" />
          <div className="absolute inset-2 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-lg">
            <Search className="w-12 h-12 text-violet-500" />
          </div>
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2">
          {t('progress.noOrg', 'Найдите свой учебный центр')}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-sm mx-auto">
          {t('progress.noOrgDesc', 'Вступите в организацию, чтобы начать отслеживать свои оценки, посещаемость и прогресс.')}
        </p>
        <button
          onClick={() => navigate('/directory')}
          className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-violet-200 dark:shadow-violet-900/30"
        >
          {t('progress.browseOrgs', 'Найти организацию')}
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* Motivational features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
          {[
            { icon: Target, title: t('progress.feat1', 'Отслеживай оценки'), desc: t('progress.feat1d', 'Средний балл по всем курсам'), color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' },
            { icon: Flame, title: t('progress.feat2', 'Посещаемость'), desc: t('progress.feat2d', 'Процент присутствия'), color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
            { icon: Zap, title: t('progress.feat3', 'Зона риска'), desc: t('progress.feat3d', 'Предупреждения о проблемах'), color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
          ].map((f, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 text-center">
              <div className={`w-10 h-10 rounded-xl ${f.color} flex items-center justify-center mx-auto mb-3`}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">{f.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ═══ No Data Yet ═══ */
  if (stats.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="relative mx-auto w-32 h-32 mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-full animate-pulse" />
          <div className="absolute inset-2 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-lg">
            <Award className="w-12 h-12 text-amber-500" />
          </div>
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2">
          {t('progress.noData', 'Скоро здесь будет ваша статистика')}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-sm mx-auto">
          {t('progress.noDataDesc', 'Начните обучение — оценки и посещаемость появятся здесь автоматически. Пока что можно проверить расписание.')}
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => navigate('/student/courses')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 transition-all"
          >
            <BookOpen className="w-4 h-4" /> {t('progress.viewCourses', 'Мои курсы')}
          </button>
          <button
            onClick={() => navigate('/lessons')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
          >
            {t('progress.viewSchedule', 'Расписание')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('nav.progress', 'Мой прогресс')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('progress.summary', 'Сводка по успеваемости и посещаемости')}
            </p>
          </div>
        </div>
      </div>

      {/* Top KPI — circular progress rings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 flex flex-col items-center shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-600" />
          <div className="relative">
            <ProgressRing value={avgTotalScore} color={scoreColor} label={t('progress.avgScore', 'Средняя оценка')} />
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 flex flex-col items-center shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-400 to-indigo-600" />
          <div className="relative">
            <ProgressRing value={avgTotalAttendance} color={attendColor} label={t('progress.attendance', 'Посещаемость')} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-blue-600" />
          <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400 mb-3">
            <BookOpen className="w-5 h-5" />
            <h3 className="font-semibold text-sm">{t('progress.activeCourses', 'Активных курсов')}</h3>
          </div>
          <p className="text-4xl font-black text-slate-900 dark:text-white">{stats.length}</p>
          <p className="text-xs text-slate-400 mt-1">{t('progress.withGrades', 'с оценками или занятиями')}</p>
        </div>
      </div>

      {/* Courses List */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('progress.courseDetails', 'Детализация по курсам')}</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {stats.map(s => (
            <div key={s.courseId} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  {s.courseTitle}
                  {s.riskLevel === 'high' && (
                    <span className="flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse">
                      <AlertTriangle className="w-3 h-3" />
                      {t('progress.atRisk', 'В зоне риска')}
                    </span>
                  )}
                  {s.riskLevel === 'medium' && (
                    <span className="flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      {t('progress.warning', 'Внимание')}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {t('progress.grades', 'Оценок')}: {s.gradesCount} • {t('progress.classes', 'Занятий')}: {s.totalClasses}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1 tracking-wider">{t('progress.performance', 'Успеваемость')}</p>
                  <div className="flex items-center gap-3 w-32">
                    <div className="h-2.5 flex-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${
                          (s.avgScore || 0) >= 80 ? 'bg-emerald-500' : 
                          (s.avgScore || 0) >= 60 ? 'bg-amber-500' : 'bg-red-500'
                        }`} 
                        style={{ width: `${s.avgScore || 0}%` }} 
                      />
                    </div>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-10 text-right">
                      {s.avgScore !== null ? `${s.avgScore}%` : '—'}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1 tracking-wider">{t('progress.attendLabel', 'Посещаемость')}</p>
                  <div className="flex items-center gap-3 w-32">
                    <div className="h-2.5 flex-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${
                          s.attendanceRate >= 80 ? 'bg-indigo-500' : 
                          s.attendanceRate >= 60 ? 'bg-amber-500' : 'bg-red-500'
                        }`} 
                        style={{ width: `${s.attendanceRate}%` }} 
                      />
                    </div>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-10 text-right">
                      {s.attendanceRate}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudentProgressPage;
