import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthUser, ManagerPermissions } from '../utils/auth';

// Mock firebase-admin to prevent credential initialization at import time.
// getDocsByIds is what resolveBulkTargets reads the roster through.
vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: { collection: vi.fn(), batch: vi.fn(), getAll: vi.fn() },
  getDocsByIds: vi.fn(),
}));

import { parseBulkBody, resolveBulkTargets } from '../api-org';
import { can } from '../utils/auth';
import { getDocsByIds } from '../utils/firebase-admin';

// ── Helpers ──────────────────────────────────────────────────────

const NO_PERMS: ManagerPermissions = { finances: false, settings: false, managers: false, branches: false };

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    uid: 'caller-uid',
    email: 'manager@example.com',
    role: 'manager',
    displayName: 'Manager',
    organizationId: 'org-1',
    planId: 'pro',
    aiEnabled: false,
    branchIds: [],
    primaryBranchId: null,
    permissions: { ...NO_PERMS },
    customRoleId: null,
    rbac: new Set([
      'students:read', 'students:write', 'students:delete',
      'teachers:read', 'teachers:write', 'teachers:delete',
    ]),
    ...overrides,
  };
}

/** Stub the org roster getDocsByIds reads: uid -> member doc. */
function mockRoster(members: Record<string, any>) {
  (getDocsByIds as any).mockResolvedValue(members);
}

const student = (uid: string, extra: Record<string, any> = {}) => ({ userId: uid, role: 'student', ...extra });
const teacher = (uid: string, extra: Record<string, any> = {}) => ({ userId: uid, role: 'teacher', ...extra });

beforeEach(() => vi.clearAllMocks());

// ═════════════════════════════════════════════════════════════════
// parseBulkBody
// ═════════════════════════════════════════════════════════════════

describe('parseBulkBody', () => {
  it('accepts a well-formed student body', () => {
    const out = parseBulkBody({ kind: 'student', uids: ['a', 'b'] });
    expect(out).toEqual({ kind: 'student', uids: ['a', 'b'] });
  });

  it('accepts a well-formed teacher body', () => {
    expect(parseBulkBody({ kind: 'teacher', uids: ['a'] })).toEqual({ kind: 'teacher', uids: ['a'] });
  });

  it.each([
    ['missing', undefined],
    ['unknown', 'admin'],
    ['empty', ''],
  ])('rejects a %s kind rather than defaulting to a roster', (_label, kind) => {
    const out = parseBulkBody({ kind, uids: ['a'] }) as any;
    expect(out.error).toBeDefined();
    expect(out.error.statusCode).toBe(400);
  });

  it('dedupes uids so a repeated id is not counted twice', () => {
    expect(parseBulkBody({ kind: 'student', uids: ['a', 'a', 'b'] })).toEqual({ kind: 'student', uids: ['a', 'b'] });
  });

  it('trims and drops blank / non-string uids', () => {
    expect(parseBulkBody({ kind: 'student', uids: [' a ', '', null, 42, 'b'] })).toEqual({ kind: 'student', uids: ['a', 'b'] });
  });

  it('rejects an empty uid list', () => {
    expect((parseBulkBody({ kind: 'student', uids: [] }) as any).error.statusCode).toBe(400);
    expect((parseBulkBody({ kind: 'student' }) as any).error.statusCode).toBe(400);
  });

  it('caps the batch size', () => {
    const uids = Array.from({ length: 501 }, (_, i) => `u${i}`);
    expect((parseBulkBody({ kind: 'student', uids }) as any).error.statusCode).toBe(400);
    expect(parseBulkBody({ kind: 'student', uids: uids.slice(0, 500) })).toHaveProperty('uids');
  });
});

// ═════════════════════════════════════════════════════════════════
// The grants each bulk action is gated on
// ═════════════════════════════════════════════════════════════════

