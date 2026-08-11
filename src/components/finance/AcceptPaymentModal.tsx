import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiCreateTransaction, apiUpdatePaymentPlan } from '../../lib/api';
import { CreditCard, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { CURRENCY_SUFFIX, formatMoney, formatMonthKey } from '../../lib/money';
import { orgDayKey, isDebtBearingPlan, isWrittenOffPlan, planDebt, planPeriodKey } from '../../lib/payment-plans';
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
  /** Поля, по которым planPeriodKey определяет месяц начисления, — для подписи счёта. */
  period?: string;
  deadline?: unknown;
  createdAt?: string;
  status?: string;
}

interface Props {
  /** Счета с непогашенным остатком. Больше одного — сверху появляется выбор. */
  plans: PayablePlan[];
  /**
   * Какой счёт открыть. Без него окно вставало на plans[0] — и кнопка «Принять
   * оплату» у КОНКРЕТНОЙ строки списка открывала чужой счёт: жмут на июле с
   * остатком 3 000, а окно показывает август с остатком 5 000 и предзаполняет
   * его. Даже исправив сумму вручную, кассир зачислял деньги не в тот месяц, и
   * июль оставался просроченным. Расхождение было видно только по цифре
   * остатка — в выпадающем списке месяц не назывался вовсе.
   */
  initialPlanId?: string;
  studentName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

/** «Английский · август 2026 г. — остаток 3 000 с.» — месяц обязателен: без него
 *  два помесячных счёта по одному курсу в списке неразличимы. */
const planOptionLabel = (p: PayablePlan, fallback: string, remainderWord: string): string => {
  const month = formatMonthKey(planPeriodKey(p));
  const course = p.courseName || p.courseId || fallback;
  return `${course}${month ? ` · ${month}` : ''} — ${remainderWord} ${formatMoney(debtOf(p))}`;
};

// Через общее правило, а не своей арифметикой: списанный счёт остатка не имеет,
// а приём оплаты по нему воскрешает списание (сервер разрешает revive на доходе).
const debtOf = (p: PayablePlan) => (isDebtBearingPlan(p) ? planDebt(p) : 0);

/**
 * Единственное место, где принимается оплата. Раньше эта форма жила инлайном в
 * IncomeTab и была скопирована в карточку студента — копия успела разойтись с
 * оригиналом и перестала писать paymentMethod, из-за чего оплаты из профиля
 * приходили в кассу без способа оплаты.
 */
const AcceptPaymentModal: React.FC<Props> = ({ plans, initialPlanId, studentName, onClose, onSuccess }) => {
  const { t } = useTranslation();
  // Открываемся на запрошенном счёте; plans[0] — фолбэк для точек входа, где
  // конкретного счёта нет (кнопка в шапке карточки, мобильная панель).
  const [planId, setPlanId] = useState(
    (initialPlanId && plans.some(p => p.id === initialPlanId) ? initialPlanId : plans[0]?.id) || ''
  );
  const plan = plans.find(p => p.id === planId) || plans[0];
  const debt = plan ? debtOf(plan) : 0;

  const [amount, setAmount] = useState(String(debt));
  const [method, setMethod] = useState('cash');
  const [comment, setComment] = useState('');
  // «Оплачено полностью»: студент платит по скидке, остаток — не долг. Закрываем
  // счёт по факту (см. settle на сервере), а не оставляем «Частично».
  const [settle, setSettle] = useState(false);
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
    setSettle(false);
    // Согласие поднять сумму относилось к прежнему счёту — на новом его нет.
    setRaiseTotal(false);
    const next = plans.find(p => p.id === id);
    if (next) setAmount(String(debtOf(next)));
  };

  // Остаток, который спишется скидкой, если отметить «оплачено полностью».
  const discountPreview = settle ? Math.max(0, debt - (Number(amount) || 0)) : 0;

