import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewGroupDialog } from '../ChatPeople';

/**
 * Справочник собеседников виден только с работающей функцией api-chat, поэтому
 * его раскладку по категориям проверяем здесь: что заголовки идут в заданном
 * порядке и что человек попадает в свою категорию. Диалог один на один этим
 * окном больше не заводится — он начинается кликом в самом списке чатов
 * (см. ChatPage.test).
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

const apiGetChatDirectory = vi.fn();
const apiCreateChatRoom = vi.fn();
vi.mock('../../../lib/api', () => ({
  apiGetChatDirectory: (...a: any[]) => apiGetChatDirectory(...a),
  apiCreateChatRoom: (...a: any[]) => apiCreateChatRoom(...a),
  apiUpdateChatParticipants: vi.fn().mockResolvedValue({}),
}));

const PEOPLE = [
  { uid: 'u1', name: 'Айгуль Асанова', role: 'teacher', avatarUrl: '' },
  { uid: 'u2', name: 'Нурбек Садыков', role: 'student', avatarUrl: '' },
  { uid: 'u3', name: 'Гульмира Токтосунова', role: 'manager', avatarUrl: '' },
  { uid: 'u4', name: 'Бакыт Кадыров', role: 'mentor', avatarUrl: '' },
  { uid: 'u5', name: 'Эрмек Абдиев', role: 'owner', avatarUrl: '' },
];

beforeEach(() => {
  vi.clearAllMocks();
  apiGetChatDirectory.mockResolvedValue({ items: PEOPLE, canCreateGroup: true });
  apiCreateChatRoom.mockResolvedValue({ id: 'room_new' });
});

describe('NewGroupDialog', () => {
  it('раскладывает людей по категориям: студенты, преподаватели, персонал', async () => {
    render(<NewGroupDialog onClose={vi.fn()} onCreated={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Айгуль Асанова')).toBeInTheDocument());

    const headers = [...document.querySelectorAll('div.uppercase')].map((h) => h.textContent);
    expect(headers).toEqual(['Студенты1', 'Преподаватели2', 'Персонал2']);
  });

  it('наставник идёт к преподавателям, владелец — к персоналу', async () => {
    render(<NewGroupDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Бакыт Кадыров')).toBeInTheDocument());

    const groups = [...document.querySelectorAll('div.uppercase')].map((h) => ({
      title: h.textContent,
      people: [...(h.parentElement?.querySelectorAll('button') || [])].map((b) => b.innerText || b.textContent || ''),
    }));
    const teachers = groups.find((g) => g.title?.startsWith('Преподаватели'));
    const staff = groups.find((g) => g.title?.startsWith('Персонал'));

    expect(teachers!.people.join(' ')).toContain('Бакыт Кадыров');
    expect(staff!.people.join(' ')).toContain('Эрмек Абдиев');
  });

  it('выбирает состав и создаёт группу с названием', async () => {
    const onCreated = vi.fn();
    render(<NewGroupDialog onClose={vi.fn()} onCreated={onCreated} />);
    await waitFor(() => expect(screen.getByText('Нурбек Садыков')).toBeInTheDocument());

    // Без названия и состава кнопка заблокирована — пустую группу не создать.
    const create = screen.getByRole('button', { name: /Создать/ });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Название группы'), { target: { value: 'Stem 10:00' } });
    fireEvent.click(screen.getByText('Нурбек Садыков'));
    fireEvent.click(screen.getByText('Айгуль Асанова'));
    expect(screen.getByText('Выбрано: 2')).toBeInTheDocument();

    fireEvent.click(create);
    await waitFor(() => expect(apiCreateChatRoom).toHaveBeenCalledWith({
      type: 'group', title: 'Stem 10:00', participantIds: ['u2', 'u1'],
    }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('room_new'));
  });

  it('поиск сужает список, пустые категории исчезают', async () => {
    render(<NewGroupDialog onClose={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Айгуль Асанова')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Поиск по имени…'), { target: { value: 'нурбек' } });

    expect(screen.getByText('Нурбек Садыков')).toBeInTheDocument();
    expect(screen.queryByText('Айгуль Асанова')).not.toBeInTheDocument();
    expect([...document.querySelectorAll('div.uppercase')].map((h) => h.textContent)).toEqual(['Студенты1']);
  });
});
