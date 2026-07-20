import { describe, it, expect } from 'vitest';
import {
  computePayroll,
  resolveRules,
  toMinor,
  roundHalfUp,
  divRoundHalfUp,
  type CompensationRule,
  type FinanceTxLike,
  type LessonSessionLike,
  type PayrollInputs,
  type DiagnosticCode,
} from '../utils/payroll-engine';

/**
 * Тесты расчётного ядра зарплаты.
 *
 * Это страховочная сетка под чужой зарплатой, поэтому проверяется не только
 * «сумма сошлась», но и три вещи, на которых такие движки обычно и врут:
 *
 *  - округление происходит ОДИН раз на строке заработка, а не на каждой
 *    транзакции (иначе копейки утекают тихо и навсегда);
 *  - нехватка данных даёт видимый ноль С ДИАГНОСТИКОЙ, а не правдоподобную
 *    догадку (сессия без учителя, занятие без длительности, пустой scope);
 *  - границы окна включительны с ОБЕИХ сторон (платёж ровно на границе периода
 *    нельзя потерять).
 *
 * Мока базы здесь нет намеренно: ядро не ходит в Firestore.
 */

// ============================================================
// Хелперы
// ============================================================

const PERIOD = '2026-07';
/**
 * Окно строится от ЛОКАЛЬНОЙ полуночи — ровно так его собирает getPeriodRange
 * (finance-period.ts) перед toISOString(). Хардкодить сюда '...T00:00:00.000Z'
 * нельзя: в зоне академии (UTC+6) такая строка описывает не июль, а июль,
 * сдвинутый на шесть часов, и тест ловил бы часовой пояс машины, а не логику.
 */
const WINDOW_START = new Date(2026, 6, 1, 0, 0, 0, 0).toISOString();
const WINDOW_END = new Date(2026, 6, 31, 23, 59, 59, 999).toISOString();
/** Соседние мгновения ВНЕ окна — считаются от границ, а не от календаря UTC. */
const JUST_BEFORE = new Date(new Date(WINDOW_START).getTime() - 1).toISOString();
const JUST_AFTER = new Date(new Date(WINDOW_END).getTime() + 1).toISOString();

function rule(over: Partial<CompensationRule> = {}): CompensationRule {
  return {
    id: 'r1',
    organizationId: 'org1',
    teacherId: 't1',
    branchId: null,
    label: 'Ставка',
    status: 'active',
    components: [],
    effectiveFrom: '2026-01',
    effectiveTo: null,
    supersedesId: null,
    ...over,
  };
}

let txSeq = 0;
/** Доход в сомах (как хранит Firestore). */
function income(amount: number, over: Partial<FinanceTxLike> = {}): FinanceTxLike {
  return {
    id: `tx${++txSeq}`,
    amount,
    date: '2026-07-15T10:00:00.000Z',
    type: 'income',
    categoryId: 'course_fee',
    groupId: 'g1',
    courseId: 'c1',
    ...over,
  };
}

/** Возврат: в базе это расход с положительной суммой и categoryId 'refund'. */
function refund(amount: number, over: Partial<FinanceTxLike> = {}): FinanceTxLike {
  return {
    id: `rf${++txSeq}`,
    amount,
    date: '2026-07-20T10:00:00.000Z',
    type: 'expense',
    categoryId: 'refund',
    groupId: 'g1',
    courseId: 'c1',
    ...over,
  };
}

let sesSeq = 0;
function session(over: Partial<LessonSessionLike> = {}): LessonSessionLike {
  return {
    id: `s${++sesSeq}`,
    groupId: 'g1',
    courseId: 'c1',
    teacherId: 't1',
    date: '2026-07-10',
    durationMinutes: 60,
    status: 'held',
    headcount: 10,
    ...over,
  };
}

function run(over: Partial<PayrollInputs> = {}) {
  return computePayroll({
    period: PERIOD,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    rules: [],
    incomeTx: [],
    refundTx: [],
    sessions: [],
    ...over,
  });
}

function codes(list: { code: DiagnosticCode }[]): DiagnosticCode[] {
  return list.map((d) => d.code);
}

// ============================================================
// Денежные примитивы
// ============================================================

describe('денежные примитивы', () => {
  it('roundHalfUp округляет ничью ОТ нуля симметрично', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(3.5)).toBe(4); // не банковское округление (было бы 4 и 4)
    expect(roundHalfUp(2.4)).toBe(2);
    // Math.round(-2.5) === -2; для денег это несимметрично к премии/штрафу.
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(-2.4)).toBe(-2);
  });

  it('divRoundHalfUp делит точно, с одним округлением HALF_UP', () => {
    expect(divRoundHalfUp(100, 10)).toBe(10);
    expect(divRoundHalfUp(105, 10)).toBe(11); // ровно .5 → вверх
    expect(divRoundHalfUp(104, 10)).toBe(10);
    expect(divRoundHalfUp(-105, 10)).toBe(-11);
    expect(divRoundHalfUp(5, 0)).toBe(0); // деления на ноль быть не должно, но не падаем
  });

  it('toMinor сдувает представленческую пыль double', () => {
    expect(toMinor(1500)).toBe(150000);
    // 1.005 * 100 === 100.49999999999999 в IEEE-754: наивный Math.round дал бы 100.
    expect(toMinor(1.005)).toBe(101);
    expect(toMinor(1500.55)).toBe(150055);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor(0)).toBe(0);
    expect(toMinor(NaN)).toBe(0);
  });
});

