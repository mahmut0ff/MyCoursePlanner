import { describe, it, expect } from 'vitest';
import {
  computePayroll,
  buildTeacherScopes,
  collectTeacherRevenue,
  resolveRules,
  buildBranchShares,
  allocateByShares,
  toMinor,
  roundHalfUp,
  divRoundHalfUp,
  type BranchShare,
  type CompensationRule,
  type FinanceTxLike,
  type GroupLike,
  type PayrollInputs,
  type DiagnosticCode,
} from '../utils/payroll-engine';

/**
 * Тесты расчётного ядра зарплаты.
 *
 * Это страховочная сетка под чужой зарплатой, поэтому проверяется не только
 * «сумма сошлась», но и четыре вещи, на которых такие движки обычно и врут:
 *
 *  - округление происходит ОДИН раз на строке заработка, а не на каждой
 *    транзакции (иначе копейки утекают тихо и навсегда);
 *  - база процента — деньги ЕГО групп, и ничьи больше: чужая группа не может
 *    попасть в базу, а платёж без группы не может попасть молча;
 *  - нехватка данных даёт видимый ноль С ДИАГНОСТИКОЙ, а не правдоподобную
 *    догадку (нет групп, возвратов больше сборов, ставка пустая);
 *  - границы окна включительны с ОБЕИХ сторон (платёж ровно на границе периода
 *    нельзя потерять).
 *
 * Мока базы здесь нет намеренно: ядро не ходит в Firestore.
 */

// ============================================================
// Хелперы
// ============================================================

const PERIOD = '2026-07';
// Окно строится в КАЛЕНДАРЕ ОРГАНИЗАЦИИ (UTC+6) — ровно так его отдаёт
// getPeriodRange в проде. Локальные компоненты (new Date(2026, 6, 1)) здесь
// использовать нельзя: на машине разработчика в Бишкеке они совпадают с
// орг-днём и тест проходит, а на Netlify (UTC) окно съезжает на шесть часов —
// правая граница уползает на 1 августа, и платёж 1-го числа попадает сразу в
// две соседние ведомости.
const ORG_OFFSET_MS = 6 * 60 * 60 * 1000;
const orgDayStartIso = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d) - ORG_OFFSET_MS).toISOString();
const orgDayEndIso = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - ORG_OFFSET_MS).toISOString();
const WINDOW_START = orgDayStartIso(2026, 6, 1);
const WINDOW_END = orgDayEndIso(2026, 6, 31);
/** Соседние мгновения ВНЕ окна — считаются от границ, а не от календаря UTC. */
const JUST_BEFORE = new Date(new Date(WINDOW_START).getTime() - 1).toISOString();
const JUST_AFTER = new Date(new Date(WINDOW_END).getTime() + 1).toISOString();

function rule(over: Partial<CompensationRule> = {}): CompensationRule {
  return {
    id: 'r1',
    organizationId: 'org1',
    teacherId: 't1',
    components: [],
    ...over,
  };
}

/** Группа «g1» с преподавателем t1 и двумя студентами — умолчание всех тестов. */
function group(over: Partial<GroupLike> = {}): GroupLike {
  return {
    id: 'g1',
    name: 'Группа 1',
    courseId: 'c1',
    teacherIds: ['t1'],
    studentIds: ['s1', 's2'],
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
    studentId: 's1',
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
    studentId: 's1',
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
    groups: [group()],
    ...over,
  });
}

/** Ставка «процент» — самый частый случай, поэтому вынесен в хелпер. */
const percent = (bp: number) => [{ kind: 'percent_revenue' as const, percentBp: bp, base: 'collected' as const }];
const fixed = (amountMinor: number) => [{ kind: 'salary' as const, amountMinor }];

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
// Два вида оплаты
// ============================================================

