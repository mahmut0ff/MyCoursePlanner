import { adminDb } from './firebase-admin';

export const PLAN_LIMITS: Record<string, { maxStudents: number; maxTeachers: number; maxExams: number }> = {
  starter: { maxStudents: 50, maxTeachers: 5, maxExams: 20 },
  professional: { maxStudents: 200, maxTeachers: 20, maxExams: -1 },
  enterprise: { maxStudents: -1, maxTeachers: -1, maxExams: -1 },
};

export async function getOrgLimits(organizationId: string) {
  let limits = { ...PLAN_LIMITS.starter };
  
  try {
    // 1. Get Plan ID
    const orgDoc = await adminDb.collection('organizations').doc(organizationId).get();
    if (orgDoc.exists) {
      const planId = orgDoc.data()?.planId;
      if (planId && PLAN_LIMITS[planId]) {
        limits = { ...PLAN_LIMITS[planId] };
      }
    }

    // 2. Check super admin overrides
    const overrideDoc = await adminDb.collection('orgOverrides').doc(organizationId).get();
    if (overrideDoc.exists) {
      const overrides = overrideDoc.data();
      if (overrides) {
         if (overrides.maxStudents !== undefined && overrides.maxStudents !== null) limits.maxStudents = overrides.maxStudents;
         if (overrides.maxTeachers !== undefined && overrides.maxTeachers !== null) limits.maxTeachers = overrides.maxTeachers;
         if (overrides.maxExams !== undefined && overrides.maxExams !== null) limits.maxExams = overrides.maxExams;
      }
    }
  } catch (e) {
    console.error(`Error fetching limits for org ${organizationId}:`, e);
  }

  return limits;
}
