/**
 * AI Feedback Netlify Function
 * Generates diagnostic feedback for exam attempts using Gemini.
 * Uses GoogleGenerativeAI SDK with dynamic model selection (same approach as api-ai-generate.ts).
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isStaff, jsonResponse, unauthorized, badRequest, notFound, forbidden } from './utils/auth';

const CORS_HEADERS = {
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

/**
 * Generates meaningful feedback from raw exam data when Gemini is unavailable.
 * Analyzes correct/incorrect answers, timing, and score to produce actionable insights.
 */
function buildRuleBasedFeedback(
  attempt: any,
  correct: any[],
  incorrect: any[],
  pending: any[]
) {
  const pct = attempt.percentage ?? 0;
  const total = (correct.length + incorrect.length + pending.length) || 1;
  const timeMin = Math.floor((attempt.timeSpentSeconds || 0) / 60);
  const timeSec = (attempt.timeSpentSeconds || 0) % 60;
  const avgTimePerQ = total > 0 ? Math.round((attempt.timeSpentSeconds || 0) / total) : 0;

  // --- Summary ---
  let summary: string;
  if (pct >= 90) {
    summary = `Отличный результат — ${pct}% (${attempt.score}/${attempt.totalPoints}). Студент уверенно владеет материалом, допустив минимум ошибок.`;
  } else if (pct >= 70) {
    summary = `Хороший результат — ${pct}% (${attempt.score}/${attempt.totalPoints}). Базовые знания есть, но ${incorrect.length} ошибок указывают на пробелы в отдельных темах.`;
  } else if (pct >= 50) {
    summary = `Удовлетворительный результат — ${pct}% (${attempt.score}/${attempt.totalPoints}). Студент знает основы, но ${incorrect.length} из ${total} вопросов были решены неверно. Требуется дополнительная работа.`;
  } else {
    summary = `Слабый результат — ${pct}% (${attempt.score}/${attempt.totalPoints}). Правильных ответов: ${correct.length} из ${total}. Необходимо серьёзно повторить материал экзамена.`;
  }

  // --- Strengths ---
  const strengths: string[] = [];
  if (correct.length > 0) {
    strengths.push(`Правильно ответил(а) на ${correct.length} из ${total} вопросов`);
  }
  if (correct.length > 0 && correct.length <= 3) {
    strengths.push(...correct.map((r: any) => `Верно: "${r.questionText}"`));
  } else if (correct.length > 3) {
    strengths.push(`Уверенно справился с вопросами: "${correct[0].questionText}", "${correct[1].questionText}" и ещё ${correct.length - 2}`);
  }
  if (pct >= 90) strengths.push('Отличное владение материалом экзамена');
  if (avgTimePerQ > 0 && avgTimePerQ <= 30 && pct >= 70) {
    strengths.push(`Быстрое и точное решение (в среднем ${avgTimePerQ} сек/вопрос)`);
  }
  if (strengths.length === 0) strengths.push('Экзамен был завершён в отведённое время');

  // --- Weak Topics ---
  const weakTopics: string[] = [];
  if (incorrect.length > 0) {
    const incorrectTexts = incorrect.slice(0, 5).map((r: any) => `"${r.questionText}"`);
    weakTopics.push(`Ошибки в ${incorrect.length} вопросах: ${incorrectTexts.join(', ')}${incorrect.length > 5 ? ` и ещё ${incorrect.length - 5}` : ''}`);
  }
  if (avgTimePerQ > 0 && avgTimePerQ < 15 && pct < 70) {
    weakTopics.push(`Аномально быстрое решение (${timeMin} мин ${timeSec} сек на весь экзамен) — возможна спешка или невнимательность`);
  }
  if (pending.length > 0) {
    weakTopics.push(`${pending.length} вопросов ожидают ручной проверки`);
  }

  // --- Review Suggestions ---
  const reviewSuggestions: string[] = [];
  if (incorrect.length > 0) {
    reviewSuggestions.push('Разберите все неправильные ответы и сравните с правильными — они показаны в разделе ниже');
    if (incorrect.length >= 3) {
      reviewSuggestions.push('Рекомендуется повторно пройти материал по темам, где допущены ошибки');
    }
  }
  if (pct < 70) {
    reviewSuggestions.push('Перед пересдачей рекомендуется пройти весь учебный материал заново');
  }
  if (avgTimePerQ < 15 && pct < 70) {
    reviewSuggestions.push('Уделите больше времени на обдумывание каждого вопроса при следующей попытке');
  }
  if (reviewSuggestions.length === 0) reviewSuggestions.push('Продолжайте в том же духе!');

  // --- Teacher Notes ---
  let teacherNotes = '';
  if (pct < 50) {
    teacherNotes = `Студент набрал только ${pct}%. Рекомендуется индивидуальная работа по темам, где допущены ошибки. Возможно, материал был недостаточно усвоен.`;
  } else if (pct < 70) {
    teacherNotes = `Результат ${pct}% — на границе. Обратите внимание на ${incorrect.length} ошибок. Стоит провести повторение проблемных тем на уроке.`;
  } else if (pct < 90) {
    teacherNotes = `Хороший результат (${pct}%), но есть точечные пробелы. Кратко разберите ошибки на следующем занятии.`;
  } else {
    teacherNotes = `Отличный результат (${pct}%). Студент хорошо усвоил материал.`;
  }

  return { summary, strengths, weakTopics, reviewSuggestions, teacherNotes };
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // Auth check
  const user = await verifyAuth(event);
  if (!user) return unauthorized();

  let attemptId = '';
  try {
    const body = JSON.parse(event.body || '{}');
    attemptId = body.attemptId;
    if (!attemptId) return badRequest('attemptId required');

    if (!GEMINI_API_KEY) return jsonResponse(500, { error: 'GEMINI_API_KEY not configured' });

    const attemptDoc = await adminDb.collection('examAttempts').doc(attemptId).get();
    if (!attemptDoc.exists) return notFound('Attempt not found');

    const attempt = attemptDoc.data()!;

    // Ownership check — only the student who took the exam or staff can request feedback
    if (attempt.studentId !== user.uid && !isStaff(user)) return forbidden();

    const questionResults = attempt.questionResults || [];
    const incorrect = questionResults.filter((r: any) => !r.isCorrect);
    const correct = questionResults.filter((r: any) => r.isCorrect);
    const pending = questionResults.filter((r: any) => r.status === 'pending_review');

    // Load exam doc to get custom categories
    const examDoc = await adminDb.collection('exams').doc(attempt.examId).get();
    const gradingCategories = examDoc.exists ? (examDoc.data()?.gradingCategories || []) : [];

    const categoryPrompt = gradingCategories.length > 0 
      ? `Оцени работу студента строго по этим категориям: ${gradingCategories.join(', ')}. Выстави оценки (excellent, good, average, poor) и напиши подробный инсайт по каждой категории.`
      : '';

    const categoryFormat = gradingCategories.length > 0
      ? `,\n  "categoryScores": { "название_категории": "одна из [excellent, good, average, poor]" },\n  "categoryInsights": { "название_категории": "краткое объяснение, почему выставлена такая оценка" }`
      : '';

    const prompt = `Ты — образовательный ИИ-ассистент платформы Planula. Студент только что завершил экзамен.

Экзамен: "${attempt.examTitle}"
Результат: ${attempt.percentage}% (${attempt.score}/${attempt.totalPoints} баллов). ${attempt.passed ? 'Экзамен сдан.' : 'Экзамен НЕ сдан.'}
Время: ${Math.floor((attempt.timeSpentSeconds || 0) / 60)} мин ${(attempt.timeSpentSeconds || 0) % 60} сек

Правильные ответы (${correct.length}):
${correct.map((r: any) => `- ${r.questionText}`).join('\n') || 'Нет'}

Неправильные ответы (${incorrect.length}):
${incorrect.map((r: any) => `- Вопрос: ${r.questionText}\n  Ответ студента: ${Array.isArray(r.studentAnswer) ? r.studentAnswer.join(', ') : r.studentAnswer || '(пусто)'}\n  Правильный ответ: ${Array.isArray(r.correctAnswer) ? r.correctAnswer.join(', ') : r.correctAnswer}`).join('\n') || 'Нет'}

${pending.length > 0 ? `На ручной проверке (${pending.length}):\n${pending.map((r: any) => `- ${r.questionText}`).join('\n')}` : ''}

Составь подробный и полезный отчёт для преподавателя (студент этот отчет не увидит, поэтому пиши прямо и по делу).
${categoryPrompt}

Верни JSON строго в таком формате:
{
  "summary": "Краткий итог (2-3 предложения). Укажи процент, что получилось хорошо и что стоит подтянуть.",
  "strengths": ["Конкретная сильная сторона 1", "Конкретная сильная сторона 2"],
  "weakTopics": ["Конкретная слабая тема 1", "Конкретная слабая тема 2"],
  "reviewSuggestions": ["Конкретный совет 1: что именно изучить/повторить", "Конкретный совет 2"],
  "teacherNotes": "Заметка для преподавателя: на что обратить внимание в обучении данного студента, какие темы стоит повторить на уроке."${categoryFormat}
}

Пиши по-русски. Будь конструктивным и объективным. Анализируй глубоко.`;

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
      // Guard against double-serialized JSON (Gemini sometimes returns a quoted string)
      if (typeof feedback === 'string') {
        feedback = JSON.parse(feedback);
      }
    } catch {
      // Fallback: try to extract JSON from possible markdown wrapper
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        feedback = JSON.parse(jsonMatch[0]);
      } else {
        // Generate rule-based feedback from actual exam data
        feedback = buildRuleBasedFeedback(attempt, correct, incorrect, pending);
      }
    }

    feedback.generatedAt = new Date().toISOString();
    feedback.modelUsed = selectedModel;
    await adminDb.collection('examAttempts').doc(attemptId).update({ aiFeedback: feedback });

    return jsonResponse(200, { success: true, feedback });
  } catch (error: any) {
    console.error('AI Feedback error:', error);
    
    // Try to build rule-based feedback from the attempt data
    let fallback;
    try {
      const attemptDoc = await adminDb.collection('examAttempts').doc(attemptId).get();
      if (attemptDoc.exists) {
        const a = attemptDoc.data()!;
        const qr = a.questionResults || [];
        const corr = qr.filter((r: any) => r.isCorrect);
        const incorr = qr.filter((r: any) => !r.isCorrect && r.status !== 'pending_review');
        const pend = qr.filter((r: any) => r.status === 'pending_review');
        fallback = buildRuleBasedFeedback(a, corr, incorr, pend);
      } else {
        fallback = {
          strengths: [], weakTopics: [], reviewSuggestions: [],
          summary: 'ИИ-анализ временно недоступен. Попробуйте обновить позже.',
          teacherNotes: '',
        };
      }
    } catch {
      fallback = {
        strengths: [], weakTopics: [], reviewSuggestions: [],
        summary: 'ИИ-анализ временно недоступен. Попробуйте обновить позже.',
        teacherNotes: '',
      };
    }

    fallback.generatedAt = new Date().toISOString();
    fallback.modelUsed = 'rule-based';

    // Save to DB so the UI stops spinning
    try {
      await adminDb.collection('examAttempts').doc(attemptId).update({ aiFeedback: fallback });
    } catch {}

    return jsonResponse(200, { success: true, feedback: fallback, degraded: true });
  }
};

export { handler };
