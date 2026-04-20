import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../data/services/live_session_service.dart';

/// Full-screen remote control for Live Lesson sessions.
///
/// Layout:
///  ┌──────────────────────────────────┐
///  │  Status Bar: LIVE · 12 online   │
///  │  Code: ABC123  [Copy]           │
///  ├──────────────────────────────────┤
///  │                                  │
///  │       TOUCH ZONE                 │
///  │    (laser / drawing)             │
///  │                                  │
///  ├──────────────────────────────────┤
///  │  [Laser] [Draw] [Eraser] [Clear] │
///  │  [Colors] [Width]                │
///  │  [End Lesson]                    │
///  └──────────────────────────────────┘
class LiveSessionScreen extends StatefulWidget {
  final String lessonId;
  final String lessonTitle;
  final String organizationId;

  const LiveSessionScreen({
    super.key,
    required this.lessonId,
    required this.lessonTitle,
    required this.organizationId,
  });

  @override
  State<LiveSessionScreen> createState() => _LiveSessionScreenState();
}

class _LiveSessionScreenState extends State<LiveSessionScreen> {
  final _service = LiveSessionService();

  String? _sessionId;
  Map<String, dynamic>? _session;
  List<Map<String, dynamic>> _participants = [];
  List<Map<String, dynamic>> _reactions = [];
  bool _loading = true;

  // Tool state
  String _toolMode = 'laser'; // laser | draw | eraser
  Color _currentColor = Colors.red;
  double _currentWidth = 4.0;

  // Drawing state
  List<Map<String, double>> _currentPath = [];
  bool _isDrawing = false;

  // Subscriptions
  StreamSubscription? _sessionSub;
  StreamSubscription? _participantsSub;
  StreamSubscription? _reactionsSub;

  static const _colors = [
    Colors.red,
    Colors.orange,
    Colors.yellow,
    Colors.green,
    Colors.blue,
    Colors.purple,
    Colors.pink,
    Colors.white,
  ];

  @override
  void initState() {
    super.initState();
    _initSession();
  }

