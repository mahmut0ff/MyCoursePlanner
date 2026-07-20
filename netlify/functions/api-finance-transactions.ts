/**
 * API: Finance Transactions — CRUD for Income/Expenses.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, can, getOrgFilter, resolveBranchFilter, recordInBranchScope, requireBranchScope, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';
import { createNotification, notifyOrgAdmins } from './utils/notifications';
import { batchGetUserNames, batchGetCourseNames, derivePlanStatus } from './utils/finance-names';
import { resolveRange } from './utils/finance-period';
import { orgDayKey } from './utils/payment-plans';

const COLLECTION = 'financeTransactions';
const PAYROLL_PERIODS = 'payrollPeriods';

/**
 * На сколько дней назад касса может датировать операцию.
 *
 * Реальный случай — «деньги приняли в понедельник, внесли в четверг» — это
 * единицы дней; двух месяцев хватает с большим запасом. Дальше начинается уже не
 * касса, а исправление сданной отчётности: такая правка не должна проходить
 * незаметно, обычным нажатием «Подтвердить оплату», поэтому её здесь нет.
 */
export const MAX_BACKDATE_DAYS = 60;

/** 'YYYY-MM-DD' из даты операции, или null если строка не дата. */
function dayKeyOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const day = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (Number.isNaN(Date.parse(raw))) return null;
  return day;
}

/**
 * Проверка даты кассовой операции. Возвращает русское сообщение или null.
 *
 * ВПЕРЁД нельзя вообще: деньги, которых ещё не принесли, — не доход. Дата в
 * будущем раздувает выручку текущего отчёта и создаёт оплату, которой нет в кассе.
 *
 * НАЗАД — не глубже MAX_BACKDATE_DAYS (см. комментарий у константы).
 *
 * «Сегодня» берём в дне ОРГАНИЗАЦИИ (orgDayKey), а не в UTC: функция всегда
 * исполняется в UTC, а рынок — UTC+6, и граница суток уехала бы на шесть часов.
 * Вечерний платёж, который в Бишкеке уже «сегодняшний», сервер по UTC счёл бы
 * завтрашним и отверг как будущий — на глазах у кассира с деньгами в руках.
 *
 * Клиентские min/max — только удобство: правило здесь.
 */
function validateOperationDay(raw: unknown, now: Date = new Date()): string | null {
  const day = dayKeyOf(raw);
  if (!day) return 'Некорректная дата операции — ожидается формат ГГГГ-ММ-ДД';
  const today = orgDayKey(now);
  if (day > today) return `Дата операции не может быть в будущем (сегодня ${today}). Деньги, которые ещё не поступили, — не доход.`;
  const earliest = orgDayKey(new Date(now.getTime() - MAX_BACKDATE_DAYS * 86_400_000));
  if (day < earliest) {
    return `Дата операции не может быть раньше ${earliest} — задним числом можно провести не более ${MAX_BACKDATE_DAYS} дней. Более старая запись это исправление отчётности, а не касса.`;
  }
  return null;
}

interface FrozenPeriodHit {
  id: string;
  period: string;
  state: string;
}

/**
 * Утверждённая или выплаченная зарплатная ведомость, окно которой накрывает
 * любую из переданных дат. null — такой нет (в том числе когда организация
 * зарплатой вообще не пользуется: периодов ноль, значит и блокировать нечего).
 *
 * ── Зачем это на пути платежа ──
 * Процентная оплата преподавателя считается по доходам, ДАТА которых попала в
 * окно ведомости. Утверждённая ведомость заморожена намеренно и пересчёту не
 * подлежит. Значит платёж, датированный внутрь такого окна, попадает в базу,
 * которую уже никогда не пересчитают, а следующий период его не возьмёт — по
 * дате он не его. Преподаватель молча недополучает, и об этом никто не узнает.
 * Предупреждение с кнопкой «всё равно провести» именно этот баг и создало бы,
 * поэтому здесь отказ, а не предупреждение.
 *
 * Один equality-запрос `where organizationId ==` — composite-индексы не
 * задеплоены, поэтому окно и состояние отбираем уже в JS.
 *
 * Сравниваем эпохи миллисекунд включительно по обеим границам — ровно тем же
 * правилом, что и txInWindow в payroll-engine. Это не совпадение, а требование:
 * отказывать надо там и только там, где платёж РЕАЛЬНО попал бы в базу процента.
 */