describe('bulk action gates', () => {
  it('write does not imply delete — migrating is not erasing', () => {
    const u = makeUser({ rbac: new Set(['students:read', 'students:write']) });
    expect(can(u, 'students', 'write')).toBe(true);   // may migrate
    expect(can(u, 'students', 'delete')).toBe(false); // may not delete
  });

  it('gates each roster on its own resource', () => {
    const u = makeUser({ rbac: new Set(['students:write', 'students:delete']) });
    expect(can(u, 'teachers', 'write')).toBe(false);
    expect(can(u, 'teachers', 'delete')).toBe(false);
  });

  it('a read-only member gets neither', () => {
    const u = makeUser({ role: 'teacher', rbac: new Set(['students:read']) });
    expect(can(u, 'students', 'write')).toBe(false);
    expect(can(u, 'students', 'delete')).toBe(false);
  });

  it('admins bypass the roster grants entirely', () => {
    const u = makeUser({ role: 'admin', rbac: new Set() });
    expect(can(u, 'students', 'delete')).toBe(true);
    expect(can(u, 'teachers', 'delete')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// resolveBulkTargets — the trust boundary for every bulk action
// ═════════════════════════════════════════════════════════════════

describe('resolveBulkTargets', () => {
  it('keeps members of this org holding the addressed role', async () => {
    mockRoster({ s1: student('s1'), s2: student('s2') });
    const { targets } = await resolveBulkTargets(makeUser(), 'org-1', 'student', ['s1', 's2']);
    expect(targets).toEqual(['s1', 's2']);
  });

  it('drops uids with no membership in this org', async () => {
    mockRoster({ s1: student('s1') }); // s2 belongs to another tenant
    const { targets } = await resolveBulkTargets(makeUser(), 'org-1', 'student', ['s1', 's2']);
    expect(targets).toEqual(['s1']);
  });

  it('drops members that do not hold the addressed role', async () => {
    mockRoster({ s1: student('s1'), t1: teacher('t1') });
    const asStudents = await resolveBulkTargets(makeUser(), 'org-1', 'student', ['s1', 't1']);
    expect(asStudents.targets).toEqual(['s1']);
    const asTeachers = await resolveBulkTargets(makeUser(), 'org-1', 'teacher', ['s1', 't1']);
    expect(asTeachers.targets).toEqual(['t1']);
  });

  it('counts a secondary role — a teacher+student is on the student roster', async () => {
    mockRoster({ m1: { userId: 'm1', role: 'teacher', roles: ['teacher', 'student'] } });
    const { targets } = await resolveBulkTargets(makeUser(), 'org-1', 'student', ['m1']);
    expect(targets).toEqual(['m1']);
  });

  it('never targets the caller', async () => {
    mockRoster({ 'caller-uid': student('caller-uid'), s1: student('s1') });
    const { targets } = await resolveBulkTargets(makeUser(), 'org-1', 'student', ['caller-uid', 's1']);
    expect(targets).toEqual(['s1']);
  });

  it('never targets an owner or admin, even on the teacher roster', async () => {
    mockRoster({
      owner: { userId: 'owner', role: 'owner', roles: ['owner', 'teacher'] },
      adm: { userId: 'adm', role: 'admin', roles: ['admin', 'teacher'] },
      t1: teacher('t1'),
    });
    const { targets } = await resolveBulkTargets(makeUser(), 'org-1', 'teacher', ['owner', 'adm', 't1']);
    expect(targets).toEqual(['t1']);
  });

  it('mentors count as teachers', async () => {
    mockRoster({ m1: { userId: 'm1', role: 'mentor' } });
    const { targets } = await resolveBulkTargets(makeUser(), 'org-1', 'teacher', ['m1']);
    expect(targets).toEqual(['m1']);
  });

  describe('branch scoping', () => {
    const scoped = makeUser({ branchIds: ['b1'] });

    it('narrows a branch-scoped manager to their own branches', async () => {
      mockRoster({
        mine: student('mine', { branchIds: ['b1'] }),
        theirs: student('theirs', { branchIds: ['b2'] }),
        shared: student('shared', { branchIds: ['b2', 'b1'] }),
      });
      const { targets } = await resolveBulkTargets(scoped, 'org-1', 'student', ['mine', 'theirs', 'shared']);
      expect(targets).toEqual(['mine', 'shared']);
    });

    it('lets a branch-scoped manager act on unassigned members, mirroring the list', async () => {
      mockRoster({ none: student('none', { branchIds: [] }), missing: student('missing') });
      const { targets } = await resolveBulkTargets(scoped, 'org-1', 'student', ['none', 'missing']);
      expect(targets).toEqual(['none', 'missing']);
    });

    it('does not narrow a manager with no branch assignment', async () => {
      mockRoster({ a: student('a', { branchIds: ['b1'] }), b: student('b', { branchIds: ['b2'] }) });
      const { targets } = await resolveBulkTargets(makeUser(), 'org-1', 'student', ['a', 'b']);
      expect(targets).toEqual(['a', 'b']);
    });

    it('does not narrow an admin', async () => {
      const admin = makeUser({ role: 'admin', branchIds: ['b1'] });
      mockRoster({ a: student('a', { branchIds: ['b2'] }) });
      const { targets } = await resolveBulkTargets(admin, 'org-1', 'student', ['a']);
      expect(targets).toEqual(['a']);
    });
  });

  it('reads the roster of the caller-resolved org, not one from the request', async () => {
    mockRoster({ s1: student('s1') });
    await resolveBulkTargets(makeUser(), 'org-1', 'student', ['s1']);
    expect(getDocsByIds).toHaveBeenCalledWith('orgMembers/org-1/members', ['s1']);
  });
});