describe('фиксированная сумма', () => {
  it('начисляется целиком, независимо от оплат', () => {
    const { lines } = run({ rules: [rule({ components: fixed(3_000_000) })], incomeTx: [] });
    expect(lines).toHaveLength(1);
    expect(lines[0].computedMinor).toBe(3_000_000);
    expect(lines[0].components[0].basis.amountMinor).toBe(3_000_000);
  });

  it('даёт строку даже при полностью нулевой активности — это и значит «фиксированная»', () => {
    const { lines } = run({ rules: [rule({ components: fixed(500_000) })], groups: [] });
    expect(lines).toHaveLength(1);
    expect(lines[0].computedMinor).toBe(500_000);
  });

  it('найм в середине месяца оплачивается полным месяцем', () => {
    const { lines } = run({ rules: [rule({ components: fixed(900_000) })] });
    expect(lines[0].computedMinor).toBe(900_000); // без пропорции — так же начисляет monthly-billing
  });
});

describe('процент с оплат студентов', () => {
  it('берёт процент от собранного в окне по группам преподавателя', () => {
    const { lines } = run({
      rules: [rule({ components: percent(2000) })],
      incomeTx: [income(1000), income(500)],
    });
    // (100000 + 50000) * 20% = 30000 тыйын = 300 с.
    expect(lines[0].computedMinor).toBe(30_000);
    expect(lines[0].components[0].basis.revenueBaseMinor).toBe(150_000);
    expect(lines[0].components[0].basis.sourceTxnIds).toHaveLength(2);
  });

  it('возвраты уменьшают базу', () => {
    const { lines } = run({
      rules: [rule({ components: percent(5000) })],
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
      rules: [rule({ components: percent(5000) })],
      incomeTx: [income(1000)],
      refundTx: [refund(-400)],
    });
    expect(lines[0].components[0].basis.revenueBaseMinor).toBe(60_000);
  });

  it('возвраты больше сборов дают НОЛЬ, а не отрицательный заработок', () => {
    const { lines } = run({
      rules: [rule({ components: percent(5000) })],
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
      rules: [rule({ components: percent(3333) })],
      // Три платежа по 0.05 с. = 5 тыйын каждый.
      incomeTx: [income(0.05), income(0.05), income(0.05)],
    });
    // Правильно: (15 * 3333) / 10000 = 4.9995 → 5.
    // Потранзакционно было бы round(1.6665) = 2 трижды = 6. Разница видима.
    expect(lines[0].computedMinor).toBe(5);
  });

  it('ровно .5 уходит ВВЕРХ (HALF_UP, не банковское округление)', () => {
    const mk = (som: number) =>
      run({ rules: [rule({ components: percent(5000) })], incomeTx: [income(som)] }).lines[0].computedMinor;

    // Обе ничьи выбраны с ЧЁТНОЙ целой частью — на них HALF_UP расходится с
    // банковским округлением (round-half-to-even), которое ушло бы вниз.
    expect(mk(1.01)).toBe(51); // 101 × 50 % = 50.5 → 51 (банковское дало бы 50)
    expect(mk(5.05)).toBe(253); // 505 × 50 % = 252.5 → 253 (банковское дало бы 252)
  });

  it('НЕ считает процент float-умножением (иначе теряется тыйын)', () => {
    const { lines } = run({
      rules: [rule({ components: percent(6667) })],
      incomeTx: [income(450)],
    });
    // База 45000 тыйын, 66.67 %. Точно: 45000*6667/10000 = 30001.5 → HALF_UP → 30002.
    // Через float: 45000 * 0.6667 === 30001.499999999996 → Math.round → 30001.
    // Ожидание записано ЛИТЕРАЛОМ: посчитать его тем же divRoundHalfUp значило бы
    // сверять реализацию с самой собой, и подмена на float прошла бы незамеченной.
    expect(lines[0].computedMinor).toBe(30_002);
  });
});

// ============================================================
// Чьи это деньги
// ============================================================

