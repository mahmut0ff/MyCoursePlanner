import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SuperAdminDashboard from './SuperAdminDashboard';
import AdminDashboard from './AdminDashboard';
import StudentDashboard from './StudentDashboard';

const DashboardPage: React.FC = () => {
  const { role } = useAuth();

  if (role === 'super_admin') return <SuperAdminDashboard />;
  if (role === 'admin' || role === 'teacher') return <AdminDashboard />;
  return <StudentDashboard />;
};

export default DashboardPage;
