import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banknote, Download, Search, Undo2, Wallet } from 'lucide-react';
import { apiGetTransactions } from '../../../lib/api';
import { orgDayKey } from '../../../lib/payment-plans';
import { useBranch } from '../../../contexts/BranchContext';
import { usePermissions } from '../../../contexts/PermissionsContext';
import RefundModal from '../../../components/finance/RefundModal';
import type { RefundableTx } from '../../../components/finance/RefundModal';
import EmptyState from '../../../components/ui/EmptyState';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import RowMenu from '../../../components/ui/RowMenu';
import type { RowMenuItem } from '../../../components/ui/RowMenu';
import LazyListFooter from '../../../components/ui/LazyListFooter';
import { useLazyList } from '../../../hooks/useLazyList';
import PeriodFilter from '../components/PeriodFilter';
import { toTransactionParams, periodSlug } from '../financePeriod';
import type { FinanceRange } from '../financePeriod';
import { PAYMENT_METHODS, getMethodLabel } from '../expenseCategories';
import { formatMoney, formatNumber } from '../../../lib/money';
import { buildCsv, downloadCsv, formatCsvDate } from '../../../lib/csv';
import type { PaymentsFilters } from '../FinancesPage';

interface Props {
  range: FinanceRange;
  onRangeChange: (next: FinanceRange) => void;
  filters: PaymentsFilters;
  onFiltersChange: (next: PaymentsFilters) => void;
  /** Ограничить журнал одним студентом (?student=<uid>). Пусто — показываем всех. */
  studentId?: string;
  /** Сообщить странице имя того студента — для подписи на чипе фильтра. */
  onStudentNameResolved?: (name: string) => void;
}

/**
 * Должно совпадать с TRANSACTIONS_FETCH_CAP в
 * netlify/functions/api-finance-transactions.ts. Импортировать оттуда нельзя —
 * это серверный модуль, он не входит в сборку клиента. Если поменяете там,
 * поменяйте и здесь: иначе предупреждение об обрезке либо исчезнет, либо
 * начнёт появляться на полных выборках.
 */
const FETCH_CAP = 5000;

/** Ключ группировки по кассе: пустой способ — отдельная строка «не указан». */
const UNKNOWN_METHOD = '';

/** Дата оплаты: `date` — то, что ввёл кассир, `createdAt` — запасной вариант. */
const txDate = (tx: any): string => tx?.date || tx?.createdAt || '';

