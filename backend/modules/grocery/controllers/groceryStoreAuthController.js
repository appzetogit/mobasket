import GroceryStore, { hydrateGroceryStoreFromLegacy, hydrateGroceryStoreByIdFromLegacy } from '../models/GroceryStore.js';
import otpService from '../../auth/services/otpService.js';
import jwtService, { refreshCookieMaxAgeMs } from '../../auth/services/jwtService.js';
import firebaseAuthService from '../../auth/services/firebaseAuthService.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneUtils.js';
import {
  maskPushToken,
  removePushTokenFromEntity,
  upsertPushTokenOnEntity,
} from '../../../shared/utils/pushTokenRegistry.js';
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

  // Phone auth must resolve only the store's login phone.
  // Matching owner/contact numbers can accidentally attach a new store
  // onboarding flow to an older outlet that shares the same owner details.
  const buildPhoneFieldOr = (phoneValue) => ([{ phone: phoneValue }]);

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

const groceryRefreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: refreshCookieMaxAgeMs
};

const groceryClearCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict'
};

const setGroceryRefreshCookies = (res, token) => {
  res.cookie('refreshToken', token, groceryRefreshCookieOptions);
  res.cookie('groceryStoreRefreshToken', token, groceryRefreshCookieOptions);
};

const clearGroceryRefreshCookies = (res) => {
  res.clearCookie('refreshToken', groceryClearCookieOptions);
  res.clearCookie('groceryStoreRefreshToken', groceryClearCookieOptions);
};

const getStoreSelectionScore = (store = {}) => {
  let score = 0;
  if (store?.isActive === true) score += 1000;
  if (store?.approvedAt) score += 500;
  if (!String(store?.rejectionReason || '').trim()) score += 100;
  if (Number(store?.onboarding?.completedSteps || 0) >= 1) score += 10;
  return score;
};

const findBestStoreCandidate = (stores = []) => {
  if (!Array.isArray(stores) || stores.length === 0) return null;

  return stores
    .slice()
    .sort((left, right) => {
      const scoreDiff = getStoreSelectionScore(right) - getStoreSelectionScore(left);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(right?.updatedAt || 0).getTime() - new Date(left?.updatedAt || 0).getTime();
    })[0] || null;
};

const findStoreWithLegacyFallback = async (filter, projection = null) => {
  const stores = await GroceryStore.find(filter, projection)
    .sort({ isActive: -1, approvedAt: -1, updatedAt: -1, createdAt: -1 })
    .limit(20);

  let store = findBestStoreCandidate(stores);
  if (!store) {
    store = await hydrateGroceryStoreFromLegacy(filter, projection);
  }
  return store;
};

const getRequestedPlatform = (body = {}) => String(body?.platform || '').trim().toLowerCase();

const rejectIfRestaurantPlatformRequest = (req, res) => {
  if (!getRequestedPlatform(req?.body)) return false;
  if (getRequestedPlatform(req?.body) === 'mogrocery') return false;
  errorResponse(
    res,
    400,
    'Use restaurant auth endpoints for mofood accounts (/api/restaurant/auth/*).'
  );
  return true;
};

