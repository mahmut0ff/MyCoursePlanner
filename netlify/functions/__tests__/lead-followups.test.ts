/**
 * Напоминания об остывших заявках: кто вправе их запустить.
 *
 * Из открытых кронов этот опаснее всех: кроме напоминаний директорам он пишет
 * ПОСТОРОННЕМУ человеку — лиду из Telegram, от имени бота продаж самой
 * организации. Проверяем, что при включённом CRON_ENFORCE неопознанный вызов
 * отбивается ДО всякой работы: ни чтений и записей Firestore, ни сообщения
 * директорам, ни сообщения лиду. Разрешённый запуск на тех же заглушках обязан
 * дойти до всех — иначе «ничего не произошло» доказывало бы лишь то, что
 * заглушки не подключены.
 *
 * Модуль telegram НЕ подменяем: настоящий sendTelegramRaw ходит в
 * заглушённый fetch, так что проверка «fetch не вызван» значит буквально
 * «лиду ничего не ушло».
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Одна организация со своим ботом продаж и одной заявкой, которая ждёт двое суток. */
vi.mock('../utils/firebase-admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'organizations') {
        return {
          get: async () => ({ docs: [{ id: ORG, data: () => ({ name: 'Академия', status: 'active' }) }] }),
          // organizations/{orgId}/aiLeads, status == 'new'
          doc: () => ({
            collection: () => ({
              where: () => ({
                get: async () => ({
                  docs: [{
                    id: 'lead-1',
                    data: () => ({
                      status: 'new',
                      name: 'Айгуль',
                      source: 'telegram_bot',
                      telegramChatId: LEAD_CHAT,
                      createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
                    }),
                    ref: { update: leadUpdate },
                  }],
                }),
              }),
            }),
          }),
        };
      }
      if (name === 'organizationAIManager') {
        return {
          doc: () => ({ get: async () => ({ exists: true, data: () => ({ isActive: true, telegramBotToken: ORG_BOT }) }) }),
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
  notifyOrgAdmins: vi.fn(async () => {}),
}));

import { handler } from '../lead-followups';
import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';
import { notifyOrgAdmins } from '../utils/notifications';

const ORG = 'org-1';
const ORG_BOT = 'org-sales-bot-token';
const LEAD_CHAT = '424242';
const leadUpdate = vi.fn(async () => {});

const ENV = { ...process.env };

let fetchMock: any;

const run = (headers: Record<string, string> = {}) =>
  handler({ httpMethod: 'POST', headers, body: null, queryStringParameters: {} } as any, {} as any, () => {}) as Promise<any>;

describe('lead-followups — кто вправе запустить напоминания по заявкам', () => {
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
  ])('$who — 403, и ни чтений Firestore, ни сообщений директорам и лиду', async ({ headers, user }) => {
    (verifyAuth as any).mockResolvedValue(user);

    const res = await run(headers);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('cron_forbidden');
    expect(adminDb.collection).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notifyOrgAdmins).not.toHaveBeenCalled();
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it.each([
    { who: 'плановый запуск Netlify', headers: { 'x-nf-event': 'schedule' } },
    { who: 'ручной прогон с верным x-cron-secret', headers: { 'x-cron-secret': 's3cret' } },
  ])('$who доходит до Firestore, директоров и самого лида', async ({ headers }) => {
    const res = await run(headers);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ scanned: 1, reminded: 1, autoReplied: 1 });
    expect(adminDb.collection).toHaveBeenCalledWith('organizations');
    // Лиду пишет бот продаж организации, а не общий бот платформы.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${ORG_BOT}/sendMessage`);
    expect(JSON.parse(init.body).chat_id).toBe(LEAD_CHAT);
    expect(notifyOrgAdmins).toHaveBeenCalledWith(ORG, 'lead_followup', expect.any(String), expect.any(String), '/leads');
    expect(leadUpdate).toHaveBeenCalled();
  });
});
