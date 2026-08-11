/**
 * Отчисление, восстановление и удаление участника спрашивают ГРАНТ, а не роль.
 *
 * Три эти ручки были единственным местом в ростере, которое так и осталось на
 * захардкоженном списке ['admin','owner','manager']. Из-за этого весь RBAC мимо
 * них проходил впустую: директор выдавал сотруднику в /team роль с «Студенты:
 * удаление», интерфейс честно показывал «Отчислить» (клиент-то смотрит грант), а
 * сервер отвечал 403 «Forbidden — insufficient role». Право было, действие — нет.
 *
 * Здесь проверяется именно граница: что грант теперь работает, что он НЕ
 * подменяет «ведение контингента», и что правом на контингент нельзя дотянуться
 * до владельца и до руководства организации.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Плоское хранилище «путь документа → данные». */
const docs: Record<string, any> = {};
const updated: Array<{ path: string; data: any }> = [];
const deleted: string[] = [];

function docRef(path: string): any {
  return {
    id: path.split('/').pop(),
    get: async () => ({ exists: path in docs, id: path.split('/').pop(), data: () => docs[path] }),
    update: async (data: any) => { updated.push({ path, data }); docs[path] = { ...docs[path], ...data }; },
    set: async (data: any) => { docs[path] = { ...(docs[path] || {}), ...data }; },
    delete: async () => { deleted.push(path); delete docs[path]; },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  };
}

function collectionRef(path: string): any {
  const ref: any = {
    doc: (id: string) => docRef(`${path}/${id}`),
    where: () => ref,
    limit: () => ref,
    // Ни один запрос в этих сценариях не должен ничего находить: ставок
    // преподавателя и счетов у тестовых участников нет.
    get: async () => ({ docs: [], empty: true }),
  };
  return ref;
}

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: (name: string) => collectionRef(name),
    batch: () => ({ update: vi.fn(), delete: vi.fn(), commit: async () => {} }),
  },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/notifications', () => ({ notifyOrgAdmins: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../utils/auth', async () => {
  const actual = await vi.importActual<any>('../utils/auth');
  return { ...actual, verifyAuth: vi.fn() };
});

import { verifyAuth } from '../utils/auth';
import { handler } from '../api-memberships';

const ORG = 'org-1';

/** Вызывающий: роль в приложении + резолвнутый набор грантов, как его отдаёт verifyAuth. */
const caller = (role: string, grants: string[]) => ({
  uid: 'caller-1',
  email: 'staff@example.com',
  role,
  displayName: 'Сотрудник',
  organizationId: ORG,
  planId: 'pro',
  aiEnabled: false,
  branchIds: [],
  primaryBranchId: null,
  permissions: { finances: false, settings: false, managers: false, branches: false },
  customRoleId: 'custom-role-1',
  rbac: new Set(grants),
});

/** Кладём участника в оба зеркала членства — их читает getMembership. */
function seedMember(uid: string, member: Record<string, any>) {
  docs[`users/${uid}/memberships/${ORG}`] = { status: 'active', ...member };
  docs[`orgMembers/${ORG}/members/${uid}`] = { status: 'active', ...member };
}

const post = (action: string, userId: string) => handler({
  httpMethod: 'POST',
  queryStringParameters: { action },
  headers: {},
  body: JSON.stringify({ userId, organizationId: ORG }),
} as any, {} as any, () => {}) as Promise<any>;

// Преподаватель-куратор: ведёт контингент всей организации и вправе отчислять.
const CURATOR = ['students:read', 'students:write', 'students:delete', 'roster_management:write'];

beforeEach(() => {
  for (const k of Object.keys(docs)) delete docs[k];
  updated.length = 0;
  deleted.length = 0;
});

