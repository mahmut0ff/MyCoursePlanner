import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../api-attempts';
import { adminDb } from '../utils/firebase-admin';
import { verifyAuth } from '../utils/auth';

vi.mock('../utils/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(),
    batch: vi.fn()
  }
}));

vi.mock('../utils/auth', () => ({
  verifyAuth: vi.fn(),
  logSecurityAudit: vi.fn(),
  jsonResponse: (status: number, body: any) => ({ statusCode: status, body: JSON.stringify(body) }),
  ok: (body: any) => ({ statusCode: 200, body: JSON.stringify(body) }),
  forbidden: (msg?: string) => ({ statusCode: 403, body: JSON.stringify({ error: msg || 'Forbidden' }) }),
  badRequest: (msg: string) => ({ statusCode: 400, body: JSON.stringify({ error: msg }) }),
  notFound: (msg: string) => ({ statusCode: 404, body: JSON.stringify({ error: msg }) }),
  unauthorized: () => ({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) })
}));

describe('api-attempts (API Contracts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const generateEvent = (body: any) => ({
    httpMethod: 'POST',
    body: JSON.stringify(body)
  } as any);

  it('C-API-01: Saving attempt MUST include examId and roomId', async () => {
    (verifyAuth as any).mockResolvedValue({ uid: 'student1', organizationId: 'org1' });

    const response = await handler(generateEvent({ answers: {} }), {} as any);
    expect(response?.statusCode).toBe(400);
    expect(JSON.parse(response!.body).error).toMatch(/examId and roomId required/i);
  });

  it('C-API-02: Missing auth MUST respond 401 Unauthorized', async () => {
    (verifyAuth as any).mockResolvedValue(null);

    const response = await handler(generateEvent({ roomId: 'r1', examId: 'e1' }), {} as any);
    expect(response?.statusCode).toBe(401); 
  });

  it('C-API-03: Saving attempt for a room in a different organization MUST be 403 Forbidden', async () => {
    (verifyAuth as any).mockResolvedValue({ uid: 'student1', organizationId: 'org-A' });

    // Mocking Firestore
    (adminDb.collection as any).mockImplementation((col: string) => {
      if (col === 'examAttempts') {
        return {
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue({ empty: true }) // No existing attempt
        };
      }
      if (col === 'examRooms') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              exists: true,
              data: () => ({ status: 'active', organizationId: 'org-B' }) // DIFFERENT ORG
            })
          })
        };
      }
    });

    const response = await handler(generateEvent({ roomId: 'room-1', examId: 'exam-1' }), {} as any);
    expect(response?.statusCode).toBe(403);
    const body = JSON.parse(response!.body);
    expect(body.error).toMatch(/different organization/i);
  });
});
