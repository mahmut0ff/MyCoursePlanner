/**
 * Одобрение заявки на перенос (api-transfers, action=resolve_transfer).
 *
 * До 14.10.2026 оба пути читали коллекцию `lessons`, которой нет, и любое
 * одобрение заканчивалось «урок не найден». Теперь уроки читаются и пишутся в
 * `lessonPlans` — и путь впервые реально копирует, поэтому закреплено ещё и то,
 * ЧТО он копирует: материал или урок той организации, чей админ одобряет, и
 * только в собственный личный урок автора заявки.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/firebase-admin', () => ({ adminDb: { collection: vi.fn(), batch: vi.fn() } }));

vi.mock('../utils/auth', () => ({
  verifyAuth: vi.fn(),
  // The approval checks (approver's and requester's live membership) pass here;
  // security-lessons-cross-tenant.test.ts covers them failing.
  resolveOrgGrants: vi.fn().mockResolvedValue({ role: 'admin' }),
  resolveOrgRole: vi.fn().mockResolvedValue({ role: 'teacher' }),
  forbidden: (msg?: string) => ({ statusCode: 403, body: JSON.stringify({ error: msg || 'Forbidden' }) }),
  ok: (body: any) => ({ statusCode: 200, body: JSON.stringify(body) }),
  badRequest: (msg: string) => ({ statusCode: 400, body: JSON.stringify({ error: msg }) }),
  unauthorized: () => ({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }),
  jsonResponse: (status: number, body: any) => ({ statusCode: status, body: JSON.stringify(body) }),
}));

// arrayUnion — маркер, который фейковый update ниже разворачивает в дописывание.
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { arrayUnion: (...items: any[]) => ({ __arrayUnion: items }) },
}));

import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';
import { handler } from '../api-transfers';

/** Firestore в памяти: документы по коллекциям, точечные пути в update, батч на commit(). */
function makeDb(seed: Record<string, any[]>) {
  const store: Record<string, Map<string, any>> = {};
  for (const [name, rows] of Object.entries(seed)) {
    store[name] = new Map(rows.map((r) => [r.id, JSON.parse(JSON.stringify(r))]));
  }
  const col = (name: string) => (store[name] ??= new Map());
  const read = (row: any, field: string) => field.split('.').reduce((v, k) => v?.[k], row);

  let autoId = 0;
  const docRef = (name: string, id: string): any => ({
    id,
    get: async () => ({ exists: col(name).has(id), id, data: () => col(name).get(id) }),
    set: async (data: any) => { col(name).set(id, { id, ...data }); },
    update: async (patch: Record<string, any>) => {
      const row = col(name).get(id);
      if (!row) throw new Error(`NOT_FOUND: ${name}/${id}`);
      for (const [key, value] of Object.entries(patch)) {
        const path = key.split('.');
        const last = path.pop()!;
        const target = path.reduce((o, k) => (o[k] ??= {}), row);
        target[last] = value?.__arrayUnion ? [...(target[last] || []), ...value.__arrayUnion] : value;
      }
    },
  });

  (adminDb.collection as any).mockImplementation((name: string) => ({
    doc: (id?: string) => docRef(name, id ?? `auto-${++autoId}`),
    add: async (data: any) => {
      const ref = docRef(name, `auto-${++autoId}`);
      await ref.set(data);
      return ref;
    },
    where: (field: string, _op: string, value: any) => ({
      get: async () => {
        const rows = [...col(name).values()].filter((r) => read(r, field) === value);
        return { docs: rows.map((r) => ({ id: r.id, ref: docRef(name, r.id), data: () => r })) };
      },
    }),
  }));

  (adminDb.batch as any).mockImplementation(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (ref: any, data: any) => { ops.push(() => ref.set(data)); },
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      commit: async () => { for (const op of ops) await op(); },
    };
  });

  return store;
}

/** Заявка преподавателя `teacher-1`, адресованная админу `admin-1` организации `org-1`. */
const request = (metadata: Record<string, any>) => ({
  id: 'req-1',
  type: 'transfer_request',
  recipientId: 'admin-1',
  read: false,
  metadata: {
    requestId: 'rq-1', requesterId: 'teacher-1', requesterEmail: 'teacher@academy.kg',
    orgId: 'org-1', status: 'pending', sourceTitle: 'Present Perfect', ...metadata,
  },
});

