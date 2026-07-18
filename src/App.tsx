import React, { Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PlanGuard from './components/guards/PlanGuard';
import PermissionRoute from './components/guards/PermissionRoute';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppLayout from './components/layout/AppLayout';
import PresenceHeartbeat from './components/presence/PresenceHeartbeat';
import { lazyRetry } from './lib/lazyRetry';

const LoginPage = lazyRetry(() => import('./pages/auth/LoginPage'));
const ParentPortalPage = lazyRetry(() => import('./pages/parent/ParentPortalPage'));
const OnboardingPage = lazyRetry(() => import('./pages/auth/OnboardingPage'));
const TgLoginPage = lazyRetry(() => import('./pages/auth/TgLoginPage'));

const LandingPage = lazyRetry(() => import('./pages/landing/LandingPage'));
const FeaturesPage = lazyRetry(() => import('./pages/landing/FeaturesPage'));
const AboutPage = lazyRetry(() => import('./pages/landing/AboutPage'));
const ContactPage = lazyRetry(() => import('./pages/landing/ContactPage'));
const DocsPage = lazyRetry(() => import('./pages/landing/DocsPage'));
const VibecoderPage = lazyRetry(() => import('./pages/landing/VibecoderPage'));
const PrivacyPage = lazyRetry(() => import('./pages/landing/PrivacyPage'));
const TermsPage = lazyRetry(() => import('./pages/landing/TermsPage'));

const DashboardPage = lazyRetry(() => import('./pages/dashboard/DashboardPage'));
const GradebookPage = lazyRetry(() => import('./pages/gradebook/GradebookPage'));
const JournalPage = lazyRetry(() => import('./pages/journal/JournalPage'));
const AdminGradebookAnalytics = lazyRetry(() => import('./pages/admin/AdminGradebookAnalytics'));
const LessonListPage = lazyRetry(() => import('./pages/lessons/LessonListPage'));
const LessonEditPage = lazyRetry(() => import('./pages/lessons/LessonEditPage'));
const LessonViewPage = lazyRetry(() => import('./pages/lessons/LessonViewPage'));
const ExamListPage = lazyRetry(() => import('./pages/exams/ExamListPage'));
const ExamEditPage = lazyRetry(() => import('./pages/exams/ExamEditPage'));
const ExamViewPage = lazyRetry(() => import('./pages/exams/ExamViewPage'));
const RoomListPage = lazyRetry(() => import('./pages/rooms/RoomListPage'));
const RoomPage = lazyRetry(() => import('./pages/rooms/RoomPage'));
const JoinRoomPage = lazyRetry(() => import('./pages/rooms/JoinRoomPage'));
const ExamTakePage = lazyRetry(() => import('./pages/rooms/ExamTakePage'));
const PublicExamTakePage = lazyRetry(() => import('./pages/public/PublicExamTakePage'));
const ResultPage = lazyRetry(() => import('./pages/rooms/ResultPage'));
const MyResultsPage = lazyRetry(() => import('./pages/rooms/MyResultsPage'));
const BillingPage = lazyRetry(() => import('./pages/billing/BillingPage'));
const CertificatePage = lazyRetry(() => import('./pages/certificates/CertificatePage'));
const MyCertificatesPage = lazyRetry(() => import('./pages/certificates/MyCertificatesPage'));
const PaymentSuccessPage = lazyRetry(() => import('./pages/billing/PaymentSuccessPage'));
const PaymentFailurePage = lazyRetry(() => import('./pages/billing/PaymentFailurePage'));
const StudentProfilePage = lazyRetry(() => import('./pages/profile/StudentProfilePage'));
const AchievementsPage = lazyRetry(() => import('./pages/achievements/AchievementsPage'));
const StudentDiaryPage = lazyRetry(() => import('./pages/student/StudentDiaryPage'));

const StudentCoursesPage = lazyRetry(() => import('./pages/student/StudentCoursesPage'));
const StudentTeachersPage = lazyRetry(() => import('./pages/student/StudentTeachersPage'));
const StudentGroupsPage = lazyRetry(() => import('./pages/student/StudentGroupsPage'));
const StudentSchedulePage = lazyRetry(() => import('./pages/student/StudentSchedulePage'));
const StudentHomeworkPage = lazyRetry(() => import('./pages/student/StudentHomeworkPage'));



// Quiz Pages
const QuizLibraryPage = lazyRetry(() => import('./pages/quiz/QuizLibraryPage'));
const QuizBuilderPage = lazyRetry(() => import('./pages/quiz/QuizBuilderPage'));
const LiveSessionDashboard = lazyRetry(() => import('./pages/quiz/LiveSessionDashboard'));
const SessionHistoryPage = lazyRetry(() => import('./pages/quiz/SessionHistoryPage'));
const SessionAnalyticsPage = lazyRetry(() => import('./pages/quiz/SessionAnalyticsPage'));
const JoinQuizPage = lazyRetry(() => import('./pages/quiz/JoinQuizPage'));
const QuizPlayPage = lazyRetry(() => import('./pages/quiz/QuizPlayPage'));

// Mega Features
const HomeworkReviewPage = lazyRetry(() => import('./pages/homework/HomeworkReviewPage'));



// Org Pages
const CoursesPage = lazyRetry(() => import('./pages/courses/CoursesPage'));
const FinancesPage = lazyRetry(() => import('./pages/finances/FinancesPage'));
const GroupsPage = lazyRetry(() => import('./pages/groups/GroupsPage'));
const StudentsPage = lazyRetry(() => import('./pages/students/StudentsPage'));
const TeachersPage = lazyRetry(() => import('./pages/teachers/TeachersPage'));
const TeamRolesPage = lazyRetry(() => import('./pages/team/TeamRolesPage'));
const MaterialsPage = lazyRetry(() => import('./pages/materials/MaterialsPage'));
const SchedulePage = lazyRetry(() => import('./pages/schedule/SchedulePage'));
const OrgResultsPage = lazyRetry(() => import('./pages/results/ResultsPage'));
const OrgUsersPage = lazyRetry(() => import('./pages/org-users/OrgUsersPage'));
const OrgSettingsPage = lazyRetry(() => import('./pages/org-settings/OrgSettingsPage'));
const BranchesPage = lazyRetry(() => import('./pages/branches/BranchesPage'));
const TeacherProfilePage = lazyRetry(() => import('./pages/teacher-profile/TeacherProfilePage'));
const TeacherInvitesPage = lazyRetry(() => import('./pages/invites/TeacherInvitesPage'));
const NotificationsPage = lazyRetry(() => import('./pages/notifications/NotificationsPage'));
const TeacherSettingsPage = lazyRetry(() => import('./pages/teacher-settings/TeacherSettingsPage'));
// TeacherAnalyticsPage route uses AdminGradebookAnalytics component

// Detail Pages
const StudentDetailPage = lazyRetry(() => import('./pages/students/StudentDetailPage'));
const TeacherDetailPage = lazyRetry(() => import('./pages/teachers/TeacherDetailPage'));
const CourseDetailPage = lazyRetry(() => import('./pages/courses/CourseDetailPage'));
const GroupDetailPage = lazyRetry(() => import('./pages/groups/GroupDetailPage'));
const OrgUserDetailPage = lazyRetry(() => import('./pages/org-users/OrgUserDetailPage'));
const AdminUserDetailPage = lazyRetry(() => import('./pages/admin/AdminUserDetailPage'));
const AdminOrgDetailPage = lazyRetry(() => import('./pages/admin/AdminOrgDetailPage'));

// Directory Pages (Ecosystem)
const OrganizationsDirectoryPage = lazyRetry(() => import('./pages/directory/OrganizationsDirectoryPage'));
const PublicOrgProfilePage = lazyRetry(() => import('./pages/directory/PublicOrgProfilePage'));

// AI Leads CRM
const AILeadsPage = lazyRetry(() => import('./pages/leads/AILeadsPage'));

// AI Hub (owner-facing AI command center)
const AIHubPage = lazyRetry(() => import('./pages/ai/AIHubPage'));

// AI Coach (student-facing tutor / practice / plan / speaking)
const StudentAICoachPage = lazyRetry(() => import('./pages/student/StudentAICoachPage'));

// Admin Pages
const AdminDashboardPage = lazyRetry(() => import('./pages/admin/AdminDashboardPage'));
const AdminOrganizationsPage = lazyRetry(() => import('./pages/admin/AdminOrganizationsPage'));
const AdminUsersPage = lazyRetry(() => import('./pages/admin/AdminUsersPage'));
const AdminBillingPage = lazyRetry(() => import('./pages/admin/AdminBillingPage'));
const AdminAuditLogsPage = lazyRetry(() => import('./pages/admin/AdminAuditLogsPage'));
const AdminFeatureFlagsPage = lazyRetry(() => import('./pages/admin/AdminFeatureFlagsPage'));
const AdminSystemHealthPage = lazyRetry(() => import('./pages/admin/AdminSystemHealthPage'));
const AdminPlansPage = lazyRetry(() => import('./pages/admin/AdminPlansPage'));
const AdminIntegrationsPage = lazyRetry(() => import('./pages/admin/AdminIntegrationsPage'));
const AdminSettingsPage = lazyRetry(() => import('./pages/admin/AdminSettingsPage'));
const AdminDemoRequestsPage = lazyRetry(() => import('./pages/admin/AdminDemoRequestsPage'));
const AdminSupportPage = lazyRetry(() => import('./pages/admin/AdminSupportPage'));
const SupportPage = lazyRetry(() => import('./pages/support/SupportPage'));

const DocumentViewerPage = lazyRetry(() => import('./pages/viewer/DocumentViewerPage'));

const ThemedToaster = () => {
  const { isDark } = useTheme();
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '14px',
          background: isDark ? '#1e293b' : '#fff',
          color: isDark ? '#f1f5f9' : '#0f172a',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          boxShadow: isDark ? '0 10px 25px rgba(0,0,0,0.4)' : '0 10px 25px rgba(0,0,0,0.08)',
        },
      }}
    />
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <ThemedToaster />
        <PresenceHeartbeat />
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>}>
        <Routes>
          {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/vibecoder" element={<VibecoderPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/login" element={<LoginPage />} />
            {/* Self-service registration was removed — accounts are provisioned by
                admins (teachers/students) and super-admins (owners). Keep the path
                as a redirect so old links/bookmarks land on the login page. */}
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/tg-login" element={<TgLoginPage />} />
            <Route path="/parent/:token" element={<ParentPortalPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/directory" element={<OrganizationsDirectoryPage />} />
            <Route path="/org/:slug" element={<PublicOrgProfilePage />} />
            <Route path="/test/:examId" element={<PublicExamTakePage />} />

          {/* Exam Taking (full screen) */}
          <Route path="/take/:roomId" element={<ProtectedRoute><ExamTakePage /></ProtectedRoute>} />

          {/* Document Viewer (full screen) */}
          <Route path="/viewer" element={<DocumentViewerPage />} />

          {/* Quiz Taking & Hosting (full screen) */}
          <Route path="/quiz/join" element={<JoinQuizPage />} />
          <Route path="/quiz/play/:sessionId" element={<QuizPlayPage />} />
          <Route path="/quiz/sessions/:id" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><LiveSessionDashboard /></ProtectedRoute>} />



          {/* App Layout */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="dashboard" element={<DashboardPage />} />

            {/* Smart Journal & Gradebook */}
            <Route path="gradebook" element={<ProtectedRoute><PermissionRoute resource="gradebook"><PlanGuard feature="gradebook"><GradebookPage /></PlanGuard></PermissionRoute></ProtectedRoute>} />
            <Route path="journal" element={<ProtectedRoute><PermissionRoute resource="gradebook"><PlanGuard feature="gradebook"><JournalPage /></PlanGuard></PermissionRoute></ProtectedRoute>} />
            <Route path="teacher-analytics" element={<ProtectedRoute><PermissionRoute resource="analytics"><PlanGuard feature="advancedAnalytics"><AdminGradebookAnalytics /></PlanGuard></PermissionRoute></ProtectedRoute>} />
            <Route path="homework/review" element={<ProtectedRoute><PermissionRoute resource="homework"><HomeworkReviewPage /></PermissionRoute></ProtectedRoute>} />

            {/* Lessons */}
            <Route path="lessons" element={<ProtectedRoute><PermissionRoute resource="lessons"><LessonListPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="lessons/new" element={<ProtectedRoute><PermissionRoute resource="lessons" action="write"><LessonEditPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="lessons/:id" element={<ProtectedRoute><PermissionRoute resource="lessons"><LessonViewPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="lessons/:id/edit" element={<ProtectedRoute><PermissionRoute resource="lessons" action="write"><LessonEditPage /></PermissionRoute></ProtectedRoute>} />

            {/* Exams */}
            <Route path="exams" element={<ProtectedRoute><PermissionRoute resource="exams"><ExamListPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="exams/new" element={<ProtectedRoute><PermissionRoute resource="exams" action="write"><ExamEditPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="exams/:id" element={<ProtectedRoute><PermissionRoute resource="exams"><ExamViewPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="exams/:id/edit" element={<ProtectedRoute><PermissionRoute resource="exams" action="write"><ExamEditPage /></PermissionRoute></ProtectedRoute>} />

            {/* Rooms */}
            <Route path="rooms" element={<ProtectedRoute><PermissionRoute resource="rooms"><RoomListPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="rooms/:id" element={<ProtectedRoute><PermissionRoute resource="rooms"><RoomPage /></PermissionRoute></ProtectedRoute>} />

            {/* Student */}
            <Route path="join" element={<JoinRoomPage />} />
            <Route path="my-results" element={<MyResultsPage />} />
            <Route path="results/:attemptId" element={<ResultPage />} />
            <Route path="certificate/:certId" element={<CertificatePage />} />
            <Route path="certificates" element={<MyCertificatesPage />} />
            <Route path="achievements" element={<AchievementsPage />} />
            <Route path="catalog" element={<OrganizationsDirectoryPage />} />
            <Route path="org/:slug" element={<PublicOrgProfilePage />} />
            <Route path="student/courses" element={<ProtectedRoute allowedRoles={['student']}><StudentCoursesPage /></ProtectedRoute>} />
            <Route path="student/groups" element={<ProtectedRoute allowedRoles={['student']}><StudentGroupsPage /></ProtectedRoute>} />
            <Route path="student/teachers" element={<ProtectedRoute allowedRoles={['student']}><StudentTeachersPage /></ProtectedRoute>} />
            <Route path="diary" element={<ProtectedRoute allowedRoles={['student']}><StudentDiaryPage /></ProtectedRoute>} />

            <Route path="student/schedule" element={<ProtectedRoute allowedRoles={['student']}><StudentSchedulePage /></ProtectedRoute>} />
            <Route path="student/homework" element={<ProtectedRoute allowedRoles={['student']}><StudentHomeworkPage /></ProtectedRoute>} />
            <Route path="ai-coach" element={<ProtectedRoute allowedRoles={['student']}><StudentAICoachPage /></ProtectedRoute>} />



            {/* ═══ Quiz System ═══ */}
            <Route path="quiz/library" element={<ProtectedRoute><PermissionRoute resource="quizzes"><QuizLibraryPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="quiz/new" element={<ProtectedRoute><PermissionRoute resource="quizzes" action="write"><QuizBuilderPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="quiz/:id/edit" element={<ProtectedRoute><PermissionRoute resource="quizzes" action="write"><QuizBuilderPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="quiz/sessions" element={<ProtectedRoute><PermissionRoute resource="quizzes"><SessionHistoryPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="quiz/analytics/:id" element={<ProtectedRoute><PermissionRoute resource="quizzes"><SessionAnalyticsPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="profile" element={<StudentProfilePage />} />

            {/* Billing & Payments */}
            <Route path="billing" element={<ProtectedRoute allowedRoles={['admin']}><BillingPage /></ProtectedRoute>} />
            <Route path="payment/success" element={<PaymentSuccessPage />} />
            <Route path="payment/failure" element={<PaymentFailurePage />} />

            {/* ═══ Org Admin: Education ═══ */}
            <Route path="courses" element={<ProtectedRoute><PermissionRoute resource="courses"><CoursesPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="courses/:id" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher', 'student']}><CourseDetailPage /></ProtectedRoute>} />
            <Route path="finances" element={<ProtectedRoute><PermissionRoute resource="finances"><PlanGuard feature="finances"><FinancesPage /></PlanGuard></PermissionRoute></ProtectedRoute>} />
            <Route path="groups" element={<ProtectedRoute><PermissionRoute resource="groups"><GroupsPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="groups/:id" element={<ProtectedRoute><PermissionRoute resource="groups"><GroupDetailPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="materials" element={<ProtectedRoute><PermissionRoute resource="materials"><MaterialsPage /></PermissionRoute></ProtectedRoute>} />

            {/* ═══ Org Admin: People ═══ */}
            <Route path="leads" element={<ProtectedRoute><PermissionRoute resource="leads"><AILeadsPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="students" element={<ProtectedRoute><PermissionRoute resource="students"><StudentsPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="students/:uid" element={<ProtectedRoute><PermissionRoute resource="students"><StudentDetailPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="teachers" element={<ProtectedRoute><PermissionRoute resource="teachers"><TeachersPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="teachers/:uid" element={<ProtectedRoute><PermissionRoute resource="teachers"><TeacherDetailPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="team" element={<ProtectedRoute><PermissionRoute resource="team"><PlanGuard feature="rbac"><TeamRolesPage /></PlanGuard></PermissionRoute></ProtectedRoute>} />
            <Route path="org-users" element={<ProtectedRoute allowedRoles={['admin']}><OrgUsersPage /></ProtectedRoute>} />
            <Route path="org-users/:uid" element={<ProtectedRoute allowedRoles={['admin']}><OrgUserDetailPage /></ProtectedRoute>} />

            {/* ═══ Teacher (global) ═══ */}
            <Route path="teacher-profile" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherProfilePage /></ProtectedRoute>} />
            <Route path="invites" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherInvitesPage /></ProtectedRoute>} />
            <Route path="notifications" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher', 'student']}><NotificationsPage /></ProtectedRoute>} />
            <Route path="teacher-settings" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherSettingsPage /></ProtectedRoute>} />

            {/* ═══ Org Admin: Organization ═══ */}
            <Route path="schedule" element={<ProtectedRoute><PermissionRoute resource="schedule"><SchedulePage /></PermissionRoute></ProtectedRoute>} />
            <Route path="results" element={<ProtectedRoute><PermissionRoute resource="results"><OrgResultsPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="branches" element={<ProtectedRoute><PermissionRoute resource="branches"><PlanGuard feature="branches"><BranchesPage /></PlanGuard></PermissionRoute></ProtectedRoute>} />
            <Route path="org-settings" element={<ProtectedRoute><PermissionRoute resource="settings"><OrgSettingsPage /></PermissionRoute></ProtectedRoute>} />
            <Route path="ai" element={<ProtectedRoute><PermissionRoute resource="ai"><AIHubPage /></PermissionRoute></ProtectedRoute>} />

            {/* ═══ Super Admin Panel ═══ */}
            <Route path="admin" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminDashboardPage /></ProtectedRoute>} />
            <Route path="admin/organizations" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminOrganizationsPage /></ProtectedRoute>} />
            <Route path="admin/organizations/:id" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminOrgDetailPage /></ProtectedRoute>} />
            <Route path="admin/users" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminUsersPage /></ProtectedRoute>} />
            <Route path="admin/users/:uid" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminUserDetailPage /></ProtectedRoute>} />
            <Route path="admin/billing" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminBillingPage /></ProtectedRoute>} />
            <Route path="admin/analytics" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminDashboardPage /></ProtectedRoute>} />
            <Route path="admin/audit-logs" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminAuditLogsPage /></ProtectedRoute>} />
            <Route path="admin/system-health" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminSystemHealthPage /></ProtectedRoute>} />
            <Route path="admin/feature-flags" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminFeatureFlagsPage /></ProtectedRoute>} />
            <Route path="admin/plans" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminPlansPage /></ProtectedRoute>} />
            <Route path="admin/integrations" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminIntegrationsPage /></ProtectedRoute>} />
            <Route path="admin/settings" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminSettingsPage /></ProtectedRoute>} />
            <Route path="admin/demo-requests" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminDemoRequestsPage /></ProtectedRoute>} />
            <Route path="admin/support" element={<ProtectedRoute allowedRoles={['super_admin']}><AdminSupportPage /></ProtectedRoute>} />

            {/* Support is available to every signed-in user regardless of role,
                org membership or RBAC grants — a user who can't reach a feature
                is exactly the one who needs to ask about it. */}
            <Route path="support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
    </ThemeProvider>
  );
};

export default App;
