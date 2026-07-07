/**
 * Scheduled Function: Lesson Reminders
 *
 * Runs every evening (scheduled via netlify.toml). Finds tomorrow's lessons —
 * both weekly timetable events (recurring + dayOfWeek) and dated calendar
 * events — and sends each student / teacher ONE aggregated "tomorrow you have…"
 * reminder (in-app + push + Telegram).
 *
 * Schedule-change / cancellation notices are handled inline in api-org
 * (updateEvent / deleteEvent); this function only does the look-ahead reminder.
 *
 * Trigger via: scheduled run, or POST /.netlify/functions/lesson-reminders for testing.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import { createNotification } from './utils/notifications';
import { jsonResponse } from './utils/auth';

const WEEKDAYS_RU = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

interface ReminderItem { time: string; title: string; groupName?: string; }

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    const tomorrowStr = `${y}-${m}-${d}`;
    // Project's convention: 0=Mon .. 6=Sun. JS getDay(): 0=Sun .. 6=Sat.
    const ourWeekday = (tomorrow.getDay() + 6) % 7;
    const dateLabel = `${WEEKDAYS_RU[ourWeekday]} ${d}.${m}`;

    // Tomorrow's events: recurring (by weekday) + dated (by exact date).
    const [recurringSnap, datedSnap] = await Promise.all([
      adminDb.collection('scheduleEvents').where('recurring', '==', true).where('dayOfWeek', '==', ourWeekday).get(),
      adminDb.collection('scheduleEvents').where('date', '==', tomorrowStr).get(),
    ]);
    const events = [...recurringSnap.docs, ...datedSnap.docs].map(d => ({ id: d.id, ...(d.data() as any) }));
    if (events.length === 0) {
      return jsonResponse(200, { success: true, events: 0, reminders: 0 });
    }

    // Batch-fetch the groups referenced by these events.
    const groupIds = [...new Set(events.map(e => e.groupId).filter(Boolean))];
    const groupMap = new Map<string, any>(Object.entries(await getDocsByIds('groups', groupIds)));

    // Aggregate per recipient: { orgId, isTeacher, items[] }
    const perUser = new Map<string, { orgId: string; isTeacher: boolean; items: ReminderItem[] }>();
    const add = (uid: string, orgId: string, asTeacher: boolean, item: ReminderItem) => {
      if (!uid || !orgId) return;
      const cur = perUser.get(uid) || { orgId, isTeacher: false, items: [] };
      cur.items.push(item);
      if (asTeacher) cur.isTeacher = true;
      perUser.set(uid, cur);
    };

    for (const ev of events) {
      const group = ev.groupId ? groupMap.get(ev.groupId) : null;
      const groupName = ev.groupName || group?.name || '';
      const item: ReminderItem = { time: ev.startTime || '', title: ev.title || 'Занятие', groupName };

      if (group) {
        for (const sid of (group.studentIds || [])) add(sid, ev.organizationId, false, item);
        for (const tid of (group.teacherIds || [])) add(tid, ev.organizationId, true, item);
      }
      if (ev.teacherId) add(ev.teacherId, ev.organizationId, true, item);
    }

    let reminders = 0;
    const tasks: Promise<any>[] = [];
    for (const [uid, info] of perUser) {
      const sorted = info.items.sort((a, b) => a.time.localeCompare(b.time));
      const lines = sorted.map(it => `• ${it.time} — ${it.title}${it.groupName ? ` (${it.groupName})` : ''}`).join('\n');
      const countWord = sorted.length === 1 ? 'занятие' : sorted.length < 5 ? 'занятия' : 'занятий';
      tasks.push(createNotification({
        recipientId: uid,
        type: 'lesson_reminder',
        title: `Завтра у вас ${sorted.length} ${countWord}`,
        message: `${dateLabel}:\n${lines}`,
        link: info.isTeacher ? '/schedule' : '/student/schedule',
        organizationId: info.orgId,
      }));
      reminders++;
    }
    await Promise.allSettled(tasks);

    return jsonResponse(200, { success: true, events: events.length, reminders });
  } catch (error: any) {
    console.error('Lesson reminders error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
