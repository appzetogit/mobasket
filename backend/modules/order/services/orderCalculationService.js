import Restaurant from '../../restaurant/models/Restaurant.js';
import GroceryStore from '../../grocery/models/GroceryStore.js';
import Offer from '../../restaurant/models/Offer.js';
import FeeSettings from '../../admin/models/FeeSettings.js';
import Zone from '../../admin/models/Zone.js';
import Order from '../models/Order.js';
import GroceryPlan from '../../grocery/models/GroceryPlan.js';
import GroceryPlanOffer from '../../grocery/models/GroceryPlanOffer.js';
import GroceryProduct from '../../grocery/models/GroceryProduct.js';
import User from '../../auth/models/User.js';
import mongoose from 'mongoose';

/** Ray-casting: is (lat, lng) inside polygon coordinates [{ latitude, longitude }, ...] */
const isPointInPolygon = (lat, lng, coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length < 3) return false;
  let inside = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
    const ci = coordinates[i];
    const cj = coordinates[j];
    const xi = typeof ci === 'object' ? (ci.latitude ?? ci.lat) : null;
    const yi = typeof ci === 'object' ? (ci.longitude ?? ci.lng) : null;
    const xj = typeof cj === 'object' ? (cj.latitude ?? cj.lat) : null;
    const yj = typeof cj === 'object' ? (cj.longitude ?? cj.lng) : null;
    if (xi == null || yi == null || xj == null || yj == null) continue;
    const intersect = ((yi > lng) !== (yj > lng)) && (lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const getLayerChargeForZone = (zone, lat, lng) => {
  const coords = zone?.coordinates;
  if (!Array.isArray(coords) || coords.length < 3) return null;
  if (!isPointInPolygon(lat, lng, coords)) return null;

  const layers = zone?.layers;
  if (!Array.isArray(layers) || layers.length === 0) return null;

  const outermostLayer = layers.find((l) => l.type === 'outermost');
  const order = ['inner', 'outer'];

  for (const layerType of order) {
    const layer = layers.find((l) => l.type === layerType);
    if (!layer || !Array.isArray(layer.coordinates) || layer.coordinates.length < 3) continue;
    if (isPointInPolygon(lat, lng, layer.coordinates)) {
      return {
        deliveryCharge: Number(layer.deliveryCharge) || 0,
        deliveryLayerType: layerType
      };
    }
  }

  if (outermostLayer) {
    return {
      deliveryCharge: Number(outermostLayer.deliveryCharge) || 0,
      deliveryLayerType: 'outermost'
    };
  }

  return null;
};

const resolveOfferRestaurantContext = async (restaurantIdentifier) => {
  const normalizedIdentifier = String(restaurantIdentifier || '').trim();
  if (!normalizedIdentifier) return { restaurant: null, offerRestaurantObjectId: null };

  const identityConditions = [
    { restaurantId: normalizedIdentifier },
    { slug: normalizedIdentifier }
  ];
  if (mongoose.Types.ObjectId.isValid(normalizedIdentifier) && normalizedIdentifier.length === 24) {
    identityConditions.push({ _id: new mongoose.Types.ObjectId(normalizedIdentifier) });
  }

  const restaurant = await Restaurant.findOne({ $or: identityConditions }).lean();
  if (restaurant?._id) {
    return { restaurant, offerRestaurantObjectId: restaurant._id };
  }

  const groceryStore = await GroceryStore.findOne({ $or: identityConditions })
    .select('_id restaurantId slug platform isActive')
    .lean();
  if (!groceryStore) {
    return { restaurant: null, offerRestaurantObjectId: null };
  }

  const mirrorConditions = [{ _id: groceryStore._id }];
  if (groceryStore.restaurantId) mirrorConditions.push({ restaurantId: groceryStore.restaurantId });
  if (groceryStore.slug) mirrorConditions.push({ slug: groceryStore.slug });

  const mirroredRestaurant = await Restaurant.findOne({ $or: mirrorConditions }).lean();
  if (mirroredRestaurant?._id) {
    return { restaurant: mirroredRestaurant, offerRestaurantObjectId: mirroredRestaurant._id };
  }

  return { restaurant: groceryStore, offerRestaurantObjectId: groceryStore._id };
};

/**
 * Find zone containing (lat, lng) and return delivery charge + layer type.
 * Zones and layers are platform-scoped: mofood and mogrocery use separate zone/fee data.
 * @returns {{ deliveryCharge: number, deliveryLayerType: 'inner'|'outer'|'outermost' } | null}
 */
const getZoneLayerDeliveryChargeAndType = async (lat, lng, platform, preferredZoneId = null) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const platformFilter = platform === 'mogrocery'
    ? { platform: 'mogrocery' }
    : { $or: [{ platform: 'mofood' }, { platform: { $exists: false } }] };

  if (preferredZoneId && mongoose.Types.ObjectId.isValid(preferredZoneId)) {
    const preferredZone = await Zone.findOne({
      _id: new mongoose.Types.ObjectId(preferredZoneId),
      isActive: true,
      ...platformFilter
    }).lean();

    if (preferredZone) {
      const preferredZoneResult = getLayerChargeForZone(preferredZone, lat, lng);
      if (preferredZoneResult) {
        return preferredZoneResult;
      }
    }
  }

  const zones = await Zone.find({ isActive: true, ...platformFilter }).lean();
  for (const zone of zones) {
    const zoneResult = getLayerChargeForZone(zone, lat, lng);
    if (zoneResult) return zoneResult;
  }
  return null;
};

