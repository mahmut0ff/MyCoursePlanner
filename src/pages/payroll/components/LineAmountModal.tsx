import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiSetPayrollLine } from '../../../lib/api';
import { CURRENCY_SUFFIX } from '../../../lib/money';
import type { PayrollLine } from '../../../types';
import { formatMinor, minorToSomInput, somInputToMinor } from '../payrollFormat';

interface Props {
  periodId: string;
  line: PayrollLine;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Правка суммы строки.
 *
 * Расчётную строку нельзя переписать — её можно только ПЕРЕОПРЕДЕЛИТЬ, и сервер
 * требует причину. Это не формальность: расчётное число остаётся видимым рядом,
 * поэтому через полгода на вопрос «почему тут не то, что посчитала система»
 * отвечает сама ведомость, а не память директора.
 *
 * Ручную премию/штраф правим напрямую: у неё нет расчётного основания, которое
 * можно было бы затереть.
 */
const LineAmountModal: React.FC<Props> = ({ periodId, line, onClose, onSaved }) => {
  const { t } = useTranslation();
  const manual = line.isManual;

  const [amount, setAmount] = useState(
    minorToSomInput(manual ? Math.abs(line.computedMinor) : (line.overrideMinor ?? line.computedMinor)),
  );
  const [reason, setReason] = useState(line.overrideReason || '');
  const [note, setNote] = useState(line.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (clearOverride: boolean) => {
    setError('');
    setSaving(true);
    try {
      if (clearOverride) {
        // null снимает правку и возвращает строку к расчётному числу.
        await apiSetPayrollLine({ periodId, lineId: line.id, overrideMinor: null });
        toast.success(t('payroll.overrideCleared', 'Правка снята'));
      } else if (manual) {
        const amountMinor = somInputToMinor(amount);
        if (amountMinor === null) {
          setError(t('payroll.badAmount', 'Укажите сумму больше нуля'));
          setSaving(false);
          return;
        }
        // Знак задаёт сервер по source — премия всегда плюс, штраф всегда минус.
        await apiSetPayrollLine({ periodId, lineId: line.id, amountMinor, note });
        toast.success(t('payroll.lineSaved', 'Строка сохранена'));
      } else {
        const overrideMinor = somInputToMinor(amount);
        if (overrideMinor === null) {
          setError(t('payroll.badAmount', 'Укажите сумму больше нуля'));
          setSaving(false);
          return;
        }
        if (!reason.trim()) {
          setError(t('payroll.needReason', 'Укажите причину изменения суммы — без неё правку нельзя проверить'));
          setSaving(false);
          return;
        }
        await apiSetPayrollLine({ periodId, lineId: line.id, overrideMinor, overrideReason: reason.trim() });
        toast.success(t('payroll.overrideSaved', 'Сумма изменена'));
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || t('payroll.saveFailed', 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-[480px] tabular-nums overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {manual ? t('payroll.editManualLine', 'Изменить строку') : t('payroll.overrideTitle', 'Изменить сумму вручную')}
          </h2>
          <button onClick={onClose} disabled={saving} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 disabled:opacity-50" aria-label={t('payroll.close', 'Закрыть')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 py-2 space-y-3">
          {error && <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 rounded-lg">{error}</div>}

          <div className="text-sm text-slate-600 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-slate-100">{line.teacherName || line.teacherId}</p>
            {!manual && (
              <p className="text-xs text-slate-400 mt-0.5">
                {t('payroll.computedWas', 'Система посчитала: {{amount}}', { amount: formatMinor(line.computedMinor) })}
              </p>
            )}
          </div>

          <div>
            <label className="label">
              {manual ? t('payroll.plainAmountField', 'Сумма') : t('payroll.overrideAmount', 'Сумма к выплате')} *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-40 input"
              />
              <span className="text-sm text-slate-500">{CURRENCY_SUFFIX}</span>
            </div>
          </div>

          {manual ? (
            <div>
              <label className="label">
                {t('payroll.noteField', 'Комментарий')}
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="input"
              />
            </div>
          ) : (
            <div>
              <label className="label">
                {t('payroll.reasonField', 'Причина изменения')} *
              </label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t('payroll.reasonPlaceholder', 'Договорились о доплате за замену')}
                className="input"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                {t('payroll.reasonHint', 'Расчётная сумма сохранится рядом — правка не стирает то, что посчитала система.')}
              </p>
            </div>
          )}
        </div>

        <div className="px-4 pt-2 pb-4 flex justify-between gap-2">
          {!manual && line.overrideMinor !== null ? (
            <button
              onClick={() => submit(true)}
              disabled={saving}
              className="btn-ghost disabled:opacity-50"
            >
              {t('payroll.clearOverride', 'Вернуть расчётную сумму')}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="btn-ghost disabled:opacity-50">
              {t('payroll.cancel', 'Отмена')}
            </button>
            <button
              onClick={() => submit(false)}
              disabled={saving}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? t('payroll.saving', 'Сохранение...') : t('payroll.save', 'Сохранить')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LineAmountModal;
