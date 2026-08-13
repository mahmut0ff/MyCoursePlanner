import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Карточка студента: тесты закрывают ровно те дефекты, из-за которых её
 * переделывали, — все они про то, что экран говорил неправду или молчал.
 *
 *  • менеджер без права на финансы видел денежный блок, получал 403 в пустой
 *    `catch {}` и читал «Начислений пока нет» — ложь про деньги;
 *  • преподаватель, которому организация выдала «ведение контингента», не видел
 *    на карточке ни одного действия, хотя в списке ему всё разрешено;
 *  • посещаемость и средний балл показывались ТОЛЬКО у проблемного студента —
 *    у здорового карточка молчала о главном.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fb?: string) => fb ?? _k, i18n: { language: 'ru' } }),
}));

// Фабрика vi.mock поднимается наверх файла, поэтому моки объявляются прямо в ней,
// а ссылки на них берутся ниже через импорт модуля.
vi.mock('../../../lib/api', () => ({
  orgGetStudents: vi.fn(),
  orgGetResults: vi.fn(),
  orgGetGroups: vi.fn(),
  orgUpdateGroup: vi.fn(),
  apiRemoveMember: vi.fn(),
  apiRestoreStudent: vi.fn(),
  apiGetPaymentPlans: vi.fn(),
  apiGetTransactions: vi.fn(),
  apiGenerateParentKey: vi.fn(),
  apiRevokeParentKey: vi.fn(),
  // Блок «Стоимость обучения» едет вместе с деньгами: незаявленная здесь ручка
  // не просто «не мокнута» — вызов несуществующей функции роняет loadFinances
  // целиком, и секция оплат уходит в ошибку загрузки.
  orgGetCourses: vi.fn(),
  apiGetStudentTuitions: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../contexts/PermissionsContext', () => ({ usePermissions: vi.fn() }));
vi.mock('../../../contexts/PlanContext', () => ({ usePlanGate: vi.fn() }));
vi.mock('../../../contexts/BranchContext', () => ({ useBranch: vi.fn() }));
vi.mock('../../../hooks/useStudentRisks', () => ({ useStudentRisks: vi.fn() }));

// Тяжёлые дети, которые сами ходят в сеть, к предмету теста отношения не имеют.
vi.mock('../../../components/shared/MemberRolesEditor', () => ({ default: () => <div /> }));
vi.mock('../../../components/ai/ReportCommentModal', () => ({ default: () => null }));
vi.mock('../../../lib/badges', () => ({ PinnedBadgesDisplay: () => null }));

import StudentDetailPage from '../StudentDetailPage';
import * as apiModule from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { usePlanGate } from '../../../contexts/PlanContext';
import { useBranch } from '../../../contexts/BranchContext';
import { useStudentRisks } from '../../../hooks/useStudentRisks';

const api = apiModule as unknown as Record<string, ReturnType<typeof vi.fn>>;

const STUDENT = {
  uid: 'stu1',
  displayName: 'Айдана Кожомбердиева',
  email: 'aidana@example.com',
  phone: '+996555123456',
  status: 'active',
};

/** Здоровый студент: раньше его показатели на карточке не печатались вовсе. */
const HEALTHY_RISK = {
  studentId: 'stu1',
  studentName: STUDENT.displayName,
  riskLevel: 'low',
  averageScore: 4.6,
  attendanceRate: 92,
  streak: 3,
  daysSinceLastActive: 1,
  missedAssignments: 0,
  missedLessons: 0,
  hasActivity: true,
};

type Grants = { finances?: 'none' | 'read' | 'write'; students?: 'none' | 'read' | 'write'; roster?: boolean };

const setup = (opts: {
  role?: string;
  grants?: Grants;
  plans?: unknown[];
  plansReject?: boolean;
  risk?: Record<string, unknown> | null;
} = {}) => {
  const { role = 'manager', grants = {}, plans = [], plansReject = false, risk = HEALTHY_RISK } = opts;
  const fin = grants.finances ?? 'none';
  const stu = grants.students ?? 'read';

  (useAuth as any).mockReturnValue({ role, organizationId: 'org1' });
  (useBranch as any).mockReturnValue({ activeBranchId: null, setActiveBranch: vi.fn(), branches: [] });
  (usePlanGate as any).mockReturnValue({ canAccess: () => true });
  (usePermissions as any).mockReturnValue({
    loaded: true,
    can: (r: string, a = 'read') => (r === 'roster_management' ? !!grants.roster && a === 'write' : false),
    canRead: (r: string) => (r === 'finances' ? fin !== 'none' : r === 'students' ? stu !== 'none' : false),
    canWrite: (r: string) => (r === 'finances' ? fin === 'write' : r === 'students' ? stu === 'write' : false),
    canDelete: () => false,
  });
  (useStudentRisks as any).mockReturnValue({ riskByStudent: risk ? { stu1: risk } : {}, loading: false });

  api.orgGetStudents.mockResolvedValue([STUDENT]);
  api.orgGetResults.mockResolvedValue([]);
  api.orgGetGroups.mockResolvedValue([]);
  api.apiGetTransactions.mockResolvedValue([]);
  api.orgGetCourses.mockResolvedValue([]);
  api.apiGetStudentTuitions.mockResolvedValue([]);
  api.apiGetPaymentPlans.mockImplementation(() =>
    plansReject ? Promise.reject(new Error('Forbidden')) : Promise.resolve(plans));

  return render(
    <MemoryRouter initialEntries={['/students/stu1']}>
      <Routes><Route path="/students/:uid" element={<StudentDetailPage />} /></Routes>
    </MemoryRouter>,
  );
};

const OVERDUE_PLAN = {
  id: 'p1', studentId: 'stu1', courseName: 'Английский B1',
  totalAmount: 5000, paidAmount: 500, status: 'partial',
  deadline: '2020-01-01', period: '2026-07',
};

describe('StudentDetailPage — деньги', () => {
  beforeEach(() => vi.clearAllMocks());

  it('менеджеру без права на финансы не показывает денежный блок и не запрашивает счета', async () => {
    setup({ grants: { finances: 'none' } });
    await screen.findByText(STUDENT.displayName);
    // Главное: НЕ печатает «Начислений пока нет» — раньше 403 выглядел именно так.
    expect(screen.queryByText(/Начислений пока нет/)).toBeNull();
    expect(screen.queryByText(/^Оплаты$/)).toBeNull();
    expect(api.apiGetPaymentPlans).not.toHaveBeenCalled();
  });

  it('сбой загрузки счетов показывает ошибку, а не «Начислений пока нет»', async () => {
    setup({ grants: { finances: 'read' }, plansReject: true });
    await screen.findByText(STUDENT.displayName);
    await waitFor(() => expect(screen.getByText(/Не удалось загрузить/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Повторить/ })).toBeInTheDocument();
    // Ошибка не имеет права выглядеть как факт про деньги.
    expect(screen.queryByText(/Начислений пока нет/)).toBeNull();
  });

  it('при реально пустом списке счетов честно пишет «Начислений пока нет»', async () => {
    setup({ grants: { finances: 'read' }, plans: [] });
    await waitFor(() => expect(screen.getByText(/Начислений пока нет/)).toBeInTheDocument());
  });

  it('право read на финансы показывает долг, но не даёт принимать оплату', async () => {
    setup({ grants: { finances: 'read' }, plans: [OVERDUE_PLAN] });
    // Просрочка — отдельная ось, а не подмена статуса оплаты: метка «срок прошёл»
    // и бейдж «Частично» обязаны быть на экране ОДНОВРЕМЕННО. Раньше просрочка
    // затирала статус, и внесённый платёж переставал быть виден.
    await waitFor(() => expect(screen.getAllByText(/срок прошёл/).length).toBeGreaterThan(0));
    expect(screen.getByText('Частично')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Принять оплату/ })).toBeNull();
  });

  it('право write на финансы даёт «Принять оплату»', async () => {
    setup({ grants: { finances: 'write' }, plans: [OVERDUE_PLAN] });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Принять оплату/ }).length).toBeGreaterThan(0));
  });
});

