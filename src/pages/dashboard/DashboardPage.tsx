import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminDashboard from './AdminDashboard';
import StudentDashboard from './StudentDashboard';

const DashboardPage: React.FC = () => {
  const { role } = useAuth();
  if (role === 'admin' || role === 'teacher') return <AdminDashboard />;
  return <StudentDashboard />;
};

export default DashboardPage;
