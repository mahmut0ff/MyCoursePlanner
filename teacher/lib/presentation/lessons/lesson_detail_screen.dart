import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../domain/providers/providers.dart';


class LessonDetailScreen extends ConsumerWidget {
  final String lessonId;
  const LessonDetailScreen({super.key, required this.lessonId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lessonAsync = ref.watch(lessonProvider(lessonId));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Урок'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Редактировать',
            onPressed: () => context.push('/lessons/$lessonId/edit'),
          ),
        ],
      ),
      body: lessonAsync.when(
        data: (lesson) {
          if (lesson.isEmpty) {
            return const Center(child: Text('Урок не найден.'));
          }
          final attachments = (lesson['attachments'] as List?) ?? [];
          final videoUrl = lesson['videoUrl'] ?? '';
          final content = lesson['content'];

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(lessonProvider(lessonId)),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Cover image
                  if (lesson['coverImageUrl'] != null &&
                      lesson['coverImageUrl'].toString().isNotEmpty) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Image.network(
                        lesson['coverImageUrl'],
                        width: double.infinity,
                        height: 200,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          height: 200,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Icon(Icons.image_not_supported_outlined,
                              size: 48, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Title + Status
                  Text(
                    lesson['title'] ?? 'Без названия',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primaryContainer,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(
                          lesson['subject'] ?? 'Без предмета',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: theme.colorScheme.onPrimaryContainer,
                          ),
                        ),
                      ),
                      if (lesson['status'] != null)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: lesson['status'] == 'published'
                                ? Colors.green.withValues(alpha: 0.1)
                                : Colors.amber.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Text(
                            lesson['status'] == 'published' ? 'Опубликован' : 'Черновик',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: lesson['status'] == 'published'
                                  ? Colors.green[700]
                                  : Colors.amber[700],
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Description
                  if (lesson['description'] != null &&
                      lesson['description'].toString().isNotEmpty) ...[
                    Text(
                      lesson['description'],
                      style: TextStyle(
                        fontSize: 15,
                        height: 1.6,
                        color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Video
                  if (videoUrl.toString().isNotEmpty) ...[
                    _SectionHeader(icon: Icons.play_circle_outlined, title: 'Видео'),
                    const SizedBox(height: 10),
                    GestureDetector(
                      onTap: () async {
                        final uri = Uri.parse(videoUrl);
                        if (await canLaunchUrl(uri)) {
                          await launchUrl(uri, mode: LaunchMode.externalApplication);
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFF3B82F6).withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.15)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.play_circle_filled, color: Color(0xFF3B82F6), size: 32),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Видеоматериал', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                  const SizedBox(height: 2),
                                  Text(videoUrl, style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)), maxLines: 1, overflow: TextOverflow.ellipsis),
                                ],
                              ),
                            ),
                            const Icon(Icons.open_in_new, size: 18, color: Color(0xFF3B82F6)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Content (TipTap JSON)
                  if (content != null) ...[
                    _SectionHeader(icon: Icons.article_outlined, title: 'Контент урока'),
                    const SizedBox(height: 10),
                    _TipTapRenderer(content: content, theme: theme),
                    const SizedBox(height: 24),
                  ],

                  // Attachments
                  if (attachments.isNotEmpty) ...[
                    _SectionHeader(icon: Icons.attach_file, title: 'Вложения (${attachments.length})'),
                    const SizedBox(height: 10),
                    ...attachments.map((a) {
                      final url = a is String ? a : (a as Map)['url'] ?? '';
                      final name = a is String ? 'Файл' : (a as Map)['name'] ?? 'Файл';
                      return GestureDetector(
                        onTap: url.toString().isNotEmpty
                            ? () async {
                                final uri = Uri.parse(url.toString());
                                if (await canLaunchUrl(uri)) {
                                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                                }
                              }
                            : null,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.insert_drive_file_outlined, size: 20, color: Color(0xFF7C3AED)),
                              const SizedBox(width: 10),
                              Expanded(child: Text(name.toString(), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500), overflow: TextOverflow.ellipsis)),
                              if (url.toString().isNotEmpty)
                                Icon(Icons.download_outlined, size: 18, color: theme.colorScheme.primary),
                            ],
                          ),
                        ),
                      );
                    }),
                    const SizedBox(height: 24),
                  ],

                  // No content fallback
                  if (content == null && videoUrl.toString().isEmpty && attachments.isEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(32),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        children: [
                          Icon(Icons.edit_note, size: 48, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                          const SizedBox(height: 12),
                          const Text('Контент не добавлен', style: TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 8),
                          Text('Добавьте контент через веб-панель', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                        ],
                      ),
                    ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Ошибка: $err'),
              ElevatedButton(
                onPressed: () => ref.refresh(lessonProvider(lessonId)),
                child: const Text('Повторить'),
              )
            ],
          ),
        ),
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

