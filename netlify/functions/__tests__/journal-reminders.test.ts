/**
 * Вечернее «журнал за сегодня не заполнен»: напоминаем только о группах без
 * lessonSessions за сегодня, и одному преподавателю — одним сообщением.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rows: Record<string, any[]> = { scheduleEvents: [], lessonSessions: [], journal: [] };
const groups: Record<string, any> = {};
const sent: any[] = [];

function makeQuery(list: () => any[], filters: Array<[string, any]> = []) {
  const q: any = {
    where: (field: string, op: string, value: any) =>
      op === '==' ? makeQuery(list, [...filters, [field, value]]) : q,
    get: async () => ({
      docs: list()
        .filter(r => filters.every(([f, v]) => r[f] === v))
        .map((r, i) => ({ id: r.id || `doc-${i}`, data: () => r })),
    }),
  };
  return q;
}

vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: { collection: vi.fn((name: string) => makeQuery(() => rows[name] || [])) },
  getDocsByIds: vi.fn(async (_c: string, ids: string[]) =>
    Object.fromEntries(ids.filter(id => groups[id]).map(id => [id, groups[id]]))),
}));
vi.mock('../utils/notifications', () => ({
  createNotification: vi.fn(async (n: any) => { sent.push(n); }),
}));
vi.mock('../utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/auth')>();
  return { ...actual, verifyAuth: vi.fn(async () => null) };
});

import { handler } from '../journal-reminders';
import { orgTodayISO } from '../utils/schedule-context';

const ORG = 'org-1';
const today = orgTodayISO();
const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
const run = () => handler({ httpMethod: 'POST', headers: {} } as any, {} as any, () => {}) as Promise<any>;

beforeEach(() => {
  rows.scheduleEvents.length = 0;
  rows.lessonSessions.length = 0;
  rows.journal.length = 0;
  sent.length = 0;
  for (const k of Object.keys(groups)) delete groups[k];
});

describe('напоминание о незаполненном журнале', () => {
  it('пишет преподавателю только о группах без переклички, одним сообщением', async () => {
    groups.g1 = { name: 'English A', teacherIds: ['t1'] };
    groups.g2 = { name: 'Math B', teacherIds: ['t1'] };
    groups.g3 = { name: 'Уже отмечена', teacherIds: ['t1'] };
    rows.scheduleEvents.push(
      { id: 'e1', organizationId: ORG, recurring: true, dayOfWeek: dow, startTime: '16:00', groupId: 'g1', teacherId: 't1' },
      { id: 'e2', organizationId: ORG, date: today, startTime: '10:00', groupId: 'g2' },
      { id: 'e3', organizationId: ORG, date: today, startTime: '12:00', groupId: 'g3' },
    );
    rows.lessonSessions.push({ organizationId: ORG, groupId: 'g3', date: today });

    await run();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ recipientId: 't1', type: 'journal_unfilled', organizationId: ORG });
    expect(sent[0].message).toContain('• 10:00 — Math B\n• 16:00 — English A');
    expect(sent[0].message).not.toContain('Уже отмечена');
  });

  it('считает журнал заполненным, если копилот отметил курс группы (без lessonSessions)', async () => {
    groups.g1 = { name: 'English A', courseId: 'c1', teacherIds: ['t1'] };
    rows.scheduleEvents.push({ id: 'e1', organizationId: ORG, date: today, startTime: '10:00', groupId: 'g1' });
    rows.journal.push({ organizationId: ORG, courseId: 'c1', date: today, studentId: 's1' });

    await run();

    expect(sent).toHaveLength(0);
  });

  it('не трогает занятия, которые ещё могут идти, и занятия без группы', async () => {
    groups.g1 = { name: 'Поздняя', teacherIds: ['t1'] };
    rows.scheduleEvents.push(
      { id: 'e1', organizationId: ORG, date: today, startTime: '20:30', groupId: 'g1' },
      { id: 'e2', organizationId: ORG, date: today, startTime: '09:00', teacherId: 't1' },
    );

    await run();

    expect(sent).toHaveLength(0);
  });
});
