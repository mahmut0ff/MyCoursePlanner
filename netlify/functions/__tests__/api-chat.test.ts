import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Чат — это в первую очередь права: кто кого видит, кому вправе написать и чьё
 * сообщение вправе снести. Поэтому тут крутится НАСТОЯЩИЙ обработчик поверх
 * маленькой in-memory Firestore (как в api-support.test.ts), а из utils/auth
 * подменяется ровно одна вещь — verifyAuth. Все can()/hasRole()/branch-хелперы
 * работают всерьёз: подделай их — и тест перестанет проверять то самое, ради
 * чего написан.
 */

// ── in-memory Firestore double ────────────────────────────────────────────────
const store = new Map<string, Record<string, any>>();
let autoId = 0;

function applySet(path: string, data: Record<string, any>, merge: boolean) {
  store.set(path, merge ? { ...(store.get(path) || {}), ...data } : { ...data });
}

function snapshot(path: string) {
  return {
    exists: store.has(path),
    id: path.split('/').pop(),
    ref: makeDoc(path),
    data: () => (store.has(path) ? { ...store.get(path)! } : undefined),
  };
}

function makeDoc(path: string): any {
  return {
    id: path.split('/').pop(),
    path,
    get: async () => snapshot(path),
    set: async (data: any, opts?: { merge?: boolean }) => applySet(path, data, !!opts?.merge),
    update: async (data: any) => {
      if (!store.has(path)) throw new Error(`update on missing doc: ${path}`);
      applySet(path, data, true);
    },
    collection: (name: string) => makeCollection(`${path}/${name}`),
  };
}

function docsUnder(path: string, predicate?: (v: any) => boolean) {
  const prefix = `${path}/`;
  return [...store.entries()]
    .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
    .filter(([, v]) => (predicate ? predicate(v) : true))
    .map(([k, v]) => ({ id: k.slice(prefix.length), data: () => ({ ...v }) }));
}

function makeCollection(path: string): any {
  const wrap = (docs: any[]) => ({ docs, size: docs.length, empty: docs.length === 0 });
  return {
    doc: (id?: string) => makeDoc(`${path}/${id ?? `auto_${++autoId}`}`),
    add: async (data: any) => {
      const ref = makeDoc(`${path}/auto_${++autoId}`);
      await ref.set(data);
      return ref;
    },
    get: async () => wrap(docsUnder(path)),
    // Обработчик пользуется только одиночным равенством — составных запросов в
    // чате нет намеренно (составные индексы в этом проекте не деплоятся).
    where: (field: string, _op: string, value: any) => ({
      get: async () => wrap(docsUnder(path, (v) => v[field] === value)),
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

vi.mock('../utils/firebase-admin', () => ({
  adminDb: adminDbMock,
  adminAuth: { getUser: vi.fn() },
  getDocsByIds: async (collection: string, ids: string[]) => {
    const out: Record<string, any> = {};
    ids.forEach((id) => { if (store.has(`${collection}/${id}`)) out[id] = { ...store.get(`${collection}/${id}`)! }; });
    return out;
  },
}));

const verifyAuth = vi.fn();

vi.mock('../utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/auth')>()),
  verifyAuth: (...a: any[]) => verifyAuth(...a),
}));

const { handler } = await import('../api-chat');

// ── fixtures ──────────────────────────────────────────────────────────────────
const ORG = 'org_academy';

const grants = (...keys: string[]) => new Set(keys);

const ADMIN = {
  uid: 'u_admin', email: 'admin@a.test', displayName: 'Админ', role: 'admin',
  organizationId: ORG, branchIds: [], rbac: grants(),
};
const TEACHER = {
  uid: 'u_teacher', email: 't@a.test', displayName: 'Преподаватель', role: 'teacher',
  organizationId: ORG, branchIds: [], rbac: grants('chat:read', 'chat:write'),
};
const OTHER_TEACHER = {
  uid: 'u_teacher2', email: 't2@a.test', displayName: 'Другой преподаватель', role: 'teacher',
  organizationId: ORG, branchIds: [], rbac: grants('chat:read', 'chat:write'),
};
const STUDENT = {
  uid: 'u_student', email: 's@a.test', displayName: 'Студент', role: 'student',
  organizationId: ORG, branchIds: [], rbac: grants('chat:read', 'chat:write'),
};
const NO_CHAT = {
  uid: 'u_nochat', email: 'n@a.test', displayName: 'Без чата', role: 'teacher',
  organizationId: ORG, branchIds: [], rbac: grants('students:read'),
};

