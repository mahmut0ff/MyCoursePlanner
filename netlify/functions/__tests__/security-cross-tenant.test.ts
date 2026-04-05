import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler as attemptsHandler } from '../api-attempts';
import { handler as roomsHandler } from '../api-rooms';
import { handler as gamificationHandler } from '../api-gamification';
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
  isStaff: vi.fn().mockReturnValue(false),
  hasRole: vi.fn().mockReturnValue(false),
  jsonResponse: (status: number, body: any) => ({ statusCode: status, body: JSON.stringify(body) }),
  ok: (body: any) => ({ statusCode: 200, body: JSON.stringify(body) }),
  forbidden: (msg?: string) => ({ statusCode: 403, body: JSON.stringify({ error: msg || 'Forbidden' }) }),
  badRequest: (msg: string) => ({ statusCode: 400, body: JSON.stringify({ error: msg }) }),
  notFound: (msg: string) => ({ statusCode: 404, body: JSON.stringify({ error: msg }) }),
  unauthorized: () => ({ statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }),
  serverError: (msg: string) => ({ statusCode: 500, body: JSON.stringify({ error: msg }) })
}));

describe('Security: Cross-Tenant API Attacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const generateEvent = (method: string, body?: any, queryStringParameters?: any) => ({
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
    queryStringParameters: queryStringParameters || {}
  } as any);

  describe('1. Parameter Tampering', () => {
    it('S-API-01: api-attempts [POST] - Tampering with userId payload SHOULD be ignored/overridden by verifyAuth token', async () => {
      // Attacker is student1, but tries to send payload as student2
      (verifyAuth as any).mockResolvedValue({ uid: 'student1', organizationId: 'org1' });

      (adminDb.collection as any).mockImplementation((col: string) => {
        if (col === 'examAttempts') {
          return {
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            get: vi.fn().mockResolvedValue({ empty: true }),
            doc: vi.fn().mockReturnValue({ id: 'att1' })
          };
        }
        if (col === 'examRooms') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => ({ status: 'active', organizationId: 'org1' })
              })
            })
          };
        }
        if (col === 'exams') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => ({ organizationId: 'org1', passingScore: 50 })
              }),
              collection: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  get: vi.fn().mockResolvedValue({ docs: [] })
                })
              })
            })
          };
        }
        // General fallback for other collections
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
            collection: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ docs: [] }) }),
            set: vi.fn(),
            update: vi.fn(),
            delete: vi.fn()
          }),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          add: vi.fn().mockResolvedValue({ id: 'new-id' }),
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] })
        };
      });

      const mockBatch = {
        set: vi.fn(),
        update: vi.fn(),
        commit: vi.fn()
      };
      (adminDb.batch as any).mockReturnValue(mockBatch);

      const response = await attemptsHandler(generateEvent('POST', { 
        roomId: 'room1', 
        examId: 'exam1', 
        studentId: 'HACKED-USER-ID', // TAMPERED 
        answers: {} 
      }), {} as any);

      expect(response?.statusCode).toBe(200);
      
      // Look at what was successfully written to the batch
      // The user ID must be forcibly set to the AUTH uid, ignoring the payload
      const setCall = mockBatch.set.mock.calls.find(c => c[1].studentId);
      expect(setCall).toBeDefined();
      expect(setCall![1].studentId).toBe('student1');
      expect(setCall![1].studentId).not.toBe('HACKED-USER-ID');
    });

  });

  describe('2. Cross-Tenant Data Access', () => {
    it('S-API-03: api-attempts [GET] - Attempting to read exam attempts for a room in a different org', async () => {
      // The attacker is in org1
      (verifyAuth as any).mockResolvedValue({ uid: 'student1', organizationId: 'org1' });

      (adminDb.collection as any).mockImplementation((col: string) => {
        if (col === 'examRooms') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                exists: true,
                data: () => ({ status: 'active', organizationId: 'ALIEN-ORG' }) // Room belongs to Alien Org
              })
            })
          };
        }
      });

      const response = await attemptsHandler(generateEvent('GET', null, { roomId: 'room1' }), {} as any);
      expect(response?.statusCode).toBe(403);
      expect(JSON.parse(response!.body!).error).toMatch(/Forbidden/i);
    });

    it('S-API-04: api-gamification [POST generate] - Attacking with payload for a different organization', async () => {
      (verifyAuth as any).mockResolvedValue({ uid: 'student1', organizationId: 'org1' });

      (adminDb.collection as any).mockImplementation((col: string) => {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) })
          })
        };
      });

      const response = await gamificationHandler(generateEvent('POST', { 
        action: 'generate',
        organizationId: 'ALIEN-ORG' // TAMPERED ORG ID
      }), {} as any);
      
      expect(response?.statusCode).toBe(403);
      expect(JSON.parse(response!.body!).error).toMatch(/Organization mismatch/i);
    });
  });
});
