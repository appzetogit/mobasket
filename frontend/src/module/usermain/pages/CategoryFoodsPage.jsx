import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "../../user/context/CartContext";
import WishlistButton from "@/components/WishlistButton";
import api from "@/lib/api";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";
import AddToCartAnimation from "../../user/components/AddToCartAnimation";
import imgBag3D from "@/assets/icons/shopping-bag_18008822.png";

const FALLBACK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const MAX_INLINE_IMAGE_BYTES = 80_000;
const PRODUCTS_PAGE_SIZE = 30;
const PRODUCTS_CACHE_TTL_MS = 2 * 60 * 1000;
const productsPageCache = new Map();
const CATEGORY_SKELETON_COUNT = 6;
const PRODUCT_SKELETON_COUNT = 8;

const getProductsCacheKey = ({
  zoneId = "",
  categoryId = "all",
  subcategoryId = "",
  storeId = "all-stores",
  page = 1,
}) =>
  [
    String(zoneId || "no-zone").trim(),
    String(categoryId || "all").trim(),
    String(subcategoryId || "").trim(),
    String(storeId || "all-stores").trim(),
    String(page || 1),
  ].join("::");

const isLikelyOversizedInlineImage = (value) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:image")) return false;
  return trimmed.length > MAX_INLINE_IMAGE_BYTES;
};

const extractImage = (product) => {
  const images = Array.isArray(product?.images) ? product.images : [];
  const normalizedImages = images
    .filter((img) => typeof img === "string" && img.trim())
    .map((img) => img.trim());

  const firstRemoteImage = normalizedImages.find(
    (img) => img.startsWith("http://") || img.startsWith("https://")
  );
  if (firstRemoteImage) return firstRemoteImage;

  const firstInlineImage = normalizedImages.find((img) => !isLikelyOversizedInlineImage(img));
  if (firstInlineImage) return firstInlineImage;

  if (typeof product?.image === "string" && product.image.trim()) {
    const singleImage = product.image.trim();
    if (!isLikelyOversizedInlineImage(singleImage)) return singleImage;
  }

  return FALLBACK_IMAGE;
};

const extractId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return value?._id || value?.id || "";
  return "";
};

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

const doesProductMatchStore = (product, selectedStoreId) => {
  const normalizedSelectedStoreId = String(selectedStoreId || "").trim();
  if (!normalizedSelectedStoreId || normalizedSelectedStoreId === "all-stores") return true;
  const selectedIds = new Set([normalizedSelectedStoreId]);
  const productStoreIds = getStoreIdCandidates(product);
  return productStoreIds.some((id) => selectedIds.has(id));
};

const normalizeVariantKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

const getDefaultVariant = (product) => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const normalized = variants
    .map((variant, index) => {
      const name = String(variant?.name || "").trim();
      const price = Number(variant?.sellingPrice ?? variant?.price ?? 0);
      const mrp = Number(variant?.mrp ?? price);
      if (!name || !Number.isFinite(price)) return null;

      return {
        ...variant,
        key: normalizeVariantKey(name) || `variant-${index}`,
        name,
        price,
        mrp,
        isDefault: variant?.isDefault === true,
      };
    })
    .filter(Boolean);

  return normalized.find((variant) => variant.isDefault) || normalized[0] || null;
};

const getCardProductData = (product) => {
  const productId = String(product?._id || product?.id || "").trim();
  const defaultVariant = getDefaultVariant(product);
  const price = Number(defaultVariant?.price ?? product?.sellingPrice ?? product?.price ?? 0);
  const mrp = Number(defaultVariant?.mrp ?? product?.mrp ?? price);
  const weight = defaultVariant?.name || product?.weight || product?.unit || "";
  const variantLabel = defaultVariant?.name || weight || "";
  const variantKey = normalizeVariantKey(variantLabel);
  const cartItemId = variantKey ? `${productId}::${variantKey}` : productId;

  return { productId, defaultVariant, price, mrp, weight, cartItemId };
};