// ============================================================
// Компоненты по отдельности
// ============================================================

describe('salary', () => {
  it('начисляет фиксированный оклад', () => {
    const { lines } = run({
      rules: [rule({ components: [{ kind: 'salary', amountMinor: 3_000_000 }] })],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].computedMinor).toBe(3_000_000);
    expect(lines[0].components[0].basis.amountMinor).toBe(3_000_000);
  });

  it('даёт строку даже при полностью нулевой активности — это и значит «оклад»', () => {
    const { lines } = run({
      rules: [rule({ components: [{ kind: 'salary', amountMinor: 500_000 }] })],
      incomeTx: [],
      sessions: [],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].computedMinor).toBe(500_000);
  });

  it('найм в середине месяца оплачивается полным месяцем на периоде effectiveFrom', () => {
    const { lines } = run({
      rules: [rule({ effectiveFrom: PERIOD, components: [{ kind: 'salary', amountMinor: 900_000 }] })],
    });
    expect(lines[0].computedMinor).toBe(900_000); // без пропорции — так же начисляет monthly-billing
  });
});

describe('percent_revenue', () => {
  it('берёт процент от собранного в окне', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 2000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(1000), income(500)],
    });
    // (100000 + 50000) * 20% = 30000 тыйын = 300 с.
    expect(lines[0].computedMinor).toBe(30_000);
    expect(lines[0].components[0].basis.revenueBaseMinor).toBe(150_000);
    expect(lines[0].components[0].basis.sourceTxnIds).toHaveLength(2);
  });

  it('возвраты уменьшают базу', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 5000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(1000)],
      refundTx: [refund(400)],
    });
    const basis = lines[0].components[0].basis;
    expect(basis.grossMinor).toBe(100_000);
    expect(basis.refundMinor).toBe(40_000);
    expect(basis.revenueBaseMinor).toBe(60_000);
    expect(lines[0].computedMinor).toBe(30_000); // 50% от 600 с.
  });

  it('возврат, переданный уже со знаком минус, считается так же', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 5000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(1000)],
      refundTx: [refund(-400)],
    });
    expect(lines[0].components[0].basis.revenueBaseMinor).toBe(60_000);
  });

  it('возвраты больше сборов дают НОЛЬ, а не отрицательный заработок', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 5000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(100)],
      refundTx: [refund(900)],
    });
    // Никакого clawback: компонент обнуляется, а не уходит в минус.
    expect(lines[0].computedMinor).toBe(0);
    expect(lines[0].components[0].basis.revenueBaseMinor).toBe(0);
    expect(codes(lines[0].diagnostics)).toContain('percent_base_negative');
  });

  it('ОКРУГЛЯЕТ ОДИН РАЗ на строке, а не на каждой транзакции', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 3333, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      // Три платежа по 0.05 с. = 5 тыйын каждый.
      incomeTx: [income(0.05), income(0.05), income(0.05)],
    });
    // Правильно: (15 * 3333) / 10000 = 4.9995 → 5.
    // Потранзакционно было бы round(1.6665) = 2 трижды = 6. Разница видима.
    expect(lines[0].computedMinor).toBe(5);
  });

  it('ровно .5 уходит ВВЕРХ (HALF_UP, не банковское округление)', () => {
    const mk = (som: number) =>
      run({
        rules: [
          rule({
            components: [
              { kind: 'percent_revenue', percentBp: 5000, base: 'collected', scope: { groupIds: ['g1'] } },
            ],
          }),
        ],
        incomeTx: [income(som)],
      }).lines[0].computedMinor;

    // Обе ничьи выбраны с ЧЁТНОЙ целой частью — на них HALF_UP расходится с
    // банковским округлением (round-half-to-even), которое ушло бы вниз.
    expect(mk(1.01)).toBe(51); // 101 × 50 % = 50.5 → 51 (банковское дало бы 50)
    expect(mk(5.05)).toBe(253); // 505 × 50 % = 252.5 → 253 (банковское дало бы 252)
  });

  it('НЕ считает процент float-умножением (иначе теряется тыйын)', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 6667, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(450)],
    });
    // База 45000 тыйын, 66.67 %. Точно: 45000*6667/10000 = 30001.5 → HALF_UP → 30002.
    // Через float: 45000 * 0.6667 === 30001.499999999996 → Math.round → 30001.
    // Ожидание записано ЛИТЕРАЛОМ: посчитать его тем же divRoundHalfUp значило бы
    // сверять реализацию с самой собой, и подмена на float прошла бы незамеченной.
    expect(lines[0].computedMinor).toBe(30_002);
  });
});

