import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../api-homework';
import { ingestHomeworkPart, listOpenHomework, findHomework, type OpenHomework } from '../utils/homework-inbox';
import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';

// Gemini answers through a spy so the AI-grading test can read the prompt it got;
// vi.hoisted keeps it reachable from the hoisted vi.mock factory below.
const { generateContentSpy } = vi.hoisted(() => ({ generateContentSpy: vi.fn() }));

// Only the leaf side-effects are mocked — `utils/notifications` runs for real so
// these tests exercise the full recipient-resolution chain.
vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: vi.fn() },
  uploadServerFile: vi.fn(),
  STORAGE_BUCKET: 'test-bucket',
}));

vi.mock('../utils/auth', () => ({
  verifyAuth: vi.fn(),
  isStaff: () => false,
  can: () => false,
  jsonResponse: (status: number, body: any) => ({ statusCode: status, body: JSON.stringify(body) }),
  ok: (body: any) => ({ statusCode: 200, body: JSON.stringify(body) }),
  forbidden: (msg?: string) => ({ statusCode: 403, body: JSON.stringify({ error: msg || 'Forbidden' }) }),
  badRequest: (msg: string) => ({ statusCode: 400, body: JSON.stringify({ error: msg }) }),
  notFound: (msg: string) => ({ statusCode: 404, body: JSON.stringify({ error: msg }) }),
  unauthorized: () => ({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }),
}));

vi.mock('../utils/rate-limiter', () => ({
  rateLimiters: { write: { isLimited: () => false } },
  getRateLimitKey: () => 'test-key',
}));

vi.mock('../utils/telegram', () => ({
  sendTelegramToUser: vi.fn().mockResolvedValue(undefined),
  getTelegramBotToken: () => 'test-token',
}));

vi.mock('../utils/join-approvals', () => ({ sendJoinApprovalButtons: vi.fn() }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ send: vi.fn() }) }));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class { getGenerativeModel() { return { generateContent: generateContentSpy }; } },
}));

const notificationsAdd = vi.fn().mockResolvedValue({ id: 'n1' });
const submissionsAdd = vi.fn().mockResolvedValue({ id: 'sub-1' });
const submissionUpdate = vi.fn().mockResolvedValue(undefined);

/**
 * Firestore stub for one submission flow: a lesson authored by `teacher-author`
 * and assigned to a group taught by `teacher-group`, in an org whose only
 * admin-role member is `admin-1`. Lessons answer under `lessonPlans` only — the
 * collection api-lessons writes; a reader that asks for anything else gets the
 * "missing doc" default below.
 */
function stubFirestore(opts: { lesson?: any; group?: any; members?: any[]; submission?: any } = {}) {
  // `=== undefined` rather than `??` so an explicit `null` means "doc missing".
  const lesson = opts.lesson === undefined ? { authorId: 'teacher-author', groupIds: ['group-1'] } : opts.lesson;
  const group = opts.group === undefined ? { teacherIds: ['teacher-group'] } : opts.group;
  const members = opts.members ?? [
    { userId: 'admin-1', role: 'admin', status: 'active' },
    { userId: 'teacher-author', role: 'teacher', status: 'active' },
  ];
  const submission = opts.submission ?? null;

  (adminDb.collection as any).mockImplementation((col: string) => {
    if (col === 'homework_submissions') {
      return {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        add: submissionsAdd,
        doc: () => ({
          get: vi.fn().mockResolvedValue({ exists: !!submission, data: () => submission }),
          update: submissionUpdate,
        }),
      };
    }
    if (col === 'lessonPlans') {
      return { doc: () => ({ get: vi.fn().mockResolvedValue({ exists: !!lesson, data: () => lesson }) }) };
    }
    if (col === 'groups') {
      return { doc: () => ({ get: vi.fn().mockResolvedValue({ exists: !!group, data: () => group }) }) };
    }
    if (col === 'orgMembers') {
      return {
        doc: () => ({
          collection: () => ({
            where: vi.fn().mockReturnThis(),
            get: vi.fn().mockResolvedValue({
              docs: members.map((m, i) => ({ id: `m${i}`, data: () => m })),
            }),
          }),
        }),
      };
    }
    if (col === 'notifications') return { add: notificationsAdd };
    if (col === 'users') {
      // sendPush + Telegram org lookup — no tokens, so both are no-ops.
      return { doc: () => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }) }) };
    }
    return { doc: () => ({ get: vi.fn().mockResolvedValue({ exists: false, data: () => null }) }) };
  });
}

