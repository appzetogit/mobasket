import { deliveryAPI } from "@/lib/api";
import { isModuleAuthenticated } from "@/lib/utils/auth";
import { fetchDeliveryWallet } from "./deliveryWalletState";

const PREFETCH_TTL_MS = 30 * 1000;

let inFlightPrefetch = null;
let lastPrefetchAt = 0;

const canPrefetchDeliveryHome = () => {
  if (typeof window === "undefined") return false;
  if (window.location.pathname.startsWith("/delivery")) return false;
  return isModuleAuthenticated("delivery");
};

export const prefetchDeliveryHome = async ({ force = false } = {}) => {
  if (!canPrefetchDeliveryHome()) return null;

  const now = Date.now();
  if (!force && inFlightPrefetch) return inFlightPrefetch;
  if (!force && now - lastPrefetchAt < PREFETCH_TTL_MS) return null;

  inFlightPrefetch = Promise.allSettled([
    import("@/module/delivery/components/DeliveryRouter"),
    fetchDeliveryWallet(),
    deliveryAPI.getOrders({
      limit: 50,
      page: 1,
      includeDelivered: false,
    }),
    deliveryAPI.getProfile(),
    deliveryAPI.getActiveEarningAddons(),
  ])
    .catch(() => null)
    .finally(() => {
      lastPrefetchAt = Date.now();
      inFlightPrefetch = null;
    });

  return inFlightPrefetch;
};
