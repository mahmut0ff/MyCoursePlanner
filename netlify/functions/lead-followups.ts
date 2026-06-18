/**
 * Scheduled Function: Lead Follow-up Reminders
 *
 * Runs daily (scheduled via netlify.toml). Finds leads still in status 'new'
 * that have been sitting untouched for over a day and nudges the org's
 * admins/managers to call them — so warm leads don't go cold.
 *
 * Idempotent: at most one reminder per lead per day (lastFollowupDate).
 *
 * Trigger via: scheduled run, or POST /.netlify/functions/lead-followups for testing.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { notifyOrgAdmins } from './utils/notifications';
import { jsonResponse } from './utils/auth';

const STALE_HOURS = 24;

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const staleBefore = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  try {
    const orgSnap = await adminDb.collection('organizations').get();

    let scanned = 0;
    let reminded = 0;

    for (const orgDoc of orgSnap.docs) {
      const org = orgDoc.data() as any;
      const orgId = orgDoc.id;
      if (org.status && org.status !== 'active') continue;

      const leadSnap = await adminDb.collection('organizations').doc(orgId).collection('aiLeads')
        .where('status', '==', 'new')
        .get()
        .catch(() => null);
      if (!leadSnap) continue;

      for (const leadDoc of leadSnap.docs) {
        const lead = leadDoc.data() as any;
        scanned++;
        const created = lead.createdAt;
        if (!created || created > staleBefore) continue;       // too fresh — give staff time
        if (lead.lastFollowupDate === today) continue;          // already nudged today

        const ageDays = Math.max(1, Math.floor((now.getTime() - new Date(created).getTime()) / (1000 * 60 * 60 * 24)));
        await notifyOrgAdmins(
          orgId,
          'lead_followup',
          '📞 Заявка ждёт ответа',
          `${lead.name || 'Заявка'}${lead.phone ? ` (${lead.phone})` : ''} не обработана ${ageDays} дн. Перезвоните, пока лид тёплый.`,
          '/leads',
        ).catch(() => {});
        await leadDoc.ref.update({ lastFollowupDate: today }).catch(() => {});
        reminded++;
      }
    }

    return jsonResponse(200, { success: true, scanned, reminded });
  } catch (error: any) {
    console.error('Lead follow-ups error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
