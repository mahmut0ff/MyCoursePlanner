import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ExamTakePage from '../ExamTakePage';

// Mocks
vi.mock('../../../lib/api', () => ({
  apiGetRoom: vi.fn(),
  apiGetExam: vi.fn(),
  apiSaveAttempt: vi.fn(),
  apiAwardXP: vi.fn()
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn()
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useParams: () => ({ roomId: 'room-123' }),
    useNavigate: () => vi.fn()
  };
});

import { apiGetRoom } from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';

describe('ExamTakePage (UI Contracts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({ profile: { uid: 'student123', organizationId: 'org-A' } });
  });

  it('C-UI-04: When fetching room details, if status is loading, a Loader2 MUST be present', () => {
    // Return a never-resolving promise to simulate loading
    (apiGetRoom as any).mockImplementation(() => new Promise(() => {}));

    render(
      <MemoryRouter>
        <ExamTakePage />
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toBeInTheDocument(); // Loader2 mapped to role='status' implicitly or by class
  });

  it('C-UI-05: If the room is mapped to a different organizationId, rendering fails to "Room Not Found"', async () => {
    (apiGetRoom as any).mockResolvedValue({
      id: 'room-123',
      organizationId: 'org-B', // Different tenant
      status: 'active'
    });

    render(
      <MemoryRouter>
        <ExamTakePage />
      </MemoryRouter>
    );

    // Assuming the page handles this mismatch by showing an error
    await waitFor(() => {
      expect(screen.getByText('rooms.errors.notFound')).toBeInTheDocument();
    });
  });
});
