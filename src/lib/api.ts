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

// ---- Auth Checks (Username/Email) ----
export const apiCheckAuthIdentity = (data: { action: 'check'; username?: string; email?: string }) => 
  apiRequest('api-auth-check', 'POST', data);
export const apiResolveUsername = (username: string) => 
  apiRequest('api-auth-check', 'POST', { action: 'resolve', username });

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
export const apiDeleteAuditLogs = () => apiRequest('api-audit', 'DELETE');
export const apiCloseRoom = (roomId: string) => apiRequest('api-rooms', 'POST', { action: 'close', roomId });

// ---- AI Generation ----
export const apiAIGenerate = (data: { prompt?: string; type: 'quiz' | 'exam'; fileUrl?: string }) =>
  apiRequest('api-ai-generate', 'POST', data);

// ---- Attempts ----
export const apiGetAttempts = () => apiRequest('api-attempts');
export const apiGetAttempt = (id: string) => apiRequest('api-attempts', 'GET', undefined, { id });
export const apiGetAttemptsByStudent = (studentId: string) =>
  apiRequest('api-attempts', 'GET', undefined, { studentId });
export const apiGetAttemptsByRoom = (roomId: string) =>
  apiRequest('api-attempts', 'GET', undefined, { roomId });
export const apiSaveAttempt = (data: any) => apiRequest('api-attempts', 'POST', data);
export const apiUpdateAttempt = (data: any) => apiRequest('api-attempts', 'PUT', data);

// ---- Gamification ----
export const apiGetGamification = (studentId?: string) =>
  apiRequest('api-gamification', 'GET', undefined, studentId ? { studentId } : undefined);
export const apiAwardXP = (data: any) => apiRequest('api-gamification', 'POST', data);

// ---- Certificates ----
export const apiGenerateCertificate = (data: any) => apiRequest('api-certificates', 'POST', data);
export const apiGetCertificate = (id: string) => apiRequest('api-certificates', 'GET', undefined, { id });
export const apiGetMyCertificates = (studentId?: string) =>
  apiRequest('api-certificates', 'GET', undefined, { action: 'myCertificates', ...(studentId ? { studentId } : {}) });

// ---- Memberships ----
const memberReq = <T = any>(action: string, method = 'GET', body?: any, extra?: Record<string, string>) =>
  apiRequest<T>('api-memberships', method, body, { action, ...extra });

export const apiGetMyMemberships = () => memberReq('myMemberships');
export const apiGetOrgMembers = (orgId: string, status?: string) =>
  memberReq('orgMembers', 'GET', undefined, { orgId, ...(status ? { status } : {}) });
export const apiApplyToOrg = (organizationId: string, role?: string) =>
  memberReq('apply', 'POST', { organizationId, role });
export const apiInviteToOrg = (email: string, organizationId: string, role?: string) =>
  memberReq('invite', 'POST', { email, organizationId, role });
export const apiAcceptMembership = (userId: string, organizationId: string) =>
  memberReq('accept', 'POST', { userId, organizationId });
export const apiRejectMembership = (userId: string, organizationId: string) =>
  memberReq('reject', 'POST', { userId, organizationId });
export const apiLeaveMembership = (organizationId: string) =>
  memberReq('leave', 'POST', { organizationId });
export const apiRemoveMember = (userId: string, organizationId: string) =>
  memberReq('remove', 'POST', { userId, organizationId });
export const apiChangeMemberRole = (userId: string, organizationId: string, newRole: string) =>
  memberReq('changeRole', 'POST', { userId, organizationId, newRole });
export const apiSwitchOrg = (organizationId: string) =>
  memberReq('switchOrg', 'POST', { organizationId });
export const apiPublicJoin = (orgSlug: string) =>
  memberReq<{ status: string; orgId?: string; orgName?: string }>('publicJoin', 'POST', { orgSlug });
export const apiSetBranchAssignment = (userId: string, organizationId: string, branchIds: string[], primaryBranchId?: string) =>
  memberReq('setBranchAssignment', 'POST', { userId, organizationId, branchIds, primaryBranchId });

