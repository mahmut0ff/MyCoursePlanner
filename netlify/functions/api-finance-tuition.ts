/**
 * API: договорная цена обучения — «сколько платит этот студент за этот курс».
 *
 * Модель и приоритет («ставка → цена курса») живут в utils/tuition.ts; здесь
 * только ручка: прочитать ставки организации и выставить их пачкой.
 *
 * ── Почему массовая установка, а не поштучная ──
 * Менеджер задаёт цену не одному человеку, а группе: «эти двенадцать платят по
 * 3500». Поштучная ручка означала бы двенадцать запросов, двенадцать шансов
 * оборваться на середине и никакого внятного отчёта о том, что применилось.
 * Одиночная правка — это тот же вызов с одним studentId.
 *
 * ── Гейт — finances, а не students ──
 * Это деньги, а не ростер. Тот, кто ведёт контингент, не обязан назначать цены;
 * тот, кто ведёт кассу, обязан. Поэтому `finances:write`, а филиал проверяется по
 * СТУДЕНТУ: ставка сама филиала не несёт (см. utils/tuition.ts).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import {
  verifyAuth, can, getOrgFilter, isSuperAdmin, hasRole, memberHoldsRole,
  ok, unauthorized, forbidden, badRequest, jsonResponse,
} from './utils/auth';
import { batchGetCourseNames, derivePlanStatus } from './utils/finance-names';
import { planDebt, planPeriodKey } from './utils/payment-plans';
import { TUITION_COLLECTION, TUITION_ALL_COURSES, tuitionDocId, readTuitionAmount } from './utils/tuition';

const PLANS = 'studentPaymentPlans';
const PERIOD_RE = /^\d{4}-\d{2}$/;
/** Одна и та же граница, что у массовых операций ростера (api-org.ts). */
const MAX_STUDENTS = 500;
const CHUNK = 400;

