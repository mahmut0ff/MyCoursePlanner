/**
 * API: Gamification — XP, levels, badges, streaks for students.
 *
 * GET  /api-gamification                → get student gamification profile & full badge definitions
 * POST /api-gamification                → award XP / badge (supports exams, lessons, quizzes, orgs, posts)
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

// Badge definitions (20 Global Badges)
const BADGE_DEFS: Record<string, { icon: string; title: string; description: string }> = {
  // --- Exams ---
  first_exam: { icon: '🎯', title: 'Первый экзамен', description: 'Сдали свой первый экзамен' },
  perfect_score: { icon: '💎', title: 'Перфекционист', description: 'Получили 100% на экзамене' },
  streak_3: { icon: '🔥', title: 'Серия — 3', description: '3 экзамена подряд сданы' },
  streak_7: { icon: '⚡', title: 'Серия — 7', description: '7 экзаменов подряд сданы' },
  streak_30: { icon: '🏆', title: 'Легенда серий', description: '30 экзаменов подряд сданы' },
  speed_demon: { icon: '⏱️', title: 'Быстрый ум', description: 'Сдали экзамен менее чем за 5 минут' },
  ten_exams: { icon: '📚', title: 'Десятак', description: 'Сдали 10 экзаменов' },
  fifty_exams: { icon: '🎖️', title: 'Полтинник', description: 'Сдали 50 экзаменов' },
  // --- Lessons ---
  first_lesson: { icon: '📖', title: 'Книжный червь', description: 'Изучили первый урок' },
  five_lessons: { icon: '🧠', title: 'Жажда знаний', description: 'Изучили 5 уроков' },
  twenty_lessons: { icon: '🎓', title: 'Эрудит', description: 'Изучили 20 уроков' },
  // --- Quizzes ---
  first_quiz: { icon: '🎮', title: 'Новый игрок', description: 'Сыграли в свою первую викторину' },
  quiz_winner: { icon: '🏅', title: 'Чемпион', description: 'Успешно прошли викторину на высокий балл' },
  five_quizzes: { icon: '🎲', title: 'Азартный ученик', description: 'Завершили 5 викторин' },
  // --- Organizations & Community ---
  joined_org: { icon: '🤝', title: 'Часть команды', description: 'Вступили в свой первый учебный центр' },
  three_orgs: { icon: '🌍', title: 'Сетевик', description: 'Состоите в 3 учебных центрах' },
  first_post: { icon: '📝', title: 'Спикер', description: 'Опубликовали первую запись в портфолио' },
  // --- General XP & Levels ---
  level_5: { icon: '⭐', title: 'Достигатор', description: 'Достигли 5-го уровня' },
  level_10: { icon: '👑', title: 'Легенда Университета', description: 'Достигли 10-го (максимального) уровня' },
  night_owl: { icon: '🦉', title: 'Ночная сова', description: 'Учились после полуночи' }
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
    let data;
    
    if (!doc.exists) {
      // Initialize profile
      data = {
        uid, xp: 0, totalExams: 0, passedExams: 0, streak: 0, bestStreak: 0,
        totalLessons: 0, totalQuizzes: 0, totalOrgs: 0, totalPosts: 0,
        badges: [] as string[], orgXpBreakdown: {}, createdAt: new Date().toISOString(),
      };
      await adminDb.collection(COLLECTION).doc(uid).set(data);
    } else {
      data = doc.data()!;
    }

    const badgeDetails = (data.badges || []).map((b: string) => ({ id: b, ...BADGE_DEFS[b] }));

    return ok({
      ...data,
      level: getLevel(data.xp || 0),
      badgeDetails,
      levelDefs: LEVELS,
      allBadgeDefs: BADGE_DEFS, // NEW: send all definitions so frontend doesn't hardcode them
    });
  }

  // POST — award XP / badge
  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const type = body.type || 'exam'; // 'exam', 'lesson', 'quiz', 'org', 'post'
    const { studentId, examPassed, percentage, timeSpentSeconds, organizationId } = body;
    const uid = studentId || user.uid;

    const ref = adminDb.collection(COLLECTION).doc(uid);
    const doc = await ref.get();
    const data = doc.exists ? doc.data()! : { 
      xp: 0, totalExams: 0, passedExams: 0, streak: 0, bestStreak: 0, 
      totalLessons: 0, totalQuizzes: 0, totalOrgs: 0, totalPosts: 0,
      badges: [], orgXpBreakdown: {} 
    };

    let xpEarned = 0;
    const newBadges: string[] = [];

    // Calculate generic XP and stats based on type
    if (type === 'exam') {
      xpEarned = 10;
      if (examPassed) {
        xpEarned += 20;
        xpEarned += Math.floor((percentage || 0) / 10);
        data.passedExams = (data.passedExams || 0) + 1;
        data.streak = (data.streak || 0) + 1;
        if (data.streak > (data.bestStreak || 0)) data.bestStreak = data.streak;
      } else {
        data.streak = 0;
      }
      data.totalExams = (data.totalExams || 0) + 1;
    } else if (type === 'lesson') {
      xpEarned = 5;
      data.totalLessons = (data.totalLessons || 0) + 1;
    } else if (type === 'quiz') {
      xpEarned = 15;
      data.totalQuizzes = (data.totalQuizzes || 0) + 1;
    } else if (type === 'org') {
      xpEarned = 50;
      data.totalOrgs = (data.totalOrgs || 0) + 1;
    } else if (type === 'post') {
      xpEarned = 10;
      data.totalPosts = (data.totalPosts || 0) + 1;
    }

    data.xp = (data.xp || 0) + xpEarned;

    if (organizationId) {
      data.orgXpBreakdown = data.orgXpBreakdown || {};
      data.orgXpBreakdown[organizationId] = (data.orgXpBreakdown[organizationId] || 0) + xpEarned;
    }

    // Check badges
    const badges: string[] = data.badges || [];
    const checkBadge = (id: string, condition: boolean) => {
      if (condition && !badges.includes(id)) { badges.push(id); newBadges.push(id); }
    };

    // Exams
    checkBadge('first_exam', data.totalExams === 1);
    checkBadge('perfect_score', type === 'exam' && percentage === 100);
    checkBadge('streak_3', data.streak >= 3);
    checkBadge('streak_7', data.streak >= 7);
    checkBadge('streak_30', data.streak >= 30);
    checkBadge('speed_demon', type === 'exam' && timeSpentSeconds && timeSpentSeconds < 300 && examPassed);
    checkBadge('ten_exams', data.totalExams >= 10);
    checkBadge('fifty_exams', data.totalExams >= 50);

    // Lessons
    checkBadge('first_lesson', data.totalLessons === 1);
    checkBadge('five_lessons', data.totalLessons >= 5);
    checkBadge('twenty_lessons', data.totalLessons >= 20);

    // Quizzes
    checkBadge('first_quiz', data.totalQuizzes === 1);
    checkBadge('quiz_winner', type === 'quiz' && percentage >= 90);
    checkBadge('five_quizzes', data.totalQuizzes >= 5);

    // Orgs
    checkBadge('joined_org', data.totalOrgs === 1);
    checkBadge('three_orgs', data.totalOrgs >= 3);

    // Posts
    checkBadge('first_post', data.totalPosts === 1);

    // Level & Special
    const currentLevelVal = getLevel(data.xp).level;
    checkBadge('level_5', currentLevelVal >= 5);
    checkBadge('level_10', currentLevelVal >= 10);
    
    // Night Owl (Midnight to 4 AM local server time, approx check)
    const hour = new Date().getHours();
    checkBadge('night_owl', hour >= 0 && hour < 4);

    data.badges = badges;
    await ref.set(data, { merge: true });

    // Write XP event to ledger
    await adminDb.collection('xpEvents').add({
      userId: uid,
      organizationId: organizationId || '',
      type,
      xp: xpEarned,
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
