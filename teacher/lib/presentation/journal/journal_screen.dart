import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    final groupsAsync = _selectedCourseId != null ? ref.watch(groupsProvider(_selectedCourseId)) : null;

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
          // Selectors
          Container(
            padding: const EdgeInsets.all(16),
            color: Theme.of(context).colorScheme.surface,
            child: Column(
              children: [
                // Course Dropdown
                coursesAsync.when(
                  data: (courses) {
                    if (courses.isEmpty) return const Text('Нет курсов');
                    // Automatically select first if null
                    if (_selectedCourseId == null && courses.isNotEmpty) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (mounted) setState(() => _selectedCourseId = courses.first['id']);
                      });
                    }
                    return DropdownButtonFormField<String>(
                      value: _selectedCourseId,
                      decoration: const InputDecoration(labelText: 'Курс', contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
                      items: courses.map((c) => DropdownMenuItem<String>(
                        value: c['id'],
                        child: Text(c['title'] ?? 'Без названия'),
                      )).toList(),
                      onChanged: (val) {
                        setState(() {
                          _selectedCourseId = val;
                          _selectedGroupId = null; // reset group
                        });
                      },
                    );
                  },
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text('Ошибка загрузки курсов: $e'),
                ),
                const SizedBox(height: 12),
                
                // Group Dropdown
                if (groupsAsync != null) groupsAsync.when(
                  data: (groups) {
                    if (groups.isEmpty) return const Text('Нет групп в курсе');
                    if (_selectedGroupId == null && groups.isNotEmpty) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (mounted) setState(() => _selectedGroupId = groups.first['id']);
                      });
                    }
                    return DropdownButtonFormField<String>(
                      value: _selectedGroupId,
                      decoration: const InputDecoration(labelText: 'Группа', contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
                      items: groups.map((g) => DropdownMenuItem<String>(
                        value: g['id'],
                        child: Text(g['name'] ?? 'Без названия'),
                      )).toList(),
                      onChanged: (val) => setState(() => _selectedGroupId = val),
                    );
                  },
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text('Ошибка загрузки групп: $e'),
                ),
              ],
            ),
          ),
          
          // Tabs Content
          Expanded(
            child: _selectedGroupId == null
                ? const Center(child: Text('Выберите группу для просмотра журнала'))
                : TabBarView(
                    controller: _tabController,
                    children: [
                      _AttendanceTab(groupId: _selectedGroupId!),
                      _GradesTab(groupId: _selectedGroupId!),
                    ],
                  ),
          )
        ],
      ),
    );
  }
}

class _AttendanceTab extends ConsumerWidget {
  final String groupId;
  const _AttendanceTab({required this.groupId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final journalAsync = ref.watch(journalProvider(groupId));

    return journalAsync.when(
      data: (records) {
        if (records.isEmpty) {
          return const Center(child: Text('Нет записей посещаемости'));
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: records.length,
          itemBuilder: (context, index) {
            final rec = records[index];
            final presents = (rec['presentStudentIds'] as List?)?.length ?? 0;
            return Card(
              child: ListTile(
                leading: const Icon(Icons.event_available),
                title: Text('Занятие: ${rec['date'] ?? ''}'),
                subtitle: Text('Присутствовало: $presents чел.'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('В разработке (редактирование посещаемости)')));
                },
              ),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(child: Text('Ошибка: $err')),
    );
  }
}

class _GradesTab extends ConsumerWidget {
  final String groupId;
  const _GradesTab({required this.groupId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gradesAsync = ref.watch(gradesProvider(groupId));

    return gradesAsync.when(
      data: (grades) {
        if (grades.isEmpty) {
          return const Center(child: Text('Нет оценок'));
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: grades.length,
          itemBuilder: (context, index) {
            final grade = grades[index];
            return Card(
              child: ListTile(
                leading: const Icon(Icons.star_border),
                title: Text(grade['studentName'] ?? 'Студент'),
                subtitle: Text(grade['lessonTitle'] ?? 'Занятие'),
                trailing: Text('${grade['value']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              ),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(child: Text('Ошибка: $err')),
    );
  }
}

