import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export async function selectModel(): Promise<string> {
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

export function buildRuleBasedFeedback(
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
    summary = `Отличный результат — ${pct}% (${attempt.score}/${attempt.totalPoints}). Уверенно владеет материалом, допустив минимум ошибок.`;
  } else if (pct >= 70) {
    summary = `Хороший результат — ${pct}% (${attempt.score}/${attempt.totalPoints}). Базовые знания есть, но ${incorrect.length} ошибок указывают на пробелы в отдельных темах.`;
  } else if (pct >= 50) {
    summary = `Удовлетворительный результат — ${pct}% (${attempt.score}/${attempt.totalPoints}). Знает основы, но ${incorrect.length} из ${total} вопросов были решены неверно.`;
  } else {
    summary = `Слабый результат — ${pct}% (${attempt.score}/${attempt.totalPoints}). Правильных ответов: ${correct.length} из ${total}.`;
  }

  // --- Strengths ---
  const strengths: string[] = [];
  if (correct.length > 0) strengths.push(`Правильно ответил(а) на ${correct.length} из ${total} вопросов`);
  if (pct >= 90) strengths.push('Отличное владение материалом экзамена');
  if (avgTimePerQ > 0 && avgTimePerQ <= 30 && pct >= 70) {
    strengths.push(`Быстрое и точное решение (в среднем ${avgTimePerQ} сек/вопрос)`);
  }

  // --- Weak Topics ---
  const weakTopics: string[] = [];
  if (incorrect.length > 0) {
    const incorrectTexts = incorrect.slice(0, 5).map((r: any) => `"${r.questionText}"`);
    weakTopics.push(`Ошибки в ${incorrect.length} вопросах: ${incorrectTexts.join(', ')}${incorrect.length > 5 ? ` и ещё ${incorrect.length - 5}` : ''}`);
  }
  if (pending.length > 0) weakTopics.push(`${pending.length} вопросов ожидают ручной проверки`);

  // --- Review Suggestions ---
  const reviewSuggestions: string[] = [];
  if (incorrect.length > 0) reviewSuggestions.push('Рекомендуется фокус на темах, где допущены ошибки');
  if (pct < 70) reviewSuggestions.push('Может потребоваться начальный уровень подготовки (Foundation)');
  else reviewSuggestions.push('Готов к основному курсу (Главная программа)');

  // --- Teacher Notes ---
  let teacherNotes = pct < 70 ? `Обратите внимание на ${incorrect.length} ошибок. Потенциально слабый лид/клиент.` : `Хороший потенциальный клиент. Готов обучаться.`;

  return { summary, strengths, weakTopics, reviewSuggestions, teacherNotes };
}

export async function generateExamAIFeedback(
  attempt: any, 
  correct: any[], 
  incorrect: any[], 
  pending: any[], 
  gradingCategories: string[] = []
) {
  if (!GEMINI_API_KEY) throw new Error('No GEMINI_API_KEY');

  const categoryPrompt = gradingCategories.length > 0 
    ? `Оцени работу строго по этим категориям: ${gradingCategories.join(', ')}. Выстави оценки (excellent, good, average, poor) и напиши подробный инсайт по каждой категории.`
    : '';

  const categoryFormat = gradingCategories.length > 0
    ? `,\n  "categoryScores": { "название_категории": "одна из [excellent, good, average, poor]" },\n  "categoryInsights": { "название_категории": "краткое объяснение, почему выставлена такая оценка" }`
    : '';

  const prompt = `Ты — образовательный ИИ-ассистент платформы Planula. Пользователь только что завершил вступительный тест/экзамен.

Экзамен: "${attempt.examTitle}"
Результат: ${attempt.percentage}% (${attempt.score}/${attempt.totalPoints} баллов). ${attempt.passed ? 'Экзамен сдан.' : 'Экзамен НЕ сдан.'}
Время: ${Math.floor((attempt.timeSpentSeconds || 0) / 60)} мин ${(attempt.timeSpentSeconds || 0) % 60} сек

Правильные ответы (${correct.length}):
${correct.map((r: any) => `- ${r.questionText}`).join('\n') || 'Нет'}

Неправильные ответы (${incorrect.length}):
${incorrect.map((r: any) => `- Вопрос: ${r.questionText}\n  Ответ студента: ${Array.isArray(r.studentAnswer) ? r.studentAnswer.join(', ') : r.studentAnswer || '(пусто)'}\n  Правильный ответ: ${Array.isArray(r.correctAnswer) ? r.correctAnswer.join(', ') : r.correctAnswer}`).join('\n') || 'Нет'}

Составь подробный и полезный отчёт для преподавателя или менеджера по продажам (студент этот отчет не увидит, поэтому пиши прямо и по делу). Оцени его уровень.
${categoryPrompt}

Верни JSON строго в таком формате:
{
  "summary": "Краткий итог (2-3 предложения). Укажи процент, примерный уровень.",
  "strengths": ["Конкретная сильная сторона 1", "Конкретная сильная сторона 2"],
  "weakTopics": ["Конкретная слабая тема 1", "Конкретная слабая тема 2"],
  "reviewSuggestions": ["Конкретный совет 1: в какую группу/уровень лучше определить клиента"],
  "teacherNotes": "Заметка для преподавателя/менеджера: как продавать или обучать данного клиента."${categoryFormat}
}

Пиши по-русски. Будь конструктивным и объективным.`;

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
    if (typeof feedback === 'string') feedback = JSON.parse(feedback);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) feedback = JSON.parse(jsonMatch[0]);
    else throw new Error("JSON payload unparseable");
  }

  feedback.modelUsed = selectedModel;
  feedback.generatedAt = new Date().toISOString();
  return feedback;
}
