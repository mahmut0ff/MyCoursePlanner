import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/auth_provider.dart';

/// Full-screen exam taking experience.
/// Flow: load exam → show questions → submit → show result.
class ExamTakingScreen extends ConsumerStatefulWidget {
  final String roomId;
  final String examId;
  final String examTitle;
  final String roomCode;

  const ExamTakingScreen({
    super.key,
    required this.roomId,
    required this.examId,
    required this.examTitle,
    this.roomCode = '',
  });

  @override
  ConsumerState<ExamTakingScreen> createState() => _ExamTakingScreenState();
}

class _ExamTakingScreenState extends ConsumerState<ExamTakingScreen> {
  List<Map<String, dynamic>> _questions = [];
  final Map<String, dynamic> _answers = {};
  int _currentIndex = 0;
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  DateTime? _startedAt;
  Timer? _timer;
  int _remainingSeconds = 0;

  // Result
  Map<String, dynamic>? _result;

  @override
  void initState() {
    super.initState();
    _loadExam();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadExam() async {
    try {
      final api = ref.read(apiServiceProvider);
      final examData = await api.getExam(widget.examId);
      final questions =
          (examData['questions'] as List?)?.cast<Map<String, dynamic>>() ??
              [];
      final duration = examData['durationMinutes'] ?? 60;

      // Randomize if needed
      if (examData['randomizeQuestions'] == true) {
        questions.shuffle();
      }

      setState(() {
        _questions = questions;
        _remainingSeconds = duration * 60;
        _startedAt = DateTime.now();
        _loading = false;
      });

      // Start timer
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (_remainingSeconds <= 0) {
          _timer?.cancel();
          _submitExam();
          return;
        }
        setState(() => _remainingSeconds--);
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _submitExam() async {
    if (_submitting) return;
    setState(() => _submitting = true);

    try {
      final api = ref.read(apiServiceProvider);
      final timeSpent = _startedAt != null
          ? DateTime.now().difference(_startedAt!).inSeconds
          : 0;

      final result = await api.submitExam({
        'examId': widget.examId,
        'examTitle': widget.examTitle,
        'roomId': widget.roomId,
        'roomCode': widget.roomCode,
        'answers': _answers,
        'startedAt': _startedAt?.toIso8601String(),
        'timeSpentSeconds': timeSpent,
      });

      // Award XP for exam completion (streaks, badges, etc.)
      try {
        await api.awardXP({
          'type': 'exam',
          'examPassed': result['passed'] == true,
          'percentage': result['percentage'] ?? 0,
        });
        ref.invalidate(gamificationProvider);
      } catch (_) {
        // Non-critical — don't block result display
      }

      _timer?.cancel();
      setState(() {
        _result = result;
        _submitting = false;
      });
    } catch (e) {
      setState(() => _submitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка отправки: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // ── Result Screen ──
    if (_result != null) {
      return _ResultView(result: _result!, onDone: () => context.pop());
    }

    // ── Loading ──
    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(widget.examTitle)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    // ── Error ──
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: Text(widget.examTitle)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 16),
                Text('Ошибка загрузки экзамена',
                    style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(_error!, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => context.pop(),
                  child: const Text('Назад'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (_questions.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(widget.examTitle)),
        body: const Center(child: Text('В этом экзамене нет вопросов')),
      );
    }

    final question = _questions[_currentIndex];
    final minutes = _remainingSeconds ~/ 60;
    final seconds = _remainingSeconds % 60;
    final isLast = _currentIndex == _questions.length - 1;
    final timerColor =
        _remainingSeconds < 60 ? Colors.red : theme.colorScheme.onSurface;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Выйти из экзамена?'),
            content: const Text(
                'Ваши ответы не будут сохранены. Вы уверены?'),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Отмена')),
              TextButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('Выйти',
                      style: TextStyle(color: Colors.red))),
            ],
          ),
        );
        if (confirmed == true && context.mounted) context.pop();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            '${_currentIndex + 1} / ${_questions.length}',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          centerTitle: true,
          actions: [
            // Timer
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: timerColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.timer_outlined,
                          size: 16, color: timerColor),
                      const SizedBox(width: 4),
                      Text(
                        '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}',
                        style: TextStyle(
                          color: timerColor,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
        body: Column(
          children: [
            // Progress bar
            LinearProgressIndicator(
              value: (_currentIndex + 1) / _questions.length,
              minHeight: 3,
              backgroundColor:
                  theme.colorScheme.primary.withValues(alpha: 0.1),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child:
                    _QuestionView(question: question, answers: _answers,
                        onAnswer: (value) {
                  setState(() {
                    _answers[question['id']] = value;
                  });
                }),
              ),
            ),
            // Navigation buttons
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    if (_currentIndex > 0)
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () =>
                              setState(() => _currentIndex--),
                          child: const Text('← Назад'),
                        ),
                      ),
                    if (_currentIndex > 0) const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        onPressed: _submitting
                            ? null
                            : isLast
                                ? _confirmSubmit
                                : () =>
                                    setState(() => _currentIndex++),
                        child: _submitting
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2),
                              )
                            : Text(
                                isLast ? 'Завершить' : 'Далее →',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmSubmit() {
    final answered = _answers.length;
    final total = _questions.length;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Завершить экзамен?'),
        content: Text(
            'Вы ответили на $answered из $total вопросов.\nОтправить результат?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Проверить')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              _submitExam();
            },
            child: const Text('Отправить'),
          ),
        ],
      ),
    );
  }
}

