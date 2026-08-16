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
// но ФАКТ вызова проверяется: ведомость, о которой директору никто не сказал,
// не будет ни проверена, ни выплачена.
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
  // Филиала у ставки нет: «двадцать процентов» — свойство человека, а не здания.
  compensationRules: [
    {
      id: 'rule1', organizationId: 'org1', teacherId: 't1',
      components: [
        { kind: 'salary', amountMinor: 3000000 },
        { kind: 'percent_revenue', percentBp: 2000, base: 'collected' },
      ],
    },
    // Чужая организация — не должна попасть ни в одну ведомость.
    {
      id: 'ruleForeign', organizationId: 'org2', teacherId: 'tX',
      components: [{ kind: 'salary', amountMinor: 9999999 }],
    },
  ],
  financeTransactions: [
    { id: 'inc1', organizationId: 'org1', type: 'income', amount: 5000, date: local(2026, 6, 10), categoryId: 'tuition', groupId: 'g1', courseId: 'c1', studentId: 'st1', branchId: null, paymentPlanId: 'p1' },
    { id: 'inc2', organizationId: 'org1', type: 'income', amount: 5000, date: local(2026, 6, 20), categoryId: 'tuition', groupId: 'g1', courseId: 'c1', studentId: 'st2', branchId: null, paymentPlanId: 'p2' },
    // Вне окна — август.
    { id: 'inc3', organizationId: 'org1', type: 'income', amount: 9000, date: local(2026, 7, 3), categoryId: 'tuition', groupId: 'g1', courseId: 'c1', studentId: 'st1', branchId: null, paymentPlanId: 'p3' },
    { id: 'incForeign', organizationId: 'org2', type: 'income', amount: 7000, date: local(2026, 6, 12), categoryId: 'tuition', groupId: 'g1', courseId: 'c1', studentId: 'stX', branchId: null, paymentPlanId: 'pX' },
  ],
  // Группы — источник «чьи студенты и чьи деньги»: процент считается по ним.
  groups: [
    { id: 'g1', organizationId: 'org1', name: 'Группа 1', courseId: 'c1', teacherIds: ['t1'], studentIds: ['st1', 'st2'], branchId: null },
  ],
  payrollPeriods: [],
  payrollLines: [],
  'orgMembers/org1/members': [
    { id: 't1', uid: 't1', role: 'teacher', status: 'active', branchIds: [] },
    { id: 'st1', uid: 'st1', role: 'student', status: 'active', userName: 'Айбек', branchIds: [] },
    { id: 'st2', uid: 'st2', role: 'student', status: 'active', userName: 'Бермет', branchIds: [] },
  ],
});

/**
 * Двое преподавателей с положительными строками — минимальная ведомость, на
 * которой «выплатить всем» и «выплатить одному» вообще различимы: у t1 группа и
 * процент, у t2 голый оклад без групп.
 *
 * Имена лежат в orgMembers, а не в `users`: история выплат читает их именно
 * оттуда, и без имени строка «кому заплатили» показывала бы голый id.
 */
