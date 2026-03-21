/**
 * API client — authenticated HTTP calls to Netlify Functions.
 * Multi-tenant aware: all requests include Firebase ID token.
 */
import { auth } from './firebase';

const API_BASE = '/.netlify/functions';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return { 'Content-Type': 'application/json' };
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function apiRequest<T = any>(
  endpoint: string,
  method: string = 'GET',
  body?: any,
  params?: Record<string, string>
): Promise<T> {
  let url = `${API_BASE}/${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorData.error || `API error: ${res.status}`);
  }

  return res.json();
}

// ---- Users ----
export const apiGetUsers = () => apiRequest('api-users');
export const apiGetUser = (uid: string) => apiRequest('api-users', 'GET', undefined, { uid });
export const apiUpdateUser = (data: any) => apiRequest('api-users', 'PUT', data);
export const apiDeleteUser = (uid: string) => apiRequest('api-users', 'DELETE', undefined, { uid });

// ---- Lessons ----
export const apiGetLessons = () => apiRequest('api-lessons');
export const apiGetLesson = (id: string) => apiRequest('api-lessons', 'GET', undefined, { id });
export const apiCreateLesson = (data: any) => apiRequest('api-lessons', 'POST', data);
export const apiUpdateLesson = (data: any) => apiRequest('api-lessons', 'PUT', data);
export const apiDeleteLesson = (id: string) => apiRequest('api-lessons', 'DELETE', undefined, { id });

// ---- Exams ----
export const apiGetExams = () => apiRequest('api-exams');
export const apiGetExam = (id: string) => apiRequest('api-exams', 'GET', undefined, { id });
export const apiCreateExam = (data: any) => apiRequest('api-exams', 'POST', data);
export const apiUpdateExam = (data: any) => apiRequest('api-exams', 'PUT', data);
export const apiDeleteExam = (id: string) => apiRequest('api-exams', 'DELETE', undefined, { id });
export const apiSaveQuestions = (examId: string, questions: any[]) =>
  apiRequest('api-exams', 'POST', { action: 'saveQuestions', examId, questions });

// ---- Rooms ----
export const apiGetRooms = () => apiRequest('api-rooms');
export const apiGetRoom = (id: string) => apiRequest('api-rooms', 'GET', undefined, { id });
export const apiGetRoomByCode = (code: string) => apiRequest('api-rooms', 'GET', undefined, { code });
export const apiCreateRoom = (data: any) => apiRequest('api-rooms', 'POST', data);
export const apiJoinRoom = (roomId: string) => apiRequest('api-rooms', 'POST', { action: 'join', roomId });
export const apiCloseRoom = (roomId: string) => apiRequest('api-rooms', 'POST', { action: 'close', roomId });

// ---- Attempts ----
export const apiGetAttempts = () => apiRequest('api-attempts');
export const apiGetAttempt = (id: string) => apiRequest('api-attempts', 'GET', undefined, { id });
export const apiGetAttemptsByStudent = (studentId: string) =>
  apiRequest('api-attempts', 'GET', undefined, { studentId });
export const apiGetAttemptsByRoom = (roomId: string) =>
  apiRequest('api-attempts', 'GET', undefined, { roomId });
export const apiSaveAttempt = (data: any) => apiRequest('api-attempts', 'POST', data);

// ---- Dashboard ----
export const apiGetDashboard = () => apiRequest('api-dashboard');

// ---- Organizations ----
export const apiGetOrganizations = () => apiRequest('api-organizations');
export const apiGetOrganization = (id: string) => apiRequest('api-organizations', 'GET', undefined, { id });
export const apiCreateOrganization = (data: any) => apiRequest('api-organizations', 'POST', data);
export const apiUpdateOrganization = (data: any) => apiRequest('api-organizations', 'PUT', data);
export const apiDeleteOrganization = (id: string) => apiRequest('api-organizations', 'DELETE', undefined, { id });

// ---- Subscriptions ----
export const apiGetSubscription = (orgId?: string) =>
  apiRequest('api-subscriptions', 'GET', undefined, orgId ? { orgId } : undefined);
export const apiChangePlan = (planId: string, organizationId?: string) =>
  apiRequest('api-subscriptions', 'POST', { planId, organizationId });
export const apiCancelSubscription = (organizationId?: string) =>
  apiRequest('api-subscriptions', 'PUT', { action: 'cancel', organizationId });
export const apiReactivateSubscription = (organizationId?: string) =>
  apiRequest('api-subscriptions', 'PUT', { action: 'reactivate', organizationId });

// ---- Platform (Super Admin) ----
export const apiGetPlatformStats = () => apiRequest('api-platform');
export const apiGetSystemLogs = () => apiRequest('api-platform', 'GET', undefined, { logs: 'true' });

// ---- AI Feedback ----
export const apiGenerateFeedback = (attemptId: string) =>
  apiRequest('ai-feedback', 'POST', { attemptId });

// ============================================================
// ADMIN API (Super Admin Panel)
// ============================================================

const adminReq = <T = any>(action: string, method = 'GET', body?: any, extra?: Record<string, string>) =>
  apiRequest<T>('api-admin', method, body, { action, ...extra });

// Organizations
export const adminGetOrgs = (filters?: Record<string, string>) => adminReq('orgs', 'GET', undefined, filters);
export const adminGetOrg = (id: string) => adminReq('org', 'GET', undefined, { id });
export const adminCreateOrg = (data: any) => adminReq('createOrg', 'POST', data);
export const adminSuspendOrg = (id: string, reason?: string) => adminReq('suspendOrg', 'POST', { id, reason });
export const adminActivateOrg = (id: string) => adminReq('activateOrg', 'POST', { id });
export const adminDeleteOrg = (id: string) => adminReq('deleteOrg', 'POST', { id });
export const adminUpdateOrg = (data: any) => adminReq('updateOrg', 'POST', data);
export const adminAddOrgNote = (organizationId: string, note: string) => adminReq('addOrgNote', 'POST', { organizationId, note });

// Users
export const adminGetUsers = (filters?: Record<string, string>) => adminReq('users', 'GET', undefined, filters);
export const adminGetUser = (uid: string) => adminReq('user', 'GET', undefined, { uid });
export const adminUpdateUserRole = (uid: string, role: string) => adminReq('updateUserRole', 'POST', { uid, role });
export const adminDisableUser = (uid: string) => adminReq('disableUser', 'POST', { uid });
export const adminEnableUser = (uid: string) => adminReq('enableUser', 'POST', { uid });
export const adminResetPassword = (email: string) => adminReq('resetPassword', 'POST', { email });

// Billing
export const adminGetSubscriptions = (filters?: Record<string, string>) => adminReq('subscriptions', 'GET', undefined, filters);
export const adminChangePlan = (organizationId: string, planId: string) => adminReq('changePlan', 'POST', { organizationId, planId });
export const adminExtendSubscription = (organizationId: string, days: number) => adminReq('extendSubscription', 'POST', { organizationId, days });
export const adminCancelSubscription = (organizationId: string) => adminReq('cancelSubscription', 'POST', { organizationId });

// Analytics
export const adminGetAnalytics = () => adminReq('analytics');

// Audit Logs
export const adminGetAuditLogs = (filters?: Record<string, string>) => adminReq('auditLogs', 'GET', undefined, filters);

// Feature Flags
export const adminGetFeatureFlags = () => adminReq('featureFlags');
export const adminSetFeatureFlag = (key: string, enabled: boolean, description?: string) => adminReq('setFeatureFlag', 'POST', { key, enabled, description });
export const adminSetOrgOverride = (data: any) => adminReq('setOrgOverride', 'POST', data);

// System Health
export const adminGetSystemHealth = () => adminReq('systemHealth');
