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
import { verifyAuth, can, ok, unauthorized, forbidden, badRequest, jsonResponse, hasRole, memberHoldsRole, resolveBranchFilter, memberInBranchScope, recordInBranchScope } from './utils/auth';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';
import { getModel, parseJsonLoose, aiAllowed, hasGeminiKey, recordAiUsage } from './utils/ai';
import { computeStudentRisk } from './utils/risk';
import { isDebtBearingPlan, planDebt, isPlanOverdue } from './utils/payment-plans';

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
  // Present only when the caller holds `finance_overview:read`. A cashier
  // (finances CRUD without finance_overview) gets it undefined, so no revenue/
  // profit/expense figure ever reaches the model prompt.
  finance?: { incomeThisMonth: number; incomeLastMonth: number; expenseThisMonth: number; debt: number; overduePlans: number };
  leads: { total: number; newThisMonth: number; resolved: number; bySource: Record<string, number> };
  courses: { title: string; price?: number; format?: string }[];
}

/**
 * Срез организации для аналитика.
 *
 * `branchScope` — результат resolveBranchFilter: null (вся организация), строка
 * (один филиал) или массив филиалов сотрудника. Раньше параметра не было вовсе,
 * и аналитик отвечал по всей академии, пока весь остальной интерфейс показывал
 * выбранный филиал: владелец получал два разных ответа на один вопрос, причём
 * тот, что от AI, выглядел авторитетнее. Филиалуем ровно тем же набором
 * предикатов, что и дашборды, — memberInBranchScope для людей и
 * recordInBranchScope для записей.
 */
async function gatherSnapshot(
  orgId: string,
  includeFinance: boolean,
  branchScope: string | string[] | null,
): Promise<OrgSnapshot> {
  const monthStart = monthStartISO(0);
  const lastMonthStart = monthStartISO(1);

  // The finance collections are read ONLY for callers allowed to see aggregates.
  // Skipping the query (not just hiding the result) is defense in depth: without
  // finance_overview, the money never leaves Firestore, so it can't leak into the prompt.
  const [memberSnap, txSnap, planSnap, leadSnap, attemptSnap, journalSnap, courseSnap] = await Promise.all([
    adminDb.collection('orgMembers').doc(orgId).collection('members').get(),
    includeFinance ? adminDb.collection('financeTransactions').where('organizationId', '==', orgId).get().catch(() => null) : Promise.resolve(null),
    includeFinance ? adminDb.collection('studentPaymentPlans').where('organizationId', '==', orgId).get().catch(() => null) : Promise.resolve(null),
    adminDb.collection('organizations').doc(orgId).collection('aiLeads').get().catch(() => null),
    adminDb.collection('examAttempts').where('organizationId', '==', orgId).get().catch(() => null),
    adminDb.collection('journal').where('organizationId', '==', orgId).get().catch(() => null),
    adminDb.collection('courses').where('organizationId', '==', orgId).get().catch(() => null),
  ]);

  const members = memberSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .filter(m => memberInBranchScope(m.branchIds, branchScope));
  const students = members.filter(m => m.role === 'student' && m.status === 'active');
  const teachers = members.filter(m => m.role === 'teacher' && m.status === 'active').length;
  const newStudents = students.filter(m => (m.joinedAt || m.createdAt) >= monthStart).length;
  // Ученики в срезе — по ним фильтруем оценки и посещаемость: у попыток и
  // журнала своего branchId нет, филиал у них наследуется от ученика.
  const studentIdSet = new Set(students.map(m => m.userId || m.id));

  let finance: OrgSnapshot['finance'];
  if (includeFinance) {
    let incomeThisMonth = 0, incomeLastMonth = 0, expenseThisMonth = 0;
    for (const t of txSnap?.docs || []) {
      const tx = t.data() as any;
      if (!recordInBranchScope(tx.branchId, branchScope)) continue;
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
      if (!recordInBranchScope(plan.branchId, branchScope)) continue;
      // Same debt definition as api-finance-metrics: written-off ('cancelled') and
      // settled plans are excluded, so the AI analyst can't quote a debt figure the
      // owner's own dashboard contradicts.
      if (!isDebtBearingPlan(plan)) continue;
      debt += planDebt(plan);
      // Просрочка по СРОКУ (isPlanOverdue), не по сырому статусу — как в api-finance-metrics.
      if (isPlanOverdue(plan)) overduePlans++;
    }
    finance = { incomeThisMonth, incomeLastMonth, expenseThisMonth, debt, overduePlans };
  }

  const leadDocs = (leadSnap?.docs || []).map(d => d.data() as any);
  const bySource: Record<string, number> = {};
  for (const l of leadDocs) bySource[l.source || 'unknown'] = (bySource[l.source || 'unknown'] || 0) + 1;

  const attempts = (attemptSnap?.docs || []).map(d => d.data() as any)
    .filter(a => studentIdSet.has(a.studentId));
  const avgScore = attempts.length
    ? Math.round(attempts.reduce((a, c) => a + (c.percentage || 0), 0) / attempts.length)
    : null;
  const attemptsThisMonth = attempts.filter(a => (a.createdAt || '') >= monthStart).length;

  const journal = (journalSnap?.docs || []).map(d => d.data() as any)
    .filter(j => studentIdSet.has(j.studentId));
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
    finance,
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
  const lines = [
    `АКТИВНЫЕ УЧЕНИКИ: ${s.students.active} (новых в этом месяце: ${s.students.newThisMonth})`,
    `ПРЕПОДАВАТЕЛИ: ${s.teachers}`,
    `СРЕДНИЙ БАЛЛ ПО ТЕСТАМ: ${pct(s.performance.avgScore)} (попыток в этом месяце: ${s.performance.attemptsThisMonth})`,
    `ПОСЕЩАЕМОСТЬ: ${pct(s.attendance.rateAvg)} (пропусков в этом месяце: ${s.attendance.absencesThisMonth})`,
  ];
  // Finance lines appear only for callers with finance_overview. Otherwise a
  // redaction marker tells the model to decline money questions honestly rather
  // than invent a number — there are no figures in the prompt to leak.
  if (s.finance) {
    lines.push(
      `ФИНАНСЫ: доход за текущий месяц ${Math.round(s.finance.incomeThisMonth)}, за прошлый месяц ${Math.round(s.finance.incomeLastMonth)}, расходы текущего месяца ${Math.round(s.finance.expenseThisMonth)}`,
      `ДОЛГИ: ${Math.round(s.finance.debt)} (просроченных планов оплаты: ${s.finance.overduePlans})`,
    );
  } else {
    lines.push('ФИНАНСЫ: скрыто — у пользователя нет доступа к финансовой сводке (выручка, прибыль, расходы, долги недоступны). На вопросы о деньгах ответь, что доступа к финансам нет.');
  }
  lines.push(
    `ЗАЯВКИ (лиды): всего ${s.leads.total}, новых в этом месяце ${s.leads.newThisMonth}, закрыто ${s.leads.resolved}, по источникам ${JSON.stringify(s.leads.bySource)}`,
    `КУРСЫ (${s.courses.length}): ${s.courses.map(c => c.title + (c.price ? ` — ${c.price}` : '')).join('; ') || 'нет'}`,
  );
  return lines.join('\n');
}

