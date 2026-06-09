import { createApiClient } from '@planula/api';
import auth from '@react-native-firebase/auth';
import Constants from 'expo-constants';

/**
 * Senior app's pre-bound API client. Token resolver uses
 * @react-native-firebase/auth — same Firebase project as the web app and
 * Junior, so role-based Netlify Function gating works identically.
 *
 * Base URL is picked from app.json -> extra.apiBaseUrl, with a sensible
 * default to the production Netlify deploy.
 */
const baseUrl: string =
  (Constants.expoConfig?.extra as any)?.apiBaseUrl ||
  'https://planula.netlify.app/.netlify/functions';

export const api = createApiClient({
  baseUrl,
  getIdToken: async () => {
    const user = auth().currentUser;
    if (!user) return null;
    return user.getIdToken();
  },
});
