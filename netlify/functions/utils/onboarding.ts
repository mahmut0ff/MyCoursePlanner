/**
 * Onboarding helpers — Telegram-driven student/teacher registration & login.
 *
 * - Join codes: organizations/{orgId} ↔ short codes. Reverse-resolved via
 *   orgJoinCodes/{code} → { orgId, role }. Current codes + mode live in
 *   orgOnboarding/{orgId} (backend-only).
 * - User creation: mints a passwordless Firebase Auth user (login via custom
 *   token) + users/{uid} doc + membership (both mirrors), respecting plan limits.
 * - Login tokens: telegramLoginTokens/{ott} → one-time custom-token exchange.
 */
import { randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminAuth } from './firebase-admin';
import { getOrgLimits } from './plan-limits';
import { notifyOrgAdmins } from './notifications';

const now = () => new Date().toISOString();

export type JoinRole = 'student' | 'teacher';

export interface OrgOnboarding {
  orgId: string;
  studentCode: string;
  teacherCode: string;
  /** 'auto' = students become active immediately (within plan limit); 'approval' = pending. */
  studentJoinMode: 'auto' | 'approval';
  updatedAt: string;
}

/** Human-friendly code: 6 chars, no ambiguous 0/O/1/I/L. */
function genCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function freshCode(orgId: string, role: JoinRole): Promise<string> {
  let code = genCode();
  for (let i = 0; i < 5; i++) {
    const exists = await adminDb.collection('orgJoinCodes').doc(code).get();
    if (!exists.exists) break;
    code = genCode();
  }
  await adminDb.collection('orgJoinCodes').doc(code).set({ orgId, role, createdAt: now() });
  return code;
}

/** Get (creating if needed) the org's onboarding config + join codes. */
export async function getOrgOnboarding(orgId: string): Promise<OrgOnboarding> {
  const ref = adminDb.collection('orgOnboarding').doc(orgId);
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() as Partial<OrgOnboarding>) : null;
  if (existing?.studentCode && existing?.teacherCode) {
    return {
      orgId,
      studentCode: existing.studentCode,
      teacherCode: existing.teacherCode,
      studentJoinMode: existing.studentJoinMode || 'auto',
      updatedAt: existing.updatedAt || now(),
    };
  }
  const studentCode = existing?.studentCode || await freshCode(orgId, 'student');
  const teacherCode = existing?.teacherCode || await freshCode(orgId, 'teacher');
  const data: OrgOnboarding = {
    orgId,
    studentCode,
    teacherCode,
    studentJoinMode: existing?.studentJoinMode || 'auto',
    updatedAt: now(),
  };
  await ref.set(data, { merge: true });
  return data;
}

/** Issue a new code for a role and invalidate the old one. */
export async function regenerateCode(orgId: string, role: JoinRole): Promise<string> {
  const onboarding = await getOrgOnboarding(orgId);
  const oldCode = role === 'student' ? onboarding.studentCode : onboarding.teacherCode;
  const newCode = await freshCode(orgId, role);
  if (oldCode) await adminDb.collection('orgJoinCodes').doc(oldCode).delete().catch(() => {});
  await adminDb.collection('orgOnboarding').doc(orgId).set(
    { ...(role === 'student' ? { studentCode: newCode } : { teacherCode: newCode }), updatedAt: now() },
    { merge: true },
  );
  return newCode;
}

export async function setStudentJoinMode(orgId: string, mode: 'auto' | 'approval'): Promise<void> {
  await getOrgOnboarding(orgId);
  await adminDb.collection('orgOnboarding').doc(orgId).set({ studentJoinMode: mode, updatedAt: now() }, { merge: true });
}

/** Resolve a join code to its org + role. */
export async function resolveJoinCode(code: string): Promise<{ orgId: string; role: JoinRole } | null> {
  const snap = await adminDb.collection('orgJoinCodes').doc(code.trim().toUpperCase()).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return { orgId: d.orgId, role: d.role };
}

async function countActiveMembers(orgId: string, role: JoinRole): Promise<number> {
  const snap = await adminDb.collection('orgMembers').doc(orgId).collection('members')
    .where('role', '==', role).where('status', '==', 'active').get();
  return snap.size;
}

export interface JoinResult {
  uid: string;
  status: 'active' | 'pending';
  isNewUser: boolean;
  alreadyMember: boolean;
}

/**
 * Create (or reuse) a Telegram-linked user and join them to the org.
 * Students auto-activate within plan limits unless the org requires approval;
 * teachers always land as pending approval.
 */
