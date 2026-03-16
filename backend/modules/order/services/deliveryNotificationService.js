import Order from '../models/Order.js';
import Delivery from '../../delivery/models/Delivery.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import GroceryStore from '../../grocery/models/GroceryStore.js';
import Zone from '../../admin/models/Zone.js';
import {
  isDeliveryEligibleForOrders
} from '../../delivery/utils/deliveryEligibility.js';
import mongoose from 'mongoose';
import { calculateDriverEarning } from './deliveryEarningService.js';
import {
  pushCleanupModels,
  sendOrderPushNotification,
} from '../../../shared/services/orderPushNotificationService.js';

const normalizeStoreIdentifier = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return String(value?._id || value?.restaurantId || value?.id || '').trim();
  }
  return String(value).trim();
};

const hasValidCoords = (entity) =>
  Array.isArray(entity?.location?.coordinates) &&
  entity.location.coordinates.length >= 2 &&
  Number.isFinite(Number(entity.location.coordinates[0])) &&
  Number.isFinite(Number(entity.location.coordinates[1]));

const hasAddressDetails = (entity) =>
  Boolean(
    String(
      entity?.location?.formattedAddress ||
      entity?.location?.address ||
      entity?.address ||
      ''
    ).trim()
  );

const pickBestStoreDetails = (...candidates) =>
  candidates
    .filter(Boolean)
    .sort((a, b) => {
      const score = (entity) =>
        (hasValidCoords(entity) ? 2 : 0) +
        (hasAddressDetails(entity) ? 1 : 0) +
        (entity?.name ? 1 : 0);
      return score(b) - score(a);
    })[0] || null;

const fetchStoreByIdentifier = async (identifier) => {
  if (!identifier) return null;

  const byId = mongoose.Types.ObjectId.isValid(identifier)
    ? [
        Restaurant.findById(identifier).lean(),
        GroceryStore.findById(identifier).lean()
      ]
    : [Promise.resolve(null), Promise.resolve(null)];

  const [restaurantById, groceryById] = await Promise.all(byId);
  if (restaurantById || groceryById) {
    return pickBestStoreDetails(groceryById, restaurantById);
  }

  const [restaurantByAlt, groceryByAlt] = await Promise.all([
    Restaurant.findOne({
      $or: [{ restaurantId: identifier }, { slug: identifier }]
    }).lean(),
    GroceryStore.findOne({
      $or: [{ restaurantId: identifier }, { slug: identifier }]
    }).lean()
  ]);

  return pickBestStoreDetails(groceryByAlt, restaurantByAlt);
};

const getPlatformZoneFilter = (platform = 'mofood') =>
  platform === 'mogrocery'
    ? { platform: 'mogrocery' }
    : { $or: [{ platform: 'mofood' }, { platform: { $exists: false } }] };

const normalizeZoneId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'object') {
    const candidate = value._id || value.id || value.zoneId || value.zone;
    if (!candidate) return null;
    return String(candidate).trim() || null;
  }
  if (typeof value.toString === 'function') {
    const stringified = value.toString().trim();
    return stringified || null;
  }
  return String(value).trim() || null;
};

const normalizeDeliveryPartnerZoneIds = (rawZones = []) => {
  if (!Array.isArray(rawZones)) return [];
  return rawZones
    .map((zoneValue) => normalizeZoneId(zoneValue))
    .filter(Boolean);
};

const getDeliveryPartnerCoordinates = (deliveryPartner = null) => {
  const coordinates = deliveryPartner?.availability?.currentLocation?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lng, lat] = coordinates;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return { lat: Number(lat), lng: Number(lng) };
};

const isPointInZoneBoundary = (lat, lng, zoneCoordinates = []) => {
  if (!Array.isArray(zoneCoordinates) || zoneCoordinates.length < 3) return false;
  let inside = false;

  for (let i = 0, j = zoneCoordinates.length - 1; i < zoneCoordinates.length; j = i++) {
    const xi = zoneCoordinates[i]?.longitude;
    const yi = zoneCoordinates[i]?.latitude;
    const xj = zoneCoordinates[j]?.longitude;
    const yj = zoneCoordinates[j]?.latitude;

    if (
      !Number.isFinite(xi) ||
      !Number.isFinite(yi) ||
      !Number.isFinite(xj) ||
      !Number.isFinite(yj)
    ) {
      continue;
    }

    const intersect =
      ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
};

const isDeliveryPartnerZoneEligible = (deliveryPartner, zoneContext = {}) => {
  const { requiredZoneId = null, requiredZone = null, activeZones = [] } = zoneContext;
  if (!deliveryPartner) return false;

  const partnerZoneIds = normalizeDeliveryPartnerZoneIds(deliveryPartner.availability?.zones);
  const partnerCoords = getDeliveryPartnerCoordinates(deliveryPartner);

  if (requiredZoneId) {
    if (!requiredZone) return false;
    if (partnerZoneIds.length > 0) {
      return partnerZoneIds.includes(String(requiredZoneId));
    }
    if (!partnerCoords) return false;
    return isPointInZoneBoundary(partnerCoords.lat, partnerCoords.lng, requiredZone.coordinates);
  }

  if (!Array.isArray(activeZones) || activeZones.length === 0) {
    return true;
  }

  const activeZoneIds = new Set(
    activeZones.map((zone) => normalizeZoneId(zone?._id)).filter(Boolean)
  );

  if (partnerZoneIds.length > 0) {
    return partnerZoneIds.some((zoneId) => activeZoneIds.has(zoneId));
  }

  if (!partnerCoords) return false;
  return activeZones.some((zone) =>
    isPointInZoneBoundary(partnerCoords.lat, partnerCoords.lng, zone.coordinates)
  );
};

const resolveRequiredZoneForOrder = async ({ order, store = null, platform = 'mofood' }) => {
  const platformFilter = getPlatformZoneFilter(platform);
  const activeZones = await Zone.find({ isActive: true, ...platformFilter })
    .select('_id coordinates')
    .lean();

  const assignmentZoneId = normalizeZoneId(order?.assignmentInfo?.zoneId);
  const storeZoneId = normalizeZoneId(
    store?.zoneId?._id ||
      store?.zoneId?.id ||
      store?.zoneId ||
      null
  );
  const requiredZoneId = assignmentZoneId || storeZoneId || null;

  if (requiredZoneId) {
    const requiredZone =
      activeZones.find((zone) => String(zone._id) === String(requiredZoneId)) || null;
    return { requiredZoneId: String(requiredZoneId), requiredZone, activeZones };
  }

  const coords = store?.location?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const [lng, lat] = coords;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      const matchingZone =
        activeZones.find((zone) =>
          isPointInZoneBoundary(Number(lat), Number(lng), zone.coordinates)
        ) || null;
      if (matchingZone) {
        return {
          requiredZoneId: String(matchingZone._id),
          requiredZone: matchingZone,
          activeZones
        };
      }
    }
  }

  return { requiredZoneId: null, requiredZone: null, activeZones };
};

