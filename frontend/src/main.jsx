import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import { getGoogleMapsApiKey } from './lib/utils/googleMapsApiKey.js'
import { loadBusinessSettings } from './lib/utils/businessSettings.js'
import { API_BASE_URL } from './lib/api/config.js'

// Load business settings on app start (favicon, title)
// Silently handle errors - this is not critical for app functionality
loadBusinessSettings().catch(() => {
  // Silently fail - settings will load when admin is authenticated
})

// Global flag to track Google Maps loading state
window.__googleMapsLoading = window.__googleMapsLoading || false;
window.__googleMapsLoaded = window.__googleMapsLoaded || false;

// Load Google Maps API dynamically from backend database
// Only load if not already loaded to prevent multiple loads
(async () => {
  // Check if Google Maps is already loaded
  if (window.google && window.google.maps) {
    window.__googleMapsLoaded = true;
    return;
  }
  
  // Check if script is already being loaded
  const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
  if (existingScript) {
    window.__googleMapsLoading = true;
    
    // Wait for script to load
    existingScript.addEventListener('load', () => {
      window.__googleMapsLoaded = true;
      window.__googleMapsLoading = false;
    });
    return;
  }
  
  // Check if Loader is already loading
  if (window.__googleMapsLoading) {
    return;
  }
  
  window.__googleMapsLoading = true;
  
  try {
    const googleMapsApiKey = await getGoogleMapsApiKey()
    if (googleMapsApiKey) {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places,geometry,drawing&loading=async`
      script.async = true
      script.defer = true
      script.onload = () => {
        window.__googleMapsLoaded = true;
        window.__googleMapsLoading = false;
      }
      script.onerror = () => {
        window.__googleMapsLoading = false;
      }
      document.head.appendChild(script)
    } else {
      window.__googleMapsLoading = false;
    }
  } catch (error) {
    window.__googleMapsLoading = false;
    // No fallback - Google Maps will not load if key is not in database
  }
})()

// Apply theme on app initialization
const savedTheme = localStorage.getItem('appTheme') || 'light'
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark')
} else {
  document.documentElement.classList.remove('dark')
}

const originalLog = console.log
console.log = (...args) => {
  const logStr = args.join(' ')

  if (
    logStr.includes('Starting wallet fetch') ||
    logStr.includes('Fetching active earning addons from:') ||
    logStr.includes('[LOC] Restored recent cached location:') ||
    logStr.includes('[LOC] Fetching current location on app open...') ||
    logStr.includes('[LOC] Starting live location tracking (offline/online)') ||
    logStr.includes('[SYNC] Online status effect triggered:') ||
    logStr.includes('[LOOKUP] Reached Pickup popup useEffect triggered:') ||
    logStr.includes('[NEXT] Skipping fetch - popup not shown') ||
    logStr.includes('Attempting to connect to Delivery Socket.IO:') ||
    logStr.includes('API_BASE_URL:') ||
    logStr.includes('Delivery Partner ID:') ||
    logStr.includes('Environment:') ||
    logStr.includes('[LOC] Google Maps API check:') ||
    logStr.includes('Fetching assigned orders from API...') ||
    logStr.includes('Accepting first location (will be used for admin map):') ||
    logStr.includes('[LOC] Map recentered to GPS location') ||
    logStr.includes('[LOC] Current location obtained on app open (filtered):') ||
    logStr.includes('[LOC] Creating bike marker with smoothed location:') ||
    logStr.includes('[LOC] Live location updated (smoothed):') ||
    logStr.includes('[UPLOAD] Sending smoothed location to backend:') ||
    logStr.includes('Bike marker created with first location') ||
    logStr.includes('[OK] Bike marker created:') ||
    logStr.includes('[LOC] Updating bike marker position:') ||
    logStr.includes('Active earning addons response:') ||
    logStr.includes('Active offers found:') ||
    logStr.includes('Selected active offer:') ||
    logStr.includes('Full API Response:') ||
    logStr.includes('Response Status:') ||
    logStr.includes('Response Data:') ||
    logStr.includes('Response Data Type:') ||
    logStr.includes('Found wallet in:') ||
    logStr.includes('Wallet Data from API:') ||
    logStr.includes('Total Balance:') ||
    logStr.includes('Cash In Hand:') ||
    logStr.includes('Total Earned:') ||
    logStr.includes('Transactions Count:') ||
    logStr.includes('Transactions:') ||
    logStr.includes('Transformed Wallet Data:') ||
    logStr.includes('Found 0 assigned order(s)') ||
    logStr.includes('No pending orders found') ||
    logStr.includes('[OK] Smoothed location sent to backend successfully:') ||
    logStr.includes('[ORDER] New order received from Socket.IO:') ||
    logStr.includes('[MONEY] Earnings from notification:') ||
    logStr.includes('[MONEY] Display earnings calculation:') ||
    logStr.includes('[LOC] Rider location available, initializing map...') ||
    logStr.includes('[LOC] Initializing map with rider location:') ||
    logStr.includes('[OK] Map initialized with rider location') ||
    logStr.includes('[NewOrder] [AUDIO] Attempting to play audio...') ||
    logStr.includes('[AUDIO] Audio playback skipped - user has not interacted with page yet') ||
    logStr.includes('[NewOrder] [WARN] playAlertSound returned null') ||
    logStr.includes('[NewOrder] Audio stopped') ||
    // --- Order accept / reached-pickup flow ---
    logStr.includes('[LOOKUP] Order ID lookup:') ||
    logStr.includes('[LOOKUP] Order ID lookup for reached pickup:') ||
    logStr.includes('[LOOKUP] Order structure for address extraction:') ||
    logStr.includes('[ORDER] Accepting order:') ||
    logStr.includes('[ORDER] Confirming reached pickup for order:') ||
    logStr.includes('[ORDER] API endpoint:') ||
    logStr.includes('[ORDER] Reached pickup API response:') ||
    logStr.includes('[LOC] Current LIVE location:') ||
    logStr.includes('[LOC] Route data:') ||
    logStr.includes('[LOC] Route details:') ||
    logStr.includes('[DETAILS] Order details:') ||
    logStr.includes('[DETAILS] Full order data from backend:') ||
    logStr.includes('[NEXT] Skipping fetch - address already exists') ||
    logStr.includes('[API] API Response:') ||
    logStr.includes('[OK] Order accepted successfully') ||
    logStr.includes('[OK] Fetched restaurant data:') ||
    logStr.includes('[OK] Fetched restaurant.location.formattedAddress:') ||
    logStr.includes('[OK] Using restaurantName from order:') ||
    logStr.includes('[OK] Added order to accepted list:') ||
    logStr.includes('[OK] Order is in pickup phase, showing Reached Pickup popup immediately') ||
    logStr.includes('[OK] Reached pickup confirmed and status saved in database') ||
    logStr.includes('[OK] Showing Order ID confirmation popup') ||
    logStr.includes('[STORE] Restaurant name from backend:') ||
    logStr.includes('[STORE] Final extracted restaurant name:') ||
    logStr.includes('[STORE] Updated restaurant info from backend:') ||
    logStr.includes('[SYNC] Fetching restaurant address by ID:') ||
    logStr.includes('[MAP] Calculating route with Google Maps Directions API') ||
    logStr.includes('[MAP] Calculating route to customer using Directions API') ||
    logStr.includes('[MONEY] Earnings from backend:') ||
    logStr.includes('[Reached Drop] Order not in delivery phase:') ||
    // --- Bill upload / order-confirm / delivery completion flow ---
    logStr.includes('[CAM] Flutter handler not available') ||
    logStr.includes('[CAM] Uploading bill image to Cloudinary') ||
    logStr.includes('[OK] Bill image uploaded to Cloudinary') ||
    logStr.includes('[ORDER] Confirming order ID:') ||
    logStr.includes('[OK] Order ID confirmed, response:') ||
    logStr.includes('[LOC] From (Delivery Boy Live Location):') ||
    logStr.includes('[LOC] To (Customer):') ||
    logStr.includes('[OK] Route to customer calculated with Directions API') ||
    logStr.includes('[STATS] Total trip calculated:') ||
    logStr.includes('[OK] Live tracking polyline initialized for customer delivery route') ||
    logStr.includes('[OK] Showing Reached Drop popup instantly') ||
    logStr.includes('[LOC] Distance to customer:') ||
    logStr.includes('[OK] Reached Drop popup state set to true') ||
    logStr.includes('[OK] Showing Order Delivered popup instantly') ||
    logStr.includes('[LOOKUP] Order ID lookup for reached drop:') ||
    logStr.includes('[ORDER] Confirming reached drop for order:') ||
    logStr.includes('[OK] Reached drop confirmed') ||
    logStr.includes('[REVIEW] Submitting review and completing delivery:') ||
    logStr.includes('[OK] Delivery completed and earnings added to wallet:') ||
    logStr.includes('[OK] Wallet transaction:') ||
    // --- Wallet / balance calculation logs ---
    logStr.includes('calculateDeliveryBalances called with state:') ||
    logStr.includes('📊 Balance values:') ||
    logStr.includes('📊 Calculated balances:') ||
    logStr.includes('💰 Wallet State:') ||
    logStr.includes('💰 Calculated Balances:') ||
    logStr.includes('💰 Pocket Balance (same as Total Balance):') ||
    logStr.includes('💰 Total Balance (includes bonus):') ||
    logStr.includes('💰 FINAL Pocket Balance Display:') ||
    logStr.includes('💰 Wallet data fetched:') ||
    logStr.includes('💰 Total Balance from API:') ||
    logStr.includes('💰 Pocket Balance from API:') ||
    logStr.includes('💰 Total Bonus Amount:') ||
    logStr.includes('🔄 Fetching active earning addons...') ||
    // --- Profile image logs ---
    logStr.includes('Profile image data:') ||
    // --- Map / Live location update logs ---
    logStr.includes('Map is ready, requesting user location...') ||
    logStr.includes('🔵 Creating/updating blue dot:') ||
    logStr.includes('✅✅✅ Blue dot and accuracy circle created successfully:') ||
    logStr.includes('📍 Live location update:')
  ) {
    return
  }

  originalLog.apply(console, args)
}

const originalWarn = console.warn
console.warn = (...args) => {
  const warningStr = args.join(' ')

  if (
    warningStr.includes('Google Maps already loaded outside @googlemaps/js-api-loader') ||
    warningStr.includes('google.maps.places.AutocompleteService is not available to new customers') ||
    warningStr.includes('google.maps.places.PlacesService is not available to new customers') ||
    warningStr.includes('google.maps.Marker is deprecated') ||
    warningStr.includes('google.maps.DirectionsService is deprecated') ||
    warningStr.includes('google.maps.DirectionsRenderer is deprecated') ||
    warningStr.includes('Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.') ||
    warningStr.includes('[WARN] Bike marker not on correct map, re-adding...') ||
    // --- Order accept flow warnings ---
    warningStr.includes('[WARN] Restaurant address not found in order')
  ) {
    return
  }

  originalWarn.apply(console, args)
}

// Suppress browser extension errors
const originalError = console.error
console.error = (...args) => {
  const errorStr = args.join(' ')
  
  // Suppress browser extension errors
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('chrome-extension://') ||
     (args[0].includes('content.js') && args[0].includes('useCache')) ||
     args[0].includes('_$initialUrl') ||
     args[0].includes('_$onReInit') ||
     args[0].includes('_$bindListeners'))
  ) {
    return // Suppress browser extension errors
  }
  
  
  // Suppress geolocation errors (non-critical, will retry or use fallback)
  if (
    errorStr.includes('Timeout expired') ||
    errorStr.includes('GeolocationPositionError') ||
    errorStr.includes('Geolocation error') ||
    errorStr.includes('User denied Geolocation') ||
    errorStr.includes('permission denied') ||
    (errorStr.includes('code: 3') && errorStr.includes('location')) ||
    (errorStr.includes('code: 1') && errorStr.includes('location'))
  ) {
    return // Silently ignore geolocation errors (permission denied, timeout, etc.)
  }
  
  // Suppress duplicate network error messages (handled by axios interceptor with cooldown)
  // Check if any argument is an AxiosError with network error
  const hasNetworkError = args.some(arg => {
    if (arg && typeof arg === 'object') {
      // Check for AxiosError with ERR_NETWORK code
      if (arg.name === 'AxiosError' && (arg.code === 'ERR_NETWORK' || arg.message === 'Network Error')) {
        return true
      }
      // Check for error objects with network error message
      if (arg.message === 'Network Error' || arg.code === 'ERR_NETWORK') {
        return true
      }
    }
    return false
  })
  
  // If we have a network error object, suppress it regardless of the message prefix
  if (hasNetworkError) {
    // The axios interceptor already handles throttling and shows toast notifications
    return
  }
  
  // Check error string for network error patterns (for string-based error messages)
  if (
    errorStr.includes('🌐 Network Error') ||
    errorStr.includes('Network Error - Backend server may not be running') ||
    (errorStr.includes('ERR_NETWORK') && errorStr.includes('AxiosError')) ||
    errorStr.includes('💡 API Base URL:') ||
    errorStr.includes('💡 Backend URL:') ||
    errorStr.includes('💡 Start backend with:') ||
    errorStr.includes('💡 Check backend health:') ||
    errorStr.includes('💡 Make sure backend server is running:') ||
    errorStr.includes('❌ Backend not accessible at:') ||
    errorStr.includes('💡 Start backend:')
  ) {
    // Only show first occurrence, subsequent ones are suppressed
    // The axios interceptor already handles throttling
    return
  }
  
  // Suppress timeout errors (handled by axios interceptor)
  if (
    errorStr.includes('timeout of') ||
    errorStr.includes('ECONNABORTED') ||
    (errorStr.includes('AxiosError') && errorStr.includes('timeout'))
  ) {
    // Timeout errors are handled by axios interceptor with proper error handling
    return
  }
  
  // Suppress OTP verification errors (handled by UI error messages)
  if (
    errorStr.includes('OTP Verification Error:') ||
    (errorStr.includes('AxiosError') && errorStr.includes('Request failed with status code 403') && errorStr.includes('verify-otp'))
  ) {
    // OTP errors are already displayed to users via UI error messages
    return
  }

  // Suppress Restaurant Socket transport errors (handled by useRestaurantNotifications with throttled message)
  if (
    errorStr.includes('Restaurant Socket connection error') ||
    errorStr.includes('xhr poll error') ||
    (typeof args[0] === 'object' && args[0]?.type === 'TransportError' && args[0]?.message?.includes('xhr poll error'))
  ) {
    return
  }

  // Suppress Socket.IO WebSocket failed (backend unreachable; hook shows throttled message)
  if (errorStr.includes('WebSocket connection to') && errorStr.includes('socket.io') && errorStr.includes('failed')) {
    return
  }

  // Suppress browser autoplay-policy audio errors (expected before first user interaction)
  if (
    errorStr.includes('Audio play failed') &&
    (errorStr.includes('NotAllowedError') || errorStr.includes("didn't interact with the document first"))
  ) {
    return
  }

  originalError.apply(console, args)
}

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason || event
  const errorMsg = error?.message || String(error) || ''
  const errorName = error?.name || ''
  const errorStr = String(error) || ''
  const errorStack = String(error?.stack || '')

  // Suppress browser-extension content script errors (not app code)
  if (
    (errorMsg.includes('useCache') || errorStr.includes('useCache')) &&
    (errorStr.includes('content.js') || errorStack.includes('content.js'))
  ) {
    event.preventDefault()
    return
  }
  
  // Suppress geolocation errors (permission denied, timeout, etc.)
  if (
    errorMsg.includes('Timeout expired') ||
    errorMsg.includes('User denied Geolocation') ||
    errorMsg.includes('permission denied') ||
    errorName === 'GeolocationPositionError' ||
    (error?.code === 3 && errorMsg.includes('timeout')) ||
    (error?.code === 1 && (errorMsg.includes('location') || errorMsg.includes('geolocation')))
  ) {
    event.preventDefault() // Prevent error from showing in console
    return
  }

  // Suppress browser autoplay-policy audio errors from rejected play() promises
  if (
    errorName === 'NotAllowedError' &&
    (errorMsg.includes('play() failed') || errorStr.includes("didn't interact with the document first"))
  ) {
    event.preventDefault()
    return
  }
  
  // Suppress refund processing errors that are already handled by the component
  // These errors are logged with console.error in the component's catch block
  if (
    errorStr.includes('Error processing refund') ||
    (errorName === 'AxiosError' && errorMsg.includes('refund'))
  ) {
    // Error is already handled by the component, just prevent unhandled rejection
    event.preventDefault()
    return
  }
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

const bootstrap = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/env/public`, { method: 'GET' })
    if (response.ok) {
      const payload = await response.json()
      window.__PUBLIC_ENV = payload?.data || {}
    }
  } catch {
    window.__PUBLIC_ENV = window.__PUBLIC_ENV || {}
  }

  const { default: App } = await import('./App.jsx')

  createRoot(rootElement).render(
    <StrictMode>
      <BrowserRouter>
        <App />
        <Toaster position="top-center" richColors offset="80px" />
      </BrowserRouter>
    </StrictMode>,
  )
}

bootstrap()
