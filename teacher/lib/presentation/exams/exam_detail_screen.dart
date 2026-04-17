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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Экзамен'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Редактировать',
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('В разработке')),
              );
            },
          ),
        ],
      ),
      body: examAsync.when(
        data: (exam) {
          if (exam.isEmpty) return const Center(child: Text('Экзамен не найден.'));

          return RefreshIndicator(
            onRefresh: () async {
              ref.refresh(examProvider(examId).future);
              ref.refresh(attemptsProvider(examId).future);
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Info Card
                Card(
                  elevation: 0,
                  color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          exam['title'] ?? 'Без названия',
                          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: Theme.of(context).colorScheme.primaryContainer,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Text(
                                exam['subject'] ?? 'Без предмета',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Theme.of(context).colorScheme.onPrimaryContainer,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            if (exam['duration'] != null)
                              Row(
                                children: [
                                  Icon(Icons.timer_outlined, size: 16, color: Theme.of(context).colorScheme.onSurfaceVariant),
                                  const SizedBox(width: 4),
                                  Text('${exam['duration']} мин', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                                ],
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                
                const Text('Результаты', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                
                // Attempts List
                attemptsAsync.when(
                  data: (attempts) {
                    if (attempts.isEmpty) {
                      return const Padding(
                        padding: EdgeInsets.symmetric(vertical: 32),
                        child: Center(child: Text('Пока никто не сдал экзамен.')),
                      );
                    }
                    return ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: attempts.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final atmpt = attempts[index];
                        final score = atmpt['score'] ?? 0;
                        final isPassed = score >= (exam['passingScore'] ?? 50);
                        final submittedAt = atmpt['submittedAt'] != null 
                            ? DateFormat('dd.MM.yyyy HH:mm').format(DateTime.parse(atmpt['submittedAt'])) 
                            : 'Неизвестно';
                            
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: CircleAvatar(
                            backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                            child: const Icon(Icons.person_outline),
                          ),
                          title: Text(atmpt['studentName'] ?? 'Студент', style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text('Сдан: $submittedAt'),
                          trailing: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: isPassed ? Colors.green.withValues(alpha: 0.1) : Colors.red.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              '$score%',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: isPassed ? Colors.green[700] : Colors.red[700],
                              ),
                            ),
                          ),
                        );
                      },
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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Ошибка: $err'),
              ElevatedButton(
                onPressed: () => ref.refresh(examProvider(examId)),
                child: const Text('Повторить'),
              )
            ],
          ),
        ),
      ),
    );
  }
}

