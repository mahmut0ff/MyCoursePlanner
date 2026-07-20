import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// firebase-admin is mocked wholesale: auth.ts pulls adminAuth/adminDb and
// finance-names.ts pulls getDocsByIds at module load.
vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: vi.fn(), batch: vi.fn() },
  adminAuth: { verifyIdToken: vi.fn() },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

// Only verifyAuth is stubbed. The branch-scope helpers under test live in this
// same module, so replacing it wholesale (as security-cross-tenant.test.ts does)
// would test the mock instead of the real semantics.
vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn() };
});

vi.mock('../utils/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyOrgAdmins: vi.fn().mockResolvedValue(undefined),
}));

import { adminDb } from '../utils/firebase-admin';
import { verifyAuth, recordInBranchScope } from '../utils/auth';
import { derivePlanStatus } from '../utils/finance-names';
import { handler as plansHandler } from '../api-finance-plans';
import { handler as metricsHandler } from '../api-finance-metrics';
import { handler as trxHandler } from '../api-finance-transactions';
import { parseRangeBoundary, getPeriodRange, getPreviousRange, resolveRange } from '../utils/finance-period';
import { isDeadlineMissed, isPlanOverdue, orgDayKey, daysUntilDeadline } from '../utils/payment-plans';
import { handler as debtRemindersHandler } from '../debt-reminders';
import { createNotification } from '../utils/notifications';

const event = (method: string, query?: any, body?: any) => ({
  httpMethod: method,
  body: body ? JSON.stringify(body) : null,
  queryStringParameters: query || {},
  headers: {},
} as any);

/** An AuthUser shaped just enough for can() / getOrgFilter() / resolveBranchFilter(). */
const staff = (grants: string[], extra: any = {}) => ({
  uid: 'u1',
  email: 'u1@example.com',
  role: 'manager',
  displayName: 'Менеджер',
  organizationId: 'org1',
  planId: null,
  aiEnabled: false,
  branchIds: [],
  primaryBranchId: null,
  permissions: { finances: false, settings: false, managers: false, branches: false },
  customRoleId: null,
  rbac: new Set(grants),
  ...extra,
});

describe('derivePlanStatus', () => {
  it("never treats a missing total as satisfied — legacy plans kept their real debt", () => {
    expect(derivePlanStatus(500, undefined)).toBe('partial');
    expect(derivePlanStatus(500, null)).toBe('partial');
  });

  it('never treats a zero total as satisfied', () => {
    expect(derivePlanStatus(500, 0)).toBe('partial');
  });

  it('is pending when nothing has been paid, whatever the total', () => {
    expect(derivePlanStatus(0, 1000)).toBe('pending');
    expect(derivePlanStatus(0, undefined)).toBe('pending');
    expect(derivePlanStatus(0, 0)).toBe('pending');
  });

  it('is partial below the total and paid at or above it', () => {
    expect(derivePlanStatus(500, 1000)).toBe('partial');
    expect(derivePlanStatus(1000, 1000)).toBe('paid');
    expect(derivePlanStatus(1500, 1000)).toBe('paid');
  });

  it('preserves a cancelled plan — a write-off must not be resurrected', () => {
    expect(derivePlanStatus(0, 1000, 'cancelled')).toBe('cancelled');
    expect(derivePlanStatus(500, 1000, 'cancelled')).toBe('cancelled');
    expect(derivePlanStatus(1000, 1000, 'cancelled')).toBe('cancelled');
  });

  it('reopens a cancelled plan only when the caller explicitly intends it', () => {
    expect(derivePlanStatus(500, 1000, 'cancelled', true)).toBe('partial');
    expect(derivePlanStatus(1000, 1000, 'cancelled', true)).toBe('paid');
  });

  // Bez etoy vetki: a partial payment against an overdue plan demoted it to
  // 'partial', dropping it out of ?status=overdue and out of the debt reminders.
  it('preserves overdue while any balance remains', () => {
    expect(derivePlanStatus(0, 1000, 'overdue')).toBe('overdue');
    expect(derivePlanStatus(300, 1000, 'overdue')).toBe('overdue');
    expect(derivePlanStatus(999, 1000, 'overdue')).toBe('overdue');
    // An unknown or zero total is not a settled debt, so the overdue state stands.
    expect(derivePlanStatus(500, undefined, 'overdue')).toBe('overdue');
    expect(derivePlanStatus(500, 0, 'overdue')).toBe('overdue');
  });

  it('clears overdue only on full payment', () => {
    expect(derivePlanStatus(1000, 1000, 'overdue')).toBe('paid');
    expect(derivePlanStatus(1200, 1000, 'overdue')).toBe('paid');
  });

  it('keeps cancelled outranking overdue — a write-off wins over a deadline', () => {
    expect(derivePlanStatus(500, 1000, 'cancelled')).toBe('cancelled');
  });
});

