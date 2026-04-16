import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';


import '../../domain/providers/exam_providers.dart';
import '../common/error_view.dart';

class AttemptDetailScreen extends ConsumerWidget {
  final String attemptId;

  const AttemptDetailScreen({super.key, required this.attemptId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final attemptAsync = ref.watch(attemptDetailProvider(attemptId));

    return Scaffold(
      appBar: AppBar(title: const Text('Результат экзамена')),
      body: attemptAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: 'Не удалось загрузить результат',
          onRetry: () =>
              ref.invalidate(attemptDetailProvider(attemptId)),
        ),
        data: (attempt) {
          final passed = attempt.passed;
          final scoreColor = passed
              ? const Color(0xFF10B981)
              : const Color(0xFFEF4444);

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // ── Score Hero ──
              Container(
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: passed
                        ? [
                            const Color(0xFF10B981),
                            const Color(0xFF059669),
                          ]
                        : [
                            const Color(0xFFEF4444),
                            const Color(0xFFDC2626),
                          ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: scoreColor.withValues(alpha: 0.3),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    Text(
                      attempt.percentageText,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 56,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      passed ? 'Экзамен сдан! 🎉' : 'Не сдан',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      attempt.examTitle,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.7),
                        fontSize: 14,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // ── Stats Row ──
              Row(
                children: [
                  _StatChip(
                    label: 'Баллы',
                    value: '${attempt.score}/${attempt.totalPoints}',
                    icon: Icons.star_rounded,
                  ),
                  const SizedBox(width: 10),
                  _StatChip(
                    label: 'Время',
                    value: attempt.durationText,
                    icon: Icons.timer_outlined,
                  ),
                  const SizedBox(width: 10),
                  _StatChip(
                    label: 'Вопросов',
                    value: '${attempt.questionResults.length}',
                    icon: Icons.quiz_outlined,
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // ── AI Feedback ──
              if (attempt.aiFeedback != null) ...[
                Text(
                  'AI Анализ',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                if (attempt.aiFeedback!.summary.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: isDark
                          ? const Color(0xFF1E293B)
                          : Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: theme.colorScheme.outline
                            .withValues(alpha: 0.1),
                      ),
                    ),
                    child: Text(
                      attempt.aiFeedback!.summary,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        height: 1.5,
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                const SizedBox(height: 12),

                // Strengths
                if (attempt.aiFeedback!.strengths.isNotEmpty) ...[
                  _FeedbackSection(
                    title: 'Сильные стороны',
                    items: attempt.aiFeedback!.strengths,
                    color: const Color(0xFF10B981),
                    icon: Icons.thumb_up_alt_rounded,
                  ),
                  const SizedBox(height: 12),
                ],

                // Weak topics
                if (attempt.aiFeedback!.weakTopics.isNotEmpty) ...[
                  _FeedbackSection(
                    title: 'Слабые темы',
                    items: attempt.aiFeedback!.weakTopics,
                    color: const Color(0xFFF59E0B),
                    icon: Icons.warning_amber_rounded,
                  ),
                  const SizedBox(height: 12),
                ],

                // Suggestions
                if (attempt
                    .aiFeedback!.reviewSuggestions.isNotEmpty) ...[
                  _FeedbackSection(
                    title: 'Рекомендации',
                    items: attempt.aiFeedback!.reviewSuggestions,
                    color: const Color(0xFF3B82F6),
                    icon: Icons.lightbulb_outline_rounded,
                  ),
                ],
                const SizedBox(height: 24),
              ],

              // ── Question Results ──
              if (attempt.questionResults.isNotEmpty) ...[
                Text(
                  'Ответы по вопросам',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                ...attempt.questionResults.asMap().entries.map((entry) {
                  final idx = entry.key;
                  final qr = entry.value;
                  final isPending = qr.status == 'pending_review';
                  final Color qColor = isPending
                      ? const Color(0xFFF59E0B)
                      : qr.isCorrect
                          ? const Color(0xFF10B981)
                          : const Color(0xFFEF4444);
                  final IconData qIcon = isPending
                      ? Icons.hourglass_top_rounded
                      : qr.isCorrect
                          ? Icons.check_rounded
                          : Icons.close_rounded;
                  final String qLabel = isPending
                      ? 'На проверке'
                      : '${qr.pointsEarned}/${qr.pointsPossible} баллов';

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: isDark
                            ? const Color(0xFF1E293B)
                            : Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: qColor.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: qColor.withValues(alpha: 0.1),
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: Icon(
                                qIcon,
                                size: 16,
                                color: qColor,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${idx + 1}. ${qr.questionText}',
                                  style: theme.textTheme.bodyMedium
                                      ?.copyWith(
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  qLabel,
                                  style: theme.textTheme.labelSmall
                                      ?.copyWith(
                                    color: isPending
                                        ? qColor
                                        : theme
                                            .colorScheme.onSurface
                                            .withValues(alpha: 0.4),
                                    fontWeight: isPending
                                        ? FontWeight.w600
                                        : FontWeight.w400,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;

  const _StatChip({
    required this.label,
    required this.value,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color:
                theme.colorScheme.outline.withValues(alpha: 0.1),
          ),
        ),
        child: Column(
          children: [
            Icon(icon,
                size: 20,
                color: theme.colorScheme.primary
                    .withValues(alpha: 0.6)),
            const SizedBox(height: 6),
            Text(
              value,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurface
                    .withValues(alpha: 0.5),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeedbackSection extends StatelessWidget {
  final String title;
  final List<String> items;
  final Color color;
  final IconData icon;

  const _FeedbackSection({
    required this.title,
    required this.items,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: color.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 8),
              Text(
                title,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...items.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('• ',
                        style: TextStyle(color: color, fontSize: 14)),
                    Expanded(
                      child: Text(
                        item,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.7),
                        ),
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}
