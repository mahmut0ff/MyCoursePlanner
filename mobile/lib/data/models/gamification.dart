/// Gamification data — maps to Firestore `gamification/{uid}`.
class GamificationData {
  final int xp;
  final int totalExams;
  final int passedExams;
  final int streak;
  final int bestStreak;
  final List<String> badges;
  final List<BadgeDetail> badgeDetails;
  final GamificationLevel level;

  const GamificationData({
    this.xp = 0,
    this.totalExams = 0,
    this.passedExams = 0,
    this.streak = 0,
    this.bestStreak = 0,
    this.badges = const [],
    this.badgeDetails = const [],
    this.level = const GamificationLevel(),
  });

  factory GamificationData.fromMap(Map<String, dynamic> data) {
    return GamificationData(
      xp: data['xp'] ?? 0,
      totalExams: data['totalExams'] ?? 0,
      passedExams: data['passedExams'] ?? 0,
      streak: data['streak'] ?? 0,
      bestStreak: data['bestStreak'] ?? 0,
      badges: List<String>.from(data['badges'] ?? []),
      badgeDetails: (data['badgeDetails'] as List<dynamic>?)
              ?.map((b) => BadgeDetail.fromMap(b))
              .toList() ??
          [],
      level: data['level'] != null
          ? GamificationLevel.fromMap(data['level'])
          : const GamificationLevel(),
    );
  }

  /// XP progress to next level (0.0 – 1.0).
  double get progressToNextLevel {
    if (level.nextLevelXp == null || level.nextLevelXp! <= 0) return 1.0;
    return (xp / level.nextLevelXp!).clamp(0.0, 1.0);
  }
}

/// Level info within gamification.
class GamificationLevel {
  final int level;
  final String title;
  final int xp;
  final int? nextLevelXp;
  final String? nextLevelTitle;

  const GamificationLevel({
    this.level = 1,
    this.title = 'Новичок',
    this.xp = 0,
    this.nextLevelXp = 100,
    this.nextLevelTitle,
  });

  factory GamificationLevel.fromMap(Map<String, dynamic> data) {
    return GamificationLevel(
      level: data['level'] ?? 1,
      title: data['title'] ?? 'Новичок',
      xp: data['xp'] ?? 0,
      nextLevelXp: data['nextLevelXp'],
      nextLevelTitle: data['nextLevelTitle'],
    );
  }
}

/// Badge detail info.
class BadgeDetail {
  final String id;
  final String icon;
  final String title;
  final String description;

  const BadgeDetail({
    required this.id,
    required this.icon,
    required this.title,
    this.description = '',
  });

  factory BadgeDetail.fromMap(Map<String, dynamic> data) {
    return BadgeDetail(
      id: data['id'] ?? '',
      icon: data['icon'] ?? '🎖️',
      title: data['title'] ?? '',
      description: data['description'] ?? '',
    );
  }
}
