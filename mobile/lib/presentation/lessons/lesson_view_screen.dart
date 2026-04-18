import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/models/lesson_plan.dart';
import '../../data/models/homework_submission.dart';
import '../../domain/providers/lesson_providers.dart';
import '../../domain/providers/auth_provider.dart';

/// Full lesson view — content, video, attachments, homework, completion.
class LessonViewScreen extends ConsumerStatefulWidget {
  final String lessonId;

  const LessonViewScreen({super.key, required this.lessonId});

  @override
  ConsumerState<LessonViewScreen> createState() => _LessonViewScreenState();
}

class _LessonViewScreenState extends ConsumerState<LessonViewScreen> {
  bool _isCompleted = false;
  bool _completing = false;

  @override
  void initState() {
    super.initState();
    _loadCompletionState();
  }

  Future<void> _loadCompletionState() async {
    final prefs = await SharedPreferences.getInstance();
    if (mounted) {
      setState(() {
        _isCompleted =
            prefs.getBool('viewed_lesson_${widget.lessonId}') ?? false;
      });
    }
  }

  Future<void> _handleCompleteLesson(LessonPlan lesson) async {
    if (_isCompleted || _completing) return;
    if (lesson.organizationId == null) return;
    setState(() => _completing = true);
    try {
      final api = ref.read(apiServiceProvider);
      await api.awardXP({
        'type': 'lesson',
        'sourceType': 'lesson',
        'sourceId': lesson.id,
        'organizationId': lesson.organizationId,
      });
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('viewed_lesson_${widget.lessonId}', true);
      if (mounted) {
        setState(() => _isCompleted = true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Row(
              children: [
                Icon(Icons.celebration, color: Colors.white, size: 20),
                SizedBox(width: 10),
                Text('Урок пройден! XP начислены 🎉'),
              ],
            ),
            backgroundColor: const Color(0xFF10B981),
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      }
    } catch (e) {
      // DO NOT mark as completed — XP was not awarded
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Row(
              children: [
                Icon(Icons.wifi_off, color: Colors.white, size: 18),
                SizedBox(width: 8),
                Expanded(child: Text('Ошибка сети. Попробуйте ещё раз')),
              ],
            ),
            backgroundColor: const Color(0xFFEF4444),
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            action: SnackBarAction(
              label: 'Повторить',
              textColor: Colors.white,
              onPressed: () => _handleCompleteLesson(lesson),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _completing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final lessonAsync = ref.watch(lessonDetailProvider(widget.lessonId));
    final submissionAsync =
        ref.watch(homeworkSubmissionProvider(widget.lessonId));

    return Scaffold(
      body: lessonAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline,
                  size: 48, color: Colors.redAccent),
              const SizedBox(height: 12),
              Text('Ошибка загрузки', style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: () =>
                    ref.invalidate(lessonDetailProvider(widget.lessonId)),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Повторить'),
              ),
            ],
          ),
        ),
        data: (lesson) {
          final submission = submissionAsync.valueOrNull;
          return CustomScrollView(
            slivers: [
              // ── Cover AppBar ──
              SliverAppBar(
                expandedHeight: 220,
                pinned: true,
                actions: [
                  if (lesson.hasVideo)
                    IconButton(
                      onPressed: () => _openUrl(lesson.videoUrl!),
                      icon:
                          const Icon(Icons.play_circle_fill, size: 28),
                      tooltip: 'Видео-лекция',
                    ),
                ],
                flexibleSpace: FlexibleSpaceBar(
                  title: Text(
                    lesson.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      shadows: [
                        Shadow(blurRadius: 8, color: Colors.black54)
                      ],
                    ),
                  ),
                  background: lesson.coverImageUrl != null &&
                          lesson.coverImageUrl!.isNotEmpty
                      ? Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.network(lesson.coverImageUrl!,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) =>
                                    _gradientBg()),
                            Container(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [
                                    Colors.black.withValues(alpha: 0.6),
                                    Colors.transparent,
                                    Colors.black.withValues(alpha: 0.4),
                                  ],
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  stops: const [0.0, 0.4, 1.0],
                                ),
                              ),
                            ),
                          ],
                        )
                      : _gradientBg(),
                ),
              ),

              // ── Content ──
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    // Subject + Duration + Level row
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        if (lesson.subject.isNotEmpty)
                          _Badge(lesson.subject, const Color(0xFF8B5CF6)),
                        _Badge('${lesson.duration} мин',
                            theme.colorScheme.primary,
                            icon: Icons.schedule),
                        _Badge(lesson.level, const Color(0xFF10B981)),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // ── Author + Date + Groups (NEW) ──
                    _LessonMeta(lesson: lesson, theme: theme),
                    const SizedBox(height: 20),

                    // Description
                    if (lesson.description.isNotEmpty) ...[
                      Text(
                        lesson.description,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.75),
                          height: 1.6,
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],

                    // Rich content (TipTap JSON → rendering)
                    if (lesson.content != null)
                      _TipTapContent(
                          content: lesson.content,
                          theme: theme,
                          isDark: isDark),

                    // Video embed card
                    if (lesson.hasVideo) ...[
                      const SizedBox(height: 20),
                      _VideoCard(
                          url: lesson.videoUrl!,
                          theme: theme,
                          isDark: isDark),
                    ],

                    // Attachments
                    if (lesson.attachments.isNotEmpty) ...[
                      const SizedBox(height: 24),
                      Text(
                        'Вложения',
                        style: theme.textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 10),
                      ...lesson.attachments.map((att) => _AttachmentTile(
                            attachment: att,
                            theme: theme,
                            isDark: isDark,
                          )),
                    ],

                    // Homework section
                    if (lesson.hasHomework) ...[
                      const SizedBox(height: 28),
                      // Show existing submission status if available
                      if (submission != null)
                        _SubmissionStatusCard(
                          submission: submission,
                          theme: theme,
                          isDark: isDark,
                        )
                      else
                        _HomeworkCard(
                          lesson: lesson,
                          theme: theme,
                          isDark: isDark,
                          onSubmit: () => context
                              .push('/lessons/${widget.lessonId}/homework'),
                        ),
                    ],

                    // ── Complete Lesson Section ──
                    const SizedBox(height: 32),
                    _CompleteLessonSection(
                      isCompleted: _isCompleted,
                      completing: _completing,
                      onComplete: () => _handleCompleteLesson(lesson),
                    ),

                    const SizedBox(height: 40),
                  ]),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  static Widget _gradientBg() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Center(
        child:
            Icon(Icons.menu_book_rounded, size: 64, color: Colors.white24),
      ),
    );
  }

  void _openUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

