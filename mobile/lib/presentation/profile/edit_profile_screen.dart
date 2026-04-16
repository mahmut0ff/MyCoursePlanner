import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../domain/providers/auth_provider.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _nameController = TextEditingController();
  final _cityController = TextEditingController();
  final _bioController = TextEditingController();
  final _usernameController = TextEditingController();
  bool _saving = false;
  bool _uploadingAvatar = false;
  String? _avatarUrl;
  List<String> _pinnedBadges = [];
  List<String> _allBadges = [];

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  void _loadProfile() {
    final profile = ref.read(userProfileProvider).valueOrNull;
    final gamification = ref.read(gamificationProvider).valueOrNull;

    _nameController.text = profile?.displayName ?? '';
    _cityController.text = profile?.city ?? '';
    _bioController.text = profile?.bio ?? '';
    _usernameController.text = profile?.username ?? '';
    _avatarUrl = profile?.avatarUrl;
    _pinnedBadges = List<String>.from(profile?.pinnedBadges ?? []);
    _allBadges = List<String>.from(gamification?.badges ?? []);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _cityController.dispose();
    _bioController.dispose();
    _usernameController.dispose();
    super.dispose();
  }

  Future<void> _pickAndUploadAvatar() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 512,
      maxHeight: 512,
      imageQuality: 85,
    );
    if (image == null) return;

    setState(() => _uploadingAvatar = true);

    try {
      final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
      final storageRef =
          FirebaseStorage.instance.ref('avatars/$uid.jpg');

      // Upload the cropped/resized image
      await storageRef.putFile(
        File(image.path),
        SettableMetadata(contentType: 'image/jpeg'),
      );

      final url = await storageRef.getDownloadURL();

      // Update Firestore
      await FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .update({
        'avatarUrl': url,
        'updatedAt': DateTime.now().toIso8601String(),
      });

      // Update Firebase Auth profile
      await FirebaseAuth.instance.currentUser?.updatePhotoURL(url);

      setState(() => _avatarUrl = url);
      ref.invalidate(userProfileProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка загрузки: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  Future<void> _saveProfile() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Имя не может быть пустым')),
      );
      return;
    }

    setState(() => _saving = true);

    try {
      final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
      final data = {
        'displayName': name,
        'city': _cityController.text.trim(),
        'bio': _bioController.text.trim(),
        'username': _usernameController.text.trim().toLowerCase(),
        'pinnedBadges': _pinnedBadges,
        'updatedAt': DateTime.now().toIso8601String(),
      };

      await FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .update(data);
      await FirebaseAuth.instance.currentUser?.updateDisplayName(name);

      ref.invalidate(userProfileProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Профиль сохранён ✓')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showBadgePinner() {
    // Badge definitions matching backend
    const badgeDefs = {
      'first_exam': {'icon': '🎯', 'title': 'Первый экзамен'},
      'perfect_score': {'icon': '💎', 'title': 'Перфекционист'},
      'streak_3': {'icon': '🔥', 'title': 'Серия — 3'},
      'streak_7': {'icon': '⚡', 'title': 'Серия — 7'},
      'streak_30': {'icon': '🏆', 'title': 'Легенда серий'},
      'speed_demon': {'icon': '⏱️', 'title': 'Быстрый ум'},
      'ten_exams': {'icon': '📚', 'title': 'Десятак'},
      'fifty_exams': {'icon': '🎖️', 'title': 'Полтинник'},
      'first_lesson': {'icon': '📖', 'title': 'Книжный червь'},
      'five_lessons': {'icon': '🧠', 'title': 'Жажда знаний'},
      'twenty_lessons': {'icon': '🎓', 'title': 'Эрудит'},
      'first_quiz': {'icon': '🎮', 'title': 'Новый игрок'},
      'quiz_winner': {'icon': '🏅', 'title': 'Чемпион'},
      'five_quizzes': {'icon': '🎲', 'title': 'Азартный ученик'},
      'joined_org': {'icon': '🤝', 'title': 'Часть команды'},
      'three_orgs': {'icon': '🌍', 'title': 'Сетевик'},
      'first_post': {'icon': '📝', 'title': 'Спикер'},
      'level_5': {'icon': '⭐', 'title': 'Достигатор'},
      'level_10': {'icon': '👑', 'title': 'Легенда'},
      'night_owl': {'icon': '🦉', 'title': 'Ночная сова'},
      'first_grade': {'icon': '📝', 'title': 'Первая оценка'},
      'perfect_grade': {'icon': '✨', 'title': 'Отличник'},
      'streak_5_attendance': {'icon': '📅', 'title': 'Примерный студент'},
    };

    var tempPinned = List<String>.from(_pinnedBadges);
    final theme = Theme.of(context);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => DraggableScrollableSheet(
          initialChildSize: 0.6,
          minChildSize: 0.3,
          maxChildSize: 0.85,
          expand: false,
          builder: (_, scrollCtrl) => Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Закрепить бейджи',
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      '${tempPinned.length}/3',
                      style: TextStyle(
                        color: tempPinned.length >= 3
                            ? theme.colorScheme.error
                            : theme.colorScheme.onSurface
                                .withValues(alpha: 0.5),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Выберите до 3 бейджей для отображения в профиле',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface
                        .withValues(alpha: 0.5),
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: ListView.builder(
                    controller: scrollCtrl,
                    itemCount: _allBadges.length,
                    itemBuilder: (ctx, i) {
                      final badgeId = _allBadges[i];
                      final def = badgeDefs[badgeId];
                      if (def == null) return const SizedBox.shrink();
                      final isPinned = tempPinned.contains(badgeId);

                      return ListTile(
                        leading: Text(def['icon'] ?? '🎖️',
                            style: const TextStyle(fontSize: 28)),
                        title: Text(def['title'] ?? badgeId,
                            style: const TextStyle(
                                fontWeight: FontWeight.w500)),
                        trailing: isPinned
                            ? Icon(Icons.push_pin,
                                color: theme.colorScheme.primary)
                            : Icon(Icons.push_pin_outlined,
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.2)),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        onTap: () {
                          setModalState(() {
                            if (isPinned) {
                              tempPinned.remove(badgeId);
                            } else if (tempPinned.length < 3) {
                              tempPinned.add(badgeId);
                            } else {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Максимум 3 бейджа'),
                                  duration: Duration(seconds: 1),
                                ),
                              );
                            }
                          });
                        },
                      );
                    },
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      setState(() => _pinnedBadges = tempPinned);
                      Navigator.pop(ctx);
                    },
                    child: const Text('Сохранить'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final profile = ref.watch(userProfileProvider).valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Редактировать профиль'),
        actions: [
          TextButton(
            onPressed: _saving ? null : _saveProfile,
            child: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Сохранить',
                    style: TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ── Avatar ──
          Center(
            child: Stack(
              children: [
                CircleAvatar(
                  radius: 56,
                  backgroundColor:
                      theme.colorScheme.primary.withValues(alpha: 0.1),
                  backgroundImage: _avatarUrl != null &&
                          _avatarUrl!.isNotEmpty
                      ? NetworkImage(_avatarUrl!)
                      : null,
                  child: _avatarUrl == null || _avatarUrl!.isEmpty
                      ? Text(
                          profile?.initials ?? '?',
                          style: TextStyle(
                            fontSize: 40,
                            fontWeight: FontWeight.w700,
                            color: theme.colorScheme.primary,
                          ),
                        )
                      : null,
                ),
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: GestureDetector(
                    onTap: _uploadingAvatar ? null : _pickAndUploadAvatar,
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: theme.colorScheme.surface,
                          width: 3,
                        ),
                      ),
                      child: _uploadingAvatar
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.camera_alt,
                              size: 16, color: Colors.white),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),

          // ── Pinned Badges ──
          Text(
            'Закреплённые бейджи',
            style: theme.textTheme.titleSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: _allBadges.isEmpty ? null : _showBadgePinner,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E293B) : Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: theme.colorScheme.outline.withValues(alpha: 0.1),
                ),
              ),
              child: _pinnedBadges.isEmpty
                  ? Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.push_pin_outlined,
                            size: 18,
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.3)),
                        const SizedBox(width: 8),
                        Text(
                          _allBadges.isEmpty
                              ? 'Нет полученных бейджей'
                              : 'Нажмите, чтобы закрепить бейджи',
                          style: TextStyle(
                            color: theme.colorScheme.onSurface
                                .withValues(alpha: 0.4),
                            fontSize: 13,
                          ),
                        ),
                      ],
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        ..._pinnedBadges.map((b) => _PinnedBadgeChip(
                              badgeId: b,
                              onRemove: () {
                                setState(() => _pinnedBadges.remove(b));
                              },
                            )),
                        if (_pinnedBadges.length < 3 &&
                            _allBadges.length > _pinnedBadges.length)
                          Padding(
                            padding: const EdgeInsets.only(left: 8),
                            child: Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: theme.colorScheme.outline
                                      .withValues(alpha: 0.2),
                                  style: BorderStyle.solid,
                                ),
                              ),
                              child: Icon(Icons.add,
                                  size: 18,
                                  color: theme.colorScheme.onSurface
                                      .withValues(alpha: 0.3)),
                            ),
                          ),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 24),

          // ── Fields ──
          _ProfileField(
            controller: _nameController,
            label: 'Имя',
            icon: Icons.person_outline,
          ),
          const SizedBox(height: 14),
          _ProfileField(
            controller: _usernameController,
            label: 'Никнейм',
            icon: Icons.alternate_email,
            hint: 'john_doe',
          ),
          const SizedBox(height: 14),
          _ProfileField(
            controller: _cityController,
            label: 'Город',
            icon: Icons.location_city_outlined,
          ),
          const SizedBox(height: 14),
          _ProfileField(
            controller: _bioController,
            label: 'О себе',
            icon: Icons.info_outline,
            maxLines: 3,
          ),
        ],
      ),
    );
  }
}

