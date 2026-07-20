import { describe, it, expect, vi, beforeEach } from 'vitest';

// firebase-admin is mocked wholesale: auth.ts pulls adminAuth/adminDb and
// finance-names.ts pulls getDocsByIds at module load.
vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: vi.fn(), batch: vi.fn(), runTransaction: vi.fn() },
  adminAuth: { verifyIdToken: vi.fn() },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

// Only verifyAuth is stubbed — the branch-scope helpers under test are the real
// ones, exactly as api-finance.test.ts does it.
vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn() };
});

import { adminDb, getDocsByIds } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';
import { handler as rulesHandler } from '../api-payroll-rules';

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

/** A query stub that records its equality clauses and filters the seeded rows by them. */
function seededQuery(rows: any[]) {
  const clauses: Array<[string, any]> = [];
  const q: any = {
    where: vi.fn((field: string, _op: string, value: any) => { clauses.push([field, value]); return q; }),
    get: vi.fn(async () => {
      const matched = rows.filter(r => clauses.every(([f, v]) => r[f] === v));
      return {
        size: matched.length,
        empty: matched.length === 0,
        docs: matched.map(r => ({ id: r.id, data: () => r })),
      };
    }),
  };
  return { q, clauses };
}

/**
 * Wires the whole collection surface this endpoint touches.
 *  - compensationRules: the seeded active rules + .doc() for reads/writes
 *  - orgMembers/{org}/members/{teacher}: membership existence
 *  - payrollLines: usage lookup for the PUT/DELETE guards
 * runTransaction is executed for real against doc stubs so the supersede path's
 * writes are observable rather than assumed.
 */
function wire(opts: {
  rules?: any[];
  member?: boolean;
  lines?: any[];
  periods?: Record<string, any>;
  ruleDoc?: any;
} = {}) {
  const rules = opts.rules || [];
  const lines = opts.lines || [];
  const memberExists = opts.member !== false;

  const sets: any[] = [];
  const updates: any[] = [];
  const deleteSpy = vi.fn().mockResolvedValue(undefined);
  const updateSpy = vi.fn(async (u: any) => { updates.push({ id: 'target', ...u }); });

  const rulesQuery = seededQuery(rules);
  const linesQuery = seededQuery(lines);

  const ruleDocRef = (id: string) => ({
    id,
    get: vi.fn(async () => {
      const seeded = opts.ruleDoc !== undefined
        ? opts.ruleDoc
        : rules.find(r => r.id === id);
      return { exists: !!seeded, id, data: () => seeded, ref: ruleDocRef(id) };
    }),
    update: updateSpy,
    delete: deleteSpy,
  });

  (adminDb.collection as any).mockImplementation((name: string) => {
    if (name === 'compensationRules') {
      return {
        ...rulesQuery.q,
        // .doc() with no id mints the new rule's ref (the POST path).
        doc: vi.fn((id?: string) => ruleDocRef(id || 'newRule1')),
      };
    }
    if (name === 'payrollLines') return linesQuery.q;
    if (name === 'orgMembers') {
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ exists: memberExists }) })),
          })),
        })),
      };
    }
    return rulesQuery.q;
  });

  (getDocsByIds as any).mockResolvedValue(opts.periods || {});

  (adminDb.runTransaction as any).mockImplementation(async (fn: any) => {
    const t = {
      get: vi.fn(async (ref: any) => ref.get()),
      set: vi.fn((ref: any, data: any) => { sets.push({ id: ref.id, ...data }); }),
      update: vi.fn((ref: any, data: any) => { updates.push({ id: ref.id, ...data }); }),
    };
    return fn(t);
  });

  return { sets, updates, deleteSpy, updateSpy, rulesClauses: rulesQuery.clauses, linesClauses: linesQuery.clauses };
}

const validBody = (extra: any = {}) => ({
  teacherId: 't1',
  label: 'Оклад + 20%',
  effectiveFrom: '2026-07',
  effectiveTo: null,
  components: [{ kind: 'salary', amountMinor: 5000000 }],
  ...extra,
});

const WRITE = ['payroll:write'];

