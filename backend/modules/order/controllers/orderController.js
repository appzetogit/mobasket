import Order from '../models/Order.js';
import Payment from '../../payment/models/Payment.js';
import { createOrder as createRazorpayOrder, verifyPayment } from '../../payment/services/razorpayService.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import GroceryStore from '../../grocery/models/GroceryStore.js';
import Zone from '../../admin/models/Zone.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import winston from 'winston';
import { calculateOrderPricing } from '../services/orderCalculationService.js';
import { getRazorpayCredentials } from '../../../shared/utils/envService.js';
import { notifyRestaurantNewOrder } from '../services/restaurantNotificationService.js';
import { calculateOrderSettlement } from '../services/orderSettlementService.js';
import { holdEscrow } from '../services/escrowWalletService.js';
import { processCancellationRefund } from '../services/cancellationRefundService.js';
import etaCalculationService from '../services/etaCalculationService.js';
import etaWebSocketService from '../services/etaWebSocketService.js';
import OrderEvent from '../models/OrderEvent.js';
import UserWallet from '../../user/models/UserWallet.js';
import Menu from '../../restaurant/models/Menu.js';
import User from '../../auth/models/User.js';
import Delivery from '../../delivery/models/Delivery.js';
import OutletTimings from '../../restaurant/models/OutletTimings.js';
import GroceryProduct from '../../grocery/models/GroceryProduct.js';
import GroceryPlan from '../../grocery/models/GroceryPlan.js';
import GroceryPlanOffer from '../../grocery/models/GroceryPlanOffer.js';
import FeeSettings from '../../admin/models/FeeSettings.js';
import { reduceGroceryStockForOrder, restoreGroceryStockForOrder } from '../services/groceryStockService.js';
import { isOpenFromOutletTimings } from '../../restaurant/utils/outletTimingStatus.js';
import {
  getDefaultPendingCartEdit,
  sanitizePendingCartEdit,
  sanitizePostOrderActions
} from '../utils/postOrderActionsSanitizer.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const ORDER_MODIFICATION_WINDOW_MS = 2 * 60 * 1000;
const ONLINE_ORDER_REUSE_WINDOW_MS = 30 * 60 * 1000;

const normalizePlatform = (value) => (value === 'mogrocery' ? 'mogrocery' : 'mofood');

const safeString = (value) => String(value ?? '').trim();

const buildOrderItemsFingerprint = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      itemId: safeString(item?.itemId || item?.id || item?._id),
      name: safeString(item?.name).toLowerCase(),
      quantity: Number(item?.quantity || 0),
      price: Number(item?.price || 0),
      variant: safeString(item?.variant || item?.variation || '').toLowerCase(),
      addOnIds: Array.isArray(item?.addOns)
        ? item.addOns
            .map((addOn) => safeString(addOn?.id || addOn?._id || addOn?.addOnId || addOn))
            .filter(Boolean)
            .sort()
        : []
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const buildAddressFingerprint = (address = {}) => ({
  latitude: Number(address?.latitude || address?.location?.coordinates?.[1] || 0),
  longitude: Number(address?.longitude || address?.location?.coordinates?.[0] || 0),
  street: safeString(address?.street).toLowerCase(),
  city: safeString(address?.city).toLowerCase(),
  state: safeString(address?.state).toLowerCase(),
  zipCode: safeString(address?.zipCode).toLowerCase(),
  formattedAddress: safeString(address?.formattedAddress).toLowerCase()
});

const buildPendingOnlineOrderFingerprint = ({
  items,
  address,
  restaurantId,
  platform,
  deliveryFleet,
  couponCode,
  deliveryOption,
  scheduledFor,
  deliveryTimeSlot,
  pricingTotal
}) => {
  const payload = {
    restaurantId: safeString(restaurantId),
    platform: normalizePlatform(platform),
    deliveryFleet: safeString(deliveryFleet || 'standard').toLowerCase(),
    couponCode: safeString(couponCode).toLowerCase(),
    deliveryOption: safeString(deliveryOption || 'now').toLowerCase(),
    scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : '',
    deliveryTimeSlot: safeString(deliveryTimeSlot).toLowerCase(),
    pricingTotal: Number(pricingTotal || 0),
    items: buildOrderItemsFingerprint(items),
    address: buildAddressFingerprint(address)
  };

  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

const findReusablePendingOnlineOrder = async ({
  userId,
  restaurantId,
  platform,
  fingerprint
}) => {
  const cutoff = new Date(Date.now() - ONLINE_ORDER_REUSE_WINDOW_MS);
  const candidates = await Order.find({
    userId,
    restaurantId: safeString(restaurantId),
    restaurantPlatform: normalizePlatform(platform),
    'payment.method': 'razorpay',
    'payment.status': 'pending',
    status: { $in: ['pending', 'scheduled'] },
    createdAt: { $gte: cutoff }
  })
    .sort({ createdAt: -1 })
    .limit(10);

  for (const candidate of candidates) {
    const candidateFingerprint = buildPendingOnlineOrderFingerprint({
      items: candidate.items,
      address: candidate.address,
      restaurantId: candidate.restaurantId,
      platform: candidate.restaurantPlatform,
      deliveryFleet: candidate.deliveryFleet,
      couponCode: candidate.pricing?.couponCode,
      deliveryOption: candidate.scheduledDelivery?.isScheduled ? 'scheduled' : 'now',
      scheduledFor: candidate.scheduledDelivery?.scheduledFor,
      deliveryTimeSlot: candidate.scheduledDelivery?.timeSlot,
      pricingTotal: candidate.pricing?.total
    });

    if (candidateFingerprint === fingerprint) {
      return candidate;
    }
  }

  return null;
};

const findRestaurantOrStoreByIdentifier = async (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!normalized) return null;

  let entity = null;
  if (mongoose.Types.ObjectId.isValid(normalized) && normalized.length === 24) {
    entity = await Restaurant.findById(normalized);
    if (!entity) {
      entity = await GroceryStore.findById(normalized);
    }
    if (entity) return entity;
  }

  entity = await Restaurant.findOne({
    $or: [
      { restaurantId: normalized },
      { slug: normalized }
    ]
  });
  if (entity) return entity;

  entity = await GroceryStore.findOne({
    $or: [
      { restaurantId: normalized },
      { slug: normalized }
    ]
  });
  return entity;
};

const resolveOrderPlatform = async (restaurantId) => {
  if (!restaurantId) return 'mofood';

  const restaurantIdString = String(restaurantId);
  const query = {
    $or: [
      ...(mongoose.Types.ObjectId.isValid(restaurantIdString)
        ? [{ _id: new mongoose.Types.ObjectId(restaurantIdString) }]
        : []),
      { restaurantId: restaurantIdString }
    ]
  };

  let restaurant = await Restaurant.findOne(query).select('platform').lean();
  if (!restaurant) {
    restaurant = await GroceryStore.findOne(query).select('platform').lean();
  }
  return normalizePlatform(restaurant?.platform);
};

const getMinimumCodOrderValueForPlatform = async (platform) => {
  const normalizedPlatform = platform === 'mogrocery' ? 'mogrocery' : 'mofood';
  const platformFilter =
    normalizedPlatform === 'mogrocery'
      ? { platform: 'mogrocery' }
      : { $or: [{ platform: 'mofood' }, { platform: { $exists: false } }] };

  const feeSettings = await FeeSettings.findOne({
    ...platformFilter,
    isActive: true
  })
    .sort({ createdAt: -1 })
    .select('minimumCodOrderValue')
    .lean();

  return Math.max(0, Number(feeSettings?.minimumCodOrderValue || 0));
};

const computeNextAverageRating = (currentAverage = 0, currentCount = 0, newRating = 0) => {
  const safeAverage = Number(currentAverage) || 0;
  const safeCount = Number(currentCount) || 0;
  const safeRating = Number(newRating) || 0;
  const nextCount = safeCount + 1;
  const nextAverage = Number((((safeAverage * safeCount) + safeRating) / nextCount).toFixed(2));
  return { nextAverage, nextCount };
};

const updateRestaurantAggregateRating = async (restaurantIdentifier, newRating) => {
  const restaurant = await findRestaurantOrStoreByIdentifier(restaurantIdentifier);
  if (!restaurant) return null;

  const { nextAverage, nextCount } = computeNextAverageRating(
    restaurant.rating,
    restaurant.totalRatings,
    newRating
  );

  restaurant.rating = nextAverage;
  restaurant.totalRatings = nextCount;
  await restaurant.save({ validateBeforeSave: false });

  return {
    id: restaurant._id?.toString?.() || String(restaurant._id || ''),
    rating: restaurant.rating,
    totalRatings: restaurant.totalRatings
  };
};

const finalizeVerifiedOnlineOrder = async (order, userId, paymentAmount = null) => {
  const isFutureScheduledOrder =
    Boolean(order?.scheduledDelivery?.isScheduled) &&
    Boolean(order?.scheduledDelivery?.scheduledFor) &&
    new Date(order.scheduledDelivery.scheduledFor).getTime() > Date.now();
  const isPlanSubscriptionOrder = Boolean(order?.planSubscription?.planId);
  const requiresAdminApproval = false;

  order.payment.status = 'completed';

  if (isFutureScheduledOrder) {
    order.status = 'scheduled';
  } else if (requiresAdminApproval) {
    order.status = 'pending';
  } else {
    order.status = 'confirmed';
    order.tracking.confirmed = { status: true, timestamp: new Date() };
    startOrderModificationWindow(order);
  }

  await saveOrderWithIdRetry(order);

  try {
    await calculateOrderSettlement(order._id);
    await holdEscrow(order._id, userId, Number(paymentAmount || order.pricing?.total || 0));
  } catch (settlementError) {
    logger.error(`Error calculating settlement for verified order ${order.orderId}: ${settlementError.message}`, {
      error: settlementError.message,
      stack: settlementError.stack
    });
  }

  if (!isFutureScheduledOrder && !isPlanSubscriptionOrder && !requiresAdminApproval) {
    try {
      const restaurantId = order.restaurantId?.toString() || order.restaurantId;
      await notifyRestaurantNewOrder(order, restaurantId);
    } catch (notificationError) {
      logger.error(`Error notifying restaurant for verified order ${order.orderId}: ${notificationError.message}`, {
        error: notificationError.message,
        stack: notificationError.stack
      });
    }
  }

  return {
    isFutureScheduledOrder,
    isPlanSubscriptionOrder,
    requiresAdminApproval
  };
};

const updateDeliveryAggregateRating = async (deliveryId, newRating) => {
  if (!deliveryId) return null;

  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) return null;

  const currentAverage = Number(delivery.metrics?.rating ?? delivery.rating ?? 0);
  const currentCount = Number(delivery.metrics?.ratingCount ?? 0);
  const { nextAverage, nextCount } = computeNextAverageRating(currentAverage, currentCount, newRating);

  delivery.metrics = delivery.metrics || {};
  delivery.metrics.rating = nextAverage;
  delivery.metrics.ratingCount = nextCount;
  delivery.rating = nextAverage;

  await delivery.save({ validateBeforeSave: false });

  return {
    id: delivery._id?.toString?.() || String(delivery._id || ''),
    rating: Number(delivery.rating || 0),
    ratingCount: Number(delivery.metrics?.ratingCount || 0)
  };
};

const ensurePostOrderActionsShape = (order) => {
  order.postOrderActions = sanitizePostOrderActions(order.postOrderActions);
  return order.postOrderActions;
};

const startOrderModificationWindow = (order) => {
  const startAt = new Date();
  const expiresAt = new Date(startAt.getTime() + ORDER_MODIFICATION_WINDOW_MS);
  const postOrderActions = ensurePostOrderActionsShape(order);
  postOrderActions.modificationWindowStartAt = startAt;
  postOrderActions.modificationWindowExpiresAt = expiresAt;
  return { startAt, expiresAt };
};

const getOrderModificationWindow = (order) => {
  const startAtRaw =
    order?.postOrderActions?.modificationWindowStartAt ||
    order?.tracking?.confirmed?.timestamp ||
    order?.createdAt ||
    null;

  let expiresAtRaw = order?.postOrderActions?.modificationWindowExpiresAt || null;
  if (!expiresAtRaw && startAtRaw) {
    expiresAtRaw = new Date(new Date(startAtRaw).getTime() + ORDER_MODIFICATION_WINDOW_MS);
  }

  const startAt = startAtRaw ? new Date(startAtRaw) : null;
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
  const remainingMs = expiresAt ? expiresAt.getTime() - Date.now() : 0;
  const isOpen = remainingMs > 0;

  return {
    isOpen,
    remainingSeconds: isOpen ? Math.ceil(remainingMs / 1000) : 0,
    startAt,
    expiresAt
  };
};

const enrichOrderWithModificationWindow = (order) => ({
  ...order,
  modificationWindow: getOrderModificationWindow(order)
});

const sanitizeEditedItems = (items) =>
  items.map((item) => ({
    itemId: item.itemId,
    name: item.name,
    price: Number(item.price),
    quantity: Number(item.quantity),
    image: item.image || '',
    description: item.description || '',
    isVeg: item.isVeg !== false
  }));

const normalizeAddressLabel = (label) => {
  const normalized = String(label || '').trim().toLowerCase();
  if (normalized === 'home') return 'Home';
  if (normalized === 'office' || normalized === 'work') return 'Office';
  return 'Other';
};

const normalizeOrderAddress = (address = {}) => {
  if (!address || typeof address !== 'object') return null;

  const latitude =
    Number(address?.latitude) ||
    Number(address?.lat) ||
    Number(address?.location?.latitude) ||
    Number(address?.location?.lat) ||
    Number(address?.location?.coordinates?.[1]) ||
    null;
  const longitude =
    Number(address?.longitude) ||
    Number(address?.lng) ||
    Number(address?.location?.longitude) ||
    Number(address?.location?.lng) ||
    Number(address?.location?.coordinates?.[0]) ||
    null;

  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  return {
    label: normalizeAddressLabel(address.label),
    street: address.street || '',
    additionalDetails: address.additionalDetails || '',
    city: address.city || '',
    state: address.state || '',
    zipCode: address.zipCode || '',
    formattedAddress: address.formattedAddress || '',
    location: {
      type: 'Point',
      coordinates: hasCoordinates ? [longitude, latitude] : [0, 0]
    }
  };
};

