/**
 * Payment Webhook — FreedomPay callback handler.
 *
 * Receives POST from FreedomPay on pg_result_url after payment completes.
 * Verifies signature, updates payment status, activates subscription.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { planDailyRate } from '../../src/lib/subscription-plans';
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

    const paymentRef = snap.docs[0].ref;
    const now = new Date().toISOString();

    // ── Повторная доставка колбэка — норма, а не сбой ──
    // Платёжные шлюзы повторяют pg_result_url, пока не получат внятное «ok»:
    // при таймауте, при холодном старте функции, при ретрае оператором. Раньше
    // обработчик этого не различал и каждый раз начислял период заново:
    // balance 0 → 4990 → 9980 → 14970, то есть 30/60/90 дней за одну оплату.
    // Второе, менее заметное следствие: любой реплей БЕЗУСЛОВНО ставил
    // status:'active' и переписывал organizations.planId, воскрешая отменённую
    // подписку или отменяя недавний даунгрейд.
    //
    // Ключ идемпотентности — сам документ платежа: перевод pending → completed
    // происходит в ТОЙ ЖЕ транзакции, что и начисление, поэтому две доставки,
    // приехавшие одновременно, не могут обе увидеть pending.
    const outcome = await adminDb.runTransaction(async (t) => {
      const fresh = await t.get(paymentRef);
      if (!fresh.exists) return 'gone';
      const payment = fresh.data() as any;

      if (pgResult !== '1') {
        // Провал засчитываем только по ещё не закрытому платежу: реплей старого
        // неуспешного колбэка не должен помечать успешно оплаченный заказ как
        // failed и отбирать у академии оплаченный период.
        if (payment.status === 'completed') return 'duplicate';
        t.update(paymentRef, { status: 'failed', failedAt: now });
        return 'failed';
      }

      if (payment.status === 'completed') return 'duplicate';

      const orgId = payment.organizationId;
      const shouldCredit = Boolean(orgId && payment.planId);

      // ВСЕ чтения транзакции — до первой записи (требование Firestore).
      const subSnap = shouldCredit
        ? await t.get(adminDb.collection('subscriptions').where('organizationId', '==', orgId).limit(1))
        : null;

      t.update(paymentRef, {
        status: 'completed',
        freedompayPaymentId: paymentId || '',
        completedAt: now,
      });

      if (shouldCredit) {
        // Суточная ставка — из общего прайса (src/lib/subscription-plans.ts).
        // Локальная копия таблицы не знала legacy-id 'pro'/'expert' и молча
        // откатывалась на присланную сумму.
        const dailyRate = planDailyRate(payment.planId);
        const paidAmount = Number(payment.amount) || 0;

        if (subSnap && !subSnap.empty) {
          const existingSub = subSnap.docs[0].data() as any;
          const prevBalance = existingSub.balance || 0;
          const prevDailyRate = existingSub.dailyRate || 0;
          const prevChargeDate = existingSub.lastChargeDate || now;
          const daysSinceLast = Math.max(0, Math.floor((new Date(now).getTime() - new Date(prevChargeDate).getTime()) / 86400000));
          const remainingBalance = Math.max(0, prevBalance - (prevDailyRate * daysSinceLast));

          t.update(subSnap.docs[0].ref, {
            planId: payment.planId,
            status: 'active',
            balance: Math.round((remainingBalance + paidAmount) * 100) / 100,
            dailyRate,
            lastChargeDate: now,
            paidAmount,
            lastPaymentId: paymentRef.id,
            // Оплата снимает отмену: без этого подписка оставалась бы
            // «отменённой» с полным балансом.
            cancelledAt: null,
          });
        } else {
          t.create(adminDb.collection('subscriptions').doc(), {
            organizationId: orgId,
            planId: payment.planId,
            status: 'active',
            balance: paidAmount,
            dailyRate,
            lastChargeDate: now,
            paidAmount,
            startDate: now,
            lastPaymentId: paymentRef.id,
            createdAt: now,
          });
        }

        t.update(adminDb.collection('organizations').doc(orgId), {
          planId: payment.planId,
          updatedAt: now,
        });
      }

      return 'credited';
    });

    if (outcome === 'gone') return xmlResponse('rejected', 'Order not found');
    // Дубль — это успех для шлюза: отвечаем 'ok', иначе он продолжит повторять.
    if (outcome === 'duplicate') return xmlResponse('ok', 'Already processed');
    return xmlResponse('ok', 'Payment processed');
  } catch (error: any) {
    console.error('Webhook error:', error);
    return xmlResponse('error', 'Internal error');
  }
};

export { handler };

