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
      <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin shadow-lg dark:border-slate-700 dark:border-t-slate-400" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300">
          {t('nav.schedule')}
        </h1>
        <p className="text-sm text-slate-500 max-w-lg mt-1">{t('student.schedule.subtitle', 'Расписание занятий на каждый день недели')}</p>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-3 px-4 py-3 bg-primary-50/50 dark:bg-primary-900/10 border border-primary-200/50 dark:border-primary-800/30 rounded-2xl">
        <Repeat className="w-5 h-5 text-primary-500 flex-shrink-0" />
        <p className="text-xs font-medium text-primary-700 dark:text-primary-400">
          {t('student.schedule.recurringInfo', 'Расписание повторяется каждую неделю. Время и предметы одинаковые.')}
        </p>
      </div>

      {/* Timetable columns */}
      <div className="flex overflow-x-auto gap-4 pb-6 snap-x snap-mandatory md:snap-none hide-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {dayNames.map((dayName, dayIdx) => {
          const isToday = dayIdx === todayDayOfWeek;
          const dayLessons = timetableEvents
            .filter(e => (e as any).dayOfWeek === dayIdx)
            .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

          return (
            <div key={dayIdx} className={`w-[280px] sm:w-[300px] xl:flex-1 xl:min-w-[150px] shrink-0 snap-center rounded-[2rem] border transition-all duration-300 flex flex-col relative overflow-hidden ${
              isToday 
                ? 'bg-gradient-to-b from-primary-50/80 to-white dark:from-primary-900/30 dark:to-slate-800/40 border-primary-200 dark:border-primary-800/50 shadow-xl shadow-primary-500/10 ring-1 ring-primary-500/20' 
                : 'bg-white/60 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-700/50 shadow-sm backdrop-blur-xl hover:shadow-md'
            }`}>
              {isToday && <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary-400 to-indigo-500" />}
              
              {/* Day of Week Header */}
              <div className="text-center pt-5 pb-3 mb-2 border-b border-slate-200/40 dark:border-slate-700/40">
                 <p className={`text-[11px] font-black uppercase tracking-widest ${isToday ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-slate-500'}`}>
                   {dayNamesFull[dayIdx]}
                 </p>
                 <p className={`text-lg font-bold mt-0.5 ${isToday ? 'text-primary-700 dark:text-primary-300' : 'text-slate-500 dark:text-slate-400'}`}>
                   {dayName}
                 </p>
                 {isToday && (
                   <span className="inline-block mt-1 text-[9px] font-bold text-white bg-primary-500 px-2 py-0.5 rounded-full">{t('org.schedule.today', 'Сегодня')}</span>
                 )}
              </div>

              {/* Lessons */}
              <div className="flex-1 px-3 pb-4 space-y-2.5 relative min-h-[250px]">
                 {dayLessons.map((l, idx) => {
                    const hasLink = !!(l.groupId);
                    const handleClick = () => {
                      if (l.groupId) navigate(`/groups/${l.groupId}`);
                    };
                    return (
                    <div key={l.id} onClick={hasLink ? handleClick : undefined} className={`relative bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-700/50 hover:shadow-lg hover:shadow-primary-500/5 transition-all duration-300 overflow-hidden ${hasLink ? 'cursor-pointer hover:border-primary-300 dark:hover:border-primary-600/50 group' : ''}`}>
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary-400 to-indigo-500" />
                      
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/80 px-2 py-0.5 rounded-md uppercase tracking-wider inline-block mb-2">
                        {idx + 1}-й Урок
                      </span>

                      <div className="flex items-start justify-between">
                        <h4 className={`text-[13px] font-bold text-slate-800 dark:text-white leading-snug mb-2.5 pr-2 break-words ${hasLink ? 'group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors' : ''}`}>
                          {l.title}
                        </h4>
                        {hasLink && <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors shrink-0 mt-0.5" />}
                      </div>
                      
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-semibold bg-slate-50 dark:bg-slate-800/50 w-fit px-2 py-1 rounded-lg">
                          <Clock className="w-3.5 h-3.5 text-primary-500 dark:text-primary-400"/> 
                          <span>{l.startTime} - {l.endTime}</span>
                        </div>
                        
                        {l.location && (
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {l.location}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                 
                 {dayLessons.length === 0 && (
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center opacity-40 select-none pointer-events-none">
                      <Calendar className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-600" />
                      <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">{t('org.schedule.noLessons', 'Нет занятий')}</p>
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
