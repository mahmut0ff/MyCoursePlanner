/**
 * One-time script to promote a user to super_admin.
 * 
 * Usage:
 *   node scripts/make-super-admin.mjs <user-email>
 * 
 * Prerequisites: GOOGLE_APPLICATION_CREDENTIALS or the Firebase service account JSON.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load .env
config();

// Initialize Firebase Admin
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Missing Firebase credentials in .env');
  console.error('   Need: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
  process.exit(1);
}

initializeApp({
  credential: cert({ projectId, clientEmail, privateKey }),
});

const db = getFirestore();
const auth = getAuth();

const email = process.argv[2];
if (!email) {
  console.error('❌ Usage: node scripts/make-super-admin.mjs <user-email>');
  console.error('   Example: node scripts/make-super-admin.mjs admin@example.com');
  process.exit(1);
}

async function main() {
  try {
    // Find the user by email
    const userRecord = await auth.getUserByEmail(email);
    console.log(`✅ Found user: ${userRecord.displayName || userRecord.email} (${userRecord.uid})`);

    // Check if user doc exists in Firestore
    const userDoc = await db.collection('users').doc(userRecord.uid).get();
    
    if (userDoc.exists) {
      // Update existing user doc
      await db.collection('users').doc(userRecord.uid).update({
        role: 'super_admin',
        updatedAt: new Date().toISOString(),
      });
      console.log(`✅ Updated existing user to super_admin`);
    } else {
      // Create user doc
      await db.collection('users').doc(userRecord.uid).set({
        email: userRecord.email,
        displayName: userRecord.displayName || email.split('@')[0],
        role: 'super_admin',
        organizationId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log(`✅ Created new user document with super_admin role`);
    }

    console.log(`\n🎉 Done! ${email} is now a Super Admin.`);
    console.log(`   Log in at your app and you'll see the admin panel.`);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ No Firebase Auth user found with email: ${email}`);
      console.error(`   Register an account first at your app, then run this script.`);
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

main();
