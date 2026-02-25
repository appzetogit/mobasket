import { admin, initializeFirebaseAdmin, getFirebaseAdminApp } from './firebaseAdminService.js';

let realtimeDb = null;
let realtimeEnabled = false;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function initializeFirebaseRealtime({ allowDbLookup = true } = {}) {
  const init = await initializeFirebaseAdmin({ allowDbLookup });
  if (!init.initialized || !init.app) {
    realtimeEnabled = false;
    return {
      initialized: false,
      reason: init.reason || 'firebase_admin_not_initialized'
    };
  }

  const app = getFirebaseAdminApp();
  const databaseURL = init.config?.databaseURL || app?.options?.databaseURL || '';
  if (!databaseURL) {
    realtimeEnabled = false;
    return {
      initialized: false,
      reason: 'missing_database_url'
    };
  }

  try {
    realtimeDb = admin.database(app);
    realtimeEnabled = true;
    return { initialized: true };
  } catch (error) {
    realtimeEnabled = false;
    return { initialized: false, reason: error.message };
  }
}

export function isFirebaseRealtimeEnabled() {
  return realtimeEnabled && !!realtimeDb;
}

export function getFirebaseRealtimeDb() {
  return realtimeDb;
}

function nowEpochMs() {
  return Date.now();
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function roundTo(value, digits = 3) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return null;
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
}

function normalizeActiveOrderPayload(payload = {}) {
  const normalized = {};

  if (payload.boy_id) normalized.boy_id = String(payload.boy_id);
  const boyLat = toNumber(payload.boy_lat ?? payload.lat);
  const boyLng = toNumber(payload.boy_lng ?? payload.lng);
  if (Number.isFinite(boyLat)) normalized.boy_lat = boyLat;
  if (Number.isFinite(boyLng)) normalized.boy_lng = boyLng;

  const restaurantLat = toNumber(
    payload.restaurant_lat ??
    payload.restaurant?.lat
  );
  const restaurantLng = toNumber(
    payload.restaurant_lng ??
    payload.restaurant?.lng
  );
  const customerLat = toNumber(
    payload.customer_lat ??
    payload.customer?.lat
  );
  const customerLng = toNumber(
    payload.customer_lng ??
    payload.customer?.lng
  );

  if (Number.isFinite(restaurantLat)) normalized.restaurant_lat = restaurantLat;
  if (Number.isFinite(restaurantLng)) normalized.restaurant_lng = restaurantLng;
  if (Number.isFinite(customerLat)) normalized.customer_lat = customerLat;
  if (Number.isFinite(customerLng)) normalized.customer_lng = customerLng;

  const distanceKm = toNumber(
    payload.distance ??
    (toNumber(payload.total_distance_m) != null ? Number(payload.total_distance_m) / 1000 : null)
  );
  if (Number.isFinite(distanceKm)) normalized.distance = roundTo(distanceKm, 3);

  const durationMinutes = toNumber(
    payload.duration ??
    (toNumber(payload.duration_s) != null ? Number(payload.duration_s) / 60 : null)
  );
  if (Number.isFinite(durationMinutes)) normalized.duration = roundTo(durationMinutes, 3);

  if (typeof payload.polyline === 'string' && payload.polyline.trim()) {
    normalized.polyline = payload.polyline.trim();
  }
  if (payload.status) normalized.status = String(payload.status);

  const createdAt = toNumber(payload.created_at);
  if (Number.isFinite(createdAt)) normalized.created_at = createdAt;

  return normalized;
}

export async function upsertDeliveryPartnerPresence({
  deliveryPartnerId,
  isOnline,
  status = null,
  lat = null,
  lng = null,
  zones = []
}) {
  if (!isFirebaseRealtimeEnabled() || !deliveryPartnerId) return false;

  const normalizedStatus = status || (isOnline ? 'online' : 'offline');
  const payload = {
    status: normalizedStatus,
    last_updated: nowEpochMs()
  };

  if (isFiniteNumber(lat) && isFiniteNumber(lng)) {
    payload.lat = lat;
    payload.lng = lng;
  }

  await realtimeDb.ref(`delivery_boys/${deliveryPartnerId}`).update(payload);
  return true;
}

