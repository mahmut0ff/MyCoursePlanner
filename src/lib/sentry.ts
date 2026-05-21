/**
 * Sentry Error Tracking — initialized before React mounts.
 *
 * To activate:
 *   1. npm install @sentry/react
 *   2. Set VITE_SENTRY_DSN in .env (get DSN from sentry.io → Project Settings → Client Keys)
 *   3. Import this module in main.tsx BEFORE ReactDOM.createRoot
 *
 * In production, source maps are uploaded via CI (see .github/workflows/ci.yml).
 */
import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE, // 'development' | 'staging' | 'production'
    release: `planula@${import.meta.env.VITE_APP_VERSION || '0.0.0'}`,

    // Capture 10% of transactions for performance monitoring
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Session replay — captures 1% of sessions, 100% of error sessions
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],

    // Filter noisy errors
    ignoreErrors: [
      // Chunk load failures — handled by ErrorBoundary + lazyRetry
      /Loading chunk/,
      /Loading module/,
      /dynamically imported module/,
      /Failed to fetch/,
      // Browser extensions
      /ResizeObserver loop/,
      /Non-Error promise rejection/,
    ],

    // Don't send PII
    beforeSend(event) {
      // Strip user IP
      if (event.user) {
        delete event.user.ip_address;
      }
      return event;
    },
  });
}

export { Sentry };
