/**
 * Чистое ядро расчёта зарплаты — БЕЗ Firestore, БЕЗ I/O, без побочных эффектов.
 *
 * Изоляция намеренная: это та часть, которая должна быть доказуемо правильной,
 * поэтому она обязана покрываться юнит-тестами без мока базы. Эндпоинт
 * (api-payroll) отвечает за выборку и запись; здесь — только арифметика.
 *
 * ТРИ ВИДА ОПЛАТЫ, И ВСЕ ТРИ СЧИТАЮТСЯ ПО КАССЕ. Фиксированная сумма («оклад»),
 * процент от денег, которые реально принесли студенты преподавателя, и
 * фиксированная сумма с каждого ЗАПЛАТИВШЕГО студента. Оплата за занятие, за час
 * и за голову на уроке удалены сознательно: они считались по отметкам
 * посещаемости (lessonSessions), то есть зарплата человека молча зависела от
 * того, ведёт ли кто-то журнал. Директор про такую связь не знает и узнаёт по
 * недоплате.
 *
 * ПЛЮС ИСКЛЮЧЕНИЯ ПО УЧЕНИКУ (`individual_students`) — ради индивидуальных
 * занятий. Ставка вида «250 с ученика» или «20% с групп» описывает поток, где
 * все ученики равны; за индивидуальные же платят СВОЮ сумму («с Тимура — 1500»).
 * Это не четвёртый вид оплаты, а модификатор: ученик с исключением уходит из
 * базы основной ставки целиком (и из процента, и из числа заплативших) и
 * оплачивается своей суммой. Иначе за него заплатили бы дважды.
 *
 * `per_paying_student` старую «оплату за студента» НЕ воскрешает и потому назван
 * иначе: он смотрит в кассу, а не в журнал. Документы прежней модели с
 * `kind: 'per_student'` (сумма × Σ headcount) так и остаются неначисляемыми —
 * иначе ставка «200 за посещение» тихо превратилась бы в «200 за плательщика».
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
 * Вид оплаты. Ровно три, и это продуктовое решение, а не текущее состояние:
 * директор академии рассуждает «Азизе — двадцать процентов», «Азизе — тридцать
 * тысяч» либо «Азизе — двести пятьдесят с ученика». Всё остальное требовало
 * данных, которых в базе нет.
 *
 * `per_paying_student` — та же логика, что у процента, но плоской суммой:
 * `amountMinor` за КАЖДОГО студента его групп, который в этом месяце что-то
 * заплатил. `base: 'collected'` обязателен и не декоративен — он отличает эту
 * оплату от одноимённой по смыслу, но посещаемостной ставки прежней модели.
 *
 * `individual_students` — не вид оплаты, а список ИМЕННЫХ исключений: за этих
 * учеников платят своей суммой, а не общей ставкой (индивидуальные занятия).
 * Живёт он в том же массиве `components` не из экономии, а по двум причинам:
 * снапшот строки ведомости замораживает `components` целиком (значит история
 * защищена тем же механизмом, что и ставка), и удаление ставки уносит
 * исключения с собой — «больше не начислять» остаётся одним действием.
 */
export interface IndividualStudentRate {
  studentId: string;
  /** Целые минорные единицы. Сумма за ЭТОГО ученика, если он в месяце заплатил. */
  amountMinor: number;
}

export type PayComponent =
  | { kind: 'salary'; amountMinor: number }
  | { kind: 'percent_revenue'; percentBp: number; base: 'collected' }
  | { kind: 'per_paying_student'; amountMinor: number; base: 'collected' }
  | { kind: 'individual_students'; rates: IndividualStudentRate[]; base: 'collected' };

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
  | 'rule_no_components'
  /** В исключениях есть ученик, которого нет ни в одной группе преподавателя. */
  | 'individual_student_outside_groups';

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
  /** Сколько студентов заплатило в окне — множитель у per_paying_student. */
  payingStudents?: number;
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
  /** Исключения по ученику, замороженные дословно (только individual_students). */
  rates?: IndividualStudentRate[];
  /**
   * Ученики с индивидуальной ставкой, чьи деньги из ЭТОГО компонента изъяты.
   * Лежит в снапшоте не для арифметики, а для объяснения: без него «процент
   * посчитан не от всех денег» выглядит ошибкой расчёта.
   */
  excludedStudentIds?: string[];
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
 * Кого из учеников считать в выборке. Нужен ровно для индивидуальных ставок:
 * один и тот же код собирает и «деньги всех, КРОМЕ индивидуальных» (база
 * основной ставки), и «деньги ТОЛЬКО индивидуальных» (их собственный компонент).
 *
 * Платёж БЕЗ ученика (`studentId` не заполнен) при исключении остаётся в
 * выборке, а при `onlyStudentIds` — выпадает: сказать, что он чей-то личный,
 * нельзя, а молча приписать его индивидуальной ставке значило бы выдумать
 * деньги. Такие платежи и так видны в диагностике `payment_without_group`.
 */
