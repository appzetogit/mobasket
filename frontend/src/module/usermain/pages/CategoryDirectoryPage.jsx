import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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

export default function CategoryDirectoryPage() {
  const navigate = useNavigate();
  const { location: userLocation } = useUserLocation();
  const { zoneId } = useZone(userLocation, "mogrocery");
  const [categories, setCategories] = useState([]);
  const [groceryStores, setGroceryStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

        const availableCategoryIds = new Set();
        const availableSubcategoryIds = new Set();

        zoneScopedProducts.forEach((product) => {
          const categoryId = String(
            product?.category?._id || product?.category?.id || product?.category || ""
          ).trim();
          const subcategoryId = String(
            product?.subcategory?._id || product?.subcategory?.id || product?.subcategory || ""
          ).trim();
          if (categoryId) availableCategoryIds.add(categoryId);
          if (subcategoryId) availableSubcategoryIds.add(subcategoryId);
        });

        const filteredCategories = categoryPayload
          .map((category) => {
            const categoryId = String(category?._id || "").trim();
            const subcategories = Array.isArray(category?.subcategories) ? category.subcategories : [];
            const filteredSubcategories = subcategories.filter((subcategory) =>
              availableSubcategoryIds.has(String(subcategory?._id || "").trim())
            );

            return {
              ...category,
              subcategories: filteredSubcategories,
              __hasDirectProducts: availableCategoryIds.has(categoryId),
            };
          })
          .filter((category) => category.subcategories.length > 0 || category.__hasDirectProducts)
          .map(({ __hasDirectProducts, ...category }) => category);

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
    const formattedAddress = (userLocation?.formattedAddress || "").trim();
    if (formattedAddress) return formattedAddress;

    const address = (userLocation?.address || "").trim();
    if (address) return address;

    const fallbackParts = [
      userLocation?.street,
      userLocation?.area,
      userLocation?.city,
      userLocation?.state,
      userLocation?.postalCode || userLocation?.zipCode,
    ]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean);

    if (fallbackParts.length) return fallbackParts.join(", ");
    return "Select your location";
  }, [userLocation]);

  return (
    <div className="min-h-screen bg-white pb-24 font-sans w-full">
      {/* Top Navbar Header */}
      <div className="bg-[#FACC15] rounded-b-[2.5rem] pb-6 shadow-sm">
        <div className="px-4 pt-4 md:max-w-7xl md:mx-auto">
          {/* Top Info Row */}
          <div className="flex justify-between items-start mb-0">
            <div className="flex flex-col text-[#3e3212]">
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
                <ChevronDown size={16} className="stroke-[3]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 mt-4 mb-2 md:max-w-xl md:mx-auto">
        <div className="bg-gray-100 rounded-xl h-11 flex items-center px-4 shadow-sm w-full">
          <Search className="text-slate-400 w-5 h-5 stroke-[2.5] mr-3" />
          <input
            type="text"
            placeholder='Search "milk"'
            className="flex-1 bg-transparent text-slate-800 text-[14px] font-semibold outline-none placeholder:text-slate-400"
            disabled
          />
          <div className="w-[1px] h-5 bg-slate-200 mx-2"></div>
          <Mic className="text-slate-400 w-5 h-5 stroke-[2.5]" />
        </div>
      </div>

      {/* Categories Grid */}
      <div className="px-4 py-2 md:max-w-7xl md:mx-auto">
        {isLoading && (
          <p className="text-sm text-slate-500 px-1 py-3">Loading categories...</p>
        )}
        {!isLoading && error && (
          <p className="text-sm text-red-500 px-1 py-3">{error}</p>
        )}
        {!isLoading && !error && categories.length === 0 && (
          <p className="text-sm text-slate-500 px-1 py-3">No categories available.</p>
        )}

        {categories.map((section) => (
          <div key={section._id} className="mb-6">
            <h2 className="text-[15px] font-[800] text-slate-800 mb-3 ml-1">
              {section.name}
            </h2>
            <div className="grid grid-cols-4 gap-x-2 gap-y-6 md:grid-cols-6 lg:grid-cols-8 md:gap-6">
              {(section.subcategories || []).map((item) => (
                <Link
                  key={item._id}
                  to={`/grocery/subcategory/${item._id}`}
                  className="flex flex-col items-center gap-2 cursor-pointer group"
                >
                  <div className="w-full aspect-square bg-[#e6f7f5] rounded-2xl p-2.5 flex items-center justify-center relative overflow-hidden group-hover:bg-[#d8edd6] transition-colors">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-contain drop-shadow-[0_10px_8px_rgba(0,0,0,0.2)]"
                      />
                    ) : (
                      <div className="w-full h-full rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl font-black">
                        {(item.name || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-center text-slate-800 leading-tight px-1 break-words w-full">
                    {item.name}
                  </span>
                </Link>
              ))}
            </div>
            {(!section.subcategories || section.subcategories.length === 0) && (
              <p className="text-xs text-slate-500 ml-1">No subcategories available.</p>
            )}
          </div>
        ))}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-100 py-3 px-6 flex justify-between md:justify-center md:gap-28 items-end z-50 md:max-w-md md:mx-auto">
        <div
          className="flex flex-col items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-600"
          onClick={() => navigate("/grocery")}
        >
          <Home size={24} />
          <span className="text-[10px] font-medium">Home</span>
        </div>

        <div
          className="flex flex-col items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-600"
          onClick={() => navigate("/plans")}
        >
          <ShoppingBag size={24} />
          <span className="text-[10px] font-medium">Plan</span>
        </div>

        <div className="flex flex-col items-center gap-1 cursor-pointer">
          <LayoutGrid
            size={24}
            className="text-slate-900 fill-current bg-green-100 rounded-sm p-0.5"
          />
          <span className="text-[10px] font-bold text-slate-900">
            Categories
          </span>
          <div className="w-8 h-1 bg-slate-900 rounded-full mt-0.5"></div>
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