// ── Question View ──

class _QuestionView extends StatelessWidget {
  final Map<String, dynamic> question;
  final Map<String, dynamic> answers;
  final ValueChanged<dynamic> onAnswer;

  const _QuestionView({
    required this.question,
    required this.answers,
    required this.onAnswer,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final qId = question['id'] ?? '';
    final text = question['text'] ?? question['question'] ?? '';
    final type = question['type'] ?? 'multiple_choice';
    final options = (question['options'] as List?)?.cast<String>() ?? [];
    final currentAnswer = answers[qId];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Question text
        Text(
          text,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
            height: 1.4,
          ),
        ),
        const SizedBox(height: 24),

        // Answer options
        if (type == 'multiple_choice' || type == 'true_false')
          ...options.asMap().entries.map((entry) {
            final idx = entry.key;
            final option = entry.value;
            final isSelected = currentAnswer == idx;
            return _AnswerTile(
              text: option,
              isSelected: isSelected,
              onTap: () => onAnswer(idx),
            );
          })
        else if (type == 'multi_select')
          ...options.asMap().entries.map((entry) {
            final idx = entry.key;
            final option = entry.value;
            final selected =
                (currentAnswer is List) ? currentAnswer : [];
            final isSelected = selected.contains(idx);
            return _AnswerTile(
              text: option,
              isSelected: isSelected,
              isCheckbox: true,
              onTap: () {
                final newSelection =
                    List<int>.from(selected.cast<int>());
                if (isSelected) {
                  newSelection.remove(idx);
                } else {
                  newSelection.add(idx);
                }
                onAnswer(newSelection);
              },
            );
          })
        else if (type == 'short_answer' || type == 'open_ended') ...[
          TextField(
            maxLines: type == 'open_ended' ? 5 : 1,
            onChanged: onAnswer,
            controller: TextEditingController(
                text: currentAnswer?.toString() ?? ''),
            decoration: InputDecoration(
              hintText: type == 'open_ended'
                  ? 'Напишите развёрнутый ответ...'
                  : 'Ваш ответ...',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ),
          if (type == 'open_ended') ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF59E0B).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: const Color(0xFFF59E0B).withValues(alpha: 0.2),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline,
                      size: 18,
                      color: const Color(0xFFF59E0B).withValues(alpha: 0.8)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Этот ответ будет проверен преподавателем вручную',
                      style: TextStyle(
                        fontSize: 12,
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.6),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ],
    );
  }
}

class _AnswerTile extends StatelessWidget {
  final String text;
  final bool isSelected;
  final bool isCheckbox;
  final VoidCallback onTap;

  const _AnswerTile({
    required this.text,
    required this.isSelected,
    this.isCheckbox = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isSelected
                ? theme.colorScheme.primary.withValues(alpha: 0.08)
                : isDark
                    ? const Color(0xFF1E293B)
                    : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isSelected
                  ? theme.colorScheme.primary
                  : theme.colorScheme.outline.withValues(alpha: 0.15),
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  shape:
                      isCheckbox ? BoxShape.rectangle : BoxShape.circle,
                  borderRadius:
                      isCheckbox ? BorderRadius.circular(6) : null,
                  color: isSelected
                      ? theme.colorScheme.primary
                      : Colors.transparent,
                  border: Border.all(
                    color: isSelected
                        ? theme.colorScheme.primary
                        : theme.colorScheme.outline
                            .withValues(alpha: 0.3),
                    width: 2,
                  ),
                ),
                child: isSelected
                    ? const Icon(Icons.check, size: 16, color: Colors.white)
                    : null,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  text,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight:
                        isSelected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Result View (after submission) ──

class _ResultView extends StatelessWidget {
  final Map<String, dynamic> result;
  final VoidCallback onDone;

  const _ResultView({required this.result, required this.onDone});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final percentage = result['percentage'] ?? 0;
    final passed = result['passed'] ?? false;
    final score = result['score'] ?? 0;
    final totalPoints = result['totalPoints'] ?? 0;
    final title = result['examTitle'] ?? '';
    final color = passed ? const Color(0xFF10B981) : const Color(0xFFEF4444);
    final questionResults = (result['questionResults'] as List?) ?? [];
    final hasPendingReview = questionResults.any(
        (q) => (q is Map) && q['status'] == 'pending_review');

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Score circle
              Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: passed
                        ? [
                            const Color(0xFF10B981),
                            const Color(0xFF059669),
                          ]
                        : [
                            const Color(0xFFEF4444),
                            const Color(0xFFDC2626),
                          ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: color.withValues(alpha: 0.35),
                      blurRadius: 30,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Center(
                  child: Text(
                    '$percentage%',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 42,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 28),
              Text(
                passed ? 'Экзамен сдан! 🎉' : 'Не сдан 😔',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                title,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface
                      .withValues(alpha: 0.6),
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              Text(
                '$score / $totalPoints баллов',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              // Pending review notice
              if (hasPendingReview) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: const Color(0xFFF59E0B).withValues(alpha: 0.2),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.hourglass_top_rounded,
                          size: 20, color: Color(0xFFF59E0B)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Некоторые ответы ожидают проверки преподавателем. Итоговый балл может измениться.',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.7),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 40),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: onDone,
                  child: const Text('Готово',
                      style: TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 16)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
