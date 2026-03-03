import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import AdminPushNotification from '../models/AdminPushNotification.js';
import RestaurantNotification from '../../restaurant/models/RestaurantNotification.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import GroceryStore from '../../grocery/models/GroceryStore.js';

const normalizePlatform = (value) => {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'mofood' || normalized === 'mogrocery') return normalized;
  return 'all';
};

const getRestaurantRecipients = async (platform) => {
  if (platform === 'mofood') {
    return Restaurant.find({
      $or: [{ platform: 'mofood' }, { platform: { $exists: false } }, { platform: null }, { platform: '' }],
    }).select('_id').lean();
  }

  if (platform === 'mogrocery') {
    return GroceryStore.find({ platform: 'mogrocery' }).select('_id').lean();
  }

  const [restaurants, groceryStores] = await Promise.all([
    Restaurant.find({}).select('_id').lean(),
    GroceryStore.find({}).select('_id').lean(),
  ]);

  return [...restaurants, ...groceryStores];
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
    sendTo = 'Restaurant',
    platform = 'all',
  } = req.body || {};

  const safeTitle = String(title || '').trim();
  const safeDescription = String(description || '').trim();
  const safeSendTo = String(sendTo || 'Restaurant').trim();
  const safeZone = String(zone || 'All').trim();
  const safePlatform = normalizePlatform(platform);

  if (!safeTitle) {
    return errorResponse(res, 400, 'Title is required');
  }

  if (!safeDescription) {
    return errorResponse(res, 400, 'Description is required');
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

  let recipientCount = 0;
  if (safeSendTo === 'Restaurant') {
    const recipients = await getRestaurantRecipients(safePlatform);
    recipientCount = recipients.length;

    if (recipientCount > 0) {
      const docs = recipients.map((recipient) => ({
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
  }

  pushRecord.recipientCount = recipientCount;
  await pushRecord.save();

  return successResponse(res, 201, 'Push notification sent successfully', {
    notification: pushRecord,
    recipientCount,
  });
});
