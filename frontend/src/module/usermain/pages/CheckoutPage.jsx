import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  CreditCard,
  Smartphone,
  Clock,
  ShoppingBag,
  Plus,
  Minus,
  Sparkles,
  Wallet,
  User,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AddressLocationPicker from "@/components/AddressLocationPicker";
import { toast } from "sonner";
import { useCart } from "../../user/context/CartContext";
import { useProfile } from "../../user/context/ProfileContext";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";
import api, { adminAPI, locationAPI, orderAPI, restaurantAPI, userAPI, zoneAPI } from "@/lib/api";
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

const isMongoObjectId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || "").trim());
const MAX_SCHEDULE_ADVANCE_DAYS = 2;

export default function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart, clearCart, isGroceryItem, addToCart, updateQuantity, getCartItem } = useCart();
  const { getDefaultAddress, userProfile, addresses, addAddress } = useProfile();
  const { location: liveLocation } = useUserLocation();
  const { zoneId } = useZone(liveLocation, "mofood");

  const [paymentMethod, setPaymentMethod] = useState("card");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [postOrderRedirecting, setPostOrderRedirecting] = useState(false);
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
    minimumCodOrderValue: 0,
  });
  const [pendingOnlineOrder, setPendingOnlineOrder] = useState(null);
  const [restaurantAvailability, setRestaurantAvailability] = useState({
    isAvailable: true,
    reason: "",
  });
  const [availabilityRefreshKey, setAvailabilityRefreshKey] = useState(0);
  const [selectedAddress, setSelectedAddress] = useState(() => getDefaultAddress() || null);
  const [orderingForSomeoneElse, setOrderingForSomeoneElse] = useState(false);
  const [showRecipientMap, setShowRecipientMap] = useState(false);
  const [recipientDetails, setRecipientDetails] = useState({
    name: "",
    phone: "",
    street: "",
    additionalDetails: "",
    city: "",
    state: "",
    zipCode: "",
    latitude: "",
    longitude: "",
    formattedAddress: "",
  });
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
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
  const pricingPreviewCacheRef = useRef({ signature: null, pricing: null });
  const pricingPreviewInFlightSignatureRef = useRef(null);
  const recipientZoneCheckCacheRef = useRef({ key: null, inService: null });

  const normalizeEditPaymentMethod = useCallback((value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "cash" || normalized === "cod" || normalized === "cash_on_delivery") {
      return "cash";
    }
    if (normalized === "wallet") {
      return "wallet";
    }
    if (normalized === "upi") {
      return "upi";
    }
    if (normalized === "card") {
      return "card";
    }
    if (normalized === "razorpay") {
      return "card";
    }
    return "card";
  }, []);

  const getEditPaymentMethodLabel = useCallback((value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "cash" || normalized === "cod" || normalized === "cash_on_delivery") {
      return "Cash on Delivery";
    }
    if (normalized === "wallet") {
      return "MoBasket Wallet";
    }
    if (normalized === "upi") {
      return "UPI";
    }
    if (normalized === "card") {
      return "Credit/Debit Card";
    }
    if (normalized === "razorpay") {
      return "Online Payment";
    }
    return "Online Payment";
  }, []);

  const hasHydratedEditableAddress = useCallback((address) => {
    if (!address || typeof address !== "object") return false;
    return Boolean(
      String(address.formattedAddress || "").trim() ||
      String(address.street || "").trim() ||
      String(address.address || "").trim(),
    );
  }, []);

  const deliveryType =
    location.state?.deliveryType === "scheduled" ? "scheduled" : "now";
  const deliveryDate = location.state?.deliveryDate
    ? new Date(location.state.deliveryDate)
    : null;
  const deliveryTimeSlot = location.state?.deliveryTimeSlot || null;
  const maxScheduledAt = useMemo(() => {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    date.setDate(date.getDate() + MAX_SCHEDULE_ADVANCE_DAYS);
    return date;
  }, []);

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
  const hasLiveOrderEditSession =
    editSecondsLeft > 0 && Boolean(orderEditSession?.orderRouteId);
  const hasSharedApp = Boolean(userProfile?.hasSharedApp || userProfile?.appSharedAt);

  useEffect(() => {
    if (foodItems.length > 0) return;
    if (isPlacingOrder || postOrderRedirecting) return;
    if (hasLiveOrderEditSession && orderEditSession?.orderRouteId) {
      navigate(`/orders/${encodeURIComponent(String(orderEditSession.orderRouteId))}`, {
        replace: true,
      });
      return;
    }
    navigate("/cart", { replace: true });
  }, [
    foodItems.length,
    hasLiveOrderEditSession,
    isPlacingOrder,
    navigate,
    orderEditSession?.orderRouteId,
    postOrderRedirecting,
  ]);

  useEffect(() => {
    const incomingSession = location.state?.orderEditSession;
    if (incomingSession?.orderRouteId) {
      const saved = saveOrderEditSession(incomingSession);
      setOrderEditSession(saved);
      setEditSecondsLeft(getOrderEditRemainingSeconds(saved));
      setPaymentMethod(normalizeEditPaymentMethod(saved?.paymentMethod));
      setOrderingForSomeoneElse(Boolean(saved?.orderingForSomeoneElse));
      setRecipientDetails((prev) => ({
        ...prev,
        ...(saved?.recipientDetails || {}),
      }));
      if (hasHydratedEditableAddress(saved?.deliveryAddress)) {
        setSelectedAddress(saved.deliveryAddress);
      }
      return;
    }

    const saved = getOrderEditSession();
    setOrderEditSession(saved);
    setEditSecondsLeft(getOrderEditRemainingSeconds(saved));
    if (saved?.orderRouteId) {
      setPaymentMethod(normalizeEditPaymentMethod(saved?.paymentMethod));
      setOrderingForSomeoneElse(Boolean(saved?.orderingForSomeoneElse));
      setRecipientDetails((prev) => ({
        ...prev,
        ...(saved?.recipientDetails || {}),
      }));
    }
    if (hasHydratedEditableAddress(saved?.deliveryAddress)) {
      setSelectedAddress(saved.deliveryAddress);
    }
  }, [hasHydratedEditableAddress, location.state, normalizeEditPaymentMethod]);

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

    if (!selectedId && hasHydratedEditableAddress(selectedAddress)) {
      return;
    }

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
  }, [addresses, getDefaultAddress, hasHydratedEditableAddress, selectedAddress]);

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
    const premise = findByType("premise") || findByType("subpremise");
    const establishment = findByType("establishment");

    return {
      street: [streetNumber, route].filter(Boolean).join(" ").trim(),
      additionalDetails: sublocality,
      city,
      state,
      zipCode,
      premise,
      establishment,
    };
  }, []);

  const hasMeaningfulStreet = useCallback((value) => {
    const text = String(value || "").trim();
    if (!text) return false;
    const normalized = text.toLowerCase();
    if (text.includes(",")) return false;
    if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(text)) return false;
    if (!/[a-z]/i.test(text)) return false;
    const blocked = ["district", "state", "india"];
    if (blocked.some((token) => normalized.includes(token))) {
      return false;
    }
    return text.length >= 3;
  }, []);

  const resolveStreetForForm = useCallback((...candidates) => {
    const cleaned = candidates
      .map((candidate) => String(candidate || "").trim())
      .filter(Boolean);

    const strict = cleaned.find((candidate) => hasMeaningfulStreet(candidate));
    if (strict) return strict;

    const relaxed = cleaned.find((candidate) => {
      const lower = candidate.toLowerCase();
      if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(candidate)) return false;
      if (lower === "india") return false;
      if (lower.includes("district") || lower.includes("division") || lower.includes("zone")) return false;
      return true;
    });
    return relaxed || "";
  }, [hasMeaningfulStreet]);

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
          libraries: ["places", "geocoding"],
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
            street: resolveStreetForForm(fallbackStreet, prev.street),
            formattedAddress: formatted || prev.formattedAddress,
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
    [hasMeaningfulStreet, parseAddressComponents],
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

  const lockedEditAddressLine = useMemo(() => {
    if (!isOrderEditMode) return "";
    const editAddress = orderEditSession?.deliveryAddress || selectedAddress;
    return (
      String(editAddress?.formattedAddress || "").trim() ||
      formatAddressLine(editAddress) ||
      "Using the address from your original order"
    );
  }, [formatAddressLine, isOrderEditMode, orderEditSession?.deliveryAddress, selectedAddress]);

  const lockedEditPaymentLabel = useMemo(
    () => getEditPaymentMethodLabel(orderEditSession?.paymentMethod || paymentMethod),
    [getEditPaymentMethodLabel, orderEditSession?.paymentMethod, paymentMethod],
  );

  const hasValidAddressCoordinates = useCallback((address) => {
    const lng = Number(address?.location?.coordinates?.[0]);
    const lat = Number(address?.location?.coordinates?.[1]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0)
    ) {
      return true;
    }

    const flatLat = Number(address?.latitude);
    const flatLng = Number(address?.longitude);
    return (
      Number.isFinite(flatLat) &&
      Number.isFinite(flatLng) &&
      !(flatLat === 0 && flatLng === 0)
    );
  }, []);

  const pricingDeliveryAddress = useMemo(() => {
    if (!orderingForSomeoneElse) return selectedAddress || undefined;

    const lat = Number(recipientDetails?.latitude);
    const lng = Number(recipientDetails?.longitude);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    const street = String(recipientDetails?.street || "").trim();
    const city = String(recipientDetails?.city || "").trim();
    const state = String(recipientDetails?.state || "").trim();
    const zipCode = String(recipientDetails?.zipCode || "").trim();

    if (!street && !city && !state && !zipCode && !hasCoords) return undefined;

    return {
      label: "Recipient",
      street,
      additionalDetails: String(recipientDetails?.additionalDetails || "").trim(),
      city,
      state,
      zipCode,
      formattedAddress:
        String(recipientDetails?.formattedAddress || "").trim() ||
        [street, city, state, zipCode].filter(Boolean).join(", "),
      latitude: hasCoords ? lat : undefined,
      longitude: hasCoords ? lng : undefined,
      location: hasCoords
        ? {
            type: "Point",
            coordinates: [lng, lat],
          }
        : undefined,
    };
  }, [orderingForSomeoneElse, recipientDetails, selectedAddress]);

  const handleSaveNewAddress = async () => {
    const lat = Number(newAddress.latitude);
    const lng = Number(newAddress.longitude);
    const hasPinnedCoordinates = Number.isFinite(lat) && Number.isFinite(lng);

    if (!hasPinnedCoordinates) {
      toast.error("Please set the map pin before saving this address.");
      return;
    }

    let resolvedFromPin = null;
    try {
      const response = await locationAPI.reverseGeocode(lat, lng);
      const firstResult = response?.data?.data?.results?.[0] || {};
      const components = firstResult?.address_components || [];
      const byType = (type) =>
        Array.isArray(components)
          ? components.find((component) => component?.types?.includes(type))?.long_name || ""
          : "";

      const streetNumber = byType("street_number");
      const route = byType("route");
      const premise = byType("premise") || byType("subpremise");
      const sublocality =
        byType("sublocality_level_1") || byType("sublocality") || byType("neighborhood");
      const city = byType("locality") || byType("administrative_area_level_2");
      const state = byType("administrative_area_level_1");
      const zipCode = byType("postal_code");
      const formattedAddress = String(
        firstResult?.formatted_address || response?.data?.data?.formattedAddress || "",
      ).trim();

      const fallbackStreet = [streetNumber, route].filter(Boolean).join(" ").trim();
      const firstPart = formattedAddress.split(",").map((part) => part.trim()).filter(Boolean)[0] || "";

      resolvedFromPin = {
        street: resolveStreetForForm(fallbackStreet, route, premise, firstPart),
        additionalDetails: resolveStreetForForm(sublocality, premise, route, ""),
        city: String(city || "").trim(),
        state: String(state || "").trim(),
        zipCode: String(zipCode || "").trim(),
        formattedAddress,
      };
    } catch (error) {
      console.error("Reverse geocode before save failed:", error);
    }

    const payload = {
      label: newAddress.label,
      street: String(resolvedFromPin?.street || newAddress.street || "").trim(),
      additionalDetails: String(
        resolvedFromPin?.additionalDetails || newAddress.additionalDetails || "",
      ).trim(),
      city: String(resolvedFromPin?.city || newAddress.city || "").trim(),
      state: String(resolvedFromPin?.state || newAddress.state || "").trim(),
      zipCode: String(resolvedFromPin?.zipCode || newAddress.zipCode || "").trim(),
      latitude: String(lat),
      longitude: String(lng),
      isDefault: Boolean(newAddress.isDefault),
    };

    if (!payload.street || !payload.city || !payload.state) {
      toast.error("Pin moved, but full address is not resolved yet. Please wait a second and try again.");
      return;
    }

    if (resolvedFromPin) {
      setNewAddress((prev) => ({
        ...prev,
        ...resolvedFromPin,
        latitude: String(lat),
        longitude: String(lng),
      }));
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
          minimumCodOrderValue: Number(settings.minimumCodOrderValue ?? prev.minimumCodOrderValue ?? 0),
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
        const restaurantResponse = await restaurantAPI.getRestaurantById(String(restaurantId));

        const restaurant =
          restaurantResponse?.data?.data?.restaurant ||
          restaurantResponse?.data?.restaurant ||
          restaurantResponse?.data?.data ||
          {};

        const resolvedRestaurantMongoId = String(
          restaurant?._id || (isMongoObjectId(restaurantId) ? restaurantId : "")
        ).trim();

        const outletTimingsResponse = resolvedRestaurantMongoId
          ? await api
              .get(`/restaurant/${resolvedRestaurantMongoId}/outlet-timings`)
              .catch(() => null)
          : null;

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
        // Don't block checkout on transient verification API failures.
        // Backend order creation still enforces final availability checks.
        setRestaurantAvailability({
          isAvailable: true,
          reason: "",
        });
      }
    };

    fetchRestaurantAvailability();
  }, [foodItems.length, restaurantId, availabilityRefreshKey]);

  useEffect(() => {
    const refresh = () => setAvailabilityRefreshKey((prev) => prev + 1);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    const fetchPricingPreview = async () => {
      if (!restaurantId || foodItems.length === 0) {
        setLoadingPricing(false);
        setCalculatedPricing(null);
        return;
      }

      if (!pricingDeliveryAddress) {
        setLoadingPricing(false);
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
          address: pricingDeliveryAddress,
          couponCode: appliedCouponCode || undefined,
        });
        if (pricingPreviewCacheRef.current?.signature === signatureBeforeGeocoding) {
          setCalculatedPricing(pricingPreviewCacheRef.current?.pricing || null);
          setLoadingPricing(false);
          pricingPreviewSignatureRef.current = signatureBeforeGeocoding;
          return;
        }
        if (pricingPreviewInFlightSignatureRef.current === signatureBeforeGeocoding) {
          setLoadingPricing(true);
          return;
        }
        if (pricingPreviewSignatureRef.current === signatureBeforeGeocoding) {
          setLoadingPricing(false);
          return;
        }

        setLoadingPricing(true);
        pricingPreviewInFlightSignatureRef.current = signatureBeforeGeocoding;

        // Ensure delivery address has valid coordinates so that
        // pricing preview matches the final order calculation
        // (zone-based free delivery, etc.).
        let addressForPricing = pricingDeliveryAddress;
        if (addressForPricing) {
          try {
            if (!hasValidAddressCoordinates(addressForPricing)) {
              const apiKey = await getGoogleMapsApiKey();
              if (apiKey) {
                const geocoded = await ensureAddressCoordinates(addressForPricing, apiKey);
                if (geocoded) {
                  addressForPricing = geocoded;
                }
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
        pricingPreviewCacheRef.current = {
          signature: signatureBeforeGeocoding,
          pricing,
        };
        setCalculatedPricing(pricing);
      } catch (error) {
        console.error("Failed to calculate pricing preview:", error);
        setCalculatedPricing(null);
      } finally {
        pricingPreviewInFlightSignatureRef.current = null;
        setLoadingPricing(false);
      }
    };

    fetchPricingPreview();
  }, [
    appliedCouponCode,
    foodItems,
    restaurantId,
    pricingDeliveryAddress,
    hasValidAddressCoordinates,
  ]);

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
        orderingForSomeoneElse
          ? recipientDetails?.formattedAddress ||
          formatAddressLine(recipientDetails) ||
          "Add recipient address"
          : selectedAddress?.formattedAddress ||
          formatAddressLine(selectedAddress) ||
          "Select delivery address",
      estimatedTime: "30-40 min",
    };
  }, [calculatedPricing, feeSettings, foodItems, selectedAddress, orderingForSomeoneElse, recipientDetails]);

  const hasSufficientWalletBalance = walletBalance >= orderSummary.total;
  const minimumCodOrderValue = Math.max(0, Number(feeSettings.minimumCodOrderValue || 0));
  const isCodEligible = orderSummary.total >= minimumCodOrderValue;
  const visibleCoupons = showAllCoupons ? availableCoupons : availableCoupons.slice(0, 4);
  const hasRecipientCoordinates =
    Number.isFinite(Number(recipientDetails?.latitude)) &&
    Number.isFinite(Number(recipientDetails?.longitude));

  useEffect(() => {
    if (paymentMethod === "cash" && !isCodEligible) {
      setPaymentMethod("card");
    }
  }, [paymentMethod, isCodEligible]);

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
        String(address.latitude ?? ""),
        String(address.longitude ?? ""),
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
        deliveryAddress: pricingDeliveryAddress,
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
      if (hasLiveOrderEditSession && orderEditSession?.orderRouteId) {
        navigate(`/orders/${encodeURIComponent(String(orderEditSession.orderRouteId))}`, {
          replace: true,
        });
        return;
      }
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

        const trackingOrderId = String(orderEditSession.orderRouteId || "").trim();
        setPostOrderRedirecting(true);
        clearCart("mofood");
        clearOrderEditSession();
        navigate(`/orders/${encodeURIComponent(trackingOrderId)}`, { replace: true });
      } catch (error) {
        const backendMessage = error?.response?.data?.message;
        const localMessage = error?.message;
        if (localMessage === "Payment cancelled") {
          toast.info("Payment cancelled. Edited items were not applied.");
        } else {
          toast.error(backendMessage || localMessage || "Failed to edit order.");
        }
        setPostOrderRedirecting(false);
      } finally {
        setIsPlacingOrder(false);
      }
      return;
    }

    const sanitizedPhone = String(userProfile?.phone || "").replace(/\D/g, "");
    if (!sanitizedPhone || sanitizedPhone.length < 10) {
      toast.error("Please add your phone number in profile before ordering.");
      navigate("/profile/edit", {
        state: {
          returnTo: `${location.pathname}${location.search || ""}`,
        },
      });
      return;
    }

    if (!orderingForSomeoneElse && (!Array.isArray(addresses) || addresses.length === 0)) {
      toast.error("Please add a saved address before ordering.");
      setShowAddAddressForm(true);
      return;
    }

    if (!orderingForSomeoneElse && !selectedAddress) {
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
      if (scheduledAt.getTime() > maxScheduledAt.getTime()) {
        toast.error("Scheduled delivery can be set up to 2 days in advance only.");
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
    if (paymentMethod === "cash" && !isCodEligible) {
      toast.error(`COD is available on orders of Rs ${minimumCodOrderValue} and above.`);
      return;
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

      // Resolve delivery address (self or someone else) and geocode/validate coordinates
      const apiKey = await getGoogleMapsApiKey();
      let addressForOrder = selectedAddress;

      if (orderingForSomeoneElse) {
        const recipientName = String(recipientDetails?.name || "").trim();
        const recipientPhone = String(recipientDetails?.phone || "").trim();
        const phoneDigits = recipientPhone.replace(/\D/g, "");
        const street = String(recipientDetails?.street || "").trim();
        const city = String(recipientDetails?.city || "").trim();
        const state = String(recipientDetails?.state || "").trim();
        const zipCode = String(recipientDetails?.zipCode || "").trim();
        const lat = Number(recipientDetails?.latitude);
        const lng = Number(recipientDetails?.longitude);

        if (!recipientName || !recipientPhone || !street || !city || !state || !zipCode) {
          throw new Error("Please fill recipient name, phone and complete delivery address.");
        }
        if (phoneDigits.length !== 10) {
          throw new Error("Please enter a valid recipient phone number.");
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error("Please set recipient location pin before placing order.");
        }

        const zoneKey = `${lat.toFixed(5)}:${lng.toFixed(5)}`;
        let inService =
          recipientZoneCheckCacheRef.current?.key === zoneKey
            ? recipientZoneCheckCacheRef.current?.inService
            : null;

        if (inService == null) {
          const zoneCheckResponse = await zoneAPI.detectAllZones(lat, lng, "mofood");
          const zoneCheck = zoneCheckResponse?.data?.data;
          inService = Boolean(
            zoneCheckResponse?.data?.success && zoneCheck?.status === "IN_SERVICE",
          );
          recipientZoneCheckCacheRef.current = { key: zoneKey, inService };
        }

        if (!inService) {
          throw new Error("Recipient address is outside active delivery zones.");
        }

        addressForOrder = {
          label: "Recipient",
          street,
          additionalDetails: String(recipientDetails?.additionalDetails || "").trim(),
          city,
          state,
          zipCode,
          formattedAddress:
            String(recipientDetails?.formattedAddress || "").trim() ||
            [street, city, state, zipCode].filter(Boolean).join(", "),
          latitude: lat,
          longitude: lng,
        };
      }

      if (!hasValidAddressCoordinates(addressForOrder)) {
        const geocodedAddress = await ensureAddressCoordinates(addressForOrder, apiKey);
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

      const previewSignature = buildPricingPreviewSignature({
        items,
        restaurantId,
        address: addressForOrder,
        couponCode: appliedCouponCode || undefined,
      });
      let resolvedPricing =
        pricingPreviewCacheRef.current?.signature === previewSignature
          ? pricingPreviewCacheRef.current?.pricing
          : null;

      if (!resolvedPricing) {
        const pricingResponse = await orderAPI.calculateOrder({
          items,
          restaurantId,
          deliveryAddress: addressForOrder,
          couponCode: appliedCouponCode || undefined,
          deliveryFleet: "standard",
          platform: "mofood",
        });
        resolvedPricing = pricingResponse?.data?.data?.pricing;
      }
      if (!resolvedPricing?.total) {
        throw new Error("Failed to calculate order pricing.");
      }

      // Double-check coordinates before creating order
      let finalAddress = addressForOrder;
      if (!hasValidAddressCoordinates(finalAddress)) {
        finalAddress = await ensureAddressCoordinates(addressForOrder, apiKey);
      }

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
        pricing: resolvedPricing,
        deliveryFleet: "standard",
        note: orderingForSomeoneElse
          ? `[MoFood] Order for recipient: ${String(recipientDetails?.name || "").trim()} (${String(
            recipientDetails?.phone || "",
          ).trim()})`
          : "[MoFood] Order from user checkout",
        sendCutlery: false,
        paymentMethod: backendPaymentMethod,
        couponCode: appliedCouponCode || undefined,
        zoneId: orderingForSomeoneElse ? undefined : zoneId || undefined,
        deliveryOption: deliveryType === "scheduled" ? "scheduled" : "now",
        scheduledFor:
          deliveryType === "scheduled" ? buildScheduledFor()?.toISOString() : undefined,
        deliveryTimeSlot: deliveryType === "scheduled" ? deliveryTimeSlot : undefined,
      };

      const orderResponse = await orderAPI.createOrder(orderPayload);
      const { order, razorpay } = orderResponse?.data?.data || {};
      const orderIdentifier = String(order?.orderId || order?.id || order?._id || "").trim();

      if (backendPaymentMethod === "cash" || backendPaymentMethod === "wallet") {
        setPostOrderRedirecting(true);
        clearCart("mofood");
        if (backendPaymentMethod === "wallet") {
          setWalletBalance((prev) => Math.max(0, prev - Number(resolvedPricing?.total || 0)));
        }
        toast.success("Order placed successfully.");
        if (orderIdentifier) {
          navigate(`/orders/${encodeURIComponent(orderIdentifier)}?confirmed=true`, { replace: true });
        } else {
          navigate("/orders?confirmed=true", { replace: true });
        }
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
              const verifyResponse = await orderAPI.verifyPayment({
                orderId: order?.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              const verifiedOrder = verifyResponse?.data?.data?.order || null;
              const verifiedPayment = verifyResponse?.data?.data?.payment || null;
              const verifiedOrderStatus = String(verifiedOrder?.status || "").toLowerCase();
              const verifiedPaymentStatus = String(
                verifiedPayment?.status || verifiedOrder?.paymentStatus || "",
              ).toLowerCase();

              if (
                verifiedPaymentStatus !== "completed" ||
                !["confirmed", "scheduled"].includes(verifiedOrderStatus)
              ) {
                throw new Error("Payment is not fully confirmed yet.");
              }

              setPostOrderRedirecting(true);
              clearCart("mofood");
              setPendingOnlineOrder(null);
              toast.success("Payment successful. Order confirmed.");
              if (orderIdentifier) {
                navigate(`/orders/${encodeURIComponent(orderIdentifier)}?confirmed=true`, { replace: true });
              } else {
                navigate("/orders?confirmed=true", { replace: true });
              }
              resolve();
            } catch (verifyError) {
              console.error("Payment verification failed:", verifyError);
              toast.error("Payment verification failed. Please contact support.");
              reject(verifyError);
            }
          },
          onError: (paymentError) => {
            reject(
              new Error(
                paymentError?.description ||
                paymentError?.message ||
                "Payment failed.",
              ),
            );
          },
          onClose: () => {
            toast.info("Payment cancelled.");
            reject(new Error("Payment cancelled"));
          },
        }).catch(reject);
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

  const deliveryAddressSection = (
    <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-yellow-100 dark:bg-[#151a23] dark:border-white/10">
        <div className="flex items-start gap-3">
          <div className="bg-yellow-500 rounded-xl p-2">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-900 mb-1 dark:text-gray-100">Delivery Address</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">{orderSummary.deliveryAddress}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderingForSomeoneElse(false)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${!orderingForSomeoneElse
                    ? "border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-200"
                    : "border-gray-200 bg-white text-gray-700 dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-200"
                  }`}
              >
                For Me
              </button>
              <button
                type="button"
                onClick={() => setOrderingForSomeoneElse(true)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${orderingForSomeoneElse
                    ? "border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-200"
                    : "border-gray-200 bg-white text-gray-700 dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-200"
                  }`}
              >
                Order For Someone Else
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {orderingForSomeoneElse ? (
                <div className="rounded-xl border border-yellow-200 p-2.5 space-y-2 bg-yellow-50/60 dark:border-yellow-500/30 dark:bg-yellow-500/10">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <User className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={recipientDetails.name}
                        onChange={(e) =>
                          setRecipientDetails((prev) => ({ ...prev, name: e.target.value }))
                        }
                        placeholder="Recipient name"
                        className="h-8 w-full rounded-lg border border-gray-200 bg-white pl-7 pr-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={10}
                        value={recipientDetails.phone}
                        onChange={(e) =>
                          setRecipientDetails((prev) => ({
                            ...prev,
                            phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                          }))
                        }
                        placeholder="Recipient phone"
                        className="h-8 w-full rounded-lg border border-gray-200 bg-white pl-7 pr-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={recipientDetails.street}
                    onChange={(e) =>
                      setRecipientDetails((prev) => ({ ...prev, street: e.target.value }))
                    }
                    placeholder="Full address (House/Flat, Street)"
                    className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                  />
                  <input
                    type="text"
                    value={recipientDetails.additionalDetails}
                    onChange={(e) =>
                      setRecipientDetails((prev) => ({ ...prev, additionalDetails: e.target.value }))
                    }
                    placeholder="Landmark / Delivery note"
                    className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={recipientDetails.city}
                      onChange={(e) =>
                        setRecipientDetails((prev) => ({ ...prev, city: e.target.value }))
                      }
                      placeholder="City"
                      className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                    />
                    <input
                      type="text"
                      value={recipientDetails.state}
                      onChange={(e) =>
                        setRecipientDetails((prev) => ({ ...prev, state: e.target.value }))
                      }
                      placeholder="State"
                      className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={recipientDetails.zipCode}
                    onChange={(e) =>
                      setRecipientDetails((prev) => ({ ...prev, zipCode: e.target.value }))
                    }
                    placeholder="Pincode"
                    className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                  />
                  <div className="rounded-lg border border-yellow-200 bg-white p-2 dark:border-yellow-500/30 dark:bg-[#0f172a]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                        {hasRecipientCoordinates ? "Pin set for recipient address" : "Recipient pin not set"}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowRecipientMap((prev) => !prev)}
                        className="text-[11px] font-semibold text-yellow-700 hover:text-yellow-800 dark:text-yellow-300"
                      >
                        {showRecipientMap ? "Hide Map" : hasRecipientCoordinates ? "Update Pin" : "Set Pin"}
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      Address must be inside an active delivery zone.
                    </p>
                    {hasRecipientCoordinates ? (
                      <p className="mt-1 text-[11px] text-yellow-700 dark:text-yellow-300">
                        {Number(recipientDetails.latitude).toFixed(5)}, {Number(recipientDetails.longitude).toFixed(5)}
                      </p>
                    ) : null}
                  </div>

                  {showRecipientMap ? (
                    <AddressLocationPicker
                      value={recipientDetails}
                      onChange={setRecipientDetails}
                      fallbackLocation={liveLocation}
                      title="Recipient exact delivery pin"
                      description="Set exact pin. Address must be inside any active delivery zone."
                    />
                  ) : null}
                </div>
              ) : (
                <>
                  {Array.isArray(addresses) && addresses.length > 0 ? (
                    addresses.map((address) => {
                      const addressId = address.id || address._id;
                      const selectedId = selectedAddress?.id || selectedAddress?._id;
                      const isSelected =
                        selectedId && addressId && String(selectedId) === String(addressId);
                      return (
                        <button
                          key={String(addressId)}
                          type="button"
                          onClick={() => setSelectedAddress(address)}
                          className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${isSelected
                              ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-500/10"
                              : "border-gray-200 bg-white hover:border-yellow-300 dark:border-white/10 dark:bg-[#0f172a] dark:hover:border-yellow-500/60"
                            }`}
                        >
                          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                            {address.label || "Address"} {address.isDefault ? "(Default)" : ""}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{formatAddressLine(address)}</p>
                        </button>
                      );
                    })
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setShowAddAddressForm((prev) => !prev)}
                    className="text-xs font-semibold text-yellow-700 dark:text-yellow-300"
                  >
                    {showAddAddressForm ? "Close Add Address" : "+ Add New Address"}
                  </button>

                  {showAddAddressForm ? (
                    <div className="rounded-xl border border-gray-200 p-3 space-y-2 bg-gray-50 dark:border-white/10 dark:bg-[#0f172a]">
                      <div className="grid grid-cols-3 gap-2">
                        {["Home", "Office", "Other"].map((label) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setNewAddress((prev) => ({ ...prev, label }))}
                            className={`h-8 rounded-lg text-xs font-semibold border ${newAddress.label === label
                              ? "border-yellow-500 bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-200"
                              : "border-gray-200 bg-white text-gray-700 dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-200"
                              }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

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
                          className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                        />
                        {showAddressSuggestions && (
                          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#0f172a]">
                            {loadingAddressSuggestions ? (
                              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Loading suggestions...</p>
                            ) : addressSuggestions.length > 0 ? (
                              addressSuggestions.map((suggestion) => (
                                <button
                                  key={suggestion.place_id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleAddressSuggestionSelect(suggestion)}
                                  className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs text-gray-700 hover:bg-yellow-50 last:border-b-0 dark:border-white/10 dark:text-gray-200 dark:hover:bg-yellow-500/10"
                                >
                                  {suggestion.description}
                                </button>
                              ))
                            ) : (
                              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
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
                        className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={newAddress.city}
                          onChange={(e) => setNewAddress((prev) => ({ ...prev, city: e.target.value }))}
                          placeholder="City"
                          className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                        />
                        <input
                          type="text"
                          value={newAddress.state}
                          onChange={(e) => setNewAddress((prev) => ({ ...prev, state: e.target.value }))}
                          placeholder="State"
                          className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                        />
                      </div>
                      <input
                        type="text"
                        value={newAddress.zipCode}
                        onChange={(e) => setNewAddress((prev) => ({ ...prev, zipCode: e.target.value }))}
                        placeholder="Pincode"
                        className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
                      />

                      <AddressLocationPicker
                        value={newAddress}
                        onChange={setNewAddress}
                        fallbackLocation={liveLocation}
                        title="Exact delivery location"
                        description="For family or out-of-station orders, drag the pin to the exact drop point before saving."
                      />

                      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
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
                        className="w-full h-8 text-xs bg-yellow-500 hover:bg-yellow-600 text-white"
                        onClick={handleSaveNewAddress}
                        disabled={isSavingAddress}
                      >
                        {isSavingAddress ? "Saving..." : "Save Address"}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fff7ed] text-gray-900 md:pt-20 dark:bg-[#0b0b0b] dark:text-gray-100">
      <div className="bg-white/90 backdrop-blur sticky top-0 z-50 border-b border-orange-100 md:hidden dark:bg-[#111827]/95 dark:border-white/10">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-orange-50 rounded-full transition-colors dark:hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5 text-gray-800 dark:text-gray-100" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Checkout</h1>
        </div>
      </div>

      {/* Desktop Header/Headline */}
      <div className="hidden md:block max-w-[1100px] mx-auto w-full px-4 mt-4 mb-4">
        <div className="bg-white shadow-sm rounded-2xl py-4 px-4 flex items-center gap-4 border border-orange-100 dark:bg-[#111827] dark:border-white/10">
          <button
            onClick={() => navigate(-1)}
            className="p-1 hover:bg-orange-50 rounded-full transition-colors dark:hover:bg-white/10"
          >
            <ArrowLeft className="w-6 h-6 text-gray-800 dark:text-gray-100" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 font-Inter dark:text-gray-100">Checkout</h1>
        </div>
      </div>

      {isOrderEditMode && (
        <div className="max-w-[1100px] mx-auto w-full px-4 pt-4">
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 dark:bg-orange-500/10 dark:border-orange-400/30">
            <div>
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide dark:text-orange-300">
                Editing order #{orderEditSession?.orderRouteId}
              </p>
              <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                Add items before timer ends
              </p>
            </div>
            <p className="text-lg font-extrabold text-orange-900 tabular-nums dark:text-orange-100">
              {String(Math.floor(editSecondsLeft / 60)).padStart(2, "0")}:
              {String(editSecondsLeft % 60).padStart(2, "0")}
            </p>
          </div>
        </div>
      )}

      <div className="max-w-[1100px] mx-auto w-full px-4 py-4">
        {!restaurantAvailability.isAvailable && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/40 dark:bg-red-500/10">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {restaurantAvailability.reason || "Restaurant is offline. You cannot order right now."}
            </p>
          </div>
        )}
      </div>

      <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-yellow-100 dark:bg-[#151a23] dark:border-white/10">
          <h3 className="text-sm font-bold text-gray-900 mb-3 dark:text-gray-100">Order Items</h3>
          <div className="space-y-3">
            {orderSummary.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0 dark:border-white/10"
              >
                <img
                  src={item.image || item.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=160&h=160&fit=crop"}
                  alt={item.name}
                  className="w-14 h-14 rounded-xl object-cover border border-yellow-100 dark:border-white/10"
                  onError={(event) => {
                    event.currentTarget.src =
                      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=160&h=160&fit=crop";
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Quantity: {item.quantity}</p>
                </div>
                <p className="text-sm font-bold text-gray-900 whitespace-nowrap dark:text-gray-100">
                  ₹{(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-yellow-100 dark:bg-[#151a23] dark:border-white/10">
          <h3 className="text-sm font-bold text-gray-900 mb-3 dark:text-gray-100">Apply Coupon</h3>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={couponCodeInput}
              onChange={(event) => setCouponCodeInput(String(event.target.value || "").toUpperCase())}
              placeholder="Enter coupon code"
              className="h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            {appliedCouponCode ? (
              <Button
                type="button"
                onClick={handleRemoveCoupon}
                className="h-10 bg-gray-200 hover:bg-gray-300 text-gray-900 px-4 dark:bg-white/10 dark:hover:bg-white/20 dark:text-gray-100"
              >
                Remove
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => handleApplyCoupon()}
                disabled={couponApplying}
                className="h-10 bg-yellow-500 hover:bg-yellow-600 text-white px-4"
              >
                {couponApplying ? "Applying..." : "Apply"}
              </Button>
            )}
          </div>

          {appliedCouponCode ? (
            <p className="mt-2 text-xs font-medium text-green-600 dark:text-green-400">
              Applied: {appliedCouponCode}
            </p>
          ) : null}

          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-gray-400">
              Available coupons
            </p>
            {loadingCoupons ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Loading coupons...</p>
            ) : availableCoupons.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {visibleCoupons.map((coupon) => (
                    <button
                      key={coupon.code}
                      type="button"
                      onClick={() => handleApplyCoupon(coupon.code)}
                      className="px-3 py-1.5 rounded-full border border-yellow-300 bg-yellow-50 text-xs font-semibold text-yellow-700 hover:bg-yellow-100 dark:border-yellow-500/40 dark:bg-yellow-500/10 dark:text-yellow-200 dark:hover:bg-yellow-500/20"
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
                    className="mt-2 text-xs font-semibold text-yellow-700 hover:text-yellow-800 dark:text-yellow-300"
                  >
                    {showAllCoupons
                      ? "Show less"
                      : `Show all (${availableCoupons.length})`}
                  </button>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">No coupons available for current cart items.</p>
            )}
          </div>
        </div>
      </div>

      {addons.length > 0 && (
        <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100 dark:bg-[#151a23] dark:border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center dark:bg-orange-500/20">
                <Sparkles className="w-4 h-4 text-orange-600 dark:text-orange-300" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Complete your meal</h3>
            </div>

            {loadingAddons ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {[1, 2, 3].map((placeholder) => (
                  <div
                    key={placeholder}
                    className="min-w-[170px] rounded-2xl border border-gray-200 p-3 animate-pulse dark:border-white/10"
                  >
                    <div className="h-20 bg-gray-200 rounded-xl mb-2 dark:bg-white/10" />
                    <div className="h-3 bg-gray-200 rounded w-2/3 mb-2 dark:bg-white/10" />
                    <div className="h-3 bg-gray-200 rounded w-1/3 dark:bg-white/10" />
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
                      className="min-w-[190px] rounded-2xl border border-orange-100 bg-gradient-to-b from-orange-50/60 to-white p-2 dark:border-orange-500/30 dark:from-orange-500/10 dark:to-[#0f172a]"
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
                        <p className="text-sm font-semibold text-gray-900 line-clamp-1 dark:text-gray-100">
                          {addon.name}
                        </p>
                        <p className="text-xs text-gray-500 line-clamp-1 dark:text-gray-400">
                          {addon.description || "Popular add-on"}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                            ₹{Number(addon.price || 0).toFixed(0)}
                          </span>

                          {qty > 0 ? (
                            <div className="flex items-center gap-1 rounded-full border border-orange-300 bg-white px-1 py-0.5 dark:border-orange-400/40 dark:bg-[#0f172a]">
                              <button
                                onClick={() => updateQuantity(addonId, qty - 1)}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-orange-600 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-500/10"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-xs font-semibold w-5 text-center dark:text-gray-100">{qty}</span>
                              <button
                                onClick={() => updateQuantity(addonId, qty + 1)}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-orange-600 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-500/10"
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
                              className="h-8 px-3 rounded-full bg-white border border-[#ff8100] text-[#ff8100] text-xs font-bold hover:bg-orange-50 dark:bg-transparent dark:border-orange-400/60 dark:text-orange-300 dark:hover:bg-orange-500/10"
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
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-yellow-100 dark:bg-[#151a23] dark:border-white/10">
          <h3 className="text-sm font-bold text-gray-900 mb-3 dark:text-gray-100">Order Summary</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
              <span className="text-gray-900 font-medium dark:text-gray-100">{formatCurrency(orderSummary.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Delivery Fee</span>
              <span className="text-gray-900 font-medium dark:text-gray-100">
                {loadingPricing ? "Calculating..." : formatCurrency(orderSummary.deliveryFee)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Platform Fee</span>
              <span className="text-gray-900 font-medium dark:text-gray-100">
                {loadingPricing ? "Calculating..." : formatCurrency(orderSummary.platformFee)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">GST & Taxes</span>
              <span className="text-gray-900 font-medium dark:text-gray-100">
                {loadingPricing ? "Calculating..." : formatCurrency(orderSummary.tax)}
              </span>
            </div>
            {orderSummary.discount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-600 dark:text-green-400">Discount</span>
                <span className="text-green-600 font-medium dark:text-green-400">-{formatCurrency(orderSummary.discount)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 mt-2 dark:border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-gray-900 dark:text-gray-100">Total</span>
                <span className="text-xl font-bold text-yellow-600">{formatCurrency(orderSummary.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-yellow-100 dark:bg-[#151a23] dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-500 rounded-xl p-2">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Estimated Delivery Time</p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{orderSummary.estimatedTime}</p>
            </div>
          </div>
        </div>
      </div>

      {!isOrderEditMode && deliveryAddressSection}

      {isOrderEditMode && (
        <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-yellow-100 dark:bg-[#151a23] dark:border-white/10">
            <h3 className="text-sm font-bold text-gray-900 mb-3 dark:text-gray-100">Editing Existing Order</h3>
            <div className="space-y-3">
              <div className="rounded-xl border border-yellow-200 bg-yellow-50/70 px-3 py-2 dark:border-yellow-500/30 dark:bg-yellow-500/10">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-300">
                  Delivery Address Locked
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{lockedEditAddressLine}</p>
              </div>
              <div className="rounded-xl border border-yellow-200 bg-yellow-50/70 px-3 py-2 dark:border-yellow-500/30 dark:bg-yellow-500/10">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-300">
                  Payment Method Locked
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{lockedEditPaymentLabel}</p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Your changes will be applied to the same order without asking for address or payment again.
              </p>
            </div>
          </div>
        </div>
      )}

      {!isOrderEditMode && (
        <div className="max-w-[1100px] mx-auto w-full px-4 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-yellow-100 dark:bg-[#151a23] dark:border-white/10">
            <h3 className="text-sm font-bold text-gray-900 mb-3 dark:text-gray-100">Payment Method</h3>
            <div className="space-y-2">
              <button
                onClick={() => setPaymentMethod("card")}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${paymentMethod === "card"
                  ? "border-yellow-500 bg-yellow-100 dark:bg-yellow-500/10"
                  : "border-gray-200 bg-white dark:border-white/10 dark:bg-[#0f172a]"
                  }`}
              >
                <CreditCard
                  className={`w-5 h-5 ${paymentMethod === "card" ? "text-yellow-600" : "text-gray-400 dark:text-gray-300"}`}
                />
                <span
                  className={`text-sm font-medium ${paymentMethod === "card" ? "text-yellow-700" : "text-gray-700 dark:text-gray-200"}`}
                >
                  Credit/Debit Card
                </span>
              </button>
              <button
                onClick={() => setPaymentMethod("wallet")}
                className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border-2 transition-colors ${paymentMethod === "wallet"
                  ? "border-yellow-500 bg-yellow-100 dark:bg-yellow-500/10"
                  : "border-gray-200 bg-white dark:border-white/10 dark:bg-[#0f172a]"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Wallet
                    className={`w-5 h-5 ${paymentMethod === "wallet" ? "text-yellow-600" : "text-gray-400 dark:text-gray-300"}`}
                  />
                  <div className="text-left">
                    <span
                      className={`block text-sm font-medium ${paymentMethod === "wallet" ? "text-yellow-700" : "text-gray-700 dark:text-gray-200"}`}
                    >
                      MoBasket Wallet
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
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
                  ? "border-yellow-500 bg-yellow-100 dark:bg-yellow-500/10"
                  : "border-gray-200 bg-white dark:border-white/10 dark:bg-[#0f172a]"
                  }`}
              >
                <Smartphone
                  className={`w-5 h-5 ${paymentMethod === "upi" ? "text-yellow-600" : "text-gray-400 dark:text-gray-300"}`}
                />
                <span
                  className={`text-sm font-medium ${paymentMethod === "upi" ? "text-yellow-700" : "text-gray-700 dark:text-gray-200"}`}
                >
                  UPI (Razorpay)
                </span>
              </button>
              <button
                onClick={() => {
                  if (isCodEligible) {
                    setPaymentMethod("cash");
                  }
                }}
                disabled={!isCodEligible}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${paymentMethod === "cash"
                  ? "border-yellow-500 bg-yellow-100 dark:bg-yellow-500/10"
                  : "border-gray-200 bg-white dark:border-white/10 dark:bg-[#0f172a]"
                  }`}
              >
                <ShoppingBag
                  className={`w-5 h-5 ${paymentMethod === "cash" ? "text-yellow-600" : "text-gray-400 dark:text-gray-300"}`}
                />
                <span
                  className={`text-sm font-medium ${paymentMethod === "cash" ? "text-yellow-700" : "text-gray-700 dark:text-gray-200"}`}
                >
                  Cash on Delivery
                </span>
              </button>
              {!isCodEligible && (
                <p className="text-xs font-medium text-amber-700">
                  COD is available on orders of Rs {minimumCodOrderValue} and above.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1100px] mx-auto w-full px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6">
        <Button
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-4 rounded-2xl text-base shadow-lg shadow-yellow-200/80"
          onClick={handleProceedToPayment}
          disabled={
            isPlacingOrder ||
            !restaurantAvailability.isAvailable ||
            (!isOrderEditMode &&
              ((paymentMethod === "wallet" && !walletLoading && !hasSufficientWalletBalance) ||
                (paymentMethod === "cash" && !isCodEligible)))
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

    </div>
  );
}


