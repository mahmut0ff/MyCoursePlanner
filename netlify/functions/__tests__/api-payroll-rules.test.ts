import { describe, it, expect, vi, beforeEach } from 'vitest';

// firebase-admin is mocked wholesale: auth.ts pulls adminAuth/adminDb and
// finance-names.ts pulls getDocsByIds at module load.
vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: vi.fn(), batch: vi.fn(), runTransaction: vi.fn() },
  adminAuth: { verifyIdToken: vi.fn() },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

// Only verifyAuth is stubbed — can() / getOrgFilter() are the real ones, exactly
// as api-finance.test.ts does it.
vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn() };
});

import { adminDb, getDocsByIds } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';
import { handler as rulesHandler } from '../api-payroll-rules';
import { ensureTeacherRate } from '../utils/payroll-default-rate';

const event = (method: string, query?: any, body?: any) => ({
  httpMethod: method,
  body: body ? JSON.stringify(body) : null,
  queryStringParameters: query || {},
  headers: {},
} as any);

/** An AuthUser shaped just enough for can() / getOrgFilter(). */
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

/**
 * Детерминированный id ставки — зеркало ruleDocId в эндпоинте.
 *
 * Хвост `_org` остался от прежней филиальной схемы и НЕ означает охват: филиала
 * у ставки больше нет, а ровно такой id уже носят все существующие
 * общеорганизационные документы — менять его значило бы осиротить их.
 */
const rateId = (teacherId: string) => `rate_org1_${teacherId}_org`;

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
        docs: matched.map(r => ({ id: r.id, data: () => r, ref: { id: r.id } })),
      };
    }),
  };
  return { q, clauses };
}

/**
 * Wires the collection surface this endpoint touches.
 *  - compensationRules: seeded rules + .doc() for the canonical rate document
 *  - orgMembers/{org}/members/{teacher}: membership existence
 *  - orgMembers/{org}/members: весь состав организации (раздача умолчания)
 *  - organizations/{org}: ЖИВОЙ документ — update() пишет в него, get() читает из
 *    него же, поэтому «сохранили умолчание и перечитали» проверяется на одних
 *    данных, а не на двух независимо засеянных копиях.
 * The batch is executed for real against doc stubs, so the self-healing delete of
 * legacy duplicates is observable rather than assumed.
 */
function wire(opts: {
  rules?: any[];
  member?: boolean;
  ruleDoc?: any;
  /** Состав организации для ?action=applyDefault: role/roles/status как в базе. */
  members?: any[];
  /** Поле payrollDefaultRate документа организации; undefined — умолчания нет. */
  defaultRate?: any;
  /** Чем падает create() — провизионирование не имеет права уронить заведение. */
  createFails?: any;
} = {}) {
  const rules = opts.rules || [];
  const memberExists = opts.member !== false;
  const members = opts.members || [];

  const sets: any[] = [];
  const creates: any[] = [];
  const batchDeletes: string[] = [];
  const orgUpdates: any[] = [];
  const deleteSpy = vi.fn().mockResolvedValue(undefined);
  const commitSpy = vi.fn().mockResolvedValue(undefined);
  /**
   * Размер КАЖДОГО батча по отдельности, а не суммарное число операций.
   * Firestore роняет батч на 501 операции целиком, поэтому «всего 480 записей»
   * ничего не говорит: важно, что ни один батч не перевалил лимит.
   */
  const batches: Array<{ ops: number }> = [];

  const orgDoc: Record<string, any> = {};
  if (opts.defaultRate !== undefined) orgDoc.payrollDefaultRate = opts.defaultRate;

  const rulesQuery = seededQuery(rules);

  const ruleDocRef = (id: string) => ({
    id,
    get: vi.fn(async () => {
      const seeded = opts.ruleDoc !== undefined ? opts.ruleDoc : rules.find(r => r.id === id);
      return { exists: !!seeded, id, data: () => seeded };
    }),
    delete: deleteSpy,
    // Провизионирование пишет create(), а не set(): параллельное заведение того же
    // человека не должно затереть ставку, которую уже назначили руками.
    create: vi.fn(async (data: any) => {
      if (opts.createFails) throw opts.createFails;
      creates.push({ id, ...data });
    }),
  });

  (adminDb.collection as any).mockImplementation((name: string) => {
    if (name === 'compensationRules') {
      return { ...rulesQuery.q, doc: vi.fn((id?: string) => ruleDocRef(id || 'auto1')) };
    }
    if (name === 'organizations') {
      return {
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: true, data: () => orgDoc })),
          update: vi.fn(async (patch: any) => { orgUpdates.push(patch); Object.assign(orgDoc, patch); }),
        })),
      };
    }
    if (name === 'orgMembers') {
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ exists: memberExists }) })),
            get: vi.fn(async () => ({
              size: members.length,
              empty: members.length === 0,
              docs: members.map(m => ({ id: m.id, data: () => m })),
            })),
          })),
        })),
      };
    }
    return rulesQuery.q;
  });

  (adminDb.batch as any).mockImplementation(() => {
    const current = { ops: 0 };
    batches.push(current);
    return {
      set: (ref: any, data: any) => { current.ops++; sets.push({ id: ref.id, ...data }); },
      delete: (ref: any) => { current.ops++; batchDeletes.push(ref.id); },
      commit: commitSpy,
    };
  });

  (getDocsByIds as any).mockResolvedValue({});

  return { sets, creates, batchDeletes, orgUpdates, orgDoc, deleteSpy, commitSpy, batches, rulesClauses: rulesQuery.clauses };
}

