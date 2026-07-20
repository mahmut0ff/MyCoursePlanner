import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// firebase-admin мокается целиком: auth.ts тянет adminAuth/adminDb, а
// finance-names.ts — getDocsByIds на этапе загрузки модуля.
vi.mock('../utils/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(),
    batch: vi.fn(),
    runTransaction: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
  },
  adminAuth: { verifyIdToken: vi.fn() },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

// Подменяется только verifyAuth: can()/getOrgFilter()/requireBranchScope() —
// это и есть проверяемая семантика, мокать их значит тестировать мок.
vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn() };
});

// Крон рассылает уведомления через notifyOrgAdmins — сеть в тесте не нужна,
// но ФАКТ вызова проверяется: молчаливый пропуск филиальной схемы это баг.
vi.mock('../utils/notifications', () => ({ notifyOrgAdmins: vi.fn().mockResolvedValue(undefined) }));

import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';
import { notifyOrgAdmins } from '../utils/notifications';
import { handler } from '../api-payroll';
import { handler as accrualHandler } from '../payroll-accrual';

const event = (method: string, query?: any, body?: any) => ({
  httpMethod: method,
  body: body ? JSON.stringify(body) : null,
  queryStringParameters: query || {},
  headers: {},
} as any);

/** AuthUser ровно настолько, насколько его читают can()/getOrgFilter()/branch-хелперы. */
const staff = (grants: string[], extra: any = {}) => ({
  uid: 'director1',
  email: 'd@example.com',
  role: 'manager',
  displayName: 'Директор',
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

/**
 * Firestore в памяти.
 *
 * Устроен так, что запрос ОБЯЗАН отобрать строки записанными where-клаузами:
 * забытый `organizationId ==` проявляется как утёкшая чужая строка, а не молча
 * проходит. Клаузы копятся на КЛОНЕ запроса, иначе два независимых запроса к
 * одной коллекции складывали бы фильтры друг друга.
 */
function makeDb(seed: Record<string, any[]>) {
  const store: Record<string, Map<string, any>> = {};
  for (const [name, rows] of Object.entries(seed)) {
    store[name] = new Map(rows.map((r) => [r.id, { ...r }]));
  }
  const collectionOf = (name: string) => (store[name] ??= new Map());
  const clauses: Record<string, Array<[string, any]>> = {};

  const makeQuery = (name: string, where: Array<[string, any]>): any => ({
    where: (field: string, _op: string, value: any) => {
      (clauses[name] ??= []).push([field, value]);
      return makeQuery(name, [...where, [field, value]]);
    },
    get: async () => {
      const rows = [...collectionOf(name).values()].filter((r) =>
        where.every(([f, v]) => (r[f] ?? null) === v),
      );
      return { docs: rows.map((r) => ({ id: r.id, exists: true, data: () => r })), size: rows.length, empty: !rows.length };
    },
  });

  let autoId = 0;
  const docRef = (name: string, id: string): any => ({
    id,
    get: async () => {
      const row = collectionOf(name).get(id);
      return { exists: !!row, id, data: () => row };
    },
    set: async (data: any) => { collectionOf(name).set(id, { id, ...data }); },
    // Проверка и запись выполняются БЕЗ await между ними — иначе две «параллельные»
    // транзакции обе увидели бы «документа нет» и обе записали бы, чего настоящий
    // Firestore не допускает: create либо создаёт, либо падает ALREADY_EXISTS.
    create: async (data: any) => {
      if (collectionOf(name).has(id)) {
        const err: any = new Error(`document already exists: ${name}/${id}`);
        err.code = 6;
        throw err;
      }
      collectionOf(name).set(id, { id, ...data });
    },
    update: async (data: any) => {
      const row = collectionOf(name).get(id);
      if (!row) throw new Error(`no doc ${name}/${id}`);
      collectionOf(name).set(id, { ...row, ...data });
    },
    delete: async () => { collectionOf(name).delete(id); },
    // orgMembers/{org}/members — единственная вложенная коллекция на пути расчёта.
    collection: (sub: string) => makeCollection(`${name}/${id}/${sub}`),
  });

  const makeCollection = (name: string): any => ({
    ...makeQuery(name, []),
    doc: (id?: string) => docRef(name, id ?? `auto${++autoId}`),
  });

  (adminDb.collection as any).mockImplementation((name: string) => makeCollection(name));

  // Батч применяет операции только на commit(), как настоящий.
  (adminDb.batch as any).mockImplementation(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (ref: any, data: any) => { ops.push(() => ref.set(data)); },
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      delete: (ref: any) => { ops.push(() => ref.delete()); },
      commit: async () => { for (const op of ops) await op(); },
    };
  });

  (adminDb.runTransaction as any).mockImplementation(async (fn: any) => {
    const writes: Array<() => Promise<void>> = [];
    await fn({
      get: (ref: any) => ref.get(),
      set: (ref: any, data: any) => { writes.push(() => ref.set(data)); },
      // create проверяет существование В МОМЕНТ ПРИМЕНЕНИЯ, а не постановки в
      // очередь — как настоящий Firestore, который отвергает ALREADY_EXISTS на
      // коммите. Без этого гонка двух транзакций в тесте прошла бы «успешно»,
      // хотя в бою вторая упала бы.
      create: (ref: any, data: any) => { writes.push(() => ref.create(data)); },
      update: (ref: any, data: any) => { writes.push(() => ref.update(data)); },
      delete: (ref: any) => { writes.push(() => ref.delete()); },
    });
    // Броски внутри fn происходят ДО этой строки, поэтому провалившаяся
    // транзакция ничего не записывает — как в Firestore.
    for (const w of writes) await w();
  });

  return {
    rows: (name: string) => [...collectionOf(name).values()],
    clauses: (name: string) => clauses[name] ?? [],
    set: (name: string, row: any) => collectionOf(name).set(row.id, row),
  };
}