// ---- Dashboard (branch-aware) ----
export const apiGetBranchAnalytics = () =>
  apiRequest<any>('api-dashboard', 'GET', undefined, { action: 'branchAnalytics' });

// ---- Organization Directory (public) ----
export const apiGetOrgDirectory = () =>
  apiRequest('api-organizations', 'GET', undefined, { action: 'directory' });
export const apiGetPublicOrgProfile = (id?: string, slug?: string) =>
  apiRequest('api-organizations', 'GET', undefined, {
    action: 'publicProfile',
    ...(id ? { id } : {}),
    ...(slug ? { slug } : {}),
  });

// ---- Payments ----
export const apiCreatePayment = (data: any) => apiRequest('api-payments', 'POST', data);
export const apiCheckPayment = (orderId: string) => apiRequest('api-payments', 'GET', undefined, { status: 'check', orderId });

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

// ============================================================
// ORG API (Organization Admin — tenant-scoped)
// ============================================================

const orgReq = <T = any>(action: string, method = 'GET', body?: any, extra?: Record<string, string>) =>
  apiRequest<T>('api-org', method, body, { action, ...extra });

// Courses
export const orgGetCourses = () => orgReq('courses');
export const orgGetCourse = (id: string) => orgReq('course', 'GET', undefined, { id });
export const orgCreateCourse = (data: any) => orgReq('createCourse', 'POST', data);
export const orgUpdateCourse = (data: any) => orgReq('updateCourse', 'POST', data);
export const orgDeleteCourse = (id: string) => orgReq('deleteCourse', 'POST', { id });

// Groups
export const orgGetGroups = (courseId?: string) => orgReq('groups', 'GET', undefined, courseId ? { courseId } : undefined);
export const orgGetGroup = (id: string) => orgReq('group', 'GET', undefined, { id });
export const orgCreateGroup = (data: any) => orgReq('createGroup', 'POST', data);
export const orgUpdateGroup = (data: any) => orgReq('updateGroup', 'POST', data);
export const orgDeleteGroup = (id: string) => orgReq('deleteGroup', 'POST', { id });

// Students
export const orgGetStudents = () => orgReq('students');
export const orgCreateStudent = (data: any) => orgReq('createStudent', 'POST', data);
export const orgUpdateStudent = (data: any) => orgReq('updateStudent', 'POST', data);

// Teachers
export const orgGetTeachers = () => orgReq('teachers');
export const orgCreateTeacher = (data: any) => orgReq('createTeacher', 'POST', data);
export const orgInviteUser = (email: string, role: string) => orgReq('inviteUser', 'POST', { email, role });

// Materials
export const orgGetMaterials = (filters?: Record<string, string>) => orgReq('materials', 'GET', undefined, filters);
export const orgCreateMaterial = (data: any) => orgReq('createMaterial', 'POST', data);
export const orgDeleteMaterial = (id: string) => orgReq('deleteMaterial', 'POST', { id });

// Schedule
export const orgGetSchedule = (from?: string, to?: string, groupId?: string) => {
  const params: Record<string, string> = {};
  if (from) params.from = from;
  if (to) params.to = to;
  if (groupId) params.groupId = groupId;
  return orgReq('schedule', 'GET', undefined, Object.keys(params).length ? params : undefined);
};
export const orgCreateEvent = (data: any) => orgReq('createEvent', 'POST', data);
export const orgUpdateEvent = (data: any) => orgReq('updateEvent', 'POST', data);
export const orgDeleteEvent = (id: string) => orgReq('deleteEvent', 'POST', { id });

// Results
export const orgGetResults = (filters?: Record<string, string>) => orgReq('results', 'GET', undefined, filters);

// Org Users
export const orgGetUsers = () => orgReq('orgUsers');
export const orgUpdateUserRole = (uid: string, role: string) => orgReq('updateUserRole', 'POST', { uid, role });

