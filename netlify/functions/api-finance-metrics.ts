/**
 * API: Finance Metrics — Aggregations for SaaS Dashboards.
 * Supports period filtering: current_month, last_month, quarter, year, all
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, hasPermission, getOrgFilter, resolveBranchFilter, ok, unauthorized, forbidden, badRequest, jsonResponse } from './utils/auth';

function getPeriodRange(period: string): { startIso: string; endIso: string } {
  const now = new Date();
  let start: Date;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (period) {
    case 'last_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startIso: start.toISOString(), endIso: lastDay.toISOString() };
    }
    case 'quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qMonth, 1);
      break;
    }
    case 'half_year':
      start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      break;
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
      start = new Date(2020, 0, 1);
      break;
    case 'current_month':
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  start.setHours(0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  try {
    // GET Metrics
    if (event.httpMethod === 'GET') {
      if (!isStaff(user) || user.role === 'teacher') return forbidden();
      if (!hasPermission(user, 'finances')) return forbidden('No access to finances module');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      const params = event.queryStringParameters || {};
      const branchFilter = resolveBranchFilter(user, params.branchId);
      if (branchFilter === '__DENIED__') return forbidden('Access denied');

      const period = params.period || 'current_month';
      const { startIso, endIso } = getPeriodRange(period);

      // Fetch transactions and payment plans in parallel for speed
      const [trxsSnap, plansSnap] = await Promise.all([
        adminDb.collection('financeTransactions')
          .where('organizationId', '==', orgFilter).get(),
        adminDb.collection('studentPaymentPlans')
          .where('organizationId', '==', orgFilter).get(),
      ]);
      
      let totalIncome = 0;
      let totalExpense = 0;
      
      trxsSnap.docs.forEach(d => {
        const data = d.data();
        // date filter — within selected period
        if (data.date < startIso || data.date > endIso) return;
        
        // branch filter
        if (typeof branchFilter === 'string' && data.branchId !== branchFilter) return;
        if (Array.isArray(branchFilter) && branchFilter.length > 0 && !branchFilter.includes(data.branchId)) return;

        if (data.type === 'income') totalIncome += (data.amount || 0);
        if (data.type === 'expense') totalExpense += (data.amount || 0);
      });

      const netProfit = totalIncome - totalExpense;

      let totalActiveDebt = 0;
      let overdueCount = 0;
      const invalidStatuses = ['paid'];
      const nowIso = new Date().toISOString();

      plansSnap.docs.forEach(d => {
        const data = d.data();
        if (invalidStatuses.includes(data.status)) return;
        
        // branch filter
        if (typeof branchFilter === 'string' && data.branchId !== branchFilter) return;
        if (Array.isArray(branchFilter) && branchFilter.length > 0 && !branchFilter.includes(data.branchId)) return;

        const debt = (data.totalAmount || 0) - (data.paidAmount || 0);
        if (debt > 0) {
          totalActiveDebt += debt;
          // Auto-detect overdue: if deadline passed and not paid
          if (data.status === 'overdue' || (data.deadline && data.deadline < nowIso && data.status !== 'paid')) {
            overdueCount++;
          }
        }
      });

      // Build daily chart data for the selected period
      const dailyMap = new Map<string, { income: number; expense: number }>();
      trxsSnap.docs.forEach(d => {
        const data = d.data();
        if (data.date < startIso || data.date > endIso) return;
        if (typeof branchFilter === 'string' && data.branchId !== branchFilter) return;
        if (Array.isArray(branchFilter) && branchFilter.length > 0 && !branchFilter.includes(data.branchId)) return;

        const dateKey = (data.date || '').slice(0, 10); // YYYY-MM-DD
        if (!dateKey) return;
        const entry = dailyMap.get(dateKey) || { income: 0, expense: 0 };
        if (data.type === 'income') entry.income += (data.amount || 0);
        if (data.type === 'expense') entry.expense += (data.amount || 0);
        dailyMap.set(dateKey, entry);
      });

      const chartData = [...dailyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({ date, ...vals }));

      return ok({
        period,
        totalIncome,
        totalExpense,
        netProfit,
        totalActiveDebt,
        outstandingDebt: totalActiveDebt, // alias expected by frontend
        overdueCount,
        chartData,
      });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Finance Metrics API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
