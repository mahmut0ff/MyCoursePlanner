import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, MapPin, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  orgGetTimetable, orgGetSchedule, orgCreateEvent, orgUpdateEvent, orgDeleteEvent,
  orgListClassrooms,
} from '../../lib/api';
import { usePermissions } from '../../contexts/PermissionsContext';
import { timeToMins, minsToTime } from '../../lib/scheduleTime';
import { sameRoom, normalizeRoom } from '../../lib/classrooms';
import ClassroomSelect from '../ui/ClassroomSelect';
import ConfirmDialog from '../ui/ConfirmDialog';
import type { Classroom, Group, ScheduleEvent } from '../../types';

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const DEFAULT_SLOT_MINUTES = 60;

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
  dayOfWeek: number;
  date: string;
  startTime: string;
  endTime: string;
  classroomId: string | null;
  location: string;
}

const emptyForm = (recurring: boolean): FormState => ({
  editingId: null,
  recurring,
  dayOfWeek: 0,
  date: localDate(new Date()),
  startTime: '09:00',
  endTime: '10:00',
  classroomId: null,
  location: '',
});

interface GroupScheduleSectionProps {
  group: Group;
  /** Право менять расписание. Сервер гейтит на schedule:write — здесь то же самое. */
  canEdit: boolean;
}

/**
 * Расписание конкретной группы прямо в её карточке: недельные уроки и ближайшие
 * разовые события, с добавлением, правкой и удалением на месте.
 *
 * Проверку накладок намеренно НЕ дублируем: сервер видит всю организацию, а не
 * загруженный кусок, и его 409 приходит с готовым текстом. Клиентская копия
 * такой проверки неизбежно разъезжалась бы с серверной.
 */
