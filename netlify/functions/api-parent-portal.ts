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
    
    // 5. Active organization memberships count (Active Courses approximation)
    const membershipsSnap = await adminDb.collection('memberships')
      .where('userId', '==', userDoc.id)
      .get();
      
    const activeOrgsCount = membershipsSnap.docs.filter(d => d.data().status === 'active').length;

    return jsonResponse(200, {
      student: safeUser,
      stats: {
        totalXp,
        currentStreak,
        activeOrgsCount,
      },
      recentResults
    });
  } catch (error: any) {
    console.error('Parent Portal Error:', error);
    return jsonResponse(500, { error: 'Internal server error' });
  }
};
