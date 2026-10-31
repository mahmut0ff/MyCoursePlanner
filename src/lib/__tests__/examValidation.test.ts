import { describe, it, expect } from 'vitest';
import { examQuestionIssue, firstExamIssue, quizQuestionIssue } from '../examValidation';
import type { Question } from '../../types';

const q = (over: Partial<Question>): Question => ({
  id: 'q', type: 'multiple_choice', text: 'Сколько будет 2+2?', options: ['3', '4'],
  correctAnswer: '4', correctAnswers: [], keywords: [], points: 1, order: 0, ...over,
});

describe('examQuestionIssue', () => {
  it('пустой вопрос не проходит', () => {
    expect(examQuestionIssue(q({ text: '  ' }))).toBe('text');
  });
  it('меньше двух заполненных вариантов', () => {
    expect(examQuestionIssue(q({ options: ['4', ' '] }))).toBe('options');
  });
  it('не отмечен правильный ответ', () => {
    expect(examQuestionIssue(q({ correctAnswer: '' }))).toBe('correct');
    expect(examQuestionIssue(q({ type: 'multi_select', correctAnswers: [] }))).toBe('correct');
    expect(examQuestionIssue(q({ type: 'true_false', correctAnswer: '' }))).toBe('correct');
  });
  it('корректные вопросы проходят', () => {
    expect(examQuestionIssue(q({}))).toBeNull();
    expect(examQuestionIssue(q({ type: 'multi_select', correctAnswers: ['4'] }))).toBeNull();
    expect(examQuestionIssue(q({ type: 'short_answer', options: [], correctAnswer: '' }))).toBeNull();
  });
  it('викторина: пустой выбор и выбор без правильного ответа не проходят', () => {
    const base = { id: 'x', quizId: 'z', order: 0, timerSeconds: 30, points: 1000 };
    const opts = [{ id: 'a', text: '3' }, { id: 'b', text: '4' }];
    expect(quizQuestionIssue({ ...base, type: 'single_choice', text: '', options: opts, correctAnswers: ['b'] })).toBe('text');
    expect(quizQuestionIssue({ ...base, type: 'single_choice', text: '2+2', options: opts, correctAnswers: [] })).toBe('correct');
    expect(quizQuestionIssue({ ...base, type: 'single_choice', text: '2+2', options: [{ id: 'a', text: '' }, { id: 'b', text: '' }], correctAnswers: ['a'] })).toBe('options');
    expect(quizQuestionIssue({ ...base, type: 'single_choice', text: '2+2', options: opts, correctAnswers: ['b'] })).toBeNull();
    expect(quizQuestionIssue({ ...base, type: 'poll', text: 'Как дела?', options: opts, correctAnswers: [] })).toBeNull();
  });
  it('firstExamIssue находит номер вопроса', () => {
    expect(firstExamIssue([q({}), q({ correctAnswer: '' })])).toEqual({ n: 2, issue: 'correct' });
    expect(firstExamIssue([])).toEqual({ n: 1, issue: 'text' });
  });
});