const buildProductDetailState = (product) => {
  const { price, mrp, weight } = getCardProductData(product);
  const storeId = String(product?.storeId?._id || product?.storeId?.id || product?.storeId || "").trim();
  const storeName = String(product?.storeId?.name || product?.storeName || "").trim();
  const storeAddress = String(
    product?.storeAddress ||
    product?.storeId?.address ||
    product?.storeId?.location?.formattedAddress ||
    product?.storeId?.location?.address ||
    "",
  ).trim();

  return {
    id: product?._id || product?.id,
    name: product?.name || "Product",
    description: product?.description || "",
    weight,
    unit: weight,
    price,
    mrp,
    image: extractImage(product),
    variants: Array.isArray(product?.variants) ? product.variants : [],
    categoryId: extractId(product?.category),
    subcategoryId: extractId(product?.subcategory) || extractId(Array.isArray(product?.subcategories) ? product.subcategories[0] : ""),
    storeId,
    storeName,
    storeAddress,
    storeLocation: product?.storeLocation || product?.storeId?.location || null,
    platform: "mogrocery",
  };
};

const CategoryTabsSkeleton = () => (
  <div className="w-full bg-white dark:bg-[#0f172a] overflow-x-auto no-scrollbar z-10 flex items-center px-2 shadow-sm border-b border-gray-50 dark:border-slate-800 flex-shrink-0">
    {Array.from({ length: CATEGORY_SKELETON_COUNT }).map((_, index) => (
      <div key={`category-skeleton-${index}`} className="flex flex-col items-center justify-center gap-1.5 py-3 px-1 min-w-[76px] flex-shrink-0">
        <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="w-12 h-2.5 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
    ))}
  </div>
);

