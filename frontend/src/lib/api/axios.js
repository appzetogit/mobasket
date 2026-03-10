import axios from "axios";
import { toast } from "sonner";
import { API_BASE_URL } from "./config.js";
import { getRoleFromToken } from "../utils/auth.js";

// Network error tracking to prevent spam
const networkErrorState = {
  lastErrorTime: 0,
  lastToastTime: 0,
  errorCount: 0,
  toastShown: false,
  COOLDOWN_PERIOD: 30000, // 30 seconds cooldown for console errors
  TOAST_COOLDOWN_PERIOD: 60000, // 60 seconds cooldown for toast notifications
};

const errorToastState = {
  lastShownByKey: new Map(),
  COOLDOWN_PERIOD: 12000, // Avoid repeating identical error toasts for 12s
};

const inflightRequestState = new Map();
const responseCacheState = new Map();
const MAX_RESPONSE_CACHE_ENTRIES = 80;

const HOT_REQUEST_POLICIES = [
  {
    methods: ["get"],
    match: (path) =>
      path === "/order" ||
      path === "/restaurant/orders" ||
      path === "/grocery/store/orders" ||
      path === "/delivery/orders",
    cacheTtlMs: 1500,
    hiddenCacheTtlMs: 60000,
  },
  {
    methods: ["get"],
    match: (path) => /^\/order\/[^/]+$/.test(path),
    cacheTtlMs: 1500,
    hiddenCacheTtlMs: 20000,
  },
  {
    methods: ["get"],
    match: (path) =>
      /^\/restaurant\/[^/]+$/.test(path) &&
      !path.startsWith("/restaurant/orders") &&
      !path.startsWith("/restaurant/auth") &&
      !path.startsWith("/restaurant/menu") &&
      !path.startsWith("/restaurant/profile") &&
      !path.startsWith("/restaurant/staff") &&
      !path.startsWith("/restaurant/offers") &&
      !path.startsWith("/restaurant/inventory") &&
      !path.startsWith("/restaurant/categories") &&
      !path.startsWith("/restaurant/onboarding") &&
      !path.startsWith("/restaurant/delivery-status") &&
      !path.startsWith("/restaurant/finance") &&
      !path.startsWith("/restaurant/wallet") &&
      !path.startsWith("/restaurant/analytics") &&
      !path.startsWith("/restaurant/complaints") &&
      !path.startsWith("/restaurant/notifications"),
    cacheTtlMs: 30000,
    hiddenCacheTtlMs: 120000,
  },
  {
    methods: ["post"],
    match: (path) => path === "/order/calculate",
    dedupeInFlight: true,
  },
  {
    methods: ["post"],
    match: (path) => path === "/delivery/location",
    dedupeInFlight: true,
  },
];

const normalizeRequestPath = (url = "", baseUrl = API_BASE_URL) => {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return "/";

  let path = rawUrl;

  try {
    if (/^https?:\/\//i.test(rawUrl)) {
      path = new URL(rawUrl).pathname || "/";
    } else if (String(baseUrl || "").trim()) {
      path = new URL(rawUrl, baseUrl).pathname || rawUrl;
    }
  } catch {
    path = rawUrl;
  }

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  if (path === "/api") {
    return "/";
  }

  if (path.startsWith("/api/")) {
    path = path.slice(4) || "/";
  }

  return path.length > 1 ? path.replace(/\/+$/, "") : path;
};

