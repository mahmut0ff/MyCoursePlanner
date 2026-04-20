import 'dart:async';

import 'package:flutter/material.dart';

import '../../data/services/live_session_service.dart';

/// Student live lesson viewer — shows teacher's annotations, laser pointer,
/// and allows sending reactions.
class LiveLessonScreen extends StatefulWidget {
  final String sessionId;
  final String lessonTitle;

  const LiveLessonScreen({
    super.key,
    required this.sessionId,
    required this.lessonTitle,
  });

  @override
  State<LiveLessonScreen> createState() => _LiveLessonScreenState();
}

class _LiveLessonScreenState extends State<LiveLessonScreen> {
  final _service = LiveSessionService();


  List<Map<String, dynamic>> _participants = [];
  List<Map<String, dynamic>> _annotations = [];
  List<Map<String, dynamic>> _reactions = [];

  StreamSubscription? _sessionSub;
  StreamSubscription? _participantsSub;
  StreamSubscription? _annotationsSub;
  StreamSubscription? _reactionsSub;

  bool _reactionCooldown = false;
  bool _ended = false;

  // Teacher cursor from participants
  double? _teacherX;
  double? _teacherY;

  static const _reactionEmojis = ['👍', '😕', '🔥', '✋', '❓'];

  @override
  void initState() {
    super.initState();
    _subscribe();
  }

  void _subscribe() {
    _sessionSub = _service.watchSession(widget.sessionId).listen((s) {
      if (mounted) {
        if (s != null && s['status'] == 'ended') {
          setState(() => _ended = true);
        }
      }
    });

    _participantsSub =
        _service.watchParticipants(widget.sessionId).listen((p) {
      if (mounted) {
        setState(() {
          _participants = p;
          // Find teacher cursor
          final teacher = p.where((pp) => pp['role'] == 'teacher').firstOrNull;
          if (teacher != null) {
            _teacherX = (teacher['cursorX'] as num?)?.toDouble();
            _teacherY = (teacher['cursorY'] as num?)?.toDouble();
          }
        });
      }
    });

    _annotationsSub =
        _service.watchAnnotations(widget.sessionId).listen((a) {
      if (mounted) setState(() => _annotations = a);
    });

    _reactionsSub =
        _service.watchReactions(widget.sessionId).listen((r) {
      if (mounted) setState(() => _reactions = r);
    });
  }

  @override
  void dispose() {
    _sessionSub?.cancel();
    _participantsSub?.cancel();
    _annotationsSub?.cancel();
    _reactionsSub?.cancel();
    // Leave session
    _service.leave(widget.sessionId);
    super.dispose();
  }

