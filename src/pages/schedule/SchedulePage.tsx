import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetSchedule, orgCreateEvent, orgDeleteEvent } from '../../lib/api';
import { Plus, ChevronLeft, ChevronRight, Clock, Trash2, Calendar } from 'lucide-react';
import type { ScheduleEvent } from '../../types';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

const SchedulePage: React.FC = () => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', startTime: '09:00', endTime: '10:00', type: 'lesson' as const, duration: 60 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mobileView, setMobileView] = useState<'week' | 'day'>('week');
  const [selectedDay, setSelectedDay] = useState(0);

  const dayNames = [
    t('schedule.mon', 'Пн'), t('schedule.tue', 'Вт'), t('schedule.wed', 'Ср'),
    t('schedule.thu', 'Чт'), t('schedule.fri', 'Пт'), t('schedule.sat', 'Сб'), t('schedule.sun', 'Вс'),
  ];

  const weekStart = useMemo(() => { const d = new Date(current); d.setDate(d.getDate() - d.getDay() + 1); return d; }, [current]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }), [weekStart]);

  const load = () => {
    setLoading(true); setError('');
    const from = weekDays[0].toISOString().split('T')[0];
    const to = weekDays[6].toISOString().split('T')[0];
    orgGetSchedule(from, to)
      .then(setEvents)
      .catch((e) => setError(e.message || t('common.error', 'Ошибка загрузки')))
      .finally(() => setLoading(false));
  };
  useEffect(load, [weekDays]);

  const prevWeek = () => setCurrent((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setCurrent((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });

  const handleCreate = async () => {
    if (!form.title.trim() || !form.date) return;
    setSaving(true); setError('');
    try {
      const created = await orgCreateEvent(form);
      setEvents((p) => [...p, created]);
      setShowCreate(false); setForm({ title: '', date: '', startTime: '09:00', endTime: '10:00', type: 'lesson', duration: 60 });
    } catch (e: any) { setError(e.message || t('common.error')); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await orgDeleteEvent(id); setEvents((p) => p.filter((e) => e.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const renderEventBlock = (ev: ScheduleEvent, top: number) => {
    const isExam = ev.type === 'exam';
    return (
      <div key={ev.id} style={{ top: `${top}px`, minHeight: '30px' }}
        className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-[9px] leading-tight cursor-default group ${isExam ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/30' : 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 border border-primary-200/50 dark:border-primary-800/30'}`}>
        <div className="flex items-center justify-between">
          <span className="font-medium truncate">{ev.title}</span>
          <button onClick={() => handleDelete(ev.id)} className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity"><Trash2 className="w-2.5 h-2.5" /></button>
        </div>
        <span className="flex items-center gap-0.5 text-[8px] opacity-80"><Clock className="w-2 h-2" />{ev.startTime}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('nav.schedule')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('org.schedule.subtitle')}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary !py-2 !px-3 text-sm flex items-center gap-1.5 w-fit">
          <Plus className="w-4 h-4" />{t('org.schedule.addEvent')}
        </button>
      </div>

      {error && <div className="px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-500">{error}</div>}

      {/* Week Nav */}
      <div className="flex items-center gap-2">
        <button onClick={prevWeek} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" /></button>
        <button onClick={() => setCurrent(new Date())} className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">{t('org.schedule.today')}</button>
        <button onClick={nextWeek} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-400" /></button>
        <span className="text-sm text-slate-400 ml-1">{weekDays[0].toLocaleDateString()} — {weekDays[6].toLocaleDateString()}</span>
      </div>

      {/* Mobile: Day selector tabs */}
      <div className="flex sm:hidden gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {weekDays.map((d, i) => {
          const isToday = d.toISOString().split('T')[0] === todayStr;
          return (
            <button key={i} onClick={() => { setMobileView('day'); setSelectedDay(i); }}
              className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium shrink-0 transition-all ${selectedDay === i && mobileView === 'day' ? 'bg-primary-600 text-white' : isToday ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}>
              <span className="text-[10px]">{dayNames[i]}</span>
              <span className="text-sm font-bold">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 w-full max-w-sm shadow-2xl border border-slate-200/50 dark:border-slate-700/50" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4">{t('org.schedule.addEvent')}</h2>
            <div className="space-y-3">
              <div>
                <label className="label">{t('org.schedule.eventTitle')}</label>
                <input placeholder={t('org.schedule.eventTitle')} value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="input" autoFocus />
              </div>
              <div>
                <label className="label">{t('common.date')}</label>
                <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('org.schedule.startTime', 'Начало')}</label>
                  <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">{t('org.schedule.endTime', 'Конец')}</label>
                  <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="input" />
                </div>
              </div>
              <div>
                <label className="label">{t('org.schedule.eventType', 'Тип')}</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as any }))} className="input">
                  <option value="lesson">{t('org.schedule.typeLesson')}</option>
                  <option value="exam">{t('org.schedule.typeExam')}</option>
                  <option value="other">{t('org.schedule.typeOther')}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving || !form.title.trim() || !form.date} className="btn-primary text-sm">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin dark:border-primary-800 dark:border-t-primary-400" /></div> : (
        <>
          {/* Desktop: weekly grid */}
          <div className="hidden sm:block bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm">
            <div className="grid grid-cols-8 border-b border-slate-100 dark:border-slate-700/50">
              <div className="px-1 py-2" />
              {weekDays.map((d, i) => {
                const isToday = d.toISOString().split('T')[0] === todayStr;
                return (
                  <div key={i} className={`px-1 py-2 text-center border-l border-slate-100 dark:border-slate-700/50 ${isToday ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
                    <p className="text-[10px] text-slate-400 uppercase">{dayNames[i]}</p>
                    <p className={`text-xs font-semibold ${isToday ? 'text-primary-600 dark:text-primary-400' : 'text-slate-900 dark:text-white'}`}>{d.getDate()}</p>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-8" style={{ minHeight: '420px' }}>
              <div className="border-r border-slate-100 dark:border-slate-700/50">
                {HOURS.map((h) => <div key={h} className="h-10 flex items-start justify-end pr-1.5 pt-0.5"><span className="text-[9px] text-slate-400">{h}:00</span></div>)}
              </div>
              {weekDays.map((day, di) => {
                const dayStr = day.toISOString().split('T')[0];
                const dayEvents = events.filter((e) => e.date === dayStr);
                return (
                  <div key={di} className="relative border-l border-slate-100 dark:border-slate-700/50">
                    {HOURS.map((h) => <div key={h} className="h-10 border-b border-slate-50 dark:border-slate-700/30" />)}
                    {dayEvents.map((ev) => {
                      const [sh] = (ev.startTime || '09:00').split(':').map(Number);
                      const top = Math.max(0, (sh - 7)) * 40;
                      return renderEventBlock(ev, top);
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile: Day list view */}
          <div className="sm:hidden space-y-2">
            {(() => {
              const dayStr = weekDays[selectedDay]?.toISOString().split('T')[0];
              const dayEvents = events.filter((e) => e.date === dayStr);
              if (dayEvents.length === 0) return (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 text-center">
                  <Calendar className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">{t('org.schedule.noEvents', 'Нет событий на этот день')}</p>
                </div>
              );
              return dayEvents.map((ev) => (
                <div key={ev.id} className={`bg-white dark:bg-slate-800 border rounded-xl p-4 flex items-start justify-between gap-3 ${ev.type === 'exam' ? 'border-amber-200 dark:border-amber-800/40' : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ev.type === 'exam' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'}`}>
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white text-sm">{ev.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ev.startTime} — {ev.endTime || ''}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium mt-1 inline-block ${ev.type === 'exam' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'}`}>
                        {ev.type === 'exam' ? t('org.schedule.typeExam') : ev.type === 'lesson' ? t('org.schedule.typeLesson') : t('org.schedule.typeOther')}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(ev.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              ));
            })()}
          </div>
        </>
      )}
    </div>
  );
};

export default SchedulePage;
