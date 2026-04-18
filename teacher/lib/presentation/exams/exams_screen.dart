import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/providers.dart';

class ExamsScreen extends ConsumerWidget {
  const ExamsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final examsAsync = ref.watch(examsProvider);
    final canCreate = ref.watch(canCreateProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Экзамены'),
        actions: [
          if (canCreate)
            IconButton(
              icon: const Icon(Icons.add_circle_outline),
              tooltip: 'Добавить экзамен',
              onPressed: () => context.push('/exams/new'),
            ),
        ],
      ),
      body: examsAsync.when(
        data: (exams) {
          if (exams.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.quiz_outlined, size: 72, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                  const SizedBox(height: 16),
                  const Text('Нет экзаменов', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Text('Создайте первый экзамен', style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.refresh(examsProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: exams.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final e = exams[index] as Map<String, dynamic>;
                final isPublished = e['status'] == 'published';
                final questionsCount = e['questionsCount'] ?? e['questions']?.length ?? 0;

                return GestureDetector(
                  onTap: () => context.push('/exams/${e['id']}'),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2))],
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 52, height: 52,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [const Color(0xFFF59E0B).withValues(alpha: 0.15), const Color(0xFFF59E0B).withValues(alpha: 0.05)],
                              begin: Alignment.topLeft, end: Alignment.bottomRight,
                            ),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(Icons.assignment_outlined, color: Color(0xFFF59E0B), size: 24),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(e['title'] ?? 'Без названия', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                              const SizedBox(height: 5),
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: isPublished ? Colors.green.withValues(alpha: 0.1) : Colors.amber.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      isPublished ? 'Опубликован' : 'Черновик',
                                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isPublished ? Colors.green[700] : Colors.amber[800]),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Icon(Icons.quiz_outlined, size: 14, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                                  const SizedBox(width: 3),
                                  Text('$questionsCount вопр.', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                                ],
                              ),
                            ],
                          ),
                        ),
                        Icon(Icons.chevron_right, size: 20, color: theme.colorScheme.onSurface.withValues(alpha: 0.3)),
                      ],
                    ),
                  ),
                );
              },
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
                FilledButton.icon(icon: const Icon(Icons.refresh), label: const Text('Повторить'), onPressed: () => ref.refresh(examsProvider)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
