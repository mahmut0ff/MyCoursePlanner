import React, { useEffect, useState } from 'react';
import { apiGetTransactions } from '../../lib/api';
import { CreditCard, X } from 'lucide-react';
import type { PayablePlan } from './AcceptPaymentModal';

interface Props {
  /** Один счёт — с полосой прогресса. Взаимоисключимо со studentId. */
  plan?: PayablePlan;
  /** Все оплаты студента по всем его счетам. */
  studentId?: string;
  studentName: string;
  onClose: () => void;
}

const methodIcon = (m?: string) => (m === 'card' ? '💳' : m === 'transfer' ? '🏦' : '💵');

const PaymentHistoryModal: React.FC<Props> = ({ plan, studentId, studentName, onClose }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Оба фильтра серверные — тянуть всю кассу ради одной карточки не нужно.
    const filters = plan ? { paymentPlanId: plan.id } : { studentId, type: 'income' };
    apiGetTransactions(filters as any)
      .then((txs: any) => setHistory(Array.isArray(txs) ? txs.filter((t: any) => t.type === 'income') : []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [plan, studentId]);

  const total = history.reduce((sum, tx) => sum + (tx.amount || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">История оплат</h2>
            <p className="text-sm text-slate-500 mt-0.5">{studentName}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          {plan ? (
            <div className="mb-5">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500">Прогресс оплаты</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {plan.paidAmount.toLocaleString()} / {plan.totalAmount.toLocaleString()} с.
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
              <span className="text-slate-500">Всего оплачено</span>
              <span className="font-bold text-emerald-600">{total.toLocaleString()} с.</span>
            </div>
          )}

          {loading ? (
            <div className="py-6 text-center text-slate-500 animate-pulse">Загрузка...</div>
          ) : history.length === 0 ? (
            <div className="py-6 text-center text-slate-400">Нет истории оплат</div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {history.map(tx => (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">+{tx.amount?.toLocaleString()} с.</p>
                      <p className="text-xs text-slate-500">
                        {new Date(tx.date || tx.createdAt).toLocaleDateString()}
                        {tx.paymentMethod && <span className="ml-1.5">· {methodIcon(tx.paymentMethod)}</span>}
                      </p>
                    </div>
                  </div>
                  {tx.description && <p className="text-xs text-slate-400 max-w-[140px] truncate">{tx.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentHistoryModal;
