/**
 * Каждое действие панели должно быть узнаваемо ДО нажатия.
 *
 * «Перевод из группы в группу не работает» оказался не отказом сервера: в панели
 * стояли две одинаковые стрелки подряд, а в реальной организации и группа, и
 * филиал названы по фамилии («Махмутов А» — группа, «Зайнабетдинов» — филиал).
 * Нажали соседнюю — студентов «перевели» в филиал, где они и так были, и панель
 * ответила тем же зелёным «Переведено», что и настоящий перевод. Группа при этом
 * не менялась. Отсюда два требования, которые здесь и закреплены: у кнопки есть
 * имя, и она вызывает ровно то действие, которое обещает.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BulkActionBar from '../BulkActionBar';
import type { Branch, Group } from '../../../types';

vi.mock('../../../lib/api', () => ({
  orgBulkSetGroup: vi.fn().mockResolvedValue({ moved: 2, skipped: 0, unchanged: 0 }),
  orgBulkSetBranch: vi.fn().mockResolvedValue({ moved: 2, skipped: 0, unchanged: 0 }),
  orgBulkDeleteMembers: vi.fn().mockResolvedValue({ deleted: 0, skipped: 0 }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }),
}));
vi.mock('../../../contexts/PermissionsContext', () => ({
  usePermissions: () => ({ canWrite: () => true, canDelete: () => true, loaded: true }),
}));
const toasts: string[] = [];
type ToastFn = ((msg: string) => void) & { success: (msg: string) => void; error: (msg: string) => void };
vi.mock('react-hot-toast', () => {
  const toast = ((msg: string) => { toasts.push(`info:${msg}`); }) as ToastFn;
  toast.success = (msg: string) => { toasts.push(`success:${msg}`); };
  toast.error = (msg: string) => { toasts.push(`error:${msg}`); };
  return { default: toast, toast };
});

import { orgBulkSetGroup, orgBulkSetBranch } from '../../../lib/api';

// Both destinations are named after a person — exactly like the org this came from.
const GROUPS = [{ id: 'g1', name: 'Махмутов А' }] as unknown as Group[];
const BRANCHES = [{ id: 'b1', name: 'Зайнабетдинов' }] as unknown as Branch[];

const setup = () =>
  render(
    <BulkActionBar
      kind="student"
      selected={new Set(['s1', 's2'])}
      groups={GROUPS}
      branches={BRANCHES}
      onClear={() => {}}
      onDone={() => {}}
    />,
  );

beforeEach(() => { vi.clearAllMocks(); toasts.length = 0; });

describe('BulkActionBar', () => {
  it('names both destinations on the buttons, not just an arrow', () => {
    setup();
    expect(screen.getByRole('button', { name: /в группу/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /в филиал/i })).toBeInTheDocument();
  });

  it('the group button moves groups and never touches the branch', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('В группу'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByRole('button', { name: /в группу/i }));

    await waitFor(() => expect(orgBulkSetGroup).toHaveBeenCalledWith('student', ['s1', 's2'], 'g1'));
    expect(orgBulkSetBranch).not.toHaveBeenCalled();
  });

  it('the branch button moves branches and never touches the group', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('В филиал'), { target: { value: 'b1' } });
    fireEvent.click(screen.getByRole('button', { name: /в филиал/i }));

    await waitFor(() => expect(orgBulkSetBranch).toHaveBeenCalledWith('student', ['s1', 's2'], 'b1'));
    expect(orgBulkSetGroup).not.toHaveBeenCalled();
  });

  it('a migration that changed nothing does not report a move', async () => {
    vi.mocked(orgBulkSetBranch).mockResolvedValueOnce({ moved: 0, skipped: 0, unchanged: 2 });
    setup();
    fireEvent.change(screen.getByLabelText('В филиал'), { target: { value: 'b1' } });
    fireEvent.click(screen.getByRole('button', { name: /в филиал/i }));

    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(toasts.some(m => m.startsWith('success:'))).toBe(false);
    expect(toasts.join('|')).toContain('уже в этом филиале');
  });

  it('a real move still reports success', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('В группу'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByRole('button', { name: /в группу/i }));

    await waitFor(() => expect(toasts.some(m => m.startsWith('success:'))).toBe(true));
    expect(toasts.join('|')).toContain('Переведено в группу · 2');
  });
});
