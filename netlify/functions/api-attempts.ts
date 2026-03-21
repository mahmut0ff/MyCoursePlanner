/**
 * API: Attempts — exam attempt management (org-scoped).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, hasRole, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const COLLECTION = 'examAttempts';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // GET
  if (event.httpMethod === 'GET') {
    if (params.id) {
      const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
      if (!doc.exists) return notFound('Attempt not found');
      const data = doc.data()!;
      if (!isStaff(user) && data.studentId !== user.uid) return forbidden();
      return ok({ id: doc.id, ...data });
    }

    if (params.studentId) {
      if (!isStaff(user) && params.studentId !== user.uid) return forbidden();
      const snap = await adminDb.collection(COLLECTION)
        .where('studentId', '==', params.studentId).orderBy('submittedAt', 'desc').get();
      return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    }

    if (params.roomId) {
      if (!isStaff(user)) return forbidden();
      const snap = await adminDb.collection(COLLECTION)
        .where('roomId', '==', params.roomId).orderBy('submittedAt', 'desc').get();
      return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    }

    // All attempts — staff only, org-scoped
    if (!isStaff(user)) return forbidden();
    const orgFilter = getOrgFilter(user);
    let snap;
    if (orgFilter) {
      snap = await adminDb.collection(COLLECTION)
        .where('organizationId', '==', orgFilter).orderBy('submittedAt', 'desc').limit(100).get();
    } else {
      snap = await adminDb.collection(COLLECTION).orderBy('submittedAt', 'desc').limit(100).get();
    }
    return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
  }

  // POST — save attempt
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    if (!body.examId || !body.roomId) return badRequest('examId and roomId required');
    const now = new Date().toISOString();
    const data = {
      examId: body.examId, examTitle: body.examTitle || '', roomId: body.roomId,
      roomCode: body.roomCode || '', studentId: user.uid, studentName: user.displayName,
      answers: body.answers || {}, questionResults: body.questionResults || [],
      score: body.score || 0, totalPoints: body.totalPoints || 0,
      percentage: body.percentage || 0, passed: body.passed || false,
      organizationId: user.organizationId || '',
      startedAt: body.startedAt || now, submittedAt: now,
      timeSpentSeconds: body.timeSpentSeconds || 0, createdAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);
    return ok({ id: ref.id, ...data });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
