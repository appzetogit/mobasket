import { initializeFirebaseAdmin, admin } from './firebaseAdminService.js';
import Restaurant from '../../modules/restaurant/models/Restaurant.js';
import GroceryStore from '../../modules/grocery/models/GroceryStore.js';
import Delivery from '../../modules/delivery/models/Delivery.js';

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/mismatched-credential',
]);

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
  source = 'order_notification',
  sendTo = '',
  platform = '',
  zone = '',
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

  const resolvedSource = String(source || 'order_notification').trim() || 'order_notification';
  const resolvedSendTo = String(sendTo || '').trim();
  const resolvedPlatform = String(platform || '').trim();
  const resolvedZone = String(zone || '').trim();
  const resolvedTag = String(tag || 'order_notification').trim() || 'order_notification';
  const resolvedLink = String(link || '/').trim() || '/';

  const payload = {
    notification: {
      title: String(title || 'New Order').trim(),
      body: String(body || '').trim(),
    },
    data: sanitizeDataPayload({
      title: String(title || 'New Order').trim(),
      body: String(body || '').trim(),
      pushId: resolvedTag,
      link: resolvedLink,
      click_action: resolvedLink,
      url: resolvedLink,
      source: resolvedSource,
      ...(resolvedSendTo ? { sendTo: resolvedSendTo } : {}),
      ...(resolvedPlatform ? { platform: resolvedPlatform } : {}),
      ...(resolvedZone ? { zone: resolvedZone } : {}),
      sound: 'alert',
      playSound: 'true',
      vibrate: 'true',
      ...data,
    }),
    android: {
      priority: 'high',
      notification: {
        channelId: 'delivery_order_alerts_alert',
        sound: 'alert',
        defaultSound: true,
        defaultVibrateTimings: true,
        priority: 'max',
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
        link: resolvedLink,
      },
      notification: {
        title: String(title || 'New Order').trim(),
        body: String(body || '').trim(),
        tag: resolvedTag,
        requireInteraction: true,
      },
    },
  };

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = [];
  const failureSamples = [];
  const messaging = admin.messaging(firebaseState.app);

  console.info('Order push notification dispatch starting', {
    source: resolvedSource,
    sendTo: resolvedSendTo,
    platform: resolvedPlatform,
    zone: resolvedZone,
    link: resolvedLink,
    attempted: tokens.length,
    tag: resolvedTag,
    dataKeys: Object.keys(payload.data || {}),
  });

  for (const token of tokens) {
    try {
      await messaging.send({
        ...payload,
        token,
      });
      successCount += 1;
    } catch (error) {
      failureCount += 1;
      const errorCode = String(error?.code || error?.errorInfo?.code || '').trim();
      if (INVALID_TOKEN_CODES.has(errorCode)) {
        invalidTokens.push(token);
      }
      if (failureSamples.length < 5) {
        failureSamples.push({
          tokenPreview: token.length > 12 ? `${token.slice(0, 8)}...${token.slice(-4)}` : token,
          code: errorCode || 'unknown',
          message: String(error?.message || error?.errorInfo?.message || 'Unknown Firebase error'),
        });
      }
    }
  }

  await cleanupInvalidTokens(invalidTokens, cleanupModels);

  console.info('Order push notification dispatch completed', {
    source: resolvedSource,
    sendTo: resolvedSendTo,
    platform: resolvedPlatform,
    zone: resolvedZone,
    attempted: tokens.length,
    successCount,
    failureCount,
    invalidTokenCount: invalidTokens.length,
    failureSamples,
  });

  return {
    initialized: true,
    attempted: tokens.length,
    successCount,
    failureCount,
    invalidTokenCount: invalidTokens.length,
    failureSamples,
  };
}
