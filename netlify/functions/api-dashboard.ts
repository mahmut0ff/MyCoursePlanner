/**
 * API: Dashboard — aggregated stats (org-scoped).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, ok, unauthorized, jsonResponse } from './utils/auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const orgFilter = getOrgFilter(user);

  // Build queries scoped to org
  const lessonsQuery = orgFilter
    ? adminDb.collection('lessonPlans').where('organizationId', '==', orgFilter)
    : adminDb.collection('lessonPlans');
  const examsQuery = orgFilter
    ? adminDb.collection('exams').where('organizationId', '==', orgFilter)
    : adminDb.collection('exams');
  const roomsQuery = orgFilter
    ? adminDb.collection('examRooms').where('organizationId', '==', orgFilter).where('status', '==', 'active')
    : adminDb.collection('examRooms').where('status', '==', 'active');

  const [lessonsSnap, examsSnap, roomsSnap] = await Promise.all([
    lessonsQuery.get(), examsQuery.get(), roomsQuery.get(),
  ]);

  let attemptsSnap;
  if (isStaff(user)) {
    const q = orgFilter
      ? adminDb.collection('examAttempts').where('organizationId', '==', orgFilter).orderBy('submittedAt', 'desc').limit(50)
      : adminDb.collection('examAttempts').orderBy('submittedAt', 'desc').limit(50);
    attemptsSnap = await q.get();
  } else {
    attemptsSnap = await adminDb.collection('examAttempts')
      .where('studentId', '==', user.uid).orderBy('submittedAt', 'desc').get();
  }

  const attempts = attemptsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  const avgScore = attempts.length > 0
    ? Math.round(attempts.reduce((s: number, a: any) => s + (a.percentage || 0), 0) / attempts.length)
    : 0;

  return ok({
    lessonsCount: lessonsSnap.size,
    examsCount: examsSnap.size,
    activeRoomsCount: roomsSnap.size,
    attemptsCount: attempts.length,
    avgScore,
    recentLessons: lessonsSnap.docs.slice(0, 5).map((d: any) => ({ id: d.id, ...d.data() })),
    recentExams: examsSnap.docs.slice(0, 5).map((d: any) => ({ id: d.id, ...d.data() })),
    activeRooms: roomsSnap.docs.slice(0, 5).map((d: any) => ({ id: d.id, ...d.data() })),
    recentAttempts: attempts.slice(0, 5),
  });
};

export { handler };