/// Simplified TipTap JSON renderer for teacher preview.
class _TipTapRenderer extends StatelessWidget {
  final dynamic content;
  final ThemeData theme;
  const _TipTapRenderer({required this.content, required this.theme});

  @override
  Widget build(BuildContext context) {
    if (content is! Map) return const SizedBox.shrink();
    final doc = content as Map<String, dynamic>;
    final nodes = (doc['content'] as List<dynamic>?) ?? [];
    if (nodes.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: nodes.map((node) => _buildNode(node, context)).toList(),
    );
  }

  Widget _buildNode(dynamic node, BuildContext context) {
    if (node is! Map) return const SizedBox.shrink();
    final type = node['type'] as String? ?? '';

    switch (type) {
      case 'paragraph':
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _buildRichText(node, theme.textTheme.bodyMedium?.copyWith(height: 1.6)),
        );

      case 'heading':
        final level = node['attrs']?['level'] ?? 2;
        final style = switch (level) {
          1 => theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
          2 => theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          _ => theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        };
        return Padding(
          padding: const EdgeInsets.only(bottom: 10, top: 8),
          child: _buildRichText(node, style),
        );

      case 'bulletList':
      case 'orderedList':
        final items = node['content'] as List<dynamic>? ?? [];
        return Padding(
          padding: const EdgeInsets.only(bottom: 10, left: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: items.asMap().entries.map((entry) {
              final prefix = type == 'orderedList' ? '${entry.key + 1}.' : '•';
              final itemContent = entry.value['content'] as List<dynamic>? ?? [];
              return Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 24, child: Text(prefix, style: TextStyle(fontSize: 14, color: theme.colorScheme.primary, fontWeight: FontWeight.w700))),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: itemContent.map((c) => _buildRichText(c, theme.textTheme.bodyMedium?.copyWith(height: 1.5))).toList(),
                      ),
                    ),
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
            border: Border(left: BorderSide(color: theme.colorScheme.primary, width: 3)),
            color: theme.colorScheme.primary.withValues(alpha: 0.04),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: ((node['content'] as List?) ?? []).map((c) => _buildRichText(c, theme.textTheme.bodyMedium?.copyWith(fontStyle: FontStyle.italic, height: 1.5))).toList(),
          ),
        );

      case 'image':
        final src = node['attrs']?['src'] ?? '';
        if (src.toString().isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.network(
              src,
              width: double.infinity,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                height: 100,
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Center(child: Icon(Icons.broken_image_outlined, size: 32, color: Colors.grey)),
              ),
            ),
          ),
        );

      case 'horizontalRule':
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Divider(color: theme.colorScheme.outline.withValues(alpha: 0.2)),
        );

      case 'codeBlock':
        final code = _extractPlain(node);
        return Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(code, style: const TextStyle(fontFamily: 'monospace', fontSize: 13, color: Color(0xFFE2E8F0), height: 1.5)),
        );

      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildRichText(dynamic node, TextStyle? baseStyle) {
    if (node is! Map) return const SizedBox.shrink();
    final content = node['content'] as List<dynamic>? ?? [];
    if (content.isEmpty) {
      final plain = _extractPlain(node);
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
          switch (mark['type'] ?? '') {
            case 'bold':
              style = style.copyWith(fontWeight: FontWeight.w700);
            case 'italic':
              style = style.copyWith(fontStyle: FontStyle.italic);
            case 'strike':
              style = style.copyWith(decoration: TextDecoration.lineThrough);
            case 'underline':
              style = style.copyWith(decoration: TextDecoration.underline);
            case 'code':
              style = style.copyWith(fontFamily: 'monospace', fontSize: (style.fontSize ?? 14) - 1, backgroundColor: const Color(0xFFF1F5F9));
            case 'link':
              linkUrl = (mark['attrs'] as Map<String, dynamic>?)?['href'];
              style = style.copyWith(color: const Color(0xFF6366F1), decoration: TextDecoration.underline);
          }
        }

        if (linkUrl != null) {
          spans.add(WidgetSpan(
            child: GestureDetector(
              onTap: () async {
                final uri = Uri.parse(linkUrl!);
                if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
              },
              child: Text(text, style: style),
            ),
          ));
        } else {
          spans.add(TextSpan(text: text, style: style));
        }
      } else if (childType == 'hardBreak') {
        spans.add(const TextSpan(text: '\n'));
      }
    }

    if (spans.isEmpty) return const SizedBox.shrink();
    return RichText(text: TextSpan(children: spans, style: baseStyle));
  }

  String _extractPlain(dynamic node) {
    if (node is! Map) return '';
    final content = node['content'] as List<dynamic>? ?? [];
    final buf = StringBuffer();
    for (final child in content) {
      if (child is Map) {
        if (child['type'] == 'text') {
          buf.write(child['text'] ?? '');
        } else {
          buf.write(_extractPlain(child));
        }
      }
    }
    return buf.toString();
  }
}