// Org Settings
export const orgGetSettings = () => orgReq('orgSettings');
export const orgUpdateSettings = (data: any) => orgReq('updateOrgSettings', 'POST', data);

// Org Dashboard
export const orgGetDashboardStats = () => orgReq('dashboardStats');

// ============================================================
// GRADEBOOK API (grades, journal, schemas — org-scoped)
// ============================================================

const gbReq = <T = any>(action: string, method = 'GET', body?: any, extra?: Record<string, string>) =>
  apiRequest<T>('api-gradebook', method, body, { action, ...extra });

// Grades
export const orgGetGrades = (courseId: string, filters?: Record<string, string>) =>
  gbReq('grades', 'GET', undefined, { courseId, ...filters });
export const orgSaveGrade = (data: any) => gbReq('grade', 'POST', data);
export const orgBulkSaveGrades = (courseId: string, grades: any[]) =>
  gbReq('bulkGrades', 'POST', { courseId, grades });
export const orgDeleteGrade = (id: string) => gbReq('deleteGrade', 'POST', { id });

// Grade Schema
export const orgGetGradeSchema = (courseId: string) =>
  gbReq('schema', 'GET', undefined, { courseId });
export const orgSaveGradeSchema = (data: any) => gbReq('schema', 'POST', data);

// Journal
export const orgGetJournal = (courseId: string, filters?: Record<string, string>) =>
  gbReq('journal', 'GET', undefined, { courseId, ...filters });
export const orgSaveJournal = (data: any) => gbReq('journal', 'POST', data);
export const orgBulkAttendance = (courseId: string, date: string, entries: any[]) =>
  gbReq('bulkAttendance', 'POST', { courseId, date, entries });

// ============================================================
// BRANCHES API (via api-branches)
// ============================================================

const brReq = <T = any>(action: string, method = 'GET', body?: any, extra?: Record<string, string>) =>
  apiRequest<T>('api-branches', method, body, { action, ...extra });

export const orgListBranches = () => brReq('list');
export const orgGetBranch = (branchId: string) => brReq('get', 'GET', undefined, { branchId });
export const orgCreateBranch = (data: any) => brReq('create', 'POST', data);
export const orgUpdateBranch = (data: any) => brReq('update', 'POST', data);
export const orgArchiveBranch = (id: string) => brReq('archive', 'POST', { id });
export const orgAssignUserToBranch = (userId: string, branchId: string) =>
  brReq('assignUser', 'POST', { userId, branchId });
export const orgRemoveUserFromBranch = (userId: string, branchId: string) =>
  brReq('removeUser', 'POST', { userId, branchId });

// ============================================================
// TEACHER / INVITES API (via api-users, works without org)
// ============================================================

const userReq = <T = any>(action: string, method = 'GET', body?: any, extra?: Record<string, string>) =>
  apiRequest<T>('api-users', method, body, { action, ...extra });

// Invites
export const apiGetPendingInviteCount = () => userReq<{ count: number }>('pendingInviteCount');
export const apiGetMyInvites = () => userReq('myInvites');
export const apiAcceptInvite = (inviteId: string) => userReq('acceptInvite', 'POST', { inviteId });
export const apiDeclineInvite = (inviteId: string) => userReq('declineInvite', 'POST', { inviteId });
export const apiLeaveOrganization = () => userReq('leaveOrganization', 'POST');

// Teacher Profile
export const apiGetTeacherProfile = (uid?: string) => userReq('teacherProfile', 'GET', undefined, uid ? { uid } : undefined);
export const apiUpdateTeacherProfile = (data: any) => userReq('teacherProfile', 'PUT', data);

// Teacher Settings
export const apiGetTeacherSettings = () => userReq('teacherSettings');
export const apiUpdateTeacherSettings = (data: any) => userReq('teacherSettings', 'PUT', data);

// ============================================================
// VACANCIES API
// ============================================================

const vacReq = <T = any>(action: string, method = 'GET', body?: any, extra?: Record<string, string>) =>
  apiRequest<T>('api-vacancies', method, body, { action, ...extra });

