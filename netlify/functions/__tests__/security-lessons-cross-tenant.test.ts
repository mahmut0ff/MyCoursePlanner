/**
 * Уроки и материалы чужой организации — две ручки, через которые до них дотягивались.
 *
 * api-transfers. `orgId` заявки на перенос (request_transfer) приходил телом и с
 * членством не сверялся. Если в организации не было активных админов, заявка уходила
 * самому автору, и он же её одобрял (resolve_transfer). А одобрение верило заявке
 * целиком, хотя это документ уведомления, который получатель может переписать через
 * Firestore (правила дают ему любое поле): решал тот, кому пришло, за того, кто записан.
 *
 * api-lessons GET. По `?id=` сотрудник ЛЮБОЙ организации получал любой урок — проверка
 * организации шла только для учеников; по `?groupId=` уроки с этой группой отдавались
 * вовсе без проверки.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: { collection: vi.fn(), batch: vi.fn() },
  getDocsByIds: vi.fn().mockResolvedValue({}),
}));

// Членство проверяют настоящие resolveOrgGrants / resolveOrgRole — поверх Firestore
// в памяти. Подменяется только разбор токена.
vi.mock('../utils/auth', async () => {
  const actual = await vi.importActual<any>('../utils/auth');
  return { ...actual, verifyAuth: vi.fn() };
});

vi.mock('../utils/notifications', () => ({ notifyOrgStudents: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../utils/teacher-activity', () => ({ recordTeacherActivity: vi.fn().mockResolvedValue(undefined) }));

// arrayUnion — маркер, который фейковый update ниже разворачивает в дописывание.
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { arrayUnion: (...items: any[]) => ({ __arrayUnion: items }) },
}));

import { adminDb } from '../utils/firebase-admin';
import { verifyAuth, resetAuthCaches } from '../utils/auth';
import type { AuthUser } from '../utils/auth';
import { handler as transfersHandler } from '../api-transfers';
import { handler as lessonsHandler } from '../api-lessons';

type Row = Record<string, any>;
type Store = Record<string, Map<string, Row>>;
type Filter = [field: string, op: string, value: any];

/**
 * Firestore в памяти: коллекции по путям (подколлекция — `orgMembers/org-1/members`),
 * цепочки where (==, in, array-contains) и limit, точечные пути и arrayUnion в update,
 * батч на commit().
 */
function makeDb(seed: Record<string, Row[]>): Store {
  const store: Store = {};
  for (const [path, rows] of Object.entries(seed)) {
    store[path] = new Map(rows.map((r) => [r.id, JSON.parse(JSON.stringify(r))]));
  }
  const col = (path: string) => (store[path] ??= new Map());
  const read = (row: Row, field: string) => field.split('.').reduce((v, k) => v?.[k], row);
  const matches = (row: Row, [field, op, value]: Filter) => {
    const v = read(row, field);
    if (op === '==') return v === value;
    if (op === 'in') return value.includes(v);
    if (op === 'array-contains') return Array.isArray(v) && v.includes(value);
    throw new Error(`fake Firestore: unsupported operator ${op}`);
  };

  let autoId = 0;
  const docRef = (path: string, id: string): any => ({
    id,
    get: async () => ({ exists: col(path).has(id), id, data: () => col(path).get(id) }),
    set: async (data: Row, opts?: { merge?: boolean }) => {
      col(path).set(id, { ...(opts?.merge ? col(path).get(id) : undefined), id, ...data });
    },
    update: async (patch: Row) => {
      const row = col(path).get(id);
      if (!row) throw new Error(`NOT_FOUND: ${path}/${id}`);
      for (const [key, value] of Object.entries(patch)) {
        const keys = key.split('.');
        const last = keys.pop()!;
        const target = keys.reduce((o, k) => (o[k] ??= {}), row);
        target[last] = value?.__arrayUnion ? [...(target[last] || []), ...value.__arrayUnion] : value;
      }
    },
    collection: (sub: string) => collectionRef(`${path}/${id}/${sub}`),
  });
  const query = (path: string, filters: Filter[], max = Infinity): any => ({
    where: (field: string, op: string, value: any) => query(path, [...filters, [field, op, value]], max),
    orderBy: () => query(path, filters, max),
    limit: (n: number) => query(path, filters, n),
    get: async () => {
      const rows = [...col(path).values()].filter((r) => filters.every((f) => matches(r, f))).slice(0, max);
      return { empty: rows.length === 0, docs: rows.map((r) => ({ id: r.id, ref: docRef(path, r.id), data: () => r })) };
    },
  });
  const collectionRef = (path: string): any => ({
    ...query(path, []),
    doc: (id?: string) => docRef(path, id ?? `auto-${++autoId}`),
    add: async (data: Row) => {
      const ref = docRef(path, `auto-${++autoId}`);
      await ref.set(data);
      return ref;
    },
  });

  (adminDb.collection as any).mockImplementation((path: string) => collectionRef(path));
  (adminDb.batch as any).mockImplementation(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (ref: any, data: Row) => { ops.push(() => ref.set(data)); },
      update: (ref: any, data: Row) => { ops.push(() => ref.update(data)); },
      commit: async () => { for (const op of ops) await op(); },
    };
  });
  return store;
}

