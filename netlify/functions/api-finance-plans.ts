/**
 * API: Finance Payment Plans — Tracks student obligations.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, resolveBranchFilter, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const COLLECTION = 'studentPaymentPlans';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  try {
    // GET Payment Plans
    if (event.httpMethod === 'GET') {
      if (!isStaff(user)) return forbidden();
      if (user.role === 'teacher') return forbidden('Teachers cannot access finance plans');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter);

      const branchFilter = resolveBranchFilter(user, params.branchId);
      if (branchFilter === '__DENIED__') return forbidden('Access denied to requested branch');

      if (params.studentId) query = query.where('studentId', '==', params.studentId);
      
      const snap = await query.get();
      let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      // Memory filter
      if (typeof branchFilter === 'string') {
        results = results.filter(r => r.branchId === branchFilter);
      } else if (Array.isArray(branchFilter) && branchFilter.length > 0) {
        results = results.filter(r => branchFilter.includes(r.branchId));
      }
      if (params.status) {
        results = results.filter(r => r.status === params.status);
      }
      
      // Memory sort
      results.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      return ok(results);
    }

    // POST Create Payment Plan (Usually auto-created, but allow manual creation)
    if (event.httpMethod === 'POST') {
      if (user.role === 'teacher' || user.role === 'student') return forbidden();

      const body = JSON.parse(event.body || '{}');
      if (!body.studentId || !body.courseId || body.totalAmount === undefined) {
        return badRequest('studentId, courseId, and totalAmount are required');
      }

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      const now = new Date().toISOString();
      const data = {
        ...body,
        organizationId: orgFilter,
        paidAmount: body.paidAmount || 0,
        status: body.status || 'pending', // 'paid' | 'partial' | 'overdue' | 'pending'
        createdAt: now,
        updatedAt: now,
      };

      const ref = await adminDb.collection(COLLECTION).add(data);
      return ok({ id: ref.id, ...data });
    }

    // PUT Update Payment Plan
    if (event.httpMethod === 'PUT') {
      if (user.role === 'teacher' || user.role === 'student') return forbidden();

      const body = JSON.parse(event.body || '{}');
      if (!body.planId) return badRequest('planId required');

      const { planId, ...updateFields } = body;
      updateFields.updatedAt = new Date().toISOString();

      const docRef = adminDb.collection(COLLECTION).doc(planId);
      await docRef.update(updateFields);

      const updated = await docRef.get();
      return ok({ id: updated.id, ...updated.data() });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Finance Plans API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
