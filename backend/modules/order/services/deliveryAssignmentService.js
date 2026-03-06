import Delivery from '../../delivery/models/Delivery.js';
import Order from '../models/Order.js';
import Zone from '../../admin/models/Zone.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import GroceryStore from '../../grocery/models/GroceryStore.js';
import DeliveryWallet from '../../delivery/models/DeliveryWallet.js';
import { resolveGlobalCODLimit, resolveOrderCODAmount } from '../../delivery/services/codLimitService.js';
import mongoose from 'mongoose';
import { findNearestOnlineDeliveryPartnersFromFirebase } from '../../../shared/services/firebaseRealtimeService.js';

function getPlatformZoneFilter(platform = 'mofood') {
  return platform === 'mogrocery'
    ? { platform: 'mogrocery' }
    : { $or: [{ platform: 'mofood' }, { platform: { $exists: false } }] };
}

function isPointInZoneBoundary(lat, lng, zoneCoordinates = []) {
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
}

function normalizeDeliveryPartnerZoneIds(rawZones = []) {
  if (!Array.isArray(rawZones)) return [];
  return rawZones
    .map((zoneValue) => {
      if (!zoneValue) return null;
      if (typeof zoneValue === 'string') return zoneValue.trim();
      if (typeof zoneValue === 'object') {
        return String(zoneValue._id || zoneValue.id || '').trim();
      }
      return String(zoneValue).trim();
    })
    .filter(Boolean);
}

function normalizeZoneOption(rawOptions = null) {
  // Backward compatibility: some legacy callers pass a 5th numeric arg (top-N hint).
  if (!rawOptions || typeof rawOptions === 'number') {
    return { requiredZoneId: null };
  }

  if (typeof rawOptions === 'string') {
    const trimmed = rawOptions.trim();
    return { requiredZoneId: trimmed || null };
  }

  if (typeof rawOptions === 'object') {
    const zoneId = rawOptions.requiredZoneId || rawOptions.zoneId || null;
    return { requiredZoneId: zoneId ? String(zoneId).trim() : null };
  }

  return { requiredZoneId: null };
}

