import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Calendar as CalendarIcon, Receipt, Trash2, Pencil, X, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  apiGetTransactions,
  apiCreateTransaction,
  apiUpdateTransaction,
  apiDeleteTransaction,
  orgGetCourses,
} from '../../../lib/api';
import { useBranch } from '../../../contexts/BranchContext';
import EmptyState from '../../../components/ui/EmptyState';
import { ListSkeleton, Skeleton } from '../../../components/ui/Skeleton';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import RowMenu from '../../../components/ui/RowMenu';
import type { RowMenuItem } from '../../../components/ui/RowMenu';
import { formatMoney, formatMoneySigned } from '../../../lib/money';
import { buildCsv, downloadCsv, formatCsvDate } from '../../../lib/csv';
import {
  EXPENSE_CATEGORIES,
  PICKABLE_CATEGORIES,
  PAYMENT_METHODS,
  getCategoryLabel,
  getCategoryColor,
  getMethodLabel,
} from '../expenseCategories';
import PeriodFilter from '../components/PeriodFilter';
import { PERIOD_PRESETS, isCompleteCustomRange, periodSlug, toTransactionParams } from '../financePeriod';
import type { FinanceRange } from '../financePeriod';
import type { ExpensesFilters } from '../FinancesPage';

interface Props {
  range: FinanceRange;
  onRangeChange: (next: FinanceRange) => void;
  filters: ExpensesFilters;
  onFiltersChange: (next: ExpensesFilters) => void;
}

const PAGE_SIZE = 50;

const emptyForm = {
  id: '',
  amount: '',
  categoryId: 'other',
  description: '',
  date: new Date().toISOString().slice(0, 10),
  paymentMethod: 'cash',
  courseId: '',
};

type ExpenseForm = typeof emptyForm;

// Возврат заводится только из истории оплат студента: он привязан к счёту и
// поднимает долг обратно. Править такую строку руками нельзя — правка суммы
// разошлась бы со счётом, который её породил.
const isRefund = (tx: any): boolean => tx?.categoryId === 'refund' || !!tx?.paymentPlanId;

