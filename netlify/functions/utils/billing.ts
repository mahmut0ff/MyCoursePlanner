/**
 * Shared billing helpers for recurring (monthly) payment plans.
 * Used by api-org (syncPaymentPlans on enrollment) and the monthly-billing cron
 * so the period key and due date are computed identically on both sides.
 */

/** Billing period key for a date, e.g. "2026-07". Used to dedupe monthly invoices. */
export function billingPeriodKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Deadline (ISO) for a monthly invoice: the `dueDay` of the period's month,
 * end of day. Clamped to the last day of the month for short months.
 */
export function billingDeadlineISO(d: Date, dueDay = 10): string {
  const year = d.getFullYear();
  const month = d.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(Math.max(1, dueDay), lastDay);
  return new Date(year, month, day, 23, 59, 59).toISOString();
}
