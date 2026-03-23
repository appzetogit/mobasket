import Razorpay from 'razorpay';
import crypto from 'crypto';
import winston from 'winston';
import { getRazorpayCredentials } from '../../../shared/utils/envService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Initialize Razorpay instance
let razorpayInstance = null;
let razorpayInstanceKeyId = '';
let razorpayInstanceKeySecret = '';

const initializeRazorpay = async (credentialsOverride = null) => {
  try {
    const credentials = credentialsOverride || (await getRazorpayCredentials());
    const keyId = String(credentials?.keyId || '').trim();
    const keySecret = String(credentials?.keySecret || '').trim();

    logger.info('Razorpay credentials check:', {
      hasKeyId: !!keyId,
      hasKeySecret: !!keySecret,
      keyIdLength: keyId?.length || 0,
      keySecretLength: keySecret?.length || 0
    });

    if (!keyId || !keySecret) {
      logger.warn('Razorpay credentials not found. Payment gateway will not work.', {
        keyId: keyId ? 'present' : 'missing',
        keySecret: keySecret ? 'present' : 'missing'
      });
      razorpayInstance = null;
      razorpayInstanceKeyId = '';
      razorpayInstanceKeySecret = '';
      return null;
    }

    try {
      razorpayInstance = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
      });
      razorpayInstanceKeyId = keyId;
      razorpayInstanceKeySecret = keySecret;
      logger.info('Razorpay initialized successfully');
      return razorpayInstance;
    } catch (error) {
      logger.error(`Error initializing Razorpay: ${error.message}`, {
        error: error.message,
        stack: error.stack
      });
      razorpayInstance = null;
      razorpayInstanceKeyId = '';
      razorpayInstanceKeySecret = '';
      return null;
    }
  } catch (error) {
    logger.error(`Error fetching Razorpay credentials: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    razorpayInstance = null;
    razorpayInstanceKeyId = '';
    razorpayInstanceKeySecret = '';
    return null;
  }
};

// Get Razorpay instance
const getRazorpayInstance = async () => {
  const credentials = await getRazorpayCredentials();
  const keyId = String(credentials?.keyId || '').trim();
  const keySecret = String(credentials?.keySecret || '').trim();

  if (!keyId || !keySecret) {
    logger.warn('Razorpay credentials not found while fetching instance.');
    razorpayInstance = null;
    razorpayInstanceKeyId = '';
    razorpayInstanceKeySecret = '';
    return null;
  }

  const credentialsChanged =
    keyId !== razorpayInstanceKeyId || keySecret !== razorpayInstanceKeySecret;

  if (!razorpayInstance || credentialsChanged) {
    if (credentialsChanged && razorpayInstance) {
      logger.info('Razorpay credentials changed. Reinitializing Razorpay client instance.');
    }
    return await initializeRazorpay({ keyId, keySecret });
  }
  return razorpayInstance;
};

/**
 * Create a Razorpay order
 * @param {Object} options - Order options
 * @param {Number} options.amount - Amount in paise (e.g., 10000 for ₹100)
 * @param {String} options.currency - Currency code (default: INR)
 * @param {String} options.receipt - Receipt ID
 * @param {Object} options.notes - Additional notes
 * @returns {Promise<Object>} Razorpay order object
 */
const createOrder = async (options) => {
  logger.info('Creating Razorpay order with options:', {
    amount: options.amount,
    currency: options.currency,
    receipt: options.receipt
  });

  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    logger.error('Razorpay instance is null - credentials may be missing or invalid');
    throw new Error('Razorpay is not initialized. Please check your credentials.');
  }

  try {
    const orderOptions = {
      amount: options.amount, // Amount in paise
      currency: options.currency || 'INR',
      receipt: options.receipt || `receipt_${Date.now()}`,
      notes: options.notes || {}
    };

    logger.info('Calling Razorpay API to create order...');
    const order = await razorpay.orders.create(orderOptions);
    
    logger.info(`Razorpay order created successfully: ${order.id}`, {
      orderId: order.id,
      amount: order.amount,
      receipt: order.receipt,
      status: order.status
    });

    return order;
  } catch (error) {
    logger.error(`Error creating Razorpay order:`, {
      message: error.message,
      error: error.error || error.description || error,
      statusCode: error.statusCode,
      status: error.status,
      options: {
        amount: options.amount,
        currency: options.currency,
        receipt: options.receipt
      },
      stack: error.stack
    });
    
    const razorpayDescription =
      String(
        error?.error?.description ||
        error?.description ||
        error?.message ||
        '',
      ).trim();
    const normalizedDescription = razorpayDescription.toLowerCase();
    const statusCode = Number(error?.statusCode || 0);
    const isAuthFailure =
      statusCode === 401 ||
      normalizedDescription.includes('authentication failed') ||
      normalizedDescription.includes('api key provided is invalid') ||
      normalizedDescription.includes('key id provided does not exist') ||
      normalizedDescription.includes('invalid api key');

    // Return more descriptive, app-safe error message
    let errorMessage = 'Failed to create payment order';
    if (isAuthFailure) {
      const credentials = await getRazorpayCredentials();
      const keyId = String(credentials?.keyId || '').trim();
      const keyHint = keyId ? `${keyId.slice(0, 10)}...` : 'missing';
      errorMessage =
        `Payment gateway authentication failed. Please verify Razorpay API key/secret pair in admin ENV setup (key: ${keyHint}).`;
    } else if (error?.error?.description) {
      errorMessage = String(error.error.description);
    } else if (error?.message) {
      errorMessage = String(error.message);
    }

    throw new Error(errorMessage);
  }
};

/**
 * Verify Razorpay payment signature
 * @param {String} razorpayOrderId - Razorpay order ID
 * @param {String} razorpayPaymentId - Razorpay payment ID
 * @param {String} razorpaySignature - Razorpay signature
 * @returns {Boolean} True if signature is valid
 */
const verifyPayment = async (razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
  const credentials = await getRazorpayCredentials();
  const keySecret = credentials.keySecret;
  
  if (!keySecret) {
    logger.error('Razorpay key secret not found');
    return false;
  }

  try {
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const isValid = generatedSignature === razorpaySignature;
    
    if (!isValid) {
      logger.warn('Invalid Razorpay signature', {
        razorpayOrderId,
        razorpayPaymentId,
        providedSignature: razorpaySignature,
        generatedSignature
      });
    }

    return isValid;
  } catch (error) {
    logger.error(`Error verifying Razorpay payment: ${error.message}`);
    return false;
  }
};

/**
 * Fetch payment details from Razorpay
 * @param {String} paymentId - Razorpay payment ID
 * @returns {Promise<Object>} Payment details
 */
const fetchPayment = async (paymentId) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    logger.error(`Error fetching Razorpay payment: ${error.message}`);
    throw error;
  }
};

/**
 * Create a refund
 * @param {String} paymentId - Razorpay payment ID
 * @param {Number} amount - Refund amount in paise (optional, full refund if not provided)
 * @param {String} notes - Refund notes
 * @returns {Promise<Object>} Refund details
 */
const createRefund = async (paymentId, amount = null, notes = {}) => {
  const razorpay = await getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay is not initialized');
  }

  try {
    const refundOptions = {
      notes: notes
    };

    if (amount) {
      refundOptions.amount = amount;
    }

    const refund = await razorpay.payments.refund(paymentId, refundOptions);
    logger.info(`Refund created: ${refund.id}`, {
      refundId: refund.id,
      paymentId,
      amount: refund.amount
    });

    return refund;
  } catch (error) {
    logger.error(`Error creating refund: ${error.message}`);
    throw error;
  }
};

export {
  initializeRazorpay,
  getRazorpayInstance,
  createOrder,
  verifyPayment,
  fetchPayment,
  createRefund
};

