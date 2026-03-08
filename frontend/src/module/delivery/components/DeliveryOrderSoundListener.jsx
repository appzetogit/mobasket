import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useDeliveryNotifications } from "../hooks/useDeliveryNotifications";

export default function DeliveryOrderSoundListener() {
  const location = useLocation();

  const shouldEnable = useMemo(() => {
    const pathname = String(location.pathname || "");
    const isDeliveryRoute = pathname.startsWith("/delivery");

    if (!isDeliveryRoute) {
      return false;
    }

    try {
      const deliveryToken =
        localStorage.getItem("delivery_accessToken") || localStorage.getItem("accessToken");
      return Boolean(deliveryToken);
    } catch {
      return false;
    }
  }, [location.pathname]);

  useDeliveryNotifications({
    enabled: shouldEnable,
    enableSound: true,
    enableBrowserNotification: true,
  });

  return null;
}
