/**
 * Scheduled Function: Trial Reminders
 *
 * Runs daily (via Netlify Scheduled Functions or external cron).
 * Checks all trial subscriptions and sends reminders at days 11, 8, 5, 2 (every ~3 days)
 * and expired notification when trial ends.
 *
 * Trigger via: POST /trial-reminders  (or Netlify scheduled function)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { notifyOrgAdmins } from './utils/notifications';
import { jsonResponse } from './utils/auth';

const REMINDER_DAYS = [11, 8, 5, 2]; // send reminders at these remaining days

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const now = new Date();

  try {
    // Get all trial subscriptions
    const trialSnap = await adminDb.collection('subscriptions')
      .where('status', '==', 'trial').get();

    let reminders = 0;
    let expired = 0;

    for (const doc of trialSnap.docs) {
      const sub = doc.data();
      if (!sub.trialEndsAt || !sub.organizationId) continue;

      const trialEnd = new Date(sub.trialEndsAt);
      const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // ─── Trial expired ───
      if (daysLeft <= 0) {
        // Mark subscription as expired
        await doc.ref.update({ status: 'expired', expiredAt: now.toISOString() });

        // Notify org admins
        await notifyOrgAdmins(
          sub.organizationId,
          'trial_expired',
          'Пробный период закончился',
          'Ваш 14-дневный пробный период закончился. Оплатите тариф для продолжения работы.',
          '/billing'
        );
        expired++;
        continue;
      }

      // ─── Send reminder at specific days ───
      if (REMINDER_DAYS.includes(daysLeft)) {
        // Check if we already sent a reminder today (idempotency)
        const today = now.toISOString().split('T')[0];
        const lastReminder = sub.lastReminderDate;
        if (lastReminder === today) continue;

        await doc.ref.update({ lastReminderDate: today });

        const dayWord = daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней';
        await notifyOrgAdmins(
          sub.organizationId,
          'trial_reminder',
          `Осталось ${daysLeft} ${dayWord} пробного периода`,
          `Ваш пробный период заканчивается через ${daysLeft} ${dayWord}. Оплатите тариф, чтобы не потерять доступ.`,
          '/billing'
        );
        reminders++;
      }
    }

    return jsonResponse(200, { success: true, processed: trialSnap.size, reminders, expired });
  } catch (error: any) {
    console.error('Trial reminders error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
