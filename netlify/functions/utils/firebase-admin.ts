/**
 * Firebase Admin SDK — shared initializer for all Netlify Functions.
 * Uses service account credentials from environment variables.
 */
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'crypto';

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
 * Бакет Storage для серверных загрузок (файлы ДЗ из Telegram).
 * initializeApp здесь намеренно без storageBucket — приложение годами работало
 * без серверных загрузок, и добавлять его в credential-инициализацию значит
 * менять поведение всех функций. Имя выводим из проекта, как это делает сама
 * Firebase, но даём переопределить переменной окружения.
 */
export const STORAGE_BUCKET: string =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.VITE_FIREBASE_STORAGE_BUCKET ||
  (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app` : '');

export interface UploadedFile {
  url: string;
  storagePath: string;
  size: number;
  contentType: string;
}

/**
 * Положить буфер в Storage и вернуть ссылку вида getDownloadURL.
 *
 * Ссылка с download-токеном, а не signed URL: подписанная ссылка живёт неделю и
 * протухает прямо в карточке сдачи, а токен постоянен — ровно то же, что отдаёт
 * клиентский SDK при загрузке из браузера. Правила Storage admin SDK обходит,
 * поэтому путь `homeworks/{lessonId}/…` остаётся тем же, что у веб-загрузок.
 */
export async function uploadServerFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<UploadedFile> {
  if (!STORAGE_BUCKET) throw new Error('Storage bucket is not configured (FIREBASE_STORAGE_BUCKET)');
  const token = randomUUID();
  const file = getStorage(app).bucket(STORAGE_BUCKET).file(storagePath);
  await file.save(buffer, {
    resumable: false,
    contentType,
    metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
  });
  return {
    url: `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`,
    storagePath,
    size: buffer.length,
    contentType,
  };
}

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