// ── Фикстуры ───────────────────────────────────────────────────────────────
const july = '2026-07';
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h, 0, 0, 0).toISOString();

const baseSeed = () => ({
  compensationRules: [
    {
      id: 'rule1', organizationId: 'org1', teacherId: 't1', branchId: null,
      label: 'Оклад + 20% с группы А', status: 'active',
      components: [
        { kind: 'salary', amountMinor: 3000000 },
        { kind: 'percent_revenue', percentBp: 2000, base: 'collected', scope: { groupIds: ['g1'] } },
      ],
      effectiveFrom: '2026-01', effectiveTo: null,
    },
    // Чужая организация — не должна попасть ни в одну ведомость.
    {
      id: 'ruleForeign', organizationId: 'org2', teacherId: 'tX', branchId: null,
      label: 'Чужая', status: 'active',
      components: [{ kind: 'salary', amountMinor: 9999999 }],
      effectiveFrom: '2026-01', effectiveTo: null,
    },
  ],
  financeTransactions: [
    { id: 'inc1', organizationId: 'org1', type: 'income', amount: 5000, date: local(2026, 6, 10), categoryId: 'tuition', groupId: 'g1', courseId: 'c1', branchId: null, paymentPlanId: 'p1' },
    { id: 'inc2', organizationId: 'org1', type: 'income', amount: 5000, date: local(2026, 6, 20), categoryId: 'tuition', groupId: 'g1', courseId: 'c1', branchId: null, paymentPlanId: 'p2' },
    // Вне окна — август.
    { id: 'inc3', organizationId: 'org1', type: 'income', amount: 9000, date: local(2026, 7, 3), categoryId: 'tuition', groupId: 'g1', courseId: 'c1', branchId: null, paymentPlanId: 'p3' },
    { id: 'incForeign', organizationId: 'org2', type: 'income', amount: 7000, date: local(2026, 6, 12), categoryId: 'tuition', groupId: 'g1', courseId: 'c1', branchId: null, paymentPlanId: 'pX' },
  ],
  lessonSessions: [
    { id: 's1', organizationId: 'org1', groupId: 'g1', courseId: 'c1', teacherId: 't1', date: '2026-07-05', durationMinutes: 90, status: 'held', headcount: 8, branchId: null },
    // Ничья сессия: teacherId null — не начисляется никому.
    { id: 's2', organizationId: 'org1', groupId: 'g1', courseId: 'c1', teacherId: null, date: '2026-07-06', durationMinutes: 90, status: 'held', headcount: 8, branchId: null },
  ],
  payrollPeriods: [],
  payrollLines: [],
  'orgMembers/org1/members': [
    { id: 't1', uid: 't1', role: 'teacher', status: 'active', branchIds: [] },
  ],
});

async function calculate(body: any = {}) {
  return handler(event('POST', { action: 'calculate' }, { period: july, ...body }), {} as any, () => {}) as any;
}

// ── Тесты ──────────────────────────────────────────────────────────────────