describe('getPreviousRange — completed vs in-progress windows', () => {
  // 19 July 2026, mid-month: 'current_month' is in progress, 'last_month' is closed.
  const now = new Date(2026, 6, 19, 12, 0, 0);

  it('truncates an IN-PROGRESS month to the same elapsed length (like-for-like MTD)', () => {
    const { startIso, endIso } = getPeriodRange('current_month', now);
    const { prevStartIso, prevEndIso } = getPreviousRange('current_month', startIso, endIso, false, now);
    const from = new Date(prevStartIso);
    const to = new Date(prevEndIso);
    expect([from.getFullYear(), from.getMonth(), from.getDate()]).toEqual([2026, 5, 1]);
    expect([to.getFullYear(), to.getMonth(), to.getDate()]).toEqual([2026, 5, 19]);
  });

  it('compares a COMPLETED month against the FULL preceding month', () => {
    const { startIso, endIso } = getPeriodRange('last_month', now);
    const { prevStartIso, prevEndIso } = getPreviousRange('last_month', startIso, endIso, false, now);
    const from = new Date(prevStartIso);
    const to = new Date(prevEndIso);
    // June is compared against ALL of May, not a truncated 19-day slice:
    // truncating shrank the base and inflated every growth percentage.
    expect([from.getFullYear(), from.getMonth(), from.getDate()]).toEqual([2026, 4, 1]);
    expect([to.getFullYear(), to.getMonth(), to.getDate()]).toEqual([2026, 4, 31]);
    // And it abuts the current window without overlapping it.
    expect(to.getTime()).toBe(new Date(startIso).getTime() - 1);
  });

  it('keeps the completed previous window a full unit long, not an elapsed slice', () => {
    const { startIso, endIso } = getPeriodRange('last_month', now);
    const { prevStartIso, prevEndIso } = getPreviousRange('last_month', startIso, endIso, false, now);
    const prevDays = (new Date(prevEndIso).getTime() - new Date(prevStartIso).getTime()) / 86400000;
    expect(prevDays).toBeGreaterThan(30);
  });

  it('still uses the immediately preceding same-length window for a custom range', () => {
    const start = new Date(2026, 0, 10, 0, 0, 0, 0).toISOString();
    const end = new Date(2026, 0, 19, 23, 59, 59, 999).toISOString();
    const { prevStartIso, prevEndIso } = getPreviousRange('custom', start, end, true, now);
    expect(new Date(prevEndIso).getTime()).toBe(new Date(start).getTime() - 1);
    expect(new Date(prevStartIso).getTime()).toBeLessThan(new Date(prevEndIso).getTime());
  });
});

describe('resolveRange — one parser, both endpoints', () => {
  it('lets a complete date pair win over period, in both endpoints alike', () => {
    const params = { period: 'year', startDate: '2026-03-01', endDate: '2026-03-05' };
    const metrics = resolveRange(params, 'current_month') as any;
    const trx = resolveRange(params, null) as any;
    expect(metrics).toEqual(trx);
    expect(metrics.isCustomRange).toBe(true);
    expect(new Date(metrics.startIso).getDate()).toBe(1);
    expect(new Date(metrics.endIso).getHours()).toBe(23);
  });

  it('resolves a preset identically for both endpoints', () => {
    const params = { period: 'last_month' };
    expect(resolveRange(params, 'current_month')).toEqual(resolveRange(params, null));
  });

  it('applies NO window for transactions when nothing was asked for', () => {
    // A silent 'current month' default would hide the plan history that
    // PaymentHistoryModal / StudentDetailPage fetch in full.
    expect(resolveRange({}, null)).toEqual({ startIso: null, endIso: null, isCustomRange: false });
  });

  it('still gives metrics a default window when nothing was asked for', () => {
    const r = resolveRange({}, 'current_month') as any;
    expect(r.startIso).not.toBeNull();
    expect(r.endIso).not.toBeNull();
  });

  it('keeps a half-filled picker as an open-ended one-sided filter', () => {
    const r = resolveRange({ startDate: '2026-03-01' }, null) as any;
    expect(r.startIso).not.toBeNull();
    expect(r.endIso).toBeNull();
  });

  it('reports a parse error instead of producing an invalid window', () => {
    expect(resolveRange({ startDate: 'garbage', endDate: '2026-01-31' }, null)).toHaveProperty('error');
    expect(resolveRange({ startDate: '2026-03-01', endDate: '2026-01-01' }, null)).toHaveProperty('error');
    expect(resolveRange({ endDate: 'garbage' }, null)).toHaveProperty('error');
  });
});

describe('recordInBranchScope', () => {
  it('passes everything when no filter is active', () => {
    expect(recordInBranchScope(null, null)).toBe(true);
    expect(recordInBranchScope('b1', null)).toBe(true);
    expect(recordInBranchScope(undefined, null)).toBe(true);
  });

  it('excludes unattributed money under a requested-branch (string) filter', () => {
    expect(recordInBranchScope(null, 'b1')).toBe(false);
    expect(recordInBranchScope(undefined, 'b1')).toBe(false);
  });

  it('excludes unattributed money under a member-restriction (array) filter', () => {
    expect(recordInBranchScope(null, ['b1'])).toBe(false);
    expect(recordInBranchScope(undefined, ['b1', 'b2'])).toBe(false);
  });

  it('matches strictly on branchId in both filter forms', () => {
    expect(recordInBranchScope('b1', 'b1')).toBe(true);
    expect(recordInBranchScope('b2', 'b1')).toBe(false);
    expect(recordInBranchScope('b1', ['b1', 'b2'])).toBe(true);
    expect(recordInBranchScope('b3', ['b1', 'b2'])).toBe(false);
  });

  it('keeps branch totals disjoint so they sum to the org total', () => {
    const rows = [{ branchId: 'b1' }, { branchId: 'b2' }, { branchId: null }];
    const inA = rows.filter(r => recordInBranchScope(r.branchId, 'b1')).length;
    const inB = rows.filter(r => recordInBranchScope(r.branchId, 'b2')).length;
    expect(inA).toBe(1);
    expect(inB).toBe(1);
    expect(inA + inB).toBeLessThanOrEqual(rows.length);
  });

  it('denies everything for the __DENIED__ sentinel', () => {
    expect(recordInBranchScope('b1', '__DENIED__')).toBe(false);
    expect(recordInBranchScope(null, '__DENIED__')).toBe(false);
  });

  it('keeps everything when the member has an empty branch array', () => {
    expect(recordInBranchScope(null, [])).toBe(true);
    expect(recordInBranchScope('b1', [])).toBe(true);
  });
});

