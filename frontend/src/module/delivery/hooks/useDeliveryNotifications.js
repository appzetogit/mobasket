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
const DELIVERY_ONLINE_STATUS_KEY = 'app:isOnline';
const ORDER_POLL_INTERVAL_MS = 8000;
const ORDER_POLL_FORBIDDEN_BACKOFF_MS = 120000;
const DELIVERY_AUDIO_CACHE_VERSION = `delivery-audio-${Date.now()}`;

const withAudioCacheVersion = (url) => {
  if (!url) return url;
  // In dev, bypass flaky cached mp3 entries (ERR_CACHE_READ_FAILURE + 304).
  if (import.meta.env.DEV) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${DELIVERY_AUDIO_CACHE_VERSION}`;
  }
  return url;
};

const appendQueryParam = (url, key, value) => {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${key}=${value}`;
};

const PENDING_DELIVERY_STATUSES = new Set([
  'pending',
  'rejected',
  'declined',
  'blocked',
  'submitted',
  'verification_pending',
  'under_verification',
  'in_review',
  'under_review',
  'onboarding',
  'suspended',
  'inactive',
]);

const isDeliveryPartnerEligibleForOrders = (deliveryPartner = {}) => {
  const statusCandidates = [
    deliveryPartner?.status,
    deliveryPartner?.verificationStatus,
    deliveryPartner?.approvalStatus,
    deliveryPartner?.kycStatus,
    deliveryPartner?.accountStatus,
    deliveryPartner?.documentVerificationStatus,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  if (statusCandidates.some((status) => PENDING_DELIVERY_STATUSES.has(status))) {
    return false;
  }

  const explicitFalseFlags = [
    deliveryPartner?.isVerified,
    deliveryPartner?.isApproved,
    deliveryPartner?.isKycVerified,
    deliveryPartner?.isDocumentVerified,
  ];
  if (explicitFalseFlags.some((flag) => flag === false)) {
    return false;
  }

  if (deliveryPartner?.isActive === false) {
    return false;
  }

  if (deliveryPartner?.isActive === true) {
    return true;
  }

  // Fallback for payloads that don't include isActive.
  if (statusCandidates.length === 0) return true;
  return statusCandidates.some((status) => status === 'active' || status === 'approved');
};

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
    deliveryPartnerId:
      orderData?.deliveryPartnerId?._id?.toString?.() ||
      orderData?.deliveryPartnerId?.toString?.() ||
      orderData?.assignmentInfo?.deliveryPartnerId ||
      null,
    assignmentInfo: orderData?.assignmentInfo || null,
    deliveryState: orderData?.deliveryState || null,
    phase: orderData?.phase || '',
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
  const ordersPollBlockedUntilRef = useRef(0);
  const userInteractedRef = useRef(
    typeof document !== 'undefined' && Boolean(document.userActivation?.hasBeenActive)
  );
  
  // Step 2: All state hooks (unconditional)
  const [newOrder, setNewOrder] = useState(null);
  const [newOrderQueue, setNewOrderQueue] = useState([]);
  const [orderReady, setOrderReady] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [deliveryPartnerId, setDeliveryPartnerId] = useState(null);
  const [isEligibleForOrders, setIsEligibleForOrders] = useState(true);
  const enableSoundRef = useRef(enableSound);
  const enableBrowserNotificationRef = useRef(enableBrowserNotification);
  const audioErrorRetriesRef = useRef(0);

  const getSelectedSoundUrl = useCallback(() => {
    const selectedSound = localStorage.getItem('delivery_alert_sound') || 'zomato_tone';
    const baseFile = selectedSound === 'original' ? originalSound : alertSound;
    return withAudioCacheVersion(baseFile);
  }, []);

  const attachAudioErrorRecovery = useCallback((audioEl) => {
    if (!audioEl || audioEl.__deliveryRecoveryAttached) return;
    audioEl.__deliveryRecoveryAttached = true;
    audioEl.addEventListener('error', () => {
      if (audioErrorRetriesRef.current >= 2) return;
      audioErrorRetriesRef.current += 1;
      const freshUrl = appendQueryParam(
        getSelectedSoundUrl(),
        'retry',
        audioErrorRetriesRef.current
      );
      try {
        audioEl.src = freshUrl;
        audioEl.load();
      } catch {
        // Ignore hard audio failures.
      }
    });
  }, [getSelectedSoundUrl]);

  useEffect(() => {
    enableSoundRef.current = enableSound;
  }, [enableSound]);

  useEffect(() => {
    enableBrowserNotificationRef.current = enableBrowserNotification;
  }, [enableBrowserNotification]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const markUserInteraction = () => {
      userInteractedRef.current = true;
    };

    document.addEventListener('pointerdown', markUserInteraction, { once: true });
    document.addEventListener('touchstart', markUserInteraction, { once: true });
    document.addEventListener('keydown', markUserInteraction, { once: true });

    return () => {
      document.removeEventListener('pointerdown', markUserInteraction);
      document.removeEventListener('touchstart', markUserInteraction);
      document.removeEventListener('keydown', markUserInteraction);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      setDeliveryPartnerId(null);
      setNewOrder(null);
      setNewOrderQueue([]);
      setOrderReady(null);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    }
  }, [enabled]);

  // Step 3: All callbacks before effects (unconditional)
  const playNotificationSound = useCallback(() => {
    try {
      const soundFile = getSelectedSoundUrl();
      
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
        attachAudioErrorRecovery(audioRef.current);
      }
      
      if (audioRef.current) {
        if (!enableSoundRef.current) {
          return;
        }
        if (!userInteractedRef.current && !document?.userActivation?.hasBeenActive) {
          return;
        }

        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(error => {
          const message = String(error?.message || '');
          // Recover from broken cached media entries in dev.
          if (message.includes('ERR_CACHE_READ_FAILURE')) {
            try {
              const retryUrl = appendQueryParam(getSelectedSoundUrl(), 'play_retry', Date.now());
              audioRef.current.src = retryUrl;
              audioRef.current.load();
              audioRef.current.play().catch(() => {});
            } catch {
              // Ignore fallback failures.
            }
            return;
          }
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
  }, [attachAudioErrorRecovery, getSelectedSoundUrl]);

  const triggerOrderBuzz = useCallback(() => {
    try {
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
        return;
      }
      if (!userInteractedRef.current && !document?.userActivation?.hasBeenActive) {
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

  const isSameOrderPayload = useCallback((leftOrder = {}, rightOrder = {}) => {
    const leftIds = normalizeOrderIds(leftOrder);
    const rightIds = normalizeOrderIds(rightOrder);
    if (leftIds.length === 0 || rightIds.length === 0) return false;
    return leftIds.some((id) => rightIds.includes(id));
  }, [normalizeOrderIds]);

  const enqueueNewOrderNotification = useCallback((orderData = {}) => {
    setNewOrderQueue((currentQueue) => {
      const nextIds = normalizeOrderIds(orderData);
      if (nextIds.length === 0) return currentQueue;

      const existingIndex = currentQueue.findIndex((queuedOrder) => isSameOrderPayload(queuedOrder, orderData));
      if (existingIndex >= 0) {
        return currentQueue.map((queuedOrder, index) =>
          index === existingIndex ? { ...queuedOrder, ...orderData } : queuedOrder
        );
      }

      return [...currentQueue, orderData];
    });
  }, [isSameOrderPayload, normalizeOrderIds]);

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

    setNewOrderQueue((currentQueue) =>
      currentQueue.filter((queuedOrder) => {
        const queuedIds = normalizeOrderIds(queuedOrder);
        return !queuedIds.some((id) => suppressedOrderIdsRef.current.has(id));
      })
    );
    setOrderReady((currentOrder) => {
      if (!currentOrder) return currentOrder;
      const currentIds = normalizeOrderIds(currentOrder);
      return currentIds.some((id) => suppressedOrderIdsRef.current.has(id)) ? null : currentOrder;
    });
  }, [normalizeOrderIds]);

  const shouldIgnoreOrderNotification = useCallback((orderData = {}) => {
    const ids = normalizeOrderIds(orderData);
    return ids.some((id) => suppressedOrderIdsRef.current.has(id));
  }, [normalizeOrderIds]);

  const shouldReceiveAssignedOrderAlert = useCallback((orderData = {}) => {
    const currentDeliveryId = String(deliveryPartnerId || '').trim();
    if (!currentDeliveryId) return false;

    const socketPhase = String(orderData?.phase || '').toLowerCase();
    const notificationPhase = String(
      orderData?.assignmentInfo?.notificationPhase || socketPhase
    ).toLowerCase();

    if (
      notificationPhase === 'manual_only' ||
      ['priority', 'expanded', 'immediate'].includes(notificationPhase)
    ) {
      return false;
    }

    const targetedDeliveryId = String(
      orderData?.deliveryPartnerId ||
      orderData?.assignmentInfo?.deliveryPartnerId ||
      orderData?.fullOrder?.deliveryPartnerId?._id ||
      orderData?.fullOrder?.deliveryPartnerId ||
      ''
    ).trim();

    if (!targetedDeliveryId) {
      return false;
    }

    return targetedDeliveryId === currentDeliveryId;
  }, [deliveryPartnerId]);

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

  const isRiderOnlineForOrders = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem(DELIVERY_ONLINE_STATUS_KEY) || 'false') === true;
    } catch {
      return false;
    }
  }, []);

  const canReceiveOrderAlerts = useCallback(() => {
    return enabled && isEligibleForOrders && isRiderOnlineForOrders();
  }, [enabled, isEligibleForOrders, isRiderOnlineForOrders]);

  useEffect(() => {
    setNewOrder((currentOrder) => {
      const queuedHead = newOrderQueue[0] || null;
      if (!queuedHead) return null;
      if (currentOrder && isSameOrderPayload(currentOrder, queuedHead)) {
        return { ...currentOrder, ...queuedHead };
      }
      return queuedHead;
    });
  }, [isSameOrderPayload, newOrderQueue]);

  // Step 4: All effects (unconditional hook calls, conditional logic inside)
  useEffect(() => {
    requestBrowserNotificationPermission();
    return undefined;
  }, []);
  
  // Initialize audio on mount - use selected preference from localStorage
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const soundFile = getSelectedSoundUrl();
    
    if (!audioRef.current) {
      audioRef.current = new Audio(soundFile);
      audioRef.current.volume = 0.7;
      attachAudioErrorRecovery(audioRef.current);
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
      audioErrorRetriesRef.current = 0;
    };
  }, [attachAudioErrorRecovery, enabled, getSelectedSoundUrl]); // Note: This runs once on mount. To update dynamically, we'd need to listen to storage events

  // Fetch delivery partner ID
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const accessToken =
      localStorage.getItem('delivery_accessToken') ||
      localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('delivery_refreshToken');

    if (!accessToken && !refreshToken) {
      setDeliveryPartnerId(null);
      setIsEligibleForOrders(false);
      return;
    }

    const fetchDeliveryPartnerId = async () => {
      try {
        const response = await deliveryAPI.getCurrentDelivery();
        if (response.data?.success && response.data.data) {
          const deliveryPartner = response.data.data.user || response.data.data.deliveryPartner;
          if (deliveryPartner) {
            const eligible = isDeliveryPartnerEligibleForOrders(deliveryPartner);
            setIsEligibleForOrders(eligible);

            if (!eligible) {
              // Hard-stop order intake for under-verification/blocked riders.
              setDeliveryPartnerId(null);
              setNewOrder(null);
              setOrderReady(null);
              return;
            }

            const id = deliveryPartner.id?.toString() || 
                      deliveryPartner._id?.toString() || 
                      deliveryPartner.deliveryId;
            if (id) {
              setDeliveryPartnerId(id);
            } else {
              setDeliveryPartnerId(null);
            }
          } else {
            setIsEligibleForOrders(false);
            setDeliveryPartnerId(null);
          }
        } else {
          setIsEligibleForOrders(false);
          setDeliveryPartnerId(null);
        }
      } catch (error) {
        const status = Number(error?.response?.status || 0);
        if (status !== 401) {
          console.error('Error fetching delivery partner:', error);
        }
        if (status === 401) {
          setDeliveryPartnerId(null);
          setIsEligibleForOrders(false);
        }
      }
    };
    fetchDeliveryPartnerId();
  }, [enabled]);

  // Socket connection effect
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!isEligibleForOrders) {
      setIsConnected(false);
      setNewOrder(null);
      setOrderReady(null);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
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
      if (!canReceiveOrderAlerts()) {
        return;
      }
      if (
        !shouldReceiveAssignedOrderAlert(orderData) ||
        shouldIgnoreOrderNotification(orderData) ||
        isOrderAlreadyInProgress(orderData)
      ) {
        return;
      }
      enqueueNewOrderNotification(orderData);
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
      return;
    });

    socketRef.current.on('play_notification_sound', (data) => {
      if (!canReceiveOrderAlerts()) {
        return;
      }
      if (String(data?.type || '').toLowerCase() === 'new_order') {
        return;
      }
      playNotificationSound();
      triggerOrderBuzz();
    });

    socketRef.current.on('order_ready', (orderData) => {
      if (!canReceiveOrderAlerts()) {
        return;
      }
      if (shouldIgnoreOrderNotification(orderData)) {
        return;
      }
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
      setOrderReady((currentOrder) => {
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
  }, [canReceiveOrderAlerts, deliveryPartnerId, enabled, enqueueNewOrderNotification, isEligibleForOrders, normalizeOrderIds, playNotificationSound, shouldIgnoreOrderNotification, shouldReceiveAssignedOrderAlert, suppressOrderNotifications, triggerOrderBuzz]);

  useEffect(() => {
    // Keep polling even when the socket is connected so the rider still gets
    // the slider popup if a targeted socket event is missed after a
    // store/restaurant accepts the order.
    if (!enabled || !deliveryPartnerId || !isEligibleForOrders) {
      return undefined;
    }

    let cancelled = false;

    const syncAvailableOrders = async () => {
      if (!isRiderOnlineForOrders()) {
        return;
      }

      if (Date.now() < ordersPollBlockedUntilRef.current) {
        return;
      }

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
          if (!shouldReceiveAssignedOrderAlert(orderData)) {
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

        const isAlreadyQueued = newOrderQueue.some((queuedOrder) => {
          const queuedIds = normalizeOrderIds(queuedOrder);
          return queuedIds.length > 0 && incomingIds.some((id) => queuedIds.includes(id));
        });

        shouldTriggerAlert = !isAlreadyQueued;
        enqueueNewOrderNotification(normalizedOrder);

        if (shouldTriggerAlert) {
          playNotificationSound();
          triggerOrderBuzz();
        }
      } catch (error) {
        const status = Number(error?.response?.status || 0);
        // For auth/permission errors (e.g. pending verification), avoid hammering
        // the orders endpoint every 8s.
        if (status === 401 || status === 403) {
          ordersPollBlockedUntilRef.current = Date.now() + ORDER_POLL_FORBIDDEN_BACKOFF_MS;
        }
      }
    };

    void syncAvailableOrders();
    const intervalId = window.setInterval(syncAvailableOrders, ORDER_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [deliveryPartnerId, enabled, enqueueNewOrderNotification, isEligibleForOrders, isRiderOnlineForOrders, newOrderQueue, normalizeOrderIds, playNotificationSound, shouldIgnoreOrderNotification, shouldReceiveAssignedOrderAlert, triggerOrderBuzz]);

  // Helper functions
  const clearNewOrder = useCallback(() => {
    setNewOrderQueue((currentQueue) => currentQueue.slice(1));
  }, []);

  const removeQueuedOrderNotification = useCallback((targetOrder) => {
    const targetIds =
      typeof targetOrder === 'object' && targetOrder !== null
        ? normalizeOrderIds(targetOrder)
        : [targetOrder == null ? null : String(targetOrder)].filter(Boolean);

    if (targetIds.length === 0) return;

    setNewOrderQueue((currentQueue) =>
      currentQueue.filter((queuedOrder) => {
        const queuedIds = normalizeOrderIds(queuedOrder);
        return !queuedIds.some((id) => targetIds.includes(id));
      })
    );

    setOrderReady((currentOrder) => {
      if (!currentOrder) return currentOrder;
      const currentIds = normalizeOrderIds(currentOrder);
      return currentIds.some((id) => targetIds.includes(id)) ? null : currentOrder;
    });
  }, [normalizeOrderIds]);

  const prioritizeNewOrderNotification = useCallback((targetOrder) => {
    const targetIds =
      typeof targetOrder === 'object' && targetOrder !== null
        ? normalizeOrderIds(targetOrder)
        : [targetOrder == null ? null : String(targetOrder)].filter(Boolean);

    if (targetIds.length === 0) return;

    setNewOrderQueue((currentQueue) => {
      const targetIndex = currentQueue.findIndex((queuedOrder) => {
        const queuedIds = normalizeOrderIds(queuedOrder);
        return queuedIds.some((id) => targetIds.includes(id));
      });

      if (targetIndex <= 0) return currentQueue;

      const nextQueue = currentQueue.slice();
      const [targetItem] = nextQueue.splice(targetIndex, 1);
      nextQueue.unshift(targetItem);
      return nextQueue;
    });
  }, [normalizeOrderIds]);

  const clearOrderReady = useCallback(() => {
    setOrderReady(null);
  }, []);

  return {
    newOrder,
    pendingNewOrders: newOrderQueue,
    pendingNewOrdersCount: newOrderQueue.length,
    prioritizeNewOrderNotification,
    clearNewOrder,
    removeQueuedOrderNotification,
    orderReady,
    clearOrderReady,
    isConnected,
    playNotificationSound,
    suppressOrderNotifications
  };
};
