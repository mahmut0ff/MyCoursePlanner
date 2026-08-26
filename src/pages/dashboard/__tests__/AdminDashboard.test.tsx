/**
 * Контракты плиток админского дашборда (аудит 2026-08-26).
 *
 * Проверяется не вёрстка, а обещания, которые дают числа: откуда берётся
 * значение и куда ведёт клик. Каждый тест — конкретное расхождение, из-за
 * которого плитка показывала одно, а экран за ней — другое.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { displayName: 'Директор' }, organizationId: 'org1', role: 'admin' }),
}));
vi.mock('../../../contexts/PermissionsContext', () => ({
  usePermissions: () => ({ canRead: () => true, canWrite: () => true }),
}));
vi.mock('../../../contexts/PlanContext', () => ({
  usePlanGate: () => ({ canAccess: () => true, loading: false }),
}));
vi.mock('../../../contexts/BranchContext', () => ({
  useBranch: () => ({ activeBranchId: null }),
}));
// Recharts рисует через ResizeObserver, которого в jsdom нет; график к числам
// отношения не имеет.
vi.mock('recharts', () => {
  const Stub = () => null;
  return {
    AreaChart: Stub, Area: Stub, XAxis: Stub, YAxis: Stub,
    CartesianGrid: Stub, Tooltip: Stub, ResponsiveContainer: Stub,
  };
});

const overview = {
  students: { active: 137, newThisMonth: 9, newLastMonth: 20, newLastMonthToDate: 6 },
  teachers: 12,
  performance: { avgScore: 74, avgScoreThisMonth: 61, attemptsThisMonth: 8, attemptsTotal: 400 },
  attendance: { rateAvg: 90, rateThisMonth: 83, absencesThisMonth: 14, lessonsThisMonth: 120 },
  risk: { high: 3, medium: 5, total: 8, overdue: 4, attention: 11 },
  leads: { total: 10, new: 2, contacted: 3, resolved: 5, newThisMonth: 4, unassignedBranch: 0 },
  pendingHomework: 6,
};

const finance = {
  totalIncome: 500_000,
  netProfit: 120_000,
  outstandingDebt: 387_700,
  overdueCount: 51,
  chartData: [],
  previous: { totalIncome: 400_000, totalExpense: 0, netProfit: 100_000 },
  previousComparable: true,
  unassignedBranchIncome: 0,
  unassignedBranchDebt: 0,
};

vi.mock('../../../lib/api', () => ({
  apiGetBranchAnalytics: vi.fn(async () => ({ branches: [], unassigned: null, totalBranches: 0 })),
  apiGetOrganization: vi.fn(async () => ({ createdAt: '2020-01-01T00:00:00.000Z' })),
  apiGetAIManagerSettings: vi.fn(async () => ({ data: null })),
  orgGetDashboardStats: vi.fn(async () => ({ totalStudents: 402 })), // ← вся сеть
  apiGetDashboardOverview: vi.fn(async () => overview),
  apiGetFinanceMetrics: vi.fn(async () => finance),
  orgGetTimetable: vi.fn(async () => []),
  orgGetSchedule: vi.fn(async () => []),
  apiAIInsightsAsk: vi.fn(async () => ({ data: { answer: '' } })),
}));

import AdminDashboard from '../AdminDashboard';
import * as api from '../../../lib/api';

const renderDashboard = async () => {
  render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Требует внимания')).toBeInTheDocument());
};

const hrefOf = (label: string) =>
  screen.getByText(label).closest('a')?.getAttribute('href');

describe('AdminDashboard — плитка и экран за ней показывают одно и то же', () => {
  beforeEach(() => vi.clearAllMocks());

  it('«Просроченные платежи» ведёт в список просроченных, а не во все неоплаченные', async () => {
    await renderDashboard();
    // Число на плитке — просроченные СЧЕТА (51). Ссылка обязана открыть ровно
    // это множество: ?unpaid=1 открывал бы все неоплаченные (в проде их было 90).
    expect(screen.getByText('Просроченные платежи')).toBeInTheDocument();
    expect(hrefOf('Просроченные платежи')).toBe('/finances?tab=debts&overdue=1');
  });

  it('«Ученики в зоне риска» показывает attention и ведёт на тот же фильтр ростера', async () => {
    await renderDashboard();
    expect(screen.getByText('11')).toBeInTheDocument(); // attention, не total (8)
    expect(hrefOf('Ученики в зоне риска')).toBe('/students?risk=1');
  });

  it('сумма долга ведёт во «все неоплаченные» — это то множество, которое в ней просуммировано', async () => {
    await renderDashboard();
    expect(hrefOf('Долги')).toBe('/finances?tab=debts&unpaid=1');
    expect(screen.getByText('из них 51 просрочка')).toBeInTheDocument();
  });

  it('делает один запрос финансов, а «к прошлому» берёт из его ответа', async () => {
    await renderDashboard();
    // Второй запрос (period=last_month) ради пересчёта MTD на клиенте убран.
    expect((api.apiGetFinanceMetrics as any).mock.calls).toHaveLength(1);
    expect((api.apiGetFinanceMetrics as any).mock.calls[0][0]).toEqual({ period: 'current_month' });
    expect(screen.getByText(/25% к прошлому/)).toBeInTheDocument(); // 500k против 400k
  });
});

describe('AdminDashboard — период и охват числа подписаны честно', () => {
  beforeEach(() => vi.clearAllMocks());

  it('успеваемость и посещаемость показывают месяц, а не всю историю', async () => {
    // Роль без финансов видит «учебный» набор плиток.
    vi.mocked(api.apiGetFinanceMetrics).mockRejectedValueOnce(new Error('no access'));
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Требует внимания')).toBeInTheDocument());

    expect(screen.getAllByText('61%').length).toBeGreaterThan(0); // avgScoreThisMonth
    expect(screen.queryByText('74%')).not.toBeInTheDocument(); // всевременное — не на плитке
    expect(screen.getAllByText('83%').length).toBeGreaterThan(0); // rateThisMonth
    expect(screen.getByText('за этот месяц')).toBeInTheDocument(); // подпись у колец
  });

  it('«Студенты» берёт филиальный ростер overview, а не общесетевой dashboardStats', async () => {
    vi.mocked(api.apiGetFinanceMetrics).mockRejectedValueOnce(new Error('no access'));
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Требует внимания')).toBeInTheDocument());

    expect(screen.getByText('137')).toBeInTheDocument();
    expect(screen.queryByText('402')).not.toBeInTheDocument();
  });

  it('воронка подписана как накопительная и называет число заявок за месяц', async () => {
    await renderDashboard();
    // Текст собран из нескольких узлов, поэтому матчим по итоговому textContent.
    const caption = screen.getByText((_, el) =>
      el?.tagName === 'P' && /за всё время/.test(el.textContent || '') && /4 новые заявки в этом месяце/.test(el.textContent || ''));
    expect(caption).toBeInTheDocument();
  });
});
