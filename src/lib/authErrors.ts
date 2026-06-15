/**
 * Maps a Firebase Auth error code to an i18n message key (under `auth.*`),
 * so the Google sign-in handlers can show a specific, localized reason
 * instead of a generic English string.
 */
export function googleAuthErrorKey(code?: string): string {
  switch (code) {
    case 'auth/account-exists-with-different-credential':
      return 'auth.googleAccountExists';
    case 'auth/unauthorized-domain':
      return 'auth.googleUnauthorizedDomain';
    case 'auth/operation-not-allowed':
      return 'auth.googleNotEnabled';
    case 'auth/network-request-failed':
      return 'auth.networkError';
    case 'auth/popup-blocked':
      return 'auth.googlePopupBlocked';
    default:
      return 'auth.googleFailed';
  }
}

/** Codes the user triggered intentionally (cancelled the flow) — no error UI. */
export function isUserCancelledAuth(code?: string): boolean {
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}
