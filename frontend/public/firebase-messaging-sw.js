/* global importScripts, firebase */

importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js");

const REQUIRED_FIELDS = ["apiKey", "authDomain", "projectId", "appId", "messagingSenderId"];
let messagingInstance = null;

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

const ensureMessaging = () => {
  if (messagingInstance) return messagingInstance;

  const firebaseConfig = getRuntimeConfigFromQuery();
  if (!canInitialize(firebaseConfig)) return null;

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  messagingInstance = firebase.messaging();
  messagingInstance.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || payload?.data?.title || "New Notification";
    const body = payload?.notification?.body || payload?.data?.body || payload?.data?.message || "";
    const icon = payload?.notification?.icon || "/vite.svg";
    const link =
      payload?.fcmOptions?.link ||
      payload?.data?.link ||
      payload?.data?.click_action ||
      payload?.data?.url ||
      "/";

    self.registration.showNotification(title, {
      body,
      icon,
      data: { link, raw: payload?.data || {} },
      requireInteraction: true,
    });
  });

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