const ProductsGridSkeleton = () => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    {Array.from({ length: PRODUCT_SKELETON_COUNT }).map((_, index) => (
      <div
        key={`product-skeleton-${index}`}
        className="flex flex-col bg-white dark:bg-[#0f172a] rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 h-full"
      >
        <div className="relative w-full h-40 md:h-48 p-2 bg-white dark:bg-[#0b1220]">
          <div className="w-full h-full rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="absolute bottom-2 right-2 w-12 h-6 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
        <div className="px-2 pb-2 pt-1 flex-1">
          <div className="h-3.5 w-4/5 rounded bg-slate-200 dark:bg-slate-800 animate-pulse mb-2" />
          <div className="h-3.5 w-3/5 rounded bg-slate-200 dark:bg-slate-800 animate-pulse mb-2" />
          <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800 animate-pulse mb-2" />
          <div className="h-3.5 w-1/2 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

export function CategoryFoodsContent({
  onClose,
  isModal = false,
  initialCategory = "all",
  initialSubcategoryId = "",
  initialStoreId = "all-stores",
}) {
  const navigate = useNavigate();
  const { addToCart, getCartItem, isInCart, updateQuantity } = useCart();
  const { location: userLocation, loading: locationLoading } = useUserLocation();
  const { zoneId, loading: zoneLoading } = useZone(userLocation, "mogrocery");
  const cachedZoneId =
    typeof window !== "undefined" ? localStorage.getItem("userZoneId:mogrocery") : "";
  const effectiveZoneId = String(zoneId || cachedZoneId || "").trim();

  const [selectedCategory, setSelectedCategory] = useState(initialCategory || "all");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(initialSubcategoryId || "");
  const [selectedStoreId, setSelectedStoreId] = useState(initialStoreId || "all-stores");
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const scrollableRef = useRef(null);
  const loadMoreInFlightRef = useRef(false);

  useEffect(() => {
    setSelectedCategory(initialCategory || "all");
  }, [initialCategory]);

  useEffect(() => {
    setSelectedSubcategoryId(initialSubcategoryId || "");
  }, [initialSubcategoryId]);

  useEffect(() => {
    setSelectedStoreId(initialStoreId || "all-stores");
  }, [initialStoreId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const normalizedStoreId = String(selectedStoreId || "").trim();
    if (normalizedStoreId && normalizedStoreId !== "all-stores") {
      localStorage.setItem("mogrocery:selectedStoreId", normalizedStoreId);
      return;
    }
    localStorage.removeItem("mogrocery:selectedStoreId");
  }, [selectedStoreId]);

  useEffect(() => {
    let mounted = true;

    const fetchCategories = async () => {
      try {
        const response = await api.get("/grocery/categories", {
          params: { includeSubcategories: true, activeOnly: "true" },
        });
        const data = Array.isArray(response?.data?.data) ? response.data.data : [];
        if (!mounted) return;
        setCategories(data);
      } catch {
        if (!mounted) return;
        setCategories([]);
      } finally {
        if (mounted) setIsCategoriesLoading(false);
      }
    };

    fetchCategories();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isCategoriesLoading && selectedCategory !== "all") {
      const exists = categories.some((cat) => String(cat?._id || "") === String(selectedCategory));
      if (!exists) setSelectedCategory("all");
    }
  }, [categories, isCategoriesLoading, selectedCategory]);

  useEffect(() => {
    let mounted = true;

    const fetchProductsPage = async (pageToLoad, { append = false } = {}) => {
      try {
        if (append) {
          setIsLoadingMoreProducts(true);
        } else {
          setIsProductsLoading(true);
        }

        const params = {
          page: pageToLoad,
          limit: PRODUCTS_PAGE_SIZE,
          ...(effectiveZoneId ? { zoneId: effectiveZoneId } : {}),
          ...(selectedCategory && selectedCategory !== "all" ? { categoryId: selectedCategory } : {}),
          ...(selectedSubcategoryId ? { subcategoryId: selectedSubcategoryId } : {}),
          ...(selectedStoreId && selectedStoreId !== "all-stores"
            ? { storeId: selectedStoreId }
            : {}),
        };
        const cacheKey = getProductsCacheKey({
          zoneId: effectiveZoneId,
          categoryId: selectedCategory,
          subcategoryId: selectedSubcategoryId,
          storeId: selectedStoreId,
          page: pageToLoad,
        });

        if (!append) {
          const cached = productsPageCache.get(cacheKey);
          const isFresh = cached && Date.now() - Number(cached.ts || 0) < PRODUCTS_CACHE_TTL_MS;
          if (isFresh && Array.isArray(cached.items)) {
            setProducts(cached.items);
            setProductsPage(pageToLoad);
            setHasMoreProducts(Boolean(cached.hasMore));
            setIsProductsLoading(false);
            return;
          }
        }

        const response = await api.get("/grocery/products", { params });
        const data = Array.isArray(response?.data?.data) ? response.data.data : [];
        let zoneSafeData = data.filter((product) => {
          if (!effectiveZoneId) return true;
          const productZoneId = String(
            product?.zoneId?._id ||
            product?.zoneId?.id ||
            product?.zoneId ||
            product?.storeId?.zoneId?._id ||
            product?.storeId?.zoneId?.id ||
            product?.storeId?.zoneId ||
            "",
          ).trim();
          return !productZoneId || productZoneId === String(effectiveZoneId);
        });

        if (selectedStoreId && selectedStoreId !== "all-stores") {
          zoneSafeData = zoneSafeData.filter((product) =>
            doesProductMatchStore(product, selectedStoreId),
          );
        }

        if (!mounted) return;
        productsPageCache.set(cacheKey, {
          items: zoneSafeData,
          hasMore: zoneSafeData.length >= PRODUCTS_PAGE_SIZE,
          ts: Date.now(),
        });
        setProducts((previousProducts) => {
          if (!append) return zoneSafeData;

          const mergedMap = new Map();
          (Array.isArray(previousProducts) ? previousProducts : []).forEach((item) => {
            const key = String(item?._id || item?.id || "").trim();
            if (!key) return;
            mergedMap.set(key, item);
          });
          zoneSafeData.forEach((item) => {
            const key = String(item?._id || item?.id || "").trim();
            if (!key) return;
            mergedMap.set(key, item);
          });
          return Array.from(mergedMap.values());
        });
        setProductsPage(pageToLoad);
        setHasMoreProducts(zoneSafeData.length >= PRODUCTS_PAGE_SIZE);
      } catch {
        if (!mounted) return;
        if (!append) setProducts([]);
        setHasMoreProducts(false);
      } finally {
        if (!mounted) return;
        if (append) {
          setIsLoadingMoreProducts(false);
        } else {
          setIsProductsLoading(false);
        }
      }
    };

    setProducts([]);
    setProductsPage(1);
    setHasMoreProducts(false);
    setIsLoadingMoreProducts(false);
    fetchProductsPage(1, { append: false });

    return () => {
      mounted = false;
    };
  }, [
    effectiveZoneId,
    selectedCategory,
    selectedStoreId,
    selectedSubcategoryId,
  ]);

  useEffect(() => {
    const container = scrollableRef.current;
    if (!container) return undefined;
    if (isProductsLoading || isLoadingMoreProducts || !hasMoreProducts) return undefined;

    const handleScroll = async () => {
      if (loadMoreInFlightRef.current) return;
      const nearBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 220;
      if (!nearBottom) return;

      loadMoreInFlightRef.current = true;
      try {
        setIsLoadingMoreProducts(true);
        const nextPage = productsPage + 1;
        const params = {
          page: nextPage,
          limit: PRODUCTS_PAGE_SIZE,
          ...(effectiveZoneId ? { zoneId: effectiveZoneId } : {}),
          ...(selectedCategory && selectedCategory !== "all" ? { categoryId: selectedCategory } : {}),
          ...(selectedSubcategoryId ? { subcategoryId: selectedSubcategoryId } : {}),
          ...(selectedStoreId && selectedStoreId !== "all-stores"
            ? { storeId: selectedStoreId }
            : {}),
        };

        const response = await api.get("/grocery/products", { params });
        const data = Array.isArray(response?.data?.data) ? response.data.data : [];
        let zoneSafeData = data.filter((product) => {
          if (!effectiveZoneId) return true;
          const productZoneId = String(
            product?.zoneId?._id ||
            product?.zoneId?.id ||
            product?.zoneId ||
            product?.storeId?.zoneId?._id ||
            product?.storeId?.zoneId?.id ||
            product?.storeId?.zoneId ||
            "",
          ).trim();
          return !productZoneId || productZoneId === String(effectiveZoneId);
        });

        if (selectedStoreId && selectedStoreId !== "all-stores") {
          zoneSafeData = zoneSafeData.filter((product) =>
            doesProductMatchStore(product, selectedStoreId),
          );
        }

        setProducts((previousProducts) => {
          const mergedMap = new Map();
          (Array.isArray(previousProducts) ? previousProducts : []).forEach((item) => {
            const key = String(item?._id || item?.id || "").trim();
            if (!key) return;
            mergedMap.set(key, item);
          });
          zoneSafeData.forEach((item) => {
            const key = String(item?._id || item?.id || "").trim();
            if (!key) return;
            mergedMap.set(key, item);
          });
          return Array.from(mergedMap.values());
        });
        setProductsPage(nextPage);
        setHasMoreProducts(zoneSafeData.length >= PRODUCTS_PAGE_SIZE);
      } catch {
        setHasMoreProducts(false);
      } finally {
        setIsLoadingMoreProducts(false);
        loadMoreInFlightRef.current = false;
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [
    effectiveZoneId,
    hasMoreProducts,
    isLoadingMoreProducts,
    isProductsLoading,
    productsPage,
    selectedCategory,
    selectedStoreId,
    selectedSubcategoryId,
  ]);

  const sidebarCategories = useMemo(() => {
    const categoryIdsWithProducts = new Set();
    const categoryNamesWithProducts = new Set();
    products.forEach((product) => {
      const categoryId = String(
        product?.category?._id || product?.category?.id || product?.category || ""
      ).trim();
      if (categoryId) categoryIdsWithProducts.add(categoryId);

      const categoryName = String(product?.category?.name || "").trim().toLowerCase();
      if (categoryName) categoryNamesWithProducts.add(categoryName);
    });

    const dynamic = categories
      .filter((category) => {
        const categoryId = String(category?._id || "").trim();
        const categorySlug = String(category?.slug || "").trim();
        const categoryName = String(category?.name || "").trim().toLowerCase();
        return (
          (categoryId && categoryIdsWithProducts.has(categoryId)) ||
          (categorySlug && categoryIdsWithProducts.has(categorySlug)) ||
          (categoryName && categoryNamesWithProducts.has(categoryName))
        );
      })
      .map((category) => ({
        id: String(category?._id || ""),
        name: category?.name || "Category",
        icon: category?.image || FALLBACK_IMAGE,
      }))
      .filter((category) => category.id);

    return [{ id: "all", name: "All", icon: imgBag3D }, ...dynamic];
  }, [categories, products]);

  useEffect(() => {
    if (selectedCategory === "all") return;
    const exists = sidebarCategories.some(
      (category) => String(category?.id || "") === String(selectedCategory)
    );
    if (!exists) setSelectedCategory("all");
  }, [selectedCategory, sidebarCategories]);

  const handleProductCardClick = (product) => {
    const productId = product?._id || product?.id;
    if (!productId) return;
    navigate(`/food/${productId}`, {
      state: {
        item: buildProductDetailState(product),
      },
    });
  };

  const handleAddToCart = (product, event) => {
    event?.stopPropagation();

    const storeId = String(product?.storeId?._id || product?.storeId?.id || product?.storeId || "").trim();
    const storeName = String(product?.storeId?.name || product?.storeName || "").trim();
    const storeAddress = String(
      product?.storeAddress ||
      product?.storeId?.address ||
      product?.storeId?.location?.formattedAddress ||
      product?.storeId?.location?.address ||
      "",
    ).trim();

    if (!storeId) {
      toast.error("Store information missing for this product.");
      return;
    }

    const { defaultVariant, price, mrp, weight, cartItemId } = getCardProductData(product);

    const didAdd = addToCart({
      id: cartItemId,
      cartItemId,
      productId: product?._id || product?.id,
      name: product?.name || "Product",
      price,
      mrp,
      weight,
      unit: weight,
      variantName: defaultVariant?.name || "",
      selectedVariant: defaultVariant
        ? {
            name: defaultVariant.name,
            key: defaultVariant.key,
            price: defaultVariant.price,
            mrp: defaultVariant.mrp,
          }
        : null,
      image: extractImage(product),
      categoryId: extractId(product?.category),
      subcategoryId: extractId(product?.subcategory) || extractId(Array.isArray(product?.subcategories) ? product.subcategories[0] : ""),
      storeId,
      storeName,
      storeAddress,
      storeLocation: product?.storeLocation || product?.storeId?.location || null,
      restaurantId: storeId,
      restaurant: storeName || "MoGrocery",
      restaurantAddress: storeAddress,
      restaurantLocation: product?.storeLocation || product?.storeId?.location || null,
      platform: "mogrocery",
      stockQuantity: product?.stockQuantity,
    });

    if (!didAdd) return;

    toast.custom(
      (t) => (
        <div className="bg-white border-l-4 border-yellow-400 shadow-lg rounded-lg p-4 flex flex-col gap-3 min-w-[300px] overflow-hidden relative">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-100 p-1.5 rounded-full">
              <CheckCircle className="text-yellow-600 w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">Added to Cart!</p>
              <p className="text-xs text-gray-500">{product?.name || "Product"} is now in your basket.</p>
            </div>
            <button onClick={() => toast.dismiss(t)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
          <div className="absolute bottom-0 left-0 h-1 bg-yellow-400 w-full" />
        </div>
      ),
      {
        duration: 2000,
        position: "top-center",
      },
    );
  };

  return (
    <div className={`bg-[#f4f6fb] dark:bg-[#0b0f17] dark:text-slate-100 flex flex-col min-h-0 font-sans ${isModal ? "h-full w-full" : "min-h-screen h-full w-full"}`}>
      <div className={`flex flex-col h-full min-h-0 ${!isModal ? "md:max-w-7xl md:mx-auto w-full bg-white dark:bg-[#0f172a] md:shadow-xl dark:md:shadow-black/40 md:my-4 md:rounded-2xl md:overflow-hidden" : ""}`}>
        <div className="bg-white dark:bg-[#0f172a] sticky top-0 z-50 px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 shadow-sm dark:shadow-black/40 relative">
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <ArrowLeft size={20} className="text-slate-800 dark:text-slate-100" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-wide line-clamp-1">
              {sidebarCategories.find((c) => c.id === selectedCategory)?.name || "All Products"}
            </h1>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">{products.length} items</span>
          </div>

          {isModal && (
            <button
              onClick={onClose}
              className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#1a1a1a] p-2 rounded-full shadow-lg border border-white/20 active:scale-95 transition-transform z-[80] md:hidden"
            >
              <X size={20} className="text-white" strokeWidth={2.5} />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {isCategoriesLoading ? (
            <CategoryTabsSkeleton />
          ) : (
            <div className="w-full bg-white dark:bg-[#0f172a] overflow-x-auto no-scrollbar z-10 flex items-center px-2 shadow-sm border-b border-gray-50 dark:border-slate-800 flex-shrink-0">
              {sidebarCategories.map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setSelectedSubcategoryId("");
                  }}
                  className={`relative flex flex-col items-center justify-center gap-1.5 py-3 px-1 cursor-pointer transition-all min-w-[76px] flex-shrink-0 ${selectedCategory === cat.id ? "bg-transparent" : "bg-white dark:bg-[#0f172a]"}`}
                >
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${selectedCategory === cat.id
                      ? "bg-[#fef3c7] scale-105 border-2 border-[#facd01] dark:bg-[#152338]"
                      : "bg-slate-50 border border-transparent dark:bg-[#111827] dark:border-slate-700"
                      } p-1.5`}
                  >
                    <img
                      src={cat.icon || FALLBACK_IMAGE}
                      alt={cat.name}
                      className="w-full h-full object-contain drop-shadow-sm"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.src = cat.id === "all" ? imgBag3D : FALLBACK_IMAGE;
                      }}
                    />
                  </div>

                  <span
                    className={`text-[10px] text-center leading-tight px-0.5 font-bold line-clamp-2 max-w-[70px] ${selectedCategory === cat.id ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
                  >
                    {cat.name}
                  </span>

                  {selectedCategory === cat.id && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#facd01] rounded-t-full" />
                  )}
                </div>
              ))}
            </div>
          )}

          <div ref={scrollableRef} data-sheet-scrollable="true" className="flex-1 min-h-0 bg-white dark:bg-[#0b1220] h-full overflow-y-auto pb-24 px-3 pt-4 touch-auto [-webkit-overflow-scrolling:touch]">
            {isProductsLoading && <ProductsGridSkeleton />}

            {!isProductsLoading && products.length === 0 && (
              <div className="text-sm text-slate-500 dark:text-slate-400 px-1 py-2">
                {isCategoriesLoading ? "Loading categories..." : "No products available."}
              </div>
            )}

            {!isProductsLoading && products.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {products.map((item) => {
                  const { productId, price, mrp, weight, cartItemId } = getCardProductData(item);
                  const cartItem = cartItemId ? getCartItem(cartItemId) : null;
                  const currentQty = Number(cartItem?.quantity || 0);
                  const alreadyInCart = currentQty > 0 || (cartItemId ? isInCart(cartItemId) : false);
                  const discountPercent =
                    mrp > price && mrp > 0
                      ? Math.max(1, Math.round(((mrp - price) / mrp) * 100))
                      : 0;

                  return (
                    <div
                      key={productId || item?.name}
                      className="flex flex-col bg-white dark:bg-[#0f172a] rounded-xl overflow-hidden shadow-sm dark:shadow-black/30 border border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-md transition-shadow h-full"
                      onClick={() => handleProductCardClick(item)}
                    >
                      <div className="relative w-full h-40 md:h-48 p-2 bg-white dark:bg-[#0b1220]">
                        {discountPercent > 0 && (
                          <div className="absolute top-2 left-0 bg-[#f8e71d] text-[9px] font-black px-1.5 py-0.5 rounded-r text-slate-900 z-10 shadow-sm">
                            {discountPercent}% OFF
                          </div>
                        )}

                        <div className="absolute top-1 right-1 z-30">
                          <WishlistButton item={buildProductDetailState(item)} />
                        </div>

                        <img
                          src={extractImage(item)}
                          alt={item?.name || "Product"}
                          className="w-full h-full object-contain drop-shadow-[0_8px_6px_rgba(0,0,0,0.15)]"
                          loading="lazy"
                          decoding="async"
                        />

                        {alreadyInCart ? (
                          <div className="absolute bottom-1 right-2 z-20">
                            <div
                              className="flex items-center gap-1 rounded-full border border-emerald-300 dark:border-emerald-500/60 bg-white dark:bg-[#0b1220] px-1 py-0.5 shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              <button
                                type="button"
                                className="w-5 h-5 flex items-center justify-center text-emerald-700 dark:text-emerald-300"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateQuantity(
                                    cartItemId,
                                    currentQty - 1,
                                    null,
                                    {
                                      id: cartItemId,
                                      name: item?.name || "Product",
                                      imageUrl: extractImage(item),
                                      stockQuantity: item?.stockQuantity,
                                    },
                                  );
                                }}
                              >
                                <Minus size={12} />
                              </button>
                              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 min-w-[14px] text-center">
                                {currentQty}
                              </span>
                              <button
                                type="button"
                                className="w-5 h-5 flex items-center justify-center text-emerald-700 dark:text-emerald-300"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateQuantity(
                                    cartItemId,
                                    currentQty + 1,
                                    null,
                                    {
                                      id: cartItemId,
                                      name: item?.name || "Product",
                                      imageUrl: extractImage(item),
                                      stockQuantity: item?.stockQuantity,
                                    },
                                  );
                                }}
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="absolute bottom-1 right-2 border text-[10px] font-black px-4 py-1 rounded shadow-sm transition-colors z-20 bg-white dark:bg-[#0b1220] border-[#facd01] text-gray-900 dark:text-slate-100 hover:bg-[#facd01]"
                            onClick={(e) => handleAddToCart(item, e)}
                          >
                            ADD
                          </button>
                        )}
                      </div>

                      <div className="px-2 pb-2 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="text-[12px] font-bold text-slate-900 dark:text-slate-100 leading-tight line-clamp-2 mb-1 min-h-[2.4em]">
                            {item?.name || "Product"}
                          </h3>

                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-400 mb-2">
                            {weight || "Unit"}
                          </p>

                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-black text-slate-900 dark:text-slate-100">
                              Rs {price}
                            </span>
                            {mrp > price && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 line-through decoration-slate-400">
                                Rs {mrp}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!isProductsLoading && isLoadingMoreProducts && (
              <div className="text-sm text-slate-500 dark:text-slate-400 px-1 py-3">
                Loading more products...
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      <AddToCartAnimation
        bottomOffset={20}
        pillClassName="scale-105"
        linkTo="/grocery/cart"
        platform="mogrocery"
        hideOnPages={true}
      />
    </div>
  );
}

const CategoryFoodsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isCategoriesRootPage = location?.pathname === "/grocery/categories";
  const stateCategoryId = String(location?.state?.categoryId || "").trim();
  const stateStoreId = String(location?.state?.storeId || "").trim();
  const queryStoreId = String(new URLSearchParams(location?.search || "").get("storeId") || "").trim();
  const cachedStoreId =
    typeof window !== "undefined"
      ? String(localStorage.getItem("mogrocery:selectedStoreId") || "").trim()
      : "";
  const initialCategory = isCategoriesRootPage ? "all" : (id || stateCategoryId || "all");
  const initialStoreId = queryStoreId || stateStoreId || cachedStoreId || "all-stores";

  return (
    <CategoryFoodsContent
      onClose={() => navigate(-1)}
      initialCategory={initialCategory}
      initialStoreId={initialStoreId}
    />
  );
};

export default CategoryFoodsPage;
