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
import { jsonResponse } from './utils/auth';
import { billingPeriodKey } from './utils/billing';
import { getPeriodRange } from './utils/finance-period';
import { batchGetUserNames } from './utils/finance-names';
import {
  computePayroll,
  type CompensationRule,
  type FinanceTxLike,
  type LessonSessionLike,
} from './utils/payroll-engine';

const RULES = 'compensationRules';
const PERIODS = 'payrollPeriods';
const LINES = 'payrollLines';
const TRANSACTIONS = 'financeTransactions';
const SESSIONS = 'lessonSessions';

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
    // Кросс-организационный свип по действующим ставкам — единственный запрос без
    // орг-фильтра (как courses в monthly-billing). Организации без единой активной
    // ставки в него просто не попадают: начислять им нечего.
    const ruleSnap = await adminDb.collection(RULES).where('status', '==', 'active').get();

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
    let orgsSkippedBranchScheme = 0;
    let periodsOpened = 0;
    let linesCreated = 0;

    // Уведомления — ПОСЛЕ коммита, чтобы упавший push не откатывал ведомость.
    const notifyQueue: { orgId: string; periodId: string; teachers: number; totalMinor: number }[] = [];
    const branchSchemeNotices: { orgId: string; openCount: number }[] = [];

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
      // Проверка НАМЕРЕННО не сужается филиалом. Месяц в этой системе покрывается
      // либо одной общей ведомостью, либо отдельными филиальными (взаимное
      // исключение, см. coversSameTeachers в api-payroll.ts). Любая уже открытая
      // ведомость за этот месяц — в том числе филиальная, заведённая директором
      // руками, — означает, что месяц уже кем-то покрыт, и общая ведомость от
      // крона наложилась бы на неё, оплатив тех же преподавателей второй раз.
      const existing = await adminDb.collection(PERIODS)
        .where('organizationId', '==', orgId)
        .where('period', '==', period)
        .get();
      if (!existing.empty) {
        orgsSkippedExisting++;
        // Если месяц начат ФИЛИАЛЬНЫМИ ведомостями, крон дальше не помощник:
        // достроить недостающие филиалы он не может, не рискуя охватом. Молча
        // не покрыть половину академии зарплатой — худший из возможных исходов,
        // поэтому директору уходит явное уведомление, а не тишина.
        const branchScheme = existing.docs.some((d) => (d.data() as any).branchId != null);
        if (branchScheme) {
          orgsSkippedBranchScheme++;
          branchSchemeNotices.push({ orgId, openCount: existing.size });
        }
        continue;
      }

      // ── Данные для расчёта ───────────────────────────────────────────────
      // Только равенство по организации; окно применяет ядро. Намеренно НЕ
      // подрезаем выборку датой заранее: границы окна включительны, и правило
      // «что попадает в период» должно жить в одном месте (payroll-engine),
      // иначе платёж ровно на границе месяца потеряется незаметно.
      const [txSnap, sessionSnap, memberSnap] = await Promise.all([
        adminDb.collection(TRANSACTIONS).where('organizationId', '==', orgId).get(),
        adminDb.collection(SESSIONS).where('organizationId', '==', orgId).get(),
        adminDb.collection('orgMembers').doc(orgId).collection('members')
          .where('role', '==', 'teacher').get(),
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

      const sessions: LessonSessionLike[] = sessionSnap.docs.map(d => {
        const s = d.data() as any;
        return {
          id: d.id,
          groupId: s.groupId ?? null,
          courseId: s.courseId ?? null,
          // `?? null`, не `|| null`: teacherId никогда не пустая строка, а null от
          // «несколько преподавателей и никто не выбран» обязан дойти до ядра как
          // null — такая сессия не принадлежит никому и не оплачивается.
          teacherId: s.teacherId ?? null,
          date: String(s.date || ''),
          durationMinutes: typeof s.durationMinutes === 'number' ? s.durationMinutes : null,
          status: s.status === 'held' ? 'held' : 'cancelled',
          headcount: Number(s.headcount || 0),
        };
      });

      // Полный список преподавателей нужен только ради честного списка «нет
      // ставки»: без него в диагностику попадёт лишь тот, у кого были сессии.
      const knownTeacherIds = memberSnap.docs.map(d => (d.data() as any).userId || d.id).filter(Boolean);

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

      // Имя преподавателя денормализуется в строку: расчётный лист должен
      // читаться и через год, когда учителя в организации уже нет.
      const names = await batchGetUserNames(result.lines.map(l => l.teacherId));

      const periodRef = adminDb.collection(PERIODS).doc();
      const totalMinor = result.lines.reduce((sum, l) => sum + l.computedMinor, 0);

      // ОДИН общеорганизационный период (branchId: null) — сознательно, а не по
      // недосмотру. Рассматривали «по ведомости на каждый филиал с активными
      // ставками» и отвергли: ставка с branchId === null (а таких большинство —
      // это дефолт формы) не попадает НИ В ОДНУ филиальную ведомость, потому что
      // recordInBranchScope(null, 'A') === false. Крон, режущий по филиалам,
      // молча не начислил бы таким преподавателям ничего — а невидимый ноль в
      // зарплате хуже, чем ведомость, которую директор потом отфильтрует в UI.
      // Общая ведомость — единственная форма, покрывающая КАЖДУЮ ставку ровно раз.
      // Организации, ведущие месяц филиальными ведомостями, отсеяны выше.
      const writes: { ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }[] = [{
        ref: periodRef,
        data: {
          organizationId: orgId,
          period,
          branchId: null,
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
          diagnostics: result.diagnostics,
          autoOpened: true,
          createdAt: ts,
          updatedAt: ts,
        },
      }];

      for (const line of result.lines) {
        writes.push({
          ref: adminDb.collection(LINES).doc(),
          data: {
            organizationId: orgId,
            periodId: periodRef.id,
            period,
            teacherId: line.teacherId,
            teacherName: names.get(line.teacherId) || '',
            ruleId: line.ruleId,
            // Замороженное правило + литеральные входы каждого компонента
            // (revenueBaseMinor, sourceTxnIds, sessionCount, sourceSessionIds…):
            // директор обязан восстановить сумму, не пересчитывая её заново.
            ruleSnapshot: { ...line.ruleSnapshot, computed: line.components },
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
        'Ведомость по зарплате готова к проверке',
        `Расчёт за ${period}: ${n.teachers} преподавател(я/ей) на ${fmtMinor(n.totalMinor)} с. ` +
        'Проверьте суммы и утвердите — без утверждения выплата не производится.',
        '/payroll',
      )
    ));

    await Promise.allSettled(branchSchemeNotices.map((n) =>
      notifyOrgAdmins(
        n.orgId,
        'payroll_ready',
        'Проверьте ведомости по филиалам',
        `За ${period} уже открыты ведомости по филиалам (${n.openCount}). Автоматический расчёт по всей ` +
        'организации в этом случае не запускается — он оплатил бы тех же преподавателей второй раз. ' +
        'Откройте расчёт по каждому оставшемуся филиалу вручную.',
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
      orgsSkippedBranchScheme,
      periodsOpened,
      linesCreated,
    });
  } catch (error: any) {
    console.error('Payroll accrual error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
