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

  // ── Organizations (public) ──

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

  // ── Memberships ──

  Future<List<dynamic>> getMyMemberships() async {
    final res = await _dio.get('/api-memberships',
        queryParameters: {'action': 'myMemberships'});
    return (res.data is List) ? res.data : [];
  }

  Future<Map<String, dynamic>> applyToOrg(String orgId) async {
    final res = await _dio.post('/api-memberships',
        queryParameters: {'action': 'apply'},
        data: {
          'organizationId': orgId,
          'role': 'student',
        });
    return res.data;
  }

  Future<Map<String, dynamic>> publicJoinOrg(String slug) async {
    final res = await _dio.post('/api-memberships',
        queryParameters: {'action': 'publicJoin'},
        data: {
          'orgSlug': slug,
        });
    return res.data;
  }

  Future<Map<String, dynamic>> acceptInvite(String orgId) async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    final res = await _dio.post('/api-memberships',
        queryParameters: {'action': 'accept'},
        data: {
          'userId': uid,
          'organizationId': orgId,
        });
    return res.data;
  }

  // ── Users ──

  Future<void> switchOrg(String orgId) async {
    await _dio.post('/api-memberships',
        queryParameters: {'action': 'switchOrg'},
        data: {
          'organizationId': orgId,
        });
  }

  Future<void> saveFcmToken(String token) async {
    await _dio.post('/api-users',
        queryParameters: {'action': 'saveFcmToken'},
        data: {
          'token': token,
        });
  }

  Future<void> removeFcmToken(String token) async {
    await _dio.post('/api-users',
        queryParameters: {'action': 'removeFcmToken'},
        data: {
          'token': token,
        });
  }

  // ── Courses & Groups ──

  Future<List<dynamic>> getCourses() async {
    final res =
        await _dio.get('/api-org', queryParameters: {'action': 'courses'});
    return (res.data is List) ? res.data : [];
  }

  Future<Map<String, dynamic>> getCourse(String id) async {
    final res = await _dio
        .get('/api-org', queryParameters: {'action': 'course', 'id': id});
    return res.data;
  }

  Future<List<dynamic>> getGroups({String? courseId}) async {
    final params = <String, dynamic>{'action': 'groups'};
    if (courseId != null) params['courseId'] = courseId;
    final res = await _dio.get('/api-org', queryParameters: params);
    return (res.data is List) ? res.data : [];
  }

  Future<Map<String, dynamic>> enrollInGroup(String groupId) async {
    final res = await _dio.post('/api-org',
        queryParameters: {'action': 'enrollInGroup'},
        data: {
          'groupId': groupId,
        });
    return res.data;
  }

  Future<Map<String, dynamic>> enrollInCourse(String courseId) async {
    final res = await _dio.post('/api-org',
        queryParameters: {'action': 'enrollInCourse'},
        data: {
          'courseId': courseId,
        });
    return res.data;
  }

  // ── Schedule ──

  Future<List<dynamic>> getSchedule(
      {String? from, String? to, String? mode}) async {
    final params = <String, dynamic>{'action': 'schedule'};
    if (from != null) params['from'] = from;
    if (to != null) params['to'] = to;
    if (mode != null) params['mode'] = mode;
    final res = await _dio.get('/api-org', queryParameters: params);
    return (res.data is List) ? res.data : [];
  }

  // ── Dashboard ──

  Future<Map<String, dynamic>> getDashboard() async {
    final res = await _dio.get('/api-dashboard');
    return res.data;
  }

  // ── Exams ──

  Future<Map<String, dynamic>> getExam(String examId) async {
    final res =
        await _dio.get('/api-exams', queryParameters: {'id': examId});
    return res.data;
  }

  // ── Exam Rooms ──

  Future<Map<String, dynamic>> getRoomByCode(String code) async {
    final res = await _dio
        .get('/api-rooms', queryParameters: {'code': code.toUpperCase()});
    return res.data;
  }

  Future<Map<String, dynamic>> joinRoom(String roomId) async {
    final res = await _dio.post('/api-rooms', data: {
      'action': 'join',
      'roomId': roomId,
    });
    return res.data;
  }

  // ── Exam Attempts ──

  Future<List<dynamic>> getMyAttempts() async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    final res = await _dio
        .get('/api-attempts', queryParameters: {'studentId': uid});
    return (res.data is List) ? res.data : [];
  }

  Future<Map<String, dynamic>> getAttemptDetail(String attemptId) async {
    final res =
        await _dio.get('/api-attempts', queryParameters: {'id': attemptId});
    return res.data;
  }

  Future<Map<String, dynamic>> submitExam(
      Map<String, dynamic> payload) async {
    final res = await _dio.post('/api-attempts', data: payload);
    return res.data;
  }

  // ── Gamification ──

  Future<Map<String, dynamic>> getGamification() async {
    final res = await _dio.get('/api-gamification',
        queryParameters: {'action': 'getMyStats'});
    return res.data;
  }

  // ── Notifications ──

  Future<List<dynamic>> getNotifications() async {
    final res = await _dio.get('/api-notifications',
        queryParameters: {'action': 'getAll'});
    return res.data['notifications'] ?? [];
  }

  Future<void> markNotificationRead(String id) async {
    await _dio.post('/api-notifications',
        queryParameters: {'action': 'markRead'},
        data: {'notificationId': id});
  }

  // ── Live Quizzes (Kahoot-style) ──

  Future<Map<String, dynamic>> getQuizSessionByCode(String code) async {
    final res = await _dio.get('/api-quiz-sessions',
        queryParameters: {'code': code.toUpperCase()});
    return res.data;
  }

  Future<Map<String, dynamic>> joinQuizSession(String sessionId) async {
    final res = await _dio.post('/api-quiz-sessions', data: {
      'action': 'join',
      'sessionId': sessionId,
    });
    return res.data;
  }

  Future<Map<String, dynamic>> getQuizSession(String sessionId) async {
    final res = await _dio.get('/api-quiz-sessions',
        queryParameters: {'id': sessionId});
    return res.data;
  }

  Future<Map<String, dynamic>> submitQuizAnswer(
      Map<String, dynamic> payload) async {
    final res = await _dio.post('/api-quiz-answers', data: {
      'action': 'submit',
      ...payload,
    });
    return res.data;
  }

  // ── Lessons ──

  Future<List<dynamic>> getLessons({String? groupId}) async {
    final params = <String, dynamic>{};
    if (groupId != null) params['groupId'] = groupId;
    final res = await _dio.get('/api-lessons', queryParameters: params);
    return (res.data is List) ? res.data : [];
  }

  Future<Map<String, dynamic>> getLesson(String id) async {
    final res =
        await _dio.get('/api-lessons', queryParameters: {'id': id});
    return res.data;
  }

  // ── Homework ──

  Future<Map<String, dynamic>> getMyHomework(String lessonId) async {
    final res = await _dio.get('/api-homework',
        queryParameters: {'lessonId': lessonId});
    return res.data;
  }

  Future<Map<String, dynamic>> submitHomework(
      Map<String, dynamic> payload) async {
    final res = await _dio.post('/api-homework', data: payload);
    return res.data;
  }

  // ── Gamification ──

  Future<Map<String, dynamic>> awardXP(Map<String, dynamic> payload) async {
    final res = await _dio.post('/api-gamification', data: payload);
    return res.data;
  }

  // ── Gradebook (Diary) ──

  Future<List<dynamic>> getGrades({String? courseId}) async {
    final params = <String, String>{'action': 'grades'};
    if (courseId != null) params['courseId'] = courseId;
    final res = await _dio.get('/api-gradebook', queryParameters: params);
    return (res.data is List) ? res.data : [];
  }

  Future<List<dynamic>> getJournal({String? courseId}) async {
    final params = <String, String>{'action': 'journal'};
    if (courseId != null) params['courseId'] = courseId;
    final res = await _dio.get('/api-gradebook', queryParameters: params);
    return (res.data is List) ? res.data : [];
  }
}
