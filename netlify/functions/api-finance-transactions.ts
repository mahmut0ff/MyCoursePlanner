/**
 * API: Finance Transactions — CRUD for Income/Expenses.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, resolveBranchFilter, requireBranchScope, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const COLLECTION = 'financeTransactions';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  try {
    // GET Transactions
    if (event.httpMethod === 'GET') {
      if (!isStaff(user)) return forbidden(); // Only staff can see finances (but actually teachers shouldn't! Let's restrict to manager/admin)
      if (user.role === 'teacher' || user.role === 'student') return forbidden('Teachers and students cannot access finances');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter);

      const branchFilter = resolveBranchFilter(user, params.branchId);
      if (branchFilter === '__DENIED__') return forbidden('Access denied to requested branch');
      
      const snap = await query.get();
      let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      // Memory filter
      if (typeof branchFilter === 'string') {
        results = results.filter(r => r.branchId === branchFilter);
      } else if (Array.isArray(branchFilter) && branchFilter.length > 0) {
        results = results.filter(r => branchFilter.includes(r.branchId));
      }

      if (params.startDate) results = results.filter(r => (r.date || '') >= params.startDate!);
      if (params.endDate) results = results.filter(r => (r.date || '') <= params.endDate!);
      
      // Memory sort by date DESC
      results.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      
      // Limit to 1000
      results = results.slice(0, 1000);

      return ok(results);
    }

    // POST Transaction
    if (event.httpMethod === 'POST') {
      if (user.role === 'teacher' || user.role === 'student') return forbidden();

      const body = JSON.parse(event.body || '{}');
      if (!body.type || !body.amount || !body.date || !body.categoryId) {
        return badRequest('type, amount, date, and categoryId are required');
      }

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      const strictBranchError = requireBranchScope(user, body.branchId);
      if (strictBranchError) return strictBranchError;

      const data = {
        ...body,
        organizationId: orgFilter,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      };

      const ref = await adminDb.collection(COLLECTION).add(data);

      // If it's an income transaction tied to a student payment plan, we should update the payment plan
      if (data.type === 'income' && data.paymentPlanId) {
        const planRef = adminDb.collection('studentPaymentPlans').doc(data.paymentPlanId);
        await adminDb.runTransaction(async (t) => {
          const doc = await t.get(planRef);
          if (doc.exists) {
            const planData = doc.data()!;
            const newPaidAmount = (planData.paidAmount || 0) + data.amount;
            let status = 'partial';
            if (newPaidAmount >= planData.totalAmount) status = 'paid';
            t.update(planRef, { paidAmount: newPaidAmount, status, updatedAt: new Date().toISOString() });
          }
        });
      }

      return ok({ id: ref.id, ...data });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Finance Transactions API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
