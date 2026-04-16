import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../data/models/homework_submission.dart';
import '../../domain/providers/auth_provider.dart';
import '../../domain/providers/lesson_providers.dart';

/// Homework submission screen with text answer + file uploads.
class HomeworkSubmitScreen extends ConsumerStatefulWidget {
  final String lessonId;

  const HomeworkSubmitScreen({super.key, required this.lessonId});

  @override
  ConsumerState<HomeworkSubmitScreen> createState() =>
      _HomeworkSubmitScreenState();
}

class _HomeworkSubmitScreenState extends ConsumerState<HomeworkSubmitScreen> {
  final _answerController = TextEditingController();
  final _attachments = <HomeworkAttachment>[];
  bool _submitting = false;
  bool _uploading = false;
  HomeworkSubmission? _existing;
  bool _loaded = false;

  @override
  void dispose() {
    _answerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final lessonAsync = ref.watch(lessonDetailProvider(widget.lessonId));
    final submissionAsync =
        ref.watch(homeworkSubmissionProvider(widget.lessonId));

    // Load existing submission data once
    submissionAsync.whenData((sub) {
      if (!_loaded && sub != null) {
        _answerController.text = sub.content;
        _attachments.clear();
        _attachments.addAll(sub.attachments);
        _existing = sub;
        _loaded = true;
      }
      if (!_loaded && sub == null) {
        _loaded = true;
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Домашнее задание'),
        actions: [
          if (_existing != null && _existing!.isGraded)
            Container(
              margin: const EdgeInsets.only(right: 12),
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.check_circle,
                      color: Color(0xFF10B981), size: 16),
                  const SizedBox(width: 4),
                  Text(
                    '${_existing!.finalScore?.toStringAsFixed(0) ?? "0"}/${_existing!.maxPoints}',
                    style: const TextStyle(
                      color: Color(0xFF10B981),
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
      body: lessonAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const Center(child: Text('Ошибка загрузки урока')),
        data: (lesson) {
          final hw = lesson.homework;
          if (hw == null) {
            return const Center(child: Text('У этого урока нет ДЗ'));
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // ── Assignment Info ──
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFF59E0B).withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color:
                        const Color(0xFFF59E0B).withValues(alpha: 0.15),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.assignment_outlined,
                            color: Color(0xFFF59E0B), size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            hw.title,
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (hw.points > 0)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF59E0B)
                                  .withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              '${hw.points} XP',
                              style: const TextStyle(
                                color: Color(0xFFF59E0B),
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                      ],
                    ),
                    if (hw.description.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(
                        hw.description,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.6),
                          height: 1.4,
                        ),
                      ),
                    ],
                    if (hw.dueDate != null && hw.dueDate!.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Icon(Icons.calendar_today,
                              size: 13,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.4)),
                          const SizedBox(width: 6),
                          Text(
                            'Срок: ${hw.dueDate}',
                            style: TextStyle(
                              fontSize: 12,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.5),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // ── Grading Result (if graded) ──
              if (_existing != null && _existing!.isGraded) ...[
                _GradingResult(submission: _existing!, theme: theme, isDark: isDark),
                const SizedBox(height: 20),
              ],

              // ── Answer Input ──
              Text(
                'Ваш ответ',
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _answerController,
                maxLines: 8,
                minLines: 4,
                decoration: InputDecoration(
                  hintText: 'Напишите свой ответ здесь...',
                  hintStyle: TextStyle(
                    color: theme.colorScheme.onSurface
                        .withValues(alpha: 0.3),
                  ),
                  filled: true,
                  fillColor:
                      isDark ? const Color(0xFF1E293B) : Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(
                      color: theme.colorScheme.outline
                          .withValues(alpha: 0.12),
                    ),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(
                      color: theme.colorScheme.outline
                          .withValues(alpha: 0.12),
                    ),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(
                      color: theme.colorScheme.primary,
                      width: 2,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // ── File Attachments ──
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Файлы (${_attachments.length})',
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  Row(
                    children: [
                      _UploadButton(
                        icon: Icons.image_outlined,
                        label: 'Фото',
                        onTap: () => _pickFile(ImageSource.gallery),
                        uploading: _uploading,
                      ),
                      const SizedBox(width: 8),
                      _UploadButton(
                        icon: Icons.camera_alt_outlined,
                        label: 'Камера',
                        onTap: () => _pickFile(ImageSource.camera),
                        uploading: _uploading,
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (_attachments.isEmpty)
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: isDark
                        ? const Color(0xFF1E293B)
                        : const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: theme.colorScheme.outline
                          .withValues(alpha: 0.08),
                      style: BorderStyle.solid,
                    ),
                  ),
                  child: Center(
                    child: Text(
                      'Нет прикреплённых файлов',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.35),
                      ),
                    ),
                  ),
                )
              else
                ..._attachments.asMap().entries.map((entry) {
                  final i = entry.key;
                  final att = entry.value;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: isDark
                            ? const Color(0xFF1E293B)
                            : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: theme.colorScheme.outline
                              .withValues(alpha: 0.08),
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            att.type == 'image'
                                ? Icons.image_outlined
                                : Icons.insert_drive_file_outlined,
                            color: theme.colorScheme.primary,
                            size: 22,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              att.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                          IconButton(
                            onPressed: () {
                              setState(() => _attachments.removeAt(i));
                            },
                            icon: Icon(Icons.close,
                                size: 18,
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.4)),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              const SizedBox(height: 28),

              // ── Submit Button ──
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton.icon(
                  onPressed: _submitting ? null : _submit,
                  style: FilledButton.styleFrom(
                    backgroundColor: theme.colorScheme.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  icon: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send_rounded, size: 20),
                  label: Text(
                    _existing != null ? 'Обновить ответ' : 'Отправить',
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 16),
                  ),
                ),
              ),
              const SizedBox(height: 20),
            ],
          );
        },
      ),
    );
  }