const validBody = (extra: any = {}) => ({
  teacherId: 't1',
  components: [{ kind: 'salary', amountMinor: 5000000 }],
  ...extra,
});

const WRITE = ['payroll:write'];

/** Умолчание организации — «как мы обычно платим»: двадцать процентов кассы. */
const DEFAULT_COMPONENTS = [{ kind: 'percent_revenue', percentBp: 2000, base: 'collected' }];
const DEFAULT_RATE = {
  components: DEFAULT_COMPONENTS,
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'director',
};

/**
 * Мёртвая ставка прежней модели. Движок такие не начисляет, поэтому человек с
 * ней получает ноль ровно как человек без ставки — в этой организации три ставки
 * из четырёх именно такие, так что случай не гипотетический.
 */
const DEAD_COMPONENTS = [{ kind: 'per_student', amountMinor: 100000 }];

describe('api-payroll-rules POST — валидация двух видов оплаты', () => {
  beforeEach(() => vi.clearAllMocks());

  it('отвергает процент вне 1..10000 и дробный', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();

    for (const percentBp of [0, -100, 10001, 20.5]) {
      const res: any = await rulesHandler(event('POST', {}, validBody({
        components: [{ kind: 'percent_revenue', percentBp, base: 'collected' }],
      })), {} as any, () => {});
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('процент');
    }
    expect(sets).toHaveLength(0);
  });

  it('отвергает базу процента, отличную от СОБРАННЫХ денег', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    wire();
    const res: any = await rulesHandler(event('POST', {}, validBody({
      components: [{ kind: 'percent_revenue', percentBp: 2000, base: 'invoiced' }],
    })), {} as any, () => {});
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('collected');
  });

  it('отвергает дробную сумму — минорные единицы целые, иначе копейки исчезают', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();

    for (const amountMinor of [1500.5, 0, -100]) {
      const res: any = await rulesHandler(event('POST', {}, validBody({
        components: [{ kind: 'salary', amountMinor }],
      })), {} as any, () => {});
      expect(res.statusCode).toBe(400);
    }
    expect(sets).toHaveLength(0);
  });

  it('ОТВЕРГАЕТ удалённые виды оплаты — за занятие, за час, за студента', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();

    for (const kind of ['per_lesson', 'per_hour', 'per_student']) {
      const res: any = await rulesHandler(event('POST', {}, validBody({
        components: [{ kind, amountMinor: 30000 }],
      })), {} as any, () => {});
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('вид оплаты');
    }
    expect(sets).toHaveLength(0);
  });

  it('отвергает один и тот же вид дважды — расчёт заплатил бы вдвое', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody({
      components: [
        { kind: 'percent_revenue', percentBp: 1000, base: 'collected' },
        { kind: 'percent_revenue', percentBp: 2000, base: 'collected' },
      ],
    })), {} as any, () => {});
    expect(res.statusCode).toBe(400);
    expect(sets).toHaveLength(0);
  });

  it('отвергает пустую оплату', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    wire();
    const res: any = await rulesHandler(event('POST', {}, validBody({ components: [] })), {} as any, () => {});
    expect(res.statusCode).toBe(400);
  });

  it('отвергает преподавателя не из этой организации', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire({ member: false });
    const res: any = await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});
    expect(res.statusCode).toBe(400);
    expect(sets).toHaveLength(0);
  });

  it('требует payroll:write — finances:write до ставки не достаёт', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:write', 'payroll:read']));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});
    expect(res.statusCode).toBe(403);
    expect(sets).toHaveLength(0);
  });
});

