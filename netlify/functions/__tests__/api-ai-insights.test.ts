import { describe, it, expect, vi, beforeEach } from 'vitest';

// The Gemini model is mocked so we can capture the exact prompt the handler builds
// and assert what finance data did (or did not) reach it. vi.hoisted keeps the spy
// reachable from the hoisted vi.mock factory below.
const { generateContentSpy } = vi.hoisted(() => ({
  generateContentSpy: vi.fn(async (_prompt: string) => ({
    response: { text: () => '{"answer":"ok","highlights":[]}' },
  })),
}));

vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: vi.fn() },
  adminAuth: { verifyIdToken: vi.fn() },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

// Only verifyAuth is stubbed — can()/ok()/forbidden()/hasRole() stay real, so the
// finance_overview gate is exercised against the mocked user's real rbac set.
vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn() };
});

vi.mock('../utils/ai', () => ({
  getModel: () => ({ generateContent: generateContentSpy }),
  parseJsonLoose: (s: string) => JSON.parse(s),
  aiAllowed: () => true,
  hasGeminiKey: () => true,
  recordAiUsage: () => {},
}));

vi.mock('../utils/rate-limiter', () => ({
  rateLimiters: { ai: { isLimited: () => false } },
  getRateLimitKey: () => 'k',
}));

import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';
import { handler } from '../api-ai-insights';

const ask = (question: string) => ({
  httpMethod: 'POST',
  body: JSON.stringify({ question }),
  queryStringParameters: { action: 'ask' },
  headers: {},
} as any);

const baseUser = {
  uid: 'u1', email: 'u@e.com', role: 'manager', displayName: 'M',
  organizationId: 'org1', planId: 'professional', aiEnabled: true,
  branchIds: [] as string[], primaryBranchId: null,
  permissions: { finances: false, settings: false, managers: false, branches: false },
  customRoleId: null,
  rbac: new Set<string>(),
};
const withGrants = (grants: string[], extra: any = {}) => ({ ...baseUser, rbac: new Set(grants), ...extra });

// A distinctive income figure we can assert is present/absent in the prompt.
const INCOME = 777777;

const snap = (docs: any[]) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d })),
  empty: docs.length === 0,
  size: docs.length,
});
const query = (docs: any[]) => {
  const q: any = { where: vi.fn(() => q), get: vi.fn(async () => snap(docs)) };
  return q;
};

/** Wire the 7 collections gatherSnapshot reads; record which names were queried. */
function wireOrg() {
  const collectionsQueried: string[] = [];
  const members = [
    { id: 'm1', role: 'student', status: 'active', joinedAt: '2020-01-01' },
    { id: 'm2', role: 'student', status: 'active', joinedAt: '2020-01-01' },
    { id: 't1', role: 'teacher', status: 'active' },
  ];
  const transactions = [{ id: 'tx1', type: 'income', amount: INCOME, date: new Date().toISOString() }];
  const courses = [{ id: 'c1', title: 'Курс А', price: 5000 }];
  // orgMembers.doc().collection('members') and organizations.doc().collection('aiLeads')
  const subcol = (docs: any[]) => ({ doc: () => ({ collection: () => ({ get: async () => snap(docs) }) }) });

  (adminDb.collection as any).mockImplementation((name: string) => {
    collectionsQueried.push(name);
    switch (name) {
      case 'orgMembers': return subcol(members);
      case 'organizations': return subcol([]); // aiLeads
      case 'financeTransactions': return query(transactions);
      case 'studentPaymentPlans': return query([]);
      case 'examAttempts': return query([]);
      case 'journal': return query([]);
      case 'courses': return query(courses);
      default: return query([]);
    }
  });
  return { collectionsQueried };
}

const lastPrompt = (): string => {
  const calls = generateContentSpy.mock.calls;
  return calls[calls.length - 1]?.[0] as string;
};

describe('api-ai-insights ?action=ask — finance is gated by finance_overview, not just role', () => {
  beforeEach(() => vi.clearAllMocks());

  it('withholds revenue/profit from a cashier (finances CRUD, no finance_overview)', async () => {
    (verifyAuth as any).mockResolvedValue(withGrants(['finances:read', 'finances:write', 'finances:delete']));
    const { collectionsQueried } = wireOrg();

    const res: any = await handler(ask('Какая у нас выручка и прибыль за месяц?'), {} as any, () => {});
    // The role check still lets a manager-based cashier through — that was the leak.
    expect(res.statusCode).toBe(200);

    const prompt = lastPrompt();
    // No finance figure reached the model.
    expect(prompt).not.toContain(String(INCOME));
    expect(prompt).not.toContain('доход за текущий месяц');
    expect(prompt).toContain('нет доступа к финансовой сводке'); // redaction marker
    // Non-finance insight still works for the cashier.
    expect(prompt).toContain('АКТИВНЫЕ УЧЕНИКИ: 2');
    // Defense in depth: the money was never even read out of Firestore.
    expect(collectionsQueried).not.toContain('financeTransactions');
    expect(collectionsQueried).not.toContain('studentPaymentPlans');
  });

  it('gives a finance_overview holder the real figures', async () => {
    (verifyAuth as any).mockResolvedValue(withGrants(['finance_overview:read', 'finances:read']));
    const { collectionsQueried } = wireOrg();

    const res: any = await handler(ask('Какая выручка?'), {} as any, () => {});
    expect(res.statusCode).toBe(200);

    const prompt = lastPrompt();
    expect(prompt).toContain(String(INCOME));
    expect(prompt).toContain('ФИНАНСЫ: доход за текущий месяц');
    expect(collectionsQueried).toContain('financeTransactions');
  });

  it('an admin sees finance even with an empty grant set (can() passes full-access roles)', async () => {
    (verifyAuth as any).mockResolvedValue(withGrants([], { role: 'admin' }));
    wireOrg();

    const res: any = await handler(ask('Выручка?'), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(lastPrompt()).toContain(String(INCOME));
  });
});
