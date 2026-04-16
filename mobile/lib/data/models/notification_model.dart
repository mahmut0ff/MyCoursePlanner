/// App notification model — maps to Firestore `notifications/{id}`.
class AppNotification {
  final String id;
  final String recipientId;
  final String type;
  final String title;
  final String message;
  final String? link;
  final bool read;
  final String? createdAt;

  const AppNotification({
    required this.id,
    required this.recipientId,
    required this.type,
    required this.title,
    required this.message,
    this.link,
    this.read = false,
    this.createdAt,
  });

  factory AppNotification.fromMap(Map<String, dynamic> data) {
    return AppNotification(
      id: data['id'] ?? '',
      recipientId: data['recipientId'] ?? '',
      type: data['type'] ?? '',
      title: data['title'] ?? '',
      message: data['message'] ?? '',
      link: data['link'],
      read: data['read'] ?? false,
      createdAt: data['createdAt'],
    );
  }

  /// Icon mapping for notification types.
  String get emoji => switch (type) {
        'invite_received' => '📩',
        'added_to_group' => '👥',
        'exam_result_ready' => '📊',
        'new_lesson' => '📖',
        'homework_submitted' => '📝',
        'homework_graded' => '✅',
        'exam_room_created' => '🏠',
        _ => '🔔',
      };
}
