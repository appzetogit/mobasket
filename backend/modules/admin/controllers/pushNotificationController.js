import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import AdminPushNotification from '../models/AdminPushNotification.js';
import RestaurantNotification from '../../restaurant/models/RestaurantNotification.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import GroceryStore from '../../grocery/models/GroceryStore.js';
import Delivery from '../../delivery/models/Delivery.js';
import User from '../../auth/models/User.js';
import { initializeFirebaseAdmin, admin } from '../../../shared/services/firebaseAdminService.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';

const normalizePlatform = (value) => {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'mofood' || normalized === 'mogrocery') return normalized;
  return 'all';
};

const getPushLinkForTarget = (sendTo = '') => {
  const normalized = String(sendTo || '').trim();
  if (normalized === 'Restaurant') return '/restaurant';
  if (normalized === 'Store') return '/store';
  if (normalized === 'Delivery') return '/delivery';
  return '/';
};

const getRestaurantRecipients = async (platform) => {
  if (platform === 'mofood') {
    return Restaurant.find({
      $or: [{ platform: 'mofood' }, { platform: { $exists: false } }, { platform: null }, { platform: '' }],
    }).select('_id fcmTokenWeb fcmTokenMobile').lean();
  }

  if (platform === 'mogrocery') {
    return GroceryStore.find({ platform: 'mogrocery' }).select('_id fcmTokenWeb fcmTokenMobile').lean();
  }

  const [restaurants, groceryStores] = await Promise.all([
    Restaurant.find({}).select('_id fcmTokenWeb fcmTokenMobile').lean(),
    GroceryStore.find({}).select('_id fcmTokenWeb fcmTokenMobile').lean(),
  ]);

  return [...restaurants, ...groceryStores];
};

const getCustomerRecipients = async () => {
  return User.find({ role: 'user' }).select('_id fcmTokenWeb fcmTokenMobile').lean();
};

const getDeliveryRecipients = async () => {
  return Delivery.find({}).select('_id fcmTokenWeb fcmTokenMobile').lean();
};

const getTokens = (recipients) => {
  const tokens = new Set();

  for (const recipient of recipients || []) {
    const webToken = typeof recipient?.fcmTokenWeb === 'string' ? recipient.fcmTokenWeb.trim() : '';
    const mobileToken = typeof recipient?.fcmTokenMobile === 'string' ? recipient.fcmTokenMobile.trim() : '';

    if (webToken) tokens.add(webToken);
    if (mobileToken) tokens.add(mobileToken);
  }

  return Array.from(tokens);
};

const getTokenChannelMap = (recipients) => {
  const tokenChannelMap = new Map();

  for (const recipient of recipients || []) {
    const webToken = typeof recipient?.fcmTokenWeb === 'string' ? recipient.fcmTokenWeb.trim() : '';
    const mobileToken = typeof recipient?.fcmTokenMobile === 'string' ? recipient.fcmTokenMobile.trim() : '';

    if (webToken && !tokenChannelMap.has(webToken)) {
      tokenChannelMap.set(webToken, 'web');
    }
    if (mobileToken && !tokenChannelMap.has(mobileToken)) {
      tokenChannelMap.set(mobileToken, 'mobile');
    }
  }

  return tokenChannelMap;
};

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const cleanupInvalidTokens = async (invalidTokens = []) => {
  if (!Array.isArray(invalidTokens) || invalidTokens.length === 0) {
    return { removedCount: 0 };
  }

  const tokenSet = Array.from(new Set(invalidTokens.filter(Boolean)));
  if (tokenSet.length === 0) {
    return { removedCount: 0 };
  }

  await Promise.all([
    User.updateMany(
      { fcmTokenWeb: { $in: tokenSet } },
      { $set: { fcmTokenWeb: '' } }
    ),
    User.updateMany(
      { fcmTokenMobile: { $in: tokenSet } },
      { $set: { fcmTokenMobile: '' } }
    ),
    Restaurant.updateMany(
      { fcmTokenWeb: { $in: tokenSet } },
      { $set: { fcmTokenWeb: '' } }
    ),
    Restaurant.updateMany(
      { fcmTokenMobile: { $in: tokenSet } },
      { $set: { fcmTokenMobile: '' } }
    ),
    GroceryStore.updateMany(
      { fcmTokenWeb: { $in: tokenSet } },
      { $set: { fcmTokenWeb: '' } }
    ),
    GroceryStore.updateMany(
      { fcmTokenMobile: { $in: tokenSet } },
      { $set: { fcmTokenMobile: '' } }
    ),
    Delivery.updateMany(
      { fcmTokenWeb: { $in: tokenSet } },
      { $set: { fcmTokenWeb: '' } }
    ),
    Delivery.updateMany(
      { fcmTokenMobile: { $in: tokenSet } },
      { $set: { fcmTokenMobile: '' } }
    ),
  ]);

  return { removedCount: tokenSet.length };
};

