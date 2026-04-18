import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/providers.dart';

class ExamFormScreen extends ConsumerStatefulWidget {
  final String? examId; // null = create, non-null = edit
  const ExamFormScreen({super.key, this.examId});

  bool get isEditing => examId != null;

  @override
  ConsumerState<ExamFormScreen> createState() => _ExamFormScreenState();
}

class _ExamFormScreenState extends ConsumerState<ExamFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleC = TextEditingController();
  final _subjectC = TextEditingController();
  final _descC = TextEditingController();
  final _durationC = TextEditingController(text: '30');
  final _passingScoreC = TextEditingController(text: '50');

  bool _loading = false;
  bool _loaded = false;
  String _status = 'draft';

  // Questions
  final List<_QuestionData> _questions = [];

  @override
  void dispose() {
    _titleC.dispose();
    _subjectC.dispose();
    _descC.dispose();
    _durationC.dispose();
    _passingScoreC.dispose();
    super.dispose();
  }

  void _loadExam(Map<String, dynamic> exam) {
    if (_loaded) return;
    _loaded = true;
    _titleC.text = exam['title'] ?? '';
    _subjectC.text = exam['subject'] ?? '';
    _descC.text = exam['description'] ?? '';
    _durationC.text = '${exam['duration'] ?? 30}';
    _passingScoreC.text = '${exam['passingScore'] ?? 50}';
    _status = exam['status'] ?? 'draft';

    final questions = exam['questions'] as List? ?? [];
    for (final q in questions) {
      final qMap = q as Map<String, dynamic>;
      final options = (qMap['options'] as List?)?.map((o) => o.toString()).toList() ?? ['', '', '', ''];
      _questions.add(_QuestionData(
        text: qMap['text'] ?? '',
        options: options,
        correctIndex: qMap['correctIndex'] ?? 0,
      ));
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_questions.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Добавьте хотя бы один вопрос')));
      return;
    }

    setState(() => _loading = true);
    try {
      final api = ref.read(apiServiceProvider);
      final data = {
        'title': _titleC.text.trim(),
        'subject': _subjectC.text.trim(),
        'description': _descC.text.trim(),
        'duration': int.tryParse(_durationC.text) ?? 30,
        'passingScore': int.tryParse(_passingScoreC.text) ?? 50,
        'status': _status,
        'questions': _questions.map((q) => {
          'text': q.text,
          'options': q.options,
          'correctIndex': q.correctIndex,
        }).toList(),
        'questionsCount': _questions.length,
      };

      if (widget.isEditing) {
        await api.updateExam(widget.examId!, data);
      } else {
        await api.createExam(data);
      }

      ref.invalidate(examsProvider);
      if (widget.isEditing) ref.invalidate(examProvider(widget.examId!));

      if (mounted) {
        context.pop();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(widget.isEditing ? 'Экзамен обновлён!' : 'Экзамен создан!')));
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
      }
    }
  }

  void _addQuestion() {
    setState(() {
      _questions.add(_QuestionData(text: '', options: ['', '', '', ''], correctIndex: 0));
    });
  }

  void _removeQuestion(int index) {
    setState(() => _questions.removeAt(index));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Load existing exam data if editing
    if (widget.isEditing && !_loaded) {
      final examAsync = ref.watch(examProvider(widget.examId!));
      return Scaffold(
        appBar: AppBar(title: const Text('Редактировать экзамен')),
        body: examAsync.when(
          data: (exam) {
            _loadExam(exam);
            return _buildForm(theme);
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(child: Text('Ошибка: $err')),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isEditing ? 'Редактировать экзамен' : 'Создать экзамен'),
        actions: [
          IconButton(
            icon: _loading
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.check),
            onPressed: _loading ? null : _save,
            tooltip: 'Сохранить',
          ),
        ],
      ),
      body: _buildForm(theme),
    );
  }

  Widget _buildForm(ThemeData theme) {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Basic Info Section
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
                const Text('Основная информация', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _titleC,
                  decoration: const InputDecoration(labelText: 'Название экзамена', prefixIcon: Icon(Icons.title)),
                  validator: (v) => v == null || v.trim().isEmpty ? 'Обязательное поле' : null,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _subjectC,
                  decoration: const InputDecoration(labelText: 'Предмет', prefixIcon: Icon(Icons.subject)),
                  validator: (v) => v == null || v.trim().isEmpty ? 'Обязательное поле' : null,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _descC,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'Описание', alignLabelWithHint: true),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Settings
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
                const Text('Настройки', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _durationC,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Длительность (мин)', prefixIcon: Icon(Icons.timer_outlined)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: _passingScoreC,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Проходной балл (%)', prefixIcon: Icon(Icons.check_circle_outline)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  value: _status,
                  decoration: const InputDecoration(labelText: 'Статус', prefixIcon: Icon(Icons.visibility_outlined)),
                  items: const [
                    DropdownMenuItem(value: 'draft', child: Text('Черновик')),
                    DropdownMenuItem(value: 'published', child: Text('Опубликован')),
                  ],
                  onChanged: (val) => setState(() => _status = val ?? 'draft'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Questions Section
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Вопросы (${_questions.length})', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              FilledButton.icon(
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Добавить'),
                onPressed: _addQuestion,
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8)),
              ),
            ],
          ),
          const SizedBox(height: 12),

          if (_questions.isEmpty)
            Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
              ),
              child: Column(
                children: [
                  Icon(Icons.quiz_outlined, size: 48, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                  const SizedBox(height: 12),
                  const Text('Нет вопросов', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 8),
                  const Text('Нажмите «Добавить» чтобы создать вопрос', style: TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
            )
          else
            ...List.generate(_questions.length, (i) => _buildQuestionCard(i, theme)),

          const SizedBox(height: 24),

          // Save Button
          SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton(
              onPressed: _loading ? null : _save,
              child: _loading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(widget.isEditing ? 'Сохранить изменения' : 'Создать экзамен'),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildQuestionCard(int index, ThemeData theme) {
    final q = _questions[index];
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
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
                width: 32, height: 32,
                decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                child: Center(child: Text('${index + 1}', style: TextStyle(fontWeight: FontWeight.bold, color: theme.colorScheme.primary))),
              ),
              const SizedBox(width: 10),
              const Expanded(child: Text('Вопрос', style: TextStyle(fontWeight: FontWeight.w600))),
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 20, color: Colors.red),
                onPressed: () => _removeQuestion(index),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            initialValue: q.text,
            decoration: const InputDecoration(labelText: 'Текст вопроса', isDense: true),
            onChanged: (v) => q.text = v,
            validator: (v) => v == null || v.trim().isEmpty ? 'Введите вопрос' : null,
          ),
          const SizedBox(height: 12),
          ...List.generate(q.options.length, (oi) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Radio<int>(
                  value: oi,
                  groupValue: q.correctIndex,
                  onChanged: (v) => setState(() => q.correctIndex = v ?? 0),
                  visualDensity: VisualDensity.compact,
                ),
                Expanded(
                  child: TextFormField(
                    initialValue: q.options[oi],
                    decoration: InputDecoration(
                      labelText: 'Вариант ${oi + 1}',
                      isDense: true,
                      suffixIcon: q.correctIndex == oi ? const Icon(Icons.check_circle, color: Colors.green, size: 18) : null,
                    ),
                    onChanged: (v) => q.options[oi] = v,
                    validator: (v) => v == null || v.trim().isEmpty ? 'Заполните вариант' : null,
                  ),
                ),
              ],
            ),
          )),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Ещё вариант', style: TextStyle(fontSize: 12)),
              onPressed: () => setState(() => q.options.add('')),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuestionData {
  String text;
  List<String> options;
  int correctIndex;

  _QuestionData({required this.text, required this.options, required this.correctIndex});
}
