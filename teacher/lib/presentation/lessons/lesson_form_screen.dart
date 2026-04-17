import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../domain/providers/providers.dart';

class LessonFormScreen extends ConsumerStatefulWidget {
  final String? lessonId;
  final String? groupId;
  
  const LessonFormScreen({super.key, this.lessonId, this.groupId});

  @override
  ConsumerState<LessonFormScreen> createState() => _LessonFormScreenState();
}

class _LessonFormScreenState extends ConsumerState<LessonFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleC = TextEditingController();
  final _subjectC = TextEditingController();
  final _descC = TextEditingController();
  bool _isPublished = false;
  bool _loading = false;
  bool _initialLoaded = false;

  @override
  void initState() {
    super.initState();
    if (widget.lessonId != null) {
      _loadLesson();
    } else {
      _initialLoaded = true;
    }
  }

  Future<void> _loadLesson() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(apiServiceProvider);
      final lesson = await api.getLessonById(widget.lessonId!);
      
      _titleC.text = lesson['title'] ?? '';
      _subjectC.text = lesson['subject'] ?? '';
      _descC.text = lesson['description'] ?? '';
      _isPublished = lesson['status'] == 'published';
      
      if (mounted) setState(() { _initialLoaded = true; _loading = false; });
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка загрузки: $e')));
      }
    }
  }

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
      final Map<String, dynamic> data = {
        'title': _titleC.text.trim(),
        'subject': _subjectC.text.trim(),
        'description': _descC.text.trim(),
        'status': _isPublished ? 'published' : 'draft',
      };
      
      if (widget.lessonId == null) {
        if (widget.groupId != null) {
          data['groupIds'] = [widget.groupId!];
        }
        await api.createLesson(data);
      } else {
        await api.updateLesson(widget.lessonId!, data);
      }
      
      ref.invalidate(lessonsProvider);
      if (widget.lessonId != null) {
        ref.invalidate(lessonProvider(widget.lessonId!));
      }
      
      if (mounted) {
        context.pop();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Урок сохранен')));
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
    if (!_initialLoaded) {
      return Scaffold(
        appBar: AppBar(title: const Text('Загрузка...')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.lessonId == null ? 'Новый урок' : 'Редактировать урок'),
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
                  labelText: 'Тема урока',
                  prefixIcon: Icon(Icons.title),
                ),
                validator: (v) => v == null || v.trim().isEmpty ? 'Введите тему' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _subjectC,
                decoration: const InputDecoration(
                  labelText: 'Предмет дисциплины',
                  prefixIcon: Icon(Icons.category_outlined),
                ),
                validator: (v) => v == null || v.trim().isEmpty ? 'Введите предмет' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _descC,
                maxLines: 5,
                decoration: const InputDecoration(
                  labelText: 'Описание урока',
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 24),
              SwitchListTile(
                title: const Text('Опубликован', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Ученики увидят опубликованные уроки'),
                value: _isPublished,
                onChanged: (val) => setState(() => _isPublished = val),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                tileColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
