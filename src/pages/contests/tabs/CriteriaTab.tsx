import React, { useMemo, useState } from 'react';
import { Plus, Trash2, GripVertical, Lock, ArrowUp, ArrowDown, X, Scale } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { maxTotal, type ContestCriterion } from '../../../lib/contests';
import type { ContestTabProps } from '../ContestDetailPage';
import { Label, WarnNote } from '../ui';
import { cardCls, primaryBtn, secondaryBtn, ghostBtn, inputCls } from '../uiStyles';

type Draft = { key: string; id?: string; name: string; description: string; maxScore: string };
let keySeq = 0;
const toDraft = (c: ContestCriterion): Draft => ({ key: c.id, id: c.id, name: c.name, description: c.description, maxScore: String(c.maxScore) });

const Row: React.FC<{ d: Draft; index: number; locked: boolean; onChange: (p: Partial<Draft>) => void; onRemove: () => void }> = ({ d, index, locked, onChange, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.key, disabled: locked });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${cardCls} p-4 flex gap-3 ${isDragging ? 'relative z-10 shadow-lg' : ''}`}>
      {!locked ? (
        <button {...attributes} {...listeners} className="touch-none self-start mt-6 text-slate-300 hover:text-slate-500 cursor-grab" aria-label="Перетащить"><GripVertical className="w-4 h-4" /></button>
      ) : <span className="self-start mt-7 text-sm font-bold text-slate-400 w-4 text-center">{index + 1}</span>}
      <fieldset disabled={locked} className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-3">
        <div>
          <Label>Критерий</Label>
          <input value={d.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Техническая реализация" className={inputCls} />
        </div>
        <div>
          <Label>Макс. балл</Label>
          <input type="number" min={1} inputMode="numeric" value={d.maxScore} onChange={(e) => onChange({ maxScore: e.target.value })} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <Label>Что оценивать (видит жюри)</Label>
          <textarea rows={2} value={d.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Работает ли устройство, качество сборки и кода, сложность решения" className={inputCls} />
        </div>
      </fieldset>
      {!locked && <button onClick={onRemove} className={`${ghostBtn} self-start mt-5 text-rose-600`} aria-label="Удалить критерий"><Trash2 className="w-4 h-4" /></button>}
    </div>
  );
};

const CriteriaTab: React.FC<ContestTabProps> = ({ data, act, canEdit, readOnly }) => {
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
    }, 'Критерии сохранены');
    setSaving(false);
  };
  const saveTie = async () => {
    setSaving(true);
    await act('saveTieBreak', { tieBreakCriterionIds: tie }, 'Порядок разрешения ничьей сохранён');
    setSaving(false);
  };
  const move = (i: number, d: -1 | 1) => setTie((t) => { const n = [...t]; const j = i + d; if (j < 0 || j >= n.length) return t; [n[i], n[j]] = [n[j], n[i]]; return n; });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-3">
        {locked && !readOnly && canEdit && (
          <WarnNote className="flex items-start gap-2"><Lock className="w-4 h-4 mt-0.5 shrink-0" />Оценивание уже началось — критерии зафиксированы, чтобы не испортить выставленные оценки.</WarnNote>
        )}
        <div className={`${cardCls} p-4 flex items-center justify-between`}>
          <span className="text-sm text-slate-500 dark:text-slate-400">Максимум от одного члена жюри</span>
          <span className="text-2xl font-bold text-slate-900 dark:text-white">{total}</span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {rows.map((r, i) => (
                <Row key={r.key} d={r} index={i} locked={locked}
                  onChange={(p) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, ...p } : x)))}
                  onRemove={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); if (r.id) setTie((t) => t.filter((id) => id !== r.id)); }} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {!rows.length && <p className="text-sm text-slate-400 text-center py-8">Критериев пока нет.</p>}
        {!locked && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setRows((rs) => [...rs, { key: `new-${++keySeq}`, name: '', description: '', maxScore: '20' }])} className={secondaryBtn}><Plus className="w-4 h-4" />Критерий</button>
            <button onClick={save} disabled={(!dirty && !tieDirty) || saving} className={primaryBtn}>{saving ? '…' : 'Сохранить критерии'}</button>
          </div>
        )}
      </div>

      <aside className={`${cardCls} p-5 h-fit`}>
        <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Scale className="w-4 h-4 text-primary-500" />Разрешение ничьей</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">При равных итоговых баллах проекты сравниваются по средним баллам этих критериев — по порядку. Если и они равны — «требуется решение жюри».</p>
        <ol className="space-y-2">
          {tie.map((id, i) => (
            <li key={id} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-slate-400 font-bold">{i + 1}.</span>
              <span className="flex-1 text-slate-800 dark:text-slate-100">{nameOf(id)}</span>
              {!tieLocked && (
                <>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className={ghostBtn} aria-label="Выше"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === tie.length - 1} className={ghostBtn} aria-label="Ниже"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setTie((t) => t.filter((x) => x !== id))} className={ghostBtn} aria-label="Убрать"><X className="w-3.5 h-3.5" /></button>
                </>
              )}
            </li>
          ))}
        </ol>
        {!tieLocked && saved.some((c) => !tie.includes(c.id)) && (
          <select value="" onChange={(e) => e.target.value && setTie((t) => [...t, e.target.value])} className={`${inputCls} mt-3`}>
            <option value="">+ добавить критерий…</option>
            {saved.filter((c) => !tie.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {!saved.length && <p className="text-xs text-slate-400">Сначала сохраните критерии.</p>}
        {!tieLocked && locked && tieDirty && (
          <button onClick={saveTie} disabled={saving} className={`${primaryBtn} w-full mt-4`}>Сохранить порядок</button>
        )}
      </aside>
    </div>
  );
};

export default CriteriaTab;
