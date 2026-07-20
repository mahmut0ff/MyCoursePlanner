/**
 * Payment-plan predicates — the single source of truth for "does this plan still
 * owe us money?".
 *
 * `studentPaymentPlans.status` can be `'cancelled'`: api-org.ts writes it when a
 * student is removed from a group while their plan is still untouched (pending,
 * nothing paid). That is a write-off — the academy has stopped claiming the money.
 *
 * Almost every consumer used to skip only `'paid'`, so cancelled plans kept
 * inflating outstanding-debt totals, kept their students in debtor lists and risk
 * counts, and — worst of all — kept them on the automated Telegram reminder list
 * for money nobody expects them to pay. api-finance-metrics was fixed first, which
 * made the dashboard and the AI copilot report different debt for the same org on
 * the same day. Everything that asks the debt question now asks it here.
 *
 * Deliberately dependency-free so any function (including hot, non-AI endpoints
 * like api-dashboard / api-risk) can import it without dragging in a module graph.
 */

/** Statuses that mean the plan is settled or written off — never debt-bearing. */
const SETTLED_STATUSES = ['paid', 'cancelled'];

/** Remaining balance on a plan, floored at 0 (an overpayment is not a negative debt). */
export function planDebt(plan: any): number {
  return Math.max(0, (plan?.totalAmount || 0) - (plan?.paidAmount || 0));
}

/**
 * True when a plan still represents money the org is owed: it is neither paid nor
 * cancelled AND it has a positive outstanding balance.
 *
 * Use this for debt totals, debtor lists, overdue counts, risk signals, digest
 * figures and — most importantly — automated reminder recipient selection.
 */
export function isDebtBearingPlan(plan: any): boolean {
  if (!plan) return false;
  if (SETTLED_STATUSES.includes(plan.status)) return false;
  return planDebt(plan) > 0;
}
