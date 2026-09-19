// Live game sharing runs on Firebase Realtime Database.
// These web config values are public identifiers, not secrets — access is
// controlled by the database rules in firebase.rules.json. Safe to commit.
// Setup steps live in README.md under "Live sharing".
// Paste your web app config over the right-hand values, or provide them as
// VITE_FIREBASE_* environment variables (handy for local development).
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  databaseURL: env.VITE_FIREBASE_DATABASE_URL ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
};
export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId && firebaseConfig.appId);
