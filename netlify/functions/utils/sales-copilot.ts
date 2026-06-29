/**
 * Per-org SALES bot — the customer-facing AI for a center's OWN Telegram bot
 * (the "CUSTOM ORG AI BOT" branch in api-telegram-webhook.ts). It greets visitors,
 * answers questions from the org's knowledge base, and now DOES things via Gemini
 * function-calling, executed through the Admin SDK (same proven pattern as the
 * staff copilot, utils/copilot-actions.ts):
 *
 *   - addLeadToDatabase(name, phone, reason)        → capture a generic lead
 *   - find_nearest_group(courseQuery)               → answer "когда ближайшая
 *       группа по английскому и сколько стоит" from REAL `groups` + `scheduleEvents`
 *   - book_trial(name, phone, courseQuery, time?)   → create a trial-tagged aiLead,
 *       notify staff, and confirm to the visitor
 *
 * Schedule resolution mirrors lesson-reminders.ts: recurring events carry
 * `recurring:true` + `dayOfWeek` (0=Mon..6=Sun); dated events carry `date:YYYY-MM-DD`;
 * the time lives in `startTime` ("HH:MM"). `resolveNextSession` is a pure helper so
 * the day/time maths is unit-tested without Firestore.
 *
 * Unlike the staff copilot (deterministic confirmations), the sales bot is
 * conversational: after a tool runs we send the result back to Gemini for a natural,
 * on-brand reply. Model calls go through `generateWithFallback` so a retired-model
 * 404 self-heals instead of replying with a tech error.
 */
import { SchemaType } from '@google/generative-ai';
import { adminDb } from './firebase-admin';
import { generateWithFallback, hasGeminiKey, recordAiUsage } from './ai';
import { notifyOrgAdmins } from './notifications';
import { toTelegramHtml } from './director-copilot';

/** Project convention: 0=Mon .. 6=Sun (see lesson-reminders.ts). */
export const WEEKDAYS_RU = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

export interface SalesMessage { role: 'user' | 'assistant'; content: string }

/** Minimal shape of a `scheduleEvents` doc that the resolver needs. */
export interface ScheduleEventLite {
  recurring?: boolean | null;
  dayOfWeek?: number | null;   // 0=Mon..6=Sun, set when recurring
  date?: string | null;        // 'YYYY-MM-DD', set when dated (one-off)
  startTime?: string | null;   // 'HH:MM'
  title?: string | null;
  groupId?: string | null;
  groupName?: string | null;
}

export interface GroupLite { id: string; name: string; courseId?: string | null; courseName?: string | null }
export interface CourseLite { id: string; title: string; price?: number | string | null; description?: string | null }

/** The next upcoming occurrence of a session, resolved to a real calendar date. */
export interface NextSession {
  date: string;          // 'YYYY-MM-DD'
  startTime: string;     // 'HH:MM'
  weekday: number;       // 0=Mon..6=Sun
  weekdayLabel: string;  // RU weekday, e.g. 'понедельник'
  title?: string;
  groupName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested without Firestore/Gemini)
// ─────────────────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** Project weekday for a JS Date: JS getDay() is 0=Sun..6=Sat, ours is 0=Mon..6=Sun. */
const ourWeekday = (d: Date) => (d.getDay() + 6) % 7;

