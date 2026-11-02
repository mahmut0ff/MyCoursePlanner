import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiCreateTransaction } from '../../lib/api';
import { Undo2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { CURRENCY_SUFFIX, formatMoney } from '../../lib/money';
import { orgDayKey } from '../../lib/payment-plans';
import { numericDateLocale } from '../../lib/locale';
import { PAYMENT_METHODS } from '../../pages/finances/expenseCategories';

/**
 * Насколько глубоко в прошлое можно поставить дату возврата. Дублирует константу
 * api-finance-transactions намеренно: здесь это ТОЛЬКО подсказка для календаря
 * (min/max в <input type="date">), а правило живёт на сервере и проверяется там.
 */
const MAX_BACKDATE_DAYS = 60;

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
  const { t } = useTranslation();
  const [amount, setAmount] = useState(String(tx.amount || 0));
  const [method, setMethod] = useState('cash');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  // День организации, а не браузера — см. тот же комментарий в AcceptPaymentModal.
  const today = orgDayKey();
  const earliestDate = orgDayKey(new Date(Date.now() - MAX_BACKDATE_DAYS * 86_400_000));
  const [date, setDate] = useState(today);
  const [dateError, setDateError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const value = Number(amount);
  // Вернуть больше, чем было заплачено этой транзакцией, нельзя — иначе
  // «возврат» превращается в произвольную выдачу денег из кассы.
  const invalid = !amount || value <= 0 || value > tx.amount;

  /** Русская причина, почему такую дату принимать нельзя, или '' если можно. */
  const dateProblem = (): string => {
    if (!date || Number.isNaN(new Date(date).getTime())) {
      return t('finances.dateInvalid', 'Укажите корректную дату');
    }
    if (date > today) {
      return t('finances.refundDateFuture', 'Дата возврата не может быть в будущем — деньги ещё не выданы');
    }
    if (date < earliestDate) {
      return t('finances.dateTooOld', 'Задним числом можно провести не более 60 дней. Более старая запись — это исправление отчётности, а не касса.');
    }
    return '';
  };

  const handleRefund = async () => {
    if (invalid) return;
    // Проверяем до конструктора Date: пустой input даёт '', и new Date('') бросил бы.
    const problem = dateProblem();
    if (problem) { setDateError(problem); return; }
    setSaving(true);
    setSubmitError('');
    try {
      await apiCreateTransaction({
        type: 'expense',
        amount: value,
        // Дата, КОГДА деньги реально вернули из кассы, а не когда возврат
        // оформляют в системе: хардкод new Date() ставил день ввода и разводил
        // кассовый отчёт с тем, что было в ящике.
        date: new Date(date).toISOString(),
        categoryId: 'refund',
        // Связь с возвращаемой оплатой. По ней сервер суммирует уже проведённые
        // возвраты и не даёт вернуть больше, чем было получено: без неё возврат
        // был безымянным расходом, и один и тот же платёж возвращался дважды.
        refundOfTransactionId: tx.id,
        paymentPlanId: tx.paymentPlanId,
        studentId: tx.studentId,
        courseId: tx.courseId,
        paymentMethod: method,
        description: comment || `${t('finances.refund', 'Возврат')}: ${studentName}`,
      });
      toast.success(t('finances.refundDone', 'Возврат оформлен'));
      onSuccess();
      onClose();
    } catch (e: any) {
      setSubmitError(e.message || t('finances.error', 'Ошибка'));
      toast.error(e.message || t('finances.error', 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  const paidOn = new Date(tx.date || tx.createdAt || Date.now()).toLocaleDateString(numericDateLocale());

  return (
    <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-[480px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('finances.refundTitle', 'Возврат средств')}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="px-4 py-2 space-y-3">
          <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            <p className="font-medium text-slate-900 dark:text-white">{studentName}</p>
            <div className="flex justify-between mt-2 text-sm">
              <span className="text-slate-500">{t('finances.paymentDated', 'Оплата от')} {paidOn}:</span>
              <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(tx.amount)}</span>
            </div>
          </div>

          <div>
            <label className="label">
              {t('finances.refundAmount', 'Сумма возврата')} ({CURRENCY_SUFFIX})
            </label>
            <input
              type="number" autoFocus min="1" max={tx.amount}
              value={amount} onChange={e => setAmount(e.target.value)}
              className="input font-medium tabular-nums"
            />
            {value > tx.amount && (
              <p className="text-[11px] text-red-500 mt-1">
                {t('finances.refundTooLarge', 'Больше суммы этой оплаты — максимум')} {formatMoney(tx.amount)}
              </p>
            )}
          </div>

          <div>
            <label className="label">
              {t('finances.refundDate', 'Дата возврата')}
            </label>
            <input
              type="date"
              value={date}
              min={earliestDate}
              max={today}
              onChange={e => { setDate(e.target.value); if (dateError) setDateError(''); }}
              aria-invalid={!!dateError}
              className={`input ${
                dateError ? 'border-rose-400 dark:border-rose-500' : ''
              }`}
            />
            {dateError
              ? <p className="text-xs text-rose-500 mt-1">{dateError}</p>
              : <p className="text-[11px] text-slate-400 mt-1">
                  {t('finances.refundDateHint', 'Когда деньги реально вернули студенту, а не когда оформляете возврат в системе.')}
                </p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('finances.method', 'Способ')}</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="input">
                {PAYMENT_METHODS.map(m => (
                  <option key={m.id} value={m.id}>{m.icon} {t(m.labelKey, m.fallback)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('finances.reason', 'Причина')}</label>
              <input type="text" value={comment} onChange={e => setComment(e.target.value)}
                className="input"
                placeholder={t('finances.refundReasonPlaceholder', 'Отказ от курса...')}
              />
            </div>
          </div>

          <p className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/30 rounded-lg px-3 py-2">
            {t('finances.refundNote', 'Возврат попадёт в «Расходы», а по счёту снова появится долг на эту сумму. Исходная оплата останется в истории.')}
          </p>

          {submitError && (
            <p className="text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-900/20 border border-rose-200/60 dark:border-rose-700/30 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}
        </div>
        <div className="px-4 pt-2 pb-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">{t('finances.cancel', 'Отмена')}</button>
          <button onClick={handleRefund} disabled={saving || invalid}
            className="btn-danger inline-flex items-center gap-1.5">
            <Undo2 className="w-3.5 h-3.5" />
            {saving ? t('finances.processing', 'Оформление...') : t('finances.submitRefund', 'Оформить возврат')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RefundModal;