describe('api-payroll calculate — идемпотентность и пересборка', () => {
  let db: ReturnType<typeof makeDb>;
  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb(baseSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
  });

  it('создаёт период и считает строку: оклад + 20% собранного в окне', async () => {
    const res = await calculate();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.state).toBe('calculated');

    const lines = db.rows('payrollLines');
    expect(lines).toHaveLength(1);
    // 30 000.00 оклад + 20% от 10 000.00 собранных в июле (август не в окне).
    expect(lines[0].computedMinor).toBe(3000000 + 200000);
    expect(lines[0].finalMinor).toBe(lines[0].computedMinor);
    expect(lines[0].source).toBe('rule');
  });

  it('идемпотентен: второй расчёт даёт те же суммы и не плодит строк', async () => {
    await calculate();
    const first = db.rows('payrollLines').map((l) => l.computedMinor);

    await calculate();
    const second = db.rows('payrollLines');

    expect(second).toHaveLength(1);
    expect(second.map((l) => l.computedMinor)).toEqual(first);
    // И ведомость осталась одна — второй расчёт нашёл существующую.
    expect(db.rows('payrollPeriods')).toHaveLength(1);
  });

  it('замораживает окно при ПЕРВОМ расчёте и не двигает его при повторных', async () => {
    await calculate();
    const period = db.rows('payrollPeriods')[0];
    const frozen = { start: period.windowStart, end: period.windowEnd };
    // Правим окно вручную, как если бы его заморозили раньше по другим границам.
    db.set('payrollPeriods', { ...period, windowStart: '2026-07-05T00:00:00.000Z' });

    await calculate();
    expect(db.rows('payrollPeriods')[0].windowStart).toBe('2026-07-05T00:00:00.000Z');
    expect(db.rows('payrollPeriods')[0].windowEnd).toBe(frozen.end);
  });

  it('сохраняет ручные строки при пересчёте, а расчётные пересобирает', async () => {
    await calculate();
    const periodId = db.rows('payrollPeriods')[0].id;
    const ruleLineIdBefore = db.rows('payrollLines').find((l) => l.source === 'rule')!.id;

    const bonus = await handler(
      event('POST', { action: 'line' }, { periodId, teacherId: 't1', source: 'manual_bonus', amountMinor: 50000, note: 'За открытый урок' }),
      {} as any, () => {},
    ) as any;
    expect(bonus.statusCode).toBe(200);

    await calculate();

    const lines = db.rows('payrollLines');
    expect(lines).toHaveLength(2);
    const manual = lines.find((l) => l.isManual)!;
    // Премия пережила пересчёт дословно.
    expect(manual.finalMinor).toBe(50000);
    expect(manual.note).toBe('За открытый урок');
    // Расчётная строка — новая (delete-and-rebuild), а не подправленная.
    expect(lines.find((l) => l.source === 'rule')!.id).not.toBe(ruleLineIdBefore);
  });

  it('штраф хранится отрицательным, каким бы знаком его ни прислали', async () => {
    await calculate();
    const periodId = db.rows('payrollPeriods')[0].id;
    await handler(
      event('POST', { action: 'line' }, { periodId, teacherId: 't1', source: 'manual_penalty', amountMinor: 20000 }),
      {} as any, () => {},
    );
    const penalty = db.rows('payrollLines').find((l) => l.source === 'manual_penalty')!;
    expect(penalty.finalMinor).toBe(-20000);
  });

  it('не начисляет сессию без преподавателя и сообщает об этом диагностикой', async () => {
    await calculate();
    const diagnostics = db.rows('payrollPeriods')[0].diagnostics as any[];
    const orphan = diagnostics.find((d) => d.code === 'session_no_teacher');
    expect(orphan).toBeTruthy();
    expect(orphan.count).toBe(1);
    expect(orphan.sample).toContain('s2');
  });

  it('запрашивает входы только равенством — никаких orderBy/limit', async () => {
    await calculate();
    for (const name of ['compensationRules', 'financeTransactions', 'lessonSessions', 'payrollLines', 'payrollPeriods']) {
      // Клаузы записаны — значит выборка шла через where, а мок не поддерживает
      // ничего, кроме равенства: любой orderBy/limit упал бы здесь.
      expect(db.clauses(name).every(([f]) => typeof f === 'string')).toBe(true);
    }
    expect(db.clauses('compensationRules')).toContainEqual(['organizationId', 'org1']);
    expect(db.clauses('compensationRules')).toContainEqual(['status', 'active']);
    expect(db.clauses('financeTransactions')).toContainEqual(['organizationId', 'org1']);
    expect(db.clauses('lessonSessions')).toContainEqual(['organizationId', 'org1']);
  });

  it('не видит данных чужой организации', async () => {
    await calculate();
    const lines = db.rows('payrollLines');
    // Чужое правило не дало строки, чужой доход не попал в базу процента.
    expect(lines.every((l) => l.teacherId !== 'tX')).toBe(true);
    expect(lines[0].computedMinor).toBe(3200000);
  });

  it('требует payroll:write — гранта finances недостаточно', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write']));
    const res = await calculate();
    expect(res.statusCode).toBe(403);
    expect(db.rows('payrollPeriods')).toHaveLength(0);
  });

  it('отказывает в периоде неверного формата, не создавая ведомость', async () => {
    const res = await calculate({ period: 'июль' });
    expect(res.statusCode).toBe(400);
    expect(db.rows('payrollPeriods')).toHaveLength(0);
  });
});

