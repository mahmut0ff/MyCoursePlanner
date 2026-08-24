import { describe, it, expect } from 'vitest';
import {
  emptyCounts, mergeCounts, sumCounts, computeMetrics, toneOf,
  isNotAdmitted, admissionGap, admissionReason, buildRatingRows,
  NO_ADMISSION_THRESHOLD,
  ATTENDANCE_WEIGHT, GRADE_WEIGHT,
  type RatingCounts, type RatingStudent, type RatingStat,
} from '../student-rating';

/** Счётчики одного курса: посещаемость задаём напрямую, оценки — списком (значение, максимум). */
function counts(
  att: Partial<Pick<RatingCounts, 'present' | 'late' | 'absent' | 'excused'>>,
  grades: [value: number, max: number][] = [],
  lastActivity: string | null = null,
): RatingCounts {
  const c = { ...emptyCounts(), ...att, lastActivity };
  grades.forEach(([value, max], i) => {
    c.gradeCount++;
    c.gradePctSum += (value / max) * 100;
    c.gradeValueSum += value;
    c.scaleMax = i === 0 ? max : (c.scaleMax === max ? max : null);
  });
  return c;
}

describe('computeMetrics', () => {
  it('без данных не даёт ни балла, ни ложных нулей', () => {
    const m = computeMetrics(emptyCounts());
    expect(m.hasData).toBe(false);
    expect(m.hasAttendance).toBe(false);
    expect(m.hasGrades).toBe(false);
    expect(m.score).toBe(0);
    expect(m.avgGrade).toBeNull();
  });

  it('опоздание засчитывается как присутствие, пропуск и уважительная — нет', () => {
    const m = computeMetrics(counts({ present: 6, late: 2, absent: 1, excused: 1 }));
    expect(m.lessons).toBe(10);
    expect(m.attended).toBe(8);
    expect(m.attendancePct).toBe(80);
  });

  it('без оценок балл держит ОДНА посещаемость, а не 40 % от неё', () => {
    const m = computeMetrics(counts({ present: 10 }));
    expect(m.hasGrades).toBe(false);
    expect(m.score).toBe(100);
    expect(m.score).not.toBe(Math.round(100 * ATTENDANCE_WEIGHT));
  });

  it('без посещаемости балл держит одна успеваемость', () => {
    const m = computeMetrics(counts({}, [[4, 5]]));
    expect(m.hasAttendance).toBe(false);
    expect(m.gradePct).toBe(80);
    expect(m.score).toBe(80);
  });

  it('когда есть обе половины — 40 % посещаемость + 60 % успеваемость', () => {
    const m = computeMetrics(counts({ present: 5, absent: 5 }, [[5, 5], [4, 5]]));
    expect(m.attendancePct).toBe(50);
    expect(m.gradePct).toBe(90);
    expect(m.score).toBe(Math.round(50 * ATTENDANCE_WEIGHT + 90 * GRADE_WEIGHT)); // 74
  });

  it('средний балл показывается в единицах шкалы, пока шкала одна', () => {
    const m = computeMetrics(counts({}, [[5, 5], [4, 5], [4, 5]]));
    expect(m.scaleMax).toBe(5);
    expect(m.avgGrade).toBeCloseTo(4.33, 2);
  });

  it('каждая оценка нормируется СВОЕЙ шкалой, а не общей', () => {
    // «87 из 100» и «5 из 5» — обе отличные; деление 87 на 5 дало бы 1740 %.
    const m = computeMetrics(counts({}, [[87, 100], [5, 5]]));
    expect(m.gradePct).toBe(94); // (87 + 100) / 2
    expect(m.scaleMax).toBeNull(); // шкалы разные — «X / Y» показывать нечестно
    expect(m.avgGrade).toBeNull();
    expect(m.score).toBeLessThanOrEqual(100);
  });

  it('процент никогда не выходит за 100', () => {
    const m = computeMetrics(counts({}, [[120, 100]]));
    expect(m.gradePct).toBe(100);
    expect(m.score).toBe(100);
  });
});

describe('mergeCounts', () => {
  it('складывает сырые числа, а не проценты', () => {
    // Курс A: 1 занятие из 1. Курс B: 1 из 9. Среднее средних дало бы 55 %,
    // правильный ответ — 2 из 10.
    const merged = mergeCounts(
      counts({ present: 1 }),
      counts({ present: 1, absent: 8 }),
    );
    expect(computeMetrics(merged).attendancePct).toBe(20);
  });

  it('курс без оценок не обнуляет шкалу соседнего', () => {
    const merged = mergeCounts(counts({}, [[4, 5]]), counts({ present: 3 }));
    expect(merged.scaleMax).toBe(5);
    expect(computeMetrics(merged).avgGrade).toBe(4);
  });

  it('одинаковая шкала переживает сложение, разная — схлопывается в null', () => {
    expect(mergeCounts(counts({}, [[4, 5]]), counts({}, [[5, 5]])).scaleMax).toBe(5);
    expect(mergeCounts(counts({}, [[4, 5]]), counts({}, [[80, 100]])).scaleMax).toBeNull();
  });

  it('уже схлопнутая шкала не восстанавливается следующим слагаемым', () => {
    const mixed = mergeCounts(counts({}, [[4, 5]]), counts({}, [[80, 100]]));
    expect(mergeCounts(mixed, counts({}, [[5, 5]])).scaleMax).toBeNull();
  });

  it('последняя активность — самая поздняя из двух, и пустая сторона её не стирает', () => {
    expect(mergeCounts(counts({}, [], '2026-08-01'), counts({}, [], '2026-08-15')).lastActivity).toBe('2026-08-15');
    expect(mergeCounts(counts({}, [], '2026-08-01'), counts({}, [], null)).lastActivity).toBe('2026-08-01');
    expect(mergeCounts(counts({}, [], null), counts({}, [], null)).lastActivity).toBeNull();
  });

  it('sumCounts пустого списка = пустые счётчики', () => {
    expect(sumCounts([])).toEqual(emptyCounts());
  });
});

