import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { jsonResponse, badRequest, notFound } from './utils/auth';

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
    
    // 2. Safe user data
    const safeUser = {
      uid: userDoc.id,
      displayName: user.displayName || 'Unknown Student',
      avatarUrl: user.avatarUrl || '',
      pinnedBadges: user.pinnedBadges || []
    };

    // 3. Fetch recent exam/quiz results
    const resultsSnap = await adminDb.collection('examAttempts')
      .where('studentId', '==', userDoc.id)
      .get();
      
    let recentResults = resultsSnap.docs.map(d => {
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
      
    const gradedHomeworks = hwSnap.docs.map(d => ({id: d.id, ...d.data()})).filter((d: any) => d.status === 'graded');
    
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
    
    // 5. Calculate Average Score
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
    
    const averageScore = scoreCount > 0 ? Math.round(totalPercents / scoreCount) : 0;

    return jsonResponse(200, {
      student: safeUser,
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
