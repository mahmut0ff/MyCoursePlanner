import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiCreateTransaction } from '../../lib/api';
import { CreditCard, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { CURRENCY_SUFFIX, formatMoney } from '../../lib/money';
import { orgDayKey, isDebtBearingPlan, planDebt } from '../../lib/payment-plans';
import { PAYMENT_METHODS } from '../../pages/finances/expenseCategories';

/**
 * Насколько глубоко в прошлое можно поставить дату оплаты. Дублирует константу
 * api-finance-transactions намеренно: здесь это ТОЛЬКО подсказка для календаря
 * (min/max в <input type="date">), а правило живёт на сервере и проверяется там.
 */
const MAX_BACKDATE_DAYS = 60;

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

// Через общее правило, а не своей арифметикой: списанный счёт остатка не имеет,
// а приём оплаты по нему воскрешает списание (сервер разрешает revive на доходе).
const debtOf = (p: PayablePlan) => (isDebtBearingPlan(p) ? planDebt(p) : 0);

/**
 * Единственное место, где принимается оплата. Раньше эта форма жила инлайном в
 * IncomeTab и была скопирована в карточку студента — копия успела разойтись с
 * оригиналом и перестала писать paymentMethod, из-за чего оплаты из профиля
 * приходили в кассу без способа оплаты.
 */
const AcceptPaymentModal: React.FC<Props> = ({ plans, studentName, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [planId, setPlanId] = useState(plans[0]?.id || '');
  const plan = plans.find(p => p.id === planId) || plans[0];
  const debt = plan ? debtOf(plan) : 0;

  const [amount, setAmount] = useState(String(debt));
  const [method, setMethod] = useState('cash');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  // Границы календаря считаем в дне ОРГАНИЗАЦИИ, а не браузера: рынок — UTC+6,
  // и машина в другой зоне сдвинула бы «сегодня» на сутки, из-за чего кассир
  // либо не смог бы поставить сегодняшнее число, либо поставил бы завтрашнее.
  const today = orgDayKey();
  const earliestDate = orgDayKey(new Date(Date.now() - MAX_BACKDATE_DAYS * 86_400_000));
  const [date, setDate] = useState(today);
  const [dateError, setDateError] = useState('');
  // Отказ сервера показываем В ОКНЕ, а не только тостом: 409 про закрытую
  // зарплатную ведомость — это текст, который нужно дочитать и осмыслить,
  // а тост исчезает раньше, чем его успевают прочесть.
  const [submitError, setSubmitError] = useState('');

  // Смена счёта переставляет сумму на остаток нового — иначе можно молча
  // отправить остаток от предыдущего.
  const selectPlan = (id: string) => {
    setPlanId(id);
    const next = plans.find(p => p.id === id);
    if (next) setAmount(String(debtOf(next)));
  };

  const name = studentName || plan?.studentName || plan?.studentId || '';

  /** Русская причина, почему такую дату принимать нельзя, или '' если можно. */
  const dateProblem = (): string => {
    if (!date || Number.isNaN(new Date(date).getTime())) {
      return t('finances.dateInvalid', 'Укажите корректную дату');
    }
    if (date > today) {
      return t('finances.dateFuture', 'Дата оплаты не может быть в будущем — деньги ещё не поступили');
    }
    if (date < earliestDate) {
      return t('finances.dateTooOld', 'Задним числом можно провести не более 60 дней. Более старая запись — это исправление отчётности, а не касса.');
    }
    return '';
  };

  const handlePay = async () => {
    if (!plan || !amount || Number(amount) <= 0) return;
    // Проверяем до конструктора Date: пустой input даёт '', и new Date('') бросил бы.
    const problem = dateProblem();
    if (problem) { setDateError(problem); return; }
    setSaving(true);
    setSubmitError('');
    try {
      await apiCreateTransaction({
        type: 'income',
        amount: Number(amount),
        // Дата, КОГДА студент отдал деньги, а не когда их вносят в систему.
        // Раньше здесь стояло new Date().toISOString(), и оплата понедельника,
        // внесённая в четверг, ложилась в кассу четвергом — отчёты за оба дня
        // расходились с реальностью, и академия не могла это исправить.
        date: new Date(date).toISOString(),
        categoryId: 'course_fee',
        paymentPlanId: plan.id,
        studentId: plan.studentId,
        // courseId переносится со счёта: именно по нему считается прибыльность
        // курса. С тех пор как счёт хранит настоящий курс, а не 'general',
        // доход наконец попадает в нужную строку отчёта.
        courseId: plan.courseId,
        // paymentMethod обязателен: на нём держится разбивка по кассе.
        paymentMethod: method,
        description: comment || `${t('finances.paymentFor', 'Оплата')}: ${name}`,
      });
      toast.success(t('finances.paymentAccepted', 'Оплата принята'));
      onSuccess();
      onClose();
    } catch (e: any) {
      setSubmitError(e.message || t('finances.error', 'Ошибка'));
      toast.error(e.message || t('finances.error', 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  if (!plan) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('finances.acceptPayment', 'Принять оплату')}</h2>
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
                    {p.courseName || p.courseId || t('finances.plan', 'Счёт')} — {t('finances.remainder', 'остаток')} {formatMoney(debtOf(p))}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-slate-500 mt-1">{plan.courseName || plan.courseId}</p>
            )}
            <div className="flex justify-between mt-3 text-sm">
              <span className="text-slate-500">{t('finances.remainderLabel', 'Остаток')}:</span>
              <span className="font-bold text-amber-600">{formatMoney(debt)}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('finances.amount', 'Сумма')} ({CURRENCY_SUFFIX})
            </label>
            <input
              type="number" autoFocus min="1" max={debt}
              value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold dark:text-white"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('finances.paymentDate', 'Дата оплаты')}
            </label>
            <input
              type="date"
              value={date}
              min={earliestDate}
              max={today}
              onChange={e => { setDate(e.target.value); if (dateError) setDateError(''); }}
              aria-invalid={!!dateError}
              className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-3 py-2.5 text-sm dark:text-white ${
                dateError ? 'border-rose-400 dark:border-rose-500' : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            {dateError
              ? <p className="text-xs text-rose-500 mt-1">{dateError}</p>
              : <p className="text-[11px] text-slate-400 mt-1">
                  {t('finances.paymentDateHint', 'Когда студент реально отдал деньги, а не когда вы вносите оплату в систему.')}
                </p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('finances.paymentMethod', 'Способ оплаты')}</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white">
                {PAYMENT_METHODS.map(m => (
                  <option key={m.id} value={m.id}>{m.icon} {t(m.labelKey, m.fallback)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('finances.comment', 'Комментарий')}</label>
              <input type="text" value={comment} onChange={e => setComment(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white"
                placeholder={t('finances.commentPlaceholder', 'Например: оплата за март')}
              />
            </div>
          </div>
          {submitError && (
            <p className="text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-900/20 border border-rose-200/60 dark:border-rose-700/30 rounded-xl px-3 py-2">
              {submitError}
            </p>
          )}
        </div>
        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">{t('finances.cancel', 'Отмена')}</button>
          <button onClick={handlePay} disabled={saving || !amount || Number(amount) <= 0}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            {saving ? t('finances.saving', 'Сохранение...') : t('finances.confirmPayment', 'Подтвердить оплату')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AcceptPaymentModal;