const ExpensesTab: React.FC<Props> = ({ range, onRangeChange, filters, onFiltersChange }) => {
  const { t } = useTranslation();
  const { activeBranchId } = useBranch();

  const [transactions, setTransactions] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  // Ошибка поля даты: пустой input в <input type="date"> даёт form.date === '',
  // а new Date('').toISOString() бросает — ловим до конструктора и просим дату.
  const [dateError, setDateError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const editing = !!form.id;

  const load = () => {
    setLoading(true);
    setError('');
    // type: 'expense' фильтрует сервер — раньше вкладка тянула вообще все
    // транзакции и отсеивала доходы на клиенте.
    const params: Record<string, string> = { ...toTransactionParams(range), type: 'expense' };
    apiGetTransactions(params)
      .then((data: any) => setTransactions(Array.isArray(data) ? data : []))
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  };

  // activeBranchId: the api layer stamps it onto the GET, so a branch switch must refetch.
  useEffect(load, [activeBranchId, range.period, range.startDate, range.endDate]);

  // Курсы нужны только для привязки расхода — молча, без блокировки вкладки.
  // activeBranchId: the api layer stamps it onto the GET, so a branch switch must refetch.
  useEffect(() => {
    orgGetCourses()
      .then((data: any) => setCourses(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [activeBranchId]);

  // Сброс страницы при смене периода и филиала. Первый прогон пропускаем:
  // фильтры живут на странице, и возврат на вкладку не должен терять страницу.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const current = filtersRef.current;
    if (current.page !== 1) onFiltersChange({ ...current, page: 1 });
  }, [activeBranchId, range.period, range.startDate, range.endDate, onFiltersChange]);

  const courseName = (tx: any): string => {
    if (tx.courseName) return tx.courseName;
    const found = courses.find(c => c.id === tx.courseId);
    return found?.title || found?.name || '';
  };

  // Подпись активного периода — тайл обязан говорить, за что он посчитан.
  const periodLabel = useMemo(() => {
    if (isCompleteCustomRange(range)) return `${range.startDate} — ${range.endDate}`;
    const preset = PERIOD_PRESETS.find(p => p.id === range.period) || PERIOD_PRESETS[0];
    return t(preset.labelKey, preset.fallback).toLowerCase();
  }, [range, t]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return transactions.filter(tx => {
      if (filters.categoryId && tx.categoryId !== filters.categoryId) return false;
      if (!q) return true;
      return (
        (tx.description || '').toLowerCase().includes(q) ||
        getCategoryLabel(tx.categoryId, t).toLowerCase().includes(q) ||
        courseName(tx).toLowerCase().includes(q)
      );
    });
  }, [transactions, filters.search, filters.categoryId, courses, t]);

  const total = useMemo(() => filtered.reduce((sum, tx) => sum + (tx.amount || 0), 0), [filtered]);

  // Активен ли клиентский фильтр по категории/поиску — тогда сумма на тайле это
  // подытог по срезу, а не итог за весь период. Без явной пометки его прочтут
  // как «расходы за период» и недосчитаются.
  const isFiltered = !!filters.categoryId || filters.search.trim() !== '';

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, filters.page), totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const setPage = (page: number) => onFiltersChange({ ...filters, page });

  const openCreate = () => {
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
    setDateError('');
    setShowModal(true);
  };

  const openEdit = (tx: any) => {
    setForm({
      id: tx.id,
      amount: String(tx.amount ?? ''),
      categoryId: tx.categoryId || 'other',
      description: tx.description || '',
      date: (tx.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      paymentMethod: tx.paymentMethod || 'cash',
      courseId: tx.courseId || '',
    });
    setDateError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    const amount = Number(form.amount);
    if (!form.amount || !Number.isFinite(amount) || amount <= 0) {
      toast.error(t('finances.amountInvalid', 'Введите корректную сумму'));
      return;
    }
    // Дату проверяем до new Date(...).toISOString(): пустой/битый ввод иначе
    // бросает, и вместо понятной подписи у поля пользователь ловит невнятный тост.
    if (!form.date || Number.isNaN(new Date(form.date).getTime())) {
      setDateError(t('finances.dateInvalid', 'Укажите корректную дату'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        amount,
        date: new Date(form.date).toISOString(),
        categoryId: form.categoryId,
        description: form.description,
        paymentMethod: form.paymentMethod,
        // Пустая строка, а не undefined: так правка умеет снять привязку к курсу.
        courseId: form.courseId,
      };
      if (editing) {
        await apiUpdateTransaction({ id: form.id, ...payload });
        toast.success(t('finances.expenseUpdated', 'Расход обновлён'));
      } else {
        await apiCreateTransaction({ type: 'expense', ...payload });
        toast.success(t('finances.expenseAdded', 'Расход добавлен'));
      }
      setShowModal(false);
      setForm(emptyForm);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDeleteTransaction(deleteTarget.id);
      toast.success(t('finances.expenseDeleted', 'Расход удалён'));
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleExportCsv = () => {
    if (filtered.length === 0) return;
    const csv = buildCsv(
      [
        t('finances.colDate', 'Дата'),
        t('finances.colCategory', 'Категория'),
        t('finances.colAmount', 'Сумма'),
        t('finances.colMethod', 'Способ оплаты'),
        t('finances.colCourse', 'Курс'),
        t('finances.colDescription', 'Описание'),
      ],
      filtered.map(tx => [
        formatCsvDate(tx.date),
        getCategoryLabel(tx.categoryId, t),
        tx.amount ?? 0,
        getMethodLabel(tx.paymentMethod, t),
        courseName(tx),
        tx.description || '',
      ])
    );
    downloadCsv(`expenses_${periodSlug(range)}.csv`, csv);
  };

  const buildRowMenu = (tx: any): RowMenuItem[] => {
    const items: RowMenuItem[] = [];
    if (!isRefund(tx)) {
      items.push({
        label: t('finances.editExpense', 'Редактировать'),
        icon: Pencil,
        onSelect: () => openEdit(tx),
      });
    }
    items.push({
      label: t('finances.deleteExpense', 'Удалить'),
      icon: Trash2,
      danger: true,
      separated: items.length > 0,
      onSelect: () => setDeleteTarget(tx),
    });
    return items;
  };

  return (
    <div className="space-y-4">
      <PeriodFilter value={range} onChange={onRangeChange} />

      {/* Итог за выбранный период. Пока грузим — скелет, а не «+0 с.». При
          активном фильтре по категории/поиску это подытог по срезу, и тайл
          обязан это проговорить, иначе его прочтут как итог за весь период. */}
      {loading ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <Skeleton className="h-3 w-44 mb-2" />
            <Skeleton className="h-7 w-28" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">
              {isFiltered
                ? t('finances.expensesFilteredFor', 'Расходы по фильтру')
                : t('finances.expensesTotalFor', 'Расходы за период')}
              : {periodLabel}
              {isFiltered && (
                <span className="text-amber-500"> · {t('finances.filteredSubtotal', 'отфильтровано')}</span>
              )}
            </p>
            {/* Расход не «положителен со знаком»: настоящий ноль рисуем как «0 с.»
                без плюса, ненулевой — со знаком минус, как в строках таблицы. */}
            <p className="text-2xl font-bold text-rose-500">
              {total === 0 ? formatMoney(0) : formatMoneySigned(-total)}
            </p>
          </div>
          <div className="text-right text-xs text-slate-400">
            {isFiltered
              ? <>{filtered.length} {t('common.of', 'из')} {transactions.length} {t('finances.recordsShort', 'записей')}</>
              : <>{filtered.length} {t('finances.recordsShort', 'записей')}</>}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={e => onFiltersChange({ ...filters, search: e.target.value, page: 1 })}
              placeholder={t('finances.searchExpense', 'Поиск по описанию...')}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm dark:text-white"
            />
          </div>
          <select
            value={filters.categoryId}
            onChange={e => onFiltersChange({ ...filters, categoryId: e.target.value, page: 1 })}
            aria-label={t('finances.colCategory', 'Категория')}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white"
          >
            <option value="">{t('finances.allCategories', 'Все категории')}</option>
            {EXPENSE_CATEGORIES.filter(c => c.id !== 'course_fee').map(c => (
              <option key={c.id} value={c.id}>{t(c.labelKey, c.fallback)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <button
              onClick={handleExportCsv}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Download className="w-3.5 h-3.5" />CSV
            </button>
          )}
          <button
            onClick={openCreate}
            className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t('finances.addExpense', 'Добавить расход')}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <ListSkeleton rows={6} />
      ) : error ? (
        <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('finances.noExpenses', 'Расходов нет')}
          description={t('finances.noExpensesHint', 'За выбранный период расходов не найдено. Смените период или добавьте расход.')}
          actionLabel={t('finances.addExpense', 'Добавить расход')}
          onAction={openCreate}
        />
      ) : (
        <>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colDate', 'Дата')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colCategory', 'Категория')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colAmount', 'Сумма')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colMethod', 'Способ')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colCourse', 'Курс')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500 w-full">{t('finances.colDescription', 'Описание')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500 text-right">{t('finances.colActions', 'Действия')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {pageRows.map(tx => {
                    const color = getCategoryColor(tx.categoryId);
                    const refund = isRefund(tx);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-5 py-3.5 text-slate-500">
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                            {formatCsvDate(tx.date)}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: color + '18', color }}
                          >
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                            {getCategoryLabel(tx.categoryId, t)}
                          </span>
                          {/* Возврат пришёл из истории оплат — руками его не заводили. */}
                          {refund && (
                            <p className="text-[11px] text-slate-400 mt-1">
                              {t('finances.fromRefund', 'Из возврата оплаты')}
                              {tx.studentName ? ` · ${tx.studentName}` : ''}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-rose-500">{formatMoneySigned(-(tx.amount || 0))}</td>
                        <td className="px-5 py-3.5 text-xs text-slate-500">{getMethodLabel(tx.paymentMethod, t)}</td>
                        <td className="px-5 py-3.5 text-slate-500">{courseName(tx) || '—'}</td>
                        <td className="px-5 py-3.5 text-slate-500 max-w-[200px] truncate">{tx.description || '—'}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end">
                            <RowMenu items={buildRowMenu(tx)} label={t('finances.colActions', 'Действия')} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <p className="text-sm text-slate-500">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} {t('common.of', 'из')} {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">←</button>
                <span className="text-sm font-medium text-slate-500 px-2">{safePage} / {totalPages}</span>
                <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">→</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── СОЗДАНИЕ / ПРАВКА РАСХОДА ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) setShowModal(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editing ? t('finances.editExpenseTitle', 'Правка расхода') : t('finances.newExpense', 'Новый расход')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600" aria-label={t('common.close', 'Закрыть')}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('finances.amountField', 'Сумма')}
                </label>
                <input
                  type="number" autoFocus min="0"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-bold dark:text-white"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('finances.colCategory', 'Категория')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {PICKABLE_CATEGORIES.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm({ ...form, categoryId: c.id })}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[11px] font-medium transition-all dark:text-slate-200 ${
                        form.categoryId === c.id ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
                      }`}
                    >
                      <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                      {t(c.labelKey, c.fallback)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('finances.colDate', 'Дата')}
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => { setForm({ ...form, date: e.target.value }); if (dateError) setDateError(''); }}
                    aria-invalid={!!dateError}
                    className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-3 py-2.5 text-sm dark:text-white ${
                      dateError ? 'border-rose-400 dark:border-rose-500' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  />
                  {dateError && <p className="text-xs text-rose-500 mt-1">{dateError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('finances.colMethod', 'Способ оплаты')}
                  </label>
                  <select
                    value={form.paymentMethod}
                    onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white"
                  >
                    {PAYMENT_METHODS.map(m => (
                      <option key={m.id} value={m.id}>{m.icon} {t(m.labelKey, m.fallback)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('finances.courseField', 'Курс')}
                  <span className="ml-1 text-xs font-normal text-slate-400">{t('common.optional', 'необязательно')}</span>
                </label>
                <select
                  value={form.courseId}
                  onChange={e => setForm({ ...form, courseId: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white"
                >
                  <option value="">{t('finances.courseNone', 'Без привязки к курсу')}</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.title || c.name || c.id}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {t('finances.courseHint', 'Если указать курс, расход попадёт в прибыльность курса на вкладке «Обзор».')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('finances.colDescription', 'Описание')}
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm min-h-[70px] dark:text-white"
                  placeholder={t('finances.expensePlaceholder', 'Например: Закупка бумаги...')}
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} disabled={saving} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 disabled:opacity-50">
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.amount}
                className="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                {saving
                  ? t('common.saving', 'Сохранение...')
                  : editing ? t('common.save', 'Сохранить') : t('common.add', 'Добавить')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        busy={deleting}
        title={t('finances.deleteExpenseTitle', 'Удалить расход?')}
        message={
          <span>
            {t('finances.deleteExpenseBody', 'Запись будет удалена безвозвратно и перестанет учитываться в отчётах.')}
            {deleteTarget && (
              <>
                {' '}
                <b>{getCategoryLabel(deleteTarget.categoryId, t)} · {formatMoney(deleteTarget.amount)}</b>
                {deleteTarget.description ? ` — ${deleteTarget.description}` : ''}
              </>
            )}
          </span>
        }
        confirmLabel={t('finances.deleteExpense', 'Удалить')}
        cancelLabel={t('common.cancel', 'Отмена')}
        onConfirm={handleDelete}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
      />
    </div>
  );
};

export default ExpensesTab;
