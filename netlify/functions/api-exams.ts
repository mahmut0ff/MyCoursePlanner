/**
 * API: Exams — CRUD with questions (org-scoped).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse, isSuperAdmin } from './utils/auth';
import { getOrgLimits } from './utils/plan-limits';

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
      const questionsData = qSnap.docs.map((d: any) => {
        const q = { id: d.id, ...d.data() };
        if (!isStaff(user) && !isSuperAdmin(user)) {
          delete q.correctAnswer;
          delete q.correctAnswers;
          delete q.keywords;
          delete q.explanation;
        }
        return q;
      });
      return ok({ id: doc.id, ...doc.data(), questions: questionsData });
    }
    const orgFilter = getOrgFilter(user);
    if (params.orgId === 'none') {
      const snap1 = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', null).get();
      const snap2 = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', '').get();
      const allDocs = [...snap1.docs, ...snap2.docs].reduce((acc, curr) => {
         if (!acc.some((d: any) => d.id === curr.id)) acc.push(curr);
         return acc;
      }, [] as any[]);
      const results = allDocs.map((d: any) => ({ id: d.id, ...d.data() }));
      results.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return ok(results);
    }

    let snap;
    if (isSuperAdmin(user)) {
      try { snap = await adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').limit(200).get(); }
      catch { snap = await adminDb.collection(COLLECTION).get(); }
    } else if (orgFilter) {
      try { snap = await adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter).orderBy('createdAt', 'desc').limit(200).get(); }
      catch { snap = await adminDb.collection(COLLECTION).where('organizationId', '==', orgFilter).get(); }
    } else {
      const snap1 = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', null).get();
      const snap2 = await adminDb.collection(COLLECTION).where('authorId', '==', user.uid).where('organizationId', '==', '').get();
      const allDocs = [...snap1.docs, ...snap2.docs].reduce((acc, curr) => {
         if (!acc.some((d: any) => d.id === curr.id)) acc.push(curr);
         return acc;
      }, [] as any[]);
      const results = allDocs.map((d: any) => ({ id: d.id, ...d.data() }));
      results.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return ok(results);
    }
    const results = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    results.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return ok(results);
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
      
      // IDOR FIX: Verify src organization against user's organization if user is not super admin
      if (!isSuperAdmin(user) && srcData.organizationId && user.organizationId !== srcData.organizationId) {
        return forbidden('Cannot duplicate an exam from a different organization.');
      }
      
      const targetOrg = user.organizationId || srcData.organizationId || '';
      if (targetOrg) {
        const limits = await getOrgLimits(targetOrg);
        if (limits.maxExams !== -1) {
          const examsSnap = await adminDb.collection(COLLECTION).where('organizationId', '==', targetOrg).get();
          if (examsSnap.size >= limits.maxExams) {
            return badRequest('Organization has reached the exam limit for its plan.');
          }
        }
      }

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
    
    // Check exam limit
    if (user.organizationId) {
      const limits = await getOrgLimits(user.organizationId);
      if (limits.maxExams !== -1) {
        const examsSnap = await adminDb.collection(COLLECTION).where('organizationId', '==', user.organizationId).get();
        if (examsSnap.size >= limits.maxExams) {
          return badRequest('Organization has reached the exam limit for its plan.');
        }
      }
    }

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
