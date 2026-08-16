/**
 * API: Payroll — жизненный цикл ведомости draft → calculated → approved → paid.
 *
 * Этот файл ОРКЕСТРИРУЕТ: выбирает данные, пишет документы, стережёт переходы
 * состояний. Вся арифметика живёт в utils/payroll-engine.ts и не знает про
 * Firestore — так её можно доказать тестами без мока базы.
 *
 * Четыре свойства, ради которых код выглядит именно так:
 *
 * 1. ТОЛЬКО РАВЕНСТВО В ЗАПРОСАХ. Composite-индексы в этом проекте не
 *    задеплоены (package.json деплоит только rules+storage), поэтому ни одного
 *    orderBy, ни одного диапазона, ни одного limit-с-фильтром. Окно периода,
 *    сортировка и агрегация — в JS после выборки. Прецедент: monthly-billing.ts.
 *
 * 2. УТВЕРЖДЁННЫЙ ПЕРИОД ЗАМОРОЖЕН. Ни один путь кода не пересчитывает и не
 *    правит строки периода в состоянии approved/paid. Поздний возврат или
 *    изменение ставки создают НОВУЮ строку в следующем открытом периоде
 *    (originPeriodId), а не переписывают историю задним числом.
 *
 * 3. ВЫПЛАТА ИДЕМПОТЕНТНА И АТОМАРНА. Идентификатор расходного документа
 *    ДЕТЕРМИНИРОВАН — payoutTxId(периодId, строкаId) — и создаётся через
 *    t.create() после t.get() ТОГО ЖЕ документа внутри транзакции. Поэтому две
 *    одновременные выплаты конфликтуют на реальном документе, и вторая падает,
 *    а не коммитится. Предварительное чтение оставлено только как дешёвый
 *    быстрый путь: корректность на нём не держится.
 *
 * 3a. МЕСЯЦ НЕ ПОКРЫВАЕТСЯ ДВАЖДЫ. Зарплата общеорганизационная: одна ведомость
 *    на (организацию, месяц), филиальных больше не создаётся. Но в базе они
 *    есть — от прежней модели, — и опознавать их обязательно: ведомость филиала
 *    и общая ведомость того же месяца содержат ОДНУ И ТУ ЖЕ строку
 *    преподавателя, а ключ идемпотентности выплаты у них разный (см.
 *    coversSameTeachers). Оплатив обе, организация выдала бы оклад дважды.
 *
 * 3b. ФИЛИАЛ — ТОЛЬКО АТРИБУЦИЯ. Ни ставка, ни ведомость филиалом не сужаются:
 *    преподаватель ведёт группы в нескольких зданиях, и «двадцать процентов»
 *    относятся к человеку. Зато готовая сумма РАСКЛАДЫВАЕТСЯ по филиалам
 *    пропорционально тому, где собраны деньги (buildBranchShares), и в кассу
 *    уходит по расходу на филиал — иначе здание показывало бы прибыль без своей
 *    главной статьи затрат.
 *
 * 4. ЧИСЛА НЕ ВЫДУМЫВАЮТСЯ. Диагностики движка сохраняются на периоде и
 *    отдаются UI как «Пропущенные записи»: директор должен видеть, ПОЧЕМУ сумма
 *    меньше ожидаемой.
 *
 * Диспетчеризация по `?action=`, как в api-gradebook.ts.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import {
  verifyAuth, can, getOrgFilter, memberHoldsRole,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
} from './utils/auth';
import { batchGetUserNames, batchGetCourseNames } from './utils/finance-names';
import { parseRangeBoundary } from './utils/finance-period';
import { billingPeriodKey } from './utils/billing';
import {
  computePayroll,
  buildTeacherScopes,
  buildBranchShares,
  allocateByShares,
  collectTeacherRevenue,
  filterWindow,
  toMinor,
  type BranchShare,
  type CompensationRule,
  type FinanceTxLike,
  type GroupLike,
  type Diagnostic,
} from './utils/payroll-engine';

const PERIODS = 'payrollPeriods';
const LINES = 'payrollLines';
const RULES = 'compensationRules';
const GROUPS = 'groups';
const TRANSACTIONS = 'financeTransactions';

/** Категория расхода, в которую падает выплата. На неё же смотрит «зарплатный баланс». */
const SALARY_CATEGORY = 'salary';

/** Лимит батча Firestore — 500 операций; берём с запасом, как monthly-billing. */
const BATCH_CHUNK = 450;

// ============================================================
// Мелкие помощники
// ============================================================

function isPeriodKey(value: unknown): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value ?? ''));
}

/**
 * Окно месяца по ключу 'YYYY-MM' — в дне ОРГАНИЗАЦИИ, обе границы включительно.
 *
 * Построено ровно как ветка last_month в getPeriodRange (finance-period.ts):
 * `new Date(y, m, 0, 23,59,59,999)` — нулевой день следующего месяца это
 * последний день текущего, и он берётся КОНЦОМ суток. Полночь здесь выкинула бы
 * из зарплаты всё, что собрано в последний день месяца.
 *
 * Обратная проверка через billingPeriodKey не формальность: она гарантирует, что
 * payroll и выставление счетов понимают «2026-07» одинаково.
 */
/** Смещение календаря организации — то же, что в finance-period.ts и payroll-engine.ts. */
const ORG_OFFSET_MS = 6 * 60 * 60 * 1000;

function monthWindow(period: string): { windowStart: string; windowEnd: string } | null {
  const [y, m] = period.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  // Окно строится в КАЛЕНДАРЕ ОРГАНИЗАЦИИ (UTC+6) — как getPeriodRange, из
  // которого ту же ведомость открывает крон. Пока здесь стояли локальные
  // компоненты, один и тот же ключ месяца давал ДВА разных окна: ручной расчёт
  // на Netlify (UTC) охватывал 01.07–31.07 по UTC, а крон — те же даты в дне
  // организации. Ведомость за один месяц меняла охват в зависимости от того,
  // кто её посчитал, и «Пересчитать» сдвигало суммы без единой правки данных.
  const start = new Date(Date.UTC(y, m - 1, 1) - ORG_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999) - ORG_OFFSET_MS);
  if (billingPeriodKey(new Date(Date.UTC(y, m - 1, 1))) !== period) return null;
  return { windowStart: start.toISOString(), windowEnd: end.toISOString() };
}

/**
 * Минорные единицы → сомы для FinancialTransaction.amount.
 *
 * toFixed(2) снимает представленческую пыль double на границе: 1234567/100 в
 * IEEE-754 может дать 12345.669999999998, и такая сумма легла бы в кассовую
 * ленту дословно.
 */
function minorToSom(minor: number): number {
  return Number((minor / 100).toFixed(2));
}

/**
 * Рекурсивно убирает undefined.
 *
 * Firestore отвергает undefined в любом поле (ignoreUndefinedProperties здесь не
 * включён), а basis/diagnostics движка сплошь состоят из опциональных полей:
 * компонент 'salary' не имеет scope, диагностика без sample не имеет sample.
 * Без этой чистки первый же расчёт падал бы на записи снапшота.
 */
function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => pruneUndefined(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = pruneUndefined(v);
    }
    return out as unknown as T;
  }
  return value;
}

/** Батчи по BATCH_CHUNK операций, каждый обязательно дождаться. */
async function commitChunked(ops: Array<(batch: FirebaseFirestore.WriteBatch) => void>): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_CHUNK) {
    const batch = adminDb.batch();
    for (const op of ops.slice(i, i + BATCH_CHUNK)) op(batch);
    await batch.commit();
  }
}

interface PeriodDoc {
  id: string;
  organizationId: string;
  period: string;
  /**
   * ЛЕГАСИ. Новые ведомости филиала не несут — зарплата общеорганизационная.
   * Поле читается только у документов прежней модели, чтобы их опознать и не
   * оплатить месяц дважды (см. coversSameTeachers).
   */
  branchId?: string | null;
  state: 'draft' | 'calculated' | 'approved' | 'paid';
  windowStart: string;
  windowEnd: string;
  totalMinor?: number;
  diagnostics?: Diagnostic[];
  [key: string]: any;
}

interface LineDoc {
  id: string;
  organizationId: string;
  periodId: string;
  period: string;
  teacherId: string;
  teacherName: string;
  ruleId: string | null;
  source: 'rule' | 'manual_bonus' | 'manual_penalty' | 'refund_adjustment';
  isManual: boolean;
  computedMinor: number;
  overrideMinor: number | null;
  finalMinor: number;
  /**
   * ЛЕГАСИ (строки прежней филиальной модели). Новые строки филиала не несут —
   * вместо одного значения на строке лежит `branchShares`: разложение суммы по
   * филиалам, из которого выплата делает по расходу на филиал.
   */
  branchId?: string | null;
  branchShares?: BranchShare[];
  [key: string]: any;
}

/** Периоды организации одним equality-запросом. */
async function fetchPeriods(orgId: string, period?: string | null): Promise<PeriodDoc[]> {
  let query: FirebaseFirestore.Query = adminDb.collection(PERIODS).where('organizationId', '==', orgId);
  // Второе равенство допустимо (zig-zag merge по одиночным индексам), но только
  // равенство — никаких orderBy/limit поверх него.
  if (period) query = query.where('period', '==', period);
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PeriodDoc[];
}

