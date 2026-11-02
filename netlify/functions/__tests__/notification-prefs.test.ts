/** Экран настроек обещает: общий выключатель глушит и push, и Telegram; категория — свои типы. */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../utils/firebase-admin', () => ({ adminDb: {} }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: vi.fn() }));

import { prefsAllow } from '../utils/notifications';

describe('prefsAllow', () => {
  it('по умолчанию пропускает всё', () => {
    expect(prefsAllow({}, 'payment_due')).toBe(true);
  });
  it('общий выключатель глушит любой тип, включая оплату', () => {
    expect(prefsAllow({ notificationPreferences: { pushEnabled: false } }, 'payment_due')).toBe(false);
  });
  it('выключенная категория глушит только свои типы', () => {
    const u = { notificationPreferences: { homework: false } };
    expect(prefsAllow(u, 'homework_assigned')).toBe(false);
    expect(prefsAllow(u, 'grade_posted')).toBe(true);
  });
});
