/**
 * Мелкие общие элементы модуля «Конкурсы». Разметка повторяет принятую в
 * приложении (ClassroomsPage, FinancesPage): общих Button/Modal в проекте нет,
 * поэтому классы собраны здесь один раз, а не копируются по вкладкам.
 */
import React from 'react';
import { Check, X } from 'lucide-react';
import type { CategoryJudging, ContestStatus, ParticipantStatus } from '../../lib/contests';
import { CONTEST_STATUS_LABELS, JUDGING_LABELS, PARTICIPANT_STATUS_LABELS } from '../../lib/contests';


export const Label: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{children}</label>
);

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string; className?: string }> = ({ label, children, hint, className }) => (
  <div className={className}>
    <Label>{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

export const ErrorNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm font-medium text-red-600 dark:text-red-400">{children}</p>
);

export const WarnNote: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-sm text-amber-700 dark:text-amber-300 ${className}`}>{children}</div>
);

export const Modal: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ open, title, onClose, children, footer, wide }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={`bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} shadow-2xl border border-slate-200/50 dark:border-slate-700/50 max-h-[92vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Закрыть"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 pb-2 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="flex justify-end gap-3 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
};

export const ModalFooter: React.FC<{ onCancel: () => void; onSave: () => void; saving?: boolean; disabled?: boolean; saveLabel?: string }> = ({ onCancel, onSave, saving, disabled, saveLabel = 'Сохранить' }) => (
  <>
    <button onClick={onCancel} className="px-5 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm">Отмена</button>
    <button onClick={onSave} disabled={saving || disabled} className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50">
      <Check className="w-4 h-4" />{saving ? '…' : saveLabel}
    </button>
  </>
);

const STATUS_TONE: Record<ContestStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  registration: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  judging: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  finished: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
};
export const StatusBadge: React.FC<{ status: ContestStatus }> = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${STATUS_TONE[status]}`}>{CONTEST_STATUS_LABELS[status]}</span>
);

const JUDGING_TONE: Record<CategoryJudging, string> = {
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  open: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  closed: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
};
export const JudgingBadge: React.FC<{ state: CategoryJudging }> = ({ state }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${JUDGING_TONE[state]}`}>
    {state === 'open' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
    {JUDGING_LABELS[state]}
  </span>
);

const P_TONE: Record<ParticipantStatus, string> = {
  registered: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  arrived: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  withdrawn: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};
export const ParticipantBadge: React.FC<{ status: ParticipantStatus }> = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${P_TONE[status]}`}>{PARTICIPANT_STATUS_LABELS[status]}</span>
);

/** Номер проекта — моноширинная «табличка». */
export const NumberChip: React.FC<{ value: string; large?: boolean }> = ({ value, large }) => (
  <span className={`inline-flex items-center justify-center font-mono font-bold rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 ${large ? 'px-3 py-1.5 text-lg' : 'px-2 py-0.5 text-xs'}`}>{value}</span>
);

