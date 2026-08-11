import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DoorOpen, Plus, Pencil, Archive, Users, Clock, Wifi, X, Building2, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  orgListClassrooms, orgCreateClassroom, orgUpdateClassroom, orgArchiveClassroom,
  orgGetTimetable, orgGetGroups, orgGetTeachers,
} from '../../lib/api';
import { useBranch } from '../../contexts/BranchContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { sameRoom } from '../../lib/classrooms';
import { minsToTime, freeGaps, timeToMins } from '../../lib/scheduleTime';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import type { Classroom, Group, ScheduleEvent, UserProfile } from '../../types';

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

/** Рабочее окно, в котором считаем «свободно». */
const DAY_START = 8 * 60;
const DAY_END = 20 * 60;
/** Окна короче получаса как свободное время не показываем — в них урок не поставить. */
const MIN_USEFUL_GAP = 30;

interface FormState {
  id: string | null;
  name: string;
  branchId: string | null;
  capacity: string;
  floor: string;
  isVirtual: boolean;
  notes: string;
}

const emptyForm = (branchId: string | null): FormState => ({
  id: null, name: '', branchId, capacity: '', floor: '', isVirtual: false, notes: '',
});

const ClassroomsPage: React.FC = () => {
  const { t } = useTranslation();
  const { activeBranchId, branches } = useBranch();
  const { canWrite, canDelete } = usePermissions();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [timetable, setTimetable] = useState<ScheduleEvent[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingArchive, setPendingArchive] = useState<Classroom | null>(null);
  const [archiving, setArchiving] = useState(false);

  const canEdit = canWrite('classrooms');
  const canArchive = canDelete('classrooms');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      orgListClassrooms().then((r: any) => (Array.isArray(r) ? r : [])).catch(() => [] as Classroom[]),
      orgGetTimetable().then((r: any) => (Array.isArray(r) ? r : [])).catch(() => [] as ScheduleEvent[]),
      orgGetGroups().then((r: any) => (Array.isArray(r) ? r : [])).catch(() => [] as Group[]),
      orgGetTeachers().then((r: any) => (Array.isArray(r) ? r : [])).catch(() => [] as UserProfile[]),
    ]).then(([c, tt, g, tch]) => {
      setClassrooms(c); setTimetable(tt); setGroups(g); setTeachers(tch);
    }).finally(() => setLoading(false));
    // activeBranchId: api-слой штампует его на GET, поэтому смена филиала обязана
    // перезапросить — «Все филиалы» показывают весь справочник, конкретный — свой.
  }, [activeBranchId]);

  useEffect(load, [load]);

  const groupById = useMemo(() => new Map(groups.map(g => [g.id, g])), [groups]);
  const teacherById = useMemo(() => new Map(teachers.map(x => [x.uid, x])), [teachers]);
  const branchById = useMemo(() => new Map(branches.map(b => [b.id, b])), [branches]);

  /** Занятия кабинета: по ссылке или по названию — старые события ещё без ссылки. */
  const eventsOf = useCallback(
    (c: Classroom) => timetable.filter(e => sameRoom({ classroomId: c.id, classroomName: c.name }, e)),
    [timetable],
  );

  /** Преподаватели кабинета выводятся через группы его занятий. */
  const teachersOf = useCallback((events: ScheduleEvent[]) => {
    const uids = new Set<string>();
    for (const e of events) {
      if (e.teacherId) uids.add(e.teacherId);
      const g = e.groupId ? groupById.get(e.groupId) : null;
      for (const uid of g?.teacherIds || []) uids.add(uid);
    }
    return [...uids]
      .map(uid => teacherById.get(uid)?.displayName || null)
      .filter((n): n is string => !!n)
      .sort((a, b) => a.localeCompare(b, 'ru'));
  }, [groupById, teacherById]);

  const selected = useMemo(
    () => classrooms.find(c => c.id === selectedId) || null, [classrooms, selectedId]);

  const openCreate = () => {
    setError(''); setForm(emptyForm(activeBranchId));
    setModalOpen(true);
  };

  const openEdit = (c: Classroom) => {
    setError('');
    setForm({
      id: c.id, name: c.name, branchId: c.branchId || null,
      capacity: c.capacity == null ? '' : String(c.capacity),
      floor: c.floor || '', isVirtual: !!c.isVirtual, notes: c.notes || '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true); setError('');
    try {
      const payload = {
        name: form.name.trim(),
        // branchId кладём в тело явно: интерцептор штампует филиал только на GET.
        branchId: form.branchId,
        capacity: form.capacity === '' ? null : Number(form.capacity),
        floor: form.floor.trim() || null,
        isVirtual: form.isVirtual,
        notes: form.notes.trim(),
      };
      if (form.id) {
        await orgUpdateClassroom({ id: form.id, ...payload });
        toast.success(t('classrooms.updated', 'Кабинет обновлён'));
      } else {
        await orgCreateClassroom(payload);
        toast.success(t('classrooms.created', 'Кабинет добавлен'));
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      setError(e.message || t('common.error', 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!pendingArchive) return;
    setArchiving(true);
    try {
      const res: any = await orgArchiveClassroom(pendingArchive.id);
      toast.success(res?.affectedEvents
        ? t('classrooms.archivedWithEvents', `Кабинет в архиве. Занятий с ним: ${res.affectedEvents}`)
        : t('classrooms.archived', 'Кабинет в архиве'));
      if (selectedId === pendingArchive.id) setSelectedId(null);
      setPendingArchive(null);
      load();
    } catch (e: any) {
      toast.error(e.message || t('common.error', 'Ошибка'));
    } finally {
      setArchiving(false);
    }
  };

  const renderOccupancy = (c: Classroom) => {
    const events = eventsOf(c);
    const byDay = DAY_NAMES.map((_, day) =>
      events
        .filter(e => (e.dayOfWeek ?? -1) === day)
        .sort((a, b) => (timeToMins(a.startTime) ?? 0) - (timeToMins(b.startTime) ?? 0)));

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {byDay.map((list, day) => {
          // Виртуальный кабинет вмещает сколько угодно занятий — «свободное время»
          // для него не имеет смысла и только вводило бы в заблуждение.
          const gaps = c.isVirtual ? [] : freeGaps(list, DAY_START, DAY_END, MIN_USEFUL_GAP);
          return (
            <div key={day} className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <p className="px-3 py-2 bg-slate-50 dark:bg-slate-900/40 text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {DAY_FULL[day]}
              </p>
              <div className="p-2 space-y-1.5">
                {list.length === 0 ? (
                  <p className="px-2 py-3 text-xs font-medium text-slate-400 dark:text-slate-500 text-center">
                    {t('classrooms.freeAllDay', 'Свободен весь день')}
                  </p>
                ) : (
                  list.map(e => (
                    <div key={e.id} className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700/40">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{e.title}</p>
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                        {e.startTime}{e.endTime ? `–${e.endTime}` : ''}
                      </p>
                    </div>
                  ))
                )}

                {gaps.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-700/50">
                    <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      {t('classrooms.free', 'Свободно')}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {gaps.map(([from, to], i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-semibold tabular-nums bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-400"
                        >
                          {minsToTime(from)}–{minsToTime(to)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('nav.classrooms', 'Кабинеты')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {activeBranchId
              ? t('classrooms.subtitleBranch', 'Аудитории выбранного филиала, их занятость и свободные окна')
              : t('classrooms.subtitleAll', 'Аудитории всех филиалов, их занятость и свободные окна')}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[13px] font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shrink-0 justify-center"
          >
            <Plus className="w-4 h-4 shrink-0" />{t('classrooms.add', 'Добавить кабинет')}
          </button>
        )}
      </header>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-32 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : !classrooms.length ? (
        <EmptyState
          icon={DoorOpen}
          title={t('classrooms.emptyTitle', 'Кабинетов пока нет')}
          description={activeBranchId
            ? t('classrooms.emptyBranch', 'В этом филиале не заведено ни одной аудитории. Добавьте первую — и её можно будет выбирать в расписании.')
            : t('classrooms.emptyOrg', 'Заведите аудитории — и их можно будет выбирать в расписании вместо ручного ввода.')}
          actionLabel={canEdit ? t('classrooms.add', 'Добавить кабинет') : undefined}
          onAction={canEdit ? openCreate : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classrooms.map(c => {
            const events = eventsOf(c);
            const staff = teachersOf(events);
            const branch = c.branchId ? branchById.get(c.branchId) : null;
            const isOpen = selectedId === c.id;
            return (
              <div
                key={c.id}
                className={`bg-white dark:bg-slate-800 border rounded-2xl overflow-hidden shadow-sm transition-colors ${
                  isOpen
                    ? 'border-slate-900 dark:border-white'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <button
                  onClick={() => setSelectedId(isOpen ? null : c.id)}
                  aria-expanded={isOpen}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {c.isVirtual
                      ? <Wifi className="w-4 h-4 text-slate-400 shrink-0" />
                      : <DoorOpen className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className="font-bold text-slate-900 dark:text-white truncate">{c.name}</span>
                    {c.capacity ? (
                      <span className="ml-auto shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                        {c.capacity} {t('classrooms.seatsShort', 'мест')}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {branch && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 shrink-0" />{branch.name}
                      </span>
                    )}
                    {c.floor && <span>{t('classrooms.floor', 'Этаж')} {c.floor}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" />
                      {events.length
                        ? t('classrooms.lessonsPerWeek', `${events.length} зан./нед.`)
                        : t('classrooms.noLessons', 'нет занятий')}
                    </span>
                  </div>

                  {staff.length > 0 && (
                    <p className="mt-1.5 flex items-start gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <Users className="w-3 h-3 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{staff.join(', ')}</span>
                    </p>
                  )}
                </button>

                {(canEdit || canArchive) && (
                  <div className="px-5 py-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center gap-1">
                    {canEdit && (
                      <button
                        onClick={() => openEdit(c)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />{t('common.edit', 'Изменить')}
                      </button>
                    )}
                    {canArchive && (
                      <button
                        onClick={() => setPendingArchive(c)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Archive className="w-3 h-3" />{t('classrooms.archive', 'В архив')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
            <DoorOpen className="w-4 h-4 text-slate-400 shrink-0" />
            <h2 className="font-extrabold uppercase tracking-wider text-sm text-slate-900 dark:text-white truncate">
              {selected.name} — {t('classrooms.weekLoad', 'занятость по неделе')}
            </h2>
            <button
              onClick={() => setSelectedId(null)}
              className="ml-auto p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4">
            {selected.isVirtual && (
              <p className="mb-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('classrooms.virtualHint', 'Виртуальный кабинет: вмещает любое число занятий одновременно, накладок по нему не бывает.')}
              </p>
            )}
            {renderOccupancy(selected)}
          </div>
        </section>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 dark:bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-200/50 dark:border-slate-700/50"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5">
              {form.id ? t('classrooms.editTitle', 'Изменить кабинет') : t('classrooms.add', 'Добавить кабинет')}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                  {t('classrooms.name', 'Название')}
                </label>
                <input
                  autoFocus value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t('classrooms.namePlaceholder', 'напр. Каб. 305')}
                  className="input bg-slate-50 dark:bg-slate-900/50"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                  {t('common.branch', 'Филиал')}
                </label>
                <select
                  value={form.branchId || ''}
                  onChange={e => setForm(f => ({ ...f, branchId: e.target.value || null }))}
                  className="input bg-slate-50 dark:bg-slate-900/50"
                >
                  <option value="">{t('classrooms.noBranch', 'Без филиала')}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                    {t('classrooms.capacity', 'Мест')}
                  </label>
                  <input
                    type="number" min={0} value={form.capacity}
                    onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                    className="input bg-slate-50 dark:bg-slate-900/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                    {t('classrooms.floor', 'Этаж')}
                  </label>
                  <input
                    value={form.floor}
                    onChange={e => setForm(f => ({ ...f, floor: e.target.value }))}
                    className="input bg-slate-50 dark:bg-slate-900/50"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox" checked={form.isVirtual}
                  onChange={e => setForm(f => ({ ...f, isVirtual: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 rounded accent-slate-900 dark:accent-white"
                />
                <span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white block">
                    {t('classrooms.virtual', 'Виртуальный (онлайн)')}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('classrooms.virtualNote', 'Вмещает любое число занятий сразу — накладки по нему не считаются.')}
                  </span>
                </span>
              </label>
            </div>

            {error && (
              <p className="mt-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm"
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name.trim()}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />{saving ? '…' : t('common.save', 'Сохранить')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingArchive}
        title={t('classrooms.archiveTitle', 'Убрать кабинет в архив?')}
        message={t('classrooms.archiveMessage', 'Кабинет исчезнет из выбора при создании занятий. Уже поставленные занятия останутся и сохранят его название.')}
        confirmLabel={t('classrooms.archive', 'В архив')}
        danger
        busy={archiving}
        onConfirm={confirmArchive}
        onClose={() => setPendingArchive(null)}
      />
    </div>
  );
};

export default ClassroomsPage;