describe('api-payroll-rules POST — validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a percentBp outside 1..10000 and a non-integer one', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();

    for (const percentBp of [0, -100, 10001, 20.5]) {
      const res: any = await rulesHandler(event('POST', {}, validBody({
        components: [{ kind: 'percent_revenue', percentBp, base: 'collected', scope: {} }],
      })), {} as any, () => {});
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('percentBp');
    }
    expect(sets).toHaveLength(0);
  });

  it('rejects a percent component whose base is not the COLLECTED cash', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    wire();
    const res: any = await rulesHandler(event('POST', {}, validBody({
      components: [{ kind: 'percent_revenue', percentBp: 2000, base: 'invoiced', scope: {} }],
    })), {} as any, () => {});
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('collected');
  });

  it('rejects a float amountMinor — minor units are integers or the kopecks vanish', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();

    for (const kind of ['salary', 'per_lesson', 'per_hour', 'per_student']) {
      const res: any = await rulesHandler(event('POST', {}, validBody({
        components: [{ kind, amountMinor: 1500.5, scope: {} }],
      })), {} as any, () => {});
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('amountMinor');
    }
    // and a zero/negative rate is not a rate
    const zero: any = await rulesHandler(event('POST', {}, validBody({
      components: [{ kind: 'per_lesson', amountMinor: 0, scope: {} }],
    })), {} as any, () => {});
    expect(zero.statusCode).toBe(400);
    expect(sets).toHaveLength(0);
  });

  it('rejects a malformed or impossible effectiveFrom', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    wire();
    for (const effectiveFrom of ['2026-7', '2026/07', 'июль', '2026-13', '2026-00', '2026-07-01', 202607]) {
      const res: any = await rulesHandler(
        event('POST', {}, validBody({ effectiveFrom })), {} as any, () => {});
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('effectiveFrom');
    }
  });

  it('rejects an effectiveTo that ends before the rule begins', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    wire();
    const res: any = await rulesHandler(
      event('POST', {}, validBody({ effectiveFrom: '2026-07', effectiveTo: '2026-06' })), {} as any, () => {});
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('effectiveTo');
  });

  it('rejects an empty component list — a rule that earns nothing is a mistake', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    wire();
    const res: any = await rulesHandler(event('POST', {}, validBody({ components: [] })), {} as any, () => {});
    expect(res.statusCode).toBe(400);
  });

  it('rejects a teacher who is not a member of this organization', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire({ member: false });
    const res: any = await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});
    expect(res.statusCode).toBe(400);
    expect(sets).toHaveLength(0);
  });

  it('requires payroll:write — finances:write must not reach the rate card', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write', 'payroll:read']));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});
    expect(res.statusCode).toBe(403);
    expect(sets).toHaveLength(0);
  });
});

describe('api-payroll-rules POST — write shape, org & branch scoping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stamps the server org/createdBy/status and drops unknown & identity fields', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody({
      organizationId: 'evil',
      createdBy: 'evil',
      status: 'archived',
      supersedesId: 'forged',
      evilField: 'x',
    })), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    expect(sets).toHaveLength(1);
    expect(sets[0].organizationId).toBe('org1');   // server org wins
    expect(sets[0].createdBy).toBe('u1');
    expect(sets[0].status).toBe('active');          // never client-chosen
    expect(sets[0].supersedesId).toBeNull();        // audit chain not forgeable
    expect(sets[0].evilField).toBeUndefined();      // unknown field dropped
  });

  it('normalizes components instead of storing what the client sent', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody({
      components: [{
        kind: 'per_hour', amountMinor: 30000, junk: 'x',
        scope: { courseIds: ['c1', 'c1', 'c2'], groupIds: ['g1'], junk: 'y' },
      }],
    })), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    const comp = sets[0].components[0];
    expect(comp).toEqual({
      kind: 'per_hour',
      amountMinor: 30000,
      scope: { courseIds: ['c1', 'c2'], groupIds: ['g1'] }, // deduped, junk stripped
    });
  });

  it('scopes the overlap lookup to this org and teacher — equality clauses only', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { rulesClauses } = wire();
    await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});
    expect(rulesClauses).toContainEqual(['organizationId', 'org1']);
    expect(rulesClauses).toContainEqual(['teacherId', 't1']);
    expect(rulesClauses).toContainEqual(['status', 'active']);
  });

  it('rejects a rule attributed to a branch the manager cannot access', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE, { branchIds: ['A'], primaryBranchId: 'A' }));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody({ branchId: 'B' })), {} as any, () => {});
    expect(res.statusCode).toBe(403);
    expect(sets).toHaveLength(0);
  });

  it('falls back to the member primary branch when none is sent, then enforces it', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE, { branchIds: ['A'], primaryBranchId: 'A' }));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(sets[0].branchId).toBe('A');
  });
});

