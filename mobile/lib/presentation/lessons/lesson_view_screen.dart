import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../data/models/lesson_plan.dart';
import '../../domain/providers/lesson_providers.dart';

/// Full lesson view — content, video, attachments, homework button.
class LessonViewScreen extends ConsumerWidget {
  final String lessonId;

  const LessonViewScreen({super.key, required this.lessonId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final lessonAsync = ref.watch(lessonDetailProvider(lessonId));

    return Scaffold(
      body: lessonAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.redAccent),
              const SizedBox(height: 12),
              Text('Ошибка загрузки', style: theme.textTheme.titleMedium),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: () => ref.invalidate(lessonDetailProvider(lessonId)),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Повторить'),
              ),
            ],
          ),
        ),
        data: (lesson) {
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
                      icon: const Icon(Icons.play_circle_fill, size: 28),
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
                      shadows: [Shadow(blurRadius: 8, color: Colors.black54)],
                    ),
                  ),
                  background: lesson.coverImageUrl != null &&
                          lesson.coverImageUrl!.isNotEmpty
                      ? Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.network(lesson.coverImageUrl!,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => _gradientBg()),
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

                    // Rich content (TipTap JSON → simplified rendering)
                    if (lesson.content != null)
                      _TipTapContent(
                          content: lesson.content, theme: theme, isDark: isDark),

                    // Video embed card
                    if (lesson.hasVideo) ...[
                      const SizedBox(height: 20),
                      _VideoCard(
                          url: lesson.videoUrl!, theme: theme, isDark: isDark),
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
                      _HomeworkCard(
                        lesson: lesson,
                        theme: theme,
                        isDark: isDark,
                        onSubmit: () =>
                            context.push('/lessons/$lessonId/homework'),
                      ),
                    ],

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
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
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
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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

/// Simplified TipTap JSON renderer.
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
        final text = _extractText(node);
        return Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 8),
          child: Text(
            text,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              fontSize: level == 1 ? 22 : 18,
            ),
          ),
        );

      case 'paragraph':
        final text = _extractText(node);
        if (text.isEmpty) return const SizedBox(height: 8);
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            text,
            style: theme.textTheme.bodyMedium?.copyWith(
              height: 1.6,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.8),
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
              final text = _extractText(item);
              return Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('•  ',
                        style: TextStyle(
                            color: theme.colorScheme.primary,
                            fontWeight: FontWeight.w700)),
                    Expanded(
                        child: Text(text,
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(height: 1.5))),
                  ],
                ),
              );
            }).toList(),
          ),
        );

      case 'blockquote':
        final text = _extractText(node);
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
          child: Text(
            text,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontStyle: FontStyle.italic,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
            ),
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
                errorBuilder: (_, __, ___) =>
                    const SizedBox(height: 100)),
          ),
        );

      default:
        return const SizedBox.shrink();
    }
  }

  String _extractText(dynamic node) {
    if (node is! Map) return '';
    final content = node['content'] as List<dynamic>? ?? [];
    final buffer = StringBuffer();
    for (final child in content) {
      if (child is Map) {
        if (child['type'] == 'text') {
          buffer.write(child['text'] ?? '');
        } else {
          buffer.write(_extractText(child));
        }
      }
    }
    return buffer.toString();
  }
}
