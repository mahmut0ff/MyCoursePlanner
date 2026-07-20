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
 * 3. ВЫПЛАТА ИДЕМПОТЕНТНА И АТОМАРНА. Перед записью расходов читаем
 *    financeTransactions по равенству payrollPeriodId и пропускаем уже
 *    выплаченные строки. Каждая запись идёт через runTransaction с ПОВТОРНОЙ
 *    проверкой организации внутри — предварительная проверка не атомарна записи.
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
  verifyAuth, can, getOrgFilter, resolveBranchFilter, recordInBranchScope,
  requireBranchScope, memberInBranchScope, memberHoldsRole,
  ok, unauthorized, forbidden, badRequest, notFound, jsonResponse,
} from './utils/auth';
import { batchGetUserNames } from './utils/finance-names';
import { parseRangeBoundary } from './utils/finance-period';
import { billingPeriodKey } from './utils/billing';
import {
  computePayroll,
  type CompensationRule,
  type FinanceTxLike,
  type LessonSessionLike,
  type Diagnostic,
} from './utils/payroll-engine';

const PERIODS = 'payrollPeriods';
const LINES = 'payrollLines';
const RULES = 'compensationRules';
const SESSIONS = 'lessonSessions';
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
 * Окно месяца по ключу 'YYYY-MM' — ЛОКАЛЬНОЕ, обе границы включительно.
 *
 * Построено ровно как ветка last_month в getPeriodRange (finance-period.ts):
 * `new Date(y, m, 0, 23,59,59,999)` — нулевой день следующего месяца это
 * последний день текущего, и он берётся КОНЦОМ суток. Полночь здесь выкинула бы
 * из зарплаты всё, что собрано в последний день месяца.
 *
 * Обратная проверка через billingPeriodKey не формальность: она гарантирует, что
 * payroll и выставление счетов понимают «2026-07» одинаково.
 */