describe('api-finance-plans DELETE — linked-transaction guard', () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Applies the recorded equality clauses to the seeded rows, so a missing
   * organizationId clause shows up as a foreign-tenant row being counted
   * rather than silently passing.
   */
  function wire(planData: any, txRows: any[]) {
    const clauses: Array<[string, any]> = [];
    const deleteSpy = vi.fn().mockResolvedValue(undefined);

    const txQuery: any = {
      where: vi.fn((field: string, _op: string, value: any) => { clauses.push([field, value]); return txQuery; }),
      get: vi.fn(async () => {
        const matched = txRows.filter(r => clauses.every(([f, v]) => r[f] === v));
        return { size: matched.length, docs: matched.map(r => ({ data: () => r })) };
      }),
    };

    (adminDb.collection as any).mockImplementation((name: string) => {
      if (name === 'studentPaymentPlans') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ exists: !!planData, id: 'plan1', data: () => planData }),
            delete: deleteSpy,
          })),
        };
      }
      if (name === 'financeTransactions') return txQuery;
      return txQuery;
    });

    return { clauses, deleteSpy };
  }

  it('blocks the delete with 409 and reports how many operations are attached', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:delete']));
    const { deleteSpy } = wire({ organizationId: 'org1' }, [
      { organizationId: 'org1', paymentPlanId: 'plan1' },
      { organizationId: 'org1', paymentPlanId: 'plan1' },
    ]);

    const res: any = await plansHandler(event('DELETE', { id: 'plan1' }), {} as any, () => {});
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).linkedTransactions).toBe(2);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('allows the delete when the caller passes force=true', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:delete']));
    const { deleteSpy } = wire({ organizationId: 'org1' }, [
      { organizationId: 'org1', paymentPlanId: 'plan1' },
    ]);

    const res: any = await plansHandler(event('DELETE', { id: 'plan1', force: 'true' }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).deleted).toBe(true);
    expect(deleteSpy).toHaveBeenCalled();
  });

  it('counts only this org — a foreign tenant must not block a legitimate delete', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:delete']));
    const { clauses, deleteSpy } = wire({ organizationId: 'org1' }, [
      { organizationId: 'org2', paymentPlanId: 'plan1' }, // foreign tenant only
    ]);

    const res: any = await plansHandler(event('DELETE', { id: 'plan1' }), {} as any, () => {});
    // The organizationId equality must actually be issued, not just implied.
    expect(clauses).toContainEqual(['organizationId', 'org1']);
    expect(clauses).toContainEqual(['paymentPlanId', 'plan1']);
    expect(res.statusCode).toBe(200);
    expect(deleteSpy).toHaveBeenCalled();
  });
});

describe('api-finance-plans POST — branch scoping & allowlist', () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Captures every doc written via .add(). users/courses name lookups return a
   * missing doc so denormalization is an inert no-op and the test stays focused
   * on what the endpoint writes, not on name resolution.
   */
  function wirePost() {
    const added: any[] = [];
    const addSpy = vi.fn(async (d: any) => { added.push(d); return { id: 'newPlan1' }; });
    const missingDoc = { get: vi.fn().mockResolvedValue({ exists: false }) };
    (adminDb.collection as any).mockImplementation((name: string) => {
      if (name === 'studentPaymentPlans') return { add: addSpy, doc: vi.fn(() => missingDoc) };
      return { doc: vi.fn(() => missingDoc) }; // users / courses
    });
    return { added, addSpy };
  }

  const body = (extra: any = {}) => ({ studentId: 's1', courseId: 'general', totalAmount: 5000, ...extra });

  it('rejects a plan attributed to a branch the manager cannot access', async () => {
    // THE fix under test: the POST used to spread `...body`, so a manager pinned to
    // branch A could plant a plan in branch B just by sending its id.
    (verifyAuth as any).mockResolvedValue(staff(['finances:write'], { branchIds: ['A'], primaryBranchId: 'A' }));
    const { addSpy } = wirePost();
    const res: any = await plansHandler(event('POST', {}, body({ branchId: 'B' })), {} as any, () => {});
    expect(res.statusCode).toBe(403);
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('allows a plan in the manager own branch and stamps the resolved branch + org', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write'], { branchIds: ['A'], primaryBranchId: 'A' }));
    const { added, addSpy } = wirePost();
    const res: any = await plansHandler(event('POST', {}, body({ branchId: 'A' })), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(added[0].branchId).toBe('A');
    expect(added[0].organizationId).toBe('org1');
    expect(added[0].totalAmount).toBe(5000);
  });

  it('falls back to the member primary branch when none is sent, then enforces it', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write'], { branchIds: ['A'], primaryBranchId: 'A' }));
    const { added } = wirePost();
    const res: any = await plansHandler(event('POST', {}, body()), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(added[0].branchId).toBe('A');
  });

  it('ignores client-supplied identity/unknown fields — no blind body spread', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write']));
    const { added } = wirePost();
    const res: any = await plansHandler(
      event('POST', {}, body({ organizationId: 'evil', evilField: 'x', paidAmount: 100 })), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(added[0].organizationId).toBe('org1'); // server org wins, not the body's
    expect(added[0].evilField).toBeUndefined();    // unknown field dropped
    expect(added[0].paidAmount).toBe(100);         // allowlisted field kept
  });

  it('coerces a string totalAmount and rejects a non-numeric one with 400', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write']));
    const { added } = wirePost();
    const okRes: any = await plansHandler(event('POST', {}, body({ totalAmount: '5000' })), {} as any, () => {});
    expect(okRes.statusCode).toBe(200);
    expect(added[0].totalAmount).toBe(5000); // Number(), not the string '5000'

    const badRes: any = await plansHandler(event('POST', {}, body({ totalAmount: 'garbage' })), {} as any, () => {});
    expect(badRes.statusCode).toBe(400);
  });
});

