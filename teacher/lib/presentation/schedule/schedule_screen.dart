import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../domain/providers/providers.dart';

class ScheduleScreen extends ConsumerWidget {
  const ScheduleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheduleAsync = ref.watch(scheduleProvider);
    final canCreate = ref.watch(canCreateProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Расписание'),
        actions: [
          if (canCreate)
            IconButton(
              icon: const Icon(Icons.add),
              tooltip: 'Добавить занятие',
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('В разработке (Создание события)')),
                );
              },
            ),
        ],
      ),
      body: scheduleAsync.when(
        data: (events) {
          if (events.isEmpty) {
            return const Center(child: Text('Расписание пусто'));
          }

          // Sort by start time if available
          final sortedEvents = List<Map<String, dynamic>>.from(events);
          sortedEvents.sort((a, b) {
            final t1 = a['startTime'] ?? '';
            final t2 = b['startTime'] ?? '';
            return t1.compareTo(t2);
          });

          return RefreshIndicator(
            onRefresh: () async => ref.refresh(scheduleProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: sortedEvents.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final ev = sortedEvents[index];
                
                DateTime? date;
                if (ev['date'] != null) {
                  try { date = DateTime.parse(ev['date']); } catch (_) {}
                }
                
                final dayStr = date != null ? DateFormat('dd.MM.yyyy').format(date) : 'Еженедельно';
                final timeStr = '${ev['startTime'] ?? '--:--'} - ${ev['endTime'] ?? '--:--'}';

                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 4,
                          height: 60,
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(timeStr, style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 4),
                              Text(ev['title'] ?? 'Занятие', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                              const SizedBox(height: 4),
                              Text('$dayStr • Группа: ${ev['groupName'] ?? 'Не указана'}', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.more_vert),
                          onPressed: () {
                            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('В разработке (редактирование)')));
                          },
                        )
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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Ошибка: $err'),
              ElevatedButton(
                onPressed: () => ref.refresh(scheduleProvider),
                child: const Text('Повторить'),
              )
            ],
          ),
        ),
      ),
    );
  }
}

