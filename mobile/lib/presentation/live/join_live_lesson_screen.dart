import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../data/services/live_session_service.dart';
import 'live_lesson_screen.dart';

/// Student screen to enter a 6-character join code and connect to a live lesson.
class JoinLiveLessonScreen extends StatefulWidget {
  const JoinLiveLessonScreen({super.key});

  @override
  State<JoinLiveLessonScreen> createState() => _JoinLiveLessonScreenState();
}

class _JoinLiveLessonScreenState extends State<JoinLiveLessonScreen> {
  final _controller = TextEditingController();
  final _service = LiveSessionService();
  bool _loading = false;
  String? _error;

  Future<void> _handleJoin() async {
    final code = _controller.text.trim().toUpperCase();
    if (code.length != 6) {
      setState(() => _error = 'Код должен содержать 6 символов');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final session = await _service.findByCode(code);
      if (session == null) {
        setState(() {
          _error = 'Сессия не найдена. Проверьте код.';
          _loading = false;
        });
        return;
      }

      // Join the session
      await _service.join(session['id']);

      if (!mounted) return;

      // Navigate to live viewer (use push, not pushReplacement, so GoRouter back works)
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => LiveLessonScreen(
            sessionId: session['id'],
            lessonTitle: session['lessonTitle'] ?? 'Live Урок',
          ),
        ),
      );
    } catch (e) {
      setState(() {
        _error = 'Ошибка: $e';
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0F23),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Icon
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.deepPurple.shade400,
                    Colors.indigo.shade600,
                  ],
                ),
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: Colors.deepPurple.withValues(alpha: 0.4),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: const Icon(Icons.cast_connected,
                  size: 40, color: Colors.white),
            ),
            const SizedBox(height: 24),

            // Title
            const Text(
              'Войти в Live урок',
              style: TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Введите 6-значный код от преподавателя',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.5),
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 32),

            // Code input
            TextField(
              controller: _controller,
              textAlign: TextAlign.center,
              maxLength: 6,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 36,
                fontWeight: FontWeight.w900,
                fontFamily: 'monospace',
                letterSpacing: 12,
              ),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[a-zA-Z0-9]')),
                TextInputFormatter.withFunction(
                    (old, newValue) => newValue.copyWith(text: newValue.text.toUpperCase())),
              ],
              decoration: InputDecoration(
                counterText: '',
                hintText: '______',
                hintStyle: TextStyle(
                  color: Colors.white.withValues(alpha: 0.15),
                  fontSize: 36,
                  letterSpacing: 12,
                ),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.06),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide(
                      color: Colors.white.withValues(alpha: 0.15), width: 2),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide(
                      color: Colors.white.withValues(alpha: 0.15), width: 2),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide:
                      BorderSide(color: Colors.deepPurple.shade300, width: 2),
                ),
              ),
              onChanged: (_) => setState(() => _error = null),
              onSubmitted: (_) => _handleJoin(),
            ),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(
                      color: Colors.red, fontWeight: FontWeight.w600),
                  textAlign: TextAlign.center,
                ),
              ),
            ],

            const SizedBox(height: 24),

            // Join button
            SizedBox(
              width: double.infinity,
              height: 56,
              child: FilledButton(
                onPressed: _loading ? null : _handleJoin,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.deepPurple,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18)),
                ),
                child: _loading
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 3))
                    : const Text('Присоединиться',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
