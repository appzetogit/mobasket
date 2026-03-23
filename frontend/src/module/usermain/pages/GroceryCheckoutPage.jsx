import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  CreditCard,
  Wallet,
  Clock,
  ShoppingBag,
  Home,
  Heart,
  Menu,
  ChefHat,
  ChevronRight,
  AlertCircle,
  Truck,
  Sparkles,
  Smartphone,
} from "lucide-react";
import { useCart } from "../../user/context/CartContext";
import { motion, AnimatePresence } from "framer-motion";
import { useProfile } from "../../user/context/ProfileContext";
import { useZone } from "../../user/hooks/useZone";
import { adminAPI, orderAPI, restaurantAPI, userAPI } from "@/lib/api";
import { initRazorpayPayment } from "@/lib/utils/razorpay";
import { toast } from "sonner";
import { evaluateStoreAvailability } from "@/lib/utils/storeAvailability";
import { Loader } from "@googlemaps/js-api-loader";
import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey";
import AddressLocationPicker from "@/components/AddressLocationPicker";
import { useRef } from "react";

const GROCERY_ITEM_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1542838132-92c53300491e?w=240&h=240&fit=crop";
const MAX_SCHEDULE_ADVANCE_DAYS = 2;

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

const toLocalDateInputValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export default function GroceryCheckoutPage() {
  const navigate = useNavigate();
  const { cart, clearCart, isGroceryItem } = useCart();
  const { getDefaultAddress, userProfile, addresses, addAddress } = useProfile();

  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
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

  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [postOrderRedirecting, setPostOrderRedirecting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [couponApplying, setCouponApplying] = useState(false);
  const [showAllCoupons, setShowAllCoupons] = useState(false);
  const [deliveryOption, setDeliveryOption] = useState("now");
  const [scheduledDate, setScheduledDate] = useState(new Date());
  const [scheduledTime, setScheduledTime] = useState("");
  const upcomingScheduleDates = useMemo(
    () => Array.from({ length: MAX_SCHEDULE_ADVANCE_DAYS + 1 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + index);
      return date;
    }),
    [],
  );
  const maxScheduledDate = useMemo(() => {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    date.setDate(date.getDate() + MAX_SCHEDULE_ADVANCE_DAYS);
    return date;
  }, []);
  const [feeSettings, setFeeSettings] = useState({
    deliveryFee: 25,
    deliveryFeeRanges: [],
    freeDeliveryThreshold: 149,
    platformFee: 5,
    gstRate: 5,
    minimumCodOrderValue: 0,
  });
  const [calculatedPricing, setCalculatedPricing] = useState(null);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [resolvedRestaurant, setResolvedRestaurant] = useState(null);
  const [hasActivePlanSubscription, setHasActivePlanSubscription] = useState(false);
  const [storeAvailability, setStoreAvailability] = useState({
    isAvailable: true,
    reason: "",
  });

  const formatStoreAddress = useCallback((store = {}) => {
    const addressFromPayload =
      store?.restaurantAddress ||
      store?.storeAddress ||
      store?.address ||
      "";
    if (typeof addressFromPayload === "string" && addressFromPayload.trim()) {
      return addressFromPayload.trim();
    }

    const location = store?.restaurantLocation || store?.storeLocation || store?.location || {};
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
  }, []);

  // Filter grocery items
  const groceryItems = cart.filter((item) => isGroceryItem(item));
  const hasSharedApp = Boolean(userProfile?.hasSharedApp || userProfile?.appSharedAt);
  const groceryItemsKey = useMemo(
    () =>
      groceryItems
        .map(
          (item) =>
            `${item?.id || item?._id || ""}:${item?.quantity || 0}:${item?.restaurantId || ""}:${item?.storeId || ""}`,
        )
        .join("|"),
    [groceryItems],
  );

  useEffect(() => {
    if (groceryItems.length > 0) return;
    if (isPlacingOrder || postOrderRedirecting) return;
    navigate("/grocery/cart", { replace: true });
  }, [groceryItems.length, isPlacingOrder, postOrderRedirecting, navigate]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(scheduledDate);
    selected.setHours(0, 0, 0, 0);

    if (selected.getTime() < today.getTime()) {
      setScheduledDate(today);
      return;
    }

    if (selected.getTime() > maxScheduledDate.getTime()) {
      setScheduledDate(maxScheduledDate);
    }
  }, [maxScheduledDate, scheduledDate]);

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

  const deliveryAddress =
    "Select delivery address";

  const [selectedAddress, setSelectedAddress] = useState(null);

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

    if (Array.isArray(addresses) && addresses.length > 0) {
      setSelectedAddress(addresses[0]);
      return;
    }

    setSelectedAddress(null);
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
    const coords = extractAddressCoordinates(normalizedSelectedAddress);
    if (coords) {
      return coords;
    }

    return null;
  }, [normalizedSelectedAddress]);

  const { zoneId } = useZone(selectedAddressLocationForZone, "mogrocery");

  const formattedDeliveryAddress = useMemo(() => {
    if (!normalizedSelectedAddress) return deliveryAddress;
    if (normalizedSelectedAddress.formattedAddress) return normalizedSelectedAddress.formattedAddress;

    const parts = [
      normalizedSelectedAddress.street,
      normalizedSelectedAddress.additionalDetails,
      normalizedSelectedAddress.city,
      normalizedSelectedAddress.state,
      normalizedSelectedAddress.zipCode,
    ].filter(Boolean);

    return parts.join(", ") || deliveryAddress;
  }, [normalizedSelectedAddress]);

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

  const getGroceryItemImage = useCallback((item) => {
    if (typeof item?.image === "string" && item.image.trim()) return item.image;
    if (typeof item?.imageUrl === "string" && item.imageUrl.trim()) return item.imageUrl;
    if (typeof item?.selectedVariant?.image === "string" && item.selectedVariant.image.trim()) {
      return item.selectedVariant.image;
    }
    if (Array.isArray(item?.images) && typeof item.images[0] === "string" && item.images[0].trim()) {
      return item.images[0];
    }
    return GROCERY_ITEM_FALLBACK_IMAGE;
  }, []);

  const getGroceryItemVariantLabel = useCallback((item) => {
    const explicitLabel =
      item?.selectedVariant?.name ||
      item?.variantName ||
      item?.weight ||
      item?.unit ||
      "";
    const normalized = String(explicitLabel || "").trim();
    if (normalized) return normalized;

    const quantity = Number(item?.selectedVariant?.quantity);
    const unit = String(item?.selectedVariant?.unit || "").trim();
    if (Number.isFinite(quantity) && quantity > 0 && unit) {
      return `${quantity} ${unit}`;
    }

    return "1 unit";
  }, []);
  const selectedAddressKey = useMemo(() => {
    if (!normalizedSelectedAddress) return "none";
    const coords = extractAddressCoordinates(normalizedSelectedAddress);
    const latitude = Number(coords?.latitude);
    const longitude = Number(coords?.longitude);
    return [
      normalizedSelectedAddress.formattedAddress || "",
      normalizedSelectedAddress.street || "",
      normalizedSelectedAddress.city || "",
      normalizedSelectedAddress.state || "",
      normalizedSelectedAddress.zipCode || "",
      Number.isFinite(longitude) ? String(longitude) : "",
      Number.isFinite(latitude) ? String(latitude) : "",
    ].join("|");
  }, [normalizedSelectedAddress]);
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

  const itemsTotal = groceryItems.reduce(
    (sum, item) => sum + (item.mrp || item.price) * item.quantity,
    0,
  );
  const subtotal = groceryItems.reduce(
    (sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)),
    0,
  );
  const totalSavings = itemsTotal - subtotal;
  const cartRestaurantId = String(
    groceryItems[0]?.restaurantId?._id ||
      groceryItems[0]?.restaurantId?.id ||
      groceryItems[0]?.restaurantId ||
      groceryItems[0]?.storeId?._id ||
      groceryItems[0]?.storeId?.id ||
      groceryItems[0]?.storeId ||
      "",
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
  const selectedStoreLabel =
    cartStoreIdentities[0]?.name ||
    String(resolvedRestaurant?.restaurantName || cartRestaurantName || "").trim() ||
    "Unknown Store";

  useEffect(() => {
    const fetchFeeSettings = async () => {
      try {
        const response = await adminAPI.getPublicFeeSettings("mogrocery");
        const settings = response?.data?.data?.feeSettings || response?.data?.feeSettings || {};
        setFeeSettings((prev) => ({
          ...prev,
          deliveryFee: Number(settings.deliveryFee ?? prev.deliveryFee),
          deliveryFeeRanges: Array.isArray(settings.deliveryFeeRanges)
            ? settings.deliveryFeeRanges
            : prev.deliveryFeeRanges,
          freeDeliveryThreshold: Number(settings.freeDeliveryThreshold ?? prev.freeDeliveryThreshold),
          platformFee: Number(settings.platformFee ?? prev.platformFee),
          gstRate: Number(settings.gstRate ?? prev.gstRate),
          minimumCodOrderValue: Number(settings.minimumCodOrderValue ?? prev.minimumCodOrderValue ?? 0),
        }));
      } catch (error) {
        console.error("Failed to fetch grocery fee settings:", error);
      }
    };

    fetchFeeSettings();
  }, []);

  const resolveGroceryRestaurant = useCallback(async () => {
    if (hasMixedStoreItems) {
      throw new Error("Your cart has items from multiple stores. Keep items from one store only.");
    }

    if (resolvedRestaurant?.restaurantId) {
      return resolvedRestaurant;
    }

    if (cartRestaurantId && cartRestaurantId !== "grocery-store") {
      const resolved = {
        restaurantId: cartRestaurantId,
        restaurantName: cartRestaurantName,
        restaurantAddress: cartRestaurantAddress,
        restaurantLocation: cartRestaurantLocation,
      };
      setResolvedRestaurant((prev) =>
        prev?.restaurantId === resolved.restaurantId &&
          prev?.restaurantName === resolved.restaurantName &&
          prev?.restaurantAddress === resolved.restaurantAddress
          ? prev
          : resolved,
      );
      return resolved;
    }

    throw new Error("Unable to resolve selected store. Please clear cart and add items again.");
  }, [
    cartRestaurantAddress,
    cartRestaurantId,
    cartRestaurantLocation,
    cartRestaurantName,
    hasMixedStoreItems,
    resolvedRestaurant,
  ]);

  const formattedStoreAddress = useMemo(() => {
    if (!resolvedRestaurant) return "";
    return formatStoreAddress(resolvedRestaurant);
  }, [formatStoreAddress, resolvedRestaurant]);

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
        setResolvedRestaurant((prev) => (prev ? null : prev));
        return;
      }
      try {
        await resolveGroceryRestaurant();
      } catch (error) {
        console.error("Failed to resolve grocery store for preview:", error);
      }
    };

    resolveRestaurantForPreview();
  }, [groceryItemsKey, resolveGroceryRestaurant]);

  useEffect(() => {
    const fetchStoreAvailability = async () => {
      if (!resolvedRestaurant?.restaurantId) {
        setStoreAvailability({ isAvailable: true, reason: "" });
        return;
      }

      try {
        const storeResponse = await restaurantAPI.getRestaurantById(String(resolvedRestaurant.restaurantId));

        const store =
          storeResponse?.data?.data?.restaurant ||
          storeResponse?.data?.restaurant ||
          storeResponse?.data?.data ||
          {};
        const storePlatform = String(
          store?.platform || resolvedRestaurant?.platform || "mogrocery",
        ).toLowerCase();

        // Keep checkout availability independent from restaurant outlet-timings endpoint.
        // Use store-level timing fields only.
        const outletTimings = [];

        setStoreAvailability(
          evaluateStoreAvailability({
            store,
            outletTimings,
            label: "Store",
          }),
        );
      } catch (error) {
        console.error("Failed to verify store availability on checkout:", error);
        // Don't hard-block checkout on transient availability API failures.
        // Final validation still happens on order creation in backend.
        setStoreAvailability({
          isAvailable: true,
          reason: "",
        });
      }
    };

    fetchStoreAvailability();
  }, [resolvedRestaurant?.restaurantId]);

  useEffect(() => {
    const calculatePricingPreview = async () => {
      if (!groceryItems.length || !normalizedSelectedAddress || !resolvedRestaurant?.restaurantId) {
        setLoadingPricing(false);
        setCalculatedPricing(null);
        return;
      }

      try {
        setLoadingPricing(true);
        const orderItems = buildOrderItems();
        if (!orderItems.length) {
          setLoadingPricing(false);
          setCalculatedPricing(null);
          return;
        }
        const response = await orderAPI.calculateOrder({
          items: orderItems,
          restaurantId: resolvedRestaurant.restaurantId,
          deliveryAddress: normalizedSelectedAddress,
          couponCode: appliedCouponCode || undefined,
          deliveryFleet: "standard",
          platform: "mogrocery",
          zoneId: zoneId || undefined,
        });
        setCalculatedPricing(response?.data?.data?.pricing || null);
      } catch (error) {
        console.error("Failed to calculate grocery pricing preview:", {
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
  }, [appliedCouponCode, groceryItemsKey, selectedAddressKey, resolvedRestaurant?.restaurantId, zoneId, normalizedSelectedAddress]);

  useEffect(() => {
    const fetchAvailableCoupons = async () => {
      if (!resolvedRestaurant?.restaurantId || groceryItems.length === 0) {
        setAvailableCoupons([]);
        return;
      }

      try {
        setLoadingCoupons(true);
        const uniqueItemIds = Array.from(
          new Set(
            groceryItems
              .map((item) => {
                const candidates = [
                  item?._id,
                  item?.itemId,
                  item?.productId,
                  item?.id,
                ]
                  .map((value) => String(value || "").trim())
                  .filter(Boolean);
                return candidates.find((id) => /^[a-f\d]{24}$/i.test(id)) || "";
              })
              .filter(Boolean),
          ),
        );
        const couponLookupItemIds = Array.from(new Set([...uniqueItemIds, "__ALL_ITEMS__"]));

        const responses = await Promise.all(
          couponLookupItemIds.map((itemId) =>
            restaurantAPI
              .getCouponsByItemIdPublic(String(resolvedRestaurant.restaurantId), itemId)
              .catch(() => null),
          ),
        );

        const couponMap = new Map();
        responses.forEach((response) => {
          const coupons = response?.data?.data?.coupons || [];
          coupons.forEach((coupon) => {
            if (coupon?.showAtCheckout === false) return;
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
        console.error("Failed to fetch grocery coupons:", error);
        setAvailableCoupons([]);
      } finally {
        setLoadingCoupons(false);
      }
    };

    fetchAvailableCoupons();
  }, [groceryItemsKey, hasSharedApp, resolvedRestaurant?.restaurantId]);

  useEffect(() => {
    if (availableCoupons.length <= 4 && showAllCoupons) {
      setShowAllCoupons(false);
    }
  }, [availableCoupons, showAllCoupons]);

  const showPricingLoading = loadingPricing && !calculatedPricing;

  const resolveDeliveryFeeFromRanges = (orderSubtotal, ranges, fallbackDeliveryFee, freeThreshold) => {
    const sortedRanges = Array.isArray(ranges)
      ? [...ranges].sort((a, b) => Number(a?.min || 0) - Number(b?.min || 0))
      : [];

    const matchingRange = sortedRanges.find((range) => {
      const min = Number(range?.min ?? 0);
      const max = Number(range?.max ?? Number.MAX_SAFE_INTEGER);
      return orderSubtotal >= min && orderSubtotal <= max;
    });

    if (matchingRange) return Math.max(0, Number(matchingRange?.fee ?? 0));
    if (orderSubtotal >= Number(freeThreshold ?? 149)) return 0;
    return Math.max(0, Number(fallbackDeliveryFee ?? 25));
  };

  const fallbackDeliveryFee = resolveDeliveryFeeFromRanges(
    subtotal,
    feeSettings?.deliveryFeeRanges,
    feeSettings?.deliveryFee,
    feeSettings?.freeDeliveryThreshold,
  );
  const fallbackPlatformFee = Number(feeSettings?.platformFee ?? 5);
  const fallbackTax = Math.max(0, subtotal * (Number(feeSettings?.gstRate ?? 5) / 100));
  const summaryDeliveryFee = Number(calculatedPricing?.deliveryFee ?? fallbackDeliveryFee);
  const summaryPlatformFee = Number(calculatedPricing?.platformFee ?? fallbackPlatformFee);
  const summaryTax = Number(calculatedPricing?.tax ?? fallbackTax);
  const planDiscountAmount = Number(calculatedPricing?.breakdown?.planDiscountAmount ?? 0);
  const appliedPlanBenefits = calculatedPricing?.appliedPlanBenefits || null;
  const appliedPlanName = String(calculatedPricing?.appliedPlanBenefits?.planName || "").trim();
  const hasPlanDiscount = planDiscountAmount > 0;
  const isMoGoldPlanApplied = hasPlanDiscount && /mogold/i.test(appliedPlanName || "");
  const hasPlanBenefits = Boolean(hasActivePlanSubscription || appliedPlanBenefits || hasPlanDiscount);
  const planBenefitsList = useMemo(() => {
    const items = [];
    const bestOfferName = String(appliedPlanBenefits?.bestDiscountOffer?.name || "").trim();
    const hasFreeDelivery = Boolean(appliedPlanBenefits?.freeDelivery);
    const hasDiscountOffer = Boolean(appliedPlanBenefits?.discount > 0 || hasPlanDiscount);

    if (hasFreeDelivery) {
      items.push("Free delivery applied");
    } else if (hasActivePlanSubscription) {
      items.push("Free delivery available on eligible orders");
    }

    if (hasDiscountOffer) {
      items.push(`Extra plan discount applied: Rs ${planDiscountAmount.toFixed(2)}`);
    } else if (hasActivePlanSubscription) {
      items.push("Plan discounts will auto-apply on eligible products");
    }

    if (bestOfferName) {
      items.push(`Active offer: ${bestOfferName}`);
    }

    if (appliedPlanBenefits?.expiresAt) {
      const expiryDate = new Date(appliedPlanBenefits.expiresAt);
      if (!Number.isNaN(expiryDate.getTime())) {
        items.push(`Valid till ${expiryDate.toLocaleDateString("en-IN")}`);
      }
    }

    if (!items.length && hasActivePlanSubscription) {
      items.push("Your plan is active and benefits will auto-apply");
    }

    return items;
  }, [appliedPlanBenefits, hasActivePlanSubscription, hasPlanDiscount, planDiscountAmount]);
  const grandTotal = Number(
    calculatedPricing?.total ??
    subtotal + summaryDeliveryFee + summaryPlatformFee + summaryTax - Number(calculatedPricing?.discount ?? 0),
  );
  const summaryCouponDiscount = Number(
    calculatedPricing?.breakdown?.couponDiscountAmount ?? calculatedPricing?.appliedCoupon?.discount ?? 0,
  );
  const summaryAppliedCouponCode = String(
    calculatedPricing?.appliedCoupon?.code || appliedCouponCode || "",
  )
    .trim()
    .toUpperCase();
  const visibleCoupons = showAllCoupons ? availableCoupons : availableCoupons.slice(0, 4);
  const hasSufficientWalletBalance = walletBalance >= grandTotal;
  const minimumCodOrderValue = Math.max(0, Number(feeSettings.minimumCodOrderValue || 0));
  const isCodEligible = grandTotal >= minimumCodOrderValue;

  useEffect(() => {
    if (paymentMethod === "cash" && !isCodEligible) {
      setPaymentMethod("card");
    }
  }, [paymentMethod, isCodEligible]);

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

  const handleApplyCoupon = async (couponCodeValue = null) => {
    const normalizedCode = String(couponCodeValue ?? couponCodeInput)
      .trim()
      .toUpperCase();

    if (!normalizedCode) {
      toast.error("Enter a coupon code.");
      return;
    }

    if (!resolvedRestaurant?.restaurantId || groceryItems.length === 0) {
      toast.error("No eligible items for coupon.");
      return;
    }

    try {
      setCouponApplying(true);
      const response = await orderAPI.calculateOrder({
        items: buildOrderItems(),
        restaurantId: resolvedRestaurant.restaurantId,
        deliveryAddress: normalizedSelectedAddress || undefined,
        couponCode: normalizedCode,
        deliveryFleet: "standard",
        platform: "mogrocery",
        zoneId: zoneId || undefined,
      });

      const pricing = response?.data?.data?.pricing || null;
      const appliedCode = String(pricing?.appliedCoupon?.code || "").trim().toUpperCase();

      if (appliedCode && appliedCode === normalizedCode) {
        setAppliedCouponCode(appliedCode);
        setCouponCodeInput(appliedCode);
        setCalculatedPricing(pricing);
        toast.success(`Coupon ${appliedCode} applied.`);
      } else {
        toast.error("Coupon is invalid or not eligible for this order.");
      }
    } catch (error) {
      console.error("Failed to apply grocery coupon:", error);
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

  const handlePlaceOrder = async () => {
    if (isPlacingOrder) return;
    if (!groceryItems.length) {
      toast.error("Your grocery cart is empty.");
      return;
    }
    if (hasMixedStoreItems) {
      toast.error("Cart has items from multiple stores. Please keep one store only.");
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
      navigate("/profile/addresses");
      return;
    }
    if (!normalizedSelectedAddress) {
      toast.error("Please add/select a delivery address first.");
      navigate("/profile/addresses");
      return;
    }
    if (deliveryOption === "schedule" && !scheduledTime) {
      toast.error("Please select a delivery time slot.");
      return;
    }
    if (deliveryOption === "schedule") {
      const selected = new Date(scheduledDate);
      selected.setHours(0, 0, 0, 0);
      if (selected.getTime() > maxScheduledDate.getTime()) {
        toast.error("Scheduled delivery can be set up to 2 days in advance only.");
        return;
      }
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

    if (!storeAvailability.isAvailable) {
      toast.error(storeAvailability.reason || "Store is offline. You cannot order right now.");
      return;
    }

    setIsPlacingOrder(true);
    try {
      const { restaurantId, restaurantName } = await resolveGroceryRestaurant();
      const items = buildOrderItems();
      const invalidItem = items.find((i) => !i.itemId || !i.name || !Number.isFinite(i.price) || i.quantity <= 0);
      if (invalidItem) {
        throw new Error("Cart item data is invalid. Please refresh grocery cart and try again.");
      }

      const pricingResponse = await orderAPI.calculateOrder({
        items,
        restaurantId,
        deliveryAddress: normalizedSelectedAddress,
        couponCode: appliedCouponCode || undefined,
        deliveryFleet: "standard",
        platform: "mogrocery",
        zoneId: zoneId || undefined,
      });
      const calculatedPricing = pricingResponse?.data?.data?.pricing;
      if (!calculatedPricing?.total) {
        throw new Error("Failed to calculate order pricing.");
      }

      const scheduleNote =
        deliveryOption === "schedule"
          ? `Scheduled delivery: ${scheduledDate.toLocaleDateString("en-IN")} ${scheduledTime}`
          : "Deliver now";

      const computeScheduledForISO = () => {
        if (deliveryOption !== "schedule" || !scheduledTime || !(scheduledDate instanceof Date)) {
          return null;
        }

        // Example slot: "09:00 AM - 11:00 AM" -> start time "09:00 AM"
        const slotStart = String(scheduledTime).split("-")[0]?.trim();
        const match = slotStart?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!match) return null;

        let hours = Number(match[1]);
        const minutes = Number(match[2]);
        const meridiem = match[3].toUpperCase();

        if (meridiem === "PM" && hours !== 12) hours += 12;
        if (meridiem === "AM" && hours === 12) hours = 0;

        const scheduled = new Date(scheduledDate);
        scheduled.setHours(hours, minutes, 0, 0);
        if (Number.isNaN(scheduled.getTime())) return null;
        return scheduled.toISOString();
      };

      const scheduledFor = computeScheduledForISO();

      const backendPaymentMethod =
        paymentMethod === "cash"
          ? "cash"
          : paymentMethod === "wallet"
            ? "wallet"
            : "razorpay";

      const orderPayload = {
        items,
        address: normalizedSelectedAddress,
        restaurantId,
        restaurantName,
        platform: "mogrocery",
        pricing: calculatedPricing,
        deliveryFleet: "standard",
        note: `[MoGrocery] ${scheduleNote}`,
        sendCutlery: false,
        paymentMethod: backendPaymentMethod,
        couponCode: appliedCouponCode || undefined,
        zoneId: zoneId || undefined,
        deliveryOption: deliveryOption === "schedule" ? "schedule" : "now",
        scheduledFor: scheduledFor || undefined,
        deliveryTimeSlot: deliveryOption === "schedule" ? scheduledTime : undefined,
      };

      const orderResponse = await orderAPI.createOrder(orderPayload);
      const { order, razorpay } = orderResponse?.data?.data || {};
      const orderIdentifier = String(order?.orderId || order?.id || order?._id || "").trim();

      if (backendPaymentMethod === "cash" || backendPaymentMethod === "wallet") {
        setPostOrderRedirecting(true);
        clearCart();
        if (backendPaymentMethod === "wallet") {
          setWalletBalance((prev) => Math.max(0, prev - Number(calculatedPricing?.total || 0)));
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

      await new Promise((resolve, reject) => {
        initRazorpayPayment({
          key: razorpay.key,
          amount: razorpay.amount,
          currency: razorpay.currency,
          order_id: razorpay.orderId,
          name: "MoBasket Grocery",
          description: `Payment for order ${order?.orderId || ""}`.trim(),
          prefill: {
            name: userProfile?.name || "",
            email: userProfile?.email || "",
            contact: (userProfile?.phone || "").replace(/\D/g, "").slice(-10),
          },
          notes: {
            orderId: order?.orderId || order?.id || "",
            preferredPaymentMode: paymentMethod === "upi" ? "upi" : "razorpay",
          },
          ...(paymentMethod === "upi"
            ? {
              method: {
                upi: true,
                card: false,
                netbanking: false,
                wallet: false,
                emi: false,
                paylater: false,
              },
            }
            : {}),
          handler: async (response) => {
            try {
              await orderAPI.verifyPayment({
                orderId: order?.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              setPostOrderRedirecting(true);
              clearCart();
              toast.success("Payment successful. Order confirmed.");
              if (orderIdentifier) {
                navigate(`/orders/${encodeURIComponent(orderIdentifier)}?confirmed=true`, { replace: true });
              } else {
                navigate("/orders?confirmed=true", { replace: true });
              }
              resolve();
            } catch (verifyError) {
              reject(
                new Error(
                  verifyError?.response?.data?.message || "Payment verification failed.",
                ),
              );
            }
          },
          onError: (error) =>
            reject(new Error(error?.description || error?.message || "Payment failed.")),
          onClose: () => reject(new Error("Payment cancelled.")),
        }).catch(reject);
      });
    } catch (error) {
      console.error("Grocery order create error:", {
        status: error?.response?.status,
        backendMessage: error?.response?.data?.message,
        errorMessage: error?.message,
      });
      toast.error(error?.response?.data?.message || error?.message || "Failed to place order.");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff8cc_0%,_#fffdf4_42%,_#f8fafc_100%)] text-gray-900 dark:bg-none dark:bg-[#0b1118] dark:text-gray-100 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#ffe25a] via-[#facd01] to-[#f4c300] sticky top-0 z-50 rounded-b-3xl shadow-md border-b border-yellow-300 dark:border-gray-800">
        <div className="px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/50 dark:hover:bg-black/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
          <div>
            <h1 className="text-lg font-extrabold text-gray-900">Grocery checkout</h1>
            <p className="text-[11px] font-medium text-gray-700">Fast delivery, fresh essentials</p>
          </div>
        </div>
      </div>

      {/* Delivery Address */}
      <div className="px-4 py-4">
        <div className="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 shadow-sm border border-yellow-50 dark:border-gray-800">
          <div className="flex items-start gap-3">
            <div className="bg-[#facd01] rounded-lg p-2">
              <MapPin className="w-5 h-5 text-gray-900 dark:text-gray-100" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
                Delivery Address
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{formattedDeliveryAddress}</p>

              <div className="mt-3 space-y-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Saved Addresses</p>
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
                          ? "border-[#ff8100] bg-orange-50 dark:bg-[#facd01]/10 dark:border-[#facd01]"
                          : "border-gray-200 bg-white dark:bg-[#1f1f1f] dark:border-gray-700"
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
                  className="text-xs font-semibold text-[#ff8100] mt-2 block w-full text-left"
                >
                  {showAddAddressForm ? "Close Add Address" : "+ Add New Address"}
                </button>

                {showAddAddressForm ? (
                  <div className="rounded-xl border border-gray-200 p-3 space-y-2 bg-gray-50 dark:bg-[#1a1a1a] dark:border-gray-700">
                    <div className="grid grid-cols-3 gap-2">
                      {["Home", "Office", "Other"].map((label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setNewAddress((prev) => ({ ...prev, label }))}
                          className={`h-8 rounded-lg text-xs font-semibold border ${newAddress.label === label
                            ? "border-[#ff8100] bg-orange-100 text-[#ff8100] dark:bg-[#facd01]/20 dark:border-[#facd01] dark:text-[#facd01]"
                            : "border-gray-200 bg-white text-gray-700 dark:bg-[#1f1f1f] dark:border-gray-700 dark:text-gray-300"
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
                        className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs dark:bg-[#1f1f1f] dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                      />
                      {showAddressSuggestions && (
                        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:bg-[#1a1a1a] dark:border-gray-700">
                          {loadingAddressSuggestions ? (
                            <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Loading suggestions...</p>
                          ) : addressSuggestions.length > 0 ? (
                            addressSuggestions.map((suggestion) => (
                              <button
                                key={suggestion.place_id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleAddressSuggestionSelect(suggestion)}
                                className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs text-gray-700 hover:bg-orange-50 last:border-b-0 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-[#facd01]/10"
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
                      className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs dark:bg-[#1f1f1f] dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newAddress.city}
                        onChange={(e) => setNewAddress((prev) => ({ ...prev, city: e.target.value }))}
                        placeholder="City"
                        className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs dark:bg-[#1f1f1f] dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                      />
                      <input
                        type="text"
                        value={newAddress.state}
                        onChange={(e) => setNewAddress((prev) => ({ ...prev, state: e.target.value }))}
                        placeholder="State"
                        className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs dark:bg-[#1f1f1f] dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                      />
                    </div>
                    <input
                      type="text"
                      value={newAddress.zipCode}
                      onChange={(e) => setNewAddress((prev) => ({ ...prev, zipCode: e.target.value }))}
                      placeholder="Pincode"
                      className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs dark:bg-[#1f1f1f] dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                    />

                    <AddressLocationPicker
                      value={newAddress}
                      onChange={setNewAddress}
                      title="Exact address pin"
                      description="Drag the pin or use the typed address to lock your delivery point."
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

                    <button
                      type="button"
                      className="w-full h-8 rounded-lg text-xs font-bold bg-[#facd01] hover:bg-[#facd01]/90 dark:hover:bg-[#e6bc01] text-gray-900 transition-colors"
                      onClick={handleSaveNewAddress}
                      disabled={isSavingAddress}
                    >
                      {isSavingAddress ? "Saving..." : "Save Address"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Order Items */}
      <div className="px-4 mb-4">
        <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-4 shadow-md border border-yellow-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3 border-b border-yellow-100 dark:border-gray-800 pb-2">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Order Items</h3>
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              {groceryItems.length} item{groceryItems.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-3">
            {groceryItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-gray-100 bg-[#fffef7] px-3 py-3 last:mb-0 dark:bg-[#202020] dark:border-gray-700"
              >
                <div className="h-16 w-16 shrink-0 rounded-lg bg-white border border-yellow-100 overflow-hidden dark:bg-[#0f172a] dark:border-white/10">
                  <img
                    src={getGroceryItemImage(item)}
                    alt={item.name}
                    className="h-full w-full object-contain p-1"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.src = GROCERY_ITEM_FALLBACK_IMAGE;
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight line-clamp-2">
                    {item.name}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-[#ecfdf3] text-[#166534] px-2 py-0.5 text-[10px] font-bold">
                      {getGroceryItemVariantLabel(item)}
                    </span>
                    <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-[10px] font-semibold dark:bg-gray-700 dark:text-gray-200">
                      Qty {item.quantity}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      Rs {Number(item.price || 0).toFixed(2)}
                    </p>
                    {Number(item.mrp || 0) > Number(item.price || 0) && (
                      <p className="text-xs text-gray-400 line-through">
                        Rs {Number(item.mrp || 0).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-sm font-extrabold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                  Rs {(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {resolvedRestaurant?.restaurantName && (
        <div className="px-4 pb-4">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 shadow-sm border border-yellow-50 dark:border-gray-800">
            <div className="flex items-start gap-3">
              <div className="bg-emerald-100 dark:bg-emerald-500/15 rounded-lg p-2">
                <Truck className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
                  Store Address
                </h3>
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                  {resolvedRestaurant.restaurantName}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {formattedStoreAddress || "Store address not available"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {hasMixedStoreItems && (
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 px-4 py-3">
            <p className="text-xs font-semibold text-red-700 dark:text-red-300">
              Cart contains products from multiple stores. Remove extra-store items to continue.
            </p>
          </div>
        </div>
      )}

      {/* Coupons */}
      <div className="px-4 mb-4">
        <div className="overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#151a23]">
          <div className="relative bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50 px-4 py-3 border-b border-rose-100 dark:border-white/10 dark:from-rose-500/10 dark:via-orange-500/10 dark:to-yellow-500/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] font-black text-rose-500">Savings Corner</p>
                <h3 className="text-sm font-black text-slate-900 dark:text-gray-100">Coupons & Offers</h3>
              </div>
              <div className="h-9 w-9 rounded-full bg-white/80 border border-rose-100 dark:bg-white/10 dark:border-white/10 flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4 text-rose-500" />
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={couponCodeInput}
                onChange={(event) => setCouponCodeInput(String(event.target.value || "").toUpperCase())}
                placeholder="Enter coupon code"
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-200 dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-rose-500/20"
              />
              {appliedCouponCode ? (
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="h-11 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-bold dark:bg-white/10 dark:hover:bg-white/15 dark:text-gray-100"
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleApplyCoupon()}
                  disabled={couponApplying}
                  className="h-11 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-black disabled:opacity-60"
                >
                  {couponApplying ? "Applying..." : "Apply"}
                </button>
              )}
            </div>

            {appliedCouponCode ? (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-3 py-2">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Applied: {appliedCouponCode}</p>
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">You are saving more</span>
              </div>
            ) : null}

            <div className="mt-3">
              {loadingCoupons ? (
                <p className="text-xs text-slate-500 dark:text-gray-400">Loading coupons...</p>
              ) : visibleCoupons.length > 0 ? (
                <div className="space-y-2">
                  {visibleCoupons.map((coupon) => (
                    <button
                      key={coupon.code}
                      type="button"
                      onClick={() => handleApplyCoupon(coupon.code)}
                      className="w-full text-left rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-rose-200 hover:bg-rose-50/40 transition-colors dark:border-white/10 dark:bg-[#0f172a] dark:hover:border-rose-400/40 dark:hover:bg-rose-500/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-black tracking-wide text-slate-900 dark:text-gray-100">{coupon.code}</p>
                          <p className="text-xs text-slate-500 dark:text-gray-400">
                            {coupon.discountPercentage > 0
                              ? `${coupon.discountPercentage}% OFF on this store`
                              : "Offer available on this store"}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600">
                          Apply
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-gray-400">No coupons available for current cart items.</p>
              )}
            </div>

            {availableCoupons.length > 4 ? (
              <button
                type="button"
                onClick={() => setShowAllCoupons((prev) => !prev)}
                className="mt-3 text-xs font-black text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
              >
                {showAllCoupons ? "Show less coupons" : `View all coupons (${availableCoupons.length})`}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Order Summary */}
      <div className="px-4 mb-4">
        <div className="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 shadow-sm border border-yellow-50 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-50 dark:border-gray-800 pb-2">
            Order Summary
          </h3>
          {isMoGoldPlanApplied && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="relative overflow-hidden rounded-xl border border-yellow-200 bg-gradient-to-r from-yellow-50 via-amber-50 to-yellow-100 p-3 mb-3 dark:border-yellow-500/20 dark:from-yellow-500/10 dark:via-amber-500/10 dark:to-yellow-400/5"
            >
              <motion.div
                aria-hidden
                className="absolute inset-y-0 -left-1/2 w-1/2 bg-white/35 blur-sm dark:bg-white/10"
                animate={{ x: ["0%", "280%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <motion.div
                    animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.08, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1 }}
                    className="w-8 h-8 rounded-full bg-yellow-400/90 text-yellow-900 flex items-center justify-center shadow-sm dark:bg-yellow-400/20 dark:text-yellow-200 dark:shadow-none"
                  >
                    <Sparkles className="w-4 h-4" />
                  </motion.div>
                  <div>
                    <p className="text-[11px] font-black text-yellow-900 tracking-wide dark:text-yellow-100">MoGold Plan Applied</p>
                    <p className="text-[10px] text-yellow-800 dark:text-yellow-200/80">Exclusive plan savings unlocked</p>
                  </div>
                </div>
                <motion.span
                  animate={{ scale: [1, 1.07, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.8 }}
                  className="text-sm font-black text-green-700 dark:text-emerald-300"
                >
                  -Rs {planDiscountAmount.toFixed(2)}
                </motion.span>
              </div>
            </motion.div>
          )}
          {hasPlanBenefits && planBenefitsList.length > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50/70 p-3 mb-3 dark:border-yellow-500/20 dark:bg-yellow-500/10">
              <p className="text-[11px] font-black text-yellow-900 tracking-wide dark:text-yellow-100">
                {appliedPlanName || "Active Plan Benefits"}
              </p>
              <div className="mt-2 space-y-1">
                {planBenefitsList.map((benefit, index) => (
                  <p key={`${benefit}-${index}`} className="text-[11px] text-yellow-900 dark:text-yellow-200/90">
                    • {benefit}
                  </p>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
              <span className="text-gray-900 dark:text-gray-100 font-bold">
                {showPricingLoading ? "Calculating..." : `Rs ${subtotal.toFixed(2)}`}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Delivery Fee</span>
              <span className="text-gray-900 dark:text-gray-100 font-bold">
                {showPricingLoading
                  ? "Calculating..."
                  : summaryDeliveryFee > 0
                    ? `Rs ${summaryDeliveryFee.toFixed(2)}`
                    : "FREE"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Platform Fee</span>
              <span className="text-gray-900 dark:text-gray-100 font-bold">
                {showPricingLoading ? "Calculating..." : `Rs ${summaryPlatformFee.toFixed(2)}`}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">GST & Taxes</span>
              <span className="text-gray-900 dark:text-gray-100 font-bold">
                {showPricingLoading ? "Calculating..." : `Rs ${summaryTax.toFixed(2)}`}
              </span>
            </div>
            {summaryCouponDiscount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-700 dark:text-emerald-300">Coupon Discount</span>
                <span className="text-green-700 font-bold dark:text-emerald-300">
                  -Rs {summaryCouponDiscount.toFixed(2)}
                </span>
              </div>
            )}
            {summaryAppliedCouponCode && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Applied Coupon</span>
                <span className="text-green-700 font-bold dark:text-emerald-300">{summaryAppliedCouponCode}</span>
              </div>
            )}
            {hasPlanDiscount && (
              <div className="flex items-center justify-between text-sm rounded-lg bg-green-50 border border-green-100 px-2.5 py-2 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <span className="text-green-700 font-semibold dark:text-emerald-300">
                  {appliedPlanName ? `${appliedPlanName} discount` : "Plan discount"}
                </span>
                <span className="text-green-700 font-bold dark:text-emerald-300">
                  -Rs {planDiscountAmount.toFixed(2)}
                </span>
              </div>
            )}
            {totalSavings > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Total Savings</span>
                <span className="text-yellow-700 font-bold dark:text-yellow-300">
                  -Rs {totalSavings.toFixed(2)}
                </span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-3 mt-2 dark:border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-base font-black text-gray-900 dark:text-gray-100">
                  Grand Total
                </span>
                <span className="text-xl font-black text-gray-900 dark:text-gray-100">
                  {showPricingLoading ? "Calculating..." : `Rs ${grandTotal.toFixed(2)}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Options */}
      <div className="px-4 mb-4">
        <div className="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 shadow-sm border border-yellow-50 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-tight">
              Delivery Options
            </h3>
          </div>
          {/* Delivery Options Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setDeliveryOption("now")}
              className={`flex-1 py-3 px-3 rounded-xl border-2 font-bold text-sm transition-all flex items-center justify-between group ${deliveryOption === "now"
                ? "border-[#facd01] bg-yellow-50 text-gray-900 dark:border-[#facd01]/70 dark:bg-[#facd01]/15 dark:text-yellow-100"
                : "border-gray-100 bg-white text-gray-400 dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-400 dark:hover:border-white/20"
                }`}
            >
              <div className="flex flex-col items-start">
                <span>Deliver Now</span>
                <span className="text-[10px] font-medium opacity-60">
                  8-12 mins
                </span>
              </div>
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${deliveryOption === "now"
                  ? "border-[#facd01] bg-[#facd01]"
                  : "border-gray-300 dark:border-gray-600"
                  }`}
              >
                {deliveryOption === "now" && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>
            </button>

            <button
              onClick={() => setDeliveryOption("schedule")}
              className={`flex-1 py-3 px-3 rounded-xl border-2 font-bold text-sm transition-all flex items-center justify-between group ${deliveryOption === "schedule"
                ? "border-[#facd01] bg-yellow-50 text-gray-900 dark:border-[#facd01]/70 dark:bg-[#facd01]/15 dark:text-yellow-100"
                : "border-gray-100 bg-white text-gray-400 dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-400 dark:hover:border-white/20"
                }`}
            >
              <div className="flex flex-col items-start">
                <span>Schedule</span>
                <span className="text-[10px] font-medium opacity-60">
                  Select time
                </span>
              </div>
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${deliveryOption === "schedule"
                  ? "border-[#facd01] bg-[#facd01]"
                  : "border-gray-300 dark:border-gray-600"
                  }`}
              >
                {deliveryOption === "schedule" && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>
            </button>
          </div>

          {/* Schedule Picker */}
          <AnimatePresence>
            {deliveryOption === "schedule" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-4 mt-2 border-t border-dashed border-gray-100 dark:border-white/10">
                  {/* Date Selection with Calendar Icon */}
                  <div className="mb-4">
                    <p className="text-xs font-bold text-gray-500 mb-2 dark:text-gray-400">
                      Select Date
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {upcomingScheduleDates.map((dateOption) => {
                        const isActive =
                          scheduledDate instanceof Date &&
                          !Number.isNaN(scheduledDate.getTime()) &&
                          toLocalDateInputValue(scheduledDate) === toLocalDateInputValue(dateOption);

                        return (
                          <button
                            key={toLocalDateInputValue(dateOption)}
                            type="button"
                            onClick={() => setScheduledDate(dateOption)}
                            className={`rounded-xl border px-2 py-2 text-left transition-colors ${
                              isActive
                                ? "border-[#facd01] bg-yellow-50 text-gray-900 dark:border-[#facd01]/70 dark:bg-[#facd01]/15 dark:text-yellow-100"
                                : "border-gray-200 bg-white text-gray-700 hover:border-[#facd01] dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-200 dark:hover:border-[#facd01]/60"
                            }`}
                          >
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              {dateOption.toLocaleDateString("en-US", { weekday: "short" })}
                            </p>
                            <p className="text-[11px] font-bold">
                              {dateOption.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time Selection */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-2 dark:text-gray-400">
                      Select Time Slot
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        "09:00 AM - 11:00 AM",
                        "11:00 AM - 01:00 PM",
                        "02:00 PM - 04:00 PM",
                        "04:00 PM - 06:00 PM",
                        "06:00 PM - 08:00 PM",
                      ].map((slot) => (
                        <button
                          key={slot}
                          onClick={() => setScheduledTime(slot)}
                          className={`p-2 rounded-lg border text-[10px] font-bold transition-all ${scheduledTime === slot
                            ? "border-[#facd01] bg-yellow-50 text-gray-900 dark:border-[#facd01]/70 dark:bg-[#facd01]/15 dark:text-yellow-100"
                            : "border-gray-100 bg-white text-gray-600 hover:border-orange-200 dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-300 dark:hover:border-orange-300/50"
                            }`}
                        >
                          {slot.replace(" - ", "\nto\n")}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Payment Method */}
      <div className="px-4 mb-4">
        <div className="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 shadow-sm border border-yellow-50 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-50 dark:border-gray-800 pb-2">
            Payment Method
          </h3>
          <div className="space-y-2 mt-3">
            <button
              onClick={() => setPaymentMethod("card")}
              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${paymentMethod === "card"
                ? "border-[#facd01] bg-yellow-50/50 dark:border-[#facd01]/70 dark:bg-[#facd01]/10"
                : "border-gray-100 bg-white dark:border-white/10 dark:bg-[#0f172a]"
                }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${paymentMethod === "card" ? "bg-[#facd01] text-gray-900 dark:bg-[#facd01] dark:text-gray-900" : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500"}`}
                >
                  <CreditCard className="w-5 h-5" />
                </div>
                <span
                  className={`text-sm font-bold ${paymentMethod === "card" ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-300"}`}
                >
                  Credit/Debit Card
                </span>
              </div>
              {paymentMethod === "card" && (
                <div className="w-4 h-4 rounded-full bg-[#facd01] border-4 border-white shadow-sm ring-1 ring-[#facd01] dark:border-[#151a23] dark:shadow-none"></div>
              )}
            </button>
            <button
              onClick={() => setPaymentMethod("wallet")}
              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${paymentMethod === "wallet"
                ? "border-[#facd01] bg-yellow-50/50 dark:border-[#facd01]/70 dark:bg-[#facd01]/10"
                : "border-gray-100 bg-white dark:border-white/10 dark:bg-[#0f172a]"
                }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${paymentMethod === "wallet" ? "bg-[#facd01] text-gray-900 dark:bg-[#facd01] dark:text-gray-900" : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500"}`}
                >
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span
                    className={`block text-sm font-bold ${paymentMethod === "wallet" ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-300"}`}
                  >
                    MoBasket Wallet
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {walletLoading
                      ? "Checking balance..."
                      : `Available: Rs ${walletBalance.toFixed(2)}`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!walletLoading && !hasSufficientWalletBalance && (
                  <span className="text-[11px] font-semibold text-red-500 dark:text-red-300">Low balance</span>
                )}
                {paymentMethod === "wallet" && (
                  <div className="w-4 h-4 rounded-full bg-[#facd01] border-4 border-white shadow-sm ring-1 ring-[#facd01] dark:border-[#151a23] dark:shadow-none"></div>
                )}
              </div>
            </button>
            <button
              onClick={() => setPaymentMethod("upi")}
              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${paymentMethod === "upi"
                ? "border-[#facd01] bg-yellow-50/50 dark:border-[#facd01]/70 dark:bg-[#facd01]/10"
                : "border-gray-100 bg-white dark:border-white/10 dark:bg-[#0f172a]"
                }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${paymentMethod === "upi" ? "bg-[#facd01] text-gray-900 dark:bg-[#facd01] dark:text-gray-900" : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500"}`}
                >
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span
                    className={`block text-sm font-bold ${paymentMethod === "upi" ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-300"}`}
                  >
                    Direct UPI
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Pay using any UPI app
                  </span>
                </div>
              </div>
              {paymentMethod === "upi" && (
                <div className="w-4 h-4 rounded-full bg-[#facd01] border-4 border-white shadow-sm ring-1 ring-[#facd01] dark:border-[#151a23] dark:shadow-none"></div>
              )}
            </button>
            <button
              onClick={() => {
                if (isCodEligible) {
                  setPaymentMethod("cash");
                }
              }}
              disabled={!isCodEligible}
              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${paymentMethod === "cash"
                ? "border-[#facd01] bg-yellow-50/50 dark:border-[#facd01]/70 dark:bg-[#facd01]/10"
                : "border-gray-100 bg-white dark:border-white/10 dark:bg-[#0f172a]"
                }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${paymentMethod === "cash" ? "bg-[#facd01] text-gray-900 dark:bg-[#facd01] dark:text-gray-900" : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500"}`}
                >
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <span
                  className={`text-sm font-bold ${paymentMethod === "cash" ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-300"}`}
                >
                  Cash on Delivery
                </span>
              </div>
              {paymentMethod === "cash" && (
                <div className="w-4 h-4 rounded-full bg-[#facd01] border-4 border-white shadow-sm ring-1 ring-[#facd01] dark:border-[#151a23] dark:shadow-none"></div>
              )}
            </button>
            {!isCodEligible && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                COD is available on orders of Rs {minimumCodOrderValue} and above.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Proceed Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#111111] border-t border-gray-100 dark:border-gray-800 p-4 pb-6 z-50 md:max-w-md md:mx-auto">
        {!storeAvailability.isAvailable && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/30 dark:bg-red-500/10">
            <p className="text-xs font-semibold text-red-700 dark:text-red-300">
              {storeAvailability.reason || "Store is offline. You cannot order right now."}
            </p>
          </div>
        )}
        <div className="mb-2 px-1">
          <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">
            Store: <span className="text-gray-900 dark:text-gray-100">{selectedStoreLabel}</span>
          </p>
        </div>
        <button
          className="w-full bg-[#facd01] hover:bg-[#e6bc01] text-gray-900 font-black py-4 rounded-2xl text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 group dark:shadow-none"
          onClick={handlePlaceOrder}
          disabled={
            isPlacingOrder ||
            groceryItems.length === 0 ||
            hasMixedStoreItems ||
            !storeAvailability.isAvailable ||
            (paymentMethod === "wallet" && !walletLoading && !hasSufficientWalletBalance) ||
            (paymentMethod === "cash" && !isCodEligible)
          }
        >
          {isPlacingOrder
            ? "Processing..."
            : paymentMethod === "cash"
              ? "Place Order"
              : paymentMethod === "wallet"
                ? "Pay via Wallet"
                : paymentMethod === "upi"
                  ? "Pay via UPI"
                  : "Proceed to Payment"}
          <ChevronRight
            size={20}
            className="group-hover:translate-x-1 transition-transform"
          />
        </button>
      </div>
    </div>
  );
}
