/**
 * Payment Webhook — FreedomPay callback handler.
 *
 * Receives POST from FreedomPay on pg_result_url after payment completes.
 * Verifies signature, updates payment status, activates subscription.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import * as crypto from 'crypto';
import { parse } from 'querystring';

const FREEDOMPAY_SECRET_KEY = process.env.FREEDOMPAY_SECRET_KEY || '';

function verifySignature(scriptName: string, params: Record<string, string>, secretKey: string): boolean {
  const receivedSig = params.pg_sig;
  if (!receivedSig) return false;
  const sorted = Object.keys(params)
    .filter(k => k !== 'pg_sig')
    .sort()
    .map(k => params[k]);
  const raw = [scriptName, ...sorted, secretKey].join(';');
  const expected = crypto.createHash('md5').update(raw).digest('hex');
  return expected === receivedSig;
}

// Server-to-server callback from payment provider — wildcard CORS is intentional
const HEADERS = { 'Content-Type': 'text/xml', 'Access-Control-Allow-Origin': '*' };

const xmlResponse = (status: string, desc: string) => ({
  statusCode: 200,
  headers: HEADERS,
  body: `<?xml version="1.0" encoding="UTF-8"?><response><pg_status>${status}</pg_status><pg_description>${desc}</pg_description></response>`,
});

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  // FreedomPay sends POST with form-encoded data
  const body = parse(event.body || '') as Record<string, string>;

  // Verify signature
  if (!verifySignature('payment-webhook', body, FREEDOMPAY_SECRET_KEY)) {
    console.error('Invalid FreedomPay signature');
    return xmlResponse('rejected', 'Invalid signature');
  }

  const orderId = body.pg_order_id;
  const pgResult = body.pg_result; // 1 = success, 0 = fail
  const paymentId = body.pg_payment_id;

  if (!orderId) return xmlResponse('rejected', 'Missing order ID');

  try {
    // Find payment record
    const snap = await adminDb.collection('payments')
      .where('orderId', '==', orderId).limit(1).get();

    if (snap.empty) return xmlResponse('rejected', 'Order not found');

    const paymentDoc = snap.docs[0];
    const payment = paymentDoc.data();
    const now = new Date().toISOString();

    if (pgResult === '1') {
      // Payment successful
      await paymentDoc.ref.update({
        status: 'completed',
        freedompayPaymentId: paymentId || '',
        completedAt: now,
      });

      // Activate subscription
      const orgId = payment.organizationId;
      if (orgId && payment.planId) {
        const planPrices: Record<string, number> = { starter: 1990, professional: 4990, enterprise: 14900 };
        const monthlyPrice = planPrices[payment.planId] || payment.amount;
        const dailyRate = Math.round((monthlyPrice / 30) * 100) / 100;

        const subSnap = await adminDb.collection('subscriptions')
          .where('organizationId', '==', orgId).limit(1).get();

        if (!subSnap.empty) {
          const existingSub = subSnap.docs[0].data();
          // Calculate any remaining balance from previous period
          const prevBalance = existingSub.balance || 0;
          const prevDailyRate = existingSub.dailyRate || 0;
          const prevChargeDate = existingSub.lastChargeDate || now;
          const daysSinceLast = Math.max(0, Math.floor((new Date(now).getTime() - new Date(prevChargeDate).getTime()) / 86400000));
          const remainingBalance = Math.max(0, prevBalance - (prevDailyRate * daysSinceLast));

          await subSnap.docs[0].ref.update({
            planId: payment.planId,
            status: 'active',
            balance: Math.round((remainingBalance + payment.amount) * 100) / 100,
            dailyRate,
            lastChargeDate: now,
            paidAmount: payment.amount,
            lastPaymentId: paymentDoc.id,
          });
        } else {
          await adminDb.collection('subscriptions').add({
            organizationId: orgId,
            planId: payment.planId,
            status: 'active',
            balance: payment.amount,
            dailyRate,
            lastChargeDate: now,
            paidAmount: payment.amount,
            startDate: now,
            lastPaymentId: paymentDoc.id,
            createdAt: now,
          });
        }

        await adminDb.collection('organizations').doc(orgId).update({
          planId: payment.planId,
          updatedAt: now,
        });
      }
    } else {
      await paymentDoc.ref.update({ status: 'failed', failedAt: now });
    }

    return xmlResponse('ok', 'Payment processed');
  } catch (error: any) {
    console.error('Webhook error:', error);
    return xmlResponse('error', 'Internal error');
  }
};

export { handler };