// ── Churn: per-student risk over the org roster (formula in utils/risk.ts) ──
async function computeRisk(orgId: string, branchScope: string | string[] | null) {
  const memberSnap = await adminDb.collection('orgMembers').doc(orgId).collection('members')
    .where('status', '==', 'active').get();
  if (memberSnap.empty) return [];

  const memberByUid = new Map<string, any>();
  memberSnap.docs.forEach(d => {
    const data = d.data();
    if (!memberHoldsRole(data, ['student'])) return;
    // Тот же филиальный предикат, что в api-risk: анализ оттока по выбранному
    // филиалу обязан говорить о тех же людях, что и список учеников.
    if (!memberInBranchScope(data.branchIds, branchScope)) return;
    memberByUid.set(data.userId || d.id, data);
  });
  if (memberByUid.size === 0) return [];
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

  const nowMs = Date.now();
  return studentIds.map(uid => {
    const profile = usersMap.get(uid) || {};
    const member = memberByUid.get(uid) || {};
    const r = computeStudentRisk({
      enrolledAt: member.joinedAt || member.createdAt || profile.createdAt,
      attempts: attemptsByStudent.get(uid) || [],
      journal: journalByStudent.get(uid) || [],
      nowMs,
    });

    return {
      studentId: uid,
      studentName: profile.displayName || member.userName || 'Ученик',
      riskLevel: r.riskLevel,
      averageScore: r.examsTaken > 0 ? r.averageScore : null,
      attendanceRate: r.attendanceRate,
      daysSinceLastActive: r.daysSinceLastActive,
      examsTaken: r.examsTaken,
      reasons: r.reasons,
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

  // Филиал приходит явным параметром: это POST, и авто-штамп на записи в
  // src/lib/api.ts намеренно не работает. Разрешаем его так же, как читающие
  // эндпоинты, — сотрудник не может запросить чужой филиал.
  const branchScope = resolveBranchFilter(user, event.queryStringParameters?.branchId);
  if (branchScope === '__DENIED__') return forbidden('Access denied to requested branch');

  try {
    if (action === 'ask') {
      const { question } = JSON.parse(event.body || '{}');
      if (!question || !String(question).trim()) return badRequest('question required');

      // High-level finance figures (выручка/прибыль/расходы/долги) are gated by
      // finance_overview, not the role check above — otherwise a «Кассир» (manager
      // base role, finances CRUD, no finance_overview) could read revenue/profit here
      // even though every direct finance surface hides it. can() passes admins/owners.
      const canSeeFinance = can(user, 'finance_overview', 'read');
      const snapshot = await gatherSnapshot(orgId, canSeeFinance, branchScope);
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
      const all = await computeRisk(orgId, branchScope);
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