// Public
export const vacListVacancies = (filters?: Record<string, string>) => vacReq('list', 'GET', undefined, filters);
export const vacGetVacancy = (id: string) => vacReq('get', 'GET', undefined, { id });

// Org Admin
export const vacCreateVacancy = (data: any) => vacReq('create', 'POST', data);
export const vacUpdateVacancy = (data: any) => vacReq('update', 'POST', data);
export const vacCloseVacancy = (id: string) => vacReq('close', 'POST', { id });
export const vacDeleteVacancy = (id: string) => vacReq('delete', 'POST', { id });
export const vacGetOrgVacancies = () => vacReq('orgVacancies');
export const vacGetVacancyApplications = (vacancyId: string) => vacReq('vacancyApplications', 'GET', undefined, { vacancyId });
export const vacReviewApplication = (applicationId: string, status: string) => vacReq('reviewApplication', 'POST', { applicationId, status });

// Teacher
export const vacApplyToVacancy = (vacancyId: string, coverLetter: string, resumeUrl?: string) =>
  vacReq('apply', 'POST', { vacancyId, coverLetter, resumeUrl });
export const vacGetMyApplications = () => vacReq('myApplications');

// ============================================================
// NOTIFICATIONS API
// ============================================================

const notifReq = <T = any>(action: string, method = 'GET', body?: any) =>
  apiRequest<T>('api-notifications', method, body, { action });

export const apiGetNotifications = () => notifReq('list');
export const apiGetUnreadCount = () => notifReq<{ count: number }>('unreadCount');
export const apiMarkNotificationRead = (id: string) => notifReq('markRead', 'POST', { id });
export const apiMarkAllNotificationsRead = () => notifReq('markAllRead', 'POST');
export const apiSaveFcmToken = (token: string) => notifReq('saveFcmToken', 'POST', { token });
export const apiRemoveFcmToken = (token: string) => notifReq('removeFcmToken', 'POST', { token });

// ============================================================
// QUIZ SYSTEM API
// ============================================================

// ─── Quizzes ───
export const apiGetQuizzes = (params?: Record<string, string>) =>
  apiRequest('api-quizzes', 'GET', undefined, params);
export const apiGetQuiz = (id: string) =>
  apiRequest('api-quizzes', 'GET', undefined, { id });
export const apiCreateQuiz = (data: any) =>
  apiRequest('api-quizzes', 'POST', data);
export const apiUpdateQuiz = (data: any) =>
  apiRequest('api-quizzes', 'PUT', data);
export const apiDeleteQuiz = (id: string) =>
  apiRequest('api-quizzes', 'DELETE', undefined, { id });
export const apiDuplicateQuiz = (quizId: string) =>
  apiRequest('api-quizzes', 'POST', { action: 'duplicate', quizId });
export const apiPublishQuiz = (quizId: string) =>
  apiRequest('api-quizzes', 'POST', { action: 'publish', quizId });
export const apiUnpublishQuiz = (quizId: string) =>
  apiRequest('api-quizzes', 'POST', { action: 'unpublish', quizId });
export const apiArchiveQuiz = (quizId: string) =>
  apiRequest('api-quizzes', 'POST', { action: 'archive', quizId });
export const apiShareQuiz = (data: any) =>
  apiRequest('api-quizzes', 'POST', { action: 'share', ...data });
export const apiSaveQuizQuestions = (quizId: string, questions: any[]) =>
  apiRequest('api-quizzes', 'POST', { action: 'saveQuestions', quizId, questions });

// ─── Quiz Sessions ───
export const apiGetQuizSessions = () =>
  apiRequest('api-quiz-sessions');
export const apiGetQuizSession = (id: string) =>
  apiRequest('api-quiz-sessions', 'GET', undefined, { id });
export const apiGetQuizSessionByCode = (code: string) =>
  apiRequest('api-quiz-sessions', 'GET', undefined, { code });
