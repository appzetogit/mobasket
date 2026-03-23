import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom"

import { useState, useEffect, useMemo, useCallback } from "react"

import { motion, AnimatePresence } from "framer-motion"

import { toast } from "sonner"

import {

  ArrowLeft,

  RefreshCw,

  Phone,

  ChevronRight,

  MapPin,

  Home as HomeIcon,

  MessageSquare,

  X,

  Check,

  Shield,

  Receipt,

  CircleSlash,

  Loader2

} from "lucide-react"

import AnimatedPage from "../../components/AnimatedPage"

import { Card, CardContent } from "@/components/ui/card"

import { Button } from "@/components/ui/button"

import {

  Dialog,

  DialogContent,
  DialogDescription,
  DialogHeader,

  DialogTitle,

} from "@/components/ui/dialog"

import { Textarea } from "@/components/ui/textarea"

import { useOrders } from "../../context/OrdersContext"

import { useProfile } from "../../context/ProfileContext"

import DeliveryTrackingMap from "../../components/DeliveryTrackingMap"

import { orderAPI, restaurantAPI } from "@/lib/api"

import { initRazorpayPayment } from "@/lib/utils/razorpay"

import { saveOrderEditSession } from "../../utils/orderEditSession"

import circleIcon from "@/assets/circleicon.png"



// Animated checkmark component

const AnimatedCheckmark = ({ delay = 0 }) => (

  <motion.svg

    width="80"

    height="80"

    viewBox="0 0 80 80"

    initial="hidden"

    animate="visible"

    className="mx-auto"

  >

    <motion.circle

      cx="40"

      cy="40"

      r="36"

      fill="none"

      stroke="#22c55e"

      strokeWidth="4"

      initial={{ pathLength: 0, opacity: 0 }}

      animate={{ pathLength: 1, opacity: 1 }}

      transition={{ duration: 0.5, delay, ease: "easeOut" }}

    />

    <motion.path

      d="M24 40 L35 51 L56 30"

      fill="none"

      stroke="#22c55e"

      strokeWidth="4"

      strokeLinecap="round"

      strokeLinejoin="round"

      initial={{ pathLength: 0, opacity: 0 }}

      animate={{ pathLength: 1, opacity: 1 }}

      transition={{ duration: 0.4, delay: delay + 0.4, ease: "easeOut" }}

    />

  </motion.svg>

)



// Real Delivery Map Component with User Live Location

const DeliveryMap = ({ orderId, order, isVisible, userLiveCoords = null, userLocationAccuracy = null }) => {

  // Extract coordinates from order payload

  const getRestaurantCoords = () => {

    // Try multiple sources for restaurant coordinates

    let coords = null;



    // Priority 1: restaurantId.location.coordinates (store saved location)

    if (order?.restaurantId?.location?.coordinates &&

      Array.isArray(order.restaurantId.location.coordinates) &&

      order.restaurantId.location.coordinates.length >= 2) {

      coords = order.restaurantId.location.coordinates;

    }

    // Priority 2: restaurantId.location with latitude/longitude

    else if (order?.restaurantId?.location?.latitude && order?.restaurantId?.location?.longitude) {

      coords = [order.restaurantId.location.longitude, order.restaurantId.location.latitude];

    }

    // Priority 3: transformed order fallback

    else if (order?.restaurantLocation?.coordinates &&

      Array.isArray(order.restaurantLocation.coordinates) &&

      order.restaurantLocation.coordinates.length >= 2) {

      coords = order.restaurantLocation.coordinates;

    }



    if (coords && coords.length >= 2) {

      // GeoJSON format is [longitude, latitude]

      return {

        lat: coords[1], // Latitude is second element

        lng: coords[0]  // Longitude is first element

      };

    }



    return null;

  };



  const getCustomerCoords = () => {

    if (

      order?.address?.coordinates &&

      Array.isArray(order.address.coordinates) &&

      order.address.coordinates.length >= 2

    ) {

      return {

        lat: order.address.coordinates[1],

        lng: order.address.coordinates[0]

      };

    }

    if (

      order?.address?.location?.coordinates &&

      Array.isArray(order.address.location.coordinates) &&

      order.address.location.coordinates.length >= 2

    ) {

      return {

        lat: order.address.location.coordinates[1],

        lng: order.address.location.coordinates[0]

      };

    }

    if (

      typeof order?.address?.location?.latitude === "number" &&

      typeof order?.address?.location?.longitude === "number"

    ) {

      return {

        lat: order.address.location.latitude,

        lng: order.address.location.longitude

      };

    }

    if (

      typeof order?.address?.latitude === "number" &&

      typeof order?.address?.longitude === "number"

    ) {

      return {

        lat: order.address.latitude,

        lng: order.address.longitude

      };

    }

    if (

      typeof order?.address?.lat === "number" &&

      typeof order?.address?.lng === "number"

    ) {

      return {

        lat: order.address.lat,

        lng: order.address.lng

      };

    }

    return null;

  };



  const restaurantCoords = getRestaurantCoords();

  const customerCoords = getCustomerCoords();



  // Delivery boy data

  const deliveryBoyData = order?.deliveryPartner ? {

    name: order.deliveryPartner.name || 'Delivery Partner',

    avatar: order.deliveryPartner.avatar || null

  } : null;



  if (!isVisible || !orderId || !order) {

    return (

      <motion.div

        className="relative h-64 bg-gradient-to-b from-gray-100 to-gray-200"

        initial={{ opacity: 0 }}

        animate={{ opacity: 1 }}

        transition={{ duration: 0.5 }}

      />

    );

  }



  return (

    <motion.div

      className="relative h-64 w-full"

      initial={{ opacity: 0 }}

      animate={{ opacity: 1 }}

      transition={{ duration: 0.5 }}

    >

      <DeliveryTrackingMap

        orderId={orderId}

        restaurantCoords={restaurantCoords}

        customerCoords={customerCoords}

        userLiveCoords={userLiveCoords}

        userLocationAccuracy={userLocationAccuracy}

        deliveryBoyData={deliveryBoyData}

        order={order}

      />

    </motion.div>

  );

}



// Section item component

