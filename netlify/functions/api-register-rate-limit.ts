import type { Handler, HandlerEvent } from '@netlify/functions';
import { adminDb } from './utils/firebase-admin';
import { jsonResponse } from './utils/auth';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  try {
    const clientIp = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown';
    if (clientIp === 'unknown') {
      return jsonResponse(200, { success: true }); // Fallback if IP cannot be determined
    }

    const docRef = adminDb.collection('system').doc('rateLimits').collection('registrations').doc(clientIp);
    
    return await adminDb.runTransaction(async (t) => {
      const doc = await t.get(docRef);
      const now = Date.now();
      
      if (doc.exists) {
        const lastAttempt = doc.data()?.timestamp || 0;
        if (now - lastAttempt < 60000) {
          return jsonResponse(429, { error: 'Слишком много попыток регистрации. Пожалуйста, подождите минуту.', waitTime: 60000 - (now - lastAttempt) });
        }
      }
      
      t.set(docRef, { timestamp: now }, { merge: true });
      return jsonResponse(200, { success: true });
    });

  } catch (error: any) {
    console.error('Rate Limit Check Error:', error);
    return jsonResponse(500, { error: 'Internal Server Error' });
  }
};

export { handler };
