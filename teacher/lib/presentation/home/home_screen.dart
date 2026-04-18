import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/providers.dart';
import '../components/org_switcher.dart';
import '../components/ad_banner_widget.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(dashboardProvider);
    final theme = Theme.of(context);
    final profileAsync = ref.watch(userProfileProvider);

    return Scaffold(
      body: SafeArea(
        child: dashboardAsync.when(
          data: (data) {
            final lessonsCount = data['lessonsCount'] ?? 0;
            final examsCount = data['examsCount'] ?? 0;
            final activeRoomsCount = data['activeRoomsCount'] ?? 0;
            final attemptsCount = data['attemptsCount'] ?? 0;
            final avgScore = data['avgScore'] ?? 0;
            final recentLessons = (data['recentLessons'] as List?) ?? [];
            final recentExams = (data['recentExams'] as List?) ?? [];

            return RefreshIndicator(
              onRefresh: () async => ref.refresh(dashboardProvider.future),
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                children: [
                  const SizedBox(height: 16),
                  // Header
                  Row(
                    children: [
                      Expanded(
                        child: profileAsync.when(
                          data: (profile) {
                            final name = profile?['displayName'] ?? 'Преподаватель';
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Привет, $name 👋', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                                const SizedBox(height: 4),
                                const OrgSwitcher(),
                              ],
                            );
                          },
                          loading: () => const Text('Загрузка...'),
                          error: (_, __) => const Text('Привет! 👋', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                        ),
                      ),
                      GestureDetector(
                        onTap: () => context.push('/profile'),
                        child: profileAsync.when(
                          data: (profile) {
                            final photoURL = profile?['avatarUrl'] ?? profile?['photoURL'] ?? '';
                            return CircleAvatar(
                              radius: 24,
                              backgroundColor: theme.colorScheme.primaryContainer,
                              backgroundImage: photoURL.toString().isNotEmpty ? NetworkImage(photoURL.toString()) : null,
                              child: photoURL.toString().isEmpty ? Icon(Icons.person, color: theme.colorScheme.onPrimaryContainer) : null,
                            );
                          },
                          loading: () => CircleAvatar(radius: 24, backgroundColor: theme.colorScheme.primaryContainer),
                          error: (_, __) => CircleAvatar(radius: 24, backgroundColor: theme.colorScheme.primaryContainer),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Promo Banner
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [theme.colorScheme.primary, theme.colorScheme.primary.withValues(alpha: 0.7)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Сводка за сегодня', style: TextStyle(color: Colors.white70, fontSize: 13)),
                        const SizedBox(height: 8),
                        Text('Средний балл: $avgScore%', style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        Text('$attemptsCount попыток сдачи', style: const TextStyle(color: Colors.white70, fontSize: 14)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Ad Banner
                  const Center(child: AdBannerWidget()),
                  const SizedBox(height: 16),

                  // Quick Actions
                  Row(
                    children: [
                      Expanded(
                        child: GestureDetector(
                          onTap: () => context.push('/homework'),
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF59E0B).withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: const Color(0xFFF59E0B).withValues(alpha: 0.15)),
                            ),
                            child: const Row(
                              children: [
                                Icon(Icons.assignment_outlined, color: Color(0xFFF59E0B), size: 22),
                                SizedBox(width: 10),
                                Expanded(child: Text('Проверка ДЗ', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: Color(0xFFF59E0B)))),
                                Icon(Icons.chevron_right, size: 18, color: Color(0xFFF59E0B)),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: GestureDetector(
                          onTap: () => context.push('/students'),
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: const Color(0xFF3B82F6).withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.15)),
                            ),
                            child: const Row(
                              children: [
                                Icon(Icons.people_outline, color: Color(0xFF3B82F6), size: 22),
                                SizedBox(width: 10),
                                Expanded(child: Text('Студенты', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: Color(0xFF3B82F6)))),
                                Icon(Icons.chevron_right, size: 18, color: Color(0xFF3B82F6)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Quick Stats
                  const Text('Статистика', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(child: _QuickStat(icon: Icons.auto_stories_outlined, label: 'Уроков', value: '$lessonsCount', color: const Color(0xFF7C3AED))),
                      const SizedBox(width: 12),
                      Expanded(child: _QuickStat(icon: Icons.quiz_outlined, label: 'Экзаменов', value: '$examsCount', color: const Color(0xFF10B981))),
                      const SizedBox(width: 12),
                      Expanded(child: _QuickStat(icon: Icons.meeting_room_outlined, label: 'Комнат', value: '$activeRoomsCount', color: const Color(0xFFF59E0B))),
                    ],
                  ),
                  const SizedBox(height: 28),

                  // Recent Lessons
                  if (recentLessons.isNotEmpty) ...[
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Последние уроки', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        TextButton(onPressed: () => context.go('/courses'), child: const Text('Все')),
                      ],
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 130,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: recentLessons.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 12),
                        itemBuilder: (context, i) {
                          final l = recentLessons[i] as Map<String, dynamic>;
                          return GestureDetector(
                            onTap: () => context.push('/lessons/${l['id']}'),
                            child: Container(
                              width: 220,
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
                                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Container(
                                        width: 36, height: 36,
                                        decoration: BoxDecoration(color: const Color(0xFF7C3AED).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                                        child: const Icon(Icons.play_lesson_outlined, size: 18, color: Color(0xFF7C3AED)),
                                      ),
                                      const Spacer(),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                        decoration: BoxDecoration(
                                          color: l['status'] == 'published' ? Colors.green.withValues(alpha: 0.1) : Colors.amber.withValues(alpha: 0.1),
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Text(
                                          l['status'] == 'published' ? '✓' : '●',
                                          style: TextStyle(fontSize: 10, color: l['status'] == 'published' ? Colors.green[700] : Colors.amber[700]),
                                        ),
                                      )
                                    ],
                                  ),
                                  const SizedBox(height: 12),
                                  Text(l['title'] ?? 'Без названия', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14), maxLines: 2, overflow: TextOverflow.ellipsis),
                                  const SizedBox(height: 4),
                                  Text(l['subject'] ?? '', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)), maxLines: 1),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Recent Exams
                  if (recentExams.isNotEmpty) ...[
                    const Text('Последние экзамены', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    ...recentExams.take(3).map((e) {
                      final exam = e as Map<String, dynamic>;
                      return GestureDetector(
                        onTap: () => context.push('/exams/${exam['id']}'),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 48, height: 48,
                                decoration: BoxDecoration(color: const Color(0xFF10B981).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                                child: const Icon(Icons.assignment_outlined, color: Color(0xFF10B981)),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(exam['title'] ?? 'Экзамен', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                                    const SizedBox(height: 3),
                                    Text('${exam['questionsCount'] ?? '?'} вопросов', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                                  ],
                                ),
                              ),
                              const Icon(Icons.chevron_right, size: 20, color: Colors.grey),
                            ],
                          ),
                        ),
                      );
                    }),
                  ],
                  const SizedBox(height: 32),
                ],
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
                  Icon(Icons.cloud_off_outlined, size: 64, color: theme.colorScheme.error.withValues(alpha: 0.5)),
                  const SizedBox(height: 16),
                  const Text('Не удалось загрузить данные', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text('$err', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)), textAlign: TextAlign.center),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    icon: const Icon(Icons.refresh),
                    label: const Text('Повторить'),
                    onPressed: () => ref.refresh(dashboardProvider),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _QuickStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _QuickStat({required this.icon, required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(height: 8),
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: color)),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(fontSize: 12, color: color.withValues(alpha: 0.8))),
        ],
      ),
    );
  }
}
