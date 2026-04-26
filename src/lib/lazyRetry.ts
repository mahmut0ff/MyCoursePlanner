import React, { lazy, type ComponentType } from 'react';

/**
 * Enhanced lazy() wrapper that retries failed dynamic imports.
 *
 * After a deploy, existing users may have stale chunk hashes in their browser.
 * The first import() will 404, triggering a ChunkLoadError.
 * This wrapper catches that and retries up to `maxRetries` times with a short
 * delay, giving the browser a chance to fetch the updated manifest.
 *
 * Usage:
 *   const MyPage = lazyRetry(() => import('./pages/MyPage'));
 *   // Use exactly like React.lazy
 */
export function lazyRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  maxRetries = 2,
  retryDelay = 1500,
): React.LazyExoticComponent<T> {
  return lazy(() => retryImport(importFn, maxRetries, retryDelay));
}

async function retryImport<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retriesLeft: number,
  delay: number,
): Promise<{ default: T }> {
  try {
    return await importFn();
  } catch (error: any) {
    if (retriesLeft <= 0) throw error;

    // Only retry for network/chunk errors, not for syntax/runtime errors
    const msg = (error?.message || '').toLowerCase();
    const isRetryable =
      msg.includes('loading chunk') ||
      msg.includes('loading module') ||
      msg.includes('dynamically imported module') ||
      msg.includes('failed to fetch') ||
      msg.includes('importing a module script failed') ||
      msg.includes('loading css chunk') ||
      msg.includes('networkerror') ||
      error?.name === 'ChunkLoadError';

    if (!isRetryable) throw error;

    console.warn(
      `[lazyRetry] Chunk load failed, retrying (${retriesLeft} left)...`,
      error.message,
    );

    await new Promise((r) => setTimeout(r, delay));
    return retryImport(importFn, retriesLeft - 1, delay);
  }
}
