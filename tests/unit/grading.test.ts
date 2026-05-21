import { describe, it, expect } from 'vitest';
import { gradeAttempt, shuffleArray, formatTime } from '../../src/utils/grading';
import type { Question } from '../../src/types';

// ── Helpers ──────────────────────────────────────────────────────

/** Create a minimal Question with sensible defaults */
function makeQuestion(overrides: Partial<Question> & { id: string; type: Question['type'] }): Question {
  return {
    text: 'Test question',
    options: [],
    correctAnswer: '',
    correctAnswers: [],
    keywords: [],
    points: 10,
    order: 1,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════
// 1. multiple_choice grading
// ═════════════════════════════════════════════════════════════════

describe('gradeAttempt — multiple_choice', () => {
  const q = makeQuestion({
    id: 'mc1',
    type: 'multiple_choice',
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 'B',
    points: 10,
  });

  it('awards full points for the correct answer', () => {
    const { questionResults, score, percentage } = gradeAttempt([q], { mc1: 'B' });
    expect(questionResults[0].isCorrect).toBe(true);
    expect(questionResults[0].pointsEarned).toBe(10);
    expect(questionResults[0].status).toBe('correct');
    expect(score).toBe(10);
    expect(percentage).toBe(100);
  });

  it('gives 0 points for wrong answer', () => {
    const { questionResults, score, percentage } = gradeAttempt([q], { mc1: 'A' });
    expect(questionResults[0].isCorrect).toBe(false);
    expect(questionResults[0].pointsEarned).toBe(0);
    expect(questionResults[0].status).toBe('incorrect');
    expect(score).toBe(0);
    expect(percentage).toBe(0);
  });

  it('gives 0 points for empty/missing answer', () => {
    const { score } = gradeAttempt([q], {});
    expect(score).toBe(0);
  });

  it('is strict — no partial credit', () => {
    const { questionResults } = gradeAttempt([q], { mc1: 'b' }); // lowercase
    // String comparison: 'b' !== 'B'
    expect(questionResults[0].isCorrect).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. multi_select grading
// ═════════════════════════════════════════════════════════════════

describe('gradeAttempt — multi_select', () => {
  const q = makeQuestion({
    id: 'ms1',
    type: 'multi_select',
    options: ['A', 'B', 'C', 'D'],
    correctAnswers: ['A', 'C'],
    points: 20,
  });

  it('awards full points when all correct options selected', () => {
    const { questionResults, score } = gradeAttempt([q], { ms1: ['A', 'C'] });
    expect(questionResults[0].isCorrect).toBe(true);
    expect(score).toBe(20);
  });

  it('awards full points regardless of order', () => {
    const { questionResults } = gradeAttempt([q], { ms1: ['C', 'A'] });
    expect(questionResults[0].isCorrect).toBe(true);
  });

  it('gives 0 for partial selection (missing one)', () => {
    const { questionResults, score } = gradeAttempt([q], { ms1: ['A'] });
    expect(questionResults[0].isCorrect).toBe(false);
    expect(score).toBe(0);
  });

  it('gives 0 for over-selection (extra option)', () => {
    const { questionResults } = gradeAttempt([q], { ms1: ['A', 'B', 'C'] });
    expect(questionResults[0].isCorrect).toBe(false);
  });

  it('gives 0 for empty answer', () => {
    const { score } = gradeAttempt([q], {});
    expect(score).toBe(0);
  });

  it('handles non-array answer gracefully', () => {
    const { questionResults } = gradeAttempt([q], { ms1: 'A' as any });
    // String 'A' should be treated as empty set (not array)
    expect(questionResults[0].isCorrect).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. short_answer grading (keyword matching)
// ═════════════════════════════════════════════════════════════════

describe('gradeAttempt — short_answer', () => {
  const q = makeQuestion({
    id: 'sa1',
    type: 'short_answer',
    keywords: ['photosynthesis', 'sunlight', 'chlorophyll', 'carbon dioxide'],
    points: 15,
  });

  it('awards full points when ≥50% keywords matched', () => {
    // 2 of 4 keywords = 50% = ceil(4 * 0.5) = 2 → pass
    const { questionResults, score } = gradeAttempt([q], {
      sa1: 'Photosynthesis requires sunlight to work',
    });
    expect(questionResults[0].isCorrect).toBe(true);
    expect(score).toBe(15);
    expect(questionResults[0].status).toBe('correct');
  });

  it('awards full points when all keywords matched', () => {
    const { score } = gradeAttempt([q], {
      sa1: 'Photosynthesis uses sunlight and chlorophyll to convert carbon dioxide',
    });
    expect(score).toBe(15);
  });

  it('marks as pending_review when <50% keywords but answer exists', () => {
    // 1 of 4 = 25% < 50%
    const { questionResults, score } = gradeAttempt([q], {
      sa1: 'Something about sunlight',
    });
    expect(questionResults[0].isCorrect).toBe(false);
    expect(questionResults[0].status).toBe('pending_review');
    expect(score).toBe(0);
  });

  it('is case-insensitive for keyword matching', () => {
    const { questionResults } = gradeAttempt([q], {
      sa1: 'PHOTOSYNTHESIS and SUNLIGHT are key',
    });
    expect(questionResults[0].isCorrect).toBe(true);
  });

  it('marks empty answer as incorrect (not pending)', () => {
    const { questionResults } = gradeAttempt([q], { sa1: '' });
    expect(questionResults[0].status).toBe('incorrect');
  });

  it('marks missing answer as incorrect', () => {
    const { questionResults } = gradeAttempt([q], {});
    expect(questionResults[0].status).toBe('incorrect');
  });

  it('marks as pending_review when no keywords defined but answer given', () => {
    const qNoKeywords = makeQuestion({
      id: 'sa2',
      type: 'short_answer',
      keywords: [],
      points: 10,
    });
    const { questionResults } = gradeAttempt([qNoKeywords], { sa2: 'Some answer' });
    expect(questionResults[0].status).toBe('pending_review');
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. Mixed exam (multiple question types)
// ═════════════════════════════════════════════════════════════════

describe('gradeAttempt — mixed exam', () => {
  const questions: Question[] = [
    makeQuestion({ id: 'q1', type: 'multiple_choice', correctAnswer: 'B', points: 10 }),
    makeQuestion({ id: 'q2', type: 'multi_select', correctAnswers: ['X', 'Y'], points: 20 }),
    makeQuestion({ id: 'q3', type: 'short_answer', keywords: ['react', 'components'], points: 10 }),
  ];

  it('calculates correct total when all correct', () => {
    const { score, totalPoints, percentage } = gradeAttempt(questions, {
      q1: 'B',
      q2: ['X', 'Y'],
      q3: 'React uses components to build UI',
    });
    expect(totalPoints).toBe(40);
    expect(score).toBe(40);
    expect(percentage).toBe(100);
  });

  it('calculates correct total when partially correct', () => {
    const { score, totalPoints, percentage } = gradeAttempt(questions, {
      q1: 'B',   // correct: 10
      q2: ['X'], // wrong (partial): 0
      q3: '',    // empty: 0
    });
    expect(totalPoints).toBe(40);
    expect(score).toBe(10);
    expect(percentage).toBe(25);
  });

  it('calculates 0% when all wrong', () => {
    const { score, percentage } = gradeAttempt(questions, {
      q1: 'A',
      q2: ['Z'],
      q3: 'irrelevant answer',
    });
    expect(score).toBe(0);
    expect(percentage).toBe(0);
  });

  it('handles empty questions array', () => {
    const { score, totalPoints, percentage } = gradeAttempt([], {});
    expect(score).toBe(0);
    expect(totalPoints).toBe(0);
    expect(percentage).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. Utility functions
// ═════════════════════════════════════════════════════════════════

describe('shuffleArray', () => {
  it('returns array of same length', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffleArray(arr)).toHaveLength(5);
  });

  it('contains all original elements', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffleArray(arr).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3];
    const original = [...arr];
    shuffleArray(arr);
    expect(arr).toEqual(original);
  });

  it('handles empty array', () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it('handles single element', () => {
    expect(shuffleArray([42])).toEqual([42]);
  });
});

describe('formatTime', () => {
  it('formats 0 seconds', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('formats seconds < 60', () => {
    expect(formatTime(45)).toBe('00:45');
  });

  it('formats exact minutes', () => {
    expect(formatTime(120)).toBe('02:00');
  });

  it('formats minutes + seconds', () => {
    expect(formatTime(125)).toBe('02:05');
  });

  it('formats large values', () => {
    expect(formatTime(3661)).toBe('61:01');
  });
});
