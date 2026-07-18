import React, { useState } from 'react';
import { apiCreateTransaction } from '../../lib/api';
import { CreditCard, X } from 'lucide-react';
import toast from 'react-hot-toast';

export interface PayablePlan {
  id: string;
  studentId: string;
  studentName?: string;
  courseId?: string;
  courseName?: string;
  totalAmount: number;
  paidAmount: number;
}

interface Props {
  /** Счета с непогашенным остатком. Больше одного — сверху появляется выбор. */
  plans: PayablePlan[];
  studentName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const debtOf = (p: PayablePlan) => Math.max(0, (p.totalAmount || 0) - (p.paidAmount || 0));

/**
 * Единственное место, где принимается оплата. Раньше эта форма жила инлайном в
 * IncomeTab и была скопирована в карточку студента — копия успела разойтись с
 * оригиналом и перестала писать paymentMethod, из-за чего оплаты из профиля
 * приходили в кассу без способа оплаты.
 */
const AcceptPaymentModal: React.FC<Props> = ({ plans, studentName, onClose, onSuccess }) => {
  const [planId, setPlanId] = useState(plans[0]?.id || '');
  const plan = plans.find(p => p.id === planId) || plans[0];
  const debt = plan ? debtOf(plan) : 0;

  const [amount, setAmount] = useState(String(debt));
  const [method, setMethod] = useState('cash');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  // Смена счёта переставляет сумму на остаток нового — иначе можно молча
  // отправить остаток от предыдущего.
  const selectPlan = (id: string) => {
    setPlanId(id);
    const next = plans.find(p => p.id === id);
    if (next) setAmount(String(debtOf(next)));
  };

  const name = studentName || plan?.studentName || plan?.studentId || '';

  const handlePay = async () => {
    if (!plan || !amount || Number(amount) <= 0) return;
    setSaving(true);
    try {
      await apiCreateTransaction({
        type: 'income',
        amount: Number(amount),
        date: new Date().toISOString(),
        categoryId: 'course_fee',
        paymentPlanId: plan.id,
        studentId: plan.studentId,
        courseId: plan.courseId,
        paymentMethod: method,
        description: comment || `Оплата: ${name}`,
      });
      toast.success('Оплата принята');
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (!plan) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Принять оплату</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4">
            <p className="font-medium text-slate-900 dark:text-white">{name}</p>
            {plans.length > 1 ? (
              <select
                value={planId}
                onChange={e => selectPlan(e.target.value)}
                className="w-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm"
              >
                {plans.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.courseName || p.courseId || 'Счёт'} — остаток {debtOf(p).toLocaleString()} с.
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-slate-500 mt-1">{plan.courseName || plan.courseId}</p>
            )}
            <div className="flex justify-between mt-3 text-sm">
              <span className="text-slate-500">Остаток:</span>
              <span className="font-bold text-amber-600">{debt.toLocaleString()} с.</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Сумма (с.)</label>
            <input
              type="number" autoFocus min="1" max={debt}
              value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold dark:text-white"
              placeholder="0"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Способ оплаты</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white">
                <option value="cash">💵 Наличные</option>
                <option value="card">💳 Карта</option>
                <option value="transfer">🏦 Перевод</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Комментарий</label>
              <input type="text" value={comment} onChange={e => setComment(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white"
                placeholder="Наличные / Перевод..."
              />
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">Отмена</button>
          <button onClick={handlePay} disabled={saving || !amount || Number(amount) <= 0}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            {saving ? 'Сохранение...' : 'Подтвердить оплату'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AcceptPaymentModal;
