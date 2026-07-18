import { describe, it, expect, vi } from 'vitest';
import type { AuthUser, ManagerPermissions } from '../utils/auth';

// Mock firebase-admin to prevent credential initialization in tests
vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: { collection: vi.fn() },
}));

import {
  isSuperAdmin,
  isStaff,
  isManager,
  hasRole,
  hasPermission,
  getOrgFilter,
  userHasBranchAccess,
  requireBranchScope,
  resolveBranchFilter,
  getMembershipData,
  resolveOrgRole,
} from '../utils/auth';
import { adminDb } from '../utils/firebase-admin';

// ── Helpers ──────────────────────────────────────────────────────

const NO_PERMS: ManagerPermissions = { finances: false, settings: false, managers: false, branches: false };
const ALL_PERMS: ManagerPermissions = { finances: true, settings: true, managers: true, branches: true };

function makeUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    uid: 'test-uid',
    email: 'test@example.com',
    role: 'student',
    displayName: 'Test User',
    organizationId: 'org-1',
    planId: 'starter',
    aiEnabled: false,
    branchIds: [],
    primaryBranchId: null,
    permissions: { ...NO_PERMS },
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════
// 1. Role check helpers
// ═════════════════════════════════════════════════════════════════

describe('isSuperAdmin', () => {
  it('returns true for super_admin', () => {
    expect(isSuperAdmin(makeUser({ role: 'super_admin' }))).toBe(true);
  });
  it('returns false for admin', () => {
    expect(isSuperAdmin(makeUser({ role: 'admin' }))).toBe(false);
  });
  it('returns false for student', () => {
    expect(isSuperAdmin(makeUser({ role: 'student' }))).toBe(false);
  });
});

describe('isStaff', () => {
  it.each([
    ['super_admin', true],
    ['admin', true],
    ['manager', true],
    ['teacher', true],
    ['student', false],
  ] as const)('%s → %s', (role, expected) => {
    expect(isStaff(makeUser({ role }))).toBe(expected);
  });
});

describe('isManager', () => {
  it('returns true only for manager', () => {
    expect(isManager(makeUser({ role: 'manager' }))).toBe(true);
    expect(isManager(makeUser({ role: 'admin' }))).toBe(false);
  });
});

