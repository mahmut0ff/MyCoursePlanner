import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app.dart';
import '../../domain/providers/auth_provider.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _editingName = false;
  final _nameController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final profile = ref.watch(userProfileProvider).valueOrNull;
    final gamification = ref.watch(gamificationProvider).valueOrNull;
    final memberships = ref.watch(userMembershipsProvider).valueOrNull ?? [];

    final name = profile?.displayName ?? 'Студент';
    final email = profile?.email ?? '';
    final avatarUrl = profile?.avatarUrl;
    final xp = gamification?.xp ?? 0;
    final level = gamification?.level.level ?? 1;
    final streak = gamification?.streak ?? 0;
    final badges = gamification?.badges ?? [];
    final orgName = profile?.organizationName ?? '';
    final hasOrg = profile?.activeOrgId != null &&
        (profile?.activeOrgId?.isNotEmpty ?? false);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Профиль'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.push('/notifications'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(userProfileProvider);
          ref.invalidate(gamificationProvider);
          ref.invalidate(userMembershipsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ── Avatar & Info ──
            Center(
              child: Column(
                children: [
                  Stack(
                    children: [
                      CircleAvatar(
                        radius: 48,
                        backgroundColor:
                            theme.colorScheme.primary.withValues(alpha: 0.1),
                        backgroundImage:
                            avatarUrl != null && avatarUrl.isNotEmpty
                                ? NetworkImage(avatarUrl)
                                : null,
                        child: avatarUrl == null || avatarUrl.isEmpty
                            ? Text(
                                profile?.initials ?? '?',
                                style: TextStyle(
                                  fontSize: 36,
                                  fontWeight: FontWeight.w700,
                                  color: theme.colorScheme.primary,
                                ),
                              )
                            : null,
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                                color: theme.colorScheme.surface, width: 3),
                          ),
                          child: Text(
                            'Lv.$level',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Editable name
                  if (_editingName)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: 180,
                          child: TextField(
                            controller: _nameController,
                            autofocus: true,
                            textAlign: TextAlign.center,
                            decoration: const InputDecoration(
                              isDense: true,
                              contentPadding: EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 8),
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.check, color: Colors.green),
                          onPressed: _saveName,
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, color: Colors.red),
                          onPressed: () =>
                              setState(() => _editingName = false),
                        ),
                      ],
                    )
                  else
                    GestureDetector(
                      onTap: () {
                        _nameController.text = name;
                        setState(() => _editingName = true);
                      },
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            name,
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Icon(Icons.edit_outlined,
                              size: 16,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.3)),
                        ],
                      ),
                    ),
                  if (email.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      email,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.4),
                      ),
                    ),
                  ],
                  if (hasOrg && orgName.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary
                            .withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        orgName,
                        style: TextStyle(
                          color: theme.colorScheme.primary,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 24),

            // ── Stats Row ──
            Row(
              children: [
                _StatItem(value: '$xp', label: 'XP', icon: '⚡'),
                _StatItem(value: '$level', label: 'Уровень', icon: '🏆'),
                _StatItem(value: '$streak', label: 'Стрик', icon: '🔥'),
                _StatItem(
                    value: '${badges.length}',
                    label: 'Значки',
                    icon: '🎖️'),
              ],
            ),
            const SizedBox(height: 24),

            // ── Settings ──
            Text(
              'Настройки',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),

            // Theme toggle
            _SettingsTile(
              icon: Icons.dark_mode_outlined,
              title: 'Тема',
              subtitle: isDark ? 'Тёмная' : 'Светлая',
              trailing: Switch(
                value: isDark,
                onChanged: (_) {
                  ref.read(themeModeProvider.notifier).toggle();
                },
              ),
              onTap: () {
                ref.read(themeModeProvider.notifier).toggle();
              },
            ),

            // Organization switcher
            _SettingsTile(
              icon: Icons.business_outlined,
              title: 'Организация',
              subtitle: hasOrg ? orgName : 'Не выбрана',
              onTap: () => _showOrgSwitcher(context, ref),
            ),

            // Find new organization
            _SettingsTile(
              icon: Icons.search_rounded,
              title: 'Найти организацию',
              subtitle: 'Поиск и вступление',
              onTap: () => context.push('/org-search'),
            ),

            // Notifications
            _SettingsTile(
              icon: Icons.notifications_outlined,
              title: 'Уведомления',
              subtitle: 'Управление',
              onTap: () => context.push('/notifications'),
            ),

            // Support / feedback
            _SettingsTile(
              icon: Icons.help_outline_rounded,
              title: 'Помощь',
              subtitle: 'Связаться с поддержкой',
              onTap: () async {
                final uri = Uri.parse('https://t.me/planula_support');
                if (await canLaunchUrl(uri)) {
                  await launchUrl(uri,
                      mode: LaunchMode.externalApplication);
                }
              },
            ),

            // About
            FutureBuilder<PackageInfo>(
              future: PackageInfo.fromPlatform(),
              builder: (context, snap) {
                final version = snap.data?.version ?? '...';
                final build = snap.data?.buildNumber ?? '';
                return _SettingsTile(
                  icon: Icons.info_outline,
                  title: 'О приложении',
                  subtitle: 'Planula v$version${build.isNotEmpty ? '+$build' : ''}',
                  onTap: () => _showAbout(context, version),
                );
              },
            ),

            const SizedBox(height: 16),

            // ── Pending Invites ──
            if (memberships
                .where((m) => m.status == 'invited')
                .isNotEmpty) ...[
              Text(
                'Приглашения',
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              ...memberships
                  .where((m) => m.status == 'invited')
                  .map((m) => _InviteTile(
                        membership: m,
                        onAccept: () async {
                          try {
                            final api = ref.read(apiServiceProvider);
                            await api.acceptInvite(m.id);
                            ref.invalidate(userMembershipsProvider);
                            ref.invalidate(userProfileProvider);
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text('Приглашение принято!')),
                              );
                            }
                          } catch (e) {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Ошибка: $e')),
                              );
                            }
                          }
                        },
                      )),
              const SizedBox(height: 16),
            ],

            // ── Logout ──
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Выйти?'),
                      content: const Text(
                          'Вы уверены, что хотите выйти из аккаунта?'),
                      actions: [
                        TextButton(
                            onPressed: () => Navigator.pop(ctx, false),
                            child: const Text('Отмена')),
                        TextButton(
                            onPressed: () => Navigator.pop(ctx, true),
                            child: const Text('Выйти',
                                style: TextStyle(color: Colors.red))),
                      ],
                    ),
                  );
                  if (confirmed == true) {
                    await FirebaseAuth.instance.signOut();
                  }
                },
                icon: Icon(Icons.logout, color: theme.colorScheme.error),
                label: Text('Выйти',
                    style: TextStyle(color: theme.colorScheme.error)),
                style: OutlinedButton.styleFrom(
                  side: BorderSide(
                      color:
                          theme.colorScheme.error.withValues(alpha: 0.3)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Future<void> _saveName() async {
    final newName = _nameController.text.trim();
    if (newName.isEmpty) return;

    try {
      final repo = ref.read(userRepositoryProvider);
      final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
      await repo.updateProfile(uid, {'displayName': newName});
      await FirebaseAuth.instance.currentUser?.updateDisplayName(newName);
      ref.invalidate(userProfileProvider);
      setState(() => _editingName = false);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e')),
        );
      }
    }
  }

  void _showOrgSwitcher(BuildContext context, WidgetRef ref) {
    final memberships =
        ref.read(userMembershipsProvider).valueOrNull ?? [];
    final activeMemberships =
        memberships.where((m) => m.status == 'active').toList();
    final theme = Theme.of(context);

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Выбрать организацию',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            if (activeMemberships.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: Column(
                    children: [
                      const Text('Нет активных организаций'),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: () {
                          Navigator.pop(ctx);
                          context.push('/org-search');
                        },
                        child: const Text('Найти организацию'),
                      ),
                    ],
                  ),
                ),
              )
            else
              ...activeMemberships.map((m) => ListTile(
                    leading: CircleAvatar(
                      backgroundColor:
                          theme.colorScheme.primary.withValues(alpha: 0.1),
                      child: Text(
                        (m.organizationName ?? m.id)
                                .isNotEmpty
                            ? (m.organizationName ?? m.id)[0].toUpperCase()
                            : '?',
                        style: TextStyle(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    title: Text(m.organizationName ?? m.id),
                    subtitle: Text(m.role),
                    onTap: () async {
                      Navigator.pop(ctx);
                      try {
                        final api = ref.read(apiServiceProvider);
                        await api.switchOrg(m.id);
                        ref.invalidate(userProfileProvider);
                        ref.invalidate(gamificationProvider);
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Ошибка: $e')),
                          );
                        }
                      }
                    },
                  )),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _showAbout(BuildContext context, [String version = '1.0.0']) {
    showAboutDialog(
      context: context,
      applicationName: 'Planula',
      applicationVersion: version,
      applicationLegalese: '© 2024 Planula. Все права защищены.',
      children: [
        const SizedBox(height: 16),
        const Text(
          'Образовательная платформа для учебных центров.\n'
          'Курсы, экзамены, расписание — всё в одном месте.',
        ),
      ],
    );
  }
}

