import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  // Return the Russian fallback so assertions read as the user sees them.
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }),
}));
vi.mock('../../../contexts/BranchContext', () => ({ useBranch: vi.fn() }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../contexts/PermissionsContext', () => ({ usePermissions: vi.fn() }));

import BranchSwitcher from '../BranchSwitcher';
import { useBranch } from '../../../contexts/BranchContext';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermissions } from '../../../contexts/PermissionsContext';

const BRANCHES = [
  { id: 'b1', name: 'Центральный', city: 'Ош' },
  { id: 'b2', name: 'Южный' },
];

const setup = (branchOver: any = {}, authOver: any = {}, canRead = true) => {
  (useBranch as any).mockReturnValue({
    branches: BRANCHES,
    activeBranchId: null,
    activeBranch: null,
    setActiveBranch: vi.fn(),
    loading: false,
    canSwitch: true,
    refreshBranches: vi.fn(),
    ...branchOver,
  });
  (useAuth as any).mockReturnValue({
    organizationId: 'org1',
    isSuperAdmin: false,
    role: 'admin',
    ...authOver,
  });
  (usePermissions as any).mockReturnValue({ canRead: () => canRead });

  return render(
    <MemoryRouter>
      <BranchSwitcher />
    </MemoryRouter>
  );
};

describe('BranchSwitcher', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows «Все филиалы» when nothing is scoped', () => {
    setup();
    expect(screen.getByText('Все филиалы')).toBeInTheDocument();
  });

  it('shows the active branch name and its city', () => {
    setup({ activeBranchId: 'b1', activeBranch: BRANCHES[0] });
    expect(screen.getByText('Центральный')).toBeInTheDocument();
    expect(screen.getByText('Ош')).toBeInTheDocument();
  });

  it('lists «Все филиалы» plus every branch on open', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Переключить филиал/i }));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByText('Все филиалы').length).toBeGreaterThan(0);
    expect(screen.getByText('Центральный')).toBeInTheDocument();
    expect(screen.getByText('Южный')).toBeInTheDocument();
  });

  it('selects a branch', async () => {
    const setActiveBranch = vi.fn();
    setup({ setActiveBranch });

    fireEvent.click(screen.getByRole('button', { name: /Переключить филиал/i }));
    fireEvent.click(screen.getByText('Южный'));

    expect(setActiveBranch).toHaveBeenCalledWith('b2');
  });

  it('clears the scope back to «Все филиалы»', async () => {
    const setActiveBranch = vi.fn();
    setup({ activeBranchId: 'b1', activeBranch: BRANCHES[0], setActiveBranch });

    fireEvent.click(screen.getByRole('button', { name: /Переключить филиал/i }));
    fireEvent.click(screen.getAllByText('Все филиалы')[0]);

    expect(setActiveBranch).toHaveBeenCalledWith(null);
  });

  it('offers «Управлять филиалами» and drops the old org quick-links', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Переключить филиал/i }));

    expect(screen.getByText('Управлять филиалами')).toBeInTheDocument();
    // The three links this switcher replaced must be gone.
    expect(screen.queryByText('Пользователи')).not.toBeInTheDocument();
    expect(screen.queryByText('Филиалы')).not.toBeInTheDocument();
    expect(screen.queryByText('Настройки')).not.toBeInTheDocument();
  });

  it('hides «Управлять филиалами» without the branches grant', async () => {
    setup({}, { role: 'teacher' }, false);
    fireEvent.click(screen.getByRole('button', { name: /Переключить филиал/i }));

    expect(screen.queryByText('Управлять филиалами')).not.toBeInTheDocument();
    // ...but a teacher still gets the switcher itself.
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('renders for a student with branches', () => {
    setup({}, { role: 'student' }, false);
    expect(screen.getByRole('button', { name: /Переключить филиал/i })).toBeInTheDocument();
  });

  it('renders nothing for a super admin', () => {
    const { container } = setup({}, { isSuperAdmin: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the org has no branches and the user cannot manage them', () => {
    const { container } = setup({ branches: [], canSwitch: false }, { role: 'teacher' }, false);
    expect(container).toBeEmptyDOMElement();
  });
});
