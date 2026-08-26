import { describe, it, expect } from 'vitest';
import {
  buildKpiRows,
  countWorkingDays,
  orgMonthsBetween,
  ACTIVITY_WEIGHTS,
  type ActivityEvent,
  type RosterTeacher,
  type TeacherWorkload,
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

  it('scores consistency + engagement, sorted desc', () => {
    // Нагрузка не передана — знаменатель у всех одинаковый, интенсивности равны
    // (10 и 10), эталон = лучший. t1: cons=2/4=.5, eng=1 -> 75. t2: cons=.25 -> 63.
    expect(byId('t1').kpiScore).toBe(75);
    expect(byId('t2').kpiScore).toBe(63);
    expect(rows[0].teacherId).toBe('t1'); // highest KPI first
  });

  it('rolls up totals', () => {
    expect(totals.teachers).toBe(3);
    expect(totals.activeTeachers).toBe(2);
    expect(totals.totalActions).toBe(16);
    expect(totals.topTeacherId).toBe('t1');
    expect(totals.typicalIntensity).toBe(10); // медиана работающих: [10, 10]
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

/**
 * Главная гарантия рейтинга: сравнивается усердие, а не размер контингента.
 * До нормировки первое место занимал тот, у кого больше учеников — у него
 * физически больше оценок и отметок посещаемости за тот же самый труд.
 */
describe('buildKpiRows — нормировка на нагрузку', () => {
  const pair: RosterTeacher[] = [
    { teacherId: 'big', name: 'Большие группы' },
    { teacherId: 'small', name: 'Малые группы' },
  ];
  // Оба отметили ВСЕХ своих учеников одинаковое число раз: 3 отметки на ученика.
  const diligent: ActivityEvent[] = [
    { actorId: 'big', type: 'grade_set', count: 300, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
    { actorId: 'small', type: 'grade_set', count: 60, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
  ];
  const workload: Record<string, TeacherWorkload> = {
    big: { students: 100, groups: 5 },
    small: { students: 20, groups: 1 },
  };

  it('равное усердие при разном числе учеников даёт равный KPI', () => {
    const { rows } = buildKpiRows(diligent, pair, { expectedActiveDays: 4, workload });
    const big = rows.find(r => r.teacherId === 'big')!;
    const small = rows.find(r => r.teacherId === 'small')!;
    expect(big.intensity).toBe(small.intensity);
    expect(big.kpiScore).toBe(small.kpiScore);
    expect(big.engagementPct).toBe(100);
    expect(small.engagementPct).toBe(100);
  });

  it('без нагрузки те же события отдали бы победу большому контингенту (регресс, который чиним)', () => {
    const { rows } = buildKpiRows(diligent, pair, { expectedActiveDays: 4 });
    const big = rows.find(r => r.teacherId === 'big')!;
    const small = rows.find(r => r.teacherId === 'small')!;
    expect(big.kpiScore).toBeGreaterThan(small.kpiScore);
  });

  it('созданные материалы нормируются на группы, а не на учеников', () => {
    const { rows } = buildKpiRows(
      [
        { actorId: 'big', type: 'lesson_created', count: 5, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
        { actorId: 'small', type: 'lesson_created', count: 1, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
      ],
      pair,
      { expectedActiveDays: 4, workload },
    );
    expect(rows[0].intensity).toBe(rows[1].intensity); // по уроку на группу у обоих
    expect(rows[0].kpiScore).toBe(rows[1].kpiScore);
  });

  it('показывает нагрузку в строке — балл не должен быть чёрным ящиком', () => {
    const { rows } = buildKpiRows(diligent, pair, { expectedActiveDays: 4, workload });
    const big = rows.find(r => r.teacherId === 'big')!;
    expect(big.students).toBe(100);
    expect(big.groups).toBe(5);
  });

  it('неизвестную нагрузку берёт типичной по школе, а не единицей', () => {
    const trio: RosterTeacher[] = [
      { teacherId: 'a', name: 'A' },
      { teacherId: 'b', name: 'B' },
      { teacherId: 'nogroups', name: 'Без групп' },
    ];
    const { rows } = buildKpiRows(
      [
        { actorId: 'a', type: 'grade_set', count: 60, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
        { actorId: 'b', type: 'grade_set', count: 60, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
        { actorId: 'nogroups', type: 'grade_set', count: 60, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
      ],
      trio,
      { expectedActiveDays: 4, workload: { a: { students: 20, groups: 1 }, b: { students: 20, groups: 1 } } },
    );
    const ghost = rows.find(r => r.teacherId === 'nogroups')!;
    const a = rows.find(r => r.teacherId === 'a')!;
    expect(ghost.intensity).toBe(a.intensity); // 60 / типичные 20, а не 60 / 1
    expect(ghost.students).toBe(0); // в строке — то, что реально известно
  });
});

/**
 * Эталон — медиана×2, но не выше лучшего. Раньше знаменателем был максимум:
 * один энтузиаст обнулял вовлечённость всей команды.
 */
describe('buildKpiRows — эталон вовлечённости', () => {
  const trio: RosterTeacher[] = [
    { teacherId: 'a', name: 'A' },
    { teacherId: 'b', name: 'B' },
    { teacherId: 'star', name: 'Star' },
  ];
  const workload: Record<string, TeacherWorkload> = {
    a: { students: 10, groups: 1 },
    b: { students: 10, groups: 1 },
    star: { students: 10, groups: 1 },
  };

  it('выброс не обнуляет остальных: типичный получает половину, а не десятую', () => {
    const { rows } = buildKpiRows(
      [
        { actorId: 'a', type: 'grade_set', count: 10, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
        { actorId: 'b', type: 'grade_set', count: 10, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
        { actorId: 'star', type: 'grade_set', count: 100, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
      ],
      trio,
      { expectedActiveDays: 4, workload },
    );
    const a = rows.find(r => r.teacherId === 'a')!;
    const star = rows.find(r => r.teacherId === 'star')!;
    expect(a.engagementPct).toBe(50); // интенсивность 1 при эталоне 2 (медиана 1 × 2)
    expect(star.engagementPct).toBe(100);
    expect(rows[0].teacherId).toBe('star');
  });

  it('в ровной команде полный балл достижим (эталон не выше лучшего)', () => {
    const { rows } = buildKpiRows(
      [
        { actorId: 'a', type: 'grade_set', count: 10, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
        { actorId: 'b', type: 'grade_set', count: 10, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
      ],
      [trio[0], trio[1]],
      { expectedActiveDays: 4, workload },
    );
    expect(rows.every(r => r.engagementPct === 100)).toBe(true);
  });

  it('ничью разрывает интенсивность, а не число действий', () => {
    // Одинаковые дни и балл, но у 'big' втрое больше учеников на то же усердие.
    const { rows } = buildKpiRows(
      [
        { actorId: 'big', type: 'grade_set', count: 30, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
        { actorId: 'small', type: 'grade_set', count: 20, dayKey: '2026-07-01', createdAt: '2026-07-01T09:00:00.000Z' },
      ],
      [{ teacherId: 'big', name: 'Big' }, { teacherId: 'small', name: 'Small' }],
      {
        expectedActiveDays: 4,
        workload: { big: { students: 30, groups: 1 }, small: { students: 10, groups: 1 } },
      },
    );
    expect(rows[0].teacherId).toBe('small'); // 2.0 на ученика против 1.0
    expect(rows[0].totalActions).toBeLessThan(rows[1].totalActions);
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