class _InviteTile extends StatelessWidget {
  final dynamic membership;
  final VoidCallback onAccept;

  const _InviteTile({required this.membership, required this.onAccept});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: const Color(0xFF6366F1).withValues(alpha: 0.2),
          ),
        ),
        child: Row(
          children: [
            Icon(Icons.mail_outline,
                color: theme.colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    membership.organizationName ?? 'Организация',
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  Text(
                    'Приглашение как ${membership.role}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface
                          .withValues(alpha: 0.5),
                    ),
                  ),
                ],
              ),
            ),
            ElevatedButton(
              onPressed: onAccept,
              style: ElevatedButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14),
                textStyle: const TextStyle(fontSize: 12),
              ),
              child: const Text('Принять'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String value;
  final String label;
  final String icon;

  const _StatItem({
    required this.value,
    required this.label,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: theme.colorScheme.outline.withValues(alpha: 0.1),
          ),
        ),
        child: Column(
          children: [
            Text(icon, style: const TextStyle(fontSize: 20)),
            const SizedBox(height: 6),
            Text(value,
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(label,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurface
                      .withValues(alpha: 0.5),
                )),
          ],
        ),
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Widget? trailing;

  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListTile(
      leading: Icon(icon, color: theme.colorScheme.primary),
      title: Text(title,
          style: const TextStyle(fontWeight: FontWeight.w500)),
      subtitle: Text(subtitle,
          style: TextStyle(
            color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
            fontSize: 13,
          )),
      trailing: trailing ??
          Icon(Icons.chevron_right_rounded,
              color: theme.colorScheme.onSurface
                  .withValues(alpha: 0.3)),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12)),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      onTap: onTap,
    );
  }
}