const isPointInsideZone = (zone, latitude, longitude) => {
  const coordinates = Array.isArray(zone?.coordinates) ? zone.coordinates : [];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || coordinates.length < 3) {
    return false;
  }

  // Ray casting algorithm
  let inside = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
    const coordI = coordinates[i];
    const coordJ = coordinates[j];
    const xi = typeof coordI === 'object' ? (coordI.latitude || coordI.lat) : null;
    const yi = typeof coordI === 'object' ? (coordI.longitude || coordI.lng) : null;
    const xj = typeof coordJ === 'object' ? (coordJ.latitude || coordJ.lat) : null;
    const yj = typeof coordJ === 'object' ? (coordJ.longitude || coordJ.lng) : null;

    if (xi === null || yi === null || xj === null || yj === null) continue;

    const intersect = ((yi > longitude) !== (yj > longitude)) &&
      (latitude < ((xj - xi) * (longitude - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
};

const findContainingZone = (zones, latitude, longitude) => {
  if (!Array.isArray(zones)) return null;
  return zones.find((zone) => isPointInsideZone(zone, latitude, longitude)) || null;
};

const resolveEntityZoneFromActiveZones = (entity, activeZones = []) => {
  const explicitZoneId = String(
    entity?.zoneId?._id ||
    entity?.zoneId?.id ||
    entity?.zoneId ||
    ''
  ).trim();

  if (explicitZoneId) {
    const explicitZone = activeZones.find((zone) => String(zone?._id || '') === explicitZoneId);
    if (explicitZone) return explicitZone;
  }

  const entityIdCandidates = new Set([
    String(entity?._id || '').trim(),
    String(entity?.restaurantId || '').trim()
  ].filter(Boolean));

  const linkedZone = activeZones.find((zone) => {
    const linkedRestaurantId = String(zone?.restaurantId?._id || zone?.restaurantId || '').trim();
    return linkedRestaurantId && entityIdCandidates.has(linkedRestaurantId);
  });
  if (linkedZone) return linkedZone;

  const entityLat = Number(entity?.location?.latitude ?? entity?.location?.coordinates?.[1]);
  const entityLng = Number(entity?.location?.longitude ?? entity?.location?.coordinates?.[0]);
  if (!Number.isFinite(entityLat) || !Number.isFinite(entityLng)) return null;

  return findContainingZone(activeZones, entityLat, entityLng);
};

const parseTimeToMinutes = (timeValue) => {
  if (!timeValue || typeof timeValue !== 'string') return null;
  const normalized = timeValue.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3] || null;

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
};

const parseSlotTimeToMinutes = (timeValue, periodValue) => {
  if (!timeValue || typeof timeValue !== 'string') return null;
  const normalizedTime = timeValue.trim();
  const normalizedPeriod = String(periodValue || '').trim().toUpperCase();
  if (!normalizedPeriod || (normalizedPeriod !== 'AM' && normalizedPeriod !== 'PM')) return null;
  return parseTimeToMinutes(`${normalizedTime} ${normalizedPeriod}`);
};

const isWithinTimeWindow = (currentMinutes, openingMinutes, closingMinutes) => {
  if (
    !Number.isFinite(currentMinutes) ||
    !Number.isFinite(openingMinutes) ||
    !Number.isFinite(closingMinutes)
  ) {
    return false;
  }

  if (openingMinutes === closingMinutes) return true;
  if (closingMinutes > openingMinutes) {
    return currentMinutes >= openingMinutes && currentMinutes <= closingMinutes;
  }
  return currentMinutes >= openingMinutes || currentMinutes <= closingMinutes;
};

const evaluateRestaurantAvailabilityAt = async (restaurant, atDate = new Date()) => {
  if (!restaurant || typeof restaurant !== 'object') {
    return { isAvailable: false, reason: 'Restaurant not found' };
  }

  if (restaurant.isActive === false) {
    return { isAvailable: false, reason: 'Restaurant is currently inactive' };
  }

  if (restaurant.isAcceptingOrders === false) {
    return { isAvailable: false, reason: 'Restaurant is not accepting orders right now' };
  }

  const outletTimings = await OutletTimings.findOne({
    restaurantId: restaurant._id,
    isActive: true
  })
    .select('timings')
    .lean();

  const timings = Array.isArray(outletTimings?.timings) ? outletTimings.timings : [];
  if (timings.length > 0) {
    return isOpenFromOutletTimings(timings, atDate)
      ? { isAvailable: true, reason: '' }
      : { isAvailable: false, reason: 'Restaurant is currently closed' };
  }

  const dayName = atDate.toLocaleDateString('en-US', { weekday: 'long' });
  const currentMinutes = atDate.getHours() * 60 + atDate.getMinutes();

  const openDays = Array.isArray(restaurant.openDays) ? restaurant.openDays : [];
  if (openDays.length > 0) {
    const openToday = openDays.some((day) =>
      String(day || '').slice(0, 3).toLowerCase() === String(dayName).slice(0, 3).toLowerCase()
    );
    if (!openToday) {
      return { isAvailable: false, reason: 'Restaurant is closed today' };
    }
  }

  const openingMinutes = parseTimeToMinutes(restaurant?.deliveryTimings?.openingTime);
  const closingMinutes = parseTimeToMinutes(restaurant?.deliveryTimings?.closingTime);
  if (
    Number.isFinite(openingMinutes) &&
    Number.isFinite(closingMinutes) &&
    !isWithinTimeWindow(currentMinutes, openingMinutes, closingMinutes)
  ) {
    return { isAvailable: false, reason: 'Restaurant is currently closed' };
  }

  return { isAvailable: true, reason: '' };
};

const getMenuItemFinalPrice = (menuItem = {}) => {
  const basePrice = Number(menuItem.price || 0);
  const originalPrice = Number(menuItem.originalPrice || basePrice);
  const discountAmount = Number(menuItem.discountAmount || 0);
  const discountType = menuItem.discountType;

  if (discountAmount > 0 && originalPrice > 0) {
    if (discountType === 'Percent') {
      return Math.max(0, Number((originalPrice - (originalPrice * discountAmount / 100)).toFixed(2)));
    }
    if (discountType === 'Fixed') {
      return Math.max(0, Number((originalPrice - discountAmount).toFixed(2)));
    }
  }

  return Math.max(0, Number(basePrice.toFixed(2)));
};

const buildMenuItemsMap = (menu) => {
  const map = new Map();
  const sections = Array.isArray(menu?.sections) ? menu.sections : [];

  // Core menu items (sections + subsections)
  sections.forEach((section) => {
    const sectionItems = Array.isArray(section?.items) ? section.items : [];
    sectionItems.forEach((item) => {
      const itemId = String(item?.id || '').trim();
      if (!itemId) return;

      const isAvailable = item?.isAvailable !== false;
      const isApproved = !item?.approvalStatus || item.approvalStatus === 'approved';
      if (!isAvailable || !isApproved) return;

      map.set(itemId, {
        itemId,
        name: item?.name || 'Item',
        price: getMenuItemFinalPrice(item),
        image: item?.image || (Array.isArray(item?.images) ? item.images[0] : '') || '',
        description: item?.description || '',
        isVeg: item?.foodType === 'Veg'
      });
    });

    const subsections = Array.isArray(section?.subsections) ? section.subsections : [];
    subsections.forEach((subsection) => {
      const subsectionItems = Array.isArray(subsection?.items) ? subsection.items : [];
      subsectionItems.forEach((item) => {
        const itemId = String(item?.id || '').trim();
        if (!itemId) return;

        const isAvailable = item?.isAvailable !== false;
        const isApproved = !item?.approvalStatus || item.approvalStatus === 'approved';
        if (!isAvailable || !isApproved) return;

        map.set(itemId, {
          itemId,
          name: item?.name || 'Item',
          price: getMenuItemFinalPrice(item),
          image: item?.image || (Array.isArray(item?.images) ? item.images[0] : '') || '',
          description: item?.description || '',
          isVeg: item?.foodType === 'Veg'
        });
      });
    });
  });

  // Restaurant add-ons (menu.addons) should also be treated as valid
  // menu items so that "Complete your meal" add-ons can be added to cart.
  const addons = Array.isArray(menu?.addons) ? menu.addons : [];
  addons.forEach((addon) => {
    // Support both legacy addons that only have Mongo _id
    // and newer ones that have a custom string id field.
    const rawId = addon?.id || addon?._id;
    const itemId = String(rawId || '').trim();
    if (!itemId) return;

    const isAvailable = addon?.isAvailable !== false;
    // For add-ons, allow all records that are marked available,
    // regardless of approvalStatus. This keeps add-on ordering
    // aligned with what the public add-ons API returns.
    if (!isAvailable) return;

    map.set(itemId, {
      itemId,
      name: addon?.name || 'Item',
      price: getMenuItemFinalPrice(addon),
      image:
        addon?.image ||
        (Array.isArray(addon?.images) ? addon.images[0] : '') ||
        '',
      description: addon?.description || '',
      isVeg: addon?.foodType === 'Veg'
    });
  });

  return map;
};

const buildGroceryItemsMap = (products = []) => {
  const map = new Map();
  (Array.isArray(products) ? products : []).forEach((product) => {
    const itemId = String(product?._id || '').trim();
    if (!itemId) return;

    map.set(itemId, {
      itemId,
      name: product?.name || 'Item',
      price: Number(product?.price || 0),
      image:
        product?.image ||
        (Array.isArray(product?.images) ? product.images[0] : '') ||
        '',
      description: product?.description || '',
      isVeg: false
    });
  });
  return map;
};

const resolveRestaurantObjectId = async (restaurantId) => {
  if (!restaurantId) return null;
  const normalized = String(restaurantId).trim();
  if (!normalized) return null;

  if (mongoose.Types.ObjectId.isValid(normalized) && normalized.length === 24) {
    return normalized;
  }

  const restaurant = await findRestaurantOrStoreByIdentifier(normalized);

  return restaurant?._id ? String(restaurant._id) : null;
};

const normalizeEntityId = (value) => {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  if (typeof value === 'object') {
    const candidate =
      value._id ||
      value.id ||
      value.restaurantId ||
      value.storeId ||
      value.value ||
      '';
    return candidate ? String(candidate).trim() : '';
  }
  return '';
};

const extractItemSourceId = (item = {}) => {
  return (
    normalizeEntityId(item.restaurantId) ||
    normalizeEntityId(item.storeId) ||
    normalizeEntityId(item.restaurant) ||
    normalizeEntityId(item.store) ||
    ''
  );
};

const validateSingleSourceOrderItems = async ({
  items,
  platform = 'mofood',
  expectedRestaurant = {}
}) => {
  const normalizedPlatform = platform === 'mogrocery' ? 'mogrocery' : 'mofood';
  const sourceLabel = normalizedPlatform === 'mogrocery' ? 'store' : 'restaurant';
  const uniqueItemIds = Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => String(item?.itemId || '').trim())
        .filter(Boolean)
    )
  );

  if (uniqueItemIds.length === 0) {
    return {
      valid: false,
      message: `Order items are invalid. Please add items from one ${sourceLabel} and try again.`
    };
  }

  const expectedRestaurantObjectId =
    normalizeEntityId(expectedRestaurant?._id) ||
    (await resolveRestaurantObjectId(
      expectedRestaurant?.restaurantId ||
      expectedRestaurant?.providedRestaurantId ||
      ''
    ));

  const expectedSourceIds = new Set(
    [
      normalizeEntityId(expectedRestaurantObjectId),
      normalizeEntityId(expectedRestaurant?.restaurantId),
      normalizeEntityId(expectedRestaurant?.providedRestaurantId),
      normalizeEntityId(expectedRestaurant?.slug)
    ].filter(Boolean)
  );

  const explicitItemSourceIds = new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => extractItemSourceId(item))
      .filter(Boolean)
  );

  if (explicitItemSourceIds.size > 1) {
    return {
      valid: false,
      message: `Your cart has items from multiple ${sourceLabel}s. Please keep items from one ${sourceLabel} only.`
    };
  }

  if (explicitItemSourceIds.size === 1 && expectedSourceIds.size > 0) {
    const [itemSourceId] = Array.from(explicitItemSourceIds);
    if (!expectedSourceIds.has(itemSourceId)) {
      return {
        valid: false,
        message: `Your cart items do not match the selected ${sourceLabel}. Please review your cart and try again.`
      };
    }
  }

  if (normalizedPlatform === 'mogrocery') {
    const invalidItemIds = uniqueItemIds.filter(
      (itemId) => !mongoose.Types.ObjectId.isValid(itemId)
    );
    if (invalidItemIds.length > 0) {
      return {
        valid: false,
        message: 'Some cart items are invalid. Please refresh cart and try again.'
      };
    }

    const products = await GroceryProduct.find({
      _id: { $in: uniqueItemIds.map((id) => new mongoose.Types.ObjectId(id)) }
    })
      .select('_id storeId')
      .lean();

    if (products.length !== uniqueItemIds.length) {
      return {
        valid: false,
        message: 'Some cart items are unavailable for the selected store. Please refresh cart and try again.'
      };
    }

    const productStoreIds = new Set(
      products.map((product) => normalizeEntityId(product?.storeId)).filter(Boolean)
    );

    if (productStoreIds.size !== 1) {
      return {
        valid: false,
        message: 'Your cart has items from multiple stores. Please keep items from one store only.'
      };
    }

    if (expectedRestaurantObjectId && !productStoreIds.has(expectedRestaurantObjectId)) {
      return {
        valid: false,
        message: 'Your cart items do not belong to the selected store. Please review cart and try again.'
      };
    }

    return { valid: true };
  }

  if (!expectedRestaurantObjectId) {
    return {
      valid: false,
      message: 'Unable to validate restaurant for cart items. Please try again.'
    };
  }

  // For restaurant (mofood) orders, validate against ALL menus for this restaurant.
  // This avoids mismatches where add-ons exist on a non-active menu document.
  const menus = await Menu.find({
    restaurant: expectedRestaurantObjectId
  }).lean();

  if (!menus || menus.length === 0) {
    return {
      valid: false,
      message: 'Restaurant menu is unavailable. Please try again.'
    };
  }

  const menuItemsMap = new Map();
  menus.forEach((menuDoc) => {
    const mapForMenu = buildMenuItemsMap(menuDoc);
    mapForMenu.forEach((value, key) => {
      if (!menuItemsMap.has(key)) {
        menuItemsMap.set(key, value);
      }
    });
  });

  const invalidMenuItems = uniqueItemIds.filter((itemId) => !menuItemsMap.has(itemId));
  if (invalidMenuItems.length > 0) {
    return {
      valid: false,
      message: 'Some cart items are unavailable for the selected restaurant. Please refresh cart and try again.'
    };
  }

  return { valid: true };
};

