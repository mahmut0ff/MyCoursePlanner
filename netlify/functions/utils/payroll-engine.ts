/**
 * Чистое ядро расчёта зарплаты — БЕЗ Firestore, БЕЗ I/O, без побочных эффектов.
 *
 * Изоляция намеренная: это та часть, которая должна быть доказуемо правильной,
 * поэтому она обязана покрываться юнит-тестами без мока базы. Эндпоинт
 * (api-payroll) отвечает за выборку и запись; здесь — только арифметика.
 *
 * Три вещи, ради которых этот файл выглядит именно так:
 *
 * 1. ДЕНЬГИ — ЦЕЛЫЕ МИНОРНЫЕ ЕДИНИЦЫ ОТ ВХОДА ДО ВЫХОДА. `FinancialTransaction.
 *    amount` хранится в сомах (float), поэтому конвертация сом→тыйын происходит
 *    ровно один раз, на границе (toMinor), а дальше вся математика целочисленная.
 *    Процент и часы НИКОГДА не считаются float-умножением — см. divRoundHalfUp.
 *    Округление ОДИН раз, HALF_UP, на строке заработка: округлять каждую
 *    транзакцию отдельно значит копить копеечный дрейф в зарплате человека.
 *
 * 2. НИКОГДА НЕ ВЫДУМЫВАТЬ ЧИСЛО. per_lesson/per_hour/per_student читают только
 *    lessonSessions со status 'held'. Сессия с teacherId === null не принадлежит
 *    никому (у группы несколько учителей и никто не выбран) — она пропускается, а
 *    не приписывается тому, кто отметил журнал. Сессия с durationMinutes === null
 *    не почасовая. Нехватка данных = видимый ноль + явная диагностика.
 *
 * 3. ДИАГНОСТИКИ — ПОЛНОЦЕННАЯ ФУНКЦИЯ, А НЕ ЛОГИ. Каждый пропущенный или
 *    неатрибутируемый вход возвращается структурно, чтобы UI показал
 *    «Пропущенные записи». Директор должен видеть, ПОЧЕМУ сумма меньше
 *    ожидаемой, а не гадать.
 *
 * Типы ниже — зеркало src/types/index.ts (LessonSession, RuleScope, PayComponent,
 * CompensationRule). netlify/functions ни на что из src/ не ссылается (см.
 * api-finance-plans.ts, где так же продублирован PaymentStatus) — tsconfig.
 * functions.json включает только netlify/functions/**. Держите синхронно.
 */

// ============================================================
// Входные структурные типы (зеркало src/types/index.ts)
// ============================================================

/** Область действия компонента. Пусто/отсутствует = все курсы учителя. */
export interface RuleScope {
  courseIds?: string[];
  groupIds?: string[];
}

/** Компонент ставки. Сумма компонентов = заработок правила. */
export type PayComponent =
  | { kind: 'salary'; amountMinor: number }
  | { kind: 'percent_revenue'; percentBp: number; base: 'collected'; scope: RuleScope }
  | { kind: 'per_lesson'; amountMinor: number; scope: RuleScope }
  | { kind: 'per_hour'; amountMinor: number; scope: RuleScope }
  | { kind: 'per_student'; amountMinor: number; scope: RuleScope };

/** Карточка ставки, датированная периодом действия ('YYYY-MM', обе границы включительно). */
export interface CompensationRule {
  id: string;
  organizationId?: string;
  teacherId: string;
  branchId?: string | null;
  label?: string;
  status: 'active' | 'archived';
  components: PayComponent[];
  effectiveFrom: string;
  effectiveTo: string | null;
  supersedesId?: string | null;
}

/**
 * Финансовая транзакция в том виде, в каком её отдаёт Firestore.
 * `amount` — В СОМАХ (так хранится), конвертация в минорные единицы здесь.
 */
export interface FinanceTxLike {
  id: string;
  amount: number;
  date: string;
  type?: string;
  categoryId?: string;
  groupId?: string | null;
  courseId?: string | null;
  studentId?: string | null;
  paymentPlanId?: string | null;
}

