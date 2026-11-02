import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

/**
 * Вебхук Telegram — публичный адрес, а обработчик принимает chat.id / from.id
 * за личность отправителя. Настоящее обновление от поддельного отличает только
 * заголовок X-Telegram-Bot-Api-Secret-Token с секретом, который знают Telegram
 * и сервер. Здесь крутятся НАСТОЯЩИЕ обработчики — вебхук и обе точки
 * регистрации (api-telegram-link, api-ai-org-manager). Подменены Firestore,
 * fetch и модули с побочными эффектами (одобрение заявок, кнопки директора,
 * копилоты, ДЗ) — ровно чтобы видеть, дошёл ли до них запрос.
 */

// ── in-memory Firestore double ────────────────────────────────────────────────
const store = new Map<string, Record<string, any>>();
/** Каждое обращение к коллекции — «поддельный запрос не стоил ни одного чтения» проверяется по нему. */
const firestoreCalls = vi.fn();

function makeDoc(path: string): any {
  const id = path.split('/').pop();
  return {
    id,
    path,
    get: async () => ({ exists: store.has(path), id, data: () => (store.has(path) ? { ...store.get(path)! } : undefined) }),
    set: async (data: any, opts?: { merge?: boolean }) => {
      store.set(path, opts?.merge ? { ...(store.get(path) || {}), ...data } : { ...data });
    },
    update: async (data: any) => { store.set(path, { ...(store.get(path) || {}), ...data }); },
    delete: async () => { store.delete(path); },
    collection: (name: string) => makeCollection(`${path}/${name}`),
  };
}

function makeCollection(path: string): any {
  const none = { empty: true, docs: [], size: 0 };
  return {
    doc: (id: string) => makeDoc(`${path}/${id}`),
    where: () => ({ limit: () => ({ get: async () => none }), get: async () => none }),
  };
}

vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: (name: string) => { firestoreCalls(name); return makeCollection(name); } },
  adminAuth: {},
  getDocsByIds: async () => ({}),
  uploadServerFile: vi.fn(),
}));

// ── побочные эффекты, до которых поддельный запрос дойти не должен ─────────────
const sideEffects = {
  processApprovalDecision: vi.fn(),
  resolveDirectorByChat: vi.fn(),
  remindOrgDebtors: vi.fn(),
  resolveStaffByChat: vi.fn(),
  runStaffCopilotTurn: vi.fn(),
  resolveStudentByChat: vi.fn(),
  resolveParentByChat: vi.fn(),
  peekDraft: vi.fn(),
  setDraft: vi.fn(),
  runSalesBotTurn: vi.fn(),
};

