import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../api-gradebook';
import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';

// lessonSessions — основание для расчёта зарплаты, поэтому тесты целятся ровно в две
// вещи: КОМУ приписан урок (teacherId) и КОМУ вообще позволено его записать (группа).
vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: vi.fn(), batch: vi.fn() },
}));

vi.mock('../utils/auth', () => ({
  verifyAuth: vi.fn(),
  hasRole: (u: any, role: string) => u?.role === role,
  can: () => true,
  jsonResponse: (status: number, body: any) => ({ statusCode: status, body: JSON.stringify(body) }),
  ok: (body: any) => ({ statusCode: 200, body: JSON.stringify(body) }),
  forbidden: (msg?: string) => ({ statusCode: 403, body: JSON.stringify({ error: msg || 'Forbidden' }) }),
  badRequest: (msg: string) => ({ statusCode: 400, body: JSON.stringify({ error: msg }) }),
  notFound: (msg?: string) => ({ statusCode: 404, body: JSON.stringify({ error: msg || 'Not found' }) }),
  unauthorized: () => ({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }),
}));

vi.mock('../utils/notifications', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));

const ORG = 'org-1';

const batchSet = vi.fn();
const batchUpdate = vi.fn();
const batchCommit = vi.fn().mockResolvedValue(undefined);

/** Запросы equality-only и всегда заканчиваются get() — один chainable-стаб на коллекцию. */
function chain(getResult: any, extra: Record<string, any> = {}) {
  const c: any = {
    where: vi.fn(() => c),
    limit: vi.fn(() => c),
    get: vi.fn().mockResolvedValue(getResult),
    ...extra,
  };
  return c;
}

let docSeq = 0;
const newRef = (col: string) => ({ id: `${col}-${++docSeq}`, _col: col });

function stubFirestore(opts: { group?: any; course?: any } = {}) {
  // `=== undefined` → дефолт; явный null означает «документа нет».
  const group = opts.group === undefined
    ? { organizationId: ORG, courseId: 'course-1', branchId: 'branch-1', teacherIds: ['teacher-a'] }
    : opts.group;
  const course = opts.course === undefined
    ? { organizationId: ORG, title: 'Английский', teacherIds: ['teacher-a'] }
    : opts.course;

  (adminDb.collection as any).mockImplementation((col: string) => {
    if (col === 'groups') {
      return chain({ empty: true, docs: [] }, {
        doc: () => ({ get: vi.fn().mockResolvedValue({ exists: !!group, data: () => group }) }),
      });
    }
    if (col === 'courses') {
      return chain({ empty: true, docs: [] }, {
        doc: () => ({ get: vi.fn().mockResolvedValue({ exists: !!course, data: () => course }) }),
      });
    }
    // journal / lessonSessions / scheduleEvents: ничего существующего → путь создания.
    return chain({ empty: true, docs: [] }, { doc: () => newRef(col) });
  });

  (adminDb.batch as any).mockReturnValue({
    set: batchSet, update: batchUpdate, commit: batchCommit,
  });
}

const call = (body: Record<string, any>) => handler({
  httpMethod: 'POST',
  queryStringParameters: { action: 'bulkAttendance' },
  body: JSON.stringify(body),
} as any, {} as any);

const baseBody = {
  courseId: 'course-1',
  date: '2026-07-20',
  entries: [
    { studentId: 'stu-1', attendance: 'present' },
    { studentId: 'stu-2', attendance: 'absent' },
  ],
  groupId: 'group-1',
};

/** Данные, записанные в lessonSessions в рамках батча (их не должно быть при отказе). */
const writtenSessions = () => batchSet.mock.calls
  .filter(([ref]) => ref._col === 'lessonSessions')
  .map(([, data]) => data);

const writtenJournal = () => batchSet.mock.calls.filter(([ref]) => ref._col === 'journal');