/** Запись «урок состоялся». Единственный источник для per_lesson/per_hour/per_student. */
export interface LessonSessionLike {
  id: string;
  groupId?: string | null;
  courseId?: string | null;
  /** null = не определён (несколько учителей, никто не выбран). НИКОГДА не из createdBy. */
  teacherId: string | null;
  date: string;
  /** null = неизвестна → не почасовая. */
  durationMinutes: number | null;
  status: 'held' | 'cancelled';
  headcount?: number;
}

// ============================================================
// Выходные типы
// ============================================================

/** Коды диагностик. Стабильны — UI и тесты завязаны на них. */
export type DiagnosticCode =
  | 'session_no_teacher'
  | 'session_no_duration'
  | 'percent_scope_empty'
  | 'percent_base_negative'
  | 'revenue_unattributed'
  | 'teacher_without_rule'
  | 'overlapping_rules'
  | 'rule_no_components';

/**
 * Структурная диагностика для блока «Пропущенные записи».
 * `message` — по-русски, показывается директору дословно.
 */
export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  count: number;
  /** До 5 id для перехода к первопричине. */
  sample?: string[];
  teacherId?: string;
  ruleId?: string;
}

/**
 * Литеральные входы компонента — то, что замораживается в PayrollLine.ruleSnapshot.
 * Директор должен восстановить число, не пересчитывая: отсюда sourceTxnIds/
 * sourceSessionIds и промежуточные grossMinor/refundMinor.
 */
export interface ComponentBasis {
  amountMinor?: number;
  percentBp?: number;
  base?: 'collected';
  scope?: RuleScope;
  /** Собрано в окне по scope (минорные единицы). */
  grossMinor?: number;
  /** Возвраты в окне по тому же scope (положительное число, вычитается). */
  refundMinor?: number;
  /** gross − refund, с клампом в ноль. Именно от него берётся процент. */
  revenueBaseMinor?: number;
  sourceTxnIds?: string[];
  sessionCount?: number;
  minutesTotal?: number;
  studentTotal?: number;
  sourceSessionIds?: string[];
}

export interface ComputedComponent {
  kind: PayComponent['kind'];
  earnedMinor: number;
  basis: ComponentBasis;
  diagnostics: Diagnostic[];
}

export interface ComputedLine {
  teacherId: string;
  ruleId: string;
  /** Замороженное разрешённое правило — источник PayrollLine.ruleSnapshot. */
  ruleSnapshot: {
    ruleId: string;
    label: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    components: PayComponent[];
  };
  computedMinor: number;
  components: ComputedComponent[];
  diagnostics: Diagnostic[];
}

export interface PayrollInputs {
  /** 'YYYY-MM' — период начисления (семантика billingPeriodKey). */
  period: string;
  /** ISO-границы окна собранной выручки и сессий. ОБЕ ВКЛЮЧИТЕЛЬНО. */
  windowStart: string;
  windowEnd: string;
  /** Правила организации; активное на период выбирается здесь. */
  rules: CompensationRule[];
  /** Доходные транзакции в окне (уже отфильтрованы по орг./филиалу). */
  incomeTx: FinanceTxLike[];
  /** Возвраты в окне — уменьшают базу процента. Знак суммы не важен. */
  refundTx: FinanceTxLike[];
  /** lessonSessions в окне. */
  sessions: LessonSessionLike[];
  /**
   * Полный список учителей организации, необязательный. Нужен только чтобы
   * список «нет ставки» был полным: без него учитель попадёт в диагностику,
   * только если у него есть проведённые сессии в окне.
   */
  knownTeacherIds?: string[];
}

export interface PayrollResult {
  lines: ComputedLine[];
  /** Все диагностики: и построчные, и глобальные. UI показывает одним списком. */
  diagnostics: Diagnostic[];
}

// ============================================================
// Арифметика денег
// ============================================================

const SAMPLE_LIMIT = 5;

