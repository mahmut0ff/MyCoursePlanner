/**
 * API: Per-student monthly billing — «Начислить за месяц».
 *
 * Отличается от плановой monthly-billing.ts ровно одним: сумма у КАЖДОГО студента
 * своя. monthly-billing берёт единую цену курса (`course.price`); здесь суммы
 * приходят от менеджера (перенос из прошлого месяца, посчитанный на клиенте, с
 * возможностью поправить перед подтверждением). Всё остальное — то же самое:
 *  - каждое начисление помечено `period` ("YYYY-MM"), `billingType: 'monthly'`;
 *  - идемпотентно по (organizationId, courseId, period, studentId) — equality-only
 *    запрос, без composite-индексов (см. monthly-billing.ts);
 *  - несёт `deadline`, иначе debt-reminders никогда его не подхватит;
 *  - платежи по нему потом уносят реальный courseId (прибыльность) и групповой
 *    groupId резолвится сервером на приёме оплаты (%-зарплата).
 *
 * Плановую monthly-billing.ts НЕ трогаем: она остаётся для организаций с единой
 * ценой курса. Дедуп у обеих общий — один и тот же тег `period` не даёт задвоить.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, can, getOrgFilter, requireBranchScope, ok, unauthorized, forbidden, badRequest, jsonResponse } from './utils/auth';
import { createNotification } from './utils/notifications';
import { billingDeadlineISO } from './utils/billing';

const COLLECTION = 'studentPaymentPlans';
const PERIOD_RE = /^\d{4}-\d{2}$/;
const CHUNK = 400;

interface ChargeInput {
  studentId?: string;
  studentName?: string;
  courseId?: string;
  courseName?: string;
  amount?: number | string;
  /** Полная (прайсовая) цена курса — по ней считается скидка. Необязательна. */
  listAmount?: number | string;
  branchId?: string | null;
}

function fmtAmount(n: number): string {
  try { return Number(n || 0).toLocaleString('ru-RU'); } catch { return String(n || 0); }
}

/** Первое число месяца периода в UTC — база для billingDeadlineISO/подписей. */
function periodStartDate(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  if (event.httpMethod !== 'POST') return badRequest('Only POST is supported');
  if (!can(user, 'finances', 'write')) return forbidden('Недостаточно прав для этого действия');

  const orgId = getOrgFilter(user);
  if (!orgId) return badRequest('Organization context required');

  const body = JSON.parse(event.body || '{}');
  const period: string = body.period;
  if (!period || !PERIOD_RE.test(period)) return badRequest('period обязателен в формате YYYY-MM');

  const charges: ChargeInput[] = Array.isArray(body.charges) ? body.charges : [];
  if (charges.length === 0) return badRequest('Нет начислений');

  const dueDay = Number.isFinite(Number(body.dueDay)) ? Number(body.dueDay) : 10;
  const periodDate = periodStartDate(period);
  const deadline = billingDeadlineISO(periodDate, dueDay);
  const ts = new Date().toISOString();

  try {
    // ── 1. Нормализуем и валидируем ВСЕ начисления ДО записи ─────────────────
    // Ветки прав по филиалу проверяем на каждом заряде: клиент шлёт только то,
    // что видит в ростере, но доверять этому нельзя. Падаем громко, а не тихо
    // пропускаем чужой филиал.
    interface Charge { studentId: string; studentName: string; courseId: string; courseName: string; amount: number; listAmount: number; branchId: string | null; }
    const normalized: Charge[] = [];
    for (const c of charges) {
      if (!c.studentId || !c.courseId) return badRequest('У начисления нет studentId или courseId');
      const amount = Number(c.amount);
      if (!Number.isFinite(amount) || amount <= 0) return badRequest('Сумма начисления должна быть больше нуля');
      // Прайсовая цена (для скидки): не ниже суммы к оплате. Если клиент её не
      // прислал или прислал меньше начисления — скидки нет, listAmount = amount.
      const list = Number(c.listAmount);
      const listAmount = Number.isFinite(list) && list > amount ? list : amount;
      // Филиал: явный с клиента → основной филиал пользователя → без филиала.
      const branchId = c.branchId ?? (user as any).primaryBranchId ?? null;
      const branchError = requireBranchScope(user, branchId);
      if (branchError) return branchError;
      normalized.push({
        studentId: c.studentId,
        studentName: c.studentName || '',
        courseId: c.courseId,
        courseName: c.courseName || '',
        amount,
        listAmount,
        branchId,
      });
    }

    // ── 2. Дедуп по (org, courseId, period): кто за этот месяц уже начислен ───
    // Запрос строго на равенствах (три ==), поэтому composite-индекс не нужен —
    // тот же приём, что в monthly-billing.ts. Группируем по курсу, чтобы один
    // запрос закрывал всех студентов курса.
    const byCourse = new Map<string, Charge[]>();
    for (const c of normalized) {
      const list = byCourse.get(c.courseId) || [];
      list.push(c);
      byCourse.set(c.courseId, list);
    }

    const toCreate: Charge[] = [];
    let skipped = 0;
    for (const [courseId, list] of byCourse) {
      const billedSnap = await adminDb.collection(COLLECTION)
        .where('organizationId', '==', orgId)
        .where('courseId', '==', courseId)
        .where('period', '==', period)
        .get();
      const alreadyBilled = new Set(billedSnap.docs.map(d => d.data().studentId));
      for (const c of list) {
        if (alreadyBilled.has(c.studentId)) { skipped++; continue; }
        // Один и тот же студент дважды в одном запросе — второй раз это дубль.
        alreadyBilled.add(c.studentId);
        toCreate.push(c);
      }
    }

    // ── 3. Пишем начисления чанками ──────────────────────────────────────────
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      const slice = toCreate.slice(i, i + CHUNK);
      const batch = adminDb.batch();
      for (const c of slice) {
        const ref = adminDb.collection(COLLECTION).doc();
        batch.set(ref, {
          organizationId: orgId,
          branchId: c.branchId,
          studentId: c.studentId,
          studentName: c.studentName,
          courseId: c.courseId,
          courseName: c.courseName,
          totalAmount: c.amount,
          listAmount: c.listAmount,
          paidAmount: 0,
          status: 'pending',
          billingType: 'monthly',
          period,
          deadline,
          // Начислил менеджер, а не крон: не выдаём это за авто-выставление.
          autoBilled: false,
          createdAt: ts,
          updatedAt: ts,
        });
      }
      await batch.commit();
    }

    // ── 4. Уведомляем студентов (best-effort, как в monthly-billing) ─────────
    const periodLabel = periodDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const dueLabel = new Date(deadline).toLocaleDateString('ru-RU', { timeZone: 'UTC' });
    await Promise.allSettled(toCreate.map(c => {
      const courseSuffix = c.courseName ? ` за «${c.courseName}»` : '';
      return createNotification({
        recipientId: c.studentId,
        type: 'payment_due',
        title: 'Выставлен счёт за обучение',
        message: `Счёт за ${periodLabel}: ${fmtAmount(c.amount)} с.${courseSuffix}. Оплатить до ${dueLabel}.`,
        link: '/diary',
        organizationId: orgId,
        metadata: { courseId: c.courseId, period },
      });
    }));

    return ok({ success: true, period, created: toCreate.length, skipped });
  } catch (error: any) {
    console.error('Per-student billing error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
