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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {penalty ? t('payroll.penalty', 'Штраф') : t('payroll.bonus', 'Премия')}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{teacherName || teacherId}</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
            aria-label={t('payroll.close', 'Закрыть')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
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
                className="w-40 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('payroll.noteField', 'Комментарий')}
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={penalty
                ? t('payroll.penaltyNotePlaceholder', 'Сорванное занятие 12 числа')
                : t('payroll.bonusNotePlaceholder', 'Замена коллеги на неделю')}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm dark:text-white"
            />
            {/* Строку без объяснения через месяц не прочитает и тот, кто её завёл. */}
            <p className="text-[11px] text-slate-400 mt-1">
              {t('payroll.noteHint', 'Останется в расчёте и в выгрузке — по нему потом и вспомнят, за что.')}
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 disabled:opacity-50">
            {t('payroll.cancel', 'Отмена')}
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className={`disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              penalty ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
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
