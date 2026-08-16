/**
 * Чистое ядро расчёта зарплаты — БЕЗ Firestore, БЕЗ I/O, без побочных эффектов.
 *
 * Изоляция намеренная: это та часть, которая должна быть доказуемо правильной,
 * поэтому она обязана покрываться юнит-тестами без мока базы. Эндпоинт
 * (api-payroll) отвечает за выборку и запись; здесь — только арифметика.
 *
 * ДВА ВИДА ОПЛАТЫ И БОЛЬШЕ НИКАКИХ. Фиксированная сумма («оклад») и процент от
 * денег, которые реально принесли студенты преподавателя. Оплата за занятие, за
 * час и за голову удалены сознательно: они считались по отметкам посещаемости
 * (lessonSessions), то есть зарплата человека молча зависела от того, ведёт ли
 * кто-то журнал. Директор про такую связь не знает и узнаёт по недоплате.
 *
 * Три вещи, ради которых этот файл выглядит именно так:
 *
 * 1. ДЕНЬГИ — ЦЕЛЫЕ МИНОРНЫЕ ЕДИНИЦЫ ОТ ВХОДА ДО ВЫХОДА. `FinancialTransaction.
 *    amount` хранится в сомах (float), поэтому конвертация сом→тыйын происходит
 *    ровно один раз, на границе (toMinor), а дальше вся математика целочисленная.
 *    Процент НИКОГДА не считается float-умножением — см. divRoundHalfUp.
 *    Округление ОДИН раз, HALF_UP, на строке заработка: округлять каждую
 *    транзакцию отдельно значит копить копеечный дрейф в зарплате человека.
 *
 * 2. ЧЬИ ЭТО ДЕНЬГИ — РЕШАЕТ СОСТАВ ГРУПП, А НЕ НАСТРОЙКА. База процента это
 *    платежи по группам, где преподаватель числится (`Group.teacherIds`).
 *    Раньше область действия отмечалась галочками в карточке ставки, и забытая
 *    галочка давала честный ноль. Теперь спрашивать нечего: выбрал
 *    преподавателя — видно его группы, его студентов и что они заплатили.
 *
 * 3. ДИАГНОСТИКИ — ПОЛНОЦЕННАЯ ФУНКЦИЯ, А НЕ ЛОГИ. Каждый пропущенный или
 *    неатрибутируемый вход возвращается структурно, чтобы UI показал
 *    «Пропущенные записи». Директор должен видеть, ПОЧЕМУ сумма меньше
 *    ожидаемой, а не гадать.
 *
 * Типы ниже — зеркало src/types/index.ts (PayComponent, CompensationRule).
 * netlify/functions ни на что из src/ не ссылается (см. api-finance-plans.ts,
 * где так же продублирован PaymentStatus) — tsconfig.functions.json включает
 * только netlify/functions/**. Держите синхронно.
 */

// ============================================================
// Входные структурные типы (зеркало src/types/index.ts)
// ============================================================

/**
 * Вид оплаты. Ровно два, и это продуктовое решение, а не текущее состояние:
 * директор академии рассуждает «Азизе — двадцать процентов» либо «Азизе —
 * тридцать тысяч». Всё остальное требовало данных, которых в базе нет.
 */
export type PayComponent =
  | { kind: 'salary'; amountMinor: number }
  | { kind: 'percent_revenue'; percentBp: number; base: 'collected' };

/**
 * Ставка преподавателя. БЕЗ срока действия и БЕЗ филиала: ставка одна на
 * (организация, преподаватель) и действует сейчас.
 *
 * Датированных версий больше нет намеренно. История прошлых месяцев защищена не
 * ими, а замороженным снапшотом строки ведомости (PayrollLine.ruleSnapshot) и
 * запретом пересчитывать утверждённый период: правка ставки в августе не может
 * тронуть июльские числа, потому что июль вообще не пересчитывается.
 *
 * Филиала у ставки нет тоже намеренно: преподаватель ведёт группы в нескольких
 * зданиях, и «двадцать процентов» относятся к человеку, а не к адресу. По
 * филиалам раскладывается уже НАЧИСЛЕННОЕ (см. GroupLike.branchId).
 *
 * `updatedAt` не участвует в арифметике — он решает, какая ставка победит, если
 * в базе их осталось несколько от прежней филиальной модели (см. resolveRules).
 */
