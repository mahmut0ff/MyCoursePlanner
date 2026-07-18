import { describe, it, expect, vi } from 'vitest';

// utils/risk itself is dependency-free — that's the point of extracting it — but
// the scoping helpers live in utils/auth, which initialises firebase-admin on import.
vi.mock('../utils/firebase-admin', () => ({
  adminAuth: {},
  adminDb: { collection: vi.fn() },
  getDocsByIds: vi.fn(),
}));

import { computeStudentRisk, needsAttention } from '../utils/risk';
import { memberInBranchScope, memberHoldsRole } from '../utils/auth';

// A fixed "now" so the day arithmetic is deterministic.
const NOW = new Date('2026-07-18T12:00:00.000Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();
/** Journal entries store a plain date, not a timestamp. */
const dayAgo = (n: number) => daysAgo(n).slice(0, 10);

const attempt = (percentage: number, days: number) => ({ percentage, submittedAt: daysAgo(days) });
const present = (days: number) => ({ attendance: 'present', date: dayAgo(days) });
const absent = (days: number) => ({ attendance: 'absent', date: dayAgo(days) });

const risk = (over: Partial<Parameters<typeof computeStudentRisk>[0]> = {}) =>
  computeStudentRisk({ attempts: [], journal: [], nowMs: NOW, ...over });

describe('computeStudentRisk — newcomers are not churn', () => {
  it('leaves a student added today out of the risk zone', () => {
    const r = risk({ enrolledAt: daysAgo(0) });
    expect(r.riskLevel).toBe('low');
    expect(r.hasActivity).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it('leaves a long-enrolled student who never started out of the risk zone', () => {
    // The reported bug: "новый · добавлен(а) 90 дн. назад" sitting in the red column.
    const r = risk({ enrolledAt: daysAgo(90) });
    expect(r.riskLevel).toBe('low');
    expect(r.daysSinceEnrolled).toBe(90);
  });

  it('does not treat being marked absent as having started', () => {
    const r = risk({ enrolledAt: daysAgo(30), journal: [absent(2), absent(9)] });
    expect(r.hasActivity).toBe(false);
    expect(r.riskLevel).toBe('low');
  });

  it('keeps an overdue newcomer out of the churn level but still flags the debt', () => {
    // The other half of the bug: 68 "critical" students who were really debtors.
    const r = risk({ enrolledAt: daysAgo(0), hasOverduePayment: true });
    expect(r.riskLevel).toBe('low');
    expect(r.hasOverduePayment).toBe(true);
    expect(r.reasons).toEqual([]); // debt is never an engagement reason
    expect(needsAttention(r)).toBe(true); // …but it still needs someone
  });
});

describe('computeStudentRisk — real churn signals', () => {
  it('flags an engaged student who has gone quiet, and says why', () => {
    const r = risk({ enrolledAt: daysAgo(60), journal: [present(12), present(20)] });
    expect(r.riskLevel).toBe('high');
    expect(r.daysSinceLastActive).toBe(12);
    expect(r.reasons).toContain('не был(а) 12 дн.');
  });

  it('measures inactivity from the last attendance, not the last absence', () => {
    // Absences after the last real attendance must not read as "still active".
    const r = risk({ enrolledAt: daysAgo(60), journal: [present(15), absent(1)] });
    expect(r.daysSinceLastActive).toBe(15);
    expect(r.riskLevel).toBe('high');
  });

  it('flags poor attendance', () => {
    const r = risk({ enrolledAt: daysAgo(30), journal: [present(1), absent(3), absent(5), absent(7)] });
    expect(r.attendanceRate).toBe(25);
    expect(r.riskLevel).toBe('high');
    expect(r.reasons).toContain('посещаемость 25%');
  });

  it('flags a failing average only once exams exist', () => {
    const withExams = risk({ enrolledAt: daysAgo(30), attempts: [attempt(40, 1), attempt(30, 2)] });
    expect(withExams.riskLevel).toBe('high');
    expect(withExams.reasons).toContain('средний балл 35%');

    // No exams → averageScore is 0, which must never be read as "failing".
    const noExams = risk({ enrolledAt: daysAgo(30), journal: [present(1)] });
    expect(noExams.averageScore).toBe(0);
    expect(noExams.riskLevel).toBe('low');
  });

  it('puts a middling student in the attention zone with a reason', () => {
    const r = risk({ enrolledAt: daysAgo(30), journal: [present(6)] });
    expect(r.riskLevel).toBe('medium');
    expect(r.reasons).toEqual(['не был(а) 6 дн.']);
  });

  it('spots a downward score trend', () => {
    const r = risk({
      enrolledAt: daysAgo(60),
      attempts: [attempt(90, 20), attempt(85, 15), attempt(60, 5), attempt(55, 3), attempt(50, 1)],
      journal: [present(1)],
    });
    expect(r.scoreTrend).toBe('down');
    expect(r.reasons).toContain('оценки падают');
  });

  it('leaves a healthy student completely unflagged', () => {
    const r = risk({ enrolledAt: daysAgo(60), attempts: [attempt(88, 2)], journal: [present(1), present(3)] });
    expect(r.riskLevel).toBe('low');
    expect(r.reasons).toEqual([]);
    expect(needsAttention(r)).toBe(false);
  });
});

describe('roster scoping — why the counts disagreed', () => {
  it('keeps a member out of a branch they are not assigned to', () => {
    expect(memberInBranchScope(['branch-a'], 'branch-b')).toBe(false);
    expect(memberInBranchScope(['branch-a'], 'branch-a')).toBe(true);
  });

  it('treats an unassigned member as org-wide for the multi-branch form', () => {
    expect(memberInBranchScope([], ['branch-a'])).toBe(true);
    expect(memberInBranchScope(['branch-b'], ['branch-a'])).toBe(false);
  });

  it('applies no filter when no branch is selected, and nothing when denied', () => {
    expect(memberInBranchScope(['branch-a'], null)).toBe(true);
    expect(memberInBranchScope(['branch-a'], '__DENIED__')).toBe(false);
  });

  it('counts a multi-role member as a student, like the roster list does', () => {
    expect(memberHoldsRole({ role: 'teacher', roles: ['teacher', 'student'] }, ['student'])).toBe(true);
    expect(memberHoldsRole({ role: 'student' }, ['student'])).toBe(true);
    expect(memberHoldsRole({ role: 'teacher' }, ['student'])).toBe(false);
  });
});
