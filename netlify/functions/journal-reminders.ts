/**
 * Scheduled Function: Journal Reminders
 *
 * Вечером (21:00 Бишкек) напоминает преподавателю о сегодняшних занятиях, по
 * которым не отмечена перекличка. «Журнал заполнен» = есть lessonSessions на
 * (группа, дата) — её пишут веб-журнал и /otmetka в боте — либо запись journal
 * по курсу группы за сегодня (так отмечает AI-копилот).
 *
 * Trigger via: scheduled run, or POST with x-cron-secret for testing.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import { createNotification } from './utils/notifications';
import { jsonResponse } from './utils/auth';
import { cronAccessError } from './utils/cron-auth';
import { orgTodayISO } from './utils/schedule-context';

/** Занятия, начавшиеся позже, к 21:00 ещё могут идти — о них не напоминаем. */
const LATEST_START = '20:00';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  const cronDenied = await cronAccessError(event);
  if (cronDenied) return cronDenied;

  try {
    const today = orgTodayISO();
    const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=Пн
    const [recurringSnap, datedSnap, sessionsSnap, journalSnap] = await Promise.all([
      adminDb.collection('scheduleEvents').where('recurring', '==', true).where('dayOfWeek', '==', weekday).get(),
      adminDb.collection('scheduleEvents').where('date', '==', today).get(),
      adminDb.collection('lessonSessions').where('date', '==', today).get(),
      adminDb.collection('journal').where('date', '==', today).get(),
    ]);
    const filled = new Set(sessionsSnap.docs.map(d => `${d.data().organizationId}|${d.data().groupId}`));
    // AI-копилот пишет журнал без lessonSessions — его отметку узнаём по курсу группы.
    const journalCourses = new Set(journalSnap.docs.map(d => `${d.data().organizationId}|${d.data().courseId}`));

    const eventMap = new Map<string, any>();
    for (const doc of [...recurringSnap.docs, ...datedSnap.docs]) eventMap.set(doc.id, { id: doc.id, ...(doc.data() as any) });
    // Перекличка привязана к группе: занятия без группы журналом не отмечаются.
    const pending = [...eventMap.values()].filter(ev =>
      ev.groupId && ev.organizationId && (ev.startTime || '') <= LATEST_START
      && !filled.has(`${ev.organizationId}|${ev.groupId}`));
    if (pending.length === 0) return jsonResponse(200, { success: true, pending: 0, reminders: 0 });

    const groups = await getDocsByIds('groups', [...new Set(pending.map(e => e.groupId))]);
    const perTeacher = new Map<string, { orgId: string; lines: Set<string> }>();
    for (const ev of pending) {
      const group: any = groups[ev.groupId];
      if (!group || journalCourses.has(`${ev.organizationId}|${group.courseId}`)) continue;
      const line = `• ${ev.startTime || ''} — ${group.name || ev.title || 'Занятие'}`;
      for (const tid of new Set([...(group.teacherIds || []), ev.teacherId].filter(Boolean))) {
        const cur = perTeacher.get(tid) || { orgId: ev.organizationId, lines: new Set<string>() };
        cur.lines.add(line);
        perTeacher.set(tid, cur);
      }
    }

    await Promise.allSettled([...perTeacher].map(([uid, info]) => createNotification({
      recipientId: uid,
      type: 'journal_unfilled',
      title: 'Журнал за сегодня не заполнен',
      message: `Не отмечена посещаемость:\n${[...info.lines].sort().join('\n')}\n\nОтметьте перекличку здесь же — /otmetka — или в веб-журнале.`,
      link: '/journal',
      organizationId: info.orgId,
    })));

    return jsonResponse(200, { success: true, pending: pending.length, reminders: perTeacher.size });
  } catch (error: any) {
    console.error('Journal reminders error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
