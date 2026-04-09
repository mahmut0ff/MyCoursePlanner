import React, { lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PlanGuard from './components/guards/PlanGuard';
import AppLayout from './components/layout/AppLayout';
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ParentPortalPage = lazy(() => import('./pages/parent/ParentPortalPage'));
const OnboardingPage = lazy(() => import('./pages/auth/OnboardingPage'));

const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const GradebookPage = lazy(() => import('./pages/gradebook/GradebookPage'));
const JournalPage = lazy(() => import('./pages/journal/JournalPage'));
const AdminGradebookAnalytics = lazy(() => import('./pages/admin/AdminGradebookAnalytics'));
const LessonListPage = lazy(() => import('./pages/lessons/LessonListPage'));
const LessonEditPage = lazy(() => import('./pages/lessons/LessonEditPage'));
const LessonViewPage = lazy(() => import('./pages/lessons/LessonViewPage'));
const ExamListPage = lazy(() => import('./pages/exams/ExamListPage'));
const ExamEditPage = lazy(() => import('./pages/exams/ExamEditPage'));
const ExamViewPage = lazy(() => import('./pages/exams/ExamViewPage'));
const RoomListPage = lazy(() => import('./pages/rooms/RoomListPage'));
const RoomPage = lazy(() => import('./pages/rooms/RoomPage'));
const JoinRoomPage = lazy(() => import('./pages/rooms/JoinRoomPage'));
const ExamTakePage = lazy(() => import('./pages/rooms/ExamTakePage'));
const ResultPage = lazy(() => import('./pages/rooms/ResultPage'));
const MyResultsPage = lazy(() => import('./pages/rooms/MyResultsPage'));
const BillingPage = lazy(() => import('./pages/billing/BillingPage'));
const CertificatePage = lazy(() => import('./pages/certificates/CertificatePage'));
const MyCertificatesPage = lazy(() => import('./pages/certificates/MyCertificatesPage'));
const PaymentSuccessPage = lazy(() => import('./pages/billing/PaymentSuccessPage'));
const PaymentFailurePage = lazy(() => import('./pages/billing/PaymentFailurePage'));
const StudentProfilePage = lazy(() => import('./pages/profile/StudentProfilePage'));
const AchievementsPage = lazy(() => import('./pages/achievements/AchievementsPage'));
const StudentDiaryPage = lazy(() => import('./pages/student/StudentDiaryPage'));
const StudentProgressPage = lazy(() => import('./pages/student/StudentProgressPage'));
const StudentCoursesPage = lazy(() => import('./pages/student/StudentCoursesPage'));
const StudentTeachersPage = lazy(() => import('./pages/student/StudentTeachersPage'));
const StudentGroupsPage = lazy(() => import('./pages/student/StudentGroupsPage'));
const StudentSchedulePage = lazy(() => import('./pages/student/StudentSchedulePage'));

// Co-Study
const StudyRoomListPage = lazy(() => import('./pages/student/StudyRoomListPage'));
const StudyRoomPage = lazy(() => import('./pages/student/StudyRoomPage'));

// Quiz Pages
const QuizLibraryPage = lazy(() => import('./pages/quiz/QuizLibraryPage'));
const QuizBuilderPage = lazy(() => import('./pages/quiz/QuizBuilderPage'));
const LiveSessionDashboard = lazy(() => import('./pages/quiz/LiveSessionDashboard'));
const SessionHistoryPage = lazy(() => import('./pages/quiz/SessionHistoryPage'));
const SessionAnalyticsPage = lazy(() => import('./pages/quiz/SessionAnalyticsPage'));
const JoinQuizPage = lazy(() => import('./pages/quiz/JoinQuizPage'));
const QuizPlayPage = lazy(() => import('./pages/quiz/QuizPlayPage'));

// Mega Features
const StudentRiskDashboard = lazy(() => import('./pages/teacher-analytics/StudentRiskDashboard'));
const HomeworkReviewPage = lazy(() => import('./pages/homework/HomeworkReviewPage'));

// Org Pages
const CoursesPage = lazy(() => import('./pages/courses/CoursesPage'));
const FinancesPage = lazy(() => import('./pages/finances/FinancesPage'));
const GroupsPage = lazy(() => import('./pages/groups/GroupsPage'));
const StudentsPage = lazy(() => import('./pages/students/StudentsPage'));
const TeachersPage = lazy(() => import('./pages/teachers/TeachersPage'));
const ManagersPage = lazy(() => import('./pages/managers/ManagersPage'));
const MaterialsPage = lazy(() => import('./pages/materials/MaterialsPage'));
const SchedulePage = lazy(() => import('./pages/schedule/SchedulePage'));
const OrgResultsPage = lazy(() => import('./pages/results/ResultsPage'));
const OrgUsersPage = lazy(() => import('./pages/org-users/OrgUsersPage'));
const OrgSettingsPage = lazy(() => import('./pages/org-settings/OrgSettingsPage'));
const BranchesPage = lazy(() => import('./pages/branches/BranchesPage'));
const TeacherProfilePage = lazy(() => import('./pages/teacher-profile/TeacherProfilePage'));
const TeacherInvitesPage = lazy(() => import('./pages/invites/TeacherInvitesPage'));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'));
const TeacherSettingsPage = lazy(() => import('./pages/teacher-settings/TeacherSettingsPage'));
// TeacherAnalyticsPage route uses AdminGradebookAnalytics component

// Detail Pages
const StudentDetailPage = lazy(() => import('./pages/students/StudentDetailPage'));
const TeacherDetailPage = lazy(() => import('./pages/teachers/TeacherDetailPage'));
const ManagerDetailPage = lazy(() => import('./pages/managers/ManagerDetailPage'));
const CourseDetailPage = lazy(() => import('./pages/courses/CourseDetailPage'));
const GroupDetailPage = lazy(() => import('./pages/groups/GroupDetailPage'));
const OrgUserDetailPage = lazy(() => import('./pages/org-users/OrgUserDetailPage'));
const AdminUserDetailPage = lazy(() => import('./pages/admin/AdminUserDetailPage'));
const AdminOrgDetailPage = lazy(() => import('./pages/admin/AdminOrgDetailPage'));

// Directory Pages (Ecosystem)
const OrganizationsDirectoryPage = lazy(() => import('./pages/directory/OrganizationsDirectoryPage'));
const PublicOrgProfilePage = lazy(() => import('./pages/directory/PublicOrgProfilePage'));

// AI Leads CRM
const AILeadsPage = lazy(() => import('./pages/leads/AILeadsPage'));

// Admin Pages
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminOrganizationsPage = lazy(() => import('./pages/admin/AdminOrganizationsPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminBillingPage = lazy(() => import('./pages/admin/AdminBillingPage'));
const AdminAuditLogsPage = lazy(() => import('./pages/admin/AdminAuditLogsPage'));
const AdminFeatureFlagsPage = lazy(() => import('./pages/admin/AdminFeatureFlagsPage'));
const AdminSystemHealthPage = lazy(() => import('./pages/admin/AdminSystemHealthPage'));
const AdminPlansPage = lazy(() => import('./pages/admin/AdminPlansPage'));
const AdminIntegrationsPage = lazy(() => import('./pages/admin/AdminIntegrationsPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));

const DocumentViewerPage = lazy(() => import('./pages/viewer/DocumentViewerPage'));

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
    <AuthProvider>
      <BrowserRouter>
        <ThemedToaster />
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>}>
        <Routes>
          {/* Public */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/parent/:token" element={<ParentPortalPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/directory" element={<OrganizationsDirectoryPage />} />
            <Route path="/org/:slug" element={<PublicOrgProfilePage />} />

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
            <Route path="gradebook" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><PlanGuard feature="gradebook"><GradebookPage /></PlanGuard></ProtectedRoute>} />
            <Route path="journal" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><PlanGuard feature="gradebook"><JournalPage /></PlanGuard></ProtectedRoute>} />
            <Route path="teacher-analytics" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><PlanGuard feature="advancedAnalytics"><AdminGradebookAnalytics /></PlanGuard></ProtectedRoute>} />
            <Route path="risk-dashboard" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><PlanGuard feature="advancedAnalytics"><StudentRiskDashboard /></PlanGuard></ProtectedRoute>} />
            <Route path="homework/review" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><HomeworkReviewPage /></ProtectedRoute>} />

            {/* Lessons */}
            <Route path="lessons" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher', 'student']}><LessonListPage /></ProtectedRoute>} />
            <Route path="lessons/new" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><LessonEditPage /></ProtectedRoute>} />
            <Route path="lessons/:id" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher', 'student']}><LessonViewPage /></ProtectedRoute>} />
            <Route path="lessons/:id/edit" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><LessonEditPage /></ProtectedRoute>} />

            {/* Exams */}
            <Route path="exams" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><ExamListPage /></ProtectedRoute>} />
            <Route path="exams/new" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><ExamEditPage /></ProtectedRoute>} />
            <Route path="exams/:id" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><ExamViewPage /></ProtectedRoute>} />
            <Route path="exams/:id/edit" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><ExamEditPage /></ProtectedRoute>} />

            {/* Rooms */}
            <Route path="rooms" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><RoomListPage /></ProtectedRoute>} />
            <Route path="rooms/:id" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><RoomPage /></ProtectedRoute>} />

            {/* Student */}
            <Route path="join" element={<JoinRoomPage />} />
            <Route path="my-results" element={<MyResultsPage />} />
            <Route path="results/:attemptId" element={<ResultPage />} />
            <Route path="certificate/:certId" element={<CertificatePage />} />
            <Route path="certificates" element={<MyCertificatesPage />} />
            <Route path="achievements" element={<AchievementsPage />} />
            <Route path="catalog" element={<OrganizationsDirectoryPage />} />
            <Route path="student/courses" element={<ProtectedRoute allowedRoles={['student']}><StudentCoursesPage /></ProtectedRoute>} />
            <Route path="student/groups" element={<ProtectedRoute allowedRoles={['student']}><StudentGroupsPage /></ProtectedRoute>} />
            <Route path="student/teachers" element={<ProtectedRoute allowedRoles={['student']}><StudentTeachersPage /></ProtectedRoute>} />
            <Route path="diary" element={<ProtectedRoute allowedRoles={['student']}><StudentDiaryPage /></ProtectedRoute>} />
            <Route path="progress" element={<ProtectedRoute allowedRoles={['student']}><StudentProgressPage /></ProtectedRoute>} />
            <Route path="student/schedule" element={<ProtectedRoute allowedRoles={['student']}><StudentSchedulePage /></ProtectedRoute>} />

            {/* Co-Study Rooms */}
            <Route path="study-rooms" element={<StudyRoomListPage />} />
            <Route path="study-rooms/:id" element={<StudyRoomPage />} />

            {/* ═══ Quiz System ═══ */}
            <Route path="quiz/library" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><QuizLibraryPage /></ProtectedRoute>} />
            <Route path="quiz/new" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><QuizBuilderPage /></ProtectedRoute>} />
            <Route path="quiz/:id/edit" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><QuizBuilderPage /></ProtectedRoute>} />
            <Route path="quiz/sessions" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><SessionHistoryPage /></ProtectedRoute>} />
            <Route path="quiz/analytics/:id" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><SessionAnalyticsPage /></ProtectedRoute>} />
            <Route path="profile" element={<StudentProfilePage />} />

            {/* Billing & Payments */}
            <Route path="billing" element={<ProtectedRoute allowedRoles={['admin']}><BillingPage /></ProtectedRoute>} />
            <Route path="payment/success" element={<PaymentSuccessPage />} />
            <Route path="payment/failure" element={<PaymentFailurePage />} />

            {/* ═══ Org Admin: Education ═══ */}
            <Route path="courses" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><CoursesPage /></ProtectedRoute>} />
            <Route path="courses/:id" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><CourseDetailPage /></ProtectedRoute>} />
            <Route path="finances" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><PlanGuard feature="finances"><FinancesPage /></PlanGuard></ProtectedRoute>} />
            <Route path="groups" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><GroupsPage /></ProtectedRoute>} />
            <Route path="groups/:id" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><GroupDetailPage /></ProtectedRoute>} />
            <Route path="materials" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><MaterialsPage /></ProtectedRoute>} />

            {/* ═══ Org Admin: People ═══ */}
            <Route path="leads" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><AILeadsPage /></ProtectedRoute>} />
            <Route path="students" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><StudentsPage /></ProtectedRoute>} />
            <Route path="students/:uid" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><StudentDetailPage /></ProtectedRoute>} />
            <Route path="teachers" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><TeachersPage /></ProtectedRoute>} />
            <Route path="teachers/:uid" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><TeacherDetailPage /></ProtectedRoute>} />
            <Route path="managers" element={<ProtectedRoute allowedRoles={['admin']}><ManagersPage /></ProtectedRoute>} />
            <Route path="managers/:uid" element={<ProtectedRoute allowedRoles={['admin']}><ManagerDetailPage /></ProtectedRoute>} />
            <Route path="org-users" element={<ProtectedRoute allowedRoles={['admin']}><OrgUsersPage /></ProtectedRoute>} />
            <Route path="org-users/:uid" element={<ProtectedRoute allowedRoles={['admin']}><OrgUserDetailPage /></ProtectedRoute>} />

            {/* ═══ Teacher (global) ═══ */}
            <Route path="teacher-profile" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherProfilePage /></ProtectedRoute>} />
            <Route path="invites" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherInvitesPage /></ProtectedRoute>} />
            <Route path="notifications" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher', 'student']}><NotificationsPage /></ProtectedRoute>} />
            <Route path="teacher-settings" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherSettingsPage /></ProtectedRoute>} />

            {/* ═══ Org Admin: Organization ═══ */}
            <Route path="schedule" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><SchedulePage /></ProtectedRoute>} />
            <Route path="results" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'teacher']}><OrgResultsPage /></ProtectedRoute>} />
            <Route path="branches" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><PlanGuard feature="branches"><BranchesPage /></PlanGuard></ProtectedRoute>} />
            <Route path="org-settings" element={<ProtectedRoute allowedRoles={['admin']}><OrgSettingsPage /></ProtectedRoute>} />

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
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
