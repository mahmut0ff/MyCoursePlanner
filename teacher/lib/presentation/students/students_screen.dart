import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/providers/providers.dart';
import 'student_detail_screen.dart';

class StudentsScreen extends ConsumerWidget {
  const StudentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final studentsAsync = ref.watch(studentsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Студенты'),
      ),
      body: studentsAsync.when(
        data: (students) {
          if (students.isEmpty) {
            return const Center(child: Text('Нет студентов'));
          }

          return RefreshIndicator(
            onRefresh: () async => ref.refresh(studentsProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: students.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final student = students[index] as Map<String, dynamic>;
                
                return Card(
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => StudentDetailScreen(student: student)));
                    },
                    child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                      child: Icon(Icons.person, color: Theme.of(context).colorScheme.onPrimaryContainer),
                    ),
                    title: Text(student['displayName'] ?? student['email'] ?? 'Безымянный', style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (student['email'] != null) ...[
                          const SizedBox(height: 4),
                          Text(student['email']),
                        ],
                        if (student['phone'] != null) ...[
                          const SizedBox(height: 2),
                          Text(student['phone']),
                        ],
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
                onPressed: () => ref.refresh(studentsProvider),
                child: const Text('Повторить'),
              )
            ],
          ),
        ),
      ),
    );
  }
}

