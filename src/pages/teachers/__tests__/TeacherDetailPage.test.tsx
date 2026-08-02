import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Карточка преподавателя. Тесты держат ровно тот дефект, который нашёлся на
 * живых данных: самый активный преподаватель академии открывался с нулями и
 * красным KPI, потому что дефолтным периодом был «этот месяц», а дело было
 * 2 августа — окно шириной в субботу и воскресенье.
 *
 * Арифметика на сервере при этом верна, поэтому чинилась подача: период по
 * умолчанию, разделение «свойств преподавателя» и «величин за окно», и честное
 * «был(а) в сети» вместо period-scoped lastActivityAt.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fb?: string) => fb ?? _k, i18n: { language: 'ru' } }),
}));

vi.mock('../../../lib/api', () => ({
  orgGetTeachers: vi.fn(),
  orgGetGroups: vi.fn(),
  orgUpdateGroup: vi.fn(),
  apiGetTeacherActivity: vi.fn(),
  apiGetTeacherTimeline: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../contexts/PermissionsContext', () => ({ usePermissions: vi.fn() }));
vi.mock('../../../contexts/BranchContext', () => ({ useBranch: vi.fn() }));
vi.mock('../../../hooks/useOrgPresence', () => ({ useOrgPresence: vi.fn() }));
vi.mock('../../../components/shared/MemberRolesEditor', () => ({ default: () => <div /> }));

import TeacherDetailPage from '../TeacherDetailPage';
import * as apiModule from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { useBranch } from '../../../contexts/BranchContext';
import { useOrgPresence } from '../../../hooks/useOrgPresence';

const api = apiModule as unknown as Record<string, ReturnType<typeof vi.fn>>;

const TEACHER = {
  uid: 't1',
  displayName: 'Мадумарова Рухсора',
  email: 'ruxsora@teacher.sabakhub.app',
  phone: '+996554103828',
};

// Две группы одной «Продлёнки», девять учеников в каждой — как на живой карточке.
const GROUPS = [
  { id: 'g1', name: 'Рухсора Прд 13:30', courseId: 'c1', courseName: 'Продленка', teacherIds: ['t1'], studentIds: Array.from({ length: 9 }, (_, i) => `s${i}`) },
  { id: 'g2', name: 'Рухсора Прод 9:30', courseId: 'c1', courseName: 'Продленка', teacherIds: ['t1'], studentIds: Array.from({ length: 9 }, (_, i) => `s${i + 9}`) },
];

const setup = (opts: { kpiRow?: unknown; events?: unknown[]; activity?: boolean; lastSeenMs?: number | null } = {}) => {
  const { kpiRow = null, events = [], activity = true, lastSeenMs = Date.now() - 86_400_000 } = opts;

  (useAuth as any).mockReturnValue({ role: 'admin', organizationId: 'org1' });
  (useBranch as any).mockReturnValue({ activeBranchId: null, setActiveBranch: vi.fn(), branches: [] });
  (useOrgPresence as any).mockReturnValue({ isOnline: () => false, lastSeenMs: () => lastSeenMs });
  (usePermissions as any).mockReturnValue({
    loaded: true,
    canRead: (r: string) => (r === 'teacher_activity' ? activity : true),
    canWrite: () => true,
  });

  api.orgGetTeachers.mockResolvedValue([TEACHER]);
  api.orgGetGroups.mockResolvedValue(GROUPS);
  api.apiGetTeacherActivity.mockResolvedValue({ rows: kpiRow ? [kpiRow] : [], totals: {} });
  api.apiGetTeacherTimeline.mockResolvedValue({ events });

  return render(
    <MemoryRouter initialEntries={['/teachers/t1']}>
      <Routes><Route path="/teachers/:uid" element={<TeacherDetailPage />} /></Routes>
    </MemoryRouter>,
  );
};

describe('TeacherDetailPage — окно периода', () => {
  beforeEach(() => vi.clearAllMocks());

  it('открывается на КВАРТАЛЕ, а не на «этом месяце»', async () => {
    setup();
    await screen.findByText(TEACHER.displayName);
    // 2-го числа «этот месяц» — это окно в один-два дня, и у самого активного
    // преподавателя карточка открывалась пустой.
    expect(screen.getByRole('button', { name: 'Квартал' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Этот месяц' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('запрашивает активность именно за квартал', async () => {
    setup();
    await waitFor(() => expect(api.apiGetTeacherActivity).toHaveBeenCalledWith({ period: 'quarter' }));
    expect(api.apiGetTeacherTimeline).toHaveBeenCalledWith('t1', { period: 'quarter' });
  });

  it('даёт «Всё время» как период и как выход из пустого экрана', async () => {
    setup({ kpiRow: null, events: [] });
    await screen.findByText(TEACHER.displayName);
    expect(screen.getByRole('button', { name: 'Всё время' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Посмотреть за всё время/ })).toBeInTheDocument();
  });
});

describe('TeacherDetailPage — что где показано', () => {
  beforeEach(() => vi.clearAllMocks());

  it('в верхней полосе только то, что не зависит от периода', async () => {
    setup();
    await screen.findByText(TEACHER.displayName);
    expect(screen.getByText('Групп')).toBeInTheDocument();
    expect(screen.getByText('Курсов')).toBeInTheDocument();
    expect(screen.getByText('Учеников')).toBeInTheDocument();
    expect(screen.getByText('Был(а) в сети')).toBeInTheDocument();
    // KPI ушёл вниз, к переключателю периода: наверху его ноль читался как приговор.
    expect(screen.queryByText('KPI')).toBeNull();
  });

  it('KPI подписан как относительный и за период', async () => {
    setup({ kpiRow: { teacherId: 't1', name: TEACHER.displayName, counts: { grade_set: 12 }, totalActions: 12, activeDays: 6, engagementPoints: 24, consistencyPct: 40, kpiScore: 55, lastActivityAt: '2026-07-30T10:00:00.000Z' } });
    await screen.findByText(TEACHER.displayName);
    expect(await screen.findByText('KPI за период')).toBeInTheDocument();
    expect(screen.getByText('относительно коллег')).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
  });

  it('считает учеников без повторов, а курсы — по разным курсам', async () => {
    setup();
    await screen.findByText(TEACHER.displayName);
    expect(screen.getByText('18')).toBeInTheDocument();  // 9 + 9, пересечений нет
    expect(screen.getByText('без повторов')).toBeInTheDocument();
    // Обе группы — «Продленка», то есть курс ОДИН, а не два.
    const courses = screen.getByText('Курсов').closest('div');
    expect(courses?.textContent).toContain('1');
  });

  it('«был(а) в сети» берётся из присутствия, а не из period-scoped lastActivityAt', async () => {
    // Пустое окно активности, но присутствие вчера: карточка обязана сказать
    // «вчера», а не «—». Раньше строка шла из kpi.lastActivityAt, который не
    // может быть раньше начала выбранного периода.
    setup({ kpiRow: null, events: [], lastSeenMs: Date.now() - 86_400_000 });
    await screen.findByText(TEACHER.displayName);
    expect(screen.getAllByText(/вчера/).length).toBeGreaterThan(0);
  });
});