// ── Author + Date + Groups Meta ──
class _LessonMeta extends StatelessWidget {
  final LessonPlan lesson;
  final ThemeData theme;

  const _LessonMeta({required this.lesson, required this.theme});

  @override
  Widget build(BuildContext context) {
    final metaStyle = theme.textTheme.bodySmall?.copyWith(
      color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
      fontSize: 12,
    );
    return Wrap(
      spacing: 16,
      runSpacing: 6,
      children: [
        if (lesson.authorName.isNotEmpty)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.person_outline,
                  size: 14,
                  color:
                      theme.colorScheme.onSurface.withValues(alpha: 0.4)),
              const SizedBox(width: 4),
              Text(lesson.authorName, style: metaStyle),
            ],
          ),
        if (lesson.createdAt != null && lesson.createdAt!.isNotEmpty)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.calendar_today,
                  size: 13,
                  color:
                      theme.colorScheme.onSurface.withValues(alpha: 0.4)),
              const SizedBox(width: 4),
              Text(_formatDate(lesson.createdAt!), style: metaStyle),
            ],
          ),
        if (lesson.groupNames.isNotEmpty)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.groups_outlined,
                  size: 15,
                  color:
                      theme.colorScheme.onSurface.withValues(alpha: 0.4)),
              const SizedBox(width: 4),
              Text(lesson.groupNames.take(3).join(', '), style: metaStyle),
              if (lesson.groupNames.length > 3)
                Text(' +${lesson.groupNames.length - 3}', style: metaStyle),
            ],
          ),
      ],
    );
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
    } catch (_) {
      return iso;
    }
  }
}

