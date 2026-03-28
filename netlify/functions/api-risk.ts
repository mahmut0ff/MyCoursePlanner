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
    // 1. Get students active in this org (or from groups of the teacher)
    // Here we find all students by grabbing members or just getting all users who took exams in org.
    // For a robust system, let's grab the org users.
    const membershipsSnap = await adminDb.collection('memberships')
      .where('organizationId', '==', orgId)
      .where('role', '==', 'student')
      .get();
      
    if (membershipsSnap.empty) return ok([]);
    
    const dbUsersSnap = await adminDb.collection('users').get();
    const allUsersMap = new Map();
    dbUsersSnap.docs.forEach(d => allUsersMap.set(d.id, { uid: d.id, ...d.data() }));

    const studentIds = membershipsSnap.docs.map(d => d.data().userId);
    const validStudents = studentIds.map(sid => allUsersMap.get(sid)).filter(Boolean);

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

    // 3. Optional: Load Journal for attendance rate
    const journalSnap = await adminDb.collection('journalEntries')
      .where('organizationId', '==', orgId).get();
      
    const journalByStudent = new Map<string, any[]>();
    journalSnap.docs.forEach(doc => {
      const data = doc.data();
      if (!journalByStudent.has(data.studentId)) journalByStudent.set(data.studentId, []);
      journalByStudent.get(data.studentId)!.push(data);
    });

    const now = new Date();

    const risks = validStudents.map(student => {
      const sAttempts = attemptsByStudent.get(student.uid) || [];
      const sJournal = journalByStudent.get(student.uid) || [];

      // Avg Score
      let avgScore = 0;
      if (sAttempts.length > 0) {
        avgScore = Math.round(sAttempts.reduce((acc, curr) => acc + curr.percentage, 0) / sAttempts.length);
      }

      // Attendance Rate
      let attendanceRate = 100;
      const missed = sJournal.filter(j => j.attendance === 'absent').length;
      if (sJournal.length > 0) {
        attendanceRate = Math.round(((sJournal.length - missed) / sJournal.length) * 100);
      }

      // Days since last active (simulated: looking at last test taken or createdAt if none)
      let lastActiveDate = new Date(student.createdAt || Date.now());
      if (sAttempts.length > 0) {
        const sorted = [...sAttempts].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        lastActiveDate = new Date(sorted[0].createdAt);
      }
      const daysSinceLastActive = Math.floor((now.getTime() - lastActiveDate.getTime()) / (1000 * 3600 * 24));

      // Calculate Risk Level
      let riskLevel = 'low';
      if (daysSinceLastActive > 7 || avgScore < 50 || attendanceRate < 50) {
        riskLevel = 'high';
      } else if (daysSinceLastActive > 4 || avgScore < 70 || attendanceRate < 80) {
        riskLevel = 'medium';
      }

      // Hack for demo if real data is empty: let's populate random streak if missing from user doc
      const streak = student.currentStreak || 0;

      return {
        studentId: student.uid,
        studentName: student.displayName,
        avatarUrl: student.avatarUrl,
        riskLevel,
        averageScore: avgScore,
        attendanceRate,
        streak,
        daysSinceLastActive,
        missedAssignments: missed // Repurposed for simplicity
      };
    });

    return ok(risks);
  } catch (err: any) {
    console.error(err);
    return badRequest('Failed to calculate risk metrics');
  }
};