describe('api-finance-transactions POST — groupId stamping on income', () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Captures the doc written via COLLECTION.doc().set(), and records the equality
   * clauses issued against `groups` so a missing organizationId scope shows up as
   * a foreign-tenant group being matched rather than silently passing. groupRows
   * are filtered by the recorded clauses, exactly like the plans-DELETE harness.
   */
  function wirePost(groupRows: any[]) {
    const written: any[] = [];
    const setSpy = vi.fn(async (d: any) => { written.push(d); });
    const groupClauses: Array<[string, any]> = [];
    const groupsQuery: any = {
      where: vi.fn((field: string, _op: string, value: any) => { groupClauses.push([field, value]); return groupsQuery; }),
      get: vi.fn(async () => ({
        docs: groupRows
          .filter(r => groupClauses.every(([f, v]) => r[f] === v))
          .map(r => ({ id: r.id, data: () => r })),
      })),
    };
    (adminDb.collection as any).mockImplementation((name: string) => {
      if (name === 'groups') return groupsQuery;
      if (name === 'financeTransactions') return { doc: vi.fn(() => ({ id: 'newTx1', set: setSpy })) };
      // studentPaymentPlans etc. — inert missing doc.
      return { doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ exists: false }) })) };
    });
    return { written, setSpy, groupClauses };
  }

  const incomeBody = (extra: any = {}) => ({
    type: 'income', amount: 500, date: '2026-07-20', categoryId: 'tuition',
    studentId: 's1', courseId: 'c1', ...extra,
  });

  it('stamps groupId when the student is in exactly one group of the course', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write']));
    const { written, groupClauses } = wirePost([
      { id: 'g1', organizationId: 'org1', courseId: 'c1', studentIds: ['s1', 's2'] },
      { id: 'g2', organizationId: 'org1', courseId: 'c1', studentIds: ['s3'] },
    ]);
    const res: any = await trxHandler(event('POST', {}, incomeBody()), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    // Org-scoped equality query (no composite index), mirroring the branchId recheck.
    expect(groupClauses).toContainEqual(['organizationId', 'org1']);
    expect(groupClauses).toContainEqual(['courseId', 'c1']);
    expect(written[0].groupId).toBe('g1');
    expect(JSON.parse(res.body).groupId).toBe('g1');
  });

  it('leaves groupId null when the student is in several groups of the course (ambiguous)', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write']));
    const { written } = wirePost([
      { id: 'g1', organizationId: 'org1', courseId: 'c1', studentIds: ['s1'] },
      { id: 'g2', organizationId: 'org1', courseId: 'c1', studentIds: ['s1'] },
    ]);
    const res: any = await trxHandler(event('POST', {}, incomeBody()), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    // Ambiguous attribution must not be guessed.
    expect(written[0].groupId).toBeNull();
  });

  it('leaves groupId null when no group of the course contains the student', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write']));
    const { written } = wirePost([
      { id: 'g1', organizationId: 'org1', courseId: 'c1', studentIds: ['s9'] },
    ]);
    const res: any = await trxHandler(event('POST', {}, incomeBody()), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(written[0].groupId).toBeNull();
  });

  it('honours an explicitly supplied groupId without a lookup', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write']));
    const { written, groupClauses } = wirePost([
      { id: 'g1', organizationId: 'org1', courseId: 'c1', studentIds: ['s1'] },
    ]);
    const res: any = await trxHandler(event('POST', {}, incomeBody({ groupId: 'gExplicit' })), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(written[0].groupId).toBe('gExplicit');
    // Body wins — no group query issued at all.
    expect(groupClauses).toHaveLength(0);
  });

  it('does not read groups on a general payment or when studentId is absent', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write']));
    const general = wirePost([]);
    const genRes: any = await trxHandler(event('POST', {}, incomeBody({ courseId: 'general' })), {} as any, () => {});
    expect(genRes.statusCode).toBe(200);
    expect(general.written[0].groupId).toBeNull();
    expect(general.groupClauses).toHaveLength(0); // no Firestore read on the hot path

    vi.clearAllMocks();
    (verifyAuth as any).mockResolvedValue(staff(['finances:write']));
    const noStudent = wirePost([]);
    const noStudentRes: any = await trxHandler(event('POST', {}, incomeBody({ studentId: undefined })), {} as any, () => {});
    expect(noStudentRes.statusCode).toBe(200);
    expect(noStudent.groupClauses).toHaveLength(0);
  });

  it('does not resolve a group for an expense row', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write']));
    const { written, groupClauses } = wirePost([
      { id: 'g1', organizationId: 'org1', courseId: 'c1', studentIds: ['s1'] },
    ]);
    const res: any = await trxHandler(event('POST', {}, incomeBody({ type: 'expense' })), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(written[0].groupId).toBeNull();
    expect(groupClauses).toHaveLength(0);
  });
});

describe('parseRangeBoundary', () => {
  it('accepts a bare YYYY-MM-DD and snaps to the day boundaries', () => {
    const from = parseRangeBoundary('2026-01-01', 'start')!;
    expect(from).not.toBeNull();
    expect([from.getFullYear(), from.getMonth(), from.getDate()]).toEqual([2026, 0, 1]);
    expect([from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds()]).toEqual([0, 0, 0, 0]);

    const to = parseRangeBoundary('2026-01-31', 'end')!;
    expect([to.getHours(), to.getMinutes(), to.getSeconds(), to.getMilliseconds()]).toEqual([23, 59, 59, 999]);
  });

  it('accepts a full ISO timestamp — the transactions endpoint already sends one', () => {
    const d = parseRangeBoundary('2026-01-01T00:00:00.000Z', 'start');
    expect(d).not.toBeNull();
    expect(Number.isNaN(d!.getTime())).toBe(false);
  });

  it('returns null on malformed input instead of producing an Invalid Date', () => {
    expect(parseRangeBoundary('not-a-date', 'start')).toBeNull();
    expect(parseRangeBoundary('2026-13-45', 'start')).toBeNull();
    expect(parseRangeBoundary('', 'start')).toBeNull();
  });
});