async function findFrozenPayrollPeriod(orgId: string, dates: unknown[]): Promise<FrozenPeriodHit | null> {
  const stamps = dates
    .map(d => (typeof d === 'string' ? Date.parse(d) : NaN))
    .filter(ms => !Number.isNaN(ms));
  if (!stamps.length) return null;

  const snap = await adminDb.collection(PAYROLL_PERIODS).where('organizationId', '==', orgId).get();
  if (snap.empty) return null;

  for (const doc of snap.docs) {
    const period = doc.data() as any;
    if (period.state !== 'approved' && period.state !== 'paid') continue;
    const startMs = Date.parse(period.windowStart || '');
    const endMs = Date.parse(period.windowEnd || '');
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    if (stamps.some(ms => ms >= startMs && ms <= endMs)) {
      return { id: doc.id, period: String(period.period || ''), state: String(period.state) };
    }
  }
  return null;
}

/**
 * 409 на попытку датировать доход внутрь закрытой ведомости. Текст обязан
 * назвать МЕСЯЦ и сказать, ЧТО делать, — «конфликт» без выхода кассир прочитать
 * не сможет. `code` даёт интерфейсу возможность показать это как отдельный
 * случай, а не как безымянную ошибку сети.
 */
function frozenPayrollError(hit: FrozenPeriodHit) {
  const verb = hit.state === 'paid' ? 'выплачена' : 'утверждена';
  return jsonResponse(409, {
    error:
      `Зарплатная ведомость за ${hit.period} уже ${verb}. Платёж этой датой изменил бы базу ` +
      'процентной оплаты, а пересчитать закрытую ведомость нельзя — преподаватель молча ' +
      'недополучит. Укажите дату в текущем, ещё не закрытом периоде.',
    code: 'payroll_period_frozen',
    period: hit.period,
    periodId: hit.id,
    state: hit.state,
  });
}

/**
 * Hard ceiling on rows returned by GET. Exported so the client can compare it
 * against the array length: at exactly this many rows the list IS truncated and
 * the UI must say so — the old silent .slice(0, 1000) after a DESC sort dropped
 * the oldest transactions with no signal, so a year-end total just quietly shrank.
 */
