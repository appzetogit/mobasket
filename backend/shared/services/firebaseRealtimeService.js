import { admin, initializeFirebaseAdmin, getFirebaseAdminApp } from './firebaseAdminService.js';

let realtimeDb = null;
let realtimeEnabled = false;

// In-memory write guards to reduce Firebase RTDB write amplification.
// These caches are process-local and safely rebuilt on restart.
const presenceWriteCache = new Map(); // deliveryPartnerId -> { timestamp, status, lat, lng }
const activeOrderTrackingWriteCache = new Map(); // orderId -> { timestamp, signature }
const activeOrderLocationWriteCache = new Map(); // orderId -> { timestamp, lat, lng, bearing, speed, progress, status, boy_id }
const routeCacheWriteCache = new Map(); // routeKey -> { timestamp, signature }

const PRESENCE_MIN_WRITE_INTERVAL_MS = 4000;
const PRESENCE_MIN_DISTANCE_M = 15;
const ACTIVE_ORDER_TRACKING_MIN_WRITE_INTERVAL_MS = 10000;
const ACTIVE_ORDER_LOCATION_MIN_WRITE_INTERVAL_MS = 1500;
const ACTIVE_ORDER_LOCATION_MIN_DISTANCE_M = 8;
const ROUTE_CACHE_MIN_WRITE_INTERVAL_MS = 300000; // 5 minutes
const NEAREST_ONLINE_MAX_AGE_MS = 180000; // 3 minutes
const CACHE_MAX_ENTRIES = 10000;

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

function haversineMeters(lat1, lng1, lat2, lng2) {
  return haversineKm(lat1, lng1, lat2, lng2) * 1000;
}