const MEMBERS: Array<[orgId: string, uid: string, role: string, status?: string]> = [
  ['org-1', 'owner-1', 'owner'],
  ['org-1', 'admin-1', 'admin'],
  ['org-1', 'manager-1', 'manager'],
  ['org-1', 'teacher-1', 'teacher'],
  ['org-1', 'student-1', 'student'],
  ['org-1', 'ex-admin-1', 'admin', 'removed'],
  ['org-1', 'ex-teacher-1', 'teacher', 'removed'],
  ['org-1', 'dual-1', 'manager'], // менеджер здесь, а работает сейчас в org-2
  ['org-2', 'dual-1', 'teacher'],
  ['org-2', 'admin-2', 'admin'],
  ['org-2', 'teacher-2', 'teacher'],
  ['org-3', 'teacher-3', 'teacher'], // организация без активных админов
  ['org-4', 'owner-4', 'owner'], // организация из одного владельца
];

const LESSONS: Row[] = [
  { id: 'org1-lesson', organizationId: 'org-1', authorId: 'teacher-1', title: 'Present Perfect', status: 'published', groupIds: ['g1'], createdAt: '2026-10-01' },
  { id: 'org1-draft', organizationId: 'org-1', authorId: 'teacher-1', title: 'Черновик', status: 'draft', groupIds: ['g1'], createdAt: '2026-10-02' },
  { id: 'org2-lesson', organizationId: 'org-2', authorId: 'teacher-2', title: 'Чужой урок', status: 'published', groupIds: ['g2'], createdAt: '2026-10-03' },
  // Урок другой организации с тем же id группы — скажем, скопированный вместе с groupIds.
  { id: 'org2-copy', organizationId: 'org-2', authorId: 'teacher-2', title: 'Копия с группой g1', status: 'published', groupIds: ['g1'], createdAt: '2026-10-04' },
  { id: 'org3-lesson', organizationId: 'org-3', authorId: 'teacher-3', title: 'Урок без админов', status: 'published', groupIds: [], createdAt: '2026-10-05' },
  { id: 'org4-lesson', organizationId: 'org-4', authorId: 'owner-4', title: 'Урок владельца', status: 'published', groupIds: [], createdAt: '2026-10-06' },
  { id: 'personal-t1', organizationId: null, authorId: 'teacher-1', title: 'Мой личный', status: 'draft', groupIds: [], createdAt: '2026-10-07' },
  // Личный урок, привязанный к группе чужой организации: id группы ничего не доказывает.
  { id: 'personal-t2', organizationId: '', authorId: 'teacher-2', title: 'Чужой личный', status: 'published', groupIds: ['g1'], createdAt: '2026-10-08' },
];

/**
 * Мир для всех случаев. Членство лежит в двух местах — у пользователя и зеркалом у
 * организации, — кладём в оба. Уроки — под обоими именами коллекции, которые читал
 * api-transfers (`lessons` и `lessonPlans`): случаи здесь о том, КТО вправе, а не о
 * том, где лежат уроки.
 */
function world(extra: Record<string, Row[]> = {}): Store {
  const seed: Record<string, Row[]> = {
    organizations: ['org-1', 'org-2', 'org-3', 'org-4'].map((id) => ({ id, name: id })),
    users: [{ id: 'super-1', role: 'super_admin' }],
    materials: [{ id: 'org2-mat', organizationId: 'org-2', title: 'Чужой материал', url: 'https://cdn.example/secret.pdf' }],
    lessons: LESSONS,
    lessonPlans: LESSONS,
    notifications: [],
    ...extra,
  };
  for (const [orgId, uid, role, status = 'active'] of MEMBERS) {
    const member = { id: uid, userId: uid, organizationId: orgId, role, status };
    (seed[`orgMembers/${orgId}/members`] ??= []).push(member);
    (seed[`users/${uid}/memberships`] ??= []).push({ ...member, id: orgId });
  }
  return makeDb(seed);
}