/** Parse "HH:MM" → [h, m], or null if it isn't a usable time. */
function parseTime(raw: string | null | undefined): [number, number] | null {
  const s = (raw || '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return [h, min];
}

/** Next calendar date (≥ now) on which a weekly `dayOfWeek` session at h:m occurs. */
function nextRecurringDate(now: Date, dayOfWeek: number, h: number, m: number): Date {
  let daysAhead = (dayOfWeek - ourWeekday(now) + 7) % 7;
  if (daysAhead === 0) {
    // It's today — only keep it if the start time hasn't already passed.
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    if (todayStart.getTime() < now.getTime()) daysAhead = 7;
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, h, m, 0, 0);
}

/**
 * Resolve the SOONEST upcoming session from a mix of recurring + dated events,
 * relative to `now`. Recurring events recur weekly on `dayOfWeek`; dated events
 * fire once on `date`. Past dated events and events without a usable `startTime`
 * are skipped. Returns null if nothing is upcoming. Pure — `now` is injected so
 * the day/time arithmetic is deterministic under test.
 */
export function resolveNextSession(events: ScheduleEventLite[], now: Date): NextSession | null {
  let best: { when: number; ev: ScheduleEventLite; occ: Date } | null = null;

  for (const ev of events || []) {
    const time = parseTime(ev.startTime);
    if (!time) continue;
    const [h, m] = time;

    let occ: Date | null = null;
    if (ev.recurring && typeof ev.dayOfWeek === 'number') {
      occ = nextRecurringDate(now, ev.dayOfWeek, h, m);
    } else if (ev.date && /^\d{4}-\d{2}-\d{2}$/.test(ev.date)) {
      const [y, mo, d] = ev.date.split('-').map(Number);
      const cand = new Date(y, mo - 1, d, h, m, 0, 0);
      if (cand.getTime() >= now.getTime()) occ = cand;
    }
    if (!occ) continue;

    const when = occ.getTime();
    if (!best || when < best.when) best = { when, ev, occ };
  }

  if (!best) return null;
  const weekday = ourWeekday(best.occ);
  return {
    date: fmtDate(best.occ),
    startTime: (best.ev.startTime || '').trim(),
    weekday,
    weekdayLabel: WEEKDAYS_RU[weekday],
    title: best.ev.title || undefined,
    groupName: best.ev.groupName || undefined,
  };
}

/** Normalize free text for fuzzy matching: lowercase, strip punctuation, collapse spaces. */
function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** a/b match if one contains the other or they share a ≥3-char word. */
function fuzzy(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(' ').filter(t => t.length >= 3));
  return b.split(' ').filter(t => t.length >= 3).some(t => aTokens.has(t));
}

/**
 * Pick the groups relevant to a free-text course query — by group name, by the
 * group's course name, or by a matching course title (via courseId). An empty
 * query returns every group (so the bot can list what's on offer). Pure.
 */