function pruneOldestEntries(mapRef, maxSize = CACHE_MAX_ENTRIES) {
  if (mapRef.size <= maxSize) return;
  const overflow = mapRef.size - maxSize;
  let removed = 0;
  for (const key of mapRef.keys()) {
    mapRef.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
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

export function resetFirebaseRealtimeState() {
  realtimeDb = null;
  realtimeEnabled = false;
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
  const now = nowEpochMs();
  const hasCoords = isFiniteNumber(lat) && isFiniteNumber(lng);
  const cacheKey = String(deliveryPartnerId);
  const previous = presenceWriteCache.get(cacheKey);

  if (previous) {
    const statusChanged = previous.status !== normalizedStatus;
    const withinInterval = (now - previous.timestamp) < PRESENCE_MIN_WRITE_INTERVAL_MS;
    let movedEnough = false;

    if (hasCoords && isFiniteNumber(previous.lat) && isFiniteNumber(previous.lng)) {
      movedEnough = haversineMeters(previous.lat, previous.lng, lat, lng) >= PRESENCE_MIN_DISTANCE_M;
    } else if (hasCoords && (!isFiniteNumber(previous.lat) || !isFiniteNumber(previous.lng))) {
      movedEnough = true;
    }

    if (!statusChanged && withinInterval && !movedEnough) {
      return true;
    }
  }

  const payload = {
    status: normalizedStatus,
    last_updated: now
  };

  const normalizedZones = Array.isArray(zones)
    ? zones
        .map((zoneValue) => {
          if (!zoneValue) return null;
          if (typeof zoneValue === 'string') return zoneValue.trim();
          if (typeof zoneValue === 'object') return String(zoneValue._id || zoneValue.id || '').trim();
          return String(zoneValue).trim();
        })
        .filter(Boolean)
    : [];
  if (normalizedZones.length > 0) {
    payload.zones = normalizedZones;
  }

  if (hasCoords) {
    payload.lat = lat;
    payload.lng = lng;
  }

  await realtimeDb.ref(`delivery_boys/${cacheKey}`).update(payload);
  presenceWriteCache.set(cacheKey, {
    timestamp: now,
    status: normalizedStatus,
    lat: hasCoords ? lat : previous?.lat ?? null,
    lng: hasCoords ? lng : previous?.lng ?? null
  });
  pruneOldestEntries(presenceWriteCache);
  return true;
}

export async function upsertActiveOrderTracking(orderId, payload = {}) {
  if (!isFirebaseRealtimeEnabled() || !orderId) return false;
  const cacheKey = String(orderId);
  const now = nowEpochMs();
  const normalizedPayload = normalizeActiveOrderPayload(payload);
  const signature = stableStringify(normalizedPayload);
  const previous = activeOrderTrackingWriteCache.get(cacheKey);
  if (
    previous &&
    previous.signature === signature &&
    (now - previous.timestamp) < ACTIVE_ORDER_TRACKING_MIN_WRITE_INTERVAL_MS
  ) {
    return true;
  }

  const enrichedPayload = {
    ...normalizedPayload,
    last_updated: now
  };
  await realtimeDb.ref(`active_orders/${cacheKey}`).update(enrichedPayload);
  activeOrderTrackingWriteCache.set(cacheKey, { timestamp: now, signature });
  pruneOldestEntries(activeOrderTrackingWriteCache);
  return true;
}

export async function updateActiveOrderLocation(orderId, location = {}) {
  if (!isFirebaseRealtimeEnabled() || !orderId) return false;
  const cacheKey = String(orderId);
  const now = nowEpochMs();
  const payload = {
    last_updated: now
  };

  if (isFiniteNumber(location.lat)) payload.boy_lat = location.lat;
  if (isFiniteNumber(location.lng)) payload.boy_lng = location.lng;
  if (isFiniteNumber(location.bearing)) payload.bearing = location.bearing;
  if (isFiniteNumber(location.speed)) payload.speed = location.speed;
  if (isFiniteNumber(location.progress)) payload.progress = location.progress;
  if (isFiniteNumber(location.remainingDistance)) payload.remaining_distance = location.remainingDistance;
  if (typeof location.polyline === 'string') payload.polyline = location.polyline.trim();
  if (location.phase) payload.status = location.phase;
  if (location.boy_id) payload.boy_id = String(location.boy_id);

  const previous = activeOrderLocationWriteCache.get(cacheKey);
  if (previous) {
    const withinInterval = (now - previous.timestamp) < ACTIVE_ORDER_LOCATION_MIN_WRITE_INTERVAL_MS;

    const prevHasCoords = isFiniteNumber(previous.lat) && isFiniteNumber(previous.lng);
    const nextHasCoords = isFiniteNumber(payload.boy_lat) && isFiniteNumber(payload.boy_lng);

    let movedEnough = false;
    if (prevHasCoords && nextHasCoords) {
      movedEnough = haversineMeters(previous.lat, previous.lng, payload.boy_lat, payload.boy_lng) >= ACTIVE_ORDER_LOCATION_MIN_DISTANCE_M;
    } else if (!prevHasCoords && nextHasCoords) {
      movedEnough = true;
    }

    const headingChanged = isFiniteNumber(payload.bearing) && Math.abs((payload.bearing ?? 0) - (previous.bearing ?? 0)) >= 12;
    const speedChanged = isFiniteNumber(payload.speed) && Math.abs((payload.speed ?? 0) - (previous.speed ?? 0)) >= 2;
    const progressChanged = isFiniteNumber(payload.progress) && Math.abs((payload.progress ?? 0) - (previous.progress ?? 0)) >= 0.01;
    const remainingDistanceChanged = isFiniteNumber(payload.remaining_distance) && Math.abs((payload.remaining_distance ?? 0) - (previous.remaining_distance ?? 0)) >= 10;
    const statusChanged = typeof payload.status === 'string' && payload.status !== previous.status;
    const riderChanged = typeof payload.boy_id === 'string' && payload.boy_id !== previous.boy_id;
    const polylineChanged = typeof payload.polyline === 'string' && payload.polyline !== (previous.polyline || '');

    if (withinInterval && !movedEnough && !headingChanged && !speedChanged && !progressChanged && !remainingDistanceChanged && !statusChanged && !riderChanged && !polylineChanged) {
      return true;
    }
  }

  await realtimeDb.ref(`active_orders/${cacheKey}`).update(payload);
  activeOrderLocationWriteCache.set(cacheKey, {
    timestamp: now,
    lat: isFiniteNumber(payload.boy_lat) ? payload.boy_lat : previous?.lat ?? null,
    lng: isFiniteNumber(payload.boy_lng) ? payload.boy_lng : previous?.lng ?? null,
    bearing: isFiniteNumber(payload.bearing) ? payload.bearing : previous?.bearing ?? null,
    speed: isFiniteNumber(payload.speed) ? payload.speed : previous?.speed ?? null,
    progress: isFiniteNumber(payload.progress) ? payload.progress : previous?.progress ?? null,
    remaining_distance: isFiniteNumber(payload.remaining_distance) ? payload.remaining_distance : previous?.remaining_distance ?? null,
    polyline: typeof payload.polyline === 'string' ? payload.polyline : previous?.polyline ?? '',
    status: payload.status || previous?.status || null,
    boy_id: payload.boy_id || previous?.boy_id || null
  });
  pruneOldestEntries(activeOrderLocationWriteCache);
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
  const cacheKey = String(routeKey);
  const now = nowEpochMs();

  const distanceKm = toNumber(
    payload.distance ??
    (toNumber(payload.total_distance_m) != null ? Number(payload.total_distance_m) / 1000 : null)
  );
  const durationMinutes = toNumber(
    payload.duration ??
    (toNumber(payload.duration_s) != null ? Number(payload.duration_s) / 60 : null)
  );
  const cachePayload = {
    cached_at: now,
    expires_at: now + 7 * 24 * 60 * 60 * 1000 // 7 days
  };

  if (Number.isFinite(distanceKm)) cachePayload.distance = roundTo(distanceKm, 3);
  if (Number.isFinite(durationMinutes)) cachePayload.duration = roundTo(durationMinutes, 3);
  if (typeof payload.polyline === 'string' && payload.polyline.trim()) cachePayload.polyline = payload.polyline.trim();

  const signature = stableStringify({
    distance: cachePayload.distance ?? null,
    duration: cachePayload.duration ?? null,
    polyline: cachePayload.polyline ?? null
  });
  const previous = routeCacheWriteCache.get(cacheKey);
  if (
    previous &&
    previous.signature === signature &&
    (now - previous.timestamp) < ROUTE_CACHE_MIN_WRITE_INTERVAL_MS
  ) {
    return true;
  }

  await realtimeDb.ref(`route_cache/${cacheKey}`).update(cachePayload);
  routeCacheWriteCache.set(cacheKey, { timestamp: now, signature });
  pruneOldestEntries(routeCacheWriteCache);
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
  limit = 20,
  maxLastUpdatedAgeMs = NEAREST_ONLINE_MAX_AGE_MS
}) {
  if (!isFirebaseRealtimeEnabled()) return [];
  if (!isFiniteNumber(restaurantLat) || !isFiniteNumber(restaurantLng)) return [];

  const snapshot = await realtimeDb
    .ref('delivery_boys')
    .orderByChild('status')
    .equalTo('online')
    .once('value');

  const data = snapshot.val() || {};
  const now = nowEpochMs();
  const ranked = Object.entries(data)
    .map(([deliveryPartnerId, value]) => {
      const lat = Number(value?.lat);
      const lng = Number(value?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const lastUpdated = Number(value?.last_updated || 0);
      if (maxLastUpdatedAgeMs > 0 && (!Number.isFinite(lastUpdated) || (now - lastUpdated) > maxLastUpdatedAgeMs)) {
        return null;
      }

      const distanceKm = haversineKm(restaurantLat, restaurantLng, lat, lng);
      if (distanceKm > maxDistanceKm) return null;

      return {
        deliveryPartnerId,
        distanceKm,
        lat,
        lng,
        status: value?.status || 'online',
        lastUpdated: Number.isFinite(lastUpdated) ? lastUpdated : 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, Math.max(1, limit));

  return ranked;
}
