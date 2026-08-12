import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, Check } from 'lucide-react';
import { orgListClassrooms, orgCreateClassroom } from '../../lib/api';
import { usePermissions } from '../../contexts/PermissionsContext';
import { normalizeRoom } from '../../lib/classrooms';
import type { Classroom } from '../../types';

export interface ClassroomChoice {
  classroomId: string | null;
  /** Подпись кабинета. Дублируется в location, по нему читают старые экраны. */
  location: string;
}

interface ClassroomSelectProps {
  /** Филиал ФОРМЫ (не сайдбара): кабинеты показываются только его. */
  branchId?: string | null;
  value: ClassroomChoice;
  onChange: (v: ClassroomChoice) => void;
  disabled?: boolean;
}

/**
 * Выбор кабинета из справочника вместо ручного ввода.
 *
 * Два обязательства перед старыми данными:
 *  1) занятие, подписанное свободным текстом до появления справочника, не теряет
 *     подпись — она остаётся отдельным пунктом списка, пока её не заменят;
 *  2) если подходящий кабинет в справочнике уже есть, старый текст к нему
 *     подтягивается автоматически (по normalizeRoom), чтобы «Каб. 305» и
 *     «каб 305» не жили как два разных кабинета.
 */
const ClassroomSelect: React.FC<ClassroomSelectProps> = ({ branchId, value, onChange, disabled }) => {
  const { t } = useTranslation();
  const { canWrite } = usePermissions();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canCreate = canWrite('classrooms');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    orgListClassrooms(branchId)
      .then((list: any) => { if (!cancelled) setClassrooms(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setClassrooms([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [branchId]);

  /**
   * Кабинет занятия, которому не нашлось строки в загруженном справочнике. Держим
   * его отдельным пунктом, иначе открытие формы на редактирование молча стёрло бы
   * аудиторию у события.
   *
   * Таких случаев два, и оба обязаны выглядеть одинаково честно:
   *  - старый свободный текст, ещё не переехавший в справочник;
   *  - НАСТОЯЩАЯ ссылка на кабинет, которого нет в этом списке: он в архиве, в
   *    другом филиале или список просто не отдался. Раньше select показывал в
   *    таком случае «Без кабинета», продолжая хранить прежний classroomId, —
   *    подпись врала о том, что сохранится.
   */
  const orphan = useMemo((): { label: string; linked: boolean } | null => {
    if (loading) return null;
    if (value.classroomId) {
      if (classrooms.some(c => c.id === value.classroomId)) return null;
      return {
        label: value.location.trim() || t('classrooms.unknownRoom', 'кабинет вне списка'),
        linked: true,
      };
    }
    if (!value.location.trim()) return null;
    const key = normalizeRoom(value.location);
    if (classrooms.some(c => normalizeRoom(c.name) === key)) return null;
    return { label: value.location.trim(), linked: false };
  }, [loading, value.classroomId, value.location, classrooms, t]);

  // Свободный текст, совпавший с кабинетом справочника, привязываем сразу — иначе
  // такое событие продолжит считаться «без кабинета» на странице кабинетов.
  useEffect(() => {
    if (loading || value.classroomId || !value.location.trim()) return;
    const key = normalizeRoom(value.location);
    const match = classrooms.find(c => normalizeRoom(c.name) === key);
    if (match) onChange({ classroomId: match.id, location: match.name });
  }, [loading, classrooms, value.classroomId, value.location]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (id: string) => {
    if (!id) return onChange({ classroomId: null, location: '' });
    // Вернуться к исходному кабинету = оставить всё как было, вместе со ссылкой:
    // сбрасывать её в null значило бы отвязать занятие от кабинета молча.
    if (id === '__legacy__') return onChange({ ...value });
    const c = classrooms.find(x => x.id === id);
    onChange(c ? { classroomId: c.id, location: c.name } : { classroomId: null, location: '' });
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true); setError('');
    try {
      const created = await orgCreateClassroom({ name, branchId: branchId || null });
      setClassrooms(prev => [...prev, created].sort((a, b) =>
        a.name.localeCompare(b.name, 'ru', { numeric: true })));
      onChange({ classroomId: created.id, location: created.name });
      setCreating(false); setNewName('');
    } catch (e: any) {
      setError(e.message || t('common.error', 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  // Пункт выбираем по тому, что реально есть в списке: ссылка на отсутствующий
  // кабинет иначе выбрала бы первый пункт — «Без кабинета».
  const selectedValue = orphan
    ? '__legacy__'
    : (value.classroomId || '');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={selectedValue}
          disabled={disabled || loading}
          onChange={(e) => handleSelect(e.target.value)}
          className="input bg-slate-50 dark:bg-slate-900/50 flex-1"
        >
          <option value="">
            {loading ? t('common.loading', 'Загрузка…') : t('classrooms.none', 'Без кабинета')}
          </option>
          {orphan && (
            <option value="__legacy__">
              {orphan.label} — {orphan.linked
                ? t('classrooms.notInBranchList', 'нет в списке этого филиала')
                : t('classrooms.notInCatalog', 'не из справочника')}
            </option>
          )}
          {classrooms.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.capacity ? ` · ${c.capacity} ${t('classrooms.seatsShort', 'мест')}` : ''}
            </option>
          ))}
        </select>

        {canCreate && !creating && (
          <button
            type="button"
            // Заводя кабинет, подставляем текущую подпись: чаще всего справочник
            // и пополняют именно тем, что уже написано в занятии от руки.
            onClick={() => { setCreating(true); setNewName(orphan?.linked ? '' : orphan?.label || ''); setError(''); }}
            disabled={disabled}
            title={t('classrooms.addNew', 'Добавить кабинет')}
            className="shrink-0 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600/50 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {creating && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
              if (e.key === 'Escape') { setCreating(false); setError(''); }
            }}
            placeholder={t('classrooms.namePlaceholder', 'напр. Каб. 305')}
            className="input bg-slate-50 dark:bg-slate-900/50 flex-1"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
            className="shrink-0 p-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => { setCreating(false); setError(''); }}
            className="shrink-0 p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !classrooms.length && !creating && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {canCreate
            ? t('classrooms.emptyHint', 'В этом филиале ещё нет кабинетов — добавьте первый кнопкой «+».')
            : t('classrooms.emptyReadonly', 'В этом филиале ещё нет кабинетов.')}
        </p>
      )}
    </div>
  );
};

export default ClassroomSelect;
