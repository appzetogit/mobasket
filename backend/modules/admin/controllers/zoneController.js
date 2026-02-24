import Zone from '../models/Zone.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import mongoose from 'mongoose';

const normalizePlatform = (value) => (value === 'mogrocery' ? 'mogrocery' : 'mofood');
const buildPlatformQuery = (platform) => {
  const normalizedPlatform = normalizePlatform(platform);
  return normalizedPlatform === 'mofood'
    ? { $or: [{ platform: 'mofood' }, { platform: { $exists: false } }] }
    : { platform: 'mogrocery' };
};

/** Validate and normalize layers (inner, outer, outermost) with coordinates and deliveryCharge */
const validateLayers = (layers) => {
  if (!layers || !Array.isArray(layers)) return null;
  if (layers.length === 0) return [];
  const types = new Set();
  const result = [];
  for (const layer of layers) {
    if (!layer || !['inner', 'outer', 'outermost'].includes(layer.type)) {
      return { error: `Each layer must have type: inner, outer, or outermost` };
    }
    if (types.has(layer.type)) {
      return { error: `Duplicate layer type: ${layer.type}` };
    }
    types.add(layer.type);
    const coords = layer.coordinates;
    if (!Array.isArray(coords) || coords.length < 3) {
      return { error: `Layer "${layer.type}" must have at least 3 coordinates` };
    }
    for (const c of coords) {
      if (c == null || typeof c !== 'object' || !Number.isFinite(c.latitude ?? c.lat) || !Number.isFinite(c.longitude ?? c.lng)) {
        return { error: `Layer "${layer.type}" has invalid coordinate` };
      }
    }
    const deliveryCharge = Number(layer.deliveryCharge);
    if (Number.isNaN(deliveryCharge) || deliveryCharge < 0) {
      return { error: `Layer "${layer.type}" deliveryCharge must be a non-negative number` };
    }
    result.push({
      type: layer.type,
      coordinates: coords.map((c) => ({
        latitude: Number(c.latitude ?? c.lat),
        longitude: Number(c.longitude ?? c.lng)
      })),
      deliveryCharge: Math.round(deliveryCharge * 100) / 100
    });
  }
  return result;
};

/**
 * Get all zones
 * GET /api/admin/zones
 */
export const getZones = asyncHandler(async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50,
      search,
      restaurantId,
      isActive,
      platform
    } = req.query;

    // Build query
    const query = buildPlatformQuery(platform);

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { zoneName: { $regex: search, $options: 'i' } },
        { serviceLocation: { $regex: search, $options: 'i' } },
        { country: { $regex: search, $options: 'i' } }
      ];
    }

    if (restaurantId) {
      query.restaurantId = new mongoose.Types.ObjectId(restaurantId);
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch zones with restaurant details (if restaurantId exists)
    const zones = await Zone.find(query)
      .populate({
        path: 'restaurantId',
        select: 'name email phone',
        match: { _id: { $exists: true } }
      })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // Get total count
    const total = await Zone.countDocuments(query);

    return successResponse(res, 200, 'Zones retrieved successfully', {
      zones,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching zones:', error);
    return errorResponse(res, 500, 'Failed to fetch zones');
  }
});

/**
 * Get zone by ID
 * GET /api/admin/zones/:id
 */
export const getZoneById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { platform } = req.query;

    const zone = await Zone.findOne({
      _id: id,
      ...buildPlatformQuery(platform)
    })
      .populate({
        path: 'restaurantId',
        select: 'name email phone',
        match: { _id: { $exists: true } }
      })
      .populate('createdBy', 'name email')
      .lean();

    if (!zone) {
      return errorResponse(res, 404, 'Zone not found');
    }

    return successResponse(res, 200, 'Zone retrieved successfully', {
      zone
    });
  } catch (error) {
    console.error('Error fetching zone:', error);
    return errorResponse(res, 500, 'Failed to fetch zone');
  }
});

/**
 * Create new zone
 * POST /api/admin/zones
 */
