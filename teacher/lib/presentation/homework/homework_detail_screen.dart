import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../domain/providers/providers.dart';

class HomeworkDetailScreen extends ConsumerStatefulWidget {
  final Map<String, dynamic> submission;
  const HomeworkDetailScreen({super.key, required this.submission});

  @override
  ConsumerState<HomeworkDetailScreen> createState() => _HomeworkDetailScreenState();
}

class _HomeworkDetailScreenState extends ConsumerState<HomeworkDetailScreen> {
  final _gradeC = TextEditingController();
  final _feedbackC = TextEditingController();
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _gradeC.text = (widget.submission['finalScore'] ?? widget.submission['grade'])?.toString() ?? '';
    _feedbackC.text = widget.submission['teacherFeedback'] ?? widget.submission['feedback'] ?? '';
  }

  @override
  void dispose() {
    _gradeC.dispose();
    _feedbackC.dispose();
    super.dispose();
  }

  Future<void> _submitGrade() async {
    if (_gradeC.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Укажите оценку')));
      return;
    }

    setState(() => _loading = true);
    try {
      final api = ref.read(apiServiceProvider);
      await api.gradeHomework(widget.submission['id'] ?? '', {
        'grade': _gradeC.text.trim(),
        'feedback': _feedbackC.text.trim(),
      });
      ref.invalidate(homeworkProvider);
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Оценка выставлена!')));
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sub = widget.submission;
    final isGraded = sub['status'] == 'graded';
    final studentName = sub['studentName'] ?? 'Студент';
    final lessonTitle = sub['lessonTitle'] ?? 'Урок';
    final submittedAt = sub['submittedAt'] ?? sub['createdAt'] ?? '';
    final content = sub['content'] ?? sub['text'] ?? '';
    final attachments = (sub['attachments'] as List?) ?? [];

    return Scaffold(
      appBar: AppBar(title: const Text('Проверка работы')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Student info card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                  child: Text(
                    studentName.isNotEmpty ? studentName[0].toUpperCase() : '?',
                    style: TextStyle(fontWeight: FontWeight.bold, color: theme.colorScheme.primary),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(studentName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                      const SizedBox(height: 3),
                      Text(lessonTitle, style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: isGraded ? Colors.green.withValues(alpha: 0.1) : const Color(0xFFF59E0B).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isGraded ? 'Оценено' : 'Ожидает',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: isGraded ? Colors.green[700] : const Color(0xFFF59E0B)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Submitted date
          if (submittedAt.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFF3B82F6).withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.access_time, size: 16, color: Color(0xFF3B82F6)),
                  const SizedBox(width: 8),
                  Text('Отправлено: $submittedAt', style: const TextStyle(fontSize: 13, color: Color(0xFF3B82F6))),
                ],
              ),
            ),
          const SizedBox(height: 16),

          // Work Content
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(color: const Color(0xFF7C3AED).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                      child: const Icon(Icons.description_outlined, color: Color(0xFF7C3AED), size: 18),
                    ),
                    const SizedBox(width: 10),
                    const Text('Работа студента', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  ],
                ),
                const SizedBox(height: 14),
                if (content.isNotEmpty)
                  Text(content, style: const TextStyle(fontSize: 14, height: 1.5))
                else
                  Text('Текстовый ответ не предоставлен', style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.4), fontStyle: FontStyle.italic)),
                if (attachments.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  const Divider(),
                  const SizedBox(height: 8),
                  Text('Вложения (${attachments.length}):', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  const SizedBox(height: 8),
                  ...attachments.map((a) {
                    final url = a is String ? a : (a as Map)['url'] ?? '';
                    final name = a is String ? 'Файл' : (a as Map)['name'] ?? 'Файл';
                    return GestureDetector(
                      onTap: url.toString().isNotEmpty ? () async {
                        final uri = Uri.parse(url.toString());
                        if (await canLaunchUrl(uri)) {
                          await launchUrl(uri, mode: LaunchMode.externalApplication);
                        }
                      } : null,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.attach_file, size: 18, color: Colors.grey),
                            const SizedBox(width: 8),
                            Expanded(child: Text(name.toString(), style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis)),
                            if (url.toString().isNotEmpty)
                              Icon(Icons.open_in_new, size: 16, color: theme.colorScheme.primary),
                          ],
                        ),
                      ),
                    );
                  }),
                ],
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Grade Section
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: theme.colorScheme.primary.withValues(alpha: 0.15)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(color: const Color(0xFF10B981).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                      child: const Icon(Icons.star_outline, color: Color(0xFF10B981), size: 18),
                    ),
                    const SizedBox(width: 10),
                    const Text('Оценка', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  ],
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _gradeC,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Оценка',
                    prefixIcon: const Icon(Icons.star_rounded),
                    hintText: 'от 1 до 100',
                    filled: true,
                    fillColor: theme.colorScheme.primary.withValues(alpha: 0.03),
                  ),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _feedbackC,
                  maxLines: 3,
                  decoration: InputDecoration(
                    labelText: 'Комментарий для студента',
                    alignLabelWithHint: true,
                    prefixIcon: const Padding(padding: EdgeInsets.only(bottom: 48), child: Icon(Icons.comment_outlined)),
                    filled: true,
                    fillColor: theme.colorScheme.primary.withValues(alpha: 0.03),
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: FilledButton.icon(
                    icon: _loading
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.check),
                    label: Text(isGraded ? 'Обновить оценку' : 'Выставить оценку'),
                    onPressed: _loading ? null : _submitGrade,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}
