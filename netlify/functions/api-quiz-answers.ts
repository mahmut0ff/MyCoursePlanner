/**
 * API: Quiz Answers — server-authoritative answer submission, grading & scoring.
 *
 * POST /api-quiz-answers                  → submit answer
 * GET  /api-quiz-answers?sessionId=&leaderboard=true  → get leaderboard
 * GET  /api-quiz-answers?sessionId=&questionId=       → get answers for a question
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, badRequest, notFound, jsonResponse } from './utils/auth';

const SESSIONS = 'quizSessions';
const QUIZZES = 'quizzes';

/** Calculate score for a correct answer with speed and streak bonuses */
function calculateScore(
  basePoints: number,
  responseTimeMs: number,
  timerSeconds: number,
  streakCurrent: number
): { total: number; speedBonus: number; streakBonus: number } {
  const timerMs = timerSeconds * 1000;
  // Speed bonus: up to 50% extra for fast answers (linear decay)
  const speedRatio = Math.max(0, 1 - responseTimeMs / timerMs);
  const speedBonus = Math.round(basePoints * 0.5 * speedRatio);

  // Streak bonus: 10% per consecutive correct, capped at 50%
  const streakMultiplier = Math.min(streakCurrent * 0.1, 0.5);
  const streakBonus = Math.round(basePoints * streakMultiplier);

  return {
    total: basePoints + speedBonus + streakBonus,
    speedBonus,
    streakBonus,
  };
}

