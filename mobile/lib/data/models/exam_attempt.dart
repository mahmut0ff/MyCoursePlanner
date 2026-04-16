/// Exam attempt / result model — maps to Firestore `examAttempts/{id}`.
class ExamAttempt {
  final String id;
  final String examId;
  final String examTitle;
  final String? roomId;
  final String? roomCode;
  final String studentId;
  final String studentName;
  final int score;
  final int totalPoints;
  final double percentage;
  final bool passed;
  final int timeSpentSeconds;
  final int? cheatAttempts;
  final AIFeedback? aiFeedback;
  final List<QuestionResult> questionResults;
  final String? submittedAt;
  final String? createdAt;

  const ExamAttempt({
    required this.id,
    required this.examId,
    required this.examTitle,
    this.roomId,
    this.roomCode,
    required this.studentId,
    required this.studentName,
    this.score = 0,
    this.totalPoints = 0,
    this.percentage = 0,
    this.passed = false,
    this.timeSpentSeconds = 0,
    this.cheatAttempts,
    this.aiFeedback,
    this.questionResults = const [],
    this.submittedAt,
    this.createdAt,
  });

  factory ExamAttempt.fromMap(Map<String, dynamic> data) {
    return ExamAttempt(
      id: data['id'] ?? '',
      examId: data['examId'] ?? '',
      examTitle: data['examTitle'] ?? '',
      roomId: data['roomId'],
      roomCode: data['roomCode'],
      studentId: data['studentId'] ?? '',
      studentName: data['studentName'] ?? '',
      score: data['score'] ?? 0,
      totalPoints: data['totalPoints'] ?? 0,
      percentage: (data['percentage'] as num?)?.toDouble() ?? 0,
      passed: data['passed'] ?? false,
      timeSpentSeconds: data['timeSpentSeconds'] ?? 0,
      cheatAttempts: data['cheatAttempts'],
      aiFeedback: data['aiFeedback'] != null
          ? AIFeedback.fromMap(data['aiFeedback'])
          : null,
      questionResults: (data['questionResults'] as List<dynamic>?)
              ?.map((q) => QuestionResult.fromMap(q))
              .toList() ??
          [],
      submittedAt: data['submittedAt'],
      createdAt: data['createdAt'],
    );
  }

  /// Formatted percentage string.
  String get percentageText => '${percentage.round()}%';

  /// Duration in mm:ss format.
  String get durationText {
    final m = timeSpentSeconds ~/ 60;
    final s = timeSpentSeconds % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }
}

/// AI feedback after exam.
class AIFeedback {
  final List<String> strengths;
  final List<String> weakTopics;
  final List<String> reviewSuggestions;
  final String summary;
  final String? generatedAt;

  const AIFeedback({
    this.strengths = const [],
    this.weakTopics = const [],
    this.reviewSuggestions = const [],
    this.summary = '',
    this.generatedAt,
  });

  factory AIFeedback.fromMap(Map<String, dynamic> data) {
    return AIFeedback(
      strengths: List<String>.from(data['strengths'] ?? []),
      weakTopics: List<String>.from(data['weakTopics'] ?? []),
      reviewSuggestions: List<String>.from(data['reviewSuggestions'] ?? []),
      summary: data['summary'] ?? '',
      generatedAt: data['generatedAt'],
    );
  }
}

/// Individual question result.
class QuestionResult {
  final String questionId;
  final String questionText;
  final String type;
  final dynamic studentAnswer;
  final dynamic correctAnswer;
  final bool isCorrect;
  final int pointsEarned;
  final int pointsPossible;
  final String status; // correct | incorrect | pending_review

  const QuestionResult({
    required this.questionId,
    required this.questionText,
    this.type = '',
    this.studentAnswer,
    this.correctAnswer,
    this.isCorrect = false,
    this.pointsEarned = 0,
    this.pointsPossible = 0,
    this.status = 'incorrect',
  });

  factory QuestionResult.fromMap(Map<String, dynamic> data) {
    return QuestionResult(
      questionId: data['questionId'] ?? '',
      questionText: data['questionText'] ?? '',
      type: data['type'] ?? '',
      studentAnswer: data['studentAnswer'],
      correctAnswer: data['correctAnswer'],
      isCorrect: data['isCorrect'] ?? false,
      pointsEarned: data['pointsEarned'] ?? 0,
      pointsPossible: data['pointsPossible'] ?? 0,
      status: data['status'] ?? 'incorrect',
    );
  }
}
