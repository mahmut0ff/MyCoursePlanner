import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }),
}));
vi.mock('../../../lib/api', () => ({ apiGetMyMemberships: vi.fn() }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));

import ActiveOrgCard from '../ActiveOrgCard';
import { apiGetMyMemberships } from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext';

const TWO_ORGS = [
  { organizationId: 'o1', organizationName: 'My Academy', role: 'student', status: 'active' },
  { organizationId: 'o2', organizationName: 'Second Center', role: 'student', status: 'active' },
];

const setup = (memberships: any[], switchOrganization = vi.fn()) => {
  (apiGetMyMemberships as any).mockResolvedValue(memberships);
  (useAuth as any).mockReturnValue({ organizationId: 'o1', switchOrganization });
  return { switchOrganization, ...render(<ActiveOrgCard />) };
};

describe('ActiveOrgCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists every active organization once the user has more than one', async () => {
    setup(TWO_ORGS);
    await waitFor(() => expect(screen.getByText('My Academy')).toBeInTheDocument());
    expect(screen.getByText('Second Center')).toBeInTheDocument();
    expect(screen.getByText('Активный учебный центр')).toBeInTheDocument();
  });

  it('renders nothing for a single-org member', async () => {
    const { container } = setup([TWO_ORGS[0]]);
    await waitFor(() => expect(apiGetMyMemberships).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when memberships cannot be loaded', async () => {
    (apiGetMyMemberships as any).mockRejectedValue(new Error('offline'));
    (useAuth as any).mockReturnValue({ organizationId: 'o1', switchOrganization: vi.fn() });
    const { container } = render(<ActiveOrgCard />);
    await waitFor(() => expect(apiGetMyMemberships).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('ignores non-active memberships when counting', async () => {
    const { container } = setup([TWO_ORGS[0], { ...TWO_ORGS[1], status: 'pending' }]);
    await waitFor(() => expect(apiGetMyMemberships).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('switches to another organization', async () => {
    const switchOrganization = vi.fn().mockResolvedValue(undefined);
    setup(TWO_ORGS, switchOrganization);
    await waitFor(() => expect(screen.getByText('Second Center')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Second Center'));
    await waitFor(() => expect(switchOrganization).toHaveBeenCalledWith('o2'));
  });

  it('does not re-switch to the organization already active', async () => {
    const switchOrganization = vi.fn();
    setup(TWO_ORGS, switchOrganization);
    await waitFor(() => expect(screen.getByText('My Academy')).toBeInTheDocument());

    fireEvent.click(screen.getByText('My Academy'));
    expect(switchOrganization).not.toHaveBeenCalled();
  });
});
