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
          setError(t('payroll.badAmount', 'укажите сумму больше нуля'));
          setSaving(false);
          return;
        }
        // Знак задаёт сервер по source — премия всегда плюс, штраф всегда минус.
        await apiSetPayrollLine({ periodId, lineId: line.id, amountMinor, note });
        toast.success(t('payroll.lineSaved', 'Строка сохранена'));
      } else {
        const overrideMinor = somInputToMinor(amount);
        if (overrideMinor === null) {
          setError(t('payroll.badAmount', 'укажите сумму больше нуля'));
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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {manual ? t('payroll.editManualLine', 'Изменить строку') : t('payroll.overrideTitle', 'Изменить сумму вручную')}
          </h2>
          <button onClick={onClose} disabled={saving} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50" aria-label={t('payroll.close', 'Закрыть')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>}

          <div className="text-sm text-slate-600 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-white">{line.teacherName || line.teacherId}</p>
            {!manual && (
              <p className="text-xs text-slate-400 mt-0.5">
                {t('payroll.computedWas', 'Система посчитала: {{amount}}', { amount: formatMinor(line.computedMinor) })}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {manual ? t('payroll.amountField', 'Сумма') : t('payroll.overrideAmount', 'Сумма к выплате')} *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-40 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
              />
              <span className="text-sm text-slate-500">{CURRENCY_SUFFIX}</span>
            </div>
          </div>

          {manual ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payroll.noteField', 'Комментарий')}
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('payroll.reasonField', 'Причина изменения')} *
              </label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t('payroll.reasonPlaceholder', 'Договорились о доплате за замену')}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                {t('payroll.reasonHint', 'Расчётная сумма сохранится рядом — правка не стирает то, что посчитала система.')}
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between gap-3">
          {!manual && line.overrideMinor !== null ? (
            <button
              onClick={() => submit(true)}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 disabled:opacity-50 underline"
            >
              {t('payroll.clearOverride', 'Вернуть расчётную сумму')}
            </button>
          ) : <span />}
          <div className="flex gap-3">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 disabled:opacity-50">
              {t('payroll.cancel', 'Отмена')}
            </button>
            <button
              onClick={() => submit(false)}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all"
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