export const createZone = asyncHandler(async (req, res) => {
  try {
    const {
      name,
      zoneName,
      country,
      serviceLocation,
      restaurantId,
      unit,
      coordinates,
      layers,
      peakZoneRideCount,
      peakZoneRadius,
      peakZoneSelectionDuration,
      peakZoneDuration,
      peakZoneSurgePercentage,
      isActive,
      platform
    } = req.body;

    // Validation - For customer zones, country and zoneName are required instead of restaurantId
    if (!name && !zoneName) {
      return errorResponse(res, 400, 'Zone name is required');
    }
    if (!country) {
      return errorResponse(res, 400, 'Country is required');
    }
    if (!coordinates) {
      return errorResponse(res, 400, 'Coordinates are required');
    }

    if (!Array.isArray(coordinates) || coordinates.length < 3) {
      return errorResponse(res, 400, 'Zone must have at least 3 coordinates');
    }

    // Validate coordinates (accept lat/lng or latitude/longitude; 0 is valid)
    for (const coord of coordinates) {
      const lat = coord.latitude ?? coord.lat;
      const lng = coord.longitude ?? coord.lng;
      if (lat === undefined || lat === null || lng === undefined || lng === null) {
        return errorResponse(res, 400, 'Each coordinate must have latitude and longitude');
      }
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
        return errorResponse(res, 400, 'Each coordinate must have valid numeric latitude and longitude');
      }
      if (latNum < -90 || latNum > 90) {
        return errorResponse(res, 400, 'Invalid latitude value');
      }
      if (lngNum < -180 || lngNum > 180) {
        return errorResponse(res, 400, 'Invalid longitude value');
      }
    }

    // Validate layers if provided (inner, outer, outermost with deliveryCharge)
    let normalizedLayers = null;
    if (layers != null && Array.isArray(layers) && layers.length > 0) {
      const validated = validateLayers(layers);
      if (validated && validated.error) {
        return errorResponse(res, 400, validated.error);
      }
      normalizedLayers = validated;
    }

    // Normalize coordinates to { latitude, longitude } for Zone schema
    const normalizedCoordinates = coordinates.map((c) => ({
      latitude: Number(c.latitude ?? c.lat),
      longitude: Number(c.longitude ?? c.lng)
    }));

    // Check if restaurant exists (only if restaurantId is provided)
    if (restaurantId) {
      const Restaurant = mongoose.model('Restaurant');
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        return errorResponse(res, 404, 'Restaurant not found');
      }
    }

    // Create zone
    const zoneData = {
      name: name || zoneName,
      zoneName: zoneName || name,
      country: country || 'India',
      serviceLocation: serviceLocation || country,
      restaurantId: restaurantId ? new mongoose.Types.ObjectId(restaurantId) : null,
      unit: unit || 'kilometer',
      coordinates: normalizedCoordinates,
      ...(normalizedLayers && normalizedLayers.length > 0 && { layers: normalizedLayers }),
      peakZoneRideCount: peakZoneRideCount || 0,
      peakZoneRadius: peakZoneRadius || 0,
      peakZoneSelectionDuration: peakZoneSelectionDuration || 0,
      peakZoneDuration: peakZoneDuration || 0,
      peakZoneSurgePercentage: peakZoneSurgePercentage || 0,
      isActive: isActive !== undefined ? isActive : true,
      platform: normalizePlatform(platform),
      createdBy: req.admin?._id || null
    };

    const zone = new Zone(zoneData);
    await zone.save();

    // Populate before returning (only if restaurantId exists)
    if (zone.restaurantId) {
      await zone.populate('restaurantId', 'name email phone');
    }
    if (zone.createdBy) {
      await zone.populate('createdBy', 'name email');
    }

    return successResponse(res, 201, 'Zone created successfully', {
      zone
    });
  } catch (error) {
    console.error('Error creating zone:', error);
    if (error.name === 'ValidationError') {
      return errorResponse(res, 400, error.message);
    }
    return errorResponse(res, 500, 'Failed to create zone');
  }
});

/**
 * Update zone
 * PUT /api/admin/zones/:id
 */
export const updateZone = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const queryPlatform = req.query.platform || updateData.platform;

    const zone = await Zone.findOne({
      _id: id,
      ...buildPlatformQuery(queryPlatform)
    });
    if (!zone) {
      return errorResponse(res, 404, 'Zone not found');
    }

    // If coordinates are being updated, validate them
    if (updateData.coordinates) {
      if (!Array.isArray(updateData.coordinates) || updateData.coordinates.length < 3) {
        return errorResponse(res, 400, 'Zone must have at least 3 coordinates');
      }

      // Validate coordinates
      for (const coord of updateData.coordinates) {
        if (!coord.latitude || !coord.longitude) {
          return errorResponse(res, 400, 'Each coordinate must have latitude and longitude');
        }
      }
    }

    // If layers are being updated, validate them
    if (updateData.layers !== undefined) {
      if (updateData.layers == null || (Array.isArray(updateData.layers) && updateData.layers.length === 0)) {
        updateData.layers = undefined; // Clear layers
      } else {
        const validated = validateLayers(updateData.layers);
        if (validated && validated.error) {
          return errorResponse(res, 400, validated.error);
        }
        updateData.layers = validated;
      }
    }

    if (updateData.platform !== undefined) {
      updateData.platform = normalizePlatform(updateData.platform);
    }

    // Update zone
    Object.assign(zone, updateData);
    await zone.save();

    // Populate before returning (only if restaurantId exists)
    if (zone.restaurantId) {
      await zone.populate('restaurantId', 'name email phone');
    }
    if (zone.createdBy) {
      await zone.populate('createdBy', 'name email');
    }

    return successResponse(res, 200, 'Zone updated successfully', {
      zone
    });
  } catch (error) {
    console.error('Error updating zone:', error);
    if (error.name === 'ValidationError') {
      return errorResponse(res, 400, error.message);
    }
    return errorResponse(res, 500, 'Failed to update zone');
  }
});