const SectionItem = ({ icon: Icon, title, subtitle, onClick, showArrow = true, rightContent }) => (

  <motion.button

    onClick={onClick}

    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left border-b border-dashed border-gray-200 last:border-0 dark:border-white/10 dark:hover:bg-white/5"

    whileTap={{ scale: 0.99 }}

  >

    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 dark:bg-[#0f172a]">

      <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />

    </div>

    <div className="flex-1 min-w-0">

      <p className="font-medium text-gray-900 truncate dark:text-gray-100">{title}</p>

      {subtitle && <p className="text-sm text-gray-500 truncate dark:text-gray-400">{subtitle}</p>}

    </div>

    {rightContent || (showArrow && <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />)}

  </motion.button>

)



const toValidDeliveryPartner = (partner) => {

  if (!partner || typeof partner !== "object") return null



  const name = (partner.name || partner.fullName || "").trim()

  const phone = (partner.phone || partner.mobile || "").trim()



  if (!name && !phone) return null


  return {

    name: name || "Delivery partner",
    phone,

    avatar: partner.avatar || null,

    availability: partner.availability || null

  }

}



const resolveRestaurantName = (apiOrder = {}) => {

  if (typeof apiOrder?.restaurantId === "object" && apiOrder?.restaurantId?.name) {

    return apiOrder.restaurantId.name

  }

  if (typeof apiOrder?.restaurant === "object" && apiOrder?.restaurant?.name) {

    return apiOrder.restaurant.name

  }

  return apiOrder?.restaurantName || apiOrder?.restaurant || "Restaurant"

}



const isLikelyValidPhone = (value = "") => {

  const digitsOnly = String(value || "").replace(/\D/g, "")

  return digitsOnly.length >= 8 && digitsOnly.length <= 15

}



const pickValidPhone = (...candidates) => {

  for (const candidate of candidates) {

    if (typeof candidate !== "string") continue

    const trimmed = candidate.trim()

    if (!trimmed) continue

    if (isLikelyValidPhone(trimmed)) return trimmed

  }

  return ""

}



const resolveRestaurantPhone = (apiOrder = {}, fetchedRestaurant = null) => {

  const fromRestaurantIdObj =

    typeof apiOrder?.restaurantId === "object" ? apiOrder.restaurantId : null

  const fromRestaurantObj =

    typeof apiOrder?.restaurant === "object" ? apiOrder.restaurant : null



  return pickValidPhone(

    fromRestaurantIdObj?.phone,

    fromRestaurantIdObj?.ownerPhone,

    fromRestaurantIdObj?.primaryContactNumber,

    fromRestaurantObj?.phone,

    fromRestaurantObj?.ownerPhone,

    fromRestaurantObj?.primaryContactNumber,

    apiOrder?.restaurantInfo?.phone,

    fetchedRestaurant?.phone,

    fetchedRestaurant?.ownerPhone,

    fetchedRestaurant?.primaryContactNumber,

    apiOrder?.restaurantPhone

  )

}



const resolveRestaurantAddress = (apiOrder = {}, fetchedRestaurant = null) => {

  const nestedRestaurant =

    (typeof apiOrder?.restaurantId === "object" && apiOrder?.restaurantId) ||

    (typeof apiOrder?.restaurant === "object" && apiOrder?.restaurant) ||

    null



  const location =

    nestedRestaurant?.location ||

    fetchedRestaurant?.location ||

    apiOrder?.restaurantLocation ||

    null



  const directCandidates = [

    location?.formattedAddress,

    location?.address,

    nestedRestaurant?.address,

    apiOrder?.restaurantInfo?.address,

    fetchedRestaurant?.address,

    apiOrder?.restaurantAddress

  ]



  for (const candidate of directCandidates) {

    if (typeof candidate === "string" && candidate.trim()) {

      return candidate.trim()

    }

  }



  if (location && typeof location === "object") {

    const parts = [

      location?.addressLine1,

      location?.addressLine2,

      location?.area,

      location?.city,

      location?.state,

      location?.zipCode || location?.postalCode || location?.pincode

    ]

      .map((part) => (typeof part === "string" ? part.trim() : ""))

      .filter(Boolean)



    if (parts.length > 0) return parts.join(", ")

  }



  return ""

}



const sanitizePhoneForTel = (phone = "") => String(phone).replace(/[^\d+]/g, "")

const toSlug = (value = "") =>

  String(value || "")

    .trim()

    .toLowerCase()

    .replace(/[^a-z0-9]+/g, "-")

    .replace(/(^-|-$)/g, "")



const resolveTrackingRestaurantName = (rawOrder = null) => {

  return (

    rawOrder?.restaurant ||

    rawOrder?.restaurantName ||

    rawOrder?.restaurantId?.name ||

    rawOrder?.restaurantInfo?.name ||

    "Restaurant"

  )

}



const resolveTrackingRestaurantPhone = (rawOrder = null) => {

  return pickValidPhone(

    rawOrder?.restaurantPhone,

    rawOrder?.restaurantId?.phone,

    rawOrder?.restaurantId?.ownerPhone,

    rawOrder?.restaurantId?.primaryContactNumber,

    rawOrder?.restaurantInfo?.phone

  )

}



const resolveTrackingDeliveryAddress = (rawOrder = null, defaultAddress = null) => {

  if (!rawOrder) return "Add delivery address"



  if (

    typeof rawOrder?.deliveryAddress === "string" &&

    rawOrder.deliveryAddress.trim() &&

    rawOrder.deliveryAddress !== "Select location"

  ) {

    return rawOrder.deliveryAddress

  }



  if (

    typeof rawOrder?.address?.formattedAddress === "string" &&

    rawOrder.address.formattedAddress.trim() &&

    rawOrder.address.formattedAddress !== "Select location"

  ) {

    return rawOrder.address.formattedAddress

  }



  if (rawOrder?.address) {

    const orderAddressParts = []

    if (rawOrder.address.street) orderAddressParts.push(rawOrder.address.street)

    if (rawOrder.address.additionalDetails) orderAddressParts.push(rawOrder.address.additionalDetails)

    if (rawOrder.address.city) orderAddressParts.push(rawOrder.address.city)

    if (rawOrder.address.state) orderAddressParts.push(rawOrder.address.state)

    if (rawOrder.address.zipCode) orderAddressParts.push(rawOrder.address.zipCode)

    if (orderAddressParts.length > 0) return orderAddressParts.join(", ")

  }



  if (

    typeof defaultAddress?.formattedAddress === "string" &&

    defaultAddress.formattedAddress.trim() &&

    defaultAddress.formattedAddress !== "Select location"

  ) {

    return defaultAddress.formattedAddress

  }



  if (defaultAddress) {

    const defaultAddressParts = []

    if (defaultAddress.street) defaultAddressParts.push(defaultAddress.street)

    if (defaultAddress.additionalDetails) defaultAddressParts.push(defaultAddress.additionalDetails)

    if (defaultAddress.city) defaultAddressParts.push(defaultAddress.city)

    if (defaultAddress.state) defaultAddressParts.push(defaultAddress.state)

    if (defaultAddress.zipCode) defaultAddressParts.push(defaultAddress.zipCode)

    if (defaultAddressParts.length > 0) return defaultAddressParts.join(", ")

  }



  return "Add delivery address"

}



const resolveTrackingRestaurantAddress = (rawOrder = null) => {

  if (!rawOrder) return "Store address unavailable";



  const restaurant = rawOrder?.restaurantId;

  const location = restaurant?.location || rawOrder?.restaurantLocation || {};

  const directAddress =

    location?.formattedAddress ||

    location?.address ||

    restaurant?.address ||

    rawOrder?.restaurantAddress ||

    "";



  if (typeof directAddress === "string" && directAddress.trim()) {

    return directAddress.trim();

  }



  const parts = [

    location?.addressLine1,

    location?.addressLine2,

    location?.area,

    location?.city,

    location?.state,

    location?.zipCode || location?.postalCode || location?.pincode,

  ]

    .map((part) => (typeof part === "string" ? part.trim() : ""))

    .filter(Boolean);



  if (parts.length > 0) return parts.join(", ");

  return "Store address unavailable";

}



export default function OrderTracking() {

  const { orderId } = useParams()

  const navigate = useNavigate()

  const [searchParams] = useSearchParams()

  const confirmed = searchParams.get("confirmed") === "true"

  const { getOrderById } = useOrders()

  const { profile, getDefaultAddress } = useProfile()



  // State for order data

  const [order, setOrder] = useState(null)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState(null)



  const [showConfirmation, setShowConfirmation] = useState(confirmed)

  const [orderStatus, setOrderStatus] = useState('placed')

  const [estimatedTime, setEstimatedTime] = useState(29)

  const [driverDistanceKm, setDriverDistanceKm] = useState(null)

  const [isRefreshing, setIsRefreshing] = useState(false)

  const [showCancelDialog, setShowCancelDialog] = useState(false)

  const [cancellationReason, setCancellationReason] = useState("")

  const [isCancelling, setIsCancelling] = useState(false)

  const [modificationWindowSeconds, setModificationWindowSeconds] = useState(0)

  const [showEditDialog, setShowEditDialog] = useState(false)

  const [editableItems, setEditableItems] = useState([])

  const [isEditingOrder, setIsEditingOrder] = useState(false)

  const [availableEditMenuItems, setAvailableEditMenuItems] = useState([])

  const [loadingEditMenuItems, setLoadingEditMenuItems] = useState(false)



  const defaultAddress = getDefaultAddress()

  const restaurantDisplayName = resolveTrackingRestaurantName(order)

  const restaurantDisplayPhone = resolveTrackingRestaurantPhone(order)

  const restaurantAddressDisplay = resolveTrackingRestaurantAddress(order)

  const deliveryAddressDisplay = resolveTrackingDeliveryAddress(order, defaultAddress)

  const isMoGroceryOrder = (rawOrder = null) => {

    const restaurantPlatform = String(rawOrder?.restaurantId?.platform || rawOrder?.platform || "").toLowerCase()

    const restaurantLabel = String(rawOrder?.restaurantName || rawOrder?.restaurant || rawOrder?.restaurantId?.name || "").toLowerCase()

    const orderNote = String(rawOrder?.note || "").toLowerCase()



    return (

      restaurantPlatform === "mogrocery" ||

      restaurantLabel.includes("mogrocery") ||

      orderNote.includes("[mogrocery]")

    )

  }



  const isMoGroceryPlanOrder = (rawOrder = null) => {

    if (!rawOrder) return false



    const note = String(rawOrder?.note || "").toLowerCase()

    if (note.includes("[mogold plan]") || note.includes("plan subscription")) return true



    if (rawOrder?.planSubscription?.planId || rawOrder?.planSubscription?.planName) {

      return true

    }



    const items = Array.isArray(rawOrder?.items) ? rawOrder.items : []

    return items.some((item) => {

      const itemId = String(item?.itemId || "").toLowerCase()

      const description = String(item?.description || "").toLowerCase()

      return itemId.startsWith("plan-") || description.includes("plan subscription")

    })

  }



  const isAwaitingGroceryAdminAcceptance = (rawOrder = null) => {

    if (!isMoGroceryOrder(rawOrder)) return false

    if (isMoGroceryPlanOrder(rawOrder)) return false



    const approvalStatus = String(rawOrder?.adminApproval?.status || "").toLowerCase()

    const normalizedStatus = String(rawOrder?.status || "").toLowerCase()



    if (approvalStatus) return approvalStatus !== "approved"

    return normalizedStatus === "pending" || normalizedStatus === "confirmed"

  }



  const deriveUiOrderStatus = (rawStatus, rawOrder = null) => {

    const normalized = String(rawStatus || rawOrder?.status || "").toLowerCase()

    const deliveryStatus = String(rawOrder?.deliveryState?.status || "").toLowerCase()

    const deliveryPhase = String(rawOrder?.deliveryState?.currentPhase || "").toLowerCase()

    const isOutForDeliveryFromTracking = Boolean(

      rawOrder?.tracking?.outForDelivery?.status === true ||

      rawOrder?.tracking?.out_for_delivery?.status === true

    )



    if (normalized === "cancelled") return "cancelled"

    if (

      normalized === "delivered" ||

      deliveryStatus === "delivered" ||

      deliveryPhase === "at_delivery" ||

      deliveryPhase === "completed"

    ) {

      return "delivered"

    }



    if (

      normalized === "out_for_delivery" ||

      normalized === "picked_up" ||

      normalized === "on_the_way" ||

      deliveryStatus === "order_confirmed" ||

      deliveryStatus === "en_route_to_delivery" ||

      deliveryPhase === "en_route_to_delivery" ||

      isOutForDeliveryFromTracking

    ) {

      return "pickup"

    }



    if (

      normalized === "ready" ||

      normalized === "preparing" ||

      normalized === "accepted" ||

      deliveryStatus === "accepted" ||

      deliveryStatus === "reached_pickup" ||

      deliveryPhase === "en_route_to_pickup" ||

      deliveryPhase === "at_pickup"

    ) {

      if (isAwaitingGroceryAdminAcceptance(rawOrder)) {

        return "placed"

      }

      return "preparing"

    }



    return "placed"

  }



  const riderInfo = useMemo(() => {

    return toValidDeliveryPartner(order?.deliveryPartner || order?.deliveryPartnerId)

  }, [order?.deliveryPartner, order?.deliveryPartnerId])



  const isRiderAccepted = useMemo(() => {

    const phase = order?.deliveryState?.currentPhase

    const deliveryStatus = order?.deliveryState?.status

    const status = order?.status



    return Boolean(

      riderInfo &&

      (

        deliveryStatus === "accepted" ||

        phase === "en_route_to_pickup" ||

        phase === "at_pickup" ||

        phase === "en_route_to_delivery" ||

        status === "out_for_delivery"

      )

    )

  }, [order?.deliveryState?.currentPhase, order?.deliveryState?.status, order?.status, riderInfo])

  const hasAssignedRider = useMemo(() => {

    return Boolean(riderInfo || order?.deliveryPartnerId || order?.assignmentInfo?.deliveryPartnerId)

  }, [riderInfo, order?.deliveryPartnerId, order?.assignmentInfo?.deliveryPartnerId])

  const riderDialNumber = sanitizePhoneForTel(riderInfo?.phone || "")


  const userLiveCoords = useMemo(() => {

    const toFinite = (value) => {

      const parsed = Number(value)

      return Number.isFinite(parsed) ? parsed : null

    }



    const fromGeoJson = (coordinates) => {

      if (!Array.isArray(coordinates) || coordinates.length < 2) return null

      const lng = toFinite(coordinates[0])

      const lat = toFinite(coordinates[1])

      if (lat == null || lng == null) return null

      return { lat, lng }

    }



    const fromLatLng = (obj) => {

      if (!obj || typeof obj !== "object") return null

      const lat = toFinite(obj.lat ?? obj.latitude)

      const lng = toFinite(obj.lng ?? obj.longitude)

      if (lat == null || lng == null) return null

      return { lat, lng }

    }



    return (

      fromGeoJson(order?.address?.coordinates) ||

      fromGeoJson(order?.address?.location?.coordinates) ||

      fromLatLng(order?.address) ||

      fromLatLng(order?.address?.location) ||

      fromGeoJson(defaultAddress?.coordinates) ||

      fromGeoJson(defaultAddress?.location?.coordinates) ||

      fromLatLng(defaultAddress) ||

      fromLatLng(defaultAddress?.location) ||

      null

    )

  }, [order?.address, defaultAddress])



  const canModifyOrder = useMemo(() => {

    const status = String(order?.status || "").toLowerCase()

    if (status === "cancelled" || status === "delivered") return false

    return modificationWindowSeconds > 0

  }, [order?.status, modificationWindowSeconds])



  const formatCountdown = (seconds) => {

    const safeSeconds = Math.max(0, Number(seconds) || 0)

    const mins = Math.floor(safeSeconds / 60)

    const secs = safeSeconds % 60

    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`

  }



  const getCombinedEtaMinutes = (rawOrder) => {

    if (!rawOrder) return null



    const prepMinutes = Math.max(0, Number(rawOrder.preparationTime || 0))

    const deliveryMinutes = Math.max(0, Number(rawOrder.estimatedDeliveryTime || 0))

    const etaMaxMinutes = Math.max(0, Number(rawOrder.eta?.max || 0))

    const totalEtaMinutes = Math.max(etaMaxMinutes, prepMinutes + deliveryMinutes, deliveryMinutes)

    if (!Number.isFinite(totalEtaMinutes) || totalEtaMinutes <= 0) return null



    const createdAtMs = rawOrder?.createdAt ? new Date(rawOrder.createdAt).getTime() : null

    if (!createdAtMs || Number.isNaN(createdAtMs)) {

      return Math.max(1, Math.round(totalEtaMinutes))

    }



    const elapsedMinutes = Math.floor((Date.now() - createdAtMs) / (1000 * 60))

    return Math.max(1, Math.round(totalEtaMinutes - elapsedMinutes))

  }



  const syncModificationWindow = (rawOrder) => {

    const windowData = rawOrder?.modificationWindow

    if (!windowData) {

      const startAtRaw =

        rawOrder?.postOrderActions?.modificationWindowStartAt ||

        rawOrder?.tracking?.confirmed?.timestamp ||

        rawOrder?.createdAt ||

        null

      if (startAtRaw) {

        const expiresAt = new Date(new Date(startAtRaw).getTime() + 2 * 60 * 1000)

        const remaining = Math.ceil((expiresAt.getTime() - Date.now()) / 1000)

        setModificationWindowSeconds(Math.max(0, remaining))

      } else {

        setModificationWindowSeconds(0)

      }

      return

    }



    if (typeof windowData.remainingSeconds === "number") {

      setModificationWindowSeconds(Math.max(0, Math.ceil(windowData.remainingSeconds)))

      return

    }



    if (windowData.expiresAt) {

      const remaining = Math.ceil((new Date(windowData.expiresAt).getTime() - Date.now()) / 1000)

      setModificationWindowSeconds(Math.max(0, remaining))

      return

    }



    setModificationWindowSeconds(0)

  }



  // Poll for order updates (especially when delivery partner accepts)

  // Only poll if delivery partner is not yet assigned to avoid unnecessary updates

  useEffect(() => {
    if (!orderId || !order) return;

    // Skip polling if delivery partner is already assigned and accepted
    const currentDeliveryStatus = order?.deliveryState?.status;
    const currentPhase = order?.deliveryState?.currentPhase;
    const normalizedOrderStatus = String(order?.status || "").toLowerCase();
    const normalizedDeliveryStatus = String(currentDeliveryStatus || "").toLowerCase();
    const normalizedPhase = String(currentPhase || "").toLowerCase();
    const isTerminalOrderState =
      normalizedOrderStatus === "cancelled" ||
      normalizedOrderStatus === "delivered" ||
      normalizedOrderStatus === "completed" ||
      normalizedDeliveryStatus === "delivered" ||
      normalizedPhase === "completed";

    if (isTerminalOrderState) return;

    const hasDeliveryPartner = currentDeliveryStatus === 'accepted' ||
      currentPhase === 'en_route_to_pickup' ||
      currentPhase === 'at_pickup' ||
      currentPhase === 'en_route_to_delivery';


    // If delivery partner is assigned, keep polling reasonably fast so status feels live.

    // If not assigned, poll every 5 seconds to detect assignment

    const pollInterval = hasDeliveryPartner ? 8000 : 5000;

    const interval = setInterval(async () => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }

      try {
        const response = await orderAPI.getOrderDetails(orderId);
        if (response.data?.success && response.data.data?.order) {
          const apiOrder = response.data.data.order;



          // Check if delivery state changed (e.g., status became 'accepted')

          const newDeliveryStatus = apiOrder.deliveryState?.status;

          const newPhase = apiOrder.deliveryState?.currentPhase;

          const newOrderStatus = apiOrder.status;

          const currentOrderStatus = order?.status;



          // Check if order was cancelled

          if (newOrderStatus === 'cancelled' && currentOrderStatus !== 'cancelled') {

            setOrderStatus('cancelled');

          }



          // Only update if status actually changed

          if (newDeliveryStatus === 'accepted' ||

            (newDeliveryStatus !== currentDeliveryStatus) ||

            (newPhase !== currentPhase) ||

            (newOrderStatus !== currentOrderStatus)) {

            // Re-fetch and update order (same logic as initial fetch)

            let restaurantCoords = null;

            let restaurantDetails = null;

            if (apiOrder.restaurantId?.location?.coordinates &&

              Array.isArray(apiOrder.restaurantId.location.coordinates) &&

              apiOrder.restaurantId.location.coordinates.length >= 2) {

              restaurantCoords = apiOrder.restaurantId.location.coordinates;

            } else if (typeof apiOrder.restaurantId === 'string') {

              try {

                const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);

                if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {

                  const restaurant = restaurantResponse.data.data.restaurant;

                  restaurantDetails = restaurant;

                  if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {

                    restaurantCoords = restaurant.location.coordinates;

                  }

                }

              } catch (err) {

                console.error('❌ Error fetching restaurant details:', err);

              }

            }



            const resolvedRestaurantAddress =

              resolveRestaurantAddress(apiOrder, restaurantDetails) ||

              order?.restaurantAddress ||

              "";

            const resolvedRestaurantPhone =

              resolveRestaurantPhone(apiOrder, restaurantDetails) ||

              order?.restaurantPhone ||

              "";



            const transformedOrder = {

              ...apiOrder,

              restaurantPhone: resolvedRestaurantPhone,

              restaurantAddress: resolvedRestaurantAddress,

              restaurantLocation: {

                coordinates: restaurantCoords || order?.restaurantLocation?.coordinates || null,

                formattedAddress: resolvedRestaurantAddress || order?.restaurantLocation?.formattedAddress || "",

                address: resolvedRestaurantAddress || order?.restaurantLocation?.address || ""

              },

              planSubscription: apiOrder.planSubscription || null,

              deliveryPartnerId: apiOrder.deliveryPartnerId?._id || apiOrder.deliveryPartnerId || apiOrder.assignmentInfo?.deliveryPartnerId || null,

              assignmentInfo: apiOrder.assignmentInfo || null,

              deliveryState: apiOrder.deliveryState || null,

              modificationWindow: apiOrder.modificationWindow || null,

              items: Array.isArray(apiOrder.items)

                ? apiOrder.items.map((item) => ({

                  itemId: item.itemId?._id || item.itemId || item._id || null,

                  name: item.name,

                  quantity: Number(item.quantity || 0),

                  price: Number(item.price || 0),

                  image: item.image || "",

                  description: item.description || "",

                  isVeg: item.isVeg !== false

                }))

                : []

            };



            setOrder(transformedOrder);

            setOrderStatus(deriveUiOrderStatus(apiOrder.status, apiOrder));

            syncModificationWindow(apiOrder);

          }

        }

      } catch (err) {
        if (err?.response?.status === 404) {
          setOrder(null);
          setError('This order is no longer available. It may have been deleted by the admin.');
        } else {
          console.error('Error polling order updates:', err);
        }
      }
    }, pollInterval);



    return () => clearInterval(interval);

  }, [orderId, order?.deliveryState?.status, order?.deliveryState?.currentPhase]);



  // Fetch order from API if not found in context

  useEffect(() => {

    const fetchOrder = async () => {

      // First try to get from context (localStorage)

      const contextOrder = getOrderById(orderId)

      if (contextOrder) {

        // Ensure restaurant location is available in context order

        if (!contextOrder.restaurantLocation?.coordinates && contextOrder.restaurantId?.location?.coordinates) {

          contextOrder.restaurantLocation = {

            coordinates: contextOrder.restaurantId.location.coordinates

          };

        }

        // Also ensure restaurantId is present

        // If restaurantId is missing but restaurant exists, we still proceed and let API fetch handle details

        setOrder(contextOrder)

        const etaFromContext = getCombinedEtaMinutes(contextOrder)

        if (etaFromContext) setEstimatedTime(etaFromContext)

        syncModificationWindow(contextOrder)

        setLoading(false)

        return

      }



      // If not in context, fetch from API

      try {

        setLoading(true)

        setError(null)



        const response = await orderAPI.getOrderDetails(orderId)



        if (response.data?.success && response.data.data?.order) {

          const apiOrder = response.data.data.order



          // Extract restaurant location coordinates with multiple fallbacks

          let restaurantCoords = null;

          let restaurantDetails = null;



          // Priority 1: restaurantId.location.coordinates (GeoJSON format: [lng, lat])

          if (apiOrder.restaurantId?.location?.coordinates &&

            Array.isArray(apiOrder.restaurantId.location.coordinates) &&

            apiOrder.restaurantId.location.coordinates.length >= 2) {

            restaurantCoords = apiOrder.restaurantId.location.coordinates;

          }

          // Priority 2: restaurantId.location with latitude/longitude properties

          else if (apiOrder.restaurantId?.location?.latitude && apiOrder.restaurantId?.location?.longitude) {

            restaurantCoords = [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude];

          }

          // Priority 3: Check if restaurantId is a string ID and fetch restaurant details

          else if (typeof apiOrder.restaurantId === 'string') {

            try {

              const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);

              if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {

                const restaurant = restaurantResponse.data.data.restaurant;

                restaurantDetails = restaurant;

                if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {

                  restaurantCoords = restaurant.location.coordinates;

                }

              }

            } catch (err) {

              console.error('❌ Error fetching restaurant details:', err);

            }

          }

          // Priority 4: Check nested restaurant data

          else if (apiOrder.restaurant?.location?.coordinates) {

            restaurantCoords = apiOrder.restaurant.location.coordinates;

          }



          const resolvedRestaurantAddress = resolveRestaurantAddress(apiOrder, restaurantDetails);

          const resolvedRestaurantPhone = resolveRestaurantPhone(apiOrder, restaurantDetails);



          // Transform API order to match component structure

          const transformedOrder = {

            id: apiOrder.orderId || apiOrder._id,

            restaurant: resolveRestaurantName(apiOrder),

            restaurantPhone: resolvedRestaurantPhone,

            restaurantAddress: resolvedRestaurantAddress || "",

            restaurantId: apiOrder.restaurantId || null, // Include restaurantId for location access

            userId: apiOrder.userId || null, // Include user data for phone number

            userName: apiOrder.userName || apiOrder.userId?.name || apiOrder.userId?.fullName || '',

            userPhone: apiOrder.userPhone || apiOrder.userId?.phone || '',

            address: {

              street: apiOrder.address?.street || '',

              city: apiOrder.address?.city || '',

              state: apiOrder.address?.state || '',

              zipCode: apiOrder.address?.zipCode || '',

              additionalDetails: apiOrder.address?.additionalDetails || '',

              formattedAddress: apiOrder.address?.formattedAddress ||

                (apiOrder.address?.street && apiOrder.address?.city

                  ? `${apiOrder.address.street}${apiOrder.address.additionalDetails ? `, ${apiOrder.address.additionalDetails}` : ''}, ${apiOrder.address.city}${apiOrder.address.state ? `, ${apiOrder.address.state}` : ''}${apiOrder.address.zipCode ? ` ${apiOrder.address.zipCode}` : ''}`

                  : apiOrder.address?.city || ''),

              coordinates: apiOrder.address?.location?.coordinates || null

            },

            restaurantLocation: {

              coordinates: restaurantCoords,

              formattedAddress: resolvedRestaurantAddress || "",

              address: resolvedRestaurantAddress || ""

            },

            items: apiOrder.items?.map(item => ({

              itemId: item.itemId?._id || item.itemId || item._id || null,

              name: item.name,

              quantity: item.quantity,

              price: item.price,

              image: item.image || "",

              description: item.description || "",

              isVeg: item.isVeg !== false

            })) || [],

            total: apiOrder.pricing?.total || 0,

            status: apiOrder.status || 'pending',

            createdAt: apiOrder.createdAt || null,

            payment: apiOrder.payment || {

              method: response?.data?.data?.payment?.method || null,

              status: response?.data?.data?.payment?.status || null

            },

            eta: apiOrder.eta || null,

            estimatedDeliveryTime: Number(apiOrder.estimatedDeliveryTime || 0),

            preparationTime: Number(apiOrder.preparationTime || 0),

            adminApproval: apiOrder.adminApproval || null,

            planSubscription: apiOrder.planSubscription || null,

            note: apiOrder.note || "",

            deliveryPartner: toValidDeliveryPartner(apiOrder.deliveryPartnerId),

            deliveryPartnerId: apiOrder.deliveryPartnerId?._id || apiOrder.deliveryPartnerId || apiOrder.assignmentInfo?.deliveryPartnerId || null,

            assignmentInfo: apiOrder.assignmentInfo || null,

            tracking: apiOrder.tracking || {},

            deliveryState: apiOrder.deliveryState || null,

            modificationWindow: apiOrder.modificationWindow || null

          }



          setOrder(transformedOrder)

          const etaFromOrder = getCombinedEtaMinutes(transformedOrder)

          if (etaFromOrder) setEstimatedTime(etaFromOrder)

          setOrderStatus(deriveUiOrderStatus(apiOrder.status, apiOrder))

          syncModificationWindow(apiOrder)

        } else {

          throw new Error('Order not found')

        }

      } catch (err) {
        if (err?.response?.status === 404) {
          setOrder(null)
          setError('This order is no longer available. It may have been deleted by the admin.')
        } else {
          console.error('Error fetching order:', err)
          setError(err.response?.data?.message || err.message || 'Failed to fetch order')
        }
      } finally {
        setLoading(false)
      }
    }



    if (orderId) {

      fetchOrder()

    }

  }, [orderId, getOrderById])



  // Simulate order status progression

  useEffect(() => {

    if (confirmed) {

      const timer1 = setTimeout(() => {

        setShowConfirmation(false)

        setOrderStatus(order ? deriveUiOrderStatus(order.status, order) : 'placed')

      }, 3000)

      return () => clearTimeout(timer1)

    }

  }, [confirmed, order?.status, order?.deliveryState?.status, order?.deliveryState?.currentPhase])



  useEffect(() => {

    if (!order) return

    setOrderStatus(deriveUiOrderStatus(order.status, order))

  }, [

    order?.status,

    order?.deliveryState?.status,

    order?.deliveryState?.currentPhase,

    order?.tracking?.outForDelivery?.status,

    order?.tracking?.out_for_delivery?.status

  ])



  // Countdown timer

  useEffect(() => {

    const timer = setInterval(() => {

      setEstimatedTime((prev) => Math.max(0, prev - 1))

    }, 60000)

    return () => clearInterval(timer)

  }, [])



  useEffect(() => {

    if (modificationWindowSeconds <= 0) return

    const timer = setInterval(() => {

      setModificationWindowSeconds((prev) => Math.max(0, prev - 1))

    }, 1000)

    return () => clearInterval(timer)

  }, [modificationWindowSeconds])



  useEffect(() => {

    const isDeliveryCompletedNow =
      orderStatus === "delivered" ||
      String(order?.status || "").toLowerCase() === "delivered" ||
      String(order?.status || "").toLowerCase() === "completed" ||
      String(order?.deliveryState?.status || "").toLowerCase() === "delivered" ||
      String(order?.deliveryState?.currentPhase || "").toLowerCase() === "completed"

    if (isDeliveryCompletedNow) {
      setDriverDistanceKm(null)
      return
    }

    const handleDriverDistanceUpdate = (event) => {
      const detail = event?.detail || {}

      const eventOrderId = detail.orderId ? String(detail.orderId) : ""

      const currentOrderId = String(orderId || "")

      const currentMongoId = String(order?.id || "")



      if (eventOrderId && eventOrderId !== currentOrderId && eventOrderId !== currentMongoId) {

        return

      }



      const km = Number(detail.distanceKm)

      if (Number.isFinite(km) && km >= 0) {

        setDriverDistanceKm(km)

      }

    }



    window.addEventListener("driverDistanceUpdate", handleDriverDistanceUpdate)

    return () => window.removeEventListener("driverDistanceUpdate", handleDriverDistanceUpdate)

  }, [orderId, order?.id, orderStatus, order?.status, order?.deliveryState?.status, order?.deliveryState?.currentPhase])


  // Refetch order (e.g. after socket status update) so map gets latest deliveryState for blue polyline

  const refetchOrder = useCallback(async () => {

    if (!orderId) return;

    try {

      const response = await orderAPI.getOrderDetails(orderId);

      if (response.data?.success && response.data.data?.order) {

        const apiOrder = response.data.data.order;

        setOrder((prev) => {

          if (!prev) return prev;

          return {

            ...prev,

            id: apiOrder.orderId || apiOrder._id,

            restaurant: resolveRestaurantName(apiOrder) || prev.restaurant,

            restaurantPhone: resolveRestaurantPhone(apiOrder) || prev.restaurantPhone,

            restaurantAddress: resolveRestaurantAddress(apiOrder) || prev.restaurantAddress,

            status: apiOrder.status ?? prev.status,

            deliveryState: apiOrder.deliveryState ?? prev.deliveryState,

            deliveryPartner: toValidDeliveryPartner(apiOrder.deliveryPartnerId) || prev.deliveryPartner,

            deliveryPartnerId: apiOrder.deliveryPartnerId?._id || apiOrder.deliveryPartnerId || prev.deliveryPartnerId

          };

        });

        setOrderStatus(deriveUiOrderStatus(apiOrder.status, apiOrder));

      }

    } catch (err) {

      console.warn('Refetch order on status update failed:', err);

    }

  }, [orderId]);



  // Listen for order status updates from socket (e.g., "Delivery partner on the way")

  useEffect(() => {

    const handleOrderStatusNotification = (event) => {

      const detail = event?.detail || {}

      const { message, status, estimatedDeliveryTime } = detail

      const eventOrderId = detail.orderId ? String(detail.orderId) : ""

      const currentOrderId = String(orderId || "")

      const currentMongoId = String(order?._id || order?.id || "")



      if (eventOrderId && eventOrderId !== currentOrderId && eventOrderId !== currentMongoId) {

        return

      }





      // Refetch order so map gets latest deliveryState.currentPhase (en_route_to_delivery) and shows blue polyline

      refetchOrder();



      // Update order status in UI

      if (status) {

        setOrderStatus(deriveUiOrderStatus(status, order));

      }



      if (typeof estimatedDeliveryTime === "number" && Number.isFinite(estimatedDeliveryTime) && estimatedDeliveryTime > 0) {

        setEstimatedTime(Math.max(1, Math.round(estimatedDeliveryTime / 60)));

      }



      // Show notification toast

      if (message) {

        toast.success(message, {

          duration: 5000,

          icon: '🏍️',

          position: 'top-center',

          description: estimatedDeliveryTime

            ? `Estimated delivery in ${Math.round(estimatedDeliveryTime / 60)} minutes`

            : undefined

        });



        // Optional: Vibrate device if supported

        if (navigator.vibrate) {

          navigator.vibrate([200, 100, 200]);

        }

      }

    };



    // Listen for custom event from DeliveryTrackingMap

    window.addEventListener('orderStatusNotification', handleOrderStatusNotification);



    return () => {

      window.removeEventListener('orderStatusNotification', handleOrderStatusNotification);

    };

  }, [orderId, order?._id, order?.id, refetchOrder])



  const handleCancelOrder = () => {

    // Check if order can be cancelled (only Razorpay orders that aren't delivered/cancelled)

    if (!order) return;



    if (!canModifyOrder) {

      toast.error('You can only edit/cancel within 2 minutes of order confirmation');

      return;

    }



    if (order.status === 'cancelled') {

      toast.error('Order is already cancelled');

      return;

    }



    if (order.status === 'delivered') {

      toast.error('Cannot cancel a delivered order');

      return;

    }



    // Allow cancellation for all payment methods (Razorpay, COD, Wallet)

    // Only restrict if order is already cancelled or delivered (checked above)



    setShowCancelDialog(true);

  };



  const handleEditOrder = () => {

    if (!order) return



    if (!canModifyOrder) {

      toast.error('You can only edit/cancel within 2 minutes of order confirmation')

      return

    }



    if (!Array.isArray(order.items) || order.items.length === 0) {

      toast.error("No items available to edit")

      return

    }



    const isGroceryOrder = isMoGroceryOrder(order)

    const restaurantId = resolveOrderRestaurantId(order)

    const restaurantSlug =

      String(order?.restaurantId?.slug || order?.restaurantSlug || "").trim() ||

      toSlug(order?.restaurantName || order?.restaurantId?.name || order?.restaurant)

    const restaurantRouteIdentifier = restaurantSlug || (restaurantId ? String(restaurantId).trim() : "")



    if (!isGroceryOrder && !restaurantRouteIdentifier) {

      toast.error("Restaurant menu is unavailable for this order.")

      return

    }



    const initialEditableItems = order.items.map((item, index) => {

      const resolvedItemId = String(item.itemId || item._id || `${item.name}-${index}`)

      return {

        key: `${resolvedItemId}-${index}`,

        itemId: resolvedItemId,

        name: item.name,

        quantity: Math.max(1, Number(item.quantity || 1)),

        price: Number(item.price || 0),

        image: item.image || "",

        description: item.description || "",

        isVeg: item.isVeg !== false

      }

    })



    const expiresAt = Date.now() + Math.max(0, Number(modificationWindowSeconds || 0)) * 1000

    const session = saveOrderEditSession({

      orderRouteId: String(orderId || ""),

      orderMongoId: String(order?._id || order?.id || ""),

      restaurantId: restaurantId ? String(restaurantId) : "",

      restaurantSlug,

      restaurantName: order?.restaurant || order?.restaurantId?.name || "",

      expiresAt,

      items: initialEditableItems.map((item) => ({

        itemId: String(item.itemId || ""),

        name: item.name,

        quantity: Math.max(1, Number(item.quantity || 1)),

        price: Number(item.price || 0),

        image: item.image || "",

        description: item.description || "",

        isVeg: item.isVeg !== false

      })),

    })



    const editTargetPath = isGroceryOrder
      ? `/grocery${restaurantId ? `?storeId=${encodeURIComponent(String(restaurantId))}` : ""}`
      : `/restaurants/${restaurantRouteIdentifier}`



    navigate(editTargetPath, {

      state: {

        fromOrderEdit: true,

        orderEditSession: session,

      },

    })

  }



  const handleViewOrderDetails = () => {

    const selectedOrderId = String(order?.id || order?.orderId || orderId || "").trim()

    if (!selectedOrderId) {

      toast.error("Order ID not available")

      return

    }

    navigate(`/orders/${encodeURIComponent(selectedOrderId)}/details`)

  }



  function resolveOrderRestaurantId(rawOrder) {

    if (!rawOrder?.restaurantId) return null

    if (typeof rawOrder.restaurantId === "string") return rawOrder.restaurantId

    return (

      rawOrder.restaurantId?._id ||

      rawOrder.restaurantId?.restaurantId ||

      rawOrder.restaurantId?.id ||

      null

    )

  }



  function extractMenuItemsForEdit(menu) {

    const sections = Array.isArray(menu?.sections) ? menu.sections : []

    const flattened = []



    sections.forEach((section) => {

      const sectionItems = Array.isArray(section?.items) ? section.items : []

      sectionItems.forEach((item) => {

        if (!item?.id || !item?.name) return

        flattened.push({

          key: String(item.id),

          itemId: String(item.id),

          name: item.name,

          price: Number(item.price || 0),

          image: item.image || (Array.isArray(item.images) ? item.images[0] : "") || "",

          description: item.description || "",

          isVeg: item.foodType === "Veg",

        })

      })



      const subsections = Array.isArray(section?.subsections) ? section.subsections : []

      subsections.forEach((subsection) => {

        const subsectionItems = Array.isArray(subsection?.items) ? subsection.items : []

        subsectionItems.forEach((item) => {

          if (!item?.id || !item?.name) return

          flattened.push({

            key: String(item.id),

            itemId: String(item.id),

            name: item.name,

            price: Number(item.price || 0),

            image: item.image || (Array.isArray(item.images) ? item.images[0] : "") || "",

            description: item.description || "",

            isVeg: item.foodType === "Veg",

          })

        })

      })

    })



    const deduped = new Map()

    flattened.forEach((item) => {

      if (!deduped.has(item.itemId)) {

        deduped.set(item.itemId, item)

      }

    })



    return Array.from(deduped.values())

  }



  async function loadRestaurantItemsForEdit(rawOrder) {

    const restaurantId = resolveOrderRestaurantId(rawOrder)

    if (!restaurantId) {

      setAvailableEditMenuItems([])

      return

    }



    try {

      setLoadingEditMenuItems(true)

      const response = await restaurantAPI.getMenuByRestaurantId(restaurantId)

      const menu = response?.data?.data?.menu

      setAvailableEditMenuItems(extractMenuItemsForEdit(menu))

    } catch (error) {

      console.warn("Failed to load restaurant menu for order edit:", error)

      setAvailableEditMenuItems([])

    } finally {

      setLoadingEditMenuItems(false)

    }

  }



  const updateEditableQuantity = (key, nextQuantity) => {

    setEditableItems((prev) =>

      prev.map((item) => (item.key === key ? { ...item, quantity: Math.max(1, Number(nextQuantity || 1)) } : item))

    )

  }



  const addMenuItemToEditableOrder = (menuItem) => {

    if (!menuItem?.itemId) return



    setEditableItems((prev) => {

      const existing = prev.find((item) => String(item.itemId) === String(menuItem.itemId))

      if (existing) {

        return prev.map((item) =>

          String(item.itemId) === String(menuItem.itemId)

            ? { ...item, quantity: item.quantity + 1 }

            : item

        )

      }



      return [

        ...prev,

        {

          key: `added-${menuItem.itemId}`,

          itemId: menuItem.itemId,

          name: menuItem.name,

          quantity: 1,

          price: Number(menuItem.price || 0),

          image: menuItem.image || "",

          description: menuItem.description || "",

          isVeg: menuItem.isVeg !== false

        }

      ]

    })

  }



  const handleSaveEditOrder = async () => {

    if (!orderId || !Array.isArray(editableItems) || editableItems.length === 0) return

    if (!canModifyOrder) {

      toast.error('Edit window expired. You can only edit/cancel within 2 minutes.')

      setShowEditDialog(false)

      return

    }



    try {

      setIsEditingOrder(true)

      const payloadItems = editableItems.map((item) => ({

        itemId: item.itemId,

        name: item.name,

        price: Number(item.price || 0),

        quantity: Math.max(1, Number(item.quantity || 1)),

        image: item.image || "",

        description: item.description || "",

        isVeg: item.isVeg !== false

      }))



      const response = await orderAPI.editOrderCart(orderId, payloadItems)

      if (response?.data?.success) {

        const responseData = response?.data?.data || {}

        const requiresAdditionalPayment = Boolean(responseData?.requiresAdditionalPayment)



        if (requiresAdditionalPayment) {

          const razorpay = responseData?.razorpay || {}

          const additionalAmount = Number(responseData?.additionalAmount || 0)



          if (!razorpay?.orderId || !razorpay?.key) {

            throw new Error("Additional payment initialization failed.")

          }



          await new Promise((resolve, reject) => {

            initRazorpayPayment({

              key: razorpay.key,

              amount: razorpay.amount,

              currency: razorpay.currency || "INR",

              order_id: razorpay.orderId,

              name: "MoBasket",

              description: `Additional payment for edited order ${order?.id || orderId}`.trim(),

              prefill: {

                name: profile?.fullName || profile?.name || "",

                email: profile?.email || "",

                contact: (profile?.phone || "").replace(/\D/g, "").slice(-10),

              },

              notes: {

                orderId: String(order?.id || orderId || ""),

                purpose: "order_edit_additional_payment",

              },

              handler: async (paymentResponse) => {

                try {

                  await orderAPI.verifyEditedOrderCartPayment(orderId, {

                    razorpayOrderId: paymentResponse.razorpay_order_id,

                    razorpayPaymentId: paymentResponse.razorpay_payment_id,

                    razorpaySignature: paymentResponse.razorpay_signature,

                  })

                  resolve()

                } catch (verifyError) {

                  reject(verifyError)

                }

              },

              onClose: () => reject(new Error("Payment cancelled")),

              onError: (paymentError) => reject(paymentError),

            })

          })



          toast.success(`Additional payment successful (₹${additionalAmount.toFixed(2)}). Order updated.`)

          setShowEditDialog(false)

          setAvailableEditMenuItems([])

          await handleRefresh()

          return

        }



        toast.success("Order updated successfully")

        setShowEditDialog(false)

        setAvailableEditMenuItems([])

        await handleRefresh()

      } else {

        toast.error(response?.data?.message || "Failed to edit order")

      }

    } catch (err) {

      const backendMessage = err?.response?.data?.message

      const localMessage = err?.message

      if (localMessage === "Payment cancelled") {

        toast.info("Payment cancelled. Edited items were not applied.")

      } else {

        toast.error(backendMessage || localMessage || "Failed to edit order")

      }

    } finally {

      setIsEditingOrder(false)

    }

  }



  const handleConfirmCancel = async () => {

    if (!cancellationReason.trim()) {

      toast.error('Please provide a reason for cancellation');

      return;

    }



    setIsCancelling(true);

    try {

      const response = await orderAPI.cancelOrder(orderId, cancellationReason.trim());

      if (response.data?.success) {

        const paymentMethod = order?.payment?.method || order?.paymentMethod;

        const successMessage = response.data?.message ||

          (paymentMethod === 'cash' || paymentMethod === 'cod'

            ? 'Order cancelled successfully. No refund required as payment was not made.'

            : 'Order cancelled successfully. Refund will be processed after admin approval.');

        toast.success(successMessage);

        setShowCancelDialog(false);

        setCancellationReason("");

        // Refresh order data

        const orderResponse = await orderAPI.getOrderDetails(orderId);

        if (orderResponse.data?.success && orderResponse.data.data?.order) {

          const apiOrder = orderResponse.data.data.order;

          setOrder(apiOrder);

          // Update orderStatus to cancelled

          if (apiOrder.status === 'cancelled') {

            setOrderStatus('cancelled');

            setModificationWindowSeconds(0)

          }

        }

      } else {

        toast.error(response.data?.message || 'Failed to cancel order');

      }

    } catch (error) {

      console.error('Error cancelling order:', error);

      toast.error(error.response?.data?.message || 'Failed to cancel order');

    } finally {

      setIsCancelling(false);

    }

  };



  const handleRefresh = async () => {

    setIsRefreshing(true)

    try {

      const response = await orderAPI.getOrderDetails(orderId)

      if (response.data?.success && response.data.data?.order) {

        const apiOrder = response.data.data.order



        // Extract restaurant location coordinates with multiple fallbacks

        let restaurantCoords = null;

        let restaurantDetails = null;



        // Priority 1: restaurantId.location.coordinates (GeoJSON format: [lng, lat])

        if (apiOrder.restaurantId?.location?.coordinates &&

          Array.isArray(apiOrder.restaurantId.location.coordinates) &&

          apiOrder.restaurantId.location.coordinates.length >= 2) {

          restaurantCoords = apiOrder.restaurantId.location.coordinates;

        }

        // Priority 2: restaurantId.location with latitude/longitude properties

        else if (apiOrder.restaurantId?.location?.latitude && apiOrder.restaurantId?.location?.longitude) {

          restaurantCoords = [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude];

        }

        // Priority 3: Check nested restaurant data

        else if (apiOrder.restaurant?.location?.coordinates) {

          restaurantCoords = apiOrder.restaurant.location.coordinates;

        }

        // Priority 4: Check if restaurantId is a string ID and fetch restaurant details

        else if (typeof apiOrder.restaurantId === 'string') {

          try {

            const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);

            if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {

              const restaurant = restaurantResponse.data.data.restaurant;

              restaurantDetails = restaurant;

              if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {

                restaurantCoords = restaurant.location.coordinates;

              }

            }

          } catch (err) {

            console.error('❌ Error fetching restaurant details:', err);

          }

        }



        const resolvedRestaurantAddress = resolveRestaurantAddress(apiOrder, restaurantDetails);

        const resolvedRestaurantPhone = resolveRestaurantPhone(apiOrder, restaurantDetails);



        const transformedOrder = {

          id: apiOrder.orderId || apiOrder._id,

          restaurant: resolveRestaurantName(apiOrder),

          restaurantPhone: resolvedRestaurantPhone,

          restaurantAddress: resolvedRestaurantAddress || "",

          restaurantId: apiOrder.restaurantId || null, // Include restaurantId for location access

          userId: apiOrder.userId || null, // Include user data for phone number

          userName: apiOrder.userName || apiOrder.userId?.name || apiOrder.userId?.fullName || '',

          userPhone: apiOrder.userPhone || apiOrder.userId?.phone || '',

          address: {

            street: apiOrder.address?.street || '',

            city: apiOrder.address?.city || '',

            state: apiOrder.address?.state || '',

            zipCode: apiOrder.address?.zipCode || '',

            additionalDetails: apiOrder.address?.additionalDetails || '',

            formattedAddress: apiOrder.address?.formattedAddress ||

              (apiOrder.address?.street && apiOrder.address?.city

                ? `${apiOrder.address.street}${apiOrder.address.additionalDetails ? `, ${apiOrder.address.additionalDetails}` : ''}, ${apiOrder.address.city}${apiOrder.address.state ? `, ${apiOrder.address.state}` : ''}${apiOrder.address.zipCode ? ` ${apiOrder.address.zipCode}` : ''}`

                : apiOrder.address?.city || ''),

            coordinates: apiOrder.address?.location?.coordinates || null

          },

          restaurantLocation: {

            coordinates: restaurantCoords,

            formattedAddress: resolvedRestaurantAddress || "",

            address: resolvedRestaurantAddress || ""

          },

          items: apiOrder.items?.map(item => ({

            itemId: item.itemId?._id || item.itemId || item._id || null,

            name: item.name,

            quantity: item.quantity,

            price: item.price,

            image: item.image || "",

            description: item.description || "",

            isVeg: item.isVeg !== false

          })) || [],

          total: apiOrder.pricing?.total || 0,

          status: apiOrder.status || 'pending',

          createdAt: apiOrder.createdAt || null,

          payment: apiOrder.payment || {

            method: response?.data?.data?.payment?.method || null,

            status: response?.data?.data?.payment?.status || null

          },

          eta: apiOrder.eta || null,

          estimatedDeliveryTime: Number(apiOrder.estimatedDeliveryTime || 0),

          preparationTime: Number(apiOrder.preparationTime || 0),

          adminApproval: apiOrder.adminApproval || null,

          planSubscription: apiOrder.planSubscription || null,

          note: apiOrder.note || "",

          deliveryPartner: toValidDeliveryPartner(apiOrder.deliveryPartnerId),

          deliveryPartnerId: apiOrder.deliveryPartnerId?._id || apiOrder.deliveryPartnerId || apiOrder.assignmentInfo?.deliveryPartnerId || null,

          assignmentInfo: apiOrder.assignmentInfo || null,

          deliveryState: apiOrder.deliveryState || null,

          tracking: apiOrder.tracking || {},

          modificationWindow: apiOrder.modificationWindow || null

        }

        setOrder(transformedOrder)

        const etaFromOrder = getCombinedEtaMinutes(transformedOrder)

        if (etaFromOrder) setEstimatedTime(etaFromOrder)

        setOrderStatus(deriveUiOrderStatus(apiOrder.status, apiOrder))

        syncModificationWindow(apiOrder)

      }

    } catch (err) {
      if (err?.response?.status === 404) {
        setOrder(null)
        setError('This order is no longer available. It may have been deleted by the admin.')
      } else {
        console.error('Error refreshing order:', err)
      }
    } finally {
      setIsRefreshing(false)
    }
  }



  const isDeliveryCompleted =
    orderStatus === "delivered" ||
    String(order?.status || "").toLowerCase() === "delivered" ||
    String(order?.status || "").toLowerCase() === "completed" ||
    String(order?.deliveryState?.status || "").toLowerCase() === "delivered" ||
    String(order?.deliveryState?.currentPhase || "").toLowerCase() === "completed"

  const shouldBackToHome = isDeliveryCompleted

  useEffect(() => {
    if (!shouldBackToHome) return

    const handlePopState = () => {
      navigate("/home", { replace: true })
    }

    window.addEventListener("popstate", handlePopState)
    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [shouldBackToHome, navigate])

  // Loading state
  if (loading) {

    return (

      <AnimatedPage className="min-h-screen bg-gray-50 p-4 dark:bg-[#0a0a0a] dark:text-gray-100">

        <div className="max-w-lg mx-auto text-center py-20">

          <Loader2 className="w-8 h-8 animate-spin text-gray-600 mx-auto mb-4 dark:text-gray-400" />

          <p className="text-gray-600 dark:text-gray-400">Loading order details...</p>

        </div>

      </AnimatedPage>

    )

  }



  // Error state

  if (error || !order) {

    return (

      <AnimatedPage className="min-h-screen bg-gray-50 p-4 dark:bg-[#0a0a0a] dark:text-gray-100">

        <div className="max-w-lg mx-auto text-center py-20">

          <h1 className="text-lg sm:text-xl md:text-2xl font-bold mb-4">Order Not Found</h1>

          <p className="text-gray-600 mb-6 dark:text-gray-400">{error || 'The order you\'re looking for doesn\'t exist.'}</p>

          <Link to={shouldBackToHome ? "/home" : "/orders"} replace>
            <Button>Back to Orders</Button>

          </Link>

        </div>

      </AnimatedPage>

    )

  }



  const isRiderHeadingToPickup = order?.deliveryState?.status === "accepted" ||

    order?.deliveryState?.status === "reached_pickup" ||

    order?.deliveryState?.currentPhase === "en_route_to_pickup" ||

    order?.deliveryState?.currentPhase === "at_pickup"

  const isPlanSubscriptionOrder = isMoGroceryPlanOrder(order)

  const purchasedPlanName = order?.planSubscription?.planName || order?.items?.[0]?.name || "MoGrocery Plan"

  const purchasedPlanDurationDays = Number(order?.planSubscription?.durationDays || 0)

  const purchasedPlanOfferCount = Array.isArray(order?.planSubscription?.selectedOfferIds)

    ? order.planSubscription.selectedOfferIds.length

    : 0

  const isPendingGroceryAdminAcceptance = isAwaitingGroceryAdminAcceptance(order)



  const statusConfig = {

    placed: {

      title: isPendingGroceryAdminAcceptance ? "Yet to accept" : "Order placed",

      subtitle: isPendingGroceryAdminAcceptance ? "Awaiting grocery admin acceptance" : "Food preparation will begin shortly",

      color: "bg-green-700"

    },

    preparing: {

      title: isPendingGroceryAdminAcceptance

        ? "Yet to accept"

        : isRiderHeadingToPickup

          ? "Delivery partner is heading to pickup"

          : "Preparing your order",

      subtitle: isPendingGroceryAdminAcceptance

        ? "Awaiting grocery admin acceptance"

        : isRiderHeadingToPickup

          ? "Restaurant is handing over your order"

          : `Arriving in ${estimatedTime} mins`,

      color: "bg-green-700"

    },

    pickup: {

      title: "Order picked up",

      subtitle: `Arriving in ${estimatedTime} mins`,

      color: "bg-green-700"

    },

    delivered: {

      title: "Order delivered",

      subtitle: "Enjoy your meal!",

      color: "bg-green-600"

    },

    cancelled: {

      title: "Order cancelled",

      subtitle: "This order has been cancelled",

      color: "bg-red-600"

    }

  }



  const planStatusConfig = {

    title: orderStatus === "cancelled" ? "Plan purchase cancelled" : "Plan Purchased Successfully",

    subtitle:

      orderStatus === "cancelled"

        ? "This plan purchase has been cancelled"

        : "Your plan benefits are now active for this account",

    color: orderStatus === "cancelled" ? "bg-red-600" : "bg-green-700"

  }



  const currentStatus = isPlanSubscriptionOrder
    ? planStatusConfig
    : (statusConfig[orderStatus] || statusConfig.placed)


  return (

    <div className="min-h-screen bg-gray-100 text-gray-900 dark:bg-[#0a0a0a] dark:text-gray-100">

      {/* Order Confirmed Modal */}

      <AnimatePresence>

        {showConfirmation && (

          <motion.div

            initial={{ opacity: 0 }}

            animate={{ opacity: 1 }}

            exit={{ opacity: 0 }}

            className="fixed inset-0 z-50 bg-white dark:bg-[#1a1a1a] flex flex-col items-center justify-center"

          >

            <motion.div

              initial={{ scale: 0.8, opacity: 0 }}

              animate={{ scale: 1, opacity: 1 }}

              transition={{ delay: 0.2, type: "spring" }}

              className="text-center px-8"

            >

              <AnimatedCheckmark delay={0.3} />

              <motion.h1

                initial={{ opacity: 0, y: 20 }}

                animate={{ opacity: 1, y: 0 }}

                transition={{ delay: 0.9 }}

              className="text-2xl font-bold text-gray-900 mt-6 dark:text-gray-100"

              >

                {isPlanSubscriptionOrder ? "Plan Purchased!" : "Order Confirmed!"}

              </motion.h1>

              <motion.p

                initial={{ opacity: 0, y: 20 }}

                animate={{ opacity: 1, y: 0 }}

                transition={{ delay: 1.1 }}

                className="text-gray-600 mt-2 dark:text-gray-300"

              >

                {isPlanSubscriptionOrder

                  ? "Your plan has been activated successfully"

                  : "Your order has been placed successfully"}

              </motion.p>

              <motion.div

                initial={{ opacity: 0 }}

                animate={{ opacity: 1 }}

                transition={{ delay: 1.5 }}

                className="mt-8"

              >

                <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />

                <p className="text-sm text-gray-500 mt-3 dark:text-gray-400">Loading order details...</p>

              </motion.div>

            </motion.div>

          </motion.div>

        )}

      </AnimatePresence>



      {/* Green Header */}

      <div className={`${currentStatus.color} text-white sticky top-0 z-40`}>

        {/* Navigation bar */}

        <div className="flex items-center justify-between px-4 py-3">

          <Link to={shouldBackToHome ? "/home" : "/orders"} replace>
            <motion.button

              className="w-10 h-10 flex items-center justify-center"

              whileTap={{ scale: 0.9 }}

            >

              <ArrowLeft className="w-6 h-6" />

            </motion.button>

          </Link>

          <h2 className="font-semibold text-lg">{restaurantDisplayName}</h2>

          <div className="w-10 h-10" />

        </div>



        {/* Status section */}

        <div className="px-4 pb-4 text-center">

          <motion.h1

            className="text-2xl font-bold mb-3"

            key={currentStatus.title}

            initial={{ opacity: 0, y: -10 }}

            animate={{ opacity: 1, y: 0 }}

          >

            {currentStatus.title}

          </motion.h1>



          {/* Status pill */}

          <motion.div

            className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2"

            initial={{ scale: 0.9, opacity: 0 }}

            animate={{ scale: 1, opacity: 1 }}

            transition={{ delay: 0.2 }}

          >

            <span className="text-sm">{currentStatus.subtitle}</span>

            {!isPlanSubscriptionOrder && orderStatus === 'preparing' && (

              <>

                <span className="w-1 h-1 rounded-full bg-white" />

                <span className="text-sm text-green-200">On time</span>

              </>

            )}

            {!isPlanSubscriptionOrder && driverDistanceKm != null && (orderStatus === 'pickup' || order?.status === 'out_for_delivery') && (

              <>

                <span className="w-1 h-1 rounded-full bg-white" />

                <span className="text-sm text-green-200">

                  Driver {driverDistanceKm < 1 ? `${Math.round(driverDistanceKm * 1000)} m` : `${driverDistanceKm.toFixed(1)} km`} away

                </span>

              </>

            )}

            <motion.button

              onClick={handleRefresh}

              className="ml-1"

              animate={{ rotate: isRefreshing ? 360 : 0 }}

              transition={{ duration: 0.5 }}

            > 

              <RefreshCw className="w-4 h-4" />

            </motion.button>

          </motion.div>

          {!isPlanSubscriptionOrder && (

            <div className="mt-2 text-xs text-white/90 font-medium">

              {canModifyOrder

                ? `Edit/Cancel window: ${formatCountdown(modificationWindowSeconds)}`

                : "Edit/Cancel window expired"}

            </div>

          )}

        </div>

      </div>



      {/* Map Section */}

      {!isPlanSubscriptionOrder && !isDeliveryCompleted && (
        <DeliveryMap

          orderId={orderId}

          order={order}

          isVisible={!showConfirmation && order !== null}

          userLiveCoords={userLiveCoords}

          userLocationAccuracy={null}

        />

      )}



      {/* Scrollable Content */}

      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 space-y-4 md:space-y-6 pb-24 md:pb-32">

        {isPlanSubscriptionOrder ? (

          <motion.div

            className="bg-white rounded-xl p-5 shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10"

            initial={{ opacity: 0, y: 20 }}

            animate={{ opacity: 1, y: 0 }}

          >

            <div className="flex items-center gap-3 mb-3">

              <Check className="w-6 h-6 text-green-600" />

              <p className="font-semibold text-gray-900 dark:text-gray-100">Plan activated for your account</p>

            </div>

            <p className="text-sm text-gray-600 mb-2 dark:text-gray-400">

              {purchasedPlanName}

            </p>

            {purchasedPlanDurationDays > 0 && (

              <p className="text-sm text-gray-600 mb-1 dark:text-gray-400">

                Validity: {purchasedPlanDurationDays} day{purchasedPlanDurationDays === 1 ? "" : "s"}

              </p>

            )}

            <p className="text-sm text-gray-600 dark:text-gray-400">

              {purchasedPlanOfferCount > 0

                ? `${purchasedPlanOfferCount} plan offer${purchasedPlanOfferCount === 1 ? "" : "s"} linked to this user and will apply on eligible MoGrocery orders.`

                : "Plan benefits are linked to this user and will auto-apply on eligible MoGrocery orders."}

            </p>

          </motion.div>

        ) : (

          <>

            {/* Food Cooking Status - Show until delivery partner accepts pickup */}

            {(() => {

              // Check if delivery partner has accepted pickup

              // Delivery partner accepts when status is 'ready' or 'out_for_delivery' or tracking shows outForDelivery

              const hasAcceptedPickup =

                order?.tracking?.outForDelivery?.status === true ||

                order?.tracking?.out_for_delivery?.status === true ||

                order?.status === 'out_for_delivery' ||

                order?.status === 'ready' ||

                order?.deliveryState?.status === 'order_confirmed' ||

                order?.deliveryState?.status === 'en_route_to_delivery' ||

                order?.deliveryState?.currentPhase === 'en_route_to_delivery'



              // Show "Food is Cooking" until delivery partner accepts pickup

              if (!hasAcceptedPickup) {

                return (

                  <motion.div

                    className="bg-white rounded-xl p-4 shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10"

                    initial={{ opacity: 0, y: 20 }}

                    animate={{ opacity: 1, y: 0 }}

                    transition={{ delay: 0.3 }}

                  >

                    <div className="flex items-center gap-3">

                      <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center overflow-hidden dark:bg-orange-500/20">

                        <img

                          src={circleIcon}

                          alt="Food cooking"

                          className="w-full h-full object-cover"

                        />

                      </div>

                      <p className="font-semibold text-gray-900 dark:text-gray-100">

                        {isPendingGroceryAdminAcceptance ? "Yet to accept by grocery admin" : "Food is Cooking"}

                      </p>

                    </div>

                  </motion.div>

                )

              }



              // Don't show card if delivery partner has accepted pickup

              return null

            })()}



            {/* Delivery Partner Safety */}

            {/* <motion.button

          className="w-full bg-white rounded-xl p-4 shadow-sm flex items-center gap-3"

          initial={{ opacity: 0, y: 20 }}

          animate={{ opacity: 1, y: 0 }}

          transition={{ delay: 0.6 }}

          whileTap={{ scale: 0.99 }}

        >

          <Shield className="w-6 h-6 text-gray-600" />

          <span className="flex-1 text-left font-medium text-gray-900">

            Learn about delivery partner safety

          </span>

          <ChevronRight className="w-5 h-5 text-gray-400" />

        </motion.button>


 */}
            {/* Delivery Details Banner */}

            {!isDeliveryCompleted && (
              <motion.div
                className="bg-yellow-50 rounded-xl p-4 text-center dark:bg-yellow-500/10"

                initial={{ opacity: 0, y: 20 }}

                animate={{ opacity: 1, y: 0 }}

                transition={{ delay: 0.65 }}

              >

                <p className="text-yellow-800 font-medium dark:text-yellow-200">

                  {driverDistanceKm != null && (orderStatus === 'pickup' || order?.status === 'out_for_delivery')

                    ? `Driver is ${driverDistanceKm < 1 ? `${Math.round(driverDistanceKm * 1000)} m` : `${driverDistanceKm.toFixed(1)} km`} from your location`

                    : 'All your delivery details in one place 👇'}

                </p>

              </motion.div>
            )}


            {/* Contact & Address Section */}

            <motion.div

              className="bg-white rounded-xl shadow-sm overflow-hidden dark:bg-[#151a23] dark:border dark:border-white/10"

              initial={{ opacity: 0, y: 20 }}

              animate={{ opacity: 1, y: 0 }}

              transition={{ delay: 0.7 }}

            >

              <div className="p-4 border-b border-dashed border-gray-200 dark:border-white/10">

                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3 dark:text-gray-400">

                  Delivery Partner Details

                </p>

                <div className="flex items-center gap-3">

                  <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 dark:bg-green-500/20">

                    <Phone className="w-5 h-5 text-green-700" />

                  </div>

                  <div className="flex-1 min-w-0">

                    <p className="font-semibold text-gray-900 truncate dark:text-gray-100">

                      {hasAssignedRider
                        ? (riderInfo?.name || "Delivery partner assigned")
                        : "Assigning delivery partner..."}
                    </p>

                    <p className="text-sm text-gray-500 truncate dark:text-gray-400">

                      {hasAssignedRider
                        ? (riderInfo?.phone || "Phone number not available")
                        : "Phone number not available"}
                    </p>

                  </div>

                  <motion.button

                    className={`w-10 h-10 rounded-full flex items-center justify-center ${riderDialNumber ? "bg-green-600 text-white" : "bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-500"

                      }`}

                    whileTap={{ scale: 0.92 }}

                    onClick={() => {

                      if (riderDialNumber) {

                        window.location.href = `tel:${riderDialNumber}`

                      } else {

                        toast.error("Delivery partner phone number not available")

                      }

                    }}

                  >

                    <Phone className="w-4 h-4" />

                  </motion.button>

                </div>

              </div>

              <SectionItem

                icon={HomeIcon}

                title="Delivery at Location"

                subtitle={deliveryAddressDisplay}

                showArrow={false}

              />

            </motion.div>

          </>

        )}



        {/* Restaurant Section */}

        <motion.div

          className="bg-white rounded-xl shadow-sm overflow-hidden dark:bg-[#151a23] dark:border dark:border-white/10"

          initial={{ opacity: 0, y: 20 }}

          animate={{ opacity: 1, y: 0 }}

          transition={{ delay: 0.75 }}

        >

          <div className="flex items-center gap-3 p-4 border-b border-dashed border-gray-200 dark:border-white/10">

            <div className="w-12 h-12 rounded-full bg-orange-100 overflow-hidden flex items-center justify-center dark:bg-orange-500/20">

              <span className="text-2xl">🍔</span>

            </div>

            <div className="flex-1">

              <p className="font-semibold text-gray-900 dark:text-gray-100">{isPlanSubscriptionOrder ? purchasedPlanName : restaurantDisplayName}</p>

              {restaurantDisplayPhone ? (

                <p className="text-xs text-gray-500 dark:text-gray-400">{restaurantDisplayPhone}</p>

              ) : null}

              <p className="text-sm text-gray-500 dark:text-gray-400">

                {isPlanSubscriptionOrder

                  ? "Plan purchase receipt"

                  : restaurantAddressDisplay}

              </p>

            </div>

            {!isPlanSubscriptionOrder && (

              <motion.button

                className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center dark:bg-green-500/20"

                whileTap={{ scale: 0.9 }}

                onClick={() => {

                  const restaurantPhone =

                    restaurantDisplayPhone ||

                    order?.restaurantId?.phone ||

                    order?.restaurantId?.ownerPhone ||

                    order?.restaurantId?.primaryContactNumber ||

                    ""

                  const dialNumber = sanitizePhoneForTel(restaurantPhone)

                  if (dialNumber) {

                    window.location.href = `tel:${dialNumber}`

                  } else {

                    toast.error("Restaurant phone number not available")

                  }

                }}

              >

                <Phone className="w-5 h-5 text-green-700 dark:text-green-300" />

              </motion.button>

            )}

          </div>



          {/* Order Items */}

          <div className="p-4 border-b border-dashed border-gray-200 dark:border-white/10">

            <button

              type="button"

              onClick={handleViewOrderDetails}

              className="w-full flex items-start gap-3 text-left"

            >

              <Receipt className="w-5 h-5 text-gray-500 mt-0.5 dark:text-gray-400" />

              <div className="flex-1">

                <p className="font-medium text-gray-900 dark:text-gray-100">Order #{order?.id || order?.orderId || 'N/A'}</p>

                <div className="mt-2 space-y-1">

                  {order?.items?.map((item, index) => (

                    <div key={index} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">

                      <span className="w-4 h-4 rounded border border-green-600 flex items-center justify-center">

                        <span className="w-2 h-2 rounded-full bg-green-600" />

                      </span>

                      <span>{item.quantity} x {item.name}</span>

                    </div>

                  ))}

                </div>

              </div>

              <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />

            </button>

          </div>

        </motion.div>

        {!isPlanSubscriptionOrder && String(order?.status || "").toLowerCase() !== "cancelled" && (

        <motion.div

            className="bg-white rounded-xl shadow-sm overflow-hidden dark:bg-[#151a23] dark:border dark:border-white/10"

            initial={{ opacity: 0, y: 20 }}

            animate={{ opacity: 1, y: 0 }}

            transition={{ delay: 0.8 }}

          >

            <SectionItem

              icon={Receipt}

              title="Edit order"

              subtitle={

                canModifyOrder

                  ? `Available for ${formatCountdown(modificationWindowSeconds)}`

                  : "Edit window expired"

              }

              onClick={handleEditOrder}

            />

            <SectionItem

              icon={CircleSlash}

              title="Cancel order"

              subtitle={

                canModifyOrder

                  ? `Available for ${formatCountdown(modificationWindowSeconds)}`

                  : "Cancel window expired"

              }

              onClick={handleCancelOrder}

            />

          </motion.div>

        )}

      </div>



      {/* Cancel Order Dialog */}

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>

        <DialogContent className="sm:max-w-xl w-[95%] max-w-[600px] dark:bg-[#151a23] dark:border dark:border-white/10">

          <DialogHeader>

            <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">

              Cancel Order

            </DialogTitle>
            <DialogDescription className="sr-only">
              Provide a reason before confirming order cancellation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-6 px-2">

            <div className="space-y-2 w-full">

              <Textarea

                value={cancellationReason}

                onChange={(e) => setCancellationReason(e.target.value)}

                placeholder="e.g., Changed my mind, Wrong address, etc."

                className="w-full min-h-[100px] resize-none border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200 dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-red-500/20 dark:disabled:bg-white/5 dark:disabled:border-white/10"

                disabled={isCancelling}

              />

            </div>

            <div className="flex gap-3 pt-2">

              <Button

                variant="outline"

                onClick={() => {

                  setShowCancelDialog(false);

                  setCancellationReason("");

                }}

                disabled={isCancelling}

                className="flex-1 dark:border-white/10 dark:text-gray-100"

              >

                Cancel

              </Button>

              <Button

                onClick={handleConfirmCancel}

                disabled={isCancelling || !cancellationReason.trim()}

                className="flex-1 bg-red-600 hover:bg-red-700 text-white"

              >

                {isCancelling ? (

                  <>

                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />

                    Cancelling...

                  </>

                ) : (

                  'Confirm Cancellation'

                )}

              </Button>

            </div>

          </div>

        </DialogContent>

      </Dialog>



      <Dialog

        open={showEditDialog}

        onOpenChange={(open) => {

          setShowEditDialog(open)

          if (!open) {

            setAvailableEditMenuItems([])

          }

        }}

      >

        <DialogContent className="sm:max-w-xl w-[95%] max-w-[600px] dark:bg-[#151a23] dark:border dark:border-white/10">

          <DialogHeader>

            <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">

              Edit Order

            </DialogTitle>

          </DialogHeader>

          <div className="space-y-4 py-4">

            <p className="text-sm text-gray-600 dark:text-gray-400">

              {canModifyOrder

                ? `You can edit quantities for ${formatCountdown(modificationWindowSeconds)}`

                : "Edit window expired"}

            </p>

            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">

              {editableItems.map((item) => (

                <div key={item.key} className="flex items-center justify-between border rounded-lg p-3 dark:border-white/10 dark:bg-[#0f172a]">

                  <div className="min-w-0 pr-3">

                    <p className="font-medium text-sm text-gray-900 truncate dark:text-gray-100">{item.name}</p>

                    <p className="text-xs text-gray-500 dark:text-gray-400">Rs {Number(item.price || 0).toFixed(2)}</p>

                  </div>

                  <div className="flex items-center gap-2">

                    <Button

                      type="button"

                      variant="outline"

                      size="sm"

                      disabled={!canModifyOrder || isEditingOrder || item.quantity <= 1}

                      onClick={() => updateEditableQuantity(item.key, item.quantity - 1)}

                    >

                      -

                    </Button>

                    <span className="w-8 text-center font-semibold text-sm dark:text-gray-100">{item.quantity}</span>

                    <Button

                      type="button"

                      variant="outline"

                      size="sm"

                      disabled={!canModifyOrder || isEditingOrder}

                      onClick={() => updateEditableQuantity(item.key, item.quantity + 1)}

                    >

                      +

                    </Button>

                  </div>

                </div>

              ))}

            </div>

            <div className="space-y-2 border rounded-lg p-3 dark:border-white/10 dark:bg-[#0f172a]">

              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">

                Add more from this restaurant

              </p>

              {loadingEditMenuItems ? (

                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">

                  <Loader2 className="w-4 h-4 animate-spin" />

                  Loading items...

                </div>

              ) : availableEditMenuItems.length === 0 ? (

                <p className="text-xs text-gray-500 dark:text-gray-400">No additional items available right now.</p>

              ) : (

                <div className="max-h-44 overflow-y-auto space-y-2 pr-1">

                  {availableEditMenuItems.map((item) => (

                    <div key={`menu-${item.itemId}`} className="flex items-center justify-between rounded-md border p-2 dark:border-white/10 dark:bg-[#0b1220]">

                      <div className="min-w-0 pr-2">

                        <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">{item.name}</p>

                        <p className="text-xs text-gray-500 dark:text-gray-400">Rs {Number(item.price || 0).toFixed(2)}</p>

                      </div>

                      <Button

                        type="button"

                        size="sm"

                        variant="outline"

                        disabled={!canModifyOrder || isEditingOrder}

                        onClick={() => addMenuItemToEditableOrder(item)}
                        className="dark:border-white/10 dark:text-gray-100"

                      >

                        Add

                      </Button>

                    </div>

                  ))}

                </div>

              )}

            </div>

            <div className="flex gap-3 pt-1">

              <Button

                type="button"

                variant="outline"

                className="flex-1 dark:border-white/10 dark:text-gray-100"

                onClick={() => setShowEditDialog(false)}

                disabled={isEditingOrder}

              >

                Close

              </Button>

              <Button

                type="button"

                className="flex-1"

                onClick={handleSaveEditOrder}

                disabled={isEditingOrder || !canModifyOrder}

              >

                {isEditingOrder ? "Saving..." : "Save changes"}

              </Button>

            </div>

          </div>

        </DialogContent>

      </Dialog>

    </div>

  )

}


