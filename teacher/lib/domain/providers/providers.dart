import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../data/services/api_service.dart';

/// Singleton API service provider.
final apiServiceProvider = Provider<ApiService>((ref) => ApiService());

/// Firebase Auth state stream.
final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

/// User profile from Firestore.
final userProfileProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) return null;
  final doc = await FirebaseFirestore.instance
      .collection('users')
      .doc(user.uid)
      .get();
  if (!doc.exists) return null;
  return {'id': doc.id, ...doc.data()!};
});

/// Dashboard data.
final dashboardProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getDashboard();
});

/// Lessons list.
final lessonsProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getLessons();
});

/// Exams list.
final examsProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getExams();
});

/// Single exam.
final examProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  return api.getExamById(id);
});

/// Courses list.
final coursesProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getCourses();
});

/// Single lesson.
final lessonProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  return api.getLessonById(id);
});

/// Groups list (optionally filtered by courseId).
final groupsProvider =
    FutureProvider.family<List<dynamic>, String?>((ref, courseId) async {
  final api = ref.read(apiServiceProvider);
  return api.getGroups(courseId: courseId);
});

/// Students list.
final studentsProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getStudents();
});

/// Schedule events.
final scheduleProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getSchedule();
});

/// Homework submissions.
final homeworkProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getHomeworkSubmissions();
});

/// Exam attempts / results.
final attemptsProvider =
    FutureProvider.family<List<dynamic>, String?>((ref, examId) async {
  final api = ref.read(apiServiceProvider);
  return api.getAttempts(examId: examId);
});

/// Rooms.
final roomsProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getRooms();
});

/// Journal entries.
final journalProvider =
    FutureProvider.family<List<dynamic>, String?>((ref, groupId) async {
  final api = ref.read(apiServiceProvider);
  return api.getJournal(groupId: groupId);
});

/// Grades.
final gradesProvider =
    FutureProvider.family<List<dynamic>, String?>((ref, groupId) async {
  final api = ref.read(apiServiceProvider);
  return api.getGrades(groupId: groupId);
});

/// Organization directory.
final orgDirectoryProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getOrgDirectory();
});

/// My memberships.
final membershipsProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getMyMemberships();
});

/// Checks if user can create high-level entities (courses, groups, exams)
final canCreateProvider = Provider<bool>((ref) {
  final profile = ref.watch(userProfileProvider).valueOrNull;
  final memberships = ref.watch(membershipsProvider).valueOrNull;

  if (profile == null) return false;
  
  final activeOrgId = profile['activeOrgId'] ?? profile['organizationId'];
  if (activeOrgId == null) return true; // Personal space = can create
  
  if (memberships != null) {
    try {
      final activeMem = memberships.cast<Map<String, dynamic>>().firstWhere(
        (m) => m['organizationId'] == activeOrgId
      );
      final role = activeMem['role'];
      return role == 'admin' || role == 'owner';
    } catch (_) {
      return false;
    }
  }
  
  return false;
});

