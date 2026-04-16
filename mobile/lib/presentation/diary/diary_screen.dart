import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/providers/auth_provider.dart';

/// Diary data holder for a single date+course cell.
class _DayRecord {
  final String courseId;
  final String courseTitle;
  Map<String, dynamic>? grade;
  Map<String, dynamic>? journal;
  String? teacherName;

  _DayRecord({required this.courseId, required this.courseTitle});
}

/// Student diary provider — fetches grades + journal and groups them by date.
final diaryEventsProvider =
    FutureProvider.autoDispose<Map<String, Map<String, _DayRecord>>>((
  ref,
) async {
  final api = ref.watch(apiServiceProvider);
  final profile = ref.watch(userProfileProvider).valueOrNull;
  if (profile == null || profile.activeOrgId == null) return {};

  final uid = profile.uid;

  // Fetch courses, groups, grades, journal in parallel
  final results = await Future.wait([
    api.getCourses(),
    api.getGroups(),
    api.getGrades(),
    api.getJournal(),
  ]);

  final allCourses = results[0];
  final allGroups = results[1];
  final allGrades = results[2];
  final allJournal = results[3];

  // My groups and courses
  final myGroups = allGroups
      .where((g) => (g['studentIds'] as List?)?.contains(uid) ?? false)
      .toList();
  final myCourseIds = myGroups.map((g) => g['courseId']).toSet();

  // Build date→courseId→DayRecord map
  final dayMap = <String, Map<String, _DayRecord>>{};

  for (final g in allGrades) {
    final courseId = g['courseId'] ?? '';
    if (!myCourseIds.contains(courseId)) continue;
    if (g['studentId'] != uid) continue;

    final courseTitle = allCourses
            .firstWhere((c) => c['id'] == courseId,
                orElse: () => {'title': '?'})['title'] ??
        '?';

    String dateStr = (g['date'] ?? g['updatedAt'] ?? g['createdAt'] ?? '')
        .toString();
    if (dateStr.length >= 10) dateStr = dateStr.substring(0, 10);
    if (dateStr.length < 10) continue;

    dayMap.putIfAbsent(dateStr, () => {});
    dayMap[dateStr]!.putIfAbsent(
      courseId,
      () => _DayRecord(courseId: courseId, courseTitle: courseTitle),
    );
    dayMap[dateStr]![courseId]!.grade = g;
  }

  for (final j in allJournal) {
    final courseId = j['courseId'] ?? '';
    if (!myCourseIds.contains(courseId)) continue;
    if (j['studentId'] != uid) continue;

    final courseTitle = allCourses
            .firstWhere((c) => c['id'] == courseId,
                orElse: () => {'title': '?'})['title'] ??
        '?';

    String dateStr = (j['date'] ?? '').toString();
    if (dateStr.length >= 10) dateStr = dateStr.substring(0, 10);
    if (dateStr.length < 10) continue;

    dayMap.putIfAbsent(dateStr, () => {});
    dayMap[dateStr]!.putIfAbsent(
      courseId,
      () => _DayRecord(courseId: courseId, courseTitle: courseTitle),
    );
    dayMap[dateStr]![courseId]!.journal = j;
  }

  return dayMap;
});

class DiaryScreen extends ConsumerStatefulWidget {
  const DiaryScreen({super.key});

  @override
  ConsumerState<DiaryScreen> createState() => _DiaryScreenState();
}

