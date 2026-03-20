import express from 'express';
import {
  sendOTP,
  verifyOTP,
  register,
  login,
  refreshToken,
  logout,
  getCurrentStore,
  updateFcmToken,
  firebaseGoogleLogin,
  reverifyGroceryStore
} from '../controllers/groceryStoreAuthController.js';
import { authenticate } from '../middleware/groceryStoreAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

const sendOTPSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .optional(),
  email: Joi.string().email().optional(),
  purpose: Joi.string()
    .valid('login', 'register', 'reset-password', 'verify-phone', 'verify-email')
    .default('login')
}).or('phone', 'email');

const verifyOTPSchema = Joi.object({
  phone: Joi.string().optional(),
  email: Joi.string().email().optional(),
  otp: Joi.string().required().length(6),
  purpose: Joi.string()
    .valid('login', 'register', 'reset-password', 'verify-phone', 'verify-email')
    .default('login'),
  name: Joi.string().when('purpose', {
    is: 'register',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  password: Joi.string().min(6).max(100).optional(),
  token: Joi.string().trim().optional(),
  platform: Joi.string().valid('web', 'mobile').optional(),
  fcmToken: Joi.string().trim().optional(),
  fcmTokenWeb: Joi.string().trim().optional(),
  fcmTokenMobile: Joi.string().trim().optional()
}).or('phone', 'email');

const registerSchema = Joi.object({
  name: Joi.string().required().min(2).max(100),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(100).required(),
  phone: Joi.string().optional(),
  ownerName: Joi.string().optional(),
  ownerEmail: Joi.string().email().optional(),
  ownerPhone: Joi.string().optional(),
  token: Joi.string().trim().optional(),
  platform: Joi.string().valid('web', 'mobile').optional(),
  fcmToken: Joi.string().trim().optional(),
  fcmTokenWeb: Joi.string().trim().optional(),
  fcmTokenMobile: Joi.string().trim().optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  token: Joi.string().trim().optional(),
  platform: Joi.string().valid('web', 'mobile').optional(),
  fcmToken: Joi.string().trim().optional(),
  fcmTokenWeb: Joi.string().trim().optional(),
  fcmTokenMobile: Joi.string().trim().optional()
});

const firebaseGoogleLoginSchema = Joi.object({
  idToken: Joi.string().required(),
  token: Joi.string().trim().optional(),
  platform: Joi.string().valid('web', 'mobile').optional(),
  fcmToken: Joi.string().trim().optional(),
  fcmTokenWeb: Joi.string().trim().optional(),
  fcmTokenMobile: Joi.string().trim().optional()
});

const updateFcmTokenSchema = Joi.object({
  token: Joi.string().trim().required(),
  platform: Joi.string().valid('web', 'mobile').required()
});

// Public routes
router.post('/send-otp', validate(sendOTPSchema), sendOTP);
router.post('/verify-otp', validate(verifyOTPSchema), verifyOTP);
router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/firebase/google-login', validate(firebaseGoogleLoginSchema), firebaseGoogleLogin);

// Protected routes
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
router.get('/me', authenticate, getCurrentStore);
router.post('/reverify', authenticate, reverifyGroceryStore);
router.post('/fcm-token', authenticate, validate(updateFcmTokenSchema), updateFcmToken);

export default router;
