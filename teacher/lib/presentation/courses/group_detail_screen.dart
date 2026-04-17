import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/providers.dart';

class GroupDetailScreen extends ConsumerWidget {
  final String groupId;
  const GroupDetailScreen({super.key, required this.groupId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lessonsAsync = ref.watch(lessonsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Уроки'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Добавить урок',
            onPressed: () {
              context.push('/lessons/new?groupId=$groupId');
            },
          ),
        ],
      ),
      body: lessonsAsync.when(
        data: (allLessons) {
          final groupLessons = allLessons
              .cast<Map<String, dynamic>>()
              .where((l) => (l['groupIds'] as List?)?.contains(groupId) ?? false)
              .toList();

          if (groupLessons.isEmpty) {
            return const Center(child: Text('Нет уроков в этой группе.'));
          }

          return RefreshIndicator(
            onRefresh: () async => ref.refresh(lessonsProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: groupLessons.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final l = groupLessons[index];
                return Card(
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => context.push('/lessons/${l['id']}'),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 60,
                            height: 60,
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.secondaryContainer,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(
                              Icons.play_lesson_outlined,
                              color: Theme.of(context).colorScheme.onSecondaryContainer,
                              size: 28,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  l['title'] ?? 'Без названия',
                                  style: const TextStyle(
                                      fontSize: 16, fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  l['subject'] ?? 'Предмет не указан',
                                  style: TextStyle(
                                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                                    fontSize: 13,
                                  ),
                                ),
                                if (l['status'] != null) ...[
                                  const SizedBox(height: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: l['status'] == 'published'
                                          ? Colors.green.withValues(alpha: 0.1)
                                          : Colors.amber.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      l['status'] == 'published'
                                          ? 'Опубликован'
                                          : 'Черновик',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                        color: l['status'] == 'published'
                                            ? Colors.green[700]
                                            : Colors.amber[800],
                                      ),
                                    ),
                                  ),
                                ]
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
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
                onPressed: () => ref.refresh(lessonsProvider),
                child: const Text('Повторить'),
              )
            ],
          ),
        ),
      ),
    );
  }
}