const stableSerialize = (value) => {
  if (value === undefined) return "";
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (typeof FormData !== "undefined" && value instanceof FormData) {
    const pairs = Array.from(value.entries()).map(([key, entryValue]) => [
      key,
      typeof entryValue === "string"
        ? entryValue
        : entryValue?.name || String(entryValue),
    ]);
    pairs.sort(([left], [right]) => String(left).localeCompare(String(right)));
    return stableSerialize(pairs);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
};

const getHotRequestPolicy = (method = "get", path = "/") =>
  HOT_REQUEST_POLICIES.find(
    (policy) => policy.methods.includes(method) && policy.match(path),
  ) || null;

const shouldServeHiddenCache = (policy, ageMs) =>
  Boolean(policy?.hiddenCacheTtlMs) &&
  typeof document !== "undefined" &&
  document.hidden === true &&
  ageMs <= policy.hiddenCacheTtlMs;

const buildRequestIdentity = (config = {}, normalizedPath = "/") => {
  const method = String(config.method || "get").toLowerCase();
  const paramsPart = stableSerialize(config.params || {});
  const dataPart =
    method === "get" || method === "head"
      ? ""
      : stableSerialize(config.data || {});
  return `${method}|${normalizedPath}|${paramsPart}|${dataPart}`;
};

const trimResponseCache = () => {
  if (responseCacheState.size <= MAX_RESPONSE_CACHE_ENTRIES) return;

  const entries = Array.from(responseCacheState.entries()).sort(
    (left, right) => (left[1]?.timestamp || 0) - (right[1]?.timestamp || 0),
  );

  const overflowCount = Math.max(0, responseCacheState.size - MAX_RESPONSE_CACHE_ENTRIES);
  for (let index = 0; index < overflowCount; index += 1) {
    responseCacheState.delete(entries[index][0]);
  }
};

const getCachedResponse = (cacheKey, policy) => {
  if (!cacheKey || !policy) return null;

  const entry = responseCacheState.get(cacheKey);
  if (!entry) return null;

  const ageMs = Date.now() - entry.timestamp;
  if (ageMs <= (policy.cacheTtlMs || 0) || shouldServeHiddenCache(policy, ageMs)) {
    return entry.response;
  }

  responseCacheState.delete(cacheKey);
  return null;
};

const shouldInvalidateCachedPath = (mutatedPath = "/", cachedPath = "/") => {
  if (!mutatedPath || !cachedPath) return false;

  if (mutatedPath === cachedPath) return true;

  if (mutatedPath.startsWith("/order")) {
    return cachedPath === "/order" || cachedPath.startsWith("/order/");
  }

  if (mutatedPath.startsWith("/restaurant/orders")) {
    return cachedPath === "/restaurant/orders";
  }

  if (mutatedPath.startsWith("/grocery/store/orders")) {
    return cachedPath === "/grocery/store/orders";
  }

  if (mutatedPath.startsWith("/delivery/orders")) {
    return cachedPath === "/delivery/orders" || cachedPath.startsWith("/delivery/orders/");
  }

  if (mutatedPath.startsWith("/restaurant/")) {
    return cachedPath === mutatedPath || cachedPath === "/restaurant/orders";
  }

  if (mutatedPath.startsWith("/grocery/store/")) {
    return cachedPath === mutatedPath || cachedPath === "/grocery/store/orders";
  }

  return false;
};

const invalidateResponseCache = (mutatedPath = "/") => {
  for (const [cacheKey, entry] of responseCacheState.entries()) {
    if (shouldInvalidateCachedPath(mutatedPath, entry?.path || "/")) {
      responseCacheState.delete(cacheKey);
    }
  }
};

const canShowErrorToast = (key) => {
  if (!key) return true;
  const now = Date.now();
  const lastShown = errorToastState.lastShownByKey.get(key) || 0;
  if (now - lastShown < errorToastState.COOLDOWN_PERIOD) {
    return false;
  }
  errorToastState.lastShownByKey.set(key, now);
  return true;
};

const shouldSuppressTimeoutToast = (config = {}) => {
  if (!config || typeof config !== "object") return false;
  if (config.suppressTimeoutToast === true) return true;

  const url = String(config.url || "").toLowerCase();
  // Delivery module has frequent background calls; avoid user-facing timeout spam for these.
  return (
    url.includes("/delivery/location") ||
    url.includes("/delivery/orders") ||
    url.includes("/delivery/earnings/active-offers") ||
    url.includes("/grocery/store/orders") ||
    url.includes("/restaurant/orders") ||
    url.includes("/grocery/store/auth/me") ||
    url.includes("/restaurant/auth/me")
  );
};

const normalizeErrorMessage = (message = "") => {
  const raw = String(message || "").trim();
  if (!raw) return "An error occurred";
  const lowered = raw.toLowerCase();

  if (lowered.includes("timeout")) {
    return "Request timed out. Backend may be slow. Please retry.";
  }

  if (lowered === "network error") {
    return "Unable to connect to backend. Check server status.";
  }

  return raw;
};

// Validate API base URL on import
if (import.meta.env.DEV) {
  const backendUrl = API_BASE_URL.replace("/api", "");
  const frontendUrl = window.location.origin;

  if (API_BASE_URL.includes("5173") || backendUrl.includes("5173")) {
    console.error(
      "❌ CRITICAL: API_BASE_URL is pointing to FRONTEND port (5173) instead of BACKEND port (5000)",
    );
    console.error("💡 Current API_BASE_URL:", API_BASE_URL);
    console.error("💡 Frontend URL:", frontendUrl);
    console.error("💡 Backend should be at: http://localhost:5000");
    console.error(
      "💡 Fix: Check .env file - VITE_API_BASE_URL should be http://localhost:5000/api",
    );
  }
}

/**
 * Create axios instance with default configuration
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60 seconds default; uploads get a higher timeout below
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Include cookies for refresh token
});

const API_METRICS_MAX_RECENT_CALLS = 500;
const apiCallMetrics = {
  startedAt: new Date().toISOString(),
  totalCalls: 0,
  successCalls: 0,
  errorCalls: 0,
  byEndpoint: new Map(),
  recentCalls: [],
};

function toAbsoluteUrl(url = "") {
  const raw = String(url || "");
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) return raw;
    return new URL(raw, API_BASE_URL).toString();
  } catch {
    return raw;
  }
}

function normalizeMetricPath(url = "") {
  try {
    const absolute = toAbsoluteUrl(url);
    const parsed = new URL(absolute);
    let path = parsed.pathname || "/";
    if (path.startsWith("/api/")) path = path.slice(4);
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    return String(url || "");
  }
}

function getMetricEndpointKey(config = {}) {
  const method = String(config?.method || "get").toUpperCase();
  const path = normalizeMetricPath(config?.url || "");
  return `${method} ${path}`;
}

function ensureEndpointMetric(metricKey = "") {
  if (!apiCallMetrics.byEndpoint.has(metricKey)) {
    apiCallMetrics.byEndpoint.set(metricKey, {
      endpoint: metricKey,
      count: 0,
      successCount: 0,
      errorCount: 0,
      totalDurationMs: 0,
      minDurationMs: null,
      maxDurationMs: 0,
      avgDurationMs: 0,
      lastCalledAt: null,
      firstCalledAt: null,
      lastStatus: null,
      statusCounts: {},
      sampleUrls: new Set(),
    });
  }
  return apiCallMetrics.byEndpoint.get(metricKey);
}

function trackApiCall(config = {}, { status = null, isError = false, durationMs = 0 } = {}) {
  const metricKey = config.__metricKey || getMetricEndpointKey(config);
  const metric = ensureEndpointMetric(metricKey);
  const safeDuration = Number.isFinite(Number(durationMs)) ? Math.max(0, Number(durationMs)) : 0;
  const nowIso = new Date().toISOString();
  const absoluteUrl = toAbsoluteUrl(config?.url || "");

  apiCallMetrics.totalCalls += 1;
  if (isError) apiCallMetrics.errorCalls += 1;
  else apiCallMetrics.successCalls += 1;

  metric.count += 1;
  if (isError) metric.errorCount += 1;
  else metric.successCount += 1;
  metric.totalDurationMs += safeDuration;
  metric.avgDurationMs = Number((metric.totalDurationMs / metric.count).toFixed(2));
  metric.minDurationMs = metric.minDurationMs == null ? safeDuration : Math.min(metric.minDurationMs, safeDuration);
  metric.maxDurationMs = Math.max(metric.maxDurationMs, safeDuration);
  metric.lastCalledAt = nowIso;
  if (!metric.firstCalledAt) metric.firstCalledAt = nowIso;
  metric.lastStatus = status;

  const statusKey = status == null ? "NA" : String(status);
  metric.statusCounts[statusKey] = (metric.statusCounts[statusKey] || 0) + 1;
  if (absoluteUrl) metric.sampleUrls.add(absoluteUrl);

  apiCallMetrics.recentCalls.push({
    at: nowIso,
    endpoint: metricKey,
    method: String(config?.method || "get").toUpperCase(),
    url: absoluteUrl || String(config?.url || ""),
    status: statusKey,
    ok: !isError,
    durationMs: Number(safeDuration.toFixed(2)),
  });

  if (apiCallMetrics.recentCalls.length > API_METRICS_MAX_RECENT_CALLS) {
    apiCallMetrics.recentCalls.splice(0, apiCallMetrics.recentCalls.length - API_METRICS_MAX_RECENT_CALLS);
  }
}

function buildApiCallReport({ sortBy = "count" } = {}) {
  const rows = Array.from(apiCallMetrics.byEndpoint.values()).map((entry) => ({
    endpoint: entry.endpoint,
    count: entry.count,
    successCount: entry.successCount,
    errorCount: entry.errorCount,
    avgDurationMs: Number(entry.avgDurationMs.toFixed(2)),
    minDurationMs: Number((entry.minDurationMs || 0).toFixed(2)),
    maxDurationMs: Number(entry.maxDurationMs.toFixed(2)),
    lastStatus: entry.lastStatus == null ? "NA" : entry.lastStatus,
    firstCalledAt: entry.firstCalledAt,
    lastCalledAt: entry.lastCalledAt,
    statusCounts: { ...entry.statusCounts },
    sampleUrls: Array.from(entry.sampleUrls).slice(0, 5),
  }));

  const sorters = {
    count: (a, b) => b.count - a.count,
    avgDurationMs: (a, b) => b.avgDurationMs - a.avgDurationMs,
    maxDurationMs: (a, b) => b.maxDurationMs - a.maxDurationMs,
    errorCount: (a, b) => b.errorCount - a.errorCount,
  };

  rows.sort(sorters[sortBy] || sorters.count);

  return {
    startedAt: apiCallMetrics.startedAt,
    generatedAt: new Date().toISOString(),
    totalCalls: apiCallMetrics.totalCalls,
    successCalls: apiCallMetrics.successCalls,
    errorCalls: apiCallMetrics.errorCalls,
    endpointCount: rows.length,
    rows,
    recentCalls: [...apiCallMetrics.recentCalls],
  };
}

function reportToCsv(report) {
  const header = [
    "endpoint",
    "count",
    "successCount",
    "errorCount",
    "avgDurationMs",
    "minDurationMs",
    "maxDurationMs",
    "lastStatus",
    "firstCalledAt",
    "lastCalledAt",
    "statusCounts",
    "sampleUrls",
  ];
  const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map(escapeCsv).join(",")];
  report.rows.forEach((row) => {
    lines.push(
      [
        row.endpoint,
        row.count,
        row.successCount,
        row.errorCount,
        row.avgDurationMs,
        row.minDurationMs,
        row.maxDurationMs,
        row.lastStatus,
        row.firstCalledAt,
        row.lastCalledAt,
        JSON.stringify(row.statusCounts),
        row.sampleUrls.join(" | "),
      ]
        .map(escapeCsv)
        .join(","),
    );
  });
  return lines.join("\n");
}

if (typeof window !== "undefined") {
  window.__apiCallMetrics = apiCallMetrics;
  window.getApiCallReport = (options = {}) => buildApiCallReport(options);
  window.printApiCallReport = (options = {}) => {
    const report = buildApiCallReport(options);
    console.table(report.rows);
    return report;
  };
  window.exportApiCallReportCsv = (options = {}) => {
    const report = buildApiCallReport(options);
    return reportToCsv(report);
  };
}
const baseApiClientRequest = apiClient.request.bind(apiClient);

apiClient.request = function requestWithTrafficControl(configOrUrl, maybeConfig) {
  const requestConfig =
    typeof configOrUrl === "string"
      ? { ...(maybeConfig || {}), url: configOrUrl }
      : { ...(configOrUrl || {}) };

  const method = String(requestConfig.method || "get").toLowerCase();
  const normalizedPath = normalizeRequestPath(requestConfig.url, requestConfig.baseURL || apiClient.defaults.baseURL);
  const requestPolicy = getHotRequestPolicy(method, normalizedPath);
  const shouldDedupeInFlight = method === "get" || Boolean(requestPolicy?.dedupeInFlight);
  const requestKey = buildRequestIdentity(requestConfig, normalizedPath);

  const isMutationRequest = !["get", "head", "options"].includes(method);
  const isReadLikeMutation =
    (method === "post" && normalizedPath === "/order/calculate") ||
    (method === "post" && normalizedPath === "/delivery/location");

  if (isMutationRequest && !isReadLikeMutation) {
    invalidateResponseCache(normalizedPath);
  }

  const cachedResponse = getCachedResponse(requestKey, requestPolicy);
  if (cachedResponse) {
    return Promise.resolve(cachedResponse);
  }

  if (shouldDedupeInFlight && inflightRequestState.has(requestKey)) {
    return inflightRequestState.get(requestKey);
  }

  const requestPromise = baseApiClientRequest(requestConfig)
    .then((response) => {
      if (requestPolicy?.cacheTtlMs) {
        responseCacheState.set(requestKey, {
          path: normalizedPath,
          response,
          timestamp: Date.now(),
        });
        trimResponseCache();
      }
      return response;
    })
    .finally(() => {
      if (shouldDedupeInFlight) {
        inflightRequestState.delete(requestKey);
      }
    });

  if (shouldDedupeInFlight) {
    inflightRequestState.set(requestKey, requestPromise);
  }

  return requestPromise;
};
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
const MEDIA_UPLOAD_TIMEOUT_MS = 180000;

function isLikelyMediaUploadRequest(config = {}) {
  try {
    const data = config?.data;
    const headers = config?.headers || {};
    const contentType = String(
      headers["Content-Type"] || headers["content-type"] || "",
    ).toLowerCase();
    const url = String(config?.url || "").toLowerCase();

    const isFormData =
      typeof FormData !== "undefined" && data instanceof FormData;
    const isMultipartHeader = contentType.includes("multipart/form-data");
    const isUploadEndpoint =
      url.includes("/upload/") ||
      url.includes("upload-media") ||
      url.includes("image");

    return isFormData || isMultipartHeader || isUploadEndpoint;
  } catch {
    return false;
  }
}

// Prevent parallel refresh races that can cause false logout flows.
let refreshRequestPromise = null;

function isRestaurantModulePath(path = "") {
  return (
    path.startsWith("/restaurant") &&
    !path.startsWith("/restaurants") &&
    !path.startsWith("/restaurant/list") &&
    !path.startsWith("/restaurant/under-250")
  );
}

function getModuleFromPath(path = "") {
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/store")) return "grocery-store";
  if (isRestaurantModulePath(path)) return "restaurant";
  if (path.startsWith("/delivery")) return "delivery";
  return "user";
}

function getModuleFromRequestUrl(url = "", fallbackModule = "user") {
  const rawUrl = String(url || "");
  let path = rawUrl;

  try {
    if (/^https?:\/\//i.test(rawUrl)) {
      path = new URL(rawUrl).pathname || "";
    }
  } catch {
    path = rawUrl;
  }

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  if (path.startsWith("/api/")) {
    path = path.slice(4) || "/";
  }

  if (path.startsWith("/admin")) return "admin";
  // Admin grocery-store management endpoints are under /grocery/stores (plural).
  // These require admin auth, not user/store auth.
  if (path.startsWith("/grocery/stores")) return "admin";
  if (path.startsWith("/grocery/store")) return "grocery-store";
  if (path.startsWith("/restaurant")) return "restaurant";
  if (path.startsWith("/delivery")) return "delivery";
  return fallbackModule;
}

function getTokenMetaForModule(module = "user") {
  switch (module) {
    case "admin":
      return { tokenKey: "admin_accessToken", refreshTokenKey: "admin_refreshToken", expectedRole: "admin" };
    case "grocery-store":
      return { tokenKey: "grocery-store_accessToken", refreshTokenKey: "grocery-store_refreshToken", expectedRole: "restaurant" };
    case "restaurant":
      return { tokenKey: "restaurant_accessToken", refreshTokenKey: "restaurant_refreshToken", expectedRole: "restaurant" };
    case "delivery":
      return { tokenKey: "delivery_accessToken", refreshTokenKey: "delivery_refreshToken", expectedRole: "delivery" };
    default:
      return { tokenKey: "user_accessToken", refreshTokenKey: "user_refreshToken", expectedRole: "user" };
  }
}

function clearModuleSession(module = "user") {
  const { tokenKey, refreshTokenKey } = getTokenMetaForModule(module);
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(refreshTokenKey);
  localStorage.removeItem(`${module}_authenticated`);
  localStorage.removeItem(`${module}_user`);
  // Clear legacy token fallback too so interceptors don't keep attaching stale auth.
  localStorage.removeItem("accessToken");
}

function isHardRefreshAuthFailure(refreshError) {
  const refreshStatus = Number(refreshError?.response?.status || 0);
  const refreshMessage = String(
    refreshError?.response?.data?.message ||
    refreshError?.response?.data?.error ||
    refreshError?.message ||
    "",
  ).toLowerCase();

  // Any 401 from refresh endpoint means session recovery failed and should force re-auth.
  if (refreshStatus === 401) return true;
  if (refreshStatus !== 401) return false;

  return (
    refreshMessage.includes("invalid refresh token") ||
    refreshMessage.includes("refresh token is required") ||
    refreshMessage.includes("refresh token not found") ||
    refreshMessage.includes("invalid or expired refresh token") ||
    refreshMessage.includes("jwt malformed") ||
    refreshMessage.includes("jwt expired") ||
    refreshMessage.includes("token is invalid") ||
    refreshMessage.includes("unauthorized")
  );
}

/**
 * Get the appropriate module token based on the current route
 * @returns {string|null} - Access token for the current module or null
 */
function getTokenForCurrentRoute() {
  const module = getModuleFromPath(window.location.pathname);
  const { tokenKey } = getTokenMetaForModule(module);
  return localStorage.getItem(tokenKey) || localStorage.getItem("accessToken");
}

/**
 * Request Interceptor
 * Adds authentication token to requests based on current route
 */
apiClient.interceptors.request.use(
  async (config) => {
    const metricStart = typeof performance !== "undefined" ? performance.now() : Date.now();
    config.__requestStartedAt = metricStart;
    config.__metricKey = getMetricEndpointKey(config);

    // Apply a sane default timeout and relax it for media uploads.
    if (!Number.isFinite(Number(config.timeout)) || Number(config.timeout) <= 0) {
      config.timeout = DEFAULT_REQUEST_TIMEOUT_MS;
    }
    if (isLikelyMediaUploadRequest(config)) {
      config.timeout = Math.max(Number(config.timeout) || 0, MEDIA_UPLOAD_TIMEOUT_MS);
    }

    const currentPath = window.location.pathname;
    const currentModule = getModuleFromPath(currentPath);
    const requestModule = getModuleFromRequestUrl(config.url, currentModule);
    const { tokenKey, refreshTokenKey } = getTokenMetaForModule(requestModule);

    // Prefer token for the request module; only use route-based fallback when modules match.
    let accessToken = localStorage.getItem(tokenKey);
    if ((!accessToken || accessToken.trim() === "") && requestModule === currentModule) {
      accessToken = getTokenForCurrentRoute();
    }

    // Fallback to legacy token only for user module
    if (
      requestModule === "user" &&
      (!accessToken || accessToken.trim() === "")
    ) {
      accessToken = localStorage.getItem("accessToken");
    }

    const refreshToken = localStorage.getItem(refreshTokenKey);
    const isRefreshRequest = String(config.url || "").includes("/refresh-token");

    // If access token is missing but refresh token exists, try silent refresh before request.
    // This prevents first-call 401 ("No token provided") right after login/session restore.
    if (
      (!accessToken || accessToken.trim() === "" || accessToken === "null" || accessToken === "undefined") &&
      refreshToken &&
      !isRefreshRequest
    ) {
      try {
        let refreshEndpoint = "/auth/refresh-token";
        if (requestModule === "admin") refreshEndpoint = "/admin/auth/refresh-token";
        else if (requestModule === "grocery-store") refreshEndpoint = "/grocery/store/auth/refresh-token";
        else if (requestModule === "restaurant") refreshEndpoint = "/restaurant/auth/refresh-token";
        else if (requestModule === "delivery") refreshEndpoint = "/delivery/auth/refresh-token";

        const refreshBody = { refreshToken };
        const refreshHeaders = requestModule === "delivery" ? { "x-refresh-token": refreshToken } : {};

        if (!refreshRequestPromise) {
          refreshRequestPromise = axios
            .post(`${API_BASE_URL}${refreshEndpoint}`, refreshBody, {
              withCredentials: true,
              headers: refreshHeaders,
            })
            .finally(() => {
              refreshRequestPromise = null;
            });
        }

        const refreshResponse = await refreshRequestPromise;
        const refreshData = refreshResponse?.data?.data || refreshResponse?.data || {};
        const nextAccessToken = refreshData.accessToken;
        const nextRefreshToken = refreshData.refreshToken;

        if (nextAccessToken) {
          localStorage.setItem(tokenKey, nextAccessToken);
          accessToken = nextAccessToken;
        }
        if (nextRefreshToken) {
          localStorage.setItem(refreshTokenKey, nextRefreshToken);
        }
      } catch {
        // Let response interceptor handle auth failures.
      }
    }

    // Ensure headers object exists
    if (!config.headers) {
      config.headers = {};
    }

    // FormData requests handled silently

    // Determine if this is an authenticated route
    const requestUrl = config.url || "";

    // Check if this is a public restaurant route (should not require authentication)
    const isPublicRestaurantRoute =
      requestUrl.includes("/restaurant/list") ||
      requestUrl.includes("/restaurant/under-250") ||
      (requestUrl.includes("/restaurant/") &&
        !requestUrl.includes("/restaurant/outlet-timings") &&
        !requestUrl.includes("/restaurant/orders") &&
        !requestUrl.includes("/restaurant/auth") &&
        !requestUrl.includes("/restaurant/menu") &&
        !requestUrl.includes("/restaurant/profile") &&
        !requestUrl.includes("/restaurant/staff") &&
        !requestUrl.includes("/restaurant/offers") &&
        !requestUrl.includes("/restaurant/inventory") &&
        !requestUrl.includes("/restaurant/categories") &&
        !requestUrl.includes("/restaurant/onboarding") &&
        !requestUrl.includes("/restaurant/delivery-status") &&
        !requestUrl.includes("/restaurant/finance") &&
        !requestUrl.includes("/restaurant/wallet") &&
        !requestUrl.includes("/restaurant/analytics") &&
        !requestUrl.includes("/restaurant/complaints") &&
        !requestUrl.includes("/restaurant/notifications") &&
        (requestUrl.match(/\/restaurant\/[^/]+$/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/menu/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/addons/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/inventory/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/offers/)));

    const isAuthenticatedRoute =
      ["admin", "grocery-store", "restaurant", "delivery"].includes(requestModule) &&
      !isPublicRestaurantRoute;

    // For authenticated routes, ALWAYS ensure Authorization header is set if we have a token
    // This ensures FormData requests and other requests always have the token
    if (isAuthenticatedRoute) {
      // If no Authorization header or invalid format, set it
      if (
        !config.headers.Authorization ||
        (typeof config.headers.Authorization === "string" &&
          !config.headers.Authorization.startsWith("Bearer "))
      ) {
        if (
          accessToken &&
          accessToken.trim() !== "" &&
          accessToken !== "null" &&
          accessToken !== "undefined"
        ) {
          config.headers.Authorization = `Bearer ${accessToken.trim()}`;
        }
      }
    } else {
      // For non-authenticated routes (including public restaurant routes), don't add token
      // Public routes like /restaurant/list should work without authentication
      if (isPublicRestaurantRoute) {
        // Remove any existing Authorization header for public routes
        delete config.headers.Authorization;
      } else if (
        !config.headers.Authorization &&
        accessToken &&
        accessToken.trim() !== "" &&
        accessToken !== "null" &&
        accessToken !== "undefined"
      ) {
        // For other non-authenticated routes, add token if available (for optional auth)
        config.headers.Authorization = `Bearer ${accessToken.trim()}`;
      }
    }

    // If data is FormData, remove Content-Type header to let axios set it with boundary
    // BUT: Make sure Authorization header is preserved
    if (config.data instanceof FormData) {
      // Preserve Authorization header before removing Content-Type
      const authHeader = config.headers.Authorization;
      // Remove Content-Type to let axios set it with proper boundary
      delete config.headers["Content-Type"];
      // Always restore Authorization header if it was set (critical for authentication)
      if (authHeader) {
        config.headers.Authorization = authHeader;
      } else if (
        accessToken &&
        accessToken.trim() !== "" &&
        accessToken !== "null" &&
        accessToken !== "undefined"
      ) {
        // If no auth header but we have a token, add it
        config.headers.Authorization = `Bearer ${accessToken.trim()}`;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

/**
 * Response Interceptor
 * Handles token refresh and error responses
 */
apiClient.interceptors.response.use(
  (response) => {
    const startedAt = Number(response?.config?.__requestStartedAt || 0);
    const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const durationMs = startedAt > 0 ? endedAt - startedAt : 0;
    trackApiCall(response?.config || {}, {
      status: response?.status || 200,
      isError: false,
      durationMs,
    });

    // Reset network error state on successful response (backend is back online)
    if (networkErrorState.errorCount > 0) {
      networkErrorState.errorCount = 0;
      networkErrorState.lastErrorTime = 0;
      networkErrorState.toastShown = false;
    }

    // If response contains new access token, store it for the current module
    if (response.data?.accessToken) {
      const currentPath = window.location.pathname;
      const currentModule = getModuleFromPath(currentPath);
      const { tokenKey, expectedRole } = getTokenMetaForModule(currentModule);

      const token = response.data.accessToken;
      const role = getRoleFromToken(token);

      // Only store the token if the role matches the current module
      // For grocery stores, accept restaurant role since they use the same backend role
      if (!role || (role !== expectedRole && !(currentModule === "grocery-store" && role === "restaurant"))) {
        // Role mismatch - silently ignore
      } else {
        localStorage.setItem(tokenKey, token);
      }
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config || {};
    const startedAt = Number(originalRequest?.__requestStartedAt || 0);
    const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const durationMs = startedAt > 0 ? endedAt - startedAt : 0;
    trackApiCall(originalRequest, {
      status: error?.response?.status || error?.code || "ERR",
      isError: true,
      durationMs,
    });

    const requestUrl = String(originalRequest.url || "");
    const isRefreshRequest = requestUrl.includes("/refresh-token");

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshRequest) {
      const currentPath = window.location.pathname;
      const currentModule = getModuleFromPath(currentPath);
      const requestModule = getModuleFromRequestUrl(originalRequest.url, currentModule);
      const isStoreAuthPage = /^\/store\/(login|signup|otp)$/.test(currentPath);
      const isRestaurantAuthPage = /^\/restaurant\/(login|signup|signup-email|otp|forgot-password|welcome)$/.test(currentPath) || /^\/restaurant\/auth\/(sign-in|google-callback)$/.test(currentPath);
      const isDeliveryAuthPage = /^\/delivery\/(signin|signup|otp|welcome)/.test(currentPath);
      const isAdminAuthPage = /^\/admin\/(login|forgot-password)$/.test(currentPath);
      const isUserAuthPage = /^\/(?:user\/auth\/|auth\/(?:sign-in|otp|callback))/.test(currentPath);
      const hasStoreToken = typeof localStorage !== "undefined" && (localStorage.getItem("grocery-store_accessToken") || localStorage.getItem("grocery-store_refreshToken"));
      const hasRestaurantToken = typeof localStorage !== "undefined" && (localStorage.getItem("restaurant_accessToken") || localStorage.getItem("restaurant_refreshToken"));
      const hasDeliveryToken = typeof localStorage !== "undefined" && (localStorage.getItem("delivery_accessToken") || localStorage.getItem("delivery_refreshToken"));
      const hasAdminToken = typeof localStorage !== "undefined" && (localStorage.getItem("admin_accessToken") || localStorage.getItem("admin_refreshToken"));
      const hasUserToken = typeof localStorage !== "undefined" && (localStorage.getItem("user_accessToken") || localStorage.getItem("user_refreshToken"));
      const onAuthPageWithoutToken =
        (currentPath.startsWith("/store") && isStoreAuthPage && !hasStoreToken) ||
        (currentPath.startsWith("/restaurant") && isRestaurantAuthPage && !hasRestaurantToken) ||
        (currentPath.startsWith("/delivery") && isDeliveryAuthPage && !hasDeliveryToken) ||
        (currentPath.startsWith("/admin") && isAdminAuthPage && !hasAdminToken) ||
        (currentModule === "user" && isUserAuthPage && !hasUserToken);
      if (onAuthPageWithoutToken) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        // Determine which module's refresh endpoint to use based on current route
        let refreshEndpoint = "/auth/refresh-token";
        if (requestModule === "admin") refreshEndpoint = "/admin/auth/refresh-token";
        else if (requestModule === "grocery-store") refreshEndpoint = "/grocery/store/auth/refresh-token";
        else if (requestModule === "restaurant") refreshEndpoint = "/restaurant/auth/refresh-token";
        else if (requestModule === "delivery") refreshEndpoint = "/delivery/auth/refresh-token";

        // Try to refresh the token (single-flight).
        // Prefer sending refreshToken in body for store (cookie may not be sent cross-origin).
        const body = {};
        if (typeof localStorage !== "undefined") {
          const { refreshTokenKey } = getTokenMetaForModule(requestModule);
          body.refreshToken = localStorage.getItem(refreshTokenKey) || undefined;
        }
        const refreshHeaders = {};
        if (requestModule === "delivery" && body.refreshToken) {
          refreshHeaders["x-refresh-token"] = body.refreshToken;
        }
        if (!refreshRequestPromise) {
          refreshRequestPromise = axios
            .post(
              `${API_BASE_URL}${refreshEndpoint}`,
              body,
              {
                withCredentials: true,
                headers: refreshHeaders,
              },
            )
            .finally(() => {
              refreshRequestPromise = null;
            });
        }
        const response = await refreshRequestPromise;

        const responseData = response.data.data || response.data;
        const { accessToken, refreshToken: newRefreshToken } = responseData;

        if (accessToken) {
          // Determine which module's token to update based on current route
          const moduleAfterRefresh = getModuleFromRequestUrl(originalRequest.url, requestModule);
          const { tokenKey, refreshTokenKey, expectedRole } = getTokenMetaForModule(moduleAfterRefresh);

          const role = getRoleFromToken(accessToken);

          // Only store token if role matches expected module; otherwise treat as invalid for this module
          // For grocery stores, accept restaurant role since they use the same backend role
          if (!role || (role !== expectedRole && !(moduleAfterRefresh === "grocery-store" && role === "restaurant"))) {
            throw new Error("Role mismatch on refreshed token");
          }

          // Store new access token for the current module
          localStorage.setItem(tokenKey, accessToken);
          if (newRefreshToken && typeof localStorage !== "undefined") {
            try {
              localStorage.setItem(refreshTokenKey, newRefreshToken);
            } catch {
              // Failed to store refresh token - silently handle
            }
          }

          // Retry original request with new token
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Show error toast in development mode for refresh errors
        if (import.meta.env.DEV) {
          const refreshErrorMessage =
            refreshError.response?.data?.message ||
            refreshError.response?.data?.error ||
            refreshError.message ||
            "Token refresh failed";

          // Show toast notification for refresh errors
          toast.error(refreshErrorMessage, {
            duration: 3000,
            style: {
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "#ffffff",
              border: "1px solid #b91c1c",
              borderRadius: "12px",
              padding: "16px",
              fontSize: "14px",
              fontWeight: "500",
              boxShadow:
                "0 10px 25px -5px rgba(239, 68, 68, 0.3), 0 8px 10px -6px rgba(239, 68, 68, 0.2)",
            },
            className: "error-toast",
          });
        }

        const currentPath = window.location.pathname;
        const isHardAuthFailure = isHardRefreshAuthFailure(refreshError);

        // Only force logout on clear invalid refresh-token failures.
        if (isHardAuthFailure) {
          const isStorePath = currentPath.startsWith("/store");
          const isRestaurantPath =
            currentPath.startsWith("/restaurant") &&
            !currentPath.startsWith("/restaurants");
          const isDeliveryPath = currentPath.startsWith("/delivery");
          const isAdminPath = currentPath.startsWith("/admin");
          const isUserPath = !isStorePath && !isRestaurantPath && !isDeliveryPath && !isAdminPath;

          if (isStorePath) {
            clearModuleSession("grocery-store");
            if (!currentPath.startsWith("/store/login")) {
              window.location.href = "/store/login";
            }
          } else if (isRestaurantPath) {
            clearModuleSession("restaurant");
            const isRestaurantAuthPath =
              currentPath.startsWith("/restaurant/login") ||
              currentPath.startsWith("/restaurant/signup") ||
              currentPath.startsWith("/restaurant/otp") ||
              currentPath.startsWith("/restaurant/forgot-password") ||
              currentPath.startsWith("/restaurant/welcome") ||
              currentPath.startsWith("/restaurant/auth/");
            if (!isRestaurantAuthPath) {
              window.location.href = "/restaurant/login";
            }
          } else if (isDeliveryPath) {
            clearModuleSession("delivery");
            if (!currentPath.startsWith("/delivery/sign-in")) {
              window.location.href = "/delivery/sign-in";
            }
          } else if (isAdminPath) {
            clearModuleSession("admin");
            const isAdminAuthPath =
              currentPath.startsWith("/admin/login") ||
              currentPath.startsWith("/admin/forgot-password");
            if (!isAdminAuthPath) {
              window.location.href = "/admin/login";
            }
          } else if (isUserPath) {
            clearModuleSession("user");
            const isUserAuthPath =
              currentPath.startsWith("/user/auth/") ||
              currentPath.startsWith("/auth/sign-in") ||
              currentPath.startsWith("/auth/otp") ||
              currentPath.startsWith("/auth/callback");
            if (!isUserAuthPath) {
              window.location.href = "/user/auth/sign-in";
            }
          }
        }

        return Promise.reject(refreshError);
      }
    }

    // If refresh endpoint itself returns 401, avoid retry recursion and clear broken session.
    if (error.response?.status === 401 && isRefreshRequest) {
      const requestModule = getModuleFromRequestUrl(
        originalRequest.url,
        getModuleFromPath(window.location.pathname),
      );

      if (requestModule === "grocery-store") {
        clearModuleSession("grocery-store");
        if (!window.location.pathname.startsWith("/store/login")) {
          window.location.href = "/store/login";
        }
      } else if (requestModule === "restaurant") {
        clearModuleSession("restaurant");
        const isRestaurantAuthPath =
          window.location.pathname.startsWith("/restaurant/login") ||
          window.location.pathname.startsWith("/restaurant/signup") ||
          window.location.pathname.startsWith("/restaurant/otp") ||
          window.location.pathname.startsWith("/restaurant/forgot-password") ||
          window.location.pathname.startsWith("/restaurant/welcome") ||
          window.location.pathname.startsWith("/restaurant/auth/");
        if (!isRestaurantAuthPath) {
          window.location.href = "/restaurant/login";
        }
      } else if (requestModule === "delivery") {
        clearModuleSession("delivery");
        if (!window.location.pathname.startsWith("/delivery/sign-in")) {
          window.location.href = "/delivery/sign-in";
        }
      } else if (requestModule === "admin") {
        clearModuleSession("admin");
        if (!window.location.pathname.startsWith("/admin/login")) {
          window.location.href = "/admin/login";
        }
      } else {
        clearModuleSession("user");
        if (!window.location.pathname.startsWith("/user/auth/")) {
          window.location.href = "/user/auth/sign-in";
        }
      }
      return Promise.reject(error);
    }

    // Handle network errors specifically (backend not running)
    if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
      if (import.meta.env.DEV) {
        const now = Date.now();
        const timeSinceLastError = now - networkErrorState.lastErrorTime;
        const timeSinceLastToast = now - networkErrorState.lastToastTime;

        // Only log console errors if cooldown period has passed
        if (timeSinceLastError >= networkErrorState.COOLDOWN_PERIOD) {
          networkErrorState.errorCount++;
          networkErrorState.lastErrorTime = now;
          // Network error logging removed - errors handled via toast notifications
        }

        // Only show toast if cooldown period has passed
        if (timeSinceLastToast >= networkErrorState.TOAST_COOLDOWN_PERIOD) {
          networkErrorState.lastToastTime = now;
          networkErrorState.toastShown = true;

          // Show helpful error message (only once per minute)
          toast.error(
            `Backend not connected! Start server: cd MoBasket/backend && npm run dev`,
            {
              duration: 10000,
              id: "network-error-toast", // Use ID to prevent duplicate toasts
              style: {
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                color: "#ffffff",
                border: "1px solid #b45309",
                borderRadius: "12px",
                padding: "16px",
                fontSize: "14px",
                fontWeight: "500",
                boxShadow:
                  "0 10px 25px -5px rgba(245, 158, 11, 0.3), 0 8px 10px -6px rgba(245, 158, 11, 0.2)",
              },
              className: "network-error-toast",
            },
          );
        }
      }
      return Promise.reject(error);
    }

    // Handle timeout errors (ECONNABORTED)
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      // Timeout errors are usually due to slow backend or network issues
      // Don't spam console with timeout errors, but handle them gracefully
      if (import.meta.env.DEV) {
        const suppressToast = shouldSuppressTimeoutToast(originalRequest);
        const now = Date.now();
        const timeSinceLastError = now - networkErrorState.lastErrorTime;
        const timeSinceLastToast = now - networkErrorState.lastToastTime;

        // Only log console errors if cooldown period has passed
        if (timeSinceLastError >= networkErrorState.COOLDOWN_PERIOD) {
          networkErrorState.errorCount++;
          networkErrorState.lastErrorTime = now;
        }

        // Only show toast if cooldown period has passed
        if (!suppressToast && timeSinceLastToast >= networkErrorState.TOAST_COOLDOWN_PERIOD) {
          networkErrorState.lastToastTime = now;

          // Show helpful error message (only once per minute)
          toast.error(
            `Request timeout - Backend may be slow or not responding. Check server status.`,
            {
              duration: 8000,
              id: "timeout-error-toast", // Use ID to prevent duplicate toasts
              style: {
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                color: "#ffffff",
                border: "1px solid #b45309",
                borderRadius: "12px",
                padding: "16px",
                fontSize: "14px",
                fontWeight: "500",
                boxShadow:
                  "0 10px 25px -5px rgba(245, 158, 11, 0.3), 0 8px 10px -6px rgba(245, 158, 11, 0.2)",
              },
              className: "timeout-error-toast",
            },
          );
        }
      }
      return Promise.reject(error);
    }

    // Handle 404 errors (route not found)
    if (error.response?.status === 404) {
      if (import.meta.env.DEV) {
        const url = error.config?.url || "unknown";
        const responseMessage = String(
          error.response?.data?.message ||
          error.response?.data?.error ||
          "",
        ).toLowerCase();
        const isBusinessLogic404 =
          responseMessage.includes("no grocery store account found") ||
          responseMessage.includes("no restaurant account found") ||
          responseMessage.includes("please sign up first") ||
          responseMessage.includes("please login");

        // Show toast for auth routes (important)
        if (
          !isBusinessLogic404 &&
          (
            url.includes("/auth/") ||
            url.includes("/send-otp") ||
            url.includes("/verify-otp")
          )
        ) {
          toast.error(
            "Auth API endpoint not found. Make sure backend is running on port 5000.",
            {
              duration: 8000,
              style: {
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                color: "#ffffff",
                border: "1px solid #b91c1c",
                borderRadius: "12px",
                padding: "16px",
                fontSize: "14px",
                fontWeight: "500",
              },
            },
          );
        }
        // Show toast for restaurant routes (but not for getRestaurantById which can legitimately return 404)
        else if (url.includes("/restaurant/")) {
          // Only show error for critical restaurant endpoints like /restaurant/list
          // Individual restaurant lookups (like /restaurant/:id) can legitimately return 404 if restaurant doesn't exist
          // So we silently handle those 404s
          const isIndividualRestaurantLookup =
            /\/restaurant\/[a-f0-9]{24}$/i.test(url) ||
            (url.match(/\/restaurant\/[^/]+$/) &&
              !url.includes("/restaurant/list"));

          if (
            !isIndividualRestaurantLookup &&
            url.includes("/restaurant/list")
          ) {
            toast.error(
              "Restaurant API endpoint not found. Check backend routes.",
              {
                duration: 5000,
                style: {
                  background:
                    "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  color: "#ffffff",
                  border: "1px solid #b91c1c",
                  borderRadius: "12px",
                  padding: "16px",
                  fontSize: "14px",
                  fontWeight: "500",
                },
              },
            );
          }
          // Silently handle 404 for individual restaurant lookups (getRestaurantById)
          // These are expected to fail if restaurant doesn't exist in DB
        }
      }
      return Promise.reject(error);
    }

    // Show error toast in development mode only
    if (import.meta.env.DEV) {
      // Extract error messages from various possible locations
      const errorData = error.response?.data;

      // Handle array of error messages (common in validation errors)
      let errorMessages = [];

      if (Array.isArray(errorData?.message)) {
        errorMessages = errorData.message;
      } else if (Array.isArray(errorData?.errors)) {
        errorMessages = errorData.errors.map((err) => err.message || err);
      } else if (errorData?.message) {
        errorMessages = [errorData.message];
      } else if (errorData?.error) {
        errorMessages = [errorData.error];
      } else if (errorData?.data?.message) {
        errorMessages = Array.isArray(errorData.data.message)
          ? errorData.data.message
          : [errorData.data.message];
      } else if (error.message) {
        errorMessages = [error.message];
      } else {
        errorMessages = ["An error occurred"];
      }

      // Show beautiful error toast for each error message
      errorMessages.forEach((errorMessage, index) => {
        const safeErrorMessage = normalizeErrorMessage(errorMessage);
        const requestUrl = error.config?.url || "unknown";
        const requestMethod = String(error.config?.method || "get").toUpperCase();
        const statusCode = error.response?.status || "NA";
        const toastKey = `${requestMethod}|${requestUrl}|${statusCode}|${safeErrorMessage}`;
        if (!canShowErrorToast(toastKey)) return;

        // Add slight delay for multiple toasts to appear sequentially
        setTimeout(() => {
          toast.error(safeErrorMessage, {
            duration: 5000,
            id: toastKey,
            style: {
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "#ffffff",
              border: "1px solid #b91c1c",
              borderRadius: "12px",
              padding: "16px",
              fontSize: "14px",
              fontWeight: "500",
              boxShadow:
                "0 10px 25px -5px rgba(239, 68, 68, 0.3), 0 8px 10px -6px rgba(239, 68, 68, 0.2)",
            },
            className: "error-toast",
          });
        }, index * 100); // Stagger multiple toasts by 100ms
      });
    }

    // Handle other errors
    return Promise.reject(error);
  },
);

export default apiClient;
