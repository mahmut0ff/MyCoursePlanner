import React, { lazy, type ComponentType } from 'react';

const STORAGE_KEY = 'chunk_reload_ts';
const RELOAD_COOLDOWN_MS = 10_000; // prevent infinite reload loops

/**
 * Enhanced lazy() wrapper that handles post-deploy chunk failures.
 *
 * After a deploy, hashed chunk URLs (e.g. HomeworkReviewPage-Ck64ue8g.js)
 * no longer exist on the server. The hosting returns index.html (text/html)
 * instead of JS, which causes a TypeError.
 *
 * Retrying the same URL is pointless — the chunk hash is baked into the
 * import() call. The only real fix is a full page reload so the browser
 * fetches the new index.html with updated chunk references.
 *
 * This wrapper:
 * 1. Catches chunk/module load errors
 * 2. Forces a single page reload (with cooldown to prevent loops)
 * 3. If reload already happened recently, throws to ErrorBoundary
 */
export function lazyRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() => importWithReload(importFn));
}

async function importWithReload<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
): Promise<{ default: T }> {
  try {
    return await importFn();
  } catch (error: any) {
    if (!isChunkError(error)) throw error;

    // Check if we already reloaded recently (prevent infinite loops)
    const lastReload = Number(sessionStorage.getItem(STORAGE_KEY) || '0');
    const now = Date.now();

    if (now - lastReload < RELOAD_COOLDOWN_MS) {
      // Already reloaded recently — let ErrorBoundary handle it
      console.error(
        '[lazyRetry] Chunk load failed after recent reload. Deferring to ErrorBoundary.',
        error.message,
      );
      throw error;
    }

    // Mark that we're about to reload
    sessionStorage.setItem(STORAGE_KEY, String(now));
    console.warn('[lazyRetry] Chunk missing after deploy, reloading page...', error.message);

    // Force reload — bypasses cache so new index.html (with new chunk refs) is fetched
    window.location.reload();

    // Return a never-resolving promise to prevent React from rendering
    // while the page is reloading
    return new Promise(() => {});
  }
}

function isChunkError(error: any): boolean {
  const msg = (error?.message || '').toLowerCase();
  const name = (error?.name || '').toLowerCase();
  return (
    msg.includes('loading chunk') ||
    msg.includes('loading module') ||
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch') ||
    msg.includes('importing a module script failed') ||
    msg.includes('loading css chunk') ||
    msg.includes('mime type') ||
    msg.includes('networkerror') ||
    name === 'chunkerror' ||
    name === 'chunkloaderror'
  );
}