describe('api-payroll — филиальное разграничение', () => {
  let db: ReturnType<typeof makeDb>;
  beforeEach(() => {
    vi.clearAllMocks();
    const seed: any = baseSeed();
    seed.compensationRules.push({
      id: 'ruleB', organizationId: 'org1', teacherId: 't2', branchId: 'B',
      label: 'Оклад Б', status: 'active',
      components: [{ kind: 'salary', amountMinor: 1000000 }],
      effectiveFrom: '2026-01', effectiveTo: null,
    });
    db = makeDb(seed);
  });

  it('не даёт рассчитать ведомость чужого филиала', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write'], { branchIds: ['A'], primaryBranchId: 'A' }));
    const res = await calculate({ branchId: 'B' });
    expect(res.statusCode).toBe(403);
    expect(db.rows('payrollPeriods')).toHaveLength(0);
  });

  it('ведомость филиала берёт только ставки этого филиала', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write']));
    await calculate({ branchId: 'B' });
    const lines = db.rows('payrollLines');
    // Org-wide ставка t1 не начисляется в филиальной ведомости: иначе один оклад
    // выплатился бы по разу на каждый филиал.
    expect(lines.map((l) => l.teacherId)).toEqual(['t2']);
  });

  it('сохраняет филиал на ведомости, и последующее чтение по филиалу её находит', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    const res = await calculate({ branchId: 'B' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).branchId).toBe('B');

    const period = db.rows('payrollPeriods')[0];
    expect(period.branchId).toBe('B');
    // Именно этот GET делает UI после расчёта — он штампован филиалом. Раньше
    // расчёт писал branchId: null, и ведомость исчезала сразу после расчёта.
    const list = await handler(
      event('GET', { action: 'periods', period: july, branchId: 'B' }), {} as any, () => {},
    ) as any;
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(list.body).map((p: any) => p.id)).toEqual([period.id]);
  });

  it('не отдаёт общеорганизационную ведомость участнику, ограниченному филиалом', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write'], { branchIds: ['A'], primaryBranchId: 'A' }));
    // Филиал не назван — это «Все филиалы». Для такого участника расчёт по всей
    // организации означал бы зарплату филиалов, которых он не видит.
    const res = await calculate();
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/Выберите филиал/i);
    expect(db.rows('payrollPeriods')).toHaveLength(0);

    // Свой филиал он рассчитать вправе.
    const own = await calculate({ branchId: 'A' });
    expect(own.statusCode).toBe(200);
    expect(db.rows('payrollPeriods')[0].branchId).toBe('A');
  });

  it('месяц не покрывается дважды: после общей ведомости филиальная за тот же месяц отклоняется', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate(); // «Все филиалы» → branchId null, включает t1 И t2

    const res = await calculate({ branchId: 'B' });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('period_coverage_conflict');
    // Текст обязан назвать месяц и подсказать выход, а не просто «конфликт».
    expect(body.error).toContain(july);
    expect(body.error).toMatch(/Все филиалы/);
    expect(body.conflictBranchId).toBeNull();

    // Вторая ведомость не создана — иначе t2 попал бы в обе и был бы оплачен дважды.
    expect(db.rows('payrollPeriods')).toHaveLength(1);
    expect(db.rows('payrollPeriods')[0].branchId).toBeNull();
  });

  it('и в обратную сторону: после филиальной ведомости общая за тот же месяц отклоняется', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate({ branchId: 'B' });

    const res = await calculate();
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('period_coverage_conflict');
    expect(body.conflictBranchId).toBe('B');
    expect(body.error).toMatch(/Выберите филиал/);

    expect(db.rows('payrollPeriods')).toHaveLength(1);
    expect(db.rows('payrollPeriods')[0].branchId).toBe('B');
  });

  it('две РАЗНЫЕ филиальные ведомости за месяц сосуществуют — их охваты не пересекаются', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    expect((await calculate({ branchId: 'A' })).statusCode).toBe(200);
    expect((await calculate({ branchId: 'B' })).statusCode).toBe(200);

    const periods = db.rows('payrollPeriods');
    expect(periods).toHaveLength(2);
    expect(periods.map((p) => p.branchId).sort()).toEqual(['A', 'B']);

    // У ставки ровно один branchId, поэтому один преподаватель не может попасть
    // в обе: t2 (филиал B) есть только в ведомости B.
    const linesOf = (id: string) => db.rows('payrollLines').filter((l) => l.periodId === id);
    const branchB = periods.find((p) => p.branchId === 'B')!;
    const branchA = periods.find((p) => p.branchId === 'A')!;
    expect(linesOf(branchB.id).map((l) => l.teacherId)).toEqual(['t2']);
    expect(linesOf(branchA.id).map((l) => l.teacherId)).toEqual([]);

    // Выбор филиала в чтении не смешивает их: строгое совпадение.
    const list = await handler(
      event('GET', { action: 'periods', period: july, branchId: 'B' }), {} as any, () => {},
    ) as any;
    expect(JSON.parse(list.body).map((p: any) => p.id)).toEqual([branchB.id]);
  });

  it('пересчёт СВОЕЙ ведомости конфликтом не считается', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate({ branchId: 'B' });
    // Ведомость B уже существует; повторный расчёт того же охвата обязан пройти,
    // а не наткнуться на «конфликт» с самой собой.
    const again = await calculate({ branchId: 'B' });
    expect(again.statusCode).toBe(200);
    expect(db.rows('payrollPeriods')).toHaveLength(1);
  });

  it('выплата блокируется, если месяц уже закрыт пересекающейся ведомостью (легаси-данные)', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate({ branchId: 'B' });
    const branchPeriod = db.rows('payrollPeriods')[0];
    await handler(event('POST', { action: 'approve' }, { periodId: branchPeriod.id }), {} as any, () => {});

    // Пара, заведённая ДО появления проверки в calculate: общая ведомость за тот
    // же июль, уже выплаченная. Деньги уходят в pay — там и обязан стоять рубеж.
    db.set('payrollPeriods', {
      id: 'legacyOrgWide', organizationId: 'org1', period: july, branchId: null,
      state: 'paid', windowStart: '', windowEnd: '', totalMinor: 1000000,
    });

    const res = await handler(
      event('POST', { action: 'pay' }, { periodId: branchPeriod.id }), {} as any, () => {},
    ) as any;
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('period_coverage_conflict');
    expect(db.rows('financeTransactions').filter((t) => t.categoryId === 'salary')).toHaveLength(0);
  });

  it('скрывает ведомость чужого филиала из детального чтения', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate({ branchId: 'B' });
    const periodId = db.rows('payrollPeriods')[0].id;

    (verifyAuth as any).mockResolvedValue(staff(['payroll:read'], { branchIds: ['A'], primaryBranchId: 'A' }));
    const res = await handler(event('GET', { action: 'period', id: periodId }), {} as any, () => {}) as any;
    expect(res.statusCode).toBe(403);
  });
});