vi.mock('../utils/join-approvals', () => ({
  processApprovalDecision: (...a: any[]) => sideEffects.processApprovalDecision(...a),
  sendJoinApprovalButtons: vi.fn(),
}));
vi.mock('../utils/director-copilot', () => ({
  resolveDirectorByChat: (...a: any[]) => sideEffects.resolveDirectorByChat(...a),
  remindOrgDebtors: (...a: any[]) => sideEffects.remindOrgDebtors(...a),
  generateBrief: vi.fn(), generateDebtorDraft: vi.fn(), sendDebtorDraft: vi.fn(),
  buildDirectorSnapshot: vi.fn(), renderDebtors: vi.fn(), renderRisk: vi.fn(), renderLeads: vi.fn(),
  renderOrgSchedule: vi.fn(), directorMenuKeyboard: () => ({ keyboard: [] }),
}));
vi.mock('../utils/copilot-actions', () => ({
  resolveStaffByChat: (...a: any[]) => sideEffects.resolveStaffByChat(...a),
  runStaffCopilotTurn: (...a: any[]) => sideEffects.runStaffCopilotTurn(...a),
  can: () => true,
}));
vi.mock('../utils/student-copilot', () => ({
  resolveStudentByChat: (...a: any[]) => sideEffects.resolveStudentByChat(...a),
  resolveParentByChat: (...a: any[]) => sideEffects.resolveParentByChat(...a),
  runStudentTutorTurn: vi.fn(), runParentTurn: vi.fn(),
}));
vi.mock('../utils/homework-inbox', () => ({
  peekDraft: (...a: any[]) => sideEffects.peekDraft(...a),
  setDraft: (...a: any[]) => sideEffects.setDraft(...a),
  extractFileRef: () => null,
  listOpenHomework: vi.fn(), findHomework: vi.fn(), homeworkKeyboard: vi.fn(), renderHomeworkCard: vi.fn(),
  renderAcceptedText: vi.fn(), storeTelegramFile: vi.fn(), ingestHomeworkPart: vi.fn(), clearDraft: vi.fn(),
}));
vi.mock('../utils/sales-copilot', () => ({
  runSalesBotTurn: (...a: any[]) => sideEffects.runSalesBotTurn(...a),
}));
vi.mock('../utils/schedule-context', () => ({
  buildScheduleText: vi.fn(), buildStudentScheduleText: vi.fn(), resolveStaffScope: vi.fn(),
}));
vi.mock('../utils/onboarding', () => ({
  resolveJoinCode: vi.fn(), createOrJoinTelegramUser: vi.fn(), createLoginToken: vi.fn(),
  resolveClaimToken: vi.fn(), ensureParentKey: vi.fn(), ensureLoginCredentials: vi.fn(),
}));
vi.mock('../utils/notifications', () => ({ notifyOrgAdmins: vi.fn() }));

const verifyAuth = vi.fn();
vi.mock('../utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/auth')>()),
  verifyAuth: (...a: any[]) => verifyAuth(...a),
}));

// Bot API — через fetch: видно, что и с каким токеном ушло в Telegram.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const telegramReply = (url: string) => {
  const body = url.endsWith('/getMe') ? { ok: true, result: { username: 'academy_sales_bot' } } : { ok: true, result: true };
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};

const { handler: webhook } = await import('../api-telegram-webhook');
const { handler: telegramLink } = await import('../api-telegram-link');
const { handler: aiOrgManager } = await import('../api-ai-org-manager');

// ── fixtures ──────────────────────────────────────────────────────────────────
const SECRET = 'S3cret_webhook-token_0123456789abcdefABCDEF';
const BOT_TOKEN = 'test-bot-token';

/** Секрет бота организации считаем здесь независимо: поменяй вывод — и все зарегистрированные вебхуки организаций молча сломаются. */
const orgSecret = (orgId: string, master = SECRET) => createHmac('sha256', master).update(`org:${orgId}`).digest('hex');

// Telegram id сотрудника — не секрет: его видно в группах, пересланных сообщениях, у любого бота.
const ADMIN_TG = 700100200;
const DIRECTOR_TG = 700100300;
const TEACHER_TG = 700100400;
const STUDENT_TG = 700100500;

const APPROVE_PRESS = {
  update_id: 1,
  callback_query: { id: 'cb1', data: 'apv:0123456789abcdef:a', from: { id: ADMIN_TG }, message: { chat: { id: ADMIN_TG } } },
};
const REMIND_PRESS = { update_id: 2, callback_query: { id: 'cb2', data: 'dir:remind', from: { id: DIRECTOR_TG } } };
const HOMEWORK_PRESS = { update_id: 3, callback_query: { id: 'cb3', data: 'hw:p:lesson_1', from: { id: STUDENT_TG } } };
const COPILOT_ORDER = {
  update_id: 4,
  message: { message_id: 4, chat: { id: TEACHER_TG }, from: { id: TEACHER_TG }, text: 'Поставь Аброру 5 за сегодня' },
};
const START = (chatId: number) => ({ update_id: 5, message: { message_id: 5, chat: { id: chatId }, text: '/start' } });

