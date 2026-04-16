/// Group model — maps to Firestore `groups/{id}`.
class Group {
  final String id;
  final String organizationId;
  final String? branchId;
  final String courseId;
  final String? courseName;
  final String name;
  final List<String> studentIds;
  final List<String> teacherIds;
  final String? chatLinkTitle;
  final String? chatLinkUrl;
  final String? createdAt;
  final String? updatedAt;

  const Group({
    required this.id,
    required this.organizationId,
    this.branchId,
    required this.courseId,
    this.courseName,
    required this.name,
    this.studentIds = const [],
    this.teacherIds = const [],
    this.chatLinkTitle,
    this.chatLinkUrl,
    this.createdAt,
    this.updatedAt,
  });

  factory Group.fromMap(Map<String, dynamic> data) {
    return Group(
      id: data['id'] ?? '',
      organizationId: data['organizationId'] ?? '',
      branchId: data['branchId'],
      courseId: data['courseId'] ?? '',
      courseName: data['courseName'],
      name: data['name'] ?? '',
      studentIds: List<String>.from(data['studentIds'] ?? []),
      teacherIds: List<String>.from(data['teacherIds'] ?? []),
      chatLinkTitle: data['chatLinkTitle'],
      chatLinkUrl: data['chatLinkUrl'],
      createdAt: data['createdAt'],
      updatedAt: data['updatedAt'],
    );
  }

  int get studentCount => studentIds.length;

  /// Check if a user is enrolled.
  bool hasStudent(String uid) => studentIds.contains(uid);
}
