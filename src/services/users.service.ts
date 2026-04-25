import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserProfile, UserRole } from '../types';

const COLLECTION = 'users';

export const getUser = async (uid: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, COLLECTION, uid));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as unknown as UserProfile) : null;
};

export const createUser = async (
  uid: string,
  email: string,
  displayName: string,
  role: UserRole = 'student',
  username: string = ''
): Promise<void> => {
  const userRef = doc(db, COLLECTION, uid);
  const existing = await getDoc(userRef);

  // If the user document already exists, skip creation to avoid
  // triggering Firestore UPDATE rules (which block role/orgId changes).
  if (existing.exists()) {
    console.warn('[createUser] Document already exists for', uid, '— skipping setDoc');
    return;
  }

  await setDoc(userRef, {
    uid,
    username: username.trim().toLowerCase(),
    email,
    displayName,
    role,
    avatarUrl: '',
    bio: '',
    skills: [],
    city: '',
    country: '',
    activeOrgId: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
};

export const updateUser = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
  await updateDoc(doc(db, COLLECTION, uid), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
};