class _DiaryScreenState extends ConsumerState<DiaryScreen> {
  late DateTime _currentMonth;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _currentMonth = DateTime(now.year, now.month, 1);
  }

  void _prevMonth() =>
      setState(() => _currentMonth = DateTime(_currentMonth.year, _currentMonth.month - 1, 1));
  void _nextMonth() =>
      setState(() => _currentMonth = DateTime(_currentMonth.year, _currentMonth.month + 1, 1));

  String _monthLabel() {
    const months = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    return '${months[_currentMonth.month - 1]} ${_currentMonth.year}';
  }

  List<DateTime?> _getDaysGrid() {
    final firstDay = _currentMonth;
    final lastDay = DateTime(_currentMonth.year, _currentMonth.month + 1, 0);
    int startDow = firstDay.weekday - 1; // Mon=0

    final days = <DateTime?>[];
    for (int i = 0; i < startDow; i++) {
      days.add(null);
    }
    for (int i = 1; i <= lastDay.day; i++) {
      days.add(DateTime(_currentMonth.year, _currentMonth.month, i));
    }
    while (days.length % 7 != 0) {
      days.add(null);
    }
    return days;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final diaryAsync = ref.watch(diaryEventsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Дневник')),
      body: Column(
        children: [
          // ── Month Navigation ──
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  onPressed: _prevMonth,
                  icon: const Icon(Icons.chevron_left),
                ),
                Text(
                  _monthLabel(),
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                IconButton(
                  onPressed: _nextMonth,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),

          // ── Day-of-week header ──
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              children: ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']
                  .map((d) => Expanded(
                        child: Center(
                          child: Text(
                            d,
                            style: theme.textTheme.labelSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.5),
                            ),
                          ),
                        ),
                      ))
                  .toList(),
            ),
          ),
          const SizedBox(height: 4),

          // ── Calendar Grid ──
          Expanded(
            child: diaryAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline,
                        color: Colors.red, size: 40),
                    const SizedBox(height: 8),
                    Text('Ошибка загрузки', style: theme.textTheme.bodyMedium),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => ref.invalidate(diaryEventsProvider),
                      child: const Text('Повторить'),
                    ),
                  ],
                ),
              ),
              data: (dayMap) {
                final days = _getDaysGrid();
                final now = DateTime.now();
                final todayKey =
                    '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';

                return GridView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  gridDelegate:
                      const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 7,
                    childAspectRatio: 0.55,
                  ),
                  itemCount: days.length,
                  itemBuilder: (ctx, idx) {
                    final date = days[idx];
                    if (date == null) return const SizedBox();

                    final dateKey =
                        '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
                    final isToday = dateKey == todayKey;
                    final records = dayMap[dateKey]?.values.toList() ?? [];

                    return Container(
                      margin: const EdgeInsets.all(1),
                      decoration: BoxDecoration(
                        color: isDark
                            ? const Color(0xFF1E293B)
                            : Colors.white,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isToday
                              ? theme.colorScheme.primary
                              : theme.colorScheme.outline
                                  .withValues(alpha: 0.1),
                          width: isToday ? 2 : 1,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Date number
                          Padding(
                            padding: const EdgeInsets.only(
                                left: 4, top: 2, right: 4),
                            child: Container(
                              width: 22,
                              height: 22,
                              decoration: isToday
                                  ? BoxDecoration(
                                      color: theme.colorScheme.primary,
                                      shape: BoxShape.circle,
                                    )
                                  : null,
                              child: Center(
                                child: Text(
                                  '${date.day}',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: isToday
                                        ? Colors.white
                                        : theme.colorScheme.onSurface,
                                  ),
                                ),
                              ),
                            ),
                          ),

                          // Records
                          Expanded(
                            child: ListView(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 2, vertical: 2),
                              physics:
                                  const NeverScrollableScrollPhysics(),
                              children: records
                                  .map((rec) =>
                                      _RecordChip(record: rec))
                                  .toList(),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _RecordChip extends StatelessWidget {
  final _DayRecord record;

  const _RecordChip({required this.record});

  @override
  Widget build(BuildContext context) {
    final g = record.grade;
    final j = record.journal;

    Color borderColor;
    Color bgColor;
    String label;

    if (g != null) {
      final val = g['displayValue'] ?? g['value']?.toString() ?? '';
      label = val.toString();
      // Color by grade
      if (val == '5' || val == 'A' || val == 'Отлично') {
        borderColor = const Color(0xFF10B981);
        bgColor = const Color(0xFF10B981).withValues(alpha: 0.1);
      } else if (val == '4' || val == 'B' || val == 'Хорошо') {
        borderColor = const Color(0xFF3B82F6);
        bgColor = const Color(0xFF3B82F6).withValues(alpha: 0.1);
      } else {
        borderColor = const Color(0xFFF59E0B);
        bgColor = const Color(0xFFF59E0B).withValues(alpha: 0.1);
      }
    } else if (j != null) {
      final att = j['attendance'] ?? '';
      if (att == 'absent') {
        label = 'Н';
        borderColor = const Color(0xFFEF4444);
        bgColor = const Color(0xFFEF4444).withValues(alpha: 0.1);
      } else if (att == 'late') {
        label = 'ОП';
        borderColor = const Color(0xFFF59E0B);
        bgColor = const Color(0xFFF59E0B).withValues(alpha: 0.1);
      } else {
        label = '✓';
        borderColor = const Color(0xFF10B981);
        bgColor = const Color(0xFF10B981).withValues(alpha: 0.1);
      }
    } else {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 2),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(4),
          border: Border(left: BorderSide(color: borderColor, width: 2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Flexible(
                  child: Text(
                    record.courseTitle,
                    style: TextStyle(
                      fontSize: 7,
                      fontWeight: FontWeight.w600,
                      color: borderColor,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    color: borderColor,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
