import '../models/course.dart';
import '../models/group.dart';
import '../models/schedule_event.dart';
import '../services/api_service.dart';

/// Repository for course, group, and schedule data via Netlify API.
class CourseRepository {
  final ApiService _api;

  CourseRepository(this._api);

  /// Fetch all courses for current org.
  Future<List<Course>> getCourses() async {
    final data = await _api.getCourses();
    return data
        .cast<Map<String, dynamic>>()
        .map(Course.fromMap)
        .toList();
  }

  /// Fetch single course.
  Future<Course> getCourse(String id) async {
    final data = await _api.getCourse(id);
    return Course.fromMap(data);
  }

  /// Fetch groups, optionally filtered by courseId.
  Future<List<Group>> getGroups({String? courseId}) async {
    final data = await _api.getGroups(courseId: courseId);
    return data
        .cast<Map<String, dynamic>>()
        .map(Group.fromMap)
        .toList();
  }

  /// Fetch schedule events for a date range.
  Future<List<ScheduleEvent>> getSchedule({
    String? from,
    String? to,
    String? mode,
  }) async {
    final data = await _api.getSchedule(from: from, to: to, mode: mode);
    return data
        .cast<Map<String, dynamic>>()
        .map(ScheduleEvent.fromMap)
        .toList();
  }

  /// Enroll student in a group.
  Future<void> enrollInGroup(String groupId) async {
    await _api.enrollInGroup(groupId);
  }

  /// Request enrollment in a course.
  Future<void> enrollInCourse(String courseId) async {
    await _api.enrollInCourse(courseId);
  }
}
