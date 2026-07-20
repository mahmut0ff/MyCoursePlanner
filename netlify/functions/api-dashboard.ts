/**
 * API: Dashboard — aggregated stats (org-scoped, branch-aware).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, hasRole, getOrgFilter, resolveBranchFilter, memberInBranchScope, memberHoldsRole, ok, unauthorized, forbidden, jsonResponse } from './utils/auth';
import { computeStudentRisk, needsAttention } from './utils/risk';

/** ISO timestamp for the 1st of the month, `offset` months back (0 = this month). */
function monthStartISO(offset = 0): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - offset);
  return d.toISOString();
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

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
      const students = branchMembers.filter((m: any) => m.data().role === 'student').length;
      const teachers = branchMembers.filter((m: any) => ['teacher', 'mentor', 'admin', 'owner'].includes(m.data().role)).length;

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
      students: unassignedMembers.filter((m: any) => m.data().role === 'student').length,
      teachers: unassignedMembers.filter((m: any) => ['teacher', 'mentor'].includes(m.data().role)).length,
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

    return ok({ branches: result, unassigned, totalBranches: branchesSnap.size });
  }

  // ═══ OWNER OVERVIEW (command-center data — growth, performance, attendance, leads, risk) ═══
  // Non-financial on purpose: money lives in api-finance-metrics (permission-gated). This is safe
  // for managers without the `finances` permission. One heavy aggregation per dashboard load.
  if (action === 'overview') {
    if (!orgFilter) return forbidden();
    if (!hasRole(user, 'admin') && !hasRole(user, 'manager')) return forbidden();

    const monthStart = monthStartISO(0);
    const lastMonthStart = monthStartISO(1);
    const nowMs = Date.now();
    const emptyCount = { data: () => ({ count: 0 }) };

    const [memberSnap, leadSnap, attemptSnap, journalSnap, overdueSnap, hwCountSnap] = await Promise.all([
      adminDb.collection('orgMembers').doc(orgFilter).collection('members').where('status', '==', 'active').get(),
      adminDb.collection('organizations').doc(orgFilter).collection('aiLeads').get().catch(() => null),
      adminDb.collection('examAttempts').where('organizationId', '==', orgFilter).get().catch(() => null),
      adminDb.collection('journal').where('organizationId', '==', orgFilter).get().catch(() => null),
      adminDb.collection('studentPaymentPlans').where('organizationId', '==', orgFilter).where('status', '==', 'overdue').get().catch(() => null),
      adminDb.collection('homework_submissions').where('organizationId', '==', orgFilter).where('status', '==', 'pending').count().get().catch(() => emptyCount),
    ]);

    // Scope the roster to the selected branch, the same way the students list
    // does. Without this the overview counted the whole org while the list next
    // to it counted one branch — the mismatch that made these tiles untrustworthy.
    const overviewScope = resolveBranchFilter(user, params.branchId);
    if (overviewScope === '__DENIED__') return forbidden();

    const members = memberSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter(m => memberInBranchScope(m.branchIds, overviewScope));
    const students = members.filter(m => memberHoldsRole(m, ['student']));
    const teachers = members.filter(m => memberHoldsRole(m, ['teacher', 'mentor'])).length;
    const memberByUid = new Map<string, any>();
    students.forEach(m => memberByUid.set(m.userId || m.id, m));
    const studentIds = Array.from(memberByUid.keys());
    const studentIdSet = new Set(studentIds);

    const sinceOf = (m: any) => m.joinedAt || m.createdAt || '';
    const newThisMonth = students.filter(m => sinceOf(m) >= monthStart).length;
    const newLastMonth = students.filter(m => sinceOf(m) >= lastMonthStart && sinceOf(m) < monthStart).length;
    // Apples-to-apples: last month up to the same day-of-month, so an early-month
    // comparison isn't distorted (MTD vs full month).
    const lmStart = new Date(lastMonthStart);
    const lmDays = new Date(Date.UTC(lmStart.getUTCFullYear(), lmStart.getUTCMonth() + 1, 0)).getUTCDate();
    const lmCutoff = new Date(Date.UTC(
      lmStart.getUTCFullYear(), lmStart.getUTCMonth(), Math.min(new Date().getUTCDate(), lmDays), 23, 59, 59, 999,
    )).toISOString();
    const newLastMonthToDate = students.filter(m => { const s = sinceOf(m); return s >= lastMonthStart && s <= lmCutoff; }).length;

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
    const overdueStudents = new Set<string>();
    (overdueSnap?.docs || []).forEach(d => { const s = (d.data() as any).studentId; if (s && studentIdSet.has(s)) overdueStudents.add(s); });

    const avgScore = allAttempts.length
      ? Math.round(allAttempts.reduce((s, a) => s + (a.percentage || 0), 0) / allAttempts.length)
      : null;
    const attemptsThisMonth = allAttempts.filter(a => (a.createdAt || a.submittedAt || '') >= monthStart).length;

    const totalAbsences = allJournal.filter(j => j.attendance === 'absent').length;
    const rateAvg = allJournal.length ? Math.round(((allJournal.length - totalAbsences) / allJournal.length) * 100) : null;
    const absencesThisMonth = allJournal.filter(j => j.attendance === 'absent' && (j.date || '') >= monthStart).length;

    // Risk counts — same shared formula api-risk uses, so this tile and the
    // students list can never disagree again. `overdue` is counted separately:
    // debt is a finance problem, not churn (see utils/risk.ts).
    let riskHigh = 0, riskMedium = 0, riskOverdue = 0, riskAttention = 0;
    studentIds.forEach(uid => {
      const member = memberByUid.get(uid) || {};
      const r = computeStudentRisk({
        enrolledAt: member.joinedAt || member.createdAt,
        attempts: attemptsByStudent.get(uid) || [],
        journal: journalByStudent.get(uid) || [],
        hasOverduePayment: overdueStudents.has(uid),
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

    const leads = (leadSnap?.docs || []).map(d => d.data() as any);
    const leadCount = (st: string) => leads.filter(l => (l.status || 'new') === st).length;

    return ok({
      students: { active: students.length, newThisMonth, newLastMonth, newLastMonthToDate },
      teachers,
      performance: { avgScore, attemptsThisMonth },
      attendance: { rateAvg, absencesThisMonth },
      risk: { high: riskHigh, medium: riskMedium, total: riskHigh + riskMedium, overdue: riskOverdue, attention: riskAttention },
      leads: {
        total: leads.length,
        new: leadCount('new'),
        contacted: leadCount('contacted'),
        resolved: leadCount('resolved'),
        newThisMonth: leads.filter(l => (l.createdAt || '') >= monthStart).length,
      },
      pendingHomework: hwCountSnap.data().count,
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