const FORGED: [string, unknown][] = [
  ['«Принять» заявку на вступление от имени администратора (apv:)', APPROVE_PRESS],
  ['«Напомнить должникам» от имени директора (dir:)', REMIND_PRESS],
  ['выбор домашнего задания от имени ученика (hw:)', HOMEWORK_PRESS],
  ['поручение копилоту от имени преподавателя', COPILOT_ORDER],
];

function deliver(update: unknown, opts: { secret?: string; orgId?: string; headerName?: string } = {}) {
  const headers: Record<string, string> = { host: 'sabakhub.test', 'x-nf-client-connection-ip': '203.0.113.7' };
  if (opts.secret !== undefined) headers[opts.headerName ?? 'x-telegram-bot-api-secret-token'] = opts.secret;
  const qs = opts.orgId ? `?orgId=${encodeURIComponent(opts.orgId)}` : '';
  return webhook({
    httpMethod: 'POST',
    headers,
    rawUrl: `https://sabakhub.test/.netlify/functions/api-telegram-webhook${qs}`,
    queryStringParameters: opts.orgId ? { orgId: opts.orgId } : {},
    body: JSON.stringify(update),
  } as any, {} as any) as Promise<any>;
}

const authed = (fn: typeof telegramLink, rawUrl: string, body: unknown) =>
  fn({
    httpMethod: 'POST',
    headers: { authorization: 'Bearer t', host: 'sabakhub.test' },
    rawUrl,
    queryStringParameters: {},
    body: JSON.stringify(body),
  } as any, {} as any) as Promise<any>;

const urls = () => fetchMock.mock.calls.map(([url]) => String(url));
const setWebhookCall = () => fetchMock.mock.calls.find(([url]) => String(url).endsWith('/setWebhook'));

function expectUntouched() {
  expect(firestoreCalls).not.toHaveBeenCalled(); // ни одного чтения/записи Firestore
  expect(fetchMock).not.toHaveBeenCalled(); // ни одного запроса в Bot API
  for (const fn of Object.values(sideEffects)) expect(fn).not.toHaveBeenCalled();
}

const ENV = { ...process.env };
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  fetchMock.mockImplementation(async (url: any) => telegramReply(String(url)));
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  delete process.env.TELEGRAM_WEBHOOK_REPORT_ONLY;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
  process.env = { ...ENV };
});