export interface CompensationRule {
  id: string;
  organizationId?: string;
  teacherId: string;
  components: PayComponent[];
  updatedAt?: string;
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

/**
 * Группа: кто ведёт и кто учится. Единственный источник «чьи это студенты».
 *
 * `branchId` НЕ участвует в расчёте: зарплата общеорганизационная, и сузить по
 * филиалу базу процента значило бы платить ставку всей организации от денег
 * одного здания. Поле нужно только для АТРИБУЦИИ — разложить готовую сумму по
 * филиалам, когда она уже посчитана (преподаватель может вести группы в
 * нескольких филиалах, и расход в кассе обязан это показывать).
 */
export interface GroupLike {
  id: string;
  name?: string;
  courseId?: string | null;
  courseName?: string;
  branchId?: string | null;
  teacherIds?: string[];
  studentIds?: string[];
}

// ============================================================
// Выходные типы
// ============================================================

/** Коды диагностик. Стабильны — UI и тесты завязаны на них. */
export type DiagnosticCode =
  | 'teacher_without_groups'
  | 'percent_base_negative'
  | 'payment_without_group'
  | 'teacher_without_rule'
  | 'duplicate_rules'
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

/** Сколько денег принесла одна группа (или один студент) в окне периода. */
export interface RevenueSlice {
  id: string;
  paidMinor: number;
}

/**
 * Литеральные входы компонента — то, что замораживается в PayrollLine.ruleSnapshot.
 * Директор должен восстановить число, не пересчитывая: отсюда sourceTxnIds,
 * промежуточные grossMinor/refundMinor и разбивка по группам и студентам.
 */
export interface ComponentBasis {
  amountMinor?: number;
  percentBp?: number;
  base?: 'collected';
  /** Собрано в окне по группам преподавателя (минорные единицы). */
  grossMinor?: number;
  /** Возвраты в окне по тем же группам (положительное число, вычитается). */
  refundMinor?: number;
  /** gross − refund, с клампом в ноль. Именно от него берётся процент. */
  revenueBaseMinor?: number;
  /** Группы преподавателя, попавшие в базу, и сколько принесла каждая. */
  byGroup?: RevenueSlice[];
  /** Кто из студентов сколько заплатил. Сумма равна grossMinor. */
  byStudent?: RevenueSlice[];
  sourceTxnIds?: string[];
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
    components: PayComponent[];
    /** Группы преподавателя на момент расчёта: по ним считался процент. */
    groupIds: string[];
  };
  computedMinor: number;
  components: ComputedComponent[];
  diagnostics: Diagnostic[];
}