describe('per_lesson', () => {
  it('считает проведённые занятия × ставку', () => {
    const { lines } = run({
      rules: [rule({ components: [{ kind: 'per_lesson', amountMinor: 25_000, scope: {} }] })],
      sessions: [session(), session(), session()],
    });
    expect(lines[0].computedMinor).toBe(75_000);
    expect(lines[0].components[0].basis.sessionCount).toBe(3);
  });

  it('отменённые занятия не оплачиваются', () => {
    const { lines } = run({
      rules: [rule({ components: [{ kind: 'per_lesson', amountMinor: 25_000, scope: {} }] })],
      sessions: [session(), session({ status: 'cancelled' }), session({ status: 'cancelled' })],
    });
    expect(lines[0].computedMinor).toBe(25_000);
    expect(lines[0].components[0].basis.sessionCount).toBe(1);
  });

  it('занятия другого преподавателя не попадают в строку', () => {
    const { lines } = run({
      rules: [rule({ teacherId: 't1', components: [{ kind: 'per_lesson', amountMinor: 25_000, scope: {} }] })],
      sessions: [session({ teacherId: 't1' }), session({ teacherId: 't2' })],
    });
    expect(lines[0].components[0].basis.sessionCount).toBe(1);
  });

  it('замена: платят тому, кто реально вёл', () => {
    const { lines } = run({
      rules: [
        rule({ id: 'rA', teacherId: 'tA', components: [{ kind: 'per_lesson', amountMinor: 10_000, scope: {} }] }),
        rule({ id: 'rB', teacherId: 'tB', components: [{ kind: 'per_lesson', amountMinor: 10_000, scope: {} }] }),
      ],
      // Урок группы tA провёл подменяющий tB — заработал tB.
      sessions: [session({ teacherId: 'tB' })],
    });
    const byTeacher = Object.fromEntries(lines.map((l) => [l.teacherId, l.computedMinor]));
    expect(byTeacher.tA).toBe(0);
    expect(byTeacher.tB).toBe(10_000);
  });
});

describe('per_hour', () => {
  it('оплачивает по фактическим минутам', () => {
    const { lines } = run({
      rules: [rule({ components: [{ kind: 'per_hour', amountMinor: 30_000, scope: {} }] })],
      sessions: [session({ durationMinutes: 90 }), session({ durationMinutes: 30 })],
    });
    // 120 минут = 2 часа × 300 с.
    expect(lines[0].computedMinor).toBe(60_000);
    expect(lines[0].components[0].basis.minutesTotal).toBe(120);
  });

  it('ИСКЛЮЧАЕТ занятия без длительности и говорит об этом', () => {
    const { lines, diagnostics } = run({
      rules: [rule({ components: [{ kind: 'per_hour', amountMinor: 30_000, scope: {} }] })],
      sessions: [
        session({ durationMinutes: 60 }),
        session({ durationMinutes: null }),
        session({ durationMinutes: null }),
      ],
    });
    // Подставить «обычные 90 минут» значило бы выдумать деньги.
    expect(lines[0].computedMinor).toBe(30_000);
    expect(lines[0].components[0].basis.sessionCount).toBe(1);

    const d = diagnostics.find((x) => x.code === 'session_no_duration');
    expect(d).toBeDefined();
    expect(d!.count).toBe(2);
    expect(d!.sample).toHaveLength(2);
    expect(d!.message).toContain('2');
  });

  it('без длительности у ВСЕХ занятий — ноль и диагностика, а не пустая строка', () => {
    const { lines, diagnostics } = run({
      rules: [rule({ components: [{ kind: 'per_hour', amountMinor: 30_000, scope: {} }] })],
      sessions: [session({ durationMinutes: null })],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].computedMinor).toBe(0);
    expect(codes(diagnostics)).toContain('session_no_duration');
  });

  it('округляет часы один раз, HALF_UP', () => {
    const mk = (minutes: number, amountMinor: number) =>
      run({
        rules: [rule({ components: [{ kind: 'per_hour', amountMinor, scope: {} }] })],
        sessions: [session({ durationMinutes: minutes })],
      }).lines[0].computedMinor;

    expect(mk(30, 1)).toBe(1); // 0.5 → 1
    expect(mk(90, 1)).toBe(2); // 1.5 → 2
    expect(mk(20, 1)).toBe(0); // 0.333 → 0
    expect(mk(45, 10_000)).toBe(7_500);
  });

  it('суммирует минуты ДО деления, а не платит за каждое занятие отдельно', () => {
    const { lines } = run({
      rules: [rule({ components: [{ kind: 'per_hour', amountMinor: 100, scope: {} }] })],
      sessions: [session({ durationMinutes: 10 }), session({ durationMinutes: 10 }), session({ durationMinutes: 10 })],
    });
    // Вместе: 30 мин → 100*30/60 = 50. Поштучно: round(16.67)*3 = 51.
    expect(lines[0].computedMinor).toBe(50);
  });
});

