/// User ↔ Organization membership.
/// Maps to Firestore `users/{uid}/memberships/{orgId}`.
class Membership {
  final String id; // organizationId
  final String? organizationName;
  final String role; // student | teacher | mentor | manager | admin | owner
  final String status; // pending | invited | active | left | removed
  final List<String> branchIds;
  final String? primaryBranchId;
  final String? joinedAt;

  const Membership({
    required this.id,
    this.organizationName,
    required this.role,
    this.status = 'active',
    this.branchIds = const [],
    this.primaryBranchId,
    this.joinedAt,
  });

  factory Membership.fromMap(String id, Map<String, dynamic> data) {
    return Membership(
      id: id,
      organizationName: data['organizationName'],
      role: data['role'] ?? 'student',
      status: data['status'] ?? 'active',
      branchIds: List<String>.from(data['branchIds'] ?? []),
      primaryBranchId: data['primaryBranchId'],
      joinedAt: data['joinedAt'],
    );
  }

  bool get isActive => status == 'active';
  bool get isStudent => role == 'student';
  bool get isStaff => ['teacher', 'mentor', 'manager', 'admin', 'owner'].contains(role);
}
