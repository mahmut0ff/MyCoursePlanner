import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetSchedule, orgGetTimetable, orgCreateEvent, orgDeleteEvent } from '../../lib/api';
import { Plus, ChevronLeft, ChevronRight, Clock, Trash2, Calendar, MapPin, Repeat } from 'lucide-react';
import type { ScheduleEvent, ScheduleEventType } from '../../types';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

const SchedulePage: React.FC = () => {
  const { t } = useTranslation();
  const [timetableEvents, setTimetableEvents] = useState<ScheduleEvent[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{
    title: string; date: string; dayOfWeek: number; startTime: string; endTime: string;
    type: ScheduleEventType; duration: number; location: string;
  }>({ title: '', date: '', dayOfWeek: 0, startTime: '09:00', endTime: '10:00', type: 'lesson', duration: 60, location: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [activeTab, setActiveTab] = useState<'timetable' | 'events'>('timetable');
  const [mobileView, setMobileView] = useState<'week' | 'day'>('week');
  const [selectedDay, setSelectedDay] = useState(0);

  const dayNames = [
    t('schedule.mon', 'Пн'), t('schedule.tue', 'Вт'), t('schedule.wed', 'Ср'),
    t('schedule.thu', 'Чт'), t('schedule.fri', 'Пт'), t('schedule.sat', 'Сб'), t('schedule.sun', 'Вс'),
  ];
  const dayNamesFull = [
    t('schedule.monday', 'Понедельник'), t('schedule.tuesday', 'Вторник'), t('schedule.wednesday', 'Среда'),
    t('schedule.thursday', 'Четверг'), t('schedule.friday', 'Пятница'), t('schedule.saturday', 'Суббота'), t('schedule.sunday', 'Воскресенье'),
  ];

  const weekStart = useMemo(() => { const d = new Date(current); d.setDate(d.getDate() - d.getDay() + 1); return d; }, [current]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }), [weekStart]);

  // Load all data
  const loadAll = () => {
    setLoading(true); setError('');
    Promise.all([
      orgGetTimetable().then(setTimetableEvents).catch(() => {}),
      (() => {
        const from = weekDays[0].toISOString().split('T')[0];
        const to = weekDays[6].toISOString().split('T')[0];
        return orgGetSchedule(from, to).then(setCalendarEvents).catch(() => {});
      })()
    ]).finally(() => setLoading(false));
  };

  useEffect(loadAll, [weekDays]);

  const prevWeek = () => setCurrent((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setCurrent((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true); setError('');
    try {
      if (activeTab === 'timetable') {
        // create recurring lesson
        const created = await orgCreateEvent({
          title: form.title,
          startTime: form.startTime,
          endTime: form.endTime,
          type: 'lesson',
          duration: form.duration,
          location: form.location,
          recurring: true,
          dayOfWeek: form.dayOfWeek,
        });
        setTimetableEvents((p) => [...p, created]);
      } else {
        // create date-based event
        if (!form.date) return;
        const created = await orgCreateEvent({
          title: form.title,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          type: form.type,
          duration: form.duration,
          location: form.location,
          recurring: false,
        });
        setCalendarEvents((p) => [...p, created]);
      }
      setShowCreate(false);
      setForm({ title: '', date: '', dayOfWeek: 0, startTime: '09:00', endTime: '10:00', type: activeTab === 'timetable' ? 'lesson' : 'exam', duration: 60, location: '' });
    } catch (e: any) { setError(e.message || t('common.error')); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string, fromTimetable: boolean) => {
    try {
      await orgDeleteEvent(id);
      if (fromTimetable) {
        setTimetableEvents((p) => p.filter((e) => e.id !== id));
      } else {
        setCalendarEvents((p) => p.filter((e) => e.id !== id));
      }
    } catch (e: any) { setError(e.message); }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const todayDayOfWeek = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })(); // 0=Mon

  const renderEventBlock = (ev: ScheduleEvent, top: number) => {
    const isExam = ev.type === 'exam';
    return (
      <div key={ev.id} style={{ top: `${top}px`, minHeight: '30px' }}
        className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-[9px] leading-tight cursor-default group shadow-sm ${isExam ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/30' : 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 border border-primary-200/50 dark:border-primary-800/30'}`}>
        <div className="flex items-center justify-between">
          <span className="font-bold truncate">{ev.title}</span>
          <button onClick={() => handleDelete(ev.id, false)} className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity"><Trash2 className="w-2.5 h-2.5" /></button>
        </div>
        <span className="flex items-center gap-0.5 text-[8px] opacity-80"><Clock className="w-2 h-2" />{ev.startTime}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300">
            {t('nav.schedule')}
          </h1>
          <p className="text-sm text-slate-500 max-w-lg mt-1">{t('org.schedule.subtitle', 'Расписание занятий, экзаменов и мероприятий')}</p>
        </div>
        
        {/* Modern Tabs */}
        <div className="flex-1 max-w-xl mx-auto xl:mx-0 w-full xl:w-auto overflow-x-auto hide-scrollbar">
          <div className="flex p-1 bg-slate-100/80 dark:bg-slate-800/50 rounded-xl border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm min-w-max">
            <button 
              onClick={() => setActiveTab('timetable')} 
              className={`flex-1 px-5 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'timetable' ? 'bg-white dark:bg-slate-700 text-primary-600 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              <Repeat className="w-4 h-4" />
              {t('schedule.timetableTab', 'Расписание уроков')}
            </button>
            <button 
              onClick={() => setActiveTab('events')} 
              className={`flex-1 px-5 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'events' ? 'bg-white dark:bg-slate-700 text-amber-600 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              <Calendar className="w-4 h-4" />
              {t('schedule.eventsTab', 'События и экзамены')}
            </button>
          </div>
        </div>

        <button onClick={() => {
          setForm(f => ({ ...f, type: activeTab === 'timetable' ? 'lesson' : 'exam' }));
          setShowCreate(true);
        }} className="btn-primary !py-2.5 !px-5 text-sm flex items-center gap-2 w-full sm:w-fit shadow-md shadow-primary-500/20 justify-center">
          <Plus className="w-4 h-4" />{t('org.schedule.addEvent', 'Добавить')}
        </button>
      </div>

      {error && <div className="px-5 py-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm font-medium text-red-600 dark:text-red-400">{error}</div>}

      {/* Week Navigator — only for Events tab */}
      {activeTab === 'events' && (
        <div className="flex items-center gap-3">
          <button onClick={prevWeek} className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shadow-sm"><ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" /></button>
          <button onClick={() => setCurrent(new Date())} className="px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 shadow-sm transition-colors">{t('org.schedule.today', 'Сегодня')}</button>
          <button onClick={nextWeek} className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shadow-sm"><ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" /></button>
          <span className="text-sm font-medium text-slate-500 ml-2 bg-white/50 dark:bg-slate-800/30 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">{weekDays[0].toLocaleDateString()} — {weekDays[6].toLocaleDateString()}</span>
        </div>
      )}

      {/* Timetable banner */}
      {activeTab === 'timetable' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary-50/50 dark:bg-primary-900/10 border border-primary-200/50 dark:border-primary-800/30 rounded-2xl">
          <Repeat className="w-5 h-5 text-primary-500 flex-shrink-0" />
          <p className="text-xs font-medium text-primary-700 dark:text-primary-400">
            {t('schedule.timetableBanner', 'Постоянное расписание — уроки здесь привязаны к дням недели и повторяются каждую неделю автоматически.')}
          </p>
        </div>
      )}

      {loading ? <div className="flex justify-center py-32"><div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin shadow-lg" /></div> : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* ============================================== */}
          {/* TAB 1: TIMETABLE VIEW — BY DAY OF WEEK         */}
          {/* ============================================== */}
          {activeTab === 'timetable' && (
            <div className="flex overflow-x-auto gap-4 pb-6 snap-x snap-mandatory md:snap-none hide-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
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
                         <span className="inline-block mt-1 text-[9px] font-bold text-white bg-primary-500 px-2 py-0.5 rounded-full">{t('schedule.today', 'Сегодня')}</span>
                       )}
                    </div>

                    {/* Lessons Sequence */}
                    <div className="flex-1 px-3 pb-4 space-y-2.5 relative min-h-[300px]">
                       {dayLessons.map((l, idx) => (
                         <div key={l.id} className="relative group bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-700/50 hover:shadow-lg hover:shadow-primary-500/5 transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                           <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary-400 to-indigo-500" />
                           
                           <div className="flex justify-between items-start mb-2">
                              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                {idx + 1}-{t('schedule.nthLesson', 'й Урок')}
                              </span>
                              <button onClick={() => handleDelete(l.id, true)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1 rounded-md transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                           </div>

                           <h4 className="text-[13px] font-bold text-slate-800 dark:text-white leading-snug mb-2.5 pr-2 break-words">
                             {l.title}
                           </h4>
                           
                           <div className="flex flex-col gap-1.5 mt-auto">
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
                       ))}
                       
                       {dayLessons.length === 0 && (
                          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center opacity-40 select-none pointer-events-none">
                            <Calendar className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-600" />
                            <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">{t('schedule.noLessons', 'Нет занятий')}</p>
                          </div>
                       )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ============================================== */}
          {/* TAB 2: EVENTS & EXAMS GRID (Date-based)        */}
          {/* ============================================== */}
          {activeTab === 'events' && (
            <>
              {/* Mobile: Day selector tabs */}
              <div className="flex sm:hidden gap-1.5 overflow-x-auto pb-3 mb-2 hide-scrollbar -mx-4 px-4">
                {weekDays.map((d, i) => {
                  const isToday = d.toISOString().split('T')[0] === todayStr;
                  return (
                    <button key={i} onClick={() => { setMobileView('day'); setSelectedDay(i); }}
                      className={`flex flex-col items-center px-4 py-2.5 rounded-2xl text-xs font-medium shrink-0 transition-all ${selectedDay === i && mobileView === 'day' ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30' : isToday ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/20' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'}`}>
                      <span className="text-[10px] uppercase font-bold">{dayNames[i]}</span>
                      <span className="text-lg font-black mt-0.5">{d.getDate()}</span>
                    </button>
                  );
                })}
              </div>

              {/* Desktop Grid View */}
              <div className="hidden sm:block bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm backdrop-blur-sm">
                <div className="grid grid-cols-8 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50">
                  <div className="px-1 py-3 border-r border-slate-100 dark:border-slate-700/50" />
                  {weekDays.map((d, i) => {
                    const isToday = d.toISOString().split('T')[0] === todayStr;
                    return (
                      <div key={i} className={`px-1 py-3 text-center border-r border-slate-100 dark:border-slate-700/50 last:border-0 ${isToday ? 'bg-amber-50/50 dark:bg-amber-900/10 shadow-inner' : ''}`}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{dayNames[i]}</p>
                        <p className={`text-sm font-black mt-0.5 ${isToday ? 'text-amber-600 dark:text-amber-500' : 'text-slate-700 dark:text-slate-200'}`}>{d.getDate()}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-8 relative" style={{ minHeight: '480px' }}>
                  <div className="border-r border-slate-100 dark:border-slate-700/50 bg-slate-50/30 dark:bg-slate-800/30">
                    {HOURS.map((h) => <div key={h} className="h-12 flex items-start justify-end pr-2 pt-1"><span className="text-[10px] font-medium text-slate-400">{h}:00</span></div>)}
                  </div>
                  {weekDays.map((day, di) => {
                    const dayStr = day.toISOString().split('T')[0];
                    const dayEvents = calendarEvents.filter((e) => e.date === dayStr && !(e as any).recurring);
                    return (
                      <div key={di} className="relative border-r border-slate-100 dark:border-slate-700/50 last:border-0">
                        {HOURS.map((h) => <div key={h} className="h-12 border-b border-slate-50 dark:border-slate-700/30" />)}
                        {dayEvents.map((ev) => {
                          const [sh] = (ev.startTime || '09:00').split(':').map(Number);
                          const top = Math.max(0, (sh - 7)) * 48;
                          return renderEventBlock(ev, top);
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mobile List View */}
              <div className="sm:hidden space-y-3 mt-4">
                {(() => {
                  const dayStr = weekDays[selectedDay]?.toISOString().split('T')[0];
                  const dayEvents = calendarEvents.filter((e) => e.date === dayStr && !(e as any).recurring);
                  
                  if (dayEvents.length === 0) return (
                    <div className="bg-white/50 dark:bg-slate-800/30 border border-amber-200/50 dark:border-slate-700/50 rounded-3xl p-10 text-center backdrop-blur-sm">
                      <Calendar className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                      <p className="text-sm font-bold text-slate-500">{t('org.schedule.noEvents', 'Нет событий на этот день')}</p>
                    </div>
                  );
                  
                  return dayEvents.map((ev) => (
                    <div key={ev.id} className={`bg-white dark:bg-slate-800 border rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm ${ev.type === 'exam' ? 'border-amber-200 dark:border-amber-800/40 shadow-amber-500/5' : 'border-slate-200 dark:border-slate-700'}`}>
                      <div className="flex items-center gap-3 w-full">
                        <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${ev.type === 'exam' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white text-[13px] truncate">{ev.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3"/> {ev.startTime}
                            </span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${ev.type === 'exam' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                              {ev.type === 'exam' ? t('org.schedule.typeExam', 'Экзамен') : t('org.schedule.typeOther', 'Другое')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => handleDelete(ev.id, false)} className="p-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ));
                })()}
              </div>
            </>
          )}

        </div>
      )}

      {/* ═══ Create Modal ═══ */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 sm:p-8 w-full max-w-md shadow-2xl border border-slate-200/50 dark:border-slate-700/50 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
              {activeTab === 'timetable' ? t('schedule.newTimetableLesson', 'Новый урок в расписании') : t('schedule.newEvent', 'Новое событие')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('org.schedule.eventTitle', 'Название')}</label>
                <input placeholder="Например: Математика, 11-А" value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="input bg-slate-50 dark:bg-slate-900/50" autoFocus />
              </div>

              {/* Timetable: Day of Week selector */}
              {activeTab === 'timetable' ? (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('schedule.dayOfWeek', 'День недели')}</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {dayNames.map((name, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, dayOfWeek: i }))}
                        className={`py-2.5 rounded-xl text-xs font-bold transition-all ${form.dayOfWeek === i
                          ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30 ring-2 ring-primary-500/20 scale-105'
                          : 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600/50'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-400 flex items-center gap-1">
                    <Repeat className="w-3 h-3" />
                    {t('schedule.willRepeatEvery', 'Урок будет повторяться каждый')} {dayNamesFull[form.dayOfWeek]?.toLowerCase()}
                  </p>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('common.date', 'Дата')}</label>
                  <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input bg-slate-50 dark:bg-slate-900/50" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('org.schedule.startTime', 'Начало')}</label>
                  <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className="input bg-slate-50 dark:bg-slate-900/50" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('org.schedule.endTime', 'Конец')}</label>
                  <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="input bg-slate-50 dark:bg-slate-900/50" />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('schedule.classroom', 'Аудитория / Кабинет')}</label>
                <input placeholder="напр. Каб. 305" value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className="input bg-slate-50 dark:bg-slate-900/50" />
              </div>

              {/* Event type — only for Events tab */}
              {activeTab === 'events' && (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('org.schedule.eventType', 'Тип')}</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as any }))} className="input bg-slate-50 dark:bg-slate-900/50">
                    <option value="exam">{t('org.schedule.typeExam', 'Экзамен')}</option>
                    <option value="other">{t('org.schedule.typeOther', 'Другое')}</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm">{t('common.cancel', 'Отмена')}</button>
              <button 
                onClick={handleCreate} 
                disabled={saving || !form.title.trim() || (activeTab === 'events' && !form.date)} 
                className="btn-primary !px-6 !py-2.5 text-sm"
              >
                {saving ? '...' : t('common.save', 'Сохранить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulePage;
