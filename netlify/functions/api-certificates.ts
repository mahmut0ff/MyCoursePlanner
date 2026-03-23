/**
 * API: Certificates — generate and verify exam certificates.
 *
 * GET  /api-certificates?id=<id>      → get certificate (public)
 * POST /api-certificates              → generate certificate for attempt
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, badRequest, notFound, jsonResponse } from './utils/auth';
import * as crypto from 'crypto';

const COLLECTION = 'certificates';

function generateCertNumber(): string {
  const prefix = 'MCP';
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${year}-${rand}`;
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const params = event.queryStringParameters || {};

  // GET — public certificate view
  if (event.httpMethod === 'GET') {
    if (!params.id) return badRequest('id required');
    const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
    if (!doc.exists) return notFound('Certificate not found');
    return ok({ id: doc.id, ...doc.data() });
  }

  // POST — generate certificate (auth required)
  if (event.httpMethod === 'POST') {
    const user = await verifyAuth(event);
    if (!user) return unauthorized();

    const body = JSON.parse(event.body || '{}');
    if (!body.attemptId) return badRequest('attemptId required');

    // Get attempt
    const attemptDoc = await adminDb.collection('examAttempts').doc(body.attemptId).get();
    if (!attemptDoc.exists) return notFound('Attempt not found');
    const attempt = attemptDoc.data()!;

    // Only the student who took the exam can generate certificate
    if (attempt.studentId !== user.uid) return jsonResponse(403, { error: 'Forbidden' });

    // Must have passed
    if (!attempt.passed) return badRequest('Exam not passed — certificate unavailable');

    // Check if certificate already exists for this attempt
    const existing = await adminDb.collection(COLLECTION)
      .where('attemptId', '==', body.attemptId).limit(1).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      return ok({ id: doc.id, ...doc.data(), alreadyExists: true });
    }

    // Get org name
    let organizationName = '';
    if (attempt.organizationId) {
      const orgDoc = await adminDb.collection('organizations').doc(attempt.organizationId).get();
      if (orgDoc.exists) organizationName = orgDoc.data()?.name || '';
    }

    const now = new Date().toISOString();
    const certData = {
      attemptId: body.attemptId,
      studentId: attempt.studentId,
      studentName: attempt.studentName || user.displayName,
      examId: attempt.examId,
      examTitle: attempt.examTitle,
      score: attempt.score,
      totalPoints: attempt.totalPoints,
      percentage: attempt.percentage,
      organizationId: attempt.organizationId || '',
      organizationName,
      certificateNumber: generateCertNumber(),
      issuedAt: now,
      createdAt: now,
    };

    const ref = await adminDb.collection(COLLECTION).add(certData);
    return ok({ id: ref.id, ...certData });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
