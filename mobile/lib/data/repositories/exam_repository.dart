import '../models/exam_attempt.dart';
import '../services/api_service.dart';

/// Repository for exam attempts and results.
class ExamRepository {
  final ApiService _api;

  ExamRepository(this._api);

  /// Fetch all attempts for current student.
  Future<List<ExamAttempt>> getMyAttempts() async {
    final data = await _api.getMyAttempts();
    return data
        .cast<Map<String, dynamic>>()
        .map(ExamAttempt.fromMap)
        .toList();
  }

  /// Fetch attempt details.
  Future<ExamAttempt> getAttemptDetail(String attemptId) async {
    final data = await _api.getAttemptDetail(attemptId);
    return ExamAttempt.fromMap(data);
  }

  /// Join an exam room by its ID.
  Future<Map<String, dynamic>> joinRoom(String roomId) async {
    return _api.joinRoom(roomId);
  }

  /// Fetch dashboard stats.
  Future<Map<String, dynamic>> getDashboard() async {
    return _api.getDashboard();
  }
}
