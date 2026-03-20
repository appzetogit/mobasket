import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDeliveryNotifications } from "../hooks/useDeliveryNotifications";

export default function DeliveryOrderSoundListener() {
  const location = useLocation();
  const navigate = useNavigate();
  const lastHandledEventKeyRef = useRef(null);

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

  const currentEventKey = useMemo(() => {
    if (newOrder) {
      const id =
        newOrder?.orderMongoId ||
        newOrder?.mongoId ||
        newOrder?._id ||
        newOrder?.orderId;
      return id ? `new:${String(id)}` : "new:unknown";
    }

    if (orderReady) {
      const id =
        orderReady?.orderMongoId ||
        orderReady?.mongoId ||
        orderReady?._id ||
        orderReady?.orderId;
      return id ? `ready:${String(id)}` : "ready:unknown";
    }

    return null;
  }, [newOrder, orderReady]);

  useEffect(() => {
    if (!currentEventKey) {
      return;
    }

    // Prime on first seen event to avoid redirecting because of stale state.
    if (lastHandledEventKeyRef.current === null) {
      lastHandledEventKeyRef.current = currentEventKey;
      return;
    }

    // Only redirect for fresh order events.
    if (lastHandledEventKeyRef.current === currentEventKey) {
      return;
    }

    lastHandledEventKeyRef.current = currentEventKey;

    if (location.pathname !== "/delivery") {
      navigate("/delivery");
    }
  }, [currentEventKey, location.pathname, navigate]);

  useEffect(() => {
    if (!shouldEnable) {
      lastHandledEventKeyRef.current = null;
    }
  }, [shouldEnable]);

  return null;
}