/** Строки периода одним equality-запросом (организация + периодId). */
async function fetchLines(orgId: string, periodId: string): Promise<LineDoc[]> {
  const snap = await adminDb
    .collection(LINES)
    .where('organizationId', '==', orgId)
    .where('periodId', '==', periodId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as LineDoc[];
}

/** Период по id с проверкой организации. Возвращает null, если чужой/нет. */
async function loadPeriod(periodId: string, orgId: string): Promise<PeriodDoc | null> {
  const snap = await adminDb.collection(PERIODS).doc(periodId).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  if (data.organizationId !== orgId) return null;
  return { id: snap.id, ...data } as PeriodDoc;
}

/** Русское объяснение, почему изменение запрещено. Одно на все замороженные пути. */
function frozenError(state: string) {
  return jsonResponse(409, {
    error:
      state === 'paid'
        ? 'Период уже выплачен — изменения запрещены. Проведите корректировку в текущем открытом периоде.'
        : 'Период утверждён — изменения запрещены. Проведите корректировку в текущем открытом периоде.',
    state,
  });
}

/**
 * ── ПОКРЫТИЕ МЕСЯЦА ──────────────────────────────────────────────────────────
 *
 * МОДЕЛЬ, одной фразой для директора: за месяц одна ведомость, и она общая по
 * всей организации.
 *
 * Проверка ниже осталась не от старой модели, а РАДИ неё: в базе лежат
 * ведомости, посчитанные по филиалам, — их больше не создать, но они есть, и
 * общая ведомость того же месяца содержит ТУ ЖЕ строку преподавателя. Ключ
 * идемпотентности выплаты — (periodId, lineId) — у них разный, поэтому оплата
 * обеих выдала бы один оклад дважды, положила в кассу два расхода и задвоила
 * начисление в «зарплатном балансе». Ничто другое в этом файле от такого не
 * защищает: allocatePayable считает в пределах ОДНОГО периода, а payoutTxId
 * строит id из его же id.
 *
 * Между двумя новыми ведомостями (обе без филиала) функция молчит:
 * coversSameTeachers(null, null) === false — ложных 409 не будет.
 */
function coversSameTeachers(a: string | null, b: string | null): boolean {
  // Одинаковый охват — это тот же самый документ (личность ведомости), а не конфликт.
  if (a === b) return false;
  // Разные значения пересекаются РОВНО тогда, когда одно из них «вся организация».
  return a === null || b === null;
}

/** Ведомости того же месяца, чей охват пересекается с запрошенным (кроме себя самой). */
function findCoverageConflicts(
  periodsOfMonth: PeriodDoc[],
  branchId: string | null,
  selfId: string | null,
): PeriodDoc[] {
  return periodsOfMonth.filter(
    (p) => p.id !== selfId && coversSameTeachers(p.branchId ?? null, branchId),
  );
}

/**
 * Русский 409 на пересечение охвата. Текст обязан назвать МЕСЯЦ, КАКАЯ ведомость
 * уже закрывает его и ЧТО делать — «конфликт» без выхода директор прочитать не
 * сможет.
 *
 * Выход тут ровно один и он не про филиалы: незакрытую ведомость прежней модели
 * поглощает «Пересчитать» (см. calculate), а закрытую — не поглощает ничто,
 * потому что деньги по ней уже ушли.
 */
function coverageConflictError(period: string, requested: string | null, conflict: PeriodDoc) {
  const error =
    `За ${period} уже есть ведомость, посчитанная по филиалу (${conflict.state === 'paid' ? 'выплачена' : 'утверждена'}), ` +
    'и она уже включает этих преподавателей. Общая ведомость за тот же месяц начислила бы им второй раз. ' +
    'Зарплата за этот месяц закрыта — корректировки вносите премией или штрафом в текущем открытом месяце.';
  return jsonResponse(409, {
    error,
    code: 'period_coverage_conflict',
    period,
    requestedBranchId: requested,
    conflictPeriodId: conflict.id,
    conflictBranchId: conflict.branchId ?? null,
    conflictState: conflict.state,
  });
}

/**
 * Ведомость месяца, когда их в базе оказалось несколько (наследие филиальной
 * модели). Побеждает САМАЯ ЗАКРЫТАЯ: деньги важнее черновика, и показать
 * директору черновик, пока рядом лежит выплаченная ведомость, значило бы
 * предложить ему посчитать месяц заново поверх выданных денег.
 *
 * Дальше — общеорганизационная вперёд филиальной (она и есть новая модель), и
 * стабильный тай-брейк по id, чтобы выбор не зависел от порядка выборки.
 */
const SHEET_RANK: Record<string, number> = { paid: 3, approved: 2, calculated: 1, draft: 0 };

function pickMonthSheet(periodsOfMonth: PeriodDoc[]): PeriodDoc | null {
  if (!periodsOfMonth.length) return null;
  return [...periodsOfMonth].sort((a, b) => {
    const rank = (SHEET_RANK[b.state] ?? 0) - (SHEET_RANK[a.state] ?? 0);
    if (rank) return rank;
    const aOrgWide = (a.branchId ?? null) === null ? 0 : 1;
    const bOrgWide = (b.branchId ?? null) === null ? 0 : 1;
    if (aOrgWide !== bOrgWide) return aOrgWide - bOrgWide;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/**
 * Детерминированный id расходного документа выплаты.
 *
 * Единственная настоящая гарантия «не выплатить дважды»: Firestore не может
 * хранить два документа с одним id, поэтому дубликат физически невозможен —
 * в отличие от предварительного чтения, которое не атомарно записи.
 *
 * Санитайзер не косметика: id документа не должен содержать '/', быть '.'/'..'
 * или матчить /^__.*__$/. periodId и lineId здесь всегда автоid Firestore
 * (20 символов [A-Za-z0-9]), но полагаться на это нельзя — id приходит из базы.
 * Преобразование чисто функциональное, поэтому одна и та же тройка даёт один и
 * тот же id при любом повторе.
 *
 * ФИЛИАЛ В КЛЮЧЕ: одна строка ведомости разворачивается в НЕСКОЛЬКО расходов —
 * по одному на филиал, где преподаватель заработал (см. branchShares). Без
 * третьего сегмента второй расход той же строки не смог бы создаться вовсе.
 */
function payoutTxId(periodId: string, lineId: string, branchKey: string): string {
  const safe = (s: string) => String(s).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 300);
  return `pay_${safe(periodId)}_${safe(lineId)}_${safe(branchKey)}`;
}

/** Ключ филиала в идемпотентности выплаты. `null` — «филиал не определён». */
function branchKeyOf(branchId: string | null | undefined): string {
  return branchId ?? 'org';
}

/** Firestore ALREADY_EXISTS (code 6) — расход по этой строке уже создан кем-то другим. */
const DUPLICATE_PAYOUT = 'PAYROLL_DUPLICATE_PAYOUT';
function isDuplicatePayout(err: any): boolean {
  return err?.message === DUPLICATE_PAYOUT || err?.code === 6 || /already exists/i.test(String(err?.message || ''));
}

/**
 * Сколько реально выплачивать по каждой строке.
 *
 * Штраф — это строка с отрицательным finalMinor, а расход в кассе не может быть
 * отрицательным (FinancialTransaction.amount строго положителен). Платить только
 * положительные строки значило бы выдать полный оклад и молча потерять штраф,
 * поэтому штрафы учителя гасят его же положительные строки — от большей к
 * меньшей, детерминированно. Сумма выплат по учителю равна его НЕТТО-начислению.
 *
 * Распределение считается от ВСЕХ строк, а не от того, что уже записано, поэтому
 * повторный запуск после частичного сбоя даёт ровно те же суммы — идемпотентность
 * по payrollLineId сохраняется.
 */
function allocatePayable(lines: LineDoc[]): { payable: Map<string, number>; unrecovered: Map<string, number> } {
  const payable = new Map<string, number>();
  const unrecovered = new Map<string, number>();
  const byTeacher = new Map<string, LineDoc[]>();
  for (const line of lines) {
    const list = byTeacher.get(line.teacherId) ?? [];
    list.push(line);
    byTeacher.set(line.teacherId, list);
  }

  for (const [teacherId, list] of byTeacher) {
    const positives = list
      .filter((l) => (l.finalMinor || 0) > 0)
      .sort((a, b) => (b.finalMinor - a.finalMinor) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    let deficit = list.reduce((sum, l) => sum + ((l.finalMinor || 0) < 0 ? -l.finalMinor : 0), 0);

    for (const line of positives) {
      const take = Math.min(deficit, line.finalMinor);
      payable.set(line.id, line.finalMinor - take);
      deficit -= take;
    }
    // Штрафов больше, чем начислено: остаток НЕ удерживается — уже выданное не
    // отбирается (продуктовое решение «никогда не clawback»), но и не молчится.
    if (deficit > 0) unrecovered.set(teacherId, deficit);
  }

  return { payable, unrecovered };
}

/**
 * Курс/группа для расходной строки — только если атрибуция ОДНОЗНАЧНА.
 *
 * У преподавателя одной группы зарплата целиком относится к этой группе и её
 * курсу, и рентабельность курса это учитывает. У преподавателя нескольких групп
 * приписать расход одной из них наугад значит соврать отчёту, поэтому пишем
 * null — ровно как резолв groupId на доходе, который тоже не угадывает.
 *
 * Считается один раз, при расчёте, и лежит на строке: выплата не должна заново
 * выводить атрибуцию из состава групп, который к тому моменту мог измениться.
 */
function deriveAttribution(
  groupIds: string[],
  courseByGroupId: Map<string, string | null>,
): { courseId: string | null; groupId: string | null } {
  if (groupIds.length !== 1) return { courseId: null, groupId: null };
  return { groupId: groupIds[0], courseId: courseByGroupId.get(groupIds[0]) ?? null };
}

/**
 * Доля филиала в строке ведомости — с готовой атрибуцией на курс и группу.
 *
 * Хранится на строке в замороженном виде по той же причине, что и `courseId`
 * выше: состав групп к моменту выплаты успевает измениться, а расход обязан
 * лечь туда, где деньги были заработаны, а не туда, где преподаватель числится
 * сегодня.
 */
interface LineBranchShare extends BranchShare {
  courseId: string | null;
  groupId: string | null;
}

/**
 * Разложить группы преподавателя по филиалам и приписать каждой доле курс.
 *
 * Внутри одного филиала действует то же правило однозначности, что и для всей
 * строки: одна группа — есть атрибуция, несколько — null. Так рентабельность
 * курса выигрывает ровно там, где ответ известен точно.
 */
function buildLineBranchShares(
  groupIds: string[],
  byGroup: { id: string; paidMinor: number }[],
  branchByGroupId: Map<string, string | null>,
  courseByGroupId: Map<string, string | null>,
): LineBranchShare[] {
  return buildBranchShares(groupIds, byGroup, branchByGroupId).map((share) => ({
    ...share,
    ...deriveAttribution(share.groupIds, courseByGroupId),
  }));
}

/**
 * Пустое разложение — это не «денег нет», а «не к чему привязать»: премия, штраф
 * или преподаватель без групп. Такая сумма всё равно обязана попасть в кассу,
 * поэтому уходит одним расходом без филиала, а не растворяется.
 */
function sharesOrFallback(shares: LineBranchShare[] | undefined | null): LineBranchShare[] {
  return shares?.length ? shares : [{ branchId: null, weight: 1, groupIds: [], courseId: null, groupId: null }];
}

/**
 * Платежи, разложенные ГРУППА → СТУДЕНТ, в минорных единицах.
 *
 * Правило суммирования дословно то же, что в collectTeacherRevenue (плюс доход,
 * минус возврат по той же группе), поэтому сумма студентов внутри группы всегда
 * сходится с итогом группы, а сумма групп — с базой процента. Расхождение здесь
 * читалось бы как «экран врёт», и никакая подпись это не спасла бы.
 *
 * Платёж без студента (общий взнос на группу) в разбивку не попадает, но в итоге
 * группы остаётся — экран показывает такую разницу отдельной строкой.
 */
function nestPaymentsByGroup(
  groupIds: Set<string>,
  incomeTx: FinanceTxLike[],
  refundTx: FinanceTxLike[],
): Map<string, Map<string, number>> {
  const nested = new Map<string, Map<string, number>>();
  const add = (groupId: string, studentId: string, minor: number) => {
    const byStudent = nested.get(groupId) ?? new Map<string, number>();
    byStudent.set(studentId, (byStudent.get(studentId) || 0) + minor);
    nested.set(groupId, byStudent);
  };
  // toMinor, а не Math.round(amount*100): конвертация обязана быть той же самой,
  // что в ядре, иначе строка студента разойдётся с базой на тыйын — и объяснить
  // эту копейку будет нечем.
  for (const tx of incomeTx) {
    if (!tx.groupId || !groupIds.has(tx.groupId) || !tx.studentId) continue;
    add(tx.groupId, tx.studentId, toMinor(Number(tx.amount || 0)));
  }
  for (const tx of refundTx) {
    if (!tx.groupId || !groupIds.has(tx.groupId) || !tx.studentId) continue;
    add(tx.groupId, tx.studentId, -Math.abs(toMinor(Number(tx.amount || 0))));
  }
  return nested;
}

// ============================================================
// Handler
// ============================================================

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};
  const action = params.action || '';

  try {
    const orgFilter = getOrgFilter(user);
    if (!orgFilter) return badRequest('Organization context required');

    // ─────────────────────────────────────────────────────────
    // GET periods — список ведомостей
    // ─────────────────────────────────────────────────────────
    if (action === 'periods' && event.httpMethod === 'GET') {
      if (!can(user, 'payroll', 'read')) return forbidden('Нет доступа к модулю зарплаты');

      let periods = await fetchPeriods(orgFilter, params.period);
      if (params.state) periods = periods.filter((p) => p.state === params.state);
      // Сортировка в JS: orderBy поверх where требует composite-индекса.
      periods.sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));

      return ok(periods);
    }

    // ─────────────────────────────────────────────────────────
    // GET period — ведомость целиком, со строками и диагностиками
    // ─────────────────────────────────────────────────────────
    if (action === 'period' && event.httpMethod === 'GET') {
      if (!can(user, 'payroll', 'read')) return forbidden('Нет доступа к модулю зарплаты');

      const periodId = params.id;
      if (!periodId) return badRequest('id обязателен');

      const period = await loadPeriod(periodId, orgFilter);
      if (!period) return notFound('Ведомость не найдена');

      const lines = await fetchLines(orgFilter, periodId);

      // Имя учителя денормализовано при расчёте, но человек мог быть
      // переименован — досылаем только недостающие, одним batch-запросом.
      const missing = lines.filter((l) => !l.teacherName && l.teacherId).map((l) => l.teacherId);
      if (missing.length) {
        const names = await batchGetUserNames(missing);
        for (const line of lines) {
          if (!line.teacherName && names.has(line.teacherId)) line.teacherName = names.get(line.teacherId)!;
        }
      }

      lines.sort((a, b) =>
        (a.teacherName || a.teacherId).localeCompare(b.teacherName || b.teacherId, 'ru') ||
        (a.id < b.id ? -1 : 1),
      );

      return ok({
        ...period,
        lines,
        // Диагностики сохранены на периоде — UI рисует из них «Пропущенные записи».
        diagnostics: period.diagnostics ?? [],
      });
    }

    // ─────────────────────────────────────────────────────────
    // GET balance — «зарплатный баланс»: начислено − выдано
    // ─────────────────────────────────────────────────────────
    if (action === 'balance' && event.httpMethod === 'GET') {
      if (!can(user, 'payroll', 'read')) return forbidden('Нет доступа к модулю зарплаты');

      const [periods, linesSnap, txSnap] = await Promise.all([
        fetchPeriods(orgFilter),
        adminDb.collection(LINES).where('organizationId', '==', orgFilter).get(),
        adminDb
          .collection(TRANSACTIONS)
          .where('organizationId', '==', orgFilter)
          .where('categoryId', '==', SALARY_CATEGORY)
          .get(),
      ]);

      // Начислено считается только по ЗАМОРОЖЕННЫМ периодам: черновик — это
      // намерение, а не обязательство, и попадать в баланс он не должен.
      //
      // Филиала здесь нет ни на одной половине, и это не упрощение, а условие
      // сходимости: баланс — это «сколько человеку ещё должны», а долг у
      // организации перед ним ОДИН, сколько бы зданий он ни объезжал за месяц.
      // Пока половины резались по филиалу, начисление и выплата раскладывались
      // по разным осям, и строка честно показывала «Начислено 0, Выдано 30 000».
      const sealedPeriodIds = new Set<string>();
      for (const p of periods) {
        if (p.state !== 'approved' && p.state !== 'paid') continue;
        sealedPeriodIds.add(p.id);
      }

      const accrued = new Map<string, number>();
      const names = new Map<string, string>();
      for (const doc of linesSnap.docs) {
        const line = doc.data() as any;
        if (!sealedPeriodIds.has(line.periodId)) continue;
        if (!line.teacherId) continue;
        accrued.set(line.teacherId, (accrued.get(line.teacherId) || 0) + (line.finalMinor || 0));
        if (line.teacherName) names.set(line.teacherId, line.teacherName);
      }

      const paid = new Map<string, number>();
      for (const doc of txSnap.docs) {
        const tx = doc.data() as any;
        if (tx.type !== 'expense') continue;
        if (!tx.teacherId) continue;
        // Сомы → минорные единицы через целочисленное округление, чтобы разность
        // с начисленным считалась в одних единицах.
        const minor = Math.round(Number(tx.amount || 0) * 100);
        paid.set(tx.teacherId, (paid.get(tx.teacherId) || 0) + minor);
      }

      const teacherIds = [...new Set([...accrued.keys(), ...paid.keys()])];
      const missing = teacherIds.filter((id) => !names.has(id));
      if (missing.length) {
        const fetched = await batchGetUserNames(missing);
        for (const [id, name] of fetched) names.set(id, name);
      }

      const rows = teacherIds
        .map((teacherId) => {
          const accruedMinor = accrued.get(teacherId) || 0;
          const paidMinor = paid.get(teacherId) || 0;
          return {
            teacherId,
            teacherName: names.get(teacherId) || '',
            accruedMinor,
            paidMinor,
            balanceMinor: accruedMinor - paidMinor,
          };
        })
        .sort((a, b) => (a.teacherName || a.teacherId).localeCompare(b.teacherName || b.teacherId, 'ru'));

      return ok(rows);
    }

    // ─────────────────────────────────────────────────────────
    // GET overview — зарплата ОТ ПРЕПОДАВАТЕЛЯ, а не от настроек
    // ─────────────────────────────────────────────────────────
    //
    // Один запрос отвечает на весь вопрос директора: кто преподаёт, какие у него
    // группы, кто в них учится, сколько эти люди заплатили в выбранном месяце и
    // сколько из этого выходит зарплата. Раньше ответ собирался из двух вкладок и
    // трёх запросов, и связь «заплатили столько → значит зарплата такая» нигде не
    // была видна целиком.
    //
    // Суммы берутся тем же кодом, что и расчёт (collectTeacherRevenue из
    // payroll-engine): разбивка, которая не сходится со строкой ведомости,
    // бесполезна — именно ею спор с преподавателем и заканчивается.
    if (action === 'overview' && event.httpMethod === 'GET') {
      if (!can(user, 'payroll', 'read')) return forbidden('Нет доступа к модулю зарплаты');

      const period = String(params.period || '').trim() || billingPeriodKey(new Date());
      if (!isPeriodKey(period)) return badRequest('period обязателен в формате YYYY-MM');

      const derived = monthWindow(period);
      if (!derived) return badRequest('Некорректный период. Ожидается YYYY-MM.');

      // Ведомость месяца — одна. Если их в базе несколько (наследие филиальной
      // модели), берём самую закрытую: см. pickMonthSheet.
      const periodsOfMonth = await fetchPeriods(orgFilter, period);
      const sheet = pickMonthSheet(periodsOfMonth);

      // Окно ведомости, если она уже посчитана: оно ЗАМОРОЖЕНО, и предпросмотр
      // обязан считаться по нему же, иначе экран и строки разойдутся числами.
      const windowStart = sheet?.windowStart || derived.windowStart;
      const windowEnd = sheet?.windowEnd || derived.windowEnd;

      const [rulesSnap, txSnap, groupsSnap, membersSnap, branchesSnap, sheetLines] = await Promise.all([
        adminDb.collection(RULES).where('organizationId', '==', orgFilter).get(),
        adminDb.collection(TRANSACTIONS).where('organizationId', '==', orgFilter).get(),
        adminDb.collection(GROUPS).where('organizationId', '==', orgFilter).get(),
        adminDb.collection('orgMembers').doc(orgFilter).collection('members').get(),
        // Филиалы нужны не для фильтрации, а для подписи: «в каком здании
        // заработано» — это то, что директор ищет глазами, а id ему ничего не говорит.
        adminDb.collection('branches').where('organizationId', '==', orgFilter).get(),
        sheet ? fetchLines(orgFilter, sheet.id) : Promise.resolve([] as LineDoc[]),
      ]);
      const branchNameById = new Map<string, string>(
        branchesSnap.docs.map((d) => [d.id, String((d.data() as any).name || '')]),
      );

      // Ни одной филиальной резки ниже — ни у ставок, ни у групп, ни у денег, ни
      // у преподавателей. Снимать их можно только ВМЕСТЕ: оставить филиальный
      // фильтр на деньгах при общеорганизационной ставке значило бы платить
      // «двадцать процентов от всей организации» с выручки одного здания.
      const rules: CompensationRule[] = rulesSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .map((r: any) => ({
          id: r.id,
          organizationId: r.organizationId,
          teacherId: r.teacherId,
          components: Array.isArray(r.components) ? r.components : [],
          updatedAt: r.updatedAt,
        }));

      const groups: GroupLike[] = groupsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .map((g: any) => ({
          id: g.id,
          name: g.name || '',
          courseId: g.courseId ?? null,
          courseName: g.courseName || '',
          // Филиал группы в расчёт не входит — только в атрибуцию: экран
          // показывает, в каком здании заработано, и туда же уйдёт расход.
          branchId: g.branchId ?? null,
          teacherIds: Array.isArray(g.teacherIds) ? g.teacherIds : [],
          studentIds: Array.isArray(g.studentIds) ? g.studentIds : [],
        }));
      const groupById = new Map(groups.map((g) => [g.id, g]));
      const branchByGroupId = new Map<string, string | null>(groups.map((g) => [g.id, g.branchId ?? null]));
      const courseByGroupId = new Map<string, string | null>(groups.map((g) => [g.id, g.courseId ?? null]));

      const allTx = txSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const toTxLike = (t: any): FinanceTxLike => ({
        id: t.id,
        amount: Number(t.amount || 0),
        date: t.date,
        type: t.type,
        categoryId: t.categoryId,
        groupId: t.groupId ?? null,
        courseId: t.courseId ?? null,
        studentId: t.studentId ?? null,
        paymentPlanId: t.paymentPlanId ?? null,
      });
      // Окно применяем ОДИН раз, тем же кодом, что и ядро расчёта.
      const incomeTx = filterWindow(allTx.filter((t: any) => t.type === 'income').map(toTxLike), windowStart, windowEnd);
      const refundTx = filterWindow(
        allTx.filter((t: any) => t.type === 'expense' && t.paymentPlanId).map(toTxLike),
        windowStart,
        windowEnd,
      );

      const members = membersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const teacherMembers = members
        .filter((m: any) => m.status !== 'inactive' && memberHoldsRole(m, ['teacher']));
      const knownTeacherIds = teacherMembers.map((m: any) => m.uid || m.id);

      // Имена из orgMembers идут ПЕРВЫМИ: у оффлайн-студента и оффлайн-учителя
      // нет документа в `users`, и без этой карты они остались бы голыми id.
      const nameByKey = new Map<string, string>();
      for (const m of members) {
        const name = String(m.userName || m.displayName || m.name || '').trim();
        if (!name) continue;
        nameByKey.set(m.id, name);
        if (m.uid) nameByKey.set(String(m.uid), name);
      }

      const scopes = buildTeacherScopes(groups);

      // Предпросмотр: те же входы, что у расчёта. Пока ведомости нет, он и есть
      // ответ «сколько выйдет»; когда есть — служит сверкой.
      const preview = computePayroll({
        period,
        windowStart,
        windowEnd,
        rules,
        incomeTx,
        refundTx,
        groups,
        knownTeacherIds,
      });
      const previewByTeacher = new Map(preview.lines.map((l) => [l.teacherId, l]));
      const ruleByTeacher = new Map(rules.map((r) => [r.teacherId, r]));

      // Строки ведомости: расчётная — одна на преподавателя, ручные (премия,
      // штраф) — сколько угодно.
      const ruleLineByTeacher = new Map<string, LineDoc>();
      const manualLinesByTeacher = new Map<string, LineDoc[]>();
      for (const line of sheetLines) {
        if (line.isManual) {
          const list = manualLinesByTeacher.get(line.teacherId) ?? [];
          list.push(line);
          manualLinesByTeacher.set(line.teacherId, list);
        } else {
          ruleLineByTeacher.set(line.teacherId, line);
        }
      }

      // Преподаватели, о которых вообще идёт речь: сотрудники с ролью, плюс те,
      // у кого есть группы или ставка (роль могли снять, а группа осталась —
      // человек не должен исчезнуть из зарплаты молча).
      const teacherIds = [...new Set([
        ...knownTeacherIds,
        ...scopes.keys(),
        ...rules.map((r) => r.teacherId),
        ...sheetLines.map((l) => l.teacherId),
      ])].filter(Boolean);

      const missingNames = teacherIds.filter((id) => !nameByKey.has(id));
      const studentIdsAll = new Set<string>();
      for (const id of teacherIds) {
        for (const sid of scopes.get(id)?.studentIds ?? []) studentIdsAll.add(sid);
      }
      for (const sid of studentIdsAll) if (!nameByKey.has(sid)) missingNames.push(sid);
      if (missingNames.length) {
        const fetched = await batchGetUserNames(missingNames);
        for (const [id, name] of fetched) if (name) nameByKey.set(id, name);
      }

      // Курс группы: название денормализовано не везде, поэтому недостающие
      // дочитываем разом.
      const missingCourseIds = [...new Set(
        groups.filter((g) => g.courseId && !g.courseName).map((g) => g.courseId as string),
      )];
      const courseNames = missingCourseIds.length
        ? await batchGetCourseNames(orgFilter, missingCourseIds)
        : new Map<string, string>();

      const nameOf = (id: string) => nameByKey.get(id) || '';

      const teachers = teacherIds.map((teacherId) => {
        const scope = scopes.get(teacherId) ?? { groupIds: [], studentIds: [] };
        const revenue = collectTeacherRevenue(scope, incomeTx, refundTx);
        const paidByGroup = new Map(revenue.byGroup.map((s) => [s.id, s.paidMinor]));
        const nested = nestPaymentsByGroup(new Set(scope.groupIds), incomeTx, refundTx);

        const groupRows = scope.groupIds.map((groupId) => {
          const group = groupById.get(groupId);
          const paidByStudent = nested.get(groupId) ?? new Map<string, number>();
          const roster = group?.studentIds ?? [];
          const students = roster.map((studentId) => ({
            studentId,
            studentName: nameOf(studentId),
            paidMinor: paidByStudent.get(studentId) || 0,
            former: false,
          }));
          // Заплатил и ушёл из группы в том же месяце — его деньги в базе есть,
          // и строка обязана быть, иначе сумма студентов не сойдётся с группой.
          for (const [studentId, paidMinor] of paidByStudent) {
            if (!studentId || roster.includes(studentId)) continue;
            students.push({ studentId, studentName: nameOf(studentId), paidMinor, former: true });
          }
          students.sort((a, b) => b.paidMinor - a.paidMinor
            || String(a.studentName || a.studentId).localeCompare(String(b.studentName || b.studentId), 'ru'));
          const branchId = group?.branchId ?? null;
          return {
            groupId,
            name: group?.name || groupId,
            courseId: group?.courseId ?? null,
            courseName: group?.courseName || (group?.courseId ? courseNames.get(group.courseId) || '' : ''),
            branchId,
            branchName: branchId ? branchNameById.get(branchId) || '' : '',
            studentCount: roster.length,
            collectedMinor: paidByGroup.get(groupId) || 0,
            students,
          };
        });

        const line = ruleLineByTeacher.get(teacherId) || null;
        const manual = manualLinesByTeacher.get(teacherId) ?? [];
        const previewLine = previewByTeacher.get(teacherId) || null;

        // ── Сколько заработано в каждом филиале ──
        // Один преподаватель ведёт группы в разных зданиях, и «сколько ему» без
        // ответа «за что и где» не проверяется. Разложение то же самое, что
        // уйдёт в кассу расходами: у посчитанной строки берём ЗАМОРОЖЕННОЕ (на
        // нём и построена выплата), у предпросмотра считаем на лету.
        const accruedMinor = line ? line.finalMinor : (previewLine?.computedMinor ?? 0);
        const shares = (line?.branchShares as LineBranchShare[] | undefined)
          ?? buildLineBranchShares(scope.groupIds, revenue.byGroup, branchByGroupId, courseByGroupId);
        const byBranch = accruedMinor > 0
          ? allocateByShares(accruedMinor, sharesOrFallback(shares)).map((a) => ({
              branchId: a.branchId,
              branchName: a.branchId ? branchNameById.get(a.branchId) || '' : '',
              amountMinor: a.amountMinor,
              groupIds: a.groupIds,
            }))
          : [];

        return {
          teacherId,
          teacherName: nameOf(teacherId) || line?.teacherName || '',
          rule: ruleByTeacher.get(teacherId) || null,
          groups: groupRows,
          studentCount: scope.studentIds.length,
          collectedMinor: revenue.grossMinor,
          refundMinor: revenue.refundMinor,
          baseMinor: Math.max(0, revenue.netMinor),
          // Что выйдет по действующей ставке на сегодняшних данных.
          previewMinor: previewLine ? previewLine.computedMinor : null,
          previewComponents: previewLine ? previewLine.components : [],
          diagnostics: previewLine ? previewLine.diagnostics : [],
          // Разложение начисленного по филиалам. Сумма РАВНА начисленному:
          // остаток от деления раздаётся по наибольшему остатку, а не теряется.
          byBranch,
          // Что уже зафиксировано в ведомости (если она посчитана).
          line,
          manualLines: manual,
        };
      });

      teachers.sort((a, b) =>
        String(a.teacherName || a.teacherId).localeCompare(String(b.teacherName || b.teacherId), 'ru'));

      return ok({
        period,
        windowStart,
        windowEnd,
        sheet,
        lines: sheetLines,
        // Диагностики ведомости — замороженные; без ведомости показываем те, что
        // получились бы прямо сейчас.
        diagnostics: sheet ? (sheet.diagnostics ?? []) : preview.diagnostics,
        teachers,
      });
    }

    // ─────────────────────────────────────────────────────────
    // POST calculate — идемпотентная полная пересборка
    // ─────────────────────────────────────────────────────────
    if (action === 'calculate' && event.httpMethod === 'POST') {
      if (!can(user, 'payroll', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');
      const period = String(body.period || '').trim();
      if (!isPeriodKey(period)) return badRequest('period обязателен в формате YYYY-MM');

      // ── Личность ведомости — ПАРА (организация, период) ──
      // Филиал в неё не входит: зарплата общеорганизационная, и «ведомость
      // филиала» больше не существует как понятие. Права на расчёт — только
      // право payroll:write выше: сузить их филиалом теперь не по чему.
      const periodsOfMonth = await fetchPeriods(orgFilter, period);

      // ЗАКРЫТОЕ НЕ ПЕРЕСЧИТЫВАЕТСЯ — независимо от того, чем оно закрыто. Ищем
      // среди ВСЕХ ведомостей месяца, включая доставшиеся от филиальной модели:
      // деньги по ним уже ушли, и посчитать месяц заново значило бы начислить
      // тем же людям второй раз.
      const sealed = periodsOfMonth.find((p) => p.state === 'approved' || p.state === 'paid');
      if (sealed) {
        return (sealed.branchId ?? null) === null
          ? frozenError(sealed.state)
          : coverageConflictError(period, null, sealed);
      }

      // Незакрытые ведомости месяца: одну усыновляем, остальные поглощаем ниже.
      const openPeriods = periodsOfMonth.filter((p) => p.state !== 'approved' && p.state !== 'paid');
      const existing = pickMonthSheet(openPeriods);
      const absorbed = openPeriods.filter((p) => p.id !== existing?.id);

      // Окно ЗАМОРАЖИВАЕТСЯ при первом расчёте: пересчёт в августе не должен
      // менять июльские границы и втягивать в июль чужие платежи.
      const derived = monthWindow(period);
      if (!derived) return badRequest('Некорректный период. Ожидается YYYY-MM.');
      const windowStart = existing?.windowStart || derived.windowStart;
      const windowEnd = existing?.windowEnd || derived.windowEnd;

      const periodRef = existing
        ? adminDb.collection(PERIODS).doc(existing.id)
        : adminDb.collection(PERIODS).doc();
      const periodId = periodRef.id;
      const now = new Date().toISOString();

      if (!existing) {
        await periodRef.set({
          organizationId: orgFilter,
          period,
          state: 'draft',
          windowStart,
          windowEnd,
          totalMinor: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      // ── Выборка входов. Всё равенством, окно — в JS. ──
      const [rulesSnap, txSnap, groupsSnap, membersSnap] = await Promise.all([
        adminDb.collection(RULES).where('organizationId', '==', orgFilter).get(),
        adminDb.collection(TRANSACTIONS).where('organizationId', '==', orgFilter).get(),
        adminDb.collection(GROUPS).where('organizationId', '==', orgFilter).get(),
        adminDb.collection('orgMembers').doc(orgFilter).collection('members').get(),
      ]);

      // ── Никаких филиальных фильтров: ни ставки, ни группы, ни деньги, ни люди ──
      // Снимать их можно только ВМЕСТЕ. Оставить филиальную резку на деньгах при
      // общеорганизационной ставке значило бы платить процент «за организацию» с
      // выручки одного здания; оставить на группах — потерять половину студентов
      // преподавателя, который ездит между филиалами.
      const rules: CompensationRule[] = rulesSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .map((r: any) => ({
          id: r.id,
          organizationId: r.organizationId,
          teacherId: r.teacherId,
          components: Array.isArray(r.components) ? r.components : [],
          // Решает спор «какая ставка настоящая», если от филиальной модели
          // осталось несколько документов (см. resolveRules).
          updatedAt: r.updatedAt,
        }));

      // Группы — источник «его студенты» и «его деньги», а их филиал — источник
      // АТРИБУЦИИ: по нему готовая сумма раскладывается на расходы зданий.
      const groups: GroupLike[] = groupsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .map((g: any) => ({
          id: g.id,
          name: g.name || '',
          courseId: g.courseId ?? null,
          courseName: g.courseName || '',
          branchId: g.branchId ?? null,
          teacherIds: Array.isArray(g.teacherIds) ? g.teacherIds : [],
          studentIds: Array.isArray(g.studentIds) ? g.studentIds : [],
        }));
      const courseByGroupId = new Map<string, string | null>(groups.map((g) => [g.id, g.courseId ?? null]));
      const branchByGroupId = new Map<string, string | null>(groups.map((g) => [g.id, g.branchId ?? null]));

      const allTx = txSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      const toTxLike = (t: any): FinanceTxLike => ({
        id: t.id,
        amount: Number(t.amount || 0),
        date: t.date,
        type: t.type,
        categoryId: t.categoryId,
        groupId: t.groupId ?? null,
        courseId: t.courseId ?? null,
        studentId: t.studentId ?? null,
        paymentPlanId: t.paymentPlanId ?? null,
      });

      const incomeTx = allTx.filter((t: any) => t.type === 'income').map(toTxLike);
      // Возврат в этой базе — расход, привязанный к счёту (api-finance-transactions
      // POST). Именно он уменьшает базу процента, а не произвольный расход.
      const refundTx = allTx.filter((t: any) => t.type === 'expense' && t.paymentPlanId).map(toTxLike);

      // Полный список преподавателей нужен только чтобы список «нет ставки» был
      // полным: без него в него попадёт лишь тот, у кого есть группы.
      const knownTeacherIds = membersSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((m: any) => m.status !== 'inactive' && memberHoldsRole(m, ['teacher']))
        .map((m: any) => m.uid || m.id);

      const result = computePayroll({
        period,
        windowStart,
        windowEnd,
        rules,
        incomeTx,
        refundTx,
        groups,
        knownTeacherIds,
      });

      // ── Пересборка строк ──
      const currentLines = await fetchLines(orgFilter, periodId);

      // ── Поглощение незакрытых ведомостей прежней модели ──
      // За месяц могло остаться несколько филиальных черновиков. Просто
      // игнорировать их нельзя: они видны в списке, их строки попадают в
      // «зарплатный баланс», и месяц навсегда упирался бы в 409 — удаления
      // ведомости в интерфейсе нет. Поэтому одну усыновляем (её id и стал
      // periodId), а из остальных забираем ТОЛЬКО решения человека — премии и
      // штрафы: расчётные строки воспроизводятся заново из тех же данных, и
      // тащить их значило бы задвоить начисление.
      const absorbedLines: LineDoc[] = [];
      for (const stale of absorbed) {
        absorbedLines.push(...(await fetchLines(orgFilter, stale.id)));
      }
      const ops: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
      const carriedManual: LineDoc[] = [];
      for (const line of absorbedLines) {
        const ref = adminDb.collection(LINES).doc(line.id);
        if (line.isManual) {
          carriedManual.push({ ...line, periodId, period });
          // Переезд, а не копия: иначе премия existed бы дважды — в поглощённой
          // ведомости и в этой.
          ops.push((batch) => batch.update(ref, { periodId, period, branchId: null, updatedAt: now }));
        } else {
          ops.push((batch) => batch.delete(ref));
        }
      }
      for (const stale of absorbed) {
        const ref = adminDb.collection(PERIODS).doc(stale.id);
        ops.push((batch) => batch.delete(ref));
      }

      // Ручные премии и штрафы ПЕРЕЖИВАЮТ пересчёт: их вводил человек, и стереть
      // их автоматическим расчётом значило бы потерять решение директора.
      const ruleLines = currentLines.filter((l) => l.source === 'rule' && !l.isManual);
      const manualLines = [
        ...currentLines.filter((l) => !(l.source === 'rule' && !l.isManual)),
        ...carriedManual,
      ];

      const teacherIds = result.lines.map((l) => l.teacherId);
      const names = await batchGetUserNames(teacherIds);

      for (const line of ruleLines) {
        const ref = adminDb.collection(LINES).doc(line.id);
        ops.push((batch) => batch.delete(ref));
      }

      // ── Ручная правка суммы ПЕРЕЖИВАЕТ пересчёт ──
      // Комментарий выше обещает, что решение человека не сотрёт автоматический
      // расчёт, но защищал он только ОТДЕЛЬНЫЕ ручные строки — премии и штрафы.
      // Правка суммы РАСЧЁТНОЙ строки (overrideMinor вместе с обязательной
      // причиной) живёт на строке источника 'rule', и её сносило удалением
      // выше: без подтверждения и без следа, вместе с пометкой «Изменено
      // вручную: причина» в таблице и колонками «Правка» / «Причина правки» в
      // CSV-выгрузке. Директор, поправивший сумму и нажавший «Пересчитать»,
      // терял и число, и объяснение, почему оно такое.
      //
      // Переносим по паре (преподаватель, ставка): именно она определяет строку,
      // и именно её пересчёт воспроизводит заново.
      // ruleId у строки объявлен как `string | null` (ручные строки ставки не
      // имеют), поэтому нормализуем: у строк источника 'rule' он есть всегда.
      const overrideKey = (teacherId: string, ruleId: string | null) => `${teacherId}::${ruleId ?? ''}`;
      const carriedOverrides = new Map<string, { minor: number; reason: string | null }>();
      for (const line of ruleLines) {
        if (line.overrideMinor == null) continue;
        carriedOverrides.set(overrideKey(line.teacherId, line.ruleId), {
          minor: line.overrideMinor,
          reason: line.overrideReason ?? null,
        });
      }
      let overridesCarried = 0;

      // Веса для разложения по филиалам. У процента они уже посчитаны движком и
      // лежат в снапшоте; у ОКЛАДА базы нет вовсе, поэтому считаем те же деньги
      // тем же кодом — иначе оклад целиком свалился бы в один филиал, и здание,
      // где человек отработал полмесяца, показало бы прибыль без его зарплаты.
      const splitScopes = buildTeacherScopes(groups);
      const windowIncome = filterWindow(incomeTx, windowStart, windowEnd);
      const windowRefund = filterWindow(refundTx, windowStart, windowEnd);

      let totalMinor = manualLines.reduce((sum, l) => sum + (l.finalMinor || 0), 0);
      for (const computed of result.lines) {
        const ref = adminDb.collection(LINES).doc();
        const carried = carriedOverrides.get(overrideKey(computed.teacherId, computed.ruleId));
        if (carried) overridesCarried++;
        const lineGroupIds = computed.ruleSnapshot.groupIds ?? [];
        const attribution = deriveAttribution(lineGroupIds, courseByGroupId);
        // Разложение по филиалам ЗАМОРАЖИВАЕТСЯ вместе со строкой: выплата не
        // должна выводить его заново из состава групп, который к тому моменту
        // мог измениться. Веса берём из той же разбивки по группам, что легла в
        // снапшот, — тогда расходы зданий сходятся с объяснением на экране.
        const percentBasis = computed.components.find((c) => c.kind === 'percent_revenue')?.basis;
        const byGroupForSplit = percentBasis?.byGroup
          ?? collectTeacherRevenue(
            splitScopes.get(computed.teacherId) ?? { groupIds: [], studentIds: [] },
            windowIncome,
            windowRefund,
          ).byGroup;
        const branchShares = buildLineBranchShares(
          lineGroupIds,
          byGroupForSplit,
          branchByGroupId,
          courseByGroupId,
        );
        const data = pruneUndefined({
          organizationId: orgFilter,
          periodId,
          period,
          teacherId: computed.teacherId,
          teacherName: names.get(computed.teacherId) || '',
          ruleId: computed.ruleId,
          // Замороженный снапшот: ставка ПЛЮС литеральные входы каждого
          // компонента (revenueBaseMinor, sourceTxnIds, разбивка по группам и
          // студентам), чтобы число можно было восстановить, не пересчитывая.
          ruleSnapshot: {
            ...computed.ruleSnapshot,
            computed: computed.components.map((c) => ({
              kind: c.kind,
              earnedMinor: c.earnedMinor,
              basis: c.basis,
            })),
          },
          // Атрибуция расхода: заполнена только когда группа однозначна.
          courseId: attribution.courseId,
          groupId: attribution.groupId,
          // Сколько этой строки заработано в каждом филиале. Выплата развернёт
          // разложение в отдельный расход на филиал.
          branchShares,
          source: 'rule' as const,
          isManual: false,
          originPeriodId: null,
          computedMinor: computed.computedMinor,
          // Расчётная сумма пересчитана заново, а ручная правка сохранена: она
          // и есть решение человека о ЗАКОНЧЕННОЙ сумме строки.
          overrideMinor: carried ? carried.minor : null,
          overrideReason: carried ? carried.reason : null,
          finalMinor: carried ? carried.minor : computed.computedMinor,
          diagnostics: computed.diagnostics,
          createdAt: now,
        });
        totalMinor += carried ? carried.minor : computed.computedMinor;
        ops.push((batch) => batch.set(ref, data));
      }

      await commitChunked(ops);

      const periodUpdate = {
        state: 'calculated' as const,
        windowStart,
        windowEnd,
        calculatedAt: now,
        calculatedBy: user.uid,
        // Стираем филиал с усыновлённого документа прежней модели: после расчёта
        // это обычная общеорганизационная ведомость, и опознаваться как
        // «филиальная» она больше не должна — иначе проверка покрытия сочла бы её
        // конфликтующей с ней же самой в следующем месяце.
        branchId: null,
        // Предварительный итог: до approve он может измениться, поэтому
        // окончательным его считать нельзя — approve запечатывает свой.
        totalMinor,
        diagnostics: pruneUndefined(result.diagnostics),
        updatedAt: now,
      };
      await periodRef.update(periodUpdate);

      return ok({
        id: periodId,
        organizationId: orgFilter,
        period,
        // windowStart/windowEnd приходят из periodUpdate — дублировать их здесь
        // значило бы иметь два источника правды для замороженного окна.
        ...periodUpdate,
        lineCount: result.lines.length + manualLines.length,
        // Сколько ручных правок сумм пережило пересчёт. Возвращаем явно, чтобы
        // интерфейс мог сказать об этом вслух: молчаливое сохранение чужого
        // решения так же непонятно, как молчаливое стирание.
        overridesCarried,
        // Сколько ведомостей прежней филиальной модели поглощено этим расчётом.
        absorbedLegacyPeriods: absorbed.map((p) => p.id),
      });
    }

    // ─────────────────────────────────────────────────────────
    // POST line — ручная премия/штраф либо правка суммы строки
    // ─────────────────────────────────────────────────────────
    if (action === 'line' && event.httpMethod === 'POST') {
      if (!can(user, 'payroll', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');
      const periodId = String(body.periodId || '').trim();
      if (!periodId) return badRequest('periodId обязателен');

      const period = await loadPeriod(periodId, orgFilter);
      if (!period) return notFound('Ведомость не найдена');
      if (period.state === 'approved' || period.state === 'paid') return frozenError(period.state);

      const now = new Date().toISOString();

      // ── Правка существующей строки ──
      if (body.lineId) {
        const ref = adminDb.collection(LINES).doc(String(body.lineId));
        const snap = await ref.get();
        if (!snap.exists) return notFound('Строка не найдена');
        const line = snap.data() as any;
        // Организация и принадлежность периоду проверяются обе: id строки не
        // доказывает ни того, ни другого.
        if (line.organizationId !== orgFilter || line.periodId !== periodId) return forbidden();

        const updates: Record<string, any> = { updatedAt: now };

        if (body.overrideMinor !== undefined) {
          if (body.overrideMinor === null) {
            // Снятие правки возвращает строку к расчётному числу.
            updates.overrideMinor = null;
            updates.overrideReason = null;
          } else {
            const value = Number(body.overrideMinor);
            if (!Number.isInteger(value)) return badRequest('overrideMinor должен быть целым числом (минорные единицы)');
            const reason = String(body.overrideReason ?? '').trim();
            // Причина обязательна: ручная сумма без объяснения — это дыра в аудите.
            if (!reason) return badRequest('Укажите причину изменения суммы');
            updates.overrideMinor = value;
            updates.overrideReason = reason;
          }
        }

        if (body.amountMinor !== undefined) {
          if (!line.isManual) return badRequest('Расчётную строку можно только переопределить (overrideMinor)');
          const value = Number(body.amountMinor);
          if (!Number.isInteger(value)) return badRequest('amountMinor должен быть целым числом (минорные единицы)');
          updates.computedMinor = line.source === 'manual_penalty' ? -Math.abs(value) : Math.abs(value);
        }

        if (body.note !== undefined) updates.note = String(body.note ?? '');

        const computedMinor = updates.computedMinor !== undefined ? updates.computedMinor : (line.computedMinor || 0);
        const overrideMinor = updates.overrideMinor !== undefined ? updates.overrideMinor : (line.overrideMinor ?? null);
        // finalMinor = COALESCE(override, computed) — единственное место, где он выводится.
        updates.finalMinor = overrideMinor === null ? computedMinor : overrideMinor;

        await ref.update(updates);
        return ok({ id: ref.id, ...line, ...updates });
      }

      // ── Новая ручная строка ──
      const source = String(body.source || '');
      if (source !== 'manual_bonus' && source !== 'manual_penalty') {
        return badRequest("source должен быть 'manual_bonus' или 'manual_penalty'");
      }
      const teacherId = String(body.teacherId || '').trim();
      if (!teacherId) return badRequest('teacherId обязателен');
      const amount = Number(body.amountMinor);
      if (!Number.isInteger(amount) || amount === 0) {
        return badRequest('amountMinor должен быть ненулевым целым числом (минорные единицы)');
      }
      // Знак задаёт тип строки, а не каллер: премия всегда плюс, штраф всегда
      // минус, что бы ни прислала форма.
      const computedMinor = source === 'manual_penalty' ? -Math.abs(amount) : Math.abs(amount);

      const names = await batchGetUserNames([teacherId]);
      const ref = adminDb.collection(LINES).doc();
      const data = pruneUndefined({
        organizationId: orgFilter,
        periodId,
        period: period.period,
        teacherId,
        teacherName: names.get(teacherId) || '',
        ruleId: null,
        ruleSnapshot: {},
        source,
        isManual: true,
        // Корректировка закрытого периода переносится вперёд, а не переписывает
        // его: originPeriodId хранит, к какому периоду она относится по смыслу.
        originPeriodId: body.originPeriodId ?? null,
        computedMinor,
        overrideMinor: null,
        overrideReason: null,
        finalMinor: computedMinor,
        note: String(body.note ?? ''),
        // Ни филиала, ни разложения: премию и штраф выписывает человек, они не
        // «заработаны» ни в одном здании, и приписать их какому-то из них значило
        // бы выдумать атрибуцию. В кассу такая строка уходит одним расходом.
        createdBy: user.uid,
        createdAt: now,
      });
      await ref.set(data);
      return ok({ id: ref.id, ...data });
    }

    // ─────────────────────────────────────────────────────────
    // DELETE line — снять ручную строку (расчётные снимает пересчёт)
    // ─────────────────────────────────────────────────────────
    if (action === 'line' && event.httpMethod === 'DELETE') {
      if (!can(user, 'payroll', 'delete')) return forbidden('Недостаточно прав для этого действия');

      const lineId = params.id;
      if (!lineId) return badRequest('id обязателен');

      const ref = adminDb.collection(LINES).doc(lineId);
      const snap = await ref.get();
      if (!snap.exists) return notFound('Строка не найдена');
      const line = snap.data() as any;
      if (line.organizationId !== orgFilter) return forbidden();

      const period = await loadPeriod(line.periodId, orgFilter);
      if (!period) return notFound('Ведомость не найдена');
      if (period.state === 'approved' || period.state === 'paid') return frozenError(period.state);
      if (!line.isManual) return badRequest('Расчётную строку удалить нельзя — запустите пересчёт');

      await ref.delete();
      return ok({ deleted: true, id: lineId });
    }

    // ─────────────────────────────────────────────────────────
    // POST approve — ЗАМОРОЗКА
    // ─────────────────────────────────────────────────────────
    if (action === 'approve' && event.httpMethod === 'POST') {
      if (!can(user, 'payroll', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');
      const periodId = String(body.periodId || '').trim();
      if (!periodId) return badRequest('periodId обязателен');

      const period = await loadPeriod(periodId, orgFilter);
      if (!period) return notFound('Ведомость не найдена');

      // Утверждать можно ТОЛЬКО посчитанное. Черновик не утверждается (нечего
      // замораживать), утверждённое — уже заморожено.
      if (period.state !== 'calculated') {
        return jsonResponse(409, {
          error:
            period.state === 'draft'
              ? 'Ведомость не рассчитана — сначала выполните расчёт.'
              : 'Ведомость уже утверждена.',
          state: period.state,
        });
      }

      // НИЧЕГО не пересчитываем: итог складывается из того, что уже лежит в базе.
      const lines = await fetchLines(orgFilter, periodId);
      const totalMinor = lines.reduce((sum, l) => sum + (l.finalMinor || 0), 0);

      const now = new Date().toISOString();
      const updates = {
        state: 'approved' as const,
        approvedAt: now,
        approvedBy: user.uid,
        // Заморожен на периоде, чтобы итог не «поехал» вслед за строками.
        totalMinor,
        updatedAt: now,
      };
      await adminDb.collection(PERIODS).doc(periodId).update(updates);

      return ok({ ...period, ...updates, lineCount: lines.length });
    }

    // ─────────────────────────────────────────────────────────
    // POST pay — разворачивание строк в расходы кассы
    // ─────────────────────────────────────────────────────────
    if (action === 'pay' && event.httpMethod === 'POST') {
      if (!can(user, 'payroll', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');
      const periodId = String(body.periodId || '').trim();
      if (!periodId) return badRequest('periodId обязателен');

      const period = await loadPeriod(periodId, orgFilter);
      if (!period) return notFound('Ведомость не найдена');

      // 'paid' допускается сознательно: повторный вызов — это дозапись того, что
      // не прошло в прошлый раз, и он обязан быть безопасным.
      if (period.state !== 'approved' && period.state !== 'paid') {
        return jsonResponse(409, {
          error: 'Выплатить можно только утверждённую ведомость.',
          state: period.state,
        });
      }

      // ── Второй рубеж покрытия ──
      // calculate не даёт СОЗДАТЬ пересекающуюся ведомость, но пары, заведённые
      // прежней филиальной моделью, уже лежат в базе. Деньги уходят здесь,
      // поэтому здесь же проверяем ещё раз — и блокируем, только если
      // пересекающаяся ведомость реально унесла деньги (approved/paid). Ложных
      // срабатываний нет: две новые ведомости обе без филиала, а
      // coversSameTeachers(null, null) === false.
      const monthPeriods = await fetchPeriods(orgFilter, period.period);
      const sealedConflict = findCoverageConflicts(monthPeriods, period.branchId ?? null, periodId)
        .find((p) => p.state === 'approved' || p.state === 'paid');
      if (sealedConflict) {
        return coverageConflictError(period.period, period.branchId ?? null, sealedConflict);
      }

      let payoutDate = new Date().toISOString();
      if (body.date) {
        const parsed = parseRangeBoundary(String(body.date), 'start');
        if (!parsed) return badRequest('Некорректный формат даты. Ожидается YYYY-MM-DD или полная ISO-дата.');
        payoutDate = parsed.toISOString();
      }

      // ── БЫСТРЫЙ ПУТЬ, А НЕ ГАРАНТИЯ ──
      // Это чтение НЕ атомарно последующей записи: два одновременных клика оба
      // прочитают «не выплачено» и оба пойдут писать. Настоящая защита — ниже,
      // в детерминированном id расходного документа (payoutTxId) и t.create().
      // Здесь мы лишь дёшево отсекаем заведомо повторный вызов, не гоняя
      // транзакцию на каждую уже закрытую строку.
      const paidSnap = await adminDb
        .collection(TRANSACTIONS)
        .where('organizationId', '==', orgFilter)
        .where('payrollPeriodId', '==', periodId)
        .get();
      // Идемпотентность на ДВУХ уровнях, и оба обязательны.
      //
      // Строка разворачивается в несколько расходов — по одному на филиал, — и
      // после частичного сбоя повтор обязан дописать ровно недостающие. Поэтому
      // ключ теперь пара (строка, филиал).
      //
      // Но расходы, выплаченные ДО этого перехода, филиального ключа не несут:
      // они закрывают строку ЦЕЛИКОМ. Не различить их значило бы при повторной
      // выплате выдать те же деньги заново, уже по частям.
      const paidWholeLine = new Set<string>();
      const paidShare = new Set<string>();
      for (const doc of paidSnap.docs) {
        const tx = doc.data() as any;
        if (!tx.payrollLineId) continue;
        if (tx.payrollBranchKey) paidShare.add(`${tx.payrollLineId}::${tx.payrollBranchKey}`);
        else paidWholeLine.add(tx.payrollLineId);
      }

      const lines = await fetchLines(orgFilter, periodId);
      const { payable, unrecovered } = allocatePayable(lines);

      const periodRef = adminDb.collection(PERIODS).doc(periodId);
      // Множества, а не массивы: одна строка теперь порождает несколько расходов,
      // и «записано строк: 3» при трёх расходах ОДНОГО человека было бы враньём в
      // тосте. Отдельно считаем сами расходы — это разные факты.
      const written = new Set<string>();
      let writtenExpenses = 0;
      const failed: Array<{ lineId: string; error: string }> = [];
      const skipped = new Set<string>();
      // Строки, по которым расход уже существовал в момент записи: гонка или
      // ретрай долетевшего запроса. Итог верный (ровно один расход), но факт
      // сообщается явно, а не прячется в общий skipped.
      const duplicatesBlocked = new Set<string>();
      const now = new Date().toISOString();

      for (const line of lines) {
        // Строка, закрытая расходом прежней схемы (без филиального ключа), уже
        // выплачена целиком — разбивать её задним числом нечем и незачем.
        if (paidWholeLine.has(line.id)) {
          skipped.add(line.id);
          continue;
        }
        const amountMinor = payable.get(line.id) ?? 0;
        // Нулевая и отрицательная строка не порождает расхода: расход в кассе
        // строго положителен, а видимый ноль — это сигнал «ставка отработала, но
        // начислять было не с чего», а не платёж.
        if (amountMinor <= 0) {
          skipped.add(line.id);
          continue;
        }

        // ── Разворот строки в расходы по филиалам ──
        // Веса заморожены при расчёте; здесь только делим сумму К ВЫПЛАТЕ (она
        // меньше начисленной, если штраф погасил часть) и следим, чтобы сумма
        // расходов равнялась ей до тыйына.
        const shares = sharesOrFallback(line.branchShares as LineBranchShare[] | undefined);
        const allocations = allocateByShares(amountMinor, shares);

        for (const allocation of allocations) {
          // Нулевая доля расхода не порождает: филиал, где в этом месяце ничего
          // не собрано, не должен получить строку «Зарплата 0 с.».
          if (allocation.amountMinor <= 0) continue;

          const branchKey = branchKeyOf(allocation.branchId);
          if (paidShare.has(`${line.id}::${branchKey}`)) {
            skipped.add(line.id);
            continue;
          }

          // Детерминированный id: одна и та же тройка (период, строка, филиал)
          // не может дать два документа, сколько бы запросов ни пришло
          // параллельно.
          const txRef = adminDb.collection(TRANSACTIONS).doc(payoutTxId(periodId, line.id, branchKey));
          const data = pruneUndefined({
            type: 'expense',
            amount: minorToSom(allocation.amountMinor),
            date: payoutDate,
            categoryId: SALARY_CATEGORY,
            description: `Зарплата за ${period.period} — ${line.teacherName || line.teacherId}`,
            currency: null,
            paymentMethod: body.paymentMethod ?? null,
            paymentPlanId: null,
            studentId: null,
            // Атрибуция посчитана при расчёте и лежит на доле: выводить её здесь
            // заново значило бы считать по составу групп, который с тех пор мог
            // измениться, и расход уехал бы не в тот курс. У доли она точнее, чем
            // у строки: «одна группа в этом филиале» бывает и тогда, когда у
            // преподавателя групп много.
            courseId: allocation.courseId ?? line.courseId ?? null,
            groupId: allocation.groupId ?? line.groupId ?? null,
            teacherId: line.teacherId,
            // Филиал доли: у легаси-строки — её собственный, у ручной премии —
            // null (заработана не в здании, а решением директора).
            branchId: allocation.branchId ?? line.branchId ?? null,
            organizationId: orgFilter,
            // Ключи идемпотентности: по ним и только по ним повтор находит уже
            // выплаченное. payrollBranchKey отличает новую схему от прежней,
            // где одна строка закрывалась одним расходом.
            payrollPeriodId: periodId,
            payrollLineId: line.id,
            payrollBranchKey: branchKey,
            createdBy: user.uid,
            createdAt: now,
          });

          try {
            await adminDb.runTransaction(async (t) => {
              // Проверка организации ПОВТОРЯЕТСЯ внутри транзакции: чтение,
              // авторизовавшее запись, ей не атомарно.
              const snap = await t.get(periodRef);
              if (!snap.exists) throw new Error('Ведомость не найдена');
              const fresh = snap.data() as any;
              if (fresh.organizationId !== orgFilter) throw new Error('Ведомость другой организации');
              if (fresh.state !== 'approved' && fresh.state !== 'paid') {
                throw new Error('Ведомость больше не утверждена');
              }

              // Читаем ИМЕННО тот документ, который собираемся создать. Без этого
              // транзакция не конфликтует ни с чем: Firestore откатывает её только
              // при конкурентной записи в ПРОЧИТАННЫЙ документ, а periodRef никто
              // не пишет — поэтому раньше два параллельных запроса коммитились оба.
              const existingTx = await t.get(txRef);
              if (existingTx.exists) throw new Error(DUPLICATE_PAYOUT);

              // create, а не set: set перезаписал бы уже существующий расход молча.
              t.create(txRef, data);
            });
            written.add(line.id);
            writtenExpenses++;
          } catch (err: any) {
            if (isDuplicatePayout(err)) {
              // Не провал: расход по этой доле существует ровно в одном
              // экземпляре — именно этого мы и добивались.
              console.warn(`payroll: дубликат выплаты заблокирован, строка ${line.id}, филиал ${branchKey}`);
              duplicatesBlocked.add(line.id);
              skipped.add(line.id);
              continue;
            }
            failed.push({ lineId: line.id, error: err?.message || 'Ошибка записи' });
          }
        }
      }

      // Статус 'paid' ставится ТОЛЬКО когда прошли все записи. Соврать здесь
      // значит потерять невыплаченные строки навсегда: повторный запуск уже
      // ничего бы не дописал, а баланс молча разошёлся бы.
      if (!failed.length) {
        await periodRef.update({
          state: 'paid',
          paidAt: now,
          paidBy: user.uid,
          updatedAt: now,
        });
      }

      const warnings = [...unrecovered.entries()].map(([teacherId, minor]) => ({
        teacherId,
        unrecoveredMinor: minor,
        message:
          `Штрафы превысили начисленное (${(minor / 100).toFixed(2)} с.). ` +
          'Остаток не удержан — удержание из уже выданного не делается.',
      }));

      const payload = {
        id: periodId,
        state: failed.length ? period.state : 'paid',
        written: written.size,
        writtenLineIds: [...written],
        // Сколько расходных документов реально создано: у преподавателя,
        // работающего в двух филиалах, их больше, чем строк.
        writtenExpenses,
        skipped: skipped.size,
        duplicatesBlocked: duplicatesBlocked.size,
        failed,
        warnings,
      };

      // Частичный провал сообщается честно отдельным статусом, а не 200 с
      // «выплачено»: директор должен увидеть, что выплата не завершена.
      return failed.length ? jsonResponse(207, payload) : ok(payload);
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('Payroll API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
