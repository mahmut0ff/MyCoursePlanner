/**
 * Scheduled Function: At-Risk Student Alerts
 *
 * Runs weekly (scheduled via netlify.toml). For each active org it flags
 * students who need attention using reliable signals — repeated recent
 * absences and overdue payments — and sends admins/managers one consolidated
 * "students needing attention" alert.
 *
 * Note: parents are intentionally NOT notified here — they have no push
 * channel (the parent portal is a pull-only link). Extending alerts to parents
 * would need a dedicated parent contact channel.
 *
 * Trigger via: scheduled run, or POST /.netlify/functions/risk-alerts for testing.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { notifyOrgAdmins } from './utils/notifications';
import { jsonResponse } from './utils/auth';

const ABSENCE_WINDOW_DAYS = 30;
const ABSENCE_THRESHOLD = 3;
const LOW_SCORE_THRESHOLD = 50; // average % below this (with ≥2 attempts) flags the student
const MAX_LISTED = 12;

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const now = new Date();
  const since = new Date(now.getTime() - ABSENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const orgSnap = await adminDb.collection('organizations').get();

    let orgsScanned = 0;
    let alertsSent = 0;

    for (const orgDoc of orgSnap.docs) {
      const org = orgDoc.data() as any;
      const orgId = orgDoc.id;
      if (org.status && org.status !== 'active') continue;
      orgsScanned++;

      // Active students → uid -> name
      const memberSnap = await adminDb.collection('orgMembers').doc(orgId).collection('members')
        .where('role', '==', 'student').where('status', '==', 'active').get();
      const nameByUid = new Map<string, string>();
      memberSnap.docs.forEach(d => nameByUid.set((d.data() as any).userId || d.id, (d.data() as any).userName || 'Ученик'));
      if (nameByUid.size === 0) continue;

      // Recent absences (equality-only query → no composite index; date filtered in memory).
      const absenceSnap = await adminDb.collection('journal')
        .where('organizationId', '==', orgId).where('attendance', '==', 'absent').get();
      const absencesByStudent = new Map<string, number>();
      for (const j of absenceSnap.docs) {
        const data = j.data() as any;
        if (data.date && data.date < since.slice(0, 10)) continue;
        absencesByStudent.set(data.studentId, (absencesByStudent.get(data.studentId) || 0) + 1);
      }

      // Overdue payments.
      const overdueSnap = await adminDb.collection('studentPaymentPlans')
        .where('organizationId', '==', orgId).where('status', '==', 'overdue').get();
      const overdueByStudent = new Map<string, number>();
      for (const p of overdueSnap.docs) {
        const data = p.data() as any;
        const debt = Math.max(0, (data.totalAmount || 0) - (data.paidAmount || 0));
        overdueByStudent.set(data.studentId, (overdueByStudent.get(data.studentId) || 0) + debt);
      }

      // Average exam/quiz score (only trust it once there are ≥2 graded attempts).
      const attemptsSnap = await adminDb.collection('examAttempts')
        .where('organizationId', '==', orgId).get();
      const scoreAgg = new Map<string, { sum: number; n: number }>();
      for (const a of attemptsSnap.docs) {
        const data = a.data() as any;
        if (typeof data.percentage !== 'number' || !data.studentId) continue;
        const agg = scoreAgg.get(data.studentId) || { sum: 0, n: 0 };
        agg.sum += data.percentage; agg.n += 1;
        scoreAgg.set(data.studentId, agg);
      }

      // Build the at-risk list (only for current active students).
      const atRisk: { name: string; reasons: string[] }[] = [];
      for (const [uid, name] of nameByUid) {
        const reasons: string[] = [];
        const absences = absencesByStudent.get(uid) || 0;
        if (absences >= ABSENCE_THRESHOLD) reasons.push(`${absences} пропусков`);
        if (overdueByStudent.has(uid)) reasons.push('просрочена оплата');
        const agg = scoreAgg.get(uid);
        if (agg && agg.n >= 2) {
          const avg = Math.round(agg.sum / agg.n);
          if (avg < LOW_SCORE_THRESHOLD) reasons.push(`низкие оценки (${avg}%)`);
        }
        if (reasons.length > 0) atRisk.push({ name, reasons });
      }
      if (atRisk.length === 0) continue;

      const listed = atRisk.slice(0, MAX_LISTED)
        .map(r => `• ${r.name} — ${r.reasons.join(', ')}`).join('\n');
      const more = atRisk.length > MAX_LISTED ? `\n…и ещё ${atRisk.length - MAX_LISTED}` : '';

      await notifyOrgAdmins(
        orgId,
        'risk_alert',
        `⚠️ Требуют внимания: ${atRisk.length}`,
        `${listed}${more}`,
        // The standalone risk dashboard is gone; the roster filtered to the
        // flagged students is where you can actually act on this alert.
        '/students?risk=1',
      ).catch(() => {});
      alertsSent++;
    }

    return jsonResponse(200, { success: true, orgsScanned, alertsSent });
  } catch (error: any) {
    console.error('Risk alerts error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
