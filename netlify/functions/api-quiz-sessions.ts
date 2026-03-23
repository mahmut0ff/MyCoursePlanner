/**
 * API: Quiz Sessions — server-authoritative session lifecycle.
 *
 * GET  /api-quiz-sessions?id=         → get session details
 * GET  /api-quiz-sessions?code=       → lookup session by join code
 * GET  /api-quiz-sessions             → list sessions
 * POST /api-quiz-sessions             → create / join / start / nextQuestion / pause / resume / end / kick / lock / restart
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, hasRole, ok, unauthorized, badRequest, forbidden, notFound, jsonResponse } from './utils/auth';

const SESSIONS = 'quizSessions';
const QUIZZES = 'quizzes';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // ─── GET ───
  if (event.httpMethod === 'GET') {
    // Get by ID
    if (params.id) {
      const doc = await adminDb.collection(SESSIONS).doc(params.id).get();
      if (!doc.exists) return notFound('Session not found');
      const session = { id: doc.id, ...doc.data() };

      // Load participants
      const pSnap = await adminDb.collection(SESSIONS).doc(params.id)
        .collection('participants').orderBy('score', 'desc').get();
      const participants = pSnap.docs.map((d, i) => ({ id: d.id, ...d.data(), rank: i + 1 }));

      // Load current question if in_progress (only for teacher/host)
      let currentQuestion = null;
      const sessionData = doc.data()!;
      if (sessionData.status === 'in_progress' || sessionData.status === 'paused') {
        const qIndex = sessionData.currentQuestionIndex;
        const qId = sessionData.questionOrder?.[qIndex];
        if (qId) {
          const qDoc = await adminDb.collection(QUIZZES).doc(sessionData.quizId)
            .collection('questions').doc(qId).get();
          if (qDoc.exists) {
            currentQuestion = { id: qDoc.id, ...qDoc.data() };
            // Strip correct answers for students
            if (user.uid !== sessionData.hostId) {
              delete (currentQuestion as any).correctAnswers;
              delete (currentQuestion as any).distractorExplanations;
              delete (currentQuestion as any).answerExplanation;
              delete (currentQuestion as any).orderingSequence;
              delete (currentQuestion as any).matchingPairs;
            }
          }
        }
      }

      return ok({ session, participants, currentQuestion });
    }

    // Get by join code
    if (params.code) {
      const snap = await adminDb.collection(SESSIONS)
        .where('code', '==', params.code.toUpperCase())
        .where('status', 'in', ['lobby', 'in_progress', 'paused'])
        .limit(1).get();
      if (snap.empty) return notFound('No active session with this code');
      const doc = snap.docs[0];
      return ok({ id: doc.id, ...doc.data() });
    }

    // List sessions (teacher sees own, admin sees org)
    let ref: FirebaseFirestore.Query = adminDb.collection(SESSIONS);
    if (hasRole(user, 'teacher')) {
      ref = ref.where('hostId', '==', user.uid);
    } else if (hasRole(user, 'admin') && user.organizationId) {
      ref = ref.where('organizationId', '==', user.organizationId);
    }
    ref = ref.orderBy('createdAt', 'desc').limit(50);
    const snap = await ref.get();
    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return ok(sessions);
  }

  // ─── POST ───
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const action = body.action;

    // ── CREATE SESSION ──
    if (action === 'create') {
      if (!hasRole(user, 'admin', 'teacher')) return forbidden();
      const { quizId, mode, settings } = body;
      if (!quizId) return badRequest('quizId required');

      const quizDoc = await adminDb.collection(QUIZZES).doc(quizId).get();
      if (!quizDoc.exists) return notFound('Quiz not found');
      const quiz = quizDoc.data()!;

      // Load question IDs
      const qSnap = await adminDb.collection(QUIZZES).doc(quizId)
        .collection('questions').orderBy('order').get();
      if (qSnap.empty) return badRequest('Quiz has no questions');

      let questionOrder = qSnap.docs.map(d => d.id);
      const sessionSettings = {
        randomizeQuestions: settings?.randomizeQuestions ?? false,
        randomizeAnswers: settings?.randomizeAnswers ?? false,
        showLeaderboard: settings?.showLeaderboard ?? true,
        showAnswerCorrectness: settings?.showAnswerCorrectness ?? true,
        teamMode: settings?.teamMode ?? false,
        anonymousMode: settings?.anonymousMode ?? false,
        allowedGroupIds: settings?.allowedGroupIds || null,
        restrictToOrg: settings?.restrictToOrg ?? false,
        timerOverride: settings?.timerOverride || null,
      };

      if (sessionSettings.randomizeQuestions) {
        questionOrder = shuffleArray(questionOrder);
      }

      const sessionData = {
        quizId,
        quizTitle: quiz.title,
        hostId: user.uid,
        hostName: user.displayName,
        code: generateCode(),
        status: 'lobby',
        mode: mode || 'competition',
        currentQuestionIndex: -1,
        totalQuestions: questionOrder.length,
        currentQuestionStartedAt: null,
        settings: sessionSettings,
        participantCount: 0,
        organizationId: user.organizationId || null,
        questionOrder,
        startedAt: null,
        pausedAt: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
      };

      const ref = await adminDb.collection(SESSIONS).add(sessionData);
      return ok({ id: ref.id, ...sessionData });
    }

    // ── JOIN SESSION ──
    if (action === 'join') {
      const { sessionId, code } = body;

      let sessDoc;
      if (sessionId) {
        sessDoc = await adminDb.collection(SESSIONS).doc(sessionId).get();
      } else if (code) {
        const snap = await adminDb.collection(SESSIONS)
          .where('code', '==', code.toUpperCase())
          .where('status', 'in', ['lobby', 'in_progress', 'paused'])
          .limit(1).get();
        if (snap.empty) return notFound('No active session with this code');
        sessDoc = snap.docs[0];
      } else {
        return badRequest('sessionId or code required');
      }

      if (!sessDoc.exists) return notFound('Session not found');
      const session = sessDoc.data()!;
      const sId = sessDoc.id;

      if (!['lobby', 'in_progress'].includes(session.status)) {
        return badRequest('Session is not accepting participants');
      }

      // Check if locked
      if (session.locked) return badRequest('Session is locked');

      // Check org restriction
      if (session.settings?.restrictToOrg && user.organizationId !== session.organizationId) {
        return forbidden();
      }

      // Check if already joined
      const existingPart = await adminDb.collection(SESSIONS).doc(sId)
        .collection('participants').doc(user.uid).get();

      if (!existingPart.exists) {
        const participantData = {
          id: user.uid,
          sessionId: sId,
          participantId: user.uid,
          participantName: user.displayName,
          score: 0,
          correctCount: 0,
          incorrectCount: 0,
          streakCurrent: 0,
          streakBest: 0,
          rank: null,
          joinedAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          isConnected: true,
        };

        await adminDb.collection(SESSIONS).doc(sId)
          .collection('participants').doc(user.uid).set(participantData);

        // Increment participant count
        const currentCount = session.participantCount || 0;
        await adminDb.collection(SESSIONS).doc(sId).update({
          participantCount: currentCount + 1,
        });
      } else {
        // Re-connecting — mark as connected
        await adminDb.collection(SESSIONS).doc(sId)
          .collection('participants').doc(user.uid).update({
            isConnected: true,
            lastActiveAt: new Date().toISOString(),
          });
      }

      return ok({ sessionId: sId, status: session.status });
    }

    // ── START GAME ──
    if (action === 'start') {
      const { sessionId } = body;
      if (!sessionId) return badRequest('sessionId required');

      const doc = await adminDb.collection(SESSIONS).doc(sessionId).get();
      if (!doc.exists) return notFound();
      const session = doc.data()!;

      if (session.hostId !== user.uid) return forbidden();
      if (session.status !== 'lobby') return badRequest('Can only start from lobby state');

      await adminDb.collection(SESSIONS).doc(sessionId).update({
        status: 'in_progress',
        currentQuestionIndex: 0,
        currentQuestionStartedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      });

      return ok({ status: 'in_progress', currentQuestionIndex: 0 });
    }

    // ── NEXT QUESTION ──
    if (action === 'nextQuestion') {
      const { sessionId } = body;
      if (!sessionId) return badRequest('sessionId required');

      const doc = await adminDb.collection(SESSIONS).doc(sessionId).get();
      if (!doc.exists) return notFound();
      const session = doc.data()!;

      if (session.hostId !== user.uid) return forbidden();
      if (session.status !== 'in_progress') return badRequest('Session not in progress');

      const nextIndex = session.currentQuestionIndex + 1;
      if (nextIndex >= session.totalQuestions) {
        // Game complete — compute final rankings
        const pSnap = await adminDb.collection(SESSIONS).doc(sessionId)
          .collection('participants').orderBy('score', 'desc').get();

        const batch = adminDb.batch();
        pSnap.docs.forEach((d, i) => {
          batch.update(d.ref, { rank: i + 1 });
        });
        batch.update(adminDb.collection(SESSIONS).doc(sessionId), {
          status: 'completed',
          completedAt: new Date().toISOString(),
        });
        await batch.commit();

        // Update quiz stats
        const quizRef = adminDb.collection(QUIZZES).doc(session.quizId);
        const quizDoc = await quizRef.get();
        if (quizDoc.exists) {
          const q = quizDoc.data()!;
          await quizRef.update({
            timesPlayed: (q.timesPlayed || 0) + 1,
          });
        }

        return ok({ status: 'completed' });
      }

      await adminDb.collection(SESSIONS).doc(sessionId).update({
        currentQuestionIndex: nextIndex,
        currentQuestionStartedAt: new Date().toISOString(),
      });

      return ok({ currentQuestionIndex: nextIndex });
    }

    // ── PAUSE / RESUME ──
    if (action === 'pause' || action === 'resume') {
      const { sessionId } = body;
      if (!sessionId) return badRequest('sessionId required');

      const doc = await adminDb.collection(SESSIONS).doc(sessionId).get();
      if (!doc.exists) return notFound();
      if (doc.data()!.hostId !== user.uid) return forbidden();

      if (action === 'pause') {
        if (doc.data()!.status !== 'in_progress') return badRequest('Can only pause when in_progress');
        await adminDb.collection(SESSIONS).doc(sessionId).update({
          status: 'paused',
          pausedAt: new Date().toISOString(),
        });
      } else {
        if (doc.data()!.status !== 'paused') return badRequest('Can only resume when paused');
        await adminDb.collection(SESSIONS).doc(sessionId).update({
          status: 'in_progress',
          currentQuestionStartedAt: new Date().toISOString(),
        });
      }

      return ok({ status: action === 'pause' ? 'paused' : 'in_progress' });
    }

    // ── END SESSION ──
    if (action === 'end') {
      const { sessionId } = body;
      if (!sessionId) return badRequest('sessionId required');

      const doc = await adminDb.collection(SESSIONS).doc(sessionId).get();
      if (!doc.exists) return notFound();
      if (doc.data()!.hostId !== user.uid) return forbidden();

      // Final rankings
      const pSnap = await adminDb.collection(SESSIONS).doc(sessionId)
        .collection('participants').orderBy('score', 'desc').get();
      const batch = adminDb.batch();
      pSnap.docs.forEach((d, i) => {
        batch.update(d.ref, { rank: i + 1 });
      });
      batch.update(adminDb.collection(SESSIONS).doc(sessionId), {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
      await batch.commit();

      // Update quiz play count
      const session = doc.data()!;
      const quizRef = adminDb.collection(QUIZZES).doc(session.quizId);
      const quizDoc = await quizRef.get();
      if (quizDoc.exists) {
        await quizRef.update({ timesPlayed: (quizDoc.data()!.timesPlayed || 0) + 1 });
      }

      return ok({ status: 'completed' });
    }

    // ── CANCEL SESSION ──
    if (action === 'cancel') {
      const { sessionId } = body;
      if (!sessionId) return badRequest('sessionId required');
      const doc = await adminDb.collection(SESSIONS).doc(sessionId).get();
      if (!doc.exists) return notFound();
      if (doc.data()!.hostId !== user.uid) return forbidden();

      await adminDb.collection(SESSIONS).doc(sessionId).update({
        status: 'cancelled',
        completedAt: new Date().toISOString(),
      });
      return ok({ status: 'cancelled' });
    }

    // ── KICK PARTICIPANT ──
    if (action === 'kick') {
      const { sessionId, participantId } = body;
      if (!sessionId || !participantId) return badRequest('sessionId and participantId required');

      const doc = await adminDb.collection(SESSIONS).doc(sessionId).get();
      if (!doc.exists) return notFound();
      if (doc.data()!.hostId !== user.uid) return forbidden();

      await adminDb.collection(SESSIONS).doc(sessionId)
        .collection('participants').doc(participantId).delete();

      const session = doc.data()!;
      await adminDb.collection(SESSIONS).doc(sessionId).update({
        participantCount: Math.max(0, (session.participantCount || 1) - 1),
      });

      return ok({ kicked: participantId });
    }

    // ── LOCK / UNLOCK ──
    if (action === 'lock' || action === 'unlock') {
      const { sessionId } = body;
      if (!sessionId) return badRequest('sessionId required');

      const doc = await adminDb.collection(SESSIONS).doc(sessionId).get();
      if (!doc.exists) return notFound();
      if (doc.data()!.hostId !== user.uid) return forbidden();

      await adminDb.collection(SESSIONS).doc(sessionId).update({
        locked: action === 'lock',
      });
      return ok({ locked: action === 'lock' });
    }

    // ── RESTART ──
    if (action === 'restart') {
      const { sessionId } = body;
      if (!sessionId) return badRequest('sessionId required');

      const doc = await adminDb.collection(SESSIONS).doc(sessionId).get();
      if (!doc.exists) return notFound();
      if (doc.data()!.hostId !== user.uid) return forbidden();

      // Clear all answers
      const aSnap = await adminDb.collection(SESSIONS).doc(sessionId)
        .collection('answers').get();
      const batch1 = adminDb.batch();
      aSnap.docs.forEach(d => batch1.delete(d.ref));
      await batch1.commit();

      // Reset all participants
      const pSnap = await adminDb.collection(SESSIONS).doc(sessionId)
        .collection('participants').get();
      const batch2 = adminDb.batch();
      pSnap.docs.forEach(d => {
        batch2.update(d.ref, {
          score: 0, correctCount: 0, incorrectCount: 0,
          streakCurrent: 0, streakBest: 0, rank: null,
        });
      });
      await batch2.commit();

      // Reset session
      await adminDb.collection(SESSIONS).doc(sessionId).update({
        status: 'lobby',
        currentQuestionIndex: -1,
        currentQuestionStartedAt: null,
        startedAt: null,
        pausedAt: null,
        completedAt: null,
      });

      return ok({ status: 'lobby' });
    }

    return badRequest('Unknown action: ' + action);
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
