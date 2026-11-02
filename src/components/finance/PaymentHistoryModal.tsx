import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetTransactions } from '../../lib/api';
import { CreditCard, Undo2, X } from 'lucide-react';
import type { PayablePlan } from './AcceptPaymentModal';
import RefundModal, { type RefundableTx } from './RefundModal';
import { formatMoney, formatMoneySigned } from '../../lib/money';
import { numericDateLocale } from '../../lib/locale';
import { PAYMENT_METHODS } from '../../pages/finances/expenseCategories';

interface Props {
  /** Один счёт — с полосой прогресса. Взаимоисключимо со studentId. */
  plan?: PayablePlan;
  /** Все оплаты студента по всем его счетам. */
  studentId?: string;
  studentName: string;
  /** Возврат оформляется по конкретной оплате, поэтому живёт здесь, а не в меню. */
  canRefund?: boolean;
  /** Возврат меняет долг по счёту — вызывающему нужно перечитать счета. */
  onRefunded?: () => void;
  onClose: () => void;
}

// Иконка берётся из общего справочника способов оплаты, чтобы журнал и история
// не разошлись, когда список способов пополнится.
const methodIcon = (m?: string) => PAYMENT_METHODS.find(x => x.id === m)?.icon || '💵';

const PaymentHistoryModal: React.FC<Props> = ({ plan, studentId, studentName, canRefund, onRefunded, onClose }) => {
  const { t } = useTranslation();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundFor, setRefundFor] = useState<RefundableTx | null>(null);

  // Возвраты приходят тем же запросом: расход по этому же счёту/студенту.
  // Показываем их вперемешку с оплатами, чтобы «оплатил и вернул» читалось
  // как одна история, а не как необъяснимо пропавшие деньги.
  const load = useCallback(() => {
    const filters = plan ? { paymentPlanId: plan.id } : { studentId };
    apiGetTransactions(filters)
      .then((txs: any) => setHistory(Array.isArray(txs) ? txs : []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [plan, studentId]);

  useEffect(load, [load]);

  // Чистая сумма: оплаты минус возвраты. Показывать одни поступления было бы
  // враньём — деньги могли уже уйти обратно.
  const net = useMemo(
    () => history.reduce((sum, tx) => sum + (tx.type === 'expense' ? -1 : 1) * (tx.amount || 0), 0),
    [history]
  );
  const refunded = useMemo(() => history.some(tx => tx.type === 'expense'), [history]);
  /** Валовой приход и сумма возвратов — чтобы объяснить, из чего сложилось чистое. */
  const gross = useMemo(
    () => history.reduce((sum, tx) => sum + (tx.type === 'income' ? (tx.amount || 0) : 0), 0),
    [history]
  );
  const refundedTotal = useMemo(
    () => history.reduce((sum, tx) => sum + (tx.type === 'expense' ? (tx.amount || 0) : 0), 0),
    [history]
  );

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-[640px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('finances.paymentHistory', 'История оплат')}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{studentName}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="px-4 pt-2 pb-4">
          {plan ? (
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500">{t('finances.paymentProgress', 'Прогресс оплаты')}</span>
                <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatMoney(plan.paidAmount)} / {formatMoney(plan.totalAmount)}
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${plan.totalAmount > 0 ? Math.min(100, (plan.paidAmount / plan.totalAmount) * 100) : 0}%` }} />
              </div>
              {/* Возврат уменьшает `paidAmount`, поэтому шапка показывает уже
                  ЧИСТУЮ сумму — а список под ней перечисляет и приход, и
                  возврат по отдельности. Без этой строки два блока выглядят
                  противоречащими друг другу: «оплачено 0» над записью о платеже
                  на 5 000. Говорим прямо, что возвраты уже вычтены. */}
              {refunded && (
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {t('finances.progressNetOfRefunds', 'Возвраты уже вычтены: пришло {{gross}}, вернули {{back}}.', {
                    gross: formatMoney(gross),
                    back: formatMoney(refundedTotal),
                  })}
                </p>
              )}
            </div>
          ) : !loading && history.length > 0 && (
            // По студенту прогресса нет — счетов может быть несколько, поэтому
            // осмысленная сводка здесь только одна: сколько всего заплачено.
            <div className="mb-4 flex justify-between text-sm">
              <span className="text-slate-500">
                {refunded
                  ? t('finances.paidNetOfRefunds', 'Оплачено за вычетом возвратов')
                  : t('finances.paidTotal', 'Всего оплачено')}
              </span>
              <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(net)}</span>
            </div>
          )}

          {loading ? (
            <div className="py-6 text-center text-sm text-slate-500 animate-pulse">{t('finances.loading', 'Загрузка...')}</div>
          ) : history.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">{t('finances.noPaymentHistory', 'Нет истории оплат')}</div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {history.map(tx => {
                const isRefund = tx.type === 'expense';
                return (
                  <div key={tx.id} className="flex items-center justify-between gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-md ${isRefund ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                        {isRefund ? <Undo2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> : <CreditCard className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium tabular-nums ${isRefund ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
                          {formatMoneySigned(isRefund ? -(tx.amount || 0) : tx.amount)}
                          {isRefund && (
                            <span className="ml-1.5 inline-flex items-center h-5 px-1.5 rounded text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                              {t('finances.refundBadge', 'возврат')}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {new Date(tx.date || tx.createdAt).toLocaleDateString(numericDateLocale())}
                          {tx.paymentMethod && <span className="ml-1.5">· {methodIcon(tx.paymentMethod)}</span>}
                          {tx.description && <span className="ml-1.5">· {tx.description}</span>}
                        </p>
                        {/* Кто провёл операцию: для оплаты — принял деньги, для
                            возврата — оформил его. Старые записи без имени строку не рисуют. */}
                        {tx.createdByName && (
                          <p className="text-xs text-slate-400 truncate">
                            {isRefund ? t('finances.refundedBy', 'Вернул') : t('finances.colAcceptedBy', 'Принял')}: {tx.createdByName}
                          </p>
                        )}
                      </div>
                    </div>
                    {canRefund && !isRefund && (
                      <button
                        onClick={() => setRefundFor(tx)}
                        className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20 transition-colors"
                      >
                        <Undo2 className="w-3.5 h-3.5" /> {t('finances.refund', 'Возврат')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Гасим всплытие: иначе клик по фону возврата дошёл бы до фона истории и
          закрыл оба окна разом. */}
      {refundFor && (
        <div onClick={e => e.stopPropagation()}>
          <RefundModal
            tx={refundFor}
            studentName={studentName}
            onClose={() => setRefundFor(null)}
            onSuccess={() => { load(); onRefunded?.(); }}
          />
        </div>
      )}
    </div>
  );
};

export default PaymentHistoryModal;