// Dynamic import to avoid circular dependency
let getIO = null;

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import('../../../server.js');
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

/**
 * Check if delivery partner is connected to socket
 * @param {string} deliveryPartnerId - Delivery partner ID
 * @returns {Promise<{connected: boolean, room: string|null, socketCount: number}>}
 */
async function checkDeliveryPartnerConnection(deliveryPartnerId) {
  try {
    const io = await getIOInstance();
    if (!io) {
      return { connected: false, room: null, socketCount: 0 };
    }

    const deliveryNamespace = io.of('/delivery');
    const normalizedId = deliveryPartnerId?.toString() || deliveryPartnerId;
    
    const roomVariations = [
      `delivery:${normalizedId}`,
      `delivery:${deliveryPartnerId}`,
      ...(mongoose.Types.ObjectId.isValid(normalizedId) 
        ? [`delivery:${new mongoose.Types.ObjectId(normalizedId).toString()}`]
        : [])
    ];

    if (deliveryNamespace) {
      for (const room of roomVariations) {
        const sockets = await deliveryNamespace.in(room).fetchSockets();
        if (sockets.length > 0) {
          return { connected: true, room, socketCount: sockets.length };
        }
      }
    }

    return { connected: false, room: null, socketCount: 0 };
  } catch (error) {
    console.error('Error checking delivery partner connection:', error);
    return { connected: false, room: null, socketCount: 0 };
  }
}

/**
 * Notify delivery boy about new order assignment via Socket.IO
 * @param {Object} order - Order document
 * @param {string} deliveryPartnerId - Delivery partner ID
 */
