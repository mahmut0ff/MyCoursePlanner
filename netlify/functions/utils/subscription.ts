/**
 * Manual org-subscription helpers — the org is "paid through" a date (`paidUntil`)
 * that the super-admin sets by hand. After the date passes there's a short grace
 * window; once that elapses, access is auto-blocked (status → expired).
 *
 * (Distinct from utils/billing.ts, which handles student monthly payment plans.)
 */

/** Days after `paidUntil` before access is auto-blocked. */
export const GRACE_DAYS = 3;

const DAY = 86_400_000;

export interface PaidUntilInfo {
  hasPaidUntil: boolean;
  /** Whole days until the due date; negative once overdue. Null when no date set. */
  daysUntilDue: number | null;
  isOverdue: boolean;
  /** Overdue beyond the grace window — safe to auto-block. */
  isPastGrace: boolean;
}

export function computePaidUntil(paidUntil?: string | null, nowMs: number = Date.now()): PaidUntilInfo {
  if (!paidUntil) return { hasPaidUntil: false, daysUntilDue: null, isOverdue: false, isPastGrace: false };
  const due = new Date(paidUntil).getTime();
  if (isNaN(due)) return { hasPaidUntil: false, daysUntilDue: null, isOverdue: false, isPastGrace: false };
  return {
    hasPaidUntil: true,
    daysUntilDue: Math.ceil((due - nowMs) / DAY),
    isOverdue: nowMs > due,
    isPastGrace: nowMs > due + GRACE_DAYS * DAY,
  };
}
