import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { motion, AnimatePresence } from "framer-motion";

import Lenis from "lenis";

import { toast } from "sonner";

import {
  Lightbulb,
  HelpCircle,
  Calendar,
  Clock,
  Lock,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  UtensilsCrossed,
  Wallet,
  TrendingUp,
  CheckCircle,
  Bell,
  MapPin,
  ChefHat,
  Phone,
  X,
  TargetIcon,
  Play,
  Pause,
  IndianRupee,
  Loader2,
  Camera,
  Upload,
  AlertCircle,
  Star,
} from "lucide-react";

const DELIVERY_SWIPE_CONFIRM_THRESHOLD = 0.14;
const DELIVERY_SWIPE_START_THRESHOLD_PX = 1;
const DELIVERY_SWIPE_MIN_TRAVEL_PX = 52;
const DELIVERY_ACCEPT_SWIPE_CONFIRM_THRESHOLD = 0.55;
const DELIVERY_ACCEPT_SWIPE_START_THRESHOLD_PX = 12;
const DELIVERY_ACCEPT_MIN_TRAVEL_PX = 72;
const FETCH_ASSIGNED_ORDERS_MIN_INTERVAL_MS = 15000;
const ACTIVE_EARNING_ADDON_MIN_INTERVAL_MS = 20000;
const DELIVERY_LOCATION_SEND_INTERVAL_ACTIVE_MS = 4000;
const DELIVERY_LOCATION_SEND_INTERVAL_IDLE_MS = 20000;
const DELIVERY_LOCATION_FALLBACK_INTERVAL_ACTIVE_MS = 12000;
const DELIVERY_LOCATION_FALLBACK_INTERVAL_IDLE_MS = 60000;
const DELIVERY_LOCATION_DISTANCE_THRESHOLD_ACTIVE_KM = 0.01;
const DELIVERY_LOCATION_DISTANCE_THRESHOLD_IDLE_KM = 0.03;
const ROUTE_SIMULATION_TEST_PHONE = "7223077890";
const DELIVERY_ALERT_AUDIO_CACHE_VERSION = "delivery-audio-v1";
const DELIVERY_ACCEPTED_ADVANCE_ORDERS_KEY = "deliveryAcceptedAdvanceOrders";
const BILL_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const BILL_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif";
const BILL_IMAGE_EXTENSION_MIME_MAP = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

import BottomPopup from "../components/BottomPopup";
import DeliveryHomeNewOrderPopup from "../components/DeliveryHomeNewOrderPopup";
import DeliveryHomeRejectPopup from "../components/DeliveryHomeRejectPopup";
import DeliveryHomeReachedPickupPopup from "../components/DeliveryHomeReachedPickupPopup";

import FeedNavbar from "../components/FeedNavbar";

import { Card, CardContent } from "@/components/ui/card";

import { Button } from "@/components/ui/button";

import { useGigStore } from "../store/gigStore";

import { useProgressStore } from "../store/progressStore";

import { formatTimeDisplay, calculateTotalHours } from "../utils/gigUtils";

import {
  fetchDeliveryWallet,
  calculatePeriodEarnings,
} from "../utils/deliveryWalletState";

import { formatCurrency } from "../../restaurant/utils/currency";

import { getAllDeliveryOrders } from "../utils/deliveryOrderStatus";

import { getUnreadDeliveryNotificationCount } from "../utils/deliveryNotifications";

import {
  deliveryAPI,
  restaurantAPI,
  groceryStoreAPI,
  uploadAPI,
} from "@/lib/api";

import { useDeliveryNotifications } from "../hooks/useDeliveryNotifications";

import { useCompanyName } from "@/lib/hooks/useCompanyName";

import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey";

import {
  decodePolyline,
  extractPolylineFromDirections,
  findNearestPointOnPolyline,
  trimPolylineBehindRider,
  calculateBearing,
  animateMarker,
  calculateDistance,
} from "../utils/liveTrackingPolyline";

import referralBonusBg from "../../../assets/referralbonuscardbg.png";

// import dropLocationBanner from "../../../assets/droplocationbanner.png" // File not found - commented out

import alertSound from "../../../assets/audio/alert.mp3";

import originalSound from "../../../assets/audio/original.mp3";

import bikeLogo from "../../../assets/bikelogo.png";

// Ola Maps API Key removed

// Mock restaurants data

const mockRestaurants = [
  {
    id: 1,

    name: "Hotel Pankaj",

    address: "Opposite Midway, Behror Locality, Behror",

    lat: 28.2849,

    lng: 76.1209,

    distance: "3.56 km",

    timeAway: "4 mins",

    orders: 2,

    estimatedEarnings: 76.62, // Consistent payment amount

    pickupDistance: "3.56 km",

    dropDistance: "12.2 km",

    payment: "COD",

    amount: 76.62, // Payment amount (consistent with estimatedEarnings)

    items: 2,

    phone: "+911234567890",

    orderId: "ORD1234567890",

    customerName: "Rajesh Kumar",

    customerAddress:
      "401, 4th Floor, Pushparatna Solitare Building, Janjeerwala Square, New Palasia, Indore",

    customerPhone: "+919876543210",

    tripTime: "38 mins",

    tripDistance: "8.8 kms",
  },

  {
    id: 2,

    name: "Haldi",

    address: "B 2, Narnor-Alwar Rd, Indus Valley, Behror",

    lat: 28.278,

    lng: 76.115,

    distance: "4.2 km",

    timeAway: "4 mins",

    orders: 1,

    estimatedEarnings: 76.62,

    pickupDistance: "4.2 km",

    dropDistance: "8.5 km",

    payment: "COD",

    amount: 76.62,

    items: 3,

    phone: "+911234567891",

    orderId: "ORD1234567891",

    customerName: "Priya Sharma",

    customerAddress: "Flat 302, Green Valley Apartments, MG Road, Indore",

    customerPhone: "+919876543211",

    tripTime: "35 mins",

    tripDistance: "7.5 kms",
  },

  {
    id: 3,

    name: "Pandit Ji Samose Wale",

    address: "Near Govt. Senior Secondary School, Behror Locality, Behror",

    lat: 28.287,

    lng: 76.125,

    distance: "5.04 km",

    timeAway: "6 mins",

    orders: 1,

    estimatedEarnings: 76.62,

    pickupDistance: "5.04 km",

    dropDistance: "7.8 km",

    payment: "COD",

    amount: 76.62,

    items: 1,

    phone: "+911234567892",

    orderId: "ORD1234567892",

    customerName: "Amit Patel",

    customerAddress: "House No. 45, Sector 5, Vijay Nagar, Indore",

    customerPhone: "+919876543212",

    tripTime: "32 mins",

    tripDistance: "6.9 kms",
  },
];

// ============================================

// STABLE TRACKING SYSTEM - RAPIDO/UBER STYLE

// ============================================

/**


 * Calculate distance between two coordinates using Haversine formula


 * @param {number} lat1 


 * @param {number} lng1 


 * @param {number} lat2 


 * @param {number} lng2 


 * @returns {number} Distance in meters


 */

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters

  const dLat = ((lat2 - lat1) * Math.PI) / 180;

  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

const MAX_REASONABLE_BOUNDS_DIAGONAL_METERS = 60000; // 60 km

const MAX_REASONABLE_MARKER_JUMP_METERS = 2500; // 2.5 km

function isBoundsReasonable(bounds) {
  try {
    if (
      !bounds ||
      typeof bounds.getNorthEast !== "function" ||
      typeof bounds.getSouthWest !== "function"
    ) {
      return false;
    }

    const ne = bounds.getNorthEast();

    const sw = bounds.getSouthWest();

    if (!ne || !sw) return false;

    const diagonal = haversineDistance(ne.lat(), ne.lng(), sw.lat(), sw.lng());

    if (!Number.isFinite(diagonal) || diagonal <= 0) return false;

    return diagonal <= MAX_REASONABLE_BOUNDS_DIAGONAL_METERS;
  } catch {
    return false;
  }
}

/**


 * Filter GPS location based on accuracy, distance jump, and speed


 * @param {Object} position - GPS position object


 * @param {Array} lastValidLocation - [lat, lng] of last valid location


 * @param {number} lastLocationTime - Timestamp of last location


 * @returns {boolean} true if location should be accepted


 */

function shouldAcceptLocation(position, lastValidLocation, lastLocationTime) {
  const accuracy = position.coords.accuracy || 0;

  const latitude = position.coords.latitude;

  const longitude = position.coords.longitude;

  // CRITICAL: Always accept first location (no previous location) to ensure admin map shows delivery boy

  // Even if accuracy is poor, we need at least one location update

  const isFirstLocation = !lastValidLocation || !lastLocationTime;

  if (isFirstLocation) {
    // For first location, accept if accuracy < 1000m (very lenient)

    if (accuracy > 1000) {
      console.log("[BLOCK] First location rejected: accuracy extremely poor", {
        accuracy: accuracy.toFixed(2) + "m",
      });

      return false;
    }

    console.log("[OK] Accepting first location (will be used for admin map):", {
      accuracy: accuracy.toFixed(2) + "m",

      lat: latitude,

      lng: longitude,
    });

    return true;
  }

  // Filter 1: For subsequent locations, use relaxed accuracy threshold (200m instead of 30m)

  // This allows GPS to work even in areas with poor signal

  if (accuracy > 200) {
    console.log("[BLOCK] Location rejected: accuracy too poor", {
      accuracy: accuracy.toFixed(2) + "m",
    });

    return false;
  }

  // Filter 2: Check distance jump and speed if we have previous location

  if (lastValidLocation && lastLocationTime) {
    const [prevLat, prevLng] = lastValidLocation;

    const distance = haversineDistance(prevLat, prevLng, latitude, longitude);

    const timeDiff = (Date.now() - lastLocationTime) / 1000; // seconds

    // Filter 2a: Ignore if distance jump > 50 meters within 2 seconds

    if (distance > 50 && timeDiff < 2) {
      console.log("[BLOCK] Location rejected: distance jump too large", {
        distance: distance.toFixed(2) + "m",

        timeDiff: timeDiff.toFixed(2) + "s",
      });

      return false;
    }

    // Filter 2b: Ignore if calculated speed > 60 km/h (bike speed limit)

    if (timeDiff > 0) {
      const speedKmh = (distance / timeDiff) * 3.6; // Convert m/s to km/h

      if (speedKmh > 60) {
        console.log("[BLOCK] Location rejected: speed too high", {
          speed: speedKmh.toFixed(2) + " km/h",
        });

        return false;
      }
    }
  }

  return true;
}

/**


 * Apply moving average smoothing on location history


 * @param {Array} locationHistory - Array of [lat, lng] coordinates


 * @returns {Array|null} Smoothed [lat, lng] or null if not enough points


 */

function smoothLocation(locationHistory) {
  if (locationHistory.length < 2) {
    return locationHistory.length === 1 ? locationHistory[0] : null;
  }

  // Use last 3 points for moving average (lower lag on turns)

  const pointsToUse = locationHistory.slice(-3);

  // Calculate average latitude and longitude

  const avgLat =
    pointsToUse.reduce((sum, point) => sum + point[0], 0) / pointsToUse.length;

  const avgLng =
    pointsToUse.reduce((sum, point) => sum + point[1], 0) / pointsToUse.length;

  return [avgLat, avgLng];
}

function resolveDisplayLocation(
  rawLocation,
  smoothedLocation,
  accuracyMeters = 999,
) {
  if (!Array.isArray(rawLocation) || rawLocation.length !== 2)
    return smoothedLocation;
  if (!Array.isArray(smoothedLocation) || smoothedLocation.length !== 2)
    return rawLocation;

  const rawLat = Number(rawLocation[0]);
  const rawLng = Number(rawLocation[1]);
  const smoothLat = Number(smoothedLocation[0]);
  const smoothLng = Number(smoothedLocation[1]);
  const accuracy = Number(accuracyMeters);

  if (![rawLat, rawLng, smoothLat, smoothLng].every(Number.isFinite)) {
    return smoothedLocation;
  }

  // Strong GPS: keep marker on raw point for true live feel.
  if (Number.isFinite(accuracy) && accuracy <= 20) {
    return [rawLat, rawLng];
  }

  // If smoothing drifts away, bias towards raw to avoid visible offset.
  const driftMeters = haversineDistance(rawLat, rawLng, smoothLat, smoothLng);
  if (driftMeters > 20) {
    const rawWeight = Number.isFinite(accuracy) && accuracy <= 50 ? 0.75 : 0.6;
    return [
      smoothLat * (1 - rawWeight) + rawLat * rawWeight,
      smoothLng * (1 - rawWeight) + rawLng * rawWeight,
    ];
  }

  return smoothedLocation;
}
function isPointInsideZoneBoundary(lat, lng, zoneCoordinates = []) {
  if (!Array.isArray(zoneCoordinates) || zoneCoordinates.length < 3)
    return false;

  let inside = false;

  for (
    let i = 0, j = zoneCoordinates.length - 1;
    i < zoneCoordinates.length;
    j = i++
  ) {
    const xi = Number(zoneCoordinates[i]?.longitude ?? zoneCoordinates[i]?.lng);

    const yi = Number(zoneCoordinates[i]?.latitude ?? zoneCoordinates[i]?.lat);

    const xj = Number(zoneCoordinates[j]?.longitude ?? zoneCoordinates[j]?.lng);

    const yj = Number(zoneCoordinates[j]?.latitude ?? zoneCoordinates[j]?.lat);

    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

function extractCustomerCoordsFromOrder(order) {
  if (!order || typeof order !== "object") return null;

  const toFinite = (value) => {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  };

  const fromGeoJson = (coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

    const lng = toFinite(coordinates[0]);

    const lat = toFinite(coordinates[1]);

    if (lat == null || lng == null) return null;

    return { lat, lng };
  };

  const fromLatLng = (obj) => {
    if (!obj || typeof obj !== "object") return null;

    const lat = toFinite(obj.lat ?? obj.latitude);

    const lng = toFinite(obj.lng ?? obj.longitude);

    if (lat == null || lng == null) return null;

    return { lat, lng };
  };

  return (
    fromGeoJson(order?.address?.location?.coordinates) ||
    fromGeoJson(order?.address?.coordinates) ||
    fromLatLng(order?.address) ||
    fromLatLng(order?.address?.location) ||
    fromLatLng(order?.customerLocation) ||
    null
  );
}

function buildAddressFromLocation(location) {
  if (!location || typeof location !== "object") return "";

  const parts = [
    location?.addressLine1 || location?.street,

    location?.addressLine2,

    location?.area,

    location?.city,

    location?.state,

    location?.pincode || location?.zipCode || location?.postalCode,
  ]

    .map((part) => (typeof part === "string" ? part.trim() : ""))

    .filter(Boolean);

  return parts.join(", ");
}

function resolveStoreAddressFromOrder(order, fallback = "Restaurant address") {
  const store =
    order?.restaurantId && typeof order?.restaurantId === "object"
      ? order.restaurantId
      : null;

  const storeLocation = store?.location || {};

  const altStore =
    order?.restaurant && typeof order?.restaurant === "object"
      ? order.restaurant
      : null;

  const altStoreLocation = altStore?.location || {};

  const orderRestaurantLocation = order?.restaurantLocation || {};
  const fullOrder =
    order?.fullOrder && typeof order?.fullOrder === "object"
      ? order.fullOrder
      : null;
  const fullOrderStore =
    fullOrder?.restaurantId && typeof fullOrder?.restaurantId === "object"
      ? fullOrder.restaurantId
      : null;
  const fullOrderStoreLocation = fullOrderStore?.location || {};

  const directCandidates = [
    storeLocation?.formattedAddress,

    storeLocation?.address,

    buildAddressFromLocation(storeLocation),

    store?.address,

    altStoreLocation?.formattedAddress,

    altStoreLocation?.address,

    buildAddressFromLocation(altStoreLocation),

    altStore?.address,

    orderRestaurantLocation?.formattedAddress,

    orderRestaurantLocation?.address,

    buildAddressFromLocation(orderRestaurantLocation),

    order?.restaurantAddress,
    fullOrderStoreLocation?.formattedAddress,
    fullOrderStoreLocation?.address,
    buildAddressFromLocation(fullOrderStoreLocation),
    fullOrderStore?.address,
    fullOrder?.restaurantAddress,
    fullOrder?.restaurantLocation?.formattedAddress,
    fullOrder?.restaurantLocation?.address,
    buildAddressFromLocation(fullOrder?.restaurantLocation || {}),
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
}

function resolveStoreCoordsFromOrder(order) {
  const store =
    order?.restaurantId && typeof order?.restaurantId === "object"
      ? order.restaurantId
      : null;

  const storeLocation = store?.location || {};

  const orderRestaurantLocation = order?.restaurantLocation || {};
  const fullOrder =
    order?.fullOrder && typeof order?.fullOrder === "object"
      ? order.fullOrder
      : null;
  const fullOrderStore =
    fullOrder?.restaurantId && typeof fullOrder?.restaurantId === "object"
      ? fullOrder.restaurantId
      : null;
  const fullOrderStoreLocation = fullOrderStore?.location || {};

  if (
    Array.isArray(storeLocation?.coordinates) &&
    storeLocation.coordinates.length >= 2
  ) {
    const lat = Number(storeLocation.coordinates[1]);

    const lng = Number(storeLocation.coordinates[0]);

    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  if (
    Number.isFinite(Number(storeLocation?.latitude)) &&
    Number.isFinite(Number(storeLocation?.longitude))
  ) {
    return {
      lat: Number(storeLocation.latitude),
      lng: Number(storeLocation.longitude),
    };
  }

  if (
    Array.isArray(orderRestaurantLocation?.coordinates) &&
    orderRestaurantLocation.coordinates.length >= 2
  ) {
    const lat = Number(orderRestaurantLocation.coordinates[1]);

    const lng = Number(orderRestaurantLocation.coordinates[0]);

    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  if (
    Number.isFinite(Number(orderRestaurantLocation?.latitude)) &&
    Number.isFinite(Number(orderRestaurantLocation?.longitude))
  ) {
    return {
      lat: Number(orderRestaurantLocation.latitude),

      lng: Number(orderRestaurantLocation.longitude),
    };
  }

  if (
    Array.isArray(fullOrderStoreLocation?.coordinates) &&
    fullOrderStoreLocation.coordinates.length >= 2
  ) {
    const lat = Number(fullOrderStoreLocation.coordinates[1]);

    const lng = Number(fullOrderStoreLocation.coordinates[0]);

    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  if (
    Number.isFinite(Number(fullOrderStoreLocation?.latitude)) &&
    Number.isFinite(Number(fullOrderStoreLocation?.longitude))
  ) {
    return {
      lat: Number(fullOrderStoreLocation.latitude),

      lng: Number(fullOrderStoreLocation.longitude),
    };
  }

  return null;
}

async function fetchStoreById(storeId) {
  if (!storeId) return null;
  const normalizedStoreId =
    typeof storeId === "string"
      ? storeId
      : storeId._id || storeId.id || storeId.toString?.() || "";
  if (!normalizedStoreId) return null;
  const extractEntity = (response) => {
    const data = response?.data;
    if (!data) return null;
    const payload = data.data ?? data;
    if (!payload) return null;
    return (
      payload.restaurant || payload.store || payload.groceryStore || payload
    );
  };
  try {
    const response = await restaurantAPI.getRestaurantById(normalizedStoreId);
    const store = extractEntity(response);
    if (store) return { store, source: "restaurant" };
  } catch {
    // Ignore and fall through to grocery lookup.
  }
  try {
    const response =
      await groceryStoreAPI.getGroceryStoreById(normalizedStoreId);
    const store = extractEntity(response);
    if (store) return { store, source: "grocery" };
  } catch {
    // Ignore; caller handles null.
  }
  return null;
}
/**
 * Animate marker smoothly from current position to new position


 * @param {Object} marker - Google Maps Marker instance


 * @param {Object} newPosition - {lat, lng} new position


 * @param {number} duration - Animation duration in milliseconds (default 1500ms)


 * @param {React.RefObject} animationRef - Ref to store animation frame ID (from component)


 */

function animateMarkerSmoothly(
  marker,
  newPosition,
  duration = 1500,
  animationRef,
) {
  if (!marker || !newPosition) return;

  const currentPosition = marker.getPosition();

  if (!currentPosition) {
    // If no current position, set directly

    marker.setPosition(newPosition);

    return;
  }

  const startLat = currentPosition.lat();

  const startLng = currentPosition.lng();

  const endLat = newPosition.lat;

  const endLng = newPosition.lng;

  // Cancel any ongoing animation (use ref if passed)

  if (animationRef?.current) {
    cancelAnimationFrame(animationRef.current);
  }

  const startTime = Date.now();

  const startPos = { lat: startLat, lng: startLng };

  const endPos = { lat: endLat, lng: endLng };

  function animate() {
    const elapsed = Date.now() - startTime;

    const progress = Math.min(elapsed / duration, 1);

    // Linear easing

    const currentLat = startPos.lat + (endPos.lat - startPos.lat) * progress;

    const currentLng = startPos.lng + (endPos.lng - startPos.lng) * progress;

    marker.setPosition({ lat: currentLat, lng: currentLng });

    if (progress < 1) {
      if (animationRef) animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef) animationRef.current = null;
    }
  }

  if (animationRef) animationRef.current = requestAnimationFrame(animate);
}

export default function DeliveryHome() {
  const companyName = useCompanyName();

  const navigate = useNavigate();

  const location = useLocation();

  const [animationKey, setAnimationKey] = useState(0);

  // Helper function to safely call preventDefault (handles passive event listeners)

  // React's synthetic touch events are passive by default, so we check cancelable first

  const safePreventDefault = (e) => {
    if (!e) return;

    // Early return if event is not cancelable (passive listener)

    // This prevents the browser warning about calling preventDefault on passive listeners

    if (e.cancelable === false) {
      return; // Event listener is passive, cannot and should not call preventDefault
    }

    // For touch events, check if CSS touch-action is handling it

    // If touch-action is set, we don't need preventDefault

    const eventType = e.type || "";

    if (eventType.includes("touch")) {
      const target = e.target || e.currentTarget;

      if (target) {
        try {
          const computedStyle = window.getComputedStyle(target);

          const touchAction = computedStyle.touchAction;

          // If touch-action is set (not 'auto'), CSS is handling it, skip preventDefault

          if (touchAction && touchAction !== "auto" && touchAction !== "") {
            return; // CSS touch-action is handling scrolling prevention
          }
        } catch (styleError) {
          // If getComputedStyle fails, continue with preventDefault check
        }
      }
    }

    // For React synthetic events, check the native event's cancelable property

    // React synthetic events may have cancelable: true but the underlying listener is passive

    const nativeEvent = e.nativeEvent;

    if (nativeEvent) {
      // Check native event's cancelable property - this is the most reliable check

      if (nativeEvent.cancelable === false) {
        return; // Native event listener is passive
      }

      // Additional check: if defaultPrevented is already true, no need to call again

      if (nativeEvent.defaultPrevented === true) {
        return;
      }
    }

    // Only call preventDefault if event is cancelable AND we have a function

    // Wrap in try-catch to completely suppress passive listener errors

    if (e.cancelable !== false && typeof e.preventDefault === "function") {
      try {
        // Final check: ensure native event is still cancelable

        if (nativeEvent && nativeEvent.cancelable === false) {
          return;
        }

        // Suppress console errors temporarily while calling preventDefault

        const originalError = console.error;

        console.error = () => {}; // Temporarily suppress console.error

        try {
          e.preventDefault();
        } finally {
          console.error = originalError; // Restore console.error
        }
      } catch (err) {
        // Silently ignore - this shouldn't happen if cancelable is true

        // But some browsers may still throw if the listener is passive

        // Don't log the error to avoid console spam

        return;
      }
    }
  };

  const LOCATION_CACHE_TTL_MS = 10 * 60 * 1000;

  const saveCachedDeliveryLocation = (coords) => {
    if (!Array.isArray(coords) || coords.length !== 2) return;

    const lat = Number(coords[0]);

    const lng = Number(coords[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    try {
      localStorage.setItem(
        "deliveryBoyLastLocation",
        JSON.stringify([lat, lng]),
      );

      localStorage.setItem("deliveryBoyLastLocationTs", String(Date.now()));
    } catch {}
  };

  const readCachedDeliveryLocation = ({ allowStale = false } = {}) => {
    try {
      const raw = localStorage.getItem("deliveryBoyLastLocation");

      if (!raw) return null;

      const tsRaw = localStorage.getItem("deliveryBoyLastLocationTs");

      const ts = Number(tsRaw);

      const isFresh =
        Number.isFinite(ts) && Date.now() - ts <= LOCATION_CACHE_TTL_MS;

      if (!allowStale && !isFresh) return null;

      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed) || parsed.length !== 2) return null;

      let lat = Number(parsed[0]);

      let lng = Number(parsed[1]);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

      const mightBeSwapped = lat >= 68 && lat <= 98 && lng >= 8 && lng <= 38;

      if (mightBeSwapped) {
        [lat, lng] = [lng, lat];
      }

      return [lat, lng];
    } catch {
      return null;
    }
  };

  const [walletState, setWalletState] = useState({
    totalBalance: 0,

    cashInHand: 0,

    deductions: 0,

    totalCashLimit: 0,

    availableCashLimit: 0,

    totalWithdrawn: 0,

    totalEarned: 0,

    transactions: [],

    joiningBonusClaimed: false,
  });

  const [activeOrder, setActiveOrder] = useState(() => {
    const stored = localStorage.getItem("activeOrder");

    return stored ? JSON.parse(stored) : null;
  });

  const [unreadNotificationCount, setUnreadNotificationCount] = useState(() =>
    getUnreadDeliveryNotificationCount(),
  );
  const [deliveryStatus, setDeliveryStatus] = useState(null); // Store delivery partner status

  // Delivery notifications hook

  const deliveryStatusNormalized = String(deliveryStatus || "")
    .trim()
    .toLowerCase();
  const isVerificationPendingLikeStatus = [
    "pending",
    "submitted",
    "verification_pending",
    "under_verification",
    "in_review",
    "under_review",
    "rejected",
    "declined",
    "blocked",
  ].includes(deliveryStatusNormalized);
  const isDeliveryNotificationsEnabled =
    Boolean(deliveryStatusNormalized) && !isVerificationPendingLikeStatus;

  const {
    newOrder,
    pendingNewOrders,
    pendingNewOrdersCount,
    prioritizeNewOrderNotification,
    clearNewOrder,
    orderReady,
    clearOrderReady,
    isConnected,
    suppressOrderNotifications,
  } = useDeliveryNotifications({
    enabled: isDeliveryNotificationsEnabled,
    enableSound: false,
    enableBrowserNotification: false,
  });

  // Default location - will be set from saved location or GPS, not hardcoded

  const [riderLocation, setRiderLocation] = useState(null); // Will be set from GPS or saved location
  const [canUseRouteSimulation, setCanUseRouteSimulation] = useState(false);
  const [isRouteSimulationEnabled, setIsRouteSimulationEnabled] =
    useState(false);
  const [isRouteSimulationRunning, setIsRouteSimulationRunning] =
    useState(false);

  const [locationPermissionState, setLocationPermissionState] =
    useState("unknown"); // unknown | granted | prompt | denied | unsupported

  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);

  const [bankDetailsFilled, setBankDetailsFilled] = useState(true);

  const [rejectionReason, setRejectionReason] = useState(null); // Store rejection reason

  const [isReverifying, setIsReverifying] = useState(false); // Loading state for reverify

  // Map refs and state (Ola Maps removed)

  const mapContainerRef = useRef(null);

  const directionsMapContainerRef = useRef(null);

  const watchPositionIdRef = useRef(null); // Store watchPosition ID for cleanup

  const lastLocationRef = useRef(null); // Store last location for heading calculation

  const bikeMarkerRef = useRef(null); // Store bike marker instance

  const isUserPanningRef = useRef(false); // Track if user manually panned the map

  const routePolylineRef = useRef(null); // Store route polyline instance (legacy - for fallback)

  const routeHistoryRef = useRef([]); // Store route history for traveled path

  const isOnlineRef = useRef(false); // Store online status for use in callbacks

  // Stable tracking system - Rapido/Uber style

  const locationHistoryRef = useRef([]); // Store last 5 valid GPS points for smoothing

  const lastValidLocationRef = useRef(null); // Last valid smoothed location

  const lastLocationTimeRef = useRef(null); // Timestamp of last location update

  const smoothedLocationRef = useRef(null); // Current smoothed location

  const markerAnimationRef = useRef(null); // Track ongoing marker animation

  const zonesPolygonsRef = useRef([]); // Store zone polygons

  // Google Maps renderer refs (route path is built locally from coordinates)

  const directionsRendererRef = useRef(null); // Directions Renderer instance

  const directionsMapInstanceRef = useRef(null); // Directions map instance

  const restaurantMarkerRef = useRef(null); // Restaurant marker on directions map

  const customerMarkerRef = useRef(null); // Customer marker on main map

  const directionsBikeMarkerRef = useRef(null); // Bike marker on directions map

  const lastRouteRecalculationRef = useRef(null); // Track last route recalculation time (API cost optimization)

  const lastBikePositionRef = useRef(null); // Track last bike position for deviation detection

  const acceptedOrderIdsRef = useRef(new Set()); // Track accepted order IDs to prevent duplicate notifications
  const acceptingOrderIdsRef = useRef(new Set()); // Prevent duplicate accept requests for the same order
  const fetchAssignedOrdersInFlightRef = useRef(false);
  const fetchAssignedOrdersLastRunRef = useRef(0);
  const activeEarningAddonInFlightRef = useRef(false);
  const activeEarningAddonLastRunRef = useRef(0);

  const normalizeOrderId = useCallback((value) => {
    if (!value) return null;

    return String(value);
  }, []);

  const markOrderAsAccepted = useCallback(
    (...ids) => {
      ids

        .map((id) => normalizeOrderId(id))

        .filter(Boolean)

        .forEach((id) => acceptedOrderIdsRef.current.add(id));
    },
    [normalizeOrderId],
  );

  const markOrderAsUnavailable = useCallback(
    (...ids) => {
      const normalizedIds = ids

        .map((id) => normalizeOrderId(id))

        .filter(Boolean);

      normalizedIds.forEach((id) => acceptedOrderIdsRef.current.add(id));

      if (normalizedIds.length > 0) {
        suppressOrderNotifications(normalizedIds);
      }
    },
    [normalizeOrderId, suppressOrderNotifications],
  );

  const isOrderAlreadyAccepted = useCallback(
    (...ids) => {
      return ids

        .map((id) => normalizeOrderId(id))

        .filter(Boolean)

        .some((id) => acceptedOrderIdsRef.current.has(id));
    },
    [normalizeOrderId],
  );

  // Live tracking polyline refs

  const liveTrackingPolylineRef = useRef(null); // Google Maps Polyline instance for live tracking

  const liveTrackingPolylineShadowRef = useRef(null); // Shadow/outline polyline for better visibility (Zomato/Rapido style)

  const fullRoutePolylineRef = useRef([]); // Store full decoded polyline from Directions API

  const lastRiderPositionRef = useRef(null); // Last rider position for smooth animation

  const markerAnimationCancelRef = useRef(null); // Cancel function for marker animation

  const directionsResponseRef = useRef(null); // Store directions response for use in callbacks
  const routeSimulationTimerRef = useRef(null);
  const routeSimulationIndexRef = useRef(0);
  const lastSimulationHeadingRef = useRef(0);
  const lastMainMarkerHeadingRef = useRef(0);
  const lastDirectionsMarkerHeadingRef = useRef(0);
  const isRouteSimulationEnabledRef = useRef(false);

  const directionsRouteCacheRef = useRef(new Map()); // Cache directions responses by rounded origin/destination

  const isRestoringActiveOrderRef = useRef(false); // Prevent route cleanup races during refresh restore

  const fetchedOrderDetailsForDropRef = useRef(null); // Prevent re-fetching order details for Reached Drop customer coords

  const [zones, setZones] = useState([]); // Store nearby zones

  const [isOutOfZone, setIsOutOfZone] = useState(false);

  const [zoneCheckReady, setZoneCheckReady] = useState(false);

  const [mapLoading, setMapLoading] = useState(false);

  const [directionsMapLoading, setDirectionsMapLoading] = useState(false);

  const isInitializingMapRef = useRef(false);

  const ensureGoogleMapsConstructors = useCallback(async () => {
    if (!window.google?.maps) return false;

    if (typeof window.google.maps.Map === "function") return true;

    if (typeof window.google.maps.importLibrary === "function") {
      try {
        const mapsLib = await window.google.maps.importLibrary("maps");

        if (mapsLib?.Map && typeof window.google.maps.Map !== "function") {
          window.google.maps.Map = mapsLib.Map;
        }

        if (mapsLib?.MapTypeId && !window.google.maps.MapTypeId) {
          window.google.maps.MapTypeId = mapsLib.MapTypeId;
        }
      } catch (error) {
        console.warn(
          "[WARN] Failed to import Google Maps 'maps' library:",
          error,
        );
      }
    }

    return typeof window.google?.maps?.Map === "function";
  }, []);

  const handleLocationPermissionDenied = useCallback(() => {
    setLocationPermissionState("denied");

    toast.error(
      "Location permission is disabled. Please allow location access for live tracking.",
    );
  }, []);

  const requestLocationPermission = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationPermissionState("unsupported");

      toast.error(
        "Location services are not available in this browser/device.",
      );

      return;
    }

    setIsRefreshingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;

        const longitude = position.coords.longitude;

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setIsRefreshingLocation(false);

          toast.error("Invalid location detected. Please try again.");

          return;
        }

        const nextLocation = [latitude, longitude];

        setRiderLocation(nextLocation);

        lastLocationRef.current = nextLocation;

        lastValidLocationRef.current = nextLocation;

        smoothedLocationRef.current = nextLocation;

        saveCachedDeliveryLocation(nextLocation);

        setLocationPermissionState("granted");

        setIsRefreshingLocation(false);
      },

      (error) => {
        setIsRefreshingLocation(false);

        if (error?.code === 1) {
          handleLocationPermissionDenied();

          return;
        }

        toast.error(
          "Unable to fetch location. Please ensure GPS is enabled and try again.",
        );
      },

      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }, [handleLocationPermissionDenied]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationPermissionState("unsupported");

      return;
    }

    if (
      !navigator.permissions ||
      typeof navigator.permissions.query !== "function"
    ) {
      setLocationPermissionState("unknown");

      return;
    }

    let isMounted = true;

    let permissionStatus = null;

    navigator.permissions

      .query({ name: "geolocation" })

      .then((status) => {
        if (!isMounted) return;

        permissionStatus = status;

        setLocationPermissionState(status.state || "unknown");

        status.onchange = () => {
          setLocationPermissionState(status.state || "unknown");
        };
      })

      .catch(() => {
        if (isMounted) setLocationPermissionState("unknown");
      });

    return () => {
      isMounted = false;

      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, []);

  // Safety timeout: hide "Loading map..." overlay after max 2 seconds

  useEffect(() => {
    if (!mapLoading) return;

    const timer = setTimeout(() => {
      setMapLoading(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, [mapLoading]);

  // Seeded random number generator for consistent hotspots

  const createSeededRandom = (seed) => {
    let currentSeed = seed;

    return () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;

      return currentSeed / 233280;
    };
  };

  // Generate irregular polygon from random nearby points (using seeded random)

  const createIrregularPolygon = (center, numPoints, spread, seedOffset) => {
    const [lat, lng] = center;

    const vertices = [];

    const seededRandom = createSeededRandom(seedOffset);

    // Generate random points around the center

    for (let i = 0; i < numPoints; i++) {
      // Seeded random angle

      const angle = seededRandom() * 2 * Math.PI;

      // Seeded random distance (varying spread for irregularity)

      const distance = spread * (0.5 + seededRandom() * 0.5);

      const vertexLat = lat + distance * Math.cos(angle);

      const vertexLng = lng + distance * Math.sin(angle);

      vertices.push([vertexLat, vertexLng]);
    }

    // Sort vertices by angle to create a proper polygon (prevents self-intersection)

    const centerLat =
      vertices.reduce((sum, v) => sum + v[0], 0) / vertices.length;

    const centerLng =
      vertices.reduce((sum, v) => sum + v[1], 0) / vertices.length;

    vertices.sort((a, b) => {
      const angleA = Math.atan2(a[0] - centerLat, a[1] - centerLng);

      const angleB = Math.atan2(b[0] - centerLat, b[1] - centerLng);

      return angleA - angleB;
    });

    return vertices;
  };

  // Generate nearby hotspot locations with irregular shapes from 3-5 points

  // Using useState with lazy initializer to generate hotspots once and keep them fixed

  const [hotspots] = useState(() => {
    // Use default location if riderLocation is not available yet

    const defaultLocation = [23.2599, 77.4126]; // Bhopal center as fallback

    const [lat, lng] = riderLocation || defaultLocation;

    const hotspots = [];

    const baseSpread = 0.004; // Base spread for points in degrees

    // Hotspot 1 - Northeast, 3 points

    hotspots.push({
      type: "polygon",

      center: [lat + 0.008, lng + 0.006],

      vertices: createIrregularPolygon(
        [lat + 0.008, lng + 0.006],
        3,
        baseSpread * 1.2,
        1000,
      ),

      opacity: 0.25,
    });

    // Hotspot 2 - Northwest, 4 points

    hotspots.push({
      type: "polygon",

      center: [lat + 0.005, lng - 0.007],

      vertices: createIrregularPolygon(
        [lat + 0.005, lng - 0.007],
        4,
        baseSpread * 1.0,
        2000,
      ),

      opacity: 0.3,
    });

    // Hotspot 3 - Southeast, 5 points

    hotspots.push({
      type: "polygon",

      center: [lat - 0.006, lng + 0.009],

      vertices: createIrregularPolygon(
        [lat - 0.006, lng + 0.009],
        5,
        baseSpread * 0.9,
        3000,
      ),

      opacity: 0.2,
    });

    // Hotspot 4 - Southwest, 3 points

    hotspots.push({
      type: "polygon",

      center: [lat - 0.004, lng - 0.005],

      vertices: createIrregularPolygon(
        [lat - 0.004, lng - 0.005],
        3,
        baseSpread * 1.1,
        4000,
      ),

      opacity: 0.28,
    });

    // Hotspot 5 - North, 4 points

    hotspots.push({
      type: "polygon",

      center: [lat + 0.011, lng + 0.001],

      vertices: createIrregularPolygon(
        [lat + 0.011, lng + 0.001],
        4,
        baseSpread * 0.7,
        5000,
      ),

      opacity: 0.22,
    });

    // Hotspot 6 - East, 5 points

    hotspots.push({
      type: "polygon",

      center: [lat + 0.002, lng + 0.012],

      vertices: createIrregularPolygon(
        [lat + 0.002, lng + 0.012],
        5,
        baseSpread * 1.1,
        6000,
      ),

      opacity: 0.32,
    });

    // Hotspot 7 - South, 3 points

    hotspots.push({
      type: "polygon",

      center: [lat - 0.009, lng - 0.002],

      vertices: createIrregularPolygon(
        [lat - 0.009, lng - 0.002],
        3,
        baseSpread * 1.0,
        7000,
      ),

      opacity: 0.26,
    });

    // Hotspot 8 - West, 4 points

    hotspots.push({
      type: "polygon",

      center: [lat - 0.001, lng - 0.01],

      vertices: createIrregularPolygon(
        [lat - 0.001, lng - 0.01],
        4,
        baseSpread * 0.85,
        8000,
      ),

      opacity: 0.24,
    });

    // Hotspot 9 - Northeast (further), 5 points

    hotspots.push({
      type: "polygon",

      center: [lat + 0.006, lng + 0.008],

      vertices: createIrregularPolygon(
        [lat + 0.006, lng + 0.008],
        5,
        baseSpread * 0.6,
        9000,
      ),

      opacity: 0.23,
    });

    // Hotspot 10 - Southwest (further), 3 points

    hotspots.push({
      type: "polygon",

      center: [lat - 0.007, lng - 0.008],

      vertices: createIrregularPolygon(
        [lat - 0.007, lng - 0.008],
        3,
        baseSpread * 0.9,
        10000,
      ),

      opacity: 0.27,
    });

    return hotspots;
  });

  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [acceptedAdvanceOrders, setAcceptedAdvanceOrders] = useState(() => {
    try {
      const raw = localStorage.getItem(DELIVERY_ACCEPTED_ADVANCE_ORDERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);

  const [acceptButtonProgress, setAcceptButtonProgress] = useState(0);

  const [isAnimatingToComplete, setIsAnimatingToComplete] = useState(false);

  const [hasAutoShown, setHasAutoShown] = useState(false);

  const [showNewOrderPopup, setShowNewOrderPopup] = useState(false);

  const [countdownSeconds, setCountdownSeconds] = useState(300);

  const countdownTimerRef = useRef(null);

  const [showRejectPopup, setShowRejectPopup] = useState(false);

  const [rejectReason, setRejectReason] = useState("");
  const [isRejectingOrder, setIsRejectingOrder] = useState(false);
  const rejectingOrderIdsRef = useRef(new Set());

  const alertAudioRef = useRef(null);

  const userInteractedRef = useRef(false); // Track user interaction for autoplay policy

  const newOrderAcceptButtonRef = useRef(null);

  const newOrderAcceptButtonSwipeStartX = useRef(0);

  const newOrderAcceptButtonSwipeStartY = useRef(0);

  const newOrderAcceptButtonIsSwiping = useRef(false);
  const newOrderAcceptButtonProgressRef = useRef(0);
  const newOrderAcceptButtonMaxProgressRef = useRef(0);
  const newOrderAcceptButtonPendingProgressRef = useRef(0);
  const newOrderAcceptButtonRafRef = useRef(null);
  const newOrderAcceptButtonRenderedProgressRef = useRef(0);
  const [isAcceptingNewOrder, setIsAcceptingNewOrder] = useState(false);
  const isAcceptingNewOrderRef = useRef(false);
  const isDraggingNewOrderAcceptButtonRef = useRef(false);

  const [newOrderAcceptButtonProgress, setNewOrderAcceptButtonProgress] =
    useState(0);

  const [newOrderIsAnimatingToComplete, setNewOrderIsAnimatingToComplete] =
    useState(false);
  const [showAdvancedOrdersPanel, setShowAdvancedOrdersPanel] = useState(false);
  const [previewAdvanceOrder, setPreviewAdvanceOrder] = useState(null);

  const popupOrderId =
    newOrder?.orderMongoId ||
    newOrder?.orderId ||
    selectedRestaurant?.orderId ||
    selectedRestaurant?.id ||
    null;

  const getQueuedOrderIdentity = useCallback((order) => {
    if (!order) return null;
    return (
      order.orderMongoId ||
      order.mongoId ||
      order._id ||
      order.orderId ||
      order.id ||
      null
    );
  }, []);

  const activeFlowOrderId = getQueuedOrderIdentity(selectedRestaurant);
  const advancedOrders = useMemo(() => {
    const blockedIds = new Set(
      [activeFlowOrderId]
        .map((value) => (value == null ? null : String(value)))
        .filter(Boolean),
    );

    return pendingNewOrders.filter((order) => {
      const orderId = getQueuedOrderIdentity(order);
      if (!orderId) return false;
      return !blockedIds.has(String(orderId));
    });
  }, [
    activeFlowOrderId,
    getQueuedOrderIdentity,
    pendingNewOrders,
  ]);

  const totalAdvancedOrdersCount =
    advancedOrders.length + acceptedAdvanceOrders.length;

  const handleOpenAdvancedOrderFlow = useCallback(
    (order) => {
      const orderId = getQueuedOrderIdentity(order);
      if (!orderId) return;

      prioritizeNewOrderNotification(order);
      setShowAdvancedOrdersPanel(false);
      setShowNewOrderPopup(true);
      setIsNewOrderPopupMinimized(false);
      setNewOrderDragY(0);
    },
    [getQueuedOrderIdentity, prioritizeNewOrderNotification],
  );

  const handlePreviewAcceptedAdvanceOrder = useCallback(
    (order) => {
      const orderId = getQueuedOrderIdentity(order);
      if (!orderId) return;

      setShowAdvancedOrdersPanel(false);
      setPreviewAdvanceOrder({
        ...order,
        advanceAccepted: true,
        advanceQueueState: order?.advanceQueueState || "accepted",
        deliveryState: {
          ...(order?.deliveryState || {}),
          status: order?.deliveryState?.status || "accepted",
          currentPhase:
            order?.deliveryState?.currentPhase ||
            order?.deliveryPhase ||
            "en_route_to_pickup",
        },
        deliveryPhase:
          order?.deliveryPhase ||
          order?.deliveryState?.currentPhase ||
          "en_route_to_pickup",
      });
    },
    [getQueuedOrderIdentity],
  );

  const restoreCurrentOrderFlowPopup = useCallback(() => {
    const currentOrderStatus = String(
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "",
    ).toLowerCase();

    const currentDeliveryPhase = String(
      selectedRestaurant?.deliveryPhase ||
        selectedRestaurant?.deliveryState?.currentPhase ||
        "",
    ).toLowerCase();

    const currentDeliveryStateStatus = String(
      selectedRestaurant?.deliveryState?.status || "",
    ).toLowerCase();

    const isDelivered =
      currentOrderStatus === "delivered" ||
      currentDeliveryStateStatus === "delivered" ||
      currentDeliveryPhase === "completed";

    const shouldShowReachedDrop =
      currentOrderStatus === "out_for_delivery" ||
      currentDeliveryStateStatus === "order_confirmed" ||
      currentDeliveryStateStatus === "en_route_to_delivery" ||
      currentDeliveryPhase === "en_route_to_delivery" ||
      currentDeliveryPhase === "en_route_to_drop" ||
      currentDeliveryPhase === "picked_up";

    const shouldShowOrderIdConfirmation =
      currentDeliveryStateStatus === "reached_pickup" ||
      currentDeliveryPhase === "at_pickup";

    if (isDelivered) {
      setShowreachedPickupPopup(false);
      setShowOrderIdConfirmationPopup(false);
      setShowReachedDropPopup(false);
      return;
    }

    setShowreachedPickupPopup(false);
    setShowOrderIdConfirmationPopup(false);
    setShowReachedDropPopup(false);

    if (shouldShowReachedDrop) {
      setShowReachedDropPopup(true);
    } else if (shouldShowOrderIdConfirmation) {
      setShowOrderIdConfirmationPopup(true);
    } else {
      setShowreachedPickupPopup(true);
    }
  }, [selectedRestaurant]);

  const currentBellOrder = useMemo(() => {
    if (!selectedRestaurant) return null;

    const currentOrderStatus = String(
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "",
    ).toLowerCase();
    const currentDeliveryPhase = String(
      selectedRestaurant?.deliveryPhase ||
        selectedRestaurant?.deliveryState?.currentPhase ||
        "",
    ).toLowerCase();

    if (
      currentOrderStatus === "delivered" ||
      currentOrderStatus === "cancelled" ||
      currentDeliveryPhase === "completed" ||
      currentDeliveryPhase === "delivered"
    ) {
      return null;
    }

    return selectedRestaurant;
  }, [selectedRestaurant]);

  const totalBellOrdersCount =
    totalAdvancedOrdersCount + (currentBellOrder ? 1 : 0);

  const currentBellOrderStatusLabel = useMemo(() => {
    if (!currentBellOrder) return "";

    const currentOrderStatus = String(
      currentBellOrder?.orderStatus || currentBellOrder?.status || "",
    ).toLowerCase();
    const currentDeliveryPhase = String(
      currentBellOrder?.deliveryPhase ||
        currentBellOrder?.deliveryState?.currentPhase ||
        "",
    ).toLowerCase();
    const currentDeliveryStateStatus = String(
      currentBellOrder?.deliveryState?.status || "",
    ).toLowerCase();

    if (
      currentDeliveryPhase === "picked_up" ||
      currentDeliveryPhase === "en_route_to_delivery" ||
      currentDeliveryPhase === "en_route_to_drop"
    ) {
      return "On the way to customer";
    }

    if (
      currentDeliveryPhase === "at_pickup" ||
      currentDeliveryStateStatus === "reached_pickup"
    ) {
      return "At pickup";
    }

    if (currentOrderStatus === "out_for_delivery") {
      return "Out for delivery";
    }

    return "Heading to pickup";
  }, [currentBellOrder]);

  useEffect(() => {
    try {
      localStorage.setItem(
        DELIVERY_ACCEPTED_ADVANCE_ORDERS_KEY,
        JSON.stringify(acceptedAdvanceOrders),
      );
    } catch (error) {
      console.warn("Failed to persist accepted advance orders:", error);
    }
  }, [acceptedAdvanceOrders]);

  const newOrderPopupRef = useRef(null);

  const newOrderSwipeStartY = useRef(0);

  const newOrderIsSwiping = useRef(false);

  const [newOrderDragY, setNewOrderDragY] = useState(0);

  const [isDraggingNewOrderPopup, setIsDraggingNewOrderPopup] = useState(false);

  const [isNewOrderPopupMinimized, setIsNewOrderPopupMinimized] =
    useState(false);

  const [showDirectionsMap, setShowDirectionsMap] = useState(false);

  const [navigationMode, setNavigationMode] = useState("restaurant"); // 'restaurant' or 'customer'

  const [showreachedPickupPopup, setShowreachedPickupPopup] = useState(false);

  const [showOrderIdConfirmationPopup, setShowOrderIdConfirmationPopup] =
    useState(false);

  const [showReachedDropPopup, setShowReachedDropPopup] = useState(false);

  const [showOrderDeliveredAnimation, setShowOrderDeliveredAnimation] =
    useState(false);

  const [showCustomerReviewPopup, setShowCustomerReviewPopup] = useState(false);

  const [showPaymentPage, setShowPaymentPage] = useState(false);

  const [customerRating, setCustomerRating] = useState(0);

  const [customerReviewText, setCustomerReviewText] = useState("");
  const [isCompletingDelivery, setIsCompletingDelivery] = useState(false);

  const [orderEarnings, setOrderEarnings] = useState(0); // Store earnings from completed order

  const [routePolyline, setRoutePolyline] = useState([]);

  const [showRoutePath, setShowRoutePath] = useState(false); // Toggle to show/hide route path - disabled by default

  const [directionsResponse, setDirectionsResponse] = useState(null); // Directions API response for road-based routing

  const selectedRestaurantRef = useRef(null);

  const [reachedPickupButtonProgress, setreachedPickupButtonProgress] =
    useState(0);

  const [
    reachedPickupIsAnimatingToComplete,
    setreachedPickupIsAnimatingToComplete,
  ] = useState(false);

  const reachedPickupButtonRef = useRef(null);

  const reachedPickupSwipeStartX = useRef(0);

  const reachedPickupSwipeStartY = useRef(0);

  const reachedPickupIsSwiping = useRef(false);
  const reachedPickupMaxProgressRef = useRef(0);

  const [reachedDropButtonProgress, setReachedDropButtonProgress] = useState(0);

  const [
    reachedDropIsAnimatingToComplete,
    setReachedDropIsAnimatingToComplete,
  ] = useState(false);

  const reachedDropButtonRef = useRef(null);

  const reachedDropSwipeStartX = useRef(0);

  const reachedDropSwipeStartY = useRef(0);

  const reachedDropIsSwiping = useRef(false);
  const reachedDropMaxProgressRef = useRef(0);

  const [orderIdConfirmButtonProgress, setOrderIdConfirmButtonProgress] =
    useState(0);

  const [
    orderIdConfirmIsAnimatingToComplete,
    setOrderIdConfirmIsAnimatingToComplete,
  ] = useState(false);

  const orderIdConfirmButtonRef = useRef(null);

  const orderIdConfirmSwipeStartX = useRef(0);

  const orderIdConfirmSwipeStartY = useRef(0);

  const orderIdConfirmIsSwiping = useRef(false);
  const orderIdConfirmMaxProgressRef = useRef(0);

  // Bill image upload state

  const [billImageUrl, setBillImageUrl] = useState(null);

  const [isUploadingBill, setIsUploadingBill] = useState(false);

  const [billImageUploaded, setBillImageUploaded] = useState(false);
  const [billImageSkipped, setBillImageSkipped] = useState(false);

  const fileInputRef = useRef(null);

  const cameraInputRef = useRef(null);

  const [orderDeliveredButtonProgress, setOrderDeliveredButtonProgress] =
    useState(0);

  const [
    orderDeliveredIsAnimatingToComplete,
    setOrderDeliveredIsAnimatingToComplete,
  ] = useState(false);
  const orderDeliveredMaxProgressRef = useRef(0);

  const orderDeliveredButtonRef = useRef(null);

  // Trip distance and time from Google Maps API

  const [tripDistance, setTripDistance] = useState(null); // in meters

  const [tripTime, setTripTime] = useState(null); // in seconds

  const pickupRouteDistanceRef = useRef(0); // Distance to pickup in meters

  const pickupRouteTimeRef = useRef(0); // Time to pickup in seconds

  const deliveryRouteDistanceRef = useRef(0); // Distance to delivery in meters

  const deliveryRouteTimeRef = useRef(0); // Time to delivery in seconds

  const orderDeliveredSwipeStartX = useRef(0);

  const orderDeliveredSwipeStartY = useRef(0);

  const orderDeliveredIsSwiping = useRef(false);

  const [earningsGuaranteeIsPlaying, setEarningsGuaranteeIsPlaying] =
    useState(true);

  const [earningsGuaranteeAudioTime, setEarningsGuaranteeAudioTime] =
    useState("00:00");

  const earningsGuaranteeAudioRef = useRef(null);

  const bottomSheetRef = useRef(null);

  const handleRef = useRef(null);

  const acceptButtonRef = useRef(null);

  const swipeStartY = useRef(0);

  const isSwiping = useRef(false);

  const acceptButtonSwipeStartX = useRef(0);

  const acceptButtonSwipeStartY = useRef(0);

  const acceptButtonIsSwiping = useRef(false);
  const acceptOrdersMaxProgressRef = useRef(0);

  const autoShowTimerRef = useRef(null);

  const persistDeliveryFlowProgress = useCallback(
    (overrides = {}) => {
      try {
        const raw = localStorage.getItem("deliveryActiveOrder");
        if (!raw) return;
        const current = JSON.parse(raw);

        const resolvedOrderId =
          overrides.orderId ||
          selectedRestaurant?.id ||
          selectedRestaurant?.orderId ||
          current.orderId;

        if (!resolvedOrderId) return;

        const next = {
          ...current,
          ...overrides,
          orderId: resolvedOrderId,
          restaurantInfo:
            overrides.restaurantInfo ||
            selectedRestaurant ||
            current.restaurantInfo,
          progress: {
            ...(current.progress || {}),
            ...(overrides.progress || {}),
            billImageUrl:
              overrides.progress?.billImageUrl ??
              overrides.billImageUrl ??
              billImageUrl ??
              current.progress?.billImageUrl ??
              current.billImageUrl ??
              null,
            billImageUploaded:
              overrides.progress?.billImageUploaded ??
              overrides.billImageUploaded ??
              billImageUploaded ??
              current.progress?.billImageUploaded ??
              current.billImageUploaded ??
              false,
            billImageSkipped:
              overrides.progress?.billImageSkipped ??
              overrides.billImageSkipped ??
              billImageSkipped ??
              current.progress?.billImageSkipped ??
              current.billImageSkipped ??
              false,
            showreachedPickupPopup:
              overrides.progress?.showreachedPickupPopup ??
              showreachedPickupPopup,
            showOrderIdConfirmationPopup:
              overrides.progress?.showOrderIdConfirmationPopup ??
              showOrderIdConfirmationPopup,
            showReachedDropPopup:
              overrides.progress?.showReachedDropPopup ?? showReachedDropPopup,
            showOrderDeliveredAnimation:
              overrides.progress?.showOrderDeliveredAnimation ??
              showOrderDeliveredAnimation,
          },
        };

        localStorage.setItem("deliveryActiveOrder", JSON.stringify(next));
      } catch (error) {
        console.warn("Failed to persist delivery flow progress:", error);
      }
    },
    [
      selectedRestaurant,
      billImageUrl,
      billImageUploaded,
      billImageSkipped,
      showreachedPickupPopup,
      showOrderIdConfirmationPopup,
      showReachedDropPopup,
      showOrderDeliveredAnimation,
    ],
  );

  const hasBillProof = useMemo(() => {
    return Boolean(
      selectedRestaurant?.billImageUrl ||
      selectedRestaurant?.deliveryState?.billImageUrl ||
      billImageUploaded ||
      billImageSkipped,
    );
  }, [
    selectedRestaurant?.billImageUrl,
    selectedRestaurant?.deliveryState?.billImageUrl,
    billImageUploaded,
    billImageSkipped,
  ]);

  const handleSkipBillUpload = useCallback(() => {
    setBillImageUrl(null);
    setBillImageUploaded(false);
    setBillImageSkipped(true);
    persistDeliveryFlowProgress({
      billImageUrl: null,
      billImageUploaded: false,
      billImageSkipped: true,
      progress: {
        billImageUrl: null,
        billImageUploaded: false,
        billImageSkipped: true,
      },
    });
    toast.success("Bill upload skipped");
  }, [persistDeliveryFlowProgress]);

  const enqueueAcceptedAdvanceOrder = useCallback(
    (nextOrder) => {
      const nextOrderId = getQueuedOrderIdentity(nextOrder);
      if (!nextOrderId) return;

      setAcceptedAdvanceOrders((currentOrders) => {
        const existingIndex = currentOrders.findIndex((order) => {
          const orderId = getQueuedOrderIdentity(order);
          return orderId && String(orderId) === String(nextOrderId);
        });

        if (existingIndex >= 0) {
          return currentOrders.map((order, index) =>
            index === existingIndex ? { ...order, ...nextOrder } : order,
          );
        }

        return [...currentOrders, nextOrder];
      });
    },
    [getQueuedOrderIdentity],
  );

  const removeAcceptedAdvanceOrder = useCallback(
    (targetOrder) => {
      const targetOrderId = getQueuedOrderIdentity(targetOrder);
      if (!targetOrderId) return;

      setAcceptedAdvanceOrders((currentOrders) =>
        currentOrders.filter((order) => {
          const orderId = getQueuedOrderIdentity(order);
          return !orderId || String(orderId) !== String(targetOrderId);
        }),
      );
    },
    [getQueuedOrderIdentity],
  );

  const activateAcceptedAdvanceOrder = useCallback(
    (nextOrder) => {
      if (!nextOrder) return false;

      const normalizedOrder = {
        ...nextOrder,
        advanceAccepted: true,
        advanceQueueState: "active",
        deliveryState: {
          ...(nextOrder.deliveryState || {}),
          status: nextOrder.deliveryState?.status || "accepted",
          currentPhase:
            nextOrder.deliveryState?.currentPhase ||
            nextOrder.deliveryPhase ||
            "en_route_to_pickup",
        },
        deliveryPhase:
          nextOrder.deliveryPhase ||
          nextOrder.deliveryState?.currentPhase ||
          "en_route_to_pickup",
      };

      setSelectedRestaurant(normalizedOrder);
      selectedRestaurantRef.current = normalizedOrder;
      removeAcceptedAdvanceOrder(normalizedOrder);

      setShowNewOrderPopup(false);
      setShowreachedPickupPopup(true);
      setShowOrderIdConfirmationPopup(false);
      setShowReachedDropPopup(false);
      setShowOrderDeliveredAnimation(false);
      setShowCustomerReviewPopup(false);
      setShowPaymentPage(false);
      setNavigationMode("restaurant");
      setBillImageUrl(normalizedOrder.billImageUrl || null);
      setBillImageUploaded(
        Boolean(
          normalizedOrder.billImageUploaded || normalizedOrder.billImageUrl,
        ),
      );
      setBillImageSkipped(Boolean(normalizedOrder.billImageSkipped));

      try {
        localStorage.setItem(
          "deliveryActiveOrder",
          JSON.stringify({
            orderId: normalizedOrder.id || normalizedOrder.orderId,
            restaurantInfo: normalizedOrder,
            acceptedAt:
              normalizedOrder.advanceAcceptedAt ||
              normalizedOrder.acceptedAt ||
              new Date().toISOString(),
            billImageUrl: normalizedOrder.billImageUrl || null,
            billImageUploaded: Boolean(
              normalizedOrder.billImageUploaded || normalizedOrder.billImageUrl,
            ),
            billImageSkipped: Boolean(normalizedOrder.billImageSkipped),
            progress: {
              billImageUrl: normalizedOrder.billImageUrl || null,
              billImageUploaded: Boolean(
                normalizedOrder.billImageUploaded ||
                normalizedOrder.billImageUrl,
              ),
              billImageSkipped: Boolean(normalizedOrder.billImageSkipped),
              showreachedPickupPopup: true,
              showOrderIdConfirmationPopup: false,
              showReachedDropPopup: false,
              showOrderDeliveredAnimation: false,
            },
          }),
        );
      } catch (error) {
        console.warn("Failed to activate accepted advance order:", error);
      }

      return true;
    },
    [removeAcceptedAdvanceOrder],
  );

  const stopNewOrderAlertSound = useCallback((reason = "unknown") => {
    if (!alertAudioRef.current) return;

    try {
      alertAudioRef.current.onplaying = null;

      alertAudioRef.current.onended = null;

      alertAudioRef.current.onerror = null;

      alertAudioRef.current.loop = false;

      alertAudioRef.current.pause();

      alertAudioRef.current.currentTime = 0;

      alertAudioRef.current.removeAttribute("src");

      alertAudioRef.current.load();

      alertAudioRef.current = null;
    } catch (error) {
      console.warn("[NewOrder] Failed to stop audio:", error);
    }
  }, []);

  useEffect(() => {
    isAcceptingNewOrderRef.current = isAcceptingNewOrder;
  }, [isAcceptingNewOrder]);

  const isOrderCancelledState = useCallback((order) => {
    if (!order) return false;

    const statusValues = [
      order?.orderStatus,

      order?.status,

      order?.deliveryState?.status,

      order?.deliveryPhase,

      order?.deliveryState?.currentPhase,
    ]

      .filter(Boolean)

      .map((value) => String(value).toLowerCase());

    return statusValues.some((value) => value.includes("cancel"));
  }, []);

  const shouldStopAlertForOrderState = useCallback((order) => {
    if (!order) return false;

    const statusValues = [
      order?.orderStatus,

      order?.status,

      order?.deliveryState?.status,

      order?.deliveryPhase,

      order?.deliveryState?.currentPhase,
    ]

      .filter(Boolean)

      .map((value) => String(value).toLowerCase());

    return statusValues.some(
      (value) =>
        value.includes("accept") ||
        value.includes("picked") ||
        value.includes("out_for_delivery") ||
        value.includes("en_route") ||
        value.includes("deliver") ||
        value.includes("complete") ||
        value.includes("reject") ||
        value.includes("cancel"),
    );
  }, []);

  const isActiveOrderCancelled = useMemo(() => {
    return (
      isOrderCancelledState(selectedRestaurant) ||
      isOrderCancelledState(newOrder)
    );
  }, [isOrderCancelledState, selectedRestaurant, newOrder]);

  const isCancelledConflictError = useCallback((error) => {
    const status = error?.response?.status;

    const message = String(
      error?.response?.data?.message || error?.message || "",
    ).toLowerCase();

    return (
      status === 409 &&
      (message.includes("cancel") || message.includes("terminal"))
    );
  }, []);

  const handleCancelledOrderConflict = useCallback(
    (error, fallbackMessage) => {
      const backendMessage = error?.response?.data?.message;

      const message =
        backendMessage || fallbackMessage || "Order was cancelled by user.";

      toast.error(message);

      localStorage.removeItem("deliveryActiveOrder");

      stopNewOrderAlertSound("order cancelled conflict");

      setShowreachedPickupPopup(false);

      setShowOrderIdConfirmationPopup(false);

      setShowReachedDropPopup(false);

      setShowOrderDeliveredAnimation(false);

      setShowCustomerReviewPopup(false);

      setShowPaymentPage(false);

      setShowNewOrderPopup(false);

      clearNewOrder();

      clearOrderReady();

      acceptedOrderIdsRef.current.clear();

      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }

      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }

      setDirectionsResponse(null);

      directionsResponseRef.current = null;

      setRoutePolyline([]);

      setShowRoutePath(false);

      setSelectedRestaurant(null);
    },
    [clearNewOrder, clearOrderReady, stopNewOrderAlertSound],
  );

  const {
    bookedGigs,

    currentGig,

    goOnline,

    goOffline,

    getSelectedDropLocation,
  } = useGigStore();

  // Use same localStorage key as FeedNavbar for online status

  const LS_KEY = "app:isOnline";

  // Initialize online status from localStorage (same as FeedNavbar)

  const [isOnline, setIsOnline] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);

      const value = raw ? JSON.parse(raw) === true : false;

      isOnlineRef.current = value; // Initialize ref

      return value;
    } catch {
      isOnlineRef.current = false;

      return false;
    }
  });

  // Keep ref in sync with state

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  // Keep selected order ref in sync for geolocation callbacks

  useEffect(() => {
    selectedRestaurantRef.current = selectedRestaurant;
  }, [selectedRestaurant]);

  const getLocationSendPolicy = () => {
    const activeOrder = selectedRestaurantRef.current;
    const orderStatus = String(
      activeOrder?.orderStatus || activeOrder?.status || "",
    ).toLowerCase();
    const deliveryPhase = String(
      activeOrder?.deliveryPhase ||
        activeOrder?.deliveryState?.currentPhase ||
        "",
    ).toLowerCase();
    const deliveryStateStatus = String(
      activeOrder?.deliveryState?.status || "",
    ).toLowerCase();
    const hasActiveOrder =
      Boolean(activeOrder?.id || activeOrder?.orderId) &&
      orderStatus !== "cancelled" &&
      orderStatus !== "delivered" &&
      orderStatus !== "completed" &&
      deliveryPhase !== "completed" &&
      deliveryPhase !== "delivered" &&
      deliveryStateStatus !== "delivered";

    if (hasActiveOrder) {
      return {
        sendIntervalMs: DELIVERY_LOCATION_SEND_INTERVAL_ACTIVE_MS,
        fallbackIntervalMs: DELIVERY_LOCATION_FALLBACK_INTERVAL_ACTIVE_MS,
        minDistanceKm: DELIVERY_LOCATION_DISTANCE_THRESHOLD_ACTIVE_KM,
      };
    }

    return {
      sendIntervalMs: DELIVERY_LOCATION_SEND_INTERVAL_IDLE_MS,
      fallbackIntervalMs: DELIVERY_LOCATION_FALLBACK_INTERVAL_IDLE_MS,
      minDistanceKm: DELIVERY_LOCATION_DISTANCE_THRESHOLD_IDLE_KM,
    };
  };

  const toCoordNumber = useCallback((coord) => {
    if (coord == null) return null;

    if (typeof coord === "function") {
      const value = coord();

      return Number.isFinite(value) ? value : null;
    }

    const value = Number(coord);

    return Number.isFinite(value) ? value : null;
  }, []);

  const isDirectionsRouteToLocation = useCallback(
    (directionsResult, targetLat, targetLng, tolerance = 0.0005) => {
      if (!directionsResult?.routes?.length) return false;

      const endLocation = directionsResult.routes?.[0]?.legs?.[0]?.end_location;

      const endLat = toCoordNumber(endLocation?.lat);

      const endLng = toCoordNumber(endLocation?.lng);

      const normalizedTargetLat = Number(targetLat);

      const normalizedTargetLng = Number(targetLng);

      if (
        endLat == null ||
        endLng == null ||
        !Number.isFinite(normalizedTargetLat) ||
        !Number.isFinite(normalizedTargetLng)
      ) {
        return false;
      }

      return (
        Math.abs(endLat - normalizedTargetLat) < tolerance &&
        Math.abs(endLng - normalizedTargetLng) < tolerance
      );
    },
    [toCoordNumber],
  );

  // Sync online status with localStorage changes (from FeedNavbar or other tabs)

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === LS_KEY && e.newValue != null) {
        const next = JSON.parse(e.newValue) === true;

        console.log(
          "[DeliveryHome] Storage event - online status changed:",
          next,
        );

        setIsOnline((prev) => {
          // Only update if different to avoid unnecessary re-renders

          if (prev !== next) {
            console.log(
              "[DeliveryHome] Updating isOnline state:",
              prev,
              "->",
              next,
            );

            return next;
          }

          return prev;
        });
      }
    };

    // Listen for storage events (cross-tab sync)

    window.addEventListener("storage", handleStorageChange);

    // Also listen for custom events (same-tab sync from FeedNavbar)

    const handleCustomStorageChange = () => {
      try {
        const raw = localStorage.getItem(LS_KEY);

        const next = raw ? JSON.parse(raw) === true : false;

        console.log(
          "[DeliveryHome] Custom event - online status changed:",
          next,
        );

        setIsOnline((prev) => {
          if (prev !== next) {
            console.log(
              "[DeliveryHome] Updating isOnline state from custom event:",
              prev,
              "->",
              next,
            );

            return next;
          }

          return prev;
        });
      } catch (error) {
        console.error("[DeliveryHome] Error reading online status:", error);
      }
    };

    window.addEventListener("onlineStatusChanged", handleCustomStorageChange);

    // Also poll localStorage periodically to catch any missed updates (fallback)

    const pollInterval = setInterval(() => {
      try {
        const raw = localStorage.getItem(LS_KEY);

        const next = raw ? JSON.parse(raw) === true : false;

        setIsOnline((prev) => {
          if (prev !== next) {
            console.log(
              "[DeliveryHome] Polling detected change:",
              prev,
              "->",
              next,
            );

            return next;
          }

          return prev;
        });
      } catch {}
    }, 1000); // Check every second

    return () => {
      window.removeEventListener("storage", handleStorageChange);

      window.removeEventListener(
        "onlineStatusChanged",
        handleCustomStorageChange,
      );

      clearInterval(pollInterval);
    };
  }, []);

  // Calculate today's stats

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const todayDateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Get today's gig (prioritize active, then booked)

  const todayGig =
    bookedGigs.find(
      (gig) => gig.date === todayDateKey && gig.status === "active",
    ) ||
    bookedGigs.find(
      (gig) => gig.date === todayDateKey && gig.status === "booked",
    );

  // Calculate login hours based on when gig started

  const calculateLoginHours = () => {
    if (!todayGig || todayGig.status !== "active") return 0;

    const now = new Date();

    let startTime = now;

    // Use startedAt if available, otherwise use gig start time

    if (todayGig.startedAt) {
      startTime = new Date(todayGig.startedAt);
    } else if (todayGig.startTime) {
      const [hours, minutes] = todayGig.startTime.split(":").map(Number);

      startTime = new Date();

      startTime.setHours(hours, minutes, 0, 0);

      // If start time is in the future, use current time

      if (startTime > now) {
        startTime = now;
      }
    }

    const diffMs = now - startTime;

    const diffHours = diffMs / (1000 * 60 * 60);

    return Math.max(0, diffHours);
  };

  const loginHours = calculateLoginHours();

  const minimumHours = 2.67; // 2 hrs 40 mins = 2.67 hours

  const progressPercentage = Math.min((loginHours / minimumHours) * 100, 100);

  // Get today's progress from store

  const { getTodayProgress, getDateData, hasDateData, updateTodayProgress } =
    useProgressStore();

  const todayProgress = getTodayProgress();

  // Check if store has data for today

  const hasStoreDataForToday = hasDateData(today);

  const todayData = hasStoreDataForToday ? getDateData(today) : null;

  // Calculate today's earnings (prefer store, then calculated; default to 0 so UI is not empty)

  const calculatedEarnings = calculatePeriodEarnings(walletState, "today") || 0;

  const todayEarnings =
    hasStoreDataForToday && todayData
      ? (todayData.earnings ?? calculatedEarnings)
      : calculatedEarnings;

  // Calculate today's trips (prefer store, then calculated; default to 0)

  const allOrders = getAllDeliveryOrders();

  const calculatedTrips = allOrders.filter((order) => {
    const orderId = order.orderId || order.id;

    const orderDateKey = `delivery_order_date_${orderId}`;

    const orderDateStr = localStorage.getItem(orderDateKey);

    if (!orderDateStr) return false;

    const orderDate = new Date(orderDateStr);

    orderDate.setHours(0, 0, 0, 0);

    return orderDate.getTime() === today.getTime();
  }).length;

  const todayTrips =
    hasStoreDataForToday && todayData
      ? (todayData.trips ?? calculatedTrips)
      : calculatedTrips;

  // Calculate today's gigs count

  const todayGigsCount = bookedGigs.filter(
    (gig) => gig.date === todayDateKey,
  ).length;

  // Calculate weekly earnings from wallet transactions (payment + earning_addon bonus)

  // Include both payment and earning_addon transactions in weekly earnings

  const weeklyEarnings =
    walletState?.transactions

      ?.filter((t) => {
        // Include both payment and earning_addon transactions

        if (
          (t.type !== "payment" && t.type !== "earning_addon") ||
          t.status !== "Completed"
        )
          return false;

        const now = new Date();

        const startOfWeek = new Date(now);

        startOfWeek.setDate(now.getDate() - now.getDay());

        startOfWeek.setHours(0, 0, 0, 0);

        const transactionDate = t.date
          ? new Date(t.date)
          : t.createdAt
            ? new Date(t.createdAt)
            : null;

        if (!transactionDate) return false;

        return transactionDate >= startOfWeek && transactionDate <= now;
      })

      .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

  // Calculate weekly orders count from transactions

  const calculateWeeklyOrders = () => {
    if (
      !walletState ||
      !walletState.transactions ||
      !Array.isArray(walletState.transactions)
    ) {
      return 0;
    }

    const now = new Date();

    const startOfWeek = new Date(now);

    startOfWeek.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)

    startOfWeek.setHours(0, 0, 0, 0);

    return walletState.transactions.filter((t) => {
      // Count payment transactions (completed orders)

      if (t.type !== "payment" || t.status !== "Completed") return false;

      const transactionDate = t.date
        ? new Date(t.date)
        : t.createdAt
          ? new Date(t.createdAt)
          : null;

      if (!transactionDate) return false;

      return transactionDate >= startOfWeek && transactionDate <= now;
    }).length;
  };

  const weeklyOrders = calculateWeeklyOrders();

  const totalCashLimit = Number.isFinite(Number(walletState?.totalCashLimit))
    ? Number(walletState.totalCashLimit)
    : 750;

  const cashInHand = Math.max(0, Number(walletState?.cashInHand) || 0);

  const availableCashLimit = Number.isFinite(
    Number(walletState?.availableCashLimit),
  )
    ? Number(walletState.availableCashLimit)
    : Math.max(0, totalCashLimit - cashInHand);
  const isCashInHandLimitReached =
    totalCashLimit > 0 && cashInHand >= totalCashLimit;
  const isMapLockedForOrderEligibility = isCashInHandLimitReached;

  // State for active earning addon

  const [activeEarningAddon, setActiveEarningAddon] = useState(null);

  // Fetch active earning addon offers

  useEffect(() => {
    const fetchActiveEarningAddons = async (options = {}) => {
      const force = options?.force === true;
      const now = Date.now();
      if (!force) {
        if (activeEarningAddonInFlightRef.current) {
          return;
        }
        if (
          now - activeEarningAddonLastRunRef.current <
          ACTIVE_EARNING_ADDON_MIN_INTERVAL_MS
        ) {
          return;
        }
      }
      activeEarningAddonInFlightRef.current = true;
      activeEarningAddonLastRunRef.current = now;

      try {
        const response = await deliveryAPI.getActiveEarningAddons();

        console.log("Active earning addons response:", response?.data);

        if (response?.data?.success && response?.data?.data?.activeOffers) {
          const offers = response.data.data.activeOffers;

          console.log("Active offers found:", offers);

          // Get the first valid active offer (prioritize isValid, then isUpcoming, then any active status)

          const activeOffer =
            offers.find((offer) => offer.isValid) ||
            offers.find((offer) => offer.isUpcoming) ||
            offers.find((offer) => offer.status === "active") ||
            offers[0] ||
            null;

          console.log("Selected active offer:", activeOffer);

          setActiveEarningAddon(activeOffer);
        } else {
          console.log("No active offers found in response");

          setActiveEarningAddon(null);
        }
      } catch (error) {
        // Suppress network errors - backend might be down or endpoint not available

        if (error.code === "ERR_NETWORK") {
          // Silently handle network errors - backend might not be running

          setActiveEarningAddon(null);

          return;
        }

        // Skip logging timeout errors (handled by axios interceptor)

        if (
          error.code !== "ECONNABORTED" &&
          !error.message?.includes("timeout")
        ) {
          // Only log non-network errors

          if (error.response) {
            console.error(
              "Error fetching active earning addons:",
              error.response?.data || error.message,
            );
          }
        }

        setActiveEarningAddon(null);
      } finally {
        activeEarningAddonInFlightRef.current = false;
      }
    };

    // Fetch immediately on mount

    fetchActiveEarningAddons({ force: true });

    // Refresh every 20 seconds to reduce backend load from background polling

    const refreshInterval = setInterval(() => {
      fetchActiveEarningAddons();
    }, 20000);

    // Refresh when page becomes visible

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchActiveEarningAddons();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Also listen for focus events for instant refresh

    const handleFocus = () => {
      fetchActiveEarningAddons();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(refreshInterval);

      document.removeEventListener("visibilitychange", handleVisibilityChange);

      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Calculate bonus earnings from earning_addon transactions (only for active offer)

  const calculateBonusEarnings = () => {
    if (!activeEarningAddon || !walletState?.transactions) return 0;

    const now = new Date();

    const startDate = activeEarningAddon.startDate
      ? new Date(activeEarningAddon.startDate)
      : null;

    const endDate = activeEarningAddon.endDate
      ? new Date(activeEarningAddon.endDate)
      : null;

    return walletState.transactions

      .filter((t) => {
        // Only count earning_addon type transactions

        if (t.type !== "earning_addon" || t.status !== "Completed")
          return false;

        // Filter by date range if offer has dates

        if (startDate || endDate) {
          const transactionDate = t.date
            ? new Date(t.date)
            : t.createdAt
              ? new Date(t.createdAt)
              : null;

          if (!transactionDate) return false;

          if (startDate && transactionDate < startDate) return false;

          if (endDate && transactionDate > endDate) return false;
        }

        // Check if transaction is related to current offer

        if (t.metadata?.earningAddonId) {
          return (
            t.metadata.earningAddonId === activeEarningAddon._id?.toString() ||
            t.metadata.earningAddonId === activeEarningAddon.id?.toString()
          );
        }

        // If no metadata, include all earning_addon transactions in date range

        return true;
      })

      .reduce((sum, t) => sum + (t.amount || 0), 0);
  };

  // Earnings Guarantee - Use active earning addon if available, otherwise show 0

  // When no offer is active, show 0 of 0 and &#8377;0

  const earningsGuaranteeTarget = activeEarningAddon?.earningAmount || 0;

  const earningsGuaranteeOrdersTarget = activeEarningAddon?.requiredOrders || 0;

  // Only show current orders/earnings if there's an active offer

  const earningsGuaranteeCurrentOrders = activeEarningAddon
    ? (activeEarningAddon.currentOrders ?? weeklyOrders)
    : weeklyOrders;

  // Show only bonus earnings from the offer, not total weekly earnings

  const earningsGuaranteeCurrentEarnings = activeEarningAddon
    ? calculateBonusEarnings()
    : weeklyEarnings;

  const ordersProgress =
    earningsGuaranteeOrdersTarget > 0
      ? Math.min(
          earningsGuaranteeCurrentOrders / earningsGuaranteeOrdersTarget,
          1,
        )
      : 0;

  const earningsProgress =
    earningsGuaranteeTarget > 0
      ? Math.min(earningsGuaranteeCurrentEarnings / earningsGuaranteeTarget, 1)
      : 0;

  // Get week end date for valid till - use offer end date if available

  const getWeekEndDate = () => {
    if (activeEarningAddon?.endDate) {
      const endDate = new Date(activeEarningAddon.endDate);

      const day = endDate.getDate();

      const month = endDate.toLocaleString("en-US", { month: "short" });

      return `${day} ${month}`;
    }

    const now = new Date();

    const endOfWeek = new Date(now);

    endOfWeek.setDate(now.getDate() - now.getDay() + 6); // End of week (Saturday)

    const day = endOfWeek.getDate();

    const month = endOfWeek.toLocaleString("en-US", { month: "short" });

    return `${day} ${month}`;
  };

  const weekEndDate = getWeekEndDate();

  // Offer is live if it's valid (started) or upcoming (not started yet but active)

  const isOfferLive =
    activeEarningAddon?.isValid || activeEarningAddon?.isUpcoming || false;

  const hasActiveOffer = !!activeEarningAddon;

  // Calculate total hours worked today (prefer store, then calculated; default to 0)

  const calculatedHours = bookedGigs

    .filter((gig) => gig.date === todayDateKey)

    .reduce((total, gig) => total + (gig.totalHours || 0), 0);

  const todayHoursWorked =
    hasStoreDataForToday && todayData
      ? (todayData.timeOnOrders ?? calculatedHours)
      : calculatedHours;

  // Track last updated values to prevent infinite loops

  const lastUpdatedRef = useRef({ earnings: null, trips: null, hours: null });

  // Update progress store with calculated values when data changes (with debounce)

  useEffect(() => {
    // Only update if values have actually changed

    if (
      calculatedEarnings !== undefined &&
      calculatedTrips !== undefined &&
      calculatedHours !== undefined &&
      (lastUpdatedRef.current.earnings !== calculatedEarnings ||
        lastUpdatedRef.current.trips !== calculatedTrips ||
        lastUpdatedRef.current.hours !== calculatedHours)
    ) {
      lastUpdatedRef.current = {
        earnings: calculatedEarnings,

        trips: calculatedTrips,

        hours: calculatedHours,
      };

      updateTodayProgress({
        earnings: calculatedEarnings,

        trips: calculatedTrips,

        timeOnOrders: calculatedHours,
      });
    }
  }, [
    calculatedEarnings,
    calculatedTrips,
    calculatedHours,
    updateTodayProgress,
  ]);

  // Listen for progress data updates from other components

  useEffect(() => {
    const handleProgressUpdate = () => {
      // Force re-render to show updated progress

      setAnimationKey((prev) => prev + 1);
    };

    window.addEventListener("progressDataUpdated", handleProgressUpdate);

    return () => {
      window.removeEventListener("progressDataUpdated", handleProgressUpdate);
    };
  }, []); // Empty dependency array - only set up listener once

  const formatHours = (hours) => {
    const h = Math.floor(hours);

    const m = Math.floor((hours - h) * 60);

    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  // Listen for progress data updates

  useEffect(() => {
    const handleProgressUpdate = () => {
      // Force re-render to show updated progress

      setAnimationKey((prev) => prev + 1);
    };

    window.addEventListener("progressDataUpdated", handleProgressUpdate);

    window.addEventListener("storage", handleProgressUpdate);

    return () => {
      window.removeEventListener("progressDataUpdated", handleProgressUpdate);

      window.removeEventListener("storage", handleProgressUpdate);
    };
  }, []);

  // Initialize Lenis

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,

      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),

      smoothWheel: true,
    });

    function raf(time) {
      lenis.raf(time);

      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, [location.pathname, animationKey]);

  // Track user interaction for autoplay policy

  useEffect(() => {
    const handleUserInteraction = () => {
      userInteractedRef.current = true;

      // Remove listeners after first interaction

      document.removeEventListener("click", handleUserInteraction);

      document.removeEventListener("touchstart", handleUserInteraction);

      document.removeEventListener("keydown", handleUserInteraction);
    };

    // Listen for user interaction

    document.addEventListener("click", handleUserInteraction, { once: true });

    document.addEventListener("touchstart", handleUserInteraction, {
      once: true,
    });

    document.addEventListener("keydown", handleUserInteraction, { once: true });

    return () => {
      document.removeEventListener("click", handleUserInteraction);

      document.removeEventListener("touchstart", handleUserInteraction);

      document.removeEventListener("keydown", handleUserInteraction);
    };
  }, []);

  // Play alert sound function - plays until countdown ends (30 seconds)

  const playAlertSound = async () => {
    // Only play if user has interacted with the page (browser autoplay policy)

    if (!userInteractedRef.current) {
      console.log(
        "[AUDIO] Audio playback skipped - user has not interacted with page yet",
      );

      return null;
    }

    try {
      // Get selected alert sound preference from localStorage

      const selectedSound =
        localStorage.getItem("delivery_alert_sound") || "zomato_tone";
      const appendAudioCacheVersion = (src) => {
        const safeSrc = String(src || "").trim();
        if (!safeSrc) return safeSrc;
        const separator = safeSrc.includes("?") ? "&" : "?";
        return `${safeSrc}${separator}v=${DELIVERY_ALERT_AUDIO_CACHE_VERSION}`;
      };
      const soundFile = appendAudioCacheVersion(
        selectedSound === "original" ? originalSound : alertSound,
      );

      console.log("[AUDIO] Playing alert sound:", {
        selectedSound,

        soundType: selectedSound === "original" ? "Original" : "Zomato Tone",

        soundFile,

        originalSoundPath: originalSound,

        alertSoundPath: alertSound,
      });

      // Verify sound file exists

      if (!soundFile) {
        console.error("[ERROR] Sound file is undefined!", {
          selectedSound,
          soundFile,
        });

        return null;
      }

      // Use selected sound file from assets

      const audio = new Audio(soundFile);

      // Add load event listener to verify file loads

      audio.addEventListener("loadeddata", () => {
        console.log("[OK] Audio file loaded successfully:", soundFile);
      });

      audio.addEventListener("canplay", () => {
        console.log("[OK] Audio can play:", soundFile);
      });

      audio.volume = 1;

      audio.loop = true; // Loop the sound

      // Set up error handler

      audio.addEventListener("error", (e) => {
        console.error("Audio error:", e);

        console.error("Audio error details:", {
          code: audio.error?.code,

          message: audio.error?.message,
        });
      });

      // Preload audio before playing

      audio.preload = "auto";

      // Play the sound and wait for it to start

      try {
        // Wait for audio to be ready

        await new Promise((resolve, reject) => {
          audio.addEventListener("canplaythrough", resolve, { once: true });

          audio.addEventListener("error", reject, { once: true });

          audio.load();

          // Timeout after 3 seconds

          setTimeout(() => reject(new Error("Audio load timeout")), 3000);
        });

        const playPromise = audio.play();

        if (playPromise !== undefined) {
          await playPromise;
        }

        console.log("[OK] Alert sound started playing successfully", {
          src: audio.src,

          volume: audio.volume,

          loop: audio.loop,

          readyState: audio.readyState,
        });

        return audio;
      } catch (playError) {
        console.error("[ERROR] Audio play error:", {
          error: playError,

          message: playError.message,

          name: playError.name,

          soundFile,

          selectedSound,

          audioReadyState: audio.readyState,

          audioSrc: audio.src,
        });

        // Don't log autoplay policy errors as they're expected before user interaction

        if (
          !playError.message?.includes("user didn't interact") &&
          !playError.name?.includes("NotAllowedError") &&
          !playError.message?.includes("timeout")
        ) {
          console.error("[ERROR] Could not play alert sound:", playError);
        }

        // Try to load and play again

        try {
          audio.load();

          await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay

          const playPromise = audio.play();

          if (playPromise !== undefined) {
            await playPromise;
          }

          console.log("[OK] Alert sound started playing after retry");

          return audio;
        } catch (retryError) {
          // Don't log autoplay policy errors

          if (
            !retryError.message?.includes("user didn't interact") &&
            !retryError.name?.includes("NotAllowedError")
          ) {
            console.error(
              "[ERROR] Could not play alert sound after retry:",
              retryError,
            );
          }

          return null;
        }
      }
    } catch (error) {
      console.error("[ERROR] Could not create audio:", error);

      return null;
    }
  };

  // Auto-show disabled - Only real orders from Socket.IO will show

  // Removed mock restaurant auto-show logic

  // Countdown timer for new order popup
  // Keep one stable interval while popup is open; avoid resetting interval on every tick.
  useEffect(() => {
    if (!showNewOrderPopup) {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      return () => {};
    }

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    countdownTimerRef.current = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          // Stop audio when countdown reaches 0
          stopNewOrderAlertSound("countdown ended");
          // Auto-close when countdown reaches 0
          setShowNewOrderPopup(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      // Only clear the timer, don't stop audio here
      // Audio will be stopped by the popup close useEffect
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [showNewOrderPopup, stopNewOrderAlertSound]);

  // Play audio when New Order popup appears (only for real orders from Socket.IO)

  useEffect(() => {
    if (showNewOrderPopup && popupOrderId) {
      // Stop any existing audio first

      stopNewOrderAlertSound("restarting popup sound");

      // Play alert sound when popup appears

      const playAudio = async () => {
        try {
          // Check localStorage preference

          const currentPreference =
            localStorage.getItem("delivery_alert_sound") || "zomato_tone";

          console.log("[NewOrder] [AUDIO] Attempting to play audio...", {
            preference: currentPreference,

            willUse:
              currentPreference === "original" ? "original.mp3" : "alert.mp3",
          });

          const audio = await playAlertSound();

          if (audio) {
            alertAudioRef.current = audio;

            console.log(
              "[NewOrder] [AUDIO] Audio started playing, looping:",
              audio.loop,
            );

            // Verify audio is actually playing and ensure it loops

            audio.onplaying = () => {
              console.log("[NewOrder] [OK] Audio is now playing");
            };

            // Keep ended handler non-restarting to avoid stale closure loops.

            audio.onended = () => {
              console.log("[NewOrder] [INFO] Audio ended");
            };

            audio.onerror = (e) => {
              console.error("[NewOrder] [ERROR] Audio error:", e);
            };

            // Double-check loop is enabled

            if (!audio.loop) {
              audio.loop = true;

              console.log("[NewOrder] [DEBUG] Loop was false, enabled it");
            }
          } else {
            console.log("[NewOrder] [WARN] playAlertSound returned null");
          }
        } catch (error) {
          console.error("[NewOrder] [WARN] Audio failed to play:", error);
        }
      };

      // Small delay to ensure popup is fully rendered

      const timeoutId = setTimeout(() => {
        playAudio();
      }, 100);

      return () => {
        clearTimeout(timeoutId);
      };
    } else {
      // Stop audio when popup closes

      stopNewOrderAlertSound("popup closed");
    }
  }, [showNewOrderPopup, popupOrderId, stopNewOrderAlertSound]);

  // Global watchdog: sound must stop unless order is in active new-order stage.

  useEffect(() => {
    const shouldForceStop =
      !showNewOrderPopup ||
      !isOnline ||
      isActiveOrderCancelled ||
      shouldStopAlertForOrderState(newOrder) ||
      shouldStopAlertForOrderState(selectedRestaurant);

    if (shouldForceStop) {
      stopNewOrderAlertSound("watchdog force stop");

      if (
        showNewOrderPopup &&
        (isActiveOrderCancelled ||
          shouldStopAlertForOrderState(newOrder) ||
          shouldStopAlertForOrderState(selectedRestaurant))
      ) {
        setShowNewOrderPopup(false);
      }
    }
  }, [
    showNewOrderPopup,

    isOnline,

    isActiveOrderCancelled,

    newOrder,

    selectedRestaurant,

    shouldStopAlertForOrderState,

    stopNewOrderAlertSound,
  ]);

  // Reset countdown when popup closes

  useEffect(() => {
    if (!showNewOrderPopup) {
      setCountdownSeconds(300);

      setNewOrderAcceptButtonProgress(0);

      setNewOrderIsAnimatingToComplete(false);
    }
  }, [showNewOrderPopup]);

  // Hard-stop alert sound once order is accepted by delivery partner.

  // This guarantees buzzer doesn't continue due any race/retry path.

  useEffect(() => {
    const deliveryStatus = selectedRestaurant?.deliveryState?.status;

    const deliveryPhase =
      selectedRestaurant?.deliveryState?.currentPhase ||
      selectedRestaurant?.deliveryPhase;

    const orderStatus =
      selectedRestaurant?.orderStatus || selectedRestaurant?.status;

    const isAcceptedByDelivery =
      deliveryStatus === "accepted" ||
      deliveryPhase === "en_route_to_pickup" ||
      deliveryPhase === "at_pickup" ||
      deliveryPhase === "en_route_to_delivery" ||
      orderStatus === "out_for_delivery";

    if (isAcceptedByDelivery) {
      stopNewOrderAlertSound("order accepted by delivery");

      if (showNewOrderPopup) {
        setShowNewOrderPopup(false);
      }
    }
  }, [
    selectedRestaurant?.deliveryState?.status,

    selectedRestaurant?.deliveryState?.currentPhase,

    selectedRestaurant?.deliveryPhase,

    selectedRestaurant?.orderStatus,

    selectedRestaurant?.status,

    showNewOrderPopup,

    stopNewOrderAlertSound,
  ]);

  // Immediately hide any order slider/popup if the active order is cancelled.

  useEffect(() => {
    if (!isActiveOrderCancelled) return;

    handleCancelledOrderConflict(null, "Order was cancelled by user.");
  }, [isActiveOrderCancelled, handleCancelledOrderConflict]);

  // Simulate audio playback for Earnings Guarantee

  useEffect(() => {
    if (earningsGuaranteeIsPlaying) {
      // Simulate audio time progression

      let time = 0;

      const interval = setInterval(() => {
        time += 1;

        const minutes = Math.floor(time / 60);

        const seconds = time % 60;

        setEarningsGuaranteeAudioTime(
          `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
        );

        // Stop after 10 seconds (simulating audio length)

        if (time >= 10) {
          setEarningsGuaranteeIsPlaying(false);

          clearInterval(interval);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [earningsGuaranteeIsPlaying]);

  const toggleEarningsGuaranteeAudio = () => {
    setEarningsGuaranteeIsPlaying(!earningsGuaranteeIsPlaying);
  };

  // Reject reasons for order cancellation

  const rejectReasons = [
    "Too far from current location",

    "Vehicle issue",

    "Personal emergency",

    "Weather conditions",

    "Already have too many orders",

    "Other reason",
  ];

  // Handle reject order

  const handleRejectClick = () => {
    setShowRejectPopup(true);
  };

  const handleRejectOrder = (overrideReason = "") => {
    const rejectOrder = async () => {
      // Deny must target the active "new order" notification only.
      // Never fallback to accepted/active order state, otherwise backend returns
      // "already accepted by you".
      const orderId = newOrder?.orderMongoId || newOrder?.orderId || null;

      if (!orderId) {
        setShowRejectPopup(false);
        setShowNewOrderPopup(false);
        setShowreachedPickupPopup(false);
        setShowOrderIdConfirmationPopup(false);
        setShowReachedDropPopup(false);
        setShowOrderDeliveredAnimation(false);
        setSelectedRestaurant(null);
        toast.error("This order is no longer available to deny.");
        return;
      }
      if (rejectingOrderIdsRef.current.has(String(orderId))) {
        return;
      }

      try {
        // Cancel any in-flight accept UI state so deny cannot race into accepted UI.
        setIsAcceptingNewOrder(false);
        resetNewOrderAcceptProgress();
        const reasonToSend = (
          overrideReason ||
          rejectReason ||
          "Too far from current location"
        ).trim();
        rejectingOrderIdsRef.current.add(String(orderId));
        setIsRejectingOrder(true);
        await deliveryAPI.rejectOrder(orderId, reasonToSend, {
          suppressErrorToast: true,
        });
        markOrderAsUnavailable(
          orderId,
          newOrder?.orderMongoId,
          newOrder?.orderId,
          selectedRestaurant?.orderId,
        );
        clearNewOrder();
        localStorage.removeItem("deliveryActiveOrder");
        localStorage.removeItem("activeOrder");
        stopNewOrderAlertSound("order rejected");
        setShowRejectPopup(false);
        setShowNewOrderPopup(false);
        setShowreachedPickupPopup(false);
        setShowOrderIdConfirmationPopup(false);
        setShowReachedDropPopup(false);
        setSelectedRestaurant(null);
        setIsNewOrderPopupMinimized(false);
        setNewOrderDragY(0);
        setRejectReason("");
        setCountdownSeconds(300);
        toast.success("Order denied");
      } catch (error) {
        const statusCode = Number(error?.response?.status || 0);
        const message = String(
          error?.response?.data?.message || "",
        ).toLowerCase();
        if (
          message.includes("already accepted by you") ||
          message.includes("already assigned to another delivery partner") ||
          message.includes("not available for you") ||
          message.includes("already denied") ||
          message.includes("not assigned") ||
          message.includes("forbidden") ||
          statusCode === 403 ||
          statusCode === 404
        ) {
          // Treat stale deny as resolved UI state; don't keep popup stuck.
          markOrderAsUnavailable(
            orderId,
            newOrder?.orderMongoId,
            newOrder?.orderId,
            selectedRestaurant?.orderId,
          );
          clearNewOrder();
          localStorage.removeItem("deliveryActiveOrder");
          localStorage.removeItem("activeOrder");
          setShowRejectPopup(false);
          setShowNewOrderPopup(false);
          setShowreachedPickupPopup(false);
          setShowOrderIdConfirmationPopup(false);
          setShowReachedDropPopup(false);
          setShowOrderDeliveredAnimation(false);
          setSelectedRestaurant(null);
          setIsNewOrderPopupMinimized(false);
          setNewOrderDragY(0);
          setRejectReason("");
          toast.success("Order is no longer available");
          return;
        }
        const fallback =
          error?.response?.data?.message ||
          "Failed to deny order. Please try again.";
        toast.error(fallback);
      } finally {
        rejectingOrderIdsRef.current.delete(String(orderId));
        setIsRejectingOrder(false);
      }
    };

    void rejectOrder();
  };

  const handleQuickDenyNewOrder = () => {
    handleRejectOrder("Too far from current location");
  };

  const handleRejectConfirm = () => {
    handleRejectOrder();
  };

  const handleRejectCancel = () => {
    setShowRejectPopup(false);

    setRejectReason("");
  };

  // Reset popup state on page load/refresh - ensure no popup shows on refresh

  useEffect(() => {
    // Clear any popup state on mount

    setShowNewOrderPopup(false);

    setSelectedRestaurant(null);

    setHasAutoShown(false);

    setCountdownSeconds(300);

    // Clear any timers

    if (autoShowTimerRef.current) {
      clearTimeout(autoShowTimerRef.current);

      autoShowTimerRef.current = null;
    }

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);

      countdownTimerRef.current = null;
    }

    // Stop and cleanup audio

    if (alertAudioRef.current) {
      alertAudioRef.current.pause();

      alertAudioRef.current.currentTime = 0;

      alertAudioRef.current = null;
    }
  }, []); // Only run on mount

  // Get rider location - App open होते ही location fetch करें

  useEffect(() => {
    // First, check if we have saved location in localStorage (for refresh handling)

    const cachedLocation = readCachedDeliveryLocation();

    if (cachedLocation) {
      setRiderLocation(cachedLocation);

      lastLocationRef.current = cachedLocation;

      routeHistoryRef.current = [
        {
          lat: cachedLocation[0],

          lng: cachedLocation[1],
        },
      ];

      console.log("[LOC] Restored recent cached location:", cachedLocation);
    }

    if (navigator.geolocation) {
      // Get current position first - App open होते ही location लें

      console.log("[LOC] Fetching current location on app open...");

      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Validate coordinates

          const latitude = position.coords.latitude;

          const longitude = position.coords.longitude;

          const accuracy = position.coords.accuracy || 0;

          // Validate coordinates are valid numbers

          if (
            typeof latitude !== "number" ||
            typeof longitude !== "number" ||
            isNaN(latitude) ||
            isNaN(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) {
            console.warn("[WARN] Invalid coordinates received:", {
              latitude,
              longitude,
            });

            // Don't use default location - keep trying or use saved location

            // Retry after a delay

            setTimeout(() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    const lat = pos.coords.latitude;

                    const lng = pos.coords.longitude;

                    if (
                      typeof lat === "number" &&
                      typeof lng === "number" &&
                      !isNaN(lat) &&
                      !isNaN(lng) &&
                      lat >= -90 &&
                      lat <= 90 &&
                      lng >= -180 &&
                      lng <= 180
                    ) {
                      setRiderLocation([lat, lng]);

                      lastLocationRef.current = [lat, lng];
                    }
                  },

                  (err) => console.warn("[WARN] Retry failed:", err),

                  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
                );
              }
            }, 2000);

            return;
          }

          // Check for coordinate swap (common issue: lat/lng swapped)

          // India coordinates: lat ~8-37, lng ~68-97

          if (
            latitude > 90 ||
            latitude < -90 ||
            longitude > 180 ||
            longitude < -180
          ) {
            console.error(
              "[ERROR] Coordinates out of valid range - possible swap:",
              { latitude, longitude },
            );

            // Don't use default location - retry

            setTimeout(() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    const lat = pos.coords.latitude;

                    const lng = pos.coords.longitude;

                    if (
                      typeof lat === "number" &&
                      typeof lng === "number" &&
                      !isNaN(lat) &&
                      !isNaN(lng) &&
                      lat >= -90 &&
                      lat <= 90 &&
                      lng >= -180 &&
                      lng <= 180
                    ) {
                      setRiderLocation([lat, lng]);

                      lastLocationRef.current = [lat, lng];
                    }
                  },

                  (err) => console.warn("[WARN] Retry failed:", err),

                  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
                );
              }
            }, 2000);

            return;
          }

          // Validate coordinates are reasonable for India (basic sanity check)

          // India: Latitude 8.4° to 37.6°, Longitude 68.7° to 97.25°

          const isInIndiaRange =
            latitude >= 8 &&
            latitude <= 38 &&
            longitude >= 68 &&
            longitude <= 98;

          if (!isInIndiaRange) {
            console.warn(
              "[WARN] Coordinates outside India range - might be incorrect:",
              {
                latitude,

                longitude,

                note: "India range: lat 8-38, lng 68-98",
              },
            );

            // Still use the location but log warning
          }

          // Apply stable tracking filter

          const shouldAccept = shouldAcceptLocation(
            position,

            lastValidLocationRef.current,

            lastLocationTimeRef.current,
          );

          if (!shouldAccept) {
            console.log(
              "[BLOCK] Initial location rejected by filter, will wait for better GPS signal",
            );

            return;
          }

          const rawLocation = [latitude, longitude];

          // Initialize location history with first valid point

          locationHistoryRef.current = [rawLocation];

          const smoothedLocation = rawLocation; // First point, no smoothing needed yet

          // Update refs

          lastValidLocationRef.current = smoothedLocation;

          lastLocationTimeRef.current = Date.now();

          smoothedLocationRef.current = smoothedLocation;

          let heading =
            position.coords.heading !== null &&
            position.coords.heading !== undefined
              ? position.coords.heading
              : null;

          // Initialize route history

          routeHistoryRef.current = [
            {
              lat: smoothedLocation[0],

              lng: smoothedLocation[1],
            },
          ];

          // Save location to localStorage

          saveCachedDeliveryLocation(smoothedLocation);

          setRiderLocation(smoothedLocation);

          lastLocationRef.current = smoothedLocation;

          // Initialize map if not already initialized (will use this location)

          if (
            !window.deliveryMapInstance &&
            window.google &&
            window.google.maps &&
            mapContainerRef.current
          ) {
            console.log(
              "[LOC] Map not initialized yet, will initialize with GPS location",
            );

            // Map will be initialized in the map initialization useEffect with this location
          } else if (window.deliveryMapInstance) {
            // Map already initialized. Keep camera stable during live updates.

            createOrUpdateBikeMarker(
              smoothedLocation[0],
              smoothedLocation[1],
              heading,
              !isUserPanningRef.current,
            );

            updateRoutePolyline();

            console.log("[LOC] Live location updated without camera recenter");
          }

          console.log(
            "[LOC] Current location obtained on app open (filtered):",
            {
              raw: { lat: latitude, lng: longitude },

              smoothed: { lat: smoothedLocation[0], lng: smoothedLocation[1] },

              heading,

              accuracy: `${accuracy.toFixed(0)}m`,

              isOnline: isOnlineRef.current,

              timestamp: new Date().toISOString(),
            },
          );
        },

        (error) => {
          console.warn("[WARN] Error getting current location:", error);

          if (error?.code === 1) {
            handleLocationPermissionDenied();
          }

          // Don't use default location - retry after delay

          // Check if we have saved location from localStorage

          const cachedLocation = readCachedDeliveryLocation();

          if (!cachedLocation) {
            // No saved location, retry after 3 seconds

            setTimeout(() => {
              if (navigator.geolocation) {
                console.log("[SYNC] Retrying location fetch...");

                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    const lat = position.coords.latitude;

                    const lng = position.coords.longitude;

                    if (
                      typeof lat === "number" &&
                      typeof lng === "number" &&
                      !isNaN(lat) &&
                      !isNaN(lng) &&
                      lat >= -90 &&
                      lat <= 90 &&
                      lng >= -180 &&
                      lng <= 180
                    ) {
                      const newLocation = [lat, lng];

                      setRiderLocation(newLocation);

                      lastLocationRef.current = newLocation;

                      smoothedLocationRef.current = newLocation;

                      lastValidLocationRef.current = newLocation;

                      locationHistoryRef.current = [newLocation];

                      saveCachedDeliveryLocation(newLocation);

                      console.log(
                        "[OK] Location obtained on retry:",
                        newLocation,
                      );

                      // Keep camera stable if map is already initialized.

                      if (window.deliveryMapInstance) {
                        console.log(
                          "[LOC] GPS retry location applied without camera recenter",
                        );

                        // Update bike marker

                        if (bikeMarkerRef.current) {
                          bikeMarkerRef.current.setPosition({ lat, lng });
                        } else if (window.deliveryMapInstance) {
                          createOrUpdateBikeMarker(lat, lng, null, true);
                        }
                      }
                    }
                  },

                  (err) => {
                    console.warn("[WARN] Retry also failed:", err);

                    // Show toast to user to enable location

                    toast.error(
                      "Location access required. Please enable location permissions.",
                    );
                  },

                  { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
                );
              }
            }, 3000);
          } else {
            console.log("[LOC] Using saved location from previous session");
          }
        },

        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );

      // NOTE: watchPosition will be started/stopped based on isOnline status

      // This is handled in a separate useEffect that depends on isOnline
    } else {
      // Geolocation not available - show error

      console.error("[ERROR] Geolocation API not available in this browser");

      toast.error(
        "Location services not available. Please use a device with GPS.",
      );
    }
  }, []); // Run only on mount - get initial location

  // Watch position updates - ONLY when online (Production Level Implementation)

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    // Clear any existing watch before starting new one

    if (watchPositionIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchPositionIdRef.current);

      watchPositionIdRef.current = null;
    }

    // Keep location tracking running even when offline (bike should always show on map)

    // But only send location to backend when online (for order assignment)

    console.log("[LOC] Starting live location tracking (offline/online)");

    // Watch position updates for live tracking with STABLE TRACKING SYSTEM

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (isRouteSimulationEnabledRef.current) {
          return;
        }

        // Validate coordinates first

        const latitude = position.coords.latitude;

        const longitude = position.coords.longitude;

        const accuracy = position.coords.accuracy || 0;

        // Basic validation

        if (
          typeof latitude !== "number" ||
          typeof longitude !== "number" ||
          isNaN(latitude) ||
          isNaN(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          console.warn("[WARN] Invalid coordinates received:", {
            latitude,
            longitude,
          });

          return;
        }

        // ============================================

        // STABLE TRACKING FILTERING (RAPIDO STYLE)

        // ============================================

        // Apply filtering: accuracy, distance jump, speed checks

        const shouldAccept = shouldAcceptLocation(
          position,

          lastValidLocationRef.current,

          lastLocationTimeRef.current,
        );

        if (!shouldAccept) {
          // Location rejected by filter - but send to backend if it's been > 30 seconds since last update

          // This ensures admin map always shows delivery boy even with poor GPS

          if (isOnlineRef.current && lastValidLocationRef.current) {
            const now = Date.now();

            const lastSentTime = window.lastLocationSentTime || 0;

            const timeSinceLastSend = now - lastSentTime;

            const locationPolicy = getLocationSendPolicy();
            // Fallback cadence is relaxed when no active order to reduce API load.
            if (timeSinceLastSend >= locationPolicy.fallbackIntervalMs) {
              const [lat, lng] = lastValidLocationRef.current;

              if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                console.log(
                  "[UPLOAD] Sending fallback location to backend (filter rejected new location):",
                  {
                    lat,

                    lng,

                    accuracy: accuracy.toFixed(2) + "m",

                    timeSinceLastSend:
                      (timeSinceLastSend / 1000).toFixed(0) + "s",
                  },
                );

                deliveryAPI
                  .updateLocation(lat, lng, true)

                  .then(() => {
                    window.lastLocationSentTime = now;
                  })

                  .catch((error) => {
                    if (
                      error.code !== "ERR_NETWORK" &&
                      error.message !== "Network Error"
                    ) {
                      console.error(
                        "[ERROR] Error sending fallback location:",
                        error,
                      );
                    }
                  });
              }
            }
          }

          // Keep using last valid location

          return;
        }

        // Location passed filter - add to history

        const rawLocation = [latitude, longitude];

        locationHistoryRef.current.push(rawLocation);

        // Keep only last 3 points for moving average

        if (locationHistoryRef.current.length > 3) {
          locationHistoryRef.current.shift();
        }

        // Apply moving average smoothing

        const smoothedLocation = smoothLocation(locationHistoryRef.current);

        if (!smoothedLocation) {
          // Not enough points yet, use raw location

          const newLocation = rawLocation;

          lastValidLocationRef.current = newLocation;

          lastLocationTimeRef.current = Date.now();

          smoothedLocationRef.current = newLocation;

          // Initialize if first location

          if (!lastLocationRef.current) {
            setRiderLocation(newLocation);

            lastLocationRef.current = newLocation;

            routeHistoryRef.current = [
              {
                lat: newLocation[0],

                lng: newLocation[1],
              },
            ];

            // Save to localStorage

            saveCachedDeliveryLocation(newLocation);

            // Update marker with correct location

            if (window.deliveryMapInstance) {
              const [lat, lng] = newLocation;

              console.log("[LOC] Updating bike marker with first location:", {
                lat,
                lng,
              });

              // Validate coordinates

              if (
                typeof lat === "number" &&
                typeof lng === "number" &&
                !isNaN(lat) &&
                !isNaN(lng) &&
                lat >= -90 &&
                lat <= 90 &&
                lng >= -180 &&
                lng <= 180
              ) {
                if (bikeMarkerRef.current) {
                  bikeMarkerRef.current.setPosition({ lat, lng });

                  console.log(
                    "[OK] Bike marker position updated to first location",
                  );
                } else {
                  // Create marker if it doesn't exist

                  createOrUpdateBikeMarker(lat, lng, null, true);

                  console.log("[OK] Bike marker created with first location");
                }
              } else {
                console.error("[ERROR] Invalid coordinates for bike marker:", {
                  lat,
                  lng,
                });
              }
            }
          }

          // Send raw location to backend even if not smoothed yet

          if (isOnlineRef.current) {
            const [lat, lng] = newLocation;

            const now = Date.now();

            const lastSentTime = window.lastLocationSentTime || 0;

            const timeSinceLastSend = now - lastSentTime;

            const locationPolicy = getLocationSendPolicy();
            if (timeSinceLastSend >= locationPolicy.sendIntervalMs) {
              if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                console.log(
                  "[UPLOAD] Sending raw location to backend (not smoothed yet):",
                  { lat, lng },
                );

                deliveryAPI
                  .updateLocation(lat, lng, true)

                  .then(() => {
                    window.lastLocationSentTime = now;

                    window.lastSentLocation = newLocation;

                    console.log(
                      "[OK] Raw location sent to backend successfully",
                    );
                  })

                  .catch((error) => {
                    if (
                      error.code !== "ERR_NETWORK" &&
                      error.message !== "Network Error"
                    ) {
                      console.error(
                        "[ERROR] Error sending raw location to backend:",
                        error,
                      );
                    }
                  });
              }
            }
          }

          return;
        }

        // ============================================

        // SMOOTH MARKER ANIMATION (NO INSTANT JUMPS)

        // ============================================

        const [smoothedLat, smoothedLng] = smoothedLocation;

        const newSmoothedLocation = { lat: smoothedLat, lng: smoothedLng };

        // Calculate heading

        let heading =
          position.coords.heading !== null &&
          position.coords.heading !== undefined
            ? position.coords.heading
            : null;

        if (heading === null && smoothedLocationRef.current) {
          const [prevLat, prevLng] = smoothedLocationRef.current;

          heading = calculateHeading(
            prevLat,
            prevLng,
            smoothedLat,
            smoothedLng,
          );
        }

        // Update refs

        lastValidLocationRef.current = smoothedLocation;

        lastLocationTimeRef.current = Date.now();

        smoothedLocationRef.current = smoothedLocation;

        // Update route history with smoothed location

        routeHistoryRef.current.push({
          lat: smoothedLat,

          lng: smoothedLng,
        });

        if (routeHistoryRef.current.length > 1000) {
          routeHistoryRef.current.shift();
        }

        // Save smoothed location to localStorage

        saveCachedDeliveryLocation(smoothedLocation);

        // Update live tracking polyline for any active route (pickup or delivery)

        const currentDirectionsResponse = directionsResponseRef.current;

        const activeOrder = selectedRestaurantRef.current;

        const orderStatus =
          activeOrder?.orderStatus || activeOrder?.status || "";

        const deliveryPhase =
          activeOrder?.deliveryPhase ||
          activeOrder?.deliveryState?.currentPhase ||
          "";

        const deliveryStateStatus = activeOrder?.deliveryState?.status || "";

        const isPickedUpPhase =
          orderStatus === "out_for_delivery" ||
          orderStatus === "picked_up" ||
          deliveryPhase === "en_route_to_delivery" ||
          deliveryPhase === "picked_up" ||
          deliveryStateStatus === "order_confirmed" ||
          deliveryStateStatus === "en_route_to_delivery";

        const hasCustomerLocation =
          activeOrder?.customerLat != null &&
          activeOrder?.customerLng != null &&
          Number.isFinite(Number(activeOrder.customerLat)) &&
          Number.isFinite(Number(activeOrder.customerLng)) &&
          !(
            Number(activeOrder.customerLat) === 0 &&
            Number(activeOrder.customerLng) === 0
          );

        const isRouteToCustomer =
          hasCustomerLocation &&
          isDirectionsRouteToLocation(
            currentDirectionsResponse,

            activeOrder?.customerLat,

            activeOrder?.customerLng,
          );

        if (isPickedUpPhase && hasCustomerLocation && !isRouteToCustomer) {
          if (liveTrackingPolylineRef.current) {
            liveTrackingPolylineRef.current.setMap(null);

            liveTrackingPolylineRef.current = null;
          }

          if (liveTrackingPolylineShadowRef.current) {
            liveTrackingPolylineShadowRef.current.setMap(null);

            liveTrackingPolylineShadowRef.current = null;
          }

          directionsResponseRef.current = null;
        } else if (
          currentDirectionsResponse &&
          currentDirectionsResponse.routes &&
          currentDirectionsResponse.routes.length > 0
        ) {
          updateLiveTrackingPolyline(
            currentDirectionsResponse,
            smoothedLocation,
          );
        }

        // ============================================

        // SMOOTH MARKER ANIMATION (1-2 seconds)

        // ============================================

        const displayLocation = resolveDisplayLocation(
          rawLocation,
          smoothedLocation,
          accuracy,
        );
        const [displayLat, displayLng] = displayLocation;

        // Update state with display location (closer to raw/live GPS)
        setRiderLocation(displayLocation);
        lastLocationRef.current = displayLocation;

        // Always update bike marker with latest smoothed location

        if (window.deliveryMapInstance) {
          if (bikeMarkerRef.current) {
            // Marker exists - animate smoothly to new position

            animateMarkerSmoothly(
              bikeMarkerRef.current,
              { lat: displayLat, lng: displayLng },
              700,
              markerAnimationRef,
            );
            updateBikeMarkerHeading(displayLat, displayLng, heading);
          } else {
            // Marker doesn't exist yet, create it immediately with correct location

            console.log("[LOC] Creating bike marker with display location:", {
              lat: displayLat,
              lng: displayLng,
            });

            createOrUpdateBikeMarker(
              displayLat,
              displayLng,
              heading,
              !isUserPanningRef.current,
            );
          }
        }

        // Update route polyline

        updateRoutePolyline();

        console.log("[LOC] Live location updated (smoothed):", {
          raw: { lat: latitude, lng: longitude },

          smoothed: { lat: smoothedLat, lng: smoothedLng },

          heading,

          accuracy: `${accuracy.toFixed(0)}m`,

          isOnline: isOnlineRef.current,

          timestamp: new Date().toISOString(),
        });

        // Send SMOOTHED location to backend if user is online (throttle to every 5 seconds)

        if (isOnlineRef.current && smoothedLocation) {
          const now = Date.now();

          const lastSentTime = window.lastLocationSentTime || 0;

          const timeSinceLastSend = now - lastSentTime;

          // Use smoothed location for backend (not raw GPS) - already declared above

          // Simple distance check using Haversine formula

          const calculateDistance = (lat1, lng1, lat2, lng2) => {
            const R = 6371; // Earth's radius in km

            const dLat = ((lat2 - lat1) * Math.PI) / 180;

            const dLng = ((lng2 - lng1) * Math.PI) / 180;

            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);

            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            return R * c;
          };

          // Get last sent location for distance check

          const lastSentLocation = window.lastSentLocation || null;

          const locationPolicy = getLocationSendPolicy();
          const shouldSend =
            timeSinceLastSend >= locationPolicy.sendIntervalMs ||
            (lastSentLocation &&
              calculateDistance(
                lastSentLocation[0],
                lastSentLocation[1],
                smoothedLat,
                smoothedLng,
              ) > locationPolicy.minDistanceKm);

          if (shouldSend) {
            // Final validation before sending to backend

            // Ensure coordinates are in correct format [lat, lng] and within valid ranges

            if (
              smoothedLat >= -90 &&
              smoothedLat <= 90 &&
              smoothedLng >= -180 &&
              smoothedLng <= 180
            ) {
              console.log("[UPLOAD] Sending smoothed location to backend:", {
                smoothed: { lat: smoothedLat, lng: smoothedLng },

                raw: { lat: latitude, lng: longitude },

                accuracy: `${accuracy.toFixed(0)}m`,

                timeSinceLastSend: `${(timeSinceLastSend / 1000).toFixed(1)}s`,
              });

              deliveryAPI
                .updateLocation(smoothedLat, smoothedLng, true)

                .then(() => {
                  window.lastLocationSentTime = now;

                  window.lastSentLocation = smoothedLocation; // Store last sent location

                  console.log(
                    "[OK] Smoothed location sent to backend successfully:",
                    {
                      latitude: smoothedLat,

                      longitude: smoothedLng,

                      format: "lat, lng (correct order)",

                      accuracy: `${accuracy.toFixed(0)}m`,
                    },
                  );
                })

                .catch((error) => {
                  // Only log non-network errors (backend might be down, which is expected in dev)

                  if (
                    error.code !== "ERR_NETWORK" &&
                    error.message !== "Network Error"
                  ) {
                    console.error(
                      "[ERROR] Error sending location to backend:",
                      error,
                    );
                  } else {
                    // Silently handle network errors - backend might not be running
                    // Socket.IO will handle reconnection automatically
                  }
                });
            } else {
              console.error(
                "[ERROR] Invalid smoothed coordinates - not sending to backend:",
                {
                  smoothedLat,

                  smoothedLng,

                  raw: { latitude, longitude },
                },
              );
            }
          }
        }
      },

      (error) => {
        console.warn("[WARN] Error watching location:", error);

        if (error?.code === 1) {
          handleLocationPermissionDenied();
        }
      },

      {
        enableHighAccuracy: true,

        maximumAge: 0, // Always use fresh location

        timeout: 10000,
      },
    );

    watchPositionIdRef.current = watchId;

    // Show bike marker immediately if we have last known location and map is ready

    if (
      window.deliveryMapInstance &&
      lastLocationRef.current &&
      lastLocationRef.current.length === 2
    ) {
      const [lat, lng] = lastLocationRef.current;

      // Get heading from route history if available

      let heading = null;

      if (routeHistoryRef.current.length > 1) {
        const prev =
          routeHistoryRef.current[routeHistoryRef.current.length - 2];

        heading = calculateHeading(prev.lat, prev.lng, lat, lng);
      }

      createOrUpdateBikeMarker(lat, lng, heading, !isUserPanningRef.current);
    }

    return () => {
      if (watchPositionIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchPositionIdRef.current);

        watchPositionIdRef.current = null;
      }
    };
  }, [isOnline, isDirectionsRouteToLocation, handleLocationPermissionDenied]); // Re-run when online status changes - this controls start/stop of tracking

  // Handle new order popup accept button swipe

  const scheduleNewOrderAcceptProgress = (progress) => {
    newOrderAcceptButtonPendingProgressRef.current = progress;
    if (newOrderAcceptButtonRafRef.current !== null) return;

    newOrderAcceptButtonRafRef.current = requestAnimationFrame(() => {
      newOrderAcceptButtonRafRef.current = null;
      const nextProgress = newOrderAcceptButtonPendingProgressRef.current;
      if (
        Math.abs(
          nextProgress - newOrderAcceptButtonRenderedProgressRef.current,
        ) < 0.008
      ) {
        return;
      }
      newOrderAcceptButtonRenderedProgressRef.current = nextProgress;
      setNewOrderAcceptButtonProgress(nextProgress);
    });
  };

  const resetNewOrderAcceptProgress = () => {
    if (newOrderAcceptButtonRafRef.current !== null) {
      cancelAnimationFrame(newOrderAcceptButtonRafRef.current);
      newOrderAcceptButtonRafRef.current = null;
    }
    newOrderAcceptButtonPendingProgressRef.current = 0;
    newOrderAcceptButtonRenderedProgressRef.current = 0;
    newOrderAcceptButtonProgressRef.current = 0;
    newOrderAcceptButtonMaxProgressRef.current = 0;
    setNewOrderAcceptButtonProgress(0);
  };

  const handleNewOrderAcceptTouchStart = (e) => {
    if (isAcceptingNewOrderRef.current) return;

    e.stopPropagation();

    newOrderAcceptButtonSwipeStartX.current = e.touches[0].clientX;

    newOrderAcceptButtonSwipeStartY.current = e.touches[0].clientY;

    newOrderAcceptButtonIsSwiping.current = false;
    resetNewOrderAcceptProgress();

    setNewOrderIsAnimatingToComplete(false);
  };

  const handleNewOrderAcceptTouchMove = (e) => {
    if (isAcceptingNewOrderRef.current) return;

    e.stopPropagation();

    const deltaX =
      e.touches[0].clientX - newOrderAcceptButtonSwipeStartX.current;

    const deltaY =
      e.touches[0].clientY - newOrderAcceptButtonSwipeStartY.current;

    // Smoother swipe detection: accept horizontal-first gestures even with slight vertical jitter.
    if (
      deltaX > DELIVERY_ACCEPT_SWIPE_START_THRESHOLD_PX &&
      (Math.abs(deltaX) > Math.abs(deltaY) * 0.45 || Math.abs(deltaY) < 24)
    ) {
      newOrderAcceptButtonIsSwiping.current = true;

      // Don't call preventDefault - CSS touch-action handles scrolling prevention

      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance

      const buttonWidth = newOrderAcceptButtonRef.current?.offsetWidth || 300;

      const circleWidth = 56; // w-14 = 56px

      const padding = 16; // px-4 = 16px

      const maxSwipe = buttonWidth - circleWidth - padding * 2;

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);

      newOrderAcceptButtonProgressRef.current = progress;
      newOrderAcceptButtonMaxProgressRef.current = Math.max(
        newOrderAcceptButtonMaxProgressRef.current,
        progress,
      );

      scheduleNewOrderAcceptProgress(progress);
    }
  };

  const handleNewOrderAcceptTouchEnd = (e) => {
    if (isAcceptingNewOrderRef.current) return;

    e.stopPropagation();

    if (!newOrderAcceptButtonIsSwiping.current) {
      resetNewOrderAcceptProgress();

      return;
    }

    const deltaX =
      e.changedTouches[0].clientX - newOrderAcceptButtonSwipeStartX.current;

    const buttonWidth = newOrderAcceptButtonRef.current?.offsetWidth || 300;

    const circleWidth = 56;

    const padding = 16;

    const maxSwipe = buttonWidth - circleWidth - padding * 2;

    const threshold = maxSwipe * DELIVERY_ACCEPT_SWIPE_CONFIRM_THRESHOLD;
    const finalProgress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
    const acceptedProgress = Math.max(
      finalProgress,
      newOrderAcceptButtonMaxProgressRef.current,
    );

    if (
      acceptedProgress >= DELIVERY_ACCEPT_SWIPE_CONFIRM_THRESHOLD &&
      deltaX >= DELIVERY_ACCEPT_MIN_TRAVEL_PX &&
      deltaX > threshold
    ) {
      setIsAcceptingNewOrder(true);

      // Stop audio immediately when user accepts

      stopNewOrderAlertSound("order accept swipe");

      // Animate to completion

      setNewOrderIsAnimatingToComplete(true);

      // Lock slider at completion and prevent a queued RAF from restoring
      // an older mid-swipe progress value.
      if (newOrderAcceptButtonRafRef.current !== null) {
        cancelAnimationFrame(newOrderAcceptButtonRafRef.current);
        newOrderAcceptButtonRafRef.current = null;
      }
      newOrderAcceptButtonPendingProgressRef.current = 1;
      newOrderAcceptButtonProgressRef.current = 1;
      newOrderAcceptButtonMaxProgressRef.current = 1;
      newOrderAcceptButtonRenderedProgressRef.current = 1;
      setNewOrderAcceptButtonProgress(1);

      // Accept order via backend API and get route

      const acceptOrderAndShowRoute = async () => {
        // Get order ID from selectedRestaurant or newOrder (define outside try-catch for error handling)

        const orderId =
          selectedRestaurant?.id ||
          selectedRestaurant?._id ||
          selectedRestaurant?.orderId ||
          newOrder?.orderMongoId ||
          newOrder?.mongoId ||
          newOrder?._id ||
          newOrder?.id ||
          newOrder?.orderId ||
          (() => {
            try {
              const raw = localStorage.getItem("deliveryActiveOrder");
              const parsed = raw ? JSON.parse(raw) : null;
              return (
                parsed?.orderId ||
                parsed?.restaurantInfo?.id ||
                parsed?.restaurantInfo?._id ||
                parsed?.restaurantInfo?.orderId ||
                null
              );
            } catch {
              return null;
            }
          })();
        const normalizedOrderId = normalizeOrderId(orderId);

        console.log("[LOOKUP] Order ID lookup:", {
          selectedRestaurantId: selectedRestaurant?.id,

          newOrderMongoId: newOrder?.orderMongoId,

          newOrderId: newOrder?.orderId,

          finalOrderId: orderId,
        });

        if (!orderId) {
          console.error("[ERROR] No order ID found to accept");

          toast.error("Order ID not found. Please try again.");
          setIsAcceptingNewOrder(false);

          return;
        }

        if (
          normalizedOrderId &&
          acceptingOrderIdsRef.current.has(normalizedOrderId)
        ) {
          setIsAcceptingNewOrder(false);

          return;
        }

        if (normalizedOrderId) {
          acceptingOrderIdsRef.current.add(normalizedOrderId);
        }

        // Declare currentLocation in outer scope so it's accessible in catch block

        let currentLocation = null;

        try {
          // Get current LIVE location (prioritize riderLocation which is updated in real-time)

          currentLocation = riderLocation;

          // If riderLocation is not available, try to get from lastLocationRef

          if (!currentLocation || currentLocation.length !== 2) {
            currentLocation = lastLocationRef.current;
          }

          // If still not available, skip extra GPS wait to keep accept fast.
          if (!currentLocation || currentLocation.length !== 2) {
            currentLocation = null;
            console.warn(
              "[WARN] No live rider location cached, accepting with backend fallback",
            );
          }

          if (!currentLocation || currentLocation.length !== 2) {
            console.warn(
              "[WARN] No valid live location in client, relying on backend fallback location",
            );
          }

          console.log("[ORDER] Accepting order:", orderId);

          console.log("[LOC] Current LIVE location:", currentLocation);

          console.log("[DETAILS] Order details:", {
            orderId: orderId,

            restaurantName:
              selectedRestaurant?.name || newOrder?.restaurantName,

            orderStatus: newOrder?.status,
          });

          // Call backend API to accept order

          // Backend expects currentLat and currentLng

          const response = await deliveryAPI.acceptOrder(
            orderId,
            currentLocation && currentLocation.length === 2
              ? {
                  lat: currentLocation[0], // latitude
                  lng: currentLocation[1], // longitude
                }
              : {},
          );

          console.log("[API] API Response:", response.data);

          if (response.data?.success && response.data.data) {
            // Stop audio immediately when order is successfully accepted

            stopNewOrderAlertSound("order accepted successfully");

            const orderData = response.data.data;

            const order = orderData.order || orderData; // Backend returns { order, route }

            const routeData = response.data.data.route;

            console.log("[OK] Order accepted successfully");

            console.log("[LOC] Route data:", routeData);

            console.log(
              "[DETAILS] Full order data from backend:",
              JSON.stringify(order, null, 2),
            );

            console.log("[STORE] Restaurant name from backend:", {
              restaurantName: order.restaurantName,

              restaurantIdName: order.restaurantId?.name,

              restaurantIdType: typeof order.restaurantId,

              restaurantId: order.restaurantId,
            });

            // Update selectedRestaurant with correct data from backend

            let restaurantInfo = null;

            if (order) {
              // Extract restaurant location with robust fallbacks

              // Priority: GeoJSON coordinates -> latitude/longitude fields

              const restaurantCoords =
                order.restaurantId?.location?.coordinates || [];

              const restaurantLatFromCoords = restaurantCoords[1]; // Latitude is second element in GeoJSON

              const restaurantLngFromCoords = restaurantCoords[0]; // Longitude is first element in GeoJSON

              const restaurantLatFromFields =
                order.restaurantId?.location?.latitude;

              const restaurantLngFromFields =
                order.restaurantId?.location?.longitude;

              const restaurantLat = Number.isFinite(
                Number(restaurantLatFromCoords),
              )
                ? Number(restaurantLatFromCoords)
                : Number.isFinite(Number(restaurantLatFromFields))
                  ? Number(restaurantLatFromFields)
                  : null;

              const restaurantLng = Number.isFinite(
                Number(restaurantLngFromCoords),
              )
                ? Number(restaurantLngFromCoords)
                : Number.isFinite(Number(restaurantLngFromFields))
                  ? Number(restaurantLngFromFields)
                  : null;

              // Format restaurant address - check multiple possible locations

              let restaurantAddress = "Restaurant Address";

              const restaurantLocation = order.restaurantId?.location;

              // Debug: Log order structure to understand data format

              console.log("[LOOKUP] Order structure for address extraction:", {
                hasRestaurantId: !!order.restaurantId,

                restaurantIdType: typeof order.restaurantId,

                restaurantIdKeys: order.restaurantId
                  ? Object.keys(order.restaurantId)
                  : [],

                hasLocation: !!restaurantLocation,

                locationKeys: restaurantLocation
                  ? Object.keys(restaurantLocation)
                  : [],

                restaurantIdAddress: order.restaurantId?.address,

                locationFormattedAddress: restaurantLocation?.formattedAddress,

                locationAddress: restaurantLocation?.address,

                locationStreet: restaurantLocation?.street,

                orderRestaurantAddress: order.restaurantAddress,
              });

              // Priority 1: location.formattedAddress from store saved location

              if (restaurantLocation?.formattedAddress) {
                restaurantAddress = restaurantLocation.formattedAddress;

                console.log(
                  "[OK] Using location.formattedAddress:",
                  restaurantAddress,
                );
              }

              // Priority 2: address from location
              else if (restaurantLocation?.address) {
                restaurantAddress = restaurantLocation.address;

                console.log("[OK] Using location.address:", restaurantAddress);
              }

              // Priority 3: Build from addressLine1 (with zone and pin code)
              else if (restaurantLocation?.addressLine1) {
                const addressParts = [
                  restaurantLocation.addressLine1,

                  restaurantLocation.addressLine2,

                  restaurantLocation.area, // Zone

                  restaurantLocation.city,

                  restaurantLocation.state,

                  restaurantLocation.pincode ||
                    restaurantLocation.zipCode ||
                    restaurantLocation.postalCode,
                ].filter(Boolean);

                restaurantAddress = addressParts.join(", ");

                console.log(
                  "[OK] Built address from addressLine1 with zone and pin:",
                  restaurantAddress,
                );
              }

              // Priority 4: Build from street components (with zone and pin code)
              else if (restaurantLocation?.street) {
                const addressParts = [
                  restaurantLocation.street,

                  restaurantLocation.area, // Zone

                  restaurantLocation.city,

                  restaurantLocation.state,

                  restaurantLocation.pincode ||
                    restaurantLocation.zipCode ||
                    restaurantLocation.postalCode,
                ].filter(Boolean);

                restaurantAddress = addressParts.join(", ");

                console.log(
                  "[OK] Built address from street components with zone and pin:",
                  restaurantAddress,
                );
              }

              // Priority 5: Check restaurantId directly for address fields
              else if (order.restaurantId?.address) {
                restaurantAddress = order.restaurantId.address;

                console.log(
                  "[OK] Using restaurantId.address:",
                  restaurantAddress,
                );
              }

              // Priority 6: Check restaurantId directly for address fields
              else if (order.restaurantId?.street || order.restaurantId?.city) {
                const addressParts = [
                  order.restaurantId.street,

                  order.restaurantId.area,

                  order.restaurantId.city,

                  order.restaurantId.state,

                  order.restaurantId.zipCode ||
                    order.restaurantId.pincode ||
                    order.restaurantId.postalCode,
                ].filter(Boolean);

                restaurantAddress = addressParts.join(", ");

                console.log(
                  "[OK] Built address from restaurantId fields:",
                  restaurantAddress,
                );
              }

              // Priority 7: Check order.restaurantAddress (if exists)
              else if (order.restaurantAddress) {
                restaurantAddress = order.restaurantAddress;

                console.log(
                  "[OK] Using order.restaurantAddress:",
                  restaurantAddress,
                );
              }

              // Priority 8: Use coordinates if address not available
              else if (restaurantLat && restaurantLng) {
                restaurantAddress = `${restaurantLat}, ${restaurantLng}`;

                console.log(
                  "[WARN] Using coordinates as address:",
                  restaurantAddress,
                );
              } else {
                console.warn(
                  "[WARN] Restaurant address not found in order, will try to fetch from restaurant API",
                );

                // Try to fetch restaurant address by ID if available

                const restaurantId = order.restaurantId;

                if (restaurantId) {
                  // Handle both string and object restaurantId

                  const restaurantIdString =
                    typeof restaurantId === "string"
                      ? restaurantId
                      : restaurantId._id ||
                        restaurantId.id ||
                        restaurantId.toString();

                  if (restaurantIdString) {
                    try {
                      console.log(
                        "[SYNC] Fetching restaurant address by ID:",
                        restaurantIdString,
                      );

                      const storeLookup =
                        await fetchStoreById(restaurantIdString);

                      if (storeLookup?.store) {
                        const restaurant = storeLookup.store;

                        const restLocation = restaurant.location;

                        console.log("[OK] Fetched restaurant data:", {
                          restaurant,
                          restLocation,
                        });

                        // Priority: location.formattedAddress (this is what user wants)

                        if (restLocation?.formattedAddress) {
                          restaurantAddress = restLocation.formattedAddress;

                          console.log(
                            "[OK] Fetched restaurant.location.formattedAddress:",
                            restaurantAddress,
                          );
                        } else if (restLocation?.address) {
                          restaurantAddress = restLocation.address;

                          console.log(
                            "[OK] Fetched restaurant.location.address:",
                            restaurantAddress,
                          );
                        } else if (restaurant.address) {
                          restaurantAddress = restaurant.address;

                          console.log(
                            "[OK] Fetched restaurant.address:",
                            restaurantAddress,
                          );
                        } else if (restLocation?.addressLine1) {
                          const addressParts = [
                            restLocation.addressLine1,

                            restLocation.addressLine2,

                            restLocation.area, // Zone

                            restLocation.city,

                            restLocation.state,

                            restLocation.pincode ||
                              restLocation.zipCode ||
                              restLocation.postalCode,
                          ].filter(Boolean);

                          restaurantAddress = addressParts.join(", ");

                          console.log(
                            "[OK] Built address from restaurant location addressLine1 with zone and pin:",
                            restaurantAddress,
                          );
                        } else if (restLocation?.street) {
                          const addressParts = [
                            restLocation.street,

                            restLocation.area, // Zone

                            restLocation.city,

                            restLocation.state,

                            restLocation.pincode ||
                              restLocation.zipCode ||
                              restLocation.postalCode,
                          ].filter(Boolean);

                          restaurantAddress = addressParts.join(", ");

                          console.log(
                            "[OK] Built address from restaurant location components with zone and pin:",
                            restaurantAddress,
                          );
                        }
                      }
                    } catch (restaurantError) {
                      console.error(
                        "[ERROR] Error fetching restaurant address:",
                        restaurantError,
                      );
                    }
                  }
                }

                if (restaurantAddress === "Restaurant Address") {
                  console.warn(
                    "[WARN] Restaurant address not found in any location, using default",
                  );
                }
              }

              // Extract restaurant name - priority: restaurantName field > restaurantId.name > fallback

              // Backend returns restaurantName as a direct field on order, and restaurantId is populated with name

              let restaurantName = null;

              // Priority 1: Direct restaurantName field from order (stored in Order model)

              if (
                order.restaurantName &&
                typeof order.restaurantName === "string" &&
                order.restaurantName.trim()
              ) {
                restaurantName = order.restaurantName.trim();

                console.log(
                  "[OK] Using restaurantName from order:",
                  restaurantName,
                );
              }

              // Priority 2: Name from populated restaurantId object
              else if (
                order.restaurantId &&
                typeof order.restaurantId === "object" &&
                order.restaurantId.name
              ) {
                restaurantName = order.restaurantId.name.trim();

                console.log("[OK] Using restaurantId.name:", restaurantName);
              }

              // Priority 3: Fallback to existing selectedRestaurant name
              else if (selectedRestaurant?.name) {
                restaurantName = selectedRestaurant.name;

                console.warn(
                  "[WARN] Restaurant name not found in order, using selectedRestaurant.name:",
                  restaurantName,
                );
              }

              // Final fallback
              else {
                restaurantName = "Restaurant";

                console.error(
                  "[ERROR] Restaurant name not found anywhere, using default:",
                  restaurantName,
                );
              }

              console.log(
                "[STORE] Final extracted restaurant name:",
                restaurantName,
              );

              // Extract earnings from backend response

              const backendEarnings =
                orderData.estimatedEarnings ||
                response.data.data.estimatedEarnings;

              const earningsValue = backendEarnings
                ? typeof backendEarnings === "object"
                  ? backendEarnings.totalEarning
                  : backendEarnings
                : selectedRestaurant?.estimatedEarnings || 0;

              console.log("[MONEY] Earnings from backend:", {
                backendEarnings,

                earningsValue,

                orderDataEarnings: orderData.estimatedEarnings,

                responseEarnings: response.data.data.estimatedEarnings,
              });

              const customerCoords = extractCustomerCoordsFromOrder(order);

              restaurantInfo = {
                id: order._id || order.orderId,

                orderId: order.orderId, // Correct order ID from backend

                name: restaurantName, // Restaurant name from backend (priority: restaurantName > restaurantId.name)

                address: normalizeAddressLabel(
                  restaurantAddress,
                  "Restaurant address not available",
                ), // Restaurant address from backend

                lat: restaurantLat ?? selectedRestaurant?.lat,

                lng: restaurantLng ?? selectedRestaurant?.lng,

                distance: selectedRestaurant?.distance || "0 km",

                timeAway: selectedRestaurant?.timeAway || "0 mins",

                dropDistance: selectedRestaurant?.dropDistance || "0 km",

                pickupDistance: selectedRestaurant?.pickupDistance || "0 km",

                estimatedEarnings:
                  backendEarnings || selectedRestaurant?.estimatedEarnings || 0,

                amount: earningsValue, // Also set amount for compatibility

                customerName:
                  order.userId?.name || selectedRestaurant?.customerName,
                customerPhone:
                  order.userId?.phone ||
                  selectedRestaurant?.customerPhone ||
                  null,

                customerAddress:
                  order.address?.formattedAddress ||
                  (order.address?.street
                    ? `${order.address.street}, ${order.address.city || ""}, ${order.address.state || ""}`.trim()
                    : "") ||
                  selectedRestaurant?.customerAddress,

                customerLat:
                  customerCoords?.lat ?? selectedRestaurant?.customerLat,

                customerLng:
                  customerCoords?.lng ?? selectedRestaurant?.customerLng,

                items: order.items || [],

                total: order.pricing?.total || 0,

                paymentMethod:
                  order.paymentMethod ?? order.payment?.method ?? "razorpay", // backend-resolved first (COD vs Online)

                phone:
                  order.restaurantId?.phone ||
                  order.restaurantId?.ownerPhone ||
                  null, // Restaurant phone number (prefer phone, fallback to ownerPhone)

                ownerPhone: order.restaurantId?.ownerPhone || null, // Owner phone number (separate field for direct access)

                orderStatus: order.status || "preparing", // Store order status (pending, preparing, ready, out_for_delivery, delivered)

                deliveryState: {
                  ...(order.deliveryState || {}),

                  currentPhase: "en_route_to_pickup", // CRITICAL: Set to en_route_to_pickup after order acceptance

                  status: "accepted", // Set status to accepted
                }, // Store delivery state (currentPhase, status, etc.)

                deliveryPhase: "en_route_to_pickup", // CRITICAL: Set to en_route_to_pickup after order acceptance so Reached Pickup popup can show
              };

              const currentActiveOrder =
                selectedRestaurantRef.current || selectedRestaurant;
              const currentActiveOrderId =
                getQueuedOrderIdentity(currentActiveOrder);
              const acceptedOrderId = getQueuedOrderIdentity(restaurantInfo);
              const shouldKeepAsAdvanceOrder =
                Boolean(currentActiveOrderId) &&
                Boolean(acceptedOrderId) &&
                String(currentActiveOrderId) !== String(acceptedOrderId);

              if (shouldKeepAsAdvanceOrder) {
                enqueueAcceptedAdvanceOrder({
                  ...restaurantInfo,
                  advanceAccepted: true,
                  advanceQueueState: "accepted",
                  advanceAcceptedAt: new Date().toISOString(),
                });
                setShowNewOrderPopup(false);
                setIsNewOrderPopupMinimized(false);
                setNewOrderDragY(0);
                setPreviewAdvanceOrder(null);
                restoreCurrentOrderFlowPopup();
                toast.success(
                  "Advance order accepted. It will start right after the current delivery.",
                );
                markOrderAsAccepted(
                  restaurantInfo?.id,
                  restaurantInfo?.orderId,
                  newOrder?.orderMongoId,
                  newOrder?.orderId,
                );
                suppressOrderNotifications(
                  restaurantInfo?.id,
                  restaurantInfo?.orderId,
                  newOrder?.orderMongoId,
                  newOrder?.orderId,
                );
                clearNewOrder();
                return;
              } else {
                console.log(
                  "[STORE] Updated restaurant info from backend:",
                  restaurantInfo,
                );

                // Update state immediately

                setSelectedRestaurant(restaurantInfo);
              }
            }

            // Ensure we have restaurantInfo before proceeding

            if (!restaurantInfo) {
              console.error(
                "[ERROR] Restaurant info not available, cannot proceed",
              );

              return;
            }

            let routeCoordinates = null;

            let directionsResultForMap = null; // Store directions result for main map rendering

            // Use route from backend if available (for fallback/polyline)

            if (
              routeData &&
              routeData.coordinates &&
              routeData.coordinates.length > 0
            ) {
              // Backend returns coordinates as [[lat, lng], ...]

              routeCoordinates = routeData.coordinates;

              setRoutePolyline(routeCoordinates);

              // Render backend pickup route immediately as fallback while Directions/GPS settle.
              try {
                updateRoutePolyline(routeCoordinates);
              } catch (polylineFallbackError) {
                console.warn(
                  "[WARN] Could not render fallback pickup polyline:",
                  polylineFallbackError,
                );
              }
            }

            // Calculate route using Google Maps Directions API (Zomato-style road-based routing)

            // Use LIVE location from delivery boy to restaurant

            // Use restaurantInfo directly (not selectedRestaurant) since state update is async

            const hasValidRestaurantCoords =
              Number.isFinite(Number(restaurantInfo?.lat)) &&
              Number.isFinite(Number(restaurantInfo?.lng));

            const riderPositionForPickupRoute =
              Array.isArray(currentLocation) &&
              currentLocation.length === 2 &&
              Number.isFinite(Number(currentLocation[0])) &&
              Number.isFinite(Number(currentLocation[1]))
                ? [Number(currentLocation[0]), Number(currentLocation[1])]
                : Array.isArray(riderLocation) &&
                    riderLocation.length === 2 &&
                    Number.isFinite(Number(riderLocation[0])) &&
                    Number.isFinite(Number(riderLocation[1]))
                  ? [Number(riderLocation[0]), Number(riderLocation[1])]
                  : Array.isArray(lastLocationRef.current) &&
                      lastLocationRef.current.length === 2 &&
                      Number.isFinite(Number(lastLocationRef.current[0])) &&
                      Number.isFinite(Number(lastLocationRef.current[1]))
                    ? [
                        Number(lastLocationRef.current[0]),
                        Number(lastLocationRef.current[1]),
                      ]
                    : null;

            if (hasValidRestaurantCoords && riderPositionForPickupRoute) {
              console.log(
                "[MAP] Calculating route with Google Maps Directions API...",
              );

              try {
                // Calculate route immediately with current live location

                const directionsResult = await calculateRouteWithDirectionsAPI(
                  riderPositionForPickupRoute, // Delivery boy's current live location

                  { lat: restaurantInfo.lat, lng: restaurantInfo.lng }, // Restaurant location
                );

                if (directionsResult) {
                  // Store pickup route distance and time

                  const pickupDistance =
                    directionsResult.routes[0]?.legs[0]?.distance?.value || 0; // in meters

                  const pickupDuration =
                    directionsResult.routes[0]?.legs[0]?.duration?.value || 0; // in seconds

                  pickupRouteDistanceRef.current = pickupDistance;

                  pickupRouteTimeRef.current = pickupDuration;

                  // Store directions result for rendering on main map

                  setDirectionsResponse(directionsResult);

                  directionsResponseRef.current = directionsResult; // Store in ref for callbacks

                  directionsResultForMap = directionsResult; // Store for use in setTimeout

                  // Initialize live tracking polyline with full route (Delivery Boy -> Restaurant)

                  if (riderPositionForPickupRoute) {
                    // Ensure map is ready before updating polyline

                    if (window.deliveryMapInstance) {
                      updateLiveTrackingPolyline(
                        directionsResult,
                        riderPositionForPickupRoute,
                      );
                    } else {
                      // Wait for map to be ready

                      setTimeout(() => {
                        if (
                          window.deliveryMapInstance &&
                          riderPositionForPickupRoute
                        ) {
                          updateLiveTrackingPolyline(
                            directionsResult,
                            riderPositionForPickupRoute,
                          );
                        }
                      }, 500);
                    }
                  }
                } else {
                  // Fallback: Use backend route or OSRM

                  if (!routeCoordinates || routeCoordinates.length === 0) {
                    try {
                      const url = `https://router.project-osrm.org/route/v1/driving/${currentLocation[1]},${currentLocation[0]};${restaurantInfo.lng},${restaurantInfo.lat}?overview=full&geometries=geojson`;

                      const osrmResponse = await fetch(url);

                      const osrmData = await osrmResponse.json();

                      if (
                        osrmData.code === "Ok" &&
                        osrmData.routes &&
                        osrmData.routes.length > 0
                      ) {
                        routeCoordinates =
                          osrmData.routes[0].geometry.coordinates.map(
                            (coord) => [coord[1], coord[0]],
                          );

                        setRoutePolyline(routeCoordinates);
                      } else {
                        setRoutePolyline([]);
                      }
                    } catch (osrmError) {
                      console.error(
                        "[ERROR] Error calculating route with OSRM:",
                        osrmError,
                      );

                      setRoutePolyline([]);
                    }
                  }
                }
              } catch (directionsError) {
                // Handle REQUEST_DENIED gracefully (billing/API key issue)

                if (
                  directionsError.message?.includes("REQUEST_DENIED") ||
                  directionsError.message?.includes("not available")
                ) {
                  console.warn(
                    "[WARN] Google Maps Directions API not available (billing/API key issue). Using fallback route.",
                  );
                } else {
                  console.error(
                    "[ERROR] Error calculating route with Directions API:",
                    directionsError,
                  );
                }

                // Fallback to OSRM only (do not draw direct straight line)

                if (!routeCoordinates || routeCoordinates.length === 0) {
                  try {
                    // Try OSRM first

                    const url = `https://router.project-osrm.org/route/v1/driving/${currentLocation[1]},${currentLocation[0]};${restaurantInfo.lng},${restaurantInfo.lat}?overview=full&geometries=geojson`;

                    const osrmResponse = await fetch(url);

                    const osrmData = await osrmResponse.json();

                    if (
                      osrmData.code === "Ok" &&
                      osrmData.routes &&
                      osrmData.routes.length > 0
                    ) {
                      routeCoordinates =
                        osrmData.routes[0].geometry.coordinates.map((coord) => [
                          coord[1],
                          coord[0],
                        ]);

                      setRoutePolyline(routeCoordinates);

                      console.log(
                        "[OK] Route calculated with OSRM fallback:",
                        routeCoordinates.length,
                        "points",
                      );
                    } else {
                      console.warn(
                        "[WARN] OSRM fallback returned no route, skipping straight-line fallback",
                      );

                      setRoutePolyline([]);
                    }
                  } catch (osrmError) {
                    console.warn(
                      "[WARN] OSRM fallback failed, skipping straight-line fallback",
                    );

                    setRoutePolyline([]);
                  }
                }
              }
            } else {
              console.error(
                "[ERROR] Cannot calculate route: missing restaurant info or location",
                {
                  restaurantInfo: !!restaurantInfo,

                  restaurantLat: restaurantInfo?.lat,

                  restaurantLng: restaurantInfo?.lng,

                  currentLocation: !!currentLocation,
                },
              );
            }

            // Close popup and show route on main map (not full-screen directions map)

            setShowNewOrderPopup(false);

            // CRITICAL: Clear newOrder notification immediately to prevent duplicate notifications

            markOrderAsAccepted(
              restaurantInfo?.id,

              restaurantInfo?.orderId,

              newOrder?.orderMongoId,

              newOrder?.orderId,
            );

            console.log("[OK] Added order to accepted list:", {
              ids: [
                restaurantInfo?.id,
                restaurantInfo?.orderId,
                newOrder?.orderMongoId,
                newOrder?.orderId,
              ].filter(Boolean),
            });

            suppressOrderNotifications(
              restaurantInfo?.id,

              restaurantInfo?.orderId,

              newOrder?.orderMongoId,

              newOrder?.orderId,
            );

            clearNewOrder();

            // Ensure route path is visible

            setShowRoutePath(true);

            // Show Reached Pickup popup immediately after order acceptance (no distance check)

            // But only if order is not already delivered

            setTimeout(() => {
              restoreCurrentOrderFlowPopup();

              // Close directions map if open

              setShowDirectionsMap(false);
            }, 500); // Wait 500ms for state to update

            // Show route on main map instead of opening full-screen directions map

            setTimeout(() => {
              // Show route on main map using DirectionsRenderer or polyline

              if (window.deliveryMapInstance && restaurantInfo) {
                // Use DirectionsRenderer on main map if we have directions result

                // Use directionsResponse state (which was set above) instead of local variable

                const directionsResult =
                  directionsResultForMap ||
                  (directionsResponse &&
                  directionsResponse.routes &&
                  directionsResponse.routes.length > 0
                    ? directionsResponse
                    : null);

                if (
                  directionsResult &&
                  directionsResult.routes &&
                  directionsResult.routes.length > 0
                ) {
                  // Initialize DirectionsRenderer for main map if not exists

                  // Don't create DirectionsRenderer - it adds dots

                  // We'll extract route path and use custom polyline instead

                  if (!directionsRendererRef.current) {
                    // Create DirectionsRenderer but don't set it on map (only for extracting route data)

                    directionsRendererRef.current =
                      new window.google.maps.DirectionsRenderer({
                        suppressMarkers: true,

                        suppressInfoWindows: false,

                        polylineOptions: {
                          strokeColor: "#4285F4",

                          strokeWeight: 0,

                          strokeOpacity: 0,

                          zIndex: -1,

                          icons: [],
                        },

                        preserveViewport: true,
                      });

                    // Explicitly don't set map - we use custom polyline instead
                  }

                  // Extract route path directly from directionsResult (don't use DirectionsRenderer - it adds dots)

                  try {
                    // Validate directionsResult is a valid DirectionsResult object

                    if (
                      !directionsResult ||
                      typeof directionsResult !== "object" ||
                      !directionsResult.routes ||
                      !Array.isArray(directionsResult.routes) ||
                      directionsResult.routes.length === 0
                    ) {
                      console.error(
                        "[ERROR] Invalid directionsResult:",
                        directionsResult,
                      );

                      return;
                    }

                    // Validate it's a Google Maps DirectionsResult (has request and legs)

                    if (
                      !directionsResult.request ||
                      !directionsResult.routes[0]?.legs ||
                      !Array.isArray(directionsResult.routes[0].legs)
                    ) {
                      console.error(
                        "[ERROR] directionsResult is not a valid Google Maps DirectionsResult",
                      );

                      return;
                    }

                    console.log("[LOC] Route details:", {
                      routes: directionsResult.routes?.length || 0,

                      legs: directionsResult.routes?.[0]?.legs?.length || 0,

                      distance:
                        directionsResult.routes?.[0]?.legs?.[0]?.distance?.text,

                      duration:
                        directionsResult.routes?.[0]?.legs?.[0]?.duration?.text,
                    });

                    // Don't create main route polyline - only live tracking polyline will be shown

                    // Remove old custom polyline if exists (cleanup)

                    try {
                      if (routePolylineRef.current) {
                        routePolylineRef.current.setMap(null);

                        routePolylineRef.current = null;
                      }

                      // Completely remove DirectionsRenderer from map to prevent any dots/icons

                      if (directionsRendererRef.current) {
                        directionsRendererRef.current.setMap(null);
                      }
                    } catch (e) {
                      console.warn("[WARN] Error cleaning up polyline:", e);
                    }

                    // Fit bounds to show entire route - but preserve zoom if user has zoomed in

                    const bounds = directionsResult.routes[0].bounds;

                    if (bounds) {
                      const currentZoom = window.deliveryMapInstance.getZoom();

                      if (isBoundsReasonable(bounds)) {
                        window.deliveryMapInstance.fitBounds(bounds, {
                          padding: 100,
                        });
                      } else {
                        console.warn(
                          "Skipping unsafe fitBounds on delivery map",
                          bounds,
                        );
                      }

                      // Restore zoom if user had zoomed in more than fitBounds would set

                      setTimeout(() => {
                        const newZoom = window.deliveryMapInstance.getZoom();

                        if (currentZoom > newZoom && currentZoom >= 18) {
                          window.deliveryMapInstance.setZoom(currentZoom);
                        }
                      }, 100);
                    }
                  } catch (error) {
                    console.error(
                      "[ERROR] Error extracting route path:",
                      error,
                    );

                    console.error(
                      "[ERROR] directionsResult type:",
                      typeof directionsResult,
                    );

                    console.error(
                      "[ERROR] directionsResult:",
                      directionsResult,
                    );
                  }
                } else if (routeCoordinates && routeCoordinates.length > 0) {
                  // Fallback: Use polyline if Directions API result not available

                  // setRoutePolyline will trigger useEffect that calls updateRoutePolyline

                  setRoutePolyline(routeCoordinates);
                } else {
                }

                // Add restaurant marker to main map

                if (restaurantInfo.lat && restaurantInfo.lng) {
                  const restaurantLocation = {
                    lat: restaurantInfo.lat,

                    lng: restaurantInfo.lng,
                  };

                  // Remove old restaurant marker if exists

                  if (restaurantMarkerRef.current) {
                    restaurantMarkerRef.current.setMap(null);
                  }

                  // Create restaurant marker on main map with kitchen icon

                  restaurantMarkerRef.current = new window.google.maps.Marker({
                    position: restaurantLocation,

                    map: window.deliveryMapInstance,

                    icon: {
                      url:
                        "data:image/svg+xml;charset=UTF-8," +
                        encodeURIComponent(`


                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">


                          <circle cx="12" cy="12" r="11" fill="#FF6B35" stroke="#FFFFFF" stroke-width="2"/>


                          <path d="M8 10c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v6H8v-6z" fill="#FFFFFF"/>


                          <path d="M7 16h10M10 12h4M9 14h6" stroke="#FF6B35" stroke-width="1.5" stroke-linecap="round"/>


                          <path d="M10 8h4v2h-4z" fill="#FFFFFF" opacity="0.7"/>


                        </svg>


                      `),

                      scaledSize: new window.google.maps.Size(48, 48),

                      anchor: new window.google.maps.Point(24, 48),
                    },

                    title: restaurantInfo.name || "Kitchen",

                    animation: window.google.maps.Animation.DROP,

                    zIndex: 10,
                  });
                }
              } else {
              }

              // Save accepted order to localStorage for refresh handling

              try {
                const activeOrderData = {
                  orderId: restaurantInfo.id || restaurantInfo.orderId,

                  restaurantInfo: restaurantInfo,

                  // Don't save directionsResponse - Google Maps objects can't be serialized to JSON

                  // Route will be recalculated on restore using Directions API

                  routeCoordinates: routeCoordinates, // Save coordinates for fallback polyline

                  acceptedAt: new Date().toISOString(),

                  hasDirectionsAPI: !!directionsResultForMap, // Flag to indicate we should recalculate with Directions API
                  billImageUrl: billImageUrl || null,
                  billImageUploaded: Boolean(billImageUploaded),
                  progress: {
                    billImageUrl: billImageUrl || null,
                    billImageUploaded: Boolean(billImageUploaded),
                    showreachedPickupPopup: false,
                    showOrderIdConfirmationPopup: false,
                    showReachedDropPopup: false,
                    showOrderDeliveredAnimation: false,
                  },
                };

                localStorage.setItem(
                  "deliveryActiveOrder",
                  JSON.stringify(activeOrderData),
                );
              } catch (storageError) {
                console.error(
                  "[ERROR] Error saving active order to localStorage:",
                  storageError,
                );
              }

              // Don't show Reached Pickup popup here - it will be shown when order becomes ready via WebSocket

              // The popup will be triggered by orderReady event from backend
            }, 300); // Wait for popup close animation
          } else {
            console.error("[ERROR] Failed to accept order:", response.data);

            // Show error message to user

            toast.error(
              response.data?.message ||
                "Failed to accept order. Please try again.",
            );

            setShowreachedPickupPopup(false);
            setShowNewOrderPopup(true);
            setIsNewOrderPopupMinimized(false);
            setNewOrderDragY(0);
          }
        } catch (error) {
          console.error("[ERROR] Error accepting order:", error);

          console.error("[ERROR] Error details:", {
            message: error.message,

            response: error.response?.data,

            status: error.response?.status,

            orderId: orderId || "unknown",

            code: error.code,

            isNetworkError: error.code === "ERR_NETWORK",

            currentLocation:
              currentLocation && currentLocation.length === 2
                ? "available"
                : "not available",
          });

          if (isCancelledConflictError(error)) {
            handleCancelledOrderConflict(
              error,
              "Order was cancelled before it could be accepted.",
            );

            return;
          }

          const conflictStatus = error?.response?.status;

          const conflictMessage = String(
            error?.response?.data?.message || "",
          ).toLowerCase();

          if (
            conflictStatus === 409 &&
            (conflictMessage.includes("accepted by another") ||
              conflictMessage.includes("no longer available"))
          ) {
            markOrderAsUnavailable(
              orderId,
              newOrder?.orderMongoId,
              newOrder?.orderId,
            );

            clearNewOrder();
            setShowreachedPickupPopup(false);
            setShowNewOrderPopup(false);
          }

          // Log full error response for debugging

          if (error.response?.data) {
            console.error(
              "[ERROR] Backend error response:",
              JSON.stringify(error.response.data, null, 2),
            );
          }

          // Show user-friendly error message

          let errorMessage = "Failed to accept order. Please try again.";

          if (error.code === "ERR_NETWORK") {
            errorMessage =
              "Network error. Please check your internet connection and try again.";
          } else if (error.response?.data?.message) {
            errorMessage = error.response.data.message;

            // Also log the full error if available

            if (error.response.data.error) {
              console.error(
                "[ERROR] Backend error details:",
                error.response.data.error,
              );
            }
          } else if (error.message) {
            errorMessage = error.message;
          }

          toast.error(errorMessage);

          if (
            !(
              conflictStatus === 409 &&
              (conflictMessage.includes("accepted by another") ||
                conflictMessage.includes("no longer available"))
            )
          ) {
            setShowreachedPickupPopup(false);
            setShowNewOrderPopup(true);
            setIsNewOrderPopupMinimized(false);
            setNewOrderDragY(0);
          }
        } finally {
          if (normalizedOrderId) {
            acceptingOrderIdsRef.current.delete(normalizedOrderId);
          }

          // Reset after animation

          setTimeout(() => {
            setNewOrderAcceptButtonProgress(0);

            setNewOrderIsAnimatingToComplete(false);
            setIsAcceptingNewOrder(false);
          }, 500);
        }
      };

      // Start accepting order

      acceptOrderAndShowRoute();
    } else {
      // Reset smoothly

      resetNewOrderAcceptProgress();
    }

    newOrderAcceptButtonSwipeStartX.current = 0;

    newOrderAcceptButtonSwipeStartY.current = 0;

    newOrderAcceptButtonIsSwiping.current = false;
  };

  const handleNewOrderAcceptTouchCancel = (e) => {
    if (isAcceptingNewOrderRef.current) return;
    e.stopPropagation();
    newOrderAcceptButtonSwipeStartX.current = 0;
    newOrderAcceptButtonSwipeStartY.current = 0;
    newOrderAcceptButtonIsSwiping.current = false;
    setNewOrderIsAnimatingToComplete(false);
    resetNewOrderAcceptProgress();
  };

  const detachNewOrderAcceptMouseListeners = () => {
    document.removeEventListener("mousemove", handleNewOrderAcceptMouseMove);
    document.removeEventListener("mouseup", handleNewOrderAcceptMouseUp);
  };

  const handleNewOrderAcceptMouseDown = (e) => {
    if (isAcceptingNewOrderRef.current) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    newOrderAcceptButtonSwipeStartX.current = e.clientX;
    newOrderAcceptButtonSwipeStartY.current = e.clientY;
    newOrderAcceptButtonIsSwiping.current = false;
    resetNewOrderAcceptProgress();
    setNewOrderIsAnimatingToComplete(false);
    isDraggingNewOrderAcceptButtonRef.current = true;
    document.addEventListener("mousemove", handleNewOrderAcceptMouseMove);
    document.addEventListener("mouseup", handleNewOrderAcceptMouseUp);
  };
  const handleNewOrderAcceptMouseMove = (e) => {
    if (!isDraggingNewOrderAcceptButtonRef.current) return;
    if (isAcceptingNewOrderRef.current) return;
    const deltaX = e.clientX - newOrderAcceptButtonSwipeStartX.current;
    const deltaY = e.clientY - newOrderAcceptButtonSwipeStartY.current;
    if (
      deltaX > DELIVERY_ACCEPT_SWIPE_START_THRESHOLD_PX &&
      (Math.abs(deltaX) > Math.abs(deltaY) * 0.45 || Math.abs(deltaY) < 24)
    ) {
      newOrderAcceptButtonIsSwiping.current = true;
      const buttonWidth = newOrderAcceptButtonRef.current?.offsetWidth || 300;
      const circleWidth = 56;
      const padding = 16;
      const maxSwipe = buttonWidth - circleWidth - padding * 2;
      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
      newOrderAcceptButtonProgressRef.current = progress;
      newOrderAcceptButtonMaxProgressRef.current = Math.max(
        newOrderAcceptButtonMaxProgressRef.current,
        progress,
      );
      scheduleNewOrderAcceptProgress(progress);
    }
  };
  const handleNewOrderAcceptMouseUp = (e) => {
    if (!isDraggingNewOrderAcceptButtonRef.current) return;
    isDraggingNewOrderAcceptButtonRef.current = false;
    detachNewOrderAcceptMouseListeners();
    handleNewOrderAcceptTouchEnd({
      stopPropagation: () => {},
      changedTouches: [
        {
          clientX: e.clientX,
          clientY: e.clientY,
        },
      ],
    });
  };
  useEffect(() => {
    return () => {
      detachNewOrderAcceptMouseListeners();
    };
  }, []);

  // Handle new order popup swipe down to minimize (not close)

  // Popup should stay visible until accept/reject is clicked

  const handleNewOrderPopupTouchStart = (e) => {
    // Allow touch start from anywhere when minimized (for swipe up from handle)

    if (isNewOrderPopupMinimized) {
      e.stopPropagation();

      newOrderSwipeStartY.current = e.touches[0].clientY;

      newOrderIsSwiping.current = true;

      setIsDraggingNewOrderPopup(true);

      return;
    }

    // When visible, only allow swipe from top handle area

    const target = e.target;

    const rect = newOrderPopupRef.current?.getBoundingClientRect();

    if (!rect) return;

    const touchY = e.touches[0].clientY;

    const handleArea = rect.top + 100; // Top 100px is swipeable area

    if (touchY <= handleArea) {
      e.stopPropagation();

      newOrderSwipeStartY.current = touchY;

      newOrderIsSwiping.current = true;

      setIsDraggingNewOrderPopup(true);
    }
  };

  const handleNewOrderPopupTouchMove = (e) => {
    if (!newOrderIsSwiping.current) return;

    const currentY = e.touches[0].clientY;

    const deltaY = currentY - newOrderSwipeStartY.current;

    const popupHeight = newOrderPopupRef.current?.offsetHeight || 600;

    e.stopPropagation();

    if (isNewOrderPopupMinimized) {
      // Currently minimized - swiping up (negative deltaY) should restore

      if (deltaY < 0) {
        // Calculate new position: start from popupHeight, subtract the upward swipe distance

        const newPosition = popupHeight + deltaY; // deltaY is negative, so this reduces the position

        setNewOrderDragY(Math.max(0, newPosition)); // Don't go above 0 (fully visible)
      }
    } else {
      // Currently visible - swiping down (positive deltaY) should minimize

      if (deltaY > 0) {
        setNewOrderDragY(deltaY); // Direct deltaY, will be clamped to popupHeight in touchEnd
      }
    }
  };

  const handleNewOrderPopupTouchEnd = (e) => {
    if (!newOrderIsSwiping.current) {
      newOrderIsSwiping.current = false;

      setIsDraggingNewOrderPopup(false);

      return;
    }

    e.stopPropagation();

    const deltaY = e.changedTouches[0].clientY - newOrderSwipeStartY.current;

    const threshold = 100;

    const popupHeight = newOrderPopupRef.current?.offsetHeight || 600;

    if (isNewOrderPopupMinimized) {
      // Currently minimized - check if swiping up enough to restore

      if (deltaY < -threshold) {
        // Swipe up enough - restore popup

        setIsNewOrderPopupMinimized(false);

        setNewOrderDragY(0);
      } else {
        // Not enough swipe - keep minimized

        setIsNewOrderPopupMinimized(true);

        setNewOrderDragY(popupHeight);

        // Delay stopping drag to allow position to be set

        setTimeout(() => {
          setIsDraggingNewOrderPopup(false);
        }, 10);
      }
    } else {
      // Currently visible - check if swiping down enough to minimize

      if (deltaY > threshold) {
        // Swipe down enough - minimize popup (but don't close)

        // Set dragY first to current position

        setNewOrderDragY(deltaY);

        // Then set minimized state and update dragY to full height

        setIsNewOrderPopupMinimized(true);

        // Use requestAnimationFrame to ensure state updates are batched

        requestAnimationFrame(() => {
          setNewOrderDragY(popupHeight);

          // Stop dragging after state is set

          setTimeout(() => {
            setIsDraggingNewOrderPopup(false);
          }, 50);
        });
      } else {
        // Not enough swipe - restore to visible (snap back)

        setIsNewOrderPopupMinimized(false);

        setNewOrderDragY(0);

        setIsDraggingNewOrderPopup(false);
      }
    }

    newOrderIsSwiping.current = false;

    newOrderSwipeStartY.current = 0;
  };

  // Handle Reached Pickup button swipe

  const handlereachedPickupTouchStart = (e) => {
    if (isOrderCancelledState(selectedRestaurant)) {
      handleCancelledOrderConflict(null, "Order was cancelled by user.");

      return;
    }

    reachedPickupSwipeStartX.current = e.touches[0].clientX;

    reachedPickupSwipeStartY.current = e.touches[0].clientY;

    reachedPickupIsSwiping.current = false;
    reachedPickupMaxProgressRef.current = 0;

    setreachedPickupIsAnimatingToComplete(false);

    setreachedPickupButtonProgress(0);
  };

  const handlereachedPickupTouchMove = (e) => {
    const deltaX = e.touches[0].clientX - reachedPickupSwipeStartX.current;

    const deltaY = e.touches[0].clientY - reachedPickupSwipeStartY.current;

    // Only handle horizontal swipes (swipe right)

    if (
      deltaX > DELIVERY_SWIPE_START_THRESHOLD_PX &&
      (Math.abs(deltaX) > Math.abs(deltaY) * 0.45 || Math.abs(deltaY) < 24)
    ) {
      reachedPickupIsSwiping.current = true;

      // Don't call preventDefault - CSS touch-action handles scrolling prevention

      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance

      const buttonWidth = reachedPickupButtonRef.current?.offsetWidth || 300;

      const circleWidth = 56; // w-14 = 56px

      const padding = 16; // px-4 = 16px

      const maxSwipe = buttonWidth - circleWidth - padding * 2;

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
      reachedPickupMaxProgressRef.current = Math.max(
        reachedPickupMaxProgressRef.current,
        progress,
      );
      setreachedPickupButtonProgress(progress);
    }
  };

  const handlereachedPickupTouchEnd = (e) => {
    if (isOrderCancelledState(selectedRestaurant)) {
      setreachedPickupButtonProgress(0);

      handleCancelledOrderConflict(null, "Order was cancelled by user.");

      return;
    }

    if (!reachedPickupIsSwiping.current) {
      setreachedPickupButtonProgress(0);

      return;
    }

    const deltaX =
      e.changedTouches[0].clientX - reachedPickupSwipeStartX.current;

    const buttonWidth = reachedPickupButtonRef.current?.offsetWidth || 300;

    const circleWidth = 56;

    const padding = 16;

    const maxSwipe = buttonWidth - circleWidth - padding * 2;

    const threshold = maxSwipe * DELIVERY_SWIPE_CONFIRM_THRESHOLD;
    const finalProgress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
    const acceptedProgress = Math.max(
      finalProgress,
      reachedPickupMaxProgressRef.current,
    );

    if (
      acceptedProgress >= DELIVERY_SWIPE_CONFIRM_THRESHOLD &&
      deltaX >= DELIVERY_SWIPE_MIN_TRAVEL_PX &&
      deltaX > threshold
    ) {
      // Animate to completion

      setreachedPickupIsAnimatingToComplete(true);

      setreachedPickupButtonProgress(1);

      // Close popup after animation, confirm reached pickup, then show order ID confirmation popup

      setTimeout(async () => {
        setShowreachedPickupPopup(false);

        // Get order ID - prioritize orderId (string) over id (MongoDB _id) for better compatibility

        // Backend accepts both _id and orderId, but orderId is more reliable

        const orderId =
          selectedRestaurant?.orderId ||
          selectedRestaurant?.id ||
          newOrder?.orderId ||
          newOrder?.orderMongoId ||
          (() => {
            try {
              const raw = localStorage.getItem("deliveryActiveOrder");
              const parsed = raw ? JSON.parse(raw) : null;
              return (
                parsed?.orderId ||
                parsed?.restaurantInfo?.orderId ||
                parsed?.restaurantInfo?.id ||
                null
              );
            } catch {
              return null;
            }
          })();

        console.log("[LOOKUP] Order ID lookup for reached pickup:", {
          selectedRestaurantId: selectedRestaurant?.id,

          selectedRestaurantOrderId: selectedRestaurant?.orderId,

          newOrderMongoId: newOrder?.orderMongoId,

          newOrderId: newOrder?.orderId,

          finalOrderId: orderId,
        });

        // CRITICAL: Check if order is already delivered/completed - don't call API

        const orderStatus =
          selectedRestaurant?.orderStatus || selectedRestaurant?.status || "";

        const deliveryPhase =
          selectedRestaurant?.deliveryPhase ||
          selectedRestaurant?.deliveryState?.currentPhase ||
          "";

        const deliveryStateStatus =
          selectedRestaurant?.deliveryState?.status || "";

        const isDelivered =
          orderStatus === "delivered" ||
          deliveryPhase === "completed" ||
          deliveryPhase === "delivered" ||
          deliveryStateStatus === "delivered";

        if (isDelivered) {
          console.warn(
            "[WARN] Order is already delivered, skipping reached pickup confirmation",
          );

          toast.error(
            "Order is already delivered. Cannot confirm reached pickup.",
          );

          setShowreachedPickupPopup(false);

          return;
        }

        // CRITICAL: Check if order is already past pickup phase (order ID confirmed or out for delivery)

        const isPastPickupPhase =
          orderStatus === "out_for_delivery" ||
          deliveryPhase === "en_route_to_delivery" ||
          deliveryPhase === "picked_up" ||
          deliveryStateStatus === "order_confirmed" ||
          deliveryStateStatus === "reached_pickup" ||
          deliveryPhase === "at_pickup";

        if (isPastPickupPhase) {
          console.warn(
            "[WARN] Order is already past pickup phase, skipping reached pickup confirmation:",
            {
              orderStatus,

              deliveryPhase,

              deliveryStateStatus,
            },
          );

          // If already at pickup or order ID confirmed, just show order ID popup after delay

          if (
            deliveryPhase === "at_pickup" ||
            deliveryStateStatus === "reached_pickup"
          ) {
            // Ensure reached pickup popup is closed first

            setShowreachedPickupPopup(false);

            setTimeout(() => {
              setShowOrderIdConfirmationPopup(true);
            }, 300); // Delay to ensure reached pickup popup closes first

            toast.info(
              "Order is already at pickup. Showing order ID confirmation.",
            );
          } else {
            toast.info("Order is already out for delivery.");
          }

          return;
        }

        if (orderId) {
          try {
            // Call backend API to confirm reached pickup and save status in database

            console.log(
              "[ORDER] Confirming reached pickup for order:",
              orderId,
            );

            console.log(
              "[ORDER] API endpoint: /delivery/orders/:orderId/reached-pickup",
            );

            const riderPos =
              riderLocation && riderLocation.length === 2
                ? riderLocation
                : lastLocationRef.current &&
                    lastLocationRef.current.length === 2
                  ? lastLocationRef.current
                  : null;

            const response = await deliveryAPI.confirmReachedPickup(
              orderId,
              riderPos
                ? {
                    lat: riderPos[0],

                    lng: riderPos[1],
                  }
                : {},
            );

            console.log("[ORDER] Reached pickup API response:", response.data);

            if (response.data?.success) {
              console.log(
                "[OK] Reached pickup confirmed and status saved in database",
              );

              toast.success("Reached pickup confirmed!");

              // Update local state to reflect the new status

              if (selectedRestaurant) {
                setSelectedRestaurant((prev) => ({
                  ...prev,

                  deliveryState: {
                    ...(prev?.deliveryState || {}),

                    currentPhase: "at_pickup",

                    status: "reached_pickup",
                  },
                }));
              }

              // Ensure reached pickup popup is closed first

              setShowreachedPickupPopup(false);

              // Wait for reached pickup popup to close, then show order ID confirmation popup

              setTimeout(() => {
                setShowOrderIdConfirmationPopup(true);

                console.log("[OK] Showing Order ID confirmation popup");
              }, 300); // 300ms delay for smooth transition
            } else {
              console.error(
                "[ERROR] Failed to confirm reached pickup:",
                response.data,
              );

              toast.error(
                response.data?.message ||
                  "Failed to confirm reached pickup. Please try again.",
              );

              // Ensure reached pickup popup is closed

              setShowreachedPickupPopup(false);

              // Still show order ID popup even if API call fails, after delay

              setTimeout(() => {
                setShowOrderIdConfirmationPopup(true);

                console.log(
                  "[WARN] Showing Order ID confirmation popup despite API failure",
                );
              }, 300);
            }
          } catch (error) {
            console.error("[ERROR] Error confirming reached pickup:", error);

            console.error("[ERROR] Error details:", {
              message: error.message,

              response: error.response?.data,

              status: error.response?.status,

              orderId: orderId || "unknown",

              selectedRestaurant: selectedRestaurant,
            });

            if (isCancelledConflictError(error)) {
              setreachedPickupButtonProgress(0);

              setreachedPickupIsAnimatingToComplete(false);

              handleCancelledOrderConflict(
                error,
                "Order was cancelled before pickup confirmation.",
              );

              return;
            }

            // Show specific error message

            const errorMessage =
              error.response?.data?.message ||
              (error.response?.status === 404
                ? "Order not found. Please refresh and try again."
                : "Failed to confirm reached pickup. Please try again.");

            toast.error(errorMessage);

            // Ensure reached pickup popup is closed

            setShowreachedPickupPopup(false);

            // Still show order ID popup even if API call fails, after delay

            setTimeout(() => {
              setShowOrderIdConfirmationPopup(true);

              console.log(
                "[WARN] Showing Order ID confirmation popup despite error",
              );
            }, 300);
          }
        } else {
          console.error(
            "[ERROR] No order ID found for reached pickup confirmation",
          );

          toast.error("Order ID not found. Please refresh and try again.");

          // Ensure reached pickup popup is closed

          setShowreachedPickupPopup(false);

          // Show order ID popup even if no order ID (fallback), after delay

          setTimeout(() => {
            setShowOrderIdConfirmationPopup(true);

            console.log(
              "[WARN] Showing Order ID confirmation popup without order ID (fallback)",
            );
          }, 300);
        }

        // DO NOT show reached drop here - it will only show after order ID is confirmed

        // Reset after animation

        setTimeout(() => {
          setreachedPickupButtonProgress(0);

          setreachedPickupIsAnimatingToComplete(false);
        }, 500);
      }, 200);
    } else {
      // Reset smoothly

      setreachedPickupButtonProgress(0);
    }

    reachedPickupSwipeStartX.current = 0;

    reachedPickupSwipeStartY.current = 0;

    reachedPickupIsSwiping.current = false;
    reachedPickupMaxProgressRef.current = 0;
  };

  // Handle Reached Drop button swipe

  const handleReachedDropTouchStart = (e) => {
    if (isOrderCancelledState(selectedRestaurant)) {
      handleCancelledOrderConflict(null, "Order was cancelled by user.");

      return;
    }

    reachedDropSwipeStartX.current = e.touches[0].clientX;

    reachedDropSwipeStartY.current = e.touches[0].clientY;

    reachedDropIsSwiping.current = false;
    reachedDropMaxProgressRef.current = 0;

    setReachedDropIsAnimatingToComplete(false);

    setReachedDropButtonProgress(0);
  };

  const handleReachedDropTouchMove = (e) => {
    const deltaX = e.touches[0].clientX - reachedDropSwipeStartX.current;

    const deltaY = e.touches[0].clientY - reachedDropSwipeStartY.current;

    // Only handle horizontal swipes (swipe right)

    if (
      deltaX > DELIVERY_SWIPE_START_THRESHOLD_PX &&
      (Math.abs(deltaX) > Math.abs(deltaY) * 0.45 || Math.abs(deltaY) < 24)
    ) {
      reachedDropIsSwiping.current = true;

      // Don't call preventDefault - CSS touch-action handles scrolling prevention

      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance

      const buttonWidth = reachedDropButtonRef.current?.offsetWidth || 300;

      const circleWidth = 56; // w-14 = 56px

      const padding = 16; // px-4 = 16px

      const maxSwipe = buttonWidth - circleWidth - padding * 2;

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
      reachedDropMaxProgressRef.current = Math.max(
        reachedDropMaxProgressRef.current,
        progress,
      );
      setReachedDropButtonProgress(progress);
    }
  };

  const handleReachedDropTouchEnd = (e) => {
    if (isOrderCancelledState(selectedRestaurant)) {
      setReachedDropButtonProgress(0);

      handleCancelledOrderConflict(null, "Order was cancelled by user.");

      return;
    }

    if (!reachedDropIsSwiping.current) {
      setReachedDropButtonProgress(0);

      return;
    }

    const deltaX = e.changedTouches[0].clientX - reachedDropSwipeStartX.current;

    const buttonWidth = reachedDropButtonRef.current?.offsetWidth || 300;

    const circleWidth = 56;

    const padding = 16;

    const maxSwipe = buttonWidth - circleWidth - padding * 2;

    const threshold = maxSwipe * DELIVERY_SWIPE_CONFIRM_THRESHOLD;
    const finalProgress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
    const acceptedProgress = Math.max(
      finalProgress,
      reachedDropMaxProgressRef.current,
    );

    if (
      acceptedProgress >= DELIVERY_SWIPE_CONFIRM_THRESHOLD &&
      deltaX >= DELIVERY_SWIPE_MIN_TRAVEL_PX &&
      deltaX > threshold
    ) {
      // Animate to completion

      setReachedDropIsAnimatingToComplete(true);

      setReachedDropButtonProgress(1);

      // Close popup, confirm reached drop, and show order delivered animation instantly (no delay)

      // Close reached drop popup first

      setShowReachedDropPopup(false);

      // Show Order Delivered popup instantly after Reached Drop is confirmed

      console.log(
        "[OK] Showing Order Delivered popup instantly after Reached Drop confirmation",
      );

      setShowOrderDeliveredAnimation(true);

      // API call in background (async, doesn't block popup)
      (async () => {
        // Get order ID - prioritize MongoDB _id over orderId string for API call

        // Backend expects _id (MongoDB ObjectId) in the URL parameter

        // Use _id (MongoDB ObjectId) if available, otherwise fallback to orderId string

        const orderIdForApi =
          selectedRestaurant?.id ||
          newOrder?.orderMongoId ||
          newOrder?._id ||
          selectedRestaurant?.orderId ||
          newOrder?.orderId;

        console.log("[LOOKUP] Order ID lookup for reached drop:", {
          selectedRestaurantId: selectedRestaurant?.id,

          selectedRestaurantOrderId: selectedRestaurant?.orderId,

          newOrderMongoId: newOrder?.orderMongoId,

          newOrderId: newOrder?.orderId,

          finalOrderIdForApi: orderIdForApi,
        });

        if (orderIdForApi) {
          try {
            // Call backend API to confirm reached drop (in background, don't block popup)

            // Use MongoDB _id for API call to avoid ObjectId casting errors

            console.log(
              "[ORDER] Confirming reached drop for order:",
              orderIdForApi,
            );

            const response =
              await deliveryAPI.confirmReachedDrop(orderIdForApi);

            if (response.data?.success) {
              console.log("[OK] Reached drop confirmed");
            } else {
              console.error(
                "[ERROR] Failed to confirm reached drop:",
                response.data,
              );

              toast.error(
                response.data?.message ||
                  "Failed to confirm reached drop. Please try again.",
              );
            }
          } catch (error) {
            const status = error.response?.status;

            if (isCancelledConflictError(error)) {
              setReachedDropButtonProgress(0);

              setReachedDropIsAnimatingToComplete(false);

              handleCancelledOrderConflict(
                error,
                "Order was cancelled before drop confirmation.",
              );

              return;
            }

            // Handle 500 errors gracefully (server-side issue, popup already shown)

            if (status === 500) {
              // For 500 errors, just log warning - popup is already shown, backend will sync later

              console.warn(
                "[WARN] Server error confirming reached drop (500), but popup is shown. Backend will sync status automatically.",
                {
                  orderIdForApi: orderIdForApi || "unknown",

                  message: error.response?.data?.message || error.message,
                },
              );

              // Don't show error toast or log as error - it's a server issue, not user action

              return;
            }

            // For other errors, log and show error message

            console.error("[ERROR] Error confirming reached drop:", error);

            console.error("[ERROR] Error details:", {
              message: error.message,

              response: error.response?.data,

              status: status,

              orderIdForApi: orderIdForApi || "unknown",

              selectedRestaurant: selectedRestaurant,

              newOrder: newOrder,
            });

            // Show specific error message based on status code

            let errorMessage =
              "Failed to confirm reached drop. Please try again.";

            if (status === 404) {
              errorMessage = "Order not found. Please refresh and try again.";
            } else if (error.response?.data?.message) {
              errorMessage = error.response.data.message;
            }

            toast.error(errorMessage);
          }
        }
      })();
    } else {
      // Reset smoothly

      setReachedDropButtonProgress(0);
    }

    reachedDropSwipeStartX.current = 0;

    reachedDropSwipeStartY.current = 0;

    reachedDropIsSwiping.current = false;
    reachedDropMaxProgressRef.current = 0;
  };

  // Handle Order ID Confirmation button swipe

  const handleOrderIdConfirmTouchStart = (e) => {
    if (isOrderCancelledState(selectedRestaurant)) {
      handleCancelledOrderConflict(null, "Order was cancelled by user.");

      return;
    }

    orderIdConfirmSwipeStartX.current = e.touches[0].clientX;

    orderIdConfirmSwipeStartY.current = e.touches[0].clientY;

    orderIdConfirmIsSwiping.current = false;
    orderIdConfirmMaxProgressRef.current = 0;

    setOrderIdConfirmIsAnimatingToComplete(false);

    setOrderIdConfirmButtonProgress(0);
  };

  const handleOrderIdConfirmTouchMove = (e) => {
    const deltaX = e.touches[0].clientX - orderIdConfirmSwipeStartX.current;

    const deltaY = e.touches[0].clientY - orderIdConfirmSwipeStartY.current;

    // Only handle horizontal swipes (swipe right)

    if (
      deltaX > DELIVERY_SWIPE_START_THRESHOLD_PX &&
      (Math.abs(deltaX) > Math.abs(deltaY) * 0.45 || Math.abs(deltaY) < 24)
    ) {
      orderIdConfirmIsSwiping.current = true;

      // Don't call preventDefault - CSS touch-action handles scrolling prevention

      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance

      const buttonWidth = orderIdConfirmButtonRef.current?.offsetWidth || 300;

      const circleWidth = 56; // w-14 = 56px

      const padding = 16; // px-4 = 16px

      const maxSwipe = buttonWidth - circleWidth - padding * 2;

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
      orderIdConfirmMaxProgressRef.current = Math.max(
        orderIdConfirmMaxProgressRef.current,
        progress,
      );
      setOrderIdConfirmButtonProgress(progress);
    }
  };

  const openBillImagePicker = (inputRef) => {
    const input = inputRef?.current;
    if (!input) return;
    input.value = "";
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
  };

  const getMimeTypeFromFileName = (fileName = "") => {
    const normalizedName = String(fileName).toLowerCase().trim();
    const matchedExtension = Object.keys(BILL_IMAGE_EXTENSION_MIME_MAP).find(
      (extension) => normalizedName.endsWith(extension),
    );
    return matchedExtension
      ? BILL_IMAGE_EXTENSION_MIME_MAP[matchedExtension]
      : "";
  };

  const buildImageFileFromBase64 = (base64, fileName, mimeType) => {
    if (!base64) {
      throw new Error("Invalid image data");
    }

    const cleanedBase64 = base64.includes(",") ? base64.split(",")[1] : base64;
    const binaryString = window.atob(cleanedBase64);
    const bytes = new Uint8Array(binaryString.length);

    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }

    return new File([bytes], fileName, { type: mimeType });
  };

  const normalizeBillImageFile = (
    rawFile,
    fallbackFileNamePrefix = "bill-image",
  ) => {
    if (!rawFile) {
      return null;
    }

    if (rawFile instanceof File) {
      const inferredMimeType =
        rawFile.type || getMimeTypeFromFileName(rawFile.name);
      if (!rawFile.type && inferredMimeType) {
        return new File(
          [rawFile],
          rawFile.name || `${fallbackFileNamePrefix}-${Date.now()}.jpg`,
          {
            type: inferredMimeType,
            lastModified: rawFile.lastModified || Date.now(),
          },
        );
      }
      return rawFile;
    }

    if (rawFile instanceof Blob) {
      return new File(
        [rawFile],
        `${fallbackFileNamePrefix}-${Date.now()}.jpg`,
        {
          type: rawFile.type || "image/jpeg",
          lastModified: Date.now(),
        },
      );
    }

    if (typeof rawFile === "object" && rawFile.base64) {
      const fileName =
        rawFile.fileName ||
        rawFile.name ||
        `${fallbackFileNamePrefix}-${Date.now()}.jpg`;
      const mimeType =
        rawFile.mimeType ||
        rawFile.type ||
        getMimeTypeFromFileName(fileName) ||
        "image/jpeg";
      return buildImageFileFromBase64(rawFile.base64, fileName, mimeType);
    }

    return null;
  };

  const extractBridgeImageResult = (result) => {
    if (!result) {
      return null;
    }

    if (Array.isArray(result)) {
      return extractBridgeImageResult(result[0]);
    }

    if (Array.isArray(result.files) && result.files.length > 0) {
      return extractBridgeImageResult(result.files[0]);
    }

    if (result.success === false) {
      return null;
    }

    return result.file || result;
  };

  const handleBillImageCapture = async (source = "camera") => {
    try {
      if (
        window.flutter_inappwebview &&
        typeof window.flutter_inappwebview.callHandler === "function"
      ) {
        const result = await window.flutter_inappwebview.callHandler(
          "openCamera",
          {
            source,
            accept: BILL_IMAGE_ACCEPT,
            multiple: false,
            quality: 0.8,
          },
        );

        const pickedImage = extractBridgeImageResult(result);
        const file = normalizeBillImageFile(
          pickedImage,
          source === "gallery" ? "bill-gallery" : "bill-camera",
        );

        if (file) {
          await processBillImageFile(file);
          return;
        }
      }
    } catch (error) {
      console.error(`[ERROR] Error opening ${source}:`, error);
      toast.error(`Failed to open ${source}. Please try again.`);
    }

    if (source === "gallery") {
      openBillImagePicker(fileInputRef);
      return;
    }

    openBillImagePicker(cameraInputRef);
  };

  const processBillImageFile = async (file) => {
    const normalizedFile = normalizeBillImageFile(file);

    if (!normalizedFile) return;

    const normalizedMimeType =
      normalizedFile.type || getMimeTypeFromFileName(normalizedFile.name);

    if (!normalizedMimeType.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (normalizedFile.size > BILL_IMAGE_MAX_SIZE_BYTES) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setIsUploadingBill(true);

    try {
      console.log("[CAM] Uploading bill image to Cloudinary...");

      const uploadResponse = await uploadAPI.uploadMedia(normalizedFile, {
        folder: "mobasket/delivery/bills",
      });

      if (uploadResponse?.data?.success && uploadResponse?.data?.data) {
        const imageUrl =
          uploadResponse.data.data.url || uploadResponse.data.data.secure_url;

        if (imageUrl) {
          console.log("[OK] Bill image uploaded to Cloudinary:", imageUrl);

          setBillImageUrl(imageUrl);

          // Bill image is uploaded to Cloudinary, now enable the button

          // The bill image URL will be sent when confirming order ID

          console.log(
            "[OK] Bill image uploaded to Cloudinary, ready to save to database",
          );

          setBillImageUploaded(true);
          setBillImageSkipped(false);
          persistDeliveryFlowProgress({
            billImageUrl: imageUrl,
            billImageUploaded: true,
            billImageSkipped: false,
            progress: {
              billImageUrl: imageUrl,
              billImageUploaded: true,
              billImageSkipped: false,
            },
          });

          toast.success("Bill image uploaded! You can now confirm order ID.");
        } else {
          throw new Error("Failed to get image URL from upload response");
        }
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      console.error("[ERROR] Error uploading bill image:", error);

      toast.error("Failed to upload bill image. Please try again.");

      setBillImageUrl(null);

      setBillImageUploaded(false);
    } finally {
      setIsUploadingBill(false);

      // Reset file input

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      if (cameraInputRef.current) {
        cameraInputRef.current.value = "";
      }
    }
  };

  // Handle bill image file selection and upload (fallback for web browsers)

  const handleBillImageSelect = async (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    await processBillImageFile(file);
  };

  useEffect(() => {
    if (!selectedRestaurant) return;
    persistDeliveryFlowProgress();
  }, [
    selectedRestaurant?.id,
    selectedRestaurant?.orderId,
    selectedRestaurant?.orderStatus,
    selectedRestaurant?.status,
    selectedRestaurant?.deliveryPhase,
    selectedRestaurant?.deliveryState?.currentPhase,
    selectedRestaurant?.deliveryState?.status,
    billImageUrl,
    billImageUploaded,
    showreachedPickupPopup,
    showOrderIdConfirmationPopup,
    showReachedDropPopup,
    showOrderDeliveredAnimation,
    persistDeliveryFlowProgress,
  ]);

  const handleOrderIdConfirmTouchEnd = (e) => {
    if (isOrderCancelledState(selectedRestaurant)) {
      setOrderIdConfirmButtonProgress(0);

      handleCancelledOrderConflict(null, "Order was cancelled by user.");

      return;
    }

    // Disable swipe until the bill step is completed or intentionally skipped

    if (!hasBillProof) {
      toast.error("Please upload or skip the bill image step first");

      setOrderIdConfirmButtonProgress(0);

      return;
    }

    if (!orderIdConfirmIsSwiping.current) {
      setOrderIdConfirmButtonProgress(0);

      return;
    }

    const deltaX =
      e.changedTouches[0].clientX - orderIdConfirmSwipeStartX.current;

    const buttonWidth = orderIdConfirmButtonRef.current?.offsetWidth || 300;

    const circleWidth = 56;

    const padding = 16;

    const maxSwipe = buttonWidth - circleWidth - padding * 2;

    const threshold = maxSwipe * DELIVERY_SWIPE_CONFIRM_THRESHOLD;
    const finalProgress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
    const acceptedProgress = Math.max(
      finalProgress,
      orderIdConfirmMaxProgressRef.current,
    );

    if (
      acceptedProgress >= DELIVERY_SWIPE_CONFIRM_THRESHOLD &&
      deltaX >= DELIVERY_SWIPE_MIN_TRAVEL_PX &&
      deltaX > threshold
    ) {
      // Animate to completion

      setOrderIdConfirmIsAnimatingToComplete(true);

      setOrderIdConfirmButtonProgress(1);

      // Close popup after animation, then confirm order ID and show polyline to customer

      setTimeout(async () => {
        setShowOrderIdConfirmationPopup(false);

        // Get order ID from selectedRestaurant

        const orderId =
          selectedRestaurant?.id ||
          selectedRestaurant?.orderId ||
          newOrder?.orderMongoId ||
          newOrder?.orderId ||
          (() => {
            try {
              const raw = localStorage.getItem("deliveryActiveOrder");
              const parsed = raw ? JSON.parse(raw) : null;
              return (
                parsed?.orderId ||
                parsed?.restaurantInfo?.id ||
                parsed?.restaurantInfo?.orderId ||
                null
              );
            } catch {
              return null;
            }
          })();

        const confirmedOrderId =
          selectedRestaurant?.orderId ||
          newOrder?.orderId ||
          (() => {
            try {
              const raw = localStorage.getItem("deliveryActiveOrder");
              const parsed = raw ? JSON.parse(raw) : null;
              return parsed?.restaurantInfo?.orderId || parsed?.orderId || null;
            } catch {
              return null;
            }
          })();

        // CRITICAL: Check if order is already delivered/completed - don't call API

        const orderStatus =
          selectedRestaurant?.orderStatus || selectedRestaurant?.status || "";

        const deliveryPhase =
          selectedRestaurant?.deliveryPhase ||
          selectedRestaurant?.deliveryState?.currentPhase ||
          "";

        const deliveryStateStatus =
          selectedRestaurant?.deliveryState?.status || "";

        const isDelivered =
          orderStatus === "delivered" ||
          deliveryPhase === "completed" ||
          deliveryPhase === "delivered" ||
          deliveryStateStatus === "delivered";

        if (isDelivered) {
          console.warn(
            "[WARN] Order is already delivered, skipping order ID confirmation",
          );

          toast.error("Order is already delivered. Cannot confirm order ID.");

          setShowOrderIdConfirmationPopup(false);

          return;
        }

        // CRITICAL: Check if order ID is already confirmed - don't call API again

        const isOrderIdAlreadyConfirmed =
          orderStatus === "out_for_delivery" ||
          deliveryPhase === "en_route_to_delivery" ||
          deliveryPhase === "picked_up" ||
          deliveryStateStatus === "order_confirmed" ||
          selectedRestaurant?.deliveryState?.orderIdConfirmedAt;

        if (isOrderIdAlreadyConfirmed) {
          console.warn(
            "[WARN] Order ID is already confirmed, skipping confirmation:",
            {
              orderStatus,

              deliveryPhase,

              deliveryStateStatus,

              orderIdConfirmedAt:
                selectedRestaurant?.deliveryState?.orderIdConfirmedAt,
            },
          );

          // Don't show error, just update the UI state and close popup

          setSelectedRestaurant((prev) => ({
            ...prev,

            orderStatus: "out_for_delivery",

            status: "out_for_delivery",

            deliveryPhase: "en_route_to_delivery",

            deliveryState: {
              ...prev.deliveryState,

              currentPhase: "en_route_to_delivery",

              status: "order_confirmed",
            },
          }));

          setShowOrderIdConfirmationPopup(false);

          toast.info(
            "Order ID is already confirmed. Order is out for delivery.",
          );

          return;
        }

        if (!orderId) {
          console.error("[ERROR] No order ID found to confirm");

          toast.error("Order ID not found. Please try again.");

          return;
        }

        // Get current LIVE location

        let currentLocation = riderLocation;

        if (!currentLocation || currentLocation.length !== 2) {
          currentLocation = lastLocationRef.current;
        }

        if (!currentLocation || currentLocation.length !== 2) {
          try {
            const position = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(
                (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),

                reject,

                { timeout: 5000, enableHighAccuracy: true },
              );
            });

            currentLocation = position;
          } catch (geoError) {
            console.error("[ERROR] Could not get current location:", geoError);

            toast.error(
              "Location not available. Please enable location services.",
            );

            return;
          }
        }

        try {
          // Prefer string orderId (ORD-xxx) for URL; backend accepts both _id and orderId

          const orderIdForApi =
            selectedRestaurant?.orderId || selectedRestaurant?.id;

          const confirmedOrderIdForApi =
            selectedRestaurant?.orderId ||
            (orderIdForApi && String(orderIdForApi).startsWith("ORD-")
              ? orderIdForApi
              : undefined);

          // Call backend API to confirm order ID with bill image

          console.log("[ORDER] Confirming order ID:", {
            orderIdForApi,

            confirmedOrderIdForApi,

            lat: currentLocation[0],

            lng: currentLocation[1],

            billImageUrl,
          });

          // Update API call to include bill image URL

          const response = await deliveryAPI.confirmOrderId(
            orderIdForApi,
            confirmedOrderIdForApi,
            {
              lat: currentLocation[0],

              lng: currentLocation[1],
            },
            {
              billImageUrl: billImageUrl,
            },
          );

          console.log("[OK] Order ID confirmed, response:", response.data);

          if (response.data?.success && response.data.data) {
            const orderData = response.data.data;

            const order = orderData.order || orderData;

            const routeData =
              orderData.route || order.deliveryState?.routeToDelivery;

            // Update selectedRestaurant with customer address

            if (order && selectedRestaurant) {
              const customerCoords = order.address?.location?.coordinates;

              const customerLat = customerCoords?.[1];

              const customerLng = customerCoords?.[0];

              if (customerLat && customerLng) {
                const updatedRestaurant = {
                  ...selectedRestaurant,

                  customerName:
                    order.userId?.name || selectedRestaurant.customerName,
                  customerPhone:
                    order.userId?.phone ||
                    selectedRestaurant.customerPhone ||
                    null,

                  customerAddress:
                    order.address?.formattedAddress ||
                    (order.address?.street
                      ? `${order.address.street}, ${order.address.city || ""}, ${order.address.state || ""}`.trim()
                      : "") ||
                    selectedRestaurant.customerAddress,

                  customerLat,

                  customerLng,
                };

                setSelectedRestaurant(updatedRestaurant);

                // Calculate route from delivery boy's live location to customer using Directions API

                console.log(
                  "[MAP] Calculating route to customer using Directions API...",
                );

                console.log(
                  "[LOC] From (Delivery Boy Live Location):",
                  currentLocation,
                );

                console.log("[LOC] To (Customer):", {
                  lat: customerLat,
                  lng: customerLng,
                });

                try {
                  const directionsResult =
                    await calculateRouteWithDirectionsAPI(
                      currentLocation,

                      { lat: customerLat, lng: customerLng },
                    );

                  if (directionsResult) {
                    console.log(
                      "[OK] Route to customer calculated with Directions API",
                    );

                    // Store delivery route distance and time

                    const deliveryDistance =
                      directionsResult.routes[0]?.legs[0]?.distance?.value || 0; // in meters

                    const deliveryDuration =
                      directionsResult.routes[0]?.legs[0]?.duration?.value || 0; // in seconds

                    deliveryRouteDistanceRef.current = deliveryDistance;

                    deliveryRouteTimeRef.current = deliveryDuration;

                    // Calculate total trip distance and time

                    const totalDistance =
                      pickupRouteDistanceRef.current + deliveryDistance;

                    const totalTime =
                      pickupRouteTimeRef.current + deliveryDuration;

                    setTripDistance(totalDistance);

                    setTripTime(totalTime);

                    console.log("[STATS] Total trip calculated:", {
                      totalDistance: totalDistance,

                      totalTime: totalTime,

                      pickupDistance: pickupRouteDistanceRef.current,

                      pickupTime: pickupRouteTimeRef.current,

                      deliveryDistance: deliveryDistance,

                      deliveryTime: deliveryDuration,
                    });

                    setDirectionsResponse(directionsResult);

                    directionsResponseRef.current = directionsResult;

                    // Initialize / update live tracking polyline for customer delivery route

                    updateLiveTrackingPolyline(
                      directionsResult,
                      currentLocation,
                    );

                    console.log(
                      "[OK] Live tracking polyline initialized for customer delivery route",
                    );

                    // Show route polyline on main Feed map

                    if (window.deliveryMapInstance && window.google?.maps) {
                      if (!directionsRendererRef.current) {
                        directionsRendererRef.current =
                          new window.google.maps.DirectionsRenderer({
                            suppressMarkers: true,

                            polylineOptions: {
                              strokeColor: "#4285F4",
                              strokeWeight: 0,
                              strokeOpacity: 0,
                              icons: [],
                              zIndex: -1,
                            },

                            preserveViewport: true,
                          });
                      }

                      // Don't create main route polyline - only live tracking polyline will be shown

                      // Remove old custom polyline if exists (cleanup)

                      try {
                        if (routePolylineRef.current) {
                          routePolylineRef.current.setMap(null);

                          routePolylineRef.current = null;
                        }

                        // Remove DirectionsRenderer from map

                        if (directionsRendererRef.current) {
                          directionsRendererRef.current.setMap(null);
                        }
                      } catch (e) {
                        console.warn("[WARN] Error cleaning up polyline:", e);
                      }

                      const bounds = directionsResult.routes?.[0]?.bounds;

                      if (bounds) {
                        const currentZoomBeforeFit =
                          window.deliveryMapInstance.getZoom();

                        if (isBoundsReasonable(bounds)) {
                          window.deliveryMapInstance.fitBounds(bounds, {
                            padding: 100,
                          });
                        } else {
                          console.warn(
                            "Skipping unsafe fitBounds on delivery map",
                            bounds,
                          );
                        }

                        // Preserve zoom if user had zoomed in

                        setTimeout(() => {
                          const newZoom = window.deliveryMapInstance.getZoom();

                          if (
                            currentZoomBeforeFit > newZoom &&
                            currentZoomBeforeFit >= 18
                          ) {
                            window.deliveryMapInstance.setZoom(
                              currentZoomBeforeFit,
                            );
                          }
                        }, 100);
                      }
                    }

                    setShowRoutePath(true);
                  } else if (routeData?.coordinates?.length > 0) {
                    setRoutePolyline(routeData.coordinates);

                    updateRoutePolyline(routeData.coordinates);

                    setShowRoutePath(true);
                  }
                } catch (routeError) {
                  if (
                    routeError.message?.includes("REQUEST_DENIED") ||
                    routeError.message?.includes("not available")
                  ) {
                    console.log(
                      "[WARN] Directions API not available, using backend route fallback",
                    );
                  } else {
                    console.error(
                      "[ERROR] Error calculating route to customer:",
                      routeError,
                    );
                  }

                  if (routeData?.coordinates?.length > 0) {
                    setRoutePolyline(routeData.coordinates);

                    updateRoutePolyline(routeData.coordinates);

                    setShowRoutePath(true);
                  }
                }
              }
            }

            // Update status to out_for_delivery (merge if customer block didn't run)

            setSelectedRestaurant((prev) => ({
              ...prev,

              orderStatus: "out_for_delivery",

              status: "out_for_delivery",

              deliveryPhase: "en_route_to_delivery",

              deliveryState: {
                ...prev.deliveryState,

                currentPhase: "en_route_to_delivery",

                status: "order_confirmed",
              },
            }));

            // CRITICAL: Close Reached Pickup popup if it's still showing (shouldn't happen, but defensive)

            setShowreachedPickupPopup(false);

            // Close Order ID confirmation popup

            setShowOrderIdConfirmationPopup(false);

            toast.success(
              "Order is out for delivery. Route to customer is on the map.",
              { duration: 4000 },
            );

            // Show Reached Drop popup instantly after Order Picked Up is confirmed

            // Use setTimeout to ensure state updates are processed and useEffect doesn't block it

            console.log(
              "[OK] Showing Reached Drop popup instantly after Order Picked Up confirmation",
            );

            setTimeout(() => {
              setShowReachedDropPopup(true);

              console.log("[OK] Reached Drop popup state set to true");
            }, 100); // Small delay to ensure showOrderIdConfirmationPopup state is updated
          } else {
            console.error("[ERROR] Failed to confirm order ID:", response.data);

            toast.error(
              response.data?.message ||
                "Failed to confirm order ID. Please try again.",
            );
          }
        } catch (error) {
          const status = error.response?.status;

          const msg = error.response?.data?.message || error.message || "";

          console.error("[ERROR] Error confirming order ID:", {
            status,
            message: msg,
            data: error.response?.data,
          });

          if (isCancelledConflictError(error)) {
            setOrderIdConfirmButtonProgress(0);

            setOrderIdConfirmIsAnimatingToComplete(false);

            handleCancelledOrderConflict(
              error,
              "Order was cancelled before order ID confirmation.",
            );

            return;
          }

          toast.error(msg || "Failed to confirm order ID. Please try again.");
        }

        // Reset after animation

        setTimeout(() => {
          setOrderIdConfirmButtonProgress(0);

          setOrderIdConfirmIsAnimatingToComplete(false);
        }, 500);
      }, 200);
    } else {
      // Reset smoothly

      setOrderIdConfirmButtonProgress(0);
    }

    orderIdConfirmSwipeStartX.current = 0;

    orderIdConfirmSwipeStartY.current = 0;

    orderIdConfirmIsSwiping.current = false;
    orderIdConfirmMaxProgressRef.current = 0;
  };

  // Handle Order Delivered button swipe

  const handleOrderDeliveredTouchStart = (e) => {
    orderDeliveredSwipeStartX.current = e.touches[0].clientX;

    orderDeliveredSwipeStartY.current = e.touches[0].clientY;

    orderDeliveredIsSwiping.current = false;
    orderDeliveredMaxProgressRef.current = 0;

    setOrderDeliveredIsAnimatingToComplete(false);

    setOrderDeliveredButtonProgress(0);
  };

  const handleOrderDeliveredTouchMove = (e) => {
    const deltaX = e.touches[0].clientX - orderDeliveredSwipeStartX.current;

    const deltaY = e.touches[0].clientY - orderDeliveredSwipeStartY.current;

    // Only handle horizontal swipes (swipe right)

    if (
      deltaX > DELIVERY_SWIPE_START_THRESHOLD_PX &&
      (Math.abs(deltaX) > Math.abs(deltaY) * 0.45 || Math.abs(deltaY) < 24)
    ) {
      orderDeliveredIsSwiping.current = true;

      // Don't call preventDefault - CSS touch-action handles scrolling prevention

      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance

      const buttonWidth = orderDeliveredButtonRef.current?.offsetWidth || 300;

      const circleWidth = 56; // w-14 = 56px

      const padding = 16; // px-4 = 16px

      const maxSwipe = buttonWidth - circleWidth - padding * 2;

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
      orderDeliveredMaxProgressRef.current = Math.max(
        orderDeliveredMaxProgressRef.current,
        progress,
      );
      setOrderDeliveredButtonProgress(progress);
    }
  };

  const handleOrderDeliveredTouchEnd = (e) => {
    if (!orderDeliveredIsSwiping.current) {
      setOrderDeliveredButtonProgress(0);

      return;
    }

    const deltaX =
      e.changedTouches[0].clientX - orderDeliveredSwipeStartX.current;

    const buttonWidth = orderDeliveredButtonRef.current?.offsetWidth || 300;

    const circleWidth = 56;

    const padding = 16;

    const maxSwipe = buttonWidth - circleWidth - padding * 2;

    const threshold = maxSwipe * DELIVERY_SWIPE_CONFIRM_THRESHOLD;
    const finalProgress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
    const acceptedProgress = Math.max(
      finalProgress,
      orderDeliveredMaxProgressRef.current,
    );

    if (
      acceptedProgress >= DELIVERY_SWIPE_CONFIRM_THRESHOLD &&
      deltaX >= DELIVERY_SWIPE_MIN_TRAVEL_PX &&
      deltaX > threshold
    ) {
      // Animate to completion

      setOrderDeliveredIsAnimatingToComplete(true);

      setOrderDeliveredButtonProgress(1);

      // Close popup after animation and show customer review (delivery will be completed when review is submitted)

      setTimeout(() => {
        setShowOrderDeliveredAnimation(false);

        // CRITICAL: Clear all pickup/delivery related popups

        setShowReachedDropPopup(false);

        setShowreachedPickupPopup(false);

        setShowOrderIdConfirmationPopup(false);

        // Show customer review popup instantly

        setShowCustomerReviewPopup(true);

        // Reset after animation

        setTimeout(() => {
          setOrderDeliveredButtonProgress(0);

          setOrderDeliveredIsAnimatingToComplete(false);
        }, 500);
      }, 200);
    } else {
      // Reset smoothly

      setOrderDeliveredButtonProgress(0);
    }

    orderDeliveredSwipeStartX.current = 0;

    orderDeliveredSwipeStartY.current = 0;

    orderDeliveredIsSwiping.current = false;
    orderDeliveredMaxProgressRef.current = 0;
  };

  // Handle accept orders button swipe

  const handleAcceptOrdersTouchStart = (e) => {
    acceptButtonSwipeStartX.current = e.touches[0].clientX;

    acceptButtonSwipeStartY.current = e.touches[0].clientY;

    acceptButtonIsSwiping.current = false;
    acceptOrdersMaxProgressRef.current = 0;

    setIsAnimatingToComplete(false);
  };

  const handleAcceptOrdersTouchMove = (e) => {
    const deltaX = e.touches[0].clientX - acceptButtonSwipeStartX.current;

    const deltaY = e.touches[0].clientY - acceptButtonSwipeStartY.current;

    // Only handle horizontal swipes (swipe right)

    if (
      deltaX > DELIVERY_SWIPE_START_THRESHOLD_PX &&
      (Math.abs(deltaX) > Math.abs(deltaY) * 0.45 || Math.abs(deltaY) < 24)
    ) {
      acceptButtonIsSwiping.current = true;

      // Don't call preventDefault - CSS touch-action handles scrolling prevention

      // safePreventDefault(e) // Removed to avoid passive listener error

      // Calculate max swipe distance

      const buttonWidth = acceptButtonRef.current?.offsetWidth || 300;

      const circleWidth = 56; // w-14 = 56px

      const padding = 16; // px-4 = 16px

      const maxSwipe = buttonWidth - circleWidth - padding * 2;

      const progress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
      acceptOrdersMaxProgressRef.current = Math.max(
        acceptOrdersMaxProgressRef.current,
        progress,
      );
      setAcceptButtonProgress(progress);
    }
  };

  const handleAcceptOrdersTouchEnd = (e) => {
    if (!acceptButtonIsSwiping.current) {
      setAcceptButtonProgress(0);

      return;
    }

    const deltaX =
      e.changedTouches[0].clientX - acceptButtonSwipeStartX.current;

    const buttonWidth = acceptButtonRef.current?.offsetWidth || 300;

    const circleWidth = 56;

    const padding = 16;

    const maxSwipe = buttonWidth - circleWidth - padding * 2;

    const threshold = maxSwipe * DELIVERY_SWIPE_CONFIRM_THRESHOLD;
    const finalProgress = Math.min(Math.max(deltaX / maxSwipe, 0), 1);
    const acceptedProgress = Math.max(
      finalProgress,
      acceptOrdersMaxProgressRef.current,
    );

    if (
      acceptedProgress >= DELIVERY_SWIPE_CONFIRM_THRESHOLD &&
      deltaX >= DELIVERY_SWIPE_MIN_TRAVEL_PX &&
      deltaX > threshold
    ) {
      // Animate to completion

      setIsAnimatingToComplete(true);

      setAcceptButtonProgress(1);

      // Navigate to pickup directions page after animation

      setTimeout(() => {
        navigate("/delivery/pickup-directions", {
          state: { restaurants: mockRestaurants },

          replace: false,
        });

        // Reset after navigation

        setTimeout(() => {
          setAcceptButtonProgress(0);

          setIsAnimatingToComplete(false);
        }, 500);
      }, 200);
    } else {
      // Reset smoothly

      setAcceptButtonProgress(0);
    }

    acceptButtonSwipeStartX.current = 0;

    acceptButtonSwipeStartY.current = 0;

    acceptButtonIsSwiping.current = false;
    acceptOrdersMaxProgressRef.current = 0;
  };

  // Handle bottom sheet swipe

  const handleBottomSheetTouchStart = (e) => {
    const target = e.target;

    const isHandle = handleRef.current?.contains(target);

    // Check if touch is in handle area or top 15% of bottom sheet

    const rect = bottomSheetRef.current?.getBoundingClientRect();

    if (!rect) return;

    const touchY = e.touches[0].clientY;

    const handleArea = rect.top + 60; // Top 60px is handle area

    // Allow swipe if touching handle or top area

    if (isHandle || touchY <= handleArea) {
      e.stopPropagation();

      swipeStartY.current = touchY;

      isSwiping.current = true;
    }
  };

  const handleBottomSheetTouchMove = (e) => {
    if (!isSwiping.current) return;

    const deltaY = swipeStartY.current - e.touches[0].clientY;

    if (Math.abs(deltaY) > 5) {
      e.stopPropagation();

      // Swipe up to expand

      if (deltaY > 0 && !bottomSheetExpanded && bottomSheetRef.current) {
        // Don't call preventDefault - CSS touch-action handles scrolling prevention

        // safePreventDefault(e) // Removed to avoid passive listener error

        bottomSheetRef.current.style.transform = `translateY(${-deltaY}px)`;
      }

      // Swipe down to collapse
      else if (deltaY < 0 && bottomSheetExpanded && bottomSheetRef.current) {
        // Don't call preventDefault - CSS touch-action handles scrolling prevention

        // safePreventDefault(e) // Removed to avoid passive listener error

        bottomSheetRef.current.style.transform = `translateY(${-deltaY}px)`;
      }
    }
  };

  const handleBottomSheetTouchEnd = (e) => {
    if (!isSwiping.current) {
      isSwiping.current = false;

      return;
    }

    e.stopPropagation();

    const deltaY = swipeStartY.current - e.changedTouches[0].clientY;

    const threshold = 50;

    if (bottomSheetRef.current) {
      if (deltaY > threshold && !bottomSheetExpanded) {
        setBottomSheetExpanded(true);
      } else if (deltaY < -threshold && bottomSheetExpanded) {
        setBottomSheetExpanded(false);
      }

      // Reset transform

      bottomSheetRef.current.style.transform = "";
    }

    isSwiping.current = false;

    swipeStartY.current = 0;
  };

  // Listen for refresh events

  useEffect(() => {
    const handleRefresh = () => {
      setAnimationKey((prev) => prev + 1);
    };

    const handleActiveOrderUpdate = () => {
      const stored = localStorage.getItem("activeOrder");

      setActiveOrder(stored ? JSON.parse(stored) : null);
    };

    const handleNotificationUpdate = () => {
      setUnreadNotificationCount(getUnreadDeliveryNotificationCount());
    };

    window.addEventListener("deliveryHomeRefresh", handleRefresh);

    window.addEventListener("gigStateUpdated", handleRefresh);

    window.addEventListener("deliveryOrderStatusUpdated", handleRefresh);

    window.addEventListener("activeOrderUpdated", handleActiveOrderUpdate);

    window.addEventListener("storage", handleActiveOrderUpdate);

    window.addEventListener(
      "deliveryNotificationsUpdated",
      handleNotificationUpdate,
    );

    return () => {
      window.removeEventListener("deliveryHomeRefresh", handleRefresh);

      window.removeEventListener("gigStateUpdated", handleRefresh);

      window.removeEventListener("deliveryOrderStatusUpdated", handleRefresh);

      window.removeEventListener("activeOrderUpdated", handleActiveOrderUpdate);

      window.removeEventListener("storage", handleActiveOrderUpdate);

      window.removeEventListener(
        "deliveryNotificationsUpdated",
        handleNotificationUpdate,
      );
    };
  }, []);

  // Helper function to calculate time away from distance

  const calculateTimeAway = useCallback((distanceStr) => {
    if (!distanceStr) return "0 mins";

    const distance = parseFloat(distanceStr.replace(" km", ""));

    if (isNaN(distance)) return "0 mins";

    // Assume average speed of 30 km/h for delivery

    const minutes = Math.ceil((distance / 30) * 60);

    return `${minutes} mins`;
  }, []);

  const normalizeDistanceLabel = useCallback((distanceValue) => {
    if (distanceValue == null) return null;
    const text = String(distanceValue).trim();
    if (!text) return null;
    const lower = text.toLowerCase();
    if (
      lower === "0 km" ||
      lower === "calculating..." ||
      lower === "distance not available" ||
      lower === "pending" ||
      lower === "n/a" ||
      lower === "na" ||
      lower === "--"
    ) {
      return null;
    }
    return text;
  }, []);

  const formatDistanceKm = useCallback((distanceKm) => {
    const value = Number(distanceKm);
    if (!Number.isFinite(value) || value <= 0) return null;
    return `${value.toFixed(2)} km`;
  }, []);

  const normalizeAddressLabel = useCallback(
    (addressValue, fallback = "Address not available") => {
      const text = String(addressValue || "").trim();
      if (!text) return fallback;
      const lower = text.toLowerCase();
      if (
        lower === "address" ||
        lower === "restaurant address" ||
        lower === "restaurant address."
      ) {
        return fallback;
      }
      return text;
    },
    [],
  );

  // Show new order popup when order is received from Socket.IO

  useEffect(() => {
    if (newOrder) {
      if (isAcceptingNewOrderRef.current) {
        return;
      }

      if (isCashInHandLimitReached) {
        toast.error(
          `Cash in hand limit reached (?${totalCashLimit.toFixed(2)}). Deposit cash in hand to continue receiving orders.`,
        );

        clearNewOrder();

        return;
      }

      const paymentMethodRaw = String(
        newOrder.paymentMethod ||
          newOrder.payment?.method ||
          newOrder.payment ||
          "",
      ).toLowerCase();

      const isCodOrder =
        paymentMethodRaw === "cash" || paymentMethodRaw === "cod";

      const incomingCodAmount = isCodOrder
        ? Math.max(0, Number(newOrder.total || newOrder.pricing?.total || 0))
        : 0;

      const projectedCashInHand = cashInHand + incomingCodAmount;

      if (totalCashLimit > 0 && projectedCashInHand > totalCashLimit) {
        toast.error(
          `COD limit exceeded. Current cash in hand ?${cashInHand.toFixed(2)}, incoming COD ?${incomingCodAmount.toFixed(2)}, limit ?${totalCashLimit.toFixed(2)}. Deposit cash to receive this order.`,
        );

        clearNewOrder();

        return;
      }

      const orderId = newOrder.orderMongoId || newOrder.orderId;
      const currentSelectedOrder =
        selectedRestaurantRef.current || selectedRestaurant;

      const activeOrderId =
        currentSelectedOrder?.id || currentSelectedOrder?.orderId || null;
      const activeOrderStatus = String(
        currentSelectedOrder?.orderStatus || currentSelectedOrder?.status || "",
      ).toLowerCase();
      const activeOrderPhase = String(
        currentSelectedOrder?.deliveryPhase ||
          currentSelectedOrder?.deliveryState?.currentPhase ||
          "",
      ).toLowerCase();
      const activeDeliveryStateStatus = String(
        currentSelectedOrder?.deliveryState?.status || "",
      ).toLowerCase();
      const hasActiveOrderInProgress =
        activeOrderStatus === "out_for_delivery" ||
        activeOrderStatus === "picked_up" ||
        activeOrderStatus === "accepted" ||
        activeOrderPhase === "en_route_to_pickup" ||
        activeOrderPhase === "at_pickup" ||
        activeOrderPhase === "en_route_to_delivery" ||
        activeOrderPhase === "picked_up" ||
        activeDeliveryStateStatus === "accepted" ||
        activeDeliveryStateStatus === "order_confirmed" ||
        activeDeliveryStateStatus === "en_route_to_delivery";

      if (
        hasActiveOrderInProgress &&
        (!activeOrderId ||
          !orderId ||
          String(activeOrderId) === String(orderId))
      ) {
        markOrderAsAccepted(orderId, newOrder?.orderMongoId, newOrder?.orderId);
        clearNewOrder();
        return;
      }

      // Check if this order has already been accepted

      if (
        isOrderAlreadyAccepted(
          orderId,
          newOrder?.orderMongoId,
          newOrder?.orderId,
        )
      ) {
        clearNewOrder();

        return;
      }

      // Check if order is already in localStorage (accepted order)

      try {
        const activeOrderData = localStorage.getItem("deliveryActiveOrder");

        if (activeOrderData) {
          const activeOrder = JSON.parse(activeOrderData);

          const activeOrderId =
            activeOrder.orderId ||
            activeOrder.restaurantInfo?.id ||
            activeOrder.restaurantInfo?.orderId;

          if (activeOrderId && String(activeOrderId) === String(orderId)) {
            markOrderAsAccepted(
              orderId,
              newOrder?.orderMongoId,
              newOrder?.orderId,
            );

            clearNewOrder();

            return;
          }
        }
      } catch (e) {
        // Ignore localStorage errors
      }

      console.log("[ORDER] New order received from Socket.IO:", newOrder);

      // Transform newOrder data to match selectedRestaurant format

      const restaurantAddress = resolveStoreAddressFromOrder(
        newOrder,
        "Restaurant address",
      );

      const restaurantCoords = resolveStoreCoordsFromOrder(newOrder);

      // Extract earnings from notification - backend now calculates and sends estimatedEarnings

      const deliveryFee = newOrder.deliveryFee ?? 0;

      const earned = newOrder.estimatedEarnings;

      let earnedValue = 0;

      if (earned) {
        if (typeof earned === "object" && earned.totalEarning != null) {
          earnedValue = Number(earned.totalEarning) || 0;
        } else if (typeof earned === "number") {
          earnedValue = earned;
        }
      }

      // Use calculated earnings if available, otherwise fallback to deliveryFee

      const effectiveEarnings =
        earnedValue > 0 ? earned : deliveryFee > 0 ? deliveryFee : 0;

      console.log("[MONEY] Earnings from notification:", {
        earned,

        earnedValue,

        deliveryFee,

        effectiveEarnings,

        type: typeof effectiveEarnings,
      });

      // Calculate pickup distance if not provided

      let pickupDistance = normalizeDistanceLabel(newOrder.pickupDistance);

      if (!pickupDistance) {
        // Try to calculate from driver's current location to restaurant

        const currentLocation = riderLocation || lastLocationRef.current;

        const restaurantLat = newOrder.restaurantLocation?.latitude;

        const restaurantLng = newOrder.restaurantLocation?.longitude;

        if (
          currentLocation &&
          currentLocation.length === 2 &&
          restaurantLat &&
          restaurantLng &&
          !isNaN(restaurantLat) &&
          !isNaN(restaurantLng)
        ) {
          // Calculate distance in meters, then convert to km

          const distanceInMeters = calculateDistance(
            currentLocation[0],

            currentLocation[1],

            restaurantLat,

            restaurantLng,
          );

          const distanceInKm = distanceInMeters / 1000;

          pickupDistance = `${distanceInKm.toFixed(2)} km`;
        }
      }

      // Default to 'Calculating...' if still no distance

      if (!pickupDistance) {
        pickupDistance = "Distance not available";
      }

      const restaurantData = {
        id: newOrder.orderMongoId || newOrder.orderId,

        orderId: newOrder.orderId,

        name: newOrder.restaurantName,

        address: normalizeAddressLabel(
          restaurantAddress,
          "Restaurant address not available",
        ),

        lat: restaurantCoords?.lat,

        lng: restaurantCoords?.lng,

        distance: pickupDistance,

        timeAway: normalizeDistanceLabel(pickupDistance)
          ? calculateTimeAway(pickupDistance)
          : "N/A",

        dropDistance:
          normalizeDistanceLabel(newOrder?.deliveryDistance) ||
          formatDistanceKm(
            newOrder?.deliveryDistanceRaw || newOrder?.assignmentInfo?.distance,
          ) ||
          "Distance not available",

        pickupDistance: pickupDistance,

        estimatedEarnings: effectiveEarnings,

        deliveryFee,

        amount:
          earnedValue > 0 ? earnedValue : deliveryFee > 0 ? deliveryFee : 0,

        customerName: newOrder.customerName,

        customerAddress: normalizeAddressLabel(
          newOrder.customerLocation?.address || newOrder.deliveryAddress,
          "Customer address not available",
        ),

        customerLat: newOrder.customerLocation?.latitude,

        customerLng: newOrder.customerLocation?.longitude,

        items: newOrder.items || [],

        total: newOrder.total || 0,
        orderStatus:
          newOrder.status ||
          currentSelectedOrder?.orderStatus ||
          currentSelectedOrder?.status ||
          null,
        deliveryState: {
          ...(newOrder.deliveryState || {}),
          currentPhase:
            newOrder.deliveryState?.currentPhase ||
            newOrder.deliveryPhase ||
            currentSelectedOrder?.deliveryState?.currentPhase ||
            currentSelectedOrder?.deliveryPhase ||
            null,
          status:
            newOrder.deliveryState?.status ||
            currentSelectedOrder?.deliveryState?.status ||
            null,
        },
        deliveryPhase:
          newOrder.deliveryState?.currentPhase ||
          newOrder.deliveryPhase ||
          currentSelectedOrder?.deliveryPhase ||
          null,
      };

      setNewOrderAcceptButtonProgress(0);

      setNewOrderIsAnimatingToComplete(false);

      const shouldPreserveCurrentOrder =
        hasActiveOrderInProgress &&
        Boolean(activeOrderId) &&
        Boolean(orderId) &&
        String(activeOrderId) !== String(orderId);

      if (!shouldPreserveCurrentOrder) {
        setSelectedRestaurant(restaurantData);
      }

      setShowNewOrderPopup(true);

      setCountdownSeconds(300); // Reset countdown to 5 minutes
    }
  }, [
    newOrder,

    isCashInHandLimitReached,

    cashInHand,

    totalCashLimit,

    calculateTimeAway,

    riderLocation,

    isOrderAlreadyAccepted,

    markOrderAsAccepted,
    clearNewOrder,
  ]);

  // Recalculate distance when rider location becomes available

  useEffect(() => {
    if (!selectedRestaurant || !showNewOrderPopup) return;

    // Only recalculate if distance is missing or showing '0 km' or 'Calculating...'

    const currentDistance =
      selectedRestaurant.distance || selectedRestaurant.pickupDistance;

    if (
      currentDistance &&
      currentDistance !== "0 km" &&
      currentDistance !== "Calculating..."
    ) {
      return; // Distance already calculated
    }

    const currentLocation = riderLocation || lastLocationRef.current;

    const restaurantLat = selectedRestaurant.lat;

    const restaurantLng = selectedRestaurant.lng;

    if (
      currentLocation &&
      currentLocation.length === 2 &&
      restaurantLat &&
      restaurantLng &&
      !isNaN(restaurantLat) &&
      !isNaN(restaurantLng)
    ) {
      // Calculate distance in meters, then convert to km

      const distanceInMeters = calculateDistance(
        currentLocation[0],

        currentLocation[1],

        restaurantLat,

        restaurantLng,
      );

      const distanceInKm = distanceInMeters / 1000;

      const pickupDistance = `${distanceInKm.toFixed(2)} km`;

      console.log("[LOC] Recalculated pickup distance:", pickupDistance);

      setSelectedRestaurant((prev) => ({
        ...prev,

        distance: pickupDistance,

        pickupDistance: pickupDistance,

        timeAway: calculateTimeAway(pickupDistance),
      }));
    }
  }, [riderLocation, selectedRestaurant, showNewOrderPopup, calculateTimeAway]);

  // Fetch restaurant address if missing when selectedRestaurant is set

  useEffect(() => {
    if (!selectedRestaurant?.orderId && !selectedRestaurant?.id) return;

    if (
      !selectedRestaurant?.address ||
      selectedRestaurant.address === "Restaurant address" ||
      selectedRestaurant.address === "Restaurant Address"
    ) {
      // Address is missing, fetch order details to get restaurant address

      const orderId = selectedRestaurant.orderId || selectedRestaurant.id;

      console.log("[SYNC] Fetching restaurant address for order:", orderId);

      const fetchAddress = async () => {
        try {
          const response = await deliveryAPI.getOrderDetails(orderId);

          if (response?.data?.success && response?.data?.data) {
            const order = response.data.data.order || response.data.data;

            const restaurantAddress = resolveStoreAddressFromOrder(order, "");

            if (
              restaurantAddress &&
              restaurantAddress !== "Restaurant address" &&
              restaurantAddress !== "Restaurant Address"
            ) {
              setSelectedRestaurant((prev) => ({
                ...prev,

                address: restaurantAddress,
              }));

              console.log(
                "[OK] Restaurant address fetched and updated:",
                restaurantAddress,
              );
            }
          }
        } catch (error) {
          console.error("[ERROR] Error fetching restaurant address:", error);
        }
      };

      fetchAddress();
    }
  }, [
    selectedRestaurant?.orderId,
    selectedRestaurant?.id,
    selectedRestaurant?.address,
  ]);

  // Handle online toggle - check for booked gigs

  const handleToggleOnline = () => {
    if (isOnline) {
      goOffline();
    } else {
      // Check if there are any booked gigs

      // if (bookedGigs.length === 0) {

      //   // Show popup to book gigs

      //   setShowBookGigsPopup(true)

      //   return

      // }

      // // If gigs exist, proceed with going online

      // const success = goOnline()

      // if (!success) {

      //   // If goOnline fails (no gig), just set online status directly

      //   useGigStore.setState({ isOnline: true })

      //   localStorage.setItem('delivery_online_status', 'true')

      //   window.dispatchEvent(new CustomEvent('deliveryOnlineStatusChanged'))

      // }

      goOnline();
    }
  };

  // Carousel state

  const [currentCarouselSlide, setCurrentCarouselSlide] = useState(0);

  const carouselRef = useRef(null);

  const carouselStartX = useRef(0);

  const carouselIsSwiping = useRef(false);

  const carouselAutoRotateRef = useRef(null);

  // Map view toggle state - Hotspot or Select drop (both show map, just different views)

  const [mapViewMode, setMapViewMode] = useState("hotspot"); // "hotspot" or "selectDrop"

  // Swipe bar state - controls whether map or home sections are visible

  const [showHomeSections, setShowHomeSections] = useState(false); // false = map view, true = home sections

  const [swipeBarPosition, setSwipeBarPosition] = useState(0); // 0 = bottom (map), 1 = top (home)

  const [isDraggingSwipeBar, setIsDraggingSwipeBar] = useState(false);

  const swipeBarRef = useRef(null);

  const swipeBarStartY = useRef(0);

  const isSwipingBar = useRef(false);

  const homeSectionsScrollRef = useRef(null);

  const isScrollingHomeSections = useRef(false);

  // Emergency help popup state

  const [showEmergencyPopup, setShowEmergencyPopup] = useState(false);

  // Help popup state

  const [showHelpPopup, setShowHelpPopup] = useState(false);

  // Book gigs popup state

  const [showBookGigsPopup, setShowBookGigsPopup] = useState(false);

  // Drop location selection popup state

  const [showDropLocationPopup, setShowDropLocationPopup] = useState(false);

  const [selectedDropLocation, setSelectedDropLocation] = useState(() => {
    return localStorage.getItem("selectedDropLocation") || null;
  });

  // Help options - using paths from DeliveryRouter

  const helpOptions = [
    {
      id: "supportTickets",

      title: "Support tickets",

      subtitle: "Check status of tickets raised",

      icon: "ticket",

      path: "/delivery/help/tickets",
    },

    {
      id: "idCard",

      title: "Show ID card",

      subtitle: `See your ${companyName} ID card`,

      icon: "idCard",

      path: "/delivery/help/id-card",
    },
  ];

  // Handle help option click - navigate to the correct route

  const handleHelpOptionClick = (option) => {
    if (option.path) {
      setShowHelpPopup(false);

      navigate(option.path);
    }
  };

  // Emergency options with phone numbers

  const emergencyOptions = [
    {
      id: "ambulance",

      title: "Call ambulance (10 mins)",

      subtitle: "For medical emergencies",

      phone: "108", // Indian emergency ambulance number

      icon: "ambulance",
    },

    {
      id: "accident",

      title: "Call accident helpline",

      subtitle: "Talk to our emergency team",

      phone: "1073", // Indian accident helpline

      icon: "siren",
    },

    {
      id: "police",

      title: "Call police",

      subtitle: "Report a crime",

      phone: "100", // Indian police emergency number

      icon: "police",
    },

    {
      id: "insurance",

      title: "Insurance card",

      subtitle: "View your insurance details",

      phone: null, // No phone call for insurance

      icon: "insurance",
    },
  ];

  // Handle emergency option click

  const handleEmergencyOptionClick = (option) => {
    if (option.phone) {
      window.location.href = `tel:${option.phone}`;
    } else if (option.id === "insurance") {
      // Navigate to insurance page or show insurance details

      navigate("/delivery/insurance");
    }

    setShowEmergencyPopup(false);
  };

  // Fetch wallet data from API

  useEffect(() => {
    const fetchWalletData = async () => {
      // Skip wallet fetch if status is pending

      if (deliveryStatus === "pending") {
        setWalletState({
          totalBalance: 0,

          cashInHand: 0,

          deductions: 0,

          totalCashLimit: 0,

          availableCashLimit: 0,

          totalWithdrawn: 0,

          totalEarned: 0,

          transactions: [],

          joiningBonusClaimed: false,
        });

        return;
      }

      try {
        const walletData = await fetchDeliveryWallet();

        setWalletState(walletData);
      } catch (error) {
        // Only log error if it's not a network error (backend might be down)

        if (error.code !== "ERR_NETWORK") {
          console.error("Error fetching wallet data:", error);
        }

        // Keep last known wallet values if fetch fails.
      }
    };

    // Only fetch if status is known and not pending

    if (deliveryStatus !== null && deliveryStatus !== "pending") {
      fetchWalletData();
    } else if (deliveryStatus === null) {
      // If status is not yet loaded, wait for it

      fetchWalletData();
    }
  }, [deliveryStatus]);

  // Fetch assigned orders from API when delivery person goes online

  const fetchAssignedOrders = useCallback(
    async (options = {}) => {
      const force = options?.force === true;
      const now = Date.now();
      if (!force) {
        if (fetchAssignedOrdersInFlightRef.current) {
          return;
        }
        if (
          now - fetchAssignedOrdersLastRunRef.current <
          FETCH_ASSIGNED_ORDERS_MIN_INTERVAL_MS
        ) {
          return;
        }
      }
      fetchAssignedOrdersInFlightRef.current = true;
      fetchAssignedOrdersLastRunRef.current = now;

      if (!isOnline) {
        console.log("Delivery person is offline, skipping order fetch");
        fetchAssignedOrdersInFlightRef.current = false;
        return;
      }

      if (isCashInHandLimitReached) {
        console.log(
          "Cash-in-hand limit reached, skipping new order notifications",
        );
        fetchAssignedOrdersInFlightRef.current = false;
        return;
      }

      try {
        console.log("Fetching assigned orders from API...");

        const response = await deliveryAPI.getOrders({
          limit: 50, // Get up to 50 pending orders

          page: 1,

          includeDelivered: false, // Only get active orders
        });

        if (response?.data?.success && response?.data?.data?.orders) {
          const orders = response.data.data.orders;

          // Restore only when the rider has already accepted and moved into active delivery flow.
          // Assigned/preparing-ready orders must still show the accept slider.
          const activeAssignedOrder = orders.find((order) => {
            const orderStatus = String(order?.status || "").toLowerCase();
            const deliveryPhase = String(
              order?.deliveryState?.currentPhase || "",
            ).toLowerCase();
            const deliveryStateStatus = String(
              order?.deliveryState?.status || "",
            ).toLowerCase();
            const notificationPhase = String(
              order?.assignmentInfo?.notificationPhase || "",
            ).toLowerCase();
            const hasExplicitAcceptanceMarker = Boolean(
              order?.deliveryState?.acceptedAt ||
              order?.deliveryState?.acceptedBy ||
              order?.assignmentInfo?.acceptedAt ||
              notificationPhase === "accepted",
            );

            const isTerminal =
              orderStatus === "cancelled" ||
              orderStatus === "delivered" ||
              orderStatus === "completed" ||
              deliveryPhase === "delivered" ||
              deliveryPhase === "completed" ||
              deliveryStateStatus === "delivered";

            if (isTerminal) return false;

            const hasAcceptedDeliveryState =
              notificationPhase === "accepted" ||
              (deliveryStateStatus === "accepted" &&
                hasExplicitAcceptanceMarker) ||
              deliveryStateStatus === "reached_pickup" ||
              deliveryStateStatus === "order_confirmed" ||
              deliveryStateStatus === "en_route_to_delivery" ||
              deliveryStateStatus === "reached_drop" ||
              deliveryStateStatus === "at_delivery";

            const hasAcceptedDeliveryPhase =
              deliveryPhase === "en_route_to_pickup" ||
              deliveryPhase === "at_pickup" ||
              deliveryPhase === "picked_up" ||
              deliveryPhase === "en_route_to_delivery" ||
              deliveryPhase === "en_route_to_drop" ||
              deliveryPhase === "at_delivery";

            const isPostPickupOrderState = orderStatus === "out_for_delivery";

            return (
              hasExplicitAcceptanceMarker ||
              hasAcceptedDeliveryState ||
              hasAcceptedDeliveryPhase ||
              isPostPickupOrderState
            );
          });

          if (activeAssignedOrder && !selectedRestaurantRef.current) {
            const restaurantAddress = resolveStoreAddressFromOrder(
              activeAssignedOrder,
              "Restaurant address",
            );
            const customerCoords =
              extractCustomerCoordsFromOrder(activeAssignedOrder);
            const estimatedEarnings =
              activeAssignedOrder.estimatedEarnings || 0;
            const estimatedEarningValue =
              typeof estimatedEarnings === "object" &&
              estimatedEarnings?.totalEarning != null
                ? Number(estimatedEarnings.totalEarning) || 0
                : Number(estimatedEarnings) || 0;

            const restoredAssignedRestaurant = {
              id:
                activeAssignedOrder._id?.toString() ||
                activeAssignedOrder.orderId,
              orderId: activeAssignedOrder.orderId,
              name: activeAssignedOrder.restaurantId?.name || "Restaurant",
              address: normalizeAddressLabel(
                restaurantAddress,
                "Restaurant address not available",
              ),
              lat: activeAssignedOrder.restaurantId?.location?.coordinates?.[1],
              lng: activeAssignedOrder.restaurantId?.location?.coordinates?.[0],
              distance:
                formatDistanceKm(
                  activeAssignedOrder?.assignmentInfo?.distance,
                ) ||
                normalizeDistanceLabel(activeAssignedOrder?.pickupDistance) ||
                "Distance not available",
              timeAway: "N/A",
              dropDistance:
                formatDistanceKm(
                  activeAssignedOrder?.assignmentInfo?.distance ||
                    activeAssignedOrder?.deliveryState?.routeToDelivery
                      ?.distance,
                ) ||
                normalizeDistanceLabel(activeAssignedOrder?.dropDistance) ||
                "Distance not available",
              pickupDistance:
                formatDistanceKm(
                  activeAssignedOrder?.assignmentInfo?.distance,
                ) ||
                normalizeDistanceLabel(activeAssignedOrder?.pickupDistance) ||
                "Distance not available",
              estimatedEarnings: estimatedEarnings,
              customerName: activeAssignedOrder.userId?.name || "Customer",
              customerPhone: activeAssignedOrder.userId?.phone || null,
              customerAddress:
                activeAssignedOrder.address?.formattedAddress ||
                (activeAssignedOrder.address?.street
                  ? `${activeAssignedOrder.address.street}, ${activeAssignedOrder.address.city || ""}, ${activeAssignedOrder.address.state || ""}`.trim()
                  : "Customer address"),
              customerLat: customerCoords?.lat,
              customerLng: customerCoords?.lng,
              items: activeAssignedOrder.items || [],
              total: activeAssignedOrder.pricing?.total || 0,
              payment: activeAssignedOrder.payment?.method || "COD",
              amount: estimatedEarningValue,
              orderStatus: activeAssignedOrder.status || "",
              status: activeAssignedOrder.status || "",
              deliveryState: activeAssignedOrder.deliveryState || {},
              deliveryPhase:
                activeAssignedOrder.deliveryState?.currentPhase || "",
            };

            const orderStatus = String(
              restoredAssignedRestaurant?.orderStatus ||
                restoredAssignedRestaurant?.status ||
                "",
            ).toLowerCase();
            const deliveryPhase = String(
              restoredAssignedRestaurant?.deliveryPhase ||
                restoredAssignedRestaurant?.deliveryState?.currentPhase ||
                "",
            ).toLowerCase();
            const deliveryStateStatus = String(
              restoredAssignedRestaurant?.deliveryState?.status || "",
            ).toLowerCase();

            const isAtDelivery =
              deliveryPhase === "at_delivery" ||
              deliveryStateStatus === "reached_drop" ||
              deliveryStateStatus === "at_delivery";

            const isInDeliveryPhase =
              orderStatus === "out_for_delivery" ||
              deliveryPhase === "en_route_to_delivery" ||
              deliveryPhase === "en_route_to_drop" ||
              deliveryPhase === "picked_up" ||
              deliveryStateStatus === "order_confirmed" ||
              deliveryStateStatus === "en_route_to_delivery";

            const isAtPickup =
              deliveryPhase === "at_pickup" ||
              deliveryStateStatus === "reached_pickup";

            const isPickupPhase =
              !isAtDelivery &&
              !isInDeliveryPhase &&
              !isAtPickup &&
              (orderStatus === "accepted" ||
                orderStatus === "preparing" ||
                orderStatus === "ready" ||
                deliveryStateStatus === "accepted" ||
                deliveryPhase === "en_route_to_pickup");

            setSelectedRestaurant(restoredAssignedRestaurant);
            selectedRestaurantRef.current = restoredAssignedRestaurant;
            setShowNewOrderPopup(false);
            setShowreachedPickupPopup(isPickupPhase);
            setShowOrderIdConfirmationPopup(isAtPickup);
            setShowReachedDropPopup(isInDeliveryPhase);
            setShowOrderDeliveredAnimation(isAtDelivery);

            try {
              localStorage.setItem(
                "deliveryActiveOrder",
                JSON.stringify({
                  orderId:
                    restoredAssignedRestaurant.id ||
                    restoredAssignedRestaurant.orderId,
                  restaurantInfo: restoredAssignedRestaurant,
                  acceptedAt:
                    activeAssignedOrder?.deliveryState?.acceptedAt ||
                    new Date().toISOString(),
                  progress: {
                    showreachedPickupPopup: isPickupPhase,
                    showOrderIdConfirmationPopup: isAtPickup,
                    showReachedDropPopup: isInDeliveryPhase,
                    showOrderDeliveredAnimation: isAtDelivery,
                  },
                }),
              );
            } catch (storageError) {
              console.warn(
                "Failed to persist assigned order restore:",
                storageError,
              );
            }

            console.log(
              "[OK] Restored assigned order flow from API:",
              restoredAssignedRestaurant.orderId,
            );
            return;
          }

          console.log(`? Found ${orders.length} assigned order(s)`);

          // Filter out orders that are already accepted or delivered

          const pendingOrders = orders.filter((order) => {
            if (zoneCheckReady && isOutOfZone) {
              return false;
            }

            const orderStatus = order.status;

            const deliveryPhase = order.deliveryState?.currentPhase;

            // Skip if already delivered or completed

            if (orderStatus === "delivered" || deliveryPhase === "completed") {
              return false;
            }

            const hasExplicitAcceptanceMarker = Boolean(
              order?.deliveryState?.acceptedAt ||
              order?.deliveryState?.acceptedBy ||
              order?.assignmentInfo?.acceptedAt ||
              String(
                order?.assignmentInfo?.notificationPhase || "",
              ).toLowerCase() === "accepted",
            );

            // Skip only when order is in post-accept flow.
            if (
              (order.deliveryState?.status === "accepted" &&
                hasExplicitAcceptanceMarker) ||
              order.deliveryState?.status === "reached_pickup" ||
              order.deliveryState?.status === "order_confirmed" ||
              deliveryPhase === "en_route_to_pickup" ||
              deliveryPhase === "at_pickup" ||
              deliveryPhase === "en_route_to_delivery" ||
              deliveryPhase === "at_delivery"
            ) {
              return false;
            }

            return true;
          });

          if (pendingOrders.length > 0) {
            console.log(
              `?? Found ${pendingOrders.length} new pending order(s) to show`,
            );

            // Show the first pending order as a new order notification

            const firstOrder = pendingOrders[0];

            const orderId = firstOrder.orderId || firstOrder._id?.toString();

            // Check if this order is already being shown or accepted

            if (
              isOrderAlreadyAccepted(
                orderId,
                firstOrder?.orderId,
                firstOrder?._id?.toString(),
              )
            ) {
              console.log("?? Order already accepted, skipping:", orderId);

              return;
            }

            // Transform order data to match selectedRestaurant format

            // Fetch restaurant address with proper priority

            const restaurantAddress = resolveStoreAddressFromOrder(
              firstOrder,
              "Restaurant address",
            );

            console.log(
              "?? Restaurant address extracted from assigned order:",
              {
                address: normalizeAddressLabel(
                  restaurantAddress,
                  "Restaurant address not available",
                ),

                hasRestaurantId: !!firstOrder.restaurantId,

                hasLocation: !!firstOrder.restaurantId?.location,
              },
            );

            // Calculate pickup distance if not provided

            let pickupDistance = null;

            if (firstOrder.assignmentInfo?.distance) {
              pickupDistance = `${firstOrder.assignmentInfo.distance.toFixed(2)} km`;
            } else {
              // Try to calculate from driver's current location to restaurant

              const currentLocation = riderLocation || lastLocationRef.current;

              const restaurantLat =
                firstOrder.restaurantId?.location?.coordinates?.[1];

              const restaurantLng =
                firstOrder.restaurantId?.location?.coordinates?.[0];

              if (
                currentLocation &&
                currentLocation.length === 2 &&
                restaurantLat &&
                restaurantLng &&
                !isNaN(restaurantLat) &&
                !isNaN(restaurantLng)
              ) {
                // Calculate distance in meters, then convert to km

                const distanceInMeters = calculateDistance(
                  currentLocation[0],

                  currentLocation[1],

                  restaurantLat,

                  restaurantLng,
                );

                const distanceInKm = distanceInMeters / 1000;

                pickupDistance = `${distanceInKm.toFixed(2)} km`;
              }
            }

            // Default to 'Calculating...' if still no distance

            if (!pickupDistance) {
              pickupDistance = "Distance not available";
            }

            const customerCoords = extractCustomerCoordsFromOrder(firstOrder);

            const estimatedEarnings = firstOrder.estimatedEarnings || 0;
            const estimatedEarningValue =
              typeof estimatedEarnings === "object" &&
              estimatedEarnings?.totalEarning != null
                ? Number(estimatedEarnings.totalEarning) || 0
                : Number(estimatedEarnings) || 0;

            const restaurantData = {
              id: firstOrder._id?.toString() || firstOrder.orderId,

              orderId: firstOrder.orderId,

              name: firstOrder.restaurantId?.name || "Restaurant",

              address: normalizeAddressLabel(
                restaurantAddress,
                "Restaurant address not available",
              ),

              lat: firstOrder.restaurantId?.location?.coordinates?.[1],

              lng: firstOrder.restaurantId?.location?.coordinates?.[0],

              distance: pickupDistance,
              timeAway: normalizeDistanceLabel(pickupDistance)
                ? calculateTimeAway(pickupDistance)
                : "N/A",
              dropDistance:
                formatDistanceKm(
                  firstOrder?.assignmentInfo?.distance ||
                    firstOrder?.deliveryState?.routeToDelivery?.distance,
                ) ||
                normalizeDistanceLabel(firstOrder?.dropDistance) ||
                "Distance not available",
              pickupDistance: pickupDistance,
              estimatedEarnings: estimatedEarnings,

              customerName: firstOrder.userId?.name || "Customer",
              customerPhone: firstOrder.userId?.phone || null,

              customerAddress:
                firstOrder.address?.formattedAddress ||
                (firstOrder.address?.street
                  ? `${firstOrder.address.street}, ${firstOrder.address.city || ""}, ${firstOrder.address.state || ""}`.trim()
                  : "Customer address"),

              customerLat: customerCoords?.lat,

              customerLng: customerCoords?.lng,

              items: firstOrder.items || [],

              total: firstOrder.pricing?.total || 0,

              payment: firstOrder.payment?.method || "COD",

              amount: estimatedEarningValue,
            };

            void restaurantData;
            // Do not preload popup restaurant data from startup sync.
            // Do not auto-open popup during startup sync.
            // Keep existing popup state untouched during sync fetch.
            console.log(
              "Pending order found during sync; skipping auto-popup:",
              orderId,
            );
          } else {
            console.log("?? No pending orders found");
          }
        } else {
          console.log("?? No orders in response or response format unexpected");
        }
      } catch (error) {
        console.error("? Error fetching assigned orders:", error);

        // Don't show error to user, just log it
      } finally {
        fetchAssignedOrdersInFlightRef.current = false;
      }
    },
    [
      isOnline,
      isCashInHandLimitReached,
      calculateTimeAway,
      isOrderAlreadyAccepted,
    ],
  );

  // Fetch assigned orders when delivery person goes online

  useEffect(() => {
    if (isOnline) {
      // Small delay to ensure socket connection is established

      const timeoutId = setTimeout(() => {
        fetchAssignedOrders();
      }, 2000); // Wait 2 seconds after going online

      return () => clearTimeout(timeoutId);
    }
  }, [isOnline, fetchAssignedOrders]);

  // Also fetch orders on initial page load if already online

  useEffect(() => {
    // Check if delivery person is already online when component mounts

    const storedOnlineStatus = localStorage.getItem("delivery_online_status");

    const isCurrentlyOnline = storedOnlineStatus === "true" || isOnline;

    if (isCurrentlyOnline) {
      // Fetch orders after a short delay to ensure everything is initialized

      const timeoutId = setTimeout(() => {
        fetchAssignedOrders();
      }, 3000); // Wait 3 seconds on page load

      return () => clearTimeout(timeoutId);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Fetch bank details status and delivery partner status

  useEffect(() => {
    const checkBankDetails = async () => {
      try {
        const response = await deliveryAPI.getProfile();

        if (response?.data?.success && response?.data?.data?.profile) {
          const profile = response.data.data.profile;
          const normalizePhoneDigits = (value) =>
            String(value || "").replace(/\D/g, "");
          const phoneCandidates = [
            profile?.phone,
            profile?.mobile,
            profile?.mobileNumber,
            profile?.phoneNumber,
            profile?.contactNumber,
            profile?.ownerPhone,
            profile?.documents?.phone,
          ];
          const isSimulationAllowed = phoneCandidates.some((phoneValue) => {
            const digits = normalizePhoneDigits(phoneValue);
            return (
              digits === ROUTE_SIMULATION_TEST_PHONE ||
              digits.endsWith(ROUTE_SIMULATION_TEST_PHONE)
            );
          });
          setCanUseRouteSimulation(isSimulationAllowed);
          if (!isSimulationAllowed) {
            setIsRouteSimulationEnabled(false);
            setIsRouteSimulationRunning(false);
          }

          const bankDetails = profile?.documents?.bankDetails;

          // Store delivery partner status first

          if (profile?.status) {
            setDeliveryStatus(profile.status);
          }

          // Store rejection reason if status is blocked

          if (profile?.status === "blocked" && profile?.rejectionReason) {
            setRejectionReason(profile.rejectionReason);
          } else {
            setRejectionReason(null);
          }

          // Only check bank details if status is approved/active

          // Pending users don't need bank details check

          if (profile?.status && profile.status !== "pending") {
            // Check if all required bank details fields are filled

            const isFilled = !!(
              bankDetails?.accountHolderName?.trim() &&
              bankDetails?.accountNumber?.trim() &&
              bankDetails?.ifscCode?.trim() &&
              bankDetails?.bankName?.trim()
            );

            setBankDetailsFilled(isFilled);
          } else {
            // For pending status, don't show bank details banner

            setBankDetailsFilled(true); // Set to true to hide banner
          }
        }
      } catch (error) {
        // Only log error if it's not a network or timeout error (backend might be down/slow)

        if (
          error.code !== "ERR_NETWORK" &&
          error.code !== "ECONNABORTED" &&
          !error.message?.includes("timeout")
        ) {
          console.error("Error checking bank details:", error);
        }

        // Default to showing the bank details banner if we can't check (only for approved users)

        // For network/timeout errors, DON'T override deliveryStatus to 'pending'

        // so that already-approved riders don't see the verification banner again.

        if (
          error.code === "ERR_NETWORK" ||
          error.code === "ECONNABORTED" ||
          error.message?.includes("timeout")
        ) {
          // Keep existing deliveryStatus; just hide bank-details banner so UI doesn't block

          setBankDetailsFilled(true);
        } else {
          setBankDetailsFilled(false);
        }
      }
    };

    checkBankDetails();

    // Listen for profile updates

    const handleProfileRefresh = () => {
      checkBankDetails();
    };

    window.addEventListener("deliveryProfileRefresh", handleProfileRefresh);

    return () => {
      window.removeEventListener(
        "deliveryProfileRefresh",
        handleProfileRefresh,
      );
    };
  }, []);

  // Handle reverify (resubmit for approval)

  const handleReverify = async () => {
    try {
      setIsReverifying(true);

      await deliveryAPI.reverify();

      // Refresh profile to get updated status

      const response = await deliveryAPI.getProfile();

      if (response?.data?.success && response?.data?.data?.profile) {
        const profile = response.data.data.profile;

        setDeliveryStatus(profile.status);

        setRejectionReason(null);
      }

      alert(
        "Your request has been resubmitted for verification. Admin will review it soon.",
      );
    } catch (err) {
      console.error("Error reverifying:", err);

      alert(
        err.response?.data?.message ||
          "Failed to resubmit request. Please try again.",
      );
    } finally {
      setIsReverifying(false);
    }
  };

  // Ola Maps SDK check removed

  // Re-run map init when container might have become available (ref can be null on first run)

  const [mapInitRetry, setMapInitRetry] = useState(0);

  // Initialize Google Map - Preserve map across navigation, re-attach when returning

  useEffect(() => {
    if (showHomeSections) {
      return;
    }

    if (!mapContainerRef.current) {
      if (mapInitRetry < 10) {
        const timer = setTimeout(() => setMapInitRetry((r) => r + 1), 200);

        return () => clearTimeout(timer);
      }

      return;
    }

    // Store preserved state for re-initialization after navigation

    let preservedState = null;

    // If map instance exists, preserve state before re-initializing

    if (window.deliveryMapInstance) {
      const existingMap = window.deliveryMapInstance;

      const existingBikeMarker = bikeMarkerRef.current;

      const existingPolyline = routePolylineRef.current;

      // Check if map is already attached to current container

      try {
        const mapDiv = existingMap.getDiv();

        if (mapDiv && mapDiv === mapContainerRef.current) {
          return; // Map is already properly attached, no need to re-initialize
        }
      } catch (error) {
        // Map div check failed, will re-initialize

        console.log("[LOC] Map container check failed, will re-initialize");
      }

      // Store map state safely

      try {
        preservedState = {
          center: existingMap.getCenter(),

          zoom: existingMap.getZoom(),

          bikeMarkerPosition: null,

          bikeMarkerHeading: null,

          hasPolyline: !!existingPolyline,
        };

        // Store bike marker state

        if (existingBikeMarker) {
          const pos = existingBikeMarker.getPosition();

          if (pos) {
            preservedState.bikeMarkerPosition = {
              lat: pos.lat(),
              lng: pos.lng(),
            };

            // Get heading from icon rotation if available

            const icon = existingBikeMarker.getIcon();

            if (
              icon &&
              typeof icon === "object" &&
              icon.rotation !== undefined
            ) {
              preservedState.bikeMarkerHeading = icon.rotation;
            }
          }
        }
      } catch (error) {
        console.warn("[WARN] Error preserving map state:", error);

        preservedState = null;
      }

      // Remove markers from old map before clearing (safely)

      try {
        if (
          existingBikeMarker &&
          typeof existingBikeMarker.setMap === "function"
        ) {
          existingBikeMarker.setMap(null);
        }

        if (existingPolyline && typeof existingPolyline.setMap === "function") {
          existingPolyline.setMap(null);
        }
      } catch (error) {
        console.warn("[WARN] Error removing markers from old map:", error);
      }

      // Clear old map instance reference (will be re-created below)

      // Markers preserved in refs, will be re-attached after map initialization

      window.deliveryMapInstance = null;
    }

    // Load Google Maps if not already loaded.

    // Cost optimization: avoid any secondary loader path and rely on single app-level script.

    const loadGoogleMapsIfNeeded = async () => {
      setMapLoading(true);

      if (window.google && window.google.maps) {
        const constructorsReady = await ensureGoogleMapsConstructors();

        if (constructorsReady) {
          await new Promise((resolve) => setTimeout(resolve, 100));

          initializeGoogleMap();

          return;
        }
      }

      const existingScript = document.querySelector(
        'script[src*="maps.googleapis.com"]',
      );

      if (!existingScript && !window.__googleMapsLoading) {
        try {
          window.__googleMapsLoading = true;

          const apiKey = await getGoogleMapsApiKey();

          if (!apiKey) {
            throw new Error("Google Maps API key not available");
          }

          const script = document.createElement("script");

          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,drawing&loading=async`;

          script.async = true;

          script.defer = true;

          document.head.appendChild(script);
        } catch (error) {
          console.error(
            "Google Maps script/key unavailable:",
            error?.message || error,
          );

          window.__googleMapsLoading = false;

          setMapLoading(false);

          if (mapInitRetry < 30) {
            setTimeout(() => setMapInitRetry((r) => r + 1), 800);
          }

          return;
        }
      }

      const maxAttempts = 200; // 20 seconds max wait for app-level script load

      let attempts = 0;

      while (
        (!window.google ||
          !window.google.maps ||
          typeof window.google.maps.Map !== "function") &&
        attempts < maxAttempts
      ) {
        if (
          window.google?.maps &&
          typeof window.google.maps.Map !== "function"
        ) {
          await ensureGoogleMapsConstructors();
        }

        await new Promise((resolve) => setTimeout(resolve, 100));

        attempts++;
      }

      const constructorsReady = await ensureGoogleMapsConstructors();

      if (!window.google || !window.google.maps || !constructorsReady) {
        console.error("Google Maps failed to load from shared script");

        window.__googleMapsLoading = false;

        setMapLoading(false);

        if (mapInitRetry < 30) {
          setTimeout(() => setMapInitRetry((r) => r + 1), 1000);
        }

        return;
      }

      await initializeGoogleMap();
    };

    loadGoogleMapsIfNeeded();

    async function initializeGoogleMap() {
      try {
        // Wait for map container ref to be available

        if (!mapContainerRef.current) {
          let attempts = 0;

          const maxAttempts = 50; // 5 seconds max wait

          while (!mapContainerRef.current && attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 100));

            attempts++;
          }

          if (!mapContainerRef.current) {
            console.error(
              "[ERROR] Map container ref is still null after waiting",
            );

            setMapLoading(false);

            return;
          }
        }

        const constructorsReady = await ensureGoogleMapsConstructors();

        if (!window.google || !window.google.maps || !constructorsReady) {
          console.error("[ERROR] Google Maps API not available");

          setMapLoading(false);

          return;
        }

        setMapLoading(true);

        // Get location from multiple sources (priority: riderLocation > saved location > wait for GPS)

        let initialCenter = null;

        if (riderLocation && riderLocation.length === 2) {
          // Use current rider location

          initialCenter = { lat: riderLocation[0], lng: riderLocation[1] };
        } else {
          // Try to get from localStorage (saved location from previous session)

          const cachedLocation = readCachedDeliveryLocation();

          if (cachedLocation) {
            initialCenter = { lat: cachedLocation[0], lng: cachedLocation[1] };
          }
        }

        // If still no location, use default India center so map always loads.

        // When GPS location is received, map will recenter and show bike marker.

        if (!initialCenter) {
          initialCenter = { lat: 20.5937, lng: 78.9629 };
        }

        // Check if MapTypeId is available, use string fallback if not

        // Always use string 'roadmap' to avoid MapTypeId enum issues

        const mapTypeId =
          window.google?.maps?.MapTypeId?.ROADMAP !== undefined
            ? window.google.maps.MapTypeId.ROADMAP
            : "roadmap";

        console.log("[LOC] Google Maps API check:", {
          google: !!window.google,

          maps: !!window.google?.maps,

          MapTypeId: !!window.google?.maps?.MapTypeId,

          ROADMAP: window.google?.maps?.MapTypeId?.ROADMAP !== undefined,
        });

        // Wrap map initialization in try-catch to handle any Google Maps internal errors

        let map;

        try {
          map = new window.google.maps.Map(mapContainerRef.current, {
            center: initialCenter,

            zoom: 18,

            minZoom: 10, // Minimum zoom level (city/area view)

            maxZoom: 21, // Maximum zoom level - allow full zoom

            mapTypeId: mapTypeId,

            tilt: 45,

            heading: 0,

            disableDefaultUI: false,

            zoomControl: true,

            mapTypeControl: false,

            streetViewControl: false,

            fullscreenControl: false,
          });
        } catch (mapError) {
          console.error("[ERROR] Error creating Google Map:", mapError);

          console.error("[ERROR] Error details:", {
            message: mapError.message,

            name: mapError.name,

            stack: mapError.stack,
          });

          setMapLoading(false);

          return;
        }

        // Store map instance

        window.deliveryMapInstance = map;

        // Add error listener for map errors (if available)

        try {
          if (window.google.maps.event) {
            window.google.maps.event.addListenerOnce(
              map,
              "tilesloaded",
              () => {},
            );
          }
        } catch (eventError) {
          console.warn("[WARN] Could not add map event listeners:", eventError);
        }

        // Add error listener for map errors

        window.google.maps.event.addListenerOnce(map, "tilesloaded", () => {});

        // Handle map errors

        window.google.maps.event.addListener(map, "error", (error) => {
          console.error("[ERROR] Google Map error:", error);
        });

        // Track user panning to disable auto-center when user manually moves map

        let isUserPanning = false;

        let panTimeout = null;

        map.addListener("dragstart", () => {
          isUserPanning = true;

          isUserPanningRef.current = true;

          if (panTimeout) clearTimeout(panTimeout);
        });

        map.addListener("dragend", () => {
          // Re-enable auto-center after 5 seconds of no panning

          panTimeout = setTimeout(() => {
            isUserPanning = false;

            isUserPanningRef.current = false;
          }, 5000);
        });

        // Also track zoom changes as user interaction

        map.addListener("zoom_changed", () => {
          isUserPanning = true;

          isUserPanningRef.current = true;

          if (panTimeout) clearTimeout(panTimeout);

          panTimeout = setTimeout(() => {
            isUserPanning = false;

            isUserPanningRef.current = false;
          }, 5000);

          // Allow full zoom - no limit

          // Removed zoom limit to allow full zoom in
        });

        // Restore preserved state if coming back from navigation

        if (preservedState) {
          if (preservedState.center && preservedState.zoom) {
            map.setCenter(preservedState.center);

            map.setZoom(preservedState.zoom);
          }

          // Re-create bike marker if it existed before navigation

          if (preservedState.bikeMarkerPosition && isOnlineRef.current) {
            createOrUpdateBikeMarker(
              preservedState.bikeMarkerPosition.lat,

              preservedState.bikeMarkerPosition.lng,

              preservedState.bikeMarkerHeading,

              false, // Don't center when restoring from navigation
            );
          }

          // Don't re-attach route polyline on refresh - only show if there's an active order

          // This prevents showing default/mock polylines on page refresh

          if (
            preservedState.hasPolyline &&
            routePolylineRef.current &&
            selectedRestaurant
          ) {
            // Only re-attach if we have an active order

            if (routeHistoryRef.current.length >= 2) {
              routePolylineRef.current.setMap(map);
            }
          } else if (!selectedRestaurant && routePolylineRef.current) {
            // Clear polyline if no active order

            routePolylineRef.current.setMap(null);

            routePolylineRef.current = null;
          }

          // Clear live tracking polyline if no active order

          if (!selectedRestaurant && liveTrackingPolylineRef.current) {
            liveTrackingPolylineRef.current.setMap(null);

            liveTrackingPolylineRef.current = null;
          }

          if (!selectedRestaurant && liveTrackingPolylineShadowRef.current) {
            liveTrackingPolylineShadowRef.current.setMap(null);

            liveTrackingPolylineShadowRef.current = null;
          }
        } else {
          // Initialize route history with current location (first time initialization)

          if (riderLocation && riderLocation.length === 2) {
            routeHistoryRef.current = [
              {
                lat: riderLocation[0],

                lng: riderLocation[1],
              },
            ];

            lastLocationRef.current = riderLocation;

            // Always add bike marker if location is available (both online and offline)

            createOrUpdateBikeMarker(
              riderLocation[0],
              riderLocation[1],
              null,
              true,
            );
          }
        }

        map.addListener("tilesloaded", () => {
          setMapLoading(false);

          // Ensure bike marker is visible after tiles load (always show, both online and offline)

          if (riderLocation && riderLocation.length === 2) {
            setTimeout(() => {
              if (
                !bikeMarkerRef.current ||
                bikeMarkerRef.current.getMap() === null
              ) {
                createOrUpdateBikeMarker(
                  riderLocation[0],
                  riderLocation[1],
                  null,
                );
              }
            }, 500);
          } else {
            // Try to get location from localStorage if current location not available

            const cachedLocation = readCachedDeliveryLocation();

            if (cachedLocation) {
              setTimeout(() => {
                createOrUpdateBikeMarker(
                  cachedLocation[0],
                  cachedLocation[1],
                  null,
                );
              }, 500);
            }
          }

          // Ensure restaurant marker is visible if we have a selected restaurant

          if (
            selectedRestaurant &&
            selectedRestaurant.lat &&
            selectedRestaurant.lng
          ) {
            setTimeout(() => {
              if (
                !restaurantMarkerRef.current ||
                restaurantMarkerRef.current.getMap() === null
              ) {
                const restaurantLocation = {
                  lat: selectedRestaurant.lat,

                  lng: selectedRestaurant.lng,
                };

                restaurantMarkerRef.current = new window.google.maps.Marker({
                  position: restaurantLocation,

                  map: window.deliveryMapInstance,

                  icon: {
                    url:
                      "data:image/svg+xml;charset=UTF-8," +
                      encodeURIComponent(`


                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">


                        <circle cx="12" cy="12" r="11" fill="#FF6B35" stroke="#FFFFFF" stroke-width="2"/>


                        <path d="M8 10c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v6H8v-6z" fill="#FFFFFF"/>


                        <path d="M7 16h10M10 12h4M9 14h6" stroke="#FF6B35" stroke-width="1.5" stroke-linecap="round"/>


                        <path d="M10 8h4v2h-4z" fill="#FFFFFF" opacity="0.7"/>


                      </svg>


                    `),

                    scaledSize: new window.google.maps.Size(48, 48),

                    anchor: new window.google.maps.Point(24, 48),
                  },

                  title: selectedRestaurant.name || "Restaurant",

                  zIndex: 10,
                });
              }
            }, 500);
          }

          // Load and draw nearby zones after map is ready

          setTimeout(() => {
            fetchAndDrawNearbyZones();
          }, 1000);
        });
      } catch (error) {
        console.error("[ERROR] Error initializing Google Map:", error);

        setMapLoading(false);
      }
    }

    // Cleanup function - DON'T clear map instance on navigation (preserve it for return)

    return () => {
      // Preserve map instance and markers for navigation

      // Map will be re-initialized when component mounts again

      // Don't clear map instance - preserve it in window.deliveryMapInstance

      // Don't clear bike marker - preserve it in bikeMarkerRef

      // Only temporarily remove polyline from map (preserve reference)

      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);

        // Don't set to null - preserve reference for re-attachment
      }
    };
  }, [showHomeSections, mapInitRetry, ensureGoogleMapsConstructors]); // Re-run when showHomeSections or container retry

  // When slider returns to map view, force Google Maps to recalculate layout.

  // Without this, map tiles can stay blank/misaligned after container transitions.

  useEffect(() => {
    if (showHomeSections) return;

    if (!window.google?.maps || !window.deliveryMapInstance) return;

    const map = window.deliveryMapInstance;

    const refreshMapLayout = () => {
      try {
        window.google.maps.event.trigger(map, "resize");

        const riderLat = riderLocation?.[0];

        const riderLng = riderLocation?.[1];

        const hasRiderLocation =
          Number.isFinite(riderLat) && Number.isFinite(riderLng);

        // Keep the map viewport stable after resize; do not auto-pan/zoom here.

        if (bikeMarkerRef.current && bikeMarkerRef.current.getMap() !== map) {
          bikeMarkerRef.current.setMap(map);
        }

        if (
          restaurantMarkerRef.current &&
          restaurantMarkerRef.current.getMap() !== map
        ) {
          restaurantMarkerRef.current.setMap(map);
        }

        if (
          customerMarkerRef.current &&
          customerMarkerRef.current.getMap() !== map
        ) {
          customerMarkerRef.current.setMap(map);
        }

        setMapLoading(false);
      } catch (error) {
        console.warn("Map reflow after slider transition failed:", error);
      }
    };

    // Run immediately and after transition frames settle.

    const timers = [0, 180, 420].map((delay) =>
      setTimeout(refreshMapLayout, delay),
    );

    return () => timers.forEach((id) => clearTimeout(id));
  }, [
    showHomeSections,
    riderLocation?.[0],
    riderLocation?.[1],
    selectedRestaurant?.id,
  ]);

  // Initialize map when riderLocation becomes available (if map not already initialized)

  useEffect(() => {
    if (showHomeSections) return;

    if (!riderLocation || riderLocation.length !== 2) return;

    if (window.deliveryMapInstance) return; // Map already initialized

    if (
      !window.google ||
      !window.google.maps ||
      typeof window.google.maps.Map !== "function"
    )
      return; // Google Maps not loaded yet

    if (!mapContainerRef.current) return; // Container not ready

    console.log("[LOC] Rider location available, initializing map...");

    // Map initialization will happen in the main useEffect, but we can trigger it

    // by calling initializeGoogleMap directly

    const initializeMap = async () => {
      try {
        const initialCenter = { lat: riderLocation[0], lng: riderLocation[1] };

        console.log(
          "[LOC] Initializing map with rider location:",
          initialCenter,
        );

        if (
          !window.google ||
          !window.google.maps ||
          typeof window.google.maps.Map !== "function"
        ) {
          const constructorsReady = await ensureGoogleMapsConstructors();

          if (!constructorsReady) return;
        }

        const map = new window.google.maps.Map(mapContainerRef.current, {
          center: initialCenter,

          zoom: 18,

          minZoom: 10,

          maxZoom: 21,

          mapTypeId: window.google.maps.MapTypeId?.ROADMAP || "roadmap",

          tilt: 45,

          heading: 0,

          disableDefaultUI: false,

          zoomControl: true,

          mapTypeControl: false,

          streetViewControl: false,

          fullscreenControl: false,
        });

        window.deliveryMapInstance = map;

        console.log("[OK] Map initialized with rider location");

        // Create bike marker

        createOrUpdateBikeMarker(
          riderLocation[0],
          riderLocation[1],
          null,
          true,
        );

        setMapLoading(false);
      } catch (error) {
        console.error(
          "[ERROR] Error initializing map with rider location:",
          error,
        );

        setMapLoading(false);
      }
    };

    initializeMap();
  }, [riderLocation, showHomeSections, ensureGoogleMapsConstructors]); // Initialize when location is available

  // Update bike marker when going online - ensure bike appears immediately

  useEffect(() => {
    console.log("[SYNC] Online status effect triggered:", {
      isOnline,

      showHomeSections,

      hasMap: !!window.deliveryMapInstance,

      riderLocation,
    });

    if (showHomeSections || !window.deliveryMapInstance) {
      return;
    }

    // Always show bike marker on map (both offline and online)

    // When going online/offline, ensure bike marker is visible at current location IMMEDIATELY

    if (riderLocation && riderLocation.length === 2) {
      // Calculate heading if we have previous location

      let heading = null;

      if (lastLocationRef.current) {
        const [prevLat, prevLng] = lastLocationRef.current;

        heading = calculateHeading(
          prevLat,
          prevLng,
          riderLocation[0],
          riderLocation[1],
        );
      }

      // Create or update bike marker IMMEDIATELY (blue dot की जगह bike icon)

      createOrUpdateBikeMarker(
        riderLocation[0],
        riderLocation[1],
        heading,
        true,
      );

      // Keep camera stable; update marker only.

      // Initialize route history if empty

      if (routeHistoryRef.current.length === 0) {
        routeHistoryRef.current = [
          {
            lat: riderLocation[0],

            lng: riderLocation[1],
          },
        ];
      }

      // Update route polyline only if there's an active order

      if (selectedRestaurant) {
        updateRoutePolyline();
      } else {
        // Clear any existing polylines if no active order

        if (routePolylineRef.current) {
          routePolylineRef.current.setMap(null);

          routePolylineRef.current = null;
        }

        if (liveTrackingPolylineRef.current) {
          liveTrackingPolylineRef.current.setMap(null);

          liveTrackingPolylineRef.current = null;
        }

        if (liveTrackingPolylineShadowRef.current) {
          liveTrackingPolylineShadowRef.current.setMap(null);

          liveTrackingPolylineShadowRef.current = null;
        }
      }
    } else {
      // Try to get location from localStorage if current location not available

      const cachedLocation = readCachedDeliveryLocation();

      if (cachedLocation) {
        console.log("[LOC] Using recent cached location:", cachedLocation);

        createOrUpdateBikeMarker(
          cachedLocation[0],
          cachedLocation[1],
          null,
          true,
        );
      } else {
      }
    }
  }, [isOnline, riderLocation, showHomeSections]);

  // Safeguard: Ensure bike marker and restaurant marker stay on map (prevent them from disappearing)

  // Always show bike marker regardless of online/offline status

  useEffect(() => {
    if (showHomeSections || !window.deliveryMapInstance) return;

    // Check every 2 seconds if markers are still on map

    const checkInterval = setInterval(() => {
      // Check bike marker

      if (riderLocation && riderLocation.length === 2) {
        if (bikeMarkerRef.current) {
          const markerMap = bikeMarkerRef.current.getMap();

          if (markerMap === null) {
            createOrUpdateBikeMarker(
              riderLocation[0],
              riderLocation[1],
              null,
              false,
            );
          }
        } else {
          // Marker doesn't exist, create it

          createOrUpdateBikeMarker(
            riderLocation[0],
            riderLocation[1],
            null,
            false,
          );
        }
      }

      // Check restaurant marker

      if (
        selectedRestaurant &&
        selectedRestaurant.lat &&
        selectedRestaurant.lng
      ) {
        if (restaurantMarkerRef.current) {
          const markerMap = restaurantMarkerRef.current.getMap();

          if (markerMap === null || markerMap !== window.deliveryMapInstance) {
            const restaurantLocation = {
              lat: selectedRestaurant.lat,

              lng: selectedRestaurant.lng,
            };

            restaurantMarkerRef.current.setMap(window.deliveryMapInstance);

            restaurantMarkerRef.current.setPosition(restaurantLocation);
          }
        } else {
          // Marker doesn't exist, create it

          const restaurantLocation = {
            lat: selectedRestaurant.lat,

            lng: selectedRestaurant.lng,
          };

          restaurantMarkerRef.current = new window.google.maps.Marker({
            position: restaurantLocation,

            map: window.deliveryMapInstance,

            icon: {
              url:
                "data:image/svg+xml;charset=UTF-8," +
                encodeURIComponent(`


                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">


                  <circle cx="12" cy="12" r="11" fill="#FF6B35" stroke="#FFFFFF" stroke-width="2"/>


                  <path d="M8 10c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v6H8v-6z" fill="#FFFFFF"/>


                  <path d="M7 16h10M10 12h4M9 14h6" stroke="#FF6B35" stroke-width="1.5" stroke-linecap="round"/>


                  <path d="M10 8h4v2h-4z" fill="#FFFFFF" opacity="0.7"/>


                </svg>


              `),

              scaledSize: new window.google.maps.Size(48, 48),

              anchor: new window.google.maps.Point(24, 48),
            },

            title: selectedRestaurant.name || "Restaurant",

            zIndex: 10,
          });
        }
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(checkInterval);
  }, [riderLocation, selectedRestaurant, showHomeSections]);

  // Create restaurant marker when selectedRestaurant changes

  useEffect(() => {
    if (
      !window.deliveryMapInstance ||
      !selectedRestaurant ||
      !selectedRestaurant.lat ||
      !selectedRestaurant.lng
    ) {
      return;
    }

    // Only create marker if it doesn't exist or is on wrong map

    if (
      !restaurantMarkerRef.current ||
      restaurantMarkerRef.current.getMap() !== window.deliveryMapInstance
    ) {
      const restaurantLocation = {
        lat: selectedRestaurant.lat,

        lng: selectedRestaurant.lng,
      };

      // Remove old marker if exists

      if (restaurantMarkerRef.current) {
        restaurantMarkerRef.current.setMap(null);
      }

      // Create new restaurant marker

      restaurantMarkerRef.current = new window.google.maps.Marker({
        position: restaurantLocation,

        map: window.deliveryMapInstance,

        icon: {
          url:
            "data:image/svg+xml;charset=UTF-8," +
            encodeURIComponent(`


            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">


              <circle cx="12" cy="12" r="11" fill="#FF6B35" stroke="#FFFFFF" stroke-width="2"/>


              <path d="M8 10c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v6H8v-6z" fill="#FFFFFF"/>


              <path d="M7 16h10M10 12h4M9 14h6" stroke="#FF6B35" stroke-width="1.5" stroke-linecap="round"/>


              <path d="M10 8h4v2h-4z" fill="#FFFFFF" opacity="0.7"/>


            </svg>


          `),

          scaledSize: new window.google.maps.Size(48, 48),

          anchor: new window.google.maps.Point(24, 48),
        },

        title: selectedRestaurant.name || "Restaurant",

        animation: window.google.maps.Animation.DROP,

        zIndex: 10,
      });
    } else {
      // Update position if marker exists

      restaurantMarkerRef.current.setPosition({
        lat: selectedRestaurant.lat,

        lng: selectedRestaurant.lng,
      });

      restaurantMarkerRef.current.setTitle(
        selectedRestaurant.name || "Restaurant",
      );
    }
  }, [
    selectedRestaurant?.lat,
    selectedRestaurant?.lng,
    selectedRestaurant?.name,
  ]);

  // Auto-switch destination context from restaurant -> customer once pickup is complete.

  useEffect(() => {
    if (!selectedRestaurant) {
      if (navigationMode !== "restaurant") {
        setNavigationMode("restaurant");
      }

      return;
    }

    const orderStatus = String(
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "",
    ).toLowerCase();

    const deliveryPhase = String(
      selectedRestaurant?.deliveryPhase ||
        selectedRestaurant?.deliveryState?.currentPhase ||
        "",
    ).toLowerCase();

    const deliveryStateStatus = String(
      selectedRestaurant?.deliveryState?.status || "",
    ).toLowerCase();

    const isCustomerLeg =
      orderStatus === "out_for_delivery" ||
      orderStatus === "picked_up" ||
      deliveryPhase === "picked_up" ||
      deliveryPhase === "en_route_to_delivery" ||
      deliveryStateStatus === "order_confirmed" ||
      deliveryStateStatus === "en_route_to_delivery" ||
      hasBillProof;

    const nextMode = isCustomerLeg ? "customer" : "restaurant";

    if (navigationMode !== nextMode) {
      setNavigationMode(nextMode);
    }
  }, [
    selectedRestaurant,

    selectedRestaurant?.orderStatus,

    selectedRestaurant?.status,

    selectedRestaurant?.deliveryPhase,

    selectedRestaurant?.deliveryState?.currentPhase,

    selectedRestaurant?.deliveryState?.status,

    hasBillProof,

    navigationMode,
  ]);

  // Keep a dedicated customer marker synced on the main map during delivery leg.

  useEffect(() => {
    if (showHomeSections || !window.deliveryMapInstance) {
      if (customerMarkerRef.current) {
        customerMarkerRef.current.setMap(null);
      }

      return;
    }

    const customerLat = Number(selectedRestaurant?.customerLat);

    const customerLng = Number(selectedRestaurant?.customerLng);

    const hasCustomerCoords =
      Number.isFinite(customerLat) &&
      Number.isFinite(customerLng) &&
      !(customerLat === 0 && customerLng === 0);

    const orderStatus = String(
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "",
    ).toLowerCase();
    const deliveryPhase = String(
      selectedRestaurant?.deliveryPhase ||
        selectedRestaurant?.deliveryState?.currentPhase ||
        "",
    ).toLowerCase();
    const deliveryStateStatus = String(
      selectedRestaurant?.deliveryState?.status || "",
    ).toLowerCase();
    const isDeliveredOrCompleted =
      orderStatus === "delivered" ||
      orderStatus === "completed" ||
      deliveryPhase === "delivered" ||
      deliveryPhase === "completed" ||
      deliveryStateStatus === "delivered";

    const shouldShowCustomerMarker =
      (navigationMode === "customer" || hasBillProof) &&
      hasCustomerCoords &&
      !isDeliveredOrCompleted;

    if (!shouldShowCustomerMarker) {
      if (customerMarkerRef.current) {
        customerMarkerRef.current.setMap(null);
      }

      return;
    }

    const customerUserPinIconUrl =
      "data:image/svg+xml;charset=UTF-8," +
      encodeURIComponent(`


      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">


        <path d="M18 0 C8.06 0 0 8.06 0 18 C0 30.5 18 46 18 46 C18 46 36 30.5 36 18 C36 8.06 27.94 0 18 0 Z" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>


        <circle cx="18" cy="14" r="4.2" fill="white"/>


        <path d="M10.5 24 C11.8 20.6 14.6 18.8 18 18.8 C21.4 18.8 24.2 20.6 25.5 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"/>


      </svg>


    `);

    const position = { lat: customerLat, lng: customerLng };

    const icon = {
      url: customerUserPinIconUrl,

      scaledSize: new window.google.maps.Size(36, 46),

      anchor: new window.google.maps.Point(18, 46),
    };

    if (!customerMarkerRef.current) {
      customerMarkerRef.current = new window.google.maps.Marker({
        position,

        map: window.deliveryMapInstance,

        icon,

        title: selectedRestaurant?.customerName || "Customer",

        zIndex: 25,
      });
    } else {
      customerMarkerRef.current.setPosition(position);

      customerMarkerRef.current.setIcon(icon);

      customerMarkerRef.current.setTitle(
        selectedRestaurant?.customerName || "Customer",
      );

      customerMarkerRef.current.setMap(window.deliveryMapInstance);
    }
  }, [
    showHomeSections,

    navigationMode,

    selectedRestaurant?.customerLat,

    selectedRestaurant?.customerLng,

    selectedRestaurant?.customerName,

    selectedRestaurant?.orderStatus,

    selectedRestaurant?.status,

    selectedRestaurant?.deliveryPhase,

    selectedRestaurant?.deliveryState?.currentPhase,

    selectedRestaurant?.deliveryState?.status,

    selectedRestaurant?.billImageUrl,

    selectedRestaurant?.deliveryState?.billImageUrl,

    billImageUploaded,
  ]);

  // Calculate a road-snapped route using Google Maps DirectionsService.

  // NOTE: Must be defined BEFORE the useEffect that uses it (Rules of Hooks)

  const calculateRouteWithDirectionsAPI = useCallback(
    async (origin, destination) => {
      if (
        !window.google ||
        !window.google.maps ||
        !Array.isArray(origin) ||
        !destination
      ) {
        return null;
      }

      const round = (value) => Math.round(Number(value) * 10000) / 10000;

      const cacheKey = [
        round(origin?.[0]),

        round(origin?.[1]),

        round(destination?.lat),

        round(destination?.lng),
      ].join("|");

      const now = Date.now();

      const cacheTtlMs = 120000;

      const cached = directionsRouteCacheRef.current.get(cacheKey);

      if (cached && now - cached.timestamp < cacheTtlMs) {
        setDirectionsResponse(cached.result);

        directionsResponseRef.current = cached.result;

        return cached.result;
      }

      const startLat = Number(origin[0]);

      const startLng = Number(origin[1]);

      const endLat = Number(destination?.lat);

      const endLng = Number(destination?.lng);

      if (
        !Number.isFinite(startLat) ||
        !Number.isFinite(startLng) ||
        !Number.isFinite(endLat) ||
        !Number.isFinite(endLng)
      ) {
        return null;
      }

      if (typeof window.google.maps.DirectionsService !== "function") {
        throw new Error("Directions service not available");
      }

      const service = new window.google.maps.DirectionsService();

      const result = await new Promise((resolve, reject) => {
        service.route(
          {
            origin: { lat: startLat, lng: startLng },

            destination: { lat: endLat, lng: endLng },

            travelMode: window.google.maps.TravelMode.DRIVING,

            provideRouteAlternatives: false,
          },

          (response, status) => {
            if (
              status === window.google.maps.DirectionsStatus.OK &&
              response?.routes?.length
            ) {
              resolve(response);

              return;
            }

            reject(new Error(`Directions request failed: ${status}`));
          },
        );
      });

      setDirectionsResponse(result);

      directionsResponseRef.current = result;

      directionsRouteCacheRef.current.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });

      const expireBefore = Date.now() - cacheTtlMs * 5;

      for (const [key, value] of directionsRouteCacheRef.current.entries()) {
        if (!value?.timestamp || value.timestamp < expireBefore) {
          directionsRouteCacheRef.current.delete(key);
        }
      }

      return result;
    },
    [],
  );

  /**


   * Update live tracking polyline - Rapido/Zomato style


   * Removes polyline points behind the rider and keeps only forward route


   * @param {Object} directionsResult - Google Maps DirectionsResult


   * @param {Array} riderPosition - [lat, lng] Current rider position


   */

  const updateLiveTrackingPolyline = useCallback(
    (directionsResult, riderPosition) => {
      if (!directionsResult || !window.google || !window.google.maps) {
        return;
      }

      // CRITICAL: Don't create/update polyline if there's no active order

      // This prevents showing default/mock polylines on page refresh

      // But allow it if we're going to restaurant (not customer)

      // Note: We can't use selectedRestaurant directly in callback, so we'll check it in the calling code

      // For now, just proceed - the calling code will handle the checks

      try {
        // Extract and decode full polyline from directions result

        const fullPolyline = extractPolylineFromDirections(directionsResult);

        if (fullPolyline.length < 2) {
          return;
        }

        // Store full polyline for future updates

        fullRoutePolylineRef.current = fullPolyline;

        // Resolve rider position with robust fallbacks so route still renders on refresh/reconnect.
        // Priority:
        // 1) explicit riderPosition arg
        // 2) last known location ref
        // 3) first point of full polyline (so route is still visible even before GPS resolves)
        const riderPositionArray =
          Array.isArray(riderPosition) &&
          riderPosition.length === 2 &&
          Number.isFinite(Number(riderPosition[0])) &&
          Number.isFinite(Number(riderPosition[1]))
            ? [Number(riderPosition[0]), Number(riderPosition[1])]
            : Array.isArray(lastLocationRef.current) &&
                lastLocationRef.current.length === 2 &&
                Number.isFinite(Number(lastLocationRef.current[0])) &&
                Number.isFinite(Number(lastLocationRef.current[1]))
              ? [
                  Number(lastLocationRef.current[0]),
                  Number(lastLocationRef.current[1]),
                ]
              : null;

        const riderPos = riderPositionArray
          ? { lat: riderPositionArray[0], lng: riderPositionArray[1] }
          : {
              lat: Number(fullPolyline?.[0]?.lat ?? 0),
              lng: Number(fullPolyline?.[0]?.lng ?? 0),
            };

        if (!Number.isFinite(riderPos.lat) || !Number.isFinite(riderPos.lng)) {
          return;
        }

        // Find nearest point on polyline to rider

        const { segmentIndex, nearestPoint, distance } =
          findNearestPointOnPolyline(fullPolyline, riderPos);

        // Trim polyline to remove points behind rider

        const trimmedPolyline = trimPolylineBehindRider(
          fullPolyline,
          nearestPoint,
          segmentIndex,
        );

        // IMPORTANT: Start polyline from bike's actual position, not from nearest point on route

        // This ensures the polyline always starts at the bike's current location

        const path = [
          new window.google.maps.LatLng(riderPos.lat, riderPos.lng), // Start from bike position

          ...trimmedPolyline.map(
            (point) => new window.google.maps.LatLng(point.lat, point.lng),
          ),
        ];

        // Update or create live tracking polyline with Zomato/Rapido style

        if (liveTrackingPolylineRef.current) {
          // Update existing polyline path smoothly

          liveTrackingPolylineRef.current.setPath(path);

          // Ensure it's on the map

          if (liveTrackingPolylineRef.current.getMap() === null) {
            liveTrackingPolylineRef.current.setMap(window.deliveryMapInstance);
          }

          // Update shadow polyline if it exists

          if (liveTrackingPolylineShadowRef.current) {
            liveTrackingPolylineShadowRef.current.setPath(path);

            if (liveTrackingPolylineShadowRef.current.getMap() === null) {
              liveTrackingPolylineShadowRef.current.setMap(
                window.deliveryMapInstance,
              );
            }
          }
        } else {
          // Create new polyline with professional Zomato/Rapido styling

          if (!window.deliveryMapInstance) {
            return;
          }

          // Create main polyline with vibrant blue color (Zomato style)

          liveTrackingPolylineRef.current = new window.google.maps.Polyline({
            path: path,

            geodesic: true,

            strokeColor: "#1E88E5", // Vibrant blue like Zomato (more visible than #4285F4)

            strokeOpacity: 1.0,

            strokeWeight: 6, // Optimal thickness for visibility

            zIndex: 1000, // High z-index to be above other map elements

            icons: [], // No icons/dots - clean solid line

            map: window.deliveryMapInstance,
          });

          // Create shadow/outline polyline for better visibility (like Zomato/Rapido)

          // This creates a subtle outline effect for better contrast

          if (!liveTrackingPolylineShadowRef.current) {
            liveTrackingPolylineShadowRef.current =
              new window.google.maps.Polyline({
                path: path,

                geodesic: true,

                strokeColor: "#FFFFFF", // White shadow/outline

                strokeOpacity: 0.6,

                strokeWeight: 10, // Slightly thicker for shadow effect

                zIndex: 999, // Behind main polyline

                icons: [],

                map: window.deliveryMapInstance,
              });
          } else {
            liveTrackingPolylineShadowRef.current.setPath(path);
          }
        }
      } catch (error) {
        console.error("[ERROR] Error updating live tracking polyline:", error);
      }
    },
    [],
  );

  /**


   * Smoothly animate rider marker to new position with rotation


   * @param {Array} newPosition - [lat, lng] New rider position


   * @param {number} heading - Heading/bearing in degrees (0-360)


   */

  const animateRiderMarker = useCallback((newPosition, heading) => {
    if (!window.google || !window.google.maps || !bikeMarkerRef.current) {
      return;
    }

    const [newLat, newLng] = newPosition;

    const currentPosition = lastRiderPositionRef.current || {
      lat: newLat,
      lng: newLng,
    };

    // Cancel any existing animation

    if (markerAnimationCancelRef.current) {
      markerAnimationCancelRef.current();
    }

    // Animate marker smoothly

    const cancelAnimation = animateMarker(
      currentPosition,

      { lat: newLat, lng: newLng },

      500, // 500ms animation duration

      (interpolated) => {
        if (bikeMarkerRef.current) {
          // Update marker position

          bikeMarkerRef.current.setPosition({
            lat: interpolated.lat,

            lng: interpolated.lng,
          });

          // Update rotation if heading available

          if (heading !== null && heading !== undefined) {
            getRotatedBikeIcon(heading).then((rotatedIconUrl) => {
              if (bikeMarkerRef.current) {
                const currentIcon = bikeMarkerRef.current.getIcon();

                bikeMarkerRef.current.setIcon({
                  url: rotatedIconUrl,

                  scaledSize:
                    currentIcon?.scaledSize ||
                    new window.google.maps.Size(
                      BIKE_ICON_CANVAS_SIZE,
                      BIKE_ICON_CANVAS_SIZE,
                    ),

                  anchor:
                    currentIcon?.anchor ||
                    new window.google.maps.Point(
                      BIKE_ICON_CANVAS_SIZE / 2,
                      BIKE_ICON_CANVAS_SIZE / 2,
                    ),
                });
              }
            });
          }
        }
      },
    );

    markerAnimationCancelRef.current = cancelAnimation;

    lastRiderPositionRef.current = { lat: newLat, lng: newLng };
  }, []);

  // Initialize Directions Map with Google Maps Directions API (Zomato-style)

  useEffect(() => {
    if (!showDirectionsMap || !selectedRestaurant) {
      setDirectionsMapLoading(false);

      return;
    }

    // Re-initialize if navigation mode changed (restaurant -> customer or vice versa)

    if (directionsMapInstanceRef.current) {
      // Clear existing map to re-initialize with new destination

      directionsMapInstanceRef.current = null;

      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }

      if (restaurantMarkerRef.current) {
        restaurantMarkerRef.current.setMap(null);
      }

      if (directionsBikeMarkerRef.current) {
        directionsBikeMarkerRef.current.setMap(null);
      }
    }

    const initializeDirectionsMap = async () => {
      if (!window.google || !window.google.maps) {
        setTimeout(initializeDirectionsMap, 200);

        return;
      }

      if (!directionsMapContainerRef.current) {
        return;
      }

      try {
        setDirectionsMapLoading(true);

        // Get current LIVE location (delivery boy) - prioritize riderLocation which is updated in real-time

        // Use rider location or last known location, don't use default

        const currentLocation = riderLocation || lastLocationRef.current;

        if (!currentLocation) {
          console.warn("[WARN] No location available for navigation");

          return;
        }

        // Determine destination based on navigation mode

        let destinationLocation;

        let destinationName;

        if (
          navigationMode === "customer" &&
          selectedRestaurant.customerLat &&
          selectedRestaurant.customerLng
        ) {
          destinationLocation = {
            lat: selectedRestaurant.customerLat,

            lng: selectedRestaurant.customerLng,
          };

          destinationName = selectedRestaurant.customerName || "Customer";
        } else {
          destinationLocation = {
            lat: selectedRestaurant.lat,

            lng: selectedRestaurant.lng,
          };

          destinationName = selectedRestaurant.name || "Restaurant";
        }

        const directionsConstructorsReady =
          await ensureGoogleMapsConstructors();

        if (
          !directionsConstructorsReady ||
          typeof window.google?.maps?.Map !== "function"
        ) {
          throw new Error(
            "Google Maps Map constructor unavailable for directions map",
          );
        }

        // Create map instance

        const map = new window.google.maps.Map(
          directionsMapContainerRef.current,
          {
            center: { lat: currentLocation[0], lng: currentLocation[1] },

            zoom: 18,

            minZoom: 10, // Minimum zoom level (city/area view)

            maxZoom: 21, // Maximum zoom level - allow full zoom

            mapTypeId: window.google.maps.MapTypeId.ROADMAP || "roadmap",

            disableDefaultUI: false,

            zoomControl: true,

            mapTypeControl: false,

            streetViewControl: false,

            fullscreenControl: false,
          },
        );

        directionsMapInstanceRef.current = map;

        // Initialize Directions Renderer

        if (!directionsRendererRef.current) {
          // Don't create DirectionsRenderer with map - it adds dots

          // We'll extract route path and use custom polyline instead

          directionsRendererRef.current =
            new window.google.maps.DirectionsRenderer({
              suppressMarkers: true,

              polylineOptions: {
                strokeColor: "#4285F4",

                strokeWeight: 0,

                strokeOpacity: 0,

                zIndex: -1,

                icons: [],
              },

              preserveViewport: true,
            });

          // Explicitly don't set map - we use custom polyline instead
        } else {
          // Don't set map - we use custom polyline instead
          // directionsRendererRef.current.setMap(map);
        }

        // Calculate route using Directions API

        const routeResult = await calculateRouteWithDirectionsAPI(
          currentLocation,
          destinationLocation,
        );

        if (routeResult) {
          // Don't create main route polyline - only live tracking polyline will be shown

          // Remove old custom polyline if exists (cleanup)

          try {
            if (routePolylineRef.current) {
              routePolylineRef.current.setMap(null);

              routePolylineRef.current = null;
            }

            // Remove DirectionsRenderer from map

            if (directionsRendererRef.current) {
              directionsRendererRef.current.setMap(null);
            }
          } catch (e) {
            console.warn("[WARN] Error cleaning up polyline:", e);
          }

          // Fit bounds to show entire route

          const bounds = routeResult.routes[0].bounds;

          if (bounds) {
            if (isBoundsReasonable(bounds)) {
              map.fitBounds(bounds, { padding: 50 });
            } else {
            }
          }

          // Add custom Destination Marker (Restaurant or Customer)

          const markerIcon =
            navigationMode === "customer"
              ? `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`


                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">


                  <path d="M18 0 C8.06 0 0 8.06 0 18 C0 30.5 18 46 18 46 C18 46 36 30.5 36 18 C36 8.06 27.94 0 18 0 Z" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>


                  <circle cx="18" cy="14" r="4.2" fill="white"/>


                  <path d="M10.5 24 C11.8 20.6 14.6 18.8 18 18.8 C21.4 18.8 24.2 20.6 25.5 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"/>


                </svg>


              `)}`
              : `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`


                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#FF6B35">


                  <path d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"/>


                  <circle cx="12" cy="9" r="3" fill="#FFFFFF"/>


                  <path d="M8 16h2v6H8zm6 0h2v6h-2z" fill="#FFFFFF"/>


                </svg>


              `)}`;

          if (!restaurantMarkerRef.current) {
            restaurantMarkerRef.current = new window.google.maps.Marker({
              position: destinationLocation,

              map: map,

              icon: {
                url: markerIcon,

                scaledSize:
                  navigationMode === "customer"
                    ? new window.google.maps.Size(36, 46)
                    : new window.google.maps.Size(48, 48),

                anchor:
                  navigationMode === "customer"
                    ? new window.google.maps.Point(18, 46)
                    : new window.google.maps.Point(24, 48),
              },

              title: destinationName,

              animation: window.google.maps.Animation.DROP,
            });
          } else {
            restaurantMarkerRef.current.setPosition(destinationLocation);

            restaurantMarkerRef.current.setIcon({
              url: markerIcon,

              scaledSize:
                navigationMode === "customer"
                  ? new window.google.maps.Size(36, 46)
                  : new window.google.maps.Size(48, 48),

              anchor:
                navigationMode === "customer"
                  ? new window.google.maps.Point(18, 46)
                  : new window.google.maps.Point(24, 48),
            });

            restaurantMarkerRef.current.setTitle(destinationName);

            restaurantMarkerRef.current.setMap(map);
          }

          // Add custom Bike Marker (Delivery Boy)

          const directionsBaseHeading = Number.isFinite(
            lastMainMarkerHeadingRef.current,
          )
            ? lastMainMarkerHeadingRef.current
            : 0;
          lastDirectionsMarkerHeadingRef.current = normalizeHeading(
            directionsBaseHeading,
          );
          const directionsBikeIconUrl = await getRotatedBikeIcon(
            lastDirectionsMarkerHeadingRef.current,
          );

          if (!directionsBikeMarkerRef.current) {
            directionsBikeMarkerRef.current = new window.google.maps.Marker({
              position: { lat: currentLocation[0], lng: currentLocation[1] },

              map: map,

              icon: buildBikeMarkerIcon(directionsBikeIconUrl),

              title: "Your Location",

              zIndex: 100, // Bike marker should be on top
            });
          } else {
            directionsBikeMarkerRef.current.setPosition({
              lat: currentLocation[0],
              lng: currentLocation[1],
            });

            directionsBikeMarkerRef.current.setIcon(
              buildBikeMarkerIcon(directionsBikeIconUrl),
            );

            directionsBikeMarkerRef.current.setMap(map);
          }
        } else {
          // Fallback to simple polyline if Directions API fails

          if (routePolyline && routePolyline.length > 0) {
            updateRoutePolyline();
          }
        }

        setDirectionsMapLoading(false);
      } catch (error) {
        console.error("[ERROR] Error initializing directions map:", error);

        console.error("[ERROR] Error stack:", error.stack);

        setDirectionsMapLoading(false);

        // Don't crash - show error message instead

        try {
          // Fallback to simple polyline

          if (routePolyline && routePolyline.length > 0) {
            updateRoutePolyline();
          }
        } catch (fallbackError) {
          console.error("[ERROR] Fallback also failed:", fallbackError);
        }
      }
    };

    initializeDirectionsMap();

    // Cleanup function - only cleanup when showDirectionsMap becomes false

    return () => {
      if (!showDirectionsMap) {
        // Clean up directions renderer when map is closed

        try {
          if (directionsRendererRef.current) {
            directionsRendererRef.current.setMap(null);
          }

          if (restaurantMarkerRef.current) {
            restaurantMarkerRef.current.setMap(null);
          }

          if (directionsBikeMarkerRef.current) {
            directionsBikeMarkerRef.current.setMap(null);
          }

          directionsMapInstanceRef.current = null;
        } catch (cleanupError) {
          console.error("[ERROR] Error during cleanup:", cleanupError);
        }
      }
    };

    // Only re-initialize if showDirectionsMap, selectedRestaurant.id, or navigationMode changes

    // Don't include calculateRouteWithDirectionsAPI to prevent unnecessary re-renders

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showDirectionsMap,
    selectedRestaurant?.id,
    navigationMode,
    selectedRestaurant?.customerLat,
    selectedRestaurant?.customerLng,
    riderLocation,
  ]);

  // Helper function to calculate distance in meters (Haversine formula)

  const calculateDistanceInMeters = useCallback((lat1, lng1, lat2, lng2) => {
    const R = 6371000; // Earth's radius in meters

    const dLat = ((lat2 - lat1) * Math.PI) / 180;

    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }, []);

  // Update bike marker position on directions map when rider location changes

  // Optimized: Only update marker position, don't recalculate route (saves API cost)

  useEffect(() => {
    if (
      !showDirectionsMap ||
      !directionsMapInstanceRef.current ||
      !directionsBikeMarkerRef.current
    ) {
      return;
    }

    if (riderLocation && riderLocation.length === 2) {
      const newPosition = { lat: riderLocation[0], lng: riderLocation[1] };

      // Update bike marker position (smooth movement)

      directionsBikeMarkerRef.current.setPosition(newPosition);

      const previousPosition = lastBikePositionRef.current;
      let targetDirectionsHeading = lastDirectionsMarkerHeadingRef.current;
      if (previousPosition) {
        const movedMeters = calculateDistanceInMeters(
          previousPosition.lat,
          previousPosition.lng,
          newPosition.lat,
          newPosition.lng,
        );
        if (movedMeters >= 1.5) {
          targetDirectionsHeading = calculateHeading(
            previousPosition.lat,
            previousPosition.lng,
            newPosition.lat,
            newPosition.lng,
          );
        } else if (Number.isFinite(lastMainMarkerHeadingRef.current)) {
          targetDirectionsHeading = lastMainMarkerHeadingRef.current;
        }
      }

      const smoothedDirectionsHeading = smoothHeading(
        lastDirectionsMarkerHeadingRef.current,
        targetDirectionsHeading,
        20,
      );
      lastDirectionsMarkerHeadingRef.current = smoothedDirectionsHeading;

      getRotatedBikeIcon(smoothedDirectionsHeading)
        .then((rotatedIconUrl) => {
          if (!directionsBikeMarkerRef.current) return;
          directionsBikeMarkerRef.current.setIcon(
            buildBikeMarkerIcon(rotatedIconUrl),
          );
        })
        .catch(() => {});

      // Optional: Auto-center map on bike (like Zomato) - smooth pan

      // Uncomment if you want map to follow bike movement

      // directionsMapInstanceRef.current.panTo(newPosition);

      // API Cost Optimization: Only recalculate route if bike deviates significantly (>50m from route)

      // This prevents unnecessary API calls on every location update

      if (lastBikePositionRef.current) {
        const distance = calculateDistanceInMeters(
          lastBikePositionRef.current.lat,

          lastBikePositionRef.current.lng,

          newPosition.lat,

          newPosition.lng,
        );

        // Only recalculate if moved >50 meters AND last recalculation was >30 seconds ago

        const timeSinceLastRecalc =
          Date.now() - (lastRouteRecalculationRef.current || 0);

        if (
          distance > 50 &&
          timeSinceLastRecalc > 30000 &&
          selectedRestaurant
        ) {
          lastRouteRecalculationRef.current = Date.now();

          calculateRouteWithDirectionsAPI(
            [newPosition.lat, newPosition.lng],

            { lat: selectedRestaurant.lat, lng: selectedRestaurant.lng },
          )
            .then((result) => {
              if (result && result.routes && result.routes[0]) {
                // Extract route and create custom polyline (don't use DirectionsRenderer - it adds dots)

                try {
                  const route = result.routes[0];

                  if (
                    route &&
                    route.overview_path &&
                    window.deliveryMapInstance
                  ) {
                    // Don't create main route polyline - only live tracking polyline will be shown

                    // Remove old custom polyline if exists (cleanup)

                    if (routePolylineRef.current) {
                      routePolylineRef.current.setMap(null);

                      routePolylineRef.current = null;
                    }

                    // Remove DirectionsRenderer from map

                    if (directionsRendererRef.current) {
                      directionsRendererRef.current.setMap(null);
                    }
                  }
                } catch (e) {
                  console.warn("[WARN] Could not create custom polyline:", e);
                }
              }
            })
            .catch((err) => {
              // Handle REQUEST_DENIED gracefully - don't spam console

              if (
                err.message?.includes("REQUEST_DENIED") ||
                err.message?.includes("not available")
              ) {
                console.log(
                  "[WARN] Directions API not available, route update skipped",
                );
              } else {
                console.warn("[WARN] Route recalculation failed:", err);
              }
            });
        }
      }

      lastBikePositionRef.current = newPosition;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showDirectionsMap,
    riderLocation,
    selectedRestaurant?.id,
    calculateDistanceInMeters,
  ]);

  // Handle route polyline visibility and updates

  // Always use custom polyline (DirectionsRenderer is never active - it adds dots)

  useEffect(() => {
    // DirectionsRenderer is never used - we always use custom polyline

    // Remove DirectionsRenderer if it somehow got attached

    if (
      directionsRendererRef.current &&
      directionsRendererRef.current.getMap()
    ) {
      directionsRendererRef.current.setMap(null);
    }

    // Only show fallback polyline if DirectionsRenderer is NOT active

    if (
      routePolyline &&
      routePolyline.length > 0 &&
      window.deliveryMapInstance
    ) {
      updateRoutePolyline();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePolyline?.length, directionsResponse]);

  // Handle directionsResponse updates - Show route on main map when directions are calculated

  useEffect(() => {
    // Only show route if there's an active order (selectedRestaurant)

    if (!selectedRestaurant) {
      // Clear route if no active order

      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }

      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }

      return;
    }

    if (
      !directionsResponse ||
      !directionsResponse.routes ||
      directionsResponse.routes.length === 0
    ) {
      return;
    }

    if (!window.deliveryMapInstance || !window.google || !window.google.maps) {
      return;
    }

    // Clear any existing fallback polyline to avoid conflicts

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
    }

    // Keep DirectionsRenderer detached from map; we only use custom/live polylines.

    // This prevents duplicate route visuals on the feed map.

    if (!directionsRendererRef.current) {
      // Don't create DirectionsRenderer with map - it adds dots

      // We'll extract route path and use custom polyline instead

      directionsRendererRef.current = new window.google.maps.DirectionsRenderer(
        {
          suppressMarkers: true,

          suppressInfoWindows: false,

          polylineOptions: {
            strokeColor: "#4285F4",

            strokeWeight: 0,

            strokeOpacity: 0,

            zIndex: -1,

            icons: [],
          },

          markerOptions: {
            visible: false,
          },

          preserveViewport: true,
        },
      );

      // Explicitly don't set map - we use custom polyline instead
    } else {
      // Ensure renderer remains detached from main map.

      directionsRendererRef.current.setMap(null);
    }

    // Set directions response to renderer

    try {
      // Validate directionsResponse is a valid DirectionsResult object

      if (
        !directionsResponse ||
        typeof directionsResponse !== "object" ||
        !directionsResponse.routes ||
        !Array.isArray(directionsResponse.routes) ||
        directionsResponse.routes.length === 0
      ) {
        console.error(
          "[ERROR] Invalid directionsResponse:",
          directionsResponse,
        );

        return;
      }

      // Validate it's a Google Maps DirectionsResult (has status property)

      if (!directionsResponse.request || !directionsResponse.routes[0]?.legs) {
        console.error(
          "[ERROR] directionsResponse is not a valid Google Maps DirectionsResult",
        );

        return;
      }

      // Clear any existing polyline first to ensure clean render

      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }

      // Extract route path and create custom clean polyline without dots

      // Don't use DirectionsRenderer on map - it adds dots/icons

      try {
        const route = directionsResponse.routes[0];

        if (route && route.overview_path) {
          // Don't create main route polyline - only live tracking polyline will be shown

          // Remove old custom polyline if exists (cleanup)

          if (routePolylineRef.current) {
            routePolylineRef.current.setMap(null);

            routePolylineRef.current = null;
          }

          console.log("[LOC] Route details:", {
            routes: directionsResponse.routes?.length || 0,

            legs: directionsResponse.routes?.[0]?.legs?.length || 0,

            distance: directionsResponse.routes?.[0]?.legs?.[0]?.distance?.text,

            duration: directionsResponse.routes?.[0]?.legs?.[0]?.duration?.text,
          });

          // Completely remove DirectionsRenderer from map to prevent any dots/icons

          if (directionsRendererRef.current) {
            directionsRendererRef.current.setMap(null);
          }
        }
      } catch (e) {
        console.warn("[WARN] Could not create custom polyline:", e);
      }

      // Fit bounds to show entire route - but preserve zoom if user has zoomed in

      const bounds = directionsResponse.routes[0].bounds;

      if (bounds) {
        const currentZoomBeforeFit = window.deliveryMapInstance.getZoom();

        if (isBoundsReasonable(bounds)) {
          window.deliveryMapInstance.fitBounds(bounds, { padding: 100 });
        } else {
          console.warn("Skipping unsafe fitBounds on delivery map", bounds);
        }

        // Preserve zoom if user had zoomed in more than fitBounds would set

        setTimeout(() => {
          const newZoom = window.deliveryMapInstance.getZoom();

          if (currentZoomBeforeFit > newZoom && currentZoomBeforeFit >= 18) {
            window.deliveryMapInstance.setZoom(currentZoomBeforeFit);
          }
        }, 100);
      }

      // Ensure DirectionsRenderer is removed from map (we use custom polyline instead)

      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
    } catch (error) {
      console.error("[ERROR] Error setting directions on renderer:", error);

      console.error(
        "[ERROR] directionsResponse type:",
        typeof directionsResponse,
      );

      console.error("[ERROR] directionsResponse:", directionsResponse);
    }
  }, [directionsResponse, selectedRestaurant]);

  // Restore active order from localStorage on page load/refresh

  useEffect(() => {
    const restoreActiveOrder = async () => {
      isRestoringActiveOrderRef.current = true;

      try {
        const savedOrder = localStorage.getItem("deliveryActiveOrder");

        if (!savedOrder) {
          return;
        }

        const activeOrderData = JSON.parse(savedOrder);

        // Get order ID from saved data

        const orderId =
          activeOrderData.orderId ||
          activeOrderData.restaurantInfo?.id ||
          activeOrderData.restaurantInfo?.orderId;

        if (!orderId) {
          localStorage.removeItem("deliveryActiveOrder");

          setSelectedRestaurant(null);

          return;
        }

        let latestOrder = null;

        // Verify order still exists in database before restoring

        try {
          const orderResponse = await deliveryAPI.getOrderDetails(orderId);

          if (!orderResponse.data?.success || !orderResponse.data?.data) {
            localStorage.removeItem("deliveryActiveOrder");

            setSelectedRestaurant(null);

            return;
          }

          const order =
            orderResponse.data.data?.order || orderResponse.data.data;

          latestOrder = order;

          // Check if order is cancelled or deleted

          if (
            order.status === "cancelled" ||
            order.status === "delivered" ||
            order.status === "completed"
          ) {
            localStorage.removeItem("deliveryActiveOrder");

            setSelectedRestaurant(null);

            return;
          }

          // Check if order is still assigned to current delivery partner

          // (This check will be done by backend, but we can verify here too)
        } catch (verifyError) {
          // If order doesn't exist (404) or any other error, clear localStorage

          console.log(
            "[WARN] Error verifying order or order not found:",
            verifyError.response?.status || verifyError.message,
          );

          if (
            verifyError.response?.status === 404 ||
            verifyError.response?.status === 403
          ) {
            console.log(
              "[WARN] Order not found or not assigned, removing from localStorage",
            );

            localStorage.removeItem("deliveryActiveOrder");

            setSelectedRestaurant(null);

            return;
          }

          // For other errors (network, etc.), still try to restore but log warning

          console.warn(
            "[WARN] Could not verify order, but restoring anyway:",
            verifyError.message,
          );
        }

        // Check if order is still valid (not too old - e.g., within 24 hours)

        const acceptedAt = new Date(activeOrderData.acceptedAt);

        const hoursSinceAccepted =
          (Date.now() - acceptedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceAccepted > 24) {
          localStorage.removeItem("deliveryActiveOrder");

          setSelectedRestaurant(null);

          return;
        }

        // Restore selectedRestaurant state using latest backend order (fallback to localStorage)

        if (activeOrderData.restaurantInfo || latestOrder) {
          const savedRestaurant = activeOrderData.restaurantInfo || {};

          const order = latestOrder || {};

          const restaurant =
            order?.restaurantId && typeof order.restaurantId === "object"
              ? order.restaurantId
              : {};

          const restaurantCoords = restaurant?.location?.coordinates || [];

          const customerCoords = extractCustomerCoordsFromOrder(order);

          const restoredRestaurant = {
            ...savedRestaurant,

            id: order?._id || order?.id || savedRestaurant?.id,

            orderId: order?.orderId || savedRestaurant?.orderId || orderId,

            name:
              order?.restaurantName ||
              restaurant?.name ||
              savedRestaurant?.name,

            address:
              restaurant?.location?.formattedAddress ||
              restaurant?.location?.address ||
              restaurant?.address ||
              order?.restaurantAddress ||
              savedRestaurant?.address,

            lat: Number.isFinite(Number(restaurantCoords?.[1]))
              ? Number(restaurantCoords[1])
              : savedRestaurant?.lat,

            lng: Number.isFinite(Number(restaurantCoords?.[0]))
              ? Number(restaurantCoords[0])
              : savedRestaurant?.lng,

            customerName: order?.userId?.name || savedRestaurant?.customerName,
            customerPhone:
              order?.userId?.phone || savedRestaurant?.customerPhone || null,

            customerAddress:
              order?.address?.formattedAddress ||
              savedRestaurant?.customerAddress,

            customerLat: Number.isFinite(Number(customerCoords?.lat))
              ? Number(customerCoords.lat)
              : savedRestaurant?.customerLat,

            customerLng: Number.isFinite(Number(customerCoords?.lng))
              ? Number(customerCoords.lng)
              : savedRestaurant?.customerLng,

            orderStatus:
              order?.status ||
              savedRestaurant?.orderStatus ||
              savedRestaurant?.status,

            status:
              order?.status ||
              savedRestaurant?.status ||
              savedRestaurant?.orderStatus,

            deliveryState:
              order?.deliveryState || savedRestaurant?.deliveryState,

            deliveryPhase:
              order?.deliveryState?.currentPhase ||
              savedRestaurant?.deliveryPhase ||
              savedRestaurant?.deliveryState?.currentPhase,
          };

          setSelectedRestaurant(restoredRestaurant);

          selectedRestaurantRef.current = restoredRestaurant;

          const restoredOrderStatus = String(
            restoredRestaurant?.orderStatus || restoredRestaurant?.status || "",
          ).toLowerCase();

          const restoredDeliveryPhase = String(
            restoredRestaurant?.deliveryPhase ||
              restoredRestaurant?.deliveryState?.currentPhase ||
              "",
          ).toLowerCase();

          const restoredDeliveryStateStatus = String(
            restoredRestaurant?.deliveryState?.status || "",
          ).toLowerCase();
          const restoredNotificationPhase = String(
            restoredRestaurant?.assignmentInfo?.notificationPhase || "",
          ).toLowerCase();

          const isRestoredDelivered =
            restoredOrderStatus === "delivered" ||
            restoredOrderStatus === "completed" ||
            restoredDeliveryPhase === "completed" ||
            restoredDeliveryPhase === "delivered" ||
            restoredDeliveryStateStatus === "delivered";

          const isRestoredAtDelivery =
            restoredDeliveryPhase === "at_delivery" ||
            restoredDeliveryStateStatus === "reached_drop" ||
            restoredDeliveryStateStatus === "at_delivery";

          const isRestoredAtPickup =
            restoredDeliveryPhase === "at_pickup" ||
            restoredDeliveryStateStatus === "reached_pickup";

          const isRestoredInDeliveryPhase =
            restoredOrderStatus === "out_for_delivery" ||
            restoredDeliveryPhase === "picked_up" ||
            restoredDeliveryPhase === "en_route_to_delivery" ||
            restoredDeliveryStateStatus === "order_confirmed" ||
            restoredDeliveryStateStatus === "en_route_to_delivery";

          const isRestoredPickupPhase =
            !isRestoredDelivered &&
            !isRestoredAtDelivery &&
            !isRestoredAtPickup &&
            !isRestoredInDeliveryPhase &&
            (restoredOrderStatus === "accepted" ||
              restoredOrderStatus === "preparing" ||
              restoredOrderStatus === "ready" ||
              restoredDeliveryStateStatus === "accepted" ||
              restoredDeliveryPhase === "en_route_to_pickup");

          const hasAcceptedFlowState =
            restoredNotificationPhase === "accepted" ||
            restoredOrderStatus === "out_for_delivery" ||
            restoredDeliveryPhase === "en_route_to_pickup" ||
            restoredDeliveryPhase === "at_pickup" ||
            restoredDeliveryPhase === "picked_up" ||
            restoredDeliveryPhase === "en_route_to_delivery" ||
            restoredDeliveryPhase === "en_route_to_drop" ||
            restoredDeliveryPhase === "at_delivery" ||
            restoredDeliveryStateStatus === "accepted" ||
            restoredDeliveryStateStatus === "reached_pickup" ||
            restoredDeliveryStateStatus === "order_confirmed" ||
            restoredDeliveryStateStatus === "en_route_to_delivery" ||
            restoredDeliveryStateStatus === "reached_drop" ||
            restoredDeliveryStateStatus === "at_delivery";

          // Stale cache guard: if rider has not actually accepted yet, don't resume post-accept flow.
          if (!hasAcceptedFlowState) {
            localStorage.removeItem("deliveryActiveOrder");
            setSelectedRestaurant(null);
            selectedRestaurantRef.current = null;
            return;
          }

          const savedProgress = activeOrderData?.progress || {};
          const savedShowReachedPickup = Boolean(
            savedProgress?.showreachedPickupPopup,
          );
          const savedShowOrderIdConfirmation = Boolean(
            savedProgress?.showOrderIdConfirmationPopup,
          );
          const savedShowReachedDrop = Boolean(
            savedProgress?.showReachedDropPopup,
          );
          const savedShowOrderDelivered = Boolean(
            savedProgress?.showOrderDeliveredAnimation,
          );

          const shouldShowOrderDelivered =
            isRestoredAtDelivery || savedShowOrderDelivered;
          const shouldShowReachedDrop =
            !shouldShowOrderDelivered &&
            (isRestoredInDeliveryPhase || savedShowReachedDrop);
          const shouldShowOrderIdConfirmation =
            !shouldShowOrderDelivered &&
            !shouldShowReachedDrop &&
            (isRestoredAtPickup || savedShowOrderIdConfirmation);
          const shouldShowReachedPickup =
            !shouldShowOrderDelivered &&
            !shouldShowReachedDrop &&
            !shouldShowOrderIdConfirmation &&
            (isRestoredPickupPhase ||
              savedShowReachedPickup ||
              restoredOrderStatus === "accepted" ||
              restoredDeliveryStateStatus === "accepted");

          setShowNewOrderPopup(false);

          setShowreachedPickupPopup(shouldShowReachedPickup);

          setShowOrderIdConfirmationPopup(shouldShowOrderIdConfirmation);

          setShowReachedDropPopup(shouldShowReachedDrop);

          setShowOrderDeliveredAnimation(shouldShowOrderDelivered);

          const restoredBillImageUrl =
            activeOrderData?.progress?.billImageUrl ||
            activeOrderData?.billImageUrl ||
            null;
          const restoredBillImageUploaded = Boolean(
            activeOrderData?.progress?.billImageUploaded ||
            activeOrderData?.billImageUploaded ||
            restoredBillImageUrl,
          );
          const restoredBillImageSkipped = Boolean(
            activeOrderData?.progress?.billImageSkipped ||
            activeOrderData?.billImageSkipped,
          );
          setBillImageUrl(restoredBillImageUrl);
          setBillImageUploaded(restoredBillImageUploaded);
          setBillImageSkipped(restoredBillImageSkipped);

          try {
            localStorage.setItem(
              "deliveryActiveOrder",
              JSON.stringify({
                ...activeOrderData,

                orderId:
                  restoredRestaurant.id ||
                  restoredRestaurant.orderId ||
                  orderId,

                restaurantInfo: restoredRestaurant,

                acceptedAt:
                  activeOrderData.acceptedAt || new Date().toISOString(),
                billImageUrl: restoredBillImageUrl,
                billImageUploaded: restoredBillImageUploaded,
                billImageSkipped: restoredBillImageSkipped,
                progress: {
                  ...(activeOrderData.progress || {}),
                  billImageUrl: restoredBillImageUrl,
                  billImageUploaded: restoredBillImageUploaded,
                  billImageSkipped: restoredBillImageSkipped,
                  showreachedPickupPopup: shouldShowReachedPickup,
                  showOrderIdConfirmationPopup: shouldShowOrderIdConfirmation,
                  showReachedDropPopup: shouldShowReachedDrop,
                  showOrderDeliveredAnimation: shouldShowOrderDelivered,
                },
              }),
            );
          } catch (storageError) {
            console.warn(
              "[WARN] Failed to persist refreshed active order:",
              storageError,
            );
          }
        }

        // Wait for map to be ready

        const waitForMap = () => {
          if (
            !window.deliveryMapInstance ||
            !window.google ||
            !window.google.maps
          ) {
            setTimeout(waitForMap, 200);

            return;
          }

          // Recalculate route using Directions API (preferred) or use saved coordinates (fallback)

          // Don't restore directionsResponse from localStorage - Google Maps objects can't be serialized

          const restoredOrder =
            selectedRestaurantRef.current ||
            activeOrderData.restaurantInfo ||
            {};

          const restoredOrderStatus = String(
            restoredOrder?.orderStatus || restoredOrder?.status || "",
          ).toLowerCase();

          const restoredDeliveryPhase = String(
            restoredOrder?.deliveryPhase ||
              restoredOrder?.deliveryState?.currentPhase ||
              "",
          ).toLowerCase();

          const restoredDeliveryStateStatus = String(
            restoredOrder?.deliveryState?.status || "",
          ).toLowerCase();

          const isPickedUpPhase =
            restoredOrderStatus === "out_for_delivery" ||
            restoredOrderStatus === "picked_up" ||
            restoredDeliveryPhase === "en_route_to_delivery" ||
            restoredDeliveryPhase === "picked_up" ||
            restoredDeliveryStateStatus === "order_confirmed" ||
            restoredDeliveryStateStatus === "en_route_to_delivery";

          const hasCustomerLocation =
            restoredOrder?.customerLat != null &&
            restoredOrder?.customerLng != null &&
            Number.isFinite(Number(restoredOrder.customerLat)) &&
            Number.isFinite(Number(restoredOrder.customerLng)) &&
            !(
              Number(restoredOrder.customerLat) === 0 &&
              Number(restoredOrder.customerLng) === 0
            );

          const fallbackRouteCoordinates =
            (isPickedUpPhase
              ? restoredOrder?.deliveryState?.routeToDelivery?.coordinates
              : restoredOrder?.deliveryState?.routeToPickup?.coordinates) ||
            restoredOrder?.deliveryState?.routeToPickup?.coordinates ||
            restoredOrder?.deliveryState?.routeToDelivery?.coordinates ||
            activeOrderData?.routeCoordinates ||
            [];

          const destinationForRestore =
            isPickedUpPhase && hasCustomerLocation
              ? {
                  lat: Number(restoredOrder.customerLat),
                  lng: Number(restoredOrder.customerLng),
                }
              : Number.isFinite(Number(restoredOrder?.lat)) &&
                  Number.isFinite(Number(restoredOrder?.lng))
                ? {
                    lat: Number(restoredOrder.lat),
                    lng: Number(restoredOrder.lng),
                  }
                : activeOrderData.restaurantInfo &&
                    activeOrderData.restaurantInfo.lat &&
                    activeOrderData.restaurantInfo.lng
                  ? {
                      lat: activeOrderData.restaurantInfo.lat,
                      lng: activeOrderData.restaurantInfo.lng,
                    }
                  : null;

          if (
            destinationForRestore &&
            riderLocation &&
            riderLocation.length === 2
          ) {
            // Try to recalculate with Directions API first (if flag indicates we had Directions API before)

            if (activeOrderData.hasDirectionsAPI) {
              calculateRouteWithDirectionsAPI(
                riderLocation,

                destinationForRestore,
              )
                .then((result) => {
                  if (result && result.routes && result.routes.length > 0) {
                    setDirectionsResponse(result);

                    directionsResponseRef.current = result; // Store in ref for callbacks

                    // Initialize live tracking polyline for restored route

                    if (riderLocation && riderLocation.length === 2) {
                      updateLiveTrackingPolyline(result, riderLocation);
                    }
                  } else {
                    // Fallback to coordinates if Directions API fails

                    if (fallbackRouteCoordinates.length > 0) {
                      setRoutePolyline(fallbackRouteCoordinates);

                      updateRoutePolyline(fallbackRouteCoordinates);

                      setShowRoutePath(true);
                    }
                  }
                })
                .catch((err) => {
                  console.error(
                    "[ERROR] Error recalculating route with Directions API:",
                    err,
                  );

                  // Fallback to coordinates

                  if (fallbackRouteCoordinates.length > 0) {
                    setRoutePolyline(fallbackRouteCoordinates);

                    updateRoutePolyline(fallbackRouteCoordinates);

                    setShowRoutePath(true);

                    console.log(
                      "[OK] Using fallback route coordinates from localStorage",
                    );
                  }
                });
            } else if (fallbackRouteCoordinates.length > 0) {
              // Use saved coordinates if we don't have Directions API flag

              setRoutePolyline(fallbackRouteCoordinates);

              updateRoutePolyline(fallbackRouteCoordinates);

              setShowRoutePath(true);
            }
          } else if (fallbackRouteCoordinates.length > 0) {
            // Fallback: Use coordinates if restaurant info or rider location not available

            setRoutePolyline(fallbackRouteCoordinates);

            updateRoutePolyline(fallbackRouteCoordinates);

            setShowRoutePath(true);
          }
        };

        waitForMap();
      } catch (error) {
        console.error("[ERROR] Error restoring active order:", error);

        // Clear localStorage and state if there's an error

        localStorage.removeItem("deliveryActiveOrder");

        setSelectedRestaurant(null);

        setShowReachedDropPopup(false);

        setShowOrderDeliveredAnimation(false);

        setShowCustomerReviewPopup(false);

        setShowPaymentPage(false);
      } finally {
        isRestoringActiveOrderRef.current = false;
      }
    };

    restoreActiveOrder();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount - calculateRouteWithDirectionsAPI is stable

  // Ensure polyline is displayed when map becomes ready and there's an active route

  useEffect(() => {
    if (
      !selectedRestaurant ||
      !window.deliveryMapInstance ||
      !window.google ||
      !window.google.maps
    ) {
      return;
    }

    const currentDirectionsResponse = directionsResponseRef.current;

    const currentRiderLocation = riderLocation || lastLocationRef.current;

    const orderStatus =
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "";

    const deliveryPhase =
      selectedRestaurant?.deliveryPhase ||
      selectedRestaurant?.deliveryState?.currentPhase ||
      "";

    const deliveryStateStatus = selectedRestaurant?.deliveryState?.status || "";

    const isPickedUpPhase =
      orderStatus === "out_for_delivery" ||
      orderStatus === "picked_up" ||
      deliveryPhase === "en_route_to_delivery" ||
      deliveryPhase === "picked_up" ||
      deliveryStateStatus === "order_confirmed" ||
      deliveryStateStatus === "en_route_to_delivery";

    const hasCustomerLocation =
      selectedRestaurant?.customerLat != null &&
      selectedRestaurant?.customerLng != null &&
      Number.isFinite(Number(selectedRestaurant.customerLat)) &&
      Number.isFinite(Number(selectedRestaurant.customerLng)) &&
      !(
        Number(selectedRestaurant.customerLat) === 0 &&
        Number(selectedRestaurant.customerLng) === 0
      );

    const hasBillProof =
      Boolean(selectedRestaurant?.billImageUrl) ||
      Boolean(selectedRestaurant?.deliveryState?.billImageUrl) ||
      Boolean(billImageUploaded);

    // In delivery phase, only keep directions if they point to the customer.

    // This prevents showing the store/pickup route after order is picked up.

    const shouldUseCurrentDirections =
      !isPickedUpPhase ||
      (hasCustomerLocation &&
        isDirectionsRouteToLocation(
          currentDirectionsResponse,

          selectedRestaurant?.customerLat,

          selectedRestaurant?.customerLng,
        ));

    // If we have a directions response and rider location, but no polyline, create it

    if (
      currentDirectionsResponse &&
      currentDirectionsResponse.routes &&
      currentDirectionsResponse.routes.length > 0 &&
      shouldUseCurrentDirections &&
      !liveTrackingPolylineRef.current
    ) {
      updateLiveTrackingPolyline(
        currentDirectionsResponse,
        currentRiderLocation || null,
      );
    } else if (
      currentDirectionsResponse &&
      liveTrackingPolylineRef.current &&
      liveTrackingPolylineRef.current.getMap() === null
    ) {
      // Polyline exists but not on map - reattach it

      liveTrackingPolylineRef.current.setMap(window.deliveryMapInstance);

      // Also reattach shadow polyline if it exists

      if (liveTrackingPolylineShadowRef.current) {
        liveTrackingPolylineShadowRef.current.setMap(
          window.deliveryMapInstance,
        );
      }
    } else if (!shouldUseCurrentDirections) {
      if (liveTrackingPolylineRef.current) {
        liveTrackingPolylineRef.current.setMap(null);

        liveTrackingPolylineRef.current = null;
      }

      if (liveTrackingPolylineShadowRef.current) {
        liveTrackingPolylineShadowRef.current.setMap(null);

        liveTrackingPolylineShadowRef.current = null;
      }

      // Prevent stale restaurant-route directions from being reused during delivery leg.

      setDirectionsResponse(null);

      directionsResponseRef.current = null;

      fullRoutePolylineRef.current = [];
    }
  }, [
    selectedRestaurant,
    riderLocation,
    updateLiveTrackingPolyline,
    isDirectionsRouteToLocation,
  ]);

  // Clear any default/mock routes on mount if there's no active order

  useEffect(() => {
    // Clear immediately on mount if no active order

    if (
      !selectedRestaurant &&
      window.deliveryMapInstance &&
      !isRestoringActiveOrderRef.current
    ) {
      // Clear route polyline

      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);

        routePolylineRef.current = null;
      }

      // Clear live tracking polyline (customer route)

      if (liveTrackingPolylineRef.current) {
        liveTrackingPolylineRef.current.setMap(null);

        liveTrackingPolylineRef.current = null;
      }

      // Clear directions renderer

      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }

      // Clear full route polyline ref

      fullRoutePolylineRef.current = [];

      // Clear route polyline state

      setRoutePolyline([]);

      setDirectionsResponse(null);

      directionsResponseRef.current = null;

      setShowRoutePath(false);
    }

    // Wait a bit for restoreActiveOrder to complete, then check again

    const timer = setTimeout(() => {
      if (
        !selectedRestaurant &&
        window.deliveryMapInstance &&
        !isRestoringActiveOrderRef.current
      ) {
        // Clear route polyline

        if (routePolylineRef.current) {
          routePolylineRef.current.setMap(null);

          routePolylineRef.current = null;
        }

        // Clear live tracking polyline (customer route)

        if (liveTrackingPolylineRef.current) {
          liveTrackingPolylineRef.current.setMap(null);

          liveTrackingPolylineRef.current = null;
        }

        if (liveTrackingPolylineShadowRef.current) {
          liveTrackingPolylineShadowRef.current.setMap(null);

          liveTrackingPolylineShadowRef.current = null;
        }

        // Clear directions renderer

        if (directionsRendererRef.current) {
          directionsRendererRef.current.setMap(null);
        }

        // Clear full route polyline ref

        fullRoutePolylineRef.current = [];

        // Clear route polyline state

        setRoutePolyline([]);

        setDirectionsResponse(null);

        directionsResponseRef.current = null;

        setShowRoutePath(false);
      }
    }, 1000); // Wait 1 second for restoreActiveOrder to complete

    return () => clearTimeout(timer);
  }, [selectedRestaurant]);

  // Utility function to clear order data when order is deleted or cancelled

  const clearOrderData = useCallback(() => {
    localStorage.removeItem("deliveryActiveOrder");

    setSelectedRestaurant(null);

    setShowReachedDropPopup(false);

    setShowOrderDeliveredAnimation(false);

    setShowCustomerReviewPopup(false);

    setShowPaymentPage(false);

    setBillImageUrl(null);

    setBillImageUploaded(false);

    setShowNewOrderPopup(false);

    setShowreachedPickupPopup(false);

    setShowOrderIdConfirmationPopup(false);

    clearNewOrder();

    clearOrderReady();

    // Clear accepted orders list when going offline

    acceptedOrderIdsRef.current.clear();

    // Clear route polyline and directions response when order is cleared

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
    }

    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
    }

    setDirectionsResponse(null);

    directionsResponseRef.current = null;

    setRoutePolyline([]);

    setShowRoutePath(false);
  }, [clearNewOrder, clearOrderReady]);

  // Periodically verify order still exists (every 30 seconds) to catch deletions

  useEffect(() => {
    if (!selectedRestaurant?.id && !selectedRestaurant?.orderId) {
      return; // No active order to verify
    }

    const orderId = selectedRestaurant.orderId || selectedRestaurant.id;

    const verifyOrderInterval = setInterval(async () => {
      try {
        const orderResponse = await deliveryAPI.getOrderDetails(orderId);

        if (!orderResponse.data?.success || !orderResponse.data?.data) {
          clearOrderData();

          return;
        }

        const order = orderResponse.data.data;

        // Check if order is cancelled, deleted, or delivered/completed

        if (order.status === "cancelled") {
          clearOrderData();

          return;
        }

        // Check if order is delivered/completed - clear it from UI

        const isOrderDelivered =
          order.status === "delivered" ||
          order.status === "completed" ||
          order.deliveryState?.currentPhase === "completed" ||
          order.deliveryState?.status === "delivered";

        if (
          isOrderDelivered &&
          !showPaymentPage &&
          !showCustomerReviewPopup &&
          !showOrderDeliveredAnimation
        ) {
          clearOrderData();

          return;
        }

        // Update order status if it changed

        if (order.status && order.status !== selectedRestaurant.orderStatus) {
          setSelectedRestaurant((prev) => ({
            ...prev,

            orderStatus: order.status,

            status: order.status,

            deliveryPhase:
              order.deliveryState?.currentPhase || prev?.deliveryPhase,

            deliveryState: order.deliveryState || prev?.deliveryState,
          }));
        }
      } catch (error) {
        if (error.response?.status === 404 || error.response?.status === 403) {
          console.log("[WARN] Order not found or not assigned, clearing data");

          clearOrderData();
        }

        // Ignore other errors (network issues, etc.)
      }
    }, 30000); // Check every 30 seconds

    return () => {
      clearInterval(verifyOrderInterval);
    };
  }, [selectedRestaurant?.id, selectedRestaurant?.orderId, clearOrderData]);

  // Handle route polyline visibility toggle

  // Only show fallback polyline if DirectionsRenderer is NOT active

  useEffect(() => {
    // Only show route if there's an active order (selectedRestaurant)

    if (!selectedRestaurant) {
      // Clear route if no active order

      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }

      if (
        directionsRendererRef.current &&
        directionsRendererRef.current.getMap()
      ) {
        directionsRendererRef.current.setMap(null);
      }

      return;
    }

    // DirectionsRenderer is never used - we always use custom polyline

    // Remove DirectionsRenderer if it somehow got attached

    if (
      directionsRendererRef.current &&
      directionsRendererRef.current.getMap()
    ) {
      directionsRendererRef.current.setMap(null);
    }

    // Always use custom polyline (DirectionsRenderer is never active - it adds dots)

    if (routePolylineRef.current) {
      // If live-tracking route exists, suppress legacy fallback route to avoid duplicate paths.

      if (liveTrackingPolylineRef.current) {
        routePolylineRef.current.setMap(null);

        return;
      }

      const orderStatus =
        selectedRestaurant?.orderStatus || selectedRestaurant?.status || "";

      const deliveryPhase =
        selectedRestaurant?.deliveryPhase ||
        selectedRestaurant?.deliveryState?.currentPhase ||
        "";

      const deliveryStateStatus =
        selectedRestaurant?.deliveryState?.status || "";

      const isPickedUpPhase =
        orderStatus === "out_for_delivery" ||
        orderStatus === "picked_up" ||
        deliveryPhase === "en_route_to_delivery" ||
        deliveryPhase === "picked_up" ||
        deliveryStateStatus === "order_confirmed" ||
        deliveryStateStatus === "en_route_to_delivery";

      // After pickup, hide legacy/store route polyline.

      if (isPickedUpPhase) {
        routePolylineRef.current.setMap(null);

        return;
      }

      if (showRoutePath && routeHistoryRef.current.length >= 2) {
        routePolylineRef.current.setMap(window.deliveryMapInstance);
      } else if (routePolyline && routePolyline.length > 0) {
        // Show route polyline if we have route data (from order acceptance)

        routePolylineRef.current.setMap(window.deliveryMapInstance);
      } else {
        routePolylineRef.current.setMap(null);
      }
    }
  }, [showRoutePath, routePolyline, directionsResponse, selectedRestaurant]);

  // Listen for order ready event from backend (when restaurant marks order ready)

  useEffect(() => {
    if (!orderReady) return;

    console.log("[OK] Order ready event received:", orderReady);

    let restaurantInfo = selectedRestaurant;

    const order = orderReady.order || orderReady;
    const incomingOrderIds = [
      orderReady?.orderId,
      order?.orderId,
      order?._id,
      orderReady?.orderMongoId,
      orderReady?.mongoId,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    let persistedActiveOrderId = null;
    try {
      const rawActiveOrder = localStorage.getItem("deliveryActiveOrder");
      if (rawActiveOrder) {
        const parsedActiveOrder = JSON.parse(rawActiveOrder);
        persistedActiveOrderId =
          String(
            parsedActiveOrder?.orderId ||
              parsedActiveOrder?.restaurantInfo?.orderId ||
              parsedActiveOrder?.restaurantInfo?.id ||
              "",
          ).trim() || null;
      }
    } catch {
      persistedActiveOrderId = null;
    }

    const currentActiveOrderId = String(
      selectedRestaurant?.orderId ||
        selectedRestaurant?.id ||
        persistedActiveOrderId ||
        "",
    ).trim();

    // Ignore late order_ready events for orders that are not the rider's current active order.
    if (
      !currentActiveOrderId ||
      (incomingOrderIds.length > 0 &&
        !incomingOrderIds.includes(currentActiveOrderId))
    ) {
      clearOrderReady();
      return;
    }

    // Update selectedRestaurant with order data from orderReady if we don't have it

    if (
      (orderReady.orderId || order?.orderId) &&
      order &&
      !selectedRestaurant?.orderId
    ) {
      // Always prefer store saved location address from restaurantId.location

      const restaurantAddress = resolveStoreAddressFromOrder(
        order,

        orderReady?.restaurantAddress ||
          selectedRestaurant?.address ||
          "Restaurant Address",
      );

      restaurantInfo = {
        ...selectedRestaurant,

        orderId:
          order.orderId || orderReady.orderId || selectedRestaurant?.orderId,

        name:
          order.restaurantName ||
          orderReady.restaurantName ||
          order.restaurantId?.name ||
          selectedRestaurant?.name,

        address: normalizeAddressLabel(
          restaurantAddress,
          "Restaurant address not available",
        ),

        lat:
          order.restaurantId?.location?.coordinates?.[1] ||
          orderReady.restaurantLat ||
          selectedRestaurant?.lat,

        lng:
          order.restaurantId?.location?.coordinates?.[0] ||
          orderReady.restaurantLng ||
          selectedRestaurant?.lng,

        orderStatus: "ready",
      };

      setSelectedRestaurant(restaurantInfo);

      console.log(
        "[STORE] Updated restaurant info from orderReady event:",
        restaurantInfo,
      );
    } else if (selectedRestaurant) {
      // Always set orderStatus to 'ready' so location monitor shows Reached Pickup when rider is within 500m

      setSelectedRestaurant((prev) => ({ ...prev, orderStatus: "ready" }));
    }

    setShowDirectionsMap(false);

    const currentRestaurantInfo = {
      ...(restaurantInfo || selectedRestaurant || {}),

      lat:
        (restaurantInfo || selectedRestaurant)?.lat ??
        orderReady?.restaurantLat,

      lng:
        (restaurantInfo || selectedRestaurant)?.lng ??
        orderReady?.restaurantLng,
    };

    const orderStatus =
      currentRestaurantInfo?.orderStatus || currentRestaurantInfo?.status || "";

    const deliveryPhase =
      currentRestaurantInfo?.deliveryPhase ||
      currentRestaurantInfo?.deliveryState?.currentPhase ||
      "";

    const isDelivered =
      orderStatus === "delivered" ||
      deliveryPhase === "completed" ||
      deliveryPhase === "delivered" ||
      currentRestaurantInfo?.deliveryState?.status === "delivered";

    if (isDelivered) {
      clearOrderReady();

      return;
    }

    // Order is ready: show Reached Pickup popup immediately (no 500m check)

    console.log("[OK] Order ready - showing Reached Pickup popup");

    setShowreachedPickupPopup(true);

    clearOrderReady();
  }, [orderReady, selectedRestaurant]);

  // Fetch order details when Reached Pickup popup is shown to ensure we have restaurant address

  useEffect(() => {
    // Always log to see if useEffect is running

    console.log("[LOOKUP] Reached Pickup popup useEffect triggered:", {
      showreachedPickupPopup,

      hasOrderId: !!selectedRestaurant?.orderId,

      hasId: !!selectedRestaurant?.id,

      currentAddress: selectedRestaurant?.address,

      orderId: selectedRestaurant?.orderId,

      id: selectedRestaurant?.id,

      selectedRestaurantKeys: selectedRestaurant
        ? Object.keys(selectedRestaurant)
        : [],
    });

    if (!showreachedPickupPopup) {
      console.log("[NEXT] Skipping fetch - popup not shown");

      return;
    }

    const orderId = selectedRestaurant?.orderId || selectedRestaurant?.id;

    if (!orderId) {
      console.log("[NEXT] Skipping fetch - no orderId or id found");

      return;
    }

    // Always fetch to ensure we have the latest address (even if one exists, it might be incomplete)

    // Only skip if we have a valid non-default address

    if (
      selectedRestaurant?.address &&
      selectedRestaurant.address !== "Restaurant Address" &&
      selectedRestaurant.address.length > 20
    ) {
      // Valid address should be longer than default

      console.log(
        "[NEXT] Skipping fetch - address already exists and seems valid:",
        selectedRestaurant.address,
      );

      return;
    }

    const fetchOrderDetails = async () => {
      try {
        console.log(
          "[DETAILS] Fetching order details for restaurant address, orderId:",
          orderId,
        );

        const response = await deliveryAPI.getOrderDetails(orderId);

        if (response.data?.success && response.data.data) {
          const orderData = response.data.data;

          const order = orderData.order || orderData;

          // Debug: Log full order structure

          console.log(
            "[LOOKUP] Full order structure:",
            JSON.stringify(order, null, 2),
          );

          console.log("[LOOKUP] order.restaurantId:", order.restaurantId);

          console.log(
            "[LOOKUP] order.restaurantId?.location:",
            order.restaurantId?.location,
          );

          const restaurantAddress = resolveStoreAddressFromOrder(
            order,

            selectedRestaurant?.address || "Restaurant Address",
          );

          // Update selectedRestaurant with fetched address

          if (restaurantAddress && restaurantAddress !== "Restaurant Address") {
            setSelectedRestaurant((prev) => {
              const updated = {
                ...prev,

                address: restaurantAddress,
              };

              console.log(
                "[OK] Updated selectedRestaurant with fetched address:",
                {
                  oldAddress: prev?.address,

                  newAddress: restaurantAddress,

                  fullUpdated: updated,
                },
              );

              return updated;
            });
          } else {
            // If address not found in order, try fetching restaurant details by ID

            const restaurantId = order.restaurantId;

            if (
              restaurantId &&
              (typeof restaurantId === "string" ||
                typeof restaurantId === "object")
            ) {
              const restaurantIdString =
                typeof restaurantId === "string"
                  ? restaurantId
                  : restaurantId._id ||
                    restaurantId.id ||
                    restaurantId.toString();

              console.log(
                "[SYNC] Address not found in order, fetching restaurant details by ID:",
                restaurantIdString,
              );

              try {
                const storeLookup = await fetchStoreById(restaurantIdString);

                if (storeLookup?.store) {
                  const restaurant = storeLookup.store;

                  console.log("[OK] Fetched restaurant details:", restaurant);

                  // Extract address from restaurant location.formattedAddress (priority)

                  let fetchedAddress = "Restaurant Address";

                  const restLocation = restaurant.location;

                  if (restLocation?.formattedAddress) {
                    fetchedAddress = restLocation.formattedAddress;

                    console.log(
                      "[OK] Using restaurant.location.formattedAddress:",
                      fetchedAddress,
                    );
                  } else if (restaurant.address) {
                    fetchedAddress = restaurant.address;

                    console.log(
                      "[OK] Using restaurant.address:",
                      fetchedAddress,
                    );
                  } else if (restLocation?.address) {
                    fetchedAddress = restLocation.address;

                    console.log(
                      "[OK] Using restaurant.location.address:",
                      fetchedAddress,
                    );
                  } else if (restLocation?.street) {
                    const addressParts = [
                      restLocation.street,

                      restLocation.area,

                      restLocation.city,

                      restLocation.state,

                      restLocation.zipCode ||
                        restLocation.pincode ||
                        restLocation.postalCode,
                    ].filter(Boolean);

                    fetchedAddress = addressParts.join(", ");

                    console.log(
                      "[OK] Built address from restaurant location components:",
                      fetchedAddress,
                    );
                  } else if (restLocation?.addressLine1) {
                    const addressParts = [
                      restLocation.addressLine1,

                      restLocation.addressLine2,

                      restLocation.city,

                      restLocation.state,
                    ].filter(Boolean);

                    fetchedAddress = addressParts.join(", ");

                    console.log(
                      "[OK] Built address from restaurant location addressLine1:",
                      fetchedAddress,
                    );
                  } else if (restaurant.street || restaurant.city) {
                    const addressParts = [
                      restaurant.street,

                      restaurant.area,

                      restaurant.city,

                      restaurant.state,

                      restaurant.zipCode ||
                        restaurant.pincode ||
                        restaurant.postalCode,
                    ].filter(Boolean);

                    fetchedAddress = addressParts.join(", ");

                    console.log(
                      "[OK] Built address from restaurant fields:",
                      fetchedAddress,
                    );
                  }

                  // Update selectedRestaurant with fetched address and phone

                  const updates = {};

                  if (
                    fetchedAddress &&
                    fetchedAddress !== "Restaurant Address"
                  ) {
                    updates.address = fetchedAddress;
                  }

                  // Also fetch phone number from restaurant data

                  const restaurantPhone =
                    restaurant.phone ||
                    restaurant.ownerPhone ||
                    restaurant.primaryContactNumber;

                  if (restaurantPhone) {
                    updates.phone = restaurantPhone;

                    updates.ownerPhone =
                      restaurant.ownerPhone || restaurantPhone;

                    console.log(
                      "[OK] Fetched restaurant phone:",
                      restaurantPhone,
                    );
                  }

                  if (Object.keys(updates).length > 0) {
                    setSelectedRestaurant((prev) => ({
                      ...prev,

                      ...updates,
                    }));

                    console.log(
                      "[OK] Updated selectedRestaurant with restaurant API data:",
                      updates,
                    );

                    return; // Exit early since we got the data
                  } else {
                    console.warn(
                      "[WARN] Could not extract address or phone from restaurant data:",
                      {
                        restaurantKeys: Object.keys(restaurant),

                        hasLocation: !!restLocation,

                        locationKeys: restLocation
                          ? Object.keys(restLocation)
                          : [],

                        hasPhone: !!restaurant.phone,

                        hasOwnerPhone: !!restaurant.ownerPhone,

                        hasPrimaryContact: !!restaurant.primaryContactNumber,
                      },
                    );
                  }
                }
              } catch (restaurantError) {
                console.error(
                  "[ERROR] Error fetching restaurant details:",
                  restaurantError,
                );
              }
            }

            console.warn(
              "[WARN] Could not extract restaurant address from order or restaurant API:",
              {
                orderKeys: Object.keys(order),

                hasRestaurantId: !!order.restaurantId,

                restaurantIdType: typeof order.restaurantId,

                restaurantIdValue: order.restaurantId,
              },
            );
          }
        }
      } catch (error) {
        console.error(
          "[ERROR] Error fetching order details for restaurant address:",
          error,
        );
      }
    };

    fetchOrderDetails();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showreachedPickupPopup,
    selectedRestaurant?.orderId,
    selectedRestaurant?.id,
  ]);

  // Monitor delivery boy's location for "Reached Pickup" detection

  // Show "Reached Pickup" popup when delivery boy is within 500 meters of restaurant location

  useEffect(() => {
    if (!selectedRestaurant) {
      return;
    }

    // Don't show if popup is already showing, or if order hasn't been accepted yet

    if (
      showreachedPickupPopup ||
      showNewOrderPopup ||
      showOrderIdConfirmationPopup || // Don't show if order ID is already being confirmed
      showReachedDropPopup || // Don't show if already reached drop
      showOrderDeliveredAnimation || // Don't show if order is delivered
      showCustomerReviewPopup || // Don't show if showing review popup
      showPaymentPage
    ) {
      // Don't show if showing payment page

      return;
    }

    // Only show for orders that are in pickup phase (en_route_to_pickup or at_pickup)

    const deliveryPhase =
      selectedRestaurant?.deliveryPhase ||
      selectedRestaurant?.deliveryState?.currentPhase ||
      "";

    const orderStatus =
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "";

    // CRITICAL: Don't show if order is already delivered/completed

    const isDelivered =
      orderStatus === "delivered" ||
      deliveryPhase === "completed" ||
      deliveryPhase === "delivered" ||
      selectedRestaurant?.deliveryState?.status === "delivered";

    if (isDelivered) {
      // Hide popup if it's showing and order is delivered

      if (showreachedPickupPopup) {
        setShowreachedPickupPopup(false);
      }

      return;
    }

    // CRITICAL: Don't show if order ID is already confirmed (en_route_to_delivery or order_confirmed)

    const isOrderIdConfirmed =
      deliveryPhase === "en_route_to_delivery" ||
      deliveryPhase === "picked_up" ||
      deliveryPhase === "en_route_to_drop" ||
      orderStatus === "out_for_delivery" ||
      selectedRestaurant?.deliveryState?.status === "order_confirmed" ||
      selectedRestaurant?.deliveryState?.currentPhase ===
        "en_route_to_delivery" ||
      selectedRestaurant?.deliveryState?.currentPhase === "en_route_to_drop";

    if (isOrderIdConfirmed) {
      // Order ID is already confirmed, don't show Reached Pickup popup

      if (showreachedPickupPopup) {
        console.log(
          "[BLOCK] Order ID already confirmed, closing Reached Pickup popup",
        );

        setShowreachedPickupPopup(false);
      }

      return;
    }

    // Only show if order is accepted and on the way to pickup or at pickup

    const isInPickupPhase =
      deliveryPhase === "en_route_to_pickup" ||
      deliveryPhase === "at_pickup" ||
      orderStatus === "ready" ||
      orderStatus === "preparing";

    if (!isInPickupPhase) {
      return;
    }

    // Show "Reached Pickup" popup immediately when order is in pickup phase (no distance check)

    if (!showreachedPickupPopup) {
      console.log(
        "[OK] Order is in pickup phase, showing Reached Pickup popup immediately",
      );

      setShowreachedPickupPopup(true);

      // Close directions map if open

      setShowDirectionsMap(false);
    }
  }, [
    riderLocation?.[0] ?? null,

    riderLocation?.[1] ?? null,

    selectedRestaurant?.lat ?? null,

    selectedRestaurant?.lng ?? null,

    selectedRestaurant?.deliveryPhase ??
      selectedRestaurant?.deliveryState?.currentPhase ??
      null,

    selectedRestaurant?.orderStatus ?? selectedRestaurant?.status ?? null,

    Boolean(showNewOrderPopup),

    Boolean(showOrderIdConfirmationPopup),

    Boolean(showreachedPickupPopup),

    Boolean(showReachedDropPopup),

    Boolean(showOrderDeliveredAnimation),

    Boolean(showCustomerReviewPopup),

    Boolean(showPaymentPage),

    selectedRestaurant?.orderStatus,

    selectedRestaurant?.status,

    selectedRestaurant?.deliveryPhase,

    selectedRestaurant?.deliveryState?.status,

    calculateDistanceInMeters,
  ]);

  // Restore action popup based on current order phase after refresh/reconnect.

  useEffect(() => {
    if (
      !selectedRestaurant ||
      showNewOrderPopup ||
      showOrderIdConfirmationPopup ||
      showPaymentPage ||
      showCustomerReviewPopup
    ) {
      return;
    }

    const orderStatus =
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "";

    const deliveryPhase =
      selectedRestaurant?.deliveryPhase ||
      selectedRestaurant?.deliveryState?.currentPhase ||
      "";

    const deliveryStateStatus = selectedRestaurant?.deliveryState?.status || "";

    const isDelivered =
      orderStatus === "delivered" ||
      orderStatus === "completed" ||
      deliveryPhase === "completed" ||
      deliveryPhase === "delivered" ||
      deliveryStateStatus === "delivered";

    if (isDelivered) {
      return;
    }

    const isAtDelivery =
      deliveryPhase === "at_delivery" ||
      deliveryStateStatus === "reached_drop" ||
      deliveryStateStatus === "at_delivery";

    if (isAtDelivery) {
      setShowreachedPickupPopup(false);

      setShowOrderIdConfirmationPopup(false);

      setShowReachedDropPopup(false);

      setShowOrderDeliveredAnimation(true);

      return;
    }

    const isInDeliveryPhase =
      orderStatus === "out_for_delivery" ||
      deliveryPhase === "en_route_to_delivery" ||
      deliveryPhase === "picked_up" ||
      deliveryStateStatus === "order_confirmed" ||
      deliveryStateStatus === "en_route_to_delivery";

    const isAtPickup =
      deliveryPhase === "at_pickup" ||
      deliveryPhase === "picked_up" ||
      deliveryStateStatus === "reached_pickup";

    if (isAtPickup) {
      setShowreachedPickupPopup(false);

      setShowReachedDropPopup(false);

      setShowOrderDeliveredAnimation(false);

      setShowOrderIdConfirmationPopup(true);

      return;
    }

    if (isInDeliveryPhase) {
      setShowreachedPickupPopup(false);

      setShowOrderIdConfirmationPopup(false);

      setShowReachedDropPopup(true);

      return;
    }
  }, [
    selectedRestaurant?.orderStatus,

    selectedRestaurant?.status,

    selectedRestaurant?.deliveryPhase,

    selectedRestaurant?.deliveryState?.currentPhase,

    selectedRestaurant?.deliveryState?.status,

    showNewOrderPopup,

    showOrderIdConfirmationPopup,

    showPaymentPage,

    showCustomerReviewPopup,
  ]);

  // Safety restore: if an active order exists but all action popups are closed after refresh,
  // open the correct popup based on persisted delivery phase/status.
  useEffect(() => {
    if (!selectedRestaurant) return;

    const hasAnyActionPopupOpen =
      showNewOrderPopup ||
      showreachedPickupPopup ||
      showOrderIdConfirmationPopup ||
      showReachedDropPopup ||
      showOrderDeliveredAnimation ||
      showCustomerReviewPopup ||
      showPaymentPage;

    if (hasAnyActionPopupOpen) return;

    const orderStatus = String(
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "",
    ).toLowerCase();
    const deliveryPhase = String(
      selectedRestaurant?.deliveryPhase ||
        selectedRestaurant?.deliveryState?.currentPhase ||
        "",
    ).toLowerCase();
    const deliveryStateStatus = String(
      selectedRestaurant?.deliveryState?.status || "",
    ).toLowerCase();

    const isDelivered =
      orderStatus === "delivered" ||
      orderStatus === "completed" ||
      deliveryPhase === "completed" ||
      deliveryPhase === "delivered" ||
      deliveryStateStatus === "delivered";

    if (isDelivered) return;

    const isAtDelivery =
      deliveryPhase === "at_delivery" ||
      deliveryStateStatus === "reached_drop" ||
      deliveryStateStatus === "at_delivery";

    if (isAtDelivery) {
      setShowOrderDeliveredAnimation(true);
      return;
    }

    const isInDeliveryPhase =
      orderStatus === "out_for_delivery" ||
      deliveryPhase === "en_route_to_delivery" ||
      deliveryPhase === "picked_up" ||
      deliveryStateStatus === "order_confirmed" ||
      deliveryStateStatus === "en_route_to_delivery";

    if (isInDeliveryPhase) {
      setShowReachedDropPopup(true);
      return;
    }

    const isAtPickup =
      deliveryPhase === "at_pickup" || deliveryStateStatus === "reached_pickup";

    if (isAtPickup) {
      setShowOrderIdConfirmationPopup(true);
      return;
    }

    const isPickupPhase =
      orderStatus === "accepted" ||
      orderStatus === "preparing" ||
      orderStatus === "ready" ||
      deliveryPhase === "en_route_to_pickup" ||
      deliveryStateStatus === "accepted";

    if (isPickupPhase) {
      setShowNewOrderPopup(false);
      setShowreachedPickupPopup(true);
    }
  }, [
    selectedRestaurant?.orderStatus,
    selectedRestaurant?.status,
    selectedRestaurant?.deliveryPhase,
    selectedRestaurant?.deliveryState?.currentPhase,
    selectedRestaurant?.deliveryState?.status,
    showNewOrderPopup,
    showreachedPickupPopup,
    showOrderIdConfirmationPopup,
    showReachedDropPopup,
    showOrderDeliveredAnimation,
    showCustomerReviewPopup,
    showPaymentPage,
  ]);

  // CRITICAL: Monitor order status and close all pickup/delivery popups when order is delivered

  // Also clear selectedRestaurant if order is completed and payment page is closed

  useEffect(() => {
    const orderStatus =
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "";

    const deliveryPhase =
      selectedRestaurant?.deliveryPhase ||
      selectedRestaurant?.deliveryState?.currentPhase ||
      "";

    const deliveryStateStatus = selectedRestaurant?.deliveryState?.status || "";

    const isDelivered =
      orderStatus === "delivered" ||
      orderStatus === "completed" ||
      deliveryPhase === "completed" ||
      deliveryPhase === "delivered" ||
      deliveryStateStatus === "delivered" ||
      showPaymentPage ||
      showOrderDeliveredAnimation;

    if (isDelivered) {
      // Close all pickup/delivery related popups when order is delivered

      if (showreachedPickupPopup) {
        console.log("[BLOCK] Order is delivered, closing Reached Pickup popup");

        setShowreachedPickupPopup(false);
      }

      if (showOrderIdConfirmationPopup) {
        console.log(
          "[BLOCK] Order is delivered, closing Order ID Confirmation popup",
        );

        setShowOrderIdConfirmationPopup(false);
      }

      if (
        showReachedDropPopup &&
        !showOrderDeliveredAnimation &&
        !showCustomerReviewPopup
      ) {
        console.log("[BLOCK] Order is delivered, closing Reached Drop popup");

        setShowReachedDropPopup(false);
      }

      // If payment page is closed and order is delivered, clear selectedRestaurant

      if (
        !showPaymentPage &&
        !showCustomerReviewPopup &&
        !showOrderDeliveredAnimation &&
        selectedRestaurant
      ) {
        console.log(
          "[OK] Order is delivered and payment completed, clearing selectedRestaurant",
        );

        setSelectedRestaurant(null);

        localStorage.removeItem("deliveryActiveOrder");

        localStorage.removeItem("activeOrder");

        if (typeof clearNewOrder === "function") {
          clearNewOrder();
        }

        acceptedOrderIdsRef.current.clear();

        // Clear map markers and polylines

        if (routePolylineRef.current) {
          routePolylineRef.current.setMap(null);
        }

        if (liveTrackingPolylineRef.current) {
          liveTrackingPolylineRef.current.setMap(null);
        }

        if (directionsRendererRef.current) {
          directionsRendererRef.current.setMap(null);
        }
      }
    }
  }, [
    selectedRestaurant?.orderStatus,

    selectedRestaurant?.status,

    selectedRestaurant?.deliveryPhase,

    selectedRestaurant?.deliveryState?.currentPhase,

    selectedRestaurant?.deliveryState?.status,

    showPaymentPage,

    showOrderDeliveredAnimation,

    showCustomerReviewPopup,

    showreachedPickupPopup,

    showOrderIdConfirmationPopup,

    showReachedDropPopup,

    clearNewOrder,
  ]);

  // Monitor order status and switch route from restaurant to customer when order is picked up

  useEffect(() => {
    const orderStatus =
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "";

    const deliveryPhase =
      selectedRestaurant?.deliveryPhase ||
      selectedRestaurant?.deliveryState?.currentPhase ||
      "";

    const deliveryStateStatus = selectedRestaurant?.deliveryState?.status || "";

    // Check if order is picked up or out for delivery

    const isPickedUp =
      orderStatus === "out_for_delivery" ||
      orderStatus === "picked_up" ||
      deliveryPhase === "en_route_to_delivery" ||
      deliveryPhase === "picked_up" ||
      deliveryStateStatus === "order_confirmed" ||
      deliveryStateStatus === "en_route_to_delivery";

    // Check if we have valid customer location

    const hasCustomerLocation =
      selectedRestaurant?.customerLat != null &&
      selectedRestaurant?.customerLng != null &&
      Number.isFinite(Number(selectedRestaurant.customerLat)) &&
      Number.isFinite(Number(selectedRestaurant.customerLng)) &&
      !(
        Number(selectedRestaurant.customerLat) === 0 &&
        Number(selectedRestaurant.customerLng) === 0
      );

    const hasBillProof =
      Boolean(selectedRestaurant?.billImageUrl) ||
      Boolean(selectedRestaurant?.deliveryState?.billImageUrl) ||
      Boolean(billImageUploaded);

    // Use live rider location; fallback to last known location if GPS update is delayed

    const riderPos =
      riderLocation && riderLocation.length === 2
        ? riderLocation
        : lastLocationRef.current && lastLocationRef.current.length === 2
          ? lastLocationRef.current
          : null;

    const buildDeliveryOnlyFallbackRoute = () => {
      const fallbackCoords =
        selectedRestaurant?.deliveryState?.routeToDelivery?.coordinates ||
        selectedRestaurant?.routeToDelivery?.coordinates ||
        [];

      if (
        !Array.isArray(fallbackCoords) ||
        fallbackCoords.length < 2 ||
        !riderPos ||
        riderPos.length !== 2
      ) {
        return null;
      }

      const normalizedPoints = fallbackCoords

        .map((coord) => {
          if (!Array.isArray(coord) || coord.length < 2) return null;

          const lat = Number(coord[0]);

          const lng = Number(coord[1]);

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          return { lat, lng };
        })

        .filter(Boolean);

      if (normalizedPoints.length < 2) {
        return null;
      }

      const riderPoint = { lat: Number(riderPos[0]), lng: Number(riderPos[1]) };

      if (
        !Number.isFinite(riderPoint.lat) ||
        !Number.isFinite(riderPoint.lng)
      ) {
        return null;
      }

      const customerPoint = {
        lat: Number(selectedRestaurant?.customerLat),

        lng: Number(selectedRestaurant?.customerLng),
      };

      const { segmentIndex, nearestPoint } = findNearestPointOnPolyline(
        normalizedPoints,
        riderPoint,
      );

      const trimmedPoints = trimPolylineBehindRider(
        normalizedPoints,
        nearestPoint,
        segmentIndex,
      );

      const deliveryOnlyPoints = [riderPoint, ...trimmedPoints];

      if (
        Number.isFinite(customerPoint.lat) &&
        Number.isFinite(customerPoint.lng)
      ) {
        const lastPoint = deliveryOnlyPoints[deliveryOnlyPoints.length - 1];

        const sameAsCustomer =
          lastPoint &&
          Math.abs(lastPoint.lat - customerPoint.lat) < 0.00005 &&
          Math.abs(lastPoint.lng - customerPoint.lng) < 0.00005;

        if (!sameAsCustomer) {
          deliveryOnlyPoints.push(customerPoint);
        }
      }

      return deliveryOnlyPoints.map((point) => [point.lat, point.lng]);
    };

    // Only switch route when pickup is done, bill proof exists, and customer location is available.

    if (
      (isPickedUp || hasBillProof) &&
      hasCustomerLocation &&
      riderPos &&
      riderPos.length === 2
    ) {
      // Check if we already have a route to customer (avoid recalculating unnecessarily)

      const currentDirections = directionsResponseRef.current;

      const isCurrentRouteToCustomer = isDirectionsRouteToLocation(
        currentDirections,

        selectedRestaurant.customerLat,

        selectedRestaurant.customerLng,
      );

      const needsCustomerRoute =
        !currentDirections ||
        !currentDirections.routes ||
        currentDirections.routes.length === 0 ||
        !isCurrentRouteToCustomer;

      if (needsCustomerRoute) {
        // Calculate route from current location to customer

        calculateRouteWithDirectionsAPI(
          riderPos,

          {
            lat: selectedRestaurant.customerLat,
            lng: selectedRestaurant.customerLng,
          },
        )
          .then((directionsResult) => {
            if (directionsResult) {
              setDirectionsResponse(directionsResult);

              directionsResponseRef.current = directionsResult;

              // Show polyline for customer route - update live tracking polyline with new route

              if (riderPos && window.deliveryMapInstance) {
                // Update live tracking polyline with route to customer (Restaurant -> Customer)

                updateLiveTrackingPolyline(directionsResult, riderPos);
              } else {
                // Wait for map to be ready

                setTimeout(() => {
                  if (riderPos && window.deliveryMapInstance) {
                    updateLiveTrackingPolyline(directionsResult, riderPos);
                  }
                }, 500);
              }

              // Clean up old fallback polyline if exists

              if (window.deliveryMapInstance) {
                try {
                  if (routePolylineRef.current) {
                    routePolylineRef.current.setMap(null);

                    routePolylineRef.current = null;
                  }

                  // Remove DirectionsRenderer from map (we use custom polyline instead)

                  if (directionsRendererRef.current) {
                    directionsRendererRef.current.setMap(null);
                  }
                } catch (e) {
                  console.warn("[WARN] Error cleaning up old polyline:", e);
                }

                // Fit map bounds to show entire route

                const bounds = directionsResult.routes[0].bounds;

                if (bounds) {
                  const currentZoomBeforeFit =
                    window.deliveryMapInstance.getZoom();

                  if (isBoundsReasonable(bounds)) {
                    window.deliveryMapInstance.fitBounds(bounds, {
                      padding: 100,
                    });
                  } else {
                    console.warn(
                      "Skipping unsafe fitBounds on delivery map",
                      bounds,
                    );
                  }

                  // Preserve zoom if user had zoomed in

                  setTimeout(() => {
                    const newZoom = window.deliveryMapInstance.getZoom();

                    if (
                      currentZoomBeforeFit > newZoom &&
                      currentZoomBeforeFit >= 18
                    ) {
                      window.deliveryMapInstance.setZoom(currentZoomBeforeFit);
                    }
                  }, 100);
                }
              }
            } else {
              // Fallback: use backend-provided routeToDelivery polyline if Directions API is unavailable

              const fallbackDeliveryRoute = buildDeliveryOnlyFallbackRoute();

              if (
                Array.isArray(fallbackDeliveryRoute) &&
                fallbackDeliveryRoute.length > 1
              ) {
                setRoutePolyline(fallbackDeliveryRoute);

                updateRoutePolyline(fallbackDeliveryRoute);
              }
            }
          })
          .catch((error) => {
            console.warn(
              "[WARN] Error calculating route to customer after pickup:",
              error,
            );

            // Fallback on route calculation error

            const fallbackDeliveryRoute = buildDeliveryOnlyFallbackRoute();

            if (
              Array.isArray(fallbackDeliveryRoute) &&
              fallbackDeliveryRoute.length > 1
            ) {
              setRoutePolyline(fallbackDeliveryRoute);

              updateRoutePolyline(fallbackDeliveryRoute);

              console.log(
                "[OK] Using rider-to-customer fallback polyline after pickup error",
              );
            }
          });
      }
    }
  }, [
    selectedRestaurant?.orderStatus,

    selectedRestaurant?.status,

    selectedRestaurant?.deliveryPhase,

    selectedRestaurant?.deliveryState?.currentPhase,

    selectedRestaurant?.deliveryState?.status,

    selectedRestaurant?.customerLat,

    selectedRestaurant?.customerLng,

    selectedRestaurant?.deliveryState?.routeToDelivery?.coordinates,

    selectedRestaurant?.routeToDelivery?.coordinates,
    hasBillProof,

    riderLocation,

    calculateRouteWithDirectionsAPI,

    updateLiveTrackingPolyline,

    isDirectionsRouteToLocation,
  ]);

  // When out_for_delivery but customerLat/customerLng missing, fetch order details and set them

  useEffect(() => {
    if (!selectedRestaurant) {
      fetchedOrderDetailsForDropRef.current = null;

      return;
    }

    const orderStatus =
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "";

    const deliveryPhase =
      selectedRestaurant?.deliveryPhase ||
      selectedRestaurant?.deliveryState?.currentPhase ||
      "";

    const deliveryStateStatus = selectedRestaurant?.deliveryState?.status || "";

    const isOutForDelivery =
      orderStatus === "out_for_delivery" ||
      deliveryPhase === "en_route_to_delivery" ||
      deliveryStateStatus === "order_confirmed" ||
      deliveryStateStatus === "en_route_to_delivery";

    const hasBillProof =
      Boolean(selectedRestaurant?.billImageUrl) ||
      Boolean(selectedRestaurant?.deliveryState?.billImageUrl) ||
      Boolean(billImageUploaded);

    const hasCustomerCoords =
      selectedRestaurant?.customerLat != null &&
      selectedRestaurant?.customerLng != null &&
      !(
        selectedRestaurant.customerLat === 0 &&
        selectedRestaurant.customerLng === 0
      );

    const orderId = selectedRestaurant?.orderId || selectedRestaurant?.id;

    if (
      (!isOutForDelivery && !hasBillProof) ||
      hasCustomerCoords ||
      !orderId ||
      fetchedOrderDetailsForDropRef.current === orderId
    )
      return;

    fetchedOrderDetailsForDropRef.current = orderId;

    deliveryAPI
      .getOrderDetails(orderId, { suppressErrorToast: true })

      .then((res) => {
        const order = res.data?.data?.order || res.data?.order;

        const coords = order?.address?.location?.coordinates;

        const lat = coords?.[1];

        const lng = coords?.[0];

        if (
          lat != null &&
          lng != null &&
          !(lat === 0 && lng === 0) &&
          selectedRestaurant
        ) {
          setSelectedRestaurant((prev) =>
            prev ? { ...prev, customerLat: lat, customerLng: lng } : null,
          );

          console.log(
            "[OK] Reached Drop: customer location loaded from getOrderDetails",
            { lat, lng },
          );
        }
      })

      .catch((err) => {
        console.warn(
          "[WARN] Reached Drop: getOrderDetails failed for customer coords:",
          err?.response?.data?.message || err.message,
        );
      });
  }, [
    selectedRestaurant?.orderStatus,
    selectedRestaurant?.deliveryPhase,
    selectedRestaurant?.deliveryState?.currentPhase,
    selectedRestaurant?.deliveryState?.status,
    selectedRestaurant?.customerLat,
    selectedRestaurant?.customerLng,
    selectedRestaurant?.orderId,
    selectedRestaurant?.id,
    selectedRestaurant?.billImageUrl,
    selectedRestaurant?.deliveryState?.billImageUrl,
    billImageUploaded,
  ]);

  // Monitor delivery boy's location for "Reached Drop" detection

  // Show "Reached Drop" popup when delivery boy is within 500 meters of customer location

  // Use useMemo to ensure deliveryStateStatus is always defined (prevents dependency array size changes)

  const deliveryStateStatus = useMemo(() => {
    return selectedRestaurant?.deliveryState?.status ?? null;
  }, [selectedRestaurant?.deliveryState?.status]);

  useEffect(() => {
    // CRITICAL: If payment page is showing, delivery is completed - do NOT show reached drop popup

    if (
      showPaymentPage ||
      showCustomerReviewPopup ||
      showOrderDeliveredAnimation
    ) {
      if (showReachedDropPopup) setShowReachedDropPopup(false);

      return;
    }

    const orderStatus =
      selectedRestaurant?.orderStatus ||
      selectedRestaurant?.status ||
      newOrder?.status ||
      "";

    const deliveryPhase =
      selectedRestaurant?.deliveryState?.currentPhase ||
      selectedRestaurant?.deliveryPhase ||
      "";

    const isDeliveredOrCompleted =
      orderStatus === "delivered" ||
      orderStatus === "completed" ||
      deliveryPhase === "completed" ||
      deliveryPhase === "at_delivery";

    // deliveryStateStatus is defined outside useEffect using useMemo (prevents dependency array size changes)

    // More lenient check: allow if order ID is confirmed or order is out for delivery

    const isOutForDelivery =
      !isDeliveredOrCompleted &&
      (orderStatus === "out_for_delivery" ||
        deliveryPhase === "en_route_to_delivery" ||
        deliveryPhase === "picked_up" ||
        deliveryPhase === "at_delivery" ||
        deliveryStateStatus === "order_confirmed" ||
        deliveryStateStatus === "en_route_to_delivery" ||
        orderStatus === "ready");

    // Rider position: prefer riderLocation, fallback lastLocationRef

    const riderPos =
      riderLocation && riderLocation.length === 2
        ? riderLocation
        : lastLocationRef.current && lastLocationRef.current.length === 2
          ? lastLocationRef.current
          : null;

    const hasCustomerCoords =
      selectedRestaurant?.customerLat != null &&
      selectedRestaurant?.customerLng != null &&
      !(
        selectedRestaurant.customerLat === 0 &&
        selectedRestaurant.customerLng === 0
      );

    if (!hasCustomerCoords) {
      // Don't spam; only log when we're otherwise ready to monitor

      if (isOutForDelivery && !isDeliveredOrCompleted && selectedRestaurant) {
        console.warn(
          "[Reached Drop] Customer location missing. Ensure order has delivery address or wait for fetch.",
        );
      }

      return;
    }

    if (!riderPos) {
      console.log("[Reached Drop] No rider position available");

      return;
    }

    // Don't show if other popups are active (but allow if Order ID confirmation was just completed)

    // NOTE: If showReachedDropPopup is already true, don't hide it - it was explicitly set after Order ID confirmation

    if (isDeliveredOrCompleted || showNewOrderPopup || showreachedPickupPopup) {
      return;
    }

    // If Reached Drop popup is already showing, don't interfere (it was explicitly set)

    if (showReachedDropPopup) {
      return;
    }

    // Only block if Order ID confirmation popup is still actively showing

    // If it was just closed, allow Reached Drop to show

    if (showOrderIdConfirmationPopup) {
      return;
    }

    // CRITICAL: Must be in delivery phase (after Order ID confirmation)

    // Also allow if order ID confirmation was just completed (picked_up phase)

    const isInDeliveryPhase =
      isOutForDelivery ||
      deliveryPhase === "picked_up" ||
      deliveryStateStatus === "order_confirmed" ||
      orderStatus === "out_for_delivery";

    if (!isInDeliveryPhase) {
      console.log("[Reached Drop] Order not in delivery phase:", {
        orderStatus,

        deliveryPhase,

        deliveryStateStatus,

        isOutForDelivery,

        isInDeliveryPhase,
      });

      return;
    }

    const distanceInMeters = calculateDistanceInMeters(
      riderPos[0],

      riderPos[1],

      selectedRestaurant.customerLat,

      selectedRestaurant.customerLng,
    );

    // Log distance check more frequently for debugging

    if (distanceInMeters <= 600) {
      // Log when within 600m (slightly more than threshold)

      console.log(
        `[LOC] Distance to customer: ${distanceInMeters.toFixed(2)} meters`,
        {
          riderPos: riderPos,

          customerLat: selectedRestaurant.customerLat,

          customerLng: selectedRestaurant.customerLng,

          orderId: selectedRestaurant?.orderId || selectedRestaurant?.id,

          orderStatus,

          deliveryPhase,

          deliveryStateStatus,

          isOutForDelivery,

          isInDeliveryPhase,

          showReachedDropPopup,

          showOrderIdConfirmationPopup,

          showreachedPickupPopup,
        },
      );
    }

    // REMOVED: 500m distance check - Reached Drop popup now shows instantly after Order Picked Up

    // This useEffect is kept for other monitoring but won't trigger Reached Drop popup

    // The popup is now shown directly after Order Picked Up confirmation (see handleOrderIdConfirmTouchEnd)

    // Log distance for debugging (but don't show popup based on distance)

    if (distanceInMeters <= 1000) {
      console.log(
        `[LOC] Distance to customer: ${distanceInMeters.toFixed(2)} meters (popup shown instantly, not based on distance)`,
        {
          orderId: selectedRestaurant?.orderId || selectedRestaurant?.id,

          customerLocation: {
            lat: selectedRestaurant.customerLat,
            lng: selectedRestaurant.customerLng,
          },

          riderLocation: riderPos,

          orderStatus,

          deliveryPhase,

          deliveryStateStatus,
        },
      );
    }

    // Live tracking polyline is already updated automatically via watchPosition callback

    // No need to recalculate route here - it's handled in handleOrderIdConfirmTouchEnd
  }, [
    riderLocation?.[0] ?? null,

    riderLocation?.[1] ?? null,

    selectedRestaurant?.customerLat ?? null,

    selectedRestaurant?.customerLng ?? null,

    selectedRestaurant?.orderStatus ?? newOrder?.status ?? null,

    selectedRestaurant?.deliveryPhase ??
      selectedRestaurant?.deliveryState?.currentPhase ??
      null,

    deliveryStateStatus, // Use memoized value to ensure consistent dependency array size

    Boolean(showNewOrderPopup),

    Boolean(showOrderIdConfirmationPopup),

    Boolean(showreachedPickupPopup),

    Boolean(showReachedDropPopup),

    Boolean(showOrderDeliveredAnimation),

    Boolean(showCustomerReviewPopup),

    Boolean(showPaymentPage),

    calculateDistanceInMeters,
  ]);

  // Calculate heading from two coordinates (in degrees, 0-360)

  const calculateHeading = (lat1, lng1, lat2, lng2) => {
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const lat1Rad = (lat1 * Math.PI) / 180;

    const lat2Rad = (lat2 * Math.PI) / 180;

    const y = Math.sin(dLng) * Math.cos(lat2Rad);

    const x =
      Math.cos(lat1Rad) * Math.sin(lat2Rad) -
      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

    let heading = (Math.atan2(y, x) * 180) / Math.PI;

    heading = (heading + 360) % 360; // Normalize to 0-360

    return heading;
  };

  const normalizeHeading = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return ((numeric % 360) + 360) % 360;
  };

  const getShortestHeadingDelta = (fromHeading, toHeading) => {
    return ((toHeading - fromHeading + 540) % 360) - 180;
  };

  const smoothHeading = (currentHeading, targetHeading, maxStep = 22) => {
    const current = normalizeHeading(currentHeading);
    const target = normalizeHeading(targetHeading);
    const delta = getShortestHeadingDelta(current, target);
    if (Math.abs(delta) <= 0.5) return target;
    const limitedDelta = Math.max(-maxStep, Math.min(maxStep, delta));
    return normalizeHeading(current + limitedDelta);
  };

  // Cache for rotated icons to avoid recreating them

  const rotatedIconCache = useRef(new Map());

  const BIKE_ICON_CANVAS_SIZE = 60;

  const BIKE_ICON_MAX_WIDTH = 40;

  const BIKE_ICON_MAX_HEIGHT = 60;

  const buildBikeMarkerIcon = (url) => ({
    url,

    scaledSize: new window.google.maps.Size(
      BIKE_ICON_CANVAS_SIZE,
      BIKE_ICON_CANVAS_SIZE,
    ),

    anchor: new window.google.maps.Point(
      BIKE_ICON_CANVAS_SIZE / 2,
      BIKE_ICON_CANVAS_SIZE / 2,
    ),
  });

  // Function to rotate bike logo image based on heading

  const getRotatedBikeIcon = (heading = 0) => {
    // Round heading to nearest 5 degrees for caching

    const roundedHeading = Math.round(heading);

    const cacheKey = `${roundedHeading}`;

    // Check cache first

    if (rotatedIconCache.current.has(cacheKey)) {
      return Promise.resolve(rotatedIconCache.current.get(cacheKey));
    }

    return new Promise((resolve) => {
      const img = new Image();

      // Don't set crossOrigin for local images - it causes CORS issues

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");

          const size = BIKE_ICON_CANVAS_SIZE; // Icon size

          canvas.width = size;

          canvas.height = size;

          const ctx = canvas.getContext("2d");

          if (!ctx) {
            resolve(bikeLogo);

            return;
          }

          const widthScale = BIKE_ICON_MAX_WIDTH / img.width;

          const heightScale = BIKE_ICON_MAX_HEIGHT / img.height;

          const scale = Math.min(widthScale, heightScale);

          const drawWidth = img.width * scale;

          const drawHeight = img.height * scale;

          // Clear canvas

          ctx.clearRect(0, 0, size, size);

          // Move to center, rotate, then draw image

          ctx.save();

          ctx.translate(size / 2, size / 2);

          ctx.rotate((roundedHeading * Math.PI) / 180); // Convert degrees to radians

          ctx.drawImage(
            img,
            -drawWidth / 2,
            -drawHeight / 2,
            drawWidth,
            drawHeight,
          );

          ctx.restore();

          // Get data URL and cache it

          const dataUrl = canvas.toDataURL();

          rotatedIconCache.current.set(cacheKey, dataUrl);

          resolve(dataUrl);
        } catch (error) {
          console.warn("[WARN] Error rotating bike icon:", error);

          // Fallback to original image if rotation fails

          resolve(bikeLogo);
        }
      };

      img.onerror = () => {
        // Fallback to original image if loading fails

        resolve(bikeLogo);
      };

      img.src = bikeLogo;

      // If image is already loaded (cached), resolve immediately

      if (img.complete) {
        // Image already loaded, process it

        img.onload();
      }
    });
  };

  const updateBikeMarkerHeading = useCallback(
    async (latitude, longitude, heading = null) => {
      if (!bikeMarkerRef.current || !window.google || !window.google.maps) {
        return;
      }

      const markerPos = bikeMarkerRef.current.getPosition?.();
      const prevLat = markerPos?.lat?.();
      const prevLng = markerPos?.lng?.();

      let targetHeading = Number.isFinite(Number(heading))
        ? normalizeHeading(Number(heading))
        : null;

      if (
        targetHeading === null &&
        Number.isFinite(prevLat) &&
        Number.isFinite(prevLng)
      ) {
        const movedMeters = haversineDistance(
          prevLat,
          prevLng,
          latitude,
          longitude,
        );
        if (movedMeters >= 1.5) {
          targetHeading = calculateHeading(
            prevLat,
            prevLng,
            latitude,
            longitude,
          );
        }
      }

      if (targetHeading === null) {
        targetHeading = lastMainMarkerHeadingRef.current;
      }

      const smoothedHeading = smoothHeading(
        lastMainMarkerHeadingRef.current,
        targetHeading,
        26,
      );
      lastMainMarkerHeadingRef.current = smoothedHeading;

      try {
        const rotatedIconUrl = await getRotatedBikeIcon(smoothedHeading);
        if (!bikeMarkerRef.current) return;
        bikeMarkerRef.current.setIcon({
          ...buildBikeMarkerIcon(rotatedIconUrl),
        });
        bikeMarkerRef.current.setZIndex(1000);
      } catch {
        // Ignore icon rotation failures and keep current marker icon.
      }
    },
    [],
  );

  const fitMapToActiveRoute = useCallback(
    (mapInstance = null) => {
      if (!window.google || !window.google.maps) return false;

      const map = mapInstance || window.deliveryMapInstance;

      if (!map) return false;

      const currentDirections = directionsResponseRef.current;

      const primaryBounds = currentDirections?.routes?.[0]?.bounds;

      if (primaryBounds && isBoundsReasonable(primaryBounds)) {
        map.fitBounds(primaryBounds, { padding: 100 });

        return true;
      }

      const bounds = new window.google.maps.LatLngBounds();

      let pointCount = 0;

      const extendBounds = (lat, lng) => {
        const parsedLat = Number(lat);

        const parsedLng = Number(lng);

        if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return;

        bounds.extend({ lat: parsedLat, lng: parsedLng });

        pointCount += 1;
      };

      const fallbackPath = routePolylineRef.current?.getPath?.();

      if (fallbackPath && typeof fallbackPath.forEach === "function") {
        fallbackPath.forEach((point) => extendBounds(point.lat(), point.lng()));
      } else if (Array.isArray(routePolyline) && routePolyline.length > 1) {
        routePolyline.forEach((coord) => {
          if (Array.isArray(coord) && coord.length >= 2) {
            extendBounds(coord[0], coord[1]);
          }
        });
      }

      if (Array.isArray(riderLocation) && riderLocation.length === 2) {
        extendBounds(riderLocation[0], riderLocation[1]);
      }

      const activeOrder = selectedRestaurantRef.current;

      if (activeOrder) {
        extendBounds(activeOrder?.lat, activeOrder?.lng);

        extendBounds(activeOrder?.customerLat, activeOrder?.customerLng);
      }

      if (pointCount >= 2 && isBoundsReasonable(bounds)) {
        map.fitBounds(bounds, { padding: 100 });

        return true;
      }

      return false;
    },
    [riderLocation, routePolyline],
  );

  // Google Maps marker functions - Zomato style exact location tracking

  const createOrUpdateBikeMarker = async (
    latitude,
    longitude,
    heading = null,
    shouldCenterMap = false,
  ) => {
    if (!window.google || !window.google.maps || !window.deliveryMapInstance) {
      return;
    }

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return;
    }

    const previousMarkerPosition = bikeMarkerRef.current?.getPosition?.();

    if (previousMarkerPosition) {
      const jumpDistance = haversineDistance(
        previousMarkerPosition.lat(),

        previousMarkerPosition.lng(),

        latitude,

        longitude,
      );

      if (jumpDistance > MAX_REASONABLE_MARKER_JUMP_METERS) {
        console.warn("Ignoring outlier bike jump to keep map in scope:", {
          jumpDistanceMeters: Math.round(jumpDistance),

          previous: {
            lat: previousMarkerPosition.lat(),
            lng: previousMarkerPosition.lng(),
          },

          next: { lat: latitude, lng: longitude },
        });

        return;
      }
    }

    const position = new window.google.maps.LatLng(latitude, longitude);

    const map = window.deliveryMapInstance;

    const previousLat = previousMarkerPosition?.lat?.();
    const previousLng = previousMarkerPosition?.lng?.();
    let resolvedTargetHeading = Number.isFinite(Number(heading))
      ? normalizeHeading(Number(heading))
      : null;

    if (
      resolvedTargetHeading === null &&
      Number.isFinite(previousLat) &&
      Number.isFinite(previousLng)
    ) {
      const movedMeters = haversineDistance(
        previousLat,
        previousLng,
        latitude,
        longitude,
      );
      if (movedMeters >= 1.5) {
        resolvedTargetHeading = calculateHeading(
          previousLat,
          previousLng,
          latitude,
          longitude,
        );
      }
    }

    if (resolvedTargetHeading === null) {
      resolvedTargetHeading = lastMainMarkerHeadingRef.current;
    }

    const resolvedHeading = smoothHeading(
      lastMainMarkerHeadingRef.current,
      resolvedTargetHeading,
      24,
    );
    lastMainMarkerHeadingRef.current = resolvedHeading;
    lastDirectionsMarkerHeadingRef.current = resolvedHeading;

    // Get rotated icon URL
    const rotatedIconUrl = await getRotatedBikeIcon(resolvedHeading);

    if (!bikeMarkerRef.current) {
      // Create bike marker with rotated icon - exact position

      const bikeIcon = {
        ...buildBikeMarkerIcon(rotatedIconUrl),
      };

      bikeMarkerRef.current = new window.google.maps.Marker({
        position: position,

        map: map,

        icon: bikeIcon,

        optimized: false, // Disable optimization for exact positioning

        animation: window.google.maps.Animation.DROP, // Drop animation on first appearance

        zIndex: 1000, // High z-index to ensure it's above other markers
      });

      console.log("[OK] Bike marker created:", {
        position: { lat: latitude, lng: longitude },

        map: map,

        iconUrl: rotatedIconUrl,

        marker: bikeMarkerRef.current,
      });

      // Keep camera stable; marker creation should not force auto-centering.

      // Remove animation after drop completes

      setTimeout(() => {
        if (bikeMarkerRef.current) {
          bikeMarkerRef.current.setAnimation(null);
        }
      }, 2000);
    } else {
      // ALWAYS ensure marker is on the map (prevent it from disappearing)

      const currentMap = bikeMarkerRef.current.getMap();

      if (currentMap === null || currentMap !== map) {
        console.warn("[WARN] Bike marker not on correct map, re-adding...", {
          currentMap: currentMap,

          expectedMap: map,
        });

        bikeMarkerRef.current.setMap(map);
      }

      // Update position EXACTLY - use setPosition for precise location

      // Verify coordinates are correct before setting

      console.log("[LOC] Updating bike marker position:", {
        lat: latitude,

        lng: longitude,

        heading: heading || 0,

        currentMarkerPos: bikeMarkerRef.current.getPosition()
          ? {
              lat: bikeMarkerRef.current.getPosition().lat(),
              lng: bikeMarkerRef.current.getPosition().lng(),
            }
          : "null",
      });

      // Validate coordinates before setting

      if (
        typeof latitude === "number" &&
        typeof longitude === "number" &&
        !isNaN(latitude) &&
        !isNaN(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
      ) {
        bikeMarkerRef.current.setPosition(position);
      } else {
        console.error("[ERROR] Invalid coordinates for bike marker:", {
          latitude,
          longitude,
        });

        return; // Don't update if coordinates are invalid
      }

      // Update icon with rotation for smooth movement

      const currentHeading = resolvedHeading;

      const rotatedIconUrl = await getRotatedBikeIcon(currentHeading);

      const bikeIcon = {
        ...buildBikeMarkerIcon(rotatedIconUrl),
      };

      bikeMarkerRef.current.setIcon(bikeIcon);

      // Ensure z-index is high

      bikeMarkerRef.current.setZIndex(1000);

      // Do not auto-pan during live updates; keep viewport stable.

      // Double-check marker is still on map after update

      if (bikeMarkerRef.current.getMap() === null) {
        bikeMarkerRef.current.setMap(map);
      }
    }
  };

  const stopRouteSimulation = useCallback(() => {
    if (routeSimulationTimerRef.current) {
      window.clearInterval(routeSimulationTimerRef.current);
      routeSimulationTimerRef.current = null;
    }
    routeSimulationIndexRef.current = 0;
    lastSimulationHeadingRef.current = 0;
    setIsRouteSimulationRunning(false);
  }, []);

  const startRouteSimulation = useCallback(() => {
    if (!canUseRouteSimulation) return;
    const rawRoutePoints = Array.isArray(fullRoutePolylineRef.current)
      ? fullRoutePolylineRef.current
      : [];
    const readLatLng = (point) => {
      if (!point) return null;
      const rawLat =
        typeof point.lat === "function"
          ? point.lat()
          : (point.lat ?? point.latitude);
      const rawLng =
        typeof point.lng === "function"
          ? point.lng()
          : (point.lng ?? point.longitude);
      const lat = Number(rawLat);
      const lng = Number(rawLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    };
    const routePoints = rawRoutePoints
      .map((point) => readLatLng(point))
      .filter(Boolean);
    if (routePoints.length < 2) {
      toast.error("No active route found for simulation.");
      setIsRouteSimulationEnabled(false);
      return;
    }

    stopRouteSimulation();
    setIsRouteSimulationRunning(true);
    let startIndex = 0;
    const seedLocation =
      Array.isArray(lastLocationRef.current) &&
      lastLocationRef.current.length === 2
        ? lastLocationRef.current
        : riderLocation;
    if (Array.isArray(seedLocation) && seedLocation.length === 2) {
      const riderPoint = {
        lat: Number(seedLocation[0]),
        lng: Number(seedLocation[1]),
      };
      if (Number.isFinite(riderPoint.lat) && Number.isFinite(riderPoint.lng)) {
        const nearest = findNearestPointOnPolyline(routePoints, riderPoint);
        startIndex = Math.max(0, Number(nearest?.segmentIndex) || 0);
      }
    }

    const maxTicks = 220;
    const minTicks = 80;
    const totalTicks = Math.max(
      minTicks,
      Math.min(maxTicks, routePoints.length),
    );
    const stepSize = Math.min(
      3,
      Math.max(
        1,
        Math.ceil((routePoints.length - startIndex - 1) / totalTicks),
      ),
    );
    routeSimulationIndexRef.current = startIndex;

    routeSimulationTimerRef.current = window.setInterval(() => {
      const currentIndex = routeSimulationIndexRef.current;
      const nextIndex = Math.min(
        routePoints.length - 1,
        currentIndex + stepSize,
      );
      const currentPoint = routePoints[Math.max(0, currentIndex)];
      const nextPoint = routePoints[nextIndex];
      if (!nextPoint) {
        stopRouteSimulation();
        setIsRouteSimulationEnabled(false);
        return;
      }

      let heading = lastSimulationHeadingRef.current || 0;
      if (currentPoint && nextPoint) {
        const lookAheadIndex = Math.min(routePoints.length - 1, nextIndex + 3);
        const lookAheadPoint = routePoints[lookAheadIndex] || nextPoint;
        const computedHeading = calculateHeading(
          currentPoint.lat,
          currentPoint.lng,
          lookAheadPoint.lat,
          lookAheadPoint.lng,
        );
        if (Number.isFinite(computedHeading)) heading = computedHeading;
      }
      lastSimulationHeadingRef.current = heading;

      const simulatedPosition = [nextPoint.lat, nextPoint.lng];
      setRiderLocation(simulatedPosition);
      lastLocationRef.current = simulatedPosition;
      try {
        localStorage.setItem(
          "deliveryBoyLastLocation",
          JSON.stringify(simulatedPosition),
        );
      } catch {}

      createOrUpdateBikeMarker(nextPoint.lat, nextPoint.lng, heading, false);
      if (directionsResponseRef.current) {
        updateLiveTrackingPolyline(
          directionsResponseRef.current,
          simulatedPosition,
        );
      }
      routeSimulationIndexRef.current = nextIndex;
      if (nextIndex >= routePoints.length - 1) {
        stopRouteSimulation();
        setIsRouteSimulationEnabled(false);
        toast.success("Route simulation completed.");
      }
    }, 280);
  }, [
    calculateHeading,
    canUseRouteSimulation,
    createOrUpdateBikeMarker,
    stopRouteSimulation,
    updateLiveTrackingPolyline,
    riderLocation,
  ]);

  useEffect(() => {
    isRouteSimulationEnabledRef.current = isRouteSimulationEnabled;
  }, [isRouteSimulationEnabled]);

  useEffect(() => {
    if (isRouteSimulationEnabled && canUseRouteSimulation) {
      startRouteSimulation();
      return;
    }
    stopRouteSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseRouteSimulation, isRouteSimulationEnabled]);

  useEffect(() => {
    return () => {
      stopRouteSimulation();
    };
  }, [stopRouteSimulation]);

  const handleToggleRouteSimulation = useCallback(() => {
    if (!canUseRouteSimulation) return;
    setIsRouteSimulationEnabled((prev) => !prev);
  }, [canUseRouteSimulation]);

  // Create or update route polyline (blue line showing traveled path) - LEGACY/FALLBACK

  // Accepts optional coordinates parameter to draw route immediately without waiting for state update

  // This is a FALLBACK polyline - should only be used when DirectionsRenderer is NOT available

  function updateRoutePolyline(coordinates = null) {
    // Only show route if there's an active order (selectedRestaurant)

    if (!selectedRestaurant) {
      // Clear route if no active order

      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }

      return;
    }

    // After pickup, hide legacy fallback polyline so only rider-to-customer route is visible.

    const orderStatus =
      selectedRestaurant?.orderStatus || selectedRestaurant?.status || "";

    const deliveryPhase =
      selectedRestaurant?.deliveryPhase ||
      selectedRestaurant?.deliveryState?.currentPhase ||
      "";

    const deliveryStateStatus = selectedRestaurant?.deliveryState?.status || "";

    const isPickedUpPhase =
      orderStatus === "out_for_delivery" ||
      orderStatus === "picked_up" ||
      deliveryPhase === "en_route_to_delivery" ||
      deliveryPhase === "picked_up" ||
      deliveryStateStatus === "order_confirmed" ||
      deliveryStateStatus === "en_route_to_delivery";

    const hasCustomerLocation =
      selectedRestaurant?.customerLat != null &&
      selectedRestaurant?.customerLng != null &&
      Number.isFinite(Number(selectedRestaurant.customerLat)) &&
      Number.isFinite(Number(selectedRestaurant.customerLng)) &&
      !(
        Number(selectedRestaurant.customerLat) === 0 &&
        Number(selectedRestaurant.customerLng) === 0
      );

    // Prefer live-tracking route whenever available to avoid duplicate paths.

    // Fallback polyline should only render when live-tracking route is unavailable.

    if (liveTrackingPolylineRef.current) {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }

      return;
    }

    // Don't show fallback polyline if DirectionsRenderer is active (it handles road-snapped routes)

    if (
      directionsRendererRef.current &&
      directionsRendererRef.current.getDirections()
    ) {
      // DirectionsRenderer is active, hide fallback polyline

      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }

      return;
    }

    if (!window.google || !window.google.maps || !window.deliveryMapInstance) {
      return;
    }

    const map = window.deliveryMapInstance;

    // Use provided coordinates or fallback to state

    const coordsToUse = coordinates || routePolyline;

    if (coordsToUse && coordsToUse.length > 0) {
      const normalizedPoints = coordsToUse

        .map((coord) => {
          if (Array.isArray(coord) && coord.length >= 2) {
            const lat = Number(coord[0]);

            const lng = Number(coord[1]);

            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              return { lat, lng };
            }
          }

          if (coord && typeof coord === "object") {
            const lat = Number(coord.lat);

            const lng = Number(coord.lng);

            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              return { lat, lng };
            }
          }

          return null;
        })

        .filter(Boolean);

      // During delivery leg, only allow fallback path if it ends near customer location.

      if (
        isPickedUpPhase &&
        hasCustomerLocation &&
        normalizedPoints.length > 0
      ) {
        const lastPoint = normalizedPoints[normalizedPoints.length - 1];

        const distanceToCustomer = calculateDistance(
          lastPoint.lat,

          lastPoint.lng,

          Number(selectedRestaurant.customerLat),

          Number(selectedRestaurant.customerLng),
        );

        // If restored/old pickup route is still in state, do not render it in delivery leg.

        if (!Number.isFinite(distanceToCustomer) || distanceToCustomer > 300) {
          if (routePolylineRef.current) {
            routePolylineRef.current.setMap(null);
          }

          return;
        }
      }

      const riderPos =
        riderLocation && riderLocation.length === 2
          ? { lat: Number(riderLocation[0]), lng: Number(riderLocation[1]) }
          : lastLocationRef.current && lastLocationRef.current.length === 2
            ? {
                lat: Number(lastLocationRef.current[0]),
                lng: Number(lastLocationRef.current[1]),
              }
            : null;

      let forwardPoints = normalizedPoints;

      if (
        riderPos &&
        Number.isFinite(riderPos.lat) &&
        Number.isFinite(riderPos.lng) &&
        normalizedPoints.length > 1
      ) {
        const { segmentIndex, nearestPoint } = findNearestPointOnPolyline(
          normalizedPoints,
          riderPos,
        );

        const trimmedPoints = trimPolylineBehindRider(
          normalizedPoints,
          nearestPoint,
          segmentIndex,
        );

        forwardPoints = [
          { lat: riderPos.lat, lng: riderPos.lng },
          ...trimmedPoints,
        ];
        if (isPickedUpPhase && hasCustomerLocation) {
          const customerPoint = {
            lat: Number(selectedRestaurant.customerLat),
            lng: Number(selectedRestaurant.customerLng),
          };

          if (
            Number.isFinite(customerPoint.lat) &&
            Number.isFinite(customerPoint.lng)
          ) {
            const lastPoint = forwardPoints[forwardPoints.length - 1];
            const sameAsCustomer =
              lastPoint &&
              Math.abs(lastPoint.lat - customerPoint.lat) < 0.00005 &&
              Math.abs(lastPoint.lng - customerPoint.lng) < 0.00005;

            if (!sameAsCustomer) {
              forwardPoints = [...forwardPoints, customerPoint];
            }
          }
        }
      }

      // Convert to Google Maps LatLng format

      const path = forwardPoints.map(
        (point) => new window.google.maps.LatLng(point.lat, point.lng),
      );

      if (path.length > 0) {
        // Fallback route line: render when live tracking/directions path is unavailable

        if (!routePolylineRef.current) {
          routePolylineRef.current = new window.google.maps.Polyline({
            path,

            geodesic: true,

            strokeColor: "#1E88E5",

            strokeOpacity: 0.95,

            strokeWeight: 5,

            zIndex: 998,

            map,
          });
        } else {
          routePolylineRef.current.setPath(path);

          routePolylineRef.current.setMap(map);
        }

        // Fit map bounds to show entire route - but preserve zoom if user has zoomed in

        if (path.length > 1) {
          const bounds = new window.google.maps.LatLngBounds();

          path.forEach((point) => bounds.extend(point));

          // Add padding to bounds for better visibility

          const currentZoomBeforeFit = map.getZoom();

          if (isBoundsReasonable(bounds)) {
            map.fitBounds(bounds, { padding: 50 });
          } else {
          }

          // Preserve zoom if user had zoomed in more than fitBounds would set

          setTimeout(() => {
            const newZoom = map.getZoom();

            if (currentZoomBeforeFit > newZoom && currentZoomBeforeFit >= 18) {
              map.setZoom(currentZoomBeforeFit);
            }
          }, 100);
        }
      }
    } else {
      // Hide polyline if no route data

      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
      }
    }
  }

  // Removed createOrUpdateBlueDotMarker - not needed, using bike icon instead

  // Bike marker update removed (Ola Maps removed)

  // Carousel slides data - filter based on bank details status

  const carouselSlides = useMemo(
    () => [
      ...(bankDetailsFilled
        ? []
        : [
            {
              id: 2,

              title: "Submit bank details",

              subtitle: "PAN & bank details required for payouts",

              icon: "bank",

              buttonText: "Submit",

              bgColor: "bg-yellow-400",
            },
          ]),
    ],
    [bankDetailsFilled],
  );

  // Auto-rotate carousel

  useEffect(() => {
    const slideCount = carouselSlides.length;

    // Keep slide index valid even after dynamic slide list changes.

    setCurrentCarouselSlide((prev) => {
      if (!Number.isFinite(prev) || prev < 0 || prev >= slideCount) {
        return 0;
      }

      return prev;
    });

    if (carouselAutoRotateRef.current) {
      clearInterval(carouselAutoRotateRef.current);
    }

    if (slideCount <= 1) {
      return undefined;
    }

    carouselAutoRotateRef.current = setInterval(() => {
      setCurrentCarouselSlide((prev) => (prev + 1) % slideCount);
    }, 3000);

    return () => {
      if (carouselAutoRotateRef.current) {
        clearInterval(carouselAutoRotateRef.current);
      }
    };
  }, [carouselSlides]);

  // Reset auto-rotate timer after manual swipe

  const resetCarouselAutoRotate = useCallback(() => {
    const slideCount = carouselSlides.length;

    if (carouselAutoRotateRef.current) {
      clearInterval(carouselAutoRotateRef.current);
    }

    if (slideCount <= 1) return;

    carouselAutoRotateRef.current = setInterval(() => {
      setCurrentCarouselSlide((prev) => (prev + 1) % slideCount);
    }, 3000);
  }, [carouselSlides.length]);

  // Handle carousel swipe touch events

  const carouselStartY = useRef(0);

  const handleCarouselTouchStart = useCallback((e) => {
    carouselIsSwiping.current = true;

    carouselStartX.current = e.touches[0].clientX;

    carouselStartY.current = e.touches[0].clientY;
  }, []);

  const handleCarouselTouchMove = useCallback((e) => {
    if (!carouselIsSwiping.current) return;

    const currentX = e.touches[0].clientX;

    const currentY = e.touches[0].clientY;

    const deltaX = Math.abs(currentX - carouselStartX.current);

    const deltaY = Math.abs(currentY - carouselStartY.current);

    // Only prevent default if horizontal swipe is dominant

    // Don't call preventDefault - CSS touch-action handles scrolling prevention

    if (deltaX > deltaY && deltaX > 10) {
      // safePreventDefault(e) // Removed to avoid passive listener error
    }
  }, []);

  const handleCarouselTouchEnd = useCallback(
    (e) => {
      if (!carouselIsSwiping.current) return;

      const endX = e.changedTouches[0].clientX;

      const endY = e.changedTouches[0].clientY;

      const deltaX = carouselStartX.current - endX;

      const deltaY = Math.abs(carouselStartY.current - endY);

      const threshold = 50; // Minimum swipe distance

      // Only trigger if horizontal swipe is dominant

      if (
        Math.abs(deltaX) > threshold &&
        Math.abs(deltaX) > deltaY &&
        carouselSlides.length > 1
      ) {
        if (deltaX > 0) {
          // Swiped left - go to next slide

          setCurrentCarouselSlide((prev) => (prev + 1) % carouselSlides.length);
        } else {
          // Swiped right - go to previous slide

          setCurrentCarouselSlide(
            (prev) =>
              (prev - 1 + carouselSlides.length) % carouselSlides.length,
          );
        }
      }

      // Always resume autoplay after touch end, even for partial swipes.

      resetCarouselAutoRotate();

      carouselIsSwiping.current = false;

      carouselStartX.current = 0;

      carouselStartY.current = 0;
    },
    [carouselSlides.length, resetCarouselAutoRotate],
  );

  // Handle carousel mouse events for desktop

  const handleCarouselMouseDown = (e) => {
    carouselIsSwiping.current = true;

    carouselStartX.current = e.clientX;

    const handleMouseMove = (moveEvent) => {
      if (!carouselIsSwiping.current) return;

      // Don't call preventDefault - CSS touch-action handles scrolling prevention

      // safePreventDefault(moveEvent) // Removed for consistency (mouse events aren't passive but removed anyway)
    };

    const handleMouseUp = (upEvent) => {
      if (!carouselIsSwiping.current) {
        document.removeEventListener("mousemove", handleMouseMove);

        document.removeEventListener("mouseup", handleMouseUp);

        return;
      }

      const endX = upEvent.clientX;

      const deltaX = carouselStartX.current - endX;

      const threshold = 50;

      if (Math.abs(deltaX) > threshold && carouselSlides.length > 1) {
        if (deltaX > 0) {
          // Swiped left - go to next slide

          setCurrentCarouselSlide((prev) => (prev + 1) % carouselSlides.length);
        } else {
          // Swiped right - go to previous slide

          setCurrentCarouselSlide(
            (prev) =>
              (prev - 1 + carouselSlides.length) % carouselSlides.length,
          );
        }
      }

      // Always resume autoplay after mouse interaction, even for partial drags.

      resetCarouselAutoRotate();

      carouselIsSwiping.current = false;

      carouselStartX.current = 0;

      document.removeEventListener("mousemove", handleMouseMove);

      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);

    document.addEventListener("mouseup", handleMouseUp);
  };

  // Setup non-passive touch event listeners for carousel to allow preventDefault

  useEffect(() => {
    const carouselElement = carouselRef.current;

    if (!carouselElement) return;

    // Add event listeners with { passive: false } for touchmove to allow preventDefault

    carouselElement.addEventListener("touchstart", handleCarouselTouchStart, {
      passive: true,
    });

    carouselElement.addEventListener("touchmove", handleCarouselTouchMove, {
      passive: false,
    });

    carouselElement.addEventListener("touchend", handleCarouselTouchEnd, {
      passive: true,
    });

    return () => {
      carouselElement.removeEventListener(
        "touchstart",
        handleCarouselTouchStart,
      );

      carouselElement.removeEventListener("touchmove", handleCarouselTouchMove);

      carouselElement.removeEventListener("touchend", handleCarouselTouchEnd);
    };
  }, [
    handleCarouselTouchStart,
    handleCarouselTouchMove,
    handleCarouselTouchEnd,
  ]);

  // Handle swipe bar touch events

  const handleSwipeBarTouchStart = (e) => {
    // Check if touch is on a button or interactive element

    const target = e.target;

    const isInteractive =
      target.closest("button") ||
      target.closest("a") ||
      target.closest('[role="button"]');

    // If touching an interactive element, don't start swipe

    if (isInteractive && !target.closest("[data-swipe-handle]")) {
      return;
    }

    // Check if touch is on scrollable content area

    const isOnScrollableContent =
      target.closest('[ref="homeSectionsScrollRef"]') ||
      target.closest(".overflow-y-auto") ||
      (homeSectionsScrollRef.current &&
        homeSectionsScrollRef.current.contains(target));

    // Check if we're scrolling vs dragging

    if (
      showHomeSections &&
      homeSectionsScrollRef.current &&
      isOnScrollableContent
    ) {
      const scrollTop = homeSectionsScrollRef.current.scrollTop;

      const scrollHeight = homeSectionsScrollRef.current.scrollHeight;

      const clientHeight = homeSectionsScrollRef.current.clientHeight;

      const isScrollable = scrollHeight > clientHeight;

      // If content is scrollable and not at top/bottom, allow scrolling

      if (
        isScrollable &&
        (scrollTop > 10 || scrollTop < scrollHeight - clientHeight - 10)
      ) {
        // User is scrolling, not dragging

        isScrollingHomeSections.current = true;

        isSwipingBar.current = false;

        return;
      }
    }

    // Only start swipe if touch is on swipe handle or at top/bottom of scrollable area

    isSwipingBar.current = true;

    swipeBarStartY.current = e.touches[0].clientY;

    setIsDraggingSwipeBar(true);

    isScrollingHomeSections.current = false;
  };

  const handleSwipeBarTouchMove = (e) => {
    if (!isSwipingBar.current) return;

    const currentY = e.touches[0].clientY;

    const deltaY = swipeBarStartY.current - currentY; // Positive = swiping up, Negative = swiping down

    const windowHeight = window.innerHeight;

    // Check if user is scrolling content vs dragging swipe bar

    if (showHomeSections && homeSectionsScrollRef.current) {
      const scrollTop = homeSectionsScrollRef.current.scrollTop;

      const scrollHeight = homeSectionsScrollRef.current.scrollHeight;

      const clientHeight = homeSectionsScrollRef.current.clientHeight;

      const isScrollable = scrollHeight > clientHeight;

      // If content is scrollable and user is trying to scroll

      if (isScrollable) {
        // Scrolling down (deltaY < 0) - allow scroll if not at top

        if (deltaY < 0 && scrollTop > 0) {
          isScrollingHomeSections.current = true;

          isSwipingBar.current = false;

          setIsDraggingSwipeBar(false);

          return; // Allow native scroll
        }

        // Scrolling up (deltaY > 0) - allow scroll if not at bottom

        if (deltaY > 0 && scrollTop < scrollHeight - clientHeight - 10) {
          isScrollingHomeSections.current = true;

          isSwipingBar.current = false;

          setIsDraggingSwipeBar(false);

          return; // Allow native scroll
        }
      }
    }

    // If user was scrolling, don't handle as swipe

    if (isScrollingHomeSections.current) {
      return;
    }

    // Only prevent default if we're actually dragging swipe bar (not scrolling)

    // Only prevent if drag is significant enough

    // Don't call preventDefault - CSS touch-action handles scrolling prevention

    if (Math.abs(deltaY) > 10) {
      // safePreventDefault(e) // Removed to avoid passive listener error
    }

    if (showHomeSections) {
      // Currently showing home sections - swiping down should go back to map

      // Calculate position from 1 (top) to 0 (bottom)

      const newPosition = Math.max(0, Math.min(1, 1 + deltaY / windowHeight));

      setSwipeBarPosition(newPosition);
    } else {
      // Currently showing map - swiping up should show home sections

      // Calculate position from 0 (bottom) to 1 (top)

      const newPosition = Math.max(0, Math.min(1, deltaY / windowHeight));

      setSwipeBarPosition(newPosition);
    }
  };

  const handleSwipeBarTouchEnd = (e) => {
    if (!isSwipingBar.current) return;

    // If user was scrolling, don't handle as swipe

    if (isScrollingHomeSections.current) {
      isSwipingBar.current = false;

      setIsDraggingSwipeBar(false);

      isScrollingHomeSections.current = false;

      return;
    }

    const windowHeight = window.innerHeight;

    const threshold = 50; // Small threshold - just 50px to trigger

    const finalY = e.changedTouches[0].clientY;

    const finalDeltaY = swipeBarStartY.current - finalY;

    if (showHomeSections) {
      // If showing home sections and swiped down, go back to map

      if (finalDeltaY < -threshold || swipeBarPosition < 0.95) {
        setShowHomeSections(false);

        setSwipeBarPosition(0);
      } else {
        // Keep it open

        setSwipeBarPosition(1);

        setShowHomeSections(true);
      }
    } else {
      // If showing map and swiped up, show home sections

      if (finalDeltaY > threshold || swipeBarPosition > 0.05) {
        setSwipeBarPosition(1);

        setShowHomeSections(true);
      } else {
        setSwipeBarPosition(0);

        setShowHomeSections(false);
      }
    }

    isSwipingBar.current = false;

    setIsDraggingSwipeBar(false);

    swipeBarStartY.current = 0;

    isScrollingHomeSections.current = false;
  };

  // Handle mouse events for desktop

  const handleSwipeBarMouseDown = (e) => {
    // Check if click is on a button or interactive element

    const target = e.target;

    const isInteractive =
      target.closest("button") ||
      target.closest("a") ||
      target.closest('[role="button"]');

    // If clicking an interactive element, don't start swipe

    if (isInteractive && !target.closest("[data-swipe-handle]")) {
      return;
    }

    isSwipingBar.current = true;

    swipeBarStartY.current = e.clientY;

    setIsDraggingSwipeBar(true);
  };

  const handleSwipeBarMouseMove = (e) => {
    if (!isSwipingBar.current) return;

    const currentY = e.clientY;

    const deltaY = swipeBarStartY.current - currentY;

    const windowHeight = window.innerHeight;

    // Prevent default to avoid text selection

    // Don't call preventDefault - CSS touch-action handles scrolling prevention

    // safePreventDefault(e) // Removed to avoid passive listener error

    if (showHomeSections) {
      // Currently showing home sections - swiping down should go back to map

      // Calculate position from 1 (top) to 0 (bottom)

      const newPosition = Math.max(0, Math.min(1, 1 + deltaY / windowHeight));

      setSwipeBarPosition(newPosition);
    } else {
      // Currently showing map - swiping up should show home sections

      // Calculate position from 0 (bottom) to 1 (top)

      const newPosition = Math.max(0, Math.min(1, deltaY / windowHeight));

      setSwipeBarPosition(newPosition);
    }
  };

  const handleSwipeBarMouseUp = (e) => {
    if (!isSwipingBar.current) return;

    const windowHeight = window.innerHeight;

    const threshold = 50; // Small threshold - just 50px to trigger

    const finalY = e.clientY;

    const finalDeltaY = swipeBarStartY.current - finalY;

    if (showHomeSections) {
      // If showing home sections and swiped down, go back to map

      if (finalDeltaY < -threshold || swipeBarPosition < 0.95) {
        setShowHomeSections(false);

        setSwipeBarPosition(0);
      } else {
        // Keep it open

        setSwipeBarPosition(1);

        setShowHomeSections(true);
      }
    } else {
      // If showing map and swiped up, show home sections

      if (finalDeltaY > threshold || swipeBarPosition > 0.05) {
        setSwipeBarPosition(1);

        setShowHomeSections(true);
      } else {
        setSwipeBarPosition(0);

        setShowHomeSections(false);
      }
    }

    isSwipingBar.current = false;

    setIsDraggingSwipeBar(false);

    swipeBarStartY.current = 0;
  };

  // Handle chevron click to slide down swipe bar

  const handleChevronDownClick = () => {
    if (showHomeSections) {
      setShowHomeSections(false);

      setSwipeBarPosition(0);

      setIsDraggingSwipeBar(false);
    }
  };

  // Handle chevron click to slide up swipe bar

  const handleChevronUpClick = () => {
    if (!showHomeSections) {
      setShowHomeSections(true);

      setSwipeBarPosition(1);

      setIsDraggingSwipeBar(false);
    }
  };

  // Add global mouse event listeners

  useEffect(() => {
    if (isDraggingSwipeBar) {
      document.addEventListener("mousemove", handleSwipeBarMouseMove);

      document.addEventListener("mouseup", handleSwipeBarMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleSwipeBarMouseMove);

        document.removeEventListener("mouseup", handleSwipeBarMouseUp);
      };
    }
  }, [isDraggingSwipeBar, swipeBarPosition]);

  // Get next available slot for booking

  const getNextAvailableSlot = () => {
    if (!todayGig) return null;

    const now = new Date();

    const currentHour = now.getHours();

    const currentMinute = now.getMinutes();

    const currentTime = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

    // Find next slot after current gig ends

    if (todayGig.endTime && todayGig.endTime > currentTime) {
      const [hours, minutes] = todayGig.endTime.split(":").map(Number);

      const nextStartHour = hours;

      const nextEndHour = hours + 1;

      return {
        start: `${String(nextStartHour).padStart(2, "0")}:00`,

        end: `${String(nextEndHour).padStart(2, "0")}:00`,
      };
    }

    return null;
  };

  const nextSlot = getNextAvailableSlot();

  // Fetch zones within 70km radius from backend

  const fetchAndDrawNearbyZones = async () => {
    if (
      !riderLocation ||
      riderLocation.length !== 2 ||
      !window.google ||
      !window.deliveryMapInstance
    ) {
      return;
    }

    try {
      const [riderLat, riderLng] = riderLocation;

      const response = await deliveryAPI.getZonesInRadius(
        riderLat,
        riderLng,
        70,
      );

      if (response.data?.success && response.data.data?.zones) {
        const nearbyZones = response.data.data.zones;

        setZones(nearbyZones);

        drawZonesOnMap(nearbyZones);

        const insideAnyZone = nearbyZones.some((zone) =>
          isPointInsideZoneBoundary(
            riderLat,
            riderLng,
            zone?.coordinates || [],
          ),
        );

        setIsOutOfZone(!insideAnyZone);

        setZoneCheckReady(true);
      }
    } catch (error) {
      // Suppress network errors - backend might be down or endpoint not available

      if (error.code === "ERR_NETWORK") {
        // Silently handle network errors - backend might not be running

        return;
      }

      // Only log non-network errors

      if (error.response) {
        console.error(
          "Error fetching zones:",
          error.response?.data || error.message,
        );
      }
    }
  };

  useEffect(() => {
    if (!isOnline) {
      setIsOutOfZone(false);

      setZoneCheckReady(false);
    }
  }, [isOnline]);

  // Draw zones on map

  const drawZonesOnMap = (zonesToDraw) => {
    if (
      !window.google ||
      !window.deliveryMapInstance ||
      !zonesToDraw ||
      zonesToDraw.length === 0
    ) {
      return;
    }

    // Clear previous zones

    zonesPolygonsRef.current.forEach((polygon) => {
      if (polygon) polygon.setMap(null);
    });

    zonesPolygonsRef.current = [];

    const map = window.deliveryMapInstance;

    // Light orange color for all zones

    const lightOrangeColor = "#FFB84D"; // Light orange

    const strokeColor = "#FF9500"; // Slightly darker orange for border

    zonesToDraw.forEach((zone, index) => {
      if (!zone.coordinates || zone.coordinates.length < 3) return;

      // Convert coordinates to LatLng array

      const path = zone.coordinates
        .map((coord) => {
          const lat =
            typeof coord === "object" ? coord.latitude || coord.lat : null;

          const lng =
            typeof coord === "object" ? coord.longitude || coord.lng : null;

          if (lat === null || lng === null) return null;

          return new window.google.maps.LatLng(lat, lng);
        })
        .filter(Boolean);

      if (path.length < 3) return;

      // Create polygon with light orange fill

      const polygon = new window.google.maps.Polygon({
        paths: path,

        strokeColor: strokeColor,

        strokeOpacity: 0.8,

        strokeWeight: 2,

        fillColor: lightOrangeColor,

        fillOpacity: 0.3, // Light fill opacity for better visibility

        editable: false,

        draggable: false,

        clickable: true,

        zIndex: 1,
      });

      polygon.setMap(map);

      zonesPolygonsRef.current.push(polygon);

      // InfoWindow removed - no popup on zone click
    });
  };

  // Fetch zones when map is ready and location changes

  useEffect(() => {
    if (
      !mapLoading &&
      window.deliveryMapInstance &&
      riderLocation &&
      riderLocation.length === 2
    ) {
      fetchAndDrawNearbyZones();
    }
  }, [mapLoading, riderLocation]);

  const resolveOrderIdForNavigation = useCallback((orderOverride = null) => {
    return (
      orderOverride?.orderId ||
      orderOverride?.id ||
      orderOverride?.orderMongoId ||
      selectedRestaurant?.orderId ||
      selectedRestaurant?.id ||
      newOrder?.orderId ||
      newOrder?.orderMongoId ||
      null
    );
  }, [
    newOrder?.orderId,
    newOrder?.orderMongoId,
    selectedRestaurant?.id,
    selectedRestaurant?.orderId,
  ]);

  const openGoogleMapsNavigation = useCallback(
    (rawLat, rawLng, label = "destination") => {
      const lat = Number(rawLat);
      const lng = Number(rawLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        toast.error(`${label} location not available.`);
        return;
      }

      const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=bicycling`;
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      const isAndroid = /android/i.test(userAgent);
      const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;

      if (isAndroid) {
        window.location.href = `google.navigation:q=${lat},${lng}&mode=b`;
        setTimeout(
          () => window.open(webUrl, "_blank", "noopener,noreferrer"),
          500,
        );
      } else if (isIOS) {
        window.location.href = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=bicycling`;
        setTimeout(
          () => window.open(webUrl, "_blank", "noopener,noreferrer"),
          500,
        );
      } else {
        window.open(webUrl, "_blank", "noopener,noreferrer");
      }

      toast.success("Opening Google Maps navigation [MAP]", { duration: 2000 });
    },
    [],
  );

  const handleOpenRestaurantNavigation = useCallback(async (orderOverride = null) => {
    const targetOrder = orderOverride || selectedRestaurant;
    let lat = Number(targetOrder?.lat);
    let lng = Number(targetOrder?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const orderId = resolveOrderIdForNavigation(targetOrder);
      if (orderId) {
        try {
          const response = await deliveryAPI.getOrderDetails(orderId);
          const order =
            response?.data?.data?.order || response?.data?.data || null;
          const storeCoords = resolveStoreCoordsFromOrder(order);
          if (storeCoords) {
            lat = Number(storeCoords.lat);
            lng = Number(storeCoords.lng);
            if (orderOverride) {
              setPreviewAdvanceOrder((prev) =>
                prev ? { ...prev, lat, lng } : prev,
              );
            } else {
              setSelectedRestaurant((prev) =>
                prev ? { ...prev, lat, lng } : prev,
              );
            }
          }
        } catch (error) {
          console.warn(
            "[MAP] Failed to fetch restaurant coords for navigation:",
            error?.message || error,
          );
        }
      }
    }
    openGoogleMapsNavigation(lat, lng, "Restaurant");
  }, [
    openGoogleMapsNavigation,
    resolveOrderIdForNavigation,
    selectedRestaurant,
    selectedRestaurant?.lat,
    selectedRestaurant?.lng,
  ]);

  const handleCallRestaurant = useCallback(async (orderOverride = null) => {
    const targetOrder = orderOverride || selectedRestaurant;
    let restaurantPhone =
      targetOrder?.phone ||
      targetOrder?.restaurantId?.phone ||
      targetOrder?.ownerPhone ||
      targetOrder?.restaurant?.phone ||
      null

    console.log("[CALL] Checking phone in selectedRestaurant:", {
      phone: targetOrder?.phone,
      restaurantIdPhone: targetOrder?.restaurantId?.phone,
      ownerPhone: targetOrder?.ownerPhone,
      restaurantPhone: targetOrder?.restaurant?.phone,
      found: !!restaurantPhone,
    })

    if (!restaurantPhone && (targetOrder?.orderId || targetOrder?.id)) {
      try {
        console.log("[CALL] [CALL] Phone not found in selectedRestaurant, fetching order details from backend...")
        const orderId = targetOrder.orderId || targetOrder.id
        console.log("[CALL] [CALL] Fetching order details for orderId:", orderId)

        const response = await deliveryAPI.getOrderDetails(orderId)
        console.log("[CALL] [CALL] Order details API response:", JSON.stringify(response.data, null, 2))

        const order = response.data?.data?.order || response.data?.order || null

        if (order) {
          console.log("[CALL] [CALL] Order data extracted from API:", {
            hasRestaurantId: !!order.restaurantId,
            restaurantIdType: typeof order.restaurantId,
            restaurantIdPhone: order.restaurantId?.phone,
            restaurantIdOwnerPhone: order.restaurantId?.ownerPhone,
            restaurantIdObject: order.restaurantId ? Object.keys(order.restaurantId) : null,
          })

          restaurantPhone =
            order.restaurantId?.phone ||
            order.restaurantId?.ownerPhone ||
            order.restaurant?.phone ||
            order.restaurant?.ownerPhone ||
            order.restaurantId?.contact?.phone ||
            order.restaurantId?.owner?.phone ||
            null

          console.log("[CALL] [CALL] Phone extracted from order:", restaurantPhone)

          if (restaurantPhone && targetOrder) {
            if (orderOverride) {
              setPreviewAdvanceOrder((prev) =>
                prev
                  ? {
                      ...prev,
                      phone: restaurantPhone,
                      ownerPhone:
                        order.restaurantId?.ownerPhone ||
                        order.restaurant?.ownerPhone ||
                        restaurantPhone,
                    }
                  : prev,
              )
            } else {
              setSelectedRestaurant({
                ...selectedRestaurant,
                phone: restaurantPhone,
                ownerPhone: order.restaurantId?.ownerPhone || order.restaurant?.ownerPhone || restaurantPhone,
              })
            }
            console.log("[OK] [CALL] Updated selectedRestaurant with phone:", restaurantPhone)
          }

          if (!restaurantPhone && order.restaurantId) {
            const restaurantId =
              typeof order.restaurantId === "string"
                ? order.restaurantId
                : order.restaurantId._id || order.restaurantId.id || order.restaurantId.toString()

            if (restaurantId) {
              try {
                console.log("[CALL] [CALL] Trying restaurant API directly with ID:", restaurantId)
                const storeLookup = await fetchStoreById(restaurantId)
                if (storeLookup?.store) {
                  const restaurant = storeLookup.store
                  restaurantPhone = restaurant.phone || restaurant.ownerPhone || restaurant.primaryContactNumber

                  if (restaurantPhone) {
                    if (orderOverride) {
                      setPreviewAdvanceOrder((prev) =>
                        prev
                          ? {
                              ...prev,
                              phone: restaurantPhone,
                              ownerPhone: restaurant.ownerPhone || restaurantPhone,
                            }
                          : prev,
                      )
                    } else {
                      setSelectedRestaurant({
                        ...selectedRestaurant,
                        phone: restaurantPhone,
                        ownerPhone: restaurant.ownerPhone || restaurantPhone,
                      })
                    }
                    console.log("[OK] [CALL] Updated selectedRestaurant with phone from restaurant API:", restaurantPhone)
                  }
                }
              } catch (restaurantError) {
                console.error("[ERROR] [CALL] Error fetching restaurant by ID:", restaurantError)
              }
            }
          }

          if (!restaurantPhone) {
            console.warn("[WARN] [CALL] Phone not found in order.restaurantId object:", order.restaurantId)
          }
        } else {
          console.warn("[WARN] [CALL] Order details API response format unexpected - order not found in response:", {
            responseKeys: Object.keys(response.data || {}),
            responseData: response.data,
          })
        }
      } catch (error) {
        console.error("[ERROR] [CALL] Error fetching order details for phone:", error)
        console.error("[ERROR] [CALL] Error message:", error.message)
        console.error("[ERROR] [CALL] Error response:", error.response?.data)
        console.error("[ERROR] [CALL] Error status:", error.response?.status)
      }
    } else if (!targetOrder?.orderId && !targetOrder?.id) {
      console.warn("[WARN] [CALL] Cannot fetch phone - orderId not found in selectedRestaurant:", targetOrder)
    }

    if (restaurantPhone) {
      const cleanPhone = restaurantPhone.replace(/[^\d+]/g, "")
      console.log("[CALL] Calling restaurant:", { original: restaurantPhone, clean: cleanPhone })
      window.location.href = 'tel:' + cleanPhone
    } else {
      toast.error("Restaurant phone number not available. Please contact support.")
      console.error("[ERROR] Restaurant phone not found in any path:", {
        selectedRestaurant: targetOrder,
        hasPhone: !!targetOrder?.phone,
        hasRestaurantIdPhone: !!targetOrder?.restaurantId?.phone,
        hasOwnerPhone: !!targetOrder?.ownerPhone,
        orderId: targetOrder?.orderId,
      })
    }
  }, [selectedRestaurant])

  const handleOpenCustomerNavigation = useCallback(async () => {
    let lat = Number(selectedRestaurant?.customerLat);
    let lng = Number(selectedRestaurant?.customerLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const orderId = resolveOrderIdForNavigation();
      if (orderId) {
        try {
          const response = await deliveryAPI.getOrderDetails(orderId);
          const order =
            response?.data?.data?.order || response?.data?.data || null;
          const customerCoords = extractCustomerCoordsFromOrder(order);
          if (customerCoords) {
            lat = Number(customerCoords.lat);
            lng = Number(customerCoords.lng);
            setSelectedRestaurant((prev) =>
              prev ? { ...prev, customerLat: lat, customerLng: lng } : prev,
            );
          }
        } catch (error) {
          console.warn(
            "[MAP] Failed to fetch customer coords for navigation:",
            error?.message || error,
          );
        }
      }
    }
    openGoogleMapsNavigation(lat, lng, "Customer");
  }, [
    openGoogleMapsNavigation,
    resolveOrderIdForNavigation,
    selectedRestaurant?.customerLat,
    selectedRestaurant?.customerLng,
  ]);

  // Render normal feed view when offline or no gig booked

  return (
    <div
      className="min-h-screen bg-[#f6e9dc] overflow-x-hidden flex flex-col"
      style={{ height: "100vh" }}
    >
      {/* Top Navigation Bar */}

      <FeedNavbar
        isOnline={isOnline}
        onToggleOnline={handleToggleOnline}
        onEmergencyClick={() => setShowEmergencyPopup(true)}
        onHelpClick={() => setShowHelpPopup(true)}
        showRouteSimulationToggle={canUseRouteSimulation}
        isRouteSimulationEnabled={isRouteSimulationEnabled}
        isRouteSimulationRunning={isRouteSimulationRunning}
        onToggleRouteSimulation={handleToggleRouteSimulation}
      />

      {isOnline && zoneCheckReady && isOutOfZone && (
        <div className="mx-3 mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />

          <p className="text-xs font-semibold text-red-700">
            You are out of delivery zone. You will not receive orders until you
            return to an active zone.
          </p>
        </div>
      )}

      {/* Carousel - Only show if there are slides */}

      {carouselSlides.length > 0 && (
        <div
          ref={carouselRef}
          className="relative overflow-hidden bg-gray-700 cursor-grab active:cursor-grabbing select-none flex-shrink-0"
          onMouseDown={handleCarouselMouseDown}
        >
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(-${currentCarouselSlide * 100}%)` }}
          >
            {carouselSlides.map((slide) => (
              <div key={slide.id} className="min-w-full">
                <div
                  className={`${slide.bgColor} px-4 py-3 flex items-center gap-3 min-h-[80px]`}
                >
                  {/* Icon */}

                  <div className="flex-shrink-0">
                    {slide.icon === "bag" ? (
                      <div className="relative">
                        {/* Delivery Bag Icon - Reduced size */}

                        <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center shadow-lg relative">
                          {/* Bag shape */}

                          <svg
                            className="w-7 h-7 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                          >
                            <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                          </svg>
                        </div>

                        {/* Shadow */}

                        <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-black/30 rounded-full blur-sm"></div>
                      </div>
                    ) : (
                      <div className="relative w-10 h-10">
                        {/* Bank/Rupee Icon - Reduced size */}

                        <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center relative">
                          {/* Rupee symbol */}

                          <svg
                            className="w-12 h-12 text-white absolute"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Text Content */}

                  <div className="flex-1">
                    <h3
                      className={`${slide.bgColor === "bg-gray-700" ? "text-white" : "text-black"} text-sm font-semibold mb-0.5`}
                    >
                      {slide.title}
                    </h3>

                    <p
                      className={`${slide.bgColor === "bg-gray-700" ? "text-white/90" : "text-black/80"} text-xs`}
                    >
                      {slide.subtitle}
                    </p>
                  </div>

                  {/* Button */}

                  <button
                    onClick={() => {
                      if (slide.id === 2) {
                        navigate("/delivery/profile/details");
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-colors ${
                      slide.bgColor === "bg-gray-700"
                        ? "bg-gray-600 text-white hover:bg-gray-500"
                        : "bg-yellow-300 text-black hover:bg-yellow-200"
                    }`}
                  >
                    {slide.buttonText}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Carousel Indicators */}

          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {carouselSlides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentCarouselSlide(index)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === currentCarouselSlide
                    ? currentCarouselSlide === 0
                      ? "w-6 bg-white"
                      : "w-6 bg-black"
                    : index === 0
                      ? "w-1.5 bg-white/50"
                      : "w-1.5 bg-black/30"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Conditional Content Based on Swipe Bar Position */}

      {!showHomeSections ? (
        <>
          {/* Map View - Shows map with Hotspot or Select drop mode */}

          <div
            className="relative flex-1 overflow-hidden pb-16 md:pb-0"
            style={{ minHeight: 0, pointerEvents: "auto" }}
          >
            {/* Google Maps Container */}

            <div
              ref={mapContainerRef}
              className="w-full h-full"
              style={{
                height: "100%",

                width: "100%",

                backgroundColor: "#e5e7eb", // Light gray background while loading

                position: "absolute",

                top: 0,

                left: 0,

                right: 0,

                bottom: 0,

                filter: isOnline ? "none" : "grayscale(1)",

                opacity: isOnline ? 1 : 0.8,

                transition: "filter 200ms ease, opacity 200ms ease",

                pointerEvents: "auto",

                zIndex: 0,
              }}
            />

            {!isOnline && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-full border border-gray-400 bg-gray-100/95 px-3 py-1">
                <p className="text-[11px] font-semibold text-gray-700">
                  You are offline
                </p>
              </div>
            )}

            {locationPermissionState === "denied" && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-sm rounded-xl border border-red-200 bg-white/95 px-4 py-3 shadow">
                <p className="text-sm font-semibold text-red-700">
                  Location Permission Required
                </p>

                <p className="text-xs text-gray-700 mt-1">
                  Live tracking needs location access. Enable location
                  permission in your browser/app settings.
                </p>

                <button
                  onClick={requestLocationPermission}
                  className="mt-2 inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Retry Location Access
                </button>
              </div>
            )}

            {/* Loading indicator */}

            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                <div className="flex flex-col items-center gap-2">
                  <div className="text-gray-600 font-medium">
                    Loading map...
                  </div>

                  <div className="text-xs text-gray-500">Please wait</div>
                </div>
              </div>
            )}

            {/* Map Refresh Overlay - Professional Loading Indicator */}

            {isRefreshingLocation && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
              >
                {/* Loading indicator container */}

                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className="relative"
                >
                  {/* Outer pulsing ring */}

                  <motion.div
                    animate={{
                      scale: [1, 1.3, 1],

                      opacity: [0.6, 0.3, 0.6],
                    }}
                    transition={{
                      duration: 2,

                      repeat: Infinity,

                      ease: [0.4, 0, 0.6, 1], // Smooth ease-in-out

                      type: "tween",

                      times: [0, 0.5, 1],
                    }}
                    className="absolute inset-0 w-20 h-20 bg-blue-500/20 rounded-full"
                  />

                  {/* Middle ring */}

                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],

                      opacity: [0.5, 0.2, 0.5],
                    }}
                    transition={{
                      duration: 1.5,

                      repeat: Infinity,

                      ease: [0.4, 0, 0.6, 1], // Smooth ease-in-out

                      type: "tween",

                      delay: 0.3,

                      times: [0, 0.5, 1],
                    }}
                    className="absolute inset-0 w-16 h-16 bg-blue-500/30 rounded-full m-2"
                  />

                  {/* Inner spinner */}

                  <div className="relative w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1.2,

                        repeat: Infinity,

                        ease: "linear",

                        type: "tween",
                      }}
                      className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full"
                    />
                  </div>
                </motion.div>
              </motion.div>
            )}

            {isMapLockedForOrderEligibility && (
              <div
                className="absolute inset-0 z-30 bg-gray-200/75 pointer-events-auto flex items-center justify-center px-6"
                style={{ backdropFilter: "grayscale(1)" }}
              >
                <div className="rounded-xl bg-white/90 border border-gray-300 px-4 py-3 text-center shadow-sm max-w-xs">
                  {isCashInHandLimitReached && (
                    <>
                      <p className="text-sm font-semibold text-gray-900">
                        Cash limit reached
                      </p>

                      <p className="text-xs text-gray-700 mt-1">
                        Cash in hand has reached the delivery cash limit
                        (&#8377;{totalCashLimit.toFixed(2)}). Deposit cash in
                        hand to continue receiving orders.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Floating Action Button - My Location */}

            <motion.button
              onClick={() => {
                if (isMapLockedForOrderEligibility) {
                  if (isCashInHandLimitReached) {
                    toast.error(
                      `Cash in hand limit reached (Rs ${totalCashLimit.toFixed(2)}). Deposit cash in hand to continue receiving orders.`,
                    );
                  }

                  return;
                }

                if (navigator.geolocation) {
                  setIsRefreshingLocation(true);

                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      // Validate coordinates

                      const latitude = position.coords.latitude;

                      const longitude = position.coords.longitude;

                      // Validate coordinates are valid numbers

                      if (
                        typeof latitude !== "number" ||
                        typeof longitude !== "number" ||
                        isNaN(latitude) ||
                        isNaN(longitude) ||
                        latitude < -90 ||
                        latitude > 90 ||
                        longitude < -180 ||
                        longitude > 180
                      ) {
                        console.warn("[WARN] Invalid coordinates received:", {
                          latitude,
                          longitude,
                        });

                        setIsRefreshingLocation(false);

                        return;
                      }

                      const newLocation = [latitude, longitude]; // [lat, lng] format

                      // Calculate heading from previous location

                      let heading = null;

                      if (lastLocationRef.current) {
                        const [prevLat, prevLng] = lastLocationRef.current;

                        heading = calculateHeading(
                          prevLat,
                          prevLng,
                          latitude,
                          longitude,
                        );
                      }

                      // Save location to localStorage (for refresh handling)

                      saveCachedDeliveryLocation(newLocation);

                      // Update route history

                      if (lastLocationRef.current) {
                        routeHistoryRef.current.push({
                          lat: latitude,

                          lng: longitude,
                        });

                        if (routeHistoryRef.current.length > 1000) {
                          routeHistoryRef.current.shift();
                        }
                      } else {
                        routeHistoryRef.current = [
                          {
                            lat: latitude,

                            lng: longitude,
                          },
                        ];
                      }

                      // Update bike marker (only if online - blue dot नहीं, bike icon)

                      if (window.deliveryMapInstance) {
                        // Recenter button should reset manual pan lock and reframe route like Google Maps.

                        isUserPanningRef.current = false;

                        // Always show bike marker on map (both offline and online)

                        // Active order: fit full route, otherwise center rider.

                        if (selectedRestaurantRef.current) {
                          const fitted = fitMapToActiveRoute(
                            window.deliveryMapInstance,
                          );

                          if (!fitted) {
                            window.deliveryMapInstance.panTo({
                              lat: latitude,
                              lng: longitude,
                            });

                            if (
                              (window.deliveryMapInstance.getZoom?.() || 0) < 16
                            ) {
                              window.deliveryMapInstance.setZoom(16);
                            }
                          }
                        }

                        createOrUpdateBikeMarker(
                          latitude,
                          longitude,
                          heading,
                          true,
                        );

                        updateRoutePolyline();
                      }

                      setRiderLocation(newLocation);

                      lastLocationRef.current = newLocation;

                      console.log("[LOC] Location refreshed:", {
                        latitude,

                        longitude,

                        heading,

                        accuracy: position.coords.accuracy,

                        isOnline: isOnlineRef.current,
                      });

                      // Stop refreshing animation after a short delay

                      setTimeout(() => {
                        setIsRefreshingLocation(false);
                      }, 800);
                    },

                    (error) => {
                      console.error("Error getting location:", error);

                      if (error?.code === 1) {
                        handleLocationPermissionDenied();
                      }

                      setIsRefreshingLocation(false);
                    },

                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
                  );
                }
              }}
              disabled={isMapLockedForOrderEligibility}
              className={`absolute bottom-44 right-3 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors z-20 overflow-visible ${
                isMapLockedForOrderEligibility
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-white hover:bg-gray-50"
              }`}
              whileTap={{ scale: 0.92 }}
              transition={{
                type: "spring",

                stiffness: 300,

                damping: 25,

                mass: 0.5,
              }}
            >
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Ripple effect */}

                {isRefreshingLocation && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-blue-500/20"
                    initial={{ scale: 0.9, opacity: 0.6 }}
                    animate={{
                      scale: [0.9, 1.6, 1.8],

                      opacity: [0.6, 0.3, 0],
                    }}
                    transition={{
                      duration: 2,

                      repeat: Infinity,

                      ease: [0.25, 0.46, 0.45, 0.94], // Smooth ease-out

                      times: [0, 0.5, 1],
                    }}
                  />
                )}

                {/* Icon with smooth animations */}

                <motion.div
                  className="relative z-10"
                  animate={{
                    rotate: isRefreshingLocation ? 360 : 0,

                    scale: isRefreshingLocation ? [1, 1.1, 1] : 1,
                  }}
                  transition={{
                    rotate: {
                      duration: 2,

                      repeat: isRefreshingLocation ? Infinity : 0,

                      ease: "linear", // Linear for smooth continuous rotation

                      type: "tween",
                    },

                    scale: {
                      duration: 1.5,

                      repeat: isRefreshingLocation ? Infinity : 0,

                      ease: [0.4, 0, 0.6, 1], // Smooth ease-in-out

                      type: "tween",

                      times: [0, 0.5, 1],
                    },
                  }}
                >
                  <MapPin
                    className={`w-6 h-6 transition-colors duration-500 ease-in-out ${
                      isRefreshingLocation ? "text-blue-600" : "text-gray-700"
                    }`}
                  />
                </motion.div>
              </div>
            </motion.button>

            {/* Floating Banner - Status Message */}

            {mapViewMode === "hotspot" &&
              (deliveryStatus === "pending" ||
                deliveryStatus === "blocked") && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-sm px-6 py-4 z-20 min-w-[96%] text-center"
                >
                  {deliveryStatus === "pending" ? (
                    <>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">
                        Verification Done in 24 Hours
                      </h3>

                      <p className="text-sm text-gray-600">
                        Your account is under verification. You'll be notified
                        once approved.
                      </p>
                    </>
                  ) : deliveryStatus === "blocked" ? (
                    <>
                      <h3 className="text-lg font-bold text-red-600 mb-2">
                        Denied Verification
                      </h3>

                      {rejectionReason && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-left">
                          <p className="text-xs font-semibold text-red-800 mb-2">
                            Reason for Rejection:
                          </p>

                          <div className="text-xs text-red-700 space-y-1">
                            {rejectionReason
                              .split("\n")
                              .filter((line) => line.trim()).length > 1 ? (
                              <ul className="space-y-1 list-disc list-inside">
                                {rejectionReason
                                  .split("\n")
                                  .map(
                                    (point, index) =>
                                      point.trim() && (
                                        <li key={index}>{point.trim()}</li>
                                      ),
                                  )}
                              </ul>
                            ) : (
                              <p className="text-red-700">{rejectionReason}</p>
                            )}
                          </div>
                        </div>
                      )}

                      <p className="text-sm text-gray-700 mb-3">
                        Please correct the above issues and click "Reverify" to
                        resubmit your request for approval.
                      </p>

                      <button
                        onClick={handleReverify}
                        disabled={isReverifying}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto"
                      >
                        {isReverifying ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          "Reverify"
                        )}
                      </button>
                    </>
                  ) : null}
                </motion.div>
              )}

            {/* Bottom Swipeable Bar - Can be dragged up to show home sections */}

            {!showHomeSections && (
              <motion.div
                ref={swipeBarRef}
                initial={{ y: "100%" }}
                animate={{
                  y: isDraggingSwipeBar
                    ? `${-swipeBarPosition * (window.innerHeight * 0.8)}px`
                    : 0,
                }}
                transition={
                  isDraggingSwipeBar
                    ? { duration: 0 }
                    : { type: "spring", damping: 36, stiffness: 180, mass: 0.9 }
                }
                onTouchStart={handleSwipeBarTouchStart}
                onTouchMove={handleSwipeBarTouchMove}
                onTouchEnd={handleSwipeBarTouchEnd}
                onMouseDown={handleSwipeBarMouseDown}
                className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-20"
                style={{
                  touchAction: "pan-y",

                  pointerEvents: "auto",
                }}
              >
                {/* Swipe Handle */}

                <div
                  className="flex flex-col items-center pt-4 pb-2 cursor-grab active:cursor-grabbing"
                  style={{ touchAction: "none" }}
                >
                  <motion.div
                    className="flex flex-col items-center gap-1"
                    animate={{
                      y: isDraggingSwipeBar ? swipeBarPosition * 5 : 0,

                      opacity: isDraggingSwipeBar ? 0.7 : 1,
                    }}
                    transition={{ duration: 0.1 }}
                  >
                    <button
                      onClick={handleChevronUpClick}
                      className="flex items-center justify-center p-2 -m-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
                      aria-label="Slide up"
                    >
                      <ChevronUp
                        className="!w-12 !h-8 scale-x-150 text-gray-400 -mt-2 font-bold"
                        strokeWidth={3}
                      />
                    </button>
                  </motion.div>
                </div>

                {/* Content Area - Shows map info when down */}

                <div className="px-4 pb-6">
                  {mapViewMode === "hotspot" ? (
                    <div className="flex flex-col items-center">
                      {/* <h3 className="text-lg font-bold text-gray-900 mb-2">No hotspots are available</h3>


                  <p className="text-sm text-gray-600 mb-4">Please go online to see hotspots</p> */}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      {/* <h3 className="text-lg font-bold text-gray-900 mb-2">Select drop location</h3>


                  <p className="text-sm text-gray-600 mb-4">Choose a drop location on the map</p> */}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Home Sections View - Full screen when swipe bar is dragged up */}

          <motion.div
            ref={swipeBarRef}
            initial={{ y: "100%" }}
            animate={{
              y: isDraggingSwipeBar
                ? `${(1 - swipeBarPosition) * (window.innerHeight * 0.8)}px`
                : 0,
            }}
            exit={{ y: "100%" }}
            transition={
              isDraggingSwipeBar
                ? { duration: 0 }
                : { type: "spring", damping: 36, stiffness: 180, mass: 0.9 }
            }
            onTouchStart={handleSwipeBarTouchStart}
            onTouchMove={handleSwipeBarTouchMove}
            onTouchEnd={handleSwipeBarTouchEnd}
            onMouseDown={handleSwipeBarMouseDown}
            className="relative flex-1 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ height: "calc(100vh - 200px)", touchAction: "pan-y" }}
          >
            {/* Swipe Handle at Top - Can be dragged down to go back to map */}

            <div
              className="flex flex-col items-center pt-4 pb-2 cursor-grab active:cursor-grabbing bg-white sticky top-0 z-10"
              style={{ touchAction: "none" }}
            >
              <motion.div
                className="flex flex-col items-center gap-1"
                animate={{
                  y: isDraggingSwipeBar ? -swipeBarPosition * 5 : 0,

                  opacity: isDraggingSwipeBar ? 0.7 : 1,
                }}
                transition={{ duration: 0.1 }}
              >
                <button
                  onClick={handleChevronDownClick}
                  className="flex items-center justify-center p-2 -m-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
                  aria-label="Slide down"
                >
                  <ChevronDown
                    className="!w-12 !h-8 scale-x-150 text-gray-400 -mt-2 font-bold"
                    strokeWidth={3}
                  />
                </button>
              </motion.div>
            </div>

            <div
              ref={homeSectionsScrollRef}
              className="px-4 pt-4 pb-16 space-y-4 overflow-y-auto"
              style={{
                height: "calc(100vh - 250px)",

                touchAction: "pan-y", // Allow vertical scrolling

                WebkitOverflowScrolling: "touch", // Smooth scrolling on iOS
              }}
            >
              {/* Referral Bonus Banner */}

              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                onClick={() => navigate("/delivery/refer-and-earn")}
                className="w-full rounded-xl p-6 shadow-lg relative overflow-hidden min-h-[70px] cursor-pointer"
                style={{
                  backgroundImage: `url(${referralBonusBg})`,

                  backgroundSize: "100% 100%",

                  backgroundPosition: "center",

                  backgroundRepeat: "no-repeat",
                }}
              >
                <div className="relative z-10">
                  <div className="text-white text-3xl font-bold mb-1">
                    &#8377;6,000{" "}
                    <span className="text-white/90 text-base font-medium mb-1">
                      referral bonus
                    </span>
                  </div>

                  <div className="text-white/80 text-sm">
                    Refer your friends now
                  </div>
                </div>
              </motion.div>

              {/* Unlock Offer Card */}

              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="w-full rounded-xl p-6 shadow-lg bg-black text-white"
              >
                <div className="flex items-center text-center justify-center gap-2 mb-2">
                  <div className="text-4xl font-bold text-center">
                    &#8377;100
                  </div>

                  <Lock className="w-5 h-5 text-white" />
                </div>

                <p className="text-white/90 text-center text-sm mb-4">
                  Complete 1 order to unlock &#8377;100
                </p>

                <div className="flex items-center text-center justify-center gap-2 text-white/70 text-xs mb-4">
                  <Clock className="w-4 h-4" />

                  <span className="text-center">
                    {hasActiveOffer
                      ? `Valid till ${weekEndDate}`
                      : "No active offer"}
                  </span>
                </div>

                <button
                  onClick={() => {
                    if (isOnline) {
                      goOffline();
                    } else {
                      // Always show the popup when offline (same as navbar behavior)

                      setShowBookGigsPopup(true);
                    }
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Go online</span>

                  <ArrowRight className="w-5 h-5" />
                </button>
              </motion.div>

              {/* Earnings Guarantee Card */}

              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.25 }}
                className="w-full rounded-xl overflow-hidden shadow-lg bg-white"
              >
                {/* Header */}

                <div className="border-b  border-gray-100">
                  <div className="flex p-2 px-3 items-center justify-between bg-black">
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-white mb-1">
                        Earnings Guarantee
                      </h2>

                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white">
                          {hasActiveOffer
                            ? `Valid till ${weekEndDate}`
                            : "No active offer"}
                        </span>

                        {isOfferLive && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>

                            <span className="text-sm text-green-600 font-medium">
                              Live
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Summary Box */}

                    <div className="bg-black text-white px-4 py-3 rounded-lg text-center min-w-[80px]">
                      <div className="text-2xl font-bold">
                        &#8377;{earningsGuaranteeTarget.toFixed(0)}
                      </div>

                      <div className="text-xs text-white/80 mt-1">
                        {hasActiveOffer
                          ? `${earningsGuaranteeOrdersTarget} orders`
                          : "This week"}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRejectClick}
                    className="mt-3 w-full border border-gray-300 text-gray-700 py-3 rounded-full font-semibold text-sm hover:bg-gray-50 transition-colors"
                  >
                    Can't accept this order
                  </button>
                </div>

                {/* Progress Circles */}

                <div className="px-6 py-6">
                  <div className="flex items-center justify-around gap-6">
                    {/* Orders Progress Circle */}

                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.4, duration: 0.5, type: "spring" }}
                      className="flex flex-col items-center"
                    >
                      <div className="relative w-32 h-32">
                        <svg
                          className="w-32 h-32 transform -rotate-90"
                          viewBox="0 0 120 120"
                        >
                          {/* Background circle */}

                          <circle
                            cx="60"
                            cy="60"
                            r="50"
                            fill="none"
                            stroke="#e5e7eb"
                            strokeWidth="8"
                          />

                          {/* Progress circle */}

                          <motion.circle
                            cx="60"
                            cy="60"
                            r="50"
                            fill="none"
                            stroke="#000000"
                            strokeWidth="8"
                            strokeLinecap="round"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: ordersProgress }}
                            transition={{
                              delay: 0.6,
                              duration: 1,
                              ease: "easeOut",
                            }}
                          />
                        </svg>

                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xl font-bold text-gray-900">
                            {hasActiveOffer
                              ? `${earningsGuaranteeCurrentOrders} of ${earningsGuaranteeOrdersTarget || 0}`
                              : `${earningsGuaranteeCurrentOrders}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        <svg
                          className="w-5 h-5 text-gray-700"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>

                        <span className="text-sm font-medium text-gray-700">
                          Orders
                        </span>
                      </div>
                    </motion.div>

                    {/* Earnings Progress Circle */}

                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.5, duration: 0.5, type: "spring" }}
                      className="flex flex-col items-center"
                    >
                      <div className="relative w-32 h-32">
                        <svg
                          className="w-32 h-32 transform -rotate-90"
                          viewBox="0 0 120 120"
                        >
                          {/* Background circle */}

                          <circle
                            cx="60"
                            cy="60"
                            r="50"
                            fill="none"
                            stroke="#e5e7eb"
                            strokeWidth="8"
                          />

                          {/* Progress circle */}

                          <motion.circle
                            cx="60"
                            cy="60"
                            r="50"
                            fill="none"
                            stroke="#000000"
                            strokeWidth="8"
                            strokeLinecap="round"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: earningsProgress }}
                            transition={{
                              delay: 0.7,
                              duration: 1,
                              ease: "easeOut",
                            }}
                          />
                        </svg>

                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-lg font-bold text-gray-900">
                            &#8377;{earningsGuaranteeCurrentEarnings.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        <IndianRupee className="w-5 h-5 text-gray-700" />

                        <span className="text-sm font-medium text-gray-700">
                          Earnings
                        </span>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </motion.div>

              {/* Today's Progress Card */}

              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                className="w-full rounded-xl overflow-hidden shadow-lg bg-white"
              >
                {/* Header */}

                <div className="bg-black px-4 py-3 flex items-center gap-3">
                  <div className="relative">
                    <Calendar className="w-5 h-5 text-white" />

                    <CheckCircle
                      className="w-3 h-3 text-green-500 absolute -top-1 -right-1 bg-white rounded-full"
                      fill="currentColor"
                    />
                  </div>

                  <span className="text-white font-semibold">
                    Today's progress
                  </span>
                </div>

                {/* Content */}

                <div className="p-4">
                  {/* Grid Layout - 2x2 */}

                  <div className="grid grid-cols-2 gap-4">
                    {/* Top Left - Earnings */}

                    <button
                      onClick={() => navigate("/delivery/earnings")}
                      className="flex flex-col items-start gap-1 hover:opacity-80 transition-opacity"
                    >
                      <span className="text-2xl font-bold text-gray-900">
                        {formatCurrency(todayEarnings)}
                      </span>

                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <span>Earnings</span>

                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </button>

                    {/* Top Right - Trips */}

                    <button
                      onClick={() => navigate("/delivery/trip-history")}
                      className="flex flex-col items-end gap-1 hover:opacity-80 transition-opacity"
                    >
                      <span className="text-2xl font-bold text-gray-900">
                        {todayTrips}
                      </span>

                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <span>Trips</span>

                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </button>

                    {/* Bottom Left - Time on orders */}

                    <button
                      onClick={() => navigate("/delivery/time-on-orders")}
                      className="flex flex-col items-start gap-1 hover:opacity-80 transition-opacity"
                    >
                      <span className="text-2xl font-bold text-gray-900">
                        {`${formatHours(todayHoursWorked)} hrs`}
                      </span>

                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <span>Time on orders</span>

                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </button>

                    {/* Bottom Right - Gigs History */}

                    <button
                      onClick={() => navigate("/delivery/gig")}
                      className="flex flex-col items-end gap-1 hover:opacity-80 transition-opacity"
                    >
                      <span className="text-2xl font-bold text-gray-900">
                        {`${todayGigsCount} Gigs`}
                      </span>

                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <span>History</span>

                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </>
      )}

      {/* Help Popup */}

      <BottomPopup
        isOpen={showHelpPopup}
        onClose={() => setShowHelpPopup(false)}
        title="How can we help?"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="70vh"
      >
        <div className="py-2">
          {helpOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => handleHelpOptionClick(option)}
              className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              {/* Icon */}

              <div className="shrink-0 w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                {option.icon === "helpCenter" && (
                  <HelpCircle className="w-6 h-6 text-gray-700" />
                )}

                {option.icon === "ticket" && (
                  <svg
                    className="w-6 h-6 text-gray-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                    />
                  </svg>
                )}

                {option.icon === "idCard" && (
                  <svg
                    className="w-6 h-6 text-gray-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
                    />
                  </svg>
                )}

                {option.icon === "language" && (
                  <svg
                    className="w-6 h-6 text-gray-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                    />
                  </svg>
                )}
              </div>

              {/* Text Content */}

              <div className="flex-1 text-left">
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  {option.title}
                </h3>

                <p className="text-sm text-gray-600">{option.subtitle}</p>
              </div>

              {/* Arrow Icon */}

              <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
            </button>
          ))}
        </div>
      </BottomPopup>

      <AnimatePresence>
        {isOnline && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -12 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowAdvancedOrdersPanel(true)}
            className="fixed right-4 top-[86px] z-[96] flex items-center gap-3 rounded-full border border-orange-200 bg-white/95 px-3 py-2 shadow-[0_14px_40px_rgba(15,23,42,0.18)] backdrop-blur"
          >
            <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 text-white shadow-lg">
              <span className="absolute inset-0 rounded-full bg-orange-300/50 animate-ping" />
              <Bell className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold leading-none text-white">
                {totalAdvancedOrdersCount}
              </span>
            </div>
            <div className="text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-500">
                Advance Orders
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {totalAdvancedOrdersCount === 0
                  ? "No queued orders"
                  : acceptedAdvanceOrders.length > 0
                  ? `${acceptedAdvanceOrders.length} accepted next`
                  : `${advancedOrders.length} waiting`}
              </p>
              <p className="text-[11px] text-slate-500">
                {totalAdvancedOrdersCount === 0
                  ? "Bell stays here for upcoming slots"
                  : advancedOrders.length > 0
                  ? `${advancedOrders.length} to review`
                  : "Tap to view status"}
              </p>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdvancedOrdersPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[104] bg-slate-950/45"
              onClick={() => setShowAdvancedOrdersPanel(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 32 }}
              transition={{ type: "spring", damping: 24, stiffness: 260 }}
              className="fixed inset-x-0 top-28 z-[105] mx-auto w-[calc(100%-24px)] max-w-sm overflow-hidden rounded-[28px] border border-orange-100 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.28)]"
            >
              <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-400 px-5 py-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80">
                      Advance Orders
                    </p>
                    <h3 className="mt-1 text-lg font-bold">Queued for you</h3>
                    <p className="mt-1 text-sm text-white/90">
                      Open any assigned order below to review and accept it
                      without losing track of your current delivery.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAdvancedOrdersPanel(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/18 text-white transition hover:bg-white/28"
                    aria-label="Close advanced orders"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-4">
                {totalAdvancedOrdersCount === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
                      <Bell className="h-5 w-5 text-orange-500" />
                    </div>
                    <h4 className="mt-3 text-sm font-semibold text-slate-900">
                      No advance orders right now
                    </h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      This bell stays visible so you can always check future
                      slots as soon as they get assigned.
                    </p>
                  </div>
                )}

                {acceptedAdvanceOrders.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
                        Accepted Next
                      </p>
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                        Ready after current order
                      </span>
                    </div>

                    {acceptedAdvanceOrders.map((order) => {
                      const orderId = getQueuedOrderIdentity(order);
                      const earnings = Number(
                        order?.estimatedEarnings ||
                          order?.amount ||
                          order?.deliveryFee ||
                          0,
                      );

                      return (
                        <button
                          key={`accepted-${String(orderId)}`}
                          type="button"
                          onClick={() => handlePreviewAcceptedAdvanceOrder(order)}
                          className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-100/80"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
                                Accepted in Advance
                              </p>
                              <h4 className="mt-1 text-base font-bold text-slate-900">
                                {order?.restaurantName ||
                                  order?.name ||
                                  "Restaurant"}
                              </h4>
                              <p className="mt-1 text-xs text-slate-500">
                                Order {order?.orderId || orderId || "Pending"}
                              </p>
                            </div>
                            <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                              Rs{" "}
                              {Number.isFinite(earnings)
                                ? earnings.toFixed(0)
                                : "0"}
                            </div>
                          </div>

                          <p className="mt-3 text-sm text-slate-600">
                            This one is locked in. Tap to reopen the accepted
                            flow and review the queued order details.
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {advancedOrders.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                        Pending Review
                      </p>
                      <span className="rounded-full bg-orange-100 px-2 py-1 text-[11px] font-semibold text-orange-700">
                        Tap any card to open
                      </span>
                    </div>

                    {advancedOrders.map((order) => {
                      const orderId = getQueuedOrderIdentity(order);
                      const earnings = Number(
                        order?.estimatedEarnings ||
                          order?.amount ||
                          order?.deliveryFee ||
                          0,
                      );
                      const pickupDistance =
                        normalizeDistanceLabel(order?.pickupDistance) ||
                        "Pickup distance pending";
                      const dropDistance =
                        normalizeDistanceLabel(
                          order?.deliveryDistance || order?.dropDistance,
                        ) || "Drop distance pending";

                      return (
                        <button
                          key={String(orderId)}
                          onClick={() => handleOpenAdvancedOrderFlow(order)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-orange-300 hover:bg-orange-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">
                                Advance Slot
                              </p>
                              <h4 className="mt-1 text-base font-bold text-slate-900">
                                {order?.restaurantName ||
                                  order?.name ||
                                  "Restaurant"}
                              </h4>
                              <p className="mt-1 text-xs text-slate-500">
                                Order {order?.orderId || orderId || "Pending"}
                              </p>
                            </div>
                            <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Rs{" "}
                              {Number.isFinite(earnings)
                                ? earnings.toFixed(0)
                                : "0"}
                            </div>
                          </div>

                          <p className="mt-3 text-sm text-slate-600">
                            {normalizeAddressLabel(
                              order?.restaurantLocation?.address ||
                                order?.restaurantAddress ||
                                order?.address,
                              "Address not available",
                            )}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                              Pickup: {pickupDistance}
                            </span>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                              Drop: {dropDistance}
                            </span>
                          </div>

                          <div className="mt-4 flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500">
                              Tap to open this order flow
                            </span>
                            <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                              Open
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Emergency Help Popup */}

      <BottomPopup
        isOpen={showEmergencyPopup}
        onClose={() => setShowEmergencyPopup(false)}
        title="Emergency help"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="70vh"
      >
        <div className="py-2">
          {emergencyOptions.map((option, index) => (
            <button
              key={option.id}
              onClick={() => handleEmergencyOptionClick(option)}
              className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
            >
              {/* Icon */}

              <div className="shrink-0 w-14 h-14 rounded-lg flex items-center justify-center">
                {option.icon === "ambulance" && (
                  <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center shadow-sm border border-gray-200 relative overflow-hidden">
                    {/* Ambulance vehicle */}

                    <div className="absolute inset-0 bg-blue-500"></div>

                    {/* Red and blue lights on roof */}

                    <div className="absolute top-1 left-2 w-2 h-3 bg-red-500 rounded-sm"></div>

                    <div className="absolute top-1 right-2 w-2 h-3 bg-blue-500 rounded-sm"></div>

                    {/* Star of Life emblem */}

                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-blue-600"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2L2 7v10l10 5 10-5V7l-10-5zm0 2.18l8 4v7.64l-8 4-8-4V8.18l8-4z" />

                        <path d="M12 8L6 11v6l6 3 6-3v-6l-6-3z" />
                      </svg>
                    </div>

                    {/* AMBULANCE text */}

                    <div className="absolute bottom-1 left-0 right-0 text-[6px] font-bold text-white text-center">
                      AMBULANCE
                    </div>
                  </div>
                )}

                {option.icon === "siren" && (
                  <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center shadow-sm border border-gray-200 relative">
                    {/* Red siren dome */}

                    <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center relative">
                      {/* Yellow light rays */}

                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 border-2 border-yellow-400 rounded-full animate-pulse"></div>
                      </div>

                      {/* Phone icon inside */}

                      <Phone className="w-5 h-5 text-yellow-400 z-10" />
                    </div>
                  </div>
                )}

                {option.icon === "police" && (
                  <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center shadow-sm border border-gray-200">
                    {/* Police officer bust */}

                    <div className="relative">
                      {/* Head */}

                      <div className="w-10 h-10 bg-gray-300 rounded-full"></div>

                      {/* Cap */}

                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-4 bg-amber-700 rounded-t-lg"></div>

                      {/* Cap peak */}

                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-10 h-1 bg-amber-800"></div>

                      {/* Mustache */}

                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-6 h-2 bg-gray-800 rounded-full"></div>
                    </div>
                  </div>
                )}

                {option.icon === "insurance" && (
                  <div className="w-14 h-14 bg-yellow-400 rounded-lg flex items-center justify-center shadow-sm border border-gray-200 relative">
                    {/* Card shape */}

                    <div className="w-12 h-8 bg-white rounded-sm relative">
                      {/* Red heart and cross on left */}

                      <div className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        <svg
                          className="w-3 h-3 text-red-500"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>

                        <div className="w-0.5 h-3 bg-red-500"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Text Content */}

              <div className="flex-1 text-left">
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  {option.title}
                </h3>

                <p className="text-sm text-gray-600">{option.subtitle}</p>
              </div>

              {/* Arrow Icon */}

              <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      </BottomPopup>

      {/* Book Gigs Popup */}

      <BottomPopup
        isOpen={showBookGigsPopup}
        onClose={() => setShowBookGigsPopup(false)}
        title="Book gigs to go online"
        showCloseButton={true}
        closeOnBackdropClick={true}
        maxHeight="auto"
      >
        <div className="py-4">
          {/* Gig Details Card */}

          <div className="mb-6 rounded-lg overflow-hidden shadow-sm border border-gray-200">
            {/* Header - Teal background */}

            <div className="bg-teal-100 px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">g</span>
              </div>

              <span className="text-teal-700 font-semibold">Gig details</span>
            </div>

            {/* Body - White background */}

            <div className="bg-white px-4 py-4">
              <p className="text-gray-900 text-sm">
                Gig booking open in your zone
              </p>
            </div>
          </div>

          {/* Description */}

          <p className="text-gray-900 text-sm mb-6">
            Book your Gigs now to go online and start delivering orders
          </p>

          {/* Book Gigs Button */}

          <button
            onClick={() => {
              setShowBookGigsPopup(false);

              navigate("/delivery/gig");
            }}
            className="w-full bg-black hover:bg-gray-800 text-white font-semibold py-4 rounded-lg transition-colors"
          >
            Book gigs
          </button>
        </div>
      </BottomPopup>

      <DeliveryHomeNewOrderPopup
        isVisible={showNewOrderPopup}
        newOrder={newOrder}
        selectedRestaurant={selectedRestaurant}
        isOnline={isOnline}
        isActiveOrderCancelled={isActiveOrderCancelled}
        isNewOrderPopupMinimized={isNewOrderPopupMinimized}
        isDraggingNewOrderPopup={isDraggingNewOrderPopup}
        newOrderDragY={newOrderDragY}
        newOrderPopupRef={newOrderPopupRef}
        countdownSeconds={countdownSeconds}
        pendingNewOrdersCount={pendingNewOrdersCount}
        normalizeDistanceLabel={normalizeDistanceLabel}
        normalizeAddressLabel={normalizeAddressLabel}
        calculateTimeAway={calculateTimeAway}
        handleNewOrderPopupTouchStart={handleNewOrderPopupTouchStart}
        handleNewOrderPopupTouchMove={handleNewOrderPopupTouchMove}
        handleNewOrderPopupTouchEnd={handleNewOrderPopupTouchEnd}
        newOrderAcceptButtonRef={newOrderAcceptButtonRef}
        handleNewOrderAcceptTouchStart={handleNewOrderAcceptTouchStart}
        handleNewOrderAcceptTouchMove={handleNewOrderAcceptTouchMove}
        handleNewOrderAcceptTouchEnd={handleNewOrderAcceptTouchEnd}
        handleNewOrderAcceptTouchCancel={handleNewOrderAcceptTouchCancel}
        handleNewOrderAcceptMouseDown={handleNewOrderAcceptMouseDown}
        newOrderAcceptButtonProgress={newOrderAcceptButtonProgress}
        newOrderIsAnimatingToComplete={newOrderIsAnimatingToComplete}
        isAcceptingNewOrder={isAcceptingNewOrder}
        isRejectingOrder={isRejectingOrder}
        handleQuickDenyNewOrder={handleQuickDenyNewOrder}
        deliveryAcceptSwipeConfirmThreshold={DELIVERY_ACCEPT_SWIPE_CONFIRM_THRESHOLD}
      />

      <DeliveryHomeRejectPopup
        isOpen={showRejectPopup}
        rejectReasons={rejectReasons}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        isRejectingOrder={isRejectingOrder}
        handleRejectCancel={handleRejectCancel}
        handleRejectConfirm={handleRejectConfirm}
      />

      {/* Directions Map View */}

      <AnimatePresence>
        {showDirectionsMap && selectedRestaurant && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[120] bg-white"
          >
            {/* Ola Maps Container for Directions */}

            <div
              ref={directionsMapContainerRef}
              key="directions-map-container" // Fixed key - don't remount on location change
              style={{ height: "100%", width: "100%", zIndex: 1 }}
            />

            {/* Loading indicator */}

            {directionsMapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                <div className="text-gray-600">Loading map...</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <DeliveryHomeReachedPickupPopup
        isOpen={
          (showreachedPickupPopup &&
            !showOrderIdConfirmationPopup &&
            !isActiveOrderCancelled) ||
          Boolean(previewAdvanceOrder)
        }
        selectedRestaurant={previewAdvanceOrder || selectedRestaurant}
        isOrderCancelledState={isOrderCancelledState}
        onClose={() => {
          if (previewAdvanceOrder) {
            setPreviewAdvanceOrder(null);
            return;
          }
          setShowreachedPickupPopup(false);
        }}
        onCallRestaurant={() =>
          handleCallRestaurant(previewAdvanceOrder || undefined)
        }
        onOpenMap={() =>
          handleOpenRestaurantNavigation(previewAdvanceOrder || undefined)
        }
        isPreview={Boolean(previewAdvanceOrder)}
        reachedPickupButtonRef={reachedPickupButtonRef}
        reachedPickupButtonProgress={reachedPickupButtonProgress}
        reachedPickupIsAnimatingToComplete={reachedPickupIsAnimatingToComplete}
        handlereachedPickupTouchStart={handlereachedPickupTouchStart}
        handlereachedPickupTouchMove={handlereachedPickupTouchMove}
        handlereachedPickupTouchEnd={handlereachedPickupTouchEnd}
        deliverySwipeConfirmThreshold={DELIVERY_SWIPE_CONFIRM_THRESHOLD}
      />

      {/* Order ID Confirmation Popup - shown after Reached Pickup swipe is confirmed */}

      <BottomPopup
        isOpen={showOrderIdConfirmationPopup && !isActiveOrderCancelled}
        onClose={() => setShowOrderIdConfirmationPopup(false)}
        showCloseButton={false}
        closeOnBackdropClick={false}
        maxHeight="60vh"
        showHandle={false}
        showBackdrop={false}
        backdropBlocksInteraction={false}
      >
        <div className="">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Confirm Order ID
            </h2>

            <p className="text-gray-600 text-sm mb-4">
              Please verify the order ID with the restaurant before pickup
            </p>

            {/* Order ID Display - single line, scroll horizontally if needed */}

            <div className="bg-gray-50 rounded-xl p-6 mb-6 overflow-hidden">
              <p className="text-gray-500 text-xs mb-2">Order ID</p>

              <p className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-wider whitespace-nowrap overflow-x-auto min-w-0">
                {selectedRestaurant?.orderId ||
                  selectedRestaurant?.id ||
                  newOrder?.orderId ||
                  newOrder?.orderMongoId ||
                  "ORD1234567890"}
              </p>
            </div>

            {/* Bill Image Upload Section */}

            <div className="mb-6">
              <p className="text-gray-600 text-sm mb-3 text-center">
                {billImageUploaded
                  ? "[OK] Bill image uploaded"
                  : billImageSkipped
                    ? "[OK] Bill upload skipped"
                    : "Please capture bill image"}
              </p>

              {/* Camera Button */}

              <div className="flex justify-center mb-4">
                <button
                  onClick={() => handleBillImageCapture("camera")}
                  disabled={isUploadingBill}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition-colors ${
                    isUploadingBill
                      ? "bg-gray-400 cursor-not-allowed"
                      : billImageUploaded
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-blue-600 hover:bg-blue-700"
                  } text-white font-medium`}
                >
                  {isUploadingBill ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />

                      <span>Uploading...</span>
                    </>
                  ) : billImageUploaded ? (
                    <>
                      <CheckCircle className="w-5 h-5" />

                      <span>Bill Uploaded</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5" />

                      <span>Capture Bill</span>
                    </>
                  )}
                </button>
              </div>

              {!billImageUploaded && (
                <div className="flex items-center justify-center gap-3 mb-4">
                  <button
                    onClick={() => handleBillImageCapture("gallery")}
                    disabled={isUploadingBill}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Gallery</span>
                  </button>
                  <button
                    onClick={handleSkipBillUpload}
                    disabled={isUploadingBill}
                    className="text-sm font-medium text-gray-600 underline-offset-4 transition hover:text-gray-900 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Skip for now
                  </button>
                </div>
              )}

              {/* Hidden file input for camera (sr-only keeps it in DOM for mobile camera) */}

              <input
                id="bill-gallery-input"
                ref={fileInputRef}
                type="file"
                accept={BILL_IMAGE_ACCEPT}
                onChange={handleBillImageSelect}
                className="sr-only"
              />

              <input
                id="bill-camera-input"
                ref={cameraInputRef}
                type="file"
                accept={BILL_IMAGE_ACCEPT}
                capture="environment"
                onChange={handleBillImageSelect}
                className="sr-only"
              />
            </div>

            {/* Order Picked Up Button with Swipe */}

            <div className="relative w-full">
              <motion.div
                ref={orderIdConfirmButtonRef}
                className={`relative w-full rounded-full overflow-hidden shadow-xl ${
                  isOrderCancelledState(selectedRestaurant)
                    ? "bg-gray-400 cursor-not-allowed"
                    : hasBillProof
                      ? "bg-green-600"
                      : "bg-gray-400 cursor-not-allowed"
                }`}
                style={{
                  touchAction:
                    hasBillProof && !isOrderCancelledState(selectedRestaurant)
                      ? "pan-x"
                      : "none",

                  opacity:
                    hasBillProof && !isOrderCancelledState(selectedRestaurant)
                      ? 1
                      : 0.6,
                }}
                onTouchStart={
                  hasBillProof && !isOrderCancelledState(selectedRestaurant)
                    ? handleOrderIdConfirmTouchStart
                    : undefined
                }
                onTouchMove={
                  hasBillProof && !isOrderCancelledState(selectedRestaurant)
                    ? handleOrderIdConfirmTouchMove
                    : undefined
                }
                onTouchEnd={
                  hasBillProof && !isOrderCancelledState(selectedRestaurant)
                    ? handleOrderIdConfirmTouchEnd
                    : undefined
                }
                whileTap={
                  hasBillProof && !isOrderCancelledState(selectedRestaurant)
                    ? { scale: 0.98 }
                    : {}
                }
              >
                {/* Swipe progress background */}

                <motion.div
                  className="absolute inset-0 bg-green-500 rounded-full"
                  animate={{
                    width: `${orderIdConfirmButtonProgress * 100}%`,
                  }}
                  transition={
                    orderIdConfirmIsAnimatingToComplete
                      ? {
                          type: "spring",

                          stiffness: 200,

                          damping: 25,
                        }
                      : { duration: 0 }
                  }
                />

                {/* Button content container */}

                <div className="relative flex items-center h-[64px] px-1">
                  {/* Left: Black circle with arrow */}

                  <motion.div
                    className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shrink-0 relative z-20 shadow-2xl"
                    animate={{
                      x:
                        orderIdConfirmButtonProgress *
                        (orderIdConfirmButtonRef.current
                          ? orderIdConfirmButtonRef.current.offsetWidth -
                            56 -
                            32
                          : 240),
                    }}
                    transition={
                      orderIdConfirmIsAnimatingToComplete
                        ? {
                            type: "spring",

                            stiffness: 300,

                            damping: 30,
                          }
                        : { duration: 0 }
                    }
                  >
                    <ArrowRight className="w-5 h-5 text-white" />
                  </motion.div>

                  {/* Text - centered and stays visible */}

                  <div className="absolute inset-0 flex items-center justify-center left-16 right-4 pointer-events-none">
                    <motion.span
                      className="text-white font-semibold flex items-center justify-center text-center text-base select-none"
                      animate={{
                        opacity:
                          orderIdConfirmButtonProgress > 0.5
                            ? Math.max(
                                0.2,
                                1 - orderIdConfirmButtonProgress * 0.8,
                              )
                            : 1,

                        x:
                          orderIdConfirmButtonProgress > 0.5
                            ? orderIdConfirmButtonProgress * 15
                            : 0,
                      }}
                      transition={
                        orderIdConfirmIsAnimatingToComplete
                          ? {
                              type: "spring",

                              stiffness: 200,

                              damping: 25,
                            }
                          : { duration: 0 }
                      }
                    >
                      {isOrderCancelledState(selectedRestaurant)
                        ? "Order Cancelled"
                        : !hasBillProof
                          ? "Upload or Skip Bill"
                          : orderIdConfirmButtonProgress > 0.5
                            ? "Release to Confirm"
                            : "Order Picked Up"}
                    </motion.span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </BottomPopup>

      {/* Reached Drop Popup - shown instantly after Order Picked Up confirmation */}

      <BottomPopup
        isOpen={showReachedDropPopup && !isActiveOrderCancelled}
        onClose={() => setShowReachedDropPopup(false)}
        showCloseButton={false}
        closeOnBackdropClick={false}
        maxHeight="70vh"
        showHandle={true}
        showBackdrop={false}
        backdropBlocksInteraction={false}
      >
        <div className="">
          {/* Drop Label */}

          <div className="mb-4">
            <span className="bg-teal-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
              Drop
            </span>
          </div>

          {/* Customer Info */}

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {selectedRestaurant?.customerName || "Customer Name"}
            </h2>

            <p className="text-gray-600 mb-2 leading-relaxed">
              {selectedRestaurant?.customerAddress || "Customer Address"}
            </p>

            <p className="text-gray-500 text-sm font-medium">
              Order ID: {selectedRestaurant?.orderId || "ORD1234567890"}
            </p>

            {isOrderCancelledState(selectedRestaurant) && (
              <p className="mt-2 text-sm font-semibold text-red-600">
                Order cancelled by user
              </p>
            )}
          </div>

          {/* Action Buttons */}

          <div className="flex gap-3 mb-6">
            <button
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              onClick={async () => {
                try {
                  let customerPhone =
                    selectedRestaurant?.customerPhone ||
                    selectedRestaurant?.customer?.phone ||
                    selectedRestaurant?.userPhone ||
                    "";

                  if (!customerPhone) {
                    const orderIdForLookup =
                      selectedRestaurant?.orderId ||
                      selectedRestaurant?.id ||
                      newOrder?.orderId ||
                      newOrder?.orderMongoId;

                    if (orderIdForLookup) {
                      const response =
                        await deliveryAPI.getOrderDetails(orderIdForLookup);
                      const order =
                        response?.data?.data?.order ||
                        response?.data?.data ||
                        null;
                      customerPhone =
                        order?.userId?.phone ||
                        order?.customerPhone ||
                        order?.phone ||
                        "";

                      if (customerPhone) {
                        setSelectedRestaurant((prev) =>
                          prev
                            ? {
                                ...prev,
                                customerPhone,
                              }
                            : prev,
                        );
                      }
                    }
                  }

                  const cleanPhone = String(customerPhone || "").replace(
                    /[^\d+]/g,
                    "",
                  );
                  if (!cleanPhone) {
                    toast.error("Customer phone number not available.");
                    return;
                  }

                  window.location.href = `tel:${cleanPhone}`;
                } catch (error) {
                  console.error(
                    "Failed to call customer from Reached Drop:",
                    error,
                  );
                  toast.error("Unable to fetch customer phone number.");
                }
              }}
            >
              <Phone className="w-5 h-5 text-gray-700" />

              <span className="text-gray-700 font-medium">Call</span>
            </button>

            <button
              onClick={handleOpenCustomerNavigation}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <MapPin className="w-5 h-5 text-white" />

              <span className="text-white font-medium">Map</span>
            </button>
          </div>

          {/* Reached Drop Button with Swipe */}

          <div className="relative w-full">
            <motion.div
              ref={reachedDropButtonRef}
              className={`relative w-full rounded-full overflow-hidden shadow-xl ${
                isOrderCancelledState(selectedRestaurant)
                  ? "bg-gray-400 opacity-70"
                  : "bg-green-600"
              }`}
              style={{
                touchAction: isOrderCancelledState(selectedRestaurant)
                  ? "none"
                  : "pan-x",
              }} // Prevent vertical scrolling, allow horizontal pan
              onTouchStart={
                isOrderCancelledState(selectedRestaurant)
                  ? undefined
                  : handleReachedDropTouchStart
              }
              onTouchMove={
                isOrderCancelledState(selectedRestaurant)
                  ? undefined
                  : handleReachedDropTouchMove
              }
              onTouchEnd={
                isOrderCancelledState(selectedRestaurant)
                  ? undefined
                  : handleReachedDropTouchEnd
              }
              whileTap={
                isOrderCancelledState(selectedRestaurant) ? {} : { scale: 0.98 }
              }
            >
              {/* Swipe progress background */}

              <motion.div
                className="absolute inset-0 bg-green-500 rounded-full"
                animate={{
                  width: `${reachedDropButtonProgress * 100}%`,
                }}
                transition={
                  reachedDropIsAnimatingToComplete
                    ? {
                        type: "spring",

                        stiffness: 200,

                        damping: 25,
                      }
                    : { duration: 0 }
                }
              />

              {/* Button content container */}

              <div className="relative flex items-center h-[64px] px-1">
                {/* Left: Black circle with arrow */}

                <motion.div
                  className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shrink-0 relative z-20 shadow-2xl"
                  animate={{
                    x:
                      reachedDropButtonProgress *
                      (reachedDropButtonRef.current
                        ? reachedDropButtonRef.current.offsetWidth - 56 - 32
                        : 240),
                  }}
                  transition={
                    reachedDropIsAnimatingToComplete
                      ? {
                          type: "spring",

                          stiffness: 300,

                          damping: 30,
                        }
                      : { duration: 0 }
                  }
                >
                  <ArrowRight className="w-5 h-5 text-white" />
                </motion.div>

                {/* Text - centered and stays visible */}

                <div className="absolute inset-0 flex items-center justify-center left-16 right-4 pointer-events-none">
                  <motion.span
                    className="text-white font-semibold flex items-center justify-center text-center text-base select-none"
                    animate={{
                      opacity:
                        reachedDropButtonProgress > 0.5
                          ? Math.max(0.2, 1 - reachedDropButtonProgress * 0.8)
                          : 1,

                      x:
                        reachedDropButtonProgress > 0.5
                          ? reachedDropButtonProgress * 15
                          : 0,
                    }}
                    transition={
                      reachedDropIsAnimatingToComplete
                        ? {
                            type: "spring",

                            stiffness: 200,

                            damping: 25,
                          }
                        : { duration: 0 }
                    }
                  >
                    {isOrderCancelledState(selectedRestaurant)
                      ? "Order Cancelled"
                      : reachedDropButtonProgress >
                          DELIVERY_SWIPE_CONFIRM_THRESHOLD
                        ? "Release to Confirm"
                        : "Reached Drop"}
                  </motion.span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </BottomPopup>

      {/* Order Delivered Bottom Popup - shown instantly after Reached Drop is confirmed */}

      <BottomPopup
        isOpen={showOrderDeliveredAnimation}
        onClose={() => {
          setShowOrderDeliveredAnimation(false);

          setShowCustomerReviewPopup(true);
        }}
        showCloseButton={false}
        closeOnBackdropClick={false}
        maxHeight="80vh"
        showHandle={true}
        showBackdrop={false}
        backdropBlocksInteraction={false}
      >
        <div className="">
          {/* Success Icon and Title */}

          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-12 h-12 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Great job! Delivery complete [DONE]
            </h1>
          </div>

          {/* Trip Details */}

          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-600" />

                  <span className="text-gray-600 text-sm">Trip distance</span>
                </div>

                <span className="text-gray-900 font-semibold">
                  {tripDistance !== null
                    ? tripDistance >= 1000
                      ? `${(tripDistance / 1000).toFixed(1)} kms`
                      : `${tripDistance.toFixed(0)} m`
                    : selectedRestaurant?.tripDistance ||
                      selectedRestaurant?.dropDistance ||
                      selectedRestaurant?.pickupDistance ||
                      selectedRestaurant?.distance ||
                      "Distance not available"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-600" />

                  <span className="text-gray-600 text-sm">Trip time</span>
                </div>

                <span className="text-gray-900 font-semibold">
                  {tripTime !== null
                    ? tripTime >= 60
                      ? `${Math.round(tripTime / 60)} mins`
                      : `${tripTime} secs`
                    : selectedRestaurant?.tripTime ||
                      selectedRestaurant?.timeAway ||
                      "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Payment info: Online = amount paid, COD = collect from customer */}

          {selectedRestaurant?.total != null &&
            (() => {
              const m = (selectedRestaurant.paymentMethod || "").toLowerCase();

              const isCod = m === "cash" || m === "cod";

              const total = Number(selectedRestaurant.total) || 0;

              return (
                <div
                  className={`rounded-xl p-4 mb-6 ${isCod ? "bg-amber-50 border border-amber-200" : "bg-emerald-50 border border-emerald-200"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IndianRupee
                        className={`w-4 h-4 ${isCod ? "text-amber-600" : "text-emerald-600"}`}
                      />

                      <span
                        className={`text-sm font-medium ${isCod ? "text-amber-800" : "text-emerald-800"}`}
                      >
                        {isCod
                          ? "Collect from customer (COD)"
                          : "Amount paid (Online)"}
                      </span>
                    </div>

                    <span
                      className={`text-lg font-bold ${isCod ? "text-amber-700" : "text-emerald-700"}`}
                    >
                      &#8377;
                      {total.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              );
            })()}

          {/* Order Delivered Button with Swipe */}

          <div className="relative w-full">
            <motion.div
              ref={orderDeliveredButtonRef}
              className="relative w-full bg-green-600 rounded-full overflow-hidden shadow-xl"
              style={{ touchAction: "none" }} // Capture touch fully for smooth swipe
              onTouchStart={handleOrderDeliveredTouchStart}
              onTouchMove={handleOrderDeliveredTouchMove}
              onTouchEnd={handleOrderDeliveredTouchEnd}
              whileTap={{ scale: 0.98 }}
            >
              {/* Swipe progress background */}

              <motion.div
                className="absolute inset-0 bg-green-500 rounded-full"
                animate={{
                  width: `${orderDeliveredButtonProgress * 100}%`,
                }}
                transition={
                  orderDeliveredIsAnimatingToComplete
                    ? {
                        type: "spring",

                        stiffness: 200,

                        damping: 25,
                      }
                    : { duration: 0 }
                }
              />

              {/* Button content container */}

              <div className="relative flex items-center h-[64px] px-1">
                {/* Left: Black circle with arrow */}

                <motion.div
                  className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center shrink-0 relative z-20 shadow-2xl"
                  animate={{
                    x:
                      orderDeliveredButtonProgress *
                      (orderDeliveredButtonRef.current
                        ? orderDeliveredButtonRef.current.offsetWidth - 56 - 32
                        : 240),
                  }}
                  transition={
                    orderDeliveredIsAnimatingToComplete
                      ? {
                          type: "spring",

                          stiffness: 300,

                          damping: 30,
                        }
                      : { duration: 0 }
                  }
                >
                  <ArrowRight className="w-5 h-5 text-white" />
                </motion.div>

                {/* Text - centered and stays visible */}

                <div className="absolute inset-0 flex items-center justify-center left-16 right-4 pointer-events-none">
                  <motion.span
                    className="text-white font-semibold flex items-center justify-center text-center text-base select-none"
                    animate={{
                      opacity:
                        orderDeliveredButtonProgress > 0.5
                          ? Math.max(
                              0.2,
                              1 - orderDeliveredButtonProgress * 0.8,
                            )
                          : 1,

                      x:
                        orderDeliveredButtonProgress > 0.5
                          ? orderDeliveredButtonProgress * 15
                          : 0,
                    }}
                    transition={
                      orderDeliveredIsAnimatingToComplete
                        ? {
                            type: "spring",

                            stiffness: 200,

                            damping: 25,
                          }
                        : { duration: 0 }
                    }
                  >
                    {orderDeliveredButtonProgress >
                    DELIVERY_SWIPE_CONFIRM_THRESHOLD
                      ? "Release to Confirm"
                      : "Order Delivered"}
                  </motion.span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </BottomPopup>

      {/* Customer Review Popup - shown after Order Delivered */}

      <BottomPopup
        isOpen={showCustomerReviewPopup}
        onClose={() => setShowCustomerReviewPopup(false)}
        showCloseButton={false}
        closeOnBackdropClick={false}
        maxHeight="80vh"
        showHandle={true}
      >
        <div className="">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Rate Your Experience
            </h2>

            <p className="text-gray-600 text-sm mb-6">
              How was your delivery experience?
            </p>

            {/* Star Rating */}

            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setCustomerRating(star)}
                  className="text-4xl transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-9 h-9 ${star <= customerRating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                  />
                </button>
              ))}
            </div>

            {/* Optional Review Text */}

            <div className="mb-6">
              <label className="block text-left text-sm font-medium text-gray-700 mb-2">
                Review (Optional)
              </label>

              <textarea
                value={customerReviewText}
                onChange={(e) => setCustomerReviewText(e.target.value)}
                placeholder="Share your experience..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                rows={4}
              />
            </div>

            {/* Submit Button */}

            <button
              onClick={async () => {
                if (isCompletingDelivery) {
                  return;
                }

                // Get order ID - use MongoDB _id for API call

                const orderIdForApi =
                  selectedRestaurant?.id ||
                  newOrder?.orderMongoId ||
                  newOrder?._id ||
                  selectedRestaurant?.orderId ||
                  newOrder?.orderId;

                // Save review by calling completeDelivery API with rating and review

                if (orderIdForApi) {
                  setIsCompletingDelivery(true);

                  try {
                    console.log(
                      "[REVIEW] Submitting review and completing delivery:",
                      {
                        orderId: orderIdForApi,

                        rating: customerRating,

                        review: customerReviewText,
                      },
                    );

                    // Call completeDelivery API with rating and review

                    const response = await deliveryAPI.completeDelivery(
                      orderIdForApi,

                      customerRating > 0 ? customerRating : null,

                      customerReviewText.trim() || "",
                    );

                    if (response.data?.success) {
                      // Get updated earnings from response

                      // Note: completeDelivery API already adds earnings and COD cash collected to wallet

                      const earnings =
                        response.data.data?.earnings?.amount ||
                        response.data.data?.totalEarning ||
                        orderEarnings;

                      setOrderEarnings(earnings);

                      console.log(
                        "[OK] Delivery completed and earnings added to wallet:",
                        earnings,
                      );

                      console.log(
                        "[OK] Wallet transaction:",
                        response.data.data?.walletTransaction,
                      );

                      // Notify wallet listeners (Pocket balance, Pocket page) so cash collected updates

                      window.dispatchEvent(
                        new Event("deliveryWalletStateUpdated"),
                      );

                      // Show success message

                      if (earnings > 0) {
                        toast.success(
                          `Rs ${earnings.toFixed(2)} added to your wallet!`,
                        );
                      }

                      // Close review popup and show payment page

                      setShowCustomerReviewPopup(false);

                      setShowPaymentPage(true);
                    } else {
                      console.error(
                        "[ERROR] Failed to submit review:",
                        response.data,
                      );

                      toast.error(
                        response.data?.message ||
                          "Failed to submit review. Please try again.",
                      );
                    }
                  } catch (error) {
                    console.error("[ERROR] Error submitting review:", error);

                    if (isCancelledConflictError(error)) {
                      handleCancelledOrderConflict(
                        error,
                        "Order was cancelled before delivery completion.",
                      );

                      return;
                    }

                    toast.error("Failed to submit review. Please try again.");

                    // Still show payment page even if review fails

                    setShowCustomerReviewPopup(false);

                    setShowPaymentPage(true);
                  } finally {
                    setIsCompletingDelivery(false);
                  }
                } else {
                  // If no order ID, just show payment page

                  setShowCustomerReviewPopup(false);

                  setShowPaymentPage(true);
                  setIsCompletingDelivery(false);
                }
              }}
              disabled={isCompletingDelivery}
              className="w-full bg-green-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-green-700 transition-colors shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isCompletingDelivery ? "Submitting..." : "Submit Review"}
            </button>
          </div>
        </div>
      </BottomPopup>

      {/* Payment Page - shown after Customer Review is submitted */}

      <AnimatePresence>
        {showPaymentPage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[200] bg-white overflow-y-auto"
          >
            {/* Header */}

            <div className="bg-green-500 text-white px-6 py-6">
              <h1 className="text-2xl font-bold mb-2">Payment</h1>

              <p className="text-white/90 text-sm">
                Order ID: {selectedRestaurant?.orderId || "ORD1234567890"}
              </p>
            </div>

            {/* Payment Amount */}

            <div className="px-6 py-8 text-center bg-gray-50">
              <p className="text-gray-600 text-sm mb-2">
                Earnings from this order
              </p>

              <p className="text-5xl font-bold text-gray-900">
                &#8377;
                {(() => {
                  if (orderEarnings > 0) {
                    return orderEarnings.toFixed(2);
                  }

                  // Handle estimatedEarnings - can be number or object

                  const earnings =
                    selectedRestaurant?.amount ||
                    selectedRestaurant?.estimatedEarnings ||
                    0;

                  if (typeof earnings === "object" && earnings.totalEarning) {
                    return earnings.totalEarning.toFixed(2);
                  }

                  return typeof earnings === "number"
                    ? earnings.toFixed(2)
                    : "0.00";
                })()}
              </p>

              <p className="text-green-600 text-sm mt-2">
                [MONEY] Added to your wallet
              </p>
            </div>

            {/* Payment Details */}

            <div className="px-6 py-6 pb-6 h-full flex flex-col justify-between">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  Payment Details
                </h3>

                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Trip pay</span>

                    <span className="text-gray-900 font-semibold">
                      &#8377;
                      {(() => {
                        let earnings = 0;

                        if (orderEarnings > 0) {
                          earnings = orderEarnings;
                        } else {
                          const estEarnings =
                            selectedRestaurant?.amount ||
                            selectedRestaurant?.estimatedEarnings ||
                            0;

                          if (
                            typeof estEarnings === "object" &&
                            estEarnings.totalEarning
                          ) {
                            earnings = estEarnings.totalEarning;
                          } else if (typeof estEarnings === "number") {
                            earnings = estEarnings;
                          }
                        }

                        return (earnings - 5).toFixed(2);
                      })()}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">
                      Long distance return pay
                    </span>

                    <span className="text-gray-900 font-semibold">
                      &#8377;5.00
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-2">
                    <span className="text-lg font-bold text-gray-900">
                      Total Earnings
                    </span>

                    <span className="text-lg font-bold text-gray-900">
                      &#8377;
                      {(() => {
                        if (orderEarnings > 0) {
                          return orderEarnings.toFixed(2);
                        }

                        // Handle estimatedEarnings - can be number or object

                        const earnings =
                          selectedRestaurant?.amount ||
                          selectedRestaurant?.estimatedEarnings ||
                          0;

                        if (
                          typeof earnings === "object" &&
                          earnings.totalEarning
                        ) {
                          return earnings.totalEarning.toFixed(2);
                        }

                        return typeof earnings === "number"
                          ? earnings.toFixed(2)
                          : "0.00";
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Complete Button */}

              <button
                onClick={() => {
                  setShowPaymentPage(false);

                  // CRITICAL: Clear all order-related popups and states when completing

                  setShowreachedPickupPopup(false);

                  setShowOrderIdConfirmationPopup(false);

                  setShowReachedDropPopup(false);

                  setShowOrderDeliveredAnimation(false);

                  setShowCustomerReviewPopup(false);

                  // Clear selected restaurant/order to prevent showing popups for delivered order

                  setSelectedRestaurant(null);
                  selectedRestaurantRef.current = null;

                  // CRITICAL: Clear active order from localStorage to prevent it from showing again

                  localStorage.removeItem("deliveryActiveOrder");

                  localStorage.removeItem("activeOrder");

                  // Clear newOrder from notifications hook (if available)

                  if (
                    showNewOrderPopup &&
                    typeof clearNewOrder === "function"
                  ) {
                    clearNewOrder();
                  }

                  // Clear accepted orders list when order is completed

                  acceptedOrderIdsRef.current.clear();

                  const nextAcceptedAdvanceOrder =
                    acceptedAdvanceOrders[0] || null;
                  if (nextAcceptedAdvanceOrder) {
                    activateAcceptedAdvanceOrder(nextAcceptedAdvanceOrder);
                    toast.success("Next accepted advance order is now live.");
                    return;
                  }

                  navigate("/delivery");

                  // Reset states

                  setTimeout(() => {
                    setReachedDropButtonProgress(0);

                    setReachedDropIsAnimatingToComplete(false);

                    setCustomerRating(0);

                    setCustomerReviewText("");
                  }, 500);
                }}
                className="w-full sticky bottom-4 bg-black text-white py-4 rounded-xl font-semibold text-lg hover:bg-gray-800 transition-colors shadow-lg "
              >
                Complete
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
