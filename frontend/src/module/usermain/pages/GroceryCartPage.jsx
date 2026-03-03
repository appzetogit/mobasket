import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  ChevronRight,
  Minus,
  Plus,
  ShoppingBag,
  ShieldCheck,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { useCart } from "../../user/context/CartContext";
import { adminAPI, orderAPI, restaurantAPI } from "@/lib/api";
import { useProfile } from "../../user/context/ProfileContext";
import { useZone } from "../../user/hooks/useZone";
import { evaluateStoreAvailability } from "@/lib/utils/storeAvailability";

const extractAddressCoordinates = (address) => {
  if (!address || typeof address !== "object") return null;

  const locationCoordinates = Array.isArray(address?.location?.coordinates)
    ? address.location.coordinates
    : null;
  const directCoordinates = Array.isArray(address?.coordinates) ? address.coordinates : null;

  const latitude = Number(
    address?.latitude ??
      address?.lat ??
      address?.location?.latitude ??
      address?.location?.lat ??
      (locationCoordinates ? locationCoordinates[1] : undefined) ??
      (directCoordinates ? directCoordinates[1] : undefined),
  );

  const longitude = Number(
    address?.longitude ??
      address?.lng ??
      address?.location?.longitude ??
      address?.location?.lng ??
      (locationCoordinates ? locationCoordinates[0] : undefined) ??
      (directCoordinates ? directCoordinates[0] : undefined),
  );

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
};

