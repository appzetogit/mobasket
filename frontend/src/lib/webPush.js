import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { authAPI, deliveryAPI, groceryStoreAPI, restaurantAPI } from "@/lib/api";
import { ensureFirebaseInitialized, firebaseApp, getFirebaseVapidKey } from "@/lib/firebase";
import { API_BASE_URL } from "@/lib/api/config.js";
import {
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from "@/lib/browserNotifications";

const FCM_TOKEN_CACHE_KEY = "fcm_web_token";
const PUSH_DEDUPE_WINDOW_MS = 10000;
const PUSH_DEDUPE_STORAGE_PREFIX = "push_seen_";

const moduleToUpdater = {
  user: authAPI.updateFcmToken,
  restaurant: restaurantAPI.updateFcmToken,
  "grocery-store": groceryStoreAPI.updateFcmToken,
  delivery: deliveryAPI.updateFcmToken,
};

const getModuleFromPathname = (pathname = "") => {
  if (pathname.startsWith("/restaurant")) return "restaurant";
  if (pathname.startsWith("/store")) return "grocery-store";
  if (pathname.startsWith("/delivery")) return "delivery";
  if (pathname.startsWith("/admin")) return "admin";
  return "user";
};

const hasUsableToken = (value) => {
  const token = String(value || "").trim();
  return Boolean(token && token !== "null" && token !== "undefined");
};

const hasAuthTokenForModule = (moduleName) => {
  if (typeof window === "undefined") return false;

  if (moduleName === "user") {
    return hasUsableToken(localStorage.getItem("user_accessToken")) || hasUsableToken(localStorage.getItem("accessToken"));
  }

  return hasUsableToken(localStorage.getItem(`${moduleName}_accessToken`));
};

const parseNotificationPayload = (payload = {}) => {
  const title = payload?.notification?.title || payload?.data?.title || "New Notification";
  const body = payload?.notification?.body || payload?.data?.body || payload?.data?.message || "";
  const link =
    payload?.fcmOptions?.link ||
    payload?.data?.link ||
    payload?.data?.click_action ||
    payload?.data?.url ||
    "/";

  return { title, body, link };
};

const getPushDedupId = (payload = {}) => {
  const explicitId =
    payload?.data?.pushId ||
    payload?.messageId ||
    payload?.data?.id ||
    payload?.data?.notificationId ||
    "";
  if (explicitId) return String(explicitId);

  const title = payload?.notification?.title || payload?.data?.title || "";
  const body = payload?.notification?.body || payload?.data?.body || payload?.data?.message || "";
  return `${title}::${body}`.trim();
};

const shouldSuppressDuplicatePush = (payload = {}) => {
  try {
    const dedupeId = getPushDedupId(payload);
    if (!dedupeId) return false;

    const now = Date.now();
    const storageKey = `${PUSH_DEDUPE_STORAGE_PREFIX}${dedupeId}`;
    const previousTs = Number(localStorage.getItem(storageKey) || 0);
    localStorage.setItem(storageKey, String(now));

    return previousTs > 0 && (now - previousTs) < PUSH_DEDUPE_WINDOW_MS;
  } catch {
    return false;
  }
};

const getRuntimeFirebaseConfigForSw = () => {
  const runtimeEnv = (typeof window !== "undefined" && window.__PUBLIC_ENV) ? window.__PUBLIC_ENV : {};
  return {
    apiKey: runtimeEnv.VITE_FIREBASE_API_KEY || "",
    authDomain: runtimeEnv.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: runtimeEnv.VITE_FIREBASE_PROJECT_ID || "",
    appId: runtimeEnv.VITE_FIREBASE_APP_ID || "",
    messagingSenderId: runtimeEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    storageBucket: runtimeEnv.VITE_FIREBASE_STORAGE_BUCKET || "",
    measurementId: runtimeEnv.VITE_FIREBASE_MEASUREMENT_ID || "",
    databaseURL: runtimeEnv.VITE_FIREBASE_DATABASE_URL || "",
  };
};

const showForegroundPushPopup = async (payload = {}) => {
  if (shouldSuppressDuplicatePush(payload)) {
    return;
  }

  const { title, body, link } = parseNotificationPayload(payload);
  const tag = payload?.data?.pushId || payload?.messageId || "admin_push";
  const swRegistration = await navigator.serviceWorker.getRegistration();

  if (swRegistration && Notification.permission === "granted") {
    await swRegistration.showNotification(title, {
      body,
      tag,
      data: { link },
      requireInteraction: true,
    });
    return;
  }

  const notification = showBrowserNotification({ title, body, tag });
  if (!notification) return;

  notification.onclick = () => {
    window.focus();
    if (link) {
      window.location.href = link;
    }
  };
};

let foregroundUnsubscribe = null;
let setupInFlightPromise = null;

const isEmbeddedFlutterWebView = () => {
  if (typeof window === "undefined") return false;
  return Boolean(window.flutter_inappwebview);
};

const isLocalDevelopmentHost = (hostname = "") => {
  const normalized = String(hostname || "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local")
  );
};

