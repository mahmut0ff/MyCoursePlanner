import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/models/quiz_session.dart';
import '../../domain/providers/auth_provider.dart';
import '../../domain/providers/quiz_provider.dart';

class QuizPlayScreen extends ConsumerStatefulWidget {
  final String sessionId;
  const QuizPlayScreen({super.key, required this.sessionId});

  @override
  ConsumerState<QuizPlayScreen> createState() => _QuizPlayScreenState();
}

class _QuizPlayScreenState extends ConsumerState<QuizPlayScreen> {
  String _phase = 'lobby'; // lobby, question, answer_feedback, results
  Map<String, dynamic>? _currentQuestion;
  bool _submitted = false;
  bool _submitting = false;
  dynamic _selectedAnswer; // String or List<String>
  Map<String, dynamic>? _answerResult;
  Timer? _timer;
  int _timeLeft = 0;
  DateTime? _startTime;
  int _prevQuestionIndex = -2;

  // Audio players
  late AudioPlayer _plopPlayer;
  late AudioPlayer _tickPlayer;
  late AudioPlayer _buzzerPlayer;
  int _lastTick = -1;

  @override
  void initState() {
    super.initState();
    _plopPlayer = AudioPlayer();
    _tickPlayer = AudioPlayer();
    _buzzerPlayer = AudioPlayer();
    // Pre-load could be added if assets exist locally, else we ignore or handle gracefully
  }

  @override
  void dispose() {
    _timer?.cancel();
    _plopPlayer.dispose();
    _tickPlayer.dispose();
    _buzzerPlayer.dispose();
    super.dispose();
  }

  void _playSound(AudioPlayer player, String name) {
    // In a real scenario we need valid asset paths. 
    // We'll catch errors silently so it doesn't break if assets are missing.
    try {
      // player.play(AssetSource('sounds/$name'));
    } catch (_) {}
  }

