/**
 * Еженедельный список «требуют внимания»: кто вправе его запустить.
 *
 * У запланированной функции публичный адрес, а прогон читает журнал, оплаты и
 * результаты экзаменов каждой организации и рассылает её админам и менеджерам
 * имена учеников с пропусками и долгами. Проверяем, что при включённом
 * CRON_ENFORCE неопознанный вызов отбивается ДО всякой работы: ни одного
 * чтения Firestore, ни одной отправки. Разрешённый запуск на тех же заглушках
 * обязан дойти и до базы, и до рассылки — иначе «ничего не произошло»
 * доказывало бы лишь то, что заглушки не подключены.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Одна организация, один активный ученик и три его свежих пропуска. */
vi.mock('../utils/firebase-admin', () => {
  const query = (rows: any[]) => {
    const q: any = { where: () => q, get: async () => ({ docs: rows.map(r => ({ id: r.id, data: () => r })) }) };
    return q;
  };
  return {
    adminAuth: { verifyIdToken: vi.fn() },
    adminDb: {
      collection: vi.fn((name: string) => {
        if (name === 'organizations') return query([{ id: ORG, status: 'active' }]);
        if (name === 'orgMembers') {
          return {
            doc: () => ({
              collection: () => query([{ id: STUDENT, userId: STUDENT, userName: 'Асель', role: 'student', status: 'active' }]),
            }),
          };
        }
        if (name === 'journal') {
          const today = new Date().toISOString().slice(0, 10);
          return query(['j1', 'j2', 'j3'].map(id => ({ id, organizationId: ORG, attendance: 'absent', studentId: STUDENT, date: today })));
        }
        if (name === 'studentPaymentPlans' || name === 'examAttempts') return query([]);
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

import { handler } from '../risk-alerts';
import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';
import { notifyOrgAdmins } from '../utils/notifications';

const ORG = 'org-1';
const STUDENT = 'student-1';

const ENV = { ...process.env };

let fetchMock: any;

const run = (headers: Record<string, string> = {}) =>
  handler({ httpMethod: 'POST', headers, body: null, queryStringParameters: {} } as any, {} as any, () => {}) as Promise<any>;

describe('risk-alerts — кто вправе запустить список «требуют внимания»', () => {
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
    expect(JSON.parse(res.body)).toMatchObject({ orgsScanned: 1, alertsSent: 1 });
    expect(adminDb.collection).toHaveBeenCalledWith('journal');
    expect(notifyOrgAdmins).toHaveBeenCalledTimes(1);
    expect(notifyOrgAdmins).toHaveBeenCalledWith(ORG, 'risk_alert', expect.any(String), expect.stringContaining('Асель'), '/students?risk=1');
  });
});
