/**
 * Scheduled Function: Payroll Accrual (ежемесячное открытие ведомости)
 *
 * Идёт 1-го числа каждого месяца (netlify.toml, `0 7 1 * *` — через час после
 * monthly-billing, чтобы выставленные счёта уже лежали в базе). Для каждой
 * организации, у которой есть тариф с зарплатным модулем и хотя бы одна
 * действующая ставка, открывает ведомость за ПРЕДЫДУЩИЙ месяц и сразу
 * прогоняет первый расчёт.
 *
 * ЧТО ОНА НАМЕРЕННО НЕ ДЕЛАЕТ: не утверждает (approve) и не выплачивает (pay).
 * Деньги уходят из кассы только по решению человека — крон готовит цифры,
 * директор их смотрит, правит оверрайдами/бонусами и утверждает руками. Поэтому
 * период создаётся в состоянии 'calculated' (расчёт прогнан, но ничего не
 * заморожено): calculate законен в draft/calculated, так что директор может
 * пересчитать сколько угодно раз до утверждения.
 *
 * Идемпотентность — по РАВЕНСТВУ `period`, как в monthly-billing, а не по
 * времени запуска: если ведомость за этот месяц уже существует в ЛЮБОМ
 * состоянии (в том числе утверждённая или выплаченная), организация
 * пропускается. Утверждённый период не пересчитывается ни одним путём кода.
 *
 * Все запросы — только на равенство (composite-индексы не задеплоены):
 * никаких orderBy, никаких диапазонов. Окно и агрегация — в JS, ядром
 * utils/payroll-engine.
 *
 * Trigger via: scheduled run, или POST /.netlify/functions/payroll-accrual для теста.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { notifyOrgAdmins } from './utils/notifications';
import { jsonResponse, memberHoldsRole } from './utils/auth';
import { membershipIsActive } from './utils/payroll-default-rate';
import { billingPeriodKey } from './utils/billing';
import { getPeriodRange } from './utils/finance-period';
import { batchGetUserNames } from './utils/finance-names';
import {
  computePayroll,
  buildTeacherScopes,
  buildBranchShares,
  collectTeacherRevenue,
  filterWindow,
  type CompensationRule,
  type FinanceTxLike,
  type GroupLike,
} from './utils/payroll-engine';
import { cronAccessError } from './utils/cron-auth';

const RULES = 'compensationRules';
const PERIODS = 'payrollPeriods';
const LINES = 'payrollLines';
const TRANSACTIONS = 'financeTransactions';
const GROUPS = 'groups';

/** Батч Firestore держит 500 операций; 450 — тот же запас, что берут остальные кроны. */
const BATCH_CHUNK = 450;

/**
 * Тарифы с зарплатным модулем. Зеркалит FEATURE_MIN_PLAN.payroll = 'professional'
 * из src/types/index.ts; алиасы старых id перечислены так же, как в
 * utils/plan-limits.ts AI_MANAGER_PLANS, чтобы организация на легаси-плане не
 * выпала из начисления молча.
 */
const PAYROLL_PLANS = ['professional', 'pro', 'expert', 'enterprise'];

