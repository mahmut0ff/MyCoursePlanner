import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../domain/providers/providers.dart';


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
    final profileAsync = ref.watch(userProfileProvider);
    final membershipsAsync = ref.watch(membershipsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Профиль')),
      body: profileAsync.when(
        data: (profile) {
          if (profile == null) return const Center(child: Text('Профиль не найден'));

          final name = profile['displayName'] ?? 'Преподаватель';
          final email = profile['email'] ?? '';
          final photoURL = profile['avatarUrl'] ?? profile['photoURL'] ?? FirebaseAuth.instance.currentUser?.photoURL ?? '';
          final phone = profile['phone'] ?? '';
          final bio = profile['bio'] ?? '';
          final role = profile['role'] ?? 'teacher';
          final orgName = profile['organizationName'] ?? '';
          final initials = name.isNotEmpty ? name[0].toUpperCase() : '?';
          final dashData = ref.watch(dashboardProvider).valueOrNull ?? {};

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(userProfileProvider);
              ref.invalidate(membershipsProvider);
            },
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                // ── Avatar & Info ──
                Center(
                  child: Column(
                    children: [
                      Stack(
                        children: [
                          CircleAvatar(
                            radius: 50,
                            backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                            backgroundImage: photoURL.toString().isNotEmpty ? NetworkImage(photoURL.toString()) : null,
                            child: photoURL.toString().isEmpty
                                ? Text(initials, style: TextStyle(fontSize: 36, fontWeight: FontWeight.w700, color: theme.colorScheme.primary))
                                : null,
                          ),
                          Positioned(
                            bottom: 0, right: 0,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.primary,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: theme.colorScheme.surface, width: 3),
                              ),
                              child: Text(
                                role == 'admin' ? 'Admin' : role == 'owner' ? 'Owner' : 'Teacher',
                                style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800),
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
                              width: 200,
                              child: TextField(
                                controller: _nameController,
                                autofocus: true,
                                textAlign: TextAlign.center,
                                decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
                              ),
                            ),
                            IconButton(icon: const Icon(Icons.check, color: Colors.green), onPressed: _saveName),
                            IconButton(icon: const Icon(Icons.close, color: Colors.red), onPressed: () => setState(() => _editingName = false)),
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
                              Text(name, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                              const SizedBox(width: 6),
                              Icon(Icons.edit_outlined, size: 16, color: theme.colorScheme.onSurface.withValues(alpha: 0.3)),
                            ],
                          ),
                        ),
                      if (email.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(email, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.4))),
                      ],
                      if (phone.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(phone, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurface.withValues(alpha: 0.4))),
                      ],
                      if (orgName.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(orgName, style: TextStyle(color: theme.colorScheme.primary, fontSize: 12, fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // ── Stats Row ──
                Row(
                  children: [
                    _StatItem(value: '${dashData['lessonsCount'] ?? 0}', label: 'Уроков', iconData: Icons.auto_stories_outlined, color: const Color(0xFF7C3AED)),
                    _StatItem(value: '${dashData['examsCount'] ?? 0}', label: 'Экзаменов', iconData: Icons.quiz_outlined, color: const Color(0xFF10B981)),
                    _StatItem(value: '${dashData['activeRoomsCount'] ?? 0}', label: 'Комнат', iconData: Icons.meeting_room_outlined, color: const Color(0xFFF59E0B)),
                  ],
                ),
                const SizedBox(height: 28),

                // ── Настройки ──
                Text('Настройки', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),

                _SettingsTile(
                  icon: Icons.edit_outlined,
                  title: 'Редактировать профиль',
                  subtitle: 'Фото, имя, телефон, био',
                  onTap: () => _showEditProfile(context, profile),
                ),

                _SettingsTile(
                  icon: Icons.business_outlined,
                  title: 'Организация',
                  subtitle: orgName.isNotEmpty ? orgName : 'Не выбрана',
                  onTap: () => _showOrgSwitcher(context, ref),
                ),

                _SettingsTile(
                  icon: Icons.search_rounded,
                  title: 'Найти организацию',
                  subtitle: 'Поиск и вступление',
                  onTap: () => context.push('/directory'),
                ),

                _SettingsTile(
                  icon: Icons.notifications_outlined,
                  title: 'Уведомления',
                  subtitle: 'Настройки оповещений',
                  onTap: () => _showNotificationSettings(context),
                ),

                _SettingsTile(
                  icon: Icons.help_outline_rounded,
                  title: 'Помощь',
                  subtitle: 'Связаться с поддержкой',
                  onTap: () async {
                    final uri = Uri.parse('https://t.me/planula_support');
                    if (await canLaunchUrl(uri)) {
                      await launchUrl(uri, mode: LaunchMode.externalApplication);
                    }
                  },
                ),

                _SettingsTile(
                  icon: Icons.info_outline,
                  title: 'О приложении',
                  subtitle: 'Planula Senior v1.0.0',
                  onTap: () => _showAbout(context),
                ),

                _SettingsTile(
                  icon: Icons.gavel_outlined,
                  title: 'Правовая информация',
                  subtitle: 'Лицензии и соглашения',
                  onTap: () => context.push('/licenses'),
                ),

                const SizedBox(height: 24),

                // ── Pending Invites ──
                membershipsAsync.when(
                  data: (memberships) {
                    final pending = memberships.where((m) => m['status'] == 'invited').toList();
                    if (pending.isEmpty) return const SizedBox.shrink();
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Приглашения', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 10),
                        ...pending.map((m) => Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: theme.colorScheme.primary.withValues(alpha: 0.2)),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.mail_outline, color: theme.colorScheme.primary),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(m['organizationName'] ?? 'Организация', style: const TextStyle(fontWeight: FontWeight.w600)),
                                    Text('Приглашение как ${m['role'] ?? 'teacher'}', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                                  ],
                                ),
                              ),
                              FilledButton(
                                onPressed: () async {
                                  try {
                                    final api = ref.read(apiServiceProvider);
                                    await api.acceptInvite(m['userId'] ?? '', m['organizationId'] ?? '');
                                    ref.invalidate(membershipsProvider);
                                    ref.invalidate(userProfileProvider);
                                    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Приглашение принято!')));
                                  } catch (e) {
                                    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
                                  }
                                },
                                child: const Text('Принять'),
                              ),
                            ],
                          ),
                        )),
                        const SizedBox(height: 16),
                      ],
                    );
                  },
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                ),

                // ── Logout ──
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      final confirmed = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: const Text('Выйти?'),
                          content: const Text('Вы уверены, что хотите выйти из аккаунта?'),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
                            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Выйти', style: TextStyle(color: Colors.red))),
                          ],
                        ),
                      );
                      if (confirmed == true) {
                        // Remove FCM token before signing out
                        try {
                          final token = await FirebaseMessaging.instance.getToken();
                          if (token != null) {
                            final api = ref.read(apiServiceProvider);
                            await api.removeFcmToken(token);
                          }
                        } catch (_) {} // best-effort
                        await FirebaseAuth.instance.signOut();
                        if (context.mounted) context.go('/login');
                      }
                    },
                    icon: Icon(Icons.logout, color: theme.colorScheme.error),
                    label: Text('Выйти', style: TextStyle(color: theme.colorScheme.error)),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: theme.colorScheme.error.withValues(alpha: 0.3)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(child: Text('Ошибка загрузки: $err')),
      ),
    );
  }

  Future<void> _saveName() async {
    final newName = _nameController.text.trim();
    if (newName.isEmpty) return;
    try {
      final api = ref.read(apiServiceProvider);
      await api.updateProfile({'displayName': newName});
      await FirebaseAuth.instance.currentUser?.updateDisplayName(newName);
      ref.invalidate(userProfileProvider);
      setState(() => _editingName = false);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
    }
  }

  void _showEditProfile(BuildContext context, Map<String, dynamic> profile) {
    final theme = Theme.of(context);
    final nameC = TextEditingController(text: profile['displayName'] ?? '');
    final phoneC = TextEditingController(text: profile['phone'] ?? '');
    final bioC = TextEditingController(text: profile['bio'] ?? '');
    final avatarC = TextEditingController(text: profile['avatarUrl'] ?? profile['photoURL'] ?? '');
    bool loading = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2))),
                ),
                const SizedBox(height: 20),
                Text('Редактировать профиль', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 20),
                TextField(controller: nameC, decoration: const InputDecoration(labelText: 'Имя', prefixIcon: Icon(Icons.person_outline))),
                const SizedBox(height: 14),
                TextField(controller: phoneC, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Телефон', prefixIcon: Icon(Icons.phone_outlined))),
                const SizedBox(height: 14),
                TextField(controller: avatarC, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'URL фото профиля', prefixIcon: Icon(Icons.image_outlined), hintText: 'https://...')),
                const SizedBox(height: 14),
                TextField(controller: bioC, maxLines: 3, decoration: const InputDecoration(labelText: 'О себе (Био)', alignLabelWithHint: true)),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton(
                    onPressed: loading ? null : () async {
                      setModalState(() => loading = true);
                      try {
                        final api = ref.read(apiServiceProvider);
                        final data = <String, dynamic>{
                          'displayName': nameC.text.trim(),
                          'phone': phoneC.text.trim(),
                          'bio': bioC.text.trim(),
                        };
                        if (avatarC.text.trim().isNotEmpty) {
                          data['avatarUrl'] = avatarC.text.trim();
                        }
                        await api.updateProfile(data);
                        ref.invalidate(userProfileProvider);
                        if (ctx.mounted) Navigator.pop(ctx);
                        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Профиль обновлён!')));
                      } catch (e) {
                        setModalState(() => loading = false);
                        if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
                      }
                    },
                    child: loading ? const CircularProgressIndicator(color: Colors.white) : const Text('Сохранить'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showOrgSwitcher(BuildContext context, WidgetRef ref) {
    final memberships = ref.read(membershipsProvider).valueOrNull ?? [];
    final activeMemberships = memberships.where((m) => m['status'] == 'active').toList();
    final theme = Theme.of(context);

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Выбрать организацию', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            if (activeMemberships.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: Column(
                    children: [
                      const Text('Нет активных организаций'),
                      const SizedBox(height: 8),
                      FilledButton(
                        onPressed: () {
                          Navigator.pop(ctx);
                          context.push('/directory');
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
                  backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                  child: Text(
                    (m['organizationName'] ?? 'O')[0].toUpperCase(),
                    style: TextStyle(color: theme.colorScheme.primary, fontWeight: FontWeight.w700),
                  ),
                ),
                title: Text(m['organizationName'] ?? 'Организация'),
                subtitle: Text(m['role'] ?? ''),
                onTap: () async {
                  Navigator.pop(ctx);
                  try {
                    final api = ref.read(apiServiceProvider);
                    await api.switchOrg(m['organizationId'] ?? '');
                    ref.invalidate(userProfileProvider);
                    ref.invalidate(coursesProvider);
                    ref.invalidate(dashboardProvider);
                    ref.invalidate(membershipsProvider);
                  } catch (e) {
                    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
                  }
                },
              )),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _showAbout(BuildContext context) {
    final theme = Theme.of(context);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.school_rounded, color: theme.colorScheme.primary, size: 24),
            ),
            const SizedBox(width: 12),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Planula Senior', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                Text('v1.0.0', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w400)),
              ],
            ),
          ],
        ),
        content: const Text(
          'Профессиональная платформа для преподавателей и администраторов учебных центров.\n\n'
          'Журнал, расписание, курсы, экзамены — всё в одном месте.\n\n'
          '© 2026 Planula Systems.\nВсе права защищены.',
          style: TextStyle(height: 1.5),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Закрыть')),
        ],
      ),
    );
  }

  void _showNotificationSettings(BuildContext context) {
    final theme = Theme.of(context);
    final prefsAsync = ref.read(notificationPrefsProvider);

    // Default values
    bool pushEnabled = true;
    bool lessonNotif = true;
    bool homeworkNotif = true;
    bool scheduleNotif = true;
    bool examNotif = true;
    bool loading = false;
    bool initialLoading = true;

    // Load current preferences
    prefsAsync.whenData((prefs) {
      pushEnabled = prefs['pushEnabled'] != false;
      lessonNotif = prefs['lessons'] != false;
      homeworkNotif = prefs['homework'] != false;
      scheduleNotif = prefs['schedule'] != false;
      examNotif = prefs['exams'] != false;
      initialLoading = false;
    });
    if (prefsAsync.hasError || prefsAsync.hasValue) initialLoading = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          if (initialLoading) {
            // Fetch fresh from API
            ref.read(apiServiceProvider).getNotificationPreferences().then((prefs) {
              if (ctx.mounted) {
                setModalState(() {
                  pushEnabled = prefs['pushEnabled'] != false;
                  lessonNotif = prefs['lessons'] != false;
                  homeworkNotif = prefs['homework'] != false;
                  scheduleNotif = prefs['schedule'] != false;
                  examNotif = prefs['exams'] != false;
                  initialLoading = false;
                });
              }
            }).catchError((_) {
              if (ctx.mounted) setModalState(() => initialLoading = false);
            });
          }

          return Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
                const SizedBox(height: 20),
                Text('Уведомления', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text('Настройте, какие уведомления вы хотите получать', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withOpacity(0.5))),
                const SizedBox(height: 20),
                if (initialLoading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 32),
                    child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                else ...[
                  SwitchListTile(
                    value: pushEnabled,
                    onChanged: (v) => setModalState(() => pushEnabled = v),
                    title: const Text('Push-уведомления', style: TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: const Text('Общий переключатель'),
                    secondary: Icon(Icons.notifications_active_outlined, color: theme.colorScheme.primary),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  if (pushEnabled) ...[
                    const Divider(height: 16),
                    SwitchListTile(
                      value: lessonNotif,
                      onChanged: (v) => setModalState(() => lessonNotif = v),
                      title: const Text('Новые уроки'),
                      secondary: const Icon(Icons.auto_stories_outlined, size: 20),
                      dense: true,
                    ),
                    SwitchListTile(
                      value: homeworkNotif,
                      onChanged: (v) => setModalState(() => homeworkNotif = v),
                      title: const Text('Домашние задания'),
                      secondary: const Icon(Icons.assignment_outlined, size: 20),
                      dense: true,
                    ),
                    SwitchListTile(
                      value: scheduleNotif,
                      onChanged: (v) => setModalState(() => scheduleNotif = v),
                      title: const Text('Изменения расписания'),
                      secondary: const Icon(Icons.calendar_today_outlined, size: 20),
                      dense: true,
                    ),
                    SwitchListTile(
                      value: examNotif,
                      onChanged: (v) => setModalState(() => examNotif = v),
                      title: const Text('Результаты экзаменов'),
                      secondary: const Icon(Icons.quiz_outlined, size: 20),
                      dense: true,
                    ),
                  ],
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: FilledButton(
                      onPressed: loading ? null : () async {
                        setModalState(() => loading = true);
                        try {
                          final api = ref.read(apiServiceProvider);
                          await api.saveNotificationPreferences({
                            'pushEnabled': pushEnabled,
                            'lessons': lessonNotif,
                            'homework': homeworkNotif,
                            'schedule': scheduleNotif,
                            'exams': examNotif,
                          });
                          ref.invalidate(notificationPrefsProvider);
                          if (ctx.mounted) Navigator.pop(ctx);
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Настройки уведомлений сохранены ✓')),
                            );
                          }
                        } catch (e) {
                          setModalState(() => loading = false);
                          if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              SnackBar(content: Text('Ошибка: $e')),
                            );
                          }
                        }
                      },
                      child: loading
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Сохранить'),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String value;
  final String label;
  final IconData iconData;
  final Color color;

  const _StatItem({required this.value, required this.label, required this.iconData, required this.color});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: color.withOpacity(0.06),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withOpacity(0.12)),
        ),
        child: Column(
          children: [
            Icon(iconData, size: 22, color: color),
            const SizedBox(height: 6),
            Text(value, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: color)),
            const SizedBox(height: 2),
            Text(label, style: theme.textTheme.labelSmall?.copyWith(color: color.withOpacity(0.7))),
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

  const _SettingsTile({required this.icon, required this.title, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListTile(
      leading: Container(
        width: 40, height: 40,
        decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: theme.colorScheme.primary, size: 20),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w500)),
      subtitle: Text(subtitle, style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.5), fontSize: 13)),
      trailing: trailing ?? Icon(Icons.chevron_right_rounded, color: theme.colorScheme.onSurface.withValues(alpha: 0.3)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      onTap: onTap,
    );
  }
}