describe('remove (отчисление) — грант вместо названия роли', () => {
  it('преподаватель с кастомной ролью «студенты: удаление» отчисляет — это и был баг', async () => {
    (verifyAuth as any).mockResolvedValue(caller('teacher', CURATOR));
    seedMember('student-1', { role: 'student' });

    const res = await post('remove', 'student-1');

    expect(res.statusCode).toBe(200);
    expect(docs[`orgMembers/${ORG}/members/student-1`].status).toBe('expelled');
    expect(docs[`users/student-1/memberships/${ORG}`].status).toBe('expelled');
  });

  it('менеджер по роли — по-прежнему да (поведение существующих ролей не меняется)', async () => {
    (verifyAuth as any).mockResolvedValue(caller('manager', ['students:read', 'students:write', 'students:delete']));
    seedMember('student-1', { role: 'student' });

    expect((await post('remove', 'student-1')).statusCode).toBe(200);
  });

  it('без students:delete — 403, даже если правка студентов разрешена', async () => {
    (verifyAuth as any).mockResolvedValue(caller('teacher', ['students:read', 'students:write', 'roster_management:write']));
    seedMember('student-1', { role: 'student' });

    const res = await post('remove', 'student-1');

    expect(res.statusCode).toBe(403);
    expect(docs[`orgMembers/${ORG}/members/student-1`].status).toBe('active');
  });

  it('без «ведения контингента» — 403: грант не решает, НА КОГО он распространяется', async () => {
    (verifyAuth as any).mockResolvedValue(caller('teacher', ['students:read', 'students:write', 'students:delete']));
    seedMember('student-1', { role: 'student' });

    expect((await post('remove', 'student-1')).statusCode).toBe(403);
  });

  it('отказ называет недостающую галочку, а не просто «недостаточно прав»', async () => {
    (verifyAuth as any).mockResolvedValue(caller('teacher', ['students:read', 'students:write', 'roster_management:write']));
    seedMember('student-1', { role: 'student' });

    const missingGrant = JSON.parse((await post('remove', 'student-1')).body).error;
    expect(missingGrant).toContain('Студенты');
    expect(missingGrant).toContain('удаление');

    (verifyAuth as any).mockResolvedValue(caller('teacher', ['students:read', 'students:write', 'students:delete']));
    const missingScope = JSON.parse((await post('remove', 'student-1')).body).error;
    expect(missingScope).toContain('Контингент');
  });

  it('преподавателя закрывает раздел «Преподаватели», а не «Студенты»', async () => {
    (verifyAuth as any).mockResolvedValue(caller('teacher', CURATOR));
    seedMember('teacher-2', { role: 'teacher' });

    expect((await post('remove', 'teacher-2')).statusCode).toBe(403);

    (verifyAuth as any).mockResolvedValue(caller('teacher', [...CURATOR, 'teachers:delete']));
    expect((await post('remove', 'teacher-2')).statusCode).toBe(200);
    expect(docs[`orgMembers/${ORG}/members/teacher-2`].status).toBe('removed');
  });

  it('правом на контингент нельзя дотянуться до руководства', async () => {
    (verifyAuth as any).mockResolvedValue(caller('manager', CURATOR));
    // Мульти-ролевой админ, которому вдобавок выдали роль студента: судьбу решает
    // старшая роль, иначе «Студенты: удаление» снимало бы админа.
    seedMember('admin-2', { role: 'student', roles: ['student', 'admin'] });

    expect((await post('remove', 'admin-2')).statusCode).toBe(403);

    (verifyAuth as any).mockResolvedValue(caller('manager', [...CURATOR, 'team:delete']));
    expect((await post('remove', 'admin-2')).statusCode).toBe(200);
  });

  it('владельца не убирает никто — включая мульти-ролевого владельца', async () => {
    (verifyAuth as any).mockResolvedValue(caller('admin', ['team:delete', 'students:delete']));
    seedMember('owner-1', { role: 'teacher', roles: ['teacher', 'owner'] });

    const res = await post('remove', 'owner-1');

    expect(res.statusCode).toBe(400);
    expect(docs[`orgMembers/${ORG}/members/owner-1`].status).toBe('active');
  });
});

describe('restore (восстановление) — это write, а не delete', () => {
  it('хватает права на правку студентов: восстановление ничего не разрушает', async () => {
    (verifyAuth as any).mockResolvedValue(caller('teacher', ['students:read', 'students:write', 'roster_management:write']));
    seedMember('student-1', { role: 'student', status: 'expelled' });

    const res = await post('restore', 'student-1');

    expect(res.statusCode).toBe(200);
    expect(docs[`orgMembers/${ORG}/members/student-1`].status).toBe('active');
  });

  it('только чтение — 403', async () => {
    (verifyAuth as any).mockResolvedValue(caller('teacher', ['students:read', 'roster_management:write']));
    seedMember('student-1', { role: 'student', status: 'expelled' });

    expect((await post('restore', 'student-1')).statusCode).toBe(403);
  });
});

describe('delete (полное удаление)', () => {
  it('спрашивает students:delete и сносит оба зеркала членства', async () => {
    (verifyAuth as any).mockResolvedValue(caller('teacher', CURATOR));
    seedMember('student-1', { role: 'student', status: 'expelled' });

    const res = await post('delete', 'student-1');

    expect(res.statusCode).toBe(200);
    expect(deleted).toContain(`users/student-1/memberships/${ORG}`);
    expect(deleted).toContain(`orgMembers/${ORG}/members/student-1`);
  });

  it('без гранта — 403 и ни одного удаления', async () => {
    (verifyAuth as any).mockResolvedValue(caller('teacher', ['students:read', 'students:write', 'roster_management:write']));
    seedMember('student-1', { role: 'student', status: 'expelled' });

    expect((await post('delete', 'student-1')).statusCode).toBe(403);
    expect(deleted).toHaveLength(0);
  });
});
