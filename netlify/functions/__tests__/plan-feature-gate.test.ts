import { describe, it, expect, vi, beforeEach } from 'vitest';

// Only Firestore is stubbed: the org document decides the plan, everything else
// (forbidden(), isSuperAdmin(), the shared plan table) runs for real.
const { orgGet } = vi.hoisted(() => ({ orgGet: vi.fn() }));

vi.mock('../utils/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ get: orgGet })) })),
  },
  adminAuth: { verifyIdToken: vi.fn() },
}));

import { requirePlanFeature } from '../utils/plan-limits';
import { planHasFeature, PLAN_LIMITS, planPrice } from '../../../src/lib/subscription-plans';

const admin = { uid: 'u1', role: 'admin', organizationId: 'org1' } as any;
const orgWithPlan = (planId: string | undefined) => orgGet.mockResolvedValue({ exists: true, data: () => ({ planId }) });

describe('plan feature gate', () => {
  beforeEach(() => orgGet.mockReset());

  it('starter org is refused a Professional module', async () => {
    orgWithPlan('starter');
    const res = await requirePlanFeature(admin, 'finances');
    expect(res?.statusCode).toBe(403);
  });

  it('professional org passes a Professional module but not an Enterprise one', async () => {
    orgWithPlan('professional');
    expect(await requirePlanFeature(admin, 'payroll')).toBeNull();
    orgWithPlan('professional');
    expect((await requirePlanFeature(admin, 'branches'))?.statusCode).toBe(403);
  });

  it('legacy plan ids count as the plan they became', async () => {
    orgWithPlan('pro');
    expect(await requirePlanFeature(admin, 'certificates')).toBeNull();
    orgWithPlan('expert');
    expect(await requirePlanFeature(admin, 'branches')).toBeNull();
  });

  it('a missing or unknown plan is treated as Starter (never grants)', async () => {
    orgWithPlan(undefined);
    expect((await requirePlanFeature(admin, 'finances'))?.statusCode).toBe(403);
    orgWithPlan('constructor');
    expect((await requirePlanFeature(admin, 'finances'))?.statusCode).toBe(403);
  });

  it('super admin passes without reading the org', async () => {
    const res = await requirePlanFeature({ ...admin, role: 'super_admin' }, 'branches');
    expect(res).toBeNull();
    expect(orgGet).not.toHaveBeenCalled();
  });

  it('a user without an organization is refused', async () => {
    const res = await requirePlanFeature({ ...admin, organizationId: null }, 'finances');
    expect(res?.statusCode).toBe(403);
  });
});

describe('shared plan table', () => {
  it('feature tiers are monotonic: Enterprise has everything Professional has', () => {
    for (const f of ['finances', 'payroll', 'gradebook', 'certificates', 'rbac', 'advancedAnalytics', 'branches', 'ai', 'aiAnalytics'] as const) {
      if (planHasFeature('professional', f)) expect(planHasFeature('enterprise', f)).toBe(true);
      expect(planHasFeature('starter', f)).toBe(false);
    }
  });

  it('the limits and prices the landing promises', () => {
    expect(PLAN_LIMITS.starter.maxStudents).toBe(50);
    expect(PLAN_LIMITS.professional.maxStudents).toBe(300);
    expect(PLAN_LIMITS.enterprise.maxStudents).toBe(-1);
    expect(planPrice('starter')).toBeLessThan(3000); // «дешевле месячной оплаты одного студента»
    expect(planPrice('starter') < planPrice('professional') && planPrice('professional') < planPrice('enterprise')).toBe(true);
  });
});
