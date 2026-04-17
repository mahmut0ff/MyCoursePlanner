import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/providers/providers.dart';

class HomeworkReviewScreen extends ConsumerWidget {
  const HomeworkReviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final homeworkAsync = ref.watch(homeworkProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Проверка ДЗ'),
      ),
      body: homeworkAsync.when(
        data: (submissions) {
          if (submissions.isEmpty) {
            return const Center(child: Text('Нет домашних заданий для проверки'));
          }
          return RefreshIndicator(
            onRefresh: () async => ref.refresh(homeworkProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: submissions.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final sub = submissions[index] as Map<String, dynamic>;
                
                final isGraded = sub['status'] == 'graded';

                return Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: isGraded 
                          ? Colors.green.withValues(alpha: 0.1) 
                          : Theme.of(context).colorScheme.primaryContainer,
                      child: Icon(
                        isGraded ? Icons.check : Icons.pending_actions,
                        color: isGraded 
                            ? Colors.green[700] 
                            : Theme.of(context).colorScheme.onPrimaryContainer,
                      ),
                    ),
                    title: Text(sub['studentName'] ?? 'Студент', style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Text(sub['lessonTitle'] ?? 'Урок'),
                        if (isGraded) ...[
                          const SizedBox(height: 4),
                          Text('Оценка: ${sub['grade']}', style: TextStyle(color: Colors.green[700], fontWeight: FontWeight.bold)),
                        ]
                      ],
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    isThreeLine: isGraded,
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('В разработке (проверка ДЗ)')));
                    },
                  ),
                );
              },
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
                onPressed: () => ref.refresh(homeworkProvider),
                child: const Text('Повторить'),
              )
            ],
          ),
        ),
      ),
    );
  }
}

