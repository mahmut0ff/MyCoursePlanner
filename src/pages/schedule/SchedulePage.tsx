import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetSchedule, orgCreateEvent, orgDeleteEvent } from '../../lib/api';
import { Plus, ChevronLeft, ChevronRight, Clock, Trash2 } from 'lucide-react';
import type { ScheduleEvent } from '../../types';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 - 20:00

const SchedulePage: React.FC = () => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', startTime: '09:00', endTime: '10:00', type: 'lesson' as const, duration: 60 });
  const [saving, setSaving] = useState(false);

  const weekStart = useMemo(() => {
    const d = new Date(current);
    d.setDate(d.getDate() - d.getDay() + 1);
    return d;
  }, [current]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
  [weekStart]);

  const load = () => {
    setLoading(true);
    const from = weekDays[0].toISOString().split('T')[0];
    const to = weekDays[6].toISOString().split('T')[0];
    orgGetSchedule(from, to).then(setEvents).finally(() => setLoading(false));
  };
  useEffect(load, [weekDays]);

  const prevWeek = () => setCurrent((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setCurrent((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  const today = () => setCurrent(new Date());

  const handleCreate = async () => {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    try {
      const created = await orgCreateEvent(form);
      setEvents((p) => [...p, created]);
      setShowCreate(false);
      setForm({ title: '', date: '', startTime: '09:00', endTime: '10:00', type: 'lesson', duration: 60 });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await orgDeleteEvent(id);
    setEvents((p) => p.filter((e) => e.id !== id));
  };

  const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('nav.schedule')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('org.schedule.subtitle')}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" />{t('org.schedule.addEvent')}
        </button>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={prevWeek} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={today} className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">{t('org.schedule.today')}</button>
        <button onClick={nextWeek} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronRight className="w-4 h-4" /></button>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {weekDays[0].toLocaleDateString()} — {weekDays[6].toLocaleDateString()}
        </span>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t('org.schedule.addEvent')}</h2>
            <div className="space-y-3">
              <input placeholder={t('org.schedule.eventTitle')} value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="input text-sm" autoFocus />
              <input type="date" value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="input text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="time" value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className="input text-sm" />
                <input type="time" value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="input text-sm" />
              </div>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as any }))} className="input text-sm">
                <option value="lesson">{t('org.schedule.typeLesson')}</option>
                <option value="exam">{t('org.schedule.typeExam')}</option>
                <option value="other">{t('org.schedule.typeOther')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm">{t('common.cancel')}</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary text-sm">{saving ? '...' : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Week Grid */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-8 border-b border-slate-100 dark:border-slate-700">
            <div className="px-2 py-2 text-xs text-slate-400"></div>
            {weekDays.map((d, i) => (
              <div key={i} className={`px-2 py-2 text-center border-l border-slate-100 dark:border-slate-700 ${d.toISOString().split('T')[0] === todayStr ? 'bg-primary-50 dark:bg-primary-900/10' : ''}`}>
                <p className="text-[10px] text-slate-400 uppercase">{dayNames[i]}</p>
                <p className={`text-sm font-semibold ${d.toISOString().split('T')[0] === todayStr ? 'text-primary-600 dark:text-primary-400' : 'text-slate-900 dark:text-white'}`}>{d.getDate()}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-8" style={{ minHeight: '400px' }}>
            <div className="border-r border-slate-100 dark:border-slate-700">
              {HOURS.map((h) => (
                <div key={h} className="h-12 flex items-start justify-end pr-2 pt-0.5">
                  <span className="text-[10px] text-slate-400">{h}:00</span>
                </div>
              ))}
            </div>
            {weekDays.map((day, di) => {
              const dayStr = day.toISOString().split('T')[0];
              const dayEvents = events.filter((e) => e.date === dayStr);
              return (
                <div key={di} className="relative border-l border-slate-100 dark:border-slate-700">
                  {HOURS.map((h) => <div key={h} className="h-12 border-b border-slate-50 dark:border-slate-700/50" />)}
                  {dayEvents.map((ev) => {
                    const [sh] = ev.startTime.split(':').map(Number);
                    const top = (sh - 7) * 48;
                    const isExam = ev.type === 'exam';
                    return (
                      <div key={ev.id} className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 text-[10px] leading-tight cursor-pointer group ${isExam ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800' : 'bg-primary-100 dark:bg-primary-900/20 text-primary-800 dark:text-primary-300 border border-primary-200 dark:border-primary-800'}`}
                        style={{ top: `${top}px`, minHeight: '36px' }}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">{ev.title}</span>
                          <button onClick={() => handleDelete(ev.id)} className="opacity-0 group-hover:opacity-100 text-red-500"><Trash2 className="w-2.5 h-2.5" /></button>
                        </div>
                        <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{ev.startTime}–{ev.endTime}</span>
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
