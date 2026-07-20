/**
 * API: Finance Payment Plans — Tracks student obligations.
 * Enriches results with student/course names from users/courses collections.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, can, getOrgFilter, resolveBranchFilter, recordInBranchScope, requireBranchScope, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';
import { batchGetUserNames, batchGetCourseNames } from './utils/finance-names';
import { isDeadlineMissed } from './utils/payment-plans';

const COLLECTION = 'studentPaymentPlans';

/** Зеркало union-типа PaymentStatus из src/types/index.ts. Держите синхронно. */
const PAYMENT_STATUSES = ['paid', 'partial', 'overdue', 'pending', 'cancelled'];

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  try {
    // GET Payment Plans
    if (event.httpMethod === 'GET') {
      // The grant is the gate — see api-finance-metrics.ts.
      if (!can(user, 'finances', 'read')) return forbidden('No access to finances module');

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      let query: FirebaseFirestore.Query = adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter);

      const branchFilter = resolveBranchFilter(user, params.branchId);
      if (branchFilter === '__DENIED__') return forbidden('Access denied to requested branch');

      if (params.studentId) query = query.where('studentId', '==', params.studentId);
      
      const snap = await query.get();
      let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      // Memory filter
      results = results.filter(r => recordInBranchScope(r.branchId, branchFilter));

      // ── Auto-detect overdue: promote plans whose deadline has passed ──
      // This runs BEFORE the status filter: promoting after it made `?status=overdue`
      // miss the very rows that were about to flip, while `?status=pending` returned
      // rows whose status field already read 'overdue' by the time the client saw them.
      //
      // Просрочка наступает, только когда ДЕНЬ срока истёк целиком, — предикат
      // общий с api-finance-metrics (utils/payment-plans.ts). Раньше здесь стояло
      // `r.deadline < nowIso`: голая дата '2026-07-20' лексикографически меньше
      // полного ISO '2026-07-20T09:15:00.000Z', поэтому счёт становился
      // просроченным в 00:00 того самого дня, когда его только предстояло
      // оплатить, — и студенту уходило напоминание о ещё не просроченных деньгах.
      const now = new Date();
      const nowIso = now.toISOString();
      const toPromote = results.filter(r =>
        isDeadlineMissed(r.deadline, now) &&
        (r.status === 'pending' || r.status === 'partial')
      );
      for (const r of toPromote) r.status = 'overdue';

      // Awaited batches instead of N un-awaited writes: Netlify tears the function
      // down once the response returns, which silently dropped the stragglers.
      // Chunked at 450 because Firestore rejects a batch over 500 writes — one
      // giant batch meant an org past 500 stale plans failed EVERY promotion
      // commit forever while the response still claimed they were persisted.
      const CHUNK = 450;
      for (let i = 0; i < toPromote.length; i += CHUNK) {
        const chunk = toPromote.slice(i, i + CHUNK);
        const batch = adminDb.batch();
        for (const r of chunk) {
          batch.update(adminDb.collection(COLLECTION).doc(r.id), { status: 'overdue', updatedAt: nowIso });
        }
        try {
          await batch.commit();
        } catch (err) {
          // Still return the computed 'overdue' status — it is derived from the
          // deadline and is what the director must see. The failure is logged for
          // us, NOT stamped onto the row: this endpoint's contract is a bare array
          // of plan documents, and an extra `statusPersisted` field appears in
          // every consumer that spreads the row (and in CSV exports) as a phantom
          // column. The next GET recomputes and retries the commit anyway.
          console.error(`Overdue promotion failed for ${chunk.length} plan(s):`, err);
        }
      }

      if (params.status) {
        results = results.filter(r => r.status === params.status);
      }

      // Memory sort
      results.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      // ── Enrich with student/course names ──
      // Collect unique IDs that are missing names
      const studentIdsToFetch = new Set<string>();
      const courseIdsToFetch = new Set<string>();
      for (const r of results) {
        if (r.studentId && !r.studentName) studentIdsToFetch.add(r.studentId);
        if (r.courseId && !r.courseName) courseIdsToFetch.add(r.courseId);
      }

      // Parallel batch fetches
      const [studentNames, courseNames] = await Promise.all([
        batchGetUserNames([...studentIdsToFetch]),
        batchGetCourseNames(orgFilter, [...courseIdsToFetch]),
      ]);

      // Merge names into results
      for (const r of results) {
        if (!r.studentName && r.studentId && studentNames.has(r.studentId)) {
          r.studentName = studentNames.get(r.studentId);
        }
        if (!r.courseName && r.courseId && courseNames.has(r.courseId)) {
          r.courseName = courseNames.get(r.courseId);
        }
      }

      return ok(results);
    }

    // POST Create Payment Plan (Usually auto-created, but allow manual creation)
    if (event.httpMethod === 'POST') {
      if (!can(user, 'finances', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');
      if (!body.studentId || !body.courseId || body.totalAmount === undefined) {
        return badRequest('studentId, courseId, and totalAmount are required');
      }

      const orgFilter = getOrgFilter(user);
      if (!orgFilter) return badRequest('Organization context required');

      // totalAmount — деньги: строка '5000' раньше уезжала в документ как есть, а
      // потом любой пересчёт долга склеивал её со суммой оплаты вместо сложения.
      const totalAmount = Number(body.totalAmount);
      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        return badRequest('totalAmount должен быть неотрицательным числом');
      }
      const paidAmount = Math.max(0, Number(body.paidAmount) || 0);

      // Статус проверяем тем же списком, что и PUT: неизвестная строка выпала бы из
      // КАЖДОГО фильтра по статусу и сделала счёт невидимым для долгов и рассылки.
      const status = body.status ?? 'pending';
      if (!PAYMENT_STATUSES.includes(status)) {
        return badRequest(`Недопустимый статус счёта. Допустимые: ${PAYMENT_STATUSES.join(', ')}.`);
      }

      // Единственная финансовая мутация, которая раньше НЕ проверяла филиал: тело
      // спредилось в документ целиком, поэтому сотрудник, ограниченный филиалом А,
      // мог создать счёт с branchId филиала Б, просто прислав его в теле. Резолвим
      // тем же фолбэком, что и приём оплаты в api-finance-transactions
      // (нет привязанного счёта, поэтому только body → primaryBranchId → null), и
      // проверяем ТО, ЧТО РЕАЛЬНО ЗАПИШЕМ.
      const branchId = body.branchId ?? user.primaryBranchId ?? null;
      const branchError = requireBranchScope(user, branchId);
      if (branchError) return branchError;

      // Denormalize: resolve names at write time so future reads are instant
      let studentName = body.studentName || '';
      let courseName = body.courseName || '';

      const nameFetches: Promise<void>[] = [];
      if (!studentName && body.studentId) {
        nameFetches.push(
          adminDb.collection('users').doc(body.studentId).get().then(doc => {
            if (doc.exists) {
              const d = doc.data()!;
              studentName = d.displayName || [d.firstName, d.lastName].filter(Boolean).join(' ') || d.name || body.studentId;
            }
          })
        );
      }
      if (!courseName && body.courseId && body.courseId !== 'general') {
        nameFetches.push(
          adminDb.collection('courses').doc(body.courseId).get().then(doc => {
            if (doc.exists) {
              const d = doc.data()!;
              courseName = d.title || d.name || body.courseId;
            }
          })
        );
      }
      await Promise.all(nameFetches);

      const now = new Date().toISOString();
      // Явный аллоулист вместо `...body`: клиент не может протолкнуть organizationId,
      // произвольный branchId или служебные поля. Набор зеркалит то, что реально
      // пишут CreatePaymentPlanModal и syncPaymentPlans в api-org.ts.
      const data: Record<string, any> = {
        studentId: body.studentId,
        studentName,
        courseId: body.courseId,
        courseName,
        totalAmount,
        paidAmount,
        status, // 'paid' | 'partial' | 'overdue' | 'pending' | 'cancelled'
        deadline: body.deadline ?? null,
        branchId,
        organizationId: orgFilter,
        createdAt: now,
        updatedAt: now,
      };
      // Теги ежемесячного биллинга переносим только когда они присланы, чтобы
      // ручной счёт не притворялся авто-выставленным (см. syncPaymentPlans).
      if (body.billingType !== undefined) data.billingType = body.billingType;
      if (body.period !== undefined) data.period = body.period;
      if (body.nextDueDate !== undefined) data.nextDueDate = body.nextDueDate;

      const ref = await adminDb.collection(COLLECTION).add(data);
      return ok({ id: ref.id, ...data });
    }

    // PUT Update Payment Plan
    if (event.httpMethod === 'PUT') {
      if (!can(user, 'finances', 'write')) return forbidden('Недостаточно прав для этого действия');

      const body = JSON.parse(event.body || '{}');
      if (!body.planId) return badRequest('planId required');

      const docRef = adminDb.collection(COLLECTION).doc(body.planId);
      const doc = await docRef.get();
      if (!doc.exists) return notFound('Payment plan not found');

      const orgFilter = getOrgFilter(user);
      const existing = doc.data()!;
      // Without this, any finances:write holder could rewrite any plan in any org
      // by guessing an id — the body used to be spread in blind.
      if (existing.organizationId !== orgFilter) return forbidden();

      const branchError = requireBranchScope(user, existing.branchId);
      if (branchError) return branchError;

      // Explicit allowlist. organizationId/studentId/createdAt are identity and must
      // never move; paidAmount is owned by the transaction side effects, so letting a
      // PUT set it directly would desync the plan from its payment history.
      const updates: any = { updatedAt: new Date().toISOString() };
      if (body.totalAmount !== undefined) {
        const totalAmount = Number(body.totalAmount);
        if (!Number.isFinite(totalAmount) || totalAmount < 0) return badRequest('totalAmount должен быть неотрицательным числом');
        updates.totalAmount = totalAmount;
      }
      if (body.deadline !== undefined) updates.deadline = body.deadline;
      // Статус проходил насквозь без проверки: любая строка ('оплачено', 'done',
      // опечатка) оседала в документе и выпадала из КАЖДОГО фильтра по статусу —
      // счёт становился невидимым и для долгов, и для просрочки, и для рассылки.
      if (body.status !== undefined) {
        if (!PAYMENT_STATUSES.includes(body.status)) {
          return badRequest(`Недопустимый статус счёта. Допустимые: ${PAYMENT_STATUSES.join(', ')}.`);
        }
        updates.status = body.status;
      }
      if (body.courseId !== undefined) updates.courseId = body.courseId;
      if (body.courseName !== undefined) updates.courseName = body.courseName;
      if (body.studentName !== undefined) updates.studentName = body.studentName;
      if (body.branchId !== undefined) {
        const targetBranchError = requireBranchScope(user, body.branchId);
        if (targetBranchError) return targetBranchError;
        updates.branchId = body.branchId;
      }

      await docRef.update(updates);
      return ok({ id: doc.id, ...existing, ...updates });
    }

    // DELETE Payment Plan
    if (event.httpMethod === 'DELETE') {
      if (!can(user, 'finances', 'delete')) return forbidden('Недостаточно прав для этого действия');

      const planId = (event.queryStringParameters || {}).id;
      if (!planId) return badRequest('id required');

      const docRef = adminDb.collection(COLLECTION).doc(planId);
      const doc = await docRef.get();
      if (!doc.exists) return notFound('Payment plan not found');

      const orgFilter = getOrgFilter(user);
      if (doc.data()?.organizationId !== orgFilter) return forbidden();

      // Deleting the plan orphans its transactions (dangling paymentPlanId), and an
      // orphaned payment can no longer be refunded or traced back to a debt. Make the
      // caller acknowledge that instead of silently shredding the audit trail.
      // Two equality clauses — still no composite index needed. The organizationId
      // clause is not optional: without it the count included foreign-tenant rows,
      // which both leaked a cross-tenant number in the 409 body and let another
      // org's document block a legitimate delete.
      const linkedSnap = await adminDb.collection('financeTransactions')
        .where('paymentPlanId', '==', planId)
        .where('organizationId', '==', orgFilter)
        .get();
      if (linkedSnap.size > 0 && params.force !== 'true') {
        return jsonResponse(409, {
          error: `К этому счёту привязано операций: ${linkedSnap.size}. Удаление оставит их без счёта.`,
          linkedTransactions: linkedSnap.size,
        });
      }

      await docRef.delete();
      return ok({ deleted: true, id: planId });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Finance Plans API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
