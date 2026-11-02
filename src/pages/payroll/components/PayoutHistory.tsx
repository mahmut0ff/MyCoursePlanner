import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, History } from 'lucide-react';
import EmptyState from '../../../components/ui/EmptyState';
import { formatDayKey } from '../../../lib/money';
import type { PayrollPayout } from '../../../types';
import { formatMinor, formatPeriodLabel } from '../payrollFormat';

/**
 * Сколько строк видно до нажатия «Показать ещё». Десять — это примерно один
 * месяц выплат: свежее видно сразу, а вся история за годы не растягивает
 * страницу на несколько экранов.
 */
const FIRST_PAGE = 10;

interface Props {
  /** Вся история организации, свежие сверху — в этом порядке её отдаёт сервер. */
  payouts: PayrollPayout[];
}

/**
 * История выплат: кому, когда и сколько выдали.
 *
 * Раньше этого вопроса экран не слышал вовсе — выплата уходила расходом в кассу
 * и терялась там среди аренды и рекламы. Список ниже собирает те же расходы
 * обратно, поэтому разойтись с «Финансами» он не может: это одни и те же записи,
 * а не второй журнал рядом с кассой.
 *
 * Месяц в строке — месяц НАЧИСЛЕНИЯ, а не выдачи: зарплату за июль выдают в
 * августе, и «за июль 2026» рядом с августовской датой — это не опечатка.
 */
const PayoutHistory: React.FC<Props> = ({ payouts }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(
    () => (expanded ? payouts : payouts.slice(0, FIRST_PAGE)),
    [payouts, expanded],
  );
  const hidden = payouts.length - rows.length;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden tabular-nums">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 flex-wrap">
        <History className="w-3.5 h-3.5 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t('payroll.historyTitle', 'История выплат')}
        </h3>
        <p className="text-xs text-slate-500">
          {t('payroll.historyHint', 'Каждая строка — расход в кассе по категории «Зарплата»: кому, когда и сколько выдали.')}
        </p>
      </div>

      {payouts.length === 0 ? (
        <EmptyState icon={History} title={t('payroll.historyEmpty', 'Выплат пока не было')} />
      ) : (
        <>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {rows.map(payout => (
              <li key={payout.id} className="px-3 py-2 min-h-[40px] flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800">
                <div className="min-w-0">
                  {/* Расход мог быть заведён в кассе без указания преподавателя —
                      тогда единственное, чем строка себя называет, это описание. */}
                  <p className="text-sm text-slate-900 dark:text-slate-100 truncate">
                    {payout.teacherName || payout.description || '—'}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-slate-500">
                    <span className="whitespace-nowrap">{formatDayKey(payout.date)}</span>
                    {payout.period && (
                      <span className="whitespace-nowrap">
                        {t('payroll.historyForPeriod', 'за {{period}}', { period: formatPeriodLabel(payout.period) })}
                      </span>
                    )}
                    {payout.branchName && (
                      <span className="inline-flex items-center gap-1 min-w-0">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{payout.branchName}</span>
                      </span>
                    )}
                    {/* Выданные деньги — тоже деньги, поэтому ручной расход в
                        списке есть. Но ведомости и строки за ним нет, и путать
                        его с проведённой выплатой нельзя. */}
                    {payout.manual && (
                      <span className="text-slate-400 whitespace-nowrap">
                        {t('payroll.historyManual', 'заведено вручную в кассе')}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
                  {formatMinor(payout.amountMinor)}
                </span>
              </li>
            ))}
          </ul>

          {hidden > 0 && (
            <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="btn-secondary"
              >
                {t('payroll.historyShowMore', 'Показать ещё')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PayoutHistory;