const call = (action: string, method = 'POST', body?: any, extra?: Record<string, string>) =>
  handler({
    httpMethod: method,
    headers: { authorization: 'Bearer t' },
    queryStringParameters: { action, ...(extra || {}) },
    body: body ? JSON.stringify(body) : undefined,
  } as any, {} as any, (() => {}) as any) as Promise<any>;

const as = (u: any) => verifyAuth.mockResolvedValue(u);
const json = (res: any) => JSON.parse(res.body);
const room = (id: string) => store.get(`chatRooms/${id}`);

function member(uid: string, role: string, name: string, extra: Record<string, any> = {}) {
  store.set(`orgMembers/${ORG}/members/${uid}`, {
    userId: uid, userName: name, role, status: 'active', branchIds: [], ...extra,
  });
  store.set(`users/${uid}`, { displayName: name, avatarUrl: '' });
}

beforeEach(() => {
  store.clear();
  autoId = 0;
  vi.clearAllMocks();

  member('u_admin', 'admin', 'Админ');
  member('u_teacher', 'teacher', 'Преподаватель');
  member('u_teacher2', 'teacher', 'Другой преподаватель');
  member('u_student', 'student', 'Студент');
  member('u_student2', 'student', 'Второй студент');

  // Группа преподавателя u_teacher — в ней только первый студент.
  store.set('groups/g1', {
    organizationId: ORG, teacherIds: ['u_teacher'], studentIds: ['u_student'], name: 'Stem 10:00',
  });
  // Чужая группа: её студент не должен попасть в справочник u_teacher.
  store.set('groups/g2', {
    organizationId: ORG, teacherIds: ['u_teacher2'], studentIds: ['u_student2'], name: 'English 12:00',
  });
});

describe('api-chat — справочник собеседников', () => {
  it('студенту показывает только сотрудников, но не других студентов', async () => {
    as(STUDENT);
    const res = await call('directory', 'GET');
    const uids = json(res).items.map((p: any) => p.uid);

    expect(uids).toContain('u_teacher');
    expect(uids).toContain('u_admin');
    expect(uids).not.toContain('u_student2');
    expect(uids).not.toContain('u_student');       // себя в списке нет
    expect(json(res).canCreateGroup).toBe(false);
  });

  it('преподавателю — сотрудники и студенты ЕГО групп, чужие студенты не видны', async () => {
    as(TEACHER);
    const uids = json(await call('directory', 'GET')).items.map((p: any) => p.uid);

    expect(uids).toContain('u_student');    // из своей группы
    expect(uids).toContain('u_teacher2');   // коллега
    expect(uids).not.toContain('u_student2'); // из чужой
  });

  it('админу — вся организация', async () => {
    as(ADMIN);
    const uids = json(await call('directory', 'GET')).items.map((p: any) => p.uid);
    expect(uids).toEqual(expect.arrayContaining(['u_teacher', 'u_teacher2', 'u_student', 'u_student2']));
  });

  it('не отдаёт контакты: ни email, ни телефона', async () => {
    member('u_student', 'student', 'Студент', { userEmail: 's@a.test' });
    store.set('users/u_student', { displayName: 'Студент', email: 's@a.test', phone: '+996700000000' });

    as(ADMIN);
    const entry = json(await call('directory', 'GET')).items.find((p: any) => p.uid === 'u_student');
    expect(Object.keys(entry).sort()).toEqual(['avatarUrl', 'name', 'role', 'uid']);
  });

  it('без права chat отказывает во всём', async () => {
    as(NO_CHAT);
    expect((await call('directory', 'GET')).statusCode).toBe(403);
    expect((await call('createRoom', 'POST', { type: 'direct', participantIds: ['u_teacher'] })).statusCode).toBe(403);
  });
});

