import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, Search, X } from 'lucide-react';
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
  /** Сумма: договорная цена → перенос из прошлого месяца → цена курса → null. */
  amount: number | null;
  /** Полная (прайсовая) цена курса — по ней показываем и считаем скидку. */
  listAmount: number | null;
  /**
   * Сумма пришла из договорной цены студента, а не из переноса/прайса.
   *
   * Разница видима на экране намеренно: менеджер должен отличать «столько он
   * платит по договорённости» от «столько было в прошлом месяце». Второе можно
   * править не задумываясь, первое — осознанное решение, и правка здесь его НЕ
   * меняет: договорная цена задаётся действием «Сумма оплаты».
   */
  agreed?: boolean;
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
      // По умолчанию никого не отмечаем — менеджер сам решает, кому начислить
      // (галочкой, поиском или «Выбрать все»). Сумму всё равно переносим, чтобы
      // не вводить заново, когда студента таки отметят.
      include: false,
      amountText: c.amount != null ? String(c.amount) : '',
    }))
  );
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

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

  // Поиск по имени/курсу внутри окна — когда ростер длинный и надо быстро найти
  // одного студента, а не листать весь список.
  const hasQuery = query.trim().length > 0;
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.studentName.toLowerCase().includes(q) || (r.courseName || '').toLowerCase().includes(q));
  }, [rows, query]);

  // Мастер-галочка действует на то, что сейчас видно (с учётом поиска): можно
  // отметить только найденных, не трогая остальных. «Выбрать все» ставит галочку
  // лишь там, где есть сумма — пустое начисление всё равно не подтвердить.
  const billableVisible = useMemo(() => visibleRows.filter(r => Number(r.amountText) > 0), [visibleRows]);
  const allOn = billableVisible.length > 0 && billableVisible.every(r => r.include);
  const someVisibleOn = visibleRows.some(r => r.include);
  const masterRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = someVisibleOn && !allOn;
  }, [someVisibleOn, allOn]);
  const setAll = (include: boolean) => {
    const keys = new Set(visibleRows.map(r => r.key));
    setRows(rs => rs.map(r => (keys.has(r.key) ? { ...r, include: include && Number(r.amountText) > 0 } : r)));
  };

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
        // Прайсовая цена курса → сервер посчитает скидку, если начислили меньше.
        listAmount: r.listAmount ?? undefined,
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
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-pop w-full max-w-[640px] overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('finances.billMonth', 'Начислить за месяц')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{periodLabel}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700"><X className="w-3.5 h-3.5" /></button>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            {t('finances.billMonthNone', 'За этот месяц все активные студенты уже начислены.')}
          </div>
        ) : (
          <>
            <p className="px-4 pt-1 text-xs text-slate-500">
              {t('finances.billMonthHint', 'Отметьте, кому начислить. Суммы перенесены из прошлого месяца — поправьте, где нужно.')}
            </p>
            <div className="px-4 pt-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t('finances.billSearch', 'Поиск по имени или курсу...')}
                  className="input pl-8"
                />
              </div>
            </div>
            <div className="px-4 pt-3 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  ref={masterRef}
                  type="checkbox"
                  checked={allOn}
                  onChange={() => setAll(!allOn)}
                  className="w-3.5 h-3.5 accent-primary-600"
                />
                {allOn
                  ? (hasQuery ? t('finances.billDeselectFound', 'Снять найденных') : t('finances.billDeselectAll', 'Снять все'))
                  : (hasQuery ? t('finances.billSelectFound', 'Выбрать найденных') : t('finances.billSelectAll', 'Выбрать все'))}
              </label>
              <span className="text-xs text-slate-400">
                {t('finances.billSelectedCount', 'Выбрано: {{n}} из {{m}}', { n: selected.length, m: rows.length })}
              </span>
            </div>
            <div className="px-4 pt-3 pb-3 space-y-1.5 overflow-y-auto">
              {visibleRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">{t('finances.billSearchNone', 'Никого не нашли')}</p>
              ) : visibleRows.map(r => {
                // Скидка = цена курса − начисленная сумма. Показываем живьём, чтобы
                // менеджер видел, что ставит меньше прайса осознанно, а не по ошибке.
                const discount = r.listAmount != null ? Math.max(0, r.listAmount - Number(r.amountText || 0)) : 0;
                return (
                  <div key={r.key} className="flex items-center gap-3 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={e => patch(r.key, { include: e.target.checked })}
                      aria-label={r.studentName}
                      className="w-3.5 h-3.5 shrink-0 accent-primary-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{r.studentName}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {r.courseName || r.courseId}
                        {/* Откуда взялась сумма — это то, что менеджер решает
                            глазами: своя цена правится осознанно, перенос из
                            прошлого месяца — на ходу. */}
                        {r.agreed && (
                          <span className="ml-1.5 text-emerald-600 font-medium">
                            · {t('finances.agreedPrice', 'своя цена')}
                          </span>
                        )}
                      </p>
                      {discount > 0 && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
                          {t('finances.discount', 'Скидка')}: {formatMoney(discount)}
                          <span className="text-slate-400 font-normal"> · {t('finances.coursePrice', 'Цена курса')} {formatMoney(r.listAmount!)}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min="0"
                        value={r.amountText}
                        // Минус не принимаем: отрицательная строка молча выпадала из «Выбрано»
                        // и показывала «Скидку» больше цены курса.
                        onChange={e => patch(r.key, { amountText: e.target.value.replace('-', '') })}
                        placeholder="0"
                        className="input w-24 text-right font-medium tabular-nums"
                      />
                      <span className="text-[11px] text-slate-400 w-6">{CURRENCY_SUFFIX}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
          <div className="text-sm">
            <span className="text-slate-500">{t('finances.billMonthTotal', 'Итого')}: </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(total)}</span>
            <span className="text-slate-400"> · {selected.length}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">{t('finances.cancel', 'Отмена')}</button>
            <button
              onClick={handleConfirm}
              disabled={saving || selected.length === 0}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              {saving ? t('finances.saving', 'Сохранение...') : t('finances.billMonthConfirm', 'Начислить')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillMonthModal;
