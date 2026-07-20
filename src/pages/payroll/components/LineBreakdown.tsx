import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatMinor, formatPercentBp, type Translate } from '../payrollFormat';

/** Замороженный расчёт компонента, как его пишет api-payroll в ruleSnapshot.computed. */
interface ComputedEntry {
  kind: string;
  earnedMinor: number;
  basis?: Record<string, any>;
}

interface Props {
  ruleSnapshot: Record<string, unknown> | undefined;
}

/**
 * Основание компонента словами: «20% от 150 000 с.», «500 с. × 12 занятий».
 *
 * Это главное, ради чего снапшот вообще хранится. Голая сумма «30 000 с.» не
 * даёт директору проверить расчёт; «20% от 150 000 с.» — даёт, и спор с
 * преподавателем заканчивается на этой строке, а не в пересчёте вручную.
 */
const describeBasis = (entry: ComputedEntry, t: Translate): string => {
  const basis = entry.basis ?? {};
  switch (entry.kind) {
    case 'salary':
      return t('payroll.basisSalary', 'Фиксированный оклад');
    case 'percent_revenue': {
      const base = t('payroll.basisPercent', '{{percent}} от {{base}}', {
        percent: formatPercentBp(basis.percentBp),
        base: formatMinor(basis.revenueBaseMinor),
      });
      // Возвраты показываем, только если они были: иначе строка шумит нулём.
      if (Number(basis.refundMinor || 0) > 0) {
        return `${base} ${t('payroll.basisPercentRefund', '(собрано {{gross}}, возвраты {{refund}})', {
          gross: formatMinor(basis.grossMinor),
          refund: formatMinor(basis.refundMinor),
        })}`;
      }
      return base;
    }
    case 'per_lesson':
      return t('payroll.basisPerLesson', '{{amount}} × {{count}} занятий', {
        amount: formatMinor(basis.amountMinor),
        count: Number(basis.sessionCount || 0),
      });
    case 'per_hour':
      return t('payroll.basisPerHour', '{{amount}} за час × {{minutes}} мин ({{count}} занятий)', {
        amount: formatMinor(basis.amountMinor),
        minutes: Number(basis.minutesTotal || 0),
        count: Number(basis.sessionCount || 0),
      });
    case 'per_student':
      return t('payroll.basisPerStudent', '{{amount}} × {{total}} студентов ({{count}} занятий)', {
        amount: formatMinor(basis.amountMinor),
        total: Number(basis.studentTotal || 0),
        count: Number(basis.sessionCount || 0),
      });
    default:
      return '';
  }
};

/** Расшифровка расчётной строки: по компоненту на строку, с основанием и суммой. */
const LineBreakdown: React.FC<Props> = ({ ruleSnapshot }) => {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;

  const label = String((ruleSnapshot as any)?.label || '');
  const computed: ComputedEntry[] = Array.isArray((ruleSnapshot as any)?.computed)
    ? (ruleSnapshot as any).computed
    : [];

  if (!computed.length) {
    return <span className="text-slate-400">{label || '—'}</span>;
  }

  return (
    <div className="space-y-1 min-w-[18rem]">
      {label && <p className="text-[11px] font-medium text-slate-400">{label}</p>}
      {computed.map((entry, i) => (
        <div key={i} className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-slate-600 dark:text-slate-400">{describeBasis(entry, tr)}</span>
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
            {formatMinor(entry.earnedMinor)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default LineBreakdown;