  Future<void> _pickFile(ImageSource source) async {
    setState(() => _uploading = true);
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: source,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
      );
      if (picked == null) {
        setState(() => _uploading = false);
        return;
      }

      final uid = FirebaseAuth.instance.currentUser?.uid ?? 'anon';
      final fileName =
          '${DateTime.now().millisecondsSinceEpoch}_${picked.name}';
      final storageRef = FirebaseStorage.instance
          .ref('homework_attachments/$uid/$fileName');

      final file = File(picked.path);
      await storageRef.putFile(file);
      final url = await storageRef.getDownloadURL();
      final size = await file.length();

      setState(() {
        _attachments.add(HomeworkAttachment(
          url: url,
          type: 'image',
          name: picked.name,
          size: size,
        ));
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Файл загружен ✓')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _submit() async {
    final answer = _answerController.text.trim();
    if (answer.isEmpty && _attachments.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Напишите ответ или прикрепите файл')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      final api = ref.read(apiServiceProvider);
      final profile = ref.read(userProfileProvider).valueOrNull;
      final lesson = ref.read(lessonDetailProvider(widget.lessonId)).valueOrNull;

      await api.submitHomework({
        'lessonId': widget.lessonId,
        'lessonTitle': lesson?.title ?? '',
        'organizationId': profile?.activeOrgId ?? '',
        'content': answer,
        'attachments':
            _attachments.map((a) => a.toMap()).toList(),
        'maxPoints': lesson?.homework?.points ?? 10,
      });

      // Refresh submission
      ref.invalidate(homeworkSubmissionProvider(widget.lessonId));

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Домашнее задание отправлено! ✓'),
            backgroundColor: Color(0xFF10B981),
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _UploadButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool uploading;

  const _UploadButton({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.uploading,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.primary.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: uploading ? null : onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              uploading
                  ? SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: theme.colorScheme.primary,
                      ),
                    )
                  : Icon(icon, size: 16, color: theme.colorScheme.primary),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: theme.colorScheme.primary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GradingResult extends StatelessWidget {
  final HomeworkSubmission submission;
  final ThemeData theme;
  final bool isDark;

  const _GradingResult({
    required this.submission,
    required this.theme,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFF10B981).withValues(alpha: 0.2),
          width: 2,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color:
                      const Color(0xFF10B981).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.grade_outlined,
                    color: Color(0xFF10B981), size: 20),
              ),
              const SizedBox(width: 10),
              Text(
                'Оценка',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFF10B981),
                ),
              ),
              const Spacer(),
              Text(
                '${submission.finalScore?.toStringAsFixed(0) ?? "0"} / ${submission.maxPoints}',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF10B981),
                ),
              ),
            ],
          ),
          if (submission.teacherFeedback != null &&
              submission.teacherFeedback!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              'Комментарий преподавателя:',
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.onSurface
                    .withValues(alpha: 0.5),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              submission.teacherFeedback!,
              style: theme.textTheme.bodyMedium?.copyWith(
                height: 1.4,
                color: theme.colorScheme.onSurface
                    .withValues(alpha: 0.7),
              ),
            ),
          ],
          if (submission.aiAnalysis != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF8B5CF6).withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.auto_awesome,
                          size: 14, color: Color(0xFF8B5CF6)),
                      const SizedBox(width: 6),
                      Text(
                        'AI Анализ',
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF8B5CF6),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    submission.aiAnalysis!.suggestions,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface
                          .withValues(alpha: 0.6),
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
