import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationPreferencesCard from '../NotificationPreferencesCard';

/**
 * Тумблер, который ничего не выключает, хуже отсутствующего: человек думает,
 * что отписался. Поэтому проверяем именно связь с сервером — что уходит на
 * сохранение, что происходит при ошибке и что общий выключатель главнее
 * отдельных категорий.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === 'string' ? fallback : key),
  }),
}));

const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: (...a: any[]) => toastError(...a) } }));

const apiGetNotificationPreferences = vi.fn();
const apiSaveNotificationPreferences = vi.fn();
vi.mock('../../../lib/api', () => ({
  apiGetNotificationPreferences: (...a: any[]) => apiGetNotificationPreferences(...a),
  apiSaveNotificationPreferences: (...a: any[]) => apiSaveNotificationPreferences(...a),
}));

const PREFS = { pushEnabled: true, chat: true, lessons: true, homework: true, schedule: true, exams: true };

const open = async () => {
  render(<NotificationPreferencesCard />);
  fireEvent.click(screen.getByText('Настройки уведомлений'));
  await waitFor(() => expect(apiGetNotificationPreferences).toHaveBeenCalled());
};

/** Тумблер строки по её подписи (строка — ближайший flex-контейнер). */
const toggleOf = (label: string) => {
  const row = screen.getByText(label).closest('div.flex')!;
  return row.querySelector('button[role="switch"]') as HTMLButtonElement;
};

beforeEach(() => {
  vi.clearAllMocks();
  apiGetNotificationPreferences.mockResolvedValue({ ...PREFS });
  apiSaveNotificationPreferences.mockResolvedValue({ success: true, preferences: PREFS });
});

describe('NotificationPreferencesCard', () => {
  it('настройки тянутся только при раскрытии', async () => {
    render(<NotificationPreferencesCard />);
    expect(apiGetNotificationPreferences).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Настройки уведомлений'));
    await waitFor(() => expect(apiGetNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Чат')).toBeInTheDocument();
  });

  it('выключение «Чата» сохраняет весь набор с chat: false', async () => {
    await open();

    fireEvent.click(toggleOf('Чат'));

    await waitFor(() => expect(apiSaveNotificationPreferences).toHaveBeenCalledWith({
      ...PREFS, chat: false,
    }));
    expect(toggleOf('Чат')).toHaveAttribute('aria-checked', 'false');
  });

  it('если сохранить не удалось — тумблер возвращается назад', async () => {
    apiSaveNotificationPreferences.mockRejectedValue(new Error('offline'));
    await open();

    fireEvent.click(toggleOf('Чат'));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toggleOf('Чат')).toHaveAttribute('aria-checked', 'true');
  });

  it('общий выключатель главнее: категории гаснут и блокируются', async () => {
    apiGetNotificationPreferences.mockResolvedValue({ ...PREFS, pushEnabled: false });
    await open();

    const chat = toggleOf('Чат');
    expect(chat).toBeDisabled();
    expect(chat).toHaveAttribute('aria-checked', 'false');   // хотя chat: true
  });

  it('показывает ровно те категории, которые сервер учитывает', async () => {
    await open();
    ['Чат', 'Уроки', 'Домашние задания', 'Расписание', 'Экзамены и оценки', 'Все уведомления']
      .forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
  });
});
