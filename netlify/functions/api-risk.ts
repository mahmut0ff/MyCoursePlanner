/**
 * API: Risk Dashboard
 * Aggregates student data to detect those in risk zones (Red, Yellow, Green)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, badRequest, jsonResponse } from './utils/auth';

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};
  const orgId = params.orgId;
  const courseId = params.courseId; // optional

  if (!orgId) return badRequest('orgId required');

  try {
    // 1. Resolve active students from the org-side membership mirror.
    const memberSnap = await adminDb.collection('orgMembers').doc(orgId)
      .collection('members')
      .where('role', '==', 'student')
      .where('status', '==', 'active')
      .get();

    if (memberSnap.empty) return ok([]);

    const memberByUid = new Map<string, any>();
    memberSnap.docs.forEach(d => {
      const data = d.data();
      memberByUid.set(data.userId || d.id, data);
    });
    const studentIds = Array.from(memberByUid.keys());

    // Batch-fetch only the org's student user docs (Firestore 'in' supports max 30 ids per query).
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

    // 2. Load attempts to get avg scores and last active dates
    const attemptsSnap = await adminDb.collection('examAttempts')
      .where('organizationId', '==', orgId)
      .get();
      
    const attemptsByStudent = new Map<string, any[]>();
    attemptsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (!attemptsByStudent.has(data.studentId)) attemptsByStudent.set(data.studentId, []);
      attemptsByStudent.get(data.studentId)!.push(data);
    });

    // 3. Load attendance entries from the journal for attendance rate.
    const journalSnap = await adminDb.collection('journal')
      .where('organizationId', '==', orgId).get();
      
    const journalByStudent = new Map<string, any[]>();
    journalSnap.docs.forEach(doc => {
      const data = doc.data();
      if (!journalByStudent.has(data.studentId)) journalByStudent.set(data.studentId, []);
      journalByStudent.get(data.studentId)!.push(data);
    });

    // 4. Load overdue payment plans — debt is a strong, reliable risk signal.
    const overdueSnap = await adminDb.collection('studentPaymentPlans')
      .where('organizationId', '==', orgId).where('status', '==', 'overdue').get();
    const overdueStudents = new Set<string>();
    overdueSnap.docs.forEach(doc => {
      const s = (doc.data() as any).studentId;
      if (s) overdueStudents.add(s);
    });

    const now = new Date();

    const risks = validStudents.map(student => {
      const sAttempts = attemptsByStudent.get(student.uid) || [];
      const sJournal = journalByStudent.get(student.uid) || [];

      // Avg Score
      let avgScore = 0;
      const hasScores = sAttempts.length > 0;
      if (hasScores) {
        avgScore = Math.round(sAttempts.reduce((acc, curr) => acc + curr.percentage, 0) / sAttempts.length);
      }

      // Attendance Rate
      let attendanceRate = 100;
      const missed = sJournal.filter(j => j.attendance === 'absent').length;
      if (sJournal.length > 0) {
        attendanceRate = Math.round(((sJournal.length - missed) / sJournal.length) * 100);
      }

      // Has the student ever actually engaged? An exam attempt, or an attendance
      // record that isn't an absence, counts. A just-added / imported student who
      // has only ever been marked absent (or has no records at all) never really
      // started — there is nothing to churn from, so they are NOT a retention risk.
      const attendedCount = sJournal.filter(j => j.attendance && j.attendance !== 'absent').length;
      const everEngaged = sAttempts.length > 0 || attendedCount > 0;

      // Days since last *real* activity: latest exam, or latest day present.
      // Account/enrollment creation is NOT activity — seeding "last active" with
      // createdAt is what made freshly-added students look inactive for weeks and
      // land in the red zone. Recent absences don't count as "active" either.
      const activityDates: Date[] = [];
      sAttempts.forEach(a => { const d = a.submittedAt || a.createdAt; if (d) activityDates.push(new Date(d)); });
      sJournal.forEach(j => { if (j.date && j.attendance !== 'absent') activityDates.push(new Date(j.date)); });
      activityDates.sort((a, b) => b.getTime() - a.getTime());

      const enrolledAt = new Date(student.enrolledAt || Date.now());
      const daysSinceEnrolled = Math.max(0, Math.floor((now.getTime() - enrolledAt.getTime()) / (1000 * 3600 * 24)));

      // "Last active" is the latest real activity; for a never-engaged student we
      // fall back to how long ago they were added (display only — see everEngaged).
      const daysSinceLastActive = activityDates.length > 0
        ? Math.floor((now.getTime() - activityDates[0].getTime()) / (1000 * 3600 * 24))
        : daysSinceEnrolled;

      // Score dynamics — are the most recent results trending down?
      let scoreTrend: 'up' | 'down' | 'flat' = 'flat';
      if (sAttempts.length >= 4) {
        const sorted = [...sAttempts].sort((a, b) =>
          new Date(a.submittedAt || a.createdAt || 0).getTime() - new Date(b.submittedAt || b.createdAt || 0).getTime());
        const avgOf = (arr: any[]) => arr.reduce((s, x) => s + (x.percentage || 0), 0) / arr.length;
        const recentAvg = avgOf(sorted.slice(-3));
        const earlierAvg = avgOf(sorted.slice(0, -3));
        if (recentAvg <= earlierAvg - 10) scoreTrend = 'down';
        else if (recentAvg >= earlierAvg + 10) scoreTrend = 'up';
      }

      const hasOverduePayment = overdueStudents.has(student.uid);

      // Only penalize low scores if the student actually took exams
      const isHighRiskScore = hasScores && avgScore < 50;
      const isMedRiskScore = hasScores && avgScore < 70;

      // Human-readable reasons (drives the dashboard tooltip / sort). Inactivity,
      // attendance and trend only make sense once the student has engaged.
      const reasons: string[] = [];
      if (everEngaged && daysSinceLastActive > 7) reasons.push(`не активен ${daysSinceLastActive} дн.`);
      if (everEngaged && attendanceRate < 50) reasons.push(`посещаемость ${attendanceRate}%`);
      if (isHighRiskScore) reasons.push(`средний балл ${avgScore}%`);
      if (hasOverduePayment) reasons.push('просрочена оплата');
      if (everEngaged && scoreTrend === 'down') reasons.push('оценки падают');

      // Calculate Risk Level. Overdue debt is a hard, reliable signal that stands
      // on its own. Every other trigger requires prior engagement — otherwise a
      // just-added student with no history gets misclassified as a churn risk.
      let riskLevel = 'low';
      if (hasOverduePayment) {
        riskLevel = 'high';
      } else if (everEngaged) {
        if (daysSinceLastActive > 7 || isHighRiskScore || attendanceRate < 50) {
          riskLevel = 'high';
        } else if (daysSinceLastActive > 4 || isMedRiskScore || attendanceRate < 80 || scoreTrend === 'down') {
          riskLevel = 'medium';
        }
      }

      const streak = student.currentStreak || 0;

      return {
        studentId: student.uid,
        studentName: student.displayName,
        avatarUrl: student.avatarUrl,
        riskLevel,
        averageScore: avgScore,
        examsTaken: sAttempts.length,
        attendanceRate,
        streak,
        daysSinceLastActive,
        daysSinceEnrolled,
        hasActivity: everEngaged,
        scoreTrend,
        hasOverduePayment,
        reasons,
        missedAssignments: missed // Repurposed for simplicity
      };
    });

    return ok(risks);
  } catch (err: any) {
    console.error(err);
    return badRequest('Failed to calculate risk metrics');
  }
};