export interface RevenueFilter {
  /** Ученики, чьи деньги в выборку НЕ входят — их оплачивает своя ставка. */
  excludeStudentIds?: Set<string>;
  /** Только эти ученики. Задаётся вместо excludeStudentIds, не вместе с ним. */
  onlyStudentIds?: Set<string>;
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
  filter?: RevenueFilter,
): TeacherRevenue {
  const groupIds = new Set(scope.groupIds);
  const only = filter?.onlyStudentIds;
  const excluded = filter?.excludeStudentIds;
  const studentPasses = (tx: FinanceTxLike): boolean => {
    if (only) return !!tx.studentId && only.has(tx.studentId);
    if (excluded?.size) return !tx.studentId || !excluded.has(tx.studentId);
    return true;
  };
  const matched = (tx: FinanceTxLike) => !!tx.groupId && groupIds.has(tx.groupId) && studentPasses(tx);
  const matchedIncome = (incomeTx ?? []).filter(matched);
  const matchedRefunds = (refundTx ?? []).filter(matched);

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
 * Разбивка по группам, СЛОЖЕННАЯ по всем компонентам строки, — веса филиалов.
 *
 * Один компонент брать нельзя с тех пор, как появились именные ставки: деньги
 * индивидуальных учеников лежат в своём компоненте, а деньги групп — в своём, и
 * первый попавшийся дал бы половину картины. Преподаватель с процентом в одном
 * филиале и индивидуальным учеником в другом получил бы расход целиком не там,
 * где заработал.
 *
 * null — ни один компонент разбивки не несёт (чистый оклад): вызывающий тогда
 * досчитывает её сам, иначе веса выродились бы в «первый филиал забирает всё».
 */
export function mergeComponentByGroup(
  components: Array<{ basis?: ComponentBasis }> | undefined | null,
): RevenueSlice[] | null {
  const map = new Map<string, number>();
  let found = false;
  for (const component of components ?? []) {
    const slices = component?.basis?.byGroup;
    if (!Array.isArray(slices)) continue;
    found = true;
    for (const slice of slices) {
      if (slice?.id) map.set(slice.id, (map.get(slice.id) || 0) + Number(slice.paidMinor || 0));
    }
  }
  return found ? toSlices(map) : null;
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
  ctx: { teacherId: string; ruleId: string; scope: TeacherScope; individualStudentIds?: Set<string> },
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

  // Индивидуальные ученики из базы процента ИЗЪЯТЫ: за них платят своей суммой,
  // и оставить их деньги здесь значило бы заплатить дважды.
  const excludeStudentIds = ctx.individualStudentIds;
  const revenue = collectTeacherRevenue(ctx.scope, incomeTx, refundTx, { excludeStudentIds });

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
      excludedStudentIds: excludeStudentIds?.size ? [...excludeStudentIds] : undefined,
    },
    diagnostics,
  };
}

/**
 * Плоская сумма С КАЖДОГО ЗАПЛАТИВШЕГО студента: «двести пятьдесят с ученика».
 *
 * Считается по той же кассе, что и процент, и отличается только тем, ЧТО в ней
 * измеряется: не сумма денег, а число людей, которые эти деньги принесли.
 * Заплативший — тот, у кого в окне ПОЛОЖИТЕЛЬНЫЙ нетто (оплаты минус возвраты)
 * по группам преподавателя. Именно нетто: студент, которому вернули всё
 * уплаченное, в этом месяце не заплатил ничего.
 *
 * ЧАСТИЧНАЯ ОПЛАТА СЧИТАЕТСЯ ЦЕЛОЙ ГОЛОВОЙ, и это осознанно. Ставка звучит как
 * «250 с ученика», а не «250 за полностью закрытый счёт»; дробить её по доле
 * внесённой суммы значило бы объяснять преподавателю дроби вместо людей. Чтобы
 * число оставалось проверяемым, разбивка (byStudent) уезжает в снапшот и на
 * экран: там видно поимённо, кто вошёл в множитель.
 */