describe('api-payroll approve — заморозка', () => {
  let db: ReturnType<typeof makeDb>;
  let periodId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = makeDb(baseSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate();
    periodId = db.rows('payrollPeriods')[0].id;
  });

  const approve = () => handler(event('POST', { action: 'approve' }, { periodId }), {} as any, () => {}) as any;

  it('отказывает из состояния draft — замораживать нечего', async () => {
    db.set('payrollPeriods', { ...db.rows('payrollPeriods')[0], state: 'draft' });
    const res = await approve();
    expect(res.statusCode).toBe(409);
    expect(db.rows('payrollPeriods')[0].state).toBe('draft');
  });

  it('замораживает totalMinor суммой всех строк, включая ручные', async () => {
    await handler(
      event('POST', { action: 'line' }, { periodId, teacherId: 't1', source: 'manual_penalty', amountMinor: 100000 }),
      {} as any, () => {},
    );
    const res = await approve();
    expect(res.statusCode).toBe(200);
    const period = db.rows('payrollPeriods')[0];
    expect(period.state).toBe('approved');
    // 3 200 000 расчётных − 100 000 штрафа.
    expect(period.totalMinor).toBe(3100000);
    expect(period.approvedBy).toBe('director1');
  });

  it('не даёт утвердить дважды', async () => {
    await approve();
    const second = await approve();
    expect(second.statusCode).toBe(409);
  });

  it('утверждённый период отказывается пересчитываться и не трогает строки', async () => {
    await approve();
    const before = db.rows('payrollLines').map((l) => l.id).sort();

    const res = await calculate();
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/утверждён/i);
    expect(db.rows('payrollLines').map((l) => l.id).sort()).toEqual(before);
  });

  it('утверждённый период отказывается принимать правку и ручную строку', async () => {
    await approve();
    const lineId = db.rows('payrollLines')[0].id;

    const override = await handler(
      event('POST', { action: 'line' }, { periodId, lineId, overrideMinor: 1, overrideReason: 'нет' }),
      {} as any, () => {},
    ) as any;
    expect(override.statusCode).toBe(409);

    const manual = await handler(
      event('POST', { action: 'line' }, { periodId, teacherId: 't1', source: 'manual_bonus', amountMinor: 1 }),
      {} as any, () => {},
    ) as any;
    expect(manual.statusCode).toBe(409);

    expect(db.rows('payrollLines')[0].finalMinor).toBe(3200000);
  });

  it('totalMinor не «едет» вслед за строками после заморозки', async () => {
    await approve();
    const frozen = db.rows('payrollPeriods')[0].totalMinor;
    // Строку кто-то поменял в обход API — итог периода обязан остаться прежним.
    const line = db.rows('payrollLines')[0];
    db.set('payrollLines', { ...line, finalMinor: 1 });
    expect(db.rows('payrollPeriods')[0].totalMinor).toBe(frozen);
  });
});

