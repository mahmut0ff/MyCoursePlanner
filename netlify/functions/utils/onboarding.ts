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
import { notifyOrgAdmins, notifyJoinRequest } from './notifications';

const now = () => new Date().toISOString();

/**
 * Internal email domain for Telegram-registered accounts. The address is only
 * used as a Firebase Auth login handle (username → email resolution); students
 * sign in by their auto-generated username, never see this address. Kept in
 * sync with the frontend check in StudentProfilePage.tsx.
 */
export const TG_LOGIN_EMAIL_DOMAIN = 'tg.sabakhub.app';

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

async function freshCode(orgId: string, role: JoinRole, extra?: { groupId?: string; groupName?: string }): Promise<string> {
  let code = genCode();
  for (let i = 0; i < 5; i++) {
    const exists = await adminDb.collection('orgJoinCodes').doc(code).get();
    if (!exists.exists) break;
    code = genCode();
  }
  await adminDb.collection('orgJoinCodes').doc(code).set({
    orgId, role, createdAt: now(),
    ...(extra?.groupId ? { groupId: extra.groupId, groupName: extra.groupName || '' } : {}),
  });
  return code;
}

/** A temporary, easy-to-type password (10 chars, no ambiguous 0/O/1/I/l). */
function genTempPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Generate a unique, student-friendly login username (e.g. student_4821). */
async function freshUsername(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const n = (randomBytes(2).readUInt16BE(0) % 9000) + 1000; // 1000..9999
    const candidate = `student_${n}`;
    const exists = await adminDb.collection('users').where('username', '==', candidate).limit(1).get();
    if (exists.empty) return candidate;
  }
  return `student_${randomBytes(4).toString('hex')}`; // fallback: collision-proof
}