describe('per_student', () => {
  it('умножает суммарную посещаемость на ставку', () => {
    const { lines } = run({
      rules: [rule({ components: [{ kind: 'per_student', amountMinor: 5_000, scope: {} }] })],
      sessions: [session({ headcount: 8 }), session({ headcount: 12 })],
    });
    expect(lines[0].computedMinor).toBe(100_000); // 20 × 50 с.
    expect(lines[0].components[0].basis.studentTotal).toBe(20);
  });

  it('отменённое занятие не приносит посещаемость', () => {
    const { lines } = run({
      rules: [rule({ components: [{ kind: 'per_student', amountMinor: 5_000, scope: {} }] })],
      sessions: [session({ headcount: 8 }), session({ headcount: 12, status: 'cancelled' })],
    });
    expect(lines[0].components[0].basis.studentTotal).toBe(8);
  });

  it('нулевая явка даёт ноль, но строка остаётся', () => {
    const { lines } = run({
      rules: [rule({ components: [{ kind: 'per_student', amountMinor: 5_000, scope: {} }] })],
      sessions: [session({ headcount: 0 })],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].computedMinor).toBe(0);
  });
});

// ============================================================
// Стекинг компонентов
// ============================================================

describe('стекинг компонентов', () => {
  it('оклад + процент — одно правило, две строки расчёта', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'salary', amountMinor: 2_000_000 },
            { kind: 'percent_revenue', percentBp: 1000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(5000)],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].components).toHaveLength(2);
    // 2 000 000 + 10% от 500 000 = 2 050 000
    expect(lines[0].computedMinor).toBe(2_050_000);
    expect(lines[0].components.map((c) => c.kind)).toEqual(['salary', 'percent_revenue']);
  });

  it('оклад + за занятие + за ученика складываются в одну строку', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'salary', amountMinor: 100_000 },
            { kind: 'per_lesson', amountMinor: 10_000, scope: {} },
            { kind: 'per_student', amountMinor: 1_000, scope: {} },
          ],
        }),
      ],
      sessions: [session({ headcount: 5 }), session({ headcount: 5 })],
    });
    // 100 000 + 2×10 000 + 10×1 000 = 130 000
    expect(lines[0].computedMinor).toBe(130_000);
    expect(lines[0].components.reduce((s, c) => s + c.earnedMinor, 0)).toBe(lines[0].computedMinor);
  });
});

// ============================================================
// Scope
// ============================================================

describe('область действия (scope)', () => {
  it('фильтрует выручку по группам', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 10000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(100, { groupId: 'g1' }), income(900, { groupId: 'g2' })],
    });
    expect(lines[0].components[0].basis.revenueBaseMinor).toBe(10_000);
  });

  it('фильтрует выручку по курсам', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 10000, base: 'collected', scope: { courseIds: ['c1'] } },
          ],
        }),
      ],
      incomeTx: [income(100, { courseId: 'c1' }), income(900, { courseId: 'c2' })],
    });
    expect(lines[0].components[0].basis.revenueBaseMinor).toBe(10_000);
  });

  it('группа важнее курса, если названы обе', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            {
              kind: 'percent_revenue',
              percentBp: 10000,
              base: 'collected',
              scope: { groupIds: ['g1'], courseIds: ['c1', 'c2'] },
            },
          ],
        }),
      ],
      // Тот же курс c1, но другая группа — по группе не проходит.
      incomeTx: [income(100, { groupId: 'g1', courseId: 'c1' }), income(900, { groupId: 'g9', courseId: 'c1' })],
    });
    expect(lines[0].components[0].basis.revenueBaseMinor).toBe(10_000);
  });

  it('платёж без groupId не подхватывается групповой областью', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 10000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(500, { groupId: null })],
    });
    expect(lines[0].components[0].basis.revenueBaseMinor).toBe(0);
  });

  it('ПУСТАЯ область на проценте = ноль + диагностика, а не вся выручка организации', () => {
    const { lines, diagnostics } = run({
      rules: [
        rule({ components: [{ kind: 'percent_revenue', percentBp: 5000, base: 'collected', scope: {} }] }),
      ],
      incomeTx: [income(1_000_000)],
    });
    // Выручка не несёт teacherId — пустая область молча забрала бы кассу всей
    // организации в базу одного человека.
    expect(lines[0].computedMinor).toBe(0);
    expect(codes(diagnostics)).toContain('percent_scope_empty');
    expect(lines[0].components[0].basis.sourceTxnIds).toEqual([]);
  });

  it('пустая область на посессионном компоненте — законно «все занятия учителя»', () => {
    const { lines, diagnostics } = run({
      rules: [rule({ components: [{ kind: 'per_lesson', amountMinor: 10_000, scope: {} }] })],
      sessions: [session({ groupId: 'g1' }), session({ groupId: 'g7', courseId: 'c9' })],
    });
    // Ассиметрия с процентом намеренная: у сессии есть teacherId, у выручки нет.
    expect(lines[0].computedMinor).toBe(20_000);
    expect(codes(diagnostics)).not.toContain('percent_scope_empty');
  });

  it('фильтрует занятия по группам и курсам', () => {
    const byGroup = run({
      rules: [rule({ components: [{ kind: 'per_lesson', amountMinor: 10_000, scope: { groupIds: ['g1'] } }] })],
      sessions: [session({ groupId: 'g1' }), session({ groupId: 'g2' })],
    });
    expect(byGroup.lines[0].components[0].basis.sessionCount).toBe(1);

    const byCourse = run({
      rules: [rule({ components: [{ kind: 'per_lesson', amountMinor: 10_000, scope: { courseIds: ['c2'] } }] })],
      sessions: [session({ courseId: 'c1' }), session({ courseId: 'c2' })],
    });
    expect(byCourse.lines[0].components[0].basis.sessionCount).toBe(1);
  });
});

