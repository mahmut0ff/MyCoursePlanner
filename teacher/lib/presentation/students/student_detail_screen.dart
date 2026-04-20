import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class StudentDetailScreen extends StatelessWidget {
  final Map<String, dynamic> student;
  const StudentDetailScreen({super.key, required this.student});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = (student['userName']?.toString().isNotEmpty == true ? student['userName'] : null) ??
                 (student['displayName']?.toString().isNotEmpty == true ? student['displayName'] : null) ??
                 (student['email']?.toString().isNotEmpty == true ? student['email'] : null) ??
                 (student['userEmail']?.toString().isNotEmpty == true ? student['userEmail'] : null) ?? 'Безымянный';
    final email = student['email'] ?? '';
    final phone = student['phone'] ?? '';
    final photoURL = student['photoURL'];
    final initials = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return Scaffold(
      appBar: AppBar(title: const Text('Профиль студента')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            // Avatar + Info
            Center(
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 50,
                    backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                    backgroundImage: photoURL != null ? NetworkImage(photoURL) : null,
                    child: photoURL == null
                        ? Text(initials, style: TextStyle(fontSize: 36, fontWeight: FontWeight.w700, color: theme.colorScheme.primary))
                        : null,
                  ),
                  const SizedBox(height: 16),
                  Text(name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  if (email.isNotEmpty) Text(email, style: TextStyle(fontSize: 14, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                  if (phone.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(phone, style: TextStyle(fontSize: 14, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Quick Actions
            Row(
              children: [
                if (email.isNotEmpty)
                  Expanded(
                    child: _ActionButton(
                      icon: Icons.email_outlined,
                      label: 'Email',
                      color: const Color(0xFF3B82F6),
                      onTap: () async {
                        final uri = Uri.parse('mailto:$email');
                        if (await canLaunchUrl(uri)) await launchUrl(uri);
                      },
                    ),
                  ),
                if (email.isNotEmpty && phone.isNotEmpty) const SizedBox(width: 12),
                if (phone.isNotEmpty)
                  Expanded(
                    child: _ActionButton(
                      icon: Icons.phone_outlined,
                      label: 'Позвонить',
                      color: const Color(0xFF10B981),
                      onTap: () async {
                        final uri = Uri.parse('tel:$phone');
                        if (await canLaunchUrl(uri)) await launchUrl(uri);
                      },
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 24),

            // Analytics Section
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40, height: 40,
                        decoration: BoxDecoration(color: const Color(0xFF7C3AED).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                        child: const Icon(Icons.analytics_outlined, color: Color(0xFF7C3AED), size: 20),
                      ),
                      const SizedBox(width: 12),
                      const Text('Аналитика', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      _StatCard(label: 'Сдано ДЗ', value: '—', color: const Color(0xFF10B981)),
                      const SizedBox(width: 12),
                      _StatCard(label: 'Ср. оценка', value: '—', color: const Color(0xFFF59E0B)),
                      const SizedBox(width: 12),
                      _StatCard(label: 'Пропуски', value: '—', color: const Color(0xFFEF4444)),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFF3B82F6).withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.info_outline, size: 18, color: Color(0xFF3B82F6)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Детальная аналитика будет доступна после добавления оценок и посещаемости',
                            style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withValues(alpha: 0.6)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Contact Info Card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.08)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Контактная информация', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 14),
                  _InfoRow(icon: Icons.badge_outlined, label: 'ID', value: student['id'] ?? student['uid'] ?? '—'),
                  if (email.isNotEmpty) _InfoRow(icon: Icons.email_outlined, label: 'Email', value: email),
                  if (phone.isNotEmpty) _InfoRow(icon: Icons.phone_outlined, label: 'Телефон', value: phone),
                  _InfoRow(icon: Icons.calendar_today_outlined, label: 'Создан', value: student['createdAt'] ?? '—'),
                ],
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _ActionButton({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 8),
            Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 14)),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatCard({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Text(value, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(fontSize: 11, color: color.withValues(alpha: 0.8))),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: theme.colorScheme.primary.withValues(alpha: 0.6)),
          const SizedBox(width: 10),
          Text('$label: ', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }
}
