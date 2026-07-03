/**
 * API: AI Insights — owner-facing "talk to your data" analyst + AI churn analysis.
 *
 * POST ?action=ask    { question }          → natural-language answer over org metrics
 * POST ?action=churn  { limit? }            → AI churn risk per at-risk student (reason + action)
 *
 * Reads are aggregated server-side from the same collections the dashboards use,
 * scoped strictly to the caller's organization. Admin / manager only.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb, getDocsByIds } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, forbidden, badRequest, jsonResponse, hasRole } from './utils/auth';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';
import { getModel, parseJsonLoose, aiAllowed, hasGeminiKey, recordAiUsage } from './utils/ai';

function monthStartISO(offset = 0): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - offset);
  return d.toISOString();
}

interface OrgSnapshot {
  students: { active: number; newThisMonth: number };
  teachers: number;
  performance: { avgScore: number | null; attemptsThisMonth: number };
  attendance: { rateAvg: number | null; absencesThisMonth: number };
  finance: { incomeThisMonth: number; incomeLastMonth: number; expenseThisMonth: number; debt: number; overduePlans: number };
  leads: { total: number; newThisMonth: number; resolved: number; bySource: Record<string, number> };
  courses: { title: string; price?: number; format?: string }[];
}

async function gatherSnapshot(orgId: string): Promise<OrgSnapshot> {
  const monthStart = monthStartISO(0);
  const lastMonthStart = monthStartISO(1);

  const [memberSnap, txSnap, planSnap, leadSnap, attemptSnap, journalSnap, courseSnap] = await Promise.all([
    adminDb.collection('orgMembers').doc(orgId).collection('members').get(),
    adminDb.collection('financeTransactions').where('organizationId', '==', orgId).get().catch(() => null),
    adminDb.collection('studentPaymentPlans').where('organizationId', '==', orgId).get().catch(() => null),
    adminDb.collection('organizations').doc(orgId).collection('aiLeads').get().catch(() => null),
    adminDb.collection('examAttempts').where('organizationId', '==', orgId).get().catch(() => null),
    adminDb.collection('journal').where('organizationId', '==', orgId).get().catch(() => null),
    adminDb.collection('courses').where('organizationId', '==', orgId).get().catch(() => null),
  ]);

  const members = memberSnap.docs.map(d => d.data() as any);
  const students = members.filter(m => m.role === 'student' && m.status === 'active');
  const teachers = members.filter(m => m.role === 'teacher' && m.status === 'active').length;
  const newStudents = students.filter(m => (m.joinedAt || m.createdAt) >= monthStart).length;

  let incomeThisMonth = 0, incomeLastMonth = 0, expenseThisMonth = 0;
  for (const t of txSnap?.docs || []) {
    const tx = t.data() as any;
    const when = tx.date || tx.createdAt || '';
    const amount = Number(tx.amount || 0);
    if (tx.type === 'income') {
      if (when >= monthStart) incomeThisMonth += amount;
      else if (when >= lastMonthStart && when < monthStart) incomeLastMonth += amount;
    } else if (tx.type === 'expense' && when >= monthStart) {
      expenseThisMonth += amount;
    }
  }

  let debt = 0, overduePlans = 0;
  for (const p of planSnap?.docs || []) {
    const plan = p.data() as any;
    if (plan.status === 'paid') continue;
    debt += Math.max(0, (plan.totalAmount || 0) - (plan.paidAmount || 0));
    if (plan.status === 'overdue') overduePlans++;
  }

  const leadDocs = (leadSnap?.docs || []).map(d => d.data() as any);
  const bySource: Record<string, number> = {};
  for (const l of leadDocs) bySource[l.source || 'unknown'] = (bySource[l.source || 'unknown'] || 0) + 1;

  const attempts = (attemptSnap?.docs || []).map(d => d.data() as any);
  const avgScore = attempts.length
    ? Math.round(attempts.reduce((a, c) => a + (c.percentage || 0), 0) / attempts.length)
    : null;
  const attemptsThisMonth = attempts.filter(a => (a.createdAt || '') >= monthStart).length;

  const journal = (journalSnap?.docs || []).map(d => d.data() as any);
  const absences = journal.filter(j => j.attendance === 'absent');
  const rateAvg = journal.length
    ? Math.round(((journal.length - absences.length) / journal.length) * 100)
    : null;
  const absencesThisMonth = absences.filter(j => (j.date || '') >= monthStart).length;

  const courses = (courseSnap?.docs || []).slice(0, 40).map(d => {
    const c = d.data() as any;
    return { title: c.title || c.name || 'Курс', price: c.price, format: c.format };
  });

  return {
    students: { active: students.length, newThisMonth: newStudents },
    teachers,
    performance: { avgScore, attemptsThisMonth },
    attendance: { rateAvg, absencesThisMonth },
    finance: { incomeThisMonth, incomeLastMonth, expenseThisMonth, debt, overduePlans },
    leads: {
      total: leadDocs.length,
      newThisMonth: leadDocs.filter(l => (l.createdAt || '') >= monthStart).length,
      resolved: leadDocs.filter(l => l.status === 'resolved').length,
      bySource,
    },
    courses,
  };
}

function snapshotToText(s: OrgSnapshot): string {
  const pct = (n: number | null) => (n === null ? 'нет данных' : `${n}%`);
  return [
    `АКТИВНЫЕ УЧЕНИКИ: ${s.students.active} (новых в этом месяце: ${s.students.newThisMonth})`,
    `ПРЕПОДАВАТЕЛИ: ${s.teachers}`,
    `СРЕДНИЙ БАЛЛ ПО ТЕСТАМ: ${pct(s.performance.avgScore)} (попыток в этом месяце: ${s.performance.attemptsThisMonth})`,
    `ПОСЕЩАЕМОСТЬ: ${pct(s.attendance.rateAvg)} (пропусков в этом месяце: ${s.attendance.absencesThisMonth})`,
    `ФИНАНСЫ: доход за текущий месяц ${Math.round(s.finance.incomeThisMonth)}, за прошлый месяц ${Math.round(s.finance.incomeLastMonth)}, расходы текущего месяца ${Math.round(s.finance.expenseThisMonth)}`,
    `ДОЛГИ: ${Math.round(s.finance.debt)} (просроченных планов оплаты: ${s.finance.overduePlans})`,
    `ЗАЯВКИ (лиды): всего ${s.leads.total}, новых в этом месяце ${s.leads.newThisMonth}, закрыто ${s.leads.resolved}, по источникам ${JSON.stringify(s.leads.bySource)}`,
    `КУРСЫ (${s.courses.length}): ${s.courses.map(c => c.title + (c.price ? ` — ${c.price}` : '')).join('; ') || 'нет'}`,
  ].join('\n');
}

// ── Churn: lightweight per-student risk computation (mirrors api-risk) ──
async function computeRisk(orgId: string) {
  const memberSnap = await adminDb.collection('orgMembers').doc(orgId).collection('members')
    .where('role', '==', 'student').where('status', '==', 'active').get();
  if (memberSnap.empty) return [];

  const memberByUid = new Map<string, any>();
  memberSnap.docs.forEach(d => { const data = d.data(); memberByUid.set(data.userId || d.id, data); });
  const studentIds = Array.from(memberByUid.keys());

  const usersMap = new Map<string, any>(Object.entries(await getDocsByIds('users', studentIds)));

  const attemptsSnap = await adminDb.collection('examAttempts').where('organizationId', '==', orgId).get();
  const attemptsByStudent = new Map<string, any[]>();
  attemptsSnap.docs.forEach(doc => {
    const data = doc.data();
    if (!attemptsByStudent.has(data.studentId)) attemptsByStudent.set(data.studentId, []);
    attemptsByStudent.get(data.studentId)!.push(data);
  });

  const journalSnap = await adminDb.collection('journal').where('organizationId', '==', orgId).get();
  const journalByStudent = new Map<string, any[]>();
  journalSnap.docs.forEach(doc => {
    const data = doc.data();
    if (!journalByStudent.has(data.studentId)) journalByStudent.set(data.studentId, []);
    journalByStudent.get(data.studentId)!.push(data);
  });

  const now = Date.now();
  return studentIds.map(uid => {
    const profile = usersMap.get(uid) || {};
    const member = memberByUid.get(uid) || {};
    const sAttempts = attemptsByStudent.get(uid) || [];
    const sJournal = journalByStudent.get(uid) || [];

    const hasScores = sAttempts.length > 0;
    const avgScore = hasScores ? Math.round(sAttempts.reduce((a, c) => a + (c.percentage || 0), 0) / sAttempts.length) : 0;
    const missed = sJournal.filter(j => j.attendance === 'absent').length;
    const attendanceRate = sJournal.length ? Math.round(((sJournal.length - missed) / sJournal.length) * 100) : 100;

    // Only students who actually started (took an exam or showed up at least once)
    // can be a churn risk — a just-added student with no history is not "inactive".
    const attendedCount = sJournal.filter(j => j.attendance && j.attendance !== 'absent').length;
    const everEngaged = sAttempts.length > 0 || attendedCount > 0;

    // Days since last *real* activity — never account/enrollment creation, which
    // would make freshly-added students look inactive for weeks.
    const dates: Date[] = [];
    sAttempts.forEach(a => { const d = a.submittedAt || a.createdAt; if (d) dates.push(new Date(d)); });
    sJournal.forEach(j => { if (j.date && j.attendance !== 'absent') dates.push(new Date(j.date)); });
    dates.sort((a, b) => b.getTime() - a.getTime());
    const enrolledAt = new Date(member.joinedAt || member.createdAt || profile.createdAt || now);
    const daysSinceLastActive = dates.length > 0
      ? Math.floor((now - dates[0].getTime()) / 86400000)
      : Math.max(0, Math.floor((now - enrolledAt.getTime()) / 86400000));

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (everEngaged && (daysSinceLastActive > 7 || (hasScores && avgScore < 50) || attendanceRate < 50)) riskLevel = 'high';
    else if (everEngaged && (daysSinceLastActive > 4 || (hasScores && avgScore < 70) || attendanceRate < 80)) riskLevel = 'medium';

    return {
      studentId: uid,
      studentName: profile.displayName || member.userName || 'Ученик',
      riskLevel,
      averageScore: hasScores ? avgScore : null,
      attendanceRate,
      daysSinceLastActive,
      examsTaken: sAttempts.length,
    };
  });
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!hasRole(user, 'admin', 'manager', 'super_admin')) return forbidden('Only owners and managers can use AI insights');
  if (!aiAllowed(user)) return forbidden('AI is not available on your plan');
  if (!user.organizationId) return badRequest('No organization context');
  if (!hasGeminiKey()) return jsonResponse(500, { error: 'GEMINI_API_KEY is not configured on the server.' });

  if (rateLimiters.ai.isLimited(getRateLimitKey(event, user.uid))) {
    return jsonResponse(429, { error: 'Слишком много запросов. Подождите немного.' });
  }

  const action = event.queryStringParameters?.action || 'ask';
  const orgId = user.organizationId;

  try {
    if (action === 'ask') {
      const { question } = JSON.parse(event.body || '{}');
      if (!question || !String(question).trim()) return badRequest('question required');

      const snapshot = await gatherSnapshot(orgId);
      const model = getModel({ json: true });
      const prompt = `Ты — AI бизнес-аналитик учебного центра. Отвечай ТОЛЬКО на основе приведённых данных. Если данных для ответа недостаточно — честно скажи об этом и предложи, что отслеживать. Отвечай на русском, кратко и по делу, с конкретными цифрами. Не выдумывай.

ДАННЫЕ ОРГАНИЗАЦИИ:
${snapshotToText(snapshot)}

ВОПРОС ВЛАДЕЛЬЦА: ${String(question).trim()}

Верни строго JSON: { "answer": string (2-5 предложений), "highlights": [{ "label": string, "value": string }] (0-4 ключевых числа, релевантных вопросу) }`;

      const result = await model.generateContent(prompt);
      const data = parseJsonLoose(result.response.text());
      recordAiUsage(orgId, 'insights_ask');
      return ok({ data });
    }

    if (action === 'churn') {
      const { limit } = JSON.parse(event.body || '{}');
      const all = await computeRisk(orgId);
      const atRisk = all.filter(s => s.riskLevel !== 'low')
        .sort((a, b) => (a.riskLevel === 'high' ? 0 : 1) - (b.riskLevel === 'high' ? 0 : 1) || b.daysSinceLastActive - a.daysSinceLastActive)
        .slice(0, Math.min(Number(limit) || 12, 20));

      if (atRisk.length === 0) {
        recordAiUsage(orgId, 'insights_churn');
        return ok({ data: { students: [], summary: 'Учеников в зоне риска не обнаружено — отличная работа по удержанию.' } });
      }

      const model = getModel({ json: true });
      const prompt = `Ты — эксперт по удержанию учеников в учебном центре. Для каждого ученика из списка оцени риск оттока и дай КОНКРЕТНУЮ причину и одно рекомендованное действие для менеджера. Отвечай на русском.

УЧЕНИКИ В ЗОНЕ РИСКА (JSON):
${JSON.stringify(atRisk)}

Поля: averageScore — средний балл по тестам (% или null), attendanceRate — посещаемость %, daysSinceLastActive — дней без активности, examsTaken — сколько тестов сдал.

Верни строго JSON: {
  "summary": string (1-2 предложения — общий вывод по группе риска),
  "students": [{ "studentId": string, "studentName": string, "churnProbability": number (0-100), "reason": string (краткая причина риска), "action": string (одно конкретное действие — позвонить/предложить паузу/разобрать тему и т.п.) }]
}
Используй те же studentId и studentName, что во входных данных.`;

      const result = await model.generateContent(prompt);
      const data = parseJsonLoose(result.response.text());
      recordAiUsage(orgId, 'insights_churn');
      return ok({ data });
    }

    if (action === 'schedule') {
      const { events } = JSON.parse(event.body || '{}');
      if (!Array.isArray(events) || events.length === 0) {
        return ok({ data: { summary: 'Расписание пустое — добавьте занятия, чтобы получить анализ.', issues: [] } });
      }
      const compact = events.slice(0, 200).map((e: any) => ({
        title: e.title, type: e.type, day: e.day, start: e.startTime, end: e.endTime,
        group: e.group || null, room: e.location || null,
      }));
      const model = getModel({ json: true });
      const prompt = `Ты — методист, который проверяет недельное расписание учебного центра. Найди проблемы и дай практичные рекомендации. Отвечай на русском.

Ищи: накладки (одна группа/кабинет/преподаватель в одно время в разных занятиях), перегруженные дни, большие «окна» между занятиями одной группы, неравномерное распределение по дням, поздние/слишком ранние слоты.

РАСПИСАНИЕ (JSON, day — день недели):
${JSON.stringify(compact)}

Верни строго JSON: {
  "summary": string (1-2 предложения — общая оценка),
  "issues": [{ "type": "conflict" | "overload" | "gap" | "balance" | "other", "detail": string (в чём проблема, с указанием дня/времени/группы), "suggestion": string (что сделать) }]
}
Если проблем нет — верни пустой массив issues и похвали в summary.`;
      const result = await model.generateContent(prompt);
      const data = parseJsonLoose(result.response.text());
      recordAiUsage(orgId, 'insights_schedule');
      return ok({ data });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('AI Insights error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};
