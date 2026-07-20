import React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, X } from 'lucide-react';
import { PERIOD_PRESETS, isCompleteCustomRange } from '../financePeriod';
import type { FinanceRange } from '../financePeriod';

interface Props {
  value: FinanceRange;
  onChange: (next: FinanceRange) => void;
  /** Подпись справа — например, разрешённые сервером границы периода. */
  hint?: React.ReactNode;
}

/**
 * Выбор периода: пресеты плюс произвольный диапазон.
 *
 * Один компонент на три вкладки — иначе пресеты разъезжаются между экранами,
 * как уже случилось между «Обзором» и дашбордом.
 */
const PeriodFilter: React.FC<Props> = ({ value, onChange, hint }) => {
  const { t } = useTranslation();
  const custom = value.period === 'custom';

  // Незаполненный диапазон сервер не примет, поэтому до второй даты
  // показываем данные за текущий месяц и говорим об этом явно.
  const incomplete = custom && !isCompleteCustomRange(value);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => onChange({ period: p.id })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              value.period === p.id
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            {t(p.labelKey, p.fallback)}
          </button>
        ))}

        <button
          onClick={() => onChange(custom ? { period: 'current_month' } : { period: 'custom' })}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all inline-flex items-center gap-1.5 ${
            custom
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
          }`}
        >
          <CalendarRange className="w-3.5 h-3.5" />
          {t('finances.periodCustom', 'Свой период')}
        </button>

        {hint && <span className="text-xs text-slate-400 ml-1">{hint}</span>}
      </div>

      {custom && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={value.startDate || ''}
            max={value.endDate || undefined}
            onChange={e => onChange({ ...value, period: 'custom', startDate: e.target.value })}
            aria-label={t('finances.rangeFrom', 'Начало периода')}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
          />
          <span className="text-slate-400 text-sm">—</span>
          <input
            type="date"
            value={value.endDate || ''}
            min={value.startDate || undefined}
            onChange={e => onChange({ ...value, period: 'custom', endDate: e.target.value })}
            aria-label={t('finances.rangeTo', 'Конец периода')}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm dark:text-white"
          />
          <button
            onClick={() => onChange({ period: 'current_month' })}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label={t('finances.rangeReset', 'Сбросить период')}
          >
            <X className="w-4 h-4" />
          </button>
          {incomplete && (
            <span className="text-xs text-amber-600 dark:text-amber-500">
              {t('finances.rangeIncomplete', 'Укажите обе даты — пока показан текущий месяц')}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default PeriodFilter;