describe('api-payroll line — правка суммы', () => {
  let db: ReturnType<typeof makeDb>;
  let periodId: string;
  let lineId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = makeDb(baseSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read', 'payroll:delete']));
    await calculate();
    periodId = db.rows('payrollPeriods')[0].id;
    lineId = db.rows('payrollLines')[0].id;
  });

  it('finalMinor = COALESCE(override, computed)', async () => {
    const res = await handler(
      event('POST', { action: 'line' }, { periodId, lineId, overrideMinor: 2500000, overrideReason: 'Договорились' }),
      {} as any, () => {},
    ) as any;
    expect(res.statusCode).toBe(200);
    const line = db.rows('payrollLines')[0];
    expect(line.finalMinor).toBe(2500000);
    // Расчётное число сохраняется рядом — иначе не видно, что именно правили.
    expect(line.computedMinor).toBe(3200000);

    const cleared = await handler(
      event('POST', { action: 'line' }, { periodId, lineId, overrideMinor: null }),
      {} as any, () => {},
    ) as any;
    expect(cleared.statusCode).toBe(200);
    expect(db.rows('payrollLines')[0].finalMinor).toBe(3200000);
  });

  it('требует причину правки — сумма без объяснения это дыра в аудите', async () => {
    const res = await handler(
      event('POST', { action: 'line' }, { periodId, lineId, overrideMinor: 1 }),
      {} as any, () => {},
    ) as any;
    expect(res.statusCode).toBe(400);
    expect(db.rows('payrollLines')[0].finalMinor).toBe(3200000);
  });

  it('не позволяет править строку чужой ведомости по одному лишь id', async () => {
    db.set('payrollLines', { id: 'foreignLine', organizationId: 'org2', periodId: 'other', teacherId: 'tX', finalMinor: 1, computedMinor: 1, isManual: false, source: 'rule' });
    const res = await handler(
      event('POST', { action: 'line' }, { periodId, lineId: 'foreignLine', overrideMinor: 5, overrideReason: 'x' }),
      {} as any, () => {},
    ) as any;
    expect(res.statusCode).toBe(403);
  });

  it('удаляет ручную строку, но не расчётную', async () => {
    const created = await handler(
      event('POST', { action: 'line' }, { periodId, teacherId: 't1', source: 'manual_bonus', amountMinor: 1000 }),
      {} as any, () => {},
    ) as any;
    const manualId = JSON.parse(created.body).id;

    const badDelete = await handler(event('DELETE', { action: 'line', id: lineId }), {} as any, () => {}) as any;
    expect(badDelete.statusCode).toBe(400);

    const goodDelete = await handler(event('DELETE', { action: 'line', id: manualId }), {} as any, () => {}) as any;
    expect(goodDelete.statusCode).toBe(200);
    expect(db.rows('payrollLines').some((l) => l.id === manualId)).toBe(false);
  });
});

