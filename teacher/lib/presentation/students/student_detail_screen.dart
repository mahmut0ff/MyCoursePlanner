import 'package:flutter/material.dart';

class StudentDetailScreen extends StatelessWidget {
  final Map<String, dynamic> student;
  const StudentDetailScreen({super.key, required this.student});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = student['displayName'] ?? student['email'] ?? 'Безымянный';
    final email = student['email'] ?? 'Нет email';
    final phone = student['phone'] ?? 'Нет номера';
    final photoURL = student['photoURL'];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Профиль студента'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            CircleAvatar(
              radius: 50,
              backgroundColor: theme.colorScheme.primaryContainer,
              backgroundImage: photoURL != null ? NetworkImage(photoURL) : null,
              child: photoURL == null 
                ? Text(name[0].toUpperCase(), style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: theme.colorScheme.onPrimaryContainer))
                : null,
            ),
            const SizedBox(height: 24),
            Text(name, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(email, style: TextStyle(fontSize: 16, color: theme.colorScheme.onSurface.withValues(alpha: 0.6))),
            if (phone != 'Нет номера') ...[
              const SizedBox(height: 4),
              Text(phone, style: TextStyle(fontSize: 16, color: theme.colorScheme.onSurface.withValues(alpha: 0.6))),
            ],
            const SizedBox(height: 32),
            
            // Stats / Progress Placeholder
            Container(
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(16),
              ),
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.analytics_outlined),
                      SizedBox(width: 8),
                      Text('Аналитика и успеваемость', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Text('Загрузка детальной статистики по предметам находится в разработке.', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _StatNode(label: 'Сдано ДЗ', val: '0', theme: theme),
                      _StatNode(label: 'Оценки', val: '-', theme: theme),
                      _StatNode(label: 'Пропуски', val: '0', theme: theme),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatNode extends StatelessWidget {
  final String label;
  final String val;
  final ThemeData theme;

  const _StatNode({required this.label, required this.val, required this.theme});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(val, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: theme.colorScheme.primary)),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
      ],
    );
  }
}
