/**
 * API: Attempts — exam attempt management (org-scoped).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, getOrgFilter, hasRole, ok, unauthorized, forbidden, badRequest, notFound, jsonResponse, logSecurityAudit, isSuperAdmin } from './utils/auth';
import { createNotification } from './utils/notifications';

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
      if (!isStaff(user) && data.studentId !== user.uid) {
        logSecurityAudit(user, event, 'read_alien_attempt', { attemptId: doc.id, ownerId: data.studentId });
        return forbidden();
      }
      return ok({ id: doc.id, ...data });
    }

    if (params.studentId) {
      if (!isStaff(user) && params.studentId !== user.uid) {
        logSecurityAudit(user, event, 'list_alien_attempts', { targetStudentId: params.studentId });
        return forbidden();
      }
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
    if (isSuperAdmin(user)) {
      snap = await adminDb.collection(COLLECTION).orderBy('submittedAt', 'desc').limit(100).get();
      return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    } else if (orgFilter) {
      snap = await adminDb.collection(COLLECTION)
        .where('organizationId', '==', orgFilter).orderBy('submittedAt', 'desc').limit(100).get();
      return ok(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    } else {
      // Fetch rooms owned by this teacher
      const roomsSnap = await adminDb.collection('examRooms').where('authorId', '==', user.uid).get();
      const roomIds = roomsSnap.docs.map(d => d.id);
      if (roomIds.length === 0) return ok([]);
      // Firestore 'in' query supports max 10 values
      const chunks = [];
      for (let i = 0; i < roomIds.length; i += 10) {
        chunks.push(roomIds.slice(i, i + 10));
      }
      let allDocs: any[] = [];
      for (const chunk of chunks) {
        const chunkSnap = await adminDb.collection(COLLECTION)
          .where('roomId', 'in', chunk).orderBy('submittedAt', 'desc').limit(100).get();
        allDocs = [...allDocs, ...chunkSnap.docs];
      }
      const results = allDocs.map((d: any) => ({ id: d.id, ...d.data() }));
      results.sort((a: any, b: any) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
      return ok(results.slice(0, 100)); // limit conceptually
    }
  }

  // POST — save attempt
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    if (!body.examId || !body.roomId) return badRequest('examId and roomId required');

    // Fix #2: Duplicate attempt guard
    const existing = await adminDb.collection(COLLECTION)
      .where('studentId', '==', user.uid)
      .where('roomId', '==', body.roomId).limit(1).get();
    if (!existing.empty) return badRequest('You have already submitted this exam');

    // Verify room is active and belongs to user organization
    const roomDoc = await adminDb.collection('examRooms').doc(body.roomId).get();
    if (!roomDoc.exists || roomDoc.data()?.status !== 'active') return badRequest('Room is closed');
    if (roomDoc.data()?.organizationId && user.organizationId && roomDoc.data()?.organizationId !== user.organizationId) {
      logSecurityAudit(user, event, 'write_attempt_alien_room', { roomId: body.roomId, roomOrgId: roomDoc.data()?.organizationId });
      return forbidden('Room belongs to a different organization');
    }

    // Fix #4: Server-side score recalculation
    const questionsSnap = await adminDb.collection('exams').doc(body.examId).collection('questions').orderBy('order').get();
    const questions = questionsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const examDoc = await adminDb.collection('exams').doc(body.examId).get();
    const passScore = examDoc.exists ? (examDoc.data()?.passScore || 60) : 60;

    const studentAnswers = body.answers || {};
    let score = 0;
    let totalPoints = 0;
    const questionResults: any[] = [];

    for (const q of questions) {
      const points = q.points || 1;
      totalPoints += points;
      const studentAnswer = studentAnswers[q.id];
      let isCorrect = false;

      if (q.type === 'multiple_choice' || q.type === 'true_false') {
        isCorrect = studentAnswer === q.correctAnswer;
      } else if (q.type === 'multi_select') {
        const correct = Array.isArray(q.correctAnswer) ? [...q.correctAnswer].sort() : [];
        const student = Array.isArray(studentAnswer) ? [...studentAnswer].sort() : [];
        isCorrect = JSON.stringify(correct) === JSON.stringify(student);
      } else if (q.type === 'short_answer') {
        isCorrect = String(studentAnswer || '').trim().toLowerCase() === String(q.correctAnswer || '').trim().toLowerCase();
      } else {
        // open_ended — needs manual review
        questionResults.push({
          questionId: q.id, questionText: q.text || q.question || '',
          studentAnswer, correctAnswer: q.correctAnswer,
          isCorrect: false, pointsEarned: 0, pointsPossible: points,
          status: 'pending_review',
        });
        continue;
      }

      if (isCorrect) score += points;
      questionResults.push({
        questionId: q.id, questionText: q.text || q.question || '',
        studentAnswer, correctAnswer: q.correctAnswer,
        isCorrect, pointsEarned: isCorrect ? points : 0, pointsPossible: points,
        status: isCorrect ? 'correct' : 'incorrect',
      });
    }

    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    const passed = percentage >= passScore;

    const now = new Date().toISOString();
    const data = {
      examId: body.examId, examTitle: body.examTitle || '', roomId: body.roomId,
      roomCode: body.roomCode || '', studentId: user.uid, studentName: user.displayName,
      answers: studentAnswers, questionResults,
      score, totalPoints, percentage, passed,
      organizationId: user.organizationId || '',
      startedAt: body.startedAt || now, submittedAt: now,
      timeSpentSeconds: body.timeSpentSeconds || 0, createdAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);
    // Notify student that result is ready
    createNotification({
      recipientId: user.uid, type: 'exam_result_ready',
      title: 'Результат экзамена',
      message: `Ваш результат: ${data.percentage}% по «${data.examTitle}»`,
      link: '/my-results',
    }).catch(() => {});
    return ok({ id: ref.id, ...data });
  }

  // PUT — update attempt (staff or owning student)
  if (event.httpMethod === 'PUT') {
    const body = JSON.parse(event.body || '{}');
    if (!body.id) return badRequest('id required');
    const docRef = adminDb.collection(COLLECTION).doc(body.id);
    const existing = await docRef.get();
    if (!existing.exists) return notFound('Attempt not found');
    const existingData = existing.data()!;
    if (!isStaff(user) && existingData.studentId !== user.uid) return forbidden();
    const { id, ...updateFields } = body;
    updateFields.updatedAt = new Date().toISOString();
    await docRef.update(updateFields);
    return ok({ id, ...existingData, ...updateFields });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
