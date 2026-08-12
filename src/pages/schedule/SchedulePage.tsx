import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { orgGetSchedule, orgGetTimetable, orgCreateEvent, orgDeleteEvent, orgUpdateEvent, orgGetGroups, orgListClassrooms } from '../../lib/api';
import { Plus, ChevronLeft, ChevronRight, ChevronDown, Clock, Trash2, Calendar, MapPin, Repeat, Copy, Clipboard, GripVertical, X, Sparkles, Pencil, RefreshCw } from 'lucide-react';
import type { ScheduleEvent, ScheduleEventType, Group, Classroom } from '../../types';
import { timeToMins, minsToTime, appDayOfWeek, slotSpan, spansOverlap } from '../../lib/scheduleTime';
import { sameRoom } from '../../lib/classrooms';
import { groupByRoom, roomFieldsOf, sectionKeyOf, NO_ROOM, type RoomSection } from '../../lib/scheduleRooms';
import { cacheKey, useCachedResource } from '../../lib/apiCache';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanGate } from '../../contexts/PlanContext';
import { useBranch } from '../../contexts/BranchContext';
import BranchFilter from '../../components/ui/BranchFilter';
import ClassroomSelect from '../../components/ui/ClassroomSelect';
import ScheduleReviewModal from '../../components/ai/ScheduleReviewModal';

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

const DEFAULT_SLOT_MINUTES = 60;

/**
 * Подпись кабинета. Справочник имеет приоритет, свободный текст — запасной путь
 * для занятий, созданных до его появления.
 */
const roomLabel = (ev: { classroomName?: string; location?: string }) =>
  ev.classroomName || ev.location || '';

/** Дата в местном виде YYYY-MM-DD. new Date(строка) читает её как UTC и в минусовых зонах промахивается на день. */
const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const asList = <T,>(r: any): T[] => (Array.isArray(r) ? r : []);

/** Стабильные пустышки: кешу и хукам нужен неизменный identity начального значения. */
const NO_EVENTS: ScheduleEvent[] = [];
const NO_CLASSROOMS: Classroom[] = [];
const NO_GROUPS: Group[] = [];

interface ClipboardEvent {
  event: ScheduleEvent;
  action: 'copy';
}

