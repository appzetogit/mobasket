import { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import { API_BASE_URL, SOCKET_BASE_URL } from '@/lib/api/config';
import { deliveryAPI } from '@/lib/api';
import alertSound from '@/assets/audio/alert.mp3';
import originalSound from '@/assets/audio/original.mp3';
import {
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from '@/lib/browserNotifications';

const DELIVERY_ORDER_SUPPRESSION_KEY = 'delivery_suppressed_order_ids';

const readSuppressedOrderIds = () => {
  try {
    const raw = localStorage.getItem(DELIVERY_ORDER_SUPPRESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : []);
  } catch (error) {
    return new Set();
  }
};

const persistSuppressedOrderIds = (orderIds) => {
  try {
    localStorage.setItem(
      DELIVERY_ORDER_SUPPRESSION_KEY,
      JSON.stringify(Array.from(orderIds))
    );
  } catch (error) {
    // Ignore storage failures.
  }
};

const formatPolledOrderForNotification = (orderData = {}) => {
  const customerCoords = orderData?.address?.location?.coordinates;
  const storeCoords = orderData?.restaurantId?.location?.coordinates;

  return {
    orderId: orderData?.orderId || orderData?._id,
    orderMongoId: orderData?._id?.toString?.() || orderData?._id || null,
    mongoId: orderData?._id?.toString?.() || orderData?._id || null,
    status: orderData?.status || 'preparing',
    restaurantName: orderData?.restaurantName || orderData?.restaurantId?.name || 'Store',
    restaurantAddress:
      orderData?.restaurantId?.location?.formattedAddress ||
      orderData?.restaurantId?.location?.address ||
      orderData?.restaurantId?.address ||
      'Restaurant address',
    restaurantLocation: Array.isArray(storeCoords) && storeCoords.length >= 2
      ? {
          latitude: Number(storeCoords[1]),
          longitude: Number(storeCoords[0]),
          address:
            orderData?.restaurantId?.location?.formattedAddress ||
            orderData?.restaurantId?.location?.address ||
            orderData?.restaurantId?.address ||
            'Restaurant address',
        }
      : null,
    customerName: orderData?.userId?.name || 'Customer',
    customerPhone: orderData?.userId?.phone || '',
    customerLocation: Array.isArray(customerCoords) && customerCoords.length >= 2
      ? {
          latitude: Number(customerCoords[1]),
          longitude: Number(customerCoords[0]),
          address:
            orderData?.address?.formattedAddress ||
            orderData?.address?.address ||
            orderData?.address?.street ||
            'Customer address',
        }
      : null,
    items: Array.isArray(orderData?.items) ? orderData.items : [],
    total: orderData?.pricing?.total || 0,
    totalAmount: orderData?.pricing?.total || 0,
    deliveryFee: orderData?.pricing?.deliveryFee || 0,
    paymentMethod: orderData?.payment?.method || 'cash',
    payment: orderData?.payment || null,
    createdAt: orderData?.createdAt,
    estimatedDeliveryTime: orderData?.estimatedDeliveryTime || 30,
    note: orderData?.note || '',
    pickupDistance: orderData?.pickupDistance || 'Distance not available',
    deliveryDistance:
      orderData?.dropDistance ||
      (orderData?.assignmentInfo?.distance ? `${Number(orderData.assignmentInfo.distance).toFixed(2)} km` : 'Distance not available'),
    estimatedEarnings: orderData?.estimatedEarnings || 0,
    fullOrder: orderData,
  };
};

export const useDeliveryNotifications = (options = {}) => {
  const {
    enabled = true,
    enableSound = true,
    enableBrowserNotification = true,
  } = options;
  // CRITICAL: All hooks must be called unconditionally and in the same order every render
  // Order: useRef -> useState -> useEffect -> useCallback
  
  // Step 1: All refs first (unconditional)
  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const suppressedOrderIdsRef = useRef(readSuppressedOrderIds());
  
  // Step 2: All state hooks (unconditional)
  const [newOrder, setNewOrder] = useState(null);
  const [orderReady, setOrderReady] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [deliveryPartnerId, setDeliveryPartnerId] = useState(null);
  const enableSoundRef = useRef(enableSound);
  const enableBrowserNotificationRef = useRef(enableBrowserNotification);

  useEffect(() => {
    enableSoundRef.current = enableSound;
  }, [enableSound]);

  useEffect(() => {
    enableBrowserNotificationRef.current = enableBrowserNotification;
  }, [enableBrowserNotification]);

  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      setDeliveryPartnerId(null);
      setNewOrder(null);
      setOrderReady(null);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    }
  }, [enabled]);

  // Step 3: All callbacks before effects (unconditional)
  // Track user interaction for autoplay policy
  const userInteractedRef = useRef(false);
  
  const playNotificationSound = useCallback(() => {
    try {
      // Get current selected sound preference from localStorage
      const selectedSound = localStorage.getItem('delivery_alert_sound') || 'zomato_tone';
      const soundFile = selectedSound === 'original' ? originalSound : alertSound;
      
      // Update audio source if preference changed or initialize if not exists
      if (audioRef.current) {
        const currentSrc = audioRef.current.src;
        const newSrc = soundFile;
        // Check if source needs to be updated
        if (!currentSrc.includes(newSrc.split('/').pop())) {
          audioRef.current.pause();
          audioRef.current.src = newSrc;
          audioRef.current.load();
        }
      } else {
        // Initialize audio if not exists
        audioRef.current = new Audio(soundFile);
        audioRef.current.volume = 0.7;
      }
      
      if (audioRef.current) {
        if (!enableSoundRef.current) {
          return;
        }

        // Only play if user has interacted with the page (browser autoplay policy)
        if (!userInteractedRef.current) {
          return;
        }
        
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(error => {
          // Don't log autoplay policy errors as they're expected
          if (!error.message?.includes('user didn\'t interact') && !error.name?.includes('NotAllowedError')) {
            console.warn('Error playing notification sound:', error);
          }
        });
      }
    } catch (error) {
      // Don't log autoplay policy errors
      if (!error.message?.includes('user didn\'t interact') && !error.name?.includes('NotAllowedError')) {
        console.warn('Error playing sound:', error);
      }
    }
  }, []);

  const triggerOrderBuzz = useCallback(() => {
    try {
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
        return;
      }
      // Two short pulses for new order alert.
      navigator.vibrate([180, 120, 220]);
    } catch (error) {
      // Ignore vibration errors.
    }
  }, []);

  const normalizeOrderIds = useCallback((orderData = {}) => {
    return [
      orderData?.orderId,
      orderData?.orderMongoId,
      orderData?.mongoId,
      orderData?._id,
      orderData?.fullOrder?._id,
      orderData?.fullOrder?.orderId,
    ]
      .map((id) => (id == null ? null : String(id)))
      .filter(Boolean);
  }, []);

  const suppressOrderNotifications = useCallback((...orderIds) => {
    let changed = false;
    orderIds
      .flat()
      .map((id) => (id == null ? null : String(id)))
      .filter(Boolean)
      .forEach((id) => {
        if (!suppressedOrderIdsRef.current.has(id)) {
          suppressedOrderIdsRef.current.add(id);
          changed = true;
        }
      });

    if (changed) {
      persistSuppressedOrderIds(suppressedOrderIdsRef.current);
    }

    setNewOrder((currentOrder) => {
      if (!currentOrder) return currentOrder;
      const currentIds = normalizeOrderIds(currentOrder);
      return currentIds.some((id) => suppressedOrderIdsRef.current.has(id)) ? null : currentOrder;
    });
  }, [normalizeOrderIds]);

  const shouldIgnoreOrderNotification = useCallback((orderData = {}) => {
    const ids = normalizeOrderIds(orderData);
    return ids.some((id) => suppressedOrderIdsRef.current.has(id));
  }, [normalizeOrderIds]);

  const isOrderAlreadyInProgress = (orderData = {}) => {
    const status = String(orderData?.status || '').toLowerCase();
    const phase = String(
      orderData?.deliveryPhase ||
      orderData?.deliveryState?.currentPhase ||
      ''
    ).toLowerCase();
    const deliveryStateStatus = String(orderData?.deliveryState?.status || '').toLowerCase();
    const notificationPhase = String(orderData?.assignmentInfo?.notificationPhase || '').toLowerCase();

    return (
      notificationPhase === 'accepted' ||
      status === 'out_for_delivery' ||
      status === 'picked_up' ||
      status === 'delivered' ||
      phase === 'en_route_to_pickup' ||
      phase === 'at_pickup' ||
      phase === 'en_route_to_delivery' ||
      phase === 'picked_up' ||
      phase === 'at_delivery' ||
      phase === 'completed' ||
      deliveryStateStatus === 'accepted' ||
      deliveryStateStatus === 'reached_pickup' ||
      deliveryStateStatus === 'order_confirmed' ||
      deliveryStateStatus === 'en_route_to_delivery' ||
      deliveryStateStatus === 'reached_drop' ||
      deliveryStateStatus === 'delivered'
    );
  };

  // Step 4: All effects (unconditional hook calls, conditional logic inside)
  // Track user interaction for autoplay policy
  useEffect(() => {
    requestBrowserNotificationPermission();

    const handleUserInteraction = () => {
      userInteractedRef.current = true;
      // Remove listeners after first interaction
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
    
    // Listen for user interaction
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    document.addEventListener('keydown', handleUserInteraction, { once: true });
    
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, []);
  
  // Initialize audio on mount - use selected preference from localStorage
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    // Get selected alert sound preference from localStorage
    const selectedSound = localStorage.getItem('delivery_alert_sound') || 'zomato_tone';
    const soundFile = selectedSound === 'original' ? originalSound : alertSound;
    
    if (!audioRef.current) {
      audioRef.current = new Audio(soundFile);
      audioRef.current.volume = 0.7;
    } else {
      // Update audio source if preference changed
      const currentSrc = audioRef.current.src;
      const newSrc = soundFile;
      if (!currentSrc.includes(newSrc.split('/').pop())) {
        audioRef.current.pause();
        audioRef.current.src = newSrc;
        audioRef.current.load();
      }
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [enabled]); // Note: This runs once on mount. To update dynamically, we'd need to listen to storage events

  // Fetch delivery partner ID
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const fetchDeliveryPartnerId = async () => {
      try {
        const response = await deliveryAPI.getCurrentDelivery();
        if (response.data?.success && response.data.data) {
          const deliveryPartner = response.data.data.user || response.data.data.deliveryPartner;
          if (deliveryPartner) {
            const id = deliveryPartner.id?.toString() || 
                      deliveryPartner._id?.toString() || 
                      deliveryPartner.deliveryId;
            if (id) {
              setDeliveryPartnerId(id);
            } else {
            }
          } else {
          }
        } else {
        }
      } catch (error) {
        console.error('Error fetching delivery partner:', error);
      }
    };
    fetchDeliveryPartnerId();
  }, []);

  // Socket connection effect
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!deliveryPartnerId) {
      return;
    }

    const backendUrl = SOCKET_BASE_URL;
    
    const socketUrl = `${backendUrl}/delivery`;
    
    console.log('🔌 Attempting to connect to Delivery Socket.IO:', socketUrl);
    console.log('🔌 API_BASE_URL:', API_BASE_URL);
    console.log('🔌 Delivery Partner ID:', deliveryPartnerId);
    console.log('🔌 Environment:', import.meta.env.MODE);
    
    // Warn if trying to connect to localhost in production
    if (import.meta.env.MODE === 'production' && backendUrl.includes('localhost')) {
      console.error('❌ CRITICAL: Trying to connect Socket.IO to localhost in production!');
      console.error('💡 This means VITE_API_BASE_URL was not set during build time');
      console.error('💡 Current socketUrl:', socketUrl);
      console.error('💡 Current API_BASE_URL:', API_BASE_URL);
      console.error('💡 Fix: Rebuild frontend with: VITE_API_BASE_URL=https://your-backend-domain.com/api npm run build');
      console.error('💡 Note: Vite environment variables are embedded at BUILD TIME, not runtime');
      console.error('💡 You must rebuild and redeploy the frontend with correct VITE_API_BASE_URL');
      
      // Don't try to connect to localhost in production - it will fail
      setIsConnected(false);
      return;
    }
    
    // Validate backend URL format
    if (!backendUrl || !backendUrl.startsWith('http')) {
      console.error('❌ CRITICAL: Invalid backend URL format:', backendUrl);
      console.error('💡 API_BASE_URL:', API_BASE_URL);
      console.error('💡 Expected format: https://your-domain.com or http://localhost:5000');
      return; // Don't try to connect with invalid URL
    }
    
    // Validate socket URL format
    try {
      new URL(socketUrl); // This will throw if URL is invalid
    } catch (urlError) {
      console.error('❌ CRITICAL: Invalid Socket.IO URL:', socketUrl);
      console.error('💡 URL validation error:', urlError.message);
      console.error('💡 Backend URL:', backendUrl);
      console.error('💡 API_BASE_URL:', API_BASE_URL);
      return; // Don't try to connect with invalid URL
    }

    socketRef.current = io(socketUrl, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      forceNew: true,
      withCredentials: true,
      autoConnect: true,
      auth: {
        token: localStorage.getItem('delivery_accessToken') || localStorage.getItem('accessToken')
      }
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      
      if (deliveryPartnerId) {
        socketRef.current.emit('join-delivery', deliveryPartnerId);
      }
    });

    socketRef.current.on('delivery-room-joined', (data) => {
    });

    socketRef.current.on('connect_error', (error) => {
      // Only log if it's not a network/polling/websocket error (backend might be down or WebSocket not available)
      // Socket.IO will automatically retry connection and fall back to polling
      const isTransportError = error.type === 'TransportError' || 
                               error.message === 'xhr poll error' ||
                               error.message?.includes('WebSocket') ||
                               error.message?.includes('websocket') ||
                               error.description === 0; // WebSocket upgrade failures
      
      if (!isTransportError) {
        console.error('❌ Delivery Socket connection error:', error);
      } else {
        // Silently handle transport errors - backend might not be running or WebSocket not available
        // Socket.IO will automatically retry with exponential backoff and fall back to polling
        // Only log in development for debugging
        if (import.meta.env.DEV) {
        }
      }
      setIsConnected(false);
    });

    socketRef.current.on('disconnect', (reason) => {
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        socketRef.current.connect();
      }
    });

    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
    });

    socketRef.current.on('reconnect', (attemptNumber) => {
      setIsConnected(true);
      
      if (deliveryPartnerId) {
        socketRef.current.emit('join-delivery', deliveryPartnerId);
      }
    });

    socketRef.current.on('new_order', (orderData) => {
      if (shouldIgnoreOrderNotification(orderData) || isOrderAlreadyInProgress(orderData)) {
        return;
      }
      setNewOrder(orderData);
      playNotificationSound();
      triggerOrderBuzz();
      if (enableBrowserNotificationRef.current && document.hidden) {
        showBrowserNotification({
          title: 'New delivery order',
          body: `Order ${orderData?.orderId || ''} is waiting for you.`.trim(),
          tag: `delivery-new-order-${orderData?.orderId || orderData?.orderMongoId || orderData?.mongoId || 'latest'}`,
        });
      }
    });

    // Listen for priority-based order notifications (new_order_available)
    socketRef.current.on('new_order_available', (orderData) => {
      if (shouldIgnoreOrderNotification(orderData) || isOrderAlreadyInProgress(orderData)) {
        return;
      }
      // Treat it the same as new_order for now - delivery boy can accept it
      setNewOrder(orderData);
      playNotificationSound();
      triggerOrderBuzz();
      if (enableBrowserNotificationRef.current && document.hidden) {
        showBrowserNotification({
          title: 'New delivery order',
          body: `Order ${orderData?.orderId || ''} is waiting for you.`.trim(),
          tag: `delivery-new-order-${orderData?.orderId || orderData?.orderMongoId || orderData?.mongoId || 'latest'}`,
        });
      }
    });

    socketRef.current.on('play_notification_sound', (data) => {
      playNotificationSound();
      triggerOrderBuzz();
    });

    socketRef.current.on('order_ready', (orderData) => {
      setOrderReady(orderData);
      playNotificationSound();
      if (enableBrowserNotificationRef.current && document.hidden) {
        showBrowserNotification({
          title: 'Order ready for pickup',
          body: `Order ${orderData?.orderId || ''} is ready.`.trim(),
          tag: `delivery-order-ready-${orderData?.orderId || orderData?.orderMongoId || orderData?.mongoId || 'latest'}`,
        });
      }
    });

    socketRef.current.on('order_unavailable', (payload) => {
      suppressOrderNotifications(payload?.orderId, payload?.orderMongoId, payload?.mongoId);
      setNewOrder((currentOrder) => {
        if (!currentOrder) return currentOrder;
        const currentOrderId = currentOrder.orderId || currentOrder.orderMongoId || currentOrder.mongoId;
        const unavailableOrderId = payload?.orderId || payload?.orderMongoId;
        if (String(currentOrderId) === String(unavailableOrderId)) {
          return null;
        }
        return currentOrder;
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [deliveryPartnerId, enabled, playNotificationSound, shouldIgnoreOrderNotification, suppressOrderNotifications, triggerOrderBuzz]);

  useEffect(() => {
    if (!enabled || !deliveryPartnerId) {
      return undefined;
    }

    let cancelled = false;

    const syncAvailableOrders = async () => {
      try {
        const response = await deliveryAPI.getOrders({ page: 1, limit: 20 });
        const orders = response?.data?.data?.orders;
        if (!Array.isArray(orders) || cancelled) {
          return;
        }

        const nextAvailableOrder = orders.find((orderData) => {
          if (!orderData) return false;
          if (!['preparing', 'ready'].includes(String(orderData.status || '').toLowerCase())) {
            return false;
          }
          if (isOrderAlreadyInProgress(orderData)) {
            return false;
          }
          return !shouldIgnoreOrderNotification(orderData);
        });

        if (!nextAvailableOrder) {
          return;
        }

        const normalizedOrder = formatPolledOrderForNotification(nextAvailableOrder);
        const incomingIds = normalizeOrderIds(normalizedOrder);
        let shouldTriggerAlert = false;

        setNewOrder((currentOrder) => {
          const currentIds = normalizeOrderIds(currentOrder);
          const isSameOrder =
            currentIds.length > 0 &&
            incomingIds.some((id) => currentIds.includes(id));

          shouldTriggerAlert = !isSameOrder;
          return isSameOrder ? currentOrder : normalizedOrder;
        });

        if (shouldTriggerAlert) {
          playNotificationSound();
          triggerOrderBuzz();
        }
      } catch (error) {
        // Socket remains primary. Polling is only a fallback, so fail silently.
      }
    };

    void syncAvailableOrders();
    const intervalId = window.setInterval(syncAvailableOrders, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deliveryPartnerId, enabled, normalizeOrderIds, playNotificationSound, shouldIgnoreOrderNotification, triggerOrderBuzz]);

  // Helper functions
  const clearNewOrder = useCallback(() => {
    setNewOrder(null);
  }, []);

  const clearOrderReady = useCallback(() => {
    setOrderReady(null);
  }, []);

  return {
    newOrder,
    clearNewOrder,
    orderReady,
    clearOrderReady,
    isConnected,
    playNotificationSound,
    suppressOrderNotifications
  };
};
