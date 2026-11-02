import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orgGetTimetable } from '../../lib/api';
import { Clock, Calendar, MapPin, Repeat, ArrowRight } from 'lucide-react';
import type { ScheduleEvent } from '../../types';

const StudentSchedulePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [timetableEvents, setTimetableEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const dayNames = [
    t('schedule.mon', 'Пн'), t('schedule.tue', 'Вт'), t('schedule.wed', 'Ср'),
    t('schedule.thu', 'Чт'), t('schedule.fri', 'Пт'), t('schedule.sat', 'Сб'), t('schedule.sun', 'Вс'),
  ];
  const dayNamesFull = [
    t('schedule.monday', 'Понедельник'), t('schedule.tuesday', 'Вторник'), t('schedule.wednesday', 'Среда'),
    t('schedule.thursday', 'Четверг'), t('schedule.friday', 'Пятница'), t('schedule.saturday', 'Суббота'), t('schedule.sunday', 'Воскресенье'),
  ];

  const todayDayOfWeek = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();

  useEffect(() => {
    setLoading(true);
    orgGetTimetable()
      .then(setTimetableEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-32">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t('nav.schedule')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg">{t('student.schedule.subtitle', 'Расписание занятий на каждый день недели')}</p>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
        <Repeat className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {t('student.schedule.recurringInfo', 'Расписание повторяется каждую неделю. Время и предметы одинаковые.')}
        </p>
      </div>

      {/* Timetable columns */}
      <div className="flex overflow-x-auto gap-3 pb-4 snap-x snap-mandatory md:snap-none hide-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {dayNames.map((dayName, dayIdx) => {
          const isToday = dayIdx === todayDayOfWeek;
          const dayLessons = timetableEvents
            .filter(e => (e as any).dayOfWeek === dayIdx)
            .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

          return (
            <div key={dayIdx} className={`w-[280px] sm:w-[300px] xl:flex-1 xl:min-w-[150px] shrink-0 snap-center rounded-lg border flex flex-col relative overflow-hidden ${
              isToday 
                ? 'bg-white dark:bg-slate-900 border-primary-500 dark:border-primary-500' 
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
            }`}>
              
              {/* Day of Week Header */}
              <div className="text-center pt-3 pb-2 mb-2 border-b border-slate-200 dark:border-slate-700">
                 <p className={`text-xs font-medium ${isToday ? 'text-primary-600 dark:text-primary-400' : 'text-slate-500 dark:text-slate-400'}`}>
                   {dayNamesFull[dayIdx]}
                 </p>
                 <p className={`text-sm font-semibold ${isToday ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
                   {dayName}
                 </p>
                 {isToday && (
                   <span className="inline-flex items-center mt-1 h-5 px-1.5 rounded text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300">{t('org.schedule.today', 'Сегодня')}</span>
                 )}
              </div>

              {/* Lessons */}
              <div className="flex-1 px-2 pb-2 space-y-2 relative min-h-[250px]">
                 {dayLessons.map((l, idx) => {
                    const hasLink = !!(l.groupId);
                    const handleClick = () => {
                      if (l.groupId) navigate(`/groups/${l.groupId}`);
                    };
                    return (
                    <div key={l.id} onClick={hasLink ? handleClick : undefined} className={`relative bg-white dark:bg-slate-800 rounded-md p-2.5 border border-slate-200 dark:border-slate-700 transition-colors overflow-hidden ${hasLink ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 group' : ''}`}>
                      
                      <span className="inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 mb-1.5">
                        {t('student.schedule.lessonN', '{{n}}-й урок', { n: idx + 1 })}
                      </span>

                      <div className="flex items-start justify-between">
                        <h4 className={`text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug mb-1.5 pr-2 break-words ${hasLink ? 'group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors' : ''}`}>
                          {l.title}
                        </h4>
                        {hasLink && <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 transition-colors shrink-0 mt-0.5" />}
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums w-fit">
                          <Clock className="w-3 h-3 text-slate-400"/> 
                          <span>{l.startTime} - {l.endTime}</span>
                        </div>
                        
                        {l.location && (
                          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {l.location}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                 
                 {dayLessons.length === 0 && (
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center opacity-70 select-none pointer-events-none">
                      <Calendar className="w-6 h-6 mb-2 text-slate-400" />
                      <p className="text-xs text-slate-500 dark:text-slate-400 text-center">{t('org.schedule.noLessons', 'Нет занятий')}</p>
                    </div>
                 )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StudentSchedulePage;
