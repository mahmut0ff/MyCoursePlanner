/**
 * WhatsApp как ЗАПАСНОЙ канал напоминаний об оплате.
 *
 * Проверяем ровно те две вещи, из-за которых канал вообще может навредить:
 *  1) платный шаблон не уходит тому, кому напоминание уже ушло в Telegram;
 *  2) в шаблон подставляются имя, сумма и тот же самый день срока, по которому
 *     считается просрочка (а не сдвинутый часовым поясом).
 * Плюс разбор телефона: Cloud API на кривой номер отвечает 200 и молчит, так
 * что мусор обязан отсеиваться до отправки.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const plans: any[] = [];
const users: Record<string, any> = {};
const activeMembers: string[] = [];
const notifications: any[] = [];

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: {
    collection: (name: string) => {
      if (name === 'studentPaymentPlans') {
        return {
          where: () => ({
            get: async () => ({
              docs: plans.map((p, i) => ({
                id: p.id || 'plan-' + i,
                data: () => p,
                ref: { update: async (u: any) => Object.assign(p, u) },
              })),
            }),
          }),
        };
      }
      if (name === 'orgMembers') {
        return {
          doc: () => ({
            collection: () => ({
              where: () => ({
                get: async () => ({
                  docs: activeMembers.map(id => ({ id, data: () => ({ userId: id, status: 'active' }) })),
                }),
              }),
            }),
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: (id: string) => ({ get: async () => ({ exists: Boolean(users[id]), data: () => users[id] }) }),
        };
      }
      throw new Error('unexpected collection: ' + name);
    },
  },
}));

vi.mock('../utils/notifications', () => ({
  createNotification: vi.fn(async (n: any) => { notifications.push(n); }),
  notifyOrgAdmins: vi.fn(async () => {}),
}));

import { handler } from '../debt-reminders';
import { normalizePhone, sendWhatsAppToUser, isWhatsAppConfigured } from '../utils/whatsapp';
import { orgDayKey } from '../utils/payment-plans';

const ORG = 'org-1';
const STUDENT = 'student-1';

let fetchMock: any;

/** Тело последнего запроса к Cloud API. */
const lastSend = () => JSON.parse(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].body);
const run = () => handler({ httpMethod: 'POST', headers: {} } as any, {} as any, () => {}) as Promise<any>;

beforeEach(() => {
  plans.length = 0;
  activeMembers.length = 0;
  notifications.length = 0;
  for (const k of Object.keys(users)) delete users[k];

  process.env.WHATSAPP_TOKEN = 'test-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1275848325615088';

  fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  vi.unstubAllGlobals();
});

describe('номер телефона', () => {
  it('приводит местные записи к виду для Cloud API', () => {
    expect(normalizePhone('+996 555 12-34-56')).toBe('996555123456');
    expect(normalizePhone('0555123456')).toBe('996555123456');
    expect(normalizePhone('555123456')).toBe('996555123456');
    expect(normalizePhone('00996555123456')).toBe('996555123456');
  });

  it('отбрасывает то, что телефоном не является', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('нет')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
  });
});

describe('когда канал молчит', () => {
  it('без токена не делает ни одного запроса наружу', async () => {
    delete process.env.WHATSAPP_TOKEN;
    users[STUDENT] = { phone: '0555123456' };

    expect(isWhatsAppConfigured()).toBe(false);
    const outcome = await sendWhatsAppToUser(STUDENT, { name: 'payment_reminder_ru', language: 'ru' });

    expect(outcome).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('не тратит платный шаблон на того, у кого привязан Telegram', async () => {
    users[STUDENT] = { phone: '0555123456', telegramChatId: '123456' };

    const outcome = await sendWhatsAppToUser(STUDENT, { name: 'payment_reminder_ru', language: 'ru' });

    expect(outcome).toBe('telegram_linked');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('различает «нет телефона» и «телефон нечитаем»', async () => {
    users['no-phone'] = { name: 'Без телефона' };
    users['bad-phone'] = { phone: '123' };

    expect(await sendWhatsAppToUser('no-phone', { name: 't', language: 'ru' })).toBe('no_phone');
    expect(await sendWhatsAppToUser('bad-phone', { name: 't', language: 'ru' })).toBe('bad_phone');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('отказ Meta не выдаёт за отправку', async () => {
    users[STUDENT] = { phone: '0555123456' };
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'template not approved' });

    expect(await sendWhatsAppToUser(STUDENT, { name: 't', language: 'ru' })).toBe('api_error');
  });
});

describe('напоминание об оплате', () => {
  const seedDuePlan = (extra: any = {}) => {
    activeMembers.push(STUDENT);
    plans.push({
      id: 'plan-1',
      organizationId: ORG,
      studentId: STUDENT,
      studentName: 'Айгерим Асанова',
      courseName: 'Английский',
      status: 'pending',
      totalAmount: 5000,
      paidAmount: 0,
      deadline: orgDayKey(),   // срок сегодня — напоминание положено
      ...extra,
    });
  };

  it('уходит в WhatsApp с именем, суммой и сроком того же дня', async () => {
    seedDuePlan();
    users[STUDENT] = { phone: '0555 123 456' };

    const res = await run();

    expect(JSON.parse(res.body).whatsappSent).toBe(1);
    expect(notifications).toHaveLength(1);

    const body = lastSend();
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('996555123456');
    expect(body.template.name).toBe('payment_reminder_ru');
    expect(body.template.language.code).toBe('ru');

    const params = body.template.components[0].parameters.map((p: any) => p.text);
    const [day, month, year] = orgDayKey().split('-').reverse();
    expect(params[0]).toBe('Айгерим Асанова');
    expect(params[1].replace(/\s/g, ' ')).toBe('5 000 с.');
    expect(params[2]).toBe([day, month, year].join('.'));
  });

  it('того же студента не дублирует, когда у него есть Telegram', async () => {
    seedDuePlan();
    users[STUDENT] = { phone: '0555123456', telegramChatId: '999' };

    const res = await run();

    expect(JSON.parse(res.body).whatsappSent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    // Напоминание при этом никуда не делось — оно ушло обычным путём.
    expect(notifications).toHaveLength(1);
  });

  it('второй раз за день не пишет', async () => {
    seedDuePlan({ lastDebtReminderDate: orgDayKey() });
    users[STUDENT] = { phone: '0555123456' };

    const res = await run();

    expect(JSON.parse(res.body).whatsappSent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
