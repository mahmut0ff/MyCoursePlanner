import React, { useState } from 'react';
import { apiCreateTransaction } from '../../lib/api';
import { Undo2, X } from 'lucide-react';
import toast from 'react-hot-toast';

export interface RefundableTx {
  id: string;
  amount: number;
  date?: string;
  createdAt?: string;
  description?: string;
  studentId?: string;
  courseId?: string;
  paymentPlanId?: string;
}

interface Props {
  tx: RefundableTx;
  studentName: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Возврат средств по конкретной оплате.
 *
 * В кассе это расход с категорией `refund`, а не отрицательный доход: сам доход
 * остаётся нетронутым, поэтому отчёт за уже закрытый период не переписывается
 * задним числом. Одновременно сервер снимает сумму с оплаченного по счёту, так
 * что у студента снова появляется долг.
 */
const RefundModal: React.FC<Props> = ({ tx, studentName, onClose, onSuccess }) => {
  const [amount, setAmount] = useState(String(tx.amount || 0));
  const [method, setMethod] = useState('cash');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const value = Number(amount);
  // Вернуть больше, чем было заплачено этой транзакцией, нельзя — иначе
  // «возврат» превращается в произвольную выдачу денег из кассы.
  const invalid = !amount || value <= 0 || value > tx.amount;

  const handleRefund = async () => {
    if (invalid) return;
    setSaving(true);
    try {
      await apiCreateTransaction({
        type: 'expense',
        amount: value,
        date: new Date().toISOString(),
        categoryId: 'refund',
        paymentPlanId: tx.paymentPlanId,
        studentId: tx.studentId,
        courseId: tx.courseId,
        paymentMethod: method,
        description: comment || `Возврат: ${studentName}`,
      });
      toast.success('Возврат оформлен');
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const paidOn = new Date(tx.date || tx.createdAt || Date.now()).toLocaleDateString();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Возврат средств</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
            <p className="font-medium text-slate-900 dark:text-white">{studentName}</p>
            <div className="flex justify-between mt-2 text-sm">
              <span className="text-slate-500">Оплата от {paidOn}:</span>
              <span className="font-bold text-emerald-600">{tx.amount.toLocaleString()} с.</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Сумма возврата (с.)</label>
            <input
              type="number" autoFocus min="1" max={tx.amount}
              value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold dark:text-white"
            />
            {value > tx.amount && (
              <p className="text-[11px] text-red-500 mt-1">Больше суммы этой оплаты — максимум {tx.amount.toLocaleString()} с.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Способ</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white">
                <option value="cash">💵 Наличные</option>
                <option value="card">💳 Карта</option>
                <option value="transfer">🏦 Перевод</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Причина</label>
              <input type="text" value={comment} onChange={e => setComment(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white"
                placeholder="Отказ от курса..."
              />
            </div>
          </div>

          <p className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/30 rounded-xl px-3 py-2">
            Возврат попадёт в «Расходы», а по счёту снова появится долг на эту сумму. Исходная оплата останется в истории.
          </p>
        </div>
        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">Отмена</button>
          <button onClick={handleRefund} disabled={saving || invalid}
            className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2">
            <Undo2 className="w-4 h-4" />
            {saving ? 'Оформление...' : 'Оформить возврат'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RefundModal;
