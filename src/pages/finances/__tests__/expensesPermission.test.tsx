import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Расходы академии — своё право `expenses`, отдельно от кассы (`finances`) и от
 * сводных цифр (`finance_overview`).
 *
 * Экранная половина гейта: вкладка «Расходы» открывается своим правом, а не
 * прибылью, и кнопки на ней зависят от write/delete по отдельности. Серверная
 * половина проверяется в netlify/functions/__tests__/api-finance.test.ts —
 * экранного гейта без серверного не бывает, и наоборот.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fb?: any, opts?: any) => {
      const text = typeof fb === 'string' ? fb : _k;
      const vars = typeof fb === 'object' ? fb : opts;
      return vars ? text.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? '')) : text;
    },
    i18n: { language: 'ru' },
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../lib/api', () => ({
  apiGetTransactions: vi.fn(),
  apiCreateTransaction: vi.fn(),
  apiUpdateTransaction: vi.fn(),
  apiDeleteTransaction: vi.fn(),
  orgGetCourses: vi.fn(),
}));

vi.mock('../../../contexts/BranchContext', () => ({
  useBranch: () => ({ activeBranchId: null, activeBranch: null }),
}));

const grants = new Set<string>();
vi.mock('../../../contexts/PermissionsContext', () => ({
  usePermissions: () => ({
    canRead: (r: string) => grants.has(`${r}:read`),
    canWrite: (r: string) => grants.has(`${r}:write`),
    canDelete: (r: string) => grants.has(`${r}:delete`),
  }),
}));

// Вкладки-заглушки: проверяется набор вкладок, а не их содержимое.
vi.mock('../tabs/OverviewTab', () => ({ default: () => <div>overview-tab</div> }));
vi.mock('../tabs/MonthTab', () => ({ default: () => <div>month-tab</div> }));
vi.mock('../tabs/PaymentsTab', () => ({ default: () => <div>payments-tab</div> }));

import FinancesPage from '../FinancesPage';
import ExpensesTab from '../tabs/ExpensesTab';
import * as apiModule from '../../../lib/api';

const api = apiModule as unknown as Record<string, ReturnType<typeof vi.fn>>;

const setGrants = (list: string[]) => {
  grants.clear();
  list.forEach(g => grants.add(g));
};

const tabNames = () => screen.getAllByRole('tab').map(el => el.textContent?.trim());

describe('FinancesPage — вкладку «Расходы» открывает право expenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.apiGetTransactions.mockResolvedValue([]);
    api.orgGetCourses.mockResolvedValue([]);
  });

  const mount = () => render(<MemoryRouter><FinancesPage /></MemoryRouter>);

  it('кассир не видит ни «Обзор», ни «Расходы»', () => {
    setGrants(['finances:read', 'finances:write']);
    mount();
    expect(tabNames()).toEqual(['Оплаты за месяц', 'Платежи']);
  });

  it('прибыль без расходов: «Обзор» есть, «Расходы» нет', () => {
    setGrants(['finances:read', 'finance_overview:read']);
    mount();
    expect(tabNames()).toEqual(['Обзор', 'Оплаты за месяц', 'Платежи']);
  });

  it('расходы без прибыли: «Расходы» есть, «Обзор» нет — это разные права', () => {
    setGrants(['finances:read', 'expenses:read']);
    mount();
    expect(tabNames()).toEqual(['Оплаты за месяц', 'Платежи', 'Расходы']);
    // Дефолтной становится первая доступная вкладка, а не скрытый «Обзор».
    expect(screen.getByText('month-tab')).toBeTruthy();
  });
});

describe('ExpensesTab — кнопки зависят от write/delete по отдельности', () => {
  const row = {
    id: 'rent1', type: 'expense', amount: 200, categoryId: 'rent',
    description: 'Аренда зала', date: '2026-08-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.apiGetTransactions.mockResolvedValue([row]);
    api.orgGetCourses.mockResolvedValue([]);
  });

  const mount = () => render(
    <MemoryRouter>
      <ExpensesTab
        range={{ period: 'month', startDate: '', endDate: '' } as any}
        onRangeChange={() => {}}
        filters={{ search: '', categoryId: '' }}
        onFiltersChange={() => {}}
      />
    </MemoryRouter>
  );

  it('только чтение — ни «Добавить расход», ни меню строки', async () => {
    setGrants(['finances:read', 'expenses:read']);
    mount();
    await waitFor(() => expect(screen.getByText('Аренда зала')).toBeTruthy());
    expect(screen.queryByText('Добавить расход')).toBeNull();
    expect(screen.queryByLabelText('Действия')).toBeNull();
  });

  it('с write — кнопка добавления есть', async () => {
    setGrants(['finances:read', 'expenses:read', 'expenses:write']);
    mount();
    await waitFor(() => expect(screen.getByText('Аренда зала')).toBeTruthy());
    expect(screen.getByText('Добавить расход')).toBeTruthy();
    expect(screen.getByLabelText('Действия')).toBeTruthy();
  });
});
