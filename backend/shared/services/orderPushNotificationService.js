import { initializeFirebaseAdmin, admin } from './firebaseAdminService.js';
import Restaurant from '../../modules/restaurant/models/Restaurant.js';
import GroceryStore from '../../modules/grocery/models/GroceryStore.js';
import Delivery from '../../modules/delivery/models/Delivery.js';

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/mismatched-credential',
]);

const chunkArray = (items = [], size = 500) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const normalizeToken = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const collectRecipientTokens = (recipients = []) => {
  const tokenSet = new Set();

  for (const recipient of recipients) {
    const webToken = normalizeToken(recipient?.fcmTokenWeb);
    const mobileToken = normalizeToken(recipient?.fcmTokenMobile);

    if (webToken) tokenSet.add(webToken);
    if (mobileToken) tokenSet.add(mobileToken);
  }

  return Array.from(tokenSet);
};

const sanitizeDataPayload = (payload = {}) => {
  const entries = Object.entries(payload || {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]);

  return Object.fromEntries(entries);
};

const cleanupInvalidTokens = async (invalidTokens = [], cleanupModels = []) => {
  const tokenSet = Array.from(new Set(invalidTokens.map(normalizeToken).filter(Boolean)));
  if (tokenSet.length === 0 || !Array.isArray(cleanupModels) || cleanupModels.length === 0) {
    return;
  }

  await Promise.all(
    cleanupModels.flatMap((Model) => [
      Model.updateMany({ fcmTokenWeb: { $in: tokenSet } }, { $set: { fcmTokenWeb: '' } }),
      Model.updateMany({ fcmTokenMobile: { $in: tokenSet } }, { $set: { fcmTokenMobile: '' } }),
    ])
  );
};

export const pushCleanupModels = {
  restaurant: [Restaurant],
  store: [GroceryStore],
  delivery: [Delivery],
  restaurantAndStore: [Restaurant, GroceryStore],
};

export async function sendOrderPushNotification({
  recipients = [],
  title,
  body,
  link = '/',
  data = {},
  tag = 'order_notification',
  cleanupModels = [],
}) {
  const normalizedRecipients = Array.isArray(recipients) ? recipients.filter(Boolean) : [recipients].filter(Boolean);
  const tokens = collectRecipientTokens(normalizedRecipients);

  if (tokens.length === 0) {
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

  const payload = {
    notification: {
      title: String(title || 'New Order').trim(),
      body: String(body || '').trim(),
    },
    data: sanitizeDataPayload({
      title: String(title || 'New Order').trim(),
      body: String(body || '').trim(),
      link: String(link || '/').trim(),
      click_action: String(link || '/').trim(),
      source: 'order_notification',
      ...data,
    }),
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'orders',
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
      },
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
    webpush: {
      headers: {
        Urgency: 'high',
      },
      fcmOptions: {
        link: String(link || '/').trim(),
      },
      notification: {
        title: String(title || 'New Order').trim(),
        body: String(body || '').trim(),
        tag: String(tag || 'order_notification').trim(),
        requireInteraction: true,
      },
    },
  };

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = [];
  const messaging = admin.messaging(firebaseState.app);

  for (const tokenChunk of chunkArray(tokens, 500)) {
    const response = await messaging.sendEachForMulticast({
      ...payload,
      tokens: tokenChunk,
    });

    successCount += Number(response?.successCount || 0);
    failureCount += Number(response?.failureCount || 0);

    response.responses?.forEach((item, index) => {
      if (item?.success) return;
      const errorCode = String(item?.error?.code || item?.error?.errorInfo?.code || '').trim();
      if (INVALID_TOKEN_CODES.has(errorCode)) {
        invalidTokens.push(tokenChunk[index]);
      }
    });
  }

  await cleanupInvalidTokens(invalidTokens, cleanupModels);

  return {
    initialized: true,
    attempted: tokens.length,
    successCount,
    failureCount,
    invalidTokenCount: invalidTokens.length,
  };
}
