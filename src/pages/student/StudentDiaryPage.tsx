import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgGetGrades, orgGetJournal } from '../../lib/api';
import type { Course, GradeEntry, JournalEntry } from '../../types';
import { Calendar, BookOpen, Star, Filter, Clock, FileWarning, CheckCircle2, MessageSquare, XCircle, AlertTriangle, Presentation, Activity } from 'lucide-react';

type TimelineEvent = 
  | { type: 'grade'; date: string; data: GradeEntry; courseTitle: string }
  | { type: 'journal'; date: string; data: JournalEntry; courseTitle: string; noteOnly: boolean };

function safeISODate(raw: any): string | null {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch { return null; }
}

const StudentDiaryPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');

  useEffect(() => {
    if (!profile) return;

    const loadData = async () => {
      try {
        const allCourses = await orgGetCourses() as Course[];
        setCourses(allCourses);

        if (allCourses.length === 0) {
          setEvents([]);
          return;
        }

        const courseIds = allCourses.map(c => c.id);
        const gradesPromises = courseIds.map(cId => orgGetGrades(cId).catch(() => []));
        const journalPromises = courseIds.map(cId => orgGetJournal(cId).catch(() => []));

        const gradesRes = await Promise.all(gradesPromises);
        const journalRes = await Promise.all(journalPromises);

        const newEvents: TimelineEvent[] = [];
        
        gradesRes.forEach((courseGrades: any, i) => {
          if (!Array.isArray(courseGrades)) return;
          courseGrades.forEach((g: GradeEntry) => {
            const date = safeISODate(g.updatedAt || g.createdAt);
            if (!date) return;
            newEvents.push({ type: 'grade', date, data: g, courseTitle: allCourses[i].title });
          });
        });

        journalRes.forEach((courseJournal: any, i) => {
          if (!Array.isArray(courseJournal)) return;
          courseJournal.forEach((j: JournalEntry) => {
            const eventDate = safeISODate(j.date);
            if (!eventDate) return;
            newEvents.push({ type: 'journal', date: eventDate, data: j, courseTitle: allCourses[i].title, noteOnly: false });
          });
        });

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
  }, [profile]);

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
      // Format grouping key (e.g. "14 марта 2024")
      const key = d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(evt);
    });
    return Object.entries(groups).map(([dateStr, items]) => ({ dateStr, items }));
  }, [filteredEvents]);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary-500 rounded-full animate-spin border-t-transparent" /></div>;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('common.error', 'Ошибка')}</h2>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {t('nav.diary', 'Мой дневник')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('diary.subtitle', 'Лента успеваемости и присутствия')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 shadow-sm">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            className="bg-transparent text-sm font-medium outline-none cursor-pointer text-slate-700 dark:text-slate-300"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
          >
            <option value="all">{t('diary.allCourses', 'Все курсы')}</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${stats.avgScore !== null && stats.avgScore >= 80 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'}`}>
            <Star className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Средний балл</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {stats.avgScore !== null ? `${stats.avgScore}%` : '—'}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${stats.attendanceRate !== null && stats.attendanceRate >= 80 ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400'}`}>
            <Presentation className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Посещаемость</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {stats.attendanceRate !== null ? `${stats.attendanceRate}%` : '—'}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm flex items-center gap-4 sm:col-span-2 md:col-span-1">
          <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400 flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Всего записей</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {stats.totalEvents}
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative pb-6 mx-2 sm:mx-6">
        <div className="absolute top-4 bottom-0 left-4 sm:left-[39px] w-[2px] bg-slate-200 dark:bg-slate-700/60 rounded-full" />
        
        {groupedEvents.length === 0 ? (
          <div className="py-16 text-center bg-slate-50 dark:bg-slate-800/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
            <Calendar className="w-14 h-14 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-base font-medium text-slate-600 dark:text-slate-300">Нет записей в дневнике</p>
            <p className="text-sm text-slate-500 dark:text-slate-500 max-w-sm mx-auto mt-1">Здесь будут появляться ваши оценки и отметки о посещаемости.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {groupedEvents.map((group, gIdx) => (
              <div key={gIdx} className="relative">
                {/* Date Group Header */}
                <div className="flex items-center mb-6 relative z-10">
                  <div className="hidden sm:block w-[80px]" />
                  <div className="w-auto bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ring-4 ring-white dark:ring-slate-900 ml-0 sm:-ml-10 z-10">
                    {group.dateStr}
                  </div>
                </div>

                <div className="space-y-5">
                  {group.items.map((evt, i) => {
                    const isGrade = evt.type === 'grade';
                    const dateObj = new Date(evt.date);
                    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    if (isGrade) {
                      const g = evt.data as GradeEntry;
                      // Determine accent color by grade visual
                      let isHighGrade = false;
                      if (typeof g.value === 'number' && g.maxValue) {
                         isHighGrade = (g.value / g.maxValue) >= 0.8;
                      } else if (g.displayValue && ['A', '5', 'B', '4'].includes(g.displayValue)) {
                         isHighGrade = true;
                      }

                      return (
                        <div key={`grade_${g.id}_${i}`} className="relative flex items-end sm:items-center pl-10 sm:pl-[80px]">
                          {/* Timeline dot */}
                          <div className={`absolute left-4 sm:left-[39px] w-4 h-4 rounded-full border-[3px] ring-4 ring-white dark:ring-slate-900 flex items-center justify-center -translate-x-1/2 z-10 ${isHighGrade ? 'bg-white border-emerald-500 dark:bg-slate-900' : 'bg-white border-amber-500 dark:bg-slate-900'}`} />
                          
                          {/* Time tag for desktop */}
                          <div className="hidden sm:block absolute left-0 w-[60px] text-right text-xs font-semibold text-slate-400">
                            {timeStr}
                          </div>

                          <div className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 p-4 sm:p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow group">
                            <div className="flex items-start justify-between mb-3 border-b border-slate-100 dark:border-slate-700/50 pb-3">
                              <div>
                                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                  <Star className={`w-4 h-4 ${isHighGrade ? 'text-emerald-500' : 'text-amber-500'}`} fill="currentColor" />
                                  Получена выставленная оценка
                                </h3>
                                <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide mt-1">{evt.courseTitle}</p>
                              </div>
                              <span className="sm:hidden text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{timeStr}</span>
                            </div>
                            
                            <div className="flex items-start sm:items-center gap-4">
                              <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-inner flex items-center justify-center text-white font-bold text-xl sm:text-2xl shrink-0 ${isHighGrade ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-amber-400 to-orange-500'}`}>
                                {g.displayValue || g.value || (g.status !== 'normal' ? g.status.substring(0,3).toUpperCase() : '?')}
                              </div>
                              <div className="flex-1 min-w-0">
                                {g.comment ? (
                                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <p className="text-sm text-slate-600 dark:text-slate-300 italic mb-1 shrink-0">"{g.comment}"</p>
                                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">— Заметка преподавателя</p>
                                  </div>
                                ) : (
                                  <p className="text-sm font-medium text-slate-400">Без комментария</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      const j = evt.data as JournalEntry;
                      let Icon = CheckCircle2;
                      let colorClass = 'text-emerald-500 border-emerald-500';
                      let bgClass = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700';
                      let label = 'Был(а) на занятии';

                      if (j.attendance === 'absent') {
                        Icon = XCircle;
                        colorClass = 'text-red-500 border-red-500';
                        bgClass = 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/40';
                        label = 'Пропуск занятия';
                      } else if (j.attendance === 'late') {
                        Icon = Clock;
                        colorClass = 'text-amber-500 border-amber-500';
                        label = 'Опоздание';
                      } else if (j.attendance === 'excused') {
                        Icon = FileWarning;
                        colorClass = 'text-slate-400 border-slate-400';
                        label = 'Отсутствие по ув. причине';
                      }

                      return (
                        <div key={`journal_${j.id}_${i}`} className="relative flex items-center pl-10 sm:pl-[80px]">
                          {/* Timeline dot */}
                          <div className={`absolute left-4 sm:left-[39px] w-3 h-3 rounded-full border-2 ring-4 ring-white dark:ring-slate-900 flex items-center justify-center -translate-x-1/2 z-10 bg-white dark:bg-slate-900 ${colorClass}`} />
                          
                          <div className={`w-full border p-4 sm:p-5 rounded-2xl shadow-sm transition-shadow group ${bgClass}`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Icon className={`w-4 h-4 ${colorClass.split(' ')[0]}`} />
                                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{label}</h3>
                                  {j.participation && (
                                    <span className={`hidden sm:inline-block text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                      j.participation === 'high' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30' :
                                      j.participation === 'medium' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' :
                                      'bg-red-100 text-red-600 dark:bg-red-900/30'
                                    }`}>
                                      Активность {j.participation}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{evt.courseTitle}</p>
                              </div>
                            </div>
                            
                            {j.note && (
                              <div className="mt-3 text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2 bg-white dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                                <MessageSquare className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                <p className="italic font-medium">"{j.note}"</p>
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
    </div>
  );
};

export default StudentDiaryPage;
