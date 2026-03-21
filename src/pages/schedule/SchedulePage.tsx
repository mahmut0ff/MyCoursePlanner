import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetSchedule, orgCreateEvent, orgDeleteEvent } from '../../lib/api';
import { Plus, ChevronLeft, ChevronRight, Clock, Trash2 } from 'lucide-react';
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

  const weekStart = useMemo(() => { const d = new Date(current); d.setDate(d.getDate() - d.getDay() + 1); return d; }, [current]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }), [weekStart]);

  const load = () => {
    setLoading(true); setError('');
    const from = weekDays[0].toISOString().split('T')[0];
    const to = weekDays[6].toISOString().split('T')[0];
    orgGetSchedule(from, to)
      .then(setEvents)
      .catch((e) => setError(e.message || 'Failed to load schedule'))
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
    } catch (e: any) { setError(e.message || 'Failed to create'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await orgDeleteEvent(id); setEvents((p) => p.filter((e) => e.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('nav.schedule')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('org.schedule.subtitle')}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" />{t('org.schedule.addEvent')}
        </button>
      </div>

      {error && <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">{error}</div>}

      {/* Week Nav */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
        <button onClick={() => setCurrent(new Date())} className="text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:underline">{t('org.schedule.today')}</button>
        <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
        <span className="text-[11px] text-slate-400 ml-1">{weekDays[0].toLocaleDateString()} — {weekDays[6].toLocaleDateString()}</span>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 w-full max-w-sm shadow-2xl border border-slate-200/50 dark:border-slate-700/50" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4">{t('org.schedule.addEvent')}</h2>
            <div className="space-y-2.5">
              <input placeholder={t('org.schedule.eventTitle')} value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-slate-900 dark:text-white" autoFocus />
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-slate-900 dark:text-white" />
              <div className="grid grid-cols-2 gap-2">
                <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-slate-900 dark:text-white" />
                <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-slate-900 dark:text-white" />
              </div>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as any }))}
                className="w-full bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-slate-900 dark:text-white">
                <option value="lesson">{t('org.schedule.typeLesson')}</option><option value="exam">{t('org.schedule.typeExam')}</option><option value="other">{t('org.schedule.typeOther')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving || !form.title.trim() || !form.date} className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-20"><div className="w-7 h-7 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin dark:border-slate-700 dark:border-t-primary-400" /></div> : (
        <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-xl overflow-hidden backdrop-blur-sm">
          <div className="grid grid-cols-8 border-b border-slate-100 dark:border-slate-700/50">
            <div className="px-1 py-2 text-[10px] text-slate-400 text-center" />
            {weekDays.map((d, i) => {
              const isToday = d.toISOString().split('T')[0] === todayStr;
              return (
                <div key={i} className={`px-1 py-2 text-center border-l border-slate-100 dark:border-slate-700/50 ${isToday ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
                  <p className="text-[9px] text-slate-400 uppercase">{dayNames[i]}</p>
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
                    const isExam = ev.type === 'exam';
                    return (
                      <div key={ev.id} style={{ top: `${top}px`, minHeight: '30px' }}
                        className={`absolute left-0.5 right-0.5 rounded-md px-1 py-0.5 text-[9px] leading-tight cursor-default group ${isExam ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200/50' : 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 border border-primary-200/50'}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">{ev.title}</span>
                          <button onClick={() => handleDelete(ev.id)} className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity"><Trash2 className="w-2 h-2" /></button>
                        </div>
                        <span className="flex items-center gap-0.5 text-[8px] opacity-80"><Clock className="w-2 h-2" />{ev.startTime}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulePage;