const twoTeacherSeed = () => {
  const seed: any = baseSeed();
  seed.compensationRules.push({
    id: 'ruleT2', organizationId: 'org1', teacherId: 't2',
    components: [{ kind: 'salary', amountMinor: 1000000 }],
  });
  seed['orgMembers/org1/members'] = [
    ...seed['orgMembers/org1/members'].map((m: any) => (m.id === 't1' ? { ...m, userName: 'Азиза' } : m)),
    { id: 't2', uid: 't2', role: 'teacher', status: 'active', userName: 'Бакыт', branchIds: [] },
  ];
  return seed;
};

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

  it('ручная правка суммы расчётной строки переживает пересчёт вместе с причиной', async () => {
    await calculate();
    const periodId = db.rows('payrollPeriods')[0].id;
    const lineId = db.rows('payrollLines').find((l) => l.source === 'rule')!.id;

    // Директор договорился о другой сумме и объяснил почему.
    const edited = await handler(
      event('POST', { action: 'line' }, { periodId, lineId, overrideMinor: 2500000, overrideReason: 'Договорились на 25 000' }),
      {} as any, () => {},
    ) as any;
    expect(edited.statusCode).toBe(200);

    const res = await calculate();
    const body = JSON.parse(res.body);

    const rebuilt = db.rows('payrollLines').filter((l) => l.source === 'rule');
    expect(rebuilt).toHaveLength(1);
    // Расчётная сумма пересчитана заново…
    expect(rebuilt[0].computedMinor).toBe(3000000 + 200000);
    // …а решение человека и его объяснение сохранены.
    expect(rebuilt[0].overrideMinor).toBe(2500000);
    expect(rebuilt[0].overrideReason).toBe('Договорились на 25 000');
    expect(rebuilt[0].finalMinor).toBe(2500000);
    // Итог ведомости считается по правке, а не по расчётной сумме.
    expect(db.rows('payrollPeriods')[0].totalMinor).toBe(2500000);
    expect(body.overridesCarried).toBe(1);
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

  it('не начисляет процент с платежа без группы и сообщает об этом диагностикой', async () => {
    // Оплата студента его группы, но не привязанная к группе: в базу она не
    // входит, и молчать об этом нельзя — иначе сумма просто меньше ожидаемой.
    db.set('financeTransactions', {
      id: 'incNoGroup', organizationId: 'org1', type: 'income', amount: 3000,
      date: local(2026, 6, 15), categoryId: 'tuition', groupId: null, courseId: 'c1',
      studentId: 'st1', branchId: null, paymentPlanId: 'p9',
    });
    await calculate();

    const line = db.rows('payrollLines')[0];
    expect(line.computedMinor).toBe(3000000 + 200000); // 3000 в базу не вошли

    const diagnostics = db.rows('payrollPeriods')[0].diagnostics as any[];
    const orphan = diagnostics.find((d) => d.code === 'payment_without_group');
    expect(orphan).toBeTruthy();
    expect(orphan.sample).toContain('incNoGroup');
  });

  it('запрашивает входы только равенством — никаких orderBy/limit', async () => {
    await calculate();
    for (const name of ['compensationRules', 'financeTransactions', 'groups', 'payrollLines', 'payrollPeriods']) {
      // Клаузы записаны — значит выборка шла через where, а мок не поддерживает
      // ничего, кроме равенства: любой orderBy/limit упал бы здесь.
      expect(db.clauses(name).every(([f]) => typeof f === 'string')).toBe(true);
    }
    expect(db.clauses('compensationRules')).toContainEqual(['organizationId', 'org1']);
    expect(db.clauses('financeTransactions')).toContainEqual(['organizationId', 'org1']);
    expect(db.clauses('groups')).toContainEqual(['organizationId', 'org1']);
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

/**
 * Ведомость ОДНА на (организацию, месяц), филиал её не режет. Но в базе лежат
 * ведомости прежней филиальной модели, и весь смысл тестов ниже — что новая
 * модель не оплатит их людей второй раз и не оставит месяц навсегда закрытым.
 */
describe('api-payroll — ведомость общая, филиал только атрибутирует', () => {
  let db: ReturnType<typeof makeDb>;
  beforeEach(() => {
    vi.clearAllMocks();
    const seed: any = baseSeed();
    // Второй преподаватель на окладе: он и есть тот, кого филиальная модель
    // умела оплатить дважды.
    seed.compensationRules.push({
      id: 'ruleT2', organizationId: 'org1', teacherId: 't2',
      components: [{ kind: 'salary', amountMinor: 1000000 }],
    });
    db = makeDb(seed);
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
  });

  /** Ведомость прежней модели: тот же месяц, но посчитанная по филиалу. */
  const legacyBranchSheet = (state: string) => ({
    id: 'legacyB', organizationId: 'org1', period: july, branchId: 'B',
    state, windowStart: '', windowEnd: '', totalMinor: 1000000,
  });

  it('считает всех преподавателей одной ведомостью, а branchId в теле игнорирует', async () => {
    const res = await calculate({ branchId: 'B' });
    expect(res.statusCode).toBe(200);
    // Филиала у ведомости нет: и «B» из тела, и охват «только филиал B» —
    // понятия, которых в модели больше не существует.
    expect(JSON.parse(res.body).branchId).toBeNull();

    const periods = db.rows('payrollPeriods');
    expect(periods).toHaveLength(1);
    expect(periods[0].branchId).toBeNull();
    // Оба преподавателя в одной ведомости: разложить их по зданиям значило бы
    // потерять того, у кого группы в двух филиалах сразу.
    expect(db.rows('payrollLines').map((l) => l.teacherId).sort()).toEqual(['t1', 't2']);
  });

  it('сотрудник, закреплённый за филиалом, считает и читает ту же общую ведомость', async () => {
    (verifyAuth as any).mockResolvedValue(
      staff(['payroll:write', 'payroll:read'], { branchIds: ['A'], primaryBranchId: 'A' }),
    );
    const res = await calculate();
    expect(res.statusCode).toBe(200);

    const period = db.rows('payrollPeriods')[0];
    expect(period.branchId).toBeNull();
    expect(db.rows('payrollLines').map((l) => l.teacherId).sort()).toEqual(['t1', 't2']);

    // И читает её же: прятать общую ведомость от филиального менеджера значило
    // бы показать ему пустой раздел зарплаты.
    const read = await handler(event('GET', { action: 'period', id: period.id }), {} as any, () => {}) as any;
    expect(read.statusCode).toBe(200);
  });

  it('ЗАКРЫТАЯ легаси-ведомость филиала не даёт пересчитать месяц', async () => {
    // Деньги по ней уже посчитаны и утверждены; общая ведомость начислила бы тем
    // же людям второй раз. Это главная защита от двойной выплаты.
    db.set('payrollPeriods', legacyBranchSheet('approved'));

    const res = await calculate();
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('period_coverage_conflict');
    // Текст обязан назвать месяц и подсказать выход, а не просто «конфликт».
    expect(body.error).toContain(july);
    expect(body.conflictBranchId).toBe('B');
    expect(body.conflictState).toBe('approved');

    // Вторая ведомость не создана и строк не появилось.
    expect(db.rows('payrollPeriods')).toHaveLength(1);
    expect(db.rows('payrollLines')).toHaveLength(0);
  });

  it('ВЫПЛАТА блокируется, если месяц уже закрыт легаси-ведомостью филиала', async () => {
    await calculate();
    const periodId = db.rows('payrollPeriods')[0].id;
    await handler(event('POST', { action: 'approve' }, { periodId }), {} as any, () => {});

    // Ведомость филиала, уже выплаченная, всплывает в базе после утверждения
    // общей. Деньги уходят в pay — там и обязан стоять второй рубеж.
    db.set('payrollPeriods', legacyBranchSheet('paid'));

    const res = await handler(event('POST', { action: 'pay' }, { periodId }), {} as any, () => {}) as any;
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('period_coverage_conflict');
    expect(db.rows('financeTransactions').filter((t) => t.categoryId === 'salary')).toHaveLength(0);
  });

  it('НЕЗАКРЫТУЮ легаси-ведомость расчёт поглощает: премия переезжает, второй ведомости не остаётся', async () => {
    await calculate();
    const sheetId = db.rows('payrollPeriods')[0].id;

    // Черновик прежней модели за тот же июль. Просто игнорировать его нельзя: он
    // виден в списке, его строки попадают в «зарплатный баланс», а удаления
    // ведомости в интерфейсе нет — месяц упирался бы в 409 навсегда.
    db.set('payrollPeriods', legacyBranchSheet('calculated'));
    db.set('payrollLines', {
      id: 'legacyBonus', organizationId: 'org1', periodId: 'legacyB', period: july,
      teacherId: 't2', teacherName: '', ruleId: null, source: 'manual_bonus', isManual: true,
      computedMinor: 70000, overrideMinor: null, finalMinor: 70000, note: 'За выпускной', branchId: 'B',
    });
    db.set('payrollLines', {
      id: 'legacyRule', organizationId: 'org1', periodId: 'legacyB', period: july,
      teacherId: 't2', ruleId: 'ruleT2', source: 'rule', isManual: false,
      computedMinor: 1000000, overrideMinor: null, finalMinor: 1000000, branchId: 'B',
    });

    const res = await calculate();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(sheetId);
    expect(body.absorbedLegacyPeriods).toEqual(['legacyB']);

    // Ведомость за месяц осталась одна.
    const periods = db.rows('payrollPeriods');
    expect(periods).toHaveLength(1);
    expect(periods[0].id).toBe(sheetId);

    const lines = db.rows('payrollLines');
    // Решение человека переехало дословно…
    const bonus = lines.find((l) => l.id === 'legacyBonus')!;
    expect(bonus.periodId).toBe(sheetId);
    expect(bonus.finalMinor).toBe(70000);
    expect(bonus.note).toBe('За выпускной');
    expect(bonus.branchId).toBeNull();
    // …а расчётная строка поглощённой ведомости выброшена: она воспроизводится
    // из тех же данных, и тащить её значило бы задвоить начисление t2.
    expect(lines.some((l) => l.id === 'legacyRule')).toBe(false);
    expect(lines.filter((l) => l.source === 'rule').map((l) => l.teacherId).sort()).toEqual(['t1', 't2']);
    // Итог: 3 200 000 (t1) + 1 000 000 (t2) + 70 000 переехавшей премии.
    expect(periods[0].totalMinor).toBe(3200000 + 1000000 + 70000);
  });

  it('пересчёт СВОЕЙ ведомости конфликтом не считается', async () => {
    await calculate();
    // Ведомость уже существует; повторный расчёт обязан пройти, а не наткнуться
    // на «конфликт» с самой собой — coversSameTeachers(null, null) === false.
    const again = await calculate();
    expect(again.statusCode).toBe(200);
    expect(JSON.parse(again.body).absorbedLegacyPeriods).toEqual([]);
    expect(db.rows('payrollPeriods')).toHaveLength(1);
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
    // Ключ филиала отличает новую схему от прежней, где одна строка закрывалась
    // одним расходом; 'org' — «филиал не определён», а не «вся организация».
    expect(tx.payrollBranchKey).toBe('org');
    expect(tx.branchId).toBeNull();
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

  it('id расхода детерминирован по (период, строка, филиал) — повтор не может создать второй документ', async () => {
    await pay();
    const lineId = db.rows('payrollLines')[0].id;
    const tx = salaryRows()[0];
    // Не автоид: id выводится из ключей идемпотентности, поэтому одна доля
    // физически не может дать два документа — Firestore не хранит два id.
    // Третий сегмент — филиал доли ('org', когда его нет): без него второй
    // расход той же строки не смог бы создаться вовсе.
    expect(tx.id).toBe(`pay_${periodId}_${lineId}_org`);
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

  it('строка, закрытая расходом ПРЕЖНЕЙ схемы, не оплачивается повторно по частям', async () => {
    // Расход, выплаченный до появления филиального ключа: он закрывает строку
    // ЦЕЛИКОМ. Не различить его значило бы выдать те же деньги заново, уже
    // разложенными по зданиям.
    const lineId = db.rows('payrollLines')[0].id;
    db.set('financeTransactions', {
      id: 'legacyPayout', organizationId: 'org1', type: 'expense', amount: 32000,
      date: '2026-08-01T00:00:00.000Z', categoryId: 'salary', teacherId: 't1',
      payrollPeriodId: periodId, payrollLineId: lineId,
    });

    const res = await pay();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).written).toBe(0);
    expect(JSON.parse(res.body).skipped).toBe(1);
    // Ни одного нового расхода: в кассе остался ровно тот, что был.
    expect(salaryRows().map((t) => t.id)).toEqual(['legacyPayout']);
  });

  it('требует payroll:write на выплату', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read']));
    const res = await pay();
    expect(res.statusCode).toBe(403);
    expect(salaryRows()).toHaveLength(0);
  });
});

/**
 * Преподаватель ведёт группы в двух зданиях. Ставка у него одна (она про
 * человека), а расход в кассе обязан лечь туда, где деньги заработаны, — иначе
 * филиал показывает прибыль без своей главной статьи затрат.
 */
describe('api-payroll pay — разворот строки в расходы по филиалам', () => {
  let db: ReturnType<typeof makeDb>;
  let periodId: string;

  /** Одна ставка (50% собранного), две группы в разных филиалах, деньги в обеих. */
  const splitSeed = () => {
    const seed: any = baseSeed();
    seed.compensationRules = [{
      id: 'rule1', organizationId: 'org1', teacherId: 't1',
      components: [{ kind: 'percent_revenue', percentBp: 5000, base: 'collected' }],
    }];
    seed.groups = [
      { id: 'g1', organizationId: 'org1', name: 'Группа A', courseId: 'c1', teacherIds: ['t1'], studentIds: ['st1'], branchId: 'A' },
      { id: 'g2', organizationId: 'org1', name: 'Группа B', courseId: 'c2', teacherIds: ['t1'], studentIds: ['st2'], branchId: 'B' },
    ];
    seed.financeTransactions = [
      { id: 'incA', organizationId: 'org1', type: 'income', amount: 6000, date: local(2026, 6, 10), categoryId: 'tuition', groupId: 'g1', courseId: 'c1', studentId: 'st1', branchId: 'A', paymentPlanId: 'p1' },
      { id: 'incB', organizationId: 'org1', type: 'income', amount: 4000, date: local(2026, 6, 12), categoryId: 'tuition', groupId: 'g2', courseId: 'c2', studentId: 'st2', branchId: 'B', paymentPlanId: 'p2' },
    ];
    return seed;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    db = makeDb(splitSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate();
    periodId = db.rows('payrollPeriods')[0].id;
    await handler(event('POST', { action: 'approve' }, { periodId }), {} as any, () => {});
  });

  const pay = () => handler(event('POST', { action: 'pay' }, { periodId }), {} as any, () => {}) as any;
  const salaryRows = () => db.rows('financeTransactions').filter((t) => t.categoryId === 'salary');

  it('одна строка даёт ДВА расхода с разными филиалами, а их сумма равна выплате', async () => {
    const res = await pay();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Строка одна, а расходов два — это разные факты, и путать их в отчёте
    // нельзя: «выплачено 2» про одного преподавателя читалось бы как двойная
    // выплата.
    expect(body.written).toBe(1);
    expect(body.writtenExpenses).toBe(2);

    const rows = salaryRows().sort((a, b) => String(a.branchId).localeCompare(String(b.branchId)));
    expect(rows.map((t) => t.branchId)).toEqual(['A', 'B']);
    // 50% от 10 000 с. = 5 000 с., поделённые по деньгам зданий (6 000 : 4 000).
    expect(rows.map((t) => t.amount)).toEqual([3000, 2000]);
    // Сумма расходов сходится с замороженным итогом ведомости ДО тыйына.
    expect(rows.reduce((s, t) => s + t.amount, 0) * 100).toBe(db.rows('payrollPeriods')[0].totalMinor);
    // Атрибуция берётся у доли: внутри филиала группа однозначна, хотя у
    // преподавателя их несколько.
    expect(rows.map((t) => t.groupId)).toEqual(['g1', 'g2']);
    expect(rows.map((t) => t.courseId)).toEqual(['c1', 'c2']);
  });

  it('идемпотентен по (строка, филиал): повтор не пишет ни одного лишнего расхода', async () => {
    await pay();
    const afterFirst = salaryRows().map((t) => t.id).sort();

    const second = await pay();
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).written).toBe(0);
    expect(JSON.parse(second.body).writtenExpenses).toBe(0);
    // Обе доли нашлись выплаченными, и строка целиком ушла в пропущенные.
    expect(JSON.parse(second.body).skipped).toBe(1);
    expect(salaryRows().map((t) => t.id).sort()).toEqual(afterFirst);
  });
});

/**
 * «Филиала нет» в этой базе выглядит тремя способами: null, undefined и ПУСТАЯ
 * СТРОКА. Последняя опаснее двух первых: она проходит `??`, и ключ
 * идемпотентности выплаты выходит пустым — а пустой `payrollBranchKey` на
 * расходе ЛОЖЕН, потому что означает «строка закрыта целиком по прежней схеме».
 */
describe('api-payroll pay — пустой branchId не должен ронять идемпотентность долей', () => {
  let db: ReturnType<typeof makeDb>;
  let periodId: string;

  /** Одна ставка (50% собранного), две группы: у одной филиал — ПУСТАЯ СТРОКА. */
  const emptyBranchSeed = () => {
    const seed: any = baseSeed();
    seed.compensationRules = [{
      id: 'rule1', organizationId: 'org1', teacherId: 't1',
      components: [{ kind: 'percent_revenue', percentBp: 5000, base: 'collected' }],
    }];
    seed.groups = [
      // Именно так группа без филиала и лежит в базе после форм, которые пишут
      // пустую строку вместо null.
      { id: 'g1', organizationId: 'org1', name: 'Группа без филиала', courseId: 'c1', teacherIds: ['t1'], studentIds: ['st1'], branchId: '' },
      { id: 'g2', organizationId: 'org1', name: 'Группа B', courseId: 'c2', teacherIds: ['t1'], studentIds: ['st2'], branchId: 'B' },
    ];
    seed.financeTransactions = [
      { id: 'incEmpty', organizationId: 'org1', type: 'income', amount: 6000, date: local(2026, 6, 10), categoryId: 'tuition', groupId: 'g1', courseId: 'c1', studentId: 'st1', branchId: null, paymentPlanId: 'p1' },
      { id: 'incB', organizationId: 'org1', type: 'income', amount: 4000, date: local(2026, 6, 12), categoryId: 'tuition', groupId: 'g2', courseId: 'c2', studentId: 'st2', branchId: 'B', paymentPlanId: 'p2' },
    ];
    return seed;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    db = makeDb(emptyBranchSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate();
    periodId = db.rows('payrollPeriods')[0].id;
    await handler(event('POST', { action: 'approve' }, { periodId }), {} as any, () => {});
  });

  const pay = () => handler(event('POST', { action: 'pay' }, { periodId }), {} as any, () => {}) as any;
  const salaryRows = () => db.rows('financeTransactions').filter((t) => t.categoryId === 'salary');

  // Откат нормализации (`g.branchId ?? null` вместо `|| null`): доля унесла бы
  // branchId '' и легла бы в кассу с payrollBranchKey '' — ключом, который
  // повторная выплата читает как «строка уже закрыта целиком».
  it('пишет обе доли с НЕПУСТЫМ ключом филиала, а их сумма равна выплате', async () => {
    const res = await pay();
    expect(res.statusCode).toBe(200);

    const rows = salaryRows();
    expect(rows).toHaveLength(2);
    // 'org' — это «филиал не определён», и он обязан быть НЕПУСТЫМ: пустая
    // строка в этом поле ложна, а не просто некрасива.
    expect(rows.map((t) => t.payrollBranchKey).sort()).toEqual(['B', 'org']);
    for (const t of rows) expect(t.payrollBranchKey).toBeTruthy();
    // 50% от 10 000 с. = 5 000 с., и расходы сходятся с итогом до тыйына.
    expect(rows.reduce((s, t) => s + t.amount, 0) * 100).toBe(db.rows('payrollPeriods')[0].totalMinor);

    const second = await pay();
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).writtenExpenses).toBe(0);
    expect(salaryRows()).toHaveLength(2);
  });

  // Здесь потеря денег и становится видимой: с пустым ключом повтор счёл бы
  // строку выплаченной ЦЕЛИКОМ (paidWholeLine) и не дописал бы вторую долю
  // никогда — без единой ошибки в логах.
  it('после частичного сбоя ДОПИСЫВАЕТ недостающую долю, а не считает строку закрытой', async () => {
    const realTx = (adminDb.runTransaction as any).getMockImplementation();
    let call = 0;
    (adminDb.runTransaction as any).mockImplementation(async (fn: any) => {
      call++;
      // Первая доля (группа без филиала) записалась, на второй сеть моргнула.
      if (call === 2) throw new Error('сеть моргнула');
      return realTx(fn);
    });

    const first = await pay();
    expect(first.statusCode).toBe(207);
    expect(salaryRows()).toHaveLength(1);
    expect(salaryRows()[0].payrollBranchKey).toBe('org');
    // Период не помечен выплаченным — иначе дописывать было бы уже нечего.
    expect(db.rows('payrollPeriods')[0].state).toBe('approved');

    (adminDb.runTransaction as any).mockImplementation(realTx);
    const second = await pay();
    expect(second.statusCode).toBe(200);

    const rows = salaryRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((t) => t.payrollBranchKey).sort()).toEqual(['B', 'org']);
    // Преподаватель получил всё начисленное, а не только первую долю.
    expect(rows.reduce((s, t) => s + t.amount, 0) * 100).toBe(db.rows('payrollPeriods')[0].totalMinor);
    expect(db.rows('payrollPeriods')[0].state).toBe('paid');
  });

  // Откат branchKeyOf (`??` вместо `||`): пустой филиал ЗАМОРОЖЕННОЙ доли дошёл
  // бы до кассы дословно — payrollBranchKey '' и id расхода с пустым хвостом.
  it('замороженная доля с пустым филиалом даёт ключ «org», а не пустой', async () => {
    vi.clearAllMocks();
    const seed: any = emptyBranchSeed();
    // Ведомость, посчитанная ДО нормализации: доля несёт branchId '' дословно,
    // и оживить её может только пересчёт месяца — которого может и не быть.
    seed.payrollPeriods = [{
      id: 'sheetOld', organizationId: 'org1', period: july, state: 'approved',
      windowStart: '', windowEnd: '', totalMinor: 500000,
    }];
    seed.payrollLines = [{
      id: 'lineOld', organizationId: 'org1', periodId: 'sheetOld', period: july,
      teacherId: 't1', teacherName: 'Азиза', ruleId: 'rule1', source: 'rule', isManual: false,
      computedMinor: 500000, overrideMinor: null, finalMinor: 500000,
      branchShares: [
        { branchId: '', weight: 600000, groupIds: ['g1'], courseId: 'c1', groupId: 'g1' },
        { branchId: 'B', weight: 400000, groupIds: ['g2'], courseId: 'c2', groupId: 'g2' },
      ],
    }];
    db = makeDb(seed);
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));

    const res = await handler(event('POST', { action: 'pay' }, { periodId: 'sheetOld' }), {} as any, () => {}) as any;
    expect(res.statusCode).toBe(200);

    const rows = salaryRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((t) => t.payrollBranchKey).sort()).toEqual(['B', 'org']);
    // Хвост id — тот же ключ: пустой сегмент сделал бы id неотличимым от
    // «строка выплачена целиком».
    expect(rows.map((t) => t.id).sort()).toEqual(['pay_sheetOld_lineOld_B', 'pay_sheetOld_lineOld_org']);
    expect(rows.reduce((s, t) => s + t.amount, 0)).toBe(5000);
  });
});

