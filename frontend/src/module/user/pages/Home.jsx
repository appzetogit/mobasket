import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Star,
  Clock,
  MapPin,
  Heart,
  Search,
  Tag,
  Flame,
  ShoppingBag,
  ShoppingCart,
  Mic,
  SlidersHorizontal,
  CheckCircle2,
  Bookmark,
  BadgePercent,
  X,
  ArrowDownUp,
  Timer,
  CalendarClock,
  ShieldCheck,
  IndianRupee,
  UtensilsCrossed,
  Leaf,
  AlertCircle,
  Loader2,
  Plus,
  Check,
  Share2,
  Store,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Footer from "../components/Footer";
import AddToCartButton from "../components/AddToCartButton";
import StickyCartCard from "../components/StickyCartCard";
import AddToCartAnimation from "../components/AddToCartAnimation";
import OrderTrackingCard from "../components/OrderTrackingCard";
import { useProfile } from "../context/ProfileContext";
import { useCart } from "../context/CartContext";
import { HorizontalCarousel } from "@/components/ui/horizontal-carousel";
import { DotPattern } from "@/components/ui/dot-pattern";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useSearchOverlay,
  useLocationSelector,
} from "../components/UserLayout";
import PageNavbar from "../components/PageNavbar";

// Import shared food images - prevents duplication
import { foodImages } from "@/constants/images";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "../hooks/useLocation";
import { useZone } from "../hooks/useZone";
import MoBasketLogo from "@/assets/mobasketlogo.png";
import offerImage from "@/assets/offerimage.png";
import api, { restaurantAPI, zoneAPI } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api/config";
import OptimizedImage from "@/components/OptimizedImage";
import { prefetchRestaurantForRoute } from "../utils/restaurantPrefetch";
// Explore More Icons
import exploreOffers from "@/assets/explore more icons/offers.png";
import exploreGourmet from "@/assets/explore more icons/gourmet.png";
import exploreTop10 from "@/assets/explore more icons/top 10.png";
import exploreCollection from "@/assets/explore more icons/collection.png";

// Banner images for hero carousel - will be fetched from API
const HERO_BANNER_SYNC_STORAGE_KEY = "hero_banners_updated_at";
const HERO_BANNER_SYNC_EVENT = "hero-banners-updated";

// Animated placeholder for search - moved outside component to prevent recreation
const placeholders = [
  'Search "burger"',
  'Search "biryani"',
  'Search "pizza"',
  'Search "desserts"',
  'Search "chinese"',
  'Search "thali"',
  'Search "momos"',
  'Search "dosa"',
];

const normalizeCityName = (value) => String(value || "").trim().toLowerCase();

const CITY_PLACEHOLDERS = new Set([
  "",
  "current location",
  "select location",
  "unknown city",
]);

const INITIAL_TOP_BRAND_RENDER_COUNT = 8;
const INITIAL_RESTAURANT_RENDER_COUNT = 6;
const EARLY_RESTAURANT_PREFETCH_COUNT = 16;
const HOME_RESTAURANTS_CACHE_TTL_MS = 3 * 60 * 1000;
const HOME_RESTAURANTS_CACHE_VERSION = "v1";
const HOME_ZONE_SELECTION_STORAGE_KEY = "user.home.selectedZoneId.v1";

const isUsableCityValue = (value) => {
  const normalized = normalizeCityName(value);
  return normalized && !CITY_PLACEHOLDERS.has(normalized);
};

const extractCityFromAddressText = (value) => {
  if (!value || typeof value !== "string") return "";
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return "";

  const pincodeIndex = parts.findIndex((part) => /^\d{5,6}$/.test(part));
  if (pincodeIndex >= 1) {
    return parts[pincodeIndex - 1] || "";
  }

  if (parts.length >= 2) {
    return parts[parts.length - 2] || "";
  }

  return parts[0] || "";
};

const getSavedUserCity = () => {
  if (typeof window === "undefined") return "";
  try {
    const savedLocation = JSON.parse(localStorage.getItem("userLocation") || "null");
    if (!savedLocation || typeof savedLocation !== "object") return "";

    const directCity = savedLocation.city || savedLocation.location?.city || "";
    if (isUsableCityValue(directCity)) return String(directCity).trim();

    const fromAddress =
      extractCityFromAddressText(savedLocation.formattedAddress) ||
      extractCityFromAddressText(savedLocation.address);
    return isUsableCityValue(fromAddress) ? String(fromAddress).trim() : "";
  } catch {
    return "";
  }
};

const resolveUserCity = (locationLike) => {
  const directCity = locationLike?.city || locationLike?.location?.city || "";
  if (isUsableCityValue(directCity)) return String(directCity).trim();

  const fromAddress =
    extractCityFromAddressText(locationLike?.formattedAddress) ||
    extractCityFromAddressText(locationLike?.address);
  if (isUsableCityValue(fromAddress)) return String(fromAddress).trim();

  return getSavedUserCity();
};

const matchesRestaurantCity = (restaurant, normalizedUserCity) => {
  if (!normalizedUserCity) return false;

  const candidates = [
    restaurant?.location?.city,
    restaurant?.city,
    restaurant?.address?.city,
    restaurant?.location?.formattedAddress,
    restaurant?.location?.address,
    extractRestaurantCity(restaurant),
  ]
    .map((value) => normalizeCityName(value))
    .filter(Boolean);

  if (candidates.length === 0) return false;

  return candidates.some(
    (candidate) =>
      candidate === normalizedUserCity ||
      candidate.includes(normalizedUserCity) ||
      normalizedUserCity.includes(candidate),
  );
};

const extractRestaurantCity = (restaurant) => {
  const directCity =
    restaurant?.location?.city ||
    restaurant?.city ||
    restaurant?.address?.city ||
    "";

  if (String(directCity || "").trim()) {
    return String(directCity).trim();
  }

  const formattedAddress =
    restaurant?.location?.formattedAddress ||
    restaurant?.location?.address ||
    restaurant?.address ||
    "";

  if (!formattedAddress || typeof formattedAddress !== "string") return "";

  const parts = formattedAddress
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const pincodeIndex = parts.findIndex((part) => /^\d{5,6}$/.test(part));
  if (pincodeIndex >= 1) {
    return parts[pincodeIndex - 1] || "";
  }

  if (parts.length >= 2) {
    return parts[parts.length - 2] || "";
  }

  return "";
};

const collectSearchableItems = (restaurant = {}) => {
  const names = new Set();

  if (typeof restaurant.featuredDish === "string" && restaurant.featuredDish.trim()) {
    names.add(restaurant.featuredDish.trim());
  }

  if (Array.isArray(restaurant.menuItems)) {
    restaurant.menuItems.forEach((item) => {
      if (typeof item?.name === "string" && item.name.trim()) {
        names.add(item.name.trim());
      }
    });
  }

  const menuSections = restaurant.menu?.sections;
  if (Array.isArray(menuSections)) {
    menuSections.forEach((section) => {
      if (Array.isArray(section?.items)) {
        section.items.forEach((item) => {
          if (typeof item?.name === "string" && item.name.trim()) {
            names.add(item.name.trim());
          }
        });
      }

      if (Array.isArray(section?.subsections)) {
        section.subsections.forEach((subsection) => {
          if (Array.isArray(subsection?.items)) {
            subsection.items.forEach((item) => {
              if (typeof item?.name === "string" && item.name.trim()) {
                names.add(item.name.trim());
              }
            });
          }
        });
      }
    });
  }

  return Array.from(names);
};

const getInitialHomeZoneSelection = () => {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = String(localStorage.getItem(HOME_ZONE_SELECTION_STORAGE_KEY) || "")
      .trim();
    if (!stored) return "auto";
    return stored;
  } catch {
    return "auto";
  }
};

const getSelectedSavedAddressCity = () => {
  if (typeof window === "undefined") return "";
  try {
    const addresses = JSON.parse(localStorage.getItem("userAddresses") || "[]");
    if (!Array.isArray(addresses) || addresses.length === 0) return "";

    const selectedAddressId = String(localStorage.getItem("userSelectedAddressId") || "").trim();
    const selectedAddress =
      (selectedAddressId
        ? addresses.find((address) => {
            const addressId = String(address?.id || address?._id || "").trim();
            return Boolean(addressId) && addressId === selectedAddressId;
          })
        : null) ||
      addresses.find((address) => address?.isDefault) ||
      addresses[0];

    if (!selectedAddress || typeof selectedAddress !== "object") return "";

    const directCity = selectedAddress.city || selectedAddress.location?.city || "";
    if (isUsableCityValue(directCity)) return String(directCity).trim();

    const fromAddress =
      extractCityFromAddressText(selectedAddress.formattedAddress) ||
      extractCityFromAddressText(selectedAddress.address);
    return isUsableCityValue(fromAddress) ? String(fromAddress).trim() : "";
  } catch {
    return "";
  }
};

const readHomeSessionCache = (key, ttlMs) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || !("data" in parsed)) return null;
    if (Date.now() - Number(parsed.timestamp) > ttlMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

const writeHomeSessionCache = (key, data) => {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        timestamp: Date.now(),
        data,
      }),
    );
  } catch {
    // Ignore cache write errors.
  }
};

