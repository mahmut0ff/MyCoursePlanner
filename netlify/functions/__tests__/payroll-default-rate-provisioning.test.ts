/**
 * Ставка по умолчанию выдаётся в момент ЗАВЕДЕНИЯ преподавателя — и только там.
 *
 * Умолчание существует ради одного: человек, которого только что завели, не
 * должен молча начисляться нулём до дня зарплаты. Но ровно то же свойство делает
 * его опасным на любом другом пути: расчёт читает только реальные документы
 * `compensationRules`, поэтому убранная ставка обязана остаться убранной. Если
 * ставку раздавать «при каждом сохранении ролей», то команда «убрать ставку»
 * перестаёт что-либо значить — директор снимает её, назначает человеку вдобавок
 * роль менеджера, и ставка возвращается вместе с ней.
 *
 * Отсюда три границы, которые здесь и закрепляются:
 *  1. событие — ПОЯВЛЕНИЕ преподавательской роли, а не её наличие (changeRole);
 *  2. у уволенного (status 'removed') роль в членстве остаётся, и правка ролей
 *     не должна воскрешать ставку, которую снесло увольнение;
 *  3. createUser из раздела «Команда» — основной путь заведения сотрудника, и
 *     он обязан выдавать ставку так же, как createTeacher.
 *
 * И поперёк всего: сбой записи ставки не роняет провизионирование. Не создать
 * ставку — видно в разделе как «Ставка не задана». Не создать сотрудника — провал.
 *
 * Firestore подменён целиком: плоское хранилище «путь документа → данные» с
 * настоящими равенствами в where, поэтому ensureTeacherRate работает здесь
 * по-настоящему — читает умолчание организации, ищет существующие ставки и
 * пишет документ, — а не подменяется заглушкой.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG = 'org-1';
const ADMIN = 'admin-1';

/** Плоское хранилище: полный путь документа → его данные. */
const docs: Record<string, any> = {};
/** Журнал записей — по нему видно, СОЗДАВАЛАСЬ ли ставка, а не только итог. */
const writes: Array<{ path: string; op: 'set' | 'update' | 'create' | 'delete'; data?: any }> = [];
/** Сбой записи ставки: подменяет create(), чтобы проверить устойчивость провизионирования. */
let createFails: Error | null = null;
let autoId = 0;

function docRef(path: string): any {
  const id = path.split('/').pop()!;
  return {
    id,
    get: async () => ({ exists: path in docs, id, data: () => docs[path] }),
    set: async (data: any, opts?: { merge?: boolean }) => {
      writes.push({ path, op: 'set', data });
      docs[path] = opts?.merge ? { ...(docs[path] || {}), ...data } : { ...data };
    },
    update: async (data: any) => {
      writes.push({ path, op: 'update', data });
      docs[path] = { ...(docs[path] || {}), ...data };
    },
    // create(), а не set(): именно им пишет ставку ensureTeacherRate, и повтор
    // обязан упереться в ALREADY_EXISTS, а не затереть назначенную руками.
    create: async (data: any) => {
      if (createFails) throw createFails;
      if (path in docs) {
        const err: any = new Error('already exists');
        err.code = 6;
        throw err;
      }
      writes.push({ path, op: 'create', data });
      docs[path] = { ...data };
    },
    delete: async () => { writes.push({ path, op: 'delete' }); delete docs[path]; },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  };
}

function collectionRef(path: string): any {
  const clauses: Array<[string, any]> = [];
  const ref: any = {
    doc: (docId?: string) => docRef(`${path}/${docId || `auto_${++autoId}`}`),
    where: (field: string, _op: string, value: any) => { clauses.push([field, value]); return ref; },
    limit: () => ref,
    orderBy: () => ref,
    get: async () => {
      const prefix = `${path}/`;
      const rows = Object.keys(docs)
        .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .filter((p) => clauses.every(([f, v]) => docs[p]?.[f] === v));
      return {
        empty: rows.length === 0,
        size: rows.length,
        docs: rows.map((p) => ({ id: p.slice(prefix.length), data: () => docs[p], ref: docRef(p) })),
      };
    },
  };
  return ref;
}

const createAuthUser = vi.fn(async (_p: any) => ({ uid: 'new-uid-1' }));

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: { createUser: (p: any) => createAuthUser(p) },
  adminDb: {
    collection: (name: string) => collectionRef(name),
    batch: () => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: async () => {} }),
    runTransaction: vi.fn(),
  },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/notifications', () => ({
  notifyOrgAdmins: vi.fn().mockResolvedValue(undefined),
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyGroupMembers: vi.fn().mockResolvedValue(undefined),
}));

// Стаб только у verifyAuth: can()/hasRole()/memberHoldsRole() — настоящие,
// как в соседних тестах ручек.
vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn() };
});

import { verifyAuth } from '../utils/auth';
import { handler as membershipsHandler } from '../api-memberships';
import { handler as orgHandler } from '../api-org';
import { ruleDocId } from '../utils/payroll-default-rate';

