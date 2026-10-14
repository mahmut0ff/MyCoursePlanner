import { describe, it, expect } from 'vitest';
import {
  rankCategory, blockingTies, validateScores, categoryForAge, findAgeOverlaps,
  formatProjectNumber, normalizeProjectNumber, participantAge, maxTotal, prizeMoneyTotal,
  juryForCategory, type ContestCriterion,
} from '../contests';

// Критерии Келечек-2026: по 20 баллов.
const criteria: ContestCriterion[] = [
  { id: 'rel', name: 'Актуальность проблемы', description: '', maxScore: 20 },
  { id: 'use', name: 'Польза для человека и общества', description: '', maxScore: 20 },
  { id: 'orig', name: 'Оригинальность идеи', description: '', maxScore: 20 },
  { id: 'tech', name: 'Техническая реализация', description: '', maxScore: 20 },
  { id: 'pres', name: 'Презентация и демонстрация', description: '', maxScore: 20 },
];
const tieBreak = ['tech', 'use', 'orig'];

const p = (id: string, seq: number) => ({ id, number: formatProjectNumber('A', seq), seq, projectTitle: id, authors: [{ name: id, age: 13 }] });
const s = (participantId: string, juryUid: string, v: Record<string, number>) => ({
  participantId, juryUid, scores: v, total: Object.values(v).reduce((a, b) => a + b, 0),
});
const all = (rel: number, use: number, orig: number, tech: number, pres: number) => ({ rel, use, orig, tech, pres });

describe('rankCategory', () => {
  it('итог = среднее сумм от оценивших; сумма отдельно', () => {
    const rows = rankCategory({
      participants: [p('x', 1), p('y', 2)],
      scores: [s('x', 'j1', all(20, 20, 20, 20, 20)), s('x', 'j2', all(10, 10, 10, 10, 10)), s('y', 'j1', all(15, 15, 15, 15, 15))],
      assignedJuryUids: ['j1', 'j2'],
      criteria, tieBreakCriterionIds: tieBreak,
    });
    // x: (100 + 50) / 2 = 75, y: 75 от одного жюри — равны, и по всем критериям тоже.
    expect(rows.map((r) => [r.participantId, r.average, r.sum, r.juryCount])).toEqual([
      ['x', 75, 150, 2], ['y', 75, 75, 1],
    ]);
    expect(rows.every((r) => r.needsDecision && r.place === 1)).toBe(true);
    expect(rows[1].missingJuryUids).toEqual(['j2']);
  });

  it('ничья по среднему разрешается критериями в заданном порядке', () => {
    const rows = rankCategory({
      participants: [p('a', 1), p('b', 2)],
      // Оба по 80, но у b техническая реализация выше.
      scores: [s('a', 'j1', all(20, 20, 20, 10, 10)), s('b', 'j1', all(10, 20, 10, 20, 20))],
      assignedJuryUids: ['j1'], criteria, tieBreakCriterionIds: tieBreak,
    });
    expect(rows.map((r) => r.participantId)).toEqual(['b', 'a']);
    expect(rows.map((r) => r.place)).toEqual([1, 2]);
    expect(rows[0].tieBrokenBy).toBe('Техническая реализация');
    expect(rows[1].tieBrokenBy).toBe(null); // проигравшему пометка не ставится
    expect(rows.some((r) => r.needsDecision)).toBe(false);
  });

  it('второй критерий ничьей работает, если первый равен', () => {
    const rows = rankCategory({
      participants: [p('a', 1), p('b', 2)],
      scores: [s('a', 'j1', all(20, 10, 10, 20, 20)), s('b', 'j1', all(10, 20, 10, 20, 20))],
      assignedJuryUids: ['j1'], criteria, tieBreakCriterionIds: tieBreak,
    });
    expect(rows.map((r) => r.participantId)).toEqual(['b', 'a']);
    expect(rows[0].tieBrokenBy).toBe('Польза для человека и общества');
  });

  it('полная ничья → «требуется решение жюри», общее место, следующее место пропускается', () => {
    const rows = rankCategory({
      participants: [p('top', 1), p('a', 2), p('b', 3), p('low', 4)],
      scores: [
        s('top', 'j1', all(20, 20, 20, 20, 20)),
        s('a', 'j1', all(15, 15, 15, 15, 15)),
        s('b', 'j1', all(15, 15, 15, 15, 15)),
        s('low', 'j1', all(1, 1, 1, 1, 1)),
      ],
      assignedJuryUids: ['j1'], criteria, tieBreakCriterionIds: tieBreak,
    });
    expect(rows.map((r) => [r.participantId, r.place, r.needsDecision])).toEqual([
      ['top', 1, false], ['a', 2, true], ['b', 2, true], ['low', 4, false],
    ]);
    expect(blockingTies(rows, 3).map((r) => r.participantId)).toEqual(['a', 'b']);
    expect(blockingTies(rows, 1)).toEqual([]);
  });

  it('ручное решение по ничьей расставляет места и снимает блокировку', () => {
    const rows = rankCategory({
      participants: [p('a', 1), p('b', 2)],
      scores: [s('a', 'j1', all(15, 15, 15, 15, 15)), s('b', 'j1', all(15, 15, 15, 15, 15))],
      assignedJuryUids: ['j1'], criteria, tieBreakCriterionIds: tieBreak,
      tieResolutions: [{ participantIds: ['b', 'a'] }],
    });
    expect(rows.map((r) => [r.participantId, r.place, r.resolvedManually])).toEqual([['b', 1, true], ['a', 2, true]]);
    expect(blockingTies(rows, 3)).toEqual([]);
  });

  it('решение для другого состава ничьей не применяется', () => {
    const rows = rankCategory({
      participants: [p('a', 1), p('b', 2), p('c', 3)],
      scores: [
        s('a', 'j1', all(15, 15, 15, 15, 15)), s('b', 'j1', all(15, 15, 15, 15, 15)), s('c', 'j1', all(15, 15, 15, 15, 15)),
      ],
      assignedJuryUids: ['j1'], criteria, tieBreakCriterionIds: tieBreak,
      tieResolutions: [{ participantIds: ['b', 'a'] }],
    });
    expect(rows.every((r) => r.needsDecision && r.place === 1)).toBe(true);
  });

  it('недостающие жюри и неоценённые проекты', () => {
    const rows = rankCategory({
      participants: [p('a', 1), p('none', 2)],
      scores: [s('a', 'j1', all(10, 10, 10, 10, 10))],
      assignedJuryUids: ['j1', 'j2', 'j3'], criteria, tieBreakCriterionIds: tieBreak,
    });
    expect(rows[0].missingJuryUids).toEqual(['j2', 'j3']);
    expect(rows[1]).toMatchObject({ participantId: 'none', average: null, place: null });
  });

  it('средние по критериям считаются по оценившим', () => {
    const rows = rankCategory({
      participants: [p('a', 1)],
      scores: [s('a', 'j1', all(10, 10, 10, 10, 10)), s('a', 'j2', all(20, 10, 10, 15, 10))],
      assignedJuryUids: ['j1', 'j2'], criteria, tieBreakCriterionIds: tieBreak,
    });
    expect(rows[0].criterionAverages.rel).toBe(15);
    expect(rows[0].criterionAverages.tech).toBe(12.5);
    expect(rows[0].sum).toBe(50 + 65);
    expect(rows[0].average).toBe(57.5);
  });
});

