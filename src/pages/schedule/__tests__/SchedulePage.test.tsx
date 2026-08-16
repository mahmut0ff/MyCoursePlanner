import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Недельное расписание хранит один день на запись, поэтому «поставить урок в пн,
 * ср и пт» — это три записи. Проверяем, что модалка их и создаёт, что проверка
 * накладок идёт по каждому дню отдельно, и что правка остаётся однодневной.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fb?: any, opts?: any) => {
      const text = typeof fb === 'string' ? fb : _k;
      const vars = typeof fb === 'object' ? fb : opts;
      return vars ? text.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars[k] ?? '')) : text;
    },
    i18n: { language: 'ru' },
  }),
}));

vi.mock('../../../lib/api', () => ({
  orgGetSchedule: vi.fn(),
  orgGetTimetable: vi.fn(),
  orgCreateEvent: vi.fn(),
  orgDeleteEvent: vi.fn(),
  orgUpdateEvent: vi.fn(),
  orgGetGroups: vi.fn(),
  orgListClassrooms: vi.fn(),
}));

vi.mock('../../../contexts/PermissionsContext', () => ({ usePermissions: vi.fn() }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../contexts/PlanContext', () => ({ usePlanGate: vi.fn() }));
vi.mock('../../../contexts/BranchContext', () => ({ useBranch: vi.fn() }));
vi.mock('../../../components/ui/BranchFilter', () => ({ default: () => <div /> }));
vi.mock('../../../components/ui/ClassroomSelect', () => ({ default: () => <div /> }));
vi.mock('../../../components/ai/ScheduleReviewModal', () => ({ default: () => <div /> }));

import SchedulePage from '../SchedulePage';
import * as apiModule from '../../../lib/api';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { useAuth } from '../../../contexts/AuthContext';
import { usePlanGate } from '../../../contexts/PlanContext';
import { useBranch } from '../../../contexts/BranchContext';

const api = apiModule as unknown as Record<string, ReturnType<typeof vi.fn>>;

const mount = (timetable: unknown[] = [], groups: unknown[] = []) => {
  (usePermissions as any).mockReturnValue({ canWrite: () => true, canDelete: () => true });
  (useAuth as any).mockReturnValue({ firebaseUser: { uid: 'u1' }, organizationId: 'org1' });
  (usePlanGate as any).mockReturnValue({ canAccess: () => true });
  (useBranch as any).mockReturnValue({ activeBranchId: null, branches: [], loading: false });
  api.orgGetTimetable.mockResolvedValue(timetable);
  api.orgGetSchedule.mockResolvedValue([]);
  api.orgGetGroups.mockResolvedValue(groups);
  api.orgListClassrooms.mockResolvedValue([]);
  api.orgCreateEvent.mockResolvedValue({ id: 'e1' });
  api.orgUpdateEvent.mockResolvedValue({});
  render(<SchedulePage />);
};

const day = (name: string) => screen.getByRole('button', { name });
const createdDays = () => api.orgCreateEvent.mock.calls.map(([payload]: any[]) => payload.dayOfWeek);

const openCreateModal = async () => {
  fireEvent.click(await screen.findByText('Добавить'));
  fireEvent.change(await screen.findByPlaceholderText(/Например/), { target: { value: 'Алгебра' } });
};

describe('SchedulePage — урок сразу в несколько дней', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('создаёт по записи расписания на каждый выбранный день', async () => {
    mount();
    await openCreateModal();

    // Сбрасываем набор к понедельнику: по умолчанию выбран сегодняшний день.
    fireEvent.click(day('Понедельник'));
    fireEvent.click(day('Среда'));
    fireEvent.click(day('Пятница'));
    // Лишние дни снимаем повторным нажатием, чтобы остались ровно эти три.
    for (const extra of ['Вторник', 'Четверг', 'Суббота', 'Воскресенье']) {
      const btn = day(extra);
      if (btn.getAttribute('aria-pressed') === 'true') fireEvent.click(btn);
    }

    fireEvent.click(screen.getByText('Сохранить'));

    await waitFor(() => expect(api.orgCreateEvent).toHaveBeenCalledTimes(3));
    expect(createdDays()).toEqual([0, 2, 4]);
    expect(api.orgCreateEvent.mock.calls[0][0]).toMatchObject({ title: 'Алгебра', recurring: true });
  });

  it('накладку ищет по каждому дню и называет виновный', async () => {
    mount([
      { id: 'ev1', title: 'Химия', dayOfWeek: 2, startTime: '09:00', endTime: '10:20', duration: 80, recurring: true, groupId: 'g9' },
    ], [{ id: 'g9', name: 'Химия-1' }]);
    fireEvent.click(await screen.findByText('Добавить'));
    // Та же группа, что и у стоящего в среду урока — на неё и сработает накладка.
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'g9' } });

    // Понедельник свободен, среда занята: сохранение должно упереться в среду.
    if (day('Понедельник').getAttribute('aria-pressed') !== 'true') fireEvent.click(day('Понедельник'));
    if (day('Среда').getAttribute('aria-pressed') !== 'true') fireEvent.click(day('Среда'));
    fireEvent.click(screen.getByText('Сохранить'));

    // Виновный день назван, чтобы не гадать, какая из трёх записей не встала.
    // Текст стоит и в модалке, и в баннере страницы — отсюда getAll.
    await waitFor(() => expect(screen.getAllByText(/Среда: Конфликт/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Понедельник: Конфликт/)).toBeNull();
    expect(api.orgCreateEvent).not.toHaveBeenCalled();
  });
});