  void _startTimer(int seconds) {
    _timer?.cancel();
    setState(() {
      _timeLeft = seconds;
      _startTime = DateTime.now();
      _lastTick = -1;
    });

    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      
      if (_timeLeft <= 1) {
        _timer?.cancel();
        if (_phase == 'question' && !_submitted) {
          _playSound(_buzzerPlayer, 'buzzer.mp3');
          _handleSubmit(timedOut: true);
        }
        if (mounted) setState(() => _timeLeft = 0);
        return;
      }

      setState(() => _timeLeft--);

      // Sound logic
      if (_timeLeft > 0 && _timeLeft <= 5 && _timeLeft != _lastTick) {
        _lastTick = _timeLeft;
        _playSound(_tickPlayer, _timeLeft <= 3 ? 'tick_dramatic.mp3' : 'tick.mp3');
      }
    });
  }

  Future<void> _handleSubmit({bool timedOut = false}) async {
    if (_submitted || _submitting || _currentQuestion == null) return;
    setState(() {
      _submitted = true;
      _submitting = true;
    });
    _timer?.cancel();

    final api = ref.read(apiServiceProvider);
    final responseTimeMs = _startTime != null 
        ? DateTime.now().difference(_startTime!).inMilliseconds 
        : 0;
        
    try {
      final answer = timedOut ? '' : (_selectedAnswer ?? '');
      final result = await api.submitQuizAnswer({
        'sessionId': widget.sessionId,
        'questionId': _currentQuestion!['id'],
        'answer': answer,
        'responseTimeMs': responseTimeMs,
      });

      if (!mounted) return;
      setState(() {
        _answerResult = result;
        _phase = 'answer_feedback';
        _submitting = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = 'answer_feedback';
        _submitting = false;
      });
    }
  }

  void _handleSelectOption(String optId) {
    if (_submitted) return;
    _playSound(_plopPlayer, 'plop.mp3');

    final type = _currentQuestion?['type'] ?? 'multiple_choice';
    if (type == 'multiple_choice' || type == 'multi_select') {
      List<String> current = _selectedAnswer is List ? List<String>.from(_selectedAnswer) : [];
      if (current.contains(optId)) {
        current.remove(optId);
      } else {
        current.add(optId);
      }
      setState(() => _selectedAnswer = current);
    } else {
      setState(() => _selectedAnswer = optId);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessionAsync = ref.watch(quizSessionStreamProvider(widget.sessionId));
    final participantsAsync = ref.watch(quizParticipantsStreamProvider(widget.sessionId));

    return sessionAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, st) => Scaffold(body: Center(child: Text('Ошибка: $e'))),
      data: (session) {
        if (session == null) {
          return const Scaffold(body: Center(child: Text('Сессия не найдена')));
        }

        // State Machine Logic
        if (session.status == 'lobby') {
          if (_phase != 'lobby') Future.microtask(() => setState(() => _phase = 'lobby'));
        } else if (session.status == 'completed' || session.status == 'cancelled') {
          if (_phase != 'results') Future.microtask(() => setState(() => _phase = 'results'));
        } else if (session.status == 'in_progress' || session.status == 'paused') {
          if (session.currentQuestionIndex != _prevQuestionIndex) {
            _prevQuestionIndex = session.currentQuestionIndex;
            Future.microtask(() {
              setState(() {
                _selectedAnswer = null;
                _submitted = false;
                _answerResult = null;
                _phase = 'question';
                _currentQuestion = null; // load new
              });
              
              ref.read(apiServiceProvider).getQuizSession(widget.sessionId).then((data) {
                if (!mounted) return;
                final q = data['currentQuestion'];
                setState(() => _currentQuestion = q);
                if (q != null) {
                  _startTimer(q['timerSeconds'] ?? 30);
                }
              });
            });
          }
        }

        final participants = participantsAsync.valueOrNull ?? [];
        final myUid = ref.watch(authStateProvider).valueOrNull?.uid;
        final myParticipant = participants.firstWhere(
            (p) => p.participantId == myUid,
            orElse: () => SessionParticipant(id: '', participantId: ''));

        // View Rendering
        if (_phase == 'lobby') return _buildLobby(session, participants);
        if (_phase == 'question') return _buildQuestion(session);
        if (_phase == 'answer_feedback') return _buildFeedback(session);
        if (_phase == 'results') return _buildResults(session, participants, myParticipant);
        
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      },
    );
  }

  Widget _buildLobby(QuizSession session, List<SessionParticipant> parts) {
    return Scaffold(
      backgroundColor: const Color(0xFF1E293B), // Dark Kahoot-like bg
      body: SafeArea(
        child: Column(
          children: [
            const Spacer(),
            Icon(Icons.gamepad, size: 64, color: Colors.white.withValues(alpha: 0.8)),
            const SizedBox(height: 16),
            Text(
              session.quizTitle.isEmpty ? 'Ожидание...' : session.quizTitle,
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const SizedBox(height: 8),
            Text(
              'Ожидаем старта от преподавателя',
              style: TextStyle(fontSize: 16, color: Colors.white.withValues(alpha: 0.6)),
            ),
            const Spacer(),
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 24),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
              ),
              child: Column(
                children: [
                   Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.people, color: Colors.white),
                      const SizedBox(width: 8),
                      Text(
                        '${parts.length} Игроков',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    alignment: WrapAlignment.center,
                    children: parts.map((p) {
                      return Chip(
                        label: Text(p.participantName, style: const TextStyle(fontWeight: FontWeight.bold)),
                        backgroundColor: Colors.white.withValues(alpha: 0.2),
                        labelStyle: const TextStyle(color: Colors.white),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
            const Spacer(),
          ],
        ),
      ),
    );
  }

  Widget _buildQuestion(QuizSession session) {
    if (_currentQuestion == null) {
      return const Scaffold(
        backgroundColor: Color(0xFF1E293B),
        body: Center(child: CircularProgressIndicator(color: Colors.white)),
      );
    }

    final q = _currentQuestion!;
    final timerPercent = (q['timerSeconds'] ?? 30) > 0 ? _timeLeft / (q['timerSeconds'] ?? 30) : 0.0;
    final options = (q['options'] as List?) ?? [];
    
    // Kahoot option colors
    final colors = [
      const Color(0xFFE21B3C), // Red
      const Color(0xFF1368CE), // Blue
      const Color(0xFFD89E00), // Yellow
      const Color(0xFF26890C), // Green
    ];
    final shapes = [Icons.change_history, Icons.square, Icons.circle, Icons.stop];

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text('${session.currentQuestionIndex + 1} / ${session.totalQuestions}'),
        centerTitle: true,
        actions: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: CircleAvatar(
              backgroundColor: _timeLeft <= 5 ? Colors.red : Colors.grey.shade200,
              radius: 18,
              child: Text(
                '$_timeLeft',
                style: TextStyle(
                  color: _timeLeft <= 5 ? Colors.white : Colors.black,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          )
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: LinearProgressIndicator(
            value: timerPercent,
            backgroundColor: Colors.grey.shade200,
            valueColor: AlwaysStoppedAnimation(_timeLeft <= 5 ? Colors.red : Colors.purple),
          ),
        ),
      ),
      body: Column(
        children: [
          // Question text
          Expanded(
            flex: 2,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(
                  q['text'] ?? '',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, height: 1.2),
                ),
              ),
            ),
          ),
          
          // Answers
          Expanded(
            flex: 3,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: q['type'] == 'short_text' 
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: TextField(
                        enabled: !_submitted,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                        decoration: InputDecoration(
                          hintText: 'Ваш ответ...',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                        onChanged: (val) => _selectedAnswer = val,
                      ),
                    ),
                  )
                : GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.3,
              ),
              itemCount: options.length,
              itemBuilder: (ctx, i) {
                final opt = options[i];
                final isSelected = _selectedAnswer is List 
                    ? (_selectedAnswer as List).contains(opt['id'])
                    : _selectedAnswer == opt['id'];

                return GestureDetector(
                  onTap: () => _handleSelectOption(opt['id']),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    decoration: BoxDecoration(
                      color: colors[i % colors.length],
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: isSelected ? 0.4 : 0.1),
                          blurRadius: isSelected ? 12 : 4,
                          offset: Offset(0, isSelected ? 6 : 4),
                        ),
                      ],
                      border: isSelected ? Border.all(color: Colors.white, width: 4) : null,
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(shapes[i % shapes.length], color: Colors.white, size: 32),
                          const SizedBox(height: 8),
                          Text(
                            opt['text'],
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          )),
          
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: (_submitted || _selectedAnswer == null) ? null : () => _handleSubmit(),
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.black87),
                  child: _submitting
                      ? const CircularProgressIndicator(color: Colors.white)
                      : Text(
                          _submitted ? 'Ожидание...' : 'Ответить',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFeedback(QuizSession session) {
    final isCorrect = _answerResult?['isCorrect'] ?? false;
    final bgColor = isCorrect ? const Color(0xFF66BF39) : const Color(0xFFE21B3C);

    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isCorrect ? Icons.check_circle : Icons.cancel,
                size: 100,
                color: Colors.white,
              ),
              const SizedBox(height: 24),
              Text(
                isCorrect ? 'Королевский ответ! 🎉' : 'Не в этот раз 😔',
                style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Colors.white),
              ),
              if (_answerResult != null) ...[
                const SizedBox(height: 40),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Column(
                    children: [
                      const Text('БАЛЛЫ', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold)),
                      Text(
                        '+${_answerResult!['pointsEarned'] ?? 0}',
                        style: const TextStyle(fontSize: 48, fontWeight: FontWeight.w900, color: Colors.white),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 48),
              const CircularProgressIndicator(color: Colors.white54),
              const SizedBox(height: 16),
              const Text('Ждем остальных...', style: TextStyle(color: Colors.white54)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildResults(QuizSession session, List<SessionParticipant> parts, SessionParticipant me) {
    final topParts = parts.take(3).toList();
    
    return Scaffold(
      backgroundColor: const Color(0xFF1E293B),
      body: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 24),
            const Text('🏆 ПОДИУМ', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Colors.white)),
            Text(session.quizTitle, style: TextStyle(color: Colors.white70)),
            
            const SizedBox(height: 48),
            // Minimal podium for MVP
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (topParts.length > 1) _buildPodiumBlock(topParts[1], 2, 120, Colors.grey.shade400),
                if (topParts.isNotEmpty) _buildPodiumBlock(topParts[0], 1, 160, Colors.yellow.shade400),
                if (topParts.length > 2) _buildPodiumBlock(topParts[2], 3, 90, Colors.orange.shade400),
              ],
            ),
            
            const Spacer(),
            
            // Personal Result
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 24),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  const Text('ТВОЙ РЕЗУЛЬТАТ', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text('${me.score} очков', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Colors.white)),
                  const SizedBox(height: 8),
                  Text('#${me.rank ?? '-'} Место', style: const TextStyle(fontSize: 18, color: Colors.yellow)),
                ],
              ),
            ),
            
            const SizedBox(height: 24),
            TextButton(
              onPressed: () => context.go('/home'),
              child: const Text('Закончить', style: TextStyle(fontSize: 18, color: Colors.white54)),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildPodiumBlock(SessionParticipant p, int place, double height, Color color) {
    return Column(
      children: [
        Text(p.participantName, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Container(
          width: 80,
          height: height,
          decoration: BoxDecoration(
            color: color,
            borderRadius: const BorderRadius.only(topLeft: Radius.circular(8), topRight: Radius.circular(8)),
          ),
          child: Center(
            child: Text('$place', style: const TextStyle(fontSize: 48, fontWeight: FontWeight.w900, color: Colors.black26)),
          ),
        ),
      ],
    );
  }
}