const asUser = (uid: string, role: AuthUser['role'], organizationId: string | null) => {
  (verifyAuth as any).mockResolvedValue({
    uid, role, organizationId, email: `${uid}@academy.kg`, displayName: uid,
    planId: null, aiEnabled: false, branchIds: [], primaryBranchId: null,
    permissions: {}, customRoleId: null, rbac: new Set<string>(),
  });
};

const transfer = (action: 'request_transfer' | 'resolve_transfer', body: Row): Promise<any> =>
  transfersHandler({ httpMethod: 'POST', headers: {}, queryStringParameters: { action }, body: JSON.stringify(body) } as any, {} as any) as any;

const getLessons = (params: Record<string, string>): Promise<any> =>
  lessonsHandler({ httpMethod: 'GET', headers: {}, queryStringParameters: params, body: null } as any, {} as any) as any;

const bodyOf = (res: any) => JSON.parse(res.body);

const requestLesson = (orgId: string, sourceId: string) => ({
  transferType: 'lesson_to_personal', sourceId, targetId: 'personal', orgId, sourceTitle: 'Урок',
});

/** Заявка в том виде, в каком её пишет request_transfer — или в какой её переписал получатель. */
const pending = (id: string, recipientId: string, meta: Row) => ({
  id, type: 'transfer_request', recipientId, read: false, createdAt: '2026-10-14T00:00:00.000Z',
  metadata: {
    requestId: `rq-${id}`, transferType: 'lesson_to_personal', targetId: 'personal',
    sourceTitle: 'Урок', requesterEmail: 'someone@academy.kg', status: 'pending', ...meta,
  },
});

/** Личные копии уроков, которые получил пользователь, — в какой бы коллекции они ни оказались. */
const personalCopiesOf = (store: Store, uid: string) =>
  [...(store.lessons?.values() ?? []), ...(store.lessonPlans?.values() ?? [])]
    .filter((l) => l.authorId === uid && !l.organizationId && String(l.title).endsWith('(Копия)'));

/** Обе коллекции уроков целиком: отказ не должен в них ничего записать. */
const lessonsSnapshot = (store: Store) =>
  JSON.stringify([store.lessons, store.lessonPlans].map((m) => [...(m?.entries() ?? [])]));

const ids = (res: any) => bodyOf(res).map((l: Row) => l.id);