// ============================================================
// Сессии без учителя
// ============================================================

describe('занятия без преподавателя', () => {
  it('не начисляются НИКОМУ и не приписываются тому, кто отметил журнал', () => {
    const { lines, diagnostics } = run({
      rules: [rule({ components: [{ kind: 'per_lesson', amountMinor: 10_000, scope: {} }] })],
      sessions: [session({ teacherId: 't1' }), session({ teacherId: null }), session({ teacherId: null })],
    });
    expect(lines[0].computedMinor).toBe(10_000);

    const d = diagnostics.find((x) => x.code === 'session_no_teacher');
    expect(d).toBeDefined();
    expect(d!.count).toBe(2);
  });

  it('не попадают ни в per_student, ни в per_hour', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'per_hour', amountMinor: 60_000, scope: {} },
            { kind: 'per_student', amountMinor: 1_000, scope: {} },
          ],
        }),
      ],
      sessions: [session({ teacherId: null, durationMinutes: 120, headcount: 50 })],
    });
    expect(lines[0].computedMinor).toBe(0);
  });

  it('отменённое занятие без учителя не шумит в диагностике', () => {
    const { diagnostics } = run({
      rules: [rule({ components: [{ kind: 'per_lesson', amountMinor: 1, scope: {} }] })],
      sessions: [session({ teacherId: null, status: 'cancelled' })],
    });
    expect(codes(diagnostics)).not.toContain('session_no_teacher');
  });
});

// ============================================================
// Разрешение правил
// ============================================================