export async function createOrJoinTelegramUser(args: {
  chatId: string | number;
  phone: string;
  displayName: string;
  role: JoinRole;
  orgId: string;
  orgName: string;
}): Promise<JoinResult> {
  const chatId = String(args.chatId);
  const displayName = (args.displayName || '').trim() || 'Студент';

  // 1. Dedupe by telegramChatId.
  let uid: string;
  let isNewUser = false;
  const existing = await adminDb.collection('users').where('telegramChatId', '==', chatId).limit(1).get();
  if (!existing.empty) {
    uid = existing.docs[0].id;
  } else {
    const record = await adminAuth.createUser({ displayName });
    uid = record.uid;
    isNewUser = true;
    await adminDb.collection('users').doc(uid).set({
      uid,
      username: '',
      email: '',
      displayName,
      role: args.role,
      avatarUrl: '',
      bio: '',
      skills: [],
      city: '',
      country: '',
      phone: args.phone || '',
      telegramChatId: chatId,
      telegramLinkedAt: now(),
      activeOrgId: args.orgId,
      organizationId: args.orgId,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  // 2. Already an active member? Nothing to do.
  const memRef = adminDb.collection('users').doc(uid).collection('memberships').doc(args.orgId);
  const memSnap = await memRef.get();
  if (memSnap.exists && memSnap.data()?.status === 'active') {
    return { uid, status: 'active', isNewUser, alreadyMember: true };
  }

  // 3. Decide status.
  let status: 'active' | 'pending' = 'pending';
  if (args.role === 'student') {
    const onboarding = await getOrgOnboarding(args.orgId);
    if (onboarding.studentJoinMode === 'auto') {
      const limits = await getOrgLimits(args.orgId);
      const activeStudents = await countActiveMembers(args.orgId, 'student');
      status = (limits.maxStudents !== -1 && activeStudents >= limits.maxStudents) ? 'pending' : 'active';
    }
  } // teachers: always pending

  // 4. Write membership (both mirrors) + ensure user org context.
  const ts = now();
  const membership = {
    userId: uid,
    userName: displayName,
    userEmail: '',
    organizationId: args.orgId,
    organizationName: args.orgName,
    role: args.role,
    status,
    joinMethod: 'telegram',
    joinedAt: status === 'active' ? ts : '',
    createdAt: ts,
    updatedAt: ts,
  };
  await memRef.set(membership, { merge: true });
  await adminDb.collection('orgMembers').doc(args.orgId).collection('members').doc(uid).set(membership, { merge: true });
  await adminDb.collection('users').doc(uid).set(
    { activeOrgId: args.orgId, organizationId: args.orgId, role: args.role, telegramChatId: chatId, updatedAt: ts },
    { merge: true },
  );

  // 5. Increment org counts when active.
  if (status === 'active') {
    const field = args.role === 'student' ? 'studentsCount' : 'teachersCount';
    await adminDb.collection('organizations').doc(args.orgId).update({ [field]: FieldValue.increment(1) }).catch(() => {});
  }

  // 6. Notify org admins.
  if (status === 'pending') {
    notifyOrgAdmins(
      args.orgId, 'new_vacancy_application' as any,
      'Новая заявка на вступление',
      `${displayName} подал(а) заявку через Telegram (${args.role === 'teacher' ? 'преподаватель' : 'ученик'})`,
      args.role === 'teacher' ? '/teachers' : '/students',
    ).catch(() => {});
  } else {
    notifyOrgAdmins(
      args.orgId, 'new_member' as any,
      'Новый ученик',
      `${displayName} присоединился(ась) через Telegram`,
      '/students',
    ).catch(() => {});
  }

  return { uid, status, isNewUser, alreadyMember: false };
}

/** Issue a one-time login token (15-min TTL) for passwordless web sign-in. */
export async function createLoginToken(uid: string): Promise<string> {
  const ott = randomBytes(24).toString('base64url');
  await adminDb.collection('telegramLoginTokens').doc(ott).set({
    uid,
    createdAt: now(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  return ott;
}

/** Consume a one-time login token, returning its uid (or null if invalid/expired). */
export async function consumeLoginToken(ott: string): Promise<string | null> {
  const ref = adminDb.collection('telegramLoginTokens').doc(ott);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  await ref.delete().catch(() => {}); // one-time use
  if (new Date(d.expiresAt) < new Date()) return null;
  return d.uid as string;
}
