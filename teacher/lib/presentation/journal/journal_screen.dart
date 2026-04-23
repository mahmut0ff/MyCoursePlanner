import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../domain/providers/providers.dart';

class JournalScreen extends ConsumerStatefulWidget {
  const JournalScreen({super.key});

  @override
  ConsumerState<JournalScreen> createState() => _JournalScreenState();
}

class _JournalScreenState extends ConsumerState<JournalScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String? _selectedCourseId;
  String? _selectedGroupId;
  DateTime _selectedDate = DateTime.now();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final coursesAsync = ref.watch(coursesProvider);
    final groupsAsync = ref.watch(groupsProvider(_selectedCourseId));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Журнал'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Посещаемость'),
            Tab(text: 'Оценки'),
          ],
        ),
      ),
      body: Column(
        children: [
          // ── Selectors Row ──
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
            ),
            child: Column(
              children: [
                // Course + Group row
                Row(
                  children: [
                    // Course dropdown
                    Expanded(
                      child: coursesAsync.when(
                        data: (courses) {
                          if (courses.isEmpty) return const Text('Нет курсов');
                          final courseIds = courses.map((c) => c['id'] as String).toSet();
                          final validCourseId = (_selectedCourseId != null && courseIds.contains(_selectedCourseId)) ? _selectedCourseId : null;
                          if (validCourseId == null && courses.isNotEmpty) {
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              if (mounted) setState(() { _selectedCourseId = courses.first['id']; _selectedGroupId = null; });
                            });
                          }
                          return DropdownButtonFormField<String>(
                            initialValue: validCourseId,
                            isDense: true,
                            isExpanded: true,
                            decoration: InputDecoration(
                              labelText: 'Курс',
                              prefixIcon: Icon(Icons.school_outlined, size: 18, color: theme.colorScheme.primary),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            ),
                            items: courses.map((c) => DropdownMenuItem<String>(
                              value: c['id'],
                              child: Text(c['title'] ?? c['name'] ?? '', overflow: TextOverflow.ellipsis),
                            )).toList(),
                            onChanged: (val) => setState(() { _selectedCourseId = val; _selectedGroupId = null; }),
                          );
                        },
                        loading: () => const LinearProgressIndicator(),
                        error: (e, _) => Text('Ошибка: $e', style: const TextStyle(fontSize: 12)),
                      ),
                    ),
                    const SizedBox(width: 10),
                    // Group dropdown
                    Expanded(
                      child: groupsAsync.when(
                        data: (groups) {
                          if (groups.isEmpty) return const Text('Нет групп', style: TextStyle(fontSize: 13, color: Colors.grey));
                          // Validate selectedGroupId exists in current groups
                          final groupIds = groups.map((g) => g['id'] as String).toSet();
                          final validGroupId = (_selectedGroupId != null && groupIds.contains(_selectedGroupId)) ? _selectedGroupId : null;
                          if (validGroupId == null && groups.isNotEmpty) {
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              if (mounted) setState(() => _selectedGroupId = groups.first['id']);
                            });
                          }
                          return DropdownButtonFormField<String>(
                            initialValue: validGroupId,
                            isDense: true,
                            isExpanded: true,
                            decoration: InputDecoration(
                              labelText: 'Группа',
                              prefixIcon: Icon(Icons.group_outlined, size: 18, color: theme.colorScheme.primary),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            ),
                            items: groups.map((g) => DropdownMenuItem<String>(
                              value: g['id'],
                              child: Text(g['name'] ?? '', overflow: TextOverflow.ellipsis),
                            )).toList(),
                            onChanged: (val) => setState(() => _selectedGroupId = val),
                          );
                        },
                        loading: () => const LinearProgressIndicator(),
                        error: (_, __) => const SizedBox.shrink(),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                // Date selector + quick dates
                Row(
                  children: [
                    // Quick date chips
                    _DateChip(label: 'Вчера', date: DateTime.now().subtract(const Duration(days: 1)), selected: _selectedDate, onTap: (d) => setState(() => _selectedDate = d)),
                    const SizedBox(width: 6),
                    _DateChip(label: 'Сегодня', date: DateTime.now(), selected: _selectedDate, onTap: (d) => setState(() => _selectedDate = d)),
                    const Spacer(),
                    // Date picker
                    InkWell(
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: _selectedDate,
                          firstDate: DateTime.now().subtract(const Duration(days: 30)),
                          lastDate: DateTime.now().add(const Duration(days: 14)),
                        );
                        if (picked != null) setState(() => _selectedDate = picked);
                      },
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: theme.colorScheme.primary.withValues(alpha: 0.15)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.calendar_today, size: 14, color: theme.colorScheme.primary),
                            const SizedBox(width: 6),
                            Text(DateFormat('dd.MM.yyyy').format(_selectedDate), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.colorScheme.primary)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Tab content
          Expanded(
            child: (_selectedCourseId == null || _selectedGroupId == null)
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.menu_book_outlined, size: 64, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                        const SizedBox(height: 16),
                        const Text('Выберите курс и группу', style: TextStyle(color: Colors.grey)),
                      ],
                    ),
                  )
                : TabBarView(
                    controller: _tabController,
                    children: [
                      _AttendanceTab(courseId: _selectedCourseId!, groupId: _selectedGroupId!, date: _selectedDate),
                      _GradesTab(courseId: _selectedCourseId!, groupId: _selectedGroupId!),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════
// ATTENDANCE TAB — student table with inline buttons
// ═══════════════════════════════════════════════
class _AttendanceTab extends ConsumerStatefulWidget {
  final String courseId;
  final String groupId;
  final DateTime date;
  const _AttendanceTab({required this.courseId, required this.groupId, required this.date});

  @override
  ConsumerState<_AttendanceTab> createState() => _AttendanceTabState();
}

class _AttendanceTabState extends ConsumerState<_AttendanceTab> {
  Map<String, String> _localAttendance = {};
  bool _bulkLoading = false;

  String get _dateString => DateFormat('yyyy-MM-dd').format(widget.date);

  @override
  void didUpdateWidget(covariant _AttendanceTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.date != widget.date || oldWidget.groupId != widget.groupId) {
      _localAttendance = {};
    }
  }

  Future<void> _markAttendance(String studentId, String status, String studentName) async {
    setState(() => _localAttendance[studentId] = status);
    try {
      final api = ref.read(apiServiceProvider);
      await api.markAttendance({
        'courseId': widget.courseId,
        'studentId': studentId,
        'date': _dateString,
        'attendance': status,
      });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
    }
  }

  Future<void> _markAllPresent(List<Map<String, dynamic>> students) async {
    setState(() => _bulkLoading = true);
    final api = ref.read(apiServiceProvider);
    for (final s in students) {
      final sid = s['uid'] ?? s['id'] ?? '';
      setState(() => _localAttendance[sid] = 'present');
      try {
        await api.markAttendance({
          'courseId': widget.courseId,
          'studentId': sid,
          'date': _dateString,
          'attendance': 'present',
        });
      } catch (_) {}
    }
    setState(() => _bulkLoading = false);
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Все отмечены ✓')));
  }

  @override
  Widget build(BuildContext context) {
    final studentsAsync = ref.watch(studentsProvider);
    final groupsAsync = ref.watch(groupsProvider(null));
    final journalAsync = ref.watch(journalByCourseProvider(widget.courseId));
    final theme = Theme.of(context);

    return groupsAsync.when(
      data: (groups) {
        final allGroups = groups.cast<Map<String, dynamic>>();
        final group = allGroups.where((g) => g['id'] == widget.groupId).firstOrNull;
        final studentIds = (group?['studentIds'] as List?)?.cast<String>() ?? [];

        if (studentIds.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.people_outline, size: 52, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                const SizedBox(height: 12),
                const Text('В группе нет студентов'),
              ],
            ),
          );
        }

        return studentsAsync.when(
          data: (allStudents) {
            final students = allStudents.cast<Map<String, dynamic>>().where((s) => studentIds.contains(s['uid'] ?? s['id'])).toList();
            
            // Get existing journal entries for this date
            final Map<String, String> serverAttendance = {};
            final journal = journalAsync.valueOrNull ?? [];
            for (final entry in journal) {
              final e = entry as Map<String, dynamic>;
              if (e['date'] == _dateString) {
                serverAttendance[e['studentId']] = e['attendance'] ?? 'present';
              }
            }

            return Column(
              children: [
                // Bulk action bar
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                  child: Row(
                    children: [
                      Text('${students.length} студентов', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.colorScheme.onSurface.withValues(alpha: 0.6))),
                      const Spacer(),
                      FilledButton.icon(
                        onPressed: _bulkLoading ? null : () => _markAllPresent(students),
                        icon: _bulkLoading ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.check_circle_outline, size: 16),
                        label: const Text('Все присутствуют', style: TextStyle(fontSize: 12)),
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF10B981),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          minimumSize: Size.zero,
                        ),
                      ),
                    ],
                  ),
                ),
                // Student list
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    itemCount: students.length,
                    itemBuilder: (context, i) {
                      final s = students[i];
                      final sid = s['uid'] ?? s['id'] ?? '';
                      final name = s['displayName'] ?? s['email'] ?? 'Студент';
                      final email = s['email'] ?? '';
                      final avatar = s['avatarUrl'] ?? '';
                      final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
                      final attendance = _localAttendance[sid] ?? serverAttendance[sid];

                      return Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.06)),
                        ),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                CircleAvatar(
                                  radius: 18,
                                  backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                                  backgroundImage: avatar.isNotEmpty ? NetworkImage(avatar) : null,
                                  child: avatar.isEmpty ? Text(initial, style: TextStyle(fontWeight: FontWeight.w700, color: theme.colorScheme.primary, fontSize: 14)) : null,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                      if (email.isNotEmpty) Text(email, style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface.withValues(alpha: 0.4))),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            // Attendance buttons
                            Row(
                              children: [
                                _AttendanceBtn(label: '✓', status: 'present', current: attendance, color: Colors.green, onTap: () => _markAttendance(sid, 'present', name)),
                                const SizedBox(width: 6),
                                _AttendanceBtn(label: '✕', status: 'absent', current: attendance, color: Colors.red, onTap: () => _markAttendance(sid, 'absent', name)),
                                const SizedBox(width: 6),
                                _AttendanceBtn(label: '⏰', status: 'late', current: attendance, color: Colors.amber, onTap: () => _markAttendance(sid, 'late', name)),
                                const SizedBox(width: 6),
                                _AttendanceBtn(label: 'УП', status: 'excused', current: attendance, color: Colors.blueGrey, onTap: () => _markAttendance(sid, 'excused', name)),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(child: Text('Ошибка: $err')),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(child: Text('Ошибка: $err')),
    );
  }
}

