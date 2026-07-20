import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
  PieChart,
  BookOpen,
} from 'lucide-react';
import { apiGetFinanceMetrics } from '../../../lib/api';
import { useBranch } from '../../../contexts/BranchContext';
import { formatMoney, formatMoneySigned, formatPercent, formatNumber } from '../../../lib/money';
import { buildCsv, downloadCsv } from '../../../lib/csv';
import { getCategoryColor, getCategoryLabel } from '../expenseCategories';
import { toMetricsParams, periodSlug } from '../financePeriod';
import type { FinanceRange } from '../financePeriod';
import PeriodFilter from '../components/PeriodFilter';
import { Skeleton, CardSkeleton } from '../../../components/ui/Skeleton';
import EmptyState from '../../../components/ui/EmptyState';

interface Props {
  range: FinanceRange;
  onRangeChange: (next: FinanceRange) => void;
}

interface ChartPoint { date: string; income: number; expense: number }
interface CategorySlice { categoryId: string; amount: number; count: number }
interface CourseRow {
  courseId: string;
  courseName: string;
  income: number;
  expense: number;
  net: number;
  studentCount: number;
}

/**
 * Ответ api-finance-metrics. Описан локально и целиком опционально: вкладка
 * рисуется раньше, чем сервер успевает обрасти всеми полями, и отсутствующая
 * секция должна давать пустой блок, а не белый экран.
 */
interface Metrics {
  totalIncome?: number;
  totalExpense?: number;
  netProfit?: number;
  totalActiveDebt?: number;
  outstandingDebt?: number;
  overdueCount?: number;
  debtorCount?: number;
  chartData?: ChartPoint[];
  expenseByCategory?: CategorySlice[];
  courseProfitability?: CourseRow[];
  unattributedExpense?: number;
  unassignedBranchIncome?: number;
  unassignedBranchExpense?: number;
  unassignedBranchDebt?: number;
  previous?: { totalIncome?: number; totalExpense?: number; netProfit?: number };
  /**
   * Есть ли с чем сравнивать прошлый период. Сервер ставит false, когда
   * сопоставимого предыдущего периода нет (например, филиал появился позже
   * его начала) — тогда любой процент был бы выдумкой, и мы рисуем прочерк.
   * Поле может ещё отсутствовать (сервер дорабатывается) — отсутствие
   * трактуем как несопоставимость: честный прочерк лучше ложной стрелки.
   */
  previousComparable?: boolean;
}

/**
 * Изменение к прошлому периоду в процентах.
 *
 * Нулевая база — не «рост на бесконечность», а неопределённость: возвращаем
 * null, и formatPercent рисует прочерк. Знаменатель берём по модулю, иначе при
 * отрицательной прошлой прибыли рост показался бы падением.
 */
const deltaPercent = (current?: number, previous?: number): number | null => {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
};

interface DeltaProps {
  /** Процент изменения; null — база нулевая, показываем прочерк. */
  value: number | null;
  /**
   * Полярность. Для расходов рост — плохая новость, поэтому цвет
   * переворачивается: 'inverse'.
   */
  polarity: 'normal' | 'inverse';
  /**
   * Сопоставим ли прошлый период (metrics.previousComparable). false —
   * сравнивать не с чем, рисуем прочерк вместо выдуманного процента.
   */
  comparable: boolean;
  label: string;
}

/**
 * Дельта к прошлому периоду.
 *
 * Смысл несут стрелка и знак процента, а цвет только усиливает — на цвет
 * полагаться нельзя ни при дальтонизме, ни при печати отчёта. Поэтому
 * направление показываем стрелкой ТОЛЬКО когда оно настоящее: при нулевом
 * округлённом проценте и при несопоставимом периоде ставим плоский прочерк,
 * а не стрелку вниз, которая читалась бы как падение там, где его нет.
 */
