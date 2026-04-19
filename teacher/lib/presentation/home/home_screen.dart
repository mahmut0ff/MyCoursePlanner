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
            final pendingHomeworkCount = data['pendingHomeworkCount'] ?? 0;
            final recentLessons = (data['recentLessons'] as List?) ?? [];
            final recentExams = (data['recentExams'] as List?) ?? [];

            return RefreshIndicator(
              onRefresh: () async => ref.refresh(dashboardProvider.future),
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                children: [
                  const SizedBox(height: 16),
                  // ═══ Premium Header Card ═══
                  profileAsync.when(
                    data: (profile) {
                      final name = profile?['displayName'] ?? 'Преподаватель';
                      final firstName = name.toString().split(' ').first;
                      final photoURL = profile?['avatarUrl'] ?? profile?['photoURL'] ?? '';
                      final hour = DateTime.now().hour;
                      final greeting = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              theme.colorScheme.primary.withOpacity(0.08),
                              theme.colorScheme.primary.withOpacity(0.03),
                            ],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: theme.colorScheme.primary.withOpacity(0.12),
                          ),
                        ),
                        child: Row(
                          children: [
                            // Avatar
                            GestureDetector(
                              onTap: () => context.push('/profile'),
                              child: Container(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: theme.colorScheme.primary.withOpacity(0.3),
                                    width: 2.5,
                                  ),
                                ),
                                child: CircleAvatar(
                                  radius: 24,
                                  backgroundColor: theme.colorScheme.primaryContainer,
                                  backgroundImage: photoURL.toString().isNotEmpty
                                      ? NetworkImage(photoURL.toString())
                                      : null,
                                  child: photoURL.toString().isEmpty
                                      ? Icon(Icons.person, size: 22, color: theme.colorScheme.onPrimaryContainer)
                                      : null,
                                ),
                              ),
                            ),
                            const SizedBox(width: 14),
                            // Greeting text
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        '$greeting,  ',
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500,
                                          color: theme.colorScheme.onSurface.withOpacity(0.5),
                                        ),
                                      ),
                                      Flexible(
                                        child: Text(
                                          '$firstName!',
                                          style: const TextStyle(
                                            fontSize: 17,
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: -0.3,
                                          ),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    'Управляйте вашими занятиями',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: theme.colorScheme.onSurface.withOpacity(0.4),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            // Notification bell
                            Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.04),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: IconButton(
                                icon: Icon(
                                  Icons.notifications_outlined,
                                  size: 22,
                                  color: theme.colorScheme.onSurface.withOpacity(0.6),
                                ),
                                onPressed: () => _showNotifications(context, ref),
                                padding: EdgeInsets.zero,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                    loading: () => Container(
                      height: 76,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withOpacity(0.05),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                    ),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 24),

                  // ═══ Premium Summary Card ═══
                  Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF7C3AED), Color(0xFF6D28D9), Color(0xFF5B21B6)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF7C3AED).withOpacity(0.35),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Stack(
                      children: [
                        // Decorative circles
                        Positioned(
                          top: -30,
                          right: -20,
                          child: Container(
                            width: 100,
                            height: 100,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white.withOpacity(0.08),
                            ),
                          ),
                        ),
                        Positioned(
                          bottom: -15,
                          left: -10,
                          child: Container(
                            width: 60,
                            height: 60,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white.withOpacity(0.05),
                            ),
                          ),
                        ),
                        // Content
                        Padding(
                          padding: const EdgeInsets.fromLTRB(24, 22, 24, 18),
                          child: Column(
                            children: [
                              // Top label
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                                decoration: BoxDecoration(
                                  color: Colors.white.withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.assignment_outlined, size: 13, color: Colors.white.withOpacity(0.7)),
                                    const SizedBox(width: 5),
                                    const Text(
                                      'ДОМАШНИЕ ЗАДАНИЯ',
                                      style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              // Main stat — pending homework
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    '$pendingHomeworkCount',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 42,
                                      fontWeight: FontWeight.w800,
                                      height: 1,
                                      letterSpacing: -1,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(
                                pendingHomeworkCount == 0
                                    ? 'Все ДЗ проверены ✔'
                                    : 'Ожидают проверки',
                                style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 14, fontWeight: FontWeight.w500),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '$lessonsCount уроков  ·  $examsCount экзаменов  ·  $activeRoomsCount комнат',
                                style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 11, fontWeight: FontWeight.w500),
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 20),
                              // Action buttons
                              Row(
                                children: [
                                  Expanded(
                                    child: GestureDetector(
                                      onTap: () =>
                                          showModalBottomSheet(
                                            context: context,
                                            backgroundColor: Colors.transparent,
                                            builder: (_) => Container(
                                              decoration: const BoxDecoration(
                                                color: Colors.white,
                                                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                                              ),
                                              padding: const EdgeInsets.all(24),
                                              child: Column(
                                                mainAxisSize: MainAxisSize.min,
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  const Text('Организация', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                                                  const SizedBox(height: 16),
                                                  const OrgSwitcher(),
                                                  const SizedBox(height: 24),
                                                ],
                                              ),
                                            ),
                                          ),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                        decoration: BoxDecoration(
                                          color: Colors.white.withOpacity(0.15),
                                          borderRadius: BorderRadius.circular(14),
                                          border: Border.all(color: Colors.white.withOpacity(0.2)),
                                        ),
                                        child: const Row(
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            Icon(Icons.swap_horiz_rounded, color: Colors.white, size: 18),
                                            SizedBox(width: 6),
                                            Text(
                                              'Организация',
                                              style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: GestureDetector(
                                      onTap: () => context.push('/courses'),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                        decoration: BoxDecoration(
                                          color: Colors.white,
                                          borderRadius: BorderRadius.circular(14),
                                        ),
                                        child: const Row(
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            Icon(Icons.add_rounded, color: Color(0xFF5B21B6), size: 18),
                                            SizedBox(width: 6),
                                            Text(
                                              'Создать урок',
                                              style: TextStyle(color: Color(0xFF5B21B6), fontSize: 13, fontWeight: FontWeight.w700),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
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
                                SizedBox(width: 8),
                                Expanded(child: Text('ДЗ', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: Color(0xFFF59E0B)))),
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
                                SizedBox(width: 8),
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

                  // Quick Stats — actionable metrics
                  const Text('Обзор', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(child: _QuickStat(icon: Icons.pending_actions, label: 'Ожидает', value: '$pendingHomeworkCount', color: pendingHomeworkCount > 0 ? const Color(0xFFEF4444) : const Color(0xFF10B981))),
                      const SizedBox(width: 12),
                      Expanded(child: _QuickStat(icon: Icons.auto_stories_outlined, label: 'Уроков', value: '$lessonsCount', color: const Color(0xFF7C3AED))),
                      const SizedBox(width: 12),
                      Expanded(child: _QuickStat(icon: Icons.quiz_outlined, label: 'Экзамены', value: '$examsCount', color: const Color(0xFF3B82F6))),
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
                      height: 150,
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
                                color: theme.colorScheme.surface,
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
                                  Expanded(
                                    child: Text(l['title'] ?? 'Без названия', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14), maxLines: 2, overflow: TextOverflow.ellipsis),
                                  ),
                                  Text(l['subject'] ?? '', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)), maxLines: 1, overflow: TextOverflow.ellipsis),
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

void _showNotifications(BuildContext context, WidgetRef ref) {
  final theme = Theme.of(context);
  final api = ref.read(apiServiceProvider);

  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (ctx) {
      return FutureBuilder<List<dynamic>>(
        future: api.getNotifications(),
        builder: (ctx, snap) {
          return DraggableScrollableSheet(
            initialChildSize: 0.6,
            maxChildSize: 0.9,
            minChildSize: 0.3,
            expand: false,
            builder: (ctx, scrollController) {
              return Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                child: Column(
                  children: [
                    Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Text('Уведомления', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                        const Spacer(),
                        if (snap.hasData && snap.data!.isNotEmpty)
                          TextButton(
                            onPressed: () async {
                              await api.markAllNotificationsRead();
                              if (ctx.mounted) Navigator.pop(ctx);
                            },
                            child: const Text('Прочитать все', style: TextStyle(fontSize: 12)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (snap.connectionState == ConnectionState.waiting)
                      const Expanded(child: Center(child: CircularProgressIndicator(strokeWidth: 2)))
                    else if (snap.hasError)
                      Expanded(child: Center(child: Text('Ошибка: ${snap.error}', style: const TextStyle(fontSize: 13))))
                    else if (!snap.hasData || snap.data!.isEmpty)
                      Expanded(
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.notifications_none, size: 56, color: theme.colorScheme.primary.withOpacity(0.2)),
                              const SizedBox(height: 12),
                              const Text('Нет уведомлений', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                              const SizedBox(height: 4),
                              Text('Здесь появятся ваши оповещения', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withOpacity(0.4))),
                            ],
                          ),
                        ),
                      )
                    else
                      Expanded(
                        child: ListView.separated(
                          controller: scrollController,
                          itemCount: snap.data!.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final n = snap.data![i] as Map<String, dynamic>;
                            final isRead = n['read'] == true;
                            final title = n['title'] ?? '';
                            final message = n['message'] ?? '';
                            final createdAt = n['createdAt'] ?? '';
                            String timeAgo = '';
                            try {
                              final dt = DateTime.parse(createdAt);
                              final diff = DateTime.now().difference(dt);
                              if (diff.inMinutes < 60) {
                                timeAgo = '${diff.inMinutes} мин назад';
                              } else if (diff.inHours < 24) {
                                timeAgo = '${diff.inHours} ч назад';
                              } else {
                                timeAgo = '${diff.inDays} дн назад';
                              }
                            } catch (_) {}

                            return Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: isRead ? Colors.white : theme.colorScheme.primary.withOpacity(0.04),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: isRead
                                      ? theme.colorScheme.outline.withOpacity(0.06)
                                      : theme.colorScheme.primary.withOpacity(0.15),
                                ),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    width: 8, height: 8,
                                    margin: const EdgeInsets.only(top: 6, right: 10),
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: isRead ? Colors.transparent : theme.colorScheme.primary,
                                    ),
                                  ),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(title, style: TextStyle(fontWeight: isRead ? FontWeight.w500 : FontWeight.w700, fontSize: 14)),
                                        if (message.isNotEmpty) ...[
                                          const SizedBox(height: 4),
                                          Text(message, style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withOpacity(0.6)), maxLines: 2, overflow: TextOverflow.ellipsis),
                                        ],
                                        if (timeAgo.isNotEmpty) ...[
                                          const SizedBox(height: 6),
                                          Text(timeAgo, style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface.withOpacity(0.35))),
                                        ],
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                  ],
                ),
              );
            },
          );
        },
      );
    },
  );
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
