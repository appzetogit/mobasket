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
    // Initialize asynchronously (don't await in constructor)
    this.init().catch(err => {
      logger.error(`Error initializing Firebase: ${err.message}`);
    });
  }

  async init() {
    if (this.initialized) return;

    try {
      const init = await initializeFirebaseAdmin({ allowDbLookup: true });
      if (!init.initialized) {
        logger.warn(
          'Firebase Admin not fully configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY and FIREBASE_DATABASE_URL to enable auth + realtime.'
        );
        return;
      }
      this.initialized = true;
      logger.info('Firebase Admin initialized for auth verification');
    } catch (error) {
      logger.error(`Error in Firebase init: ${error.message}`);
    }
  }

  isEnabled() {
    return this.initialized;
  }

  /**
   * Verify a Firebase ID token and return decoded claims
   * @param {string} idToken
   * @returns {Promise<admin.auth.DecodedIdToken>}
   */
  async verifyIdToken(idToken) {
    if (!this.initialized) {
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


