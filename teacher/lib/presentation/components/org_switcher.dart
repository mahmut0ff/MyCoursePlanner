import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/providers.dart';

class OrgSwitcher extends ConsumerWidget {
  const OrgSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final membershipsAsync = ref.watch(membershipsProvider);
    final profileAsync = ref.watch(userProfileProvider);
    final theme = Theme.of(context);

    return profileAsync.when(
      data: (profile) {
        if (profile == null) return const SizedBox.shrink();

        final currentOrgId = profile['activeOrgId'] ?? profile['organizationId'];

        return membershipsAsync.when(
          data: (memberships) {
            String currentTitle = 'Личное пространство';
            String currentRole = 'Независимый профиль';
            if (currentOrgId != null) {
              final activeMem = memberships.cast<Map<String, dynamic>>().firstWhere(
                    (m) => m['organizationId'] == currentOrgId,
                    orElse: () => {},
                  );
              currentTitle = activeMem['organizationName'] ?? currentOrgId;
              currentRole = activeMem['role'] ?? 'teacher';
            }

            return GestureDetector(
              onTap: () => _showSwitchSheet(context, ref, memberships, currentOrgId),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        currentOrgId != null ? Icons.business_rounded : Icons.folder_shared_rounded,
                        size: 16,
                        color: theme.colorScheme.onPrimaryContainer,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Flexible(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            currentTitle,
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            currentRole,
                            style: TextStyle(
                              fontSize: 11,
                              color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(Icons.unfold_more, size: 18, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                  ],
                ),
              ),
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => const Text('Error'),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => const SizedBox.shrink(),
    );
  }
}

void _showSwitchSheet(BuildContext context, WidgetRef ref, List<dynamic> memberships, String? currentOrgId) {
  final theme = Theme.of(context);
  final activeMemberships = memberships
      .cast<Map<String, dynamic>>()
      .where((m) => m['status'] == 'active')
      .toList();

  showModalBottomSheet(
    context: context,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (ctx) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 16),
            const Text('Выберите пространство', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
            const SizedBox(height: 16),

            // Personal space
            _OrgTile(
              icon: Icons.folder_shared_rounded,
              title: 'Личное пространство',
              subtitle: 'Независимый профиль',
              isSelected: currentOrgId == null,
              onTap: () => _switchTo(ctx, ref, 'personal', currentOrgId),
            ),

            if (activeMemberships.isNotEmpty) ...[
              const SizedBox(height: 8),
              Divider(color: theme.colorScheme.outline.withValues(alpha: 0.1)),
              const SizedBox(height: 4),
            ],

            // Org list
            ...activeMemberships.map((mm) {
              final orgId = mm['organizationId'] as String;
              return Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: _OrgTile(
                  icon: Icons.business_rounded,
                  title: mm['organizationName'] ?? orgId,
                  subtitle: mm['role'] ?? 'teacher',
                  isSelected: currentOrgId == orgId,
                  onTap: () => _switchTo(ctx, ref, orgId, currentOrgId),
                ),
              );
            }),

            const SizedBox(height: 8),
            Divider(color: theme.colorScheme.outline.withValues(alpha: 0.1)),
            const SizedBox(height: 4),

            // Find org
            ListTile(
              leading: Icon(Icons.search, color: theme.colorScheme.primary),
              title: Text('Найти организацию', style: TextStyle(fontWeight: FontWeight.w600, color: theme.colorScheme.primary)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              onTap: () {
                Navigator.pop(ctx);
                context.push('/directory');
              },
            ),
          ],
        ),
      );
    },
  );
}

Future<void> _switchTo(BuildContext ctx, WidgetRef ref, String orgId, String? currentOrgId) async {
  if (orgId == currentOrgId || (orgId == 'personal' && currentOrgId == null)) {
    Navigator.pop(ctx);
    return;
  }

  Navigator.pop(ctx);

  try {
    final api = ref.read(apiServiceProvider);
    await api.switchOrg(orgId);

    ref.invalidate(userProfileProvider);
    ref.invalidate(dashboardProvider);
    ref.invalidate(coursesProvider);
    ref.invalidate(examsProvider);
    ref.invalidate(scheduleProvider);
    ref.invalidate(studentsProvider);
    ref.invalidate(membershipsProvider);
  } catch (e) {
    if (ctx.mounted) {
      ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text('Ошибка переключения: $e')));
    }
  }
}

class _OrgTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool isSelected;
  final VoidCallback onTap;

  const _OrgTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListTile(
      leading: Container(
        width: 40, height: 40,
        decoration: BoxDecoration(
          color: isSelected
              ? theme.colorScheme.primary.withValues(alpha: 0.1)
              : theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, size: 20, color: isSelected ? theme.colorScheme.primary : theme.colorScheme.onSurface.withValues(alpha: 0.5)),
      ),
      title: Text(title, style: TextStyle(fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500, fontSize: 15)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 11, color: Colors.grey)),
      trailing: isSelected
          ? Icon(Icons.check_circle, color: theme.colorScheme.primary, size: 22)
          : null,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      tileColor: isSelected ? theme.colorScheme.primary.withValues(alpha: 0.04) : null,
      onTap: onTap,
    );
  }
}
