/**
 * Shared HTTP client for Planula Netlify Functions.
 *
 * Environment-agnostic: caller supplies the base URL and a way to fetch the
 * current Firebase ID token. The web app and the React Native apps each get
 * tokens differently (browser SDK vs @react-native-firebase/auth), so we
 * inject the token resolver instead of importing Firebase here.
 */
import type { Membership, Organization, UserProfile } from '@planula/types';

export interface ApiClientConfig {
  /** Base URL of the deployed Netlify Functions, e.g. https://planula.netlify.app/.netlify/functions */
  baseUrl: string;
  /** Async getter returning the current Firebase ID token, or null if logged out. */
  getIdToken: () => Promise<string | null>;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function createApiClient(config: ApiClientConfig) {
  const request = async <T = any>(
    endpoint: string,
    method: string = 'GET',
    body?: any,
    params?: Record<string, string>,
  ): Promise<T> => {
    let url = `${config.baseUrl}/${endpoint}`;
    if (params) {
      const sp = new URLSearchParams(params);
      url += `?${sp.toString()}`;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = await config.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(errorData.error || `API error: ${res.status}`, res.status);
    }
    return res.json();
  };

  return {
    request,

    // ── Dashboard ──
    getDashboard: () => request<Record<string, any>>('api-dashboard'),

    // ── Memberships ──
    getMemberships: () => request<Membership[]>('api-memberships'),
    switchOrg: (organizationId: string) =>
      request('api-memberships', 'POST', { action: 'switch', organizationId }),

    // ── Profile ──
    getProfile: () => request<UserProfile>('api-users'),
    updateProfile: (data: Partial<UserProfile>) => request('api-users', 'PUT', data),

    // ── Lessons ──
    getLessons: () => request<any[]>('api-lessons'),
    getLesson: (id: string) => request<any>('api-lessons', 'GET', undefined, { id }),

    // ── Exams ──
    getExams: () => request<any[]>('api-exams'),
    getExam: (id: string) => request<any>('api-exams', 'GET', undefined, { id }),

    // ── Courses & Groups ──
    getCourses: () => request<any[]>('api-org', 'GET', undefined, { action: 'courses' }),
    getGroups: (courseId?: string) =>
      request<any[]>('api-org', 'GET', undefined, courseId ? { action: 'groups', courseId } : { action: 'groups' }),

    // ── Schedule ──
    getSchedule: () => request<any[]>('api-org', 'GET', undefined, { action: 'schedule' }),

    // ── Notifications ──
    getNotifications: () => request<any[]>('api-notifications'),
    saveFcmToken: (token: string) => request('api-notifications', 'POST', { action: 'saveFcmToken', token }),

    // ── Organizations (directory) ──
    getOrgDirectory: () => request<Organization[]>('api-organizations'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