describe('база процента — только группы преподавателя', () => {
  it('деньги чужой группы в базу не входят', () => {
    const { lines } = run({
      rules: [rule({ components: percent(10000) })],
      groups: [group({ id: 'g1' }), group({ id: 'g2', teacherIds: ['t2'] })],
      incomeTx: [income(100, { groupId: 'g1' }), income(900, { groupId: 'g2' })],
    });
    expect(lines[0].components[0].basis.revenueBaseMinor).toBe(10_000);
  });

  it('преподаватель без групп получает ноль с диагностикой, а не выручку организации', () => {
    const { lines, diagnostics } = run({
      rules: [rule({ components: percent(5000) })],
      groups: [group({ teacherIds: ['t2'] })],
      incomeTx: [income(1_000_000)],
    });
    // Выручка не несёт teacherId: без групп её не с чем связать, и «половина
    // кассы организации» была бы выдумкой.
    expect(lines[0].computedMinor).toBe(0);
    expect(codes(diagnostics)).toContain('teacher_without_groups');
    expect(lines[0].components[0].basis.sourceTxnIds).toEqual([]);
  });

  it('платёж без groupId в базу не попадает, но и не теряется молча', () => {
    const { lines, diagnostics } = run({
      rules: [rule({ components: percent(10000) })],
      incomeTx: [income(500, { groupId: null, studentId: 's1' })],
    });
    expect(lines[0].components[0].basis.revenueBaseMinor).toBe(0);
    const d = diagnostics.find((x) => x.code === 'payment_without_group');
    expect(d).toBeDefined();
    expect(d!.message).toContain('500.00');
  });

  it('платёж чужого студента без группы в диагностику преподавателя не попадает', () => {
    const { diagnostics } = run({
      rules: [rule({ components: percent(10000) })],
      incomeTx: [income(500, { groupId: null, studentId: 'sX' })],
    });
    expect(codes(diagnostics)).not.toContain('payment_without_group');
  });

  it('на фиксированной ставке о платежах без группы не сообщает — это был бы шум', () => {
    const { diagnostics } = run({
      rules: [rule({ components: fixed(100) })],
      incomeTx: [income(500, { groupId: null, studentId: 's1' })],
    });
    expect(codes(diagnostics)).not.toContain('payment_without_group');
  });

  it('соведение: одна и та же выручка законно входит в базу обоих преподавателей', () => {
    const { lines } = run({
      rules: [
        rule({ id: 'rA', teacherId: 'tA', components: percent(1000) }),
        rule({ id: 'rB', teacherId: 'tB', components: percent(1000) }),
      ],
      groups: [group({ teacherIds: ['tA', 'tB'] })],
      incomeTx: [income(1000)],
    });
    // Оба ведут группу и оба получают свои 10% — это доля, а не деление одной суммы.
    expect(lines.map((l) => l.computedMinor)).toEqual([10_000, 10_000]);
  });
});

describe('buildTeacherScopes', () => {
  it('собирает группы и студентов преподавателя без повторов', () => {
    const scopes = buildTeacherScopes([
      group({ id: 'g1', teacherIds: ['t1'], studentIds: ['s1', 's2'] }),
      group({ id: 'g2', teacherIds: ['t1', 't2'], studentIds: ['s2', 's3'] }),
    ]);
    expect(scopes.get('t1')).toEqual({ groupIds: ['g1', 'g2'], studentIds: ['s1', 's2', 's3'] });
    expect(scopes.get('t2')).toEqual({ groupIds: ['g2'], studentIds: ['s2', 's3'] });
  });

  it('группа без преподавателей не принадлежит никому', () => {
    const scopes = buildTeacherScopes([group({ teacherIds: [] })]);
    expect(scopes.size).toBe(0);
  });
});

describe('разбивка по группам и студентам', () => {
  it('сумма студентов сходится с суммой групп и с базой', () => {
    const revenue = collectTeacherRevenue(
      { groupIds: ['g1', 'g2'], studentIds: ['s1', 's2'] },
      [
        income(100, { groupId: 'g1', studentId: 's1' }),
        income(300, { groupId: 'g1', studentId: 's2' }),
        income(600, { groupId: 'g2', studentId: 's1' }),
      ],
      [],
    );
    expect(revenue.grossMinor).toBe(100_000);
    expect(revenue.byGroup).toEqual([
      { id: 'g2', paidMinor: 60_000 },
      { id: 'g1', paidMinor: 40_000 },
    ]);
    expect(revenue.byStudent.reduce((s, x) => s + x.paidMinor, 0)).toBe(revenue.grossMinor);
  });

  it('возврат уменьшает строку студента, а не только итог', () => {
    const revenue = collectTeacherRevenue(
      { groupIds: ['g1'], studentIds: ['s1'] },
      [income(1000, { studentId: 's1' })],
      [refund(400, { studentId: 's1' })],
    );
    expect(revenue.netMinor).toBe(60_000);
    expect(revenue.byStudent).toEqual([{ id: 's1', paidMinor: 60_000 }]);
  });
});

