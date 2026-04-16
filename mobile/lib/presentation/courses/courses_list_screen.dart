import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/models/course.dart';
import '../../domain/providers/auth_provider.dart';
import '../../domain/providers/course_providers.dart';
import '../common/error_view.dart';
import '../common/empty_state.dart';
import '../common/shimmer_list.dart';

class CoursesListScreen extends ConsumerWidget {
  const CoursesListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final coursesAsync = ref.watch(coursesProvider);
    final unreadCount = ref.watch(unreadNotificationCountProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Мои курсы'),
        actions: [
          Stack(
            children: [
              IconButton(
                icon: const Icon(Icons.notifications_outlined),
                onPressed: () => context.push('/notifications'),
              ),
              if (unreadCount > 0)
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.error,
                      shape: BoxShape.circle,
                    ),
                    constraints:
                        const BoxConstraints(minWidth: 18, minHeight: 18),
                    child: Text(
                      '$unreadCount',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: coursesAsync.when(
        loading: () => const ShimmerList(itemCount: 4, itemHeight: 220),
        error: (e, _) => ErrorView(
          message: 'Не удалось загрузить курсы',
          onRetry: () => ref.invalidate(coursesProvider),
        ),
        data: (courses) {
          if (courses.isEmpty) {
            return const EmptyState(
              icon: Icons.menu_book_rounded,
              title: 'Нет доступных курсов',
              subtitle:
                  'В учебном центре пока\nне добавлено ни одного курса',
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(coursesProvider),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: courses.length,
              itemBuilder: (context, index) {
                final course = courses[index];
                return _CourseCard(
                  course: course,
                  onTap: () => context.push('/courses/${course.id}'),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _CourseCard extends StatelessWidget {
  final Course course;
  final VoidCallback? onTap;

  const _CourseCard({required this.course, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: theme.colorScheme.outline.withValues(alpha: 0.1),
            ),
            boxShadow: isDark
                ? null
                : [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Cover image
              if (course.coverImageUrl != null &&
                  course.coverImageUrl!.isNotEmpty)
                SizedBox(
                  height: 140,
                  width: double.infinity,
                  child: Image.network(
                    course.coverImageUrl!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => _PlaceholderCover(),
                  ),
                )
              else
                _PlaceholderCover(),

              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Subject badge
                    if (course.subject.isNotEmpty)
                      Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFF8B5CF6)
                              .withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          course.subject,
                          style: const TextStyle(
                            color: Color(0xFF8B5CF6),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),

                    // Title
                    Text(
                      course.title,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (course.description.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        course.description,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.5),
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: 12),

                    // Stats row
                    Row(
                      children: [
                        Icon(Icons.book_outlined,
                            size: 16,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.4)),
                        const SizedBox(width: 4),
                        Text(
                          '${course.lessonCount} уроков',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.5),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        if (!course.isFree) ...[
                          const Spacer(),
                          Text(
                            '${course.price!.toStringAsFixed(0)} ₸',
                            style: theme.textTheme.labelMedium?.copyWith(
                              color: theme.colorScheme.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlaceholderCover extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 140,
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Icon(
        Icons.menu_book_rounded,
        size: 48,
        color: Colors.white38,
      ),
    );
  }
}
