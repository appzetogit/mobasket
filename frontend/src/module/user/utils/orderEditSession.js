const ORDER_EDIT_SESSION_KEY = "mofood_order_edit_session";

const isObject = (value) => value && typeof value === "object";

const toSafeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const saveOrderEditSession = (session) => {
  if (typeof window === "undefined") return null;
  if (!isObject(session) || !session.orderRouteId) return null;

  const normalized = {
    orderRouteId: String(session.orderRouteId),
    orderMongoId: session.orderMongoId ? String(session.orderMongoId) : "",
    restaurantId: session.restaurantId ? String(session.restaurantId) : "",
    restaurantSlug: session.restaurantSlug ? String(session.restaurantSlug) : "",
    restaurantName: session.restaurantName ? String(session.restaurantName) : "",
    expiresAt: toSafeNumber(session.expiresAt, 0),
    items: Array.isArray(session.items) ? session.items : [],
  };

  localStorage.setItem(ORDER_EDIT_SESSION_KEY, JSON.stringify(normalized));
  return normalized;
};

export const getOrderEditSession = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ORDER_EDIT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isObject(parsed) || !parsed.orderRouteId) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearOrderEditSession = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ORDER_EDIT_SESSION_KEY);
};

export const getOrderEditRemainingSeconds = (session) => {
  if (!isObject(session)) return 0;
  const expiresAt = toSafeNumber(session.expiresAt, 0);
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
};

