import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/providers.dart';

class CourseFormScreen extends ConsumerStatefulWidget {
  const CourseFormScreen({super.key});

  @override
  ConsumerState<CourseFormScreen> createState() => _CourseFormScreenState();
}

class _CourseFormScreenState extends ConsumerState<CourseFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleC = TextEditingController();
  final _subjectC = TextEditingController();
  final _descC = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _titleC.dispose();
    _subjectC.dispose();
    _descC.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    try {
      final api = ref.read(apiServiceProvider);
      await api.createCourse({
        'title': _titleC.text.trim(),
        'subject': _subjectC.text.trim(),
        'description': _descC.text.trim(),
        'status': 'published',
      });
      
      ref.invalidate(coursesProvider);
      
      if (mounted) {
        context.pop();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Курс успешно создан!')));
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Создать курс'),
        actions: [
          IconButton(
            icon: _loading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check),
            onPressed: _loading ? null : _save,
            tooltip: 'Сохранить',
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextFormField(
                controller: _titleC,
                decoration: const InputDecoration(
                  labelText: 'Название курса',
                  helperText: 'Например: Подготовка к IELTS 8.0',
                ),
                validator: (v) => v == null || v.trim().isEmpty ? 'Обязательное поле' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _subjectC,
                decoration: const InputDecoration(
                  labelText: 'Предмет',
                  helperText: 'Например: Английский язык',
                ),
                validator: (v) => v == null || v.trim().isEmpty ? 'Обязательное поле' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _descC,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Описание',
                  alignLabelWithHint: true,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
