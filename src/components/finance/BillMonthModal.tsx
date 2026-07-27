import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiBillMonth } from '../../lib/api';
import type { MonthlyCharge } from '../../lib/api';
import { CURRENCY_SUFFIX, formatMoney } from '../../lib/money';

/** Кандидат на начисление: студент+курс, у кого за месяц счёта ещё нет. */
export interface BillCandidate {
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  branchId: string | null;
  /** Перенос из прошлого месяца; null — прошлого начисления не было, ставит менеджер. */
  amount: number | null;
}

interface Props {
  period: string;
  periodLabel: string;
  candidates: BillCandidate[];
  onClose: () => void;
  onSuccess: () => void;
}

interface Row extends BillCandidate {
  key: string;
  include: boolean;
  amountText: string;
}

/**
 * «Начислить за месяц». Показывает всех, кому за выбранный месяц ещё не выставлен
 * счёт, с суммой, перенесённой из прошлого месяца. Менеджер правит суммы, снимает
 * галочки — и подтверждает. Сервер идемпотентен, поэтому повтор безопасен.
 */
const BillMonthModal: React.FC<Props> = ({ period, periodLabel, candidates, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>(() =>
    candidates.map((c, i) => ({
      ...c,
      key: `${c.studentId}|${c.courseId}|${i}`,
      // Без перенесённой суммы галочку не ставим: пустое начисление — это ошибка,
      // а не «начислить ноль».
      include: c.amount != null && c.amount > 0,
      amountText: c.amount != null ? String(c.amount) : '',
    }))
  );
  const [saving, setSaving] = useState(false);

  const patch = (key: string, next: Partial<Row>) =>
    setRows(rs => rs.map(r => (r.key === key ? { ...r, ...next } : r)));

  const selected = useMemo(
    () => rows.filter(r => r.include && Number(r.amountText) > 0),
    [rows]
  );
  const total = useMemo(
    () => selected.reduce((sum, r) => sum + Number(r.amountText), 0),
    [selected]
  );

  const handleConfirm = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      const charges: MonthlyCharge[] = selected.map(r => ({
        studentId: r.studentId,
        studentName: r.studentName,
        courseId: r.courseId,
        courseName: r.courseName,
        amount: Number(r.amountText),
        branchId: r.branchId,
      }));
      const res = await apiBillMonth({ period, charges });
      const created = res?.created ?? charges.length;
      toast.success(t('finances.billMonthDone', 'Начислено: {{n}}', { n: created }));
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || t('finances.error', 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('finances.billMonth', 'Начислить за месяц')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{periodLabel}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {t('finances.billMonthNone', 'За этот месяц все активные студенты уже начислены.')}
          </div>
        ) : (
          <>
            <p className="px-5 pt-4 text-xs text-slate-500">
              {t('finances.billMonthHint', 'Суммы перенесены из прошлого месяца — поправьте, где нужно. Снимите галочку, чтобы пропустить.')}
            </p>
            <div className="p-5 space-y-2 overflow-y-auto">
              {rows.map(r => (
                <div key={r.key} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl px-3 py-2">
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={e => patch(r.key, { include: e.target.checked })}
                    aria-label={r.studentName}
                    className="w-4 h-4 shrink-0 accent-emerald-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{r.studentName}</p>
                    <p className="text-[11px] text-slate-400 truncate">{r.courseName || r.courseId}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min="0"
                      value={r.amountText}
                      onChange={e => patch(r.key, { amountText: e.target.value })}
                      placeholder="0"
                      className="w-24 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm text-right font-medium dark:text-white"
                    />
                    <span className="text-[11px] text-slate-400 w-6">{CURRENCY_SUFFIX}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="p-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-slate-500">{t('finances.billMonthTotal', 'Итого')}: </span>
            <span className="font-bold text-slate-900 dark:text-white">{formatMoney(total)}</span>
            <span className="text-slate-400"> · {selected.length}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400">{t('finances.cancel', 'Отмена')}</button>
            <button
              onClick={handleConfirm}
              disabled={saving || selected.length === 0}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
            >
              <CalendarPlus className="w-4 h-4" />
              {saving ? t('finances.saving', 'Сохранение...') : t('finances.billMonthConfirm', 'Начислить')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillMonthModal;