describe('api-finance-metrics — custom date range', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const empty: any = {
      where: vi.fn(() => empty),
      get: vi.fn().mockResolvedValue({ docs: [], size: 0, empty: true }),
    };
    (adminDb.collection as any).mockImplementation(() => empty);
  });

  it('answers 400 (not 500) on a malformed date', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    const res: any = await metricsHandler(
      event('GET', { startDate: 'garbage', endDate: '2026-01-31' }), {} as any, () => {});
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/дат/i);
  });

  it('answers 400 when the range is inverted', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    const res: any = await metricsHandler(
      event('GET', { startDate: '2026-03-01', endDate: '2026-01-01' }), {} as any, () => {});
    expect(res.statusCode).toBe(400);
  });

  it('accepts a full-ISO range that used to throw RangeError and 500', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    const res: any = await metricsHandler(
      event('GET', { startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-31T23:59:59.999Z' }),
      {} as any, () => {});
    expect(res.statusCode).toBe(200);
  });

  it('accepts a bare YYYY-MM-DD range and keeps the documented response shape', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    const res: any = await metricsHandler(
      event('GET', { startDate: '2026-01-01', endDate: '2026-01-31' }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    const b = JSON.parse(res.body);
    // outstandingDebt alias and the unattributed-branch bucket are contract.
    expect(b).toHaveProperty('outstandingDebt');
    expect(b).toHaveProperty('unassignedBranchIncome');
    expect(b).toHaveProperty('unassignedBranchExpense');
    expect(b).toHaveProperty('unassignedBranchDebt');
    expect(Array.isArray(b.chartData)).toBe(true);
  });
});

