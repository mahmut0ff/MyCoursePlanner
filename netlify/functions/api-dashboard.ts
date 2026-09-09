/**
 * API: Dashboard — aggregated stats (org-scoped, branch-aware).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, hasRole, can, getOrgFilter, resolveBranchFilter, memberInBranchScope, memberHoldsRole, recordInBranchScope, ok, unauthorized, forbidden, jsonResponse } from './utils/auth';
import { computeStudentRisk, needsAttention } from './utils/risk';
import { isDebtBearingPlan, isPlanOverdue, orgDayKey } from './utils/payment-plans';
import { attendanceRate, wasAbsent } from './utils/attendance';
import { getPeriodRange, getPreviousRange } from './utils/finance-period';

/**
 * Границы «этого месяца» и «прошлого месяца до сегодняшнего числа».
 *
 * Считает их тот же util, что размечает периоды в финансах, — и это не
 * экономия строк. Здесь стояла своя арифметика на setUTCDate/setUTCMonth, то
 * есть месяц по UTC, тогда как весь денежный контур и просрочка живут в дне
 * организации (UTC+6). Каждую ночь на 1-е число шесть часов подряд «новые
 * ученики этого месяца» на главной и «этот месяц» в финансах указывали на
 * РАЗНЫЕ месяцы.
 *
 * `prevEndIso` — правая граница «прошлый месяц до этого же числа»: её усечение
 * (включая clamp на коротком феврале) уже решено в getPreviousRange, и
 * повторять это правило здесь значит завести второй его экземпляр.
 */
function monthWindows() {
  const { startIso, endIso } = getPeriodRange('current_month');
  const { prevStartIso, prevEndIso } = getPreviousRange('current_month', startIso, endIso, false);
  return { monthStart: startIso, monthEnd: endIso, lastMonthStart: prevStartIso, lastMonthToDateEnd: prevEndIso };
}

/**
 * Календарный день события — В КАЛЕНДАРЕ ОРГАНИЗАЦИИ, 'YYYY-MM-DD'.
 *
 * Данные приходят в двух формах, и обе нужно уметь сравнить с границей окна:
 *  • голая дата ('2026-08-01' — journal.date, enrollmentDate) — это УЖЕ день,
 *    трогать её нельзя;
 *  • полный ISO ('2026-07-31T19:00:00Z' — joinedAt, submittedAt, createdAt) —
 *    это МОМЕНТ, и днём он становится только после сдвига в зону организации:
 *    для Бишкека это уже 1 августа, и запись обязана считаться августовской.
 *
 * Прямое сравнение строк не работает ни в ту, ни в другую сторону:
 * '2026-08-01' < '2026-08-01T00:00:00.000Z' лексикографически (короткая строка —
 * префикс длинной), из-за чего терялось КАЖДОЕ первое число месяца; а срез
 * первых десяти символов от границы окна ('2026-07-31T18:00:00.000Z' — начало
 * августа для UTC+6) назвал бы её 31 июля и втащил в месяц лишний день.
 * Поэтому к дню приводятся ОБЕ стороны сравнения — и значение, и граница.
 */
const dayKeyOf = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : orgDayKey(parsed);
};
const inDayRange = (value: unknown, startIso: string, endIso: string): boolean => {
  const day = dayKeyOf(value);
  return !!day && day >= dayKeyOf(startIso) && day <= dayKeyOf(endIso);
};

/**
 * Наборы ролей для подсчёта людей — ОДНИ на весь файл.
 *
 * Колонки таблицы филиалов считались по разным правилам: в строке филиала
 * «Преподаватели» включали admin и owner, а в строке «Не назначены» — нет, и
 * два числа в одной колонке нельзя было складывать. Плюс матчился строгий
 * `role`, из-за чего участник с ролью в `roles[]` (учитель + студент) выпадал
 * из обеих колонок, хотя в ростере и в overview он есть — там memberHoldsRole.
 */