const SchedulePage: React.FC = () => {
  const { t } = useTranslation();
  const { canWrite } = usePermissions();
  const { canAccess } = usePlanGate();
  const { activeBranchId, branches, loading: branchLoading } = useBranch();
  const { firebaseUser, organizationId } = useAuth();
  // RBAC is the single access surface: the server gates on schedule:write, so a
  // teacher holding that grant must see the same controls a manager does.
  const canEdit = canWrite('schedule');
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiEvents, setAiEvents] = useState<any[]>([]);

  /** '' — все кабинеты, '__none__' — занятия без кабинета, иначе id кабинета. */
  const [classroomFilter, setClassroomFilter] = useState('');
  /** Явно свёрнутые/развёрнутые кабинеты. Чего здесь нет — решает наличие занятий. */
  const [roomOpen, setRoomOpen] = useState<Record<string, boolean>>({});
  const [current, setCurrent] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{
    title: string; date: string; dayOfWeek: number; startTime: string; endTime: string;
    type: ScheduleEventType; duration: number; location: string; classroomId?: string | null;
    branchId?: string; groupId?: string;
    /** Заполнен → модалка правит существующее занятие, пусто → создаёт новое. */
    editingId?: string | null;
    /** Правим ли запись недельного расписания (иначе — разовое событие). */
    editingRecurring?: boolean;
  }>({ title: '', date: '', dayOfWeek: 0, startTime: '09:00', endTime: '10:00', type: 'lesson', duration: 60, location: '', classroomId: null, editingId: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Which pending action a conflict blocked, so the banner can offer "поставить всё равно".
  const [conflictRetry, setConflictRetry] = useState<'create' | 'paste' | null>(null);
  
  const [activeTab, setActiveTab] = useState<'timetable' | 'events'>('timetable');
  const [mobileView, setMobileView] = useState<'week' | 'day'>('week');
  const [selectedDay, setSelectedDay] = useState(0);

  // Auto-refresh current time every minute
  const [currentMins, setCurrentMins] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  useEffect(() => {
    const int = setInterval(() => setCurrentMins(new Date().getHours() * 60 + new Date().getMinutes()), 60000);
    return () => clearInterval(int);
  }, []);

  // Drag & Drop state
  const [draggedEvent, setDraggedEvent] = useState<ScheduleEvent | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  /** Ключ секции-кабинета под курсором: подсветить надо одну ячейку, а не колонку во всех таблицах. */
  const [dragOverRoom, setDragOverRoom] = useState<string | null>(null);
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

  // ======== ДАННЫЕ ========
  // Каждый список кешируется под своим ключом и живёт своей жизнью: смена недели
  // больше не перезапрашивает недельное расписание, группы и кабинеты — они от
  // недели не зависят. Экран рисуется из прошлого ответа сразу, сеть догоняет.
  //
  // Ключ описывает ВСЁ, от чего зависит ответ: пользователь (кеш переживает выход
  // из аккаунта), организация и активный филиал (его штампует GET-перехватчик
  // api.ts, в аргументах вызова он не виден).
  //
  // Пока филиал не определился, ключа НЕТ и запросов тоже: иначе первый ответ
  // приходил бы по всей организации, попадал в кеш под «ещё не выбранным»
  // филиалом и на секунду показывал чужое здание.
  const ready = !!firebaseUser && !branchLoading;
  const scope = cacheKey(firebaseUser?.uid, organizationId, activeBranchId);
  const weekFrom = localDateStr(weekDays[0]);
  const weekTo = localDateStr(weekDays[6]);

  const timetableRes = useCachedResource<ScheduleEvent[]>(
    ready ? cacheKey('sch.timetable', scope) : null,
    () => orgGetTimetable().then(asList<ScheduleEvent>),
    NO_EVENTS,
  );
  const weekRes = useCachedResource<ScheduleEvent[]>(
    ready ? cacheKey('sch.week', scope, weekFrom, weekTo) : null,
    () => orgGetSchedule(weekFrom, weekTo).then(asList<ScheduleEvent>),
    NO_EVENTS,
  );
  const classroomsRes = useCachedResource<Classroom[]>(
    ready ? cacheKey('sch.classrooms', scope) : null,
    () => orgListClassrooms().then(asList<Classroom>),
    NO_CLASSROOMS,
  );
  const groupsRes = useCachedResource<Group[]>(
    ready ? cacheKey('sch.groups', scope) : null,
    () => orgGetGroups().then(asList<Group>),
    NO_GROUPS,
  );

  const timetableEvents = timetableRes.data;
  const setTimetableEvents = timetableRes.setData;
  const calendarEvents = weekRes.data;
  const setCalendarEvents = weekRes.setData;
  const classrooms = classroomsRes.data;
  const groups = groupsRes.data;

  // Спиннер во весь экран — только пока ждём ПЕРВЫЙ ответ и показывать нечего.
  // Есть данные прошлого захода → рисуем их и обновляем на месте. Ответ, который
  // не пришёл (нет прав на справочник кабинетов, оборвалась сеть), спиннер тоже
  // снимает: иначе страница крутилась бы вечно из-за одного из четырёх списков.
  const awaitingFirst = (r: { loaded: boolean; busy: boolean }) => !r.loaded && r.busy;
  const loading = !ready || (activeTab === 'timetable'
    ? awaitingFirst(timetableRes) || awaitingFirst(classroomsRes)
    : awaitingFirst(weekRes));
  const refreshing = timetableRes.busy || weekRes.busy || classroomsRes.busy || groupsRes.busy;

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
    dayOfWeek: number; startTime: string; endTime: string; date: string; branchId?: string;
    /** Кабинет, в чью таблицу вставляют. Не задан — занятие сохраняет кабинет источника. */
    room?: { classroomId: string | null; location: string };
  }>({ dayOfWeek: 0, startTime: '09:00', endTime: '10:00', date: '' });

  const handlePaste = async (force = false) => {
    if (!clipboard) return;
    setSaving(true);
    setError(''); setConflictRetry(null);
    try {
      const src = clipboard.event;
      const isRecurring = activeTab === 'timetable';

      const startMins = timeToMins(pasteForm.startTime) ?? 0;
      const pastedDuration = Math.max(5, (timeToMins(pasteForm.endTime) ?? startMins + DEFAULT_SLOT_MINUTES) - startMins);
      // Вставка из таблицы кабинета кладёт занятие в ЭТОТ кабинет; из меню и по
      // Ctrl+V кабинет наследуется от источника.
      const room = pasteForm.room
        ?? { classroomId: (src as any).classroomId || null, location: src.location || '' };

      if (!force) {
        const conflict = checkConflict({
          ...pasteForm,
          recurring: isRecurring,
          classroomId: room.classroomId,
          location: room.location,
          teacherId: (src as any).teacherId,
          groupId: (src as any).groupId,
          duration: pastedDuration,
        });

        if (conflict) {
          setError(conflict);
          setConflictRetry('paste');
          setSaving(false);
          return;
        }
      }

      // Everything that identifies the lesson travels with the copy — the dated branch
      // used to drop group/course/teacher, leaving an orphan block on the calendar.
      const pastePayload = {
        title: src.title,
        startTime: pasteForm.startTime,
        endTime: pasteForm.endTime,
        duration: pastedDuration,
        classroomId: room.classroomId,
        location: room.location,
        groupId: (src as any).groupId,
        courseId: (src as any).courseId,
        teacherId: (src as any).teacherId,
        branchId: pasteForm.branchId,
        force,
      };

      if (isRecurring) {
        const created = await orgCreateEvent({
          ...pastePayload,
          type: 'lesson',
          recurring: true,
          dayOfWeek: pasteForm.dayOfWeek,
        });
        setTimetableEvents((p) => [...p, created]);
      } else {
        if (!pasteForm.date) return;
        const created = await orgCreateEvent({
          ...pastePayload,
          date: pasteForm.date,
          type: src.type,
          recurring: false,
        });
        setCalendarEvents((p) => [...p, created]);
      }
      setShowPasteModal(false);
      showToast(t('schedule.pasted', 'Занятие вставлено!'));
    } catch (e: any) {
      setError(e.message || t('common.error'));
      if (!force) setConflictRetry('paste');
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
    setDragOverRoom(null);
    setDragOverHour(null);
    setIsDragging(false);
  }, []);

  const handleDragOverDay = useCallback((e: React.DragEvent, dayIdx: number, roomKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDay(dayIdx);
    setDragOverRoom(roomKey);
  }, []);

  const handleDragLeaveDay = useCallback(() => {
    setDragOverDay(null);
    setDragOverRoom(null);
  }, []);

  /**
   * Перенос урока внутри недельной сетки. Таблиц теперь столько, сколько
   * кабинетов, поэтому перетаскивание меняет и день, и кабинет: строка «куда»
   * определяется тем, в чью таблицу отпустили.
   */
  const handleDropOnDay = useCallback(async (e: React.DragEvent, targetDayOfWeek: number, section: RoomSection) => {
    e.preventDefault();
    setDragOverDay(null);
    setDragOverRoom(null);
    if (!draggedEvent || !canEdit) return;

    const fromDay = (draggedEvent as any).dayOfWeek;
    const room = roomFieldsOf(section);
    const sameSlot = fromDay === targetDayOfWeek
      && sectionKeyOf(draggedEvent, classrooms) === section.key;
    if (sameSlot) {
      handleDragEnd();
      return;
    }

    try {
      await orgUpdateEvent({
        id: draggedEvent.id,
        dayOfWeek: targetDayOfWeek,
        classroomId: room.classroomId,
        location: room.location,
      });
      setTimetableEvents((prev) =>
        prev.map((ev) =>
          ev.id === draggedEvent.id
            ? { ...ev, dayOfWeek: targetDayOfWeek, ...room } as any
            : ev
        )
      );
      showToast(t('schedule.moved', 'Занятие перемещено!'));
    } catch (err: any) {
      // 409 = накладка, сервер видит всю организацию. Текст объясняет, чем занято;
      // «поставить всё равно» живёт в модалке правки, а не в перетаскивании.
      setError(err.message || t('common.error'));
    }
    handleDragEnd();
  }, [draggedEvent, canEdit, classrooms, setTimetableEvents, handleDragEnd, showToast, t]);

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
  }, [draggedEvent, canEdit, weekDays, setCalendarEvents, handleDragEnd, showToast, t]);

  const checkConflict = (testEv: Partial<ScheduleEvent>, ignoreId?: string) => {
    // A recurring lesson is identified by its weekday, a one-off by its date.
    // Reading `date` first would misfire whenever a stale date lingers in the form,
    // so the caller's intent (`recurring`) decides which one we trust.
    const isRecurring = testEv.recurring === true;
    const dayOfWeek = isRecurring
      ? testEv.dayOfWeek
      : (testEv.date ? appDayOfWeek(testEv.date) : testEv.dayOfWeek);
    const onDate = isRecurring ? null : (testEv.date || null);

    const candSpan = slotSpan(testEv);
    if (!candSpan) return null;

    // A weekly lesson occupies the slot on every matching date, so it is always in
    // the pool; dated events only clash with the exact same date.
    const pool = [
      ...timetableEvents.filter(e => e.dayOfWeek === dayOfWeek),
      ...(onDate ? calendarEvents.filter(e => e.date === onDate) : []),
    ];

    for (const e of pool) {
      if (e.id === ignoreId) continue;

      const eSpan = slotSpan(e);
      if (!eSpan) continue;

      if (spansOverlap(candSpan, eSpan)) {
        // Кабинет сравниваем той же логикой, что и сервер: по classroomId ИЛИ по
        // нормализованному названию, и только внутри одного филиала — иначе
        // «Каб. 301» в двух зданиях читались бы как один кабинет.
        const sameBranch = ((testEv as any).branchId || null) === (e.branchId || null);
        if (sameBranch && sameRoom(testEv as any, e)) {
          const label = e.classroomName || e.location;
          return `Конфликт: Кабинет "${label}" уже занят занятием "${e.title}" (${e.startTime}-${e.endTime})`;
        }
        if (testEv.teacherId && e.teacherId && testEv.teacherId === e.teacherId) {
          return `Конфликт: У преподавателя уже стоит занятие "${e.title}" (${e.startTime}-${e.endTime})`;
        }
        if (testEv.groupId && e.groupId && testEv.groupId === e.groupId) {
          return `Конфликт: У группы уже стоит занятие "${e.title}" (${e.startTime}-${e.endTime})`;
        }
      }
    }
    return null;
  };

  const handleCreate = async (force = false) => {
    if (!form.title.trim()) return;
    // При правке вид занятия задан самой записью, а не открытой вкладкой:
    // недельный урок остаётся недельным, даже если смотреть на него из «Событий».
    const isRecurring = form.editingId ? !!form.editingRecurring : activeTab === 'timetable';
    setSaving(true); setError(''); setConflictRetry(null);
    try {
      // Duration is derived, never the untouched form default — the server stores it
      // and other views (ongoing highlight, group card) position blocks from it.
      const startMins = timeToMins(form.startTime) ?? 0;
      const durationMins = Math.max(5, (timeToMins(form.endTime) ?? startMins + DEFAULT_SLOT_MINUTES) - startMins);

      if (!force) {
        // Правя занятие, само с собой оно конфликтовать не должно.
        const conflict = checkConflict(
          { ...form, recurring: isRecurring, duration: durationMins },
          form.editingId || undefined,
        );
        if (conflict) {
          setError(conflict);
          setConflictRetry('create');
          setSaving(false);
          return;
        }
      }

      const payload = {
        title: form.title,
        startTime: form.startTime,
        endTime: form.endTime,
        duration: durationMins,
        classroomId: form.classroomId || null,
        location: form.location,
        branchId: form.branchId,
        groupId: form.groupId,
        force,
      };

      const shape = isRecurring
        ? { type: 'lesson' as const, recurring: true, dayOfWeek: form.dayOfWeek }
        : { date: form.date, type: form.type, recurring: false };
      if (!isRecurring && !form.date) return;

      if (form.editingId) {
        await orgUpdateEvent({ id: form.editingId, ...payload, ...shape });
        // Правка отражается на месте — перезагружать неделю целиком незачем.
        const patch = (e: ScheduleEvent) =>
          e.id === form.editingId ? { ...e, ...payload, ...shape } as ScheduleEvent : e;
        if (isRecurring) setTimetableEvents((p) => p.map(patch));
        else setCalendarEvents((p) => p.map(patch));
        showToast(t('schedule.updated', 'Занятие обновлено'));
      } else if (isRecurring) {
        const created = await orgCreateEvent({ ...payload, ...shape });
        setTimetableEvents((p) => [...p, created]);
      } else {
        const created = await orgCreateEvent({ ...payload, ...shape });
        setCalendarEvents((p) => [...p, created]);
      }
      setShowCreate(false);
    } catch (e: any) {
      setError(e.message || t('common.error'));
      // The server runs the same check across the whole org, so it can reject what
      // the local week-scoped check passed. Offer the same override.
      if (!force) setConflictRetry('create');
    }
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

  /**
   * First hour of the grid that nothing occupies yet on that slot. Without this the
   * modal always opened at 09:00, so every second lesson of a day collided with the
   * first one and the conflict check read as "you may only book one lesson per day".
   */
  const nextFreeStart = (dayOfWeek: number, date?: string, section?: RoomSection) => {
    const taken = [
      ...timetableEvents.filter(e => e.dayOfWeek === dayOfWeek),
      ...(date ? calendarEvents.filter(e => e.date === date) : []),
    ]
      // Занятость считаем по тому кабинету, в чью таблицу нажали: кабинет свободен
      // в 09:00, даже если в это время идёт урок в соседнем.
      .filter(e => !section || sectionKeyOf(e, classrooms) === section.key)
      .map(slotSpan).filter((s): s is [number, number] => s !== null);

    for (const h of HOURS) {
      const slot: [number, number] = [h * 60, h * 60 + DEFAULT_SLOT_MINUTES];
      if (!taken.some(busy => spansOverlap(slot, busy))) return minsToTime(slot[0]);
    }
    return '09:00';
  };

  /**
   * Opens the create modal on a clean form. It must REPLACE the state, not merge into
   * it: a date left over from the events tab used to survive into a timetable create
   * and silently point the conflict check at the wrong weekday.
   *
   * `section` — кабинет, из чьей таблицы нажали «Добавить»: он подставляется в
   * форму вместе со своим филиалом, иначе список кабинетов в модалке окажется
   * из другого здания и подставленный кабинет отрисуется пустой строкой.
   */
  const openCreate = (prefill?: { dayOfWeek?: number; date?: string; startTime?: string; section?: RoomSection }) => {
    const startTime = prefill?.startTime || '09:00';
    const startMins = timeToMins(startTime) ?? 9 * 60;
    const room = prefill?.section ? roomFieldsOf(prefill.section) : null;
    setError(''); setConflictRetry(null);
    setForm({
      title: '',
      date: prefill?.date || '',
      dayOfWeek: prefill?.dayOfWeek ?? todayDayOfWeek,
      startTime,
      endTime: minsToTime(startMins + DEFAULT_SLOT_MINUTES),
      type: activeTab === 'timetable' ? 'lesson' : 'exam',
      duration: DEFAULT_SLOT_MINUTES,
      location: room?.location || '',
      classroomId: room?.classroomId || null,
      branchId: prefill?.section?.classroom?.branchId || activeBranchId || undefined,
      groupId: undefined,
      editingId: null,
    });
    setShowCreate(true);
  };

  /** Открывает ту же модалку на существующем занятии. */
  const openEdit = (ev: ScheduleEvent, isTimetable: boolean) => {
    const startMins = timeToMins(ev.startTime) ?? 9 * 60;
    const endTime = ev.endTime || minsToTime(startMins + (Number(ev.duration) || DEFAULT_SLOT_MINUTES));
    setError(''); setConflictRetry(null); setContextMenu(null); setSelectedEvent(null);
    setForm({
      title: ev.title || '',
      date: ev.date || '',
      dayOfWeek: ev.dayOfWeek ?? (ev.date ? appDayOfWeek(ev.date) : todayDayOfWeek),
      startTime: ev.startTime || '09:00',
      endTime,
      type: ev.type || 'lesson',
      duration: Number(ev.duration) || DEFAULT_SLOT_MINUTES,
      location: roomLabel(ev),
      classroomId: ev.classroomId || null,
      branchId: ev.branchId || undefined,
      groupId: ev.groupId || undefined,
      editingId: ev.id,
      editingRecurring: isTimetable,
    });
    setShowCreate(true);
  };

  /**
   * Недельное расписание, разложенное по кабинетам: одна таблица на кабинет.
   * Кабинет справочника остаётся в списке, даже когда занятий в нём нет, — это
   * готовое место, куда ставят урок, а не отсутствующая строка.
   */
  const roomSections = useMemo(
    () => groupByRoom(timetableEvents, classrooms), [timetableEvents, classrooms]);

  /**
   * Справочник кабинетов не заведён и делить нечего: показываем одну таблицу без
   * заголовка — ровно так, как страница выглядела до разбивки по кабинетам.
   */
  const bareTimetable = roomSections.length === 1 && roomSections[0].key === NO_ROOM;

  /**
   * Фильтр по кабинету. Применяется ТОЛЬКО к отрисовке: проверка накладок обязана
   * видеть все занятия, иначе выбранный фильтр «разрешал» бы ставить урок поверх
   * скрытого.
   */
  const visibleSections = useMemo(
    () => (classroomFilter ? roomSections.filter(s => s.key === classroomFilter) : roomSections),
    [roomSections, classroomFilter]);

  // Сетка событий остаётся общей, но кабинет опознаётся тем же разбором, что и в
  // таблицах: иначе фильтр и заголовки таблиц отвечали бы по-разному.
  const visibleCalendar = useMemo(
    () => (classroomFilter
      ? calendarEvents.filter(ev => sectionKeyOf(ev, classrooms) === classroomFilter)
      : calendarEvents),
    [calendarEvents, classrooms, classroomFilter]);

  /**
   * Секция раскрыта, пока её не свернули руками; пустые кабинеты по умолчанию
   * сложены — иначе справочник из тридцати аудиторий превращает страницу в
   * километр пустых таблиц.
   */
  const isRoomOpen = (section: RoomSection) => roomOpen[section.key] ?? section.events.length > 0;
  const toggleRoom = (key: string, open: boolean) =>
    setRoomOpen(prev => ({ ...prev, [key]: !open }));

  // Какие поля показывать в модалке. При правке решает сама запись, а не вкладка:
  // недельный урок нельзя молча превратить в разовое событие только потому, что
  // его открыли с другой вкладки.
  const modalIsRecurring = form.editingId ? !!form.editingRecurring : activeTab === 'timetable';

  const isEventOngoing = (ev: ScheduleEvent, isTimetable: boolean) => {
    if (isTimetable) {
      if (ev.dayOfWeek !== todayDayOfWeek) return false;
    } else {
      if (ev.date !== todayStr) return false;
    }
    const [h, m] = (ev.startTime || '00:00').split(':').map(Number);
    const startMins = h * 60 + m;
    const endMins = startMins + (ev.duration || 45);
    return currentMins >= startMins && currentMins < endMins;
  };

  /** Подпись кабинета в шапке его таблицы. */
  const sectionTitle = (section: RoomSection) =>
    section.kind === 'none' ? t('classrooms.withoutRoom', 'Без кабинета') : section.title;

  /**
   * Недельная таблица ОДНОГО кабинета: семь колонок-дней, строки — уроки по
   * порядку. Сетка по часам здесь не нужна: второй урок дня идёт после первого
   * независимо от того, сколько между ними минут.
   *
   * `bare` — в организации ещё не заведено ни одного кабинета и все занятия
   * лежат в единственной секции «без кабинета»: шапка над одной таблицей была бы
   * шумом, поэтому её не рисуем.
   */
  const renderRoomSection = (section: RoomSection, bare: boolean) => {
    const lessonsByDay = dayNames.map((_, dayIdx) =>
      section.events
        .filter(e => (e as any).dayOfWeek === dayIdx)
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
    );
    const maxRows = Math.max(1, ...lessonsByDay.map(d => d.length));
    // Выбранный фильтр раскрывает кабинет всегда: иначе он показал бы одну
    // свёрнутую полоску вместо расписания, за которым в него и пришли.
    const open = bare || !!classroomFilter || isRoomOpen(section);
    // Филиал в подписи — только под «Все филиалы»: одноимённые кабинеты двух
    // зданий иначе неразличимы, а внутри одного филиала это лишнее слово.
    const branchName = !activeBranchId && section.classroom?.branchId
      ? branches.find(b => b.id === section.classroom?.branchId)?.name || null
      : null;

    return (
      <div key={section.key} className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm backdrop-blur-sm">
        {!bare && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleRoom(section.key, open); }}
            aria-expanded={open}
            className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
            <MapPin className="w-4 h-4 shrink-0 text-slate-400" />
            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{sectionTitle(section)}</span>
            {section.classroom?.capacity ? (
              <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {section.classroom.capacity} {t('classrooms.seatsShort', 'мест')}
              </span>
            ) : null}
            {branchName && (
              <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">· {branchName}</span>
            )}
            {section.kind === 'legacy' && (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                {t('classrooms.notInCatalog', 'не из справочника')}
              </span>
            )}
            <span className={`ml-auto shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-lg ${
              section.events.length
                ? 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              {section.events.length || t('classrooms.noLessons', 'нет занятий')}
            </span>
          </button>
        )}

        {open && (
          <>
            {/* ── Шапка таблицы: дни недели ── */}
            <div className={`grid grid-cols-[48px_repeat(7,1fr)] ${bare ? 'border-b' : 'border-y'} border-slate-200 dark:border-slate-700/60`}>
              {/* # column */}
              <div className="px-1 py-3 border-r border-slate-100 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">#</span>
              </div>
              {dayNames.map((dayName, dayIdx) => {
                const isToday = dayIdx === todayDayOfWeek;
                const isDropTarget = isDragging && dragOverRoom === section.key && dragOverDay === dayIdx;
                return (
                  <div
                    key={dayIdx}
                    className={`px-2 py-3 text-center border-r border-slate-100 dark:border-slate-700/50 last:border-r-0 transition-colors
                      ${isDropTarget ? 'bg-slate-100 dark:bg-slate-700/30' : isToday ? 'bg-slate-100 dark:bg-slate-700/30' : 'bg-slate-50/50 dark:bg-slate-800/40'}`}
                    onDragOver={(e) => handleDragOverDay(e, dayIdx, section.key)}
                    onDragLeave={handleDragLeaveDay}
                    onDrop={(e) => handleDropOnDay(e, dayIdx, section)}
                  >
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>{dayNamesFull[dayIdx]}</p>
                    <p className={`text-sm font-black mt-0.5 ${isToday ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{dayName}</p>
                    {isToday && <span className="inline-block mt-1 text-[8px] font-bold text-white bg-slate-900 dark:bg-white dark:text-slate-900 px-1.5 py-px rounded-full">{t('schedule.today', 'Сегодня')}</span>}
                  </div>
                );
              })}
            </div>

            {/* ── Тело таблицы: строки уроков ── */}
            <div>
              {Array.from({ length: maxRows }).map((_, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-slate-100 dark:border-slate-700/30 last:border-b-0">
                  {/* Row number */}
                  <div className="border-r border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-400">{rowIdx + 1}</span>
                  </div>
                  {dayNames.map((_, dayIdx) => {
                    const lesson = lessonsByDay[dayIdx][rowIdx];
                    const isDropTarget = isDragging && dragOverRoom === section.key && dragOverDay === dayIdx;
                    const isBeingDragged = lesson && draggedEvent?.id === lesson.id;
                    const isSelected = lesson && selectedEvent?.event.id === lesson.id;
                    const ongoing = lesson && isEventOngoing(lesson, true);

                    return (
                      <div
                        key={dayIdx}
                        className={`relative border-r border-slate-100 dark:border-slate-700/50 last:border-r-0 min-h-[72px] min-w-0 p-1 transition-colors
                          ${isDropTarget ? 'bg-slate-100/50 dark:bg-slate-700/20' : ''}`}
                        onDragOver={(e) => handleDragOverDay(e, dayIdx, section.key)}
                        onDragLeave={handleDragLeaveDay}
                        onDrop={(e) => handleDropOnDay(e, dayIdx, section)}
                      >
                        {lesson ? (
                          <div
                            className={`group/card relative h-full rounded-xl p-2 border transition-all duration-200 overflow-hidden ${
                              canEdit ? 'cursor-grab active:cursor-grabbing' : ''
                            } ${isBeingDragged ? 'opacity-30 scale-95' : 'hover:shadow-md hover:-translate-y-0.5'} ${
                              ongoing
                                ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-500/50 ring-2 ring-rose-500/30'
                                : isSelected
                                  ? 'bg-slate-100 dark:bg-slate-700/40 border-slate-300 dark:border-slate-600 ring-2 ring-slate-400/30'
                                  : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                            draggable={canEdit}
                            onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, lesson); }}
                            onDragEnd={handleDragEnd}
                            onClick={(e) => { e.stopPropagation(); canEdit && setSelectedEvent({ event: lesson, isTimetable: true }); }}
                            onDoubleClick={(e) => { e.stopPropagation(); if (canEdit) openEdit(lesson, true); }}
                            onContextMenu={(e) => handleContextMenu(e, lesson, true)}
                          >
                            {/* Left accent bar */}
                            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-slate-900 dark:bg-white/80" />

                            {/* Action buttons */}
                            <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
                              {canEdit && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCopy(lesson); }}
                                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
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
                            <div className="pl-2 min-w-0 overflow-hidden">
                              <p className="text-[12px] font-bold text-slate-800 dark:text-white leading-snug truncate pr-8">{lesson.title}</p>
                              <span className={`text-[10px] font-medium inline-flex items-center gap-0.5 mt-0.5 ${ongoing ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                                <Clock className={`w-2.5 h-2.5 shrink-0 ${ongoing ? 'text-rose-500 animate-pulse' : 'text-slate-400'}`} />{lesson.startTime}–{lesson.endTime}
                              </span>
                              {/* Кабинет назван в шапке таблицы — в плитке он был бы повтором,
                                  кроме случая единственной таблицы «без кабинета». */}
                              {bare && roomLabel(lesson) && (
                                <span className="text-[10px] font-medium inline-flex items-center gap-0.5 mt-0.5 text-slate-500 dark:text-slate-400 max-w-full">
                                  <MapPin className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                                  <span className="truncate">{roomLabel(lesson)}</span>
                                </span>
                              )}
                              {lesson.teacherName && (
                                <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {lesson.teacherName}
                                </span>
                              )}
                            </div>

                            {/* Drag handle */}
                            {canEdit && <GripVertical className="absolute bottom-1 right-1 w-3 h-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover/card:opacity-60 transition-opacity" />}
                          </div>
                        ) : (
                          /* Empty cell — drop target */
                          isDropTarget && (
                            <div className="h-full flex items-center justify-center">
                              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 animate-pulse">
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
            </div>

            {/* ── Paste / Add strip ── */}
            {canEdit && !isDragging && (
              <div className="border-t border-slate-200 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="grid grid-cols-[48px_repeat(7,1fr)]">
                  <div className="border-r border-slate-100 dark:border-slate-700/50" />
                  {dayNames.map((_, dayIdx) => (
                    <button
                      key={dayIdx}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Занятие заводится сразу в тот кабинет, из чьей таблицы нажали,
                        // и в филиал этого кабинета — иначе выбор пришлось бы повторять руками.
                        const branchId = section.classroom?.branchId || activeBranchId || undefined;
                        if (clipboard) {
                          setPasteForm({
                            dayOfWeek: dayIdx,
                            startTime: clipboard.event.startTime || '09:00',
                            endTime: clipboard.event.endTime || '10:00',
                            date: '',
                            branchId,
                            room: roomFieldsOf(section),
                          });
                          setShowPasteModal(true);
                        } else {
                          openCreate({ dayOfWeek: dayIdx, startTime: nextFreeStart(dayIdx, undefined, section), section });
                        }
                      }}
                      className={`border-r border-slate-100 dark:border-slate-700/50 last:border-r-0 py-2 flex items-center justify-center gap-1 text-[10px] font-bold transition-colors ${
                        clipboard
                          ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                      }`}
                    >
                      {clipboard ? <Clipboard className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      {clipboard ? t('schedule.paste', 'Вставить') : t('schedule.add', 'Добавить')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderEventBlock = (ev: ScheduleEvent, top: number, styleProps?: { left?: string; width?: string }) => {
    const isExam = ev.type === 'exam';
    const isSelected = selectedEvent?.event.id === ev.id;
    const ongoing = isEventOngoing(ev, false);
    return (
      <div key={ev.id} style={{ top: `${top}px`, minHeight: '30px', left: styleProps?.left || '2px', width: styleProps?.width || 'calc(100% - 4px)' }}
        className={`absolute rounded-md px-1.5 py-0.5 text-[9px] leading-tight group shadow-sm transition-all ${
          canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        } ${isSelected ? 'ring-2 ring-slate-400 ring-offset-1 dark:ring-offset-slate-800' : ''} ${
          ongoing 
            ? 'bg-rose-500 dark:bg-rose-600 text-white border border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-[pulse_3s_ease-in-out_infinite]' 
            : isExam
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/30'
            : 'bg-slate-100 dark:bg-slate-700/40 text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-slate-600/30'
        }`}
        draggable={canEdit}
        onDragStart={(e) => handleEventDragStart(e, ev)}
        onDragEnd={handleDragEnd}
        onClick={() => canEdit && setSelectedEvent({ event: ev, isTimetable: false })}
        onDoubleClick={(e) => { e.stopPropagation(); if (canEdit) openEdit(ev, false); }}
        onContextMenu={(e) => handleContextMenu(e, ev, false)}
      >
        <div className="flex items-center justify-between">
          {canEdit && <GripVertical className="w-2 h-2 opacity-0 group-hover:opacity-40 mr-0.5 flex-shrink-0" />}
          <span className="font-bold truncate flex-1">{ev.title}</span>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(ev.id, false); }} className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity"><Trash2 className="w-2.5 h-2.5" /></button>
        </div>
        <div className="flex items-center gap-1.5 text-[8px] opacity-80 min-w-0">
          <span className="flex items-center gap-0.5 shrink-0"><Clock className="w-2 h-2" />{ev.startTime}</span>
          {roomLabel(ev) && (
            <span className="flex items-center gap-0.5 truncate"><MapPin className="w-2 h-2 shrink-0" />{roomLabel(ev)}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6" onClick={() => setSelectedEvent(null)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('nav.schedule')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mt-1">{t('org.schedule.subtitle', 'Расписание занятий, экзаменов и мероприятий')}</p>
          {/* Данные на экране из прошлого ответа — говорим, что сверяемся с сервером.
              Спиннер во весь экран здесь был бы обманом: показывать уже есть что. */}
          {refreshing && !loading && (
            <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <RefreshCw className="w-3 h-3 animate-spin" />
              {t('schedule.refreshing', 'Обновляем…')}
            </span>
          )}
        </div>

        {/* Modern Tabs */}
        <div className="flex shrink-0 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('timetable')}
            className={`px-3.5 py-1.5 text-[13px] font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${activeTab === 'timetable' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          >
            <Repeat className="w-4 h-4 shrink-0" />
            {t('schedule.timetableTab', 'Расписание уроков')}
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`px-3.5 py-1.5 text-[13px] font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${activeTab === 'events' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          >
            <Calendar className="w-4 h-4 shrink-0" />
            {t('schedule.eventsTab', 'События и экзамены')}
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Фильтр = переход к одной таблице. Список строим из тех же секций, что
              и таблицы, поэтому в нём нет вариантов, которым ничего не соответствует. */}
          {roomSections.length > 1 && (
            <label className="flex items-center gap-1.5 shrink-0">
              <span className="sr-only">{t('schedule.filterByClassroom', 'Фильтр по кабинету')}</span>
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={classroomFilter}
                onChange={(e) => setClassroomFilter(e.target.value)}
                className={`text-[13px] font-semibold rounded-xl border px-2.5 py-1.5 bg-white dark:bg-slate-800 transition-colors ${
                  classroomFilter
                    ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                <option value="">{t('classrooms.all', 'Все кабинеты')}</option>
                {roomSections.map(s => (
                  <option key={s.key} value={s.key}>{sectionTitle(s)}</option>
                ))}
              </select>
            </label>
          )}
          {/* Clipboard indicator */}
          {canEdit && clipboard && (
            <button
              onClick={() => setShowPasteModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-bold rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all shadow-sm group"
              title={t('schedule.pasteHint', 'Ctrl+V — Вставить')}
            >
              <Clipboard className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-[110px]">{clipboard.event.title}</span>
              <kbd className="hidden sm:inline text-[9px] px-1.5 py-0.5 bg-emerald-200/50 dark:bg-emerald-800/50 rounded font-mono">Ctrl+V</kbd>
              <X className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); setClipboard(null); }} />
            </button>
          )}
          {canEdit && canAccess('ai') && timetableEvents.length > 0 && (
            <button
              onClick={() => {
                setAiEvents(timetableEvents.map((ev) => ({
                  title: ev.title,
                  type: ev.type,
                  day: DAY_NAMES[(ev as any).dayOfWeek ?? 0] || '',
                  startTime: ev.startTime,
                  endTime: ev.endTime,
                  group: groups.find((g) => g.id === (ev as any).groupId)?.name || null,
                  location: roomLabel(ev) || null,
                })));
                setAiReviewOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-br from-violet-600 to-indigo-600 hover:opacity-90 transition-opacity shadow-sm shrink-0"
              title="AI-анализ расписания"
            >
              <Sparkles className="w-4 h-4 shrink-0" /><span className="hidden sm:inline">AI-анализ</span>
            </button>
          )}
          <button onClick={() => openCreate()} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[13px] font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shrink-0 justify-center">
            <Plus className="w-4 h-4 shrink-0" />{t('org.schedule.addEvent', 'Добавить')}
          </button>
        </div>
      </div>

      <ScheduleReviewModal open={aiReviewOpen} onClose={() => setAiReviewOpen(false)} events={aiEvents} />

      {error && (
        <div className="px-5 py-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm font-medium text-red-600 dark:text-red-400 flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          {conflictRetry && canEdit && (
            <button
              onClick={() => (conflictRetry === 'paste' ? handlePaste(true) : handleCreate(true))}
              disabled={saving}
              className="shrink-0 px-3.5 py-1.5 rounded-xl text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {t('schedule.forceCreate', 'Поставить всё равно')}
            </button>
          )}
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

      {loading ? <div className="flex justify-center py-32"><div className="w-8 h-8 border-2 border-slate-300 dark:border-slate-600 rounded-full animate-spin border-t-slate-900 dark:border-t-white" /></div> : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* ============================================== */}
          {/* TAB 1: TIMETABLE VIEW — BY DAY OF WEEK         */}
          {/* ============================================== */}
          {activeTab === 'timetable' && (roomSections.length === 0 ? (
            <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-2xl py-16 flex flex-col items-center justify-center text-center shadow-sm">
              <Calendar className="w-12 h-12 text-slate-200 dark:text-slate-700 mb-3" />
              <p className="text-sm font-bold text-slate-400 dark:text-slate-500">{t('schedule.noLessons', 'Нет занятий')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleSections.map((section) => renderRoomSection(section, bareTimetable))}
              {visibleSections.length === 0 && (
                <div className="bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/50 rounded-2xl py-12 text-center shadow-sm">
                  <p className="text-sm font-bold text-slate-400 dark:text-slate-500">{t('schedule.noLessons', 'Нет занятий')}</p>
                </div>
              )}
            </div>
          ))}

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
                      className={`flex flex-col items-center px-4 py-2.5 rounded-2xl text-xs font-medium shrink-0 transition-all ${selectedDay === i && mobileView === 'day' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' : isToday ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-900 dark:text-white ring-1 ring-slate-300 dark:ring-slate-600' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'}`}>
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
                    const dayEvents = visibleCalendar.filter((e) => e.date === dayStr && !(e as any).recurring);
                    const isDropCol = isDragging && dragOverDay === di;
                    return (
                      <div
                        key={di}
                        className={`relative border-r border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors ${isDropCol ? 'bg-slate-100/50 dark:bg-slate-700/20' : ''}`}
                        onDragOver={(e) => handleEventDragOverCell(e, di)}
                        onDragLeave={handleEventDragLeaveCell}
                        onDrop={(e) => handleDropOnCell(e, di)}
                      >
                        {HOURS.map((h) => {
                          const isDropHourTarget = isDropCol && dragOverHour === h;
                          return (
                            <div
                              key={h}
                              className={`h-12 border-b border-slate-50 dark:border-slate-700/30 transition-colors ${isDropHourTarget ? 'bg-slate-200/50 dark:bg-slate-600/20' : ''}`}
                              onDragOver={(e) => handleEventDragOverCell(e, di, h)}
                              onDrop={(e) => handleDropOnCell(e, di, h)}
                            />
                          );
                        })}
                        {(() => {
                          const parsed = dayEvents.map(e => {
                            const [sh, sm] = (e.startTime || '09:00').split(':').map(Number);
                            const [eh, em] = (e.endTime || '10:00').split(':').map(Number);
                            return { ...e, startMins: sh * 60 + (sm || 0), endMins: eh * 60 + (em || 0) };
                          }).sort((a, b) => a.startMins - b.startMins || b.endMins - a.endMins);

                          let currentGroup: typeof parsed = [];
                          let groupEndMins = 0;
                          const allGroups: (typeof parsed)[] = [];
                          
                          parsed.forEach(ev => {
                            if (ev.startMins >= groupEndMins) {
                              if (currentGroup.length > 0) allGroups.push(currentGroup);
                              currentGroup = [ev];
                              groupEndMins = ev.endMins;
                            } else {
                              currentGroup.push(ev);
                              groupEndMins = Math.max(groupEndMins, ev.endMins);
                            }
                          });
                          if (currentGroup.length > 0) allGroups.push(currentGroup);

                          const positions: Record<string, { top: number, left: string, width: string }> = {};
                          
                          allGroups.forEach(group => {
                            const cols: typeof parsed[] = [];
                            group.forEach(ev => {
                              let placed = false;
                              for (let i = 0; i < cols.length; i++) {
                                if (cols[i][cols[i].length - 1].endMins <= ev.startMins) {
                                  cols[i].push(ev);
                                  placed = true;
                                  break;
                                }
                              }
                              if (!placed) cols.push([ev]);
                            });
                            
                            const numCols = cols.length;
                            cols.forEach((col, colIdx) => {
                              col.forEach(ev => {
                                const top = Math.max(0, (ev.startMins / 60) - 7) * 48;
                                positions[ev.id] = {
                                  top,
                                  width: `calc(${100 / numCols}% - 4px)`,
                                  left: `calc(${(100 / numCols) * colIdx}% + 2px)`,
                                };
                              });
                            });
                          });

                          return parsed.map((ev) => {
                            const pos = positions[ev.id];
                            return renderEventBlock(ev, pos.top, pos);
                          });
                        })()}
                      </div>
                    );
                  })}
                </div>

                {/* ── Paste / Add strip ── */}
                {canEdit && !isDragging && (
                  <div className="border-t border-slate-200 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="grid grid-cols-8">
                      <div className="border-r border-slate-100 dark:border-slate-700/50" />
                      {weekDays.map((d, di) => {
                        const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        return (
                          <button
                            key={di}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (clipboard) {
                                setPasteForm({
                                  dayOfWeek: 0,
                                  startTime: clipboard.event.startTime || '09:00',
                                  endTime: clipboard.event.endTime || '10:00',
                                  date: dayStr,
                                  branchId: activeBranchId || undefined
                                });
                                setShowPasteModal(true);
                              } else {
                                openCreate({ date: dayStr, startTime: nextFreeStart(appDayOfWeek(dayStr), dayStr) });
                              }
                            }}
                            className={`border-r border-slate-100 dark:border-slate-700/50 last:border-r-0 py-2 flex items-center justify-center gap-1 text-[10px] font-bold transition-colors ${
                              clipboard
                                ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                            }`}
                          >
                            {clipboard ? <Clipboard className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                            {clipboard ? t('schedule.paste', 'Вставить') : t('schedule.add', 'Добавить')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile List View */}
              <div className="sm:hidden space-y-3 mt-4">
                {(() => {
                  const dDay = weekDays[selectedDay];
                  const dayStr = dDay ? `${dDay.getFullYear()}-${String(dDay.getMonth() + 1).padStart(2, '0')}-${String(dDay.getDate()).padStart(2, '0')}` : '';
                  const dayEvents = visibleCalendar.filter((e) => e.date === dayStr && !(e as any).recurring);
                  
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
                            className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-900 hover:text-white dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-white dark:hover:text-slate-900 rounded-xl transition-all shadow-sm"
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
            onClick={() => openEdit(contextMenu.event, contextMenu.isTimetable)}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl transition-colors"
          >
            <Pencil className="w-4 h-4 text-slate-500" />
            {t('common.edit', 'Изменить')}
          </button>
          <button
            onClick={() => handleCopy(contextMenu.event)}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-xl transition-colors"
          >
            <Copy className="w-4 h-4 text-slate-500" />
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
                    branchId: activeBranchId || undefined
                  });
                } else {
                  setPasteForm({
                    dayOfWeek: 0,
                    startTime: clipboard.event.startTime || '09:00',
                    endTime: clipboard.event.endTime || '10:00',
                    date: contextMenu.event.date || '',
                    branchId: activeBranchId || undefined
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
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('common.branch', 'Филиал')}</label>
                <BranchFilter 
                  value={pasteForm.branchId || null} 
                  onChange={(val) => setPasteForm(f => ({ ...f, branchId: val || undefined }))} 
                  mode="select"
                />
              </div>

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
                onClick={() => handlePaste()}
                disabled={saving || (activeTab === 'events' && !pasteForm.date)}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
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
              {form.editingId
                ? (form.editingRecurring
                  ? t('schedule.editTimetableLesson', 'Изменить урок в расписании')
                  : t('schedule.editEvent', 'Изменить событие'))
                : (activeTab === 'timetable'
                  ? t('schedule.newTimetableLesson', 'Новый урок в расписании')
                  : t('schedule.newEvent', 'Новое событие'))}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('common.branch', 'Филиал')}</label>
                <BranchFilter
                  value={form.branchId || null}
                  // The group list below is filtered by branch, so a group from the old
                  // branch must go too — otherwise the select renders blank while still
                  // submitting the hidden groupId.
                  onChange={(val) => setForm(f => (
                    f.groupId && groups.find(g => g.id === f.groupId)?.branchId !== (val || undefined)
                      ? { ...f, branchId: val || undefined, groupId: undefined, title: '' }
                      : { ...f, branchId: val || undefined }
                  ))}
                  mode="select"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                  {t('common.group', 'Группа')} / {t('org.schedule.eventTitle', 'Название')}
                </label>
                
                {groups.length > 0 && (
                  <select 
                    value={form.groupId || ''}
                    onChange={(e) => {
                      const g = groups.find(x => x.id === e.target.value);
                      if (g) {
                         setForm(f => ({ ...f, groupId: g.id, title: g.name }));
                      } else {
                         setForm(f => ({ ...f, groupId: undefined, title: '' }));
                      }
                    }}
                    className="input bg-slate-50 dark:bg-slate-900/50 mb-3"
                  >
                    <option value="">{t('schedule.selectGroup', 'Выберите группу...')}</option>
                    {groups
                      .filter(g => !form.branchId || g.branchId === form.branchId)
                      .map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                )}

                <input 
                  placeholder={form.groupId ? "Название подставилось автоматически" : "Например: Математика, 11-А"} 
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="input bg-slate-50 dark:bg-slate-900/50" 
                  autoFocus={!form.groupId} 
                />
              </div>

              {/* Timetable: Day of Week selector */}
              {modalIsRecurring ? (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('schedule.dayOfWeek', 'День недели')}</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {dayNames.map((name, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, dayOfWeek: i }))}
                        className={`py-2.5 rounded-xl text-xs font-bold transition-all ${form.dayOfWeek === i
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm scale-105'
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
                  {/* Moving the start drags the end with it, keeping the span the user chose. */}
                  <input type="time" value={form.startTime} onChange={(e) => setForm((f) => {
                    const prevStart = timeToMins(f.startTime);
                    const nextStart = timeToMins(e.target.value);
                    const prevEnd = timeToMins(f.endTime);
                    const span = prevStart !== null && prevEnd !== null && prevEnd > prevStart
                      ? prevEnd - prevStart
                      : DEFAULT_SLOT_MINUTES;
                    return nextStart === null
                      ? { ...f, startTime: e.target.value }
                      : { ...f, startTime: e.target.value, endTime: minsToTime(nextStart + span) };
                  })} className="input bg-slate-50 dark:bg-slate-900/50" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('org.schedule.endTime', 'Конец')}</label>
                  <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="input bg-slate-50 dark:bg-slate-900/50" />
                </div>
              </div>

              {/* Classroom */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('schedule.classroom', 'Аудитория / Кабинет')}</label>
                <ClassroomSelect
                  branchId={form.branchId || null}
                  value={{ classroomId: form.classroomId || null, location: form.location }}
                  onChange={(v) => setForm((f) => ({ ...f, classroomId: v.classroomId, location: v.location }))}
                />
              </div>

              {/* Event type — only for dated events */}
              {!modalIsRecurring && (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{t('org.schedule.eventType', 'Тип')}</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as any }))} className="input bg-slate-50 dark:bg-slate-900/50">
                    <option value="exam">{t('org.schedule.typeExam', 'Экзамен')}</option>
                    <option value="other">{t('org.schedule.typeOther', 'Другое')}</option>
                  </select>
                </div>
              )}
            </div>

            {/* The page-level banner sits behind the overlay, so the modal states its own error. */}
            {error && (
              <div className="mt-5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm font-medium text-red-600 dark:text-red-400 space-y-2.5">
                <p>{error}</p>
                {conflictRetry === 'create' && (
                  <button
                    onClick={() => handleCreate(true)}
                    disabled={saving}
                    className="px-3.5 py-1.5 rounded-xl text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {t('schedule.forceCreate', 'Поставить всё равно')}
                  </button>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-8">
              <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm">{t('common.cancel', 'Отмена')}</button>
              <button
                onClick={() => handleCreate()}
                disabled={saving || !form.title.trim() || (!modalIsRecurring && !form.date)}
                className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
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
