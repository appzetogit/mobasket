import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Search,
  ArrowLeft,
  Mic,
  ChevronDown,
  ArrowRight,
  Bike,
  PackageCheck,
  Timer,
  User,
  ShoppingBag,
  ShoppingCart,
  Zap,
  Heart,
  Home,
  LayoutGrid,
  Printer,
  Monitor,
  Minus,
  Plus,
  X,
  Snowflake,
  Store,
} from "lucide-react";
import { useNavigate, useLocation as useRouterLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useCart } from "../../user/context/CartContext";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";
import { useLocationSelector } from "../../user/components/UserLayout";
import { useProfile } from "../../user/context/ProfileContext";
import { CategoryFoodsContent } from "./CategoryFoodsPage";
import AddToCartAnimation from "../../user/components/AddToCartAnimation";
import api, { restaurantAPI, userAPI, zoneAPI } from "@/lib/api";
import { evaluateStoreAvailability } from "@/lib/utils/storeAvailability";

// Icons
import imgBag3D from "@/assets/icons/shopping-bag_18008822.png";

const INITIAL_GROCERY_BESTSELLER_COUNT = 6;
const INITIAL_GROCERY_LAYOUT_PRODUCT_COUNT = 8;
const INITIAL_GROCERY_SEARCH_PRODUCT_COUNT = 8;
const INITIAL_GROCERY_CATEGORY_SECTION_COUNT = 1;
const INITIAL_GROCERY_BESTSELLER_SECTION_COUNT = 2;
const GROCERY_PRODUCTS_PAGE_SIZE = 24;
const STATIC_GROCERY_CACHE_TTL_MS = 10 * 60 * 1000;
const ZONE_GROCERY_CACHE_TTL_MS = 2 * 60 * 1000;
const GROCERY_PERSISTED_CACHE_PREFIX = "mogrocery:cache";
const groceryBannerCache = new Map();
const groceryCategoryCache = new Map();
const groceryBestSellerCache = new Map();
const groceryProductsPageCache = new Map();
const groceryStoreCache = new Map();

const normalizeAddressText = (value) =>
  String(value || "")
    .trim()
    .replace(/,\s*india\s*$/i, "")
    .trim();

const isCoarseLocationText = (value) => {
  const text = normalizeAddressText(value);
  if (!text) return true;

  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 2) return true;

  const hasDistrict = /\bdistrict\b/i.test(text);
  const hasPinCode = /\b\d{6}\b/.test(text);
  if (hasDistrict && !hasPinCode) return true;

  return false;
};

const normalizeVariantKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

const getGroceryCartItemId = (product) => {
  const productId = String(product?._id || product?.id || "").trim();
  if (!productId) return "";

  const variantLabel = String(
    product?.unit ||
    product?.weight ||
    product?.variantName ||
    product?.selectedVariant?.name ||
    "",
  ).trim();
  const variantKey = normalizeVariantKey(variantLabel);
  return variantKey ? `${productId}::${variantKey}` : productId;
};

const isProductOutOfStock = (product) => {
  if (!product || typeof product !== "object") return false;
  if (product.inStock === false) return true;
  if (product.isActive === false) return true;
  const parsedStock = Number(product.stockQuantity);
  return Number.isFinite(parsedStock) && parsedStock <= 0;
};

const formatSavedAddressForHeader = (address) => {
  if (!address || typeof address !== "object") return "";

  const detailedParts = [
    address?.additionalDetails,
    address?.addressLine1,
    address?.street,
    address?.area || address?.location?.area,
    address?.city || address?.location?.city,
    address?.state || address?.location?.state,
    address?.zipCode || address?.postalCode || address?.pincode,
  ]
    .map((part) => normalizeAddressText(part))
    .filter(Boolean);

  if (detailedParts.length >= 3) {
    return detailedParts.join(", ");
  }

  const formattedAddress = normalizeAddressText(
    address?.formattedAddress ||
    address?.address ||
    ""
  );
  if (formattedAddress && !isCoarseLocationText(formattedAddress)) return formattedAddress;

  if (detailedParts.length) {
    return detailedParts.join(", ");
  }

  return formattedAddress;
};

const formatDynamicLocationForHeader = (locationLike) => {
  if (!locationLike || typeof locationLike !== "object") return "";

  const formatted = normalizeAddressText(
    locationLike?.formattedAddress || locationLike?.address || ""
  );
  if (formatted && !isCoarseLocationText(formatted)) return formatted;

  const fallbackParts = [
    locationLike?.address,
    locationLike?.street,
    locationLike?.area || locationLike?.location?.area,
    locationLike?.city || locationLike?.location?.city,
    locationLike?.state || locationLike?.location?.state,
    locationLike?.zipCode || locationLike?.postalCode || locationLike?.pincode,
  ]
    .map((part) => normalizeAddressText(part))
    .filter(Boolean);

  return fallbackParts.join(", ");
};

const parseStoredAddresses = () => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem("userAddresses") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mergeUniqueProducts = (existingProducts, incomingProducts) => {
  const mergedMap = new Map();
  (Array.isArray(existingProducts) ? existingProducts : []).forEach((product) => {
    const key = String(product?._id || product?.id || "").trim();
    if (!key) return;
    mergedMap.set(key, product);
  });
  (Array.isArray(incomingProducts) ? incomingProducts : []).forEach((product) => {
    const key = String(product?._id || product?.id || "").trim();
    if (!key) return;
    mergedMap.set(key, product);
  });
  return Array.from(mergedMap.values());
};

const getPersistentCacheKey = (cacheName, key) =>
  `${GROCERY_PERSISTED_CACHE_PREFIX}:${String(cacheName || "default")}:${String(key || "")}`;

const getFreshCacheEntry = (cache, cacheName, key, ttlMs) => {
  const cached = cache.get(key);
  if (cached && Date.now() - Number(cached.ts || 0) <= ttlMs) {
    return cached.data;
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(getPersistentCacheKey(cacheName, key));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (Date.now() - Number(parsed?.ts || 0) > ttlMs) {
      localStorage.removeItem(getPersistentCacheKey(cacheName, key));
      return null;
    }

    cache.set(key, {
      data: parsed?.data,
      ts: Number(parsed?.ts || Date.now()),
    });
    return parsed?.data ?? null;
  } catch {
    return null;
  }
};

const setCacheEntry = (cache, cacheName, key, data) => {
  const payload = {
    data,
    ts: Date.now(),
  };

  cache.set(key, payload);

  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(getPersistentCacheKey(cacheName, key), JSON.stringify(payload));
  } catch {
    // Ignore storage quota/private mode failures and keep in-memory cache.
  }
};