/** Умолчание организации: двадцать процентов от СОБРАННЫХ денег — как в академии. */
const DEFAULT_COMPONENTS = [{ kind: 'percent_revenue', percent: 2000, base: 'collected' }];

/** Вызывающий: директор организации. */
const director = () => ({
  uid: ADMIN,
  email: 'director@example.com',
  role: 'admin',
  displayName: 'Директор',
  organizationId: ORG,
  planId: 'enterprise',
  aiEnabled: false,
  branchIds: [],
  primaryBranchId: null,
  permissions: { finances: true, settings: true, managers: true, branches: true },
  customRoleId: null,
  rbac: new Set(['team:read', 'team:write', 'teachers:read', 'teachers:write', 'payroll:read', 'payroll:write']),
});

/** Организация с умолчанием (или без него — тогда withDefault: false). */
function seedOrg(withDefault = true) {
  docs[`organizations/${ORG}`] = {
    name: 'Академия',
    planId: 'enterprise',
    ...(withDefault
      ? { payrollDefaultRate: { components: DEFAULT_COMPONENTS, updatedAt: '2026-08-01T00:00:00.000Z', updatedBy: ADMIN } }
      : {}),
  };
}

/** Участник в обоих зеркалах членства — их читают getMembership и getMembershipData. */
function seedMember(uid: string, member: Record<string, any>) {
  docs[`users/${uid}/memberships/${ORG}`] = { userId: uid, status: 'active', ...member };
  docs[`orgMembers/${ORG}/members/${uid}`] = { userId: uid, status: 'active', ...member };
}

const changeRole = (userId: string, roles: string[]) => membershipsHandler({
  httpMethod: 'POST',
  queryStringParameters: { action: 'changeRole' },
  headers: {},
  body: JSON.stringify({ userId, organizationId: ORG, roles }),
} as any, {} as any, () => {}) as Promise<any>;

const createUser = (body: Record<string, any>) => orgHandler({
  httpMethod: 'POST',
  queryStringParameters: { action: 'createUser' },
  headers: {},
  body: JSON.stringify(body),
} as any, {} as any, () => {}) as Promise<any>;

/** Созданные за прогон документы ставок — источник истины «раздали или нет». */
const ratesCreated = () => writes.filter((w) => w.op === 'create' && w.path.startsWith('compensationRules/'));

beforeEach(() => {
  for (const k of Object.keys(docs)) delete docs[k];
  writes.length = 0;
  createFails = null;
  autoId = 0;
  createAuthUser.mockClear();
  createAuthUser.mockResolvedValue({ uid: 'new-uid-1' } as any);
  (verifyAuth as any).mockResolvedValue(director());
  seedOrg();
  // Директор — активный админ организации: changeRole резолвит его роль членством.
  seedMember(ADMIN, { role: 'admin', roles: ['admin'] });
});

describe('changeRole — ставка выдаётся, когда роль преподавателя ПОЯВИЛАСЬ', () => {
  it('менеджеру выдали роль преподавателя — ставка по умолчанию создана', async () => {
    seedMember('user-1', { role: 'manager', roles: ['manager'] });
    docs['users/user-1'] = { displayName: 'Айгуль', activeOrgId: ORG, role: 'manager' };

    const res = await changeRole('user-1', ['manager', 'teacher']);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(true);
    expect(ratesCreated()).toHaveLength(1);
    const rate = docs[`compensationRules/${ruleDocId(ORG, 'user-1')}`];
    expect(rate).toMatchObject({
      teacherId: 'user-1',
      organizationId: ORG,
      components: DEFAULT_COMPONENTS,
      createdBy: ADMIN,
      // След происхождения: ставку никто не назначал руками.
      fromDefault: true,
    });
  });

  it('человеку вообще без членства выдали роль преподавателя — ставка создана', async () => {
    docs['users/user-2'] = { displayName: 'Нурлан', email: 'n@example.com' };

    const res = await changeRole('user-2', ['teacher']);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(true);
    expect(ratesCreated()).toHaveLength(1);
  });
});

