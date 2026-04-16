import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/models/schedule_event.dart';
import '../../domain/providers/schedule_providers.dart';
import '../common/shimmer_list.dart';
import '../common/empty_state.dart';

class ScheduleScreen extends ConsumerWidget {
  const ScheduleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final now = DateTime.now();
    final selectedDate = ref.watch(selectedDateProvider);
    final eventsAsync = ref.watch(dayScheduleProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Расписание'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.push('/notifications'),
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Date Picker (horizontal) ──
          SizedBox(
            height: 90,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              itemCount: 7,
              itemBuilder: (context, index) {
                final date =
                    now.add(Duration(days: index - now.weekday + 1));
                final isSelected = date.day == selectedDate.day &&
                    date.month == selectedDate.month &&
                    date.year == selectedDate.year;
                final dayNames = [
                  'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'
                ];
                final dayName = dayNames[date.weekday - 1];

                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: GestureDetector(
                    onTap: () {
                      ref.read(selectedDateProvider.notifier).state = date;
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      width: 52,
                      decoration: BoxDecoration(
                        color: isSelected
                            ? theme.colorScheme.primary
                            : isDark
                                ? const Color(0xFF1E293B)
                                : Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: isSelected
                            ? null
                            : Border.all(
                                color: theme.colorScheme.outline
                                    .withValues(alpha: 0.1),
                              ),
                        boxShadow: isSelected
                            ? [
                                BoxShadow(
                                  color: theme.colorScheme.primary
                                      .withValues(alpha: 0.3),
                                  blurRadius: 12,
                                  offset: const Offset(0, 4),
                                ),
                              ]
                            : null,
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            dayName,
                            style: TextStyle(
                              color: isSelected
                                  ? Colors.white70
                                  : theme.colorScheme.onSurface
                                      .withValues(alpha: 0.5),
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${date.day}',
                            style: TextStyle(
                              color: isSelected
                                  ? Colors.white
                                  : theme.colorScheme.onSurface,
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const Divider(height: 1),

          // ── Events List (real data) ──
          Expanded(
            child: eventsAsync.when(
              loading: () =>
                  const ShimmerList(itemCount: 4, itemHeight: 90),
              error: (_, __) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Ошибка загрузки'),
                    TextButton(
                      onPressed: () =>
                          ref.invalidate(dayScheduleProvider),
                      child: const Text('Повторить'),
                    ),
                  ],
                ),
              ),
              data: (events) {
                if (events.isEmpty) {
                  return const EmptyState(
                    icon: Icons.event_available_rounded,
                    title: 'Нет занятий',
                    subtitle: 'На этот день нет запланированных занятий',
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async =>
                      ref.invalidate(dayScheduleProvider),
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: events.map((event) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 50,
                              child: Text(
                                event.startTime,
                                style: theme.textTheme.labelMedium
                                    ?.copyWith(
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.4),
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                            Expanded(
                              child: _EventCard(event: event),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  final ScheduleEvent event;

  const _EventCard({required this.event});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isExam = event.isExam;
    final color =
        isExam ? const Color(0xFFEF4444) : const Color(0xFF3B82F6);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border(left: BorderSide(color: color, width: 4)),
        boxShadow: isDark
            ? null
            : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  isExam ? 'Экзамен' : 'Урок',
                  style: TextStyle(
                    color: color,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                '${event.startTime} – ${event.endTime}',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurface
                      .withValues(alpha: 0.4),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            event.title,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          if (event.subtitle.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              event.subtitle,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface
                    .withValues(alpha: 0.5),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
