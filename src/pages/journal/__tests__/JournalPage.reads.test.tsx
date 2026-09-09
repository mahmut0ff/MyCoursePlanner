/**
 * Переключение дня в журнале не должно ходить в сеть.
 *
 * Раньше дата стояла в зависимостях эффекта загрузки, и каждый клик по дню
 * перечитывал ВСЮ историю журнала и все оценки курса заново — ради одного дня,
 * который целиком выбирается из уже загруженного. Так api-gradebook стал самой
 * вызываемой функцией и одним из потребителей суточной квоты чтений Firestore,
 * которая 09.09.2026 положила весь кабинет.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fb?: any) => (typeof fb === 'string' ? fb : k),
    i18n: { language: 'ru' },
  }),
}));
vi.mock('react-router-dom', () => ({ Link: ({ children }: any) => <a>{children}</a> }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../../lib/api', () => ({
  orgGetCourses: vi.fn(), orgGetGroups: vi.fn(), orgGetStudents: vi.fn(),
  orgGetTeachers: vi.fn(), orgGetJournal: vi.fn(), orgSaveJournal: vi.fn(),
  orgBulkAttendance: vi.fn(), apiAwardXP: vi.fn(), orgGetGradeSchema: vi.fn(),
  orgGetGrades: vi.fn(), orgSaveGrade: vi.fn(), apiGetLessons: vi.fn(),
  apiOrgGetHomeworks: vi.fn(),
}));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ role: 'admin', profile: { uid: 'a1' } }) }));
vi.mock('../../../contexts/BranchContext', () => ({ useBranch: () => ({ activeBranchId: null }) }));
vi.mock('../../../contexts/PermissionsContext', () => ({ usePermissions: () => ({ canWrite: () => true }) }));
vi.mock('../../../contexts/OrgContext', () => ({ useOrg: () => ({ institutionType: 'school' }) }));
vi.mock('../../../components/gradebook/GradeCell', () => ({ default: () => <div /> }));
vi.mock('../../../components/gradebook/SaveStatus', () => ({ default: () => <div /> }));

import JournalPage from '../JournalPage';
import * as api from '../../../lib/api';

const COURSE = { id: 'c1', title: 'Английский', teacherIds: [] };
const GROUP = { id: 'g1', name: 'A1', courseId: 'c1', studentIds: ['s1'], teacherIds: [] };
const STUDENT = { uid: 's1', displayName: 'Ученик' };

const JOURNAL = [
  { id: 'j1', studentId: 's1', courseId: 'c1', date: '2026-09-01', attendance: 'present' },
  { id: 'j2', studentId: 's1', courseId: 'c1', date: '2026-09-02', attendance: 'absent' },
];

const dateInput = () => document.querySelector('input[type="date"]') as HTMLInputElement;

describe('журнал: чтения при переключении дня', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.orgGetCourses as any).mockResolvedValue([COURSE]);
    (api.orgGetGroups as any).mockResolvedValue([GROUP]);
    (api.orgGetStudents as any).mockResolvedValue([STUDENT]);
    (api.orgGetTeachers as any).mockResolvedValue([]);
    (api.orgGetJournal as any).mockResolvedValue(JOURNAL);
    (api.orgGetGrades as any).mockResolvedValue([]);
    (api.orgGetGradeSchema as any).mockResolvedValue(null);
    (api.apiGetLessons as any).mockResolvedValue([]);
    (api.apiOrgGetHomeworks as any).mockResolvedValue([]);
  });

  it('историю курса читаем один раз, а не на каждый день', async () => {
    render(<JournalPage />);
    await waitFor(() => expect(api.orgGetJournal).toHaveBeenCalledTimes(1));

    fireEvent.change(dateInput(), { target: { value: '2026-09-01' } });
    await waitFor(() => expect(dateInput().value).toBe('2026-09-01'));
    fireEvent.change(dateInput(), { target: { value: '2026-09-02' } });
    await waitFor(() => expect(dateInput().value).toBe('2026-09-02'));

    // Два переключения дня — и ни одного лишнего запроса.
    expect(api.orgGetJournal).toHaveBeenCalledTimes(1);
    expect(api.orgGetGrades).toHaveBeenCalledTimes(1);
    expect(api.orgGetGradeSchema).toHaveBeenCalledTimes(1);
  });

  it('день всё равно выбирается — из уже загруженной истории', async () => {
    render(<JournalPage />);
    await waitFor(() => expect(api.orgGetJournal).toHaveBeenCalledTimes(1));

    // Дни, за которые в журнале что-то есть, выводятся из истории — если бы она
    // не доехала, быстрых дат просто не было бы.
    await waitFor(() => expect(screen.getAllByText(/сент|Сегодня/i).length).toBeGreaterThan(0));
    expect(api.orgGetJournal).toHaveBeenCalledTimes(1);
  });
});