describe('разрешение правил', () => {
  it('игнорирует архивные правила', () => {
    const { resolved } = resolveRules([rule({ status: 'archived' })], PERIOD);
    expect(resolved.size).toBe(0);
  });

  it('уважает границы действия (обе включительно, сравнение строк YYYY-MM)', () => {
    const active = (from: string, to: string | null) =>
      resolveRules([rule({ effectiveFrom: from, effectiveTo: to })], PERIOD).resolved.size;

    expect(active('2026-07', '2026-07')).toBe(1); // ровно этот месяц
    expect(active('2026-01', null)).toBe(1); // бессрочное
    expect(active('2026-08', null)).toBe(0); // ещё не началось
    expect(active('2026-01', '2026-06')).toBe(0); // уже закончилось
    expect(active('2026-07', null)).toBe(1); // начинается в этом месяце
    expect(active('2026-01', '2026-07')).toBe(1); // заканчивается в этом месяце
  });

  it('при пересечении правил выбирает ДЕТЕРМИНИРОВАННО и сообщает — не суммирует', () => {
    const older = rule({ id: 'rA', effectiveFrom: '2026-01' });
    const newer = rule({ id: 'rB', effectiveFrom: '2026-05' });

    for (const order of [[older, newer], [newer, older]]) {
      const { resolved, diagnostics } = resolveRules(order, PERIOD);
      expect(resolved.size).toBe(1);
      expect(resolved.get('t1')!.id).toBe('rB'); // самый поздний effectiveFrom
      expect(codes(diagnostics)).toContain('overlapping_rules');
    }
  });

  it('при равном effectiveFrom тай-брейк по id', () => {
    const { resolved } = resolveRules(
      [rule({ id: 'rZ', effectiveFrom: '2026-05' }), rule({ id: 'rA', effectiveFrom: '2026-05' })],
      PERIOD,
    );
    expect(resolved.get('t1')!.id).toBe('rA');
  });

  it('пересечение НИКОГДА не даёт двойную ставку', () => {
    const { lines } = run({
      rules: [
        rule({ id: 'rA', effectiveFrom: '2026-01', components: [{ kind: 'salary', amountMinor: 100_000 }] }),
        rule({ id: 'rB', effectiveFrom: '2026-05', components: [{ kind: 'salary', amountMinor: 700_000 }] }),
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].computedMinor).toBe(700_000); // не 800 000
    expect(codes(lines[0].diagnostics)).toContain('overlapping_rules');
  });

  it('строки идут в детерминированном порядке', () => {
    const mk = () =>
      run({
        rules: [
          rule({ id: 'r3', teacherId: 'tC', components: [{ kind: 'salary', amountMinor: 1 }] }),
          rule({ id: 'r1', teacherId: 'tA', components: [{ kind: 'salary', amountMinor: 1 }] }),
          rule({ id: 'r2', teacherId: 'tB', components: [{ kind: 'salary', amountMinor: 1 }] }),
        ],
      }).lines.map((l) => l.teacherId);
    expect(mk()).toEqual(['tA', 'tB', 'tC']);
    expect(mk()).toEqual(mk());
  });

  it('замораживает снимок правила для расчётного листа', () => {
    const { lines } = run({
      rules: [
        rule({
          id: 'rX',
          label: 'Оклад + 20% с группы А',
          effectiveFrom: '2026-03',
          effectiveTo: '2026-12',
          components: [{ kind: 'salary', amountMinor: 42 }],
        }),
      ],
    });
    expect(lines[0].ruleSnapshot).toEqual({
      ruleId: 'rX',
      label: 'Оклад + 20% с группы А',
      effectiveFrom: '2026-03',
      effectiveTo: '2026-12',
      components: [{ kind: 'salary', amountMinor: 42 }],
    });
  });

  it('правило без компонентов даёт ноль с диагностикой', () => {
    const { lines, diagnostics } = run({ rules: [rule({ components: [] })] });
    expect(lines[0].computedMinor).toBe(0);
    expect(codes(diagnostics)).toContain('rule_no_components');
  });
});

// ============================================================
// Учитель без ставки
// ============================================================

describe('преподаватель без действующей ставки', () => {
  it('не даёт строку, но попадает в список «нет ставки»', () => {
    const { lines, diagnostics } = run({
      rules: [rule({ teacherId: 't1', components: [{ kind: 'per_lesson', amountMinor: 10_000, scope: {} }] })],
      sessions: [session({ teacherId: 't1' }), session({ teacherId: 't2' })],
    });
    expect(lines.map((l) => l.teacherId)).toEqual(['t1']);

    const d = diagnostics.find((x) => x.code === 'teacher_without_rule');
    expect(d).toBeDefined();
    expect(d!.count).toBe(1);
    expect(d!.sample).toEqual(['t2']);
  });

  it('knownTeacherIds делает список полным даже без занятий в окне', () => {
    const { diagnostics } = run({
      rules: [rule({ teacherId: 't1', components: [{ kind: 'salary', amountMinor: 1 }] })],
      knownTeacherIds: ['t1', 't2', 't3'],
    });
    const d = diagnostics.find((x) => x.code === 'teacher_without_rule');
    expect(d!.count).toBe(2);
    expect(d!.sample).toEqual(['t2', 't3']);
  });

  it('молчит, когда у всех есть ставка', () => {
    const { diagnostics } = run({
      rules: [rule({ teacherId: 't1', components: [{ kind: 'salary', amountMinor: 1 }] })],
      knownTeacherIds: ['t1'],
      sessions: [session({ teacherId: 't1' })],
    });
    expect(codes(diagnostics)).not.toContain('teacher_without_rule');
  });
});

// ============================================================
// Неатрибутированная выручка
// ============================================================

describe('выручка вне областей действия', () => {
  it('сообщает о платежах, с которых процент никому не начислен', () => {
    const { diagnostics } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 2000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(100, { groupId: 'g1' }), income(700, { groupId: 'g2' })],
    });
    const d = diagnostics.find((x) => x.code === 'revenue_unattributed');
    expect(d).toBeDefined();
    expect(d!.count).toBe(1);
    expect(d!.message).toContain('700.00');
  });

  it('МОЛЧИТ в академии на чистых окладах — иначе это шум на пустом месте', () => {
    const { diagnostics } = run({
      rules: [rule({ components: [{ kind: 'salary', amountMinor: 500_000 }] })],
      incomeTx: [income(100_000)],
    });
    expect(codes(diagnostics)).not.toContain('revenue_unattributed');
  });

  it('платёж, попавший в область хотя бы одного правила, не считается ничьим', () => {
    const { diagnostics } = run({
      rules: [
        rule({
          id: 'rA',
          teacherId: 'tA',
          components: [
            { kind: 'percent_revenue', percentBp: 1000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
        rule({
          id: 'rB',
          teacherId: 'tB',
          components: [
            { kind: 'percent_revenue', percentBp: 1000, base: 'collected', scope: { groupIds: ['g2'] } },
          ],
        }),
      ],
      incomeTx: [income(100, { groupId: 'g1' }), income(100, { groupId: 'g2' })],
    });
    expect(codes(diagnostics)).not.toContain('revenue_unattributed');
  });

  it('соведение: одна и та же выручка законно входит в базу обоих', () => {
    const { lines } = run({
      rules: [
        rule({
          id: 'rA',
          teacherId: 'tA',
          components: [
            { kind: 'percent_revenue', percentBp: 1000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
        rule({
          id: 'rB',
          teacherId: 'tB',
          components: [
            { kind: 'percent_revenue', percentBp: 1000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(1000, { groupId: 'g1' })],
    });
    expect(lines.map((l) => l.computedMinor)).toEqual([10_000, 10_000]);
  });
});

// ============================================================
// Границы окна
// ============================================================

describe('границы окна', () => {
  it('включает платежи РОВНО на обеих границах и отсекает соседние мгновения', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 10000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [
        income(1, { id: 'atStart', date: WINDOW_START }),
        income(1, { id: 'atEnd', date: WINDOW_END }),
        income(1000, { id: 'justBefore', date: JUST_BEFORE }),
        income(1000, { id: 'justAfter', date: JUST_AFTER }),
      ],
    });
    // Обе границы включительно: 100 % от 2 сомов.
    expect(lines[0].computedMinor).toBe(200);
    expect(lines[0].components[0].basis.sourceTxnIds).toEqual(['atStart', 'atEnd']);
  });

  it('окно применяется и к возвратам', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 10000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(1000)],
      refundTx: [refund(400, { date: '2026-06-15T10:00:00.000Z' })], // прошлый период
    });
    expect(lines[0].components[0].basis.refundMinor).toBe(0);
    expect(lines[0].computedMinor).toBe(100_000);
  });

  it('занятия вне окна не оплачиваются', () => {
    const { lines } = run({
      rules: [rule({ components: [{ kind: 'per_lesson', amountMinor: 10_000, scope: {} }] })],
      sessions: [
        session({ date: '2026-07-01' }),
        session({ date: '2026-07-31' }),
        session({ date: '2026-06-30' }),
        session({ date: '2026-08-01' }),
      ],
    });
    // Первый и последний день месяца включительно.
    expect(lines[0].components[0].basis.sessionCount).toBe(2);
  });

  it('день занятия берётся от ЛОКАЛЬНОЙ границы, а не срезом UTC-строки', () => {
    // Регрессия на конкретную ошибку: в зоне академии (UTC+6) WINDOW_START в виде
    // ISO выглядит как '2026-06-30T18:00:00.000Z', и наивный slice(0,10) дал бы
    // '2026-06-30' — занятия 30 июня утекли бы в июльскую зарплату. Тест
    // различает эти реализации везде, где смещение зоны ненулевое.
    const { lines } = run({
      rules: [rule({ components: [{ kind: 'per_lesson', amountMinor: 10_000, scope: {} }] })],
      sessions: [session({ date: '2026-06-30' }), session({ date: '2026-07-01' }), session({ date: '2026-07-31' })],
    });
    expect(lines[0].components[0].basis.sessionCount).toBe(2);
  });

  it('платёж с голой датой YYYY-MM-DD попадает в окно', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 10000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(500, { date: '2026-07-31' })],
    });
    expect(lines[0].computedMinor).toBe(50_000);
  });

  it('платёж с нечитаемой датой не попадает в базу', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 10000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(500, { date: 'не дата' })],
    });
    expect(lines[0].computedMinor).toBe(0);
  });
});