describe('api-chat — создание комнат', () => {
  it('студент не может написать студенту, даже подделав uid в запросе', async () => {
    as(STUDENT);
    const res = await call('createRoom', 'POST', { type: 'direct', participantIds: ['u_student2'] });

    expect(res.statusCode).toBe(403);
    expect([...store.keys()].some((k) => k.startsWith('chatRooms/'))).toBe(false);
  });

  it('студент может начать диалог с преподавателем, id диалога детерминирован', async () => {
    as(STUDENT);
    const res = await call('createRoom', 'POST', { type: 'direct', participantIds: ['u_teacher'] });

    expect(res.statusCode).toBe(200);
    const id = json(res).id;
    expect(id).toBe(`DM_${ORG}_u_student_u_teacher`);
    expect(room(id)!.participantIds.sort()).toEqual(['u_student', 'u_teacher']);
  });

  it('повторный вызов возвращает ту же комнату и снимает архив', async () => {
    as(STUDENT);
    const first = json(await call('createRoom', 'POST', { type: 'direct', participantIds: ['u_teacher'] }));
    applySetArchived(first.id);

    const second = json(await call('createRoom', 'POST', { type: 'direct', participantIds: ['u_teacher'] }));
    expect(second.id).toBe(first.id);
    expect(room(first.id)!.isArchived).toBe(false);
    expect([...store.keys()].filter((k) => k.startsWith('chatRooms/')).length).toBe(1);
  });

  it('группу студент не создаёт', async () => {
    as(STUDENT);
    const res = await call('createRoom', 'POST', { type: 'group', title: 'Тайный совет', participantIds: ['u_teacher'] });
    expect(res.statusCode).toBe(403);
  });

  it('создатель группы становится её администратором', async () => {
    as(TEACHER);
    const res = json(await call('createRoom', 'POST', {
      type: 'group', title: 'Stem 10:00', participantIds: ['u_student'],
    }));
    expect(room(res.id)!.participants.u_teacher.role).toBe('admin');
    expect(room(res.id)!.participants.u_student.role).toBe('member');
  });
});

function applySetArchived(roomId: string) {
  store.set(`chatRooms/${roomId}`, { ...store.get(`chatRooms/${roomId}`)!, isArchived: true });
}

describe('api-chat — состав группы', () => {
  const seedGroup = () => {
    store.set('chatRooms/room1', {
      id: 'room1', organizationId: ORG, type: 'group', title: 'Stem 10:00',
      createdBy: 'u_teacher', participantIds: ['u_teacher', 'u_student'],
      participants: {
        u_teacher: { role: 'admin', isRemoved: false, isMuted: false, lastReadAt: '1970-01-01T00:00:00.000Z' },
        u_student: { role: 'member', isRemoved: false, isMuted: false, lastReadAt: '1970-01-01T00:00:00.000Z' },
      },
      isArchived: false,
    });
  };

  it('обычный участник не управляет составом', async () => {
    seedGroup();
    as(STUDENT);
    const res = await call('updateParticipants', 'POST', { roomId: 'room1', removeUids: ['u_teacher'] });

    expect(res.statusCode).toBe(403);
    expect(room('room1')!.participantIds).toContain('u_teacher');
  });

  it('исключённый уходит из participantIds, но остаётся в participants с isRemoved', async () => {
    seedGroup();
    as(TEACHER);
    const res = await call('updateParticipants', 'POST', { roomId: 'room1', removeUids: ['u_student'] });

    expect(res.statusCode).toBe(200);
    expect(room('room1')!.participantIds).toEqual(['u_teacher']);
    expect(room('room1')!.participants.u_student.isRemoved).toBe(true);
  });

  it('добавить можно только того, кому сам вправе писать', async () => {
    seedGroup();
    as(TEACHER);
    // u_student2 — из чужой группы, в справочнике преподавателя его нет.
    const res = await call('updateParticipants', 'POST', { roomId: 'room1', addUids: ['u_student2'] });

    expect(res.statusCode).toBe(403);
    expect(room('room1')!.participantIds).not.toContain('u_student2');
  });

  it('комната из чужой организации недоступна', async () => {
    seedGroup();
    store.set('chatRooms/room1', { ...store.get('chatRooms/room1')!, organizationId: 'org_other' });
    as(ADMIN);
    expect((await call('updateParticipants', 'POST', { roomId: 'room1', addUids: ['u_student'] })).statusCode).toBe(403);
  });
});