class _ProfileField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final String? hint;
  final int maxLines;

  const _ProfileField({
    required this.controller,
    required this.label,
    required this.icon,
    this.hint,
    this.maxLines = 1,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
        ),
      ),
    );
  }
}

class _PinnedBadgeChip extends StatelessWidget {
  final String badgeId;
  final VoidCallback onRemove;

  const _PinnedBadgeChip({
    required this.badgeId,
    required this.onRemove,
  });

  static const _icons = {
    'first_exam': '🎯', 'perfect_score': '💎', 'streak_3': '🔥',
    'streak_7': '⚡', 'streak_30': '🏆', 'speed_demon': '⏱️',
    'ten_exams': '📚', 'fifty_exams': '🎖️',
    'first_lesson': '📖', 'five_lessons': '🧠', 'twenty_lessons': '🎓',
    'first_quiz': '🎮', 'quiz_winner': '🏅', 'five_quizzes': '🎲',
    'joined_org': '🤝', 'three_orgs': '🌍', 'first_post': '📝',
    'level_5': '⭐', 'level_10': '👑', 'night_owl': '🦉',
    'first_grade': '📝', 'perfect_grade': '✨',
    'streak_5_attendance': '📅',
  };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: GestureDetector(
        onTap: onRemove,
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Theme.of(context)
                .colorScheme
                .primary
                .withValues(alpha: 0.1),
          ),
          child: Text(
            _icons[badgeId] ?? '🎖️',
            style: const TextStyle(fontSize: 24),
          ),
        ),
      ),
    );
  }
}
