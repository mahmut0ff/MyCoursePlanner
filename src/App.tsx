import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
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

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Exam Taking (full screen, no sidebar) */}
          <Route
            path="/take/:roomId"
            element={
              <ProtectedRoute>
                <ExamTakePage />
              </ProtectedRoute>
            }
          />

          {/* App Layout Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
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
            <Route path="results" element={<MyResultsPage />} />
            <Route path="results/:attemptId" element={<ResultPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
