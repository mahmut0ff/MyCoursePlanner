import type { Handler, HandlerEvent } from '@netlify/functions';
import { verifyAuth, isStaff, ok, unauthorized, forbidden, badRequest, jsonResponse } from './utils/auth';
import { rateLimiters, getRateLimitKey } from './utils/rate-limiter';
import { hasGeminiKey, recordAiUsage } from './utils/ai';
import { generateAIContent, AIGenerateError } from './utils/ai-generate';

/**
 * Синхронная генерация — для коротких текстовых операций (перевод, комментарий
 * к отчёту, пост, подсказка в редакторе урока). Всё, что читает приложенный файл
 * или пишет длинный JSON (экзамен, викторина, урок+квиз), идёт через
 * `api-ai-generate-background`: на бесплатном плане Netlify синхронная функция
 * умирает с 504 через 10 секунд, а такая генерация занимает 15–40.
 */
const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!isStaff(user) && user.role !== 'teacher') return forbidden('Only staff and teachers can use AI tools');

  // Rate limit: 10 AI requests per minute per user
  const rlKey = getRateLimitKey(event, user.uid);
  if (rateLimiters.ai.isLimited(rlKey)) {
    return jsonResponse(429, { error: 'Too many requests. Please wait a moment.' });
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  if (!hasGeminiKey()) {
    return jsonResponse(500, { error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { prompt, type = 'quiz', fileUrl } = body;

    if (!prompt && !fileUrl) {
      return badRequest('Either prompt or fileUrl is required');
    }

    const generatedData = await generateAIContent({ prompt, type, fileUrl });
    recordAiUsage(user.organizationId, `generate_${type}`);
    return ok({ data: generatedData });
  } catch (err: any) {
    if (err instanceof AIGenerateError) {
      if (err.kind === 'file') return badRequest(err.message);
      if (err.kind === 'format') return jsonResponse(500, { error: err.message, rawOutput: err.raw });
    }
    console.error('AI Generator API Error:', err);
    return jsonResponse(500, { error: err.message || 'Internal Server Error' });
  }
};

export { handler };
