/**
 * AI Feedback Netlify Function
 * Generates diagnostic feedback for exam attempts using Gemini.
 * Uses GoogleGenerativeAI SDK with dynamic model selection (same approach as api-ai-generate.ts).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff } from './utils/auth';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/**
 * Dynamically selects the best available Gemini flash model.
 * Falls back through a chain to ensure reliability.
 */
async function selectModel(): Promise<string> {
  let selectedModel = 'gemini-1.5-flash';
  try {
    const modelsResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
    );
    if (modelsResponse.ok) {
      const modelsData = await modelsResponse.json();
      if (modelsData?.models) {
        const supported = modelsData.models.filter((m: any) =>
          m.supportedGenerationMethods?.includes('generateContent')
        );
        const flashModels = supported.filter((m: any) => m.name.includes('flash'));
        if (flashModels.length > 0) {
          selectedModel = flashModels[flashModels.length - 1].name.replace('models/', '');
        } else if (supported.length > 0) {
          selectedModel = supported[supported.length - 1].name.replace('models/', '');
        }
      }
    }
  } catch (e) {
    console.warn('Failed to dynamically fetch models, falling back to gemini-1.5-flash', e);
  }
  return selectedModel;
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Auth check
  const user = await verifyAuth(event);
  if (!user) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { attemptId } = JSON.parse(event.body || '{}');
    if (!attemptId) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'attemptId required' }) };
    }

    if (!GEMINI_API_KEY) {
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'GEMINI_API_KEY not configured' }) };
    }

    const attemptDoc = await adminDb.collection('examAttempts').doc(attemptId).get();
    if (!attemptDoc.exists) {
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Attempt not found' }) };
    }

    const attempt = attemptDoc.data()!;

    // Ownership check — only the student who took the exam or staff can request feedback
    if (attempt.studentId !== user.uid && !isStaff(user)) {
      return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    const questionResults = attempt.questionResults || [];
    const incorrect = questionResults.filter((r: any) => !r.isCorrect);
    const correct = questionResults.filter((r: any) => r.isCorrect);
    const pending = questionResults.filter((r: any) => r.status === 'pending_review');

    const prompt = `Ты — образовательный ИИ-ассистент платформы Planula. Студент только что завершил экзамен.

Экзамен: "${attempt.examTitle}"
Результат: ${attempt.percentage}% (${attempt.score}/${attempt.totalPoints} баллов). ${attempt.passed ? 'Экзамен сдан.' : 'Экзамен НЕ сдан.'}
Время: ${Math.floor((attempt.timeSpentSeconds || 0) / 60)} мин ${(attempt.timeSpentSeconds || 0) % 60} сек

Правильные ответы (${correct.length}):
${correct.map((r: any) => `- ${r.questionText}`).join('\n') || 'Нет'}

Неправильные ответы (${incorrect.length}):
${incorrect.map((r: any) => `- Вопрос: ${r.questionText}\n  Ответ студента: ${Array.isArray(r.studentAnswer) ? r.studentAnswer.join(', ') : r.studentAnswer || '(пусто)'}\n  Правильный ответ: ${Array.isArray(r.correctAnswer) ? r.correctAnswer.join(', ') : r.correctAnswer}`).join('\n') || 'Нет'}

${pending.length > 0 ? `На ручной проверке (${pending.length}):\n${pending.map((r: any) => `- ${r.questionText}`).join('\n')}` : ''}

Составь подробный и полезный отчёт для студента И для преподавателя.

Верни JSON строго в таком формате:
{
  "summary": "Краткий итог (2-3 предложения). Укажи процент, что получилось хорошо и что стоит подтянуть.",
  "strengths": ["Конкретная сильная сторона 1", "Конкретная сильная сторона 2"],
  "weakTopics": ["Конкретная слабая тема 1", "Конкретная слабая тема 2"],
  "reviewSuggestions": ["Конкретный совет 1: что именно изучить/повторить", "Конкретный совет 2"],
  "teacherNotes": "Заметка для преподавателя: на что обратить внимание в обучении данного студента, какие темы стоит повторить на уроке."
}

Пиши по-русски. Будь конструктивным и мотивирующим. Не используй общие фразы, давай конкретные рекомендации на основе ошибок.`;

    // Dynamic model selection (same as api-ai-generate.ts)
    const selectedModel = await selectModel();
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: selectedModel,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    const result = await model.generateContent(prompt);
    const raw = result.response.text();

    let feedback;
    try {
      feedback = JSON.parse(raw);
    } catch {
      // Fallback: try to extract JSON from possible markdown wrapper
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        feedback = JSON.parse(jsonMatch[0]);
      } else {
        feedback = {
          strengths: ['Экзамен завершён'],
          weakTopics: ['Просмотрите ошибки ниже'],
          reviewSuggestions: ['Повторите неправильные ответы'],
          summary: raw.substring(0, 500),
          teacherNotes: '',
        };
      }
    }

    feedback.generatedAt = new Date().toISOString();
    feedback.modelUsed = selectedModel;
    await adminDb.collection('examAttempts').doc(attemptId).update({ aiFeedback: feedback });

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, feedback }) };
  } catch (error: any) {
    console.error('AI Feedback error:', error);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Failed to generate feedback', message: error.message }) };
  }
};

export { handler };
