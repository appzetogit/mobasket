import admin from 'firebase-admin';
import winston from 'winston';
import { initializeFirebaseAdmin } from '../../../shared/services/firebaseAdminService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class FirebaseAuthService {
  constructor() {
    this.initialized = false;
    this.initializingPromise = null;
    // Initialize asynchronously (don't await in constructor)
    this.init().catch(err => {
      logger.error(`Error initializing Firebase: ${err.message}`);
    });
  }

  async init() {
    if (this.initialized) return true;
    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.initializingPromise = (async () => {
      try {
        const init = await initializeFirebaseAdmin({ allowDbLookup: true });
        if (!init.initialized) {
          logger.warn(
            'Firebase Admin not fully configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY and FIREBASE_DATABASE_URL to enable auth + realtime.'
          );
          this.initialized = false;
          return false;
        }
        this.initialized = true;
        logger.info('Firebase Admin initialized for auth verification');
        return true;
      } catch (error) {
        this.initialized = false;
        logger.error(`Error in Firebase init: ${error.message}`);
        return false;
      } finally {
        this.initializingPromise = null;
      }
    })();

    return this.initializingPromise;
  }

  async ensureInitialized() {
    if (this.initialized) {
      return true;
    }
    return this.init();
  }

  async isEnabled() {
    return this.ensureInitialized();
  }

  /**
   * Verify a Firebase ID token and return decoded claims
   * @param {string} idToken
   * @returns {Promise<admin.auth.DecodedIdToken>}
   */
  async verifyIdToken(idToken) {
    const ready = await this.ensureInitialized();
    if (!ready) {
      throw new Error('Firebase Admin is not configured. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in Admin > ENV Setup');
    }

    if (!idToken) {
      throw new Error('ID token is required');
    }

    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      logger.info('Firebase ID token verified', { uid: decoded.uid, email: decoded.email });
      return decoded;
    } catch (error) {
      logger.error(`Error verifying Firebase ID token: ${error.message}`);
      throw new Error('Invalid or expired Firebase ID token');
    }
  }
}

export default new FirebaseAuthService();