const Delta: React.FC<DeltaProps> = ({ value, polarity, comparable, label }) => {
  const { t } = useTranslation();

  // Несопоставимо или нулевая база — процент не определён, только прочерк.
  if (!comparable || value == null) {
    return (
      <p className="text-xs text-slate-400 mt-2 inline-flex items-center gap-1">
        <Minus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {formatPercent(null)}
        <span className="font-normal">{t('finances.vsPrevPeriod', 'к прошлому периоду')}</span>
      </p>
    );
  }

  // Нейтральная зона: округлённо ноль. Изменение в пределах погрешности —
  // направление рисовать нечестно, ставим плоский индикатор, цвет slate.
  const neutral = Math.round(value) === 0;
  if (neutral) {
    return (
      <p className="text-xs mt-2 inline-flex items-center gap-1 font-medium text-slate-400">
        <Minus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">{label}</span>
        {formatPercent(value)}
        <span className="text-slate-400 font-normal">{t('finances.vsPrevPeriod', 'к прошлому периоду')}</span>
      </p>
    );
  }

  const up = value > 0;
  const good = polarity === 'inverse' ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const tone = good
    ? 'text-emerald-600 dark:text-emerald-500'
    : 'text-rose-600 dark:text-rose-500';

  return (
    <p className={`text-xs mt-2 inline-flex items-center gap-1 font-medium ${tone}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">{label}</span>
      {formatPercent(value)}
      <span className="text-slate-400 font-normal">{t('finances.vsPrevPeriod', 'к прошлому периоду')}</span>
    </p>
  );
};

const OverviewTab: React.FC<Props> = ({ range, onRangeChange }) => {
  const { t } = useTranslation();
  const { activeBranchId } = useBranch();

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Параметры считаются из range один раз: они же идут в deps эффекта, поэтому
  // ссылка должна быть стабильной, иначе запрос уходит на каждый рендер.
  const params = useMemo(() => toMetricsParams(range), [range]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiGetFinanceMetrics(params)
      .then((res: any) => setMetrics(res || {}))
      .catch((e: any) => setError(e?.message || t('finances.loadFailed', 'Не удалось загрузить метрики')))
      .finally(() => setLoading(false));
  }, [params, t]);

  // activeBranchId: the api layer stamps it onto the GET, so a branch switch must refetch.
  useEffect(() => { load(); }, [load, activeBranchId]);

  const chartData: ChartPoint[] = metrics?.chartData || [];

  const categories = useMemo<CategorySlice[]>(() => {
    const list = metrics?.expenseByCategory || [];
    // Сервер порядок не гарантирует, а глазом сравнивают сверху вниз.
    return [...list].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
  }, [metrics]);

  const categoryTotal = useMemo(
    () => categories.reduce((sum, c) => sum + Number(c.amount || 0), 0),
    [categories]
  );

  const courses: CourseRow[] = metrics?.courseProfitability || [];

  const incomeDelta = deltaPercent(metrics?.totalIncome, metrics?.previous?.totalIncome);
  const expenseDelta = deltaPercent(metrics?.totalExpense, metrics?.previous?.totalExpense);
  const profitDelta = deltaPercent(metrics?.netProfit, metrics?.previous?.netProfit);

  // Сопоставим только при явном true: пока сервер не прислал флаг, честнее
  // прочерк, чем процент к периоду, которого могло и не быть.
  const comparable = metrics?.previousComparable === true;

  // Деньги без филиала показываем только в разрезе конкретного филиала: в
  // режиме «Все филиалы» они уже посчитаны в итогах, и предупреждать не о чем.
  const unassignedIncome = Number(metrics?.unassignedBranchIncome || 0);
  const unassignedExpense = Number(metrics?.unassignedBranchExpense || 0);
  const unassignedDebt = Number(metrics?.unassignedBranchDebt || 0);
  const showUnassigned =
    !!activeBranchId && (unassignedIncome > 0 || unassignedExpense > 0 || unassignedDebt > 0);

  const unattributed = Number(metrics?.unattributedExpense || 0);

  const handleExport = useCallback(() => {
    if (!metrics) return;
    const rows: unknown[][] = [
      [t('finances.section', 'Раздел'), t('finances.name', 'Название'), t('finances.amount', 'Сумма'), t('finances.extra', 'Доп.')],
      [t('finances.kpi', 'Показатель'), t('finances.revenue', 'Выручка'), metrics.totalIncome || 0, ''],
      [t('finances.kpi', 'Показатель'), t('finances.expenses', 'Расходы'), metrics.totalExpense || 0, ''],
      [t('finances.kpi', 'Показатель'), t('finances.profit', 'Чистая прибыль'), metrics.netProfit || 0, ''],
      [
        t('finances.kpi', 'Показатель'),
        t('finances.debt', 'Дебиторская задолженность'),
        metrics.outstandingDebt || 0,
        `${t('finances.overdueCount', 'Просрочено')}: ${metrics.overdueCount || 0}`,
      ],
      ...categories.map(c => [
        t('finances.expenseByCategory', 'Расходы по категориям'),
        getCategoryLabel(c.categoryId, t),
        c.amount || 0,
        `${t('finances.txCount', 'Операций')}: ${c.count || 0}`,
      ]),
      ...courses.map(c => [
        t('finances.courseProfit', 'Прибыльность курсов'),
        c.courseName || c.courseId,
        c.net || 0,
        `${t('finances.revenue', 'Выручка')}: ${c.income || 0}; ${t('finances.expenses', 'Расходы')}: ${c.expense || 0}; ${t('finances.students', 'Студентов')}: ${c.studentCount || 0}`,
      ]),
    ];
    const [headers, ...body] = rows;
    downloadCsv(`finance_overview_${periodSlug(range)}.csv`, buildCsv(headers as string[], body));
  }, [metrics, categories, courses, range, t]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <PeriodFilter value={range} onChange={onRangeChange} />
        <button
          onClick={handleExport}
          disabled={!metrics}
          className="shrink-0 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" />
          {t('finances.exportCsv', 'Выгрузить CSV')}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
            <Skeleton className="h-5 w-40 mb-6" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-500">{t('finances.revenue', 'Выручка')}</p>
                <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500 rounded-lg">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatMoney(metrics?.totalIncome)}
              </h3>
              <Delta value={incomeDelta} polarity="normal" comparable={comparable} label={t('finances.revenue', 'Выручка')} />
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-500">{t('finances.expenses', 'Расходы')}</p>
                <div className="p-2 bg-rose-50 dark:bg-rose-900/30 text-rose-500 rounded-lg">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatMoney(metrics?.totalExpense)}
              </h3>
              {/* polarity inverse: рост расходов — не хорошая новость. */}
              <Delta value={expenseDelta} polarity="inverse" comparable={comparable} label={t('finances.expenses', 'Расходы')} />
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-500">{t('finances.profit', 'Чистая прибыль')}</p>
                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-lg">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatMoney(metrics?.netProfit)}
              </h3>
              <Delta value={profitDelta} polarity="normal" comparable={comparable} label={t('finances.profit', 'Чистая прибыль')} />
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-amber-200 dark:border-amber-900/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-amber-400/20 to-orange-500/0 rounded-bl-full" />
              <div className="flex items-center justify-between mb-2 relative z-10">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-500">
                  {t('finances.debt', 'Дебиторская задолженность')}
                </p>
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 text-amber-600 rounded-lg">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white relative z-10">
                {formatMoney(metrics?.outstandingDebt)}
              </h3>
              <p className="text-xs text-amber-600/70 dark:text-amber-500/70 mt-2 relative z-10">
                {t('finances.overdueCount', 'Просрочено')}: {formatNumber(metrics?.overdueCount)} · {t('finances.debtorCount', 'Должников')}: {formatNumber(metrics?.debtorCount)}
              </p>
            </div>
          </div>

          {/* Деньги вне филиалов. Без этой плашки директор в разрезе филиала
              молча недосчитывается денег: они есть, но в цифры выше не входят. */}
          {showUnassigned && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-medium">
                  {t('finances.unassignedTitle', 'Есть деньги без филиала — они не входят в цифры выше')}
                </p>
                <p className="text-amber-700/90 dark:text-amber-400/90">
                  {t('finances.revenue', 'Выручка')}: {formatMoney(unassignedIncome)} · {t('finances.expenses', 'Расходы')}: {formatMoney(unassignedExpense)} · {t('finances.debt', 'Дебиторская задолженность')}: {formatMoney(unassignedDebt)}
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                  {t('finances.unassignedHint', 'Чтобы увидеть их вместе с остальными, переключитесь на «Все филиалы».')}
                </p>
              </div>
            </div>
          )}

          {/* Движение средств */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
              {t('finances.cashFlow', 'Движение средств')}
            </h3>
            {chartData.length === 0 ? (
              <div className="h-60 flex items-center justify-center text-slate-400 text-sm">
                {t('finances.noData', 'Нет данных за выбранный период')}
              </div>
            ) : (
              <div className="h-72 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="finOverviewIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="finOverviewExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      tickFormatter={(value: any) => `${value >= 1000 ? (value / 1000) + 'k' : value}`}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', background: '#1e293b', color: '#f8fafc' }}
                      itemStyle={{ fontSize: '14px', fontWeight: 600 }}
                      formatter={(value: any, name: any) => [
                        formatMoney(Number(value)),
                        // Отдельные ключи от KPI-карточек: там 'Выручка'/'Расходы',
                        // на графике — короткие 'Доход'/'Расход'. Один ключ не может
                        // резолвиться в две разные строки, поэтому chart*-ключи свои.
                        name === 'income'
                          ? t('finances.chartIncome', 'Доход')
                          : t('finances.chartExpense', 'Расход'),
                      ]}
                    />
                    <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#finOverviewIncome)" name="income" />
                    <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#finOverviewExpense)" name="expense" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Расходы по категориям. Горизонтальные полосы, а не круг: длину
              соседних строк глаз сравнивает точнее, чем площадь секторов. */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {t('finances.expenseByCategory', 'Расходы по категориям')}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              {t('finances.expenseByCategoryHint', 'Куда ушли деньги за выбранный период')}
            </p>
            {categories.length === 0 ? (
              <EmptyState
                icon={PieChart}
                title={t('finances.noExpenses', 'Расходов за период нет')}
                description={t('finances.noExpensesHint', 'Как только появятся расходы, здесь будет видно, на что уходят деньги.')}
              />
            ) : (
              <ul className="space-y-3">
                {categories.map(c => {
                  const amount = Number(c.amount || 0);
                  const share = categoryTotal > 0 ? (amount / categoryTotal) * 100 : 0;
                  const color = getCategoryColor(c.categoryId);
                  return (
                    <li key={c.categoryId}>
                      <div className="flex items-center justify-between gap-3 text-sm mb-1.5">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                          <span className="truncate text-slate-700 dark:text-slate-200">
                            {getCategoryLabel(c.categoryId, t)}
                          </span>
                        </span>
                        <span className="shrink-0 text-slate-900 dark:text-white font-medium tabular-nums">
                          {formatMoney(amount)}
                          <span className="text-slate-400 font-normal ml-2">{Math.round(share)}%</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, background: color }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Прибыльность курсов */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-6 pb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                {t('finances.courseProfit', 'Прибыльность курсов')}
              </h3>
              {/* Честность важнее красивой цифры: зарплаты преподавателей в
                  продукте не разносятся по курсам, значит это валовая маржа. */}
              <p className="text-xs text-slate-400">
                {t('finances.courseProfitCaveat', 'Валовая маржа: учтены только расходы, привязанные к курсу. Зарплаты преподавателей по курсам не распределяются.')}
              </p>
            </div>

            {courses.length === 0 ? (
              <div className="px-6 pb-6">
                <EmptyState
                  icon={BookOpen}
                  title={t('finances.noCourseData', 'Нет данных по курсам')}
                  description={t('finances.noCourseDataHint', 'Здесь появятся курсы, как только по ним пройдут оплаты или расходы.')}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-y border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.course', 'Курс')}</th>
                      <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.revenue', 'Доход')}</th>
                      <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.expenses', 'Расход')}</th>
                      <th className="px-5 py-3.5 font-medium text-slate-500">{t('finances.net', 'Чистыми')}</th>
                      <th className="px-5 py-3.5 font-medium text-slate-500 text-right">{t('finances.students', 'Студентов')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {courses.map(c => (
                      <tr key={c.courseId} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                          {c.courseName || c.courseId}
                        </td>
                        <td className="px-5 py-3.5 text-emerald-600 font-medium whitespace-nowrap tabular-nums">
                          {formatMoney(c.income)}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap tabular-nums">
                          {formatMoney(c.expense)}
                        </td>
                        <td
                          className={`px-5 py-3.5 font-semibold whitespace-nowrap tabular-nums ${
                            Number(c.net || 0) < 0 ? 'text-rose-600 dark:text-rose-500' : 'text-emerald-600 dark:text-emerald-500'
                          }`}
                        >
                          {formatMoneySigned(c.net)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-500 whitespace-nowrap tabular-nums">
                          {formatNumber(c.studentCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {unattributed > 0 && (
              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {t('finances.unattributedExpense', 'Расходы без курса')}:{' '}
                  <span className="font-semibold">{formatMoney(unattributed)}</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {t('finances.unattributedHint', 'Эти расходы не вычтены ни из одного курса. Привязать расход к курсу можно на вкладке «Расходы».')}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default OverviewTab;
