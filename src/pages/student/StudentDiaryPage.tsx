import { useState, useEffect, useMemo } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgGetGrades, orgGetJournal, orgGetGroups, apiGetOrgMembers } from '../../lib/api';
import type { Course, GradeEntry, JournalEntry } from '../../types';
import { ChevronLeft, ChevronRight, Search, MessageSquare } from 'lucide-react';

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

function getDaysForMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  let startDayOfWeek = firstDay.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6;
  
  const totalDays = lastDay.getDate();
  const days: { date: Date | null }[] = [];
  
  for (let i = 0; i < startDayOfWeek; i++) days.push({ date: null });
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month, i);
    d.setHours(0,0,0,0);
    days.push({ date: d });
  }

  // pad till full rows (multiple of 7)
  while (days.length % 7 !== 0) days.push({ date: null });

  return days;
}

export default function StudentDiaryPage() {

  const { profile } = useAuth();
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [teacherMap, setTeacherMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setDate(1); 
    d.setHours(0,0,0,0);
    return d;
  });

  useEffect(() => {
    if (!profile?.uid || !profile?.activeOrgId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [allCourses, allGroups, allMembers] = await Promise.all([
          orgGetCourses(),
          orgGetGroups(),
          apiGetOrgMembers(profile.activeOrgId!, 'active').catch(() => [])
        ]);

        const tMap = new Map<string, string>();
        if (Array.isArray(allMembers)) {
          allMembers.forEach((m: any) => tMap.set(m.uid, m.displayName || m.email));
        }
        setTeacherMap(tMap);

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
            
            let resolvedDateStr: string | null = null;
            
            if (g.lessonId && /^\\d{4}-\\d{2}-\\d{2}$/.test(g.lessonId)) {
               resolvedDateStr = g.lessonId;
            } else if (g.lessonId && Array.isArray(journalRes)) {
               const matchingJ = journalRes.find((j: any) => j.lessonId === g.lessonId && j.studentId === g.studentId);
               if (matchingJ && matchingJ.date) resolvedDateStr = matchingJ.date;
            }

            const finalDate = safeISODate(resolvedDateStr || g.updatedAt || g.createdAt);
            if (!finalDate) return;

            newEvents.push({ type: 'grade', id: `grade_${g.id}`, date: finalDate, data: g, courseTitle });
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

        setEvents(newEvents);
      } catch (err: any) {
         setError(err.message || 'Ошибка загрузки дневника');
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

  type DayRecord = {
    courseId: string;
    courseTitle: string;
    grade?: GradeEntry;
    journal?: JournalEntry;
    teacherName?: string;
  };

  const eventsByDate = useMemo(() => {
    const dayMap: Record<string, Record<string, DayRecord>> = {};

    filteredEvents.forEach(evt => {
      const d = new Date(evt.date);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy_mm_dd = `${yyyy}-${mm}-${dd}`;
      
      if (!dayMap[yyyy_mm_dd]) dayMap[yyyy_mm_dd] = {};
      
      const cId = evt.data.courseId;
      if (!dayMap[yyyy_mm_dd][cId]) {
        dayMap[yyyy_mm_dd][cId] = { courseId: cId, courseTitle: evt.courseTitle };
      }

      const rec = dayMap[yyyy_mm_dd][cId];

      if (evt.type === 'grade') {
        const g = evt.data as GradeEntry;
        rec.grade = g;
        if (g.createdBy) rec.teacherName = teacherMap.get(g.createdBy);
      } else {
        const j = evt.data as JournalEntry;
        rec.journal = j;
        if (j.createdBy && !rec.teacherName) rec.teacherName = teacherMap.get(j.createdBy);
      }
    });
    return dayMap;
  }, [filteredEvents, teacherMap]);

  const handlePrevMonth = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };
  const handleNextMonth = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };
  const handleToday = () => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0,0,0,0);
    setCurrentDate(d);
  };

  const getRecordTheme = (g?: GradeEntry, j?: JournalEntry) => {
    if (g) {
       const isHigh = g.displayValue === '5' || g.displayValue === 'A' || g.displayValue === 'Отлично' || (g.value && g.maxValue && g.value / g.maxValue >= 0.85);
       const isMid = g.displayValue === '4' || g.displayValue === 'B' || g.displayValue === 'Хорошо' || (g.value && g.maxValue && g.value / g.maxValue >= 0.7);
       
       if (isHigh) return 'border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400';
       if (isMid) return 'border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400';
       return 'border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400';
    }
    if (j) {
      if (j.attendance === 'absent') return 'border-red-500 text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400';
      if (j.attendance === 'late') return 'border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400';
      if (j.attendance === 'excused') return 'border-slate-400 text-slate-700 bg-slate-50 dark:bg-slate-800/40 dark:text-slate-400';
    }
    return 'border-slate-300 text-slate-700 bg-slate-50 dark:bg-slate-800/40 dark:text-slate-300';
  };

  const renderMonthGrid = () => {
    const days = getDaysForMonth(currentDate);
    
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl overflow-hidden shadow-sm">
        {/* Days of week header */}
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30">
          {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((d) => (
            <div key={d} className="py-3 text-center border-r border-slate-100 dark:border-slate-700/50 last:border-r-0">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">{d}</span>
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div className="grid grid-cols-7 auto-rows-[minmax(120px,1fr)]">
          {days.map((item, idx) => {
            if (!item.date) return <div key={`empty-${idx}`} className="border-r border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/30 dark:bg-slate-900/10"></div>;
            
            const yyyy = item.date.getFullYear();
            const mm = String(item.date.getMonth() + 1).padStart(2, '0');
            const dd = String(item.date.getDate()).padStart(2, '0');
            const dateKey = `${yyyy}-${mm}-${dd}`;
            
            const todayD = new Date();
            const todayKey = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, '0')}-${String(todayD.getDate()).padStart(2, '0')}`;
            const isToday = dateKey === todayKey;
            const dayRecords = eventsByDate[dateKey] ? Object.values(eventsByDate[dateKey]) : [];

            return (
              <div key={dateKey} className={`relative p-1.5 sm:p-2 border-r border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20 flex flex-col ${isToday ? 'bg-primary-50/30 dark:bg-primary-900/10' : ''}`}>
                 
                 {/* DATE CORNER */}
                 <div className="flex justify-between items-start mb-2">
                   <div className={`text-[13px] sm:text-sm font-bold w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-primary-600 text-white' : 'text-slate-900 dark:text-slate-200'}`}>
                     {item.date.getDate()}
                   </div>
                 </div>

                 {/* RECORDS */}
                 <div className="flex-1 overflow-y-auto space-y-1.5 hide-scrollbar">
                    {dayRecords.map(rec => {
                      const theme = getRecordTheme(rec.grade, rec.journal);
                      
                      return (
                        <div key={rec.courseId} className={`flex flex-col border-l-[3px] border-y border-r border-y-transparent border-r-transparent ${theme} rounded-r-md px-2 py-1.5`}>
                          <div className="flex items-center justify-between gap-1 w-full">
                            <span className="font-semibold text-[10px] sm:text-[11px] truncate">{rec.courseTitle}</span>
                            <div className="flex items-center shrink-0">
                               {rec.grade ? (
                                  <span className="font-black text-[12px] ml-1.5 tracking-tight">{rec.grade.displayValue || rec.grade.value}</span>
                               ) : rec.journal ? (
                                  <span className="font-black text-[11px] ml-1.5 opacity-80">{rec.journal.attendance === 'absent' ? 'Н' : rec.journal.attendance === 'late' ? 'ОПОЗД' : ''}</span>
                               ) : null}
                            </div>
                          </div>
                          
                          {/* Teacher / comment row (only visible on sm and up) */}
                          <div className="hidden sm:flex justify-between text-[9px] opacity-70 mt-0.5">
                             <span className="truncate max-w-[70%]" title={rec.teacherName}>{rec.teacherName}</span>
                             {rec.grade?.comment && <MessageSquare className="w-2.5 h-2.5" />}
                          </div>
                        </div>
                      )
                    })}
                 </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const currentMonthLabel = useMemo(() => {
    const str = currentDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    return str.replace(' г.', '').replace(' г', '');
  }, [currentDate]);

  return (
    <div className="max-w-[1400px] mx-auto pb-20 font-sans space-y-6 px-4 xl:px-0">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
            Дневник
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Календарь оценок и посещаемости
          </p>
        </div>

        {/* Toolbar: Filters and Nav */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          
          <div className="flex items-center w-full sm:w-auto overflow-hidden border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-sm relative">
             <Search className="w-4 h-4 text-slate-400 absolute left-3" />
             <select 
               value={selectedCourseId}
               onChange={(e) => setSelectedCourseId(e.target.value)}
               className="bg-transparent pl-10 pr-8 py-2 text-sm font-bold text-slate-900 dark:text-white appearance-none outline-none w-full sm:w-[220px]"
             >
               <option value="all">Все предметы</option>
               {courses.map(c => (
                 <option key={c.id} value={c.id}>{c.title}</option>
               ))}
             </select>
          </div>

          <div className="flex items-center w-full sm:w-auto p-1 bg-slate-100/80 dark:bg-slate-800/50 rounded-xl border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
             <button onClick={handlePrevMonth} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-600 dark:text-slate-300">
               <ChevronLeft className="w-5 h-5" />
             </button>
             <button onClick={handleToday} className="px-4 text-sm font-bold capitalize text-slate-800 dark:text-slate-100 pointer-events-none min-w-[140px] text-center">
               {currentMonthLabel}
             </button>
             <button onClick={handleNextMonth} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-600 dark:text-slate-300">
               <ChevronRight className="w-5 h-5" />
             </button>
          </div>

        </div>
      </div>

      {/* CONTENT */}
      {loading ? (
        <div className="py-32 flex justify-center">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400 font-medium rounded-xl text-sm">
          {error}
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {renderMonthGrid()}
        </div>
      )}
    </div>
  );
}
