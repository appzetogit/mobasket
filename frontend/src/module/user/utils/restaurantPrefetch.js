import { restaurantAPI } from "@/lib/api";

const PREFETCH_CACHE_KEY = "user.restaurant.prefetch.v1";
const PREFETCH_TTL_MS = 2 * 60 * 1000;

const memoryCache = new Map();
const inFlightRequests = new Map();

const normalizeKey = (value = "") => String(value || "").trim().toLowerCase();

const isFresh = (payload) =>
  Boolean(payload && Number(payload.fetchedAt) > 0 && Date.now() - Number(payload.fetchedAt) < PREFETCH_TTL_MS);

const readStorage = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(PREFETCH_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeStorage = (data) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREFETCH_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage write failures.
  }
};

const putCache = (key, payload) => {
  if (!key || !payload) return;
  memoryCache.set(key, payload);
  const storage = readStorage();
  storage[key] = payload;
  writeStorage(storage);
};

const getRestaurantIdForMenu = (restaurantData, restaurantSummary) => {
  const actualRestaurant = restaurantData?.restaurant || restaurantData;
  return (
    actualRestaurant?._id ||
    actualRestaurant?.restaurantId ||
    actualRestaurant?.id ||
    restaurantData?._id ||
    restaurantData?.restaurantId ||
    restaurantData?.id ||
    restaurantSummary?._id ||
    restaurantSummary?.restaurantId ||
    restaurantSummary?.id ||
    null
  );
};

export const getPrefetchedRestaurantForRoute = (slug) => {
  const key = normalizeKey(slug);
  if (!key) return null;

  const memoryPayload = memoryCache.get(key);
  if (isFresh(memoryPayload)) return memoryPayload;

  const storage = readStorage();
  const storedPayload = storage[key];
  if (isFresh(storedPayload)) {
    memoryCache.set(key, storedPayload);
    return storedPayload;
  }

  return null;
};

export const prefetchRestaurantForRoute = async ({ slug, restaurantSummary } = {}) => {
  const normalizedSlug = normalizeKey(
    slug || restaurantSummary?.slug || restaurantSummary?.restaurantId || restaurantSummary?._id || restaurantSummary?.id,
  );
  if (!normalizedSlug) return null;

  const cached = getPrefetchedRestaurantForRoute(normalizedSlug);
  if (cached) return cached;

  if (inFlightRequests.has(normalizedSlug)) {
    return inFlightRequests.get(normalizedSlug);
  }

  const requestPromise = (async () => {
    try {
      let restaurantData = null;
      try {
        const response = await restaurantAPI.getRestaurantById(normalizedSlug);
        restaurantData =
          response?.data?.data?.restaurant ||
          response?.data?.data ||
          response?.data?.restaurant ||
          null;
      } catch {
        // Ignore and fallback to summary data.
      }

      const menuRestaurantId = getRestaurantIdForMenu(restaurantData, restaurantSummary);
      let menuSections = [];
      if (menuRestaurantId) {
        try {
          const menuResponse = await restaurantAPI.getMenuByRestaurantId(menuRestaurantId);
          menuSections = menuResponse?.data?.data?.menu?.sections || [];
        } catch {
          // Ignore menu prefetch failures.
        }
      }

      const payload = {
        fetchedAt: Date.now(),
        slug: normalizedSlug,
        restaurantData,
        menuSections,
      };

      putCache(normalizedSlug, payload);
      return payload;
    } finally {
      inFlightRequests.delete(normalizedSlug);
    }
  })();

  inFlightRequests.set(normalizedSlug, requestPromise);
  return requestPromise;
};
