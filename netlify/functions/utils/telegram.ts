/**
 * Telegram Notification Helper — sends messages via org-specific Telegram bots.
 * 
 * Architecture:
 * - Each org has its own Telegram bot (token in organizationAIManager/{orgId}.telegramBotToken)
 * - Users link their Telegram via /start {code} command to the org's bot
 * - telegramChatId is stored on the user document
 * 
 * Usage:
 *   await sendTelegramToUser(orgId, userId, 'Ваш ребенок получил оценку 5');
 *   await sendTelegramToUsers(orgId, [userId1, userId2], 'Новое ДЗ!');
 */
import { adminDb } from './firebase-admin';

/**
 * Get the Telegram bot token for an organization.
 * Returns null if not configured.
 */
async function getOrgBotToken(orgId: string): Promise<string | null> {
  const doc = await adminDb.collection('organizationAIManager').doc(orgId).get();
  const data = doc.data();
  return data?.telegramBotToken || null;
}

/**
 * Send a plain text message to a Telegram chat via Bot API.
 */
async function sendTelegramMessage(botToken: string, chatId: string | number, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn(`Telegram send failed (chat ${chatId}):`, err);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Telegram API error:', e);
    return false;
  }
}

/**
 * Send a Telegram notification to a specific user (by userId).
 * Silently skips if user has no telegramChatId or org has no bot.
 */
export async function sendTelegramToUser(
  orgId: string,
  userId: string,
  message: string
): Promise<boolean> {
  const [botToken, userDoc] = await Promise.all([
    getOrgBotToken(orgId),
    adminDb.collection('users').doc(userId).get(),
  ]);

  if (!botToken || !userDoc.exists) return false;

  const chatId = userDoc.data()?.telegramChatId;
  if (!chatId) return false;

  return sendTelegramMessage(botToken, chatId, message);
}

/**
 * Send a Telegram notification to multiple users.
 * Returns count of successfully sent messages.
 */
export async function sendTelegramToUsers(
  orgId: string,
  userIds: string[],
  message: string
): Promise<number> {
  if (userIds.length === 0) return 0;

  const botToken = await getOrgBotToken(orgId);
  if (!botToken) return 0;

  // Batch fetch user docs
  const userDocs = await Promise.all(
    userIds.map(uid => adminDb.collection('users').doc(uid).get())
  );

  let sent = 0;
  const sends = userDocs
    .filter(d => d.exists && d.data()?.telegramChatId)
    .map(async (d) => {
      const ok = await sendTelegramMessage(botToken, d.data()!.telegramChatId, message);
      if (ok) sent++;
    });

  await Promise.allSettled(sends);
  return sent;
}

/**
 * Send a Telegram notification to ALL students of an org who have Telegram linked.
 */
export async function sendTelegramToOrgStudents(
  orgId: string,
  message: string
): Promise<number> {
  const botToken = await getOrgBotToken(orgId);
  if (!botToken) return 0;

  const snap = await adminDb.collection('users')
    .where('organizationId', '==', orgId).get();

  const students = snap.docs.filter(d => {
    const data = d.data();
    return data.role === 'student' && data.telegramChatId;
  });

  let sent = 0;
  await Promise.allSettled(
    students.map(async (d) => {
      const ok = await sendTelegramMessage(botToken, d.data().telegramChatId, message);
      if (ok) sent++;
    })
  );
  return sent;
}

/**
 * Generate a unique Telegram linking code for a user.
 * Stored in Firestore with a 15-minute TTL.
 */
export async function generateTelegramLinkCode(
  orgId: string,
  userId: string
): Promise<string> {
  // Generate a 6-char alphanumeric code
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  await adminDb.collection('telegramLinkCodes').doc(code).set({
    orgId,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min TTL
  });

  return code;
}

/**
 * Resolve a Telegram linking code to userId + orgId.
 * Returns null if expired or not found. Deletes code after use.
 */
export async function resolveTelegramLinkCode(
  code: string
): Promise<{ orgId: string; userId: string } | null> {
  const doc = await adminDb.collection('telegramLinkCodes').doc(code).get();
  if (!doc.exists) return null;

  const data = doc.data()!;
  if (new Date(data.expiresAt) < new Date()) {
    // Expired — clean up
    await doc.ref.delete();
    return null;
  }

  // Delete used code
  await doc.ref.delete();
  return { orgId: data.orgId, userId: data.userId };
}
