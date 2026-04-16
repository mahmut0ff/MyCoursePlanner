import '../models/notification_model.dart';
import '../services/api_service.dart';

/// Repository for notification operations via Netlify API.
class NotificationRepository {
  final ApiService _api;

  NotificationRepository(this._api);

  /// Fetch all notifications for the current user (typed).
  Future<List<AppNotification>> getAll() async {
    final data = await _api.getNotifications();
    return data
        .cast<Map<String, dynamic>>()
        .map(AppNotification.fromMap)
        .toList();
  }

  /// Mark a notification as read.
  Future<void> markAsRead(String notificationId) async {
    await _api.markNotificationRead(notificationId);
  }
}