  // ── Переплата ──
  // `max` на <input type="number"> не мешает отправке формы — это подсказка
  // для стрелок и валидации браузера, которую React-обработчик не спрашивает.
  // Поэтому лишний ноль (50 000 вместо 5 000) проходил молча: счёт зеленел
  // «Оплачено», planDebt зажимался в ноль, и в списке переплата ничем не
  // отличалась от обычной оплаты. Кассир своей ошибки не видел вовсе — сводный
  // тайл «Собрано за месяц» показывают только с правом finance_overview.
  const entered = Number(amount);
  const isOverpay = Number.isFinite(entered) && debt > 0 && entered > debt;

  // ── Индивидуальная цена ──
  // Часть студентов занимается дороже прайса курса, а счёт выставляется по
  // цене курса — и внести их реальную оплату было нельзя вообще: потолок
  // отвергал всё, что выше остатка, а поднять сумму счёта отсюда было негде.
  // Совет из старого текста ошибки («излишек — оплатой за следующий месяц»)
  // для этого случая неверен: деньги не за следующий месяц.
  //
  // Поэтому предлагаем поднять сумму счёта до внесённой — явной отметкой, а не
  // молча: именно эта явность и отличает договорную цену от лишнего нуля.
  // Правка переносится на следующие месяцы (см. lastAmountByKey в MonthTab),
  // так что повторять её каждый месяц не придётся.
  //
  // Списанный счёт так поднимать нельзя — это воскресило бы списание, ровно как
  // и у settle. Для него остаётся прежний запрет.
  const canRaiseTotal = plan ? !isWrittenOffPlan(plan) : false;
  const [raiseTotal, setRaiseTotal] = useState(false);
  const applyRaise = isOverpay && canRaiseTotal && raiseTotal;
  // Новая сумма к оплате = уже оплаченное + вносимое, чтобы остаток совпал с
  // платежом ровно и серверный потолок пропустил его.
  const raisedTotal = applyRaise ? (Number(plan?.paidAmount) || 0) + entered : 0;
  const blockedByOverpay = isOverpay && !applyRaise;

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
    if (!plan || !amount || Number(amount) <= 0 || blockedByOverpay) return;
    // Проверяем до конструктора Date: пустой input даёт '', и new Date('') бросил бы.
    const problem = dateProblem();
    if (problem) { setDateError(problem); return; }
    setSaving(true);
    setSubmitError('');
    try {
      // Сумму счёта поднимаем ДО платежа: серверный потолок считает остаток по
      // свежему документу и иначе отверг бы оплату. Если этот шаг не прошёл —
      // платёж не отправляем вовсе, иначе он упёрся бы в тот же потолок и
      // кассир увидел бы невнятный отказ вместо причины.
      if (applyRaise) {
        try {
          await apiUpdatePaymentPlan(plan.id, { totalAmount: raisedTotal });
        } catch (e: any) {
          const msg = e?.message || t('finances.error', 'Ошибка');
          setSubmitError(t('finances.raiseFailed', 'Не удалось поднять сумму счёта: {{msg}}', { msg }));
          setSaving(false);
          return;
        }
      }

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
      // Платёж проведён. Списание остатка скидкой — отдельный, необязательный шаг:
      // его провал не должен выглядеть как провал оплаты, иначе повтор задвоил бы
      // платёж. Поэтому у него свой try, а не общий catch ниже.
      if (settle && Number(amount) < debt) {
        try {
          await apiUpdatePaymentPlan(plan.id, { settle: true });
        } catch {
          toast.error(t('finances.settleFailed', 'Оплата принята, но остаток не списан скидкой — измените «к оплате» вручную.'));
        }
      }
      toast.success(t('finances.paymentAccepted', 'Оплата принята'));
      onSuccess();
      onClose();
    } catch (e: any) {
      const msg = e.message || t('finances.error', 'Ошибка');
      // Сумму подняли, а платёж не прошёл (закрытая ведомость, сеть) — счёт
      // остался бы раздутым, и студент получил бы долг, которого он не делал.
      // Возвращаем прежнюю сумму; если и это не вышло, говорим об этом прямо,
      // потому что молчание здесь стоит денег.
      if (applyRaise) {
        try {
          await apiUpdatePaymentPlan(plan.id, { totalAmount: Number(plan.totalAmount) || 0 });
        } catch {
          setSubmitError(t('finances.raiseRollbackFailed', 'Оплата не прошла ({{msg}}), а сумма счёта осталась поднятой до {{total}}. Верните её вручную через «Сумму к оплате».', { msg, total: formatMoney(raisedTotal) }));
          toast.error(msg);
          return;
        }
      }
      setSubmitError(msg);
      toast.error(msg);
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
                    {planOptionLabel(p, t('finances.plan', 'Счёт'), t('finances.remainder', 'остаток'))}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-slate-500 mt-1">
                {plan.courseName || plan.courseId}
                {formatMonthKey(planPeriodKey(plan)) && ` · ${formatMonthKey(planPeriodKey(plan))}`}
              </p>
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
              // Без max: сумма выше остатка — законный случай (договорная цена),
              // и браузерная валидация мешала бы её набрать. Правило живёт ниже,
              // в blockedByOverpay, и на сервере.
              type="number" autoFocus min="1"
              value={amount} onChange={e => setAmount(e.target.value)}
              aria-invalid={blockedByOverpay}
              className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-4 py-3 text-lg font-bold dark:text-white ${
                blockedByOverpay ? 'border-rose-400 dark:border-rose-500' : 'border-slate-200 dark:border-slate-700'
              }`}
              placeholder="0"
            />
            {isOverpay && (
              <p className={`text-xs mt-1 ${applyRaise ? 'text-slate-500 dark:text-slate-400' : 'text-rose-500'}`}>
                {applyRaise
                  ? t('finances.overpayRaising', 'Сумма счёта станет {{total}} — столько этот студент и платит.', { total: formatMoney(raisedTotal) })
                  : t('finances.overpayNeedsChoice', 'Это больше остатка ({{debt}}). Если у студента договорная цена — отметьте ниже, и сумма счёта поднимется. Если он платит вперёд, проведите излишек отдельной оплатой по счёту следующего месяца.', { debt: formatMoney(debt) })}
              </p>
            )}
          </div>

          {/* Договорная цена: студент платит БОЛЬШЕ прайса курса. Поднимаем сумму
              счёта до внесённой — зеркало «оплачено полностью» на другую сторону. */}
          {isOverpay && canRaiseTotal && (
            <label className="flex items-start gap-2.5 cursor-pointer select-none bg-amber-50 dark:bg-amber-900/15 rounded-xl px-3 py-2.5 border border-amber-200 dark:border-amber-800/40">
              <input
                type="checkbox"
                checked={raiseTotal}
                onChange={e => setRaiseTotal(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-amber-500"
              />
              <span className="text-xs text-amber-900 dark:text-amber-200 leading-snug">
                {t('finances.raiseTotalToPaid', 'Индивидуальная цена — поднять сумму счёта до внесённой')}
                <span className="block text-[11px] text-amber-700 dark:text-amber-300/80 mt-0.5">
                  {t('finances.raiseTotalHint', 'Новая сумма перенесётся на следующие месяцы — каждый раз править не придётся.')}
                </span>
              </span>
            </label>
          )}
          {/* Скидка: студент платит меньше остатка, и это НЕ долг. Отметка
              закрывает счёт по факту оплаты, остаток уходит в скидку. */}
          {debt > 0 && !isOverpay && (
            <label className="flex items-start gap-2.5 cursor-pointer select-none bg-slate-50 dark:bg-slate-900/40 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700">
              <input
                type="checkbox"
                checked={settle}
                onChange={e => setSettle(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-emerald-500"
              />
              <span className="text-xs text-slate-600 dark:text-slate-300 leading-snug">
                {t('finances.settleInFull', 'Оплачено полностью — остаток списать как скидку')}
                {discountPreview > 0 && (
                  <span className="block text-[11px] font-bold text-emerald-600 mt-0.5">
                    {t('finances.discount', 'Скидка')}: {formatMoney(discountPreview)}
                  </span>
                )}
              </span>
            </label>
          )}
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
          <button onClick={handlePay} disabled={saving || !amount || Number(amount) <= 0 || blockedByOverpay}
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
