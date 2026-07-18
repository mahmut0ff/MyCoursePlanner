import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SupportComposer from '../SupportComposer';
import { SUPPORT_QUICK_REPLIES } from '../../../lib/supportQuickReplies';

// The composer only needs the Russian fallback that every t() call already
// carries, so resolve keys to their default rather than booting i18next.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: any, opts?: any) => {
      if (typeof fallback !== 'string') return _key;
      return fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(opts?.[k] ?? ''));
    },
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// Storage uploads are exercised by the emulator-free path only; the composer's
// contract here is the «/» picker and the send handshake.
vi.mock('../../../lib/useSupport', () => ({
  uploadSupportAttachment: vi.fn(),
  SUPPORT_MAX_FILE_SIZE: 50 * 1024 * 1024,
}));

const copilotVisible = vi.fn(() => false);
vi.mock('../../ai/useCopilotVisible', () => ({
  useCopilotVisible: () => copilotVisible(),
}));

function setup(props: Partial<React.ComponentProps<typeof SupportComposer>> = {}) {
  const onSend = vi.fn().mockResolvedValue(undefined);
  const onCancelReply = vi.fn();
  const { container } = render(
    <SupportComposer
      uploadUserId="user_alice"
      replyTo={null}
      onCancelReply={onCancelReply}
      onSend={onSend}
      enableQuickReplies
      {...props}
    />,
  );
  return {
    onSend, onCancelReply, container,
    field: screen.getByRole('textbox') as HTMLTextAreaElement,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  copilotVisible.mockReturnValue(false);
});

describe('SupportComposer — copilot collision', () => {
  // Regression: the copilot FAB is `fixed` bottom-right at z-[60], so it painted
  // over the send button and swallowed the click. Sending looked like a no-op —
  // no toast, no network request.
  it('reserves the corner while the copilot FAB is on screen', () => {
    copilotVisible.mockReturnValue(true);
    const { container } = setup();
    expect(container.firstElementChild?.className).toContain('pr-[5.5rem]');
  });

  it('claims no extra space when the FAB is absent', () => {
    copilotVisible.mockReturnValue(false);
    const { container } = setup();
    expect(container.firstElementChild?.className).not.toContain('pr-[5.5rem]');
  });
});

describe('SupportComposer — quick replies', () => {
  it('ships fifteen templates', () => {
    expect(SUPPORT_QUICK_REPLIES).toHaveLength(15);
    // Ids key the i18n entries, so duplicates would silently collide.
    expect(new Set(SUPPORT_QUICK_REPLIES.map((q) => q.id)).size).toBe(15);
    expect(new Set(SUPPORT_QUICK_REPLIES.map((q) => q.shortcut)).size).toBe(15);
  });

  it('opens the picker on a leading «/» and lists every template', () => {
    const { field } = setup();
    expect(screen.queryByText('Быстрые ответы')).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: '/' } });

    expect(screen.getByText('Быстрые ответы')).toBeInTheDocument();
    expect(screen.getByText('Приветствие')).toBeInTheDocument();
    expect(screen.getByText('Закрытие обращения')).toBeInTheDocument();
  });

  it('filters as the operator keeps typing', () => {
    const { field } = setup();
    fireEvent.change(field, { target: { value: '/оплат' } });

    expect(screen.getByText('Вопрос по оплате')).toBeInTheDocument();
    expect(screen.queryByText('Приветствие')).not.toBeInTheDocument();
  });

  it('ignores a slash that is not in the first column', () => {
    const { field } = setup();
    // A URL, a date or «и/или» must stay ordinary text.
    fireEvent.change(field, { target: { value: 'см. https://sabakhub.app/docs' } });
    expect(screen.queryByText('Быстрые ответы')).not.toBeInTheDocument();
  });

  it('replaces the «/» command with the template body', () => {
    const { field } = setup();
    fireEvent.change(field, { target: { value: '/привет' } });
    fireEvent.click(screen.getByText('Приветствие'));

    expect(field.value).toBe(SUPPORT_QUICK_REPLIES[0].bodyRu);
    expect(field.value.startsWith('/')).toBe(false);
    expect(screen.queryByText('Быстрые ответы')).not.toBeInTheDocument();
  });

  it('appends to text the operator already typed instead of destroying it', () => {
    const { field } = setup();
    fireEvent.change(field, { target: { value: 'Добрый день.' } });

    // Entered via the button, not «/», so nothing is a command to replace.
    fireEvent.click(screen.getByTitle('Быстрые ответы (или введите «/»)'));
    fireEvent.click(screen.getByText('Исправлено'));

    expect(field.value.startsWith('Добрый день.\n')).toBe(true);
    expect(field.value).toContain('Обновите, пожалуйста, страницу');
  });

  it('navigates with the arrow keys and inserts on Enter', () => {
    const { field, onSend } = setup();
    fireEvent.change(field, { target: { value: '/' } });

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });

    // Enter picked the second template rather than sending the message.
    expect(field.value).toBe(SUPPORT_QUICK_REPLIES[1].bodyRu);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('closes the picker on Escape without inserting', () => {
    const { field } = setup();
    fireEvent.change(field, { target: { value: '/при' } });
    expect(screen.getByText('Приветствие')).toBeInTheDocument();

    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByText('Быстрые ответы')).not.toBeInTheDocument();
    expect(field.value).toBe('/при');
  });

  it('hides the picker entirely on the user-facing side', () => {
    const { field } = setup({ enableQuickReplies: false });
    fireEvent.change(field, { target: { value: '/' } });

    expect(screen.queryByText('Быстрые ответы')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Быстрые ответы (или введите «/»)')).not.toBeInTheDocument();
  });
});

describe('SupportComposer — sending', () => {
  it('sends on Enter and clears the field', async () => {
    const { field, onSend } = setup();
    fireEvent.change(field, { target: { value: 'Проверка связи' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Проверка связи', [], undefined));
    await waitFor(() => expect(field.value).toBe(''));
  });

  it('inserts a newline on Shift+Enter instead of sending', () => {
    const { field, onSend } = setup();
    fireEvent.change(field, { target: { value: 'строка' } });
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('refuses to send an empty message', () => {
    const { field, onSend } = setup();
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByTitle('Отправить')).toBeDisabled();
  });

  it('threads the reply target through and clears it after sending', async () => {
    const replyTo: any = { id: 'msg_1', senderName: 'Alice', text: 'исходное' };
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onCancelReply = vi.fn();
    render(
      <SupportComposer
        uploadUserId="user_alice"
        replyTo={replyTo}
        onCancelReply={onCancelReply}
        onSend={onSend}
        enableQuickReplies
      />,
    );
    const field = screen.getByRole('textbox');

    expect(screen.getByText('Ответ для Alice')).toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'мой ответ' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('мой ответ', [], 'msg_1'));
    await waitFor(() => expect(onCancelReply).toHaveBeenCalled());
  });
});
