import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression suite for written-off ('cancelled') payment plans.
 *
 * api-org.ts marks a plan 'cancelled' when a student leaves a group with an
 * untouched plan — the academy has stopped claiming that money. Consumers used to
 * skip only 'paid', so a cancelled plan still inflated debt totals, still put its
 * student in debtor lists, and still triggered automated Telegram reminders for
 * money nobody expects to be paid.
 *
 * Every case below pairs a cancelled plan with a pending plan carrying the SAME
 * outstanding balance, so a failure can only mean the status was ignored — not
 * that the balance arithmetic drifted.
 */

vi.mock('../utils/ai', () => ({
  getModel: vi.fn(),
  hasGeminiKey: vi.fn().mockReturnValue(true),
  recordAiUsage: vi.fn(),
}));

vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: vi.fn() },
}));

vi.mock('../utils/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { adminDb } from '../utils/firebase-admin';
import { createNotification } from '../utils/notifications';
import { buildDirectorSnapshot, renderSnapshotText, remindOrgDebtors, sendDebtorDraft } from '../utils/director-copilot';
import { isDebtBearingPlan, planDebt } from '../utils/payment-plans';

/** Wrap plain objects as a Firestore-like query result (chainable .where, resolvable .get). */
function coll(docs: any[]) {
  const wrapped = docs.map((d: any, i: number) => ({
    id: d.__id || `d${i}`,
    data: () => d,
    ref: { update: vi.fn().mockResolvedValue(undefined) },
  }));
  const obj: any = {
    where: vi.fn(() => obj),
    get: vi.fn().mockResolvedValue({ docs: wrapped, size: wrapped.length, empty: wrapped.length === 0 }),
  };
  return obj;
}

/**
 * Two students, identical 300 outstanding: one live plan, one written off.
 * Only Иван may ever be counted or contacted.
 */
const PLANS = [
  { __id: 'p1', studentId: 's1', studentName: 'Иван', courseName: 'Англ', totalAmount: 300, paidAmount: 0, status: 'pending' },
  { __id: 'p2', studentId: 's2', studentName: 'Пётр', courseName: 'Англ', totalAmount: 300, paidAmount: 0, status: 'cancelled' },
];

function wirePlans(planDocs: any[]) {
  (adminDb.collection as any).mockImplementation((name: string) => {
    if (name === 'studentPaymentPlans') return coll(planDocs);
    if (name === 'orgMembers') return { doc: () => ({ collection: () => coll([]) }) };
    if (name === 'organizations') return { doc: () => ({ collection: () => coll([]) }) };
    return coll([]);
  });
}

describe('isDebtBearingPlan', () => {
  it('excludes cancelled plans even with a positive balance', () => {
    expect(isDebtBearingPlan({ status: 'cancelled', totalAmount: 300, paidAmount: 0 })).toBe(false);
  });

  it('includes a pending plan with the same balance', () => {
    expect(isDebtBearingPlan({ status: 'pending', totalAmount: 300, paidAmount: 0 })).toBe(true);
  });

  it('excludes paid and fully-settled plans, and floors overpayment at zero debt', () => {
    expect(isDebtBearingPlan({ status: 'paid', totalAmount: 300, paidAmount: 300 })).toBe(false);
    // Status label lagging behind a settled balance must not resurrect the debt.
    expect(isDebtBearingPlan({ status: 'overdue', totalAmount: 300, paidAmount: 300 })).toBe(false);
    expect(planDebt({ totalAmount: 300, paidAmount: 400 })).toBe(0);
  });
});

describe('cancelled plans are written off across debt reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wirePlans(PLANS);
  });

  it('excludes the cancelled plan from the outstanding-debt total', async () => {
    const snap = await buildDirectorSnapshot('org1');
    // 300, not 600 — the cancelled plan's balance is not money we are owed.
    expect(snap.debtTotal).toBe(300);
  });

  it('excludes the cancelled plan from the debtor list', async () => {
    const snap = await buildDirectorSnapshot('org1');
    expect(snap.debtors).toHaveLength(1);
    expect(snap.debtors[0].name).toBe('Иван');
    const rendered = renderSnapshotText(snap);
    expect(rendered).toContain('должников всего: 1');
    expect(rendered).toContain('Иван: 300 с.');
    expect(rendered).not.toContain('Пётр');
  });
});

describe('cancelled plans never receive automated reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wirePlans(PLANS);
  });

  it('remindOrgDebtors messages only the live debtor', async () => {
    const result = await remindOrgDebtors('org1');
    expect(result.sent).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    const recipients = (createNotification as any).mock.calls.map((c: any[]) => c[0].recipientId);
    expect(recipients).toEqual(['s1']);
  });

  it('sendDebtorDraft broadcast skips the written-off student', async () => {
    const result = await sendDebtorDraft('org1', 'Просим оплатить обучение.');
    expect(result.sent).toBe(1);
    const recipients = (createNotification as any).mock.calls.map((c: any[]) => c[0].recipientId);
    expect(recipients).toEqual(['s1']);
    expect(recipients).not.toContain('s2');
  });

  it('a cancelled-only org contacts nobody at all', async () => {
    wirePlans([PLANS[1]]);
    const result = await remindOrgDebtors('org1');
    expect(result.sent).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