/**
 * HALF_UP = ничья уходит ОТ нуля (семантика BigDecimal.ROUND_HALF_UP).
 * Math.round для отрицательных округляет к +∞ (Math.round(-2.5) === -2), из-за
 * чего штраф и премия одинаковой величины округлились бы по-разному.
 */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Целочисленное деление с округлением HALF_UP — БЕЗ float-умножения.
 *
 * Ради этого и написано: `base * percentBp / 10000` через float даёт разные
 * копейки на разных суммах, а `hours * amountMinor` — тем более (1/60 в двоичной
 * дроби непредставима). Здесь числитель считается точно в целых, а деление с
 * остатком даёт ровно одно детерминированное округление.
 */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  const negative = (numerator < 0) !== (denominator < 0);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  const q = Math.floor(n / d);
  const remainder = n - q * d;
  // remainder*2 >= d — ничья и выше уходит вверх по модулю, то есть от нуля.
  const magnitude = remainder * 2 >= d ? q + 1 : q;
  return negative ? -magnitude : magnitude;
}

/**
 * Сомы (float из Firestore) → тыйын (целое). Единственная точка конвертации.
 *
 * toPrecision(15) сначала сдувает представленческую пыль double: 1.005 * 100 в
 * IEEE-754 равно 100.49999999999999, и наивный Math.round дал бы 100 вместо 101 —
 * то есть тыйын, потерянный на ровном месте в чужой зарплате.
 */
export function toMinor(som: number): number {
  if (!Number.isFinite(som)) return 0;
  return roundHalfUp(Number((som * 100).toPrecision(15)));
}

// ============================================================
// Окно и scope
// ============================================================

/**
 * Момент времени для сравнения с окном. Принимает и голую 'YYYY-MM-DD', и полный
 * ISO — ровно как parseRangeBoundary в finance-period.ts: голая дата
 * раскрывается в локальную полночь, чтобы окно и лента размечали день одинаково.
 */
function toEpochMs(raw: string): number {
  const value = String(raw ?? '').trim();
  if (!value) return NaN;
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Date(isBareDate ? `${value}T00:00:00` : value).getTime();
}

/**
 * Границы окна как календарный день 'YYYY-MM-DD' по ЛОКАЛЬНОЙ зоне.
 *
 * Резать ISO-строку посимвольно здесь нельзя, и это не мелочь. getPeriodRange
 * (finance-period.ts) строит окно от локальной полуночи и только потом зовёт
 * toISOString(): в Бишкеке (UTC+6) начало июля превращается в
 * '2026-06-30T18:00:00.000Z', и наивный slice(0,10) дал бы '2026-06-30' —
 * занятия 30 июня попали бы в июльскую зарплату. Разбор обратно в локальные
 * компоненты — точная инверсия того, как окно собрали, поэтому он
 * round-trip'ится и в UTC (CI), и в зоне академии.
 */