describe('toneOf', () => {
  it('границы зон: 80 — зелёная, 50 — жёлтая, ниже — красная', () => {
    expect(toneOf(100)).toBe('good');
    expect(toneOf(80)).toBe('good');
    expect(toneOf(79)).toBe('warn');
    expect(toneOf(50)).toBe('warn');
    expect(toneOf(49)).toBe('bad');
    expect(toneOf(0)).toBe('bad');
  });
});

describe('недопуск: порог, недобор, причина', () => {
  const m = (att: Parameters<typeof counts>[0], grades: [number, number][] = []) =>
    computeMetrics(counts(att, grades));

  it('порог — 70, строго ниже; ровно 70 — допущен', () => {
    expect(NO_ADMISSION_THRESHOLD).toBe(70);
    expect(isNotAdmitted(m({}, [[69, 100]]))).toBe(true);   // балл 69
    expect(isNotAdmitted(m({}, [[70, 100]]))).toBe(false);  // балл 70 — на пороге, допущен
    expect(isNotAdmitted(m({}, [[100, 100]]))).toBe(false);
  });

  it('без данных недопуска нет — это пустой журнал, а не двойка', () => {
    expect(isNotAdmitted(computeMetrics(emptyCounts()))).toBe(false);
    expect(admissionReason(computeMetrics(emptyCounts()))).toBe('none');
  });

  it('admissionGap — сколько не хватает до порога; 0 у допущенных и без данных', () => {
    expect(admissionGap(m({}, [[60, 100]]))).toBe(10); // 60 → не хватает 10
    expect(admissionGap(m({}, [[80, 100]]))).toBe(0);
    expect(admissionGap(computeMetrics(emptyCounts()))).toBe(0);
  });

  it('причина: винит только ту половину, что реально ниже порога', () => {
    // низкая посещаемость, оценки в норме: 40*0.4 + 75*0.6 = 61 < 70
    expect(admissionReason(m({ present: 2, absent: 3 }, [[75, 100]]))).toBe('attendance');
    // низкие оценки, посещаемость в норме: 100*0.4 + 40*0.6 = 64 < 70
    expect(admissionReason(m({ present: 5 }, [[40, 100]]))).toBe('grades');
    // просели обе: 50*0.4 + 50*0.6 = 50
    expect(admissionReason(m({ present: 5, absent: 5 }, [[50, 100]]))).toBe('both');
    // допущен — причины нет
    expect(admissionReason(m({ present: 9, absent: 1 }, [[90, 100]]))).toBe('none');
  });
});

describe('buildRatingRows', () => {
  const S = (uid: string, name: string, branchIds: string[] = []): RatingStudent => ({ uid, name, avatarUrl: '', branchIds });
  const st = (studentId: string, courseId: string, c: RatingCounts): RatingStat => ({ studentId, courseId, ...c });
  const rowsById = (rows: ReturnType<typeof buildRatingRows>) => Object.fromEntries(rows.map(r => [r.student.uid, r]));

  it('ранжирует по баллу; равный балл делит одно место, следующий — со сдвигом', () => {
    const students = [S('a', 'A'), S('b', 'B'), S('c', 'C')];
    const stats = [
      st('a', 'c1', counts({ present: 10 })),          // 100
      st('b', 'c1', counts({ present: 10 })),          // 100 — ничья
      st('c', 'c1', counts({ present: 5, absent: 5 })), // 50
    ];
    const by = rowsById(buildRatingRows({ students, stats, groups: [], branchName: new Map(), sliceCourseId: null, activeGroup: null }));
    expect(by.a.rank).toBe(1);
    expect(by.b.rank).toBe(1);
    expect(by.c.rank).toBe(3); // ничья съедает 2-е место
  });

  it('срез по курсу оставляет только его студентов и его счётчики', () => {
    const students = [S('a', 'A'), S('b', 'B')];
    const stats = [st('a', 'c1', counts({ present: 5 })), st('b', 'c2', counts({ present: 5 }))];
    const groups = [{ id: 'g1', name: 'G1', courseId: 'c1', studentIds: ['a'] }] as any;
    const rows = buildRatingRows({ students, stats, groups, branchName: new Map(), sliceCourseId: 'c1', activeGroup: null });
    expect(rows.map(r => r.student.uid)).toEqual(['a']); // b целиком в c2 — не в срезе
  });

  it('студент из группы курса попадает в срез даже без единой отметки', () => {
    const students = [S('a', 'A')];
    const groups = [{ id: 'g1', name: 'G1', courseId: 'c1', studentIds: ['a'] }] as any;
    const rows = buildRatingRows({ students, stats: [], groups, branchName: new Map(), sliceCourseId: 'c1', activeGroup: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].metrics.hasData).toBe(false);
    expect(rows[0].rank).toBeNull();       // без данных места нет
    expect(rows[0].groupNames).toEqual(['G1']);
  });

  it('branchNames разворачиваются через переданную карту филиалов', () => {
    const students = [S('a', 'A', ['br1'])];
    const stats = [st('a', 'c1', counts({ present: 1 }))];
    const rows = buildRatingRows({ students, stats, groups: [], branchName: new Map([['br1', 'Центр']]), sliceCourseId: null, activeGroup: null });
    expect(rows[0].branchNames).toEqual(['Центр']);
  });
});
