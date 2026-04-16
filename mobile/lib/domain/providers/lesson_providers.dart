import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/lesson_plan.dart';
import '../../data/models/homework_submission.dart';
import 'auth_provider.dart';

/// Lessons for a specific group.
final groupLessonsProvider =
    FutureProvider.family<List<LessonPlan>, String>((ref, groupId) async {
  final api = ref.watch(apiServiceProvider);
  final raw = await api.getLessons(groupId: groupId);
  return raw.map((e) => LessonPlan.fromMap(e)).toList();
});

/// Single lesson detail.
final lessonDetailProvider =
    FutureProvider.family<LessonPlan, String>((ref, lessonId) async {
  final api = ref.watch(apiServiceProvider);
  final data = await api.getLesson(lessonId);
  return LessonPlan.fromMap(data);
});

/// Current student's homework submission for a specific lesson.
final homeworkSubmissionProvider =
    FutureProvider.family<HomeworkSubmission?, String>(
        (ref, lessonId) async {
  final api = ref.watch(apiServiceProvider);
  try {
    final data = await api.getMyHomework(lessonId);
    if (data['_empty'] == true) return null;
    return HomeworkSubmission.fromMap(data);
  } catch (_) {
    return null;
  }
});