describe('Security: lessons and materials of another organization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthCaches();
  });

  describe('api-transfers [POST request_transfer]', () => {
    it('S-API-05: naming an organization the caller does not belong to is refused, and its admins hear nothing', async () => {
      const store = world();
      asUser('teacher-1', 'teacher', 'org-1');

      const res = await transfer('request_transfer', requestLesson('org-2', 'org2-lesson'));

      expect(res.statusCode).toBe(403);
      expect(store.notifications.size).toBe(0);
    });

    it('S-API-06: an outsider can no longer self-approve a copy from an organization that has no active admins', async () => {
      // The reported chain: name such an org → the request comes back to yourself →
      // approve it. Both ends are cut: no such request is created any more, and the
      // ones the old fallback already created can't be approved by their author.
      const stale = pending('stale', 'teacher-1', { requesterId: 'teacher-1', orgId: 'org-3', sourceId: 'org3-lesson' });
      const store = world({ notifications: [stale] });
      const before = lessonsSnapshot(store);
      asUser('teacher-1', 'teacher', 'org-1');

      const req = await transfer('request_transfer', requestLesson('org-3', 'org3-lesson'));
      const approve = await transfer('resolve_transfer', { notificationId: 'stale', decision: 'approve' });

      expect(req.statusCode).toBe(403);
      expect([...store.notifications.keys()]).toEqual(['stale']);
      expect(approve.statusCode).toBe(403);
      expect(lessonsSnapshot(store)).toBe(before);
      expect(store.notifications.get('stale')!.metadata.status).toBe('pending');
    });

    it("sends a member's request to the org's active owner, admins and managers — and to no one else", async () => {
      const store = world();
      asUser('teacher-1', 'teacher', 'org-1');

      const res = await transfer('request_transfer', requestLesson('org-1', 'org1-lesson'));

      expect(res.statusCode).toBe(200);
      const sent = [...store.notifications.values()];
      expect(sent.map((n) => n.recipientId).sort()).toEqual(['admin-1', 'dual-1', 'manager-1', 'owner-1']);
      expect(sent.every((n) => n.metadata.requestId === bodyOf(res).requestId && n.metadata.orgId === 'org-1')).toBe(true);
    });

    it('a member of an organization with no approver gets a refusal, not a request addressed to themself', async () => {
      const store = world();
      asUser('teacher-3', 'teacher', 'org-3');

      const res = await transfer('request_transfer', requestLesson('org-3', 'org3-lesson'));

      expect(res.statusCode).toBe(409);
      expect(store.notifications.size).toBe(0);
    });

    it('a solo owner still receives — and can approve — their own request', async () => {
      const store = world();
      asUser('owner-4', 'admin', 'org-4');

      const req = await transfer('request_transfer', requestLesson('org-4', 'org4-lesson'));
      const sent = [...store.notifications.values()];
      const res = await transfer('resolve_transfer', { notificationId: sent[0].id, decision: 'approve' });

      expect(req.statusCode).toBe(200);
      expect(sent.map((n) => n.recipientId)).toEqual(['owner-4']);
      expect(res.statusCode).toBe(200);
      expect(personalCopiesOf(store, 'owner-4')).toHaveLength(1);
    });
  });

  describe('api-transfers [POST resolve_transfer]', () => {
    it.each([
      ['a lesson of another organization', { orgId: 'org-2', sourceId: 'org2-lesson' }],
      ['a lesson of their own organization', { orgId: 'org-1', sourceId: 'org1-lesson' }],
      ['a material of another organization', { orgId: 'org-2', sourceId: 'org2-mat', transferType: 'material_to_lesson', targetId: 'personal-t1' }],
    ])('S-API-07: a notification its recipient rewrote into a request cannot approve %s', async (_label, meta) => {
      // The rules let a recipient write any field of their own notification, so any
      // notice they received can become a "pending request" with metadata of their choice.
      const store = world({ notifications: [pending('forged', 'teacher-1', { requesterId: 'teacher-1', ...meta })] });
      const before = lessonsSnapshot(store);
      asUser('teacher-1', 'teacher', 'org-1');

      const res = await transfer('resolve_transfer', { notificationId: 'forged', decision: 'approve' });

      expect(res.statusCode).toBe(403);
      expect(lessonsSnapshot(store)).toBe(before);
    });

    it("S-API-08: an admin cannot approve a request naming an organization they don't administer", async () => {
      const store = world({ notifications: [pending('req', 'admin-1', { requesterId: 'teacher-1', orgId: 'org-2', sourceId: 'org2-lesson' })] });
      const before = lessonsSnapshot(store);
      asUser('admin-1', 'admin', 'org-1');

      const res = await transfer('resolve_transfer', { notificationId: 'req', decision: 'approve' });

      expect(res.statusCode).toBe(403);
      expect(lessonsSnapshot(store)).toBe(before);
    });

    it.each([
      ['an outsider (a request sent before membership was checked)', 'teacher-2'],
      ['a member who has since been removed', 'ex-teacher-1'],
    ])('S-API-09: approval does not copy the org’s lesson for %s', async (_label, requesterId) => {
      const store = world({ notifications: [pending('req', 'admin-1', { requesterId, orgId: 'org-1', sourceId: 'org1-lesson' })] });
      const before = lessonsSnapshot(store);
      asUser('admin-1', 'admin', 'org-1');

      const res = await transfer('resolve_transfer', { notificationId: 'req', decision: 'approve' });

      expect(res.statusCode).toBe(400);
      expect(bodyOf(res).error).toMatch(/не состоит/);
      expect(lessonsSnapshot(store)).toBe(before);
      expect(store.notifications.get('req')!.metadata.status).toBe('pending');
    });

    it("an admin approves a member's request: the copy lands in the member's personal space", async () => {
      const store = world({ notifications: [pending('req', 'admin-1', { requesterId: 'teacher-1', orgId: 'org-1', sourceId: 'org1-lesson' })] });
      asUser('admin-1', 'admin', 'org-1');

      const res = await transfer('resolve_transfer', { notificationId: 'req', decision: 'approve' });

      expect(res.statusCode).toBe(200);
      expect(personalCopiesOf(store, 'teacher-1')).toEqual([
        expect.objectContaining({ title: 'Present Perfect (Копия)', status: 'draft' }),
      ]);
      expect(store.notifications.get('req')!.metadata.status).toBe('approved');
    });

    it('an approver working in another of their organizations can still approve — standing is read for the request’s org', async () => {
      const store = world({ notifications: [pending('req', 'dual-1', { requesterId: 'teacher-1', orgId: 'org-1', sourceId: 'org1-lesson' })] });
      asUser('dual-1', 'teacher', 'org-2');

      const res = await transfer('resolve_transfer', { notificationId: 'req', decision: 'approve' });

      expect(res.statusCode).toBe(200);
      expect(personalCopiesOf(store, 'teacher-1')).toHaveLength(1);
    });

    it('a request from someone no longer in the organization can still be rejected', async () => {
      const store = world({ notifications: [pending('req', 'admin-1', { requesterId: 'ex-teacher-1', orgId: 'org-1', sourceId: 'org1-lesson' })] });
      asUser('admin-1', 'admin', 'org-1');

      const res = await transfer('resolve_transfer', { notificationId: 'req', decision: 'reject' });

      expect(res.statusCode).toBe(200);
      expect(store.notifications.get('req')!.metadata.status).toBe('rejected');
    });
  });

  describe('api-lessons [GET]', () => {
    it.each(['teacher', 'manager', 'admin'] as const)("S-API-10: an org-1 %s cannot read an org-2 lesson by id", async (role) => {
      world();
      asUser(`${role}-1`, role, 'org-1');

      const res = await getLessons({ id: 'org2-lesson' });

      expect(res.statusCode).toBe(403);
      expect(res.body).not.toContain('Чужой урок');
    });

    it.each([
      ['staff of an org', 'teacher-1', 'teacher', 'org-1'],
      ['a teacher in personal mode', 'teacher-1', 'teacher', null],
      ['a student', 'student-1', 'student', 'org-1'],
    ] as const)("S-API-11: someone else's personal lesson is not readable by %s", async (_label, uid, role, orgId) => {
      world();
      asUser(uid, role, orgId);

      const res = await getLessons({ id: 'personal-t2' });

      expect(res.statusCode).toBe(403);
    });

    it("S-API-12: a student with no active organization cannot read an organization's published lesson", async () => {
      world();
      asUser('student-x', 'student', null);

      const res = await getLessons({ id: 'org1-lesson' });

      expect(res.statusCode).toBe(403);
    });

    it("S-API-13: ?groupId= with another organization's group returns none of its lessons", async () => {
      world();
      asUser('teacher-1', 'teacher', 'org-1');

      const res = await getLessons({ groupId: 'g2' });

      expect(res.statusCode).toBe(200);
      expect(bodyOf(res)).toEqual([]);
    });

    it("S-API-14: ?groupId= returns only the caller's own organization's lessons, whatever else carries that group id", async () => {
      world();

      asUser('teacher-1', 'teacher', 'org-1');
      const staff = await getLessons({ groupId: 'g1' });
      asUser('student-1', 'student', 'org-1');
      const student = await getLessons({ groupId: 'g1' });

      expect(ids(staff)).toEqual(['org1-draft', 'org1-lesson']);
      expect(ids(student)).toEqual(['org1-lesson']);
    });

    it("staff read their own organization's lessons by id, drafts included; a student gets 404 for a draft", async () => {
      world();

      asUser('teacher-1', 'teacher', 'org-1');
      const staffDraft = await getLessons({ id: 'org1-draft' });
      asUser('student-1', 'student', 'org-1');
      const studentPublished = await getLessons({ id: 'org1-lesson' });
      const studentDraft = await getLessons({ id: 'org1-draft' });

      expect(staffDraft.statusCode).toBe(200);
      expect(studentPublished.statusCode).toBe(200);
      expect(studentDraft.statusCode).toBe(404);
    });

    it.each([['in personal mode', null], ['while working in an organization', 'org-1']] as const)(
      'an author reads their own personal lesson %s',
      async (_label, orgId) => {
        world();
        asUser('teacher-1', 'teacher', orgId);

        const res = await getLessons({ id: 'personal-t1' });

        expect(res.statusCode).toBe(200);
        expect(bodyOf(res).title).toBe('Мой личный');
      },
    );

    it('a super admin still reads across organizations', async () => {
      world();
      asUser('super-1', 'super_admin', null);

      const byId = await getLessons({ id: 'org2-lesson' });
      const personal = await getLessons({ id: 'personal-t2' });
      const byGroup = await getLessons({ groupId: 'g1' });

      expect(byId.statusCode).toBe(200);
      expect(personal.statusCode).toBe(200);
      expect(ids(byGroup)).toEqual(['personal-t2', 'org2-copy', 'org1-draft', 'org1-lesson']);
    });
  });
});
