/**
 * Shared billing helpers for recurring (monthly) payment plans.
 * Used by api-org (syncPaymentPlans on enrollment) and the monthly-billing cron
 * so the period key and due date are computed identically on both sides.
 */
import { orgDayKey } from '../../../src/lib/payment-plans';

/** Billing period key for a date, e.g. "2026-07". Used to dedupe monthly invoices. */
export function billingPeriodKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Конец дня `dueDay` указанного месяца, с клампом к длине месяца (февраль, 31 → 28/29). */
function endOfDueDay(year: number, month: number, dueDay: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(Math.max(1, dueDay), lastDay);
  return new Date(year, month, day, 23, 59, 59);
}

/**
 * Deadline (ISO) for a monthly invoice: the `dueDay` of the period's month,
 * end of day. Clamped to the last day of the month for short months.
 *
 * ── Счёт не может родиться уже просроченным ──
 * Раньше срок считался строго от месяца периода, без оглядки на то, КОГДА счёт
 * выставляют. Поэтому любое начисление после 10-го числа появлялось с уже
 * истёкшим сроком:
 *   • студента завели в группу 25 августа (api-org.ts, автоматическая ветка) —
 *     счёт со сроком «10.08» создавался вообще без участия менеджера;
 *   • менеджер нажал «Начислить за месяц» 15-го — то же самое.
 * Дальше просрочка работала по-настоящему: студенту сразу уходило «Оплатить до
 * 10.08.2026» (дата в прошлом), а через несколько дней — «Оплата просрочена».
 * Продлить срок из интерфейса нечем: EditPlanAmountModal правит только сумму.
 *
 * Поэтому, если день срока в месяце периода уже прошёл по календарю
 * организации, срок переносится на ТОТ ЖЕ день следующего месяца. Ритм оплаты
 * сохраняется («всегда 10-е»), и это можно объяснить родителю одной фразой —
 * в отличие от «дата выставления плюс сколько-то дней», которая давала бы
 * произвольные числа вроде 22-го.
 *
 * `now` параметризован ради тестируемости; по умолчанию — текущий момент.
 */
export function billingDeadlineISO(d: Date, dueDay = 10, now: Date = new Date()): string {
  const year = d.getFullYear();
  const month = d.getMonth();

  const candidate = endOfDueDay(year, month, dueDay);
  // Сравниваем календарные ДНИ в зоне организации (UTC+6): функция выполняется
  // на Netlify в UTC, и сравнение моментов сдвигало бы границу суток на шесть
  // часов — ровно та ошибка, из-за которой существует orgDayKey.
  if (candidate.toISOString().slice(0, 10) >= orgDayKey(now)) return candidate.toISOString();

  return endOfDueDay(year, month + 1, dueDay).toISOString();
}
