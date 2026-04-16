/// HomeworkSubmission model — maps to Firestore `homework_submissions/{id}`.
class HomeworkSubmission {
  final String id;
  final String lessonId;
  final String lessonTitle;
  final String? groupId;
  final String? groupName;
  final String studentId;
  final String studentName;
  final String organizationId;
  final String content;
  final List<HomeworkAttachment> attachments;
  final String status; // pending | reviewing | graded
  final HomeworkAIAnalysis? aiAnalysis;
  final String? teacherFeedback;
  final double? finalScore;
  final int maxPoints;
  final String? submittedAt;
  final String? gradedAt;
  final String? gradedBy;

  const HomeworkSubmission({
    required this.id,
    required this.lessonId,
    this.lessonTitle = '',
    this.groupId,
    this.groupName,
    this.studentId = '',
    this.studentName = '',
    this.organizationId = '',
    this.content = '',
    this.attachments = const [],
    this.status = 'pending',
    this.aiAnalysis,
    this.teacherFeedback,
    this.finalScore,
    this.maxPoints = 10,
    this.submittedAt,
    this.gradedAt,
    this.gradedBy,
  });

  factory HomeworkSubmission.fromMap(Map<String, dynamic> data) {
    return HomeworkSubmission(
      id: data['id'] ?? '',
      lessonId: data['lessonId'] ?? '',
      lessonTitle: data['lessonTitle'] ?? '',
      groupId: data['groupId'],
      groupName: data['groupName'],
      studentId: data['studentId'] ?? '',
      studentName: data['studentName'] ?? '',
      organizationId: data['organizationId'] ?? '',
      content: data['content'] ?? '',
      attachments: (data['attachments'] as List<dynamic>?)
              ?.map((a) => HomeworkAttachment.fromMap(a))
              .toList() ??
          [],
      status: data['status'] ?? 'pending',
      aiAnalysis: data['aiAnalysis'] != null
          ? HomeworkAIAnalysis.fromMap(data['aiAnalysis'])
          : null,
      teacherFeedback: data['teacherFeedback'],
      finalScore: (data['finalScore'] as num?)?.toDouble(),
      maxPoints: data['maxPoints'] ?? 10,
      submittedAt: data['submittedAt'],
      gradedAt: data['gradedAt'],
      gradedBy: data['gradedBy'],
    );
  }

  bool get isGraded => status == 'graded';
  bool get isPending => status == 'pending';
  bool get isEmpty => id.isEmpty;
}

/// Individual file attached to a homework submission
class HomeworkAttachment {
  final String url;
  final String type; // image | video | audio | archive | document
  final String name;
  final int size;

  const HomeworkAttachment({
    required this.url,
    this.type = 'document',
    this.name = '',
    this.size = 0,
  });

  factory HomeworkAttachment.fromMap(Map<String, dynamic> data) {
    return HomeworkAttachment(
      url: data['url'] ?? '',
      type: data['type'] ?? 'document',
      name: data['name'] ?? '',
      size: data['size'] ?? 0,
    );
  }

  Map<String, dynamic> toMap() => {
        'url': url,
        'type': type,
        'name': name,
        'size': size,
      };
}

/// AI grading analysis
class HomeworkAIAnalysis {
  final int grade;
  final String suggestions;
  final bool isPlagiarism;
  final int plagiarismProbability;

  const HomeworkAIAnalysis({
    this.grade = 0,
    this.suggestions = '',
    this.isPlagiarism = false,
    this.plagiarismProbability = 0,
  });

  factory HomeworkAIAnalysis.fromMap(Map<String, dynamic> data) {
    return HomeworkAIAnalysis(
      grade: data['grade'] ?? 0,
      suggestions: data['suggestions'] ?? '',
      isPlagiarism: data['isPlagiarism'] ?? false,
      plagiarismProbability: data['plagiarismProbability'] ?? 0,
    );
  }
}