export async function upsertActiveOrderTracking(orderId, payload = {}) {
  if (!isFirebaseRealtimeEnabled() || !orderId) return false;
  const normalizedPayload = normalizeActiveOrderPayload(payload);
  const enrichedPayload = {
    ...normalizedPayload,
    last_updated: nowEpochMs()
  };
  await realtimeDb.ref(`active_orders/${orderId}`).update(enrichedPayload);
  return true;
}

export async function updateActiveOrderLocation(orderId, location = {}) {
  if (!isFirebaseRealtimeEnabled() || !orderId) return false;
  const payload = {
    last_updated: nowEpochMs()
  };

  if (isFiniteNumber(location.lat)) payload.boy_lat = location.lat;
  if (isFiniteNumber(location.lng)) payload.boy_lng = location.lng;
  if (isFiniteNumber(location.bearing)) payload.bearing = location.bearing;
  if (isFiniteNumber(location.speed)) payload.speed = location.speed;
  if (isFiniteNumber(location.progress)) payload.progress = location.progress;
  if (location.phase) payload.status = location.phase;
  if (location.boy_id) payload.boy_id = String(location.boy_id);

  await realtimeDb.ref(`active_orders/${orderId}`).update(payload);
  return true;
}

export function buildRouteCacheKey(start = {}, end = {}) {
  const roundCoord = (value) => {
    const num = toNumber(value);
    if (!Number.isFinite(num)) return '0';
    return String(roundTo(num, 4)).replace('.', '_');
  };

  const startLat = roundCoord(start.lat);
  const startLng = roundCoord(start.lng);
  const endLat = roundCoord(end.lat);
  const endLng = roundCoord(end.lng);
  return `${startLat}_${startLng}_${endLat}_${endLng}`;
}

export async function upsertRouteCache(routeKey, payload = {}) {
  if (!isFirebaseRealtimeEnabled() || !routeKey) return false;

  const distanceKm = toNumber(
    payload.distance ??
    (toNumber(payload.total_distance_m) != null ? Number(payload.total_distance_m) / 1000 : null)
  );
  const durationMinutes = toNumber(
    payload.duration ??
    (toNumber(payload.duration_s) != null ? Number(payload.duration_s) / 60 : null)
  );
  const cachePayload = {
    cached_at: nowEpochMs(),
    expires_at: nowEpochMs() + 7 * 24 * 60 * 60 * 1000 // 7 days
  };

  if (Number.isFinite(distanceKm)) cachePayload.distance = roundTo(distanceKm, 3);
  if (Number.isFinite(durationMinutes)) cachePayload.duration = roundTo(durationMinutes, 3);
  if (typeof payload.polyline === 'string' && payload.polyline.trim()) cachePayload.polyline = payload.polyline.trim();

  await realtimeDb.ref(`route_cache/${routeKey}`).update(cachePayload);
  return true;
}

export async function removeActiveOrderTracking(orderId) {
  if (!isFirebaseRealtimeEnabled() || !orderId) return false;
  await realtimeDb.ref(`active_orders/${orderId}`).remove();
  return true;
}

export async function findNearestOnlineDeliveryPartnersFromFirebase({
  restaurantLat,
  restaurantLng,
  maxDistanceKm = 10,
  limit = 20
}) {
  if (!isFirebaseRealtimeEnabled()) return [];
  if (!isFiniteNumber(restaurantLat) || !isFiniteNumber(restaurantLng)) return [];

  const snapshot = await realtimeDb
    .ref('delivery_boys')
    .orderByChild('status')
    .equalTo('online')
    .once('value');

  const data = snapshot.val() || {};
  const ranked = Object.entries(data)
    .map(([deliveryPartnerId, value]) => {
      const lat = Number(value?.lat);
      const lng = Number(value?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const distanceKm = haversineKm(restaurantLat, restaurantLng, lat, lng);
      if (distanceKm > maxDistanceKm) return null;

      return {
        deliveryPartnerId,
        distanceKm,
        lat,
        lng,
        status: value?.status || 'online',
        lastUpdated: value?.last_updated || 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, Math.max(1, limit));

  return ranked;
}
