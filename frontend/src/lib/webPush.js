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

const hasAuthTokenForModule = (moduleName) => {
  if (typeof window === "undefined") return false;

  if (moduleName === "user") {
    return Boolean(
      localStorage.getItem("user_accessToken") ||
      localStorage.getItem("user_refreshToken") ||
      localStorage.getItem("accessToken"),
    );
  }

  return Boolean(
    localStorage.getItem(`${moduleName}_accessToken`) ||
    localStorage.getItem(`${moduleName}_refreshToken`),
  );
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

export const setupWebPushForCurrentSession = async (pathname = "") => {
  if (typeof window === "undefined") return;
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

  await updater(token, "web");
  localStorage.setItem(tokenCacheKey, token);
};

export const teardownWebPushListener = () => {
  if (foregroundUnsubscribe) {
    foregroundUnsubscribe();
    foregroundUnsubscribe = null;
  }
};
