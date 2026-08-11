import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock, MapPin, Pencil, Plus, Repeat, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  orgGetTimetable, orgGetSchedule, orgCreateEvent, orgUpdateEvent, orgDeleteEvent,
} from '../../lib/api';
import { usePermissions } from '../../contexts/PermissionsContext';
import { timeToMins, minsToTime } from '../../lib/scheduleTime';
import ClassroomSelect from '../ui/ClassroomSelect';
import ConfirmDialog from '../ui/ConfirmDialog';
import type { Group, ScheduleEvent } from '../../types';

const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const DEFAULT_SLOT_MINUTES = 60;

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
  const { t } = useTranslation();
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

  const canRemove = canDelete('schedule');

  const load = useCallback(() => {
    setLoading(true);
    const from = localDate(new Date());
    const to = localDate(new Date(Date.now() + 60 * 24 * 3600 * 1000));
    Promise.all([
      orgGetTimetable(group.id).then((r: any) => (Array.isArray(r) ? r : [])).catch(() => [] as ScheduleEvent[]),
      orgGetSchedule(from, to, group.id).then((r: any) => (Array.isArray(r) ? r : [])).catch(() => [] as ScheduleEvent[]),
    ]).then(([tt, ev]) => {
      setTimetable(tt);
      setUpcoming(ev);
    }).finally(() => setLoading(false));
  }, [group.id]);

  useEffect(load, [load]);

  const byDay = useMemo(() => {
    const map = new Map<number, ScheduleEvent[]>();
    for (const e of timetable) {
      const d = e.dayOfWeek ?? 0;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (timeToMins(a.startTime) ?? 0) - (timeToMins(b.startTime) ?? 0));
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [timetable]);

  const openCreate = (recurring: boolean) => {
    setError(''); setCanForce(false);
    setForm(emptyForm(recurring));
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

  const renderRow = (ev: ScheduleEvent, showDate = false) => (
    <div
      key={ev.id}
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group"
    >
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        {ev.startTime}{ev.endTime ? `–${ev.endTime}` : ''}
      </span>
      {showDate && ev.date && (
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">{ev.date}</span>
      )}
      {roomLabel(ev) ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 min-w-0">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{roomLabel(ev)}</span>
        </span>
      ) : (
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500 italic">
          {t('classrooms.none', 'Без кабинета')}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {canEdit && (
          <button
            onClick={() => openEdit(ev)}
            title={t('common.edit', 'Изменить')}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {canRemove && (
          <button
            onClick={() => setPendingDelete(ev)}
            title={t('common.delete', 'Удалить')}
            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
        <h2 className="font-extrabold uppercase tracking-wider text-sm text-slate-900 dark:text-white">
          {t('schedule.groupSchedule', 'Расписание группы')}
        </h2>
        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
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
          </div>
        )}
      </div>

      <div className="p-3">
        {loading ? (
          <div className="px-2 py-6 space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-9 rounded-xl bg-slate-100 dark:bg-slate-700/40 animate-pulse" />
            ))}
          </div>
        ) : !byDay.length && !upcoming.length ? (
          <p className="px-2 py-8 text-center text-sm font-medium text-slate-400 dark:text-slate-500">
            {t('schedule.groupEmpty', 'У группы пока нет занятий в расписании')}
          </p>
        ) : (
          <div className="space-y-4">
            {byDay.map(([day, list]) => (
              <div key={day}>
                <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                  <Repeat className="w-3 h-3" />{DAY_NAMES[day] || ''}
                </p>
                {list.map(ev => renderRow(ev))}
              </div>
            ))}

            {upcoming.length > 0 && (
              <div>
                <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {t('schedule.upcoming', 'Ближайшие разовые')}
                </p>
                {upcoming.map(ev => renderRow(ev, true))}
              </div>
            )}
          </div>
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