export interface PayrollInputs {
  /** 'YYYY-MM' — период начисления (семантика billingPeriodKey). */
  period: string;
  /** ISO-границы окна собранной выручки. ОБЕ ВКЛЮЧИТЕЛЬНО. */
  windowStart: string;
  windowEnd: string;
  /** Ставки организации (по одной на преподавателя). */
  rules: CompensationRule[];
  /** Доходные транзакции в окне (уже отфильтрованы по организации). */
  incomeTx: FinanceTxLike[];
  /** Возвраты в окне — уменьшают базу процента. Знак суммы не важен. */
  refundTx: FinanceTxLike[];
  /** Группы организации: из них выводится «его группы» и «его студенты». */
  groups: GroupLike[];
  /**
   * Полный список преподавателей организации, необязательный. Нужен только чтобы
   * список «нет ставки» был полным: без него преподаватель попадёт в диагностику,
   * только если у него есть группы.
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
 * копейки на разных суммах. Здесь числитель считается точно в целых, а деление с
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
// Окно
// ============================================================

/**
 * Смещение календаря организации от UTC (UTC+6, Asia/Bishkek).
 *
 * Дублирует ORG_DAY_UTC_OFFSET_MINUTES из src/lib/payment-plans.ts и
 * ORG_OFFSET_MS из utils/finance-period.ts — ядро расчёта намеренно оставлено
 * без импортов. Появится часовой пояс у организации — менять надо ВСЕ ТРИ.
 */
const ORG_OFFSET_MS = 6 * 60 * 60 * 1000;

/**
 * Момент времени для сравнения с окном. Принимает и голую 'YYYY-MM-DD', и полный
 * ISO — ровно как parseRangeBoundary в finance-period.ts: голая дата
 * раскрывается в полночь ДНЯ ОРГАНИЗАЦИИ, чтобы окно и лента размечали день
 * одинаково. Прежняя локальная полночь на Netlify означала полночь UTC и
 * расходилась с границами окна на шесть часов.
 */
function toEpochMs(raw: string): number {
  const value = String(raw ?? '').trim();
  if (!value) return NaN;
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isBareDate) return new Date(value).getTime();
  const [y, m, d] = value.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - ORG_OFFSET_MS;
}

/** Транзакция внутри окна. ОБЕ границы включительно. */
function txInWindow(tx: FinanceTxLike, startMs: number, endMs: number): boolean {
  const ms = toEpochMs(tx.date);
  if (Number.isNaN(ms)) return false;
  return ms >= startMs && ms <= endMs;
}

/**
 * Окно как предикат для вызывающего. Экспортируется, чтобы экран «зарплата по
 * преподавателю» отбирал ровно те же платежи, что и расчёт: разбивка, которая не
 * сходится с начисленной суммой, хуже отсутствующей.
 */
export function filterWindow<T extends FinanceTxLike>(list: T[], windowStart: string, windowEnd: string): T[] {
  const startMs = toEpochMs(windowStart);
  const endMs = toEpochMs(windowEnd);
  return (list ?? []).filter((tx) => txInWindow(tx, startMs, endMs));
}

function sample(ids: string[]): string[] {
  return ids.slice(0, SAMPLE_LIMIT);
}

// ============================================================
// Группы преподавателя
// ============================================================

export interface TeacherScope {
  /** Группы, где преподаватель числится. Порядок — как во входном списке. */
  groupIds: string[];
  /** Студенты этих групп, без повторов. */
  studentIds: string[];
}

/**
 * Кто кого ведёт. Один проход по группам: у организации их сотни, а не тысячи,
 * и строить индекс на каждого преподавателя отдельно незачем.
 *
 * Группа без teacherIds не принадлежит никому — её деньги не попадут ни в чью
 * базу. Это ровно то же решение, что «сессия без преподавателя не оплачивается
 * никому»: приписать группу тому, кто её создал, значило бы выдумать деньги.
 */
export function buildTeacherScopes(groups: GroupLike[]): Map<string, TeacherScope> {
  const scopes = new Map<string, TeacherScope>();
  for (const group of groups ?? []) {
    if (!group?.id) continue;
    for (const teacherId of group.teacherIds ?? []) {
      if (!teacherId) continue;
      const scope = scopes.get(teacherId) ?? { groupIds: [], studentIds: [] };
      if (!scope.groupIds.includes(group.id)) scope.groupIds.push(group.id);
      for (const studentId of group.studentIds ?? []) {
        if (studentId && !scope.studentIds.includes(studentId)) scope.studentIds.push(studentId);
      }
      scopes.set(teacherId, scope);
    }
  }
  return scopes;
}

// ============================================================
// Разрешение ставок
// ============================================================

