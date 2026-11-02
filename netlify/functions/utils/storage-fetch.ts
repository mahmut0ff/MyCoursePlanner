/**
 * Скачивание файла по ссылке, пришедшей от клиента (fileUrl генерации, вложения ДЗ).
 *
 * SSRF: сервер ходит только в Firebase Storage СВОЕГО проекта — ссылки вида
 * getDownloadURL (`/v0/b/<наш бакет>/o/…`). Любой другой хост или чужой бакет —
 * отказ: иначе функцией можно достучаться до метаданных облака, localhost или
 * заставить её качать чужой многогигабайтный объект.
 */
import { STORAGE_BUCKET } from './firebase-admin';

/** Gemini принимает inline-данные до ~20 МБ на запрос — больше качать незачем. */
export const MAX_STORAGE_FILE_BYTES = 15 * 1024 * 1024;

export function isAllowedFileUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || !STORAGE_BUCKET) return false;
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  return url.hostname.toLowerCase() === 'firebasestorage.googleapis.com'
    && url.pathname.startsWith(`/v0/b/${STORAGE_BUCKET}/o/`);
}

/**
 * Скачивает файл целиком, не больше maxBytes. Редиректы — вручную: разрешённый
 * хост не должен перекинуть запрос на внутренний адрес.
 */
export async function fetchStorageFile(raw: string, maxBytes = MAX_STORAGE_FILE_BYTES): Promise<{ buffer: Buffer; contentType: string | null }> {
  let target = raw;
  for (let hop = 0; hop < 4; hop++) {
    if (!isAllowedFileUrl(target)) throw new Error('ссылка ведёт не в Firebase Storage');
    const response = await fetch(target, { redirect: 'manual' });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
    if (location) {
      await response.body?.cancel();
      target = new URL(location, target).toString();
      continue;
    }
    if (!response.ok) throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    if (Number(response.headers.get('content-length') || 0) > maxBytes) {
      await response.body?.cancel();
      throw new Error('файл слишком большой');
    }
    // shortcut: без content-length тело читается целиком до проверки; наш бакет его всегда шлёт — стримить, если появятся другие источники.
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('файл слишком большой');
    return { buffer, contentType: response.headers.get('content-type') };
  }
  throw new Error('слишком много перенаправлений');
}
