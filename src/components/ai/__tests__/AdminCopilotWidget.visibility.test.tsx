import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fb?: string) => fb ?? _k, i18n: { language: 'ru' } }),
}));
vi.mock('../../../lib/api', () => ({
  apiAssistantChat: vi.fn(),
  apiAssistantExecute: vi.fn(),
  apiAssistantCapabilities: vi.fn().mockResolvedValue({ tools: [], aiEnabled: true }),
  apiAssistantImportParse: vi.fn(),
  apiAssistantImportCommit: vi.fn(),
}));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../contexts/PermissionsContext', () => ({ usePermissions: vi.fn() }));

import AdminCopilotWidget from '../AdminCopilotWidget';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermissions } from '../../../contexts/PermissionsContext';

/**
 * The copilot used to be gated on a hardcoded role list that included 'teacher',
 * so every teacher saw it regardless of their grants. It is now gated on `ai:read`.
 */
const setup = (auth: Record<string, unknown>, perms: { ai: boolean; loaded?: boolean }) => {
  (useAuth as any).mockReturnValue({ organizationId: 'org1', isSuperAdmin: false, ...auth });
  (usePermissions as any).mockReturnValue({
    loaded: perms.loaded ?? true,
    canRead: (r: string) => (r === 'ai' ? perms.ai : false),
  });
  return render(<MemoryRouter><AdminCopilotWidget /></MemoryRouter>);
};

describe('AdminCopilotWidget visibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows for someone holding the ai grant', () => {
    const { container } = setup({}, { ai: true });
    expect(container).not.toBeEmptyDOMElement();
  });

  it('hides from a teacher, who holds no ai grant by default', () => {
    const { container } = setup({}, { ai: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('hides from a student', () => {
    const { container } = setup({}, { ai: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('hides while permissions are still loading, so it cannot flash in', () => {
    // canRead returns false until grants arrive; without the loaded check the
    // button would appear and then vanish for anyone who should not have it.
    const { container } = setup({}, { ai: true, loaded: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('hides from super admins, who work above any single organization', () => {
    const { container } = setup({ isSuperAdmin: true }, { ai: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('hides outside an organization', () => {
    expect(setup({ organizationId: null }, { ai: true }).container).toBeEmptyDOMElement();
    expect(setup({ organizationId: 'personal' }, { ai: true }).container).toBeEmptyDOMElement();
  });
});