describe('api-payroll pay — идемпотентность и расходы кассы', () => {
  let db: ReturnType<typeof makeDb>;
  let periodId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = makeDb(baseSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate();
    periodId = db.rows('payrollPeriods')[0].id;
    await handler(event('POST', { action: 'approve' }, { periodId }), {} as any, () => {});
  });

  const pay = (body: any = {}) =>
    handler(event('POST', { action: 'pay' }, { periodId, ...body }), {} as any, () => {}) as any;

  const salaryRows = () => db.rows('financeTransactions').filter((t) => t.categoryId === 'salary');

  it('пишет один расход на строку и помечает период выплаченным', async () => {
    const res = await pay({ date: '2026-08-05' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).written).toBe(1);
    expect(salaryRows()).toHaveLength(1);
    expect(db.rows('payrollPeriods')[0].state).toBe('paid');
    expect(db.rows('payrollPeriods')[0].paidBy).toBe('director1');
  });

  it('расход неотличим от ручного и несёт ключи идемпотентности', async () => {
    await pay();
    const tx = salaryRows()[0];
    expect(tx.type).toBe('expense');
    expect(tx.categoryId).toBe('salary');
    expect(tx.organizationId).toBe('org1');
    expect(tx.teacherId).toBe('t1');
    expect(tx.payrollPeriodId).toBe(periodId);
    expect(tx.payrollLineId).toBe(db.rows('payrollLines')[0].id);
    expect(tx.createdBy).toBe('director1');
    // Сомы на границе: 3 200 000 тыйын = 32 000.00 с.
    expect(tx.amount).toBe(32000);
    expect(tx.description).toContain('Зарплата за 2026-07');
    // Группа однозначна по scope правила — расход попадает в рентабельность.
    expect(tx.groupId).toBe('g1');
  });

  it('идемпотентен: повторная выплата не пишет ни одного лишнего расхода', async () => {
    await pay();
    const afterFirst = salaryRows().map((t) => t.id).sort();

    const second = await pay();
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).written).toBe(0);
    expect(JSON.parse(second.body).skipped).toBe(1);
    expect(salaryRows().map((t) => t.id).sort()).toEqual(afterFirst);
  });

  it('id расхода детерминирован по (период, строка) — повтор не может создать второй документ', async () => {
    await pay();
    const lineId = db.rows('payrollLines')[0].id;
    const tx = salaryRows()[0];
    // Не автоид: id выводится из ключей идемпотентности, поэтому одна строка
    // физически не может дать два документа — Firestore не хранит два id.
    expect(tx.id).toBe(`pay_${periodId}_${lineId}`);
    expect(tx.id).not.toMatch(/^auto\d+$/);
    // Легальный id документа Firestore: без '/', не '.'/'..', не /^__.*__$/.
    expect(tx.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tx.id.length).toBeLessThanOrEqual(1500);
  });

  it('корректность не держится на предварительном чтении: слепой повтор не задваивает расход', async () => {
    await pay();
    expect(salaryRows()).toHaveLength(1);
    const before = salaryRows()[0];

    // Ослепляем быстрый путь: снимаем payrollLineId, по которому строится
    // alreadyPaid. Ровно так выглядит устаревшее/конкурентное чтение — оно не
    // видит уже записанный расход и пропускает строку к записи.
    db.set('financeTransactions', { ...before, payrollLineId: undefined });

    const res = await pay();
    // Расход всё равно один: детерминированный id + create не дали создать второй.
    expect(salaryRows()).toHaveLength(1);
    expect(JSON.parse(res.body).written).toBe(0);
    expect(JSON.parse(res.body).duplicatesBlocked).toBe(1);
    // И это не «провал»: результат верный, период вправе остаться выплаченным.
    expect(res.statusCode).toBe(200);
    expect(db.rows('payrollPeriods')[0].state).toBe('paid');
  });

  it('две одновременные выплаты одной строки дают ровно один расход', async () => {
    // Оба вызова успевают сделать предварительное чтение до того, как любой из
    // них запишет расход — это и есть та гонка, на которой раньше коммитились
    // обе транзакции.
    const [first, second] = await Promise.all([pay(), pay()]);

    expect(salaryRows()).toHaveLength(1);
    expect(salaryRows()[0].amount).toBe(32000);

    const bodies = [JSON.parse(first.body), JSON.parse(second.body)];
    // Записал ровно один вызов; второй наткнулся на существующий документ.
    expect(bodies.reduce((sum, b) => sum + b.written, 0)).toBe(1);
    // Ни один не отчитался провалом — итог корректен для обоих.
    expect(bodies.every((b) => b.failed.length === 0)).toBe(true);
    expect(db.rows('payrollPeriods')[0].state).toBe('paid');
  });

  it('ищет уже выплаченное равенством по организации и периоду', async () => {
    await pay();
    expect(db.clauses('financeTransactions')).toContainEqual(['payrollPeriodId', periodId]);
    expect(db.clauses('financeTransactions')).toContainEqual(['organizationId', 'org1']);
  });

  it('не выплачивает неутверждённую ведомость', async () => {
    db.set('payrollPeriods', { ...db.rows('payrollPeriods')[0], state: 'calculated' });
    const res = await pay();
    expect(res.statusCode).toBe(409);
    expect(salaryRows()).toHaveLength(0);
  });

  it('не помечает период выплаченным при частичном провале записи', async () => {
    (adminDb.runTransaction as any).mockImplementation(async () => { throw new Error('boom'); });
    const res = await pay();
    expect(res.statusCode).toBe(207);
    expect(JSON.parse(res.body).failed).toHaveLength(1);
    // Соврать здесь значит потерять невыплаченную строку навсегда.
    expect(db.rows('payrollPeriods')[0].state).toBe('approved');
  });

  it('штраф гасит начисление того же учителя, а не теряется', async () => {
    // Новый период, чтобы штраф попал в него до утверждения.
    vi.clearAllMocks();
    db = makeDb(baseSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate();
    const pid = db.rows('payrollPeriods')[0].id;
    await handler(
      event('POST', { action: 'line' }, { periodId: pid, teacherId: 't1', source: 'manual_penalty', amountMinor: 200000 }),
      {} as any, () => {},
    );
    await handler(event('POST', { action: 'approve' }, { periodId: pid }), {} as any, () => {});
    const res = await handler(event('POST', { action: 'pay' }, { periodId: pid }), {} as any, () => {}) as any;
    expect(res.statusCode).toBe(200);

    const rows = db.rows('financeTransactions').filter((t) => t.categoryId === 'salary');
    // Ровно один расход: штраф не порождает строки, он уменьшает выплату.
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(30000); // (3 200 000 − 200 000) тыйын
    // И сумма выплат совпала с замороженным итогом периода.
    expect(rows[0].amount * 100).toBe(db.rows('payrollPeriods')[0].totalMinor);
  });

  it('требует payroll:write на выплату', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read']));
    const res = await pay();
    expect(res.statusCode).toBe(403);
    expect(salaryRows()).toHaveLength(0);
  });
});

describe('api-payroll balance — начислено минус выдано', () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = makeDb(baseSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate();
  });

  const balance = () => handler(event('GET', { action: 'balance' }), {} as any, () => {}) as any;

  it('не считает черновик обязательством — начислено 0 до утверждения', async () => {
    const res = await balance();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('после утверждения показывает долг перед учителем, после выплаты — ноль', async () => {
    const periodId = db.rows('payrollPeriods')[0].id;
    await handler(event('POST', { action: 'approve' }, { periodId }), {} as any, () => {});

    const owed = JSON.parse((await balance()).body);
    expect(owed).toHaveLength(1);
    expect(owed[0].teacherId).toBe('t1');
    expect(owed[0].accruedMinor).toBe(3200000);
    expect(owed[0].paidMinor).toBe(0);
    expect(owed[0].balanceMinor).toBe(3200000);

    await handler(event('POST', { action: 'pay' }, { periodId }), {} as any, () => {});

    const settled = JSON.parse((await balance()).body);
    expect(settled[0].paidMinor).toBe(3200000);
    expect(settled[0].balanceMinor).toBe(0);
  });

  it('требует payroll:read', async () => {
    (verifyAuth as any).mockResolvedValue(staff([]));
    expect((await balance()).statusCode).toBe(403);
  });
});

