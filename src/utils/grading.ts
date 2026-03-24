import type { Question, QuestionResult } from '../types';

/**
 * Grade a student's answers against the exam questions.
 * Returns per-question results, total score, and percentage.
 */
export function gradeAttempt(
  questions: Question[],
  answers: Record<string, string | string[]>
): { questionResults: QuestionResult[]; score: number; totalPoints: number; percentage: number } {
  let score = 0;
  let totalPoints = 0;

  const questionResults: QuestionResult[] = questions.map((q) => {
    totalPoints += q.points;
    const studentAnswer = answers[q.id] || (q.type === 'multiple_choice' ? [] : '');

    let isCorrect = false;
    let pointsEarned = 0;
    let status: QuestionResult['status'] = 'incorrect';

    switch (q.type) {
      case 'multiple_choice': {
        isCorrect = String(studentAnswer) === q.correctAnswer;
        if (isCorrect) {
          pointsEarned = q.points;
          status = 'correct';
        }
        break;
      }
      case 'multi_select': {
        const studentSet = new Set(Array.isArray(studentAnswer) ? studentAnswer : []);
        const correctSet = new Set(q.correctAnswers);
        isCorrect =
          studentSet.size === correctSet.size &&
          [...studentSet].every((a) => correctSet.has(a));
        if (isCorrect) {
          pointsEarned = q.points;
          status = 'correct';
        }
        break;
      }
      case 'short_answer': {
        // Basic keyword matching — if keywords exist, check for matches
        const answer = String(studentAnswer).toLowerCase().trim();
        if (q.keywords && q.keywords.length > 0 && answer) {
          const matched = q.keywords.filter((kw) =>
            answer.includes(kw.toLowerCase())
          );
          if (matched.length >= Math.ceil(q.keywords.length * 0.5)) {
            isCorrect = true;
            pointsEarned = q.points;
            status = 'correct';
          } else {
            status = 'pending_review';
          }
        } else {
          status = answer ? 'pending_review' : 'incorrect';
        }
        break;
      }
    }

    score += pointsEarned;

    return {
      questionId: q.id,
      questionText: q.text,
      type: q.type,
      studentAnswer,
      correctAnswer: q.type === 'multiple_choice' ? q.correctAnswers : q.correctAnswer,
      isCorrect,
      pointsEarned,
      pointsPossible: q.points,
      status,
    };
  });

  const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

  return { questionResults, score, totalPoints, percentage };
}

/**
 * Shuffle array using Fisher-Yates
 */
export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Format seconds into mm:ss
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format date string for display
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
