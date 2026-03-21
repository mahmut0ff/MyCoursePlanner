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
  role: UserRole = 'student'
): Promise<void> => {
  await setDoc(doc(db, COLLECTION, uid), {
    uid,
    email,
    displayName,
    role,
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
