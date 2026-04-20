import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../domain/providers/providers.dart';

class ScheduleScreen extends ConsumerStatefulWidget {
  const ScheduleScreen({super.key});

  @override
  ConsumerState<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends ConsumerState<ScheduleScreen> {
  int _selectedDayIndex = -1; // -1 = week view
  DateTime _weekStart = _getWeekStart(DateTime.now());

  static DateTime _getWeekStart(DateTime d) {
    final weekday = d.weekday; // 1=Mon
    return DateTime(d.year, d.month, d.day).subtract(Duration(days: weekday - 1));
  }

  static const _dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  static const _dayColors = [
    Color(0xFF7C3AED), Color(0xFF3B82F6), Color(0xFF10B981),
    Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFF8B5CF6), Color(0xFF6366F1),
  ];

  @override
  void initState() {
    super.initState();
    _selectedDayIndex = DateTime.now().weekday - 1; // auto-select today
  }

  @override
  Widget build(BuildContext context) {
    final scheduleAsync = ref.watch(scheduleProvider);
    final theme = Theme.of(context);
    final today = DateTime.now();
    final todayDayIndex = today.weekday - 1;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Расписание'),
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_month_outlined),
            tooltip: 'Выбрать дату',
            onPressed: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _selectedDayIndex >= 0
                    ? _weekStart.add(Duration(days: _selectedDayIndex))
                    : DateTime.now(),
                firstDate: DateTime(2020),
                lastDate: DateTime(2030),
                locale: const Locale('ru'),
              );
              if (picked != null) {
                setState(() {
                  _weekStart = _getWeekStart(picked);
                  _selectedDayIndex = picked.weekday - 1;
                });
              }
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Week Navigator ──
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Column(
              children: [
                // Week nav row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.chevron_left),
                      onPressed: () => setState(() => _weekStart = _weekStart.subtract(const Duration(days: 7))),
                    ),
                    GestureDetector(
                      onTap: () => setState(() {
                        _weekStart = _getWeekStart(DateTime.now());
                        _selectedDayIndex = todayDayIndex;
                      }),
                      child: Text(
                        '${DateFormat('dd MMM').format(_weekStart)} — ${DateFormat('dd MMM').format(_weekStart.add(const Duration(days: 6)))}',
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.chevron_right),
                      onPressed: () => setState(() => _weekStart = _weekStart.add(const Duration(days: 7))),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                // Day selector chips (horizontal)
                SizedBox(
                  height: 60,
                  child: Row(
                    children: List.generate(7, (i) {
                      final dayDate = _weekStart.add(Duration(days: i));
                      final isToday = dayDate.year == today.year && dayDate.month == today.month && dayDate.day == today.day;
                      final isSelected = _selectedDayIndex == i;
                      return Expanded(
                        child: GestureDetector(
                          onTap: () => setState(() => _selectedDayIndex = _selectedDayIndex == i ? -1 : i),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? theme.colorScheme.primary
                                  : isToday
                                      ? theme.colorScheme.primary.withValues(alpha: 0.08)
                                      : Colors.transparent,
                              borderRadius: BorderRadius.circular(12),
                              border: isToday && !isSelected ? Border.all(color: theme.colorScheme.primary.withValues(alpha: 0.3)) : null,
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  _dayNames[i],
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: isSelected ? Colors.white70 : theme.colorScheme.onSurface.withValues(alpha: 0.5),
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${dayDate.day}',
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w800,
                                    color: isSelected ? Colors.white : (isToday ? theme.colorScheme.primary : theme.colorScheme.onSurface),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                ),
              ],
            ),
          ),

          // ── Events Body ──
          Expanded(
            child: scheduleAsync.when(
              data: (events) {
                final allEvents = events.cast<Map<String, dynamic>>();

                // Filter events for selected day or show all week
                List<Map<String, dynamic>> filteredEvents;
                if (_selectedDayIndex >= 0) {
                  final selectedDate = _weekStart.add(Duration(days: _selectedDayIndex));
                  final selectedDateStr = DateFormat('yyyy-MM-dd').format(selectedDate);
                  filteredEvents = allEvents.where((ev) {
                    // Date-based event
                    if (ev['date'] == selectedDateStr) return true;
                    // Recurring timetable event (dayOfWeek)
                    if (ev['dayOfWeek'] == _selectedDayIndex) return true;
                    return false;
                  }).toList();
                } else {
                  // Week view — all events for this week
                  filteredEvents = allEvents.where((ev) {
                    if (ev['date'] != null) {
                      try {
                        final d = DateTime.parse(ev['date']);
                        return d.isAfter(_weekStart.subtract(const Duration(days: 1))) &&
                            d.isBefore(_weekStart.add(const Duration(days: 7)));
                      } catch (_) {}
                    }
                    // Recurring events show every week
                    if (ev['dayOfWeek'] != null) return true;
                    return false;
                  }).toList();
                }

                // Sort by time
                filteredEvents.sort((a, b) {
                  final dayA = a['dayOfWeek'] ?? 99;
                  final dayB = b['dayOfWeek'] ?? 99;
                  if (dayA != dayB) return (dayA as int).compareTo(dayB as int);
                  final t1 = a['startTime'] ?? '99:99';
                  final t2 = b['startTime'] ?? '99:99';
                  return t1.compareTo(t2);
                });

                if (filteredEvents.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.event_available_outlined, size: 56, color: theme.colorScheme.primary.withValues(alpha: 0.25)),
                        const SizedBox(height: 12),
                        Text(
                          _selectedDayIndex >= 0
                              ? 'Нет занятий в ${_dayNames[_selectedDayIndex]}'
                              : 'Нет занятий на этой неделе',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                        ),
                      ],
                    ),
                  );
                }

                // If showing week view, group by dayOfWeek
                if (_selectedDayIndex < 0) {
                  return _buildWeekView(filteredEvents, theme);
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.refresh(scheduleProvider.future),
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: filteredEvents.length,
                    itemBuilder: (context, i) => _buildEventCard(filteredEvents[i], i, theme),
                  ),
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error.withValues(alpha: 0.5)),
                    const SizedBox(height: 12),
                    Text('$err', style: const TextStyle(fontSize: 13), textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    FilledButton.icon(icon: const Icon(Icons.refresh), label: const Text('Повторить'), onPressed: () => ref.refresh(scheduleProvider)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWeekView(List<Map<String, dynamic>> events, ThemeData theme) {
    // Group events by day
    final Map<int, List<Map<String, dynamic>>> byDay = {};
    for (final ev in events) {
      int day;
      if (ev['dayOfWeek'] != null) {
        day = ev['dayOfWeek'] as int;
      } else if (ev['date'] != null) {
        try {
          final d = DateTime.parse(ev['date']);
          day = d.weekday - 1;
        } catch (_) {
          continue;
        }
      } else {
        continue;
      }
      byDay.putIfAbsent(day, () => []).add(ev);
    }

    return RefreshIndicator(
      onRefresh: () async => ref.refresh(scheduleProvider.future),
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: List.generate(7, (dayIdx) {
          final dayEvents = byDay[dayIdx] ?? [];
          if (dayEvents.isEmpty) return const SizedBox.shrink();

          final dayDate = _weekStart.add(Duration(days: dayIdx));
          final isToday = dayDate.year == DateTime.now().year && dayDate.month == DateTime.now().month && dayDate.day == DateTime.now().day;

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: isToday ? theme.colorScheme.primary : _dayColors[dayIdx].withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _dayNames[dayIdx],
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: isToday ? Colors.white : _dayColors[dayIdx]),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      DateFormat('dd MMMM', 'ru').format(dayDate),
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                    ),
                    if (isToday) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(6)),
                        child: Text('Сегодня', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: theme.colorScheme.primary)),
                      ),
                    ],
                  ],
                ),
              ),
              ...dayEvents.asMap().entries.map((entry) => _buildEventCard(entry.value, entry.key, theme)),
              const SizedBox(height: 8),
            ],
          );
        }),
      ),
    );
  }

  Widget _buildEventCard(Map<String, dynamic> ev, int index, ThemeData theme) {
    final color = _dayColors[index % _dayColors.length];
    final isExam = ev['type'] == 'exam';
    final location = ev['location'] ?? '';
    final groupName = ev['groupName'] ?? '';
    final groupId = ev['groupId'] ?? '';

    // Check if ongoing
    final now = DateTime.now();
    bool isOngoing = false;
    try {
      final parts = (ev['startTime'] ?? '').split(':');
      final endParts = (ev['endTime'] ?? '').split(':');
      if (parts.length == 2 && endParts.length == 2) {
        final startMins = int.parse(parts[0]) * 60 + int.parse(parts[1]);
        final endMins = int.parse(endParts[0]) * 60 + int.parse(endParts[1]);
        final nowMins = now.hour * 60 + now.minute;
        final eventDay = ev['dayOfWeek'] ?? -1;
        final todayDay = now.weekday - 1;
        if (eventDay == todayDay && nowMins >= startMins && nowMins < endMins) {
          isOngoing = true;
        }
      }
    } catch (_) {}

    return GestureDetector(
      onTap: groupId.toString().isNotEmpty
          ? () => context.push('/groups/$groupId')
          : null,
      child: Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isOngoing ? const Color(0xFFFFF1F2) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isOngoing ? Colors.red.withValues(alpha: 0.3) : theme.colorScheme.outline.withValues(alpha: 0.08),
          width: isOngoing ? 1.5 : 1,
        ),
        boxShadow: isOngoing
            ? [BoxShadow(color: Colors.red.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 4))]
            : [BoxShadow(color: Colors.black.withValues(alpha: 0.02), blurRadius: 4, offset: const Offset(0, 1))],
      ),
      child: Row(
        children: [
          // Left accent bar
          Container(
            width: 4, height: 52,
            decoration: BoxDecoration(
              color: isOngoing ? Colors.red : (isExam ? Colors.amber : color),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 12),
          // Time block
          Container(
            width: 56,
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(
              color: (isOngoing ? Colors.red : color).withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                Text(
                  ev['startTime'] ?? '--:--',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: isOngoing ? Colors.red : color),
                ),
                Container(width: 12, height: 1, color: (isOngoing ? Colors.red : color).withValues(alpha: 0.3), margin: const EdgeInsets.symmetric(vertical: 2)),
                Text(
                  ev['endTime'] ?? '--:--',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: (isOngoing ? Colors.red : color).withValues(alpha: 0.7)),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Content
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (isOngoing) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        margin: const EdgeInsets.only(right: 6),
                        decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(4)),
                        child: const Text('СЕЙЧАС', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Colors.white)),
                      ),
                    ],
                    if (isExam) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        margin: const EdgeInsets.only(right: 6),
                        decoration: BoxDecoration(color: Colors.amber.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(4)),
                        child: Text('Экзамен', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Colors.amber[800])),
                      ),
                    ],
                    Expanded(
                      child: Text(ev['title'] ?? 'Занятие', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14), overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
                if (groupName.isNotEmpty || location.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (groupName.isNotEmpty) ...[
                        Icon(Icons.group_outlined, size: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                        const SizedBox(width: 3),
                        Flexible(child: Text(groupName, style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)), overflow: TextOverflow.ellipsis)),
                      ],
                      if (groupName.isNotEmpty && location.isNotEmpty)
                        Text(' • ', style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.3))),
                      if (location.isNotEmpty) ...[
                        Icon(Icons.location_on_outlined, size: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                        const SizedBox(width: 3),
                        Flexible(child: Text(location, style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)), overflow: TextOverflow.ellipsis)),
                      ],
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    ),
    );
  }
}