function computePerPayingStudent(
  component: Extract<PayComponent, { kind: 'per_paying_student' }>,
  incomeTx: FinanceTxLike[],
  refundTx: FinanceTxLike[],
  ctx: { teacherId: string; ruleId: string; scope: TeacherScope; individualStudentIds?: Set<string> },
): ComputedComponent {
  const diagnostics: Diagnostic[] = [];

  if (ctx.scope.groupIds.length === 0) {
    // Как и у процента: не ошибка расчёта, а отсутствие входных данных. Молчать
    // о нуле в зарплате человека нельзя.
    diagnostics.push({
      code: 'teacher_without_groups',
      message:
        'У преподавателя нет ни одной группы, поэтому платящих студентов у него нет — начислено 0. ' +
        'Назначьте преподавателя в группы, и оплаты его студентов попадут в расчёт.',
      count: 1,
      teacherId: ctx.teacherId,
      ruleId: ctx.ruleId,
    });
    return {
      kind: 'per_paying_student',
      earnedMinor: 0,
      basis: {
        amountMinor: component.amountMinor,
        base: component.base,
        payingStudents: 0,
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

  // Ученик с индивидуальной ставкой в множитель НЕ входит: его оплачивает своя
  // сумма, а не общая «250 с ученика».
  const excludeStudentIds = ctx.individualStudentIds;
  const revenue = collectTeacherRevenue(ctx.scope, incomeTx, refundTx, { excludeStudentIds });
  const payingStudents = revenue.byStudent.filter((s) => s.paidMinor > 0).length;

  if (revenue.netMinor < 0) {
    diagnostics.push({
      code: 'percent_base_negative',
      message:
        `Возвраты превысили сборы по группам преподавателя (${(revenue.netMinor / 100).toFixed(2)} с.). ` +
        `В расчёт вошли только те, у кого оплаты остались: ${payingStudents}. Удержания из зарплаты не делаются.`,
      count: revenue.refundTxnIds.length,
      sample: sample(revenue.refundTxnIds),
      teacherId: ctx.teacherId,
      ruleId: ctx.ruleId,
    });
  }

  return {
    kind: 'per_paying_student',
    // Целые на целое: голов × ставку, ни деления, ни округления.
    earnedMinor: payingStudents * component.amountMinor,
    basis: {
      amountMinor: component.amountMinor,
      base: component.base,
      payingStudents,
      grossMinor: revenue.grossMinor,
      refundMinor: revenue.refundMinor,
      revenueBaseMinor: Math.max(0, revenue.netMinor),
      byGroup: revenue.byGroup,
      byStudent: revenue.byStudent,
      sourceTxnIds: revenue.sourceTxnIds,
      excludedStudentIds: excludeStudentIds?.size ? [...excludeStudentIds] : undefined,
    },
    diagnostics,
  };
}

/**
 * ИМЕННЫЕ СТАВКИ — индивидуальные занятия: «с Тимура 1500, с Алии 1200».
 *
 * Зачем отдельный компонент, а не четвёртый вид оплаты: индивидуальные ученики
 * почти никогда не заменяют основную ставку целиком — преподаватель ведёт
 * группы на общих условиях И двоих учеников персонально. Поэтому исключения
 * СКЛАДЫВАЮТСЯ с любой ставкой (оклад, процент, сумма с ученика), а сами эти
 * ученики из основной ставки изъяты (см. individualStudentIds в computePayroll).
 *
 * Условие начисления то же, что у `per_paying_student`, и это не случайность:
 * платим за тех, кто в окне ПОЛОЖИТЕЛЬНЫЙ нетто оставил в кассе. Частичная
 * оплата — целая ставка: «1500 за ученика» не дробится по доле внесённого, ровно
 * как «250 с ученика».
 *
 * Деньги ученика видны только через ГРУППУ преподавателя (собственный
 * инвариант этого файла: чьи деньги — решает состав групп). Значит и
 * индивидуальному ученику нужна группа — пусть из одного человека. Ученик,
 * которого нет ни в одной группе преподавателя, не начислится никогда, и молчать
 * об этом нельзя: отсюда диагностика individual_student_outside_groups.
 */
function computeIndividualStudents(
  component: Extract<PayComponent, { kind: 'individual_students' }>,
  incomeTx: FinanceTxLike[],
  refundTx: FinanceTxLike[],
  ctx: { teacherId: string; ruleId: string; scope: TeacherScope },
): ComputedComponent {
  const diagnostics: Diagnostic[] = [];
  // Дедуп по ученику: сервер уникальность проверяет, но ядро обязано быть
  // правильным и на данных, введённых мимо него. Побеждает ПЕРВАЯ запись —
  // детерминированно и не зависит от порядка чтения.
  const rates: IndividualStudentRate[] = [];
  const seen = new Set<string>();
  for (const rate of component.rates ?? []) {
    const studentId = String(rate?.studentId ?? '');
    if (!studentId || seen.has(studentId)) continue;
    seen.add(studentId);
    rates.push({ studentId, amountMinor: Number(rate?.amountMinor || 0) });
  }

  const inScope = new Set(ctx.scope.studentIds);
  const outside = rates.filter((r) => !inScope.has(r.studentId));
  if (outside.length) {
    diagnostics.push({
      code: 'individual_student_outside_groups',
      message:
        `Индивидуальных учеников вне его групп: ${outside.length}. ` +
        'Их оплаты в расчёт не попадают — деньги привязываются к преподавателю через группу. ' +
        'Создайте группу на такого ученика (пусть из одного человека) и назначьте в неё преподавателя.',
      count: outside.length,
      sample: sample(outside.map((r) => r.studentId)),
      teacherId: ctx.teacherId,
      ruleId: ctx.ruleId,
    });
  }

  const onlyStudentIds = new Set(rates.map((r) => r.studentId));
  const revenue = onlyStudentIds.size
    ? collectTeacherRevenue(ctx.scope, incomeTx, refundTx, { onlyStudentIds })
    : { grossMinor: 0, refundMinor: 0, netMinor: 0, byGroup: [], byStudent: [], sourceTxnIds: [], refundTxnIds: [] };

  const netByStudent = new Map(revenue.byStudent.map((s) => [s.id, s.paidMinor]));
  let earnedMinor = 0;
  let payingStudents = 0;
  for (const rate of rates) {
    // Именно нетто: ученику вернули всё уплаченное — значит в этом месяце он не
    // заплатил ничего, и ставка за него не причитается.
    if ((netByStudent.get(rate.studentId) || 0) <= 0) continue;
    earnedMinor += rate.amountMinor;
    payingStudents += 1;
  }

  return {
    kind: 'individual_students',
    earnedMinor,
    basis: {
      base: component.base,
      // Список замораживается дословно: через месяц «почему 2700» должно
      // читаться по строке, а не по текущей карточке ставки.
      rates,
      payingStudents,
      grossMinor: revenue.grossMinor,
      refundMinor: revenue.refundMinor,
      revenueBaseMinor: Math.max(0, revenue.netMinor),
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

    // ── Кого основная ставка не касается ──
    // Ученики с именной ставкой изымаются из базы процента и из числа
    // заплативших ДО расчёта компонентов: иначе за индивидуальное занятие
    // заплатили бы и своей суммой, и общей ставкой. Набор считается один раз и
    // отдаётся обоим «кассовым» видам оплаты.
    const individualRates = ruleComponents
      .filter((c: any): c is Extract<PayComponent, { kind: 'individual_students' }> => c?.kind === 'individual_students')
      .flatMap((c) => c.rates ?? []);
    const individualStudentIds = new Set(
      individualRates.map((r) => String(r?.studentId ?? '')).filter(Boolean),
    );

    // Оплата, которая считается по кассе: и процент, и сумма с плательщика
    // зависят от того, привязан ли платёж к группе, — значит и предупреждать о
    // непривязанных платежах нужно при обеих.
    let usesCollected = false;
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
          usesCollected = true;
          components.push(
            computePercentRevenue(component, incomeTx, refundTx, {
              teacherId, ruleId: rule.id, scope, individualStudentIds,
            }),
          );
          break;
        case 'per_paying_student':
          usesCollected = true;
          components.push(
            computePerPayingStudent(component, incomeTx, refundTx, {
              teacherId, ruleId: rule.id, scope, individualStudentIds,
            }),
          );
          break;
        case 'individual_students':
          usesCollected = true;
          components.push(
            computeIndividualStudents(component, incomeTx, refundTx, { teacherId, ruleId: rule.id, scope }),
          );
          break;
        default:
          // Компонент неизвестного вида (пережиток удалённых «за занятие/час/
          // студента» — тех, что считались по журналу). Считать его нечем, но и
          // промолчать нельзя — иначе человек недосчитается денег без следа.
          lineDiagnostics.push({
            code: 'rule_no_components',
            message:
              `В ставке остался устаревший вид оплаты «${String((component as any)?.kind ?? '')}» — он больше не поддерживается ` +
              'и не начислен. Откройте ставку и выберите процент, фиксированную сумму или сумму с ученика.',
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
    if (usesCollected && scope.studentIds.length) {
      const students = new Set(scope.studentIds);
      const orphanPayments = incomeTx.filter((tx) => !tx.groupId && !!tx.studentId && students.has(tx.studentId));
      if (orphanPayments.length) {
        const totalMinor = orphanPayments.reduce((sum, tx) => sum + toMinor(tx.amount), 0);
        lineDiagnostics.push({
          code: 'payment_without_group',
          message:
            `Платежей его студентов без привязки к группе: ${orphanPayments.length} на ${(totalMinor / 100).toFixed(2)} с. ` +
            'В расчёт они не вошли — откройте платёж в Финансах и укажите группу.',
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
        'Им ничего не начислено — задайте ставку: процент, сумму за месяц или сумму с ученика.',
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

// ============================================================
// Прогноз «если оплатят все»
// ============================================================

/**
 * Счёт студента за месяц в том виде, в каком его отдаёт Firestore.
 * `totalAmount` — В СОМАХ (так хранится) и УЖЕ после скидки: это сумма, которую
 * с человека действительно ждут, а не прайс (см. StudentPaymentPlan.listAmount).
 */
export interface PlanLike {
  id: string;
  studentId?: string | null;
  courseId?: string | null;
  totalAmount?: number | null;
}

/** Сколько выставлено студентам преподавателя за месяц — вход прогноза. */
export interface ExpectedRevenue {
  /** Сумма счетов месяца по его группам (минорные единицы). */
  expectedMinor: number;
  /** Сколько РАЗНЫХ студентов в этих счетах. */
  expectedStudents: number;
  /** Сколько счетов вошло — чтобы «ноль» отличался от «счетов нет». */
  planCount: number;
  /**
   * Сколько выставлено КАЖДОМУ студенту. Нужен потолку с именными ставками:
   * индивидуального ученика надо вычесть из общей базы и добавить его ставкой,
   * а для этого прогноз обязан знать не только сумму, но и кому она выставлена.
   */
  byStudent: RevenueSlice[];
}

export function emptyExpectedRevenue(): ExpectedRevenue {
  return { expectedMinor: 0, expectedStudents: 0, planCount: 0, byStudent: [] };
}

/**
 * Чьи счета чьи: счёт (студент × курс) достаётся каждому преподавателю, у кого
 * есть группа этого курса с этим студентом.
 *
 * Связь именно такая, потому что у счёта НЕТ groupId: он выставляется на пару
 * (студент, курс), а группа появляется только у платежа (его резолвит
 * api-finance-transactions). Значит прогноз — это оценка, а не бухгалтерия:
 *
 * • студент в двух группах одного курса у РАЗНЫХ преподавателей увидится обоим
 *   целиком: разложить один счёт между ними нечем, а промолчать хуже — оба
 *   ведут его занятия;
 * • счёт, выставленный вручную (курс 'general'), не совпадёт ни с одной группой
 *   и в прогноз не попадёт.
 *
 * Обе оговорки живут в подписи на экране: «если оплатят все» обязано читаться
 * как ориентир, а не как обещание.
 */
export function buildExpectedByTeacher(
  groups: GroupLike[],
  plans: PlanLike[],
): Map<string, ExpectedRevenue> {
  // Счета по курсу и студенту — один проход вместо поиска по всему списку на
  // каждого студента каждой группы.
  const byCourseStudent = new Map<string, PlanLike[]>();
  for (const plan of plans ?? []) {
    if (!plan?.id || !plan.studentId || !plan.courseId) continue;
    const key = `${plan.courseId}|${plan.studentId}`;
    const list = byCourseStudent.get(key) ?? [];
    list.push(plan);
    byCourseStudent.set(key, list);
  }

  interface Acc { minor: number; students: Set<string>; plans: Set<string>; byStudent: Map<string, number> }
  const acc = new Map<string, Acc>();

  for (const group of groups ?? []) {
    if (!group?.id || !group.courseId) continue;
    const teacherIds = (group.teacherIds ?? []).filter(Boolean);
    if (!teacherIds.length) continue;
    for (const studentId of group.studentIds ?? []) {
      if (!studentId) continue;
      const plansOf = byCourseStudent.get(`${group.courseId}|${studentId}`);
      if (!plansOf?.length) continue;
      for (const teacherId of teacherIds) {
        let bucket = acc.get(teacherId);
        if (!bucket) {
          bucket = { minor: 0, students: new Set(), plans: new Set(), byStudent: new Map() };
          acc.set(teacherId, bucket);
        }
        for (const plan of plansOf) {
          // Дедуп по id счёта: студент в двух группах ОДНОГО преподавателя —
          // это один счёт, а не два. Без этого прогноз удваивался бы у тех, кто
          // ведёт у человека и основную группу, и подгруппу.
          if (bucket.plans.has(plan.id)) continue;
          bucket.plans.add(plan.id);
          const planMinor = toMinor(Number(plan.totalAmount || 0));
          bucket.minor += planMinor;
          bucket.byStudent.set(studentId, (bucket.byStudent.get(studentId) || 0) + planMinor);
        }
        bucket.students.add(studentId);
      }
    }
  }

  const out = new Map<string, ExpectedRevenue>();
  for (const [teacherId, bucket] of acc) {
    out.set(teacherId, {
      expectedMinor: bucket.minor,
      expectedStudents: bucket.students.size,
      planCount: bucket.plans.size,
      byStudent: toSlices(bucket.byStudent),
    });
  }
  return out;
}

/**
 * Сколько вышло бы преподавателю, если бы все счета месяца оплатили целиком.
 *
 * Тот же переключатель видов оплаты, что и в расчёте, но по выставленному, а не
 * по собранному: процент берётся от суммы счетов, сумма с ученика умножается на
 * число студентов со счётом, оклад не зависит ни от чего и остаётся собой.
 *
 * Это ПОТОЛОК месяца, а не начисление: он не пишется в ведомость, не участвует
 * в выплате и существует ровно для одного вопроса директора — «а если все
 * заплатят?». Начисляется всегда только то, что реально в кассе.
 */
export function computePotentialMinor(
  components: PayComponent[] | undefined,
  expected: ExpectedRevenue,
): number {
  // Именные ставки вычитаются из общей базы ровно как в начислении: иначе
  // потолок был бы выше достижимого — он считал бы индивидуального ученика
  // дважды, а сравнивать с ним начисленное стало бы бессмысленно.
  const invoicedByStudent = new Map((expected.byStudent ?? []).map((s) => [s.id, s.paidMinor]));
  const individualRates = (components ?? [])
    .filter((c: any) => c?.kind === 'individual_students')
    .flatMap((c: any) => (c.rates ?? []) as IndividualStudentRate[]);
  // Дедуп по ученику — тем же правилом «побеждает первая запись», что в
  // начислении (computeIndividualStudents): два числа на одного человека это
  // ошибка ввода, и потолок не имеет права разойтись с расчётом в её трактовке.
  const payableRates = new Map<string, number>();
  for (const rate of individualRates) {
    const studentId = String(rate?.studentId ?? '');
    if (!studentId || payableRates.has(studentId)) continue;
    // Счёт на ноль (стипендиат) — денег с него не ждут, значит и ставка за него
    // в потолок не входит: потолок это «если оплатят ВСЁ ВЫСТАВЛЕННОЕ».
    if ((invoicedByStudent.get(studentId) || 0) <= 0) continue;
    payableRates.set(studentId, Number(rate.amountMinor || 0));
  }
  let excludedMinor = 0;
  for (const studentId of payableRates.keys()) excludedMinor += invoicedByStudent.get(studentId) || 0;
  const excludedStudents = payableRates.size;

  // Именные ставки складываются ОДИН раз, вне цикла по компонентам: набор уже
  // отобран и дедуплицирован, а второй такой компонент в ставке (ошибка ввода)
  // иначе начислил бы тех же учеников дважды.
  let total = 0;
  for (const amountMinor of payableRates.values()) total += amountMinor;

  for (const component of components ?? []) {
    switch (component?.kind) {
      case 'salary':
        total += component.amountMinor;
        break;
      case 'percent_revenue':
        total += divRoundHalfUp(
          Math.max(0, expected.expectedMinor - excludedMinor) * component.percentBp,
          10000,
        );
        break;
      case 'per_paying_student':
        total += Math.max(0, expected.expectedStudents - excludedStudents) * component.amountMinor;
        break;
      case 'individual_students':
        // Уже сложено выше, до цикла.
        break;
      default:
        // Устаревший вид оплаты не начисляется — значит и в потолок не входит.
        break;
    }
  }
  return total;
}
