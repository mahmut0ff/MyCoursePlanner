import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Договорная цена обучения: чтение ставок и ручка массовой установки.
 *
 * Проверяем ровно то, что стоит денег: чья сумма побеждает, кого ручке НЕ
 * позволено трогать и какие уже выставленные начисления она вправе переписать.
 * «Применить к неоплаченным» переписывает суммы задним числом — это самая
 * опасная кнопка во всей фиче, и её границы должны быть зафиксированы тестом, а
 * не только комментарием.
 */

vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: vi.fn(), batch: vi.fn(), getAll: vi.fn() },
  adminAuth: { verifyIdToken: vi.fn() },
  getDocsByIds: vi.fn(),
}));

// Подменяем ТОЛЬКО verifyAuth: can()/requireBranchScope — это и есть проверяемые
// правила, и заменив их целиком мы бы тестировали мок (см. api-finance.test.ts).
vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn() };
});

import { handler } from '../api-finance-tuition';
import { adminDb, getDocsByIds } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';
import { loadTuitionRates, effectiveChargeAmount, tuitionDocId } from '../utils/tuition';

const ORG = 'org1';

const event = (method: string, body?: any, query?: any) => ({
  httpMethod: method,
  body: body ? JSON.stringify(body) : null,
  queryStringParameters: query || {},
  headers: {},
} as any);

const staff = (grants: string[], extra: any = {}) => ({
  uid: 'u1',
  email: 'u1@example.com',
  role: 'manager',
  displayName: 'Менеджер',
  organizationId: ORG,
  planId: null,
  aiEnabled: false,
  branchIds: [],
  primaryBranchId: null,
  permissions: { finances: false, settings: false, managers: false, branches: false },
  customRoleId: null,
  rbac: new Set(grants),
  ...extra,
});

/** Операции, осевшие в батчах за прогон. */
let writes: Array<{ op: 'set' | 'delete' | 'update'; id: string; data?: any }> = [];

const member = (extra: any = {}) => ({ role: 'student', userName: 'Студент', ...extra });

function wire(opts: {
  members?: Record<string, any>;
  plans?: any[];
  groups?: any[];
  /** Курс → чья это организация. По умолчанию все курсы наши. */
  courseOrgs?: Record<string, string>;
} = {}) {
  const { members = {}, plans = [], groups = [], courseOrgs = {} } = opts;
  writes = [];

  (getDocsByIds as any).mockImplementation(async (path: string, ids: string[]) => {
    const out: Record<string, any> = {};
    if (path.startsWith('orgMembers/')) {
      for (const id of ids) if (members[id]) out[id] = members[id];
      return out;
    }
    if (path === 'courses') {
      for (const id of ids) out[id] = { title: `Курс ${id}`, organizationId: courseOrgs[id] ?? ORG };
      return out;
    }
    return out;
  });

  const queryOver = (docs: any[]) => {
    const q: any = {
      where: vi.fn(() => q),
      get: vi.fn(async () => ({ docs: docs.map((d, i) => ({ id: d.__id || `d${i}`, data: () => d })) })),
    };
    return q;
  };

  (adminDb.collection as any).mockImplementation((name: string) => {
    if (name === 'studentTuitions') return { doc: (id: string) => ({ __id: id }) };
    if (name === 'studentPaymentPlans') return { ...queryOver(plans), doc: (id: string) => ({ __id: id }) };
    if (name === 'groups') return queryOver(groups);
    return queryOver([]);
  });

  (adminDb.batch as any).mockImplementation(() => ({
    set: (ref: any, data: any) => writes.push({ op: 'set', id: ref.__id, data }),
    delete: (ref: any) => writes.push({ op: 'delete', id: ref.__id }),
    update: (ref: any, data: any) => writes.push({ op: 'update', id: ref.__id, data }),
    commit: vi.fn().mockResolvedValue(undefined),
  }));
}

const post = async (body: any) => {
  const res: any = await handler(event('POST', body), {} as any, () => {});
  return { status: res.statusCode, body: JSON.parse(res.body || '{}') };
};

beforeEach(() => {
  vi.clearAllMocks();
  (verifyAuth as any).mockResolvedValue(staff(['finances:read', 'finances:write']));
});

// ═════════════════════════════════════════════════════════════════
// Чтение ставок
// ═════════════════════════════════════════════════════════════════

