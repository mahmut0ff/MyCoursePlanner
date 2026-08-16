import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Список преподавателей: колонка «кто подключил Telegram-уведомления».
 * Флаг приходит с сервера (`telegramLinked`) и только сотрудникам — в
 * студенческой версии списка поля нет, и колонки быть не должно.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fb?: string) => fb ?? _k, i18n: { language: 'ru' } }),
}));

vi.mock('../../../lib/api', () => ({
  orgGetTeachers: vi.fn(),
  orgCreateTeacher: vi.fn(),
  orgListBranches: vi.fn(),
  orgGetGroups: vi.fn(),
  apiDeleteMember: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../contexts/PermissionsContext', () => ({ usePermissions: vi.fn() }));
vi.mock('../../../contexts/PlanContext', () => ({ usePlanGate: vi.fn() }));
vi.mock('../../../hooks/useOrgPresence', () => ({ useOrgPresence: vi.fn() }));
vi.mock('../../../components/roster/BulkActionBar', () => ({ default: () => <div /> }));

import TeachersPage from '../TeachersPage';
import * as apiModule from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { usePlanGate } from '../../../contexts/PlanContext';
import { useOrgPresence } from '../../../hooks/useOrgPresence';

const api = apiModule as unknown as Record<string, ReturnType<typeof vi.fn>>;

const setup = (teachers: unknown[], role = 'admin') => {
  (useAuth as any).mockReturnValue({ role, organizationId: 'org1', profile: { uid: 'me', role } });
  (usePlanGate as any).mockReturnValue({ limits: { maxTeachers: -1 } });
  (useOrgPresence as any).mockReturnValue({ isOnline: () => false, lastSeenMs: () => null });
  (usePermissions as any).mockReturnValue({ loaded: true, canWrite: () => true, canDelete: () => true });

  api.orgGetTeachers.mockResolvedValue(teachers);
  api.orgListBranches.mockResolvedValue([]);
  api.orgGetGroups.mockResolvedValue([]);

  return render(<MemoryRouter><TeachersPage /></MemoryRouter>);
};

const LINKED = { uid: 't1', displayName: 'Рухсора', role: 'teacher', telegramLinked: true };
const UNLINKED = { uid: 't2', displayName: 'Айбек', role: 'teacher', telegramLinked: false };

describe('TeachersPage — Telegram-уведомления в списке', () => {
  beforeEach(() => vi.clearAllMocks());

  it('показывает, кто подключил, а кто нет', async () => {
    setup([LINKED, UNLINKED]);
    await screen.findByText('Рухсора');

    // По строке на состояние: на десктопе бейдж один, на мобиле — второй такой же.
    expect(screen.getAllByTitle('Подключён').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Не подключён').length).toBeGreaterThan(0);
    expect(screen.getByText('Telegram')).toBeInTheDocument();
  });

  it('без флага с сервера (студенческий список) колонки нет', async () => {
    setup([{ uid: 't1', displayName: 'Рухсора', role: 'teacher' }]);
    await screen.findByText('Рухсора');

    expect(screen.queryByText('Telegram')).toBeNull();
    expect(screen.queryByTitle('Не подключён')).toBeNull();
  });
});