describe('api-payroll-rules POST — одна ставка на преподавателя', () => {
  beforeEach(() => vi.clearAllMocks());

  it('пишет в ДЕТЕРМИНИРОВАННЫЙ документ: повтор перезаписывает, а не плодит', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    expect(sets).toHaveLength(1);
    expect(sets[0].id).toBe(rateId('t1'));
  });

  it('удаляет ЛЮБЫЕ другие ставки того же преподавателя, включая филиальных двойников', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    // Наследие двух прежних моделей сразу: датированная версия с автоid и
    // ставка, заведённая «в филиале B».
    const { sets, batchDeletes } = wire({
      rules: [
        { id: 'legacyDated', organizationId: 'org1', teacherId: 't1' },
        { id: 'rate_org1_t1_alay', organizationId: 'org1', teacherId: 't1', branchId: 'alay' },
      ],
    });

    const res: any = await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).replacedLegacyRules).toBe(2);
    // Сверки по филиалу здесь больше нет: переживший сохранение двойник
    // продолжил бы спорить с канонической ставкой за то, сколько человеку платить.
    expect(batchDeletes.sort()).toEqual(['legacyDated', 'rate_org1_t1_alay']);
    expect(sets).toHaveLength(1);
    expect(sets[0].id).toBe(rateId('t1'));
  });

  it('не трогает ставки ДРУГОГО преподавателя', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { batchDeletes } = wire({
      rules: [{ id: 'rate_org1_t2_org', organizationId: 'org1', teacherId: 't2' }],
    });
    const res: any = await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(batchDeletes).toEqual([]);
  });

  it('сохраняет createdAt/createdBy существующей ставки при правке', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire({
      ruleDoc: {
        id: rateId('t1'), organizationId: 'org1', teacherId: 't1',
        createdBy: 'director', createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const res: any = await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(sets[0].createdBy).toBe('director');
    expect(sets[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(sets[0].updatedBy).toBe('u1');
  });
});

describe('api-payroll-rules POST — форма записи и границы организации', () => {
  beforeEach(() => vi.clearAllMocks());

  it('штампует организацию и автора, выбрасывает чужие поля — включая branchId', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody({
      organizationId: 'evil',
      createdBy: 'evil',
      status: 'archived',
      label: 'Название ставки',
      effectiveFrom: '2020-01',
      branchId: 'B',
      evilField: 'x',
    })), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    expect(sets[0].organizationId).toBe('org1');   // server org wins
    expect(sets[0].createdBy).toBe('u1');
    // Полей прежних моделей в документе больше нет — их некому и незачем писать.
    expect(sets[0].status).toBeUndefined();
    expect(sets[0].label).toBeUndefined();
    expect(sets[0].effectiveFrom).toBeUndefined();
    expect(sets[0].evilField).toBeUndefined();
    // Филиал у ставки не хранится: «двадцать процентов» относятся к человеку, а
    // не к зданию, и присланный branchId не должен осесть в базе.
    expect(sets[0].branchId).toBeUndefined();
    expect(sets[0].id).toBe(rateId('t1'));
  });

  it('нормализует оплату вместо того, чтобы хранить присланное', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody({
      components: [{
        kind: 'percent_revenue', percentBp: 2000, base: 'collected', junk: 'x',
        // Область действия удалена из модели: процент считается по группам
        // преподавателя, и присланный scope не должен осесть в базе.
        scope: { courseIds: ['c1'], groupIds: ['g1'] },
      }],
    })), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    expect(sets[0].components[0]).toEqual({ kind: 'percent_revenue', percentBp: 2000, base: 'collected' });
  });

  it('принимает процент без явного base — он и так единственный', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody({
      components: [{ kind: 'percent_revenue', percentBp: 1500 }],
    })), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(sets[0].components[0].base).toBe('collected');
  });

  it('ищет дубликаты только равенствами по организации и преподавателю', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { rulesClauses } = wire();
    await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});
    expect(rulesClauses).toContainEqual(['organizationId', 'org1']);
    expect(rulesClauses).toContainEqual(['teacherId', 't1']);
  });

  it('сотрудник, закреплённый за филиалом, задаёт ту же одну ставку', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE, { branchIds: ['A'], primaryBranchId: 'A' }));
    const { sets } = wire();
    const res: any = await rulesHandler(event('POST', {}, validBody()), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    // Ни отказа «выберите филиал», ни ставки «филиала A»: у преподавателя ставка
    // одна, и заводится она в тот же документ, что и у всех остальных.
    expect(sets[0].id).toBe(rateId('t1'));
    expect(sets[0].branchId).toBeUndefined();
  });
});

