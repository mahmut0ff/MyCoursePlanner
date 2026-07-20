/**
 * Scheduled Function: Monthly Auto-Billing
 *
 * Runs on the 1st of each month (scheduled via netlify.toml). For every course
 * with paymentFormat='monthly' and a price, it generates that month's invoice
 * (a studentPaymentPlan) for each actively-enrolled student — so the owner no
 * longer creates hundreds of invoices by hand.
 *
 * Dedupe: each monthly plan carries a `period` ("YYYY-MM"); a student is billed
 * at most once per course per period. The enrollment-time plan (api-org
 * syncPaymentPlans) is tagged with the same period, so the first month is not
 * double-charged.
 *
 * On creation the student gets a `payment_due` notification; the daily
 * debt-reminders function then chases the deadline.
 *
 * Trigger via: scheduled run, or POST /.netlify/functions/monthly-billing for testing.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { createNotification } from './utils/notifications';
import { jsonResponse } from './utils/auth';
import { billingPeriodKey, billingDeadlineISO } from './utils/billing';

const PLANS = 'studentPaymentPlans';

function fmtAmount(n: number): string {
  try { return Number(n || 0).toLocaleString('ru-RU'); } catch { return String(n || 0); }
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const runDate = new Date();
  const period = billingPeriodKey(runDate);
  const deadline = billingDeadlineISO(runDate);
  const ts = runDate.toISOString();

  try {
    // All priced monthly courses across all orgs.
    const courseSnap = await adminDb.collection('courses')
      .where('paymentFormat', '==', 'monthly')
      .get();

    let coursesProcessed = 0;
    let invoicesCreated = 0;
    let studentsBilled = 0;

    for (const courseDoc of courseSnap.docs) {
      const course = courseDoc.data() as any;
      const price = Number(course.price || 0);
      // Only bill live courses — skip drafts and archived ones.
      if (price <= 0 || !course.organizationId || course.status !== 'published') continue;
      coursesProcessed++;

      const courseId = courseDoc.id;
      const orgId = course.organizationId;

      // Active students = union of studentIds across the course's groups.
      const groupSnap = await adminDb.collection('groups')
        .where('organizationId', '==', orgId)
        .where('courseId', '==', courseId)
        .get();
      // Филиал счёта берём у ГРУППЫ студента: курс к филиалу не привязан. Первая
      // группа с филиалом выигрывает — студент в двух филиалах по одному курсу
      // это аномалия, и счёт всё равно должен куда-то быть отнесён.
      const studentIds = new Set<string>();
      const studentBranch = new Map<string, string>();
      for (const g of groupSnap.docs) {
        const gBranchId = g.data().branchId || null;
        for (const sid of (g.data().studentIds || [])) {
          studentIds.add(sid);
          if (gBranchId && !studentBranch.has(sid)) studentBranch.set(sid, gBranchId);
        }
      }
      if (studentIds.size === 0) continue;

      // Who is already billed for this period? (equality-only query → no composite index)
      const billedSnap = await adminDb.collection(PLANS)
        .where('organizationId', '==', orgId)
        .where('courseId', '==', courseId)
        .where('period', '==', period)
        .get();
      const alreadyBilled = new Set(billedSnap.docs.map(d => d.data().studentId));

      const toBill = [...studentIds].filter(sid => !alreadyBilled.has(sid));
      if (toBill.length === 0) continue;

      // Create invoices in chunked batches (1 write each).
      const CHUNK = 400;
      const createdForNotify: string[] = [];
      for (let i = 0; i < toBill.length; i += CHUNK) {
        const slice = toBill.slice(i, i + CHUNK);
        const batch = adminDb.batch();
        for (const studentId of slice) {
          const ref = adminDb.collection(PLANS).doc();
          batch.set(ref, {
            organizationId: orgId,
            branchId: studentBranch.get(studentId) || null,
            studentId,
            courseId,
            courseName: course.title || '',
            totalAmount: price,
            paidAmount: 0,
            status: 'pending',
            billingType: 'monthly',
            period,
            deadline,
            autoBilled: true,
            createdAt: ts,
            updatedAt: ts,
          });
          createdForNotify.push(studentId);
        }
        await batch.commit();
        invoicesCreated += slice.length;
      }
      studentsBilled += createdForNotify.length;

      // Notify each billed student (best-effort).
      const courseSuffix = course.title ? ` за «${course.title}»` : '';
      const periodLabel = runDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      await Promise.allSettled(createdForNotify.map(studentId =>
        createNotification({
          recipientId: studentId,
          type: 'payment_due',
          title: 'Выставлен счёт за обучение',
          message: `Счёт за ${periodLabel}: ${fmtAmount(price)} с.${courseSuffix}. Оплатить до ${new Date(deadline).toLocaleDateString('ru-RU')}.`,
          link: '/diary',
          organizationId: orgId,
          metadata: { courseId, period },
        })
      ));
    }

    return jsonResponse(200, { success: true, period, coursesProcessed, studentsBilled, invoicesCreated });
  } catch (error: any) {
    console.error('Monthly billing error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
