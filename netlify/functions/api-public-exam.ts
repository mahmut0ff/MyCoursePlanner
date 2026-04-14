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

    // Fetch questions and sanitize them
    const questionsSnap = await adminDb.collection('exams').doc(examId).collection('questions').orderBy('order').get();
    const questions = questionsSnap.docs.map(doc => {
      const q = doc.data();
      return {
        id: doc.id,
        type: q.type,
        text: q.text || q.question || '',
        options: q.options || [],
        points: q.points || 1,
        order: q.order || 0
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

    const orgDoc = await adminDb.collection('organizations').doc(organizationId).get();
    const orgData = orgDoc.exists ? orgDoc.data() : null;
    const isCorporate = orgData?.planId === 'enterprise';

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
        if (q.keywords && Array.isArray(q.keywords) && q.keywords.length > 0) {
          isCorrect = q.keywords.some((kw: string) => ans.includes(kw.trim().toLowerCase()) || ans === kw.trim().toLowerCase());
          displayCorrectAnswer = q.keywords.join(', ');
        } else {
          isCorrect = ans === String(q.correctAnswer || '').trim().toLowerCase();
        }
      } else {
        // open_ended
        const resultObj = {
          questionId: q.id, questionText: q.text || q.question || '',
          studentAnswer, correctAnswer: q.correctAnswer,
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

    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    const passed = percentage >= passScore;
    const now = new Date().toISOString();
    
    // AI Generation (only if corporate)
    let aiFeedback: any = null;
    if (isCorporate) {
      try {
        const attemptObj = {
           examTitle: examData.title,
           percentage, score, totalPoints, passed,
           timeSpentSeconds: timeSpentSeconds || 0
        };
        aiFeedback = await generateExamAIFeedback(attemptObj, correct, incorrect, pending, examData.gradingCategories || []);
      } catch (err) {
        console.warn('AI Feedback error:', err);
        aiFeedback = null;
      }
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