describe('hasRole', () => {
  it('matches single role', () => {
    expect(hasRole(makeUser({ role: 'teacher' }), 'teacher')).toBe(true);
  });
  it('matches one of multiple roles', () => {
    expect(hasRole(makeUser({ role: 'admin' }), 'admin', 'manager')).toBe(true);
  });
  it('returns false for non-matching role', () => {
    expect(hasRole(makeUser({ role: 'student' }), 'admin', 'teacher')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. hasPermission (granular manager permissions)
// ═════════════════════════════════════════════════════════════════

describe('hasPermission', () => {
  it('super_admin always has all permissions', () => {
    const user = makeUser({ role: 'super_admin', permissions: { ...NO_PERMS } });
    expect(hasPermission(user, 'finances')).toBe(true);
    expect(hasPermission(user, 'settings')).toBe(true);
    expect(hasPermission(user, 'branches')).toBe(true);
  });

  it('admin always has all permissions', () => {
    const user = makeUser({ role: 'admin', permissions: { ...NO_PERMS } });
    expect(hasPermission(user, 'finances')).toBe(true);
  });

  it('manager gets permission from their specific flags', () => {
    const user = makeUser({
      role: 'manager',
      permissions: { finances: true, settings: false, managers: false, branches: false },
    });
    expect(hasPermission(user, 'finances')).toBe(true);
    expect(hasPermission(user, 'settings')).toBe(false);
    expect(hasPermission(user, 'managers')).toBe(false);
  });

  it('teacher always gets false', () => {
    const user = makeUser({ role: 'teacher', permissions: { ...ALL_PERMS } });
    expect(hasPermission(user, 'finances')).toBe(false);
  });

  it('student always gets false', () => {
    const user = makeUser({ role: 'student', permissions: { ...ALL_PERMS } });
    expect(hasPermission(user, 'finances')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. getOrgFilter
// ═════════════════════════════════════════════════════════════════

describe('getOrgFilter', () => {
  it('super_admin gets null (no filter = see all)', () => {
    expect(getOrgFilter(makeUser({ role: 'super_admin' }))).toBeNull();
  });

  it('regular user gets their orgId as filter', () => {
    expect(getOrgFilter(makeUser({ role: 'admin', organizationId: 'org-X' }))).toBe('org-X');
  });

  it('user without org gets null', () => {
    expect(getOrgFilter(makeUser({ role: 'student', organizationId: null }))).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. Branch access helpers
// ═════════════════════════════════════════════════════════════════

describe('userHasBranchAccess', () => {
  it('super_admin can access any branch', () => {
    expect(userHasBranchAccess(makeUser({ role: 'super_admin' }), 'branch-X')).toBe(true);
  });

  it('admin can access any branch', () => {
    expect(userHasBranchAccess(makeUser({ role: 'admin' }), 'branch-X')).toBe(true);
  });

  it('user with empty branchIds has org-wide access', () => {
    expect(userHasBranchAccess(makeUser({ role: 'teacher', branchIds: [] }), 'branch-X')).toBe(true);
  });

  it('user with assigned branches can access their branch', () => {
    const user = makeUser({ role: 'teacher', branchIds: ['b1', 'b2'] });
    expect(userHasBranchAccess(user, 'b1')).toBe(true);
    expect(userHasBranchAccess(user, 'b2')).toBe(true);
  });

  it('user with assigned branches CANNOT access alien branch', () => {
    const user = makeUser({ role: 'teacher', branchIds: ['b1', 'b2'] });
    expect(userHasBranchAccess(user, 'b3')).toBe(false);
  });
});

describe('requireBranchScope', () => {
  it('returns null (allowed) when branchId is undefined', () => {
    expect(requireBranchScope(makeUser({ role: 'teacher' }), undefined)).toBeNull();
  });

  it('returns null (allowed) when branchId is null', () => {
    expect(requireBranchScope(makeUser({ role: 'teacher' }), null)).toBeNull();
  });

  it('returns null (allowed) when user has access', () => {
    const user = makeUser({ role: 'teacher', branchIds: ['b1'] });
    expect(requireBranchScope(user, 'b1')).toBeNull();
  });

  it('returns forbidden response when user lacks access', () => {
    const user = makeUser({ role: 'teacher', branchIds: ['b1'] });
    const result = requireBranchScope(user, 'b2');
    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. resolveBranchFilter
// ═════════════════════════════════════════════════════════════════

describe('resolveBranchFilter', () => {
  it('admin with no filter → null (show all)', () => {
    expect(resolveBranchFilter(makeUser({ role: 'admin' }))).toBeNull();
  });

  it('admin with requested filter → returns requested branchId', () => {
    expect(resolveBranchFilter(makeUser({ role: 'admin' }), 'b1')).toBe('b1');
  });

  it('super_admin with no filter → null', () => {
    expect(resolveBranchFilter(makeUser({ role: 'super_admin' }))).toBeNull();
  });

  it('teacher with no branches → null (org-wide)', () => {
    expect(resolveBranchFilter(makeUser({ role: 'teacher', branchIds: [] }))).toBeNull();
  });

  // The derived default scope is always the array form. Callers read a bare string
  // as "this exact branch was requested" and drop org-wide (branchId: null) records,
  // which would hide every shared course/group/event from a one-branch member.
  it('teacher with 1 branch, no filter → array of their branches', () => {
    const user = makeUser({ role: 'teacher', branchIds: ['b1'] });
    expect(resolveBranchFilter(user)).toEqual(['b1']);
  });

  it('teacher with 2 branches, no filter → array of branches', () => {
    const user = makeUser({ role: 'teacher', branchIds: ['b1', 'b2'] });
    expect(resolveBranchFilter(user)).toEqual(['b1', 'b2']);
  });

  it('teacher requests valid branch → that branch', () => {
    const user = makeUser({ role: 'teacher', branchIds: ['b1', 'b2'] });
    expect(resolveBranchFilter(user, 'b1')).toBe('b1');
  });

  it('teacher requests alien branch → __DENIED__ sentinel', () => {
    const user = makeUser({ role: 'teacher', branchIds: ['b1'] });
    expect(resolveBranchFilter(user, 'b99')).toBe('__DENIED__');
  });

  // An org-wide (unassigned) member is unrestricted, but the branch filter in their UI
  // must still narrow the list — otherwise picking a branch is a silent no-op for
  // everyone who isn't an admin.
  it('org-wide manager requests a branch → that branch', () => {
    const user = makeUser({ role: 'manager', branchIds: [] });
    expect(resolveBranchFilter(user, 'b1')).toBe('b1');
  });

  it('org-wide teacher requests a branch → that branch', () => {
    const user = makeUser({ role: 'teacher', branchIds: [] });
    expect(resolveBranchFilter(user, 'b1')).toBe('b1');
  });
});

// ═════════════════════════════════════════════════════════════════
// 6. Membership resolution (user-side doc + org-side mirror fallback)
// ═════════════════════════════════════════════════════════════════

// Staff created via api-org (e.g. createUser/createTeacher) may only get the
// org-side mirror doc (orgMembers/{orgId}/members/{uid}); the fallback keeps
// them from resolving to "no role" (403 Forbidden on membership endpoints).
function mockMembershipDb(opts: { userSide?: Record<string, any> | null; orgSide?: Record<string, any> | null }) {
  const userSideSet = vi.fn().mockResolvedValue(undefined);
  const userSideGet = vi.fn().mockResolvedValue({ exists: !!opts.userSide, data: () => opts.userSide });
  const orgSideGet = vi.fn().mockResolvedValue({ exists: !!opts.orgSide, data: () => opts.orgSide });

  (adminDb.collection as any).mockImplementation((col: string) => ({
    doc: () => ({
      collection: () => ({
        doc: () => (col === 'users'
          ? { get: userSideGet, set: userSideSet }
          : { get: orgSideGet }),
      }),
    }),
  }));

  return { userSideSet, orgSideGet };
}

describe('getMembershipData (org-side mirror fallback)', () => {
  it('prefers the user-side doc when it exists', async () => {
    const { userSideSet, orgSideGet } = mockMembershipDb({
      userSide: { role: 'teacher', status: 'active' },
      orgSide: { role: 'manager', status: 'active' },
    });
    const data = await getMembershipData('u1', 'org1');
    expect(data).toEqual({ role: 'teacher', status: 'active' });
    expect(orgSideGet).not.toHaveBeenCalled();
    expect(userSideSet).not.toHaveBeenCalled();
  });

  it('falls back to the org-side mirror and backfills the user-side doc', async () => {
    const { userSideSet } = mockMembershipDb({
      userSide: null,
      orgSide: { role: 'manager', status: 'active', branchIds: ['b1'] },
    });
    const data = await getMembershipData('u1', 'org1');
    expect(data).toMatchObject({ role: 'manager', status: 'active' });
    expect(userSideSet).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'manager', status: 'active', organizationId: 'org1' }),
      { merge: true },
    );
  });

  it('returns null when neither side has a doc', async () => {
    mockMembershipDb({ userSide: null, orgSide: null });
    expect(await getMembershipData('u1', 'org1')).toBeNull();
  });
});

describe('resolveOrgRole', () => {
  const NULL_RESULT = { role: null, roles: [], roleId: null, branchIds: [], primaryBranchId: null, permissions: { ...NO_PERMS }, overrides: null };

  it('resolves a legacy manager who only has the org-side mirror doc', async () => {
    mockMembershipDb({
      userSide: null,
      orgSide: { role: 'manager', status: 'active', branchIds: ['b1'], primaryBranchId: 'b1' },
    });
    const result = await resolveOrgRole('u1', 'org1');
    expect(result.role).toBe('manager');
    expect(result.branchIds).toEqual(['b1']);
    expect(result.primaryBranchId).toBe('b1');
  });

  it('returns nulls when the membership is not active', async () => {
    mockMembershipDb({ userSide: { role: 'manager', status: 'removed' }, orgSide: null });
    expect(await resolveOrgRole('u1', 'org1')).toEqual(NULL_RESULT);
  });

  it('does not resolve a role from an inactive org-side doc', async () => {
    mockMembershipDb({ userSide: null, orgSide: { role: 'manager', status: 'removed' } });
    expect(await resolveOrgRole('u1', 'org1')).toEqual(NULL_RESULT);
  });
});
