import { describe, it, expect } from 'vitest';
import {
  buildKpiRows,
  countWorkingDays,
  orgMonthsBetween,
  ACTIVITY_WEIGHTS,
  type ActivityEvent,
  type RosterTeacher,
} from '../utils/teacher-kpi';

const roster: RosterTeacher[] = [
  { teacherId: 't1', name: 'Alice' },
  { teacherId: 't2', name: 'Bob' },
  { teacherId: 't3', name: 'Carol' },
];

describe('buildKpiRows', () => {
  const events: ActivityEvent[] = [
    { actorId: 't1', type: 'grade_set', count: 5, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
    { actorId: 't1', type: 'exam_created', count: 1, dayKey: '2026-07-02', createdAt: '2026-07-02T10:00:00.000Z' },
    { actorId: 't2', type: 'attendance_marked', count: 10, dayKey: '2026-07-01', createdAt: '2026-07-01T08:00:00.000Z' },
    // t3 has no activity on purpose.
  ];
  const { rows, totals } = buildKpiRows(events, roster, { expectedActiveDays: 4 });
  const byId = (id: string) => rows.find(r => r.teacherId === id)!;

  it('includes zero-activity teachers from the roster (the key oversight signal)', () => {
    expect(rows).toHaveLength(3);
    const carol = byId('t3');
    expect(carol.totalActions).toBe(0);
    expect(carol.kpiScore).toBe(0);
    expect(carol.activeDays).toBe(0);
  });

  it('sums raw counts (including batch weight) per type', () => {
    expect(byId('t1').counts.grade_set).toBe(5);
    expect(byId('t1').counts.exam_created).toBe(1);
    expect(byId('t1').totalActions).toBe(6);
    expect(byId('t2').counts.attendance_marked).toBe(10);
  });

  it('weights engagement points by activity type', () => {
    // 5 grades * 1 + 1 exam * 5 = 10
    expect(byId('t1').engagementPoints).toBe(5 * ACTIVITY_WEIGHTS.grade_set + 1 * ACTIVITY_WEIGHTS.exam_created);
  });

  it('counts distinct active days from dayKeys', () => {
    expect(byId('t1').activeDays).toBe(2);
    expect(byId('t2').activeDays).toBe(1);
  });

  it('scores consistency + engagement-relative-to-top, sorted desc', () => {
    // cohortMax points = 10. t1: cons=2/4=.5, eng=1 -> 75. t2: cons=1/4=.25, eng=1 -> 63.
    expect(byId('t1').kpiScore).toBe(75);
    expect(byId('t2').kpiScore).toBe(63);
    expect(rows[0].teacherId).toBe('t1'); // highest KPI first
  });

  it('rolls up totals', () => {
    expect(totals.teachers).toBe(3);
    expect(totals.activeTeachers).toBe(2);
    expect(totals.totalActions).toBe(16);
    expect(totals.topTeacherId).toBe('t1');
  });

  it('ignores unknown activity types', () => {
    const { rows: r2 } = buildKpiRows(
      [{ actorId: 't1', type: 'bogus_event', count: 3, dayKey: '2026-07-01' }],
      [{ teacherId: 't1', name: 'Alice' }],
      { expectedActiveDays: 4 },
    );
    expect(r2[0].totalActions).toBe(0);
  });

  it('surfaces an active actor absent from the roster', () => {
    const { rows: r2 } = buildKpiRows(
      [{ actorId: 'ghost', actorName: 'Ex-Teacher', type: 'grade_set', count: 1, dayKey: '2026-07-01' }],
      [],
      { expectedActiveDays: 4 },
    );
    expect(r2).toHaveLength(1);
    expect(r2[0].name).toBe('Ex-Teacher');
  });
});

describe('countWorkingDays', () => {
  it('excludes Sundays — any 7 consecutive days = 6 working days', () => {
    const n = countWorkingDays('2024-01-01T00:00:00.000Z', '2024-01-07T23:59:59.999Z', new Date('2024-02-01T00:00:00.000Z'));
    expect(n).toBe(6);
  });

  it('never counts past "now" (in-progress period)', () => {
    // Jan 1 2024 is a Monday; clamping end to now leaves a single working day.
    const n = countWorkingDays('2024-01-01T00:00:00.000Z', '2024-12-31T23:59:59.999Z', new Date('2024-01-01T12:00:00.000Z'));
    expect(n).toBe(1);
  });
});

describe('orgMonthsBetween', () => {
  it('pads one month on each side of the range', () => {
    expect(orgMonthsBetween('2026-07-01T00:00:00.000Z', '2026-07-31T23:59:59.999Z')).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('spans a year boundary correctly', () => {
    expect(orgMonthsBetween('2025-12-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});
