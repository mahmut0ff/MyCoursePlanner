import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export function selectModel(): string {
  return 'gemini-2.5-flash';
}

export function buildRuleBasedFeedback(
  attempt: any,
  correct: any[],
  incorrect: any[],
  pending: any[],
  placementLevels: string[] = []
) {
  const pct = attempt.percentage ?? 0;
  const total = (correct.length + incorrect.length + pending.length) || 1;
  const avgTimePerQ = total > 0 ? Math.round((attempt.timeSpentSeconds || 0) / total) : 0;

  // --- Level (verdict) ---
  // For placement tests, map the score band onto the provided scale (e.g. CEFR).
  // Otherwise fall back to a generic competence label.
  let level: string;
  let levelDescription: string;
  if (placementLevels.length > 0) {
    const idx = Math.min(
      placementLevels.length - 1,
      Math.floor((pct / 100) * placementLevels.length)
    );
    level = placementLevels[idx];
    levelDescription = `Результат ${pct}% соответствует уровню «${level}» по выбранной шкале.`;
  } else if (pct >= 90) {
    level = 'Продвинутый';
    levelDescription = `Высокий результат (${pct}%) — продвинутый уровень владения материалом.`;
  } else if (pct >= 70) {
    level = 'Средний';
    levelDescription = `Хороший результат (${pct}%) — средний уровень, есть отдельные пробелы.`;
  } else if (pct >= 50) {
    level = 'Базовый';
    levelDescription = `Удовлетворительный результат (${pct}%) — базовый уровень.`;
  } else {
    level = 'Начальный';
    levelDescription = `Низкий результат (${pct}%) — начальный уровень, требуется подготовка.`;
  }

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

  return {
    summary, strengths, weakTopics, reviewSuggestions, teacherNotes,
    level, levelDescription,
    modelUsed: 'rule-based',
    generatedAt: new Date().toISOString(),
  };
}

export async function generateExamAIFeedback(
  attempt: any,
  correct: any[],
  incorrect: any[],
  pending: any[],
  gradingCategories: string[] = [],
  placementLevels: string[] = []
) {
  if (!GEMINI_API_KEY) throw new Error('No GEMINI_API_KEY');

  const categoryPrompt = gradingCategories.length > 0
    ? `Оцени работу строго по этим категориям: ${gradingCategories.join(', ')}. Выстави оценки (excellent, good, average, poor) и напиши подробный инсайт по каждой категории.`
    : '';

  const categoryFormat = gradingCategories.length > 0
    ? `,\n  "categoryScores": { "название_категории": "одна из [excellent, good, average, poor]" },\n  "categoryInsights": { "название_категории": "краткое объяснение, почему выставлена такая оценка" }`
    : '';

  // Placement / level determination
  const levelPrompt = placementLevels.length > 0
    ? `Это тест на определение уровня. Определи уровень студента СТРОГО по шкале: ${placementLevels.join(', ')}. В поле "level" верни ровно одно значение из этой шкалы.`
    : `Определи примерный уровень студента короткой меткой (например: Начальный, Базовый, Средний, Продвинутый).`;

  // Open / text / speaking answers — the AI must GRADE these (assign points), not defer to a human.
  const gradingBlock = pending.length > 0
    ? `\n\nОТКРЫТЫЕ/ТЕКСТОВЫЕ ОТВЕТЫ — ты должен оценить каждый по содержанию и выставить баллы (целое число от 0 до максимума). Учитывай точность, полноту, аргументацию и грамотность. Для каждого верни объект в "gradedAnswers".\n${pending.map((r: any) => `- questionId: ${r.questionId} | Максимум баллов: ${r.pointsPossible} | Вопрос: ${r.questionText}\n  Ответ студента: ${Array.isArray(r.studentAnswer) ? r.studentAnswer.join(', ') : r.studentAnswer || '(пусто)'}`).join('\n')}`
    : '';

  const gradedFormat = pending.length > 0
    ? `\n  "gradedAnswers": [{ "questionId": "id вопроса", "pointsEarned": целое_число_0_до_максимума, "feedback": "конкретный разбор: что верно, что упущено, как улучшить (1-2 предложения)" }],`
    : '';

  const prompt = `Ты — опытный преподаватель-эксперт и ИИ-экзаменатор платформы SabakHub. Студент завершил тест/экзамен.

Экзамен: "${attempt.examTitle}"${attempt.subject ? `\nПредмет: ${attempt.subject}` : ''}
Результат по автопроверке: ${attempt.percentage}% (${attempt.score}/${attempt.totalPoints} баллов).
Время: ${Math.floor((attempt.timeSpentSeconds || 0) / 60)} мин ${(attempt.timeSpentSeconds || 0) % 60} сек

Правильные ответы (${correct.length}):
${correct.map((r: any) => `- ${r.questionText}`).join('\n') || 'Нет'}

Неправильные ответы (${incorrect.length}):
${incorrect.map((r: any) => `- Вопрос: ${r.questionText}\n  Ответ студента: ${Array.isArray(r.studentAnswer) ? r.studentAnswer.join(', ') : r.studentAnswer || '(пусто)'}\n  Правильный ответ: ${Array.isArray(r.correctAnswer) ? r.correctAnswer.join(', ') : r.correctAnswer}`).join('\n') || 'Нет'}${gradingBlock}

Составь ПОЛЕЗНЫЙ и КОНКРЕТНЫЙ отчёт для преподавателя (студент его не видит).
${levelPrompt}
${categoryPrompt}

ТРЕБОВАНИЯ К КАЧЕСТВУ (обязательно):
- Запрещены общие фразы вроде «повтори вопросы, на которые ответил неверно», «изучи слабые темы», «больше практикуйся». Это бесполезно.
- В weakTopics называй КОНКРЕТНЫЕ темы/правила/навыки (например: «Past Simple неправильных глаголов», «согласование времён», «дроби с разными знаменателями») — то, что реально видно из ошибок.
- В reviewSuggestions дай ПОШАГОВЫЙ план: что именно делать, какие темы/материалы/упражнения, в каком порядке, с примерами. Каждый пункт — действие, а не лозунг.
- Анализируй ПРИЧИНУ ошибок (невнимательность, пробел в теме, путаница понятий), а не просто факт ошибки.

Верни JSON строго в таком формате:
{
  "level": "Определённый уровень студента (одно значение)",
  "levelDescription": "1 предложение: почему именно этот уровень, с опорой на конкретные ответы",
  "summary": "Содержательный итог (3-4 предложения): что студент умеет, где системные пробелы, готовность к следующему уровню.",${gradedFormat}
  "strengths": ["Конкретная сильная сторона с привязкой к ответам"],
  "weakTopics": ["Конкретная тема/правило/навык, где есть пробел"],
  "reviewSuggestions": ["Шаг 1: конкретное действие с темой/примером", "Шаг 2: ..."],
  "teacherNotes": "Практическая заметка преподавателю: на что обратить внимание на занятиях, в какую группу/уровень определить."${categoryFormat}
}

Пиши по-русски. Будь конкретным, как живой преподаватель, который реально разобрал работу.`;

  const selectedModel = await selectModel();
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: selectedModel,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
      maxOutputTokens: 3072,
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
