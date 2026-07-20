/**
 * Scheduled Function: Debt (Payment) Reminders
 *
 * Runs daily (scheduled via netlify.toml). Scans student payment plans that still
 * owe money and have a deadline, then:
 *   - reminds the student a few days before the deadline (and on the day),
 *   - marks plans overdue once the deadline passes (and notifies org admins once),
 *   - keeps nudging overdue students every few days.
 *
 * Delivery reuses the shared notification helper → in-app + FCM push + Telegram.
 * Idempotent: at most one reminder per plan per calendar day (lastDebtReminderDate).
 *
 * Trigger via: scheduled run, or POST /.netlify/functions/debt-reminders for testing.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { createNotification, notifyOrgAdmins } from './utils/notifications';
import { jsonResponse } from './utils/auth';
import { isDebtBearingPlan, planDebt } from './utils/payment-plans';

const COLLECTION = 'studentPaymentPlans';
// Remind the student this many days BEFORE the deadline (0 = on the day).
const BEFORE_DAYS = [3, 1, 0];
// Once overdue, nudge again every N days.
const OVERDUE_EVERY_DAYS = 3;

function fmtAmount(n: number): string {
  try { return Number(n || 0).toLocaleString('ru-RU'); } catch { return String(n || 0); }
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  try {
    // Plans that still owe money. The status allow-list already excludes both
    // 'paid' and the written-off 'cancelled' (api-org.ts sets it when a student
    // leaves a group with an untouched plan); isDebtBearingPlan below re-asserts
    // that per-plan so this cron can never message a written-off student even if
    // this query is ever widened.
    const snap = await adminDb.collection(COLLECTION)
      .where('status', 'in', ['pending', 'partial', 'overdue'])
      .get();

    let scanned = 0;
    let sent = 0;
    let markedOverdue = 0;

    for (const doc of snap.docs) {
      const plan = doc.data() as any;
      scanned++;

      if (!plan.deadline || !plan.studentId || !plan.organizationId) continue;

      // Defence in depth: the status allow-list above already keeps 'cancelled'
      // out, but this cron is the only consumer that *messages* students, so the
      // write-off rule is re-asserted here rather than trusted from the query.
      if (!isDebtBearingPlan(plan)) continue;
      const debt = planDebt(plan);

      const deadline = new Date(plan.deadline);
      if (isNaN(deadline.getTime())) continue;
      const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const courseSuffix = plan.courseName ? ` за «${plan.courseName}»` : '';

      // ─── Transition to overdue + notify admins once ───
      if (daysLeft < 0 && plan.status !== 'overdue') {
        await doc.ref.update({ status: 'overdue', updatedAt: now.toISOString() }).catch(() => {});
        markedOverdue++;
        await notifyOrgAdmins(
          plan.organizationId,
          'payment_overdue',
          'Просрочен платёж',
          `${plan.studentName || 'Студент'} — просрочка ${fmtAmount(debt)} с.${courseSuffix}.`,
          '/finances',
        ).catch(() => {});
      }

      // ─── Decide whether a student reminder is due today ───
      let due = false;
      let title = '';
      let message = '';

      if (daysLeft >= 0 && BEFORE_DAYS.includes(daysLeft)) {
        due = true;
        const when = daysLeft === 0 ? 'сегодня' : daysLeft === 1 ? 'завтра' : `через ${daysLeft} дн.`;
        title = 'Напоминание об оплате';
        message = `Оплата ${when}: ${fmtAmount(debt)} с.${courseSuffix}.`;
      } else if (daysLeft < 0) {
        const overdueDays = Math.abs(daysLeft);
        if (overdueDays % OVERDUE_EVERY_DAYS === 0) {
          due = true;
          title = 'Просрочена оплата';
          message = `Оплата просрочена на ${overdueDays} дн.: ${fmtAmount(debt)} с.${courseSuffix}.`;
        }
      }

      if (!due) continue;
      // Idempotency — at most one reminder per plan per day.
      if (plan.lastDebtReminderDate === today) continue;

      await createNotification({
        recipientId: plan.studentId,
        type: daysLeft < 0 ? 'payment_overdue' : 'payment_due',
        title,
        message,
        link: '/diary',
        organizationId: plan.organizationId,
        metadata: { paymentPlanId: doc.id, amountDue: debt },
      }).catch(() => {});

      await doc.ref.update({ lastDebtReminderDate: today }).catch(() => {});
      sent++;
    }

    return jsonResponse(200, { success: true, scanned, sent, markedOverdue });
  } catch (error: any) {
    console.error('Debt reminders error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
