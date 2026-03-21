import EnvironmentVariable from '../../modules/admin/models/EnvironmentVariable.js';
import { decrypt, isEncrypted } from './encryption.js';
import winston from 'winston';
import mongoose from 'mongoose';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Cache for environment variables (cache for 5 minutes)
let envCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let lastDbNotReadyLogAt = 0;

/**
 * Get environment variable value from database
 * No process.env fallback for managed keys
 * Automatically decrypts encrypted values
 * @param {string} key - Environment variable key
 * @param {string} defaultValue - Default value if not found
 * @returns {Promise<string>} Environment variable value (decrypted)
 */
export async function getEnvVar(key, defaultValue = '', options = {}) {
  try {
    const { forceRefresh = false } = options || {};
    const envVars = await getAllEnvVars({ forceRefresh });
    let value = envVars[key] || defaultValue;
    
    // Decrypt if encrypted (for direct access, toEnvObject already decrypts, but this is a safety check)
    if (value && isEncrypted(value)) {
      try {
        value = decrypt(value);
      } catch (error) {
        logger.warn(`Error decrypting ${key}: ${error.message}`);
        return defaultValue;
      }
    }
    
    return value;
  } catch (error) {
    logger.warn(`Error fetching env var ${key} from database: ${error.message}`);
    return defaultValue;
  }
}

/**
 * Get all environment variables from database
 * Uses caching to reduce database queries
 * @returns {Promise<Object>} Object containing all environment variables
 */
export async function getAllEnvVars(options = {}) {
  try {
    const { forceRefresh = false } = options || {};
    // Check cache
    const now = Date.now();
    if (!forceRefresh && envCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
      return envCache;
    }

    // During startup, many services request env vars before Mongo is connected.
    // Avoid noisy errors and return cache/default-backed values until DB is ready.
    if (mongoose.connection.readyState !== 1) {
      if (now - lastDbNotReadyLogAt > 30000) {
        logger.warn('Environment variables DB fetch skipped: MongoDB not connected yet');
        lastDbNotReadyLogAt = now;
      }
      return envCache || {};
    }

    // Fetch from database
    const envVars = await EnvironmentVariable.getOrCreate();
    const envData = envVars.toEnvObject();
    
    // Update cache
    envCache = envData;
    cacheTimestamp = now;
    
    return envData;
  } catch (error) {
    logger.error(`Error fetching environment variables from database: ${error.message}`);
    // Return empty object on error. getEnvVar will return default value.
    return {};
  }
}

/**
 * Clear environment variables cache
 * Call this after updating environment variables
 */
export function clearEnvCache() {
  envCache = null;
  cacheTimestamp = null;
  logger.info('Environment variables cache cleared');
}

/**
 * Get Razorpay credentials
 * @returns {Promise<Object>} { keyId, keySecret }
 */