  Future<void> _initSession() async {
    try {
      // Check for existing active session
      final existing =
          await _service.findActiveSessionForLesson(widget.lessonId);
      if (existing != null) {
        _sessionId = existing['id'];
      } else {
        _sessionId = await _service.createSession(
          lessonId: widget.lessonId,
          lessonTitle: widget.lessonTitle,
          organizationId: widget.organizationId,
        );
      }

      // Subscribe to real-time updates
      _sessionSub = _service.watchSession(_sessionId!).listen((s) {
        if (mounted) setState(() => _session = s);
      });

      _participantsSub =
          _service.watchParticipants(_sessionId!).listen((p) {
        if (mounted) setState(() => _participants = p);
      });

      _reactionsSub = _service.watchReactions(_sessionId!).listen((r) {
        if (mounted) setState(() => _reactions = r);
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  void dispose() {
    _sessionSub?.cancel();
    _participantsSub?.cancel();
    _reactionsSub?.cancel();
    _service.disposeCursorThrottle();
    super.dispose();
  }

  void _handlePanStart(DragStartDetails details, BoxConstraints constraints) {
    final x = details.localPosition.dx / constraints.maxWidth;
    final y = details.localPosition.dy / constraints.maxHeight;

    if (_toolMode == 'laser') {
      _service.updateCursor(_sessionId!, x, y);
    } else if (_toolMode == 'draw') {
      setState(() {
        _isDrawing = true;
        _currentPath = [{'x': x, 'y': y}];
      });
    }
  }

  void _handlePanUpdate(
      DragUpdateDetails details, BoxConstraints constraints) {
    final x = (details.localPosition.dx / constraints.maxWidth).clamp(0.0, 1.0);
    final y = (details.localPosition.dy / constraints.maxHeight).clamp(0.0, 1.0);

    if (_toolMode == 'laser') {
      _service.updateCursor(_sessionId!, x, y);
    } else if (_toolMode == 'draw' && _isDrawing) {
      setState(() {
        _currentPath.add({'x': x, 'y': y});
      });
    }
  }

  void _handlePanEnd(DragEndDetails details) {
    if (_toolMode == 'draw' && _isDrawing && _currentPath.length > 1) {
      _service.addAnnotation(
        _sessionId!,
        type: 'draw',
        points: _currentPath,
        color: '#${_currentColor.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}',
        width: _currentWidth,
      );
    }
    setState(() {
      _isDrawing = false;
      _currentPath = [];
    });
  }

  Future<void> _endSession() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Завершить Live урок?'),
        content:
            const Text('Все участники будут отключены.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Отмена')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: FilledButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Завершить')),
        ],
      ),
    );

    if (confirmed == true && _sessionId != null) {
      await _service.endSession(_sessionId!);
      if (mounted) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F0F23),
        body: Center(child: CircularProgressIndicator(color: Colors.white)),
      );
    }

    final joinCode = _session?['joinCode'] ?? '...';
    final onlineCount = _participants.length;

    return Scaffold(
      backgroundColor: const Color(0xFF0F0F23),
      body: SafeArea(
        child: Column(
          children: [
            // ── Top Status Bar ──
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.deepPurple.shade900,
                    Colors.indigo.shade900
                  ],
                ),
              ),
              child: Row(
                children: [
                  // LIVE indicator
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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

                  // Online count
                  Icon(Icons.people, size: 18, color: Colors.white70),
                  const SizedBox(width: 4),
                  Text('$onlineCount',
                      style: const TextStyle(
                          color: Colors.white70, fontWeight: FontWeight.w600)),

                  const Spacer(),

                  // Join code
                  GestureDetector(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: joinCode));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                            content: Text('Код скопирован!'),
                            duration: Duration(seconds: 1)),
                      );
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(joinCode,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontFamily: 'monospace',
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                  letterSpacing: 3)),
                          const SizedBox(width: 6),
                          const Icon(Icons.copy,
                              size: 16, color: Colors.white70),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // ── Touch Zone ──
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  return GestureDetector(
                    onPanStart: (d) => _handlePanStart(d, constraints),
                    onPanUpdate: (d) => _handlePanUpdate(d, constraints),
                    onPanEnd: _handlePanEnd,
                    child: Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.3),
                        border: Border.all(
                          color: _toolMode == 'laser'
                              ? Colors.red.withValues(alpha: 0.4)
                              : Colors.blue.withValues(alpha: 0.4),
                          width: 2,
                        ),
                      ),
                      child: CustomPaint(
                        painter: _TouchZonePainter(
                          path: _currentPath,
                          color: _currentColor,
                          width: _currentWidth,
                          toolMode: _toolMode,
                        ),
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                _toolMode == 'laser'
                                    ? Icons.touch_app
                                    : Icons.edit,
                                size: 48,
                                color: Colors.white.withValues(alpha: 0.15),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                _toolMode == 'laser'
                                    ? 'Двигайте палец — лазер'
                                    : 'Рисуйте пальцем',
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.2),
                                  fontSize: 16,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
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
                                      color: Colors.white70, fontSize: 11)),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),

            // ── Bottom Toolbar ──
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    const Color(0xFF0F0F23),
                    Colors.deepPurple.shade900.withValues(alpha: 0.8),
                  ],
                ),
              ),
              child: Column(
                children: [
                  // Tool selector
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _buildToolBtn(
                          Icons.touch_app, 'laser', Colors.red),
                      const SizedBox(width: 8),
                      _buildToolBtn(Icons.edit, 'draw', Colors.blue),
                      const SizedBox(width: 8),
                      _buildToolBtn(
                          Icons.auto_fix_off, 'eraser', Colors.orange),
                      const SizedBox(width: 16),
                      // Clear all
                      IconButton(
                        onPressed: () async {
                          if (_sessionId != null) {
                            await _service.clearAnnotations(_sessionId!);
                          }
                        },
                        icon: const Icon(Icons.delete_sweep,
                            color: Colors.white54),
                        tooltip: 'Очистить все',
                      ),
                    ],
                  ),

                  // Color + Width (only in draw mode)
                  if (_toolMode == 'draw') ...[
                    const SizedBox(height: 10),
                    // Colors
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: _colors.map((c) {
                        final isSelected = c == _currentColor;
                        return GestureDetector(
                          onTap: () => setState(() => _currentColor = c),
                          child: Container(
                            width: 32,
                            height: 32,
                            margin: const EdgeInsets.symmetric(horizontal: 3),
                            decoration: BoxDecoration(
                              color: c,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color:
                                    isSelected ? Colors.white : Colors.white24,
                                width: isSelected ? 3 : 1,
                              ),
                              boxShadow: isSelected
                                  ? [
                                      BoxShadow(
                                          color: c.withValues(alpha: 0.5),
                                          blurRadius: 8)
                                    ]
                                  : null,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 8),
                    // Width slider
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.line_weight,
                            size: 16, color: Colors.white54),
                        SizedBox(
                          width: 200,
                          child: Slider(
                            value: _currentWidth,
                            min: 2,
                            max: 12,
                            divisions: 5,
                            activeColor: _currentColor,
                            onChanged: (v) =>
                                setState(() => _currentWidth = v),
                          ),
                        ),
                      ],
                    ),
                  ],

                  const SizedBox(height: 12),

                  // End button
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _endSession,
                      icon: const Icon(Icons.stop_circle),
                      label: const Text('Завершить урок',
                          style: TextStyle(fontWeight: FontWeight.bold)),
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.red.shade700,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildToolBtn(IconData icon, String mode, Color activeColor) {
    final isActive = _toolMode == mode;
    return Material(
      color: isActive ? activeColor : Colors.white.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () => setState(() => _toolMode = mode),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Icon(icon,
              color: isActive ? Colors.white : Colors.white54, size: 24),
        ),
      ),
    );
  }
}

/// Custom painter for the touch zone — shows the current drawing path.
class _TouchZonePainter extends CustomPainter {
  final List<Map<String, double>> path;
  final Color color;
  final double width;
  final String toolMode;

  _TouchZonePainter({
    required this.path,
    required this.color,
    required this.width,
    required this.toolMode,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (path.length < 2 || toolMode != 'draw') return;

    final paint = Paint()
      ..color = color.withValues(alpha: 0.8)
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    final drawPath = Path();
    drawPath.moveTo(path[0]['x']! * size.width, path[0]['y']! * size.height);
    for (int i = 1; i < path.length; i++) {
      drawPath.lineTo(path[i]['x']! * size.width, path[i]['y']! * size.height);
    }
    canvas.drawPath(drawPath, paint);
  }

  @override
  bool shouldRepaint(covariant _TouchZonePainter oldDelegate) =>
      path.length != oldDelegate.path.length || color != oldDelegate.color;
}
