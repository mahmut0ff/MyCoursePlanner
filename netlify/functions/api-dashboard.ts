/**
 * API: Dashboard — aggregated stats (org-scoped, branch-aware).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, hasRole, getOrgFilter, resolveBranchFilter, ok, unauthorized, forbidden, jsonResponse } from './utils/auth';

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
  let lessonsCount = 0, examsCount = 0, roomsCount = 0;

  try {
    const [lCount, eCount, rCount] = await Promise.all([
      lessonsQuery.count().get(),
      examsQuery.count().get(),
      roomsQuery.count().get()
    ]);
    lessonsCount = lCount.data().count;
    examsCount = eCount.data().count;
    roomsCount = rCount.data().count;

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

  let attemptsSnap;
  let hasGroups = true;

  if (isStaff(user)) {
    let q: any = orgFilter
      ? adminDb.collection('examAttempts').where('organizationId', '==', orgFilter).orderBy('submittedAt', 'desc').limit(50)
      : adminDb.collection('examAttempts').orderBy('submittedAt', 'desc').limit(50);
    if (typeof branchScope === 'string') {
      q = adminDb.collection('examAttempts').where('organizationId', '==', orgFilter).where('branchId', '==', branchScope).limit(50);
    }
    attemptsSnap = await q.get();
  } else {
    attemptsSnap = await adminDb.collection('examAttempts')
      .where('studentId', '==', user.uid).orderBy('submittedAt', 'desc').get();

    const studentGroupsSnap = await adminDb.collection('groups')
      .where('organizationId', '==', orgFilter)
      .where('studentIds', 'array-contains', user.uid)
      .limit(1).get();
    hasGroups = !studentGroupsSnap.empty;
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
    hasGroups,
    recentLessons: lessonsSnap.docs.slice(0, 5).map((d: any) => ({ id: d.id, ...d.data() })),
    recentExams: examsSnap.docs.slice(0, 5).map((d: any) => ({ id: d.id, ...d.data() })),
    activeRooms: roomsSnap.docs.slice(0, 5).map((d: any) => ({ id: d.id, ...d.data() })),
    recentAttempts: attempts.slice(0, 5),
  });
};

export { handler };