const homework = (over: Partial<OpenHomework> = {}): OpenHomework => ({
  lessonId: 'lesson-1',
  lessonTitle: 'Алгебра, урок 3',
  homeworkTitle: 'Квадратные уравнения',
  description: '',
  dueDate: null,
  points: 10,
  groupId: 'group-1',
  groupName: 'A2',
  submissionId: null,
  submittedAt: null,
  isGraded: false,
  finalScore: null,
  ...over,
});

/** Приём работы из Telegram — единственный путь сдачи после переезда в бота. */
const submit = () => ingestHomeworkPart({
  orgId: 'org-1',
  studentUid: 'student-1',
  studentName: 'Иван',
  chatId: '555',
  homework: homework(),
  text: 'моё решение',
});

/** Recipients of the in-app notification docs written so far. */
const recipients = () => notificationsAdd.mock.calls.map(c => c[0].recipientId).sort();

describe('homework-inbox — submission notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submissionsAdd.mockResolvedValue({ id: 'sub-1' });
  });

  it('notifies the lesson author and the group teacher, not just org admins', async () => {
    stubFirestore();

    await submit();

    // Notifications are fire-and-forget, so wait for the chain to settle.
    await vi.waitFor(() => expect(notificationsAdd).toHaveBeenCalledTimes(3));
    expect(recipients()).toEqual(['admin-1', 'teacher-author', 'teacher-group']);
    expect(notificationsAdd.mock.calls[0][0].type).toBe('homework_submitted');
  });

  it('does not notify the same person twice when a teacher is also an admin', async () => {
    stubFirestore({
      lesson: { authorId: 'admin-1', groupIds: [] },
      members: [{ userId: 'admin-1', role: 'admin', status: 'active' }],
    });

    await submit();

    await vi.waitFor(() => expect(notificationsAdd).toHaveBeenCalledTimes(1));
    expect(recipients()).toEqual(['admin-1']);
  });

  it('never notifies the submitting student', async () => {
    // A student submitting to a lesson they somehow authored.
    stubFirestore({ lesson: { authorId: 'student-1', groupIds: [] } });

    await submit();

    await vi.waitFor(() => expect(notificationsAdd).toHaveBeenCalled());
    expect(recipients()).not.toContain('student-1');
  });

  it('still notifies org admins when the lesson doc is missing', async () => {
    stubFirestore({ lesson: null });

    await submit();

    await vi.waitFor(() => expect(notificationsAdd).toHaveBeenCalledTimes(1));
    expect(recipients()).toEqual(['admin-1']);
  });

  it('records the submission as coming from Telegram, and late when past due', async () => {
    stubFirestore();

    await ingestHomeworkPart({
      orgId: 'org-1',
      studentUid: 'student-1',
      studentName: 'Иван',
      chatId: '555',
      homework: homework({ dueDate: '2000-01-01' }),
      text: 'поздняя работа',
    });

    const written = submissionsAdd.mock.calls[0][0];
    expect(written.source).toBe('telegram');
    expect(written.isLate).toBe(true);
    expect(written.status).toBe('pending');
    expect(written.telegramChatId).toBe('555');
  });
});

