import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { jsonResponse, badRequest, notFound } from './utils/auth';
import { TELEGRAM_BOT_USERNAME } from './utils/telegram';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';
import { getModel, parseJsonLoose, hasGeminiKey, recordAiUsage } from './utils/ai';

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const token = event.queryStringParameters?.token;
  if (!token) return badRequest('Token is required');

  try {
    // 1. Find user by parentPortalKey
    const usersSnap = await adminDb.collection('users').where('parentPortalKey', '==', token).limit(1).get();
    if (usersSnap.empty) return notFound('Invalid or expired parent access token');

    const userDoc = usersSnap.docs[0];
    const user = userDoc.data();
    const orgId = user.organizationId || user.activeOrgId || null;

    // 1.5 Deny access for expelled students (link effectively revoked).
    if (orgId) {
      const memberDoc = await adminDb.collection('orgMembers').doc(orgId).collection('members').doc(userDoc.id).get();
      if (memberDoc.exists && memberDoc.data()?.status === 'expelled') {
        return notFound('Доступ закрыт');
      }
    }

    // 2. Safe user data
    const safeUser = {
      uid: userDoc.id,
      displayName: user.displayName || 'Unknown Student',
      avatarUrl: user.avatarUrl || '',
      pinnedBadges: user.pinnedBadges || []
    };

    // 2.5 Organization branding (logo + name) for a white-labeled portal.
    let organization: { name: string; logoUrl: string } | null = null;
    let aiEnabled = false;
    if (orgId) {
      const orgDoc = await adminDb.collection('organizations').doc(orgId).get();
      if (orgDoc.exists) {
        const o = orgDoc.data()!;
        organization = { name: o.name || '', logoUrl: o.logo || o.branding?.logoUrl || '' };
        aiEnabled = o.planId === 'professional' || o.planId === 'enterprise';
      }
    }

    // 3. Fetch recent exam/quiz results
    const resultsSnap = await adminDb.collection('examAttempts')
      .where('studentId', '==', userDoc.id)
      .get();

    let recentResults: any[] = resultsSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        examTitle: data.examTitle || 'Test',
        percentage: data.percentage || 0,
        passed: data.passed || false,
        submittedAt: data.submittedAt || new Date().toISOString(),
        type: data.type || 'exam',
        xpEarned: data.xpEarned || 0,
      };
    });

    // 3.5 Fetch homeworks
    const hwSnap = await adminDb.collection('homework_submissions')
      .where('studentId', '==', userDoc.id)
      .get();

    const gradedHomeworks = hwSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((d: any) => d.status === 'graded');

    gradedHomeworks.forEach((data: any) => {
      recentResults.push({
        id: data.id,
        examTitle: data.lessonTitle || 'Домашнее задание',
        percentage: data.maxPoints ? Math.round((data.finalScore / data.maxPoints) * 100) : 0,
        score: data.finalScore || 0,
        maxPoints: data.maxPoints || 10,
        passed: true,
        submittedAt: data.submittedAt || new Date().toISOString(),
        type: 'homework',
        xpEarned: 0,
      });
    });

    // 3.6 Fetch quiz (live-session) results — stored under quizSessions/{id}/participants/{uid}.
    // No collectionGroup index needed: scan the org's recent completed sessions and read this
    // student's participant doc in each.
    const quizResults: any[] = [];
    if (orgId) {
      const sessSnap = await adminDb.collection('quizSessions').where('organizationId', '==', orgId).get();
      const recentSessions = sessSnap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(s => s.status === 'completed' || !!s.completedAt)
        .sort((a, b) => new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime())
        .slice(0, 25);

      const parts = await Promise.all(recentSessions.map(async (s) => {
        const pDoc = await adminDb.collection('quizSessions').doc(s.id).collection('participants').doc(userDoc.id).get();
        if (!pDoc.exists) return null;
        const pd = pDoc.data()!;
        const correct = pd.correctCount || 0;
        const total = s.totalQuestions || (correct + (pd.incorrectCount || 0));
        const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
        return {
          id: `quiz_${s.id}`,
          examTitle: s.quizTitle || 'Квиз',
          percentage,
          correct,
          total,
          passed: percentage >= 50,
          submittedAt: pd.completedAt || s.completedAt || s.createdAt || new Date().toISOString(),
          type: 'quiz',
          xpEarned: 0,
        };
      }));
      for (const p of parts) if (p) quizResults.push(p);
      recentResults.push(...quizResults);
    }

    // Sort in memory (descending) and take top 10
    recentResults.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    recentResults = recentResults.slice(0, 10);

    // 4. Fetch Gamification Stats
    let totalXp = 0;
    let currentStreak = 0;

    const gamiSnap = await adminDb.collection('gamification').doc(userDoc.id).get();
    if (gamiSnap.exists) {
      const gamiData = gamiSnap.data()!;
      totalXp = gamiData.totalXp || 0;
      currentStreak = gamiData.currentStreak || 0;
    }

    // 5. Calculate Average Score (exams + graded homeworks + quizzes)
    let totalPercents = 0;
    let scoreCount = 0;

    resultsSnap.docs.forEach(d => {
      const data = d.data();
      if (typeof data.percentage === 'number') {
        totalPercents += data.percentage;
        scoreCount++;
      }
    });
    gradedHomeworks.forEach((data: any) => {
      if (data.maxPoints && typeof data.finalScore === 'number') {
        totalPercents += Math.round((data.finalScore / data.maxPoints) * 100);
        scoreCount++;
      }
    });
    quizResults.forEach((q) => {
      totalPercents += q.percentage;
      scoreCount++;
    });

    // null when there's nothing to average — the UI shows "—" instead of a red 0.
    const averageScore = scoreCount > 0 ? Math.round(totalPercents / scoreCount) : null;

    // ── AI progress summary for parents (separate action) ──
    if (event.queryStringParameters?.action === 'aiSummary') {
      if (!aiEnabled) return jsonResponse(200, { summary: null, locked: true });
      if (!hasGeminiKey()) return jsonResponse(200, { summary: null });
      if (rateLimiters.ai.isLimited(getRateLimitKey(event, `parent:${token}`))) {
        return jsonResponse(429, { error: 'Слишком много запросов. Подождите немного.' });
      }
      const resultsText = recentResults
        .map((r: any) => `${r.examTitle} (${r.type}): ${r.percentage}%`)
        .join('; ') || 'пока нет результатов';
      const model = getModel({ json: true });
      const prompt = `Ты — доброжелательный куратор учебного центра. Напиши для РОДИТЕЛЯ краткую сводку об успехах ребёнка простым, тёплым языком (без жаргона). Опирайся только на данные. Не выдумывай.

Ребёнок: ${safeUser.displayName}
Средний балл: ${averageScore === null ? 'нет данных' : averageScore + '%'}
Серия активности (стрик): ${currentStreak} дн.
Очки (XP): ${totalXp}
Последние результаты: ${resultsText}

Верни строго JSON: { "summary": string (2-4 предложения: как дела в целом, что хорошо, на что обратить внимание), "recommendations": [string] (1-2 коротких совета родителю) }`;
      try {
        const result = await model.generateContent(prompt);
        const data = parseJsonLoose(result.response.text());
        recordAiUsage(orgId, 'parent_summary');
        return jsonResponse(200, { summary: data.summary || '', recommendations: Array.isArray(data.recommendations) ? data.recommendations : [] });
      } catch (e: any) {
        console.error('Parent AI summary error:', e);
        return jsonResponse(200, { summary: null });
      }
    }

    return jsonResponse(200, {
      student: safeUser,
      organization,
      aiEnabled,
      telegramBot: TELEGRAM_BOT_USERNAME,
      stats: {
        totalXp,
        currentStreak,
        averageScore,
      },
      recentResults
    });
  } catch (error: any) {
    console.error('Parent Portal Error:', error);
    return jsonResponse(500, { error: 'Internal server error' });
  }
};
