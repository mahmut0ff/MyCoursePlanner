import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiSetPayrollLine } from '../../../lib/api';
import { CURRENCY_SUFFIX } from '../../../lib/money';
import { somInputToMinor } from '../payrollFormat';

interface Props {
  periodId: string;
  teacherId: string;
  teacherName: string;
  source: 'manual_bonus' | 'manual_penalty';
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Премия или штраф конкретному преподавателю за месяц.
 *
 * Заводится из его же карточки, а не из общей формы внизу списка: премия это
 * решение о ЧЕЛОВЕКЕ, и выбирать его второй раз в выпадающем списке, уже стоя в
 * его строке, — лишний шанс ошибиться человеком.
 *
 * Знак задаёт сервер по `source`: премия всегда плюс, штраф всегда минус, что бы
 * ни ввели в поле.
 */
const ManualLineModal: React.FC<Props> = ({ periodId, teacherId, teacherName, source, onClose, onSaved }) => {
  const { t } = useTranslation();
  const penalty = source === 'manual_penalty';

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const amountMinor = somInputToMinor(amount);
    if (amountMinor === null) {
      setError(t('payroll.badAmount', 'Укажите сумму больше нуля'));
      return;
    }
    setError('');
    setSaving(true);
    try {
      await apiSetPayrollLine({ periodId, teacherId, source, amountMinor, note });
      toast.success(penalty
        ? t('payroll.penaltyAdded', 'Штраф добавлен')
        : t('payroll.bonusAdded', 'Премия добавлена'));
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
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {penalty ? t('payroll.penalty', 'Штраф') : t('payroll.bonus', 'Премия')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{teacherName || teacherId}</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
            aria-label={t('payroll.close', 'Закрыть')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 py-2 space-y-3">
          {error && <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 rounded-lg">{error}</div>}

          <div>
            <label className="label">
              {t('payroll.plainAmountField', 'Сумма')} *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="5000"
                className="w-40 input"
              />
              <span className="text-sm text-slate-500">{CURRENCY_SUFFIX}</span>
            </div>
            {penalty && (
              <p className="text-[11px] text-slate-400 mt-1">
                {t('payroll.penaltyHint', 'Вычтется из начисленного. Если вычитать не из чего, выплата будет нулевой — из уже выданного удержаний не делается.')}
              </p>
            )}
          </div>

          <div>
            <label className="label">
              {t('payroll.noteField', 'Комментарий')}
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={penalty
                ? t('payroll.penaltyNotePlaceholder', 'Сорванное занятие 12 числа')
                : t('payroll.bonusNotePlaceholder', 'Замена коллеги на неделю')}
              className="input"
            />
            {/* Строку без объяснения через месяц не прочитает и тот, кто её завёл. */}
            <p className="text-[11px] text-slate-400 mt-1">
              {t('payroll.noteHint', 'Останется в расчёте и в выгрузке — по нему потом и вспомнят, за что.')}
            </p>
          </div>
        </div>

        <div className="px-4 pt-2 pb-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="btn-ghost disabled:opacity-50">
            {t('payroll.cancel', 'Отмена')}
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className={`disabled:opacity-50 ${
              penalty ? 'btn-danger' : 'btn-primary'
            }`}
          >
            {saving ? t('payroll.saving', 'Сохранение...') : t('payroll.add', 'Добавить')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualLineModal;
