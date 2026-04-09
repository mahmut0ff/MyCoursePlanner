import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgGetGrades, orgGetJournal, orgGetGroups } from '../../lib/api';
import type { Course, GradeEntry, JournalEntry } from '../../types';
import { Calendar, BookOpen, Star, Clock, FileWarning, CheckCircle2, MessageSquare, XCircle, AlertTriangle, Presentation, Activity, Award, GraduationCap, Sparkles } from 'lucide-react';

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

  // Group events by Day
  const groupedEvents = useMemo(() => {
    const groups: Record<string, TimelineEvent[]> = {};
    filteredEvents.forEach(evt => {
      const d = new Date(evt.date);
      const key = d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(evt);
    });
    return Object.entries(groups).map(([dateStr, items]) => ({ dateStr, items }));
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
        <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('common.error', 'Ошибка загрузки дневника')}</h2>
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
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {t('nav.diary', 'Мой дневник')}
              </h1>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Ваши успехи и достижения
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
                <Presentation className={`w-5 h-5 ${stats.attendanceRate !== null && stats.attendanceRate >= 80 ? 'text-indigo-500' : 'text-orange-500'}`} />
                <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.attendanceRate !== null ? `${stats.attendanceRate}%` : '—'}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Decorative background blob */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary-400/5 dark:bg-primary-400/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Filters (Scrollable Row) */}
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

      {/* Timeline Section */}
      <div className="relative pt-4 sm:ml-4">
        {/* Continuous left line */}
        {groupedEvents.length > 0 && (
          <div className="absolute top-8 bottom-0 left-[21px] sm:left-[39px] w-[3px] bg-slate-100 dark:bg-slate-800 rounded-full" />
        )}
        
        {groupedEvents.length === 0 ? (
          <div className="py-20 text-center bg-white/50 dark:bg-slate-800/20 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 backdrop-blur-sm">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-5 rotate-12 transition-transform hover:rotate-0 duration-300">
              <Calendar className="w-10 h-10 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Здесь пока пусто</h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {courses.length === 0 
                ? 'Вы пока не зачислены ни на один курс. После зачисления здесь появится ваша история занятий.' 
                : 'По выбранным курсам пока нет оценок или отметок о посещаемости.'}
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {groupedEvents.map((group, groupIdx) => (
              <div key={group.dateStr} className="relative z-10 slide-up" style={{ animationDelay: `${groupIdx * 100}ms` }}>
                
                {/* Date Group Header */}
                <div className="flex items-center mb-6 pl-[44px] sm:pl-[84px] relative">
                  <div className="absolute left-[13px] sm:left-[31px] w-5 h-5 rounded-full border-[4px] border-slate-50 dark:border-slate-900 bg-slate-300 dark:bg-slate-600 z-10 shadow-sm" />
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-sm">
                    {group.dateStr}
                  </span>
                </div>

                <div className="space-y-6">
                  {group.items.map((evt) => {
                    const dateObj = new Date(evt.date);
                    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    if (evt.type === 'grade') {
                      const g = evt.data as GradeEntry;
                      
                      let isExcellent = false;
                      let isGood = false;
                      if (typeof g.value === 'number' && g.maxValue) {
                         const pct = g.value / g.maxValue;
                         isExcellent = pct >= 0.85;
                         isGood = pct >= 0.7 && pct < 0.85;
                      } else if (g.displayValue && typeof g.displayValue === 'string') {
                         isExcellent = ['5', 'A', 'Отлично'].includes(g.displayValue);
                         isGood = ['4', 'B', 'Хорошо'].includes(g.displayValue);
                      }

                      const gradTheme = isExcellent
                        ? 'from-emerald-400 to-emerald-600 text-white shadow-emerald-500/30'
                        : isGood
                        ? 'from-blue-400 to-indigo-500 text-white shadow-blue-500/30'
                        : 'from-amber-400 to-orange-500 text-white shadow-amber-500/30';
                        
                      const highlightColor = isExcellent ? 'text-emerald-500' : isGood ? 'text-blue-500' : 'text-amber-500';

                      return (
                        <div key={evt.id} className="relative flex items-center pl-[44px] sm:pl-[84px] group/item transition-all">
                          {/* Dot */}
                          <div className={`absolute left-[17px] sm:left-[35px] w-3 h-3 rounded-full bg-white dark:bg-slate-900 border-[3px] z-10 transition-transform group-hover/item:scale-125 ${isExcellent ? 'border-emerald-500' : isGood ? 'border-blue-500' : 'border-amber-500'}`} />
                          
                          {/* Time label for large screens */}
                          <div className="hidden sm:block absolute left-0 w-[24px] text-right text-[11px] font-bold text-slate-400">
                            {timeStr}
                          </div>

                          <div className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 p-5 rounded-2xl shadow-sm hover:shadow-lg transition-all hover:-translate-y-0.5 relative overflow-hidden">
                            {/* Subtle highligt on top edge */}
                            <div className={`absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r ${gradTheme.split(' text-')[0]}`} />
                            
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                              <div className="flex items-start gap-4">
                                <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-black text-xl sm:text-2xl bg-gradient-to-br shadow-md shrink-0 ${gradTheme}`}>
                                  {g.displayValue || g.value || (g.status !== 'normal' ? g.status.substring(0,3).toUpperCase() : '?')}
                                </div>
                                <div className="pt-1">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <Award className={`w-4 h-4 ${highlightColor}`} />
                                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                      Получена оценка
                                    </h3>
                                    <span className="sm:hidden ml-auto text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                      {timeStr}
                                    </span>
                                  </div>
                                  <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">
                                    {evt.courseTitle}
                                  </p>
                                  {g.comment ? (
                                    <div className="mt-2 bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                      <p className="text-sm text-slate-600 dark:text-slate-300 italic">"{g.comment}"</p>
                                    </div>
                                  ) : (
                                    <p className="text-xs font-medium text-slate-400">Преподаватель не оставил комментарий.</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      const j = evt.data as JournalEntry;
                      
                      const isPresent = j.attendance === 'present';
                      const isLate = j.attendance === 'late';
                      const isExcused = j.attendance === 'excused';
                      
                      let Icon = CheckCircle2;
                      let colorClass = 'text-emerald-500';
                      let dotColor = 'border-emerald-500 bg-emerald-500';
                      let bgClass = 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30';
                      let label = 'Присутствие на занятии';

                      if (!isPresent && !isLate && !isExcused) {
                        Icon = XCircle;
                        colorClass = 'text-red-500';
                        dotColor = 'border-red-500 bg-red-500';
                        bgClass = 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/40';
                        label = 'Пропуск занятия';
                      } else if (isLate) {
                        Icon = Clock;
                        colorClass = 'text-amber-500';
                        dotColor = 'border-amber-500 bg-amber-500';
                        bgClass = 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30';
                        label = 'Опоздание';
                      } else if (isExcused) {
                        Icon = FileWarning;
                        colorClass = 'text-slate-500 dark:text-slate-400';
                        dotColor = 'border-slate-400 bg-slate-400';
                        bgClass = 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
                        label = 'Отсутствие по ув. причине';
                      }

                      return (
                        <div key={evt.id} className="relative flex items-center pl-[44px] sm:pl-[84px] group/item transition-all">
                          {/* Dot - Solid filled for journal events */}
                          <div className={`absolute left-[17px] sm:left-[35px] w-3 h-3 rounded-full border-[2px] border-white dark:border-slate-900 shadow-sm z-10 transition-transform group-hover/item:scale-125 ${dotColor}`} />
                          
                          {/* Time label */}
                          <div className="hidden sm:block absolute left-0 w-[24px] text-right text-[11px] font-bold text-slate-400">
                            {timeStr}
                          </div>

                          <div className={`w-full p-4 sm:p-5 rounded-2xl border shadow-sm hover:shadow-md transition-all relative ${bgClass}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2.5 mb-1.5">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center bg-white dark:bg-slate-900 shadow-sm ${colorClass}`}>
                                    <Icon className="w-4 h-4" />
                                  </div>
                                  <h3 className={`text-sm sm:text-base font-extrabold ${colorClass.replace('text-', 'text-').replace('-500', '-600 dark:text-').replace('-600 dark:text-', '-400')}`}>
                                    {label}
                                  </h3>
                                  <span className="sm:hidden ml-auto text-[10px] font-bold text-slate-400 bg-white/50 dark:bg-slate-900/50 px-2 py-0.5 rounded-md">
                                    {timeStr}
                                  </span>
                                </div>
                                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-9">
                                  {evt.courseTitle}
                                </p>
                              </div>

                              {j.participation && isPresent && (
                                <div className={`self-start sm:self-center px-3 py-1.5 rounded-xl border text-[11px] font-bold tracking-wide flex items-center gap-1.5 ${
                                  j.participation === 'high' ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800/50' :
                                  j.participation === 'medium' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800/50' :
                                  'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                }`}>
                                  <Activity className="w-3 h-3" />
                                  Активность: {
                                    j.participation === 'high' ? 'Высокая' : 
                                    j.participation === 'medium' ? 'Средняя' : 'Низкая'
                                  }
                                </div>
                              )}
                            </div>
                            
                            {j.note && (
                              <div className="mt-4 ml-0 sm:ml-9 bg-white/60 dark:bg-slate-900/40 p-3 rounded-xl border border-black/5 dark:border-white/5 text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2.5">
                                <MessageSquare className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                <p className="italic font-medium leading-relaxed">"{j.note}"</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              </div>
            ))}
          </div>
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
