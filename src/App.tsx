import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardPage from './pages/dashboard/DashboardPage';
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

// Org Pages
import CoursesPage from './pages/courses/CoursesPage';
import GroupsPage from './pages/groups/GroupsPage';
import StudentsPage from './pages/students/StudentsPage';
import TeachersPage from './pages/teachers/TeachersPage';
import MaterialsPage from './pages/materials/MaterialsPage';
import SchedulePage from './pages/schedule/SchedulePage';
import OrgResultsPage from './pages/results/ResultsPage';
import OrgUsersPage from './pages/org-users/OrgUsersPage';
import OrgSettingsPage from './pages/org-settings/OrgSettingsPage';
import TeacherProfilePage from './pages/teacher-profile/TeacherProfilePage';
import TeacherInvitesPage from './pages/invites/TeacherInvitesPage';

// Detail Pages
import StudentDetailPage from './pages/students/StudentDetailPage';
import TeacherDetailPage from './pages/teachers/TeacherDetailPage';
import CourseDetailPage from './pages/courses/CourseDetailPage';
import GroupDetailPage from './pages/groups/GroupDetailPage';
import OrgUserDetailPage from './pages/org-users/OrgUserDetailPage';
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage';
import AdminOrgDetailPage from './pages/admin/AdminOrgDetailPage';

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

const App: React.FC = () => {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Exam Taking (full screen) */}
          <Route path="/take/:roomId" element={<ProtectedRoute><ExamTakePage /></ProtectedRoute>} />

          {/* App Layout */}
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />

            {/* Lessons */}
            <Route path="lessons" element={<LessonListPage />} />
            <Route path="lessons/new" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><LessonEditPage /></ProtectedRoute>} />
            <Route path="lessons/:id" element={<LessonViewPage />} />
            <Route path="lessons/:id/edit" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><LessonEditPage /></ProtectedRoute>} />

            {/* Exams */}
            <Route path="exams" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><ExamListPage /></ProtectedRoute>} />
            <Route path="exams/new" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><ExamEditPage /></ProtectedRoute>} />
            <Route path="exams/:id" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><ExamViewPage /></ProtectedRoute>} />
            <Route path="exams/:id/edit" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><ExamEditPage /></ProtectedRoute>} />

            {/* Rooms */}
            <Route path="rooms" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><RoomListPage /></ProtectedRoute>} />
            <Route path="rooms/:id" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><RoomPage /></ProtectedRoute>} />

            {/* Student */}
            <Route path="join" element={<JoinRoomPage />} />
            <Route path="my-results" element={<MyResultsPage />} />
            <Route path="results/:attemptId" element={<ResultPage />} />

            {/* Billing */}
            <Route path="billing" element={<ProtectedRoute allowedRoles={['admin']}><BillingPage /></ProtectedRoute>} />

            {/* ═══ Org Admin: Education ═══ */}
            <Route path="courses" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><CoursesPage /></ProtectedRoute>} />
            <Route path="courses/:id" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><CourseDetailPage /></ProtectedRoute>} />
            <Route path="groups" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><GroupsPage /></ProtectedRoute>} />
            <Route path="groups/:id" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><GroupDetailPage /></ProtectedRoute>} />
            <Route path="materials" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><MaterialsPage /></ProtectedRoute>} />

            {/* ═══ Org Admin: People ═══ */}
            <Route path="students" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><StudentsPage /></ProtectedRoute>} />
            <Route path="students/:uid" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><StudentDetailPage /></ProtectedRoute>} />
            <Route path="teachers" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><TeachersPage /></ProtectedRoute>} />
            <Route path="teachers/:uid" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><TeacherDetailPage /></ProtectedRoute>} />
            <Route path="org-users" element={<ProtectedRoute allowedRoles={['admin']}><OrgUsersPage /></ProtectedRoute>} />
            <Route path="org-users/:uid" element={<ProtectedRoute allowedRoles={['admin']}><OrgUserDetailPage /></ProtectedRoute>} />

            {/* ═══ Teacher (global) ═══ */}
            <Route path="teacher-profile" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherProfilePage /></ProtectedRoute>} />
            <Route path="invites" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherInvitesPage /></ProtectedRoute>} />

            {/* ═══ Org Admin: Organization ═══ */}
            <Route path="schedule" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><SchedulePage /></ProtectedRoute>} />
            <Route path="results" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><OrgResultsPage /></ProtectedRoute>} />
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
