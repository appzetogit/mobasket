import GroceryStore, { hydrateGroceryStoreFromLegacy, hydrateGroceryStoreByIdFromLegacy } from '../models/GroceryStore.js';
import otpService from '../../auth/services/otpService.js';
import jwtService from '../../auth/services/jwtService.js';
import firebaseAuthService from '../../auth/services/firebaseAuthService.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneUtils.js';
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

const getFcmPatchFromBody = (body = {}) => {
  const patch = {};
  const normalizedPlatform = String(body?.platform || '').toLowerCase();
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const fcmToken = typeof body?.fcmToken === 'string' ? body.fcmToken.trim() : '';
  const fcmTokenWeb = typeof body?.fcmTokenWeb === 'string' ? body.fcmTokenWeb.trim() : '';
  const fcmTokenMobile = typeof body?.fcmTokenMobile === 'string' ? body.fcmTokenMobile.trim() : '';

  if (fcmTokenWeb) patch.fcmTokenWeb = fcmTokenWeb;
  if (fcmTokenMobile) patch.fcmTokenMobile = fcmTokenMobile;

  const fallbackToken = token || fcmToken;
  if (fallbackToken) {
    if (normalizedPlatform === 'web') patch.fcmTokenWeb = fallbackToken;
    if (normalizedPlatform === 'mobile') patch.fcmTokenMobile = fallbackToken;
  }

  return patch;
};

const buildPhoneQuery = (normalizedPhone) => {
  if (!normalizedPhone) return null;

  const buildPhoneFieldOr = (phoneValue) => ([
    { phone: phoneValue },
    { ownerPhone: phoneValue },
    { primaryContactNumber: phoneValue }
  ]);

  if (normalizedPhone.startsWith('91') && normalizedPhone.length === 12) {
    const phoneWithoutCountryCode = normalizedPhone.substring(2);
    return {
      $or: [
        ...buildPhoneFieldOr(normalizedPhone),
        ...buildPhoneFieldOr(phoneWithoutCountryCode),
        ...buildPhoneFieldOr(`+${normalizedPhone}`),
        ...buildPhoneFieldOr(`+91${phoneWithoutCountryCode}`)
      ]
    };
  } else {
    return {
      $or: [
        ...buildPhoneFieldOr(normalizedPhone),
        ...buildPhoneFieldOr(`91${normalizedPhone}`),
        ...buildPhoneFieldOr(`+91${normalizedPhone}`),
        ...buildPhoneFieldOr(`+${normalizedPhone}`)
      ]
    };
  }
};

const isDuplicateKeyError = (error) =>
  error?.code === 11000 || /E11000 duplicate key error/i.test(String(error?.message || ''));

const findStoreWithLegacyFallback = async (filter, projection = null) => {
  let store = await GroceryStore.findOne(filter, projection);
  if (!store) {
    store = await hydrateGroceryStoreFromLegacy(filter, projection);
  }
  return store;
};

export const sendOTP = asyncHandler(async (req, res) => {
  const { phone, email, purpose = 'login' } = req.body;

  if (!phone && !email) {
    return errorResponse(res, 400, 'Either phone number or email is required');
  }

  try {
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
    if (phone && !normalizedPhone) {
      return errorResponse(res, 400, 'Invalid phone number format');
    }

    // Strict login flow: only existing store accounts can request login OTP.
    if (purpose === 'login') {
      const findQuery = normalizedPhone
        ? { ...buildPhoneQuery(normalizedPhone), platform: 'mogrocery' }
        : { email: email?.toLowerCase().trim(), platform: 'mogrocery' };
      const existingStore = await findStoreWithLegacyFallback(findQuery);
      if (!existingStore) {
        return errorResponse(
          res,
          404,
          'No grocery store account found with this phone/email. Please sign up first.'
        );
      }
    }

    const result = await otpService.generateAndSendOTP(phone || null, purpose, email || null);
    return successResponse(res, 200, result.message, {
      expiresIn: result.expiresIn,
      identifierType: result.identifierType
    });
  } catch (error) {
    logger.error(`Error sending OTP: ${error.message}`);
    return errorResponse(res, 500, 'Failed to send OTP. Please try again.');
  }
});

