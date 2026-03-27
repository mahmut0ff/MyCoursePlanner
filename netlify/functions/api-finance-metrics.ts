/**
 * API: Finance Metrics — Aggregations for SaaS Dashboards.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, resolveBranchFilter, ok, unauthorized, forbidden, badRequest, jsonResponse } from './utils/auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  // GET Metrics
  if (event.httpMethod === 'GET') {
    if (!isStaff(user) || user.role === 'teacher') return forbidden();

    const orgFilter = getOrgFilter(user);
    if (!orgFilter) return badRequest('Organization context required');

    const params = event.queryStringParameters || {};
    const branchFilter = resolveBranchFilter(user, params.branchId);
    if (branchFilter === '__DENIED__') return forbidden('Access denied');

    // For a real production app we'd use Firebase Cloud Functions pub/sub aggregators.
    // Given the scale, we can query recent transactions up to 1000 docs and do dynamic reduce.
    
    // 1. Fetch Transactions
    let trxQuery: FirebaseFirestore.Query = adminDb.collection('financeTransactions')
      .where('organizationId', '==', orgFilter);
      
    if (typeof branchFilter === 'string') trxQuery = trxQuery.where('branchId', '==', branchFilter);
    else if (Array.isArray(branchFilter) && branchFilter.length > 0) trxQuery = trxQuery.where('branchId', 'in', branchFilter);

    // Filter to current month (approx)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0,0,0,0);

    const trxsSnap = await trxQuery.where('date', '>=', startOfMonth.toISOString()).get();
    
    let totalIncome = 0;
    let totalExpense = 0;
    
    trxsSnap.docs.forEach(d => {
      const data = d.data();
      if (data.type === 'income') totalIncome += (data.amount || 0);
      if (data.type === 'expense') totalExpense += (data.amount || 0);
    });

    const netProfit = totalIncome - totalExpense;

    // 2. Fetch Payment Plans (for Debt / Collection Rate)
    let plansQuery: FirebaseFirestore.Query = adminDb.collection('studentPaymentPlans')
      .where('organizationId', '==', orgFilter)
      .where('status', 'in', ['overdue', 'partial', 'pending']);
      
    if (typeof branchFilter === 'string') plansQuery = plansQuery.where('branchId', '==', branchFilter);
    else if (Array.isArray(branchFilter) && branchFilter.length > 0) plansQuery = plansQuery.where('branchId', 'in', branchFilter);

    const plansSnap = await plansQuery.get();
    let totalActiveDebt = 0;
    let overdueCount = 0;

    plansSnap.docs.forEach(d => {
      const data = d.data();
      const debt = (data.totalAmount || 0) - (data.paidAmount || 0);
      if (debt > 0) {
        totalActiveDebt += debt;
        if (data.status === 'overdue') overdueCount++;
      }
    });

    return ok({
      period: 'current_month',
      totalIncome,
      totalExpense,
      netProfit,
      totalActiveDebt,
      overdueCount
    });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
