/**
 * Захват аккаунта через бота (ревью 02.11.2026).
 *
 * Бот выдаёт чату беспарольный вход в аккаунт, к которому этот чат привязан, поэтому
 * привязка — граница доверия:
 *  • при регистрации номер берётся только из СВОЕГО контакта: карточка из записной
 *    книжки несёт чужой user_id (или никакого), а номер находит чужой аккаунт;
 *  • ссылка claim_ одноразовая и не перепривязывает аккаунт, уже связанный с другим
 *    Telegram, — пересланная или утёкшая ссылка не даёт войти под владельцем.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── in-memory Firestore: just the doc operations these paths use ──
const store = new Map<string, any>();
const docRef = (path: string): any => ({
  id: path.split('/').pop(),
  path,
  get: async () => {
    const v = store.get(path);
    return { exists: v !== undefined, id: path.split('/').pop(), data: () => (v === undefined ? undefined : { ...v }) };
  },
  set: async (data: any, opts?: { merge?: boolean }) => {
    store.set(path, opts?.merge ? { ...(store.get(path) || {}), ...data } : { ...data });
  },
  update: async (data: any) => { store.set(path, { ...(store.get(path) || {}), ...data }); },
  delete: async () => { store.delete(path); },
});

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: (name: string) => ({ doc: (id: string) => docRef(`${name}/${id}`) }),
    runTransaction: async (fn: (tx: any) => Promise<any>) => fn({
      get: (ref: any) => ref.get(),
      set: (ref: any, data: any, opts?: any) => { ref.set(data, opts); },
      delete: (ref: any) => { ref.delete(); },
    }),
  },
}));
vi.mock('../utils/telegram', () => ({ getTelegramBotToken: () => 'test-token', resolveTelegramLinkCode: vi.fn(), sendTelegramToUser: vi.fn() }));
vi.mock('../utils/identity', () => ({ resolveOrCreateUserByPhone: vi.fn() }));
vi.mock('../utils/notifications', () => ({ notifyOrgAdmins: vi.fn(), notifyJoinRequest: vi.fn() }));
vi.mock('../utils/join-approvals', () => ({ processApprovalDecision: vi.fn() }));
vi.mock('../utils/director-copilot', () => ({ directorMenuKeyboard: vi.fn(), resolveDirectorByChat: vi.fn() }));
vi.mock('../utils/copilot-actions', () => ({ resolveStaffByChat: vi.fn().mockResolvedValue(null), runStaffCopilotTurn: vi.fn(), can: vi.fn() }));
vi.mock('../utils/sales-copilot', () => ({ runSalesBotTurn: vi.fn() }));
vi.mock('../utils/student-copilot', () => ({
  resolveStudentByChat: vi.fn().mockResolvedValue(null), runStudentTutorTurn: vi.fn(),
  resolveParentByChat: vi.fn().mockResolvedValue(null), runParentTurn: vi.fn(),
}));
vi.mock('../utils/schedule-context', () => ({ buildScheduleText: vi.fn(), buildStudentScheduleText: vi.fn(), resolveStaffScope: vi.fn() }));
vi.mock('../utils/homework-inbox', () => ({
  extractFileRef: vi.fn(() => null), peekDraft: vi.fn().mockResolvedValue(null),
  listOpenHomework: vi.fn(), findHomework: vi.fn(), homeworkKeyboard: vi.fn(), renderHomeworkCard: vi.fn(),
  renderAcceptedText: vi.fn(), storeTelegramFile: vi.fn(), ingestHomeworkPart: vi.fn(), setDraft: vi.fn(), clearDraft: vi.fn(),
}));

import { handler } from '../api-telegram-webhook';

const sent: any[] = [];
vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: any) => {
  if (init?.body) sent.push(JSON.parse(init.body));
  return { ok: true, json: async () => ({ ok: true }), text: async () => '' };
}));

// Updates arrive from Telegram itself, so the webhook's secret check passes.
const SECRET = 'test-webhook-secret-0123456789abcdef';
process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;

const update = (message: object) => handler({
  httpMethod: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET }, rawUrl: 'https://app.test/.netlify/functions/api-telegram-webhook',
  body: JSON.stringify({ message }),
} as any, {} as any);

const ATTACKER = 111;
const loginButtons = () => sent.filter(m => JSON.stringify(m.reply_markup || '').includes('/tg-login?ott='));

beforeEach(() => {
  store.clear();
  sent.length = 0;
});

describe('регистрация: номер только из своего контакта', () => {
  beforeEach(() => {
    store.set(`telegramRegistrations/${ATTACKER}`, { orgId: 'org-1', role: 'student', orgName: 'Центр', step: 'awaiting_contact' });
  });

  it('чужая карточка контакта не принимается', async () => {
    await update({
      chat: { id: ATTACKER }, from: { id: ATTACKER, first_name: 'X' },
      contact: { phone_number: '+996555000111', first_name: 'Директор', user_id: 999 },
    });
    expect(store.get(`telegramRegistrations/${ATTACKER}`)).toMatchObject({ step: 'awaiting_contact' });
    expect(store.get(`telegramRegistrations/${ATTACKER}`).phone).toBeUndefined();
    expect(sent.at(-1).text).toContain('собственный');
  });

  it('контакт без user_id (не пользователь Telegram) не принимается', async () => {
    await update({
      chat: { id: ATTACKER }, from: { id: ATTACKER },
      contact: { phone_number: '+996555000111', first_name: 'Директор' },
    });
    expect(store.get(`telegramRegistrations/${ATTACKER}`).phone).toBeUndefined();
  });

  it('свой номер с кнопки принимается', async () => {
    await update({
      chat: { id: ATTACKER }, from: { id: ATTACKER, first_name: 'Айпери' },
      contact: { phone_number: '+996555000222', first_name: 'Айпери', user_id: ATTACKER },
    });
    expect(store.get(`telegramRegistrations/${ATTACKER}`)).toMatchObject({ step: 'awaiting_name', phone: '+996555000222' });
  });
});

describe('ссылка claim_', () => {
  const claimToken = 'tok123';
  beforeEach(() => {
    store.set('users/u-teacher', { displayName: 'Айгерим', role: 'teacher' });
    store.set(`orgClaimTokens/${claimToken}`, { uid: 'u-teacher', orgId: 'org-1', expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  });

  it('одноразовая: повторный переход из другого чата не даёт входа', async () => {
    await update({ chat: { id: 222 }, from: { id: 222 }, text: `/start claim_${claimToken}` });
    expect(store.get('users/u-teacher').telegramChatId).toBe('222');
    expect(loginButtons()).toHaveLength(1);
    expect(store.has(`orgClaimTokens/${claimToken}`)).toBe(false);

    sent.length = 0;
    await update({ chat: { id: ATTACKER }, from: { id: ATTACKER }, text: `/start claim_${claimToken}` });
    expect(store.get('users/u-teacher').telegramChatId).toBe('222');
    expect(loginButtons()).toHaveLength(0);
    expect(sent.at(-1).text).toContain('недействительна');
  });

  it('аккаунт, привязанный к другому Telegram, не перепривязывается', async () => {
    store.set('users/u-teacher', { displayName: 'Айгерим', role: 'teacher', telegramChatId: '222' });
    await update({ chat: { id: ATTACKER }, from: { id: ATTACKER }, text: `/start claim_${claimToken}` });
    expect(store.get('users/u-teacher').telegramChatId).toBe('222');
    expect(loginButtons()).toHaveLength(0);
    expect(sent.at(-1).text).toContain('уже подключён');
    expect(store.has(`orgClaimTokens/${claimToken}`)).toBe(false);
  });

  it('просроченная ссылка не работает', async () => {
    store.set(`orgClaimTokens/${claimToken}`, { uid: 'u-teacher', orgId: 'org-1', expiresAt: new Date(Date.now() - 1000).toISOString() });
    await update({ chat: { id: ATTACKER }, from: { id: ATTACKER }, text: `/start claim_${claimToken}` });
    expect(store.get('users/u-teacher').telegramChatId).toBeUndefined();
    expect(loginButtons()).toHaveLength(0);
  });
});