describe('api-payroll-rules DELETE', () => {
  beforeEach(() => vi.clearAllMocks());

  const rule = { id: 'r1', organizationId: 'org1', teacherId: 't1', components: [] };
  const DELETE_GRANT = ['payroll:delete'];

  it('убирает ставку, даже если по ней уже была ведомость — историю держит снапшот строки', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT));
    const { deleteSpy } = wire({ ruleDoc: rule });
    const res: any = await rulesHandler(event('DELETE', { id: 'r1' }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).deleted).toBe(true);
    expect(deleteSpy).toHaveBeenCalled();
  });

  it('отказывает по ставке чужой организации', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT));
    const { deleteSpy } = wire({ ruleDoc: { ...rule, organizationId: 'org2' } });
    const res: any = await rulesHandler(event('DELETE', { id: 'r1' }), {} as any, () => {});
    expect(res.statusCode).toBe(403);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('снимает и легаси-ставку с чужим филиалом — граница здесь одна, организация', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT, { branchIds: ['A'], primaryBranchId: 'A' }));
    const { deleteSpy } = wire({ ruleDoc: { ...rule, branchId: 'B' } });
    const res: any = await rulesHandler(event('DELETE', { id: 'r1' }), {} as any, () => {});
    // Оставить филиальный двойник неудаляемым значило бы навсегда сохранить
    // документ, который спорит с канонической ставкой за начисление.
    expect(res.statusCode).toBe(200);
    expect(deleteSpy).toHaveBeenCalled();
  });

  // «Убрать ставку» значит «этому человеку больше не начислять». Откат правки
  // (удаление одного документа по id) оставил бы филиального двойника, и он
  // продолжил бы начислять деньги при том, что в интерфейсе ставка убрана.
  const duplicatedRules = () => [
    { id: rateId('t1'), organizationId: 'org1', teacherId: 't1', components: [] },
    { id: 'rate_org1_t1_alay', organizationId: 'org1', teacherId: 't1', branchId: 'alay', components: [] },
    { id: rateId('t2'), organizationId: 'org1', teacherId: 't2', components: [] },
  ];

  it('сносит ВСЕ ставки преподавателя, а не только документ по id', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT));
    const { batchDeletes, deleteSpy } = wire({ rules: duplicatedRules() });

    const res: any = await rulesHandler(event('DELETE', { id: rateId('t1') }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(true);
    expect(body.alsoDeleted).toBe(1);
    // Оба документа ушли одним батчем; одиночного удаления не было.
    expect(batchDeletes.sort()).toEqual(['rate_org1_t1_alay', rateId('t1')].sort());
    expect(deleteSpy).not.toHaveBeenCalled();
    // Чужая ставка не тронута: граница — преподаватель, а не организация целиком.
    expect(batchDeletes).not.toContain(rateId('t2'));
  });

  it('удаление ЛЕГАСИ-двойника уносит и каноническую ставку', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT));
    const { batchDeletes } = wire({ rules: duplicatedRules() });

    // Директор видит в списке филиальный документ и снимает именно его. Оставить
    // канонический значило бы и дальше платить по «убранной» ставке.
    const res: any = await rulesHandler(event('DELETE', { id: 'rate_org1_t1_alay' }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).alsoDeleted).toBe(1);
    expect(batchDeletes.sort()).toEqual(['rate_org1_t1_alay', rateId('t1')].sort());
  });

  it('ищет двойников только равенствами по организации и преподавателю', async () => {
    (verifyAuth as any).mockResolvedValue(staff(DELETE_GRANT));
    const { rulesClauses } = wire({ rules: duplicatedRules() });
    await rulesHandler(event('DELETE', { id: rateId('t1') }), {} as any, () => {});
    expect(rulesClauses).toContainEqual(['organizationId', 'org1']);
    expect(rulesClauses).toContainEqual(['teacherId', 't1']);
  });

  it('требует payroll:delete — payroll:write недостаточно', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { deleteSpy } = wire({ ruleDoc: rule });
    const res: any = await rulesHandler(event('DELETE', { id: 'r1' }), {} as any, () => {});
    expect(res.statusCode).toBe(403);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe('api-payroll-rules GET', () => {
  beforeEach(() => vi.clearAllMocks());

  // r1/r2 — документы прежней филиальной схемы: поле у них ещё лежит в базе, но
  // ни на выборку, ни на расчёт оно больше не влияет.
  const rows = [
    { id: 'r1', organizationId: 'org1', teacherId: 't1', branchId: 'A', components: [] },
    { id: 'r2', organizationId: 'org1', teacherId: 't2', branchId: 'B', components: [] },
    { id: 'r3', organizationId: 'org2', teacherId: 't3', branchId: 'A', components: [] },
    { id: 'r4', organizationId: 'org1', teacherId: 't4', components: [] },
  ];

  it('отдаёт голый массив в границах организации', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read']));
    wire({ rules: rows });
    const res: any = await rulesHandler(event('GET'), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);            // bare array, not {rules:[...]}
    expect(body.map((r: any) => r.id).sort()).toEqual(['r1', 'r2', 'r4']); // org2 excluded
  });

  it('применяет фильтр по преподавателю равенством', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read']));
    const { rulesClauses } = wire({ rules: rows });
    const res: any = await rulesHandler(event('GET', { teacherId: 't1' }), {} as any, () => {});
    expect(rulesClauses).toContainEqual(['teacherId', 't1']);
    expect(JSON.parse(res.body).map((r: any) => r.id)).toEqual(['r1']);
  });

  it('сотруднику, закреплённому за филиалом, отдаёт ВСЕ ставки организации', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read'], { branchIds: ['B'], primaryBranchId: 'B' }));
    wire({ rules: rows });
    const res: any = await rulesHandler(event('GET'), {} as any, () => {});
    // Список обязан показывать РОВНО ТО, что видит расчёт, а расчёт читает все
    // ставки организации. Спрятать ставку значило бы оставить директора в
    // неведении о документе, по которому ему завтра начислят зарплату.
    expect(JSON.parse(res.body).map((r: any) => r.id).sort()).toEqual(['r1', 'r2', 'r4']);
  });

  it('требует payroll:read — finances:read ставок не показывает', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    wire({ rules: rows });
    const res: any = await rulesHandler(event('GET'), {} as any, () => {});
    expect(res.statusCode).toBe(403);
  });
});