  void _sendReaction(String emoji) async {
    if (_reactionCooldown) return;
    setState(() => _reactionCooldown = true);
    await _service.addReaction(widget.sessionId, emoji);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _reactionCooldown = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_ended) {
      return Scaffold(
        backgroundColor: const Color(0xFF0F0F23),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.check_circle,
                  size: 64, color: Colors.green),
              const SizedBox(height: 16),
              const Text('Урок завершён',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.bold)),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Вернуться'),
              ),
            ],
          ),
        ),
      );
    }

    final onlineCount = _participants.length;

    return Scaffold(
      backgroundColor: const Color(0xFF0F0F23),
      body: SafeArea(
        child: Column(
          children: [
            // ── Top bar ──
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.deepPurple.shade900,
                    Colors.indigo.shade900,
                  ],
                ),
              ),
              child: Row(
                children: [
                  // Back
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon:
                        const Icon(Icons.arrow_back, color: Colors.white70),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                  const SizedBox(width: 12),

                  // LIVE indicator
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.red,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                              color: Colors.white, shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 6),
                        const Text('LIVE',
                            style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 13)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),

                  // Title
                  Expanded(
                    child: Text(
                      widget.lessonTitle,
                      style: const TextStyle(
                          color: Colors.white70,
                          fontWeight: FontWeight.w600,
                          fontSize: 14),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),

                  // Online count
                  const Icon(Icons.people, size: 16, color: Colors.white54),
                  const SizedBox(width: 4),
                  Text('$onlineCount',
                      style: const TextStyle(
                          color: Colors.white54,
                          fontWeight: FontWeight.w600,
                          fontSize: 13)),
                ],
              ),
            ),

            // ── Canvas area ──
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  return Stack(
                    children: [
                      // Background
                      Container(
                        color: Colors.black.withValues(alpha: 0.3),
                      ),

                      // Annotations
                      CustomPaint(
                        size: Size(
                            constraints.maxWidth, constraints.maxHeight),
                        painter: _AnnotationPainter(
                          annotations: _annotations,
                          containerSize: Size(constraints.maxWidth,
                              constraints.maxHeight),
                        ),
                      ),

                      // Teacher laser cursor
                      if (_teacherX != null && _teacherY != null)
                        Positioned(
                          left: _teacherX! * constraints.maxWidth - 12,
                          top: _teacherY! * constraints.maxHeight - 12,
                          child: Container(
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.red.withValues(alpha: 0.3),
                              border:
                                  Border.all(color: Colors.red, width: 2),
                              boxShadow: [
                                BoxShadow(
                                    color: Colors.red.withValues(alpha: 0.4),
                                    blurRadius: 16,
                                    spreadRadius: 4),
                              ],
                            ),
                            child: Center(
                              child: Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ),

                      // Hint text
                      if (_annotations.isEmpty && _teacherX == null)
                        Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.cast_connected,
                                  size: 48,
                                  color: Colors.white.withValues(alpha: 0.12)),
                              const SizedBox(height: 8),
                              Text(
                                'Ожидание действий преподавателя...',
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.15),
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),

            // ── Reactions bar ──
            if (_reactions.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: _reactions.take(5).map((r) {
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(r['type'] ?? '',
                                  style: const TextStyle(fontSize: 18)),
                              const SizedBox(width: 4),
                              Text(r['userName'] ?? '',
                                  style: const TextStyle(
                                      color: Colors.white70,
                                      fontSize: 11)),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),

            // ── Bottom reaction buttons ──
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    const Color(0xFF0F0F23),
                    Colors.deepPurple.shade900.withValues(alpha: 0.6),
                  ],
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: _reactionEmojis.map((emoji) {
                  return GestureDetector(
                    onTap: () => _sendReaction(emoji),
                    child: AnimatedOpacity(
                      opacity: _reactionCooldown ? 0.3 : 1.0,
                      duration: const Duration(milliseconds: 200),
                      child: Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Center(
                          child: Text(emoji,
                              style: const TextStyle(fontSize: 28)),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Paints all annotations (drawings) from Firestore.
class _AnnotationPainter extends CustomPainter {
  final List<Map<String, dynamic>> annotations;
  final Size containerSize;

  _AnnotationPainter(
      {required this.annotations, required this.containerSize});

  @override
  void paint(Canvas canvas, Size size) {
    for (final a in annotations) {
      if (a['type'] != 'draw') continue;
      final points = (a['points'] as List?) ?? [];
      if (points.length < 2) continue;

      final color = _parseColor(a['color'] ?? '#ef4444');
      final width = ((a['width'] as num?)?.toDouble() ?? 4.0) *
          (size.width / 1000);

      final paint = Paint()
        ..color = color.withValues(alpha: 0.85)
        ..strokeWidth = width
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke;

      final path = Path();
      final p0 = points[0];
      path.moveTo(
        (p0['x'] as num).toDouble() * size.width,
        (p0['y'] as num).toDouble() * size.height,
      );
      for (int i = 1; i < points.length; i++) {
        final p = points[i];
        path.lineTo(
          (p['x'] as num).toDouble() * size.width,
          (p['y'] as num).toDouble() * size.height,
        );
      }
      canvas.drawPath(path, paint);
    }
  }

  Color _parseColor(String hex) {
    hex = hex.replaceFirst('#', '');
    if (hex.length == 6) hex = 'FF$hex';
    return Color(int.parse(hex, radix: 16));
  }

  @override
  bool shouldRepaint(covariant _AnnotationPainter oldDelegate) =>
      annotations.length != oldDelegate.annotations.length;
}