/**
 * Директор платит не «месяц целиком», а людей — по одному, по мере того как они
 * приходят за деньгами. Раньше это был один вызов «выплатить всем», и любой
 * другой сценарий приходилось изображать вручную в кассе.
 *
 * Главное свойство здесь не «расход создался», а ЧТО ОСТАЛОСЬ ПОСЛЕ: месяц
 * закрывается только вместе с последней строкой, иначе выплата первому человеку
 * прятала бы кнопку выплаты от остальных.
 */
describe('api-payroll pay — выплата выборочно, по одному преподавателю', () => {
  let db: ReturnType<typeof makeDb>;
  let periodId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = makeDb(twoTeacherSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate();
    periodId = db.rows('payrollPeriods')[0].id;
    await handler(event('POST', { action: 'approve' }, { periodId }), {} as any, () => {});
  });

  const pay = (body: any = {}) =>
    handler(event('POST', { action: 'pay' }, { periodId, ...body }), {} as any, () => {}) as any;

  const salaryRows = () =>
    db.rows('financeTransactions')
      .filter((t) => t.categoryId === 'salary')
      .sort((a, b) => String(a.teacherId).localeCompare(String(b.teacherId)));

  // Откат к «выплатить можно только всем»: t2 получил бы деньги, которых у
  // директора сейчас нет, — а именно ради этого выплата и делится по людям.
  it('платит ТОЛЬКО выбранному и оставляет месяц утверждённым', async () => {
    const res = await pay({ teacherIds: ['t1'] });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.written).toBe(1);
    expect(body.writtenExpenses).toBe(1);
    // Месяц не закрыт: деньги получил один из двоих.
    expect(body.fullyPaid).toBe(false);
    expect(body.remainingTeacherIds).toEqual(['t2']);

    // В кассе ровно один расход, и он на выбранного человека.
    const rows = salaryRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].teacherId).toBe('t1');
    expect(rows[0].amount).toBe(32000);

    // Состояние ведомости — approved, а не paid: пометить её выплаченной значило
    // бы спрятать кнопку выплаты от t2 и оставить его без денег навсегда.
    expect(body.state).toBe('approved');
    expect(db.rows('payrollPeriods')[0].state).toBe('approved');
  });

  // Защищает вторую половину сценария: «выплатить всем» после частной выплаты
  // обязано ДОПЛАТИТЬ остальных, а не выдать первому второй раз.
  it('следующая выплата дописывает остальных, закрывает месяц и не платит первому дважды', async () => {
    await pay({ teacherIds: ['t1'] });
    const firstTxId = salaryRows()[0].id;

    const res = await pay();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // Записана только строка t2; строка t1 нашлась закрытой и ушла в пропущенные.
    expect(body.written).toBe(1);
    expect(body.writtenExpenses).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.fullyPaid).toBe(true);
    expect(body.remainingTeacherIds).toEqual([]);
    // Последняя строка закрыта — вот теперь месяц выплачен.
    expect(db.rows('payrollPeriods')[0].state).toBe('paid');

    const rows = salaryRows();
    expect(rows.map((t) => t.teacherId)).toEqual(['t1', 't2']);
    expect(rows.map((t) => t.amount)).toEqual([32000, 10000]);
    // Расход первого — тот же самый документ: детерминированный id физически не
    // даёт создать второй, сколько бы раз ни нажали «Выплатить всем».
    expect(rows[0].id).toBe(firstTxId);
  });

  // Молчаливый пропуск незнакомого id читался бы в интерфейсе как «выплачено»,
  // хотя человек денег не увидел: id могли опечатать, а ведомость — пересчитать.
  it('отказывает на незнакомом teacherId и не выдаёт денег НИКОМУ из списка', async () => {
    const res = await pay({ teacherIds: ['t1', 'tX'] });
    expect(res.statusCode).toBe(400);
    // Сообщение обязано назвать виновника — иначе его не найти в списке из
    // тридцати человек.
    expect(JSON.parse(res.body).error).toContain('tX');

    // Ни одного расхода: отказ целиком, а не «частично выплачено».
    expect(salaryRows()).toHaveLength(0);
    expect(db.rows('payrollPeriods')[0].state).toBe('approved');
  });

  // Штраф гасит начисление ВНУТРИ преподавателя, поэтому выплата одному человеку
  // не должна зависеть от того, кого ещё отметили галочкой: в кассу уходит нетто.
  it('выдаёт НЕТТО, когда у выбранного есть штраф', async () => {
    // Ведомость нужна неутверждённая: штраф вносится до заморозки.
    vi.clearAllMocks();
    db = makeDb(twoTeacherSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate();
    const pid = db.rows('payrollPeriods')[0].id;
    await handler(
      event('POST', { action: 'line' }, { periodId: pid, teacherId: 't1', source: 'manual_penalty', amountMinor: 200000 }),
      {} as any, () => {},
    );
    await handler(event('POST', { action: 'approve' }, { periodId: pid }), {} as any, () => {});

    const res = await handler(
      event('POST', { action: 'pay' }, { periodId: pid, teacherIds: ['t1'] }),
      {} as any, () => {},
    ) as any;
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const rows = salaryRows();
    // Штрафная строка расхода не порождает — она уменьшает выплату.
    expect(rows).toHaveLength(1);
    expect(rows[0].teacherId).toBe('t1');
    expect(rows[0].amount).toBe(30000); // (3 200 000 − 200 000) тыйын
    // Сумма расходов равна НЕТТО-начислению выбранного, до тыйына.
    expect(rows.reduce((s, t) => s + t.amount, 0) * 100).toBe(3200000 - 200000);
    expect(body.written).toBe(1);
    expect(body.skipped).toBe(1);
    // И второй преподаватель по-прежнему ждёт своих денег.
    expect(body.fullyPaid).toBe(false);
    expect(body.remainingTeacherIds).toEqual(['t2']);
  });

  // Выплата — это деньги, и утверждение ведомости остаётся её единственным
  // разрешением: выборочность не должна была стать обходным путём.
  it('не выплачивает выборочно неутверждённую ведомость', async () => {
    db.set('payrollPeriods', { ...db.rows('payrollPeriods')[0], state: 'calculated' });
    const res = await pay({ teacherIds: ['t1'] });
    expect(res.statusCode).toBe(409);
    expect(salaryRows()).toHaveLength(0);
  });
});

