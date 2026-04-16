import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/providers/auth_provider.dart';
import '../common/shimmer_list.dart';

/// Provider: org directory from API.
final orgDirectoryProvider = FutureProvider<List<dynamic>>((ref) async {
  final api = ref.watch(apiServiceProvider);
  return api.getOrgDirectory();
});

class OrgSearchScreen extends ConsumerStatefulWidget {
  const OrgSearchScreen({super.key});

  @override
  ConsumerState<OrgSearchScreen> createState() => _OrgSearchScreenState();
}

class _OrgSearchScreenState extends ConsumerState<OrgSearchScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final orgsAsync = ref.watch(orgDirectoryProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Найти организацию')),
      body: Column(
        children: [
          // ── Search bar ──
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              onChanged: (v) => setState(() => _query = v.toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Поиск по названию...',
                prefixIcon: const Icon(Icons.search_rounded),
                filled: true,
                fillColor: isDark
                    ? const Color(0xFF1E293B)
                    : Colors.grey.shade100,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 14),
              ),
            ),
          ),

          // ── Results ──
          Expanded(
            child: orgsAsync.when(
              loading: () =>
                  const ShimmerList(itemCount: 5, itemHeight: 80),
              error: (_, __) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Ошибка загрузки'),
                    TextButton(
                      onPressed: () =>
                          ref.invalidate(orgDirectoryProvider),
                      child: const Text('Повторить'),
                    ),
                  ],
                ),
              ),
              data: (orgs) {
                final filtered = _query.isEmpty
                    ? orgs
                    : orgs.where((o) {
                        final name =
                            (o['name'] ?? '').toString().toLowerCase();
                        final city =
                            (o['city'] ?? '').toString().toLowerCase();
                        return name.contains(_query) ||
                            city.contains(_query);
                      }).toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.search_off_rounded,
                            size: 48,
                            color: theme.colorScheme.primary
                                .withValues(alpha: 0.3)),
                        const SizedBox(height: 12),
                        const Text('Ничего не найдено'),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async =>
                      ref.invalidate(orgDirectoryProvider),
                  child: ListView.builder(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: filtered.length,
                    itemBuilder: (ctx, i) {
                      final org = filtered[i] as Map<String, dynamic>;
                      return _OrgCard(org: org);
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _OrgCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> org;

  const _OrgCard({required this.org});

  @override
  ConsumerState<_OrgCard> createState() => _OrgCardState();
}

class _OrgCardState extends ConsumerState<_OrgCard> {
  bool _loading = false;
  String? _status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final org = widget.org;
    final name = org['name'] ?? '';
    final city = org['city'] ?? '';
    final students = org['studentsCount'] ?? 0;
    final teachers = org['teachersCount'] ?? 0;
    final logo = org['logo'] ?? '';

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: theme.colorScheme.outline.withValues(alpha: 0.1),
          ),
        ),
        child: Row(
          children: [
            // Logo
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary
                    .withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(14),
              ),
              child: logo.isNotEmpty
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Image.network(logo,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              _OrgInitial(name: name)),
                    )
                  : _OrgInitial(name: name),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (city.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      city,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface
                            .withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(Icons.school_outlined,
                          size: 13,
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.4)),
                      const SizedBox(width: 3),
                      Text('$students',
                          style: TextStyle(
                              fontSize: 11,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.5))),
                      const SizedBox(width: 10),
                      Icon(Icons.person_outlined,
                          size: 13,
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.4)),
                      const SizedBox(width: 3),
                      Text('$teachers',
                          style: TextStyle(
                              fontSize: 11,
                              color: theme.colorScheme.onSurface
                                  .withValues(alpha: 0.5))),
                    ],
                  ),
                ],
              ),
            ),
            // Join button
            if (_status == 'pending')
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFFF59E0B)
                      .withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'Заявка ⏳',
                  style: TextStyle(
                    color: Color(0xFFF59E0B),
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              )
            else if (_status == 'already_member')
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981)
                      .withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'Участник ✓',
                  style: TextStyle(
                    color: Color(0xFF10B981),
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              )
            else
              SizedBox(
                height: 34,
                child: ElevatedButton(
                  onPressed: _loading ? null : _apply,
                  style: ElevatedButton.styleFrom(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14),
                    textStyle: const TextStyle(fontSize: 12),
                  ),
                  child: _loading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2),
                        )
                      : const Text('Вступить'),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _apply() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(apiServiceProvider);
      final orgId = widget.org['id'] ?? '';
      final result = await api.applyToOrg(orgId);
      final status = result['status'] as String?;
      setState(() {
        _status = status ?? 'pending';
      });
      if (mounted) {
        final msg = switch (_status) {
          'pending' => 'Заявка отправлена! Ожидайте подтверждения.',
          'already_member' => 'Вы уже участник этой организации.',
          _ => 'Заявка отправлена!',
        };
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg)),
        );
      }
      ref.invalidate(userMembershipsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}

class _OrgInitial extends StatelessWidget {
  final String name;

  const _OrgInitial({required this.name});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Text(
        name.isNotEmpty ? name[0].toUpperCase() : '?',
        style: TextStyle(
          color: theme.colorScheme.primary,
          fontSize: 22,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
