/**
 * API: Gamification — XP, levels, badges, streaks for students.
 *
 * GET  /api-gamification                → get student gamification profile
 * POST /api-gamification                → award XP / badge (internal use)
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, badRequest, jsonResponse } from './utils/auth';

const COLLECTION = 'gamification';

// Level thresholds — XP required for each level
const LEVELS = [
  { level: 1, xp: 0, title: 'Новичок' },
  { level: 2, xp: 100, title: 'Ученик' },
  { level: 3, xp: 300, title: 'Практикант' },
  { level: 4, xp: 600, title: 'Знаток' },
  { level: 5, xp: 1000, title: 'Мастер' },
  { level: 6, xp: 1500, title: 'Эксперт' },
  { level: 7, xp: 2500, title: 'Профессор' },
  { level: 8, xp: 4000, title: 'Академик' },
  { level: 9, xp: 6000, title: 'Гений' },
  { level: 10, xp: 10000, title: 'Легенда' },
];

// Badge definitions
const BADGE_DEFS: Record<string, { icon: string; title: string; description: string }> = {
  first_exam: { icon: '🎯', title: 'Первый экзамен', description: 'Сдали свой первый экзамен' },
  perfect_score: { icon: '💎', title: 'Перфекционист', description: 'Получили 100% на экзамене' },
  streak_3: { icon: '🔥', title: 'Серия — 3', description: '3 экзамена подряд сданы' },
  streak_7: { icon: '⚡', title: 'Серия — 7', description: '7 экзаменов подряд сданы' },
  streak_30: { icon: '🏆', title: 'Легенда серий', description: '30 экзаменов подряд сданы' },
  speed_demon: { icon: '⏱️', title: 'Быстрый ум', description: 'Сдали экзамен менее чем за 5 минут' },
  ten_exams: { icon: '📚', title: 'Десятак', description: 'Сдали 10 экзаменов' },
  fifty_exams: { icon: '🎖️', title: 'Полтинник', description: 'Сдали 50 экзаменов' },
};

function getLevel(xp: number) {
  let current = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.xp) current = l;
    else break;
  }
  const nextIdx = LEVELS.findIndex(l => l.level === current.level) + 1;
  const next = nextIdx < LEVELS.length ? LEVELS[nextIdx] : null;
  return { ...current, nextLevelXp: next ? next.xp : null, nextLevelTitle: next ? next.title : null };
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  // GET — get gamification profile
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const uid = params.studentId || user.uid;

    const doc = await adminDb.collection(COLLECTION).doc(uid).get();
    if (!doc.exists) {
      // Initialize profile
      const initial = {
        uid, xp: 0, totalExams: 0, passedExams: 0, streak: 0, bestStreak: 0,
        badges: [] as string[], createdAt: new Date().toISOString(),
      };
      await adminDb.collection(COLLECTION).doc(uid).set(initial);
      return ok({ ...initial, level: getLevel(0), badgeDetails: [], levelDefs: LEVELS });
    }

    const data = doc.data()!;
    const badgeDetails = (data.badges || []).map((b: string) => ({ id: b, ...BADGE_DEFS[b] }));

    // Get per-org XP breakdown
    const xpEventsSnap = await adminDb.collection('xpEvents')
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(100).get();

    const orgXpMap: Record<string, number> = {};
    xpEventsSnap.docs.forEach((d: any) => {
      const ev = d.data();
      if (ev.organizationId) {
        orgXpMap[ev.organizationId] = (orgXpMap[ev.organizationId] || 0) + (ev.xp || 0);
      }
    });

    return ok({
      ...data,
      level: getLevel(data.xp || 0),
      badgeDetails,
      levelDefs: LEVELS,
      orgXpBreakdown: orgXpMap,
    });
  }

  // POST — award XP / badge
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const { studentId, examPassed, percentage, timeSpentSeconds } = body;
    const uid = studentId || user.uid;

    // Get or create profile
    const ref = adminDb.collection(COLLECTION).doc(uid);
    const doc = await ref.get();
    const data = doc.exists ? doc.data()! : { xp: 0, totalExams: 0, passedExams: 0, streak: 0, bestStreak: 0, badges: [] };

    // Calculate XP earned
    let xpEarned = 10; // base XP for taking exam
    const newBadges: string[] = [];

    if (examPassed) {
      xpEarned += 20; // passed bonus
      xpEarned += Math.floor((percentage || 0) / 10); // score bonus (0-10)
      data.passedExams = (data.passedExams || 0) + 1;
      data.streak = (data.streak || 0) + 1;
      if (data.streak > (data.bestStreak || 0)) data.bestStreak = data.streak;
    } else {
      data.streak = 0;
    }
    data.totalExams = (data.totalExams || 0) + 1;
    data.xp = (data.xp || 0) + xpEarned;

    // Check badges
    const badges: string[] = data.badges || [];
    if (data.totalExams === 1 && !badges.includes('first_exam')) { badges.push('first_exam'); newBadges.push('first_exam'); }
    if (percentage === 100 && !badges.includes('perfect_score')) { badges.push('perfect_score'); newBadges.push('perfect_score'); }
    if (data.streak >= 3 && !badges.includes('streak_3')) { badges.push('streak_3'); newBadges.push('streak_3'); }
    if (data.streak >= 7 && !badges.includes('streak_7')) { badges.push('streak_7'); newBadges.push('streak_7'); }
    if (data.streak >= 30 && !badges.includes('streak_30')) { badges.push('streak_30'); newBadges.push('streak_30'); }
    if (timeSpentSeconds && timeSpentSeconds < 300 && examPassed && !badges.includes('speed_demon')) { badges.push('speed_demon'); newBadges.push('speed_demon'); }
    if (data.totalExams >= 10 && !badges.includes('ten_exams')) { badges.push('ten_exams'); newBadges.push('ten_exams'); }
    if (data.totalExams >= 50 && !badges.includes('fifty_exams')) { badges.push('fifty_exams'); newBadges.push('fifty_exams'); }

    data.badges = badges;
    await ref.set(data, { merge: true });

    // Write XP event to ledger
    await adminDb.collection('xpEvents').add({
      userId: uid,
      organizationId: body.organizationId || '',
      examId: body.examId || '',
      xp: xpEarned,
      reason: examPassed ? 'exam_passed' : 'exam_taken',
      createdAt: new Date().toISOString(),
    });

    const newBadgeDetails = newBadges.map(b => ({ id: b, ...BADGE_DEFS[b] }));
    const oldLevel = getLevel(data.xp - xpEarned);
    const newLevel = getLevel(data.xp);
    const leveledUp = newLevel.level > oldLevel.level;

    return ok({ xpEarned, newBadges: newBadgeDetails, leveledUp, newLevel, streak: data.streak, totalXp: data.xp });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export { handler };