describe('loadTuitionRates', () => {
  const wireDocs = (docs: Record<string, any>) =>
    (getDocsByIds as any).mockResolvedValue(docs);

  it('returns the agreed amount, and zero counts as an agreed amount', async () => {
    // Ноль — стипендиат. Считать его «ставки нет» значит каждый месяц выставлять
    // ему полную цену курса.
    wireDocs({
      [tuitionDocId(ORG, 's1', 'c1')]: { organizationId: ORG, amount: 2000 },
      [tuitionDocId(ORG, 's2', 'c1')]: { organizationId: ORG, amount: 0 },
    });
    const rates = await loadTuitionRates(ORG, 'c1', ['s1', 's2', 's3']);
    expect(rates.get('s1')).toBe(2000);
    expect(rates.get('s2')).toBe(0);
    expect(rates.has('s3')).toBe(false);
  });

  it('ignores a foreign tenant and an unusable amount', async () => {
    wireDocs({
      [tuitionDocId(ORG, 's1', 'c1')]: { organizationId: 'org2', amount: 2000 },
      [tuitionDocId(ORG, 's2', 'c1')]: { organizationId: ORG, amount: -500 },
      [tuitionDocId(ORG, 's3', 'c1')]: { organizationId: ORG, amount: 'много' },
    });
    const rates = await loadTuitionRates(ORG, 'c1', ['s1', 's2', 's3']);
    expect(rates.size).toBe(0);
  });

  it('reads nothing at all when there is nobody to read for', async () => {
    await loadTuitionRates(ORG, 'c1', []);
    expect(getDocsByIds).not.toHaveBeenCalled();
  });
});

