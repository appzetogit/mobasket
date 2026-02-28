import Otp from '../models/Otp.js';
import smsIndiaHubService from './smsIndiaHubService.js';
import emailService from './emailService.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Normalize phone number for OTP persistence and lookup.
 * Stores as +<country><number> without spaces so send/verify match across clients.
 * @param {string|null} phone
 * @returns {string|null}
 */
const normalizePhoneForOtp = (phone) => {
  if (!phone || typeof phone !== 'string') return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) return null;

  // Default to Indian country code if not explicitly provided.
  if (digitsOnly.length === 10) return `+91${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) return `+91${digitsOnly.slice(1)}`;
  if (digitsOnly.length > 10 && digitsOnly.startsWith('91')) return `+${digitsOnly}`;
  if (trimmed.startsWith('+')) return `+${digitsOnly}`;
  return `+${digitsOnly}`;
};

/**
 * Generate a random 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * OTP Service
 * Handles OTP generation, storage, and verification
 * Supports both phone and email OTP
 */
class OTPService {
  /**
   * Generate and send OTP via phone or email
   * @param {string} phone - Phone number (optional if email provided)
   * @param {string} email - Email address (optional if phone provided)
   * @param {string} purpose - Purpose of OTP (login, register, etc.)
   * @returns {Promise<Object>}
   */
  async generateAndSendOTP(phone = null, purpose = 'login', email = null) {
    try {
      // Validate that either phone or email is provided
      if (!phone && !email) {
        throw new Error('Either phone or email must be provided');
      }

      const normalizedPhone = phone ? normalizePhoneForOtp(phone) : null;
      const identifier = normalizedPhone || email;
      const identifierType = normalizedPhone ? 'phone' : 'email';

      // Check rate limiting (configurable) - using MongoDB
      if (process.env.NODE_ENV === 'production') {
        const rateLimitWindowMinutes = parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MINUTES || '15', 10);
        const rateLimitMaxRequests = parseInt(process.env.OTP_RATE_LIMIT_MAX_REQUESTS || '5', 10);
        const windowStart = new Date(Date.now() - rateLimitWindowMinutes * 60 * 1000);
        const rateLimitQuery = {
          [identifierType]: identifier,
          purpose,
          createdAt: { $gte: windowStart }
        };
        
        const recentOtpCount = await Otp.countDocuments(rateLimitQuery);
        if (recentOtpCount >= rateLimitMaxRequests) {
          const oldestRecentOtp = await Otp.findOne(rateLimitQuery)
            .sort({ createdAt: 1 })
            .select('createdAt')
            .lean();
          const windowMs = rateLimitWindowMinutes * 60 * 1000;
          const retryAfterMs = oldestRecentOtp?.createdAt
            ? Math.max(0, windowMs - (Date.now() - new Date(oldestRecentOtp.createdAt).getTime()))
            : windowMs;
          const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
          const waitMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

          const rateLimitError = new Error(
            `Too many OTP requests. Please try again after ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''}.`
          );
          rateLimitError.statusCode = 429;
          rateLimitError.retryAfterSeconds = retryAfterSeconds;
          throw rateLimitError;
        }
      }

      // Generate OTP
      // Use fixed OTP for default test number only.
      const isDefaultTestNumber = normalizedPhone === '+917610416911';
      const smsConfigured = normalizedPhone ? await smsIndiaHubService.isConfigured() : true;
      const otp = isDefaultTestNumber ? '110211' : generateOTP();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Build query for invalidating previous OTPs
      const invalidateQuery = { purpose, verified: false };
      if (normalizedPhone) invalidateQuery.phone = normalizedPhone;
      if (email) invalidateQuery.email = email;

      // Invalidate previous OTPs for this identifier and purpose
      await Otp.updateMany(
        invalidateQuery,
        { verified: true } // Mark as used
      );

      // Store OTP in database
      const otpData = {
        otp,
        purpose,
        expiresAt
      };
      if (normalizedPhone) otpData.phone = normalizedPhone;
      if (email) otpData.email = email;

      const otpRecord = await Otp.create(otpData);

      // Send OTP via SMS or Email
      // For default test number, skip external SMS and rely on static OTP 110211.
      if (normalizedPhone && !isDefaultTestNumber) {
        if (!smsConfigured) {
          throw new Error(
            'SMS service is not configured. Please set SMSINDIAHUB_API_KEY and SMSINDIAHUB_SENDER_ID in Admin > ENV Setup.'
          );
        }
        await smsIndiaHubService.sendOTP(normalizedPhone, otp, purpose);
      } else if (email) {
        // Keep email service as is
        await emailService.sendOTP(email, otp, purpose);
      }

      logger.info(`OTP generated and sent to ${identifier} (${identifierType})`, {
        [identifierType]: identifier,
        purpose,
        otpId: otpRecord._id
      });

      return {
        success: true,
        message: `OTP sent successfully to ${identifierType === 'phone' ? 'phone' : 'email'}`,
        expiresIn: 300, // 5 minutes in seconds
        identifierType
      };
    } catch (error) {
      logger.error(`Error generating OTP: ${error.message}`, {
        phone: phone ? normalizePhoneForOtp(phone) : null,
        email,
        purpose,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verify OTP
   * @param {string} phone - Phone number (optional if email provided)
   * @param {string} otp - OTP code
   * @param {string} purpose - Purpose of OTP
   * @param {string} email - Email address (optional if phone provided)
   * @returns {Promise<Object>}
   */
  async verifyOTP(phone = null, otp, purpose = 'login', email = null) {
    try {
      // Validate that either phone or email is provided
      if (!phone && !email) {
        throw new Error('Either phone or email must be provided');
      }

      const normalizedPhone = phone ? normalizePhoneForOtp(phone) : null;
      const identifier = normalizedPhone || email;
      const identifierType = normalizedPhone ? 'phone' : 'email';

      // Verify OTP from database
      // For reset-password purpose, allow already-verified OTPs within 10 minutes
      let otpRecord;
      
      if (purpose === 'reset-password') {
        // First try to find unverified OTP
        const unverifiedQuery = {
          otp,
          purpose,
          verified: false,
          expiresAt: { $gt: new Date() }
        };
        if (normalizedPhone) unverifiedQuery.phone = normalizedPhone;
        if (email) unverifiedQuery.email = email;
        
        otpRecord = await Otp.findOne(unverifiedQuery);
        
        // If not found, check for already-verified OTP within last 10 minutes
        if (!otpRecord) {
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          const verifiedQuery = {
            otp,
            purpose,
            verified: true,
            expiresAt: { $gt: new Date() },
            updatedAt: { $gt: tenMinutesAgo }
          };
          if (normalizedPhone) verifiedQuery.phone = normalizedPhone;
          if (email) verifiedQuery.email = email;
          
          otpRecord = await Otp.findOne(verifiedQuery);
          
          if (otpRecord) {
            // OTP already verified and still valid (within 10 minutes)
            return {
              success: true,
              message: 'OTP verified successfully'
            };
          }
        }
      } else {
        // For other purposes, only check unverified OTPs
        const query = {
          otp,
          purpose,
          verified: false,
          expiresAt: { $gt: new Date() }
        };
        if (normalizedPhone) query.phone = normalizedPhone;
        if (email) query.email = email;
        
        otpRecord = await Otp.findOne(query);
      }

      if (!otpRecord) {
        // Increment attempts for security (only for unverified OTPs)
        const incrementQuery = { purpose, verified: false };
        if (normalizedPhone) incrementQuery.phone = normalizedPhone;
        if (email) incrementQuery.email = email;

        await Otp.updateMany(
          incrementQuery,
          { $inc: { attempts: 1 } }
        );

        throw new Error('Invalid or expired OTP');
      }

      // Check attempts
      if (otpRecord.attempts >= 5) {
        throw new Error('Too many failed attempts. Please request a new OTP.');
      }

      // Mark as verified
      otpRecord.verified = true;
      await otpRecord.save();

      logger.info(`OTP verified successfully for ${identifier} (${identifierType})`, {
        [identifierType]: identifier,
        purpose
      });

      return {
        success: true,
        message: 'OTP verified successfully'
      };
    } catch (error) {
      logger.error(`Error verifying OTP: ${error.message}`, {
        phone: phone ? normalizePhoneForOtp(phone) : null,
        email,
        purpose,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Resend OTP
   * @param {string} phone - Phone number (optional if email provided)
   * @param {string} purpose - Purpose of OTP
   * @param {string} email - Email address (optional if phone provided)
   * @returns {Promise<Object>}
   */
  async resendOTP(phone = null, purpose = 'login', email = null) {
    return await this.generateAndSendOTP(phone, purpose, email);
  }
}

export default new OTPService();

