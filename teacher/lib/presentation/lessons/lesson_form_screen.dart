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
  final _videoUrlC = TextEditingController();
  final _coverImageUrlC = TextEditingController();
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
      _videoUrlC.text = lesson['videoUrl'] ?? '';
      _coverImageUrlC.text = lesson['coverImageUrl'] ?? '';
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
    _videoUrlC.dispose();
    _coverImageUrlC.dispose();
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

      // Only send non-empty optional fields
      if (_videoUrlC.text.trim().isNotEmpty) {
        data['videoUrl'] = _videoUrlC.text.trim();
      }
      if (_coverImageUrlC.text.trim().isNotEmpty) {
        data['coverImageUrl'] = _coverImageUrlC.text.trim();
      }
      
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
    final theme = Theme.of(context);

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
              // ── Core Info ──
              _SectionLabel(icon: Icons.info_outline, label: 'Основная информация', theme: theme),
              const SizedBox(height: 12),
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
                  labelText: 'Предмет',
                  prefixIcon: Icon(Icons.category_outlined),
                ),
                validator: (v) => v == null || v.trim().isEmpty ? 'Введите предмет' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _descC,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Описание урока',
                  alignLabelWithHint: true,
                  prefixIcon: Padding(padding: EdgeInsets.only(bottom: 72), child: Icon(Icons.description_outlined)),
                ),
              ),
              const SizedBox(height: 28),

              // ── Media ──
              _SectionLabel(icon: Icons.perm_media_outlined, label: 'Медиа', theme: theme),
              const SizedBox(height: 12),
              TextFormField(
                controller: _coverImageUrlC,
                decoration: const InputDecoration(
                  labelText: 'URL обложки (необязательно)',
                  prefixIcon: Icon(Icons.image_outlined),
                  hintText: 'https://...',
                ),
                keyboardType: TextInputType.url,
              ),
              if (_coverImageUrlC.text.isNotEmpty) ...[
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(
                    _coverImageUrlC.text,
                    height: 120,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      height: 60,
                      decoration: BoxDecoration(
                        color: Colors.red.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Center(child: Text('Невалидная ссылка', style: TextStyle(color: Colors.red, fontSize: 12))),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              TextFormField(
                controller: _videoUrlC,
                decoration: const InputDecoration(
                  labelText: 'Ссылка на видео (необязательно)',
                  prefixIcon: Icon(Icons.videocam_outlined),
                  hintText: 'https://youtube.com/...',
                ),
                keyboardType: TextInputType.url,
              ),
              const SizedBox(height: 28),

              // ── Publish ──
              _SectionLabel(icon: Icons.publish_outlined, label: 'Публикация', theme: theme),
              const SizedBox(height: 12),
              SwitchListTile(
                title: const Text('Опубликован', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Ученики увидят опубликованные уроки'),
                value: _isPublished,
                onChanged: (val) => setState(() => _isPublished = val),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                tileColor: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
              ),
              const SizedBox(height: 16),

              // Info banner
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFF3B82F6).withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.15)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.info_outline, size: 18, color: Color(0xFF3B82F6)),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Полный контент урока (текст, таблицы, домашнее задание) можно добавить через веб-панель',
                        style: TextStyle(fontSize: 12, color: Color(0xFF3B82F6), height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              // Save button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton.icon(
                  icon: _loading
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.save_outlined),
                  label: Text(widget.lessonId == null ? 'Создать урок' : 'Сохранить изменения'),
                  onPressed: _loading ? null : _save,
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final IconData icon;
  final String label;
  final ThemeData theme;
  const _SectionLabel({required this.icon, required this.label, required this.theme});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 28, height: 28,
          decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(7)),
          child: Icon(icon, size: 14, color: theme.colorScheme.primary),
        ),
        const SizedBox(width: 8),
        Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: theme.colorScheme.onSurface.withValues(alpha: 0.7))),
      ],
    );
  }
}