/**
 * Get active fee settings from database.
 * Platform-scoped: mofood and mogrocery have separate fee settings (same DB, filtered by platform).
 */
const getFeeSettings = async (platform = 'mofood') => {
  const normalizedPlatform = platform === 'mogrocery' ? 'mogrocery' : 'mofood';
  const platformFilter =
    normalizedPlatform === 'mogrocery'
      ? { platform: 'mogrocery' }
      : { $or: [{ platform: 'mofood' }, { platform: { $exists: false } }] };

  try {
    const feeSettings = await FeeSettings.findOne({
      ...platformFilter,
      isActive: true
    })
      .sort({ createdAt: -1 })
      .lean();
    
    if (feeSettings) {
      return feeSettings;
    }
    
    // Return default values if no active settings found
    return {
      deliveryFee: 25,
      freeDeliveryThreshold: 149,
      platformFee: 5,
      gstRate: 5,
    };
  } catch (error) {
    console.error('Error fetching fee settings:', error);
    // Return default values on error
    return {
      deliveryFee: 25,
      freeDeliveryThreshold: 149,
      platformFee: 5,
      gstRate: 5,
    };
  }
};

/**
 * Extract latitude and longitude from delivery address object
 */
const getDeliveryCoordinates = (deliveryAddress) => {
  if (!deliveryAddress || typeof deliveryAddress !== 'object') return { lat: null, lng: null };
  const lat = Number(deliveryAddress.latitude ?? deliveryAddress.lat ?? deliveryAddress.location?.latitude ?? deliveryAddress.location?.coordinates?.[1]);
  const lng = Number(deliveryAddress.longitude ?? deliveryAddress.lng ?? deliveryAddress.location?.longitude ?? deliveryAddress.location?.coordinates?.[0]);
  return { lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null };
};

/**
 * Calculate delivery fee based on order value, zone layers (inner/outer/outermost), and restaurant settings
 */
