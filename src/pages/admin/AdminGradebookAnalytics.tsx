import { useMemo, useState, useEffect } from 'react';
import { 
  orgGetCourses, 
  orgGetStudents, 
  orgGetTeachers,
  orgGetGrades,
  orgGetJournal
} from '../../lib/api';
import type { Course, UserProfile, GradeEntry, JournalEntry } from '../../types';
import { BarChart3, TrendingUp, GraduationCap, AlertTriangle, Download, ClipboardList, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminGradebookAnalytics() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [cRes, sRes, tRes] = await Promise.all([
          orgGetCourses(),
          orgGetStudents(),
          orgGetTeachers()
        ]);
        
        setStudents(sRes as UserProfile[]);
        setTeachers(tRes as UserProfile[]);

        // Fetch all grades and journals for all courses
        const allGrades = await Promise.all((cRes as Course[]).map(c => orgGetGrades(c.id).catch(() => [])));
        const allJournals = await Promise.all((cRes as Course[]).map(c => orgGetJournal(c.id).catch(() => [])));
        
        setGrades(allGrades.flat() as GradeEntry[]);
        setJournals(allJournals.flat() as JournalEntry[]);

      } catch (err: any) {
        toast.error(err.message || 'Ошибка загрузки аналитики');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const metrics = useMemo(() => {
    if (!grades.length && !journals.length) return null;

    // Averages
    const numericGrades = grades.filter(g => typeof g.value === 'number' && typeof g.maxValue === 'number' && g.maxValue > 0);
    const avgScore = numericGrades.length ? numericGrades.reduce((sum, g) => sum + ((g.value as number) / g.maxValue! * 100), 0) / numericGrades.length : 0;

    // Attendance Rate
    const totalAttendance = journals.length;
    const presentAttendance = journals.filter(j => j.attendance === 'present' || j.attendance === 'late').length;
    const attendanceRate = totalAttendance ? (presentAttendance / totalAttendance) * 100 : 0;

    // Risk Detection (students with < 60% avg grade AND < 70% attendance)
    const studentStats: Record<string, { totalGrades: number, passedGrades: number, totalAtt: number, presentAtt: number }> = {};
    numericGrades.forEach(g => {
      if (!studentStats[g.studentId]) studentStats[g.studentId] = { totalGrades: 0, passedGrades: 0, totalAtt: 0, presentAtt: 0 };
      studentStats[g.studentId].totalGrades++;
      if (((g.value as number) / g.maxValue! * 100) >= 60) studentStats[g.studentId].passedGrades++;
    });
    journals.forEach(j => {
      if (!studentStats[j.studentId]) studentStats[j.studentId] = { totalGrades: 0, passedGrades: 0, totalAtt: 0, presentAtt: 0 };
      studentStats[j.studentId].totalAtt++;
      if (j.attendance === 'present' || j.attendance === 'late') studentStats[j.studentId].presentAtt++;
    });

    const atRiskStudents = Object.entries(studentStats).filter(([, stats]) => {
      const gRate = stats.totalGrades ? (stats.passedGrades / stats.totalGrades) * 100 : 100;
      const aRate = stats.totalAtt ? (stats.presentAtt / stats.totalAtt) * 100 : 100;
      return gRate < 60 || aRate < 70;
    }).map(([id]) => students.find(s => s.uid === id)).filter(Boolean) as UserProfile[];

    return {
      avgScore,
      attendanceRate,
      gradesCount: numericGrades.length,
      journalsCount: journals.length,
      atRiskCount: atRiskStudents.length,
      atRiskStudents
    };
  }, [grades, journals, students]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary-500 rounded-full animate-spin border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Аналитика успеваемости</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Контроль качества обучения, посещаемости и активности</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
          <Download className="w-4 h-4" />
          Экспорт отчета
        </button>
      </div>

      {!metrics ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Нет данных для аналитики</h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">Оценки и данные о посещаемости пока отсутствуют.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{metrics.avgScore.toFixed(1)}%</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Средний балл по академии</p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{metrics.attendanceRate.toFixed(1)}%</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Общая посещаемость</p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{metrics.gradesCount}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Всего выставлено оценок</p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{metrics.atRiskCount}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Студентов в зоне риска</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col min-h-[400px]">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Студенты в зоне риска</h3>
              
              {metrics.atRiskStudents.length > 0 ? (
                <div className="space-y-3 flex-1 overflow-y-auto pr-2">
                  {metrics.atRiskStudents.map(student => (
                    <div key={student.uid} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 rounded-xl">
                      <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-600 font-bold shrink-0">
                        {student.displayName?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">{student.displayName}</p>
                        <p className="text-xs text-slate-500">{student.email}</p>
                      </div>
                      <button className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        Профиль
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-2 opacity-50" />
                  <p>Нет студентов в зоне риска</p>
                </div>
              )}
            </div>
            
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col min-h-[400px]">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Активность преподавателей</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Количество заполненных журналов и оценок</p>
              
              <div className="space-y-4 flex-1 overflow-y-auto pr-2">
                 {teachers.map(teacher => {
                   const tGrades = grades.filter(g => g.createdBy === teacher.uid).length;
                   const tJournals = journals.filter(j => j.createdBy === teacher.uid).length;
                   
                   return (
                     <div key={teacher.uid} className="flex flex-col gap-2">
                       <div className="flex justify-between items-center text-sm">
                         <span className="font-medium text-slate-900 dark:text-white">{teacher.displayName}</span>
                         <span className="text-slate-500">{tGrades + tJournals} действий</span>
                       </div>
                       <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                         <div className="h-full bg-indigo-500 hover:opacity-90" style={{ width: `${Math.min((tGrades / 100) * 100, 100)}%` }} title="Оценки" />
                         <div className="h-full bg-blue-500 hover:opacity-90" style={{ width: `${Math.min((tJournals / 100) * 100, 100)}%` }} title="Журнал" />
                       </div>
                     </div>
                   );
                 })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
