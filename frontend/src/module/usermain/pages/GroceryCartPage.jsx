import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  ChevronRight,
  Minus,
  Plus,
  ShoppingBag,
  Clock,
  ShieldCheck,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { useCart } from "../../user/context/CartContext";
import { adminAPI, orderAPI } from "@/lib/api";
import { useProfile } from "../../user/context/ProfileContext";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";

const GroceryCartPage = () => {
  const navigate = useNavigate();
  const { cart, updateQuantity, clearCart, isGroceryItem } = useCart();
  const { getDefaultAddress } = useProfile();
  const { location: liveLocation } = useUserLocation();
  const { zoneId } = useZone(liveLocation, "mogrocery");
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
    if (defaultAddress) {
      return defaultAddress;
    }

    if (liveLocation?.latitude && liveLocation?.longitude) {
      return {
        label: "Home",
        street: liveLocation.street || liveLocation.address || "",
        additionalDetails: liveLocation.area || "",
        city: liveLocation.city || "",
        state: liveLocation.state || "",
        zipCode: liveLocation.postalCode || liveLocation.zipCode || "",
        formattedAddress: liveLocation.formattedAddress || liveLocation.address || "",
        location: {
          coordinates: [liveLocation.longitude, liveLocation.latitude],
        },
      };
    }

    return null;
  }, [getDefaultAddress, liveLocation]);

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
    if (resolvedRestaurant?.restaurantId) {
      return resolvedRestaurant;
    }

    const cartRestaurantId = groceryItems[0]?.restaurantId;
    const cartRestaurantName = groceryItems[0]?.restaurant || groceryItems[0]?.storeName || "MoGrocery";
    const cartRestaurantAddress =
      groceryItems[0]?.restaurantAddress ||
      groceryItems[0]?.storeAddress ||
      "";
    const cartRestaurantLocation =
      groceryItems[0]?.restaurantLocation ||
      groceryItems[0]?.storeLocation ||
      null;

    if (cartRestaurantId && cartRestaurantId !== "grocery-store") {
      const resolved = {
        restaurantId: cartRestaurantId,
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
    groceryItems.map((item) => ({
      itemId: String(item.id || item._id || item.itemId || item.productId || ""),
      name: item.name,
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 1),
      image: item.image || "",
      description: item.description || "",
      isVeg: item.isVeg !== false,
    }));

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
      if (!groceryItems.length || !selectedAddress || !resolvedRestaurant?.restaurantId) {
        setCalculatedPricing(null);
        setLoadingPricing(false);
        return;
      }

      try {
        setLoadingPricing(true);
        const response = await orderAPI.calculateOrder({
          items: buildOrderItems(),
          restaurantId: resolvedRestaurant.restaurantId,
          deliveryAddress: selectedAddress,
          deliveryFleet: "standard",
          platform: "mogrocery",
          zoneId: zoneId || undefined,
        });
        setCalculatedPricing(response?.data?.data?.pricing || null);
      } catch (error) {
        console.error("Failed to calculate grocery cart pricing preview:", error);
        setCalculatedPricing(null);
      } finally {
        setLoadingPricing(false);
      }
    };

    calculatePricingPreview();
  }, [groceryItems, selectedAddress, resolvedRestaurant, zoneId]);

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

        {/* Status Message */}
        <div className="bg-white dark:bg-[#1a1a1a] mx-4 mt-4 rounded-xl p-4 flex items-start gap-3 shadow-sm border border-yellow-50 dark:border-gray-800">
          <div className="bg-yellow-100 p-1.5 rounded-full">
            <Clock size={18} className="text-yellow-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">Delivery in 8 minutes</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Shipment of {groceryItems.length} items</p>
          </div>
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
        <div className="bg-[#facd01] rounded-xl flex items-center justify-between px-4 py-3 shadow-lg active:scale-[0.98] transition-all cursor-pointer overflow-hidden group border border-yellow-400">
          <div className="flex flex-col">
            <span className="text-gray-900 font-bold text-sm">Rs {grandTotal}</span>
            <span className="text-gray-700 text-[10px] uppercase font-bold tracking-wider">
              TOTAL
            </span>
          </div>
          <button
            className="flex items-center gap-1 text-gray-900 font-bold text-base"
            onClick={() => navigate("/grocery/checkout")}
          >
            Order Now <ChevronRight size={20} />
          </button>

          {/* Subtle shine effect */}
          <div className="absolute top-0 -left-[100%] w-[50%] h-full bg-white/30 skew-x-[-25deg] group-hover:left-[150%] transition-all duration-700"></div>
        </div>
      </div>
    </div>
  );
};

export default GroceryCartPage;
