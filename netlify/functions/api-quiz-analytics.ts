/**
 * API: Quiz Analytics — session & quiz-level analytics, CSV export.
 *
 * GET  /api-quiz-analytics?sessionId=   → session analytics
 * GET  /api-quiz-analytics?quizId=      → quiz aggregate analytics
 * POST /api-quiz-analytics              → export session results (CSV)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, hasRole, ok, unauthorized, badRequest, notFound, jsonResponse, forbidden } from './utils/auth';

const SESSIONS = 'quizSessions';
const QUIZZES = 'quizzes';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  const params = event.queryStringParameters || {};

  // ─── GET ───
  if (event.httpMethod === 'GET') {

    // Session analytics
    if (params.sessionId) {
      const sessDoc = await adminDb.collection(SESSIONS).doc(params.sessionId).get();
      if (!sessDoc.exists) return notFound('Session not found');
      const session = sessDoc.data()!;

      // Permission check — host or admin
      if (session.hostId !== user.uid && !hasRole(user, 'admin', 'super_admin')) {
        return forbidden();
      }

      // Participants
      const pSnap = await adminDb.collection(SESSIONS).doc(params.sessionId)
        .collection('participants').orderBy('score', 'desc').get();
      const participants = pSnap.docs.map((d, i) => ({ ...d.data(), rank: i + 1 }));

      // All answers
      const aSnap = await adminDb.collection(SESSIONS).doc(params.sessionId)
        .collection('answers').get();
      const answers = aSnap.docs.map(d => d.data());

      // Load questions
      const qSnap = await adminDb.collection(QUIZZES).doc(session.quizId)
        .collection('questions').orderBy('order').get();
      const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Per-question stats
      const questionStats = questions.map((q: any) => {
        const qAnswers = answers.filter((a: any) => a.questionId === q.id);
        const correctCount = qAnswers.filter((a: any) => a.isCorrect).length;
        const avgTime = qAnswers.length > 0
          ? Math.round(qAnswers.reduce((sum: number, a: any) => sum + (a.responseTimeMs || 0), 0) / qAnswers.length)
          : 0;

        return {
          questionId: q.id,
          questionText: q.text || '',
          questionType: q.type,
          totalAnswers: qAnswers.length,
          correctCount,
          correctRate: qAnswers.length > 0 ? Math.round((correctCount / qAnswers.length) * 100) : 0,
          avgResponseTimeMs: avgTime,
        };
      });

      // Score distribution
      const scores = participants.map((p: any) => p.score || 0);
      const maxScore = Math.max(...scores, 0);
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((s: number, v: number) => s + v, 0) / scores.length)
        : 0;

      const sortedStats = [...questionStats].sort((a, b) => a.correctRate - b.correctRate);

      return ok({
        session: { id: params.sessionId, ...session },
        participants,
        questionStats,
        summary: {
          totalParticipants: participants.length,
          totalAnswers: answers.length,
          avgScore,
          maxScore,
          hardestQuestion: sortedStats[0] || null,
          easiestQuestion: sortedStats[sortedStats.length - 1] || null,
          completionRate: session.totalQuestions > 0
            ? Math.round((answers.length / (participants.length * session.totalQuestions)) * 100)
            : 0,
        },
      });
    }

    // Quiz aggregate analytics
    if (params.quizId) {
      const quizDoc = await adminDb.collection(QUIZZES).doc(params.quizId).get();
      if (!quizDoc.exists) return notFound('Quiz not found');

      // Get all sessions for this quiz
      const sessSnap = await adminDb.collection(SESSIONS)
        .where('quizId', '==', params.quizId)
        .where('status', '==', 'completed')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const sessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const totalPlays = sessions.length;

      // Aggregate from sessions
      let totalParticipants = 0;
      const allScores: number[] = [];

      for (const s of sessions) {
        totalParticipants += (s as any).participantCount || 0;
      }

      // Get participant scores from recent sessions (sample up to 5)
      const recentSessions = sessions.slice(0, 5);
      for (const s of recentSessions) {
        const pSnap = await adminDb.collection(SESSIONS).doc(s.id)
          .collection('participants').get();
        pSnap.docs.forEach(d => {
          const data = d.data();
          allScores.push(data.score || 0);
        });
      }

      const avgScore = allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : 0;

      return ok({
        quizId: params.quizId,
        quiz: { id: params.quizId, ...quizDoc.data() },
        totalPlays,
        totalParticipants,
        avgScore,
        sessions: sessions.map((s: any) => ({
          id: s.id,
          status: s.status,
          participantCount: s.participantCount,
          createdAt: s.createdAt,
          completedAt: s.completedAt,
        })),
      });
    }

    return badRequest('sessionId or quizId required');
  }

  // ─── POST — Export CSV ───
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const { sessionId } = body;
    if (!sessionId) return badRequest('sessionId required');

    const sessDoc = await adminDb.collection(SESSIONS).doc(sessionId).get();
    if (!sessDoc.exists) return notFound();
    const session = sessDoc.data()!;
    if (session.hostId !== user.uid && !hasRole(user, 'admin', 'super_admin')) return forbidden();

    // Build CSV
    const pSnap = await adminDb.collection(SESSIONS).doc(sessionId)
      .collection('participants').orderBy('score', 'desc').get();
    const aSnap = await adminDb.collection(SESSIONS).doc(sessionId)
      .collection('answers').get();
    const answers = aSnap.docs.map(d => d.data());

    const qSnap = await adminDb.collection(QUIZZES).doc(session.quizId)
      .collection('questions').orderBy('order').get();
    const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    // CSV header
    const header = ['Rank', 'Name', 'Score', 'Correct', 'Incorrect', 'Best Streak'];
    questions.forEach((q, i) => {
      header.push(`Q${i + 1}: ${q.text?.substring(0, 30) || 'Question'}`);
    });

    const rows: string[][] = [];
    pSnap.docs.forEach((d, i) => {
      const p = d.data();
      const row = [
        String(i + 1),
        p.participantName || '',
        String(p.score || 0),
        String(p.correctCount || 0),
        String(p.incorrectCount || 0),
        String(p.streakBest || 0),
      ];

      // Add per-question answers
      questions.forEach((q) => {
        const ans = answers.find((a: any) => a.participantId === p.participantId && a.questionId === q.id);
        if (ans) {
          row.push(ans.isCorrect ? '✓' : '✗');
        } else {
          row.push('—');
        }
      });

      rows.push(row);
    });

    const csv = [header.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="quiz-results-${sessionId}.csv"`,
        'Access-Control-Allow-Origin': '*',
      },
      body: csv,
    };
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
