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
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center ring-1 ring-indigo-500/30 shadow-inner">
            <BarChart3 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">Аналитика успеваемости</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Контроль качества обучения, посещаемости и активности</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-white to-slate-50 dark:from-slate-800 dark:to-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
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
            {/* Students Tracked */}
            <div className="relative overflow-hidden bg-white dark:bg-[#151f2e] p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 shadow-sm hover:shadow-lg transition-shadow group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                 <GraduationCap className="w-24 h-24 text-blue-500 -mr-8 -mt-8" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400/20 to-indigo-500/20 flex items-center justify-center mb-4 ring-1 ring-blue-500/30">
                  <GraduationCap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">{students.length}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Студентов</p>
              </div>
            </div>

            {/* Teachers Active */}
            <div className="relative overflow-hidden bg-white dark:bg-[#151f2e] p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 shadow-sm hover:shadow-lg transition-shadow group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                 <ClipboardList className="w-24 h-24 text-violet-500 -mr-8 -mt-8" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400/20 to-purple-500/20 flex items-center justify-center mb-4 ring-1 ring-violet-500/30">
                  <ClipboardList className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">{teachers.length}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Преподавателей</p>
              </div>
            </div>

            {/* Grades + Journal entries */}
            <div className="relative overflow-hidden bg-white dark:bg-[#151f2e] p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 shadow-sm hover:shadow-lg transition-shadow group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                 <TrendingUp className="w-24 h-24 text-emerald-500 -mr-8 -mt-8" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400/20 to-teal-500/20 flex items-center justify-center mb-4 ring-1 ring-emerald-500/30">
                  <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-4xl font-black text-slate-900 dark:text-white mb-1">{metrics.gradesCount}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Оценок · {metrics.journalsCount} записей</p>
              </div>
            </div>

            {/* Risk Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-white to-red-50 dark:from-[#151f2e] dark:to-red-900/10 p-6 rounded-2xl border border-red-200/80 dark:border-red-900/40 shadow-sm hover:shadow-lg transition-shadow group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                 <AlertTriangle className="w-24 h-24 text-red-500 -mr-8 -mt-8" />
              </div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-400/20 to-rose-500/20 flex items-center justify-center mb-4 ring-1 ring-red-500/50">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <p className="text-4xl font-black text-red-600 dark:text-red-400 mb-1">{metrics.atRiskCount || 0}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-red-500/80 dark:text-red-400/80">В зоне риска</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-[#151f2e] p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 shadow-sm flex flex-col min-h-[400px]">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Зона риска</h3>
                  <p className="text-xs text-slate-500">Студенты, требующие внимания</p>
                </div>
              </div>
              
              {metrics.atRiskStudents.length > 0 ? (
                <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {metrics.atRiskStudents.map(student => (
                    <div key={student.uid} className="flex items-center gap-4 p-3 bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50 rounded-xl hover:border-red-200 dark:hover:border-red-500/30 transition-colors group">
                      {student.avatarUrl ? (
                        <img src={student.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-slate-800 shadow-sm" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center text-white font-bold shrink-0 ring-2 ring-white dark:ring-slate-800 shadow-sm">
                          {student.displayName?.[0] || '?'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate">{student.displayName}</p>
                        <p className="text-xs text-slate-500 truncate">{student.email}</p>
                      </div>
                      <button className="px-4 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                        Профиль
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500/70">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="font-medium text-slate-700 dark:text-slate-300">Всё отлично!</p>
                  <p className="text-sm">Нет студентов в зоне риска</p>
                </div>
              )}
            </div>
            
            <div className="bg-white dark:bg-[#151f2e] p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 shadow-sm flex flex-col min-h-[400px]">
              <div className="flex items-center gap-3 mb-6">
                 <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-blue-500" />
                 </div>
                 <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Активность учителей</h3>
                    <p className="text-xs text-slate-500">Оценки и журналы</p>
                 </div>
              </div>
              
              <div className="space-y-5 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                 {teachers.map(teacher => {
                   const tGrades = grades.filter(g => g.createdBy === teacher.uid).length;
                   const tJournals = journals.filter(j => j.createdBy === teacher.uid).length;
                   const totalActions = tGrades + tJournals;
                   // Use logarithmic/capped scale for visual progress (max 100 actions = 100%)
                   const displayWidth = Math.min((totalActions / 100) * 100, 100) || 2; 
                   
                   return (
                     <div key={teacher.uid} className="flex flex-col gap-2 group">
                       <div className="flex justify-between items-center text-sm">
                         <div className="flex items-center gap-2">
                           {teacher.avatarUrl ? (
                              <img src={teacher.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                           ) : (
                              <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                                {teacher.displayName?.[0] || '?'}
                              </div>
                           )}
                           <span className="font-semibold text-slate-800 dark:text-slate-200">{teacher.displayName}</span>
                         </div>
                         <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">{totalActions} действий</span>
                       </div>
                       <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden flex ring-1 ring-inset ring-slate-900/5 dark:ring-white/5">
                         <div 
                           className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out flex group-hover:opacity-90" 
                           style={{ width: `${displayWidth}%` }}
                         >
                           {tGrades > 0 && <div className="h-full bg-indigo-500/50" style={{ width: `${(tGrades/totalActions)*100}%` }} title={`Оценки: ${tGrades}`} />}
                           {tJournals > 0 && <div className="h-full bg-blue-400/50" style={{ width: `${(tJournals/totalActions)*100}%` }} title={`Журнал: ${tJournals}`} />}
                         </div>
                       </div>
                     </div>
                   );
                 })}
                 {teachers.length === 0 && (
                   <div className="flex-1 flex flex-col items-center justify-center text-slate-500/70 h-full py-10">
                     <p>Нет закрепленных учителей</p>
                   </div>
                 )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