describe('effectiveChargeAmount', () => {
  it('prefers the agreed rate over the course price, including zero', () => {
    expect(effectiveChargeAmount(2000, 5000)).toBe(2000);
    expect(effectiveChargeAmount(0, 5000)).toBe(0);
  });

  it('falls back to the course price, and treats an unreadable price as zero', () => {
    expect(effectiveChargeAmount(null, 5000)).toBe(5000);
    expect(effectiveChargeAmount(undefined, undefined)).toBe(0);
    // NaN уехал бы в документ начисления и сломал бы каждый пересчёт долга.
    expect(effectiveChargeAmount(null, 'дорого')).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════
// Кого ручке позволено трогать
// ═════════════════════════════════════════════════════════════════

describe('api-finance-tuition · доступ', () => {
  it('refuses to write with a read-only finance grant', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    wire({ members: { s1: member() } });
    const res = await post({ studentIds: ['s1'], courseId: 'c1', amount: 2000 });
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('skips ids that are not students of this org instead of failing the batch', async () => {
    // Один протухший uid в выборке из двухсот не должен отменять остальные 199.
    wire({ members: { s1: member(), s2: member({ role: 'teacher' }) } });
    const res = await post({ studentIds: ['s1', 's2', 'ghost'], courseId: 'c1', amount: 2000 });

    expect(res.body).toMatchObject({ saved: 1, skippedStudents: 2 });
    expect(writes.map(w => w.id)).toEqual([tuitionDocId(ORG, 's1', 'c1')]);
  });

  it('never lets a branch-scoped manager price a student from another branch', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write'], { branchIds: ['b1'] }));
    wire({ members: { s1: member({ branchIds: ['b1'] }), s2: member({ branchIds: ['b2'] }) } });
    const res = await post({ studentIds: ['s1', 's2'], courseId: 'c1', amount: 2000 });

    expect(res.body).toMatchObject({ saved: 1, skippedStudents: 1 });
    expect(writes.map(w => w.id)).toEqual([tuitionDocId(ORG, 's1', 'c1')]);
  });
});

// ═════════════════════════════════════════════════════════════════
// Запись ставки
// ═════════════════════════════════════════════════════════════════

describe('api-finance-tuition · запись', () => {
  it('writes one rate per student under a deterministic id', async () => {
    wire({ members: { s1: member(), s2: member() } });
    await post({ studentIds: ['s1', 's2'], courseId: 'c1', amount: 3500 });

    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({
      op: 'set',
      id: tuitionDocId(ORG, 's1', 'c1'),
      data: { organizationId: ORG, studentId: 's1', courseId: 'c1', amount: 3500, updatedBy: 'u1' },
    });
  });

  it('clears the rate on null — that is «back to the course price», not zero', async () => {
    // Разница принципиальная: ноль означает «не начислять», а снятие возвращает
    // студента на прайс. Спутать их значит перестать выставлять счета вовсе.
    wire({ members: { s1: member() } });
    const res = await post({ studentIds: ['s1'], courseId: 'c1', amount: null });

    expect(res.body).toMatchObject({ saved: 0, cleared: 1 });
    expect(writes).toEqual([{ op: 'delete', id: tuitionDocId(ORG, 's1', 'c1') }]);
  });

  it('rejects a negative amount outright', async () => {
    wire({ members: { s1: member() } });
    const res = await post({ studentIds: ['s1'], courseId: 'c1', amount: -100 });
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('refuses to price a course that belongs to another org', async () => {
    // Иначе телом запроса записывается ставка по чужому курсу: применить её
    // некуда, объяснить потом некому — чистый мусор в деньгах.
    wire({ members: { s1: member() }, courseOrgs: { c1: 'org2' } });
    const res = await post({ studentIds: ['s1'], courseId: 'c1', amount: 2000 });

    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('still lets a rate be cleared after its course is gone', async () => {
    // Курс могли удалить уже ПОСЛЕ назначения цены — вычистить её должно быть
    // можно, иначе она останется висеть навсегда.
    wire({ members: { s1: member() }, courseOrgs: { c1: 'org2' } });
    const res = await post({ studentIds: ['s1'], courseId: 'c1', amount: null });

    expect(res.body).toMatchObject({ cleared: 1 });
    expect(writes).toEqual([{ op: 'delete', id: tuitionDocId(ORG, 's1', 'c1') }]);
  });

  it('expands «all courses» to every active group the student is in', async () => {
    wire({
      members: { s1: member() },
      groups: [
        { __id: 'g1', courseId: 'c1', studentIds: ['s1'] },
        { __id: 'g2', courseId: 'c2', studentIds: ['s1'] },
        // Закрытая группа новых начислений не порождает — цену по ней ставить не за что.
        { __id: 'g3', courseId: 'c3', studentIds: ['s1'], status: 'completed' },
        { __id: 'g4', courseId: 'c4', studentIds: ['s9'] },
      ],
    });
    const res = await post({ studentIds: ['s1'], courseId: '__all__', amount: 1500 });

    expect(res.body.saved).toBe(2);
    expect(writes.map(w => w.id).sort()).toEqual([
      tuitionDocId(ORG, 's1', 'c1'),
      tuitionDocId(ORG, 's1', 'c2'),
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════
// Применение к уже выставленным начислениям
// ═════════════════════════════════════════════════════════════════

describe('api-finance-tuition · применение к неоплаченным', () => {
  const plan = (extra: any = {}) => ({
    __id: 'p1', studentId: 's1', courseId: 'c1', period: '2026-08',
    totalAmount: 5000, listAmount: 5000, paidAmount: 0, status: 'pending',
    ...extra,
  });

  it('rewrites an unpaid charge and keeps the list price as the discount base', async () => {
    wire({ members: { s1: member() }, plans: [plan()] });
    const res = await post({
      studentIds: ['s1'], courseId: 'c1', amount: 4000, applyToUnpaid: true, period: '2026-08',
    });

    expect(res.body.updatedPlans).toBe(1);
    const update = writes.find(w => w.op === 'update');
    expect(update?.data).toMatchObject({ totalAmount: 4000, listAmount: 5000, status: 'pending' });
  });

  it('leaves paid and written-off charges alone', async () => {
    // Погашенный счёт не воскрешаем в долг задним числом, списанный не оживляем.
    wire({
      members: { s1: member() },
      plans: [
        plan({ __id: 'paid', paidAmount: 5000, status: 'paid' }),
        plan({ __id: 'cancelled', status: 'cancelled' }),
      ],
    });
    const res = await post({
      studentIds: ['s1'], courseId: 'c1', amount: 4000, applyToUnpaid: true, period: '2026-08',
    });

    expect(res.body.updatedPlans).toBe(0);
    expect(writes.some(w => w.op === 'update')).toBe(false);
  });

  it('refuses to drop a charge below money already taken — that is a refund', async () => {
    wire({ members: { s1: member() }, plans: [plan({ paidAmount: 4500, status: 'partial' })] });
    const res = await post({
      studentIds: ['s1'], courseId: 'c1', amount: 4000, applyToUnpaid: true, period: '2026-08',
    });

    expect(res.body).toMatchObject({ updatedPlans: 0, skippedPlans: 1 });
    expect(writes.some(w => w.op === 'update')).toBe(false);
  });

  it('closes a partially paid charge when the agreed price is already covered', async () => {
    wire({ members: { s1: member() }, plans: [plan({ paidAmount: 4000, status: 'partial' })] });
    const res = await post({
      studentIds: ['s1'], courseId: 'c1', amount: 4000, applyToUnpaid: true, period: '2026-08',
    });

    expect(res.body.updatedPlans).toBe(1);
    expect(writes.find(w => w.op === 'update')?.data).toMatchObject({ totalAmount: 4000, status: 'paid' });
  });

  it('touches only the requested month', async () => {
    wire({
      members: { s1: member() },
      plans: [plan({ __id: 'aug' }), plan({ __id: 'jul', period: '2026-07' })],
    });
    const res = await post({
      studentIds: ['s1'], courseId: 'c1', amount: 4000, applyToUnpaid: true, period: '2026-08',
    });

    expect(res.body.updatedPlans).toBe(1);
    expect(writes.find(w => w.op === 'update')?.id).toBe('aug');
  });

  it('changes nothing already issued unless asked to', async () => {
    wire({ members: { s1: member() }, plans: [plan()] });
    const res = await post({ studentIds: ['s1'], courseId: 'c1', amount: 4000, period: '2026-08' });

    expect(res.body.updatedPlans).toBe(0);
    expect(writes.every(w => w.op === 'set')).toBe(true);
  });

  it('never rewrites another student sharing the same course', async () => {
    wire({
      members: { s1: member() },
      plans: [plan(), plan({ __id: 'other', studentId: 's2' })],
    });
    const res = await post({
      studentIds: ['s1'], courseId: 'c1', amount: 4000, applyToUnpaid: true, period: '2026-08',
    });

    expect(res.body.updatedPlans).toBe(1);
    expect(writes.find(w => w.op === 'update')?.id).toBe('p1');
  });
});
