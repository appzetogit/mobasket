import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const getRuntimeEnv = () =>
  (typeof window !== 'undefined' && window.__PUBLIC_ENV) ? window.__PUBLIC_ENV : {};

const getFirebaseConfigFromRuntimeEnv = () => {
  const runtimeEnv = getRuntimeEnv();
  return {
    apiKey: runtimeEnv.VITE_FIREBASE_API_KEY || '',
    authDomain: runtimeEnv.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: runtimeEnv.VITE_FIREBASE_PROJECT_ID || '',
    appId: runtimeEnv.VITE_FIREBASE_APP_ID || '',
    messagingSenderId: runtimeEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    storageBucket: runtimeEnv.VITE_FIREBASE_STORAGE_BUCKET || '',
    measurementId: runtimeEnv.VITE_FIREBASE_MEASUREMENT_ID || '',
    databaseURL: runtimeEnv.VITE_FIREBASE_DATABASE_URL || ''
  };
};

export const getFirebaseVapidKey = () => {
  const runtimeEnv = getRuntimeEnv();
  return runtimeEnv.VITE_FIREBASE_VAPID_KEY || '';
};

const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId'];

// Initialize Firebase app only once
let app;
let firebaseAuth;
let googleProvider;
let realtimeDb;
export let firebaseApp = null;

// Function to ensure Firebase is initialized
function ensureFirebaseInitialized() {
  const firebaseConfig = getFirebaseConfigFromRuntimeEnv();
  const missingFields = requiredFields.filter(field => !firebaseConfig[field] || firebaseConfig[field] === 'undefined');
  if (missingFields.length > 0) {
    console.warn(`Firebase configuration missing fields: ${missingFields.join(', ')}. Configure them in Admin > Env Setup.`);
    return false;
  }

  try {
    const existingApps = getApps();
    if (existingApps.length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = existingApps[0];
    }
    firebaseApp = app;

    // Initialize Auth - ensure it's connected to the app
    if (!firebaseAuth) {
      firebaseAuth = getAuth(app);
      if (!firebaseAuth) {
        throw new Error('Failed to get Firebase Auth instance');
      }
    }

    // Initialize Google Provider
    if (!googleProvider) {
      googleProvider = new GoogleAuthProvider();
      // Add scopes if needed
      googleProvider.addScope('email');
      googleProvider.addScope('profile');
      // Note: Don't set custom client_id - Firebase uses its own OAuth client
    }

    if (!realtimeDb) {
      realtimeDb = getDatabase(app);
    }
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    return false;
  }

  return true;
}

// Initialize immediately when config is available
ensureFirebaseInitialized();

export { firebaseAuth, googleProvider, realtimeDb, ensureFirebaseInitialized };