const dispatchFirebasePush = async ({ tokens, title, description, sendTo, zone, platform, pushId, image = '', tokenChannelMap = new Map() }) => {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return {
      initialized: false,
      reason: 'no_tokens',
      attempted: 0,
      successCount: 0,
      failureCount: 0,
    };
  }

  const firebaseState = await initializeFirebaseAdmin();
  if (!firebaseState.initialized) {
    return {
      initialized: false,
      reason: firebaseState.reason || 'firebase_not_initialized',
      attempted: tokens.length,
      successCount: 0,
      failureCount: tokens.length,
    };
  }

  const tokenChunks = chunkArray(tokens, 500);
  let successCount = 0;
  let failureCount = 0;
  let successWebCount = 0;
  let successMobileCount = 0;
  const invalidTokens = [];
  const failureByCode = {};
  const failureSamples = [];
  const transportWarnings = [];
  const messagingClient = admin.messaging(firebaseState.app);
  const resolvedProjectId = String(
    firebaseState?.config?.projectId ||
    firebaseState?.app?.options?.projectId ||
    ''
  ).trim();
  let forceHttpV1Transport = false;
  let hasRecordedFallbackActivation = false;
  let cachedAccessToken = '';
  let cachedAccessTokenExpiresAt = 0;

  const inferFirebaseErrorCodeFromMessage = (message = '') => {
    const text = String(message || '').toLowerCase();
    if (!text) return 'unknown';
    if (text.includes('requested entity was not found') || text.includes('not registered')) {
      return 'messaging/registration-token-not-registered';
    }
    if (text.includes('invalid registration token') || text.includes('invalid argument')) {
      return 'messaging/invalid-registration-token';
    }
    if (text.includes('sender id') && text.includes('mismatch')) {
      return 'messaging/mismatched-credential';
    }
    if (text.includes('authentication') || text.includes('auth error') || text.includes('credential')) {
      return 'messaging/authentication-error';
    }
    if (text.includes('secretorprivatekey') || text.includes('asymmetric key when using rs256')) {
      return 'messaging/authentication-error';
    }
    if (text.includes('quota exceeded')) {
      return 'messaging/quota-exceeded';
    }
    return 'unknown';
  };

  const getFirebaseErrorCode = (errorObj = null) => {
    if (!errorObj) return 'unknown';
    const directCode = typeof errorObj.code === 'string' ? errorObj.code.trim() : '';
    if (directCode) return directCode;

    const nestedCode = typeof errorObj?.errorInfo?.code === 'string' ? errorObj.errorInfo.code.trim() : '';
    if (nestedCode) return nestedCode;

    const jsonCode = typeof errorObj?.toJSON === 'function'
      ? String(errorObj.toJSON?.()?.errorInfo?.code || '').trim()
      : '';
    if (jsonCode) return jsonCode;

    return 'unknown';
  };

  const getFirebaseErrorMessage = (errorObj = null) => {
    if (!errorObj) return '';
    const directMessage = typeof errorObj.message === 'string' ? errorObj.message.trim() : '';
    if (directMessage) return directMessage;

    const nestedMessage = typeof errorObj?.errorInfo?.message === 'string' ? errorObj.errorInfo.message.trim() : '';
    if (nestedMessage) return nestedMessage;

    const jsonMessage = typeof errorObj?.toJSON === 'function'
      ? String(errorObj.toJSON?.()?.errorInfo?.message || '').trim()
      : '';
    if (jsonMessage) return jsonMessage;

    return '';
  };

  const mapHttpV1ErrorCode = ({ detailCode = '', status = '', message = '' } = {}) => {
    const normalizedDetailCode = String(detailCode || '').toUpperCase();
    const normalizedStatus = String(status || '').toUpperCase();
    const text = String(message || '').toLowerCase();

    if (normalizedDetailCode === 'UNREGISTERED') {
      return 'messaging/registration-token-not-registered';
    }
    if (
      normalizedDetailCode === 'INVALID_ARGUMENT' ||
      normalizedStatus === 'INVALID_ARGUMENT' ||
      text.includes('invalid registration token')
    ) {
      return 'messaging/invalid-registration-token';
    }
    if (normalizedStatus === 'UNAUTHENTICATED') {
      return 'messaging/authentication-error';
    }
    if (normalizedStatus === 'PERMISSION_DENIED') {
      return 'messaging/mismatched-credential';
    }
    if (normalizedStatus === 'RESOURCE_EXHAUSTED') {
      return 'messaging/quota-exceeded';
    }
    if (normalizedStatus === 'UNAVAILABLE') {
      return 'messaging/server-unavailable';
    }
    if (normalizedStatus === 'INTERNAL') {
      return 'messaging/internal-error';
    }
    return inferFirebaseErrorCodeFromMessage(message);
  };

  const parseHttpV1Failure = ({ responseStatus = 0, responseBody = null, responseText = '' } = {}) => {
    const details = Array.isArray(responseBody?.error?.details) ? responseBody.error.details : [];
    const fcmDetails = details.find((item) => item && typeof item.errorCode === 'string');
    const detailCode = String(fcmDetails?.errorCode || '').trim();
    const status = String(responseBody?.error?.status || '').trim();
    const message = String(responseBody?.error?.message || responseText || `FCM request failed (${responseStatus})`).trim();
    const code = mapHttpV1ErrorCode({ detailCode, status, message });

    const error = new Error(message || 'FCM request failed');
    error.code = code || 'unknown';
    error.httpStatus = responseStatus;
    return error;
  };

  const getHttpV1AccessToken = async () => {
    const hasUsableCachedToken = cachedAccessToken && Date.now() < (cachedAccessTokenExpiresAt - 60_000);
    if (hasUsableCachedToken) {
      return cachedAccessToken;
    }

    const credential = firebaseState?.app?.options?.credential;
    if (!credential || typeof credential.getAccessToken !== 'function') {
      throw new Error('Firebase credential does not expose getAccessToken');
    }

    const tokenResponse = await Promise.resolve(credential.getAccessToken());
    const accessToken = String(tokenResponse?.access_token || '').trim();
    const expiresInSeconds = Number(tokenResponse?.expires_in || 3600);

    if (!accessToken) {
      throw new Error('Firebase credential returned an empty access token');
    }

    cachedAccessToken = accessToken;
    cachedAccessTokenExpiresAt = Date.now() + (Number.isFinite(expiresInSeconds) ? expiresInSeconds : 3600) * 1000;
    return cachedAccessToken;
  };

  const sendViaHttpV1 = async (messagePayload) => {
    if (!resolvedProjectId) {
      const missingProjectIdError = new Error('Failed to determine project ID for FCM HTTP v1 transport');
      missingProjectIdError.code = 'messaging/invalid-argument';
      throw missingProjectIdError;
    }

    const accessToken = await getHttpV1AccessToken();
    const httpV1Message = toHttpV1Message(messagePayload);

    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${resolvedProjectId}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: httpV1Message }),
    });

    if (response.ok) {
      return;
    }

    let responseBody = null;
    let responseText = '';
    try {
      responseBody = await response.json();
    } catch {
      responseText = String(await response.text());
    }

    throw parseHttpV1Failure({
      responseStatus: response.status,
      responseBody,
      responseText,
    });
  };

  const buildBaseMessage = () => {
    const link = getPushLinkForTarget(sendTo);
    return ({
    notification: {
      title,
      body: description,
      ...(image ? { imageUrl: image } : {}),
    },
    data: {
      source: 'admin_push',
      pushId: String(pushId || ''),
      sendTo: String(sendTo || ''),
      platform: String(platform || ''),
      zone: String(zone || 'All'),
      link,
      click_action: link,
      ...(image ? { image: String(image) } : {}),
    },
    webpush: {
      fcmOptions: {
        link,
      },
      notification: {
        title,
        body: description,
        ...(image ? { image } : {}),
      },
    },
    ...(image ? {
      android: {
        notification: {
          imageUrl: image,
        },
      },
    } : {}),
  });
  };

  const sendChunkIndividually = async (tokenChunk) => {
    const baseMessage = buildBaseMessage();
    const responses = [];

    for (const token of tokenChunk) {
      const messagePayload = {
        ...baseMessage,
        token,
      };

      try {
        if (forceHttpV1Transport) {
          await sendViaHttpV1(messagePayload);
        } else {
          await messagingClient.send(messagePayload);
        }
        responses.push({ success: true });
      } catch (error) {
        const message = getFirebaseErrorMessage(error);
        const hitSdkThenFailure = String(message || '').toLowerCase().includes("reading 'then'");

        if (!forceHttpV1Transport && hitSdkThenFailure) {
          forceHttpV1Transport = true;
          if (!hasRecordedFallbackActivation) {
            hasRecordedFallbackActivation = true;
            transportWarnings.push({
              type: 'sdk_transport_fallback',
              message: 'Firebase Admin SDK messaging transport failed. Switched to FCM HTTP v1 fallback.',
            });
          }

          try {
            await sendViaHttpV1(messagePayload);
            responses.push({ success: true });
            continue;
          } catch (fallbackError) {
            responses.push({ success: false, error: fallbackError });
            continue;
          }
        }

        responses.push({ success: false, error });
      }
    }

    const localSuccessCount = responses.filter((r) => r?.success).length;
    const localFailureCount = responses.length - localSuccessCount;

    return {
      result: {
        responses,
        successCount: localSuccessCount,
        failureCount: localFailureCount,
      },
    };
  };

  for (const tokenChunk of tokenChunks) {
    const { result } = await sendChunkIndividually(tokenChunk);

    successCount += result.successCount || 0;
    failureCount += result.failureCount || 0;

    const responses = Array.isArray(result?.responses) ? result.responses : [];
    responses.forEach((response, index) => {
      const token = tokenChunk[index] || '';
      const channel = tokenChannelMap.get(token) || 'unknown';

      if (response?.success) {
        if (channel === 'web') successWebCount += 1;
        if (channel === 'mobile') successMobileCount += 1;
        return;
      }

      let code = getFirebaseErrorCode(response?.error);
      const message = getFirebaseErrorMessage(response?.error);
      if (!code || code === 'unknown') {
        code = inferFirebaseErrorCodeFromMessage(message);
      }
      if ((code === 'unknown' || !code) && String(message || '').toLowerCase().includes("reading 'then'")) {
        code = 'messaging/internal-error';
        transportWarnings.push({
          type: 'sdk_internal_error',
          message: message || "Cannot read properties of undefined (reading 'then')",
        });
      }
      failureByCode[code] = (failureByCode[code] || 0) + 1;

      const failedToken = token;
      if (!failedToken) return;

      if (failureSamples.length < 5) {
        failureSamples.push({
          code,
          message: message || '',
          tokenSuffix: failedToken.slice(-12),
        });
      }

      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/mismatched-credential'
      ) {
        invalidTokens.push(failedToken);
      }
    });
  }

  const cleanupResult = await cleanupInvalidTokens(invalidTokens);

  if (failureByCode.unknown > 0) {
    // Keep one structured log line so unknown failures can be diagnosed from server logs.
    console.warn('Push dispatch unknown failures detected', {
      unknownCount: failureByCode.unknown,
      failureSamples,
    });
  }

  return {
    engine: forceHttpV1Transport ? 'per_token_v3_httpv1_fallback' : 'per_token_v3',
    initialized: true,
    reason: '',
    attempted: tokens.length,
    successCount,
    successWebCount,
    successMobileCount,
    failureCount,
    failureByCode,
    failureSamples,
    invalidTokenCount: cleanupResult.removedCount || 0,
    transportWarnings,
  };
};

