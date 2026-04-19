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

final appRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/',
  redirect: (context, state) {
    final loggedIn = FirebaseAuth.instance.currentUser != null;
    final isAuthRoute = state.matchedLocation == '/login' || state.matchedLocation == '/register';
    if (!loggedIn && !isAuthRoute) return '/login';
    if (loggedIn && isAuthRoute) return '/';
    return null;
  },
  routes: [
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
