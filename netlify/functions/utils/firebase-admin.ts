/**
 * Firebase Admin SDK — shared initializer for all Netlify Functions.
 * Uses service account credentials from environment variables.
 */
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let app: App;

if (getApps().length === 0) {
  app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
} else {
  app = getApps()[0];
}

export const adminDb: Firestore = getFirestore(app);
export const adminAuth: Auth = getAuth(app);

/**
 * Batch-fetch documents by ID from a collection in a single round-trip using
 * getAll(), instead of sequential `where('__name__','in',batch)` queries (which
 * fire one request per 10–30 ids, serially, and dominate latency as data grows).
 * Returns an id -> data object for the documents that exist. Pass `fields` to
 * read only specific fields (equivalent to .select()).
 */
export async function getDocsByIds(
  collectionPath: string,
  ids: Array<string | null | undefined>,
  fields?: string[],
): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  const unique = Array.from(new Set(ids.filter(Boolean) as string[]));
  if (unique.length === 0) return out;
  const refs = unique.map((id) => adminDb.collection(collectionPath).doc(id));
  const CHUNK = 300; // getAll accepts many refs at once; chunk (run in parallel) for very large sets
  const chunks: (typeof refs)[] = [];
  for (let i = 0; i < refs.length; i += CHUNK) chunks.push(refs.slice(i, i + CHUNK));
  const groups = await Promise.all(chunks.map((c) => {
    const args: any[] = fields && fields.length ? [...c, { fieldMask: fields }] : [...c];
    return adminDb.getAll(...args);
  }));
  for (const snaps of groups) {
    for (const d of snaps) if (d.exists) out[d.id] = d.data();
  }
  return out;
}

export default app;