export const getPushNotifications = asyncHandler(async (req, res) => {
  const notifications = await AdminPushNotification.find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return successResponse(res, 200, 'Push notifications fetched successfully', {
    notifications,
  });
});

export const createPushNotification = asyncHandler(async (req, res) => {
  const {
    title = '',
    description = '',
    zone = 'All',
    sendTo = 'Customer',
    platform = 'all',
  } = req.body || {};

  const safeTitle = String(title || '').trim();
  const safeDescription = String(description || '').trim();
  const safeSendTo = String(sendTo || 'Customer').trim();
  const safeZone = String(zone || 'All').trim();
  let safePlatform = normalizePlatform(platform);
  let image = '';

  if (!safeTitle) {
    return errorResponse(res, 400, 'Title is required');
  }

  if (!safeDescription) {
    return errorResponse(res, 400, 'Description is required');
  }

  if (!['Customer', 'All', 'Restaurant', 'Store', 'Delivery'].includes(safeSendTo)) {
    return errorResponse(res, 400, `Unsupported target "${safeSendTo}". Currently supported: Customer, All, Restaurant, Store, Delivery.`);
  }

  if (safeSendTo === 'Customer') {
    safePlatform = 'all';
  } else if (safeSendTo === 'All') {
    safePlatform = 'all';
  } else if (safeSendTo === 'Restaurant') {
    safePlatform = 'mofood';
  } else if (safeSendTo === 'Store') {
    safePlatform = 'mogrocery';
  } else if (safeSendTo === 'Delivery') {
    safePlatform = 'all';
  }

  if (req.file) {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return errorResponse(res, 400, 'Invalid image file type. Allowed: JPEG, PNG, WEBP, GIF');
    }

    if (req.file.size > 2 * 1024 * 1024) {
      return errorResponse(res, 400, 'Image file size exceeds 2MB limit');
    }

    try {
      const uploadResult = await uploadToCloudinary(req.file.buffer, {
        folder: 'mobasket/admin/push',
        resource_type: 'image',
      });
      image = String(uploadResult?.secure_url || '').trim();
    } catch (uploadError) {
      return errorResponse(res, 500, `Failed to upload image: ${uploadError.message}`);
    }
  }

  const pushRecord = await AdminPushNotification.create({
    title: safeTitle,
    description: safeDescription,
    image,
    zone: safeZone || 'All',
    sendTo: safeSendTo,
    platform: safePlatform,
    createdBy: req.admin?._id,
    status: true,
  });

  let customerRecipients = [];
  let businessRecipients = [];
  let deliveryRecipients = [];

  if (safeSendTo === 'Customer') {
    customerRecipients = await getCustomerRecipients();
  } else if (safeSendTo === 'All') {
    const [users, business, delivery] = await Promise.all([
      getCustomerRecipients(),
      getRestaurantRecipients('all'),
      getDeliveryRecipients(),
    ]);
    customerRecipients = users;
    businessRecipients = business;
    deliveryRecipients = delivery;
  } else if (safeSendTo === 'Delivery') {
    deliveryRecipients = await getDeliveryRecipients();
  } else {
    businessRecipients = await getRestaurantRecipients(safePlatform);
  }

  const recipientCount = customerRecipients.length + businessRecipients.length + deliveryRecipients.length;

  if (businessRecipients.length > 0) {
    const docs = businessRecipients.map((recipient) => ({
        restaurant: recipient._id,
        type: 'system',
        title: safeTitle,
        message: safeDescription,
        metadata: {
          source: 'admin_push',
          pushId: pushRecord._id.toString(),
          zone: safeZone || 'All',
          platform: safePlatform,
        },
      }));

    await RestaurantNotification.insertMany(docs, { ordered: false });
  }

  const allRecipients = [...customerRecipients, ...businessRecipients, ...deliveryRecipients];
  const pushTokens = getTokens(allRecipients);
  const tokenChannelMap = getTokenChannelMap(allRecipients);
  const dispatchResult = await dispatchFirebasePush({
    tokens: pushTokens,
    title: safeTitle,
    description: safeDescription,
    sendTo: safeSendTo,
    zone: safeZone || 'All',
    platform: safePlatform,
    pushId: pushRecord._id,
    image,
    tokenChannelMap,
  });

  pushRecord.recipientCount = recipientCount;
  await pushRecord.save();

  return successResponse(res, 201, 'Push notification sent successfully', {
    notification: pushRecord,
    recipientCount,
    pushDelivery: dispatchResult,
  });
});
  const toHttpV1Message = (sdkMessage = {}) => {
    const cloned = JSON.parse(JSON.stringify(sdkMessage || {}));

    // Firebase Admin SDK uses `imageUrl`; FCM HTTP v1 expects `image`.
    if (cloned?.notification?.imageUrl && !cloned.notification.image) {
      cloned.notification.image = cloned.notification.imageUrl;
    }
    if (cloned?.android?.notification?.imageUrl && !cloned.android.notification.image) {
      cloned.android.notification.image = cloned.android.notification.imageUrl;
    }
    if (cloned?.apns?.fcmOptions?.imageUrl && !cloned.apns.fcmOptions.image) {
      cloned.apns.fcmOptions.image = cloned.apns.fcmOptions.imageUrl;
    }
    if (cloned?.webpush?.notification?.imageUrl && !cloned.webpush.notification.image) {
      cloned.webpush.notification.image = cloned.webpush.notification.imageUrl;
    }

    return cloned;
  };
