import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, MapPin, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  orgGetTimetable, orgGetSchedule, orgCreateEvent, orgUpdateEvent, orgDeleteEvent,
  orgListClassrooms,
} from '../../lib/api';
import { timeToMins, minsToTime } from '../../lib/scheduleTime';
import { sameRoom, normalizeRoom } from '../../lib/classrooms';
import ClassroomSelect from '../ui/ClassroomSelect';
import ConfirmDialog from '../ui/ConfirmDialog';
import { intlLocale } from '../../lib/locale';
import type { Classroom, Group, ScheduleEvent } from '../../types';

const DAY_SHORT_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAME_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
// Русские фолбэки на случай отсутствующего ключа.
const DAY_SHORT_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_NAMES_RU = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
/** Длина урока по умолчанию: час двадцать. */
const DEFAULT_SLOT_MINUTES = 80;

/** Сегодняшний день в конвенции приложения (0=Пн … 6=Вс). */
const todayDow = () => (new Date().getDay() + 6) % 7;

/**
 * «2026-08-20» → «20 авг». Разбираем по частям, а не через Date(строка): та
 * читается как UTC-полночь и в минусовых зонах показывает предыдущий день.
 */
const shortDate = (iso: string, locale: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
};

/** Подпись кабинета: справочник имеет приоритет над устаревшим свободным текстом. */
const roomLabel = (ev: { classroomName?: string; location?: string }) =>
  ev.classroomName || ev.location || '';

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface FormState {
  editingId: string | null;
  recurring: boolean;
  /**
   * Дни недели урока. При создании их может быть несколько — в расписание уйдёт
   * по записи на каждый; при правке всегда один: запись живёт в одном дне.
   */
  days: number[];
  date: string;
  startTime: string;
  endTime: string;
  classroomId: string | null;
  location: string;
}

const emptyForm = (recurring: boolean): FormState => ({
  editingId: null,
  recurring,
  days: [0],
  date: localDate(new Date()),
  startTime: '09:00',
  endTime: minsToTime(9 * 60 + DEFAULT_SLOT_MINUTES),
  classroomId: null,
  location: '',
});

interface GroupScheduleSectionProps {
  group: Group;
  /**
   * Право менять расписание этой группы. Считает его страница группы: либо
   * `schedule:write` на всю организацию, либо `group_schedule:write` у того, кто
   * эту группу ведёт. Ровно та же пара проверяется на сервере (canWriteEvent).
   */
  canEdit: boolean;
  /** Право удалять занятия этой группы — та же пара прав, но по `delete`. */
  canRemove: boolean;
}

/**
 * Расписание конкретной группы прямо в её карточке: недельные уроки и ближайшие
 * разовые события, с добавлением, правкой и удалением на месте.
 *
 * Проверку накладок намеренно НЕ дублируем: сервер видит всю организацию, а не
 * загруженный кусок, и его 409 приходит с готовым текстом. Клиентская копия
 * такой проверки неизбежно разъезжалась бы с серверной.
 */
