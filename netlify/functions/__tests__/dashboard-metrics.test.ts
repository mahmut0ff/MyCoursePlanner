/**
 * Числа админского дашборда — регрессии аудита 2026-08-26.
 *
 * Каждый тест здесь закрывает конкретное расхождение, из-за которого главная
 * показывала одно, а экран, куда она ведёт, — другое. Формулы проверяются на
 * ЧИСТЫХ модулях (attendance / risk / payment-plans / finance-period), потому
 * что именно они и есть общий источник правды: если завтра кто-то заведёт
 * рядом вторую копию правила, разойдётся не тест, а прод.
 */
import { describe, it, expect } from 'vitest';

import { attendanceRate, countAttendance, wasPresent, wasAbsent, attendanceMark } from '../../../src/lib/attendance';
import { computeStudentRisk } from '../utils/risk';
import { isDebtBearingPlan, isPlanOverdue, orgDayKey } from '../../../src/lib/payment-plans';
import { getPeriodRange, getPreviousRange } from '../utils/finance-period';

const entry = (attendance: string | undefined, date = '2026-08-10') => ({ attendance, date });

describe('посещаемость — одно определение на весь продукт', () => {
  it('считает опоздание присутствием, а «уважительную» — пропуском', () => {
    // Ровно тот случай, на котором расходились главная и журнал: дашборд
    // считал (все − absent) и выдавал 100 %, журнал — (present + late) и 50 %.
    const journal = [entry('present'), entry('late'), entry('excused'), entry('absent')];
    expect(attendanceRate(journal)).toBe(50);
    expect(countAttendance(journal)).toMatchObject({
      total: 4, present: 1, late: 1, excused: 1, absent: 1, attended: 2,
    });
  });

  it('запись без отметки читается как present — так её пишет и читает журнал', () => {
    expect(attendanceMark(entry(undefined))).toBe('present');
    expect(wasPresent(entry(undefined))).toBe(true);
    expect(attendanceRate([entry(undefined), entry('absent')])).toBe(50);
  });

  it('«прогул» — только неуважительный пропуск', () => {
    expect(wasAbsent(entry('absent'))).toBe(true);
    expect(wasAbsent(entry('excused'))).toBe(false);
  });

  it('нет записей — нет ответа (null), а не 0 и не 100', () => {
    expect(attendanceRate([])).toBeNull();
  });
});

describe('риск использует ту же формулу посещаемости', () => {
  const NOW = new Date('2026-08-20T12:00:00.000Z').getTime();
  const day = (n: number) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);

  it('систематические «уважительные» больше не выглядят стопроцентной посещаемостью', () => {
    // 10 занятий: был на двух, остальные пропустил по уважительной. Старая
    // формула давала attendanceRate = 100 % и riskLevel 'low' — ученик,
    // переставший ходить, не попадал ни в одну плитку.
    const journal = [
      { attendance: 'present', date: day(30) },
      { attendance: 'present', date: day(28) },
      ...Array.from({ length: 8 }, (_, i) => ({ attendance: 'excused', date: day(20 - i) })),
    ];
    const r = computeStudentRisk({ attempts: [], journal, nowMs: NOW });
    expect(r.attendanceRate).toBe(20);
    expect(r.riskLevel).toBe('high');
    // Но «прогулов» у него по-прежнему нет: причина уважительная.
    expect(r.missedLessons).toBe(0);
  });

  it('последняя активность — день, когда ученик БЫЛ, а не «уважительный» день', () => {
    const journal = [
      { attendance: 'present', date: day(10) },
      { attendance: 'excused', date: day(1) },
    ];
    const r = computeStudentRisk({ attempts: [], journal, nowMs: NOW });
    expect(r.daysSinceLastActive).toBe(10);
  });

  it('пустой журнал не считается прогулами', () => {
    const r = computeStudentRisk({ attempts: [], journal: [], enrolledAt: day(2), nowMs: NOW });
    expect(r.attendanceRate).toBe(100);
    expect(r.riskLevel).toBe('low');
  });
});

