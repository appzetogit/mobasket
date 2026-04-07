import express from 'express';
import {
  sendOTP,
  verifyOTP,
  refreshToken,
  logout,
  getCurrentDelivery,
  updateFcmToken
} from '../controllers/deliveryAuthController.js';
import { authenticate } from '../middleware/deliveryAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const sendOTPSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .required(),
  purpose: Joi.string()
    .valid('login', 'register', 'reset-password', 'verify-phone')
    .default('login')
});

const verifyOTPSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .required(),
  otp: Joi.string().required().length(6),
  purpose: Joi.string()
    .valid('login', 'register', 'reset-password', 'verify-phone')
    .default('login'),
  name: Joi.string().allow(null, '').optional(),
  token: Joi.string().trim().optional(),
  platform: Joi.string().valid('web', 'mobile').optional(),
  fcmToken: Joi.string().trim().optional(),
  fcmTokenWeb: Joi.string().trim().optional(),
  fcmTokenMobile: Joi.string().trim().optional()
});

const updateFcmTokenSchema = Joi.object({
  token: Joi.string().trim().allow('').optional(),
  platform: Joi.string().valid('web', 'mobile').required(),
  deviceId: Joi.string().trim().max(200).optional(),
  deviceType: Joi.string().trim().max(100).optional(),
  appContext: Joi.string().trim().max(100).optional(),
  userAgent: Joi.string().trim().max(1000).optional(),
  source: Joi.string().trim().max(100).optional(),
  isWebView: Joi.boolean().optional(),
  clear: Joi.boolean().optional()
});

// Public routes
router.post('/send-otp', validate(sendOTPSchema), sendOTP);
router.post('/verify-otp', validate(verifyOTPSchema), verifyOTP);
router.post('/refresh-token', refreshToken);

// Protected routes (require authentication)
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentDelivery);
router.post('/fcm-token', authenticate, validate(updateFcmTokenSchema), updateFcmToken);

export default router;