/**
 * Одна ставка на преподавателя — это инвариант записи (api-payroll-rules пишет
 * ставку в документ с детерминированным id). Если их всё же две (данные
 * пережили старую модель — сначала версии со сроком действия, потом отдельная
 * ставка на каждый филиал), суммировать МОЛЧА нельзя: человек получил бы
 * двойную ставку.
 *
 * ПОБЕЖДАЕТ ПОСЛЕДНЯЯ ОТРЕДАКТИРОВАННАЯ (больший `updatedAt`), и только при
 * равенстве — меньший id. Прежний порядок «просто меньший id» на реальных
 * данных выбирал НЕ ТУ: канонический документ называется `rate_{org}_{t}_org`,
 * а филиальный — `rate_{org}_{t}_alay`, и 'a' < 'o', то есть директор правил
 * ставку, а начислялась старая филиальная. Тай-брейк по времени правки — это
 * самолечение на чтении: платим по тому, что человек трогал последним.
 */
export function resolveRules(
  rules: CompensationRule[],
): { resolved: Map<string, CompensationRule>; diagnostics: Diagnostic[] } {
  const byTeacher = new Map<string, CompensationRule[]>();
  for (const rule of rules ?? []) {
    if (!rule || !rule.teacherId) continue;
    const list = byTeacher.get(rule.teacherId) ?? [];
    list.push(rule);
    byTeacher.set(rule.teacherId, list);
  }

  const resolved = new Map<string, CompensationRule>();
  const diagnostics: Diagnostic[] = [];

  for (const [teacherId, list] of byTeacher) {
    const sorted = [...list].sort((a, b) => {
      const at = String(a.updatedAt ?? '');
      const bt = String(b.updatedAt ?? '');
      if (at !== bt) return at < bt ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    resolved.set(teacherId, sorted[0]);
    if (sorted.length > 1) {
      diagnostics.push({
        code: 'duplicate_rules',
        message:
          `У преподавателя несколько ставок (${sorted.length}) — так быть не должно. ` +
          'Взята та, которую правили последней; откройте карточку преподавателя и ' +
          'сохраните ставку — лишние удалятся сами.',
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

/** Суммирование срезов по ключу с сохранением порядка первого появления. */
function pushSlice(map: Map<string, number>, key: string | null | undefined, minor: number): void {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + minor);
}

function toSlices(map: Map<string, number>): RevenueSlice[] {
  // Сортировка по убыванию суммы: разбивку читают сверху, и первым должен идти
  // тот, кто принёс больше всех.
  return [...map.entries()]
    .map(([id, paidMinor]) => ({ id, paidMinor }))
    .sort((a, b) => b.paidMinor - a.paidMinor || (a.id < b.id ? -1 : 1));
}

/** Что принесли группы преподавателя за окно — общая часть расчёта и экрана. */
export interface TeacherRevenue {
  /** Собрано по группам преподавателя (минорные единицы). */
  grossMinor: number;
  /** Возвраты по тем же группам, положительным числом. */
  refundMinor: number;
  /** gross − refund. МОЖЕТ БЫТЬ отрицательным: кламп — дело начисления, не сбора. */
  netMinor: number;
  byGroup: RevenueSlice[];
  byStudent: RevenueSlice[];
  sourceTxnIds: string[];
  /** Возвраты, попавшие в вычет, — для диагностики «возвратов больше сборов». */
  refundTxnIds: string[];
}

/**
 * Деньги групп преподавателя за окно: платежи МИНУС возвраты, с разбивкой.
 *
 * Экспортируется намеренно: этим же кодом экран показывает «кто сколько
 * заплатил», а движок берёт от результата процент. Две отдельные реализации
 * разошлись бы, и разбивка перестала бы объяснять сумму в ведомости — а именно
 * ради этого объяснения экран и существует.
 */
export function collectTeacherRevenue(
  scope: TeacherScope,
  incomeTx: FinanceTxLike[],
  refundTx: FinanceTxLike[],
): TeacherRevenue {
  const groupIds = new Set(scope.groupIds);
  const matchedIncome = (incomeTx ?? []).filter((tx) => !!tx.groupId && groupIds.has(tx.groupId));
  const matchedRefunds = (refundTx ?? []).filter((tx) => !!tx.groupId && groupIds.has(tx.groupId));

  // Суммируем в ЦЕЛЫХ минорных единицах: каждая транзакция конвертируется один
  // раз, процент берётся от суммы. Брать процент с каждой транзакции отдельно
  // значило бы округлять N раз и копить расхождение.
  const byGroup = new Map<string, number>();
  const byStudent = new Map<string, number>();
  let grossMinor = 0;
  for (const tx of matchedIncome) {
    const minor = toMinor(tx.amount);
    grossMinor += minor;
    pushSlice(byGroup, tx.groupId, minor);
    pushSlice(byStudent, tx.studentId, minor);
  }
  // Возврат в базе хранится положительной суммой на расходной строке; abs
  // защищает и от вызывающего, который передаст его уже со знаком минус.
  let refundMinor = 0;
  for (const tx of matchedRefunds) {
    const minor = Math.abs(toMinor(tx.amount));
    refundMinor += minor;
    // Возврат уменьшает и разбивку: строка студента обязана показывать, сколько
    // он в итоге ОСТАВИЛ в кассе, иначе сумма строк не сойдётся с базой.
    pushSlice(byGroup, tx.groupId, -minor);
    pushSlice(byStudent, tx.studentId, -minor);
  }

  return {
    grossMinor,
    refundMinor,
    netMinor: grossMinor - refundMinor,
    byGroup: toSlices(byGroup),
    byStudent: toSlices(byStudent),
    sourceTxnIds: matchedIncome.map((tx) => tx.id),
    refundTxnIds: matchedRefunds.map((tx) => tx.id),
  };
}

// ============================================================
// Разложение начисленного по филиалам
// ============================================================

/**
 * Доля одного филиала в зарплате преподавателя.
 *
 * Ставка филиала не имеет (см. CompensationRule), но РАСХОД в кассе — имеет:
 * иначе филиал, где человек отработал месяц, показывает прибыль без своей
 * главной статьи затрат. Преподаватель при этом спокойно ведёт группы в двух
 * зданиях, поэтому «филиал строки» — это не одно значение, а разложение.
 */
export interface BranchShare {
  /** null — филиал не определён: у групп его нет, либо групп нет вовсе. */
  branchId: string | null;
  /** Вес доли. Не деньги: смысл имеет только отношение к сумме весов. */
  weight: number;
  /** Группы преподавателя в этом филиале — источник атрибуции расхода. */
  groupIds: string[];
}

/** Доля с посчитанной суммой. Сумма всех amountMinor РАВНА распределяемой. */
export type BranchAllocation<T extends BranchShare = BranchShare> = T & { amountMinor: number };

/**
 * Веса филиалов для одного преподавателя.
 *
 * Основной вес — ДЕНЬГИ: сколько собрано по группам этого филиала (byGroup уже
 * посчитан для процента и лежит в замороженном снапшоте). Так зарплата ложится
 * туда, откуда пришла выручка, — при любом виде оплаты, включая оклад.
 *
 * Если денег в месяце не было вовсе (новый филиал, месяц без оплат, чистый
 * оклад), веса вырождаются в КОЛИЧЕСТВО ГРУПП: делить нечем, но и свалить всю
 * сумму в один филиал нельзя — это соврало бы отчёту ровно так же.
 *
 * Отрицательные срезы (возвратов больше сборов) клампятся в ноль: отрицательный
 * вес перевернул бы распределение и увёл деньги в чужой филиал.
 */
export function buildBranchShares(
  groupIds: string[],
  byGroup: RevenueSlice[],
  branchByGroupId: Map<string, string | null>,
): BranchShare[] {
  if (!groupIds?.length) return [];

  const paidByGroup = new Map<string, number>((byGroup ?? []).map((s) => [s.id, s.paidMinor]));
  // Порядок филиалов — порядок первого появления группы: он детерминирован
  // порядком выборки групп, значит и распределение остатка воспроизводимо.
  const order: (string | null)[] = [];
  const buckets = new Map<string | null, BranchShare>();

  for (const groupId of groupIds) {
    const branchId = branchByGroupId.get(groupId) ?? null;
    let bucket = buckets.get(branchId);
    if (!bucket) {
      bucket = { branchId, weight: 0, groupIds: [] };
      buckets.set(branchId, bucket);
      order.push(branchId);
    }
    bucket.groupIds.push(groupId);
    bucket.weight += Math.max(0, paidByGroup.get(groupId) || 0);
  }

  const shares = order.map((branchId) => buckets.get(branchId)!);
  const totalWeight = shares.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight > 0) return shares;

  // Денег не было ни в одном филиале — делим по числу групп.
  return shares.map((s) => ({ ...s, weight: s.groupIds.length }));
}

/**
 * Разложить сумму по долям БЕЗ потери копейки.
 *
 * Наибольший остаток: сначала целая часть, затем единицы остатка уходят долям с
 * наибольшей дробной частью. Наивное округление каждой доли отдельно даёт сумму,
 * не равную исходной, — а это расход в кассе, который обязан сойтись с
 * начислением до тыйына.
 */
export function allocateByShares<T extends BranchShare>(
  totalMinor: number,
  shares: T[],
): BranchAllocation<T>[] {
  if (!shares?.length) return [];
  if (shares.length === 1) return [{ ...shares[0], amountMinor: totalMinor }];

  const totalWeight = shares.reduce((sum, s) => sum + s.weight, 0);
  // Вырожденный случай (все веса нулевые): вся сумма первой доле — иначе она
  // растворилась бы, и расход разошёлся бы с начислением.
  if (totalWeight <= 0) {
    return shares.map((s, i) => ({ ...s, amountMinor: i === 0 ? totalMinor : 0 }));
  }

  const parts = shares.map((s) => {
    const exact = (totalMinor * s.weight) / totalWeight;
    const floor = Math.floor(exact);
    return { share: s, amountMinor: floor, remainder: exact - floor };
  });

  let leftover = totalMinor - parts.reduce((sum, p) => sum + p.amountMinor, 0);
  const byRemainder = [...parts].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      b.share.weight - a.share.weight ||
      String(a.share.branchId ?? '').localeCompare(String(b.share.branchId ?? '')),
  );
  for (let i = 0; leftover > 0 && i < byRemainder.length; i++, leftover--) {
    byRemainder[i].amountMinor += 1;
  }

  return parts.map((p) => ({ ...p.share, amountMinor: p.amountMinor }));
}

/**
 * % от СОБРАННОЙ наличности: база = платежи в окне по ГРУППАМ ПРЕПОДАВАТЕЛЯ
 * МИНУС возвраты в окне по тем же группам.
 *
 * «Собранное», а не «выставленное», — сознательно: счёт это намерение, а
 * зарплата платится из денег, которые уже в кассе. Возврат уменьшает базу
 * текущего месяца; отрицательная база КЛАМПИТСЯ В НОЛЬ — отрицательной зарплаты
 * не бывает, и удержаний из уже выданного тоже.
 */
function computePercentRevenue(
  component: Extract<PayComponent, { kind: 'percent_revenue' }>,
  incomeTx: FinanceTxLike[],
  refundTx: FinanceTxLike[],
  ctx: { teacherId: string; ruleId: string; scope: TeacherScope },
): ComputedComponent {
  const diagnostics: Diagnostic[] = [];

  if (ctx.scope.groupIds.length === 0) {
    // Не ошибка расчёта, а отсутствие входных данных: платить процент не с чего,
    // пока преподаватель не назначен ни в одну группу. Молчаливый ноль в
    // зарплате человека недопустим, поэтому причина называется прямо.
    diagnostics.push({
      code: 'teacher_without_groups',
      message:
        'У преподавателя нет ни одной группы, поэтому процент считать не с чего — начислено 0. ' +
        'Назначьте преподавателя в группы, и оплаты его студентов попадут в базу.',
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
        grossMinor: 0,
        refundMinor: 0,
        revenueBaseMinor: 0,
        byGroup: [],
        byStudent: [],
        sourceTxnIds: [],
      },
      diagnostics,
    };
  }

  const revenue = collectTeacherRevenue(ctx.scope, incomeTx, refundTx);

  // Кламп в ноль: возвраты больше сборов НЕ превращаются в отрицательный
  // заработок и не отбирают уже выданное. Продукт: «никогда не clawback».
  const revenueBaseMinor = Math.max(0, revenue.netMinor);
  if (revenue.netMinor < 0) {
    diagnostics.push({
      code: 'percent_base_negative',
      message:
        `Возвраты превысили сборы по группам преподавателя (${(revenue.netMinor / 100).toFixed(2)} с.). ` +
        'Начислено 0 — удержания из зарплаты не делаются.',
      count: revenue.refundTxnIds.length,
      sample: sample(revenue.refundTxnIds),
      teacherId: ctx.teacherId,
      ruleId: ctx.ruleId,
    });
  }

  return {
    kind: 'percent_revenue',
    // Единственное округление: целочисленный числитель / 10000, HALF_UP.
    earnedMinor: divRoundHalfUp(revenueBaseMinor * component.percentBp, 10000),
    basis: {
      percentBp: component.percentBp,
      base: component.base,
      grossMinor: revenue.grossMinor,
      refundMinor: revenue.refundMinor,
      revenueBaseMinor,
      byGroup: revenue.byGroup,
      byStudent: revenue.byStudent,
      sourceTxnIds: revenue.sourceTxnIds,
    },
    diagnostics,
  };
}

// ============================================================
// Главная функция
// ============================================================

/**
 * Считает строки ведомости по уже выбранным данным.
 *
 * Контракт: одна строка на КАЖДУЮ ставку — даже при нулевой активности. Пустая
 * строка это сигнал «ставка есть, начислять было не с чего», а её отсутствие
 * директор прочитает как сбой расчёта.
 *
 * Окно применяется здесь ещё раз, хотя вызывающий уже отфильтровал выборку: обе
 * границы ВКЛЮЧИТЕЛЬНЫ, и это свойство должно принадлежать ядру, а не эндпоинту,
 * чтобы платёж ровно на границе периода нельзя было потерять незаметно.
 */
export function computePayroll(inputs: PayrollInputs): PayrollResult {
  const startMs = toEpochMs(inputs.windowStart);
  const endMs = toEpochMs(inputs.windowEnd);

  const incomeTx = (inputs.incomeTx ?? []).filter((tx) => txInWindow(tx, startMs, endMs));
  const refundTx = (inputs.refundTx ?? []).filter((tx) => txInWindow(tx, startMs, endMs));

  const scopes = buildTeacherScopes(inputs.groups ?? []);
  const { resolved, diagnostics: ruleDiagnostics } = resolveRules(inputs.rules ?? []);

  const globalDiagnostics: Diagnostic[] = [];

  const lines: ComputedLine[] = [];
  // Детерминированный порядок строк — от него зависит воспроизводимость расчёта.
  const teacherIds = [...resolved.keys()].sort();

  for (const teacherId of teacherIds) {
    const rule = resolved.get(teacherId)!;
    const scope = scopes.get(teacherId) ?? { groupIds: [], studentIds: [] };
    const components: ComputedComponent[] = [];
    const lineDiagnostics: Diagnostic[] = ruleDiagnostics.filter((d) => d.teacherId === teacherId);

    const ruleComponents = Array.isArray(rule.components) ? rule.components : [];
    if (!ruleComponents.length) {
      lineDiagnostics.push({
        code: 'rule_no_components',
        message: 'В ставке не указан ни процент, ни сумма — начислять нечего. Откройте ставку и задайте оплату.',
        count: 1,
        teacherId,
        ruleId: rule.id,
      });
    }

    let hasPercent = false;
    for (const component of ruleComponents) {
      switch (component.kind) {
        case 'salary':
          // Фиксированная сумма платится всегда: это и значит «фиксированная».
          // Найм в середине месяца даёт полный месяц — директор мыслит целыми
          // месяцами, и так же начисляет monthly-billing.
          components.push({
            kind: 'salary',
            earnedMinor: component.amountMinor,
            basis: { amountMinor: component.amountMinor },
            diagnostics: [],
          });
          break;
        case 'percent_revenue':
          hasPercent = true;
          components.push(
            computePercentRevenue(component, incomeTx, refundTx, { teacherId, ruleId: rule.id, scope }),
          );
          break;
        default:
          // Компонент неизвестного вида (пережиток удалённых «за занятие/час/
          // студента»). Считать его нечем, но и промолчать нельзя — иначе
          // человек недосчитается денег без единого следа.
          lineDiagnostics.push({
            code: 'rule_no_components',
            message:
              `В ставке остался устаревший вид оплаты «${String((component as any)?.kind ?? '')}» — он больше не поддерживается ` +
              'и не начислен. Откройте ставку и выберите процент или фиксированную сумму.',
            count: 1,
            teacherId,
            ruleId: rule.id,
          });
          break;
      }
    }

    // Платежи ЕГО студентов, не привязанные к группе, в базу процента не
    // попадают: атрибуция денег в этой системе идёт через группу (см. резолв
    // groupId в api-finance-transactions). Молча потерять их нельзя — именно
    // они объясняют, почему сумма меньше ожидаемой.
    if (hasPercent && scope.studentIds.length) {
      const students = new Set(scope.studentIds);
      const orphanPayments = incomeTx.filter((tx) => !tx.groupId && !!tx.studentId && students.has(tx.studentId));
      if (orphanPayments.length) {
        const totalMinor = orphanPayments.reduce((sum, tx) => sum + toMinor(tx.amount), 0);
        lineDiagnostics.push({
          code: 'payment_without_group',
          message:
            `Платежей его студентов без привязки к группе: ${orphanPayments.length} на ${(totalMinor / 100).toFixed(2)} с. ` +
            'В базу процента они не вошли — откройте платёж в Финансах и укажите группу.',
          count: orphanPayments.length,
          sample: sample(orphanPayments.map((tx) => tx.id)),
          teacherId,
          ruleId: rule.id,
        });
      }
    }

    for (const c of components) lineDiagnostics.push(...c.diagnostics);

    lines.push({
      teacherId,
      ruleId: rule.id,
      ruleSnapshot: {
        ruleId: rule.id,
        components: ruleComponents,
        groupIds: scope.groupIds,
      },
      // Компоненты складываются. Форма даёт выбрать ровно один вид, но модель
      // сумму поддерживает — «оклад + процент» останется вопросом одной галочки.
      computedMinor: components.reduce((sum, c) => sum + c.earnedMinor, 0),
      components,
      diagnostics: lineDiagnostics,
    });
  }

  // --- Глобальные диагностики -------------------------------------------

  // Преподаватели без ставки: строки нет, поэтому единственный способ их увидеть
  // — этот список.
  const activeTeacherIds = new Set<string>(scopes.keys());
  for (const id of inputs.knownTeacherIds ?? []) activeTeacherIds.add(id);
  const withoutRule = [...activeTeacherIds].filter((id) => !resolved.has(id)).sort();
  if (withoutRule.length) {
    globalDiagnostics.push({
      code: 'teacher_without_rule',
      message:
        `Преподавателей без ставки: ${withoutRule.length}. ` +
        'Им ничего не начислено — задайте процент или фиксированную сумму.',
      count: withoutRule.length,
      sample: sample(withoutRule),
    });
  }

  // Один плоский список для UI; построчные копии остаются в line.diagnostics
  // для детализации.
  const diagnostics: Diagnostic[] = [
    ...lines.flatMap((l) => l.diagnostics),
    ...globalDiagnostics,
  ];

  return { lines, diagnostics };
}
