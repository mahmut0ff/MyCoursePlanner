import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgGetGrades, orgGetJournal, orgGetGroups } from '../../lib/api';
import type { Course, GradeEntry, JournalEntry } from '../../types';
import { Calendar, BookOpen, Star, Clock, FileWarning, MessageSquare, XCircle, Activity, GraduationCap, Sparkles } from 'lucide-react';

type TimelineEvent = 
  | { type: 'grade'; date: string; data: GradeEntry; courseTitle: string; id: string }
  | { type: 'journal'; date: string; data: JournalEntry; courseTitle: string; id: string };

function safeISODate(raw: any): string | null {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch { return null; }
}

export default function StudentDiaryPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');

  useEffect(() => {
    if (!profile?.uid || !profile?.activeOrgId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [allCourses, allGroups] = await Promise.all([
          orgGetCourses(),
          orgGetGroups()
        ]);

        const myGroups = (allGroups as any[]).filter(g => g.studentIds?.includes(profile.uid));
        const myCourseIds = new Set(myGroups.map(g => g.courseId));
        
        const myCourses = (allCourses as Course[]).filter(c => myCourseIds.has(c.id));
        setCourses(myCourses);

        if (myCourses.length === 0) {
          setEvents([]);
          return;
        }

        const [gradesRes, journalRes] = await Promise.all([
          orgGetGrades().catch(() => []),
          orgGetJournal().catch(() => [])
        ]);

        const newEvents: TimelineEvent[] = [];
        
        if (Array.isArray(gradesRes)) {
          gradesRes.forEach((g: GradeEntry) => {
            if (!myCourseIds.has(g.courseId)) return;
            const courseTitle = myCourses.find(c => c.id === g.courseId)?.title || 'Неизвестный курс';
            const date = safeISODate(g.updatedAt || g.createdAt);
            if (!date) return;
            newEvents.push({ type: 'grade', id: `grade_${g.id}`, date, data: g, courseTitle });
          });
        }

        if (Array.isArray(journalRes)) {
          journalRes.forEach((j: JournalEntry) => {
            if (!myCourseIds.has(j.courseId)) return;
            const courseTitle = myCourses.find(c => c.id === j.courseId)?.title || 'Неизвестный курс';
            const eventDate = safeISODate(j.date);
            if (!eventDate) return;
            newEvents.push({ type: 'journal', id: `journal_${j.id}`, date: eventDate, data: j, courseTitle });
          });
        }

        // Sort descending
        newEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setEvents(newEvents);
        
      } catch (err: any) {
        if (err.message?.includes('403') || err.message?.includes('Forbidden')) {
          setError(t('common.accessDenied', 'Нет доступа к данным'));
        } else {
          setError(err.message || 'Ошибка загрузки дневника');
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [profile?.uid, profile?.activeOrgId]);

  const filteredEvents = useMemo(() => {
    if (selectedCourseId === 'all') return events;
    return events.filter(e => e.data.courseId === selectedCourseId);
  }, [events, selectedCourseId]);

  // Derived Statistics
  const stats = useMemo(() => {
    let totalScorePct = 0;
    let scoreCount = 0;
    let presentCount = 0;
    let totalAttendance = 0; // exclude excused

    filteredEvents.forEach(evt => {
      if (evt.type === 'grade') {
        const g = evt.data as GradeEntry;
        if (typeof g.value === 'number' && g.maxValue && g.maxValue > 0) {
          totalScorePct += (g.value / g.maxValue) * 100;
          scoreCount++;
        } else if (g.displayValue && typeof g.displayValue === 'string') {
          // Attempt to convert "5", "4" standard grades
          const val = parseFloat(g.displayValue);
          if (!isNaN(val) && val <= 5) {
             totalScorePct += (val / 5) * 100;
             scoreCount++;
          }
        }
      } else if (evt.type === 'journal') {
        const j = evt.data as JournalEntry;
        if (j.attendance !== 'excused') {
          totalAttendance++;
          if (j.attendance === 'present' || j.attendance === 'late') {
            presentCount++;
          }
        }
      }
    });

    const avgScore = scoreCount > 0 ? Math.round(totalScorePct / scoreCount) : null;
    const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : null;

    return { avgScore, attendanceRate, totalEvents: filteredEvents.length };
  }, [filteredEvents]);

  // Group events by Day and Course
  const groupedDays = useMemo(() => {
    type DayRecord = {
      courseId: string;
      courseTitle: string;
      grade?: GradeEntry;
      journal?: JournalEntry;
    };
    const dayMap: Record<string, Record<string, DayRecord>> = {};

    filteredEvents.forEach(evt => {
      const d = new Date(evt.date);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy_mm_dd = `${yyyy}-${mm}-${dd}`;
      
      if (!dayMap[yyyy_mm_dd]) {
        dayMap[yyyy_mm_dd] = {};
      }
      
      const cId = evt.data.courseId;
      if (!dayMap[yyyy_mm_dd][cId]) {
        dayMap[yyyy_mm_dd][cId] = { courseId: cId, courseTitle: evt.courseTitle };
      }

      if (evt.type === 'grade') {
        dayMap[yyyy_mm_dd][cId].grade = evt.data as GradeEntry;
      } else {
        dayMap[yyyy_mm_dd][cId].journal = evt.data as JournalEntry;
      }
    });

    const arr = Object.entries(dayMap).map(([yyyy_mm_dd, courseRecords]) => {
       const dateObj = new Date(yyyy_mm_dd);
       let dateStr = dateObj.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
       dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

       return {
         dateObj,
         dateStr,
         records: Object.values(courseRecords)
       };
    });

    arr.sort((a,b) => b.dateObj.getTime() - a.dateObj.getTime());
    return arr;
  }, [filteredEvents]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4 animate-pulse">
        <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
          <BookOpen className="w-6 h-6 text-primary-500 animate-pulse" />
        </div>
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">Загрузка дневника...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-16 p-8 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-3xl text-center">
        <div className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('common.error', 'Ошибка загрузки дневника')}</div>
        <p className="text-slate-500 dark:text-slate-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 px-4 sm:px-0 pb-20">
      
      {/* Header Section */}
      <div className="relative overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-primary-500/25 shrink-0">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {t('nav.diary', 'Мой дневник')}
              </h1>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Классический школьный формат
              </p>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="flex items-center gap-6 md:gap-8 min-w-max border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-700 pt-5 md:pt-0 md:pl-8">
            <div className="text-center md:text-left">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Средний балл</p>
              <div className="flex items-center gap-2">
                <Star className={`w-5 h-5 ${stats.avgScore !== null && stats.avgScore >= 80 ? 'text-emerald-500' : 'text-amber-500'}`} fill="currentColor" />
                <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.avgScore !== null ? `${stats.avgScore}%` : '—'}</span>
              </div>
            </div>
            <div className="text-center md:text-left">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Посещаемость</p>
              <div className="flex items-center gap-2">
                <GraduationCap className={`w-5 h-5 ${stats.attendanceRate !== null && stats.attendanceRate >= 80 ? 'text-indigo-500' : 'text-orange-500'}`} />
                <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.attendanceRate !== null ? `${stats.attendanceRate}%` : '—'}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary-400/5 dark:bg-primary-400/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Filters */}
      {courses.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none snap-x">
          <button
            onClick={() => setSelectedCourseId('all')}
            className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-sm font-bold transition-all snap-start ${
              selectedCourseId === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-slate-200 dark:border-slate-700'
            }`}
          >
            Все курсы
          </button>
          {courses.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCourseId(c.id)}
              className={`whitespace-nowrap px-5 py-2.5 rounded-xl text-sm font-bold transition-all snap-start ${
                selectedCourseId === c.id
                  ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      {/* Classic Diary View */}
      <div className="max-w-3xl mx-auto space-y-6">
        {groupedDays.length === 0 ? (
          <div className="py-20 text-center bg-white/50 dark:bg-slate-800/20 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 backdrop-blur-sm">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-5 rotate-12 transition-transform hover:rotate-0 duration-300">
              <Calendar className="w-10 h-10 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Здесь пока пусто</h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              По выбранным фильтрам нет оценок или отметок о посещаемости.
            </p>
          </div>
        ) : (
          groupedDays.map((day, dIdx) => (
            <div key={day.dateStr} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-3xl shadow-sm overflow-hidden slide-up" style={{ animationDelay: `${dIdx * 100}ms` }}>
              {/* Day Header */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700/80 px-6 py-4 flex items-center gap-3">
                <div className="w-2 h-6 bg-primary-500 rounded-full" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {day.dateStr}
                </h2>
              </div>
              
              {/* Lessons/Records list */}
              <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {day.records.map((rec, rIdx) => {
                  
                  // Evaluate Attendance
                  const j = rec.journal;
                  let attBadge = null;
                  if (j) {
                    if (j.attendance === 'absent') attBadge = <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"><XCircle className="w-3.5 h-3.5" />Пропуск</span>;
                    else if (j.attendance === 'late') attBadge = <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"><Clock className="w-3.5 h-3.5" />Опоздание</span>;
                    else if (j.attendance === 'excused') attBadge = <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"><FileWarning className="w-3.5 h-3.5" />Ув. причина</span>;
                    else if (j.attendance === 'present' && j.participation) {
                      attBadge = <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"><Activity className="w-3.5 h-3.5" /> {j.participation}</span>;
                    }
                  }

                  // Evaluate Grade
                  const g = rec.grade;
                  let gradeBox = null;
                  if (g) {
                    let isHighGrade = false;
                    let isMidGrade = false;
                    if (typeof g.value === 'number' && g.maxValue) {
                      const p = g.value / g.maxValue;
                      isHighGrade = p >= 0.85;
                      isMidGrade = p >= 0.7 && p < 0.85;
                    } else if (g.displayValue && typeof g.displayValue === 'string') {
                      isHighGrade = ['5', 'A', 'Отлично'].includes(g.displayValue);
                      isMidGrade = ['4', 'B', 'Хорошо'].includes(g.displayValue);
                    }
                    
                    const bgClr = isHighGrade ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400' 
                                : isMidGrade ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-400' 
                                : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400';

                    gradeBox = (
                      <div className={`w-12 h-12 flex items-center justify-center rounded-xl border-2 font-black text-xl shrink-0 shadow-sm ${bgClr}`}>
                        {g.displayValue || g.value || (g.status !== 'normal' ? g.status.substring(0,3).toUpperCase() : '?')}
                      </div>
                    );
                  } else {
                    gradeBox = <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-600 font-bold text-sm shrink-0">—</div>;
                  }

                  const noteText = g?.comment || j?.note;

                  return (
                    <div key={rec.courseId + rIdx} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-3 mb-1.5">
                           <h3 className="font-bold text-slate-800 dark:text-white text-base truncate">{rec.courseTitle}</h3>
                           {attBadge}
                         </div>
                         {noteText ? (
                           <div className="flex items-start gap-1.5 mt-2 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                             <MessageSquare className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                             <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 italic">"{noteText}"</p>
                           </div>
                         ) : (
                           <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Заметок нет</p>
                         )}
                       </div>

                       <div className="flex items-center justify-end self-end sm:self-center pl-4 border-l border-slate-100 dark:border-slate-700/50">
                          {gradeBox}
                       </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .slide-up {
          animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
