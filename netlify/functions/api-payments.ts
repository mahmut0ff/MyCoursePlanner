/**
 * API: Payments — FreedomPay.kg integration.
 *
 * POST /api-payments              → create payment (init_payment → redirect URL)
 * GET  /api-payments?status=check&orderId=X → check payment status
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, badRequest, notFound, jsonResponse } from './utils/auth';
import * as crypto from 'crypto';

const COLLECTION = 'payments';
const FREEDOMPAY_MERCHANT_ID = process.env.FREEDOMPAY_MERCHANT_ID || '';
const FREEDOMPAY_SECRET_KEY = process.env.FREEDOMPAY_SECRET_KEY || '';
const FREEDOMPAY_API_URL = process.env.FREEDOMPAY_API_URL || 'https://api.freedompay.kg/init_payment.php';
const APP_URL = process.env.URL || process.env.DEPLOY_URL || 'https://mycourseplan.netlify.app';

/**
 * Generate FreedomPay pg_sig signature.
 * Signature = MD5(scriptName + ";" + values sorted by key alphabetically + ";" + secretKey)
 */
function generateSignature(scriptName: string, params: Record<string, string>, secretKey: string): string {
  const sorted = Object.keys(params)
    .filter(k => k !== 'pg_sig')
    .sort()
    .map(k => params[k]);
  const raw = [scriptName, ...sorted, secretKey].join(';');
  return crypto.createHash('md5').update(raw).digest('hex');
}

function generateOrderId(): string {
  return `MCP-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // GET — check payment status
  if (event.httpMethod === 'GET' && params.status === 'check') {
    if (!params.orderId) return badRequest('orderId required');
    const snap = await adminDb.collection(COLLECTION)
      .where('orderId', '==', params.orderId).limit(1).get();
    if (snap.empty) return notFound('Payment not found');
    return ok({ id: snap.docs[0].id, ...snap.docs[0].data() });
  }

  // POST — create payment
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    if (!body.planId || !body.amount) return badRequest('planId and amount required');

    if (!FREEDOMPAY_MERCHANT_ID || !FREEDOMPAY_SECRET_KEY) {
      return jsonResponse(503, { error: 'Payment system not configured. Set FREEDOMPAY_MERCHANT_ID and FREEDOMPAY_SECRET_KEY.' });
    }

    const orderId = generateOrderId();
    const now = new Date().toISOString();

    // Save payment record
    const paymentData = {
      orderId,
      userId: user.uid,
      organizationId: user.organizationId || '',
      planId: body.planId,
      amount: body.amount,
      currency: 'KGS',
      status: 'pending',
      createdAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(paymentData);

    // Build FreedomPay params
    const salt = crypto.randomBytes(8).toString('hex');
    const fpParams: Record<string, string> = {
      pg_merchant_id: FREEDOMPAY_MERCHANT_ID,
      pg_order_id: orderId,
      pg_amount: String(body.amount),
      pg_currency: 'KGS',
      pg_description: `MyCoursePlan — ${body.planId} plan`,
      pg_salt: salt,
      pg_language: 'ru',
      pg_success_url: `${APP_URL}/payment/success`,
      pg_failure_url: `${APP_URL}/payment/failure`,
      pg_result_url: `${APP_URL}/.netlify/functions/payment-webhook`,
      pg_testing_mode: process.env.FREEDOMPAY_TESTING === 'true' ? '1' : '0',
      pg_user_id: user.uid,
      pg_user_contact_email: user.email || '',
    };
    fpParams.pg_sig = generateSignature('init_payment.php', fpParams, FREEDOMPAY_SECRET_KEY);

    // Call FreedomPay init_payment
    try {
      const fpBody = new URLSearchParams(fpParams);
      const fpRes = await fetch(FREEDOMPAY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: fpBody.toString(),
      });
      const fpText = await fpRes.text();

      // FreedomPay returns XML — parse redirect URL
      const redirectMatch = fpText.match(/<pg_redirect_url>(.*?)<\/pg_redirect_url>/);
      const paymentIdMatch = fpText.match(/<pg_payment_id>(.*?)<\/pg_payment_id>/);
      const errorMatch = fpText.match(/<pg_error_description>(.*?)<\/pg_error_description>/);

      if (redirectMatch && redirectMatch[1]) {
        // Update payment with FreedomPay payment ID
        await adminDb.collection(COLLECTION).doc(ref.id).update({
          freedompayPaymentId: paymentIdMatch?.[1] || '',
          redirectUrl: redirectMatch[1],
        });
        return ok({ redirectUrl: redirectMatch[1], orderId, paymentId: ref.id });
      } else {
        const errorMsg = errorMatch?.[1] || 'Unknown FreedomPay error';
        await adminDb.collection(COLLECTION).doc(ref.id).update({ status: 'failed', error: errorMsg });
        return jsonResponse(502, { error: errorMsg });
      }
    } catch (e: any) {
      await adminDb.collection(COLLECTION).doc(ref.id).update({ status: 'failed', error: e.message });
      return jsonResponse(502, { error: 'Failed to contact FreedomPay', message: e.message });
    }
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
