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

  try {
    // GET Metrics
    if (event.httpMethod === 'GET') {
      if (!isStaff(user) || user.role === 'teacher') return forbidden();

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      const params = event.queryStringParameters || {};
      const branchFilter = resolveBranchFilter(user, params.branchId);
      if (branchFilter === '__DENIED__') return forbidden('Access denied');

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0,0,0,0);
      const startIso = startOfMonth.toISOString();

      // 1. Fetch Transactions (Memory filter to bypass missing composite indexes)
      const trxsSnap = await adminDb.collection('financeTransactions')
        .where('organizationId', '==', orgFilter).get();
      
      let totalIncome = 0;
      let totalExpense = 0;
      
      trxsSnap.docs.forEach(d => {
        const data = d.data();
        // date filter
        if (data.date < startIso) return;
        
        // branch filter
        if (typeof branchFilter === 'string' && data.branchId !== branchFilter) return;
        if (Array.isArray(branchFilter) && branchFilter.length > 0 && !branchFilter.includes(data.branchId)) return;

        if (data.type === 'income') totalIncome += (data.amount || 0);
        if (data.type === 'expense') totalExpense += (data.amount || 0);
      });

      const netProfit = totalIncome - totalExpense;

      // 2. Fetch Payment Plans (Memory filter)
      const plansSnap = await adminDb.collection('studentPaymentPlans')
        .where('organizationId', '==', orgFilter).get();
        
      let totalActiveDebt = 0;
      let overdueCount = 0;
      const invalidStatuses = ['paid'];

      plansSnap.docs.forEach(d => {
        const data = d.data();
        if (invalidStatuses.includes(data.status)) return;
        
        // branch filter
        if (typeof branchFilter === 'string' && data.branchId !== branchFilter) return;
        if (Array.isArray(branchFilter) && branchFilter.length > 0 && !branchFilter.includes(data.branchId)) return;

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
  } catch (err: any) {
    console.error('Finance Metrics API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
