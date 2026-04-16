import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/exam_attempt.dart';
import 'auth_provider.dart';

/// All exam attempts for current student.
final myAttemptsProvider = FutureProvider<List<ExamAttempt>>((ref) async {
  final repo = ref.watch(examRepositoryProvider);
  return repo.getMyAttempts();
});

/// Single attempt detail.
final attemptDetailProvider =
    FutureProvider.family<ExamAttempt, String>((ref, attemptId) async {
  final repo = ref.watch(examRepositoryProvider);
  return repo.getAttemptDetail(attemptId);
});

/// Dashboard stats (recentAttempts, counts, etc.).
final dashboardProvider =
    FutureProvider<Map<String, dynamic>>((ref) async {
  final repo = ref.watch(examRepositoryProvider);
  return repo.getDashboard();
});
