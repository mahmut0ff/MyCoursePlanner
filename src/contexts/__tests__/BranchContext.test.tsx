import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// The api module is mocked, so the real interceptor is exercised separately below
// via a dedicated unmocked import.
vi.mock('../../lib/api', () => ({
  orgListBranches: vi.fn(),
  setActiveBranchId: vi.fn(),
}));
vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { BranchProvider, useBranch } from '../BranchContext';
import { orgListBranches, setActiveBranchId } from '../../lib/api';
import { useAuth } from '../AuthContext';

const BRANCHES = [
  { id: 'b1', name: 'Центральный', isActive: true },
  { id: 'b2', name: 'Южный', isActive: true },
];

/** Surfaces the context so assertions can read it without a real page. */
const Probe = () => {
  const { activeBranchId, branches, loading, canSwitch } = useBranch();
  return (
    <div>
      <span data-testid="active">{activeBranchId ?? 'ALL'}</span>
      <span data-testid="count">{branches.length}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="canSwitch">{String(canSwitch)}</span>
    </div>
  );
};

const renderProvider = () =>
  render(
    <BranchProvider>
      <Probe />
    </BranchProvider>
  );

const setAuth = (over: Record<string, unknown> = {}) =>
  (useAuth as any).mockReturnValue({
    organizationId: 'org1',
    isSuperAdmin: false,
    primaryBranchId: null,
    loading: false,
    ...over,
  });

describe('BranchContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setAuth();
    (orgListBranches as any).mockResolvedValue(BRANCHES);
  });

  it('defaults to «Все филиалы» when the member has several branches and no stored pick', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    expect(screen.getByTestId('active').textContent).toBe('ALL');
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('canSwitch').textContent).toBe('true');
  });

  it('restores a stored selection scoped to the same org', async () => {
    localStorage.setItem('mycourseplanner_active_branch', JSON.stringify({ orgId: 'org1', branchId: 'b2' }));

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('b2'));
  });

  it('ignores a stored selection belonging to a DIFFERENT org', async () => {
    // The pre-existing key was org-agnostic, which let a branch id from one org
    // silently scope another. Guard against that regressing.
    localStorage.setItem('mycourseplanner_active_branch', JSON.stringify({ orgId: 'otherOrg', branchId: 'b2' }));

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('active').textContent).toBe('ALL');
  });

  it('ignores a stored branch the server no longer returns (revoked assignment)', async () => {
    localStorage.setItem('mycourseplanner_active_branch', JSON.stringify({ orgId: 'org1', branchId: 'revoked' }));

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    // Must not fall through to the server, which would answer with a scope violation.
    expect(screen.getByTestId('active').textContent).toBe('ALL');
  });

  it('seeds from primaryBranchId when nothing is stored', async () => {
    setAuth({ primaryBranchId: 'b2' });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('b2'));
  });

  it('auto-selects the only branch and reports canSwitch=false', async () => {
    (orgListBranches as any).mockResolvedValue([BRANCHES[0]]);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('b1'));
    expect(screen.getByTestId('canSwitch').textContent).toBe('false');
  });

  it('drops inactive branches', async () => {
    (orgListBranches as any).mockResolvedValue([...BRANCHES, { id: 'b3', name: 'Закрытый', isActive: false }]);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
  });

  it('pushes the selection into the api client so requests get scoped', async () => {
    localStorage.setItem('mycourseplanner_active_branch', JSON.stringify({ orgId: 'org1', branchId: 'b2' }));

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('b2'));

    expect(setActiveBranchId).toHaveBeenCalledWith('b2');
  });

  it('skips the branch fetch entirely for super admins', async () => {
    setAuth({ isSuperAdmin: true });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    expect(orgListBranches).not.toHaveBeenCalled();
    expect(screen.getByTestId('active').textContent).toBe('ALL');
  });

  it('falls back to org-wide when the branch list cannot be read', async () => {
    (orgListBranches as any).mockRejectedValue(new Error('403'));

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    expect(screen.getByTestId('active').textContent).toBe('ALL');
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('clears the superseded per-instance filter key', async () => {
    localStorage.setItem('mycourseplanner_branch_filter', 'b1');

    renderProvider();
    await act(async () => {});

    expect(localStorage.getItem('mycourseplanner_branch_filter')).toBeNull();
  });
});
