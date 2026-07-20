import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import OverviewTab from './tabs/OverviewTab';
import DebtsTab from './tabs/DebtsTab';
import PaymentsTab from './tabs/PaymentsTab';
import ExpensesTab from './tabs/ExpensesTab';
import { DEFAULT_RANGE } from './financePeriod';
import type { FinanceRange } from './financePeriod';

export type FinanceTab = 'overview' | 'debts' | 'payments' | 'expenses';

/** Фильтры вкладки «Долги». Живут на странице, а не во вкладке — см. комментарий ниже. */
export interface DebtsFilters {
  search: string;
  status: string;
  page: number;
}

export interface PaymentsFilters {
  search: string;
  method: string;
  page: number;
}

export interface ExpensesFilters {
  search: string;
  categoryId: string;
  page: number;
}

const TABS: { id: FinanceTab; labelKey: string; fallback: string }[] = [
  { id: 'overview', labelKey: 'finances.overview', fallback: 'Обзор' },
  { id: 'debts', labelKey: 'finances.debts', fallback: 'Долги' },
  { id: 'payments', labelKey: 'finances.payments', fallback: 'Платежи' },
  { id: 'expenses', labelKey: 'finances.expenses', fallback: 'Расходы' },
];

const TAB_IDS = TABS.map(t => t.id);

// Вкладка «Доходы и Долги» разъехалась на «Долги» (кому мы выставили счёт) и
// «Платежи» (что реально пришло в кассу). Старые ссылки и закладки ведут на
// ?tab=income — перенаправляем их на «Долги», прежнее содержимое той вкладки.
const LEGACY_TABS: Record<string, FinanceTab> = { income: 'debts' };

const resolveTab = (raw: string | null): FinanceTab => {
  if (!raw) return 'overview';
  if (LEGACY_TABS[raw]) return LEGACY_TABS[raw];
  return (TAB_IDS as string[]).includes(raw) ? (raw as FinanceTab) : 'overview';
};

/**
 * Раздел финансов: четыре вкладки, по одной на вопрос, который задаёт директор.
 *
 * Обзор — сколько заработали и на чём. Долги — кто сколько должен. Платежи —
 * что пришло в кассу (закрытие смены). Расходы — куда ушло.
 *
 * Состояние фильтров поднято сюда намеренно: вкладки размонтируются при
 * переключении, и если держать поиск и период внутри них, любой переход
 * туда-обратно обнуляет фильтры. Данные при этом перезапрашиваются — для
 * денег свежесть важнее мгновенного переключения.
 */
const FinancesPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = resolveTab(searchParams.get('tab'));

  const selectTab = useCallback(
    (tab: FinanceTab) => {
      const next = new URLSearchParams(searchParams);
      if (tab === 'overview') next.delete('tab');
      else next.set('tab', tab);
      // replace: переключение вкладки не должно засорять историю браузера —
      // «назад» обязано уводить со страницы финансов, а не по вкладкам.
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const [range, setRange] = useState<FinanceRange>(DEFAULT_RANGE);
  const [debtsFilters, setDebtsFilters] = useState<DebtsFilters>({ search: '', status: '', page: 1 });
  const [paymentsFilters, setPaymentsFilters] = useState<PaymentsFilters>({ search: '', method: '', page: 1 });
  const [expensesFilters, setExpensesFilters] = useState<ExpensesFilters>({ search: '', categoryId: '', page: 1 });

  const subtitle = useMemo(
    () => t('finances.subtitle', 'Выручка, долги, касса и расходы'),
    [t]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-500" />
            {t('nav.finances', 'Финансы')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
        </div>

        <div
          role="tablist"
          aria-label={t('nav.finances', 'Финансы')}
          className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto"
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => selectTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {t(tab.labelKey, tab.fallback)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[500px]">
        {activeTab === 'overview' && <OverviewTab range={range} onRangeChange={setRange} />}
        {activeTab === 'debts' && <DebtsTab filters={debtsFilters} onFiltersChange={setDebtsFilters} />}
        {activeTab === 'payments' && (
          <PaymentsTab
            range={range}
            onRangeChange={setRange}
            filters={paymentsFilters}
            onFiltersChange={setPaymentsFilters}
          />
        )}
        {activeTab === 'expenses' && (
          <ExpensesTab
            range={range}
            onRangeChange={setRange}
            filters={expensesFilters}
            onFiltersChange={setExpensesFilters}
          />
        )}
      </div>
    </div>
  );
};

export default FinancesPage;
