import { describe, it, expect } from 'vitest';
import { getPeriodRange } from '../utils/finance-period';
import { computePayroll, type CompensationRule, type FinanceTxLike, type GroupLike } from '../utils/payroll-engine';

/**
 * Окно зарплатной ведомости обязано покрывать РОВНО календарный месяц
 * организации.
 *
 * Сборка окна (getPeriodRange) и его разбор в дни (payroll-engine) — две
 * половины одного правила, и они должны быть точной инверсией друг друга. Пока
 * они расходились на смещение UTC+6, июльская ведомость покрывала 30.06–31.07:
 * платёж последнего дня июня попадал в базу процента и в июньской ведомости, и в
 * июльской — то есть оплачивался дважды.
 */
describe('окно ведомости = ровно месяц организации', () => {
  const rule = (): CompensationRule => ({
    id: 'r1',
    organizationId: 'org1',
    teacherId: 't1',
    // 100% — чтобы сумма читалась как «сколько денег попало в окно».
    components: [{ kind: 'percent_revenue', percentBp: 10000, base: 'collected' }],
  });

  const groups: GroupLike[] = [
    { id: 'g1', name: 'Группа 1', courseId: 'c1', teacherIds: ['t1'], studentIds: ['s1'] },
  ];

  /** Платёж суточной точности — так их и заводят в кассу. */
  const payment = (date: string): FinanceTxLike => ({
    id: `tx-${date}`,
    amount: 1000,
    date,
    type: 'income',
    categoryId: 'course_fee',
    groupId: 'g1',
    courseId: 'c1',
    studentId: 's1',
  });

  /** Ведомость за прошлый месяц, как её открывает payroll-accrual. */
  const runFor = (nowIso: string, incomeTx: FinanceTxLike[]) => {
    const { startIso, endIso } = getPeriodRange('last_month', new Date(nowIso));
    return computePayroll({
      period: '2026-07',
      windowStart: startIso,
      windowEnd: endIso,
      rules: [rule()],
      incomeTx,
      refundTx: [],
      groups,
      knownTeacherIds: ['t1'],
    });
  };

  const total = (result: { lines: { computedMinor: number }[] }) =>
    result.lines.reduce((s, l) => s + l.computedMinor, 0);

  it('платёж ПОСЛЕДНЕГО дня предыдущего месяца в ведомость не входит', () => {
    // Крон открывает июльскую ведомость 1 августа в 07:00 UTC.
    expect(total(runFor('2026-08-01T07:00:00.000Z', [payment('2026-06-30')]))).toBe(0);
  });

  it('первый и последний дни СВОЕГО месяца входят', () => {
    expect(total(runFor('2026-08-01T07:00:00.000Z', [payment('2026-07-01'), payment('2026-07-31')])))
      .toBe(200_000);
  });

  it('платёж первого дня СЛЕДУЮЩЕГО месяца не входит', () => {
    expect(total(runFor('2026-08-01T07:00:00.000Z', [payment('2026-08-01')]))).toBe(0);
  });

  it('соседние ведомости не пересекаются ни одним днём', () => {
    const july = getPeriodRange('last_month', new Date('2026-08-01T07:00:00.000Z'));
    const june = getPeriodRange('last_month', new Date('2026-07-01T07:00:00.000Z'));
    expect(new Date(june.endIso).getTime()).toBeLessThan(new Date(july.startIso).getTime());
  });
});
