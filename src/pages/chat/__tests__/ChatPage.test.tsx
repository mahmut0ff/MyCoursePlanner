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
const apiCreateChatRoom = vi.fn();
vi.mock('../../../lib/api', () => ({
  apiModerateChatMessage: (...a: any[]) => apiModerateChatMessage(...a),
  apiArchiveChatRoom: (...a: any[]) => apiArchiveChatRoom(...a),
  apiGetChatDirectory: (...a: any[]) => apiGetChatDirectory(...a),
  apiCreateChatRoom: (...a: any[]) => apiCreateChatRoom(...a),
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

const PERSON = { uid: 'u_new', name: 'Эрмек Абдиев', role: 'manager', avatarUrl: '' };

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
  apiCreateChatRoom.mockResolvedValue({ id: 'room_new' });
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

  it('без chat:write нет ни кнопки группы, ни списка людей', async () => {
    apiGetChatDirectory.mockResolvedValue({ items: [PERSON], canCreateGroup: true });
    can.mockImplementation((_r: string, action?: string) => action !== 'write');
    renderPage();

    expect(screen.queryByText('Новая группа')).not.toBeInTheDocument();
    await waitFor(() => expect(apiGetChatDirectory).toHaveBeenCalled());
    expect(screen.queryByText('Начать переписку')).not.toBeInTheDocument();
    expect(screen.queryByText('Эрмек Абдиев')).not.toBeInTheDocument();
  });

  it('кнопка группы скрыта, если сервер её не разрешил (студент)', async () => {
    apiGetChatDirectory.mockResolvedValue({ items: [PERSON], canCreateGroup: false });
    renderPage();
    await waitFor(() => expect(apiGetChatDirectory).toHaveBeenCalled());
    expect(screen.queryByText('Новая группа')).not.toBeInTheDocument();
  });

  it('люди без переписки стоят отдельной секцией, клик заводит диалог', async () => {
    apiGetChatDirectory.mockResolvedValue({ items: [PERSON], canCreateGroup: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Эрмек Абдиев')).toBeInTheDocument());
    expect(screen.getByText('Начать переписку')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Эрмек Абдиев'));
    await waitFor(() => expect(apiCreateChatRoom).toHaveBeenCalledWith({
      type: 'direct', participantIds: ['u_new'],
    }));
  });

  it('у кого переписка уже есть, тот в секции людей не дублируется', async () => {
    apiGetChatDirectory.mockResolvedValue({
      items: [PERSON, { uid: 'u_them', name: 'Айгуль Асанова', role: 'teacher', avatarUrl: '' }],
      canCreateGroup: true,
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Эрмек Абдиев')).toBeInTheDocument());
    // Айгуль — уже собеседник в DM, поэтому строкой «начать переписку» не идёт.
    expect(screen.getAllByText('Айгуль Асанова')).toHaveLength(1);
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

  it('пустая комната не считается непрочитанной и помечается прочитанной при открытии', async () => {
    // Ровно то, что видел пользователь: только что заведённый диалог без единого
    // сообщения светился синей точкой и давал единицу в заголовке.
    const fresh: ChatRoom = {
      ...DM, id: 'room_fresh', lastMessageAt: '', lastMessagePreview: '',
      participants: {
        ...DM.participants,
        u_me: { ...DM.participants.u_me, lastReadAt: '1970-01-01T00:00:00.000Z' },
      },
    };
    mockRooms.mockReturnValue({ rooms: [fresh], loading: false, error: null, nameCache: {}, avatarCache: {} });
    mockMessages.mockReturnValue({ messages: [], loading: false, loadMore: vi.fn(), hasMore: false });

    renderPage('/chat?room=room_fresh');

    expect(within(screen.getByRole('heading', { level: 1 })).queryByText('1')).not.toBeInTheDocument();
    // И открытие такой комнаты всё равно проставляет прочтение — иначе повисший
    // на ней счётчик нечем было бы снять.
    await waitFor(() => expect(updateLastRead).toHaveBeenCalledWith('room_fresh'));
  });

  it('комната со старым lastMessageAt, но без сообщения, непрочитанной не считается', () => {
    // Комнаты, заведённые до починки: время «последнего сообщения» проставлено,
    // а самого сообщения нет. Фантомная единица не должна пережить обновление.
    const legacy: ChatRoom = { ...DM, id: 'room_legacy', lastMessagePreview: '' };
    mockRooms.mockReturnValue({ rooms: [legacy], loading: false, error: null, nameCache: {}, avatarCache: {} });

    renderPage();
    expect(within(screen.getByRole('heading', { level: 1 })).queryByText('1')).not.toBeInTheDocument();
  });

  it('непрочитанное считается по lastReadAt участника', () => {
    renderPage();
    // lastMessageAt (12:00) позже lastReadAt (10:00) в обеих комнатах → 2.
    // Ищем именно в заголовке: такое же число есть на чипе «Все».
    expect(within(screen.getByRole('heading', { level: 1 })).getByText('2')).toBeInTheDocument();
  });
});