export const verifyOTP = asyncHandler(async (req, res) => {
  const { phone, email, otp, purpose = 'login', name, password } = req.body;
  const fcmPatch = getFcmPatchFromBody(req.body);

  if ((!phone && !email) || !otp) {
    return errorResponse(res, 400, 'Either phone number or email, and OTP are required');
  }

  try {
    let store;
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
    if (phone && !normalizedPhone) {
      return errorResponse(res, 400, 'Invalid phone number format');
    }
    
    const identifier = normalizedPhone || email;
    const identifierType = normalizedPhone ? 'phone' : 'email';

    let isNewlyRegistered = false;

    if (purpose === 'register') {
      const findQuery = normalizedPhone 
        ? { ...buildPhoneQuery(normalizedPhone), platform: 'mogrocery' }
        : { email: email?.toLowerCase().trim(), platform: 'mogrocery' };
      store = await findStoreWithLegacyFallback(findQuery);

      if (store) {
        return errorResponse(res, 400, `Grocery store already exists with this ${identifierType}. Please login.`);
      }

      if (!name) {
        return errorResponse(res, 400, 'Store name is required for registration');
      }

      await otpService.verifyOTP(phone || null, otp, purpose, email || null);

      const storeData = {
        name,
        signupMethod: normalizedPhone ? 'phone' : 'email',
        platform: 'mogrocery',
        role: 'restaurant',
        isActive: false,
        ownerName: (name && String(name).trim()) ? String(name).trim() : 'Store Owner',
        ownerEmail: email ? email.toLowerCase().trim() : '',
        ...fcmPatch
      };

      if (normalizedPhone) {
        storeData.phone = normalizedPhone;
        storeData.ownerPhone = normalizedPhone; // Restaurant model requires ownerPhone when phone is set
      }
      if (email) {
        storeData.email = email.toLowerCase().trim();
      }
      if (password) {
        storeData.password = password;
      }

      store = await GroceryStore.create(storeData);
      isNewlyRegistered = true;
    } else {
      const findQuery = normalizedPhone 
        ? { ...buildPhoneQuery(normalizedPhone), platform: 'mogrocery' }
        : { email: email?.toLowerCase().trim(), platform: 'mogrocery' };
      store = await findStoreWithLegacyFallback(findQuery);

      await otpService.verifyOTP(phone || null, otp, purpose, email || null);

      if (!store) {
        return errorResponse(
          res,
          404,
          `No grocery store account found with this ${identifierType}. Please sign up first.`
        );
      }

      if (fcmPatch.fcmTokenWeb) store.fcmTokenWeb = fcmPatch.fcmTokenWeb;
      if (fcmPatch.fcmTokenMobile) store.fcmTokenMobile = fcmPatch.fcmTokenMobile;
      if (fcmPatch.fcmTokenWeb || fcmPatch.fcmTokenMobile) {
        await store.save();
      }
    }

    const tokens = jwtService.generateTokens({
      userId: store._id.toString(),
      role: 'restaurant', // JWT role so upload/media and other shared routes accept store token
      email: store.email
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const storeResponse = store.toObject();
    delete storeResponse.password;

    return successResponse(res, 200, isNewlyRegistered ? 'Store registered successfully' : 'Login successful', {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      store: storeResponse
    });
  } catch (error) {
    logger.error(`Error verifying OTP: ${error.message}`);
    if (isDuplicateKeyError(error)) {
      return errorResponse(
        res,
        409,
        'This phone/email is already linked to another account. Please use a different phone/email for grocery.'
      );
    }
    return errorResponse(res, 400, error.message || 'Invalid OTP or verification failed');
  }
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, ownerName, ownerEmail, ownerPhone } = req.body;
  const fcmPatch = getFcmPatchFromBody(req.body);

  if (!name || !email || !password) {
    return errorResponse(res, 400, 'Name, email, and password are required');
  }

  try {
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
    const findQuery = normalizedPhone 
      ? { ...buildPhoneQuery(normalizedPhone), platform: 'mogrocery' }
      : { email: email.toLowerCase().trim(), platform: 'mogrocery' };
    
    const existingStore = await findStoreWithLegacyFallback(findQuery);
    if (existingStore) {
      return errorResponse(res, 400, 'Grocery store already exists with this email or phone. Please login.');
    }

    const storeData = {
      name,
      email: email.toLowerCase().trim(),
      password,
      platform: 'mogrocery',
      role: 'restaurant',
      isActive: false,
      signupMethod: 'email',
      ...fcmPatch
    };

    if (normalizedPhone) {
      storeData.phone = normalizedPhone;
    }
    if (ownerName) storeData.ownerName = ownerName;
    if (ownerEmail) storeData.ownerEmail = ownerEmail;
    if (ownerPhone) storeData.ownerPhone = normalizePhoneNumber(ownerPhone);

    const store = await GroceryStore.create(storeData);
    const tokens = jwtService.generateTokens({
      userId: store._id.toString(),
      role: 'restaurant', // JWT role so upload/media and other shared routes accept store token
      email: store.email
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const storeResponse = store.toObject();
    delete storeResponse.password;

    return successResponse(res, 201, 'Store registered successfully', {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      store: storeResponse
    });
  } catch (error) {
    logger.error(`Error registering store: ${error.message}`);
    return errorResponse(res, 500, 'Failed to register store');
  }
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const fcmPatch = getFcmPatchFromBody(req.body);

  if (!email || !password) {
    return errorResponse(res, 400, 'Email and password are required');
  }

  try {
    const store = await findStoreWithLegacyFallback({ 
      email: email.toLowerCase().trim(), 
      platform: 'mogrocery' 
    }, '+password');

    if (!store) {
      return errorResponse(res, 401, 'Invalid email or password');
    }

    if (!store.password) {
      return errorResponse(res, 400, 'Account was created with phone. Please use OTP login.');
    }

    const isPasswordValid = await store.comparePassword(password);
    if (!isPasswordValid) {
      return errorResponse(res, 401, 'Invalid email or password');
    }

    if (fcmPatch.fcmTokenWeb) store.fcmTokenWeb = fcmPatch.fcmTokenWeb;
    if (fcmPatch.fcmTokenMobile) store.fcmTokenMobile = fcmPatch.fcmTokenMobile;
    if (fcmPatch.fcmTokenWeb || fcmPatch.fcmTokenMobile) {
      await store.save();
    }

    const tokens = jwtService.generateTokens({
      userId: store._id.toString(),
      role: 'restaurant', // JWT role so upload/media and other shared routes accept store token
      email: store.email
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const storeResponse = store.toObject();
    delete storeResponse.password;

    return successResponse(res, 200, 'Login successful', {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      store: storeResponse
    });
  } catch (error) {
    logger.error(`Error logging in: ${error.message}`);
    return errorResponse(res, 500, 'Failed to login');
  }
});

export const firebaseGoogleLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body;
  const fcmPatch = getFcmPatchFromBody(req.body);

  if (!idToken) {
    return errorResponse(res, 400, 'ID token is required');
  }

  try {
    const firebaseUser = await firebaseAuthService.verifyIdToken(idToken);
    if (!firebaseUser.email) {
      return errorResponse(res, 400, 'Email is required from Google account');
    }

    let store = await findStoreWithLegacyFallback({ 
      email: firebaseUser.email.toLowerCase().trim(), 
      platform: 'mogrocery' 
    });

    if (!store) {
      store = await GroceryStore.create({
        name: firebaseUser.name || 'Grocery Store',
        email: firebaseUser.email.toLowerCase().trim(),
        platform: 'mogrocery',
        role: 'restaurant',
        isActive: false,
        signupMethod: 'google',
        ...fcmPatch
      });
    }

    if (fcmPatch.fcmTokenWeb) store.fcmTokenWeb = fcmPatch.fcmTokenWeb;
    if (fcmPatch.fcmTokenMobile) store.fcmTokenMobile = fcmPatch.fcmTokenMobile;
    if (fcmPatch.fcmTokenWeb || fcmPatch.fcmTokenMobile) {
      await store.save();
    }

    const tokens = jwtService.generateTokens({
      userId: store._id.toString(),
      role: 'restaurant', // JWT role so upload/media and other shared routes accept store token
      email: store.email
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const storeResponse = store.toObject();
    delete storeResponse.password;

    return successResponse(res, 200, 'Login successful', {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      store: storeResponse
    });
  } catch (error) {
    logger.error(`Error with Google login: ${error.message}`);
    if (isDuplicateKeyError(error)) {
      return errorResponse(
        res,
        409,
        'This email is already linked to another account. Please use a different email for grocery.'
      );
    }
    return errorResponse(res, 400, error.message || 'Google login failed');
  }
});

export const refreshToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!refreshToken) {
    return errorResponse(res, 401, 'Refresh token is required');
  }

  try {
    const decoded = jwtService.verifyRefreshToken(refreshToken);
    let store = await GroceryStore.findById(decoded.userId);
    if (!store) {
      store = await hydrateGroceryStoreByIdFromLegacy(decoded.userId);
    }

    if (!store) {
      return errorResponse(res, 401, 'Invalid refresh token');
    }

    const tokens = jwtService.generateTokens({
      userId: store._id.toString(),
      role: 'restaurant', // JWT role so upload/media and other shared routes accept store token
      email: store.email
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return successResponse(res, 200, 'Token refreshed successfully', {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (error) {
    return errorResponse(res, 401, 'Invalid or expired refresh token');
  }
});

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie('refreshToken');
  return successResponse(res, 200, 'Logged out successfully');
});

export const getCurrentStore = asyncHandler(async (req, res) => {
  const store = req.store;
  const storeResponse = store.toObject();
  delete storeResponse.password;
  return successResponse(res, 200, 'Store retrieved successfully', {
    store: storeResponse
  });
});

/**
 * Update FCM token for grocery store app notifications
 * POST /api/grocery/store/auth/fcm-token
 */
export const updateFcmToken = asyncHandler(async (req, res) => {
  const { token, platform } = req.body;

  if (!token || typeof token !== 'string' || !token.trim()) {
    return errorResponse(res, 400, 'FCM token is required');
  }

  const normalizedPlatform = String(platform || '').toLowerCase();
  if (!['web', 'mobile'].includes(normalizedPlatform)) {
    return errorResponse(res, 400, "Platform must be 'web' or 'mobile'");
  }

  const field = normalizedPlatform === 'web' ? 'fcmTokenWeb' : 'fcmTokenMobile';
  req.store[field] = token.trim();
  await req.store.save();

  return successResponse(res, 200, 'FCM token updated successfully', {
    fcmTokenWeb: req.store.fcmTokenWeb || '',
    fcmTokenMobile: req.store.fcmTokenMobile || ''
  });
});
