import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { getFirebaseCredentials } from '../utils/envService.js';

let cachedConfig = null;

function normalizePrivateKey(privateKey) {
  if (!privateKey || typeof privateKey !== 'string') return '';
  return privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey;
}

function loadServiceAccountFromFile() {
  const candidates = [
    path.resolve(process.cwd(), 'config', 'zomato-607fa-firebase-adminsdk-fbsvc-f5f782c2cc.json'),
    path.resolve(process.cwd(), 'firebaseconfig.json'),
    path.resolve(process.cwd(), 'serviceAccountKey.json')
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(raw);
      return {
        projectId: json.project_id || '',
        clientEmail: json.client_email || '',
        privateKey: json.private_key || '',
        databaseURL: json.databaseURL || ''
      };
    } catch {
      // Ignore malformed file and continue to next candidate.
    }
  }

  return null;
}

function deriveDatabaseUrl(projectId) {
  if (!projectId) return '';
  // Most common RTDB URL format.
  return `https://${projectId}-default-rtdb.firebaseio.com`;
}

async function loadFirebaseAdminConfig({ allowDbLookup = true } = {}) {
  if (cachedConfig) return cachedConfig;

  let dbCredentials = {};
  if (allowDbLookup) {
    try {
      dbCredentials = await getFirebaseCredentials();
    } catch {
      dbCredentials = {};
    }
  }

  const fileCredentials = loadServiceAccountFromFile();

  const projectId =
    dbCredentials.projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    fileCredentials?.projectId ||
    '';
  const clientEmail =
    dbCredentials.clientEmail ||
    process.env.FIREBASE_CLIENT_EMAIL ||
    fileCredentials?.clientEmail ||
    '';
  const privateKey = normalizePrivateKey(
    dbCredentials.privateKey ||
      process.env.FIREBASE_PRIVATE_KEY ||
      fileCredentials?.privateKey ||
      ''
  );
  const databaseURL =
    dbCredentials.databaseURL ||
    process.env.FIREBASE_DATABASE_URL ||
    fileCredentials?.databaseURL ||
    deriveDatabaseUrl(projectId);

  cachedConfig = {
    projectId,
    clientEmail,
    privateKey,
    databaseURL
  };

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
