import { describe, it, expect, vi } from 'vitest';

// copilot-actions pulls in firebase-admin / ai / notifications / onboarding at module
// load (transitively via auth, director-copilot, telegram). Stub them so the pure
// decision helpers can be imported and tested in isolation.
vi.mock('../utils/firebase-admin', () => ({ adminAuth: {}, adminDb: { collection: vi.fn() } }));
vi.mock('../utils/ai', () => ({
  getModel: vi.fn(),
  hasGeminiKey: vi.fn().mockReturnValue(true),
  recordAiUsage: vi.fn(),
  AI_MODEL: 'gemini-2.5-flash',
}));
vi.mock('../utils/notifications', () => ({ createNotification: vi.fn(), notifyOrgAdmins: vi.fn() }));
vi.mock('../utils/onboarding', () => ({ createPendingInvite: vi.fn() }));

import {
  availableToolNames, gradeMetaForValue, normalizeGradeDate, normalizeAttendance,
  findGroupByName, can, tokenMatch, matchRosterByName,
  type StaffContext,
} from '../utils/copilot-actions';

const set = (...g: string[]) => new Set(g);

describe('availableToolNames — tools are gated by RBAC grants + a non-empty roster', () => {
  it('teacher (gradebook:write) with a roster gets the whole journal toolset', () => {
    expect(availableToolNames(set('gradebook:write'), true).sort())
      .toEqual(['add_note', 'set_attendance', 'set_grades'].sort());
  });

  it('teacher with NO roster gets nothing (the journal tools need students)', () => {
    expect(availableToolNames(set('gradebook:write'), false)).toEqual([]);
  });

  it('manager (leads/students/teachers/gradebook:write) with a roster gets every tool', () => {
    const tools = availableToolNames(set('gradebook:write', 'leads:write', 'students:write', 'teachers:write'), true);
    expect(tools.sort()).toEqual(
      ['add_lead', 'add_note', 'add_student', 'add_teacher', 'set_attendance', 'set_grades'].sort(),
    );
  });

  it('manager without a roster keeps the add tools but loses grading', () => {
    const tools = availableToolNames(set('leads:write', 'students:write', 'teachers:write'), false);
    expect(tools.sort()).toEqual(['add_lead', 'add_student', 'add_teacher'].sort());
  });

  it('a partial custom role only unlocks what it grants', () => {
    expect(availableToolNames(set('students:write'), true)).toEqual(['add_student']);
    expect(availableToolNames(set('leads:write'), true)).toEqual(['add_lead']);
  });

  it('no write grants → no tools', () => {
    expect(availableToolNames(set('students:read', 'gradebook:read'), true)).toEqual([]);
  });
});

describe('gradeMetaForValue — uses the course schema, else infers a sensible scale', () => {
  it('honours an explicit 100-point schema', () => {
    expect(gradeMetaForValue({ gradingType: 'points', scale: { min: 0, max: 100 } }, 87))
      .toEqual({ type: 'points', maxValue: 100 });
  });

  it('keeps a non-points grading type from the schema', () => {
    expect(gradeMetaForValue({ gradingType: 'percent', scale: { min: 0, max: 100 } }, 50))
      .toEqual({ type: 'percent', maxValue: 100 });
  });

  it('defaults to a 5-point scale for a typical daily grade when no schema exists', () => {
    expect(gradeMetaForValue(undefined, 4)).toEqual({ type: 'points', maxValue: 5 });
    expect(gradeMetaForValue(undefined, 5)).toEqual({ type: 'points', maxValue: 5 });
  });

  it('widens the inferred scale when the value clearly exceeds 5', () => {
    expect(gradeMetaForValue(undefined, 9)).toEqual({ type: 'points', maxValue: 12 });
    expect(gradeMetaForValue(undefined, 85)).toEqual({ type: 'points', maxValue: 100 });
  });
});

describe('normalizeGradeDate — "за сегодня" and bad input fall back to today', () => {
  const today = '2026-06-29';

  it('passes through a valid ISO date', () => {
    expect(normalizeGradeDate('2026-06-20', today)).toBe('2026-06-20');
    expect(normalizeGradeDate('  2026-06-20  ', today)).toBe('2026-06-20');
  });

  it('falls back to today for words, empty, or malformed dates', () => {
    expect(normalizeGradeDate('сегодня', today)).toBe(today);
    expect(normalizeGradeDate('2026-6-1', today)).toBe(today); // not zero-padded
    expect(normalizeGradeDate(undefined, today)).toBe(today);
    expect(normalizeGradeDate(42, today)).toBe(today);
  });
});

