/**
 * API: AI Tutor — student & parent facing.
 *
 * POST ?action=tutor      { question, history? }     → answers using the org's own lessons (RAG-lite)
 * POST ?action=practice   { topic, count?, level? }  → practice questions with answers + explanations
 * POST ?action=explain    { questions }              → explains a student's exam mistakes
 * POST ?action=studyplan  { weakTopics? }            → personalized study plan from the student's data
 * POST ?action=speaking   { messages, level?, lang? }→ conversational language partner with corrections
 *
 * Available to students and staff on an AI-enabled plan, scoped to their org.
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, ok, unauthorized, forbidden, badRequest, jsonResponse } from './utils/auth';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';
import { getModel, parseJsonLoose, aiAllowed, hasGeminiKey, recordAiUsage } from './utils/ai';
// Shared with the Telegram student copilot so web + bot ground answers identically.
import { buildLessonContext } from './utils/lessons';

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!aiAllowed(user)) return forbidden('AI недоступен на вашем тарифе');
  if (!hasGeminiKey()) return jsonResponse(500, { error: 'GEMINI_API_KEY is not configured on the server.' });

  if (rateLimiters.ai.isLimited(getRateLimitKey(event, user.uid))) {
    return jsonResponse(429, { error: 'Слишком много запросов. Подождите немного.' });
  }

  const action = event.queryStringParameters?.action || 'tutor';
  const orgId = user.organizationId;
  const body = JSON.parse(event.body || '{}');

  try {
    if (action === 'tutor') {
      const question = String(body.question || '').trim();
      if (!question) return badRequest('question required');
      const context = orgId ? await buildLessonContext(orgId) : '';
      const history = Array.isArray(body.history)
        ? body.history.slice(-6).map((m: any) => `${m.role === 'user' ? 'Ученик' : 'Репетитор'}: ${m.content}`).join('\n')
        : '';

      const model = getModel({ json: true });
      const prompt = `Ты — дружелюбный AI-репетитор учебного центра. Объясняй просто, поэтапно, поощряй ученика. Опирайся в первую очередь на материалы центра (ниже). Если в материалах нет ответа — можешь ответить из общих знаний, но не выдумывай факты о центре. Отвечай на языке вопроса (по умолчанию русский).

МАТЕРИАЛЫ ЦЕНТРА:
${context || '(материалы недоступны — отвечай из общих знаний по предмету)'}

${history ? `ИСТОРИЯ ДИАЛОГА:\n${history}\n` : ''}
ВОПРОС УЧЕНИКА: ${question}

Верни строго JSON: { "answer": string (понятное объяснение), "followups": [string] (0-3 коротких уточняющих вопроса, которые ученик может задать дальше) }`;
      const result = await model.generateContent(prompt);
      const data = parseJsonLoose(result.response.text());
      recordAiUsage(orgId, 'tutor');
      return ok({ data });
    }

    if (action === 'practice') {
      const topic = String(body.topic || '').trim();
      if (!topic) return badRequest('topic required');
      const count = Math.min(Math.max(Number(body.count) || 5, 1), 15);
      const level = String(body.level || '').trim();

      const model = getModel({ json: true });
      const prompt = `Ты — преподаватель. Составь ${count} тренировочных вопросов по теме «${topic}»${level ? ` для уровня «${level}»` : ''}. Смешивай типы. Отвечай на русском (вопросы — на языке темы, если уместно).

Верни строго JSON массив объектов:
[{ "type": "multiple_choice" | "true_false" | "short_answer", "question": string, "options": [string] (для multiple_choice/true_false; для true_false — ["Верно","Неверно"]), "correctOptionIndices": [int] (для multiple_choice/true_false), "answer": string (для short_answer — правильный ответ), "explanation": string (почему так) }]
Только чистый JSON, без markdown.`;
      const result = await model.generateContent(prompt);
      const data = parseJsonLoose(result.response.text());
      recordAiUsage(orgId, 'practice');
      return ok({ data });
    }

    if (action === 'explain') {
      const questions = Array.isArray(body.questions) ? body.questions.slice(0, 30) : [];
      if (questions.length === 0) return badRequest('questions required');

      const model = getModel({ json: true });
      const prompt = `Ты — терпеливый репетитор. Разбери ошибки ученика в тесте. Для каждого вопроса, где ученик ошибся, объясни простыми словами, почему правильный ответ верный, и дай короткий совет. Не ругай, поддерживай. Отвечай на русском.

ВОПРОСЫ И ОТВЕТЫ УЧЕНИКА (JSON):
${JSON.stringify(questions)}

Верни строго JSON: {
  "summary": string (1-2 предложения — общий вывод и поддержка),
  "items": [{ "question": string (кратко суть вопроса), "why": string (почему правильный ответ верный), "tip": string (короткий совет, как запомнить/не ошибиться) }]
}
Включай в items только вопросы, где был неправильный или пустой ответ. Если ошибок нет — верни пустой items и поздравь в summary.`;
      const result = await model.generateContent(prompt);
      const data = parseJsonLoose(result.response.text());
      recordAiUsage(orgId, 'explain');
      return ok({ data });
    }

    if (action === 'studyplan') {
      // Pull the student's own recent attempts to ground the plan.
      const attemptsSnap = await adminDb.collection('examAttempts')
        .where('studentId', '==', user.uid)
        .get()
        .catch(() => null);
      const attempts = (attemptsSnap?.docs || []).map(d => d.data() as any);
      attempts.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const recent = attempts.slice(0, 10);
      const avg = recent.length ? Math.round(recent.reduce((a, c) => a + (c.percentage || 0), 0) / recent.length) : null;
      const weakFromFeedback = recent.flatMap(a => (a.aiFeedback?.weakTopics || [])).filter(Boolean);
      const weakTopics = Array.from(new Set([...(Array.isArray(body.weakTopics) ? body.weakTopics : []), ...weakFromFeedback])).slice(0, 12);

      const model = getModel({ json: true });
      const prompt = `Ты — наставник ученика. Составь персональный план обучения на ближайшую неделю, исходя из данных. Будь конкретным и реалистичным. Отвечай на русском.

ДАННЫЕ УЧЕНИКА:
- Средний балл по последним тестам: ${avg === null ? 'нет данных' : avg + '%'}
- Кол-во последних тестов: ${recent.length}
- Слабые темы: ${weakTopics.length ? weakTopics.join(', ') : 'не выявлены — предложи общий план улучшения'}

Верни строго JSON: {
  "summary": string (1-2 предложения — мотивация и фокус недели),
  "focusTopics": [string] (3-6 тем для проработки),
  "steps": [{ "title": string (что сделать), "detail": string (как именно, конкретно) }] (4-7 шагов)
}`;
      const result = await model.generateContent(prompt);
      const data = parseJsonLoose(result.response.text());
      recordAiUsage(orgId, 'studyplan');
      return ok({ data });
    }

    if (action === 'speaking') {
      const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
      const level = String(body.level || 'A2-B1').trim();
      const lang = String(body.lang || '').trim();
      if (messages.length === 0) return badRequest('messages required');
      if (!lang) return badRequest('lang required');

      const convo = messages.map((m: any) => `${m.role === 'user' ? 'Student' : 'Partner'}: ${m.content}`).join('\n');
      const model = getModel({ json: true });
      const prompt = `You are a friendly ${lang} conversation partner for a language student at level ${level}. Keep the conversation going naturally with one short reply and one follow-up question. Gently correct the student's most important mistake from their LAST message, if any. Keep replies short and level-appropriate.

CONVERSATION:
${convo}

Return strictly JSON: {
  "reply": string (your ${lang} response, 1-3 sentences, ending with a question),
  "correction": string | null (if the student made a notable mistake: show "you said X → better: Y" briefly; otherwise null),
  "translation": string (Russian translation of your reply, to help the student)
}`;
      const result = await model.generateContent(prompt);
      const data = parseJsonLoose(result.response.text());
      recordAiUsage(orgId, 'speaking');
      return ok({ data });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error('AI Tutor error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};