async function resolveRestaurantPlatformAndZone(restaurantId) {
  let platform = 'mofood';
  let zone = null;

  if (!restaurantId) {
    return { platform, zone, activeZones: [] };
  }

  let restaurant = null;
  const restaurantIdString = restaurantId?.toString ? restaurantId.toString() : String(restaurantId);

  try {
    if (mongoose.Types.ObjectId.isValid(restaurantIdString)) {
      restaurant = await Restaurant.findById(restaurantIdString)
        .select('_id restaurantId platform slug location')
        .lean();
      if (!restaurant) {
        restaurant = await GroceryStore.findById(restaurantIdString)
          .select('_id restaurantId platform slug location')
          .lean();
      }
    }

    if (!restaurant) {
      restaurant = await Restaurant.findOne({
        $or: [{ restaurantId: restaurantIdString }, { slug: restaurantIdString }]
      })
        .select('_id restaurantId platform slug location')
        .lean();
      if (!restaurant) {
        restaurant = await GroceryStore.findOne({
          $or: [{ restaurantId: restaurantIdString }, { slug: restaurantIdString }]
        })
          .select('_id restaurantId platform slug location')
          .lean();
      }
    }
  } catch {
    restaurant = null;
  }

  if (restaurant?.platform === 'mogrocery') {
    platform = 'mogrocery';
  }

  const platformFilter = getPlatformZoneFilter(platform);
  const activeZones = await Zone.find({ isActive: true, ...platformFilter })
    .select('_id name coordinates restaurantId')
    .lean();

  const restaurantIdCandidates = new Set([restaurantIdString]);
  if (restaurant?._id) restaurantIdCandidates.add(String(restaurant._id));
  if (restaurant?.restaurantId) restaurantIdCandidates.add(String(restaurant.restaurantId));

  zone =
    activeZones.find((z) => restaurantIdCandidates.has(String(z.restaurantId || ''))) || null;

  if (!zone && restaurant?.location?.coordinates?.length >= 2) {
    const [restaurantLng, restaurantLat] = restaurant.location.coordinates;
    if (Number.isFinite(restaurantLat) && Number.isFinite(restaurantLng)) {
      zone = activeZones.find((z) => isPointInZoneBoundary(restaurantLat, restaurantLng, z.coordinates)) || null;
    }
  }

  return { platform, zone, activeZones };
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in kilometers
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

async function getCashLimitEligibleDeliveryPartnerIds(deliveryPartners = [], incomingCodAmount = 0) {
  const deliveryIds = deliveryPartners
    .map((partner) => String(partner?._id || ''))
    .filter(Boolean);

  if (deliveryIds.length === 0) {
    return { eligibleIds: new Set(), totalCashLimit: 750 };
  }

  const totalCashLimit = await resolveGlobalCODLimit();
  const validObjectIds = deliveryIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const wallets = validObjectIds.length > 0
    ? await DeliveryWallet.find({ deliveryId: { $in: validObjectIds } })
        .select('deliveryId cashInHand codCashCollected')
        .lean()
    : [];

  const cashInHandByDeliveryId = new Map(
    wallets.map((wallet) => {
      const cashCollected = Math.max(
        0,
        Number(wallet?.codCashCollected ?? wallet?.cashInHand ?? 0) || 0
      );
      return [String(wallet.deliveryId), cashCollected];
    })
  );
  const deliveryLimitById = new Map(
    deliveryPartners.map((partner) => {
      const override = Number(partner?.cod?.limitOverride);
      const effectiveLimit = Number.isFinite(override) && override >= 0 ? override : totalCashLimit;
      return [String(partner?._id || ''), effectiveLimit];
    })
  );

  const eligibleIds = new Set();
  let blockedCount = 0;

  for (const deliveryId of deliveryIds) {
    const cashInHand = cashInHandByDeliveryId.get(deliveryId) ?? 0;
    const riderCashLimit = deliveryLimitById.get(deliveryId) ?? totalCashLimit;
    const projectedCashInHand = cashInHand + Math.max(0, Number(incomingCodAmount) || 0);
    if (projectedCashInHand > riderCashLimit || cashInHand >= riderCashLimit) {
      blockedCount += 1;
      continue;
    }
    eligibleIds.add(deliveryId);
  }

  if (blockedCount > 0) {
    console.log(`🚫 Excluded ${blockedCount} delivery partners at/above cash-in-hand limit ₹${totalCashLimit}`);
  }

  return { eligibleIds, totalCashLimit };
}

/**
 * Find all nearest available delivery boys within priority distance (for priority notification)
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {string} restaurantId - Restaurant ID (for zone lookup)
 * @param {number} priorityDistance - Priority distance in km (default: 5km)
 * @returns {Promise<Array>} Array of delivery boys within priority distance
 */
export async function findNearestDeliveryBoys(restaurantLat, restaurantLng, restaurantId = null, priorityDistance = 5) {
  try {
    console.log(`🔍 Searching for priority delivery partners within ${priorityDistance}km of restaurant: ${restaurantLat}, ${restaurantLng}`);
    
    // Use the same logic as findNearestDeliveryBoy but return all within priority distance
    let zone = null;
    let deliveryQuery = {
      'availability.isOnline': true,
      status: { $in: ['approved', 'active'] },
      isActive: true,
      'availability.currentLocation.coordinates': {
        $exists: true,
        $ne: [0, 0]
      }
    };

    const rawOptions = arguments.length >= 5 ? arguments[4] : null;
    const { requiredZoneId } = normalizeZoneOption(rawOptions);
    const incomingCodAmount = Math.max(0, Number(rawOptions?.incomingCodAmount) || 0);

    const { zone: resolvedZone, activeZones } = await resolveRestaurantPlatformAndZone(restaurantId);
    zone = resolvedZone;
    if (requiredZoneId) {
      const zoneById = activeZones.find((z) => String(z._id) === String(requiredZoneId));
      if (zoneById) {
        zone = zoneById;
      } else {
        console.log(`⚠️ Required zone ${requiredZoneId} not found in active zones for restaurant ${restaurantId}`);
      }
    }
    if (zone) {
      console.log(`✅ Found zone: ${zone.name} for restaurant ${restaurantId}`);
    }

    const deliveryPartners = await Delivery.find(deliveryQuery)
      .select('_id name phone availability.currentLocation availability.lastLocationUpdate availability.zones status isActive cod.limitOverride')
      .lean();

    console.log(`📊 Found ${deliveryPartners?.length || 0} online delivery partners`);

    if (!deliveryPartners || deliveryPartners.length === 0) {
      return [];
    }
    const { eligibleIds: cashLimitEligibleIds } =
      await getCashLimitEligibleDeliveryPartnerIds(deliveryPartners, incomingCodAmount);

    // Calculate distance and filter
    const deliveryPartnersWithDistance = deliveryPartners
      .map(partner => {
        if (!cashLimitEligibleIds.has(String(partner._id))) {
          return null;
        }

        const location = partner.availability?.currentLocation;
        if (!location || !location.coordinates || location.coordinates.length < 2) {
          return null;
        }

        const [lng, lat] = location.coordinates;
        if (lat === 0 && lng === 0) {
          return null;
        }

        // Zone filtering (same as findNearestDeliveryBoy)
        if (zone) {
          const partnerZoneIds = normalizeDeliveryPartnerZoneIds(partner.availability?.zones);
          if (partnerZoneIds.length > 0 && !partnerZoneIds.includes(String(zone._id))) {
            return null;
          }
          if (partnerZoneIds.length === 0 && zone.coordinates && zone.coordinates.length >= 3) {
            if (!isPointInZoneBoundary(lat, lng, zone.coordinates)) return null;
          }
        } else if (activeZones.length > 0) {
          // Hard block: out-of-zone riders should not receive orders.
          const insideAnyActiveZone = activeZones.some((activeZone) =>
            isPointInZoneBoundary(lat, lng, activeZone.coordinates)
          );
          if (!insideAnyActiveZone) return null;
        }

        const distance = calculateDistance(restaurantLat, restaurantLng, lat, lng);
        return {
          ...partner,
          distance,
          latitude: lat,
          longitude: lng,
          zoneId: normalizeDeliveryPartnerZoneIds(partner.availability?.zones)[0] || null
        };
      })
      .filter(partner => partner !== null && partner.distance <= priorityDistance)
      .sort((a, b) => a.distance - b.distance);

    console.log(`✅ Found ${deliveryPartnersWithDistance.length} priority delivery partners within ${priorityDistance}km`);
    return deliveryPartnersWithDistance.map(partner => ({
      deliveryPartnerId: partner._id.toString(),
      name: partner.name,
      phone: partner.phone,
      distance: partner.distance,
      location: {
        latitude: partner.latitude,
        longitude: partner.longitude
      }
    }));
  } catch (error) {
    console.error('❌ Error finding nearest delivery boys:', error);
    return [];
  }
}

/**
 * Find the nearest available delivery boy to a restaurant location (with zone-based filtering)
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {string} restaurantId - Restaurant ID (for zone lookup)
 * @param {number} maxDistance - Maximum distance in km (default: 50km)
 * @param {Array} excludeIds - Array of delivery partner IDs to exclude (already notified)
 * @returns {Promise<Object|null>} Nearest delivery boy or null
 */
export async function findNearestDeliveryBoy(
  restaurantLat,
  restaurantLng,
  restaurantId = null,
  maxDistance = 50,
  excludeIds = [],
  options = null
) {
  try {
    console.log(`🔍 Searching for nearest delivery partner near restaurant: ${restaurantLat}, ${restaurantLng} (Restaurant ID: ${restaurantId})`);
    
    // Step 1: Find zone for restaurant (if restaurantId provided)
    let zone = null;
    let deliveryQuery = {
      'availability.isOnline': true,
      status: { $in: ['approved', 'active'] },
      isActive: true,
      'availability.currentLocation.coordinates': {
        $exists: true,
        $ne: [0, 0] // Exclude default/null coordinates
      }
    };

    const { requiredZoneId } = normalizeZoneOption(options);
    const incomingCodAmount = Math.max(0, Number(options?.incomingCodAmount) || 0);
    const { zone: resolvedZone, activeZones } = await resolveRestaurantPlatformAndZone(restaurantId);
    zone = resolvedZone;
    if (requiredZoneId) {
      const zoneById = activeZones.find((z) => String(z._id) === String(requiredZoneId));
      if (zoneById) {
        zone = zoneById;
      } else {
        console.log(`⚠️ Required zone ${requiredZoneId} not found in active zones for restaurant ${restaurantId}`);
      }
    }
    if (zone) {
      console.log(`✅ Found zone: ${zone.name} for restaurant ${restaurantId}`);
    } else {
      console.log(`⚠️ No specific restaurant zone found for ${restaurantId}, using active-zone boundary filtering`);
    }

    // Exclude already notified delivery partners
    if (excludeIds && excludeIds.length > 0) {
      const excludeObjectIds = excludeIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
      if (excludeObjectIds.length > 0) {
        deliveryQuery._id = { $nin: excludeObjectIds };
        console.log(`🚫 Excluding ${excludeObjectIds.length} already notified delivery partners`);
      }
    }

    // Optional fast path: use Firebase Realtime online riders table first.
    // This avoids scanning all riders in Mongo for nearest lookup.
    if (process.env.USE_FIREBASE_NEAREST_DELIVERY === 'true') {
      try {
        const firebaseCandidates = await findNearestOnlineDeliveryPartnersFromFirebase({
          restaurantLat,
          restaurantLng,
          maxDistanceKm: maxDistance,
          limit: 50
        });

        if (firebaseCandidates.length > 0) {
          const firebaseIdSet = new Set(
            firebaseCandidates
              .map((candidate) => candidate.deliveryPartnerId)
              .filter((id) => mongoose.Types.ObjectId.isValid(id))
          );

          if (firebaseIdSet.size > 0) {
            const firebaseIds = Array.from(firebaseIdSet).map((id) => new mongoose.Types.ObjectId(id));
            const deliveryPartners = await Delivery.find({
              ...deliveryQuery,
              _id: { $in: firebaseIds }
            })
              .select('_id name phone availability.currentLocation availability.lastLocationUpdate availability.zones status isActive cod.limitOverride')
              .lean();
            const { eligibleIds: cashLimitEligibleIds } =
              await getCashLimitEligibleDeliveryPartnerIds(deliveryPartners, incomingCodAmount);

            const deliveryById = new Map(
              deliveryPartners
                .filter((partner) => cashLimitEligibleIds.has(String(partner._id)))
                .map((partner) => [String(partner._id), partner])
            );

            for (const candidate of firebaseCandidates) {
              const partner = deliveryById.get(String(candidate.deliveryPartnerId));
              if (!partner) continue;

              const lat = Number(candidate.lat);
              const lng = Number(candidate.lng);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

              if (zone) {
                const partnerZoneIds = normalizeDeliveryPartnerZoneIds(partner.availability?.zones);
                if (partnerZoneIds.length > 0 && !partnerZoneIds.includes(String(zone._id))) {
                  continue;
                }
                if (partnerZoneIds.length === 0 && zone.coordinates && zone.coordinates.length >= 3) {
                  if (!isPointInZoneBoundary(lat, lng, zone.coordinates)) continue;
                }
              } else if (activeZones.length > 0) {
                const insideAnyActiveZone = activeZones.some((activeZone) =>
                  isPointInZoneBoundary(lat, lng, activeZone.coordinates)
                );
                if (!insideAnyActiveZone) continue;
              }

              const distance = calculateDistance(restaurantLat, restaurantLng, lat, lng);
              if (distance > maxDistance) continue;

              return {
                deliveryPartnerId: String(partner._id),
                name: partner.name,
                phone: partner.phone,
                distance,
                location: {
                  latitude: lat,
                  longitude: lng
                }
              };
            }
          }
        }
      } catch (firebaseError) {
        console.warn(`Firebase nearest-rider lookup failed, falling back to Mongo: ${firebaseError.message}`);
      }
    }

    // Find all online delivery partners (with zone filter if applicable)
    const deliveryPartners = await Delivery.find(deliveryQuery)
      .select('_id name phone availability.currentLocation availability.lastLocationUpdate availability.zones status isActive cod.limitOverride')
      .lean();

    console.log(`📊 Found ${deliveryPartners?.length || 0} online delivery partners in database`);

    if (!deliveryPartners || deliveryPartners.length === 0) {
      console.log('⚠️ No online delivery partners found');
      console.log('⚠️ Checking all delivery partners to see why...');
      
      // Debug: Check all delivery partners to see their status
      const allPartners = await Delivery.find({})
        .select('_id name availability.isOnline status isActive availability.currentLocation')
        .lean();
      
      console.log(`📊 Total delivery partners in database: ${allPartners.length}`);
      allPartners.forEach(partner => {
        console.log(`  - ${partner.name} (${partner._id}): online=${partner.availability?.isOnline}, status=${partner.status}, active=${partner.isActive}, hasLocation=${!!partner.availability?.currentLocation?.coordinates}`);
      });
      
      return null;
    }

    const { eligibleIds: cashLimitEligibleIds } =
      await getCashLimitEligibleDeliveryPartnerIds(deliveryPartners, incomingCodAmount);
    // Calculate distance for each delivery partner and filter by zone if applicable
    const deliveryPartnersWithDistance = deliveryPartners
      .map(partner => {
        if (!cashLimitEligibleIds.has(String(partner._id))) {
          return null;
        }

        const location = partner.availability?.currentLocation;
        if (!location || !location.coordinates || location.coordinates.length < 2) {
          return null;
        }

        const [lng, lat] = location.coordinates; // GeoJSON format: [longitude, latitude]
        
        // Skip if coordinates are invalid
        if (lat === 0 && lng === 0) {
          return null;
        }

        // Filter by zone if zone exists
        if (zone) {
          const partnerZoneIds = normalizeDeliveryPartnerZoneIds(partner.availability?.zones);

          if (partnerZoneIds.length > 0 && !partnerZoneIds.includes(String(zone._id))) {
            console.log(`⚠️ Delivery partner ${partner._id} not in zone ${zone.name} (partner zones: ${partnerZoneIds.join(',')}, required zone: ${zone._id})`);
            return null; // Skip delivery partners not in the restaurant's zone
          }

          if (partnerZoneIds.length === 0 && zone.coordinates && zone.coordinates.length >= 3) {
            if (!isPointInZoneBoundary(lat, lng, zone.coordinates)) {
              console.log(`⚠️ Delivery partner ${partner._id} location (${lat}, ${lng}) not within zone ${zone.name} boundary`);
              return null;
            }
          }
        } else if (activeZones.length > 0) {
          // Hard block: out-of-zone riders should not receive orders.
          const insideAnyActiveZone = activeZones.some((activeZone) =>
            isPointInZoneBoundary(lat, lng, activeZone.coordinates)
          );
          if (!insideAnyActiveZone) {
            console.log(`⚠️ Delivery partner ${partner._id} is out of active delivery zones, skipping assignment`);
            return null;
          }
        }

        const distance = calculateDistance(restaurantLat, restaurantLng, lat, lng);
        
        return {
          ...partner,
          distance,
          latitude: lat,
          longitude: lng,
          zoneId: normalizeDeliveryPartnerZoneIds(partner.availability?.zones)[0] || null
        };
      })
      .filter(partner => partner !== null && partner.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance); // Sort by distance (nearest first)

    if (deliveryPartnersWithDistance.length === 0) {
      console.log(`⚠️ No delivery partners found within ${maxDistance}km`);
      return null;
    }

    // Get the nearest delivery partner
    const nearestPartner = deliveryPartnersWithDistance[0];
    
    console.log(`✅ Found nearest delivery partner: ${nearestPartner.name} (ID: ${nearestPartner._id})`);
    console.log(`✅ Distance: ${nearestPartner.distance.toFixed(2)}km away`);
    console.log(`✅ Location: ${nearestPartner.latitude}, ${nearestPartner.longitude}`);
    console.log(`✅ Phone: ${nearestPartner.phone}`);

    return {
      deliveryPartnerId: nearestPartner._id.toString(),
      name: nearestPartner.name,
      phone: nearestPartner.phone,
      distance: nearestPartner.distance,
      location: {
        latitude: nearestPartner.latitude,
        longitude: nearestPartner.longitude
      }
    };
  } catch (error) {
    console.error('❌ Error finding nearest delivery boy:', error);
    throw error;
  }
}

/**
 * Assign order to nearest delivery boy
 * @param {Object} order - Order document
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @returns {Promise<Object|null>} Assignment result or null
 */
export async function assignOrderToDeliveryBoy(order, restaurantLat, restaurantLng, restaurantId = null) {
  try {
    // CRITICAL: Don't assign if order is cancelled
    if (order.status === 'cancelled') {
      console.log(`⚠️ Order ${order.orderId} is cancelled. Cannot assign to delivery partner.`);
      return null;
    }
    
    // CRITICAL: Don't assign if order is already delivered/completed
    if (order.status === 'delivered' || 
        order.deliveryState?.currentPhase === 'completed' ||
        order.deliveryState?.status === 'delivered') {
      console.log(`⚠️ Order ${order.orderId} is already delivered/completed. Cannot assign.`);
      return null;
    }
    
    // Check if order already has a delivery partner assigned
    if (order.deliveryPartnerId) {
      console.log(`⚠️ Order ${order.orderId} already has delivery partner assigned`);
      return null;
    }

    // Get restaurantId from order if not provided
    const orderRestaurantId = restaurantId || order.restaurantId;
    const incomingCodAmount = await resolveOrderCODAmount(order);
    
    // Find nearest delivery boy (with zone-based filtering)
    const requiredZoneId = order?.assignmentInfo?.zoneId ? String(order.assignmentInfo.zoneId) : null;
    const nearestDeliveryBoy = await findNearestDeliveryBoy(
      restaurantLat,
      restaurantLng,
      orderRestaurantId,
      50,
      [],
      { requiredZoneId, incomingCodAmount }
    );

    if (!nearestDeliveryBoy) {
      console.log(`⚠️ No delivery boy found for order ${order.orderId}`);
      return null;
    }

    // Update order with delivery partner assignment
    // Note: Don't set outForDelivery yet - that should happen when delivery boy picks up the order
    order.deliveryPartnerId = nearestDeliveryBoy.deliveryPartnerId;
    order.assignmentInfo = {
      deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
      distance: nearestDeliveryBoy.distance,
      assignedAt: new Date(),
      assignedBy: 'nearest_available'
    };
    // Don't set outForDelivery status here - that should be set when delivery boy picks up the order
    // order.tracking.outForDelivery = {
    //   status: true,
    //   timestamp: new Date()
    // };
    
    await order.save();

    // Trigger ETA recalculation for rider assigned event
    try {
      const etaEventService = (await import('./etaEventService.js')).default;
      await etaEventService.handleRiderAssigned(order._id.toString(), nearestDeliveryBoy.deliveryPartnerId);
      console.log(`✅ ETA updated after rider assigned to order ${order.orderId}`);
    } catch (etaError) {
      console.error('Error updating ETA after rider assignment:', etaError);
      // Continue even if ETA update fails
    }

    console.log(`✅ Assigned order ${order.orderId} to delivery partner ${nearestDeliveryBoy.name}`);

    return {
      success: true,
      deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
      deliveryPartnerName: nearestDeliveryBoy.name,
      distance: nearestDeliveryBoy.distance,
      orderId: order.orderId
    };
  } catch (error) {
    console.error('❌ Error assigning order to delivery boy:', error);
    throw error;
  }
}

