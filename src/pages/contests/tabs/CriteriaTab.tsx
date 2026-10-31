import React, { useMemo, useState } from 'react';
import { Plus, Trash2, GripVertical, Lock, ArrowUp, ArrowDown, X, Scale } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { maxTotal, type ContestCriterion } from '../../../lib/contests';
import type { ContestTabProps } from '../ContestDetailPage';
import { Label, WarnNote } from '../ui';
import { cardCls, primaryBtn, secondaryBtn, ghostBtn, inputCls } from '../uiStyles';

type Draft = { key: string; id?: string; name: string; description: string; maxScore: string };
let keySeq = 0;
const toDraft = (c: ContestCriterion): Draft => ({ key: c.id, id: c.id, name: c.name, description: c.description, maxScore: String(c.maxScore) });

const Row: React.FC<{ d: Draft; index: number; locked: boolean; onChange: (p: Partial<Draft>) => void; onRemove: () => void }> = ({ d, index, locked, onChange, onRemove }) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.key, disabled: locked });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${cardCls} p-4 flex gap-3 ${isDragging ? 'relative z-10 shadow-lg' : ''}`}>
      {!locked ? (
        <button {...attributes} {...listeners} className="touch-none self-start mt-6 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 cursor-grab" aria-label={t('contests.crit.drag', 'Перетащить')}><GripVertical className="w-4 h-4" /></button>
      ) : <span className="self-start mt-7 text-sm font-bold text-slate-500 dark:text-slate-400 w-4 text-center">{index + 1}</span>}
      <fieldset disabled={locked} className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-3">
        <div>
          <Label>{t('contests.crit.criterion', 'Критерий')}</Label>
          <input value={d.name} onChange={(e) => onChange({ name: e.target.value })} placeholder={t('contests.crit.namePh', 'Техническая реализация')} className={inputCls} />
        </div>
        <div>
          <Label>{t('contests.crit.maxScore', 'Макс. балл')}</Label>
          <input type="number" min={1} inputMode="numeric" value={d.maxScore} onChange={(e) => onChange({ maxScore: e.target.value })} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <Label>{t('contests.crit.whatToJudge', 'Что оценивать (видит жюри)')}</Label>
          <textarea rows={2} value={d.description} onChange={(e) => onChange({ description: e.target.value })} placeholder={t('contests.crit.descPh', 'Работает ли устройство, качество сборки и кода, сложность решения')} className={inputCls} />
        </div>
      </fieldset>
      {!locked && <button onClick={onRemove} className={`${ghostBtn} self-start mt-5 text-rose-600`} aria-label={t('contests.crit.delete', 'Удалить критерий')}><Trash2 className="w-4 h-4" /></button>}
    </div>
  );
};

const CriteriaTab: React.FC<ContestTabProps> = ({ data, act, canEdit, readOnly }) => {
  const { t } = useTranslation();
  const { contest } = data;
  const locked = contest.categories.some((c) => c.judging !== 'pending') || readOnly || !canEdit;
  const tieLocked = readOnly || !canEdit || contest.categories.some((c) => c.judging === 'approved');
  const initial = useMemo(() => contest.criteria.map(toDraft), [contest.criteria]);
  const [rows, setRows] = useState<Draft[]>(initial);
  const [tie, setTie] = useState<string[]>(contest.tieBreakCriterionIds);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setRows((rs) => arrayMove(rs, rs.findIndex((r) => r.key === e.active.id), rs.findIndex((r) => r.key === e.over!.id)));
  };

  const total = maxTotal(rows.map((r) => ({ maxScore: Number(r.maxScore) || 0 })));
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const tieDirty = JSON.stringify(tie) !== JSON.stringify(contest.tieBreakCriterionIds);
  // Критерии ничьей выбираются из сохранённых (у новых ещё нет id).
  const saved = contest.criteria;
  const nameOf = (id: string) => saved.find((c) => c.id === id)?.name || '—';

  const save = async () => {
    setSaving(true);
    await act('saveCriteria', {
      criteria: rows.map((r) => ({ id: r.id, name: r.name, description: r.description, maxScore: Number(r.maxScore) })),
      tieBreakCriterionIds: tie,
    }, t('contests.crit.saved', 'Критерии сохранены'));
    setSaving(false);
  };
  const saveTie = async () => {
    setSaving(true);
    await act('saveTieBreak', { tieBreakCriterionIds: tie }, t('contests.crit.tieSaved', 'Порядок разрешения ничьей сохранён'));
    setSaving(false);
  };
  const move = (i: number, d: -1 | 1) => setTie((ids) => { const n = [...ids]; const j = i + d; if (j < 0 || j >= n.length) return ids; [n[i], n[j]] = [n[j], n[i]]; return n; });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-3">
        {locked && !readOnly && canEdit && (
          <WarnNote className="flex items-start gap-2"><Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />{t('contests.crit.lockedNote', 'Оценивание уже началось — критерии зафиксированы, чтобы не испортить выставленные оценки. Порядок разрешения ничьей справа менять ещё можно.')}</WarnNote>
        )}
        <div className={`${cardCls} p-4 flex items-center justify-between`}>
          <span className="text-sm text-slate-500 dark:text-slate-400">{t('contests.crit.maxPerJury', 'Максимум от одного члена жюри')}</span>
          <span className="text-2xl font-bold text-slate-900 dark:text-white">{total}</span>
        </div>
        {locked ? (
          <ol className={`${cardCls} divide-y divide-slate-100 dark:divide-slate-700/60`}>
            {rows.map((r, i) => (
              <li key={r.key} className="px-5 py-3 flex gap-3">
                <span className="w-6 shrink-0 font-bold text-slate-500 dark:text-slate-400">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-slate-900 dark:text-white">{r.name}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">{t('contests.crit.upTo', { count: Number(r.maxScore) || 0, defaultValue: 'до {{count}} баллов' })}</span>
                  </div>
                  {r.description && <p className="text-[13px] text-slate-600 dark:text-slate-300 mt-0.5">{r.description}</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {rows.map((r, i) => (
                <Row key={r.key} d={r} index={i} locked={locked}
                  onChange={(p) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, ...p } : x)))}
                  onRemove={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); if (r.id) setTie((ids) => ids.filter((id) => id !== r.id)); }} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        )}
        {!rows.length && <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">{t('contests.crit.empty', 'Критериев пока нет.')}</p>}
        {!locked && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setRows((rs) => [...rs, { key: `new-${++keySeq}`, name: '', description: '', maxScore: '20' }])} className={secondaryBtn}><Plus className="w-4 h-4" />{t('contests.crit.criterion', 'Критерий')}</button>
            <button onClick={save} disabled={(!dirty && !tieDirty) || saving} className={primaryBtn}>{saving ? '…' : t('contests.crit.save', 'Сохранить критерии')}</button>
          </div>
        )}
      </div>

      <aside className={`${cardCls} p-5 h-fit`}>
        <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Scale className="w-4 h-4 text-primary-500" />{t('contests.crit.tieBreak', 'Разрешение ничьей')}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">{t('contests.crit.tieBreakHint', 'При равных итоговых баллах проекты сравниваются по средним баллам этих критериев — по порядку. Если и они равны — «требуется решение жюри».')}</p>
        <ol className="space-y-2">
          {tie.map((id, i) => (
            <li key={id} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-slate-500 dark:text-slate-400 font-bold">{i + 1}.</span>
              <span className="flex-1 text-slate-800 dark:text-slate-100">{nameOf(id)}</span>
              {!tieLocked && (
                <>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className={ghostBtn} aria-label={t('contests.up', 'Выше')}><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === tie.length - 1} className={ghostBtn} aria-label={t('contests.down', 'Ниже')}><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setTie((ids) => ids.filter((x) => x !== id))} className={ghostBtn} aria-label={t('contests.remove', 'Убрать')}><X className="w-3.5 h-3.5" /></button>
                </>
              )}
            </li>
          ))}
        </ol>
        {!tieLocked && saved.some((c) => !tie.includes(c.id)) && (
          <select value="" onChange={(e) => e.target.value && setTie((ids) => [...ids, e.target.value])} className={`${inputCls} mt-3`}>
            <option value="">{t('contests.crit.addOption', '+ добавить критерий…')}</option>
            {saved.filter((c) => !tie.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {!saved.length && <p className="text-xs text-slate-500 dark:text-slate-400">{t('contests.crit.saveFirst', 'Сначала сохраните критерии.')}</p>}
        {!tieLocked && locked && tieDirty && (
          <button onClick={saveTie} disabled={saving} className={`${primaryBtn} w-full mt-4`}>{t('contests.crit.saveOrder', 'Сохранить порядок')}</button>
        )}
      </aside>
    </div>
  );
};

export default CriteriaTab;
