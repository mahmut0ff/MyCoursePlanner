import { useState, useEffect, useMemo } from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgGetGrades, orgGetJournal, orgGetGroups, apiGetOrgMembers } from '../../lib/api';
import type { Course, GradeEntry, JournalEntry } from '../../types';
import { ChevronLeft, ChevronRight, Calendar, BookOpen, Clock, FileWarning, MessageSquare, XCircle, Activity, LayoutGrid, Search } from 'lucide-react';

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

function getStartOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDaysForWeek(startDate: Date) {
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    d.setHours(0,0,0,0);
    return d;
  });
}

function getDaysForMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  const startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; 
  const totalDays = lastDay.getDate();
  
  const days: { date: Date | null }[] = [];
  
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push({ date: null });
  }
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month, i);
    d.setHours(0,0,0,0);
    days.push({ date: d });
  }
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
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
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

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };
  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };
  const handleToday = () => {
    const d = new Date();
    d.setHours(0,0,0,0);
    setCurrentDate(d);
  };

  const renderWeek = () => {
    const startOfWeek = getStartOfWeek(currentDate);
    const days = getDaysForWeek(startOfWeek);

    return (
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {days.map((date) => {
          const yyyy = date.getFullYear();
          const mm = String(date.getMonth() + 1).padStart(2, '0');
          const dd = String(date.getDate()).padStart(2, '0');
          const dateKey = `${yyyy}-${mm}-${dd}`;
          
          const weekdayStr = date.toLocaleDateString('ru-RU', { weekday: 'short' }).toUpperCase();
          const isToday = dateKey === new Date().toISOString().split('T')[0];

          const dayRecords = eventsByDate[dateKey] ? Object.values(eventsByDate[dateKey]) : [];

          return (
            <div key={dateKey} className={`flex flex-col border-2 ${isToday ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'} rounded-sm overflow-hidden min-h-[400px]`}>
              <div className={`p-3 text-center border-b-2 ${isToday ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'}`}>
                <div className={`text-xs font-black tracking-widest uppercase ${isToday ? 'text-white' : 'text-slate-500'}`}>{weekdayStr}</div>
                <div className={`text-2xl font-black mt-1 ${isToday ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{date.getDate()}</div>
              </div>
              <div className="flex-1 p-2 space-y-2">
                {dayRecords.length === 0 ? (
                  <div className="h-full flex items-center justify-center opacity-50">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">Пусто</span>
                  </div>
                ) : (
                  dayRecords.map(rec => (
                    <div key={rec.courseId} className="p-2.5 border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs hover:border-slate-400 transition-colors rounded-sm">
                      <div className="font-bold text-slate-900 dark:text-slate-100 mb-1" title={rec.courseTitle}>{rec.courseTitle}</div>
                      
                      {rec.teacherName && (
                        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2 truncate" title={rec.teacherName}>
                          {rec.teacherName}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-3 pt-3 border-t-2 border-slate-100 dark:border-slate-700/80">
                        <div className="flex items-center gap-1.5 font-bold">
                          {rec.journal?.attendance === 'absent' && <span className="text-red-700 dark:text-red-400 flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Н</span>}
                          {rec.journal?.attendance === 'late' && <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> О</span>}
                          {rec.journal?.attendance === 'excused' && <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><FileWarning className="w-3.5 h-3.5" /> У</span>}
                          {rec.journal?.attendance === 'present' && <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> П</span>}
                          {!rec.journal && <span className="text-slate-300 dark:text-slate-600">-</span>}
                        </div>
                        
                        {rec.grade ? (
                          <div className={`font-black uppercase tracking-wider text-[11px] px-2 py-1 border-2 ${
                            (rec.grade.displayValue === '5' || rec.grade.displayValue === 'A' || rec.grade.displayValue === 'Отлично' || (rec.grade.value && rec.grade.maxValue && rec.grade.value / rec.grade.maxValue >= 0.85)) ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-800 dark:text-emerald-400' :
                            (rec.grade.displayValue === '4' || rec.grade.displayValue === 'B' || rec.grade.displayValue === 'Хорошо' || (rec.grade.value && rec.grade.maxValue && rec.grade.value / rec.grade.maxValue >= 0.7)) ? 'bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-400' :
                            'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-800 dark:text-amber-400'
                          }`}>
                            {rec.grade.displayValue || rec.grade.value || '?'}
                          </div>
                        ) : (
                          <div className="text-slate-300 dark:text-slate-600 font-bold">-</div>
                        )}
                      </div>
                      
                      {(rec.grade?.comment || rec.journal?.note) && (
                        <div className="mt-3 text-[10px] text-slate-700 dark:text-slate-300 italic flex items-start gap-1 bg-slate-50 dark:bg-slate-900 p-2 border-l-2 border-slate-300 dark:border-slate-600">
                          <MessageSquare className="w-3 h-3 shrink-0 mt-0.5 text-slate-400" />
                          <span className="line-clamp-2 font-medium" title={rec.grade?.comment || rec.journal?.note}>{rec.grade?.comment || rec.journal?.note}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMonth = () => {
    const days = getDaysForMonth(currentDate);
    
    return (
      <div className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm rounded-sm">
        <div className="grid grid-cols-7 border-b border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(d => (
            <div key={d} className="p-3 text-center text-[11px] font-black uppercase text-slate-500 tracking-widest border-r last:border-r-0 border-slate-300 dark:border-slate-700">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[120px]">
          {days.map((item, idx) => {
            if (!item.date) return <div key={`empty-${idx}`} className="border-r border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20"></div>;
            
            const yyyy = item.date.getFullYear();
            const mm = String(item.date.getMonth() + 1).padStart(2, '0');
            const dd = String(item.date.getDate()).padStart(2, '0');
            const dateKey = `${yyyy}-${mm}-${dd}`;
            
            const isToday = dateKey === new Date().toISOString().split('T')[0];
            const dayRecords = eventsByDate[dateKey] ? Object.values(eventsByDate[dateKey]) : [];

            return (
              <div key={dateKey} className={`p-2 border-r border-b border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors flex flex-col ${isToday ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
                 <div className="flex justify-between items-start mb-2">
                   <div className={`text-sm font-bold w-6 h-6 flex items-center justify-center ${isToday ? 'bg-primary-600 text-white rounded-sm' : 'text-slate-900 dark:text-white'}`}>
                     {item.date.getDate()}
                   </div>
                 </div>
                 <div className="space-y-1.5 overflow-y-auto max-h-[80px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-600">
                    {dayRecords.map(rec => {
                      const isHigh = rec.grade ? (rec.grade.displayValue === '5' || rec.grade.displayValue === 'A' || rec.grade.displayValue === 'Отлично' || (rec.grade.value && rec.grade.maxValue && rec.grade.value / rec.grade.maxValue >= 0.85)) : false;
                      return (
                        <div key={rec.courseId} className={`flex items-center justify-between text-[10px] px-1.5 py-1 border rounded-sm truncate ${
                          rec.grade ? (isHigh ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300' : 'bg-slate-50 border-slate-300 text-slate-800 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200') : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                        }`}>
                          <span className="font-bold truncate mr-1">{rec.courseTitle}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {rec.grade && (
                               <span className="font-black px-1 border border-current">{rec.grade.displayValue || rec.grade.value}</span>
                            )}
                            {!rec.grade && rec.journal && (
                               <span className="font-bold">{rec.journal.attendance === 'absent' ? 'Н' : rec.journal.attendance === 'late' ? 'О' : '*'}</span>
                            )}
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

  const currentViewLabel = useMemo(() => {
    if (viewMode === 'month') {
      let str = currentDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      return str.charAt(0).toUpperCase() + str.slice(1);
    } else {
      const start = getStartOfWeek(currentDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${start.getDate()} ${start.toLocaleDateString('ru-RU', {month:'short'})} - ${end.getDate()} ${end.toLocaleDateString('ru-RU', {month:'short'})} ${end.getFullYear()}`;
    }
  }, [currentDate, viewMode]);

  return (
    <div className="max-w-[1400px] mx-auto pb-20 font-sans">
      
      {/* Strict Header */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b-2 border-slate-900 dark:border-slate-600 pb-6 pt-4 px-4 xl:px-0">
        <div className="flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-slate-900 dark:text-white" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
              Дневник И Расписание
            </h1>
          </div>
        </div>

        <div className="flex border-2 border-slate-900 dark:border-slate-600 overflow-hidden rounded-sm">
           <button 
             onClick={() => setViewMode('week')}
             className={`px-5 py-2 text-sm font-black uppercase tracking-wider flex items-center gap-2 transition-colors ${viewMode === 'week' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-transparent text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}`}
           >
             <LayoutGrid className="w-4 h-4" /> Неделя
           </button>
           <button 
             onClick={() => setViewMode('month')}
             className={`px-5 py-2 text-sm font-black uppercase tracking-wider flex items-center gap-2 border-l-2 border-slate-900 dark:border-slate-600 transition-colors ${viewMode === 'month' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-transparent text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}`}
           >
             <Calendar className="w-4 h-4" /> Месяц
           </button>
        </div>
      </div>

      <div className="px-4 xl:px-0 mt-6 space-y-6">
        
        {/* Strict Toolbar */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800 border-y sm:border sm:border-slate-300 dark:border-slate-600 p-4 rounded-sm">
          
          {/* Pagination */}
          <div className="flex items-center gap-0 border-2 border-slate-900 dark:border-white rounded-sm overflow-hidden">
             <button onClick={handlePrev} className="p-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
               <ChevronLeft className="w-5 h-5" />
             </button>
             <button onClick={handleToday} className="px-5 py-2 border-x-2 border-slate-900 dark:border-white bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black text-sm uppercase tracking-wider hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
               Сегодня
             </button>
             <button onClick={handleNext} className="p-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
               <ChevronRight className="w-5 h-5" />
             </button>
          </div>

          <div className="text-xl font-black text-slate-900 dark:text-white tracking-widest uppercase">
             {currentViewLabel}
          </div>

          {/* Filter */}
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase font-black text-slate-500 tracking-widest">Фильтр:</span>
            <div className="relative border-2 border-slate-300 dark:border-slate-600 focus-within:border-slate-900 dark:focus-within:border-white transition-colors bg-white dark:bg-slate-900 flex items-center rounded-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3" />
              <select 
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="bg-transparent pl-10 pr-8 py-2 text-sm font-bold text-slate-900 dark:text-white appearance-none outline-none w-full min-w-[200px]"
              >
                <option value="all">Все предметы</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-32 text-center text-slate-500 flex flex-col items-center">
            <Calendar className="w-10 h-10 animate-pulse mb-4" />
            <span className="text-sm font-black uppercase tracking-widest">Синхронизация данных...</span>
          </div>
        ) : error ? (
          <div className="p-6 border-l-4 border-red-600 bg-red-50 text-red-700 font-black uppercase tracking-wider text-sm">{error}</div>
        ) : (
          <div className="w-full pb-8">
            {viewMode === 'week' ? renderWeek() : renderMonth()}
          </div>
        )}
      </div>
    </div>
  );
}
