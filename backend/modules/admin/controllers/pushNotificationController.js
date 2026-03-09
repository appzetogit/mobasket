import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import AdminPushNotification from '../models/AdminPushNotification.js';
import RestaurantNotification from '../../restaurant/models/RestaurantNotification.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import GroceryStore from '../../grocery/models/GroceryStore.js';
import User from '../../auth/models/User.js';
import { initializeFirebaseAdmin, admin } from '../../../shared/services/firebaseAdminService.js';

const normalizePlatform = (value) => {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'mofood' || normalized === 'mogrocery') return normalized;
  return 'all';
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

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const dispatchFirebasePush = async ({ tokens, title, description, sendTo, zone, platform, pushId }) => {
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

  for (const tokenChunk of tokenChunks) {
    const result = await admin.messaging().sendEachForMulticast({
      tokens: tokenChunk,
      notification: {
        title,
        body: description,
      },
      data: {
        source: 'admin_push',
        pushId: String(pushId || ''),
        sendTo: String(sendTo || ''),
        platform: String(platform || ''),
        zone: String(zone || 'All'),
      },
      webpush: {
        notification: {
          title,
          body: description,
        },
      },
    });

    successCount += result.successCount || 0;
    failureCount += result.failureCount || 0;
  }

  return {
    initialized: true,
    reason: '',
    attempted: tokens.length,
    successCount,
    failureCount,
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

  if (!safeTitle) {
    return errorResponse(res, 400, 'Title is required');
  }

  if (!safeDescription) {
    return errorResponse(res, 400, 'Description is required');
  }

  if (!['Customer', 'All', 'Restaurant', 'Store'].includes(safeSendTo)) {
    return errorResponse(res, 400, `Unsupported target "${safeSendTo}". Currently supported: Customer, All, Restaurant, Store.`);
  }

  if (safeSendTo === 'Customer') {
    safePlatform = 'all';
  } else if (safeSendTo === 'All') {
    safePlatform = 'all';
  } else if (safeSendTo === 'Restaurant') {
    safePlatform = 'mofood';
  } else if (safeSendTo === 'Store') {
    safePlatform = 'mogrocery';
  }

  const pushRecord = await AdminPushNotification.create({
    title: safeTitle,
    description: safeDescription,
    zone: safeZone || 'All',
    sendTo: safeSendTo,
    platform: safePlatform,
    createdBy: req.admin?._id,
    status: true,
  });

  let customerRecipients = [];
  let businessRecipients = [];

  if (safeSendTo === 'Customer') {
    customerRecipients = await getCustomerRecipients();
  } else if (safeSendTo === 'All') {
    const [users, business] = await Promise.all([
      getCustomerRecipients(),
      getRestaurantRecipients('all'),
    ]);
    customerRecipients = users;
    businessRecipients = business;
  } else {
    businessRecipients = await getRestaurantRecipients(safePlatform);
  }

  const recipientCount = customerRecipients.length + businessRecipients.length;

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

  const pushTokens = getTokens([...customerRecipients, ...businessRecipients]);
  const dispatchResult = await dispatchFirebasePush({
    tokens: pushTokens,
    title: safeTitle,
    description: safeDescription,
    sendTo: safeSendTo,
    zone: safeZone || 'All',
    platform: safePlatform,
    pushId: pushRecord._id,
  });

  pushRecord.recipientCount = recipientCount;
  await pushRecord.save();

  return successResponse(res, 201, 'Push notification sent successfully', {
    notification: pushRecord,
    recipientCount,
    pushDelivery: dispatchResult,
  });
});