const seed = (req: any) => ({
  notifications: [req],
  materials: [
    { id: 'mat-1', organizationId: 'org-1', title: 'Неправильные глаголы', url: 'https://cdn.example/verbs.pdf', mimeType: 'application/pdf', sizeBytes: 2048 },
    { id: 'mat-foreign', organizationId: 'org-2', title: 'Чужой материал', url: 'https://cdn.example/secret.pdf' },
  ],
  lessonPlans: [
    { id: 'personal-1', authorId: 'teacher-1', organizationId: null, title: 'Мой урок', attachments: [] },
    { id: 'personal-other', authorId: 'teacher-2', organizationId: null, title: 'Чужой личный урок', attachments: [] },
    { id: 'own-org-lesson', authorId: 'teacher-1', organizationId: 'org-1', title: 'Мой урок в академии', attachments: [] },
    {
      id: 'org-lesson', authorId: 'teacher-2', organizationId: 'org-1', branchId: 'b-1', title: 'Present Perfect',
      status: 'published', groupIds: ['g1'], groupNames: ['A2'],
      homework: { title: 'Упражнение 5', description: 'Письменно' },
    },
    { id: 'foreign-lesson', authorId: 'teacher-9', organizationId: 'org-2', title: 'Чужой урок', status: 'published' },
  ],
});

const approve = () => handler({
  httpMethod: 'POST',
  headers: {},
  queryStringParameters: { action: 'resolve_transfer' },
  body: JSON.stringify({ notificationId: 'req-1', decision: 'approve' }),
} as any, {} as any);

const errorOf = (res: any) => JSON.parse(res.body).error;

beforeEach(() => {
  vi.clearAllMocks();
  (verifyAuth as any).mockResolvedValue({ uid: 'admin-1', role: 'admin', organizationId: 'org-1', email: 'admin@academy.kg' });
});

describe('resolve_transfer — material into a personal lesson', () => {
  it('attaches the material to the requester’s lesson in lessonPlans', async () => {
    const store = makeDb(seed(request({ transferType: 'material_to_lesson', sourceId: 'mat-1', targetId: 'personal-1' })));

    const res: any = await approve();

    expect(res.statusCode).toBe(200);
    expect(store.lessonPlans.get('personal-1').attachments).toEqual([
      expect.objectContaining({ name: 'Неправильные глаголы', url: 'https://cdn.example/verbs.pdf', size: 2048 }),
    ]);
    expect(store.notifications.get('req-1').metadata.status).toBe('approved');
    expect(store.lessons).toBeUndefined(); // nothing ever touched the legacy name
  });

  it('refuses a material of another organization', async () => {
    const store = makeDb(seed(request({ transferType: 'material_to_lesson', sourceId: 'mat-foreign', targetId: 'personal-1' })));

    const res: any = await approve();

    expect(res.statusCode).toBe(400);
    expect(errorOf(res)).toMatch(/организации/);
    expect(store.lessonPlans.get('personal-1').attachments).toEqual([]);
    expect(store.notifications.get('req-1').metadata.status).toBe('pending');
  });

  it.each([
    ['someone else’s personal lesson', 'personal-other'],
    ['an organization lesson, even the requester’s own', 'own-org-lesson'],
  ])('refuses to attach into %s', async (_label, targetId) => {
    const store = makeDb(seed(request({ transferType: 'material_to_lesson', sourceId: 'mat-1', targetId })));

    const res: any = await approve();

    expect(res.statusCode).toBe(400);
    expect(errorOf(res)).toMatch(/личный урок/);
    expect(store.lessonPlans.get(targetId).attachments).toEqual([]);
  });
});

describe('resolve_transfer — organization lesson into personal space', () => {
  it('copies the lesson into lessonPlans as the requester’s draft, detached from the org and its groups', async () => {
    const store = makeDb(seed(request({ transferType: 'lesson_to_personal', sourceId: 'org-lesson', targetId: 'personal' })));

    const res: any = await approve();

    expect(res.statusCode).toBe(200);
    const copies = [...store.lessonPlans.values()].filter((l) => l.title === 'Present Perfect (Копия)');
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({
      authorId: 'teacher-1',
      organizationId: null,
      branchId: null,
      status: 'draft',
      groupIds: [],
      groupNames: [],
      homework: { title: 'Упражнение 5', description: 'Письменно' },
    });
    // The source lesson is untouched.
    expect(store.lessonPlans.get('org-lesson')).toMatchObject({ organizationId: 'org-1', groupIds: ['g1'] });
    expect(store.lessons).toBeUndefined();
  });

  it('refuses to copy a lesson of another organization', async () => {
    const store = makeDb(seed(request({ transferType: 'lesson_to_personal', sourceId: 'foreign-lesson', targetId: 'personal' })));
    const before = store.lessonPlans.size;

    const res: any = await approve();

    expect(res.statusCode).toBe(400);
    expect(errorOf(res)).toMatch(/организации/);
    expect(store.lessonPlans.size).toBe(before);
  });
});