/**
 * «Не понятно, где смотреть историю выплат» — вопрос, на который раздел не
 * отвечал вовсе: деньги уходили расходами в кассу и растворялись там среди
 * аренды и рекламы.
 *
 * Источник истории — САМА КАССА, а не отдельный журнал: второй список рядом с
 * кассой умел бы с ней разойтись, и тогда правдой не был бы ни один.
 */
describe('api-payroll payouts — история выплат', () => {
  let db: ReturnType<typeof makeDb>;
  let periodId: string;
  let payoutTxId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = makeDb(twoTeacherSeed());
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
    await calculate();
    periodId = db.rows('payrollPeriods')[0].id;
    await handler(event('POST', { action: 'approve' }, { periodId }), {} as any, () => {});
    // Зарплата за ИЮЛЬ, выданная в АВГУСТЕ — обычный случай, а не исключение.
    await handler(
      event('POST', { action: 'pay' }, { periodId, teacherIds: ['t1'], date: '2026-08-05' }),
      {} as any, () => {},
    );
    payoutTxId = db.rows('financeTransactions').find((t) => t.payrollLineId)!.id;

    // Расход категории «Зарплата», заведённый руками в кассе: тоже выданные
    // деньги, и прятать их нельзя — но у него нет ни ведомости, ни строки.
    db.set('financeTransactions', {
      id: 'cashManual', organizationId: 'org1', type: 'expense', amount: 5000,
      date: '2026-08-20T09:00:00.000Z', categoryId: 'salary', teacherId: 't2',
      description: 'Аванс наличными', paymentMethod: 'cash',
    });
    // Доход той же категории: деньги пришли, а не ушли. В историю выплат он не
    // выплата, а ошибка на весь экран.
    db.set('financeTransactions', {
      id: 'salaryIncome', organizationId: 'org1', type: 'income', amount: 1000,
      date: '2026-08-21T09:00:00.000Z', categoryId: 'salary', teacherId: 't1',
    });
  });

  const payouts = (query: any = {}) =>
    handler(event('GET', { action: 'payouts', ...query }), {} as any, () => {}) as any;

  it('собирает расходы «Зарплаты» свежими сверху и не считает выплатой доход', async () => {
    const res = await payouts();
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body);

    // Ровно две выплаты: доход категории «Зарплата» в историю не попал.
    expect(rows.map((r: any) => r.id)).toEqual(['cashManual', payoutTxId]);
    expect(rows.some((r: any) => r.id === 'salaryIncome')).toBe(false);

    // Проведённая выплата: месяц берётся с ВЕДОМОСТИ, а не из даты расхода —
    // зарплату за июль выдают в августе, и «за что заплатили» это про июль.
    const byLine = rows[1];
    expect(byLine.manual).toBe(false);
    expect(byLine.periodId).toBe(periodId);
    expect(byLine.period).toBe(july);
    expect(byLine.teacherId).toBe('t1');
    // Имя из orgMembers: у оффлайн-преподавателя нет документа в `users`, и без
    // этой карты строка показывала бы голый id.
    expect(byLine.teacherName).toBe('Азиза');
    expect(byLine.amountMinor).toBe(3200000);

    // Ручной расход: денег он выдал столько же честно, но ведомости за ним нет.
    const manual = rows[0];
    expect(manual.manual).toBe(true);
    expect(manual.periodId).toBeNull();
    expect(manual.period).toBeNull();
    expect(manual.teacherId).toBe('t2');
    expect(manual.teacherName).toBe('Бакыт');
    expect(manual.amountMinor).toBe(500000);
    expect(manual.paymentMethod).toBe('cash');
    expect(manual.description).toBe('Аванс наличными');
  });

  it('фильтрует по преподавателю и по месяцу начисления', async () => {
    // «Сколько я отдал этому человеку» — вопрос из карточки преподавателя.
    const byTeacher = JSON.parse((await payouts({ teacherId: 't2' })).body);
    expect(byTeacher.map((r: any) => r.id)).toEqual(['cashManual']);

    // Фильтр по месяцу — это месяц НАЧИСЛЕНИЯ: ручной расход без ведомости в
    // него не попадает, потому что неизвестно, за что он.
    const byPeriod = JSON.parse((await payouts({ period: july })).body);
    expect(byPeriod.map((r: any) => r.id)).toEqual([payoutTxId]);
  });

  it('требует payroll:read — история выплат это зарплатные данные', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    expect((await payouts()).statusCode).toBe(403);
  });
});