// ============================================================
// Форма результата
// ============================================================

describe('форма результата', () => {
  it('пустой вход даёт пустой результат, а не падение', () => {
    const { lines, diagnostics } = run();
    expect(lines).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('computedMinor всегда целый и равен сумме компонентов', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'salary', amountMinor: 111 },
            { kind: 'percent_revenue', percentBp: 777, base: 'collected', scope: { groupIds: ['g1'] } },
            { kind: 'per_hour', amountMinor: 333, scope: {} },
          ],
        }),
      ],
      incomeTx: [income(333.33)],
      sessions: [session({ durationMinutes: 50 })],
    });
    const line = lines[0];
    expect(Number.isInteger(line.computedMinor)).toBe(true);
    expect(line.computedMinor).toBe(line.components.reduce((s, c) => s + c.earnedMinor, 0));
    for (const c of line.components) expect(Number.isInteger(c.earnedMinor)).toBe(true);
  });

  it('ни один компонент не уходит в минус', () => {
    const { lines } = run({
      rules: [
        rule({
          components: [
            { kind: 'percent_revenue', percentBp: 5000, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
      ],
      incomeTx: [income(1)],
      refundTx: [refund(99_999)],
    });
    for (const c of lines[0].components) expect(c.earnedMinor).toBeGreaterThanOrEqual(0);
  });

  it('общий список диагностик содержит и построчные, и глобальные', () => {
    const { lines, diagnostics } = run({
      rules: [rule({ components: [{ kind: 'per_hour', amountMinor: 100, scope: {} }] })],
      sessions: [session({ durationMinutes: null }), session({ teacherId: null })],
    });
    expect(codes(lines[0].diagnostics)).toContain('session_no_duration'); // построчная
    expect(codes(diagnostics)).toContain('session_no_duration');
    expect(codes(diagnostics)).toContain('session_no_teacher'); // глобальная
  });

  it('диагностики несут русское сообщение и ограниченный sample', () => {
    const many = Array.from({ length: 12 }, () => session({ teacherId: null }));
    const { diagnostics } = run({
      rules: [rule({ components: [{ kind: 'per_lesson', amountMinor: 1, scope: {} }] })],
      sessions: many,
    });
    const d = diagnostics.find((x) => x.code === 'session_no_teacher')!;
    expect(d.count).toBe(12);
    expect(d.sample!.length).toBeLessThanOrEqual(5); // sample для перехода, не полный список
    expect(d.message).toMatch(/[А-Яа-я]/);
  });

  it('входные массивы не мутируются', () => {
    const rules = [rule({ components: [{ kind: 'salary', amountMinor: 1 }] })];
    const sessions = [session(), session({ teacherId: null })];
    const incomeTx = [income(10), income(20)];
    const snapshot = JSON.stringify({ rules, sessions, incomeTx });

    run({ rules, sessions, incomeTx });

    expect(JSON.stringify({ rules, sessions, incomeTx })).toBe(snapshot);
  });

  it('расчёт детерминирован: повторный прогон даёт тот же результат', () => {
    const inputs: Partial<PayrollInputs> = {
      rules: [
        rule({
          components: [
            { kind: 'salary', amountMinor: 250_000 },
            { kind: 'percent_revenue', percentBp: 1500, base: 'collected', scope: { groupIds: ['g1'] } },
            { kind: 'per_hour', amountMinor: 20_000, scope: {} },
          ],
        }),
      ],
      incomeTx: [income(1234.56), income(789.01)],
      refundTx: [refund(100.5)],
      sessions: [session({ durationMinutes: 95 }), session({ durationMinutes: null })],
    };
    expect(JSON.stringify(run(inputs))).toBe(JSON.stringify(run(inputs)));
  });
});

// ============================================================
// Сквозной сценарий
// ============================================================

describe('сквозной расчёт по академии', () => {
  it('считает трёх преподавателей с разными схемами оплаты', () => {
    const { lines, diagnostics } = run({
      rules: [
        // Оклад + 15 % с группы g1.
        rule({
          id: 'rA',
          teacherId: 'tA',
          components: [
            { kind: 'salary', amountMinor: 2_000_000 },
            { kind: 'percent_revenue', percentBp: 1500, base: 'collected', scope: { groupIds: ['g1'] } },
          ],
        }),
        // Почасовая по курсу c2.
        rule({
          id: 'rB',
          teacherId: 'tB',
          components: [{ kind: 'per_hour', amountMinor: 40_000, scope: { courseIds: ['c2'] } }],
        }),
        // За ученика, все группы.
        rule({
          id: 'rC',
          teacherId: 'tC',
          components: [{ kind: 'per_student', amountMinor: 3_000, scope: {} }],
        }),
      ],
      incomeTx: [
        income(10_000, { groupId: 'g1' }),
        income(4_000, { groupId: 'g2' }), // ничья: ни в одной области
      ],
      refundTx: [refund(2_000, { groupId: 'g1' })],
      sessions: [
        session({ teacherId: 'tB', courseId: 'c2', durationMinutes: 90 }),
        session({ teacherId: 'tB', courseId: 'c2', durationMinutes: null }), // без длительности
        session({ teacherId: 'tC', headcount: 7 }),
        session({ teacherId: 'tC', headcount: 9, status: 'cancelled' }), // отменено
        session({ teacherId: null, headcount: 20 }), // ничей урок
      ],
      knownTeacherIds: ['tA', 'tB', 'tC', 'tD'],
    });

    const by = Object.fromEntries(lines.map((l) => [l.teacherId, l]));

    // tA: 2 000 000 + 15 % от (1 000 000 − 200 000) = 2 000 000 + 120 000
    expect(by.tA.computedMinor).toBe(2_120_000);
    // tB: 90 мин × 400 с./час = 600 с.; занятие без длительности пропущено
    expect(by.tB.computedMinor).toBe(60_000);
    // tC: 7 учеников × 30 с.; отменённое и ничьё не в счёт
    expect(by.tC.computedMinor).toBe(21_000);
    // tD ставки не имеет — строки нет
    expect(by.tD).toBeUndefined();

    const found = new Set(codes(diagnostics));
    expect(found).toContain('session_no_duration');
    expect(found).toContain('session_no_teacher');
    expect(found).toContain('revenue_unattributed');
    expect(found).toContain('teacher_without_rule');

    // Итог ведомости — целое число минорных единиц.
    const total = lines.reduce((s, l) => s + l.computedMinor, 0);
    expect(total).toBe(2_201_000);
    expect(Number.isInteger(total)).toBe(true);
  });
});
