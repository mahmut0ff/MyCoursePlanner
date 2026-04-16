/// Schedule event model — maps to Firestore `scheduleEvents/{id}`.
class ScheduleEvent {
  final String id;
  final String organizationId;
  final String? branchId;
  final String type; // lesson | exam | other
  final String title;
  final bool recurring;
  final int? dayOfWeek; // 0=Mon … 6=Sun
  final String? groupId;
  final String? groupName;
  final String? courseId;
  final String? courseName;
  final String? teacherId;
  final String? teacherName;
  final String? examId;
  final String? lessonId;
  final String? date; // YYYY-MM-DD
  final String startTime; // HH:mm
  final String endTime; // HH:mm
  final int duration; // minutes
  final String? location;
  final String? notes;

  const ScheduleEvent({
    required this.id,
    required this.organizationId,
    this.branchId,
    required this.type,
    required this.title,
    this.recurring = false,
    this.dayOfWeek,
    this.groupId,
    this.groupName,
    this.courseId,
    this.courseName,
    this.teacherId,
    this.teacherName,
    this.examId,
    this.lessonId,
    this.date,
    required this.startTime,
    required this.endTime,
    this.duration = 0,
    this.location,
    this.notes,
  });

  factory ScheduleEvent.fromMap(Map<String, dynamic> data) {
    return ScheduleEvent(
      id: data['id'] ?? '',
      organizationId: data['organizationId'] ?? '',
      branchId: data['branchId'],
      type: data['type'] ?? 'lesson',
      title: data['title'] ?? '',
      recurring: data['recurring'] ?? false,
      dayOfWeek: data['dayOfWeek'],
      groupId: data['groupId'],
      groupName: data['groupName'],
      courseId: data['courseId'],
      courseName: data['courseName'],
      teacherId: data['teacherId'],
      teacherName: data['teacherName'],
      examId: data['examId'],
      lessonId: data['lessonId'],
      date: data['date'],
      startTime: data['startTime'] ?? '',
      endTime: data['endTime'] ?? '',
      duration: data['duration'] ?? 0,
      location: data['location'],
      notes: data['notes'],
    );
  }

  bool get isExam => type == 'exam';
  bool get isLesson => type == 'lesson';

  /// Subtitle for event card.
  String get subtitle {
    final parts = <String>[];
    if (groupName != null && groupName!.isNotEmpty) parts.add(groupName!);
    if (location != null && location!.isNotEmpty) parts.add(location!);
    return parts.join(' • ');
  }
}
