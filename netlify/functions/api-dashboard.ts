/**
 * API: Dashboard — aggregated stats (org-scoped, branch-aware).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, hasRole, getOrgFilter, resolveBranchFilter, ok, unauthorized, forbidden, jsonResponse } from './utils/auth';

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

    // Get entity counts
    const [coursesSnap, groupsSnap, examsSnap] = await Promise.all([
      adminDb.collection('courses').where('organizationId', '==', orgFilter).get(),
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

      // Count entities tagged to this branch
      const courses = coursesSnap.docs.filter((c: any) => c.data().branchId === bId).length;
      const groups = groupsSnap.docs.filter((g: any) => g.data().branchId === bId).length;
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
      courses: coursesSnap.docs.filter((c: any) => !c.data().branchId).length,
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

    const members = memberSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const students = members.filter(m => m.role === 'student');
    const teachers = members.filter(m => ['teacher', 'mentor'].includes(m.role)).length;
    const memberByUid = new Map<string, any>();
    students.forEach(m => memberByUid.set(m.userId || m.id, m));
    const studentIds = Array.from(memberByUid.keys());

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
    const attemptsByStudent = new Map<string, any[]>();
    const allAttempts = (attemptSnap?.docs || []).map(d => d.data() as any);
    allAttempts.forEach(a => {
      if (!attemptsByStudent.has(a.studentId)) attemptsByStudent.set(a.studentId, []);
      attemptsByStudent.get(a.studentId)!.push(a);
    });
    const journalByStudent = new Map<string, any[]>();
    const allJournal = (journalSnap?.docs || []).map(d => d.data() as any);
    allJournal.forEach(j => {
      if (!journalByStudent.has(j.studentId)) journalByStudent.set(j.studentId, []);
      journalByStudent.get(j.studentId)!.push(j);
    });
    const overdueStudents = new Set<string>();
    (overdueSnap?.docs || []).forEach(d => { const s = (d.data() as any).studentId; if (s) overdueStudents.add(s); });

    const avgScore = allAttempts.length
      ? Math.round(allAttempts.reduce((s, a) => s + (a.percentage || 0), 0) / allAttempts.length)
      : null;
    const attemptsThisMonth = allAttempts.filter(a => (a.createdAt || a.submittedAt || '') >= monthStart).length;

    const totalAbsences = allJournal.filter(j => j.attendance === 'absent').length;
    const rateAvg = allJournal.length ? Math.round(((allJournal.length - totalAbsences) / allJournal.length) * 100) : null;
    const absencesThisMonth = allJournal.filter(j => j.attendance === 'absent' && (j.date || '') >= monthStart).length;

    // Risk counts — mirror api-risk thresholds so the dashboard count matches the Risk page.
    let riskHigh = 0, riskMedium = 0;
    studentIds.forEach(uid => {
      const sa = attemptsByStudent.get(uid) || [];
      const sj = journalByStudent.get(uid) || [];
      const member = memberByUid.get(uid) || {};
      const hasScores = sa.length > 0;
      const avg = hasScores ? Math.round(sa.reduce((s, a) => s + (a.percentage || 0), 0) / sa.length) : 0;
      const missed = sj.filter(j => j.attendance === 'absent').length;
      const attendanceRate = sj.length ? Math.round(((sj.length - missed) / sj.length) * 100) : 100;
      const dates = [new Date(member.createdAt || nowMs).getTime()];
      sa.forEach(a => a.createdAt && dates.push(new Date(a.createdAt).getTime()));
      sj.forEach(j => j.date && dates.push(new Date(j.date).getTime()));
      const daysSince = Math.floor((nowMs - Math.max(...dates)) / 86400000);
      const overdue = overdueStudents.has(uid);
      if (daysSince > 7 || (hasScores && avg < 50) || attendanceRate < 50 || overdue) riskHigh++;
      else if (daysSince > 4 || (hasScores && avg < 70) || attendanceRate < 80) riskMedium++;
    });

    const leads = (leadSnap?.docs || []).map(d => d.data() as any);
    const leadCount = (st: string) => leads.filter(l => (l.status || 'new') === st).length;

    return ok({
      students: { active: students.length, newThisMonth, newLastMonth, newLastMonthToDate },
      teachers,
      performance: { avgScore, attemptsThisMonth },
      attendance: { rateAvg, absencesThisMonth },
      risk: { high: riskHigh, medium: riskMedium, total: riskHigh + riskMedium },
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