describe('api-payroll-rules ?action=default — умолчание организации', () => {
  beforeEach(() => vi.clearAllMocks());

  it('до первой настройки отдаёт default: null — это состояние, а не ошибка', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read']));
    wire();
    const res: any = await rulesHandler(event('GET', { action: 'default' }), {} as any, () => {});
    // Интерфейс по этому null говорит вслух «не задана — новые преподаватели
    // начисляются нулём». Ответь ручка 404 или списком ставок — сказать было бы нечего.
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).default).toBeNull();
  });

  it('сохранённое умолчание перечитывается тем же GET', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read', 'payroll:write']));
    wire();

    const saved: any = await rulesHandler(event('POST', { action: 'default' }, {
      components: [{ kind: 'percent_revenue', percentBp: 2000 }],
    }), {} as any, () => {});
    expect(saved.statusCode).toBe(200);

    const res: any = await rulesHandler(event('GET', { action: 'default' }), {} as any, () => {});
    const def = JSON.parse(res.body).default;
    // Нормализованная оплата, а не присланная: у процента проставлена база.
    expect(def.components).toEqual([{ kind: 'percent_revenue', percentBp: 2000, base: 'collected' }]);
    expect(def.updatedBy).toBe('u1');
    expect(def.updatedAt).toBeTruthy();
  });

  it('умолчание кладётся полем payrollDefaultRate документа организации', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { orgUpdates, orgDoc } = wire();
    const res: any = await rulesHandler(event('POST', { action: 'default' }, {
      components: [{ kind: 'salary', amountMinor: 5000000 }],
    }), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    expect(orgUpdates).toHaveLength(1);
    // Настройка организации, а не отдельная сущность: коллекции под один объект нет.
    expect(orgDoc.payrollDefaultRate.components).toEqual([{ kind: 'salary', amountMinor: 5000000 }]);
    expect(orgDoc.payrollDefaultRate.updatedBy).toBe('u1');
  });

  it('валидирует оплату ровно как обычную ставку — иначе умолчание раздало бы мусор', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { orgUpdates } = wire();

    const bad = [
      { components: [{ kind: 'percent_revenue', percentBp: 0, base: 'collected' }] },
      { components: [{ kind: 'percent_revenue', percentBp: 10001, base: 'collected' }] },
      { components: [{ kind: 'percent_revenue', percentBp: 20.5, base: 'collected' }] },
      { components: [] },
      { components: DEAD_COMPONENTS },                       // удалённый вид оплаты
      { components: [{ kind: 'salary', amountMinor: 0 }] },
      {},                                                    // components вообще нет
    ];
    for (const body of bad) {
      const res: any = await rulesHandler(event('POST', { action: 'default' }, body), {} as any, () => {});
      expect(res.statusCode).toBe(400);
    }
    // Ни одна невалидная попытка не оседает в документе организации.
    expect(orgUpdates).toHaveLength(0);
  });

  it('components: null убирает умолчание — новые преподаватели снова заводятся без ставки', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read', 'payroll:write']));
    const { orgDoc } = wire({ defaultRate: DEFAULT_RATE });

    const res: any = await rulesHandler(event('POST', { action: 'default' }, { components: null }), {} as any, () => {});
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).cleared).toBe(true);
    expect(orgDoc.payrollDefaultRate).toBeNull();

    const after: any = await rulesHandler(event('GET', { action: 'default' }), {} as any, () => {});
    expect(JSON.parse(after.body).default).toBeNull();
  });

  it('мёртвое умолчание прежнего вида читается как отсутствующее', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read']));
    wire({ defaultRate: { components: DEAD_COMPONENTS, updatedBy: 'director' } });
    const res: any = await rulesHandler(event('GET', { action: 'default' }), {} as any, () => {});
    // Показать такое умолчание как рабочее значило бы обещать деньги, которых
    // движок не начислит: раздавать по нему нечего.
    expect(JSON.parse(res.body).default).toBeNull();
  });

  it('требует payroll:write на запись и payroll:read на чтение', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read']));
    const { orgUpdates } = wire();
    const write: any = await rulesHandler(event('POST', { action: 'default' }, {
      components: DEFAULT_COMPONENTS,
    }), {} as any, () => {});
    expect(write.statusCode).toBe(403);
    expect(orgUpdates).toHaveLength(0);

    (verifyAuth as any).mockResolvedValue(staff(['finances:read']));
    const read: any = await rulesHandler(event('GET', { action: 'default' }), {} as any, () => {});
    expect(read.statusCode).toBe(403);
  });
});