const GroceryPage = () => {
  const FALLBACK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  const navigate = useNavigate();
  const routerLocation = useRouterLocation();
  const { getGroceryCartCount, addToCart, getCartItem, isInCart, updateQuantity } = useCart();
  const { addresses, getDefaultAddress } = useProfile();
  const { location: userLocation, loading: locationLoading } = useUserLocation();
  const { openLocationSelector } = useLocationSelector();
  const [storedUserLocation, setStoredUserLocation] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const parsed = JSON.parse(localStorage.getItem("userLocation") || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  });
  const [userLocationSource, setUserLocationSource] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return String(localStorage.getItem("userLocationSource") || "").trim().toLowerCase();
    } catch {
      return "";
    }
  });
  const effectiveZoneLocation =
    storedUserLocation && typeof storedUserLocation === "object"
      ? storedUserLocation
      : userLocation;
  const [locationRefreshTick, setLocationRefreshTick] = useState(0);
  const { zoneId, refreshZone, loading: zoneLoading } = useZone(effectiveZoneLocation, "mogrocery");
  const [availableZones, setAvailableZones] = useState([]);
  const [selectedGroceryZoneId, setSelectedGroceryZoneId] = useState("auto");
  const [isZoneMenuOpen, setIsZoneMenuOpen] = useState(false);
  const zoneMenuRef = useRef(null);
  const cachedZoneId =
    typeof window !== "undefined" ? localStorage.getItem("userZoneId:mogrocery") : "";
  const effectiveZoneId = String(
    selectedGroceryZoneId && selectedGroceryZoneId !== "auto"
      ? selectedGroceryZoneId
      : zoneId || cachedZoneId || "",
  ).trim();
  const isGroceryCategoriesRoute = routerLocation.pathname === "/grocery/categories";
  const hasUserSession = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(
      localStorage.getItem("user_accessToken") || localStorage.getItem("user_refreshToken"),
    );
  }, []);
  const itemCount = getGroceryCartCount();
  const [activeTab, setActiveTab] = useState("All");
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [activeSubcategoryId, setActiveSubcategoryId] = useState("all-subcategories");
  const [selectedStoreId, setSelectedStoreId] = useState(() => {
    if (typeof window === "undefined") return "all-stores";
    const cachedStoreId = String(localStorage.getItem("mogrocery:selectedStoreId") || "").trim();
    return cachedStoreId || "all-stores";
  });

  const [isScrolled, setIsScrolled] = useState(false);
  const [currentBanner, setCurrentBanner] = useState(0);
  const [bannerImages, setBannerImages] = useState([]);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [showCollectionSheet, setShowCollectionSheet] = useState(false);
  const [collectionCategoryId, setCollectionCategoryId] = useState("");
  const [collectionTitle, setCollectionTitle] = useState("Products");
  const [showWishlistSheet, setShowWishlistSheet] = useState(false);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [isBannersLoading, setIsBannersLoading] = useState(true);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const [isBestSellersLoading, setIsBestSellersLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  const [isStoresLoading, setIsStoresLoading] = useState(true);
  const [vegMode, setVegMode] = useState(false);
  const [showSnow, setShowSnow] = useState(false);
  const [bestSellerVisibleCount, setBestSellerVisibleCount] = useState(INITIAL_GROCERY_BESTSELLER_COUNT);
  const [layoutProductVisibleCount, setLayoutProductVisibleCount] = useState(INITIAL_GROCERY_LAYOUT_PRODUCT_COUNT);
  const [searchProductVisibleCount, setSearchProductVisibleCount] = useState(INITIAL_GROCERY_SEARCH_PRODUCT_COUNT);
  const [homepageCategoryVisibleCount, setHomepageCategoryVisibleCount] = useState(INITIAL_GROCERY_CATEGORY_SECTION_COUNT);
  const [hasScrolledForCategoryLazyLoad, setHasScrolledForCategoryLazyLoad] = useState(false);
  const [bestSellerSectionVisibleCount, setBestSellerSectionVisibleCount] = useState(INITIAL_GROCERY_BESTSELLER_SECTION_COUNT);
  const [homepageCategories, setHomepageCategories] = useState([]);
  const [bestSellerItems, setBestSellerItems] = useState([]);
  const [bestSellerSections, setBestSellerSections] = useState([]);
  const [rawProducts, setRawProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [productsPage, setProductsPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);
  const [groceryStores, setGroceryStores] = useState([]);
  const [hasActiveGroceryStore, setHasActiveGroceryStore] = useState(true);
  const [activeGroceryOrder, setActiveGroceryOrder] = useState(null);
  const [dismissedOrderTrackerFor, setDismissedOrderTrackerFor] = useState("");
  const orderSnapshotRef = useRef(new Map());
  const hasSeededOrderSnapshotRef = useRef(false);
  const zoneRecoveryAttemptedRef = useRef(false);
  const productLoadInFlightRef = useRef(false);
  const productPageLoadMoreRef = useRef(null);
  const bestSellerLoadMoreRef = useRef(null);
  const layoutProductsLoadMoreRef = useRef(null);
  const searchProductsLoadMoreRef = useRef(null);
  const homepageCategoryLoadMoreRef = useRef(null);
  const bestSellerSectionsLoadMoreRef = useRef(null);
  const bannerRequestIdRef = useRef(0);
  const categoryRequestIdRef = useRef(0);
  const bestSellerRequestIdRef = useRef(0);
  const productRequestIdRef = useRef(0);
  const storeRequestIdRef = useRef(0);
  const isAnySheetOpen = showCategorySheet || showCollectionSheet || showWishlistSheet;
  const collectionHandleStartYRef = useRef(null);
  const wishlistHandleStartYRef = useRef(null);

  const selectedZoneLabel = useMemo(() => {
    if (selectedGroceryZoneId === "auto") return "Auto";
    const selectedZone = availableZones.find((zone) => zone.id === selectedGroceryZoneId);
    return selectedZone?.name || "Auto";
  }, [availableZones, selectedGroceryZoneId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!zoneMenuRef.current?.contains(event.target)) {
        setIsZoneMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchActiveZones = async () => {
      try {
        const response = await zoneAPI.getActiveZones("mogrocery");
        const zoneList = response?.data?.data?.zones || response?.data?.zones || response?.data?.data || [];
        const normalizedZones = (Array.isArray(zoneList) ? zoneList : [])
          .map((zone) => ({
            id: String(zone?._id || zone?.id || "").trim(),
            name: String(zone?.name || zone?.zoneName || zone?.serviceLocation || "Unnamed Zone").trim(),
          }))
          .filter((zone) => zone.id && zone.name);
        setAvailableZones(normalizedZones);
      } catch {
        setAvailableZones([]);
      }
    };
    fetchActiveZones();
  }, []);

  useEffect(() => {
    if (!selectedGroceryZoneId || selectedGroceryZoneId === "auto") return;
    const exists = availableZones.some((zone) => zone.id === selectedGroceryZoneId);
    if (!exists) {
      setSelectedGroceryZoneId("auto");
    }
  }, [availableZones, selectedGroceryZoneId]);

  useEffect(() => {
    if (!isAnySheetOpen) return undefined;

    const body = document.body;
    const html = document.documentElement;
    const previousBodyCssText = body.style.cssText;
    const previousHtmlCssText = html.style.cssText;

    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.height = "100%";

    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    html.style.height = "100%";

    return () => {
      body.style.cssText = previousBodyCssText;
      html.style.cssText = previousHtmlCssText;
    };
  }, [isAnySheetOpen]);

  useEffect(() => {
    const syncLocationFromStorage = (event) => {
      let nextLocationSource = "";
      try {
        const nextLocation =
          event?.detail && typeof event.detail === "object"
            ? event.detail
            : JSON.parse(localStorage.getItem("userLocation") || "null");
        setStoredUserLocation(nextLocation && typeof nextLocation === "object" ? nextLocation : null);
      } catch {
        setStoredUserLocation(null);
      }

      try {
        nextLocationSource = String(localStorage.getItem("userLocationSource") || "").trim().toLowerCase();
        setUserLocationSource(nextLocationSource);
      } catch {
        nextLocationSource = "";
        setUserLocationSource("");
      }

      const shouldResetToAutoZone =
        selectedGroceryZoneId !== "auto" &&
        (nextLocationSource === "saved" || nextLocationSource === "current");

      if (shouldResetToAutoZone) {
        setSelectedGroceryZoneId("auto");
        setSelectedStoreId("all-stores");
      }

      // Trigger zone re-detection immediately when location is changed from selector.
      // This avoids requiring a manual page refresh for updated store availability.
      if ((selectedGroceryZoneId === "auto" || shouldResetToAutoZone) && typeof refreshZone === "function") {
        setTimeout(() => {
          refreshZone();
        }, 0);
      }

      // Force dependent data to refresh even if computed zoneId does not change.
      setLocationRefreshTick((prev) => prev + 1);
    };

    const handleStorageSync = (event) => {
      if (!event?.key || event.key === "userLocation" || event.key === "userLocationSource") {
        syncLocationFromStorage();
      }
    };

    window.addEventListener("userLocationChanged", syncLocationFromStorage);
    window.addEventListener("userAddressesChanged", syncLocationFromStorage);
    window.addEventListener("storage", handleStorageSync);

    return () => {
      window.removeEventListener("userLocationChanged", syncLocationFromStorage);
      window.removeEventListener("userAddressesChanged", syncLocationFromStorage);
      window.removeEventListener("storage", handleStorageSync);
    };
  }, [refreshZone, selectedGroceryZoneId]);

  useEffect(() => {
    if (selectedGroceryZoneId !== "auto") return;
    if (typeof refreshZone !== "function") return;

    const lat = Number(storedUserLocation?.latitude);
    const lng = Number(storedUserLocation?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    refreshZone();
  }, [
    refreshZone,
    selectedGroceryZoneId,
    storedUserLocation?.latitude,
    storedUserLocation?.longitude,
  ]);

  const getStoreCoordinates = (store) => {
    const geoCoordinates = store?.location?.coordinates;
    if (
      Array.isArray(geoCoordinates) &&
      geoCoordinates.length >= 2 &&
      Number.isFinite(Number(geoCoordinates[0])) &&
      Number.isFinite(Number(geoCoordinates[1]))
    ) {
      return { lng: Number(geoCoordinates[0]), lat: Number(geoCoordinates[1]) };
    }

    const lat = Number(store?.location?.latitude);
    const lng = Number(store?.location?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }

    return null;
  };

  const getNormalizedStoreId = (storeLike) =>
    String(
      storeLike?._id ||
      storeLike?.id ||
      storeLike?.restaurantId ||
      storeLike?.storeId?._id ||
      storeLike?.storeId?.id ||
      storeLike?.storeId ||
      ""
    ).trim();

  const getStoreIdCandidates = (storeLike) => {
    const rawCandidates = [
      storeLike?._id,
      storeLike?.id,
      storeLike?.restaurantId,
      storeLike?.storeId?._id,
      storeLike?.storeId?.id,
      storeLike?.storeId,
      storeLike?.storeId?.restaurantId,
      storeLike?.restaurant?._id,
      storeLike?.restaurant?.id,
      storeLike?.restaurant?.restaurantId,
      storeLike?.restaurantId?._id,
      storeLike?.restaurantId?.id,
      storeLike?.restaurantId?.restaurantId,
    ];

    return Array.from(
      new Set(
        rawCandidates
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
  };

  const resolveStoreObjectFromProduct = (product) => {
    const populatedStore =
      product?.storeId && typeof product.storeId === "object" ? product.storeId : null;
    if (populatedStore?._id || populatedStore?.id) {
      return populatedStore;
    }

    const storeId = String(product?.storeId || "").trim();
    if (!storeId) return null;

    return (
      groceryStores.find((store) => String(store?._id || store?.restaurantId || "") === storeId) ||
      null
    );
  };

  const getStoreAddress = (store) => {
    if (!store) return "";
    if (typeof store?.address === "string" && store.address.trim()) return store.address.trim();

    const location = store?.location || {};
    if (typeof location?.formattedAddress === "string" && location.formattedAddress.trim()) {
      return location.formattedAddress.trim();
    }
    if (typeof location?.address === "string" && location.address.trim()) {
      return location.address.trim();
    }

    const parts = [
      location?.addressLine1,
      location?.addressLine2,
      location?.area,
      location?.city,
      location?.state,
      location?.zipCode || location?.postalCode || location?.pincode,
    ]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean);

    return parts.join(", ");
  };

  const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
    const earthRadiusKm = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  };

  const buildOrderSnapshot = (orders = []) => {
    const snapshot = new Map();
    orders.forEach((order) => {
      const key = String(order?._id || order?.orderId || "");
      if (!key) return;
      const status = String(order?.status || "").toLowerCase();
      const approvalStatus = String(order?.adminApproval?.status || "").toLowerCase();
      const deliveryStatus = String(order?.deliveryState?.status || "").toLowerCase();
      snapshot.set(key, `${status}|${approvalStatus}|${deliveryStatus}`);
    });
    return snapshot;
  };

  const getOrderUpdateMessage = (order) => {
    const orderNo = order?.orderId || order?._id || "your order";
    const status = String(order?.status || "").toLowerCase();
    const approvalStatus = String(order?.adminApproval?.status || "").toLowerCase();

    if (approvalStatus === "pending") return `Order #${orderNo} is awaiting admin approval`;
    if (approvalStatus === "approved" && status === "preparing") return `Order #${orderNo} approved and now processing`;
    if (approvalStatus === "rejected" || status === "cancelled") return `Order #${orderNo} was cancelled`;
    if (status === "confirmed") return `Order #${orderNo} confirmed`;
    if (status === "preparing") return `Order #${orderNo} is being prepared`;
    if (status === "ready") return `Order #${orderNo} is ready for pickup`;
    if (status === "out_for_delivery") return `Order #${orderNo} is out for delivery`;
    if (status === "delivered") return `Order #${orderNo} delivered`;
    return `Order #${orderNo} status updated`;
  };

  const isGroceryOrder = (order) => {
    const platform = String(
      order?.restaurantId?.platform || order?.restaurantPlatform || order?.platform || ""
    ).toLowerCase();
    if (platform === "mogrocery") return true;

    const note = String(order?.note || "").toLowerCase();
    if (note.includes("[mogrocery]")) return true;

    const restaurantName = String(order?.restaurantName || order?.restaurantId?.name || "").toLowerCase();
    if (restaurantName.includes("grocery") || restaurantName.includes("mart") || restaurantName.includes("basket")) {
      return true;
    }

    return false;
  };

  const isMoGroceryPlanOrder = (order) => {
    if (!order) return false;

    if (order?.planSubscription?.planId || order?.planSubscription?.planName) {
      return true;
    }

    const note = String(order?.note || "").toLowerCase();
    if (note.includes("[mogold plan]") || note.includes("plan subscription")) return true;

    const approvalReason = String(order?.adminApproval?.reason || "").toLowerCase();
    if (approvalReason.includes("plan subscription") || approvalReason.includes("mogold")) return true;

    const metadataBlob = [
      order?.metadata?.planId,
      order?.metadata?.planName,
      order?.payment?.notes?.planId,
      order?.payment?.notes?.planName,
      order?.source,
      order?.orderType,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    if (
      metadataBlob.includes("mogold") ||
      metadataBlob.includes("plan subscription") ||
      metadataBlob.includes("membership plan")
    ) {
      return true;
    }

    const items = Array.isArray(order?.items) ? order.items : [];
    return items.some((item) => {
      const type = String(item?.itemType || "").toLowerCase();
      const itemId = String(item?.itemId || item?._id || "").toLowerCase();
      const name = String(item?.name || "").toLowerCase();
      const description = String(item?.description || "").toLowerCase();
      return (
        type === "plan" ||
        itemId.startsWith("plan-") ||
        name.includes("mogold") ||
        name.includes("plan") ||
        description.includes("mogold") ||
        description.includes("plan subscription")
      );
    });
  };

  const findActiveTrackableOrder = (orders = []) => {
    const activeStatuses = new Set(["pending", "confirmed", "preparing", "ready", "out_for_delivery", "scheduled"]);
    const terminalStatuses = new Set(["delivered", "completed", "cancelled", "canceled"]);
    const isTerminalOrder = (order) => {
      const status = String(order?.status || "").toLowerCase();
      const deliveryStateStatus = String(order?.deliveryState?.status || "").toLowerCase();
      const deliveryPhase = String(order?.deliveryState?.currentPhase || "").toLowerCase();
      const hasDeliveredTimestamp = Boolean(order?.deliveredAt || order?.deliveryState?.deliveredAt);
      const trackingDelivered = Boolean(order?.tracking?.delivered?.status);

      return (
        terminalStatuses.has(status) ||
        terminalStatuses.has(deliveryStateStatus) ||
        deliveryPhase === "completed" ||
        hasDeliveredTimestamp ||
        trackingDelivered
      );
    };

    const candidates = orders
      .filter((order) => {
        const status = String(order?.status || "").toLowerCase();
        if (isTerminalOrder(order)) return false;
        if (!activeStatuses.has(status)) return false;

        const orderKey = String(order?._id || order?.orderId || "").trim();
        if (!orderKey) return false;

        const approvalStatus = String(order?.adminApproval?.status || "").toLowerCase();
        if (approvalStatus === "rejected") return false;
        if (approvalStatus === "approved" && terminalStatuses.has(status)) return false;

        const hasItems = Array.isArray(order?.items) && order.items.length > 0;
        const hasAmount = Number(order?.totalAmount || order?.grandTotal || 0) > 0;
        if (!hasItems && !hasAmount) return false;

        return true;
      })
      .sort((a, b) => {
        const aTs = new Date(a?.updatedAt || a?.createdAt || 0).getTime() || 0;
        const bTs = new Date(b?.updatedAt || b?.createdAt || 0).getTime() || 0;
        return bTs - aTs;
      });

    return candidates[0] || null;
  };

  const getOrderTrackerMeta = (order) => {
    const status = String(order?.status || "pending").toLowerCase();
    const approvalStatus = String(order?.adminApproval?.status || "").toLowerCase();

    if (approvalStatus === "pending") {
      return {
        label: "Awaiting admin approval",
        subtitle: "We are reviewing your grocery order",
        progress: 18,
        chipClass: "bg-amber-100 text-amber-800 border-amber-200",
        barClass: "from-amber-400 to-yellow-500",
      };
    }

    if (status === "confirmed") {
      return {
        label: "Order confirmed",
        subtitle: "Store accepted your order",
        progress: 32,
        chipClass: "bg-sky-100 text-sky-800 border-sky-200",
        barClass: "from-sky-400 to-cyan-500",
      };
    }

    if (status === "preparing") {
      return {
        label: "Preparing your order",
        subtitle: "Items are being packed right now",
        progress: 55,
        chipClass: "bg-orange-100 text-orange-800 border-orange-200",
        barClass: "from-orange-400 to-amber-500",
      };
    }

    if (status === "ready") {
      return {
        label: "Ready for pickup",
        subtitle: "Rider will pick up your order soon",
        progress: 72,
        chipClass: "bg-indigo-100 text-indigo-800 border-indigo-200",
        barClass: "from-indigo-400 to-violet-500",
      };
    }

    if (status === "out_for_delivery") {
      return {
        label: "Out for delivery",
        subtitle: "Your order is on the way",
        progress: 88,
        chipClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
        barClass: "from-emerald-400 to-green-500",
      };
    }

    if (status === "scheduled") {
      return {
        label: "Scheduled order",
        subtitle: "We will dispatch at your selected slot",
        progress: 24,
        chipClass: "bg-purple-100 text-purple-800 border-purple-200",
        barClass: "from-purple-400 to-fuchsia-500",
      };
    }

    return {
      label: "Order placed",
      subtitle: "We are assigning your order now",
      progress: 14,
      chipClass: "bg-slate-100 text-slate-800 border-slate-200",
      barClass: "from-slate-400 to-slate-500",
    };
  };

  const activeOrderMeta = useMemo(
    () => (activeGroceryOrder ? getOrderTrackerMeta(activeGroceryOrder) : null),
    [activeGroceryOrder]
  );
  const activeOrderTrackerKey = String(activeGroceryOrder?.orderId || activeGroceryOrder?._id || "").trim();
  const activeOrderStatus = String(activeGroceryOrder?.status || "").toLowerCase();
  const activeOrderDeliveryStateStatus = String(activeGroceryOrder?.deliveryState?.status || "").toLowerCase();
  const activeOrderDeliveryPhase = String(activeGroceryOrder?.deliveryState?.currentPhase || "").toLowerCase();
  const isTerminalActiveOrder =
    ["delivered", "completed", "cancelled", "canceled"].includes(activeOrderStatus) ||
    ["delivered", "completed", "cancelled", "canceled"].includes(activeOrderDeliveryStateStatus) ||
    activeOrderDeliveryPhase === "completed" ||
    Boolean(activeGroceryOrder?.deliveredAt || activeGroceryOrder?.deliveryState?.deliveredAt) ||
    Boolean(activeGroceryOrder?.tracking?.delivered?.status);
  const isOrderTrackerVisible =
    Boolean(
      activeOrderTrackerKey &&
      activeGroceryOrder &&
      activeOrderMeta &&
      !isTerminalActiveOrder &&
      !isMoGroceryPlanOrder(activeGroceryOrder)
    ) &&
    dismissedOrderTrackerFor !== activeOrderTrackerKey;

  // Snow effect timer
  useEffect(() => {
    if (activeTab === "Valentine's" || activeTab === "Beauty" || activeTab === "Pharmacy" || activeTab === "Electronics") {
      setShowSnow(true);
      const timer = setTimeout(() => setShowSnow(false), 10000); // 20 seconds
      return () => clearTimeout(timer);
    } else {
      setShowSnow(false);
    }
  }, [activeTab]);

  // Search & Voice Logic
  const [searchQuery, setSearchQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const speechRecognitionRef = useRef(null);
  const hasActiveSearch = searchQuery.trim().length > 0;

  const startListening = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!speechRecognitionRef.current) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-IN'; // Better for Indian context

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);

        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          setSearchQuery(transcript);
        };

        speechRecognitionRef.current = recognition;
      }

      if (isListening) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
        setIsListening(false);
        return;
      }

      try {
        speechRecognitionRef.current.start();
      } catch (error) {
        if (error.name === 'InvalidStateError' || (error.message && error.message.includes('already started'))) {
          setIsListening(true);
        } else {
          setIsListening(false);
          alert(error?.message || "Unable to start voice search. Please try again.");
        }
      }
    } else {
      alert("Voice search is not supported in this browser.");
    }
  };

  const openCategorySheet = (categoryId = "all") => {
    const normalizedCategoryId =
      typeof categoryId === "object" && categoryId !== null ? "all" : String(categoryId || "all");
    const selectedStoreState =
      selectedStoreId && selectedStoreId !== "all-stores"
        ? { storeId: String(selectedStoreId) }
        : {};
    const storeSearch =
      selectedStoreId && selectedStoreId !== "all-stores"
        ? `?storeId=${encodeURIComponent(String(selectedStoreId))}`
        : "";
    navigate(`/grocery/categories${storeSearch}`, {
      state: {
        categoryId: normalizedCategoryId,
        ...selectedStoreState,
      },
    });
  };

  // Load dynamic grocery banners
  useEffect(() => {
    const fetchGroceryBanners = async () => {
      const requestId = ++bannerRequestIdRef.current;
      const cacheKey = `banners::${String(effectiveZoneId || "all")}`;
      const cached = getFreshCacheEntry(groceryBannerCache, "banners", cacheKey, ZONE_GROCERY_CACHE_TTL_MS);
      if (cached) {
        setBannerImages(Array.isArray(cached) ? cached : []);
        setCurrentBanner(0);
        setIsBannersLoading(false);
      } else {
        setIsBannersLoading(true);
      }

      try {
        const response = await api.get("/hero-banners/public", {
          params: {
            platform: "mogrocery",
            ...(effectiveZoneId ? { zoneId: effectiveZoneId } : {}),
          },
        });

        const banners = Array.isArray(response?.data?.data?.banners)
          ? response.data.data.banners
          : [];

        const dynamicImages = banners
          .map((item) => item?.imageUrl)
          .filter((url) => typeof url === "string" && url.trim() !== "");

        if (requestId !== bannerRequestIdRef.current) return;

        if (dynamicImages.length > 0) {
          setCacheEntry(groceryBannerCache, "banners", cacheKey, dynamicImages);
          setBannerImages(dynamicImages);
          setCurrentBanner(0);
        } else if (!cached) {
          setBannerImages([]);
        }
      } catch {
        if (requestId !== bannerRequestIdRef.current || cached) return;
        setBannerImages([]);
      } finally {
        if (requestId === bannerRequestIdRef.current) {
          setIsBannersLoading(false);
        }
      }
    };

    fetchGroceryBanners();
  }, [effectiveZoneId]);

  useEffect(() => {
    const fetchHomepageCategories = async () => {
      const requestId = ++categoryRequestIdRef.current;
      const cacheKey = "homepage-categories";
      const cached = getFreshCacheEntry(groceryCategoryCache, "categories", cacheKey, STATIC_GROCERY_CACHE_TTL_MS);
      if (cached) {
        setHomepageCategories(Array.isArray(cached) ? cached : []);
        setIsCategoriesLoading(false);
      } else {
        setIsCategoriesLoading(true);
      }

      try {
        const response = await api.get("/grocery/categories", {
          params: { includeSubcategories: true },
        });
        const categories = Array.isArray(response?.data?.data) ? response.data.data : [];
        if (requestId !== categoryRequestIdRef.current) return;
        setCacheEntry(groceryCategoryCache, "categories", cacheKey, categories);
        setHomepageCategories(categories);
      } catch {
        if (requestId !== categoryRequestIdRef.current || cached) return;
        setHomepageCategories([]);
      } finally {
        if (requestId === categoryRequestIdRef.current) {
          setIsCategoriesLoading(false);
        }
      }
    };

    fetchHomepageCategories();
  }, []);

  useEffect(() => {
    const fetchBestSellers = async () => {
      const requestId = ++bestSellerRequestIdRef.current;
      const cacheKey = "best-sellers";
      const cached = getFreshCacheEntry(groceryBestSellerCache, "best-sellers", cacheKey, STATIC_GROCERY_CACHE_TTL_MS);
      if (cached) {
        setBestSellerItems(Array.isArray(cached?.items) ? cached.items : []);
        setBestSellerSections(Array.isArray(cached?.sections) ? cached.sections : []);
        setIsBestSellersLoading(false);
      } else {
        setIsBestSellersLoading(true);
      }

      try {
        const response = await api.get("/hero-banners/grocery-best-sellers/public", {
          params: { platform: "mogrocery" },
        });
        const items = Array.isArray(response?.data?.data?.items) ? response.data.data.items : [];
        const sections = Array.isArray(response?.data?.data?.sections) ? response.data.data.sections : [];
        if (requestId !== bestSellerRequestIdRef.current) return;
        setCacheEntry(groceryBestSellerCache, "best-sellers", cacheKey, { items, sections });
        setBestSellerItems(items);
        setBestSellerSections(sections);
      } catch {
        if (requestId !== bestSellerRequestIdRef.current || cached) return;
        setBestSellerItems([]);
        setBestSellerSections([]);
      } finally {
        if (requestId === bestSellerRequestIdRef.current) {
          setIsBestSellersLoading(false);
        }
      }
    };

    fetchBestSellers();
  }, []);

  const loadProductsPage = useCallback(
    async (pageToLoad, { replace = false } = {}) => {
      const requestId = ++productRequestIdRef.current;
      if ((locationLoading || zoneLoading) && !effectiveZoneId) {
        return false;
      }

      if (!effectiveZoneId) {
        setRawProducts([]);
        setAllProducts([]);
        setProductsPage(1);
        setHasMoreProducts(false);
        setIsProductsLoading(false);
        setIsLoadingMoreProducts(false);
        return false;
      }

      if (replace) {
        setIsProductsLoading(true);
      } else {
        setIsLoadingMoreProducts(true);
      }

      try {
        const cacheKey = `products::${String(effectiveZoneId || "no-zone")}::${String(pageToLoad)}`;
        const cachedPage = getFreshCacheEntry(groceryProductsPageCache, "products", cacheKey, ZONE_GROCERY_CACHE_TTL_MS);
        if (cachedPage) {
          if (requestId !== productRequestIdRef.current) return false;
          const cachedProducts = Array.isArray(cachedPage?.products) ? cachedPage.products : [];
          setRawProducts((previousProducts) =>
            replace
              ? mergeUniqueProducts([], cachedProducts)
              : mergeUniqueProducts(previousProducts, cachedProducts)
          );
          setProductsPage(pageToLoad);
          setHasMoreProducts(Boolean(cachedPage?.hasMore));
          zoneRecoveryAttemptedRef.current = false;
          return cachedProducts.length > 0;
        }

        const response = await api.get("/grocery/products", {
          params: { page: pageToLoad, limit: GROCERY_PRODUCTS_PAGE_SIZE, zoneId: effectiveZoneId },
        });
        const products = Array.isArray(response?.data?.data) ? response.data.data : [];
        if (requestId !== productRequestIdRef.current) return false;
        setCacheEntry(groceryProductsPageCache, "products", cacheKey, {
          products,
          hasMore: products.length >= GROCERY_PRODUCTS_PAGE_SIZE,
        });
        setRawProducts((previousProducts) =>
          replace
            ? mergeUniqueProducts([], products)
            : mergeUniqueProducts(previousProducts, products)
        );
        setProductsPage(pageToLoad);
        setHasMoreProducts(products.length >= GROCERY_PRODUCTS_PAGE_SIZE);
        zoneRecoveryAttemptedRef.current = false;
        return products.length > 0;
      } catch (error) {
        const statusCode = Number(error?.response?.status || 0);
        const message = String(error?.response?.data?.message || "").toLowerCase();
        const isZoneValidationError =
          statusCode === 400 && (message.includes("zone") || message.includes("inactive"));

        if (requestId !== productRequestIdRef.current) return false;

        if (isZoneValidationError && !zoneRecoveryAttemptedRef.current) {
          zoneRecoveryAttemptedRef.current = true;
          localStorage.removeItem("userZoneId:mogrocery");
          localStorage.removeItem("userZone:mogrocery");
          if (typeof refreshZone === "function") {
            refreshZone();
          }
        }

        if (replace) {
          setRawProducts([]);
          setAllProducts([]);
        }
        setHasMoreProducts(false);
        return false;
      } finally {
        if (requestId === productRequestIdRef.current) {
          if (replace) {
            setIsProductsLoading(false);
          } else {
            setIsLoadingMoreProducts(false);
          }
        }
      }
    },
    [effectiveZoneId, locationLoading, refreshZone, zoneLoading]
  );

  useEffect(() => {
    setProductsPage(1);
    setHasMoreProducts(false);
    loadProductsPage(1, { replace: true });
  }, [loadProductsPage, locationRefreshTick]);

  useEffect(() => {
    if (!effectiveZoneId) {
      setAllProducts([]);
      return;
    }

    const zoneScopedProducts = (Array.isArray(rawProducts) ? rawProducts : []).filter((product) => {
      const productZoneId = String(
        product?.zoneId?._id ||
        product?.zoneId?.id ||
        product?.zoneId ||
        product?.storeId?.zoneId?._id ||
        product?.storeId?.zoneId?.id ||
        product?.storeId?.zoneId ||
        "",
      ).trim();
      if (effectiveZoneId && productZoneId && productZoneId !== String(effectiveZoneId)) return false;
      return true;
    });

    const allowedStoreIds = new Set(
      groceryStores
        .flatMap((store) => getStoreIdCandidates(store)),
    );

    if (allowedStoreIds.size === 0) {
      // Do not block initial product rendering on the store list request.
      // The products endpoint is already zone-aware, so we can render immediately.
      setAllProducts(zoneScopedProducts);
      return;
    }

    const storeScopedProducts = zoneScopedProducts.filter((product) => {
      const productStoreId = String(
        product?.storeId?._id ||
        product?.storeId?.id ||
        product?.storeId ||
        product?.restaurantId?._id ||
        product?.restaurantId?.id ||
        product?.restaurantId ||
        "",
      ).trim();
      const productStoreCandidates = getStoreIdCandidates(product);
      if (productStoreId && allowedStoreIds.has(productStoreId)) return true;
      return productStoreCandidates.some((candidateId) => allowedStoreIds.has(candidateId));
    });

    setAllProducts(storeScopedProducts);
  }, [effectiveZoneId, rawProducts, groceryStores]);

  useEffect(() => {
    if (selectedStoreId === "all-stores") return;
    const hasSelectedStore = groceryStores.some(
      (store) => getNormalizedStoreId(store) === String(selectedStoreId)
    );
    if (!hasSelectedStore) {
      setSelectedStoreId("all-stores");
    }
  }, [groceryStores, selectedStoreId]);

  useEffect(() => {
    const fetchGroceryStores = async () => {
      const requestId = ++storeRequestIdRef.current;
      if ((locationLoading || zoneLoading) && !effectiveZoneId) {
        setIsStoresLoading(true);
        return;
      }

      const cacheKey = `stores::${String(effectiveZoneId || "no-zone")}`;
      const cached = getFreshCacheEntry(groceryStoreCache, "stores", cacheKey, ZONE_GROCERY_CACHE_TTL_MS);
      if (cached) {
        setGroceryStores(Array.isArray(cached?.stores) ? cached.stores : []);
        setHasActiveGroceryStore(Boolean(cached?.hasActiveStore));
        setIsStoresLoading(false);
      } else {
        setIsStoresLoading(true);
      }

      try {
        const response = await restaurantAPI.getRestaurants({
          limit: 200,
          platform: "mogrocery",
          onlyZone: "true",
          ...(effectiveZoneId ? { zoneId: effectiveZoneId } : {}),
        });
        const restaurants = Array.isArray(response?.data?.data?.restaurants)
          ? response.data.data.restaurants
          : [];
        const zoneMappedMoGroceryStores = restaurants.filter((restaurant) => {
          if (String(restaurant?.platform || "").toLowerCase() !== "mogrocery") return false;

          const storeZoneId = String(
            restaurant?.zoneId?._id ||
            restaurant?.zoneId?.id ||
            restaurant?.zoneId ||
            restaurant?.zone?._id ||
            restaurant?.zone?.id ||
            restaurant?.zone ||
            "",
          ).trim();
          if (effectiveZoneId && storeZoneId !== String(effectiveZoneId)) return false;

          if (restaurant?.isActive === false) return false;
          return true;
        });

        const currentlyAvailableStores = zoneMappedMoGroceryStores.filter((restaurant) => {
          if (restaurant?.isOnline === false) return false;
          if (restaurant?.isAcceptingOrders === false) return false;

          return evaluateStoreAvailability({
            store: restaurant,
            label: "Store",
          }).isAvailable;
        });

        // If all mapped stores are temporarily offline/closed, keep showing mapped stores
        // so users can still browse instead of hitting a hard "service unavailable" wall.
        const storesForBrowsing =
          currentlyAvailableStores.length > 0 ? currentlyAvailableStores : zoneMappedMoGroceryStores;

        if (requestId !== storeRequestIdRef.current) return;
        setCacheEntry(groceryStoreCache, "stores", cacheKey, {
          stores: storesForBrowsing,
          hasActiveStore: zoneMappedMoGroceryStores.length > 0,
        });
        setGroceryStores(storesForBrowsing);
        setHasActiveGroceryStore(zoneMappedMoGroceryStores.length > 0);
      } catch (error) {
        const statusCode = Number(error?.response?.status || 0);
        const message = String(error?.response?.data?.message || "").toLowerCase();
        const isZoneValidationError =
          statusCode === 400 && (message.includes("zone") || message.includes("inactive"));

        if (requestId !== storeRequestIdRef.current) return;

        if (isZoneValidationError && !zoneRecoveryAttemptedRef.current) {
          zoneRecoveryAttemptedRef.current = true;
          localStorage.removeItem("userZoneId:mogrocery");
          localStorage.removeItem("userZone:mogrocery");
          if (typeof refreshZone === "function") {
            refreshZone();
          }
        }

        if (!cached) {
          setGroceryStores([]);
          setHasActiveGroceryStore(false);
        }
      } finally {
        if (requestId === storeRequestIdRef.current) {
          setIsStoresLoading(false);
        }
      }
    };

    fetchGroceryStores();
  }, [effectiveZoneId, locationLoading, refreshZone, zoneLoading, locationRefreshTick]);

  useEffect(() => {
    const targetElement = productPageLoadMoreRef.current;
    if (!targetElement) return undefined;
    if (isProductsLoading || isLoadingMoreProducts || !hasMoreProducts) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || productLoadInFlightRef.current) return;
        productLoadInFlightRef.current = true;
        loadProductsPage(productsPage + 1, { replace: false })
          .finally(() => {
            productLoadInFlightRef.current = false;
          });
      },
      { rootMargin: "320px 0px" }
    );

    observer.observe(targetElement);
    return () => observer.disconnect();
  }, [hasMoreProducts, isLoadingMoreProducts, isProductsLoading, loadProductsPage, productsPage]);

  useEffect(() => {
    if (!hasUserSession) return undefined;

    let timer = null;
    const POLL_INTERVAL_MS = 20000;

    const fetchAndNotifyOrderUpdates = async () => {
      if (typeof document !== "undefined" && document.hidden) return;

      try {
        const response = await userAPI.getOrders({ page: 1, limit: 30 });
        const orders = Array.isArray(response?.data?.data?.orders)
          ? response.data.data.orders
          : Array.isArray(response?.data?.orders)
            ? response.data.orders
            : [];

        const groceryOrders = orders.filter(
          (order) => isGroceryOrder(order) && !isMoGroceryPlanOrder(order),
        );
        setActiveGroceryOrder(findActiveTrackableOrder(groceryOrders));

        const nextSnapshot = buildOrderSnapshot(groceryOrders);
        if (!hasSeededOrderSnapshotRef.current) {
          hasSeededOrderSnapshotRef.current = true;
          orderSnapshotRef.current = nextSnapshot;
          return;
        }

        groceryOrders.forEach((order) => {
          const key = String(order?._id || order?.orderId || "");
          if (!key) return;
          const previousValue = orderSnapshotRef.current.get(key);
          const nextValue = nextSnapshot.get(key);
          if (nextValue && previousValue !== nextValue) {
            toast.success(getOrderUpdateMessage(order), { duration: 4500 });
          }
        });

        orderSnapshotRef.current = nextSnapshot;
      } catch {
        // Silent background poll for status popups.
      }
    };

    fetchAndNotifyOrderUpdates();
    timer = setInterval(fetchAndNotifyOrderUpdates, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchAndNotifyOrderUpdates();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      hasSeededOrderSnapshotRef.current = false;
      orderSnapshotRef.current = new Map();
      setActiveGroceryOrder(null);
    };
  }, [hasUserSession, zoneId]);

  useEffect(() => {
    const loadWishlist = () => {
      try {
        const raw = localStorage.getItem("wishlist");
        if (!raw) {
          setWishlistItems([]);
          return;
        }
        const parsed = JSON.parse(raw);
        const valid = Array.isArray(parsed)
          ? parsed.filter((item) => item && typeof item === "object" && item.id)
          : [];
        setWishlistItems(valid);
      } catch {
        setWishlistItems([]);
      }
    };

    loadWishlist();

    const onStorage = (event) => {
      // Handle both native 'storage' events and our custom 'wishlistUpdated' event
      if (!event || event.type === "wishlistUpdated" || event.key === "wishlist") {
        loadWishlist();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("wishlistUpdated", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("wishlistUpdated", onStorage);
    };
  }, []);

  const canResolveStoreAvailability = Boolean(effectiveZoneId) || (!locationLoading && !zoneLoading);
  const isGroceryUnavailable = canResolveStoreAvailability && !hasActiveGroceryStore && !isStoresLoading;
  const hasInitialRenderableContent =
    bannerImages.length > 0 ||
    homepageCategories.length > 0 ||
    bestSellerItems.length > 0 ||
    bestSellerSections.length > 0 ||
    rawProducts.length > 0 ||
    groceryStores.length > 0;
  const shouldShowShimmer =
    !hasActiveSearch &&
    !hasInitialRenderableContent &&
    (isCategoriesLoading || isProductsLoading || isBestSellersLoading || isBannersLoading || isStoresLoading);
  const shouldShowUnavailableMap = !shouldShowShimmer && isGroceryUnavailable;

  // Auto-slide carousel
  useEffect(() => {
    if (bannerImages.length <= 1) return undefined;

    const interval = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % bannerImages.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [bannerImages.length]);

  // Handle scroll for sticky header transparency/background
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const normalizedStoreId = String(selectedStoreId || "").trim();
    if (normalizedStoreId && normalizedStoreId !== "all-stores") {
      localStorage.setItem("mogrocery:selectedStoreId", normalizedStoreId);
      return;
    }
    localStorage.removeItem("mogrocery:selectedStoreId");
  }, [selectedStoreId]);

  const selectedStoreCategoryMeta = useMemo(() => {
    const categoryIds = new Set();
    const categoryNames = new Set();
    const subcategoryIds = new Set();

    const selectedStore = groceryStores.find(
      (store) => getNormalizedStoreId(store) === String(selectedStoreId)
    );
    const selectedCandidateIds = new Set(
      [
        String(selectedStoreId || "").trim(),
        String(selectedStore?._id || "").trim(),
        String(selectedStore?.id || "").trim(),
      ].filter(Boolean)
    );

    const relevantProducts =
      selectedStoreId === "all-stores"
        ? allProducts
        : allProducts.filter((product) => {
            const productStoreIds = [
              String(product?.storeId?._id || "").trim(),
              String(product?.storeId?.id || "").trim(),
              String(typeof product?.storeId === "string" ? product.storeId : "").trim(),
              String(product?._storeId || "").trim(),
            ].filter(Boolean);
            return productStoreIds.some((candidateId) => selectedCandidateIds.has(candidateId));
          });

    relevantProducts.forEach((product) => {
      const productCategoryId = String(
        product?.category?._id || product?.category?.id || product?.category || ""
      ).trim();
      if (productCategoryId) categoryIds.add(productCategoryId);

      const productCategoryName = String(product?.category?.name || "").trim().toLowerCase();
      if (productCategoryName) categoryNames.add(productCategoryName);

      const productSubcategoryIds = [
        ...(Array.isArray(product?.subcategories) ? product.subcategories : []),
        product?.subcategory,
      ]
        .map((subcategory) => String(subcategory?._id || subcategory?.id || subcategory || "").trim())
        .filter(Boolean);
      productSubcategoryIds.forEach((subcategoryId) => subcategoryIds.add(subcategoryId));
    });

    return { categoryIds, categoryNames, subcategoryIds };
  }, [allProducts, groceryStores, selectedStoreId]);

  const topNavCategories = useMemo(
    () => [
      {
        id: "all",
        name: "All",
        img: imgBag3D,
      },
      ...homepageCategories
        .filter((category) => {
          if (selectedStoreId === "all-stores") return true;
          const categoryId = String(category?._id || "").trim();
          const categorySlug = String(category?.slug || "").trim();
          const categoryName = String(category?.name || "").trim().toLowerCase();
          return (
            (categoryId && selectedStoreCategoryMeta.categoryIds.has(categoryId)) ||
            (categorySlug && selectedStoreCategoryMeta.categoryIds.has(categorySlug)) ||
            (categoryName && selectedStoreCategoryMeta.categoryNames.has(categoryName))
          );
        })
        .map((category) => ({
          id: category?._id || category?.slug || category?.name,
          name: category?.name || "Category",
          img: category?.image || imgBag3D,
        })),
    ],
    [homepageCategories, selectedStoreId, selectedStoreCategoryMeta]
  );

  const normalizedSidebarSubcategories = useMemo(() => {
    const categoriesToUse =
      activeCategoryId === "all"
        ? homepageCategories
        : homepageCategories.filter(
          (category) => String(category?._id || category?.slug || category?.name) === String(activeCategoryId)
        );

    const map = new Map();
    categoriesToUse.forEach((category) => {
      const categoryKey = String(category?._id || category?.slug || category?.name || "");
      const categoryName = category?.name || "Category";
      const subcategories = Array.isArray(category?.subcategories) ? category.subcategories : [];
      subcategories.forEach((subcategory) => {
        if (!subcategory?._id) return;
        if (
          selectedStoreId !== "all-stores" &&
          !selectedStoreCategoryMeta.subcategoryIds.has(String(subcategory._id || "").trim())
        ) {
          return;
        }
        map.set(String(subcategory._id), {
          _id: String(subcategory._id),
          name: subcategory?.name || "Subcategory",
          image: subcategory?.image || FALLBACK_IMAGE,
          categoryId: categoryKey,
          categoryName,
        });
      });
    });

    return Array.from(map.values());
  }, [activeCategoryId, homepageCategories, selectedStoreId, selectedStoreCategoryMeta]);

  const findCategoryById = (idValue) => {
    const normalized = String(idValue || "");
    if (!normalized) return null;
    return (
      homepageCategories.find(
        (category) =>
          String(category?._id || "") === normalized ||
          String(category?.slug || "") === normalized ||
          String(category?.name || "") === normalized
      ) || null
    );
  };

  const openCollectionSheet = ({ categoryId, subcategoryId = "", title = "" }) => {
    const category = findCategoryById(categoryId);
    const resolvedCategoryId = category
      ? String(category?._id || category?.slug || category?.name || "all")
      : "all";
    const resolvedSubcategoryId = subcategoryId ? String(subcategoryId).trim() : "";

    if (resolvedSubcategoryId) {
      const storeSearch =
        selectedStoreId && selectedStoreId !== "all-stores"
          ? `?storeId=${encodeURIComponent(String(selectedStoreId))}`
          : "";
      navigate(`/grocery/subcategory/${resolvedSubcategoryId}${storeSearch}`, {
        state: {
          categoryId: resolvedCategoryId,
          ...(selectedStoreId && selectedStoreId !== "all-stores"
            ? { storeId: String(selectedStoreId) }
            : {}),
          title: title || category?.name || "Products",
        },
      });
      return true;
    }

    if (resolvedCategoryId && resolvedCategoryId !== "all") {
      navigate(`/grocery/best-seller/category/${resolvedCategoryId}`, {
        state: { title: title || category?.name || "Products" },
      });
      return true;
    }

    const storeSearch =
      selectedStoreId && selectedStoreId !== "all-stores"
        ? `?storeId=${encodeURIComponent(String(selectedStoreId))}`
        : "";
    navigate(`/grocery/categories${storeSearch}`, {
      state: {
        categoryId: "all",
        ...(selectedStoreId && selectedStoreId !== "all-stores"
          ? { storeId: String(selectedStoreId) }
          : {}),
      },
    });
    return true;
  };

  const storeFilteredProducts = useMemo(() => {
    if (selectedStoreId === "all-stores") return allProducts;
    const selectedStore = groceryStores.find(
      (store) => getNormalizedStoreId(store) === String(selectedStoreId)
    );
    const selectedCandidateIds = new Set(
      [
        String(selectedStoreId || "").trim(),
        String(selectedStore?._id || "").trim(),
        String(selectedStore?.id || "").trim(),
      ].filter(Boolean)
    );

    return allProducts.filter(
      (product) => {
        const productStoreIds = [
          String(product?.storeId?._id || "").trim(),
          String(product?.storeId?.id || "").trim(),
          String(typeof product?.storeId === "string" ? product.storeId : "").trim(),
          String(product?._storeId || "").trim(),
        ].filter(Boolean);

        return productStoreIds.some((candidateId) => selectedCandidateIds.has(candidateId));
      }
    );
  }, [allProducts, groceryStores, selectedStoreId]);

  const visibleLayoutProducts = useMemo(() => {
    return storeFilteredProducts.filter((product) => {
      const productCategoryId = String(
        product?.category?._id || product?.category?.id || product?.category || ""
      );
      const productSubcategoryIds = [
        ...(Array.isArray(product?.subcategories) ? product.subcategories : []),
        product?.subcategory,
      ]
        .map((subcategory) => String(subcategory?._id || subcategory?.id || subcategory || ""))
        .filter(Boolean);

      const categoryMatch =
        activeCategoryId === "all" ||
        productCategoryId === String(activeCategoryId) ||
        String(product?.category?.name || "") === String(activeTab);

      const subcategoryMatch =
        activeSubcategoryId === "all-subcategories" ||
        productSubcategoryIds.includes(String(activeSubcategoryId));

      return categoryMatch && subcategoryMatch;
    });
  }, [activeCategoryId, activeSubcategoryId, activeTab, storeFilteredProducts]);

  const extractImageUrl = (imageValue) => {
    if (typeof imageValue === "string") return imageValue;
    if (imageValue && typeof imageValue === "object") {
      return (
        imageValue.url ||
        imageValue.image ||
        imageValue.imageUrl ||
        imageValue.secure_url ||
        imageValue.src ||
        ""
      );
    }
    return "";
  };

  const getProductImageList = (product) => {
    const imageList = Array.isArray(product?.images)
      ? product.images.map(extractImageUrl).filter((img) => typeof img === "string" && img.trim())
      : [];

    const singleImage = extractImageUrl(product?.image);
    if (singleImage) imageList.push(singleImage);

    return Array.from(new Set(imageList));
  };

  const getProductImage = (product) => {
    const imageList = getProductImageList(product);

    if (imageList.length > 0) {
      // Prefer first uploaded/primary image to keep image-name mapping accurate.
      return imageList[0];
    }

    return FALLBACK_IMAGE;
  };

  // Memoize flakes to prevent re-render jumps
  const flakes = useMemo(() => Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    duration: Math.random() * 3 + 2,
    delay: Math.random() * 2,
    startX: Math.random() * 100 - 50,
    drift: Math.random() * 100 - 50,
  })), []);

  const homepageCategorySections = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const categoryFiltered =
      query
        ? homepageCategories
        : activeTab === "All"
          ? homepageCategories
          : homepageCategories.filter((category) => category?.name === activeTab);

    return categoryFiltered
      .filter((category) => {
        if (selectedStoreId === "all-stores") return true;
        const categoryId = String(category?._id || "").trim();
        const categorySlug = String(category?.slug || "").trim();
        const categoryName = String(category?.name || "").trim().toLowerCase();
        return (
          (categoryId && selectedStoreCategoryMeta.categoryIds.has(categoryId)) ||
          (categorySlug && selectedStoreCategoryMeta.categoryIds.has(categorySlug)) ||
          (categoryName && selectedStoreCategoryMeta.categoryNames.has(categoryName))
        );
      })
      .map((category) => {
        const subcategories = Array.isArray(category?.subcategories) ? category.subcategories : [];
        const filteredSubcategories = query
          ? subcategories.filter((sub) => (sub?.name || "").toLowerCase().includes(query))
          : subcategories;

        const matchesCategory = (category?.name || "").toLowerCase().includes(query);
        return {
          ...category,
          subcategories: matchesCategory ? subcategories : filteredSubcategories,
        };
      })
      .filter((category) => {
        if (!query) return true;
        return (category?.name || "").toLowerCase().includes(query) || category.subcategories.length > 0;
      });
  }, [activeTab, homepageCategories, searchQuery, selectedStoreId, selectedStoreCategoryMeta]);

  const homepageCategoryDisplaySections = useMemo(() => {
    return homepageCategorySections
      .map((category) => {
        const categoryId = String(category?._id || category?.slug || category?.name || "");

        const productCards = storeFilteredProducts
          .filter((product) => {
            const productCategoryId = String(
              product?.category?._id || product?.category?.id || product?.category || ""
            );
            return categoryId && productCategoryId === categoryId;
          })
          .slice(0, 60)
          .map((product, productIndex) => {
            const firstSubcategoryId =
              (Array.isArray(product?.subcategories) && product.subcategories[0]?._id) ||
              product?.subcategory?._id ||
              null;
            const productId = String(product?._id || product?.id || productIndex);

            return {
              _id: `product-card-${productId}`,
              productId,
              name: product?.name || "Product",
              image: getProductImage(product),
              __kind: "product",
              targetSubcategoryId: firstSubcategoryId ? String(firstSubcategoryId) : null,
            };
          });

        return {
          ...category,
          homepageCards: productCards.slice(0, 40),
        };
      })
      .filter((category) => Array.isArray(category.homepageCards) && category.homepageCards.length > 0);
  }, [getProductImage, homepageCategorySections, storeFilteredProducts]);

  const visibleSearchProducts = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return [];

    return storeFilteredProducts.filter((product) => {
      const name = String(product?.name || "").toLowerCase();
      const description = String(product?.description || "").toLowerCase();
      const categoryName = String(product?.category?.name || "").toLowerCase();
      const unit = String(product?.unit || "").toLowerCase();
      const subcategoryNames = [
        ...(Array.isArray(product?.subcategories) ? product.subcategories : []),
        product?.subcategory,
      ]
        .map((subcat) => String(subcat?.name || "").toLowerCase())
        .filter(Boolean)
        .join(" ");

      const searchMatch = (
        name.includes(query) ||
        description.includes(query) ||
        categoryName.includes(query) ||
        unit.includes(query) ||
        subcategoryNames.includes(query)
      );
      return searchMatch;
    });
  }, [searchQuery, storeFilteredProducts]);

  const activeCollectionCategory = useMemo(() => {
    if (!collectionCategoryId || collectionCategoryId === "all") return null;
    return findCategoryById(collectionCategoryId);
  }, [collectionCategoryId, homepageCategories]);

  const collectionCategoryTabs = useMemo(() => {
    return [
      { _id: "all", name: "All", image: imgBag3D },
      ...homepageCategories.map((category) => ({
        _id: String(category?._id || category?.slug || category?.name || ""),
        name: category?.name || "Category",
        image: category?.image || imgBag3D,
      })),
    ];
  }, [homepageCategories]);

  const collectionVisibleProducts = useMemo(() => {
    if (collectionCategoryId === "all") return storeFilteredProducts;
    const categoryId = String(collectionCategoryId || "");
    if (!categoryId) return [];

    return storeFilteredProducts.filter((product) => {
      const productCategoryId = String(
        product?.category?._id || product?.category?.id || product?.category || ""
      );
      return productCategoryId === categoryId;
    });
  }, [collectionCategoryId, storeFilteredProducts]);

  const getWishlistItemId = (product) => `food-${String(product?._id || product?.id || "")}`;

  const isProductWishlisted = (product) => {
    const wishlistId = getWishlistItemId(product);
    return wishlistItems.some((item) => String(item?.id) === wishlistId);
  };

  const toggleProductWishlist = (product, event = null) => {
    if (event) event.stopPropagation();
    const originalId = String(product?._id || product?.id || "");
    if (!originalId) return;

    const wishlistId = `food-${originalId}`;
    const exists = wishlistItems.some((item) => String(item?.id) === wishlistId);

    const next = exists
      ? wishlistItems.filter((item) => String(item?.id) !== wishlistId)
      : [
        ...wishlistItems,
        {
          id: wishlistId,
          type: "food",
          originalId,
          name: product?.name || "Product",
          image: getProductImage(product),
          price: Number(product?.sellingPrice || 0),
          mrp: Number(product?.mrp || 0),
          unit: product?.unit || "",
        },
      ];

    setWishlistItems(next);
    localStorage.setItem("wishlist", JSON.stringify(next));
    window.dispatchEvent(new Event("wishlistUpdated"));

    if (exists) {
      toast.success("Removed from wishlist");
    } else {
      toast.success("Added to wishlist");
    }
  };

  const groceryWishlistedProducts = useMemo(() => {
    const wantedIds = new Set(
      wishlistItems
        .filter((item) => item?.type === "food")
        .map((item) => String(item?.originalId || String(item?.id || "").replace(/^food-/, "")))
        .filter(Boolean)
    );

    if (wantedIds.size === 0) return [];

    const matchedProducts = storeFilteredProducts.filter((product) =>
      wantedIds.has(String(product?._id || product?.id || ""))
    );

    if (matchedProducts.length > 0) return matchedProducts;

    return wishlistItems
      .filter((item) => item?.type === "food")
      .map((item) => ({
        _id: item.originalId || String(item.id).replace(/^food-/, ""),
        name: item?.name || "Product",
        sellingPrice: Number(item?.price || 0),
        mrp: Number(item?.mrp || 0),
        unit: item?.unit || "",
        image: item?.image || FALLBACK_IMAGE,
      }));
  }, [storeFilteredProducts, wishlistItems]);

  const visibleBestSellers = useMemo(() => {
    if (!hasActiveGroceryStore) return [];

    const query = searchQuery.toLowerCase().trim();

    const getPreviewImagesForItem = (item) => {
      const explicitImages = Array.isArray(item?.images)
        ? item.images.map(extractImageUrl).filter((img) => typeof img === "string" && img.trim())
        : [];
      const uniqueExplicitImages = Array.from(new Set(explicitImages));
      if (uniqueExplicitImages.length >= 2) {
        return uniqueExplicitImages.slice(0, 4);
      }

      const type = String(item?.itemType || "");
      const targetId = String(item?.itemId || "");

      const productImages = storeFilteredProducts
        .filter((product) => {
          if (!targetId) return false;

          if (type === "category") {
            const productCategoryId = String(
              product?.category?._id || product?.category?.id || product?.category || ""
            );
            return productCategoryId === targetId;
          }

          if (type === "subcategory") {
            const productSubcategoryIds = [
              ...(Array.isArray(product?.subcategories) ? product.subcategories : []),
              product?.subcategory,
            ]
              .map((subcat) => String(subcat?._id || subcat?.id || subcat || ""))
              .filter(Boolean);
            return productSubcategoryIds.includes(targetId);
          }

          return false;
        })
        .map((product) => getProductImage(product))
        .filter((img) => typeof img === "string" && img.trim());

      const uniqueProductImages = Array.from(new Set(productImages));
      if (uniqueProductImages.length > 0) {
        return uniqueProductImages.slice(0, 4);
      }

      return [item?.image || FALLBACK_IMAGE];
    };

    const getProductCountForItem = (item) => {
      const type = String(item?.itemType || "");
      const targetId = String(item?.itemId || "");
      if (!targetId) return 0;

      if (type === "category") {
        return storeFilteredProducts.filter((product) => {
          const productCategoryId = String(
            product?.category?._id || product?.category?.id || product?.category || ""
          );
          return productCategoryId === targetId;
        }).length;
      }

      if (type === "subcategory") {
        return storeFilteredProducts.filter((product) => {
          const productSubcategoryIds = [
            ...(Array.isArray(product?.subcategories) ? product.subcategories : []),
            product?.subcategory,
          ]
            .map((subcat) => String(subcat?._id || subcat?.id || subcat || ""))
            .filter(Boolean);
          return productSubcategoryIds.includes(targetId);
        }).length;
      }

      return 0;
    };

    if (bestSellerItems.length === 0) return [];

    return bestSellerItems
      .filter((item) => {
        if (!(item?.name || "").toLowerCase().includes(query)) return false;
        if (selectedStoreId === "all-stores") return true;

        const targetId = String(item?.itemId || "");
        const type = String(item?.itemType || "");
        if (type === "product") {
          return storeFilteredProducts.some(
            (product) => String(product?._id || product?.id || "") === targetId
          );
        }
        if (type === "category") {
          return storeFilteredProducts.some((product) => {
            const productCategoryId = String(
              product?.category?._id || product?.category?.id || product?.category || ""
            );
            return productCategoryId === targetId;
          });
        }
        if (type === "subcategory") {
          return storeFilteredProducts.some((product) => {
            const productSubcategoryIds = [
              ...(Array.isArray(product?.subcategories) ? product.subcategories : []),
              product?.subcategory,
            ]
              .map((subcat) => String(subcat?._id || subcat?.id || subcat || ""))
              .filter(Boolean);
            return productSubcategoryIds.includes(targetId);
          });
        }
        return true;
      })
      .map((item) => ({
        id: item._id,
        name: item.name || "",
        image: item.image || FALLBACK_IMAGE,
        previewImages: getPreviewImagesForItem(item),
        countLabel: (() => {
          if (item?.countLabel) return item.countLabel;
          if (item?.count) return item.count;
          if (Number.isFinite(Number(item?.productCount))) return `+${Number(item.productCount)} more`;
          const derivedCount = getProductCountForItem(item);
          return derivedCount > 0 ? `+${derivedCount} more` : "";
        })(),
        itemType: item.itemType,
        itemId: item.itemId,
        subcategories: Array.isArray(item.subcategories) ? item.subcategories : [],
      }));
  }, [bestSellerItems, hasActiveGroceryStore, searchQuery, selectedStoreId, storeFilteredProducts]);

  const displayedBestSellers = useMemo(
    () =>
      visibleBestSellers.slice(0, bestSellerVisibleCount),
    [bestSellerVisibleCount, visibleBestSellers],
  );

  const orderedBestSellerProductSections = useMemo(() => {
    const productMap = new Map(
      (Array.isArray(storeFilteredProducts) ? storeFilteredProducts : []).map((product) => [
        String(product?._id || product?.id || ""),
        product,
      ])
    );

    const fallbackSectionsMap = new Map();
    if (!Array.isArray(bestSellerSections) || bestSellerSections.length === 0) {
      bestSellerItems
        .filter((item) => item?.itemType === "product" && item?.sectionName)
        .forEach((item) => {
          const key = `${Number(item?.sectionOrder || 0)}::${String(item?.sectionName || "").trim()}`;
          if (!fallbackSectionsMap.has(key)) {
            fallbackSectionsMap.set(key, {
              name: String(item?.sectionName || "").trim(),
              order: Number(item?.sectionOrder || 0),
              products: [],
            });
          }
          fallbackSectionsMap.get(key).products.push(item);
        });
    }

    const sectionsToUse =
      Array.isArray(bestSellerSections) && bestSellerSections.length > 0
        ? bestSellerSections
        : Array.from(fallbackSectionsMap.values());

    return sectionsToUse
      .map((section, index) => {
        const name = String(section?.name || section?.sectionName || "").trim();
        const order = Number(section?.order || section?.sectionOrder || index || 0);
        const sectionProducts = (Array.isArray(section?.products) ? section.products : [])
          .map((entry) => {
            const itemId = String(entry?.itemId?._id || entry?.itemId || "");
            return productMap.get(itemId) || null;
          })
          .filter(Boolean);

        return {
          id: `${order}-${name}-${index}`,
          name,
          order,
          products: sectionProducts,
        };
      })
      .filter((section) => section.name && section.products.length > 0)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name);
      });
  }, [bestSellerItems, bestSellerSections, storeFilteredProducts]);

  const displayedBestSellerProductSections = useMemo(
    () =>
      orderedBestSellerProductSections.slice(0, bestSellerSectionVisibleCount),
    [bestSellerSectionVisibleCount, orderedBestSellerProductSections],
  );

  const storeFilterOptions = useMemo(() => {
    const normalizedStores = groceryStores
      .map((store) => {
        const primaryId = getNormalizedStoreId(store);
        if (!primaryId) return null;
        return {
          id: primaryId,
          candidateIds: getStoreIdCandidates(store),
          name: String(store?.name || "Store").trim() || "Store",
          count: 0,
          image: store?.profileImage?.url || store?.logo || FALLBACK_IMAGE,
          address: store?.location?.area || store?.location?.city || "",
        };
      })
      .filter(Boolean);

    const counts = new Map(normalizedStores.map((store) => [store.id, 0]));
    allProducts.forEach((product) => {
      const productIds = new Set(getStoreIdCandidates(product));
      if (productIds.size === 0) return;
      const matchedStore = normalizedStores.find((store) =>
        store.candidateIds.some((candidateId) => productIds.has(candidateId))
      );
      if (!matchedStore) return;
      counts.set(matchedStore.id, (counts.get(matchedStore.id) || 0) + 1);
    });

    return normalizedStores
      .map((store) => ({
        id: store.id,
        name: store.name,
        count: counts.get(store.id) || 0,
        image: store.image,
        address: store.address,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });
  }, [allProducts, groceryStores]);

  useEffect(() => {
    setActiveSubcategoryId("all-subcategories");
  }, [activeCategoryId]);

  useEffect(() => {
    const hasActiveCategory =
      activeCategoryId === "all" ||
      topNavCategories.some((category) => String(category?.id || "") === String(activeCategoryId));
    if (!hasActiveCategory) {
      setActiveCategoryId("all");
      setActiveTab("All");
      setActiveSubcategoryId("all-subcategories");
      return;
    }

    if (
      activeSubcategoryId !== "all-subcategories" &&
      !normalizedSidebarSubcategories.some(
        (subcategory) => String(subcategory?._id || "") === String(activeSubcategoryId)
      )
    ) {
      setActiveSubcategoryId("all-subcategories");
    }
  }, [activeCategoryId, activeSubcategoryId, normalizedSidebarSubcategories, topNavCategories]);

  useEffect(() => {
    if (!isGroceryCategoriesRoute) return;

    setSearchQuery("");

    const stateCategoryId = String(routerLocation?.state?.categoryId || "");
    const stateSubcategoryId = String(routerLocation?.state?.subcategoryId || "");
    const stateStoreId = String(routerLocation?.state?.storeId || "").trim();
    const queryStoreId = String(
      new URLSearchParams(routerLocation?.search || "").get("storeId") || ""
    ).trim();
    const cachedStoreId =
      typeof window !== "undefined"
        ? String(localStorage.getItem("mogrocery:selectedStoreId") || "").trim()
        : "";
    const resolvedStoreId = queryStoreId || stateStoreId || cachedStoreId || "all-stores";
    setSelectedStoreId(resolvedStoreId);
    const hasStateCategory = stateCategoryId && stateCategoryId !== "all";

    if (hasStateCategory) {
      const matchedCategory =
        homepageCategories.find(
          (category) =>
            String(category?._id || "") === stateCategoryId ||
            String(category?.slug || "") === stateCategoryId ||
            String(category?.name || "") === stateCategoryId
        ) || null;

      const resolvedCategoryId = matchedCategory
        ? String(matchedCategory?._id || matchedCategory?.slug || matchedCategory?.name || "all")
        : stateCategoryId;

      setActiveCategoryId(resolvedCategoryId);
      setActiveTab(matchedCategory?.name || "All");
      setActiveSubcategoryId(stateSubcategoryId || "all-subcategories");
    } else {
      setActiveSubcategoryId("all-subcategories");
      const firstCategory = homepageCategories?.[0];
      if (firstCategory) {
        const categoryId = String(firstCategory?._id || firstCategory?.slug || firstCategory?.name || "all");
        setActiveTab(firstCategory?.name || "All");
        setActiveCategoryId(categoryId);
      } else {
        setActiveTab("All");
        setActiveCategoryId("all");
      }
    }

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [homepageCategories, isGroceryCategoriesRoute, routerLocation.search, routerLocation.state]);

  const hasAnySearchMatch = useMemo(() => {
    if (!hasActiveSearch) return true;
    return (
      homepageCategorySections.length > 0 ||
      visibleSearchProducts.length > 0 ||
      visibleBestSellers.length > 0
    );
  }, [hasActiveSearch, homepageCategorySections.length, visibleBestSellers.length, visibleSearchProducts.length]);

  const nearestStoreDistanceKm = useMemo(() => {
    const userLat = Number(userLocation?.latitude);
    const userLng = Number(userLocation?.longitude);
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng) || groceryStores.length === 0) {
      return null;
    }

    let nearestDistance = null;
    for (const store of groceryStores) {
      const coords = getStoreCoordinates(store);
      if (!coords) continue;

      const distanceKm = calculateDistanceKm(userLat, userLng, coords.lat, coords.lng);
      if (!Number.isFinite(distanceKm)) continue;
      if (nearestDistance === null || distanceKm < nearestDistance) {
        nearestDistance = distanceKm;
      }
    }

    return nearestDistance;
  }, [groceryStores, userLocation?.latitude, userLocation?.longitude]);

  const selectedStoreDistanceKm = useMemo(() => {
    if (selectedStoreId === "all-stores") return null;

    const userLat = Number(userLocation?.latitude);
    const userLng = Number(userLocation?.longitude);
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
      return null;
    }

    const selectedStore = groceryStores.find(
      (store) => getNormalizedStoreId(store) === String(selectedStoreId)
    );
    const coords = getStoreCoordinates(selectedStore);
    if (!coords) return null;

    const distanceKm = calculateDistanceKm(userLat, userLng, coords.lat, coords.lng);
    return Number.isFinite(distanceKm) ? distanceKm : null;
  }, [groceryStores, selectedStoreId, userLocation?.latitude, userLocation?.longitude]);

  const deliveryEtaMinutes = useMemo(() => {
    const activeDistanceKm =
      selectedStoreId === "all-stores" ? nearestStoreDistanceKm : selectedStoreDistanceKm;

    if (!Number.isFinite(activeDistanceKm)) return 8;
    // Base prep/packing + travel estimate (~4 min per km)
    return Math.max(8, Math.min(60, Math.round(8 + activeDistanceKm * 4)));
  }, [nearestStoreDistanceKm, selectedStoreDistanceKm, selectedStoreId]);

  const displayedLayoutProducts = useMemo(
    () =>
      visibleLayoutProducts.slice(0, layoutProductVisibleCount),
    [layoutProductVisibleCount, visibleLayoutProducts],
  );

  const displayedSearchProducts = useMemo(
    () =>
      visibleSearchProducts.slice(0, searchProductVisibleCount),
    [searchProductVisibleCount, visibleSearchProducts],
  );

  const displayedHomepageCategorySections = useMemo(
    () =>
      homepageCategoryDisplaySections.slice(0, homepageCategoryVisibleCount),
    [homepageCategoryDisplaySections, homepageCategoryVisibleCount],
  );

  useEffect(() => {
    setBestSellerVisibleCount(INITIAL_GROCERY_BESTSELLER_COUNT);
  }, [activeCategoryId, effectiveZoneId, hasActiveSearch, searchQuery, selectedStoreId]);

  useEffect(() => {
    setLayoutProductVisibleCount(INITIAL_GROCERY_LAYOUT_PRODUCT_COUNT);
  }, [activeCategoryId, activeSubcategoryId, effectiveZoneId, selectedStoreId]);

  useEffect(() => {
    setSearchProductVisibleCount(INITIAL_GROCERY_SEARCH_PRODUCT_COUNT);
  }, [effectiveZoneId, searchQuery, selectedStoreId]);

  useEffect(() => {
    setHomepageCategoryVisibleCount(INITIAL_GROCERY_CATEGORY_SECTION_COUNT);
    setHasScrolledForCategoryLazyLoad(false);
  }, [effectiveZoneId, searchQuery, selectedStoreId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (hasScrolledForCategoryLazyLoad) return undefined;

    const unlockLazyLoad = () => {
      const scrollTop = window.scrollY || window.pageYOffset || 0;
      if (scrollTop > 20) {
        setHasScrolledForCategoryLazyLoad(true);
      }
    };

    const onKeyDown = (event) => {
      const key = String(event?.key || "").toLowerCase();
      if (key === "arrowdown" || key === "pagedown" || key === " " || key === "spacebar") {
        unlockLazyLoad();
      }
    };

    window.addEventListener("wheel", unlockLazyLoad, { passive: true });
    window.addEventListener("touchmove", unlockLazyLoad, { passive: true });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("wheel", unlockLazyLoad);
      window.removeEventListener("touchmove", unlockLazyLoad);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hasScrolledForCategoryLazyLoad]);

  useEffect(() => {
    setBestSellerSectionVisibleCount(INITIAL_GROCERY_BESTSELLER_SECTION_COUNT);
  }, [effectiveZoneId, searchQuery, selectedStoreId]);

  useEffect(() => {
    const targetElement = bestSellerLoadMoreRef.current;
    const canLoadMore =
      !shouldShowShimmer &&
      !shouldShowUnavailableMap &&
      activeCategoryId === "all" &&
      visibleBestSellers.length > displayedBestSellers.length;
    if (!targetElement || !canLoadMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setBestSellerVisibleCount((previous) =>
          Math.min(previous + INITIAL_GROCERY_BESTSELLER_COUNT, visibleBestSellers.length)
        );
      },
      { rootMargin: "260px 0px" }
    );
    observer.observe(targetElement);
    return () => observer.disconnect();
  }, [
    activeCategoryId,
    displayedBestSellers.length,
    shouldShowShimmer,
    shouldShowUnavailableMap,
    visibleBestSellers.length,
  ]);

  useEffect(() => {
    const targetElement = layoutProductsLoadMoreRef.current;
    const canLoadMore =
      !shouldShowShimmer &&
      !shouldShowUnavailableMap &&
      activeCategoryId !== "all" &&
      visibleLayoutProducts.length > displayedLayoutProducts.length;
    if (!targetElement || !canLoadMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setLayoutProductVisibleCount((previous) =>
          Math.min(previous + INITIAL_GROCERY_LAYOUT_PRODUCT_COUNT, visibleLayoutProducts.length)
        );
      },
      { rootMargin: "260px 0px" }
    );
    observer.observe(targetElement);
    return () => observer.disconnect();
  }, [
    activeCategoryId,
    displayedLayoutProducts.length,
    shouldShowShimmer,
    shouldShowUnavailableMap,
    visibleLayoutProducts.length,
  ]);

  useEffect(() => {
    const targetElement = searchProductsLoadMoreRef.current;
    const canLoadMore =
      !shouldShowShimmer &&
      !shouldShowUnavailableMap &&
      hasActiveSearch &&
      visibleSearchProducts.length > displayedSearchProducts.length;
    if (!targetElement || !canLoadMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setSearchProductVisibleCount((previous) =>
          Math.min(previous + INITIAL_GROCERY_SEARCH_PRODUCT_COUNT, visibleSearchProducts.length)
        );
      },
      { rootMargin: "260px 0px" }
    );
    observer.observe(targetElement);
    return () => observer.disconnect();
  }, [
    displayedSearchProducts.length,
    hasActiveSearch,
    shouldShowShimmer,
    shouldShowUnavailableMap,
    visibleSearchProducts.length,
  ]);

  useEffect(() => {
    const targetElement = homepageCategoryLoadMoreRef.current;
    const canLoadMore =
      !shouldShowShimmer &&
      !shouldShowUnavailableMap &&
      !hasActiveSearch &&
      activeCategoryId === "all" &&
      hasScrolledForCategoryLazyLoad &&
      homepageCategoryDisplaySections.length > displayedHomepageCategorySections.length;
    if (!targetElement || !canLoadMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        const currentScrollTop = window.scrollY || window.pageYOffset || 0;
        if (currentScrollTop <= 20) return;
        setHomepageCategoryVisibleCount((previous) =>
          Math.min(previous + INITIAL_GROCERY_CATEGORY_SECTION_COUNT, homepageCategoryDisplaySections.length)
        );
      },
      { rootMargin: "40px 0px", threshold: 0.6 }
    );
    observer.observe(targetElement);
    return () => observer.disconnect();
  }, [
    activeCategoryId,
    displayedHomepageCategorySections.length,
    hasActiveSearch,
    hasScrolledForCategoryLazyLoad,
    homepageCategoryDisplaySections.length,
    shouldShowShimmer,
    shouldShowUnavailableMap,
  ]);

  useEffect(() => {
    const targetElement = bestSellerSectionsLoadMoreRef.current;
    const canLoadMore =
      !shouldShowShimmer &&
      !shouldShowUnavailableMap &&
      !hasActiveSearch &&
      activeCategoryId === "all" &&
      orderedBestSellerProductSections.length > displayedBestSellerProductSections.length;
    if (!targetElement || !canLoadMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setBestSellerSectionVisibleCount((previous) =>
          Math.min(previous + INITIAL_GROCERY_BESTSELLER_SECTION_COUNT, orderedBestSellerProductSections.length)
        );
      },
      { rootMargin: "300px 0px" }
    );
    observer.observe(targetElement);
    return () => observer.disconnect();
  }, [
    activeCategoryId,
    displayedBestSellerProductSections.length,
    hasActiveSearch,
    orderedBestSellerProductSections.length,
    shouldShowShimmer,
    shouldShowUnavailableMap,
  ]);

  const savedHeaderAddress = useMemo(() => {
    const addressList = Array.isArray(addresses) && addresses.length > 0
      ? addresses
      : parseStoredAddresses();

    if (!addressList.length) return "";

    let selectedAddressId = "";
    try {
      selectedAddressId = String(localStorage.getItem("userSelectedAddressId") || "").trim();
    } catch {
      selectedAddressId = "";
    }

    if (selectedAddressId) {
      const selectedAddress = addressList.find(
        (address) => String(address?._id || address?.id || "").trim() === selectedAddressId,
      );
      const selectedAddressDisplay = formatSavedAddressForHeader(selectedAddress);
      if (selectedAddressDisplay) return selectedAddressDisplay;
    }

    const defaultAddress = getDefaultAddress?.();
    const defaultAddressId = String(defaultAddress?._id || defaultAddress?.id || "").trim();

    if (defaultAddressId) {
      const hydratedDefault = addressList.find(
        (address) => String(address?._id || address?.id || "").trim() === defaultAddressId,
      );
      const hydratedDisplay = formatSavedAddressForHeader(hydratedDefault);
      if (hydratedDisplay) return hydratedDisplay;
    }

    const explicitDefault = addressList.find(
      (address) => address?.isDefault === true || address?.default === true,
    );
    const explicitDefaultDisplay = formatSavedAddressForHeader(explicitDefault);
    if (explicitDefaultDisplay) return explicitDefaultDisplay;

    return formatSavedAddressForHeader(addressList[0]);
  }, [addresses, getDefaultAddress]);

  const topAddress = useMemo(() => {
    const liveLocationCandidate =
      (storedUserLocation && typeof storedUserLocation === "object" ? storedUserLocation : null) ||
      (userLocation && typeof userLocation === "object" ? userLocation : null);
    const liveHeaderAddress = formatDynamicLocationForHeader(liveLocationCandidate);

    if (userLocationSource === "current" && liveHeaderAddress) return liveHeaderAddress;
    if (userLocationSource === "saved" && savedHeaderAddress) return savedHeaderAddress;
    if (savedHeaderAddress) return savedHeaderAddress;
    if (liveHeaderAddress) return liveHeaderAddress;

    return (
      "Select your location"
    );
  }, [savedHeaderAddress, storedUserLocation, userLocation, userLocationSource]);

  const handleBestSellerClick = (item) => {
    if (item.itemType === "category" && item.itemId) {
      if (openCollectionSheet({ categoryId: item.itemId, title: item?.name || "Products" })) return;
    }

    if (item.itemType === "subcategory" && item.itemId) {
      const parentCategory = homepageCategories.find((category) =>
        Array.isArray(category?.subcategories) &&
        category.subcategories.some((sub) => String(sub?._id || "") === String(item.itemId))
      );
      if (parentCategory) {
        if (
          openCollectionSheet({
            categoryId: parentCategory?._id || parentCategory?.slug || parentCategory?.name,
            subcategoryId: item.itemId,
            title: item?.name || parentCategory?.name || "Products",
          })
        ) {
          return;
        }
      }
    }

    if (item.itemType === "product" && item.itemId) {
      const product = allProducts.find((prod) => String(prod?._id || prod?.id || "") === String(item.itemId));
      const productId = String(product?._id || product?.id || item.itemId || "").trim();
      if (productId) {
        navigate(`/food/${productId}`, {
          state: product ? { item: buildProductDetailState(product) } : undefined,
        });
        return;
      }
    }

    if (item.itemType === "legacy" && item.categoryId) {
      if (openCollectionSheet({ categoryId: item.categoryId, title: item?.name || "Products" })) return;
    }

    if (item.itemType && item.itemId) {
      navigate(`/grocery/best-seller/${item.itemType}/${item.itemId}`);
      return;
    }

    navigate("/grocery/categories");
  };

  const buildProductDetailState = (product) => {
    const store = resolveStoreObjectFromProduct(product);
    const storeId = String(store?._id || store?.id || product?.storeId || "").trim();
    const storeName = String(store?.name || "").trim();
    const storeAddress = getStoreAddress(store);
    const sellingPrice = Number(product?.sellingPrice ?? product?.price ?? 0);
    const mrp = Number(product?.mrp ?? sellingPrice ?? 0);
    const discountPercent =
      mrp > sellingPrice && mrp > 0
        ? Math.max(1, Math.round(((mrp - sellingPrice) / mrp) * 100))
        : 0;

    return {
      id: product?._id || product?.id,
      name: product?.name || "Product",
      description: product?.description || "",
      weight: product?.unit || "200 g",
      price: sellingPrice,
      mrp,
      time: product?.time || "8 MINS",
      image: getProductImage(product),
      discount: discountPercent > 0 ? `${discountPercent}% OFF` : "",
      categoryId: product?.category?._id || product?.category?.id || product?.category || "",
      category: product?.category || null,
      subcategoryId:
        (Array.isArray(product?.subcategories) && product.subcategories[0]?._id) ||
        product?.subcategory?._id ||
        product?.subcategory?.id ||
        product?.subcategory ||
        "",
      storeId,
      storeName,
      storeAddress,
      platform: "mogrocery",
    };
  };

  const handleProductCardClick = (product, fallbackCategoryId = "") => {
    const productId = product?._id || product?.id;
    if (productId) {
      navigate(`/food/${productId}`, { state: { item: buildProductDetailState(product) } });
      return;
    }

    const categoryId =
      product?.category?._id || product?.category?.id || product?.category || fallbackCategoryId;
    if (!categoryId) return;
    openCollectionSheet({
      categoryId,
      title: product?.category?.name || collectionTitle || "Products",
    });
  };

  const getSourcePosition = (event, itemId) => {
    if (!event) return null;
    let buttonElement = event.currentTarget;
    if (!buttonElement && event.target) {
      buttonElement = event.target.closest("button") || event.target;
    }
    if (!buttonElement) return null;

    const rect = buttonElement.getBoundingClientRect();
    const scrollX = window.pageXOffset || window.scrollX || 0;
    const scrollY = window.pageYOffset || window.scrollY || 0;

    return {
      viewportX: rect.left + rect.width / 2,
      viewportY: rect.top + rect.height / 2,
      scrollX,
      scrollY,
      itemId,
    };
  };

  const handleAddProductToCart = (product, event = null) => {
    if (isGroceryUnavailable) {
      toast.error("Store is offline or closed. You cannot order right now.");
      return;
    }
    if (isProductOutOfStock(product)) {
      toast.error("This item is out of stock.");
      return;
    }

    const sourcePosition = getSourcePosition(event, product?._id || product?.id);
    const store = resolveStoreObjectFromProduct(product);
    const storeId = String(store?._id || store?.id || product?.storeId || "").trim();
    const storeName = String(store?.name || "").trim();
    const storeAddress = getStoreAddress(store);
    if (!storeId) {
      toast.error("Store information missing for this product.");
      return;
    }
    const categoryId = String(
      product?.category?._id || product?.category?.id || product?.category || ""
    ).trim();
    const subcategoryId = String(
      product?.subcategory?._id || product?.subcategory?.id || product?.subcategory || ""
    ).trim();
    addToCart({
      id: product?._id || product?.id,
      name: product?.name || "Product",
      price: Number(product?.sellingPrice || 0),
      mrp: Number(product?.mrp || 0),
      weight: product?.unit || "",
      image: getProductImage(product),
      categoryId,
      subcategoryId,
      storeId,
      storeName,
      storeAddress,
      restaurantId: storeId,
      restaurant: storeName || "MoGrocery",
      restaurantAddress: storeAddress || "",
      storeLocation: store?.location || null,
      restaurantLocation: product?.storeLocation || product?.storeId?.location || null,
      platform: "mogrocery",
      stockQuantity: product?.stockQuantity,
      inStock: product?.inStock,
      isActive: product?.isActive,
    }, sourcePosition);
  };

  const handleCategoriesNavClick = () => {
    if (isGroceryCategoriesRoute) {
      setSearchQuery("");
      setActiveSubcategoryId("all-subcategories");
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    const storeSearch =
      selectedStoreId && selectedStoreId !== "all-stores"
        ? `?storeId=${encodeURIComponent(String(selectedStoreId))}`
        : "";
    navigate(`/grocery/categories${storeSearch}`, {
      state: {
        categoryId: "all",
        ...(selectedStoreId && selectedStoreId !== "all-stores"
          ? { storeId: String(selectedStoreId) }
          : {}),
      },
    });
  };

  const handleHomeNavClick = () => {
    setSearchQuery("");
    setActiveTab("All");
    setActiveCategoryId("all");
    setActiveSubcategoryId("all-subcategories");

    if (!routerLocation.pathname.startsWith("/grocery") || isGroceryCategoriesRoute) {
      navigate("/grocery");
    }

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    // Main Container with White Background
    <div
      className="min-h-screen text-slate-800 dark:text-slate-100 pb-24 font-sans w-full shadow-none overflow-x-hidden relative bg-white dark:bg-[radial-gradient(120%_90%_at_50%_-10%,#1f2937_0%,#0b0f17_45%,#070b12_100%)]"
    >
      {/* Snow Effect Overlay */}
      <AnimatePresence>
        {showSnow && (
          <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
            {flakes.map((flake) => (
              <motion.div
                key={flake.id}
                initial={{ y: -20, opacity: 0, x: flake.startX }}
                animate={{
                  y: "100vh",
                  opacity: [0, 1, 1, 0],
                  x: flake.drift
                }}
                transition={{
                  duration: flake.duration,
                  repeat: Infinity,
                  delay: flake.delay,
                  ease: "easeInOut"
                }}
                className={`absolute top-0 ${activeTab === "Electronics" ? "" : "w-2 h-2 bg-white rounded-full blur-[1px]"}`}
                style={{ left: `${flake.left}%` }}
              >
                {activeTab === "Electronics" && (
                  <Snowflake className="w-4 h-4 text-white opacity-80" />
                )}
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
      {/* --- 1. HEADER (Yellow) --- */}
      <div
        className={`sticky top-0 z-40 transition-all duration-300 bg-white/95 dark:bg-[#0b111c]/90 backdrop-blur-md ${isScrolled ? "shadow-sm dark:shadow-black/30" : ""}`}
      >
        <div className="relative z-20">
          {/* Top Info Row - YELLOW BACKGROUND ADDED HERE */}
          <div
            className={`rounded-b-[2.5rem] pb-10 shadow-sm relative ${isZoneMenuOpen ? "z-[80]" : "z-20"} transition-all duration-500 dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)] dark:border-b dark:border-white/10 ${activeTab === "Electronics" ? "" :
              activeTab === "Beauty" ? "" :
                activeTab === "Pharmacy" ? "" :
                  activeTab === "Valentine's" ? "" : "bg-[#FACC15]"
              }`}
            style={
              activeTab === "Valentine's"
                ? { background: "linear-gradient(0deg, #EF4F5F 38%, #F58290 63%)" }
                : activeTab === "Electronics"
                  ? { background: "linear-gradient(0deg,rgba(160, 213, 222, 1) 38%, rgba(81, 184, 175, 1) 63%)" }
                  : activeTab === "Beauty"
                    ? { background: "linear-gradient(0deg,rgba(240, 134, 183, 1) 58%, rgba(235, 124, 176, 1) 63%)" }
                    : activeTab === "Pharmacy"
                      ? { background: "linear-gradient(0deg,#EF4F5F 22%, #D63D4D 63%)" }
                      : {}
            }
          >
            <div className="px-4 pt-6 flex justify-between items-start mb-0 md:max-w-6xl md:mx-auto w-full">
              <div className="flex flex-col">
                <h1 className="text-[10px] uppercase font-black tracking-[0.15em] text-[#3e3212] dark:text-black leading-none mb-0.5">
                  MoBasket in
                </h1>
                <div className="flex items-baseline gap-2 leading-none">
                  <span
                    className="text-[1.5rem] font-[900] text-[#1a1a1a] dark:text-black tracking-tight -ml-0.5"
                    style={{
                      fontFamily: "system-ui, -apple-system, sans-serif",
                    }}
                  >
                    {deliveryEtaMinutes} minutes
                  </span>
                </div>
                <div onClick={openLocationSelector} className="flex items-center gap-1 -mt-0.5 cursor-pointer">
                  <span className="text-[#1a1a1a] dark:text-black text-[0.8rem] font-bold tracking-tight leading-tight line-clamp-2">
                    {topAddress}
                  </span>
                  <ChevronDown
                    size={14}
                    className="text-[#1a1a1a] dark:text-black stroke-[3]"
                  />
                </div>
              </div>

              {/* Desktop Search Bar */}
              <div className="hidden md:flex flex-1 max-w-lg mx-8 items-center bg-white dark:bg-[#1f2937] rounded-xl px-4 py-2.5 shadow-sm border border-transparent dark:border-white/10 focus-within:border-black/10 dark:focus-within:border-cyan-400/50 transition-colors">
                <Search className="h-4 w-4 text-slate-500 dark:text-slate-300 stroke-[2.5] mr-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder='Search "chocolate"'
                  className="flex-1 bg-white dark:bg-[#1f2937] outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400/90 text-sm font-medium"
                />
              </div>



              {/* Profile & Cart Icons */}
              <div className="relative z-[130] mt-1 flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  <button
                    className="relative w-8 h-8 bg-[#1a1a1a] dark:bg-[#0e1624] dark:border dark:border-white/15 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform"
                    onClick={() => setShowWishlistSheet(true)}
                  >
                    <Heart size={16} className="text-white" />
                    {groceryWishlistedProducts.length > 0 && (
                      <motion.div
                        key={groceryWishlistedProducts.length}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="absolute -top-1 -right-1 bg-[#EF4F5F] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white"
                      >
                        {groceryWishlistedProducts.length}
                      </motion.div>
                    )}
                  </button>

                  {/* Cart Icon */}
                  <button
                    className="relative w-8 h-8 bg-[#1a1a1a] dark:bg-[#0e1624] dark:border dark:border-white/15 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform"
                    onClick={() => navigate("/grocery/cart")}
                  >
                    <ShoppingCart size={16} className="text-white" />
                    {itemCount > 0 && (
                      <motion.div
                        key={itemCount}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="absolute -top-1 -right-1 bg-[#EF4F5F] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white"
                      >
                        {itemCount}
                      </motion.div>
                    )}
                  </button>

                  <button
                    className="w-8 h-8 bg-[#1a1a1a] dark:bg-[#0e1624] dark:border dark:border-white/15 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform"
                    onClick={() => navigate("/grocery/profile")}
                  >
                    <User size={16} className="text-white" />
                  </button>
                </div>

                <div ref={zoneMenuRef} className="relative w-[132px]">
                  <button
                    type="button"
                    onClick={() => setIsZoneMenuOpen((prev) => !prev)}
                    className="flex h-7 w-full items-center justify-end gap-1 bg-transparent px-0 text-xs font-semibold text-[#1a1a1a] outline-none"
                  >
                    <span className="truncate">{selectedZoneLabel}</span>
                    <ChevronDown size={12} className={`transition-transform ${isZoneMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  <AnimatePresence>
                    {isZoneMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-8 z-[400] w-44 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg"
                        style={{ maxHeight: "min(18rem, calc(100vh - 120px))" }}
                      >
                        <div className="max-h-[inherit] overflow-y-auto overscroll-contain">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedGroceryZoneId("auto");
                              setSelectedStoreId("all-stores");
                              setIsZoneMenuOpen(false);
                            }}
                            className={`block w-full truncate px-3 py-2 text-left text-xs font-semibold ${selectedGroceryZoneId === "auto" ? "bg-blue-600 text-white" : "text-gray-800 hover:bg-gray-100"}`}
                          >
                            Auto
                          </button>
                          {availableZones.map((zone) => (
                            <button
                              key={zone.id}
                              type="button"
                              onClick={() => {
                                setSelectedGroceryZoneId(zone.id);
                                setSelectedStoreId("all-stores");
                                setIsZoneMenuOpen(false);
                              }}
                              className={`block w-full truncate px-3 py-2 text-left text-xs font-medium ${selectedGroceryZoneId === zone.id ? "bg-blue-600 text-white" : "text-gray-800 hover:bg-gray-100"}`}
                            >
                              {zone.name}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {/* Search Bar (Mobile) - OUTSIDE YELLOW BOX */}
          <div className="px-4 mt-3 mb-2 relative z-30 md:hidden">
            <div className="bg-gray-100 dark:bg-[#1f2937] rounded-2xl h-12 flex items-center px-4 border border-transparent dark:border-white/10 focus-within:border-black/5 dark:focus-within:border-cyan-400/45 transition-all w-full shadow-sm dark:shadow-black/25">
              <Search className="text-slate-400 dark:text-slate-300 w-5 h-5 stroke-[2.5] mr-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search "pet food"'
                className="flex-1 bg-transparent text-slate-800 dark:text-slate-100 text-[15px] font-semibold outline-none placeholder:text-slate-400/90 dark:placeholder:text-slate-500 h-full"
              />
              <div className="w-[1px] h-6 bg-slate-200 dark:bg-slate-700 mx-3"></div>
{/* <Mic
                onClick={startListening}
                className={`w-5 h-5 stroke-[2.5] transition-colors cursor-pointer ${isListening ? "text-[#EF4F5F] animate-pulse" : "text-slate-400"}`}
              /> */}
            </div>
          </div>

          {!shouldShowShimmer && groceryStores.length > 0 && (
            <div className="px-4 mt-1 mb-2 relative z-30 md:hidden">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <p className="text-[12px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Filter By Store
                  </p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {selectedStoreId === "all-stores"
                      ? `${storeFilterOptions.length} grocery stores`
                      : `${storeFilterOptions.find((store) => store.id === selectedStoreId)?.name || "Store"} selected`}
                  </p>
                </div>
                {selectedStoreId !== "all-stores" && (
                  <button
                    type="button"
                    onClick={() => setSelectedStoreId("all-stores")}
                    className="text-xs font-bold text-[#EF4F5F] dark:text-cyan-300"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedStoreId("all-stores")}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-colors ${selectedStoreId === "all-stores"
                    ? "border-[#facc15] bg-[#fff4cc] text-slate-900 dark:border-cyan-400/70 dark:bg-[#152338] dark:text-cyan-100"
                    : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-[#111a28] dark:text-slate-300"
                    }`}
                >
                  All Stores
                </button>
                {storeFilterOptions.map((store) => (
                  <button
                    type="button"
                    key={store.id}
                    onClick={() => setSelectedStoreId(store.id)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-colors ${selectedStoreId === store.id
                      ? "border-[#facc15] bg-[#fff4cc] text-slate-900 dark:border-cyan-400/70 dark:bg-[#152338] dark:text-cyan-100"
                      : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-[#111a28] dark:text-slate-300"
                      }`}
                  >
                    {store.name}
                    {store.count > 0 && (
                      <span className="ml-2 text-[11px] font-extrabold text-slate-400 dark:text-slate-500">
                        {store.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nav Tabs (Mobile Only) - OUTSIDE YELLOW BOX */}
          {!hasActiveSearch && (
            <div className="px-2 pb-2 mt-2 md:hidden">
              <div className="flex items-end gap-3 overflow-x-auto scrollbar-hide no-scrollbar px-2 w-full">
                {topNavCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className={`flex flex-col items-center gap-1.5 cursor-pointer min-w-[68px] px-1 py-1 rounded-xl transition-colors ${activeTab === cat.name ? "bg-white/60 dark:bg-white/12" : "hover:bg-white/35 dark:hover:bg-white/8"
                      }`}
                    onClick={() => {
                      setActiveTab(cat.name);
                      setActiveCategoryId(cat.id);
                    }}
                  >
                    <div className="relative">
                      <img
                        src={cat.img}
                        alt={cat.name}
                        loading="lazy"
                        decoding="async"
                        className="w-10 h-10 object-contain drop-shadow-md rounded-full"
                      />
                    </div>
                    <span
                      className={`text-[11px] font-bold tracking-tight text-center line-clamp-2 min-h-[30px] ${activeTab === cat.name ? "text-[#1a1a1a] dark:text-white" : "text-[#1a1a1a]/80 dark:text-slate-300"}`}
                    >
                      {cat.name}
                    </span>
                    {activeTab === cat.name && <div className="w-6 h-0.5 bg-[#1a1a1a] dark:bg-cyan-300 rounded-full"></div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Desktop Nav Categories (Moved from Header to above Banner) */}
      {!hasActiveSearch && (
        <div className="hidden md:flex items-center gap-6 py-4 px-4 bg-transparent overflow-x-auto no-scrollbar md:max-w-6xl mx-auto mb-2">
          {topNavCategories.map((cat) => (
            <div
              key={cat.id}
              className={`flex flex-col items-center gap-1.5 cursor-pointer group px-3 py-2 rounded-2xl transition-all ${cat.name === activeTab ? "bg-gray-100 dark:bg-gray-800 shadow-sm" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                }`}
              onClick={() => {
                setActiveTab(cat.name);
                setActiveCategoryId(cat.id);
              }}
            >
              <div className="relative transition-transform group-hover:scale-110">
                <img
                  src={cat.img}
                  alt={cat.name}
                  loading="lazy"
                  decoding="async"
                  className="w-12 h-12 object-contain drop-shadow-sm rounded-full"
                />
              </div>
              <span
                className={`text-[13px] font-bold text-center line-clamp-1 ${activeTab === cat.name ? "text-[#1a1a1a] dark:text-white" : "text-[#1a1a1a]/70 dark:text-white/70"
                  }`}
              >
                {cat.name}
              </span>
              {activeTab === cat.name && <div className="w-8 h-0.5 bg-[#EF4F5F] rounded-full mt-0.5"></div>}
            </div>
          ))}
        </div>
      )}

      {!shouldShowShimmer && groceryStores.length > 0 && (
        <div className="hidden md:block px-4 pt-1 pb-3 relative z-10 md:max-w-6xl md:mx-auto">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                Filter By Store
              </p>
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                {selectedStoreId === "all-stores"
                  ? `${storeFilterOptions.length} Stores Available`
                  : `${storeFilterOptions.find((store) => store.id === selectedStoreId)?.name || "Store"} selected`}
              </h2>
            </div>
            {selectedStoreId !== "all-stores" && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => setSelectedStoreId("all-stores")}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#EF4F5F] bg-[#EF4F5F]/10 hover:bg-[#EF4F5F]/20 transition-all"
              >
                Clear Filters
              </motion.button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-1">
            <motion.button
              whileHover={{ scale: 1.02, translateY: -2 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => setSelectedStoreId("all-stores")}
              className={`w-full h-auto min-h-[100px] rounded-2xl border-2 p-3 flex flex-col items-center justify-center text-center transition-all duration-300 shadow-sm ${selectedStoreId === "all-stores"
                ? "border-[#facc15] bg-gradient-to-br from-[#fffdf0] to-[#fff4cc] text-slate-900 shadow-[#facc15]/20"
                : "border-slate-100 bg-white text-slate-500 hover:border-[#facc15]/40 hover:text-slate-700 dark:border-slate-700 dark:bg-[#111a28] dark:text-slate-400"
                }`}
            >
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
                <Store size={24} className={selectedStoreId === "all-stores" ? "text-[#facc15]" : "text-slate-400"} />
              </div>
              <span className="text-sm font-bold">All Stores</span>
            </motion.button>
            {storeFilterOptions.map((store) => (
              <motion.button
                whileHover={{ scale: 1.02, translateY: -2 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                key={store.id}
                onClick={() => setSelectedStoreId(store.id)}
                className={`w-full h-auto min-h-[100px] rounded-2xl border-2 p-3 flex flex-col items-center justify-center text-center transition-all duration-300 shadow-sm ${selectedStoreId === store.id
                  ? "border-[#facc15] bg-gradient-to-br from-[#fffdf0] to-[#fff4cc] text-slate-900 shadow-[#facc15]/20"
                  : "border-slate-100 bg-white text-slate-500 hover:border-[#facc15]/40 hover:text-slate-700 dark:border-slate-700 dark:bg-[#111a28] dark:text-slate-300"
                  }`}
              >
                <div className="relative w-12 h-12 mb-2">
                  <img
                    src={store.image}
                    alt={store.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full rounded-full object-cover border border-slate-200 dark:border-slate-700"
                  />
                  {store.count > 0 && (
                    <span className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-lg text-[10px] font-black transition-colors ${selectedStoreId === store.id ? "bg-[#facc15] text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"}`}>
                      {store.count}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold line-clamp-2 leading-tight h-8 flex items-center justify-center">
                  {store.name}
                </span>
                {store.address && (
                  <span className="text-[10px] text-slate-400 mt-1 line-clamp-1">{store.address}</span>
                )}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {shouldShowShimmer && (
        <div className="px-4 pt-3 pb-24 relative z-10 md:max-w-6xl md:mx-auto animate-fade-in-up">
          <div className="h-[140px] md:h-[185px] rounded-2xl bg-slate-200 shimmer-bg mb-4" />
          <div className="h-5 w-36 rounded bg-slate-200 shimmer-bg mb-3" />
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={`best-skeleton-${idx}`} className="rounded-[22px] border border-[#d9dee5] bg-[#e9edf2] px-3 py-3.5">
                <div className="relative grid grid-cols-2 gap-1 mb-2">
                  {Array.from({ length: 4 }).map((__, innerIdx) => (
                    <div key={`best-inner-${idx}-${innerIdx}`} className="aspect-square rounded-xl bg-slate-200 shimmer-bg" />
                  ))}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-1 h-8 w-8 rounded-full bg-white shadow-sm border border-slate-200 shimmer-bg" />
                </div>
                <div className="h-4 w-24 mx-auto rounded bg-slate-200 shimmer-bg mb-2" />
                <div className="h-4 w-28 mx-auto rounded bg-slate-200 shimmer-bg" />
              </div>
            ))}
          </div>
          <div className="space-y-5">
            {Array.from({ length: 2 }).map((_, sectionIdx) => (
              <div key={`section-skeleton-${sectionIdx}`}>
                <div className="h-5 w-40 rounded bg-slate-200 shimmer-bg mb-3" />
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((__, cardIdx) => (
                    <div key={`section-card-${sectionIdx}-${cardIdx}`} className="flex flex-col items-center gap-1.5">
                      <div className="w-full h-[72px] rounded-xl bg-slate-200 shimmer-bg" />
                      <div className="h-3 w-16 rounded bg-slate-200 shimmer-bg" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {shouldShowUnavailableMap && (
        <div className="px-4 pt-6 pb-16 relative z-10 md:max-w-4xl md:mx-auto">
          <div className="rounded-[32px] border border-slate-200 bg-slate-50/95 px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-[#0f1724]/95">
            <div className="relative overflow-hidden rounded-[28px] border border-slate-300 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 p-4 dark:border-slate-700 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800">
              <div className="relative h-[280px] rounded-[24px] bg-[linear-gradient(135deg,rgba(255,255,255,0.5)_0%,rgba(226,232,240,0.95)_100%)] dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.95)_0%,rgba(15,23,42,1)_100%)]">
                <div className="absolute inset-0 opacity-60">
                  <div className="absolute left-[8%] top-[16%] h-12 w-20 rounded-2xl bg-slate-300/90 dark:bg-slate-700/80" />
                  <div className="absolute right-[10%] top-[14%] h-10 w-16 rounded-2xl bg-slate-300/90 dark:bg-slate-700/80" />
                  <div className="absolute left-[18%] bottom-[18%] h-14 w-24 rounded-3xl bg-slate-300/90 dark:bg-slate-700/80" />
                  <div className="absolute right-[16%] bottom-[22%] h-12 w-20 rounded-3xl bg-slate-300/90 dark:bg-slate-700/80" />
                  <div className="absolute left-[28%] top-0 h-full w-[14px] -rotate-[28deg] rounded-full bg-white/70 dark:bg-slate-600/80" />
                  <div className="absolute left-[52%] top-0 h-full w-[14px] rotate-[24deg] rounded-full bg-white/70 dark:bg-slate-600/80" />
                  <div className="absolute left-0 top-[42%] h-[14px] w-full -rotate-[9deg] rounded-full bg-white/75 dark:bg-slate-600/80" />
                  <div className="absolute left-0 top-[64%] h-[14px] w-full rotate-[7deg] rounded-full bg-white/75 dark:bg-slate-600/80" />
                </div>
                <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-400/70 bg-slate-500/85 shadow-[0_8px_24px_rgba(71,85,105,0.25)] dark:border-slate-500 dark:bg-slate-700">
                  <div className="h-5 w-5 rounded-full bg-white/90 dark:bg-slate-300" />
                </div>
                <div className="absolute left-1/2 top-[58%] h-16 w-[2px] -translate-x-1/2 bg-slate-500/70 dark:bg-slate-500" />
              </div>
            </div>

            <div className="pt-5 text-center">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                Service Unavailable
              </p>
              <h2 className="mt-2 text-xl font-black text-slate-900 dark:text-slate-100">
                No grocery available in your area
              </h2>
              <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                We only show stores mapped to your zone. Change your location to check another area.
              </p>
              <button
                type="button"
                onClick={openLocationSelector}
                className="mt-5 inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Change Location
              </button>
            </div>
          </div>
        </div>
      )}

      {!shouldShowShimmer && !shouldShowUnavailableMap && !hasActiveSearch && activeCategoryId === "all" && bannerImages.length > 0 && (
        <div className="relative z-0 -mt-1 animate-fade-in-up px-4 pt-2 pb-1 md:max-w-6xl mx-auto">
          <div className="relative w-full aspect-[2.3/1] md:aspect-[3.6/1] bg-white/20 backdrop-blur-sm rounded-2xl shadow-lg border border-white/30 overflow-hidden">
            {bannerImages.map((bannerImg, index) => (
              <div
                key={`${bannerImg}-${index}`}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out flex items-center justify-center ${index === currentBanner ? "opacity-100 z-10" : "opacity-0 z-0"
                  }`}
              >
                <img
                  src={bannerImg}
                  alt="Banner"
                  className="w-full h-full object-cover"
                />
              </div>
            ))}

            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
              {bannerImages.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === currentBanner ? "bg-white w-4" : "bg-white/50"
                    }`}
                ></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!shouldShowShimmer && !shouldShowUnavailableMap && !hasActiveSearch && activeCategoryId === "all" && displayedBestSellers.length > 0 && (
        <div
          className="px-4 pt-4 pb-2 relative z-10 md:max-w-6xl md:mx-auto"
          style={{ contentVisibility: "auto", containIntrinsicSize: "480px" }}
        >
          <h3 className="text-lg font-[800] text-[#3e2723] dark:text-slate-100 mb-4">Bestsellers</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-6">
            {displayedBestSellers.map((item, idx) => {
              const cardImages = Array.from({ length: 4 }).map(
                (_, imageIndex) => item.previewImages?.[imageIndex] || item.image
              );

              return (
                <button
                  type="button"
                  key={`${item.id}-${idx}`}
                  className="px-3 py-2.5 md:px-4 md:py-5 bg-[#e9edf2] md:bg-sky-50 dark:bg-[#141f2e] rounded-[22px] border border-[#d9dee5] dark:border-[#24344c] shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_24px_rgba(0,0,0,0.35)] text-left active:scale-95 transition-all duration-300 md:hover:shadow-lg md:hover:-translate-y-1 md:hover:border-sky-200 dark:md:hover:border-cyan-400/40 group"
                  onClick={() => handleBestSellerClick(item)}
                >
                  <div className="relative grid grid-cols-2 gap-1 mb-2 md:gap-2 md:w-[85%] md:mx-auto md:mb-5">
                    {cardImages.map((imageSrc, imageIdx) => (
                      <div
                        key={`${item.id}-${imageIdx}`}
                        className="aspect-square rounded-xl bg-white dark:bg-[#0d1624] border border-[#eceff3] dark:border-[#2a3a51] overflow-hidden flex items-center justify-center p-0.5 transition-all duration-300 md:group-hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:group-hover:border-slate-200 dark:md:group-hover:border-cyan-400/40"
                      >
                        <img
                          src={imageSrc}
                          alt={item.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-contain scale-115 md:scale-[0.85] md:group-hover:scale-100 transition-transform duration-500"
                        />
                      </div>
                    ))}
                    {item.countLabel ? (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-1 md:-bottom-2.5 h-8 min-w-8 px-2 md:px-2.5 rounded-full bg-white dark:bg-[#0f1b2c] border border-[#d7dce4] dark:border-[#2a3a51] shadow-sm md:shadow-md text-[11px] font-[800] text-[#5b6472] dark:text-slate-200 md:text-slate-800 flex items-center justify-center z-10 md:group-hover:text-[#EF4F5F] transition-colors">
                        {item.countLabel}
                      </div>
                    ) : null}
                  </div>
                  <p className="text-[15px] md:text-[16px] font-[800] text-[#262a33] md:text-slate-800 dark:text-slate-100 leading-[1.08] md:leading-[1.2] text-center line-clamp-2 min-h-[24px] md:min-h-[36px] flex items-center justify-center">
                    {item.name}
                  </p>
                </button>
              );
            })}
          </div>
          {visibleBestSellers.length > displayedBestSellers.length && (
            <div
              ref={bestSellerLoadMoreRef}
              aria-hidden="true"
              className="h-px w-full opacity-0 pointer-events-none"
            />
          )}
        </div>
      )}

      {!shouldShowShimmer && !shouldShowUnavailableMap && !hasActiveSearch && activeCategoryId !== "all" && (
        <div className="px-2 sm:px-4 pb-24 pt-2 relative z-10 md:max-w-6xl md:mx-auto">
          <div className="flex gap-2 sm:gap-3">
            <aside className="w-[86px] sm:w-[100px] shrink-0 border-r border-slate-200 dark:border-slate-700/80 pr-2">
              <div className="max-h-[calc(100vh-230px)] overflow-y-auto space-y-2 pb-3">
                <button
                  type="button"
                  className={`w-full rounded-xl px-2 py-2 text-[11px] font-semibold text-center border ${activeSubcategoryId === "all-subcategories"
                    ? "bg-[#fff4cc] dark:bg-[#1c2c42] border-[#facc15] dark:border-cyan-400/70 text-slate-900 dark:text-cyan-100"
                    : "bg-white dark:bg-[#111a28] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  onClick={() => setActiveSubcategoryId("all-subcategories")}
                >
                  All
                </button>
                {normalizedSidebarSubcategories.map((subcategory) => (
                  <button
                    type="button"
                    key={subcategory._id}
                    className={`w-full rounded-xl px-1.5 py-2 border flex flex-col items-center gap-1.5 ${activeSubcategoryId === subcategory._id
                      ? "bg-[#fff4cc] dark:bg-[#1c2c42] border-[#facc15] dark:border-cyan-400/70"
                      : "bg-white dark:bg-[#111a28] border-slate-200 dark:border-slate-700"
                      }`}
                    onClick={() => setActiveSubcategoryId(subcategory._id)}
                  >
                    <img
                      src={subcategory.image}
                      alt={subcategory.name}
                      loading="lazy"
                      decoding="async"
                      className="w-10 h-10 rounded-full object-cover bg-slate-50 dark:bg-slate-800"
                    />
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 leading-tight line-clamp-2">
                      {subcategory.name}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-base sm:text-lg font-[800] text-[#3e2723] dark:text-slate-100">
                  {activeSubcategoryId === "all-subcategories"
                    ? activeTab
                    : normalizedSidebarSubcategories.find((subcat) => subcat._id === activeSubcategoryId)?.name || "Products"}
                </h3>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{visibleLayoutProducts.length} items</span>
              </div>

              {visibleLayoutProducts.length === 0 ? (
                <p className="px-1 py-6 text-sm text-slate-500 dark:text-slate-400">No products found in this subcategory.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                  {displayedLayoutProducts.map((product) => {
                    const productId = product?._id || product?.id;
                    const cartItemId = getGroceryCartItemId(product);
                    const cartItem = cartItemId ? getCartItem(cartItemId) : null;
                    const currentQty = Number(cartItem?.quantity || 0);
                    const alreadyInCart = currentQty > 0 || (cartItemId ? isInCart(cartItemId) : false);

                    return (
                      <div
                        key={`layout-product-${productId}`}
                        className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#111a28] shadow-sm dark:shadow-black/20 p-2.5 sm:p-3 cursor-pointer relative"
                        onClick={() => handleProductCardClick(product, activeCategoryId)}
                      >
                        <button
                          type="button"
                          className={`absolute top-2 right-2 z-20 w-7 h-7 rounded-full border flex items-center justify-center transition-all duration-300 ${isProductWishlisted(product)
                            ? "bg-pink-50 dark:bg-pink-500/15 border-pink-200 dark:border-pink-400/40 text-pink-500 shadow-sm"
                            : "bg-white/80 dark:bg-[#0e1624]/80 backdrop-blur-sm border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            }`}
                          onClick={(event) => toggleProductWishlist(product, event)}
                        >
                          <Heart
                            size={14}
                            className={isProductWishlisted(product) ? "fill-current" : ""}
                            strokeWidth={isProductWishlisted(product) ? 2.5 : 2}
                          />
                        </button>

                        <div className="w-full aspect-square bg-slate-50 dark:bg-[#0d1624] rounded-xl overflow-hidden mb-2 flex items-center justify-center">
                          <img
                            src={getProductImage(product)}
                            alt={product?.name || "Product"}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-contain scale-110"
                          />
                        </div>
                        <p className="text-[12px] sm:text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 min-h-[34px]">
                          {product?.name || "Product"}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                          {product?.unit || "Unit not specified"}
                        </p>
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Rs {Number(product?.sellingPrice || 0)}</p>
                            {Number(product?.mrp || 0) > Number(product?.sellingPrice || 0) && (
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 line-through">Rs {Number(product?.mrp || 0)}</p>
                            )}
                          </div>
                          {alreadyInCart ? (
                            <div
                              className="flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-1 py-0.5 shadow-sm"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <button
                                type="button"
                                className="w-5 h-5 flex items-center justify-center text-emerald-700"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  updateQuantity(
                                    cartItemId,
                                    currentQty - 1,
                                    null,
                                    {
                                      id: cartItemId,
                                      name: product?.name || "Product",
                                      imageUrl: getProductImage(product),
                                      stockQuantity: product?.stockQuantity,
                                      inStock: product?.inStock,
                                      isActive: product?.isActive,
                                    },
                                  );
                                }}
                              >
                                <Minus size={12} />
                              </button>
                              <span className="text-[11px] font-bold text-emerald-700 min-w-[14px] text-center">
                                {currentQty}
                              </span>
                              <button
                                type="button"
                                className="w-5 h-5 flex items-center justify-center text-emerald-700"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  updateQuantity(
                                    cartItemId,
                                    currentQty + 1,
                                    null,
                                    {
                                      id: cartItemId,
                                      name: product?.name || "Product",
                                      imageUrl: getProductImage(product),
                                      stockQuantity: product?.stockQuantity,
                                      inStock: product?.inStock,
                                      isActive: product?.isActive,
                                    },
                                  );
                                }}
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg text-[10px] sm:text-xs font-[900] border bg-white dark:bg-[#0f1b2c] text-slate-900 dark:text-slate-100 border-[#facd01] dark:border-cyan-400/70"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleAddProductToCart(product, event);
                              }}
                            >
                              ADD
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {visibleLayoutProducts.length > displayedLayoutProducts.length && (
                <div
                  ref={layoutProductsLoadMoreRef}
                  aria-hidden="true"
                  className="h-px w-full opacity-0 pointer-events-none"
                />
              )}
            </section>
          </div>
        </div>
      )}

      {!shouldShowShimmer && !shouldShowUnavailableMap && hasActiveSearch && (
        <div className="px-4 pt-4 pb-2 relative z-10 md:max-w-6xl md:mx-auto">
          <h3 className="text-lg font-[800] text-[#3e2723] dark:text-slate-100">
            Search results for "{searchQuery.trim()}"
          </h3>
        </div>
      )}

      {!shouldShowShimmer && !shouldShowUnavailableMap && hasActiveSearch && displayedBestSellers.length > 0 && (
        <div className="px-4 pt-2 pb-2 relative z-10 md:max-w-6xl md:mx-auto">
          <h4 className="text-base font-[800] text-[#3e2723] dark:text-slate-100 mb-3">Related Bestsellers</h4>
          <div className="grid grid-cols-3 gap-2.5">
            {displayedBestSellers.map((item, idx) => {
              const cardImages = Array.from({ length: 4 }).map(
                (_, imageIndex) => item.previewImages?.[imageIndex] || item.image
              );

              return (
                <button
                  type="button"
                  key={`search-bestseller-${item.id}-${idx}`}
                  className="p-2.5 bg-[#e9edf2] dark:bg-[#141f2e] rounded-[16px] border border-[#dde3ea] dark:border-[#24344c] shadow-sm dark:shadow-black/20 text-left active:scale-95 transition-transform"
                  onClick={() => handleBestSellerClick(item)}
                >
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    {cardImages.map((imageSrc, imageIdx) => (
                      <div
                        key={`${item.id}-search-${imageIdx}`}
                        className="h-10 rounded-[8px] bg-white dark:bg-[#0d1624] border border-[#eceff3] dark:border-[#2a3a51] overflow-hidden flex items-center justify-center p-1"
                      >
                        <img src={imageSrc} alt={item.name} loading="lazy" decoding="async" className="w-full h-full object-contain" />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 leading-none mb-1 text-center min-h-[10px]">
                    {item.countLabel || ""}
                  </p>
                  <p className="text-[13px] font-[700] text-[#2b2b2b] dark:text-slate-100 leading-[1.2] text-center line-clamp-2 min-h-[32px]">
                    {item.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!shouldShowShimmer && !shouldShowUnavailableMap && hasActiveSearch && displayedSearchProducts.length > 0 && (
        <div className="px-4 pt-2 pb-2 relative z-10 md:max-w-6xl md:mx-auto">
          <h4 className="text-base font-[800] text-[#3e2723] dark:text-slate-100 mb-3">Products</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {displayedSearchProducts.map((product) => {
              return (
                <div
                  key={`search-product-${product._id}`}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700/80 p-3 bg-white dark:bg-[#111a28] shadow-sm dark:shadow-black/20 text-left relative cursor-pointer"
                  onClick={() => handleProductCardClick(product)}
                >
                  <button
                    type="button"
                    className={`absolute top-2 right-2 z-20 w-7 h-7 rounded-full border flex items-center justify-center transition-all duration-300 ${isProductWishlisted(product)
                      ? "bg-pink-50 dark:bg-pink-500/15 border-pink-200 dark:border-pink-400/40 text-pink-500 shadow-sm"
                      : "bg-white/80 dark:bg-[#0e1624]/80 backdrop-blur-sm border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      }`}
                    onClick={(event) => toggleProductWishlist(product, event)}
                  >
                    <Heart
                      size={14}
                      className={isProductWishlisted(product) ? "fill-current" : ""}
                      strokeWidth={isProductWishlisted(product) ? 2.5 : 2}
                    />
                  </button>
                  <div className="w-full aspect-square bg-slate-50 dark:bg-[#0d1624] rounded-xl overflow-hidden mb-2 flex items-center justify-center">
                    <img
                      src={getProductImage(product)}
                      alt={product?.name || "Product"}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-contain scale-110"
                    />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">{product?.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{product?.unit || "Unit not specified"}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">Rs {Number(product?.sellingPrice || 0)}</p>
                </div>
              );
            })}
          </div>
          {visibleSearchProducts.length > displayedSearchProducts.length && (
            <div
              ref={searchProductsLoadMoreRef}
              aria-hidden="true"
              className="h-px w-full opacity-0 pointer-events-none"
            />
          )}
        </div>
      )}

      {!shouldShowShimmer && !shouldShowUnavailableMap && hasActiveSearch && !hasAnySearchMatch && (
        <div className="px-4 pt-4 pb-24 relative z-10 md:max-w-6xl md:mx-auto">
          <p className="text-sm text-slate-500 dark:text-slate-400">No matching results found.</p>
        </div>
      )}

      {!shouldShowShimmer && !shouldShowUnavailableMap && !hasActiveSearch && activeCategoryId === "all" && displayedHomepageCategorySections.map((category, sectionIndex) => (
        <div
          key={category._id || category.slug || category.name}
          className={`px-4 relative z-10 md:max-w-6xl md:mx-auto ${sectionIndex === displayedHomepageCategorySections.length - 1 ? "pb-8" : "pb-6"
            }`}
          style={{ contentVisibility: "auto", containIntrinsicSize: "520px" }}
        >
          <h3 className="text-lg font-[800] text-[#3e2723] dark:text-slate-100 mb-4">{category.name}</h3>
          {(!category.homepageCards || category.homepageCards.length === 0) && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">No products available.</p>
          )}
          <div className="grid grid-cols-4 md:grid-cols-5 gap-x-2 md:gap-x-4 gap-y-2 md:gap-y-4">
            {(category.homepageCards || []).map((card) => (
              <div
                key={card._id}
                className="col-span-1 flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform md:hover:-translate-y-1 duration-300"
                onClick={() => {
                  if (card.__kind === "product") {
                    const matchedProduct = allProducts.find(
                      (product) =>
                        String(product?._id || product?.id || "") ===
                        String(card.productId || "")
                    );

                    if (matchedProduct) {
                      handleProductCardClick(matchedProduct, category?._id || category?.slug || category?.name);
                      return;
                    }
                  }

                  if (card.targetSubcategoryId) {
                    openCollectionSheet({
                      categoryId: category?._id || category?.slug || category?.name,
                      subcategoryId: card.targetSubcategoryId,
                      title: category?.name || "Products",
                    });
                    return;
                  }

                  openCollectionSheet({
                    categoryId: category?._id || category?.slug || category?.name,
                    title: category?.name || "Products",
                  });
                }}
              >
                <div
                  className="w-full h-[88px] rounded-[18px] flex items-center justify-center p-2 shadow-sm border border-[#fef3c7] dark:border-[#29405e] overflow-hidden relative bg-[#fffbeb] dark:bg-[#101b2a]"
                >
                  <img
                    src={card.image || FALLBACK_IMAGE}
                    alt={card.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain transition-transform duration-300 drop-shadow-[0_12px_10px_rgba(0,0,0,0.22)] md:hover:scale-110"
                  />
                </div>
                <div className="h-7 flex items-start justify-center w-full">
                  <p className="text-[11px] font-[700] text-center text-[#2b2b2b] dark:text-slate-200 leading-tight px-0.5 line-clamp-2">
                    {card.name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!shouldShowShimmer && !shouldShowUnavailableMap && !hasActiveSearch && activeCategoryId === "all" && homepageCategoryDisplaySections.length > displayedHomepageCategorySections.length && (
        <div className="px-4 pb-4 relative z-10 md:max-w-6xl md:mx-auto">
          <div
            ref={homepageCategoryLoadMoreRef}
            aria-hidden="true"
            className="h-px w-full opacity-0 pointer-events-none"
          />
        </div>
      )}

      {!shouldShowShimmer && !shouldShowUnavailableMap && !hasActiveSearch && activeCategoryId === "all" && displayedBestSellerProductSections.length > 0 && (
        <div
          className="px-4 pb-24 relative z-10 md:max-w-6xl md:mx-auto space-y-6"
          style={{ contentVisibility: "auto", containIntrinsicSize: "640px" }}
        >
          {displayedBestSellerProductSections.map((section) => (
            <div key={section.id}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xl font-[800] text-[#1a1a1a] dark:text-slate-100">{section.name}</h3>
                <span className="text-sm font-bold text-[#2f8d2f] dark:text-emerald-300">see all</span>
              </div>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {section.products.map((product) => {
                  const productId = String(product?._id || product?.id || "");
                  const cartItemId = getGroceryCartItemId(product);
                  const cartItem = cartItemId ? getCartItem(cartItemId) : null;
                  const currentQty = Number(cartItem?.quantity || 0);
                  const alreadyInCart = currentQty > 0 || (cartItemId ? isInCart(cartItemId) : false);
                  return (
                    <div
                      key={`best-section-product-${section.id}-${productId}`}
                      className="min-w-[160px] max-w-[160px] rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#111a28] p-2.5 shadow-sm dark:shadow-black/20 cursor-pointer"
                      onClick={() => handleProductCardClick(product)}
                    >
                      <div className="w-full h-[96px] rounded-xl bg-slate-50 dark:bg-[#0d1624] overflow-hidden flex items-center justify-center mb-2">
                        <img
                          src={getProductImage(product)}
                          alt={product?.name || "Product"}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-300 mb-1">{deliveryEtaMinutes} MINS</p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 min-h-[36px]">
                        {product?.name || "Product"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{product?.unit || "1 unit"}</p>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Rs {Number(product?.sellingPrice || 0)}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 line-through">Rs {Number(product?.mrp || 0)}</p>
                        </div>
                        {alreadyInCart ? (
                          <div
                            className="flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-1 py-0.5 shadow-sm"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="w-5 h-5 flex items-center justify-center text-emerald-700"
                              onClick={(event) => {
                                event.stopPropagation();
                                updateQuantity(
                                  cartItemId,
                                  currentQty - 1,
                                  null,
                                  {
                                    id: cartItemId,
                                    name: product?.name || "Product",
                                    imageUrl: getProductImage(product),
                                    stockQuantity: product?.stockQuantity,
                                      inStock: product?.inStock,
                                      isActive: product?.isActive,
                                  },
                                );
                              }}
                            >
                              <Minus size={12} />
                            </button>
                            <span className="text-[11px] font-bold text-emerald-700 min-w-[14px] text-center">
                              {currentQty}
                            </span>
                            <button
                              type="button"
                              className="w-5 h-5 flex items-center justify-center text-emerald-700"
                              onClick={(event) => {
                                event.stopPropagation();
                                updateQuantity(
                                  cartItemId,
                                  currentQty + 1,
                                  null,
                                  {
                                    id: cartItemId,
                                    name: product?.name || "Product",
                                    imageUrl: getProductImage(product),
                                    stockQuantity: product?.stockQuantity,
                                      inStock: product?.inStock,
                                      isActive: product?.isActive,
                                  },
                                );
                              }}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="h-8 px-3 rounded-lg text-xs font-[900] border bg-white dark:bg-[#0f1b2c] text-[#2f8d2f] dark:text-emerald-300 border-[#79b879] dark:border-emerald-400/70"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleAddProductToCart(product, event);
                            }}
                          >
                            ADD
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {orderedBestSellerProductSections.length > displayedBestSellerProductSections.length && (
            <div
              ref={bestSellerSectionsLoadMoreRef}
              aria-hidden="true"
              className="h-px w-full opacity-0 pointer-events-none"
            />
          )}
        </div>
      )}

      {!shouldShowShimmer && !shouldShowUnavailableMap && hasMoreProducts && (
        <div ref={productPageLoadMoreRef} className="h-8 w-full" aria-hidden="true" />
      )}

      {/* --- 8. BOTTOM FLOATING OFFER --- */}
      {isOrderTrackerVisible && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="fixed left-3 right-3 bottom-24 z-[60] md:left-auto md:right-6 md:w-[390px]"
        >
          <div className="rounded-2xl border border-white/70 bg-gradient-to-r from-[#fff1eb] via-[#fff8ef] to-[#ffe7dc] shadow-[0_10px_35px_rgba(239,79,95,0.18)] backdrop-blur-sm overflow-hidden">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[#EF4F5F] text-white flex items-center justify-center">
                  <Bike size={14} />
                </div>
                <p className="text-[11px] font-black uppercase tracking-wide text-[#7b1f30]">Live Order Updates</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-1 rounded-full border font-bold ${activeOrderMeta.chipClass}`}>
                  {activeOrderMeta.label}
                </span>
                <button
                  type="button"
                  aria-label="Close order updates"
                  onClick={() => setDismissedOrderTrackerFor(activeOrderTrackerKey)}
                  className="w-6 h-6 rounded-full border border-[#efc5c9] bg-white/80 text-[#9a4b56] flex items-center justify-center hover:bg-white"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            <div className="px-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold text-[#6b4d46] mt-0.5">{activeOrderMeta.subtitle}</p>
                </div>
                <div className="flex items-center gap-1.5 text-[#a0464f] bg-white/70 border border-[#f3d4d8] rounded-full px-2 py-1">
                  <Timer size={12} />
                  <span className="text-[10px] font-bold">{activeOrderMeta.progress}%</span>
                </div>
              </div>

              <div className="mt-3 h-2 rounded-full bg-white/80 border border-[#f4d8dc] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${activeOrderMeta.progress}%` }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className={`h-full bg-gradient-to-r ${activeOrderMeta.barClass}`}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/orders/${activeGroceryOrder?.orderId || activeGroceryOrder?._id}`)}
                  className="h-10 rounded-xl bg-[#EF4F5F] hover:bg-[#db4252] text-white font-bold text-[12px] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <PackageCheck size={14} />
                  Track now
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/orders")}
                  className="h-10 rounded-xl bg-white border border-[#f0d0d4] text-[#8f2e3e] font-bold text-[12px] flex items-center justify-center gap-1.5"
                >
                  View orders
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* --- 6. BOTTOM NAVIGATION (Fixed) --- */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-[#0a121f]/95 backdrop-blur-md border-t border-slate-100 dark:border-white/10 z-50 w-full pb-4 shadow-[0_-8px_30px_rgba(2,6,23,0.08)] dark:shadow-[0_-12px_30px_rgba(0,0,0,0.5)]">
        <div className="md:max-w-6xl md:mx-auto w-full flex justify-between items-end py-2 px-6">
          <div
            className={`flex flex-col items-center gap-1 cursor-pointer ${isGroceryCategoriesRoute ? "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300" : ""}`}
            onClick={handleHomeNavClick}
          >
            <Home size={24} className={isGroceryCategoriesRoute ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-cyan-200 fill-current"} />
            <span className={`text-[10px] ${isGroceryCategoriesRoute ? "font-medium text-slate-400 dark:text-slate-500" : "font-bold text-slate-900 dark:text-cyan-100"}`}>Home</span>
            {!isGroceryCategoriesRoute && <div className="w-8 h-1 bg-slate-900 dark:bg-cyan-300 rounded-full mt-0.5"></div>}
          </div>

          <div
            className="flex flex-col items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            onClick={() => navigate("/plans")}
          >
            <ShoppingBag size={24} />
            <span className="text-[10px] font-medium">Plan</span>
          </div>

          <div
            className={`flex flex-col items-center gap-1 cursor-pointer ${isGroceryCategoriesRoute ? "text-slate-900 dark:text-cyan-100" : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"}`}
            onClick={handleCategoriesNavClick}
          >
            <LayoutGrid size={24} />
            <span className={`text-[10px] ${isGroceryCategoriesRoute ? "font-bold text-slate-900 dark:text-cyan-100" : "font-medium"}`}>Categories</span>
            {isGroceryCategoriesRoute && <div className="w-8 h-1 bg-slate-900 dark:bg-cyan-300 rounded-full mt-0.5"></div>}
          </div>

          <button
            className="mb-1 bg-[#EF4F5F] hover:bg-red-700 dark:bg-gradient-to-r dark:from-[#ef4f5f] dark:to-[#f97316] text-white px-6 py-2 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
            onClick={() => navigate("/home")}
          >
            <span className="font-black italic text-lg tracking-tighter">
              Mofood
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showCollectionSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCollectionSheet(false)}
              className="fixed inset-0 bg-black/45 z-[70] backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 24, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 h-[92vh] z-[80] w-full overscroll-contain touch-pan-y pointer-events-auto"
            >
              <button
                onClick={() => setShowCollectionSheet(false)}
                className="absolute -top-14 left-1/2 -translate-x-1/2 bg-[#1a1a1a] p-2.5 rounded-full shadow-lg border border-white/20 active:scale-95 transition-transform z-[90] flex items-center justify-center cursor-pointer"
              >
                <X size={22} className="text-white" strokeWidth={2.5} />
              </button>

              <div className="h-full min-h-0 bg-[#f4f5f7] dark:bg-[#0d1422] rounded-t-[22px] overflow-hidden shadow-2xl flex flex-col">
                <div className="w-full flex justify-center pt-3 pb-1">
                  <button
                    type="button"
                    aria-label="Drag to close"
                    onTouchStart={(event) => {
                      collectionHandleStartYRef.current = event.touches?.[0]?.clientY ?? null;
                    }}
                    onTouchEnd={(event) => {
                      const startY = collectionHandleStartYRef.current;
                      const endY = event.changedTouches?.[0]?.clientY ?? null;
                      collectionHandleStartYRef.current = null;
                      if (startY == null || endY == null) return;
                      if (endY - startY > 70) setShowCollectionSheet(false);
                    }}
                    className="w-16 h-5 flex items-center justify-center touch-none"
                  >
                    <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
                  </button>
                </div>

                <div className="px-3 pb-2 bg-white dark:bg-[#121b2b] border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 md:max-w-6xl md:mx-auto">
                    <button
                      type="button"
                      onClick={() => setShowCollectionSheet(false)}
                      className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#0c1422] dark:text-slate-200 flex items-center justify-center"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <div className="min-w-0">
                      <p className="text-[15px] font-extrabold text-slate-900 dark:text-slate-100 truncate">
                        {activeCollectionCategory?.name || (collectionCategoryId === "all" ? "All Categories" : collectionTitle)}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{collectionVisibleProducts.length} items</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#121b2b] border-b border-slate-200 dark:border-slate-700 px-2 py-2 overflow-x-auto no-scrollbar">
                  <div className="flex gap-2 min-w-max md:max-w-6xl md:mx-auto md:px-2">
                    {collectionCategoryTabs.map((tab) => (
                      <button
                        key={`collection-tab-${tab._id}`}
                        type="button"
                        className="min-w-[88px] flex-shrink-0 flex flex-col items-center gap-1"
                        onClick={() => {
                          setCollectionCategoryId(String(tab._id));
                          if (String(tab._id) === "all") {
                            setCollectionTitle("All Categories");
                          } else {
                            setCollectionTitle(tab.name || "Products");
                          }
                        }}
                      >
                        <div
                          className={`w-14 h-14 rounded-full border-2 p-1 overflow-hidden flex items-center justify-center ${String(collectionCategoryId || "all") === String(tab._id)
                            ? "border-[#facc15] dark:border-cyan-400/70 bg-[#fff8dd] dark:bg-[#142134]"
                            : "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-[#0f1828]"
                            }`}
                        >
                          <img src={tab.image || FALLBACK_IMAGE} alt={tab.name} className="w-full h-full object-contain" />
                        </div>
                        <span
                          className={`w-full px-0.5 text-[11px] leading-tight font-bold text-center line-clamp-2 ${String(collectionCategoryId || "all") === String(tab._id) ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"
                            }`}
                        >
                          {tab.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div data-sheet-scrollable="true" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-3 touch-auto [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
                  {collectionVisibleProducts.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 p-3 md:max-w-6xl md:mx-auto">No products available.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 md:max-w-6xl md:mx-auto pb-4">
                      {collectionVisibleProducts.map((product) => {
                        const productId = product?._id || product?.id;
                        const cartItemId = getGroceryCartItemId(product);
                        const cartItem = cartItemId ? getCartItem(cartItemId) : null;
                        const currentQty = Number(cartItem?.quantity || 0);
                        const alreadyInCart = currentQty > 0 || (cartItemId ? isInCart(cartItemId) : false);
                        const sellingPrice = Number(product?.sellingPrice || 0);
                        const mrp = Number(product?.mrp || 0);
                        const discountPercent = mrp > sellingPrice && mrp > 0
                          ? Math.max(1, Math.round(((mrp - sellingPrice) / mrp) * 100))
                          : 0;

                        return (
                          <div
                            key={`collection-product-${productId}`}
                            className="rounded-[16px] border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#111a28] shadow-sm dark:shadow-black/20 p-2 relative cursor-pointer md:hover:-translate-y-1 md:hover:shadow-md md:hover:border-slate-300 dark:md:hover:border-cyan-400/40 transition-all duration-300 group"
                            onClick={() => handleProductCardClick(product)}
                          >
                            {discountPercent > 0 && (
                              <span className="absolute top-2 left-2 z-10 bg-[#facc15] dark:bg-cyan-400 text-[10px] font-black text-slate-900 px-1.5 py-0.5 rounded">
                                {discountPercent}% OFF
                              </span>
                            )}
                            <button
                              type="button"
                              className={`absolute top-2 right-2 z-20 w-7 h-7 rounded-full border flex items-center justify-center transition-all duration-300 ${isProductWishlisted(product)
                                ? "bg-pink-50 dark:bg-pink-500/15 border-pink-200 dark:border-pink-400/40 text-pink-500 shadow-sm"
                                : "bg-white/80 dark:bg-[#0e1624]/80 backdrop-blur-sm border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                }`}
                              onClick={(event) => toggleProductWishlist(product, event)}
                            >
                              <Heart
                                size={14}
                                className={isProductWishlisted(product) ? "fill-current" : ""}
                                strokeWidth={isProductWishlisted(product) ? 2.5 : 2}
                              />
                            </button>

                            <div className="w-full h-[110px] rounded-xl bg-slate-50 dark:bg-[#0d1624] overflow-hidden flex items-center justify-center mb-2 md:group-hover:bg-slate-100/50 dark:md:group-hover:bg-[#13233a] transition-colors duration-300">
                              <img src={getProductImage(product)} alt={product?.name || "Product"} className="w-full h-full object-contain scale-110 md:group-hover:scale-115 transition-transform duration-500" />
                            </div>

                            <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100 leading-tight line-clamp-2 min-h-[34px]">
                              {product?.name || "Product"}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{product?.unit || "100 g"}</p>

                            <div className="mt-1.5 flex items-end justify-between gap-2">
                              <div>
                                <p className="text-[18px] leading-none font-black text-slate-900 dark:text-slate-100">Rs {sellingPrice}</p>
                                {mrp > sellingPrice && (
                                  <p className="text-[11px] text-slate-400 dark:text-slate-500 line-through">Rs {mrp}</p>
                                )}
                              </div>
                              {alreadyInCart ? (
                                <div
                                  className="flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-1 py-0.5 shadow-sm"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className="w-5 h-5 flex items-center justify-center text-emerald-700"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updateQuantity(
                                        cartItemId,
                                        currentQty - 1,
                                        null,
                                        {
                                          id: cartItemId,
                                          name: product?.name || "Product",
                                          imageUrl: getProductImage(product),
                                          stockQuantity: product?.stockQuantity,
                                      inStock: product?.inStock,
                                      isActive: product?.isActive,
                                        },
                                      );
                                    }}
                                  >
                                    <Minus size={12} />
                                  </button>
                                  <span className="text-[11px] font-bold text-emerald-700 min-w-[14px] text-center">
                                    {currentQty}
                                  </span>
                                  <button
                                    type="button"
                                    className="w-5 h-5 flex items-center justify-center text-emerald-700"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updateQuantity(
                                        cartItemId,
                                        currentQty + 1,
                                        null,
                                        {
                                          id: cartItemId,
                                          name: product?.name || "Product",
                                          imageUrl: getProductImage(product),
                                          stockQuantity: product?.stockQuantity,
                                      inStock: product?.inStock,
                                      isActive: product?.isActive,
                                        },
                                      );
                                    }}
                                  >
                                    <Plus size={12} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="h-7 px-3 rounded-md text-[11px] font-black border bg-white dark:bg-[#0f1b2c] text-slate-900 dark:text-slate-100 border-[#facd01] dark:border-cyan-400/70"
                                  onClick={(event) => handleAddProductToCart(product, event)}
                                >
                                  ADD
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWishlistSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWishlistSheet(false)}
              className="fixed inset-0 bg-black/45 z-[75] backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 24, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 h-[88vh] z-[85] w-full overscroll-contain touch-pan-y pointer-events-auto"
            >
              <div className="h-full min-h-0 bg-[#f4f5f7] dark:bg-[#0d1422] rounded-t-[22px] overflow-hidden shadow-2xl flex flex-col">
                <div className="w-full flex justify-center pt-3 pb-1">
                  <button
                    type="button"
                    aria-label="Drag to close"
                    onTouchStart={(event) => {
                      wishlistHandleStartYRef.current = event.touches?.[0]?.clientY ?? null;
                    }}
                    onTouchEnd={(event) => {
                      const startY = wishlistHandleStartYRef.current;
                      const endY = event.changedTouches?.[0]?.clientY ?? null;
                      wishlistHandleStartYRef.current = null;
                      if (startY == null || endY == null) return;
                      if (endY - startY > 70) setShowWishlistSheet(false);
                    }}
                    className="w-16 h-5 flex items-center justify-center touch-none"
                  >
                    <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
                  </button>
                </div>

                <div className="px-3 pb-2 bg-white dark:bg-[#121b2b] border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 md:max-w-6xl md:mx-auto">
                    <button
                      type="button"
                      onClick={() => setShowWishlistSheet(false)}
                      className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#0c1422] dark:text-slate-200 flex items-center justify-center"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <div className="min-w-0">
                      <p className="text-[15px] font-extrabold text-slate-900 dark:text-slate-100 truncate">Wishlisted Products</p>
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{groceryWishlistedProducts.length} items</p>
                    </div>
                  </div>
                </div>

                <div data-sheet-scrollable="true" className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 touch-auto [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
                  {groceryWishlistedProducts.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 p-3 md:max-w-6xl md:mx-auto">No wishlisted products yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 md:max-w-6xl md:mx-auto pb-4">
                      {groceryWishlistedProducts.map((product) => {
                        const productId = product?._id || product?.id;
                        const cartItemId = getGroceryCartItemId(product);
                        const cartItem = cartItemId ? getCartItem(cartItemId) : null;
                        const currentQty = Number(cartItem?.quantity || 0);
                        const alreadyInCart = currentQty > 0 || (cartItemId ? isInCart(cartItemId) : false);
                        const sellingPrice = Number(product?.sellingPrice || product?.price || 0);
                        const mrp = Number(product?.mrp || 0);

                        return (
                          <div
                            key={`wishlist-product-${productId}`}
                            className="rounded-[16px] border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#111a28] shadow-sm dark:shadow-black/20 p-2 relative cursor-pointer md:hover:-translate-y-1 md:hover:shadow-md md:hover:border-slate-300 dark:md:hover:border-cyan-400/40 transition-all duration-300 group"
                            onClick={() => handleProductCardClick(product)}
                          >
                            <button
                              type="button"
                              className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full border bg-pink-50 border-pink-200 text-pink-500 flex items-center justify-center shadow-sm"
                              onClick={(event) => toggleProductWishlist(product, event)}
                            >
                              <Heart size={14} className="fill-current" strokeWidth={2.5} />
                            </button>

                            <div className="w-full h-[110px] rounded-xl bg-slate-50 dark:bg-[#0d1624] overflow-hidden flex items-center justify-center mb-2 md:group-hover:bg-slate-100/50 dark:md:group-hover:bg-[#13233a] transition-colors duration-300">
                              <img src={getProductImage(product)} alt={product?.name || "Product"} className="w-full h-full object-contain scale-110 md:group-hover:scale-115 transition-transform duration-500" />
                            </div>

                            <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100 leading-tight line-clamp-2 min-h-[34px]">
                              {product?.name || "Product"}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{product?.unit || "100 g"}</p>

                            <div className="mt-1.5 flex items-end justify-between gap-2">
                              <div>
                                <p className="text-[18px] leading-none font-black text-slate-900 dark:text-slate-100">Rs {sellingPrice}</p>
                                {mrp > sellingPrice && (
                                  <p className="text-[11px] text-slate-400 dark:text-slate-500 line-through">Rs {mrp}</p>
                                )}
                              </div>
                              {alreadyInCart ? (
                                <div
                                  className="flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-1 py-0.5 shadow-sm"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className="w-5 h-5 flex items-center justify-center text-emerald-700"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updateQuantity(
                                        cartItemId,
                                        currentQty - 1,
                                        null,
                                        {
                                          id: cartItemId,
                                          name: product?.name || "Product",
                                          imageUrl: getProductImage(product),
                                          stockQuantity: product?.stockQuantity,
                                      inStock: product?.inStock,
                                      isActive: product?.isActive,
                                        },
                                      );
                                    }}
                                  >
                                    <Minus size={12} />
                                  </button>
                                  <span className="text-[11px] font-bold text-emerald-700 min-w-[14px] text-center">
                                    {currentQty}
                                  </span>
                                  <button
                                    type="button"
                                    className="w-5 h-5 flex items-center justify-center text-emerald-700"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updateQuantity(
                                        cartItemId,
                                        currentQty + 1,
                                        null,
                                        {
                                          id: cartItemId,
                                          name: product?.name || "Product",
                                          imageUrl: getProductImage(product),
                                          stockQuantity: product?.stockQuantity,
                                      inStock: product?.inStock,
                                      isActive: product?.isActive,
                                        },
                                      );
                                    }}
                                  >
                                    <Plus size={12} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="h-7 px-3 rounded-md text-[11px] font-black border bg-white dark:bg-[#0f1b2c] text-slate-900 dark:text-slate-100 border-[#facd01] dark:border-cyan-400/70"
                                  onClick={(event) => handleAddProductToCart(product, event)}
                                >
                                  ADD
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AddToCartAnimation
        bottomOffset={56}
        pillClassName="scale-105"
        linkTo="/grocery/cart"
        platform="mogrocery"
        hideOnPages={true}
      />

      <style>{`
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                @keyframes float {
                    0%, 100% { transform: translateY(-50%) rotate(-12deg); }
                    50% { transform: translateY(-60%) rotate(-10deg); }
                }
                @keyframes float-delayed {
                    0%, 100% { transform: translateY(-50%) rotate(12deg) scaleX(-1); }
                    50% { transform: translateY(-60%) rotate(10deg) scaleX(-1); }
                }
                .animate-float {
                    animation: float 4s ease-in-out infinite;
                }
                .animate-float-delayed {
                    animation: float-delayed 4s ease-in-out infinite 2s;
                }
                @keyframes slide-in-up {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-slide-in-up {
                    animation: slide-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .shimmer-bg {
                    background: linear-gradient(90deg, #e5e7eb 20%, #f3f4f6 50%, #e5e7eb 80%);
                    background-size: 200% 100%;
                    animation: shimmer 1.2s ease-in-out infinite;
                }
                .dark .shimmer-bg {
                    background: linear-gradient(90deg, #111827 20%, #1f2937 50%, #111827 80%);
                    background-size: 200% 100%;
                }
            `}</style>
      {/* --- BOTTOM SHEET MODAL --- */}
      <AnimatePresence>
        {showCategorySheet && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCategorySheet(false)}
              className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
            />

            {/* Sheet Container (Wrapper for Button + Content) */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-0 h-[100dvh] z-[60] w-full overscroll-contain touch-pan-y pointer-events-auto"
            >
              {/* Actual Sheet Content */}
              <div className="h-full min-h-0 bg-white overflow-hidden relative shadow-2xl">
                <div className="h-full min-h-0">
                  <CategoryFoodsContent
                    onClose={() => setShowCategorySheet(false)}
                    isModal={true}
                    initialCategory={selectedCategoryId}
                  />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GroceryPage;

