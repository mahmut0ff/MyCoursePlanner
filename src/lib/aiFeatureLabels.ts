/**
 * Human labels for the AI usage counters.
 *
 * The netlify functions bump `recordAiUsage(orgId, feature)` into
 * organizations/{orgId}/aiUsage/{YYYY-MM}. Those keys are snake_case internals
 * (`assistant_action`, `director_brief`, …) and must never reach an owner's
 * screen — every surface that renders usage goes through this map.
 *
 * Keep in sync with the recordAiUsage() call sites in netlify/functions.
 */
export const AI_FEATURE_LABELS: Record<string, string> = {
  // Staff copilot (api-ai-assistant)
  assistant: 'Помощник администратора',
  assistant_action: 'Действия помощника',
  assistant_import: 'Распознавание списков',
  assistant_import_commit: 'Загрузка списков',

  // Owner analytics (api-ai-insights)
  insights_ask: 'AI-аналитик',
  insights_churn: 'Анализ оттока',
  insights_schedule: 'Анализ расписания',

  // Director / teacher copilot (utils/director-copilot, utils/copilot-actions)
  director_brief: 'Сводки для директора',
  director_copilot: 'Вопросы директора',
  director_voice: 'Голосовые вопросы',
  director_draft: 'Черновики рассылок',
  teacher_copilot: 'Помощник преподавателя',
  copilot_action: 'Действия копилота',

  // Public-facing bots
  sales_bot: 'Ответы абитуриентам',
  parent_summary: 'Сводки для родителей',
  parent_qa: 'Ответы родителям',
  student_tutor: 'Репетитор для учеников',

  // Student tools (api-ai-tutor)
  tutor: 'AI-репетитор',
  practice: 'Тренировки',
  explain: 'Разбор ошибок',
  studyplan: 'Планы обучения',
  speaking: 'Разговорный партнёр',

  // Content generation (api-ai-generate → `generate_${type}`)
  generate_quiz: 'Генерация викторин',
  generate_exam: 'Генерация экзаменов',
  generate_lesson_and_quiz: 'Конструктор уроков',
  generate_lesson_assist: 'Помощник урока',
  generate_syllabus_extraction: 'Импорт силлабуса',
  generate_material_summary: 'Анализ материалов',
  generate_report_comment: 'Комментарии в табель',
  generate_marketing_post: 'Маркетинговые посты',
  generate_translate: 'Переводы',
  generate_roster_extraction: 'Распознавание списков',
};

/**
 * Label for a usage counter. A key added on the backend before this map is
 * updated still renders as words, never as `some_raw_key`.
 */
export function aiFeatureLabel(key: string): string {
  const known = AI_FEATURE_LABELS[key];
  if (known) return known;
  const words = key.replace(/^generate_/, '').replace(/[_-]+/g, ' ').trim();
  if (!words) return 'Прочее';
  return words.charAt(0).toUpperCase() + words.slice(1);
}
