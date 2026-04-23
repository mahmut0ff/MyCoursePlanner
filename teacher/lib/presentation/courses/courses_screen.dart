import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/providers.dart';

class CoursesScreen extends ConsumerWidget {
  const CoursesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coursesAsync = ref.watch(coursesProvider);
    final groupsAsync = ref.watch(groupsProvider(null));
    final canCreate = ref.watch(canCreateProvider);
    final theme = Theme.of(context);

    // Build a map of courseId -> group count
    final groupCountMap = <String, int>{};
    groupsAsync.whenData((groups) {
      for (final g in groups) {
        final gMap = g as Map<String, dynamic>;
        final cid = gMap['courseId']?.toString() ?? '';
        if (cid.isNotEmpty) groupCountMap[cid] = (groupCountMap[cid] ?? 0) + 1;
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Курсы'),
        actions: [
          if (canCreate)
            IconButton(
              icon: const Icon(Icons.add_circle_outline),
              tooltip: 'Добавить курс',
              onPressed: () => context.push('/courses/new'),
            ),
        ],
      ),
      body: coursesAsync.when(
        data: (courses) {
          if (courses.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.school_outlined, size: 72, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                  const SizedBox(height: 16),
                  const Text('Нет курсов', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Text('Курсы появятся здесь', style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                  if (canCreate) ...[
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      icon: const Icon(Icons.add),
                      label: const Text('Создать курс'),
                      onPressed: () => context.push('/courses/new'),
                    ),
                  ],
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(coursesProvider);
              ref.invalidate(groupsProvider(null));
              // Wait for the providers to reload
              await ref.read(coursesProvider.future);
              await ref.read(groupsProvider(null).future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: courses.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final c = courses[index] as Map<String, dynamic>;
                final courseId = c['id']?.toString() ?? '';
                final groupCount = groupCountMap[courseId] ?? 0;
                return GestureDetector(
                  onTap: () => context.push('/courses/${c['id']}'),
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
                              colors: [theme.colorScheme.primary.withValues(alpha: 0.15), theme.colorScheme.primary.withValues(alpha: 0.05)],
                              begin: Alignment.topLeft, end: Alignment.bottomRight,
                            ),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Icon(Icons.auto_stories_rounded, color: theme.colorScheme.primary, size: 24),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(c['title'] ?? c['name'] ?? 'Без названия', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis, maxLines: 1),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  if (c['subject'] != null && c['subject'].toString().isNotEmpty) ...[
                                    Flexible(
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(6)),
                                        child: Text(c['subject'], style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: theme.colorScheme.primary), overflow: TextOverflow.ellipsis),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                  ],
                                  Text('$groupCount групп', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
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
                FilledButton.icon(icon: const Icon(Icons.refresh), label: const Text('Повторить'), onPressed: () => ref.refresh(coursesProvider)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
