import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../DashboardPage';

// Mock context correctly
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: any) => <div>{children}</div>
}));

// Mock the nested components to verify which one renders
vi.mock('../AdminDashboard', () => ({
  default: () => <div data-testid="admin-dashboard">Admin Panel</div>
}));
vi.mock('../TeacherDashboard', () => ({
  default: () => <div data-testid="teacher-dashboard">Teacher Panel</div>
}));
vi.mock('../StudentDashboard', () => ({
  default: () => <div data-testid="student-dashboard">Student Panel</div>
}));

import { useAuth } from '../../../contexts/AuthContext';

describe('DashboardPage (UI Contracts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('C-UI-01: Given user.role === "student", the dashboard MUST render <StudentDashboard />', () => {
    (useAuth as any).mockReturnValue({ role: 'student' });
    
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    
    expect(screen.getByTestId('student-dashboard')).toBeInTheDocument();
  });

  it('C-UI-03: The UI MUST NOT render Admin or Teacher widgets when role is student', () => {
    (useAuth as any).mockReturnValue({ role: 'student' });
    
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    
    expect(screen.queryByTestId('admin-dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('teacher-dashboard')).not.toBeInTheDocument();
  });
});
