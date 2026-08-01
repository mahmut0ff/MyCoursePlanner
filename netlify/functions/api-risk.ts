/**
 * API: Student risk
 *
 * Returns one risk profile per active student so the students list can badge
 * them. The risk formula itself lives in utils/risk.ts — this file is only
 * responsible for loading the org's data and scoping it correctly.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import {
  verifyAuth, ok, unauthorized, badRequest, forbidden, jsonResponse, isSuperAdmin,
  resolveBranchFilter, memberInBranchScope, memberHoldsRole, recordInBranchScope,
} from './utils/auth';
import { computeStudentRisk } from './utils/risk';
import { isDebtBearingPlan, isPlanOverdue } from './utils/payment-plans';

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};
  const orgId = params.orgId;

  if (!orgId) return badRequest('orgId required');

  // `orgId` arrives from the query string and used to be trusted as-is: any
  // authenticated user could ask for another academy's id and get back its whole
  // roster — names, avatars, attendance rate and an overdue-payment flag per
  // student. Nothing downstream caught it, because resolveBranchFilter scopes
  // BRANCHES, never the organization, and every query below filters on the
  // caller-supplied orgId. Super admins keep cross-org reads (the same rule
  // getOrgFilter applies); everyone else is pinned to their own membership.
  if (!isSuperAdmin(user) && orgId !== user.organizationId) return forbidden();

  // The client stamps the active branch onto this GET (api.ts BRANCH_SCOPED_ENDPOINTS).
  // This endpoint used to read only orgId and silently drop it, so picking a branch
  // in the switcher left the risk counts org-wide — and a branch-scoped manager
  // could read students from branches they aren't assigned to.
  const branchScope = resolveBranchFilter(user, params.branchId);
  if (branchScope === '__DENIED__') return ok([]);

  try {
    // 1. Resolve active students from the org-side membership mirror. Matched on
    //    memberHoldsRole (not a strict role == 'student' query) so a multi-role
    //    member shows up here exactly as they do in the students list.
    const memberSnap = await adminDb.collection('orgMembers').doc(orgId)
      .collection('members')
      .where('status', '==', 'active')
      .get();

    const memberByUid = new Map<string, any>();
    memberSnap.docs.forEach(d => {
      const data = d.data();
      if (!memberHoldsRole(data, ['student'])) return;
      if (!memberInBranchScope(data.branchIds, branchScope)) return;
      memberByUid.set(data.userId || d.id, data);
    });

    if (memberByUid.size === 0) return ok([]);
    const studentIds = Array.from(memberByUid.keys());

    // Batch-fetch only the org's student user docs.
    const usersMap = new Map<string, any>(Object.entries(await getDocsByIds('users', studentIds)));

    // Fall back to member data when a student's user doc is missing.
    const validStudents = studentIds.map(uid => {
      const profile = usersMap.get(uid) || {};
      const member = memberByUid.get(uid) || {};
      return {
        uid,
        displayName: profile.displayName || member.userName || 'Ученик',
        avatarUrl: profile.avatarUrl || '',
        // Enrollment into THIS org is the right anchor for retention and for the
        // newcomer grace — NOT account creation (profile.createdAt), which can be
        // months old for a student who only just joined this particular school.
        enrolledAt: member.joinedAt || member.createdAt || profile.createdAt,
        currentStreak: profile.currentStreak || 0,
      };
    });

    // 2-4. Load the signals. Equality-only queries — see the Firestore index note
    // in CLAUDE.md; filtering happens in memory.
    const [attemptsSnap, journalSnap, plansSnap] = await Promise.all([
      adminDb.collection('examAttempts').where('organizationId', '==', orgId).get(),
      adminDb.collection('journal').where('organizationId', '==', orgId).get(),
      // ВСЕ счёта организации, а не только `status == 'overdue'`: просрочку решаем
      // по СРОКУ (isPlanOverdue ниже), а не по зафиксированному полю status. Оно
      // не снимается при продлении срока и не знает про филиал, из-за чего оплаченный
      // студент горел «Не оплачено». Equality-only — без составного индекса (CLAUDE.md).
      adminDb.collection('studentPaymentPlans').where('organizationId', '==', orgId).get(),
    ]);

    const attemptsByStudent = new Map<string, any[]>();
    attemptsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (!attemptsByStudent.has(data.studentId)) attemptsByStudent.set(data.studentId, []);
      attemptsByStudent.get(data.studentId)!.push(data);
    });

    const journalByStudent = new Map<string, any[]>();
    journalSnap.docs.forEach(doc => {
      const data = doc.data();
      if (!journalByStudent.has(data.studentId)) journalByStudent.set(data.studentId, []);
      journalByStudent.get(data.studentId)!.push(data);
    });

    // Просрочка = счёт с непогашенным остатком, чей СРОК истёк, В ТЕКУЩЕМ филиале.
    // Ровно те же предикаты (isDebtBearingPlan + isPlanOverdue) и та же ветка
    // филиала (recordInBranchScope), что на финансовых экранах и в карточке
    // студента, — поэтому «Не оплачено», точка риска и раздел финансов больше не
    // расходятся. Раньше здесь стоял сырой `status == 'overdue'`: он оставался на
    // счёте после продления срока и после оплаты через другой счёт, и был
    // общеорганизационным — оплаченный студент в чужом филиале попадал в должники.
    const nowForOverdue = new Date();
    const overdueStudents = new Set<string>();
    plansSnap.docs.forEach(doc => {
      const plan = doc.data() as any;
      if (!plan.studentId) return;
      if (!recordInBranchScope(plan.branchId, branchScope)) return;
      if (!isDebtBearingPlan(plan)) return;
      if (!isPlanOverdue(plan, nowForOverdue)) return;
      overdueStudents.add(plan.studentId);
    });

    const nowMs = Date.now();

    const risks = validStudents.map(student => {
      const risk = computeStudentRisk({
        enrolledAt: student.enrolledAt,
        attempts: attemptsByStudent.get(student.uid) || [],
        journal: journalByStudent.get(student.uid) || [],
        hasOverduePayment: overdueStudents.has(student.uid),
        nowMs,
      });

      return {
        studentId: student.uid,
        studentName: student.displayName,
        avatarUrl: student.avatarUrl,
        streak: student.currentStreak,
        ...risk,
        // Legacy alias — older callers read `missedAssignments`.
        missedAssignments: risk.missedLessons,
      };
    });

    return ok(risks);
  } catch (err: any) {
    console.error(err);
    return badRequest('Failed to calculate risk metrics');
  }
};
