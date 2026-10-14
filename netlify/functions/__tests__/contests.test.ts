/**
 * Конкурсы: сквозной сценарий на настоящих хендлерах и настоящем verifyAuth,
 * поверх Firestore в памяти. Проверяется ровно то, что обещано организатору:
 *  - жюри не проходит ни в одну ручку, кроме api-contest-judge;
 *  - жюри видит только свои оценки, не выше максимума, только в открытой категории;
 *  - номера проектов не переиспользуются;
 *  - ничья → «требуется решение», без решения итоги не утверждаются;
 *  - после утверждения оценки не меняются ни жюри, ни админом;
 *  - правка админом — только с комментарием и попадает в историю.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

// ─── Firestore в памяти (vi.hoisted: моки поднимаются выше импортов) ───
const { fakeDb, fakeAuth, col, authUsers } = vi.hoisted(() => {
const store = new Map<string, Map<string, any>>();
const col = (name: string) => { if (!store.has(name)) store.set(name, new Map()); return store.get(name)!; };
let autoId = 0;
const clone = (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const isOp = (v: any) => v && typeof v === 'object' && '__op' in v;
function applyValue(prev: any, v: any) {
  if (!isOp(v)) return clone(v);
  if (v.__op === 'inc') return (Number(prev) || 0) + v.n;
  if (v.__op === 'union') return [...new Set([...(Array.isArray(prev) ? prev : []), ...v.v])];
  if (v.__op === 'remove') return (Array.isArray(prev) ? prev : []).filter((x: any) => !v.v.includes(x));
  return prev;
}
function write(name: string, id: string, data: any, merge: boolean) {
  const prev = merge ? (col(name).get(id) || {}) : {};
  const next = { ...prev };
  for (const [k, v] of Object.entries(data)) next[k] = applyValue(prev[k], v);
  col(name).set(id, next);
}
function docRef(name: string, id: string): any {
  return {
    id,
    get: async () => snap(name, id),
    set: async (d: any, o?: any) => write(name, id, d, !!o?.merge),
    update: async (d: any) => { if (!col(name).has(id)) throw new Error(`no doc ${name}/${id}`); write(name, id, d, true); },
    delete: async () => { col(name).delete(id); },
    collection: (sub: string) => collection(`${name}/${id}/${sub}`),
  };
}
function snap(name: string, id: string) {
  const d = col(name).get(id);
  return { id, exists: d !== undefined, data: () => clone(d), ref: docRef(name, id) };
}
function query(name: string, filters: [string, any][]): any {
  return {
    where: (f: string, _op: string, v: any) => query(name, [...filters, [f, v]]),
    limit: () => query(name, filters),
    get: async () => {
      const docs = [...col(name).keys()].filter((id) => filters.every(([f, v]) => col(name).get(id)[f] === v)).map((id) => snap(name, id));
      return { docs, empty: docs.length === 0 };
    },
  };
}
function collection(name: string): any {
  return { ...query(name, []), doc: (id?: string) => docRef(name, id ?? `auto${++autoId}`) };
}
const fakeDb = {
  collection,
  runTransaction: async (fn: any) => fn({
    get: (ref: any) => ref.get(),
    set: (ref: any, d: any, o?: any) => ref.set(d, o),
    update: (ref: any, d: any) => ref.update(d),
  }),
  batch: () => {
    const ops: (() => Promise<void>)[] = [];
    return {
      set: (ref: any, d: any, o?: any) => ops.push(() => ref.set(d, o)),
      update: (ref: any, d: any) => ops.push(() => ref.update(d)),
      delete: (ref: any) => ops.push(() => ref.delete()),
      commit: async () => { for (const op of ops) await op(); },
    };
  },
};
const authUsers = new Map<string, { uid: string; email: string; displayName?: string; disabled?: boolean; password?: string }>();
const fakeAuth = {
  verifyIdToken: async (token: string) => ({ uid: token, email: authUsers.get(token)?.email || `${token}@x` }),
  getUserByEmail: async (email: string) => {
    const u = [...authUsers.values()].find((x) => x.email === email);
    if (!u) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
    return u;
  },
  createUser: async ({ email, password, displayName }: any) => {
    const uid = `jury-${authUsers.size + 1}`;
    authUsers.set(uid, { uid, email, password, displayName });
    return { uid };
  },
  updateUser: async (uid: string, patch: any) => { Object.assign(authUsers.get(uid)!, patch); },
};

  return { fakeDb, fakeAuth, col, authUsers };
});

vi.mock('../utils/firebase-admin', () => ({ adminDb: fakeDb, adminAuth: fakeAuth }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    increment: (n: number) => ({ __op: 'inc', n }),
    arrayUnion: (...v: any[]) => ({ __op: 'union', v }),
    arrayRemove: (...v: any[]) => ({ __op: 'remove', v }),
  },
}));

import { handler as contestsHandler } from '../api-contests';
import { handler as judgeHandler } from '../api-contest-judge';
import { handler as classroomsHandler } from '../api-classrooms';
import { rankCategory, juryForCategory } from '../../../src/lib/contests';
import { formatMoney } from '../../../src/lib/money';

const call = async (h: any, uid: string, method: string, action: string, body?: any, qs: Record<string, string> = {}) => {
  const res = await h({
    httpMethod: method,
    headers: { authorization: `Bearer ${uid}` },
    queryStringParameters: { action, ...qs },
    body: body ? JSON.stringify(body) : null,
  } as any, {} as any);
  return { status: res.statusCode, body: JSON.parse(res.body || 'null') };
};
const admin = (method: string, action: string, body?: any, qs?: Record<string, string>) => call(contestsHandler, 'admin', method, action, body, qs);
const judge = (uid: string, method: string, action: string, body?: any, qs?: Record<string, string>) => call(judgeHandler, uid, method, action, body, qs);

const all = (rel: number, use: number, orig: number, tech: number, pres: number) => ({ rel, use, orig, tech, pres });

let contestId = '';
let cat: Record<string, string> = {};
let crit: Record<string, string> = {};
const pid: Record<string, string> = {};
const juryUids: string[] = [];

beforeAll(() => {
  // Админ организации и преподаватель без права contests.
  col('users').set('admin', { role: 'admin', activeOrgId: 'org1', displayName: 'Директор' });
  col('users/admin/memberships').set('org1', { role: 'admin', roles: ['admin'], status: 'active' });
  col('users').set('teacher', { role: 'teacher', activeOrgId: 'org1', displayName: 'Учитель' });
  col('users/teacher/memberships').set('org1', { role: 'teacher', roles: ['teacher'], status: 'active' });
  authUsers.set('teacher', { uid: 'teacher', email: 'teacher@academy.kg', displayName: 'Учитель' });
  col('organizations').set('org1', { name: 'My Academy', planId: 'starter' });
});

describe('Келечек инженерлери — 2026: сквозной сценарий', () => {
  it('админ создаёт конкурс, категории, критерии, порядок ничьей', async () => {
    const c = await admin('POST', 'create', { title: 'Келечек инженерлери — 2026', season: '2026', kind: 'project_contest', prizeFund: 100000 });
    expect(c.status).toBe(200);
    contestId = c.body.id;

    const cats = await admin('POST', 'saveCategories', {
      id: contestId,
      categories: [
        { code: 'A', name: '12–15 лет', ageFrom: 12, ageTo: 15, prizes: [{ title: 'Кубок', amount: 15000 }, { title: 'Диплом', amount: 10000 }, { title: 'Диплом', amount: 5000 }] },
        { code: 'B', name: '16–20 лет', ageFrom: 16, ageTo: 20, prizes: [{ title: 'Кубок', amount: 15000 }] },
        { code: 'C', name: '21–25 лет', ageFrom: 21, ageTo: 25, prizes: [{ title: 'Кубок', amount: 15000 }] },
      ],
    });
    expect(cats.status).toBe(200);
    cat = Object.fromEntries(cats.body.categories.map((x: any) => [x.code, x.id]));

    // Пересекающийся код отклоняется.
    expect((await admin('POST', 'saveCategories', { id: contestId, categories: [{ code: 'A', ageFrom: 1, ageTo: 2 }, { code: 'A', ageFrom: 3, ageTo: 4 }] })).status).toBe(400);

    const cr = await admin('POST', 'saveCriteria', {
      id: contestId,
      criteria: [
        { name: 'Актуальность проблемы', maxScore: 20 },
        { name: 'Польза для человека и общества', maxScore: 20 },
        { name: 'Оригинальность идеи', maxScore: 20 },
        { name: 'Техническая реализация', maxScore: 20 },
        { name: 'Презентация и демонстрация', maxScore: 20 },
      ],
    });
    expect(cr.status).toBe(200);
    const ids = cr.body.criteria.map((x: any) => x.id);
    crit = { rel: ids[0], use: ids[1], orig: ids[2], tech: ids[3], pres: ids[4] };
    expect((await admin('POST', 'saveTieBreak', { id: contestId, tieBreakCriterionIds: [crit.tech, crit.use, crit.orig] })).status).toBe(200);
  });

  it('участники: категория по возрасту, номера по порядку, команда — по старшему', async () => {
    const add = (key: string, authors: any[], extra: any = {}) =>
      admin('POST', 'addParticipant', { id: contestId, authors, projectTitle: `Проект ${key}`, ...extra })
        .then((r) => { expect(r.status).toBe(200); pid[key] = r.body.id; return r.body; });

    expect((await add('a1', [{ name: 'Асель', age: 13 }])).number).toBe('A-01');
    expect((await add('a2', [{ name: 'Бакыт', age: 14 }])).number).toBe('A-02');
    expect((await add('a3', [{ name: 'Нурлан', age: 12 }])).number).toBe('A-03');
    expect((await add('a4', [{ name: 'Айжан', age: 15 }])).number).toBe('A-04');
    const team = await add('b1', [{ name: 'Эрлан', age: 15 }, { name: 'Мээрим', age: 17 }]);
    expect(team.number).toBe('B-01'); // 17 лет у старшего → B
    for (const k of ['b2', 'b3', 'b4']) await add(k, [{ name: k, age: 18 }]);
    for (const k of ['c1', 'c2', 'c3', 'c4']) await add(k, [{ name: k, age: 22 }]);

    // Возраст вне всех категорий без ручного выбора — ошибка.
    expect((await admin('POST', 'addParticipant', { id: contestId, authors: [{ name: 'X', age: 40 }] })).status).toBe(400);

    // Удалили неоценённого — номер не переиспользуется.
    await add('tmp', [{ name: 'Временный', age: 13 }]);
    expect((await admin('POST', 'deleteParticipant', { id: contestId, participantId: pid.tmp })).status).toBe(200);
    const late = await add('late', [{ name: 'Опоздавший', age: 13 }]);
    expect(late.number).toBe('A-06');
    await admin('POST', 'deleteParticipant', { id: contestId, participantId: pid.late });
  });

  it('три члена жюри: отдельные учётки «только оценивание»', async () => {
    for (const [i, name] of ['Жюри Один', 'Жюри Два', 'Жюри Три'].entries()) {
      const r = await admin('POST', 'addJury', { id: contestId, name, email: `jury${i + 1}@kelechek.kg`, password: 'secret12' });
      expect(r.status).toBe(200);
      expect(r.body.accountType).toBe('jury');
      juryUids.push(r.body.uid);
      const u = col('users').get(r.body.uid);
      expect(u.role).toBe('jury');
      expect(u.organizationId).toBeUndefined();
      expect(u.activeOrgId).toBeUndefined();
    }
    // Повторно того же — конфликт; сотрудник становится жюри без новой учётки.
    expect((await admin('POST', 'addJury', { id: contestId, name: 'Жюри Один', email: 'jury1@kelechek.kg', password: 'x' })).status).toBe(409);
    expect(col('contestLive').get(contestId).juryUids).toEqual(juryUids);
  });

  it('жюри не проходит ни в одну ручку системы, кроме оценивания', async () => {
    const [j1] = juryUids;
    const r1 = await call(contestsHandler, j1, 'GET', 'list');
    expect(r1.status).toBe(403);
    expect(r1.body.code).toBe('jury_restricted');
    const r2 = await call(classroomsHandler, j1, 'GET', 'list');
    expect(r2.status).toBe(403);
    // А «мои конкурсы» ему доступны — но черновик ещё не показывается.
    const my = await judge(j1, 'GET', 'my');
    expect(my.status).toBe(200);
    expect(my.body.contests).toEqual([]);
    // Преподаватель без права contests тоже не видит конкурсы.
    expect((await call(contestsHandler, 'teacher', 'GET', 'list')).status).toBe(403);
  });

  it('оценивание: только пришедшие, только открытая категория, не выше максимума', async () => {
    await admin('POST', 'setStatus', { id: contestId, status: 'registration' });
    expect((await admin('POST', 'setStatus', { id: contestId, status: 'judging' })).status).toBe(200);
    const [j1] = juryUids;
    const full = all(10, 10, 10, 10, 10);
    const ids = Object.values(pid).filter((id) => col('contestParticipants').has(id));
    expect((await admin('POST', 'setParticipantStatus', { id: contestId, participantIds: ids, status: 'arrived' })).status).toBe(200);

    const sc = (uid: string, key: string, v: any) =>
      judge(uid, 'POST', 'score', { contestId, participantId: pid[key], scores: { [crit.rel]: v.rel, [crit.use]: v.use, [crit.orig]: v.orig, [crit.tech]: v.tech, [crit.pres]: v.pres } });

    // Категория ещё не открыта.
    expect((await sc(j1, 'a1', full)).body.code).toBe('category_closed');
    await admin('POST', 'setJudging', { id: contestId, categoryId: cat.A, state: 'open' });
    // Критерии после старта заблокированы.
    expect((await admin('POST', 'saveCriteria', { id: contestId, criteria: [{ name: 'x', maxScore: 5 }] })).status).toBe(409);
    // Выше максимума.
    expect((await sc(j1, 'a1', all(21, 0, 0, 0, 0))).status).toBe(400);
    // Категория B не открыта.
    expect((await sc(j1, 'b1', full)).status).toBe(409);

    // A-01 и A-02 — полная ничья у всех трёх жюри; A-03 и A-04 равны по сумме,
    // но у A-04 выше техническая реализация.
    for (const uid of juryUids) {
      expect((await sc(uid, 'a1', all(16, 16, 16, 16, 16))).status).toBe(200);
      expect((await sc(uid, 'a2', all(16, 16, 16, 16, 16))).status).toBe(200);
      expect((await sc(uid, 'a3', all(14, 14, 14, 10, 14))).status).toBe(200);
      expect((await sc(uid, 'a4', all(12, 14, 14, 16, 10))).status).toBe(200);
    }
    // Жюри может исправить свою оценку, пока категория открыта.
    expect((await sc(juryUids[0], 'a4', all(12, 14, 14, 16, 10))).status).toBe(200);

    // Доска жюри: только свои оценки, никаких чужих и никакого рейтинга.
    const board = await judge(juryUids[1], 'GET', 'board', undefined, { contestId, categoryId: cat.A });
    expect(board.status).toBe(200);
    expect(board.body.projects.map((p: any) => p.number)).toEqual(['A-01', 'A-02', 'A-03', 'A-04']);
    expect(Object.keys(board.body.mine)).toHaveLength(4);
    expect(JSON.stringify(board.body)).not.toContain(juryUids[0]);
    expect(board.body.projects[0]).not.toHaveProperty('phone');
  });

  it('ведущий вызывает проект — он появляется в живом документе', async () => {
    expect((await admin('POST', 'setCurrent', { id: contestId, categoryId: cat.A, participantId: pid.a3 })).status).toBe(200);
    expect(col('contestLive').get(contestId).categories[cat.A].currentParticipantId).toBe(pid.a3);
  });

  it('правка за жюри — только с комментарием, и попадает в историю', async () => {
    const scores = { [crit.rel]: 14, [crit.use]: 14, [crit.orig]: 14, [crit.tech]: 10, [crit.pres]: 14 };
    expect((await admin('POST', 'adminScore', { id: contestId, participantId: pid.a3, juryUid: juryUids[2], scores })).status).toBe(400);
    expect((await admin('POST', 'adminScore', { id: contestId, participantId: pid.a3, juryUid: juryUids[2], scores, comment: 'Опечатка жюри' })).status).toBe(200);
    const log = await admin('GET', 'log', undefined, { id: contestId, participantId: pid.a3 });
    const fix = log.body.find((e: any) => e.byRole === 'admin');
    expect(fix).toMatchObject({ comment: 'Опечатка жюри', juryUid: juryUids[2] });
    expect(fix.before.total).toBe(66);
    expect(log.body.length).toBe(4); // 3 оценки жюри + правка
  });

  it('ничья: рейтинг помечает, утверждение без решения блокируется, после решения проходит', async () => {
    const data = (await admin('GET', 'get', undefined, { id: contestId })).body;
    const rows = rankCategory({
      participants: data.participants.filter((p: any) => p.categoryId === cat.A && p.status === 'arrived'),
      scores: data.scores,
      assignedJuryUids: juryForCategory(data.jury, cat.A).map((j: any) => j.uid),
      criteria: data.contest.criteria,
      tieBreakCriterionIds: data.contest.tieBreakCriterionIds,
    });
    expect(rows.map((r) => [r.number, r.place, r.needsDecision])).toEqual([
      ['A-01', 1, true], ['A-02', 1, true], ['A-04', 3, false], ['A-03', 4, false],
    ]);
    expect(rows[2].tieBrokenBy).toBe('Техническая реализация');

    // Пока категория открыта — утверждать нельзя.
    expect((await admin('POST', 'approve', { id: contestId, categoryId: cat.A })).status).toBe(409);
    await admin('POST', 'setJudging', { id: contestId, categoryId: cat.A, state: 'closed' });
    // После закрытия жюри уже не правит.
    const late = await judge(juryUids[0], 'POST', 'score', { contestId, participantId: pid.a1, scores: { [crit.rel]: 1, [crit.use]: 1, [crit.orig]: 1, [crit.tech]: 1, [crit.pres]: 1 } });
    expect(late.body.code).toBe('category_closed');

    const blocked = await admin('POST', 'approve', { id: contestId, categoryId: cat.A });
    expect(blocked.status).toBe(409);
    expect(blocked.body.blocking).toEqual(['A-01', 'A-02']);

    // Ручное решение — комментарий обязателен, набор обязан быть настоящей ничьей.
    expect((await admin('POST', 'resolveTie', { id: contestId, categoryId: cat.A, participantIds: [pid.a2, pid.a1] })).status).toBe(400);
    expect((await admin('POST', 'resolveTie', { id: contestId, categoryId: cat.A, participantIds: [pid.a3, pid.a4], comment: 'x' })).status).toBe(409);
    expect((await admin('POST', 'resolveTie', { id: contestId, categoryId: cat.A, participantIds: [pid.a2, pid.a1], comment: 'Жюри совещалось: у A-02 лучше демонстрация' })).status).toBe(200);

    const approved = await admin('POST', 'approve', { id: contestId, categoryId: cat.A });
    expect(approved.status).toBe(200);
    expect(approved.body.approved.rows.map((r: any) => [r.number, r.place, r.prize])).toEqual([
      ['A-02', 1, `Кубок · ${formatMoney(15000)}`],
      ['A-01', 2, `Диплом · ${formatMoney(10000)}`],
      ['A-04', 3, `Диплом · ${formatMoney(5000)}`],
      ['A-03', 4, ''],
    ]);
  });

  it('после утверждения оценки не меняются никем', async () => {
    const scores = { [crit.rel]: 1, [crit.use]: 1, [crit.orig]: 1, [crit.tech]: 1, [crit.pres]: 1 };
    expect((await admin('POST', 'adminScore', { id: contestId, participantId: pid.a1, juryUid: juryUids[0], scores, comment: 'попытка' })).status).toBe(409);
    expect((await admin('POST', 'setJudging', { id: contestId, categoryId: cat.A, state: 'open' })).status).toBe(409);
    expect((await admin('POST', 'deleteParticipant', { id: contestId, participantId: pid.a1 })).status).toBe(409);
    expect((await admin('POST', 'removeJury', { id: contestId, juryId: `${contestId}_${juryUids[0]}` })).status).toBe(409);
  });

  it('завершённый конкурс — только просмотр', async () => {
    expect((await admin('POST', 'setStatus', { id: contestId, status: 'finished' })).status).toBe(200);
    expect((await admin('POST', 'update', { id: contestId, title: 'Новое' })).status).toBe(409);
    expect((await admin('POST', 'addParticipant', { id: contestId, authors: [{ name: 'Z', age: 13 }] })).status).toBe(409);
    expect((await admin('GET', 'get', undefined, { id: contestId })).status).toBe(200);
  });
});
