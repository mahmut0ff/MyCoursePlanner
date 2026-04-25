import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../presentation/auth/login_screen.dart';
import '../../presentation/auth/register_screen.dart';
import '../../presentation/shell/app_shell.dart';
import '../../presentation/home/home_screen.dart';
import '../../presentation/journal/journal_screen.dart';
import '../../presentation/courses/courses_screen.dart';
import '../../presentation/courses/course_detail_screen.dart';
import '../../presentation/courses/course_form_screen.dart';
import '../../presentation/courses/group_form_screen.dart';
import '../../presentation/courses/group_detail_screen.dart';
import '../../presentation/lessons/lesson_detail_screen.dart';
import '../../presentation/lessons/lesson_form_screen.dart';
import '../../presentation/exams/exams_screen.dart';
import '../../presentation/exams/exam_detail_screen.dart';
import '../../presentation/exams/exam_form_screen.dart';
import '../../presentation/schedule/schedule_screen.dart';
import '../../presentation/homework/homework_review_screen.dart';
import '../../presentation/students/students_screen.dart';
import '../../presentation/profile/profile_screen.dart';
import '../../presentation/profile/licenses_screen.dart';
import '../../presentation/organizations/directory_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

/// Listenable that notifies GoRouter when Firebase auth state changes.
/// This ensures the redirect function is re-evaluated after Firebase
/// restores the session from local storage (which happens asynchronously).
class _AuthNotifier extends ChangeNotifier {
  bool _initialized = false;
  bool get initialized => _initialized;

  User? _user;
  User? get user => _user;

  _AuthNotifier() {
    FirebaseAuth.instance.authStateChanges().listen((user) {
      _user = user;
      _initialized = true;
      notifyListeners();
    });
  }
}

final _authNotifier = _AuthNotifier();

final appRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/',
  refreshListenable: _authNotifier,
  redirect: (context, state) {
    // While Firebase Auth is still initializing, show the splash screen.
    // This prevents the false redirect to /login on cold start.
    if (!_authNotifier.initialized) {
      // If we're not already on splash, redirect there
      if (state.matchedLocation != '/splash') return '/splash';
      return null;
    }

    final loggedIn = _authNotifier.user != null;
    final isAuthRoute = state.matchedLocation == '/login' ||
        state.matchedLocation == '/register' ||
        state.matchedLocation == '/splash';

    if (!loggedIn && !isAuthRoute) return '/login';
    if (loggedIn && isAuthRoute) return '/';
    return null;
  },
  routes: [
    // ── Splash (shown while Firebase Auth initializes) ──
    GoRoute(
      path: '/splash',
      builder: (_, __) => const _SplashScreen(),
    ),

    // ── Auth ──
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),

    // ── Shell (Bottom Nav) ──
    ShellRoute(
      navigatorKey: _shellNavigatorKey,
      builder: (_, __, child) => AppShell(child: child),
      routes: [
        GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
        GoRoute(path: '/journal', builder: (_, __) => const JournalScreen()),
        GoRoute(path: '/courses', builder: (_, __) => const CoursesScreen()),
        GoRoute(path: '/schedule', builder: (_, __) => const ScheduleScreen()),
        GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      ],
    ),

    // ── Detail routes (outside shell) ──
    GoRoute(
      path: '/courses/new',
      builder: (_, __) => const CourseFormScreen(),
    ),
    GoRoute(
      path: '/courses/:courseId',
      builder: (_, state) => CourseDetailScreen(
        courseId: state.pathParameters['courseId']!,
      ),
    ),
    GoRoute(
      path: '/courses/:courseId/groups/new',
      builder: (_, state) => GroupFormScreen(
        courseId: state.pathParameters['courseId']!,
      ),
    ),
    GoRoute(
      path: '/groups/:groupId',
      builder: (_, state) => GroupDetailScreen(
        groupId: state.pathParameters['groupId']!,
      ),
    ),
    GoRoute(
      path: '/lessons/:lessonId',
      builder: (_, state) => LessonDetailScreen(
        lessonId: state.pathParameters['lessonId']!,
      ),
    ),
    GoRoute(
      path: '/lessons/new',
      builder: (_, state) => LessonFormScreen(
        groupId: state.uri.queryParameters['groupId'],
      ),
    ),
    GoRoute(
      path: '/lessons/:lessonId/edit',
      builder: (_, state) => LessonFormScreen(
        lessonId: state.pathParameters['lessonId'],
      ),
    ),
    GoRoute(
      path: '/exams',
      builder: (_, __) => const ExamsScreen(),
    ),
    GoRoute(
      path: '/exams/new',
      builder: (_, __) => const ExamFormScreen(),
    ),
    GoRoute(
      path: '/exams/:examId',
      builder: (_, state) => ExamDetailScreen(
        examId: state.pathParameters['examId']!,
      ),
    ),
    GoRoute(
      path: '/exams/:examId/edit',
      builder: (_, state) => ExamFormScreen(
        examId: state.pathParameters['examId'],
      ),
    ),
    GoRoute(
      path: '/homework',
      builder: (_, __) => const HomeworkReviewScreen(),
    ),
    GoRoute(
      path: '/students',
      builder: (_, __) => const StudentsScreen(),
    ),
    GoRoute(
      path: '/directory',
      builder: (_, __) => const DirectoryScreen(),
    ),
    GoRoute(
      path: '/licenses',
      builder: (_, __) => const LicensesScreen(),
    ),
  ],
);

/// Minimal splash screen shown while Firebase Auth initializes.
class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF7C3AED).withValues(alpha: 0.2),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: Image.asset('assets/images/planula_senior.png', fit: BoxFit.cover),
              ),
            ),
            const SizedBox(height: 24),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
          ],
        ),
      ),
    );
  }
}
