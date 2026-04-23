import { useMemo, useState, useEffect } from 'react';
import { 
  orgGetCourses, 
  orgGetStudents, 
  orgGetTeachers,
  orgGetGrades,
  orgGetJournal,
  orgListBranches
} from '../../lib/api';
import type { Course, UserProfile, GradeEntry, JournalEntry } from '../../types';
import { BarChart3, TrendingUp, GraduationCap, AlertTriangle, Download, ClipboardList, CheckCircle2, Filter, TrendingDown, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';

// ── Russian pluralization ──────────────────────────
function pluralize(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

type Period = 'all' | 'month' | 'quarter' | 'year';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'year', label: 'Год' },
  { id: 'all', label: 'Всё время' },
];

function getPeriodStart(period: Period): Date {
  const now = new Date();
  switch (period) {
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter': return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case 'year': return new Date(now.getFullYear(), 0, 1);
    default: return new Date(2020, 0, 1);
  }
}

interface Branch { id: string; name: string; }

export default function AdminGradebookAnalytics() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [period, setPeriod] = useState<Period>('all');
  const [branchId, setBranchId] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [cRes, sRes, tRes, bRes] = await Promise.all([
          orgGetCourses(),
          orgGetStudents(),
          orgGetTeachers(),
          orgListBranches().catch(() => []),
        ]);
        
        setStudents(sRes as UserProfile[]);
        setTeachers(tRes as UserProfile[]);
        setBranches(Array.isArray(bRes) ? bRes as Branch[] : []);

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

  // ── Filter data by period + branch ──
  const filteredData = useMemo(() => {
    const periodStart = getPeriodStart(period);
    const periodIso = periodStart.toISOString();

    let fGrades = grades;
    let fJournals = journals;
    let fStudents = students;

    // Period filter
    if (period !== 'all') {
      fGrades = fGrades.filter(g => (g as any).createdAt >= periodIso || (g as any).date >= periodIso);
      fJournals = fJournals.filter(j => (j as any).date >= periodIso);
    }

    // Branch filter
    if (branchId) {
      const branchStudentIds = new Set(
        students.filter((s: any) => s.branchId === branchId || (s.branchIds || []).includes(branchId)).map(s => s.uid)
      );
      fGrades = fGrades.filter(g => branchStudentIds.has(g.studentId));
      fJournals = fJournals.filter(j => branchStudentIds.has(j.studentId));
      fStudents = students.filter(s => branchStudentIds.has(s.uid));
    }

    return { grades: fGrades, journals: fJournals, students: fStudents };
  }, [grades, journals, students, period, branchId]);

  const metrics = useMemo(() => {
    const { grades: fg, journals: fj, students: fs } = filteredData;
    if (!fg.length && !fj.length) return null;

    // Averages
    const numericGrades = fg.filter(g => typeof g.value === 'number' && typeof g.maxValue === 'number' && g.maxValue > 0);
    const avgScore = numericGrades.length ? numericGrades.reduce((sum, g) => sum + ((g.value as number) / g.maxValue! * 100), 0) / numericGrades.length : 0;

    // Attendance Rate
    const totalAttendance = fj.length;
    const presentAttendance = fj.filter(j => j.attendance === 'present' || j.attendance === 'late').length;
    const attendanceRate = totalAttendance ? (presentAttendance / totalAttendance) * 100 : 0;

    // Risk Detection (students with < 60% avg grade OR < 70% attendance)
    const studentStats: Record<string, { totalGrades: number; passedGrades: number; totalAtt: number; presentAtt: number; gradePercent: number; attPercent: number }> = {};
    numericGrades.forEach(g => {
      if (!studentStats[g.studentId]) studentStats[g.studentId] = { totalGrades: 0, passedGrades: 0, totalAtt: 0, presentAtt: 0, gradePercent: 0, attPercent: 100 };
      studentStats[g.studentId].totalGrades++;
      if (((g.value as number) / g.maxValue! * 100) >= 60) studentStats[g.studentId].passedGrades++;
    });
    fj.forEach(j => {
      if (!studentStats[j.studentId]) studentStats[j.studentId] = { totalGrades: 0, passedGrades: 0, totalAtt: 0, presentAtt: 0, gradePercent: 0, attPercent: 100 };
      studentStats[j.studentId].totalAtt++;
      if (j.attendance === 'present' || j.attendance === 'late') studentStats[j.studentId].presentAtt++;
    });

    // Calculate percentages
    Object.values(studentStats).forEach(s => {
      s.gradePercent = s.totalGrades ? (s.passedGrades / s.totalGrades) * 100 : 100;
      s.attPercent = s.totalAtt ? (s.presentAtt / s.totalAtt) * 100 : 100;
    });

    const atRiskStudents = Object.entries(studentStats).filter(([, stats]) => {
      return stats.gradePercent < 60 || stats.attPercent < 70;
    }).map(([id]) => {
      const student = fs.find(s => s.uid === id);
      const stats = studentStats[id];
      return student ? { ...student, riskStats: stats } : null;
    }).filter(Boolean) as (UserProfile & { riskStats: typeof studentStats[string] })[];

    return {
      avgScore,
      attendanceRate,
      gradesCount: numericGrades.length,
      journalsCount: fj.length,
      atRiskCount: atRiskStudents.length,
      atRiskStudents,
      studentStats,
      studentsCount: fs.length,
    };
  }, [filteredData]);

  // ── CSV Export ──
  const handleExport = () => {
    if (!metrics) return;
    const header = 'Студент,Email,Успеваемость %,Посещаемость %,Статус\n';
    const rows = students.map(s => {
      const stats = metrics.studentStats[s.uid];
      const gp = stats ? Math.round(stats.gradePercent) : '-';
      const ap = stats ? Math.round(stats.attPercent) : '-';
      const risk = stats && (stats.gradePercent < 60 || stats.attPercent < 70) ? 'Зона риска' : 'Норма';
      return `"${s.displayName || ''}",${s.email || ''},${gp},${ap},${risk}`;
    }).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-slate-300 dark:border-slate-600 rounded-full animate-spin border-t-slate-900 dark:border-t-white" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Аналитика успеваемости</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Контроль качества обучения, посещаемости и активности</p>
        </div>
        <button
          onClick={handleExport}
          disabled={!metrics}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Экспорт отчета
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Filter className="w-3.5 h-3.5" />
          Фильтры:
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                period === p.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {branches.length > 1 && (
          <select
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-0 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Все филиалы</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
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
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-slate-500">Студентов</p>
                <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
                  <GraduationCap className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{metrics.studentsCount}</h3>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-slate-500">Преподавателей</p>
                <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
                  <BookOpen className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{teachers.length}</h3>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-slate-500">Оценок</p>
                <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{metrics.gradesCount}</h3>
              <p className="text-xs text-slate-400 mt-1">{metrics.journalsCount} {pluralize(metrics.journalsCount, 'запись', 'записи', 'записей')}</p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-amber-200 dark:border-amber-900/50">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-500">В зоне риска</p>
                <div className="p-2 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{metrics.atRiskCount || 0}</h3>
              <p className="text-xs text-amber-500/70 mt-1">{metrics.atRiskCount > 0 ? 'Требуют внимания' : 'Все в норме'}</p>
            </div>
          </div>

          {/* Bottom 2-col */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Zone */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col min-h-[380px]">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-4.5 h-4.5 text-amber-600 dark:text-amber-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">Зона риска</h3>
                  <p className="text-xs text-slate-500">Студенты, требующие внимания</p>
                </div>
              </div>
              
              {metrics.atRiskStudents.length > 0 ? (
                <div className="space-y-2 flex-1 overflow-y-auto">
                  {metrics.atRiskStudents.map(student => {
                    const stats = (student as any).riskStats;
                    const reasons: string[] = [];
                    if (stats.gradePercent < 60) reasons.push(`Успеваемость: ${Math.round(stats.gradePercent)}%`);
                    if (stats.attPercent < 70) reasons.push(`Посещаемость: ${Math.round(stats.attPercent)}%`);

                    return (
                      <div key={student.uid} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 rounded-xl">
                        {student.avatarUrl ? (
                          <img src={student.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300 shrink-0">
                            {student.displayName?.[0] || '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{student.displayName}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {reasons.map(r => (
                              <span key={r} className="text-[10px] font-medium px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-md flex items-center gap-1">
                                <TrendingDown className="w-2.5 h-2.5" />{r}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500/70">
                  <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                  </div>
                  <p className="font-medium text-sm text-slate-700 dark:text-slate-300">Всё отлично!</p>
                  <p className="text-xs text-slate-400">Нет студентов в зоне риска</p>
                </div>
              )}
            </div>
            
            {/* Teacher Activity */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col min-h-[380px]">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <ClipboardList className="w-4.5 h-4.5 text-slate-600 dark:text-slate-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">Активность учителей</h3>
                  <p className="text-xs text-slate-500">Оценки и журналы</p>
                </div>
              </div>
              
              <div className="space-y-4 flex-1 overflow-y-auto">
                {teachers.map(teacher => {
                  const { grades: fg, journals: fj } = filteredData;
                  const tGrades = fg.filter(g => g.createdBy === teacher.uid).length;
                  const tJournals = fj.filter(j => j.createdBy === teacher.uid).length;
                  const totalActions = tGrades + tJournals;
                  const displayWidth = Math.min((totalActions / 100) * 100, 100) || 2; 
                  
                  return (
                    <div key={teacher.uid} className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          {teacher.avatarUrl ? (
                            <img src={teacher.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                              {teacher.displayName?.[0] || '?'}
                            </div>
                          )}
                          <span className="font-medium text-slate-800 dark:text-slate-200">{teacher.displayName}</span>
                        </div>
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                          {totalActions} {pluralize(totalActions, 'действие', 'действия', 'действий')}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-slate-900 dark:bg-white/80 rounded-full transition-all duration-500 ease-out" 
                          style={{ width: `${displayWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {teachers.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 h-full py-10">
                    <p className="text-sm">Нет закрепленных учителей</p>
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
