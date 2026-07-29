import { describe, it, expect } from 'vitest';
import { planProgressKey, isPlanOverdue } from '../payment-plans';

// Фиксированное «сегодня», чтобы просрочка была детерминированной.
const NOW = new Date('2026-07-28T12:00:00Z');
const past = '2026-07-10';   // срок прошёл
const future = '2026-08-10'; // срок ещё не наступил

/**
 * Что показывает карточка оплаты на странице студента: бейдж (прогресс оплаты) и
 * отдельная метка «срок прошёл». Регресс, ради которого всё затевалось: частичная
 * оплата просроченного месяца обязана оставаться «Частично» + «срок прошёл», а НЕ
 * схлопываться в голое «Просрочено», прячущее внесённый платёж.
 */
describe('planProgressKey — бейдж = только прогресс оплаты, просрочка отдельно', () => {
  const card = (plan: any) => ({
    badge: planProgressKey(plan),
    // Метка «срок прошёл» — ровно как в карточке: не для списанного, по сроку.
    overdueTag: planProgressKey(plan) !== 'cancelled' && isPlanOverdue(plan, NOW),
  });

  it('ничего не оплачено, срок не прошёл → Ожидает, без метки', () => {
    expect(card({ totalAmount: 5000, paidAmount: 0, status: 'pending', deadline: future }))
      .toEqual({ badge: 'pending', overdueTag: false });
  });

  it('частичная оплата, срок ПРОШЁЛ → Частично + «срок прошёл» (тот самый баг)', () => {
    // Раньше бейдж был «Просрочено», и внесённые 2000 пропадали с карточки.
    expect(card({ totalAmount: 5000, paidAmount: 2000, status: 'partial', deadline: past }))
      .toEqual({ badge: 'partial', overdueTag: true });
  });

  it('частичная оплата, срок НЕ прошёл → Частично, без метки', () => {
    expect(card({ totalAmount: 5000, paidAmount: 2000, status: 'partial', deadline: future }))
      .toEqual({ badge: 'partial', overdueTag: false });
  });

  it('оплачено полностью → Оплачено, метки нет даже при сроке в прошлом', () => {
    expect(card({ totalAmount: 5000, paidAmount: 5000, status: 'paid', deadline: past }))
      .toEqual({ badge: 'paid', overdueTag: false });
  });

  it('серверный статус overdue не делает бейдж «Просрочено» — прогресс важнее', () => {
    expect(planProgressKey({ totalAmount: 5000, paidAmount: 2000, status: 'overdue', deadline: past }))
      .toBe('partial');
  });

  it('списанный счёт → Списан, просрочки по нему не бывает', () => {
    expect(card({ totalAmount: 5000, paidAmount: 0, status: 'cancelled', deadline: past }))
      .toEqual({ badge: 'cancelled', overdueTag: false });
  });

  it('легаси-план без суммы месяца не выдаётся за «Оплачено» после первого платежа', () => {
    expect(planProgressKey({ paidAmount: 2000, status: 'partial', deadline: past })).toBe('partial');
    expect(planProgressKey({ paidAmount: 0, status: 'pending' })).toBe('pending');
  });
});
