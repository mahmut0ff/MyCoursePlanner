import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/auth_provider.dart';

class JoinQuizScreen extends ConsumerStatefulWidget {
  const JoinQuizScreen({super.key});

  @override
  ConsumerState<JoinQuizScreen> createState() => _JoinQuizScreenState();
}

class _JoinQuizScreenState extends ConsumerState<JoinQuizScreen> {
  final TextEditingController _codeController = TextEditingController();
  bool _loading = false;

  void _handleJoin() async {
    final code = _codeController.text.trim().toUpperCase();
    if (code.length < 4) return;

    setState(() => _loading = true);
    final api = ref.read(apiServiceProvider);

    try {
      final sessionData = await api.getQuizSessionByCode(code);
      final sessionId = sessionData['id'];

      await api.joinQuizSession(sessionId);
      
      if (mounted) {
        context.pushReplacement('/quiz/play/$sessionId');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка входа: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final code = _codeController.text;
    final isValid = code.length >= 4;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: BackButton(color: Colors.white),
      ),
      body: Container(
        decoration: BoxDecoration(
          image: DecorationImage(
            // Since we don't have a background image asset yet, using a solid dark kahoot-like gradient
            image: NetworkImage(
                'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=2000&auto=format&fit=crop'),
            fit: BoxFit.cover,
            colorFilter: ColorFilter.mode(
              Colors.black.withValues(alpha: 0.5),
              BlendMode.darken,
            ),
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo
                  Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.2),
                          blurRadius: 20,
                        )
                      ],
                    ),
                    child: Center(
                      child: Icon(Icons.gamepad, size: 48, color: Colors.white),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Planula Quiz',
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 40),

                  // PIN Card
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.2),
                          blurRadius: 30,
                          offset: const Offset(0, 10),
                        )
                      ],
                    ),
                    child: Column(
                      children: [
                        const Text(
                          'Готовы играть?',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: Colors.black87,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Попросите PIN-код у преподавателя',
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.black54,
                          ),
                        ),
                        const SizedBox(height: 24),
                        TextField(
                          controller: _codeController,
                          onChanged: (val) {
                            // Strip non-alphanumeric and limit to 6
                            final cleaned = val
                                .toUpperCase()
                                .replaceAll(RegExp(r'[^A-Z0-9]'), '');
                            if (cleaned != val) {
                              _codeController.text = cleaned;
                              _codeController.selection =
                                  TextSelection.fromPosition(TextPosition(
                                      offset: _codeController.text.length));
                            }
                            setState(() {});
                          },
                          onSubmitted: (_) {
                            if (isValid) _handleJoin();
                          },
                          maxLength: 6,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 10,
                          ),
                          decoration: InputDecoration(
                            counterText: '',
                            hintText: 'PIN-код',
                            hintStyle: TextStyle(
                              letterSpacing: 2,
                              color: Colors.black26,
                            ),
                            filled: true,
                            fillColor: Colors.grey.shade100,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide:
                                  BorderSide(color: Colors.grey.shade300, width: 2),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide:
                                  BorderSide(color: Colors.grey.shade300, width: 2),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(
                                  color: Color(0xFF8B5CF6), width: 2),
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          height: 56,
                          child: ElevatedButton(
                            onPressed:
                                (_loading || !isValid) ? null : _handleJoin,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: isValid
                                  ? const Color(0xFF26890C) // Kahoot green
                                  : Colors.grey.shade400,
                              foregroundColor: Colors.white,
                              disabledBackgroundColor: Colors.grey.shade400,
                              disabledForegroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              elevation: isValid ? 8 : 0,
                            ),
                            child: _loading
                                ? const SizedBox(
                                    width: 24,
                                    height: 24,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor: AlwaysStoppedAnimation<Color>(
                                          Colors.white),
                                    ),
                                  )
                                : const Text(
                                    'Вход',
                                    style: TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