const buildEditedItemsForOrder = ({ order, incomingItems, menuItemsMap }) => {
  const aggregatedQuantities = new Map();
  incomingItems.forEach((item) => {
    const itemId = String(item?.itemId || '').trim();
    if (!itemId) return;
    const quantity = Math.max(1, Number(item?.quantity || 1));
    aggregatedQuantities.set(itemId, (aggregatedQuantities.get(itemId) || 0) + quantity);
  });

  const existingItemsMap = new Map(
    (Array.isArray(order?.items) ? order.items : [])
      .filter((item) => item?.itemId)
      .map((item) => [String(item.itemId), item])
  );

  const invalidItemIds = [];
  const nextItems = [];

  aggregatedQuantities.forEach((quantity, itemId) => {
    const existingOrderItem = existingItemsMap.get(itemId);
    if (existingOrderItem) {
      nextItems.push({
        itemId,
        name: existingOrderItem.name,
        price: Number(existingOrderItem.price || 0),
        quantity: Number(quantity),
        image: existingOrderItem.image || '',
        description: existingOrderItem.description || '',
        isVeg: existingOrderItem.isVeg !== false
      });
      return;
    }

    const menuItem = menuItemsMap.get(itemId);
    if (!menuItem) {
      invalidItemIds.push(itemId);
      return;
    }

    nextItems.push({
      itemId: menuItem.itemId,
      name: menuItem.name,
      price: Number(menuItem.price || 0),
      quantity: Number(quantity),
      image: menuItem.image || '',
      description: menuItem.description || '',
      isVeg: menuItem.isVeg !== false
    });
  });

  return { nextItems, invalidItemIds };
};

const calculateUpdatedTotals = (order, items) => {
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  const deliveryFee = Number(order.pricing?.deliveryFee || 0);
  const platformFee = Number(order.pricing?.platformFee || 0);
  const tax = Number(order.pricing?.tax || 0);
  const discount = Number(order.pricing?.discount || 0);
  const total = Math.max(0, subtotal + deliveryFee + platformFee + tax - discount);

  return {
    subtotal: Number(subtotal.toFixed(2)),
    total: Number(total.toFixed(2))
  };
};

const applyEditedCartToOrder = (order, sanitizedItems, totals) => {
  order.items = sanitizedItems;
  order.pricing.subtotal = totals.subtotal;
  order.pricing.total = totals.total;
  const postOrderActions = ensurePostOrderActionsShape(order);
  postOrderActions.lastCartEditedAt = new Date();
  postOrderActions.cartEditCount = Number(postOrderActions.cartEditCount || 0) + 1;
  postOrderActions.pendingCartEdit = getDefaultPendingCartEdit();
};

const isMoGroceryPlanSubscriptionOrder = (order) => {
  if (!order || typeof order !== 'object') return false;

  if (order?.planSubscription?.planId || order?.planSubscription?.planName) {
    return true;
  }

  const note = String(order?.note || '').toLowerCase();
  if (note.includes('[mogold plan]') || note.includes('plan subscription')) {
    return true;
  }

  return false;
};

const applyPostEditAdminApprovalState = (order, { requiresAdminReapproval = false } = {}) => {
  if (!requiresAdminReapproval) return;

  order.adminApproval = {
    status: 'pending',
    reason: 'Order edited by customer. Requires re-approval.',
    reviewedAt: null,
    reviewedBy: null
  };

  // Re-open MoGrocery edited orders for admin approval flow.
  order.status = 'pending';
  if (order.tracking && typeof order.tracking === 'object') {
    order.tracking.preparing = { status: false, timestamp: null };
  }

  order.deliveryPartnerId = null;
  order.acceptanceInfo = {
    source: null,
    acceptedAt: null,
    acceptedByAdmin: null
  };

  if (!order.assignmentInfo || typeof order.assignmentInfo !== 'object') {
    order.assignmentInfo = {};
  }
  order.assignmentInfo.deliveryPartnerId = null;
  order.assignmentInfo.assignedAt = null;

  if (!order.deliveryState || typeof order.deliveryState !== 'object') {
    order.deliveryState = {};
  }
  order.deliveryState.status = 'pending';
  order.deliveryState.currentPhase = 'assigned';
  order.deliveryState.acceptedAt = null;
  order.deliveryState.reachedPickupAt = null;
  order.deliveryState.orderIdConfirmedAt = null;
  order.deliveryState.routeToPickup = {};
  order.deliveryState.routeToDelivery = {};
};

