import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  // Return the Russian fallback so labels read as the user sees them.
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }),
}));
vi.mock('../../../contexts/BranchContext', () => ({ useBranch: vi.fn() }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../contexts/OrgContext', () => ({ useOrg: vi.fn() }));
vi.mock('../../../contexts/PlanContext', () => ({ usePlanGate: vi.fn() }));
vi.mock('../../../contexts/PermissionsContext', () => ({ usePermissions: vi.fn() }));

import { useNavModel, type NavModelOptions, type NavSectionDef } from '../navModel';
import { useBranch } from '../../../contexts/BranchContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useOrg } from '../../../contexts/OrgContext';
import { usePlanGate } from '../../../contexts/PlanContext';
import { usePermissions } from '../../../contexts/PermissionsContext';

/** Every nav id the model produced, flattened across sections. */
const idsOf = (sections: NavSectionDef[]) => sections.flatMap((s) => s.items.map((it) => it.id));

const setup = (branchOver: any = {}, authOver: any = {}, opts?: NavModelOptions) => {
  (useBranch as any).mockReturnValue({
    branches: [{ id: 'b1', name: 'Центральный' }, { id: 'b2', name: 'Южный' }],
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
    isTeacher: false,
    isManager: false,
    role: 'admin',
    ...authOver,
  });
  // Professional so the plan-gated student entry is not the thing under test.
  (useOrg as any).mockReturnValue({ orgData: { planId: 'professional' } });
  (usePlanGate as any).mockReturnValue({ canAccess: () => true });
  // Grant everything: RBAC runs BEFORE the branch filter, and letting it trim
  // items here would hide which of the two actually dropped an entry.
  (usePermissions as any).mockReturnValue({ canRead: () => true });

  const { result } = renderHook(() => useNavModel('language_center', opts));
  return idsOf(result.current);
};

const ADMIN = {};
const TEACHER = { role: 'teacher', isTeacher: true };
const STUDENT = { role: 'student', isTeacher: false };

const ALL_BRANCHES = { activeBranchId: null };
const ONE_BRANCH = { activeBranchId: 'b1', activeBranch: { id: 'b1', name: 'Центральный' } };
const NO_SWITCH = { canSwitch: false };

describe('useNavModel — branch scope filter', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('admin', () => {
    it('under «Все филиалы» keeps org-wide destinations and drops branch-scoped ones', () => {
      const ids = setup(ALL_BRANCHES, ADMIN);

      expect(ids).toContain('courses');
      expect(ids).not.toContain('groups');
      // ...and the rest of each set moves together with its representative.
      expect(ids).toEqual(expect.arrayContaining(['materials', 'quizLibrary', 'leads']));
      expect(ids).not.toContain('schedule');
      expect(ids).not.toContain('journal');
      expect(ids).not.toContain('gradebook');
      expect(ids).not.toContain('finances');
    });

    it('under a specific branch keeps branch-scoped destinations and drops org-wide ones', () => {
      const ids = setup(ONE_BRANCH, ADMIN);

      expect(ids).toContain('groups');
      expect(ids).not.toContain('courses');
      expect(ids).toEqual(expect.arrayContaining(['schedule', 'journal', 'gradebook', 'finances']));
      expect(ids).not.toContain('materials');
      expect(ids).not.toContain('quizLibrary');
      expect(ids).not.toContain('leads');
      // «Команда и роли» survives a branch selection on purpose: no other screen
      // links to /team, so scoping it would strand the admin from RBAC entirely.
      expect(ids).toContain('team');
    });

    it('leaves unclassified destinations in both modes', () => {
      const all = setup(ALL_BRANCHES, ADMIN);
      const one = setup(ONE_BRANCH, ADMIN);

      for (const id of ['dashboard', 'lessons', 'exams', 'students']) {
        expect(all).toContain(id);
        expect(one).toContain(id);
      }
    });
  });

  describe('the filter is off without a switcher', () => {
    // A single-branch org auto-selects its one branch and a branchless org is
    // stuck at null; scoping either would permanently amputate half the menu.
    it('keeps BOTH courses and groups when canSwitch is false and nothing is scoped', () => {
      const ids = setup({ ...NO_SWITCH, ...ALL_BRANCHES, branches: [] }, ADMIN);

      expect(ids).toContain('courses');
      expect(ids).toContain('groups');
    });

    it('keeps BOTH courses and groups when canSwitch is false and one branch is auto-selected', () => {
      const ids = setup({ ...NO_SWITCH, ...ONE_BRANCH, branches: [{ id: 'b1', name: 'Центральный' }] }, ADMIN);

      expect(ids).toContain('courses');
      expect(ids).toContain('groups');
    });
  });

  describe('the same rule applies to every role', () => {
    it('filters a teacher with an org', () => {
      const all = setup(ALL_BRANCHES, TEACHER);
      expect(all).toContain('courses');
      expect(all).not.toContain('groups');
      expect(all).not.toContain('journal');
      // Teacher-only, unclassified: survives either way.
      expect(all).toContain('homeworkReview');

      const one = setup(ONE_BRANCH, TEACHER);
      expect(one).toContain('groups');
      expect(one).toContain('journal');
      expect(one).not.toContain('courses');
      expect(one).toContain('homeworkReview');
    });

    it('filters a student', () => {
      const all = setup(ALL_BRANCHES, STUDENT);
      expect(all).toContain('studentCourses');
      expect(all).not.toContain('studentSchedule');
      expect(all).toContain('studentHomework');

      const one = setup(ONE_BRANCH, STUDENT);
      expect(one).toContain('studentSchedule');
      expect(one).not.toContain('studentCourses');
      expect(one).toContain('studentHomework');
    });
  });

  it('never drops support, in any combination', () => {
    const combos: Array<[any, any]> = [
      [ALL_BRANCHES, ADMIN], [ONE_BRANCH, ADMIN],
      [ALL_BRANCHES, TEACHER], [ONE_BRANCH, TEACHER],
      [ALL_BRANCHES, STUDENT], [ONE_BRANCH, STUDENT],
      [{ ...NO_SWITCH, ...ALL_BRANCHES }, ADMIN], [{ ...NO_SWITCH, ...ONE_BRANCH }, STUDENT],
    ];

    for (const [branch, auth] of combos) {
      expect(setup(branch, auth)).toContain('support');
    }
  });

  describe('opts.branchScope === false', () => {
    // The SidebarCustomizerCard path: it must list every entry the user is
    // entitled to, or an item hidden by the current branch mode could never be
    // toggled back on.
    it('returns the unfiltered model under «Все филиалы»', () => {
      const ids = setup(ALL_BRANCHES, ADMIN, { branchScope: false });

      expect(ids).toContain('courses');
      expect(ids).toContain('groups');
      expect(ids).toContain('support');
    });

    it('returns the unfiltered model under a specific branch', () => {
      const ids = setup(ONE_BRANCH, ADMIN, { branchScope: false });

      expect(ids).toContain('courses');
      expect(ids).toContain('groups');
    });

    it('matches what an unswitchable org sees, exactly', () => {
      const unfiltered = setup(ONE_BRANCH, ADMIN, { branchScope: false });
      const noSwitcher = setup({ ...NO_SWITCH, ...ONE_BRANCH }, ADMIN);

      expect(unfiltered).toEqual(noSwitcher);
    });
  });
});