export const calculateDeliveryFee = async (
  orderValue,
  restaurant,
  deliveryAddress = null,
  platform = 'mofood',
  zoneId = null,
  options = {}
) => {
  const requestedPlatform = platform === 'mogrocery' ? 'mogrocery' : 'mofood';
  const restaurantPlatform = restaurant?.platform === 'mogrocery' ? 'mogrocery' : 'mofood';
  // Respect explicit grocery pricing requests even when restaurant/store platform in DB is stale.
  const pricingPlatform = requestedPlatform === 'mogrocery' ? 'mogrocery' : restaurantPlatform;
  const feeSettings = options.feeSettings || await getFeeSettings(pricingPlatform);

  // Zone layers: delivery charge by layer (inner/outer/outermost) - platform-scoped.
  // If a matching layer exists, layer charge takes precedence over generic threshold/range fees.
  const { lat, lng } = getDeliveryCoordinates(deliveryAddress);
  const zoneResult =
    options.zoneResult !== undefined
      ? options.zoneResult
      : lat != null && lng != null
        ? await getZoneLayerDeliveryChargeAndType(lat, lng, pricingPlatform, zoneId)
        : null;
  if (zoneResult !== null) {
    return zoneResult.deliveryCharge;
  }

  // Generic free delivery/range rules apply only when no layer-based zone charge matched.
  if (restaurant?.freeDeliveryAbove && orderValue >= restaurant.freeDeliveryAbove) {
    return 0;
  }
  const freeDeliveryThreshold = feeSettings.freeDeliveryThreshold || 149;
  if (orderValue >= freeDeliveryThreshold) {
    return 0;
  }

  // If admin range-based delivery fees are configured, they take precedence over default fee
  if (feeSettings.deliveryFeeRanges && Array.isArray(feeSettings.deliveryFeeRanges) && feeSettings.deliveryFeeRanges.length > 0) {
    const sortedRanges = [...feeSettings.deliveryFeeRanges].sort((a, b) => a.min - b.min);
    for (let i = 0; i < sortedRanges.length; i++) {
      const range = sortedRanges[i];
      const isLastRange = i === sortedRanges.length - 1;
      if (isLastRange) {
        if (orderValue >= range.min && orderValue <= range.max) return range.fee;
      } else if (orderValue >= range.min && orderValue < range.max) {
        return range.fee;
      }
    }
  }

  return feeSettings.deliveryFee ?? 25;
};

/**
 * Calculate platform fee
 */
export const calculatePlatformFee = async (platform = 'mofood', feeSettingsOverride = null) => {
  const feeSettings = feeSettingsOverride || await getFeeSettings(platform);
  return feeSettings.platformFee ?? 5;
};

/**
 * Calculate GST (Goods and Services Tax)
 * GST is calculated on subtotal after discounts
 */
export const calculateGST = async (subtotal, discount = 0, platform = 'mofood', feeSettingsOverride = null) => {
  const taxableAmount = subtotal - discount;
  const feeSettings = feeSettingsOverride || await getFeeSettings(platform);
  const gstRate = (feeSettings.gstRate ?? 5) / 100; // Convert percentage to decimal
  return Math.round(taxableAmount * gstRate);
};

/**
 * Calculate discount based on coupon code
 */
