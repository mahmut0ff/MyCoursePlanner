/**
 * Display-name lookups shared by the finance endpoints. Both the plans list and
 * the transactions ledger resolve the same users/courses, so they resolve them
 * the same way — two copies drifted into showing different labels for one id.
 */
import { getDocsByIds } from './firebase-admin';

/**
 * Batch-fetch display names for a set of user IDs.
 * Returns a Map<uid, displayName>.
 */
export async function batchGetUserNames(uids: string[]): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (uids.length === 0) return nameMap;

  const docs = await getDocsByIds('users', uids, ['displayName', 'firstName', 'lastName', 'name']);
  for (const [id, d] of Object.entries(docs)) {
    const name = d.displayName
      || [d.firstName, d.lastName].filter(Boolean).join(' ')
      || d.name
      || '';
    nameMap.set(id, name);
  }
  return nameMap;
}

/**
 * Batch-fetch course titles for a set of course IDs, scoped to one org.
 *
 * The `orgId` scope is now actually APPLIED, not merely documented: getDocsByIds
 * fetches by document id, which knows nothing about tenancy, so a courseId that
 * leaked into a transaction/plan row from another org used to come back with that
 * org's course title attached — a cross-tenant name disclosure in a plain list
 * response. Courses whose document carries a different organizationId are
 * skipped; the caller then falls back to showing the raw id.
 */
export async function batchGetCourseNames(orgId: string, courseIds: string[]): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (courseIds.length === 0 || !orgId) return nameMap;

  const docs = await getDocsByIds('courses', courseIds, ['title', 'name', 'organizationId']);
  for (const [id, d] of Object.entries(docs)) {
    if (d.organizationId !== orgId) continue;
    nameMap.set(id, d.title || d.name || '');
  }
  return nameMap;
}

/**
 * Status ladder for a payment plan. Extracted because four call sites in
 * api-finance-transactions.ts each re-derived it and one of them was missing the
 * zero arm, leaving plans parked in 'partial' with paidAmount 0.
 *
 * `currentStatus` is the plan's status before this recalculation. 'cancelled' is
 * a write-off decision made by a human (api-org.ts cancels plans when a student
 * leaves a course); editing or deleting an old transaction against such a plan
 * must not resurrect it into 'pending'/'partial' and drag a written-off student
 * back into the debt KPI and the reminder queue. Pass `allowRevive` only where
 * the caller genuinely intends to reopen a cancelled plan.
 *
 * 'overdue' is preserved for the same reason, one level down: it is a real state
 * this ladder cannot re-derive (it depends on `deadline`, which we are not given).
 * Without this arm a partial payment, an edit or a delete against an overdue plan
 * silently demoted it to 'partial'/'pending' — dropping it out of every
 * `?status=overdue` query and out of the debt-reminder flow until some later GET
 * of api-finance-plans happened to sweep it back up. Only full payment clears it,
 * which is why the 'paid' arm is checked first.
 */
export function derivePlanStatus(
  paidAmount: number,
  totalAmount: number | undefined | null,
  currentStatus?: string | null,
  allowRevive = false,
): string {
  if (currentStatus === 'cancelled' && !allowRevive) return 'cancelled';
  // An unknown or zero total is NOT a satisfied debt. `paid >= (total || 0)`
  // turned every legacy plan with a missing totalAmount into 'paid' on the first
  // payment, silently dropping real debt out of the KPI, the debtor list and the
  // overdue count. Only a positive, finite total can be "fully paid".
  const total = Number(totalAmount);
  if (Number.isFinite(total) && total > 0 && paidAmount >= total) return 'paid';
  // Долг остался — просрочка никуда не делась.
  if (currentStatus === 'overdue') return 'overdue';
  if (paidAmount === 0) return 'pending';
  return 'partial';
}