const txTime = (tx: any): number => {
  const ms = new Date(txDate(tx)).getTime();
  // Битую дату отправляем в конец списка, а не в 1970 год.
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * Дата для ячейки. Пустая или непарсящаяся строка (легаси-записи такое несут) —
 * прочерк, а не «Invalid Date». Та же защита от NaN, что и в сортировке.
 */
const formatTxDate = (raw: string): string => {
  if (!raw) return '—';
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? '—' : new Date(ms).toLocaleDateString();
};

/** Календарный день строки в дне организации, или null если дата нечитаема. */
const dayKeyOf = (raw: unknown): string | null => {
  if (!raw) return null;
  const ms = new Date(raw as any).getTime();
  return Number.isNaN(ms) ? null : orgDayKey(new Date(ms));
};

/**
 * День, когда платёж ВНЕСЛИ в систему, если он заметно расходится с датой, когда
 * деньги реально пришли. Иначе null — подпись не рисуем.
 *
 * Зачем: `date` — день, который назвал кассир, `createdAt` — момент ввода. Пока
 * задним числом провести оплату было нельзя, они совпадали; теперь нет. Без этой
 * подписи директор, сверяющий кассу, не отличит запись, сделанную задним числом,
 * от сделанной в тот же день, — и будет искать несуществующее расхождение.
 *
 * Порог — БОЛЬШЕ одного календарного дня, а не «любое расхождение»: закрыть
 * кассу на следующее утро — нормальная практика администратора, и помечать этим
 * половину журнала значит обесценить пометку. Дни считаем через orgDayKey, а не
 * по зоне браузера: директор в Бишкеке и функция в UTC должны видеть одну границу
 * суток, иначе вечерний платёж «внесён завтра» у одного и «сегодня» у другого.
 */
const lateEntryDate = (tx: any): string | null => {
  const paidDay = dayKeyOf(tx?.date);
  const typedDay = dayKeyOf(tx?.createdAt);
  if (!paidDay || !typedDay) return null;
  const asUtc = (key: string) => Date.parse(`${key}T00:00:00.000Z`);
  const gapDays = Math.round((asUtc(typedDay) - asUtc(paidDay)) / 86_400_000);
  if (gapDays <= 1) return null;
  return new Date(tx.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/**
 * Журнал платежей — закрытие кассы.
 *
 * Отвечает на вопрос, которого до сих пор в продукте не было: что реально
 * пришло за период и сколько из этого наличными. Долги (кому выставлен счёт)
 * живут на соседней вкладке — здесь только фактические поступления.
 */
const PaymentsTab: React.FC<Props> = ({
  range,
  onRangeChange,
  filters,
  onFiltersChange,
  studentId = '',
  onStudentNameResolved,
}) => {
  const { t } = useTranslation();
  const { activeBranchId } = useBranch();
  const { canWrite, loaded: permsLoaded } = usePermissions();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refundFor, setRefundFor] = useState<any | null>(null);

  // Возврат — это создание расхода, поэтому право то же, что на запись финансов.
  const canRefund = permsLoaded && canWrite('finances');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    // Собираем параметры отдельным объектом: сервер фильтрует по type сам, и
    // тянуть расходы, чтобы тут же их выбросить, — лишний трафик на телефоне.
    const params: Record<string, string> = { ...toTransactionParams(range), type: 'income' };
    apiGetTransactions(params)
      .then((data: any) => setRows(Array.isArray(data) ? data : []))
      .catch((e: any) => setError(e?.message || t('common.error', 'Ошибка')))
      .finally(() => setLoading(false));
  }, [range, t]);

  useEffect(() => {
    load();
    // activeBranchId: the api layer stamps it onto the GET, so a branch switch must refetch.
  }, [load, activeBranchId]);

  const setFilter = (patch: Partial<PaymentsFilters>) => onFiltersChange({ ...filters, ...patch });

  // Сортируем один раз после загрузки: пересортировка на каждое нажатие клавиши
  // в поиске — то, из-за чего старая вкладка доходов подтормаживала.
  const sorted = useMemo(() => [...rows].sort((a, b) => txTime(b) - txTime(a)), [rows]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return sorted.filter(tx => {
      // Пришли по ссылке с карточки студента (?student=<uid>) — только его оплаты.
      // Фильтруем на клиенте, а не новым параметром запроса: набор уже в руках,
      // а у GET api-finance-transactions не должно появляться новых обязательных полей.
      if (studentId && String(tx.studentId || '') !== studentId) return false;
      if (filters.method && (tx.paymentMethod || UNKNOWN_METHOD) !== filters.method) return false;
      if (!q) return true;
      return (
        String(tx.studentName || '').toLowerCase().includes(q) ||
        String(tx.courseName || '').toLowerCase().includes(q) ||
        String(tx.description || '').toLowerCase().includes(q)
      );
    });
  }, [sorted, filters.search, filters.method, studentId]);

  // Имя для чипа «отфильтровано по студенту» на странице: в журнале лежит снимок
  // имени, поэтому оно есть даже у студента, которого уже нет в ростере.
  useEffect(() => {
    if (!studentId || !onStudentNameResolved) return;
    const name = rows.find(tx => String(tx.studentId || '') === studentId)?.studentName;
    if (name) onStudentNameResolved(String(name));
  }, [studentId, rows, onStudentNameResolved]);

  // Итоги считаем по отфильтрованному списку: кассир сверяет ящик именно с тем,
  // что видит на экране, а не со скрытой полной выборкой.
  const totals = useMemo(() => {
    const byMethod = new Map<string, { amount: number; count: number }>();
    let total = 0;
    for (const tx of filtered) {
      const amount = Number(tx.amount) || 0;
      total += amount;
      const key = tx.paymentMethod || UNKNOWN_METHOD;
      const cur = byMethod.get(key) || { amount: 0, count: 0 };
      byMethod.set(key, { amount: cur.amount + amount, count: cur.count + 1 });
    }
    // Известные способы — всегда в одном порядке, даже с нулём: пустая строка
    // «Карта — 0» и есть ответ на вопрос «а картой сегодня платили?».
    const known = PAYMENT_METHODS.map(m => ({
      id: m.id,
      ...(byMethod.get(m.id) || { amount: 0, count: 0 }),
    }));
    const unknown = byMethod.get(UNKNOWN_METHOD);
    return {
      total,
      breakdown: unknown ? [...known, { id: UNKNOWN_METHOD, ...unknown }] : known,
    };
  }, [filtered]);

  // Ленивый рендер вместо страниц. Ключ сброса — сами фильтры, а не массив
  // filtered: тихая перезагрузка после возврата или смены филиала не должна
  // схлопывать список обратно к первой порции под уже пролистанным кассиром.
  const { visible: pageRows, total, hasMore, sentinelRef, loadMore } = useLazyList(filtered, {
    resetKey: `${filters.search}|${filters.method}|${studentId || ''}|${activeBranchId || ''}`,
  });

  // Сервер отдаёт голый массив без общего количества: равенство лимиту —
  // единственный доступный признак того, что часть периода не доехала.
  const truncated = rows.length >= FETCH_CAP;

  const handleExport = () => {
    if (filtered.length === 0) return;
    const csv = buildCsv(
      [
        t('finances.colDate', 'Дата'),
        t('finances.colStudent', 'Студент'),
        t('finances.colCourse', 'Курс'),
        t('finances.colAmount', 'Сумма'),
        t('finances.colMethod', 'Способ'),
        t('finances.colAcceptedBy', 'Принял'),
        t('finances.colComment', 'Комментарий'),
      ],
      filtered.map(tx => [
        formatCsvDate(txDate(tx)),
        tx.studentName || '',
        tx.courseName || '',
        Number(tx.amount) || 0,
        getMethodLabel(tx.paymentMethod, t),
        tx.createdByName || '',
        tx.description || '',
      ])
    );
    downloadCsv(`payments_${periodSlug(range)}.csv`, csv);
  };

  const buildRowMenu = (tx: any): RowMenuItem[] => {
    if (!canRefund) return [];
    return [
      {
        label: t('finances.refund', 'Оформить возврат'),
        icon: Undo2,
        danger: true,
        onSelect: () => setRefundFor(tx),
      },
    ];
  };

  return (
    <div className="space-y-4">
      <PeriodFilter value={range} onChange={onRangeChange} />

      {/* Касса за период: сначала общая сумма, потом разбивка по способам */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
              <Wallet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{t('finances.receivedTotal', 'Поступило за период')}</p>
              <p className="text-2xl font-bold text-emerald-600">{formatMoney(totals.total)}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {t('finances.paymentsCount', 'платежей')}: {formatNumber(filtered.length)}
              </p>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {totals.breakdown.map(m => (
              <div key={m.id || 'unknown'} className="bg-slate-50 dark:bg-slate-900/40 rounded-xl px-3 py-2.5">
                <p className="text-[11px] text-slate-500 truncate">{getMethodLabel(m.id, t)}</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{formatMoney(m.amount)}</p>
                <p className="text-[11px] text-slate-400">{formatNumber(m.count)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {truncated && (
        <div className="p-4 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/30 rounded-xl">
          {t(
            'finances.truncatedWindow',
            'Показаны не все платежи за этот период — сервер отдаёт максимум 5000 записей. Итоги ниже неполные, выберите период покороче.'
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={e => setFilter({ search: e.target.value })}
              placeholder={t('finances.searchPayments', 'Поиск по студенту, курсу, комментарию...')}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm dark:text-white"
            />
          </div>
          <select
            value={filters.method}
            onChange={e => setFilter({ method: e.target.value })}
            aria-label={t('finances.colMethod', 'Способ')}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white"
          >
            <option value="">{t('finances.allMethods', 'Все способы')}</option>
            {PAYMENT_METHODS.map(m => (
              <option key={m.id} value={m.id}>{t(m.labelKey, m.fallback)}</option>
            ))}
          </select>
        </div>
        {filtered.length > 0 && (
          <button
            onClick={handleExport}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        )}
      </div>

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl">{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title={
            filters.search || filters.method
              ? t('finances.nothingFound', 'Ничего не найдено')
              : t('finances.noPayments', 'За этот период платежей не было')
          }
          description={t('finances.noPaymentsHint', 'Здесь появятся все оплаты, принятые за выбранный период.')}
        />
      ) : (
        <>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colDate', 'Дата')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colStudent', 'Студент')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colCourse', 'Курс')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colAmount', 'Сумма')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colMethod', 'Способ')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.colAcceptedBy', 'Принял')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500 w-full">{t('finances.colComment', 'Комментарий')}</th>
                    <th className="px-5 py-3.5 font-medium text-slate-500 text-right">{t('finances.colActions', 'Действия')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {pageRows.map(tx => {
                    const when = txDate(tx);
                    const menu = buildRowMenu(tx);
                    const recordedOn = lateEntryDate(tx);
                    const rowStudentId = String(tx.studentId || '');
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                          {/* Старые строки могут нести непарсящуюся дату — не рисуем
                              «Invalid Date», а показываем прочерк, как в сортировке. */}
                          {formatTxDate(when)}
                          {/* Дата — это когда деньги пришли. Если запись сделали заметно
                              позже, тихо говорим когда: иначе сверка кассы не сходится. */}
                          {recordedOn && (
                            <span className="block text-[11px] text-slate-400 leading-tight mt-0.5">
                              {t('finances.recordedOn', 'внесено {{date}}', { date: recordedOn })}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                          {/* Старые записи приходят без имён — показываем прочерк, но никогда undefined.
                              Есть uid — имя ведёт в карточку студента. */}
                          {tx.studentName && rowStudentId ? (
                            <Link
                              to={`/students/${rowStudentId}`}
                              title={t('finances.openStudentCard', 'Открыть карточку студента')}
                              className="hover:text-sky-600 dark:hover:text-sky-400 hover:underline transition-colors"
                            >
                              {tx.studentName}
                            </Link>
                          ) : (
                            tx.studentName || '—'
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{tx.courseName || '—'}</td>
                        <td className="px-5 py-3.5 font-bold text-emerald-600 whitespace-nowrap">
                          {formatMoney(tx.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                          {getMethodLabel(tx.paymentMethod, t)}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{tx.createdByName || '—'}</td>
                        <td className="px-5 py-3.5 text-slate-500 max-w-[220px] truncate">{tx.description || '—'}</td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end">
                            {menu.length > 0 ? <RowMenu items={menu} /> : <span className="text-slate-300">—</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <LazyListFooter
            visibleCount={pageRows.length}
            total={total}
            hasMore={hasMore}
            sentinelRef={sentinelRef}
            onLoadMore={loadMore}
          />
        </>
      )}

      {refundFor && (
        <RefundModal
          tx={refundFor as RefundableTx}
          studentName={refundFor.studentName || t('finances.unknownStudent', 'Студент')}
          onClose={() => setRefundFor(null)}
          onSuccess={load}
        />
      )}
    </div>
  );
};

export default PaymentsTab;
