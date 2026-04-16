/// Planula user profile model.
/// Maps to Firestore `users/{uid}` document.
class UserProfile {
  final String uid;
  final String email;
  final String displayName;
  final String role;
  final String? activeOrgId;
  final String? organizationId;
  final String? organizationName;
  final String? avatarUrl;
  final String? bio;
  final List<String> skills;
  final List<String> pinnedBadges;
  final String? city;
  final String? country;
  final String? phone;
  final String? username;
  final String? parentPortalKey;
  final String? createdAt;
  final String? updatedAt;

  const UserProfile({
    required this.uid,
    required this.email,
    required this.displayName,
    this.role = 'student',
    this.activeOrgId,
    this.organizationId,
    this.organizationName,
    this.avatarUrl,
    this.bio,
    this.skills = const [],
    this.pinnedBadges = const [],
    this.city,
    this.country,
    this.phone,
    this.username,
    this.parentPortalKey,
    this.createdAt,
    this.updatedAt,
  });

  factory UserProfile.fromMap(String uid, Map<String, dynamic> data) {
    return UserProfile(
      uid: uid,
      email: data['email'] ?? '',
      displayName: data['displayName'] ?? '',
      role: data['role'] ?? 'student',
      activeOrgId: data['activeOrgId'],
      organizationId: data['organizationId'],
      organizationName: data['organizationName'],
      avatarUrl: data['avatarUrl'],
      bio: data['bio'],
      skills: List<String>.from(data['skills'] ?? []),
      pinnedBadges: List<String>.from(data['pinnedBadges'] ?? []),
      city: data['city'],
      country: data['country'],
      phone: data['phone'],
      username: data['username'],
      parentPortalKey: data['parentPortalKey'],
      createdAt: data['createdAt'],
      updatedAt: data['updatedAt'],
    );
  }

  Map<String, dynamic> toMap() => {
        'uid': uid,
        'email': email,
        'displayName': displayName,
        'role': role,
        'activeOrgId': activeOrgId,
        'avatarUrl': avatarUrl,
        'bio': bio,
        'skills': skills,
        'pinnedBadges': pinnedBadges,
        'city': city,
        'country': country,
        'phone': phone,
        'username': username,
        'updatedAt': DateTime.now().toIso8601String(),
      };

  /// Initials for avatar fallback.
  String get initials {
    if (displayName.isEmpty) return '?';
    final parts = displayName.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return displayName[0].toUpperCase();
  }
}
