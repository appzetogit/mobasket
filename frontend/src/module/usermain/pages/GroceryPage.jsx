import React, { useState, useEffect, useMemo, useRef } from "react";
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
  X,
  Snowflake,
} from "lucide-react";
import { useNavigate, useLocation as useRouterLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useCart } from "../../user/context/CartContext";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";
import { useLocationSelector } from "../../user/components/UserLayout";
import { CategoryFoodsContent } from "./CategoryFoodsPage";
import AddToCartAnimation from "../../user/components/AddToCartAnimation";
import api, { restaurantAPI, userAPI } from "@/lib/api";
import { evaluateStoreAvailability } from "@/lib/utils/storeAvailability";

// Icons
import imgBag3D from "@/assets/icons/shopping-bag_18008822.png";

const GroceryPage = () => {
  const FALLBACK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  const navigate = useNavigate();
  const routerLocation = useRouterLocation();
  const { getGroceryCartCount, addToCart, isInCart } = useCart();
  const { location: userLocation } = useUserLocation();
  const { openLocationSelector } = useLocationSelector();
  const { zoneId } = useZone(userLocation, "mogrocery");
  const isGroceryCategoriesRoute = routerLocation.pathname === "/grocery/categories";
  const itemCount = getGroceryCartCount();
  const [activeTab, setActiveTab] = useState("All");
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [activeSubcategoryId, setActiveSubcategoryId] = useState("all-subcategories");

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
  const [homepageCategories, setHomepageCategories] = useState([]);
  const [bestSellerItems, setBestSellerItems] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [groceryStores, setGroceryStores] = useState([]);
  const [hasActiveGroceryStore, setHasActiveGroceryStore] = useState(true);
  const [activeGroceryOrder, setActiveGroceryOrder] = useState(null);
  const orderSnapshotRef = useRef(new Map());
  const hasSeededOrderSnapshotRef = useRef(false);

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
    return orders.find((order) => activeStatuses.has(String(order?.status || "").toLowerCase())) || null;
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
  const hasActiveSearch = searchQuery.trim().length > 0;

  const startListening = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-IN'; // Better for Indian context

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setSearchQuery(transcript);
      };

      recognition.start();
    } else {
      alert("Voice search is not supported in this browser.");
    }
  };

  const openCategorySheet = (categoryId = "all") => {
    // If categoryId is an object (event), default to 'all' or ignore
    if (typeof categoryId === "object" && categoryId !== null) {
      setSelectedCategoryId("all");
    } else {
      setSelectedCategoryId(categoryId);
    }
    setShowCategorySheet(true);
  };

  // Load dynamic grocery banners
  useEffect(() => {
    const fetchGroceryBanners = async () => {
      try {
        const response = await api.get("/hero-banners/public", {
          params: { platform: "mogrocery" },
        });

        const banners = Array.isArray(response?.data?.data?.banners)
          ? response.data.data.banners
          : [];

        const dynamicImages = banners
          .map((item) => item?.imageUrl)
          .filter((url) => typeof url === "string" && url.trim() !== "");

        if (dynamicImages.length > 0) {
          setBannerImages(dynamicImages);
          setCurrentBanner(0);
        }
      } catch {
      } finally {
        setIsBannersLoading(false);
      }
    };

    fetchGroceryBanners();
  }, []);

  useEffect(() => {
    const fetchHomepageCategories = async () => {
      try {
        const response = await api.get("/grocery/categories", {
          params: { includeSubcategories: true },
        });
        const categories = Array.isArray(response?.data?.data) ? response.data.data : [];
        setHomepageCategories(categories);
      } catch {
        setHomepageCategories([]);
      } finally {
        setIsCategoriesLoading(false);
      }
    };

    fetchHomepageCategories();
  }, []);

  useEffect(() => {
    const fetchBestSellers = async () => {
      try {
        const response = await api.get("/hero-banners/grocery-best-sellers/public", {
          params: { platform: "mogrocery" },
        });
        const items = Array.isArray(response?.data?.data?.items) ? response.data.data.items : [];
        setBestSellerItems(items);
      } catch {
        setBestSellerItems([]);
      } finally {
        setIsBestSellersLoading(false);
      }
    };

    fetchBestSellers();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await api.get("/grocery/products", {
          params: { page: 1, limit: 1000, ...(zoneId ? { zoneId } : {}) },
        });
        const products = Array.isArray(response?.data?.data) ? response.data.data : [];
        setAllProducts(products);
      } catch {
        setAllProducts([]);
      } finally {
        setIsProductsLoading(false);
      }
    };

    fetchProducts();
  }, []);

  useEffect(() => {
    const fetchGroceryStores = async () => {
      try {
        const response = await restaurantAPI.getRestaurants({
          limit: 200,
          platform: "mogrocery",
          onlyZone: "true",
          ...(zoneId ? { zoneId } : {}),
        });
        const restaurants = Array.isArray(response?.data?.data?.restaurants)
          ? response.data.data.restaurants
          : [];
        const moGroceryStores = restaurants.filter((restaurant) => restaurant?.platform === "mogrocery");
        const availableStores = moGroceryStores.filter((store) =>
          evaluateStoreAvailability({ store, label: "Store" }).isAvailable,
        );
        setGroceryStores(availableStores);
        setHasActiveGroceryStore(availableStores.length > 0);
      } catch {
        setGroceryStores([]);
        setHasActiveGroceryStore(false);
      } finally {
        setIsStoresLoading(false);
      }
    };

    fetchGroceryStores();
  }, [zoneId]);

  useEffect(() => {
    let timer = null;

    const fetchAndNotifyOrderUpdates = async () => {
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
    timer = setInterval(fetchAndNotifyOrderUpdates, 12000);

    return () => {
      if (timer) clearInterval(timer);
      hasSeededOrderSnapshotRef.current = false;
      orderSnapshotRef.current = new Map();
      setActiveGroceryOrder(null);
    };
  }, [zoneId]);

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

  const isGroceryUnavailable = !hasActiveGroceryStore;
  const shouldShowShimmer =
    !hasActiveSearch &&
    (isCategoriesLoading || isProductsLoading || isBestSellersLoading || isBannersLoading || isStoresLoading);

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

  const topNavCategories = useMemo(
    () => [
      {
        id: "all",
        name: "All",
        img: imgBag3D,
      },
      ...homepageCategories.map((category) => ({
        id: category?._id || category?.slug || category?.name,
        name: category?.name || "Category",
        img: category?.image || imgBag3D,
      })),
    ],
    [homepageCategories]
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
  }, [activeCategoryId, homepageCategories]);

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

  const openCollectionSheet = ({ categoryId, title = "" }) => {
    const category = findCategoryById(categoryId);
    const resolvedCategoryId = category
      ? String(category?._id || category?.slug || category?.name || "all")
      : "all";

    setCollectionCategoryId(resolvedCategoryId);
    setCollectionTitle(title || category?.name || "Products");
    setShowCollectionSheet(true);
    return true;
  };

  const visibleLayoutProducts = useMemo(() => {
    return allProducts.filter((product) => {
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
  }, [activeCategoryId, activeSubcategoryId, activeTab, allProducts]);

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
  }, [activeTab, homepageCategories, searchQuery]);

  const homepageCategoryDisplaySections = useMemo(() => {
    return homepageCategorySections.map((category) => {
      const categoryId = String(category?._id || category?.slug || category?.name || "");
      const subcategories = Array.isArray(category?.subcategories) ? category.subcategories : [];

      const baseCards = subcategories.map((subcategory, subIndex) => {
        return {
          _id: String(subcategory?._id || `${categoryId}-subcategory-${subIndex}`),
          name: subcategory?.name || "Subcategory",
          image: subcategory?.image || FALLBACK_IMAGE,
          __kind: "subcategory",
          targetSubcategoryId: subcategory?._id ? String(subcategory._id) : null,
        };
      });

      const productCards = allProducts
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

      const cards = [...baseCards];
      for (const productCard of productCards) {
        if (cards.length >= 40) break;
        cards.push(productCard);
      }

      return {
        ...category,
        homepageCards: cards,
      };
    });
  }, [allProducts, homepageCategorySections]);

  const visibleSearchProducts = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return [];

    return allProducts.filter((product) => {
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

      return (
        name.includes(query) ||
        description.includes(query) ||
        categoryName.includes(query) ||
        unit.includes(query) ||
        subcategoryNames.includes(query)
      );
    });
  }, [allProducts, searchQuery]);

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
    if (collectionCategoryId === "all") return allProducts;
    const categoryId = String(collectionCategoryId || "");
    if (!categoryId) return [];

    return allProducts.filter((product) => {
      const productCategoryId = String(
        product?.category?._id || product?.category?.id || product?.category || ""
      );
      return productCategoryId === categoryId;
    });
  }, [allProducts, collectionCategoryId]);

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

    const matchedProducts = allProducts.filter((product) =>
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
  }, [allProducts, wishlistItems]);

  const visibleBestSellers = useMemo(() => {
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

      const productImages = allProducts
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
        return allProducts.filter((product) => {
          const productCategoryId = String(
            product?.category?._id || product?.category?.id || product?.category || ""
          );
          return productCategoryId === targetId;
        }).length;
      }

      if (type === "subcategory") {
        return allProducts.filter((product) => {
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
      .filter((item) => (item?.name || "").toLowerCase().includes(query))
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
  }, [allProducts, bestSellerItems, searchQuery]);

  useEffect(() => {
    setActiveSubcategoryId("all-subcategories");
  }, [activeCategoryId]);

  useEffect(() => {
    if (!isGroceryCategoriesRoute) return;

    setSearchQuery("");
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

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [homepageCategories, isGroceryCategoriesRoute]);

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

  const deliveryEtaMinutes = useMemo(() => {
    if (!Number.isFinite(nearestStoreDistanceKm)) return 8;
    // Base prep/packing + travel estimate (~4 min per km)
    return Math.max(8, Math.min(60, Math.round(8 + nearestStoreDistanceKm * 4)));
  }, [nearestStoreDistanceKm]);

  const topAddress = useMemo(() => {
    const formattedAddress = (userLocation?.formattedAddress || "").trim();
    if (formattedAddress) {
      return formattedAddress;
    }

    const address = (userLocation?.address || "").trim();
    if (address) {
      return address;
    }

    const fallbackParts = [
      userLocation?.street,
      userLocation?.area,
      userLocation?.city,
      userLocation?.state,
      userLocation?.postalCode || userLocation?.zipCode,
    ]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean);

    if (fallbackParts.length) {
      return fallbackParts.join(", ");
    }

    return (
      "Select your location"
    );
  }, [userLocation]);

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
            title: item?.name || parentCategory?.name || "Products",
          })
        ) {
          return;
        }
      }
    }

    if (item.itemType === "product" && item.itemId) {
      const product = allProducts.find((prod) => String(prod?._id || prod?.id || "") === String(item.itemId));
      const categoryId = product?.category?._id || product?.category?.id || product?.category;
      if (categoryId && openCollectionSheet({ categoryId, title: item?.name || "Products" })) {
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

    navigate("/categories");
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
      restaurantLocation: store?.location || null,
      platform: "mogrocery",
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
    navigate("/grocery/categories");
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
      className={`min-h-screen text-slate-800 dark:text-slate-100 pb-24 font-sans w-full shadow-none overflow-x-hidden relative bg-white dark:bg-[#0a0a0a] ${isGroceryUnavailable ? "grayscale-[0.95] opacity-70" : ""
        }`}
    >
      {isGroceryUnavailable && (
        <div className="fixed top-[88px] left-1/2 -translate-x-1/2 z-[95] px-4">
          <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur px-4 py-2 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 text-center">
              MoGrocery is currently unavailable. Store is offline or closed.
            </p>
          </div>
        </div>
      )}
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
        className={`sticky top-0 z-40 transition-all duration-300 bg-white dark:bg-[#111111] ${isScrolled ? "shadow-sm" : ""}`}
      >
        <div className="relative z-20">
          {/* Top Info Row - YELLOW BACKGROUND ADDED HERE */}
          <div
            className={`rounded-b-[2.5rem] pb-10 shadow-sm relative z-20 transition-all duration-500 ${activeTab === "Electronics" ? "" :
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
                <h1 className="text-[10px] uppercase font-black tracking-[0.15em] text-[#3e3212] leading-none mb-0.5">
                  MoBasket in
                </h1>
                <div className="flex items-baseline gap-2 leading-none">
                  <span
                    className="text-[1.5rem] font-[900] text-[#1a1a1a] tracking-tight -ml-0.5"
                    style={{
                      fontFamily: "system-ui, -apple-system, sans-serif",
                    }}
                  >
                    {deliveryEtaMinutes} minutes
                  </span>
                </div>
                <div onClick={openLocationSelector} className="flex items-center gap-1 -mt-0.5 cursor-pointer">
                  <span className="text-[#1a1a1a] text-[0.8rem] font-bold tracking-tight leading-tight line-clamp-2">
                    {topAddress}
                  </span>
                  <ChevronDown
                    size={14}
                    className="text-[#1a1a1a] stroke-[3]"
                  />
                </div>
              </div>

              {/* Desktop Search Bar */}
              <div className="hidden md:flex flex-1 max-w-lg mx-8 items-center bg-white rounded-xl px-4 py-2.5 shadow-sm border border-transparent focus-within:border-black/10 transition-colors">
                <Search className="h-4 w-4 text-slate-500 stroke-[2.5] mr-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder='Search "chocolate"'
                  className="flex-1 bg-transparent outline-none text-slate-800 placeholder:text-slate-400 text-sm font-medium"
                />
              </div>



              {/* Profile & Cart Icons */}
              <div className="flex gap-2 mt-1">
                <button
                  className="relative w-8 h-8 bg-[#1a1a1a] rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform"
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
                  className="relative w-8 h-8 bg-[#1a1a1a] rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform"
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
                  className="w-8 h-8 bg-[#1a1a1a] rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform"
                  onClick={() => navigate("/grocery/profile")}
                >
                  <User size={16} className="text-white" />
                </button>
              </div>
            </div>
          </div>

          {/* Search Bar (Mobile) - OUTSIDE YELLOW BOX */}
          <div className="px-4 mt-3 mb-2 relative z-30 md:hidden">
            <div className="bg-gray-100 rounded-2xl h-12 flex items-center px-4 border border-transparent focus-within:border-black/5 transition-all w-full">
              <Search className="text-slate-400 w-5 h-5 stroke-[2.5] mr-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search "pet food"'
                className="flex-1 bg-transparent text-slate-800 text-[15px] font-semibold outline-none placeholder:text-slate-400/90 h-full"
              />
              <div className="w-[1px] h-6 bg-slate-200 mx-3"></div>
              <Mic
                onClick={startListening}
                className={`w-5 h-5 stroke-[2.5] transition-colors cursor-pointer ${isListening ? "text-[#EF4F5F] animate-pulse" : "text-slate-400"}`}
              />
            </div>
          </div>

          {/* Nav Tabs (Mobile Only) - OUTSIDE YELLOW BOX */}
          {!hasActiveSearch && (
            <div className="px-2 pb-2 mt-2 md:hidden">
              <div className="flex items-end gap-3 overflow-x-auto scrollbar-hide no-scrollbar px-2 w-full">
                {topNavCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className={`flex flex-col items-center gap-1.5 cursor-pointer min-w-[68px] px-1 py-1 rounded-xl transition-colors ${activeTab === cat.name ? "bg-white/55" : "hover:bg-white/35"
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
                        className="w-10 h-10 object-contain drop-shadow-md rounded-full"
                      />
                    </div>
                    <span
                      className={`text-[11px] font-bold tracking-tight text-center line-clamp-2 min-h-[30px] ${activeTab === cat.name ? "text-[#1a1a1a]" : "text-[#1a1a1a]/80"}`}
                    >
                      {cat.name}
                    </span>
                    {activeTab === cat.name && <div className="w-6 h-0.5 bg-[#1a1a1a] rounded-full"></div>}
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

      {!shouldShowShimmer && !hasActiveSearch && activeCategoryId === "all" && bannerImages.length > 0 && (
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

      {!shouldShowShimmer && !hasActiveSearch && activeCategoryId === "all" && visibleBestSellers.length > 0 && (
        <div className="px-4 pt-4 pb-2 relative z-10 md:max-w-6xl md:mx-auto">
          <h3 className="text-lg font-[800] text-[#3e2723] mb-4">Bestsellers</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-6">
            {visibleBestSellers.map((item, idx) => {
              const cardImages = Array.from({ length: 4 }).map(
                (_, imageIndex) => item.previewImages?.[imageIndex] || item.image
              );

              return (
                <button
                  type="button"
                  key={`${item.id}-${idx}`}
                  className="px-3 py-2.5 md:px-4 md:py-5 bg-[#e9edf2] md:bg-sky-50 md:border-sky-100 rounded-[22px] border border-[#d9dee5] shadow-[0_4px_12px_rgba(15,23,42,0.08)] md:shadow-sm text-left active:scale-95 transition-all duration-300 md:hover:shadow-lg md:hover:-translate-y-1 md:hover:border-sky-200 group"
                  onClick={() => handleBestSellerClick(item)}
                >
                  <div className="relative grid grid-cols-2 gap-1 mb-2 md:gap-2 md:w-[85%] md:mx-auto md:mb-5">
                    {cardImages.map((imageSrc, imageIdx) => (
                      <div
                        key={`${item.id}-${imageIdx}`}
                        className="aspect-square rounded-xl bg-white border border-[#eceff3] md:border-slate-100 overflow-hidden flex items-center justify-center p-0.5 transition-all duration-300 md:group-hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:group-hover:border-slate-200"
                      >
                        <img src={imageSrc} alt={item.name} className="w-full h-full object-contain scale-115 md:scale-[0.85] md:group-hover:scale-100 transition-transform duration-500" />
                      </div>
                    ))}
                    {item.countLabel ? (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-1 md:-bottom-2.5 h-8 min-w-8 px-2 md:px-2.5 rounded-full bg-white border border-[#d7dce4] md:border-white shadow-sm md:shadow-md text-[11px] font-[800] text-[#5b6472] md:text-slate-800 flex items-center justify-center z-10 md:group-hover:text-[#EF4F5F] transition-colors">
                        {item.countLabel}
                      </div>
                    ) : null}
                  </div>
                  <p className="text-[15px] md:text-[16px] font-[800] text-[#262a33] md:text-slate-800 leading-[1.08] md:leading-[1.2] text-center line-clamp-2 min-h-[24px] md:min-h-[36px] flex items-center justify-center">
                    {item.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!shouldShowShimmer && !hasActiveSearch && activeCategoryId !== "all" && (
        <div className="px-2 sm:px-4 pb-24 pt-2 relative z-10 md:max-w-6xl md:mx-auto">
          <div className="flex gap-2 sm:gap-3">
            <aside className="w-[86px] sm:w-[100px] shrink-0 border-r border-slate-200 pr-2">
              <div className="max-h-[calc(100vh-230px)] overflow-y-auto space-y-2 pb-3">
                <button
                  type="button"
                  className={`w-full rounded-xl px-2 py-2 text-[11px] font-semibold text-center border ${activeSubcategoryId === "all-subcategories"
                    ? "bg-[#fff4cc] border-[#facc15] text-slate-900"
                    : "bg-white border-slate-200 text-slate-600"
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
                      ? "bg-[#fff4cc] border-[#facc15]"
                      : "bg-white border-slate-200"
                      }`}
                    onClick={() => setActiveSubcategoryId(subcategory._id)}
                  >
                    <img
                      src={subcategory.image}
                      alt={subcategory.name}
                      className="w-10 h-10 rounded-full object-cover bg-slate-50"
                    />
                    <span className="text-[10px] font-semibold text-slate-700 leading-tight line-clamp-2">
                      {subcategory.name}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-base sm:text-lg font-[800] text-[#3e2723]">
                  {activeSubcategoryId === "all-subcategories"
                    ? activeTab
                    : normalizedSidebarSubcategories.find((subcat) => subcat._id === activeSubcategoryId)?.name || "Products"}
                </h3>
                <span className="text-xs font-semibold text-slate-500">{visibleLayoutProducts.length} items</span>
              </div>

              {visibleLayoutProducts.length === 0 ? (
                <p className="px-1 py-6 text-sm text-slate-500">No products found in this subcategory.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
                  {visibleLayoutProducts.map((product) => {
                    const productId = product?._id || product?.id;
                    const alreadyInCart = isInCart(productId);

                    return (
                      <div
                        key={`layout-product-${productId}`}
                        className="rounded-2xl border border-slate-200 bg-white shadow-sm p-2.5 sm:p-3 cursor-pointer relative"
                        onClick={() => handleProductCardClick(product, activeCategoryId)}
                      >
                        <button
                          type="button"
                          className={`absolute top-2 right-2 z-20 w-7 h-7 rounded-full border flex items-center justify-center transition-all duration-300 ${isProductWishlisted(product)
                            ? "bg-pink-50 border-pink-200 text-pink-500 shadow-sm"
                            : "bg-white/80 backdrop-blur-sm border-slate-200 text-slate-400 hover:text-slate-600"
                            }`}
                          onClick={(event) => toggleProductWishlist(product, event)}
                        >
                          <Heart
                            size={14}
                            className={isProductWishlisted(product) ? "fill-current" : ""}
                            strokeWidth={isProductWishlisted(product) ? 2.5 : 2}
                          />
                        </button>

                        <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden mb-2 flex items-center justify-center">
                          <img
                            src={getProductImage(product)}
                            alt={product?.name || "Product"}
                            className="w-full h-full object-contain scale-110"
                          />
                        </div>
                        <p className="text-[12px] sm:text-sm font-semibold text-slate-900 line-clamp-2 min-h-[34px]">
                          {product?.name || "Product"}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                          {product?.unit || "Unit not specified"}
                        </p>
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900">Rs {Number(product?.sellingPrice || 0)}</p>
                            {Number(product?.mrp || 0) > Number(product?.sellingPrice || 0) && (
                              <p className="text-[10px] text-slate-400 line-through">Rs {Number(product?.mrp || 0)}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            className={`h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg text-[10px] sm:text-xs font-[900] border ${alreadyInCart
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                              : "bg-white text-slate-900 border-[#facd01]"
                              }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleAddProductToCart(product, event);
                            }}
                          >
                            {alreadyInCart ? "ADDED" : "ADD"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {!shouldShowShimmer && hasActiveSearch && (
        <div className="px-4 pt-4 pb-2 relative z-10 md:max-w-6xl md:mx-auto">
          <h3 className="text-lg font-[800] text-[#3e2723]">
            Search results for "{searchQuery.trim()}"
          </h3>
        </div>
      )}

      {!shouldShowShimmer && hasActiveSearch && visibleBestSellers.length > 0 && (
        <div className="px-4 pt-2 pb-2 relative z-10 md:max-w-6xl md:mx-auto">
          <h4 className="text-base font-[800] text-[#3e2723] mb-3">Related Bestsellers</h4>
          <div className="grid grid-cols-3 gap-2.5">
            {visibleBestSellers.map((item, idx) => {
              const cardImages = Array.from({ length: 4 }).map(
                (_, imageIndex) => item.previewImages?.[imageIndex] || item.image
              );

              return (
                <button
                  type="button"
                  key={`search-bestseller-${item.id}-${idx}`}
                  className="p-2.5 bg-[#e9edf2] rounded-[16px] border border-[#dde3ea] shadow-sm text-left active:scale-95 transition-transform"
                  onClick={() => handleBestSellerClick(item)}
                >
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    {cardImages.map((imageSrc, imageIdx) => (
                      <div
                        key={`${item.id}-search-${imageIdx}`}
                        className="h-10 rounded-[8px] bg-white border border-[#eceff3] overflow-hidden flex items-center justify-center p-1"
                      >
                        <img src={imageSrc} alt={item.name} className="w-full h-full object-contain" />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 leading-none mb-1 text-center min-h-[10px]">
                    {item.countLabel || ""}
                  </p>
                  <p className="text-[13px] font-[700] text-[#2b2b2b] leading-[1.2] text-center line-clamp-2 min-h-[32px]">
                    {item.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!shouldShowShimmer && hasActiveSearch && visibleSearchProducts.length > 0 && (
        <div className="px-4 pt-2 pb-2 relative z-10 md:max-w-6xl md:mx-auto">
          <h4 className="text-base font-[800] text-[#3e2723] mb-3">Products</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {visibleSearchProducts.map((product) => {
              const primarySubcategory =
                (Array.isArray(product?.subcategories) && product.subcategories[0]?._id) ||
                product?.subcategory?._id ||
                null;

              return (
                <div
                  key={`search-product-${product._id}`}
                  className="rounded-2xl border border-slate-200 p-3 bg-white shadow-sm text-left relative cursor-pointer"
                  onClick={() => handleProductCardClick(product)}
                >
                  <button
                    type="button"
                    className={`absolute top-2 right-2 z-20 w-7 h-7 rounded-full border flex items-center justify-center transition-all duration-300 ${isProductWishlisted(product)
                      ? "bg-pink-50 border-pink-200 text-pink-500 shadow-sm"
                      : "bg-white/80 backdrop-blur-sm border-slate-200 text-slate-400 hover:text-slate-600"
                      }`}
                    onClick={(event) => toggleProductWishlist(product, event)}
                  >
                    <Heart
                      size={14}
                      className={isProductWishlisted(product) ? "fill-current" : ""}
                      strokeWidth={isProductWishlisted(product) ? 2.5 : 2}
                    />
                  </button>
                  <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden mb-2 flex items-center justify-center">
                    <img
                      src={getProductImage(product)}
                      alt={product?.name || "Product"}
                      className="w-full h-full object-contain scale-110"
                    />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 line-clamp-2">{product?.name}</p>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-1">{product?.unit || "Unit not specified"}</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">Rs {Number(product?.sellingPrice || 0)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!shouldShowShimmer && hasActiveSearch && !hasAnySearchMatch && (
        <div className="px-4 pt-4 pb-24 relative z-10 md:max-w-6xl md:mx-auto">
          <p className="text-sm text-slate-500">No matching results found.</p>
        </div>
      )}

      {!shouldShowShimmer && !hasActiveSearch && activeCategoryId === "all" && homepageCategoryDisplaySections.map((category, sectionIndex) => (
        <div
          key={category._id || category.slug || category.name}
          className={`px-4 relative z-10 md:max-w-6xl md:mx-auto ${sectionIndex === homepageCategoryDisplaySections.length - 1 ? "pb-24" : "pb-6"
            }`}
        >
          <h3 className="text-lg font-[800] text-[#3e2723] mb-4">{category.name}</h3>
          {(!category.homepageCards || category.homepageCards.length === 0) && (
            <p className="text-sm text-slate-500 mb-2">No subcategories available.</p>
          )}
          <div className="grid grid-cols-4 md:grid-cols-5 gap-x-2 md:gap-x-4 gap-y-2 md:gap-y-4">
            {(category.homepageCards || []).map((card, cardIndex) => (
              <div
                key={card._id}
                className={`flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform md:hover:-translate-y-1 duration-300 ${cardIndex === 0 ? "col-span-2 md:col-span-1" : "col-span-1"
                  }`}
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
                  className="w-full h-[88px] rounded-[18px] flex items-center justify-center p-2 shadow-sm border border-[#fef3c7] overflow-hidden relative bg-[#fffbeb]"
                >
                  <img
                    src={card.image || FALLBACK_IMAGE}
                    alt={card.name}
                    className={`w-full h-full object-contain transition-transform duration-300 drop-shadow-[0_12px_10px_rgba(0,0,0,0.22)] md:hover:scale-110 ${cardIndex === 0 ? "scale-110 md:scale-100" : ""
                      }`}
                  />
                </div>
                <div className="h-7 flex items-start justify-center w-full">
                  <p
                    className={`${cardIndex === 0 ? "text-[12px]" : "text-[11px]"
                      } font-[700] text-center text-[#2b2b2b] leading-tight px-0.5 line-clamp-2`}
                  >
                    {card.name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* --- 8. BOTTOM FLOATING OFFER --- */}
      {activeGroceryOrder && activeOrderMeta && !isMoGroceryPlanOrder(activeGroceryOrder) && (
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
              <span className={`text-[10px] px-2 py-1 rounded-full border font-bold ${activeOrderMeta.chipClass}`}>
                {activeOrderMeta.label}
              </span>
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
      <div className="fixed bottom-0 left-0 right-0 bg-white/85 dark:bg-[#111111]/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 z-50 w-full pb-4">
        <div className="md:max-w-6xl md:mx-auto w-full flex justify-between items-end py-2 px-6">
          <div
            className={`flex flex-col items-center gap-1 cursor-pointer ${isGroceryCategoriesRoute ? "text-slate-400 hover:text-slate-600" : ""}`}
            onClick={handleHomeNavClick}
          >
            <Home size={24} className={isGroceryCategoriesRoute ? "text-slate-400" : "text-slate-900 fill-current"} />
            <span className={`text-[10px] ${isGroceryCategoriesRoute ? "font-medium text-slate-400" : "font-bold text-slate-900"}`}>Home</span>
            {!isGroceryCategoriesRoute && <div className="w-8 h-1 bg-slate-900 rounded-full mt-0.5"></div>}
          </div>

          <div
            className="flex flex-col items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-600"
            onClick={() => navigate("/plans")}
          >
            <ShoppingBag size={24} />
            <span className="text-[10px] font-medium">Plan</span>
          </div>

          <div
            className={`flex flex-col items-center gap-1 cursor-pointer ${isGroceryCategoriesRoute ? "text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
            onClick={handleCategoriesNavClick}
          >
            <LayoutGrid size={24} />
            <span className={`text-[10px] ${isGroceryCategoriesRoute ? "font-bold text-slate-900" : "font-medium"}`}>Categories</span>
            {isGroceryCategoriesRoute && <div className="w-8 h-1 bg-slate-900 rounded-full mt-0.5"></div>}
          </div>

          <button
            className="mb-1 bg-[#EF4F5F] hover:bg-red-700 text-white px-6 py-2 rounded-full shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
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
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 110) {
                  setShowCollectionSheet(false);
                }
              }}
              className="fixed bottom-0 left-0 right-0 h-[92vh] z-[80] w-full"
            >
              <button
                onClick={() => setShowCollectionSheet(false)}
                className="absolute -top-14 left-1/2 -translate-x-1/2 bg-[#1a1a1a] p-2.5 rounded-full shadow-lg border border-white/20 active:scale-95 transition-transform z-[90] flex items-center justify-center cursor-pointer"
              >
                <X size={22} className="text-white" strokeWidth={2.5} />
              </button>

              <div className="h-full bg-[#f4f5f7] rounded-t-[22px] overflow-hidden shadow-2xl flex flex-col">
                <div className="w-full flex justify-center pt-3 pb-1">
                  <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
                </div>

                <div className="px-3 pb-2 bg-white border-b border-slate-200">
                  <div className="flex items-center gap-2 md:max-w-6xl md:mx-auto">
                    <button
                      type="button"
                      onClick={() => setShowCollectionSheet(false)}
                      className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <div className="min-w-0">
                      <p className="text-[15px] font-extrabold text-slate-900 truncate">
                        {activeCollectionCategory?.name || (collectionCategoryId === "all" ? "All Categories" : collectionTitle)}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500">{collectionVisibleProducts.length} items</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border-b border-slate-200 px-2 py-2 overflow-x-auto no-scrollbar">
                  <div className="flex gap-2 min-w-max md:max-w-6xl md:mx-auto md:px-2">
                    {collectionCategoryTabs.map((tab) => (
                      <button
                        key={`collection-tab-${tab._id}`}
                        type="button"
                        className="flex flex-col items-center gap-1 min-w-[72px]"
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
                            ? "border-[#facc15] bg-[#fff8dd]"
                            : "border-slate-200 bg-slate-50"
                            }`}
                        >
                          <img src={tab.image || FALLBACK_IMAGE} alt={tab.name} className="w-full h-full object-contain" />
                        </div>
                        <span
                          className={`text-[11px] leading-tight font-bold text-center line-clamp-2 ${String(collectionCategoryId || "all") === String(tab._id) ? "text-slate-900" : "text-slate-500"
                            }`}
                        >
                          {tab.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {collectionVisibleProducts.length === 0 ? (
                    <p className="text-sm text-slate-500 p-3 md:max-w-6xl md:mx-auto">No products available.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 md:max-w-6xl md:mx-auto pb-4">
                      {collectionVisibleProducts.map((product) => {
                        const productId = product?._id || product?.id;
                        const alreadyInCart = isInCart(productId);
                        const sellingPrice = Number(product?.sellingPrice || 0);
                        const mrp = Number(product?.mrp || 0);
                        const discountPercent = mrp > sellingPrice && mrp > 0
                          ? Math.max(1, Math.round(((mrp - sellingPrice) / mrp) * 100))
                          : 0;

                        return (
                          <div
                            key={`collection-product-${productId}`}
                            className="rounded-[16px] border border-slate-200 bg-white shadow-sm p-2 relative cursor-pointer md:hover:-translate-y-1 md:hover:shadow-md md:hover:border-slate-300 transition-all duration-300 group"
                            onClick={() => handleProductCardClick(product)}
                          >
                            {discountPercent > 0 && (
                              <span className="absolute top-2 left-2 z-10 bg-[#facc15] text-[10px] font-black text-slate-900 px-1.5 py-0.5 rounded">
                                {discountPercent}% OFF
                              </span>
                            )}
                            <button
                              type="button"
                              className={`absolute top-2 right-2 z-20 w-7 h-7 rounded-full border flex items-center justify-center transition-all duration-300 ${isProductWishlisted(product)
                                ? "bg-pink-50 border-pink-200 text-pink-500 shadow-sm"
                                : "bg-white/80 backdrop-blur-sm border-slate-200 text-slate-400 hover:text-slate-600"
                                }`}
                              onClick={(event) => toggleProductWishlist(product, event)}
                            >
                              <Heart
                                size={14}
                                className={isProductWishlisted(product) ? "fill-current" : ""}
                                strokeWidth={isProductWishlisted(product) ? 2.5 : 2}
                              />
                            </button>

                            <div className="w-full h-[110px] rounded-xl bg-slate-50 overflow-hidden flex items-center justify-center mb-2 md:group-hover:bg-slate-100/50 transition-colors duration-300">
                              <img src={getProductImage(product)} alt={product?.name || "Product"} className="w-full h-full object-contain scale-110 md:group-hover:scale-115 transition-transform duration-500" />
                            </div>

                            <p className="text-[13px] font-bold text-slate-900 leading-tight line-clamp-2 min-h-[34px]">
                              {product?.name || "Product"}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">{product?.unit || "100 g"}</p>

                            <div className="mt-1.5 flex items-end justify-between gap-2">
                              <div>
                                <p className="text-[18px] leading-none font-black text-slate-900">Rs {sellingPrice}</p>
                                {mrp > sellingPrice && (
                                  <p className="text-[11px] text-slate-400 line-through">Rs {mrp}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                className={`h-7 px-3 rounded-md text-[11px] font-black border ${alreadyInCart
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                  : "bg-white text-slate-900 border-[#facd01]"
                                  }`}
                                onClick={(event) => handleAddProductToCart(product, event)}
                              >
                                {alreadyInCart ? "ADDED" : "ADD"}
                              </button>
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
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 110) setShowWishlistSheet(false);
              }}
              className="fixed bottom-0 left-0 right-0 h-[88vh] z-[85] w-full"
            >
              <div className="h-full bg-[#f4f5f7] rounded-t-[22px] overflow-hidden shadow-2xl flex flex-col">
                <div className="w-full flex justify-center pt-3 pb-1">
                  <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
                </div>

                <div className="px-3 pb-2 bg-white border-b border-slate-200">
                  <div className="flex items-center gap-2 md:max-w-6xl md:mx-auto">
                    <button
                      type="button"
                      onClick={() => setShowWishlistSheet(false)}
                      className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <div className="min-w-0">
                      <p className="text-[15px] font-extrabold text-slate-900 truncate">Wishlisted Products</p>
                      <p className="text-[11px] font-semibold text-slate-500">{groceryWishlistedProducts.length} items</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {groceryWishlistedProducts.length === 0 ? (
                    <p className="text-sm text-slate-500 p-3 md:max-w-6xl md:mx-auto">No wishlisted products yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 md:max-w-6xl md:mx-auto pb-4">
                      {groceryWishlistedProducts.map((product) => {
                        const productId = product?._id || product?.id;
                        const alreadyInCart = isInCart(productId);
                        const sellingPrice = Number(product?.sellingPrice || product?.price || 0);
                        const mrp = Number(product?.mrp || 0);

                        return (
                          <div
                            key={`wishlist-product-${productId}`}
                            className="rounded-[16px] border border-slate-200 bg-white shadow-sm p-2 relative cursor-pointer md:hover:-translate-y-1 md:hover:shadow-md md:hover:border-slate-300 transition-all duration-300 group"
                            onClick={() => handleProductCardClick(product)}
                          >
                            <button
                              type="button"
                              className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full border bg-pink-50 border-pink-200 text-pink-500 flex items-center justify-center shadow-sm"
                              onClick={(event) => toggleProductWishlist(product, event)}
                            >
                              <Heart size={14} className="fill-current" strokeWidth={2.5} />
                            </button>

                            <div className="w-full h-[110px] rounded-xl bg-slate-50 overflow-hidden flex items-center justify-center mb-2 md:group-hover:bg-slate-100/50 transition-colors duration-300">
                              <img src={getProductImage(product)} alt={product?.name || "Product"} className="w-full h-full object-contain scale-110 md:group-hover:scale-115 transition-transform duration-500" />
                            </div>

                            <p className="text-[13px] font-bold text-slate-900 leading-tight line-clamp-2 min-h-[34px]">
                              {product?.name || "Product"}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">{product?.unit || "100 g"}</p>

                            <div className="mt-1.5 flex items-end justify-between gap-2">
                              <div>
                                <p className="text-[18px] leading-none font-black text-slate-900">Rs {sellingPrice}</p>
                                {mrp > sellingPrice && (
                                  <p className="text-[11px] text-slate-400 line-through">Rs {mrp}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                className={`h-7 px-3 rounded-md text-[11px] font-black border ${alreadyInCart
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                  : "bg-white text-slate-900 border-[#facd01]"
                                  }`}
                                onClick={(event) => handleAddProductToCart(product, event)}
                              >
                                {alreadyInCart ? "ADDED" : "ADD"}
                              </button>
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
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100) {
                  setShowCategorySheet(false);
                }
              }}
              className="fixed bottom-0 left-0 right-0 h-[92vh] z-[60] w-full"
            >
              {/* Floating Close Button */}
              <button
                onClick={() => setShowCategorySheet(false)}
                className="absolute -top-14 left-1/2 -translate-x-1/2 bg-[#1a1a1a] p-2.5 rounded-full shadow-lg border border-white/20 active:scale-95 transition-transform z-[80] flex items-center justify-center cursor-pointer"
              >
                <X size={22} className="text-white" strokeWidth={2.5} />
              </button>

              {/* Actual Sheet Content */}
              <div className="h-full bg-white rounded-t-[20px] overflow-hidden relative shadow-2xl">
                {/* Drag Handle */}
                <div className="w-full flex justify-center pt-3 pb-1 absolute top-0 left-0 z-[70] pointer-events-none">
                  <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
                </div>

                <div className="h-full pt-2">
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


