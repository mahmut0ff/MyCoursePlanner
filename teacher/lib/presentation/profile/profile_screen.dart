import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/providers.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _nameC = TextEditingController();
  final _phoneC = TextEditingController();
  final _bioC = TextEditingController();
  
  bool _isEditing = false;
  bool _loading = false;
  Map<String, dynamic>? _initialProfile;

  @override
  void dispose() {
    _nameC.dispose();
    _phoneC.dispose();
    _bioC.dispose();
    super.dispose();
  }

  void _startEditing(Map<String, dynamic> profile) {
    _initialProfile = profile;
    _nameC.text = profile['displayName'] ?? '';
    _phoneC.text = profile['phone'] ?? '';
    _bioC.text = profile['bio'] ?? '';
    setState(() => _isEditing = true);
  }

  Future<void> _save() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(apiServiceProvider);
      await api.updateProfile({
        'displayName': _nameC.text.trim(),
        'phone': _phoneC.text.trim(),
        'bio': _bioC.text.trim(),
      });
      
      ref.invalidate(userProfileProvider);
      if (mounted) setState(() {
        _isEditing = false;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(userProfileProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Профиль'),
        actions: [
          if (_isEditing)
             IconButton(
               icon: _loading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check),
               onPressed: _loading ? null : _save,
             )
          else 
            IconButton(
              icon: const Icon(Icons.logout),
              onPressed: () async {
                await FirebaseAuth.instance.signOut();
                if (context.mounted) context.go('/login');
              },
            ),
        ],
      ),
      body: profileAsync.when(
        data: (profile) {
          if (profile == null) return const Center(child: Text('Профиль не найден'));

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                CircleAvatar(
                  radius: 50,
                  backgroundColor: theme.colorScheme.primaryContainer,
                  backgroundImage: profile['photoURL'] != null ? NetworkImage(profile['photoURL']) : null,
                  child: profile['photoURL'] == null 
                    ? Text((profile['displayName'] ?? profile['email'] ?? '?')[0].toUpperCase(), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold))
                    : null,
                ),
                const SizedBox(height: 24),
                
                if (!_isEditing) ...[
                  Text(
                    profile['displayName'] ?? 'Без имени',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    profile['email'] ?? '',
                    style: TextStyle(fontSize: 16, color: theme.colorScheme.onSurface.withValues(alpha: 0.6)),
                  ),
                  if (profile['phone'] != null && profile['phone'].isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(profile['phone']),
                  ],
                  const SizedBox(height: 16),
                  if (profile['bio'] != null && profile['bio'].isNotEmpty) ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(profile['bio'] ?? '', style: const TextStyle(height: 1.4)),
                    ),
                  ],
                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.edit),
                      label: const Text('Редактировать профиль'),
                      onPressed: () => _startEditing(profile),
                    ),
                  ),
                ] else ...[
                  TextField(
                    controller: _nameC,
                    decoration: const InputDecoration(labelText: 'Имя', prefixIcon: Icon(Icons.person)),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _phoneC,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(labelText: 'Телефон', prefixIcon: Icon(Icons.phone)),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _bioC,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'О себе (Био)'),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: FilledButton(
                      onPressed: _loading ? null : _save,
                      child: _loading ? const CircularProgressIndicator(color: Colors.white) : const Text('Сохранить'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: TextButton(
                      onPressed: () => setState(() => _isEditing = false),
                      child: const Text('Отмена'),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Ошибка загрузки: $err')),
      ),
    );
  }
}