describe('api-homework — web submission is closed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubFirestore();
  });

  const submitEvent = () => ({
    httpMethod: 'POST',
    path: '/.netlify/functions/api-homework',
    body: JSON.stringify({
      lessonId: 'lesson-1',
      lessonTitle: 'Алгебра, урок 3',
      organizationId: 'org-1',
      content: 'моё решение',
    }),
  } as any);

  it('turns a student away to the Telegram bot instead of accepting the work', async () => {
    (verifyAuth as any).mockResolvedValue({
      uid: 'student-1', role: 'student', displayName: 'Иван', organizationId: 'org-1',
    });

    const res = await handler(submitEvent(), {} as any);

    expect(res?.statusCode).toBe(410);
    expect(JSON.parse(res!.body as string).error).toMatch(/Telegram/);
    // Ключевое: работа не записана и никого не потревожила.
    expect(submissionsAdd).not.toHaveBeenCalled();
    expect(notificationsAdd).not.toHaveBeenCalled();
  });
});

/**
 * Firestore в памяти для выбора заданий. Запрос обязан отобрать строки своими
 * where-клаузами (как в api-payroll.test.ts): чтение не той коллекции или не
 * того поля даёт пустой список, а не проходит молча. Возвращает журнал
 * выполненных запросов — по нему проверяется форма запроса.
 */
function stubStore(seed: Record<string, any[]>) {
  const log: Array<{ col: string; where: any[][] }> = [];
  const matches = (row: any, [field, op, value]: any[]) => {
    const v = row[field];
    if (op === '==') return (v ?? null) === value;
    if (op === 'array-contains') return Array.isArray(v) && v.includes(value);
    if (op === 'array-contains-any') return Array.isArray(v) && v.some((x: any) => value.includes(x));
    throw new Error(`stub: operator ${op} is not supported`);
  };
  const query = (col: string, where: any[][]): any => ({
    where: (...clause: any[]) => query(col, [...where, clause]),
    get: async () => {
      log.push({ col, where });
      const rows = (seed[col] || []).filter(r => where.every(c => matches(r, c)));
      return { empty: rows.length === 0, docs: rows.map(r => ({ id: r.id, data: () => r })) };
    },
  });
  (adminDb.collection as any).mockImplementation((col: string) => query(col, []));
  return log;
}

/** Урок в том виде, в каком его пишет api-lessons: группы в `groupIds`, ДЗ блоком `homework`. */
const lessonDoc = (id: string, over: Record<string, any> = {}) => ({
  id,
  title: 'Алгебра, урок 3',
  organizationId: 'org-1',
  authorId: 'teacher-author',
  status: 'published',
  groupIds: ['g1'],
  groupNames: ['A2'],
  homework: { title: 'Квадратные уравнения', description: 'Решить №1–5', dueDate: '2099-01-10', points: 5 },
  ...over,
});

const inboxSeed = (lessons: any[], submissions: any[] = []) => ({
  groups: [
    { id: 'g1', name: 'A2', organizationId: 'org-1', studentIds: ['student-1'] },
    { id: 'g2', name: 'B1', organizationId: 'org-1', studentIds: ['student-2'] },
  ],
  lessonPlans: lessons,
  homework_submissions: submissions,
});