describe('api-payroll-rules ?action=applyDefault — разовая раздача умолчания', () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Состав организации. t2 совмещает менеджера с преподаванием — раздача обязана
   * видеть его по roles[], а не только по основной роли.
   *
   * Статусы здесь РЕАЛЬНЫЕ — те, что пишет код: увольнение ставит 'removed'
   * (api-memberships:391), уход по своей воле — 'left' (api-memberships:300,
   * api-users:120), отчисление — 'expelled', заявка на вступление — 'pending'
   * (join-approvals:153). Значения 'inactive' в базе нет ни у одного документа:
   * его не пишет ни один путь. Пока в сиде стоял именно 'inactive', проверка
   * «ушедших не трогаем» была ложно-зелёной — чёрный список
   * `status !== 'inactive'` пропускал их всех до единого.
   *
   * У t1 поля статуса нет вовсе — так выглядят членства прежних лет.
   */
  const membersSeed = () => ([
    { id: 't1', role: 'teacher' },                                   // без ставки
    { id: 't2', role: 'manager', roles: ['manager', 'teacher'] },    // живая ставка
    { id: 't3', role: 'teacher' },                                   // мёртвая ставка
    { id: 's1', role: 'student' },
    { id: 'm1', role: 'manager' },
    { id: 'fired', role: 'teacher', status: 'removed' },             // уволен
    { id: 'quit', role: 'teacher', status: 'left' },                 // ушёл сам
    // Отчисление ставит 'expelled' по ОСНОВНОЙ роли (api-memberships:391),
    // поэтому документ с таким статусом и преподавательской ролью — это
    // студент-совместитель. Роль teacher у него остаётся, и раздача обязана
    // пройти мимо: человек в организации больше не работает.
    { id: 'expelled', role: 'student', roles: ['student', 'teacher'], status: 'expelled' },
    { id: 'applicant', role: 'teacher', status: 'pending' },         // заявка, ещё не принят
  ]);

  /** У t3 ставка прежней модели, да ещё и филиальным двойником — обе мертвы. */
  const rulesSeed = () => ([
    { id: rateId('t2'), organizationId: 'org1', teacherId: 't2', components: [{ kind: 'salary', amountMinor: 5000000 }] },
    { id: 'rate_org1_t3_alay', organizationId: 'org1', teacherId: 't3', branchId: 'alay', components: DEAD_COMPONENTS },
  ]);

  /**
   * Два документа одного человека: свежий МЁРТВЫЙ (прежний вид оплаты, поздний
   * updatedAt) и старый ЖИВОЙ. Начисляют по одному — победителю resolveRules,
   * то есть по свежему, — значит денег преподаватель не увидит, хотя «живая
   * ставка у него есть».
   */
  const splitRules = () => ([
    { id: 'rate_org1_t9_alay', organizationId: 'org1', teacherId: 't9', branchId: 'alay',
      components: DEAD_COMPONENTS, updatedAt: '2026-08-10T00:00:00.000Z' },
    { id: 'legacyDated_t9', organizationId: 'org1', teacherId: 't9',
      components: DEFAULT_COMPONENTS, updatedAt: '2026-01-05T00:00:00.000Z' },
  ]);

  it('без заданного умолчания отказывает — раздавать нечего', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets, commitSpy } = wire({ members: membersSeed() });
    const res: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {}), {} as any, () => {});
    // Не «ноль назначено», а внятный отказ: иначе директор решил бы, что ставки
    // розданы, и узнал бы правду в день зарплаты.
    expect(res.statusCode).toBe(400);
    expect(sets).toHaveLength(0);
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('назначает ставку ТОЛЬКО тем, у кого её нет', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets, commitSpy } = wire({
      members: membersSeed(), rules: rulesSeed(), defaultRate: DEFAULT_RATE,
    });
    const res: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {}), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.created).toBe(1);
    expect(body.teacherIds).toEqual(['t1']);
    // Живая ставка t2 не перезаписана: раздача — догонялка, а не выравнивание.
    expect(sets.map((s: any) => s.id)).toEqual([rateId('t1')]);
    expect(sets[0].components).toEqual(DEFAULT_COMPONENTS);
    expect(sets[0].organizationId).toBe('org1');
    expect(sets[0].teacherId).toBe('t1');
    // След происхождения: видно, что ставку никто не назначал руками.
    expect(sets[0].fromDefault).toBe(true);
    expect(sets[0].createdBy).toBe('u1');
    expect(commitSpy).toHaveBeenCalledTimes(1);
  });

  it('не трогает студентов, менеджеров и всех, кто уже не работает', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire({ members: membersSeed(), rules: rulesSeed(), defaultRate: DEFAULT_RATE });
    const res: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {}), {} as any, () => {});

    const body = JSON.parse(res.body);
    // Ставка студенту — не безобидный лишний документ: она попадёт в раздел
    // зарплат строкой человека, которому никто не собирался платить.
    //
    // Уволенный, ушедший, отчисленный и заявитель — тем более: роль
    // преподавателя в их членстве ОСТАЁТСЯ, а ставку увольнение удалило
    // намеренно (closeTeacherRules). Верни фильтр к чёрному списку
    // `status !== 'inactive'` — и все четверо снова получат ставку, потому что
    // 'inactive' не пишет ни один путь кода; это и есть та правка, которую
    // тест закрепляет.
    for (const outsider of ['s1', 'm1', 'fired', 'quit', 'expelled', 'applicant']) {
      expect(body.teacherIds).not.toContain(outsider);
      expect(sets.map((s: any) => s.id)).not.toContain(rateId(outsider));
    }
    // Ровно один назначенный, а не пятеро: считаем поимённо И по числу.
    expect(body.created).toBe(1);
    expect(sets).toHaveLength(1);
  });

  it('членство БЕЗ поля статуса — действующее: у старожилов его просто нет', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets } = wire({
      members: [
        { id: 'oldTimer', role: 'teacher' },                 // документ прежних лет: поля status нет
        { id: 'gone', role: 'teacher', status: 'removed' },  // контрольный уволенный
      ],
      defaultRate: DEFAULT_RATE,
    });
    const res: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {}), {} as any, () => {});

    // Сузь предикат до строгого `status === 'active'` — и преподаватель, который
    // работает в академии дольше, чем существует поле статуса, молча выпал бы из
    // раздачи и остался бы с нулевой зарплатой.
    expect(JSON.parse(res.body).teacherIds).toEqual(['oldTimer']);
    expect(sets.map((s: any) => s.id)).toEqual([rateId('oldTimer')]);
  });

  it('мёртвую ставку без флага не заменяет, но называет её вслух через legacyRates', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets, batchDeletes } = wire({
      members: membersSeed(), rules: rulesSeed(), defaultRate: DEFAULT_RATE,
    });
    const res: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {}), {} as any, () => {});

    const body = JSON.parse(res.body);
    expect(body.teacherIds).not.toContain('t3');
    expect(body.skipped).toBe(2);            // t2 со ставкой + t3 с мёртвой
    // Главное число этой ручки: у t3 ставка формально есть, а денег не будет.
    // Молчать о нём нельзя — интерфейс по нему и предлагает замену.
    expect(body.legacyRates).toBe(1);
    expect(body.replacedLegacy).toBe(false);
    expect(sets.map((s: any) => s.id)).toEqual([rateId('t1')]);
    expect(batchDeletes).toEqual([]);
  });

  it('с replaceLegacy заменяет мёртвую ставку, а её двойника сносит тем же батчем', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets, batchDeletes, commitSpy } = wire({
      members: membersSeed(), rules: rulesSeed(), defaultRate: DEFAULT_RATE,
    });
    const res: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {
      replaceLegacy: true,
    }), {} as any, () => {});

    const body = JSON.parse(res.body);
    expect(body.created).toBe(2);
    expect(body.teacherIds.sort()).toEqual(['t1', 't3']);
    expect(body.replacedLegacy).toBe(true);
    expect(body.legacyRates).toBe(1);
    // Новая ставка легла в канонический документ...
    expect(sets.map((s: any) => s.id).sort()).toEqual([rateId('t1'), rateId('t3')].sort());
    expect(sets.find((s: any) => s.id === rateId('t3')).components).toEqual(DEFAULT_COMPONENTS);
    // ...а филиальный двойник ушёл тем же батчем: переживи он раздачу, расчёт
    // продолжил бы спорить сам с собой о том, какая ставка настоящая.
    expect(batchDeletes).toEqual(['rate_org1_t3_alay']);
    expect(commitSpy).toHaveBeenCalledTimes(1);
  });

  it('живая, но ПРОИГРАВШАЯ ставка не спасает — решает победитель resolveRules', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets, batchDeletes } = wire({
      members: [{ id: 't9', role: 'teacher' }], rules: splitRules(), defaultRate: DEFAULT_RATE,
    });
    const res: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {}), {} as any, () => {});

    const body = JSON.parse(res.body);
    // Живой документ у человека есть — но начисляют не по нему, а по свежему,
    // мёртвому. Проверка «хоть один документ живой» (как было до правки) дала бы
    // здесь legacyRates: 0 и молчаливый skipped: преподаватель не попадал бы ни
    // в раздачу, ни в предложение «заменить мёртвые» — то есть не чинился НИКОГДА.
    expect(body.legacyRates).toBe(1);
    expect(body.teacherIds).toEqual([]);
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(1);
    expect(sets).toHaveLength(0);
    expect(batchDeletes).toEqual([]);
  });

  it('replaceLegacy чинит и такого преподавателя — оба прежних документа уходят', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets, batchDeletes, commitSpy } = wire({
      members: [{ id: 't9', role: 'teacher' }], rules: splitRules(), defaultRate: DEFAULT_RATE,
    });
    const res: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {
      replaceLegacy: true,
    }), {} as any, () => {});

    const body = JSON.parse(res.body);
    // До правки флаг был бессилен именно здесь: человек с живой, но проигравшей
    // ставкой не считался целью, и нажатие «заменить мёртвые» его не касалось.
    expect(body.created).toBe(1);
    expect(body.teacherIds).toEqual(['t9']);
    expect(sets.map((s: any) => s.id)).toEqual([rateId('t9')]);
    expect(sets[0].components).toEqual(DEFAULT_COMPONENTS);
    // Ставка теперь ровно одна: и филиальный двойник, и датированный документ
    // прежней схемы снесены тем же батчем — переживи любой из них раздачу, спор
    // «какая ставка настоящая» продолжился бы на следующем расчёте.
    expect(batchDeletes.sort()).toEqual(['legacyDated_t9', 'rate_org1_t9_alay']);
    expect(commitSpy).toHaveBeenCalledTimes(1);
  });

  it('число на кнопке и результат раздачи считает ОДИН И ТОТ ЖЕ код', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read', ...WRITE]));
    const { sets } = wire({
      members: [...membersSeed(), { id: 't9', role: 'teacher' }],
      rules: [...rulesSeed(), ...splitRules()],
      defaultRate: DEFAULT_RATE,
    });

    // То, что интерфейс печатает на кнопке.
    const shownRes: any = await rulesHandler(event('GET', { action: 'default' }), {} as any, () => {});
    const shown = JSON.parse(shownRes.body);
    expect(shown.withoutRate).toBe(1);   // t1 — совсем без ставки
    expect(shown.legacyRates).toBe(2);   // t3 (мёртвая) и t9 (мёртвая победила живую)

    // То, что раздача делает на ТЕХ ЖЕ данных.
    const appliedRes: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {}), {} as any, () => {});
    const applied = JSON.parse(appliedRes.body);

    // Важны не сами числа, а их равенство. Пока счёт для кнопки жил на клиенте,
    // он шёл по списку экрана — а тот шире состава: в нём уволенные со строками
    // прошлых месяцев и люди без преподавательской роли. Кнопка обещала «назначить
    // пятерым», раздача назначала одному, и объяснить разницу было нечем.
    expect(applied.created).toBe(shown.withoutRate);
    expect(applied.legacyRates).toBe(shown.legacyRates);
    expect(sets).toHaveLength(shown.withoutRate);

    // И второе обещание кнопки: «заменить мёртвые» назначит withoutRate + legacyRates.
    const replacedRes: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {
      replaceLegacy: true,
    }), {} as any, () => {});
    expect(JSON.parse(replacedRes.body).created).toBe(shown.withoutRate + shown.legacyRates);
  });

  it('раздача на сотни преподавателей режется на батчи по 450 операций', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const TEACHERS = 240;
    const ids = Array.from({ length: TEACHERS }, (_, i) => `t${i + 1}`);
    const { sets, batchDeletes, commitSpy, batches } = wire({
      members: ids.map(id => ({ id, role: 'teacher' })),
      // У каждого — мёртвый двойник прежней схемы, поэтому раздача и ПИШЕТ ставку,
      // и СНОСИТ документ: операций вдвое больше, чем людей.
      rules: ids.map(id => ({
        id: `rate_org1_${id}_alay`, organizationId: 'org1', teacherId: id, components: DEAD_COMPONENTS,
      })),
      defaultRate: DEFAULT_RATE,
    });

    const res: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {
      replaceLegacy: true,
    }), {} as any, () => {});

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).created).toBe(TEACHERS);
    expect(sets.length + batchDeletes.length).toBe(TEACHERS * 2);   // 480 операций

    // Верни один неограниченный батч — и раздача не сделает НИЧЕГО: Firestore
    // отвергает батч на 501 операции целиком, а не «первые 500 из 501». Академия
    // на две сотни преподавателей с двойниками этот порог переходит спокойно.
    expect(commitSpy).toHaveBeenCalledTimes(2);
    expect(batches.map(b => b.ops)).toEqual([450, 30]);
    for (const b of batches) expect(b.ops).toBeLessThanOrEqual(450);
  });

  it('когда все со ставкой — ничего не пишет и батч не коммитит', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { sets, commitSpy } = wire({
      members: [{ id: 't2', role: 'teacher' }],
      rules: [{ id: rateId('t2'), organizationId: 'org1', teacherId: 't2', components: DEFAULT_COMPONENTS }],
      defaultRate: DEFAULT_RATE,
    });
    const res: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {}), {} as any, () => {});

    const body = JSON.parse(res.body);
    expect(body.created).toBe(0);
    expect(body.teacherIds).toEqual([]);
    expect(body.skipped).toBe(1);
    expect(body.legacyRates).toBe(0);
    expect(sets).toHaveLength(0);
    // Пустой commit — лишний запрос на каждое нажатие «назначить всем».
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('читает ставки одним равенством по организации — composite-индексов тут нет', async () => {
    (verifyAuth as any).mockResolvedValue(staff(WRITE));
    const { rulesClauses } = wire({ members: membersSeed(), rules: rulesSeed(), defaultRate: DEFAULT_RATE });
    await rulesHandler(event('POST', { action: 'applyDefault' }, {}), {} as any, () => {});
    expect(rulesClauses).toEqual([['organizationId', 'org1']]);
  });

  it('требует payroll:write — payroll:read раздать ставки не даёт', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read']));
    const { sets, commitSpy } = wire({ members: membersSeed(), defaultRate: DEFAULT_RATE });
    const res: any = await rulesHandler(event('POST', { action: 'applyDefault' }, {
      replaceLegacy: true,
    }), {} as any, () => {});
    expect(res.statusCode).toBe(403);
    expect(sets).toHaveLength(0);
    expect(commitSpy).not.toHaveBeenCalled();
  });
});

