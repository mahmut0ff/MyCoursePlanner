import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SupportThread } from '../../../types';

/**
 * Render smoke + interaction cover for the two support surfaces. These catch the
 * failure modes the api-support tests can't see: a bad import, a hook used
 * conditionally, an undefined read while a thread is still loading, and the
 * three-column inbox wiring (select a thread -> chat + info panel follow).
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any, opts?: any) => {
      if (typeof fallback !== 'string') return key;
      return fallback.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => String(opts?.[k] ?? ''));
    },
  }),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const mockThreads = vi.fn<() => { threads: SupportThread[]; loading: boolean; error: null }>();
const mockMessages = vi.fn<() => { messages: any[]; loading: boolean }>();
const mockMyThread = vi.fn<() => { thread: SupportThread | null; loading: boolean }>();

vi.mock('../../../lib/useSupport', () => ({
  useSupportThreads: () => mockThreads(),
  useSupportMessages: () => mockMessages(),
  useMySupportThread: () => mockMyThread(),
  useSupportTyping: () => ({ startTyping: vi.fn() }),
  useSupportTypingStatus: () => [],
  uploadSupportAttachment: vi.fn(),
  SUPPORT_MAX_FILE_SIZE: 50 * 1024 * 1024,
}));

const apiSupportUserInfo = vi.fn();
const apiSupportSetStatus = vi.fn().mockResolvedValue({});
vi.mock('../../../lib/api', () => ({
  apiSupportUserInfo: (...a: any[]) => apiSupportUserInfo(...a),
  apiSupportSetStatus: (...a: any[]) => apiSupportSetStatus(...a),
  apiSupportSend: vi.fn().mockResolvedValue({}),
  apiSupportDeleteMessage: vi.fn().mockResolvedValue({}),
  apiSupportMarkRead: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ firebaseUser: { uid: 'user_alice' } }),
}));

const SupportPage = (await import('../SupportPage')).default;
const AdminSupportPage = (await import('../../admin/AdminSupportPage')).default;

const THREAD: SupportThread = {
  id: 'user_alice',
  userId: 'user_alice',
  userName: 'Alice Ivanova',
  userEmail: 'alice@academy.test',
  userRole: 'teacher',
  organizationId: 'org_academy',
  organizationName: 'My Academy',
  status: 'new',
  lastMessageAt: new Date().toISOString(),
  lastMessagePreview: 'Не могу выгрузить ведомость',
  lastMessageFrom: 'user',
  unreadForSupport: 2,
  unreadForUser: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MESSAGE = {
  id: 'msg_1',
  threadId: 'user_alice',
  senderId: 'user_alice',
  senderName: 'Alice Ivanova',
  senderSide: 'user' as const,
  text: 'Не могу выгрузить ведомость',
  attachments: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockThreads.mockReturnValue({ threads: [], loading: false, error: null });
  mockMessages.mockReturnValue({ messages: [], loading: false });
  mockMyThread.mockReturnValue({ thread: null, loading: false });
  apiSupportUserInfo.mockResolvedValue({
    uid: 'user_alice', email: 'alice@academy.test', displayName: 'Alice Ivanova',
    role: 'teacher', city: 'Бишкек', organizationId: 'org_academy',
    organizationName: 'My Academy', planId: 'enterprise',
    branchNames: ['Центральный филиал'], membershipRole: 'teacher', memberships: [],
  });
});

const renderAdmin = () => render(<MemoryRouter><AdminSupportPage /></MemoryRouter>);

// The three columns share vocabulary — a thread's last-message preview repeats
// the message text — so assertions must say WHICH column they mean.
const conversation = () => screen.getByRole('region', { name: 'Переписка' });
const infoPanel = () => screen.getByRole('complementary', { name: 'Информация о пользователе' });

describe('SupportPage (user side)', () => {
  it('renders a composer before any thread exists', () => {
    render(<MemoryRouter><SupportPage /></MemoryRouter>);

    // The thread doc is created on first send, so the page must not block on it.
    expect(screen.getByText('Чем можем помочь?')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText('Обычно отвечаем в течение рабочего дня')).toBeInTheDocument();
  });

  it('never offers quick replies to the user', () => {
    render(<MemoryRouter><SupportPage /></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '/' } });
    expect(screen.queryByText('Быстрые ответы')).not.toBeInTheDocument();
  });

  it('tells the user a closed thread reopens on reply', () => {
    mockMyThread.mockReturnValue({ thread: { ...THREAD, status: 'closed' }, loading: false });
    render(<MemoryRouter><SupportPage /></MemoryRouter>);
    expect(screen.getByText('Обращение закрыто — напишите, чтобы открыть снова')).toBeInTheDocument();
  });
});

describe('AdminSupportPage (operator side)', () => {
  it('renders the empty inbox without a selection', () => {
    renderAdmin();
    expect(screen.getByText('Обращений пока нет')).toBeInTheDocument();
    expect(screen.getByText('Выберите обращение слева, чтобы открыть переписку.')).toBeInTheDocument();
  });

  it('lists a thread with its org and unread badge', () => {
    mockThreads.mockReturnValue({ threads: [THREAD], loading: false, error: null });
    renderAdmin();

    expect(screen.getByText('Alice Ivanova')).toBeInTheDocument();
    expect(screen.getByText('My Academy')).toBeInTheDocument();
    expect(screen.getByText('Не могу выгрузить ведомость')).toBeInTheDocument();
    // «2» appears twice on purpose: the row's own badge and the page-header
    // total across all threads. Both must be there.
    expect(screen.getAllByText('2')).toHaveLength(2);
  });

  it('filters the list by name, email, org and uid', () => {
    mockThreads.mockReturnValue({ threads: [THREAD], loading: false, error: null });
    renderAdmin();
    const search = screen.getByPlaceholderText('Имя, email, УЦ, uid…');

    fireEvent.change(search, { target: { value: 'academy' } });
    expect(screen.getByText('Alice Ivanova')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'user_alice' } });
    expect(screen.getByText('Alice Ivanova')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'нет-такого' } });
    expect(screen.queryByText('Alice Ivanova')).not.toBeInTheDocument();
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
  });

  it('opens the conversation and loads the info panel on selection', async () => {
    mockThreads.mockReturnValue({ threads: [THREAD], loading: false, error: null });
    mockMessages.mockReturnValue({ messages: [MESSAGE], loading: false });
    renderAdmin();

    fireEvent.click(screen.getByText('Alice Ivanova'));

    await waitFor(() => expect(apiSupportUserInfo).toHaveBeenCalledWith('user_alice'));
    // Scoped to the conversation: the same text also appears as the list preview.
    expect(within(conversation()).getByText('Не могу выгрузить ведомость')).toBeInTheDocument();

    // Right-hand panel resolves ids into names.
    const panel = infoPanel();
    await waitFor(() => expect(within(panel).getByText('Центральный филиал')).toBeInTheDocument());
    expect(within(panel).getByText('enterprise')).toBeInTheDocument();
    expect(within(panel).getByText('Бишкек')).toBeInTheDocument();
  });

  it('offers quick replies to the operator', async () => {
    mockThreads.mockReturnValue({ threads: [THREAD], loading: false, error: null });
    mockMessages.mockReturnValue({ messages: [MESSAGE], loading: false });
    renderAdmin();
    fireEvent.click(screen.getByText('Alice Ivanova'));

    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '/' } });

    expect(screen.getByText('Быстрые ответы')).toBeInTheDocument();
    expect(screen.getByText('Приветствие')).toBeInTheDocument();
  });

  it('closes an open thread from the header', async () => {
    mockThreads.mockReturnValue({ threads: [THREAD], loading: false, error: null });
    renderAdmin();
    fireEvent.click(screen.getByText('Alice Ivanova'));

    fireEvent.click(await screen.findByTitle('Закрыть обращение'));
    await waitFor(() => expect(apiSupportSetStatus).toHaveBeenCalledWith('user_alice', 'closed'));
  });

  it('offers reopen instead of close once a thread is closed', async () => {
    mockThreads.mockReturnValue({
      threads: [{ ...THREAD, status: 'closed' }], loading: false, error: null,
    });
    renderAdmin();
    fireEvent.click(screen.getByText('Alice Ivanova'));

    expect(await screen.findByTitle('Открыть заново')).toBeInTheDocument();
    expect(screen.queryByTitle('Закрыть обращение')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Открыть заново'));
    await waitFor(() => expect(apiSupportSetStatus).toHaveBeenCalledWith('user_alice', 'open'));
  });

  it('renders a deleted message as a tombstone', async () => {
    mockThreads.mockReturnValue({ threads: [THREAD], loading: false, error: null });
    mockMessages.mockReturnValue({
      messages: [{ ...MESSAGE, deletedAt: new Date().toISOString() }],
      loading: false,
    });
    renderAdmin();
    fireEvent.click(screen.getByText('Alice Ivanova'));

    const chat = conversation();
    expect(await within(chat).findByText('Сообщение удалено')).toBeInTheDocument();
    // Gone from the transcript, but the list preview still shows the last text.
    expect(within(chat).queryByText('Не могу выгрузить ведомость')).not.toBeInTheDocument();
  });
});
