import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  ShoppingBag,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { toast } from "sonner";
import DeliveryScheduler from "@/components/DeliveryScheduler";
import { useCart } from "../../user/context/CartContext";
import api, { restaurantAPI } from "@/lib/api";
import { evaluateStoreAvailability } from "@/lib/utils/storeAvailability";
import {
  clearOrderEditSession,
  getOrderEditRemainingSeconds,
  getOrderEditSession,
} from "@/module/user/utils/orderEditSession";

export default function CartPage() {
  const navigate = useNavigate();
  const { cart, updateQuantity, removeFromCart, addToCart, getCartItem, isGroceryItem } = useCart();
  const [deliveryOptions, setDeliveryOptions] = useState({
    deliveryType: "now",
    deliveryDate: null,
    deliveryTimeSlot: null,
  });
  const [addons, setAddons] = useState([]);
  const [loadingAddons, setLoadingAddons] = useState(false);
  const [restaurantSchedule, setRestaurantSchedule] = useState(null);
  const [restaurantAvailability, setRestaurantAvailability] = useState({
    isAvailable: true,
    reason: "",
  });
  const [orderEditSession, setOrderEditSession] = useState(() => getOrderEditSession());
  const [editSecondsLeft, setEditSecondsLeft] = useState(() =>
    getOrderEditRemainingSeconds(getOrderEditSession()),
  );

  // Filter food items only (exclude grocery items)
  const cartItems = cart.filter((item) => !isGroceryItem(item));
  const restaurantId = cartItems[0]?.restaurantId || null;
  const restaurantName = cartItems[0]?.restaurant || "Restaurant";
  const isEditSessionActive =
    editSecondsLeft > 0 &&
    Boolean(orderEditSession?.orderRouteId) &&
    (!orderEditSession?.restaurantId ||
      String(orderEditSession.restaurantId) === String(restaurantId || ""));


  useEffect(() => {
    const tick = () => {
      const session = getOrderEditSession();
      const remaining = getOrderEditRemainingSeconds(session);
      if (remaining <= 0 && session) {
        clearOrderEditSession();
      }
      setOrderEditSession(remaining > 0 ? session : null);
      setEditSecondsLeft(remaining);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleQuantityChange = (id, change) => {
    const item = cartItems.find((i) => i.id === id);
    if (!item) return;
    const newQuantity = item.quantity + change;
    if (newQuantity <= 0) {
      removeFromCart(id);
    } else {
      updateQuantity(id, newQuantity);
    }
  };

  const calculateTotal = () => {
    return cartItems.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0,
    );
  };

  const cartTotal = calculateTotal();

  useEffect(() => {
    const fetchAddons = async () => {
      if (!restaurantId) {
        setAddons([]);
        return;
      }

      try {
        setLoadingAddons(true);
        const response = await restaurantAPI.getAddonsByRestaurantId(String(restaurantId));
        const list = response?.data?.data?.addons || response?.data?.addons || [];
        setAddons(Array.isArray(list) ? list : []);
      } catch {
        setAddons([]);
      } finally {
        setLoadingAddons(false);
      }
    };

    fetchAddons();
  }, [restaurantId]);

  useEffect(() => {
    const fetchRestaurantSchedule = async () => {
      if (!restaurantId) {
        setRestaurantSchedule(null);
        return;
      }

      try {
        const [restaurantResponse, outletTimingsResponse] = await Promise.all([
          restaurantAPI.getRestaurantById(String(restaurantId)),
          api.get(`/restaurant/${String(restaurantId)}/outlet-timings`),
        ]);

        const restaurant =
          restaurantResponse?.data?.data?.restaurant ||
          restaurantResponse?.data?.restaurant ||
          restaurantResponse?.data?.data ||
          null;

        const outletTimings =
          outletTimingsResponse?.data?.data?.outletTimings?.timings ||
          outletTimingsResponse?.data?.outletTimings?.timings ||
          [];

        const availability = evaluateStoreAvailability({
          store: restaurant || {},
          outletTimings,
          label: "Restaurant",
        });

        setRestaurantSchedule({
          deliveryTimings: restaurant?.deliveryTimings || null,
          openDays: Array.isArray(restaurant?.openDays) ? restaurant.openDays : [],
          outletTimings: Array.isArray(outletTimings) ? outletTimings : [],
        });
        setRestaurantAvailability(availability);
      } catch {
        setRestaurantSchedule(null);
        setRestaurantAvailability({
          isAvailable: false,
          reason: "Unable to verify restaurant availability right now.",
        });
      }
    };

    fetchRestaurantSchedule();
  }, [restaurantId]);

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      toast.error("Your cart is empty. Add items to proceed.");
      return;
    }

    if (deliveryOptions.deliveryType === "scheduled") {
      if (!deliveryOptions.deliveryDate || !deliveryOptions.deliveryTimeSlot) {
        toast.error("Please select a delivery date and time slot.");
        return;
      }
    }

    if (!restaurantAvailability.isAvailable) {
      toast.error(restaurantAvailability.reason || "Restaurant is offline. You cannot order right now.");
      return;
    }

    navigate("/checkout", {
      state: {
        ...deliveryOptions,
        items: cartItems,
        total: cartTotal,
        orderEditSession: isEditSessionActive ? orderEditSession : null,
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#f6e9dc]">
      {/* Header */}
      <div className="bg-white sticky top-0 z-50 rounded-b-3xl">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-800" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Cart</h1>
        </div>
      </div>

      {/* Empty Cart State */}
      {isEditSessionActive && (
        <div className="px-4 pt-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                Editing order #{orderEditSession?.orderRouteId}
              </p>
              <p className="text-sm font-semibold text-orange-900">
                Complete changes before timer ends
              </p>
            </div>
            <p className="text-lg font-extrabold text-orange-900 tabular-nums">
              {String(Math.floor(editSecondsLeft / 60)).padStart(2, "0")}:
              {String(editSecondsLeft % 60).padStart(2, "0")}
            </p>
          </div>
        </div>
      )}
      {cartItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <ShoppingBag className="w-16 h-16 text-gray-300 mb-4" />
          <h2 className="text-lg font-bold text-gray-700 mb-1">
            Your cart is empty
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Add items from a restaurant to get started
          </p>
          <Button
            className="bg-[#ff8100] hover:bg-[#e67300] text-white font-bold px-8 py-3 rounded-xl"
            onClick={() => navigate("/")}
          >
            Start Shopping
          </Button>
        </div>
      ) : (
        <>
          {/* Cart Items */}
          <div className="px-4 py-4 space-y-4">
            {cartItems.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl overflow-hidden shadow-sm"
              >
                <div className="flex gap-3 p-3">
                  {/* Food Image */}
                  <div className="flex-shrink-0">
                    <img
                      src={item.image || item.imageUrl}
                      alt={item.name}
                      className="w-20 h-20 rounded-lg object-cover"
                    />
                  </div>

                  {/* Food Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">
                      {item.name}
                    </h3>

                    {/* Restaurant Name */}
                    {item.restaurant && (
                      <div className="mb-2">
                        <span className="text-xs text-gray-500">
                          {item.restaurant}
                        </span>
                      </div>
                    )}

                    {/* Price and Quantity */}
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-gray-900">
                        ₹{(item.price || 0).toFixed(2)}
                      </span>

                      {/* Quantity Selector */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleQuantityChange(item.id, -1)}
                          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors"
                        >
                          <Minus className="w-4 h-4 text-gray-600" />
                        </button>
                        <span className="text-sm font-semibold text-gray-900 min-w-[30px] text-center">
                          {Number(item.quantity || 0)}
                        </span>
                        <button
                          onClick={() => handleQuantityChange(item.id, 1)}
                          className="w-8 h-8 rounded-full bg-[#ff8100] text-white flex items-center justify-center hover:bg-[#e67300] transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Complete your meal with add-ons */}
          {addons.length > 0 && (
            <div className="px-4 mb-4">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-orange-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Complete your meal</h3>
                </div>

                {loadingAddons ? (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {[1, 2, 3].map((placeholder) => (
                      <div
                        key={placeholder}
                        className="min-w-[170px] rounded-xl border border-gray-200 p-3 animate-pulse"
                      >
                        <div className="h-20 bg-gray-200 rounded-lg mb-2" />
                        <div className="h-3 bg-gray-200 rounded w-2/3 mb-2" />
                        <div className="h-3 bg-gray-200 rounded w-1/3" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {addons.map((addon) => {
                      const addonId = String(addon.id || addon._id || "");
                      const cartAddon = getCartItem(addonId);
                      const qty = Number(cartAddon?.quantity || 0);
                      const addonImage =
                        addon.image ||
                        (Array.isArray(addon.images) ? addon.images[0] : "") ||
                        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&h=200&fit=crop";

                      return (
                        <div
                          key={addonId}
                          className="min-w-[185px] rounded-xl border border-orange-100 bg-orange-50/40 p-2"
                        >
                          <img
                            src={addonImage}
                            alt={addon.name}
                            className="w-full h-24 rounded-lg object-cover"
                            onError={(event) => {
                              event.currentTarget.src =
                                "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&h=200&fit=crop";
                            }}
                          />
                          <div className="p-1.5">
                            <p className="text-sm font-semibold text-gray-900 line-clamp-1">{addon.name}</p>
                            <p className="text-xs text-gray-500 line-clamp-1">
                              {addon.description || "Popular add-on"}
                            </p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-sm font-bold text-gray-900">
                                ₹{Number(addon.price || 0).toFixed(0)}
                              </span>
                              {qty > 0 ? (
                                <div className="flex items-center gap-1 rounded-full border border-orange-300 bg-white px-1 py-0.5">
                                  <button
                                    onClick={() => updateQuantity(addonId, qty - 1)}
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-orange-600 hover:bg-orange-50"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="text-xs font-semibold w-5 text-center">{qty}</span>
                                  <button
                                    onClick={() => updateQuantity(addonId, qty + 1)}
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-orange-600 hover:bg-orange-50"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() =>
                                    addToCart({
                                      id: addonId,
                                      name: addon.name,
                                      price: Number(addon.price || 0),
                                      image: addonImage,
                                      description: addon.description || "",
                                      isVeg: true,
                                      restaurant: restaurantName,
                                      restaurantId,
                                    })
                                  }
                                  className="h-8 px-3 rounded-full bg-white border border-[#ff8100] text-[#ff8100] text-xs font-bold hover:bg-orange-50"
                                >
                                  ADD
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Delivery Scheduler */}
          <div className="px-4 mb-4">
            <DeliveryScheduler
              type="food"
              onScheduleChange={setDeliveryOptions}
              restaurantSchedule={restaurantSchedule}
            />
          </div>

          {/* Total Section */}
          <div className="px-4 mb-4">
            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">Total</span>
                <span className="text-xl font-bold text-[#ff8100]">
                  ₹{cartTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {!restaurantAvailability.isAvailable && (
            <div className="px-4 mb-4">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-semibold text-red-700">
                  {restaurantAvailability.reason || "Restaurant is offline. You cannot order right now."}
                </p>
              </div>
            </div>
          )}

          {/* Checkout Button */}
          <div className="px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6">
            <Button
              className="w-full bg-[#ff8100] hover:bg-[#e67300] text-white font-bold py-4 rounded-xl text-base"
              onClick={handleCheckout}
              disabled={!restaurantAvailability.isAvailable}
            >
              Checkout
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