/** Grade an answer based on question type */
function gradeAnswer(
  questionType: string,
  submittedAnswer: string | string[],
  correctAnswers: string[],
  orderingSequence?: string[],
  matchingPairs?: { left: string; right: string }[]
): boolean {
  switch (questionType) {
    case 'single_choice':
    case 'true_false':
    case 'image_question':
    case 'audio_question':
    case 'pdf_question':
    case 'passage_question':
      return correctAnswers.includes(String(submittedAnswer));

    case 'multiple_choice':
    case 'multi_select': {
      const submitted = Array.isArray(submittedAnswer) ? submittedAnswer : [submittedAnswer];
      if (submitted.length !== correctAnswers.length) return false;
      return correctAnswers.every(a => submitted.includes(a))
        && submitted.every(a => correctAnswers.includes(a));
    }

    case 'short_text': {
      const answer = String(submittedAnswer).trim().toLowerCase();
      return correctAnswers.some(c => c.trim().toLowerCase() === answer);
    }

    case 'ordering': {
      if (!orderingSequence) return false;
      const submitted = Array.isArray(submittedAnswer) ? submittedAnswer : [];
      return orderingSequence.length === submitted.length
        && orderingSequence.every((id, i) => id === submitted[i]);
    }

    case 'matching': {
      if (!matchingPairs) return false;
      // submittedAnswer is array of "left::right" pairs
      const submitted = Array.isArray(submittedAnswer) ? submittedAnswer : [];
      const correctPairs = matchingPairs.map(p => `${p.left}::${p.right}`);
      return correctPairs.length === submitted.length
        && correctPairs.every(p => submitted.includes(p));
    }

    // Non-scored types
    case 'poll':
    case 'info_slide':
    case 'discussion':
      return true; // Always "correct" (participation-based)

    case 'puzzle':
      return correctAnswers.includes(String(submittedAnswer));

    default:
      return correctAnswers.includes(String(submittedAnswer));
  }
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // ─── GET ───
  if (event.httpMethod === 'GET') {
    const { sessionId, questionId, leaderboard } = params;
    if (!sessionId) return badRequest('sessionId required');

    // Leaderboard
    if (leaderboard === 'true') {
      const pSnap = await adminDb.collection(SESSIONS).doc(sessionId)
        .collection('participants').orderBy('score', 'desc').get();
      const participants = pSnap.docs.map((d, i) => ({ ...d.data(), rank: i + 1 }));
      return ok(participants);
    }

    // Answers for a specific question
    if (questionId) {
      const aSnap = await adminDb.collection(SESSIONS).doc(sessionId)
        .collection('answers')
        .where('questionId', '==', questionId)
        .orderBy('submittedAt')
        .get();
      const answers = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      return ok(answers);
    }

    // All answers for a session (teacher only)
    const sessDoc = await adminDb.collection(SESSIONS).doc(sessionId).get();
    if (!sessDoc.exists) return notFound();
    if (sessDoc.data()!.hostId !== user.uid && user.role !== 'super_admin') {
      // Students can only see their own answers
      const myAnswers = await adminDb.collection(SESSIONS).doc(sessionId)
        .collection('answers')
        .where('participantId', '==', user.uid)
        .orderBy('submittedAt')
        .get();
      return ok(myAnswers.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    const aSnap = await adminDb.collection(SESSIONS).doc(sessionId)
      .collection('answers').orderBy('submittedAt').get();
    return ok(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  // ─── POST — Submit Answer ───
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const { sessionId, questionId, answer, responseTimeMs } = body;

    if (!sessionId || !questionId || answer === undefined) {
      return badRequest('sessionId, questionId, and answer required');
    }

    // 1. Validate session is in_progress
    const sessDoc = await adminDb.collection(SESSIONS).doc(sessionId).get();
    if (!sessDoc.exists) return notFound('Session not found');
    const session = sessDoc.data()!;

    if (session.status !== 'in_progress') {
      return badRequest('Session is not in progress');
    }

    // 2. Validate question matches current question
    const currentQId = session.questionOrder[session.currentQuestionIndex];
    if (currentQId !== questionId) {
      return badRequest('Question does not match current question');
    }

    // 3. Anti-double-submit: check if answer already exists
    const existingSnap = await adminDb.collection(SESSIONS).doc(sessionId)
      .collection('answers')
      .where('participantId', '==', user.uid)
      .where('questionId', '==', questionId)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return badRequest('Answer already submitted for this question');
    }

    // 4. Verify participant exists
    const partDoc = await adminDb.collection(SESSIONS).doc(sessionId)
      .collection('participants').doc(user.uid).get();
    if (!partDoc.exists) return badRequest('Not a participant in this session');
    const participant = partDoc.data()!;

    // 5. Load question for grading
    const qDoc = await adminDb.collection(QUIZZES).doc(session.quizId)
      .collection('questions').doc(questionId).get();
    if (!qDoc.exists) return notFound('Question not found');
    const question = qDoc.data()!;

    // 6. Grade the answer
    const isCorrect = gradeAnswer(
      question.type,
      answer,
      question.correctAnswers || [],
      question.orderingSequence,
      question.matchingPairs
    );

    // 7. Calculate score
    let pointsEarned = 0;
    let speedBonusEarned = 0;
    let streakBonusEarned = 0;
    let newStreak = participant.streakCurrent || 0;

    const isScored = !['poll', 'info_slide', 'discussion'].includes(question.type);

    if (isScored) {
      if (isCorrect) {
        const timerSec = session.settings?.timerOverride || question.timerSeconds || 30;
        const scored = calculateScore(
          question.points || 1000,
          Math.max(0, responseTimeMs || timerSec * 1000),
          timerSec,
          newStreak
        );
        pointsEarned = scored.total;
        speedBonusEarned = scored.speedBonus;
        streakBonusEarned = scored.streakBonus;
        newStreak++;
      } else {
        // Apply negative scoring if configured
        if (question.negativeScore) {
          pointsEarned = -Math.abs(question.negativeScore);
        }
        newStreak = 0;
      }
    }

    // 8. Save answer
    const answerData = {
      sessionId,
      questionId,
      participantId: user.uid,
      participantName: user.displayName,
      answer,
      isCorrect,
      pointsEarned,
      speedBonusEarned,
      streakBonusEarned,
      responseTimeMs: responseTimeMs || 0,
      submittedAt: new Date().toISOString(),
    };

    await adminDb.collection(SESSIONS).doc(sessionId)
      .collection('answers').add(answerData);

    // 9. Update participant score
    const newScore = (participant.score || 0) + pointsEarned;
    const newCorrect = (participant.correctCount || 0) + (isCorrect && isScored ? 1 : 0);
    const newIncorrect = (participant.incorrectCount || 0) + (!isCorrect && isScored ? 1 : 0);
    const newBestStreak = Math.max(participant.streakBest || 0, newStreak);

    await adminDb.collection(SESSIONS).doc(sessionId)
      .collection('participants').doc(user.uid).update({
        score: newScore,
        correctCount: newCorrect,
        incorrectCount: newIncorrect,
        streakCurrent: newStreak,
        streakBest: newBestStreak,
        lastActiveAt: new Date().toISOString(),
      });

    // 10. Return result
    return ok({
      isCorrect,
      pointsEarned,
      speedBonusEarned,
      streakBonusEarned,
      totalScore: newScore,
      streakCurrent: newStreak,
      answerExplanation: session.settings?.showAnswerCorrectness ? question.answerExplanation : null,
      correctAnswers: session.settings?.showAnswerCorrectness ? question.correctAnswers : null,
    });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
