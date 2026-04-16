import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/providers/auth_provider.dart';

/// Achievements screen — shows all badges, XP progress, levels, and streaks.
/// Matches the web platform's gamification page.
class AchievementsScreen extends ConsumerWidget {
  const AchievementsScreen({super.key});

  // All 23 badge definitions from the backend
  static const _badgeDefs = <String, Map<String, String>>{
    'first_exam': {
      'icon': '🎯',
      'title': 'Первый экзамен',
      'desc': 'Сдали свой первый экзамен',
      'cat': 'exams'
    },
    'perfect_score': {
      'icon': '💎',
      'title': 'Перфекционист',
      'desc': 'Получили 100% на экзамене',
      'cat': 'exams'
    },
    'streak_3': {
      'icon': '🔥',
      'title': 'Серия — 3',
      'desc': '3 экзамена подряд сданы',
      'cat': 'exams'
    },
    'streak_7': {
      'icon': '⚡',
      'title': 'Серия — 7',
      'desc': '7 экзаменов подряд сданы',
      'cat': 'exams'
    },
    'streak_30': {
      'icon': '🏆',
      'title': 'Легенда серий',
      'desc': '30 экзаменов подряд сданы',
      'cat': 'exams'
    },
    'speed_demon': {
      'icon': '⏱️',
      'title': 'Быстрый ум',
      'desc': 'Сдали экзамен менее чем за 5 минут',
      'cat': 'exams'
    },
    'ten_exams': {
      'icon': '📚',
      'title': 'Десятак',
      'desc': 'Сдали 10 экзаменов',
      'cat': 'exams'
    },
    'fifty_exams': {
      'icon': '🎖️',
      'title': 'Полтинник',
      'desc': 'Сдали 50 экзаменов',
      'cat': 'exams'
    },
    'first_lesson': {
      'icon': '📖',
      'title': 'Книжный червь',
      'desc': 'Изучили первый урок',
      'cat': 'lessons'
    },
    'five_lessons': {
      'icon': '🧠',
      'title': 'Жажда знаний',
      'desc': 'Изучили 5 уроков',
      'cat': 'lessons'
    },
    'twenty_lessons': {
      'icon': '🎓',
      'title': 'Эрудит',
      'desc': 'Изучили 20 уроков',
      'cat': 'lessons'
    },
    'first_quiz': {
      'icon': '🎮',
      'title': 'Новый игрок',
      'desc': 'Сыграли в первую викторину',
      'cat': 'quizzes'
    },
    'quiz_winner': {
      'icon': '🏅',
      'title': 'Чемпион',
      'desc': 'Высокий балл в викторине',
      'cat': 'quizzes'
    },
    'five_quizzes': {
      'icon': '🎲',
      'title': 'Азартный ученик',
      'desc': 'Завершили 5 викторин',
      'cat': 'quizzes'
    },
    'joined_org': {
      'icon': '🤝',
      'title': 'Часть команды',
      'desc': 'Вступили в учебный центр',
      'cat': 'community'
    },
    'three_orgs': {
      'icon': '🌍',
      'title': 'Сетевик',
      'desc': 'Состоите в 3 учебных центрах',
      'cat': 'community'
    },
    'first_post': {
      'icon': '📝',
      'title': 'Спикер',
      'desc': 'Первая запись в портфолио',
      'cat': 'community'
    },
    'level_5': {
      'icon': '⭐',
      'title': 'Достигатор',
      'desc': 'Достигли 5-го уровня',
      'cat': 'general'
    },
    'level_10': {
      'icon': '👑',
      'title': 'Легенда',
      'desc': 'Достигли 10-го уровня',
      'cat': 'general'
    },
    'night_owl': {
      'icon': '🦉',
      'title': 'Ночная сова',
      'desc': 'Учились после полуночи',
      'cat': 'general'
    },
    'first_grade': {
      'icon': '📝',
      'title': 'Первая оценка',
      'desc': 'Получили первую оценку',
      'cat': 'grades'
    },
    'perfect_grade': {
      'icon': '✨',
      'title': 'Отличник',
      'desc': 'Максимальный балл за задание',
      'cat': 'grades'
    },
    'streak_5_attendance': {
      'icon': '📅',
      'title': 'Примерный студент',
      'desc': '5 занятий без пропусков',
      'cat': 'grades'
    },
  };

  static const _categories = {
    'exams': 'Экзамены',
    'lessons': 'Уроки',
    'quizzes': 'Викторины',
    'community': 'Сообщество',
    'general': 'Общие',
    'grades': 'Оценки',
  };