describe('api-payroll-rules POST — the one-active-rule invariant', () => {
  beforeEach(() => vi.clearAllMocks());

  const openEnded = {
    id: 'old1', organizationId: 'org1', teacherId: 't1', status: 'active',
    label: 'Старая ставка', effectiveFrom: '2026-01', effectiveTo: null, branchId: null,
  };

  it('supersedes the predecessor: closes it the month BEFORE and links the chain — one transaction', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets, updates } = wire({ rules: [openEnded] });

    const res: any = await rulesHandler(
      event('POST', {}, validBody({ effectiveFrom: '2026-07' })), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    expect(adminDb.runTransaction).toHaveBeenCalledTimes(1);
    // Both docs written, in the same transaction callback.
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('old1');
    expect(updates[0].effectiveTo).toBe('2026-06'); // the month before, never overlapping
    expect(sets).toHaveLength(1);
    expect(sets[0].supersedesId).toBe('old1');      // audit chain
    expect(sets[0].effectiveFrom).toBe('2026-07');
  });

  it('rolls the year back correctly when the new rule starts in January', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { updates } = wire({ rules: [{ ...openEnded, effectiveFrom: '2025-03' }] });

    const res: any = await rulesHandler(
      event('POST', {}, validBody({ effectiveFrom: '2026-01' })), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    expect(updates[0].effectiveTo).toBe('2025-12');
  });

  it('leaves a non-overlapping predecessor completely alone', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    // Old rule already ended in May; the new one starts in July — no succession.
    const { sets, updates } = wire({ rules: [{ ...openEnded, effectiveTo: '2026-05' }] });

    const res: any = await rulesHandler(
      event('POST', {}, validBody({ effectiveFrom: '2026-07' })), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    expect(updates).toHaveLength(0);
    expect(sets[0].supersedesId).toBeNull();
  });

  it('409s on a genuine conflict — the existing rule does not start earlier', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    // Existing starts in the SAME month: closing it at 2026-06 would give it a
    // backwards lifetime, so this is bad input, not a rate change.
    const { sets, updates } = wire({ rules: [{ ...openEnded, effectiveFrom: '2026-07' }] });

    const res: any = await rulesHandler(
      event('POST', {}, validBody({ effectiveFrom: '2026-07' })), {} as any, () => {});

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).conflictRuleId).toBe('old1');
    // Nothing written at all — never leave two overlapping active rules.
    expect(sets).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('409s when the existing rule starts LATER than the new one', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire({ rules: [{ ...openEnded, effectiveFrom: '2026-09' }] });
    const res: any = await rulesHandler(
      event('POST', {}, validBody({ effectiveFrom: '2026-07' })), {} as any, () => {});
    expect(res.statusCode).toBe(409);
    expect(sets).toHaveLength(0);
  });

  it('ignores another org active rule for the same teacher id', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    // Seeded query applies the organizationId clause, so a foreign row must not
    // surface as a conflict — it would both block a legitimate create and leak
    // that the other tenant has a rule for this id.
    const { sets, updates } = wire({ rules: [{ ...openEnded, organizationId: 'org2' }] });

    const res: any = await rulesHandler(
      event('POST', {}, validBody({ effectiveFrom: '2026-07' })), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    expect(updates).toHaveLength(0);
    expect(sets[0].supersedesId).toBeNull();
  });

  it('ignores an ARCHIVED predecessor — only active rules hold the invariant', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets, updates } = wire({ rules: [{ ...openEnded, status: 'archived', effectiveFrom: '2026-07' }] });
    const res: any = await rulesHandler(
      event('POST', {}, validBody({ effectiveFrom: '2026-07' })), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(updates).toHaveLength(0);
    expect(sets).toHaveLength(1);
  });
});

