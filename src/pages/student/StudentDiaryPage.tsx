import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { orgGetCourses, orgGetGrades, orgGetJournal } from '../../lib/api';
import type { Course, GradeEntry, JournalEntry } from '../../types';
import { Calendar, BookOpen, Star, Filter, Clock, FileWarning, CheckCircle2, MessageSquare, XCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

type TimelineEvent = 
  | { type: 'grade'; date: string; data: GradeEntry; courseTitle: string }
  | { type: 'journal'; date: string; data: JournalEntry; courseTitle: string; noteOnly: boolean };

/** Safe date → ISO string. Returns null if invalid. */
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
            if (!date) return; // skip invalid dates
            newEvents.push({ type: 'grade', date, data: g, courseTitle: allCourses[i].title });
          });
        });

        journalRes.forEach((courseJournal: any, i) => {
          if (!Array.isArray(courseJournal)) return;
          courseJournal.forEach((j: JournalEntry) => {
            const eventDate = safeISODate(j.date);
            if (!eventDate) return; // skip invalid dates
            newEvents.push({ type: 'journal', date: eventDate, data: j, courseTitle: allCourses[i].title, noteOnly: false });
          });
        });

        // Sort descending by date
        newEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setEvents(newEvents);
        
      } catch (err: any) {
        console.error('Diary load error:', err);
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t('nav.diary', 'Мой дневник')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('diary.subtitle', 'Лента событий: оценки, посещаемость, комментарии')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:border-primary-500 cursor-pointer"
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

      <div className="relative pl-8 sm:pl-10 pb-6">
        <div className="absolute top-4 bottom-0 left-4 sm:left-5 w-0.5 bg-slate-200 dark:bg-slate-700/50" />
        
        {filteredEvents.length === 0 ? (
          <div className="py-12 text-center">
            <Calendar className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('diary.empty', 'Нет событий. Начните учиться усерднее!')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredEvents.map((evt, i) => {
              const isGrade = evt.type === 'grade';
              const dateObj = new Date(evt.date);
              const dateStr = dateObj.toLocaleDateString();
              const timeStr = isGrade ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

              if (isGrade) {
                const g = evt.data as GradeEntry;
                return (
                  <div key={`grade_${g.id}_${i}`} className="relative">
                    <div className="absolute -left-8 sm:-left-10 w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-full border-4 border-slate-50 dark:border-slate-900 flex items-center justify-center -translate-x-1/2 mt-1 z-10">
                      <Star className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl shadow-sm">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-xs font-semibold text-primary-500 mb-0.5 uppercase tracking-wider">{evt.courseTitle}</p>
                          <h3 className="text-base font-bold text-slate-900 dark:text-white">{t('diary.newGrade', 'Новая оценка')}</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded-md inline-block">
                            {dateStr} {timeStr}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-inner font-bold text-2xl">
                          {g.displayValue || g.value || (g.status !== 'normal' ? g.status.substring(0,3).toUpperCase() : '?')}
                        </div>
                        <div className="flex-1">
                          {g.comment && (
                            <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl italic">
                              "{g.comment}"
                            </p>
                          )}
                          {!g.comment && <p className="text-sm text-slate-400">{t('diary.noComment', 'Преподаватель не оставил комментарий.')}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              } else {
                const j = evt.data as JournalEntry;
                let Icon = CheckCircle2;
                let colorClass = 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30 border-emerald-50 dark:border-slate-900';
                let label = t('diary.present', 'Был(а) на занятии');

                if (j.attendance === 'absent') {
                  Icon = XCircle;
                  colorClass = 'text-red-500 bg-red-100 dark:bg-red-900/30 border-red-50 dark:border-slate-900';
                  label = t('diary.absent', 'Отсутствие');
                } else if (j.attendance === 'late') {
                  Icon = Clock;
                  colorClass = 'text-amber-500 bg-amber-100 dark:bg-amber-900/30 border-amber-50 dark:border-slate-900';
                  label = t('diary.late', 'Опоздание');
                } else if (j.attendance === 'excused') {
                  Icon = FileWarning;
                  colorClass = 'text-slate-500 bg-slate-100 dark:bg-slate-800/80 border-slate-50 dark:border-slate-900';
                  label = t('diary.excused', 'Уважительная причина');
                }

                return (
                  <div key={`journal_${j.id}_${i}`} className="relative">
                    <div className={`absolute -left-8 sm:-left-10 w-8 h-8 rounded-full border-4 flex items-center justify-center -translate-x-1/2 mt-1 z-10 ${colorClass}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className={`border p-4 rounded-2xl shadow-sm ${j.attendance === 'absent' ? 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-slate-500 mb-0.5">{evt.courseTitle}</p>
                        <p className="text-[10px] font-bold text-slate-400">
                          {dateStr}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{label}</h3>
                        {j.participation && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            j.participation === 'high' ? 'bg-emerald-100 text-emerald-600' :
                            j.participation === 'medium' ? 'bg-amber-100 text-amber-600' :
                            'bg-red-100 text-red-600'
                          }`}>
                            {t('diary.participation', 'Участие')}: {j.participation.toUpperCase()}
                          </span>
                        )}
                      </div>
                      
                      {j.note && (
                        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2 bg-white dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/50">
                          <MessageSquare className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          <p className="italic">"{j.note}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentDiaryPage;
