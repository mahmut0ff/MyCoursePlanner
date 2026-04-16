import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/auth_provider.dart';
import '../../domain/providers/exam_providers.dart';
import '../common/shimmer_list.dart';

class ExamsHomeScreen extends ConsumerStatefulWidget {
  const ExamsHomeScreen({super.key});

  @override
  ConsumerState<ExamsHomeScreen> createState() => _ExamsHomeScreenState();
}

class _ExamsHomeScreenState extends ConsumerState<ExamsHomeScreen> {
  final _codeController = TextEditingController();
  bool _joining = false;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _joinRoom() async {
    final code = _codeController.text.trim().toUpperCase();
    if (code.length < 4) return;

    setState(() => _joining = true);
    try {
      final api = ref.read(apiServiceProvider);

      // Step 1: Find room by code
      final room = await api.getRoomByCode(code);
      final roomId = room['id'] as String? ?? '';
      final examId = room['examId'] as String? ?? '';
      final examTitle = room['examTitle'] as String? ?? '';
      final status = room['status'] as String? ?? '';

      if (roomId.isEmpty || examId.isEmpty) {
        throw Exception('Комната не найдена');
      }
      if (status == 'closed') {
        throw Exception('Комната закрыта');
      }

      // Step 2: Join room
      await api.joinRoom(roomId);

      // Step 3: Navigate to exam taking screen
      if (mounted) {
        context.push('/exams/take', extra: {
          'roomId': roomId,
          'examId': examId,
          'examTitle': examTitle,
          'roomCode': code,
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final attemptsAsync = ref.watch(myAttemptsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Экзамены'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.push('/notifications'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myAttemptsProvider),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ── Live Quiz Banner ──
            GestureDetector(
              onTap: () => context.push('/quiz/join'),
              child: Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF8B5CF6), Color(0xFFC026D3)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFC026D3).withOpacity(0.3),
                      blurRadius: 16,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Icon(Icons.gamepad, color: Colors.white, size: 32),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Planula Quiz',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Интерактивная игра',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.8),
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.arrow_forward_ios, color: Colors.white, size: 20),
                  ],
                ),
              ),
            ),
            
            // ── Join Exam Room ──
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF6366F1).withValues(alpha: 0.3),
                    blurRadius: 20,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                children: [
                  const Icon(
                    Icons.qr_code_scanner_rounded,
                    color: Colors.white,
                    size: 48,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Присоединиться к экзамену',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Введите код комнаты',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.7),
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    height: 54,
                    child: TextField(
                      controller: _codeController,
                      textAlign: TextAlign.center,
                      textCapitalization: TextCapitalization.characters,
                      maxLength: 6,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 12,
                      ),
                      decoration: InputDecoration(
                        counterText: '',
                        hintText: '• • • • • •',
                        hintStyle: TextStyle(
                          color: Colors.white.withValues(alpha: 0.4),
                          fontSize: 28,
                          letterSpacing: 8,
                        ),
                        filled: true,
                        fillColor: Colors.white.withValues(alpha: 0.15),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 12,
                        ),
                      ),
                      onSubmitted: (_) => _joinRoom(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _joining ? null : _joinRoom,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: const Color(0xFF6366F1),
                      ),
                      child: _joining
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Войти',
                              style:
                                  TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),

            // ── My Results ──
            Text(
              'Мои результаты',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),

            attemptsAsync.when(
              loading: () =>
                  const ShimmerList(itemCount: 3, itemHeight: 76),
              error: (_, __) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Center(
                  child: Column(
                    children: [
                      const Text('Не удалось загрузить'),
                      TextButton(
                        onPressed: () =>
                            ref.invalidate(myAttemptsProvider),
                        child: const Text('Повторить'),
                      ),
                    ],
                  ),
                ),
              ),
              data: (attempts) {
                if (attempts.isEmpty) {
                  return Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: isDark
                          ? const Color(0xFF1E293B)
                          : Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: theme.colorScheme.outline
                            .withValues(alpha: 0.1),
                      ),
                    ),
                    child: Column(
                      children: [
                        Icon(Icons.quiz_outlined,
                            size: 44,
                            color: theme.colorScheme.primary
                                .withValues(alpha: 0.4)),
                        const SizedBox(height: 12),
                        Text('Пока нет результатов',
                            style: theme.textTheme.titleSmall
                                ?.copyWith(
                              fontWeight: FontWeight.w600,
                            )),
                        const SizedBox(height: 4),
                        Text(
                          'Введите код комнаты выше',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.5),
                          ),
                        ),
                      ],
                    ),
                  );
                }

                return Column(
                  children: attempts
                      .map((a) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _ExamResultTile(
                              attempt: a,
                              onTap: () =>
                                  context.push('/exams/attempt/${a.id}'),
                            ),
                          ))
                      .toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _ExamResultTile extends StatelessWidget {
  final dynamic attempt;
  final VoidCallback? onTap;

  const _ExamResultTile({required this.attempt, this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final scorePercent = (attempt.percentage as num).round();
    final passed = attempt.passed;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: theme.colorScheme.outline.withValues(alpha: 0.1),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: passed
                    ? const Color(0xFF10B981).withValues(alpha: 0.1)
                    : const Color(0xFFEF4444).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Center(
                child: Text(
                  '$scorePercent%',
                  style: TextStyle(
                    color: passed
                        ? const Color(0xFF10B981)
                        : const Color(0xFFEF4444),
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    attempt.examTitle,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    attempt.durationText,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface
                          .withValues(alpha: 0.4),
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              color:
                  theme.colorScheme.onSurface.withValues(alpha: 0.3),
            ),
          ],
        ),
      ),
    );
  }
}