describe('api-payroll-rules PUT — the frozen-history guard', () => {
  beforeEach(() => vi.clearAllMocks());

  const rule = {
    id: 'r1', organizationId: 'org1', teacherId: 't1', status: 'active',
    label: 'Ставка', effectiveFrom: '2026-01', effectiveTo: null, branchId: null,
  };

  it('refuses to edit a rule already used by an APPROVED period', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { updateSpy } = wire({
      ruleDoc: rule,
      lines: [{ id: 'l1', ruleId: 'r1', organizationId: 'org1', periodId: 'p1' }],
      periods: { p1: { state: 'approved', organizationId: 'org1' } },
    });

    const res: any = await rulesHandler(
      event('PUT', {}, { ruleId: 'r1', label: 'Переписанная история' }), {} as any, () => {});

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).frozenStates).toContain('approved');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('refuses just as hard for a PAID period', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { updateSpy } = wire({
      ruleDoc: rule,
      lines: [{ id: 'l1', ruleId: 'r1', organizationId: 'org1', periodId: 'p1' }],
      periods: { p1: { state: 'paid', organizationId: 'org1' } },
    });
    const res: any = await rulesHandler(
      event('PUT', {}, { ruleId: 'r1', status: 'archived' }), {} as any, () => {});
    expect(res.statusCode).toBe(409);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('allows the edit when the only referencing period is still a draft', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { updates } = wire({
      ruleDoc: rule,
      lines: [{ id: 'l1', ruleId: 'r1', organizationId: 'org1', periodId: 'p1' }],
      periods: { p1: { state: 'draft', organizationId: 'org1' } },
    });
    const res: any = await rulesHandler(
      event('PUT', {}, { ruleId: 'r1', label: 'Новое имя' }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(updates[0].label).toBe('Новое имя');
  });

  it('does not let an approved period of ANOTHER org freeze this rule', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { updates } = wire({
      ruleDoc: rule,
      lines: [{ id: 'l1', ruleId: 'r1', organizationId: 'org1', periodId: 'p1' }],
      periods: { p1: { state: 'approved', organizationId: 'org2' } },
    });
    const res: any = await rulesHandler(
      event('PUT', {}, { ruleId: 'r1', label: 'Новое имя' }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(updates).toHaveLength(1);
  });

  it('scopes the usage lookup by ruleId AND organizationId', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { linesClauses } = wire({ ruleDoc: rule, lines: [] });
    await rulesHandler(event('PUT', {}, { ruleId: 'r1', label: 'X' }), {} as any, () => {});
    expect(linesClauses).toContainEqual(['ruleId', 'r1']);
    expect(linesClauses).toContainEqual(['organizationId', 'org1']);
  });

  it('refuses to touch a rule belonging to another organization', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { updateSpy } = wire({ ruleDoc: { ...rule, organizationId: 'org2' } });
    const res: any = await rulesHandler(
      event('PUT', {}, { ruleId: 'r1', label: 'X' }), {} as any, () => {});
    expect(res.statusCode).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('refuses a rule in a branch the manager cannot access', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE, { branchIds: ['A'], primaryBranchId: 'A' }));
    const { updateSpy } = wire({ ruleDoc: { ...rule, branchId: 'B' } });
    const res: any = await rulesHandler(
      event('PUT', {}, { ruleId: 'r1', label: 'X' }), {} as any, () => {});
    expect(res.statusCode).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('only writes allowlisted fields — teacherId/effectiveFrom/org stay put', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { updates } = wire({ ruleDoc: rule });
    const res: any = await rulesHandler(event('PUT', {}, {
      ruleId: 'r1',
      label: 'Новое имя',
      status: 'archived',
      effectiveTo: '2026-08',
      teacherId: 't999',
      effectiveFrom: '2020-01',
      organizationId: 'evil',
      supersedesId: 'forged',
      evilField: 'x',
    }), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    const written = updates[0];
    expect(written.label).toBe('Новое имя');
    expect(written.status).toBe('archived');
    expect(written.effectiveTo).toBe('2026-08');
    expect(written.teacherId).toBeUndefined();
    expect(written.effectiveFrom).toBeUndefined();
    expect(written.organizationId).toBeUndefined();
    expect(written.supersedesId).toBeUndefined();
    expect(written.evilField).toBeUndefined();
  });

  it('applies the same component validation as POST', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { updateSpy } = wire({ ruleDoc: rule });
    const res: any = await rulesHandler(event('PUT', {}, {
      ruleId: 'r1',
      components: [{ kind: 'percent_revenue', percentBp: 12000, base: 'collected', scope: {} }],
    }), {} as any, () => {});
    expect(res.statusCode).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('validates a new effectiveTo against the EXISTING effectiveFrom', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { updateSpy } = wire({ ruleDoc: { ...rule, effectiveFrom: '2026-05' } });
    const res: any = await rulesHandler(
      event('PUT', {}, { ruleId: 'r1', effectiveTo: '2026-02' }), {} as any, () => {});
    expect(res.statusCode).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe('api-payroll-rules DELETE', () => {
  beforeEach(() => vi.clearAllMocks());

  const rule = {
    id: 'r1', organizationId: 'org1', teacherId: 't1', status: 'active',
    label: 'Ставка', effectiveFrom: '2026-01', effectiveTo: null, branchId: null,
  };
  const DELETE_GRANT = ['payroll:delete'];

  it('refuses a rule used by an approved period and points at archiving instead', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT));
    const { deleteSpy } = wire({
      ruleDoc: rule,
      lines: [{ id: 'l1', ruleId: 'r1', organizationId: 'org1', periodId: 'p1' }],
      periods: { p1: { state: 'approved', organizationId: 'org1' } },
    });
    const res: any = await rulesHandler(event('DELETE', { id: 'r1' }), {} as any, () => {});
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).frozenStates).toContain('approved');
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('refuses a PAID period even with force=true — a payout is an accounting record', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT));
    const { deleteSpy } = wire({
      ruleDoc: rule,
      lines: [{ id: 'l1', ruleId: 'r1', organizationId: 'org1', periodId: 'p1' }],
      periods: { p1: { state: 'paid', organizationId: 'org1' } },
    });
    const res: any = await rulesHandler(event('DELETE', { id: 'r1', force: 'true' }), {} as any, () => {});
    expect(res.statusCode).toBe(409);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('blocks on draft payroll lines and reports how many, then allows force=true', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT));
    const seed = {
      ruleDoc: rule,
      lines: [
        { id: 'l1', ruleId: 'r1', organizationId: 'org1', periodId: 'p1' },
        { id: 'l2', ruleId: 'r1', organizationId: 'org1', periodId: 'p1' },
      ],
      periods: { p1: { state: 'draft', organizationId: 'org1' } },
    };

    const blocked = wire(seed);
    const res: any = await rulesHandler(event('DELETE', { id: 'r1' }), {} as any, () => {});
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).payrollLines).toBe(2);
    expect(blocked.deleteSpy).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const forced = wire(seed);
    const forcedRes: any = await rulesHandler(event('DELETE', { id: 'r1', force: 'true' }), {} as any, () => {});
    expect(forcedRes.statusCode).toBe(200);
    expect(forced.deleteSpy).toHaveBeenCalled();
  });

  it('deletes an unused rule outright', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT));
    const { deleteSpy } = wire({ ruleDoc: rule, lines: [] });
    const res: any = await rulesHandler(event('DELETE', { id: 'r1' }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).deleted).toBe(true);
    expect(deleteSpy).toHaveBeenCalled();
  });

  it('counts only this org lines — a foreign tenant must not block a legitimate delete', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT));
    const { deleteSpy, linesClauses } = wire({
      ruleDoc: rule,
      lines: [{ id: 'l1', ruleId: 'r1', organizationId: 'org2', periodId: 'p1' }],
      periods: { p1: { state: 'approved', organizationId: 'org2' } },
    });
    const res: any = await rulesHandler(event('DELETE', { id: 'r1' }), {} as any, () => {});
    expect(linesClauses).toContainEqual(['organizationId', 'org1']);
    expect(res.statusCode).toBe(200);
    expect(deleteSpy).toHaveBeenCalled();
  });

  it('refuses a rule from another organization', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT));
    const { deleteSpy } = wire({ ruleDoc: { ...rule, organizationId: 'org2' } });
    const res: any = await rulesHandler(event('DELETE', { id: 'r1' }), {} as any, () => {});
    expect(res.statusCode).toBe(403);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('requires payroll:delete — payroll:write is not enough', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { deleteSpy } = wire({ ruleDoc: rule });
    const res: any = await rulesHandler(event('DELETE', { id: 'r1' }), {} as any, () => {});
    expect(res.statusCode).toBe(403);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe('api-payroll-rules GET', () => {
  beforeEach(() => vi.clearAllMocks());

  const rows = [
    { id: 'r1', organizationId: 'org1', teacherId: 't1', status: 'active', effectiveFrom: '2026-01', branchId: 'A', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'r2', organizationId: 'org1', teacherId: 't2', status: 'active', effectiveFrom: '2026-07', branchId: 'B', createdAt: '2026-07-01T00:00:00Z' },
    { id: 'r3', organizationId: 'org2', teacherId: 't3', status: 'active', effectiveFrom: '2026-03', branchId: 'A', createdAt: '2026-03-01T00:00:00Z' },
  ];

  it('returns a bare array scoped to the org, newest effective period first', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read']));
    wire({ rules: rows });
    const res: any = await rulesHandler(event('GET'), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);           // bare array, not {rules:[...]}
    expect(body.map((r: any) => r.id)).toEqual(['r2', 'r1']); // org2 row excluded
  });

  it('applies the teacherId filter as an equality clause', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read']));
    const { rulesClauses } = wire({ rules: rows });
    const res: any = await rulesHandler(event('GET', { teacherId: 't1' }), {} as any, () => {});
    expect(rulesClauses).toContainEqual(['teacherId', 't1']);
    expect(JSON.parse(res.body).map((r: any) => r.id)).toEqual(['r1']);
  });

  it('rejects an unknown status filter rather than silently returning nothing', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read']));
    wire({ rules: rows });
    const res: any = await rulesHandler(event('GET', { status: 'активна' }), {} as any, () => {});
    expect(res.statusCode).toBe(400);
  });

  it('narrows to the branch a manager is pinned to', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read'], { branchIds: ['B'], primaryBranchId: 'B' }));
    wire({ rules: rows });
    const res: any = await rulesHandler(event('GET'), {} as any, () => {});
    expect(JSON.parse(res.body).map((r: any) => r.id)).toEqual(['r2']);
  });

  it('requires payroll:read — finances:read must not expose the rate card', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    wire({ rules: rows });
    const res: any = await rulesHandler(event('GET'), {} as any, () => {});
    expect(res.statusCode).toBe(403);
  });
});

describe('api-payroll-rules — protocol', () => {
  beforeEach(() => vi.clearAllMocks());

  it('answers OPTIONS with 204 before touching auth', async () => {
    const res: any = await rulesHandler(event('OPTIONS'), {} as any, () => {});
    expect(res.statusCode).toBe(204);
    expect(verifyAuth).not.toHaveBeenCalled();
  });

  it('401s an unauthenticated caller', async () => {
    (verifyAuth as any).mockResolvedValue(null);
    const res: any = await rulesHandler(event('GET'), {} as any, () => {});
    expect(res.statusCode).toBe(401);
  });

  it('405s an unsupported method', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read', 'payroll:write']));
    wire();
    const res: any = await rulesHandler(event('PATCH'), {} as any, () => {});
    expect(res.statusCode).toBe(405);
  });
});
