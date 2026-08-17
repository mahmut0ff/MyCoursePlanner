import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ChatRoom, ChatMessage } from '../../../types';

/**
 * Проверяем то, чего не видит серверный тест: что страница вообще собирается,
 * что список и переписка связаны, что удалённое сообщение показано надгробием,
 * а не пропадает молча, и что права («модератор», «может начать чат») доходят
 * до конкретных кнопок.
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

const mockRooms = vi.fn();
const mockMessages = vi.fn();
const updateLastRead = vi.fn().mockResolvedValue(undefined);
const sendMessage = vi.fn().mockResolvedValue('msg_new');

vi.mock('../../../lib/useChat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/useChat')>();
  return {
    ...actual,
    // chatRoomLabel и useUnreadRooms — чистые функции над данными, их подменять
    // нечем и незачем: пусть работают настоящие.
    useChatRooms: () => mockRooms(),
    useChatMessages: () => mockMessages(),
    useChatActions: () => ({ sendMessage, updateLastRead, setMuted: vi.fn().mockResolvedValue(undefined) }),
    useTypingIndicator: () => ({ startTyping: vi.fn() }),
    useTypingStatus: () => [],
    uploadChatAttachment: vi.fn(),
  };
});

const apiModerateChatMessage = vi.fn().mockResolvedValue({});
const apiArchiveChatRoom = vi.fn().mockResolvedValue({});
const apiGetChatDirectory = vi.fn();
vi.mock('../../../lib/api', () => ({
  apiModerateChatMessage: (...a: any[]) => apiModerateChatMessage(...a),
  apiArchiveChatRoom: (...a: any[]) => apiArchiveChatRoom(...a),
  apiGetChatDirectory: (...a: any[]) => apiGetChatDirectory(...a),
  apiCreateChatRoom: vi.fn().mockResolvedValue({ id: 'room_new' }),
  apiUpdateChatParticipants: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ firebaseUser: { uid: 'u_me' }, organizationId: 'org_academy' }),
}));

const can = vi.fn();
vi.mock('../../../contexts/PermissionsContext', () => ({
  usePermissions: () => ({ can: (...a: any[]) => can(...a) }),
}));

vi.mock('../../../components/ai/useCopilotVisible', () => ({ useCopilotVisible: () => false }));

const ChatPage = (await import('../ChatPage')).default;

const DM: ChatRoom = {
  id: 'DM_org_academy_u_me_u_them',
  organizationId: 'org_academy',
  type: 'direct',
  createdBy: 'u_me',
  participantIds: ['u_me', 'u_them'],
  participants: {
    u_me: { role: 'member', joinedAt: '', lastReadAt: '2026-08-17T10:00:00.000Z', isMuted: false, isRemoved: false },
    u_them: {
      role: 'member', joinedAt: '', lastReadAt: '', isMuted: false, isRemoved: false,
      displayName: 'Айгуль Асанова', orgRole: 'teacher',
    },
  },
  lastMessageAt: '2026-08-17T12:00:00.000Z',
  lastMessagePreview: 'Айгуль Асанова: до завтра',
  isArchived: false,
  createdAt: '',
  updatedAt: '',
};

const GROUP: ChatRoom = {
  ...DM,
  id: 'room_group',
  type: 'group',
  title: 'Stem 10:00',
  participantIds: ['u_me', 'u_them', 'u_third'],
  lastMessageAt: '2026-08-17T13:00:00.000Z',
  lastMessagePreview: 'Айгуль Асанова: расписание',
};

const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  roomId: DM.id,
  organizationId: 'org_academy',
  senderId: 'u_them',
  senderName: 'Айгуль Асанова',
  messageType: 'text',
  text: 'До завтра',
  attachments: [],
  createdAt: '2026-08-17T12:00:00.000Z',
  updatedAt: '2026-08-17T12:00:00.000Z',
  ...over,
});

const renderPage = (initial = '/chat') =>
  render(<MemoryRouter initialEntries={[initial]}><ChatPage /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  can.mockReturnValue(true);
  apiGetChatDirectory.mockResolvedValue({ items: [], canCreateGroup: false });
  mockRooms.mockReturnValue({ rooms: [DM, GROUP], loading: false, error: null, nameCache: {}, avatarCache: {} });
  mockMessages.mockReturnValue({ messages: [message()], loading: false, loadMore: vi.fn(), hasMore: false });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('ChatPage', () => {
  it('показывает список комнат: диалог — по имени собеседника, группу — по названию', () => {
    renderPage();
    expect(screen.getByText('Айгуль Асанова')).toBeInTheDocument();
    expect(screen.getByText('Stem 10:00')).toBeInTheDocument();
    expect(screen.getByText('Выберите чат слева или начните новый.')).toBeInTheDocument();
  });

  it('открывает переписку по комнате из URL и помечает её прочитанной', async () => {
    renderPage(`/chat?room=${DM.id}`);

    expect(screen.getByText('До завтра')).toBeInTheDocument();
    expect(screen.getByText('Личная переписка')).toBeInTheDocument();
    await waitFor(() => expect(updateLastRead).toHaveBeenCalledWith(DM.id));
  });

  it('удалённое сообщение остаётся надгробием, а не исчезает', () => {
    mockMessages.mockReturnValue({
      messages: [message({ deletedAt: '2026-08-17T12:05:00.000Z' })],
      loading: false, loadMore: vi.fn(), hasMore: false,
    });
    renderPage(`/chat?room=${DM.id}`);

    expect(screen.getByText('Сообщение удалено')).toBeInTheDocument();
    expect(screen.queryByText('До завтра')).not.toBeInTheDocument();
  });

  it('в группе подписывает автора, в диалоге — нет', () => {
    renderPage(`/chat?room=${DM.id}`);
    expect(screen.queryByText('Айгуль Асанова', { selector: 'div.text-\\[11px\\]' })).not.toBeInTheDocument();

    mockMessages.mockReturnValue({
      messages: [message({ roomId: GROUP.id })], loading: false, loadMore: vi.fn(), hasMore: false,
    });
    renderPage(`/chat?room=${GROUP.id}`);
    expect(screen.getAllByText('Stem 10:00').length).toBeGreaterThan(0);
    expect(screen.getByText('3 участников')).toBeInTheDocument();
  });

  it('удаление сообщения требует подтверждения и уходит через api-chat', async () => {
    renderPage(`/chat?room=${DM.id}`);

    const del = screen.getByTitle('Удалить');
    fireEvent.click(del);
    expect(apiModerateChatMessage).not.toHaveBeenCalled();   // первый клик — только «уверены?»

    fireEvent.click(screen.getByTitle('Нажмите ещё раз для удаления'));
    await waitFor(() => expect(apiModerateChatMessage).toHaveBeenCalledWith(DM.id, 'm1'));
  });

  it('без chat:delete чужое сообщение удалить нельзя', () => {
    can.mockImplementation((_r: string, action?: string) => action !== 'delete');
    renderPage(`/chat?room=${DM.id}`);

    expect(screen.queryByTitle('Удалить')).not.toBeInTheDocument();
    expect(screen.getByTitle('Ответить')).toBeInTheDocument();
  });

  it('без chat:write кнопки «Новый чат» нет', () => {
    can.mockImplementation((_r: string, action?: string) => action !== 'write');
    renderPage();
    expect(screen.queryByText('Новый чат')).not.toBeInTheDocument();
  });

  it('поиск фильтрует список по названию комнаты', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Поиск по чатам…'), { target: { value: 'stem' } });

    expect(screen.getByText('Stem 10:00')).toBeInTheDocument();
    expect(screen.queryByText('Айгуль Асанова')).not.toBeInTheDocument();
  });

  it('категории фильтруют список, а группа идёт своей категорией', () => {
    renderPage();
    // Диалог с преподавателем виден в «Преподаватели», группа — нет.
    fireEvent.click(screen.getByRole('button', { name: /Преподаватели/ }));
    expect(screen.getByText('Айгуль Асанова')).toBeInTheDocument();
    expect(screen.queryByText('Stem 10:00')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Группы/ }));
    expect(screen.getByText('Stem 10:00')).toBeInTheDocument();
    expect(screen.queryByText('Айгуль Асанова')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Студенты/ }));
    expect(screen.getByText('В этой категории чатов пока нет')).toBeInTheDocument();
  });

  it('роль собеседника берётся из справочника, если в комнате её нет', async () => {
    const legacy = { ...DM, participants: { ...DM.participants, u_them: { ...DM.participants.u_them, orgRole: undefined } } };
    mockRooms.mockReturnValue({ rooms: [legacy], loading: false, error: null, nameCache: {}, avatarCache: {} });
    apiGetChatDirectory.mockResolvedValue({
      items: [{ uid: 'u_them', name: 'Айгуль Асанова', role: 'student', avatarUrl: '' }],
      canCreateGroup: true,
    });

    renderPage();
    // Справочник говорит «студент» — комната обязана попасть к студентам,
    // хотя в самом документе роли нет.
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /Студенты/ }));
      expect(screen.getByText('Айгуль Асанова')).toBeInTheDocument();
    });
  });

  it('непрочитанное считается по lastReadAt участника', () => {
    renderPage();
    // lastMessageAt (12:00) позже lastReadAt (10:00) в обеих комнатах → 2.
    // Ищем именно в заголовке: такое же число есть на чипе «Все».
    expect(within(screen.getByRole('heading', { level: 1 })).getByText('2')).toBeInTheDocument();
  });
});
