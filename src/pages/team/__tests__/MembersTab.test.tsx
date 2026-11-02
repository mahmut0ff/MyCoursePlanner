/**
 * «Создать сотрудника»: в выборе ролей — роли организации, а не зашитый список.
 * Своя роль встаёт на свою базовую роль и назначается после создания аккаунта.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  apiGetTeamMembers: vi.fn(),
  apiGetRoles: vi.fn(),
  apiAssignRole: vi.fn(),
  apiSetMemberOverrides: vi.fn(),
  orgCreateUser: vi.fn(),
}));
vi.mock('../../../lib/api', () => api);

import MembersTab from '../MembersTab';

const openCreate = async () => {
  render(<MembersTab isAdmin />);
  fireEvent.click(await screen.findByRole('button', { name: /Создать сотрудника/ }));
  // search, name, login, email, password
  const [, name, login, , password] = screen.getAllByRole('textbox');
  fireEvent.change(name, { target: { value: 'Айгерим' } });
  fireEvent.change(login, { target: { value: 'aigerim' } });
  fireEvent.change(password, { target: { value: 'secret1' } });
};

describe('MembersTab — создание сотрудника', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.apiGetTeamMembers.mockResolvedValue({ items: [] });
    api.apiGetRoles.mockResolvedValue({ items: [{ id: 'r1', name: 'Бухгалтер', baseRole: 'manager', permissions: [] }] });
    api.orgCreateUser.mockResolvedValue({ uid: 'u1' });
    api.apiAssignRole.mockResolvedValue({});
  });

  it('показывает свои роли рядом с системными, без «Студента»', async () => {
    await openCreate();
    expect(screen.getByRole('button', { name: 'Бухгалтер' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Менеджер/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Студент/ })).toBeNull();
  });

  it('своя роль заменяет менеджера по умолчанию и назначается после создания', async () => {
    await openCreate();
    expect(screen.getByRole('button', { name: /Менеджер/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Бухгалтер' }));
    expect(screen.getByRole('button', { name: /Менеджер/ }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /^Создать$/ }));
    await waitFor(() => expect(api.apiAssignRole).toHaveBeenCalledWith('u1', 'r1'));
    expect(api.orgCreateUser).toHaveBeenCalledWith(expect.objectContaining({ roles: ['manager'] }));
  });

  it('преподаватель сочетается со своей ролью', async () => {
    await openCreate();
    fireEvent.click(screen.getByRole('button', { name: 'Преподаватель' }));
    fireEvent.click(screen.getByRole('button', { name: 'Бухгалтер' }));
    fireEvent.click(screen.getByRole('button', { name: /^Создать$/ }));
    await waitFor(() => expect(api.orgCreateUser).toHaveBeenCalled());
    expect(api.orgCreateUser.mock.calls[0][0].roles).toEqual(['teacher', 'manager']);
  });
});
