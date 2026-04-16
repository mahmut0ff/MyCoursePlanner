import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/auth_provider.dart';

/// Branch indices for users without an active organization.
/// Maps to: Home (0) → Exams (2) → Profile (4).
const _noOrgBranches = [0, 2, 4];

/// Main scaffold shell with modern compact Bottom Navigation Bar.
/// Adapts tabs based on whether user has an active organization.
class MainShell extends ConsumerWidget {
  final StatefulNavigationShell navigationShell;

  const MainShell({super.key, required this.navigationShell});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final profile = ref.watch(userProfileProvider).valueOrNull;
    final hasOrg = profile?.activeOrgId != null &&
        (profile?.activeOrgId?.isNotEmpty ?? false);

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF0F172A) : Colors.white,
          border: Border(
            top: BorderSide(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.06)
                  : Colors.black.withValues(alpha: 0.06),
              width: 0.5,
            ),
          ),
          boxShadow: isDark
              ? null
              : [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.04),
                    blurRadius: 10,
                    offset: const Offset(0, -4),
                  ),
                ],
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: hasOrg ? _buildOrgTabs() : _buildNoOrgTabs(),
            ),
          ),
        ),
      ),
    );
  }

  /// Full 5-tab navigation for users with an active organization.
  List<Widget> _buildOrgTabs() {
    return [
      _NavItem(
        index: 0,
        current: navigationShell.currentIndex,
        icon: Icons.home_outlined,
        activeIcon: Icons.home_rounded,
        label: 'Главная',
        onTap: () => _goBranch(0),
      ),
      _NavItem(
        index: 1,
        current: navigationShell.currentIndex,
        icon: Icons.menu_book_outlined,
        activeIcon: Icons.menu_book_rounded,
        label: 'Курсы',
        onTap: () => _goBranch(1),
      ),
      _NavItem(
        index: 2,
        current: navigationShell.currentIndex,
        icon: Icons.quiz_outlined,
        activeIcon: Icons.quiz_rounded,
        label: 'Экзамены',
        onTap: () => _goBranch(2),
      ),
      _NavItem(
        index: 3,
        current: navigationShell.currentIndex,
        icon: Icons.calendar_month_outlined,
        activeIcon: Icons.calendar_month_rounded,
        label: 'Расписание',
        onTap: () => _goBranch(3),
      ),
      _NavItem(
        index: 4,
        current: navigationShell.currentIndex,
        icon: Icons.person_outline_rounded,
        activeIcon: Icons.person_rounded,
        label: 'Профиль',
        onTap: () => _goBranch(4),
      ),
    ];
  }

  /// Compact 3-tab navigation for users without an organization.
  /// Visual indices 0/1/2 map to shell branches 0/2/4.
  List<Widget> _buildNoOrgTabs() {
    // Convert the actual shell branch index to visual index (0–2)
    final visualCurrent =
        _noOrgBranches.indexOf(navigationShell.currentIndex).clamp(0, 2);

    return [
      _NavItem(
        index: 0,
        current: visualCurrent,
        icon: Icons.explore_outlined,
        activeIcon: Icons.explore_rounded,
        label: 'Обзор',
        onTap: () => _goBranch(_noOrgBranches[0]), // branch 0
      ),
      _NavItem(
        index: 1,
        current: visualCurrent,
        icon: Icons.quiz_outlined,
        activeIcon: Icons.quiz_rounded,
        label: 'Экзамены',
        onTap: () => _goBranch(_noOrgBranches[1]), // branch 2
      ),
      _NavItem(
        index: 2,
        current: visualCurrent,
        icon: Icons.person_outline_rounded,
        activeIcon: Icons.person_rounded,
        label: 'Профиль',
        onTap: () => _goBranch(_noOrgBranches[2]), // branch 4
      ),
    ];
  }

  void _goBranch(int branchIndex) {
    navigationShell.goBranch(
      branchIndex,
      initialLocation: branchIndex == navigationShell.currentIndex,
    );
  }
}

class _NavItem extends StatelessWidget {
  final int index;
  final int current;
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final VoidCallback onTap;

  const _NavItem({
    required this.index,
    required this.current,
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isActive = index == current;

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: EdgeInsets.symmetric(
                  horizontal: isActive ? 16 : 0,
                  vertical: 4,
                ),
                decoration: isActive
                    ? BoxDecoration(
                        color:
                            theme.colorScheme.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                      )
                    : null,
                child: Icon(
                  isActive ? activeIcon : icon,
                  size: 22,
                  color: isActive
                      ? theme.colorScheme.primary
                      : theme.colorScheme.onSurface.withValues(alpha: 0.45),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                  color: isActive
                      ? theme.colorScheme.primary
                      : theme.colorScheme.onSurface.withValues(alpha: 0.45),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