function fmtMinor(minor: number): string {
  try { return (minor / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  catch { return String(minor / 100); }
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  // Публичный HTTP-адрес есть и у запланированной функции: без этой проверки
  // прогон мог запустить кто угодно и сколько угодно раз.
  const cronDenied = await cronAccessError(event);
  if (cronDenied) return cronDenied;

  const runDate = new Date();
  // Период считается ОДИН раз на весь прогон: если функция перевалит полночь
  // 1-го числа, половина организаций не должна получить ведомость за другой месяц.
  // Якорь — 1-е число предыдущего месяца, ключ — та же billingPeriodKey, что у
  // счетов: «2026-07» обязан значить одно и то же в биллинге и в зарплате.
  const periodAnchor = new Date(runDate.getFullYear(), runDate.getMonth() - 1, 1);
  const period = billingPeriodKey(periodAnchor);
  // Окно собранной выручки и сессий = полный предыдущий месяц. getPeriodRange —
  // тот же код, что размечает финансовые вкладки, поэтому «Собрано за июль» в
  // финансах и база процента в зарплате совпадут до копейки.
  const { startIso: windowStart, endIso: windowEnd } = getPeriodRange('last_month', runDate);
  const ts = runDate.toISOString();

  try {
    // Кросс-организационный свип по ставкам — единственный запрос без орг-фильтра
    // (как courses в monthly-billing). Организации без единой ставки в него просто
    // не попадают: начислять им нечего.
    const ruleSnap = await adminDb.collection(RULES).get();

    const rulesByOrg = new Map<string, CompensationRule[]>();
    for (const d of ruleSnap.docs) {
      const r = d.data() as any;
      if (!r?.organizationId || !r?.teacherId) continue;
      const list = rulesByOrg.get(r.organizationId) ?? [];
      list.push({ id: d.id, ...r } as CompensationRule);
      rulesByOrg.set(r.organizationId, list);
    }

    let orgsConsidered = 0;
    let orgsSkippedPlan = 0;
    let orgsSkippedExisting = 0;
    let periodsOpened = 0;
    let linesCreated = 0;

    // Уведомления — ПОСЛЕ коммита, чтобы упавший push не откатывал ведомость.
    const notifyQueue: { orgId: string; periodId: string; teachers: number; totalMinor: number }[] = [];

    for (const [orgId, rules] of rulesByOrg) {
      orgsConsidered++;

      // ── Тарифный гейт ────────────────────────────────────────────────────
      const orgDoc = await adminDb.collection('organizations').doc(orgId).get();
      if (!orgDoc.exists) continue;
      const planId = orgDoc.data()?.planId || 'starter';
      if (!PAYROLL_PLANS.includes(planId)) { orgsSkippedPlan++; continue; }

      // ── Идемпотентность: по равенству period, не по времени запуска ──────
      // Любое состояние считается «уже открыто»: повторный прогон не имеет права
      // ни продублировать черновик, ни тем более тронуть approved/paid.
      //
      // Ведомость за месяц одна на организацию — филиального среза нет, поэтому
      // и сужать проверку не по чему. Ведомости прежней филиальной модели, если
      // они за этот месяц ещё лежат в базе, тоже считаются покрытием: наложить
      // на них общую значило бы начислить тем же людям второй раз. Разгребает
      // такой месяц человек — одно «Пересчитать» в интерфейсе поглощает
      // незакрытые остатки (см. calculate в api-payroll.ts).
      const existing = await adminDb.collection(PERIODS)
        .where('organizationId', '==', orgId)
        .where('period', '==', period)
        .get();
      if (!existing.empty) {
        orgsSkippedExisting++;
        continue;
      }

      // ── Данные для расчёта ───────────────────────────────────────────────
      // Только равенство по организации; окно применяет ядро. Намеренно НЕ
      // подрезаем выборку датой заранее: границы окна включительны, и правило
      // «что попадает в период» должно жить в одном месте (payroll-engine),
      // иначе платёж ровно на границе месяца потеряется незаметно.
      const [txSnap, groupSnap, memberSnap] = await Promise.all([
        adminDb.collection(TRANSACTIONS).where('organizationId', '==', orgId).get(),
        adminDb.collection(GROUPS).where('organizationId', '==', orgId).get(),
        // Весь состав, а не `where('role','==','teacher')`: у мульти-ролевого
        // сотрудника преподавательская роль лежит в `roles[]`, и такой запрос его
        // терял. Роль и статус проверяем в JS теми же предикатами, что ручной
        // расчёт, — иначе крон и кнопка «Рассчитать» дали бы разные ведомости.
        adminDb.collection('orgMembers').doc(orgId).collection('members').get(),
      ]);

      const incomeTx: FinanceTxLike[] = [];
      const refundTx: FinanceTxLike[] = [];
      for (const d of txSnap.docs) {
        const t = d.data() as any;
        const row: FinanceTxLike = {
          id: d.id,
          amount: Number(t.amount || 0),
          date: String(t.date || ''),
          type: t.type,
          categoryId: t.categoryId,
          groupId: t.groupId ?? null,
          courseId: t.courseId ?? null,
          studentId: t.studentId ?? null,
          paymentPlanId: t.paymentPlanId ?? null,
        };
        if (t.type === 'income') incomeTx.push(row);
        // Возврат — расходная строка, привязанная к счёту. Это ровно то
        // определение, по которому api-finance-transactions снимает деньги с
        // оплаченного (planSideEffect, знак −1); категория 'refund' — лишь то,
        // что проставляет UI, и опираться только на неё значило бы пропустить
        // возврат, заведённый вручную.
        else if (t.type === 'expense' && t.paymentPlanId) refundTx.push(row);
      }

      // Группы — источник «чьи это студенты и чьи деньги», а их филиал — источник
      // атрибуции: расчёт филиалом не сужается, но готовая сумма раскладывается
      // по зданиям (см. buildBranchShares).
      const groups: GroupLike[] = groupSnap.docs.map(d => {
        const g = d.data() as any;
        return {
          id: d.id,
          name: g.name || '',
          courseId: g.courseId ?? null,
          courseName: g.courseName || '',
          branchId: g.branchId ?? null,
          teacherIds: Array.isArray(g.teacherIds) ? g.teacherIds : [],
          studentIds: Array.isArray(g.studentIds) ? g.studentIds : [],
        };
      });
      const courseByGroupId = new Map<string, string | null>(groups.map(g => [g.id, g.courseId ?? null]));
      const branchByGroupId = new Map<string, string | null>(groups.map(g => [g.id, g.branchId ?? null]));
      // Те же входы, что у ручного расчёта: веса разложения по филиалам считаются
      // по деньгам окна, а у оклада собственной базы нет — её надо собрать здесь.
      const splitScopes = buildTeacherScopes(groups);
      const windowIncome = filterWindow(incomeTx, windowStart, windowEnd);
      const windowRefund = filterWindow(refundTx, windowStart, windowEnd);

      // Действующие преподаватели организации. Нужны и ради честного списка «нет
      // ставки», и — главное — чтобы не начислить тому, кого в организации уже
      // нет: ставка удалённого могла пережить увольнение (прежние модели, ручная
      // правка), а крон работает без человека и молча создал бы ему строку.
      const activeTeacherIds = new Set<string>(
        memberSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter((m: any) => membershipIsActive(m) && memberHoldsRole(m, ['teacher']))
          .map((m: any) => String(m.uid || m.userId || m.id))
          .filter(Boolean),
      );
      const knownTeacherIds = [...activeTeacherIds];
      // Ставки людей вне этого списка в расчёт не идут — ровно как в ручном
      // расчёте (api-payroll.ts, ветка calculate), и по той же причине.
      const payableRules = rules.filter((r: any) => activeTeacherIds.has(String(r.teacherId)));
      const strandedRules = rules.filter((r: any) => !activeTeacherIds.has(String(r.teacherId)));

      const result = computePayroll({
        period,
        windowStart,
        windowEnd,
        rules: payableRules,
        incomeTx,
        refundTx,
        groups,
        knownTeacherIds,
      });

      // Имя преподавателя денормализуется в строку: расчётный лист должен
      // читаться и через год, когда учителя в организации уже нет.
      const names = await batchGetUserNames(result.lines.map(l => l.teacherId));

      const periodRef = adminDb.collection(PERIODS).doc();
      const totalMinor = result.lines.reduce((sum, l) => sum + l.computedMinor, 0);

      // ОДИН период на организацию и месяц — та же модель, что у ручного
      // расчёта: зарплата общеорганизационная, филиальных ведомостей больше нет.
      const writes: { ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }[] = [{
        ref: periodRef,
        data: {
          organizationId: orgId,
          period,
          // 'calculated', а не 'draft': расчёт уже прогнан. Ни approve, ни pay
          // крон не делает — деньги двигает только человек.
          state: 'calculated',
          windowStart,
          windowEnd,
          calculatedAt: ts,
          calculatedBy: 'system:payroll-accrual',
          // Текущий итог; ЗАМОРАЖИВАЕТСЯ на approve, здесь он ещё пересчитываемый.
          totalMinor,
          // Диагностики сохраняются вместе с периодом, а не пересчитываются на
          // чтении: после заморозки восстановить их будет уже не из чего.
          diagnostics: [
            ...result.diagnostics,
            ...(strandedRules.length
              ? [{
                  code: 'rule_no_components' as const,
                  message:
                    `Ставок у людей, которых нет в организации: ${strandedRules.length}. ` +
                    'Они не начислены — платить тому, кто уволен или удалён, нельзя. ' +
                    'Если человек работает, верните его в организацию; иначе уберите ставку.',
                  count: strandedRules.length,
                  sample: strandedRules.slice(0, 5).map((r: any) => String(r.teacherId)),
                }]
              : []),
          ],
          autoOpened: true,
          createdAt: ts,
          updatedAt: ts,
        },
      }];

      for (const line of result.lines) {
        // Атрибуция расхода: только когда группа однозначна — иначе зарплата
        // уехала бы в рентабельность случайного курса. То же правило, что в
        // ручном расчёте (deriveAttribution в api-payroll.ts).
        const lineGroupIds = line.ruleSnapshot.groupIds ?? [];
        const attributionGroupId = lineGroupIds.length === 1 ? lineGroupIds[0] : null;
        // Разложение по филиалам замораживается вместе со строкой — дословно как
        // в ручном расчёте, иначе кроновая и пересчитанная ведомости одного
        // месяца разошлись бы по срезам отчётности.
        const percentBasis = line.components.find((c) => c.kind === 'percent_revenue')?.basis;
        const byGroupForSplit = percentBasis?.byGroup
          ?? collectTeacherRevenue(
            splitScopes.get(line.teacherId) ?? { groupIds: [], studentIds: [] },
            windowIncome,
            windowRefund,
          ).byGroup;
        const branchShares = buildBranchShares(lineGroupIds, byGroupForSplit, branchByGroupId).map((share) => ({
          ...share,
          groupId: share.groupIds.length === 1 ? share.groupIds[0] : null,
          courseId: share.groupIds.length === 1 ? courseByGroupId.get(share.groupIds[0]) ?? null : null,
        }));
        writes.push({
          ref: adminDb.collection(LINES).doc(),
          data: {
            organizationId: orgId,
            periodId: periodRef.id,
            period,
            teacherId: line.teacherId,
            teacherName: names.get(line.teacherId) || '',
            ruleId: line.ruleId,
            // Замороженная ставка + литеральные входы каждого компонента
            // (revenueBaseMinor, sourceTxnIds, разбивка по группам и студентам):
            // директор обязан восстановить сумму, не пересчитывая её заново.
            ruleSnapshot: { ...line.ruleSnapshot, computed: line.components },
            courseId: attributionGroupId ? courseByGroupId.get(attributionGroupId) ?? null : null,
            groupId: attributionGroupId,
            branchShares,
            source: 'rule',
            // Строки крона пересобираются при следующем calculate; переживают
            // пересчёт только ручные бонусы/штрафы.
            isManual: false,
            originPeriodId: null,
            computedMinor: line.computedMinor,
            overrideMinor: null,
            overrideReason: null,
            finalMinor: line.computedMinor,
            createdAt: ts,
          },
        });
      }

      // Чанкованные батчи: период и его строки — по 1 записи каждая.
      for (let i = 0; i < writes.length; i += BATCH_CHUNK) {
        const batch = adminDb.batch();
        for (const w of writes.slice(i, i + BATCH_CHUNK)) batch.set(w.ref, w.data);
        await batch.commit();
      }

      periodsOpened++;
      linesCreated += result.lines.length;
      notifyQueue.push({ orgId, periodId: periodRef.id, teachers: result.lines.length, totalMinor });
    }

    // Best-effort после коммита: ведомость уже в базе, а до директора уведомление
    // может и не дойти (нет Telegram, отключён push) — это не повод падать.
    await Promise.allSettled(notifyQueue.map(n =>
      notifyOrgAdmins(
        n.orgId,
        'payroll_ready',
        'Зарплата за месяц посчитана — проверьте',
        `Расчёт за ${period}: ${n.teachers} преподавател(я/ей) на ${fmtMinor(n.totalMinor)} с. ` +
        'Проверьте суммы и утвердите — без утверждения выплата не производится.',
        '/payroll',
      )
    ));

    return jsonResponse(200, {
      success: true,
      period,
      windowStart,
      windowEnd,
      orgsConsidered,
      orgsSkippedPlan,
      orgsSkippedExisting,
      periodsOpened,
      linesCreated,
    });
  } catch (error: any) {
    console.error('Payroll accrual error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
