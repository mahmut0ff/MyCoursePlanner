import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { CreditCard, UserRound, X } from 'lucide-react';
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

/**
 * Подпись у каждой вкладки своя: «Счета» и «Платежи» — это состояние и события,
 * и их путали. Счёт живёт долго и меняется (выставили → частично оплатили →
 * погасили), платёж — единичный факт прихода денег. Один счёт закрывается
 * несколькими платежами, поэтому это две таблицы, а не одна.
 *
 * Вкладка называется «Счета», а не «Долги», потому что показывает ВСЕ счета,
 * включая полностью оплаченные: прежнее название обещало подмножество, а внутри
 * было всё множество — отсюда и вопрос «в чём разница». Фильтр «только должники»
 * остался внутри вкладки.
 */
const TABS: { id: FinanceTab; labelKey: string; fallback: string; hintKey: string; hint: string }[] = [
  {
    id: 'overview', labelKey: 'finances.overview', fallback: 'Обзор',
    hintKey: 'finances.hintOverview', hint: 'Сколько заработали, на что потратили и что осталось',
  },
  {
    id: 'debts', labelKey: 'finances.invoices', fallback: 'Счета',
    hintKey: 'finances.hintInvoices', hint: 'Кому выставлены счета и кто сколько должен',
  },
  {
    id: 'payments', labelKey: 'finances.payments', fallback: 'Платежи',
    hintKey: 'finances.hintPayments', hint: 'Что фактически пришло в кассу за период',
  },
  {
    id: 'expenses', labelKey: 'finances.expenses', fallback: 'Расходы',
    hintKey: 'finances.hintExpenses', hint: 'Куда ушли деньги за период',
  },
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

  // Подпись под заголовком объясняет ИМЕННО открытую вкладку. «Счета» и
  // «Платежи» соседствуют и на вид про одно и то же — одна строка снимает
  // вопрос в момент, когда он возникает, а не в справке.
  const subtitle = useMemo(() => {
    const tab = TABS.find(x => x.id === activeTab);
    return tab ? t(tab.hintKey, tab.hint) : t('finances.subtitle', 'Выручка, счета, касса и расходы');
  }, [t, activeTab]);

  /**
   * ?student=<uid> — сюда ведёт карточка студента («Все операции» →
   * ?tab=debts&student=<uid>). Раздел финансов и карточка студента были двумя
   * мирами без единого перехода: администратор видел долг на карточке и не мог
   * попасть к нему в финансах иначе, чем набрав имя в поиске.
   *
   * uid живёт в URL, а не в состоянии: ссылку на «долги вот этого студента»
   * должно быть можно переслать и положить в закладки.
   */
  const studentFilter = searchParams.get('student') || '';
  const [studentFilterName, setStudentFilterName] = useState('');

  // Сменился uid — прежнее имя врёт до тех пор, пока вкладка не подскажет новое.
  useEffect(() => setStudentFilterName(''), [studentFilter]);

  const clearStudentFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('student');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Обзор и Расходы про одного студента не рассказывают — там чип был бы обещанием
  // фильтра, которого нет.
  const showStudentChip = Boolean(studentFilter) && (activeTab === 'debts' || activeTab === 'payments');

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

      {showStudentChip && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full text-sm bg-sky-50 dark:bg-sky-900/20 text-sky-800 dark:text-sky-300 border border-sky-200/70 dark:border-sky-800/60">
            <UserRound className="w-3.5 h-3.5 shrink-0" />
            <span>
              {t('finances.filteredToStudent', 'Только один студент')}:{' '}
              <Link to={`/students/${studentFilter}`} className="font-semibold hover:underline">
                {studentFilterName || t('finances.selectedStudent', 'выбранный студент')}
              </Link>
            </span>
            <button
              type="button"
              onClick={clearStudentFilter}
              aria-label={t('finances.clearStudentFilter', 'Показать всех студентов')}
              title={t('finances.clearStudentFilter', 'Показать всех студентов')}
              className="p-1 rounded-full hover:bg-sky-100 dark:hover:bg-sky-800/50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      )}

      <div className="min-h-[500px]">
        {activeTab === 'overview' && <OverviewTab range={range} onRangeChange={setRange} />}
        {activeTab === 'debts' && (
          <DebtsTab
            filters={debtsFilters}
            onFiltersChange={setDebtsFilters}
            studentId={studentFilter}
            onStudentNameResolved={setStudentFilterName}
          />
        )}
        {activeTab === 'payments' && (
          <PaymentsTab
            range={range}
            onRangeChange={setRange}
            filters={paymentsFilters}
            onFiltersChange={setPaymentsFilters}
            studentId={studentFilter}
            onStudentNameResolved={setStudentFilterName}
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
