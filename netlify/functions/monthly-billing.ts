/**
 * Scheduled Function: Monthly Auto-Billing
 *
 * Runs on the 1st of each month (scheduled via netlify.toml). For every course
 * with paymentFormat='monthly' and a price, it generates that month's invoice
 * (a studentPaymentPlan) for each actively-enrolled student — so the owner no
 * longer creates hundreds of invoices by hand.
 *
 * Dedupe: each monthly plan carries a `period` ("YYYY-MM"); a student is billed
 * at most once per course per period. The enrollment-time plan (api-org
 * syncPaymentPlans) is tagged with the same period, so the first month is not
 * double-charged.
 *
 * On creation the student gets a `payment_due` notification; the daily
 * debt-reminders function then chases the deadline.
 *
 * Trigger via: scheduled run, or POST /.netlify/functions/monthly-billing for testing.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { createNotification } from './utils/notifications';
import { jsonResponse } from './utils/auth';
import { billingPeriodKey, billingDeadlineISO, monthlyPlanId, isAlreadyExists } from './utils/billing';
import { cronAccessError } from './utils/cron-auth';

const PLANS = 'studentPaymentPlans';

function fmtAmount(n: number): string {
  try { return Number(n || 0).toLocaleString('ru-RU'); } catch { return String(n || 0); }
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  // Публичный HTTP-адрес есть и у запланированной функции: без этой проверки
  // прогон мог запустить кто угодно и сколько угодно раз.
  const cronDenied = await cronAccessError(event);
  if (cronDenied) return cronDenied;

  const runDate = new Date();
  const period = billingPeriodKey(runDate);
  const deadline = billingDeadlineISO(runDate);
  const ts = runDate.toISOString();

  try {
    // All priced monthly courses across all orgs.
    const courseSnap = await adminDb.collection('courses')
      .where('paymentFormat', '==', 'monthly')
      .get();

    let coursesProcessed = 0;
    let invoicesCreated = 0;
    let studentsBilled = 0;
    let coursesFailed = 0;
    let skippedExpelled = 0;

    // Активные участники организации — по ним отсеиваем отчисленных. Читаем один
    // раз на организацию за прогон: курсов у неё много, а членство одно.
    const activeStudentsByOrg = new Map<string, Set<string>>();
    const loadActiveStudents = async (orgId: string): Promise<Set<string>> => {
      const cached = activeStudentsByOrg.get(orgId);
      if (cached) return cached;
      const snap = await adminDb.collection('orgMembers').doc(orgId).collection('members')
        .where('status', '==', 'active').get();
      const ids = new Set<string>(snap.docs.map(d => (d.data() as any).userId || d.id));
      activeStudentsByOrg.set(orgId, ids);
      return ids;
    };

    for (const courseDoc of courseSnap.docs) {
      const course = courseDoc.data() as any;
      const price = Number(course.price || 0);
      // Only bill live courses — skip drafts and archived ones.
      if (price <= 0 || !course.organizationId || course.status !== 'published') continue;
      coursesProcessed++;

      const courseId = courseDoc.id;
      const orgId = course.organizationId;

      // Падение на одном курсе не должно уносить весь прогон. Раньше весь цикл
      // стоял под общим try: первая же ошибка (нет прав на документ, таймаут,
      // битые данные) обрывала месяц, а крон запускается РАЗ В МЕСЯЦ — догнать
      // пропущенное было уже нечем, и часть академии оставалась без счетов молча.
      try {

      // Active students = union of studentIds across the course's groups.
      const groupSnap = await adminDb.collection('groups')
        .where('organizationId', '==', orgId)
        .where('courseId', '==', courseId)
        .get();
      // Филиал счёта берём у ГРУППЫ студента: курс к филиалу не привязан. Первая
      // группа с филиалом выигрывает — студент в двух филиалах по одному курсу
      // это аномалия, и счёт всё равно должен куда-то быть отнесён.
      const studentIds = new Set<string>();
      const studentBranch = new Map<string, string>();
      for (const g of groupSnap.docs) {
        const gData = g.data() as any;
        // Только ЖИВЫЕ группы. Курс может годами оставаться опубликованным с
        // ценой, а группа при этом закрыта ещё весной — и счета продолжали
        // выставляться людям, которые давно не учатся. Пустой status считаем
        // активным: у легаси-групп поля нет, и белый список стёр бы их все.
        if (gData.status && gData.status !== 'active') continue;
        const gBranchId = gData.branchId || null;
        for (const sid of (gData.studentIds || [])) {
          studentIds.add(sid);
          if (gBranchId && !studentBranch.has(sid)) studentBranch.set(sid, gBranchId);
        }
      }
      if (studentIds.size === 0) continue;

      // Отчисленных не выставляем. Список группы их не теряет (сама группа —
      // это состав, а не статус), поэтому крон продолжал начислять человеку,
      // который ушёл: счёт уходил в долг организации, студенту летели
      // напоминания, а на «Оплатах за месяц» строки не было вовсе.
      const activeStudents = await loadActiveStudents(orgId);
      for (const sid of [...studentIds]) {
        if (!activeStudents.has(sid)) { studentIds.delete(sid); skippedExpelled++; }
      }
      if (studentIds.size === 0) continue;

      // Who is already billed for this period? (equality-only query → no composite index)
      const billedSnap = await adminDb.collection(PLANS)
        .where('organizationId', '==', orgId)
        .where('courseId', '==', courseId)
        .where('period', '==', period)
        .get();
      const alreadyBilled = new Set(billedSnap.docs.map(d => d.data().studentId));

      const toBill = [...studentIds].filter(sid => !alreadyBilled.has(sid));
      if (toBill.length === 0) continue;

      // Create invoices in chunked batches (1 write each).
      // Id детерминированный (utils/billing.monthlyPlanId) и запись через
      // `create`: дедуп выше — это чтение перед записью, и между ними помещается
      // ручное «Начислить за месяц» из интерфейса. Теперь второй счёт за тот же
      // месяц отвергает база, кто бы его ни писал.
      const CHUNK = 400;
      const createdForNotify: string[] = [];
      for (let i = 0; i < toBill.length; i += CHUNK) {
        const slice = toBill.slice(i, i + CHUNK);
        const batch = adminDb.batch();
        for (const studentId of slice) {
          const ref = adminDb.collection(PLANS).doc(monthlyPlanId(orgId, courseId, studentId, period));
          batch.create(ref, {
            organizationId: orgId,
            branchId: studentBranch.get(studentId) || null,
            studentId,
            courseId,
            courseName: course.title || '',
            totalAmount: price,
            // Прайсовая цена курса — база для скидки, если сумму к оплате
            // позже уменьшат вручную. Пока равна totalAmount (скидки нет).
            listAmount: price,
            paidAmount: 0,
            status: 'pending',
            billingType: 'monthly',
            period,
            deadline,
            autoBilled: true,
            createdAt: ts,
            updatedAt: ts,
          });
          createdForNotify.push(studentId);
        }
        try {
          await batch.commit();
          invoicesCreated += slice.length;
        } catch {
          // Батч падает целиком, если хоть один счёт уже создан параллельно.
          // Дописываем поштучно: настоящий дубль пропускаем, остальным ученикам
          // чанка счета обязаны появиться. Уведомляем только реально созданных.
          const written: string[] = [];
          for (const studentId of slice) {
            try {
              await adminDb.collection(PLANS).doc(monthlyPlanId(orgId, courseId, studentId, period)).create({
                organizationId: orgId,
                branchId: studentBranch.get(studentId) || null,
                studentId,
                courseId,
                courseName: course.title || '',
                totalAmount: price,
                listAmount: price,
                paidAmount: 0,
                status: 'pending',
                billingType: 'monthly',
                period,
                deadline,
                autoBilled: true,
                createdAt: ts,
                updatedAt: ts,
              });
              written.push(studentId);
            } catch (e) {
              // Дубль — штатный исход гонки. ЛЮБАЯ другая ошибка (contention,
              // UNAVAILABLE, DEADLINE_EXCEEDED) означает, что счёт не выставлен;
              // проглотить её здесь значило бы вернуть {success:true,
              // coursesFailed:0} по курсу, который остался без начислений на
              // целый месяц. Пробрасываем — пусть её посчитает per-course catch.
              if (!isAlreadyExists(e)) throw e;
            }
          }
          invoicesCreated += written.length;
          // Из списка на уведомление убираем тех, кому счёт не создавали.
          const writtenSet = new Set(written);
          for (let k = createdForNotify.length - 1; k >= 0; k--) {
            if (slice.includes(createdForNotify[k]) && !writtenSet.has(createdForNotify[k])) {
              createdForNotify.splice(k, 1);
            }
          }
        }
      }
      studentsBilled += createdForNotify.length;

      // Notify each billed student (best-effort).
      const courseSuffix = course.title ? ` за «${course.title}»` : '';
      const periodLabel = runDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      await Promise.allSettled(createdForNotify.map(studentId =>
        createNotification({
          recipientId: studentId,
          type: 'payment_due',
          title: 'Выставлен счёт за обучение',
          message: `Счёт за ${periodLabel}: ${fmtAmount(price)} с.${courseSuffix}. Оплатить до ${new Date(deadline).toLocaleDateString('ru-RU')}.`,
          link: '/diary',
          organizationId: orgId,
          metadata: { courseId, period },
        })
      ));

      } catch (courseError: any) {
        // Логируем и идём дальше: остальные курсы и организации обязаны получить
        // свои счета. Число попавших сюда возвращаем в ответе, чтобы прогон с
        // частичным провалом нельзя было принять за успешный.
        coursesFailed++;
        console.error(`Monthly billing failed for course ${courseId} (org ${orgId}):`, courseError);
      }
    }

    return jsonResponse(200, {
      success: true, period, coursesProcessed, studentsBilled, invoicesCreated,
      coursesFailed, skippedExpelled,
    });
  } catch (error: any) {
    console.error('Monthly billing error:', error);
    return jsonResponse(500, { error: error.message });
  }
};

export { handler };
