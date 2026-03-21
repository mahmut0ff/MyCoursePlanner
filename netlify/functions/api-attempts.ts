/**
 * API: Attempts — exam attempt management.
 *
 * GET  /api-attempts                     → list all attempts (admin/teacher)
 * GET  /api-attempts?id=<id>             → get single attempt
 * GET  /api-attempts?studentId=<uid>     → get attempts by student
 * GET  /api-attempts?roomId=<roomId>     → get attempts by room
 * POST /api-attempts                     → save a new attempt (student)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, hasRole, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const COLLECTION = 'examAttempts';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // GET
  if (event.httpMethod === 'GET') {
    // Single attempt
    if (params.id) {
      const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
      if (!doc.exists) return notFound('Attempt not found');
      const data = doc.data()!;
      // Students can only view their own attempts
      if (!hasRole(user, 'admin', 'teacher') && data.studentId !== user.uid) return forbidden();
      return ok({ id: doc.id, ...data });
    }

    // By student
    if (params.studentId) {
      // Students can only query their own
      if (!hasRole(user, 'admin', 'teacher') && params.studentId !== user.uid) return forbidden();
      const snap = await adminDb.collection(COLLECTION)
        .where('studentId', '==', params.studentId)
        .orderBy('submittedAt', 'desc').get();
      return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    // By room
    if (params.roomId) {
      if (!hasRole(user, 'admin', 'teacher')) return forbidden();
      const snap = await adminDb.collection(COLLECTION)
        .where('roomId', '==', params.roomId)
        .orderBy('submittedAt', 'desc').get();
      return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    // All — admin/teacher only
    if (!hasRole(user, 'admin', 'teacher')) return forbidden();
    const snap = await adminDb.collection(COLLECTION).orderBy('submittedAt', 'desc').limit(100).get();
    return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  // POST — save attempt
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    if (!body.examId || !body.roomId) return badRequest('examId and roomId required');

    const now = new Date().toISOString();
    const data = {
      examId: body.examId,
      examTitle: body.examTitle || '',
      roomId: body.roomId,
      roomCode: body.roomCode || '',
      studentId: user.uid,
      studentName: user.displayName,
      answers: body.answers || {},
      questionResults: body.questionResults || [],
      score: body.score || 0,
      totalPoints: body.totalPoints || 0,
      percentage: body.percentage || 0,
      passed: body.passed || false,
      startedAt: body.startedAt || now,
      submittedAt: now,
      timeSpentSeconds: body.timeSpentSeconds || 0,
      createdAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);
    return ok({ id: ref.id, ...data });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
