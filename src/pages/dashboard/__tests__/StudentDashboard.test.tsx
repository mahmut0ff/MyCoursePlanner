import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentDashboard from '../StudentDashboard';

// Mock API and translation
vi.mock('../../../lib/api', () => ({
  apiGetDashboard: vi.fn()
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn()
}));

// Mock Gamification Widget to avoid complex deep renders
vi.mock('../../../components/gamification/GamificationWidget', () => ({
  default: () => <div data-testid="gamification-widget">Gamification</div>
}));

import { apiGetDashboard } from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';

describe('StudentDashboard (UI Contracts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({ profile: { uid: 'student123', displayName: 'John Doe' } });
  });

  it('C-UI-02: Given data fetching returns empty arrays, it MUST render clear empty state text', async () => {
    // Return empty results
    (apiGetDashboard as any).mockResolvedValue({
      recentLessons: [],
      recentAttempts: []
    });

    render(
      <MemoryRouter>
        <StudentDashboard />
      </MemoryRouter>
    );

    // Wait for the loading skeleton to unmount
    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument();
    });

    // Expect the specific string keys for empty states to render
    expect(screen.getByText('lessons.noLessons')).toBeInTheDocument();
    expect(screen.getByText('studentDashboard.noExams')).toBeInTheDocument();
  });
});
