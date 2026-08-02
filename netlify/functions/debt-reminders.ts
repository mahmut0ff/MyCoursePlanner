/**
 * Scheduled Function: Debt (Payment) Reminders
 *
 * Runs daily (scheduled via netlify.toml). Scans student payment plans that still
 * owe money and have a deadline, then:
 *   - reminds the student a few days before the deadline (and on the day),
 *   - marks plans overdue once the deadline passes (and notifies org admins once),
 *   - clears overdue again when a director extends the deadline,
 *   - keeps nudging overdue students every few days.
 *
 * The overdue rule itself is NOT local: it comes from utils/payment-plans.ts, so
 * this cron, api-finance-plans (which writes the status) and api-finance-metrics
 * (which counts it) can never disagree about who is late.
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
import {
  isDebtBearingPlan,
  planDebt,
  isDeadlineMissed,
  daysUntilDeadline,
  orgDayKey,
} from './utils/payment-plans';
import { derivePlanStatus } from './utils/finance-names';

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
  // День организации, а не UTC: ключ идемпотентности («одно напоминание в день»)
  // обязан переворачиваться в ту же полночь, что и сам срок оплаты.
  const today = orgDayKey(now);

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
    let clearedOverdue = 0;
    let adminsNotified = 0;
    let skippedInactive = 0;

    // Кому организация ещё вправе выставлять требования. Отчисленный студент
    // продолжал получать «Оплата просрочена»: счёт остаётся жить (списывается
    // только нетронутый), а этот крон смотрел лишь на сам счёт. Для семьи это
    // выглядит как требование денег после ухода из школы, и менеджер об этом
    // даже не знает — рассылка идёт молча, ночью.
    //
    // Читаем членство ОДИН раз на организацию за прогон и кэшируем: счетов
    // тысячи, организаций десятки.
    const activeByOrg = new Map<string, Set<string>>();
    const isActiveStudent = async (orgId: string, studentId: string): Promise<boolean> => {
      let ids = activeByOrg.get(orgId);
      if (!ids) {
        try {
          const memberSnap = await adminDb.collection('orgMembers').doc(orgId).collection('members')
            .where('status', '==', 'active').get();
          ids = new Set<string>(memberSnap.docs.map(d => (d.data() as any).userId || d.id));
        } catch (e) {
          // Членство не прочиталось. Молча замолчать по всей организации нельзя:
          // это остановило бы ВСЕ напоминания и выглядело бы как «должники сами
          // рассосались». Возвращаемся к прежнему поведению (напоминаем) и
          // оставляем след в логах — лишнее письмо дешевле пропавшей выручки.
          console.error(`debt-reminders: membership read failed for org ${orgId}:`, e);
          activeByOrg.set(orgId, null as any);
          return true;
        }
        activeByOrg.set(orgId, ids);
      }
      // null — маркер «прочитать не удалось» (см. catch выше).
      if (ids === null) return true;
      return ids.has(studentId);
    };

    for (const doc of snap.docs) {
      const plan = doc.data() as any;
      scanned++;

      if (!plan.deadline || !plan.studentId || !plan.organizationId) continue;

      // Defence in depth: the status allow-list above already keeps 'cancelled'
      // out, but this cron is the only consumer that *messages* students, so the
      // write-off rule is re-asserted here rather than trusted from the query.
      if (!isDebtBearingPlan(plan)) continue;

      // Отчисленному не пишем. Статус счёта при этом НЕ трогаем: долг перед
      // академией мог остаться настоящим, и решать его судьбу — дело менеджера,
      // а не ночного крона. Мы лишь перестаём требовать деньги автоматически.
      if (!(await isActiveStudent(plan.organizationId, plan.studentId))) {
        skippedInactive++;
        continue;
      }

      const debt = planDebt(plan);

      // Общий предикат просрочки (utils/payment-plans.ts) вместо третьей местной
      // реализации. Здесь стояло `Math.ceil((deadline - now) / 86400000) < 0`:
      // оно совпадало с общим правилом лишь случайно (для срока в полночь ceil
      // даёт -0) и расходилось с ним для срока с ненулевым временем. А это
      // единственный потребитель, который ПИШЕТ СТУДЕНТУ, — расхождение здесь
      // стоит дороже всего.
      const daysLeft = daysUntilDeadline(plan.deadline, now);
      if (daysLeft === null) continue; // срок нечитаем — напоминать не о чем
      const missed = isDeadlineMissed(plan.deadline, now);

      const courseSuffix = plan.courseName ? ` за «${plan.courseName}»` : '';

      // ─── Transition to overdue + notify admins once ───
      //
      // ── Уведомление админам НЕ привязано к записи статуса ──
      // Раньше обе вещи стояли под одним условием `plan.status !== 'overdue'`,
      // и уведомление практически никогда не уходило: статус 'overdue' успевает
      // проставить ПОСТОРОННИЙ код — GET api-finance-plans пишет его при первом
      // же открытии раздела финансов. К ночному прогону крона статус уже был
      // 'overdue', условие не выполнялось, и директор про просрочку не узнавал.
      //
      // Поэтому у уведомления свой признак «уже сообщали» — overdueNotifiedAt.
      // Он снимается вместе с самой просрочкой (ветка ниже), так что после
      // продления срока и повторного его истечения директор получит сообщение
      // снова — это разные события.
      if (missed && plan.status !== 'overdue') {
        await doc.ref.update({ status: 'overdue', updatedAt: now.toISOString() }).catch(() => {});
        markedOverdue++;
      }
      if (missed && !plan.overdueNotifiedAt) {
        await doc.ref.update({ overdueNotifiedAt: now.toISOString() }).catch(() => {});
        await notifyOrgAdmins(
          plan.organizationId,
          'payment_overdue',
          'Просрочен платёж',
          `${plan.studentName || 'Студент'} — просрочка ${fmtAmount(debt)} с.${courseSuffix}.`,
          '/finances',
        ).catch(() => {});
        adminsNotified++;
      }

      // ─── Обратный переход: срок продлили — просрочка снимается ───
      // Симметрия к ветке выше, и единственное место, где она возможна:
      // derivePlanStatus сохраняет 'overdue' именно потому, что не видит deadline.
      // Без этого продление срока не снимало статус никогда, и счёт навсегда
      // оставался в KPI долга и в списке должников. Новый статус выводим БЕЗ
      // currentStatus — иначе ladder вернёт то же 'overdue'.
      if (!missed && plan.status === 'overdue') {
        const restored = derivePlanStatus(plan.paidAmount || 0, plan.totalAmount);
        await doc.ref.update({ status: restored, updatedAt: now.toISOString() }).catch(() => {});
        clearedOverdue++;
      }
      // Признак «директору уже сообщали» снимаем вместе с самой просрочкой:
      // если срок продлили, а потом он снова истёк — это новое событие, и
      // молчать о нём нельзя.
      if (!missed && plan.overdueNotifiedAt) {
        await doc.ref.update({ overdueNotifiedAt: null }).catch(() => {});
      }

      // ─── Decide whether a student reminder is due today ───
      let due = false;
      let title = '';
      let message = '';

      if (!missed && BEFORE_DAYS.includes(daysLeft)) {
        due = true;
        const when = daysLeft === 0 ? 'сегодня' : daysLeft === 1 ? 'завтра' : `через ${daysLeft} дн.`;
        title = 'Напоминание об оплате';
        message = `Оплата ${when}: ${fmtAmount(debt)} с.${courseSuffix}.`;
      } else if (missed) {
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
        type: missed ? 'payment_overdue' : 'payment_due',
        title,
        message,
        link: '/diary',
        organizationId: plan.organizationId,
        metadata: { paymentPlanId: doc.id, amountDue: debt },
      }).catch(() => {});

      await doc.ref.update({ lastDebtReminderDate: today }).catch(() => {});
      sent++;
    }

    return jsonResponse(200, { success: true, scanned, sent, markedOverdue, clearedOverdue, skippedInactive, adminsNotified });
  } catch (error: any) {
    console.error('Debt reminders error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
