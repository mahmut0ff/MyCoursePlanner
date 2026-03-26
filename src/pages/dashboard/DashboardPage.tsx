import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminDashboard from './AdminDashboard';
import TeacherDashboard from './TeacherDashboard';
import StudentDashboard from './StudentDashboard';

const DashboardPage: React.FC = () => {
  const { role } = useAuth();

  // Super admin has their own dedicated panel
  if (role === 'super_admin') return <Navigate to="/admin" replace />;
  if (role === 'admin' || role === 'manager') return <AdminDashboard />;
  if (role === 'teacher') return <TeacherDashboard />;
  return <StudentDashboard />;
};

export default DashboardPage;