const STUDENT_ROLES = ['student'];
const TEACHER_ROLES = ['teacher', 'mentor'];

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized(event);

  const params = event.queryStringParameters || {};
  const action = params.action || '';
  const orgFilter = getOrgFilter(user);

  // ═══ BRANCH ANALYTICS (owner drilldown) ═══
  if (action === 'branchAnalytics') {
    if (!orgFilter) return forbidden();
    if (!hasRole(user, 'admin') && !hasRole(user, 'manager')) return forbidden();

    // Get all active branches for this org
    const branchesSnap = await adminDb.collection('branches')
      .where('organizationId', '==', orgFilter)
      .where('isActive', '==', true).get();

    // Get all active members
    const membersSnap = await adminDb.collection('orgMembers').doc(orgFilter)
      .collection('members').where('status', '==', 'active').get();

    // Get entity counts. Курсы не читаем: у них нет branchId, а «курсы филиала»
    // выводятся из его групп (см. ниже).
    const [groupsSnap, examsSnap] = await Promise.all([
      adminDb.collection('groups').where('organizationId', '==', orgFilter).get(),
      adminDb.collection('exams').where('organizationId', '==', orgFilter).get(),
    ]);

    const branchAnalytics = branchesSnap.docs.map(bDoc => {
      const branch = { id: bDoc.id, ...bDoc.data() };
      const bId = bDoc.id;

      // Count members assigned to this branch
      const branchMembers = membersSnap.docs.filter((m: any) => {
        const data = m.data();
        return data.branchIds && data.branchIds.includes(bId);
      });
      const students = branchMembers.filter((m: any) => memberHoldsRole(m.data(), STUDENT_ROLES)).length;
      const teachers = branchMembers.filter((m: any) => memberHoldsRole(m.data(), TEACHER_ROLES)).length;

      // Count entities tagged to this branch.
      // Курс сам по себе к филиалу не привязан (общий каталог), поэтому «курсы филиала» =
      // сколько РАЗНЫХ курсов здесь реально ведётся, считая по группам этого филиала.
      // Курс с группами в двух филиалах честно попадает в оба.
      const branchGroups = groupsSnap.docs.filter((g: any) => g.data().branchId === bId);
      const courses = new Set(branchGroups.map((g: any) => g.data().courseId).filter(Boolean)).size;
      const groups = branchGroups.length;
      const exams = examsSnap.docs.filter((e: any) => e.data().branchId === bId).length;

      return {
        branchId: bId,
        branchName: (branch as any).name,
        city: (branch as any).city || '',
        students,
        teachers,
        courses,
        groups,
        exams,
      };
    });

    // Unassigned counts (entities/members with no branchId)
    const unassignedMembers = membersSnap.docs.filter((m: any) => {
      const data = m.data();
      return !data.branchIds || data.branchIds.length === 0;
    });
    const unassigned = {
      branchId: null,
      branchName: 'Не назначены',
      city: '',
      students: unassignedMembers.filter((m: any) => memberHoldsRole(m.data(), STUDENT_ROLES)).length,
      teachers: unassignedMembers.filter((m: any) => memberHoldsRole(m.data(), TEACHER_ROLES)).length,
      // Те же правила, что и выше: курсы считаем через группы без филиала.
      courses: new Set(
        groupsSnap.docs.filter((g: any) => !g.data().branchId).map((g: any) => g.data().courseId).filter(Boolean)
      ).size,
      groups: groupsSnap.docs.filter((g: any) => !g.data().branchId).length,
      exams: examsSnap.docs.filter((e: any) => !e.data().branchId).length,
    };

    // If manager, filter to only their branches
    let result = branchAnalytics;
    if (hasRole(user, 'manager') && user.branchIds.length > 0) {
      result = result.filter(b => user.branchIds.includes(b.branchId));
    }

    // `totalBranches` — подпись под таблицей («N филиалов»), поэтому это число
    // ПОКАЗАННЫХ строк, а не всех филиалов организации: менеджеру со своим
    // одним филиалом таблица честно рисовала одну строку и тут же подписывала
    // её «4 филиала».
    return ok({ branches: result, unassigned, totalBranches: result.length });
  }

  // ═══ OWNER OVERVIEW (command-center data — growth, performance, attendance, leads, risk) ═══
  // Non-financial on purpose: money lives in api-finance-metrics (permission-gated). This is safe
  // for managers without the `finances` permission. One heavy aggregation per dashboard load.
  if (action === 'overview') {
    if (!orgFilter) return forbidden();
    if (!hasRole(user, 'admin') && !hasRole(user, 'manager')) return forbidden();

    const { monthStart, monthEnd, lastMonthStart, lastMonthToDateEnd } = monthWindows();
    const nowMs = Date.now();
    const emptyCount = { data: () => ({ count: 0 }) };

    // ── Каждая плитка гейтится правом того экрана, куда она ведёт ──
    // Гейт на весь ответ — только роль, и этого мало: «Ученики в зоне риска»
    // ведёт в ростер (api-risk требует students:read), «Непроверенные ДЗ» — в
    // проверку ДЗ (homework), воронка — в /leads. Менеджер без students:read
    // видел на главной число, а по клику получал пустой экран. Права решаются
    // ЗДЕСЬ, до чтения: чего нельзя показать, того не надо и читать.
    const canSeeMoney = can(user, 'finances', 'read');
    const canSeeStudents = can(user, 'students', 'read');
    const canSeeLeads = can(user, 'leads', 'read');
    const canSeeHomework = can(user, 'homework', 'read');

    // Scope the roster to the selected branch, the same way the students list
    // does. Without this the overview counted the whole org while the list next
    // to it counted one branch — the mismatch that made these tiles untrustworthy.
    const overviewScope = resolveBranchFilter(user, params.branchId);
    if (overviewScope === '__DENIED__') return forbidden();

    const [memberSnap, leadSnap, attemptSnap, journalSnap, plansSnap, hwCountSnap] = await Promise.all([
      adminDb.collection('orgMembers').doc(orgFilter).collection('members').where('status', '==', 'active').get(),
      canSeeLeads
        ? adminDb.collection('organizations').doc(orgFilter).collection('aiLeads').get().catch(() => null)
        : null,
      adminDb.collection('examAttempts').where('organizationId', '==', orgFilter).get().catch(() => null),
      adminDb.collection('journal').where('organizationId', '==', orgFilter).get().catch(() => null),
      // Счета читаем, только если вызывающему вообще показывают деньги: без
      // этого права признак долга всё равно гасится ниже, и полное чтение
      // коллекции счетов было платой ни за что (api-risk уже так и делает).
      canSeeMoney
        ? adminDb.collection('studentPaymentPlans').where('organizationId', '==', orgFilter).get().catch(() => null)
        : null,
      canSeeHomework
        ? adminDb.collection('homework_submissions').where('organizationId', '==', orgFilter).where('status', '==', 'pending').count().get().catch(() => emptyCount)
        : Promise.resolve(emptyCount),
    ]);

    const members = memberSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter(m => memberInBranchScope(m.branchIds, overviewScope));
    const students = members.filter(m => memberHoldsRole(m, ['student']));
    const teachers = members.filter(m => memberHoldsRole(m, ['teacher', 'mentor'])).length;
    const memberByUid = new Map<string, any>();
    students.forEach(m => memberByUid.set(m.userId || m.id, m));
    const studentIds = Array.from(memberByUid.keys());
    const studentIdSet = new Set(studentIds);

    /**
     * С какого момента ученик считается «новым».
     *
     * `enrollmentDate` (дата поступления, её ставит менеджер в карточке и при
     * импорте) — ПЕРВЕЕ технической `joinedAt`. Иначе метрика меряет работу
     * оператора, а не набор: импорт архива из 200 учеников давал 200 «новых в
     * этом месяце», а ученик, оформленный задним числом, в набор не попадал
     * вовсе. Поля нет — падаем на прежнюю пару joinedAt/createdAt.
     */
    const sinceOf = (m: any) => m.enrollmentDate || m.joinedAt || m.createdAt || '';
    // Сравнение по дням: enrollmentDate — голая дата 'YYYY-MM-DD', joinedAt —
    // полный ISO. Прямое сравнение строк смешало бы два формата (см. dayKeyOf).
    const newThisMonth = students.filter(m => inDayRange(sinceOf(m), monthStart, monthEnd)).length;
    const newLastMonth = students.filter(m => {
      const day = dayKeyOf(sinceOf(m));
      return !!day && day >= dayKeyOf(lastMonthStart) && day < dayKeyOf(monthStart);
    }).length;
    // Apples-to-apples: прошлый месяц до того же числа, чтобы сравнение в начале
    // месяца не выглядело обвалом (MTD против полного месяца). Границу считает
    // getPreviousRange — своей арифметики здесь больше нет.
    const newLastMonthToDate = students.filter(m => inDayRange(sinceOf(m), lastMonthStart, lastMonthToDateEnd)).length;

    // Group attempts & attendance by student (single pass each).
    // Every aggregate below is derived from the in-scope roster only, so a branch
    // view reports that branch's performance rather than the whole org's.
    const attemptsByStudent = new Map<string, any[]>();
    const allAttempts = (attemptSnap?.docs || []).map(d => d.data() as any).filter(a => studentIdSet.has(a.studentId));
    allAttempts.forEach(a => {
      if (!attemptsByStudent.has(a.studentId)) attemptsByStudent.set(a.studentId, []);
      attemptsByStudent.get(a.studentId)!.push(a);
    });
    const journalByStudent = new Map<string, any[]>();
    const allJournal = (journalSnap?.docs || []).map(d => d.data() as any).filter(j => studentIdSet.has(j.studentId));
    allJournal.forEach(j => {
      if (!journalByStudent.has(j.studentId)) journalByStudent.set(j.studentId, []);
      journalByStudent.get(j.studentId)!.push(j);
    });
    // Просрочка — по СРОКУ (isPlanOverdue), не по сырому статусу 'overdue': тот же
    // предикат, что в api-risk и на экранах, поэтому этот тайл и список учеников
    // считают одних и тех же людей. Раньше запрос пинил status == 'overdue' —
    // продлённый срок оставлял ученика в «просрочке», а реально просроченный, но
    // ещё числящийся 'pending', в неё не попадал.
    //
    // Филиал у СЧЁТА проверяется отдельно от филиала у СТУДЕНТА, и одного
    // `studentIdSet` мало. api-risk (куда ведёт эта же плитка ссылкой
    // /students?risk=1) отбрасывает счета через recordInBranchScope, а здесь
    // такой проверки не было — значит два экрана считали разные множества:
    //  • счёт без branchId учитывался тут и не учитывался там (массовый случай:
    //    ручные счета до фикса branchId и любые легаси-начисления);
    //  • счёт ЧУЖОГО филиала у студента, состоящего в выбранном, добавлял
    //    плитке +1 там, где список показывал 0.
    // Плитке в AdminDashboard прямо предписано совпадать со списком, куда она
    // ведёт, — теперь у обоих одна ось филиала.
    const nowForOverdue = new Date();
    const overdueStudents = new Set<string>();
    (plansSnap?.docs || []).forEach(d => {
      const plan = d.data() as any;
      if (!plan.studentId || !studentIdSet.has(plan.studentId)) return;
      if (!recordInBranchScope(plan.branchId, overviewScope)) return;
      if (!isDebtBearingPlan(plan)) return;
      if (!isPlanOverdue(plan, nowForOverdue)) return;
      overdueStudents.add(plan.studentId);
    });

    // ── Успеваемость и посещаемость: ЗА МЕСЯЦ и ЗА ВСЁ ВРЕМЯ, раздельно ──
    // Раньше отдавалось только всевременное среднее, а подпись под плиткой
    // говорила «N тестов в этом месяце» — то есть число и его объяснение были
    // из разных периодов. У центра с двухлетней историей всевременное среднее
    // не двигается вовсе: по нему нельзя увидеть ни просадку месяца, ни эффект
    // от принятых мер. Отдаём оба: UI показывает месяц, всевременное остаётся
    // как контекст (и как значение для тех, у кого месяц ещё пустой).
    const avgOf = (arr: any[]): number | null => arr.length
      ? Math.round(arr.reduce((sum, a) => sum + (a.percentage || 0), 0) / arr.length)
      : null;
    const attemptInstant = (a: any) => a.submittedAt || a.createdAt || '';
    const attemptsThisMonthList = allAttempts.filter(a => inDayRange(attemptInstant(a), monthStart, monthEnd));
    const attemptsLastMonthList = allAttempts.filter(a => inDayRange(attemptInstant(a), lastMonthStart, lastMonthToDateEnd));
    const avgScore = avgOf(allAttempts);
    const avgScoreThisMonth = avgOf(attemptsThisMonthList);
    const avgScoreLastMonthToDate = avgOf(attemptsLastMonthList);
    const attemptsThisMonth = attemptsThisMonthList.length;

    // Посещаемость — общий канон (present + late), один с журналом, аналитикой
    // и рейтингом: см. src/lib/attendance.ts. Здесь стояла своя формула
    // (все − absent), по которой «уважительная» шла в присутствие, и главная
    // показывала процент выше журнала того же центра.
    const journalThisMonth = allJournal.filter(j => inDayRange(j.date, monthStart, monthEnd));
    const journalLastMonth = allJournal.filter(j => inDayRange(j.date, lastMonthStart, lastMonthToDateEnd));
    const rateAvg = attendanceRate(allJournal);
    const rateThisMonth = attendanceRate(journalThisMonth);
    const rateLastMonthToDate = attendanceRate(journalLastMonth);
    // «Прогулы» — только неуважительные пропуски (wasAbsent), и сравнение по
    // ДНЯМ: `j.date` — голая дата, monthStart — полный ISO, и прямое сравнение
    // строк молча теряло каждое первое число месяца.
    const absencesThisMonth = journalThisMonth.filter(wasAbsent).length;
    const lessonsThisMonth = journalThisMonth.length;

    // Risk counts — same shared formula api-risk uses, so this tile and the
    // students list can never disagree again. `overdue` is counted separately:
    // debt is a finance problem, not churn (see utils/risk.ts).
    let riskHigh = 0, riskMedium = 0, riskOverdue = 0, riskAttention = 0;
    studentIds.forEach(uid => {
      const member = memberByUid.get(uid) || {};
      const r = computeStudentRisk({
        // Тот же якорь, что в api-risk: зачисление в ЭТУ организацию.
        enrolledAt: member.enrollmentDate || member.joinedAt || member.createdAt,
        attempts: attemptsByStudent.get(uid) || [],
        journal: journalByStudent.get(uid) || [],
        // Тот же денежный гейт, что в api-risk: без доступа к финансам признак
        // долга в риск не входит. Иначе плитка «Ученики в зоне риска» и список
        // /students?risk=1, куда она ведёт, снова считали бы РАЗНЫХ людей —
        // теперь уже не из-за филиала, а из-за прав вызывающего.
        hasOverduePayment: canSeeMoney && overdueStudents.has(uid),
        nowMs,
      });
      if (r.riskLevel === 'high') riskHigh++;
      else if (r.riskLevel === 'medium') riskMedium++;
      if (r.hasOverduePayment) riskOverdue++;
      // `attention` is the headcount the "В зоне риска" chip on the students list
      // filters to. The dashboard tile links straight there, so it must count the
      // same people — a tile whose number shrinks when you click it is exactly the
      // kind of mismatch that made the old risk screen untrustworthy.
      if (needsAttention(r)) riskAttention++;
    });

    // ── Лиды ──
    // Филиал у заявки такой же обязательный признак, как у счёта: под выбранным
    // филиалом воронка обязана показывать ЕГО заявки, а не общесетевые. Заявка
    // из входного тестирования филиал несёт (api-public-exam), заявка из
    // веб-чата — нет, и по общему правилу для записей (recordInBranchScope)
    // непривязанная заявка в филиальный срез не попадает. Сколько таких
    // осталось за кадром, видно по `unassignedBranch` — та же справка, что у
    // денег в api-finance-metrics, иначе разрыв между филиалом и сетью нечем
    // объяснить.
    const allLeads = (leadSnap?.docs || []).map(d => d.data() as any);
    const leads = allLeads.filter(l => recordInBranchScope(l.branchId, overviewScope));
    const leadCount = (st: string) => leads.filter(l => (l.status || 'new') === st).length;

    return ok({
      students: { active: students.length, newThisMonth, newLastMonth, newLastMonthToDate },
      teachers,
      // `avgScore`/`rateAvg` — за всё время, `*ThisMonth` — за текущий месяц,
      // `*LastMonthToDate` — прошлый месяц до этого же числа (для дельты).
      // Плитка обязана подписывать, какой из них показывает.
      performance: {
        avgScore,
        avgScoreThisMonth,
        avgScoreLastMonthToDate,
        attemptsThisMonth,
        attemptsTotal: allAttempts.length,
      },
      attendance: {
        rateAvg,
        rateThisMonth,
        rateLastMonthToDate,
        absencesThisMonth,
        lessonsThisMonth,
      },
      risk: canSeeStudents
        ? { high: riskHigh, medium: riskMedium, total: riskHigh + riskMedium, overdue: riskOverdue, attention: riskAttention }
        // Право на ростер решает, показывать ли риск: плитка ведёт в
        // /students?risk=1, и число, за которым нет доступного экрана, — обещание,
        // которого интерфейс не выполнит. null (а не нули) — чтобы UI мог
        // отличить «нет доступа» от «никто не в риске» и просто скрыть плитку.
        : null,
      leads: canSeeLeads
        ? {
            total: leads.length,
            new: leadCount('new'),
            contacted: leadCount('contacted'),
            resolved: leadCount('resolved'),
            newThisMonth: leads.filter(l => inDayRange(l.createdAt, monthStart, monthEnd)).length,
            unassignedBranch: allLeads.length - leads.length,
          }
        : null,
      pendingHomework: canSeeHomework ? hwCountSnap.data().count : null,
    });
  }

  // ═══ DEFAULT DASHBOARD ═══
  const branchScope = resolveBranchFilter(user, params.branchId);

  // Build queries scoped to org
  let lessonsQuery: any = orgFilter
    ? adminDb.collection('lessonPlans').where('organizationId', '==', orgFilter)
    : adminDb.collection('lessonPlans');
  let examsQuery: any = orgFilter
    ? adminDb.collection('exams').where('organizationId', '==', orgFilter)
    : adminDb.collection('exams');
  let roomsQuery: any = orgFilter
    ? adminDb.collection('examRooms').where('organizationId', '==', orgFilter).where('status', '==', 'active')
    : adminDb.collection('examRooms').where('status', '==', 'active');

  // Apply branch filter if applicable
  if (branchScope === '__DENIED__') return ok({ lessonsCount: 0, examsCount: 0, activeRoomsCount: 0, attemptsCount: 0, avgScore: 0 });
  if (typeof branchScope === 'string') {
    lessonsQuery = lessonsQuery.where('branchId', '==', branchScope);
    examsQuery = examsQuery.where('branchId', '==', branchScope);
    roomsQuery = roomsQuery.where('branchId', '==', branchScope);
  } else if (Array.isArray(branchScope) && branchScope.length > 0 && branchScope.length <= 30) {
    // Multi-branch scope: Firestore `in` caps at 30 values. Beyond that the counts
    // stay org-wide rather than throwing — no org assigns one member that many
    // branches, and an over-broad count beats a failed dashboard.
    lessonsQuery = lessonsQuery.where('branchId', 'in', branchScope);
    examsQuery = examsQuery.where('branchId', 'in', branchScope);
    roomsQuery = roomsQuery.where('branchId', 'in', branchScope);
  }

  let lessonsSnap, examsSnap, roomsSnap;
  let lessonsCount = 0, examsCount = 0, roomsCount = 0, pendingHomeworkCount = 0;

  try {
    const [lCount, eCount, rCount, hwCount] = await Promise.all([
      lessonsQuery.count().get(),
      examsQuery.count().get(),
      roomsQuery.count().get(),
      orgFilter
        ? adminDb.collection('homework_submissions')
            .where('organizationId', '==', orgFilter)
            .where('status', '==', 'pending')
            .count().get()
        : Promise.resolve({ data: () => ({ count: 0 }) }),
    ]);
    lessonsCount = lCount.data().count;
    examsCount = eCount.data().count;
    roomsCount = rCount.data().count;
    pendingHomeworkCount = hwCount.data().count;

    // Try fetching with ordered limits
    [lessonsSnap, examsSnap, roomsSnap] = await Promise.all([
      lessonsQuery.orderBy('createdAt', 'desc').limit(5).get().catch(() => lessonsQuery.limit(5).get()),
      examsQuery.orderBy('createdAt', 'desc').limit(5).get().catch(() => examsQuery.limit(5).get()),
      roomsQuery.orderBy('createdAt', 'desc').limit(5).get().catch(() => roomsQuery.limit(5).get())
    ]);
  } catch (err) {
    console.error('Error fetching dashboard counts/limits:', err);
    // Fallback if count() or orderBy fails
    [lessonsSnap, examsSnap, roomsSnap] = await Promise.all([
      lessonsQuery.limit(5).get(),
      examsQuery.limit(5).get(),
      roomsQuery.limit(5).get()
    ]);
    lessonsCount = lessonsSnap.size;
    examsCount = examsSnap.size;
    roomsCount = roomsSnap.size;
  }

  let attemptsSnap: any = { docs: [] };
  let hasGroups = true;

  try {
    if (isStaff(user)) {
      let q: any = orgFilter
        ? adminDb.collection('examAttempts').where('organizationId', '==', orgFilter).orderBy('submittedAt', 'desc').limit(50)
        : adminDb.collection('examAttempts').orderBy('submittedAt', 'desc').limit(50);
      if (typeof branchScope === 'string') {
        q = adminDb.collection('examAttempts').where('organizationId', '==', orgFilter).where('branchId', '==', branchScope).limit(50);
      }
      attemptsSnap = await q.get();
    } else {
      try {
        attemptsSnap = await adminDb.collection('examAttempts')
          .where('studentId', '==', user.uid).orderBy('submittedAt', 'desc').get();
      } catch {
        // Fallback without orderBy if index missing
        attemptsSnap = await adminDb.collection('examAttempts')
          .where('studentId', '==', user.uid).limit(50).get();
      }

      try {
        const studentGroupsSnap = await adminDb.collection('groups')
          .where('organizationId', '==', orgFilter)
          .where('studentIds', 'array-contains', user.uid)
          .limit(1).get();
        hasGroups = !studentGroupsSnap.empty;
      } catch {
        hasGroups = false;
      }
    }
  } catch (err) {
    console.error('Error fetching attempts:', err);
    // attemptsSnap stays as empty { docs: [] }
  }

  let attempts = attemptsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

  // Multi-branch array filter in memory
  if (Array.isArray(branchScope)) {
    const filterFn = (item: any) => !item.branchId || branchScope.includes(item.branchId);
    attempts = attempts.filter(filterFn);
  }

  const avgScore = attempts.length > 0
    ? Math.round(attempts.reduce((s: number, a: any) => s + (a.percentage || 0), 0) / attempts.length)
    : 0;

  return ok({
    lessonsCount,
    examsCount,
    activeRoomsCount: roomsCount,
    attemptsCount: attempts.length,
    avgScore,
    pendingHomeworkCount,
    hasGroups,
    recentLessons: lessonsSnap.docs.slice(0, 5).map((d: any) => ({ id: d.id, ...d.data() })),
    recentExams: examsSnap.docs.slice(0, 5).map((d: any) => ({ id: d.id, ...d.data() })),
    activeRooms: roomsSnap.docs.slice(0, 5).map((d: any) => ({ id: d.id, ...d.data() })),
    recentAttempts: attempts.slice(0, 5),
  });
};

export { handler };
