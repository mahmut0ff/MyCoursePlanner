/**
 * Student risk — the single source of truth.
 *
 * This formula used to live in four places (api-risk, api-dashboard,
 * api-ai-insights, risk-alerts) and they had already drifted apart: the
 * dashboard tile still counted freshly-added students as churn risk long after
 * api-risk stopped doing so, so the two screens showed different numbers for
 * the same question. Anything that needs a risk level imports from here.
 *
 * Two deliberate rules:
 *
 *  1. **Engagement risk requires prior engagement.** A student who has never
 *     taken an exam and has never been marked present hasn't started yet —
 *     there is nothing to churn from. Enrollment/account creation is NOT
 *     activity, and an absence is not activity either.
 *
 *  2. **Debt is not churn.** An overdue payment plan is a real problem, but a
 *     financial one — it's the bookkeeper's job, not the curator's. It travels
 *     as its own `hasOverduePayment` flag and gets its own badge in the UI
 *     instead of being folded into the engagement level, where it used to
 *     drown the actual churn signal (an imported debtor who never attended a
 *     lesson would show up as "critical churn risk").
 */

export type RiskLevel = 'low' | 'medium' | 'high';
export type ScoreTrend = 'up' | 'down' | 'flat';

/** Thresholds, named so the numbers aren't scattered as magic constants. */
export const RISK_THRESHOLDS = {
  inactiveDaysHigh: 7,
  inactiveDaysMedium: 4,
  scoreHigh: 50,
  scoreMedium: 70,
  attendanceHigh: 50,
  attendanceMedium: 80,
  /** A trend needs this many attempts before it means anything. */
  trendMinAttempts: 4,
  /** Percentage-point swing between the earlier and the last 3 attempts. */
  trendDelta: 10,
} as const;

export interface RiskSignals {
  /** When the student joined THIS org — not when their account was created. */
  enrolledAt?: string | Date | null;
  /** `examAttempts` docs for this student. */
  attempts: any[];
  /** `journal` docs for this student. */
  journal: any[];
  hasOverduePayment?: boolean;
  /** Injectable for tests; defaults to now. */
  nowMs?: number;
}

export interface RiskResult {
  riskLevel: RiskLevel;
  /** Human-readable engagement reasons. Debt is NOT in here — see the header. */
  reasons: string[];
  averageScore: number;
  examsTaken: number;
  attendanceRate: number;
  daysSinceLastActive: number;
  daysSinceEnrolled: number;
  /** False = never started. Drives the "—" placeholders in the UI. */
  hasActivity: boolean;
  scoreTrend: ScoreTrend;
  hasOverduePayment: boolean;
  missedLessons: number;
}

const DAY_MS = 86400000;

const toMs = (v: any): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * Pure risk computation for one student. Callers that already hold the org's
 * attempts/journal/overdue data (api-dashboard) feed it directly rather than
 * re-reading Firestore.
 */
export function computeStudentRisk(signals: RiskSignals): RiskResult {
  const { attempts = [], journal = [], hasOverduePayment = false } = signals;
  const nowMs = signals.nowMs ?? Date.now();

  const examsTaken = attempts.length;
  const hasScores = examsTaken > 0;
  const averageScore = hasScores
    ? Math.round(attempts.reduce((acc, a) => acc + (a.percentage || 0), 0) / examsTaken)
    : 0;

  const missedLessons = journal.filter(j => j.attendance === 'absent').length;
  const attendanceRate = journal.length
    ? Math.round(((journal.length - missedLessons) / journal.length) * 100)
    : 100;

  // Has the student ever actually engaged? An exam attempt, or an attendance
  // record that isn't an absence. Being marked absent is not engagement.
  const attendedCount = journal.filter(j => j.attendance && j.attendance !== 'absent').length;
  const hasActivity = examsTaken > 0 || attendedCount > 0;

  // Latest *real* activity: newest exam, or newest day actually present.
  let lastActiveMs: number | null = null;
  for (const a of attempts) {
    const t = toMs(a.submittedAt || a.createdAt);
    if (t !== null && (lastActiveMs === null || t > lastActiveMs)) lastActiveMs = t;
  }
  for (const j of journal) {
    if (j.attendance === 'absent') continue;
    const t = toMs(j.date);
    if (t !== null && (lastActiveMs === null || t > lastActiveMs)) lastActiveMs = t;
  }

  const enrolledMs = toMs(signals.enrolledAt) ?? nowMs;
  const daysSinceEnrolled = Math.max(0, Math.floor((nowMs - enrolledMs) / DAY_MS));
  // For a never-engaged student "last active" degrades to "how long ago they
  // were added" — display only; it can't raise the risk level (see hasActivity).
  const daysSinceLastActive = lastActiveMs !== null
    ? Math.max(0, Math.floor((nowMs - lastActiveMs) / DAY_MS))
    : daysSinceEnrolled;

  // Are the most recent results trending down?
  let scoreTrend: ScoreTrend = 'flat';
  if (examsTaken >= RISK_THRESHOLDS.trendMinAttempts) {
    const sorted = [...attempts].sort(
      (a, b) => (toMs(a.submittedAt || a.createdAt) ?? 0) - (toMs(b.submittedAt || b.createdAt) ?? 0),
    );
    const avgOf = (arr: any[]) => arr.reduce((s, x) => s + (x.percentage || 0), 0) / arr.length;
    const recentAvg = avgOf(sorted.slice(-3));
    const earlierAvg = avgOf(sorted.slice(0, -3));
    if (recentAvg <= earlierAvg - RISK_THRESHOLDS.trendDelta) scoreTrend = 'down';
    else if (recentAvg >= earlierAvg + RISK_THRESHOLDS.trendDelta) scoreTrend = 'up';
  }

  const lowScoreHigh = hasScores && averageScore < RISK_THRESHOLDS.scoreHigh;
  const lowScoreMedium = hasScores && averageScore < RISK_THRESHOLDS.scoreMedium;

  const reasons: string[] = [];
  let riskLevel: RiskLevel = 'low';

  if (hasActivity) {
    // Reasons are collected at the *medium* threshold so one list serves both
    // levels — a high-risk student trips the medium bound too, by definition.
    if (daysSinceLastActive > RISK_THRESHOLDS.inactiveDaysMedium) reasons.push(`не был(а) ${daysSinceLastActive} дн.`);
    if (attendanceRate < RISK_THRESHOLDS.attendanceMedium) reasons.push(`посещаемость ${attendanceRate}%`);
    if (lowScoreMedium) reasons.push(`средний балл ${averageScore}%`);
    if (scoreTrend === 'down') reasons.push('оценки падают');

    if (
      daysSinceLastActive > RISK_THRESHOLDS.inactiveDaysHigh ||
      lowScoreHigh ||
      attendanceRate < RISK_THRESHOLDS.attendanceHigh
    ) {
      riskLevel = 'high';
    } else if (reasons.length > 0) {
      riskLevel = 'medium';
    }
  }

  return {
    riskLevel,
    reasons,
    averageScore,
    examsTaken,
    attendanceRate,
    daysSinceLastActive,
    daysSinceEnrolled,
    hasActivity,
    scoreTrend,
    hasOverduePayment,
    missedLessons,
  };
}

/** True when the student needs *someone's* attention — churn OR money. */
export const needsAttention = (r: Pick<RiskResult, 'riskLevel' | 'hasOverduePayment'>) =>
  r.riskLevel !== 'low' || r.hasOverduePayment;