/**
 * Экран зарплаты отвечает на вопрос «сколько и за что» ТЕМ ЖЕ кодом, что и
 * деньги. Разбивка, которая не сходится со строкой ведомости и с расходами в
 * кассе, бесполезна — именно ею спор с преподавателем и заканчивается.
 */
describe('api-payroll overview — экран не расходится с расчётом и выплатой', () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    (verifyAuth as any).mockResolvedValue(staff(['payroll:write', 'payroll:read']));
  });

  const overview = (period = july) =>
    handler(event('GET', { action: 'overview', period }), {} as any, () => {}) as any;
  const teacherOf = (res: any, teacherId: string) =>
    JSON.parse(res.body).teachers.find((t: any) => t.teacherId === teacherId);

  // Откат к наивной карте по teacherId: побеждал бы ПОСЛЕДНИЙ документ в
  // порядке выборки, то есть здесь — старая ставка. Экран показывал бы 10 000,
  // а деньги считались бы по 40 000: одна строка, два разных числа.
  it('при двух ставках показывает ТУ ЖЕ, по которой посчитан предпросмотр', async () => {
    const seed: any = baseSeed();
    // Порядок подобран так, чтобы наивная карта выбрала СТАРУЮ ставку:
    // resolveRules берёт ту, которую правили последней.
    seed.compensationRules = [
      {
        id: 'ruleFresh', organizationId: 'org1', teacherId: 't1',
        updatedAt: '2026-08-01T10:00:00.000Z',
        components: [{ kind: 'salary', amountMinor: 4000000 }],
      },
      {
        id: 'ruleStale', organizationId: 'org1', teacherId: 't1',
        updatedAt: '2026-01-01T10:00:00.000Z',
        components: [{ kind: 'salary', amountMinor: 1000000 }],
      },
    ];
    db = makeDb(seed);

    const res = await overview();
    expect(res.statusCode).toBe(200);
    const t1 = teacherOf(res, 't1');

    expect(t1.rule.id).toBe('ruleFresh');
    expect(t1.rule.components[0].amountMinor).toBe(4000000);
    // Карточка ставки и число под ней — из одного источника.
    expect(t1.previewMinor).toBe(4000000);
  });

  // Откат к «досчитать разбивку по сегодняшним группам»: экран показал бы две
  // доли (A и B) там, где касса создаст ОДИН расход без филиала.
  it('у посчитанной строки без branchShares даёт одну долю «без филиала» — ровно то, что сделает выплата', async () => {
    const seed: any = baseSeed();
    seed.groups = [
      { id: 'g1', organizationId: 'org1', name: 'Группа A', courseId: 'c1', teacherIds: ['t1'], studentIds: ['st1'], branchId: 'A' },
      { id: 'g2', organizationId: 'org1', name: 'Группа B', courseId: 'c2', teacherIds: ['t1'], studentIds: ['st2'], branchId: 'B' },
    ];
    seed.financeTransactions = [
      { id: 'incA', organizationId: 'org1', type: 'income', amount: 6000, date: local(2026, 6, 10), categoryId: 'tuition', groupId: 'g1', courseId: 'c1', studentId: 'st1', branchId: 'A', paymentPlanId: 'p1' },
      { id: 'incB', organizationId: 'org1', type: 'income', amount: 4000, date: local(2026, 6, 12), categoryId: 'tuition', groupId: 'g2', courseId: 'c2', studentId: 'st2', branchId: 'B', paymentPlanId: 'p2' },
    ];
    // Ведомость, посчитанная ДО перехода на разложение: строка branchShares не
    // несёт вовсе.
    seed.payrollPeriods = [{
      id: 'sheetJuly', organizationId: 'org1', period: july, state: 'calculated',
      windowStart: '', windowEnd: '', totalMinor: 500000,
    }];
    seed.payrollLines = [{
      id: 'lineNoShares', organizationId: 'org1', periodId: 'sheetJuly', period: july,
      teacherId: 't1', teacherName: 'Азиза', ruleId: 'rule1', source: 'rule', isManual: false,
      computedMinor: 500000, overrideMinor: null, finalMinor: 500000,
    }];
    db = makeDb(seed);

    const res = await overview();
    expect(res.statusCode).toBe(200);
    const t1 = teacherOf(res, 't1');

    expect(t1.byBranch).toHaveLength(1);
    expect(t1.byBranch[0].branchId).toBeNull();
    expect(t1.byBranch[0].amountMinor).toBe(500000);

    // И это не «удобное» число: выплата действительно создаёт один расход без
    // филиала — экран и касса обязаны говорить одно и то же.
    await handler(event('POST', { action: 'approve' }, { periodId: 'sheetJuly' }), {} as any, () => {});
    const paid = await handler(event('POST', { action: 'pay' }, { periodId: 'sheetJuly' }), {} as any, () => {}) as any;
    expect(paid.statusCode).toBe(200);

    const salary = db.rows('financeTransactions').filter((t) => t.categoryId === 'salary');
    expect(salary).toHaveLength(1);
    expect(salary[0].branchId).toBeNull();
    expect(salary[0].amount * 100).toBe(t1.byBranch[0].amountMinor);
  });

  // «Сколько ему ещё нужно отдать» экран обязан брать из КАССЫ, а не из
  // состояния ведомости: после выплаты одному месяц остаётся утверждённым, и
  // вывести остаток из «выплачено/не выплачено» невозможно в принципе.
  it('после выплаты одному показывает выданное ему и остаток по остальным', async () => {
    db = makeDb(twoTeacherSeed());
    await calculate();
    const periodId = db.rows('payrollPeriods')[0].id;
    await handler(event('POST', { action: 'approve' }, { periodId }), {} as any, () => {});
    await handler(event('POST', { action: 'pay' }, { periodId, teacherIds: ['t1'] }), {} as any, () => {});

    const res = await overview();
    expect(res.statusCode).toBe(200);

    // Получивший деньги: должны были столько же, сколько выдали, — остаток ноль.
    const t1 = teacherOf(res, 't1');
    expect(t1.payableMinor).toBe(3200000);
    expect(t1.paidMinor).toBe(3200000);
    expect(t1.remainingMinor).toBe(0);

    // Не получивший: ему должны ровно всё начисленное.
    const t2 = teacherOf(res, 't2');
    expect(t2.payableMinor).toBe(1000000);
    expect(t2.paidMinor).toBe(0);
    expect(t2.remainingMinor).toBe(t2.payableMinor);

    // И ведомость всё ещё утверждена — кнопки выплаты обязаны остаться живыми.
    expect(JSON.parse(res.body).sheet.state).toBe('approved');
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

  /** Сид крона: тарифный гейт + две ставки, ни одна из которых не привязана к зданию. */
  const cronSeed = () => {
    const seed: any = baseSeed();
    seed.organizations = [{ id: 'org1', planId: 'professional' }];
    seed.compensationRules.push({
      id: 'ruleT2', organizationId: 'org1', teacherId: 't2',
      components: [{ kind: 'salary', amountMinor: 1000000 }],
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

  it('открывает ОДНУ общую ведомость на всех преподавателей и зовёт директора её проверить', async () => {
    const res = await runCron();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).periodsOpened).toBe(1);

    const periods = db.rows('payrollPeriods');
    expect(periods).toHaveLength(1);
    // Филиала на документе нет вовсе: ведомость общеорганизационная, и поле,
    // которое опознаёт легаси-документы, новая ведомость нести не должна.
    expect(periods[0].branchId).toBeUndefined();
    expect(periods[0].period).toBe(july);
    expect(periods[0].state).toBe('calculated');

    const lines = db.rows('payrollLines').filter((l) => l.periodId === periods[0].id);
    expect(lines.map((l) => l.teacherId).sort()).toEqual(['t1', 't2']);

    // Крон не утверждает и не платит — он только считает, поэтому обязан позвать
    // человека: ведомость, о которой никто не узнал, так и не будет выплачена.
    expect((notifyOrgAdmins as any).mock.calls[0][0]).toBe('org1');
    expect((notifyOrgAdmins as any).mock.calls[0][1]).toBe('payroll_ready');
  });

  it('повторный прогон не открывает вторую ведомость за тот же месяц', async () => {
    await runCron();
    const res = await runCron();
    expect(JSON.parse(res.body).periodsOpened).toBe(0);
    expect(JSON.parse(res.body).orgsSkippedExisting).toBe(1);
    expect(db.rows('payrollPeriods')).toHaveLength(1);
  });

  it('легаси-ведомость филиала за тот же месяц считается покрытием — крон её не накрывает общей', async () => {
    // Июль уже закрыт по филиалу B прежней моделью.
    db.set('payrollPeriods', {
      id: 'manualB', organizationId: 'org1', period: july, branchId: 'B',
      state: 'approved', windowStart: '', windowEnd: '', totalMinor: 1000000,
    });

    const res = await runCron();
    const body = JSON.parse(res.body);
    expect(body.periodsOpened).toBe(0);
    expect(body.orgsSkippedExisting).toBe(1);
    // Общая ведомость наложилась бы на филиальную и начислила бы t2 второй раз.
    // Разгребает такой месяц человек — «Пересчитать» в интерфейсе.
    expect(db.rows('payrollPeriods')).toHaveLength(1);
    expect(db.rows('payrollPeriods')[0].id).toBe('manualB');
    expect(db.rows('payrollLines')).toHaveLength(0);
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
    // Преподаватель без ставки строки не даёт, поэтому увидеть его можно ТОЛЬКО
    // в диагностиках — иначе он молча выпадает из зарплаты.
    db.set('orgMembers/org1/members', { id: 't9', uid: 't9', role: 'teacher', status: 'active', branchIds: [] });
    await calculate();

    const periodId = db.rows('payrollPeriods')[0].id;
    const res = await handler(event('GET', { action: 'period', id: periodId }), {} as any, () => {}) as any;
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].finalMinor).toBe(3200000);
    const withoutRule = body.diagnostics.find((d: any) => d.code === 'teacher_without_rule');
    expect(withoutRule).toBeTruthy();
    expect(withoutRule.sample).toContain('t9');
  });

  it('не отдаёт ведомость чужой организации', async () => {
    db.set('payrollPeriods', { id: 'foreign', organizationId: 'org2', period: july, state: 'calculated' });
    const res = await handler(event('GET', { action: 'period', id: 'foreign' }), {} as any, () => {}) as any;
    expect(res.statusCode).toBe(404);
  });

  it('отвечает 400 на неизвестное действие', async () => {
    const res = await handler(event('GET', { action: 'nope' }), {} as any, () => {}) as any;
    expect(res.statusCode).toBe(400);
  });
});
