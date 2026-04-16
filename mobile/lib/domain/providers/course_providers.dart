import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/course.dart';
import '../../data/models/group.dart';
import 'auth_provider.dart';

/// All courses for current org.
final coursesProvider = FutureProvider<List<Course>>((ref) async {
  final repo = ref.watch(courseRepositoryProvider);
  return repo.getCourses();
});

/// Groups, optionally filtered by courseId.
final groupsProvider =
    FutureProvider.family<List<Group>, String?>((ref, courseId) async {
  final repo = ref.watch(courseRepositoryProvider);
  return repo.getGroups(courseId: courseId);
});

/// Single course detail.
final courseDetailProvider =
    FutureProvider.family<Course, String>((ref, courseId) async {
  final repo = ref.watch(courseRepositoryProvider);
  return repo.getCourse(courseId);
});

/// Groups for a specific course that current user belongs to.
final myGroupsProvider = FutureProvider<List<Group>>((ref) async {
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) return [];

  final repo = ref.watch(courseRepositoryProvider);
  final groups = await repo.getGroups();

  // Filter to groups the student is in
  return groups.where((g) => g.hasStudent(user.uid)).toList();
});