const generateUniqueOrderId = async () => {
  // Retry a few times in case of rare ID collisions on unique index.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const timestamp = Date.now();
    const random = crypto.randomInt(100000, 999999);
    const candidate = `ORD-${timestamp}-${random}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await Order.exists({
      $or: [
        { orderId: candidate },
        { orderNumber: candidate }
      ]
    });
    if (!exists) return candidate;
  }
  throw new Error('Unable to generate unique order ID');
};

const saveOrderWithIdRetry = async (orderDoc, maxRetries = 3) => {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await orderDoc.save();
      return;
    } catch (error) {
      const isDuplicateOrderLikeField =
        error?.code === 11000 &&
        (
          error?.keyPattern?.orderId ||
          error?.keyPattern?.orderNumber ||
          String(error?.message || '').includes('orderId') ||
          String(error?.message || '').includes('orderNumber')
        );

      if (!isDuplicateOrderLikeField || attempt === maxRetries) {
        throw error;
      }

      // eslint-disable-next-line no-await-in-loop
      const regeneratedOrderId = await generateUniqueOrderId();
      orderDoc.orderId = regeneratedOrderId;
      orderDoc.orderNumber = regeneratedOrderId;
    }
  }
};

/**
 * Create a new order and initiate Razorpay payment
 */
export const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      items,
      address,
      restaurantId,
      restaurantName,
      pricing: incomingPricing,
      deliveryFleet,
      note,
      sendCutlery,
      paymentMethod: bodyPaymentMethod,
      deliveryOption,
      scheduledFor: scheduledForRaw,
      deliveryTimeSlot,
      planSubscription,
      platform
    } = req.body;
    const requestedPlatform = platform === 'mogrocery' ? 'mogrocery' : 'mofood';
    // Support both camelCase and snake_case from client
    const paymentMethod = bodyPaymentMethod ?? req.body.payment_method;

    // Normalize payment method: 'cod' / 'COD' / 'Cash on Delivery' → 'cash', 'wallet' → 'wallet'
    const normalizedPaymentMethod = (() => {
      const m = (paymentMethod && String(paymentMethod).toLowerCase().trim()) || '';
      if (m === 'cash' || m === 'cod' || m === 'cash on delivery') return 'cash';
      if (m === 'wallet') return 'wallet';
      return paymentMethod || 'razorpay';
    })();
    logger.info('Order create paymentMethod:', { raw: paymentMethod, normalized: normalizedPaymentMethod, bodyKeys: Object.keys(req.body || {}).filter(k => k.toLowerCase().includes('payment')) });

    const normalizedDeliveryOption = String(deliveryOption || '').toLowerCase();
    const isScheduleRequested =
      normalizedDeliveryOption === 'schedule' ||
      normalizedDeliveryOption === 'scheduled' ||
      Boolean(scheduledForRaw);
    const scheduledForDate = isScheduleRequested && scheduledForRaw ? new Date(scheduledForRaw) : null;
    if (isScheduleRequested) {
      if (!scheduledForDate || Number.isNaN(scheduledForDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid scheduled delivery time'
        });
      }
      if (scheduledForDate.getTime() <= Date.now()) {
        return res.status(400).json({
          success: false,
          message: 'Scheduled delivery time must be in the future'
        });
      }
    }
    const isFutureScheduledOrder = Boolean(isScheduleRequested && scheduledForDate);
    const normalizedPlanSubscription = (() => {
      if (!planSubscription || typeof planSubscription !== 'object') return null;
      const rawPlanId = planSubscription.planId;
      if (!rawPlanId || !mongoose.Types.ObjectId.isValid(rawPlanId)) return null;
      const selectedOfferIds = Array.from(
        new Set(
          (Array.isArray(planSubscription.selectedOfferIds) ? planSubscription.selectedOfferIds : [])
            .map((value) => {
              const normalized = typeof value === 'string' ? value : value?._id || value?.id || value;
              return mongoose.Types.ObjectId.isValid(normalized) ? normalized.toString() : null;
            })
            .filter(Boolean)
        )
      ).map((id) => new mongoose.Types.ObjectId(id));
      const selectedSubcategoryId =
        mongoose.Types.ObjectId.isValid(planSubscription.selectedSubcategoryId)
          ? new mongoose.Types.ObjectId(planSubscription.selectedSubcategoryId)
          : null;
      const selectedSubcategoryIds = Array.from(
        new Set(
          (Array.isArray(planSubscription.selectedSubcategoryIds) ? planSubscription.selectedSubcategoryIds : [])
            .map((value) => {
              const normalized = typeof value === 'string' ? value : value?._id || value?.id || value;
              return mongoose.Types.ObjectId.isValid(normalized) ? normalized.toString() : null;
            })
            .filter(Boolean)
        )
      ).map((id) => new mongoose.Types.ObjectId(id));
      const selectedProductIds = Array.from(
        new Set(
          (Array.isArray(planSubscription.selectedProductIds) ? planSubscription.selectedProductIds : [])
            .map((value) => {
              const normalized = typeof value === 'string' ? value : value?._id || value?.id || value;
              return mongoose.Types.ObjectId.isValid(normalized) ? normalized.toString() : null;
            })
            .filter(Boolean)
        )
      ).map((id) => new mongoose.Types.ObjectId(id));
      const selectedStoreId =
        mongoose.Types.ObjectId.isValid(planSubscription.selectedStoreId)
          ? new mongoose.Types.ObjectId(planSubscription.selectedStoreId)
          : null;
      return {
        planId: new mongoose.Types.ObjectId(rawPlanId),
        planName: (planSubscription.planName || '').toString().trim(),
        durationDays: Number(planSubscription.durationDays || 0),
        selectedOfferIds,
        selectedSubcategoryId,
        selectedSubcategoryIds,
        selectedProductIds,
        selectedStoreId
      };
    })();
    const isPlanSubscriptionOrder = Boolean(normalizedPlanSubscription?.planId);
    if (isPlanSubscriptionOrder) {
      const planIdString = normalizedPlanSubscription.planId.toString();
      const selectedOfferIdStrings = (normalizedPlanSubscription.selectedOfferIds || []).map((id) => id.toString());
      const selectedSubcategoryIdStrings = Array.from(
        new Set([
          ...(normalizedPlanSubscription.selectedSubcategoryId
            ? [normalizedPlanSubscription.selectedSubcategoryId.toString()]
            : []),
          ...((normalizedPlanSubscription.selectedSubcategoryIds || []).map((id) => id.toString()))
        ])
      );
      const selectedProductIdStrings = (normalizedPlanSubscription.selectedProductIds || []).map((id) => id.toString());

      const planDoc = await GroceryPlan.findById(planIdString).select('offerIds productCount isActive zoneStoreRules').lean();
      if (!planDoc || planDoc.isActive === false) {
        return res.status(400).json({
          success: false,
          message: 'Selected plan is not available'
        });
      }
      const selectedStoreIdString = normalizedPlanSubscription.selectedStoreId
        ? normalizedPlanSubscription.selectedStoreId.toString()
        : '';
      const restaurantIdString = String(restaurantId || '').trim();
      if (selectedStoreIdString && restaurantIdString && selectedStoreIdString !== restaurantIdString) {
        return res.status(400).json({
          success: false,
          message: 'Plan store does not match selected store'
        });
      }

      const zoneStoreRules = Array.isArray(planDoc.zoneStoreRules) ? planDoc.zoneStoreRules : [];
      const hasZoneStoreRules = zoneStoreRules.length > 0;
      let allowedSubcategoryIds = new Set();

      if (hasZoneStoreRules) {
        if (!selectedStoreIdString) {
          return res.status(400).json({
            success: false,
            message: 'Please select a store for this plan'
          });
        }

        const matchingRule = zoneStoreRules.find((rule) => {
          const ruleStoreId = rule?.storeId ? String(rule.storeId) : '';
          return ruleStoreId === selectedStoreIdString;
        });
        if (!matchingRule) {
          return res.status(400).json({
            success: false,
            message: 'Selected store is not configured for this plan'
          });
        }

        allowedSubcategoryIds = new Set(
          (Array.isArray(matchingRule.subcategoryIds) ? matchingRule.subcategoryIds : [])
            .map((id) => String(id))
            .filter(Boolean)
        );
      }

      const linkedPlanOfferIds = new Set(
        (Array.isArray(planDoc.offerIds) ? planDoc.offerIds : [])
          .map((id) => (id ? id.toString() : null))
          .filter(Boolean)
      );

      if (selectedOfferIdStrings.some((offerId) => !linkedPlanOfferIds.has(offerId))) {
        return res.status(400).json({
          success: false,
          message: 'One or more selected offers are not linked to this plan'
        });
      }

      const offerIdsForValidation = selectedOfferIdStrings.length > 0
        ? selectedOfferIdStrings
        : Array.from(linkedPlanOfferIds);
      if (!hasZoneStoreRules) {
        const offersForValidation = offerIdsForValidation.length > 0
          ? await GroceryPlanOffer.find({ _id: { $in: offerIdsForValidation }, isActive: true })
            .select('subcategoryIds')
            .lean()
          : [];

        offersForValidation.forEach((offer) => {
          (Array.isArray(offer?.subcategoryIds) ? offer.subcategoryIds : []).forEach((subcategoryId) => {
            if (subcategoryId) allowedSubcategoryIds.add(subcategoryId.toString());
          });
        });
      }

      if (selectedSubcategoryIdStrings.some((subcategoryId) => !allowedSubcategoryIds.has(subcategoryId))) {
        return res.status(400).json({
          success: false,
          message: 'One or more selected subcategories are not linked to the chosen plan offers'
        });
      }

      if (selectedProductIdStrings.length > 0 && selectedSubcategoryIdStrings.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please select subcategories before selecting products'
        });
      }

      const expectedSubcategoryCount = allowedSubcategoryIds.size;
      const shouldRequireEverySubcategory = expectedSubcategoryCount > 0;
      if (
        shouldRequireEverySubcategory &&
        (selectedSubcategoryIdStrings.length !== expectedSubcategoryCount || selectedProductIdStrings.length !== expectedSubcategoryCount)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Please select exactly one product for each configured subcategory'
        });
      }

      if (
        !shouldRequireEverySubcategory &&
        selectedSubcategoryIdStrings.length > 0 &&
        selectedProductIdStrings.length !== selectedSubcategoryIdStrings.length
      ) {
        return res.status(400).json({
          success: false,
          message: 'You must select exactly one product per selected subcategory'
        });
      }

      if (
        allowedSubcategoryIds.size === 0 &&
        Number(planDoc.productCount || 0) > 0 &&
        selectedProductIdStrings.length > Number(planDoc.productCount || 0)
      ) {
        return res.status(400).json({
          success: false,
          message: `You can select up to ${Number(planDoc.productCount || 0)} products for this plan`
        });
      }

      if (selectedProductIdStrings.length > 0 && selectedSubcategoryIdStrings.length > 0) {
        const productQuery = {
          _id: { $in: selectedProductIdStrings },
          isActive: true
        };
        if (selectedStoreIdString) {
          productQuery.storeId = selectedStoreIdString;
        }

        const matchedProducts = await GroceryProduct.find(productQuery)
          .select('_id subcategory subcategories')
          .lean();

        if ((Array.isArray(matchedProducts) ? matchedProducts.length : 0) !== selectedProductIdStrings.length) {
          return res.status(400).json({
            success: false,
            message: 'One or more selected products are invalid or inactive'
          });
        }

        for (const subcategoryId of selectedSubcategoryIdStrings) {
          const countForSubcategory = matchedProducts.filter((product) => {
            const primarySubcategory = product?.subcategory ? String(product.subcategory) : '';
            const extraSubcategories = Array.isArray(product?.subcategories)
              ? product.subcategories.map((id) => String(id))
              : [];
            return primarySubcategory === subcategoryId || extraSubcategories.includes(subcategoryId);
          }).length;

          if (countForSubcategory !== 1) {
            return res.status(400).json({
              success: false,
              message: 'Select exactly one product from each selected subcategory'
            });
          }
        }
      }
    }
    let requiresAdminApproval = false;

    // Ensure user has mandatory profile details before placing order
    const userProfile = await User.findById(userId).select('phone addresses').lean();
    const userPhone = String(userProfile?.phone || '').trim();
    const savedAddressesCount = Array.isArray(userProfile?.addresses) ? userProfile.addresses.length : 0;

    if (!userPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please add your phone number in profile before placing an order.'
      });
    }

    if (savedAddressesCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please add at least one saved address in profile before placing an order.'
      });
    }

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must have at least one item'
      });
    }

    const normalizedAddress = normalizeOrderAddress(address);
    if (!normalizedAddress) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address is required'
      });
    }

    // Normalize incoming restaurant ID to avoid format mismatches (string/object/_id/restaurantId).
    const normalizedIncomingRestaurantId = (
      typeof restaurantId === 'object' && restaurantId !== null
        ? (restaurantId._id || restaurantId.restaurantId || restaurantId.id || '')
        : restaurantId
    )?.toString?.().trim?.() || String(restaurantId || '').trim();
    console.log('Incoming restaurantId:', normalizedIncomingRestaurantId);

    // Validate and assign restaurant - order goes to the restaurant whose food was ordered
    if (!normalizedIncomingRestaurantId || normalizedIncomingRestaurantId === 'unknown') {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required. Please select a restaurant.'
      });
    }

    let assignedRestaurantId = normalizedIncomingRestaurantId;
    let assignedRestaurantName = restaurantName;

    // Log incoming restaurant data for debugging
    logger.info('🔍 Order creation - Restaurant lookup:', {
      incomingRestaurantId: normalizedIncomingRestaurantId,
      incomingRestaurantName: restaurantName,
      restaurantIdType: typeof restaurantId,
      restaurantIdLength: normalizedIncomingRestaurantId?.length
    });

    // Find and validate the restaurant
    const restaurant = await findRestaurantOrStoreByIdentifier(normalizedIncomingRestaurantId);
    logger.info('🔍 Restaurant/store lookup by _id/restaurantId/slug:', {
      restaurantId: normalizedIncomingRestaurantId,
      found: !!restaurant,
      restaurantName: restaurant?.name,
      entityRestaurantId: restaurant?.restaurantId,
      entityId: restaurant?._id?.toString?.()
    });

    if (!restaurant) {
      logger.error('❌ Restaurant not found:', {
        searchedRestaurantId: normalizedIncomingRestaurantId,
        searchedRestaurantName: restaurantName
      });
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // CRITICAL: Validate restaurant name matches
    if (restaurantName && restaurant.name !== restaurantName) {
      logger.warn('⚠️ Restaurant name mismatch:', {
        incomingName: restaurantName,
        foundRestaurantName: restaurant.name,
        incomingRestaurantId: normalizedIncomingRestaurantId,
        foundRestaurantId: restaurant._id?.toString() || restaurant.restaurantId
      });
      // Still proceed but log the mismatch
    }

    const immediateAvailability = await evaluateRestaurantAvailabilityAt(restaurant, new Date());
    if (!immediateAvailability.isAvailable) {
      logger.warn('⚠️ Restaurant unavailable for order placement:', {
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name,
        reason: immediateAvailability.reason
      });
      return res.status(403).json({
        success: false,
        message: immediateAvailability.reason || 'Restaurant is currently unavailable'
      });
    }

    const restaurantPlatform = restaurant.platform === 'mogrocery' ? 'mogrocery' : 'mofood';
    // Respect explicit grocery orders even if store platform flag is stale in DB.
    const platformForValidation = requestedPlatform === 'mogrocery' ? 'mogrocery' : restaurantPlatform;
    // Align MoGrocery with restaurant flow: send orders directly to store without admin queue.
    requiresAdminApproval = false;

    if (isFutureScheduledOrder && scheduledForDate) {
      const scheduledAvailability = await evaluateRestaurantAvailabilityAt(restaurant, scheduledForDate);
      if (!scheduledAvailability.isAvailable) {
        return res.status(400).json({
          success: false,
          message: `Selected delivery slot is unavailable. ${scheduledAvailability.reason || 'Please choose another time.'}`
        });
      }
    }

    // CRITICAL: Validate that restaurant/store location (pin) is within an active zone for its platform
    const restaurantLat = restaurant.location?.latitude || restaurant.location?.coordinates?.[1];
    const restaurantLng = restaurant.location?.longitude || restaurant.location?.coordinates?.[0];

    if (!restaurantLat || !restaurantLng) {
      logger.error('❌ Restaurant location not found:', {
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name
      });
      return res.status(400).json({
        success: false,
      message: platformForValidation === 'mogrocery'
          ? 'Store location is not set. Please contact support.'
          : 'Restaurant location is not set. Please contact support.'
      });
    }

    // Check if restaurant/store is within any active zone for this platform
    const activeZoneQuery = platformForValidation === 'mogrocery'
      ? { isActive: true, platform: 'mogrocery' }
      : {
        isActive: true,
        $or: [{ platform: 'mofood' }, { platform: { $exists: false } }]
      };

    const activeZones = await Zone.find(activeZoneQuery).lean();
    const restaurantZone = resolveEntityZoneFromActiveZones(restaurant, activeZones);
    const restaurantInZone = Boolean(restaurantZone);

    if (!restaurantInZone) {
      logger.warn('⚠️ Restaurant location is not within any active zone:', {
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name,
        platform: platformForValidation,
        restaurantLat,
        restaurantLng
      });
      return res.status(403).json({
        success: false,
        message: platformForValidation === 'mogrocery'
          ? 'This store is not available in your area. Only stores within active delivery zones can receive orders.'
          : 'This restaurant is not available in your area. Only restaurants within active delivery zones can receive orders.'
      });
    }

    logger.info('✅ Restaurant validated - location is within active zone:', {
      restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
      restaurantName: restaurant.name,
      zoneId: restaurantZone?._id?.toString(),
      zoneName: restaurantZone?.name || restaurantZone?.zoneName
    });

    // CRITICAL: Validate delivery address is in a service zone and must match restaurant zone.
    const { zoneId: userZoneId } = req.body; // Optional hint from frontend
    const userLat = Number(normalizedAddress?.location?.coordinates?.[1]);
    const userLng = Number(normalizedAddress?.location?.coordinates?.[0]);

    if (!Number.isFinite(userLat) || !Number.isFinite(userLng) || (userLat === 0 && userLng === 0)) {
      logger.warn('⚠️ User delivery coordinates missing/invalid for zone validation', {
        orderUserId: String(userId),
        userLat,
        userLng
      });
      return res.status(400).json({
        success: false,
        message: 'Delivery address is required to validate your service zone.'
      });
    }

    const userZone = findContainingZone(activeZones, userLat, userLng);
    if (!userZone) {
      logger.warn('⚠️ User delivery location is outside active zone:', {
        orderUserId: String(userId),
        platform: platformForValidation,
        userLat,
        userLng
      });
      return res.status(403).json({
        success: false,
        message: platformForValidation === 'mogrocery'
          ? 'You are out of zone. Please choose an address inside the service area.'
          : 'You are out of zone. Please choose an address inside the service area.'
      });
    }

    const restaurantZoneId = String(restaurantZone._id);
    const userZoneIdResolved = String(userZone._id);
    if (restaurantZoneId !== userZoneIdResolved) {
      logger.warn('⚠️ Zone mismatch - user and restaurant are in different zones:', {
        userZoneIdProvided: userZoneId || null,
        userZoneIdResolved,
        restaurantZoneId,
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name
      });
      return res.status(403).json({
        success: false,
        message: platformForValidation === 'mogrocery'
          ? 'This store is not available in your zone. Please select a store from your current delivery zone.'
          : 'This restaurant is not available in your zone. Please select a restaurant from your current delivery zone.'
      });
    }

    logger.info('✅ Zone match validated - user and restaurant are in the same zone:', {
      userZoneIdProvided: userZoneId || null,
      zoneId: userZoneIdResolved,
      restaurantId: restaurant._id?.toString() || restaurant.restaurantId
    });

    assignedRestaurantId = restaurant._id?.toString() || restaurant.restaurantId;
    assignedRestaurantName = restaurant.name;

    const singleSourceValidation = await validateSingleSourceOrderItems({
      items,
      platform: platformForValidation,
      expectedRestaurant: {
        _id: restaurant._id,
        restaurantId: restaurant.restaurantId,
        providedRestaurantId: normalizedIncomingRestaurantId,
        slug: restaurant.slug
      }
    });
    if (!singleSourceValidation.valid) {
      return res.status(400).json({
        success: false,
        message: singleSourceValidation.message
      });
    }

    // Always trust server-side pricing so plan benefits (free delivery/discount) are guaranteed.
    const couponCode = req.body?.couponCode || incomingPricing?.couponCode || incomingPricing?.appliedCoupon?.code || null;
    const pricingPlatform = requestedPlatform === 'mogrocery' ? 'mogrocery' : restaurantPlatform;
    const pricing = await calculateOrderPricing({
      items,
      restaurantId: assignedRestaurantId,
      deliveryAddress: normalizedAddress,
      couponCode,
      deliveryFleet: deliveryFleet || 'standard',
      userId,
      platform: pricingPlatform,
      zoneId: userZoneIdResolved || null
    });

    // Log restaurant assignment for debugging
    logger.info('✅ Restaurant assigned to order:', {
      assignedRestaurantId: assignedRestaurantId,
      assignedRestaurantName: assignedRestaurantName,
      restaurant_id: restaurant._id?.toString(),
      restaurant_restaurantId: restaurant.restaurantId,
      incomingRestaurantId: normalizedIncomingRestaurantId,
      incomingRestaurantName: restaurantName
    });

    // Generate collision-safe order ID before creating order
    const generatedOrderId = await generateUniqueOrderId();

    // Ensure couponCode is included in pricing
    const persistedCouponCode = pricing?.couponCode || pricing?.appliedCoupon?.code || couponCode || null;

    const pendingOnlineOrderFingerprint = normalizedPaymentMethod === 'razorpay'
      ? buildPendingOnlineOrderFingerprint({
          items,
          address: normalizedAddress,
          restaurantId: assignedRestaurantId,
          platform: pricingPlatform,
          deliveryFleet: deliveryFleet || 'standard',
          couponCode: persistedCouponCode,
          deliveryOption: isFutureScheduledOrder ? 'scheduled' : 'now',
          scheduledFor: isFutureScheduledOrder ? scheduledForDate : null,
          deliveryTimeSlot: isFutureScheduledOrder ? deliveryTimeSlot : '',
          pricingTotal: pricing?.total
        })
      : null;

    if (normalizedPaymentMethod === 'cash') {
      const minimumCodOrderValue = await getMinimumCodOrderValueForPlatform(pricingPlatform);
      const orderTotal = Math.max(0, Number(pricing?.total || 0));
      if (orderTotal < minimumCodOrderValue) {
        return res.status(400).json({
          success: false,
          message: `Cash on Delivery is available for orders of Rs ${minimumCodOrderValue} or more`,
          data: {
            minimumCodOrderValue,
            orderTotal
          }
        });
      }
    }

    if (normalizedPaymentMethod === 'razorpay') {
      try {
        const credentials = await getRazorpayCredentials();
        const keyId = String(credentials?.keyId || '').trim();
        const keySecret = String(credentials?.keySecret || '').trim();

        if (!keyId || !keySecret) {
          return res.status(400).json({
            success: false,
            message: 'Online payment is currently unavailable because Razorpay is not configured in admin settings.'
          });
        }
      } catch (credentialsError) {
        logger.error(`Error validating Razorpay configuration before order creation: ${credentialsError.message}`, {
          error: credentialsError.message,
          stack: credentialsError.stack
        });
        return res.status(400).json({
          success: false,
          message: 'Online payment is currently unavailable. Please try Cash on Delivery or contact support.'
        });
      }
    }

    if (normalizedPaymentMethod === 'razorpay' && pendingOnlineOrderFingerprint) {
      const reusableOrder = await findReusablePendingOnlineOrder({
        userId,
        restaurantId: assignedRestaurantId,
        platform: pricingPlatform,
        fingerprint: pendingOnlineOrderFingerprint
      });

      if (reusableOrder) {
        let razorpayOrderId = reusableOrder.payment?.razorpayOrderId || null;
        let razorpayAmount = Math.round(Number(reusableOrder.pricing?.total || pricing?.total || 0) * 100);
        let razorpayCurrency = 'INR';

        if (!razorpayOrderId) {
          let recreatedRazorpayOrder;
          try {
            recreatedRazorpayOrder = await createRazorpayOrder({
              amount: razorpayAmount,
              currency: razorpayCurrency,
              receipt: reusableOrder.orderId,
              notes: {
                orderId: reusableOrder.orderId,
                userId: userId.toString(),
                restaurantId: assignedRestaurantId || 'unknown'
              }
            });
          } catch (razorpayError) {
            logger.error(`Error recreating Razorpay order for reusable order ${reusableOrder.orderId}: ${razorpayError.message}`, {
              error: razorpayError.message,
              stack: razorpayError.stack
            });
            return res.status(400).json({
              success: false,
              message: razorpayError.message || 'Online payment is currently unavailable. Please try again later.'
            });
          }

          razorpayOrderId = recreatedRazorpayOrder.id;
          razorpayAmount = recreatedRazorpayOrder.amount;
          razorpayCurrency = recreatedRazorpayOrder.currency || 'INR';
          reusableOrder.payment.razorpayOrderId = razorpayOrderId;
          await saveOrderWithIdRetry(reusableOrder);
        }

        let razorpayKeyId = '';
        try {
          const credentials = await getRazorpayCredentials();
          razorpayKeyId = credentials.keyId || '';
        } catch (error) {
          logger.warn(`Failed to get Razorpay key ID for reused order: ${error.message}`);
        }

        logger.info('Reusing existing pending online order instead of creating a duplicate', {
          orderId: reusableOrder.orderId,
          orderMongoId: reusableOrder._id?.toString(),
          userId,
          restaurantId: assignedRestaurantId
        });

        return res.status(200).json({
          success: true,
          data: {
            order: {
              id: reusableOrder._id.toString(),
              orderId: reusableOrder.orderId,
              status: reusableOrder.status,
              total: reusableOrder.pricing?.total || pricing.total,
              scheduledDelivery: reusableOrder.scheduledDelivery
            },
            razorpay: {
              orderId: razorpayOrderId,
              amount: razorpayAmount,
              currency: razorpayCurrency,
              key: razorpayKeyId
            },
            reusedExistingOrder: true
          }
        });
      }
    }

    // Create order in database
    const order = new Order({
      orderId: generatedOrderId,
      orderNumber: generatedOrderId,
      userId,
      restaurantId: assignedRestaurantId,
      restaurantName: assignedRestaurantName,
      restaurantPlatform: pricingPlatform === 'mogrocery' ? 'mogrocery' : 'mofood',
      items,
      address: normalizedAddress,
      pricing: {
        ...pricing,
        couponCode: persistedCouponCode
      },
      deliveryFleet: deliveryFleet || 'standard',
      note: note || '',
      planSubscription: normalizedPlanSubscription || undefined,
      sendCutlery: sendCutlery !== false,
      status: isFutureScheduledOrder ? 'scheduled' : 'pending',
      adminApproval: isPlanSubscriptionOrder
        ? {
          status: 'approved',
          reason: 'Auto-approved MoGrocery plan subscription',
          reviewedAt: new Date(),
          reviewedBy: null
        }
        : undefined,
      scheduledDelivery: {
        isScheduled: isFutureScheduledOrder,
        scheduledFor: isFutureScheduledOrder ? scheduledForDate : null,
        timeSlot: isFutureScheduledOrder ? String(deliveryTimeSlot || '') : ''
      },
      payment: {
        method: normalizedPaymentMethod,
        status: 'pending'
      },
      assignmentInfo: {
        restaurantId: assignedRestaurantId,
        zoneId: userZoneIdResolved,
        zoneName: userZone?.name || userZone?.zoneName || restaurantZone?.name || restaurantZone?.zoneName || '',
        assignedBy: 'zone_match'
      }
    });

    // Parse preparation time from order items
    // Extract maximum preparation time from items (e.g., "20-25 mins" -> 25)
    let maxPreparationTime = 0;
    if (items && Array.isArray(items)) {
      items.forEach(item => {
        if (item.preparationTime) {
          const prepTimeStr = String(item.preparationTime).trim();
          // Parse formats like "20-25 mins", "20-25", "25 mins", "25"
          const match = prepTimeStr.match(/(\d+)(?:\s*-\s*(\d+))?/);
          if (match) {
            const minTime = parseInt(match[1], 10);
            const maxTime = match[2] ? parseInt(match[2], 10) : minTime;
            maxPreparationTime = Math.max(maxPreparationTime, maxTime);
          }
        }
      });
    }
    order.preparationTime = maxPreparationTime;
    logger.info('📋 Preparation time extracted from items:', {
      maxPreparationTime,
      itemsCount: items?.length || 0
    });

    // Calculate initial ETA
    try {
      const restaurantLocation = restaurant.location
        ? {
          latitude: restaurant.location.latitude,
          longitude: restaurant.location.longitude
        }
        : null;

      const userLocation = normalizedAddress.location?.coordinates
        ? {
          latitude: normalizedAddress.location.coordinates[1],
          longitude: normalizedAddress.location.coordinates[0]
        }
        : null;

      if (restaurantLocation && userLocation) {
        const etaResult = await etaCalculationService.calculateInitialETA({
          restaurantId: assignedRestaurantId,
          restaurantLocation,
          userLocation
        });

        // Add preparation time to ETA (use max preparation time)
        const finalMinETA = etaResult.minETA + maxPreparationTime;
        const finalMaxETA = etaResult.maxETA + maxPreparationTime;

        // Update order with ETA (including preparation time)
        order.eta = {
          min: finalMinETA,
          max: finalMaxETA,
          lastUpdated: new Date(),
          additionalTime: 0 // Will be updated when restaurant adds time
        };
        order.estimatedDeliveryTime = Math.ceil((finalMinETA + finalMaxETA) / 2);

        // Create order created event
        await OrderEvent.create({
          orderId: order._id,
          eventType: 'ORDER_CREATED',
          data: {
            initialETA: {
              min: finalMinETA,
              max: finalMaxETA
            },
            preparationTime: maxPreparationTime
          },
          timestamp: new Date()
        });

        logger.info('✅ ETA calculated for order:', {
          orderId: order.orderId,
          eta: `${finalMinETA}-${finalMaxETA} mins`,
          preparationTime: maxPreparationTime,
          baseETA: `${etaResult.minETA}-${etaResult.maxETA} mins`
        });
      } else {
        logger.warn('⚠️ Could not calculate ETA - missing location data');
      }
    } catch (etaError) {
      logger.error('❌ Error calculating ETA:', etaError);
      // Continue with order creation even if ETA calculation fails
    }

    let razorpayOrder = null;
    if (normalizedPaymentMethod === 'razorpay' || !normalizedPaymentMethod) {
      try {
        razorpayOrder = await createRazorpayOrder({
          amount: Math.round(pricing.total * 100), // Convert to paise
          currency: 'INR',
          receipt: order.orderId,
          notes: {
            orderId: order.orderId,
            userId: userId.toString(),
            restaurantId: restaurantId || 'unknown'
          }
        });

        order.payment.razorpayOrderId = razorpayOrder.id;
      } catch (razorpayError) {
        logger.error(`Error creating Razorpay order before saving order: ${razorpayError.message}`, {
          error: razorpayError.message,
          stack: razorpayError.stack,
          orderId: order.orderId,
          userId
        });
        return res.status(400).json({
          success: false,
          message: razorpayError.message || 'Online payment is currently unavailable. Please try again later.'
        });
      }
    }

    await saveOrderWithIdRetry(order);

    // Log order creation for debugging
    logger.info('Order created successfully:', {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      restaurantId: order.restaurantId,
      userId: order.userId,
      status: order.status,
      total: order.pricing.total,
      eta: order.eta ? `${order.eta.min}-${order.eta.max} mins` : 'N/A',
      paymentMethod: normalizedPaymentMethod
    });

    // For wallet payments, check balance and deduct before creating order
    if (normalizedPaymentMethod === 'wallet') {
      try {
        // Find or create wallet
        const wallet = await UserWallet.findOrCreateByUserId(userId);

        // Check if sufficient balance
        if (pricing.total > wallet.balance) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient wallet balance',
            data: {
              required: pricing.total,
              available: wallet.balance,
              shortfall: pricing.total - wallet.balance
            }
          });
        }

        await reduceGroceryStockForOrder(order);

        // Check if transaction already exists for this order (prevent duplicate)
        const existingTransaction = wallet.transactions.find(
          t => t.orderId && t.orderId.toString() === order._id.toString() && t.type === 'deduction'
        );

        if (existingTransaction) {
          logger.warn('⚠️ Wallet payment already processed for this order', {
            orderId: order.orderId,
            transactionId: existingTransaction._id
          });
        } else {
          // Deduct money from wallet
          const transaction = wallet.addTransaction({
            amount: pricing.total,
            type: 'deduction',
            status: 'Completed',
            description: `Order payment - Order #${order.orderId}`,
            orderId: order._id
          });

          await wallet.save();

          // Update user's wallet balance in User model (for backward compatibility)
          const User = (await import('../../auth/models/User.js')).default;
          await User.findByIdAndUpdate(userId, {
            'wallet.balance': wallet.balance,
            'wallet.currency': wallet.currency
          });

          logger.info('✅ Wallet payment deducted for order:', {
            orderId: order.orderId,
            userId: userId,
            amount: pricing.total,
            transactionId: transaction._id,
            newBalance: wallet.balance
          });
        }

        // Create payment record
        try {
          const payment = new Payment({
            paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            orderId: order._id,
            userId,
            amount: pricing.total,
            currency: 'INR',
            method: 'wallet',
            status: 'completed',
            logs: [{
              action: 'completed',
              timestamp: new Date(),
              details: {
                previousStatus: 'new',
                newStatus: 'completed',
                note: 'Wallet payment completed'
              }
            }]
          });
          await payment.save();
        } catch (paymentError) {
          logger.error('❌ Error creating wallet payment record:', paymentError);
        }

        // For scheduled orders keep status as scheduled until due time.
        order.payment.method = 'wallet';
        order.payment.status = 'completed';
        if (!isFutureScheduledOrder) {
          if (requiresAdminApproval) {
            order.status = 'pending';
          } else {
            order.status = 'confirmed';
            order.tracking.confirmed = {
              status: true,
              timestamp: new Date()
            };
            startOrderModificationWindow(order);
          }
        } else {
          order.status = 'scheduled';
        }

        await saveOrderWithIdRetry(order);

        // Notify restaurant only for non-scheduled orders.
        if (!isFutureScheduledOrder && !isPlanSubscriptionOrder && !requiresAdminApproval) {
          try {
            const notifyRestaurantResult = await notifyRestaurantNewOrder(order, assignedRestaurantId, 'wallet');
            logger.info('✅ Wallet payment order notification sent to restaurant', {
              orderId: order.orderId,
              restaurantId: assignedRestaurantId,
              notifyRestaurantResult
            });
          } catch (notifyError) {
            logger.error('❌ Error notifying restaurant about wallet payment order:', notifyError);
          }
        }

        // Respond to client
        return res.status(201).json({
          success: true,
          data: {
            order: {
              id: order._id.toString(),
              orderId: order.orderId,
              status: order.status,
              total: pricing.total,
              modificationWindow: getOrderModificationWindow(order),
              scheduledDelivery: order.scheduledDelivery
            },
            razorpay: null,
            wallet: {
              balance: wallet.balance,
              deducted: pricing.total
            }
          }
        });
      } catch (walletError) {
        logger.error('❌ Error processing wallet payment:', walletError);
        if (Number.isInteger(walletError?.statusCode) && walletError.statusCode >= 400 && walletError.statusCode < 500) {
          return res.status(walletError.statusCode).json({
            success: false,
            message: walletError.message || 'Invalid order request',
            error: process.env.NODE_ENV === 'development' ? walletError.message : undefined
          });
        }
        return res.status(500).json({
          success: false,
          message: 'Failed to process wallet payment',
          error: walletError.message
        });
      }
    }

    // For cash-on-delivery orders, confirm immediately and notify restaurant.
    // Online (Razorpay) orders follow the existing verifyOrderPayment flow.
    if (normalizedPaymentMethod === 'cash') {
      await reduceGroceryStockForOrder(order);

      // Best-effort payment record; even if it fails we still proceed with order.
      try {
        const payment = new Payment({
          paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          orderId: order._id,
          userId,
          amount: order.pricing.total,
          currency: 'INR',
          method: 'cash',
          status: 'pending',
          logs: [{
            action: 'pending',
            timestamp: new Date(),
            details: {
              previousStatus: 'new',
              newStatus: 'pending',
              note: 'Cash on delivery order created'
            }
          }]
        });
        await payment.save();
      } catch (paymentError) {
        logger.error('❌ Error creating COD payment record (continuing without blocking order):', {
          error: paymentError.message,
          stack: paymentError.stack
        });
      }

      // For scheduled COD orders keep status as scheduled until due time.
      order.payment.method = 'cash';
      order.payment.status = 'pending';
      if (!isFutureScheduledOrder) {
        if (requiresAdminApproval) {
          order.status = 'pending';
        } else {
          order.status = 'confirmed';
          order.tracking.confirmed = {
            status: true,
            timestamp: new Date()
          };
          startOrderModificationWindow(order);
        }
      } else {
        order.status = 'scheduled';
      }
      await saveOrderWithIdRetry(order);

      // Notify restaurant only for non-scheduled orders.
      if (!isFutureScheduledOrder && !isPlanSubscriptionOrder && !requiresAdminApproval) {
        try {
          const notifyRestaurantResult = await notifyRestaurantNewOrder(order, assignedRestaurantId, 'cash');
          logger.info('✅ COD order notification sent to restaurant', {
            orderId: order.orderId,
            restaurantId: assignedRestaurantId,
            notifyRestaurantResult
          });
        } catch (notifyError) {
          logger.error('❌ Error notifying restaurant about COD order (order still created):', {
            error: notifyError.message,
            stack: notifyError.stack
          });
        }
      }

      // Respond to client (no Razorpay details for COD)
      return res.status(201).json({
        success: true,
        data: {
          order: {
            id: order._id.toString(),
            orderId: order.orderId,
            status: order.status,
            total: pricing.total,
            modificationWindow: getOrderModificationWindow(order),
            scheduledDelivery: order.scheduledDelivery
          },
          razorpay: null
        }
      });
    }

    // Note: For Razorpay / online payments, restaurant notification will be sent
    // after payment verification in verifyOrderPayment. This ensures restaurant
    // only receives prepaid orders after successful payment.

    logger.info(`Order created: ${order.orderId}`, {
      orderId: order.orderId,
      userId,
      amount: pricing.total,
      razorpayOrderId: razorpayOrder?.id
    });

    // Get Razorpay key ID from env service
    let razorpayKeyId = null;
    if (razorpayOrder) {
      try {
        const credentials = await getRazorpayCredentials();
        razorpayKeyId = credentials.keyId || '';
      } catch (error) {
        logger.warn(`Failed to get Razorpay key ID from env service: ${error.message}`);
        razorpayKeyId = '';
      }
    }

    res.status(201).json({
      success: true,
      data: {
        order: {
          id: order._id.toString(),
          orderId: order.orderId,
          status: order.status,
          total: pricing.total,
          scheduledDelivery: order.scheduledDelivery
        },
        razorpay: razorpayOrder ? {
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key: razorpayKeyId
        } : null
      }
    });
  } catch (error) {
    logger.error(`Error creating order: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });

    if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message || 'Invalid order request',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    if (error?.name === 'ValidationError') {
      const firstValidationError = Object.values(error.errors || {})[0];
      const validationMessage = firstValidationError?.message || error.message || 'Invalid order payload';
      return res.status(400).json({
        success: false,
        message: validationMessage,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    if (error?.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: `Invalid ${error.path || 'field'} value`,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    if (error?.code === 11000) {
      const duplicateFields = Object.keys(error?.keyPattern || {});
      const duplicateField = duplicateFields.length > 0 ? duplicateFields[0] : 'unique field';
      return res.status(409).json({
        success: false,
        message: `Duplicate ${duplicateField} detected. Please try again.`, 
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Switch an existing unpaid online order to Cash on Delivery
 */
export const switchOrderToCash = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && String(id).length === 24) {
      order = await Order.findOne({ _id: id, userId });
    }
    if (!order) {
      order = await Order.findOne({ orderId: id, userId });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status === 'cancelled' || order.status === 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Cannot switch payment mode for this order'
      });
    }

    const currentMethod = String(order.payment?.method || '').toLowerCase().trim();
    const currentStatus = String(order.payment?.status || '').toLowerCase().trim();
    const isOnlineMethod = ['razorpay', 'card', 'upi'].includes(currentMethod);

    if (currentMethod === 'cash') {
      return res.json({
        success: true,
        data: {
          order: {
            id: order._id.toString(),
            orderId: order.orderId,
            status: order.status,
            total: order.pricing?.total || 0,
            modificationWindow: getOrderModificationWindow(order),
            scheduledDelivery: order.scheduledDelivery
          }
        }
      });
    }

    if (!isOnlineMethod && currentMethod !== '') {
      return res.status(400).json({
        success: false,
        message: 'Only unpaid online orders can be switched to COD'
      });
    }

    if (currentStatus === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid online and cannot be switched to COD'
      });
    }

    const orderPlatformForCod = normalizePlatform(order.restaurantPlatform || (await resolveOrderPlatform(order.restaurantId)));
    const minimumCodOrderValue = await getMinimumCodOrderValueForPlatform(orderPlatformForCod);
    const orderTotal = Math.max(0, Number(order.pricing?.total || 0));
    if (orderTotal < minimumCodOrderValue) {
      return res.status(400).json({
        success: false,
        message: `Cash on Delivery is available for orders of Rs ${minimumCodOrderValue} or more`,
        data: {
          minimumCodOrderValue,
          orderTotal
        }
      });
    }

    order.payment.method = 'cash';
    order.payment.status = 'pending';
    order.payment.razorpayOrderId = undefined;
    order.payment.razorpayPaymentId = undefined;
    order.payment.razorpaySignature = undefined;
    order.payment.transactionId = undefined;

    const isFutureScheduledOrder = Boolean(
      order?.scheduledDelivery?.isScheduled &&
      order?.scheduledDelivery?.scheduledFor &&
      new Date(order.scheduledDelivery.scheduledFor).getTime() > Date.now()
    );

    const isPlanSubscriptionOrder = Boolean(order?.planSubscription?.planId);
    const orderPlatform = await resolveOrderPlatform(order.restaurantId);
    // Align MoGrocery with restaurant flow: no admin approval gate on COD switch.
    const requiresAdminApproval = false;

    if (!isFutureScheduledOrder && order.status === 'pending' && !requiresAdminApproval) {
      order.status = 'confirmed';
      order.tracking.confirmed = {
        status: true,
        timestamp: new Date()
      };
      startOrderModificationWindow(order);
    }

    await reduceGroceryStockForOrder(order);
    await saveOrderWithIdRetry(order);

    try {
      const existingPayment = await Payment.findOne({ orderId: order._id });
      if (existingPayment) {
        existingPayment.method = 'cash';
        existingPayment.status = 'pending';
        existingPayment.logs = [
          ...(existingPayment.logs || []),
          {
            action: 'pending',
            timestamp: new Date(),
            details: {
              previousStatus: currentStatus || 'pending',
              newStatus: 'pending',
              note: 'Payment mode switched to cash on delivery'
            }
          }
        ];
        await existingPayment.save();
      } else {
        const payment = new Payment({
          paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          orderId: order._id,
          userId,
          amount: order.pricing?.total || 0,
          currency: 'INR',
          method: 'cash',
          status: 'pending',
          logs: [{
            action: 'pending',
            timestamp: new Date(),
            details: {
              previousStatus: 'new',
              newStatus: 'pending',
              note: 'Cash on delivery order created from online cancel flow'
            }
          }]
        });
        await payment.save();
      }
    } catch (paymentError) {
      logger.error('Error updating payment record during COD switch:', {
        error: paymentError.message,
        stack: paymentError.stack
      });
    }

    if (!isFutureScheduledOrder && !isPlanSubscriptionOrder && !requiresAdminApproval) {
      try {
        await notifyRestaurantNewOrder(order, order.restaurantId, 'cash');
      } catch (notifyError) {
        logger.error('Error notifying restaurant for COD switched order:', {
          error: notifyError.message,
          stack: notifyError.stack
        });
      }
    }

    return res.json({
      success: true,
      data: {
        order: {
          id: order._id.toString(),
          orderId: order.orderId,
          status: order.status,
          total: order.pricing?.total || 0,
          modificationWindow: getOrderModificationWindow(order),
          scheduledDelivery: order.scheduledDelivery
        }
      }
    });
  } catch (error) {
    logger.error(`Error switching order to COD: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to switch order to COD'
    });
  }
};

