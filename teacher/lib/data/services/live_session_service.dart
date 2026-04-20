import 'dart:async';
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Firestore service for Live Lesson sessions (teacher side).
/// Mirrors the web `live-session.service.ts` using direct Firestore access.
class LiveSessionService {
  final _db = FirebaseFirestore.instance;
  final _auth = FirebaseAuth.instance;

  // ── Helpers ──

  String _generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final rng = Random.secure();
    return List.generate(6, (_) => chars[rng.nextInt(chars.length)]).join();
  }

  String get _uid => _auth.currentUser!.uid;
  String get _displayName =>
      _auth.currentUser?.displayName ?? 'Teacher';

  // ── Session CRUD ──

  Future<String> createSession({
    required String lessonId,
    required String lessonTitle,
    required String organizationId,
  }) async {
    final now = DateTime.now().toIso8601String();
    final joinCode = _generateJoinCode();

    final docRef = await _db.collection('liveSessions').add({
      'lessonId': lessonId,
      'lessonTitle': lessonTitle,
      'organizationId': organizationId,
      'teacherId': _uid,
      'teacherName': _displayName,
      'status': 'active',
      'joinCode': joinCode,
      'currentSlideIndex': 0,
      'focusMode': false,
      'participantCount': 1,
      'createdAt': now,
      'updatedAt': now,
    });

    // Add teacher as first participant
    await docRef.collection('participants').doc(_uid).set({
      'userId': _uid,
      'name': _displayName,
      'role': 'teacher',
      'isOnline': true,
      'joinedAt': now,
      'lastActiveAt': now,
    });

    return docRef.id;
  }

  Future<void> endSession(String sessionId) async {
    await _db.collection('liveSessions').doc(sessionId).update({
      'status': 'ended',
      'updatedAt': DateTime.now().toIso8601String(),
    });
  }

  Future<Map<String, dynamic>?> getSession(String sessionId) async {
    final doc = await _db.collection('liveSessions').doc(sessionId).get();
    if (!doc.exists) return null;
    return {'id': doc.id, ...doc.data()!};
  }

  Future<Map<String, dynamic>?> findActiveSessionForLesson(
      String lessonId) async {
    final snap = await _db
        .collection('liveSessions')
        .where('lessonId', isEqualTo: lessonId)
        .where('status', isEqualTo: 'active')
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return null;
    final d = snap.docs.first;
    return {'id': d.id, ...d.data()};
  }

  // ── Real-time Subscriptions ──

  Stream<Map<String, dynamic>?> watchSession(String sessionId) {
    return _db
        .collection('liveSessions')
        .doc(sessionId)
        .snapshots()
        .map((snap) {
      if (!snap.exists) return null;
      return {'id': snap.id, ...snap.data()!};
    });
  }

  Stream<List<Map<String, dynamic>>> watchParticipants(String sessionId) {
    return _db
        .collection('liveSessions/$sessionId/participants')
        .snapshots()
        .map((snap) => snap.docs.map((d) => d.data()).toList());
  }

  Stream<List<Map<String, dynamic>>> watchReactions(String sessionId) {
    return _db
        .collection('liveSessions/$sessionId/reactions')
        .orderBy('createdAt', descending: true)
        .limit(20)
        .snapshots()
        .map((snap) =>
            snap.docs.map((d) => {'id': d.id, ...d.data()}).toList());
  }

  // ── Annotations ──

  Future<void> addAnnotation(
    String sessionId, {
    required String type,
    required List<Map<String, double>> points,
    required String color,
    required double width,
    int slideIndex = 0,
  }) async {
    await _db.collection('liveSessions/$sessionId/annotations').add({
      'sessionId': sessionId,
      'type': type,
      'points': points,
      'color': color,
      'width': width,
      'slideIndex': slideIndex,
      'authorId': _uid,
      'createdAt': DateTime.now().toIso8601String(),
    });
  }

  Future<void> clearAnnotations(String sessionId) async {
    final snap =
        await _db.collection('liveSessions/$sessionId/annotations').get();
    final batch = _db.batch();
    for (final doc in snap.docs) {
      batch.delete(doc.reference);
    }
    await batch.commit();
  }

  // ── Cursor (Throttled) ──

  Timer? _cursorTimer;
  Map<String, double>? _pendingCursor;

  void updateCursor(String sessionId, double x, double y) {
    _pendingCursor = {'x': x, 'y': y};
    if (_cursorTimer != null) return;

    _cursorTimer = Timer(const Duration(milliseconds: 100), () async {
      if (_pendingCursor != null) {
        try {
          await _db
              .collection('liveSessions/$sessionId/participants')
              .doc(_uid)
              .update({
            'cursorX': _pendingCursor!['x'],
            'cursorY': _pendingCursor!['y'],
            'lastActiveAt': DateTime.now().toIso8601String(),
          });
        } catch (_) {}
      }
      _cursorTimer = null;
      _pendingCursor = null;
    });
  }

  void disposeCursorThrottle() {
    _cursorTimer?.cancel();
    _cursorTimer = null;
    _pendingCursor = null;
  }

  // ── Reactions ──

  Future<void> addReaction(String sessionId, String type) async {
    await _db.collection('liveSessions/$sessionId/reactions').add({
      'sessionId': sessionId,
      'userId': _uid,
      'userName': _displayName,
      'type': type,
      'createdAt': DateTime.now().toIso8601String(),
    });
  }

  // ── Kick ──

  Future<void> kickParticipant(String sessionId, String userId) async {
    await _db
        .collection('liveSessions/$sessionId/participants')
        .doc(userId)
        .delete();
  }
}
