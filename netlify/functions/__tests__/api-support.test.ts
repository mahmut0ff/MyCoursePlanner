import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * api-support is a state machine: thread status, per-side unread counters and
 * the forced `senderSide` all evolve across a SEQUENCE of calls. Per-call
 * `vi.fn()` stubs (the pattern in security-cross-tenant.test.ts) can't express
 * that — they'd assert against whatever the previous stub was told to return.
 *
 * So this file drives the real handler against a small in-memory Firestore
 * double that actually persists writes, and asserts on the resulting documents.
 */

// ── in-memory Firestore double ────────────────────────────────────────────────
const store = new Map<string, Record<string, any>>();
let autoId = 0;

/** Firestore's merge writes field-by-field; a plain overwrite would hide bugs. */
function applySet(path: string, data: Record<string, any>, merge: boolean) {
  store.set(path, merge ? { ...(store.get(path) || {}), ...data } : { ...data });
}

function makeDoc(path: string): any {
  return {
    id: path.split('/').pop(),
    path,
    get: async () => ({
      exists: store.has(path),
      id: path.split('/').pop(),
      data: () => (store.has(path) ? { ...store.get(path)! } : undefined),
    }),
    set: async (data: any, opts?: { merge?: boolean }) => applySet(path, data, !!opts?.merge),
    update: async (data: any) => {
      if (!store.has(path)) throw new Error(`update on missing doc: ${path}`);
      applySet(path, data, true);
    },
    collection: (name: string) => makeCollection(`${path}/${name}`),
  };
}