describe('StudentDetailPage — контингент', () => {
  beforeEach(() => vi.clearAllMocks());

  it('преподаватель с «ведением контингента» получает действия по составу', async () => {
    setup({ role: 'teacher', grants: { students: 'write', roster: true } });
    await screen.findByText(STUDENT.displayName);
    expect(screen.getByRole('button', { name: /Группа/ })).toBeInTheDocument();
  });

  it('преподаватель без «ведения контингента» их не получает', async () => {
    setup({ role: 'teacher', grants: { students: 'read', roster: false } });
    await screen.findByText(STUDENT.displayName);
    expect(screen.queryByRole('button', { name: /Группа/ })).toBeNull();
  });
});

describe('StudentDetailPage — показатели', () => {
  beforeEach(() => vi.clearAllMocks());

  it('печатает посещаемость и средний балл у ЗДОРОВОГО студента', async () => {
    setup({ risk: HEALTHY_RISK });
    await screen.findByText(STUDENT.displayName);
    expect(screen.getByText('Посещаемость')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('4.6')).toBeInTheDocument();
    // Здоровому студенту не рисуем блок «что не так».
    expect(screen.queryByText(/Показатели ниже нормы/)).toBeNull();
  });

  it('без риск-профиля печатает «—», а не выдуманный ноль', async () => {
    setup({ risk: null });
    await screen.findByText(STUDENT.displayName);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('телефон — ссылка для звонка, а не подпись', async () => {
    setup();
    const tel = await screen.findByRole('link', { name: STUDENT.phone });
    expect(tel).toHaveAttribute('href', `tel:${STUDENT.phone}`);
  });
});