describe('окно месяца — календарь организации, а не UTC', () => {
  it('в ночь на 1-е число «этот месяц» ещё предыдущий по UTC, но уже новый по дню организации', () => {
    // 31 июля 19:00 UTC = 1 августа 01:00 в Бишкеке (UTC+6).
    const nightOfFirst = new Date('2026-07-31T19:00:00.000Z');
    const { startIso } = getPeriodRange('current_month', nightOfFirst);
    // Начало августа по календарю организации — 31 июля 18:00 UTC.
    expect(startIso).toBe('2026-07-31T18:00:00.000Z');
    // Своя UTC-арифметика (setUTCDate(1)) дала бы здесь 1 ИЮЛЯ — целый месяц мимо.
    expect(startIso.slice(0, 7)).not.toBe('2026-06');
  });

  it('«прошлый месяц» усечён до того же прошедшего отрезка (MTD против MTD)', () => {
    const now = new Date('2026-08-10T09:00:00.000Z');
    const { startIso, endIso } = getPeriodRange('current_month', now);
    const { prevStartIso, prevEndIso } = getPreviousRange('current_month', startIso, endIso, false, now);
    expect(prevStartIso.slice(0, 10)).toBe('2026-06-30'); // 1 июля по дню организации
    // Правая граница — та же дата прошлого месяца, а не его конец.
    expect(new Date(prevEndIso).getTime()).toBeLessThan(new Date(startIso).getTime());
    expect(prevEndIso.slice(0, 10)).toBe('2026-07-10');
  });
});

describe('сравнение даты с границей окна', () => {
  // Копия правила из api-dashboard: обе стороны сравнения приводятся к
  // календарному дню ОРГАНИЗАЦИИ. Проверяем оба промаха, которые оно закрывает.
  const dayKeyOf = (value: unknown): string => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : orgDayKey(parsed);
  };
  const inDayRange = (v: unknown, s: string, e: string) => {
    const d = dayKeyOf(v);
    return !!d && d >= dayKeyOf(s) && d <= dayKeyOf(e);
  };

  const monthStart = '2026-07-31T18:00:00.000Z'; // 00:00 1 августа в Бишкеке
  const monthEnd = '2026-08-26T17:59:59.999Z';   // 23:59 26 августа в Бишкеке

  it('первое число месяца больше не теряется', () => {
    // Как было: голая дата лексикографически меньше UTC-границы того же дня.
    expect('2026-08-01' >= '2026-08-01T00:00:00.000Z').toBe(false);
    // Как стало:
    expect(inDayRange('2026-08-01', monthStart, monthEnd)).toBe(true);
    expect(inDayRange('2026-08-26', monthStart, monthEnd)).toBe(true);
  });

  it('граница окна не съезжает на день назад из-за среза строки', () => {
    // Наивный slice(0,10) назвал бы monthStart «31 июля» и втащил в август
    // лишний день. Июльская запись в августовское окно попадать не должна.
    expect(monthStart.slice(0, 10)).toBe('2026-07-31'); // почему нельзя срезать
    expect(inDayRange('2026-07-31', monthStart, monthEnd)).toBe(false);
  });

  it('момент, который в Бишкеке уже 1 августа, считается августовским', () => {
    // joinedAt хранится полным ISO: 31 июля 19:00 UTC = 1 августа 01:00 org.
    expect(inDayRange('2026-07-31T19:00:00.000Z', monthStart, monthEnd)).toBe(true);
    expect(inDayRange('2026-07-31T17:00:00.000Z', monthStart, monthEnd)).toBe(false);
  });
});

describe('просрочка ≠ «всё неоплаченное»', () => {
  const plan = (over: Record<string, any> = {}) => ({
    status: 'pending', totalAmount: 1000, paidAmount: 0, deadline: '2026-08-20', ...over,
  });
  const now = new Date('2026-08-26T09:00:00.000Z');

  it('счёт со сроком в будущем неоплачен, но не просрочен', () => {
    const future = plan({ deadline: '2026-09-10' });
    expect(isDebtBearingPlan(future)).toBe(true);
    expect(isPlanOverdue(future, now)).toBe(false);
  });

  it('множество просроченных строго внутри множества неоплаченных', () => {
    const plans = [
      plan({ deadline: '2026-09-10' }),          // неоплачен, срок впереди
      plan({ deadline: '2026-08-20' }),          // просрочен
      plan({ paidAmount: 1000, status: 'paid' }), // закрыт
      plan({ status: 'cancelled' }),              // списан
    ];
    const unpaid = plans.filter(isDebtBearingPlan);
    const overdue = unpaid.filter(p => isPlanOverdue(p, now));
    expect(unpaid).toHaveLength(2);
    expect(overdue).toHaveLength(1);
    // Плитка «Просроченные платежи» показывает второе число и обязана вести
    // в список, отфильтрованный тем же предикатом, — иначе «7» открывает «40».
    expect(overdue.every(p => unpaid.includes(p))).toBe(true);
  });
});
