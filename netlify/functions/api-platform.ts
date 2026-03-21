/**
 * API: Platform — super admin analytics and platform-wide data.
 *
 * GET /api-platform             → platform-wide stats
 * GET /api-platform?logs=true   → system logs
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { verifyAuth, isSuperAdmin, ok, unauthorized, forbidden, jsonResponse } from './utils/auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const user = await verifyAuth(event);
  if (!user) return unauthorized();
  if (!isSuperAdmin(user)) return forbidden();

  const params = event.queryStringParameters || {};

  // System logs
  if (params.logs === 'true') {
    const snap = await adminDb.collection('systemLogs')
      .orderBy('createdAt', 'desc')
      .limit(100).get();
    return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  // Platform stats — parallel queries
  const [orgsSnap, usersSnap, examsSnap, attemptsSnap, subsSnap] = await Promise.all([
    adminDb.collection('organizations').get(),
    adminDb.collection('users').get(),
    adminDb.collection('exams').get(),
    adminDb.collection('examAttempts').get(),
    adminDb.collection('subscriptions').where('status', 'in', ['active', 'trial']).get(),
  ]);

  const orgs = orgsSnap.docs.map((d) => d.data());
  const users = usersSnap.docs.map((d) => d.data());

  // Calculate monthly revenue
  const planPrices: Record<string, number> = { starter: 39, professional: 79, enterprise: 99 };
  const monthlyRevenue = orgs
    .filter((o) => o.status === 'active')
    .reduce((sum, o) => sum + (planPrices[o.planId] || 0), 0);

  return ok({
    totalOrganizations: orgsSnap.size,
    activeOrganizations: orgs.filter((o) => o.status === 'active').length,
    suspendedOrganizations: orgs.filter((o) => o.status === 'suspended').length,
    trialOrgs: subsSnap.docs.filter((d) => d.data().status === 'trial').length,
    totalUsers: usersSnap.size,
    totalStudents: users.filter((u) => u.role === 'student').length,
    totalTeachers: users.filter((u) => u.role === 'teacher').length,
    totalAdmins: users.filter((u) => u.role === 'admin').length,
    totalExams: examsSnap.size,
    totalAttempts: attemptsSnap.size,
    monthlyRevenue,
    planDistribution: {
      starter: orgs.filter((o) => o.planId === 'starter').length,
      professional: orgs.filter((o) => o.planId === 'professional').length,
      enterprise: orgs.filter((o) => o.planId === 'enterprise').length,
    },
    recentOrgs: orgsSnap.docs.slice(0, 10).map((d) => ({ id: d.id, ...d.data() })),
  });
};

export { handler };
