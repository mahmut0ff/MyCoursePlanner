import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/providers/providers.dart';
import 'student_detail_screen.dart';

class StudentsScreen extends ConsumerWidget {
  const StudentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final studentsAsync = ref.watch(studentsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Студенты')),
      body: studentsAsync.when(
        data: (students) {
          if (students.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.people_outline, size: 72, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                  const SizedBox(height: 16),
                  const Text('Нет студентов', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Text('Студенты появятся здесь', style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.refresh(studentsProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: students.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final student = students[index] as Map<String, dynamic>;
                final name = student['userName'] ?? student['displayName'] ?? student['userEmail'] ?? 'Безымянный';
                final initials = name.isNotEmpty ? name[0].toUpperCase() : '?';
                final avatarUrl = student['avatarUrl'] ?? student['photoURL'];
                final avatarColors = [const Color(0xFF7C3AED), const Color(0xFF10B981), const Color(0xFF3B82F6), const Color(0xFFF59E0B), const Color(0xFFEF4444)];
                final color = avatarColors[index % avatarColors.length];

                return GestureDetector(
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StudentDetailScreen(student: student))),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2))],
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 24,
                          backgroundColor: color.withValues(alpha: 0.12),
                          backgroundImage: (avatarUrl != null && avatarUrl.toString().isNotEmpty) ? NetworkImage(avatarUrl) : null,
                          child: (avatarUrl == null || avatarUrl.toString().isEmpty) ? Text(initials, style: TextStyle(fontWeight: FontWeight.w700, color: color, fontSize: 16)) : null,
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                              const SizedBox(height: 3),
                              Row(
                                children: [
                                  if ((student['userEmail'] ?? student['email']) != null) ...[
                                    Icon(Icons.email_outlined, size: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                                    const SizedBox(width: 4),
                                    Flexible(child: Text(student['userEmail'] ?? student['email'] ?? '', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)), overflow: TextOverflow.ellipsis)),
                                  ],
                                ],
                              ),
                              if (student['phone'] != null && student['phone'].toString().isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Row(
                                  children: [
                                    Icon(Icons.phone_outlined, size: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                                    const SizedBox(width: 4),
                                    Text(student['phone'], style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                                  ],
                                ),
                              ],
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
                FilledButton.icon(icon: const Icon(Icons.refresh), label: const Text('Повторить'), onPressed: () => ref.refresh(studentsProvider)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
