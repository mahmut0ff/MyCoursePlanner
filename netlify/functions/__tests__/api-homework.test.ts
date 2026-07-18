import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../api-homework';
import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';

// Only the leaf side-effects are mocked — `utils/notifications` runs for real so
// these tests exercise the full recipient-resolution chain.
vi.mock('../utils/firebase-admin', () => ({
  adminDb: { collection: vi.fn() },
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
  TELEGRAM_BOT_TOKEN: 'test-token',
}));

vi.mock('../utils/join-approvals', () => ({ sendJoinApprovalButtons: vi.fn() }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ send: vi.fn() }) }));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class { getGenerativeModel() { return {}; } },
}));

const notificationsAdd = vi.fn().mockResolvedValue({ id: 'n1' });

/**
 * Firestore stub for one submission flow: a lesson authored by `teacher-author`
 * and assigned to a group taught by `teacher-group`, in an org whose only
 * admin-role member is `admin-1`.
 */
function stubFirestore(opts: { lesson?: any; group?: any; members?: any[] } = {}) {
  // `=== undefined` rather than `??` so an explicit `null` means "doc missing".
  const lesson = opts.lesson === undefined ? { authorId: 'teacher-author', groupIds: ['group-1'] } : opts.lesson;
  const group = opts.group === undefined ? { teacherIds: ['teacher-group'] } : opts.group;
  const members = opts.members ?? [
    { userId: 'admin-1', role: 'admin', status: 'active' },
    { userId: 'teacher-author', role: 'teacher', status: 'active' },
  ];

  (adminDb.collection as any).mockImplementation((col: string) => {
    if (col === 'homework_submissions') {
      return {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true }),
        add: vi.fn().mockResolvedValue({ id: 'sub-1' }),
      };
    }
    if (col === 'lessons') {
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

/** Recipients of the in-app notification docs written so far. */
const recipients = () => notificationsAdd.mock.calls.map(c => c[0].recipientId).sort();

describe('api-homework — submission notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyAuth as any).mockResolvedValue({
      uid: 'student-1', role: 'student', displayName: 'Иван', organizationId: 'org-1',
    });
  });

  it('notifies the lesson author and the group teacher, not just org admins', async () => {
    stubFirestore();

    const res = await handler(submitEvent(), {} as any);
    expect(res?.statusCode).toBe(200);

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

    await handler(submitEvent(), {} as any);

    await vi.waitFor(() => expect(notificationsAdd).toHaveBeenCalledTimes(1));
    expect(recipients()).toEqual(['admin-1']);
  });

  it('never notifies the submitting student', async () => {
    // A student re-submitting to a lesson they somehow authored.
    stubFirestore({ lesson: { authorId: 'student-1', groupIds: [] } });

    await handler(submitEvent(), {} as any);

    await vi.waitFor(() => expect(notificationsAdd).toHaveBeenCalled());
    expect(recipients()).not.toContain('student-1');
  });

  it('still notifies org admins when the lesson doc is missing', async () => {
    stubFirestore({ lesson: null });

    await handler(submitEvent(), {} as any);

    await vi.waitFor(() => expect(notificationsAdd).toHaveBeenCalledTimes(1));
    expect(recipients()).toEqual(['admin-1']);
  });
});