export function selectGroupsForQuery(query: string, groups: GroupLite[], courses: CourseLite[]): GroupLite[] {
  const q = norm(query);
  if (!q) return (groups || []).slice();
  const matchedCourseIds = new Set(
    (courses || []).filter(c => fuzzy(norm(c.title || ''), q)).map(c => c.id),
  );
  return (groups || []).filter(g =>
    fuzzy(norm(g.name || ''), q) ||
    fuzzy(norm(g.courseName || ''), q) ||
    (!!g.courseId && matchedCourseIds.has(g.courseId)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Org context (courses + branches + groups + schedule)
// ─────────────────────────────────────────────────────────────────────────────

interface SalesContext {
  courses: CourseLite[];
  publishedCourses: CourseLite[];
  branches: { name: string; address?: string; phone?: string }[];
  groups: GroupLite[];
  events: ScheduleEventLite[];
  eventsByGroup: Map<string, ScheduleEventLite[]>;
  courseById: Map<string, CourseLite>;
}

async function buildSalesContext(orgId: string): Promise<SalesContext> {
  // All org-scoped, single-equality reads — no composite index required.
  const [coursesSnap, branchesSnap, groupsSnap, eventsSnap] = await Promise.all([
    adminDb.collection('courses').where('organizationId', '==', orgId).get(),
    adminDb.collection('branches').where('organizationId', '==', orgId).get(),
    adminDb.collection('groups').where('organizationId', '==', orgId).get(),
    adminDb.collection('scheduleEvents').where('organizationId', '==', orgId).get(),
  ]);

  const courses: (CourseLite & { status?: string })[] = coursesSnap.docs.map(d => {
    const c = d.data() as any;
    return { id: d.id, title: c.title || '', price: c.price ?? null, description: c.description || '', status: c.status };
  });
  const publishedCourses = courses.filter(c => c.status === 'published');

  const branches = branchesSnap.docs.map(d => {
    const b = d.data() as any;
    return { name: b.name || '', address: b.address || '', phone: b.phone || '' };
  });

  const groups: GroupLite[] = groupsSnap.docs.map(d => {
    const g = d.data() as any;
    return { id: d.id, name: g.name || 'Группа', courseId: g.courseId || null, courseName: g.courseName || '' };
  });

  const events: ScheduleEventLite[] = eventsSnap.docs.map(d => {
    const e = d.data() as any;
    return {
      recurring: e.recurring ?? null, dayOfWeek: e.dayOfWeek ?? null, date: e.date ?? null,
      startTime: e.startTime ?? null, title: e.title ?? null,
      groupId: e.groupId ?? null, groupName: e.groupName ?? null,
    };
  });

  const eventsByGroup = new Map<string, ScheduleEventLite[]>();
  for (const ev of events) {
    if (!ev.groupId) continue;
    const list = eventsByGroup.get(ev.groupId) || [];
    list.push(ev);
    eventsByGroup.set(ev.groupId, list);
  }
  const courseById = new Map(courses.map(c => [c.id, c]));

  return { courses, publishedCourses, branches, groups, events, eventsByGroup, courseById };
}

// ─────────────────────────────────────────────────────────────────────────────
// Function declarations
// ─────────────────────────────────────────────────────────────────────────────

function buildFunctionDeclarations(): any[] {
  return [
    {
      name: 'addLeadToDatabase',
      description: 'Сохранить заявку/контакт клиента в CRM. Вызывай, когда клиент согласился на встречу/запись/звонок И назвал ИМЯ и ТЕЛЕФОН, но это НЕ запись на конкретный пробный урок (для пробного используй book_trial).',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: 'Имя клиента как он его назвал.' },
          phone: { type: SchemaType.STRING, description: 'Телефон клиента как он его назвал.' },
          reason: { type: SchemaType.STRING, description: 'Цель/комментарий, например «Запись на программирование», «Консультация».' },
        },
        required: ['name', 'phone'],
      },
    },
    {
      name: 'find_nearest_group',
      description: 'Узнать из РЕАЛЬНОГО расписания центра, когда ближайшее занятие подходящей группы и сколько стоит курс. Вызывай на вопросы вроде «когда ближайшая группа по английскому?», «какое расписание у программирования?», «во сколько занятия?», «сколько стоит курс X?». Передавай в courseQuery то, что назвал клиент (название курса/направления/группы). Не выдумывай дни, время и цены — бери их только из ответа этой функции.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          courseQuery: { type: SchemaType.STRING, description: 'Курс/направление/группа, о которых спрашивает клиент, например «английский», «programming», «IELTS». Можно пустую строку, чтобы получить все группы.' },
        },
        required: ['courseQuery'],
      },
    },
    {
      name: 'book_trial',
      description: 'Записать клиента на ПРОБНЫЙ урок. Вызывай, когда клиент согласился прийти на пробное занятие И назвал ИМЯ и ТЕЛЕФОН. Укажи курс/направление в courseQuery и желаемое время, если клиент его назвал.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: 'Имя клиента.' },
          phone: { type: SchemaType.STRING, description: 'Телефон клиента (с кодом страны, если назвал).' },
          courseQuery: { type: SchemaType.STRING, description: 'Курс/направление для пробного урока, как назвал клиент.' },
          preferredTime: { type: SchemaType.STRING, description: 'Желаемый день/время, если клиент его назвал, например «суббота утром», «после 18:00».' },
        },
        required: ['name', 'phone'],
      },
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// System instruction
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemInstruction(org: any, settings: any, ctx: SalesContext, isFirstMessage: boolean): string {
  const courseLines = ctx.publishedCourses.map(c => `- ${c.title}${c.price ? ` (Цена: ${c.price})` : ''}: ${c.description || ''}`);
  const branchLines = ctx.branches.map(b => `- ${b.name}: ${b.address || ''} ${b.phone ? `(${b.phone})` : ''}`);
  const groupNames = ctx.groups.map(g => g.name).filter(Boolean).slice(0, 40);
  const greeting = settings?.greetingMessage || 'Здравствуйте! Чем я могу вам помочь?';

  return `You are the friendly, proactive, and highly professional sales manager and consultant for "${org?.name || 'this educational organization'}".

YOUR DIRECTIVES (CRITICAL):
1. ACT LIKE A REAL HUMAN: Build a natural, empathetic, and engaging dialogue.
2. PROACTIVE SALES: Gently guide the conversation. Ask clarifying questions (e.g., "What is the student's current level?", "When would you like to start?").
3. FACTUAL ACCURACY: Rely ONLY on the data provided below and on the results of the function tools. Do NOT invent courses, prices, schedules, days, or times.
4. GREETING RULE: If this is the start of the conversation, you MUST incorporate the exact essence of the configured "Greeting Message". Do not overwrite it with generic text.
5. NO REPETITIVE GREETINGS: Do not say hello in follow-up messages.
6. SCHEDULE & PRICE QUESTIONS (CRITICAL): When the user asks about availability, schedule, the nearest group, when lessons are, or how much a course costs, you MUST call the "find_nearest_group" function and answer ONLY from its result. Never guess a day, time, or price.
7. LEAD LOGGING: If the user agrees to a meeting/call/enrollment AND provides their name AND phone number — but NOT a specific trial lesson — call "addLeadToDatabase".
8. TRIAL BOOKING (CRITICAL): If the user agrees to a TRIAL lesson AND provides their name AND phone number, you MUST call the "book_trial" function. Pass the course they're interested in and any preferred time they mentioned.
9. LANGUAGE: Reply in the same language as the user.
10. CUSTOM BEHAVIOR INSTRUCTIONS: ${settings?.customInstructions ? 'STRICTLY FOLLOW THIS: "' + settings.customInstructions + '"' : 'None.'}

ORGANIZATION KNOWLEDGE BASE:
- Name: ${org?.name || 'Unknown'}
- Location/Address: ${org?.address || 'N/A'}
- Organization Bio / Description: ${settings?.aboutOrganization || org?.description || 'No description provided.'}
- Configured Greeting Message: "${greeting}"
- Enrollment Policy: ${settings?.enrollmentPolicy || 'No specific policy provided.'}
- FAQ: ${JSON.stringify(settings?.faq || [])}
- Contacts: Email: ${org?.contactEmail || 'N/A'}, Phone: ${org?.contactPhone || 'N/A'}

AVAILABLE COURSES & PRICES:
${courseLines.length ? courseLines.join('\n') : 'No public courses listed. Suggest contacting the office.'}

AVAILABLE BRANCHES:
${branchLines.length ? branchLines.join('\n') : 'No public branches listed.'}

GROUPS (names only — use find_nearest_group for their schedule & price):
${groupNames.length ? groupNames.join(', ') : 'No groups configured yet.'}

${isFirstMessage ? 'IMPORTANT: This is the first message from the user. You MUST reply by starting with the Configured Greeting Message exactly as written, then naturally address what they asked.\n' : ''}Provide formatted text for Telegram. Do not use Markdown unsupported by Telegram HTML (use <b>bold</b>, <i>italic</i>, etc.). Do NOT output raw generic JSON or code blocks.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool executors → each returns a plain object handed back to Gemini as the
// functionResponse, so the model phrases the final, on-brand reply.
// ─────────────────────────────────────────────────────────────────────────────

function executeFindNearestGroup(ctx: SalesContext, args: any, now: Date): any {
  const query = String(args?.courseQuery || '').trim();
  const matched = selectGroupsForQuery(query, ctx.groups, ctx.courses);

  if (!matched.length) {
    return {
      found: false,
      message: 'Подходящая группа в расписании не найдена.',
      availableCourses: ctx.publishedCourses.map(c => c.title).filter(Boolean),
    };
  }

  const options = matched.map(g => {
    const next = resolveNextSession(ctx.eventsByGroup.get(g.id) || [], now);
    const course = g.courseId ? ctx.courseById.get(g.courseId) : undefined;
    const price = course?.price ?? null;
    return {
      groupName: g.name,
      courseName: g.courseName || course?.title || '',
      price,
      nextSession: next ? { day: next.weekdayLabel, date: next.date, time: next.startTime } : null,
    };
  });
  // Soonest session first; groups without a scheduled session sort last.
  const keyOf = (o: { nextSession: { date: string; time: string } | null }) =>
    o.nextSession ? `${o.nextSession.date}T${o.nextSession.time}` : '9999-99-99';
  options.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  const top = options.slice(0, 5);

  const anyScheduled = top.some(o => o.nextSession);
  return {
    found: true,
    options: top,
    note: anyScheduled
      ? 'Сообщи клиенту ближайший день, время и цену из options. Если цена null — предложи уточнить у менеджера.'
      : 'Группы есть, но расписание ещё не заполнено — предложи записаться, и менеджер сообщит время.',
  };
}

async function executeBookTrial(orgId: string, chatId: string, ctx: SalesContext, args: any, now: Date): Promise<any> {
  const name = String(args?.name || '').trim();
  const phone = String(args?.phone || '').trim();
  const courseQuery = String(args?.courseQuery || '').trim();
  const preferredTime = String(args?.preferredTime || '').trim();

  if (!name) return { booked: false, message: 'Не хватает имени клиента — переспроси имя.' };

  // Best-effort: resolve a matching group + its nearest session for the confirmation.
  const matched = selectGroupsForQuery(courseQuery, ctx.groups, ctx.courses);
  const target = matched[0];
  const next = target ? resolveNextSession(ctx.eventsByGroup.get(target.id) || [], now) : null;
  const course = target?.courseId ? ctx.courseById.get(target.courseId) : undefined;
  const courseLabel = courseQuery || target?.courseName || course?.title || '';

  const reasonParts = ['Пробный урок'];
  if (courseLabel) reasonParts.push(courseLabel);
  if (preferredTime) reasonParts.push(`желаемое время: ${preferredTime}`);
  const reason = reasonParts.join(' — ');

  // Mirror the addLeadToDatabase shape (source 'telegram_bot', status 'new',
  // telegramChatId) + trial tagging so the Leads page can flag it.
  await adminDb.collection('organizations').doc(orgId).collection('aiLeads').add({
    name,
    phone: phone || '',
    reason,
    source: 'telegram_bot',
    status: 'new',
    trialRequest: true,
    requestedCourse: courseLabel || '',
    preferredTime: preferredTime || '',
    telegramChatId: String(chatId),
    createdAt: new Date().toISOString(),
  });

  const notif =
    `🎓 Запись на пробный урок через Telegram-бота!\n\n` +
    `👤 Имя: ${name}\n` +
    `📞 Телефон: ${phone || '—'}\n` +
    (courseLabel ? `📚 Курс: ${courseLabel}\n` : '') +
    (preferredTime ? `🕒 Желаемое время: ${preferredTime}\n` : '') +
    (next ? `📅 Ближайшее занятие группы «${target?.name}»: ${next.weekdayLabel}, ${next.startTime}` : '');
  await notifyOrgAdmins(orgId, 'new_lead', '🎓 Заявка на пробный урок', notif, '/leads').catch(() => {});

  return {
    booked: true,
    name,
    course: courseLabel || null,
    preferredTime: preferredTime || null,
    nearestSession: next ? { day: next.weekdayLabel, date: next.date, time: next.startTime, groupName: target?.name } : null,
    message: 'Заявка на пробный урок сохранена, менеджер свяжется с клиентом для подтверждения. Поблагодари клиента и подтверди запись; если известно ближайшее занятие — назови его.',
  };
}

async function executeAddLead(orgId: string, chatId: string, args: any): Promise<any> {
  const name = String(args?.name || '').trim() || 'Unknown';
  const phone = String(args?.phone || '').trim() || 'Unknown';
  const reason = String(args?.reason || '').trim();

  await adminDb.collection('organizations').doc(orgId).collection('aiLeads').add({
    name, phone, reason,
    source: 'telegram_bot',
    status: 'new',
    telegramChatId: String(chatId),
    createdAt: new Date().toISOString(),
  });

  const notif =
    `У вас новая заявка через Telegram бота!\n\n` +
    `👤 Имя: ${name}\n` +
    `📞 Телефон: ${phone}\n` +
    `${reason ? `🎯 Цель: ${reason}` : ''}`;
  await notifyOrgAdmins(orgId, 'new_lead', '📩 Новая заявка', notif, '/leads').catch(() => {});

  return { success: true, message: 'Lead has been saved. The manager will contact the client soon.' };
}

async function executeCall(orgId: string, chatId: string, ctx: SalesContext, now: Date, name: string, args: any): Promise<any> {
  switch (name) {
    case 'find_nearest_group': return executeFindNearestGroup(ctx, args, now);
    case 'book_trial': return executeBookTrial(orgId, chatId, ctx, args, now);
    case 'addLeadToDatabase': return executeAddLead(orgId, chatId, args);
    default: return { error: `Unknown tool ${name}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The turn
// ─────────────────────────────────────────────────────────────────────────────

/** History → SDK Content[] (assistant→model), guaranteed to start with a user turn. */
function toContents(history: SalesMessage[], userText: string): any[] {
  const contents = (history || []).map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }));
  while (contents.length && contents[0].role === 'model') contents.shift();
  contents.push({ role: 'user', parts: [{ text: userText || '' }] });
  return contents;
}

