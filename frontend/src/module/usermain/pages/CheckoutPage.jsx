import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  CreditCard,
  Smartphone,
  Clock,
  ShoppingBag,
  Home,
  Heart,
  Menu,
  ChefHat,
  Plus,
  Minus,
  Sparkles,
  LocateFixed,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AddressLocationPicker from "@/components/AddressLocationPicker";
import { toast } from "sonner";
import { useCart } from "../../user/context/CartContext";
import { useProfile } from "../../user/context/ProfileContext";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";
import api, { adminAPI, locationAPI, orderAPI, restaurantAPI, userAPI } from "@/lib/api";
import { initRazorpayPayment } from "@/lib/utils/razorpay";
import { Loader } from "@googlemaps/js-api-loader";
import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey";
import {
  clearOrderEditSession,
  getOrderEditRemainingSeconds,
  getOrderEditSession,
  saveOrderEditSession,
} from "@/module/user/utils/orderEditSession";
import { evaluateStoreAvailability } from "@/lib/utils/storeAvailability";
import { ensureAddressCoordinates } from "@/lib/utils/addressGeocoding";

export default function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart, clearCart, isGroceryItem, addToCart, updateQuantity, getCartItem } = useCart();
  const { getDefaultAddress, userProfile, addresses, addAddress } = useProfile();
  const { location: liveLocation } = useUserLocation();
  const { zoneId } = useZone(liveLocation, "mofood");

  const [paymentMethod, setPaymentMethod] = useState("card");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [addons, setAddons] = useState([]);
  const [loadingAddons, setLoadingAddons] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [showAllCoupons, setShowAllCoupons] = useState(false);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [calculatedPricing, setCalculatedPricing] = useState(null);
  const [feeSettings, setFeeSettings] = useState({
    deliveryFee: 25,
    deliveryFeeRanges: [],
    freeDeliveryThreshold: 149,
    platformFee: 5,
    gstRate: 5,
  });
  const [pendingOnlineOrder, setPendingOnlineOrder] = useState(null);
  const [restaurantAvailability, setRestaurantAvailability] = useState({
    isAvailable: true,
    reason: "",
  });
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [isDetectingAddress, setIsDetectingAddress] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(false);
  const [orderEditSession, setOrderEditSession] = useState(() => getOrderEditSession());
  const [editSecondsLeft, setEditSecondsLeft] = useState(() =>
    getOrderEditRemainingSeconds(getOrderEditSession()),
  );
  const [newAddress, setNewAddress] = useState({
    label: "Home",
    street: "",
    additionalDetails: "",
    city: "",
    state: "",
    zipCode: "",
    latitude: "",
    longitude: "",
    isDefault: false,
  });
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [loadingAddressSuggestions, setLoadingAddressSuggestions] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [googlePlacesReady, setGooglePlacesReady] = useState(false);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const suggestionsDebounceRef = useRef(null);
  const pricingPreviewSignatureRef = useRef(null);

  const deliveryType =
    location.state?.deliveryType === "scheduled" ? "scheduled" : "now";
  const deliveryDate = location.state?.deliveryDate
    ? new Date(location.state.deliveryDate)
    : null;
  const deliveryTimeSlot = location.state?.deliveryTimeSlot || null;

  const foodItems = useMemo(
    () => cart.filter((item) => !isGroceryItem(item)),
    [cart, isGroceryItem],
  );
  const restaurantId = foodItems[0]?.restaurantId || null;
  const restaurantName = foodItems[0]?.restaurant || "Restaurant";
  const isOrderEditMode =
    editSecondsLeft > 0 &&
    Boolean(orderEditSession?.orderRouteId) &&
    (!orderEditSession?.restaurantId ||
      String(orderEditSession.restaurantId) === String(restaurantId || ""));
  const hasSharedApp = Boolean(userProfile?.hasSharedApp || userProfile?.appSharedAt);

  useEffect(() => {
    const incomingSession = location.state?.orderEditSession;
    if (incomingSession?.orderRouteId) {
      const saved = saveOrderEditSession(incomingSession);
      setOrderEditSession(saved);
      setEditSecondsLeft(getOrderEditRemainingSeconds(saved));
      return;
    }

    const saved = getOrderEditSession();
    setOrderEditSession(saved);
    setEditSecondsLeft(getOrderEditRemainingSeconds(saved));
  }, [location.state]);

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

  useEffect(() => {
    const defaultAddress = getDefaultAddress();
    const selectedId = selectedAddress?.id || selectedAddress?._id;
    if (selectedId && Array.isArray(addresses) && addresses.length > 0) {
      const stillExists = addresses.find((a) => (a.id || a._id) === selectedId);
      if (stillExists) {
        setSelectedAddress(stillExists);
        return;
      }
    }

    if (defaultAddress) {
      setSelectedAddress(defaultAddress);
      return;
    }

    setSelectedAddress(null);
  }, [addresses, getDefaultAddress, selectedAddress]);

  const resetNewAddressForm = () => {
    setNewAddress({
      label: "Home",
      street: "",
      additionalDetails: "",
      city: "",
      state: "",
      zipCode: "",
      latitude: "",
      longitude: "",
      isDefault: false,
    });
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  };

  const parseAddressComponents = useCallback((components = []) => {
    const findByType = (type) =>
      components.find((component) => component?.types?.includes(type))?.long_name || "";

    const streetNumber = findByType("street_number");
    const route = findByType("route");
    const sublocality =
      findByType("sublocality_level_1") ||
      findByType("sublocality") ||
      findByType("neighborhood");
    const city =
      findByType("locality") ||
      findByType("administrative_area_level_2");
    const state = findByType("administrative_area_level_1");
    const zipCode = findByType("postal_code");

    return {
      street: [streetNumber, route].filter(Boolean).join(" ").trim(),
      additionalDetails: sublocality,
      city,
      state,
      zipCode,
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!showAddAddressForm) return undefined;
    if (autocompleteServiceRef.current && placesServiceRef.current) {
      setGooglePlacesReady(true);
      return undefined;
    }

    const initGooglePlaces = async () => {
      try {
        const apiKey = await getGoogleMapsApiKey();
        if (!apiKey || !isMounted) return;

        const loader = new Loader({
          apiKey,
          version: "weekly",
          libraries: ["places"],
        });
        const google = await loader.load();
        if (!isMounted) return;

        autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
        placesServiceRef.current = new google.maps.places.PlacesService(document.createElement("div"));
        setGooglePlacesReady(true);
      } catch (error) {
        console.error("Checkout address suggestions init failed:", error);
        if (isMounted) setGooglePlacesReady(false);
      }
    };

    initGooglePlaces();
    return () => {
      isMounted = false;
    };
  }, [showAddAddressForm]);

  const fetchAddressSuggestions = useCallback(
    (inputValue) => {
      const query = String(inputValue || "").trim();
      if (!query || query.length < 3 || !autocompleteServiceRef.current) {
        setAddressSuggestions([]);
        setLoadingAddressSuggestions(false);
        return;
      }

      setLoadingAddressSuggestions(true);
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: "in" },
          types: ["address"],
        },
        (predictions, status) => {
          const ok =
            status === window.google?.maps?.places?.PlacesServiceStatus?.OK ||
            status === "OK";
          setAddressSuggestions(ok && Array.isArray(predictions) ? predictions.slice(0, 6) : []);
          setLoadingAddressSuggestions(false);
        },
      );
    },
    [],
  );

  const handleStreetInputChange = (value) => {
    setNewAddress((prev) => ({ ...prev, street: value }));
    setShowAddressSuggestions(Boolean(value));

    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current);
    }
    suggestionsDebounceRef.current = setTimeout(() => {
      fetchAddressSuggestions(value);
    }, 220);
  };

  const handleAddressSuggestionSelect = useCallback(
    (suggestion) => {
      if (!suggestion?.place_id || !placesServiceRef.current) {
        setNewAddress((prev) => ({ ...prev, street: suggestion?.description || prev.street }));
        setShowAddressSuggestions(false);
        return;
      }

      placesServiceRef.current.getDetails(
        {
          placeId: suggestion.place_id,
          fields: ["formatted_address", "address_components", "geometry"],
        },
        (placeResult, status) => {
          const ok =
            status === window.google?.maps?.places?.PlacesServiceStatus?.OK ||
            status === "OK";
          if (!ok || !placeResult) {
            setNewAddress((prev) => ({ ...prev, street: suggestion.description || prev.street }));
            setShowAddressSuggestions(false);
            return;
          }

          const parsed = parseAddressComponents(placeResult.address_components || []);
          const lat = placeResult?.geometry?.location?.lat?.();
          const lng = placeResult?.geometry?.location?.lng?.();
          const formatted = String(placeResult.formatted_address || "");
          const fallbackStreet =
            parsed.street ||
            suggestion?.structured_formatting?.main_text ||
            suggestion.description;

          setNewAddress((prev) => ({
            ...prev,
            street: fallbackStreet || prev.street,
            additionalDetails: parsed.additionalDetails || prev.additionalDetails,
            city: parsed.city || prev.city,
            state: parsed.state || prev.state,
            zipCode: parsed.zipCode || prev.zipCode,
            latitude: Number.isFinite(lat) ? String(lat) : prev.latitude,
            longitude: Number.isFinite(lng) ? String(lng) : prev.longitude,
          }));

          if (formatted && !parsed.additionalDetails) {
            setNewAddress((prev) => ({
              ...prev,
              additionalDetails: prev.additionalDetails || formatted,
            }));
          }
          setShowAddressSuggestions(false);
        },
      );
    },
    [parseAddressComponents],
  );

  useEffect(() => {
    return () => {
      if (suggestionsDebounceRef.current) {
        clearTimeout(suggestionsDebounceRef.current);
      }
    };
  }, []);

  const formatAddressLine = (address) =>
    [
      address?.street,
      address?.additionalDetails,
      address?.city,
      address?.state,
      address?.zipCode,
    ]
      .filter(Boolean)
      .join(", ");

  const extractDetectedAddress = (response, latitude, longitude) => {
    const results = response?.data?.data?.results || [];
    const firstResult = results[0] || {};
    const components = firstResult?.address_components || {};

    const fromArray = Array.isArray(components)
      ? {
        city:
          components.find((c) => c.types?.includes("locality"))?.long_name ||
          components.find((c) => c.types?.includes("administrative_area_level_2"))?.long_name ||
          "",
        state:
          components.find((c) => c.types?.includes("administrative_area_level_1"))?.long_name ||
          "",
        zipCode:
          components.find((c) => c.types?.includes("postal_code"))?.long_name || "",
      }
      : {
        city: components.city || "",
        state: components.state || "",
        zipCode: components.zipCode || components.postal_code || "",
      };

    const formattedAddress = firstResult?.formatted_address || "";
    const pincodeFromText =
      formattedAddress.match(/\b\d{6}\b/)?.[0] ||
      response?.data?.data?.formattedAddress?.match(/\b\d{6}\b/)?.[0] ||
      "";
    const parts = formattedAddress.split(",").map((part) => part.trim()).filter(Boolean);

    return {
      street: firstResult?.street || parts[0] || "",
      additionalDetails:
        firstResult?.area ||
        firstResult?.sublocality ||
        firstResult?.neighborhood ||
        (parts.length > 1 ? parts.slice(1, Math.min(parts.length - 2, 3)).join(", ") : ""),
      city: fromArray.city,
      state: fromArray.state,
      zipCode: fromArray.zipCode || pincodeFromText,
      latitude: String(latitude),
      longitude: String(longitude),
    };
  };

  const handleDetectCurrentLocationForAddress = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported on this device.");
      return;
    }

    setIsDetectingAddress(true);
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("Unable to detect valid coordinates.");
      }

      const response = await locationAPI.reverseGeocode(latitude, longitude);
      const detected = extractDetectedAddress(response, latitude, longitude);
      setNewAddress((prev) => ({ ...prev, ...detected }));
      toast.success("Address auto-filled from current location.");
    } catch (error) {
      console.error("Checkout address detection failed:", error);
      toast.error("Unable to detect location. Fill address manually.");
    } finally {
      setIsDetectingAddress(false);
    }
  };

  const handleSaveNewAddress = async () => {
    const payload = {
      label: newAddress.label,
      street: String(newAddress.street || "").trim(),
      additionalDetails: String(newAddress.additionalDetails || "").trim(),
      city: String(newAddress.city || "").trim(),
      state: String(newAddress.state || "").trim(),
      zipCode: String(newAddress.zipCode || "").trim(),
      latitude: newAddress.latitude || undefined,
      longitude: newAddress.longitude || undefined,
      isDefault: Boolean(newAddress.isDefault),
    };

    if (!payload.street || !payload.city || !payload.state) {
      toast.error("Street, city and state are required.");
      return;
    }

    setIsSavingAddress(true);
    try {
      const created = await addAddress(payload);
      if (created) {
        setSelectedAddress(created);
      }
      setShowAddAddressForm(false);
      resetNewAddressForm();
      toast.success("Address added successfully.");
    } catch (error) {
      console.error("Add checkout address failed:", error);
      toast.error(error?.response?.data?.message || "Failed to add address.");
    } finally {
      setIsSavingAddress(false);
    }
  };

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
    const fetchAvailableCoupons = async () => {
      if (!restaurantId || foodItems.length === 0) {
        setAvailableCoupons([]);
        return;
      }

      try {
        setLoadingCoupons(true);
        const uniqueItemIds = Array.from(
          new Set(
            foodItems
              .map((item) => String(item.id || item._id || item.itemId || "").trim())
              .filter(Boolean),
          ),
        );

        const responses = await Promise.all(
          uniqueItemIds.map((itemId) =>
            restaurantAPI.getCouponsByItemIdPublic(String(restaurantId), itemId).catch(() => null),
          ),
        );

        const couponMap = new Map();
        responses.forEach((response) => {
          const coupons = response?.data?.data?.coupons || [];
          coupons.forEach((coupon) => {
            const customerGroup = String(coupon?.customerGroup || "all").toLowerCase();
            const isEligibleCustomerGroup =
              customerGroup === "all" || (customerGroup === "shared" && hasSharedApp);
            if (!isEligibleCustomerGroup) return;
            const code = String(coupon?.couponCode || "").trim().toUpperCase();
            if (!code || couponMap.has(code)) return;
            couponMap.set(code, {
              code,
              discountPercentage: Number(coupon?.discountPercentage || 0),
            });
          });
        });

        setAvailableCoupons(Array.from(couponMap.values()));
      } catch (error) {
        console.error("Failed to fetch available coupons:", error);
        setAvailableCoupons([]);
      } finally {
        setLoadingCoupons(false);
      }
    };

    fetchAvailableCoupons();
  }, [foodItems, hasSharedApp, restaurantId]);

  useEffect(() => {
    if (availableCoupons.length <= 4 && showAllCoupons) {
      setShowAllCoupons(false);
    }
  }, [availableCoupons, showAllCoupons]);

  useEffect(() => {
    const fetchPublicFeeSettings = async () => {
      try {
        const response = await adminAPI.getPublicFeeSettings("mofood");
        const settings = response?.data?.data?.feeSettings || response?.data?.feeSettings || {};
        setFeeSettings((prev) => ({
          ...prev,
          deliveryFee: Number(settings.deliveryFee ?? prev.deliveryFee),
          deliveryFeeRanges: Array.isArray(settings.deliveryFeeRanges)
            ? settings.deliveryFeeRanges
            : prev.deliveryFeeRanges,
          freeDeliveryThreshold: Number(
            settings.freeDeliveryThreshold ?? prev.freeDeliveryThreshold,
          ),
          platformFee: Number(settings.platformFee ?? prev.platformFee),
          gstRate: Number(settings.gstRate ?? prev.gstRate),
        }));
      } catch (error) {
        console.error("Failed to fetch public fee settings:", error);
      }
    };

    fetchPublicFeeSettings();
  }, []);

  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        setWalletLoading(true);
        const response = await userAPI.getWallet();
        const balance =
          response?.data?.data?.wallet?.balance ??
          response?.data?.wallet?.balance ??
          response?.data?.data?.balance ??
          0;
        setWalletBalance(Number(balance || 0));
      } catch (error) {
        console.error("Failed to fetch wallet balance:", error);
        setWalletBalance(0);
      } finally {
        setWalletLoading(false);
      }
    };

    fetchWalletBalance();
  }, []);

  useEffect(() => {
    const fetchRestaurantAvailability = async () => {
      if (!restaurantId || foodItems.length === 0) {
        setRestaurantAvailability({ isAvailable: true, reason: "" });
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
          {};

        const outletTimings =
          outletTimingsResponse?.data?.data?.outletTimings?.timings ||
          outletTimingsResponse?.data?.outletTimings?.timings ||
          [];

        setRestaurantAvailability(
          evaluateStoreAvailability({
            store: restaurant,
            outletTimings,
            label: "Restaurant",
          }),
        );
      } catch {
        setRestaurantAvailability({
          isAvailable: false,
          reason: "Unable to verify restaurant availability right now.",
        });
      }
    };

    fetchRestaurantAvailability();
  }, [foodItems.length, restaurantId]);

  useEffect(() => {
    const fetchPricingPreview = async () => {
      if (!restaurantId || foodItems.length === 0) {
        setCalculatedPricing(null);
        return;
      }

      try {
        const previewItems = foodItems.map((item) => ({
          itemId: String(item.itemId || item.id || item._id || ""),
          name: item.name,
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 1),
          image: item.image || item.imageUrl || "",
          description: item.description || "",
          isVeg: item.isVeg !== false,
        }));

        // Build a signature so we don't call the pricing API
        // multiple times for the same cart + address + coupon
        // (avoids duplicate calls from React StrictMode, etc.).
        const signatureBeforeGeocoding = buildPricingPreviewSignature({
          items: previewItems,
          restaurantId,
          address: selectedAddress || undefined,
          couponCode: appliedCouponCode || undefined,
        });
        if (pricingPreviewSignatureRef.current === signatureBeforeGeocoding) {
          return;
        }

        setLoadingPricing(true);

        // Ensure delivery address has valid coordinates so that
        // pricing preview matches the final order calculation
        // (zone-based free delivery, etc.).
        let addressForPricing = selectedAddress || undefined;
        if (addressForPricing) {
          try {
            const apiKey = await getGoogleMapsApiKey();
            if (apiKey) {
              const geocoded = await ensureAddressCoordinates(addressForPricing, apiKey);
              if (geocoded) {
                addressForPricing = geocoded;
              }
            }
          } catch (geoError) {
            console.error("Checkout pricing preview geocoding failed:", geoError);
          }
        }

        const response = await orderAPI.calculateOrder({
          items: previewItems,
          restaurantId,
          deliveryAddress: addressForPricing,
          couponCode: appliedCouponCode || undefined,
          deliveryFleet: "standard",
          platform: "mofood",
        });

        const pricing = response?.data?.data?.pricing || null;

        // Update signature only after a successful response so
        // future renders with the same inputs skip the API call.
        pricingPreviewSignatureRef.current = signatureBeforeGeocoding;
        setCalculatedPricing(pricing);
      } catch (error) {
        console.error("Failed to calculate pricing preview:", error);
        setCalculatedPricing(null);
      } finally {
        setLoadingPricing(false);
      }
    };

    fetchPricingPreview();
  }, [appliedCouponCode, foodItems, restaurantId, selectedAddress]);

  const getRangeBasedDeliveryFee = (subtotal, ranges = [], fallback = 25) => {
    if (!Array.isArray(ranges) || ranges.length === 0) return Number(fallback || 0);
    const sorted = [...ranges].sort((a, b) => Number(a.min || 0) - Number(b.min || 0));
    for (let i = 0; i < sorted.length; i += 1) {
      const range = sorted[i];
      const min = Number(range?.min ?? 0);
      const max = Number(range?.max ?? Number.MAX_SAFE_INTEGER);
      const fee = Number(range?.fee ?? fallback ?? 0);
      const isLast = i === sorted.length - 1;
      if ((isLast && subtotal >= min && subtotal <= max) || (!isLast && subtotal >= min && subtotal < max)) {
        return fee;
      }
    }
    return Number(fallback || 0);
  };

  const formatCurrency = (amount) => `\u20B9${Number(amount || 0).toFixed(2)}`;

  const orderSummary = useMemo(() => {
    const fallbackSubtotal = foodItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0,
    );
    const fallbackFreeDeliveryThreshold = Number(feeSettings?.freeDeliveryThreshold ?? 149);
    const fallbackDeliveryFeeConfigured = Number(feeSettings?.deliveryFee ?? 25);
    const fallbackPlatformFee = Number(feeSettings?.platformFee ?? 5);
    const fallbackTax = Math.round(
      Math.max(0, fallbackSubtotal) * (Number(feeSettings?.gstRate ?? 5) / 100),
    );
    const rangeDeliveryFee = getRangeBasedDeliveryFee(
      fallbackSubtotal,
      feeSettings?.deliveryFeeRanges,
      fallbackDeliveryFeeConfigured,
    );
    const fallbackDeliveryFee =
      (!feeSettings?.deliveryFeeRanges?.length &&
        fallbackFreeDeliveryThreshold > 0 &&
        fallbackSubtotal >= fallbackFreeDeliveryThreshold)
        ? 0
        : rangeDeliveryFee;

    const subtotal = Number(calculatedPricing?.subtotal ?? fallbackSubtotal);
    const deliveryFee = Number(calculatedPricing?.deliveryFee ?? fallbackDeliveryFee);
    const discount = Number(calculatedPricing?.discount ?? 0);
    const platformFee = Number(calculatedPricing?.platformFee ?? fallbackPlatformFee);
    const tax = Number(calculatedPricing?.tax ?? fallbackTax);
    const total = Number(
      calculatedPricing?.total ?? subtotal + deliveryFee + platformFee + tax - discount,
    );

    return {
      items: foodItems,
      subtotal,
      deliveryFee,
      discount,
      platformFee,
      tax,
      total,
      deliveryAddress:
        selectedAddress?.formattedAddress ||
        formatAddressLine(selectedAddress) ||
        "Select delivery address",
      estimatedTime: "30-40 min",
    };
  }, [calculatedPricing, feeSettings, foodItems, selectedAddress]);

  const hasSufficientWalletBalance = walletBalance >= orderSummary.total;
  const visibleCoupons = showAllCoupons ? availableCoupons : availableCoupons.slice(0, 4);

  const buildOrderItems = () =>
    foodItems.map((item) => ({
      itemId: String(item.itemId || item.id || item._id || ""),
      restaurantId: String(item.restaurantId || restaurantId || ""),
      name: item.name,
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 1),
      image: item.image || item.imageUrl || "",
      description: item.description || "",
      isVeg: item.isVeg !== false,
    }));

  const buildCartSignature = (items) =>
    (items || [])
      .map((item) => `${String(item.itemId)}:${Number(item.quantity || 0)}`)
      .sort()
      .join("|");

  const buildPricingPreviewSignature = ({
    items,
    restaurantId: signatureRestaurantId,
    address,
    couponCode,
  }) => {
    const itemsPart = (items || [])
      .map((item) =>
        `${String(item.itemId)}:${Number(item.quantity || 0)}:${Number(item.price || 0)}`,
      )
      .sort()
      .join("|");

    const addressPart = address
      ? [
          address.formattedAddress || "",
          address.street || "",
          address.city || "",
          address.state || "",
          address.zipCode || "",
          Array.isArray(address.location?.coordinates)
            ? String(address.location.coordinates[0] || "")
            : "",
          Array.isArray(address.location?.coordinates)
            ? String(address.location.coordinates[1] || "")
            : "",
        ].join("|")
      : "no-address";

    return [
      String(signatureRestaurantId || ""),
      String(couponCode || ""),
      itemsPart,
      addressPart,
    ].join("::");
  };

  const buildScheduledFor = () => {
    if (deliveryType !== "scheduled" || !deliveryDate || !deliveryTimeSlot) {
      return null;
    }

    const [slotStart] = String(deliveryTimeSlot).split("-");
    const [hours, minutes] = String(slotStart || "")
      .split(":")
      .map((value) => Number(value));

    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
      return null;
    }

    const scheduledAt = new Date(deliveryDate);
    if (Number.isNaN(scheduledAt.getTime())) return null;

    scheduledAt.setHours(hours, minutes, 0, 0);
    return scheduledAt;
  };

  const handleApplyCoupon = async (couponCodeValue = null) => {
    const normalizedCode = String(couponCodeValue ?? couponCodeInput)
      .trim()
      .toUpperCase();

    if (!normalizedCode) {
      toast.error("Enter a coupon code.");
      return;
    }

    if (!restaurantId || foodItems.length === 0) {
      toast.error("No eligible items for coupon.");
      return;
    }

    try {
      setCouponApplying(true);
      const items = buildOrderItems();
      const response = await orderAPI.calculateOrder({
        items,
        restaurantId,
        deliveryAddress: selectedAddress || undefined,
        couponCode: normalizedCode,
        deliveryFleet: "standard",
        platform: "mofood",
      });

      const pricing = response?.data?.data?.pricing || null;
      const appliedCode = String(pricing?.appliedCoupon?.code || "")
        .trim()
        .toUpperCase();

      if (appliedCode && appliedCode === normalizedCode) {
        setAppliedCouponCode(appliedCode);
        setCouponCodeInput(appliedCode);
        setCalculatedPricing(pricing);
        toast.success(`Coupon ${appliedCode} applied.`);
      } else {
        toast.error("Coupon is invalid or not eligible for this order.");
      }
    } catch (error) {
      console.error("Failed to apply coupon:", error);
      toast.error(error?.response?.data?.message || "Failed to apply coupon.");
    } finally {
      setCouponApplying(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCouponCode("");
    setCouponCodeInput("");
    toast.success("Coupon removed.");
  };

  const handleProceedToPayment = async () => {
    if (isPlacingOrder) return;

    if (foodItems.length === 0) {
      toast.error("Your cart is empty. Add items to proceed.");
      return;
    }

    if (isOrderEditMode) {
      if (!orderEditSession?.orderRouteId) {
        toast.error("Edit session not found.");
        clearOrderEditSession();
        return;
      }

      setIsPlacingOrder(true);
      try {
        const items = buildOrderItems();
        const invalidItem = items.find(
          (i) => !i.itemId || !i.name || !Number.isFinite(i.price) || i.quantity <= 0,
        );
        if (invalidItem) {
          throw new Error("Cart item data is invalid. Please refresh and try again.");
        }

        const response = await orderAPI.editOrderCart(orderEditSession.orderRouteId, items);
        if (!response?.data?.success) {
          throw new Error(response?.data?.message || "Failed to edit order.");
        }

        const responseData = response?.data?.data || {};
        const requiresAdditionalPayment = Boolean(responseData?.requiresAdditionalPayment);

        if (requiresAdditionalPayment) {
          const razorpay = responseData?.razorpay || {};
          const additionalAmount = Number(responseData?.additionalAmount || 0);

          if (!razorpay?.orderId || !razorpay?.key) {
            throw new Error("Additional payment initialization failed.");
          }

          await new Promise((resolve, reject) => {
            initRazorpayPayment({
              key: razorpay.key,
              amount: razorpay.amount,
              currency: razorpay.currency || "INR",
              order_id: razorpay.orderId,
              name: "MoBasket",
              description: `Additional payment for edited order ${orderEditSession.orderRouteId}`.trim(),
              prefill: {
                name: userProfile?.name || "",
                email: userProfile?.email || "",
                contact: (userProfile?.phone || "").replace(/\D/g, "").slice(-10),
              },
              notes: {
                orderId: String(orderEditSession.orderRouteId || ""),
                purpose: "order_edit_additional_payment",
              },
              handler: async (paymentResponse) => {
                try {
                  await orderAPI.verifyEditedOrderCartPayment(orderEditSession.orderRouteId, {
                    razorpayOrderId: paymentResponse.razorpay_order_id,
                    razorpayPaymentId: paymentResponse.razorpay_payment_id,
                    razorpaySignature: paymentResponse.razorpay_signature,
                  });
                  resolve();
                } catch (verifyError) {
                  reject(verifyError);
                }
              },
              onClose: () => reject(new Error("Payment cancelled")),
              onError: (paymentError) => reject(paymentError),
            });
          });

          toast.success(`Additional payment successful (${formatCurrency(additionalAmount)}). Order updated.`);
        } else {
          toast.success("Order updated successfully.");
        }

        clearCart("mofood");
        clearOrderEditSession();
        navigate(`/orders/${orderEditSession.orderRouteId}`);
      } catch (error) {
        const backendMessage = error?.response?.data?.message;
        const localMessage = error?.message;
        if (localMessage === "Payment cancelled") {
          toast.info("Payment cancelled. Edited items were not applied.");
        } else {
          toast.error(backendMessage || localMessage || "Failed to edit order.");
        }
      } finally {
        setIsPlacingOrder(false);
      }
      return;
    }

    const sanitizedPhone = String(userProfile?.phone || "").replace(/\D/g, "");
    if (!sanitizedPhone || sanitizedPhone.length < 10) {
      toast.error("Please add your phone number in profile before ordering.");
      navigate("/profile/edit");
      return;
    }

    if (!Array.isArray(addresses) || addresses.length === 0) {
      toast.error("Please add a saved address before ordering.");
      setShowAddAddressForm(true);
      return;
    }

    if (!selectedAddress) {
      toast.error("Please add/select a delivery address first.");
      return;
    }

    if (deliveryType === "scheduled") {
      const scheduledAt = buildScheduledFor();
      if (!scheduledAt) {
        toast.error("Please select a valid delivery date and time slot.");
        return;
      }
      if (scheduledAt.getTime() <= Date.now()) {
        toast.error("Scheduled delivery time must be in the future.");
        return;
      }
    }

    if (!restaurantId) {
      toast.error("Restaurant not found for cart items.");
      return;
    }

    if (!restaurantAvailability.isAvailable) {
      toast.error(
        restaurantAvailability.reason || "Restaurant is offline. You cannot order right now.",
      );
      return;
    }

    if (paymentMethod === "wallet") {
      if (walletLoading) {
        toast.info("Checking wallet balance. Please wait.");
        return;
      }
      if (!hasSufficientWalletBalance) {
        toast.error("Insufficient wallet balance. Add money or choose another payment method.");
        return;
      }
    }

    setIsPlacingOrder(true);
    try {
      const items = buildOrderItems();
      const currentCartSignature = buildCartSignature(items);
      const invalidItem = items.find(
        (i) => !i.itemId || !i.name || !Number.isFinite(i.price) || i.quantity <= 0,
      );
      if (invalidItem) {
        throw new Error("Cart item data is invalid. Please refresh and try again.");
      }

      // Geocode address if it's missing coordinates (do this early for pricing calculation)
      const apiKey = await getGoogleMapsApiKey();
      let addressForOrder = selectedAddress;
      
      const hasValidCoordinates = 
        (selectedAddress?.location?.coordinates && 
         Number.isFinite(selectedAddress.location.coordinates[1]) && 
         Number.isFinite(selectedAddress.location.coordinates[0]) &&
         !(selectedAddress.location.coordinates[0] === 0 && selectedAddress.location.coordinates[1] === 0)) ||
        (Number.isFinite(selectedAddress?.latitude) && Number.isFinite(selectedAddress?.longitude) &&
         !(selectedAddress.latitude === 0 && selectedAddress.longitude === 0));
      
      if (!hasValidCoordinates) {
        const geocodedAddress = await ensureAddressCoordinates(selectedAddress, apiKey);
        if (geocodedAddress?.latitude && geocodedAddress?.longitude) {
          addressForOrder = geocodedAddress;
        }
      }

      if (
        paymentMethod === "cash" &&
        pendingOnlineOrder?.id &&
        pendingOnlineOrder?.restaurantId === String(restaurantId) &&
        pendingOnlineOrder?.cartSignature === currentCartSignature
      ) {
        const switched = await orderAPI.switchOrderToCash(pendingOnlineOrder.id);
        const switchedOrder = switched?.data?.data?.order;
        if (switchedOrder?.orderId || switchedOrder?.id) {
          clearCart("mofood");
          setPendingOnlineOrder(null);
          toast.success("Payment mode changed to Cash on Delivery.");
          navigate(`/orders/${switchedOrder.orderId || switchedOrder.id}?confirmed=true`);
          return;
        }
      }

      const pricingResponse = await orderAPI.calculateOrder({
        items,
        restaurantId,
        deliveryAddress: addressForOrder,
        couponCode: appliedCouponCode || undefined,
        deliveryFleet: "standard",
        platform: "mofood",
      });
      const calculatedPricing = pricingResponse?.data?.data?.pricing;
      if (!calculatedPricing?.total) {
        throw new Error("Failed to calculate order pricing.");
      }

      // Double-check coordinates before creating order
      const finalAddress = await ensureAddressCoordinates(addressForOrder, apiKey);

      const backendPaymentMethod =
        paymentMethod === "cash"
          ? "cash"
          : paymentMethod === "wallet"
            ? "wallet"
            : paymentMethod === "upi"
              ? "razorpay"
              : "razorpay";

      const orderPayload = {
        items,
        address: finalAddress,
        restaurantId,
        restaurantName,
        pricing: calculatedPricing,
        deliveryFleet: "standard",
        note: "[MoFood] Order from user checkout",
        sendCutlery: false,
        paymentMethod: backendPaymentMethod,
        couponCode: appliedCouponCode || undefined,
        zoneId: zoneId || undefined,
        deliveryOption: deliveryType === "scheduled" ? "scheduled" : "now",
        scheduledFor:
          deliveryType === "scheduled" ? buildScheduledFor()?.toISOString() : undefined,
        deliveryTimeSlot: deliveryType === "scheduled" ? deliveryTimeSlot : undefined,
      };

      const orderResponse = await orderAPI.createOrder(orderPayload);
      const { order, razorpay } = orderResponse?.data?.data || {};
      const orderIdentifier = order?.orderId || order?.id;

      if (backendPaymentMethod === "cash" || backendPaymentMethod === "wallet") {
        clearCart("mofood");
        if (backendPaymentMethod === "wallet") {
          setWalletBalance((prev) => Math.max(0, prev - Number(calculatedPricing?.total || 0)));
        }
        toast.success("Order placed successfully.");
        navigate(`/orders/${orderIdentifier}?confirmed=true`);
        return;
      }

      if (!razorpay?.orderId || !razorpay?.key) {
        throw new Error("Online payment initialization failed.");
      }

      setPendingOnlineOrder({
        id: order?.id,
        orderId: order?.orderId,
        restaurantId: String(restaurantId || ""),
        cartSignature: currentCartSignature,
      });

      await new Promise((resolve, reject) => {
        initRazorpayPayment({
          key: razorpay.key,
          amount: razorpay.amount,
          currency: razorpay.currency,
          order_id: razorpay.orderId,
          name: "MoBasket MoFood",
          description: `Payment for order ${order?.orderId || ""}`.trim(),
          prefill: {
            name: userProfile?.name || "",
            email: userProfile?.email || "",
            contact: (userProfile?.phone || "").replace(/\D/g, "").slice(-10),
          },
          notes: {
            orderId: order?.orderId || order?.id || "",
          },
          handler: async (response) => {
            try {
              await orderAPI.verifyPayment({
                orderId: order?.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              clearCart("mofood");
              setPendingOnlineOrder(null);
              toast.success("Payment successful. Order confirmed.");
              navigate(`/orders/${orderIdentifier}?confirmed=true`);
              resolve();
            } catch (verifyError) {
              console.error("Payment verification failed:", verifyError);
              toast.error("Payment verification failed. Please contact support.");
              reject(verifyError);
            }
          },
          modal: {
            ondismiss: () => {
              toast.info("Payment cancelled.");
              reject(new Error("Payment cancelled"));
            },
          },
        });
      });
    } catch (error) {
      const isPaymentCancelled =
        String(error?.message || "").toLowerCase().includes("payment cancelled");
      console.error("Checkout order creation failed:", {
        message: error?.message,
        status: error?.response?.status,
        response: error?.response?.data,
      });
      if (!isPaymentCancelled) {
        toast.error(error?.response?.data?.message || error?.message || "Failed to place order");
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fff7ed] md:pt-20">
      <div className="bg-white/90 backdrop-blur sticky top-0 z-50 border-b border-orange-100 md:hidden">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-orange-50 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-800" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Checkout</h1>
        </div>
      </div>

      {/* Desktop Header/Headline */}
      <div className="hidden md:block max-w-[1100px] mx-auto w-full px-4 mt-4 mb-4">
        <div className="bg-white shadow-sm rounded-2xl py-4 px-4 flex items-center gap-4 border border-orange-100">
          <button
            onClick={() => navigate(-1)}
            className="p-1 hover:bg-orange-50 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-800" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 font-Inter">Checkout</h1>
        </div>
      </div>

      {isOrderEditMode && (
        <div className="max-w-[1100px] mx-auto w-full px-4 pt-4">
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                Editing order #{orderEditSession?.orderRouteId}
              </p>
              <p className="text-sm font-semibold text-orange-900">
                Add items before timer ends
              </p>
            </div>
            <p className="text-lg font-extrabold text-orange-900 tabular-nums">
              {String(Math.floor(editSecondsLeft / 60)).padStart(2, "0")}:
              {String(editSecondsLeft % 60).padStart(2, "0")}
            </p>
          </div>
        </div>
      )}

      <div className="max-w-[1100px] mx-auto w-full px-4 py-4">
        {!restaurantAvailability.isAvailable && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">
              {restaurantAvailability.reason || "Restaurant is offline. You cannot order right now."}
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100">
          <div className="flex items-start gap-3">
            <div className="bg-[#ff8100] rounded-xl p-2">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Delivery Address</h3>
              <p className="text-xs text-gray-600">{orderSummary.deliveryAddress}</p>
              <div className="mt-3 space-y-2">
                {Array.isArray(addresses) && addresses.length > 0 ? (
                  addresses.map((address) => {
                    const addressId = address.id || address._id;
                    const selectedId = selectedAddress?.id || selectedAddress?._id;
                    const isSelected = selectedId && addressId && String(selectedId) === String(addressId);
                    return (
                      <button
                        key={String(addressId)}
                        type="button"
                        onClick={() => setSelectedAddress(address)}
                        className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${isSelected
                            ? "border-[#ff8100] bg-orange-50"
                            : "border-gray-200 bg-white"
                          }`}
                      >
                        <p className="text-xs font-semibold text-gray-900">
                          {address.label || "Address"} {address.isDefault ? "(Default)" : ""}
                        </p>
                        <p className="text-xs text-gray-600">{formatAddressLine(address)}</p>
                      </button>
                    );
                  })
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowAddAddressForm((prev) => !prev)}
                  className="text-xs font-semibold text-[#ff8100]"
                >
                  {showAddAddressForm ? "Close Add Address" : "+ Add New Address"}
                </button>

                {showAddAddressForm ? (
                  <div className="rounded-xl border border-gray-200 p-3 space-y-2 bg-gray-50">
                    <div className="grid grid-cols-3 gap-2">
                      {["Home", "Office", "Other"].map((label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setNewAddress((prev) => ({ ...prev, label }))}
                          className={`h-8 rounded-lg text-xs font-semibold border ${newAddress.label === label
                              ? "border-[#ff8100] bg-orange-100 text-[#ff8100]"
                              : "border-gray-200 bg-white text-gray-700"
                            }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleDetectCurrentLocationForAddress}
                      disabled={isDetectingAddress}
                      className="h-8 w-full rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 flex items-center justify-center gap-1"
                    >
                      <LocateFixed className={`w-3.5 h-3.5 ${isDetectingAddress ? "animate-spin" : ""}`} />
                      {isDetectingAddress ? "Detecting..." : "Detect Current Location"}
                    </button>

                    <div className="relative">
                      <input
                        type="text"
                        value={newAddress.street}
                        onChange={(e) => handleStreetInputChange(e.target.value)}
                        onFocus={() => {
                          if (newAddress.street.trim().length >= 3) {
                            setShowAddressSuggestions(true);
                            fetchAddressSuggestions(newAddress.street);
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => setShowAddressSuggestions(false), 150);
                        }}
                        placeholder="Street / House No."
                        className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs"
                      />
                      {showAddressSuggestions && (
                        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                          {loadingAddressSuggestions ? (
                            <p className="px-3 py-2 text-xs text-gray-500">Loading suggestions...</p>
                          ) : addressSuggestions.length > 0 ? (
                            addressSuggestions.map((suggestion) => (
                              <button
                                key={suggestion.place_id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleAddressSuggestionSelect(suggestion)}
                                className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs text-gray-700 hover:bg-orange-50 last:border-b-0"
                              >
                                {suggestion.description}
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-2 text-xs text-gray-500">
                              {googlePlacesReady
                                ? "No address suggestions found."
                                : "Preparing suggestions..."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      value={newAddress.additionalDetails}
                      onChange={(e) =>
                        setNewAddress((prev) => ({ ...prev, additionalDetails: e.target.value }))
                      }
                      placeholder="Area / Landmark"
                      className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newAddress.city}
                        onChange={(e) => setNewAddress((prev) => ({ ...prev, city: e.target.value }))}
                        placeholder="City"
                        className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs"
                      />
                      <input
                        type="text"
                        value={newAddress.state}
                        onChange={(e) => setNewAddress((prev) => ({ ...prev, state: e.target.value }))}
                        placeholder="State"
                        className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs"
                      />
                    </div>
                    <input
                      type="text"
                      value={newAddress.zipCode}
                      onChange={(e) => setNewAddress((prev) => ({ ...prev, zipCode: e.target.value }))}
                      placeholder="Pincode"
                      className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs"
                    />

                    <AddressLocationPicker
                      value={newAddress}
                      onChange={setNewAddress}
                      title="Exact delivery location"
                      description="For family or out-of-station orders, drag the pin to the exact drop point before saving."
                    />

                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={newAddress.isDefault}
                        onChange={(e) =>
                          setNewAddress((prev) => ({ ...prev, isDefault: e.target.checked }))
                        }
                      />
                      Set as default
                    </label>

                    <Button
                      type="button"
                      className="w-full h-8 text-xs bg-[#ff8100] hover:bg-[#e67300] text-white"
                      onClick={handleSaveNewAddress}
                      disabled={isSavingAddress}
                    >
                      {isSavingAddress ? "Saving..." : "Save Address"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Order Items</h3>
          <div className="space-y-3">
            {orderSummary.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between pb-3 border-b border-gray-100 last:border-0 last:pb-0"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-500">Quantity: {item.quantity}</p>
                </div>
                <p className="text-sm font-bold text-gray-900">
                  ₹{(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Apply Coupon</h3>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={couponCodeInput}
              onChange={(event) => setCouponCodeInput(String(event.target.value || "").toUpperCase())}
              placeholder="Enter coupon code"
              className="h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm"
            />
            {appliedCouponCode ? (
              <Button
                type="button"
                onClick={handleRemoveCoupon}
                className="h-10 bg-gray-200 hover:bg-gray-300 text-gray-900 px-4"
              >
                Remove
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => handleApplyCoupon()}
                disabled={couponApplying}
                className="h-10 bg-[#ff8100] hover:bg-[#e67300] text-white px-4"
              >
                {couponApplying ? "Applying..." : "Apply"}
              </Button>
            )}
          </div>

          {appliedCouponCode ? (
            <p className="mt-2 text-xs font-medium text-green-600">
              Applied: {appliedCouponCode}
            </p>
          ) : null}

          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Available coupons
            </p>
            {loadingCoupons ? (
              <p className="text-xs text-gray-500">Loading coupons...</p>
            ) : availableCoupons.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {visibleCoupons.map((coupon) => (
                    <button
                      key={coupon.code}
                      type="button"
                      onClick={() => handleApplyCoupon(coupon.code)}
                      className="px-3 py-1.5 rounded-full border border-orange-200 bg-orange-50 text-xs font-semibold text-orange-700 hover:bg-orange-100"
                    >
                      {coupon.code}
                      {coupon.discountPercentage > 0 ? ` (${coupon.discountPercentage}% OFF)` : ""}
                    </button>
                  ))}
                </div>
                {availableCoupons.length > 4 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllCoupons((prev) => !prev)}
                    className="mt-2 text-xs font-semibold text-[#ff8100] hover:text-[#e67300]"
                  >
                    {showAllCoupons
                      ? "Show less"
                      : `Show all (${availableCoupons.length})`}
                  </button>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-gray-500">No coupons available for current cart items.</p>
            )}
          </div>
        </div>
      </div>

      {addons.length > 0 && (
        <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-orange-600" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">Complete your meal</h3>
            </div>

            {loadingAddons ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {[1, 2, 3].map((placeholder) => (
                  <div
                    key={placeholder}
                    className="min-w-[170px] rounded-2xl border border-gray-200 p-3 animate-pulse"
                  >
                    <div className="h-20 bg-gray-200 rounded-xl mb-2" />
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
                      className="min-w-[190px] rounded-2xl border border-orange-100 bg-gradient-to-b from-orange-50/60 to-white p-2"
                    >
                      <img
                        src={addonImage}
                        alt={addon.name}
                        className="w-full h-24 rounded-xl object-cover"
                        onError={(event) => {
                          event.currentTarget.src =
                            "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&h=200&fit=crop";
                        }}
                      />
                      <div className="p-1.5">
                        <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                          {addon.name}
                        </p>
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

      <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Order Summary</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900 font-medium">{formatCurrency(orderSummary.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Delivery Fee</span>
              <span className="text-gray-900 font-medium">
                {loadingPricing ? "Calculating..." : formatCurrency(orderSummary.deliveryFee)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Platform Fee</span>
              <span className="text-gray-900 font-medium">
                {loadingPricing ? "Calculating..." : formatCurrency(orderSummary.platformFee)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">GST & Taxes</span>
              <span className="text-gray-900 font-medium">
                {loadingPricing ? "Calculating..." : formatCurrency(orderSummary.tax)}
              </span>
            </div>
            {orderSummary.discount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-600">Discount</span>
                <span className="text-green-600 font-medium">-{formatCurrency(orderSummary.discount)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-[#ff8100]">{formatCurrency(orderSummary.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff8100] rounded-xl p-2">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-600">Estimated Delivery Time</p>
              <p className="text-sm font-bold text-gray-900">{orderSummary.estimatedTime}</p>
            </div>
          </div>
        </div>
      </div>

      {!isOrderEditMode && (
        <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Payment Method</h3>
            <div className="space-y-2">
              <button
                onClick={() => setPaymentMethod("card")}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${paymentMethod === "card"
                    ? "border-[#ff8100] bg-[#ff8100]/10"
                    : "border-gray-200 bg-white"
                  }`}
              >
                <CreditCard
                  className={`w-5 h-5 ${paymentMethod === "card" ? "text-[#ff8100]" : "text-gray-400"}`}
                />
                <span
                  className={`text-sm font-medium ${paymentMethod === "card" ? "text-[#ff8100]" : "text-gray-700"}`}
                >
                  Credit/Debit Card
                </span>
              </button>
              <button
                onClick={() => setPaymentMethod("wallet")}
                className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border-2 transition-colors ${paymentMethod === "wallet"
                    ? "border-[#ff8100] bg-[#ff8100]/10"
                    : "border-gray-200 bg-white"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Wallet
                    className={`w-5 h-5 ${paymentMethod === "wallet" ? "text-[#ff8100]" : "text-gray-400"}`}
                  />
                  <div className="text-left">
                    <span
                      className={`block text-sm font-medium ${paymentMethod === "wallet" ? "text-[#ff8100]" : "text-gray-700"}`}
                    >
                      MoBasket Wallet
                    </span>
                    <span className="block text-xs text-gray-500">
                      {walletLoading
                        ? "Checking balance..."
                        : `Available: ${formatCurrency(walletBalance)}`}
                    </span>
                  </div>
                </div>
                {!walletLoading && !hasSufficientWalletBalance && (
                  <span className="text-[11px] font-semibold text-red-500">Low balance</span>
                )}
              </button>
              <button
                onClick={() => setPaymentMethod("upi")}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${paymentMethod === "upi"
                    ? "border-[#ff8100] bg-[#ff8100]/10"
                    : "border-gray-200 bg-white"
                  }`}
              >
                <Smartphone
                  className={`w-5 h-5 ${paymentMethod === "upi" ? "text-[#ff8100]" : "text-gray-400"}`}
                />
                <span
                  className={`text-sm font-medium ${paymentMethod === "upi" ? "text-[#ff8100]" : "text-gray-700"}`}
                >
                  UPI (Razorpay)
                </span>
              </button>
              <button
                onClick={() => setPaymentMethod("cash")}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${paymentMethod === "cash"
                    ? "border-[#ff8100] bg-[#ff8100]/10"
                    : "border-gray-200 bg-white"
                  }`}
              >
                <ShoppingBag
                  className={`w-5 h-5 ${paymentMethod === "cash" ? "text-[#ff8100]" : "text-gray-400"}`}
                />
                <span
                  className={`text-sm font-medium ${paymentMethod === "cash" ? "text-[#ff8100]" : "text-gray-700"}`}
                >
                  Cash on Delivery
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1100px] mx-auto w-full px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6">
        <Button
          className="w-full bg-[#ff8100] hover:bg-[#e67300] text-white font-bold py-4 rounded-2xl text-base shadow-lg shadow-orange-200/70"
          onClick={handleProceedToPayment}
          disabled={
            isPlacingOrder ||
            !restaurantAvailability.isAvailable ||
            (paymentMethod === "wallet" && !walletLoading && !hasSufficientWalletBalance)
          }
        >
          {isPlacingOrder
            ? "Processing..."
            : isOrderEditMode
              ? "Save Changes"
              : paymentMethod === "cash"
                ? "Place Order"
                : paymentMethod === "wallet"
                  ? "Pay via Wallet"
                  : paymentMethod === "upi"
                    ? "Pay via UPI"
                    : "Proceed to Payment"}
        </Button>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="flex items-center justify-around py-2 px-4">
          <button
            onClick={() => navigate("/grocery")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600 hover:text-[#ff8100] transition-colors"
          >
            <Home className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium">Home</span>
          </button>
          <button
            onClick={() => navigate("/wishlist")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600 hover:text-[#ff8100] transition-colors"
          >
            <Heart className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium">Wishlist</span>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 -mt-8">
            <div className="bg-white rounded-full p-3 shadow-lg border-2 border-gray-200">
              <ChefHat className="w-6 h-6 text-gray-600" />
            </div>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 text-gray-600">
            <ShoppingBag className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium">Orders</span>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 text-gray-600">
            <Menu className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium">Menu</span>
          </button>
        </div>
      </div>
    </div>
  );
}


