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

            return PopupMenuButton<String>(
              color: theme.colorScheme.surface,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              position: PopupMenuPosition.under,
              onSelected: (val) async {
                if (val == 'find') {
                  context.push('/directory');
                  return;
                }
                if (val == currentOrgId || (val == 'personal' && currentOrgId == null)) return;
                
                showDialog(
                  context: context,
                  barrierDismissible: false,
                  builder: (C) => const Center(child: CircularProgressIndicator()),
                );
                
                try {
                  final api = ref.read(apiServiceProvider);
                  await api.switchOrg(val);
                  
                  // Invalidate user profile and all lists
                  ref.invalidate(userProfileProvider);
                  ref.invalidate(dashboardProvider);
                  ref.invalidate(coursesProvider);
                  ref.invalidate(examsProvider);
                  ref.invalidate(scheduleProvider);
                  ref.invalidate(studentsProvider);
                  ref.invalidate(membershipsProvider);
                  
                  if (context.mounted) context.pop(); // close loading dialog
                } catch (e) {
                  if (context.mounted) {
                    context.pop();
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка переключения: $e')));
                  }
                }
              },
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
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          currentTitle,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
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
                    const SizedBox(width: 8),
                    Icon(Icons.keyboard_arrow_down, size: 18, color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                  ],
                ),
              ),
              itemBuilder: (context) {
                final items = <PopupMenuEntry<String>>[];
                
                items.add(const PopupMenuItem(
                   enabled: false,
                   child: Text('ПРОСТРАНСТВО', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey)),
                ));
                
                items.add(PopupMenuItem<String>(
                  value: 'personal',
                  child: Row(
                    children: [
                      const Icon(Icons.folder_shared_rounded, size: 20),
                      const SizedBox(width: 12),
                      const Expanded(child: Text('Личное пространство')),
                      if (currentOrgId == null) const Icon(Icons.check, color: Colors.green, size: 18),
                    ],
                  ),
                ));
                
                if (memberships.isNotEmpty) {
                  items.add(const PopupMenuDivider());
                  items.add(const PopupMenuItem(
                     enabled: false,
                     child: Text('ОРГАНИЗАЦИИ', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey)),
                  ));
                  
                  for (final mem in memberships) {
                         final mm = mem as Map<String, dynamic>;
                         if (mm['status'] != 'active') continue;
                         
                         final orgId = mm['organizationId'] as String;
                         items.add(PopupMenuItem<String>(
                           value: orgId,
                           child: Row(
                             children: [
                               const Icon(Icons.business_rounded, size: 20),
                               const SizedBox(width: 12),
                               Expanded(
                                 child: Column(
                                   crossAxisAlignment: CrossAxisAlignment.start,
                                   children: [
                                     Text(mm['organizationName'] ?? orgId),
                                     Text(mm['role'] ?? 'teacher', style: const TextStyle(fontSize: 10, color: Colors.grey)),
                                   ],
                                 ),
                               ),
                               if (currentOrgId == orgId) const Icon(Icons.check, color: Colors.green, size: 18),
                             ],
                           ),
                         ));
                  }
                }
                
                items.add(const PopupMenuDivider());
                items.add(PopupMenuItem<String>(
                  value: 'find',
                  child: Row(
                    children: [
                      Icon(Icons.search, size: 20, color: theme.colorScheme.primary),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text('Найти организацию', style: TextStyle(color: theme.colorScheme.primary, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ));
                
                return items;
              },
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
