import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/user_profile.dart';
import '../models/membership.dart';
import '../models/gamification.dart';

/// Repository for user-related Firestore operations.
class UserRepository {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  /// Fetch user profile from Firestore.
  Future<UserProfile?> getProfile(String uid) async {
    final doc = await _db.collection('users').doc(uid).get();
    if (!doc.exists || doc.data() == null) return null;
    return UserProfile.fromMap(doc.id, doc.data()!);
  }

  /// Update user profile fields.
  Future<void> updateProfile(String uid, Map<String, dynamic> data) async {
    data['updatedAt'] = DateTime.now().toIso8601String();
    await _db.collection('users').doc(uid).update(data);
  }

  /// Get active memberships.
  Future<List<Membership>> getMemberships(String uid) async {
    final snap = await _db
        .collection('users')
        .doc(uid)
        .collection('memberships')
        .where('status', whereIn: ['active', 'invited', 'pending'])
        .get();

    return snap.docs
        .map((d) => Membership.fromMap(d.id, d.data()))
        .toList();
  }

  /// Get gamification data.
  Future<GamificationData?> getGamification(String uid) async {
    final doc = await _db.collection('gamification').doc(uid).get();
    if (!doc.exists || doc.data() == null) return null;
    return GamificationData.fromMap(doc.data()!);
  }
}