describe('validateScores', () => {
  it('принимает полный набор и считает сумму', () => {
    const r = validateScores(criteria, all(20, 0, 5.5, 10, 1));
    expect(r).toEqual({ ok: true, scores: all(20, 0, 5.5, 10, 1), total: 36.5 });
  });
  it('отклоняет балл выше максимума, пропуск, отрицательный и шаг не 0,5', () => {
    expect(validateScores(criteria, all(21, 0, 0, 0, 0)).ok).toBe(false);
    expect(validateScores(criteria, { rel: 1 }).ok).toBe(false);
    expect(validateScores(criteria, all(-1, 0, 0, 0, 0)).ok).toBe(false);
    expect(validateScores(criteria, all(1.3, 0, 0, 0, 0)).ok).toBe(false);
  });
});

describe('категории и номера', () => {
  const cats = [
    { id: 'A', code: 'A', ageFrom: 12, ageTo: 15 },
    { id: 'B', code: 'B', ageFrom: 16, ageTo: 20 },
    { id: 'C', code: 'C', ageFrom: 21, ageTo: 25 },
  ];
  it('категория по возрасту, команда — по старшему', () => {
    expect(categoryForAge(cats, 12)).toBe('A');
    expect(categoryForAge(cats, 16)).toBe('B');
    expect(categoryForAge(cats, 26)).toBe(null);
    expect(participantAge([{ name: 'x', age: 14 }, { name: 'y', age: 17 }])).toBe(17);
    expect(participantAge([{ name: 'x', age: null }])).toBe(null);
  });
  it('пересечения диапазонов, границы включительно', () => {
    expect(findAgeOverlaps(cats)).toEqual([]);
    expect(findAgeOverlaps([...cats, { id: 'D', code: 'D', ageFrom: 15, ageTo: 16 }])).toEqual([
      { a: 'A', b: 'D' }, { a: 'B', b: 'D' },
    ]);
  });
  it('номер проекта и нормализация ввода', () => {
    expect(formatProjectNumber('B', 3)).toBe('B-03');
    expect(formatProjectNumber('A', 120)).toBe('A-120');
    expect(normalizeProjectNumber('b3')).toBe('B-03');
    expect(normalizeProjectNumber(' B - 03 ')).toBe('B-03');
    expect(normalizeProjectNumber('в-03')).toBe('B-03'); // кириллическая «в» → B
    expect(normalizeProjectNumber('С12')).toBe('C-12');
    expect(normalizeProjectNumber('7')).toBe('7');
    expect(normalizeProjectNumber('---')).toBe(null);
  });
  it('максимум и призовые деньги', () => {
    expect(maxTotal(criteria)).toBe(100);
    expect(prizeMoneyTotal([{ prizes: [{ place: 1, title: '', amount: 10000 }, { place: 2, title: 'Кубок', amount: 0 }] }, { prizes: [] }])).toBe(10000);
  });
  it('жюри категории: null = все', () => {
    const jury = [{ uid: 'j1', categoryIds: null }, { uid: 'j2', categoryIds: ['A'] }, { uid: 'j3', categoryIds: [] }];
    expect(juryForCategory(jury, 'A').map((j) => j.uid)).toEqual(['j1', 'j2', 'j3']);
    expect(juryForCategory(jury, 'B').map((j) => j.uid)).toEqual(['j1', 'j3']);
  });
});
