import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDeliveryNotifications } from "../hooks/useDeliveryNotifications";

export default function DeliveryOrderSoundListener() {
  const location = useLocation();
  const navigate = useNavigate();

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

  const { newOrder, orderReady } = useDeliveryNotifications({
    enabled: shouldEnable,
    enableSound: true,
    enableBrowserNotification: true,
  });

  useEffect(() => {
    const isOnDeliveryHome = location.pathname === "/delivery";
    if (isOnDeliveryHome) {
      return;
    }

    if (newOrder || orderReady) {
      navigate("/delivery");
    }
  }, [location.pathname, navigate, newOrder, orderReady]);

  return null;
}
