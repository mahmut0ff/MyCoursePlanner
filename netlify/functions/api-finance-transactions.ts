/**
 * API: Finance Transactions — CRUD for Income/Expenses.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, hasPermission, getOrgFilter, resolveBranchFilter, requireBranchScope, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';
import { createNotification, notifyOrgAdmins } from './utils/notifications';

const COLLECTION = 'financeTransactions';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  try {
    // GET Transactions
    if (event.httpMethod === 'GET') {
      if (!isStaff(user)) return forbidden();
      if (user.role === 'teacher' || user.role === 'student') return forbidden('Teachers and students cannot access finances');
      if (!hasPermission(user, 'finances')) return forbidden('No access to finances module');

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
      if (!hasPermission(user, 'finances')) return forbidden('No access to finances module');

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
        let remaining = 0;
        await adminDb.runTransaction(async (t) => {
          const doc = await t.get(planRef);
          if (doc.exists) {
            const planData = doc.data()!;
            const newPaidAmount = (planData.paidAmount || 0) + data.amount;
            remaining = Math.max(0, (planData.totalAmount || 0) - newPaidAmount);
            let status = 'partial';
            if (newPaidAmount >= planData.totalAmount) status = 'paid';
            t.update(planRef, { paidAmount: newPaidAmount, status, updatedAt: new Date().toISOString() });
          }
        });

        // Notify student about payment (in-app + Telegram via unified pipeline)
        if (data.studentId && orgFilter) {
          createNotification({
            recipientId: data.studentId,
            type: 'payment_received',
            title: 'Оплата принята',
            message: `Оплата ${data.amount} сом принята.${remaining > 0 ? ` Остаток: ${remaining} сом.` : ' Оплата завершена полностью!'}`,
            organizationId: orgFilter,
          }).catch(() => {});
        }

        // Notify admins about received payment
        if (orgFilter) {
          notifyOrgAdmins(
            orgFilter, 'payment_received',
            'Получена оплата',
            `Оплата ${data.amount} сом${data.description ? ` (${data.description})` : ''}`,
            '/finances',
          ).catch(() => {});
        }
      }

      return ok({ id: ref.id, ...data });
    }

    // PUT — Update Transaction
    if (event.httpMethod === 'PUT') {
      if (user.role === 'teacher' || user.role === 'student') return forbidden();
      if (!hasPermission(user, 'finances')) return forbidden('No access to finances module');

      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');

      const docRef = adminDb.collection(COLLECTION).doc(body.id);
      const doc = await docRef.get();
      if (!doc.exists) return notFound('Transaction not found');

      const existing = doc.data()!;
      const orgFilter = getOrgFilter(user);
      if (existing.organizationId !== orgFilter) return forbidden();

      const updates: any = { updatedAt: new Date().toISOString() };
      if (body.amount !== undefined) updates.amount = Number(body.amount);
      if (body.description !== undefined) updates.description = body.description;
      if (body.date !== undefined) updates.date = body.date;
      if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
      if (body.paymentMethod !== undefined) updates.paymentMethod = body.paymentMethod;

      // If amount changed and linked to payment plan, recalculate
      if (body.amount !== undefined && existing.paymentPlanId && Number(body.amount) !== existing.amount) {
        const diff = Number(body.amount) - (existing.amount || 0);
        const planRef = adminDb.collection('studentPaymentPlans').doc(existing.paymentPlanId);
        await adminDb.runTransaction(async (t) => {
          const planDoc = await t.get(planRef);
          if (planDoc.exists) {
            const planData = planDoc.data()!;
            const newPaid = Math.max(0, (planData.paidAmount || 0) + diff);
            let status = 'partial';
            if (newPaid >= planData.totalAmount) status = 'paid';
            else if (newPaid === 0) status = 'pending';
            t.update(planRef, { paidAmount: newPaid, status, updatedAt: new Date().toISOString() });
          }
        });
      }

      await docRef.update(updates);
      return ok({ id: doc.id, ...existing, ...updates });
    }

    // DELETE — Remove Transaction
    if (event.httpMethod === 'DELETE') {
      if (user.role === 'teacher' || user.role === 'student') return forbidden();
      if (!hasPermission(user, 'finances')) return forbidden('No access to finances module');

      const txId = params.id;
      if (!txId) return badRequest('id required');

      const docRef = adminDb.collection(COLLECTION).doc(txId);
      const doc = await docRef.get();
      if (!doc.exists) return notFound('Transaction not found');

      const existing = doc.data()!;
      const orgFilter = getOrgFilter(user);
      if (existing.organizationId !== orgFilter) return forbidden();

      // Reverse payment plan if linked
      if (existing.paymentPlanId && existing.type === 'income') {
        const planRef = adminDb.collection('studentPaymentPlans').doc(existing.paymentPlanId);
        await adminDb.runTransaction(async (t) => {
          const planDoc = await t.get(planRef);
          if (planDoc.exists) {
            const planData = planDoc.data()!;
            const newPaid = Math.max(0, (planData.paidAmount || 0) - (existing.amount || 0));
            let status = 'partial';
            if (newPaid >= planData.totalAmount) status = 'paid';
            else if (newPaid === 0) status = 'pending';
            t.update(planRef, { paidAmount: newPaid, status, updatedAt: new Date().toISOString() });
          }
        });
      }

      await docRef.delete();
      return ok({ deleted: true, id: txId });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Finance Transactions API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