describe('api-finance-transactions GET — shared period parsing', () => {
  // Dates are built in LOCAL time on purpose. The server expands a bare
  // YYYY-MM-DD into a whole *local* day, so a fixture pinned to a UTC instant
  // would pass or fail depending on the machine's timezone rather than on the
  // behaviour under test. t2 sits late on the last day of the window — that is
  // the row the unexpanded end boundary used to drop.
  const local = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h, 0, 0, 0).toISOString();
  const rows = [
    { id: 't1', organizationId: 'org1', type: 'income', amount: 100, date: local(2026, 0, 1, 9) },
    { id: 't2', organizationId: 'org1', type: 'income', amount: 200, date: local(2026, 0, 31, 22) },
    { id: 't3', organizationId: 'org1', type: 'expense', amount: 300, date: local(2026, 2, 15, 9) },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    const q: any = {
      where: vi.fn(() => q),
      get: vi.fn().mockResolvedValue({
        docs: rows.map(r => ({ id: r.id, data: () => r })),
        size: rows.length,
        empty: false,
      }),
    };
    (adminDb.collection as any).mockImplementation(() => q);
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
  });

  const ids = (res: any) => JSON.parse(res.body).map((r: any) => r.id).sort();

  it('returns everything when no window is requested', async () => {
    const res: any = await trxHandler(event('GET'), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(ids(res)).toEqual(['t1', 't2', 't3']);
  });

  it('accepts a bare YYYY-MM-DD pair and expands it to whole local days', async () => {
    const res: any = await trxHandler(
      event('GET', { startDate: '2026-01-01', endDate: '2026-01-31' }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    // Both boundary rows are inside: the end of day used to stay unexpanded, so a
    // 31 January 22:00 payment fell out of the month the user actually picked.
    expect(ids(res)).toEqual(['t1', 't2']);
  });

  it('accepts `period` — presets are resolved server-side, like metrics', async () => {
    const res: any = await trxHandler(event('GET', { period: 'all' }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(ids(res)).toEqual(['t1', 't2', 't3']);
  });

  it('lets an explicit pair win over period, exactly as metrics does', async () => {
    const res: any = await trxHandler(
      event('GET', { period: 'all', startDate: '2026-01-01', endDate: '2026-01-31' }), {} as any, () => {});
    expect(ids(res)).toEqual(['t1', 't2']);
  });

  it('scopes an identical picked range identically in both endpoints', async () => {
    const query = { startDate: '2026-01-01', endDate: '2026-01-31' };
    const trxRes: any = await trxHandler(event('GET', query), {} as any, () => {});
    const metricsRes: any = await metricsHandler(event('GET', query), {} as any, () => {});
    const m = JSON.parse(metricsRes.body);
    // Same window means the same boundaries and the same income total.
    const trxIncome = JSON.parse(trxRes.body)
      .filter((r: any) => r.type === 'income')
      .reduce((sum: number, r: any) => sum + r.amount, 0);
    expect(m.totalIncome).toBe(trxIncome);
    const shared = resolveRange(query, 'current_month') as any;
    expect(m.startDate).toBe(shared.startIso);
    expect(m.endDate).toBe(shared.endIso);
  });

  it('answers 400 (not 500) on a malformed date, matching metrics', async () => {
    const res: any = await trxHandler(
      event('GET', { startDate: 'garbage', endDate: '2026-01-31' }), {} as any, () => {});
    expect(res.statusCode).toBe(400);
  });
});

describe('isDeadlineMissed — a whole day of grace, not a lexicographic accident', () => {
  // 20 July 2026, mid-morning UTC. The bug window is exactly this: any moment on
  // the due date itself, where the naive `deadline < now.toISOString()` was
  // already true because '2026-07-20' is a PREFIX of '2026-07-20T09:15:...'.
  const now = new Date('2026-07-20T09:15:00.000Z');

  it('is NOT missed on the due date itself — both stored deadline shapes', () => {
    expect(isDeadlineMissed('2026-07-20', now)).toBe(false);
    expect(isDeadlineMissed('2026-07-20T00:00:00.000Z', now)).toBe(false);
    // Even a deadline stamped earlier on the due day is still "pay by end of day".
    expect(isDeadlineMissed('2026-07-20T00:00:01.000Z', now)).toBe(false);
  });

  it('IS missed once the whole day has passed — both stored deadline shapes', () => {
    expect(isDeadlineMissed('2026-07-19', now)).toBe(true);
    expect(isDeadlineMissed('2026-07-19T23:59:59.999Z', now)).toBe(true);
  });

  it('is not missed for a future deadline, and never for a missing/garbage one', () => {
    expect(isDeadlineMissed('2026-07-21', now)).toBe(false);
    expect(isDeadlineMissed(null, now)).toBe(false);
    expect(isDeadlineMissed(undefined, now)).toBe(false);
    expect(isDeadlineMissed('', now)).toBe(false);
    expect(isDeadlineMissed('не дата', now)).toBe(false);
  });

  it('accepts a Date / Firestore Timestamp deadline, not only a string', () => {
    expect(isDeadlineMissed(new Date('2026-07-19T00:00:00.000Z'), now)).toBe(true);
    expect(isDeadlineMissed(new Date('2026-07-20T00:00:00.000Z'), now)).toBe(false);
    const ts = { toDate: () => new Date('2026-07-19T00:00:00.000Z') };
    expect(isDeadlineMissed(ts, now)).toBe(true);
  });

  // Этот тест раньше назывался "isPlanOverdue trusts an already-written overdue
  // status regardless of deadline" и закреплял БАГ как намерение: предикат
  // возвращал true по записанному статусу, не глядя на срок. Снять 'overdue'
  // при этом было некому (derivePlanStatus его сознательно сохраняет), поэтому
  // продление срока не работало: счёт навсегда оставался в KPI долга, в списке
  // должников и в рассылке «Просрочена оплата». Теперь правило обратное — и
  // проверяется строже, а не слабее: срок решает В ОБЕ стороны.
  it('isPlanOverdue lets the deadline overrule a stale overdue status, both ways', () => {
    // Продлённый в будущее срок СНИМАЕТ просрочку, хотя статус ещё 'overdue'.
    expect(isPlanOverdue({ status: 'overdue', deadline: '2026-12-31' }, now)).toBe(false);
    // Срок сегодня — тоже ещё не просрочка (целый день на оплату).
    expect(isPlanOverdue({ status: 'overdue', deadline: '2026-07-20' }, now)).toBe(false);
    // А истёкший срок ставит просрочку независимо от того, что записано.
    expect(isPlanOverdue({ status: 'overdue', deadline: '2026-07-19' }, now)).toBe(true);
    expect(isPlanOverdue({ status: 'pending', deadline: '2026-07-20' }, now)).toBe(false);
    expect(isPlanOverdue({ status: 'pending', deadline: '2026-07-19' }, now)).toBe(true);
  });

  it('falls back to the written status only when there is no usable deadline', () => {
    // Вычислить нечего — доверяем тому, что записано, иначе просрочка по плану
    // без срока молча исчезла бы из долга.
    expect(isPlanOverdue({ status: 'overdue', deadline: null }, now)).toBe(true);
    expect(isPlanOverdue({ status: 'overdue' }, now)).toBe(true);
    expect(isPlanOverdue({ status: 'overdue', deadline: 'не дата' }, now)).toBe(true);
    expect(isPlanOverdue({ status: 'pending', deadline: null }, now)).toBe(false);
    expect(isPlanOverdue(null, now)).toBe(false);
  });
});

describe('the day boundary is the ORG day (UTC+6), not UTC', () => {
  // Рынок — Центральная Азия. Граница суток обязана переворачиваться в местную
  // полночь: иначе срок «20-е» доживал до 06:00 21-го по-местному.
  it('is already the next local day at 01:00 local, though UTC still says yesterday', () => {
    // 2026-07-20T19:30Z === 2026-07-21 01:30 в Бишкеке.
    const afterLocalMidnight = new Date('2026-07-20T19:30:00.000Z');
    expect(orgDayKey(afterLocalMidnight)).toBe('2026-07-21');
    // Срок «20 июля» истёк — местные сутки кончились, хотя по UTC ещё 20-е.
    expect(isDeadlineMissed('2026-07-20', afterLocalMidnight)).toBe(true);
    expect(daysUntilDeadline('2026-07-20', afterLocalMidnight)).toBe(-1);
  });

  it('is still the same local day just BEFORE local midnight', () => {
    // 2026-07-20T17:30Z === 2026-07-20 23:30 в Бишкеке.
    const beforeLocalMidnight = new Date('2026-07-20T17:30:00.000Z');
    expect(orgDayKey(beforeLocalMidnight)).toBe('2026-07-20');
    expect(isDeadlineMissed('2026-07-20', beforeLocalMidnight)).toBe(false);
    expect(daysUntilDeadline('2026-07-20', beforeLocalMidnight)).toBe(0);
  });

  it('counts whole calendar days, not ms/86400000 with a rounding accident', () => {
    const now = new Date('2026-07-20T09:15:00.000Z');
    expect(daysUntilDeadline('2026-07-20', now)).toBe(0);
    expect(daysUntilDeadline('2026-07-21', now)).toBe(1);
    expect(daysUntilDeadline('2026-07-23', now)).toBe(3);
    expect(daysUntilDeadline('2026-07-19', now)).toBe(-1);
    // Ключевое расхождение со старой формулой: срок с ненулевым временем.
    // Math.ceil((18:00 − 09:15)/сутки) давал 1 («оплата завтра») для срока СЕГОДНЯ.
    expect(daysUntilDeadline('2026-07-20T18:00:00.000Z', now)).toBe(0);
    expect(daysUntilDeadline(null, now)).toBeNull();
    expect(daysUntilDeadline('не дата', now)).toBeNull();
  });
});

describe('overdue promotion & counting — plans and metrics must agree', () => {
  // Frozen mid-morning on 20 July 2026: every "due today" row below sits inside
  // the exact window where the old bare-date-vs-ISO comparison mis-fired.
  const NOW = new Date('2026-07-20T09:15:00.000Z');

  /**
   * Every plan is debt-bearing and pending, so nothing but the deadline decides
   * the outcome — and metrics' isDebtBearingPlan pre-filter cannot mask a
   * disagreement between the two endpoints.
   */
  const planRows = [
    { id: 'todayBare', organizationId: 'org1', studentId: 's1', status: 'pending', totalAmount: 1000, paidAmount: 0, branchId: 'A', deadline: '2026-07-20' },
    { id: 'todayIso', organizationId: 'org1', studentId: 's2', status: 'pending', totalAmount: 1000, paidAmount: 0, branchId: 'A', deadline: '2026-07-20T00:00:00.000Z' },
    { id: 'yesterdayBare', organizationId: 'org1', studentId: 's3', status: 'pending', totalAmount: 1000, paidAmount: 0, branchId: 'A', deadline: '2026-07-19' },
    { id: 'yesterdayIso', organizationId: 'org1', studentId: 's4', status: 'pending', totalAmount: 1000, paidAmount: 0, branchId: 'A', deadline: '2026-07-19T00:00:00.000Z' },
    { id: 'future', organizationId: 'org1', studentId: 's5', status: 'pending', totalAmount: 1000, paidAmount: 0, branchId: 'A', deadline: '2026-08-01' },
    { id: 'noDeadline', organizationId: 'org1', studentId: 's6', status: 'pending', totalAmount: 1000, paidAmount: 0, branchId: 'A', deadline: null },
  ];

  /** Wires both collections off the same fixture, plus a no-op promotion batch. */
  function wire(plans: any[], trxs: any[] = []) {
    const updates: Array<[string, any]> = [];
    (adminDb.batch as any).mockImplementation(() => ({
      update: vi.fn((ref: any, data: any) => { updates.push([ref?.id, data]); }),
      commit: vi.fn().mockResolvedValue(undefined),
    }));
    const query = (rows: any[]): any => {
      const q: any = {
        where: vi.fn(() => q),
        get: vi.fn().mockResolvedValue({ docs: rows.map(r => ({ id: r.id, data: () => r })), size: rows.length, empty: !rows.length }),
      };
      return q;
    };
    const plansQuery = query(plans);
    plansQuery.doc = vi.fn((id: string) => ({ id }));
    const trxQuery = query(trxs);
    (adminDb.collection as any).mockImplementation((name: string) =>
      name === 'studentPaymentPlans' ? plansQuery : trxQuery);
    return { updates };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('does not promote a plan due TODAY, in either stored deadline shape', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    wire(planRows);
    const res: any = await plansHandler(event('GET'), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    const byId = new Map(JSON.parse(res.body).map((r: any) => [r.id, r.status]));
    // THE fix: at 00:00 on the due date these used to read 'overdue' already,
    // pulling the student into the debtor list and the reminder cron.
    expect(byId.get('todayBare')).toBe('pending');
    expect(byId.get('todayIso')).toBe('pending');
    expect(byId.get('future')).toBe('pending');
    expect(byId.get('noDeadline')).toBe('pending');
  });

  it('DOES promote a plan due yesterday, in either stored deadline shape', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    const { updates } = wire(planRows);
    const res: any = await plansHandler(event('GET'), {} as any, () => {});
    const byId = new Map(JSON.parse(res.body).map((r: any) => [r.id, r.status]));
    expect(byId.get('yesterdayBare')).toBe('overdue');
    expect(byId.get('yesterdayIso')).toBe('overdue');
    // And exactly those two are persisted — no early write for the due-today rows.
    expect(updates.map(([id]) => id).sort()).toEqual(['yesterdayBare', 'yesterdayIso']);
  });

  it('metrics counts the same two overdue plans as the plans endpoint promotes', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    wire(planRows);
    const plansRes: any = await plansHandler(event('GET'), {} as any, () => {});
    const promoted = JSON.parse(plansRes.body).filter((r: any) => r.status === 'overdue').length;

    wire(planRows);
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    const metricsRes: any = await metricsHandler(event('GET', { period: 'all' }), {} as any, () => {});
    expect(metricsRes.statusCode).toBe(200);
    const { overdueCount } = JSON.parse(metricsRes.body);

    // The shared predicate is the point: these two numbers can no longer drift.
    expect(promoted).toBe(2);
    expect(overdueCount).toBe(promoted);
  });

  describe('unassignedBranch* — org-wide figures stay behind org-wide scope', () => {
    const trxRows = [
      { id: 'x1', organizationId: 'org1', type: 'income', amount: 700, branchId: null, date: new Date(2026, 6, 15, 12).toISOString() },
      { id: 'x2', organizationId: 'org1', type: 'expense', amount: 200, branchId: null, date: new Date(2026, 6, 15, 12).toISOString() },
      { id: 'x3', organizationId: 'org1', type: 'income', amount: 999, branchId: 'A', date: new Date(2026, 6, 15, 12).toISOString() },
    ];
    const unassignedDebtPlan = [
      ...planRows,
      { id: 'orphanDebt', organizationId: 'org1', studentId: 's7', status: 'pending', totalAmount: 400, paidAmount: 0, branchId: null, deadline: '2026-08-01' },
    ];
    const window = { startDate: '2026-07-01', endDate: '2026-07-31' };

    it('gives an unrestricted member the real unassigned figures', async () => {
      (verifyAuth as any).mockResolvedValue(staff(['finances:read'])); // branchIds: []
      wire(unassignedDebtPlan, trxRows);
      const res: any = await metricsHandler(event('GET', window), {} as any, () => {});
      expect(res.statusCode).toBe(200);
      const b = JSON.parse(res.body);
      expect(b.unassignedBranchIncome).toBe(700);
      expect(b.unassignedBranchExpense).toBe(200);
      expect(b.unassignedBranchDebt).toBe(400);
    });

    it('zeroes them for a branch-restricted member — no org-wide money leak', async () => {
      (verifyAuth as any).mockResolvedValue(
        staff(['finances:read'], { branchIds: ['A'], primaryBranchId: 'A' }));
      wire(unassignedDebtPlan, trxRows);
      const res: any = await metricsHandler(event('GET', window), {} as any, () => {});
      expect(res.statusCode).toBe(200);
      const b = JSON.parse(res.body);
      // The fields must still EXIST — the UI reads them unconditionally.
      expect(b).toHaveProperty('unassignedBranchIncome');
      expect(b).toHaveProperty('unassignedBranchExpense');
      expect(b).toHaveProperty('unassignedBranchDebt');
      expect(b.unassignedBranchIncome).toBe(0);
      expect(b.unassignedBranchExpense).toBe(0);
      expect(b.unassignedBranchDebt).toBe(0);
      // ...while the figures they ARE entitled to still come through.
      expect(b.totalIncome).toBe(999);
    });

    it('keeps the real figures for an admin who has narrowed the UI to one branch', async () => {
      // A director filtering to branch A must still see the size of the
      // "not attached to a branch" bucket — that is what the field is for.
      (verifyAuth as any).mockResolvedValue(staff([], { role: 'admin' }));
      wire(unassignedDebtPlan, trxRows);
      const res: any = await metricsHandler(
        event('GET', { ...window, branchId: 'A' }), {} as any, () => {});
      expect(res.statusCode).toBe(200);
      const b = JSON.parse(res.body);
      expect(b.unassignedBranchIncome).toBe(700);
      expect(b.unassignedBranchDebt).toBe(400);
      expect(b.totalIncome).toBe(999); // but the totals are branch-scoped
    });
  });
});

describe('one overdue rule across debt-reminders and the metrics surface', () => {
  // Часы заморожены: раньше эти проверки зависели бы от реальной даты запуска.
  const NOW = new Date('2026-07-20T09:15:00.000Z'); // 15:15 в дне организации

  /**
   * 'extended' — ровно тот случай, ради которого чинилось правило: директор
   * ПРОДЛИЛ срок, а в документе всё ещё лежит статус 'overdue'.
   */
  const planRows = [
    { id: 'extended', organizationId: 'org1', studentId: 'sExt', studentName: 'Продлённый', status: 'overdue', totalAmount: 1000, paidAmount: 0, branchId: 'A', deadline: '2026-08-15' },
    { id: 'late', organizationId: 'org1', studentId: 'sLate', studentName: 'Опоздавший', status: 'pending', totalAmount: 1000, paidAmount: 0, branchId: 'A', deadline: '2026-07-17' },
    { id: 'dueToday', organizationId: 'org1', studentId: 'sToday', studentName: 'Сегодняшний', status: 'pending', totalAmount: 1000, paidAmount: 0, branchId: 'A', deadline: '2026-07-20' },
  ];

  /** Wires plans for both the cron (doc.ref.update) and the endpoints (batch). */
  function wire(plans: any[]) {
    const writes: Array<[string, any]> = [];
    (adminDb.batch as any).mockImplementation(() => ({
      update: vi.fn((ref: any, data: any) => { writes.push([ref?.id, data]); }),
      commit: vi.fn().mockResolvedValue(undefined),
    }));
    const q: any = {
      where: vi.fn(() => q),
      get: vi.fn().mockResolvedValue({
        docs: plans.map(r => ({
          id: r.id,
          data: () => r,
          ref: { id: r.id, update: vi.fn(async (d: any) => { writes.push([r.id, d]); }) },
        })),
        size: plans.length,
        empty: !plans.length,
      }),
      doc: vi.fn((id: string) => ({ id })),
    };
    const empty: any = { where: vi.fn(() => empty), get: vi.fn().mockResolvedValue({ docs: [], size: 0, empty: true }) };
    (adminDb.collection as any).mockImplementation((name: string) =>
      name === 'studentPaymentPlans' ? q : empty);
    return { writes };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('stops calling an extended plan overdue, and clears the stale status', async () => {
    const { writes } = wire(planRows);
    const res: any = await debtRemindersHandler(event('POST'), {} as any, () => {});
    const body = JSON.parse(res.body);

    expect(body.markedOverdue).toBe(1);  // только 'late'
    expect(body.clearedOverdue).toBe(1); // 'extended' разжалован обратно
    // Статус снят на выведенный из сумм, а не оставлен 'overdue' навсегда.
    expect(writes).toContainEqual(['extended', expect.objectContaining({ status: 'pending' })]);
  });

  it('never sends «Просрочена оплата» for money that is no longer late', async () => {
    wire(planRows);
    await debtRemindersHandler(event('POST'), {} as any, () => {});
    const calls = (createNotification as any).mock.calls.map((c: any[]) => c[0]);
    // Студент с продлённым сроком не получает НИЧЕГО о просрочке.
    expect(calls.find((c: any) => c.recipientId === 'sExt')).toBeUndefined();
    // А те, кому положено, получают ровно свой текст.
    expect(calls.find((c: any) => c.recipientId === 'sLate')?.title).toBe('Просрочена оплата');
    expect(calls.find((c: any) => c.recipientId === 'sToday')?.title).toBe('Напоминание об оплате');
    expect(calls.find((c: any) => c.recipientId === 'sToday')?.message).toContain('сегодня');
  });

  it('agrees with the metrics overdue count on the very same fixture', async () => {
    wire(planRows);
    const cronRes: any = await debtRemindersHandler(event('POST'), {} as any, () => {});
    const cronOverdue = JSON.parse(cronRes.body).markedOverdue;

    wire(planRows);
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    const metricsRes: any = await metricsHandler(event('GET', { period: 'all' }), {} as any, () => {});
    expect(metricsRes.statusCode).toBe(200);

    // Обе поверхности видят ровно одну просрочку — 'late'. До общего предиката
    // метрики считали 'extended' просроченным (по записанному статусу), а cron
    // слал по нему напоминания: два разных ответа на один вопрос.
    expect(cronOverdue).toBe(1);
    expect(JSON.parse(metricsRes.body).overdueCount).toBe(1);
  });

  it('promotes in api-finance-plans exactly what the cron promotes', async () => {
    wire(planRows);
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    const res: any = await plansHandler(event('GET'), {} as any, () => {});
    const rows = JSON.parse(res.body);
    const byId = new Map(rows.map((r: any) => [r.id, r.status]));
    expect(byId.get('late')).toBe('overdue');
    expect(byId.get('dueToday')).toBe('pending');
  });
});
