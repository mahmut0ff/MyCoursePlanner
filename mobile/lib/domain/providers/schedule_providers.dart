import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../data/models/schedule_event.dart';
import 'auth_provider.dart';

/// Selected date in schedule tab.
final selectedDateProvider = StateProvider<DateTime>((ref) => DateTime.now());

/// Schedule events for the selected date.
final dayScheduleProvider = FutureProvider<List<ScheduleEvent>>((ref) async {
  final date = ref.watch(selectedDateProvider);
  final dateStr = DateFormat('yyyy-MM-dd').format(date);

  final repo = ref.watch(courseRepositoryProvider);
  final events = await repo.getSchedule(from: dateStr, to: dateStr);

  // Sort by start time
  events.sort((a, b) => a.startTime.compareTo(b.startTime));
  return events;
});

/// Today's schedule (for Home screen).
final todayScheduleProvider = FutureProvider<List<ScheduleEvent>>((ref) async {
  final dateStr = DateFormat('yyyy-MM-dd').format(DateTime.now());

  final repo = ref.watch(courseRepositoryProvider);
  final events = await repo.getSchedule(from: dateStr, to: dateStr);

  events.sort((a, b) => a.startTime.compareTo(b.startTime));
  return events;
});

/// Weekly timetable (recurring lessons).
final timetableProvider = FutureProvider<List<ScheduleEvent>>((ref) async {
  final repo = ref.watch(courseRepositoryProvider);
  return repo.getSchedule(mode: 'timetable');
});
