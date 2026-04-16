import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/quiz_session.dart';

final quizSessionStreamProvider = StreamProvider.family<QuizSession?, String>((ref, sessionId) {
  return FirebaseFirestore.instance
      .collection('quizSessions')
      .doc(sessionId)
      .snapshots()
      .map((snap) {
    if (!snap.exists) return null;
    return QuizSession.fromMap(snap.id, snap.data()!);
  });
});

final quizParticipantsStreamProvider =
    StreamProvider.family<List<SessionParticipant>, String>((ref, sessionId) {
  return FirebaseFirestore.instance
      .collection('quizSessions')
      .doc(sessionId)
      .collection('participants')
      .orderBy('score', descending: true)
      .snapshots()
      .map((snap) {
    final participants = <SessionParticipant>[];
    for (int i = 0; i < snap.docs.length; i++) {
      final doc = snap.docs[i];
      final data = doc.data();
      data['rank'] = i + 1; // Assign rank based on order
      participants.add(SessionParticipant.fromMap(doc.id, data));
    }
    return participants;
  });
});
