/**
 * Утренняя AI-сводка директорам: кто вправе её запустить.
 *
 * У запланированной функции публичный адрес, а каждый прогон стоит денег —
 * запрос к Gemini на каждую организацию с AI и сообщение в Telegram каждому её
 * директору. Проверяем, что при включённом CRON_ENFORCE неопознанный вызов
 * отбивается ДО всякой работы: ни одного чтения Firestore, ни одного вызова AI,
 * ни одной отправки. Разрешённый запуск на тех же заглушках обязан дойти до всех
 * трёх — иначе «ничего не произошло» доказывало бы лишь то, что заглушки не
 * подключены.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Тестовый бот задаём раньше импортов: модуль telegram может прочитать токен
// уже при загрузке.
vi.hoisted(() => { process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token'; });

/** Одна организация с AI: директор с привязанным Telegram и активный ученик. */
vi.mock('../utils/firebase-admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'organizations') {
        return {
          get: async () => ({
            docs: [{ id: ORG, data: () => ({ name: 'Академия', planId: 'professional', status: 'active' }) }],
          }),
        };
      }
      if (name === 'orgMembers') {
        return {
          doc: () => ({
            collection: () => ({
              where: () => ({
                get: async () => ({
                  docs: [
                    { id: DIRECTOR, data: () => ({ userId: DIRECTOR, role: 'owner', status: 'active' }) },
                    { id: 'student-1', data: () => ({ userId: 'student-1', role: 'student', status: 'active' }) },
                  ],
                }),
              }),
            }),
          }),
        };
      }
      if (name === 'users') {
        return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ telegramChatId: CHAT_ID }) }) }) };
      }
      throw new Error('unexpected collection: ' + name);
    }),
  },
}));

vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn() };
});

vi.mock('../utils/director-copilot', () => ({
  generateBrief: vi.fn(async () => 'Сводка дня'),
  directorMenuKeyboard: vi.fn(() => ({ inline_keyboard: [] })),
}));

import { handler } from '../morning-brief';
import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';
import { generateBrief } from '../utils/director-copilot';

const ORG = 'org-1';
const DIRECTOR = 'director-1';
const CHAT_ID = '555';

const ENV = { ...process.env };

let fetchMock: any;

const run = (headers: Record<string, string> = {}) =>
  handler({ httpMethod: 'POST', headers, body: null, queryStringParameters: {} } as any, {} as any, () => {}) as Promise<any>;

describe('morning-brief — кто вправе запустить утреннюю сводку', () => {
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
    { who: 'вошедший директор, но не суперадмин', headers: { authorization: 'Bearer t' }, user: { uid: DIRECTOR, role: 'admin' } },
  ])('$who — 403, и ни чтений Firestore, ни AI, ни Telegram', async ({ headers, user }) => {
    (verifyAuth as any).mockResolvedValue(user);

    const res = await run(headers);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('cron_forbidden');
    expect(adminDb.collection).not.toHaveBeenCalled();
    expect(generateBrief).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { who: 'плановый запуск Netlify', headers: { 'x-nf-event': 'schedule' } },
    { who: 'ручной прогон с верным x-cron-secret', headers: { 'x-cron-secret': 's3cret' } },
  ])('$who доходит до Firestore, AI и Telegram', async ({ headers }) => {
    const res = await run(headers);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ orgsScanned: 1, briefsSent: 1 });
    expect(adminDb.collection).toHaveBeenCalledWith('organizations');
    expect(generateBrief).toHaveBeenCalledWith(ORG, 'Академия');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottest-bot-token/sendMessage');
    expect(JSON.parse(init.body).chat_id).toBe(CHAT_ID);
  });
});
