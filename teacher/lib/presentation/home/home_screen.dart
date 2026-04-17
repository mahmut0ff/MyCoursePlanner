import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/providers/providers.dart';
import '../components/org_switcher.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(dashboardProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: const Padding(
           padding: EdgeInsets.only(left: 8.0),
           child: OrgSwitcher(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_none),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('В разработке (уведомления)')));
            },
          ),
        ],
      ),
      body: dashboardAsync.when(
        data: (data) {
          final metrics = data['metrics'] ?? {};
          final upcoming = data['upcoming'] as List? ?? [];
          
          return RefreshIndicator(
            onRefresh: () async => ref.refresh(dashboardProvider.future),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Сводка', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                
                // Metrics grid
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.5,
                  children: [
                    _MetricCard(
                      title: 'Курсов',
                      value: '${metrics['courses'] ?? 0}',
                      icon: Icons.school_outlined,
                      color: Colors.blue,
                    ),
                    _MetricCard(
                      title: 'Групп',
                      value: '${metrics['groups'] ?? 0}',
                      icon: Icons.group_outlined,
                      color: Colors.purple,
                    ),
                    _MetricCard(
                      title: 'Студентов',
                      value: '${metrics['students'] ?? 0}',
                      icon: Icons.person_outline,
                      color: Colors.orange,
                    ),
                    _MetricCard(
                      title: 'Отзывы ДЗ',
                      value: '${metrics['pendingHomeworks'] ?? 0}',
                      icon: Icons.assignment_late_outlined,
                      color: Colors.red,
                    ),
                  ],
                ),
                
                const SizedBox(height: 32),
                Text('Ближайшие занятия', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                
                if (upcoming.isEmpty)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Text('Нет запланированных занятий'),
                    ),
                  )
                else
                  ...upcoming.map((u) => Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: ListTile(
                      leading: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primaryContainer,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(Icons.class_outlined, color: theme.colorScheme.onPrimaryContainer),
                      ),
                      title: Text(u['title'] ?? 'Занятие', style: const TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: Text('${u['time'] ?? 'Время не указано'} • Group: ${u['groupName'] ?? '?'}'),
                      trailing: const Icon(Icons.chevron_right),
                    ),
                  )),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Ошибка: $err'),
              ElevatedButton(
                onPressed: () => ref.refresh(dashboardProvider),
                child: const Text('Повторить'),
              )
            ],
          ),
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final MaterialColor color;

  const _MetricCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color[700], size: 24),
              const Spacer(),
              Text(
                value,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: color[800],
                ),
              ),
            ],
          ),
          const Spacer(),
          Text(
            title,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: color[800],
            ),
          ),
        ],
      ),
    );
  }
}