const GroupScheduleSection: React.FC<GroupScheduleSectionProps> = ({ group, canEdit, canRemove }) => {
  const { t, i18n } = useTranslation();
  const DAY_SHORT = DAY_SHORT_KEYS.map((k, i) => t(`schedule.${k}`, DAY_SHORT_RU[i]));
  const DAY_NAMES = DAY_NAME_KEYS.map((k, i) => t(`schedule.${k}`, DAY_NAMES_RU[i]));
  const [timetable, setTimetable] = useState<ScheduleEvent[]>([]);
  const [upcoming, setUpcoming] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(true));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [canForce, setCanForce] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ScheduleEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  /** '' — все, '__none__' — занятия без кабинета, иначе id кабинета. */
  const [roomFilter, setRoomFilter] = useState('');

  const today = todayDow();

  const load = useCallback(() => {
    setLoading(true);
    const from = localDate(new Date());
    const to = localDate(new Date(Date.now() + 60 * 24 * 3600 * 1000));
    Promise.all([
      orgGetTimetable(group.id).then((r: any) => (Array.isArray(r) ? r : [])).catch(() => [] as ScheduleEvent[]),
      orgGetSchedule(from, to, group.id).then((r: any) => (Array.isArray(r) ? r : [])).catch(() => [] as ScheduleEvent[]),
      orgListClassrooms(group.branchId).then((r: any) => (Array.isArray(r) ? r : [])).catch(() => [] as Classroom[]),
    ]).then(([tt, ev, cls]) => {
      setTimetable(tt);
      setUpcoming(ev);
      setClassrooms(cls);
    }).finally(() => setLoading(false));
  }, [group.id, group.branchId]);

  useEffect(load, [load]);

  const matchesRoom = useCallback((ev: ScheduleEvent) => {
    if (!roomFilter) return true;
    if (roomFilter === '__none__') return !roomLabel(ev);
    const c = classrooms.find(x => x.id === roomFilter);
    return c ? sameRoom({ classroomId: c.id, classroomName: c.name }, ev) : true;
  }, [roomFilter, classrooms]);

  /**
   * Кабинеты, которые группа действительно занимает. Фильтр показываем только
   * когда их больше одного — иначе это переключатель с единственным исходом.
   */
  const usedRooms = useMemo(() => {
    const keys = new Set<string>();
    for (const e of [...timetable, ...upcoming]) {
      keys.add(normalizeRoom(roomLabel(e)));
    }
    return keys;
  }, [timetable, upcoming]);

  const filterOptions = useMemo(
    () => classrooms.filter(c => usedRooms.has(normalizeRoom(c.name))),
    [classrooms, usedRooms],
  );
  const showFilter = usedRooms.size > 1;

  /** Недельная сетка: семь колонок всегда, чтобы читалась вся неделя разом. */
  const week = useMemo(() => DAY_SHORT_KEYS.map((_, day) =>
    timetable
      .filter(e => (e.dayOfWeek ?? 0) === day && matchesRoom(e))
      .sort((a, b) => (timeToMins(a.startTime) ?? 0) - (timeToMins(b.startTime) ?? 0))),
    [timetable, matchesRoom]);

  const visibleUpcoming = useMemo(
    () => upcoming.filter(matchesRoom), [upcoming, matchesRoom]);

  const hasAnything = week.some(d => d.length) || visibleUpcoming.length > 0;

  const openCreate = (recurring: boolean, dayOfWeek?: number) => {
    setError(''); setCanForce(false);
    setForm({ ...emptyForm(recurring), days: [dayOfWeek ?? 0] });
    setModalOpen(true);
  };

  /**
   * Переключатель дня: при создании — набор (урок сразу в несколько дней), при
   * правке — ровно один, потому что правится одна запись расписания. Последний
   * день не снимаем: без дня урок ставить некуда.
   */
  const toggleDay = (day: number) => setForm(f => {
    if (f.editingId) return { ...f, days: [day] };
    const on = f.days.includes(day);
    if (on && f.days.length === 1) return f;
    return { ...f, days: on ? f.days.filter(d => d !== day) : [...f.days, day].sort((a, b) => a - b) };
  });

  const openEdit = (ev: ScheduleEvent) => {
    const start = timeToMins(ev.startTime) ?? 9 * 60;
    setError(''); setCanForce(false);
    setForm({
      editingId: ev.id,
      recurring: !!ev.recurring,
      days: [ev.dayOfWeek ?? 0],
      date: ev.date || localDate(new Date()),
      startTime: ev.startTime || '09:00',
      endTime: ev.endTime || minsToTime(start + (Number(ev.duration) || DEFAULT_SLOT_MINUTES)),
      classroomId: ev.classroomId || null,
      location: roomLabel(ev),
    });
    setModalOpen(true);
  };

  const save = async (force = false) => {
    setSaving(true); setError(''); setCanForce(false);
    try {
      const start = timeToMins(form.startTime) ?? 0;
      const duration = Math.max(5, (timeToMins(form.endTime) ?? start + DEFAULT_SLOT_MINUTES) - start);

      const payload: Record<string, any> = {
        title: group.name,
        groupId: group.id,
        groupName: group.name,
        courseId: group.courseId,
        courseName: group.courseName || '',
        // Филиал обязателен в теле: интерцептор штампует его только на GET, и без
        // этого занятие сохранилось бы без филиала и пропало из отфильтрованных видов.
        branchId: group.branchId || null,
        teacherId: group.teacherIds?.[0] || null,
        startTime: form.startTime,
        endTime: form.endTime,
        duration,
        classroomId: form.classroomId,
        location: form.location,
        force,
      };

      const days = [...new Set(form.days)].sort((a, b) => a - b);
      if (form.recurring && !days.length) return;

      if (form.editingId) {
        Object.assign(payload, form.recurring
          ? { type: 'lesson', recurring: true, dayOfWeek: days[0] }
          : { type: 'lesson', recurring: false, date: form.date });
        await orgUpdateEvent({ id: form.editingId, ...payload });
        toast.success(t('schedule.updated', 'Занятие обновлено'));
      } else if (form.recurring) {
        // Расписание хранит один день на запись: выбранные дни — это столько же
        // уроков. По очереди, чтобы серверная проверка накладок видела предыдущие.
        const done: number[] = [];
        try {
          for (const day of days) {
            await orgCreateEvent({ ...payload, type: 'lesson', recurring: true, dayOfWeek: day });
            done.push(day);
          }
        } finally {
          // Если середина сорвалась, повтор не должен продублировать созданное.
          if (done.length) setForm(f => ({ ...f, days: f.days.filter(d => !done.includes(d)) }));
        }
        toast.success(days.length > 1
          ? t('schedule.createdCount', 'Добавлено уроков: {{count}}', { count: days.length })
          : t('schedule.created', 'Занятие добавлено'));
      } else {
        await orgCreateEvent({ ...payload, type: 'lesson', recurring: false, date: form.date });
        toast.success(t('schedule.created', 'Занятие добавлено'));
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      setError(e.message || t('common.error', 'Ошибка'));
      // 409 = накладка. Сервер умеет её перебить по force — предлагаем это явно.
      if (!force && e?.status === 409) setCanForce(true);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await orgDeleteEvent(pendingDelete.id);
      toast.success(t('schedule.deleted', 'Занятие удалено'));
      setPendingDelete(null);
      load();
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Занятие в недельной полосе. Время — главное, кабинет подписью под ним.
   * Тело плитки открывает правку, удаление живёт отдельной кнопкой: вложенные
   * друг в друга кнопки невалидны, а держать удаление только на hover нельзя —
   * на тач-экранах его тогда не достать.
   */
  const renderLesson = (ev: ScheduleEvent, dateLabel?: string) => {
    const room = roomLabel(ev);
    const body = (
      <>
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums leading-tight">
          {ev.startTime}{ev.endTime ? `–${ev.endTime}` : ''}
        </span>
        {dateLabel && (
          <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {dateLabel}
          </span>
        )}
        <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 min-w-0">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{room || t('classrooms.none', 'Без кабинета')}</span>
        </span>
      </>
    );

    return (
      <div
        key={ev.id}
        className="group/lesson relative rounded-md bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        {canEdit ? (
          <button
            onClick={() => openEdit(ev)}
            aria-label={`${t('common.edit', 'Изменить')}: ${ev.startTime}${room ? `, ${room}` : ''}`}
            className="w-full text-left px-2.5 py-2 pr-8 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            {body}
          </button>
        ) : (
          <div className="px-2.5 py-2">{body}</div>
        )}

        {canRemove && (
          <button
            onClick={() => setPendingDelete(ev)}
            aria-label={`${t('common.delete', 'Удалить')} ${ev.startTime}`}
            title={t('common.delete', 'Удалить')}
            // slate-500, а не slate-400: иконка на плитке slate-50 иначе даёт ~2.5:1
            // и не дотягивает до порога 3:1 для нетекстовых элементов.
            className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-70 sm:opacity-0 group-hover/lesson:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 transition-opacity"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden mb-4">
      <div className="px-3 py-2 min-h-[48px] border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-x-2 gap-y-2">
        <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <h2 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
          {t('schedule.groupSchedule', 'Расписание группы')}
        </h2>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {showFilter && (
            <label className="flex items-center gap-1.5">
              <span className="sr-only">{t('schedule.filterByClassroom', 'Фильтр по кабинету')}</span>
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={roomFilter}
                onChange={e => setRoomFilter(e.target.value)}
                className={`input w-auto h-8 py-0 transition-colors ${
                  roomFilter
                    ? '!border-primary-500 text-slate-900 dark:text-slate-100'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <option value="">{t('classrooms.all', 'Все кабинеты')}</option>
                {filterOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__none__">{t('classrooms.withoutRoom', 'Без кабинета')}</option>
              </select>
            </label>
          )}

          {canEdit && (
            <>
              <button
                onClick={() => openCreate(true)}
                className="btn-primary inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />{t('schedule.addWeekly', 'Урок в неделю')}
              </button>
              <button
                onClick={() => openCreate(false)}
                className="btn-secondary inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />{t('schedule.addOneOff', 'Разовое')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {DAY_SHORT.map((_, i) => (
              <div key={i} className="h-24 rounded-md bg-slate-100 dark:bg-slate-700/40 animate-pulse" />
            ))}
          </div>
        ) : !hasAnything ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {roomFilter
              ? t('schedule.groupEmptyFiltered', 'В этом кабинете у группы занятий нет')
              : t('schedule.groupEmpty', 'У группы пока нет занятий в расписании')}
          </p>
        ) : (
          <>
            {/* Вся неделя в ряд: семь колонок читаются как одна картина, а пустой
                день сразу видно — по стопке из одних занятых дней этого не понять. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {week.map((list, day) => {
                const isToday = day === today;
                return (
                  <div key={day} className="min-w-0">
                    <p className={`px-1 pb-1 text-xs font-medium ${
                      isToday
                        ? 'text-slate-900 dark:text-slate-100'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      <span className="lg:hidden">{DAY_NAMES[day]}</span>
                      <span className="hidden lg:inline">{DAY_SHORT[day]}</span>
                      {isToday && (
                        <span className="ml-1 font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">
                          · {t('schedule.today', 'сегодня')}
                        </span>
                      )}
                    </p>

                    <div className="space-y-1">
                      {list.map(ev => renderLesson(ev))}

                      {list.length === 0 && (
                        canEdit && !roomFilter ? (
                          // Пустой день — это ещё и самое естественное место, чтобы
                          // поставить в него урок.
                          <button
                            onClick={() => openCreate(true, day)}
                            aria-label={`${t('schedule.addOnDay', 'Поставить урок в этот день')}: ${DAY_NAMES[day]}`}
                            title={t('schedule.addOnDay', 'Поставить урок в этот день')}
                            className="w-full h-[62px] rounded-md border border-dashed border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 hover:border-slate-400 hover:text-slate-500 dark:hover:border-slate-500 dark:hover:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <div className="h-[62px] rounded-md border border-dashed border-slate-200 dark:border-slate-700" />
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {visibleUpcoming.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <p className="pb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('schedule.upcoming', 'Ближайшие разовые')}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {visibleUpcoming.map(ev => renderLesson(ev, ev.date ? shortDate(ev.date, intlLocale(i18n.language)) : undefined))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-lesson-dialog-title"
            className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-sm shadow-pop border border-slate-200 dark:border-slate-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
              <h3 id="group-lesson-dialog-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {form.editingId
                  ? t('schedule.editLesson', 'Изменить занятие')
                  : form.recurring
                    ? t('schedule.newWeekly', 'Еженедельный урок')
                    : t('schedule.newOneOff', 'Разовое занятие')}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                aria-label={t('common.close', 'Закрыть')}
                className="w-7 h-7 flex items-center justify-center shrink-0 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3 px-4 py-2">
              {form.recurring ? (
                <div>
                  <label className="label">
                    {t('schedule.dayOfWeek', 'День недели')}
                    {!form.editingId && (
                      <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">
                        {t('schedule.severalDaysHint', '— можно выбрать несколько')}
                      </span>
                    )}
                  </label>
                  <div className="grid grid-cols-7 gap-1">
                    {DAY_SHORT.map((name, i) => {
                      const on = form.days.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          aria-pressed={on}
                          aria-label={DAY_NAMES[i]}
                          onClick={() => toggleDay(i)}
                          className={`h-7 rounded-md text-sm transition-colors ${on
                            ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                  {form.days.length > 1 && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t('schedule.willRepeatEveryWeek', 'Уроки будут повторяться каждую неделю:')}{' '}
                      {form.days.map(d => DAY_NAMES[d].toLowerCase()).join(', ')}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="label">
                    {t('common.date', 'Дата')}
                  </label>
                  <input
                    type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="input"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">
                    {t('org.schedule.startTime', 'Начало')}
                  </label>
                  {/* Сдвиг начала тянет конец за собой, сохраняя длительность. */}
                  <input
                    type="time" value={form.startTime}
                    onChange={e => setForm(f => {
                      const prevStart = timeToMins(f.startTime);
                      const prevEnd = timeToMins(f.endTime);
                      const next = timeToMins(e.target.value);
                      const span = prevStart !== null && prevEnd !== null && prevEnd > prevStart
                        ? prevEnd - prevStart : DEFAULT_SLOT_MINUTES;
                      return next === null
                        ? { ...f, startTime: e.target.value }
                        : { ...f, startTime: e.target.value, endTime: minsToTime(next + span) };
                    })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">
                    {t('org.schedule.endTime', 'Конец')}
                  </label>
                  <input
                    type="time" value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="label">
                  {t('schedule.classroom', 'Аудитория / Кабинет')}
                </label>
                <ClassroomSelect
                  branchId={group.branchId || null}
                  value={{ classroomId: form.classroomId, location: form.location }}
                  onChange={v => setForm(f => ({ ...f, classroomId: v.classroomId, location: v.location }))}
                />
              </div>
            </div>

            {error && (
              <div className="mx-4 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400 space-y-2">
                <p>{error}</p>
                {canForce && (
                  <button
                    onClick={() => save(true)}
                    disabled={saving}
                    className="btn-danger"
                  >
                    {t('schedule.forceCreate', 'Поставить всё равно')}
                  </button>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 px-4 pt-2 pb-4">
              <button
                onClick={() => setModalOpen(false)}
                className="btn-ghost"
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={() => save()}
                disabled={saving || (form.recurring ? !form.days.length : !form.date)}
                className="btn-primary"
              >
                {saving ? '…' : t('common.save', 'Сохранить')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={t('schedule.deleteTitle', 'Удалить занятие?')}
        message={pendingDelete
          ? t('schedule.deleteMessage', 'Занятие будет убрано из расписания, а группа получит уведомление об отмене.')
          : ''}
        confirmLabel={t('common.delete', 'Удалить')}
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
};

export default GroupScheduleSection;