const shouldDisableWebPushInCurrentSession = () => {
  if (typeof window === "undefined") return false;
  return Boolean(import.meta?.env?.DEV) && isLocalDevelopmentHost(window.location.hostname);
};

const cleanupDevMessagingServiceWorkers = async () => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const messagingRegistrations = registrations.filter((registration) =>
      registration?.active?.scriptURL?.includes("firebase-messaging-sw.js") ||
      registration?.waiting?.scriptURL?.includes("firebase-messaging-sw.js") ||
      registration?.installing?.scriptURL?.includes("firebase-messaging-sw.js"),
    );

    await Promise.all(messagingRegistrations.map((registration) => registration.unregister()));
  } catch {
    // Best effort cleanup only.
  }
};

export const setupWebPushForCurrentSession = async (pathname = "") => {
  if (setupInFlightPromise) {
    return setupInFlightPromise;
  }

  setupInFlightPromise = (async () => {
  if (typeof window === "undefined") return;
  if (shouldDisableWebPushInCurrentSession()) {
    await cleanupDevMessagingServiceWorkers();
    return;
  }
  if (!window.isSecureContext || !("serviceWorker" in navigator) || !("Notification" in window)) return;

  const moduleName = getModuleFromPathname(pathname);
  const updater = moduleToUpdater[moduleName];
  if (!updater || !hasAuthTokenForModule(moduleName)) return;

  if (!ensureFirebaseInitialized() || !firebaseApp) return;
  if (!(await isSupported())) return;

  const swFirebaseConfig = getRuntimeFirebaseConfigForSw();
  const swUrl = `/firebase-messaging-sw.js?apiBaseUrl=${encodeURIComponent(API_BASE_URL)}&firebaseConfig=${encodeURIComponent(JSON.stringify(swFirebaseConfig))}`;
  const registration = await navigator.serviceWorker.register(swUrl, {
    scope: "/",
  });
  const messaging = getMessaging(firebaseApp);

  if (foregroundUnsubscribe) {
    foregroundUnsubscribe();
    foregroundUnsubscribe = null;
  }

  foregroundUnsubscribe = onMessage(messaging, (payload) => {
    if (isEmbeddedFlutterWebView() && payload?.notification) {
      // In Flutter WebView, native layer can already surface notification payloads.
      // Skip browser popup to avoid double rendering.
      return;
    }
    showForegroundPushPopup(payload).catch(() => {});
  });

  if (Notification.permission === "default") {
    requestBrowserNotificationPermission();
    const retryAfterInteraction = () => {
      window.setTimeout(() => {
        setupWebPushForCurrentSession(pathname).catch(() => {});
      }, 500);
    };
    document.addEventListener("click", retryAfterInteraction, { once: true });
    document.addEventListener("keydown", retryAfterInteraction, { once: true });
    document.addEventListener("touchstart", retryAfterInteraction, { once: true });
    return;
  }

  if (Notification.permission !== "granted") return;

  const token = await getToken(messaging, {
    vapidKey: getFirebaseVapidKey() || undefined,
    serviceWorkerRegistration: registration,
  });

  if (!token) return;

  const tokenCacheKey = `${FCM_TOKEN_CACHE_KEY}_${moduleName}`;
  const cachedToken = localStorage.getItem(tokenCacheKey);
  if (cachedToken === token) return;

  try {
    await updater(token, "web");
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    if (status === 401 || status === 403) {
      return;
    }
    throw error;
  }
  localStorage.setItem(tokenCacheKey, token);
  })()
    .finally(() => {
      setupInFlightPromise = null;
    });

  return setupInFlightPromise;
};

export const teardownWebPushListener = () => {
  if (foregroundUnsubscribe) {
    foregroundUnsubscribe();
    foregroundUnsubscribe = null;
  }
};
