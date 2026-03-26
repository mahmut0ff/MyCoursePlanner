import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgGetGrades, orgGetJournal } from '../../lib/api';
import type { Course, GradeEntry, JournalEntry } from '../../types';
import { TrendingUp, Award, Star, BookOpen, UserCheck, AlertTriangle } from 'lucide-react';
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

const StudentProgressPage: React.FC = () => {
  const { t } = useTranslation();
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

          // Filter out null values
          const numericGrades = cGrades.filter(g => typeof g.value === 'number' && g.value !== null);
          let avgScore = null;
          if (numericGrades.length > 0) {
            // Normalize to percentage
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

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-500 rounded-full animate-spin border-t-transparent" /></div>;
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
              Сводка по успеваемости и посещаемости
            </p>
          </div>
        </div>
      </div>

      {!profile?.organizationId ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
          <Award className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Вы не состоите в организации</h2>
          <p className="text-slate-500 text-sm">Присоединитесь к учебному центру, чтобы отслеживать свой прогресс.</p>
        </div>
      ) : stats.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
          <Award className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Нет данных</h2>
          <p className="text-slate-500 text-sm">У вас пока нет оценок и отметок посещаемости. Начните обучение, и статистика появится здесь.</p>
        </div>
      ) : (
        <>
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 border-t-4 border-t-amber-500 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500 mb-2">
                <Star className="w-5 h-5" />
                <h3 className="font-semibold text-sm">Средняя оценка</h3>
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-white">
                {avgTotalScore}%
              </p>
            </div>
            
            <div className="bg-white dark:bg-slate-800 border-t-4 border-t-emerald-500 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-500 mb-2">
                <UserCheck className="w-5 h-5" />
                <h3 className="font-semibold text-sm">Посещаемость</h3>
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-white">
                {avgTotalAttendance}%
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 border-t-4 border-t-blue-500 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-3 text-blue-600 dark:text-blue-500 mb-2">
                <BookOpen className="w-5 h-5" />
                <h3 className="font-semibold text-sm">Активных курсов</h3>
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-white">
                {stats.length}
              </p>
            </div>
          </div>

          {/* Courses List */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Детализация по курсам</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {stats.map(s => (
                <div key={s.courseId} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                      {s.courseTitle}
                      {s.riskLevel !== 'low' && (
                        <span className="flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                          <AlertTriangle className="w-3 h-3" />
                          В зоне риска
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Оценок: {s.gradesCount} • Занятий: {s.totalClasses}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1 tracking-wider">Успеваемость</p>
                      <div className="flex items-center gap-3 w-32">
                        <div className="h-2 flex-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
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
                      <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1 tracking-wider">Посещаемость</p>
                      <div className="flex items-center gap-3 w-32">
                        <div className="h-2 flex-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
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
        </>
      )}
    </div>
  );
};

export default StudentProgressPage;
