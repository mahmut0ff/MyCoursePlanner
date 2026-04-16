/// LessonPlan model — maps to Firestore `lessonPlans/{id}`.
class LessonPlan {
  final String id;
  final String title;
  final String description;
  final String subject;
  final String level;
  final int duration;
  final List<String> tags;
  final String? coverImageUrl;
  final String? videoUrl;
  final dynamic content; // TipTap JSON content
  final String authorId;
  final String authorName;
  final String? organizationId;
  final String? branchId;
  final List<String> groupIds;
  final List<String> groupNames;
  final String status; // draft | published
  final LessonHomework? homework;
  final List<LessonAttachment> attachments;
  final String? createdAt;
  final String? updatedAt;

  const LessonPlan({
    required this.id,
    required this.title,
    this.description = '',
    this.subject = '',
    this.level = 'Beginner',
    this.duration = 30,
    this.tags = const [],
    this.coverImageUrl,
    this.videoUrl,
    this.content,
    this.authorId = '',
    this.authorName = '',
    this.organizationId,
    this.branchId,
    this.groupIds = const [],
    this.groupNames = const [],
    this.status = 'draft',
    this.homework,
    this.attachments = const [],
    this.createdAt,
    this.updatedAt,
  });

  factory LessonPlan.fromMap(Map<String, dynamic> data) {
    return LessonPlan(
      id: data['id'] ?? '',
      title: data['title'] ?? '',
      description: data['description'] ?? '',
      subject: data['subject'] ?? '',
      level: data['level'] ?? 'Beginner',
      duration: data['duration'] ?? 30,
      tags: List<String>.from(data['tags'] ?? []),
      coverImageUrl: data['coverImageUrl'],
      videoUrl: data['videoUrl'],
      content: data['content'],
      authorId: data['authorId'] ?? '',
      authorName: data['authorName'] ?? '',
      organizationId: data['organizationId'],
      branchId: data['branchId'],
      groupIds: List<String>.from(data['groupIds'] ?? []),
      groupNames: List<String>.from(data['groupNames'] ?? []),
      status: data['status'] ?? 'draft',
      homework: data['homework'] != null
          ? LessonHomework.fromMap(data['homework'])
          : null,
      attachments: (data['attachments'] as List<dynamic>?)
              ?.map((a) => LessonAttachment.fromMap(a))
              .toList() ??
          [],
      createdAt: data['createdAt'],
      updatedAt: data['updatedAt'],
    );
  }

  bool get isPublished => status == 'published';
  bool get hasHomework => homework != null && (homework!.title.isNotEmpty);
  bool get hasVideo => videoUrl != null && videoUrl!.isNotEmpty;
}

/// Homework definition inside a lesson
class LessonHomework {
  final String title;
  final String description;
  final String? dueDate;
  final int points;

  const LessonHomework({
    required this.title,
    this.description = '',
    this.dueDate,
    this.points = 0,
  });

  factory LessonHomework.fromMap(Map<String, dynamic> data) {
    return LessonHomework(
      title: data['title'] ?? '',
      description: data['description'] ?? '',
      dueDate: data['dueDate'],
      points: data['points'] ?? 0,
    );
  }
}

/// Attachment on a lesson
class LessonAttachment {
  final String id;
  final String name;
  final String url;
  final String? storagePath;
  final String type; // MIME type
  final int size;
  final String? uploadedAt;

  const LessonAttachment({
    required this.id,
    required this.name,
    required this.url,
    this.storagePath,
    this.type = 'application/octet-stream',
    this.size = 0,
    this.uploadedAt,
  });

  factory LessonAttachment.fromMap(Map<String, dynamic> data) {
    return LessonAttachment(
      id: data['id'] ?? '',
      name: data['name'] ?? '',
      url: data['url'] ?? '',
      storagePath: data['storagePath'],
      type: data['type'] ?? 'application/octet-stream',
      size: data['size'] ?? 0,
      uploadedAt: data['uploadedAt'],
    );
  }

  bool get isImage => type.startsWith('image/');
  bool get isVideo => type.startsWith('video/');
  bool get isPdf => type == 'application/pdf';
}
