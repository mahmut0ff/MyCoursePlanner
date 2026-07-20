import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import RulesTab from './tabs/RulesTab';
import SheetTab from './tabs/SheetTab';

export type PayrollTab = 'rules' | 'sheet';

const TABS: { id: PayrollTab; labelKey: string; fallback: string }[] = [
  { id: 'rules', labelKey: 'payroll.rulesTab', fallback: 'Ставки' },
  { id: 'sheet', labelKey: 'payroll.sheetTab', fallback: 'Ведомость' },
];

const TAB_IDS = TABS.map(tab => tab.id);

const resolveTab = (raw: string | null): PayrollTab =>
  raw && (TAB_IDS as string[]).includes(raw) ? (raw as PayrollTab) : 'rules';

/**
 * Раздел зарплаты: две вкладки, по одной на вопрос директора.
 *
 * «Ставки» — сколько мы обещали платить и за что. «Ведомость» — сколько
 * получилось в этом месяце и что помешало посчитать точнее.
 *
 * Умолчание — «Ставки», а не «Ведомость», намеренно: ведомость без заведённых
 * ставок пуста, и первый заход в раздел обязан приводить туда, где работа
 * начинается. Вкладка живёт в URL, чтобы ссылку на ведомость можно было
 * переслать бухгалтеру.
 */
const PayrollPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = resolveTab(searchParams.get('tab'));

  const selectTab = useCallback(
    (tab: PayrollTab) => {
      const next = new URLSearchParams(searchParams);
      if (tab === 'rules') next.delete('tab');
      else next.set('tab', tab);
      // replace: переключение вкладки не должно засорять историю браузера —
      // «назад» обязано уводить с раздела зарплаты, а не по вкладкам.
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const subtitle = useMemo(
    () => t('payroll.subtitle', 'Ставки преподавателей и расчёт зарплаты по месяцам'),
    [t],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-indigo-500" />
            {t('nav.payroll', 'Зарплата')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
        </div>

        <div
          role="tablist"
          aria-label={t('nav.payroll', 'Зарплата')}
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
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {t(tab.labelKey, tab.fallback)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[500px]">
        {activeTab === 'rules' && <RulesTab />}
        {activeTab === 'sheet' && <SheetTab />}
      </div>
    </div>
  );
};

export default PayrollPage;