/**
 * Delete zone
 * DELETE /api/admin/zones/:id
 */
export const deleteZone = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { platform } = req.query;

    const zone = await Zone.findOneAndDelete({
      _id: id,
      ...buildPlatformQuery(platform)
    });
    if (!zone) {
      return errorResponse(res, 404, 'Zone not found');
    }

    return successResponse(res, 200, 'Zone deleted successfully');
  } catch (error) {
    console.error('Error deleting zone:', error);
    return errorResponse(res, 500, 'Failed to delete zone');
  }
});

/**
 * Toggle zone status
 * PATCH /api/admin/zones/:id/status
 */
export const toggleZoneStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { platform } = req.query;

    const zone = await Zone.findOne({
      _id: id,
      ...buildPlatformQuery(platform)
    });
    if (!zone) {
      return errorResponse(res, 404, 'Zone not found');
    }

    zone.isActive = !zone.isActive;
    await zone.save();

    return successResponse(res, 200, `Zone ${zone.isActive ? 'activated' : 'deactivated'} successfully`, {
      zone
    });
  } catch (error) {
    console.error('Error toggling zone status:', error);
    return errorResponse(res, 500, 'Failed to toggle zone status');
  }
});

/**
 * Get zones by restaurant ID
 * GET /api/admin/zones/restaurant/:restaurantId
 */
export const getZonesByRestaurant = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { platform } = req.query;

    const zones = await Zone.find({
      restaurantId: new mongoose.Types.ObjectId(restaurantId),
      isActive: true,
      ...buildPlatformQuery(platform)
    })
      .populate({
        path: 'restaurantId',
        select: 'name email phone',
        match: { _id: { $exists: true } }
      })
      .sort({ createdAt: -1 })
      .lean();

    return successResponse(res, 200, 'Zones retrieved successfully', {
      zones
    });
  } catch (error) {
    console.error('Error fetching zones by restaurant:', error);
    return errorResponse(res, 500, 'Failed to fetch zones');
  }
});

/**
 * Detect user's zone based on location (PUBLIC API for user module)
 * GET /api/zones/detect?lat=&lng=
 */