// ── Complete Lesson Section ──
class _CompleteLessonSection extends StatelessWidget {
  final bool isCompleted;
  final bool completing;
  final VoidCallback onComplete;

  const _CompleteLessonSection({
    required this.isCompleted,
    required this.completing,
    required this.onComplete,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (isCompleted) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFF10B981).withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
          border:
              Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.2)),
        ),
        child: Column(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.check_circle,
                  color: Color(0xFF10B981), size: 32),
            ),
            const SizedBox(height: 12),
            Text('Урок пройден!',
                style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFF10B981))),
            const SizedBox(height: 4),
            Text('Вы великолепны. Продолжайте в том же духе.',
                style: theme.textTheme.bodySmall?.copyWith(
                    color:
                        theme.colorScheme.onSurface.withValues(alpha: 0.5))),
          ],
        ),
      );
    }

    return Column(
      children: [
        Divider(
            color: theme.colorScheme.outline.withValues(alpha: 0.08),
            thickness: 1),
        const SizedBox(height: 16),
        Text('Прочитали весь материал?',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(
          'Отметьте урок как пройденный, чтобы\nзаработать очки опыта!',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: FilledButton.icon(
            onPressed: completing ? null : onComplete,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF6366F1),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
            ),
            icon: completing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.celebration, size: 22),
            label: Text(completing ? 'Сохранение...' : 'Завершить урок',
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 16)),
          ),
        ),
      ],
    );
  }
}

// ── Homework Submission Status Card (NEW) ──
class _SubmissionStatusCard extends StatelessWidget {
  final HomeworkSubmission submission;
  final ThemeData theme;
  final bool isDark;

  const _SubmissionStatusCard({
    required this.submission,
    required this.theme,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    final statusColor = submission.isGraded
        ? const Color(0xFF10B981)
        : submission.status == 'reviewing'
            ? const Color(0xFF3B82F6)
            : const Color(0xFFF59E0B);

    final statusText = submission.isGraded
        ? 'Оценено'
        : submission.status == 'reviewing'
            ? 'На проверке'
            : 'Ожидает проверки';

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: statusColor.withValues(alpha: 0.3), width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top gradient accent
          Container(
            height: 4,
            decoration: BoxDecoration(
              color: statusColor,
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(18)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(Icons.check_circle_outline,
                          color: statusColor, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Домашнее задание сдано',
                              style: theme.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.w700)),
                          if (submission.submittedAt != null)
                            Text(
                              _formatDate(submission.submittedAt!),
                              style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.5)),
                            ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        statusText,
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),

                // Grade display
                if (submission.isGraded &&
                    submission.finalScore != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFF6366F1).withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                          color: const Color(0xFF6366F1)
                              .withValues(alpha: 0.12)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text('Оценка: ',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                    color: const Color(0xFF6366F1),
                                    fontWeight: FontWeight.w600)),
                            Text(
                              '${submission.finalScore!.toStringAsFixed(0)} / ${submission.maxPoints}',
                              style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w800),
                            ),
                          ],
                        ),
                        if (submission.teacherFeedback != null &&
                            submission.teacherFeedback!.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.03),
                              borderRadius: BorderRadius.circular(10),
                              border: Border(
                                left: BorderSide(
                                    color: const Color(0xFF6366F1),
                                    width: 2),
                              ),
                            ),
                            child: Text(
                              '"${submission.teacherFeedback}"',
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontStyle: FontStyle.italic,
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.65),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}

class _Badge extends StatelessWidget {
  final String text;
  final Color color;
  final IconData? icon;

  const _Badge(this.text, this.color, {this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _VideoCard extends StatelessWidget {
  final String url;
  final ThemeData theme;
  final bool isDark;

  const _VideoCard(
      {required this.url, required this.theme, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: isDark ? const Color(0xFF1E293B) : Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () async {
          final uri = Uri.parse(url);
          if (await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          }
        },
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: const Color(0xFFEF4444).withValues(alpha: 0.15),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.play_circle_fill,
                    color: Color(0xFFEF4444), size: 28),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Видео-лекция',
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w600)),
                    Text('Нажмите, чтобы посмотреть',
                        style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.5))),
                  ],
                ),
              ),
              Icon(Icons.open_in_new,
                  size: 18,
                  color:
                      theme.colorScheme.onSurface.withValues(alpha: 0.3)),
            ],
          ),
        ),
      ),
    );
  }
}

