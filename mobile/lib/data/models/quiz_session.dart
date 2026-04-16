class QuizSession {
  final String id;
  final String quizTitle;
  final String status; // 'lobby' | 'in_progress' | 'paused' | 'completed' | 'cancelled'
  final int currentQuestionIndex;
  final int totalQuestions;
  final String? organizationId;
  final int participantCount;

  QuizSession({
    required this.id,
    this.quizTitle = '',
    this.status = 'lobby',
    this.currentQuestionIndex = -1,
    this.totalQuestions = 0,
    this.organizationId,
    this.participantCount = 0,
  });

  factory QuizSession.fromMap(String id, Map<String, dynamic> data) {
    return QuizSession(
      id: id,
      quizTitle: data['quizTitle'] ?? '',
      status: data['status'] ?? 'lobby',
      currentQuestionIndex: data['currentQuestionIndex'] ?? -1,
      totalQuestions: data['totalQuestions'] ?? 0,
      organizationId: data['organizationId'],
      participantCount: data['participantCount'] ?? 0,
    );
  }
}

class SessionParticipant {
  final String id;
  final String participantId;
  final String participantName;
  final String? avatarUrl;
  final List<String> pinnedBadges;
  final int score;
  final int correctCount;
  final int streakBest;
  final int? rank;

  SessionParticipant({
    required this.id,
    required this.participantId,
    this.participantName = '',
    this.avatarUrl,
    this.pinnedBadges = const [],
    this.score = 0,
    this.correctCount = 0,
    this.streakBest = 0,
    this.rank,
  });

  factory SessionParticipant.fromMap(String id, Map<String, dynamic> data) {
    return SessionParticipant(
      id: id,
      participantId: data['participantId'] ?? '',
      participantName: data['participantName'] ?? '',
      avatarUrl: data['avatarUrl'],
      pinnedBadges: List<String>.from(data['pinnedBadges'] ?? []),
      score: data['score'] ?? 0,
      correctCount: data['correctCount'] ?? 0,
      streakBest: data['streakBest'] ?? 0,
      rank: data['rank'],
    );
  }
}
