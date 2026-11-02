/**
 * Общий визуальный язык рейтинга: цветовые зоны, значки места, мелкие карточки.
 *
 * Вынесено из StudentRatingPage, чтобы страница недопуска и боковая карточка
 * студента говорили ровно теми же чипами и цветами, что и таблица рейтинга, —
 * иначе «жёлтый» балл на одном экране и «оранжевый» на другом расходятся молча.
 */
import React from 'react';
import { Ban } from 'lucide-react';
import { toneOf, type RatingMetrics, type RatingTone } from '../../lib/student-rating';

export const TONE: Record<RatingTone, { text: string; bar: string; chip: string }> = {
  good: {
    text: 'text-emerald-600 dark:text-emerald-400',
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  warn: {
    text: 'text-amber-600 dark:text-amber-400',
    bar: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  bad: {
    text: 'text-rose-600 dark:text-rose-400',
    bar: 'bg-rose-500',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  },
};

/** Медали первой тройки — тот же язык, что в колонке рейтинга внутри журнала. */
export const MEDALS = [
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

/** «4.6 / 5», а при разных шкалах в срезе — честный процент. */
export function gradeLabel(m: RatingMetrics): string {
  if (!m.hasGrades) return '—';
  if (m.avgGrade !== null && m.scaleMax !== null) return `${m.avgGrade} / ${m.scaleMax}`;
  return `${m.gradePct}%`;
}

/** Аватар студента: фото или инициалы в кружке. Один вид на всех экранах рейтинга. */
export const Avatar: React.FC<{ name: string; url?: string; className?: string }> = ({ name, url, className = 'w-8 h-8' }) => (
  url ? (
    <img src={url} alt="" className={`${className} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${className} rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0`}>
      {initials(name)}
    </div>
  )
);

/** Метка «Не допуск» — единственная красная метка, читается как ярлык на студенте. */
export const NotAdmittedBadge: React.FC<{ label: string; title?: string; className?: string }> = ({ label, title, className = '' }) => (
  <span
    title={title}
    className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 ${className}`}
  >
    <Ban className="w-3 h-3 shrink-0" />
    {label}
  </span>
);

export const SummaryCard: React.FC<{
  icon: React.ElementType;
  iconClass: string;
  label: string;
  value: string;
  sub?: string;
}> = ({ icon: Icon, iconClass, label, value, sub }) => (
  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
    <div className="flex items-center justify-between mb-1 gap-2">
      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
      <div className={`shrink-0 ${iconClass}`}><Icon className="w-3.5 h-3.5" /></div>
    </div>
    <h3 className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 truncate" title={value}>{value}</h3>
    {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={sub}>{sub}</p>}
  </div>
);

export const BranchChip: React.FC<{ label: string; count?: number; active: boolean; onClick: () => void }> = ({ label, count, active, onClick }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-sm transition-colors ${
      active
        ? 'bg-primary-100 dark:bg-primary-950 text-slate-900 dark:text-slate-100 font-medium'
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
    }`}
  >
    {label}
    {count !== undefined && (
      <span className={`text-xs tabular-nums ${active ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400'}`}>{count}</span>
    )}
  </button>
);

export const RankBadge: React.FC<{ rank: number | null }> = ({ rank }) => {
  if (rank === null) return <span className="text-slate-300 dark:text-slate-600 text-sm">—</span>;
  const medal = rank <= 3 ? MEDALS[rank - 1] : '';
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold tabular-nums ${
        medal || 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
      }`}
    >
      {rank}
    </span>
  );
};

export const Stat: React.FC<{ label: string; value: string; valueClass?: string }> = ({ label, value, valueClass }) => (
  <div className="text-center">
    <p className={`text-xl font-semibold tabular-nums ${valueClass || 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
  </div>
);

export const MiniStat: React.FC<{ label: string; value: number; className?: string }> = ({ label, value, className }) => (
  <div className="text-center p-2 rounded-lg border border-slate-200 dark:border-slate-700">
    <p className={`text-lg font-semibold tabular-nums ${className || 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
    <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
  </div>
);

/** Цвет по зоне — короткий помощник, чтобы не тянуть TONE[toneOf(x)] по месту. */
export const tone = (value: number) => TONE[toneOf(value)];