function toLocalDay(raw: string): string {
  const ms = toEpochMs(raw);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Транзакция внутри окна. ОБЕ границы включительно. */
function txInWindow(tx: FinanceTxLike, startMs: number, endMs: number): boolean {
  const ms = toEpochMs(tx.date);
  if (Number.isNaN(ms)) return false;
  return ms >= startMs && ms <= endMs;
}

/**
 * Сессия внутри окна — сравнение СТРОК 'YYYY-MM-DD', а не моментов.
 *
 * Сессия суточной точности, окно — мгновения. Гонять её через часовые пояса
 * значит рисковать тем, что урок 31-го числа выпадет из июля из-за смещения
 * зоны сервера. Директор мыслит «уроки за июль», и лексикографическое сравнение
 * дат даёт ровно это, независимо от TZ.
 */
function sessionInWindow(session: LessonSessionLike, startDay: string, endDay: string): boolean {
  const day = String(session.date ?? '').slice(0, 10);
  if (!day) return false;
  return day >= startDay && day <= endDay;
}

/** Scope без единого id — «все курсы учителя». */
function isScopeEmpty(scope: RuleScope | undefined): boolean {
  return !(scope?.groupIds?.length) && !(scope?.courseIds?.length);
}

/**
 * Совпадение со scope. Приоритет: groupIds важнее courseIds — группа точнее
 * курса, и если названы обе, имелась в виду группа.
 * Пустой scope = совпадает со всем (вызывающий решает, законно ли это здесь).
 */
function matchesScope(
  scope: RuleScope | undefined,
  groupId: string | null | undefined,
  courseId: string | null | undefined,
): boolean {
  const groupIds = scope?.groupIds ?? [];
  const courseIds = scope?.courseIds ?? [];
  if (groupIds.length) return !!groupId && groupIds.includes(groupId);
  if (courseIds.length) return !!courseId && courseIds.includes(courseId);
  return true;
}

function sample(ids: string[]): string[] {
  return ids.slice(0, SAMPLE_LIMIT);
}

// ============================================================
// Разрешение правил
// ============================================================

/** Правило действует в периоде: строковое сравнение 'YYYY-MM' здесь корректно и намеренно. */
function isRuleActiveForPeriod(rule: CompensationRule, period: string): boolean {
  if (rule.status !== 'active') return false;
  if (!rule.effectiveFrom || rule.effectiveFrom > period) return false;
  const to = rule.effectiveTo;
  if (to !== null && to !== undefined && period > to) return false;
  return true;
}

/**
 * Одно активное правило на учителя на период — это инвариант записи. Если их
 * два, это ошибка данных: суммировать их МОЛЧА нельзя (человек получил бы
 * двойную ставку), поэтому выбираем детерминированно — свежайший effectiveFrom,
 * при равенстве меньший id — и обязательно сообщаем.
 */
export function resolveRules(
  rules: CompensationRule[],
  period: string,
): { resolved: Map<string, CompensationRule>; diagnostics: Diagnostic[] } {
  const byTeacher = new Map<string, CompensationRule[]>();
  for (const rule of rules) {
    if (!rule || !rule.teacherId) continue;
    if (!isRuleActiveForPeriod(rule, period)) continue;
    const list = byTeacher.get(rule.teacherId) ?? [];
    list.push(rule);
    byTeacher.set(rule.teacherId, list);
  }

  const resolved = new Map<string, CompensationRule>();
  const diagnostics: Diagnostic[] = [];

  for (const [teacherId, list] of byTeacher) {
    const sorted = [...list].sort((a, b) => {
      if (a.effectiveFrom !== b.effectiveFrom) return a.effectiveFrom < b.effectiveFrom ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    resolved.set(teacherId, sorted[0]);
    if (sorted.length > 1) {
      diagnostics.push({
        code: 'overlapping_rules',
        message:
          `У преподавателя несколько действующих ставок на ${period} (${sorted.length}). ` +
          `Взята самая поздняя (${sorted[0].effectiveFrom}); остальные проигнорированы. Закройте лишние.`,
        count: sorted.length,
        sample: sample(sorted.map((r) => r.id)),
        teacherId,
        ruleId: sorted[0].id,
      });
    }
  }

  return { resolved, diagnostics };
}

// ============================================================
// Компоненты
// ============================================================

/**
 * % от СОБРАННОЙ наличности: база = доходы в окне по scope МИНУС возвраты в окне
 * по тому же scope.
 *
 * Пустой scope здесь НЕ значит «все курсы учителя», в отличие от посессионных
 * компонентов. Причина ассиметрии: у сессии есть teacherId, а у выручки его нет.
 * Пустой scope на проценте молча забрал бы выручку ВСЕЙ организации в базу
 * одного человека, поэтому это ноль с диагностикой, а не догадка.
 */
function computePercentRevenue(
  component: Extract<PayComponent, { kind: 'percent_revenue' }>,
  incomeTx: FinanceTxLike[],
  refundTx: FinanceTxLike[],
  ctx: { teacherId: string; ruleId: string; consumedTxIds: Set<string> },
): ComputedComponent {
  const diagnostics: Diagnostic[] = [];
  const scope = component.scope;

  if (isScopeEmpty(scope)) {
    diagnostics.push({
      code: 'percent_scope_empty',
      message:
        'У процентного компонента не выбраны группы или курсы. Выручка не привязана к преподавателю, ' +
        'поэтому пустая область даёт 0 — укажите группы или курсы в ставке.',
      count: 1,
      teacherId: ctx.teacherId,
      ruleId: ctx.ruleId,
    });
    return {
      kind: 'percent_revenue',
      earnedMinor: 0,
      basis: {
        percentBp: component.percentBp,
        base: component.base,
        scope: scope ?? {},
        grossMinor: 0,
        refundMinor: 0,
        revenueBaseMinor: 0,
        sourceTxnIds: [],
      },
      diagnostics,
    };
  }

  const matchedIncome = incomeTx.filter((tx) => matchesScope(scope, tx.groupId, tx.courseId));
  const matchedRefunds = refundTx.filter((tx) => matchesScope(scope, tx.groupId, tx.courseId));

  // Суммируем в ЦЕЛЫХ минорных единицах: каждая транзакция конвертируется один
  // раз, процент берётся от суммы. Брать процент с каждой транзакции отдельно
  // значило бы округлять N раз и копить расхождение.
  let grossMinor = 0;
  for (const tx of matchedIncome) grossMinor += toMinor(tx.amount);
  // Возврат в базе хранится положительной суммой на расходной строке; abs
  // защищает и от вызывающего, который передаст его уже со знаком минус.
  let refundMinor = 0;
  for (const tx of matchedRefunds) refundMinor += Math.abs(toMinor(tx.amount));

  const netMinor = grossMinor - refundMinor;
  // Кламп в ноль: возвраты больше сборов НЕ превращаются в отрицательный
  // заработок и не отбирают уже выданное. Продукт: «никогда не clawback».
  const revenueBaseMinor = Math.max(0, netMinor);
  if (netMinor < 0) {
    diagnostics.push({
      code: 'percent_base_negative',
      message:
        `Возвраты превысили сборы по этой области (${(netMinor / 100).toFixed(2)} с.). ` +
        'Компонент обнулён — удержания из зарплаты не делаются.',
      count: matchedRefunds.length,
      sample: sample(matchedRefunds.map((tx) => tx.id)),
      teacherId: ctx.teacherId,
      ruleId: ctx.ruleId,
    });
  }

  for (const tx of matchedIncome) ctx.consumedTxIds.add(tx.id);

  return {
    kind: 'percent_revenue',
    // Единственное округление: целочисленный числитель / 10000, HALF_UP.
    earnedMinor: divRoundHalfUp(revenueBaseMinor * component.percentBp, 10000),
    basis: {
      percentBp: component.percentBp,
      base: component.base,
      scope,
      grossMinor,
      refundMinor,
      revenueBaseMinor,
      sourceTxnIds: matchedIncome.map((tx) => tx.id),
    },
    diagnostics,
  };
}

/**
 * Сессии, за которые платят по этому компоненту: только 'held', только этого
 * учителя, только в scope. Сессия с teacherId === null не принадлежит никому и
 * сюда не попадает ни при каком scope — глобальная диагностика о ней есть
 * отдельно, в computePayroll.
 */
function billableSessions(
  sessions: LessonSessionLike[],
  teacherId: string,
  scope: RuleScope | undefined,
): LessonSessionLike[] {
  return sessions.filter(
    (s) =>
      s.status === 'held' &&
      // Проверка на null формально избыточна (null никогда не равен непустому
      // teacherId правила), но оставлена намеренно: это и есть правило «сессия без
      // учителя не принадлежит никому», и оно не должно молча зависеть от того,
      // как когда-нибудь перепишут сравнение строкой ниже.
      s.teacherId !== null &&
      s.teacherId === teacherId &&
      matchesScope(scope, s.groupId, s.courseId),
  );
}

function computePerLesson(
  component: Extract<PayComponent, { kind: 'per_lesson' }>,
  sessions: LessonSessionLike[],
  teacherId: string,
): ComputedComponent {
  const matched = billableSessions(sessions, teacherId, component.scope);
  return {
    kind: 'per_lesson',
    earnedMinor: matched.length * component.amountMinor,
    basis: {
      amountMinor: component.amountMinor,
      scope: component.scope,
      sessionCount: matched.length,
      sourceSessionIds: matched.map((s) => s.id),
    },
    diagnostics: [],
  };
}

/**
 * Почасовая: amountMinor за 60 минут. Сессия без durationMinutes НЕ почасовая —
 * подставить «обычные 90 минут» значило бы выдумать деньги, поэтому она
 * исключается и обязательно называется в диагностике с количеством.
 */
function computePerHour(
  component: Extract<PayComponent, { kind: 'per_hour' }>,
  sessions: LessonSessionLike[],
  ctx: { teacherId: string; ruleId: string },
): ComputedComponent {
  const matched = billableSessions(sessions, ctx.teacherId, component.scope);
  const withDuration = matched.filter((s) => typeof s.durationMinutes === 'number');
  const skipped = matched.filter((s) => typeof s.durationMinutes !== 'number');

  const minutesTotal = withDuration.reduce((sum, s) => sum + (s.durationMinutes as number), 0);

  const diagnostics: Diagnostic[] = [];
  if (skipped.length) {
    diagnostics.push({
      code: 'session_no_duration',
      message:
        `Пропущено занятий без указанной длительности: ${skipped.length}. ` +
        'Почасовая оплата по ним не начислена — проставьте длительность в журнале.',
      count: skipped.length,
      sample: sample(skipped.map((s) => s.id)),
      teacherId: ctx.teacherId,
      ruleId: ctx.ruleId,
    });
  }

  return {
    kind: 'per_hour',
    // minutesTotal * amountMinor — точное целое; делим на 60 с единственным HALF_UP.
    earnedMinor: divRoundHalfUp(minutesTotal * component.amountMinor, 60),
    basis: {
      amountMinor: component.amountMinor,
      scope: component.scope,
      sessionCount: withDuration.length,
      minutesTotal,
      sourceSessionIds: withDuration.map((s) => s.id),
    },
    diagnostics,
  };
}

function computePerStudent(
  component: Extract<PayComponent, { kind: 'per_student' }>,
  sessions: LessonSessionLike[],
  teacherId: string,
): ComputedComponent {
  const matched = billableSessions(sessions, teacherId, component.scope);
  const studentTotal = matched.reduce((sum, s) => sum + (s.headcount || 0), 0);
  return {
    kind: 'per_student',
    earnedMinor: studentTotal * component.amountMinor,
    basis: {
      amountMinor: component.amountMinor,
      scope: component.scope,
      sessionCount: matched.length,
      studentTotal,
      sourceSessionIds: matched.map((s) => s.id),
    },
    diagnostics: [],
  };
}

// ============================================================
// Главная функция
// ============================================================

/**
 * Считает строки ведомости по уже выбранным данным.
 *
 * Контракт: одна строка на КАЖДОЕ разрешённое активное правило — даже при нулевой
 * активности. Пустая строка это сигнал «ставка отработала, начислять было не с
 * чего», а её отсутствие директор прочитает как сбой расчёта.
 *
 * Окно применяется здесь ещё раз, хотя вызывающий уже отфильтровал выборку: обе
 * границы ВКЛЮЧИТЕЛЬНЫ, и это свойство должно принадлежать ядру, а не эндпоинту,
 * чтобы платёж ровно на границе периода нельзя было потерять незаметно.
 */
export function computePayroll(inputs: PayrollInputs): PayrollResult {
  const startMs = toEpochMs(inputs.windowStart);
  const endMs = toEpochMs(inputs.windowEnd);
  const startDay = toLocalDay(inputs.windowStart);
  const endDay = toLocalDay(inputs.windowEnd);

  const incomeTx = (inputs.incomeTx ?? []).filter((tx) => txInWindow(tx, startMs, endMs));
  const refundTx = (inputs.refundTx ?? []).filter((tx) => txInWindow(tx, startMs, endMs));
  const sessions = (inputs.sessions ?? []).filter((s) => sessionInWindow(s, startDay, endDay));

  const { resolved, diagnostics: ruleDiagnostics } = resolveRules(inputs.rules ?? [], inputs.period);

  const globalDiagnostics: Diagnostic[] = [];
  const consumedTxIds = new Set<string>();
  let hasPercentComponent = false;

  const lines: ComputedLine[] = [];
  // Детерминированный порядок строк — от него зависит воспроизводимость расчёта.
  const teacherIds = [...resolved.keys()].sort();

  for (const teacherId of teacherIds) {
    const rule = resolved.get(teacherId)!;
    const components: ComputedComponent[] = [];
    const lineDiagnostics: Diagnostic[] = ruleDiagnostics.filter((d) => d.teacherId === teacherId);

    const ruleComponents = Array.isArray(rule.components) ? rule.components : [];
    if (!ruleComponents.length) {
      lineDiagnostics.push({
        code: 'rule_no_components',
        message: 'В ставке нет ни одного компонента — начислять нечего. Отредактируйте ставку.',
        count: 1,
        teacherId,
        ruleId: rule.id,
      });
    }

    for (const component of ruleComponents) {
      switch (component.kind) {
        case 'salary':
          // Оклад платится всегда: это и значит «фиксированный». Найм в середине
          // месяца даёт полный месяц на периоде effectiveFrom — директор мыслит
          // целыми месяцами, и так же начисляет monthly-billing.
          components.push({
            kind: 'salary',
            earnedMinor: component.amountMinor,
            basis: { amountMinor: component.amountMinor },
            diagnostics: [],
          });
          break;
        case 'percent_revenue':
          hasPercentComponent = true;
          components.push(
            computePercentRevenue(component, incomeTx, refundTx, {
              teacherId,
              ruleId: rule.id,
              consumedTxIds,
            }),
          );
          break;
        case 'per_lesson':
          components.push(computePerLesson(component, sessions, teacherId));
          break;
        case 'per_hour':
          components.push(computePerHour(component, sessions, { teacherId, ruleId: rule.id }));
          break;
        case 'per_student':
          components.push(computePerStudent(component, sessions, teacherId));
          break;
        default:
          break;
      }
    }

    for (const c of components) lineDiagnostics.push(...c.diagnostics);

    lines.push({
      teacherId,
      ruleId: rule.id,
      ruleSnapshot: {
        ruleId: rule.id,
        label: rule.label ?? '',
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo ?? null,
        components: ruleComponents,
      },
      // Компоненты складываются: «оклад + %» — одно правило, две строки расчёта.
      computedMinor: components.reduce((sum, c) => sum + c.earnedMinor, 0),
      components,
      diagnostics: lineDiagnostics,
    });
  }

  // --- Глобальные диагностики -------------------------------------------

  // Сессии без учителя: не начислены НИКОМУ и никогда не будут, пока в журнале
  // не выберут преподавателя.
  const orphanSessions = sessions.filter((s) => s.status === 'held' && s.teacherId === null);
  if (orphanSessions.length) {
    globalDiagnostics.push({
      code: 'session_no_teacher',
      message:
        `Занятий без указанного преподавателя: ${orphanSessions.length}. ` +
        'Они не начислены никому — выберите преподавателя в журнале.',
      count: orphanSessions.length,
      sample: sample(orphanSessions.map((s) => s.id)),
    });
  }

  // Учителя без ставки: строки нет, поэтому единственный способ их увидеть —
  // список «нет ставки».
  const activeTeacherIds = new Set<string>();
  for (const s of sessions) {
    if (s.status === 'held' && s.teacherId) activeTeacherIds.add(s.teacherId);
  }
  for (const id of inputs.knownTeacherIds ?? []) activeTeacherIds.add(id);
  const withoutRule = [...activeTeacherIds].filter((id) => !resolved.has(id)).sort();
  if (withoutRule.length) {
    globalDiagnostics.push({
      code: 'teacher_without_rule',
      message:
        `Преподавателей без действующей ставки на ${inputs.period}: ${withoutRule.length}. ` +
        'Им ничего не начислено — заведите ставку.',
      count: withoutRule.length,
      sample: sample(withoutRule),
    });
  }

  // Выручка мимо всех областей. Сообщаем, ТОЛЬКО если процентные компоненты
  // вообще есть: в академии на чистых окладах вся выручка «ничья» по
  // определению, и такая диагностика была бы шумом на пустом месте.
  if (hasPercentComponent) {
    const unattributed = incomeTx.filter((tx) => !consumedTxIds.has(tx.id));
    if (unattributed.length) {
      const totalMinor = unattributed.reduce((sum, tx) => sum + toMinor(tx.amount), 0);
      globalDiagnostics.push({
        code: 'revenue_unattributed',
        message:
          `Платежей вне областей действия ставок: ${unattributed.length} на ${(totalMinor / 100).toFixed(2)} с. ` +
          'С них процент не начислен — проверьте группы и курсы в ставках.',
        count: unattributed.length,
        sample: sample(unattributed.map((tx) => tx.id)),
      });
    }
  }

  // Один плоский список для UI; построчные копии остаются в line.diagnostics
  // для детализации.
  const diagnostics: Diagnostic[] = [
    ...lines.flatMap((l) => l.diagnostics),
    ...globalDiagnostics,
  ];

  return { lines, diagnostics };
}