export const calculateDiscount = (coupon, subtotal) => {
  if (!coupon) return 0;
  
  if (coupon.minOrder && subtotal < coupon.minOrder) {
    return 0; // Minimum order not met
  }
  
  if (coupon.type === 'percentage') {
    const maxDiscount = coupon.maxDiscount || Infinity;
    const discount = Math.min(
      Math.round(subtotal * (coupon.discount / 100)),
      maxDiscount
    );
    return discount;
  } else if (coupon.type === 'flat') {
    return Math.min(coupon.discount, subtotal); // Can't discount more than subtotal
  }
  
  // Default: flat discount
  return Math.min(coupon.discount || 0, subtotal);
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in kilometers
 */
export const calculateDistance = (coord1, coord2) => {
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;
  
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

const toObjectIdString = (value) => {
  if (!value) return null;
  const normalized = typeof value === 'string' ? value : value?._id || value?.id || value;
  if (!normalized || !mongoose.Types.ObjectId.isValid(normalized)) return null;
  return normalized.toString();
};

const toObjectIdStringSet = (values) => {
  if (!Array.isArray(values)) return new Set();
  const result = new Set();
  values.forEach((value) => {
    const normalized = toObjectIdString(value);
    if (normalized) result.add(normalized);
  });
  return result;
};

const getActivePlanContext = async (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return null;

  const now = new Date();
  const recentPlanOrders = await Order.find({
    userId: new mongoose.Types.ObjectId(userId),
    'planSubscription.planId': { $exists: true, $ne: null },
    status: { $ne: 'cancelled' },
    'payment.status': { $nin: ['failed', 'refunded'] },
    $or: [
      { 'payment.status': 'completed' },
      { 'payment.razorpayPaymentId': { $exists: true, $ne: null } }
    ]
  })
    .select('planSubscription createdAt deliveredAt')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  if (!recentPlanOrders.length) return null;

  const uniquePlanIds = Array.from(
    new Set(
      recentPlanOrders
        .map((order) => toObjectIdString(order?.planSubscription?.planId))
        .filter(Boolean)
    )
  );

  if (!uniquePlanIds.length) return null;

  const plans = await GroceryPlan.find({ _id: { $in: uniquePlanIds } }).lean();
  const planById = new Map(plans.map((plan) => [plan._id.toString(), plan]));

  let selected = null;
  for (const order of recentPlanOrders) {
    const planId = toObjectIdString(order?.planSubscription?.planId);
    if (!planId) continue;
    const plan = planById.get(planId);
    if (!plan) continue;

    const durationFromOrder = Number(order?.planSubscription?.durationDays || 0);
    const durationDays = durationFromOrder > 0 ? durationFromOrder : Number(plan.durationDays || 0);
    if (durationDays <= 0) continue;

    const startedAt = order.deliveredAt ? new Date(order.deliveredAt) : new Date(order.createdAt);
    const expiresAt = new Date(startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
    if (expiresAt <= now) continue;

    if (!selected || expiresAt > selected.expiresAt) {
      selected = {
        plan,
        planId,
        startedAt,
        expiresAt,
        durationDays,
        selectedOfferIds: Array.from(toObjectIdStringSet(order?.planSubscription?.selectedOfferIds || []))
      };
    }
  }

  return selected;
};

const getOfferTargetSets = (offer) => ({
  productIds: toObjectIdStringSet(offer?.productIds),
  categoryIds: toObjectIdStringSet(offer?.categoryIds),
  subcategoryIds: toObjectIdStringSet(offer?.subcategoryIds)
});

const getOfferEligibleSubtotal = ({ offer, items, subtotalByProductId, productMetaById, orderSubtotal }) => {
  const { productIds, categoryIds, subcategoryIds } = getOfferTargetSets(offer);
  const hasTargeting = productIds.size > 0 || categoryIds.size > 0 || subcategoryIds.size > 0;
  if (!hasTargeting) return Math.max(0, Number(orderSubtotal || 0));

  let eligibleSubtotal = 0;
  items.forEach((item) => {
    const itemId = toObjectIdString(item?.itemId);
    if (!itemId) return;

    let matched = false;
    if (productIds.has(itemId)) matched = true;

    const meta = productMetaById.get(itemId);
    if (!matched && meta?.category && categoryIds.has(meta.category)) matched = true;
    if (!matched && Array.isArray(meta?.subcategories)) {
      matched = meta.subcategories.some((subcatId) => subcategoryIds.has(subcatId));
    }

    if (matched) {
      eligibleSubtotal += Number(subtotalByProductId.get(itemId) || 0);
    }
  });

  return Math.max(0, eligibleSubtotal);
};

const getOfferPercentageDiscount = ({ offer, items, subtotalByProductId, productMetaById, orderSubtotal }) => {
  const productIds = toObjectIdStringSet(offer?.productIds);
  const categoryIds = toObjectIdStringSet(offer?.categoryIds);
  const subcategoryIds = toObjectIdStringSet(offer?.subcategoryIds);

  const hasTargeting = productIds.size > 0 || categoryIds.size > 0 || subcategoryIds.size > 0;
  const basePercentage = Number(offer?.discountValue || 0);
  const categoryPercentage = Number(offer?.categoryDiscountPercentage || 0);
  const subcategoryPercentage = Number(offer?.subcategoryDiscountPercentage || 0);
  const productPercentage = Number(offer?.productDiscountPercentage || 0);

  if (!hasTargeting) {
    return {
      discount: Math.max(0, Math.round((Math.max(0, Number(orderSubtotal || 0)) * basePercentage) / 100)),
      eligibleSubtotal: Math.max(0, Number(orderSubtotal || 0)),
    };
  }

  let eligibleSubtotal = 0;
  let discount = 0;
  items.forEach((item) => {
    const itemId = toObjectIdString(item?.itemId);
    if (!itemId) return;

    const productMatched = productIds.has(itemId);
    const meta = productMetaById.get(itemId);
    const categoryMatched = Boolean(meta?.category && categoryIds.has(meta.category));
    const subcategoryMatched = Array.isArray(meta?.subcategories)
      ? meta.subcategories.some((subcatId) => subcategoryIds.has(subcatId))
      : false;
    const matched = productMatched || categoryMatched || subcategoryMatched;

    if (matched) {
      const itemSubtotal = Number(subtotalByProductId.get(itemId) || 0);
      eligibleSubtotal += itemSubtotal;
      let appliedPercentage = 0;
      if (productMatched && productPercentage > 0) {
        appliedPercentage = productPercentage;
      } else if (subcategoryMatched && subcategoryPercentage > 0) {
        appliedPercentage = subcategoryPercentage;
      } else if (categoryMatched && categoryPercentage > 0) {
        appliedPercentage = categoryPercentage;
      } else if (basePercentage > 0) {
        appliedPercentage = basePercentage;
      }
      if (appliedPercentage > 0 && itemSubtotal > 0) {
        discount += Math.round((itemSubtotal * appliedPercentage) / 100);
      }
    }
  });

  return {
    discount: Math.max(0, Math.round(discount)),
    eligibleSubtotal: Math.max(0, eligibleSubtotal),
  };
};

const getPlanBenefitAdjustment = async ({ userId, items, subtotal }) => {
  const activePlanContext = await getActivePlanContext(userId);
  if (!activePlanContext?.plan) return null;

  const { plan, planId, expiresAt, selectedOfferIds = [] } = activePlanContext;
  const now = new Date();
  const selectedOfferIdSet = new Set(selectedOfferIds.map((id) => String(id)));
  const hasSelectedOffers = selectedOfferIdSet.size > 0;
  const planOfferIds = Array.from(toObjectIdStringSet(plan.offerIds));
  const planOfferIdSet = new Set(planOfferIds);
  const offerQuery = {
    isActive: true,
    $and: [
      { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
      { $or: [{ validTill: null }, { validTill: { $gte: now } }] }
    ]
  };

  if (hasSelectedOffers) {
    offerQuery._id = {
      $in: Array.from(selectedOfferIdSet).map((id) => new mongoose.Types.ObjectId(id))
    };
  } else {
    const orFilters = [{ planIds: new mongoose.Types.ObjectId(planId) }];
    if (planOfferIds.length) {
      orFilters.push({ _id: { $in: planOfferIds.map((id) => new mongoose.Types.ObjectId(id)) } });
    }
    offerQuery.$or = orFilters;
  }

  const rawOffers = await GroceryPlanOffer.find(offerQuery).sort({ order: 1, createdAt: -1 }).lean();
  const offers = rawOffers.filter((offer) => {
    const offerId = toObjectIdString(offer?._id);
    if (!offerId) return false;
    const offerPlanIds = toObjectIdStringSet(offer?.planIds);
    const belongsToPlan = offerPlanIds.has(planId) || planOfferIdSet.has(offerId);
    if (!belongsToPlan) return false;
    if (hasSelectedOffers && !selectedOfferIdSet.has(offerId)) return false;
    return true;
  });
  const itemProductIds = Array.from(
    new Set(items.map((item) => toObjectIdString(item?.itemId)).filter(Boolean))
  );

  let productMetaById = new Map();
  if (itemProductIds.length) {
    const productDocs = await GroceryProduct.find({ _id: { $in: itemProductIds } })
      .select('category subcategory subcategories')
      .lean();
    productMetaById = new Map(
      productDocs.map((product) => {
        const normalizedSubcategories = toObjectIdStringSet([
          ...(Array.isArray(product.subcategories) ? product.subcategories : []),
          product.subcategory
        ]);
        return [
          product._id.toString(),
          {
            category: toObjectIdString(product.category),
            subcategories: Array.from(normalizedSubcategories)
          }
        ];
      })
    );
  }

  const subtotalByProductId = new Map();
  items.forEach((item) => {
    const itemId = toObjectIdString(item?.itemId);
    if (!itemId) return;
    const itemSubtotal = Number(item?.price || 0) * Number(item?.quantity || 1);
    subtotalByProductId.set(itemId, (subtotalByProductId.get(itemId) || 0) + itemSubtotal);
  });

  let bestDiscount = 0;
  let bestOffer = null;
  let freeDelivery = false;
  const appliedOfferIds = [];

  offers.forEach((offer) => {
    let offerDiscount = 0;
    if (offer.discountType === 'percentage') {
      const percentageResult = getOfferPercentageDiscount({
        offer,
        items,
        subtotalByProductId,
        productMetaById,
        orderSubtotal: subtotal
      });
      offerDiscount = percentageResult.discount;
      if (percentageResult.eligibleSubtotal <= 0) return;
    } else if (offer.discountType === 'flat') {
      const eligibleSubtotal = getOfferEligibleSubtotal({
        offer,
        items,
        subtotalByProductId,
        productMetaById,
        orderSubtotal: subtotal
      });
      if (eligibleSubtotal <= 0) return;
      const discountValue = Number(offer.discountValue || 0);
      offerDiscount = Math.min(Math.round(discountValue), Math.round(eligibleSubtotal));
    } else {
      const eligibleSubtotal = getOfferEligibleSubtotal({
        offer,
        items,
        subtotalByProductId,
        productMetaById,
        orderSubtotal: subtotal
      });
      if (eligibleSubtotal <= 0) return;
    }

    appliedOfferIds.push(offer._id.toString());

    if (offer.freeDelivery) {
      freeDelivery = true;
    }

    if (offerDiscount > bestDiscount) {
      bestDiscount = offerDiscount;
      bestOffer = offer;
    }
  });

  // Fallback free delivery from textual plan benefits.
  if (!freeDelivery) {
    const benefitText = Array.isArray(plan.benefits) ? plan.benefits.join(' ').toLowerCase() : '';
    if (benefitText.includes('free delivery')) {
      freeDelivery = true;
    }
  }

  return {
    planId,
    planName: plan.name || '',
    expiresAt,
    freeDelivery,
    discount: Math.max(0, Math.round(bestDiscount)),
    bestDiscountOffer: bestOffer
      ? {
          id: bestOffer._id.toString(),
          name: bestOffer.name || '',
          discountType: bestOffer.discountType || 'none',
          discountValue: Number(bestOffer.discountValue || 0),
          categoryDiscountPercentage: Number(bestOffer.categoryDiscountPercentage || 0),
          subcategoryDiscountPercentage: Number(bestOffer.subcategoryDiscountPercentage || 0),
          productDiscountPercentage: Number(bestOffer.productDiscountPercentage || 0)
        }
      : null,
    appliedOfferIds
  };
};

/**
 * Main function to calculate order pricing
 */
export const calculateOrderPricing = async ({
  items,
  restaurantId,
  restaurantEntity = null,
  deliveryAddress = null,
  couponCode = null,
  deliveryFleet = 'standard',
  userId = null,
  platform = 'mofood',
  zoneId = null
}) => {
  try {
    // Calculate subtotal from items
    const subtotal = items.reduce((sum, item) => {
      return sum + (item.price || 0) * (item.quantity || 1);
    }, 0);
    
    if (subtotal <= 0) {
      throw new Error('Order subtotal must be greater than 0');
    }
    
    // Get restaurant details
    let restaurant = restaurantEntity || null;
    let offerRestaurantObjectId = restaurantEntity?._id || null;
    if (!restaurant && restaurantId) {
      const resolvedContext = await resolveOfferRestaurantContext(restaurantId);
      restaurant = resolvedContext.restaurant;
      offerRestaurantObjectId = resolvedContext.offerRestaurantObjectId;
    }
    
    // Calculate coupon discount
    let discount = 0;
    let appliedCoupon = null;
    
    if (couponCode && restaurant && offerRestaurantObjectId) {
      try {
        if (offerRestaurantObjectId) {
          const now = new Date();
          
          // Find active offer with this coupon code for this restaurant
          const offer = await Offer.findOne({
            restaurant: offerRestaurantObjectId,
            status: 'active',
            'items.couponCode': couponCode,
            startDate: { $lte: now },
            $and: [
              { $or: [{ showAtCheckout: true }, { showAtCheckout: { $exists: false } }] },
              {
                $or: [
                  { endDate: { $gte: now } },
                  { endDate: null }
                ]
              }
            ]
          }).lean();

          if (offer) {
            // Find the specific item coupon
            const couponItem = offer.items.find(item => item.couponCode === couponCode);
            
            if (couponItem) {
              // "new" coupons are only valid for first-time customers (no delivered orders yet).
              let customerGroupEligible = true;
              if (offer.customerGroup === 'new') {
                if (!userId) {
                  customerGroupEligible = false;
                } else {
                  const deliveredOrders = await Order.countDocuments({
                    status: 'delivered',
                    $or: [
                      { userId: userId },
                      ...(mongoose.Types.ObjectId.isValid(String(userId))
                        ? [{ userId: new mongoose.Types.ObjectId(String(userId)) }]
                        : [])
                    ]
                  });
                  customerGroupEligible = deliveredOrders === 0;
                }
              } else if (offer.customerGroup === 'shared') {
                if (!userId) {
                  customerGroupEligible = false;
                } else {
                  const sharedUser = await User.findOne({
                    _id: mongoose.Types.ObjectId.isValid(String(userId))
                      ? new mongoose.Types.ObjectId(String(userId))
                      : userId,
                    hasSharedApp: true
                  })
                    .select('_id')
                    .lean();
                  customerGroupEligible = Boolean(sharedUser);
                }
              }

              // Check if coupon is valid for items in cart
              const cartItemIds = items.map(item => item.itemId);
              const isAllItemsCoupon = couponItem.itemId === '__ALL_ITEMS__';
              const isValidForCart = isAllItemsCoupon || (couponItem.itemId && cartItemIds.includes(couponItem.itemId));
              
              // Check minimum order value
              const minOrderMet = !offer.minOrderValue || subtotal >= offer.minOrderValue;
              
              if (isValidForCart && minOrderMet && customerGroupEligible) {
                // Calculate discount based on offer type
                const maxDiscountLimit = offer.maxLimit == null ? Infinity : Math.max(0, Number(offer.maxLimit) || 0);

                if (isAllItemsCoupon) {
                  discount = Math.round((subtotal * (Number(couponItem.discountPercentage) || 0)) / 100);
                  discount = Math.min(discount, subtotal);
                } else {
                  const itemInCart = items.find(item => item.itemId === couponItem.itemId);
                  if (itemInCart) {
                    const itemQuantity = itemInCart.quantity || 1;
                    
                    // Calculate discount per item
                    const discountPerItem = couponItem.originalPrice - couponItem.discountedPrice;
                    
                    // Apply discount to all quantities of this item
                    discount = Math.round(discountPerItem * itemQuantity);
                    
                    // Ensure discount doesn't exceed item subtotal
                    const itemSubtotal = (itemInCart.price || 0) * itemQuantity;
                    discount = Math.min(discount, itemSubtotal);
                  }
                }
                discount = Math.min(discount, maxDiscountLimit);
                
                appliedCoupon = {
                  code: couponCode,
                  discount: discount,
                  discountPercentage: couponItem.discountPercentage,
                  minOrder: offer.minOrderValue || 0,
                  type: offer.discountType === 'percentage' ? 'percentage' : 'flat',
                  itemId: couponItem.itemId,
                  itemName: couponItem.itemName,
                  originalPrice: couponItem.originalPrice,
                  discountedPrice: couponItem.discountedPrice,
                };
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching coupon from database: ${error.message}`);
        // Continue without coupon if there's an error
      }
    }

    const pricingPlatform = restaurant?.platform === 'mogrocery' ? 'mogrocery' : (platform === 'mogrocery' ? 'mogrocery' : 'mofood');
    const feeSettings = await getFeeSettings(pricingPlatform);

    const planBenefits = pricingPlatform === 'mogrocery'
      ? await getPlanBenefitAdjustment({
          userId,
          items,
          subtotal
        })
      : null;

    const planDiscount = Number(planBenefits?.discount || 0);
    const totalDiscount = Math.min(Math.round(subtotal), Math.max(0, Math.round(discount + planDiscount)));

    // Delivery fee: use zone layer (inner/outer/outermost) when address has coordinates; platform-scoped (mofood vs mogrocery)
    let deliveryLayerType = null;
    const { lat: deliveryLat, lng: deliveryLng } = getDeliveryCoordinates(deliveryAddress);
    let zoneResult = null;
    if (deliveryLat != null && deliveryLng != null) {
      zoneResult = await getZoneLayerDeliveryChargeAndType(
        deliveryLat,
        deliveryLng,
        pricingPlatform,
        zoneId
      );
      if (zoneResult !== null) {
        deliveryLayerType = zoneResult.deliveryLayerType;
      }
    }
    const deliveryFee = await calculateDeliveryFee(
      subtotal,
      restaurant,
      deliveryAddress,
      pricingPlatform,
      zoneId,
      {
        feeSettings,
        zoneResult
      }
    );
    
    // Apply free delivery from coupon or active plan.
    const isFreeDeliveryApplied = Boolean(appliedCoupon?.freeDelivery || planBenefits?.freeDelivery);
    const finalDeliveryFee = isFreeDeliveryApplied ? 0 : deliveryFee;
    
    // Calculate platform fee
    const platformFee = await calculatePlatformFee(pricingPlatform, feeSettings);

    // Calculate GST on subtotal after discount
    const gst = await calculateGST(subtotal, totalDiscount, pricingPlatform, feeSettings);
    
    // Calculate total
    const total = subtotal - totalDiscount + finalDeliveryFee + platformFee + gst;
    
    // Calculate savings (discount + any delivery savings)
    const savings = totalDiscount + (deliveryFee > finalDeliveryFee ? deliveryFee - finalDeliveryFee : 0);
    
    return {
      subtotal: Math.round(subtotal),
      discount: Math.round(totalDiscount),
      deliveryFee: Math.round(finalDeliveryFee),
      ...(deliveryLayerType && { deliveryLayerType }),
      platformFee: Math.round(platformFee),
      tax: gst, // Already rounded in calculateGST
      total: Math.round(total),
      savings: Math.round(savings),
      appliedPlanBenefits: planBenefits
        ? {
            planId: planBenefits.planId,
            planName: planBenefits.planName,
            expiresAt: planBenefits.expiresAt,
            freeDelivery: Boolean(planBenefits.freeDelivery),
            discount: Number(planBenefits.discount || 0),
            bestDiscountOffer: planBenefits.bestDiscountOffer,
            appliedOfferIds: planBenefits.appliedOfferIds
          }
        : null,
      appliedCoupon: appliedCoupon ? {
        code: appliedCoupon.code,
        discount: discount,
        freeDelivery: appliedCoupon.freeDelivery || false
      } : null,
      breakdown: {
        itemTotal: Math.round(subtotal),
        discountAmount: Math.round(totalDiscount),
        couponDiscountAmount: Math.round(discount),
        planDiscountAmount: Math.round(planDiscount),
        deliveryFee: Math.round(finalDeliveryFee),
        platformFee: Math.round(platformFee),
        gst: gst,
        total: Math.round(total)
      }
    };
  } catch (error) {
    throw new Error(`Failed to calculate order pricing: ${error.message}`);
  }
};
