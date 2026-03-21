/**
 * API: Subscriptions — billing and plan management.
 *
 * GET  /api-subscriptions              → get subscription for user's org
 * GET  /api-subscriptions?orgId=<id>   → get subscription for specific org (super_admin)
 * POST /api-subscriptions              → create/upgrade subscription
 * PUT  /api-subscriptions              → update subscription (change plan, cancel)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isSuperAdmin, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const COLLECTION = 'subscriptions';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // GET
  if (event.httpMethod === 'GET') {
    const orgId = params.orgId || user.organizationId;
    if (!orgId) return notFound('No organization');

    // Only super_admin can view other org subscriptions
    if (orgId !== user.organizationId && !isSuperAdmin(user)) return forbidden();

    const snap = await adminDb.collection(COLLECTION)
      .where('organizationId', '==', orgId)
      .orderBy('createdAt', 'desc')
      .limit(1).get();

    if (snap.empty) return notFound('No subscription found');
    const doc = snap.docs[0];
    return ok({ id: doc.id, ...doc.data() });
  }

  // POST — upgrade/change plan
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const orgId = body.organizationId || user.organizationId;
    if (!orgId) return badRequest('organizationId required');
    if (!body.planId) return badRequest('planId required');

    // Only admin of the org or super_admin can change plan
    if (orgId !== user.organizationId && !isSuperAdmin(user)) return forbidden();

    const now = new Date().toISOString();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Find existing subscription
    const existingSnap = await adminDb.collection(COLLECTION)
      .where('organizationId', '==', orgId).limit(1).get();

    if (!existingSnap.empty) {
      // Update existing
      await existingSnap.docs[0].ref.update({
        planId: body.planId,
        status: 'active',
        currentPeriodEnd: periodEnd.toISOString(),
      });
    } else {
      // Create new
      await adminDb.collection(COLLECTION).add({
        organizationId: orgId,
        planId: body.planId,
        status: 'active',
        startDate: now,
        currentPeriodEnd: periodEnd.toISOString(),
        createdAt: now,
      });
    }

    // Update org plan
    await adminDb.collection('organizations').doc(orgId).update({
      planId: body.planId,
      updatedAt: now,
    });

    // Log
    await adminDb.collection('systemLogs').add({
      action: 'plan_changed',
      actorId: user.uid,
      actorName: user.displayName,
      targetType: 'subscription',
      targetId: orgId,
      metadata: { newPlan: body.planId },
      createdAt: now,
    });

    return ok({ success: true, planId: body.planId });
  }

  // PUT — cancel subscription
  if (event.httpMethod === 'PUT') {
    const body = JSON.parse(event.body || '{}');
    const orgId = body.organizationId || user.organizationId;
    if (!orgId) return badRequest('organizationId required');

    if (orgId !== user.organizationId && !isSuperAdmin(user)) return forbidden();

    const snap = await adminDb.collection(COLLECTION)
      .where('organizationId', '==', orgId).limit(1).get();
    if (snap.empty) return notFound('No subscription');

    const now = new Date().toISOString();

    if (body.action === 'cancel') {
      await snap.docs[0].ref.update({
        status: 'cancelled',
        cancelledAt: now,
      });

      await adminDb.collection('systemLogs').add({
        action: 'subscription_cancelled',
        actorId: user.uid,
        actorName: user.displayName,
        targetType: 'subscription',
        targetId: orgId,
        createdAt: now,
      });

      return ok({ cancelled: true });
    }

    if (body.action === 'reactivate') {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await snap.docs[0].ref.update({
        status: 'active',
        cancelledAt: null,
        currentPeriodEnd: periodEnd.toISOString(),
      });
      return ok({ reactivated: true });
    }

    return badRequest('Invalid action');
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
