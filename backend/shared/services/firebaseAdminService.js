import admin from 'firebase-admin';
import { getFirebaseCredentials } from '../utils/envService.js';

let cachedConfig = null;
let cachedConfigUsesDb = false;

function normalizePrivateKey(privateKey) {
  if (!privateKey || typeof privateKey !== 'string') return '';
  return privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey;
}

async function loadFirebaseAdminConfig({ allowDbLookup = true } = {}) {
  if (cachedConfig && (cachedConfigUsesDb || !allowDbLookup)) {
    return cachedConfig;
  }

  let dbCredentials = {};
  if (allowDbLookup) {
    try {
      dbCredentials = await getFirebaseCredentials();
    } catch {
      dbCredentials = {};
    }
  }

  const envProjectId = process.env.FIREBASE_PROJECT_ID || '';
  const envClientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
  const envPrivateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  const envDatabaseURL = process.env.FIREBASE_DATABASE_URL || '';

  const projectId = dbCredentials.projectId || envProjectId;
  const clientEmail = dbCredentials.clientEmail || envClientEmail;
  const privateKey = normalizePrivateKey(
    dbCredentials.privateKey || envPrivateKey
  );
  const databaseURL = dbCredentials.databaseURL || envDatabaseURL;

  cachedConfig = {
    projectId,
    clientEmail,
    privateKey,
    databaseURL
  };
  cachedConfigUsesDb = allowDbLookup;

  return cachedConfig;
}

export async function initializeFirebaseAdmin({ allowDbLookup = true } = {}) {
  const config = await loadFirebaseAdminConfig({ allowDbLookup });
  const { projectId, clientEmail, privateKey, databaseURL } = config;

  if (!projectId || !clientEmail || !privateKey) {
    return { initialized: false, reason: 'missing_credentials', app: null, config };
  }

  if (admin.apps.length > 0) {
    return { initialized: true, app: admin.app(), config };
  }

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      }),
      ...(databaseURL ? { databaseURL } : {})
    });

    return { initialized: true, app, config };
  } catch (error) {
    if (error?.code === 'app/duplicate-app') {
      return { initialized: true, app: admin.app(), config };
    }
    return { initialized: false, reason: error.message, app: null, config };
  }
}

export async function resetFirebaseAdmin({ deleteApps = true } = {}) {
  cachedConfig = null;
  cachedConfigUsesDb = false;

  if (!deleteApps || admin.apps.length === 0) {
    return;
  }

  // Delete initialized apps so new credentials from ENV Setup can take effect immediately.
  await Promise.all(
    admin.apps.map(async (appInstance) => {
      try {
        await appInstance.delete();
      } catch {
        // Ignore cleanup failures to avoid breaking env save flow.
      }
    })
  );
}

export function getFirebaseAdminApp() {
  if (admin.apps.length === 0) return null;
  return admin.app();
}

export { admin };
