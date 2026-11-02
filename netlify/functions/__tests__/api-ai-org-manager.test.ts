import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * В organizationAIManager/{orgId} лежит токен собственного Telegram-бота
 * организации. Раньше getSettings без всякой авторизации отдавал документ
 * целиком — токен любой организации читал любой, кто знает её id, а с токеном
 * можно перехватить вебхук бота, читать переписку его клиентов и писать от его
 * имени. Здесь крутится НАСТОЯЩИЙ обработчик поверх in-memory Firestore (как в
 * api-chat.test.ts); подменены только verifyAuth, рассылка уведомлений и fetch
 * в Bot API — по нему видно, с каким токеном сервер ходил в Telegram.
 */

// ── in-memory Firestore double ────────────────────────────────────────────────
const store = new Map<string, Record<string, any>>();

function makeDoc(path: string): any {
  return {
    id: path.split('/').pop(),
    path,
    get: async () => ({
      exists: store.has(path),
      id: path.split('/').pop(),
      data: () => (store.has(path) ? structuredClone(store.get(path)!) : undefined),
    }),
    set: async (data: any, opts?: { merge?: boolean }) => {
      store.set(path, opts?.merge ? { ...(store.get(path) || {}), ...structuredClone(data) } : structuredClone(data));
    },
    collection: (name: string) => makeCollection(`${path}/${name}`),
  };
}

function makeCollection(path: string): any {
  return { doc: (id: string) => makeDoc(`${path}/${id}`) };
}

vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: (name: string) => makeCollection(name) },
  adminAuth: {},
}));
vi.mock('../utils/notifications', () => ({ notifyOrgAdmins: vi.fn() }));

const verifyAuth = vi.fn();
vi.mock('../utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/auth')>()),
  verifyAuth: (...a: any[]) => verifyAuth(...a),
}));

const NEW_BOT_USERNAME = 'new_sales_bot';
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
const telegramOk = (url: string) => {
  const body = url.includes('/getMe') ? { ok: true, result: { username: NEW_BOT_USERNAME } } : { ok: true, result: true };
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};
const telegramCalls = () => fetchMock.mock.calls.map(([url]) => String(url));

const { handler } = await import('../api-ai-org-manager');

// ── fixtures ──────────────────────────────────────────────────────────────────
const ORG = 'org_a';
const BOT_TOKEN = '7000000001:AAH-org-a-secret-bot-token';

const OWNER = { uid: 'u_owner', role: 'admin', organizationId: ORG };
const SUPER_ADMIN = { uid: 'u_super', role: 'super_admin', organizationId: null };
const NOT_OWNERS: [string, any][] = [
  ['админ той же организации, но не владелец', { uid: 'u_director', role: 'admin', organizationId: ORG }],
  ['менеджер той же организации', { uid: 'u_manager', role: 'manager', organizationId: ORG }],
  ['владелец другой организации', { uid: 'u_other_owner', role: 'admin', organizationId: 'org_b' }],
];

const SETTINGS = {
  organizationId: ORG,
  isActive: true,
  greetingMessage: 'Салам! Чем помочь?',
  aboutOrganization: 'Внутреннее описание центра',
  enrollmentPolicy: 'Набор круглый год',
  customInstructions: 'Всегда предлагай скидку 10%',
  faq: [{ question: 'Сколько стоит?', answer: '5000 сом в месяц' }],
  telegramBotToken: BOT_TOKEN,
  telegramBotUsername: 'academy_sales_bot',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const URL_BASE = 'https://sabakhub.test/.netlify/functions/api-ai-org-manager';

const read = (action: string, { auth = true, organizationId = ORG } = {}) =>
  handler({
    httpMethod: 'GET',
    headers: { host: 'sabakhub.test', ...(auth ? { authorization: 'Bearer t' } : {}) },
    rawUrl: `${URL_BASE}?action=${action}&organizationId=${organizationId}`,
    queryStringParameters: { action, organizationId },
    body: null,
  } as any, {} as any, (() => {}) as any) as Promise<any>;

const save = (body: Record<string, any>) =>
  handler({
    httpMethod: 'POST',
    headers: { host: 'sabakhub.test', authorization: 'Bearer t' },
    rawUrl: `${URL_BASE}?action=updateSettings`,
    queryStringParameters: { action: 'updateSettings' },
    body: JSON.stringify({ organizationId: ORG, ...body }),
  } as any, {} as any, (() => {}) as any) as Promise<any>;

const as = (u: any) => verifyAuth.mockResolvedValue(u);
const json = (res: any) => JSON.parse(res.body);
const stored = () => store.get(`organizationAIManager/${ORG}`)!;

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  // Как в окружении прода: этим секретом подписывается регистрация вебхука бота
  // (X-Telegram-Bot-Api-Secret-Token); без него сервер вебхук не регистрирует.
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test_webhook_secret_0123456789abcdefXYZ';
  fetchMock.mockImplementation(async (url: string) => telegramOk(String(url)));
  store.set(`organizations/${ORG}`, { ownerId: 'u_owner', planId: 'professional', name: 'Академия' });
  store.set('organizations/org_b', { ownerId: 'u_other_owner', planId: 'professional', name: 'Другой центр' });
  store.set(`organizationAIManager/${ORG}`, structuredClone(SETTINGS));
});