describe('api-gradebook bulkAttendance — авторизация lessonSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchCommit.mockResolvedValue(undefined);
    (verifyAuth as any).mockResolvedValue({
      uid: 'admin-1', role: 'admin', displayName: 'Админ', organizationId: ORG,
    });
  });

  describe('атрибуция teacherId', () => {
    it('отклоняет явный teacherId, который не ведёт эту группу', async () => {
      stubFirestore({
        group: { organizationId: ORG, courseId: 'course-1', teacherIds: ['teacher-a', 'teacher-b'] },
      });

      const res = await call({ ...baseBody, teacherId: 'teacher-outsider' });

      expect(res?.statusCode).toBe(400);
      expect(JSON.parse(res!.body!).error).toBe('Указанный преподаватель не ведёт эту группу');
      // Отказ до батча: ни сессии, ни журнала.
      expect(batchCommit).not.toHaveBeenCalled();
      expect(writtenSessions()).toHaveLength(0);
    });

    it('принимает явный teacherId, если он один из преподов группы', async () => {
      stubFirestore({
        group: { organizationId: ORG, courseId: 'course-1', teacherIds: ['teacher-a', 'teacher-b'] },
      });

      const res = await call({ ...baseBody, teacherId: 'teacher-b' });

      expect(res?.statusCode).toBe(200);
      expect(writtenSessions()).toHaveLength(1);
      expect(writtenSessions()[0].teacherId).toBe('teacher-b');
    });

    it('без teacherId с единственным преподом группы подставляет его', async () => {
      stubFirestore({ group: { organizationId: ORG, courseId: 'course-1', teacherIds: ['teacher-a'] } });

      const res = await call(baseBody);

      expect(res?.statusCode).toBe(200);
      expect(writtenSessions()[0].teacherId).toBe('teacher-a');
    });

    it('без teacherId с двумя преподами оставляет null, а не отметившего журнал', async () => {
      stubFirestore({
        group: { organizationId: ORG, courseId: 'course-1', teacherIds: ['teacher-a', 'teacher-b'] },
      });

      const res = await call(baseBody);

      expect(res?.statusCode).toBe(200);
      expect(writtenSessions()[0].teacherId).toBeNull();
      expect(writtenSessions()[0].teacherId).not.toBe('admin-1');
    });
  });

  describe('авторизация группы', () => {
    // ЕДИНСТВЕННЫЙ случай жёсткого отказа всему запросу: это атака, а не ошибка данных.
    it('отказывает для группы из чужой организации — журнал тоже не пишется', async () => {
      stubFirestore({
        group: { organizationId: 'org-other', courseId: 'course-1', teacherIds: ['teacher-a'] },
      });

      const res = await call(baseBody);

      expect(res?.statusCode).toBe(403);
      expect(batchCommit).not.toHaveBeenCalled();
      expect(writtenJournal()).toHaveLength(0);
    });

    it('при несовпадении courseId группы пишет журнал и пропускает только сессию', async () => {
      stubFirestore({
        group: { organizationId: ORG, courseId: 'course-999', teacherIds: ['teacher-a'] },
      });

      const res = await call(baseBody);

      // Проблема атрибуции зарплаты не должна стоить преподавателю записи в журнале.
      expect(res?.statusCode).toBe(200);
      expect(writtenJournal()).toHaveLength(2);
      expect(writtenSessions()).toHaveLength(0);
      expect(batchCommit).toHaveBeenCalledTimes(1);
    });

    it('группа «Без курса» (courseId пуст) не роняет журнал, сессии нет', async () => {
      stubFirestore({
        group: { organizationId: ORG, courseId: '', teacherIds: ['teacher-a'] },
      });

      const res = await call(baseBody);

      expect(res?.statusCode).toBe(200);
      expect(writtenJournal()).toHaveLength(2);
      expect(writtenSessions()).toHaveLength(0);
    });

    it('группа без поля courseId вообще не роняет журнал, сессии нет', async () => {
      stubFirestore({ group: { organizationId: ORG, teacherIds: ['teacher-a'] } });

      const res = await call(baseBody);

      expect(res?.statusCode).toBe(200);
      expect(writtenJournal()).toHaveLength(2);
      expect(writtenSessions()).toHaveLength(0);
    });

    it('несуществующая группа не роняет журнал, сессии нет', async () => {
      stubFirestore({ group: null });

      const res = await call(baseBody);

      expect(res?.statusCode).toBe(200);
      expect(writtenJournal()).toHaveLength(2);
      expect(writtenSessions()).toHaveLength(0);
    });

    it('преподаватель ТОЛЬКО из курса пишет журнал, но сессию ему не приписывают', async () => {
      // Ядро дефекта: членство в course.teacherIds давало право приписать занятие
      // (а значит и зарплату) ЛЮБОЙ группе этого курса.
      (verifyAuth as any).mockResolvedValue({
        uid: 'teacher-course-only', role: 'teacher', displayName: 'Курсовой', organizationId: ORG,
      });
      stubFirestore({
        group: { organizationId: ORG, courseId: 'course-1', teacherIds: ['teacher-a'] },
        course: {
          organizationId: ORG, title: 'Английский',
          teacherIds: ['teacher-a', 'teacher-course-only'],
        },
      });

      const res = await call(baseBody);

      expect(res?.statusCode).toBe(200);
      expect(writtenJournal()).toHaveLength(2);
      expect(writtenSessions()).toHaveLength(0);
    });

    it('автор курса, не ведущий группу, тоже не получает сессию', async () => {
      (verifyAuth as any).mockResolvedValue({
        uid: 'teacher-author', role: 'teacher', displayName: 'Автор', organizationId: ORG,
      });
      stubFirestore({
        group: { organizationId: ORG, courseId: 'course-1', teacherIds: ['teacher-a'] },
        course: {
          organizationId: ORG, title: 'Английский',
          teacherIds: ['teacher-a'], authorId: 'teacher-author',
        },
      });

      const res = await call(baseBody);

      expect(res?.statusCode).toBe(200);
      expect(writtenSessions()).toHaveLength(0);
    });

    it('преподаватель, не связанный ни с группой, ни с курсом, пишет журнал без сессии', async () => {
      (verifyAuth as any).mockResolvedValue({
        uid: 'teacher-stranger', role: 'teacher', displayName: 'Чужой', organizationId: ORG,
      });
      stubFirestore({
        group: { organizationId: ORG, courseId: 'course-1', teacherIds: ['teacher-a'] },
        course: { organizationId: ORG, title: 'Английский', teacherIds: ['teacher-a'] },
      });

      const res = await call(baseBody);

      expect(res?.statusCode).toBe(200);
      expect(writtenSessions()).toHaveLength(0);
    });

    it('пропускает преподавателя, состоящего в teacherIds группы', async () => {
      (verifyAuth as any).mockResolvedValue({
        uid: 'teacher-a', role: 'teacher', displayName: 'Препод', organizationId: ORG,
      });
      stubFirestore({
        group: { organizationId: ORG, courseId: 'course-1', teacherIds: ['teacher-a'] },
      });

      const res = await call(baseBody);

      expect(res?.statusCode).toBe(200);
      expect(writtenSessions()[0].teacherId).toBe('teacher-a');
    });
  });

  describe('легаси-путь', () => {
    it('без groupId пишет журнал и не создаёт сессию', async () => {
      stubFirestore();
      const { groupId, ...legacyBody } = baseBody;
      void groupId;

      const res = await call(legacyBody);

      expect(res?.statusCode).toBe(200);
      expect(JSON.parse(res!.body!)).toHaveLength(2);
      expect(writtenJournal()).toHaveLength(2);
      expect(writtenSessions()).toHaveLength(0);
      expect(batchCommit).toHaveBeenCalledTimes(1);
    });
  });
});
