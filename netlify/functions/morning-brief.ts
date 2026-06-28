/**
 * Scheduled Function: Morning AI Brief for Directors
 *
 * Runs daily (scheduled via netlify.toml). For each active, AI-enabled org it
 * generates a short AI briefing (state of the business + 2-3 priority actions)
 * with generateBrief() and pushes it to every director (owner/admin/manager) who
 * has linked Telegram — with the quick-action menu attached, so they can act in
 * one tap right from the message.
 *
 * Telegram-only by design: it's the bot's "chief-of-staff" channel (the existing
 * weekly-digest still covers in-app/push). Skips orgs with no active students so
 * we don't burn AI on empty centers.
 *
 * Trigger via: scheduled run, or POST /.netlify/functions/morning-brief for testing.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { jsonResponse } from './utils/auth';
import { planHasAIManager } from './utils/plan-limits';
import { generateBrief, directorMenuKeyboard } from './utils/director-copilot';
import { TELEGRAM_BOT_TOKEN } from './utils/telegram';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  try {
    const orgSnap = await adminDb.collection('organizations').get();
    let orgsScanned = 0;
    let briefsSent = 0;

    for (const orgDoc of orgSnap.docs) {
      const org = orgDoc.data() as any;
      const orgId = orgDoc.id;
      if (org.status && org.status !== 'active') continue;
      if (!planHasAIManager(org.planId)) continue; // AI feature → Professional+

      // Active directors (owner/admin/manager) + count active students in one read.
      const memberSnap = await adminDb.collection('orgMembers').doc(orgId).collection('members')
        .where('status', '==', 'active').get();
      const adminUids = memberSnap.docs
        .filter(d => ['owner', 'admin', 'manager'].includes((d.data() as any).role))
        .map(d => (d.data() as any).userId || d.id);
      if (adminUids.length === 0) continue;

      const activeStudents = memberSnap.docs.filter(d => (d.data() as any).role === 'student').length;
      if (activeStudents === 0) continue; // not really operating yet — skip

      // Only directors who linked Telegram get the morning brief.
      const userDocs = await Promise.all(adminUids.map(uid => adminDb.collection('users').doc(uid).get()));
      const chatIds = userDocs.map(d => d.data()?.telegramChatId).filter(Boolean) as string[];
      if (chatIds.length === 0) continue;

      orgsScanned++;
      const brief = await generateBrief(orgId, org.name || 'центр');
      const text = `☀️ <b>Утренняя сводка</b>\n\n${brief}`;

      await Promise.allSettled(chatIds.map(chatId =>
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: directorMenuKeyboard() }),
        }).catch(() => {}),
      ));
      briefsSent++;
    }

    return jsonResponse(200, { success: true, orgsScanned, briefsSent });
  } catch (error: any) {
    console.error('Morning brief error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