/**
 * Verify payment and confirm order
 */
export const verifyOrderPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification fields'
      });
    }

    // Find order (support both MongoDB ObjectId and orderId string)
    let order;
    try {
      // Try to find by MongoDB ObjectId first
      const mongoose = (await import('mongoose')).default;
      if (mongoose.Types.ObjectId.isValid(orderId)) {
        order = await Order.findOne({
          _id: orderId,
          userId
        });
      }

      // If not found, try by orderId string
      if (!order) {
        order = await Order.findOne({
          orderId: orderId,
          userId
        });
      }
    } catch (error) {
      // Fallback: try both
      order = await Order.findOne({
        $or: [
          { _id: orderId },
          { orderId: orderId }
        ],
        userId
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const existingCompletedPayment = await Payment.findOne({
      orderId: order._id,
      status: 'completed',
      $or: [
        { transactionId: razorpayPaymentId },
        { 'razorpay.paymentId': razorpayPaymentId },
        { 'razorpay.orderId': razorpayOrderId }
      ]
    }).lean();

    if (
      order.payment?.status === 'completed' ||
      existingCompletedPayment
    ) {
      const requiresFinalization =
        order.payment?.status !== 'completed' ||
        !['confirmed', 'scheduled'].includes(String(order.status || '').toLowerCase()) ||
        !order?.tracking?.confirmed?.status;

      if (requiresFinalization) {
        order.payment = order.payment || {};
        order.payment.razorpayOrderId = order.payment.razorpayOrderId || razorpayOrderId;
        order.payment.razorpayPaymentId = order.payment.razorpayPaymentId || razorpayPaymentId;
        order.payment.razorpaySignature = order.payment.razorpaySignature || razorpaySignature;
        order.payment.transactionId = order.payment.transactionId || razorpayPaymentId;

        await finalizeVerifiedOnlineOrder(
          order,
          userId,
          existingCompletedPayment?.amount || order.pricing?.total || 0
        );
      }

      return res.status(200).json({
        success: true,
        message: 'Payment already verified',
        data: {
          order: {
            id: order._id.toString(),
            orderId: order.orderId,
            status: order.status,
            paymentStatus: order.payment?.status || 'completed',
            modificationWindow: getOrderModificationWindow(order),
            scheduledDelivery: order.scheduledDelivery
          },
          payment: {
            status: order.payment?.status || 'completed'
          },
          alreadyVerified: true
        }
      });
    }

    if (
      order.payment?.razorpayOrderId &&
      String(order.payment.razorpayOrderId) !== String(razorpayOrderId)
    ) {
      return res.status(409).json({
        success: false,
        message: 'Payment attempt does not match the pending order'
      });
    }

    // Verify payment signature
    const isValid = await verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    if (!isValid) {
      // Update order payment status to failed
      order.payment.status = 'failed';
      await order.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    await reduceGroceryStockForOrder(order);

    // Create payment record
    const payment = new Payment({
      paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      orderId: order._id,
      userId,
      amount: order.pricing.total,
      currency: 'INR',
      method: 'razorpay',
      status: 'completed',
      razorpay: {
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature
      },
      transactionId: razorpayPaymentId,
      completedAt: new Date(),
      logs: [{
        action: 'completed',
        timestamp: new Date(),
        details: {
          razorpayOrderId,
          razorpayPaymentId
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }]
    });

    await payment.save();

    order.payment.razorpayPaymentId = razorpayPaymentId;
    order.payment.razorpaySignature = razorpaySignature;
    order.payment.transactionId = razorpayPaymentId;
    const {
      isFutureScheduledOrder,
      isPlanSubscriptionOrder,
      requiresAdminApproval
    } = await finalizeVerifiedOnlineOrder(order, userId, order.pricing.total);

    try {



      logger.info(`✅ Order settlement calculated and escrow held for order ${order.orderId}`);
    } catch (settlementError) {
      logger.error(`❌ Error calculating settlement for order ${order.orderId}:`, settlementError);
      // Don't fail payment verification if settlement calculation fails
      // But log it for investigation
    }

    // Notify restaurant only when order is active (not future-scheduled).
    if (!isFutureScheduledOrder && !isPlanSubscriptionOrder && !requiresAdminApproval) {
      try {
        const restaurantId = order.restaurantId?.toString() || order.restaurantId;
        const restaurantName = order.restaurantName;

      // CRITICAL: Log detailed info before notification
      logger.info('🔔 CRITICAL: Attempting to notify restaurant about confirmed order:', {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        restaurantId: restaurantId,
        restaurantName: restaurantName,
        restaurantIdType: typeof restaurantId,
        orderRestaurantId: order.restaurantId,
        orderRestaurantIdType: typeof order.restaurantId,
        orderStatus: order.status,
        orderCreatedAt: order.createdAt,
        orderItems: order.items.map(item => ({ name: item.name, quantity: item.quantity }))
      });

      // Verify order has restaurantId before notifying
      if (!restaurantId) {
        logger.error('❌ CRITICAL: Cannot notify restaurant - order.restaurantId is missing!', {
          orderId: order.orderId,
          order: {
            _id: order._id?.toString(),
            restaurantId: order.restaurantId,
            restaurantName: order.restaurantName
          }
        });
        throw new Error('Order restaurantId is missing');
      }

      // Verify order has restaurantName before notifying
      if (!restaurantName) {
        logger.warn('⚠️ Order restaurantName is missing:', {
          orderId: order.orderId,
          restaurantId: restaurantId
        });
      }

        const notificationResult = await notifyRestaurantNewOrder(order, restaurantId);

        logger.info(`✅ Successfully notified restaurant about confirmed order:`, {
          orderId: order.orderId,
          restaurantId: restaurantId,
          restaurantName: restaurantName,
          notificationResult: notificationResult
        });
      } catch (notificationError) {
        logger.error(`❌ CRITICAL: Error notifying restaurant after payment verification:`, {
          error: notificationError.message,
          stack: notificationError.stack,
          orderId: order.orderId,
          orderMongoId: order._id?.toString(),
          restaurantId: order.restaurantId,
          restaurantName: order.restaurantName,
          orderStatus: order.status
        });
        // Don't fail payment verification if notification fails
        // Order is still saved and restaurant can fetch it via API
        // But log it as critical for debugging
      }
    } else {
      logger.info(`ℹ️ Scheduled prepaid order kept in scheduled state until due time: ${order.orderId}`, {
        scheduledFor: order?.scheduledDelivery?.scheduledFor
      });
    }

    logger.info(`Order payment verified: ${order.orderId}`, {
      orderId: order.orderId,
      paymentId: payment.paymentId,
      razorpayPaymentId
    });

    res.json({
      success: true,
      data: {
        order: {
          id: order._id.toString(),
          orderId: order.orderId,
          status: order.status,
          modificationWindow: getOrderModificationWindow(order),
          scheduledDelivery: order.scheduledDelivery
        },
        payment: {
          id: payment._id.toString(),
          paymentId: payment.paymentId,
          status: payment.status
        }
      }
    });
  } catch (error) {
    logger.error(`Error verifying order payment: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get user orders
 */
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { status, limit = 20, page = 1 } = req.query;

    if (!userId) {
      logger.error('User ID not found in request');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Build query - MongoDB should handle string/ObjectId conversion automatically
    // But we'll try both formats to be safe
    const mongoose = (await import('mongoose')).default;
    const query = { userId };

    // If userId is a string that looks like ObjectId, also try ObjectId format
    if (typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId)) {
      query.$or = [
        { userId: userId },
        { userId: new mongoose.Types.ObjectId(userId) }
      ];
      delete query.userId; // Remove direct userId since we're using $or
    }

    // Add status filter if provided
    if (status) {
      if (query.$or) {
        // Add status to each $or condition
        query.$or = query.$or.map(condition => ({ ...condition, status }));
      } else {
        query.status = status;
      }
    }
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Downgraded to debug to avoid noisy per-request logs in production
    logger.debug(`Fetching orders for user: ${userId}, query: ${JSON.stringify(query)}`);

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .select('-__v')
      .populate('restaurantId', 'name slug profileImage address location phone ownerPhone platform')
      .populate('userId', 'name phone email')
      .lean();

    const total = await Order.countDocuments(query);

    // Downgraded to debug to avoid noisy per-request logs in production
    logger.debug(`Found ${orders.length} orders for user ${userId} (total: ${total})`);
    const ordersWithModificationWindow = orders.map(enrichOrderWithModificationWindow);

    res.json({
      success: true,
      data: {
        orders: ordersWithModificationWindow,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error(`Error fetching user orders: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

/**
 * Get order details
 */
export const getOrderDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        userId
      })
        .populate('restaurantId', 'name slug profileImage address location estimatedDeliveryTime distance phone ownerPhone platform')
        .populate('deliveryPartnerId', 'name email phone avatar availability.currentLocation')
        .populate('userId', 'name fullName phone email')
        .lean();
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      order = await Order.findOne({
        orderId: id,
        userId
      })
        .populate('restaurantId', 'name slug profileImage address location estimatedDeliveryTime distance phone ownerPhone platform')
        .populate('deliveryPartnerId', 'name email phone avatar availability.currentLocation')
        .populate('userId', 'name fullName phone email')
        .lean();
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get payment details
    const payment = await Payment.findOne({
      orderId: order._id
    }).lean();

    res.json({
      success: true,
      data: {
        order: enrichOrderWithModificationWindow(order),
        payment
      }
    });
  } catch (error) {
    logger.error(`Error fetching order details: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
};

/**
 * Submit restaurant/delivery rating for a delivered order
 * PATCH /api/order/:id/review
 */
export const submitOrderReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      restaurantRating,
      restaurantComment,
      deliveryRating,
      deliveryComment
    } = req.body || {};

    const hasRestaurantPayload =
      restaurantRating !== undefined || (typeof restaurantComment === 'string' && restaurantComment.trim().length > 0);
    const hasDeliveryPayload =
      deliveryRating !== undefined || (typeof deliveryComment === 'string' && deliveryComment.trim().length > 0);

    if (!hasRestaurantPayload && !hasDeliveryPayload) {
      return res.status(400).json({
        success: false,
        message: 'At least one rating (restaurant or delivery) is required'
      });
    }

    const validateRating = (value) => Number.isInteger(value) && value >= 1 && value <= 5;

    if (restaurantRating !== undefined && !validateRating(Number(restaurantRating))) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant rating must be an integer between 1 and 5'
      });
    }

    if (deliveryRating !== undefined && !validateRating(Number(deliveryRating))) {
      return res.status(400).json({
        success: false,
        message: 'Delivery rating must be an integer between 1 and 5'
      });
    }

    if (hasRestaurantPayload && restaurantRating === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant rating is required when submitting restaurant review'
      });
    }

    if (hasDeliveryPayload && deliveryRating === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Delivery rating is required when submitting delivery review'
      });
    }

    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({ _id: id, userId });
    }
    if (!order) {
      order = await Order.findOne({ orderId: id, userId });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (String(order.status || '').toLowerCase() !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'You can rate only delivered orders'
      });
    }

    const existingRestaurantRating = order.review?.restaurant?.rating ?? order.review?.rating ?? null;
    const existingDeliveryRating = order.review?.delivery?.rating ?? null;

    if (restaurantRating !== undefined && existingRestaurantRating !== null && existingRestaurantRating !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'Restaurant has already been rated for this order'
      });
    }

    if (deliveryRating !== undefined && existingDeliveryRating !== null && existingDeliveryRating !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'Delivery partner has already been rated for this order'
      });
    }

    if (deliveryRating !== undefined && !order.deliveryPartnerId) {
      return res.status(400).json({
        success: false,
        message: 'This order has no assigned delivery partner to rate'
      });
    }

    const now = new Date();
    const setData = {};
    let submittedRestaurantRating = null;
    let submittedDeliveryRating = null;

    if (restaurantRating !== undefined) {
      const normalizedRestaurantRating = Number(restaurantRating);
      submittedRestaurantRating = normalizedRestaurantRating;
      setData['review.restaurant.rating'] = normalizedRestaurantRating;
      setData['review.restaurant.submittedAt'] = now;
      if (typeof restaurantComment === 'string' && restaurantComment.trim()) {
        setData['review.restaurant.comment'] = restaurantComment.trim();
      }

      // Backward compatibility for existing restaurant review reports.
      setData['review.rating'] = normalizedRestaurantRating;
      setData['review.submittedAt'] = now;
      setData['review.reviewedBy'] = userId;
      if (typeof restaurantComment === 'string' && restaurantComment.trim()) {
        setData['review.comment'] = restaurantComment.trim();
      }
    }

    if (deliveryRating !== undefined) {
      const normalizedDeliveryRating = Number(deliveryRating);
      submittedDeliveryRating = normalizedDeliveryRating;
      setData['review.delivery.rating'] = normalizedDeliveryRating;
      setData['review.delivery.submittedAt'] = now;
      if (typeof deliveryComment === 'string' && deliveryComment.trim()) {
        setData['review.delivery.comment'] = deliveryComment.trim();
      }

      // Keep top-level reviewer metadata in sync.
      setData['review.reviewedBy'] = userId;
      if (!setData['review.submittedAt']) {
        setData['review.submittedAt'] = now;
      }
    }

    await Order.updateOne({ _id: order._id }, { $set: setData });

    let restaurantAggregate = null;
    let deliveryAggregate = null;

    if (submittedRestaurantRating !== null) {
      try {
        restaurantAggregate = await updateRestaurantAggregateRating(order.restaurantId, submittedRestaurantRating);
      } catch (aggregateError) {
        logger.error(`Failed to update restaurant aggregate rating for order ${order.orderId}: ${aggregateError.message}`);
      }
    }

    if (submittedDeliveryRating !== null) {
      try {
        deliveryAggregate = await updateDeliveryAggregateRating(order.deliveryPartnerId, submittedDeliveryRating);
      } catch (aggregateError) {
        logger.error(`Failed to update delivery aggregate rating for order ${order.orderId}: ${aggregateError.message}`);
      }
    }

    const updatedOrder = await Order.findById(order._id)
      .populate('restaurantId', 'name slug profileImage address location estimatedDeliveryTime distance phone ownerPhone platform rating totalRatings')
      .populate('deliveryPartnerId', 'name email phone avatar availability.currentLocation rating metrics.rating metrics.ratingCount')
      .populate('userId', 'name fullName phone email')
      .lean();

    return res.json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        order: enrichOrderWithModificationWindow(updatedOrder),
        aggregates: {
          restaurant: restaurantAggregate,
          delivery: deliveryAggregate
        }
      }
    });
  } catch (error) {
    logger.error(`Error submitting order review: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit order review'
    });
  }
};

/**
 * Cancel order by user
 * PATCH /api/order/:id/cancel
 */
export const cancelOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required'
      });
    }

    // Find order by MongoDB _id or orderId
    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        userId
      });
    }

    if (!order) {
      order = await Order.findOne({
        orderId: id,
        userId
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Order is already cancelled'
      });
    }

    if (order.status === 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a delivered order'
      });
    }

    const modificationWindow = getOrderModificationWindow(order);
    if (!modificationWindow.isOpen) {
      return res.status(400).json({
        success: false,
        message: `You can only cancel within 2 minutes of order confirmation. Window expired at ${modificationWindow.expiresAt?.toISOString() || 'N/A'}.`
      });
    }

    // Get payment method from order or payment record
    const paymentMethod = order.payment?.method;
    const payment = await Payment.findOne({ orderId: order._id });
    const paymentMethodFromPayment = payment?.method || payment?.paymentMethod;

    // Determine the actual payment method
    const actualPaymentMethod = paymentMethod || paymentMethodFromPayment;

    // Allow cancellation for all payment methods (Razorpay, COD, Wallet)
    // Only restrict if order is already cancelled or delivered (checked above)

    // Update order status
    order.status = 'cancelled';
    order.cancellationReason = reason.trim();
    order.cancelledBy = 'user';
    order.cancelledAt = new Date();
    // Persist cancellation without re-validating unrelated legacy fields
    // (older orders can contain values that no longer satisfy current schema enums).
    await order.save({ validateBeforeSave: false });
    try {
      await restoreGroceryStockForOrder(order);
    } catch (stockRestoreError) {
      logger.error(`Error restoring grocery stock for cancelled order ${order.orderId}:`, stockRestoreError);
      // Don't fail cancellation response if stock restoration fails.
    }

    // Calculate refund amount only for online payments (Razorpay) and wallet
    // COD orders don't need refund since payment hasn't been made
    let refundMessage = '';
    if (actualPaymentMethod === 'razorpay' || actualPaymentMethod === 'wallet') {
      try {
        const { calculateCancellationRefund } = await import('../services/cancellationRefundService.js');
        await calculateCancellationRefund(order._id, reason);
        logger.info(`Cancellation refund calculated for order ${order.orderId} - awaiting admin approval`);
        refundMessage = ' Refund will be processed after admin approval.';
      } catch (refundError) {
        logger.error(`Error calculating cancellation refund for order ${order.orderId}:`, refundError);
        // Don't fail the cancellation if refund calculation fails
      }
    } else if (actualPaymentMethod === 'cash' || actualPaymentMethod === 'cod') {
      refundMessage = ' No refund required as payment was not made.';
    }

    res.json({
      success: true,
      message: `Order cancelled successfully.${refundMessage}`,
      data: {
        order: {
          orderId: order.orderId,
          status: order.status,
          cancellationReason: order.cancellationReason,
          cancelledAt: order.cancelledAt,
          modificationWindow: getOrderModificationWindow(order)
        }
      }
    });
  } catch (error) {
    logger.error(`Error cancelling order: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel order'
    });
  }
};

/**
 * Edit cart items within 2 minutes after order confirmation
 * PATCH /api/order/:id/edit-cart
 */
export const editOrderCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Updated cart items are required'
      });
    }

    const hasInvalidItem = items.some((item) =>
      !item ||
      !item.itemId ||
      Number(item.quantity) < 1 ||
      !Number.isFinite(Number(item.quantity))
    );

    if (hasInvalidItem) {
      return res.status(400).json({
        success: false,
        message: 'Each item must include itemId and quantity >= 1'
      });
    }

    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({ _id: id, userId });
    }
    if (!order) {
      order = await Order.findOne({ orderId: id, userId });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status === 'cancelled' || order.status === 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit cart for cancelled or delivered orders'
      });
    }

    const modificationWindow = getOrderModificationWindow(order);
    if (!modificationWindow.isOpen) {
      return res.status(400).json({
        success: false,
        message: `Cart can only be edited within 2 minutes of order confirmation. Window expired at ${modificationWindow.expiresAt?.toISOString() || 'N/A'}.`
      });
    }

    const platformFromOrderField = normalizePlatform(order.restaurantPlatform);
    const platformFromLookup = await resolveOrderPlatform(order.restaurantId);
    const platformForEdit =
      platformFromOrderField === 'mogrocery' || platformFromLookup === 'mogrocery'
        ? 'mogrocery'
        : 'mofood';

    const resolvedRestaurantObjectId = await resolveRestaurantObjectId(order.restaurantId);
    if (!resolvedRestaurantObjectId) {
      return res.status(400).json({
        success: false,
        message: 'Unable to validate restaurant for this order edit request'
      });
    }

    const singleSourceValidation = await validateSingleSourceOrderItems({
      items,
      platform: platformForEdit,
      expectedRestaurant: {
        _id: resolvedRestaurantObjectId,
        restaurantId: String(order.restaurantId || '').trim()
      }
    });
    if (!singleSourceValidation.valid) {
      return res.status(400).json({
        success: false,
        message: singleSourceValidation.message || 'Unable to validate source for order edit items'
      });
    }

    let menuItemsMap = new Map();
    if (platformForEdit === 'mogrocery') {
      const uniqueIncomingItemIds = Array.from(
        new Set(
          items
            .map((item) => String(item?.itemId || '').trim())
            .filter(Boolean)
        )
      );
      const validObjectIds = uniqueIncomingItemIds.filter(
        (itemId) => mongoose.Types.ObjectId.isValid(itemId)
      );
      const products = validObjectIds.length > 0
        ? await GroceryProduct.find({
            _id: { $in: validObjectIds.map((itemId) => new mongoose.Types.ObjectId(itemId)) },
            storeId: new mongoose.Types.ObjectId(resolvedRestaurantObjectId),
            isActive: true
          })
            .select('_id name price image images description')
            .lean()
        : [];

      menuItemsMap = buildGroceryItemsMap(products);
    } else {
      const menu = await Menu.findOne({
        restaurant: resolvedRestaurantObjectId,
        isActive: true
      }).lean();

      if (!menu) {
        return res.status(400).json({
          success: false,
          message: 'Restaurant menu is unavailable. Please try again later.'
        });
      }

      menuItemsMap = buildMenuItemsMap(menu);
    }

    const { nextItems, invalidItemIds } = buildEditedItemsForOrder({
      order,
      incomingItems: items,
      menuItemsMap
    });

    if (invalidItemIds.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          platformForEdit === 'mogrocery'
            ? 'You can only add items from the same store for this order edit window.'
            : 'You can only add items from the same restaurant for this order edit window.',
        data: {
          invalidItemIds
        }
      });
    }

    if (!nextItems.length) {
      return res.status(400).json({
        success: false,
        message: 'Updated cart must contain at least one valid item from this restaurant'
      });
    }

    const sanitizedItems = sanitizeEditedItems(nextItems);
    const totals = calculateUpdatedTotals(order, sanitizedItems);
    const orderPlatform = await resolveOrderPlatform(order.restaurantId);
    // Keep edited orders in direct store flow as well (no admin re-approval queue for MoGrocery).
    const requiresAdminReapproval = false;

    const previousTotal = Number(order.pricing?.total || 0);
    const additionalAmount = Number(Math.max(0, totals.total - previousTotal).toFixed(2));
    const paymentMethod = String(order.payment?.method || '').toLowerCase();
    const paymentStatus = String(order.payment?.status || '').toLowerCase();
    const isRazorpayCompletedPayment =
      paymentMethod === 'razorpay' && paymentStatus === 'completed';
    const isWalletCompletedPayment =
      paymentMethod === 'wallet' && paymentStatus === 'completed';

    if (isWalletCompletedPayment && additionalAmount > 0) {
      const wallet = await UserWallet.findOrCreateByUserId(userId);

      if (additionalAmount > Number(wallet.balance || 0)) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance for updated cart items',
          data: {
            required: additionalAmount,
            available: Number(wallet.balance || 0),
            shortfall: Number((additionalAmount - Number(wallet.balance || 0)).toFixed(2))
          }
        });
      }

      const walletTransaction = wallet.addTransaction({
        amount: additionalAmount,
        type: 'deduction',
        status: 'Completed',
        description: `Order edit payment - Order #${order.orderId}`,
        orderId: order._id
      });
      await wallet.save();

      await User.findByIdAndUpdate(userId, {
        'wallet.balance': wallet.balance,
        'wallet.currency': wallet.currency
      });

      try {
        const payment = new Payment({
          paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          orderId: order._id,
          userId,
          amount: additionalAmount,
          currency: 'INR',
          method: 'wallet',
          status: 'completed',
          transactionId: walletTransaction?._id?.toString?.() || '',
          completedAt: new Date(),
          logs: [{
            action: 'completed',
            timestamp: new Date(),
            details: {
              purpose: 'order_edit_additional_payment',
              orderId: order.orderId,
              walletTransactionId: walletTransaction?._id?.toString?.() || ''
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          }]
        });
        await payment.save();
      } catch (paymentError) {
        logger.error(`Error creating wallet payment record for edited cart: ${paymentError.message}`, {
          orderId: order.orderId,
          userId: userId.toString(),
          additionalAmount
        });
      }

      applyEditedCartToOrder(order, sanitizedItems, totals);
      order.payment.method = 'wallet';
      order.payment.status = 'completed';
      applyPostEditAdminApprovalState(order, { requiresAdminReapproval });
      await order.save();

      return res.json({
        success: true,
        message: 'Order cart updated successfully',
        data: {
          requiresAdditionalPayment: false,
          additionalAmount,
          wallet: {
            balance: Number(wallet.balance || 0),
            deducted: additionalAmount
          },
          order: {
            id: order._id.toString(),
            orderId: order.orderId,
            status: order.status,
            items: order.items,
            pricing: order.pricing,
            modificationWindow: getOrderModificationWindow(order)
          }
        }
      });
    }

    if (isRazorpayCompletedPayment && additionalAmount > 0) {
      const receiptRaw = `${order.orderId}-E-${Date.now()}`;
      const receipt = receiptRaw.slice(0, 40);

      let razorpayOrder = null;
      try {
        razorpayOrder = await createRazorpayOrder({
          amount: Math.round(additionalAmount * 100),
          currency: 'INR',
          receipt,
          notes: {
            orderId: order.orderId,
            orderMongoId: order._id.toString(),
            userId: userId.toString(),
            purpose: 'order_edit_additional_payment'
          }
        });
      } catch (razorpayError) {
        logger.error(`Error creating additional Razorpay order for edit: ${razorpayError.message}`, {
          orderId: order.orderId,
          userId: userId.toString(),
          additionalAmount
        });
        return res.status(500).json({
          success: false,
          message: 'Failed to initialize additional payment for updated order items'
        });
      }

      let razorpayKeyId = null;
      try {
        const credentials = await getRazorpayCredentials();
        razorpayKeyId = credentials?.keyId || '';
      } catch {
        razorpayKeyId = '';
      }

      order.postOrderActions = sanitizePostOrderActions({
        ...(order.postOrderActions || {}),
        pendingCartEdit: sanitizePendingCartEdit({
          items: sanitizedItems,
          subtotal: totals.subtotal,
          total: totals.total,
          additionalAmount,
          requiresAdminReapproval,
          razorpayOrderId: razorpayOrder?.id || '',
          createdAt: new Date()
        })
      });
      await order.save();

      return res.json({
        success: true,
        message: 'Additional payment required to confirm edited order items',
        data: {
          requiresAdditionalPayment: true,
          additionalAmount,
          order: {
            id: order._id.toString(),
            orderId: order.orderId,
            status: order.status,
            pricing: {
              previousTotal: Number(previousTotal.toFixed(2)),
              nextTotal: totals.total,
              additionalAmount
            },
            modificationWindow: getOrderModificationWindow(order)
          },
          razorpay: razorpayOrder ? {
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: razorpayKeyId
          } : null
        }
      });
    }

    applyEditedCartToOrder(order, sanitizedItems, totals);
    applyPostEditAdminApprovalState(order, { requiresAdminReapproval });
    await order.save();

    return res.json({
      success: true,
      message: 'Order cart updated successfully',
      data: {
        requiresAdditionalPayment: false,
        additionalAmount: 0,
        order: {
          id: order._id.toString(),
          orderId: order.orderId,
          status: order.status,
          items: order.items,
          pricing: order.pricing,
          modificationWindow: getOrderModificationWindow(order)
        }
      }
    });
  } catch (error) {
    logger.error(`Error editing order cart: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to edit order cart'
    });
  }
};

/**
 * Verify additional payment for edited cart and apply pending edited items
 * POST /api/order/:id/edit-cart/verify-payment
 */
export const verifyEditedOrderCartPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification fields'
      });
    }

    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({ _id: id, userId });
    }
    if (!order) {
      order = await Order.findOne({ orderId: id, userId });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const modificationWindow = getOrderModificationWindow(order);
    if (!modificationWindow.isOpen) {
      return res.status(400).json({
        success: false,
        message: `Cart edit payment window expired at ${modificationWindow.expiresAt?.toISOString() || 'N/A'}.`
      });
    }

    const pendingCartEdit = order.postOrderActions?.pendingCartEdit;
    if (!pendingCartEdit || !Array.isArray(pendingCartEdit.items) || pendingCartEdit.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending edited cart payment found for this order'
      });
    }

    if (String(pendingCartEdit.razorpayOrderId || '') !== String(razorpayOrderId)) {
      return res.status(400).json({
        success: false,
        message: 'Payment order mismatch for edited cart'
      });
    }

    const isValid = await verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    const additionalAmount = Number(pendingCartEdit.additionalAmount || 0);
    const payment = new Payment({
      paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      orderId: order._id,
      userId,
      amount: additionalAmount,
      currency: 'INR',
      method: 'razorpay',
      status: 'completed',
      razorpay: {
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature
      },
      transactionId: razorpayPaymentId,
      completedAt: new Date(),
      logs: [{
        action: 'completed',
        timestamp: new Date(),
        details: {
          razorpayOrderId,
          razorpayPaymentId,
          purpose: 'order_edit_additional_payment',
          orderId: order.orderId
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }]
    });
    await payment.save();

    const sanitizedItems = sanitizeEditedItems(pendingCartEdit.items || []);
    const totals = {
      subtotal: Number(pendingCartEdit.subtotal || order.pricing?.subtotal || 0),
      total: Number(pendingCartEdit.total || order.pricing?.total || 0)
    };
    applyEditedCartToOrder(order, sanitizedItems, totals);
    applyPostEditAdminApprovalState(order, {
      requiresAdminReapproval: Boolean(pendingCartEdit?.requiresAdminReapproval)
    });

    order.payment.status = 'completed';
    order.payment.method = order.payment?.method || 'razorpay';
    order.payment.razorpayOrderId = razorpayOrderId;
    order.payment.razorpayPaymentId = razorpayPaymentId;
    order.payment.razorpaySignature = razorpaySignature;
    order.payment.transactionId = razorpayPaymentId;

    await order.save();

    return res.json({
      success: true,
      message: 'Additional payment successful. Order updated successfully',
      data: {
        order: {
          id: order._id.toString(),
          orderId: order.orderId,
          status: order.status,
          items: order.items,
          pricing: order.pricing,
          modificationWindow: getOrderModificationWindow(order)
        },
        payment: {
          id: payment._id.toString(),
          paymentId: payment.paymentId,
          status: payment.status
        }
      }
    });
  } catch (error) {
    logger.error(`Error verifying edited cart payment: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to verify edited cart payment'
    });
  }
};