class _AttachmentTile extends StatelessWidget {
  final LessonAttachment attachment;
  final ThemeData theme;
  final bool isDark;

  const _AttachmentTile({
    required this.attachment,
    required this.theme,
    required this.isDark,
  });

  IconData get _icon {
    if (attachment.isImage) return Icons.image_outlined;
    if (attachment.isVideo) return Icons.videocam_outlined;
    if (attachment.isPdf) return Icons.picture_as_pdf_outlined;
    return Icons.insert_drive_file_outlined;
  }

  Color get _color {
    if (attachment.isImage) return const Color(0xFF10B981);
    if (attachment.isVideo) return const Color(0xFF8B5CF6);
    if (attachment.isPdf) return const Color(0xFFEF4444);
    return const Color(0xFF6366F1);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () async {
            final uri = Uri.parse(attachment.url);
            if (await canLaunchUrl(uri)) {
              await launchUrl(uri, mode: LaunchMode.externalApplication);
            }
          },
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: theme.colorScheme.outline.withValues(alpha: 0.08),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: _color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(_icon, color: _color, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    attachment.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w500),
                  ),
                ),
                Icon(Icons.download_outlined,
                    size: 18,
                    color: theme.colorScheme.onSurface
                        .withValues(alpha: 0.3)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  final LessonPlan lesson;
  final ThemeData theme;
  final bool isDark;
  final VoidCallback onSubmit;

  const _HomeworkCard({
    required this.lesson,
    required this.theme,
    required this.isDark,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    final hw = lesson.homework!;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: const Color(0xFFF59E0B).withValues(alpha: 0.2),
          width: 2,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFF59E0B).withValues(alpha: 0.06),
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color:
                        const Color(0xFFF59E0B).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.assignment_outlined,
                      color: Color(0xFFF59E0B), size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Домашнее задание',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: const Color(0xFFF59E0B),
                        ),
                      ),
                      if (hw.points > 0)
                        Text(
                          '${hw.points} баллов',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.5),
                          ),
                        ),
                    ],
                  ),
                ),
                if (hw.dueDate != null && hw.dueDate!.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.onSurface
                          .withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.calendar_today,
                            size: 12,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.4)),
                        const SizedBox(width: 4),
                        Text(
                          hw.dueDate!,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.5),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),

          // Body
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  hw.title,
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                if (hw.description.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    hw.description,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface
                          .withValues(alpha: 0.6),
                      height: 1.4,
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton.icon(
                    onPressed: onSubmit,
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFFF59E0B),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    icon: const Icon(Icons.edit_note, size: 20),
                    label: const Text(
                      'Выполнить задание',
                      style: TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 15),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Enhanced TipTap JSON renderer with full node + marks support.
class _TipTapContent extends StatelessWidget {
  final dynamic content;
  final ThemeData theme;
  final bool isDark;

  const _TipTapContent(
      {required this.content, required this.theme, required this.isDark});

  @override
  Widget build(BuildContext context) {
    if (content is! Map) return const SizedBox.shrink();

    final doc = content as Map<String, dynamic>;
    final nodes = doc['content'] as List<dynamic>? ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: nodes.map((node) => _renderNode(node)).toList(),
    );
  }

  Widget _renderNode(dynamic node) {
    if (node is! Map) return const SizedBox.shrink();
    final type = node['type'] as String? ?? '';
    final attrs = node['attrs'] as Map<String, dynamic>? ?? {};

    switch (type) {
      case 'heading':
        final level = attrs['level'] ?? 1;
        return Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 8),
          child: _buildRichText(
            node,
            theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              fontSize: level == 1
                  ? 22
                  : level == 2
                      ? 19
                      : 17,
            ),
          ),
        );

      case 'paragraph':
        final children = node['content'] as List<dynamic>? ?? [];
        if (children.isEmpty) return const SizedBox(height: 8);
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _buildRichText(
            node,
            theme.textTheme.bodyMedium?.copyWith(
              height: 1.6,
              color:
                  theme.colorScheme.onSurface.withValues(alpha: 0.8),
            ),
          ),
        );

      case 'bulletList':
        final items = node['content'] as List<dynamic>? ?? [];
        return Padding(
          padding: const EdgeInsets.only(bottom: 8, left: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: items.map((item) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('•  ',
                        style: TextStyle(
                            color: theme.colorScheme.primary,
                            fontWeight: FontWeight.w700)),
                    Expanded(child: _buildRichText(item, theme.textTheme.bodyMedium?.copyWith(height: 1.5))),
                  ],
                ),
              );
            }).toList(),
          ),
        );

      case 'orderedList':
        final items = node['content'] as List<dynamic>? ?? [];
        return Padding(
          padding: const EdgeInsets.only(bottom: 8, left: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: items.asMap().entries.map((entry) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 24,
                      child: Text('${entry.key + 1}.',
                          style: TextStyle(
                              color: theme.colorScheme.primary,
                              fontWeight: FontWeight.w700)),
                    ),
                    Expanded(child: _buildRichText(entry.value, theme.textTheme.bodyMedium?.copyWith(height: 1.5))),
                  ],
                ),
              );
            }).toList(),
          ),
        );

      case 'blockquote':
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border(
              left: BorderSide(
                color: theme.colorScheme.primary,
                width: 3,
              ),
            ),
            color: theme.colorScheme.primary.withValues(alpha: 0.04),
          ),
          child: _buildRichText(
            node,
            theme.textTheme.bodyMedium?.copyWith(
              fontStyle: FontStyle.italic,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
            ),
          ),
        );

      case 'codeBlock':
        final text = _extractPlainText(node);
        return Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: theme.colorScheme.outline.withValues(alpha: 0.1),
            ),
          ),
          child: Text(
            text,
            style: TextStyle(
              fontFamily: 'monospace',
              fontSize: 13,
              height: 1.5,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.85),
            ),
          ),
        );

      case 'horizontalRule':
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Divider(
            color: theme.colorScheme.outline.withValues(alpha: 0.15),
            thickness: 1,
          ),
        );

      case 'image':
        final src = attrs['src'] as String? ?? '';
        if (src.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.network(src,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                      height: 120,
                      decoration: BoxDecoration(
                        color: isDark
                            ? const Color(0xFF1E293B)
                            : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: theme.colorScheme.outline
                              .withValues(alpha: 0.1),
                        ),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.broken_image_outlined,
                              size: 32,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.25)),
                          const SizedBox(height: 6),
                          Text(
                            'Изображение не загружено',
                            style: TextStyle(
                              fontSize: 11,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.3),
                            ),
                          ),
                        ],
                      ),
                    )),
          ),
        );

      case 'youtube':
        final src = attrs['src'] as String? ?? '';
        if (src.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Material(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () async {
                final uri = Uri.parse(src);
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              },
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                      color: const Color(0xFFEF4444).withValues(alpha: 0.15)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: const Color(0xFFEF4444).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.play_circle_fill,
                          color: Color(0xFFEF4444), size: 24),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('YouTube видео',
                              style: theme.textTheme.titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w600)),
                          Text('Нажмите для просмотра',
                              style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.5))),
                        ],
                      ),
                    ),
                    Icon(Icons.open_in_new,
                        size: 16,
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.3)),
                  ],
                ),
              ),
            ),
          ),
        );

      case 'listItem':
        // Handled by parent bulletList/orderedList
        return _buildRichText(node, theme.textTheme.bodyMedium?.copyWith(height: 1.5));

      case 'table':
        final rows = node['content'] as List<dynamic>? ?? [];
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: theme.colorScheme.outline.withValues(alpha: 0.15),
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Table(
                  defaultColumnWidth: const IntrinsicColumnWidth(),
                  border: TableBorder.symmetric(
                    inside: BorderSide(
                      color: theme.colorScheme.outline.withValues(alpha: 0.1),
                      width: 1,
                    ),
                  ),
                  children: rows.asMap().entries.map((entry) {
                    final isHeader = entry.key == 0;
                    final cells =
                        (entry.value as Map?)?['content'] as List<dynamic>? ?? [];
                    return TableRow(
                      decoration: BoxDecoration(
                        color: isHeader
                            ? theme.colorScheme.primary.withValues(alpha: 0.06)
                            : null,
                      ),
                      children: cells.map((cell) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 8),
                          child: _buildRichText(
                            cell,
                            (isHeader
                                    ? theme.textTheme.bodyMedium?.copyWith(
                                        fontWeight: FontWeight.w700)
                                    : theme.textTheme.bodyMedium)
                                ?.copyWith(height: 1.4),
                          ),
                        );
                      }).toList(),
                    );
                  }).toList(),
                ),
              ),
            ),
          ),
        );

      case 'tableRow':
      case 'tableCell':
      case 'tableHeader':
        // Handled by 'table' parent
        return _buildRichText(node, theme.textTheme.bodyMedium);

      default:
        return const SizedBox.shrink();
    }
  }

  /// Build a RichText widget that respects TipTap marks (bold, italic, links, code, strikethrough).
  Widget _buildRichText(dynamic node, TextStyle? baseStyle) {
    if (node is! Map) return const SizedBox.shrink();
    final content = node['content'] as List<dynamic>? ?? [];
    if (content.isEmpty) {
      // Try extracting plain text as fallback
      final plain = _extractPlainText(node);
      if (plain.isEmpty) return const SizedBox.shrink();
      return Text(plain, style: baseStyle);
    }

    final spans = <InlineSpan>[];
    for (final child in content) {
      if (child is! Map) continue;
      final childType = child['type'] as String? ?? '';

      if (childType == 'text') {
        final text = child['text'] as String? ?? '';
        if (text.isEmpty) continue;
        final marks = child['marks'] as List<dynamic>? ?? [];
        var style = baseStyle ?? const TextStyle();

        String? linkUrl;
        for (final mark in marks) {
          if (mark is! Map) continue;
          final markType = mark['type'] as String? ?? '';
          switch (markType) {
            case 'bold':
              style = style.copyWith(fontWeight: FontWeight.w700);
              break;
            case 'italic':
              style = style.copyWith(fontStyle: FontStyle.italic);
              break;
            case 'strike':
              style = style.copyWith(decoration: TextDecoration.lineThrough);
              break;
            case 'underline':
              style = style.copyWith(decoration: TextDecoration.underline);
              break;
            case 'code':
              style = style.copyWith(
                fontFamily: 'monospace',
                fontSize: (style.fontSize ?? 14) - 1,
                backgroundColor: isDark
                    ? const Color(0xFF0F172A)
                    : const Color(0xFFF1F5F9),
              );
              break;
            case 'link':
              linkUrl = (mark['attrs'] as Map<String, dynamic>?)?['href'];
              style = style.copyWith(
                color: const Color(0xFF6366F1),
                decoration: TextDecoration.underline,
              );
              break;
          }
        }

        if (linkUrl != null) {
          spans.add(WidgetSpan(
            child: GestureDetector(
              onTap: () async {
                final uri = Uri.parse(linkUrl!);
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              },
              child: Text(text, style: style),
            ),
          ));
        } else {
          spans.add(TextSpan(text: text, style: style));
        }
      } else if (childType == 'hardBreak') {
        spans.add(const TextSpan(text: '\n'));
      } else {
        // Nested nodes (e.g. listItem -> paragraph)
        final nested = _extractPlainText(child);
        if (nested.isNotEmpty) {
          spans.add(TextSpan(text: nested, style: baseStyle));
        }
      }
    }

    if (spans.isEmpty) return const SizedBox.shrink();
    return RichText(text: TextSpan(children: spans, style: baseStyle));
  }

  String _extractPlainText(dynamic node) {
    if (node is! Map) return '';
    final content = node['content'] as List<dynamic>? ?? [];
    final buffer = StringBuffer();
    for (final child in content) {
      if (child is Map) {
        if (child['type'] == 'text') {
          buffer.write(child['text'] ?? '');
        } else {
          buffer.write(_extractPlainText(child));
        }
      }
    }
    return buffer.toString();
  }
}
