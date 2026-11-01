/**
 * «Роли в организации» в карточке: роли из «Роли и доступы», а не зашитые четыре.
 * Своя роль стоит на базовой (менеджер) — её не показываем отдельным «Менеджером»,
 * а при сохранении возвращаем; чужие для сотрудников роли (студент) не теряются.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  apiGetMemberRoles: vi.fn(),
  apiSetMemberRoles: vi.fn(),
  apiGetRoles: vi.fn(),
  apiAssignRole: vi.fn(),
}));
vi.mock('../../../lib/api', () => api);
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import MemberRolesEditor from '../MemberRolesEditor';

const pressed = (name: string | RegExp) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('MemberRolesEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.apiGetRoles.mockResolvedValue({ items: [{ id: 'r1', name: 'Бухгалтер', baseRole: 'manager', permissions: [] }] });
    api.apiSetMemberRoles.mockResolvedValue({});
    api.apiAssignRole.mockResolvedValue({});
  });

  it('показывает назначенную свою роль вместо базового менеджера', async () => {
    api.apiGetMemberRoles.mockResolvedValue({ role: 'teacher', roles: ['teacher', 'manager'], roleId: 'r1' });
    render(<MemberRolesEditor uid="u1" orgId="o1" />);
    await screen.findByRole('button', { name: 'Бухгалтер' });
    expect(pressed('Бухгалтер')).toBe('true');
    expect(pressed('Преподаватель')).toBe('true');
    expect(pressed(/Менеджер/)).toBe('false');
    expect(screen.queryByRole('button', { name: 'Директор' })).toBeNull();
  });

  it('студенту назначается своя роль, роль студента сохраняется', async () => {
    api.apiGetMemberRoles.mockResolvedValue({ role: 'student', roles: ['student'], roleId: null });
    render(<MemberRolesEditor uid="u1" orgId="o1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Бухгалтер' }));
    expect(pressed('Студент')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => expect(api.apiAssignRole).toHaveBeenCalledWith('u1', 'r1'));
    expect(api.apiSetMemberRoles).toHaveBeenCalledWith('u1', 'o1', ['student', 'manager']);
  });

  it('снятие своей роли в пользу менеджера снимает назначение', async () => {
    api.apiGetMemberRoles.mockResolvedValue({ role: 'manager', roles: ['manager'], roleId: 'r1' });
    render(<MemberRolesEditor uid="u1" orgId="o1" />);
    fireEvent.click(await screen.findByRole('button', { name: /Менеджер/ }));
    expect(pressed('Бухгалтер')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => expect(api.apiAssignRole).toHaveBeenCalledWith('u1', null));
    expect(api.apiSetMemberRoles).toHaveBeenCalledWith('u1', 'o1', ['manager']);
  });
});
