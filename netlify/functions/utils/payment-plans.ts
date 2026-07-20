/**
 * Payment-plan predicates — re-exported from the shared module.
 *
 * The implementation and the long WHY comments live in `src/lib/payment-plans.ts`
 * so the SPA and these functions share ONE definition. That is not tidiness: the
 * server was fixed to exclude written-off (`'cancelled'`) plans from debt while
 * `StudentDetailPage` kept its own `totalAmount - paidAmount`, so a student's card
 * showed a debt the finance section said did not exist — an academy reported it as
 * a phantom debt. A second copy is how they drifted; there is now no second copy.
 *
 * This file stays because ten server consumers already import from here and this
 * is where a backend reader looks for the debt rule.
 */
export {
  planDebt,
  isDebtBearingPlan,
  isWrittenOffPlan,
  orgDayKey,
  daysUntilDeadline,
  isDeadlineMissed,
  isPlanOverdue,
} from '../../../src/lib/payment-plans';
