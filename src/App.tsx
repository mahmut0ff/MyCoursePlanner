import React from 'react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PlanGuard from './components/guards/PlanGuard';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ParentPortalPage from './pages/parent/ParentPortalPage';
import OnboardingPage from './pages/auth/OnboardingPage';

import DashboardPage from './pages/dashboard/DashboardPage';
import GradebookPage from './pages/gradebook/GradebookPage';
import JournalPage from './pages/journal/JournalPage';
import AdminGradebookAnalytics from './pages/admin/AdminGradebookAnalytics';
import LessonListPage from './pages/lessons/LessonListPage';
import LessonEditPage from './pages/lessons/LessonEditPage';
import LessonViewPage from './pages/lessons/LessonViewPage';
import ExamListPage from './pages/exams/ExamListPage';
import ExamEditPage from './pages/exams/ExamEditPage';
import ExamViewPage from './pages/exams/ExamViewPage';
import RoomListPage from './pages/rooms/RoomListPage';
import RoomPage from './pages/rooms/RoomPage';
import JoinRoomPage from './pages/rooms/JoinRoomPage';
import ExamTakePage from './pages/rooms/ExamTakePage';
import ResultPage from './pages/rooms/ResultPage';
import MyResultsPage from './pages/rooms/MyResultsPage';
import BillingPage from './pages/billing/BillingPage';
import CertificatePage from './pages/certificates/CertificatePage';
import MyCertificatesPage from './pages/certificates/MyCertificatesPage';
import PaymentSuccessPage from './pages/billing/PaymentSuccessPage';
import PaymentFailurePage from './pages/billing/PaymentFailurePage';
import StudentProfilePage from './pages/profile/StudentProfilePage';
import AchievementsPage from './pages/achievements/AchievementsPage';
import StudentDiaryPage from './pages/student/StudentDiaryPage';
import StudentProgressPage from './pages/student/StudentProgressPage';
import StudentCoursesPage from './pages/student/StudentCoursesPage';
import StudentTeachersPage from './pages/student/StudentTeachersPage';
import StudentGroupsPage from './pages/student/StudentGroupsPage';
import StudentSchedulePage from './pages/student/StudentSchedulePage';

// Quiz Pages
import QuizLibraryPage from './pages/quiz/QuizLibraryPage';
import QuizBuilderPage from './pages/quiz/QuizBuilderPage';
import LiveSessionDashboard from './pages/quiz/LiveSessionDashboard';
import SessionHistoryPage from './pages/quiz/SessionHistoryPage';
import SessionAnalyticsPage from './pages/quiz/SessionAnalyticsPage';
import JoinQuizPage from './pages/quiz/JoinQuizPage';
import QuizPlayPage from './pages/quiz/QuizPlayPage';

// Mega Features
import StudentRiskDashboard from './pages/teacher-analytics/StudentRiskDashboard';
import HomeworkReviewPage from './pages/homework/HomeworkReviewPage';

// Org Pages
import CoursesPage from './pages/courses/CoursesPage';
import FinancesPage from './pages/finances/FinancesPage';
import GroupsPage from './pages/groups/GroupsPage';
import StudentsPage from './pages/students/StudentsPage';
import TeachersPage from './pages/teachers/TeachersPage';
import ManagersPage from './pages/managers/ManagersPage';
import MaterialsPage from './pages/materials/MaterialsPage';
import SchedulePage from './pages/schedule/SchedulePage';
import OrgResultsPage from './pages/results/ResultsPage';
import OrgUsersPage from './pages/org-users/OrgUsersPage';
import OrgSettingsPage from './pages/org-settings/OrgSettingsPage';
import BranchesPage from './pages/branches/BranchesPage';
import TeacherProfilePage from './pages/teacher-profile/TeacherProfilePage';
import TeacherInvitesPage from './pages/invites/TeacherInvitesPage';
import NotificationsPage from './pages/notifications/NotificationsPage';
import TeacherSettingsPage from './pages/teacher-settings/TeacherSettingsPage';
// TeacherAnalyticsPage route uses AdminGradebookAnalytics component

// Detail Pages
import StudentDetailPage from './pages/students/StudentDetailPage';
import TeacherDetailPage from './pages/teachers/TeacherDetailPage';
import ManagerDetailPage from './pages/managers/ManagerDetailPage';
import CourseDetailPage from './pages/courses/CourseDetailPage';
import GroupDetailPage from './pages/groups/GroupDetailPage';
import OrgUserDetailPage from './pages/org-users/OrgUserDetailPage';
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage';
import AdminOrgDetailPage from './pages/admin/AdminOrgDetailPage';

// Directory Pages (Ecosystem)
import OrganizationsDirectoryPage from './pages/directory/OrganizationsDirectoryPage';
import PublicOrgProfilePage from './pages/directory/PublicOrgProfilePage';

// Admin Pages
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminOrganizationsPage from './pages/admin/AdminOrganizationsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminBillingPage from './pages/admin/AdminBillingPage';
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage';
import AdminFeatureFlagsPage from './pages/admin/AdminFeatureFlagsPage';
import AdminSystemHealthPage from './pages/admin/AdminSystemHealthPage';
import AdminPlansPage from './pages/admin/AdminPlansPage';
import AdminIntegrationsPage from './pages/admin/AdminIntegrationsPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';

import DocumentViewerPage from './pages/viewer/DocumentViewerPage';

const App: React.FC = () => {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3000, style: { borderRadius: '12px', padding: '12px 16px', fontSize: '14px' } }} />
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
            <Route path="directory" element={<OrganizationsDirectoryPage />} />
            <Route path="student/courses" element={<ProtectedRoute allowedRoles={['student']}><StudentCoursesPage /></ProtectedRoute>} />
            <Route path="student/groups" element={<ProtectedRoute allowedRoles={['student']}><StudentGroupsPage /></ProtectedRoute>} />
            <Route path="student/teachers" element={<ProtectedRoute allowedRoles={['student']}><StudentTeachersPage /></ProtectedRoute>} />
            <Route path="diary" element={<ProtectedRoute allowedRoles={['student']}><StudentDiaryPage /></ProtectedRoute>} />
            <Route path="progress" element={<ProtectedRoute allowedRoles={['student']}><StudentProgressPage /></ProtectedRoute>} />
            <Route path="student/schedule" element={<ProtectedRoute allowedRoles={['student']}><StudentSchedulePage /></ProtectedRoute>} />

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
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
