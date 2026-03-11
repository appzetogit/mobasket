import admin from 'firebase-admin';
import { createPrivateKey } from 'crypto';
import { getFirebaseCredentials } from '../utils/envService.js';

let cachedConfig = null;
let cachedConfigUsesDb = false;

function hasUsableConfig(config) {
  if (!config || typeof config !== 'object') return false;
  return Boolean(
    String(config.projectId || '').trim() &&
    String(config.clientEmail || '').trim() &&
    String(config.privateKey || '').trim()
  );
}

function normalizePrivateKey(privateKey) {
  if (!privateKey || typeof privateKey !== 'string') return '';
  let normalized = privateKey.trim();

  // Remove surrounding quotes if key was pasted as a JSON string value.
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }

  // Convert escaped newlines from env-style strings.
  if (normalized.includes('\\\\n')) {
    normalized = normalized.replace(/\\\\n/g, '\n');
  }
  if (normalized.includes('\\n')) {
    normalized = normalized.replace(/\\n/g, '\n');
  }
  if (normalized.includes('\\r\\n')) {
    normalized = normalized.replace(/\\r\\n/g, '\n');
  }

  // Normalize CRLF to LF.
  normalized = normalized.replace(/\r\n/g, '\n');

  // Fix accidental single-line PEM with BEGIN/END markers but no line breaks.
  if (
    normalized.includes('-----BEGIN PRIVATE KEY-----') &&
    normalized.includes('-----END PRIVATE KEY-----') &&
    !normalized.includes('\n')
  ) {
    normalized = normalized
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
  }

  // Some inputs are pasted as full service-account JSON payloads.
  if (!normalized.includes('-----BEGIN PRIVATE KEY-----')) {
    try {
      const parsed = JSON.parse(normalized);
      const extracted = typeof parsed?.private_key === 'string' ? parsed.private_key.trim() : '';
      if (extracted) {
        normalized = extracted
          .replace(/\\\\n/g, '\n')
          .replace(/\\n/g, '\n')
          .replace(/\\r\\n/g, '\n')
          .replace(/\r\n/g, '\n')
          .trim();
      }
    } catch {
      // Keep original value if not a JSON blob.
    }
  }

  return normalized;
}

function isValidPrivateKey(privateKey) {
  if (!privateKey) return false;
  try {
    createPrivateKey({ key: privateKey, format: 'pem' });
    return true;
  } catch {
    return false;
  }
}

async function loadFirebaseAdminConfig({ allowDbLookup = true } = {}) {
  if (
    cachedConfig &&
    (
      (!allowDbLookup) ||
      (cachedConfigUsesDb && hasUsableConfig(cachedConfig))
    )
  ) {
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
  cachedConfigUsesDb = Boolean(
    String(dbCredentials.projectId || '').trim() ||
    String(dbCredentials.clientEmail || '').trim() ||
    String(dbCredentials.privateKey || '').trim() ||
    String(dbCredentials.databaseURL || '').trim()
  );

  return cachedConfig;
}

export async function initializeFirebaseAdmin({ allowDbLookup = true } = {}) {
  const config = await loadFirebaseAdminConfig({ allowDbLookup });
  const { projectId, clientEmail, privateKey, databaseURL } = config;

  if (!projectId || !clientEmail || !privateKey) {
    return { initialized: false, reason: 'missing_credentials', app: null, config };
  }

  if (!isValidPrivateKey(privateKey)) {
    return { initialized: false, reason: 'invalid_private_key_format', app: null, config };
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
