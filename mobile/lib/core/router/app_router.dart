import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/providers/auth_provider.dart';
import '../../presentation/auth/login_screen.dart';
import '../../presentation/auth/register_screen.dart';
import '../../presentation/shell/main_shell.dart';
import '../../presentation/home/home_screen.dart';
import '../../presentation/courses/courses_list_screen.dart';
import '../../presentation/courses/course_detail_screen.dart';
import '../../presentation/exams/exams_home_screen.dart';
import '../../presentation/exams/attempt_detail_screen.dart';
import '../../presentation/exams/exam_taking_screen.dart';
import '../../presentation/schedule/schedule_screen.dart';
import '../../presentation/profile/profile_screen.dart';
import '../../presentation/notifications/notifications_screen.dart';
import '../../presentation/organizations/org_search_screen.dart';
import '../../presentation/profile/licenses_screen.dart';
import '../../presentation/profile/edit_profile_screen.dart';
import '../../presentation/profile/achievements_screen.dart';
import '../../presentation/quiz/join_quiz_screen.dart';
import '../../presentation/quiz/quiz_play_screen.dart';
import '../../presentation/groups/group_detail_screen.dart';
import '../../presentation/lessons/lesson_view_screen.dart';
import '../../presentation/lessons/homework_submit_screen.dart';
import '../../presentation/diary/diary_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorHomeKey = GlobalKey<NavigatorState>(debugLabel: 'home');
final _shellNavigatorCoursesKey = GlobalKey<NavigatorState>(debugLabel: 'courses');
final _shellNavigatorExamsKey = GlobalKey<NavigatorState>(debugLabel: 'exams');
final _shellNavigatorScheduleKey = GlobalKey<NavigatorState>(debugLabel: 'schedule');
final _shellNavigatorProfileKey = GlobalKey<NavigatorState>(debugLabel: 'profile');

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/login',
    debugLogDiagnostics: true,
    redirect: (context, state) {
      final isLoggedIn = authState.valueOrNull != null;
      final isAuthRoute = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register';

      if (!isLoggedIn && !isAuthRoute) return '/login';
      if (isLoggedIn && isAuthRoute) return '/home';
      return null;
    },
    routes: [
      // ── Auth Routes ──
      GoRoute(
        path: '/login',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const RegisterScreen(),
      ),

      // ── Full-screen Overlays (above shell) ──
      GoRoute(
        path: '/notifications',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/org-search',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const OrgSearchScreen(),
      ),
      GoRoute(
        path: '/licenses',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const LicensesScreen(),
      ),
      GoRoute(
        path: '/edit-profile',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const EditProfileScreen(),
      ),
      GoRoute(
        path: '/achievements',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const AchievementsScreen(),
      ),
      GoRoute(
        path: '/diary',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DiaryScreen(),
      ),
      GoRoute(
        path: '/courses/:id',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final courseId = state.pathParameters['id']!;
          return CourseDetailScreen(courseId: courseId);
        },
      ),
      GoRoute(
        path: '/exams/attempt/:id',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final attemptId = state.pathParameters['id']!;
          return AttemptDetailScreen(attemptId: attemptId);
        },
      ),
      GoRoute(
        path: '/exams/take',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final data = state.extra as Map<String, dynamic>? ?? {};
          return ExamTakingScreen(
            roomId: data['roomId'] ?? '',
            examId: data['examId'] ?? '',
            examTitle: data['examTitle'] ?? '',
            roomCode: data['roomCode'] ?? '',
          );
        },
      ),
      GoRoute(
        path: '/quiz/join',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const JoinQuizScreen(),
      ),
      GoRoute(
        path: '/quiz/play/:id',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final sessionId = state.pathParameters['id']!;
          return QuizPlayScreen(sessionId: sessionId);
        },
      ),
      GoRoute(
        path: '/groups/:id',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final groupId = state.pathParameters['id']!;
          return GroupDetailScreen(groupId: groupId);
        },
      ),
      GoRoute(
        path: '/lessons/:id',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final lessonId = state.pathParameters['id']!;
          return LessonViewScreen(lessonId: lessonId);
        },
      ),
      GoRoute(
        path: '/lessons/:id/homework',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final lessonId = state.pathParameters['id']!;
          return HomeworkSubmitScreen(lessonId: lessonId);
        },
      ),

      // ── Main Shell with Bottom NavBar ──
      StatefulShellRoute.indexedStack(
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state, navigationShell) =>
            MainShell(navigationShell: navigationShell),
        branches: [
          // Tab 0 — Home
          StatefulShellBranch(
            navigatorKey: _shellNavigatorHomeKey,
            routes: [
              GoRoute(
                path: '/home',
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),

          // Tab 1 — Courses
          StatefulShellBranch(
            navigatorKey: _shellNavigatorCoursesKey,
            routes: [
              GoRoute(
                path: '/courses',
                builder: (context, state) => const CoursesListScreen(),
              ),
            ],
          ),

          // Tab 2 — Exams
          StatefulShellBranch(
            navigatorKey: _shellNavigatorExamsKey,
            routes: [
              GoRoute(
                path: '/exams',
                builder: (context, state) => const ExamsHomeScreen(),
              ),
            ],
          ),

          // Tab 3 — Schedule
          StatefulShellBranch(
            navigatorKey: _shellNavigatorScheduleKey,
            routes: [
              GoRoute(
                path: '/schedule',
                builder: (context, state) => const ScheduleScreen(),
              ),
            ],
          ),

          // Tab 4 — Profile
          StatefulShellBranch(
            navigatorKey: _shellNavigatorProfileKey,
            routes: [
              GoRoute(
                path: '/profile',
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
