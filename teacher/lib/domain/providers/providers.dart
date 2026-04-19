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

/// User profile from Firestore — kept alive to avoid re-fetch on tab switch.
final userProfileProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  ref.keepAlive();
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) return null;
  final doc = await FirebaseFirestore.instance
      .collection('users')
      .doc(user.uid)
      .get();
  if (!doc.exists) return null;
  return {'id': doc.id, ...doc.data()!};
});

/// Dashboard data — kept alive, gracefully falls back to empty on errors.
final dashboardProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  ref.keepAlive();
  final api = ref.read(apiServiceProvider);
  try {
    return await api.getDashboard();
  } catch (_) {
    return {
      'lessonsCount': 0,
      'examsCount': 0,
      'activeRoomsCount': 0,
      'attemptsCount': 0,
      'avgScore': 0,
      'pendingHomeworkCount': 0,
      'recentLessons': <dynamic>[],
      'recentExams': <dynamic>[],
    };
  }
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

/// Courses list — kept alive.
final coursesProvider = FutureProvider<List<dynamic>>((ref) async {
  ref.keepAlive();
  final api = ref.read(apiServiceProvider);
  return api.getCourses();
});

/// Single lesson.
final lessonProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  return api.getLessonById(id);
});

/// Groups list (optionally filtered by courseId) — kept alive.
final groupsProvider =
    FutureProvider.family<List<dynamic>, String?>((ref, courseId) async {
  ref.keepAlive();
  final api = ref.read(apiServiceProvider);
  return api.getGroups(courseId: courseId);
});

/// Students list — single backend call via teacherStudents endpoint.
final studentsProvider = FutureProvider<List<dynamic>>((ref) async {
  ref.keepAlive();
  final api = ref.read(apiServiceProvider);
  final profile = ref.watch(userProfileProvider).valueOrNull;
  final orgId = profile?['activeOrgId'] ?? profile?['organizationId'];
  if (orgId == null || (orgId as String).isEmpty) return [];

  final res = await api.dio.get('/api-memberships', queryParameters: {
    'action': 'teacherStudents',
    'orgId': orgId,
  });
  return (res.data is List) ? res.data : [];
});

/// Schedule events.
final scheduleProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getSchedule();
});

/// Homework submissions (filtered by org).
final homeworkProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final profile = ref.watch(userProfileProvider).valueOrNull;
  final orgId = profile?['activeOrgId'] ?? profile?['organizationId'];
  if (orgId == null || (orgId as String).isEmpty) return [];
  return api.getHomeworkSubmissions(orgId: orgId);
});

/// Notification preferences.
final notificationPrefsProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    return await api.getNotificationPreferences();
  } catch (_) {
    return {
      'pushEnabled': true,
      'lessons': true,
      'homework': true,
      'schedule': true,
      'exams': true,
    };
  }
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

/// Journal entries (by groupId — legacy).
final journalProvider =
    FutureProvider.family<List<dynamic>, String?>((ref, groupId) async {
  final api = ref.read(apiServiceProvider);
  return api.getJournal(groupId: groupId);
});

/// Journal entries (by courseId — matches api-gradebook backend).
final journalByCourseProvider =
    FutureProvider.family<List<dynamic>, String>((ref, courseId) async {
  final api = ref.read(apiServiceProvider);
  return api.getJournalByCourse(courseId: courseId);
});

/// Grades (by groupId — legacy).
final gradesProvider =
    FutureProvider.family<List<dynamic>, String?>((ref, groupId) async {
  final api = ref.read(apiServiceProvider);
  return api.getGrades(groupId: groupId);
});

/// Grades (by courseId — matches api-gradebook backend).
final gradesByCourseProvider =
    FutureProvider.family<List<dynamic>, String>((ref, courseId) async {
  final api = ref.read(apiServiceProvider);
  return api.getGradesByCourse(courseId: courseId);
});

/// Organization directory.
final orgDirectoryProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  return api.getOrgDirectory();
});

/// My memberships — kept alive.
final membershipsProvider = FutureProvider<List<dynamic>>((ref) async {
  ref.keepAlive();
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
