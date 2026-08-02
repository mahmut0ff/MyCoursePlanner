import { describe, it, expect } from 'vitest';
import { billingDeadlineISO, billingPeriodKey } from '../utils/billing';

/**
 * Срок помесячного счёта. Главное правило: счёт НИКОГДА не появляется уже
 * просроченным — иначе студенту сразу уходит «Оплатить до <вчера>», а следом
 * автоматическое «Оплата просрочена» за деньги, которых ещё никто не ждал.
 */
describe('billingDeadlineISO', () => {
  const day = (iso: string) => iso.slice(0, 10);

  it('ставит dueDay месяца периода, когда он ещё впереди', () => {
    // Начисляем за август 3-го августа: 10-е ещё не наступило.
    const deadline = billingDeadlineISO(new Date(2026, 7, 1), 10, new Date('2026-08-03T09:00:00Z'));
    expect(day(deadline)).toBe('2026-08-10');
  });

  it('день срока сегодня — это ещё НЕ просрочка, срок не переносится', () => {
    const deadline = billingDeadlineISO(new Date(2026, 7, 1), 10, new Date('2026-08-10T05:00:00Z'));
    expect(day(deadline)).toBe('2026-08-10');
  });

  it('переносит срок на следующий месяц, если день периода уже прошёл', () => {
    // Студента завели в группу 25 августа — счёт со сроком 10.08 родился бы
    // просроченным.
    const deadline = billingDeadlineISO(new Date(2026, 7, 25), 10, new Date('2026-08-25T09:00:00Z'));
    expect(day(deadline)).toBe('2026-09-10');
  });

  it('перенос через границу года остаётся корректным', () => {
    const deadline = billingDeadlineISO(new Date(2026, 11, 20), 10, new Date('2026-12-20T09:00:00Z'));
    expect(day(deadline)).toBe('2027-01-10');
  });

  it('клампит dueDay к длине короткого месяца', () => {
    const deadline = billingDeadlineISO(new Date(2027, 1, 1), 31, new Date('2027-02-01T09:00:00Z'));
    expect(day(deadline)).toBe('2027-02-28');
  });

  it('считает границу суток по дню организации (UTC+6), а не по UTC', () => {
    // 2026-08-10T20:00:00Z — это уже 11 августа в Бишкеке, то есть 10-е истекло.
    const deadline = billingDeadlineISO(new Date(2026, 7, 1), 10, new Date('2026-08-10T20:00:00Z'));
    expect(day(deadline)).toBe('2026-09-10');
  });
});

describe('billingPeriodKey', () => {
  it('даёт ключ YYYY-MM с ведущим нулём', () => {
    expect(billingPeriodKey(new Date(2026, 0, 15))).toBe('2026-01');
    expect(billingPeriodKey(new Date(2026, 11, 1))).toBe('2026-12');
  });
});
