import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/providers/providers.dart';
import 'homework_detail_screen.dart';

class HomeworkReviewScreen extends ConsumerWidget {
  const HomeworkReviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final homeworkAsync = ref.watch(homeworkProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Проверка ДЗ')),
      body: homeworkAsync.when(
        data: (submissions) {
          if (submissions.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.assignment_outlined, size: 72, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                  const SizedBox(height: 16),
                  const Text('Нет домашних заданий', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Text('Здесь появятся работы студентов', style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.refresh(homeworkProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: submissions.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final sub = submissions[index] as Map<String, dynamic>;
                final isGraded = sub['status'] == 'graded';

                return GestureDetector(
                  onTap: () {
                    Navigator.push(context, MaterialPageRoute(builder: (_) => HomeworkDetailScreen(submission: sub)));
                  },
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
                          width: 48, height: 48,
                          decoration: BoxDecoration(
                            color: isGraded ? Colors.green.withValues(alpha: 0.1) : const Color(0xFFF59E0B).withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            isGraded ? Icons.check_circle_outline : Icons.pending_actions,
                            color: isGraded ? Colors.green[600] : const Color(0xFFF59E0B),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(sub['studentName'] ?? 'Студент', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                              const SizedBox(height: 4),
                              Text(sub['lessonTitle'] ?? 'Урок', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                            ],
                          ),
                        ),
                        if (isGraded)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(color: Colors.green.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                            child: Text('${sub['grade']}', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.green[700])),
                          )
                        else
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(color: const Color(0xFFF59E0B).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                            child: const Text('Ожидает', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12, color: Color(0xFFF59E0B))),
                          ),
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
                FilledButton.icon(icon: const Icon(Icons.refresh), label: const Text('Повторить'), onPressed: () => ref.refresh(homeworkProvider)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