describe('changeRole — ставка НЕ воскресает', () => {
  /**
   * Главный тест файла. Редакторы ролей шлют весь набор целиком, поэтому
   * «числится преподавателем» истинно на КАЖДОМ сохранении. Если событием
   * считать наличие роли, а не её появление, то добавление второй роли
   * преподавателю без ставки вернёт ту самую ставку, которую директор снял
   * осознанно, — и «убрать ставку» перестанет что-либо значить.
   */
  it('преподавателю добавили роль менеджера — снятая ставка НЕ возвращается', async () => {
    seedMember('teacher-1', { role: 'teacher', roles: ['teacher'] });
    docs['users/teacher-1'] = { displayName: 'Гульнара', activeOrgId: ORG, role: 'teacher' };
    // Ставки нет намеренно: её сняли руками — ровно та ситуация, которую чинили.

    const res = await changeRole('teacher-1', ['teacher', 'manager']);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(false);
    expect(ratesCreated()).toHaveLength(0);
    // Роли при этом сохранены — отказ касается только ставки.
    expect(docs[`users/teacher-1/memberships/${ORG}`].roles).toEqual(['teacher', 'manager']);
  });

  it('уволенному (status removed) правка ролей ставку не выдаёт', async () => {
    seedMember('fired-1', { role: 'manager', roles: ['manager'], status: 'removed' });
    docs['users/fired-1'] = { displayName: 'Бакыт' };

    const res = await changeRole('fired-1', ['manager', 'teacher']);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(false);
    expect(ratesCreated()).toHaveLength(0);
  });

  it('наставник (mentor) ставки не получает — зарплата считает преподавателем только teacher', async () => {
    seedMember('mentor-1', { role: 'student', roles: ['student'] });
    docs['users/mentor-1'] = { displayName: 'Эрмек' };

    const res = await changeRole('mentor-1', ['mentor']);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(false);
    expect(ratesCreated()).toHaveLength(0);
  });

  it('у организации нет умолчания — ставку не выдумывают, ответ не падает', async () => {
    seedOrg(false);
    seedMember('user-3', { role: 'manager', roles: ['manager'] });
    docs['users/user-3'] = { displayName: 'Азамат' };

    const res = await changeRole('user-3', ['manager', 'teacher']);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(false);
    expect(ratesCreated()).toHaveLength(0);
    expect(docs[`users/user-3/memberships/${ORG}`].roles).toEqual(['manager', 'teacher']);
  });

  it('у преподавателя уже есть своя ставка — её не подменяют умолчанием', async () => {
    docs['compensationRules/manual-rate-1'] = {
      teacherId: 'user-4',
      organizationId: ORG,
      components: [{ kind: 'salary', amount: 5000000 }],
    };
    seedMember('user-4', { role: 'manager', roles: ['manager'] });
    docs['users/user-4'] = { displayName: 'Салтанат' };

    const res = await changeRole('user-4', ['teacher']);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(false);
    expect(ratesCreated()).toHaveLength(0);
    expect(docs['compensationRules/manual-rate-1'].components[0].kind).toBe('salary');
  });
});

describe('createUser (api-org) — основной путь заведения сотрудника из «Команды»', () => {
  const body = (roles: string[]) => ({
    displayName: 'Жанна',
    roles,
    password: 'secret123',
    username: 'zhanna',
    phone: '+996700000000',
  });

  it('сотруднику с ролью преподавателя ставка выдаётся сразу', async () => {
    const res = await createUser(body(['teacher']));

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload.uid).toBe('new-uid-1');
    expect(payload.defaultRateApplied).toBe(true);
    expect(docs[`compensationRules/${ruleDocId(ORG, 'new-uid-1')}`]).toMatchObject({
      teacherId: 'new-uid-1',
      organizationId: ORG,
      components: DEFAULT_COMPONENTS,
      fromDefault: true,
    });
  });

  it('роль преподавателя в наборе из нескольких — ставка тоже выдаётся', async () => {
    const res = await createUser(body(['manager', 'teacher']));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(true);
    expect(ratesCreated()).toHaveLength(1);
  });

  it('менеджеру без преподавательской роли ставку не заводят', async () => {
    const res = await createUser(body(['manager']));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(false);
    expect(ratesCreated()).toHaveLength(0);
  });

  it('без умолчания организации сотрудник заводится, ставки просто нет', async () => {
    seedOrg(false);

    const res = await createUser(body(['teacher']));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(false);
    expect(ratesCreated()).toHaveLength(0);
    expect(docs['users/new-uid-1']).toBeTruthy();
  });
});

describe('сбой записи ставки не роняет провизионирование', () => {
  beforeEach(() => {
    // ensureTeacherRate логирует отказ — глушим, чтобы прогон не шумел.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createFails = new Error('Firestore недоступен');
  });

  it('changeRole: роль выдана, ставки нет, ответ 200 с defaultRateApplied false', async () => {
    seedMember('user-5', { role: 'manager', roles: ['manager'] });
    docs['users/user-5'] = { displayName: 'Данияр', activeOrgId: ORG, role: 'manager' };

    const res = await changeRole('user-5', ['manager', 'teacher']);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(false);
    expect(docs[`users/user-5/memberships/${ORG}`].roles).toEqual(['manager', 'teacher']);
    expect(docs[`orgMembers/${ORG}/members/user-5`].roles).toEqual(['manager', 'teacher']);
    expect(docs[`compensationRules/${ruleDocId(ORG, 'user-5')}`]).toBeUndefined();
  });

  it('createUser: пользователь и членство заведены, ответ 200 с defaultRateApplied false', async () => {
    const res = await createUser({
      displayName: 'Жанна', roles: ['teacher'], password: 'secret123', username: 'zhanna',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultRateApplied).toBe(false);
    expect(docs['users/new-uid-1']).toMatchObject({ displayName: 'Жанна', role: 'teacher' });
    expect(docs[`orgMembers/${ORG}/members/new-uid-1`]).toMatchObject({ roles: ['teacher'], status: 'active' });
    expect(docs[`compensationRules/${ruleDocId(ORG, 'new-uid-1')}`]).toBeUndefined();
  });
});