// Restaurant Image Carousel Component
function RestaurantImageCarousel({
  images,
  restaurantName,
  restaurantId,
  priority = false,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isSwiping = useRef(false);

  if (!images || images.length === 0) {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-t-md flex-shrink-0 bg-gray-200">
        <OptimizedImage
          src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop"
          alt={restaurantName}
          className="w-full h-full"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          objectFit="cover"
          placeholder="blur"
          priority={priority}
        />
      </div>
    );
  }

  // Handle touch events for swipe
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    isSwiping.current = false;
  };

  const handleTouchMove = (e) => {
    const currentX = e.touches[0].clientX;
    const diff = touchStartX.current - currentX;

    // If swipe distance is significant, mark as swiping
    if (Math.abs(diff) > 10) {
      isSwiping.current = true;
    }
  };

  const handleTouchEnd = (e) => {
    if (!isSwiping.current) return;

    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50; // Minimum distance for swipe

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) {
        // Swipe left - next image
        setCurrentIndex((prev) => (prev + 1) % images.length);
      } else {
        // Swipe right - previous image
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
      }
    }

    // Reset
    isSwiping.current = false;
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-t-md flex-shrink-0 group"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          <motion.div
            className="absolute inset-0"
            variants={{
              rest: { scale: 1 },
              hover: { scale: 1.15 },
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <OptimizedImage
              src={images[currentIndex]}
              alt={`${restaurantName} - Image ${currentIndex + 1}`}
              className="w-full h-full"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              objectFit="cover"
              placeholder="blur"
              priority={priority && currentIndex === 0}
            />
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Image Indicators - only show if more than 1 image */}
      {images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-1.5 z-10">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentIndex(index);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${index === currentIndex
                ? "w-6 bg-white"
                : "w-1.5 bg-white/50 hover:bg-white/75"
                }`}
              aria-label={`Go to image ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Gradient Overlay on Hover */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0"
        variants={{
          rest: { opacity: 0 },
          hover: { opacity: 1 },
        }}
        transition={{ duration: 0.4 }}
      />

      {/* Shine Effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full"
        variants={{
          rest: { x: "-100%" },
          hover: {
            x: "200%",
            transition: {
              duration: 0.8,
              ease: "easeInOut",
              delay: 0.2,
            },
          },
        }}
      />
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [heroSearch, setHeroSearch] = useState("");
  const [isListening, setIsListening] = useState(false);
  const speechRecognitionRef = useRef(null);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice search is not supported in this browser.");
      return;
    }

    try {
      if (!speechRecognitionRef.current) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-IN";

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event) => {
          const transcript = event?.results?.[0]?.[0]?.transcript?.trim() || "";
          if (transcript) {
            setHeroSearch(transcript);
          }
        };
        recognition.onerror = () => {
          setIsListening(false);
        };

        speechRecognitionRef.current = recognition;
      }

      if (isListening) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) {
          // Ignore
        }
        setIsListening(false);
        return;
      }

      speechRecognitionRef.current.start();
    } catch (error) {
      if (error.name === 'InvalidStateError' || (error.message && error.message.includes('already started'))) {
        setIsListening(true);
        return;
      }
      setIsListening(false);
      alert(error?.message || "Unable to start voice search. Please try again.");
    }
  };
  const { openSearch, closeSearch, searchValue, setSearchValue } =
    useSearchOverlay();
  const { openLocationSelector } = useLocationSelector();
  const { vegMode, setVegMode: setVegModeContext } = useProfile();
  const [prevVegMode, setPrevVegMode] = useState(vegMode);
  const [showVegModePopup, setShowVegModePopup] = useState(false);
  const [showSwitchOffPopup, setShowSwitchOffPopup] = useState(false);
  const [vegModeOption, setVegModeOption] = useState("all"); // "all" or "pure-veg"
  const [isApplyingVegMode, setIsApplyingVegMode] = useState(false);
  const [isSwitchingOffVegMode, setIsSwitchingOffVegMode] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, right: 0 });
  const vegModeToggleRef = useRef(null);
  const hasLoadedHeroBannersRef = useRef(false);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [heroBannerImages, setHeroBannerImages] = useState([]);
  const [heroBannersData, setHeroBannersData] = useState([]); // Store full banner data with linked restaurants
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [landingCategories, setLandingCategories] = useState([]);
  const [landingExploreMore, setLandingExploreMore] = useState([]);
  const [mofoodProductSections, setMofoodProductSections] = useState([]);
  const [exploreMoreHeading, setExploreMoreHeading] = useState("Explore More");
  const [loadingLandingConfig, setLoadingLandingConfig] = useState(true);
  const [restaurantsData, setRestaurantsData] = useState([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  const [vegEligibilityByRestaurant, setVegEligibilityByRestaurant] = useState({});
  const [fallbackCategories, setFallbackCategories] = useState([]);
  const [loadingRealCategories, setLoadingRealCategories] = useState(true);
  const [showAllCategoriesModal, setShowAllCategoriesModal] = useState(false);
  const [showDeferredSections, setShowDeferredSections] = useState(false);
  const [renderAllRestaurants, setRenderAllRestaurants] = useState(false);
  const isHandlingSwitchOff = useRef(false);
  const restaurantsRequestRef = useRef(0);
  const homepageMenuPrefetchStartedRef = useRef(new Set());
  const backendAssetBaseUrl = API_BASE_URL.replace(/\/api\/?$/, "");
  const prefetchRestaurant = useCallback((restaurantOrSlug) => {
    const restaurantSummary =
      restaurantOrSlug && typeof restaurantOrSlug === "object"
        ? restaurantOrSlug
        : null;
    const slugOrId =
      typeof restaurantOrSlug === "string"
        ? restaurantOrSlug
        : restaurantSummary?.slug ||
          restaurantSummary?.restaurantId ||
          restaurantSummary?._id ||
          restaurantSummary?.id;

    if (!slugOrId) return;

    return prefetchRestaurantForRoute({
      slug: slugOrId,
      restaurantSummary,
    }).catch(() => {
      // Ignore prefetch failures and allow normal navigation flow.
      return null;
    });
  }, []);

  const navigateWithPriorityPrefetch = useCallback(
    async (event, restaurantOrSlug, targetPath) => {
      if (!targetPath) return;
      if (
        event &&
        (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1)
      ) {
        return;
      }

      event?.preventDefault?.();

      try {
        const prefetchTask = prefetchRestaurant(restaurantOrSlug);
        if (prefetchTask && typeof prefetchTask.then === "function") {
          await Promise.race([
            prefetchTask,
            new Promise((resolve) => setTimeout(resolve, 1400)),
          ]);
        }
      } catch {
      }

      navigate(targetPath);
    },
    [navigate, prefetchRestaurant],
  );

  const isLikelyImageUrl = (value) => {
    const src = String(value || "").trim();
    if (!src) return false;
    return (
      src.startsWith("http://") ||
      src.startsWith("https://") ||
      src.startsWith("/") ||
      src.startsWith("uploads/") ||
      src.startsWith("./uploads/") ||
      src.startsWith("../uploads/")
    );
  };

  const resolveImageUrl = (value) => {
    const src = String(value || "").trim();
    if (!src) return "";

    if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
      return src;
    }

    if (src.startsWith("//")) {
      return `https:${src}`;
    }

    const normalizedPath = src.replace(/^(\.\/|\.\.\/)+/, "").replace(/^\/+/, "");
    if (!normalizedPath) return "";

    if (src.startsWith("/") || normalizedPath.startsWith("uploads/")) {
      return `${backendAssetBaseUrl}/${normalizedPath}`;
    }

    return "";
  };

  const fallbackImageBySeed = (seed) => {
    const str = String(seed || "");
    const hash = str.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return foodImages[hash % foodImages.length] || foodImages[0];
  };

  const fallbackImageGalleryBySeed = (seed, size = 3) => {
    const str = String(seed || "");
    const hash = str.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const total = Math.max(1, foodImages.length);
    const gallery = [];
    for (let i = 0; i < size; i += 1) {
      gallery.push(foodImages[(hash + i * 7) % total] || foodImages[0]);
    }
    return gallery;
  };

  const sanitizeImageSrc = (src, seed = "") =>
    resolveImageUrl(src) || fallbackImageBySeed(seed);

  const isStorefrontLikeImage = (value) => {
    const src = String(value || "").toLowerCase();
    if (!src) return false;
    return /(cover|banner|store|restaurant|profile|logo|outlet|shop)/.test(src);
  };

  const extractImageUrl = (value) => {
    if (!value) return "";
    if (typeof value === "string") {
      return resolveImageUrl(value);
    }
    if (typeof value !== "object") return "";

    const candidates = [
      value.url,
      value.imageUrl,
      value.image,
      value.src,
      value.secure_url,
      value.publicUrl,
      value.path,
      value.profileImage?.url,
      value.profileImage,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const resolvedUrl = resolveImageUrl(candidate);
        if (resolvedUrl) {
          return resolvedUrl;
        }
      }
    }
    return "";
  };

  const extractRestaurantImages = (restaurant = {}) => {
    const pushIfValid = (list, value) => {
      const url = extractImageUrl(value);
      if (url) list.push(url);
    };

    const storefront = [];
    const all = [];

    (restaurant.coverImages || []).forEach((entry) => {
      const url = extractImageUrl(entry);
      if (!url) return;
      all.push(url);
      if (isStorefrontLikeImage(url)) storefront.push(url);
    });

    (restaurant.menuImages || []).forEach((entry) => {
      const url = extractImageUrl(entry);
      if (!url) return;
      all.push(url);
    });

    (restaurant.onboarding?.step2?.menuImageUrls || []).forEach((entry) => {
      const url = extractImageUrl(entry);
      if (!url) return;
      all.push(url);
    });

    pushIfValid(storefront, restaurant.profileImage?.url);
    pushIfValid(storefront, restaurant.profileImage);
    pushIfValid(storefront, restaurant.onboarding?.step2?.profileImageUrl?.url);
    pushIfValid(storefront, restaurant.imageUrl);
    pushIfValid(storefront, restaurant.image);
    pushIfValid(storefront, restaurant.logo);
    pushIfValid(storefront, restaurant.thumbnail);

    storefront.forEach((url) => all.push(url));

    const dedupe = (arr) => Array.from(new Set(arr.filter(Boolean)));
    return {
      storefront: dedupe(storefront),
      all: dedupe(all),
    };
  };

  // Swipe functionality for hero banner carousel
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);
  const isSwiping = useRef(false);
  const autoSlideIntervalRef = useRef(null);

  // Sync prevVegMode when vegMode changes from context
  useEffect(() => {
    let timeoutId;

    const enableDeferredSections = () => {
      setShowDeferredSections(true);
      timeoutId = window.setTimeout(() => {
        setRenderAllRestaurants(true);
      }, 800);
    };

    if (typeof window === "undefined") return undefined;

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(enableDeferredSections, {
        timeout: 1200,
      });

      return () => {
        window.cancelIdleCallback?.(idleId);
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      };
    }

    timeoutId = window.setTimeout(() => {
      enableDeferredSections();
    }, 500);

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (vegMode !== prevVegMode && !isHandlingSwitchOff.current) {
      setPrevVegMode(vegMode);
    }
  }, [vegMode]);

  // Handle vegMode toggle - show popup when turned ON or OFF
  const handleVegModeChange = (newValue) => {
    // Skip if we're handling switch off confirmation
    if (isHandlingSwitchOff.current) {
      return;
    }

    if (newValue && !prevVegMode) {
      // Veg mode was just turned ON
      // Calculate popup position relative to toggle
      if (vegModeToggleRef.current) {
        const rect = vegModeToggleRef.current.getBoundingClientRect();
        setPopupPosition({
          top: rect.bottom + 10,
          right: window.innerWidth - rect.right,
        });
      }
      setShowVegModePopup(true);
      // Don't update context yet - wait for user to apply or cancel
    } else if (!newValue && prevVegMode) {
      // Veg mode was just turned OFF - show switch off confirmation popup
      isHandlingSwitchOff.current = true;
      setShowSwitchOffPopup(true);
      // Don't update context yet - wait for user to confirm
    } else {
      // Normal state change - update context directly
      setVegModeContext(newValue);
      setPrevVegMode(newValue);
    }
  };

  // Update popup position on scroll/resize
  useEffect(() => {
    if (!showVegModePopup) return;

    const updatePosition = () => {
      if (vegModeToggleRef.current) {
        const rect = vegModeToggleRef.current.getBoundingClientRect();
        setPopupPosition({
          top: rect.bottom + 10,
          right: window.innerWidth - rect.right,
        });
      }
    };

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showVegModePopup]);

  const fetchHeroBanners = useCallback(async ({ showLoader = false } = {}) => {
    try {
      if (showLoader) {
        setLoadingBanners(true);
      }
      const response = await api.get("/hero-banners/public");
      if (response.data.success && response.data.data.banners) {
        const banners = response.data.data.banners;
        setHeroBannersData(banners);
        // Extract image URLs for display
        setHeroBannerImages(banners.map((b) => b.imageUrl || b));
        hasLoadedHeroBannersRef.current = true;
      }
    } catch (error) {
      console.error("Error fetching hero banners:", error);
      if (showLoader || !hasLoadedHeroBannersRef.current) {
        // Fallback to empty array if the initial API load fails
        setHeroBannerImages([]);
        setHeroBannersData([]);
      }
    } finally {
      if (showLoader) {
        setLoadingBanners(false);
      }
    }
  }, []);

  // Fetch hero banners from API
  useEffect(() => {
    fetchHeroBanners({ showLoader: true });
  }, [fetchHeroBanners]);

  useEffect(() => {
    const refreshHeroBanners = () => {
      fetchHeroBanners();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchHeroBanners();
      }
    };

    const handleStorage = (event) => {
      if (event.key === HERO_BANNER_SYNC_STORAGE_KEY) {
        fetchHeroBanners();
      }
    };

    window.addEventListener("focus", refreshHeroBanners);
    window.addEventListener(HERO_BANNER_SYNC_EVENT, refreshHeroBanners);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshHeroBanners);
      window.removeEventListener(HERO_BANNER_SYNC_EVENT, refreshHeroBanners);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchHeroBanners]);

  // Fetch fallback categories from backend API (used only when restaurant-derived categories are unavailable)
  useEffect(() => {
    const fetchRealCategories = async () => {
      try {
        setLoadingRealCategories(true);
        const response = await api.get("/categories/public");
        if (response.data.success && response.data.data.categories) {
          // Filter out any category with id or slug "all" to prevent duplicates
          const filteredCategories = response.data.data.categories.filter(
            (cat) => {
              const catId = cat.id;
              const catSlug =
                cat.slug || cat.name?.toLowerCase().replace(/\s+/g, "-");
              return catId !== "all" && catSlug !== "all";
            },
          );

          const adminCategories = filteredCategories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            image: cat.image || foodImages[0], // Fallback to default image if not provided
            slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, "-"),
            label: cat.name, // For compatibility with existing code
          }));
          setFallbackCategories(adminCategories);
        } else {
          setFallbackCategories([]);
        }
      } catch (error) {
        console.error("Error fetching real categories:", error);
        setFallbackCategories([]);
      } finally {
        setLoadingRealCategories(false);
      }
    };

    fetchRealCategories();
  }, []);

  // Fetch landing page config (categories, explore more, settings)
  useEffect(() => {
    const fetchLandingConfig = async () => {
      try {
        setLoadingLandingConfig(true);
        const response = await api.get("/hero-banners/landing/public");
        if (response.data.success && response.data.data) {
          const apiCategories = response.data.data.categories || [];
          const apiExploreMore = response.data.data.exploreMore || [];
          const apiMofoodProductSections = Array.isArray(response?.data?.data?.mofoodProductSections)
            ? response.data.data.mofoodProductSections
            : [];

          // Extra safety: only keep active items, filter out "all" categories, and ensure order ascending
          setLandingCategories(
            apiCategories
              .filter((c) => {
                if (c.isActive === false) return false;
                // Filter out any category with id or slug "all" to prevent duplicates
                const catId = c.id || c._id;
                const catSlug =
                  c.slug || c.label?.toLowerCase().replace(/\s+/g, "-");
                return catId !== "all" && catSlug !== "all";
              })
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
          );
          setLandingExploreMore(
            apiExploreMore
              .filter((e) => e.isActive !== false)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
          );
          setMofoodProductSections(apiMofoodProductSections);
          setExploreMoreHeading(
            response.data.data.settings?.exploreMoreHeading || "Explore More",
          );
        }
      } catch (error) {
        console.error("Error fetching landing config:", error);
        // Fallback to empty arrays and default heading
        setLandingCategories([]);
        setLandingExploreMore([]);
        setMofoodProductSections([]);
        setExploreMoreHeading("Explore More");
      } finally {
        setLoadingLandingConfig(false);
      }
    };

    fetchLandingConfig();
  }, []);

  // Auto-cycle hero banner images
  useEffect(() => {
    if (heroBannerImages.length === 0) return;

    autoSlideIntervalRef.current = setInterval(() => {
      if (!isSwiping.current) {
        setCurrentBannerIndex((prev) => (prev + 1) % heroBannerImages.length);
      }
    }, 5000); // Change every 5 seconds

    return () => {
      if (autoSlideIntervalRef.current) {
        clearInterval(autoSlideIntervalRef.current);
      }
    };
  }, [heroBannerImages.length]);

  // Helper function to reset auto-slide timer
  const resetAutoSlide = useCallback(() => {
    if (autoSlideIntervalRef.current) {
      clearInterval(autoSlideIntervalRef.current);
    }
    if (heroBannerImages.length > 0) {
      autoSlideIntervalRef.current = setInterval(() => {
        if (!isSwiping.current) {
          setCurrentBannerIndex((prev) => (prev + 1) % heroBannerImages.length);
        }
      }, 10000);
    }
  }, [heroBannerImages.length]);

  // Swipe handlers for hero banner carousel
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = true;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (!isSwiping.current || heroBannerImages.length === 0) return;

    const deltaX = touchEndX.current - touchStartX.current;
    const deltaY = Math.abs(touchEndY.current - touchStartY.current);
    const minSwipeDistance = 50; // Minimum distance for a swipe

    // Check if it's a horizontal swipe (not vertical scroll)
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        // Swipe right - go to previous image
        setCurrentBannerIndex(
          (prev) =>
            (prev - 1 + heroBannerImages.length) % heroBannerImages.length,
        );
      } else {
        // Swipe left - go to next image
        setCurrentBannerIndex((prev) => (prev + 1) % heroBannerImages.length);
      }
      // Reset auto-slide timer after manual swipe
      resetAutoSlide();
    }

    // Reset swipe state after a short delay
    setTimeout(() => {
      isSwiping.current = false;
    }, 300);

    // Reset touch positions
    touchStartX.current = 0;
    touchStartY.current = 0;
    touchEndX.current = 0;
    touchEndY.current = 0;
  };

  // Mouse handlers for desktop drag support
  const handleMouseDown = (e) => {
    touchStartX.current = e.clientX;
    touchStartY.current = e.clientY;
    isSwiping.current = true;
  };

  const handleMouseMove = (e) => {
    if (!isSwiping.current) return;
    touchEndX.current = e.clientX;
    touchEndY.current = e.clientY;
  };

  const handleMouseUp = () => {
    if (!isSwiping.current || heroBannerImages.length === 0) return;

    const deltaX = touchEndX.current - touchStartX.current;
    const deltaY = Math.abs(touchEndY.current - touchStartY.current);
    const minSwipeDistance = 50;

    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        setCurrentBannerIndex(
          (prev) =>
            (prev - 1 + heroBannerImages.length) % heroBannerImages.length,
        );
      } else {
        setCurrentBannerIndex((prev) => (prev + 1) % heroBannerImages.length);
      }
      // Reset auto-slide timer after manual swipe
      resetAutoSlide();
    }

    setTimeout(() => {
      isSwiping.current = false;
    }, 300);

    touchStartX.current = 0;
    touchStartY.current = 0;
    touchEndX.current = 0;
    touchEndY.current = 0;
  };
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [sortBy, setSortBy] = useState(null); // null, 'price-low', 'price-high', 'rating-high', 'rating-low'
  const [selectedCuisine, setSelectedCuisine] = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({
    activeFilters: new Set(),
    sortBy: null,
    selectedCuisine: null,
  });
  const [isLoadingFilterResults, setIsLoadingFilterResults] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState("sort");
  const categoryScrollRef = useRef(null);
  const gsapAnimationsRef = useRef([]);
  // Safely get profile context - handle case when ProfileProvider is not available
  let profileContext = null;
  try {
    profileContext = useProfile();
  } catch (error) {
    console.warn(
      "ProfileProvider not available, using fallback:",
      error.message,
    );
    // Fallback values when ProfileProvider is not available
    profileContext = {
      addFavorite: () => console.warn("ProfileProvider not available"),
      removeFavorite: () => console.warn("ProfileProvider not available"),
      isFavorite: () => false,
      getFavorites: () => [],
    };
  }

  const { addFavorite, removeFavorite, isFavorite, getFavorites } =
    profileContext;
  const { addToCart, cart } = useCart();
  const { location, loading } = useLocation();
  const {
    zoneId,
    zoneStatus,
    isInService,
    isOutOfService,
    loading: zoneLoading,
  } = useZone(location);
  const [availableZones, setAvailableZones] = useState([]);
  const [selectedHomeZoneId, setSelectedHomeZoneId] = useState(getInitialHomeZoneSelection);
  const [showToast, setShowToast] = useState(false);
  const [showManageCollections, setShowManageCollections] = useState(false);
  const [selectedRestaurantSlug, setSelectedRestaurantSlug] = useState(null);

  // Memoize cartCount to prevent recalculation on every render - use cart directly
  const cartCount = useMemo(
    () => cart.reduce((total, item) => total + (item.quantity || 0), 0),
    [cart],
  );

  const cityName = location?.city || "Select";
  const stateName = location?.state || "Location";
  const effectiveHomeZoneId =
    selectedHomeZoneId && selectedHomeZoneId !== "auto" ? selectedHomeZoneId : zoneId;
  const hasManualZoneSelection =
    Boolean(selectedHomeZoneId) && selectedHomeZoneId !== "auto";

  useEffect(() => {
    const handleUserLocationChanged = () => {
      if (selectedHomeZoneId === "auto") return;
      let source = "";
      try {
        source = String(localStorage.getItem("userLocationSource") || "")
          .trim()
          .toLowerCase();
      } catch {
        source = "";
      }

      if (source === "saved" || source === "current") {
        setSelectedHomeZoneId("auto");
      }
    };

    window.addEventListener("userLocationChanged", handleUserLocationChanged);
    return () => {
      window.removeEventListener("userLocationChanged", handleUserLocationChanged);
    };
  }, [selectedHomeZoneId]);

  useEffect(() => {
    try {
      const value = String(selectedHomeZoneId || "auto").trim() || "auto";
      localStorage.setItem(HOME_ZONE_SELECTION_STORAGE_KEY, value);
    } catch {
      // Ignore storage failures.
    }
  }, [selectedHomeZoneId]);

  useEffect(() => {
    const fetchActiveZones = async () => {
      try {
        const response = await zoneAPI.getActiveZones("mofood");
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
    if (!selectedHomeZoneId || selectedHomeZoneId === "auto") return;
    const exists = availableZones.some((zone) => zone.id === selectedHomeZoneId);
    if (!exists) {
      setSelectedHomeZoneId("auto");
    }
  }, [availableZones, selectedHomeZoneId]);

  // Keep home location stable by default. Location is refreshed only from explicit user action.

  // Mock points value - replace with actual points from context/store
  const userPoints = 99;

  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Simple filter toggle function
  const toggleFilter = (filterId) => {
    setActiveFilters((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(filterId)) {
        newSet.delete(filterId);
      } else {
        newSet.add(filterId);
      }
      return newSet;
    });
  };

  // Refs for scroll tracking
  const filterSectionRefs = useRef({});
  const [activeScrollSection, setActiveScrollSection] = useState("sort");
  const rightContentRef = useRef(null);

  // Scroll tracking effect
  useEffect(() => {
    if (!isFilterOpen || !rightContentRef.current) return;

    const observerOptions = {
      root: rightContentRef.current,
      rootMargin: "-20% 0px -70% 0px",
      threshold: 0,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.getAttribute("data-section-id");
          if (sectionId) {
            setActiveScrollSection(sectionId);
            setActiveFilterTab(sectionId);
          }
        }
      });
    }, observerOptions);

    // Observe all filter sections
    Object.values(filterSectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [isFilterOpen]);

  // Fetch restaurants from API with filters
  const fetchRestaurants = useCallback(
    async (filters = {}) => {
      const requestId = restaurantsRequestRef.current + 1;
      restaurantsRequestRef.current = requestId;

      try {
        setLoadingRestaurants(true);

        // Prefer strict same-zone listing on Home.
        // If zone detection is unavailable, gracefully fall back to non-zone listing.
        if (zoneLoading) {
          return;
        }

        // Build query parameters from filters
        const params = {};

        // Sort by
        if (filters.sortBy) {
          params.sortBy = filters.sortBy;
        }

        // Cuisine
        if (filters.selectedCuisine) {
          params.cuisine = filters.selectedCuisine;
        }

        // Rating filters
        if (filters.activeFilters?.has("rating-45-plus")) {
          params.minRating = 4.5;
        } else if (filters.activeFilters?.has("rating-4-plus")) {
          params.minRating = 4.0;
        } else if (filters.activeFilters?.has("rating-35-plus")) {
          params.minRating = 3.5;
        }

        // Delivery time filters
        if (filters.activeFilters?.has("delivery-under-30")) {
          params.maxDeliveryTime = 30;
        } else if (filters.activeFilters?.has("delivery-under-45")) {
          params.maxDeliveryTime = 45;
        }

        // Distance filters
        if (filters.activeFilters?.has("distance-under-1km")) {
          params.maxDistance = 1.0;
        } else if (filters.activeFilters?.has("distance-under-2km")) {
          params.maxDistance = 2.0;
        }

        // Price filters
        if (filters.activeFilters?.has("price-under-200")) {
          params.maxPrice = 200;
        } else if (filters.activeFilters?.has("price-under-500")) {
          params.maxPrice = 500;
        }

        // Offers filter
        if (filters.activeFilters?.has("has-offers")) {
          params.hasOffers = "true";
        }

        // Trust filters
        if (filters.activeFilters?.has("top-rated")) {
          params.topRated = "true";
        } else if (filters.activeFilters?.has("trusted")) {
          params.trusted = "true";
        }

        // Home page is rendered as MoFood-only in frontend filtering.
        params.limit = 30;
        params.lite = "true";
        // When zone is selected (or auto-detected), fetch by zone only and ignore saved-location city.
        const hasResolvedZone = Boolean(effectiveHomeZoneId);
        let locationSource = "";
        try {
          locationSource = String(localStorage.getItem("userLocationSource") || "")
            .trim()
            .toLowerCase();
        } catch {
          locationSource = "";
        }
        const useSavedAddressCityMode =
          !hasManualZoneSelection && locationSource === "saved";
        const allowCrossModeFallbacks = !hasManualZoneSelection && !useSavedAddressCityMode;
        let didQueryByZone = false;
        let normalizedUserCity = "";
        if (hasResolvedZone && !useSavedAddressCityMode) {
          params.zoneId = effectiveHomeZoneId;
          params.onlyZone = "true";
          didQueryByZone = true;
        } else {
          // Saved-address mode should use selected saved-address city first.
          const resolvedUserCity = useSavedAddressCityMode
            ? resolveUserCity(location) || getSelectedSavedAddressCity()
            : resolveUserCity(location);
          normalizedUserCity = normalizeCityName(resolvedUserCity);
          if (normalizedUserCity) {
            params.city = resolvedUserCity;
          }
        }

        const cacheParams = Object.entries(params)
          .filter(([, value]) => value !== undefined && value !== null && value !== "")
          .sort(([a], [b]) => a.localeCompare(b));
        const cacheKey = `home:restaurants:${HOME_RESTAURANTS_CACHE_VERSION}:${JSON.stringify(cacheParams)}`;
        const cachedRestaurants = readHomeSessionCache(cacheKey, HOME_RESTAURANTS_CACHE_TTL_MS);
        if (Array.isArray(cachedRestaurants)) {
          if (restaurantsRequestRef.current !== requestId) return;
          setRestaurantsData(cachedRestaurants);
          setLoadingRestaurants(false);
          return;
        }

        let response = await restaurantAPI.getRestaurants(params);
        if (restaurantsRequestRef.current !== requestId) return;
        let restaurantsArrayRaw = response?.data?.data?.restaurants || [];

        const shouldRetryWithoutCity =
          !hasResolvedZone &&
          allowCrossModeFallbacks &&
          Boolean(params.city) &&
          Boolean(normalizedUserCity) &&
          Array.isArray(restaurantsArrayRaw) &&
          restaurantsArrayRaw.length === 0;

        const shouldRetryWithoutZone =
          didQueryByZone &&
          allowCrossModeFallbacks &&
          Array.isArray(restaurantsArrayRaw) &&
          restaurantsArrayRaw.length === 0;

        if (shouldRetryWithoutZone) {
          const fallbackParams = { ...params };
          delete fallbackParams.zoneId;
          delete fallbackParams.onlyZone;

          const resolvedUserCity = resolveUserCity(location);
          const normalizedFallbackCity = normalizeCityName(resolvedUserCity);
          if (normalizedFallbackCity) {
            fallbackParams.city = resolvedUserCity;
          } else {
            delete fallbackParams.city;
          }

          response = await restaurantAPI.getRestaurants(fallbackParams);
          if (restaurantsRequestRef.current !== requestId) return;
          restaurantsArrayRaw = response?.data?.data?.restaurants || [];
        } else if (shouldRetryWithoutCity) {
          const fallbackParams = { ...params };
          delete fallbackParams.city;
          response = await restaurantAPI.getRestaurants(fallbackParams);
          if (restaurantsRequestRef.current !== requestId) return;
          restaurantsArrayRaw = response?.data?.data?.restaurants || [];
        }

        const shouldRetryWithoutLocationFilters =
          allowCrossModeFallbacks &&
          Array.isArray(restaurantsArrayRaw) &&
          restaurantsArrayRaw.length === 0;

        if (shouldRetryWithoutLocationFilters) {
          const fallbackParams = {
            limit: params.limit,
            lite: params.lite,
          };
          response = await restaurantAPI.getRestaurants(fallbackParams);
          if (restaurantsRequestRef.current !== requestId) return;
          restaurantsArrayRaw = response?.data?.data?.restaurants || [];
        }

        if (
          response.data &&
          response.data.success &&
          response.data.data &&
          response.data.data.restaurants
        ) {
          const restaurantsArray = (restaurantsArrayRaw || []).filter((restaurant) => {
            const platform = String(restaurant?.platform || "").toLowerCase();
            if (platform && platform !== "mofood") return false;
            return true;
          });

          if (restaurantsArray.length === 0) {
            if (hasManualZoneSelection && hasResolvedZone) {
              console.warn(`No restaurants found for selected zone: ${effectiveHomeZoneId}`);
            } else {
              console.warn("No restaurants found in API response after all fallbacks");
            }
            setRestaurantsData([]);
            setLoadingRestaurants(false);
            return;
          }

          // Calculate distance helper function
          const calculateDistance = (lat1, lng1, lat2, lng2) => {
            const R = 6371; // Earth's radius in kilometers
            const dLat = ((lat2 - lat1) * Math.PI) / 180;
            const dLng = ((lng2 - lng1) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos((lat1 * Math.PI) / 180) *
              Math.cos((lat2 * Math.PI) / 180) *
              Math.sin(dLng / 2) *
              Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c; // Distance in kilometers
          };

          // Get user coordinates
          const userLat = location?.latitude;
          const userLng = location?.longitude;

          // Transform API data to match expected format
          const transformedRestaurants = restaurantsArray.map(
            (restaurant, index) => {
              // Use restaurant data if available, otherwise use defaults
              const deliveryTime =
                restaurant.estimatedDeliveryTime || "25-30 mins";

              // Calculate distance from user to restaurant
              let distance = restaurant.distance || "1.2 km";

              // Get restaurant coordinates
              const restaurantLocation = restaurant.location;
              const restaurantLat =
                restaurantLocation?.latitude ||
                (restaurantLocation?.coordinates &&
                  Array.isArray(restaurantLocation.coordinates)
                  ? restaurantLocation.coordinates[1]
                  : null);
              const restaurantLng =
                restaurantLocation?.longitude ||
                (restaurantLocation?.coordinates &&
                  Array.isArray(restaurantLocation.coordinates)
                  ? restaurantLocation.coordinates[0]
                  : null);

              // Calculate distance if both user and restaurant coordinates are available
              let distanceInKm = null;
              if (
                userLat &&
                userLng &&
                restaurantLat &&
                restaurantLng &&
                !isNaN(userLat) &&
                !isNaN(userLng) &&
                !isNaN(restaurantLat) &&
                !isNaN(restaurantLng)
              ) {
                distanceInKm = calculateDistance(
                  userLat,
                  userLng,
                  restaurantLat,
                  restaurantLng,
                );
                // Format distance: show 1 decimal place if >= 1km, otherwise show in meters
                if (distanceInKm >= 1) {
                  distance = `${distanceInKm.toFixed(1)} km`;
                } else {
                  const distanceInMeters = Math.round(distanceInKm * 1000);
                  distance = `${distanceInMeters} m`;
                }
              }

              // Get first cuisine or default
              const cuisine =
                restaurant.cuisines && restaurant.cuisines.length > 0
                  ? restaurant.cuisines[0]
                  : "Multi-cuisine";

              const extractedImages = extractRestaurantImages(restaurant);
              const coverImages = extractedImages.storefront;
              const fallbackImages = extractedImages.all;
              const allImages =
                coverImages.length > 0
                  ? coverImages
                  : fallbackImages.length > 0
                    ? fallbackImages
                    : [];

              // Keep single image for backward compatibility
              const image = allImages[0] || "";
              const rawRating =
                restaurant?.rating ??
                restaurant?.averageRating ??
                restaurant?.avgRating ??
                restaurant?.averageRatings ??
                restaurant?.metrics?.rating ??
                0;
              const numericRating = Number(rawRating);
              const rating =
                Number.isFinite(numericRating) && numericRating > 0
                  ? Number(numericRating.toFixed(1))
                  : 0;

              return {
                id: restaurant.restaurantId || restaurant._id,
                name: restaurant.name,
                cuisine: cuisine,
                cuisines: Array.isArray(restaurant.cuisines) ? restaurant.cuisines : [],
                rating,
                deliveryTime: deliveryTime,
                distance: distance,
                distanceInKm: distanceInKm, // Store numeric distance for sorting
                image: image,
                images: allImages, // Array of cover images for carousel (separate from menu images)
                menuImages: fallbackImages, // Product/menu images (preferred for category icons)
                coverImages, // Store-front/banner images
                priceRange: (() => {
                  const normalizedPriceRange = typeof restaurant.priceRange === "string"
                    ? restaurant.priceRange.replace(/\$/g, "₹")
                    : restaurant.priceRange
                  return normalizedPriceRange && !["₹", "₹₹", "₹₹₹"].includes(normalizedPriceRange)
                    ? normalizedPriceRange
                    : (restaurant.featuredPrice || 200)
                })(), // Use from API or default to featuredPrice
                featuredDish:
                  restaurant.featuredDish ||
                  (restaurant.cuisines && restaurant.cuisines.length > 0
                    ? `${restaurant.cuisines[0]} Special`
                    : "Special Dish"),
                featuredPrice: restaurant.featuredPrice || 249, // Use from API or default
                offer: restaurant.offer || "Flat ₹50 OFF above ₹199", // Use from API or default
                slug: restaurant.slug,
                restaurantId: restaurant.restaurantId,
                location: restaurant.location, // Store location for distance recalculation
                isActive: restaurant.isActive !== false, // Default to true if not specified
                isAcceptingOrders: restaurant.isAcceptingOrders !== false, // Default to true if not specified
                searchableItems: collectSearchableItems(restaurant),
              };
            },
          );

          // Sort restaurants by distance (nearby first) - only if user location is available
          if (userLat && userLng) {
            transformedRestaurants.sort((a, b) => {
              // Available restaurants first, then unavailable
              const aAvailable = a.isActive && a.isAcceptingOrders;
              const bAvailable = b.isActive && b.isAcceptingOrders;

              if (aAvailable !== bAvailable) {
                return aAvailable ? -1 : 1; // Available restaurants come first
              }

              // If both have same availability, sort by distance
              const aDistance =
                a.distanceInKm !== null ? a.distanceInKm : Infinity;
              const bDistance =
                b.distanceInKm !== null ? b.distanceInKm : Infinity;
              return aDistance - bDistance;
            });
          }
          writeHomeSessionCache(cacheKey, transformedRestaurants);
          setRestaurantsData(transformedRestaurants);
        } else {
          console.warn("Invalid API response structure:", response.data);
          setRestaurantsData([]);
        }
      } catch (error) {
        if (restaurantsRequestRef.current !== requestId) return;
        console.error("Error fetching restaurants:", error);
        console.error("Error details:", error.response?.data || error.message);
        // Don't set hardcoded data here - let the useMemo fallback handle it
        // This way, if API succeeds later, it will show the real data
        setRestaurantsData([]);
      } finally {
        if (restaurantsRequestRef.current === requestId) {
          setLoadingRestaurants(false);
        }
      }
    },
    [
      effectiveHomeZoneId,
      hasManualZoneSelection,
      location?.city,
      location?.latitude,
      location?.longitude,
      zoneLoading,
    ],
  );

  // Fetch restaurants when appliedFilters change
  useEffect(() => {
    fetchRestaurants(appliedFilters);
  }, [appliedFilters, fetchRestaurants]);

  // Recalculate distances when user location updates
  useEffect(() => {
    if (
      !restaurantsData ||
      restaurantsData.length === 0 ||
      !location?.latitude ||
      !location?.longitude
    )
      return;

    const calculateDistance = (lat1, lng1, lat2, lng2) => {
      const R = 6371; // Earth's radius in kilometers
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c; // Distance in kilometers
    };

    const userLat = location.latitude;
    const userLng = location.longitude;

    // Recalculate distances for all restaurants
    const updatedRestaurants = restaurantsData.map((restaurant) => {
      if (!restaurant.location) return restaurant;

      const restaurantLat =
        restaurant.location?.latitude ||
        (restaurant.location?.coordinates &&
          Array.isArray(restaurant.location.coordinates)
          ? restaurant.location.coordinates[1]
          : null);
      const restaurantLng =
        restaurant.location?.longitude ||
        (restaurant.location?.coordinates &&
          Array.isArray(restaurant.location.coordinates)
          ? restaurant.location.coordinates[0]
          : null);

      if (
        !restaurantLat ||
        !restaurantLng ||
        isNaN(restaurantLat) ||
        isNaN(restaurantLng)
      ) {
        return restaurant;
      }

      const distanceInKm = calculateDistance(
        userLat,
        userLng,
        restaurantLat,
        restaurantLng,
      );
      let calculatedDistance = null;

      // Format distance: show 1 decimal place if >= 1km, otherwise show in meters
      if (distanceInKm >= 1) {
        calculatedDistance = `${distanceInKm.toFixed(1)} km`;
      } else {
        const distanceInMeters = Math.round(distanceInKm * 1000);
        calculatedDistance = `${distanceInMeters} m`;
      }

      return {
        ...restaurant,
        distance: calculatedDistance,
        distanceInKm: distanceInKm, // Preserve numeric distance for sorting
      };
    });

    setRestaurantsData(updatedRestaurants);
  }, [location?.latitude, location?.longitude]);

  // When Veg Mode is ON, keep restaurants based on selected option:
  // - "all": show restaurants that have at least one veg item
  // - "pure-veg": show only restaurants where every item is veg
  useEffect(() => {
    const resolveVegEligibility = async () => {
      if (!vegMode || !Array.isArray(restaurantsData) || restaurantsData.length === 0) {
        setVegEligibilityByRestaurant({});
        return;
      }

      try {
        const checks = await Promise.all(
          restaurantsData.map(async (restaurant) => {
            const restaurantId = restaurant?.restaurantId || restaurant?.id;
            if (!restaurantId) {
              return [String(restaurant?.id || Math.random()), null];
            }

            try {
              const menuResponse = await restaurantAPI.getMenuByRestaurantId(String(restaurantId));
              const menuSections = menuResponse?.data?.data?.menu?.sections || [];
              const items = [];

              menuSections.forEach((section) => {
                const sectionItems = Array.isArray(section?.items) ? section.items : [];
                sectionItems.forEach((item) => items.push(item));

                const subsections = Array.isArray(section?.subsections) ? section.subsections : [];
                subsections.forEach((subsection) => {
                  const subsectionItems = Array.isArray(subsection?.items) ? subsection.items : [];
                  subsectionItems.forEach((item) => items.push(item));
                });
              });

              const eligibleItems = items.filter((item) => {
                const isAvailable = item?.isAvailable !== false;
                const isApproved = !item?.approvalStatus || item?.approvalStatus === "approved";
                return isAvailable && isApproved;
              });

              if (eligibleItems.length === 0) {
                return [String(restaurantId), false];
              }

              if (vegModeOption === "pure-veg") {
                // Strict: every item must be veg
                const isPureVeg = eligibleItems.every(
                  (item) => String(item?.foodType || "").toLowerCase() === "veg",
                );
                return [String(restaurantId), isPureVeg];
              } else {
                // "all": restaurant just needs at least one veg item
                const hasAnyVeg = eligibleItems.some(
                  (item) => String(item?.foodType || "").toLowerCase() === "veg",
                );
                return [String(restaurantId), hasAnyVeg];
              }
            } catch {
              // Keep unknown when menu fetch fails; don't hide whole list.
              return [String(restaurantId), null];
            }
          }),
        );

        setVegEligibilityByRestaurant(Object.fromEntries(checks));
      } catch {
        setVegEligibilityByRestaurant({});
      }
    };

    resolveVegEligibility();
  }, [vegMode, vegModeOption, restaurantsData]);

  // Filter restaurants and foods based on active filters
  const filteredRestaurants = useMemo(() => {
    // Use only API data - no mock data fallback
    let filtered = [...restaurantsData];

    if (vegMode) {
      filtered = filtered.filter((restaurant) => {
        const restaurantId = String(restaurant?.restaurantId || restaurant?.id || "");
        const eligibility = vegEligibilityByRestaurant[restaurantId];
        if (eligibility === false) return false;
        // true or unknown (null/undefined) should stay visible.
        return true;
      });
    }

    // Search Filter
    if (heroSearch.trim()) {
      const query = heroSearch.toLowerCase().trim();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.cuisine?.toLowerCase().includes(query) ||
          r.featuredDish?.toLowerCase().includes(query) ||
          (Array.isArray(r.searchableItems) &&
            r.searchableItems.some((item) =>
              item.toLowerCase().includes(query),
            ))
      );
    }

    // Apply filters
    if (activeFilters.has("price-under-200")) {
      filtered = filtered.filter(
        (r) => r.priceRange <= 200,
      );
    }
    if (activeFilters.has("price-under-500")) {
      filtered = filtered.filter((r) => r.priceRange <= 500);
    }
    if (activeFilters.has("delivery-under-30")) {
      filtered = filtered.filter((r) => {
        const timeMatch = r.deliveryTime.match(/(\d+)/);
        return timeMatch && parseInt(timeMatch[1]) <= 30;
      });
    }
    if (activeFilters.has("delivery-under-45")) {
      filtered = filtered.filter((r) => {
        const timeMatch = r.deliveryTime.match(/(\d+)/);
        return timeMatch && parseInt(timeMatch[1]) <= 45;
      });
    }
    if (activeFilters.has("rating-35-plus")) {
      filtered = filtered.filter((r) => r.rating >= 3.5);
    }
    if (activeFilters.has("rating-4-plus")) {
      filtered = filtered.filter((r) => r.rating >= 4.0);
    }
    if (activeFilters.has("rating-45-plus")) {
      filtered = filtered.filter((r) => r.rating >= 4.5);
    }
    if (activeFilters.has("distance-under-1km")) {
      filtered = filtered.filter((r) => {
        const distMatch = r.distance.match(/(\d+\.?\d*)/);
        return distMatch && parseFloat(distMatch[1]) <= 1.0;
      });
    }
    if (activeFilters.has("distance-under-2km")) {
      filtered = filtered.filter((r) => {
        const distMatch = r.distance.match(/(\d+\.?\d*)/);
        return distMatch && parseFloat(distMatch[1]) <= 2.0;
      });
    }
    if (activeFilters.has("delivery-under-45")) {
      filtered = filtered.filter((r) => {
        const timeMatch = r.deliveryTime.match(/(\d+)/);
        return timeMatch && parseInt(timeMatch[1]) <= 45;
      });
    }
    if (activeFilters.has("top-rated")) {
      filtered = filtered.filter((r) => r.rating >= 4.5);
    }
    if (activeFilters.has("trusted")) {
      filtered = filtered.filter((r) => r.rating >= 4.0);
    }
    if (activeFilters.has("has-offers")) {
      filtered = filtered.filter((r) => r.offer && r.offer.length > 0);
    }
    if (selectedCuisine) {
      filtered = filtered.filter((r) => r.cuisine === selectedCuisine);
    }

    // Apply sorting
    if (sortBy === "price-low") {
      filtered.sort((a, b) => {
        const aPrice = Number(a.priceRange) || 0;
        const bPrice = Number(b.priceRange) || 0;
        return aPrice - bPrice;
      });
    } else if (sortBy === "price-high") {
      filtered.sort((a, b) => {
        const aPrice = Number(a.priceRange) || 0;
        const bPrice = Number(b.priceRange) || 0;
        return bPrice - aPrice;
      });
    } else if (sortBy === "rating-high") {
      filtered.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === "rating-low") {
      filtered.sort((a, b) => a.rating - b.rating);
    } else {
      // Default sorting: Available restaurants first, then by distance (nearby first)
      // This ensures all restaurants in zone are shown, but nearby ones appear first
      filtered.sort((a, b) => {
        // Available restaurants first, then unavailable
        const aAvailable = a.isActive && a.isAcceptingOrders;
        const bAvailable = b.isActive && b.isAcceptingOrders;

        if (aAvailable !== bAvailable) {
          return aAvailable ? -1 : 1; // Available restaurants come first
        }

        // If both have same availability, sort by distance
        const aDistance =
          a.distanceInKm !== null && a.distanceInKm !== undefined
            ? a.distanceInKm
            : Infinity;
        const bDistance =
          b.distanceInKm !== null && b.distanceInKm !== undefined
            ? b.distanceInKm
            : Infinity;
        return aDistance - bDistance;
      });
    }

    return filtered;
  }, [restaurantsData, heroSearch, activeFilters, selectedCuisine, sortBy, vegMode, vegEligibilityByRestaurant]);

  const restaurantsForVegMode = useMemo(() => {
    if (!vegMode) return restaurantsData;
    return restaurantsData.filter((restaurant) => {
      const restaurantId = String(restaurant?.restaurantId || restaurant?.id || "");
      const eligibility = vegEligibilityByRestaurant[restaurantId];
      if (eligibility === false) return false;
      return true;
    });
  }, [vegMode, restaurantsData, vegEligibilityByRestaurant]);

  const topCategories = useMemo(() => {
    // Always prioritize admin-managed public categories so homepage category chips
    // stay in sync with /admin/categories names and uploaded images.
    if (Array.isArray(fallbackCategories) && fallbackCategories.length > 0) {
      return fallbackCategories.map((category) => ({
        ...category,
        image: sanitizeImageSrc(category?.image, category?.slug || category?.name),
      }));
    }

    const seen = new Set();
    const derived = [];

    restaurantsForVegMode.forEach((restaurant, index) => {
      const cuisineList = [
        ...(Array.isArray(restaurant?.cuisines) ? restaurant.cuisines : []),
        ...(String(restaurant?.cuisine || "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)),
      ];

      cuisineList.forEach((rawCuisine) => {
        const cuisine = String(rawCuisine || "").trim();
        if (!cuisine) return;

        const slug = cuisine
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

        if (!slug || slug === "all" || seen.has(slug)) return;

        seen.add(slug);
        derived.push({
          id: `rest-cat-${slug}-${index}`,
          name: cuisine,
          // Prefer product/menu image for category icon; never fall back to storefront image.
          image: sanitizeImageSrc(
            (Array.isArray(restaurant?.menuImages)
              ? restaurant.menuImages.find(
                (img) => isLikelyImageUrl(img) && !isStorefrontLikeImage(img),
              )
              : null) || fallbackImageBySeed(slug),
            slug,
          ),
          slug,
          label: cuisine,
        });
      });
    });

    if (derived.length > 0) return derived;
    return [];
  }, [restaurantsForVegMode, fallbackCategories]);

  const topBrandRestaurants = useMemo(
    () =>
      (restaurantsForVegMode || [])
        .filter((restaurant) => String(restaurant?.name || "").trim())
        .map((restaurant) => ({
          ...restaurant,
          image: sanitizeImageSrc(
            restaurant?.image,
            restaurant?.slug || restaurant?.id || restaurant?.name,
          ),
        })),
    [restaurantsForVegMode],
  );

  const visibleTopBrands = useMemo(
    () =>
      (topBrandRestaurants || []).filter(
        (restaurant) =>
          String(restaurant?.name || "").trim() &&
          (restaurant?.id || restaurant?.slug),
      ).slice(
        0,
        showDeferredSections
          ? topBrandRestaurants?.length || INITIAL_TOP_BRAND_RENDER_COUNT
          : INITIAL_TOP_BRAND_RENDER_COUNT,
      ),
    [showDeferredSections, topBrandRestaurants],
  );

  const displayedRestaurants = useMemo(
    () =>
      renderAllRestaurants
        ? filteredRestaurants
        : filteredRestaurants.slice(0, INITIAL_RESTAURANT_RENDER_COUNT),
    [filteredRestaurants, renderAllRestaurants],
  );

  useEffect(() => {
    if (loadingRestaurants) return undefined;
    if (!Array.isArray(restaurantsData) || restaurantsData.length === 0) return undefined;

    const toPrefetch = [];
    const seen = new Set();

    for (const restaurant of restaurantsData) {
      const key = String(
        restaurant?.slug ||
          restaurant?.restaurantId ||
          restaurant?._id ||
          restaurant?.id ||
          "",
      ).trim();

      if (!key || seen.has(key) || homepageMenuPrefetchStartedRef.current.has(key)) {
        continue;
      }

      seen.add(key);
      toPrefetch.push({ key, restaurant });
      if (toPrefetch.length >= EARLY_RESTAURANT_PREFETCH_COUNT) break;
    }

    if (toPrefetch.length === 0) return undefined;

    let cancelled = false;
    let timerId;

    const runPrefetch = async () => {
      const immediateChunk = toPrefetch.slice(0, 4);
      const remaining = toPrefetch.slice(4);

      if (immediateChunk.length > 0) {
        await Promise.allSettled(
          immediateChunk.map(async ({ key, restaurant }) => {
            homepageMenuPrefetchStartedRef.current.add(key);
            await prefetchRestaurantForRoute({
              slug: key,
              restaurantSummary: restaurant,
            });
          }),
        );
      }

      const chunkSize = 2;
      for (let i = 0; i < remaining.length; i += chunkSize) {
        if (cancelled) break;
        const chunk = remaining.slice(i, i + chunkSize);
        await Promise.allSettled(
          chunk.map(async ({ key, restaurant }) => {
            homepageMenuPrefetchStartedRef.current.add(key);
            await prefetchRestaurantForRoute({
              slug: key,
              restaurantSummary: restaurant,
            });
          }),
        );
        if (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      }
    };

    timerId = setTimeout(() => {
      runPrefetch().catch(() => {});
    }, 0);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [loadingRestaurants, restaurantsData]);

  useEffect(() => {
    if (loadingRestaurants) return undefined;

    const toPrefetch = [];
    const seen = new Set();
    const candidates = [...visibleTopBrands, ...displayedRestaurants];

    for (const restaurant of candidates) {
      const key = String(
        restaurant?.slug ||
          restaurant?.restaurantId ||
          restaurant?._id ||
          restaurant?.id ||
          "",
      ).trim();
      if (!key || seen.has(key) || homepageMenuPrefetchStartedRef.current.has(key)) {
        continue;
      }
      seen.add(key);
      toPrefetch.push({ key, restaurant });
      if (toPrefetch.length >= 10) break;
    }

    if (toPrefetch.length === 0) return undefined;

    let cancelled = false;
    let timerId;
    let idleId;

    const runPrefetch = async () => {
      const chunkSize = 2;
      for (let i = 0; i < toPrefetch.length; i += chunkSize) {
        if (cancelled) break;
        const chunk = toPrefetch.slice(i, i + chunkSize);
        await Promise.allSettled(
          chunk.map(async ({ key, restaurant }) => {
            homepageMenuPrefetchStartedRef.current.add(key);
            await prefetchRestaurantForRoute({
              slug: key,
              restaurantSummary: restaurant,
            });
          }),
        );
        if (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 140));
        }
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(
        () => {
          runPrefetch().catch(() => {});
        },
        { timeout: 1200 },
      );
    } else {
      timerId = setTimeout(() => {
        runPrefetch().catch(() => {});
      }, 250);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined" && idleId) {
        window.cancelIdleCallback?.(idleId);
      }
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [displayedRestaurants, loadingRestaurants, visibleTopBrands]);

  // Featured foods removed - will be handled by restaurants data from API
  const filteredFeaturedFoods = useMemo(() => {
    // Return empty array - featured foods will come from API if needed
    return [];
  }, [activeFilters, sortBy]);

  // Memoize callbacks to prevent unnecessary re-renders
  const handleLocationClick = useCallback(() => {
    openLocationSelector();
  }, [openLocationSelector]);

  const handleSearchFocus = useCallback(() => {
    // Sync heroSearch with global searchValue when opening overlay
    if (heroSearch) {
      setSearchValue(heroSearch);
    }
    openSearch();
  }, [heroSearch, openSearch, setSearchValue]);

  const handleSearchClose = useCallback(() => {
    closeSearch();
    setHeroSearch("");
  }, [closeSearch]);

  // Removed GSAP animations - using CSS and ScrollReveal components instead for better performance
  // Auto-scroll removed - manual scroll only

  // Animated placeholder cycling - same as RestaurantDetails highlight offer animation
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 2000); // Change placeholder every 2 seconds (same as RestaurantDetails)

    return () => clearInterval(interval);
  }, []); // placeholders is a constant, no need for dependency

  // Lightweight ScrollReveal replacement - CSS only, no IntersectionObserver
  const ScrollRevealSimple = ({ children, delay = 0, className = "" }) => (
    <div className={className}>{children}</div>
  );

  // Lightweight TextReveal replacement - CSS only
  const TextRevealSimple = ({ children, className = "" }) => (
    <div className={className}>{children}</div>
  );

  // Lightweight ShimmerCard replacement - no animations
  const ShimmerCardSimple = ({ children, className = "" }) => (
    <div className={className}>{children}</div>
  );

  return (
    <div className="relative min-h-screen bg-white dark:bg-[#0a0a0a] pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">
      {/* Unified Background for Entire Page - Vibrant Food Theme */}
      <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none overflow-hidden z-0">
        {/* Main Background */}
        <div className="absolute inset-0 bg-white dark:bg-[#0a0a0a]"></div>
        {/* Background Elements - Reduced to 2 blobs with CSS animations for better performance */}
        <div className="absolute inset-0 overflow-hidden opacity-20">
          {/* Top right blob - CSS animation */}
          <div
            style={{
              animation: "blob 8s ease-in-out infinite",
              willChange: "transform",
            }}
          />
          {/* Bottom left blob - CSS animation */}
          <div
            style={{
              animation: "blob-reverse 10s ease-in-out infinite",
              willChange: "transform",
            }}
          />
        </div>
        {/* CSS keyframes for animations */}
        <style>{`
          @keyframes blob {
            0%, 100% {
              transform: translate(0, 0) scale(1);
            }
            50% {
              transform: translate(50px, -30px) scale(1.2);
            }
          }
          @keyframes blob-reverse {
            0%, 100% {
              transform: translate(0, 0) scale(1);
            }
            50% {
              transform: translate(-40px, 40px) scale(1.3);
            }
          }
          @keyframes fade-in {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes gradient {
            0%, 100% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
          }
          @keyframes fade-in-up {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes wiggle {
            0%, 100% {
              transform: rotate(0deg);
            }
            25% {
              transform: rotate(10deg);
            }
            75% {
              transform: rotate(-10deg);
            }
          }
          @keyframes placeholderFade {
            0% {
              opacity: 0;
              transform: translateY(20px);
            }
            100% {
              opacity: 0.6;
              transform: translateY(0);
            }
          }
          @keyframes gradientShift {
            0%, 100% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
          }
          @keyframes slideUp {
            0% {
              opacity: 0;
              transform: translateY(15px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>

      <div className="sticky top-0 z-50 bg-white dark:bg-[#0a0a0a] md:static md:z-auto">
        {/* 1. Navbar Section (Sticky Top, White Background) */}
        <div className="bg-white dark:bg-[#0a0a0a] shadow-sm dark:shadow-none md:hidden">
          <PageNavbar
            textColor="auto"
            zIndex={50}
            showZoneSelector
            zoneOptions={availableZones}
            zoneValue={selectedHomeZoneId}
            onZoneChange={setSelectedHomeZoneId}
          />
        </div>

      {/* 2. Search Bar Section (Pinned on mobile scroll) */}
      <div className="sticky top-[56px] z-40 bg-white dark:bg-[#0a0a0a] py-2 pb-4 px-3 sm:px-6 md:static md:top-auto md:z-auto md:pt-20 border-b border-gray-100 dark:border-gray-800">
        {/* 2. Search Bar Section (White Background) */}
        <div className="bg-white dark:bg-[#0a0a0a] py-2 pb-4 px-3 sm:px-6 md:pt-20">
        <div className="w-full lg:max-w-[1100px] mx-auto lg:px-8 xl:px-0 flex items-center gap-3 sm:gap-4 lg:gap-6">
          {/* Enhanced Search Bar */}
          <motion.div
            className="flex-1 relative"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className="relative bg-white dark:bg-[#1a1a1a] dark:border-gray-700 rounded-xl lg:rounded-2xl shadow-sm border border-gray-200 p-1 sm:p-1.5 lg:p-2 transition-all duration-300 hover:shadow-md">
              <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                <Search
                  className="h-4 w-4 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-[#EF4F5F] flex-shrink-0 ml-2 sm:ml-3 lg:ml-4"
                  strokeWidth={2.5}
                />
                <div className="flex-1 relative">
                  <div className="relative w-full">
                    <input
                      value={heroSearch}
                      onChange={(e) => setHeroSearch(e.target.value)}
                      onFocus={handleSearchFocus}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && heroSearch.trim()) {
                          navigate(
                            `/user/search?q=${encodeURIComponent(heroSearch.trim())}`,
                          );
                          closeSearch();
                          setHeroSearch("");
                        }
                      }}
                      type="text"
                      className="pl-0 pr-8 h-8 sm:h-9 lg:h-11 w-full bg-transparent border-0 text-sm sm:text-base lg:text-lg font-semibold text-gray-700 dark:text-white focus-visible:ring-0 focus-visible:ring-offset-0 rounded-full placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    />
                    {/* Animated placeholder */}
                    {!heroSearch && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none h-5 lg:h-6 overflow-hidden">
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={placeholderIndex}
                            initial={{ y: 16, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -16, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="text-sm sm:text-base lg:text-lg font-semibold text-gray-400 dark:text-gray-500 inline-block"
                          >
                            {placeholders[placeholderIndex]}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                    )}
                    {/* Clear Button */}
                    {heroSearch && (
                      <button
                        onClick={() => setHeroSearch("")}
                        className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 transition-colors z-10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
{/* <button
                  type="button"
                  onClick={startListening}
                  className={`flex-shrink-0 mr-2 sm:mr-3 lg:mr-4 p-1 lg:p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors ${isListening ? "bg-[#EF4F5F]/10" : ""}`}
                >
                  <Mic
                    className={`h-4 w-4 sm:h-4 sm:w-4 lg:h-5 lg:w-5 ${isListening ? "text-[#EF4F5F] animate-pulse" : "text-[#EF4F5F]"}`}
                    strokeWidth={2.5}
                  />
                </button> */}
              </div>
            </div>
          </motion.div>

          {/* VEG MODE Toggle */}
          <motion.div
            ref={vegModeToggleRef}
            className="flex flex-col items-center gap-0.5 sm:gap-1 lg:gap-1.5 flex-shrink-0 relative"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className="flex flex-col items-center">
              <span className="text-green-700 text-[10px] sm:text-[11px] lg:text-xs font-black leading-none">
                VEG
              </span>
              <span className="text-green-700 text-[8px] sm:text-[9px] lg:text-[10px] font-black leading-none">
                MODE
              </span>
            </div>
            <Switch
              checked={vegMode}
              onCheckedChange={handleVegModeChange}
              className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-300 w-9 h-4 sm:w-10 sm:h-5 lg:w-12 lg:h-6 shadow-sm border border-gray-200"
            />
          </motion.div>
        </div>
        </div>
      </div>
      </div>

      {/* 3. Hero Banner Carousel Section */}
      <div className="md:px-6 lg:px-8 xl:px-0 w-full lg:max-w-[1100px] mx-auto">
        <div className="relative w-full overflow-hidden aspect-[2.5/1] md:aspect-[2.5/1] lg:aspect-[3/1] xl:aspect-[3.5/1]">
          {loadingBanners ? (
            <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : heroBannerImages.length > 0 ? (
            <div
              className="relative w-full h-full cursor-grab active:cursor-grabbing overflow-hidden"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {(() => {
                  const index = currentBannerIndex;
                  const image = heroBannerImages[index];
                  const bannerData = heroBannersData[index];
                  const linkedRestaurants = bannerData?.linkedRestaurants || [];
                  const firstRestaurant = linkedRestaurants[0];
                  const restaurantSlug =
                    firstRestaurant?.slug ||
                    firstRestaurant?.restaurantId ||
                    firstRestaurant?._id;
                  const hasLinkedRestaurants = Boolean(restaurantSlug);

                  return (
                    <motion.div
                      key={index}
                      initial={{ x: "100%" }}
                      animate={{ x: 0 }}
                      exit={{ x: "-100%" }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                      className="absolute inset-0 w-full h-full"
                    >
                      <div
                        className="w-full h-full relative"
                        onMouseEnter={() => {
                          if (!hasLinkedRestaurants) return;
                          const firstRestaurant = linkedRestaurants[0];
                          const restaurantSlug =
                            firstRestaurant?.slug ||
                            firstRestaurant?.restaurantId ||
                            firstRestaurant?._id ||
                            firstRestaurant?.id;
                          if (restaurantSlug) {
                            prefetchRestaurant({
                              ...firstRestaurant,
                              slug: restaurantSlug,
                            });
                          }
                        }}
                        onTouchStart={() => {
                          if (!hasLinkedRestaurants) return;
                          const firstRestaurant = linkedRestaurants[0];
                          const restaurantSlug =
                            firstRestaurant?.slug ||
                            firstRestaurant?.restaurantId ||
                            firstRestaurant?._id ||
                            firstRestaurant?.id;
                          if (restaurantSlug) {
                            prefetchRestaurant({
                              ...firstRestaurant,
                              slug: restaurantSlug,
                            });
                          }
                        }}
                        onClick={(e) => {
                          if (!hasLinkedRestaurants) return;
                          const firstRestaurant = linkedRestaurants[0];
                          const restaurantSlug =
                            firstRestaurant?.slug ||
                            firstRestaurant?.restaurantId ||
                            firstRestaurant?._id ||
                            firstRestaurant?.id;
                          if (!restaurantSlug) return;
                          prefetchRestaurant({
                            ...firstRestaurant,
                            slug: restaurantSlug,
                          });
                          navigateWithPriorityPrefetch(
                            e,
                            {
                              ...firstRestaurant,
                              slug: restaurantSlug,
                            },
                            `/restaurants/${restaurantSlug}`,
                          );
                        }}
                        style={{
                          cursor: hasLinkedRestaurants ? "pointer" : "default",
                        }}
                      >
                        <div className="mx-4 md:mx-0 my-2 rounded-2xl overflow-hidden shadow-md h-[calc(100%-16px)]">
                          <OptimizedImage
                            src={image}
                            alt={`Hero Banner ${index + 1}`}
                            className="w-full h-full object-cover"
                            priority={true}
                            sizes="(max-width: 768px) 100vw, 1200px"
                            placeholder="blur"
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>
          ) : (
            <div className="w-full h-full bg-gray-200" />
          )}
        </div>
      </div>

      {/* Rest of Content */}
      <motion.div
        className="relative w-full lg:max-w-[1100px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-0 space-y-0 pt-2 sm:pt-3 lg:pt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        {/* Food Categories - Horizontal Scroll */}
        <motion.section
          className="space-y-1 sm:space-y-1.5 lg:space-y-2"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <div
            ref={categoryScrollRef}
            className="flex gap-3 sm:gap-4 lg:gap-5 xl:gap-6 overflow-x-auto overflow-y-visible scrollbar-hide scroll-smooth px-2 sm:px-3 lg:px-4 py-2 sm:py-3 lg:py-4"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              touchAction: "pan-x pan-y pinch-zoom",
              overflowY: "hidden",
            }}
          >
            {/* Offer Image - Static, Centered */}
            <motion.div
              className="flex-shrink-0 flex flex-col items-center justify-center cursor-pointer"
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.1 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/user/under-250")}
            >
              <div className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl overflow-hidden">
                <OptimizedImage
                  src={offerImage}
                  alt="Special Offer"
                  className="w-full h-full"
                  sizes="(max-width: 640px) 56px, (max-width: 768px) 80px, 96px"
                  objectFit="cover"
                  placeholder="blur"
                />
              </div>
            </motion.div>
            {loadingRealCategories ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : topCategories.length > 0 ? (
              <>
                {/* Show only first 10 categories, filtered by search */}
                {topCategories
                  .filter(cat => heroSearch ? cat.label?.toLowerCase().includes(heroSearch.toLowerCase()) : true)
                  .slice(0, 10)
                  .map((category, index) => (
                    <motion.div
                      key={`real-cat-${category.id || category.slug || index}`}
                      className="flex-shrink-0"
                      initial={{ opacity: 0, y: 20, scale: 0.9 }}
                      whileInView={{ opacity: 1, y: 0, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{
                        duration: 0.4,
                        delay: index * 0.05,
                        type: "spring",
                        stiffness: 100,
                      }}
                      whileHover={{ scale: 1.1, y: -5 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Link
                        to={`/user/category/${category.slug || category.name.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <div className="flex flex-col items-center gap-2 w-[62px] sm:w-24 md:w-28">
                          <div className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full overflow-hidden shadow-md transition-all">
                            <img
                              src={sanitizeImageSrc(category.image, category.slug || category.name)}
                              alt={category.name}
                              className="w-full h-full bg-white rounded-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = fallbackImageBySeed(category.slug || category.name);
                              }}
                              loading="lazy"
                            />
                          </div>
                          <span className="text-xs sm:text-sm md:text-base font-semibold text-gray-800 dark:text-gray-200 text-center">
                            {category.name.length > 7
                              ? `${category.name.slice(0, 7)}...`
                              : category.name}
                          </span>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                {/* See All button - show if there are more than 10 categories */}
                {topCategories.length > 10 && (
                  <motion.div
                    className="flex-shrink-0 cursor-pointer"
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowAllCategoriesModal(true)}
                  >
                    <div className="flex flex-col items-center gap-2 w-[62px] sm:w-24 md:w-28">
                      <div className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full overflow-hidden shadow-md transition-all bg-[#EF4F5F]/10 flex items-center justify-center">
                        <div className="flex items-center justify-center w-full h-full">
                          <UtensilsCrossed className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[#EF4F5F]" />
                        </div>
                      </div>
                      <span className="text-xs sm:text-sm md:text-base font-semibold text-gray-800 dark:text-gray-200 text-center">
                        See all
                      </span>
                    </div>
                  </motion.div>
                )}
              </>
            ) : landingCategories.length > 0 ? (
              <>
                {/* Show only first 10 categories */}
                {landingCategories.slice(0, 10).map((category, index) => (
                  <motion.div
                    key={`landing-cat-${category._id || category.id || category.slug || index}`}
                    className="flex-shrink-0"
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 0.4,
                      delay: index * 0.05,
                      type: "spring",
                      stiffness: 100,
                    }}
                    whileHover={{ scale: 1.1, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Link
                      to={`/user/category/${category.slug || category.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div className="flex flex-col items-center gap-2 w-[62px] sm:w-24 md:w-28">
                        <div className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full overflow-hidden shadow-md transition-all">
                          <img
                            src={sanitizeImageSrc(category.imageUrl, category.slug || category.label)}
                            alt={category.label}
                            className="w-full h-full bg-white rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = fallbackImageBySeed(category.slug || category.label);
                            }}
                            loading="lazy"
                          />
                        </div>
                        <span className="text-xs sm:text-sm md:text-base font-semibold text-gray-800 dark:text-gray-200 text-center">
                          {category.label.length > 7
                            ? `${category.label.slice(0, 7)}...`
                            : category.label}
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))}
                {/* See All button - show if there are more than 10 categories */}
                {landingCategories.length > 10 && (
                  <motion.div
                    className="flex-shrink-0 cursor-pointer"
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowAllCategoriesModal(true)}
                  >
                    <div className="flex flex-col items-center gap-2 w-[62px] sm:w-24 md:w-28">
                      <div className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full overflow-hidden shadow-md transition-all bg-[#EF4F5F]/10 flex items-center justify-center">
                        <div className="flex items-center justify-center w-full h-full">
                          <UtensilsCrossed className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[#EF4F5F]" />
                        </div>
                      </div>
                      <span className="text-xs sm:text-sm md:text-base font-semibold text-gray-800 dark:text-gray-200 text-center">
                        See all
                      </span>
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              // No categories available from API
              <div className="flex items-center justify-center py-4 text-gray-500 text-sm">
                No categories available
              </div>
            )}
          </div>
        </motion.section>

        {/* Top Brands / Best Restaurants - Horizontal Scroll */}
        <motion.section
          className="space-y-2 mt-3 sm:mt-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="px-3 sm:px-4 md:px-6 lg:px-8 flex items-center justify-between">
            <h3 className="text-sm sm:text-base md:text-lg font-bold text-gray-900 dark:text-gray-100">
              Top Brands
            </h3>
          </div>
          <div
            className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto overflow-y-hidden scrollbar-hide scroll-smooth snap-x snap-mandatory px-3 sm:px-4 lg:px-6 py-2 sm:py-3"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              touchAction: "pan-x",
            }}
          >
            {loadingRestaurants ? (
              [...Array(6)].map((_, i) => (
                <div
                  key={`brand-skeleton-${i}`}
                  className="flex flex-col items-center gap-2 w-[74px] sm:w-[92px] md:w-[104px] animate-pulse shrink-0 snap-start"
                >
                  <div className="w-14 h-14 sm:w-[72px] sm:h-[72px] md:w-20 md:h-20 rounded-full bg-gray-200 dark:bg-gray-800" />
                  <div className="h-3 w-14 sm:w-16 bg-gray-200 dark:bg-gray-800 rounded" />
                </div>
              ))
            ) : visibleTopBrands.length > 0 ? (
              <>
                {visibleTopBrands.map((restaurant, index) => (
                  <motion.div
                    key={`brand-${restaurant.id || index}`}
                    className="shrink-0 snap-start"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.25,
                      delay: Math.min(index * 0.03, 0.2),
                    }}
                    whileHover={{ scale: 1.05, y: -3 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Link
                      to={`/restaurants/${restaurant.slug || restaurant.id}`}
                      onMouseEnter={() => prefetchRestaurant(restaurant)}
                      onFocus={() => prefetchRestaurant(restaurant)}
                      onTouchStart={() => prefetchRestaurant(restaurant)}
                      onClick={(e) =>
                        navigateWithPriorityPrefetch(
                          e,
                          restaurant,
                          `/restaurants/${restaurant.slug || restaurant.id}`,
                        )
                      }
                    >
                      <div className="flex flex-col items-center gap-2 w-[74px] sm:w-[92px] md:w-[104px]">
                        <div className="relative w-14 h-14 sm:w-[72px] sm:h-[72px] md:w-20 md:h-20 rounded-full overflow-hidden shadow-sm transition-all border border-gray-100 dark:border-gray-800 bg-white">
                          <div className="w-full h-full rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 flex items-center justify-center">
                            <Store className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>
                          {isLikelyImageUrl(restaurant.image) ? (
                            <img
                              src={restaurant.image}
                              alt={restaurant.name}
                              className="absolute inset-0 w-full h-full bg-white rounded-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                              loading={index < 4 ? "eager" : "lazy"}
                              decoding="async"
                            />
                          ) : null}
                        </div>
                        <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 text-center leading-tight line-clamp-1 w-full px-1">
                          {restaurant.name}
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))}

                {/* See All button - show if there are more than 10 restaurants */}
                <motion.div
                  className="shrink-0 snap-start cursor-pointer"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate("/user/restaurants")}
                >
                  <div className="flex flex-col items-center gap-2 w-[74px] sm:w-[92px] md:w-[104px]">
                    <div className="w-14 h-14 sm:w-[72px] sm:h-[72px] md:w-20 md:h-20 rounded-full overflow-hidden shadow-sm transition-all bg-[#EF4F5F] flex items-center justify-center">
                      <div className="flex items-center justify-center w-full h-full">
                        <Store className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-white" />
                      </div>
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 text-center leading-tight">
                      See all
                    </span>
                  </div>
                </motion.div>
              </>
            ) : (
              <div className="w-full py-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                No brands available right now
              </div>
            )}
          </div>
        </motion.section>

        {/* Filters */}
        <motion.section
          className="py-1 lg:py-2"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div
            className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 overflow-x-auto scrollbar-hide pb-1 lg:pb-2 pr-4"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {/* Filter Buttons */}
            {[
              { id: "delivery-under-30", label: "Under 30 mins" },
              { id: "delivery-under-45", label: "Under 45 mins" },
              { id: "distance-under-1km", label: "Under 1km", icon: MapPin },
              { id: "distance-under-2km", label: "Under 2km", icon: MapPin },
            ].map((filter, index) => {
              const Icon = filter.icon;
              const isActive = activeFilters.has(filter.id);
              return (
                <motion.div
                  key={filter.id}
                  className="flex-shrink-0"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    variant="outline"
                    onClick={() => {
                      toggleFilter(filter.id);
                      setIsLoadingFilterResults(true);
                      // Simulate loading for 1 second
                      setTimeout(() => {
                        setIsLoadingFilterResults(false);
                      }, 500);
                    }}
                    className={`h-7 sm:h-8 px-2 sm:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 transition-all font-medium ${isActive
                      ? "bg-[#EF4F5F] text-white border border-[#EF4F5F] hover:bg-[#EF4F5F]/90"
                      : "bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                      }`}
                  >
                    {Icon && (
                      <Icon
                        className={`h-3 w-3 sm:h-4 sm:w-4 ${isActive ? "fill-white" : ""}`}
                      />
                    )}
                    <span className="text-xs sm:text-sm font-bold text-black dark:text-white">
                      {filter.label}
                    </span>
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {showDeferredSections ? (
          <>
        {/* Explore More Section */}
        <motion.section
          className="pt-2 sm:pt-3 lg:pt-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
        >
          <motion.h2
            className="text-xs sm:text-sm lg:text-base font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase mb-2 sm:mb-3 lg:mb-4 px-1"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {exploreMoreHeading}
          </motion.h2>
          <div
            className="flex gap-2 sm:gap-3 lg:gap-4 overflow-x-auto scrollbar-hide pb-2 lg:pb-3"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {loadingLandingConfig ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : landingExploreMore.length === 0 ? (
              // Fallback to hardcoded explore more if API returns empty
              [
                {
                  id: "offers",
                  label: "Offers",
                  image: exploreOffers,
                  href: "/user/offers",
                },
                {
                  id: "gourmet",
                  label: "Gourmet",
                  image: exploreGourmet,
                  href: "/user/gourmet",
                },
                {
                  id: "top10",
                  label: "Top 10",
                  image: exploreTop10,
                  href: "/user/top-10",
                },
                {
                  id: "collection",
                  label: "Collections",
                  image: exploreCollection,
                  href: "/user/profile/favorites",
                },
              ].map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.1,
                    type: "spring",
                    stiffness: 100,
                  }}
                  whileHover={{ scale: 1.1, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link
                    to={item.href}
                    className="flex-shrink-0 bg-white  dark:bg-[#1a1a1a]/80 dark:text-white"
                  >
                    <div className="flex flex-col items-center gap-2.5 w-24 sm:w-28 md:w-32 group">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl bg-white dark:bg-[#1a1a1a]/80 dark:text-white flex items-center justify-center shadow-sm group-hover:shadow-lg transition-all duration-300 overflow-hidden p-2.5">
                        <OptimizedImage
                          src={item.image}
                          alt={item.label}
                          className="w-full h-full dark:rounded-md"
                          sizes="(max-width: 640px) 80px, (max-width: 768px) 96px, 112px"
                          objectFit="contain"
                          placeholder="blur"
                        />
                      </div>
                      <span className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">
                        {item.label}
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))
            ) : (
              landingExploreMore
                .filter(
                  (item) =>
                    item.id !== "giftcard" &&
                    item.label?.toLowerCase() !== "gift card",
                )
                .map((item, index) => (
                  <motion.div
                    key={item._id}
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 0.4,
                      delay: index * 0.1,
                      type: "spring",
                      stiffness: 100,
                    }}
                    whileHover={{ scale: 1.1, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Link
                      to={item.link}
                      className="flex-shrink-0 bg-white dark:bg-[#1a1a1a]/80 dark:text-white"
                    >
                      <div className="flex flex-col items-center gap-2.5 w-24 sm:w-28 md:w-32 group">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl bg-white dark:bg-[#1a1a1a]/80 dark:text-white  flex items-center justify-center shadow-sm group-hover:shadow-lg transition-all duration-300 overflow-hidden p-2.5">
                          <OptimizedImage
                            src={item.imageUrl}
                            alt={item.label}
                            className="w-full h-full"
                            sizes="(max-width: 640px) 80px, (max-width: 768px) 96px, 112px"
                            objectFit="contain"
                            placeholder="blur"
                            onError={() => { }}
                          />
                        </div>
                        <span className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">
                          {item.label}
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))
            )}
          </div>
        </motion.section>

        {!loadingLandingConfig && Array.isArray(mofoodProductSections) && mofoodProductSections.length > 0 && (
          <motion.section
            className="pt-2 sm:pt-3 lg:pt-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5 }}
          >
            {mofoodProductSections.map((section, sectionIndex) => (
              <div key={`mofood-section-${section.name}-${sectionIndex}`} className="mb-4 sm:mb-5">
                <div className="flex items-center justify-between px-1 mb-2 sm:mb-3">
                  <h3 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-gray-100 tracking-tight">
                    {section.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => navigate("/user/restaurants")}
                    className="text-sm sm:text-base font-bold text-green-600 dark:text-green-400"
                  >
                    see all
                  </button>
                </div>

                <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
                  {(Array.isArray(section.products) ? section.products : []).map((entry, itemIndex) => {
                    const restaurant = entry?.restaurant || {};
                    const product = entry?.product || {};
                    const restaurantId = String(restaurant?._id || "");
                    const menuItemId = String(product?.menuItemId || "");
                    const cartItemId = `mf-${restaurantId}-${menuItemId}`;
                    const image =
                      product?.image ||
                      restaurant?.profileImage?.url ||
                      restaurant?.profileImage ||
                      foodImages[(sectionIndex + itemIndex) % foodImages.length];
                    const price = Number(product?.price || 0);
                    const originalPrice = Number(product?.originalPrice || price || 0);
                    const alreadyInCart = (Array.isArray(cart) ? cart : []).some((item) => {
                      const currentId = String(item?.id || item?.itemId || "");
                      return currentId === cartItemId;
                    });
                    const deliveryText = String(restaurant?.estimatedDeliveryTime || "8 MINS").toUpperCase();

                    return (
                      <div
                        key={`mofood-item-${entry?._id || cartItemId || itemIndex}`}
                        className="min-w-[168px] max-w-[168px] rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#111a28] p-2.5 shadow-sm"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={(e) => {
                            if (restaurant?.slug) {
                              navigateWithPriorityPrefetch(
                                e,
                                restaurant,
                                `/user/restaurants/${restaurant.slug}`,
                              );
                            }
                          }}
                        >
                          <div className="w-full h-[98px] rounded-xl bg-slate-50 dark:bg-[#0d1624] overflow-hidden flex items-center justify-center mb-2">
                            <OptimizedImage
                              src={image}
                              alt={product?.name || "Product"}
                              className="w-full h-full"
                              objectFit="contain"
                              placeholder="blur"
                            />
                          </div>
                          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-300 mb-1">{deliveryText}</p>
                          <p className="text-[17px] font-extrabold text-slate-900 dark:text-slate-100 leading-[1.05] line-clamp-2 min-h-[34px]">
                            {product?.name || "Product"}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                            {restaurant?.name || "Restaurant"}
                          </p>
                        </button>

                        <div className="mt-2 flex items-end justify-between gap-2">
                          <div>
                            <p className="text-[30px] leading-[0.95] font-black text-slate-900 dark:text-slate-100">₹{price}</p>
                            {originalPrice > price && (
                              <p className="text-xs text-slate-400 dark:text-slate-500 line-through">₹{originalPrice}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (alreadyInCart) return;
                              addToCart({
                                id: cartItemId,
                                itemId: cartItemId,
                                menuItemId,
                                name: product?.name || "Product",
                                price,
                                mrp: originalPrice,
                                image,
                                restaurantId,
                                restaurant: restaurant?.name || "Restaurant",
                                platform: "mofood",
                              });
                            }}
                            className={`h-8 px-3 rounded-lg text-xs font-[900] border ${alreadyInCart
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                              : "bg-white text-[#2f8d2f] border-[#79b879]"
                              }`}
                          >
                            {alreadyInCart ? "ADDED" : "ADD"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.section>
        )}

        {/* Featured Foods - Horizontal Scroll */}
          </>
        ) : (
          <div className="pt-4 px-1">
            <div className="h-24 rounded-3xl bg-gray-100 dark:bg-gray-900 animate-pulse" />
          </div>
        )}

        {/* Restaurants - Enhanced with Animations */}
        <motion.section
          className="space-y-0 pt-3 sm:pt-4 lg:pt-6 pb-4 md:pb-6"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="px-1 mb-3 lg:mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex flex-col gap-0.5 lg:gap-1">
              <h2 className="text-xs sm:text-sm lg:text-base font-semibold text-gray-400 tracking-widest uppercase">
                {filteredRestaurants.length} Restaurants Delivering to You
              </h2>
              <span className="text-base sm:text-lg lg:text-2xl text-gray-500 font-normal">
                Featured
              </span>
            </div>
          </motion.div>
          <div className="relative">
            {/* Loading Overlay */}
            <AnimatePresence>
              {(isLoadingFilterResults || loadingRestaurants) && (
                <motion.div
                  className="absolute inset-0 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg min-h-[400px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex flex-col items-center gap-3">
                    <Loader2
                      className="h-8 w-8 text-[#EF4F5F] animate-spin"
                      strokeWidth={2.5}
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-white">
                      Loading restaurants...
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {isOutOfService && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-semibold text-red-700">You are out of zone</p>
              </div>
            )}
            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3  gap-3 sm:gap-4 lg:gap-5 xl:gap-6 pt-1 sm:pt-1.5 lg:pt-2 items-stretch ${isLoadingFilterResults || loadingRestaurants ? "opacity-50" : "opacity-100"} transition-opacity duration-300`}
            >
              {displayedRestaurants.map((restaurant, index) => {
                const restaurantSlug =
                  restaurant.slug ||
                  restaurant.name.toLowerCase().replace(/\s+/g, "-");
                // Direct favorite check - isFavorite is already memoized in context
                const favorite = isFavorite(restaurantSlug);

                const handleToggleFavorite = (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (favorite) {
                    // If already bookmarked, show Manage Collections modal
                    setSelectedRestaurantSlug(restaurantSlug);
                    setShowManageCollections(true);
                  } else {
                    // Add to favorites and show toast
                    addFavorite({
                      slug: restaurantSlug,
                      name: restaurant.name,
                      cuisine: restaurant.cuisine,
                      rating: restaurant.rating,
                      deliveryTime: restaurant.deliveryTime,
                      distance: restaurant.distance,
                      priceRange: restaurant.priceRange,
                      image: restaurant.image,
                    });
                    setShowToast(true);
                    setTimeout(() => {
                      setShowToast(false);
                    }, 3000);
                  }
                };

                return (
                  <motion.div
                    key={restaurant.id}
                    className="h-full"
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{
                      duration: 0.5,
                      delay: index * 0.1,
                      type: "spring",
                      stiffness: 100,
                    }}
                    style={{ perspective: 1000 }}
                  >
                    <motion.div
                      className="h-full"
                      whileHover="hover"
                      initial="rest"
                      variants={{
                        rest: {
                          y: 0,
                          scale: 1,
                          rotateX: 0,
                          rotateY: 0,
                          boxShadow:
                            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                        },
                        hover: {
                          y: -12,
                          scale: 1.02,
                          rotateX: 2,
                          rotateY: 0,
                          boxShadow:
                            "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(239, 68, 68, 0.1)",
                          transition: {
                            type: "spring",
                            stiffness: 300,
                            damping: 20,
                            mass: 0.5,
                          },
                        },
                      }}
                    >
                      <Link
                        to={`/user/restaurants/${restaurantSlug}`}
                        className="h-full flex"
                        onMouseEnter={() => prefetchRestaurant(restaurant)}
                        onFocus={() => prefetchRestaurant(restaurant)}
                        onTouchStart={() => prefetchRestaurant(restaurant)}
                        onClick={(e) =>
                          navigateWithPriorityPrefetch(
                            e,
                            restaurant,
                            `/user/restaurants/${restaurantSlug}`,
                          )
                        }
                      >
                        <Card
                          className={`overflow-hidden gap-0 cursor-pointer border border-gray-100 dark:border-gray-800 group bg-white dark:bg-[#1a1a1a] transition-all duration-300 py-0 rounded-[24px] flex flex-col h-full w-full relative shadow-sm hover:shadow-md ${isOutOfService ? "grayscale opacity-75" : ""
                            }`}
                        >
                          {/* Image Section */}
                          <div className="relative aspect-[16/9] overflow-hidden rounded-t-[24px]">
                            <RestaurantImageCarousel
                              images={restaurant.images || [restaurant.image]}
                              restaurantName={restaurant.name}
                              restaurantId={restaurant.id}
                              priority={index === 0}
                            />

                            {/* Promoted Badge */}
                            {restaurant.isPromoted && (
                              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white md:text-[8px] text-[7px] px-1.5 py-0.5 rounded flex items-center gap-1 z-10 font-medium uppercase tracking-wider">
                                Promoted
                              </div>
                            )}

                            {/* Bookmark Icon */}
                            <motion.div
                              variants={{
                                rest: { scale: 1 },
                                hover: { scale: 1.1 },
                              }}
                              transition={{ duration: 0.2 }}
                              className="absolute top-3 right-3 z-10"
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleToggleFavorite}
                                className={`h-8 w-8 rounded-full border flex items-center justify-center transition-all duration-300 ${favorite
                                  ? "border-[#EF4F5F] bg-[#EF4F5F]/10 text-[#EF4F5F]"
                                  : "border-white bg-white/90 text-gray-600 hover:bg-white"
                                  }`}
                              >
                                <Bookmark
                                  className={`h-4 w-4 transition-all duration-300 ${favorite ? "fill-[#EF4F5F]" : ""
                                    }`}
                                />
                              </Button>
                            </motion.div>
                          </div>

                          {/* Content Section */}
                          <CardContent className="p-3 sm:px-4 py-3 flex flex-col flex-grow">
                            <div className="flex justify-between items-start">
                              {/* Left Info */}
                              <div className="flex-1 min-w-0 pr-2">
                                <h3 className="text-[17px] font-bold text-neutral-900 dark:text-gray-100 line-clamp-1 leading-tight mb-0.5">
                                  {restaurant.name}
                                </h3>
                                <p className="text-[12px] text-neutral-500 dark:text-gray-500 font-medium truncate">
                                  {restaurant.cuisine ||
                                    "North Indian, Fast Food, Chinese"}
                                </p>
                              </div>

                              {/* Right Info */}
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <div className="bg-[#15803d] text-white px-1.5 py-0.5 rounded-md flex items-center gap-0.5 text-[11px] font-bold">
                                  <span>{restaurant.rating > 0 ? restaurant.rating : "N/A"}</span>
                                  <Star
                                    className="h-2.5 w-2.5 fill-white text-white"
                                    strokeWidth={3}
                                  />
                                </div>
                                <p className="text-[11px] text-neutral-500 dark:text-gray-400 font-medium whitespace-nowrap">
                                  ₹{restaurant.priceRange || "200"} for one
                                </p>
                                <p className="text-[11px] text-neutral-500 dark:text-gray-400 font-medium">
                                  {restaurant.deliveryTime || "25-30"} min
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>
          </div>
          {!renderAllRestaurants && filteredRestaurants.length > displayedRestaurants.length && (
            <div className="px-1 pt-3 text-center text-sm text-gray-500 dark:text-gray-400">
              Loading more restaurants...
            </div>
          )}
          <div className="flex justify-center pt-2 sm:pt-3">
            {/* <Link to="/user/restaurants">
              <Button variant="outline" className="bg-transparent outline-none text-[#EF4F5F]/80 hover:opacity-80 border-none underline shadow-none  text-xs sm:text-sm md:text-base sm:hidden">
                See All Restaurants
              </Button>
            </Link> */}
          </div>
        </motion.section>
      </motion.div>

      {/* Filter Modal - Bottom Sheet */}
      <AnimatePresence>
        {isFilterOpen && (
          <div className="fixed inset-0 z-[100]">
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/50"
              onClick={() => setIsFilterOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />

            {/* Modal Content */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] rounded-t-3xl max-h-[85vh] flex flex-col"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 400,
                duration: 0.3,
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-4 border-b dark:border-gray-800">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  Filters and sorting
                </h2>
                <button
                  onClick={() => {
                    setActiveFilters(new Set());
                    setSortBy(null);
                    setSelectedCuisine(null);
                  }}
                  className="text-[#EF4F5F]/80 font-medium text-sm"
                >
                  Clear all
                </button>
              </div>

              {/* Body */}
              <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar - Tabs */}
                <div className="w-24 sm:w-28 bg-gray-50 dark:bg-[#0a0a0a] border-r dark:border-gray-800 flex flex-col">
                  {[
                    { id: "sort", label: "Sort By", icon: ArrowDownUp },
                    { id: "time", label: "Time", icon: Timer },
                    { id: "rating", label: "Rating", icon: Star },
                    { id: "distance", label: "Distance", icon: MapPin },
                    { id: "price", label: "Dish Price", icon: IndianRupee },
                    { id: "cuisine", label: "Cuisine", icon: UtensilsCrossed },
                    { id: "offers", label: "Offers", icon: BadgePercent },
                    { id: "trust", label: "Trust", icon: ShieldCheck },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive =
                      activeScrollSection === tab.id ||
                      activeFilterTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveFilterTab(tab.id);
                          const section = filterSectionRefs.current[tab.id];
                          if (section) {
                            section.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }
                        }}
                        className={`flex flex-col items-center gap-1 py-4 px-2 text-center relative transition-colors ${isActive
                          ? "bg-white dark:bg-[#1a1a1a] text-[#EF4F5F]/80"
                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                          }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#EF4F5F]/80 rounded-r" />
                        )}
                        <Icon className="h-5 w-5" strokeWidth={1.5} />
                        <span className="text-xs font-medium leading-tight">
                          {tab.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Right Content Area - Scrollable */}
                <div
                  ref={rightContentRef}
                  className="flex-1 overflow-y-auto p-4"
                >
                  {/* Sort By Tab */}
                  <div
                    ref={(el) => (filterSectionRefs.current["sort"] = el)}
                    data-section-id="sort"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Sort by
                    </h3>
                    <div className="flex flex-col gap-3">
                      {[
                        { id: null, label: "Relevance" },
                        { id: "price-low", label: "Price: Low to High" },
                        { id: "price-high", label: "Price: High to Low" },
                        { id: "rating-high", label: "Rating: High to Low" },
                        { id: "rating-low", label: "Rating: Low to High" },
                      ].map((option) => (
                        <button
                          key={option.id || "relevance"}
                          onClick={() => setSortBy(option.id)}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${sortBy === option.id
                            ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                            : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                            }`}
                        >
                          <span
                            className={`text-sm font-medium ${sortBy === option.id ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                          >
                            {option.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Tab */}
                  <div
                    ref={(el) => (filterSectionRefs.current["time"] = el)}
                    data-section-id="time"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Delivery Time
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter("delivery-under-30")}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has("delivery-under-30")
                          ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                          : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                          }`}
                      >
                        <Timer
                          className={`h-6 w-6 ${activeFilters.has("delivery-under-30") ? "text-[#EF4F5F]/80" : "text-gray-600 dark:text-gray-400"}`}
                          strokeWidth={1.5}
                        />
                        <span
                          className={`text-sm font-medium ${activeFilters.has("delivery-under-30") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          Under 30 mins
                        </span>
                      </button>
                      <button
                        onClick={() => toggleFilter("delivery-under-45")}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has("delivery-under-45")
                          ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                          : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                          }`}
                      >
                        <Timer
                          className={`h-6 w-6 ${activeFilters.has("delivery-under-45") ? "text-[#EF4F5F]/80" : "text-gray-600 dark:text-gray-400"}`}
                          strokeWidth={1.5}
                        />
                        <span
                          className={`text-sm font-medium ${activeFilters.has("delivery-under-45") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          Under 45 mins
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Rating Tab */}
                  <div
                    ref={(el) => (filterSectionRefs.current["rating"] = el)}
                    data-section-id="rating"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900  dark:text-white mb-4">
                      Restaurant Rating
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter("rating-35-plus")}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has("rating-35-plus")
                          ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                          : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                          }`}
                      >
                        <Star
                          className={`h-6 w-6 ${activeFilters.has("rating-35-plus") ? "text-yellow-500 fill-yellow-500" : "text-gray-400 dark:text-gray-500"}`}
                        />
                        <span
                          className={`text-sm font-medium ${activeFilters.has("rating-35-plus") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          Rated 3.5+
                        </span>
                      </button>
                      <button
                        onClick={() => toggleFilter("rating-4-plus")}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has("rating-4-plus")
                          ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                          : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                          }`}
                      >
                        <Star
                          className={`h-6 w-6 ${activeFilters.has("rating-4-plus") ? "text-yellow-500 fill-yellow-500" : "text-gray-400 dark:text-gray-500"}`}
                        />
                        <span
                          className={`text-sm font-medium ${activeFilters.has("rating-4-plus") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          Rated 4.0+
                        </span>
                      </button>
                      <button
                        onClick={() => toggleFilter("rating-45-plus")}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has("rating-45-plus")
                          ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                          : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                          }`}
                      >
                        <Star
                          className={`h-6 w-6 ${activeFilters.has("rating-45-plus") ? "text-yellow-500 fill-yellow-500" : "text-gray-400 dark:text-gray-500"}`}
                        />
                        <span
                          className={`text-sm font-medium ${activeFilters.has("rating-45-plus") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          Rated 4.5+
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Distance Tab */}
                  <div
                    ref={(el) => (filterSectionRefs.current["distance"] = el)}
                    data-section-id="distance"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Distance
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter("distance-under-1km")}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has("distance-under-1km")
                          ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                          : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                          }`}
                      >
                        <MapPin
                          className={`h-6 w-6 ${activeFilters.has("distance-under-1km") ? "text-[#EF4F5F]/80" : "text-gray-600 dark:text-gray-400"}`}
                          strokeWidth={1.5}
                        />
                        <span
                          className={`text-sm font-medium ${activeFilters.has("distance-under-1km") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          Under 1 km
                        </span>
                      </button>
                      <button
                        onClick={() => toggleFilter("distance-under-2km")}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has("distance-under-2km")
                          ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                          : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                          }`}
                      >
                        <MapPin
                          className={`h-6 w-6 ${activeFilters.has("distance-under-2km") ? "text-[#EF4F5F]/80" : "text-gray-600 dark:text-gray-400"}`}
                          strokeWidth={1.5}
                        />
                        <span
                          className={`text-sm font-medium ${activeFilters.has("distance-under-2km") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          Under 2 km
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Price Tab */}
                  <div
                    ref={(el) => (filterSectionRefs.current["price"] = el)}
                    data-section-id="price"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Dish Price
                    </h3>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => toggleFilter("price-under-200")}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has("price-under-200")
                          ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                          : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                          }`}
                      >
                        <span
                          className={`text-sm font-medium ${activeFilters.has("price-under-200") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          Under ₹200
                        </span>
                      </button>
                      <button
                        onClick={() => toggleFilter("price-under-500")}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has("price-under-500")
                          ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                          : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                          }`}
                      >
                        <span
                          className={`text-sm font-medium ${activeFilters.has("price-under-500") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          Under ₹500
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Cuisine Tab */}
                  <div
                    ref={(el) => (filterSectionRefs.current["cuisine"] = el)}
                    data-section-id="cuisine"
                    className="space-y-4 mb-8"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Cuisine
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        "Chinese",
                        "American",
                        "Japanese",
                        "Italian",
                        "Mexican",
                        "Indian",
                        "Asian",
                        "Seafood",
                        "Desserts",
                        "Cafe",
                        "Healthy",
                      ].map((cuisine) => (
                        <button
                          key={cuisine}
                          onClick={() =>
                            setSelectedCuisine(
                              selectedCuisine === cuisine ? null : cuisine,
                            )
                          }
                          className={`px-4 py-3 rounded-xl border text-center transition-colors ${selectedCuisine === cuisine
                            ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                            : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                            }`}
                        >
                          <span
                            className={`text-sm font-medium ${selectedCuisine === cuisine ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                          >
                            {cuisine}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Trust Markers Tab */}
                  {activeFilterTab === "trust" && (
                    <div
                      ref={(el) => (filterSectionRefs.current["trust"] = el)}
                      data-section-id="trust"
                      className="space-y-4 mb-8"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Trust Markers
                      </h3>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => toggleFilter("top-rated")}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has("top-rated")
                            ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                            : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                            }`}
                        >
                          <span
                            className={`text-sm font-medium ${activeFilters.has("top-rated") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                          >
                            Top Rated
                          </span>
                        </button>
                        <button
                          onClick={() => toggleFilter("trusted")}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has("trusted")
                            ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                            : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                            }`}
                        >
                          <span
                            className={`text-sm font-medium ${activeFilters.has("trusted") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                          >
                            Trusted by 1000+ users
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Offers Tab */}
                  {activeFilterTab === "offers" && (
                    <div
                      ref={(el) => (filterSectionRefs.current["offers"] = el)}
                      data-section-id="offers"
                      className="space-y-4 mb-8"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Offers
                      </h3>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() => toggleFilter("has-offers")}
                          className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has("has-offers")
                            ? "border-[#EF4F5F]/80 bg-rose-50 dark:bg-rose-900/20"
                            : "border-gray-200 dark:border-gray-800 hover:border-[#EF4F5F]/80"
                            }`}
                        >
                          <span
                            className={`text-sm font-medium ${activeFilters.has("has-offers") ? "text-[#EF4F5F]/80" : "text-gray-700 dark:text-gray-300"}`}
                          >
                            Restaurants with offers
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 px-4 py-4 border-t dark:border-gray-800 bg-white dark:bg-[#1a1a1a]">
                <button
                  onClick={() => setIsFilterOpen(false)}
                  className="flex-1 py-3 text-center font-semibold text-gray-700 dark:text-gray-300"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    // Apply filters
                    setAppliedFilters({
                      activeFilters: new Set(activeFilters),
                      sortBy,
                      selectedCuisine,
                    });
                    setIsLoadingFilterResults(true);
                    setIsFilterOpen(false);

                    // Refetch restaurants with new filters
                    try {
                      await fetchRestaurants({
                        activeFilters: new Set(activeFilters),
                        sortBy,
                        selectedCuisine,
                      });
                    } catch (error) {
                      console.error("Error applying filters:", error);
                    } finally {
                      setIsLoadingFilterResults(false);
                    }
                  }}
                  className={`flex-1 py-3 font-semibold rounded-xl transition-colors ${activeFilters.size > 0 || sortBy || selectedCuisine
                    ? "bg-[#EF4F5F]/80 text-white hover:bg-[#EF4F5F]"
                    : "bg-gray-200 text-gray-500"
                    }`}
                  disabled={isLoadingFilterResults}
                >
                  {isLoadingFilterResults
                    ? "Loading..."
                    : activeFilters.size > 0 || sortBy || selectedCuisine
                      ? `Show results`
                      : "Show results"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Veg Mode Popup */}
      <AnimatePresence>
        {showVegModePopup && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setShowVegModePopup(false);
                // Revert veg mode to OFF if popup is closed without applying
                setVegModeContext(false);
                setPrevVegMode(false);
              }}
              className="fixed inset-0 bg-black/30 z-[9998] backdrop-blur-sm"
            />

            {/* Popup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{
                type: "spring",
                damping: 25,
                stiffness: 300,
                mass: 0.8,
              }}
              className="fixed z-[9999] bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl p-4 w-[calc(100%-2rem)] max-w-xs"
              style={{
                top: `${popupPosition.top}px`,
                right: `${popupPosition.right}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Pointer Triangle */}
              <div
                className="absolute -top-2 right-5 w-3 h-3 bg-white dark:bg-[#1a1a1a] transform rotate-45"
                style={{
                  boxShadow: "-2px -2px 4px rgba(0,0,0,0.1)",
                }}
              />

              {/* Title */}
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">
                See veg dishes from
              </h3>

              {/* Radio Options */}
              <div className="space-y-2 mb-4">
                {/* All restaurants */}
                <label
                  className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => setVegModeOption("all")}
                >
                  <div className="relative flex items-center justify-center">
                    <input
                      type="radio"
                      name="vegModeOption"
                      value="all"
                      checked={vegModeOption === "all"}
                      onChange={() => setVegModeOption("all")}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${vegModeOption === "all"
                        ? "border-[#EF4F5F]/80 dark:border-[#EF4F5F]/80 bg-[#EF4F5F]/80 dark:bg-[#EF4F5F]/80"
                        : "border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a2a2a]"
                        }`}
                    >
                      {vegModeOption === "all" && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-white" />
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    All restaurants
                  </span>
                </label>

                {/* Pure Veg restaurants only */}
                <label
                  className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => setVegModeOption("pure-veg")}
                >
                  <div className="relative flex items-center justify-center">
                    <input
                      type="radio"
                      name="vegModeOption"
                      value="pure-veg"
                      checked={vegModeOption === "pure-veg"}
                      onChange={() => setVegModeOption("pure-veg")}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${vegModeOption === "pure-veg"
                        ? "border-green-600 dark:border-green-500 bg-green-600 dark:bg-green-500"
                        : "border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a2a2a]"
                        }`}
                    >
                      {vegModeOption === "pure-veg" && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-white" />
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Pure Veg restaurants only
                  </span>
                </label>
              </div>

              {/* Apply Button */}
              <button
                onClick={() => {
                  setShowVegModePopup(false);
                  setIsApplyingVegMode(true);
                  // Confirm veg mode is ON by updating context and prevVegMode
                  setVegModeContext(true);
                  setPrevVegMode(true);
                  // Simulate applying veg mode settings
                  setTimeout(() => {
                    setIsApplyingVegMode(false);
                  }, 2000);
                }}
                className="w-full bg-green-600 text-white font-semibold py-2.5 rounded-xl hover:bg-green-700 transition-colors mb-2 text-sm"
              >
                Apply
              </button>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Switch Off Veg Mode Popup */}
      <AnimatePresence>
        {showSwitchOffPopup && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setShowSwitchOffPopup(false);
                isHandlingSwitchOff.current = false;
                setVegModeContext(true);
                // prevVegMode stays true (from before), which is correct
              }}
              className="fixed inset-0 bg-black/50 z-[9998] backdrop-blur-sm"
            />

            {/* Popup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                type: "spring",
                damping: 25,
                stiffness: 300,
                mass: 0.8,
              }}
              className="fixed inset-0 z-[9999] flex dark:bg-[#lalala] dark:text-white items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white dark:bg-[#lalala] dark:text-white rounded-2xl shadow-2xl w-[85%] max-w-sm p-6">
                {/* Warning Icon */}
                <div className="flex justify-center mb-4">
                  <div className="w-20 h-20 rounded-full bg-pink-100 flex items-center justify-center">
                    <AlertCircle
                      className="w-20 h-20 text-white bg-[#EF4F5F]/80/90 rounded-full p-2"
                      strokeWidth={2.5}
                    />
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-gray-900  text-center mb-2">
                  Switch off Veg Mode?
                </h2>

                {/* Description */}
                <p className="text-gray-600 text-center mb-6 text-sm">
                  You'll see all restaurants, including those serving non-veg
                  dishes
                </p>

                {/* Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setShowSwitchOffPopup(false);
                      setIsSwitchingOffVegMode(true);
                      // Simulate switching off veg mode
                      setTimeout(() => {
                        setIsSwitchingOffVegMode(false);
                        isHandlingSwitchOff.current = false;
                        setVegModeContext(false);
                        setPrevVegMode(false); // Set to false to match current state (veg mode is OFF)
                      }, 2000);
                    }}
                    className="w-full bg-transparent text-[#EF4F5F] font-normal py-1 text-normal rounded-xl hover:bg-[#EF4F5F]/10 transition-colors text-base"
                  >
                    Switch off
                  </button>

                  <button
                    onClick={() => {
                      setShowSwitchOffPopup(false);
                      isHandlingSwitchOff.current = false;
                      setVegModeContext(true);
                      // prevVegMode stays true (from before), which is correct
                    }}
                    className="w-full text-gray-900 font-normal py-1 text-center rounded-xl hover:bg-gray-200 transition-colors text-base"
                  >
                    Keep using this mode
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* All Categories Modal */}
      <AnimatePresence>
        {showAllCategoriesModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowAllCategoriesModal(false)}
              className="fixed inset-0 bg-black/40 z-[9998] backdrop-blur-sm"
            />

            {/* Modal - Full screen with rounded corners */}
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 300,
              }}
              className="fixed inset-x-0 bottom-0 top-12 sm:top-16 md:top-20 z-[9999] bg-white dark:bg-[#1a1a1a] rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 sm:px-6 sm:py-5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  All Categories
                </h2>
                <button
                  onClick={() => setShowAllCategoriesModal(false)}
                  className="p-1.5 sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              {/* Categories Grid - Scrollable */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 sm:py-5">
                <div className="grid grid-cols-3 gap-4 sm:gap-5 md:gap-6">
                  {(topCategories.length > 0 ? topCategories : landingCategories).map((category, index) => {
                    const categoryData = topCategories.length > 0
                      ? {
                        name: category.name,
                        image: category.image,
                        slug: category.slug,
                      }
                      : {
                        name: category.label,
                        image: category.imageUrl,
                        slug: category.slug,
                      };
                    const prefix = topCategories.length > 0 ? "modal-real-cat" : "modal-landing-cat";

                    return (
                      <motion.div
                        key={`${prefix}-${category.id || category._id || category.slug || index}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          duration: 0.3,
                          delay: index * 0.02,
                          type: "spring",
                          stiffness: 100,
                        }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Link
                          to={`/user/category/${categoryData.slug || categoryData.name.toLowerCase().replace(/\s+/g, "-")}`}
                          onClick={() => setShowAllCategoriesModal(false)}
                          className="block"
                        >
                          <div className="flex flex-col items-center gap-2 sm:gap-2.5 cursor-pointer w-full">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full overflow-hidden shadow-md transition-all hover:shadow-lg flex-shrink-0">
                              <OptimizedImage
                                src={sanitizeImageSrc(categoryData.image, categoryData.slug || categoryData.name)}
                                alt={categoryData.name}
                                className="w-full h-full bg-white rounded-full"
                                sizes="(max-width: 640px) 80px, (max-width: 768px) 96px, 112px"
                                objectFit="cover"
                                placeholder="blur"
                                onError={() => { }}
                              />
                            </div>
                            <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 text-center leading-tight px-1 break-words w-full min-w-0">
                              {categoryData.name}
                            </span>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Loading Screen - Applying Veg Mode */}
      {/* <AnimatePresence>
        {isApplyingVegMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[10000] bg-white/95 backdrop-blur-md flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="relative w-32 h-32 flex items-center justify-center">
                {[...Array(8)].map((_, i) => {
                  const baseSize = 112 // Starting size (w-28 = 112px)
                  const maxSize = 600 // Maximum size to expand to
                  return (
                    <motion.div
                      key={i}
                      initial={{
                        scale: 1,
                        opacity: 0
                      }}
                      animate={{
                        scale: maxSize / baseSize,
                        opacity: [0, 0.4, 0.2, 0]
                      }}
                      transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        ease: "easeOut",
                        delay: i * 0.3 // Stagger each circle by 0.3s so they appear one at a time
                      }}
                      className="absolute rounded-full border border-rose-300"
                      style={{
                        width: baseSize,
                        height: baseSize,
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        transformOrigin: 'center center'
                      }}
                    />
                  )
                })}

                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                    delay: 0.1
                  }}
                  className="relative z-10 w-28 h-28 rounded-full border-2 border-rose-300 bg-white flex flex-col items-center justify-center shadow-sm"
                >
                  <motion.div
                    className="flex flex-col items-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <span className="text-rose-700 font-bold text-xs leading-none">100%</span>
                    <span className="text-rose-700 font-bold text-xl leading-none mt-0.5">VEG</span>
                  </motion.div>
                </motion.div>
              </div>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-gray-800 font-normal text-base text-center relative z-10"
              >
                Explore veg dishes from all restaurants
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence> */}

      <AnimatePresence>
        {isApplyingVegMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[10000] bg-white dark:bg-[#0a0a0a] flex items-center justify-center"
          >
            <div className="relative w-32 h-32 flex items-center justify-center w-full">
              {/* Animated circles - positioned absolutely at the center */}
              {[...Array(8)].map((_, i) => {
                const baseSize = 112;
                const maxSize = 600;
                return (
                  <motion.div
                    key={i}
                    initial={{
                      scale: 1,
                      opacity: 0,
                    }}
                    animate={{
                      scale: maxSize / baseSize,
                      opacity: [0, 0.4, 0.2, 0],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeOut",
                      delay: i * 0.15,
                    }}
                    className="absolute rounded-full border border-green-300 dark:border-green-600"
                    style={{
                      width: baseSize,
                      height: baseSize,
                      // left: "50%",
                      // top: "50%",
                      // transform: "translate(-50%, -50%)",
                      // transformOrigin: "center center",
                    }}
                  />
                );
              })}

              {/* 100% VEG badge - absolute positioning at exact center */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.1,
                }}
                className="absolute z-10 w-28 h-28 rounded-full border-2 border-green-600 dark:border-green-500 bg-white dark:bg-[#1a1a1a] flex flex-col items-center justify-center shadow-sm"
                style={
                  {
                    // left: "50%",
                    // top: "50%",
                    // transform: "translate(-50%, -50%)",
                  }
                }
              >
                <motion.div
                  className="flex flex-col items-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <span className="text-green-600 dark:text-green-400 font-extrabold text-3xl leading-none">
                    100%
                  </span>
                  <span className="text-green-600 dark:text-green-400 font-extrabold text-3xl leading-none mt-0.5">
                    VEG
                  </span>
                </motion.div>
              </motion.div>

              {/* Text below badge */}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-xl font-normal text-gray-800 dark:text-gray-200 text-center relative z-10 mt-56 w-full"
              >
                Explore veg dishes from all restaurants
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Screen - Switching Off Veg Mode */}
      <AnimatePresence>
        {isSwitchingOffVegMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[10000] bg-white dark:bg-[#0a0a0a] flex items-center justify-center"
          >
            <div className="flex flex-col items-center gap-6">
              {/* Two Circles Spinning in Opposite Directions */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.1,
                }}
                className="relative w-16 h-16 flex items-center justify-center"
              >
                {/* Outer Circle - Spins Clockwise */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    rotate: {
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "linear",
                    },
                  }}
                  className="absolute w-16 h-16 border-[4px] border-transparent border-t-[#EF4F5F] border-r-[#EF4F5F] rounded-full"
                />

                {/* Inner Circle - Spins Counter-clockwise */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{
                    rotate: {
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    },
                  }}
                  className="absolute w-12 h-12 border-[4px] border-transparent border-r-[#EF4F5F] rounded-full"
                />
              </motion.div>

              {/* Loading Text */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-center"
              >
                <motion.h2
                  className="text-xl font-normal text-gray-800 dark:text-gray-200 mb-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  Switching off
                </motion.h2>
                <motion.p
                  className="text-xl font-normal text-gray-800 dark:text-gray-200"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  Veg Mode for you
                </motion.p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification - Fixed to viewport bottom */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showToast && (
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ duration: 0.3, type: "spring", damping: 25 }}
                className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[10001] bg-black text-white px-6 py-3 rounded-lg shadow-2xl"
              >
                <p className="text-sm font-medium">Added to bookmark</p>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* Manage Collections Modal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showManageCollections && (
              <>
                {/* Backdrop */}
                <motion.div
                  className="fixed inset-0 bg-black/40 z-[9999]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setShowManageCollections(false)}
                />

                {/* Manage Collections Bottom Sheet */}
                <motion.div
                  className="fixed left-0 right-0 bottom-0 z-[10000] bg-white rounded-t-3xl shadow-2xl"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{
                    duration: 0.2,
                    type: "spring",
                    damping: 30,
                    stiffness: 400,
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">
                      Manage Collections
                    </h2>
                    <button
                      onClick={() => setShowManageCollections(false)}
                      className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-800 transition-colors"
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </div>

                  {/* Collections List */}
                  <div className="px-4 py-4 space-y-2 max-h-[60vh] overflow-y-auto">
                    {/* Bookmarks Collection */}
                    <div
                      className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Don't close modal on click, let checkbox handle it
                      }}
                    >
                      <div className="h-12 w-12 rounded-lg bg-[#EF4F5F]/10 flex items-center justify-center flex-shrink-0">
                        <Bookmark className="h-6 w-6 text-[#EF4F5F] fill-[#EF4F5F]" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-base font-medium text-gray-900">
                            Bookmarks
                          </span>
                          {selectedRestaurantSlug && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isFavorite(selectedRestaurantSlug)}
                                onCheckedChange={(checked) => {
                                  if (!checked) {
                                    removeFavorite(selectedRestaurantSlug);
                                    setSelectedRestaurantSlug(null);
                                    setShowManageCollections(false);
                                  }
                                }}
                                className="h-5 w-5 rounded border-2 border-[#EF4F5F] data-[state=checked]:bg-[#EF4F5F] data-[state=checked]:border-[#EF4F5F]"
                              />
                            </div>
                          )}
                          {!selectedRestaurantSlug && (
                            <div className="h-5 w-5 rounded border-2 border-[#EF4F5F] bg-[#EF4F5F] flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {getFavorites().length} restaurant
                          {getFavorites().length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    {/* Create new Collection */}
                    <button
                      className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                      onClick={() => setShowManageCollections(false)}
                    >
                      <div className="h-12 w-12 rounded-lg bg-[#EF4F5F]/10 flex items-center justify-center flex-shrink-0">
                        <Plus className="h-6 w-6 text-[#EF4F5F]" />
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-base font-medium text-gray-900">
                          Create new Collection
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Done Button */}
                  <div className="border-t border-gray-200 px-4 py-4">
                    <Button
                      className="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 py-3 rounded-lg font-medium"
                      onClick={() => {
                        setSelectedRestaurantSlug(null);
                        setShowManageCollections(false);
                      }}
                    >
                      Done
                    </Button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}

      <StickyCartCard />
      <OrderTrackingCard />
      <AddToCartAnimation
        bottomOffset={80}
        pillClassName="scale-105"
        linkTo="/grocery/cart"
        platform="mogrocery"
        hideOnPages={true}
      />
    </div>
  );
}


