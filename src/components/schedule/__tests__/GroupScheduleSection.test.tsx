import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Урок в неделю ставят сразу в несколько дней: расписание хранит один день на
 * запись, поэтому выбор из трёх дней обязан превратиться в три записи — и ни
 * одной лишней, если день сняли.
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
  orgGetTimetable: vi.fn(),
  orgGetSchedule: vi.fn(),
  orgCreateEvent: vi.fn(),
  orgUpdateEvent: vi.fn(),
  orgDeleteEvent: vi.fn(),
  orgListClassrooms: vi.fn(),
}));

vi.mock('../../../contexts/PermissionsContext', () => ({ usePermissions: vi.fn() }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../ui/ClassroomSelect', () => ({ default: () => <div /> }));

import GroupScheduleSection from '../GroupScheduleSection';
import * as apiModule from '../../../lib/api';
import { usePermissions } from '../../../contexts/PermissionsContext';

const api = apiModule as unknown as Record<string, ReturnType<typeof vi.fn>>;

const GROUP = { id: 'g1', name: 'Английский A1', courseId: 'c1', branchId: 'b1' } as any;

const mount = (timetable: unknown[] = []) => {
  (usePermissions as any).mockReturnValue({ canDelete: () => true });
  api.orgGetTimetable.mockResolvedValue(timetable);
  api.orgGetSchedule.mockResolvedValue([]);
  api.orgListClassrooms.mockResolvedValue([]);
  api.orgCreateEvent.mockResolvedValue({ id: 'e1' });
  api.orgUpdateEvent.mockResolvedValue({});
  render(<GroupScheduleSection group={GROUP} canEdit />);
};

const day = (name: string) => screen.getByRole('button', { name });
const createdDays = () => api.orgCreateEvent.mock.calls.map(([payload]: any[]) => payload.dayOfWeek);

describe('GroupScheduleSection — несколько дней за раз', () => {
  beforeEach(() => vi.clearAllMocks());

  it('создаёт по уроку на каждый выбранный день', async () => {
    mount();
    fireEvent.click(await screen.findByText('Урок в неделю'));

    // Понедельник выбран по умолчанию — добавляем к нему среду и пятницу.
    fireEvent.click(day('Среда'));
    fireEvent.click(day('Пятница'));
    fireEvent.click(screen.getByText('Сохранить'));

    await waitFor(() => expect(api.orgCreateEvent).toHaveBeenCalledTimes(3));
    expect(createdDays()).toEqual([0, 2, 4]);
    expect(api.orgCreateEvent.mock.calls[0][0]).toMatchObject({
      recurring: true, groupId: 'g1', startTime: '09:00',
    });
  });

  it('снятый день не создаётся, а последний выбранный снять нельзя', async () => {
    mount();
    fireEvent.click(await screen.findByText('Урок в неделю'));

    fireEvent.click(day('Вторник'));
    fireEvent.click(day('Вторник'));      // сняли обратно
    fireEvent.click(day('Понедельник'));  // единственный оставшийся — остаётся выбранным
    fireEvent.click(screen.getByText('Сохранить'));

    await waitFor(() => expect(api.orgCreateEvent).toHaveBeenCalledTimes(1));
    expect(createdDays()).toEqual([0]);
  });

  it('правка занятия остаётся одним днём', async () => {
    mount([
      { id: 'ev1', dayOfWeek: 1, startTime: '09:00', endTime: '10:20', recurring: true, title: 'Английский A1' },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: /Изменить: 09:00/ }));

    // В режиме правки день переключается, а не накапливается: запись живёт в одном дне.
    fireEvent.click(day('Четверг'));
    fireEvent.click(screen.getByText('Сохранить'));

    await waitFor(() => expect(api.orgUpdateEvent).toHaveBeenCalledTimes(1));
    expect(api.orgUpdateEvent.mock.calls[0][0]).toMatchObject({ id: 'ev1', dayOfWeek: 3 });
    expect(api.orgCreateEvent).not.toHaveBeenCalled();
  });
});
