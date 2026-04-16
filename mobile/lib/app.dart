import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/theme/app_theme.dart';
import 'core/router/app_router.dart';

/// Persisted theme mode provider backed by SharedPreferences.
final themeModeProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>(
        (ref) => ThemeModeNotifier());

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  static const _key = 'theme_mode';

  ThemeModeNotifier() : super(ThemeMode.system) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final value = prefs.getString(_key);
    if (value == 'light') {
      state = ThemeMode.light;
    } else if (value == 'dark') {
      state = ThemeMode.dark;
    }
  }

  Future<void> setTheme(ThemeMode mode) async {
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, mode.name);
  }

  Future<void> toggle() async {
    final next = state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    await setTheme(next);
  }
}

class PlanulApp extends ConsumerWidget {
  const PlanulApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'Planula Junior',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
    );
  }
}

