/* global importScripts, firebase */

let firebaseLoadFailed = false;
try {
  importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js");
} catch {
  // Avoid breaking SW registration if CDN is blocked/unavailable.
  firebaseLoadFailed = true;
}

const REQUIRED_FIELDS = ["apiKey", "authDomain", "projectId", "appId", "messagingSenderId"];
let messagingInstance = null;
const PUSH_DEDUPE_WINDOW_MS = 10000;
const seenPushes = new Map();

const getApiBaseUrl = () => {
  try {
    const url = new URL(self.location.href);
    const fromQuery = url.searchParams.get("apiBaseUrl");
    if (fromQuery) return fromQuery;
  } catch {
    // Ignore URL parse errors and fallback to relative URL.
  }
  return "/api";
};

const getRuntimeConfigFromQuery = () => {
  try {
    const url = new URL(self.location.href);
    const rawConfig = url.searchParams.get("firebaseConfig");
    if (!rawConfig) return {};

    const parsed = JSON.parse(rawConfig);
    return {
      apiKey: parsed?.apiKey || "",
      authDomain: parsed?.authDomain || "",
      projectId: parsed?.projectId || "",
      appId: parsed?.appId || "",
      messagingSenderId: parsed?.messagingSenderId || "",
      storageBucket: parsed?.storageBucket || "",
      measurementId: parsed?.measurementId || "",
      databaseURL: parsed?.databaseURL || "",
    };
  } catch {
    return {};
  }
};

const canInitialize = (config) =>
  REQUIRED_FIELDS.every((field) => typeof config[field] === "string" && config[field].trim());

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

const isDuplicatePush = (payload = {}) => {
  const dedupeId = getPushDedupId(payload);
  if (!dedupeId) return false;

  const now = Date.now();
  const previousTs = Number(seenPushes.get(dedupeId) || 0);
  seenPushes.set(dedupeId, now);

  for (const [id, ts] of seenPushes.entries()) {
    if ((now - ts) > PUSH_DEDUPE_WINDOW_MS) {
      seenPushes.delete(id);
    }
  }

  return previousTs > 0 && (now - previousTs) < PUSH_DEDUPE_WINDOW_MS;
};

const ensureMessaging = () => {
  if (messagingInstance) return messagingInstance;
  if (firebaseLoadFailed) return null;
  if (typeof firebase === "undefined") return null;

  const firebaseConfig = getRuntimeConfigFromQuery();
  if (!canInitialize(firebaseConfig)) return null;

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    messagingInstance = firebase.messaging();
    messagingInstance.onBackgroundMessage(async (payload) => {
      if (isDuplicatePush(payload)) {
        return;
      }

      const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const hasVisibleClient = windowClients.some(
        (client) => client?.visibilityState === "visible" || client?.focused === true,
      );
      if (hasVisibleClient) {
        return;
      }

      // When notification payload exists, browsers/FCM may already render it.
      // Avoid manually showing another one from SW.
      if (payload?.notification) {
        return;
      }

      const title = payload?.notification?.title || payload?.data?.title || "New Notification";
      const body = payload?.notification?.body || payload?.data?.body || payload?.data?.message || "";
      const icon = payload?.notification?.icon || "/vite.svg";
      const link =
        payload?.fcmOptions?.link ||
        payload?.data?.link ||
        payload?.data?.click_action ||
        payload?.data?.url ||
        "/";

      await self.registration.showNotification(title, {
        body,
        icon,
        data: { link, raw: payload?.data || {} },
        requireInteraction: true,
      });
    });
  } catch {
    messagingInstance = null;
    return null;
  }

  return messagingInstance;
};

ensureMessaging();

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.link || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return Promise.resolve();
    }),
  );
});

// Keep handlers registered during initial script evaluation to satisfy Messaging SW requirements.
self.addEventListener("push", () => {});
self.addEventListener("pushsubscriptionchange", () => {});