export async function notifyDeliveryBoyNewOrder(order, deliveryPartnerId) {
  // CRITICAL: Don't notify if order is cancelled
  if (order.status === 'cancelled') {
    console.log(`⚠️ Order ${order.orderId} is cancelled. Cannot notify delivery partner.`);
    return { success: false, reason: 'Order is cancelled' };
  }
  try {
    const io = await getIOInstance();
    
    if (!io) {
      console.warn('Socket.IO not initialized, continuing with delivery push notification only');
    }

    // Never re-send "new order" once delivery flow has already progressed.
    try {
      const OrderModel = await import('../models/Order.js');
      const latestOrder = await OrderModel.default
        .findById(order?._id || order?.id || order?.orderMongoId)
        .select('status deliveryPartnerId deliveryState')
        .lean();

      const latestStatus = String(latestOrder?.status || '').toLowerCase();
      const latestPhase = String(latestOrder?.deliveryState?.currentPhase || '').toLowerCase();
      const latestDeliveryStateStatus = String(latestOrder?.deliveryState?.status || '').toLowerCase();
      const latestAssignedDeliveryId = String(latestOrder?.deliveryPartnerId || '');
      const targetDeliveryId = String(deliveryPartnerId || '');

      const isAlreadyInProgress =
        latestStatus === 'out_for_delivery' ||
        latestStatus === 'picked_up' ||
        latestStatus === 'delivered' ||
        latestPhase === 'en_route_to_pickup' ||
        latestPhase === 'at_pickup' ||
        latestPhase === 'en_route_to_delivery' ||
        latestPhase === 'picked_up' ||
        latestPhase === 'at_delivery' ||
        latestPhase === 'completed' ||
        latestDeliveryStateStatus === 'accepted' ||
        latestDeliveryStateStatus === 'reached_pickup' ||
        latestDeliveryStateStatus === 'order_confirmed' ||
        latestDeliveryStateStatus === 'en_route_to_delivery' ||
        latestDeliveryStateStatus === 'reached_drop' ||
        latestDeliveryStateStatus === 'delivered';

      if (isAlreadyInProgress) {
        return { success: false, reason: 'order_already_in_progress' };
      }

      if (latestAssignedDeliveryId && targetDeliveryId && latestAssignedDeliveryId !== targetDeliveryId) {
        return { success: false, reason: 'order_assigned_to_other_delivery_partner' };
      }
    } catch (latestOrderGuardError) {
      console.warn('Could not verify latest order state before notifying delivery partner:', latestOrderGuardError.message);
    }

    // Populate userId if it's not already populated
    let orderWithUser = order;
    if (order.userId && typeof order.userId === 'object' && order.userId._id) {
      // Already populated
      orderWithUser = order;
    } else if (order.userId) {
      // Need to populate
      const OrderModel = await import('../models/Order.js');
      orderWithUser = await OrderModel.default.findById(order._id)
        .populate('userId', 'name phone')
        .lean();
    }

    // Get delivery partner details
    const deliveryPartner = await Delivery.findById(deliveryPartnerId)
      .select('name phone availability.currentLocation availability.isOnline status isActive fcmTokenWeb fcmTokenMobile')
      .lean();

    if (!deliveryPartner) {
      console.error(`❌ Delivery partner not found: ${deliveryPartnerId}`);
      return;
    }

    if (!isDeliveryEligibleForOrders(deliveryPartner)) {
      console.warn(`⚠️ Delivery partner ${deliveryPartnerId} is not eligible for order notifications.`);
      return { success: false, reason: 'delivery_partner_not_eligible' };
    }

    // Verify delivery partner is online and active
    if (!deliveryPartner.availability?.isOnline) {
      console.warn(`⚠️ Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) is not online. Notification may not be received.`);
    }

    if (!deliveryPartner.isActive) {
      console.warn(`⚠️ Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) is not active.`);
    }

    if (!deliveryPartner.availability?.currentLocation?.coordinates || 
        deliveryPartner.availability.currentLocation.coordinates[0] === 0 && 
        deliveryPartner.availability.currentLocation.coordinates[1] === 0) {
      console.warn(`⚠️ Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) has no valid location.`);
    }

    console.log(`📋 Delivery partner details:`, {
      id: deliveryPartnerId,
      name: deliveryPartner.name,
      isOnline: deliveryPartner.availability?.isOnline,
      isActive: deliveryPartner.isActive,
      status: deliveryPartner.status,
      hasLocation: !!deliveryPartner.availability?.currentLocation?.coordinates
    });

    // Check if delivery partner is connected to socket BEFORE trying to notify
    const connectionStatus = await checkDeliveryPartnerConnection(deliveryPartnerId);
    console.log(`🔌 Delivery partner socket connection status:`, connectionStatus);
    
    if (!connectionStatus.connected) {
      console.warn(`⚠️ Delivery partner ${deliveryPartnerId} (${deliveryPartner.name}) is NOT connected to socket!`);
      console.warn(`⚠️ Notification will be sent but may not be received until they reconnect.`);
    } else {
      console.log(`✅ Delivery partner ${deliveryPartnerId} is connected via socket in room: ${connectionStatus.room}`);
    }

    // Get best-available store details (Restaurant/GroceryStore/populated fallback)
    const populatedStore =
      order?.restaurantId && typeof order.restaurantId === 'object' ? order.restaurantId : null;
    const normalizedStoreIdentifier = normalizeStoreIdentifier(order?.restaurantId);
    const fetchedStore = await fetchStoreByIdentifier(normalizedStoreIdentifier);
    const restaurant = pickBestStoreDetails(populatedStore, fetchedStore);
    const restaurantLocation = restaurant?.location || null;
    const resolvedRestaurantName =
      order?.restaurantName ||
      restaurant?.name ||
      'Store';
    const resolvedRestaurantAddress =
      restaurantLocation?.formattedAddress ||
      restaurantLocation?.address ||
      restaurant?.address ||
      'Restaurant address';
    const resolvedPlatform =
      orderWithUser?.platform ||
      order?.platform ||
      restaurant?.platform ||
      'mofood';
    const zoneContext = await resolveRequiredZoneForOrder({
      order: orderWithUser || order,
      store: restaurant,
      platform: resolvedPlatform
    });

    if (!isDeliveryPartnerZoneEligible(deliveryPartner, zoneContext)) {
      console.warn(
        `Skipping out-of-zone delivery partner ${deliveryPartnerId} for order ${order.orderId}`
      );
      return { success: false, reason: 'delivery_partner_out_of_zone' };
    }

    // Calculate distances
    let pickupDistance = null;
    let deliveryDistance = null;
    
    if (deliveryPartner.availability?.currentLocation?.coordinates && hasValidCoords(restaurant)) {
      const [deliveryLng, deliveryLat] = deliveryPartner.availability.currentLocation.coordinates;
      const [restaurantLng, restaurantLat] = restaurantLocation.coordinates;
      const [customerLng, customerLat] = order.address.location.coordinates;

      // Calculate pickup distance (delivery boy to restaurant)
      pickupDistance = calculateDistance(deliveryLat, deliveryLng, restaurantLat, restaurantLng);
      
      // Calculate delivery distance (restaurant to customer)
      deliveryDistance = calculateDistance(restaurantLat, restaurantLng, customerLat, customerLng);
    }

    // Calculate estimated earnings using the configured rider earning formula.
    const deliveryFeeFromOrder = order.pricing?.deliveryFee ?? 0;
    let estimatedEarnings = await calculateEstimatedEarnings(deliveryDistance || 0, orderWithUser?.platform || order?.platform || 'mofood');

    // Prepare order notification data
    const resolvedDeliveryDistance =
      Number(deliveryDistance || order?.assignmentInfo?.distance || order?.deliveryState?.routeToDelivery?.distance || 0);

    const orderNotification = {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      restaurantId: order.restaurantId,
      restaurantName: resolvedRestaurantName,
      restaurantAddress: resolvedRestaurantAddress,
      restaurantLocation: hasValidCoords(restaurant) ? {
        latitude: Number(restaurantLocation.coordinates[1]),
        longitude: Number(restaurantLocation.coordinates[0]),
        address: resolvedRestaurantAddress
      } : null,
      customerLocation: {
        latitude: order.address.location.coordinates[1],
        longitude: order.address.location.coordinates[0],
        address: order.address.formattedAddress || `${order.address.street}, ${order.address.city}` || 'Customer address'
      },
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })),
      total: order.pricing.total,
      deliveryFee: deliveryFeeFromOrder,
      customerName: orderWithUser.userId?.name || 'Customer',
      customerPhone: orderWithUser.userId?.phone || '',
      status: order.status,
      createdAt: order.createdAt,
      estimatedDeliveryTime: order.estimatedDeliveryTime || 30,
      note: order.note || '',
      pickupDistance: pickupDistance ? `${pickupDistance.toFixed(2)} km` : 'Distance not available',
      deliveryDistance: resolvedDeliveryDistance > 0 ? `${resolvedDeliveryDistance.toFixed(2)} km` : 'Distance not available',
      deliveryDistanceRaw: resolvedDeliveryDistance, // Raw distance number for calculations
      estimatedEarnings
    };

    // Normalize deliveryPartnerId to string
    const normalizedDeliveryPartnerId = deliveryPartnerId?.toString() || deliveryPartnerId;

    const pushResult = await sendOrderPushNotification({
      recipients: [deliveryPartner],
      title: 'New delivery order',
      body: `${order.orderId} has been assigned to you.`,
      link: '/delivery',
      tag: `delivery_new_order_${order.orderId}`,
      cleanupModels: pushCleanupModels.delivery,
      data: {
        notificationType: 'new_order',
        orderId: String(order.orderId || ''),
        orderMongoId: String(order._id || ''),
        deliveryPartnerId: String(normalizedDeliveryPartnerId || ''),
        targetPath: '/delivery',
      },
    });

    // Get delivery namespace
    const deliveryNamespace = io ? io.of('/delivery') : null;
    
    // Try multiple room formats to ensure we find the delivery partner
    const roomVariations = [
      `delivery:${normalizedDeliveryPartnerId}`,
      `delivery:${deliveryPartnerId}`,
      ...(mongoose.Types.ObjectId.isValid(normalizedDeliveryPartnerId) 
        ? [`delivery:${new mongoose.Types.ObjectId(normalizedDeliveryPartnerId).toString()}`]
        : [])
    ];
    
    // Get all connected sockets in the delivery partner room
    let socketsInRoom = [];
    let foundRoom = null;
    
    // First, get all connected sockets in delivery namespace for debugging
    const allSockets = deliveryNamespace ? await deliveryNamespace.fetchSockets() : [];
    console.log(`📊 Total connected delivery sockets: ${allSockets.length}`);
    
    // Check each room variation
    if (deliveryNamespace) {
    for (const room of roomVariations) {
      const sockets = await deliveryNamespace.in(room).fetchSockets();
      if (sockets.length > 0) {
        socketsInRoom = sockets;
        foundRoom = room;
        console.log(`📢 Found ${sockets.length} socket(s) in room: ${room}`);
        console.log(`📢 Socket IDs in room:`, sockets.map(s => s.id));
        break;
      } else {
        // Check room size using adapter (alternative method)
        const roomSize = deliveryNamespace.adapter.rooms.get(room)?.size || 0;
        if (roomSize > 0) {
          console.log(`📢 Room ${room} has ${roomSize} socket(s) (checked via adapter)`);
        }
      }
    }
    }

    const primaryRoom = roomVariations[0];
    
    console.log(`📢 Attempting to notify delivery partner ${normalizedDeliveryPartnerId} about order ${order.orderId}`);
    console.log(`📢 Delivery partner name: ${deliveryPartner.name}`);
    console.log(`📢 Room variations to try:`, roomVariations);
    console.log(`📢 Connected sockets in primary room ${primaryRoom}:`, socketsInRoom.length);
    console.log(`📢 Found room:`, foundRoom || 'none');
    
    // Emit new order notification to all room variations (even if no sockets found, in case they connect)
    let notificationSent = false;
    if (deliveryNamespace) {
    roomVariations.forEach(room => {
      deliveryNamespace.to(room).emit('new_order', orderNotification);
      deliveryNamespace.to(room).emit('play_notification_sound', {
        type: 'new_order',
        orderId: order.orderId,
        message: `New order assigned: ${order.orderId}`
      });
      notificationSent = true;
      console.log(`📤 Emitted notification to room: ${room}`);
    });

    // Never broadcast a targeted order to all delivery sockets.
    if (socketsInRoom.length === 0) {
      console.warn(`⚠️ No sockets connected in any delivery room for partner ${normalizedDeliveryPartnerId}`);
      console.warn(`⚠️ Delivery partner details:`, {
        id: normalizedDeliveryPartnerId,
        name: deliveryPartner.name,
        isOnline: deliveryPartner.availability?.isOnline,
        isActive: deliveryPartner.isActive,
        status: deliveryPartner.status
      });
      console.warn(`⚠️ This means the delivery partner is not currently connected to the app`);
      console.warn(`⚠️ Possible reasons:`);
      console.warn(`  1. Delivery partner app is closed or not running`);
      console.warn(`  2. Delivery partner is not logged in`);
      console.warn(`  3. Socket connection failed`);
      console.warn(`  4. Delivery partner needs to refresh their app`);
      console.warn(`  5. Delivery partner ID mismatch (check if ID used to join room matches ${normalizedDeliveryPartnerId})`);
      
      if (allSockets.length > 0) {
        console.log(`📊 Connected delivery socket IDs:`, allSockets.map(s => s.id));
        console.log(`📊 Checking all delivery rooms to see which partners are connected...`);
        
        // List all rooms in delivery namespace
        const allRooms = deliveryNamespace.adapter.rooms;
        console.log(`📊 All delivery rooms:`, Array.from(allRooms.keys()).filter(room => room.startsWith('delivery:')));
      } else {
        console.warn(`⚠️ No delivery partners are currently connected to the app!`);
      }
      
      console.warn(`⚠️ Skipping global broadcast fallback for targeted order notification.`);
    } else {
      console.log(`✅ Successfully found ${socketsInRoom.length} connected socket(s) for delivery partner ${normalizedDeliveryPartnerId}`);
      console.log(`✅ Notification sent to room: ${foundRoom}`);
    }

    if (notificationSent) {
      console.log(`✅ Notification emitted for order ${order.orderId} to delivery partner ${normalizedDeliveryPartnerId}`);
    } else {
      console.error(`❌ Failed to send notification - no sockets found and broadcast failed`);
    }
    }

    return {
      success: true,
      deliveryPartnerId,
      orderId: order.orderId,
      push: pushResult
    };
  } catch (error) {
    console.error('Error notifying delivery boy:', error);
    throw error;
  }
}

