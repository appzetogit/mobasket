import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import { API_BASE_URL, SOCKET_BASE_URL } from '@/lib/api/config';
import { restaurantAPI, groceryStoreAPI } from '@/lib/api';
import alertSound from '@/assets/audio/alert.mp3';

/**
 * Hook for restaurant/grocery store to receive real-time order notifications with sound
 * @param {object} options
 * @param {boolean} options.enableSound - Whether to play incoming order ringtone
 * @returns {object} - { newOrder, playSound, isConnected }
 */
export const useRestaurantNotifications = (options = {}) => {
  const { enableSound = true, enabled = true } = options;
  const location = useLocation();
  const isGroceryStore = location.pathname.startsWith('/store');
  const socketRef = useRef(null);
  const [newOrder, setNewOrder] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const audioRef = useRef(null);
  const userInteractedRef = useRef(false); // Track user interaction for autoplay policy
  const [restaurantId, setRestaurantId] = useState(null);
  const lastConnectErrorLogRef = useRef(0);
  const enableSoundRef = useRef(enableSound);
  const lastSoundAtRef = useRef(0);
  const CONNECT_ERROR_LOG_THROTTLE_MS = 10000;

  useEffect(() => {
    enableSoundRef.current = enableSound;
  }, [enableSound]);

  useEffect(() => {
    if (!enabled && socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, [enabled]);

  // Get restaurant/store ID from API
  useEffect(() => {
    if (!enabled) {
      setRestaurantId(null);
      return;
    }

    const fetchRestaurantId = async () => {
      try {
        const response = isGroceryStore 
          ? await groceryStoreAPI.getCurrentStore()
          : await restaurantAPI.getCurrentRestaurant();
        if (response.data?.success) {
          const restaurant =
            response?.data?.data?.restaurant ||
            response?.data?.data?.store ||
            response?.data?.restaurant ||
            response?.data?.store;
          if (restaurant) {
            const id = restaurant._id?.toString() || restaurant.restaurantId;
            setRestaurantId(id);
          }
        }
      } catch (error) {
        console.error(`Error fetching ${isGroceryStore ? 'store' : 'restaurant'} data:`, error);
      }
    };
    fetchRestaurantId();
  }, [enabled, isGroceryStore]);

  useEffect(() => {
    if (!enabled) return;

    if (!restaurantId) {
      return;
    }

    const backendUrl = SOCKET_BASE_URL;
    
    // CRITICAL: Check for localhost in production BEFORE creating socket
    // Detect production environment more reliably
    const frontendHostname = window.location.hostname;
    const isLocalhost = frontendHostname === 'localhost' || 
                        frontendHostname === '127.0.0.1' ||
                        frontendHostname === '';
    const isProductionBuild = import.meta.env.MODE === 'production' || import.meta.env.PROD;
    // Production deployment: not localhost AND (HTTPS OR has domain name with dots)
    const isProductionDeployment = !isLocalhost && (
      window.location.protocol === 'https:' || 
      (frontendHostname.includes('.') && !frontendHostname.startsWith('192.168.') && !frontendHostname.startsWith('10.'))
    );
    
    // If backend URL is localhost but we're not running locally, BLOCK connection
    const backendIsLocalhost = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
    // Block if: backend is localhost AND (production build OR production deployment)
    // Allow if: frontend is also localhost (development scenario)
    const shouldBlockConnection = backendIsLocalhost && (isProductionBuild || isProductionDeployment) && !isLocalhost;
    
    if (shouldBlockConnection) {
      // Try to infer backend URL from frontend URL (common pattern: api.domain.com or domain.com/api)
      const frontendHost = window.location.hostname;
      const frontendProtocol = window.location.protocol;
      let suggestedBackendUrl = null;
      
      // Common patterns:
      // - If frontend is on foods.mobasket.com, backend might be api.foods.mobasket.com or foods.mobasket.com
      if (frontendHost.includes('foods.mobasket.com')) {
        suggestedBackendUrl = `${frontendProtocol}//api.foods.mobasket.com/api`;
      } else if (frontendHost.includes('mobasket.com')) {
        suggestedBackendUrl = `${frontendProtocol}//api.${frontendHost}/api`;
      }
      
      console.error('❌ CRITICAL: BLOCKING Socket.IO connection to localhost!');
      console.error('💡 This means VITE_API_BASE_URL was not set during build time');
      console.error('💡 Current backendUrl:', backendUrl);
      console.error('💡 Current API_BASE_URL:', API_BASE_URL);
      console.error('💡 VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL || 'NOT SET');
      console.error('💡 Environment mode:', import.meta.env.MODE);
      console.error('💡 Frontend hostname:', frontendHost);
      console.error('💡 Frontend protocol:', frontendProtocol);
      console.error('💡 Is production build:', isProductionBuild);
      console.error('💡 Is production deployment:', isProductionDeployment);
      console.error('💡 Backend is localhost:', backendIsLocalhost);
      if (suggestedBackendUrl) {
        console.error('💡 Suggested backend URL:', suggestedBackendUrl);
        console.error('💡 Fix: Rebuild frontend with: VITE_API_BASE_URL=' + suggestedBackendUrl + ' npm run build');
      } else {
        console.error('💡 Fix: Rebuild frontend with: VITE_API_BASE_URL=https://your-backend-domain.com/api npm run build');
      }
      console.error('💡 Note: Vite environment variables are embedded at BUILD TIME, not runtime');
      console.error('💡 You must rebuild and redeploy the frontend with correct VITE_API_BASE_URL');
      
      // Clean up any existing socket connection
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      // Don't try to connect to localhost in production - it will fail
      setIsConnected(false);
      return; // CRITICAL: Exit early to prevent socket creation
    }
    
    // Validate backend URL format
    if (!backendUrl || !backendUrl.startsWith('http')) {
      console.error('❌ CRITICAL: Invalid backend URL format:', backendUrl);
      console.error('💡 API_BASE_URL:', API_BASE_URL);
      console.error('💡 Expected format: https://your-domain.com or http://localhost:5000');
      setIsConnected(false);
      return; // Don't try to connect with invalid URL
    }
    
    // Construct Socket.IO URL - use appropriate namespace
    const socketUrl = `${backendUrl}/${isGroceryStore ? 'grocery-store' : 'restaurant'}`;
    
    // Validate socket URL format
    try {
      const urlTest = new URL(socketUrl); // This will throw if URL is invalid
      // Additional validation: ensure it's not localhost in production
      if ((isProductionBuild || isProductionDeployment) && (urlTest.hostname === 'localhost' || urlTest.hostname === '127.0.0.1')) {
        console.error('❌ CRITICAL: Socket URL contains localhost in production!');
        console.error('💡 Socket URL:', socketUrl);
        console.error('💡 This should have been caught earlier, but blocking anyway');
        setIsConnected(false);
        return;
      }
    } catch (urlError) {
      console.error('❌ CRITICAL: Invalid Socket.IO URL:', socketUrl);
      console.error('💡 URL validation error:', urlError.message);
      console.error('💡 Backend URL:', backendUrl);
      console.error('💡 API_BASE_URL:', API_BASE_URL);
      setIsConnected(false);
      return; // Don't try to connect with invalid URL
    }
    
    // Initialize socket connection to restaurant namespace
    // Use polling only to avoid repeated "WebSocket connection failed" when backend is down
    socketRef.current = io(socketUrl, {
      path: '/socket.io/',
      transports: ['polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      forceNew: false,
      autoConnect: true,
      auth: {
        token: isGroceryStore 
          ? localStorage.getItem('grocery-store_accessToken') || localStorage.getItem('accessToken')
          : localStorage.getItem('restaurant_accessToken') || localStorage.getItem('accessToken')
      }
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      
      // Join restaurant/store room immediately after connection with retry
      if (restaurantId) {
        const joinRoom = () => {
          const roomEvent = isGroceryStore ? 'join-grocery-store' : 'join-restaurant';
          socketRef.current.emit(roomEvent, restaurantId);
          
          // Retry join after 2 seconds if no confirmation received
          setTimeout(() => {
            if (socketRef.current?.connected) {
              socketRef.current.emit(roomEvent, restaurantId);
            }
          }, 2000);
        };
        
        joinRoom();
      } else {
        console.warn(`⚠️ Cannot join ${isGroceryStore ? 'grocery store' : 'restaurant'} room: restaurantId is missing`);
      }
    });

    // Listen for room join confirmation
    const roomJoinedEvent = isGroceryStore ? 'grocery-store-room-joined' : 'restaurant-room-joined';
    socketRef.current.on(roomJoinedEvent, () => {});

    // Listen for connection errors (throttle logs to avoid console spam on reconnect loops)
    socketRef.current.on('connect_error', (error) => {
      const now = Date.now();
      const shouldLog = now - lastConnectErrorLogRef.current >= CONNECT_ERROR_LOG_THROTTLE_MS;
      if (shouldLog) {
        lastConnectErrorLogRef.current = now;
        const isTransportError = error.type === 'TransportError' || error.message?.includes('xhr poll error');
        console.warn(
          'Restaurant Socket:',
          isTransportError
            ? `Cannot reach backend at ${backendUrl}. Ensure the backend is running (e.g. npm run dev in backend).`
            : error.message
        );
        if (!isTransportError) {
          console.warn('Details:', { type: error.type, socketUrl, backendUrl });
        }
      }
      if (error.message?.includes('CORS') || error.message?.includes('Not allowed')) {
        console.warn('💡 Add frontend URL to CORS_ORIGIN in backend .env');
      }
      setIsConnected(false);
    });

    // Listen for disconnection
    socketRef.current.on('disconnect', (reason) => {
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        // Server disconnected the socket, reconnect manually
        socketRef.current.connect();
      }
    });

    // Listen for reconnection attempts
    socketRef.current.on('reconnect_attempt', () => {});

    // Listen for successful reconnection
    socketRef.current.on('reconnect', () => {
      setIsConnected(true);
      
      // Rejoin restaurant/store room after reconnection
      if (restaurantId) {
        const roomEvent = isGroceryStore ? 'join-grocery-store' : 'join-restaurant';
        socketRef.current.emit(roomEvent, restaurantId);
      }
    });

    // Listen for new order notifications
    socketRef.current.on('new_order', (orderData) => {
      setNewOrder(orderData);
      
      // Play notification sound
      if (enableSoundRef.current) {
        playNotificationSound();
      }
    });

    // Listen for sound notification event
    socketRef.current.on('play_notification_sound', () => {
      if (enableSoundRef.current) {
        playNotificationSound();
      }
    });

    // Listen for order status updates
    socketRef.current.on('order_status_update', () => {
      // You can handle status updates here if needed
    });

    // Load notification sound
    audioRef.current = new Audio(alertSound);
    audioRef.current.volume = 0.7;

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [enabled, restaurantId, isGroceryStore]);

  // Track user interaction for autoplay policy
  useEffect(() => {
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

  const playNotificationSound = () => {
    try {
      if (audioRef.current) {
        const now = Date.now();
        if (now - lastSoundAtRef.current < 900) return;
        lastSoundAtRef.current = now;

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
  };

  const clearNewOrder = () => {
    setNewOrder(null);
  };

  return {
    newOrder,
    clearNewOrder,
    isConnected,
    playNotificationSound
  };
};