export const sendOTP = asyncHandler(async (req, res) => {
  if (rejectIfRestaurantPlatformRequest(req, res)) return;
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
  if (rejectIfRestaurantPlatformRequest(req, res)) return;
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
      if (store.isActive && store.isAcceptingOrders !== true) {
        store.isAcceptingOrders = true;
      }
      if (fcmPatch.fcmTokenWeb || fcmPatch.fcmTokenMobile || store.isModified('isAcceptingOrders')) {
        await store.save();
      }
    }

    if (store.isActive && store.isAcceptingOrders !== true) {
      store.isAcceptingOrders = true;
      await store.save();
    }

    const tokens = jwtService.generateTokens({
      userId: store._id.toString(),
      role: 'restaurant', // JWT role so upload/media and other shared routes accept store token
      email: store.email
    });

    setGroceryRefreshCookies(res, tokens.refreshToken);

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
  if (rejectIfRestaurantPlatformRequest(req, res)) return;
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

    setGroceryRefreshCookies(res, tokens.refreshToken);

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
  if (rejectIfRestaurantPlatformRequest(req, res)) return;
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
    if (store.isActive && store.isAcceptingOrders !== true) {
      store.isAcceptingOrders = true;
    }
    if (fcmPatch.fcmTokenWeb || fcmPatch.fcmTokenMobile || store.isModified('isAcceptingOrders')) {
      await store.save();
    }

    const tokens = jwtService.generateTokens({
      userId: store._id.toString(),
      role: 'restaurant', // JWT role so upload/media and other shared routes accept store token
      email: store.email
    });

    setGroceryRefreshCookies(res, tokens.refreshToken);

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
  if (rejectIfRestaurantPlatformRequest(req, res)) return;
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
    if (store.isActive && store.isAcceptingOrders !== true) {
      store.isAcceptingOrders = true;
    }
    if (fcmPatch.fcmTokenWeb || fcmPatch.fcmTokenMobile || store.isModified('isAcceptingOrders')) {
      await store.save();
    }

    const tokens = jwtService.generateTokens({
      userId: store._id.toString(),
      role: 'restaurant', // JWT role so upload/media and other shared routes accept store token
      email: store.email
    });

    setGroceryRefreshCookies(res, tokens.refreshToken);

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
  const refreshToken =
    req.cookies?.groceryStoreRefreshToken ||
    req.cookies?.refreshToken ||
    req.body?.refreshToken ||
    req.headers['x-refresh-token'];

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

    if (store.isActive && store.isAcceptingOrders !== true) {
      store.isAcceptingOrders = true;
      await store.save();
    }

    const tokens = jwtService.generateTokens({
      userId: store._id.toString(),
      role: 'restaurant', // JWT role so upload/media and other shared routes accept store token
      email: store.email
    });

    setGroceryRefreshCookies(res, tokens.refreshToken);

    return successResponse(res, 200, 'Token refreshed successfully', {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (error) {
    return errorResponse(res, 401, 'Invalid or expired refresh token');
  }
});

export const logout = asyncHandler(async (req, res) => {
  if (req.store) {
    req.store.isAcceptingOrders = false;
    await req.store.save();
  }

  clearGroceryRefreshCookies(res);
  return successResponse(res, 200, 'Logged out successfully');
});

const normalizeStoreOnboardingState = (store) => {
  const onboarding = store?.onboarding?.toObject
    ? store.onboarding.toObject()
    : { ...(store?.onboarding || {}) };

  const isProvisioned =
    store?.isActive === true ||
    Boolean(store?.approvedAt) ||
    Boolean(store?.rejectedAt) ||
    Boolean(String(store?.rejectionReason || '').trim()) ||
    Number(onboarding?.completedSteps || 0) >= 1;

  if (isProvisioned && Number(onboarding?.completedSteps || 0) < 1) {
    onboarding.completedSteps = 1;
  }

  return onboarding;
};

export const getCurrentStore = asyncHandler(async (req, res) => {
  const store = req.store;
  const storeResponse = store.toObject();
  storeResponse.onboarding = normalizeStoreOnboardingState(store);
  delete storeResponse.password;
  return successResponse(res, 200, 'Store retrieved successfully', {
    store: storeResponse
  });
});

export const updateStoreProfile = asyncHandler(async (req, res) => {
  const store = req.store;
  const { name, ownerName, ownerEmail, ownerPhone, primaryContactNumber, location, profileImage } = req.body || {};

  if (name !== undefined) {
    store.name = String(name || '').trim();
  }
  if (ownerName !== undefined) {
    store.ownerName = String(ownerName || '').trim();
  }
  if (ownerEmail !== undefined) {
    store.ownerEmail = String(ownerEmail || '').trim().toLowerCase();
  }
  if (ownerPhone !== undefined) {
    store.ownerPhone = String(ownerPhone || '').trim();
  }
  if (primaryContactNumber !== undefined) {
    store.primaryContactNumber = String(primaryContactNumber || '').trim();
  }
  if (profileImage !== undefined) {
    store.profileImage = profileImage;
  }

  if (location && typeof location === 'object') {
    const nextLocation = {
      ...(store.location?.toObject ? store.location.toObject() : store.location || {}),
      ...location,
    };

    if (
      Number.isFinite(Number(nextLocation.latitude)) &&
      Number.isFinite(Number(nextLocation.longitude)) &&
      (!Array.isArray(nextLocation.coordinates) || nextLocation.coordinates.length < 2)
    ) {
      nextLocation.coordinates = [Number(nextLocation.longitude), Number(nextLocation.latitude)];
    }

    if (
      Array.isArray(nextLocation.coordinates) &&
      nextLocation.coordinates.length >= 2
    ) {
      if (!Number.isFinite(Number(nextLocation.longitude))) {
        nextLocation.longitude = Number(nextLocation.coordinates[0]);
      }
      if (!Number.isFinite(Number(nextLocation.latitude))) {
        nextLocation.latitude = Number(nextLocation.coordinates[1]);
      }
    }

    if (!nextLocation.address && nextLocation.formattedAddress) {
      nextLocation.address = nextLocation.formattedAddress;
    }

    store.location = nextLocation;

    if (store.onboarding?.step1 && typeof store.onboarding.step1 === 'object') {
      store.onboarding.step1 = {
        ...store.onboarding.step1,
        location: {
          ...(store.onboarding.step1.location || {}),
          ...nextLocation,
        },
      };
    }
  }

  await store.save();

  const storeResponse = store.toObject();
  delete storeResponse.password;

  return successResponse(res, 200, 'Store profile updated successfully', {
    store: storeResponse,
  });
});

/**
 * Update grocery store delivery status (isAcceptingOrders)
 * PUT /api/grocery/store/delivery-status
 */
export const updateStoreDeliveryStatus = asyncHandler(async (req, res) => {
  const store = req.store;
  const { isAcceptingOrders } = req.body || {};

  if (typeof isAcceptingOrders !== 'boolean') {
    return errorResponse(res, 400, 'isAcceptingOrders must be a boolean value');
  }

  store.isAcceptingOrders = isAcceptingOrders;
  await store.save();

  const storeResponse = store.toObject();
  delete storeResponse.password;

  return successResponse(res, 200, 'Delivery status updated successfully', {
    store: {
      id: storeResponse._id,
      isAcceptingOrders: Boolean(storeResponse.isAcceptingOrders),
    },
  });
});

/**
 * Update FCM token for grocery store app notifications
 * POST /api/grocery/store/auth/fcm-token
 */
export const updateFcmToken = asyncHandler(async (req, res) => {
  const { token, platform, deviceId, deviceType, appContext, userAgent, source, isWebView, clear } = req.body;
  const normalizedPlatform = String(platform || '').toLowerCase();
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  const shouldClear = clear === true || clear === 'true' || (!normalizedToken && normalizedPlatform === 'web' && isWebView === true);

  if (!['web', 'mobile'].includes(normalizedPlatform)) {
    return errorResponse(res, 400, "Platform must be 'web' or 'mobile'");
  }

  if (!shouldClear && !normalizedToken) {
    return errorResponse(res, 400, 'FCM token is required');
  }

  if (shouldClear) {
    removePushTokenFromEntity(req.store, {
      token: normalizedToken,
      platform: normalizedPlatform,
      deviceId,
      removeAllForPlatform: normalizedPlatform === 'web' && isWebView === true,
    });
    if (normalizedPlatform === 'web') req.store.fcmTokenWeb = '';
    if (normalizedPlatform === 'mobile') req.store.fcmTokenMobile = '';
    await req.store.save();

    logger.info('Grocery store FCM token cleared', {
      storeId: req.store?._id?.toString?.() || '',
      platform: normalizedPlatform,
      deviceId: String(deviceId || ''),
      isWebView: Boolean(isWebView),
    });

    return successResponse(res, 200, 'FCM token cleared successfully', {
      fcmTokenWeb: req.store.fcmTokenWeb || '',
      fcmTokenMobile: req.store.fcmTokenMobile || '',
      pushTokens: req.store.pushTokens || [],
    });
  }

  upsertPushTokenOnEntity(req.store, {
    token: normalizedToken,
    platform: normalizedPlatform,
    deviceId,
    deviceType,
    appContext,
    userAgent,
    source,
    isWebView,
  });
  await req.store.save();

  logger.info('Grocery store FCM token updated successfully', {
    storeId: req.store?._id?.toString?.() || '',
    platform: normalizedPlatform,
    deviceId: String(deviceId || ''),
    deviceType: String(deviceType || ''),
    appContext: String(appContext || ''),
    tokenPreview: maskPushToken(normalizedToken),
    hasWebToken: Boolean(req.store.fcmTokenWeb),
    hasMobileToken: Boolean(req.store.fcmTokenMobile),
    pushTokenCount: Array.isArray(req.store.pushTokens) ? req.store.pushTokens.length : 0,
  });

  return successResponse(res, 200, 'FCM token updated successfully', {
    fcmTokenWeb: req.store.fcmTokenWeb || '',
    fcmTokenMobile: req.store.fcmTokenMobile || '',
    pushTokens: req.store.pushTokens || [],
  });
});

/**
 * Reverify Grocery Store (Resubmit for approval)
 * POST /api/grocery/store/auth/reverify
 */
export const reverifyGroceryStore = asyncHandler(async (req, res) => {
  try {
    const store = req.store; // Already attached by authenticate middleware

    // Only rejected stores can reverify.
    if (!String(store?.rejectionReason || '').trim()) {
      return errorResponse(
        res,
        400,
        'Grocery store is not rejected. Only rejected grocery stores can be reverified.'
      );
    }

    // Clear rejection details and mark as pending again.
    store.rejectionReason = null;
    store.rejectedAt = null;
    store.rejectedBy = null;

    // Keep inactive until approved by admin again.
    store.isActive = false;
    store.isAcceptingOrders = false;

    // Clear approval fields as a safety measure (should already be null when rejected).
    store.approvedAt = null;
    store.approvedBy = null;

    // Ensure the store remains visible in admin "joining request" pending queue.
    // Some legacy records may not have completedSteps persisted even after onboarding.
    const completedSteps = Number(store?.onboarding?.completedSteps || 0);
    if (!store.onboarding || typeof store.onboarding !== 'object') {
      store.onboarding = {};
    }
    if (!Number.isFinite(completedSteps) || completedSteps < 1) {
      store.onboarding.completedSteps = 1;
    }

    await store.save();

    return successResponse(res, 200, 'Grocery store reverified successfully. Waiting for admin approval.', {
      store: {
        id: store._id.toString(),
        name: store.name,
        isActive: store.isActive,
        rejectionReason: store.rejectionReason
      }
    });
  } catch (error) {
    logger.error(`Error reverifying grocery store: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to reverify grocery store');
  }
});