/**
 * Notify multiple delivery boys about new order (without assigning)
 * Used for priority-based notification where nearest delivery boys get first chance
 * @param {Object} order - Order document
 * @param {Array} deliveryPartnerIds - Array of delivery partner IDs to notify
 * @param {string} phase - Notification phase: 'priority' or 'expanded'
 * @returns {Promise<{success: boolean, notified: number}>}
 */
export async function notifyMultipleDeliveryBoys(order, deliveryPartnerIds, phase = 'priority') {
  try {
    if (!deliveryPartnerIds || deliveryPartnerIds.length === 0) {
      return { success: false, notified: 0 };
    }

    // Do not notify multiple partners if this order is already accepted/assigned/in-progress.
    try {
      const OrderModel = await import('../models/Order.js');
      const latestOrder = await OrderModel.default
        .findById(order?._id || order?.id || order?.orderMongoId)
        .select('status deliveryPartnerId deliveryState')
        .lean();

      const latestStatus = String(latestOrder?.status || '').toLowerCase();
      const latestPhase = String(latestOrder?.deliveryState?.currentPhase || '').toLowerCase();
      const latestDeliveryStateStatus = String(latestOrder?.deliveryState?.status || '').toLowerCase();

      const isAlreadyAssignedOrInProgress =
        Boolean(latestOrder?.deliveryPartnerId) ||
        latestStatus === 'out_for_delivery' ||
        latestStatus === 'picked_up' ||
        latestStatus === 'delivered' ||
        latestPhase === 'en_route_to_pickup' ||
        latestPhase === 'at_pickup' ||
        latestPhase === 'en_route_to_delivery' ||
        latestPhase === 'picked_up' ||
        latestPhase === 'at_delivery' ||
        latestPhase === 'completed' ||
        latestDeliveryStateStatus === 'accepted' ||
        latestDeliveryStateStatus === 'reached_pickup' ||
        latestDeliveryStateStatus === 'order_confirmed' ||
        latestDeliveryStateStatus === 'en_route_to_delivery' ||
        latestDeliveryStateStatus === 'reached_drop' ||
        latestDeliveryStateStatus === 'delivered';

      if (isAlreadyAssignedOrInProgress) {
        return { success: false, notified: 0, reason: 'order_already_assigned_or_in_progress' };
      }
    } catch (latestOrderGuardError) {
      console.warn('Could not verify latest order state before notifying multiple delivery partners:', latestOrderGuardError.message);
    }

    const io = await getIOInstance();
    if (!io) {
      console.warn('Socket.IO not initialized, continuing with delivery push notifications only');
    }

    const deliveryNamespace = io ? io.of('/delivery') : null;
    let notifiedCount = 0;

    // Populate userId if needed
    let orderWithUser = order;
    if (order.userId && typeof order.userId === 'object' && order.userId._id) {
      orderWithUser = order;
    } else if (order.userId) {
      const OrderModel = await import('../models/Order.js');
      orderWithUser = await OrderModel.default.findById(order._id)
        .populate('userId', 'name phone')
        .lean();
    }

    // Get restaurant/store details for complete address
    let restaurantAddress = 'Restaurant address';
    let restaurantLocation = null;
    let resolvedRestaurantName = orderWithUser.restaurantName || '';
    let resolvedStoreDetails = null;
    
    if (orderWithUser.restaurantId) {
      try {
        const populatedStore =
          typeof orderWithUser.restaurantId === 'object' ? orderWithUser.restaurantId : null;
        const identifier = normalizeStoreIdentifier(orderWithUser.restaurantId);
        const fetchedStore = await fetchStoreByIdentifier(identifier);
        const resolvedStore = pickBestStoreDetails(populatedStore, fetchedStore);

        if (resolvedStore) {
          resolvedStoreDetails = resolvedStore;
          resolvedRestaurantName = resolvedRestaurantName || resolvedStore.name || '';
          restaurantAddress =
            resolvedStore.address ||
            resolvedStore.location?.formattedAddress ||
            resolvedStore.location?.address ||
            'Restaurant address';
          restaurantLocation = resolvedStore.location || null;
        }
      } catch (e) {
        console.warn('Could not fetch restaurant details for notification:', e.message);
      }
    }

    // Calculate delivery distance (restaurant to customer) for earnings calculation
    let deliveryDistance = 0;
    
    console.log(`🔍 Calculating earnings for order ${orderWithUser.orderId}:`, {
      hasRestaurantLocation: !!restaurantLocation,
      restaurantCoords: restaurantLocation?.coordinates,
      hasAddressLocation: !!orderWithUser.address?.location,
      addressCoords: orderWithUser.address?.location?.coordinates
    });
    
    if (restaurantLocation?.coordinates && orderWithUser.address?.location?.coordinates) {
      const [restaurantLng, restaurantLat] = restaurantLocation.coordinates;
      const [customerLng, customerLat] = orderWithUser.address.location.coordinates;
      
      // Validate coordinates
      if (restaurantLat && restaurantLng && customerLat && customerLng &&
          !isNaN(restaurantLat) && !isNaN(restaurantLng) && 
          !isNaN(customerLat) && !isNaN(customerLng)) {
        // Calculate distance using Haversine formula
        const R = 6371; // Earth radius in km
        const dLat = (customerLat - restaurantLat) * Math.PI / 180;
        const dLng = (customerLng - restaurantLng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(restaurantLat * Math.PI / 180) * Math.cos(customerLat * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        deliveryDistance = R * c;
        console.log(`✅ Calculated delivery distance: ${deliveryDistance.toFixed(2)} km`);
      } else {
        console.warn('⚠️ Invalid coordinates for distance calculation');
      }
    } else {
      console.warn('⚠️ Missing coordinates for distance calculation');
    }

    // Calculate estimated earnings based on delivery distance
    let estimatedEarnings = null;
    const deliveryFeeFromOrder = orderWithUser.pricing?.deliveryFee ?? 0;
    
    try {
      estimatedEarnings = await calculateEstimatedEarnings(deliveryDistance, orderWithUser?.platform || 'mofood');
      const earnedValue = typeof estimatedEarnings === 'object' ? (estimatedEarnings.totalEarning ?? 0) : (Number(estimatedEarnings) || 0);
      
      console.log(`💰 Earnings calculation result:`, {
        estimatedEarnings,
        earnedValue,
        deliveryFeeFromOrder,
        deliveryDistance
      });
      
      console.log(`✅ Final estimated earnings for order ${orderWithUser.orderId}: ₹${typeof estimatedEarnings === 'object' ? estimatedEarnings.totalEarning : estimatedEarnings} (distance: ${deliveryDistance.toFixed(2)} km)`);
    } catch (earningsError) {
      console.error('❌ Error calculating estimated earnings in notification:', earningsError);
      console.error('❌ Error stack:', earningsError.stack);
      // Fallback to the default rider earning formula if fee settings cannot be loaded.
      const extraDistanceKm = Math.max(0, Number(deliveryDistance || 0) - 2);
      estimatedEarnings = {
        basePayout: 20,
        distance: deliveryDistance,
        commissionPerKm: 5,
        distanceCommission: extraDistanceKm * 5,
        totalEarning: 20 + (extraDistanceKm * 5),
        breakdown: {
          basePayout: 20,
          distance: deliveryDistance,
          commissionPerKm: 5,
          distanceCommission: extraDistanceKm * 5,
          minDistance: 0,
          maxDistance: 2,
          extraDistanceKm,
          formula: `Rs20.00 + (${extraDistanceKm.toFixed(2)} km x Rs5.00) = Rs${(20 + (extraDistanceKm * 5)).toFixed(2)}`
        },
        source: 'default_formula'
      };
      console.log(`⚠️ Using fallback earnings: ₹${typeof estimatedEarnings === 'object' ? estimatedEarnings.totalEarning : estimatedEarnings}`);
    }

    const zoneContext = await resolveRequiredZoneForOrder({
      order: orderWithUser,
      store:
        resolvedStoreDetails ||
        {
          ...(restaurantLocation ? { location: restaurantLocation } : {}),
          ...(orderWithUser?.restaurantId && typeof orderWithUser.restaurantId === 'object'
            ? { zoneId: orderWithUser.restaurantId.zoneId }
            : {}),
          ...(orderWithUser?.restaurantPlatform ? { platform: orderWithUser.restaurantPlatform } : {}),
        },
      platform:
        orderWithUser?.platform ||
        orderWithUser?.restaurantPlatform ||
        'mofood'
    });

    // Prepare notification payload
    const resolvedDeliveryDistance =
      Number(deliveryDistance || orderWithUser?.assignmentInfo?.distance || orderWithUser?.deliveryState?.routeToDelivery?.distance || 0);

    const orderNotification = {
      orderId: orderWithUser.orderId || orderWithUser._id,
      mongoId: orderWithUser._id?.toString(),
      orderMongoId: orderWithUser._id?.toString(), // Also include orderMongoId for compatibility
      status: orderWithUser.status || 'preparing',
      restaurantName: resolvedRestaurantName || orderWithUser.restaurantId?.name || 'Store',
      restaurantAddress: restaurantAddress,
      restaurantLocation: restaurantLocation ? {
        latitude: restaurantLocation.coordinates?.[1],
        longitude: restaurantLocation.coordinates?.[0],
        address: restaurantLocation.formattedAddress || restaurantLocation.address || restaurantAddress,
        formattedAddress: restaurantLocation.formattedAddress || restaurantLocation.address || restaurantAddress
      } : null,
      customerName: orderWithUser.userId?.name || 'Customer',
      customerPhone: orderWithUser.userId?.phone || '',
      deliveryAddress: orderWithUser.address?.address || orderWithUser.address?.location?.address || orderWithUser.address?.formattedAddress,
      customerLocation: orderWithUser.address?.location ? {
        latitude: orderWithUser.address.location.coordinates?.[1],
        longitude: orderWithUser.address.location.coordinates?.[0],
        address: orderWithUser.address.formattedAddress || orderWithUser.address.address
      } : null,
      totalAmount: orderWithUser.pricing?.total || 0,
      deliveryFee: deliveryFeeFromOrder,
      estimatedEarnings: estimatedEarnings, // Include calculated earnings
      deliveryDistance: resolvedDeliveryDistance > 0 ? `${resolvedDeliveryDistance.toFixed(2)} km` : 'Distance not available',
      paymentMethod: orderWithUser.payment?.method || 'cash',
      message: `New order available: ${orderWithUser.orderId || orderWithUser._id}`,
      timestamp: new Date().toISOString(),
      phase: phase, // 'priority' or 'expanded'
      // Include restaurant coordinates
      restaurantLat: restaurantLocation?.coordinates?.[1] || orderWithUser.restaurantId?.location?.coordinates?.[1],
      restaurantLng: restaurantLocation?.coordinates?.[0] || orderWithUser.restaurantId?.location?.coordinates?.[0],
      // Include delivery coordinates
      deliveryLat: orderWithUser.address?.location?.coordinates?.[1] || orderWithUser.address?.location?.latitude,
      deliveryLng: orderWithUser.address?.location?.coordinates?.[0] || orderWithUser.address?.location?.longitude,
      // Include full order for frontend use
      fullOrder: orderWithUser
    };

    console.log(`📤 Notification payload for order ${orderWithUser.orderId}:`, {
      orderId: orderNotification.orderId,
      estimatedEarnings: orderNotification.estimatedEarnings,
      estimatedEarningsType: typeof orderNotification.estimatedEarnings,
      estimatedEarningsValue: typeof orderNotification.estimatedEarnings === 'object' ? orderNotification.estimatedEarnings.totalEarning : orderNotification.estimatedEarnings,
      deliveryDistance: orderNotification.deliveryDistance,
      deliveryFee: orderNotification.deliveryFee,
      hasRestaurantLocation: !!orderNotification.restaurantLocation,
      hasCustomerLocation: !!orderNotification.customerLocation
    });

    // Notify each delivery partner
    for (const deliveryPartnerId of deliveryPartnerIds) {
      try {
        const deliveryPartner = await Delivery.findById(deliveryPartnerId)
          .select('name phoneVerified status isActive availability.currentLocation availability.zones fcmTokenWeb fcmTokenMobile')
          .lean();
        if (!isDeliveryEligibleForOrders(deliveryPartner)) {
          console.warn(`⚠️ Skipping ineligible delivery partner ${deliveryPartnerId} for order ${order.orderId}`);
          continue;
        }
        if (!isDeliveryPartnerZoneEligible(deliveryPartner, zoneContext)) {
          console.warn(`Skipping out-of-zone delivery partner ${deliveryPartnerId} for order ${order.orderId}`);
          continue;
        }

        const normalizedId = deliveryPartnerId?.toString() || deliveryPartnerId;
        const roomVariations = [
          `delivery:${normalizedId}`,
          `delivery:${deliveryPartnerId}`,
          ...(mongoose.Types.ObjectId.isValid(normalizedId)
            ? [`delivery:${new mongoose.Types.ObjectId(normalizedId).toString()}`]
            : [])
        ];

        const pushResult = await sendOrderPushNotification({
          recipients: [deliveryPartner],
          title: phase === 'expanded' ? 'New order available nearby' : 'Priority order available',
          body: `${order.orderId} is available for pickup.`,
          link: '/delivery',
          tag: `delivery_available_${order.orderId}_${phase}`,
          cleanupModels: pushCleanupModels.delivery,
          data: {
            notificationType: 'new_order_available',
            orderId: String(order.orderId || ''),
            orderMongoId: String(orderWithUser._id || ''),
            deliveryPartnerId: String(normalizedId || ''),
            phase: String(phase || 'priority'),
            targetPath: '/delivery',
          },
        });

        let notificationSent = false;
        if (deliveryNamespace) {
        for (const room of roomVariations) {
          const sockets = await deliveryNamespace.in(room).fetchSockets();
          if (sockets.length > 0) {
            deliveryNamespace.to(room).emit('new_order_available', orderNotification);
            deliveryNamespace.to(room).emit('play_notification_sound', {
              type: 'new_order_available',
              orderId: order.orderId,
              message: `New order available: ${order.orderId}`,
              phase: phase
            });
            notificationSent = true;
            console.log(`📤 Notified delivery partner ${normalizedId} in room: ${room} (phase: ${phase})`);
            break;
          }
        }
        }

        if (!notificationSent) {
          console.warn(`⚠️ Delivery partner ${normalizedId} not connected, but will receive notification when they connect`);
          // Still emit to room for when they connect
          if (deliveryNamespace) {
          roomVariations.forEach(room => {
            deliveryNamespace.to(room).emit('new_order_available', orderNotification);
          });
          }
        }
        if (notificationSent || (pushResult?.successCount || 0) > 0) {
          notifiedCount++;
        }
      } catch (partnerError) {
        console.error(`❌ Error notifying delivery partner ${deliveryPartnerId}:`, partnerError);
      }
    }

    console.log(`✅ Notified ${notifiedCount} delivery partners (phase: ${phase}) for order ${order.orderId}`);
    return { success: true, notified: notifiedCount };
  } catch (error) {
    console.error('❌ Error notifying multiple delivery boys:', error);
    return { success: false, notified: 0 };
  }
}

/**
 * Notify delivery boy that order is ready for pickup
 * @param {Object} order - Order document
 * @param {string} deliveryPartnerId - Delivery partner ID
 */
export async function notifyDeliveryBoyOrderReady(order, deliveryPartnerId) {
  try {
    const io = await getIOInstance();
    
    if (!io) {
      console.warn('Socket.IO not initialized, skipping delivery boy notification');
      return;
    }

    const deliveryNamespace = io.of('/delivery');
    const normalizedDeliveryPartnerId = deliveryPartnerId?.toString() || deliveryPartnerId;

    // Prepare order ready notification
    const coords = order.restaurantId?.location?.coordinates;
    const orderReadyNotification = {
      orderId: order.orderId || order._id,
      mongoId: order._id?.toString(),
      status: 'ready',
      restaurantName: order.restaurantName || order.restaurantId?.name,
      restaurantAddress: order.restaurantId?.address || order.restaurantId?.location?.address,
      message: 'Food is ready please collect it',
      timestamp: new Date().toISOString(),
      // Include restaurant coords so delivery app can show Reached Pickup when rider is near (coordinates: [lng, lat])
      restaurantLat: coords?.[1],
      restaurantLng: coords?.[0]
    };

    // Try to find delivery partner's room
    const roomVariations = [
      `delivery:${normalizedDeliveryPartnerId}`,
      `delivery:${deliveryPartnerId}`,
      ...(mongoose.Types.ObjectId.isValid(normalizedDeliveryPartnerId) 
        ? [`delivery:${new mongoose.Types.ObjectId(normalizedDeliveryPartnerId).toString()}`]
        : [])
    ];

    let notificationSent = false;
    let foundRoom = null;
    let socketsInRoom = [];

    for (const room of roomVariations) {
      const sockets = await deliveryNamespace.in(room).fetchSockets();
      if (sockets.length > 0) {
        foundRoom = room;
        socketsInRoom = sockets;
        break;
      }
    }

    if (foundRoom && socketsInRoom.length > 0) {
      // Send to specific delivery partner room
      deliveryNamespace.to(foundRoom).emit('order_ready', orderReadyNotification);
      notificationSent = true;
      console.log(`✅ Order ready notification sent to delivery partner ${normalizedDeliveryPartnerId} in room ${foundRoom}`);
    } else {
      // Fallback: broadcast to all delivery sockets
      console.warn(`⚠️ Delivery partner ${normalizedDeliveryPartnerId} not found in any room, broadcasting to all`);
      deliveryNamespace.emit('order_ready', orderReadyNotification);
      notificationSent = true;
    }

    return {
      success: notificationSent,
      deliveryPartnerId: normalizedDeliveryPartnerId,
      orderId: order.orderId
    };
  } catch (error) {
    console.error('Error notifying delivery boy about order ready:', error);
    throw error;
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

/**
 * Calculate estimated earnings for delivery partner using fee settings slab formula.
 * Formula: base slab amount + (extra distance beyond slab end * extra per-km fee)
 */
async function calculateEstimatedEarnings(deliveryDistance, platform = 'mofood') {
  try {
    const earning = await calculateDriverEarning(deliveryDistance || 0, platform);
    return {
      basePayout: Number(earning.baseAmount || 0),
      distance: Number(earning.distanceKm || 0),
      commissionPerKm: Number(earning.extraPerKmFee || 0),
      distanceCommission: Number(earning.extraDistanceKm || 0) * Number(earning.extraPerKmFee || 0),
      totalEarning: Number(earning.totalEarning || 0),
      breakdown: earning.breakdownText,
      minDistance: Number(earning.rangeStartKm || 0),
      maxDistance: Number(earning.rangeEndKm || 0),
      extraDistanceKm: Number(earning.extraDistanceKm || 0),
      source: earning.source
    };
  } catch (error) {
    console.error('Error calculating estimated earnings:', error);
    // Fallback to default calculation
    return {
      basePayout: 20,
      distance: deliveryDistance || 0,
      commissionPerKm: 5,
      distanceCommission: deliveryDistance && deliveryDistance > 2 ? (deliveryDistance - 2) * 5 : 0,
      totalEarning: 20 + (deliveryDistance && deliveryDistance > 2 ? (deliveryDistance - 2) * 5 : 0),
      breakdown: 'Default calculation'
    };
  }
}

