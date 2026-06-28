/**
 * API: Risk Dashboard
 * Aggregates student data to detect those in risk zones (Red, Yellow, Green)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
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
    const usersMap = new Map<string, any>();
    const USER_BATCH = 30;
    for (let i = 0; i < studentIds.length; i += USER_BATCH) {
      const batch = studentIds.slice(i, i + USER_BATCH);
      const usersSnap = await adminDb.collection('users').where('__name__', 'in', batch).get();
      usersSnap.docs.forEach(d => usersMap.set(d.id, d.data()));
    }

    // Fall back to member data when a student's user doc is missing.
    const validStudents = studentIds.map(uid => {
      const profile = usersMap.get(uid) || {};
      const member = memberByUid.get(uid) || {};
      return {
        uid,
        displayName: profile.displayName || member.userName || 'Ученик',
        avatarUrl: profile.avatarUrl || '',
        createdAt: profile.createdAt || member.createdAt,
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

      // Days since last active
      let lastActiveDate = new Date(student.createdAt || Date.now());
      const datesToConsider: Date[] = [lastActiveDate];
      if (sAttempts.length > 0) {
        sAttempts.forEach(a => { if (a.createdAt) datesToConsider.push(new Date(a.createdAt)); });
      }
      if (sJournal.length > 0) {
        sJournal.forEach(j => { if (j.date) datesToConsider.push(new Date(j.date)); });
      }
      datesToConsider.sort((a, b) => b.getTime() - a.getTime());
      lastActiveDate = datesToConsider[0];

      const daysSinceLastActive = Math.floor((now.getTime() - lastActiveDate.getTime()) / (1000 * 3600 * 24));

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

      // Human-readable reasons (drives the dashboard tooltip / sort).
      const reasons: string[] = [];
      if (daysSinceLastActive > 7) reasons.push(`не активен ${daysSinceLastActive} дн.`);
      if (attendanceRate < 50) reasons.push(`посещаемость ${attendanceRate}%`);
      if (isHighRiskScore) reasons.push(`средний балл ${avgScore}%`);
      if (hasOverduePayment) reasons.push('просрочена оплата');
      if (scoreTrend === 'down') reasons.push('оценки падают');

      // Calculate Risk Level
      let riskLevel = 'low';
      if (daysSinceLastActive > 7 || isHighRiskScore || attendanceRate < 50 || hasOverduePayment) {
        riskLevel = 'high';
      } else if (daysSinceLastActive > 4 || isMedRiskScore || attendanceRate < 80 || scoreTrend === 'down') {
        riskLevel = 'medium';
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
