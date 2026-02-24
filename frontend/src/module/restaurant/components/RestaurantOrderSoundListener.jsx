import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useRestaurantNotifications } from "../hooks/useRestaurantNotifications";

export default function RestaurantOrderSoundListener() {
  const location = useLocation();

  const shouldEnable = useMemo(() => {
    const pathname = String(location.pathname || "");
    const isRestaurantModuleRoute = pathname.startsWith("/restaurant") || pathname.startsWith("/store");
    if (!isRestaurantModuleRoute) return false;

    try {
      const restaurantToken = localStorage.getItem("restaurant_accessToken");
      const groceryToken = localStorage.getItem("grocery-store_accessToken");
      const genericToken = localStorage.getItem("accessToken");
      return Boolean(restaurantToken || groceryToken || genericToken);
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
