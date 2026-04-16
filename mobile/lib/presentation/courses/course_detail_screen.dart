import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';


import '../../data/models/group.dart';
import '../../domain/providers/auth_provider.dart';
import '../../domain/providers/course_providers.dart';
import '../common/shimmer_list.dart';
import '../common/error_view.dart';

class CourseDetailScreen extends ConsumerWidget {
  final String courseId;

  const CourseDetailScreen({super.key, required this.courseId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final courseAsync = ref.watch(courseDetailProvider(courseId));
    final groupsAsync = ref.watch(groupsProvider(courseId));
    final currentUser = ref.watch(authStateProvider).valueOrNull;

    return Scaffold(
      body: courseAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(
          message: 'Не удалось загрузить курс',
          onRetry: () => ref.invalidate(courseDetailProvider(courseId)),
        ),
        data: (course) {
          return CustomScrollView(
            slivers: [
              // ── Cover AppBar ──
              SliverAppBar(
                expandedHeight: 200,
                pinned: true,
                flexibleSpace: FlexibleSpaceBar(
                  title: Text(
                    course.title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      shadows: [
                        Shadow(blurRadius: 8, color: Colors.black54),
                      ],
                    ),
                  ),
                  background: course.coverImageUrl != null &&
                          course.coverImageUrl!.isNotEmpty
                      ? Image.network(
                          course.coverImageUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              _gradient(),
                        )
                      : _gradient(),
                ),
              ),

              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    // ── Subject & Stats ──
                    Row(
                      children: [
                        if (course.subject.isNotEmpty)
                          Container(
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
                        const SizedBox(width: 8),
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
                          ),
                        ),
                        if (!course.isFree) ...[
                          const Spacer(),
                          Text(
                            '${course.price!.toStringAsFixed(0)} сом',
                            style: theme.textTheme.titleMedium?.copyWith(
                              color: theme.colorScheme.primary,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 20),

                    // ── Description ──
                    if (course.description.isNotEmpty) ...[
                      Text(
                        'Описание',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        course.description,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.7),
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],

                    // ── Enroll Button (only if not already enrolled) ──
                    ...(() {
                      final groups = groupsAsync.valueOrNull ?? [];
                      final uid = currentUser?.uid ?? '';
                      final isEnrolled = groups.any(
                          (g) => (g.studentIds).contains(uid));

                      if (isEnrolled) {
                        return [
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(
                                vertical: 14, horizontal: 16),
                            decoration: BoxDecoration(
                              color: Colors.green.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                  color:
                                      Colors.green.withValues(alpha: 0.3)),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.check_circle,
                                    color: Colors.green.shade600, size: 20),
                                const SizedBox(width: 8),
                                Text(
                                  'Вы учитесь на этом курсе',
                                  style: TextStyle(
                                    color: Colors.green.shade700,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 15,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ];
                      }

                      return [
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: ElevatedButton.icon(
                            onPressed: () async {
                              try {
                                final api = ref.read(apiServiceProvider);
                                await api.enrollInCourse(courseId);
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                          'Заявка на курс отправлена!'),
                                    ),
                                  );
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                        content: Text('Ошибка: $e')),
                                  );
                                }
                              }
                            },
                            icon: const Icon(Icons.school_outlined),
                            label: Text(
                              course.isFree
                                  ? 'Записаться на курс'
                                  : 'Записаться за ${course.price!.toStringAsFixed(0)} сом',
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 16,
                              ),
                            ),
                          ),
                        ),
                      ];
                    })(),
                    const SizedBox(height: 28),

                    // ── Groups ──
                    Text(
                      'Группы',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 12),

                    groupsAsync.when(
                      loading: () => const ShimmerList(
                          itemCount: 2, itemHeight: 70),
                      error: (_, __) =>
                          const Text('Не удалось загрузить группы'),
                      data: (groups) {
                        if (groups.isEmpty) {
                          return Container(
                            padding: const EdgeInsets.all(20),
                            decoration: BoxDecoration(
                              color: isDark
                                  ? const Color(0xFF1E293B)
                                  : Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: theme.colorScheme.outline
                                    .withValues(alpha: 0.1),
                              ),
                            ),
                            child: Text(
                              'Группы пока не созданы',
                              style: theme.textTheme.bodyMedium
                                  ?.copyWith(
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.5),
                              ),
                            ),
                          );
                        }
                        return Column(
                          children: groups
                              .map((g) => _GroupTile(
                                    group: g,
                                    isEnrolled: currentUser != null &&
                                        g.hasStudent(
                                            currentUser.uid),
                                    onEnroll: () async {
                                      try {
                                        final api = ref.read(
                                            apiServiceProvider);
                                        await api.enrollInGroup(
                                            g.id);
                                        ref.invalidate(
                                            groupsProvider(
                                                courseId));
                                        if (context.mounted) {
                                          ScaffoldMessenger.of(
                                                  context)
                                              .showSnackBar(
                                            SnackBar(
                                              content: Text(
                                                  'Вы записаны в ${g.name}!'),
                                            ),
                                          );
                                        }
                                      } catch (e) {
                                        if (context.mounted) {
                                          ScaffoldMessenger.of(
                                                  context)
                                              .showSnackBar(
                                            SnackBar(
                                                content: Text(
                                                    'Ошибка: $e')),
                                          );
                                        }
                                      }
                                    },
                                  ))
                              .toList(),
                        );
                      },
                    ),
                  ]),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  static Widget _gradient() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Center(
        child: Icon(Icons.menu_book_rounded,
            size: 64, color: Colors.white24),
      ),
    );
  }
}

class _GroupTile extends StatelessWidget {
  final Group group;
  final bool isEnrolled;
  final VoidCallback onEnroll;

  const _GroupTile({
    required this.group,
    required this.isEnrolled,
    required this.onEnroll,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: isEnrolled ? () => context.push('/groups/${group.id}') : null,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: theme.colorScheme.outline.withValues(alpha: 0.1),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary
                        .withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.group_outlined,
                      color: theme.colorScheme.primary, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        group.name,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        '${group.studentCount} студентов',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.5),
                        ),
                      ),
                    ],
                  ),
                ),
                if (isEnrolled)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color:
                              const Color(0xFF10B981).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text(
                          'Записан ✓',
                          style: TextStyle(
                            color: Color(0xFF10B981),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Icon(Icons.chevron_right_rounded,
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.2)),
                    ],
                  )
                else
                  TextButton(
                    onPressed: onEnroll,
                    child: const Text('Записаться'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
