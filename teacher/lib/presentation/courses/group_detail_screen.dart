import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../domain/providers/providers.dart';

class GroupDetailScreen extends ConsumerWidget {
  final String groupId;
  const GroupDetailScreen({super.key, required this.groupId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groupsAsync = ref.watch(groupsProvider(null));
    final studentsAsync = ref.watch(studentsProvider);
    final lessonsAsync = ref.watch(lessonsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Группа')),
      body: groupsAsync.when(
        data: (groups) {
          final allGroups = groups.cast<Map<String, dynamic>>();
          final group = allGroups.where((g) => g['id'] == groupId).firstOrNull;
          if (group == null) return const Center(child: Text('Группа не найдена'));

          final groupName = group['name'] ?? 'Без названия';
          final courseName = group['courseName'] ?? '';
          final studentIds = (group['studentIds'] as List?)?.cast<String>() ?? [];
          final chatUrl = group['chatLinkUrl'] ?? '';
          final chatTitle = group['chatLinkTitle'] ?? 'Чат группы';
          final initial = groupName.isNotEmpty ? groupName[0].toUpperCase() : '?';

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(groupsProvider(null));
              ref.invalidate(studentsProvider);
              ref.invalidate(lessonsProvider);
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // ── Group Header Card ──
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4))],
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 56, height: 56,
                            decoration: BoxDecoration(
                              gradient: LinearGradient(colors: [const Color(0xFF7C3AED), const Color(0xFF7C3AED).withValues(alpha: 0.7)]),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Center(child: Text(initial, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white))),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(groupName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                                if (courseName.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text('Курс: $courseName', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          _InfoChip(icon: Icons.people_outline, label: '${studentIds.length} студентов', color: const Color(0xFF3B82F6)),
                          const SizedBox(width: 10),
                          lessonsAsync.when(
                            data: (allLessons) {
                              final count = allLessons.cast<Map<String, dynamic>>().where((l) => (l['groupIds'] as List?)?.contains(groupId) ?? false).length;
                              return _InfoChip(icon: Icons.play_lesson_outlined, label: '$count уроков', color: const Color(0xFF10B981));
                            },
                            loading: () => const _InfoChip(icon: Icons.play_lesson_outlined, label: '...', color: Color(0xFF10B981)),
                            error: (_, __) => const SizedBox.shrink(),
                          ),
                        ],
                      ),
                      if (chatUrl.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        InkWell(
                          onTap: () async {
                            final uri = Uri.parse(chatUrl);
                            if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
                          },
                          borderRadius: BorderRadius.circular(12),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            decoration: BoxDecoration(
                              color: const Color(0xFF3B82F6).withValues(alpha: 0.06),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.15)),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.chat_bubble_outline, size: 16, color: Color(0xFF3B82F6)),
                                const SizedBox(width: 8),
                                Text(chatTitle, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF3B82F6))),
                                const Spacer(),
                                const Icon(Icons.open_in_new, size: 14, color: Color(0xFF3B82F6)),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // ── Students Section ──
                if (studentIds.isNotEmpty) ...[
                  _SectionHeader(icon: Icons.people_outline, title: 'Студенты (${studentIds.length})'),
                  const SizedBox(height: 10),
                  studentsAsync.when(
                    data: (allStudents) {
                      final students = allStudents.cast<Map<String, dynamic>>().where((s) => studentIds.contains(s['uid'] ?? s['id'])).toList();
                      if (students.isEmpty) {
                        return Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08))),
                          child: const Center(child: Text('Студенты не найдены в базе', style: TextStyle(color: Colors.grey))),
                        );
                      }
                      return Container(
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08))),
                        child: Column(
                          children: students.asMap().entries.map((entry) {
                            final s = entry.value;
                            final i = entry.key;
                            final name = s['displayName'] ?? s['email'] ?? 'Студент';
                            final email = s['email'] ?? '';
                            final avatar = s['avatarUrl'] ?? '';
                            final nameInitial = name.isNotEmpty ? name[0].toUpperCase() : '?';

                            return Column(
                              children: [
                                if (i > 0) Divider(height: 1, color: theme.colorScheme.outline.withValues(alpha: 0.06)),
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                                  child: Row(
                                    children: [
                                      CircleAvatar(
                                        radius: 18,
                                        backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                                        backgroundImage: avatar.isNotEmpty ? NetworkImage(avatar) : null,
                                        child: avatar.isEmpty ? Text(nameInitial, style: TextStyle(fontWeight: FontWeight.w700, color: theme.colorScheme.primary, fontSize: 14)) : null,
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                            if (email.isNotEmpty)
                                              Text(email, style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.4))),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            );
                          }).toList(),
                        ),
                      );
                    },
                    loading: () => const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator())),
                    error: (err, _) => Text('Ошибка: $err'),
                  ),
                  const SizedBox(height: 24),
                ],

                // ── Lessons Section ──
                Row(
                  children: [
                    _SectionHeader(icon: Icons.play_lesson_outlined, title: 'Уроки'),
                    const Spacer(),
                    IconButton(icon: const Icon(Icons.add_circle_outline), onPressed: () => context.push('/lessons/new?groupId=$groupId')),
                  ],
                ),
                const SizedBox(height: 10),
                lessonsAsync.when(
                  data: (allLessons) {
                    final groupLessons = allLessons.cast<Map<String, dynamic>>().where((l) => (l['groupIds'] as List?)?.contains(groupId) ?? false).toList();
                    if (groupLessons.isEmpty) {
                      return Container(
                        padding: const EdgeInsets.all(32),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08))),
                        child: Column(
                          children: [
                            Icon(Icons.play_lesson_outlined, size: 48, color: theme.colorScheme.primary.withValues(alpha: 0.2)),
                            const SizedBox(height: 10),
                            const Text('Нет уроков', style: TextStyle(fontWeight: FontWeight.w600)),
                            const SizedBox(height: 12),
                            FilledButton.icon(icon: const Icon(Icons.add, size: 18), label: const Text('Добавить'), onPressed: () => context.push('/lessons/new?groupId=$groupId')),
                          ],
                        ),
                      );
                    }
                    return Column(
                      children: groupLessons.map((l) {
                        final isPublished = l['status'] == 'published';
                        return GestureDetector(
                          onTap: () => context.push('/lessons/${l['id']}'),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 44, height: 44,
                                  decoration: BoxDecoration(color: const Color(0xFF3B82F6).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                                  child: const Icon(Icons.play_lesson_outlined, color: Color(0xFF3B82F6), size: 20),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(l['title'] ?? 'Без названия', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                                      const SizedBox(height: 4),
                                      Row(
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: isPublished ? Colors.green.withValues(alpha: 0.1) : Colors.amber.withValues(alpha: 0.1),
                                              borderRadius: BorderRadius.circular(4),
                                            ),
                                            child: Text(isPublished ? '✓' : '●', style: TextStyle(fontSize: 10, color: isPublished ? Colors.green[700] : Colors.amber[700])),
                                          ),
                                          if (l['subject'] != null) ...[
                                            const SizedBox(width: 8),
                                            Text(l['subject'], style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                                          ],
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                Icon(Icons.chevron_right, size: 18, color: theme.colorScheme.onSurface.withValues(alpha: 0.3)),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    );
                  },
                  loading: () => const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator())),
                  error: (err, _) => Text('Ошибка: $err'),
                ),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(child: Text('Ошибка: $err')),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  const _SectionHeader({required this.icon, required this.title});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Container(
          width: 32, height: 32,
          decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 16, color: theme.colorScheme.primary),
        ),
        const SizedBox(width: 10),
        Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _InfoChip({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }
}