export const TRANSACTIONS_FETCH_CAP = 5000;

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  try {
    // GET Transactions
    if (event.httpMethod === 'GET') {
      // The grant is the gate — see api-finance-metrics.ts.
      if (!can(user, 'finances', 'read')) return forbidden('No access to finances module');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      const query: FirebaseFirestore.Query = adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter);

      const branchFilter = resolveBranchFilter(user, params.branchId);
      if (branchFilter === '__DENIED__') return forbidden('Access denied to requested branch');

      const snap = await query.get();
      let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      // Memory filter
      results = results.filter(r => recordInBranchScope(r.branchId, branchFilter));

      // ── Окно периода ──
      // Тот же util, что и в api-finance-metrics: клиент шлёт сюда либо `period`
      // (пресет — вся арифметика дат живёт на сервере, в одном месте), либо пару
      // голых YYYY-MM-DD. Пара всегда побеждает `period`.
      //
      // defaultPeriod = null сознательно: без явных параметров лента НЕ режется по
      // датам. PaymentHistoryModal и StudentDetailPage тянут историю счёта целиком,
      // и молчаливый дефолт «этот месяц» просто спрятал бы её.
      const range = resolveRange(params, null);
      if ('error' in range) return badRequest(range.error);
      if (range.startIso) results = results.filter(r => (r.date || '') >= range.startIso!);
      if (range.endIso) results = results.filter(r => (r.date || '') <= range.endIso!);

      if (params.paymentPlanId) results = results.filter(r => r.paymentPlanId === params.paymentPlanId);
      if (params.studentId) results = results.filter(r => r.studentId === params.studentId);
      if (params.type) results = results.filter(r => r.type === params.type);
      if (params.categoryId) results = results.filter(r => r.categoryId === params.categoryId);
      if (params.courseId) results = results.filter(r => r.courseId === params.courseId);

      // Memory sort by date DESC
      results.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      results = results.slice(0, TRANSACTIONS_FETCH_CAP);

      // ── Enrich income rows with names, mirroring api-finance-plans.ts ──
      // A cash-close ledger has to answer "who took this money and for what", and
      // `createdBy` alone is a uid nobody can read off a screen.
      const studentIdsToFetch = new Set<string>();
      const courseIdsToFetch = new Set<string>();
      const creatorIdsToFetch = new Set<string>();
      for (const r of results) {
        if (r.type !== 'income') continue;
        if (r.studentId && !r.studentName) studentIdsToFetch.add(r.studentId);
        if (r.courseId && r.courseId !== 'general' && !r.courseName) courseIdsToFetch.add(r.courseId);
        if (r.createdBy && !r.createdByName) creatorIdsToFetch.add(r.createdBy);
      }

      // One users lookup for students and creators together — they share a collection.
      const [userNames, courseNames] = await Promise.all([
        batchGetUserNames([...studentIdsToFetch, ...creatorIdsToFetch]),
        batchGetCourseNames(orgFilter, [...courseIdsToFetch]),
      ]);

      for (const r of results) {
        if (r.type !== 'income') continue;
        if (!r.studentName && r.studentId && userNames.has(r.studentId)) r.studentName = userNames.get(r.studentId);
        if (!r.courseName && r.courseId && courseNames.has(r.courseId)) r.courseName = courseNames.get(r.courseId);
        if (!r.createdByName && r.createdBy && userNames.has(r.createdBy)) r.createdByName = userNames.get(r.createdBy);
      }

      return ok(results);
    }

    // POST Transaction
    if (event.httpMethod === 'POST') {
      if (!can(user, 'finances', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');
      if (!body.type || body.amount === undefined || !body.date || !body.categoryId) {
        return badRequest('type, amount, date, and categoryId are required');
      }
      if (body.type !== 'income' && body.type !== 'expense') {
        return badRequest("type должен быть 'income' или 'expense'");
      }
      // A string amount used to sail through and then string-concatenate into the
      // plan's paidAmount ('0' + '500' = '0500'), corrupting the debt silently.
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return badRequest('amount должен быть положительным числом');
      }

      // Дата теперь приходит из формы (деньги приняли в понедельник, внесли в
      // четверг), поэтому её больше нельзя считать доверенной «сейчас».
      const postDateError = validateOperationDay(body.date);
      if (postDateError) return badRequest(postDateError);

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      // Только доход и только один запрос: расход в базу процента не входит, а
      // организация без зарплатных периодов не получит ни одной блокировки.
      if (body.type === 'income') {
        const frozen = await findFrozenPayrollPeriod(orgFilter, [body.date]);
        if (frozen) return frozenPayrollError(frozen);
      }

      const strictBranchError = requireBranchScope(user, body.branchId);
      if (strictBranchError) return strictBranchError;

      // Resolve the linked plan up front: it both authorizes the mutation (a plan in
      // another org must not be touchable) and supplies the branch to attribute to.
      let linkedPlan: FirebaseFirestore.DocumentData | null = null;
      if (body.paymentPlanId) {
        const planSnap = await adminDb.collection('studentPaymentPlans').doc(body.paymentPlanId).get();
        if (planSnap.exists) {
          if (planSnap.data()!.organizationId !== orgFilter) return forbidden();
          linkedPlan = planSnap.data()!;
        }
      }

      // branchId was declared on this collection but never written by any caller,
      // so every branch-filtered view summed to zero. Stamp it server-side.
      const branchId = body.branchId ?? linkedPlan?.branchId ?? user.primaryBranchId ?? null;

      // Проверяем ТО, ЧТО РЕАЛЬНО ЗАПИШЕМ. Раньше проверялся только body.branchId,
      // а сохранялся фолбэк на филиал счёта — то есть операция могла осесть в
      // филиале, к которому у сотрудника нет доступа, просто потому что он не
      // прислал branchId явно.
      const resolvedBranchError = requireBranchScope(user, branchId);
      if (resolvedBranchError) return resolvedBranchError;

      // ── groupId на доходе ──
      // courseId на строке дохода есть всегда, а groupId не шлёт ни один каллер,
      // поэтому процентная зарплата, привязанная к группе, оставалась без базы.
      // Восстанавливаем его на сервере тем же приёмом, что и branchId: не верим
      // телу запроса, а выводим поле сами — по студенту и курсу.
      //
      // Только равенство (composite-индексы не задеплоены): один `where courseId ==`
      // с орг-скоупом, а принадлежность студента к группе отбираем уже в JS.
      // Читаем Firestore лишь когда есть и студент, и реальный курс — на голом
      // расходе/общем платеже (courseId === 'general') лишнего запроса не делаем.
      //
      // `?? null` коалесцирует только null/undefined, поэтому groupId:'' (или
      // пробелы) проскакивал проверку «уже задан» и сохранялся как пустая строка,
      // навсегда блокируя резолв. Нормализуем пустое/пробельное к null: тогда и
      // резолв отрабатывает, и в базе никогда не осядет groupId:''.
      const rawGroupId = typeof body.groupId === 'string' ? body.groupId.trim() : body.groupId;
      let resolvedGroupId: string | null = rawGroupId ? rawGroupId : null;
      if (
        resolvedGroupId == null &&
        body.type === 'income' &&
        body.studentId &&
        body.courseId &&
        body.courseId !== 'general'
      ) {
        // Единственное добавленное чтение на пути платежа: один equality-запрос
        // `groups where organizationId== and courseId==`, ограниченный орг- и
        // курс-скоупом (не полное сканирование). Совпадение студента отбираем в JS.
        const groupsSnap = await adminDb
          .collection('groups')
          .where('organizationId', '==', orgFilter)
          .where('courseId', '==', body.courseId)
          .get();
        const matches = groupsSnap.docs.filter(d => {
          const ids = (d.data() as any).studentIds;
          return Array.isArray(ids) && ids.includes(body.studentId);
        });
        // Ровно одна группа — однозначная атрибуция. Ноль или несколько групп
        // курса со студентом — НЕ угадываем: неверно приписанная база процентной
        // зарплаты хуже, чем её отсутствие, поэтому оставляем groupId: null.
        if (matches.length === 1) resolvedGroupId = matches[0].id;
      }

      const data: Record<string, any> = {
        type: body.type,
        amount,
        date: body.date,
        categoryId: body.categoryId,
        description: body.description ?? '',
        // currency объявлена на FinancialTransaction; аллоулист её молча ронял,
        // так что любой каллер, который её пришлёт, терял бы данные без следа.
        currency: body.currency ?? null,
        paymentMethod: body.paymentMethod ?? null,
        paymentPlanId: body.paymentPlanId ?? null,
        studentId: body.studentId ?? null,
        courseId: body.courseId ?? null,
        groupId: resolvedGroupId,
        teacherId: body.teacherId ?? null,
        branchId,
        organizationId: orgFilter,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      };

      // Создаём ссылку заранее: и сама операция, и пересчёт счёта должны попасть
      // в одну атомарную запись, иначе «операция есть, а счёт не изменился».
      const ref = adminDb.collection(COLLECTION).doc();
      const planSideEffect = Boolean(data.paymentPlanId) && (data.type === 'income' || data.type === 'expense');
      let remaining = 0;
      // Счёт мог быть удалён между выбором в форме и записью. Тогда остаток нам
      // НЕИЗВЕСТЕН — а `remaining` так и остаётся 0, и студент получал
      // «Оплата завершена полностью!» по счёту, которого больше нет.
      let planBalanceKnown = false;

      if (!planSideEffect) {
        await ref.set(data);
      } else {
        // Возврат: расход, привязанный к счёту. Зеркало приёма оплаты — деньги
        // уходят из кассы и одновременно снимаются с оплаченного по счёту, поэтому
        // у студента снова появляется долг. Сам доход при этом не трогаем: отчёт за
        // уже закрытый период не должен меняться задним числом.
        const sign = data.type === 'income' ? 1 : -1;
        const planRef = adminDb.collection('studentPaymentPlans').doc(data.paymentPlanId);
        await adminDb.runTransaction(async (t) => {
          // Firestore requires every read to precede every write in a transaction.
          const doc = await t.get(planRef);
          t.set(ref, data);
          if (!doc.exists) return;
          const planData = doc.data()!;
          // Re-checked inside the transaction: the pre-read that authorized this
          // is not atomic with the write.
          if (planData.organizationId !== orgFilter) return;
          const newPaidAmount = Math.max(0, (planData.paidAmount || 0) + sign * amount);
          remaining = Math.max(0, (planData.totalAmount || 0) - newPaidAmount);
          planBalanceKnown = true;
          // Приём новой оплаты — осознанное действие по этому счёту, поэтому он
          // может «оживить» списанный (cancelled) счёт. Возврат — не может.
          const status = derivePlanStatus(newPaidAmount, planData.totalAmount, planData.status, sign === 1);
          t.update(planRef, { paidAmount: newPaidAmount, status, updatedAt: new Date().toISOString() });
        });
      }

      if (data.type === 'income' && data.paymentPlanId) {
        // Notify student about payment (in-app + Telegram via unified pipeline)
        if (data.studentId && orgFilter) {
          // Про остаток говорим только когда он действительно посчитан по живому
          // счёту. Иначе — просто подтверждаем приём денег: соврать студенту, что
          // долг закрыт, хуже, чем не сказать про остаток ничего.
          const balanceLine = !planBalanceKnown
            ? ''
            : remaining > 0 ? ` Остаток: ${remaining} сом.` : ' Оплата завершена полностью!';
          createNotification({
            recipientId: data.studentId,
            type: 'payment_received',
            title: 'Оплата принята',
            message: `Оплата ${data.amount} сом принята.${balanceLine}`,
            organizationId: orgFilter,
          }).catch(() => {});
        }

        // Notify admins about received payment
        if (orgFilter) {
          notifyOrgAdmins(
            orgFilter, 'payment_received',
            'Получена оплата',
            `Оплата ${data.amount} сом${data.description ? ` (${data.description})` : ''}`,
            '/finances',
          ).catch(() => {});
        }
      }

      if (data.type === 'expense' && data.paymentPlanId) {
        if (data.studentId && orgFilter) {
          createNotification({
            recipientId: data.studentId,
            type: 'payment_received',
            title: 'Оформлен возврат',
            message: `Возврат ${data.amount} сом по счёту.`,
            organizationId: orgFilter,
          }).catch(() => {});
        }
      }

      return ok({ id: ref.id, ...data });
    }

    // PUT — Update Transaction
    if (event.httpMethod === 'PUT') {
      if (!can(user, 'finances', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');
      if (!body.id) return badRequest('id required');

      const docRef = adminDb.collection(COLLECTION).doc(body.id);
      const doc = await docRef.get();
      if (!doc.exists) return notFound('Transaction not found');

      const existing = doc.data()!;
      const orgFilter = getOrgFilter(user);
      if (existing.organizationId !== orgFilter) return forbidden();

      // Организация — не единственная граница. Без этой проверки сотрудник,
      // ограниченный филиалом А, правил деньги филиала Б, просто зная id операции.
      // Проверяем СОХРАНЁННЫЙ branchId: тела запроса здесь нет, есть только запись.
      const putBranchError = requireBranchScope(user, existing.branchId);
      if (putBranchError) return putBranchError;

      if (body.date !== undefined) {
        const putDateError = validateOperationDay(body.date);
        if (putDateError) return badRequest(putDateError);

        if (existing.type === 'income') {
          // Проверяем ОБЕ даты — новую и текущую. Перенос доход ВНУТРЬ закрытой
          // ведомости добавляет процентную базу, которую уже не пересчитают; но
          // перенос ИЗ неё наружу так же необратим и вреднее: деньги, по которым
          // преподавателю уже начислили процент, уедут в открытый период и
          // попадут в базу второй раз. Обе даты уже на руках, лишнего чтения нет.
          const frozen = await findFrozenPayrollPeriod(existing.organizationId, [body.date, existing.date]);
          if (frozen) return frozenPayrollError(frozen);
        }
      }

      // updatedBy: до появления задним числом проставляемой даты правка операции
      // не оставляла вообще НИКАКОГО следа об авторе — только updatedAt. Теперь
      // правкой можно перенести деньги между месяцами, и «кто это сделал»
      // становится главным вопросом к строке.
      const updates: any = { updatedAt: new Date().toISOString(), updatedBy: user.uid };
      if (body.amount !== undefined) updates.amount = Number(body.amount);
      if (body.description !== undefined) updates.description = body.description;
      if (body.date !== undefined) updates.date = body.date;
      if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
      if (body.paymentMethod !== undefined) updates.paymentMethod = body.paymentMethod;
      // Re-attribution after the fact: an expense booked to the wrong course/group/
      // teacher has to be fixable, otherwise profitability reports stay wrong forever.
      if (body.courseId !== undefined) updates.courseId = body.courseId;
      if (body.groupId !== undefined) updates.groupId = body.groupId;
      if (body.teacherId !== undefined) updates.teacherId = body.teacherId;

      if (updates.amount !== undefined && (!Number.isFinite(updates.amount) || updates.amount <= 0)) {
        return badRequest('amount должен быть положительным числом');
      }

      // Ordering the two writes either way just moves the desync window: plan first
      // and a failed doc update leaves the plan crediting money no transaction
      // records; doc first and a failed plan update leaves the transaction saying
      // 800 с. while the plan still credits 500. Both documents commit together or
      // neither does.
      const needsPlanSync = updates.amount !== undefined && existing.paymentPlanId && updates.amount !== existing.amount;

      if (!needsPlanSync) {
        await docRef.update(updates);
      } else {
        // An edited refund moves the debt the other way — applying the raw diff to
        // paidAmount regardless of type pushed expense edits in the wrong direction.
        const sign = existing.type === 'income' ? 1 : -1;
        const diff = sign * (updates.amount - (existing.amount || 0));
        const planRef = adminDb.collection('studentPaymentPlans').doc(existing.paymentPlanId);
        await adminDb.runTransaction(async (t) => {
          // Firestore requires every read to precede every write in a transaction.
          const planDoc = await t.get(planRef);
          t.update(docRef, updates);
          if (!planDoc.exists) return;
          const planData = planDoc.data()!;
          if (planData.organizationId !== orgFilter) return;
          const newPaid = Math.max(0, (planData.paidAmount || 0) + diff);
          // Правка старой операции не должна воскрешать списанный счёт.
          const status = derivePlanStatus(newPaid, planData.totalAmount, planData.status);
          t.update(planRef, { paidAmount: newPaid, status, updatedAt: new Date().toISOString() });
        });
      }

      return ok({ id: doc.id, ...existing, ...updates });
    }

    // DELETE — Remove Transaction
    if (event.httpMethod === 'DELETE') {
      if (!can(user, 'finances', 'delete')) return forbidden('Недостаточно прав для этого действия');

      const txId = params.id;
      if (!txId) return badRequest('id required');

      const docRef = adminDb.collection(COLLECTION).doc(txId);
      const doc = await docRef.get();
      if (!doc.exists) return notFound('Transaction not found');

      const existing = doc.data()!;
      const orgFilter = getOrgFilter(user);
      if (existing.organizationId !== orgFilter) return forbidden();

      // То же, что и в PUT: удаление чужой по филиалу операции — это тоже правка
      // чужих денег, причём необратимая.
      const deleteBranchError = requireBranchScope(user, existing.branchId);
      if (deleteBranchError) return deleteBranchError;

      // Reverse payment plan if linked. Направление зависит от типа: удаление
      // оплаты снимает сумму с оплаченного, удаление возврата — возвращает её.
      if (existing.paymentPlanId && (existing.type === 'income' || existing.type === 'expense')) {
        const sign = existing.type === 'income' ? -1 : 1;
        const planRef = adminDb.collection('studentPaymentPlans').doc(existing.paymentPlanId);
        // Удаление документа операции живёт ВНУТРИ той же транзакции, что и откат
        // счёта: иначе провал delete после успешного отката оставлял счёт
        // «недоплаченным», хотя оплата всё ещё существует — долг возникал из ниоткуда.
        await adminDb.runTransaction(async (t) => {
          const planDoc = await t.get(planRef);
          t.delete(docRef);
          if (planDoc.exists) {
            const planData = planDoc.data()!;
            if (planData.organizationId !== orgFilter) return;
            const newPaid = Math.max(0, (planData.paidAmount || 0) + sign * (existing.amount || 0));
            // Удаление операции — тоже не повод воскрешать списанный счёт: студент,
            // которого уже списали, не должен вернуться в KPI долга и в рассылку.
            const status = derivePlanStatus(newPaid, planData.totalAmount, planData.status);
            t.update(planRef, { paidAmount: newPaid, status, updatedAt: new Date().toISOString() });
          }
        });
      } else {
        await docRef.delete();
      }
      return ok({ deleted: true, id: txId });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Finance Transactions API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
