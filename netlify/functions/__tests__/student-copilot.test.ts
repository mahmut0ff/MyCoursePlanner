import { describe, it, expect, vi } from 'vitest';

// student-copilot pulls in firebase-admin / ai / auth / lessons / copilot-actions /
// director-copilot at module load. Stub them all so the pure snapshot renderer can
// be imported and tested without Firestore or Gemini.
vi.mock('../utils/firebase-admin', () => ({ adminDb: { collection: vi.fn(), getAll: vi.fn() } }));
vi.mock('../utils/ai', () => ({
  generateWithFallback: vi.fn(),
  hasGeminiKey: vi.fn().mockReturnValue(true),
  recordAiUsage: vi.fn(),
}));
vi.mock('../utils/auth', () => ({ resolveOrgRole: vi.fn() }));
vi.mock('../utils/lessons', () => ({ buildLessonContext: vi.fn() }));
vi.mock('../utils/copilot-actions', () => ({ matchRosterByName: vi.fn() }));
vi.mock('../utils/director-copilot', () => ({ toTelegramHtml: vi.fn((s: string) => s) }));

import { renderStudentSnapshotText, type StudentSnapshot } from '../utils/student-copilot';

const base: StudentSnapshot = {
  name: '',
  gradeAvgPct: null,
  recentGrades: [],
  present30: 0,
  absent30: 0,
  late30: 0,
  debt: 0,
  weakTopics: [],
  lastExam: null,
};

describe('renderStudentSnapshotText — compact, factual, no invented data', () => {
  it('renders a full snapshot with all sections', () => {
    const out = renderStudentSnapshotText({
      ...base,
      name: 'Аброр Каримов',
      gradeAvgPct: 82,
      recentGrades: [{ value: '5', date: '2026-06-28' }, { value: '4', date: '2026-06-25' }],
      present30: 10, absent30: 2, late30: 1,
      debt: 1500,
      weakTopics: ['Present Perfect', 'Conditionals'],
      lastExam: { title: 'Unit 5', percentage: 76 },
    });
    expect(out).toContain('Ученик: Аброр Каримов');
    expect(out).toContain('Средний балл: 82%');
    expect(out).toContain('5 (2026-06-28)');
    expect(out).toContain('присутствовал 10, пропусков 2, опозданий 1');
    expect(out).toContain('«Unit 5» — 76%');
    expect(out).toContain('Present Perfect, Conditionals');
    expect(out).toContain('Задолженность по оплате: 1 500 с.'); // ru-RU groups with NBSP
  });

  it('uses honest "нет" wording when there is no data', () => {
    const out = renderStudentSnapshotText(base);
    expect(out).toContain('Средний балл: нет оценок');
    expect(out).toContain('Посещаемость за 30 дней: нет отметок');
    expect(out).toContain('Задолженность по оплате: нет');
    // No name line, no recent-grades line, no exam/weak-topic lines.
    expect(out).not.toContain('Ученик:');
    expect(out).not.toContain('Последние оценки');
    expect(out).not.toContain('Последний тест');
    expect(out).not.toContain('Слабые темы');
  });

  it('shows attendance counts even when grades are absent', () => {
    const out = renderStudentSnapshotText({ ...base, present30: 4, absent30: 0, late30: 0 });
    expect(out).toContain('присутствовал 4, пропусков 0, опозданий 0');
    expect(out).toContain('Средний балл: нет оценок');
  });

  it('omits the debt amount formatting when there is no debt', () => {
    expect(renderStudentSnapshotText({ ...base, debt: 0 })).toContain('Задолженность по оплате: нет');
    expect(renderStudentSnapshotText({ ...base, debt: 2000 })).toContain('Задолженность по оплате: 2 000 с.');
  });
});
