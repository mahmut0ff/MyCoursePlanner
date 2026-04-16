import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';


import '../../domain/providers/lesson_providers.dart';
import '../common/shimmer_list.dart';

/// Group detail — shows group info + list of lessons for this group.
class GroupDetailScreen extends ConsumerWidget {
  final String groupId;

  const GroupDetailScreen({super.key, required this.groupId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final lessonsAsync = ref.watch(groupLessonsProvider(groupId));

    // We don't have a single-group provider yet, so we find it from allGroups
    // or just show the lessons. We'll use the group data from the route param.

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // ── Hero AppBar ──
          SliverAppBar(
            expandedHeight: 180,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              title: const Text(
                'Уроки группы',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 18,
                  shadows: [Shadow(blurRadius: 8, color: Colors.black54)],
                ),
              ),
              background: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF7C3AED), Color(0xFF6366F1)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Stack(
                  children: [
                    Positioned(
                      right: -40,
                      top: -40,
                      child: Container(
                        width: 200,
                        height: 200,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withValues(alpha: 0.08),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 20,
                      bottom: 50,
                      child: Icon(Icons.group_outlined,
                          size: 80,
                          color: Colors.white.withValues(alpha: 0.12)),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Lessons List ──
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: lessonsAsync.when(
              loading: () => const SliverToBoxAdapter(
                child: ShimmerList(itemCount: 4, itemHeight: 90),
              ),
              error: (e, _) => SliverToBoxAdapter(
                child: Center(
                  child: Column(
                    children: [
                      const Icon(Icons.error_outline,
                          size: 48, color: Colors.redAccent),
                      const SizedBox(height: 12),
                      Text('Ошибка загрузки: $e',
                          style: theme.textTheme.bodySmall),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: () =>
                            ref.invalidate(groupLessonsProvider(groupId)),
                        icon: const Icon(Icons.refresh, size: 18),
                        label: const Text('Повторить'),
                      ),
                    ],
                  ),
                ),
              ),
              data: (lessons) {
                if (lessons.isEmpty) {
                  return SliverToBoxAdapter(
                    child: _EmptyLessons(theme: theme, isDark: isDark),
                  );
                }
                return SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final lesson = lessons[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _LessonCard(
                          title: lesson.title,
                          subject: lesson.subject,
                          duration: lesson.duration,
                          hasHomework: lesson.hasHomework,
                          hasVideo: lesson.hasVideo,
                          coverUrl: lesson.coverImageUrl,
                          status: lesson.status,
                          isDark: isDark,
                          theme: theme,
                          onTap: () =>
                              context.push('/lessons/${lesson.id}'),
                        ),
                      );
                    },
                    childCount: lessons.length,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyLessons extends StatelessWidget {
  final ThemeData theme;
  final bool isDark;

  const _EmptyLessons({required this.theme, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.1),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.menu_book_outlined,
              size: 56,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.15)),
          const SizedBox(height: 16),
          Text(
            'Уроков пока нет',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Уроки появятся, когда преподаватель их опубликует',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.35),
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _LessonCard extends StatelessWidget {
  final String title;
  final String subject;
  final int duration;
  final bool hasHomework;
  final bool hasVideo;
  final String? coverUrl;
  final String status;
  final bool isDark;
  final ThemeData theme;
  final VoidCallback onTap;

  const _LessonCard({
    required this.title,
    required this.subject,
    required this.duration,
    required this.hasHomework,
    required this.hasVideo,
    this.coverUrl,
    required this.status,
    required this.isDark,
    required this.theme,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: isDark ? const Color(0xFF1E293B) : Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: theme.colorScheme.outline.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            children: [
              // Thumbnail
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 64,
                  height: 64,
                  child: coverUrl != null && coverUrl!.isNotEmpty
                      ? Image.network(coverUrl!, fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => _placeholder())
                      : _placeholder(),
                ),
              ),
              const SizedBox(width: 14),

              // Content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Subject + Duration row
                    Row(
                      children: [
                        if (subject.isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF8B5CF6)
                                  .withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              subject,
                              style: const TextStyle(
                                color: Color(0xFF8B5CF6),
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        const SizedBox(width: 6),
                        Icon(Icons.schedule,
                            size: 12,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.35)),
                        const SizedBox(width: 3),
                        Text(
                          '$duration мин',
                          style: TextStyle(
                            fontSize: 10,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.4),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),

                    // Title
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),

                    // Badges row
                    if (hasHomework || hasVideo)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Row(
                          children: [
                            if (hasHomework)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF59E0B)
                                      .withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.assignment_outlined,
                                        size: 11,
                                        color: Color(0xFFF59E0B)),
                                    SizedBox(width: 3),
                                    Text(
                                      'ДЗ',
                                      style: TextStyle(
                                        color: Color(0xFFF59E0B),
                                        fontSize: 9,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            if (hasHomework && hasVideo)
                              const SizedBox(width: 6),
                            if (hasVideo)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFEF4444)
                                      .withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.play_circle_outline,
                                        size: 11,
                                        color: Color(0xFFEF4444)),
                                    SizedBox(width: 3),
                                    Text(
                                      'Видео',
                                      style: TextStyle(
                                        color: Color(0xFFEF4444),
                                        fontSize: 9,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),

              // Chevron
              Icon(Icons.chevron_right_rounded,
                  color:
                      theme.colorScheme.onSurface.withValues(alpha: 0.2)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _placeholder() {
    return Container(
      color: const Color(0xFF6366F1).withValues(alpha: 0.1),
      child: const Center(
        child: Icon(Icons.menu_book_rounded,
            size: 28, color: Color(0xFF6366F1)),
      ),
    );
  }
}
