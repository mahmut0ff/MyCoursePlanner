/**
 * Сводка по оплате тарифов: кто вправе её запустить.
 *
 * Прогон не только пишет суперадмину в Telegram — он ещё и БЛОКИРУЕТ
 * организации, у которых прошёл льготный период: подписка → expired,
 * организация → suspended. Решение принимается по датам, поэтому лишний запуск
 * невиновного не заблокирует, но момент блокировки должно выбирать расписание,
 * а не любой, кто знает адрес. Проверяем, что при включённом CRON_ENFORCE
 * неопознанный вызов отбивается ДО всякой работы: ни чтений и записей
 * Firestore, ни сообщения суперадмину. Разрешённый запуск на тех же заглушках
 * обязан дойти и до блокировки, и до сообщения — иначе «ничего не произошло»
 * доказывало бы лишь то, что заглушки не подключены.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Одна активная подписка, просроченная на 10 дней, — дальше льготного периода. */
vi.mock('../utils/firebase-admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'subscriptions') {
        return {
          get: async () => ({
            docs: [{
              id: 'sub-1',
              data: () => ({
                status: 'active',
                organizationId: ORG,
                planId: 'starter',
                paidUntil: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
              }),
              ref: { update: subUpdate },
            }],
          }),
        };
      }
      if (name === 'organizations') {
        return {
          get: async () => ({ docs: [{ id: ORG, data: () => ({ name: 'Академия' }) }] }),
          doc: () => ({ update: orgUpdate }),
        };
      }
      throw new Error('unexpected collection: ' + name);
    }),
  },
}));

vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn() };
});

vi.mock('../utils/notifications', () => ({
  notifySuperAdminTelegram: vi.fn(async () => {}),
}));

import { handler } from '../subscription-reminders';
import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';
import { notifySuperAdminTelegram } from '../utils/notifications';

const ORG = 'org-1';
const subUpdate = vi.fn(async () => {});
const orgUpdate = vi.fn(async () => {});

const ENV = { ...process.env };

let fetchMock: any;

const run = (headers: Record<string, string> = {}) =>
  handler({ httpMethod: 'POST', headers, body: null, queryStringParameters: {} } as any, {} as any, () => {}) as Promise<any>;

describe('subscription-reminders — кто вправе запустить сводку и автоблокировку', () => {
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
  ])('$who — 403, и ни чтений, ни блокировок, ни сообщения суперадмину', async ({ headers, user }) => {
    (verifyAuth as any).mockResolvedValue(user);

    const res = await run(headers);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('cron_forbidden');
    expect(adminDb.collection).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalled();
    expect(orgUpdate).not.toHaveBeenCalled();
    expect(notifySuperAdminTelegram).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { who: 'плановый запуск Netlify', headers: { 'x-nf-event': 'schedule' } },
    { who: 'ручной прогон с верным x-cron-secret', headers: { 'x-cron-secret': 's3cret' } },
  ])('$who доходит до блокировки и сообщения суперадмину', async ({ headers }) => {
    const res = await run(headers);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, blocked: 1 });
    expect(subUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }));
    expect(orgUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'suspended' }));
    expect(notifySuperAdminTelegram).toHaveBeenCalledTimes(1);
    expect(notifySuperAdminTelegram).toHaveBeenCalledWith(expect.stringContaining('Академия'));
  });
});
