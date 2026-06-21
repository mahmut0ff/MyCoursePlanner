/**
 * Scheduled Function: Subscription payment reminders (manual billing).
 *
 * Runs daily. For every ACTIVE org subscription with a `paidUntil` date:
 *   - auto-blocks orgs past the grace window (sub → expired, org → suspended),
 *   - builds a digest of orgs expiring within 3 days / overdue / just-blocked,
 *   - sends ONE Telegram message to the super-admin so they can chase payment.
 *
 * Super-admin delivery: SUPERADMIN_TELEGRAM_CHAT_ID (env) + any super_admin user
 * with a linked telegramChatId, via the global bot.
 *
 * Trigger via: scheduled run, or POST /.netlify/functions/subscription-reminders for testing.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { jsonResponse } from './utils/auth';
import { computePaidUntil, GRACE_DAYS } from './utils/subscription';
import { TELEGRAM_BOT_TOKEN } from './utils/telegram';

const SUPERADMIN_CHAT_ID = process.env.SUPERADMIN_TELEGRAM_CHAT_ID || '1343553158';
const PLAN_PRICES: Record<string, number> = { starter: 1990, professional: 4990, enterprise: 14900 };
// Warn this many days before the due date.
const WARN_WITHIN_DAYS = 3;

async function tgSend(chatId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch((e) => console.error('Super-admin Telegram send failed:', e));
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  try {
    const [subsSnap, orgsSnap] = await Promise.all([
      adminDb.collection('subscriptions').get(),
      adminDb.collection('organizations').get(),
    ]);
    const orgName: Record<string, string> = {};
    orgsSnap.docs.forEach((d) => { orgName[d.id] = (d.data() as any).name || d.id; });

    const soon: { name: string; days: number; plan: string }[] = [];
    const overdue: { name: string; days: number; plan: string }[] = [];
    const blocked: { name: string; plan: string }[] = [];

    for (const doc of subsSnap.docs) {
      const sub = doc.data() as any;
      if (sub.status !== 'active') continue; // only paying/active orgs are chased
      const info = computePaidUntil(sub.paidUntil, nowMs);
      if (!info.hasPaidUntil) continue;
      const name = orgName[sub.organizationId] || sub.organizationId;
      const plan = sub.planId || 'starter';

      if (info.isPastGrace) {
        // Grace elapsed → auto-block.
        await doc.ref.update({ status: 'expired', updatedAt: nowIso });
        await adminDb.collection('organizations').doc(sub.organizationId)
          .update({ status: 'suspended', updatedAt: nowIso }).catch(() => {});
        blocked.push({ name, plan });
      } else if (info.isOverdue) {
        overdue.push({ name, days: Math.abs(info.daysUntilDue || 0), plan });
      } else if ((info.daysUntilDue ?? 99) <= WARN_WITHIN_DAYS) {
        soon.push({ name, days: info.daysUntilDue || 0, plan });
      }
    }

    if (!soon.length && !overdue.length && !blocked.length) {
      return jsonResponse(200, { ok: true, soon: 0, overdue: 0, blocked: 0 });
    }

    const lines: string[] = ['💳 <b>Оплата тарифов — сводка</b>'];
    if (soon.length) {
      lines.push('\n⏳ <b>Скоро истекает:</b>');
      soon.sort((a, b) => a.days - b.days)
        .forEach((o) => lines.push(`• ${o.name} — через ${o.days} дн. (${PLAN_PRICES[o.plan] || 0} сом)`));
    }
    if (overdue.length) {
      lines.push('\n🔴 <b>Просрочено (льготный период):</b>');
      overdue.sort((a, b) => b.days - a.days)
        .forEach((o) => lines.push(`• ${o.name} — ${o.days} дн. назад (${PLAN_PRICES[o.plan] || 0} сом)`));
    }
    if (blocked.length) {
      lines.push(`\n⛔️ <b>Заблокированы автоматически</b> (прошло ${GRACE_DAYS} дн. после срока):`);
      blocked.forEach((o) => lines.push(`• ${o.name} (${PLAN_PRICES[o.plan] || 0} сом)`));
    }
    lines.push('\nНапишите владельцам с напоминанием об оплате. Продлить/включить — в суперадминке → Биллинг.');
    const text = lines.join('\n');

    // Recipients: env/default super-admin chat + any super_admin with linked Telegram.
    const chatIds = new Set<string>();
    if (SUPERADMIN_CHAT_ID) chatIds.add(SUPERADMIN_CHAT_ID);
    const superAdmins = await adminDb.collection('users').where('role', '==', 'super_admin').get();
    superAdmins.docs.forEach((d) => { const c = (d.data() as any).telegramChatId; if (c) chatIds.add(String(c)); });

    await Promise.allSettled([...chatIds].map((c) => tgSend(c, text)));

    return jsonResponse(200, { ok: true, soon: soon.length, overdue: overdue.length, blocked: blocked.length, recipients: chatIds.size });
  } catch (e: any) {
    console.error('subscription-reminders error:', e);
    return jsonResponse(200, { ok: false, error: e.message });
  }
};

export { handler };
