/**
 * API: Exams — CRUD with questions (org-scoped).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse } from './utils/auth';

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
      const qSnap = await adminDb.collection(COLLECTION).doc(params.id).collection('questions').orderBy('order').get();
      return ok({ id: doc.id, ...doc.data(), questions: qSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })) });
    }
    const orgFilter = getOrgFilter(user);
    let snap;
    if (orgFilter) {
      snap = await adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter).orderBy('createdAt', 'desc').get();
    } else {
      snap = await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    }
    return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
  }

  if (!isStaff(user)) return forbidden();

  // POST
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');

    if (body.action === 'saveQuestions') {
      if (!body.examId || !body.questions) return badRequest('examId and questions required');
      const batch = adminDb.batch();
      const questionsRef = adminDb.collection(COLLECTION).doc(body.examId).collection('questions');
      const existing = await questionsRef.get();
      existing.docs.forEach((doc: any) => batch.delete(doc.ref));
      body.questions.forEach((q: any, i: number) => {
        batch.set(questionsRef.doc(q.id || `q_${i}`), { ...q, order: i });
      });
      batch.update(adminDb.collection(COLLECTION).doc(body.examId), { questionCount: body.questions.length, updatedAt: new Date().toISOString() });
      await batch.commit();
      return ok({ saved: body.questions.length });
    }

    if (body.action === 'duplicate') {
      if (!body.examId) return badRequest('examId required');
      const srcDoc = await adminDb.collection(COLLECTION).doc(body.examId).get();
      if (!srcDoc.exists) return notFound('Exam not found');
      const srcData = srcDoc.data()!;
      const now = new Date().toISOString();
      const newData = {
        ...srcData,
        title: `${srcData.title} (Copy)`,
        status: 'draft',
        authorId: user.uid,
        authorName: user.displayName,
        organizationId: user.organizationId || srcData.organizationId || '',
        createdAt: now,
        updatedAt: now,
      };
      const newRef = await adminDb.collection(COLLECTION).add(newData);
      // Copy questions
      const qSnap = await adminDb.collection(COLLECTION).doc(body.examId).collection('questions').orderBy('order').get();
      const batch = adminDb.batch();
      qSnap.docs.forEach((qDoc: any) => {
        batch.set(adminDb.collection(COLLECTION).doc(newRef.id).collection('questions').doc(qDoc.id), qDoc.data());
      });
      await batch.commit();
      return ok({ id: newRef.id, ...newData });
    }

    if (!body.title) return badRequest('title required');
    const now = new Date().toISOString();
    const data = {
      title: body.title, subject: body.subject || '', description: body.description || '',
      durationMinutes: body.durationMinutes || 60, passScore: body.passScore || 60,
      randomizeQuestions: body.randomizeQuestions || false, status: body.status || 'draft',
      questionCount: 0, authorId: user.uid, authorName: user.displayName,
      organizationId: user.organizationId || '', createdAt: now, updatedAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);
    return ok({ id: ref.id, ...data });
  }

  // PUT
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
    if (!params.id) return badRequest('id required');
    const qSnap = await adminDb.collection(COLLECTION).doc(params.id).collection('questions').get();
    const batch = adminDb.batch();
    qSnap.docs.forEach((doc: any) => batch.delete(doc.ref));
    batch.delete(adminDb.collection(COLLECTION).doc(params.id));
    await batch.commit();
    return ok({ deleted: true });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