/** Add a user to a group's roster (students vs teachers). */
async function assignToGroup(orgId: string, groupId: string, uid: string, role: JoinRole): Promise<void> {
  const field = role === 'teacher' ? 'teacherIds' : 'studentIds';
  await adminDb.collection('groups').doc(groupId)
    .update({ [field]: FieldValue.arrayUnion(uid), updatedAt: now() })
    .catch(() => {});
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

/** Resolve a join code to its org + role (+ optional group). */
export async function resolveJoinCode(code: string): Promise<{ orgId: string; role: JoinRole; groupId?: string; groupName?: string } | null> {
  const snap = await adminDb.collection('orgJoinCodes').doc(code.trim().toUpperCase()).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return { orgId: d.orgId, role: d.role, groupId: d.groupId, groupName: d.groupName };
}

/** Get (creating if needed) a reusable join code for a specific group. */
export async function getGroupJoinCode(orgId: string, groupId: string): Promise<{ code: string; groupName: string } | null> {
  const groupSnap = await adminDb.collection('groups').doc(groupId).get();
  if (!groupSnap.exists) return null;
  const g = groupSnap.data()!;
  if (g.organizationId !== orgId) return null;
  const groupName = g.name || 'Группа';
  if (g.joinCode) {
    const map = await adminDb.collection('orgJoinCodes').doc(g.joinCode).get();
    if (map.exists) return { code: g.joinCode, groupName };
  }
  const code = await freshCode(orgId, 'student', { groupId, groupName });
  await adminDb.collection('groups').doc(groupId).update({ joinCode: code }).catch(() => {});
  return { code, groupName };
}

/** Issue a new code for a group, invalidating the previous one. */
export async function regenerateGroupCode(orgId: string, groupId: string): Promise<{ code: string; groupName: string } | null> {
  const groupSnap = await adminDb.collection('groups').doc(groupId).get();
  if (!groupSnap.exists) return null;
  const g = groupSnap.data()!;
  if (g.organizationId !== orgId) return null;
  const groupName = g.name || 'Группа';
  const code = await freshCode(orgId, 'student', { groupId, groupName });
  if (g.joinCode) await adminDb.collection('orgJoinCodes').doc(g.joinCode).delete().catch(() => {});
  await adminDb.collection('groups').doc(groupId).update({ joinCode: code }).catch(() => {});
  return { code, groupName };
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
  /** Auto-generated login (set only when a brand-new account is created). */
  loginUsername?: string;
  /** Temporary password issued for the new account (sent once via the bot). */
  tempPassword?: string;
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
  groupId?: string;
  groupName?: string;
}): Promise<JoinResult> {
  const chatId = String(args.chatId);
  const displayName = (args.displayName || '').trim() || 'Студент';

  // 1. Dedupe by telegramChatId.
  let uid: string;
  let isNewUser = false;
  let loginUsername = '';
  let tempPassword = '';
  const existing = await adminDb.collection('users').where('telegramChatId', '==', chatId).limit(1).get();
  if (!existing.empty) {
    uid = existing.docs[0].id;
  } else {
    // Brand-new account: mint a username + temp password so the student can also
    // sign in on the web (username → email login), not only via the Telegram link.
    loginUsername = await freshUsername();
    tempPassword = genTempPassword();
    const loginEmail = `${loginUsername}@${TG_LOGIN_EMAIL_DOMAIN}`;
    const record = await adminAuth.createUser({ email: loginEmail, password: tempPassword, displayName });
    uid = record.uid;
    isNewUser = true;
    await adminDb.collection('users').doc(uid).set({
      uid,
      username: loginUsername,
      email: loginEmail,
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

  // 2. Already an active member? Just (re)assign to the group if a group link was used.
  const memRef = adminDb.collection('users').doc(uid).collection('memberships').doc(args.orgId);
  const memSnap = await memRef.get();
  if (memSnap.exists && memSnap.data()?.status === 'active') {
    if (args.groupId) await assignToGroup(args.orgId, args.groupId, uid, args.role);
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

  // 5b. Auto-assign to the group (group invite links).
  if (args.groupId) {
    await assignToGroup(args.orgId, args.groupId, uid, args.role);
  }

  // 6. Notify org admins.
  if (status === 'pending') {
    // Interactive notification with "Принять / Отклонить" buttons in Telegram.
    notifyJoinRequest(args.orgId, uid, displayName, args.role).catch(() => {});
  } else {
    notifyOrgAdmins(
      args.orgId, 'new_member' as any,
      'Новый ученик',
      `${displayName} присоединился(ась) через Telegram`,
      '/students',
    ).catch(() => {});
  }

  return { uid, status, isNewUser, alreadyMember: false, loginUsername, tempPassword };
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

/** Ensure the user has a parent-portal key, returning it (matches api-users format). */
export async function ensureParentKey(uid: string): Promise<string> {
  const snap = await adminDb.collection('users').doc(uid).get();
  const existing = snap.data()?.parentPortalKey;
  if (existing) return existing as string;
  const key = `pp_${Date.now()}_${randomBytes(4).toString('hex')}`;
  await adminDb.collection('users').doc(uid).set({ parentPortalKey: key, updatedAt: now() }, { merge: true });
  return key;
}

/** Issue a durable claim token (30 days) that links a pre-created account to a Telegram chat. */
export async function createClaimToken(uid: string, orgId: string): Promise<string> {
  const token = randomBytes(16).toString('base64url');
  await adminDb.collection('orgClaimTokens').doc(token).set({
    uid, orgId, createdAt: now(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return token;
}

export async function resolveClaimToken(token: string): Promise<{ uid: string; orgId: string } | null> {
  const snap = await adminDb.collection('orgClaimTokens').doc(token).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  if (new Date(d.expiresAt) < new Date()) return null;
  return { uid: d.uid, orgId: d.orgId };
}

export interface InviteResult {
  uid: string;
  token: string;
  status: 'active' | 'pending';
  isNew: boolean;
}

/**
 * Pre-create an account from data the center already has (bulk import, voice add).
 * Creates a passwordless user + membership (+ group), and returns a claim token so
 * the person links Telegram with one tap (no contact/name step).
 * Dedupes by phone within the org.
 */
export async function createPendingInvite(args: {
  orgId: string;
  orgName: string;
  role: JoinRole;
  name: string;
  phone: string;
  groupId?: string;
  groupName?: string;
}): Promise<InviteResult> {
  const displayName = (args.name || '').trim() || (args.role === 'teacher' ? 'Преподаватель' : 'Ученик');
  const phone = (args.phone || '').trim();

  let uid: string | null = null;
  let isNew = false;
  if (phone) {
    const existing = await adminDb.collection('users')
      .where('phone', '==', phone).where('organizationId', '==', args.orgId).limit(1).get();
    if (!existing.empty) uid = existing.docs[0].id;
  }
  if (!uid) {
    const record = await adminAuth.createUser({ displayName });
    uid = record.uid;
    isNew = true;
    await adminDb.collection('users').doc(uid).set({
      uid, username: '', email: '', displayName, role: args.role,
      avatarUrl: '', bio: '', skills: [], city: '', country: '', phone,
      activeOrgId: args.orgId, organizationId: args.orgId,
      createdAt: now(), updatedAt: now(),
    });
  }

  // Membership (admin-initiated → active within plan limit; teachers active).
  const memRef = adminDb.collection('users').doc(uid).collection('memberships').doc(args.orgId);
  const memSnap = await memRef.get();
  let status: 'active' | 'pending' = 'active';
  if (!(memSnap.exists && memSnap.data()?.status === 'active')) {
    if (args.role === 'student') {
      const limits = await getOrgLimits(args.orgId);
      const active = await countActiveMembers(args.orgId, 'student');
      status = (limits.maxStudents !== -1 && active >= limits.maxStudents) ? 'pending' : 'active';
    }
    const ts = now();
    const membership = {
      userId: uid, userName: displayName, userEmail: '',
      organizationId: args.orgId, organizationName: args.orgName,
      role: args.role, status, joinMethod: 'invite',
      joinedAt: status === 'active' ? ts : '', createdAt: ts, updatedAt: ts,
    };
    await memRef.set(membership, { merge: true });
    await adminDb.collection('orgMembers').doc(args.orgId).collection('members').doc(uid).set(membership, { merge: true });
    await adminDb.collection('users').doc(uid).set(
      { activeOrgId: args.orgId, organizationId: args.orgId, role: args.role, updatedAt: ts }, { merge: true },
    );
    if (status === 'active') {
      const field = args.role === 'student' ? 'studentsCount' : 'teachersCount';
      await adminDb.collection('organizations').doc(args.orgId).update({ [field]: FieldValue.increment(1) }).catch(() => {});
    }
  }

  if (args.groupId) await assignToGroup(args.orgId, args.groupId, uid, args.role);

  const token = await createClaimToken(uid, args.orgId);
  return { uid, token, status, isNew };
}
