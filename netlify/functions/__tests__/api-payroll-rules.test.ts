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
 * The batch is executed for real against doc stubs, so the self-healing delete of
 * legacy duplicates is observable rather than assumed.
 */
function wire(opts: { rules?: any[]; member?: boolean; ruleDoc?: any } = {}) {
  const rules = opts.rules || [];
  const memberExists = opts.member !== false;

  const sets: any[] = [];
  const batchDeletes: string[] = [];
  const deleteSpy = vi.fn().mockResolvedValue(undefined);
  const commitSpy = vi.fn().mockResolvedValue(undefined);

  const rulesQuery = seededQuery(rules);

  const ruleDocRef = (id: string) => ({
    id,
    get: vi.fn(async () => {
      const seeded = opts.ruleDoc !== undefined ? opts.ruleDoc : rules.find(r => r.id === id);
      return { exists: !!seeded, id, data: () => seeded };
    }),
    delete: deleteSpy,
  });

  (adminDb.collection as any).mockImplementation((name: string) => {
    if (name === 'compensationRules') {
      return { ...rulesQuery.q, doc: vi.fn((id?: string) => ruleDocRef(id || 'auto1')) };
    }
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

  (adminDb.batch as any).mockImplementation(() => ({
    set: (ref: any, data: any) => { sets.push({ id: ref.id, ...data }); },
    delete: (ref: any) => { batchDeletes.push(ref.id); },
    commit: commitSpy,
  }));

  (getDocsByIds as any).mockResolvedValue({});

  return { sets, batchDeletes, deleteSpy, commitSpy, rulesClauses: rulesQuery.clauses };
}

const validBody = (extra: any = {}) => ({
  teacherId: 't1',
  components: [{ kind: 'salary', amountMinor: 5000000 }],
  ...extra,
});

const WRITE = ['payroll:write'];

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