describe('api-ai-org-manager — getSettings (публичный профиль, без входа)', () => {
  it('отдаёт только поля чат-виджета: ни токена бота, ни внутренних инструкций', async () => {
    const res = await read('getSettings', { auth: false });

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(BOT_TOKEN);
    const { data } = json(res);
    expect(Object.keys(data).sort()).toEqual(['faq', 'greetingMessage', 'isActive', 'organizationId', 'telegramBotUsername']);
    expect(data).toMatchObject({
      isActive: true,
      greetingMessage: 'Салам! Чем помочь?',
      faq: [{ question: 'Сколько стоит?', answer: '5000 сом в месяц' }],
      telegramBotUsername: 'academy_sales_bot',
    });
    // Публичный путь вообще не смотрит, кто спрашивает.
    expect(verifyAuth).not.toHaveBeenCalled();
  });

  it('вошедшему пользователю отдаёт то же самое — даже владельцу', async () => {
    as(OWNER);
    const res = await read('getSettings');

    expect(res.body).not.toContain(BOT_TOKEN);
    expect(json(res).data).not.toHaveProperty('customInstructions');
  });

  it('тариф без AI-менеджера выключает ассистента, что бы ни лежало в документе', async () => {
    store.set(`organizations/${ORG}`, { ownerId: 'u_owner', planId: 'starter' });

    const res = await read('getSettings', { auth: false });

    expect(json(res).data.isActive).toBe(false);
  });
});

describe('api-ai-org-manager — getOwnerSettings (редактор настроек)', () => {
  it.each([['владелец', OWNER], ['супер-админ', SUPER_ADMIN]])('%s видит настройки и факт подключения бота, но не сам токен', async (_who, user) => {
    as(user);
    const res = await read('getOwnerSettings');

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(BOT_TOKEN);
    const { data } = json(res);
    expect(data).not.toHaveProperty('telegramBotToken');
    expect(data).toMatchObject({
      hasTelegramBot: true,
      telegramBotUsername: 'academy_sales_bot',
      customInstructions: 'Всегда предлагай скидку 10%',
      aboutOrganization: 'Внутреннее описание центра',
    });
  });

  it.each(NOT_OWNERS)('%s — 403, ни настроек, ни токена', async (_who, user) => {
    as(user);
    const res = await read('getOwnerSettings');

    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain(BOT_TOKEN);
    expect(res.body).not.toContain('Всегда предлагай скидку');
  });

  it('без входа — 401', async () => {
    as(null);
    const res = await read('getOwnerSettings', { auth: false });

    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain(BOT_TOKEN);
  });
});

