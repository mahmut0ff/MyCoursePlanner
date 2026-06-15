/**
 * Shared SabakHub types — used by web (apps root) and React Native apps
 * (apps/senior, apps/junior).
 *
 * Source of truth currently lives in src/types/index.ts (web). As we extract
 * types here, the web file becomes a re-export. Until then this is a stub
 * with the few shapes RN apps will need first.
 */

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'teacher' | 'student' | 'parent';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  name?: string;
  role: UserRole;
  organizationId?: string;
  activeOrgId?: string;
  avatarUrl?: string;
  photoURL?: string;
  phone?: string;
  status?: 'active' | 'disabled' | 'pending';
  createdAt?: string;
  updatedAt?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  ownerEmail?: string;
  planId: string;
  status: 'active' | 'suspended' | 'trial' | 'deleted';
  studentsCount?: number;
  teachersCount?: number;
  examsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  uid: string;
  organizationId: string;
  organizationName?: string;
  role: UserRole;
  status: 'active' | 'pending' | 'rejected';
  joinedAt: string;
}
