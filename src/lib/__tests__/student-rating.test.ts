import { describe, it, expect } from 'vitest';
import {
  emptyCounts, mergeCounts, sumCounts, computeMetrics, toneOf,
  ATTENDANCE_WEIGHT, GRADE_WEIGHT,
  type RatingCounts,
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