function makeCollection(path: string): any {
  return {
    doc: (id?: string) => makeDoc(`${path}/${id ?? `auto_${++autoId}`}`),
    // Only the shapes api-support actually issues: a bare subcollection read and
    // a single equality filter (used by the test's own assertions).
    get: async () => {
      const prefix = `${path}/`;
      const docs = [...store.entries()]
        .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map(([k, v]) => ({ id: k.slice(prefix.length), data: () => ({ ...v }) }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
    where: (field: string, _op: string, value: any) => ({
      get: async () => {
        const prefix = `${path}/`;
        const docs = [...store.entries()]
          .filter(([k, v]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/') && v[field] === value)
          .map(([k, v]) => ({ id: k.slice(prefix.length), data: () => ({ ...v }) }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    }),
  };
}

const adminDbMock = {
  collection: (name: string) => makeCollection(name),
  batch: () => {
    const ops: (() => void)[] = [];
    return {
      set: (ref: any, data: any, opts?: any) => { ops.push(() => applySet(ref.path, data, !!opts?.merge)); },
      update: (ref: any, data: any) => { ops.push(() => applySet(ref.path, data, true)); },
      commit: async () => { ops.forEach((op) => op()); },
    };
  },
};

const adminAuthMock = {
  getUser: vi.fn(async (uid: string) => ({
    metadata: { lastSignInTime: 'Tue, 14 Jul 2026 09:00:00 GMT' },
    disabled: uid === 'blocked_user',
  })),
};

vi.mock('../utils/firebase-admin', () => ({
  adminDb: adminDbMock,
  adminAuth: adminAuthMock,
}));

const verifyAuth = vi.fn();
const getMembershipData = vi.fn();

vi.mock('../utils/auth', async () => ({
  verifyAuth: (...a: any[]) => verifyAuth(...a),
  getMembershipData: (...a: any[]) => getMembershipData(...a),
  isSuperAdmin: (u: any) => u?.role === 'super_admin',
  jsonResponse: (statusCode: number, body: any) => ({ statusCode, body: JSON.stringify(body) }),
  ok: (body: any) => ({ statusCode: 200, body: JSON.stringify(body) }),
  forbidden: (msg?: string) => ({ statusCode: 403, body: JSON.stringify({ error: msg || 'Forbidden' }) }),
  badRequest: (msg: string) => ({ statusCode: 400, body: JSON.stringify({ error: msg }) }),
  notFound: (msg?: string) => ({ statusCode: 404, body: JSON.stringify({ error: msg || 'Not found' }) }),
  unauthorized: () => ({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }),
}));

const { handler } = await import('../api-support');

// ── fixtures ──────────────────────────────────────────────────────────────────
const USER = {
  uid: 'user_alice', email: 'alice@academy.test', displayName: 'Alice Ivanova',
  role: 'teacher', organizationId: 'org_academy',
};
const SUPER = {
  uid: 'super_root', email: 'root@sabakhub.test', displayName: 'Root Admin',
  role: 'super_admin', organizationId: null,
};

const call = (action: string, method = 'POST', body?: any, extra?: Record<string, string>) =>
  handler({
    httpMethod: method,
    headers: { authorization: 'Bearer t' },
    queryStringParameters: { action, ...(extra || {}) },
    body: body ? JSON.stringify(body) : undefined,
  } as any, {} as any, (() => {}) as any) as Promise<any>;

const asUser = () => verifyAuth.mockResolvedValue(USER);
const asSuper = () => verifyAuth.mockResolvedValue(SUPER);
const thread = () => store.get('supportThreads/user_alice');
const json = (res: any) => JSON.parse(res.body);

beforeEach(() => {
  store.clear();
  autoId = 0;
  vi.clearAllMocks();
  getMembershipData.mockResolvedValue(null);
  store.set('organizations/org_academy', {
    name: 'My Academy', planId: 'enterprise', slug: 'my-academy', institutionType: 'language_school',
  });
});

describe('api-support — sending', () => {
  it('creates the thread on the first message and denormalises the org snapshot', async () => {
    asUser();
    const res = await call('send', 'POST', { text: 'Не могу выгрузить ведомость' });
    expect(res.statusCode).toBe(200);

    expect(thread()).toMatchObject({
      id: 'user_alice',
      userId: 'user_alice',
      userRole: 'teacher',
      organizationId: 'org_academy',
      organizationName: 'My Academy',
      status: 'new',
      lastMessageFrom: 'user',
      unreadForSupport: 1,
      unreadForUser: 0,
    });
    expect(thread()!.lastMessagePreview).toBe('Не могу выгрузить ведомость');
  });

  it('forces senderSide from the token, not the payload', async () => {
    asUser();
    // A client claiming to be the support desk must not be believed.
    const res = await call('send', 'POST', { text: 'hi', senderSide: 'support' });
    expect(json(res).senderSide).toBe('user');

    asSuper();
    const reply = await call('send', 'POST', { threadId: 'user_alice', text: 'hello', senderSide: 'user' });
    expect(json(reply).senderSide).toBe('support');
  });

  it('pins a non-super sender to their own thread, ignoring threadId', async () => {
    asUser();
    const res = await call('send', 'POST', { threadId: 'victim_uid', text: 'hijack' });
    expect(json(res).threadId).toBe('user_alice');
    expect(store.has('supportThreads/victim_uid')).toBe(false);
  });

  it('rejects a message with neither text nor attachment', async () => {
    asUser();
    expect((await call('send', 'POST', { text: '   ', attachments: [] })).statusCode).toBe(400);
  });

  it('drops non-https attachments and strips unknown keys', async () => {
    asUser();
    const res = await call('send', 'POST', {
      text: 'see attached',
      attachments: [
        { type: 'image', url: 'javascript:alert(1)', fileName: 'evil' },
        { type: 'image', url: 'https://ok.test/a.png', fileName: 'a.png', fileSize: 10, mimeType: 'image/png', injected: 'X' },
      ],
    });
    const atts = json(res).attachments;
    expect(atts).toHaveLength(1);
    expect(atts[0].url).toBe('https://ok.test/a.png');
    expect(atts[0]).not.toHaveProperty('injected');
  });

  it('falls back to an attachment preview when there is no text', async () => {
    asUser();
    await call('send', 'POST', {
      text: '',
      attachments: [{ type: 'video', url: 'https://ok.test/v.mp4', fileName: 'v.mp4', fileSize: 5, mimeType: 'video/mp4' }],
    });
    expect(thread()!.lastMessagePreview).toBe('🎬 Видео');
  });

  it('quotes a snapshot of the replied-to message rather than a live pointer', async () => {
    asUser();
    const first = json(await call('send', 'POST', { text: 'Оригинальное сообщение' }));

    asSuper();
    const reply = json(await call('send', 'POST', {
      threadId: 'user_alice', text: 'Отвечаю', replyTo: { messageId: first.id },
    }));
    expect(reply.replyTo).toMatchObject({ messageId: first.id, text: 'Оригинальное сообщение' });

    // Deleting the original must not blank the quote already stored on the reply.
    await call('deleteMessage', 'POST', { threadId: 'user_alice', messageId: first.id });
    const stored = store.get(`supportThreads/user_alice/messages/${reply.id}`);
    expect(stored!.replyTo.text).toBe('Оригинальное сообщение');
  });

  it('refuses to cold-open a thread from the support side', async () => {
    asSuper();
    expect((await call('send', 'POST', { threadId: 'ghost', text: 'hello?' })).statusCode).toBe(404);
  });
});

describe('api-support — status and counters', () => {
  it('moves new -> open and notifies the user when support replies', async () => {
    asUser();
    await call('send', 'POST', { text: 'вопрос' });
    expect(thread()!.status).toBe('new');

    asSuper();
    await call('send', 'POST', { threadId: 'user_alice', text: 'ответ' });

    expect(thread()).toMatchObject({
      status: 'open',
      lastMessageFrom: 'support',
      unreadForSupport: 0,
      unreadForUser: 1,
    });

    const notif = [...store.values()].find((v) => v.type === 'support_reply');
    expect(notif).toMatchObject({ recipientId: 'user_alice', body: 'ответ', read: false });
  });

  it('reopens a closed thread when the user writes again', async () => {
    asUser();
    await call('send', 'POST', { text: 'первое' });
    asSuper();
    await call('setStatus', 'POST', { threadId: 'user_alice', status: 'closed' });
    expect(thread()!.status).toBe('closed');

    asUser();
    await call('send', 'POST', { text: 'всё ещё не работает' });
    expect(thread()!.status).toBe('open');
  });

  it('leaves an unanswered thread on "new" as the user keeps writing', async () => {
    asUser();
    await call('send', 'POST', { text: 'раз' });
    await call('send', 'POST', { text: 'два' });
    // Still never answered — the inbox must keep surfacing it as untouched.
    expect(thread()).toMatchObject({ status: 'new', unreadForSupport: 2 });
  });

  it('restricts setStatus to the super admin and validates the value', async () => {
    asUser();
    await call('send', 'POST', { text: 'x' });
    expect((await call('setStatus', 'POST', { threadId: 'user_alice', status: 'closed' })).statusCode).toBe(403);

    asSuper();
    expect((await call('setStatus', 'POST', { threadId: 'user_alice', status: 'bogus' })).statusCode).toBe(400);
  });

  it('treats sending as reading — a reply clears the sender\'s own counter', async () => {
    asUser();
    await call('send', 'POST', { text: 'вопрос' });
    asSuper();
    await call('send', 'POST', { threadId: 'user_alice', text: 'ответ' });
    expect(thread()).toMatchObject({ unreadForSupport: 0, unreadForUser: 1 });

    // Answering means you were looking at the thread, so the reply doubles as a
    // read receipt — the same shortcut useChat takes with lastReadAt on send.
    asUser();
    await call('send', 'POST', { text: 'ещё' });
    expect(thread()).toMatchObject({ unreadForSupport: 1, unreadForUser: 0 });
  });

  it('clears only the calling side on an explicit markRead', async () => {
    asUser();
    await call('send', 'POST', { text: 'вопрос' });
    asSuper();
    await call('send', 'POST', { threadId: 'user_alice', text: 'ответ' });
    asUser();
    await call('send', 'POST', { text: 'ещё' });
    expect(thread()).toMatchObject({ unreadForSupport: 1, unreadForUser: 0 });

    // The operator opening the thread must not clear the USER's side too.
    asSuper();
    await call('markRead', 'POST', { threadId: 'user_alice' });
    expect(thread()).toMatchObject({ unreadForSupport: 0, unreadForUser: 0 });

    asSuper();
    await call('send', 'POST', { threadId: 'user_alice', text: 'ещё ответ' });
    expect(thread()).toMatchObject({ unreadForUser: 1 });

    asUser();
    await call('markRead', 'POST', {});
    expect(thread()).toMatchObject({ unreadForSupport: 0, unreadForUser: 0 });
  });
});

describe('api-support — deletion', () => {
  it('soft-deletes rather than removing the document', async () => {
    asUser();
    const msg = json(await call('send', 'POST', { text: 'опечатка' }));
    await call('deleteMessage', 'POST', { messageId: msg.id });

    const stored = store.get(`supportThreads/user_alice/messages/${msg.id}`);
    expect(stored).toBeDefined();
    expect(stored!.deletedAt).toBeTruthy();
    expect(stored!.deletedBy).toBe('user_alice');
  });

  it('lets a user delete only their own message', async () => {
    asUser();
    await call('send', 'POST', { text: 'вопрос' });
    asSuper();
    const supportMsg = json(await call('send', 'POST', { threadId: 'user_alice', text: 'ответ' }));

    asUser();
    expect((await call('deleteMessage', 'POST', { messageId: supportMsg.id })).statusCode).toBe(403);
  });

  it('lets the super admin moderate any message', async () => {
    asUser();
    const userMsg = json(await call('send', 'POST', { text: 'грубость' }));
    asSuper();
    expect((await call('deleteMessage', 'POST', { threadId: 'user_alice', messageId: userMsg.id })).statusCode).toBe(200);
  });
});

describe('api-support — userInfo panel', () => {
  beforeEach(() => {
    store.set('users/user_alice', {
      uid: 'user_alice', email: 'alice@academy.test', displayName: 'Alice Ivanova',
      role: 'teacher', activeOrgId: 'org_academy', phone: '+996700111222', city: 'Бишкек',
      createdAt: '2026-01-15T10:00:00.000Z',
    });
    store.set('branches/branch_1', { name: 'Центральный филиал' });
    store.set('organizations/org_academy/roles/role_1', { name: 'Старший преподаватель' });
    getMembershipData.mockResolvedValue({
      role: 'teacher', status: 'active', roleId: 'role_1', branchIds: ['branch_1'],
    });
  });

  it('resolves org, plan, custom role and branch NAMES for the super admin', async () => {
    asSuper();
    const res = await call('userInfo', 'GET', undefined, { userId: 'user_alice' });
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({
      uid: 'user_alice',
      email: 'alice@academy.test',
      role: 'teacher',
      city: 'Бишкек',
      organizationId: 'org_academy',
      organizationName: 'My Academy',
      planId: 'enterprise',
      membershipRole: 'teacher',
      customRoleName: 'Старший преподаватель',
      branchNames: ['Центральный филиал'],
    });
  });

  it('denies the panel to a non-super caller', async () => {
    asUser();
    expect((await call('userInfo', 'GET', undefined, { userId: 'super_root' })).statusCode).toBe(403);
  });

  it('404s for an unknown user', async () => {
    asSuper();
    expect((await call('userInfo', 'GET', undefined, { userId: 'nobody' })).statusCode).toBe(404);
  });
});

describe('api-support — auth', () => {
  it('rejects an unauthenticated request', async () => {
    verifyAuth.mockResolvedValue(null);
    expect((await call('send', 'POST', { text: 'x' })).statusCode).toBe(401);
  });

  it('rejects an unknown action', async () => {
    asUser();
    expect((await call('bogus', 'POST', {})).statusCode).toBe(400);
  });
});
