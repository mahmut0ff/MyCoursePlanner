import { describe, it, expect } from 'vitest';
import { getPeriodRange } from '../utils/finance-period';
import { computePayroll, type CompensationRule, type LessonSessionLike } from '../utils/payroll-engine';

/**
 * Окно зарплатной ведомости обязано покрывать РОВНО календарный месяц
 * организации.
 *
 * Сборка окна (getPeriodRange) и его разбор в дни (payroll-engine) — две
 * половины одного правила, и они должны быть точной инверсией друг друга. Пока
 * они расходились на смещение UTC+6, июльская ведомость покрывала 30.06–31.07:
 * урок последнего дня июня оплачивался и в июньской ведомости, и в июльской.
 */
describe('окно ведомости = ровно месяц организации', () => {
  const rule = (): CompensationRule => ({
    id: 'r1',
    organizationId: 'org1',
    teacherId: 't1',
    status: 'active',
    label: 'За занятие',
    components: [{ kind: 'per_lesson', amountMinor: 100000 }],
    effectiveFrom: '2026-01',
    effectiveTo: null,
  } as any);

  const session = (date: string): LessonSessionLike => ({
    id: `s-${date}`,
    organizationId: 'org1',
    groupId: 'g1',
    courseId: 'c1',
    teacherId: 't1',
    date,
    durationMinutes: 90,
    status: 'held',
    headcount: 8,
    branchId: null,
  } as any);

  /** Ведомость за прошлый месяц, как её открывает payroll-accrual. */
  const runFor = (nowIso: string, sessions: LessonSessionLike[]) => {
    const { startIso, endIso } = getPeriodRange('last_month', new Date(nowIso));
    return computePayroll({
      windowStart: startIso,
      windowEnd: endIso,
      rules: [rule()],
      incomeTx: [],
      refundTx: [],
      sessions,
      knownTeacherIds: ['t1'],
      period: '2026-07',
    } as any);
  };

  it('урок ПОСЛЕДНЕГО дня предыдущего месяца в ведомость не входит', () => {
    // Крон открывает июльскую ведомость 1 августа в 07:00 UTC.
    const result = runFor('2026-08-01T07:00:00.000Z', [session('2026-06-30')]);
    const total = result.lines.reduce((s, l) => s + l.computedMinor, 0);
    expect(total).toBe(0);
  });

  it('первый и последний дни СВОЕГО месяца входят', () => {
    const result = runFor('2026-08-01T07:00:00.000Z', [session('2026-07-01'), session('2026-07-31')]);
    const total = result.lines.reduce((s, l) => s + l.computedMinor, 0);
    expect(total).toBe(200000);
  });

  it('урок первого дня СЛЕДУЮЩЕГО месяца не входит', () => {
    const result = runFor('2026-08-01T07:00:00.000Z', [session('2026-08-01')]);
    const total = result.lines.reduce((s, l) => s + l.computedMinor, 0);
    expect(total).toBe(0);
  });

  it('соседние ведомости не пересекаются ни одним днём', () => {
    const july = getPeriodRange('last_month', new Date('2026-08-01T07:00:00.000Z'));
    const june = getPeriodRange('last_month', new Date('2026-07-01T07:00:00.000Z'));
    expect(new Date(june.endIso).getTime()).toBeLessThan(new Date(july.startIso).getTime());
  });
});