export interface SalesTurnParams {
  orgId: string;
  org: any;
  settings: any;            // organizationAIManager doc data
  chatId: string;
  history: SalesMessage[];  // prior turns, EXCLUDING the current user message
  userText: string;
  isFirstMessage: boolean;
  now?: Date;               // injectable for tests; defaults to wall-clock
}

/**
 * Run one sales-bot turn. Does a Gemini function-calling round; if the model calls
 * tool(s) we execute them via the Admin SDK and feed the results back for a natural,
 * on-brand reply (second round, no tools, so it always lands on text). Returns
 * Telegram-HTML-ready text and never throws — a friendly fallback is returned on
 * any failure so the webhook always replies.
 */
export async function runSalesBotTurn(params: SalesTurnParams): Promise<string> {
  const { orgId, org, settings, chatId, history, userText, isFirstMessage } = params;
  const now = params.now || new Date();
  if (!hasGeminiKey()) return 'Извините, ассистент временно недоступен. Пожалуйста, напишите чуть позже.';

  try {
    const ctx = await buildSalesContext(orgId);
    const systemInstruction = buildSystemInstruction(org, settings, ctx, isFirstMessage);
    const decls = buildFunctionDeclarations();
    const contents = toContents(history, userText);

    const first = await generateWithFallback(
      { systemInstruction, tools: [{ functionDeclarations: decls }] },
      { contents },
    );
    const resp = first.response;
    const calls: { name: string; args: any }[] = resp.functionCalls?.() || [];

    if (!calls.length) {
      recordAiUsage(orgId, 'sales_bot');
      return toTelegramHtml(resp.text() || '') || 'Простите, я не смог сформировать ответ. Можете переформулировать?';
    }

    // Execute every requested tool, collect a functionResponse part for each.
    const responseParts: any[] = [];
    for (const c of calls) {
      const result = await executeCall(orgId, chatId, ctx, now, c.name, c.args || {});
      responseParts.push({ functionResponse: { name: c.name, response: result } });
    }

    // Second round (no tools) → the model phrases the data into a natural reply.
    const modelTurn = resp.candidates?.[0]?.content || { role: 'model', parts: calls.map(c => ({ functionCall: c })) };
    const followContents = [...contents, modelTurn, { role: 'function', parts: responseParts }];

    let replyText = '';
    try {
      const second = await generateWithFallback({ systemInstruction }, { contents: followContents });
      replyText = second.response.text() || '';
    } catch (e) {
      console.warn('[sales-bot] follow-up generation failed (non-fatal):', e);
    }

    recordAiUsage(orgId, 'sales_bot');
    const out = toTelegramHtml(replyText);
    if (out) return out;

    // Deterministic fallback if the model didn't produce text after the tool ran.
    const booked = calls.some(c => c.name === 'book_trial');
    const leaded = calls.some(c => c.name === 'addLeadToDatabase');
    if (booked) return '🎓 Готово! Я записал вас на пробный урок — менеджер свяжется с вами для подтверждения. 🙌';
    if (leaded) return 'Отлично! Я записал ваши данные. Наш менеджер свяжется с вами в ближайшее время! 🙌';
    return 'Готово! Если остались вопросы — с радостью помогу. 🙌';
  } catch (e) {
    console.error('[sales-bot] turn error:', e);
    return 'Извините, произошла техническая ошибка. Пожалуйста, повторите позже.';
  }
}
