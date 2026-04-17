import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/providers/providers.dart';

class DirectoryScreen extends ConsumerStatefulWidget {
  const DirectoryScreen({super.key});

  @override
  ConsumerState<DirectoryScreen> createState() => _DirectoryScreenState();
}

class _DirectoryScreenState extends ConsumerState<DirectoryScreen> {
  final _searchC = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchC.dispose();
    super.dispose();
  }

  Future<void> _apply(String orgId) async {
    showDialog(context: context, barrierDismissible: false, builder: (_) => const Center(child: CircularProgressIndicator()));
    try {
      final api = ref.read(apiServiceProvider);
      await api.applyToOrg(orgId);
      if (mounted) {
        Navigator.pop(context); // close loading
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Заявка успешно отправлена!')));
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context); // close loading
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка отправки: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final orgsAsync = ref.watch(orgDirectoryProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Каталог организаций'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchC,
              onChanged: (v) => setState(() => _query = v.toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Поиск учебного центра...',
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Expanded(
            child: orgsAsync.when(
              data: (orgs) {
                final filtered = orgs.cast<Map<String, dynamic>>().where((o) {
                  final name = (o['organizationName'] ?? '').toString().toLowerCase();
                  return name.contains(_query);
                }).toList();

                if (filtered.isEmpty) {
                  return const Center(child: Text('Ничего не найдено.'));
                }

                return ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    final o = filtered[index];
                    return Card(
                      child: ListTile(
                        leading: Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primaryContainer,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Center(
                            child: Text(
                              (o['organizationName'] ?? '?')[0].toUpperCase(),
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                                color: theme.colorScheme.onPrimaryContainer,
                              ),
                            ),
                          ),
                        ),
                        title: Text(o['organizationName'] ?? 'Без названия', style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text(
                          [
                            if (o['type'] != null) o['type'],
                            if (o['city'] != null) o['city']
                          ].join(' • '),
                          style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.7)),
                        ),
                        trailing: FilledButton.tonal(
                          onPressed: () => _apply(o['id'] ?? o['organizationId']),
                          child: const Text('Подать заявку'),
                        ),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(child: Text('Ошибка: $err')),
            ),
          ),
        ],
      ),
    );
  }
}