describe('вебхук Telegram — поддельные обновления', () => {
  it.each(FORGED)('без заголовка секрета: %s — отбрасывается до любой обработки', async (_label, update) => {
    const res = await deliver(update);

    expect(res.statusCode).toBe(200); // не 4xx/5xx: иначе Telegram повторял бы доставку
    expectUntouched();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rejected update (missing, bot=global, ip="203.0.113.7")'));
  });

  it.each(FORGED)('с неверным секретом: %s — тоже', async (_label, update) => {
    for (const secret of ['wrong', `${SECRET}x`, SECRET.slice(1), SECRET.toLowerCase(), orgSecret('org_a')]) {
      const res = await deliver(update, { secret });
      expect(res.statusCode).toBe(200);
    }
    expectUntouched();
    expect(warn).toHaveBeenCalledTimes(5);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rejected update (mismatch, bot=global'));
  });

  it('секрет глобального бота не подходит к боту организации, а секрет одной организации — к другой', async () => {
    store.set('organizationAIManager/org_a', { isActive: true, telegramBotToken: 'org-a-bot-token' });

    await deliver(START(555), { orgId: 'org_a', secret: SECRET });
    await deliver(START(555), { orgId: 'org_a', secret: orgSecret('org_b') });
    await deliver(START(555), { orgId: 'org_a' });

    expectUntouched(); // даже документ настроек бота не прочитан
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rejected update (mismatch, bot=org:"org_a"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rejected update (missing, bot=org:"org_a"'));
  });

  it('orgId из адреса попадает в лог в кавычках — подделать строку лога им нельзя', async () => {
    await deliver(START(555), { orgId: 'x\n[telegram-webhook] all good', secret: 'wrong' });

    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('bot=org:"x\\n[telegram-webhook] all good"');
    expect(line).not.toContain('\n');
  });

  it('без TELEGRAM_WEBHOOK_SECRET вебхук закрыт целиком, а не открыт для всех', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    await deliver(APPROVE_PRESS);
    await deliver(APPROVE_PRESS, { secret: SECRET });

    expectUntouched();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('TELEGRAM_WEBHOOK_SECRET is not set'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rejected update (not_configured'));
  });

  it('секрет, который Telegram не примет или легко подобрать, считается ненастроенным', async () => {
    for (const bad of ['short-secret', 'q1Zx+9/Ab0cDeFgHiJkLmNoPqRsTuVwXyZ0123456789=']) {
      process.env.TELEGRAM_WEBHOOK_SECRET = bad;
      await deliver(APPROVE_PRESS, { secret: bad });
    }

    expectUntouched();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('TELEGRAM_WEBHOOK_SECRET is malformed'));
  });
});

describe('вебхук Telegram — настоящие обновления', () => {
  it('нажатие «Принять» с верным секретом доходит до решения по заявке от имени нажавшего', async () => {
    sideEffects.processApprovalDecision.mockResolvedValue({ ok: true, result: 'approved', applicantName: 'Аброр' });

    const res = await deliver(APPROVE_PRESS, { secret: SECRET });

    expect(res.statusCode).toBe(200);
    expect(sideEffects.processApprovalDecision).toHaveBeenCalledWith('0123456789abcdef', 'approve', String(ADMIN_TG));
    expect(urls()).toContain(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`);
    expect(warn).not.toHaveBeenCalled();
  });

  it('регистр имени заголовка значения не имеет', async () => {
    sideEffects.processApprovalDecision.mockResolvedValue({ ok: true, result: 'approved', applicantName: 'Аброр' });

    await deliver(APPROVE_PRESS, { secret: SECRET, headerName: 'X-Telegram-Bot-Api-Secret-Token' });

    expect(sideEffects.processApprovalDecision).toHaveBeenCalledTimes(1);
  });

  it('кнопка директора с верным секретом запускает напоминания должникам его центра', async () => {
    sideEffects.resolveDirectorByChat.mockResolvedValue({
      uid: 'u_dir', orgId: 'org_a', org: { planId: 'professional', name: 'Академия' },
    });
    sideEffects.remindOrgDebtors.mockResolvedValue({ sent: 3, skipped: 0 });

    await deliver(REMIND_PRESS, { secret: SECRET });

    expect(sideEffects.resolveDirectorByChat).toHaveBeenCalledWith(String(DIRECTOR_TG));
    expect(sideEffects.remindOrgDebtors).toHaveBeenCalledWith('org_a');
  });

  it('бот организации принимает свой производный секрет и отвечает своим токеном', async () => {
    store.set('organizationAIManager/org_a', {
      isActive: true, telegramBotToken: 'org-a-bot-token', greetingMessage: 'Салам! Чем помочь?',
    });

    const res = await deliver(START(555), { orgId: 'org_a', secret: orgSecret('org_a') });

    expect(res.statusCode).toBe(200);
    const sent = fetchMock.mock.calls.find(([url]) => String(url) === 'https://api.telegram.org/botorg-a-bot-token/sendMessage');
    expect(JSON.parse(sent![1].body)).toMatchObject({ chat_id: 555, text: 'Салам! Чем помочь?' });
  });
});

describe('переходный режим TELEGRAM_WEBHOOK_REPORT_ONLY', () => {
  it('обновление без секрета обрабатывается, а в лог пишется, что оно было бы отброшено', async () => {
    process.env.TELEGRAM_WEBHOOK_REPORT_ONLY = 'true';
    sideEffects.processApprovalDecision.mockResolvedValue({ ok: true, result: 'approved', applicantName: 'Аброр' });

    await deliver(APPROVE_PRESS);

    expect(sideEffects.processApprovalDecision).toHaveBeenCalledWith('0123456789abcdef', 'approve', String(ADMIN_TG));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('REPORT-ONLY: would reject update (missing, bot=global'));
  });

  it('любое другое значение флага — не переходный режим', async () => {
    process.env.TELEGRAM_WEBHOOK_REPORT_ONLY = '1';

    await deliver(APPROVE_PRESS);

    expectUntouched();
  });
});

describe('регистрация вебхука передаёт secret_token', () => {
  const LINK_URL = 'https://sabakhub.test/.netlify/functions/api-telegram-link';
  const ORG_MANAGER_URL = 'https://sabakhub.test/.netlify/functions/api-ai-org-manager';

  it('глобальный бот: запрос кода привязки перерегистрирует вебхук с секретом', async () => {
    verifyAuth.mockResolvedValue({ uid: 'u_teacher', role: 'teacher', organizationId: 'org_a' });

    const res = await authed(telegramLink, LINK_URL, { action: 'generate' });

    expect(res.statusCode).toBe(200);
    const [url, init] = setWebhookCall()!;
    expect(url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`);
    expect(JSON.parse(init.body)).toEqual({
      url: 'https://sabakhub.test/.netlify/functions/api-telegram-webhook',
      secret_token: SECRET,
    });
  });

  it('без секрета вебхук глобального бота не трогается: setWebhook без secret_token стёр бы секрет у Telegram', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    verifyAuth.mockResolvedValue({ uid: 'u_teacher', role: 'teacher', organizationId: 'org_a' });

    const res = await authed(telegramLink, LINK_URL, { action: 'generate' });

    expect(res.statusCode).toBe(200); // код привязки всё равно выдан
    expect(JSON.parse(res.body).code).toBeTruthy();
    expect(setWebhookCall()).toBeUndefined();
  });

  it('бот организации регистрируется со своим секретом — и вебхук принимает ровно его', async () => {
    store.set('organizations/org_a', { ownerId: 'u_owner', planId: 'professional', name: 'Академия' });
    verifyAuth.mockResolvedValue({ uid: 'u_owner', role: 'admin', organizationId: 'org_a' });

    const res = await authed(aiOrgManager, ORG_MANAGER_URL, {
      action: 'updateSettings', organizationId: 'org_a', isActive: true, telegramBotToken: '12345:org-a-bot-token',
    });

    expect(res.statusCode).toBe(200);
    const [url, init] = setWebhookCall()!;
    expect(url).toBe('https://api.telegram.org/bot12345:org-a-bot-token/setWebhook');
    const registered = JSON.parse(init.body);
    expect(registered).toEqual({
      url: 'https://sabakhub.test/.netlify/functions/api-telegram-webhook?orgId=org_a',
      secret_token: orgSecret('org_a'),
    });

    // Тот самый секрет, что ушёл в Telegram, вебхук и принимает.
    fetchMock.mockClear();
    await deliver(START(555), { orgId: 'org_a', secret: registered.secret_token });
    expect(urls()).toContain('https://api.telegram.org/bot12345:org-a-bot-token/sendMessage');
  });

  it('без секрета настройки бота организации не сохраняются, вместо регистрации вебхука без защиты', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    store.set('organizations/org_a', { ownerId: 'u_owner', planId: 'professional', name: 'Академия' });
    verifyAuth.mockResolvedValue({ uid: 'u_owner', role: 'admin', organizationId: 'org_a' });

    const res = await authed(aiOrgManager, ORG_MANAGER_URL, {
      action: 'updateSettings', organizationId: 'org_a', isActive: true, telegramBotToken: '12345:org-a-bot-token',
    });

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toContain('TELEGRAM_WEBHOOK_SECRET');
    expect(setWebhookCall()).toBeUndefined();
    expect(store.has('organizationAIManager/org_a')).toBe(false);
  });
});
