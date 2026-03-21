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

const getMenuSectionsByLookupIds = async (lookupIds = []) => {
  const uniqueLookupIds = Array.from(
    new Set(
      (Array.isArray(lookupIds) ? lookupIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  if (uniqueLookupIds.length === 0) return null;

  const menuPromises = uniqueLookupIds.map(async (lookupId) => {
    try {
      const menuResponse = await restaurantAPI.getMenuByRestaurantId(lookupId, {
        timeout: 6000,
      });
      const menu = menuResponse?.data?.data?.menu;
      if (menu && Array.isArray(menu.sections)) {
        return menu.sections;
      }
      throw Object.assign(new Error("Menu not found"), { response: { status: 404 } });
    } catch (error) {
      if (error?.response?.status === 404) {
        throw Object.assign(new Error("Menu not found"), { response: { status: 404 } });
      }
      throw error;
    }
  });

  try {
    return await Promise.any(menuPromises);
  } catch {
    return null;
  }
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

export const awaitPrefetchedRestaurantForRoute = async (slug, { maxWaitMs = 700 } = {}) => {
  const key = normalizeKey(slug);
  if (!key) return null;

  const cached = getPrefetchedRestaurantForRoute(key);
  if (cached) return cached;

  const inFlight = inFlightRequests.get(key);
  if (!inFlight) return null;

  const timeoutMs = Number.isFinite(maxWaitMs) ? Math.max(0, Number(maxWaitMs)) : 700;
  if (timeoutMs === 0) {
    try {
      return await inFlight;
    } catch {
      return null;
    }
  }

  return Promise.race([
    inFlight.catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
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
      const restaurantRequest = (async () => {
        try {
          const response = await restaurantAPI.getRestaurantById(normalizedSlug, {
            timeout: 6000,
          });
          return (
            response?.data?.data?.restaurant ||
            response?.data?.data ||
            response?.data?.restaurant ||
            null
          );
        } catch {
          return null;
        }
      })();

      const fastMenuLookupIds = [
        restaurantSummary?.restaurantId,
        restaurantSummary?._id,
        restaurantSummary?.id,
        restaurantSummary?.slug,
        normalizedSlug,
      ];
      const fastMenuRequest = getMenuSectionsByLookupIds(fastMenuLookupIds);

      const [restaurantData, fastMenuSections] = await Promise.all([
        restaurantRequest,
        fastMenuRequest,
      ]);

      let menuSections = Array.isArray(fastMenuSections) ? fastMenuSections : null;
      if (!menuSections) {
        const menuRestaurantId = getRestaurantIdForMenu(restaurantData, restaurantSummary);
        menuSections = await getMenuSectionsByLookupIds([menuRestaurantId, normalizedSlug]);
      }

      const payload = {
        fetchedAt: Date.now(),
        slug: normalizedSlug,
        restaurantData,
        menuSections: Array.isArray(menuSections) ? menuSections : [],
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
