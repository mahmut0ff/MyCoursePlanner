import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';


import '../../domain/providers/exam_providers.dart';
import '../common/error_view.dart';

class AttemptDetailScreen extends ConsumerWidget {
  final String attemptId;

  const AttemptDetailScreen({super.key, required this.attemptId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