/**
 * Calculate order pricing
 */
export const calculateOrder = async (req, res) => {
  try {
    const { items, restaurantId, deliveryAddress, couponCode, deliveryFleet, platform, zoneId } = req.body;
    const userId = req.user?.id || req.user?._id || null;
    const requestedPlatform = platform === 'mogrocery' ? 'mogrocery' : 'mofood';

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must have at least one item'
      });
    }

    if (!restaurantId || restaurantId === 'unknown') {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required'
      });
    }

    const normalizedRestaurantId = String(restaurantId).trim();
    const restaurant = await findRestaurantOrStoreByIdentifier(normalizedRestaurantId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // Respect client-requested platform for grocery cart previews.
    // Some stores may be missing/incorrect platform flag in DB, which would otherwise force mofood menu validation.
    const platformForValidation =
      requestedPlatform === 'mogrocery'
        ? 'mogrocery'
        : (restaurant.platform === 'mogrocery' ? 'mogrocery' : 'mofood');
    const [availability, singleSourceValidation] = await Promise.all([
      evaluateRestaurantAvailabilityAt(restaurant, new Date()),
      validateSingleSourceOrderItems({
        items,
        platform: platformForValidation,
        expectedRestaurant: {
          _id: restaurant._id,
          restaurantId: restaurant.restaurantId,
          providedRestaurantId: normalizedRestaurantId,
          slug: restaurant.slug
        }
      })
    ]);

    if (!availability.isAvailable) {
      return res.status(403).json({
        success: false,
        message: availability.reason || 'Restaurant is currently unavailable'
      });
    }
    if (!singleSourceValidation.valid) {
      return res.status(400).json({
        success: false,
        message: singleSourceValidation.message
      });
    }

    // Calculate pricing
    const pricing = await calculateOrderPricing({
      items,
      restaurantId: restaurant._id?.toString() || restaurant.restaurantId || restaurantId,
      restaurantEntity: restaurant,
      deliveryAddress,
      couponCode,
      deliveryFleet: deliveryFleet || 'standard',
      userId,
      platform: requestedPlatform,
      zoneId: zoneId || null
    });

    res.json({
      success: true,
      data: {
        pricing
      }
    });
  } catch (error) {
    logger.error(`Error calculating order pricing: ${error.message}`, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to calculate order pricing',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};



