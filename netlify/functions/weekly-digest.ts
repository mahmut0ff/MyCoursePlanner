/**
 * Scheduled Function: Weekly Owner Digest
 *
 * Runs weekly (Monday morning, scheduled via netlify.toml). For each active
 * organization it sends admins/managers a one-glance summary of the past 7 days
 * — revenue, expenses, outstanding debt, new students, new leads — via the
 * shared notification helper (in-app + push + Telegram), so the owner doesn't
 * have to open the app to know how the week went.
 *
 * Trigger via: scheduled run, or POST /.netlify/functions/weekly-digest for testing.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { notifyOrgAdmins } from './utils/notifications';
import { jsonResponse } from './utils/auth';
import { isDebtBearingPlan, planDebt } from './utils/payment-plans';

function fmt(n: number): string {
  try { return Math.round(n).toLocaleString('ru-RU'); } catch { return String(Math.round(n)); }
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  try {
    const now = new Date();
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const orgSnap = await adminDb.collection('organizations').get();

    let digestsSent = 0;
    let orgsScanned = 0;

    for (const orgDoc of orgSnap.docs) {
      const org = orgDoc.data() as any;
      const orgId = orgDoc.id;
      if (org.status && org.status !== 'active') continue;
      orgsScanned++;

      // Equality-only / single-collection reads → no composite indexes needed;
      // the 7-day windows are filtered in memory.
      const [txSnap, planSnap, memberSnap, leadSnap] = await Promise.all([
        adminDb.collection('financeTransactions').where('organizationId', '==', orgId).get(),
        adminDb.collection('studentPaymentPlans').where('organizationId', '==', orgId).get(),
        adminDb.collection('orgMembers').doc(orgId).collection('members').where('role', '==', 'student').get(),
        adminDb.collection('organizations').doc(orgId).collection('aiLeads').get().catch(() => null),
      ]);

      let income = 0;
      let expense = 0;
      for (const t of txSnap.docs) {
        const tx = t.data() as any;
        const when = tx.date || tx.createdAt;
        if (!when || when < since) continue;
        if (tx.type === 'income') income += Number(tx.amount || 0);
        else if (tx.type === 'expense') expense += Number(tx.amount || 0);
      }

      let debt = 0;
      let overdue = 0;
      for (const p of planSnap.docs) {
        const plan = p.data() as any;
        // Cancelled (written-off) and settled plans are not debt — the digest has
        // to show the same number as the finance dashboard.
        if (!isDebtBearingPlan(plan)) continue;
        debt += planDebt(plan);
        if (plan.status === 'overdue') overdue++;
      }

      const activeStudents = memberSnap.docs.filter(d => (d.data() as any).status === 'active').length;
      const newStudents = memberSnap.docs.filter(d => {
        const j = (d.data() as any).joinedAt;
        return j && j >= since;
      }).length;

      const newLeads = leadSnap
        ? leadSnap.docs.filter(d => { const c = (d.data() as any).createdAt; return c && c >= since; }).length
        : 0;

      // Skip orgs that aren't really operating yet (avoid empty-digest noise).
      if (activeStudents === 0 && income === 0 && debt === 0 && newLeads === 0) continue;

      const lines = [
        `💰 Доход: ${fmt(income)} с.`,
        expense > 0 ? `💸 Расходы: ${fmt(expense)} с.` : null,
        debt > 0 ? `🧾 Долги: ${fmt(debt)} с.${overdue > 0 ? ` (просрочено: ${overdue})` : ''}` : null,
        `🧑‍🎓 Новых учеников: ${newStudents}`,
        newLeads > 0 ? `📞 Новых заявок: ${newLeads}` : null,
      ].filter(Boolean).join('\n');

      await notifyOrgAdmins(
        orgId,
        'weekly_digest',
        '📊 Сводка за неделю',
        lines,
        '/dashboard',
      ).catch(() => {});
      digestsSent++;
    }

    return jsonResponse(200, { success: true, orgsScanned, digestsSent });
  } catch (error: any) {
    console.error('Weekly digest error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
