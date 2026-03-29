import React from 'react';
export const BADGE_DEFS: Record<string, { icon: string; title: string; description: string }> = {
  // --- Exams ---
  first_exam: { icon: '🎯', title: 'Первый экзамен', description: 'Сдали свой первый экзамен' },
  perfect_score: { icon: '💎', title: 'Перфекционист', description: 'Получили 100% на экзамене' },
  streak_3: { icon: '🔥', title: 'Серия — 3', description: '3 экзамена подряд сданы' },
  streak_7: { icon: '⚡', title: 'Серия — 7', description: '7 экзаменов подряд сданы' },
  streak_30: { icon: '🏆', title: 'Легенда серий', description: '30 экзаменов подряд сданы' },
  speed_demon: { icon: '⏱️', title: 'Быстрый ум', description: 'Сдали экзамен менее чем за 5 минут' },
  ten_exams: { icon: '📚', title: 'Десяточник', description: 'Сдали 10 экзаменов' },
  fifty_exams: { icon: '🎖️', title: 'Полтинник', description: 'Сдали 50 экзаменов' },
  // --- Lessons ---
  first_lesson: { icon: '📖', title: 'Книжный червь', description: 'Изучили первый урок' },
  five_lessons: { icon: '🧠', title: 'Жажда знаний', description: 'Изучили 5 уроков' },
  twenty_lessons: { icon: '🎓', title: 'Эрудит', description: 'Изучили 20 уроков' },
  // --- Quizzes ---
  first_quiz: { icon: '🎮', title: 'Новый игрок', description: 'Сыграли в свою первую викторину' },
  quiz_winner: { icon: '🏅', title: 'Чемпион', description: 'Успешно прошли викторину на высокий балл' },
  five_quizzes: { icon: '🎲', title: 'Азартный ученик', description: 'Завершили 5 викторин' },
  // --- Organizations & Community ---
  joined_org: { icon: '🤝', title: 'Часть команды', description: 'Вступили в свой первый учебный центр' },
  three_orgs: { icon: '🌍', title: 'Сетевик', description: 'Состоите в 3 учебных центрах' },
  first_post: { icon: '📝', title: 'Спикер', description: 'Опубликовали первую запись в портфолио' },
  // --- General XP & Levels ---
  level_5: { icon: '⭐', title: 'Достигатор', description: 'Достигли 5-го уровня' },
  level_10: { icon: '👑', title: 'Легенда Университета', description: 'Достигли 10-го (максимального) уровня' },
  night_owl: { icon: '🦉', title: 'Ночная сова', description: 'Учились после полуночи' },
  // --- Grades & Attendance ---
  first_grade: { icon: '📝', title: 'Первая оценка', description: 'Получили первую оценку в журнал' },
  perfect_grade: { icon: '✨', title: 'Отличник', description: 'Получили максимальный балл за задание' },
  streak_5_attendance: { icon: '📅', title: 'Примерный студент', description: '5 занятий подряд без пропусков' }
};

export const PinnedBadgesDisplay: React.FC<{ badges?: string[], className?: string }> = ({ badges, className = '' }) => {
  if (!badges || badges.length === 0) return null;
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {badges.slice(0, 3).map(id => {
        const def = BADGE_DEFS[id];
        if (!def) return null;
        return (
          <div key={id} className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs shadow-sm" title={def.title}>
            {def.icon}
          </div>
        );
      })}
    </div>
  );
};
