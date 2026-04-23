import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../domain/providers/providers.dart';

class ExamDetailScreen extends ConsumerWidget {
  final String examId;
  const ExamDetailScreen({super.key, required this.examId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final examAsync = ref.watch(examProvider(examId));
    final attemptsAsync = ref.watch(attemptsProvider(examId));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Экзамен'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Редактировать',
            onPressed: () => context.push('/exams/$examId/edit'),
          ),
        ],
      ),
      body: examAsync.when(
        data: (exam) {
          if (exam.isEmpty) return const Center(child: Text('Экзамен не найден.'));

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(examProvider(examId));
              ref.invalidate(attemptsProvider(examId));
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Info Card
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [theme.colorScheme.primary, theme.colorScheme.primary.withValues(alpha: 0.7)],
                      begin: Alignment.topLeft, end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(exam['title'] ?? 'Без названия', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(10)),
                            child: Text(exam['subject'] ?? 'Без предмета', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                          ),
                          const SizedBox(width: 12),
                          if (exam['duration'] != null) ...[
                            const Icon(Icons.timer_outlined, size: 16, color: Colors.white70),
                            const SizedBox(width: 4),
                            Text('${exam['duration']} мин', style: const TextStyle(color: Colors.white70)),
                          ],
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          _MiniStat(label: 'Вопросов', value: '${exam['questionsCount'] ?? exam['questions']?.length ?? 0}', icon: Icons.quiz_outlined),
                          const SizedBox(width: 16),
                          _MiniStat(label: 'Проходной', value: '${exam['passingScore'] ?? 50}%', icon: Icons.check_circle_outline),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Results Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Результаты', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    attemptsAsync.when(
                      data: (a) => Text('${a.length} попыток', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                      loading: () => const SizedBox.shrink(),
                      error: (_, __) => const SizedBox.shrink(),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Attempts List
                attemptsAsync.when(
                  data: (attempts) {
                    if (attempts.isEmpty) {
                      return Container(
                        padding: const EdgeInsets.all(32),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
                        ),
                        child: Column(
                          children: [
                            Icon(Icons.assignment_outlined, size: 48, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                            const SizedBox(height: 12),
                            const Text('Пока никто не сдал экзамен', style: TextStyle(color: Colors.grey)),
                          ],
                        ),
                      );
                    }
                    return Column(
                      children: attempts.map((atmpt) {
                        final score = atmpt['score'] ?? 0;
                        final isPassed = score >= (exam['passingScore'] ?? 50);
                        String submittedAt = '—';
                        try {
                          submittedAt = DateFormat('dd.MM.yyyy HH:mm').format(DateTime.parse(atmpt['submittedAt']));
                        } catch (_) {}

                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
                          ),
                          child: Row(
                            children: [
                              CircleAvatar(
                                radius: 22,
                                backgroundColor: isPassed ? Colors.green.withValues(alpha: 0.1) : Colors.red.withValues(alpha: 0.1),
                                child: Icon(isPassed ? Icons.check : Icons.close, color: isPassed ? Colors.green[600] : Colors.red[600], size: 20),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(atmpt['studentName'] ?? 'Студент', style: const TextStyle(fontWeight: FontWeight.w600)),
                                    const SizedBox(height: 3),
                                    Text(submittedAt, style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                                  ],
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                  color: isPassed ? Colors.green.withValues(alpha: 0.1) : Colors.red.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text('$score%', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: isPassed ? Colors.green[700] : Colors.red[700])),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    );
                  },
                  loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
                  error: (err, _) => Text('Ошибка загрузки: $err'),
                ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error.withValues(alpha: 0.5)),
                const SizedBox(height: 12),
                Text('$err', style: const TextStyle(fontSize: 13), textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton.icon(icon: const Icon(Icons.refresh), label: const Text('Повторить'), onPressed: () => ref.refresh(examProvider(examId))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;

  const _MiniStat({required this.label, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.white70),
        const SizedBox(width: 5),
        Text('$value ', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
      ],
    );
  }
}
