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
      let snap;
      try {
        snap = await adminDb.collection(COLLECTION).where('studentId', '==', params.studentId).orderBy('submittedAt', 'desc').get();
      } catch {
        snap = await adminDb.collection(COLLECTION).where('studentId', '==', params.studentId).get();
      }
      const results = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      results.sort((a: any, b: any) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
      return ok(results);
    }

    if (params.roomId) {
      if (!isStaff(user)) return forbidden();
      let snap;
      try {
        snap = await adminDb.collection(COLLECTION).where('roomId', '==', params.roomId).orderBy('submittedAt', 'desc').get();
      } catch {
        snap = await adminDb.collection(COLLECTION).where('roomId', '==', params.roomId).get();
      }
      const results = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      results.sort((a: any, b: any) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
      return ok(results);
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
      let displayCorrectAnswer: any = q.correctAnswer;

      if (q.type === 'multiple_choice' || q.type === 'true_false') {
        isCorrect = studentAnswer === q.correctAnswer;
      } else if (q.type === 'multi_select') {
        const correct = Array.isArray(q.correctAnswers) ? [...q.correctAnswers].sort() : [];
        const student = Array.isArray(studentAnswer) ? [...studentAnswer].sort() : [];
        isCorrect = JSON.stringify(correct) === JSON.stringify(student);
        displayCorrectAnswer = q.correctAnswers;
      } else if (q.type === 'short_answer') {
        const ans = String(studentAnswer || '').trim().toLowerCase();
        if (q.keywords && Array.isArray(q.keywords) && q.keywords.length > 0) {
          isCorrect = q.keywords.some((kw: string) => ans.includes(kw.trim().toLowerCase()) || ans === kw.trim().toLowerCase());
          displayCorrectAnswer = q.keywords.join(', ');
        } else {
          isCorrect = ans === String(q.correctAnswer || '').trim().toLowerCase();
        }
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
        studentAnswer, correctAnswer: displayCorrectAnswer,
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
      timeSpentSeconds: body.timeSpentSeconds || 0,
      cheatAttempts: body.cheatAttempts || 0,
      createdAt: now,
    };
    const ref = await adminDb.collection(COLLECTION).add(data);

    // Notify student that result is ready (in-app + Telegram)
    createNotification({
      recipientId: user.uid, type: 'exam_result_ready',
      title: 'Результат экзамена',
      message: `Ваш результат: ${data.percentage}% по «${data.examTitle}»${data.passed ? ' — Сдан' : ' — Не сдан'}`,
      link: '/my-results',
      organizationId: user.organizationId || '',
    }).catch(() => {});

    // Notify the teacher (room host) about the exam submission
    if (roomDoc.data()?.hostId && roomDoc.data()?.hostId !== user.uid) {
      createNotification({
        recipientId: roomDoc.data()!.hostId,
        type: 'exam_submitted',
        title: 'Экзамен сдан',
        message: `${user.displayName} сдал «${data.examTitle}»: ${data.percentage}%`,
        link: `/results/${ref.id}`,
        organizationId: user.organizationId || '',
      }).catch(() => {});
    }

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

    // ── Manual grading: teacher overrides per-question points; server recomputes the total ──
    if (body.action === 'grade') {
      if (!isStaff(user)) return forbidden();
      if (!isSuperAdmin(user) && existingData.organizationId && user.organizationId
          && existingData.organizationId !== user.organizationId) {
        logSecurityAudit(user, event, 'grade_alien_attempt', { attemptId: body.id, attemptOrgId: existingData.organizationId });
        return forbidden('Attempt belongs to a different organization');
      }
      const grades: { questionId: string; pointsEarned: number }[] = Array.isArray(body.grades) ? body.grades : [];
      const gmap = new Map(grades.map(g => [String(g.questionId), Number(g.pointsEarned)]));

      const questionResults = (existingData.questionResults || []).map((qr: any) => {
        if (!gmap.has(String(qr.questionId))) return qr;
        const max = qr.pointsPossible || 0;
        let pts = Math.round(gmap.get(String(qr.questionId)) || 0);
        pts = Math.max(0, Math.min(pts, max));
        return {
          ...qr,
          pointsEarned: pts,
          isCorrect: max > 0 && pts >= max,
          status: pts <= 0 ? 'incorrect' : (pts >= max ? 'correct' : 'partial'),
          manuallyGraded: true,
        };
      });

      const score = questionResults.reduce((s: number, qr: any) => s + (qr.pointsEarned || 0), 0);
      const totalPoints = questionResults.reduce((s: number, qr: any) => s + (qr.pointsPossible || 0), 0);
      const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

      let passScore = 60;
      if (existingData.examId) {
        const examDoc = await adminDb.collection('exams').doc(existingData.examId).get();
        if (examDoc.exists) passScore = examDoc.data()?.passScore || 60;
      }
      const passed = percentage >= passScore;

      const update = { questionResults, score, totalPoints, percentage, passed, manuallyGradedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await docRef.update(update);
      return ok({ id: body.id, ...existingData, ...update });
    }

    if (!isStaff(user) && existingData.studentId !== user.uid) return forbidden();
    const { id, ...updateFields } = body;
    updateFields.updatedAt = new Date().toISOString();
    await docRef.update(updateFields);
    return ok({ id, ...existingData, ...updateFields });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