describe('homework-inbox — /dz lists the homework of lessonPlans', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers the published homework of the student’s own groups, and nothing else', async () => {
    stubStore(inboxSeed([
      lessonDoc('l-open'),
      lessonDoc('l-draft', { status: 'draft' }),
      lessonDoc('l-no-homework', { homework: null }),
      lessonDoc('l-other-group', { groupIds: ['g2'], groupNames: ['B1'] }),
      lessonDoc('l-other-org', { organizationId: 'org-2' }),
    ]));

    const items = await listOpenHomework('org-1', 'student-1');

    expect(items).toEqual([{
      lessonId: 'l-open',
      lessonTitle: 'Алгебра, урок 3',
      homeworkTitle: 'Квадратные уравнения',
      description: 'Решить №1–5',
      dueDate: '2099-01-10',
      points: 5,
      groupId: 'g1',
      groupName: 'A2',
      submissionId: null,
      submittedAt: null,
      isGraded: false,
      finalScore: null,
    }]);
  });

  it('asks Firestore with one array-contains-any filter — no composite index needed', async () => {
    const log = stubStore(inboxSeed([lessonDoc('l-open')]));

    await listOpenHomework('org-1', 'student-1');

    expect(log.filter(q => q.col === 'lessonPlans')).toEqual([
      { col: 'lessonPlans', where: [['groupIds', 'array-contains-any', ['g1']]] },
    ]);
    expect((adminDb.collection as any).mock.calls.map((c: any[]) => c[0])).not.toContain('lessons');
  });

  it('keeps sent work on the list, marked, and puts graded work last', async () => {
    stubStore(inboxSeed(
      [
        lessonDoc('l-graded', { homework: { title: 'Оценённое', description: 'x', dueDate: '2099-01-01' } }),
        lessonDoc('l-sent', { homework: { title: 'Отправленное', description: 'x', dueDate: '2099-01-02' } }),
        lessonDoc('l-later', { homework: { title: 'Позже', description: 'x', dueDate: '2099-03-01' } }),
        lessonDoc('l-soon', { homework: { title: 'Скоро', description: 'x', dueDate: '2099-02-01' } }),
      ],
      [
        { id: 's-graded', lessonId: 'l-graded', studentId: 'student-1', organizationId: 'org-1', status: 'graded', finalScore: 4, submittedAt: '2026-10-01T10:00:00Z' },
        { id: 's-sent', lessonId: 'l-sent', studentId: 'student-1', organizationId: 'org-1', status: 'pending', submittedAt: '2026-10-02T10:00:00Z' },
      ],
    ));

    const items = await listOpenHomework('org-1', 'student-1');

    expect(items.map(i => i.lessonId)).toEqual(['l-soon', 'l-later', 'l-sent', 'l-graded']);
    expect(items[0].points).toBe(10); // no points on the lesson → the default
    expect(items[2]).toMatchObject({ submissionId: 's-sent', isGraded: false });
    expect(items[3]).toMatchObject({ submissionId: 's-graded', isGraded: true, finalScore: 4 });
  });

  it('resolves the task behind a button press, and nothing for a draft lesson', async () => {
    stubStore(inboxSeed([lessonDoc('l-open'), lessonDoc('l-draft', { status: 'draft' })]));

    expect(await findHomework('org-1', 'student-1', 'l-open')).toMatchObject({ lessonId: 'l-open', groupName: 'A2' });
    expect(await findHomework('org-1', 'student-1', 'l-draft')).toBeNull();
  });
});

describe('api-homework — AI grading reads the assignment off the lesson', () => {
  beforeEach(() => vi.clearAllMocks());

  it('puts the lesson’s homework and subject into the prompt', async () => {
    stubFirestore({
      lesson: {
        authorId: 'teacher-author', groupIds: ['group-1'], subject: 'Алгебра',
        homework: { title: 'Квадратные уравнения', description: 'Решить №1–5' },
      },
      submission: { lessonId: 'lesson-1', studentId: 'student-1', content: 'x = 2', maxPoints: 5, attachments: [] },
    });
    (verifyAuth as any).mockResolvedValue({ uid: 'student-1', role: 'student', displayName: 'Иван', organizationId: 'org-1' });
    generateContentSpy.mockResolvedValue({
      response: { text: () => JSON.stringify({ grade: 4, summary: 'ok', strengths: [], weaknesses: [], grammarIssues: [], suggestions: 'Молодец' }) },
    });

    const res = await handler({ httpMethod: 'POST', path: '/.netlify/functions/api-homework/sub-1/ai-grade', body: null } as any, {} as any);

    expect(res?.statusCode).toBe(200);
    const prompt: string = generateContentSpy.mock.calls[0][0][0].text;
    expect(prompt).toContain('Квадратные уравнения: Решить №1–5');
    expect(prompt).toContain('по предмету «Алгебра»');
    expect(prompt).not.toContain('Unknown task.');
    expect(submissionUpdate).toHaveBeenCalledWith({ aiAnalysis: expect.objectContaining({ grade: 4 }) });
  });
});
