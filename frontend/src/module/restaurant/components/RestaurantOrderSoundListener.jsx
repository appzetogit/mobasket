import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useRestaurantNotifications } from "../hooks/useRestaurantNotifications";

export default function RestaurantOrderSoundListener() {
  const location = useLocation();

  const shouldEnable = useMemo(() => {
    const pathname = String(location.pathname || "");
    const isStoreRoute = pathname.startsWith("/store");
    const isRestaurantRoute = pathname.startsWith("/restaurant") && !pathname.startsWith("/restaurants");
    if (!isStoreRoute && !isRestaurantRoute) return false;

    try {
      const restaurantToken = localStorage.getItem("restaurant_accessToken");
      const groceryToken = localStorage.getItem("grocery-store_accessToken");
      // Only enable when we have the token for the current module (avoid /me 401 on login pages)
      if (isStoreRoute) return Boolean(groceryToken);
      if (isRestaurantRoute) return Boolean(restaurantToken);
      return false;
    } catch {
      return false;
    }
  }, [location.pathname]);

  useRestaurantNotifications({
    enabled: shouldEnable,
    enableSound: true,
  });

  return null;
}