// ============================================================
// Окно периода
// ============================================================

describe('окно периода', () => {
  it('включает ОБЕ границы', () => {
    const { lines } = run({
      rules: [rule({ components: percent(10000) })],
      incomeTx: [income(100, { date: WINDOW_START }), income(100, { date: WINDOW_END })],
    });
    expect(lines[0].components[0].basis.grossMinor).toBe(20_000);
  });

  it('отсекает соседние мгновения', () => {
    const { lines } = run({
      rules: [rule({ components: percent(10000) })],
      incomeTx: [income(100, { date: JUST_BEFORE }), income(100, { date: JUST_AFTER })],
    });
    expect(lines[0].components[0].basis.grossMinor).toBe(0);
  });

  it('голая дата YYYY-MM-DD читается как день ОРГАНИЗАЦИИ, а не как полночь UTC', () => {
    // 31 июля в дне организации начинается 30-го в 18:00 UTC. Если бы дата
    // раскрывалась в полночь UTC, платёж 31-го оставался бы в окне — но и
    // платёж 1 августа тоже, а он уже в следующей ведомости.
    const { lines } = run({
      rules: [rule({ components: percent(10000) })],
      incomeTx: [income(100, { date: '2026-07-31' }), income(700, { date: '2026-08-01' })],
    });
    expect(lines[0].components[0].basis.grossMinor).toBe(10_000);
  });

  it('транзакция с нечитаемой датой пропускается, а не роняет расчёт', () => {
    const { lines } = run({
      rules: [rule({ components: percent(10000) })],
      incomeTx: [income(100), income(900, { date: 'какая-то ерунда' })],
    });
    expect(lines[0].components[0].basis.grossMinor).toBe(10_000);
  });
});

// ============================================================
// Разрешение ставок
// ============================================================

