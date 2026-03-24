/**
 * API: Auth Check
 * 
 * Secure endpoints for the custom username-based authentication system.
 * 
 * POST /api-auth-check
 * action = 'check' : Check if an email or username exists (used during registration / profile edit)
 * action = 'resolve' : Resolves a username to an email address to allow Firebase Auth login
 */
import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { jsonResponse, badRequest } from './utils/auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const { action, username, email } = body;

    if (action === 'check') {
      // Find if email or username already exists
      const checks = [];
      
      if (username) {
        checks.push(
          adminDb.collection('users').where('username', '==', username.toLowerCase()).limit(1).get()
            .then(snap => ({ type: 'username', taken: !snap.empty }))
        );
      }
      
      if (email) {
        checks.push(
          adminDb.collection('users').where('email', '==', email.toLowerCase()).limit(1).get()
            .then(snap => ({ type: 'email', taken: !snap.empty }))
        );
      }

      const results = await Promise.all(checks);
      const response: Record<string, boolean> = {};
      results.forEach(r => { response[r.type] = r.taken; });

      return jsonResponse(200, response);
    }

    if (action === 'resolve') {
      if (!username) return badRequest('Username is required');

      const snap = await adminDb.collection('users').where('username', '==', username.toLowerCase()).limit(1).get();
      if (snap.empty) {
        return jsonResponse(404, { error: 'User not found' });
      }

      const userDoc = snap.docs[0].data();
      return jsonResponse(200, { email: userDoc.email });
    }

    return badRequest('Invalid action');

  } catch (error: any) {
    console.error('API-AUTH-CHECK Error:', error);
    return jsonResponse(500, { error: error.message || 'Internal Server Error' });
  }
};

export { handler };
