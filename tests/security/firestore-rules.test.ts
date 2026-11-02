import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { setLogLevel } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules: Tenant Isolation', () => {
  beforeAll(async () => {
    setLogLevel('error');
    testEnv = await initializeTestEnvironment({
      projectId: 'mycourseplan-test-sec',
      firestore: {
        rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('R-SEC-01: User in Org A MUST NOT read documents from Org B', async () => {
    // We create a mock context for a student from org-A
    const aliceDb = testEnv.authenticatedContext('alice_uid', {
      role: 'student',
      token: { organizationId: 'org-A' } // Custom claims might contain org, but our rule checks user doc
    }).firestore();
    
    // First, let's assume the rule looks up alice_uid in users/alice_uid/memberships/...'
    // Since we can't easily seed the emulator db here without system context, 
    // we just test the rule evaluation. The rule `hasOrgAccess(orgId)` fails if membership doesn't exist.
    
    // Attempt to read exam belonging to org-B
    const alienExamRef = aliceDb.collection('exams').doc('exam-orgB');
    // We expect this to fail because alice does not have org-B access 
    await assertFails(alienExamRef.get());
  });

  it('R-SEC-02: User MUST NOT directly create an examAttempt (forced to backend API)', async () => {
    const aliceDb = testEnv.authenticatedContext('alice_uid', { role: 'student' }).firestore();
    
    const spoofedAttempt = aliceDb.collection('examAttempts').doc('attempt1');
    await assertFails(spoofedAttempt.set({
      studentId: 'alice_uid',
      score: 100,
      organizationId: 'org-A'
    }));
  });

  it('R-SEC-03: User MUST NOT read nested questions of an alien exam', async () => {
    const aliceDb = testEnv.authenticatedContext('alice_uid', { role: 'student' }).firestore();
    
    const alienQuestionRef = aliceDb
      .collection('exams').doc('exam-orgB')
      .collection('questions').doc('q1');
    
    await assertFails(alienQuestionRef.get());
  });

  it('R-SEC-04: Chat room messages CANNOT be edited by alien participant', async () => {
    const aliceDb = testEnv.authenticatedContext('alice_uid', { role: 'student' }).firestore();
    
    // Attempting to write a message to a room where alice is not in `participantIds`
    const alienMessage = aliceDb
      .collection('chatRooms').doc('roomB')
      .collection('messages').doc('msg1');
      
    await assertFails(alienMessage.set({
      senderId: 'alice_uid',
      text: 'hello'
    }));
  });

  it('R-SEC-05: User MUST NOT overwrite another user profile', async () => {
    const aliceDb = testEnv.authenticatedContext('alice_uid', { role: 'student' }).firestore();
    
    const bobProfile = aliceDb.collection('users').doc('bob_uid');
    await assertFails(bobProfile.update({
      role: 'admin'
    }));
  });

  // Членство несёт имя, email, роль, филиалы и permissionOverrides — чужая
  // организация не должна выгружать его напрямую из SDK.
  describe('membership docs', () => {
    beforeAll(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await db.doc('users/alice_uid').set({ role: 'student', organizationId: 'org-A' });
        await db.doc('users/alice_uid/memberships/org-A').set({ role: 'student', status: 'active' });
        await db.doc('users/bob_uid').set({ role: 'admin', organizationId: 'org-B' });
        await db.doc('users/bob_uid/memberships/org-B').set({ role: 'admin', userEmail: 'bob@b.org' });
        await db.doc('orgMembers/org-A/members/alice_uid').set({ userName: 'Alice', role: 'student' });
        await db.doc('orgMembers/org-B/members/bob_uid').set({ userName: 'Bob', role: 'admin' });
      });
    });

    it('R-SEC-06: user reads own membership, not someone else\'s', async () => {
      const aliceDb = testEnv.authenticatedContext('alice_uid').firestore();
      await assertSucceeds(aliceDb.doc('users/alice_uid/memberships/org-A').get());
      await assertFails(aliceDb.doc('users/bob_uid/memberships/org-B').get());
      await assertFails(aliceDb.collection('users/bob_uid/memberships').get());
    });

    it('R-SEC-07: orgMembers readable by members of that org only', async () => {
      const aliceDb = testEnv.authenticatedContext('alice_uid').firestore();
      await assertSucceeds(aliceDb.doc('orgMembers/org-A/members/alice_uid').get());
      await assertFails(aliceDb.doc('orgMembers/org-B/members/bob_uid').get());
      await assertFails(aliceDb.collection('orgMembers/org-B/members').get());
    });

    it('R-SEC-08: super admin reads any org roster', async () => {
      const adminDb = testEnv.authenticatedContext('root_uid', { role: 'super_admin' }).firestore();
      await assertSucceeds(adminDb.collection('orgMembers/org-B/members').get());
      await assertSucceeds(adminDb.doc('users/bob_uid/memberships/org-B').get());
    });
  });
});