const GroupScheduleSection: React.FC<GroupScheduleSectionProps> = ({ group, canEdit }) => {
  const { t, i18n } = useTranslation();
  const { canDelete } = usePermissions();
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

  const canRemove = canDelete('schedule');
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
  const week = useMemo(() => DAY_SHORT.map((_, day) =>
    timetable
      .filter(e => (e.dayOfWeek ?? 0) === day && matchesRoom(e))
      .sort((a, b) => (timeToMins(a.startTime) ?? 0) - (timeToMins(b.startTime) ?? 0))),
    [timetable, matchesRoom]);

  const visibleUpcoming = useMemo(
    () => upcoming.filter(matchesRoom), [upcoming, matchesRoom]);

  const hasAnything = week.some(d => d.length) || visibleUpcoming.length > 0;

  const openCreate = (recurring: boolean, dayOfWeek?: number) => {
    setError(''); setCanForce(false);
    setForm({ ...emptyForm(recurring), dayOfWeek: dayOfWeek ?? 0 });
    setModalOpen(true);
  };

  const openEdit = (ev: ScheduleEvent) => {
    const start = timeToMins(ev.startTime) ?? 9 * 60;
    setError(''); setCanForce(false);
    setForm({
      editingId: ev.id,
      recurring: !!ev.recurring,
      dayOfWeek: ev.dayOfWeek ?? 0,
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

      if (form.recurring) {
        Object.assign(payload, { type: 'lesson', recurring: true, dayOfWeek: form.dayOfWeek });
      } else {
        Object.assign(payload, { type: 'lesson', recurring: false, date: form.date });
      }

      if (form.editingId) {
        await orgUpdateEvent({ id: form.editingId, ...payload });
        toast.success(t('schedule.updated', 'Занятие обновлено'));
      } else {
        await orgCreateEvent(payload);
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
        <span className="block text-sm font-bold text-slate-900 dark:text-white tabular-nums leading-tight">
          {ev.startTime}{ev.endTime ? `–${ev.endTime}` : ''}
        </span>
        {dateLabel && (
          <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
            {dateLabel}
          </span>
        )}
        <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 min-w-0">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{room || t('classrooms.none', 'Без кабинета')}</span>
        </span>
      </>
    );

    return (
      <div
        key={ev.id}
        className="group/lesson relative rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
      >
        {canEdit ? (
          <button
            onClick={() => openEdit(ev)}
            aria-label={`${t('common.edit', 'Изменить')}: ${ev.startTime}${room ? `, ${room}` : ''}`}
            className="w-full text-left px-3 py-2.5 pr-8 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 dark:focus-visible:ring-white"
          >
            {body}
          </button>
        ) : (
          <div className="px-3 py-2.5">{body}</div>
        )}

        {canRemove && (
          <button
            onClick={() => setPendingDelete(ev)}
            aria-label={`${t('common.delete', 'Удалить')} ${ev.startTime}`}
            title={t('common.delete', 'Удалить')}
            // slate-500, а не slate-400: иконка на плитке slate-50 иначе даёт ~2.5:1
            // и не дотягивает до порога 3:1 для нетекстовых элементов.
            className="absolute top-1 right-1 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-70 sm:opacity-0 group-hover/lesson:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 transition-opacity"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm mb-8">
      <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-x-3 gap-y-2">
        <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
        <h2 className="font-extrabold uppercase tracking-wider text-sm text-slate-900 dark:text-white">
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
                className={`text-xs font-semibold rounded-xl border px-2.5 py-1.5 bg-white dark:bg-slate-800 transition-colors ${
                  roomFilter
                    ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />{t('schedule.addWeekly', 'Урок в неделю')}
              </button>
              <button
                onClick={() => openCreate(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-600/50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />{t('schedule.addOneOff', 'Разовое')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {DAY_SHORT.map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-slate-100 dark:bg-slate-700/40 animate-pulse" />
            ))}
          </div>
        ) : !hasAnything ? (
          <p className="py-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
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
                    <p className={`px-1 pb-1.5 text-[11px] font-bold uppercase tracking-widest ${
                      isToday
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      <span className="lg:hidden">{DAY_NAMES[day]}</span>
                      <span className="hidden lg:inline">{DAY_SHORT[day]}</span>
                      {isToday && (
                        <span className="ml-1 font-semibold normal-case tracking-normal text-slate-400 dark:text-slate-500">
                          · {t('schedule.today', 'сегодня')}
                        </span>
                      )}
                    </p>

                    <div className="space-y-1.5">
                      {list.map(ev => renderLesson(ev))}

                      {list.length === 0 && (
                        canEdit && !roomFilter ? (
                          // Пустой день — это ещё и самое естественное место, чтобы
                          // поставить в него урок.
                          <button
                            onClick={() => openCreate(true, day)}
                            aria-label={`${t('schedule.addOnDay', 'Поставить урок в этот день')}: ${DAY_NAMES[day]}`}
                            title={t('schedule.addOnDay', 'Поставить урок в этот день')}
                            className="w-full h-[62px] rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 hover:border-slate-400 hover:text-slate-500 dark:hover:border-slate-500 dark:hover:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 dark:focus-visible:ring-white transition-colors flex items-center justify-center"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        ) : (
                          <div className="h-[62px] rounded-xl border border-dashed border-slate-200 dark:border-slate-700" />
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {visibleUpcoming.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                <p className="pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {t('schedule.upcoming', 'Ближайшие разовые')}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {visibleUpcoming.map(ev => renderLesson(ev, ev.date ? shortDate(ev.date, i18n.language) : undefined))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 dark:bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-200/50 dark:border-slate-700/50"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {form.editingId
                  ? t('schedule.editLesson', 'Изменить занятие')
                  : form.recurring
                    ? t('schedule.newWeekly', 'Еженедельный урок')
                    : t('schedule.newOneOff', 'Разовое занятие')}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {form.recurring ? (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                    {t('schedule.dayOfWeek', 'День недели')}
                  </label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((name, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, dayOfWeek: i }))}
                        className={`py-2 rounded-xl text-xs font-bold transition-all ${form.dayOfWeek === i
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600/50'}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                    {t('common.date', 'Дата')}
                  </label>
                  <input
                    type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="input bg-slate-50 dark:bg-slate-900/50"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
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
                    className="input bg-slate-50 dark:bg-slate-900/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                    {t('org.schedule.endTime', 'Конец')}
                  </label>
                  <input
                    type="time" value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                    className="input bg-slate-50 dark:bg-slate-900/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
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
              <div className="mt-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm font-medium text-red-600 dark:text-red-400 space-y-2.5">
                <p>{error}</p>
                {canForce && (
                  <button
                    onClick={() => save(true)}
                    disabled={saving}
                    className="px-3.5 py-1.5 rounded-xl text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {t('schedule.forceCreate', 'Поставить всё равно')}
                  </button>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm"
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={() => save()}
                disabled={saving || (!form.recurring && !form.date)}
                className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
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