describe('payroll-accrual (крон) — покрытие месяца в многофилиальной академии', () => {
  let db: ReturnType<typeof makeDb>;

  /** Сид крона: тарифный гейт + ставки двух филиалов и одна общеорганизационная. */
  const cronSeed = () => {
    const seed: any = baseSeed();
    seed.organizations = [{ id: 'org1', planId: 'professional' }];
    seed.compensationRules.push({
      id: 'ruleB', organizationId: 'org1', teacherId: 't2', branchId: 'B',
      label: 'Оклад Б', status: 'active',
      components: [{ kind: 'salary', amountMinor: 1000000 }],
      effectiveFrom: '2026-01', effectiveTo: null,
    });
    return seed;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 1 августа: крон считает ПРЕДЫДУЩИЙ месяц, то есть тот же июль, что и API.
    vi.setSystemTime(new Date(2026, 7, 1, 7, 0, 0));
    db = makeDb(cronSeed());
  });

  afterEach(() => { vi.useRealTimers(); });

  const runCron = () => accrualHandler(event('POST'), {} as any, () => {}) as any;

  it('открывает ОДНУ общую ведомость, покрывающую и филиальные, и общеорганизационные ставки', async () => {
    const res = await runCron();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).periodsOpened).toBe(1);

    const periods = db.rows('payrollPeriods');
    expect(periods).toHaveLength(1);
    // Не по ведомости на филиал: ставка с branchId === null не попала бы ни в
    // одну из них (recordInBranchScope(null,'B') === false), и t1 остался бы
    // без начисления молча.
    expect(periods[0].branchId).toBeNull();
    expect(periods[0].period).toBe(july);
    expect(periods[0].state).toBe('calculated');

    const lines = db.rows('payrollLines').filter((l) => l.periodId === periods[0].id);
    expect(lines.map((l) => l.teacherId).sort()).toEqual(['t1', 't2']);
  });

  it('повторный прогон не открывает вторую ведомость за тот же месяц', async () => {
    await runCron();
    const res = await runCron();
    expect(JSON.parse(res.body).periodsOpened).toBe(0);
    expect(JSON.parse(res.body).orgsSkippedExisting).toBe(1);
    expect(db.rows('payrollPeriods')).toHaveLength(1);
  });

  it('пропускает организацию, которая ведёт месяц ФИЛИАЛЬНЫМИ ведомостями, и говорит об этом вслух', async () => {
    // Директор уже открыл июль по филиалу B руками.
    db.set('payrollPeriods', {
      id: 'manualB', organizationId: 'org1', period: july, branchId: 'B',
      state: 'approved', windowStart: '', windowEnd: '', totalMinor: 1000000,
    });

    const res = await runCron();
    const body = JSON.parse(res.body);
    expect(body.periodsOpened).toBe(0);
    expect(body.orgsSkippedBranchScheme).toBe(1);
    // Общая ведомость наложилась бы на филиальную и оплатила бы t2 второй раз.
    expect(db.rows('payrollPeriods')).toHaveLength(1);
    expect(db.rows('payrollPeriods')[0].id).toBe('manualB');

    // Пропуск не молчаливый: не покрыть половину академии зарплатой — худший исход.
    const notices = (notifyOrgAdmins as any).mock.calls.filter((c: any[]) =>
      /филиал/i.test(String(c[3] ?? '')),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0][0]).toBe('org1');
  });

  it('не открывает ведомость организации на тарифе без зарплатного модуля', async () => {
    db.set('organizations', { id: 'org1', planId: 'starter' });
    const res = await runCron();
    expect(JSON.parse(res.body).orgsSkippedPlan).toBe(1);
    expect(db.rows('payrollPeriods')).toHaveLength(0);
  });
});

describe('api-payroll periods/period — чтения', () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = makeDb(baseSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate();
  });

  it('отдаёт голый массив ведомостей и фильтрует по состоянию', async () => {
    const all = await handler(event('GET', { action: 'periods' }), {} as any, () => {}) as any;
    expect(all.statusCode).toBe(200);
    const body = JSON.parse(all.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);

    const approved = await handler(event('GET', { action: 'periods', state: 'approved' }), {} as any, () => {}) as any;
    expect(JSON.parse(approved.body)).toEqual([]);
  });

  it('отдаёт строки и диагностики вместе с периодом', async () => {
    const periodId = db.rows('payrollPeriods')[0].id;
    const res = await handler(event('GET', { action: 'period', id: periodId }), {} as any, () => {}) as any;
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].finalMinor).toBe(3200000);
    expect(body.diagnostics.some((d: any) => d.code === 'session_no_teacher')).toBe(true);
  });

  it('не отдаёт ведомость чужой организации', async () => {
    db.set('payrollPeriods', { id: 'foreign', organizationId: 'org2', period: july, branchId: null, state: 'calculated' });
    const res = await handler(event('GET', { action: 'period', id: 'foreign' }), {} as any, () => {}) as any;
    expect(res.statusCode).toBe(404);
  });

  it('отвечает 400 на неизвестное действие', async () => {
    const res = await handler(event('GET', { action: 'nope' }), {} as any, () => {}) as any;
    expect(res.statusCode).toBe(400);
  });
});
