/**
 * Identity chokepoint — phone is the single global key for a person.
 *
 * Every intake channel (web sign-up, Telegram bot, manager import) MUST resolve
 * a user through `resolveOrCreateUserByPhone` so the same phone always maps to
 * the same account — across centers, across channels. This is what makes
 * "один телефон = один аккаунт" true and kills duplicate accounts at the root.
 *
 * Firebase Auth is the source of truth: the phone is stored as the Auth record's
 * `phoneNumber`, which Firebase keeps globally unique. We fall back to a Firestore
 * lookup only for legacy accounts created before phones were normalized.
 *
 * Step 1 of the phone-identity rollout: this helper is self-contained and not yet
 * wired into the channels (that's step 2), so adding it changes no behavior.
 */
import { adminDb, adminAuth } from './firebase-admin';
import type { JoinRole } from './onboarding';

const now = () => new Date().toISOString();

/** Default calling code when a number has no country prefix (Kyrgyzstan). */
export const DEFAULT_CALLING_CODE = '996';

/**
 * Best-effort normalization to E.164 (e.g. "0555 44 55 66" → "+996555445566").
 * Returns null if the input can't be a real phone number.
 *
 * Rules (no external lib): keep an explicit "+"/"00" international prefix as-is;
 * treat a leading default calling code as already-international; otherwise strip a
 * local trunk "0" and prepend the default calling code.
 */
export function normalizePhone(raw: string, defaultCc: string = DEFAULT_CALLING_CODE): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const hadPlus = s.startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;

  if (hadPlus) {
    // already international, the user typed the country code
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2); // 00 = international dialing prefix
  } else if (digits.startsWith(defaultCc) && digits.length >= defaultCc.length + 6) {
    // already starts with our country code (local numbers here never do)
  } else {
    if (digits.startsWith('0')) digits = digits.slice(1); // drop local trunk prefix
    digits = defaultCc + digits;
  }

  // E.164 allows up to 15 digits; anything too short isn't a real number.
  if (digits.length < 8 || digits.length > 15) return null;
  return '+' + digits;
}

export interface PhoneIdentity {
  uid: string;
  /** true when a brand-new account was just created. */
  isNew: boolean;
  /** the normalized E.164 number the account is keyed by. */
  phone: string;
}

/**
 * Resolve a person to a single account by phone, creating one if needed.
 *
 * - Existing account (by phone) → returns its uid, never duplicates.
 * - No account → creates a passwordless user with `phoneNumber` set.
 * - Never overwrites an existing profile; only backfills the normalized phone.
 *
 * Returns null only when the phone can't be normalized.
 */
export async function resolveOrCreateUserByPhone(args: {
  phone: string;
  displayName?: string;
  role?: JoinRole;
  defaultCc?: string;
}): Promise<PhoneIdentity | null> {
  const phone = normalizePhone(args.phone, args.defaultCc);
  if (!phone) return null;

  // 1. Authoritative lookup: Firebase Auth keyed by phoneNumber.
  try {
    const rec = await adminAuth.getUserByPhoneNumber(phone);
    await adminDb.collection('users').doc(rec.uid).set({ phone, updatedAt: now() }, { merge: true });
    return { uid: rec.uid, isNew: false, phone };
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') throw err; // don't risk double-create on unknown errors
  }

  // 2. Legacy fallback: a Firestore user has this phone but no phoneNumber on
  //    their Auth record yet → adopt it (and backfill Auth) instead of duplicating.
  const legacy = await adminDb.collection('users').where('phone', '==', phone).limit(1).get();
  if (!legacy.empty) {
    const uid = legacy.docs[0].id;
    await adminAuth.updateUser(uid, { phoneNumber: phone }).catch(() => {}); // may fail if number used elsewhere; non-fatal
    return { uid, isNew: false, phone };
  }

  // 3. Nothing found → create a passwordless account keyed by phone.
  const displayName = (args.displayName || '').trim() || 'Пользователь';
  try {
    const record = await adminAuth.createUser({ phoneNumber: phone, displayName });
    const uid = record.uid;
    await adminDb.collection('users').doc(uid).set({
      uid,
      username: '',
      email: '',
      displayName,
      role: args.role || 'student',
      phone,
      avatarUrl: '', bio: '', skills: [], city: '', country: '',
      createdAt: now(),
      updatedAt: now(),
    }, { merge: true });
    return { uid, isNew: true, phone };
  } catch (err: any) {
    // Race: another request created this phone between our lookup and create.
    if (err?.code === 'auth/phone-number-already-exists') {
      const rec = await adminAuth.getUserByPhoneNumber(phone);
      return { uid: rec.uid, isNew: false, phone };
    }
    throw err;
  }
}