export const detectUserZone = asyncHandler(async (req, res) => {
  try {
    const { lat, lng, latitude, longitude, platform } = req.query;
    
    // Support both lat/lng and latitude/longitude
    const userLat = parseFloat(lat || latitude);
    const userLng = parseFloat(lng || longitude);

    if (!userLat || !userLng || isNaN(userLat) || isNaN(userLng)) {
      return errorResponse(res, 400, 'Latitude and longitude are required');
    }

    if (userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
      return errorResponse(res, 400, 'Invalid coordinates');
    }

    // Get all active zones
    const activeZones = await Zone.find({
      isActive: true,
      ...buildPlatformQuery(platform)
    }).lean();

    if (activeZones.length === 0) {
      return successResponse(res, 200, 'No active zones found', {
        status: 'OUT_OF_SERVICE',
        zoneId: null,
        zone: null,
        message: 'No delivery zones are currently active'
      });
    }

    // Check which zone the user belongs to
    let userZone = null;
    let minDistance = Infinity;

    for (const zone of activeZones) {
      if (!zone.coordinates || zone.coordinates.length < 3) continue;

      let isInZone = false;
      if (typeof zone.containsPoint === 'function') {
        isInZone = zone.containsPoint(userLat, userLng);
      } else {
        // Ray casting algorithm
        let inside = false;
        for (let i = 0, j = zone.coordinates.length - 1; i < zone.coordinates.length; j = i++) {
          const coordI = zone.coordinates[i];
          const coordJ = zone.coordinates[j];
          const xi = typeof coordI === 'object' ? (coordI.latitude || coordI.lat) : null;
          const yi = typeof coordI === 'object' ? (coordI.longitude || coordI.lng) : null;
          const xj = typeof coordJ === 'object' ? (coordJ.latitude || coordJ.lat) : null;
          const yj = typeof coordJ === 'object' ? (coordJ.longitude || coordJ.lng) : null;
          
          if (xi === null || yi === null || xj === null || yj === null) continue;
          
          const intersect = ((yi > userLng) !== (yj > userLng)) && 
                           (userLat < (xj - xi) * (userLng - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        isInZone = inside;
      }

      if (isInZone) {
        // Calculate distance to zone centroid for buffer logic
        const centroid = calculateZoneCentroid(zone.coordinates);
        const distance = calculateDistance(userLat, userLng, centroid.lat, centroid.lng);
        
        if (distance < minDistance) {
          minDistance = distance;
          userZone = zone;
        }
      }
    }

    // If user is not in any zone, check buffer area (50-100 meters)
    if (!userZone) {
      const BUFFER_DISTANCE = 0.1; // 100 meters in km
      
      for (const zone of activeZones) {
        if (!zone.coordinates || zone.coordinates.length < 3) continue;
        
        const centroid = calculateZoneCentroid(zone.coordinates);
        const distance = calculateDistance(userLat, userLng, centroid.lat, centroid.lng);
        
        // Find nearest zone within buffer
        if (distance <= BUFFER_DISTANCE && distance < minDistance) {
          minDistance = distance;
          userZone = zone;
        }
      }
    }

    if (!userZone) {
      return successResponse(res, 200, 'User location is outside all service zones', {
        status: 'OUT_OF_SERVICE',
        zoneId: null,
        zone: null,
        message: 'Your location is not within any active delivery zone. Please check if delivery is available in your area.'
      });
    }

    return successResponse(res, 200, 'Zone detected successfully', {
      status: 'IN_SERVICE',
      zoneId: userZone._id.toString(),
      zone: {
        _id: userZone._id.toString(),
        name: userZone.name || userZone.zoneName,
        zoneName: userZone.zoneName || userZone.name,
        country: userZone.country,
        unit: userZone.unit
      },
      message: 'Service available in your area'
    });
  } catch (error) {
    console.error('Error detecting user zone:', error);
    return errorResponse(res, 500, 'Failed to detect zone');
  }
});

/**
 * Calculate zone centroid (average of all coordinates)
 */
function calculateZoneCentroid(coordinates) {
  let sumLat = 0;
  let sumLng = 0;
  let count = 0;

  for (const coord of coordinates) {
    const lat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null;
    const lng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null;
    if (lat !== null && lng !== null) {
      sumLat += lat;
      sumLng += lng;
      count++;
    }
  }

  return {
    lat: count > 0 ? sumLat / count : 0,
    lng: count > 0 ? sumLng / count : 0
  };
}

/**
 * Calculate distance between two points (Haversine formula)
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if a location is within any zone for a restaurant
 * POST /api/admin/zones/check-location
 */
export const checkLocationInZone = asyncHandler(async (req, res) => {
  try {
    const { latitude, longitude, restaurantId, platform } = req.body;

    if (!latitude || !longitude || !restaurantId) {
      return errorResponse(res, 400, 'Latitude, longitude, and restaurant ID are required');
    }

    // Find zones for the restaurant
    const zones = await Zone.find({
      restaurantId: new mongoose.Types.ObjectId(restaurantId),
      isActive: true,
      ...buildPlatformQuery(platform)
    });

    // Check if point is within any zone using GeoJSON
    const point = {
      type: 'Point',
      coordinates: [parseFloat(longitude), parseFloat(latitude)]
    };

    const matchingZones = zones.filter(zone => {
      if (!zone.boundary || !zone.boundary.coordinates) {
        return false;
      }
      // Use MongoDB's $geoWithin for accurate spatial query
      // For now, use the method we defined
      return zone.containsPoint(parseFloat(latitude), parseFloat(longitude));
    });

    return successResponse(res, 200, 'Location check completed', {
      isInZone: matchingZones.length > 0,
      zones: matchingZones.map(zone => ({
        _id: zone._id,
        name: zone.name || zone.zoneName,
        zoneName: zone.zoneName || zone.name,
        country: zone.country,
        serviceLocation: zone.serviceLocation
      }))
    });
  } catch (error) {
    console.error('Error checking location in zone:', error);
    return errorResponse(res, 500, 'Failed to check location');
  }
});

