/**
 * API: Dashboard stats — aggregated data for dashboards.
 *
 * GET /api-dashboard                → dashboard stats (role-dependent)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, hasRole, ok, unauthorized, jsonResponse } from './utils/auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const isStaff = hasRole(user, 'admin', 'teacher');

  // Fetch data in parallel
  const [lessonsSnap, examsSnap, roomsSnap] = await Promise.all([
    adminDb.collection('lessonPlans').get(),
    adminDb.collection('exams').get(),
    adminDb.collection('examRooms').where('status', '==', 'active').get(),
  ]);

  let attemptsSnap;
  if (isStaff) {
    attemptsSnap = await adminDb.collection('examAttempts')
      .orderBy('submittedAt', 'desc').limit(50).get();
  } else {
    attemptsSnap = await adminDb.collection('examAttempts')
      .where('studentId', '==', user.uid)
      .orderBy('submittedAt', 'desc').get();
  }

  const attempts = attemptsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const avgScore = attempts.length > 0
    ? Math.round(attempts.reduce((s: number, a: any) => s + (a.percentage || 0), 0) / attempts.length)
    : 0;
  const passRate = attempts.length > 0
    ? Math.round((attempts.filter((a: any) => a.passed).length / attempts.length) * 100)
    : 0;

  const stats = {
    lessonsCount: lessonsSnap.size,
    examsCount: examsSnap.size,
    activeRoomsCount: roomsSnap.size,
    attemptsCount: attempts.length,
    avgScore,
    passRate,
    recentLessons: lessonsSnap.docs.slice(0, 5).map((d) => ({ id: d.id, ...d.data() })),
    recentExams: examsSnap.docs.slice(0, 5).map((d) => ({ id: d.id, ...d.data() })),
    activeRooms: roomsSnap.docs.slice(0, 5).map((d) => ({ id: d.id, ...d.data() })),
    recentAttempts: attempts.slice(0, 5),
  };

  return ok(stats);
};

export { handler };