function monthWindow(period: string): { windowStart: string; windowEnd: string } | null {
  const [y, m] = period.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  if (billingPeriodKey(start) !== period) return null;
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
  branchId: string | null;
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
  branchId?: string | null;
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
 * Снапшот правила может называть несколько групп и курсов; приписать расход
 * одному из них наугад значит соврать отчёту о рентабельности курса. Несколько
 * или ноль — пишем null, как это делает резолв groupId на доходе.
 */
function deriveScopeAttribution(ruleSnapshot: any): { courseId: string | null; groupId: string | null } {
  const components: any[] = Array.isArray(ruleSnapshot?.components) ? ruleSnapshot.components : [];
  const courseIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const c of components) {
    for (const id of c?.scope?.courseIds ?? []) courseIds.add(id);
    for (const id of c?.scope?.groupIds ?? []) groupIds.add(id);
  }
  return {
    courseId: courseIds.size === 1 ? [...courseIds][0] : null,
    groupId: groupIds.size === 1 ? [...groupIds][0] : null,
  };
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

      const branchFilter = resolveBranchFilter(user, params.branchId);
      if (branchFilter === '__DENIED__') return forbidden('Access denied to requested branch');

      let periods = await fetchPeriods(orgFilter, params.period);
      periods = periods.filter((p) => recordInBranchScope(p.branchId, branchFilter));
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
      const branchError = requireBranchScope(user, period.branchId);
      if (branchError) return branchError;

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

      const branchFilter = resolveBranchFilter(user, params.branchId);
      if (branchFilter === '__DENIED__') return forbidden('Access denied to requested branch');

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
      const sealedPeriodIds = new Set(
        periods
          .filter((p) => (p.state === 'approved' || p.state === 'paid') && recordInBranchScope(p.branchId, branchFilter))
          .map((p) => p.id),
      );

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
        if (!recordInBranchScope(tx.branchId, branchFilter)) continue;
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
    // POST calculate — идемпотентная полная пересборка
    // ─────────────────────────────────────────────────────────
    if (action === 'calculate' && event.httpMethod === 'POST') {
      if (!can(user, 'payroll', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');
      const period = String(body.period || '').trim();
      if (!isPeriodKey(period)) return badRequest('period обязателен в формате YYYY-MM');

      const branchId = body.branchId ?? null;
      const branchError = requireBranchScope(user, branchId);
      if (branchError) return branchError;

      // Ищем существующую ведомость по (организация, период); филиал сверяем в
      // JS, потому что branchId бывает null, а разложить это на равенство нельзя.
      const existing = (await fetchPeriods(orgFilter, period)).find((p) => (p.branchId ?? null) === branchId) || null;

      // Правило 3: утверждённое не пересчитывается ни при каких условиях.
      if (existing && (existing.state === 'approved' || existing.state === 'paid')) {
        return frozenError(existing.state);
      }

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
          branchId,
          state: 'draft',
          windowStart,
          windowEnd,
          totalMinor: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      // ── Выборка входов. Всё равенством, окно — в JS. ──
      const [rulesSnap, txSnap, sessionsSnap, membersSnap] = await Promise.all([
        adminDb.collection(RULES)
          .where('organizationId', '==', orgFilter)
          .where('status', '==', 'active')
          .get(),
        adminDb.collection(TRANSACTIONS).where('organizationId', '==', orgFilter).get(),
        adminDb.collection(SESSIONS).where('organizationId', '==', orgFilter).get(),
        adminDb.collection('orgMembers').doc(orgFilter).collection('members').get(),
      ]);

      // Ведомость филиала берёт только ставки этого филиала: org-wide правило,
      // применённое в каждом филиале, выплатило бы оклад по разу на филиал.
      const rules: CompensationRule[] = rulesSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((r: any) => recordInBranchScope(r.branchId ?? null, branchId))
        .map((r: any) => ({
          id: r.id,
          organizationId: r.organizationId,
          teacherId: r.teacherId,
          branchId: r.branchId ?? null,
          label: r.label ?? '',
          status: r.status,
          components: Array.isArray(r.components) ? r.components : [],
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo ?? null,
        }));

      const allTx = txSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((t: any) => recordInBranchScope(t.branchId ?? null, branchId));

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

      const sessions: LessonSessionLike[] = sessionsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((s: any) => recordInBranchScope(s.branchId ?? null, branchId))
        .map((s: any) => ({
          id: s.id,
          groupId: s.groupId ?? null,
          courseId: s.courseId ?? null,
          // Не подставляем никакой фолбэк: null здесь ЗНАЧИМ — сессия ничья.
          teacherId: s.teacherId ?? null,
          date: s.date,
          durationMinutes: typeof s.durationMinutes === 'number' ? s.durationMinutes : null,
          status: s.status,
          headcount: Number(s.headcount || 0),
        }));

      // Полный список учителей нужен только чтобы список «нет ставки» был полным:
      // без него в него попадёт лишь тот, у кого есть проведённые сессии в окне.
      const knownTeacherIds = membersSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((m: any) => m.status !== 'inactive' && memberHoldsRole(m, ['teacher']))
        .filter((m: any) => memberInBranchScope(m.branchIds, branchId))
        .map((m: any) => m.uid || m.id);

      const result = computePayroll({
        period,
        windowStart,
        windowEnd,
        rules,
        incomeTx,
        refundTx,
        sessions,
        knownTeacherIds,
      });

      // ── Пересборка строк ──
      const currentLines = await fetchLines(orgFilter, periodId);
      // Ручные премии и штрафы ПЕРЕЖИВАЮТ пересчёт: их вводил человек, и стереть
      // их автоматическим расчётом значило бы потерять решение директора.
      const ruleLines = currentLines.filter((l) => l.source === 'rule' && !l.isManual);
      const manualLines = currentLines.filter((l) => !(l.source === 'rule' && !l.isManual));

      const teacherIds = result.lines.map((l) => l.teacherId);
      const names = await batchGetUserNames(teacherIds);

      const ops: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
      for (const line of ruleLines) {
        const ref = adminDb.collection(LINES).doc(line.id);
        ops.push((batch) => batch.delete(ref));
      }

      let totalMinor = manualLines.reduce((sum, l) => sum + (l.finalMinor || 0), 0);
      for (const computed of result.lines) {
        const ref = adminDb.collection(LINES).doc();
        const ruleBranch = rules.find((r) => r.id === computed.ruleId)?.branchId ?? branchId;
        const data = pruneUndefined({
          organizationId: orgFilter,
          periodId,
          period,
          teacherId: computed.teacherId,
          teacherName: names.get(computed.teacherId) || '',
          ruleId: computed.ruleId,
          // Замороженный снапшот: разрешённое правило ПЛЮС литеральные входы
          // каждого компонента (revenueBaseMinor, sourceTxnIds, sessionCount…),
          // чтобы число можно было восстановить, не пересчитывая.
          ruleSnapshot: {
            ...computed.ruleSnapshot,
            computed: computed.components.map((c) => ({
              kind: c.kind,
              earnedMinor: c.earnedMinor,
              basis: c.basis,
            })),
          },
          source: 'rule' as const,
          isManual: false,
          originPeriodId: null,
          computedMinor: computed.computedMinor,
          overrideMinor: null,
          overrideReason: null,
          finalMinor: computed.computedMinor,
          diagnostics: computed.diagnostics,
          branchId: ruleBranch,
          createdAt: now,
        });
        totalMinor += computed.computedMinor;
        ops.push((batch) => batch.set(ref, data));
      }

      await commitChunked(ops);

      const periodUpdate = {
        state: 'calculated' as const,
        windowStart,
        windowEnd,
        calculatedAt: now,
        calculatedBy: user.uid,
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
        branchId,
        // windowStart/windowEnd приходят из periodUpdate — дублировать их здесь
        // значило бы иметь два источника правды для замороженного окна.
        ...periodUpdate,
        lineCount: result.lines.length + manualLines.length,
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
      const branchError = requireBranchScope(user, period.branchId);
      if (branchError) return branchError;
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
        branchId: period.branchId ?? null,
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
      const branchError = requireBranchScope(user, period.branchId);
      if (branchError) return branchError;
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
      const branchError = requireBranchScope(user, period.branchId);
      if (branchError) return branchError;

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
      const branchError = requireBranchScope(user, period.branchId);
      if (branchError) return branchError;

      // 'paid' допускается сознательно: повторный вызов — это дозапись того, что
      // не прошло в прошлый раз, и он обязан быть безопасным.
      if (period.state !== 'approved' && period.state !== 'paid') {
        return jsonResponse(409, {
          error: 'Выплатить можно только утверждённую ведомость.',
          state: period.state,
        });
      }

      let payoutDate = new Date().toISOString();
      if (body.date) {
        const parsed = parseRangeBoundary(String(body.date), 'start');
        if (!parsed) return badRequest('Некорректный формат даты. Ожидается YYYY-MM-DD или полная ISO-дата.');
        payoutDate = parsed.toISOString();
      }

      // ── ИДЕМПОТЕНТНОСТЬ ПЕРВЫМ ДЕЛОМ ──
      // Равенство по организации и периоду; какие строки уже закрыты, разбираем
      // в JS. Без этого повторный клик выдал бы зарплату дважды.
      const paidSnap = await adminDb
        .collection(TRANSACTIONS)
        .where('organizationId', '==', orgFilter)
        .where('payrollPeriodId', '==', periodId)
        .get();
      const alreadyPaid = new Set<string>(
        paidSnap.docs.map((d) => (d.data() as any).payrollLineId).filter(Boolean),
      );

      const lines = await fetchLines(orgFilter, periodId);
      const { payable, unrecovered } = allocatePayable(lines);

      const periodRef = adminDb.collection(PERIODS).doc(periodId);
      const written: string[] = [];
      const failed: Array<{ lineId: string; error: string }> = [];
      const skipped: string[] = [];
      const now = new Date().toISOString();

      for (const line of lines) {
        if (alreadyPaid.has(line.id)) {
          skipped.push(line.id);
          continue;
        }
        const amountMinor = payable.get(line.id) ?? 0;
        // Нулевая и отрицательная строка не порождает расхода: расход в кассе
        // строго положителен, а видимый ноль — это сигнал «ставка отработала, но
        // начислять было не с чего», а не платёж.
        if (amountMinor <= 0) {
          skipped.push(line.id);
          continue;
        }

        const attribution = deriveScopeAttribution(line.ruleSnapshot);
        const txRef = adminDb.collection(TRANSACTIONS).doc();
        const data = pruneUndefined({
          type: 'expense',
          amount: minorToSom(amountMinor),
          date: payoutDate,
          categoryId: SALARY_CATEGORY,
          description: `Зарплата за ${period.period} — ${line.teacherName || line.teacherId}`,
          currency: null,
          paymentMethod: body.paymentMethod ?? null,
          paymentPlanId: null,
          studentId: null,
          courseId: attribution.courseId,
          groupId: attribution.groupId,
          teacherId: line.teacherId,
          branchId: line.branchId ?? period.branchId ?? null,
          organizationId: orgFilter,
          // Ключи идемпотентности: по ним и только по ним повтор находит уже
          // выплаченное.
          payrollPeriodId: periodId,
          payrollLineId: line.id,
          createdBy: user.uid,
          createdAt: now,
        });

        try {
          await adminDb.runTransaction(async (t) => {
            // Проверка организации ПОВТОРЯЕТСЯ внутри транзакции: чтение,
            // авторизовавшее запись, ей не атомарно.
            const snap = await t.get(periodRef);
            t.set(txRef, data);
            if (!snap.exists) throw new Error('Ведомость не найдена');
            const fresh = snap.data() as any;
            if (fresh.organizationId !== orgFilter) throw new Error('Ведомость другой организации');
            if (fresh.state !== 'approved' && fresh.state !== 'paid') {
              throw new Error('Ведомость больше не утверждена');
            }
          });
          written.push(line.id);
        } catch (err: any) {
          failed.push({ lineId: line.id, error: err?.message || 'Ошибка записи' });
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
        written: written.length,
        writtenLineIds: written,
        skipped: skipped.length,
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