describe('api-ai-org-manager — updateSettings', () => {
  it('сохранение без токена оставляет подключённый бот как был и не ходит в Telegram', async () => {
    as(OWNER);
    // Ровно как AIManagerTab: получил редактор и отправил весь объект обратно.
    const editor = json(await read('getOwnerSettings')).data;

    const res = await save({ ...editor, greetingMessage: 'Добрый день!' });

    expect(res.statusCode).toBe(200);
    expect(stored()).toMatchObject({
      greetingMessage: 'Добрый день!',
      telegramBotToken: BOT_TOKEN,
      telegramBotUsername: 'academy_sales_bot',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.body).not.toContain(BOT_TOKEN);
    expect(json(res).data).toMatchObject({ greetingMessage: 'Добрый день!', hasTelegramBot: true });
  });

  it('сохраняет только поля редактора — остальное из тела отбрасывается', async () => {
    as(OWNER);
    const res = await save({
      action: 'updateSettings', // клиенты вправе слать action и в теле
      isActive: false,
      telegramBotUsername: 'someone_elses_bot', // выставляется только по ответу getMe
      hasTelegramBot: false,
      ownerId: 'u_attacker',
      planId: 'enterprise',
      injected: 'x',
    });

    expect(res.statusCode).toBe(200);
    const doc = stored();
    expect(doc.isActive).toBe(false);
    expect(doc.telegramBotUsername).toBe('academy_sales_bot');
    expect(doc.telegramBotToken).toBe(BOT_TOKEN);
    for (const key of ['hasTelegramBot', 'ownerId', 'planId', 'injected', 'action']) {
      expect(doc).not.toHaveProperty(key);
    }
  });

  it.each([
    ['greetingMessage объектом', { greetingMessage: { text: 'x' } }],
    ['isActive строкой', { isActive: 'yes' }],
    ['faq строкой', { faq: 'вопрос' }],
    ['вопрос FAQ числом', { faq: [{ question: 1, answer: 'a' }] }],
    ['токен числом', { telegramBotToken: 42 }],
  ])('%s — 400, документ не тронут', async (_case, body) => {
    as(OWNER);
    const res = await save(body);

    expect(res.statusCode).toBe(400);
    expect(stored()).toEqual(SETTINGS);
  });

  it('новый токен подключает того бота: getMe и setWebhook идут с ним', async () => {
    as(OWNER);
    const NEW_TOKEN = '7000000002:AAH-new-bot-token';

    const res = await save({ telegramBotToken: `  ${NEW_TOKEN}  ` });

    expect(res.statusCode).toBe(200);
    expect(stored()).toMatchObject({ telegramBotToken: NEW_TOKEN, telegramBotUsername: NEW_BOT_USERNAME });
    expect(telegramCalls().some((u) => u.includes(`/bot${NEW_TOKEN}/getMe`))).toBe(true);
    expect(telegramCalls().some((u) => u.includes(`/bot${NEW_TOKEN}/setWebhook`))).toBe(true);
    expect(res.body).not.toContain(NEW_TOKEN);
  });

  it('неверный токен — 400, прежний бот остаётся', async () => {
    as(OWNER);
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 401, json: async () => ({ ok: false }), text: async () => 'Unauthorized' }));

    const res = await save({ telegramBotToken: '7000000003:AAH-wrong' });

    expect(res.statusCode).toBe(400);
    expect(stored().telegramBotToken).toBe(BOT_TOKEN);
  });

  it('пустая строка отключает бота', async () => {
    as(OWNER);
    const res = await save({ telegramBotToken: '' });

    expect(res.statusCode).toBe(200);
    expect(stored()).toMatchObject({ telegramBotToken: '', telegramBotUsername: '' });
    expect(json(res).data.hasTelegramBot).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reconnectTelegram перерегистрирует вебхук сохранённым токеном — клиенту он не нужен', async () => {
    as(OWNER);
    const res = await save({ reconnectTelegram: true });

    expect(res.statusCode).toBe(200);
    expect(telegramCalls().some((u) => u.includes(`/bot${BOT_TOKEN}/getMe`))).toBe(true);
    expect(telegramCalls().some((u) => u.includes(`/bot${BOT_TOKEN}/setWebhook`))).toBe(true);
    expect(stored().telegramBotToken).toBe(BOT_TOKEN);
    expect(res.body).not.toContain(BOT_TOKEN);
  });

  it('reconnectTelegram без подключённого бота — 400', async () => {
    as(OWNER);
    store.set(`organizationAIManager/${ORG}`, { ...structuredClone(SETTINGS), telegramBotToken: '', telegramBotUsername: '' });

    const res = await save({ reconnectTelegram: true });

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(NOT_OWNERS)('%s не может ничего сохранить', async (_who, user) => {
    as(user);
    const res = await save({ greetingMessage: 'взлом', telegramBotToken: '7000000004:AAH-attacker' });

    expect(res.statusCode).toBe(403);
    expect(stored()).toEqual(SETTINGS);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
