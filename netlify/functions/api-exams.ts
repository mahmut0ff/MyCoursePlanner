/**
 * API: Exams — CRUD for exams and their questions.
 *
 * GET    /api-exams                     → list all exams
 * GET    /api-exams?id=<id>             → get exam with questions
 * POST   /api-exams                     → create exam (admin/teacher)
 * PUT    /api-exams                     → update exam (admin/teacher)
 * DELETE /api-exams?id=<id>             → delete exam (admin/teacher)
 * POST   /api-exams (action=saveQuestions) → save questions to exam
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, hasRole, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

const COLLECTION = 'exams';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // GET
  if (event.httpMethod === 'GET') {
    if (params.id) {
      const doc = await adminDb.collection(COLLECTION).doc(params.id).get();
      if (!doc.exists) return notFound('Exam not found');

      // Also fetch questions
      const qSnap = await adminDb.collection(COLLECTION).doc(params.id)
        .collection('questions').orderBy('order').get();
      const questions = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      return ok({ id: doc.id, ...doc.data(), questions });
    }

    const snapshot = await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    return ok(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  // Staff-only for writes
  if (!hasRole(user, 'admin', 'teacher')) return forbidden();

  // POST — create exam or save questions
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');

    // Save questions to existing exam
    if (body.action === 'saveQuestions') {
      if (!body.examId || !body.questions) return badRequest('examId and questions required');

      const batch = adminDb.batch();
      const questionsRef = adminDb.collection(COLLECTION).doc(body.examId).collection('questions');

      // Delete existing questions
      const existing = await questionsRef.get();
      existing.docs.forEach((doc) => batch.delete(doc.ref));

      // Add new questions
      body.questions.forEach((q: any, i: number) => {
        const qRef = questionsRef.doc(q.id || `q_${i}`);
        batch.set(qRef, { ...q, order: i });
      });

      // Update question count on exam
      const examRef = adminDb.collection(COLLECTION).doc(body.examId);
      batch.update(examRef, {
        questionCount: body.questions.length,
        updatedAt: new Date().toISOString(),
      });

      await batch.commit();
      return ok({ saved: body.questions.length });
    }

    // Create new exam
    if (!body.title) return badRequest('title required');
    const now = new Date().toISOString();
    const data = {
      title: body.title,
      subject: body.subject || '',
      description: body.description || '',
      durationMinutes: body.durationMinutes || 60,
      passScore: body.passScore || 60,
      randomizeQuestions: body.randomizeQuestions || false,
      status: body.status || 'draft',
      questionCount: 0,
      authorId: user.uid,
      authorName: user.displayName,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);
    return ok({ id: ref.id, ...data });
  }

  // PUT — update exam
  if (event.httpMethod === 'PUT') {
    const body = JSON.parse(event.body || '{}');
    if (!body.id) return badRequest('id required');
    const { id, questions, ...updateFields } = body;
    updateFields.updatedAt = new Date().toISOString();
    await adminDb.collection(COLLECTION).doc(id).update(updateFields);
    const updated = await adminDb.collection(COLLECTION).doc(id).get();
    return ok({ id: updated.id, ...updated.data() });
  }

  // DELETE
  if (event.httpMethod === 'DELETE') {
    const id = params.id;
    if (!id) return badRequest('id required');

    // Delete questions subcollection first
    const qSnap = await adminDb.collection(COLLECTION).doc(id).collection('questions').get();
    const batch = adminDb.batch();
    qSnap.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(adminDb.collection(COLLECTION).doc(id));
    await batch.commit();

    return ok({ deleted: true });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
