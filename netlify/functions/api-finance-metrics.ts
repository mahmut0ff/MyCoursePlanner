/**
 * API: Finance Metrics — Aggregations for SaaS Dashboards.
 * Supports period filtering: current_month, last_month, quarter, year, all
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, can, getOrgFilter, resolveBranchFilter, recordInBranchScope, ok, unauthorized, forbidden, badRequest, jsonResponse } from './utils/auth';
import { batchGetCourseNames } from './utils/finance-names';
import { resolveRange, getPreviousRange } from './utils/finance-period';
import { isDebtBearingPlan, planDebt } from './utils/payment-plans';

/** Sort a {amount} bucket map into a desc-by-amount array. */
function toSortedBuckets<K extends string>(
  map: Map<string, { amount: number; count: number }>,
  key: K,
): Array<{ amount: number; count: number } & Record<K, string>> {
  return [...map.entries()]
    .map(([id, v]) => ({ [key]: id, amount: v.amount, count: v.count } as any))
    .sort((a, b) => b.amount - a.amount);
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  try {
    // GET Metrics
    if (event.httpMethod === 'GET') {
      // The grant is the gate. Role checks used to sit in front of it, which made a
      // finances grant on a teacher-based custom role impossible to use; plain
      // teachers hold no finances:read, so nothing widens here.
      if (!can(user, 'finances', 'read')) return forbidden('No access to finances module');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      const params = event.queryStringParameters || {};
      const branchFilter = resolveBranchFilter(user, params.branchId);
      if (branchFilter === '__DENIED__') return forbidden('Access denied');

      const period = params.period || 'current_month';
      // Окно считает общий util: transactions разбирает те же параметры тем же
      // кодом, иначе «Обзор» и «Платежи» разойдутся на границах суток. Пара
      // startDate+endDate всегда побеждает `period` — но только полная пара, чтобы
      // наполовину заполненный date-picker не переопределял окно молча.
      const range = resolveRange(params, 'current_month');
      if ('error' in range) return badRequest(range.error);
      const startIso = range.startIso!;
      const endIso = range.endIso!;
      const isCustomRange = range.isCustomRange;

      const hasPrevious = period !== 'all' || isCustomRange;
      const { prevStartIso, prevEndIso } = getPreviousRange(period, startIso, endIso, isCustomRange);

      // Fetch transactions and payment plans in parallel for speed
      const [trxsSnap, plansSnap] = await Promise.all([
        adminDb.collection('financeTransactions')
          .where('organizationId', '==', orgFilter).get(),
        adminDb.collection('studentPaymentPlans')
          .where('organizationId', '==', orgFilter).get(),
      ]);

      let totalIncome = 0;
      let totalExpense = 0;
      let unassignedBranchIncome = 0;
      let unassignedBranchExpense = 0;
      let unattributedExpense = 0;
      let prevIncome = 0;
      let prevExpense = 0;
      // Самая ранняя операция В ПРЕДЕЛАХ ФИЛИАЛЬНОГО СРЕЗА. Нужна, чтобы отличить
      // «предыдущего окна не было вовсе» от «в предыдущем окне просто ноль дохода»:
      // если предыдущее окно целиком раньше первой записи — сравнивать не с чем.
      // Обёртка-объект, а не `let`: значение пишется внутри forEach-замыкания, и
      // после него анализ потоков схлопнул бы тип `let` до `null` (assign только в
      // замыкании), сломав сравнение ниже. У свойства объекта тип остаётся string|null.
      const scope = { earliestDate: null as string | null };

      const dailyMap = new Map<string, { income: number; expense: number }>();
      const expenseByCategoryMap = new Map<string, { amount: number; count: number }>();
      const incomeByMethodMap = new Map<string, { amount: number; count: number }>();
      const courseMap = new Map<string, { income: number; expense: number; students: Set<string> }>();

      const courseBucket = (courseId: string) => {
        let b = courseMap.get(courseId);
        if (!b) { b = { income: 0, expense: 0, students: new Set() }; courseMap.set(courseId, b); }
        return b;
      };

      // Single pass: every transaction-derived number below comes from this loop.
      trxsSnap.docs.forEach(d => {
        const data = d.data();
        const amount = Number(data.amount) || 0;
        const date = data.date || '';

        // ── unassignedBranch* — точная семантика, не перепутайте в UI ──
        // Это записи В ОКНЕ ПЕРИОДА, у которых НЕТ branchId. Они считаются
        // ВСЕГДА, независимо от активного фильтра филиала, потому что
        // recordInBranchScope() выкидывает записи без филиала из любого
        // отфильтрованного среза — и это единственное место, где UI может узнать
        // размер корзины «не привязано к филиалу: X».
        //
        // Это НЕ отдельное слагаемое к итогам, а СПРАВКА:
        //  • «Все филиалы» (фильтра нет): такие записи УЖЕ входят в totalIncome /
        //    totalExpense / totalActiveDebt. Вычитать их нельзя — будет двойной
        //    недосчёт.
        //  • Конкретный филиал: они в итоги НЕ входят, и число объясняет разрыв
        //    между суммой филиалов и итогом по организации.
        // Правило одно: показывать рядом как подпись, никогда не складывать с
        // итогом и никогда из него не вычитать.
        if (!data.branchId && date >= startIso && date <= endIso) {
          if (data.type === 'income') unassignedBranchIncome += amount;
          if (data.type === 'expense') unassignedBranchExpense += amount;
        }

        if (!recordInBranchScope(data.branchId, branchFilter)) return;

        // Считаем минимальную дату по всем записям среза, а не только в окне: она
        // отвечает на вопрос «существовали ли вообще данные к концу предыдущего окна».
        if (date && (scope.earliestDate === null || date < scope.earliestDate)) {
          scope.earliestDate = date;
        }

        if (hasPrevious && date >= prevStartIso && date <= prevEndIso) {
          if (data.type === 'income') prevIncome += amount;
          if (data.type === 'expense') prevExpense += amount;
        }

        if (date < startIso || date > endIso) return;

        if (data.type === 'income') {
          totalIncome += amount;

          const method = data.paymentMethod || 'unknown';
          const m = incomeByMethodMap.get(method) || { amount: 0, count: 0 };
          m.amount += amount; m.count++;
          incomeByMethodMap.set(method, m);

          const b = courseBucket(data.courseId || 'general');
          b.income += amount;
          if (data.studentId) b.students.add(data.studentId);
        }

        if (data.type === 'expense') {
          totalExpense += amount;
          if (!data.courseId) unattributedExpense += amount;

          const cat = data.categoryId || 'unknown';
          const c = expenseByCategoryMap.get(cat) || { amount: 0, count: 0 };
          c.amount += amount; c.count++;
          expenseByCategoryMap.set(cat, c);

          courseBucket(data.courseId || 'general').expense += amount;
        }

        const dateKey = date.slice(0, 10); // YYYY-MM-DD
        if (!dateKey) return;
        const entry = dailyMap.get(dateKey) || { income: 0, expense: 0 };
        if (data.type === 'income') entry.income += amount;
        if (data.type === 'expense') entry.expense += amount;
        dailyMap.set(dateKey, entry);
      });

      const netProfit = totalIncome - totalExpense;

      let totalActiveDebt = 0;
      let unassignedBranchDebt = 0;
      let overdueCount = 0;
      const nowIso = new Date().toISOString();
      const debtors = new Set<string>();

      plansSnap.docs.forEach(d => {
        const data = d.data();
        // Вопрос «должны ли нам ещё по этому счёту» задаётся ровно в одном месте —
        // utils/payment-plans.ts. Здесь стоял свой инлайновый список статусов, то
        // есть ровно тот дубль правила, ради устранения которого util и писался:
        // дашборд и AI-копилот уже расходились в сумме долга по одной организации.
        if (!isDebtBearingPlan(data)) return;
        const debt = planDebt(data);

        // Долг без филиала — та же справочная корзина, что и по деньгам выше
        // (см. развёрнутый комментарий там). У счёта нет окна периода, поэтому
        // временного условия здесь нет: долг либо есть сейчас, либо его нет.
        if (!data.branchId) unassignedBranchDebt += debt;

        if (!recordInBranchScope(data.branchId, branchFilter)) return;

        totalActiveDebt += debt;
        if (data.studentId) debtors.add(data.studentId);
        // Auto-detect overdue: if deadline passed and not paid
        if (data.status === 'overdue' || (data.deadline && data.deadline < nowIso)) {
          overdueCount++;
        }
      });

      const chartData = [...dailyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({ date, ...vals }));

      const courseNames = await batchGetCourseNames(
        orgFilter,
        [...courseMap.keys()].filter(id => id !== 'general'),
      );

      const courseProfitability = [...courseMap.entries()]
        .map(([courseId, v]) => ({
          courseId,
          courseName: courseId === 'general' ? 'Без курса' : (courseNames.get(courseId) || courseId),
          income: v.income,
          expense: v.expense,
          net: v.income - v.expense,
          studentCount: v.students.size,
        }))
        // 'Без курса' is a catch-all, not a course — it sorts last regardless of size
        // so it never crowds out the real courses at the top of the report.
        .sort((a, b) => {
          if (a.courseId === 'general') return 1;
          if (b.courseId === 'general') return -1;
          return b.income - a.income;
        });

      return ok({
        period,
        startDate: startIso,
        endDate: endIso,
        totalIncome,
        totalExpense,
        netProfit,
        totalActiveDebt,
        outstandingDebt: totalActiveDebt, // alias expected by frontend
        overdueCount,
        debtorCount: debtors.size,
        chartData,
        unassignedBranchIncome,
        unassignedBranchExpense,
        unassignedBranchDebt,
        expenseByCategory: toSortedBuckets(expenseByCategoryMap, 'categoryId'),
        incomeByMethod: toSortedBuckets(incomeByMethodMap, 'paymentMethod'),
        courseProfitability,
        unattributedExpense,
        previous: hasPrevious
          ? { totalIncome: prevIncome, totalExpense: prevExpense, netProfit: prevIncome - prevExpense }
          : { totalIncome: 0, totalExpense: 0, netProfit: 0 },
        // `previous` — это НУЛЕВАЯ база, когда сравнивать не с чем: period='all'
        // (нет предыдущего окна) либо предыдущее окно целиком раньше первой записи.
        // Флаг позволяет UI показать «—» вместо роста Infinity%/NaN% от деления на 0.
        previousComparable: hasPrevious && scope.earliestDate !== null && scope.earliestDate <= prevEndIso,
      });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Finance Metrics API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
