import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/providers.dart';

class CourseDetailScreen extends ConsumerWidget {
  final String courseId;
  const CourseDetailScreen({super.key, required this.courseId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coursesAsync = ref.watch(coursesProvider);
    final groupsAsync = ref.watch(groupsProvider(courseId));
    final canCreate = ref.watch(canCreateProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Курс')),
      body: coursesAsync.when(
        data: (courses) {
          // Find the course in the list
          final courseList = courses.cast<Map<String, dynamic>>();
          final course = courseList.where((c) => c['id'] == courseId).firstOrNull;

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(coursesProvider);
              ref.invalidate(groupsProvider(courseId));
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // ── Hero Card ──
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [theme.colorScheme.primary, theme.colorScheme.primary.withValues(alpha: 0.7)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Status + Subject badges
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: (course?['status'] == 'published')
                                  ? Colors.green.withValues(alpha: 0.2)
                                  : Colors.amber.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              (course?['status'] == 'published') ? 'Опубликован' : 'Черновик',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: (course?['status'] == 'published') ? Colors.green[100] : Colors.amber[100],
                              ),
                            ),
                          ),
                          if (course?['subject'] != null && course!['subject'].toString().isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
                              child: Text(
                                course['subject'],
                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white70),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Text(
                        course?['title'] ?? course?['name'] ?? 'Курс',
                        style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Colors.white, height: 1.2),
                      ),
                      if (course?['description'] != null && course!['description'].toString().isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text(
                          course['description'],
                          style: TextStyle(fontSize: 14, color: Colors.white.withValues(alpha: 0.8), height: 1.5),
                          maxLines: 4,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 18),
                      // Price + Date row
                      Row(
                        children: [
                          if (course?['price'] != null && course!['price'] > 0) ...[
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.monetization_on_outlined, size: 16, color: Colors.white70),
                                  const SizedBox(width: 6),
                                  Text(
                                    '${course['price']} сом/${course['paymentFormat'] == 'monthly' ? 'мес' : 'разово'}',
                                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white),
                                  ),
                                ],
                              ),
                            ),
                          ] else
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.monetization_on_outlined, size: 16, color: Colors.white70),
                                  SizedBox(width: 6),
                                  Text('Бесплатно', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                                ],
                              ),
                            ),
                          const Spacer(),
                          if (course?['createdAt'] != null)
                            Text(
                              _formatDate(course!['createdAt'].toString()),
                              style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.6)),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // ── Stats Row ──
                groupsAsync.when(
                  data: (groups) {
                    final totalStudents = groups.fold<int>(0, (sum, g) {
                      final g2 = g as Map<String, dynamic>;
                      return sum + ((g2['studentIds'] as List?)?.length ?? 0);
                    });
                    return Row(
                      children: [
                        _StatCard(icon: Icons.group_outlined, value: '${groups.length}', label: 'Групп', color: const Color(0xFF7C3AED)),
                        const SizedBox(width: 10),
                        _StatCard(icon: Icons.people_outline, value: '$totalStudents', label: 'Студентов', color: const Color(0xFF3B82F6)),
                        const SizedBox(width: 10),
                        _StatCard(icon: Icons.calendar_today_outlined, value: course?['durationMonths']?.toString() ?? '—', label: 'Месяцев', color: const Color(0xFFF59E0B)),
                      ],
                    );
                  },
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                ),
                const SizedBox(height: 24),

                // ── Groups Section Header ──
                Row(
                  children: [
                    Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(color: const Color(0xFF7C3AED).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                      child: const Icon(Icons.group_outlined, color: Color(0xFF7C3AED), size: 18),
                    ),
                    const SizedBox(width: 10),
                    const Expanded(child: Text('Группы на курсе', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700))),
                    if (canCreate)
                      IconButton(
                        icon: const Icon(Icons.add_circle_outline),
                        onPressed: () => context.push('/courses/$courseId/groups/new'),
                      ),
                  ],
                ),
                const SizedBox(height: 12),

                // ── Groups List ──
                groupsAsync.when(
                  data: (groups) {
                    if (groups.isEmpty) {
                      return Container(
                        padding: const EdgeInsets.all(32),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(16),
                          border: Border(top: BorderSide(color: theme.colorScheme.outline.withValues(alpha: 0.08))),
                        ),
                        child: Column(
                          children: [
                            Icon(Icons.group_off_outlined, size: 52, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                            const SizedBox(height: 12),
                            const Text('Нет привязанных групп', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                            const SizedBox(height: 6),
                            Text('Создайте группу и добавьте студентов', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                            if (canCreate) ...[
                              const SizedBox(height: 16),
                              FilledButton.icon(icon: const Icon(Icons.add), label: const Text('Создать группу'), onPressed: () => context.push('/courses/$courseId/groups/new')),
                            ],
                          ],
                        ),
                      );
                    }
                    return Column(
                      children: groups.asMap().entries.map((entry) {
                        final g = entry.value as Map<String, dynamic>;
                        final i = entry.key;
                        final studentCount = (g['studentIds'] as List?)?.length ?? 0;
                        final colors = [const Color(0xFF7C3AED), const Color(0xFF10B981), const Color(0xFF3B82F6), const Color(0xFFF59E0B)];
                        final color = colors[i % colors.length];
                        final initial = (g['name'] ?? '?').toString()[0].toUpperCase();
                        final chatLink = g['chatLinkUrl'] ?? '';

                        return GestureDetector(
                          onTap: () => context.push('/groups/${g['id']}'),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
                              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2))],
                            ),
                            child: Column(
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 48, height: 48,
                                      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14)),
                                      child: Center(child: Text(initial, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color))),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(g['name'] ?? 'Без названия', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                                          const SizedBox(height: 4),
                                          Row(
                                            children: [
                                              Icon(Icons.people_outline, size: 14, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                                              const SizedBox(width: 4),
                                              Text('$studentCount студентов', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                    Icon(Icons.chevron_right, size: 20, color: theme.colorScheme.onSurface.withValues(alpha: 0.3)),
                                  ],
                                ),
                                if (chatLink.isNotEmpty) ...[
                                  const SizedBox(height: 10),
                                  Divider(height: 1, color: theme.colorScheme.outline.withValues(alpha: 0.06)),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      Icon(Icons.chat_bubble_outline, size: 14, color: const Color(0xFF3B82F6).withValues(alpha: 0.8)),
                                      const SizedBox(width: 6),
                                      Text(g['chatLinkTitle'] ?? 'Чат группы', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF3B82F6))),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    );
                  },
                  loading: () => const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator())),
                  error: (err, _) => Center(child: Text('Ошибка: $err')),
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

  String _formatDate(String isoDate) {
    try {
      final d = DateTime.parse(isoDate);
      return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
    } catch (_) {
      return isoDate;
    }
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final Color color;
  const _StatCard({required this.icon, required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: 0.1)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(height: 6),
            Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color.withValues(alpha: 0.7))),
          ],
        ),
      ),
    );
  }
}
