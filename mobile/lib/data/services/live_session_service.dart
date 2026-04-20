import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Firestore service for Live Lesson sessions (student side — read-heavy).
class LiveSessionService {
  final _db = FirebaseFirestore.instance;
  final _auth = FirebaseAuth.instance;

  String get _uid => _auth.currentUser!.uid;
  String get _displayName =>
      _auth.currentUser?.displayName ?? 'Student';

  // ── Find session by join code ──

  Future<Map<String, dynamic>?> findByCode(String code) async {
    final snap = await _db
        .collection('liveSessions')
        .where('joinCode', isEqualTo: code.toUpperCase())
        .where('status', isEqualTo: 'active')
        .limit(1)
        .get();
    if (snap.docs.isEmpty) return null;
    final d = snap.docs.first;
    return {'id': d.id, ...d.data()};
  }

  // ── Join session ──

  Future<void> join(String sessionId) async {
    final now = DateTime.now().toIso8601String();
    await _db
        .collection('liveSessions/$sessionId/participants')
        .doc(_uid)
        .set({
      'userId': _uid,
      'name': _displayName,
      'avatarUrl': _auth.currentUser?.photoURL,
      'role': 'student',
      'isOnline': true,
      'joinedAt': now,
      'lastActiveAt': now,
    });
  }

  // ── Leave session ──

  Future<void> leave(String sessionId) async {
    await _db
        .collection('liveSessions/$sessionId/participants')
        .doc(_uid)
        .delete();
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

  Stream<List<Map<String, dynamic>>> watchAnnotations(String sessionId) {
    return _db
        .collection('liveSessions/$sessionId/annotations')
        .orderBy('createdAt')
        .snapshots()
        .map((snap) =>
            snap.docs.map((d) => {'id': d.id, ...d.data()}).toList());
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
}
