/**
 * API: Subscriptions — billing and plan management with daily proration.
 *
 * GET  /api-subscriptions              → get subscription + calculated balance
 * GET  /api-subscriptions?orgId=<id>   → get subscription for specific org (super_admin)
 * GET  /api-subscriptions?history=true → include payment history
 * POST /api-subscriptions              → change plan (proration — no payment needed for downgrade)
 * PUT  /api-subscriptions              → cancel / reactivate subscription
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isSuperAdmin, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';
import { computePaidUntil, GRACE_DAYS } from './utils/subscription';

const COLLECTION = 'subscriptions';

const PLAN_PRICES: Record<string, number> = {
  starter: 1990,
  professional: 4990,
  enterprise: 14900,
};

const PLAN_ORDER: Record<string, number> = {
  starter: 0,
  professional: 1,
  enterprise: 2,
};

/**
 * Calculate effective balance on-the-fly.
 * balance - (dailyRate × daysSinceLastCharge)
 */
function calculateEffectiveBalance(sub: any): {
  effectiveBalance: number;
  daysRemaining: number;
  dailyRate: number;
  isExpiredByBalance: boolean;
} {
  const balance = sub.balance || 0;
  const dailyRate = sub.dailyRate || 0;
  const lastChargeDate = sub.lastChargeDate || sub.createdAt || new Date().toISOString();

  const now = new Date();
  const lastCharge = new Date(lastChargeDate);
  const daysSinceLast = Math.max(0, Math.floor((now.getTime() - lastCharge.getTime()) / 86400000));

  const spent = dailyRate * daysSinceLast;
  const effectiveBalance = Math.max(0, Math.round((balance - spent) * 100) / 100);
  const daysRemaining = dailyRate > 0 ? Math.floor(effectiveBalance / dailyRate) : 999;
  const isExpiredByBalance = effectiveBalance <= 0 && balance > 0;

  return { effectiveBalance, daysRemaining, dailyRate, isExpiredByBalance };
}

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
      .where('organizationId', '==', orgId).get();

    if (snap.empty) return notFound('No subscription found');
    const allSubs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    allSubs.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const subscription = allSubs[0] as any;

    // Calculate effective balance on-the-fly (legacy) + manual paid-until info.
    const balanceInfo = calculateEffectiveBalance(subscription);
    const paidInfo = computePaidUntil(subscription.paidUntil);
    const enrichedSub = {
      ...subscription,
      effectiveBalance: balanceInfo.effectiveBalance,
      daysRemaining: paidInfo.hasPaidUntil ? paidInfo.daysUntilDue : balanceInfo.daysRemaining,
      computedDailyRate: balanceInfo.dailyRate,
      paidUntil: subscription.paidUntil || null,
      daysUntilDue: paidInfo.daysUntilDue,
      isOverdue: paidInfo.isOverdue,
      graceDays: GRACE_DAYS,
    };

    // Auto-expire once active. Manual model (paidUntil set) wins; otherwise fall
    // back to legacy balance depletion.
    const shouldExpire = subscription.status === 'active' && (
      paidInfo.hasPaidUntil ? paidInfo.isPastGrace : balanceInfo.isExpiredByBalance
    );
    if (shouldExpire) {
      await snap.docs[0].ref.update({ status: 'expired' });
      enrichedSub.status = 'expired';
      const orgUpdate: any = { updatedAt: new Date().toISOString() };
      // Auto-block the org only in the manual model (legacy balance path keeps old behavior).
      if (paidInfo.hasPaidUntil) orgUpdate.status = 'suspended';
      await adminDb.collection('organizations').doc(orgId).update(orgUpdate);
    }

    // If billing history requested, also fetch payments
    if (params.history === 'true') {
      const paymentsSnap = await adminDb.collection('payments')
        .where('organizationId', '==', orgId).get();
      let payments = paymentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      payments.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      payments = payments.slice(0, 50);

      // Also fetch subscription change logs from systemLogs
      const logsSnap = await adminDb.collection('systemLogs')
        .where('targetId', '==', orgId).get();
      let logs = logsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      const allowedActions = ['plan_changed', 'subscription_cancelled', 'plan_gifted'];
      logs = logs.filter((l: any) => allowedActions.includes(l.action));
      logs.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      logs = logs.slice(0, 50);

      return ok({ subscription: enrichedSub, payments, logs });
    }

    return ok(enrichedSub);
  }

  // POST — change plan with proration
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const orgId = body.organizationId || user.organizationId;
    if (!orgId) return badRequest('organizationId required');
    if (!body.planId) return badRequest('planId required');
    if (!PLAN_PRICES[body.planId]) return badRequest('Invalid planId');

    // Only admin of the org or super_admin can change plan
    if (orgId !== user.organizationId && !isSuperAdmin(user)) return forbidden();

    const now = new Date().toISOString();
    const newDailyRate = Math.round((PLAN_PRICES[body.planId] / 30) * 100) / 100;

    // Find existing subscription
    const existingSnap = await adminDb.collection(COLLECTION)
      .where('organizationId', '==', orgId).limit(1).get();

    if (!existingSnap.empty) {
      const existingSub = existingSnap.docs[0].data();
      const currentPlan = existingSub.planId || 'starter';

      // Calculate current effective balance
      const { effectiveBalance } = calculateEffectiveBalance(existingSub);

      // Determine if upgrade or downgrade
      const isUpgrade = (PLAN_ORDER[body.planId] || 0) > (PLAN_ORDER[currentPlan] || 0);
      const isDowngrade = (PLAN_ORDER[body.planId] || 0) < (PLAN_ORDER[currentPlan] || 0);

      // For both upgrade and downgrade: keep the balance, change the daily rate
      // Upgrade: balance depletes faster (higher daily rate)
      // Downgrade: balance lasts longer (lower daily rate)
      await existingSnap.docs[0].ref.update({
        planId: body.planId,
        status: effectiveBalance > 0 ? 'active' : existingSub.status,
        balance: effectiveBalance,
        dailyRate: newDailyRate,
        lastChargeDate: now,
      });

      // Calculate new days remaining
      const newDaysRemaining = newDailyRate > 0 ? Math.floor(effectiveBalance / newDailyRate) : 0;

      // Log the change
      await adminDb.collection('systemLogs').add({
        action: 'plan_changed',
        actorId: user.uid,
        actorName: user.displayName,
        targetType: 'subscription',
        targetId: orgId,
        metadata: {
          previousPlan: currentPlan,
          newPlan: body.planId,
          direction: isUpgrade ? 'upgrade' : isDowngrade ? 'downgrade' : 'same',
          balanceAtChange: effectiveBalance,
          newDailyRate,
          newDaysRemaining,
        },
        createdAt: now,
      });

      // Update org plan
      await adminDb.collection('organizations').doc(orgId).update({
        planId: body.planId,
        updatedAt: now,
      });

      return ok({
        success: true,
        planId: body.planId,
        effectiveBalance,
        newDailyRate,
        daysRemaining: newDaysRemaining,
        direction: isUpgrade ? 'upgrade' : isDowngrade ? 'downgrade' : 'same',
      });
    } else {
      // No subscription — create new (first time)
      await adminDb.collection(COLLECTION).add({
        organizationId: orgId,
        planId: body.planId,
        status: 'active',
        balance: 0,
        dailyRate: newDailyRate,
        lastChargeDate: now,
        startDate: now,
        createdAt: now,
      });

      await adminDb.collection('organizations').doc(orgId).update({
        planId: body.planId,
        updatedAt: now,
      });

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
  }

  // PUT — cancel / reactivate subscription
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
      const subData = snap.docs[0].data();
      const { effectiveBalance } = calculateEffectiveBalance(subData);

      await snap.docs[0].ref.update({
        status: effectiveBalance > 0 ? 'active' : 'expired',
        cancelledAt: null,
      });
      return ok({ reactivated: true, effectiveBalance });
    }

    return badRequest('Invalid action');
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
