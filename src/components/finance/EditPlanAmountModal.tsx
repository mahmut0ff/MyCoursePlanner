import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiUpdatePaymentPlan, apiSetStudentTuition } from '../../lib/api';
import { CURRENCY_SUFFIX, formatMoney } from '../../lib/money';

export interface EditablePlan {
  id: string;
  /** Нужен, чтобы правку можно было запомнить договорной ценой студента. */
  studentId?: string;
  studentName?: string;
  courseName?: string;
  courseId?: string;
  totalAmount: number;
  paidAmount?: number;
  listAmount?: number;
}

interface Props {
  plan: EditablePlan;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * «Сумма к оплате» у конкретного счёта — отдельно от цены курса.
 *
 * Ровно то, чего не хватало: цена приходит из курса, но студент может учиться по
 * скидке. Тогда его сумма к оплате ниже прайсовой, а разница — СКИДКА, а не долг.
 * Меняем один totalAmount; долг, статус и «оплачено/не оплачено» на всех экранах
 * пересчитываются из него общими предикатами (planDebt/derivePlanStatus) — своей
 * арифметики нет. Опустить ниже уже оплаченного нельзя: это возврат, не скидка,
 * и у него отдельный поток (RefundModal). Сервер это правило тоже проверяет.
 */
const EditPlanAmountModal: React.FC<Props> = ({ plan, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const paid = Math.max(0, Number(plan.paidAmount) || 0);
  // Прайсовая (полная) цена — база для скидки. У свежих счетов это listAmount
  // (цена курса на момент выставления); у легаси его нет — берём текущую сумму.
  const reference = Number.isFinite(Number(plan.listAmount))
    ? Number(plan.listAmount)
    : (Number(plan.totalAmount) || 0);

  const [amount, setAmount] = useState(String(Number(plan.totalAmount) || 0));
  const [saving, setSaving] = useState(false);
  /**
   * Запомнить правку договорной ценой студента.
   *
   * Выключено по умолчанию НАМЕРЕННО. Правка суммы месяца — чаще всего разовая
   * уступка («в этот раз простим 500»), и делать из неё постоянную цену молча
   * значит навсегда снизить платёж, пока кто-нибудь случайно не заметит. Та же
   * причина, по которой у «оплачено полностью» есть отдельная пометка
   * settledByDiscount. Постоянная цена — осознанный выбор, поэтому галочка.
   */
  const [remember, setRemember] = useState(false);
  // Ставка адресуется паре «студент × курс»; счёт вне курса ('general') такой
  // пары не образует — запоминать его не за что.
  const canRemember = !!plan.studentId && !!plan.courseId && plan.courseId !== 'general';

  const value = Number(amount);
  const parsed = amount !== '' && Number.isFinite(value);
  const belowPaid = parsed && value < paid;
  const valid = parsed && value >= 0 && value >= paid;
  const discount = parsed ? Math.max(0, reference - value) : 0;
  // Обратная сторона скидки: студент занимается дороже прайса. Отдельного поля
  // под это нет и не нужно — сумма к оплате и есть его цена, а разница выводится.
  const surcharge = parsed ? Math.max(0, value - reference) : 0;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await apiUpdatePaymentPlan(plan.id, { totalAmount: value });
      toast.success(t('finances.amountSaved', 'Сумма к оплате обновлена'));
      if (remember && canRemember) {
        // Отдельным вызовом и в отдельном try: сумма месяца уже сохранена, и
        // отказ на второй ручке не должен выглядеть провалом первой — иначе
        // менеджер повторит правку по счёту, где она уже применена.
        try {
          await apiSetStudentTuition({
            studentIds: [plan.studentId!],
            courseId: plan.courseId!,
            amount: value,
            // Этот счёт уже обновлён выше; трогать соседние месяцы правка
            // одного месяца не должна.
            applyToUnpaid: false,
          });
          toast.success(t('finances.tuitionRemembered', 'Сумма запомнена как договорная цена'));
        } catch (e: any) {
          toast.error(e?.message || t('finances.tuitionRememberFailed', 'Сумма месяца сохранена, но договорную цену записать не удалось'));
        }
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || t('finances.error', 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-[480px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            {t('finances.editAmountTitle', 'Сумма к оплате')}
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700"><X className="w-3.5 h-3.5" /></button>
        </div>

        <div className="px-4 py-2 space-y-3">
          <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            {plan.studentName && <p className="font-medium text-slate-900 dark:text-white">{plan.studentName}</p>}
            <p className="text-sm text-slate-500 mt-0.5">{plan.courseName || plan.courseId || t('finances.plan', 'Счёт')}</p>
            <div className="flex justify-between mt-3 text-sm">
              <span className="text-slate-500">{t('finances.coursePrice', 'Цена курса')}:</span>
              <span className="font-medium tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(reference)}</span>
            </div>
            {paid > 0 && (
              <div className="flex justify-between mt-1 text-sm">
                <span className="text-slate-500">{t('finances.colPaid', 'Оплачено')}:</span>
                <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(paid)}</span>
              </div>
            )}
          </div>

          <div>
            <label className="label">
              {t('finances.amountDue', 'К оплате')} ({CURRENCY_SUFFIX})
            </label>
            <input
              type="number" autoFocus min={paid} step="1"
              value={amount} onChange={e => setAmount(e.target.value)}
              aria-invalid={belowPaid}
              className={`input font-medium tabular-nums ${
                belowPaid ? 'border-rose-400 dark:border-rose-500' : ''
              }`}
              placeholder="0"
            />
            {belowPaid ? (
              <p className="text-xs text-rose-500 mt-1">
                {t('finances.amountBelowPaid', 'Не может быть меньше уже оплаченного ({{paid}}).', { paid: formatMoney(paid) })}
              </p>
            ) : discount > 0 ? (
              <p className="text-xs text-emerald-600 font-medium mt-1">
                {t('finances.discount', 'Скидка')}: {formatMoney(discount)}
              </p>
            ) : surcharge > 0 ? (
              <p className="text-xs text-amber-600 font-medium mt-1">
                {t('finances.surcharge', 'Выше прайса')}: {formatMoney(surcharge)}
                <span className="block text-[11px] text-slate-400 font-normal mt-0.5">
                  {t('finances.surchargeHint', 'Станет договорной ценой этого студента и перенесётся на следующие месяцы.')}
                </span>
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 mt-1">
                {t('finances.amountDueHint', 'Реальная сумма к оплате. Ниже прайса — разница станет скидкой, а не долгом; выше — договорной ценой студента.')}
              </p>
            )}
          </div>

          {canRemember && (
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="w-3.5 h-3.5 mt-0.5 accent-primary-600 shrink-0"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {t('finances.rememberAsTuition', 'Запомнить как постоянную сумму')}
                <span className="block text-[11px] text-slate-400">
                  {t('finances.rememberAsTuitionHint', 'Студент будет платить столько и в следующие месяцы. Без галочки правка касается только этого счёта.')}
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="px-4 pt-2 pb-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">{t('finances.cancel', 'Отмена')}</button>
          <button onClick={handleSave} disabled={saving || !valid}
            className="btn-primary">
            {saving ? t('finances.saving', 'Сохранение...') : t('finances.save', 'Сохранить')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPlanAmountModal;