describe('api-chat — модерация', () => {
  const seed = () => {
    store.set('chatRooms/room1', {
      id: 'room1', organizationId: ORG, type: 'group', participantIds: ['u_teacher', 'u_student'],
      participants: {
        u_teacher: { role: 'admin', isRemoved: false, isMuted: false },
        u_student: { role: 'member', isRemoved: false, isMuted: false },
      },
      isArchived: false,
    });
    store.set('chatRooms/room1/messages/m1', {
      id: 'm1', roomId: 'room1', organizationId: ORG, senderId: 'u_teacher', text: 'Здравствуйте',
    });
  };

  it('чужое сообщение обычный участник не удаляет', async () => {
    seed();
    as(STUDENT);
    const res = await call('moderateMessage', 'POST', { roomId: 'room1', messageId: 'm1' });

    expect(res.statusCode).toBe(403);
    expect(store.get('chatRooms/room1/messages/m1')!.deletedAt).toBeUndefined();
  });

  it('автор удаляет своё — мягко, с пометкой кто удалил', async () => {
    seed();
    as(TEACHER);
    const res = await call('moderateMessage', 'POST', { roomId: 'room1', messageId: 'm1' });

    expect(res.statusCode).toBe(200);
    const msg = store.get('chatRooms/room1/messages/m1')!;
    expect(msg.deletedAt).toBeTruthy();
    expect(msg.deletedBy).toBe('u_teacher');
    expect(msg.text).toBe('Здравствуйте'); // текст остаётся: удаление мягкое
  });

  it('админ организации удаляет любое', async () => {
    seed();
    as(ADMIN);
    expect((await call('moderateMessage', 'POST', { roomId: 'room1', messageId: 'm1' })).statusCode).toBe(200);
  });
});

describe('api-chat — уведомления', () => {
  const seedRoom = (overrides: Record<string, any> = {}) => {
    store.set('chatRooms/room1', {
      id: 'room1', organizationId: ORG, type: 'group', title: 'Stem 10:00',
      participantIds: ['u_teacher', 'u_student', 'u_teacher2'],
      participants: {
        u_teacher: { role: 'admin', isRemoved: false, isMuted: false },
        u_student: { role: 'member', isRemoved: false, isMuted: false },
        u_teacher2: { role: 'member', isRemoved: false, isMuted: false },
        ...(overrides.participants || {}),
      },
      isArchived: false,
      ...overrides,
    });
  };

  const notifications = () => [...store.keys()].filter((k) => k.startsWith('notifications/'));

  it('пишет по одному уведомлению каждому, кроме отправителя', async () => {
    seedRoom();
    as(TEACHER);
    await call('notifyMessage', 'POST', { roomId: 'room1', text: 'Завтра контрольная' });

    expect(notifications().sort()).toEqual([
      'notifications/chat_u_student_room1',
      'notifications/chat_u_teacher2_room1',
    ]);
  });

  it('второе сообщение в ту же комнату НЕ плодит документы', async () => {
    seedRoom();
    as(TEACHER);
    await call('notifyMessage', 'POST', { roomId: 'room1', text: 'Раз' });
    await call('notifyMessage', 'POST', { roomId: 'room1', text: 'Два' });
    await call('notifyMessage', 'POST', { roomId: 'room1', text: 'Три' });

    expect(notifications().length).toBe(2);
    // Запись обновилась и снова стала непрочитанной — с последним текстом.
    const n = store.get('notifications/chat_u_student_room1')!;
    expect(n.read).toBe(false);
    expect(n.body).toContain('Три');
  });

  it('выключившего уведомления и исключённого пропускает', async () => {
    seedRoom({
      participants: {
        u_teacher: { role: 'admin', isRemoved: false, isMuted: false },
        u_student: { role: 'member', isRemoved: false, isMuted: true },
        u_teacher2: { role: 'member', isRemoved: true, isMuted: false },
      },
    });
    as(TEACHER);
    await call('notifyMessage', 'POST', { roomId: 'room1', text: 'Никому' });

    expect(notifications()).toEqual([]);
  });

  it('подпись берётся с сервера, а не из тела запроса', async () => {
    seedRoom();
    as(TEACHER);
    await call('notifyMessage', 'POST', { roomId: 'room1', text: 'Привет', senderName: 'Директор' });

    const n = store.get('notifications/chat_u_student_room1')!;
    expect(n.body).toContain('Преподаватель');
    expect(JSON.stringify(n)).not.toContain('Директор');
  });

  it('посторонний в комнату не уведомляет', async () => {
    seedRoom();
    as(OTHER_TEACHER);
    store.set('chatRooms/room1', {
      ...store.get('chatRooms/room1')!,
      participantIds: ['u_teacher', 'u_student'],
    });

    const res = await call('notifyMessage', 'POST', { roomId: 'room1', text: 'Я вообще не тут' });
    expect(res.statusCode).toBe(403);
    expect(notifications()).toEqual([]);
  });
});