  // Level definitions matching the backend
  static const _levels = [
    {'level': 1, 'xp': 0, 'title': 'Новичок'},
    {'level': 2, 'xp': 100, 'title': 'Ученик'},
    {'level': 3, 'xp': 300, 'title': 'Практикант'},
    {'level': 4, 'xp': 600, 'title': 'Знаток'},
    {'level': 5, 'xp': 1000, 'title': 'Мастер'},
    {'level': 6, 'xp': 1500, 'title': 'Эксперт'},
    {'level': 7, 'xp': 2500, 'title': 'Профессор'},
    {'level': 8, 'xp': 4000, 'title': 'Академик'},
    {'level': 9, 'xp': 6000, 'title': 'Гений'},
    {'level': 10, 'xp': 10000, 'title': 'Легенда'},
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final gamification = ref.watch(gamificationProvider).valueOrNull;

    final xp = gamification?.xp ?? 0;
    final level = gamification?.level.level ?? 1;
    final levelTitle = gamification?.level.title ?? 'Новичок';
    final nextLevelXp = gamification?.level.nextLevelXp;
    final streak = gamification?.streak ?? 0;
    final bestStreak = gamification?.bestStreak ?? 0;
    final totalExams = gamification?.totalExams ?? 0;
    final passedExams = gamification?.passedExams ?? 0;
    final earnedBadges = Set<String>.from(gamification?.badges ?? []);

    final progress = gamification?.progressToNextLevel ?? 0.0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Достижения'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(gamificationProvider),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ── Level Card ──
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    theme.colorScheme.primary,
                    theme.colorScheme.primary.withValues(alpha: 0.7),
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Уровень $level',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            levelTitle,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.8),
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          '$xp XP',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  // Progress bar
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: LinearProgressIndicator(
                      value: progress,
                      minHeight: 10,
                      backgroundColor: Colors.white.withValues(alpha: 0.2),
                      valueColor:
                          const AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '$xp XP',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.7),
                          fontSize: 12,
                        ),
                      ),
                      Text(
                        nextLevelXp != null
                            ? '$nextLevelXp XP'
                            : 'Максимум!',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.7),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // ── Stats Grid ──
            Row(
              children: [
                _MiniStat(
                    value: '$streak',
                    label: 'Стрик',
                    icon: '🔥',
                    isDark: isDark,
                    theme: theme),
                const SizedBox(width: 10),
                _MiniStat(
                    value: '$bestStreak',
                    label: 'Лучший',
                    icon: '🏆',
                    isDark: isDark,
                    theme: theme),
                const SizedBox(width: 10),
                _MiniStat(
                    value: '$totalExams',
                    label: 'Экзамены',
                    icon: '📝',
                    isDark: isDark,
                    theme: theme),
                const SizedBox(width: 10),
                _MiniStat(
                    value: '$passedExams',
                    label: 'Сдано',
                    icon: '✅',
                    isDark: isDark,
                    theme: theme),
              ],
            ),
            const SizedBox(height: 24),

            // ── Level Roadmap ──
            Text(
              'Уровни',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 90,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _levels.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (ctx, i) {
                  final lvl = _levels[i];
                  final lvlNum = lvl['level'] as int;
                  final lvlXp = lvl['xp'] as int;
                  final lvlTitle = lvl['title'] as String;
                  final isReached = level >= lvlNum;
                  final isCurrent = level == lvlNum;

                  return Container(
                    width: 80,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isCurrent
                          ? theme.colorScheme.primary.withValues(alpha: 0.15)
                          : isDark
                              ? const Color(0xFF1E293B)
                              : Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isCurrent
                            ? theme.colorScheme.primary
                            : theme.colorScheme.outline
                                .withValues(alpha: 0.1),
                        width: isCurrent ? 2 : 1,
                      ),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          '$lvlNum',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: isReached
                                ? theme.colorScheme.primary
                                : theme.colorScheme.onSurface
                                    .withValues(alpha: 0.2),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          lvlTitle,
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w500,
                            color: isReached
                                ? theme.colorScheme.onSurface
                                : theme.colorScheme.onSurface
                                    .withValues(alpha: 0.3),
                          ),
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '$lvlXp XP',
                          style: TextStyle(
                            fontSize: 9,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.35),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 24),

            // ── Badges by Category ──
            ..._categories.entries.map((catEntry) {
              final catId = catEntry.key;
              final catTitle = catEntry.value;
              final catBadges = _badgeDefs.entries
                  .where((e) => e.value['cat'] == catId)
                  .toList();

              if (catBadges.isEmpty) return const SizedBox.shrink();

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    catTitle,
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 10),
                  ...catBadges.map((entry) {
                    final badgeId = entry.key;
                    final def = entry.value;
                    final earned = earnedBadges.contains(badgeId);

                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color:
                              isDark ? const Color(0xFF1E293B) : Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: earned
                                ? theme.colorScheme.primary
                                    .withValues(alpha: 0.3)
                                : theme.colorScheme.outline
                                    .withValues(alpha: 0.08),
                          ),
                        ),
                        child: Row(
                          children: [
                            Text(
                              def['icon'] ?? '🎖️',
                              style: TextStyle(
                                fontSize: 32,
                                color: earned ? null : Colors.grey,
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    def['title'] ?? '',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: earned
                                          ? null
                                          : theme.colorScheme.onSurface
                                              .withValues(alpha: 0.35),
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    def['desc'] ?? '',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: theme.colorScheme.onSurface
                                          .withValues(
                                              alpha: earned ? 0.5 : 0.25),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (earned)
                              Icon(
                                Icons.check_circle,
                                color: theme.colorScheme.primary,
                                size: 22,
                              )
                            else
                              Icon(
                                Icons.lock_outline,
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.15),
                                size: 20,
                              ),
                          ],
                        ),
                      ),
                    );
                  }),
                  const SizedBox(height: 16),
                ],
              );
            }),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String value;
  final String label;
  final String icon;
  final bool isDark;
  final ThemeData theme;

  const _MiniStat({
    required this.value,
    required this.label,
    required this.icon,
    required this.isDark,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: theme.colorScheme.outline.withValues(alpha: 0.1),
          ),
        ),
        child: Column(
          children: [
            Text(icon, style: const TextStyle(fontSize: 18)),
            const SizedBox(height: 4),
            Text(value,
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w800)),
            Text(label,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurface
                      .withValues(alpha: 0.5),
                  fontSize: 10,
                )),
          ],
        ),
      ),
    );
  }
}
