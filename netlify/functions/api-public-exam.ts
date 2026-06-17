import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { ok, badRequest, notFound, jsonResponse } from './utils/auth';
import { generateExamAIFeedback, buildRuleBasedFeedback } from './utils/ai-exam-analytics';

const handler: Handler = async (event: HandlerEvent) => {
  try {
    if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const params = event.queryStringParameters || {};
  const action = params.action;

  // GET: Fetch exam strictly for public consumption (no correct answers)
  if (event.httpMethod === 'GET' && action === 'getExam') {
    const examId = params.examId;
    if (!examId) return badRequest('examId required');

    const examDoc = await adminDb.collection('exams').doc(examId).get();
    if (!examDoc.exists) return notFound('Exam not found');
    
    const examData = examDoc.data()!;
    if (examData.status !== 'published') return badRequest('Exam is not published');

    // Public access can be closed by the teacher after a session — the link/QR then stops working.
    if (examData.acceptingResponses === false) {
      return ok({ closed: true, reason: 'responses_closed', title: examData.title });
    }

    // Fetch questions and sanitize them
    const questionsSnap = await adminDb.collection('exams').doc(examId).collection('questions').orderBy('order').get();
    // NOTE: deliberately strips correctAnswer / correctAnswers / keywords so answers never leak to the client.
    const questions = questionsSnap.docs.map(doc => {
      const q = doc.data();
      return {
        id: doc.id,
        type: q.type,
        text: q.text || q.question || '',
        options: q.options || [],
        points: q.points || 1,
        order: q.order || 0,
        mediaUrl: q.mediaUrl || null,
        mediaType: q.mediaType || null,
        ttsText: q.ttsText || null,
      };
    });

    return ok({
      id: examDoc.id,
      title: examData.title,
      description: examData.description || '',
      durationMinutes: examData.durationMinutes || null,
      questionCount: examData.questionCount || questions.length,
      showResultsImmediately: examData.showResultsImmediately,
      randomizeQuestions: examData.randomizeQuestions,
      organizationId: examData.organizationId,
      branchId: examData.branchId,
      questions
    });
  }

  // POST: Submit exam, compute score, create Lead and anonymous ExamAttempt
  if (event.httpMethod === 'POST' && action === 'submitExam') {
    const body = JSON.parse(event.body || '{}');
    const { examId, name, phone, answers, timeSpentSeconds, info } = body;

    if (!examId || !name || !phone) return badRequest('examId, name, and phone are required');

    const examDoc = await adminDb.collection('exams').doc(examId).get();
    if (!examDoc.exists) return notFound('Exam not found');
    const examData = examDoc.data()!;
    const passScore = examData.passScore || 60;
    const organizationId = examData.organizationId;
    
    if (!organizationId) {
      return badRequest('Exam has no associated organization');
    }

    // Public access closed by the teacher → reject submissions from the old link/QR.
    if (examData.acceptingResponses === false) {
      return jsonResponse(403, { error: 'responses_closed' });
    }

    // One attempt per phone number per exam — stops a student re-submitting / spamming later.
    const normalizedPhone = String(phone).replace(/\D/g, '');
    if (normalizedPhone) {
      const dupSnap = await adminDb.collection('examAttempts')
        .where('examId', '==', examId)
        .where('phone', '==', normalizedPhone)
        .limit(1)
        .get();
      if (!dupSnap.empty) {
        return jsonResponse(409, { error: 'already_submitted' });
      }
    }

    // Grade Exam Server-side
    const questionsSnap = await adminDb.collection('exams').doc(examId).collection('questions').orderBy('order').get();
    const questions = questionsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    const studentAnswers = answers || {};
    let score = 0;
    let totalPoints = 0;
    const questionResults: any[] = [];
    const correct: any[] = [];
    const incorrect: any[] = [];
    const pending: any[] = [];

    for (const q of questions) {
      const points = q.points || 1;
      totalPoints += points;
      const studentAnswer = studentAnswers[q.id];
      let isCorrect = false;
      let displayCorrectAnswer: any = q.correctAnswer;

      if (q.type === 'multiple_choice' || q.type === 'true_false') {
        isCorrect = studentAnswer === q.correctAnswer;
      } else if (q.type === 'multi_select') {
        const expected = Array.isArray(q.correctAnswers) ? [...q.correctAnswers].sort() : [];
        const student = Array.isArray(studentAnswer) ? [...studentAnswer].sort() : [];
        isCorrect = JSON.stringify(expected) === JSON.stringify(student);
        displayCorrectAnswer = q.correctAnswers;
      } else if (q.type === 'short_answer') {
        const ans = String(studentAnswer || '').trim().toLowerCase();
        const hasKeywords = q.keywords && Array.isArray(q.keywords) && q.keywords.length > 0;
        const hasCorrect = !!String(q.correctAnswer || '').trim();
        if (hasKeywords) {
          isCorrect = q.keywords.some((kw: string) => ans.includes(kw.trim().toLowerCase()) || ans === kw.trim().toLowerCase());
          displayCorrectAnswer = q.keywords.join(', ');
        } else if (hasCorrect) {
          isCorrect = ans === String(q.correctAnswer).trim().toLowerCase();
        } else {
          // No automatic grading criteria — defer to manual / AI review instead of silently marking wrong.
          const resultObj = {
            questionId: q.id, questionText: q.text || q.question || '',
            studentAnswer, correctAnswer: null,
            isCorrect: false, pointsEarned: 0, pointsPossible: points,
            status: 'pending_review',
          };
          questionResults.push(resultObj);
          pending.push(resultObj);
          continue;
        }
      } else {
        // open_ended / speaking — requires manual or AI review
        const resultObj = {
          questionId: q.id, questionText: q.text || q.question || '',
          studentAnswer, correctAnswer: q.correctAnswer ?? null,
          isCorrect: false, pointsEarned: 0, pointsPossible: points,
          status: 'pending_review',
        };
        questionResults.push(resultObj);
        pending.push(resultObj);
        continue;
      }

      if (isCorrect) score += points;
      const resultObj = {
        questionId: q.id, questionText: q.text || q.question || '',
        studentAnswer, correctAnswer: displayCorrectAnswer,
        isCorrect, pointsEarned: isCorrect ? points : 0, pointsPossible: points,
        status: isCorrect ? 'correct' : 'incorrect',
      };
      questionResults.push(resultObj);
      if (isCorrect) correct.push(resultObj);
      else incorrect.push(resultObj);
    }

    let percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    let passed = percentage >= passScore;
    const now = new Date().toISOString();

    // AI verdict — always produced. Try Gemini first; if the key is missing or the
    // call fails, fall back to a deterministic rule-based verdict so a report
    // (including a level/verdict) ALWAYS appears for the teacher.
    const placementLevels: string[] = Array.isArray(examData.placementLevels) ? examData.placementLevels : [];
    const attemptObj = {
      examTitle: examData.title,
      subject: examData.subject || '',
      percentage, score, totalPoints, passed,
      timeSpentSeconds: timeSpentSeconds || 0,
    };
    let aiFeedback: any;
    try {
      aiFeedback = await generateExamAIFeedback(
        attemptObj, correct, incorrect, pending,
        examData.gradingCategories || [], placementLevels
      );
    } catch (err) {
      console.warn('AI Feedback unavailable, using rule-based fallback:', (err as any)?.message || err);
      aiFeedback = buildRuleBasedFeedback(attemptObj, correct, incorrect, pending, placementLevels);
    }

    // Apply AI-assigned points for open/text/speaking answers into the score.
    if (aiFeedback && Array.isArray(aiFeedback.gradedAnswers)) {
      const gmap = new Map(aiFeedback.gradedAnswers.map((g: any) => [String(g.questionId), g]));
      for (const qr of questionResults) {
        if (qr.status === 'pending_review' && gmap.has(String(qr.questionId))) {
          const g: any = gmap.get(String(qr.questionId));
          let pts = Math.round(Number(g.pointsEarned) || 0);
          pts = Math.max(0, Math.min(pts, qr.pointsPossible || 0));
          qr.pointsEarned = pts;
          qr.aiGraded = true;
          qr.aiComment = g.feedback || '';
          qr.isCorrect = (qr.pointsPossible || 0) > 0 && pts >= qr.pointsPossible;
          qr.status = pts <= 0 ? 'incorrect' : (pts >= (qr.pointsPossible || 0) ? 'correct' : 'partial');
          score += pts;
        }
      }
      percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
      passed = percentage >= passScore;
    }

    // 1. Create a Lead Record (AILeads)
    const leadRef = await adminDb.collection('organizations').doc(organizationId).collection('aiLeads').add({
      name: name.trim(),
      phone: phone.trim(),
      reason: `Входное тестирование: ${examData.title}`,
      source: 'test_link',
      createdBy: 'Система',
      status: 'new',
      branchId: examData.branchId || null,
      testResult: {
        examId,
        examTitle: examData.title,
        score,
        maxScore: totalPoints,
        percentage,
        passed,
        aiFeedback
      },
      createdAt: now
    });

    const leadId = leadRef.id;

    // 2. Create the anonymous Exam Attempt
    const attemptData = {
      examId, 
      examTitle: examData.title, 
      roomId: 'public', // denotes no active room
      roomCode: 'public', 
      studentId: `lead_${leadId}`,
      studentName: name.trim(),
      phone: normalizedPhone, // used to enforce one attempt per phone per exam
      answers: studentAnswers,
      questionResults,
      score, 
      totalPoints, 
      percentage, 
      passed,
      organizationId,
      branchId: examData.branchId || null,
      startedAt: now, 
      submittedAt: now,
      timeSpentSeconds: timeSpentSeconds || 0,
      createdAt: now,
      aiFeedback
    };
    
    await adminDb.collection('examAttempts').add(attemptData);

    return ok({
      success: true,
      leadId,
      score,
      totalPoints,
      percentage,
      passed,
      level: aiFeedback?.level || null,
      levelDescription: aiFeedback?.levelDescription || null,
      isPlacement: placementLevels.length > 0,
      showResultsImmediately: examData.showResultsImmediately
    });
  }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('api-public-exam error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
