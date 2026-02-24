import nodemailer from 'nodemailer';
import winston from 'winston';
import dotenv from 'dotenv';
dotenv.config();

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
 * Email Service
 * Handles sending emails via Nodemailer
 */
class EmailService {
  constructor() {
    // Initialize transporter based on environment
    this.transporter = null;
    // Initialize asynchronously (don't await in constructor)
    this.initializeTransporter().catch(err => {
      logger.warn(`Error initializing email transporter: ${err.message}`);
    });
  }

  /**
   * Initialize Nodemailer transporter
   * Supports both SMTP and development/test mode
   */
  async initializeTransporter() {
    // Get SMTP credentials from database
    const { getSMTPCredentials } = await import('../../../shared/utils/envService.js');
    const smtpCreds = await getSMTPCredentials();
    
    // Check if SMTP credentials are provided (from database or env)
    const hasSMTPConfig = (smtpCreds.user || process.env.SMTP_USER) && 
                         (smtpCreds.pass || process.env.SMTP_PASS) && 
                         (smtpCreds.host || process.env.SMTP_HOST);
    
    // For development/testing, use Ethereal Email if no SMTP config
    if (process.env.NODE_ENV === 'development' && !hasSMTPConfig) {
      // Check if Ethereal credentials are provided
      if (process.env.ETHEREAL_USER && process.env.ETHEREAL_PASS) {
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          auth: {
            user: process.env.ETHEREAL_USER,
            pass: process.env.ETHEREAL_PASS
          }
        });
      } else {
        // No email configuration - log warning but don't create transporter
        logger.warn('No SMTP or Ethereal email configuration found. Email OTP will not work.');
        logger.warn('Please configure SMTP credentials in .env file (see README for details)');
        return;
      }
    } else if (!hasSMTPConfig) {
      // Production mode but no SMTP config
      logger.warn('SMTP configuration missing. Email OTP will not work.');
      logger.warn('Please configure SMTP_HOST, SMTP_USER, and SMTP_PASS in ENV Setup or .env file');
      return;
    } else {
      // Production SMTP configuration (use database values, fallback to env)
      const smtpHost = smtpCreds.host || process.env.SMTP_HOST;
      const smtpPort = smtpCreds.port || process.env.SMTP_PORT || '587';
      const smtpUser = smtpCreds.user || process.env.SMTP_USER;
      const smtpPass = smtpCreds.pass || process.env.SMTP_PASS;
      
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass
        },
        // For Gmail, you need to use an App Password
        // See: https://support.google.com/accounts/answer/185833
      });
    }

    // Verify transporter configuration
    if (this.transporter) {
      this.transporter.verify((error, success) => {
        if (error) {
          logger.warn(`Email transporter verification failed: ${error.message}`);
          logger.warn('Email OTP will not work until SMTP is properly configured');
          logger.warn('Check your SMTP credentials in ENV Setup or .env file');
        } else {
          logger.info('Email transporter is ready');
        }
      });
    }
  }

  /**
   * Get company name from business settings
   */
  async getCompanyName() {
    try {
      const BusinessSettings = (await import('../../admin/models/BusinessSettings.js')).default;
      const settings = await BusinessSettings.getSettings();
      return settings?.companyName || 'Appzeto Food';
    } catch (error) {
      return 'Appzeto Food';
    }
  }

  /**
   * Generate OTP email HTML template
   */
  async generateOTPEmailTemplate(otp, purpose = 'login') {
    const companyName = await this.getCompanyName();
    const purposeText = {
      'login': 'login to your account',
      'register': 'complete your registration',
      'reset-password': 'reset your password',
      'verify-phone': 'verify your phone number',
      'verify-email': 'verify your email address'
    }[purpose] || 'complete this action';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${companyName} - OTP Verification</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">${companyName}</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
            <h2 style="color: #333; margin-top: 0;">OTP Verification</h2>
            
            <p style="color: #666; font-size: 16px;">
              Your One-Time Password (OTP) to ${purposeText} is:
            </p>
            
            <div style="background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
              <div style="font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                ${otp}
              </div>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              <strong>This OTP is valid for 5 minutes.</strong>
            </p>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
              <strong>Security Notice:</strong><br>
              • Never share this OTP with anyone<br>
              • ${companyName} will never ask for your OTP via phone or email<br>
              • If you didn't request this OTP, please ignore this email
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate OTP email text version (fallback)
   */
  async generateOTPEmailText(otp, purpose = 'login') {
    const companyName = await this.getCompanyName();
    const purposeText = {
      'login': 'login to your account',
      'register': 'complete your registration',
      'reset-password': 'reset your password',
      'verify-phone': 'verify your phone number',
      'verify-email': 'verify your email address'
    }[purpose] || 'complete this action';

    return `
${companyName} - OTP Verification

Your One-Time Password (OTP) to ${purposeText} is:

${otp}

This OTP is valid for 5 minutes.

Security Notice:
- Never share this OTP with anyone
- ${companyName} will never ask for your OTP via phone or email
- If you didn't request this OTP, please ignore this email

© ${new Date().getFullYear()} ${companyName}. All rights reserved.
    `.trim();
  }

  /**
   * Send OTP via Email
   * @param {string} email - Email address
   * @param {string} otp - OTP code
   * @param {string} purpose - Purpose of OTP (login, register, etc.)
   * @returns {Promise<Object>}
   */
  async sendOTP(email, otp, purpose = 'login') {
    try {
      // Check if transporter is configured
      if (!this.transporter) {
        // Try to reinitialize if not configured
        await this.initializeTransporter();
        if (!this.transporter) {
          throw new Error('Email transporter is not configured. Please set up SMTP credentials in ENV Setup or .env file');
        }
      }

      // Get SMTP credentials for from email
      const { getSMTPCredentials } = await import('../../../shared/utils/envService.js');
      const smtpCreds = await getSMTPCredentials();
      const fromEmail = process.env.SMTP_FROM || smtpCreds.user || process.env.SMTP_USER || 'noreply@appzetofood.com';
      const companyName = await this.getCompanyName();
      const fromName = process.env.SMTP_FROM_NAME || companyName;

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: `Your ${companyName} OTP - ${otp}`,
        text: await this.generateOTPEmailText(otp, purpose),
        html: await this.generateOTPEmailTemplate(otp, purpose)
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info(`OTP email sent successfully to ${email}`, {
        email,
        purpose,
        messageId: info.messageId,
        // In development with Ethereal, log the preview URL
        previewUrl: process.env.NODE_ENV === 'development' ? nodemailer.getTestMessageUrl(info) : null
      });

      // If using Ethereal in development, log the preview URL
      if (process.env.NODE_ENV === 'development' && nodemailer.getTestMessageUrl) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          logger.info(`Preview email at: ${previewUrl}`);
        }
      }

      return {
        success: true,
        messageId: info.messageId,
        status: 'sent',
        previewUrl: process.env.NODE_ENV === 'development' ? nodemailer.getTestMessageUrl(info) : null
      };
    } catch (error) {
      logger.error(`Failed to send OTP email: ${error.message}`, {
        email,
        purpose,
        error: error.message
      });

      throw new Error(`Failed to send OTP email: ${error.message}`);
    }
  }

  /**
   * Send welcome email (optional, for future use)
   */
  async sendWelcomeEmail(email, name) {
    try {
      // Get SMTP credentials for from email
      const { getSMTPCredentials } = await import('../../../shared/utils/envService.js');
      const smtpCreds = await getSMTPCredentials();
      const fromEmail = process.env.SMTP_FROM || smtpCreds.user || process.env.SMTP_USER || 'noreply@appzetofood.com';
      const companyName = await this.getCompanyName();
      const fromName = process.env.SMTP_FROM_NAME || companyName;

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: `Welcome to ${companyName}!`,
        html: `
          <h1>Welcome to ${companyName}, ${name}!</h1>
          <p>Thank you for joining us. We're excited to have you on board.</p>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Welcome email sent to ${email}`);
    } catch (error) {
      logger.error(`Failed to send welcome email: ${error.message}`);
      // Don't throw error for welcome email failures
    }
  }
}

export default new EmailService();

