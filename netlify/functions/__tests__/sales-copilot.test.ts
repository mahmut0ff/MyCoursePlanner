import { describe, it, expect, vi } from 'vitest';

// sales-copilot pulls in firebase-admin / ai / notifications / director-copilot at
// module load. Stub them so the PURE schedule/matching helpers can be imported and
// tested in isolation (no Firestore, no Gemini).
vi.mock('../utils/firebase-admin', () => ({ adminDb: { collection: vi.fn() } }));
vi.mock('../utils/ai', () => ({
  generateWithFallback: vi.fn(),
  hasGeminiKey: vi.fn().mockReturnValue(true),
  recordAiUsage: vi.fn(),
  AI_MODEL: 'gemini-2.5-flash',
  AI_FALLBACK_MODEL: 'gemini-2.5-flash-lite',
}));
vi.mock('../utils/notifications', () => ({ notifyOrgAdmins: vi.fn() }));
vi.mock('../utils/director-copilot', () => ({ toTelegramHtml: (s: string) => s }));

import {
  resolveNextSession, selectGroupsForQuery, WEEKDAYS_RU,
  type ScheduleEventLite, type GroupLite, type CourseLite,
} from '../utils/sales-copilot';

// Anchor: Monday 2026-06-29 12:00 (project weekday 0 = Mon). Verified independently.
const MON_NOON = new Date(2026, 5, 29, 12, 0, 0, 0);

describe('WEEKDAYS_RU — project convention is 0=Mon..6=Sun', () => {
  it('indexes Monday first and Sunday last', () => {
    expect(WEEKDAYS_RU[0]).toBe('понедельник');
    expect(WEEKDAYS_RU[6]).toBe('воскресенье');
  });
});

describe('resolveNextSession — soonest upcoming session from recurring + dated events', () => {
  it('returns null when there are no usable events', () => {
    expect(resolveNextSession([], MON_NOON)).toBeNull();
    expect(resolveNextSession([{ recurring: true, dayOfWeek: 0 }], MON_NOON)).toBeNull(); // no startTime
    expect(resolveNextSession([{ recurring: true, startTime: '10:00' }], MON_NOON)).toBeNull(); // no dayOfWeek
  });

  it('a recurring session later TODAY stays today', () => {
    const next = resolveNextSession([{ recurring: true, dayOfWeek: 0, startTime: '18:00' }], MON_NOON);
    expect(next).toMatchObject({ date: '2026-06-29', startTime: '18:00', weekday: 0, weekdayLabel: 'понедельник' });
  });

  it("a recurring session whose time already passed today rolls to next week", () => {
    const next = resolveNextSession([{ recurring: true, dayOfWeek: 0, startTime: '09:00' }], MON_NOON);
    expect(next).toMatchObject({ date: '2026-07-06', startTime: '09:00', weekday: 0 }); // +7 days
  });

  it('a recurring session later this week resolves to the right calendar date', () => {
    const next = resolveNextSession([{ recurring: true, dayOfWeek: 2, startTime: '09:00' }], MON_NOON); // Wed
    expect(next).toMatchObject({ date: '2026-07-01', startTime: '09:00', weekday: 2, weekdayLabel: 'среда' });
  });

  it('picks the soonest among several recurring events', () => {
    const events: ScheduleEventLite[] = [
      { recurring: true, dayOfWeek: 0, startTime: '09:00', title: 'past-today' }, // next week
      { recurring: true, dayOfWeek: 1, startTime: '10:00', title: 'tue' },        // tomorrow
      { recurring: true, dayOfWeek: 2, startTime: '09:00', title: 'wed' },        // Wed
    ];
    const next = resolveNextSession(events, MON_NOON);
    expect(next).toMatchObject({ date: '2026-06-30', startTime: '10:00', title: 'tue', weekdayLabel: 'вторник' });
  });

  it('considers a future dated (one-off) event and ignores past / passed ones', () => {
    const future = resolveNextSession([{ date: '2026-06-29', startTime: '15:00' }], MON_NOON);
    expect(future).toMatchObject({ date: '2026-06-29', startTime: '15:00', weekday: 0 });

    expect(resolveNextSession([{ date: '2026-06-28', startTime: '15:00' }], MON_NOON)).toBeNull(); // yesterday
    expect(resolveNextSession([{ date: '2026-06-29', startTime: '08:00' }], MON_NOON)).toBeNull(); // earlier today
  });

  it('a sooner dated event beats a later recurring one', () => {
    const events: ScheduleEventLite[] = [
      { recurring: true, dayOfWeek: 2, startTime: '09:00', title: 'wed-recurring' }, // 2026-07-01
      { date: '2026-06-29', startTime: '15:00', title: 'today-dated' },              // today 15:00
    ];
    const next = resolveNextSession(events, MON_NOON);
    expect(next).toMatchObject({ date: '2026-06-29', startTime: '15:00', title: 'today-dated' });
  });

  it('skips events with a malformed startTime', () => {
    const events: ScheduleEventLite[] = [
      { recurring: true, dayOfWeek: 1, startTime: '25:99' }, // invalid
      { recurring: true, dayOfWeek: 1, startTime: 'noon' },  // invalid
      { recurring: true, dayOfWeek: 1, startTime: '10:30' }, // valid → wins
    ];
    expect(resolveNextSession(events, MON_NOON)).toMatchObject({ date: '2026-06-30', startTime: '10:30' });
  });
});

describe('selectGroupsForQuery — fuzzy-match a course query to the org groups', () => {
  const courses: CourseLite[] = [
    { id: 'c1', title: 'Английский язык' },
    { id: 'c2', title: 'Программирование' },
  ];
  const groups: GroupLite[] = [
    { id: 'g1', name: 'English A2', courseId: 'c1', courseName: 'Английский язык' },
    { id: 'g2', name: 'Python Beginners', courseId: 'c2', courseName: 'Программирование' },
    { id: 'g3', name: 'IELTS Intensive', courseId: 'c1', courseName: 'Английский язык' },
  ];

  it('matches by course title (via courseId) — "английский" → both English groups', () => {
    expect(selectGroupsForQuery('английский', groups, courses).map(g => g.id).sort()).toEqual(['g1', 'g3']);
  });

  it('matches by group name when the course title does not — "python"', () => {
    expect(selectGroupsForQuery('python', groups, courses).map(g => g.id)).toEqual(['g2']);
  });

  it('matches a specific group name — "IELTS"', () => {
    expect(selectGroupsForQuery('IELTS', groups, courses).map(g => g.id)).toEqual(['g3']);
  });

  it('an empty query returns every group (so the bot can list what is on offer)', () => {
    expect(selectGroupsForQuery('', groups, courses)).toHaveLength(3);
  });

  it('returns nothing for an unrelated query', () => {
    expect(selectGroupsForQuery('химия', groups, courses)).toEqual([]);
  });
});
