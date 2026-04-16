import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/user_profile.dart';
import '../../data/models/gamification.dart';
import '../../data/models/membership.dart';
import '../../data/repositories/user_repository.dart';
import '../../data/repositories/course_repository.dart';
import '../../data/repositories/exam_repository.dart';
import '../../data/services/api_service.dart';

// ── Firebase Auth State ──

final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

// ── Singleton Services ──

final apiServiceProvider = Provider<ApiService>((ref) {
  return ApiService();
});

final userRepositoryProvider = Provider<UserRepository>((ref) {
  return UserRepository();
});

final courseRepositoryProvider = Provider<CourseRepository>((ref) {
  final api = ref.watch(apiServiceProvider);
  return CourseRepository(api);
});

final examRepositoryProvider = Provider<ExamRepository>((ref) {
  final api = ref.watch(apiServiceProvider);
  return ExamRepository(api);
});

// ── User Profile (typed) ──

final userProfileProvider = FutureProvider<UserProfile?>((ref) async {
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) return null;

  final repo = ref.watch(userRepositoryProvider);
  return repo.getProfile(user.uid);
});

// ── User Memberships ──

final userMembershipsProvider = FutureProvider<List<Membership>>((ref) async {
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) return [];

  final repo = ref.watch(userRepositoryProvider);
  return repo.getMemberships(user.uid);
});

// ── Gamification Data (typed) ──

final gamificationProvider = FutureProvider<GamificationData?>((ref) async {
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) return null;

  final repo = ref.watch(userRepositoryProvider);
  return repo.getGamification(user.uid);
});

// ── Notifications ──

final notificationsProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) return [];

  final snapshot = await FirebaseFirestore.instance
      .collection('notifications')
      .where('recipientId', isEqualTo: user.uid)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .get();

  return snapshot.docs.map((d) => {'id': d.id, ...d.data()}).toList();
});

final unreadNotificationCountProvider = Provider<int>((ref) {
  final notifications = ref.watch(notificationsProvider).valueOrNull ?? [];
  return notifications.where((n) => n['read'] != true).length;
});