export async function getRazorpayCredentials() {
  const normalizeCredential = (value) => {
    let cleaned = String(value || '').trim();
    // Allow pasting in .env style, e.g. RAZORPAY_API_KEY=rzp_test_xxx
    const eqIndex = cleaned.indexOf('=');
    if (eqIndex > 0) {
      const maybeKey = cleaned.slice(0, eqIndex).trim().toUpperCase();
      if (maybeKey.includes('RAZORPAY')) {
        cleaned = cleaned.slice(eqIndex + 1).trim();
      }
    }
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    return cleaned;
  };

  const looksLikeApiKey = (value) => /^rzp_/i.test(String(value || '').trim());
  const normalizePair = (rawKeyId, rawKeySecret) => {
    const first = normalizeCredential(rawKeyId);
    const second = normalizeCredential(rawKeySecret);
    const keyId = looksLikeApiKey(first) || !looksLikeApiKey(second) ? first : second;
    const keySecret = keyId === first ? second : first;
    return {
      keyId: keyId || '',
      keySecret: keySecret || ''
    };
  };

  const findRazorpayPairFromDbDocs = async () => {
    try {
      if (mongoose.connection.readyState !== 1) return null;

      const docs = await EnvironmentVariable.find({})
        .sort({ lastUpdatedAt: -1, updatedAt: -1, createdAt: -1 })
        .limit(10)
        .lean();

      for (const doc of docs) {
        const decryptIfNeeded = (value) => {
          const raw = String(value || '');
          if (!raw) return '';
          if (!isEncrypted(raw)) return raw;
          return decrypt(raw);
        };
        const candidate = normalizePair(
          decryptIfNeeded(doc?.RAZORPAY_API_KEY),
          decryptIfNeeded(doc?.RAZORPAY_SECRET_KEY),
        );
        if (candidate.keyId && candidate.keySecret) {
          return candidate;
        }
      }
      return null;
    } catch (error) {
      logger.warn(`Error while scanning Razorpay credentials across env docs: ${error.message}`);
      return null;
    }
  };

  // Force-refresh Razorpay keys from DB to avoid stale per-instance cache
  // in multi-server deployments right after admin ENV updates.
  const apiKeyRaw =
    (await getEnvVar('RAZORPAY_API_KEY', '', { forceRefresh: true })) ||
    (await getEnvVar('RAZORPAY_KEY_ID', '', { forceRefresh: true }));
  const secretKeyRaw =
    (await getEnvVar('RAZORPAY_SECRET_KEY', '', { forceRefresh: true })) ||
    (await getEnvVar('RAZORPAY_KEY_SECRET', '', { forceRefresh: true }));

  // Fallback to process.env so payment flow remains functional even if
  // DB-backed env document is temporarily unavailable on a worker.
  const processEnvApiKey =
    process.env.RAZORPAY_API_KEY ||
    process.env.RAZORPAY_KEY_ID ||
    '';
  const processEnvSecretKey =
    process.env.RAZORPAY_SECRET_KEY ||
    process.env.RAZORPAY_KEY_SECRET ||
    '';
  let selected = normalizePair(apiKeyRaw, secretKeyRaw);

  // If singleton lookup returned empty/missing pair (e.g., stale blank latest doc),
  // scan recent env docs and pick the first valid non-empty pair.
  if (!selected.keyId || !selected.keySecret) {
    const fromDbDocs = await findRazorpayPairFromDbDocs();
    if (fromDbDocs?.keyId && fromDbDocs?.keySecret) {
      selected = fromDbDocs;
    }
  }

  // Final fallback for resilience if DB-backed env is unavailable.
  if (!selected.keyId || !selected.keySecret) {
    selected = normalizePair(processEnvApiKey, processEnvSecretKey);
  }

  return {
    keyId: selected.keyId || '',
    keySecret: selected.keySecret || ''
  };
}

/**
 * Get Cloudinary credentials
 * @returns {Promise<Object>} { cloudName, apiKey, apiSecret }
 */
export async function getCloudinaryCredentials() {
  return {
    cloudName: await getEnvVar('CLOUDINARY_CLOUD_NAME'),
    apiKey: await getEnvVar('CLOUDINARY_API_KEY'),
    apiSecret: await getEnvVar('CLOUDINARY_API_SECRET')
  };
}

/**
 * Get Firebase credentials
 * @returns {Promise<Object>} Firebase credentials object
 */
export async function getFirebaseCredentials() {
  return {
    apiKey: await getEnvVar('FIREBASE_API_KEY'),
    authDomain: await getEnvVar('FIREBASE_AUTH_DOMAIN'),
    storageBucket: await getEnvVar('FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: await getEnvVar('FIREBASE_MESSAGING_SENDER_ID'),
    appId: await getEnvVar('FIREBASE_APP_ID'),
    measurementId: await getEnvVar('MEASUREMENT_ID'),
    projectId: await getEnvVar('FIREBASE_PROJECT_ID'),
    clientEmail: await getEnvVar('FIREBASE_CLIENT_EMAIL'),
    privateKey: await getEnvVar('FIREBASE_PRIVATE_KEY'),
    databaseURL: await getEnvVar('FIREBASE_DATABASE_URL'),
    vapidKey: await getEnvVar('FIREBASE_VAPID_KEY'),
    vapidSecretKey: await getEnvVar('FIREBASE_VAPID_SECRET_KEY')
  };
}

/**
 * Get SMTP credentials
 * @returns {Promise<Object>} { host, port, user, pass }
 */
export async function getSMTPCredentials() {
  return {
    host: await getEnvVar('SMTP_HOST'),
    port: await getEnvVar('SMTP_PORT'),
    user: await getEnvVar('SMTP_USER'),
    pass: await getEnvVar('SMTP_PASS')
  };
}

/**
 * Get SMS Hub India credentials
 * @returns {Promise<Object>} { apiKey, senderId }
 */
export async function getSMSHubIndiaCredentials() {
  return {
    apiKey: await getEnvVar('SMSINDIAHUB_API_KEY'),
    senderId: await getEnvVar('SMSINDIAHUB_SENDER_ID')
  };
}

/**
 * Get Google Maps API Key
 * @returns {Promise<string>} Google Maps API Key
 */
export async function getGoogleMapsApiKey() {
  return await getEnvVar('VITE_GOOGLE_MAPS_API_KEY');
}

