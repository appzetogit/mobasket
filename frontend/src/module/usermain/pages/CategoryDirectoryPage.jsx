import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Mic,
  Home,
  ShoppingBag,
  LayoutGrid,
  ChevronDown,
} from "lucide-react";
import api, { restaurantAPI } from "@/lib/api";
import { useLocation as useUserLocation } from "../../user/hooks/useLocation";
import { useZone } from "../../user/hooks/useZone";

const FALLBACK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const MAX_INLINE_IMAGE_BYTES = 80_000;

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

export default function CategoryDirectoryPage() {
  const navigate = useNavigate();
  const { location: userLocation } = useUserLocation();
  const { zoneId } = useZone(userLocation, "mogrocery");
  const [categories, setCategories] = useState([]);
  const [groceryStores, setGroceryStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const buildProductDetailState = (product) => {
    const price = Number(product?.sellingPrice ?? product?.price ?? 0);
    const mrp = Number(product?.mrp ?? price);
    const unit = String(product?.weight || product?.unit || "").trim();
    const storeId = String(
      product?.storeId?._id || product?.storeId?.id || product?.storeId || ""
    ).trim();
    const storeName = String(product?.storeId?.name || product?.storeName || "").trim();
    const storeAddress = String(
      product?.storeAddress ||
      product?.storeId?.address ||
      product?.storeId?.location?.formattedAddress ||
      product?.storeId?.location?.address ||
      ""
    ).trim();

    return {
      id: product?._id || product?.id,
      name: product?.name || "Product",
      description: product?.description || "",
      weight: unit,
      unit,
      price,
      mrp,
      image: extractImage(product),
      variants: Array.isArray(product?.variants) ? product.variants : [],
      categoryId: extractId(product?.category),
      subcategoryId:
        extractId(product?.subcategory) ||
        extractId(Array.isArray(product?.subcategories) ? product.subcategories[0] : ""),
      storeId,
      storeName,
      storeAddress,
      storeLocation: product?.storeLocation || product?.storeId?.location || null,
      platform: "mogrocery",
    };
  };

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

  useEffect(() => {
    const loadCategoryDirectory = async () => {
      try {
        setIsLoading(true);
        setError("");

        const [categoriesResponse, storesResponse, productsResponse] = await Promise.all([
          api.get("/grocery/categories", {
            params: {
              includeSubcategories: true,
            },
          }),
          restaurantAPI.getRestaurants({
            limit: 200,
            platform: "mogrocery",
            onlyZone: "true",
            ...(zoneId ? { zoneId } : {}),
          }),
          zoneId
            ? api.get("/grocery/products", {
              params: { page: 1, limit: 2000, zoneId },
            })
            : Promise.resolve({ data: { data: [] } }),
        ]);

        const categoryPayload = Array.isArray(categoriesResponse?.data?.data)
          ? categoriesResponse.data.data
          : [];

        const restaurants = Array.isArray(storesResponse?.data?.data?.restaurants)
          ? storesResponse.data.data.restaurants
          : [];
        const stores = restaurants.filter((restaurant) => restaurant?.platform === "mogrocery" && restaurant?.isActive);
        setGroceryStores(stores);

        const rawProducts = Array.isArray(productsResponse?.data?.data)
          ? productsResponse.data.data
          : Array.isArray(productsResponse?.data?.data?.products)
            ? productsResponse.data.data.products
            : [];

        const allowedStoreIds = new Set(
          stores
            .map((store) => String(store?._id || store?.id || store?.restaurantId || "").trim())
            .filter(Boolean)
        );

        const zoneScopedProducts = rawProducts.filter((product) => {
          const productStoreId = String(
            product?.storeId?._id ||
            product?.storeId?.id ||
            product?.storeId ||
            product?.restaurantId?._id ||
            product?.restaurantId?.id ||
            product?.restaurantId ||
            ""
          ).trim();

          if (allowedStoreIds.size === 0) return false;
          return productStoreId && allowedStoreIds.has(productStoreId);
        });

        const availableSubcategoryIds = new Set();

        zoneScopedProducts.forEach((product) => {
          const subcategoryId = String(
            product?.subcategory?._id || product?.subcategory?.id || product?.subcategory || ""
          ).trim();
          if (subcategoryId) availableSubcategoryIds.add(subcategoryId);
        });

        const filteredCategories = categoryPayload
          .map((category) => {
            const categoryId = String(category?._id || "").trim();
            const subcategories = Array.isArray(category?.subcategories) ? category.subcategories : [];
            const filteredSubcategories = subcategories.filter((subcategory) =>
              availableSubcategoryIds.has(String(subcategory?._id || "").trim())
            );
            const products = zoneScopedProducts.filter((product) => {
              const productCategoryId = String(
                product?.category?._id || product?.category?.id || product?.category || ""
              ).trim();
              return categoryId && productCategoryId === categoryId;
            });

            return {
              ...category,
              subcategories: filteredSubcategories,
              products,
            };
          })
          .filter((category) => category.products.length > 0 || category.subcategories.length > 0);

        setCategories(filteredCategories);
      } catch (err) {
        setCategories([]);
        setGroceryStores([]);
        setError(err?.response?.data?.message || "Failed to load categories.");
      } finally {
        setIsLoading(false);
      }
    };

    loadCategoryDirectory();
  }, [zoneId]);

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
    return Math.max(8, Math.min(60, Math.round(8 + nearestStoreDistanceKm * 4)));
  }, [nearestStoreDistanceKm]);

  const topAddress = useMemo(() => {
    const normalize = (value) => (typeof value === "string" ? value.trim() : "");
    const isCoordinates = (value) => /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(normalize(value));
    const isPlaceholder = (value) => {
      const text = normalize(value).toLowerCase();
      return !text || text === "select location" || text === "select your location" || text === "current location";
    };
    const isUsable = (value) => !isPlaceholder(value) && !isCoordinates(value);

    const formattedAddress = normalize(userLocation?.formattedAddress);
    if (isUsable(formattedAddress)) return formattedAddress;

    const address = normalize(userLocation?.address);
    if (isUsable(address)) return address;

    const fallbackParts = [
      userLocation?.street,
      userLocation?.area,
      userLocation?.city,
      userLocation?.state,
      userLocation?.postalCode || userLocation?.zipCode,
    ]
      .map(normalize)
      .filter(Boolean);

    if (fallbackParts.length) return fallbackParts.join(", ");
    return "Select your location";
  }, [userLocation]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] dark:text-slate-100 pb-24 font-sans w-full">
      {/* Top Navbar Header */}
      <div className="bg-[#FACC15] dark:bg-[#0f172a] rounded-b-[2.5rem] pb-6 shadow-sm">
        <div className="px-4 pt-4 md:max-w-7xl md:mx-auto">
          {/* Top Info Row */}
          <div className="flex justify-between items-start mb-0">
            <div className="flex flex-col text-[#3e3212] dark:text-slate-100">
              <h1 className="text-[10px] uppercase font-black tracking-[0.15em] leading-none mb-1">
                MOBASKET IN
              </h1>
              <div className="flex items-baseline gap-1 leading-none">
                <span className="text-[24px] font-[900] tracking-tight">
                  {deliveryEtaMinutes} minutes
                </span>
              </div>
              <div className="flex items-center gap-1 mt-0.5 cursor-pointer">
                <span className="text-[13px] font-bold tracking-tight leading-tight line-clamp-2">
                  {topAddress}
                </span>
                <ChevronDown size={16} className="stroke-[3] dark:text-slate-200" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 mt-4 mb-2 md:max-w-xl md:mx-auto">
        <div className="bg-gray-100 dark:bg-[#111827] dark:border dark:border-slate-700 rounded-xl h-11 flex items-center px-4 shadow-sm w-full cursor-text relative">
          <label htmlFor="category-search" className="cursor-text absolute inset-0 z-0"></label>
          <Search className="text-slate-400 dark:text-slate-500 w-5 h-5 stroke-[2.5] mr-3 z-10 pointer-events-none" />
          <input
            id="category-search"
            type="text"
            placeholder='Search categories...'
            className="flex-1 bg-transparent text-slate-800 dark:text-slate-100 text-[14px] font-semibold outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 z-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="w-[1px] h-5 bg-slate-200 dark:bg-slate-700 mx-2 z-10 pointer-events-none"></div>
{/* <Mic className="text-slate-400 w-5 h-5 stroke-[2.5] z-10 pointer-events-none" /> */}
        </div>
      </div>

      {/* Categories Grid */}
      <div className="px-4 py-2 md:max-w-7xl md:mx-auto">
        {isLoading && (
          <p className="text-sm text-slate-500 dark:text-slate-400 px-1 py-3">Loading categories...</p>
        )}
        {!isLoading && error && (
          <p className="text-sm text-red-500 px-1 py-3">{error}</p>
        )}
        {!isLoading && !error && categories.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400 px-1 py-3">No categories available.</p>
        )}

        {categories.map((rawSection) => {
          const query = searchQuery.toLowerCase().trim();
          let section = rawSection;
          let isSectionMatch = false;

          if (query) {
            isSectionMatch = (rawSection.name || "").toLowerCase().includes(query);
            const matchingProducts = (rawSection.products || []).filter((product) => {
              const productName = (product?.name || "").toLowerCase();
              const subcategoryName = (
                product?.subcategory?.name ||
                (Array.isArray(product?.subcategories) ? product.subcategories[0]?.name : "") ||
                ""
              ).toLowerCase();
              return productName.includes(query) || subcategoryName.includes(query);
            });

            if (!isSectionMatch && matchingProducts.length === 0) {
              return null; // Skip this section fully if nothing matched
            }

            section = {
              ...rawSection,
              products: isSectionMatch ? rawSection.products : matchingProducts,
            };
          }

          return (
            <div key={section._id} className="mb-6">
              <h2 className="text-[15px] font-[800] text-slate-800 dark:text-slate-100 mb-3 ml-1">
                {section.name}
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
                {(section.products || []).map((product) => (
                  <div
                    key={product._id || product.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#111a28] p-3 shadow-sm dark:shadow-black/20 cursor-pointer"
                    onClick={() =>
                      navigate(`/food/${product?._id || product?.id}`, {
                        state: { item: buildProductDetailState(product) },
                      })
                    }
                  >
                    <div className="w-full aspect-square bg-slate-50 dark:bg-[#0d1624] rounded-xl overflow-hidden mb-2 flex items-center justify-center">
                      <img
                        src={extractImage(product)}
                        alt={product?.name || "Product"}
                        className="w-full h-full object-contain scale-110"
                      />
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                      {product?.name || "Product"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                      {product?.unit || product?.weight || "Unit not specified"}
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
                      Rs {Number(product?.sellingPrice || product?.price || 0)}
                    </p>
                  </div>
                ))}
              </div>
              {(!section.products || section.products.length === 0) && (
                <p className="text-xs text-slate-500 dark:text-slate-400 ml-1">No products available.</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 py-3 px-6 flex justify-between md:justify-center md:gap-28 items-end z-50 md:max-w-md md:mx-auto">
        <div
          className="flex flex-col items-center gap-1 cursor-pointer text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          onClick={() => navigate("/grocery")}
        >
          <Home size={24} />
          <span className="text-[10px] font-medium">Home</span>
        </div>

        <div
          className="flex flex-col items-center gap-1 cursor-pointer text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          onClick={() => navigate("/plans")}
        >
          <ShoppingBag size={24} />
          <span className="text-[10px] font-medium">Plan</span>
        </div>

        <div className="flex flex-col items-center gap-1 cursor-pointer">
          <LayoutGrid
            size={24}
            className="text-slate-900 dark:text-slate-100 fill-current bg-green-100 dark:bg-green-900/30 rounded-sm p-0.5"
          />
          <span className="text-[10px] font-bold text-slate-900 dark:text-slate-100">
            Categories
          </span>
          <div className="w-8 h-1 bg-slate-900 dark:bg-slate-100 rounded-full mt-0.5"></div>
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
  );
}