interface Pair { studentId: string; courseId: string }

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const orgId = getOrgFilter(user);
  if (!orgId) return badRequest('Organization context required');

  try {
    // ── GET: все ставки организации ──────────────────────────────────────────
    //
    // Один equality-фильтр, поэтому составной индекс не нужен. Филиалом НЕ
    // сужаем: ставка его не несёт, а экраны и так показывают только тех
    // студентов, которые видны в ростере выбранного филиала, — сужать здесь
    // значило бы прятать сумму у строки, которая на экране всё равно есть.
    if (event.httpMethod === 'GET') {
      if (!can(user, 'finances', 'read')) return forbidden('No access to finances module');

      const snap = await adminDb.collection(TUITION_COLLECTION)
        .where('organizationId', '==', orgId)
        .get();

      const results = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        // Мусорную/отрицательную сумму не отдаём: клиент подставляет её как цену
        // к оплате, и NaN уехал бы прямиком в начисление.
        .filter(r => readTuitionAmount(r) !== null);

      return ok(results);
    }

    // ── POST: выставить/снять ставку пачкой ──────────────────────────────────
    if (event.httpMethod === 'POST') {
      if (!can(user, 'finances', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');

      const rawIds: any[] = Array.isArray(body.studentIds) ? body.studentIds : [];
      const studentIds = [...new Set(rawIds.filter(u => typeof u === 'string' && u.trim()).map((u: string) => u.trim()))];
      if (studentIds.length === 0) return badRequest('studentIds обязателен');
      if (studentIds.length > MAX_STUDENTS) return badRequest(`Максимум ${MAX_STUDENTS} студентов за одну операцию`);

      const courseId = typeof body.courseId === 'string' ? body.courseId.trim() : '';
      if (!courseId) return badRequest('courseId обязателен');

      // null — снять ставку (вернуть студента на цену курса). Отличаем от нуля:
      // ноль это ЗАДАННАЯ бесплатная цена, и она обязана сохраниться.
      let amount: number | null = null;
      if (body.amount !== null && body.amount !== undefined && body.amount !== '') {
        const parsed = Number(body.amount);
        if (!Number.isFinite(parsed) || parsed < 0) return badRequest('Сумма должна быть неотрицательным числом');
        amount = parsed;
      }

      const period: string | null = typeof body.period === 'string' && PERIOD_RE.test(body.period) ? body.period : null;
      const applyToUnpaid = body.applyToUnpaid === true;

      // ── Кого нам вообще позволено трогать ────────────────────────────────
      // Тот же контур, что у массовых операций ростера: участник ЭТОЙ
      // организации, держащий роль студента, и не из чужого филиала. Всё
      // отсеянное возвращается числом `skipped`, а не роняет вызов: один
      // протухший uid в выборке из двухсот не должен отменять остальные 199.
      const members = await getDocsByIds(`orgMembers/${orgId}/members`, studentIds);
      const branchScoped = !isSuperAdmin(user) && !hasRole(user, 'admin') && user.branchIds.length > 0;
      const targets = studentIds.filter(uid => {
        const m = members[uid];
        if (!m) return false;
        if (!memberHoldsRole(m, ['student'])) return false;
        if (branchScoped) {
          const b: string[] = m.branchIds || [];
          if (b.length > 0 && !b.some((id: string) => user.branchIds.includes(id))) return false;
        }
        return true;
      });
      const skippedStudents = studentIds.length - targets.length;
      if (targets.length === 0) return ok({ success: true, saved: 0, cleared: 0, skippedStudents, updatedPlans: 0, skippedPlans: 0 });

      // ── Пары «студент × курс» ────────────────────────────────────────────
      // Явный курс — одна пара на студента. «Все курсы» разворачивается по
      // группам: цену ставят человеку, а на скольких курсах он учится, менеджер
      // держать в голове не обязан.
      //
      // Группы филиалом не сужаем СОЗНАТЕЛЬНО: право уже проверено по студенту
      // выше, а часть групп исторически живёт без branchId (данные), и фильтр
      // здесь молча терял бы их курсы.
      let pairs: Pair[] = [];
      if (courseId === TUITION_ALL_COURSES) {
        const groupSnap = await adminDb.collection('groups').where('organizationId', '==', orgId).get();
        const targetSet = new Set(targets);
        const seen = new Set<string>();
        for (const g of groupSnap.docs) {
          const data = g.data() as any;
          if (!data.courseId) continue;
          // Закрытая группа новых начислений не порождает — цену по ней ставить
          // не за что. Пустой status = легаси-активная.
          if (data.status && data.status !== 'active') continue;
          for (const sid of (data.studentIds || [])) {
            if (!targetSet.has(String(sid))) continue;
            const key = `${sid}|${data.courseId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push({ studentId: String(sid), courseId: String(data.courseId) });
          }
        }
      } else {
        for (const sid of targets) pairs.push({ studentId: sid, courseId });
      }

      if (pairs.length === 0) {
        return ok({ success: true, saved: 0, cleared: 0, skippedStudents, updatedPlans: 0, skippedPlans: 0, noCourses: true });
      }

      const courseIds = [...new Set(pairs.map(p => p.courseId))];
      // batchGetCourseNames отдаёт ТОЛЬКО курсы этой организации (сам проверяет
      // organizationId), поэтому карта заодно служит списком допустимых курсов.
      const courseNames = await batchGetCourseNames(orgId, courseIds);
      const ts = new Date().toISOString();

      // Цену назначаем только по РЕАЛЬНОМУ курсу организации. Иначе телом
      // запроса можно записать ставку по чужому или несуществующему курсу: она
      // никогда ни к чему не применится и останется мусором, который потом
      // некому объяснить. Снятие ставки при этом разрешаем по любому id —
      // курс могли удалить уже ПОСЛЕ того, как цену назначили, и вычистить её
      // должно быть можно.
      const priced = amount === null ? pairs : pairs.filter(p => courseNames.has(p.courseId));
      if (priced.length === 0) {
        return courseId === TUITION_ALL_COURSES
          ? ok({ success: true, saved: 0, cleared: 0, skippedStudents, updatedPlans: 0, skippedPlans: 0, noCourses: true })
          : badRequest('Курс не найден в этой организации');
      }
      pairs = priced;

      // ── Запись ставок ────────────────────────────────────────────────────
      // `set` с merge:false по детерминированному id: повтор той же операции
      // даёт тот же документ, а не второй экземпляр цены.
      let saved = 0;
      let cleared = 0;
      for (let i = 0; i < pairs.length; i += CHUNK) {
        const batch = adminDb.batch();
        for (const p of pairs.slice(i, i + CHUNK)) {
          const ref = adminDb.collection(TUITION_COLLECTION).doc(tuitionDocId(orgId, p.studentId, p.courseId));
          if (amount === null) {
            batch.delete(ref);
            cleared++;
          } else {
            batch.set(ref, {
              organizationId: orgId,
              studentId: p.studentId,
              courseId: p.courseId,
              amount,
              studentName: members[p.studentId]?.userName || '',
              courseName: courseNames.get(p.courseId) || '',
              updatedBy: user.uid,
              createdAt: ts,
              updatedAt: ts,
            });
            saved++;
          }
        }
        await batch.commit();
      }

      // ── Применение к уже выставленным начислениям ────────────────────────
      // Ставка сама по себе смотрит только вперёд. Но менеджер, поставивший
      // цену 15-го числа, ждёт, что текущий месяц тоже станет по ней, — иначе
      // он видит на экране 5000 сразу после того, как записал 4000.
      //
      // Трогаем РОВНО неоплаченные: списанный счёт остаётся списанным, а
      // погашенный не воскрешаем в долг задним числом. Опустить сумму ниже уже
      // принятых денег нельзя нигде (это возврат, у него свой поток), поэтому
      // такие строки считаем пропущенными и говорим об этом числом.
      let updatedPlans = 0;
      let skippedPlans = 0;
      if (applyToUnpaid && amount !== null) {
        const byCourse = new Map<string, Set<string>>();
        for (const p of pairs) {
          const set = byCourse.get(p.courseId) || new Set<string>();
          set.add(p.studentId);
          byCourse.set(p.courseId, set);
        }

        const updates: Array<{ id: string; data: any }> = [];
        for (const [cid, sids] of byCourse) {
          // Два равенства — составной индекс не нужен (как в syncPaymentPlans).
          const snap = await adminDb.collection(PLANS)
            .where('organizationId', '==', orgId)
            .where('courseId', '==', cid)
            .get();
          for (const doc of snap.docs) {
            const plan = doc.data() as any;
            if (!sids.has(String(plan.studentId))) continue;
            if (plan.status === 'cancelled') continue;
            if (period && planPeriodKey(plan) !== period) continue;
            // Долга нет — платить нечего, менять нечего.
            if (planDebt(plan) <= 0) continue;
            const paid = Math.max(0, Number(plan.paidAmount) || 0);
            if (amount < paid) { skippedPlans++; continue; }

            const priorList = plan.listAmount === undefined
              ? (Number(plan.totalAmount) || 0)
              : (Number(plan.listAmount) || 0);
            updates.push({
              id: doc.id,
              data: {
                totalAmount: amount,
                // Прайсовую цену держим как максимум виденного — то же правило,
                // что в PUT api-finance-plans: снижение суммы это скидка, и
                // «полную» цену терять нельзя.
                listAmount: Math.max(priorList, amount),
                status: derivePlanStatus(paid, amount, plan.status),
                // Разовое прощение остатка сюда не относится: цена теперь
                // договорная и живёт в ставке, а не в следе прошлого месяца.
                settledByDiscount: false,
                updatedAt: ts,
              },
            });
          }
        }

        for (let i = 0; i < updates.length; i += CHUNK) {
          const batch = adminDb.batch();
          for (const u of updates.slice(i, i + CHUNK)) {
            batch.update(adminDb.collection(PLANS).doc(u.id), u.data);
          }
          await batch.commit();
        }
        updatedPlans = updates.length;
      }

      return ok({ success: true, saved, cleared, skippedStudents, updatedPlans, skippedPlans });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Finance tuition API error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