describe('разрешение ставок', () => {
  it('одна ставка на преподавателя', () => {
    const { resolved, diagnostics } = resolveRules([rule()]);
    expect(resolved.size).toBe(1);
    expect(diagnostics).toEqual([]);
  });

  it('две ставки на одного человека НИКОГДА не суммируются — выбор детерминирован и назван', () => {
    const a = rule({ id: 'rA', components: fixed(100_000) });
    const b = rule({ id: 'rB', components: fixed(700_000) });

    for (const order of [[a, b], [b, a]]) {
      const { lines } = run({ rules: order });
      expect(lines).toHaveLength(1);
      // Правок не было ни у одной — тай-брейк по id, а не сумма 800 000.
      expect(lines[0].computedMinor).toBe(100_000);
      expect(codes(lines[0].diagnostics)).toContain('duplicate_rules');
    }
  });

  it('из двойников побеждает ПОСЛЕДНЯЯ отредактированная, а не та, у кого id меньше', () => {
    // Ровно те id, что оставила филиальная модель: канонический документ
    // называется `..._org`, филиальный — `..._alay`, и 'a' < 'o'. Прежний выбор
    // «меньший id» означал, что директор правит ставку, а начисляется старая.
    const legacyBranch = rule({
      id: 'rate_org1_t1_alay', components: fixed(100_000), updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const canonical = rule({
      id: 'rate_org1_t1_org', components: fixed(700_000), updatedAt: '2026-08-01T00:00:00.000Z',
    });

    for (const order of [[legacyBranch, canonical], [canonical, legacyBranch]]) {
      const { resolved } = resolveRules(order);
      expect(resolved.get('t1')!.id).toBe('rate_org1_t1_org');
      // Платим по тому, что человек трогал последним.
      expect(run({ rules: order }).lines[0].computedMinor).toBe(700_000);
    }
  });

  it('строки идут в детерминированном порядке', () => {
    const mk = () =>
      run({
        rules: [
          rule({ id: 'r3', teacherId: 'tC', components: fixed(1) }),
          rule({ id: 'r1', teacherId: 'tA', components: fixed(1) }),
          rule({ id: 'r2', teacherId: 'tB', components: fixed(1) }),
        ],
      }).lines.map((l) => l.teacherId);
    expect(mk()).toEqual(['tA', 'tB', 'tC']);
    expect(mk()).toEqual(mk());
  });

  it('замораживает снимок ставки и состав групп для расчётного листа', () => {
    const { lines } = run({
      rules: [rule({ id: 'rX', components: fixed(42) })],
      groups: [group({ id: 'g1' }), group({ id: 'g2' })],
    });
    expect(lines[0].ruleSnapshot).toEqual({
      ruleId: 'rX',
      components: [{ kind: 'salary', amountMinor: 42 }],
      groupIds: ['g1', 'g2'],
    });
  });

  it('ставка без оплаты даёт ноль с диагностикой', () => {
    const { lines, diagnostics } = run({ rules: [rule({ components: [] })] });
    expect(lines[0].computedMinor).toBe(0);
    expect(codes(diagnostics)).toContain('rule_no_components');
  });

  it('устаревший вид оплаты не начисляется и не молчит', () => {
    const { lines, diagnostics } = run({
      // Ставка из прежней модели, пережившая удаление посессионных видов.
      rules: [rule({ components: [{ kind: 'per_hour', amountMinor: 50_000 } as any] })],
    });
    expect(lines[0].computedMinor).toBe(0);
    expect(codes(diagnostics)).toContain('rule_no_components');
  });
});

// ============================================================
// Преподаватель без ставки
// ============================================================

describe('преподаватель без ставки', () => {
  it('не даёт строку, но попадает в список «нет ставки»', () => {
    const { lines, diagnostics } = run({
      rules: [rule({ teacherId: 't1', components: percent(1000) })],
      groups: [group({ id: 'g1', teacherIds: ['t1'] }), group({ id: 'g2', teacherIds: ['t2'] })],
    });
    expect(lines.map((l) => l.teacherId)).toEqual(['t1']);

    const d = diagnostics.find((x) => x.code === 'teacher_without_rule');
    expect(d).toBeDefined();
    expect(d!.count).toBe(1);
    expect(d!.sample).toEqual(['t2']);
  });

  it('knownTeacherIds делает список полным даже без единой группы', () => {
    const { diagnostics } = run({
      rules: [rule({ teacherId: 't1', components: fixed(1) })],
      groups: [],
      knownTeacherIds: ['t1', 't2', 't3'],
    });
    const d = diagnostics.find((x) => x.code === 'teacher_without_rule');
    expect(d!.count).toBe(2);
    expect(d!.sample).toEqual(['t2', 't3']);
  });

  it('молчит, когда у всех есть ставка', () => {
    const { diagnostics } = run({
      rules: [rule({ teacherId: 't1', components: fixed(1) })],
      knownTeacherIds: ['t1'],
    });
    expect(codes(diagnostics)).not.toContain('teacher_without_rule');
  });
});

// ============================================================
// Разложение начисленного по филиалам
// ============================================================

/**
 * Расчёт филиалом не сужается, но готовая сумма по филиалам РАСКЛАДЫВАЕТСЯ:
 * иначе здание, где преподаватель отработал месяц, показывает прибыль без своей
 * главной статьи затрат. Проверяется не «похоже на правду», а два свойства, на
 * которых такие раскладки врут: чем считается вес и куда девается остаток.
 */
describe('buildBranchShares — веса филиалов', () => {
  const branches = (pairs: [string, string | null][]) => new Map<string, string | null>(pairs);

  it('вес — ДЕНЬГИ филиала, а не число групп', () => {
    const shares = buildBranchShares(
      ['g1', 'g2', 'g3'],
      [{ id: 'g1', paidMinor: 600_000 }, { id: 'g2', paidMinor: 400_000 }],
      branches([['g1', 'A'], ['g2', 'B'], ['g3', 'A']]),
    );
    // Филиал A — две группы, но принесла деньги только одна; вес всё равно
    // денежный, иначе зарплата уехала бы туда, где просто больше строк.
    expect(shares).toEqual([
      { branchId: 'A', weight: 600_000, groupIds: ['g1', 'g3'] },
      { branchId: 'B', weight: 400_000, groupIds: ['g2'] },
    ]);
  });

  it('денег не было ни в одном филиале — вес вырождается в число групп', () => {
    // Чистый оклад или месяц без оплат: делить нечем, но свалить всю сумму в
    // один филиал значило бы соврать отчёту ровно так же.
    const shares = buildBranchShares(
      ['g1', 'g2', 'g3'],
      [],
      branches([['g1', 'A'], ['g2', 'B'], ['g3', 'A']]),
    );
    expect(shares.map((s) => [s.branchId, s.weight])).toEqual([['A', 2], ['B', 1]]);
  });

  it('отрицательный срез клампится в ноль и не переворачивает распределение', () => {
    // Возвратов по группе больше, чем сборов. Отрицательный вес увёл бы деньги в
    // чужой филиал — с точки зрения кассы это перевод между зданиями из ниоткуда.
    const shares = buildBranchShares(
      ['g1', 'g2'],
      [{ id: 'g2', paidMinor: 100_000 }, { id: 'g1', paidMinor: -50_000 }],
      branches([['g1', 'A'], ['g2', 'B']]),
    );
    expect(shares.map((s) => s.weight)).toEqual([0, 100_000]);
    expect(allocateByShares(300, shares).map((a) => a.amountMinor)).toEqual([0, 300]);
  });

  it('группа без филиала складывается в отдельную долю с branchId null', () => {
    const shares = buildBranchShares(
      ['g1', 'g2'],
      [{ id: 'g1', paidMinor: 100 }, { id: 'g2', paidMinor: 100 }],
      branches([['g1', null], ['g2', 'B']]),
    );
    expect(shares.map((s) => s.branchId)).toEqual([null, 'B']);
  });

  it('без групп раскладывать нечего', () => {
    expect(buildBranchShares([], [{ id: 'g1', paidMinor: 100 }], branches([['g1', 'A']]))).toEqual([]);
  });
});

describe('allocateByShares — сумма долей равна распределяемой', () => {
  const share = (branchId: string | null, weight: number): BranchShare => ({ branchId, weight, groupIds: [] });

  it('остаток раздаётся, а не теряется: 100 на веса 1:1:1', () => {
    const parts = allocateByShares(100, [share('A', 1), share('B', 1), share('C', 1)]);
    // Наивное округление каждой доли дало бы 33+33+33 = 99, и расход в кассе
    // разошёлся бы с начислением на тыйын.
    expect(parts.reduce((s, p) => s + p.amountMinor, 0)).toBe(100);
    // Наибольший остаток при полной ничьей — детерминированный тай-брейк по
    // филиалу, чтобы повтор выплаты дал те же числа.
    expect(parts.map((p) => p.amountMinor)).toEqual([34, 33, 33]);
  });

  it('сходится на любых весах и суммах', () => {
    for (const total of [1, 7, 999, 3_200_001]) {
      const parts = allocateByShares(total, [share('A', 7), share('B', 3), share('C', 11)]);
      expect(parts.reduce((s, p) => s + p.amountMinor, 0)).toBe(total);
    }
  });

  it('единственная доля забирает всё', () => {
    expect(allocateByShares(3_200_000, [share('A', 0)])).toEqual([
      { branchId: 'A', weight: 0, groupIds: [], amountMinor: 3_200_000 },
    ]);
  });

  it('все веса нулевые — сумма уходит первой доле, а не растворяется', () => {
    const parts = allocateByShares(500, [share('A', 0), share('B', 0)]);
    expect(parts.map((p) => p.amountMinor)).toEqual([500, 0]);
  });

  it('без долей не выдумывает получателя', () => {
    expect(allocateByShares(500, [])).toEqual([]);
  });
});