class _AttendanceBtn extends StatelessWidget {
  final String label;
  final String status;
  final String? current;
  final Color color;
  final VoidCallback onTap;
  const _AttendanceBtn({required this.label, required this.status, required this.current, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isActive = current == status;
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isActive ? color.withValues(alpha: 0.15) : Colors.grey.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: isActive ? color.withValues(alpha: 0.4) : Colors.transparent, width: 1.5),
          ),
          child: Center(
            child: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: isActive ? color : Colors.grey)),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════
// GRADES TAB
// ═══════════════════════════════════════════════
class _GradesTab extends ConsumerWidget {
  final String courseId;
  final String groupId;
  const _GradesTab({required this.courseId, required this.groupId});

  void _editGrade(BuildContext context, WidgetRef ref, Map<String, dynamic>? existing, {String? studentId, String? studentName}) {
    final theme = Theme.of(context);
    final gradeC = TextEditingController(text: existing?['displayValue']?.toString() ?? existing?['value']?.toString() ?? '');
    bool loading = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
              const SizedBox(height: 20),
              Text(
                existing != null ? 'Изменить оценку' : 'Поставить оценку: ${studentName ?? ''}',
                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: gradeC,
                keyboardType: TextInputType.number,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: 'Оценка',
                  prefixIcon: const Icon(Icons.star_rounded),
                  filled: true,
                  fillColor: theme.colorScheme.primary.withValues(alpha: 0.03),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed: loading ? null : () async {
                    if (gradeC.text.trim().isEmpty) return;
                    setModalState(() => loading = true);
                    try {
                      final api = ref.read(apiServiceProvider);
                      await api.setGrade({
                        'courseId': courseId,
                        'studentId': studentId ?? existing?['studentId'],
                        if (existing?['id'] != null) 'gradeId': existing!['id'],
                        'value': gradeC.text.trim(),
                      });
                      ref.invalidate(gradesByCourseProvider(courseId));
                      if (ctx.mounted) Navigator.pop(ctx);
                    } catch (e) {
                      setModalState(() => loading = false);
                      if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
                    }
                  },
                  child: loading ? const CircularProgressIndicator(color: Colors.white) : Text(existing != null ? 'Обновить' : 'Сохранить'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final studentsAsync = ref.watch(studentsProvider);
    final groupsAsync = ref.watch(groupsProvider(null));
    final gradesAsync = ref.watch(gradesByCourseProvider(courseId));
    final theme = Theme.of(context);

    return groupsAsync.when(
      data: (groups) {
        final allGroups = groups.cast<Map<String, dynamic>>();
        final group = allGroups.where((g) => g['id'] == groupId).firstOrNull;
        final studentIds = (group?['studentIds'] as List?)?.cast<String>() ?? [];

        return studentsAsync.when(
          data: (allStudents) {
            final students = allStudents.cast<Map<String, dynamic>>().where((s) => studentIds.contains(s['uid'] ?? s['id'])).toList();
            if (students.isEmpty) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.star_border, size: 52, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                    const SizedBox(height: 12),
                    const Text('В группе нет студентов'),
                  ],
                ),
              );
            }

            return gradesAsync.when(
              data: (allGrades) {
                final gradesList = allGrades.cast<Map<String, dynamic>>();

                return ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: students.length,
                  itemBuilder: (context, i) {
                    final s = students[i];
                    final sid = s['uid'] ?? s['id'] ?? '';
                    final name = s['displayName'] ?? s['email'] ?? 'Студент';
                    final avatar = s['avatarUrl'] ?? '';
                    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';

                    // Grades for this student
                    final studentGrades = gradesList.where((g) => g['studentId'] == sid).toList();
                    final gradeValues = studentGrades.map((g) => double.tryParse(g['value']?.toString() ?? '') ?? 0).where((v) => v > 0).toList();
                    final avg = gradeValues.isNotEmpty ? (gradeValues.reduce((a, b) => a + b) / gradeValues.length) : 0.0;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.06)),
                      ),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              CircleAvatar(
                                radius: 18,
                                backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                                backgroundImage: avatar.isNotEmpty ? NetworkImage(avatar) : null,
                                child: avatar.isEmpty ? Text(initial, style: TextStyle(fontWeight: FontWeight.w700, color: theme.colorScheme.primary, fontSize: 14)) : null,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                    Text('${gradeValues.length} оценок • Ср: ${avg.toStringAsFixed(1)}', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                                  ],
                                ),
                              ),
                              // Add grade button
                              GestureDetector(
                                onTap: () => _editGrade(context, ref, null, studentId: sid, studentName: name),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                  decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(8)),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.add, size: 14, color: theme.colorScheme.primary),
                                      const SizedBox(width: 2),
                                      Text('Оценка', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: theme.colorScheme.primary)),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                          // Grade chips row
                          if (studentGrades.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            SizedBox(
                              height: 32,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: studentGrades.length,
                                separatorBuilder: (_, __) => const SizedBox(width: 6),
                                itemBuilder: (_, gi) {
                                  final g = studentGrades[gi];
                                  return GestureDetector(
                                    onTap: () => _editGrade(context, ref, g, studentId: sid, studentName: name),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: theme.colorScheme.primary.withValues(alpha: 0.08),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(color: theme.colorScheme.primary.withValues(alpha: 0.15)),
                                      ),
                                      child: Text(
                                        '${g['displayValue'] ?? g['value'] ?? '?'}',
                                        style: TextStyle(fontWeight: FontWeight.w700, color: theme.colorScheme.primary, fontSize: 14),
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(child: Text('Ошибка: $err')),
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(child: Text('Ошибка: $err')),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(child: Text('Ошибка: $err')),
    );
  }
}

class _DateChip extends StatelessWidget {
  final String label;
  final DateTime date;
  final DateTime selected;
  final void Function(DateTime) onTap;
  const _DateChip({required this.label, required this.date, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isActive = DateFormat('yyyy-MM-dd').format(date) == DateFormat('yyyy-MM-dd').format(selected);
    final theme = Theme.of(context);
    return GestureDetector(
      onTap: () => onTap(date),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: isActive ? theme.colorScheme.primary : theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: isActive ? Colors.white : theme.colorScheme.onSurface.withValues(alpha: 0.6))),
      ),
    );
  }
}
