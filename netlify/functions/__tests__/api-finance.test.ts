import { describe, it, expect, vi, beforeEach } from 'vitest';

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