const GroceryCartPage = () => {
  const navigate = useNavigate();
  const { cart, updateQuantity, clearCart, isGroceryItem } = useCart();
  const { getDefaultAddress, addresses } = useProfile();
  const [feeSettings, setFeeSettings] = useState({
    deliveryFee: 25,
    freeDeliveryThreshold: 149,
    platformFee: 5,
    deliveryFeeRanges: [],
  });
  const [resolvedRestaurant, setResolvedRestaurant] = useState(null);
  const [calculatedPricing, setCalculatedPricing] = useState(null);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [hasActivePlanSubscription, setHasActivePlanSubscription] = useState(false);
  const [storeAvailability, setStoreAvailability] = useState({ isAvailable: true, reason: "" });
  const [checkingStoreAvailability, setCheckingStoreAvailability] = useState(false);

  // Filter grocery items (though CartContext usually keeps only one restaurant type)
  const groceryItems = cart.filter((item) => isGroceryItem(item));

  useEffect(() => {
    const fetchFeeSettings = async () => {
      try {
        const response = await adminAPI.getPublicFeeSettings("mogrocery");
        const settings = response?.data?.data?.feeSettings || response?.data?.feeSettings || {};
        setFeeSettings({
          deliveryFee: Number(settings.deliveryFee ?? 25),
          freeDeliveryThreshold: Number(settings.freeDeliveryThreshold ?? 149),
          platformFee: Number(settings.platformFee ?? 5),
          deliveryFeeRanges: Array.isArray(settings.deliveryFeeRanges) ? settings.deliveryFeeRanges : [],
        });
      } catch (error) {
        console.error("Failed to fetch grocery fee settings:", error);
      }
    };

    fetchFeeSettings();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchActivePlanStatus = async () => {
      try {
        const response = await orderAPI.getOrders({ page: 1, limit: 200 });
        const orders =
          response?.data?.data?.orders ||
          response?.data?.orders ||
          (Array.isArray(response?.data?.data) ? response.data.data : []);

        const now = new Date();
        const hasActive = (Array.isArray(orders) ? orders : []).some((order) => {
          if (!order?.planSubscription?.planId) return false;
          if (String(order?.payment?.status || "").toLowerCase() !== "completed") return false;
          if (String(order?.status || "").toLowerCase() === "cancelled") return false;

          const purchasedAt = order?.deliveredAt || order?.createdAt;
          const durationDays = Number(order?.planSubscription?.durationDays || 0);
          if (!purchasedAt || durationDays <= 0) return false;

          const expiresAt = new Date(new Date(purchasedAt).getTime() + durationDays * 24 * 60 * 60 * 1000);
          return expiresAt > now;
        });

        if (isMounted) {
          setHasActivePlanSubscription(hasActive);
        }
      } catch {
        if (isMounted) {
          setHasActivePlanSubscription(false);
        }
      }
    };

    fetchActivePlanStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const isCartEmpty = groceryItems.length === 0;

  const selectedAddress = useMemo(() => {
    const defaultAddress = getDefaultAddress?.();
    const defaultAddressId = String(defaultAddress?._id || defaultAddress?.id || "").trim();
    if (defaultAddressId && Array.isArray(addresses)) {
      const hydratedDefault = addresses.find(
        (address) => String(address?._id || address?.id || "").trim() === defaultAddressId,
      );
      if (hydratedDefault) {
        return hydratedDefault;
      }
    }
    if (defaultAddress) {
      return defaultAddress;
    }
    return null;
  }, [addresses, getDefaultAddress]);

  const normalizedSelectedAddress = useMemo(() => {
    if (!selectedAddress) return null;

    const coords = extractAddressCoordinates(selectedAddress);
    if (!coords) return selectedAddress;

    return {
      ...selectedAddress,
      latitude: coords.latitude,
      longitude: coords.longitude,
      lat: coords.latitude,
      lng: coords.longitude,
      location: {
        ...(selectedAddress.location || {}),
        type: "Point",
        coordinates: [coords.longitude, coords.latitude],
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
      coordinates: [coords.longitude, coords.latitude],
    };
  }, [selectedAddress]);

  const selectedAddressLocationForZone = useMemo(() => {
    return extractAddressCoordinates(normalizedSelectedAddress);
  }, [normalizedSelectedAddress]);

  const { zoneId } = useZone(selectedAddressLocationForZone, "mogrocery");
  const selectedAddressKey = useMemo(() => {
    if (!normalizedSelectedAddress) return "no-address";
    const coords = extractAddressCoordinates(normalizedSelectedAddress);
    return JSON.stringify({
      label: normalizedSelectedAddress?.label || "",
      street: normalizedSelectedAddress?.street || normalizedSelectedAddress?.addressLine1 || "",
      city: normalizedSelectedAddress?.city || "",
      state: normalizedSelectedAddress?.state || "",
      zip:
        normalizedSelectedAddress?.zipCode ||
        normalizedSelectedAddress?.postalCode ||
        normalizedSelectedAddress?.pincode ||
        "",
      lat: coords?.latitude || "",
      lng: coords?.longitude || "",
    });
  }, [normalizedSelectedAddress]);
  const groceryItemsKey = useMemo(
    () =>
      JSON.stringify(
        groceryItems.map((item) => ({
          id: String(item?.id || item?._id || ""),
          qty: Number(item?.quantity || 0),
          price: Number(item?.price || 0),
        })),
      ),
    [groceryItems],
  );
  const resolvedRestaurantId = String(resolvedRestaurant?.restaurantId || "");
  const cartStoreIdentities = useMemo(() => {
    const identities = [];
    const seen = new Set();

    groceryItems.forEach((item) => {
      const id = String(item?.restaurantId || item?.storeId || "").trim();
      const name = String(item?.restaurant || item?.storeName || "Unknown Store").trim();
      const key = id ? `id:${id}` : `name:${name.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        identities.push({ key, id, name });
      }
    });

    return identities;
  }, [groceryItems]);
  const hasMixedStoreItems = cartStoreIdentities.length > 1;
  const selectedStoreLabel =
    cartStoreIdentities[0]?.name ||
    String(resolvedRestaurant?.restaurantName || "").trim() ||
    "Unknown Store";

  // Calculate savings
  const itemsTotal = groceryItems.reduce(
    (sum, item) => sum + Number(item.mrp || item.price || 0) * Number(item.quantity || 0),
    0,
  );
  const subtotal = groceryItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0,
  );
  const totalSavings = itemsTotal - subtotal;

  const resolveGroceryRestaurant = async () => {
    if (hasMixedStoreItems) {
      throw new Error("Your cart has items from multiple stores. Keep items from one store only.");
    }

    if (resolvedRestaurant?.restaurantId) {
      return resolvedRestaurant;
    }

    const rawRestaurantId = groceryItems[0]?.restaurantId;
    const rawStoreId = groceryItems[0]?.storeId;
    const cartRestaurantId = String(
      rawRestaurantId?._id || rawRestaurantId?.id || rawRestaurantId || "",
    ).trim();
    const cartStoreId = String(
      rawStoreId?._id || rawStoreId?.id || rawStoreId || "",
    ).trim();
    const cartRestaurantName = groceryItems[0]?.restaurant || groceryItems[0]?.storeName || "MoGrocery";
    const cartRestaurantAddress =
      groceryItems[0]?.restaurantAddress ||
      groceryItems[0]?.storeAddress ||
      "";
    const cartRestaurantLocation =
      groceryItems[0]?.restaurantLocation ||
      groceryItems[0]?.storeLocation ||
      null;

    const resolvedId =
      cartRestaurantId && cartRestaurantId !== "grocery-store"
        ? cartRestaurantId
        : cartStoreId && cartStoreId !== "grocery-store"
          ? cartStoreId
          : "";

    if (resolvedId) {
      const resolved = {
        restaurantId: resolvedId,
        restaurantName: cartRestaurantName,
        restaurantAddress: cartRestaurantAddress,
        restaurantLocation: cartRestaurantLocation,
      };
      setResolvedRestaurant(resolved);
      return resolved;
    }

    throw new Error("Unable to resolve selected store. Please clear cart and add items again.");
  };

  const buildOrderItems = () =>
    groceryItems.reduce((acc, item) => {
      const candidates = [
        item?._id,
        item?.itemId,
        item?.productId,
        item?.id,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      const itemId = candidates.find((id) => /^[a-f\d]{24}$/i.test(id)) || "";
      if (!itemId) return acc;

      acc.push({
        itemId,
        storeId: String(
          item?.storeId?._id ||
            item?.storeId?.id ||
            item?.storeId ||
            item?.restaurantId?._id ||
            item?.restaurantId?.id ||
            item?.restaurantId ||
            resolvedRestaurant?.restaurantId ||
            "",
        ).trim(),
        restaurantId: String(
          item?.restaurantId?._id ||
            item?.restaurantId?.id ||
            item?.restaurantId ||
            item?.storeId?._id ||
            item?.storeId?.id ||
            item?.storeId ||
            resolvedRestaurant?.restaurantId ||
            "",
        ).trim(),
        name: item.name,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1),
        image: item.image || "",
        description: item.description || "",
        isVeg: item.isVeg !== false,
      });

      return acc;
    }, []);

  useEffect(() => {
    const resolveRestaurantForPreview = async () => {
      if (!groceryItems.length) {
        setResolvedRestaurant(null);
        return;
      }
      try {
        await resolveGroceryRestaurant();
      } catch (error) {
        console.error("Failed to resolve grocery store for cart pricing:", error);
      }
    };

    resolveRestaurantForPreview();
  }, [groceryItems, zoneId]);

  useEffect(() => {
    const calculatePricingPreview = async () => {
      if (!groceryItems.length || !normalizedSelectedAddress || !resolvedRestaurant?.restaurantId) {
        setCalculatedPricing(null);
        setLoadingPricing(false);
        return;
      }

      try {
        setLoadingPricing(true);
        const orderItems = buildOrderItems();
        if (!orderItems.length) {
          setCalculatedPricing(null);
          setLoadingPricing(false);
          return;
        }
        const response = await orderAPI.calculateOrder({
          items: orderItems,
          restaurantId: resolvedRestaurant.restaurantId,
          deliveryAddress: normalizedSelectedAddress,
          deliveryFleet: "standard",
          platform: "mogrocery",
          zoneId: zoneId || undefined,
        });
        setCalculatedPricing(response?.data?.data?.pricing || null);
      } catch (error) {
        console.error("Failed to calculate grocery cart pricing preview:", {
          status: error?.response?.status,
          message: error?.response?.data?.message || error?.message,
          data: error?.response?.data,
        });
        setCalculatedPricing(null);
      } finally {
        setLoadingPricing(false);
      }
    };

    calculatePricingPreview();
  }, [groceryItemsKey, selectedAddressKey, resolvedRestaurantId, zoneId, normalizedSelectedAddress]);

  useEffect(() => {
    let isMounted = true;

    const checkStoreAvailability = async () => {
      if (!resolvedRestaurant?.restaurantId) {
        if (isMounted) {
          setStoreAvailability({ isAvailable: true, reason: "" });
          setCheckingStoreAvailability(false);
        }
        return;
      }

      try {
        if (isMounted) setCheckingStoreAvailability(true);
        const response = await restaurantAPI.getRestaurantById(resolvedRestaurant.restaurantId);
        const restaurant =
          response?.data?.data?.restaurant ||
          response?.data?.restaurant ||
          response?.data?.data ||
          null;

        const availability = evaluateStoreAvailability({
          store: restaurant,
          label: "Store",
        });

        if (isMounted) {
          setStoreAvailability(availability);
        }
      } catch {
        // If availability can't be confirmed, keep checkout enabled to avoid blocking valid orders.
        if (isMounted) {
          setStoreAvailability({ isAvailable: true, reason: "" });
        }
      } finally {
        if (isMounted) {
          setCheckingStoreAvailability(false);
        }
      }
    };

    checkStoreAvailability();

    return () => {
      isMounted = false;
    };
  }, [resolvedRestaurant?.restaurantId]);

  const deliveryCharge = useMemo(() => {
    if (subtotal <= 0) return 0;

    const ranges = Array.isArray(feeSettings?.deliveryFeeRanges)
      ? [...feeSettings.deliveryFeeRanges].sort((a, b) => Number(a?.min || 0) - Number(b?.min || 0))
      : [];

    if (ranges.length > 0) {
      const matchedRange = ranges.find((range) => {
        const min = Number(range?.min ?? 0);
        const max = Number(range?.max ?? Number.MAX_SAFE_INTEGER);
        return subtotal >= min && subtotal <= max;
      });

      if (matchedRange) {
        return Math.max(0, Number(matchedRange?.fee ?? 0));
      }
    }

    const freeThreshold = Number(feeSettings?.freeDeliveryThreshold ?? 149);
    if (subtotal >= freeThreshold) return 0;

    return Math.max(0, Number(feeSettings?.deliveryFee ?? 25));
  }, [feeSettings, subtotal]);

  const platformFee = Math.max(0, Number(feeSettings?.platformFee ?? 5));
  const summaryDeliveryFee = Number(calculatedPricing?.deliveryFee ?? deliveryCharge);
  const summaryPlatformFee = Number(calculatedPricing?.platformFee ?? platformFee);
  const summaryTax = Number(calculatedPricing?.tax ?? 0);
  const summaryDiscount = Number(calculatedPricing?.discount ?? 0);
  const planDiscountAmount = Number(calculatedPricing?.breakdown?.planDiscountAmount ?? 0);
  const appliedPlanName = String(calculatedPricing?.appliedPlanBenefits?.planName || "").trim();
  const hasPlanDiscount = planDiscountAmount > 0;
  const isMoGoldPlanApplied = /mogold/i.test(appliedPlanName || "");
  const shouldShowPlanAnimation = hasActivePlanSubscription || isMoGoldPlanApplied;
  const grandTotal = Number(
    calculatedPricing?.total ??
      subtotal + summaryDeliveryFee + summaryPlatformFee + summaryTax - summaryDiscount,
  );
  const isStoreOffline = !storeAvailability.isAvailable;
  const shouldDisableOrderNow =
    checkingStoreAvailability ||
    isStoreOffline ||
    loadingPricing ||
    hasMixedStoreItems;

  const handleClearCart = () => {
    clearCart("mogrocery");
  };

  if (isCartEmpty) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col items-center justify-center p-6 pb-24">
        <div className="w-48 h-48 bg-gray-50 dark:bg-[#1a1a1a] rounded-full flex items-center justify-center mb-6">
          <ShoppingBag size={80} className="text-gray-200 dark:text-gray-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Your cart is empty</h2>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-8">
          Looks like you haven&apos;t added anything to your cart yet.
        </p>
        <button
          onClick={() => navigate("/grocery")}
          className="bg-[#facd01] text-gray-900 px-8 py-3 rounded-xl font-bold hover:bg-[#e6bc01] transition-colors"
        >
          Start Shopping
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fefce8] dark:bg-[#0a0a0a] pb-32">
      {/* Header */}
      <div className="bg-white dark:bg-[#111111] sticky top-0 z-50 px-4 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-[#1f1f1f] rounded-full transition-colors"
          >
            <X size={24} className="text-gray-800 dark:text-gray-100" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">My Cart</h1>
        </div>
        <button
          type="button"
          onClick={handleClearCart}
          className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded"
        >
          CLEAR CART
        </button>
      </div>

      <div className="max-w-md mx-auto">
        {/* Savings Banner */}
        {totalSavings > 0 && (
          <div className="bg-yellow-50 px-4 py-2 flex items-center justify-between mx-4 mt-4 rounded-lg border border-yellow-200">
            <span className="text-yellow-700 text-xs font-bold flex items-center gap-1">
              <ShieldCheck size={14} /> Your total savings
            </span>
            <span className="text-yellow-800 text-xs font-bold">Rs {totalSavings}</span>
          </div>
        )}

        <div className="bg-white dark:bg-[#1a1a1a] mx-4 mt-4 rounded-xl p-4 shadow-sm border border-yellow-50 dark:border-gray-800">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
            Selected Store
          </p>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-1">
            {selectedStoreLabel}
          </p>
          {hasMixedStoreItems && (
            <p className="text-[11px] text-rose-700 font-semibold mt-2">
              Cart contains products from multiple stores. Keep only one store to continue.
            </p>
          )}
        </div>

        {/* Item List */}
        <div className="bg-white dark:bg-[#1a1a1a] mx-4 mt-4 rounded-xl overflow-hidden shadow-sm border border-gray-50 dark:border-gray-800">
          {groceryItems.map((item) => (
            <div
              key={item.id}
              className="p-4 flex items-center gap-4 border-b border-gray-50 dark:border-gray-800 last:border-0"
            >
              <div className="w-16 h-16 flex-shrink-0 bg-gray-50 dark:bg-[#242424] rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-contain p-1"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight line-clamp-2">
                  {item.name}
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{item.weight || "1 unit"}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Rs {item.price}</span>
                  {item.mrp && item.mrp > item.price && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 line-through">Rs {item.mrp}</span>
                  )}
                </div>
              </div>

              {/* Quantity Controls */}
              <div className="flex items-center bg-[#facd01] text-gray-900 rounded-lg px-2 py-1.5 gap-3 shadow-sm border border-yellow-300">
                <button
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="p-0.5 hover:bg-black/5 rounded transition-colors"
                >
                  <Minus size={14} strokeWidth={3} />
                </button>
                <span className="text-xs font-bold min-w-[12px] text-center">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="p-0.5 hover:bg-black/5 rounded transition-colors"
                >
                  <Plus size={14} strokeWidth={3} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bill Details */}
        <div className="bg-white dark:bg-[#1a1a1a] mx-4 mt-4 rounded-xl p-4 shadow-sm border border-gray-50 dark:border-gray-800 mb-6">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Bill details</h2>
          {shouldShowPlanAnimation && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="relative overflow-hidden rounded-xl border border-yellow-200 bg-gradient-to-r from-yellow-50 via-amber-50 to-yellow-100 p-3 mb-3"
            >
              <motion.div
                aria-hidden
                className="absolute inset-y-0 -left-1/2 w-1/2 bg-white/35 blur-sm"
                animate={{ x: ["0%", "280%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <motion.div
                    animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.08, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1 }}
                    className="w-8 h-8 rounded-full bg-yellow-400/90 text-yellow-900 flex items-center justify-center shadow-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                  </motion.div>
                  <div>
                    <p className="text-[11px] font-black text-yellow-900 tracking-wide">MoGold Plan Applied</p>
                    <p className="text-[10px] text-yellow-800">Exclusive plan savings unlocked</p>
                  </div>
                </div>
                <motion.span
                  animate={{ scale: [1, 1.07, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.8 }}
                  className="text-sm font-black text-green-700"
                >
                  {hasPlanDiscount ? `-Rs ${planDiscountAmount.toFixed(2)}` : "Benefits Active"}
                </motion.span>
              </div>
            </motion.div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-gray-600">
                <span className="bg-gray-100 p-0.5 rounded text-[8px] border border-gray-200">BOX</span>
                Items total
                {totalSavings > 0 && (
                  <span className="text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded-full text-[9px] font-bold">
                    Saved Rs {totalSavings}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {itemsTotal > Number(subtotal || 0) && (
                  <span className="text-gray-400 line-through">Rs {itemsTotal}</span>
                )}
                <span className="font-bold text-gray-900 dark:text-gray-100">Rs {subtotal}</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-gray-600">
                Delivery charge
                <AlertCircle size={12} className="text-gray-400" />
              </div>
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {loadingPricing && !calculatedPricing
                  ? "Calculating..."
                  : summaryDeliveryFee > 0
                    ? `Rs ${summaryDeliveryFee}`
                    : "FREE"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-gray-600">
                Platform fee
                <AlertCircle size={12} className="text-gray-400" />
              </div>
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {loadingPricing && !calculatedPricing ? "Calculating..." : `Rs ${summaryPlatformFee}`}
              </span>
            </div>

            {hasPlanDiscount && (
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-green-700">
                  {appliedPlanName ? `${appliedPlanName} discount` : "Plan discount"}
                </div>
                <span className="font-bold text-green-700">
                  -Rs {planDiscountAmount.toFixed(2)}
                </span>
              </div>
            )}

            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Grand total</span>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Rs {grandTotal}</span>
            </div>
          </div>
        </div>

        {/* Savings banner at bottom */}
        {totalSavings > 0 && (
          <div className="bg-yellow-50 mx-4 mb-4 p-3 rounded-lg border border-dashed border-yellow-400 flex items-center justify-between">
            <span className="text-yellow-700 text-[10px] font-bold">Your total savings</span>
            <span className="text-yellow-800 text-[10px] font-bold">Rs {totalSavings}</span>
          </div>
        )}

        {/* Cancellation Policy */}
        <div className="bg-white dark:bg-[#1a1a1a] mx-4 mb-32 rounded-xl p-4 shadow-sm border border-gray-50 dark:border-gray-800">
          <h3 className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-2">Cancellation Policy</h3>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
            Orders cannot be cancelled once packed for delivery. In case of unexpected delays, a
            refund will be provided if applicable.
          </p>
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#111111] border-t border-gray-100 dark:border-gray-800 p-4 pb-6 z-[100] md:max-w-md md:mx-auto">
        {isStoreOffline && !checkingStoreAvailability && (
          <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
            {storeAvailability.reason || "Store is currently offline. Please try again later."}
          </div>
        )}
        {hasMixedStoreItems && (
          <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
            Multiple stores detected in cart. Remove items until all products are from one store.
          </div>
        )}
        <div
          className={`rounded-xl flex items-center justify-between px-4 py-3 shadow-lg transition-all overflow-hidden border ${
            shouldDisableOrderNow
              ? "bg-gray-200 border-gray-300 cursor-not-allowed"
              : "bg-[#facd01] border-yellow-400 active:scale-[0.98] cursor-pointer group"
          }`}
        >
          <div className="flex flex-col">
            <span className="text-gray-900 font-bold text-sm">Rs {grandTotal}</span>
            <span className="text-gray-700 text-[10px] uppercase font-bold tracking-wider">
              TOTAL
            </span>
          </div>
          <button
            type="button"
            disabled={shouldDisableOrderNow}
            className={`flex items-center gap-1 font-bold text-base ${
              shouldDisableOrderNow ? "text-gray-500 cursor-not-allowed" : "text-gray-900"
            }`}
            onClick={() => navigate("/grocery/checkout")}
          >
            {checkingStoreAvailability ? "Checking..." : "Order Now"} <ChevronRight size={20} />
          </button>

          {/* Subtle shine effect */}
          {!shouldDisableOrderNow && (
            <div className="absolute top-0 -left-[100%] w-[50%] h-full bg-white/30 skew-x-[-25deg] group-hover:left-[150%] transition-all duration-700"></div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroceryCartPage;
