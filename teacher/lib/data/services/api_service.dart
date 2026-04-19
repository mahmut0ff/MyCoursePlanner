import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../core/config/app_config.dart';

/// Dio HTTP client for Netlify Functions API.
/// Auto-attaches Firebase ID token to every request.
class ApiService {
  late final Dio _dio;

  ApiService() {
    _dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final user = FirebaseAuth.instance.currentUser;
        if (user != null) {
          final token = await user.getIdToken();
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          try {
            final user = FirebaseAuth.instance.currentUser;
            if (user != null) {
              final newToken = await user.getIdToken(true);
              error.requestOptions.headers['Authorization'] =
                  'Bearer $newToken';
              final retryResponse = await _dio.fetch(error.requestOptions);
              return handler.resolve(retryResponse);
            }
          } catch (_) {}
        }
        handler.next(error);
      },
    ));
  }

  Dio get dio => _dio;

  // ── Organizations & Memberships ──

  Future<List<dynamic>> getMyMemberships() async {
    final res = await _dio.get('/api-memberships', queryParameters: {'action': 'myMemberships'});
    return (res.data is List) ? res.data : [];
  }

  Future<void> switchOrg(String orgId) async {
    await _dio.post('/api-memberships', queryParameters: {'action': 'switchOrg'}, data: {'organizationId': orgId});
  }

  Future<List<dynamic>> getOrgDirectory() async {
    final res = await _dio.get('/api-organizations',
        queryParameters: {'action': 'directory'});
    return (res.data is List) ? res.data : [];
  }

  Future<Map<String, dynamic>> getOrgPublicProfile(String orgId) async {
    final res = await _dio.get('/api-organizations',
        queryParameters: {'action': 'publicProfile', 'id': orgId});
    return res.data;
  }

  Future<void> applyToOrg(String orgId) async {
    await _dio.post('/api-memberships', queryParameters: {
      'action': 'apply',
    }, data: {
      'organizationId': orgId,
      'role': 'teacher',
    });
  }

  // ── Dashboard ──

  Future<Map<String, dynamic>> getDashboard() async {
    final res = await _dio.get('/api-dashboard');
    return res.data;
  }

  // ── Lessons ──

  Future<List<dynamic>> getLessons() async {
    final res = await _dio.get('/api-lessons');
    return (res.data is List) ? res.data : [];
  }

  Future<Map<String, dynamic>> getLessonById(String id) async {
    final res = await _dio.get('/api-lessons', queryParameters: {'id': id});
    return res.data;
  }

  Future<Map<String, dynamic>> createLesson(Map<String, dynamic> data) async {
    final res = await _dio.post('/api-lessons', data: data);
    return res.data;
  }

  Future<void> updateLesson(String id, Map<String, dynamic> data) async {
    await _dio.put('/api-lessons', data: {'id': id, ...data});
  }

  Future<void> deleteLesson(String id) async {
    await _dio.delete('/api-lessons', data: {'id': id});
  }

  // ── Exams ──

  Future<List<dynamic>> getExams() async {
    final res = await _dio.get('/api-exams');
    return (res.data is List) ? res.data : [];
  }

  Future<Map<String, dynamic>> getExamById(String id) async {
    final res = await _dio.get('/api-exams', queryParameters: {'id': id});
    return res.data;
  }

  Future<Map<String, dynamic>> createExam(Map<String, dynamic> data) async {
    final res = await _dio.post('/api-exams', data: data);
    return res.data;
  }

  Future<void> updateExam(String id, Map<String, dynamic> data) async {
    await _dio.put('/api-exams', data: {'id': id, ...data});
  }

  Future<void> deleteExam(String id) async {
    await _dio.delete('/api-exams', data: {'id': id});
  }

  // ── Attempts / Results ──

  Future<List<dynamic>> getAttempts({String? examId}) async {
    final res = await _dio.get('/api-attempts',
        queryParameters: examId != null ? {'examId': examId} : null);
    return (res.data is List) ? res.data : [];
  }

  // ── Rooms ──

  Future<List<dynamic>> getRooms() async {
    final res = await _dio.get('/api-rooms');
    return (res.data is List) ? res.data : [];
  }

  Future<Map<String, dynamic>> createRoom(Map<String, dynamic> data) async {
    final res = await _dio.post('/api-rooms', data: data);
    return res.data;
  }

  // ── Courses ──

  Future<List<dynamic>> getCourses() async {
    final res = await _dio.get('/api-org',
        queryParameters: {'action': 'courses'});
    return (res.data is List) ? res.data : [];
  }

  Future<Map<String, dynamic>> createCourse(Map<String, dynamic> data) async {
    final res = await _dio.post('/api-org', data: {
      'action': 'createCourse',
      ...data,
    });
    return res.data;
  }

  Future<void> updateCourse(String id, Map<String, dynamic> data) async {
    await _dio.post('/api-org', data: {
      'action': 'updateCourse',
      'courseId': id,
      ...data,
    });
  }

  Future<void> deleteCourse(String id) async {
    await _dio.post('/api-org', data: {
      'action': 'deleteCourse',
      'courseId': id,
    });
  }

  // ── Groups ──

  Future<List<dynamic>> getGroups({String? courseId}) async {
    final params = <String, dynamic>{'action': 'groups'};
    if (courseId != null) params['courseId'] = courseId;
    final res = await _dio.get('/api-org', queryParameters: params);
    return (res.data is List) ? res.data : [];
  }

  Future<Map<String, dynamic>> createGroup(Map<String, dynamic> data) async {
    final res = await _dio.post('/api-org', data: {
      'action': 'createGroup',
      ...data,
    });
    return res.data;
  }

  Future<void> updateGroup(String id, Map<String, dynamic> data) async {
    await _dio.post('/api-org', data: {
      'action': 'updateGroup',
      'groupId': id,
      ...data,
    });
  }

  Future<void> deleteGroup(String id) async {
    await _dio.post('/api-org', data: {
      'action': 'deleteGroup',
      'groupId': id,
    });
  }

  // ── Students ──

  Future<List<dynamic>> getStudents() async {
    final res = await _dio.get('/api-org',
        queryParameters: {'action': 'students'});
    return (res.data is List) ? res.data : [];
  }

  // ── Schedule ──

  Future<List<dynamic>> getSchedule() async {
    final res = await _dio.get('/api-org',
        queryParameters: {'action': 'schedule'});
    return (res.data is List) ? res.data : [];
  }

  Future<void> createScheduleEvent(Map<String, dynamic> data) async {
    await _dio.post('/api-org', data: {
      'action': 'createScheduleEvent',
      ...data,
    });
  }

  Future<void> updateScheduleEvent(
      String id, Map<String, dynamic> data) async {
    await _dio.post('/api-org', data: {
      'action': 'updateScheduleEvent',
      'eventId': id,
      ...data,
    });
  }

  Future<void> deleteScheduleEvent(String id) async {
    await _dio.post('/api-org', data: {
      'action': 'deleteScheduleEvent',
      'eventId': id,
    });
  }

  // ── Journal (Attendance) ──

  Future<List<dynamic>> getJournal({String? groupId}) async {
    final params = <String, dynamic>{'action': 'journal'};
    if (groupId != null) params['groupId'] = groupId;
    final res = await _dio.get('/api-gradebook', queryParameters: params);
    return (res.data is List) ? res.data : [];
  }

  Future<List<dynamic>> getJournalByCourse({required String courseId}) async {
    final res = await _dio.get('/api-gradebook', queryParameters: {
      'action': 'journal',
      'courseId': courseId,
    });
    return (res.data is List) ? res.data : [];
  }

  Future<void> markAttendance(Map<String, dynamic> data) async {
    await _dio.post('/api-gradebook', data: {
      'action': 'markAttendance',
      ...data,
    });
  }

  // ── Gradebook (Grades) ──

  Future<List<dynamic>> getGrades({String? groupId}) async {
    final params = <String, dynamic>{'action': 'grades'};
    if (groupId != null) params['groupId'] = groupId;
    final res = await _dio.get('/api-gradebook', queryParameters: params);
    return (res.data is List) ? res.data : [];
  }

  Future<List<dynamic>> getGradesByCourse({required String courseId}) async {
    final res = await _dio.get('/api-gradebook', queryParameters: {
      'action': 'grades',
      'courseId': courseId,
    });
    return (res.data is List) ? res.data : [];
  }

  Future<void> setGrade(Map<String, dynamic> data) async {
    await _dio.post('/api-gradebook', data: {
      'action': 'setGrade',
      ...data,
    });
  }

  // ── Homework ──

  Future<List<dynamic>> getHomeworkSubmissions({String? status, String? orgId}) async {
    final params = <String, dynamic>{};
    if (orgId != null) params['orgId'] = orgId;
    if (status != null) params['status'] = status;
    final res = await _dio.get('/api-homework', queryParameters: params);
    return (res.data is List) ? res.data : [];
  }

  Future<void> gradeHomework(String submissionId, Map<String, dynamic> data) async {
    await _dio.put('/api-homework/$submissionId/grade', data: {
      'finalScore': data['grade'] ?? data['finalScore'] ?? 0,
      'feedback': data['feedback'] ?? '',
    });
  }

  // ── Notifications ──

  Future<List<dynamic>> getNotifications() async {
    final res = await _dio.get('/api-notifications');
    return (res.data is List) ? res.data : [];
  }

  Future<void> markAllNotificationsRead() async {
    await _dio.post('/api-notifications', data: {'action': 'markAllRead'});
  }

  Future<void> saveFcmToken(String token) async {
    await _dio.post('/api-notifications', data: {
      'action': 'saveFcmToken',
      'token': token,
    });
  }

  Future<void> removeFcmToken(String token) async {
    await _dio.post('/api-notifications', data: {
      'action': 'removeFcmToken',
      'token': token,
    });
  }

  Future<Map<String, dynamic>> getNotificationPreferences() async {
    final res = await _dio.get('/api-notifications', queryParameters: {'action': 'getPreferences'});
    return Map<String, dynamic>.from(res.data);
  }

  Future<void> saveNotificationPreferences(Map<String, dynamic> prefs) async {
    await _dio.post('/api-notifications', data: {
      'action': 'savePreferences',
      ...prefs,
    });
  }

  // ── Profile ──

  Future<Map<String, dynamic>> getTeacherProfile() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) throw Exception('Not authenticated');
    final res = await _dio.get('/api-users', queryParameters: {'uid': uid});
    return res.data;
  }

  Future<void> updateProfile(Map<String, dynamic> data) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) throw Exception('Not authenticated');
    // Backend expects PUT /api-users with uid in body
    await _dio.put('/api-users', data: {
      'uid': uid,
      ...data,
    });
  }

  // ── Invites ──

  Future<List<dynamic>> getPendingInvites() async {
    final res = await _dio.get('/api-org',
        queryParameters: {'action': 'myInvites'});
    return (res.data is List) ? res.data : [];
  }

  Future<void> respondInvite(String inviteId, bool accept) async {
    await _dio.post('/api-org', data: {
      'action': accept ? 'acceptInvite' : 'rejectInvite',
      'inviteId': inviteId,
    });
  }

  Future<void> acceptInvite(String userId, String organizationId) async {
    await _dio.post('/api-memberships', queryParameters: {
      'action': 'accept',
    }, data: {
      'userId': userId,
      'organizationId': organizationId,
    });
  }
}
