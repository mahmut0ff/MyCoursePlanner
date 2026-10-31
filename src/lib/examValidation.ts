import type { Question, QuizQuestion } from '../types';

/**
 * Что не так с вопросом экзамена, или null. Без этой проверки сохранялся (и
 * запускался в комнате) вопрос без текста, без вариантов и без правильного
 * ответа — ученику нечего решать, а автопроверке не с чем сравнивать.
 * Открытые типы (короткий/устный ответ, сопоставление) проверяются только на текст.
 */
export type ExamQuestionIssue = 'text' | 'options' | 'correct';

export function examQuestionIssue(q: Question): ExamQuestionIssue | null {
  if (!q.text?.trim() && !q.ttsText?.trim() && !q.mediaUrl) return 'text';
  if (q.type === 'multiple_choice' || q.type === 'multi_select') {
    const opts = (q.options || []).map(o => o.trim()).filter(Boolean);
    if (opts.length < 2) return 'options';
    const correct = q.type === 'multi_select'
      ? (q.correctAnswers || []).some(a => opts.includes(a.trim()))
      : opts.includes((q.correctAnswer || '').trim());
    if (!correct) return 'correct';
  }
  if (q.type === 'true_false' && q.correctAnswer !== 'True' && q.correctAnswer !== 'False') return 'correct';
  return null;
}

/** Первая проблема в списке вопросов: номер (с 1) и её вид. */
export function firstExamIssue(questions: Question[]): { n: number; issue: ExamQuestionIssue } | null {
  return firstIssue(questions, examQuestionIssue);
}

/** Типы викторины, где ученик выбирает вариант и есть правильный ответ. */
const QUIZ_CHOICE_TYPES = new Set(['single_choice', 'multiple_choice', 'multi_select', 'true_false', 'media_question']);

/**
 * То же для вопроса викторины. Зеркало серверной проверки в
 * api-quiz-sessions (action=create) — запускать игру с пустым вопросом нельзя.
 */
export function quizQuestionIssue(q: QuizQuestion): ExamQuestionIssue | null {
  if (!q.text?.trim() && !q.mediaUrl && !q.passageText?.trim()) return 'text';
  const opts = (q.options || []).filter(o => o.text?.trim() || o.imageUrl);
  if (QUIZ_CHOICE_TYPES.has(q.type) || q.type === 'poll') {
    if (opts.length < 2) return 'options';
  }
  if (QUIZ_CHOICE_TYPES.has(q.type) && !(q.correctAnswers || []).some(a => opts.some(o => o.id === a))) return 'correct';
  return null;
}

export function firstQuizIssue(questions: QuizQuestion[]): { n: number; issue: ExamQuestionIssue } | null {
  return firstIssue(questions, quizQuestionIssue);
}

function firstIssue<Q>(questions: Q[], check: (q: Q) => ExamQuestionIssue | null) {
  if (questions.length === 0) return { n: 1, issue: 'text' as const };
  for (let i = 0; i < questions.length; i++) {
    const issue = check(questions[i]);
    if (issue) return { n: i + 1, issue };
  }
  return null;
}
