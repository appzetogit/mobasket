import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const getRuntimeEnv = () =>
  (typeof window !== 'undefined' && window.__PUBLIC_ENV) ? window.__PUBLIC_ENV : {};

const isRuntimeEnvReady = () =>
  typeof window === 'undefined' || window.__PUBLIC_ENV_READY === true;

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
let hasWarnedAboutMissingFirebaseConfig = false;

// Function to ensure Firebase is initialized
function ensureFirebaseInitialized() {
  if (!isRuntimeEnvReady()) {
    return false;
  }

  const firebaseConfig = getFirebaseConfigFromRuntimeEnv();
  const missingFields = requiredFields.filter(field => !firebaseConfig[field] || firebaseConfig[field] === 'undefined');
  if (missingFields.length > 0) {
    if (!hasWarnedAboutMissingFirebaseConfig) {
      console.warn(`Firebase configuration missing fields: ${missingFields.join(', ')}. Configure them in Admin > Env Setup.`);
      hasWarnedAboutMissingFirebaseConfig = true;
    }
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

    if (!realtimeDb) {
      realtimeDb = getDatabase(app);
    }
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    return false;
  }

  return true;
}

export function ensureFirebaseAuthInitialized() {
  const initialized = ensureFirebaseInitialized();
  if (!initialized || !app) {
    return false;
  }

  try {
    if (!firebaseAuth) {
      firebaseAuth = getAuth(app);
      if (!firebaseAuth) {
        throw new Error('Failed to get Firebase Auth instance');
      }
    }

    if (!googleProvider) {
      googleProvider = new GoogleAuthProvider();
      googleProvider.addScope('email');
      googleProvider.addScope('profile');
    }
  } catch (error) {
    console.error('Firebase auth initialization failed:', error);
    return false;
  }

  return true;
}

export { firebaseAuth, googleProvider, realtimeDb, ensureFirebaseInitialized };


