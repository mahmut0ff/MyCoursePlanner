/**
 * Мелкие общие элементы модуля «Конкурсы». Разметка повторяет принятую в
 * приложении (ClassroomsPage, FinancesPage): общих Button/Modal в проекте нет,
 * поэтому классы собраны здесь один раз, а не копируются по вкладкам.
 */
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { CategoryJudging, ContestCategory, ContestStatus, ParticipantStatus } from '../../lib/contests';
import { CONTEST_STATUS_LABELS, JUDGING_LABELS, PARTICIPANT_STATUS_LABELS } from '../../lib/contests';


export const Label: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="text-[11px] font-bold text-slate-600 dark:text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block">{children}</label>
);

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string; className?: string }> = ({ label, children, hint, className }) => (
  <div className={className}>
    <Label>{label}</Label>
    {children}
    {hint && <p className="text-[12px] text-slate-600 dark:text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
  </div>
);

export const ErrorNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p role="alert" className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm font-medium text-red-700 dark:text-red-400">{children}</p>
);

export const WarnNote: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-sm text-amber-800 dark:text-amber-300 ${className}`}>{children}</div>
);

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Модальное окно: Esc закрывает, фокус не уходит за пределы окна, при
 * закрытии возвращается туда, откуда окно открыли.
 */
export const Modal: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ open, title, onClose, children, footer, wide }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    // Первый фокус — на первое поле/кнопку внутри (не на «Закрыть»).
    const first = box?.querySelectorAll<HTMLElement>(FOCUSABLE);
    const target = first && first.length > 1 ? first[1] : first?.[0];
    target?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !box) return;
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        ref={boxRef}
        role="dialog" aria-modal="true" aria-label={title}
        className={`bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} shadow-2xl border border-slate-200/50 dark:border-slate-700/50 max-h-[92vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-2 -mr-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Закрыть"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 pb-2 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="flex justify-end gap-3 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
};

export const ModalFooter: React.FC<{ onCancel: () => void; onSave: () => void; saving?: boolean; disabled?: boolean; saveLabel?: string }> = ({ onCancel, onSave, saving, disabled, saveLabel = 'Сохранить' }) => (
  <>
    <button onClick={onCancel} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm">Отмена</button>
    <button onClick={onSave} disabled={saving || disabled} className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50">
      {saving ? '…' : saveLabel}
    </button>
  </>
);

const STATUS_TONE: Record<ContestStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  registration: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  judging: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  finished: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
};
export const StatusBadge: React.FC<{ status: ContestStatus }> = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${STATUS_TONE[status]}`}>{CONTEST_STATUS_LABELS[status]}</span>
);

const JUDGING_TONE: Record<CategoryJudging, string> = {
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  open: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  closed: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-primary-100 text-primary-800 dark:bg-primary-500/15 dark:text-primary-300',
};
export const JudgingBadge: React.FC<{ state: CategoryJudging }> = ({ state }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${JUDGING_TONE[state]}`}>
    {state === 'open' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />}
    {JUDGING_LABELS[state]}
  </span>
);

const P_TONE: Record<ParticipantStatus, string> = {
  registered: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  arrived: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  withdrawn: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
};
export const ParticipantBadge: React.FC<{ status: ParticipantStatus }> = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${P_TONE[status]}`}>{PARTICIPANT_STATUS_LABELS[status]}</span>
);

/** Номер проекта — моноширинная «табличка». */
export const NumberChip: React.FC<{ value: string; large?: boolean }> = ({ value, large }) => (
  <span className={`inline-flex items-center justify-center font-mono font-bold rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 ${large ? 'px-3 py-1.5 text-lg' : 'px-2 py-0.5 text-xs'}`}>{value}</span>
);

/**
 * Единый выбор категории для «Мониторинга» и «Итогов»: один и тот же
 * контрол, состояние оценивания на каждой кнопке, aria-pressed для скринридера.
 */
export const CategoryPicker: React.FC<{
  categories: ContestCategory[];
  value: string;
  onChange: (id: string) => void;
  /** Доп. строка под бейджем (например, число проектов). */
  extra?: (c: ContestCategory) => string;
}> = ({ categories, value, onChange, extra }) => (
  <div role="group" aria-label="Категория" className="flex flex-wrap gap-2">
    {categories.map((c) => {
      const on = c.id === value;
      return (
        <button key={c.id} type="button" aria-pressed={on} onClick={() => onChange(c.id)}
          className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition-colors ${on
            ? 'border-slate-900 dark:border-white bg-white dark:bg-slate-800 ring-2 ring-slate-900 dark:ring-white'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'}`}>
          <span className="text-lg font-bold text-slate-900 dark:text-white">{c.code}</span>
          <span className="flex flex-col gap-0.5">
            <JudgingBadge state={c.judging} />
            <span className="text-[11px] text-slate-600 dark:text-slate-500 dark:text-slate-400">{extra ? extra(c) : `${c.ageFrom}–${c.ageTo} лет`}</span>
          </span>
        </button>
      );
    })}
  </div>
);
