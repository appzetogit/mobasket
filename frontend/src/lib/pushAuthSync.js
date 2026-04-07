import {
  setupWebPushForCurrentSession,
  syncNativeMobilePushForCurrentSession,
} from "@/lib/webPush";

const MODULE_PATHS = {
  user: "/",
  restaurant: "/restaurant",
  "grocery-store": "/store",
  delivery: "/delivery",
};

export const syncPushAfterAuth = async (moduleName = "user") => {
  const pathname = MODULE_PATHS[moduleName] || "/";

  try {
    await setupWebPushForCurrentSession(pathname, { forceSync: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Web push auth sync failed for ${moduleName}:`, error?.message || error);
  }

  try {
    await syncNativeMobilePushForCurrentSession(pathname, { forceSync: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Native push auth sync failed for ${moduleName}:`, error?.message || error);
  }
};
