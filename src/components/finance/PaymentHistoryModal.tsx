import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGetTransactions } from '../../lib/api';
import { CreditCard, Undo2, X } from 'lucide-react';
import type { PayablePlan } from './AcceptPaymentModal';
import RefundModal, { type RefundableTx } from './RefundModal';
import { formatMoney, formatMoneySigned } from '../../lib/money';
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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('finances.paymentHistory', 'История оплат')}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{studentName}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          {plan ? (
            <div className="mb-5">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500">{t('finances.paymentProgress', 'Прогресс оплаты')}</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatMoney(plan.paidAmount)} / {formatMoney(plan.totalAmount)}
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${plan.totalAmount > 0 ? Math.min(100, (plan.paidAmount / plan.totalAmount) * 100) : 0}%` }} />
              </div>
            </div>
          ) : !loading && history.length > 0 && (
            // По студенту прогресса нет — счетов может быть несколько, поэтому
            // осмысленная сводка здесь только одна: сколько всего заплачено.
            <div className="mb-5 flex justify-between text-sm">
              <span className="text-slate-500">
                {refunded
                  ? t('finances.paidNetOfRefunds', 'Оплачено за вычетом возвратов')
                  : t('finances.paidTotal', 'Всего оплачено')}
              </span>
              <span className="font-bold text-emerald-600">{formatMoney(net)}</span>
            </div>
          )}

          {loading ? (
            <div className="py-6 text-center text-slate-500 animate-pulse">{t('finances.loading', 'Загрузка...')}</div>
          ) : history.length === 0 ? (
            <div className="py-6 text-center text-slate-400">{t('finances.noPaymentHistory', 'Нет истории оплат')}</div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {history.map(tx => {
                const isRefund = tx.type === 'expense';
                return (
                  <div key={tx.id} className="flex items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg ${isRefund ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                        {isRefund ? <Undo2 className="w-4 h-4 text-rose-600" /> : <CreditCard className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${isRefund ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                          {formatMoneySigned(isRefund ? -(tx.amount || 0) : tx.amount)}
                          {isRefund && (
                            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide">
                              {t('finances.refundBadge', 'возврат')}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {new Date(tx.date || tx.createdAt).toLocaleDateString()}
                          {tx.paymentMethod && <span className="ml-1.5">· {methodIcon(tx.paymentMethod)}</span>}
                          {tx.description && <span className="ml-1.5">· {tx.description}</span>}
                        </p>
                      </div>
                    </div>
                    {canRefund && !isRefund && (
                      <button
                        onClick={() => setRefundFor(tx)}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 transition-colors"
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