export const apiCreateQuizSession = (data: any) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'create', ...data });
export const apiJoinQuizSession = (data: { sessionId?: string; code?: string }) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'join', ...data });
export const apiStartQuizSession = (sessionId: string) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'start', sessionId });
export const apiNextQuestion = (sessionId: string) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'nextQuestion', sessionId });
export const apiPauseQuizSession = (sessionId: string) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'pause', sessionId });
export const apiResumeQuizSession = (sessionId: string) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'resume', sessionId });
export const apiEndQuizSession = (sessionId: string) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'end', sessionId });
export const apiCancelQuizSession = (sessionId: string) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'cancel', sessionId });
export const apiKickParticipant = (sessionId: string, participantId: string) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'kick', sessionId, participantId });
export const apiLockQuizSession = (sessionId: string) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'lock', sessionId });
export const apiUnlockQuizSession = (sessionId: string) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'unlock', sessionId });
export const apiRestartQuizSession = (sessionId: string) =>
  apiRequest('api-quiz-sessions', 'POST', { action: 'restart', sessionId });

// ─── Quiz Answers & Leaderboard ───
export const apiSubmitQuizAnswer = (data: any) =>
  apiRequest('api-quiz-answers', 'POST', data);
export const apiGetQuizLeaderboard = (sessionId: string) =>
  apiRequest('api-quiz-answers', 'GET', undefined, { sessionId, leaderboard: 'true' });
export const apiGetQuizAnswers = (sessionId: string, questionId?: string) =>
  apiRequest('api-quiz-answers', 'GET', undefined, { sessionId, ...(questionId ? { questionId } : {}) });

// ─── Quiz Analytics ───
export const apiGetSessionAnalytics = (sessionId: string) =>
  apiRequest('api-quiz-analytics', 'GET', undefined, { sessionId });
export const apiGetQuizAnalytics = (quizId: string) =>
  apiRequest('api-quiz-analytics', 'GET', undefined, { quizId });
export const apiExportSessionResults = (sessionId: string) =>
  apiRequest('api-quiz-analytics', 'POST', { sessionId });

// ============================================================
// CHAT SYSTEM API
// ============================================================

export const apiCreateChatRoom = (data: any) =>
  apiRequest('api-chat', 'POST', data, { action: 'createRoom' });

export const apiUpdateChatParticipants = (roomId: string, addUids?: string[], removeUids?: string[]) =>
  apiRequest('api-chat', 'POST', { roomId, addUids, removeUids }, { action: 'updateParticipants' });

export const apiArchiveChatRoom = (roomId: string, isArchived: boolean) =>
  apiRequest('api-chat', 'POST', { roomId, isArchived }, { action: 'archiveRoom' });

export const apiModerateChatMessage = (roomId: string, messageId: string) =>
  apiRequest('api-chat', 'POST', { roomId, messageId }, { action: 'moderateMessage' });

export const apiNotifyChatMessage = (roomId: string, text: string, senderName: string) =>
  apiRequest('api-chat', 'POST', { roomId, text, senderName }, { action: 'notifyMessage' });

// ============================================================
// FINANCE SYSTEM API
// ============================================================

export const apiGetTransactions = (filters?: { branchId?: string; startDate?: string; endDate?: string }) =>
  apiRequest('api-finance-transactions', 'GET', undefined, filters as any);

export const apiCreateTransaction = (data: any) =>
  apiRequest('api-finance-transactions', 'POST', data);

export const apiGetPaymentPlans = (filters?: { branchId?: string; studentId?: string; status?: string }) =>
  apiRequest('api-finance-plans', 'GET', undefined, filters as any);

export const apiCreatePaymentPlan = (data: any) =>
  apiRequest('api-finance-plans', 'POST', data);

export const apiUpdatePaymentPlan = (planId: string, data: any) =>
  apiRequest('api-finance-plans', 'PUT', { planId, ...data });

export const apiGetFinanceMetrics = (branchId?: string) =>
  apiRequest('api-finance-metrics', 'GET', undefined, branchId ? { branchId } : undefined);