describe('normalizeAttendance — maps enum values and Russian stems, defaults to present', () => {
  it('passes through the canonical enum values', () => {
    expect(normalizeAttendance('present')).toBe('present');
    expect(normalizeAttendance('absent')).toBe('absent');
    expect(normalizeAttendance('late')).toBe('late');
    expect(normalizeAttendance('excused')).toBe('excused');
  });

  it('resolves Russian words by stem (declension-tolerant)', () => {
    expect(normalizeAttendance('отсутствовал')).toBe('absent');
    expect(normalizeAttendance('отсутствует')).toBe('absent');
    expect(normalizeAttendance('пропустил')).toBe('absent');
    expect(normalizeAttendance('не пришёл')).toBe('absent');
    expect(normalizeAttendance('опоздал')).toBe('late');
    expect(normalizeAttendance('опоздала')).toBe('late');
    expect(normalizeAttendance('уважительная')).toBe('excused');
  });

  it('defaults to present for "пришёл", blanks, and anything unknown', () => {
    expect(normalizeAttendance('пришёл')).toBe('present');
    expect(normalizeAttendance('присутствовал')).toBe('present');
    expect(normalizeAttendance('')).toBe('present');
    expect(normalizeAttendance(undefined)).toBe('present');
    expect(normalizeAttendance('что-то непонятное')).toBe('present');
  });
});

describe('findGroupByName — exact then fuzzy contains, like the web AI roster', () => {
  const groups = [{ id: 'g1', name: 'A2' }, { id: 'g2', name: 'Английский Beginner' }, { id: 'g3', name: 'IELTS' }];

  it('matches case-insensitively, exact first', () => {
    expect(findGroupByName(groups, 'a2')?.id).toBe('g1');
    expect(findGroupByName(groups, 'IELTS')?.id).toBe('g3');
  });

  it('falls back to a contains match', () => {
    expect(findGroupByName(groups, 'beginner')?.id).toBe('g2');
    expect(findGroupByName(groups, 'Английский Beginner группа')?.id).toBe('g2'); // group name ⊂ spoken
  });

  it('returns undefined for no match or empty name', () => {
    expect(findGroupByName(groups, 'French')).toBeUndefined();
    expect(findGroupByName(groups, '')).toBeUndefined();
  });
});

describe('tokenMatch — declension-tolerant token comparison', () => {
  it('matches identical tokens', () => {
    expect(tokenMatch('аброр', 'аброр')).toBe(true);
  });

  it('matches Russian case endings via common stem', () => {
    expect(tokenMatch('билолдин', 'билолдину')).toBe(true);       // nominative vs dative
    expect(tokenMatch('усманазарова', 'усманазаровой')).toBe(true);
    expect(tokenMatch('мухаммад', 'мухаммаду')).toBe(true);
  });

  it('rejects different names', () => {
    expect(tokenMatch('аброр', 'мухаммад')).toBe(false);
    expect(tokenMatch('али', 'алишер')).toBe(false); // too short to stem-match safely
  });
});

describe('matchRosterByName — resolves spoken names to roster students (the Билолдин bug)', () => {
  const roster = [
    { name: 'Усманазарова Рухшона', studentId: 's1' },
    { name: 'Билолдин Усманов', studentId: 's2' },
    { name: 'Аброр Каримов', studentId: 's3' },
  ];

  it('resolves a dative-case follow-up name to the right student', () => {
    // "Билолдину тоже" used to return a hallucinated id; now it resolves by name.
    expect(matchRosterByName(roster, 'Билолдину').map(r => r.studentId)).toEqual(['s2']);
    expect(matchRosterByName(roster, 'Усманазаровой').map(r => r.studentId)).toEqual(['s1']);
  });

  it('matches a single given name or surname token', () => {
    expect(matchRosterByName(roster, 'Аброр').map(r => r.studentId)).toEqual(['s3']);
    expect(matchRosterByName(roster, 'Рухшона').map(r => r.studentId)).toEqual(['s1']);
  });

  it('returns empty for a name not in the roster', () => {
    expect(matchRosterByName(roster, 'Хасанов')).toEqual([]);
    expect(matchRosterByName(roster, '')).toEqual([]);
  });

  it('returns all candidates when a name is ambiguous (caller asks to clarify)', () => {
    const dup = [
      { name: 'Билолдин Усманов', studentId: 'a' },
      { name: 'Билолдин Рахимов', studentId: 'b' },
    ];
    expect(matchRosterByName(dup, 'Билолдину').map(r => r.studentId).sort()).toEqual(['a', 'b']);
  });
});

describe('can — thin wrapper over the resolved grant set', () => {
  const staff = { rbac: set('gradebook:write', 'students:read') } as unknown as StaffContext;

  it('reflects presence/absence of a resource:action grant', () => {
    expect(can(staff, 'gradebook', 'write')).toBe(true);
    expect(can(staff, 'students', 'read')).toBe(true);
    expect(can(staff, 'students', 'write')).toBe(false);
    expect(can(staff, 'teachers', 'write')).toBe(false);
  });

  it('defaults the action to write', () => {
    expect(can(staff, 'gradebook')).toBe(true);
    expect(can(staff, 'students')).toBe(false);
  });
});