describe('payroll-default-rate.ensureTeacherRate — ставка в момент заведения', () => {
  beforeEach(() => vi.clearAllMocks());

  it('выдаёт умолчание преподавателю, у которого ставки нет', async () => {
    const { creates } = wire({ defaultRate: DEFAULT_RATE });
    const result = await ensureTeacherRate('org1', 't7', 'boss');

    expect(result).toBe('created');
    // Тот же детерминированный документ, в который пишет ручка: иначе у человека
    // оказалось бы две ставки, из которых расчёт молча выбрал бы одну.
    expect(creates).toHaveLength(1);
    expect(creates[0].id).toBe(rateId('t7'));
    expect(creates[0].components).toEqual(DEFAULT_COMPONENTS);
    expect(creates[0].teacherId).toBe('t7');
    expect(creates[0].organizationId).toBe('org1');
    expect(creates[0].createdBy).toBe('boss');
    expect(creates[0].fromDefault).toBe(true);
  });

  it('без умолчания не выдумывает ставку', async () => {
    const { creates } = wire();
    const result = await ensureTeacherRate('org1', 't7', 'boss');
    // Система не имеет права решить за организацию, сколько человеку платить:
    // «ставка не задана» честнее выдуманного числа.
    expect(result).toBe('no_default');
    expect(creates).toHaveLength(0);
  });

  it('не трогает ЛЮБУЮ существующую ставку — даже мёртвую прежнего вида', async () => {
    const { creates } = wire({
      defaultRate: DEFAULT_RATE,
      rules: [{ id: 'rate_org1_t7_alay', organizationId: 'org1', teacherId: 't7', components: DEAD_COMPONENTS }],
    });
    const result = await ensureTeacherRate('org1', 't7', 'boss');
    // Вторая ставка поверх старой дала бы спор о том, по какой платить. Мёртвую
    // разбирает явная раздача с replaceLegacy, а не молчаливое провизионирование.
    expect(result).toBe('has_rate');
    expect(creates).toHaveLength(0);
  });

  it('не бросает при отказе записи — заведение преподавателя важнее ставки', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { creates } = wire({ defaultRate: DEFAULT_RATE, createFails: new Error('PERMISSION_DENIED') });

    // Если бы исключение уходило наружу, зарплатная настройка роняла бы создание
    // преподавателя: не создать ставку терпимо, не создать человека — нет.
    await expect(ensureTeacherRate('org1', 't7', 'boss')).resolves.toBe('error');
    expect(creates).toHaveLength(0);
    spy.mockRestore();
  });

  it('гонку с уже созданной ставкой (ALREADY_EXISTS) считает успехом, а не сбоем', async () => {
    const { creates } = wire({ defaultRate: DEFAULT_RATE, createFails: Object.assign(new Error('x'), { code: 6 }) });
    const result = await ensureTeacherRate('org1', 't7', 'boss');
    expect(result).toBe('has_rate');
    expect(creates).toHaveLength(0);
  });

  it('без организации или преподавателя не ходит в базу', async () => {
    const { creates } = wire({ defaultRate: DEFAULT_RATE });
    await expect(ensureTeacherRate('', 't7', 'boss')).resolves.toBe('error');
    await expect(ensureTeacherRate('org1', '', 'boss')).resolves.toBe('error');
    expect(creates).toHaveLength(0);
  });
});

describe('api-payroll-rules — протокол', () => {
  beforeEach(() => vi.clearAllMocks());

  it('отвечает на OPTIONS 204 до обращения к авторизации', async () => {
    const res: any = await rulesHandler(event('OPTIONS'), {} as any, () => {});
    expect(res.statusCode).toBe(204);
    expect(verifyAuth).not.toHaveBeenCalled();
  });

  it('401 неаутентифицированному', async () => {
    (verifyAuth as any).mockResolvedValue(null);
    const res: any = await rulesHandler(event('GET'), {} as any, () => {});
    expect(res.statusCode).toBe(401);
  });

  it('405 на PUT — правка идёт тем же POST, отдельного метода больше нет', async () => {
    (verifyAuth as any).mockResolvedValue(staff(['payroll:read', 'payroll:write']));
    wire();
    const res: any = await rulesHandler(event('PUT', {}, { id: 'r1' }), {} as any, () => {});
    expect(res.statusCode).toBe(405);
  });
});
