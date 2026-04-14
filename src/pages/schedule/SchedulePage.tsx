import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetSchedule, orgGetTimetable, orgCreateEvent, orgDeleteEvent, orgUpdateEvent } from '../../lib/api';
import { Plus, ChevronLeft, ChevronRight, Clock, Trash2, Calendar, MapPin, Repeat, Copy, Clipboard, GripVertical, X } from 'lucide-react';
import type { ScheduleEvent, ScheduleEventType } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

interface ClipboardEvent {
  event: ScheduleEvent;
  action: 'copy';
}

const SchedulePage: React.FC = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const canEdit = role === 'admin' || role === 'manager' || role === 'super_admin';

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

  // Drag & Drop state
  const [draggedEvent, setDraggedEvent] = useState<ScheduleEvent | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Copy & Paste state
  const [clipboard, setClipboard] = useState<ClipboardEvent | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; event: ScheduleEvent; isTimetable: boolean;
  } | null>(null);
  const [clipboardToast, setClipboardToast] = useState('');

  const contextMenuRef = useRef<HTMLDivElement>(null);

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
        const getLocalDateStr = (d: Date) => {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const from = getLocalDateStr(weekDays[0]);
        const to = getLocalDateStr(weekDays[6]);
        return orgGetSchedule(from, to).then(setCalendarEvents).catch(() => {});
      })()
    ]).finally(() => setLoading(false));
  };

  useEffect(loadAll, [weekDays]);

  const prevWeek = () => setCurrent((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  const nextWeek = () => setCurrent((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });

  // ======== CLIPBOARD TOAST ========
  const showToast = useCallback((msg: string) => {
    setClipboardToast(msg);
    setTimeout(() => setClipboardToast(''), 2500);
  }, []);

  // ======== CONTEXT MENU HANDLING ========
  const handleContextMenu = useCallback((e: React.MouseEvent, event: ScheduleEvent, isTimetable: boolean) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, event, isTimetable });
  }, [canEdit]);

  // Close context menu on outside click
  useEffect(() => {
    const closeCtx = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', closeCtx);
      return () => document.removeEventListener('mousedown', closeCtx);
    }
  }, [contextMenu]);

  // ======== KEYBOARD SHORTCUTS (Ctrl+C / Ctrl+V) ========
  // We track selected event via a separate state for keyboard shortcuts
  const [selectedEvent, setSelectedEvent] = useState<{ event: ScheduleEvent; isTimetable: boolean } | null>(null);

  useEffect(() => {
    if (!canEdit) return;
    const handleKeyboard = (e: KeyboardEvent) => {
      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedEvent) {
        e.preventDefault();
        setClipboard({ event: selectedEvent.event, action: 'copy' });
        showToast(t('schedule.copied', 'Занятие скопировано!'));
      }
      // Paste — triggers paste modal
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) {
        e.preventDefault();
        setShowPasteModal(true);
      }
      // Escape — deselect
      if (e.key === 'Escape') {
        setSelectedEvent(null);
        setContextMenu(null);
        setShowPasteModal(false);
      }
    };
    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [canEdit, selectedEvent, clipboard, showToast, t]);

  // ======== PASTE MODAL ========
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteForm, setPasteForm] = useState<{
    dayOfWeek: number; startTime: string; endTime: string; date: string;
  }>({ dayOfWeek: 0, startTime: '09:00', endTime: '10:00', date: '' });

  const handlePaste = async () => {
    if (!clipboard) return;
    setSaving(true);
    setError('');
    try {
      const src = clipboard.event;
      if (activeTab === 'timetable') {
        const created = await orgCreateEvent({
          title: src.title,
          startTime: pasteForm.startTime,
          endTime: pasteForm.endTime,
          type: 'lesson',
          duration: src.duration,
          location: src.location,
          recurring: true,
          dayOfWeek: pasteForm.dayOfWeek,
          groupId: (src as any).groupId,
          courseId: (src as any).courseId,
          teacherId: (src as any).teacherId,
        });
        setTimetableEvents((p) => [...p, created]);
      } else {
        if (!pasteForm.date) return;
        const created = await orgCreateEvent({
          title: src.title,
          date: pasteForm.date,
          startTime: pasteForm.startTime,
          endTime: pasteForm.endTime,
          type: src.type,
          duration: src.duration,
          location: src.location,
          recurring: false,
        });
        setCalendarEvents((p) => [...p, created]);
      }
      setShowPasteModal(false);
      showToast(t('schedule.pasted', 'Занятие вставлено!'));
    } catch (e: any) {
      setError(e.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = useCallback((event: ScheduleEvent) => {
    setClipboard({ event, action: 'copy' });
    setContextMenu(null);
    showToast(t('schedule.copied', 'Занятие скопировано!'));
  }, [showToast, t]);

  // ======== DRAG & DROP — TIMETABLE (between days of week) ========
  const handleDragStart = useCallback((e: React.DragEvent, event: ScheduleEvent) => {
    if (!canEdit) return;
    setDraggedEvent(event);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', event.id);
    // Set drag image
    const el = e.currentTarget as HTMLElement;
    if (el) {
      e.dataTransfer.setDragImage(el, el.offsetWidth / 2, 20);
    }
  }, [canEdit]);

  const handleDragEnd = useCallback(() => {
    setDraggedEvent(null);
    setDragOverDay(null);
    setDragOverHour(null);
    setIsDragging(false);
  }, []);

  const handleDragOverDay = useCallback((e: React.DragEvent, dayIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDay(dayIdx);
  }, []);

  const handleDragLeaveDay = useCallback(() => {
    setDragOverDay(null);
  }, []);

  const handleDropOnDay = useCallback(async (e: React.DragEvent, targetDayOfWeek: number) => {
    e.preventDefault();
    setDragOverDay(null);
    if (!draggedEvent || !canEdit) return;

    const fromDay = (draggedEvent as any).dayOfWeek;
    if (fromDay === targetDayOfWeek) {
      handleDragEnd();
      return;
    }

    try {
      await orgUpdateEvent({
        id: draggedEvent.id,
        dayOfWeek: targetDayOfWeek,
      });
      setTimetableEvents((prev) =>
        prev.map((ev) =>
          ev.id === draggedEvent.id
            ? { ...ev, dayOfWeek: targetDayOfWeek } as any
            : ev
        )
      );
      showToast(t('schedule.moved', 'Занятие перемещено!'));
    } catch (err: any) {
      setError(err.message || t('common.error'));
    }
    handleDragEnd();
  }, [draggedEvent, canEdit, handleDragEnd, showToast, t]);

  // ======== DRAG & DROP — EVENTS (between dates / hours) ========
  const handleEventDragStart = useCallback((e: React.DragEvent, event: ScheduleEvent) => {
    if (!canEdit) return;
    setDraggedEvent(event);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', event.id);
  }, [canEdit]);

  const handleEventDragOverCell = useCallback((e: React.DragEvent, dayIdx: number, hour?: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDay(dayIdx);
    if (hour !== undefined) setDragOverHour(hour);
  }, []);

  const handleEventDragLeaveCell = useCallback(() => {
    setDragOverDay(null);
    setDragOverHour(null);
  }, []);

  const handleDropOnCell = useCallback(async (e: React.DragEvent, dayIdx: number, hour?: number) => {
    e.preventDefault();
    setDragOverDay(null);
    setDragOverHour(null);
    if (!draggedEvent || !canEdit) return;

    const targetDate = weekDays[dayIdx];
    const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

    const updates: any = { id: draggedEvent.id, date: targetDateStr };
    if (hour !== undefined) {
      const [, sm] = (draggedEvent.startTime || '09:00').split(':').map(Number);
      const [, em] = (draggedEvent.endTime || '10:00').split(':').map(Number);
      // Compute the duration in hours
      const [origSh] = (draggedEvent.startTime || '09:00').split(':').map(Number);
      const [origEh] = (draggedEvent.endTime || '10:00').split(':').map(Number);
      const durationHours = origEh - origSh;
      updates.startTime = `${String(hour).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
      updates.endTime = `${String(hour + durationHours).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    }

    try {
      await orgUpdateEvent(updates);
      setCalendarEvents((prev) =>
        prev.map((ev) =>
          ev.id === draggedEvent.id
            ? { ...ev, ...updates }
            : ev
        )
      );
      showToast(t('schedule.moved', 'Занятие перемещено!'));
    } catch (err: any) {
      setError(err.message || t('common.error'));
    }
    handleDragEnd();
  }, [draggedEvent, canEdit, weekDays, handleDragEnd, showToast, t]);

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

  const todayD = new Date();
  const todayStr = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, '0')}-${String(todayD.getDate()).padStart(2, '0')}`;
  const todayDayOfWeek = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })(); // 0=Mon

  const renderEventBlock = (ev: ScheduleEvent, top: number) => {
    const isExam = ev.type === 'exam';
    const isSelected = selectedEvent?.event.id === ev.id;
    return (
      <div key={ev.id} style={{ top: `${top}px`, minHeight: '30px' }}
        className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-[9px] leading-tight group shadow-sm transition-all ${
          canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        } ${isSelected ? 'ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-slate-800' : ''} ${
          isExam
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/30'
            : 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 border border-primary-200/50 dark:border-primary-800/30'
        }`}
        draggable={canEdit}
        onDragStart={(e) => handleEventDragStart(e, ev)}
        onDragEnd={handleDragEnd}
        onClick={() => canEdit && setSelectedEvent({ event: ev, isTimetable: false })}
        onContextMenu={(e) => handleContextMenu(e, ev, false)}
      >
        <div className="flex items-center justify-between">
          {canEdit && <GripVertical className="w-2 h-2 opacity-0 group-hover:opacity-40 mr-0.5 flex-shrink-0" />}
          <span className="font-bold truncate flex-1">{ev.title}</span>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(ev.id, false); }} className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity"><Trash2 className="w-2.5 h-2.5" /></button>
        </div>
        <span className="flex items-center gap-0.5 text-[8px] opacity-80"><Clock className="w-2 h-2" />{ev.startTime}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6" onClick={() => setSelectedEvent(null)}>
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

        <div className="flex items-center gap-2 w-full sm:w-fit">
          {/* Clipboard indicator */}
          {canEdit && clipboard && (
            <button
              onClick={() => setShowPasteModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all shadow-sm group"
              title={t('schedule.pasteHint', 'Ctrl+V — Вставить')}
            >
              <Clipboard className="w-4 h-4" />
              <span className="truncate max-w-[140px]">{clipboard.event.title}</span>
              <kbd className="hidden sm:inline text-[9px] px-1.5 py-0.5 bg-emerald-200/50 dark:bg-emerald-800/50 rounded font-mono">Ctrl+V</kbd>
              <X className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); setClipboard(null); }} />
            </button>
          )}
          <button onClick={() => {
            setForm(f => ({ ...f, type: activeTab === 'timetable' ? 'lesson' : 'exam' }));
            setShowCreate(true);
          }} className="btn-primary !py-2.5 !px-5 text-sm flex items-center gap-2 w-full sm:w-fit shadow-md shadow-primary-500/20 justify-center">
            <Plus className="w-4 h-4" />{t('org.schedule.addEvent', 'Добавить')}
          </button>
        </div>
      </div>

      {error && <div className="px-5 py-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm font-medium text-red-600 dark:text-red-400">{error}</div>}

      {/* Drag & Drop hint banner */}
      {canEdit && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-200/50 dark:border-indigo-800/30 rounded-2xl">
          <GripVertical className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <p className="text-[11px] font-medium text-indigo-700 dark:text-indigo-400">
            {t('schedule.dndHint', 'Перетаскивайте занятия между днями. Правый клик → Копировать, Ctrl+V → Вставить.')}
          </p>
        </div>
      )}

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
          {activeTab === 'timetable' && (() => {
            // Gather lessons per day, sorted by time
            const lessonsByDay = dayNames.map((_, dayIdx) =>
              timetableEvents
                .filter(e => (e as any).dayOfWeek === dayIdx)
                .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
            );
            const maxRows = Math.max(1, ...lessonsByDay.map(d => d.length));

            return (
              <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm backdrop-blur-sm">
                {/* ── Table Header: Days of week ── */}
                <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-slate-200 dark:border-slate-700/60">
                  {/* # column */}
                  <div className="px-1 py-3 border-r border-slate-100 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">#</span>
                  </div>
                  {dayNames.map((dayName, dayIdx) => {
                    const isToday = dayIdx === todayDayOfWeek;
                    const isDropTarget = isDragging && dragOverDay === dayIdx;
                    return (
                      <div
                        key={dayIdx}
                        className={`px-2 py-3 text-center border-r border-slate-100 dark:border-slate-700/50 last:border-r-0 transition-colors
                          ${isDropTarget ? 'bg-indigo-50 dark:bg-indigo-900/20' : isToday ? 'bg-primary-50/60 dark:bg-primary-900/15' : 'bg-slate-50/50 dark:bg-slate-800/40'}`}
                        onDragOver={(e) => handleDragOverDay(e, dayIdx)}
                        onDragLeave={handleDragLeaveDay}
                        onDrop={(e) => handleDropOnDay(e, dayIdx)}
                      >
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-slate-500'}`}>{dayNamesFull[dayIdx]}</p>
                        <p className={`text-sm font-black mt-0.5 ${isToday ? 'text-primary-700 dark:text-primary-300' : 'text-slate-600 dark:text-slate-300'}`}>{dayName}</p>
                        {isToday && <span className="inline-block mt-1 text-[8px] font-bold text-white bg-primary-500 px-1.5 py-px rounded-full">{t('schedule.today', 'Сегодня')}</span>}
                      </div>
                    );
                  })}
                </div>

                {/* ── Table Body: Lesson rows ── */}
                <div>
                  {Array.from({ length: maxRows }).map((_, rowIdx) => (
                    <div key={rowIdx} className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-slate-100 dark:border-slate-700/30 last:border-b-0">
                      {/* Row number */}
                      <div className="border-r border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-slate-400">{rowIdx + 1}</span>
                      </div>
                      {dayNames.map((_, dayIdx) => {
                        const lesson = lessonsByDay[dayIdx][rowIdx];
                        const isDropTarget = isDragging && dragOverDay === dayIdx;
                        const isBeingDragged = lesson && draggedEvent?.id === lesson.id;
                        const isSelected = lesson && selectedEvent?.event.id === lesson.id;

                        return (
                          <div
                            key={dayIdx}
                            className={`relative border-r border-slate-100 dark:border-slate-700/50 last:border-r-0 min-h-[72px] p-1 transition-colors
                              ${isDropTarget ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''}`}
                            onDragOver={(e) => handleDragOverDay(e, dayIdx)}
                            onDragLeave={handleDragLeaveDay}
                            onDrop={(e) => handleDropOnDay(e, dayIdx)}
                          >
                            {lesson ? (
                              <div
                                className={`group relative h-full rounded-xl p-2.5 border transition-all duration-200 overflow-hidden ${
                                  canEdit ? 'cursor-grab active:cursor-grabbing' : ''
                                } ${isBeingDragged ? 'opacity-30 scale-95' : 'hover:shadow-md hover:-translate-y-0.5'} ${
                                  isSelected
                                    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700/50 ring-2 ring-indigo-400/30'
                                    : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700/50 hover:border-primary-200 dark:hover:border-primary-800/50'
                                }`}
                                draggable={canEdit}
                                onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, lesson); }}
                                onDragEnd={handleDragEnd}
                                onClick={(e) => { e.stopPropagation(); canEdit && setSelectedEvent({ event: lesson, isTimetable: true }); }}
                                onContextMenu={(e) => handleContextMenu(e, lesson, true)}
                              >
                                {/* Left accent bar */}
                                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-gradient-to-b from-primary-400 to-indigo-500" />

                                {/* Action buttons */}
                                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                  {canEdit && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleCopy(lesson); }}
                                      className="p-1 rounded-md text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                                      title={t('schedule.copy', 'Копировать')}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(lesson.id, true); }}
                                    className="p-1 rounded-md text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>

                                {/* Content */}
                                <div className="pl-2">
                                  <p className="text-[12px] font-bold text-slate-800 dark:text-white leading-snug truncate pr-12">{lesson.title}</p>
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/60 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-primary-500 dark:text-primary-400" />{lesson.startTime}–{lesson.endTime}
                                    </span>
                                    {lesson.location && (
                                      <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5 truncate">
                                        <MapPin className="w-2.5 h-2.5" />{lesson.location}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Drag handle */}
                                {canEdit && <GripVertical className="absolute bottom-1.5 right-1.5 w-3 h-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-60 transition-opacity" />}
                              </div>
                            ) : (
                              /* Empty cell — drop target */
                              isDropTarget && (
                                <div className="h-full flex items-center justify-center">
                                  <div className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 flex items-center gap-1 animate-pulse">
                                    <Plus className="w-3.5 h-3.5" />{t('schedule.dropHere', 'Сюда')}
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* Empty state — if no lessons at all */}
                  {maxRows <= 1 && timetableEvents.length === 0 && (
                    <div className="py-16 flex flex-col items-center justify-center text-center">
                      <Calendar className="w-12 h-12 text-slate-200 dark:text-slate-700 mb-3" />
                      <p className="text-sm font-bold text-slate-400 dark:text-slate-500">{t('schedule.noLessons', 'Нет занятий')}</p>
                    </div>
                  )}
                </div>

                {/* ── Paste strip ── */}
                {canEdit && clipboard && !isDragging && (
                  <div className="border-t border-slate-200 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="grid grid-cols-[48px_repeat(7,1fr)]">
                      <div className="border-r border-slate-100 dark:border-slate-700/50" />
                      {dayNames.map((_, dayIdx) => (
                        <button
                          key={dayIdx}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPasteForm({
                              dayOfWeek: dayIdx,
                              startTime: clipboard.event.startTime || '09:00',
                              endTime: clipboard.event.endTime || '10:00',
                              date: '',
                            });
                            setShowPasteModal(true);
                          }}
                          className="border-r border-slate-100 dark:border-slate-700/50 last:border-r-0 py-2 flex items-center justify-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        >
                          <Clipboard className="w-3 h-3" />
                          {t('schedule.paste', 'Вставить')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ============================================== */}
          {/* TAB 2: EVENTS & EXAMS GRID (Date-based)        */}
          {/* ============================================== */}
          {activeTab === 'events' && (
            <>
              {/* Mobile: Day selector tabs */}
              <div className="flex sm:hidden gap-1.5 overflow-x-auto pb-3 mb-2 hide-scrollbar -mx-4 px-4">
                {weekDays.map((d, i) => {
                  const isToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
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
                    const isToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
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
                    const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                    const dayEvents = calendarEvents.filter((e) => e.date === dayStr && !(e as any).recurring);
                    const isDropCol = isDragging && dragOverDay === di;
                    return (
                      <div
                        key={di}
                        className={`relative border-r border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors ${isDropCol ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
                        onDragOver={(e) => handleEventDragOverCell(e, di)}
                        onDragLeave={handleEventDragLeaveCell}
                        onDrop={(e) => handleDropOnCell(e, di)}
                      >
                        {HOURS.map((h) => {
                          const isDropHourTarget = isDropCol && dragOverHour === h;
                          return (
                            <div
                              key={h}
                              className={`h-12 border-b border-slate-50 dark:border-slate-700/30 transition-colors ${isDropHourTarget ? 'bg-indigo-100/50 dark:bg-indigo-800/20' : ''}`}
                              onDragOver={(e) => handleEventDragOverCell(e, di, h)}
                              onDrop={(e) => handleDropOnCell(e, di, h)}
                            />
                          );
                        })}
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
                  const dDay = weekDays[selectedDay];
                  const dayStr = dDay ? `${dDay.getFullYear()}-${String(dDay.getMonth() + 1).padStart(2, '0')}-${String(dDay.getDate()).padStart(2, '0')}` : '';
                  const dayEvents = calendarEvents.filter((e) => e.date === dayStr && !(e as any).recurring);
                  
                  if (dayEvents.length === 0) return (
                    <div className="bg-white/50 dark:bg-slate-800/30 border border-amber-200/50 dark:border-slate-700/50 rounded-3xl p-10 text-center backdrop-blur-sm">
                      <Calendar className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                      <p className="text-sm font-bold text-slate-500">{t('org.schedule.noEvents', 'Нет событий на этот день')}</p>
                    </div>
                  );
                  
                  return dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className={`bg-white dark:bg-slate-800 border rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm ${ev.type === 'exam' ? 'border-amber-200 dark:border-amber-800/40 shadow-amber-500/5' : 'border-slate-200 dark:border-slate-700'}`}
                      onContextMenu={(e) => handleContextMenu(e, ev, false)}
                    >
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
                      <div className="flex items-center gap-1 shrink-0">
                        {canEdit && (
                          <button
                            onClick={() => handleCopy(ev)}
                            className="p-2 bg-indigo-50 text-indigo-500 hover:bg-indigo-500 hover:text-white rounded-xl transition-all shadow-sm"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => handleDelete(ev.id, false)} className="p-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </>
          )}

        </div>
      )}

      {/* ═══ Context Menu ═══ */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[100] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700/50 py-2 px-1 min-w-[180px] animate-in zoom-in-95 fade-in duration-150"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleCopy(contextMenu.event)}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl transition-colors"
          >
            <Copy className="w-4 h-4 text-indigo-500" />
            {t('schedule.copy', 'Копировать')}
            <kbd className="ml-auto text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded font-mono text-slate-400">Ctrl+C</kbd>
          </button>
          {clipboard && (
            <button
              onClick={() => {
                setContextMenu(null);
                if (activeTab === 'timetable') {
                  setPasteForm({
                    dayOfWeek: (contextMenu.event as any).dayOfWeek ?? 0,
                    startTime: clipboard.event.startTime || '09:00',
                    endTime: clipboard.event.endTime || '10:00',
                    date: '',
                  });
                } else {
                  setPasteForm({
                    dayOfWeek: 0,
                    startTime: clipboard.event.startTime || '09:00',
                    endTime: clipboard.event.endTime || '10:00',
                    date: contextMenu.event.date || '',
                  });
                }
                setShowPasteModal(true);
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl transition-colors"
            >
              <Clipboard className="w-4 h-4 text-emerald-500" />
              {t('schedule.paste', 'Вставить')}
              <kbd className="ml-auto text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded font-mono text-slate-400">Ctrl+V</kbd>
            </button>
          )}
          <div className="my-1 border-t border-slate-100 dark:border-slate-700/50" />
          <button
            onClick={() => {
              handleDelete(contextMenu.event.id, contextMenu.isTimetable);
              setContextMenu(null);
            }}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {t('common.delete', 'Удалить')}
          </button>
        </div>
      )}

      {/* ═══ Paste Modal ═══ */}
      {showPasteModal && clipboard && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowPasteModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 sm:p-8 w-full max-w-md shadow-2xl border border-slate-200/50 dark:border-slate-700/50 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Clipboard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('schedule.pasteTitle', 'Вставить занятие')}
                </h2>
                <p className="text-sm text-slate-500 truncate max-w-[250px]">{clipboard.event.title}</p>
              </div>
            </div>

            <div className="space-y-4">
              {activeTab === 'timetable' ? (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('schedule.dayOfWeek', 'День недели')}</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {dayNames.map((name, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPasteForm(f => ({ ...f, dayOfWeek: i }))}
                        className={`py-2.5 rounded-xl text-xs font-bold transition-all ${pasteForm.dayOfWeek === i
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-500/20 scale-105'
                          : 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600/50'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('common.date', 'Дата')}</label>
                  <input type="date" value={pasteForm.date} onChange={(e) => setPasteForm(f => ({ ...f, date: e.target.value }))} className="input bg-slate-50 dark:bg-slate-900/50" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('org.schedule.startTime', 'Начало')}</label>
                  <input type="time" value={pasteForm.startTime} onChange={(e) => setPasteForm(f => ({ ...f, startTime: e.target.value }))} className="input bg-slate-50 dark:bg-slate-900/50" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('org.schedule.endTime', 'Конец')}</label>
                  <input type="time" value={pasteForm.endTime} onChange={(e) => setPasteForm(f => ({ ...f, endTime: e.target.value }))} className="input bg-slate-50 dark:bg-slate-900/50" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setShowPasteModal(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm">{t('common.cancel', 'Отмена')}</button>
              <button
                onClick={handlePaste}
                disabled={saving || (activeTab === 'events' && !pasteForm.date)}
                className="btn-primary !px-6 !py-2.5 text-sm flex items-center gap-2"
              >
                <Clipboard className="w-4 h-4" />
                {saving ? '...' : t('schedule.paste', 'Вставить')}
              </button>
            </div>
          </div>
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

      {/* ═══ Toast Notification ═══ */}
      {clipboardToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-center gap-2 px-5 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl shadow-2xl text-sm font-bold">
            <Clipboard className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
            {clipboardToast}
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulePage;
