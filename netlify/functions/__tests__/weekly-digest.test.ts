/**
 * Еженедельная сводка владельцу: кто вправе её запустить.
 *
 * У запланированной функции публичный адрес, а прогон читает деньги, долги и
 * контингент каждой организации и шлёт её админам и менеджерам сводку (в
 * приложение, push и Telegram). Проверяем, что при включённом CRON_ENFORCE
 * неопознанный вызов отбивается ДО всякой работы: ни одного чтения Firestore,
 * ни одной отправки. Разрешённый запуск на тех же заглушках обязан дойти и до
 * базы, и до рассылки — иначе «ничего не произошло» доказывало бы лишь то, что
 * заглушки не подключены.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Одна работающая организация: доход за неделю и активный ученик. */
vi.mock('../utils/firebase-admin', () => {
  const snap = (rows: any[]) => async () => ({ docs: rows.map(r => ({ id: r.id, data: () => r })) });
  return {
    adminAuth: { verifyIdToken: vi.fn() },
    adminDb: {
      collection: vi.fn((name: string) => {
        if (name === 'organizations') {
          return {
            get: snap([{ id: ORG, name: 'Академия', status: 'active' }]),
            // organizations/{orgId}/aiLeads — новых заявок нет.
            doc: () => ({ collection: () => ({ get: snap([]) }) }),
          };
        }
        if (name === 'financeTransactions') {
          return {
            where: () => ({
              get: snap([{ id: 'tx-1', organizationId: ORG, type: 'income', amount: 5000, date: new Date().toISOString() }]),
            }),
          };
        }
        if (name === 'studentPaymentPlans') return { where: () => ({ get: snap([]) }) };
        if (name === 'orgMembers') {
          return {
            doc: () => ({
              collection: () => ({
                where: () => ({ get: snap([{ id: 'student-1', role: 'student', status: 'active' }]) }),
              }),
            }),
          };
        }
        throw new Error('unexpected collection: ' + name);
      }),
    },
  };
});

vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn() };
});

vi.mock('../utils/notifications', () => ({
  notifyOrgAdmins: vi.fn(async () => {}),
}));

import { handler } from '../weekly-digest';
import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';
import { notifyOrgAdmins } from '../utils/notifications';

const ORG = 'org-1';

const ENV = { ...process.env };

let fetchMock: any;

const run = (headers: Record<string, string> = {}) =>
  handler({ httpMethod: 'POST', headers, body: null, queryStringParameters: {} } as any, {} as any, () => {}) as Promise<any>;

describe('weekly-digest — кто вправе запустить недельную сводку', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyAuth as any).mockResolvedValue(null);
    process.env.CRON_ENFORCE = 'true';
    process.env.CRON_SECRET = 's3cret';
    fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    process.env = { ...ENV };
    vi.unstubAllGlobals();
  });

  it.each([
    { who: 'анонимный вызов', headers: {}, user: null },
    { who: 'вызов с неверным x-cron-secret', headers: { 'x-cron-secret': 'wrong' }, user: null },
    { who: 'вошедший админ организации, но не суперадмин', headers: { authorization: 'Bearer t' }, user: { uid: 'admin-1', role: 'admin', organizationId: ORG } },
  ])('$who — 403, и ни чтений Firestore, ни отправок', async ({ headers, user }) => {
    (verifyAuth as any).mockResolvedValue(user);

    const res = await run(headers);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('cron_forbidden');
    expect(adminDb.collection).not.toHaveBeenCalled();
    expect(notifyOrgAdmins).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { who: 'плановый запуск Netlify', headers: { 'x-nf-event': 'schedule' } },
    { who: 'ручной прогон с верным x-cron-secret', headers: { 'x-cron-secret': 's3cret' } },
  ])('$who доходит до Firestore и рассылки', async ({ headers }) => {
    const res = await run(headers);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ orgsScanned: 1, digestsSent: 1 });
    expect(adminDb.collection).toHaveBeenCalledWith('organizations');
    expect(notifyOrgAdmins).toHaveBeenCalledTimes(1);
    expect(notifyOrgAdmins).toHaveBeenCalledWith(ORG, 'weekly_digest', expect.any(String), expect.any(String), '/dashboard');
  });
});
