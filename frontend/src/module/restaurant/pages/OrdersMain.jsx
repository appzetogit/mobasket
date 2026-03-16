import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { checkOnboardingStatus } from "../utils/onboardingUtils"
import { checkGroceryStoreOnboardingStatus } from "@/module/grocery-store/utils/onboardingUtils"
import { motion, AnimatePresence } from "framer-motion"
import Lenis from "lenis"
import { Printer, Volume2, VolumeX, ChevronDown, ChevronUp, ChevronRight, Minus, Plus, X, AlertCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import BottomNavOrders from "../components/BottomNavOrders"
import RestaurantNavbar from "../components/RestaurantNavbar"
import notificationSound from "@/assets/audio/alert.mp3"
import { restaurantAPI, groceryStoreAPI } from "@/lib/api"
import { useRestaurantNotifications } from "../hooks/useRestaurantNotifications"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

const STORAGE_KEY = "restaurant_online_status"
const ACTIVE_FILTER_STORAGE_KEY = "restaurant_orders_active_filter"
const ACCEPT_SLIDE_HANDLE_WIDTH = 52
const ACCEPT_SLIDE_TRIGGER_RATIO = 0.32
const ACCEPT_SLIDE_VELOCITY_TRIGGER = 0.45 // px/ms
const ACCEPT_SLIDE_MIN_PROGRESS_FOR_FLICK = 0.18
const ACCEPT_REQUEST_TIMEOUT_MS = 45000

const isCodLikePaymentMethod = (value) => {
  const method = String(value || "").toLowerCase().trim()
  return (
    method === "cash" ||
    method === "cod" ||
    method === "cash_on_delivery" ||
    method.includes("cash") ||
    method.includes("cod")
  )
}

// Top filter tabs
const filterTabs = [
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "out-for-delivery", label: "Out for delivery" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
]

const formatOrderStatusLabel = (status) => {
  const normalizedStatus = String(status || "").trim().toLowerCase()

  switch (normalizedStatus) {
    case "out_for_delivery":
    case "out-for-delivery":
      return "Out for delivery"
    case "delivered":
    case "completed":
      return "Delivered"
    case "cancelled":
      return "Cancelled"
    case "ready":
      return "Ready"
    case "preparing":
      return "Preparing"
    case "scheduled":
      return "Scheduled"
    default:
      return String(status || "").trim() || "Unknown"
  }
}

// Completed Orders List Component
function CompletedOrders({ onSelectOrder, orderAPI, searchQuery = "", refreshTick = 0 }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders
    const query = searchQuery.toLowerCase().trim()
    return orders.filter(order =>
      String(order.orderId || "").toLowerCase().includes(query)
    )
  }, [orders, searchQuery])

  useEffect(() => {
    let isMounted = true
    let intervalId = null

    const fetchOrders = async () => {
      try {
        const response = await orderAPI.getOrders()

        if (!isMounted) return

        if (response.data?.success && response.data.data?.orders) {
          const completedOrders = response.data.data.orders.filter(
            order => order.status === 'delivered' || order.status === 'completed'
          )

          const transformedOrders = completedOrders.map(order => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || 'delivered',
            customerName: order.userId?.name || 'Customer',
            type: order.deliveryFleet === 'standard' ? 'Home Delivery' : 'Express Delivery',
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            deliveredAt: order.deliveredAt || order.updatedAt || order.createdAt,
            itemsSummary: order.items?.map(item => `${item.quantity}x ${item.name}`).join(', ') || 'No items',
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || 'Order',
            amount: order.pricing?.total || order.total || 0
          }))

          transformedOrders.sort((a, b) => {
            const dateA = new Date(a.deliveredAt)
            const dateB = new Date(b.deliveredAt)
            return dateB - dateA
          })

          if (isMounted) {
            setOrders(transformedOrders)
            setLoading(false)
          }
        } else {
          if (isMounted) {
            setOrders([])
            setLoading(false)
          }
        }
      } catch (error) {
        if (!isMounted) return

        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          console.error('Error fetching completed orders:', error)
        }

        if (isMounted) {
          setOrders([])
          setLoading(false)
        }
      }
    }

    fetchOrders()
    intervalId = setInterval(() => {
      if (isMounted && !(typeof document !== "undefined" && document.hidden)) {
        fetchOrders()
      }
    }, 10000)

    return () => {
      isMounted = false
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [orderAPI, refreshTick])

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">Completed orders</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">
          Completed orders
        </h2>
        <span className="text-xs text-gray-500">{filteredOrders.length} total</span>
      </div>
      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          {searchQuery ? "No orders match this ID" : "No completed orders yet"}
        </div>
      ) : (
        <div>
          {filteredOrders.map((order) => {
            const deliveredDate = order.deliveredAt
              ? new Date(order.deliveredAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
              : 'N/A'

            return (
              <div key={order.orderId || order.mongoId} className="w-full bg-white rounded-2xl p-4 mb-3 border border-gray-200">
                <button
                  type="button"
                  onClick={() =>
                    onSelectOrder?.({
                      orderId: order.orderId,
                      status: 'Delivered',
                      customerName: order.customerName,
                      type: order.type,
                      tableOrToken: order.tableOrToken,
                      timePlaced: deliveredDate,
                      itemsSummary: order.itemsSummary,
                    })
                  }
                  className="w-full text-left flex gap-3 items-stretch"
                >
                  <div className="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 my-auto">
                    {order.photoUrl ? (
                      <img
                        src={order.photoUrl}
                        alt={order.photoAlt}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center px-2">
                        <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                          {order.photoAlt}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-between min-h-[80px]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-black leading-tight">
                          Order #{order.orderId}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {order.customerName}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border border-green-500 text-green-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Delivered
                        </span>
                        <span className="text-[11px] text-gray-500 text-right">
                          {deliveredDate}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2">
                      <p className="text-xs text-gray-600 line-clamp-1">
                        {order.itemsSummary}
                      </p>
                    </div>

                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-gray-500">
                          {order.type}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[11px] text-gray-500">Amount</span>
                        <span className="text-xs font-medium text-black">
                          ₹{order.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Cancelled Orders List Component
function CancelledOrders({ onSelectOrder, orderAPI, isGroceryStore = false, searchQuery = "", refreshTick = 0 }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders
    const query = searchQuery.toLowerCase().trim()
    return orders.filter(order =>
      String(order.orderId || "").toLowerCase().includes(query)
    )
  }, [orders, searchQuery])

  useEffect(() => {
    let isMounted = true
    let intervalId = null

    const fetchOrders = async () => {
      try {
        const response = await orderAPI.getOrders()

        if (!isMounted) return

        if (response.data?.success && response.data.data?.orders) {
          // Filter cancelled orders (both restaurant and user cancelled)
          const cancelledOrders = response.data.data.orders.filter(
            order => order.status === 'cancelled'
          )

          const transformedOrders = cancelledOrders.map(order => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || 'cancelled',
            customerName: order.userId?.name || 'Customer',
            type: order.deliveryFleet === 'standard' ? 'Home Delivery' : 'Express Delivery',
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            cancelledAt: order.cancelledAt || order.updatedAt || order.createdAt,
            cancelledBy: order.cancelledBy || 'unknown',
            cancellationReason: order.cancellationReason || 'No reason provided',
            itemsSummary: order.items?.map(item => `${item.quantity}x ${item.name}`).join(', ') || 'No items',
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || 'Order',
            amount: order.pricing?.total || order.total || 0
          }))

          transformedOrders.sort((a, b) => {
            const dateA = new Date(a.cancelledAt)
            const dateB = new Date(b.cancelledAt)
            return dateB - dateA
          })

          if (isMounted) {
            setOrders(transformedOrders)
            setLoading(false)
          }
        } else {
          if (isMounted) {
            setOrders([])
            setLoading(false)
          }
        }
      } catch (error) {
        if (!isMounted) return

        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          console.error('Error fetching cancelled orders:', error)
        }

        if (isMounted) {
          setOrders([])
          setLoading(false)
        }
      }
    }

    fetchOrders()
    intervalId = setInterval(() => {
      if (isMounted && !(typeof document !== "undefined" && document.hidden)) {
        fetchOrders()
      }
    }, 10000)

    return () => {
      isMounted = false
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [orderAPI, refreshTick])

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">Cancelled orders</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">
          Cancelled orders
        </h2>
        <span className="text-xs text-gray-500">{filteredOrders.length} total</span>
      </div>
      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          {searchQuery ? "No orders match this ID" : "No cancelled orders yet"}
        </div>
      ) : (
        <div>
          {filteredOrders.map((order) => {
            const cancelledDate = order.cancelledAt
              ? new Date(order.cancelledAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
              : 'N/A'

            const cancelledByText = order.cancelledBy === 'user'
              ? 'Cancelled by User'
              : order.cancelledBy === 'restaurant'
                ? `Cancelled by ${isGroceryStore ? 'Store' : 'Restaurant'}`
                : 'Cancelled'

            return (
              <div key={order.orderId || order.mongoId} className="w-full bg-white rounded-2xl p-4 mb-3 border border-gray-200">
                <button
                  type="button"
                  onClick={() =>
                    onSelectOrder?.({
                      orderId: order.orderId,
                      status: 'Cancelled',
                      customerName: order.customerName,
                      type: order.type,
                      tableOrToken: order.tableOrToken,
                      timePlaced: cancelledDate,
                      itemsSummary: order.itemsSummary,
                    })
                  }
                  className="w-full text-left flex gap-3 items-stretch"
                >
                  <div className="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 my-auto">
                    {order.photoUrl ? (
                      <img
                        src={order.photoUrl}
                        alt={order.photoAlt}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center px-2">
                        <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                          {order.photoAlt}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-between min-h-[80px]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-black leading-tight">
                          Order #{order.orderId}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {order.customerName}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${order.cancelledBy === 'user'
                          ? 'border-orange-500 text-orange-600'
                          : 'border-red-500 text-red-600'
                          }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${order.cancelledBy === 'user' ? 'bg-orange-500' : 'bg-red-500'
                            }`} />
                          {cancelledByText}
                        </span>
                        <span className="text-[11px] text-gray-500 text-right">
                          {cancelledDate}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2">
                      <p className="text-xs text-gray-600 line-clamp-1">
                        {order.itemsSummary}
                      </p>
                      {order.cancellationReason && (
                        <p className="text-[10px] text-red-600 mt-1 line-clamp-1">
                          Reason: {order.cancellationReason}
                        </p>
                      )}
                    </div>

                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-gray-500">
                          {order.type}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-[11px] text-gray-500">Amount</span>
                        <span className="text-xs font-medium text-black">
                          ₹{order.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function OrdersMain() {
  const navigate = useNavigate()
  const location = useLocation()

  // Determine if we're on grocery store route and use appropriate API
  const isGroceryStore = location.pathname.startsWith('/store')
  const [authFailed, setAuthFailed] = useState(false)
  const authFailedRef = useRef(false)

  useEffect(() => {
    authFailedRef.current = authFailed
  }, [authFailed])

  const orderAPI = useMemo(() => {
    const baseOrderAPI = isGroceryStore ? groceryStoreAPI : restaurantAPI
    const accessTokenKey = isGroceryStore ? "grocery-store_accessToken" : "restaurant_accessToken"
    const refreshTokenKey = isGroceryStore ? "grocery-store_refreshToken" : "restaurant_refreshToken"

    const createAuthError = () => {
      const authError = new Error("Authentication required")
      authError.response = {
        status: 401,
        data: { message: "Authentication required" },
      }
      return authError
    }

    return {
      ...baseOrderAPI,
      getOrders: async (params = {}) => {
        if (authFailedRef.current) {
          throw createAuthError()
        }

        const accessToken = localStorage.getItem(accessTokenKey)
        const refreshToken = localStorage.getItem(refreshTokenKey)

        if (!accessToken && !refreshToken) {
          if (!authFailedRef.current) {
            authFailedRef.current = true
            setAuthFailed(true)
          }
          throw createAuthError()
        }

        try {
          return await baseOrderAPI.getOrders(params)
        } catch (error) {
          if (Number(error?.response?.status || 0) === 401) {
            if (!authFailedRef.current) {
              authFailedRef.current = true
              setAuthFailed(true)
            }
          }
          throw error
        }
      },
    }
  }, [isGroceryStore])
  const entityLabel = isGroceryStore ? "store" : "restaurant"
  const EntityLabel = isGroceryStore ? "Store" : "Restaurant"

  const [activeFilter, setActiveFilter] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_FILTER_STORAGE_KEY)
      return filterTabs.some((tab) => tab.id === saved) ? saved : "preparing"
    } catch {
      return "preparing"
    }
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [ordersRefreshTick, setOrdersRefreshTick] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const contentRef = useRef(null)
  const filterBarRef = useRef(null)
  const skipFilterHistoryRef = useRef(false)
  const filterHistoryKey = isGroceryStore ? "storeOrdersFilter" : "restaurantOrdersFilter"
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const touchStartY = useRef(0)
  const isSwiping = useRef(false)
  const mouseStartX = useRef(0)
  const mouseEndX = useRef(0)
  const isMouseDown = useRef(false)

  // New order popup states
  const [showNewOrderPopup, setShowNewOrderPopup] = useState(false)
  const [popupOrder, setPopupOrder] = useState(null) // Store order for popup (from Socket.IO or API)
  const [isMuted, setIsMuted] = useState(false)
  const [prepTime, setPrepTime] = useState(11)
  const [countdown, setCountdown] = useState(240) // 4 minutes in seconds
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true)
  const [showRejectPopup, setShowRejectPopup] = useState(false)
  const [showAcceptConfirmPopup, setShowAcceptConfirmPopup] = useState(false)
  const [acceptSlideOffset, setAcceptSlideOffset] = useState(0)
  const [isAcceptSliding, setIsAcceptSliding] = useState(false)
  const [isAcceptProcessing, setIsAcceptProcessing] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [showCancelPopup, setShowCancelPopup] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [orderToCancel, setOrderToCancel] = useState(null)
  const audioRef = useRef(null)
  const shownOrdersRef = useRef(new Set()) // Track orders already shown in popup
  const showNewOrderPopupRef = useRef(showNewOrderPopup)
  const acceptSlideTrackRef = useRef(null)
  const acceptSlideStartXRef = useRef(0)
  const acceptSlideStartOffsetRef = useRef(0)
  const acceptSlideOffsetRef = useRef(0)
  const acceptSlidePendingOffsetRef = useRef(0)
  const acceptSlideRafRef = useRef(null)
  const acceptSlideLastMoveXRef = useRef(0)
  const acceptSlideLastMoveAtRef = useRef(0)
  const acceptSlideVelocityRef = useRef(0)
  const acceptSlideMovedRef = useRef(false)
  const acceptSlidePointerIdRef = useRef(null)
  const [restaurantStatus, setRestaurantStatus] = useState({
    isActive: null,
    isAcceptingOrders: null,
    rejectionReason: null,
    onboarding: null,
    isLoading: true
  })
  const [isReverifying, setIsReverifying] = useState(false)
  const completedOnboardingSteps = Number(restaurantStatus.onboarding?.completedSteps || 0)
  const normalizedVerificationStatus = String(restaurantStatus.status || "").trim().toLowerCase()
  const hasCompletedVerificationSubmission = isGroceryStore
    ? completedOnboardingSteps >= 1
    : completedOnboardingSteps === 4 || (normalizedVerificationStatus && normalizedVerificationStatus !== "onboarding")
  const hasRejectedVerification = Boolean(
    String(restaurantStatus.rejectionReason || "").trim()
  )
  const canAccessLiveOrders =
    restaurantStatus.isActive === true && restaurantStatus.isAcceptingOrders !== false
  const shouldShowVerificationState =
    !restaurantStatus.isLoading &&
    (hasCompletedVerificationSubmission || hasRejectedVerification) &&
    restaurantStatus.isActive !== true

  useEffect(() => {
    if (!authFailed) return
    navigate(isGroceryStore ? "/store/login" : "/restaurant/login", { replace: true })
  }, [authFailed, isGroceryStore, navigate])

  useEffect(() => {
    const isAnyModalOpen =
      showNewOrderPopup || showRejectPopup || (showCancelPopup && !!orderToCancel)

    if (!isAnyModalOpen) return

    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyTouchAction = document.body.style.touchAction

    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    document.body.style.touchAction = "none"

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.touchAction = previousBodyTouchAction
    }
  }, [showNewOrderPopup, showRejectPopup, showCancelPopup, orderToCancel])

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_FILTER_STORAGE_KEY, activeFilter)
    } catch {
      // Ignore storage errors and continue using in-memory state.
    }
  }, [activeFilter])

  useEffect(() => {
    if (typeof window === "undefined") return
    const currentUrl = window.location.pathname + window.location.search
    const currentState = window.history.state || {}
    if (currentState?.[filterHistoryKey] === undefined) {
      window.history.replaceState(
        { ...currentState, [filterHistoryKey]: "preparing" },
        "",
        currentUrl
      )
    }
  }, [filterHistoryKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (skipFilterHistoryRef.current) {
      skipFilterHistoryRef.current = false
      return
    }

    const currentUrl = window.location.pathname + window.location.search
    const currentState = window.history.state || {}
    const currentValue = currentState?.[filterHistoryKey]

    if (activeFilter === "preparing") {
      if (currentValue !== "preparing") {
        window.history.replaceState(
          { ...currentState, [filterHistoryKey]: "preparing" },
          "",
          currentUrl
        )
      }
      return
    }

    if (currentValue === activeFilter) return

    window.history.pushState(
      { ...currentState, [filterHistoryKey]: activeFilter },
      "",
      currentUrl
    )
  }, [activeFilter, filterHistoryKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    const basePath = isGroceryStore ? "/store" : "/restaurant"

    const handlePopState = (event) => {
      if (!window.location.pathname.startsWith(basePath)) return
      const nextFilter = event.state?.[filterHistoryKey] || "preparing"
      if (nextFilter === activeFilter) return
      skipFilterHistoryRef.current = true
      setActiveFilter(nextFilter)
    }

    window.addEventListener("popstate", handlePopState)
    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [activeFilter, filterHistoryKey, isGroceryStore])

  // Restaurant notifications hook for real-time orders
  const { newOrder, clearNewOrder, isConnected } = useRestaurantNotifications({
    enableSound: false,
    enabled: canAccessLiveOrders,
  })

  const rejectReasons = [
    `${EntityLabel} is too busy`,
    "Item not available",
    "Outside delivery area",
    "Kitchen closing soon",
    "Technical issue",
    "Other reason"
  ]

  // Fetch restaurant/store verification status
  useEffect(() => {
    const fetchRestaurantStatus = async () => {
      try {
        const response = isGroceryStore
          ? await groceryStoreAPI.getCurrentStore()
          : await restaurantAPI.getCurrentRestaurant()
        const restaurant = isGroceryStore
          ? (response?.data?.data?.store || response?.data?.store || response?.data?.data?.restaurant || response?.data?.restaurant)
          : (response?.data?.data?.restaurant || response?.data?.restaurant)
        if (restaurant) {
          const normalizedStatus = String(restaurant.status || "").trim().toLowerCase()
          const completedOnboardingSteps = Number(restaurant?.onboarding?.completedSteps || 0)
          const pendingLikeStatuses = new Set([
            "pending",
            "rejected",
            "declined",
            "submitted",
            "verification_pending",
            "in_review",
            "under_review",
          ])
          setRestaurantStatus({
            isActive: restaurant.isActive,
            isAcceptingOrders: restaurant.isAcceptingOrders !== false,
            status: restaurant.status || null,
            rejectionReason: restaurant.rejectionReason || null,
            onboarding: restaurant.onboarding || null,
            isLoading: false
          })

          const shouldRedirectToPendingApproval =
            restaurant.isActive !== true &&
            (
              completedOnboardingSteps >= 4 ||
              pendingLikeStatuses.has(normalizedStatus)
            )

          if (shouldRedirectToPendingApproval) {
            navigate(isGroceryStore ? "/store/pending-approval" : "/restaurant/pending-approval", { replace: true })
            return
          }

          // Once the restaurant/store has moved past onboarding and is not pending approval, keep them on home.
          if (normalizedStatus && normalizedStatus !== "onboarding") {
            return
          }

          // Restaurant onboarding redirection should be based on computed status,
          // not only onboarding.completedSteps (which can be stale/missing for old accounts).
          if (!isGroceryStore) {
            if (restaurant.onboarding?.completedSteps === 4) {
              return
            }

            // Onboarding is incomplete, redirect to onboarding page
            const incompleteStep = await checkOnboardingStatus()
            if (incompleteStep) {
              navigate(`/restaurant/onboarding?step=${incompleteStep}`, { replace: true })
              return
            }
          } else {
            const incompleteStep = await checkGroceryStoreOnboardingStatus()
            if (incompleteStep) {
              navigate(`/store/onboarding?step=${incompleteStep}`, { replace: true })
              return
            }
          }
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          console.error(`Error fetching ${entityLabel} status:`, error)
        }
        // Set loading to false so UI doesn't stay in loading state
        setRestaurantStatus(prev => ({ ...prev, isLoading: false }))
      }
    }

    fetchRestaurantStatus()

    // Listen for restaurant profile updates
    const handleProfileRefresh = () => {
      fetchRestaurantStatus()
    }

    window.addEventListener('restaurantProfileRefresh', handleProfileRefresh)

    // Auto-poll store status every 30 s ΓÇö ONLY for /store (grocery store)
    // Restaurant status is fetched once on mount; this interval does NOT affect it
    let statusPollInterval = null
    if (isGroceryStore) {
      statusPollInterval = setInterval(() => {
        fetchRestaurantStatus()
      }, 30_000)
    }

    return () => {
      window.removeEventListener('restaurantProfileRefresh', handleProfileRefresh)
      if (statusPollInterval) clearInterval(statusPollInterval)
    }
  }, [navigate, isGroceryStore])

  // Handle reverify (resubmit for approval)
  const handleReverify = async () => {
    try {
      setIsReverifying(true)
      if (isGroceryStore) {
        await groceryStoreAPI.reverify()
      } else {
        await restaurantAPI.reverify()
      }

      // Refresh restaurant/store status
      const response = isGroceryStore
        ? await groceryStoreAPI.getCurrentStore()
        : await restaurantAPI.getCurrentRestaurant()
      const restaurant = isGroceryStore
        ? (response?.data?.data?.store || response?.data?.store || response?.data?.data?.restaurant || response?.data?.restaurant)
        : (response?.data?.data?.restaurant || response?.data?.restaurant)
      if (restaurant) {
        setRestaurantStatus({
          isActive: restaurant.isActive,
          isAcceptingOrders: restaurant.isAcceptingOrders !== false,
          status: restaurant.status || null,
          rejectionReason: restaurant.rejectionReason || null,
          onboarding: restaurant.onboarding || null,
          isLoading: false
        })
      }

      // Trigger profile refresh event
      window.dispatchEvent(new Event('restaurantProfileRefresh'))

      alert(`${EntityLabel} reverified successfully! Verification will be done in 24 hours.`)
    } catch (error) {
      // Don't log network/timeout errors (backend might be down)
      if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
        console.error(`Error reverifying ${entityLabel}:`, error)
      }

      // Handle 401 Unauthorized errors (token expired/invalid)
      if (error.response?.status === 401) {
        const errorMessage = error.response?.data?.message || 'Your session has expired. Please login again.'
        alert(errorMessage)
        // The axios interceptor should handle redirecting to login
        // But if it doesn't, we can manually redirect
        if (!error.response?.data?.message?.includes('inactive')) {
          // Only redirect if it's not an "inactive" error (which we handle differently)
          setTimeout(() => {
            window.location.href = isGroceryStore ? '/store/login' : '/restaurant/login'
          }, 1500)
        }
      } else {
        // Other errors (400, 500, etc.)
        const errorMessage = error.response?.data?.message || `Failed to reverify ${entityLabel}. Please try again.`
        alert(errorMessage)
      }
    } finally {
      setIsReverifying(false)
    }
  }

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  const getPopupOrderIdentifiers = useCallback((order) => {
    return [
      order?.orderMongoId,
      order?._id,
      order?.orderId,
      order?.id,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  }, [])

  const hasOrderBeenShown = useCallback((order) => {
    const identifiers = getPopupOrderIdentifiers(order)
    return identifiers.some((id) => shownOrdersRef.current.has(id))
  }, [getPopupOrderIdentifiers])

  const markOrderAsShown = useCallback((order) => {
    const identifiers = getPopupOrderIdentifiers(order)
    identifiers.forEach((id) => shownOrdersRef.current.add(id))
  }, [getPopupOrderIdentifiers])

  const toPopupOrder = useCallback((order) => ({
    orderId: order?.orderId,
    orderMongoId: order?._id || order?.orderMongoId,
    restaurantId: order?.restaurantId,
    restaurantName: order?.restaurantName,
    items: order?.items || [],
    total: order?.pricing?.total || order?.total || 0,
    customerAddress: order?.address || order?.customerAddress,
    status: order?.status,
    createdAt: order?.createdAt,
    estimatedDeliveryTime: order?.estimatedDeliveryTime || 30,
    note: order?.note || '',
    sendCutlery: order?.sendCutlery,
    paymentMethod: order?.paymentMethod ?? order?.payment?.method,
    payment: order?.payment,
  }), [])

  const checkConfirmedOrdersAndShowPopup = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return false
    if (showNewOrderPopupRef.current) return false

    try {
      const response = await orderAPI.getOrders()
      const rawOrders = response?.data?.data?.orders
      if (!response?.data?.success || !Array.isArray(rawOrders) || rawOrders.length === 0) {
        return false
      }

      const confirmedOrders = rawOrders.filter(
        (order) => order.status === 'confirmed' && !hasOrderBeenShown(order)
      )
      if (confirmedOrders.length === 0) return false

      const latestConfirmedOrder = confirmedOrders[0]
      const orderForPopup = toPopupOrder(latestConfirmedOrder)
      markOrderAsShown(orderForPopup)
      setPopupOrder(orderForPopup)
      setShowNewOrderPopup(true)
      setCountdown(240)
      return true
    } catch (error) {
      const status = Number(error?.response?.status || 0)
      const isTransientBackendOutage = status === 503 || error?.code === 'ERR_NETWORK'
      if (status !== 401 && !isTransientBackendOutage) {
        console.error('Error checking confirmed orders:', error)
      }
      return false
    }
  }, [orderAPI, toPopupOrder, hasOrderBeenShown, markOrderAsShown])

  // Show new order popup when real order notification arrives from Socket.IO
  useEffect(() => {
    if (!newOrder) return

    // Prevent stale socket payloads from blocking fallback polling.
    if (showNewOrderPopupRef.current) {
      clearNewOrder()
      return
    }

    if (hasOrderBeenShown(newOrder)) {
      clearNewOrder()
      return
    }

    markOrderAsShown(newOrder)
    setPopupOrder(newOrder)
    setShowNewOrderPopup(true)
    setCountdown(240) // Reset countdown to 4 minutes
    clearNewOrder()
  }, [newOrder, clearNewOrder, hasOrderBeenShown, markOrderAsShown])

  useEffect(() => {
    const handleOrderStatusUpdate = (event) => {
      const orderStatusUpdate = event?.detail
      if (!orderStatusUpdate) return

      setOrdersRefreshTick((prev) => prev + 1)

      setSelectedOrder((current) => {
        if (!current) return current

        const incomingIds = [
          orderStatusUpdate?.orderMongoId,
          orderStatusUpdate?._id,
          orderStatusUpdate?.mongoId,
          orderStatusUpdate?.orderId,
          orderStatusUpdate?.id,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean)

        const currentIds = [
          current?.mongoId,
          current?.orderMongoId,
          current?.orderId,
          current?.id,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean)

        const isSameOrder = incomingIds.some((id) => currentIds.includes(id))
        if (!isSameOrder) return current

        const nextStatusLabel = formatOrderStatusLabel(orderStatusUpdate?.status)
        const updatedTime = orderStatusUpdate?.updatedAt
          ? new Date(orderStatusUpdate.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
          : current.timePlaced

        return {
          ...current,
          status: nextStatusLabel,
          timePlaced: updatedTime,
        }
      })
    }

    window.addEventListener("restaurantOrderStatusUpdate", handleOrderStatusUpdate)
    return () => {
      window.removeEventListener("restaurantOrderStatusUpdate", handleOrderStatusUpdate)
    }
  }, [])

  // Track popup state with ref to avoid stale closures
  useEffect(() => {
    showNewOrderPopupRef.current = showNewOrderPopup
  }, [showNewOrderPopup])

  // Check for confirmed orders that haven't been shown in popup yet (fallback if Socket.IO fails)
  useEffect(() => {
    if (!canAccessLiveOrders || isConnected) return undefined

    // Check every 5 seconds for new confirmed orders (fallback mechanism)
    const interval = setInterval(checkConfirmedOrdersAndShowPopup, 5000)

    // Check immediately on mount
    checkConfirmedOrdersAndShowPopup()

    return () => clearInterval(interval)
  }, [canAccessLiveOrders, isConnected, checkConfirmedOrdersAndShowPopup])

  // Play audio when popup opens
  useEffect(() => {
    if (showNewOrderPopup && !isMuted) {
      if (audioRef.current) {
        audioRef.current.loop = true
        audioRef.current.play().catch(err => console.error("Audio play failed:", err))
      }
    } else if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [showNewOrderPopup, isMuted])

  // Countdown timer
  useEffect(() => {
    if (showNewOrderPopup && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown(prev => prev - 1)
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [showNewOrderPopup, countdown])

  // Format countdown time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getOrderIdCandidates = (order) => {
    const candidates = [
      order?.orderMongoId,
      order?._id,
      order?.orderId,
      order?.id,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)

    return [...new Set(candidates)]
  }

  // Handle accept order (confirmed by user)
  const handleAcceptOrder = async () => {
    if (countdown <= 0) {
      toast.error("Acceptance window expired for this order")
      return false
    }

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    // Use popupOrder (from Socket.IO or API fallback) or newOrder (from hook)
    const orderToAccept = popupOrder || newOrder

    // Accept order via API if we have a real order
    const orderIdCandidates = getOrderIdCandidates(orderToAccept)
    if (orderIdCandidates.length === 0) {
      toast.error("Unable to accept: invalid order ID")
      return false
    }

    try {
      let acceptedOrderId = null
      let lastError = null

      const acceptWithTimeout = async (orderId) => {
        const timeoutPromise = new Promise((_, reject) => {
          const timeoutError = new Error("Accept request timed out")
          timeoutError.code = "ECONNABORTED"
          setTimeout(() => reject(timeoutError), ACCEPT_REQUEST_TIMEOUT_MS)
        })

        return Promise.race([
          orderAPI.acceptOrder(orderId, prepTime),
          timeoutPromise,
        ])
      }

      const isAcceptedOrderStatus = (status) => {
        const normalized = String(status || "").toLowerCase().trim()
        return normalized === "preparing" || normalized === "ready" || normalized === "out_for_delivery"
      }

      const verifyAcceptedAfterTimeout = async (ids = []) => {
        if (typeof orderAPI?.getOrderById !== "function") return null

        for (const id of ids) {
          try {
            const response = await orderAPI.getOrderById(id)
            const order =
              response?.data?.data?.order ||
              response?.data?.order ||
              response?.data?.data ||
              null

            if (order && isAcceptedOrderStatus(order.status)) {
              return id
            }
          } catch {
            // Ignore per-ID lookup failures; keep checking alternatives.
          }
        }

        return null
      }

      for (const orderId of orderIdCandidates) {
        try {
          await acceptWithTimeout(orderId)
          acceptedOrderId = orderId
          break
        } catch (attemptError) {
          lastError = attemptError
          const status = Number(attemptError?.response?.status || 0)
          const isTimeoutError =
            attemptError?.code === "ECONNABORTED" ||
            String(attemptError?.message || "").toLowerCase().includes("timeout")

          if (isTimeoutError) {
            const verifiedAcceptedId = await verifyAcceptedAfterTimeout(orderIdCandidates)
            if (verifiedAcceptedId) {
              acceptedOrderId = verifiedAcceptedId
              break
            }
          }

          // Retry with next candidate only when order lookup failed
          if (status !== 404) {
            throw attemptError
          }
        }
      }

      if (!acceptedOrderId && lastError) {
        throw lastError
      }

      if (acceptedOrderId && typeof orderAPI?.resendDeliveryNotification === "function") {
        // Best-effort nudge so the delivery assignment flow starts immediately.
        orderAPI.resendDeliveryNotification(acceptedOrderId).catch(() => {})
      }

      toast.success('Order accepted successfully')
    } catch (error) {
      const isTimeoutError =
        error?.code === 'ECONNABORTED' ||
        String(error?.message || '').toLowerCase().includes('timeout')

      console.error('Γ¥î Error accepting order:', error)
      const errorMessage = isTimeoutError
        ? 'Accept request timed out. Backend may be slow. Please check the order list and retry once.'
        : (
          error.response?.data?.message ||
          error.message ||
          'Failed to accept order. Please try again.'
        )

      // Show specific error message
      if (error.response?.status === 400) {
        toast.error(errorMessage)
      } else if (error.response?.status === 404) {
        toast.error('Order not found. It may have been cancelled or already processed.')
      } else {
        toast.error(errorMessage)
      }
      return false
    }

    setShowNewOrderPopup(false)
    setShowAcceptConfirmPopup(false)
    setPopupOrder(null)
    clearNewOrder()
    setCountdown(240)
    setPrepTime(11)
    setActiveFilter("preparing")
    setOrdersRefreshTick((prev) => prev + 1)

    // Pull next pending confirmed order immediately instead of waiting for fallback interval.
    setTimeout(() => {
      checkConfirmedOrdersAndShowPopup()
    }, 250)

    return true
  }

  const handleAcceptCancel = () => {
    setShowAcceptConfirmPopup(false)
  }

  const getAcceptSlideMaxOffset = () => {
    const trackWidth = acceptSlideTrackRef.current?.clientWidth || 0
    return Math.max(0, trackWidth - ACCEPT_SLIDE_HANDLE_WIDTH)
  }

  const setAcceptSlideOffsetSmooth = useCallback((nextOffset) => {
    acceptSlideOffsetRef.current = nextOffset
    acceptSlidePendingOffsetRef.current = nextOffset

    if (acceptSlideRafRef.current !== null) return

    acceptSlideRafRef.current = requestAnimationFrame(() => {
      acceptSlideRafRef.current = null
      setAcceptSlideOffset(acceptSlidePendingOffsetRef.current)
    })
  }, [])

  const resetAcceptSlider = () => {
    setIsAcceptSliding(false)
    acceptSlideMovedRef.current = false
    acceptSlidePointerIdRef.current = null
    acceptSlideVelocityRef.current = 0
    setAcceptSlideOffsetSmooth(0)
  }

  const handleAcceptSliderPointerDown = (event) => {
    if (isAcceptProcessing) return
    if (countdown <= 0) return
    if (event.pointerType === "mouse" && event.button !== 0) return
    const maxOffset = getAcceptSlideMaxOffset()
    if (maxOffset <= 0) return

    setIsAcceptSliding(true)
    acceptSlideStartXRef.current = event.clientX
    acceptSlideStartOffsetRef.current = acceptSlideOffsetRef.current
    acceptSlideLastMoveXRef.current = event.clientX
    acceptSlideLastMoveAtRef.current = performance.now()
    acceptSlideVelocityRef.current = 0
    acceptSlideMovedRef.current = false
    acceptSlidePointerIdRef.current = event.pointerId
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleAcceptSliderPointerMove = (event) => {
    if (acceptSlidePointerIdRef.current !== event.pointerId) return
    if (!isAcceptSliding || isAcceptProcessing) return
    const maxOffset = getAcceptSlideMaxOffset()
    const deltaX = event.clientX - acceptSlideStartXRef.current
    event.preventDefault()

    const now = performance.now()
    const moveDeltaX = event.clientX - acceptSlideLastMoveXRef.current
    const moveDeltaT = Math.max(1, now - acceptSlideLastMoveAtRef.current)
    const instantaneousVelocity = moveDeltaX / moveDeltaT
    acceptSlideVelocityRef.current =
      acceptSlideVelocityRef.current * 0.65 + instantaneousVelocity * 0.35
    acceptSlideLastMoveXRef.current = event.clientX
    acceptSlideLastMoveAtRef.current = now

    if (Math.abs(deltaX) > 2) {
      acceptSlideMovedRef.current = true
    }
    const nextOffset = Math.min(maxOffset, Math.max(0, acceptSlideStartOffsetRef.current + deltaX))
    setAcceptSlideOffsetSmooth(nextOffset)
  }

  const handleAcceptSliderPointerEnd = async (event) => {
    if (acceptSlidePointerIdRef.current !== event.pointerId) return
    if (!isAcceptSliding) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setIsAcceptSliding(false)
    acceptSlidePointerIdRef.current = null

    const maxOffset = getAcceptSlideMaxOffset()
    if (maxOffset <= 0) {
      resetAcceptSlider()
      return
    }

    if (!acceptSlideMovedRef.current) {
      resetAcceptSlider()
      return
    }

    const progress = maxOffset > 0 ? acceptSlideOffsetRef.current / maxOffset : 0
    const reachedEnd = progress >= ACCEPT_SLIDE_TRIGGER_RATIO
    const isFastFlickToAccept =
      acceptSlideVelocityRef.current >= ACCEPT_SLIDE_VELOCITY_TRIGGER &&
      progress >= ACCEPT_SLIDE_MIN_PROGRESS_FOR_FLICK

    if (!reachedEnd && !isFastFlickToAccept) {
      resetAcceptSlider()
      return
    }

    setAcceptSlideOffsetSmooth(maxOffset)
    setIsAcceptProcessing(true)
    const accepted = await handleAcceptOrder()
    setIsAcceptProcessing(false)

    if (!accepted) {
      resetAcceptSlider()
    }
  }

  useEffect(() => {
    if (!showNewOrderPopup) {
      resetAcceptSlider()
      setIsAcceptProcessing(false)
      return
    }

    acceptSlideVelocityRef.current = 0
    setAcceptSlideOffsetSmooth(0)
    setIsAcceptSliding(false)
    setIsAcceptProcessing(false)
  }, [showNewOrderPopup, popupOrder?.orderMongoId, popupOrder?.orderId, newOrder?.orderMongoId, newOrder?.orderId])

  useEffect(() => {
    return () => {
      if (acceptSlideRafRef.current !== null) {
        cancelAnimationFrame(acceptSlideRafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!showNewOrderPopup) return
    if (countdown > 0) return

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    resetAcceptSlider()
    setIsAcceptProcessing(false)
    setShowAcceptConfirmPopup(false)
    setShowNewOrderPopup(false)
    setPopupOrder(null)
    clearNewOrder()
  }, [countdown, showNewOrderPopup, clearNewOrder])

  // Handle reject order
  const handleRejectClick = () => {
    setShowRejectPopup(true)
  }

  const handleRejectConfirm = async () => {
    if (!rejectReason) return

    // Use popupOrder (from Socket.IO or API fallback) or newOrder (from hook)
    const orderToReject = popupOrder || newOrder

    // Reject order via API if we have a real order
    const orderIdCandidates = getOrderIdCandidates(orderToReject)
    if (orderIdCandidates.length > 0) {
      try {
        let rejectedOrderId = null
        let lastError = null

        for (const orderId of orderIdCandidates) {
          try {
            await orderAPI.rejectOrder(orderId, rejectReason)
            rejectedOrderId = orderId
            break
          } catch (attemptError) {
            lastError = attemptError
            const status = Number(attemptError?.response?.status || 0)
            if (status !== 404) {
              throw attemptError
            }
          }
        }

        if (!rejectedOrderId && lastError) {
          throw lastError
        }

        console.log('Γ£à Order rejected:', rejectedOrderId || orderIdCandidates[0])
      } catch (error) {
        console.error('Γ¥î Error rejecting order:', error)
        alert('Failed to reject order. Please try again.')
        return
      }
    }

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setShowRejectPopup(false)
    setShowNewOrderPopup(false)
    setPopupOrder(null)
    clearNewOrder()
    setRejectReason("")
    setCountdown(240)
    setPrepTime(11)
    setOrdersRefreshTick((prev) => prev + 1)
  }

  const handleRejectCancel = () => {
    setShowRejectPopup(false)
    setShowNewOrderPopup(false)
    setPopupOrder(null)
    clearNewOrder()
    setRejectReason("")
    setCountdown(240)
  }

  // Handle cancel order (for preparing orders)
  const handleCancelClick = (order) => {
    setOrderToCancel(order)
    setShowCancelPopup(true)
  }

  const handleCancelConfirm = async () => {
    if (!cancelReason.trim() || !orderToCancel) return

    try {
      const orderId = orderToCancel.mongoId || orderToCancel.orderId
      await orderAPI.rejectOrder(orderId, cancelReason.trim())
      toast.success('Order cancelled successfully')
      setOrdersRefreshTick((prev) => prev + 1)
      setShowCancelPopup(false)
      setOrderToCancel(null)
      setCancelReason("")
    } catch (error) {
      console.error('Γ¥î Error cancelling order:', error)
      toast.error(error.response?.data?.message || 'Failed to cancel order')
    }
  }

  const handleCancelPopupClose = () => {
    setShowCancelPopup(false)
    setOrderToCancel(null)
    setCancelReason("")
  }

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted)
    if (audioRef.current) {
      if (!isMuted) {
        audioRef.current.pause()
      } else {
        audioRef.current.play().catch(err => console.error("Audio play failed:", err))
      }
    }
  }

  // Handle PDF download
  const handlePrint = async () => {
    if (!newOrder) {
      console.warn('No order data available for PDF generation')
      return
    }

    try {
      // Create new PDF document
      const doc = new jsPDF()

      // Set font
      doc.setFont('helvetica', 'bold')

      // Header
      doc.setFontSize(20)
      doc.text('Order Receipt', 105, 20, { align: 'center' })

      // Store/Restaurant name
      doc.setFontSize(14)
      doc.setFont('helvetica', 'normal')
      const printableOutletName = isGroceryStore
        ? String(orderToPrint.restaurantName || 'Store').replace(/\brestaurant\b/gi, 'Store').replace(/\s{2,}/g, ' ').trim()
        : (orderToPrint.restaurantName || 'Restaurant')
      doc.text(printableOutletName, 105, 30, { align: 'center' })

      // Order details
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(`Order ID: ${orderToPrint.orderId || 'N/A'}`, 20, 45)
      doc.setFont('helvetica', 'normal')

      const orderDate = orderToPrint.createdAt
        ? new Date(orderToPrint.createdAt).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
        : new Date().toLocaleString('en-GB')

      doc.text(`Date: ${orderDate}`, 20, 52)

      // Customer address
      if (orderToPrint.customerAddress) {
        doc.setFont('helvetica', 'bold')
        doc.text('Delivery Address:', 20, 62)
        doc.setFont('helvetica', 'normal')
        const addressText = [
          orderToPrint.customerAddress.street,
          orderToPrint.customerAddress.city,
          orderToPrint.customerAddress.state
        ].filter(Boolean).join(', ') || 'Address not available'
        const addressLines = doc.splitTextToSize(addressText, 170)
        doc.text(addressLines, 20, 69)
      }

      // Items table
      let yPos = 85
      if (orderToPrint.items && orderToPrint.items.length > 0) {
        doc.setFont('helvetica', 'bold')
        doc.text('Items:', 20, yPos)
        yPos += 8

        // Prepare table data
        const tableData = orderToPrint.items.map(item => [
          item.name || 'Item',
          item.quantity || 1,
          `₹${(item.price || 0).toFixed(2)}`,
          `₹${((item.price || 0) * (item.quantity || 1)).toFixed(2)}`
        ])

        autoTable(doc, {
          startY: yPos,
          head: [['Item', 'Qty', 'Price', 'Total']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold' },
          styles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 30, halign: 'center' },
            2: { cellWidth: 35, halign: 'right' },
            3: { cellWidth: 35, halign: 'right' }
          }
        })

        yPos = doc.lastAutoTable.finalY + 10
      }

      // Total
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(`Total: ₹${(orderToPrint.total || 0).toFixed(2)}`, 20, yPos)

      // Payment status
      yPos += 10
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Payment Status: ${orderToPrint.status === 'confirmed' ? 'Paid' : 'Pending'}`, 20, yPos)

      // Estimated delivery time
      if (orderToPrint.estimatedDeliveryTime) {
        yPos += 8
        doc.text(`Estimated Delivery: ${orderToPrint.estimatedDeliveryTime} minutes`, 20, yPos)
      }

      // Notes
      if (orderToPrint.note) {
        yPos += 10
        doc.setFont('helvetica', 'bold')
        doc.text('Note:', 20, yPos)
        doc.setFont('helvetica', 'normal')
        const noteLines = doc.splitTextToSize(orderToPrint.note, 170)
        doc.text(noteLines, 20, yPos + 7)
      }

      // Send cutlery
      if (orderToPrint.sendCutlery) {
        yPos += 15
        doc.setFont('helvetica', 'normal')
        doc.text('Γ£ô Send cutlery requested', 20, yPos)
      }

      // Footer
      const pageHeight = doc.internal.pageSize.height
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.text(
        `Generated on ${new Date().toLocaleString('en-GB')}`,
        105,
        pageHeight - 10,
        { align: 'center' }
      )

      // Download PDF
      const fileName = `Order-${orderToPrint.orderId || 'Receipt'}-${Date.now()}.pdf`
      doc.save(fileName)
    } catch (error) {
      console.error('Γ¥î Error generating PDF:', error)
      alert('Failed to generate PDF. Please try again.')
    }
  }

  // Handle swipe gestures with smooth animations
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchEndX.current = e.touches[0].clientX
    isSwiping.current = false
  }

  const handleTouchMove = (e) => {
    if (!isSwiping.current) {
      const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current)
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current)

      // Determine if this is a horizontal swipe
      if (deltaX > deltaY && deltaX > 10) {
        isSwiping.current = true
      }
    }

    if (isSwiping.current) {
      touchEndX.current = e.touches[0].clientX
    }
  }

  const handleTouchEnd = () => {
    if (!isSwiping.current) {
      touchStartX.current = 0
      touchEndX.current = 0
      return
    }

    const swipeDistance = touchStartX.current - touchEndX.current
    const minSwipeDistance = 50
    const swipeVelocity = Math.abs(swipeDistance)

    if (swipeVelocity > minSwipeDistance && !isTransitioning) {
      const currentIndex = filterTabs.findIndex(tab => tab.id === activeFilter)
      let newIndex = currentIndex

      if (swipeDistance > 0 && currentIndex < filterTabs.length - 1) {
        // Swipe left - go to next filter (right side)
        newIndex = currentIndex + 1
      } else if (swipeDistance < 0 && currentIndex > 0) {
        // Swipe right - go to previous filter (left side)
        newIndex = currentIndex - 1
      }

      if (newIndex !== currentIndex) {
        setIsTransitioning(true)

        // Smooth transition with animation
        setTimeout(() => {
          setActiveFilter(filterTabs[newIndex].id)
          scrollToFilter(newIndex)

          // Reset transition state after animation
          setTimeout(() => {
            setIsTransitioning(false)
          }, 300)
        }, 50)
      }
    }

    // Reset touch positions
    touchStartX.current = 0
    touchEndX.current = 0
    touchStartY.current = 0
    isSwiping.current = false
  }

  // Scroll filter bar to show active button with smooth animation
  const scrollToFilter = (index) => {
    if (filterBarRef.current) {
      const buttons = filterBarRef.current.querySelectorAll('button')
      if (buttons[index]) {
        const button = buttons[index]
        const container = filterBarRef.current
        const buttonLeft = button.offsetLeft
        const buttonWidth = button.offsetWidth
        const containerWidth = container.offsetWidth
        const scrollLeft = buttonLeft - (containerWidth / 2) + (buttonWidth / 2)

        container.scrollTo({
          left: scrollLeft,
          behavior: 'smooth'
        })
      }
    }
  }

  // Scroll to active filter on change with smooth animation
  useEffect(() => {
    const index = filterTabs.findIndex(tab => tab.id === activeFilter)
    if (index >= 0) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        scrollToFilter(index)
      })
    }
  }, [activeFilter])


  const handleSelectOrder = (order) => {
    setSelectedOrder(order)
    setIsSheetOpen(true)
  }

  const renderContent = () => {
    if (!canAccessLiveOrders) {
      return null
    }

    switch (activeFilter) {
      case "preparing":
        return <PreparingOrders onSelectOrder={handleSelectOrder} onCancel={handleCancelClick} orderAPI={orderAPI} searchQuery={searchQuery} refreshTick={ordersRefreshTick} />
      case "ready":
        return <ReadyOrders onSelectOrder={handleSelectOrder} orderAPI={orderAPI} searchQuery={searchQuery} refreshTick={ordersRefreshTick} />
      case "out-for-delivery":
        return <OutForDeliveryOrders onSelectOrder={handleSelectOrder} orderAPI={orderAPI} searchQuery={searchQuery} refreshTick={ordersRefreshTick} />
      case "scheduled":
        return <ScheduledOrders onSelectOrder={handleSelectOrder} orderAPI={orderAPI} searchQuery={searchQuery} refreshTick={ordersRefreshTick} />
      case "completed":
        return <CompletedOrders onSelectOrder={handleSelectOrder} orderAPI={orderAPI} searchQuery={searchQuery} refreshTick={ordersRefreshTick} />
      case "cancelled":
        return <CancelledOrders onSelectOrder={handleSelectOrder} orderAPI={orderAPI} isGroceryStore={isGroceryStore} searchQuery={searchQuery} refreshTick={ordersRefreshTick} />
      default:
        return <EmptyState />
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Restaurant Navbar - Sticky at top */}
      <div className="sticky top-0 z-50 bg-white">
        <RestaurantNavbar showNotifications={false} onSearchChange={setSearchQuery} />
      </div>

      {/* Top Filter Bar - Sticky below navbar */}
      {canAccessLiveOrders && (
        <div className="sticky top-[50px] z-40 pb-2 bg-gray-100">
          <div
            ref={filterBarRef}
            className="flex gap-2 overflow-x-auto scrollbar-hide bg-transparent rounded-full px-3 py-2 mt-2"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            <style>{`
              .scrollbar-hide::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            {filterTabs.map((tab, index) => {
              const isActive = activeFilter === tab.id

              return (
                <motion.button
                  key={tab.id}
                  onClick={() => {
                    if (!isTransitioning) {
                      setIsTransitioning(true)
                      setActiveFilter(tab.id)
                      scrollToFilter(index)
                      setTimeout(() => setIsTransitioning(false), 300)
                    }
                  }}
                  className={`shrink-0 px-6 py-3.5 rounded-full font-medium text-sm whitespace-nowrap relative overflow-hidden ${isActive
                    ? 'text-white'
                    : 'bg-white text-black'
                    }`}
                  animate={{
                    scale: isActive ? 1.05 : 1,
                    opacity: isActive ? 1 : 0.7,
                  }}
                  transition={{
                    duration: 0.3,
                    ease: [0.25, 0.1, 0.25, 1],
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeFilterBackground"
                      className="absolute inset-0 bg-black rounded-full -z-10"
                      initial={false}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 30
                      }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {/* Content Area - Scrollable */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto px-4 pb-24 content-scroll"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={(e) => {
          mouseStartX.current = e.clientX
          mouseEndX.current = e.clientX
          isMouseDown.current = true
          isSwiping.current = false
        }}
        onMouseMove={(e) => {
          if (isMouseDown.current) {
            if (!isSwiping.current) {
              const deltaX = Math.abs(e.clientX - mouseStartX.current)
              if (deltaX > 10) {
                isSwiping.current = true
              }
            }
            if (isSwiping.current) {
              mouseEndX.current = e.clientX
            }
          }
        }}
        onMouseUp={() => {
          if (isMouseDown.current && isSwiping.current) {
            const swipeDistance = mouseStartX.current - mouseEndX.current
            const minSwipeDistance = 50

            if (Math.abs(swipeDistance) > minSwipeDistance && !isTransitioning) {
              const currentIndex = filterTabs.findIndex(tab => tab.id === activeFilter)
              let newIndex = currentIndex

              if (swipeDistance > 0 && currentIndex < filterTabs.length - 1) {
                newIndex = currentIndex + 1
              } else if (swipeDistance < 0 && currentIndex > 0) {
                newIndex = currentIndex - 1
              }

              if (newIndex !== currentIndex) {
                setIsTransitioning(true)
                setTimeout(() => {
                  setActiveFilter(filterTabs[newIndex].id)
                  scrollToFilter(newIndex)
                  setTimeout(() => setIsTransitioning(false), 300)
                }, 50)
              }
            }
          }

          isMouseDown.current = false
          isSwiping.current = false
          mouseStartX.current = 0
          mouseEndX.current = 0
        }}
        onMouseLeave={() => {
          isMouseDown.current = false
          isSwiping.current = false
        }}
      >
        <style>{`
          .content-scroll {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .content-scroll::-webkit-scrollbar {
            display: none;
          }
        `}</style>

        {/* Verification Pending Card - Show if onboarding is complete (all 4 steps) and restaurant is not active */}
        {shouldShowVerificationState && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className={`mt-4 mb-4 rounded-2xl shadow-sm px-6 py-4 ${restaurantStatus.rejectionReason
              ? 'bg-white border border-red-200'
              : 'bg-white border border-yellow-200'
              }`}
          >
            {restaurantStatus.rejectionReason ? (
              <>
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-shrink-0 rounded-full p-2 bg-red-100">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-red-600 mb-2">Denied Verification</h3>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                      <p className="text-xs font-semibold text-red-800 mb-2">Reason for Rejection:</p>
                      <div className="text-xs text-red-700 space-y-1">
                        {restaurantStatus.rejectionReason.split('\n').filter(line => line.trim()).length > 1 ? (
                          <ul className="space-y-1 list-disc list-inside">
                            {restaurantStatus.rejectionReason.split('\n').map((point, index) => (
                              point.trim() && (
                                <li key={index}>{point.trim()}</li>
                              )
                            ))}
                          </ul>
                        ) : (
                          <p className="text-red-700">{restaurantStatus.rejectionReason}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mb-3">
                  {isGroceryStore
                    ? "Please correct rejected store details and submit again for re-verification."
                    : 'Please correct the above issues and click "Reverify" to resubmit your request for approval.'}
                </p>
                {isGroceryStore && (
                  <button
                    onClick={() => navigate("/store/onboarding?step=1")}
                    className="w-full mb-2 px-6 py-2.5 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg font-semibold text-sm hover:bg-blue-100 transition-all"
                  >
                    Submit details again
                  </button>
                )}
                <button
                  onClick={handleReverify}
                  disabled={isReverifying}
                  className="w-full px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isReverifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    isGroceryStore ? "Send for Re-verification" : "Reverify"
                  )}
                </button>
                {!isGroceryStore && (
                  <button
                    onClick={() => navigate("/restaurant/onboarding?step=1")}
                    className="w-full mt-2 px-6 py-2.5 border border-slate-200 bg-slate-50 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-100 transition-all"
                  >
                    Edit submitted details
                  </button>
                )}
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Verification Done in 24 Hours</h3>
                <p className="text-sm text-gray-600">Your account is under verification. You'll be notified once approved.</p>
              </>
            )}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeFilter}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Audio element */}
      <audio ref={audioRef} src={notificationSound} />

      {/* New Order Popup */}
      <AnimatePresence>
        {showNewOrderPopup && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-900">
                      {(popupOrder || newOrder)?.orderId || '#Order'}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {isGroceryStore
                        ? String((popupOrder || newOrder)?.restaurantName || 'Store').replace(/\brestaurant\b/gi, 'Store').replace(/\s{2,}/g, ' ').trim()
                        : ((popupOrder || newOrder)?.restaurantName || 'Restaurant')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrint}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label="Print"
                    >
                      <Printer className="w-5 h-5 text-gray-700" />
                    </button>
                    <button
                      onClick={toggleMute}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted ? (
                        <VolumeX className="w-5 h-5 text-gray-700" />
                      ) : (
                        <Volume2 className="w-5 h-5 text-gray-700" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">
                  {/* Customer info */}
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {(popupOrder || newOrder)?.items?.[0]?.name || 'New Order'}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {(popupOrder || newOrder)?.createdAt
                        ? new Date((popupOrder || newOrder).createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : 'Just now'}
                    </p>
                  </div>

                  {/* Details Accordion */}
                  <div className="mb-4">
                    <button
                      onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                      className="w-full flex items-center justify-between py-2 border-b border-gray-200"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm font-semibold text-gray-900">Details</span>
                        <span className="text-xs text-gray-500">
                          {(popupOrder || newOrder)?.items?.length || 0} item{(popupOrder || newOrder)?.items?.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {isDetailsExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-600" />
                      )}
                    </button>

                    <AnimatePresence>
                      {isDetailsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="py-3 space-y-3">
                            {(popupOrder || newOrder)?.items?.map((item, index) => (
                              <div key={index} className="flex items-start gap-3">
                                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <div className="flex-1">
                                  <div className="flex items-start justify-between">
                                    <p className="text-sm font-medium text-gray-900">
                                      {item.quantity} x {item.name}
                                    </p>
                                    <p className="text-xs text-gray-600 ml-2">
                                      ₹{item.price * item.quantity}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )) || (
                                <p className="text-sm text-gray-500">No items</p>
                              )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Send cutlery */}
                  {(popupOrder || newOrder)?.sendCutlery && (
                    <div className="mb-4 flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span className="text-sm text-gray-700">Send cutlery</span>
                    </div>
                  )}

                  {/* Total bill */}
                  <div className="mb-4 flex items-center justify-between py-3 border-y border-gray-200">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-900">Total bill</span>
                    </div>
                    <span className="text-base font-bold text-gray-900">
                      ₹{(popupOrder || newOrder)?.total || 0}
                    </span>
                  </div>

                  {/* Payment method */}
                  {(() => {
                    const raw = (popupOrder || newOrder)?.paymentMethod ?? (popupOrder || newOrder)?.payment?.method;
                    const isCod = isCodLikePaymentMethod(raw);
                    return (
                      <div className="mb-4 flex items-center justify-between py-2">
                        <span className="text-sm font-medium text-gray-700">Payment</span>
                        <span className={`text-sm font-semibold ${isCod ? 'text-amber-600' : 'text-green-600'}`}>
                          {isCod ? 'Cash on Delivery' : 'Online'}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Preparation time */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-700">Preparation time</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPrepTime(Math.max(1, prepTime - 1))}
                          className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                        >
                          <Minus className="w-4 h-4 text-gray-700" />
                        </button>
                        <span className="text-base font-semibold text-gray-900 min-w-[60px] text-center">
                          {prepTime} mins
                        </span>
                        <button
                          onClick={() => setPrepTime(prepTime + 1)}
                          className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                        >
                          <Plus className="w-4 h-4 text-gray-700" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Accept and Reject buttons */}
                  <div className="space-y-3">
                    {/* Accept control */}
                    <div
                      ref={acceptSlideTrackRef}
                      className="relative w-full h-14 rounded-xl overflow-hidden select-none touch-none bg-slate-900"
                    >
                      <motion.div
                        className="absolute inset-y-0 left-0 bg-emerald-600"
                        initial={{ width: "100%" }}
                        animate={{ width: `${(countdown / 240) * 100}%` }}
                        transition={{ duration: 1, ease: "linear" }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center px-16 pointer-events-none">
                        <span className="text-sm font-semibold text-white tracking-wide">
                          {isAcceptProcessing
                            ? "Accepting order..."
                            : countdown <= 0
                              ? "Accept window expired"
                              : `Slide to Accept (${formatTime(countdown)})`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onPointerDown={handleAcceptSliderPointerDown}
                        onPointerMove={handleAcceptSliderPointerMove}
                        onPointerUp={handleAcceptSliderPointerEnd}
                        onPointerCancel={resetAcceptSlider}
                        disabled={isAcceptProcessing || countdown <= 0}
                        className="absolute top-1 bottom-1 left-1 w-[52px] rounded-lg bg-white text-slate-900 shadow-md flex items-center justify-center disabled:opacity-70 touch-none"
                        style={{
                          transform: `translateX(${acceptSlideOffset}px)`,
                          transition: isAcceptSliding ? "none" : "transform 0.2s ease",
                        }}
                        aria-label="Slide to accept order"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Reject button */}
                    <button
                      onClick={handleRejectClick}
                      className="w-full bg-white border-2 border-red-500 text-red-600 py-3 rounded-lg font-semibold text-sm hover:bg-red-50 transition-colors"
                    >
                      Reject Order
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => navigate(isGroceryStore ? "/store/help-centre" : "/restaurant/help-centre")}
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors underline mx-auto block"
                  >
                    Need help with this order?
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Reject Order Popup */}
      <AnimatePresence>
        {showAcceptConfirmPopup && (
          <>
            <motion.div
              className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleAcceptCancel}
            >
              <motion.div
                className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">Confirm order acceptance</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    This order will be accepted only after you confirm.
                  </p>
                </div>

                <div className="px-4 py-4">
                  <div className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="font-semibold">Order:</span>{" "}
                    {(popupOrder || newOrder)?.orderId || "N/A"}
                  </div>
                  <div className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 mt-2">
                    <span className="font-semibold">Preparation time:</span> {prepTime} mins
                  </div>
                </div>

                <div className="px-4 py-4 border-t border-gray-200 flex gap-3">
                  <button
                    onClick={handleAcceptCancel}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-200 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAcceptOrder}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors"
                  >
                    Confirm Accept
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}

      </AnimatePresence>

      <AnimatePresence>
        {showRejectPopup && (
          <>
            <motion.div
              className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleRejectCancel}
            >
              <motion.div
                className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">
                    Reject Order {(popupOrder || newOrder)?.orderId || '#Order'}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">Please select a reason for rejecting this order</p>
                </div>

                {/* Content */}
                <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-2">
                    {rejectReasons.map((reason) => (
                      <button
                        key={reason}
                        onClick={() => setRejectReason(reason)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${rejectReason === reason
                          ? "border-black bg-black/5"
                          : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-medium ${rejectReason === reason ? "text-black" : "text-gray-900"
                            }`}>
                            {reason}
                          </span>
                          {rejectReason === reason && (
                            <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                  <button
                    onClick={handleRejectCancel}
                    className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRejectConfirm}
                    disabled={!rejectReason}
                    className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${rejectReason
                      ? "!bg-black !text-white"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                      }`}
                  >
                    Confirm Rejection
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Cancel Order Popup */}
      <AnimatePresence>
        {showCancelPopup && orderToCancel && (
          <>
            <motion.div
              className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCancelPopupClose}
            >
              <motion.div
                className="w-[95%] max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-4 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900">
                    Cancel Order {orderToCancel.orderId || '#Order'}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">Please provide a reason for cancelling this order</p>
                </div>

                {/* Content */}
                <div className="px-4 py-4">
                  <div className="space-y-3">
                    {rejectReasons.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setCancelReason(reason)}
                        className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${cancelReason === reason
                          ? "border-red-500 bg-red-50"
                          : "border-gray-200 hover:border-gray-300"
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${cancelReason === reason
                              ? "border-red-500 bg-red-500"
                              : "border-gray-300"
                              }`}
                          >
                            {cancelReason === reason && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className={`text-sm font-medium ${cancelReason === reason ? "text-red-700" : "text-gray-700"
                            }`}>
                            {reason}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                  <button
                    onClick={handleCancelPopupClose}
                    className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCancelConfirm}
                    disabled={!cancelReason}
                    className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-colors ${cancelReason
                      ? "!bg-red-600 !text-white hover:bg-red-700"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                      }`}
                  >
                    Confirm Cancellation
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Sheet for Order Details */}
      <AnimatePresence>
        {isSheetOpen && selectedOrder && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSheetOpen(false)}
          >
            <motion.div
              className="w-full max-w-md mx-auto bg-white rounded-t-3xl p-4 pb-6 shadow-lg"
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="flex justify-center mb-3">
                <div className="h-1 w-10 rounded-full bg-gray-300" />
              </div>

              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-sm font-semibold text-black">
                    Order #{selectedOrder.orderId}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedOrder.customerName}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {selectedOrder.type}
                    {selectedOrder.tableOrToken
                      ? ` ΓÇó ${selectedOrder.tableOrToken}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${selectedOrder.status === "Ready"
                      ? "border-green-500 text-green-600"
                      : "border-gray-800 text-gray-900"
                      }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${selectedOrder.status === "Ready"
                        ? "bg-green-500"
                        : "bg-gray-800"
                        }`}
                    />
                    {selectedOrder.status}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    {selectedOrder.timePlaced}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-100 my-3" />

              <div className="mb-3">
                <p className="text-xs font-medium text-gray-700 mb-1">
                  Items
                </p>
                <p className="text-xs text-gray-600">
                  {selectedOrder.itemsSummary}
                </p>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500 mb-4">
                {/* Hide ETA for ready orders */}
                {selectedOrder.status !== 'ready' && selectedOrder.eta && (
                  <span>ETA: <span className="font-medium text-black">{selectedOrder.eta}</span></span>
                )}
                <span>Payment: <span className="font-medium text-black">Paid online</span></span>
              </div>

              {String(selectedOrder.status || "").toLowerCase() === "preparing" && !selectedOrder.deliveryPartnerId && (
                <div className="mb-3">
                  <ResendNotificationButton orderAPI={orderAPI}
                    orderId={selectedOrder.orderId}
                    mongoId={selectedOrder.mongoId}
                  />
                </div>
              )}

              <button
                className="w-full bg-black text-white py-2.5 rounded-xl text-sm font-medium"
                onClick={() => setIsSheetOpen(false)}
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation - Sticky */}
      <BottomNavOrders />
    </div>
  )
}

// Resend Notification Button Component
function ResendNotificationButton({ orderId, mongoId, onSuccess, orderAPI }) {
  const [loading, setLoading] = useState(false);

  const handleResend = async (e) => {
    e.stopPropagation(); // Prevent card click
    if (loading) return;

    try {
      setLoading(true);
      const id = mongoId || orderId;
      const response = await orderAPI.resendDeliveryNotification(id);

      if (response.data?.success) {
        toast.success(`Notification sent to ${response.data.data?.notifiedCount || 0} delivery partners`);
        onSuccess?.(response.data?.data);
      } else {
        toast.error(response.data?.message || 'Failed to send notification');
      }
    } catch (error) {
      console.error('Error resending notification:', error);
      toast.error(error.response?.data?.message || 'Failed to send notification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleResend}
      disabled={loading}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Resend notification to delivery partners"
    >
      {loading ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Sending...</span>
        </>
      ) : (
        <>
          <Volume2 className="w-3 h-3" />
          <span>Resend</span>
        </>
      )}
    </button>
  );
}

// Order Card Component
function OrderCard({
  orderId,
  mongoId,
  status,
  customerName,
  type,
  tableOrToken,
  timePlaced,
  eta,
  itemsSummary,
  photoUrl,
  photoAlt,
  deliveryPartnerId,
  onSelect,
  onCancel,
  onMarkReady,
  isMarkingReady,
  orderAPI,
}) {
  const normalizedStatus = String(status || "").toLowerCase()
  const isReady = normalizedStatus === "ready"

  return (
    <div className="w-full bg-white rounded-2xl p-4 mb-3 border border-gray-200 hover:border-gray-400 transition-colors relative">
      {/* Cancel button - only show for preparing orders */}
      {normalizedStatus === 'preparing' && onCancel && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel({ orderId, mongoId, customerName });
          }}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors z-10"
          title="Cancel Order"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <div
        onClick={() =>
          onSelect?.({
            orderId,
            mongoId,
            status,
            customerName,
            type,
            tableOrToken,
            timePlaced,
            eta,
            itemsSummary,
            deliveryPartnerId,
          })
        }
        className={`w-full text-left flex gap-3 items-stretch cursor-pointer ${normalizedStatus === "preparing" ? "pr-8" : ""}`}
      >
        {/* Photo */}
        <div className="h-20 w-20 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0 my-auto">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={photoAlt}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center px-2">
              <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                {photoAlt}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-between min-h-[80px]">
          {/* Top row */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-black leading-tight">
                Order #{orderId}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                {customerName}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1">
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${isReady
                  ? "border-green-500 text-green-600"
                  : "border-gray-800 text-gray-900"
                  }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isReady ? "bg-green-500" : "bg-gray-800"
                    }`}
                />
                {status}
              </span>
              <span className="text-[11px] text-gray-500 text-right">
                {timePlaced}
              </span>
            </div>
          </div>

          {/* Middle row */}
          <div className="mt-2">
            <p className="text-xs text-gray-600 line-clamp-1">
              {itemsSummary}
            </p>
          </div>

          {/* Bottom row */}
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] text-gray-500">
                {type}
                {tableOrToken ? ` ΓÇó ${tableOrToken}` : ""}
              </p>
              {/* Delivery Assignment Status - Only show for preparing orders */}
              {normalizedStatus === 'preparing' && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${deliveryPartnerId
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : 'bg-orange-100 text-orange-700 border border-orange-300'
                    }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${deliveryPartnerId ? 'bg-green-500' : 'bg-orange-500'
                      }`} />
                    {deliveryPartnerId ? 'Assigned' : 'Not Assigned'}
                  </span>
                  {!deliveryPartnerId && (
                    <ResendNotificationButton orderAPI={orderAPI} orderId={orderId} mongoId={mongoId} />
                  )}
                </div>
              )}
              {normalizedStatus === 'preparing' && onMarkReady && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMarkReady({ orderId, mongoId })
                  }}
                  disabled={Boolean(isMarkingReady)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {isMarkingReady ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  {isMarkingReady ? "Marking..." : "Mark Ready"}
                </button>
              )}
            </div>
            {/* Hide ETA for ready orders */}
            {normalizedStatus !== 'ready' && eta && (
              <div className="flex items-baseline gap-1">
                <span className="text-[11px] text-gray-500">ETA</span>
                <span className="text-xs font-medium text-black">
                  {eta}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Preparing Orders List
function PreparingOrders({ onSelectOrder, onCancel, orderAPI, searchQuery = "", refreshTick = 0 }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [markingReadyById, setMarkingReadyById] = useState({})

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders
    const query = searchQuery.toLowerCase().trim()
    return orders.filter(order =>
      String(order.orderId || "").toLowerCase().includes(query)
    )
  }, [orders, searchQuery])

  useEffect(() => {
    let isMounted = true
    let intervalId = null
    let countdownIntervalId = null

    const fetchOrders = async () => {
      try {
        // Fetch all orders and filter for 'preparing' status on frontend
        const response = await orderAPI.getOrders()

        if (!isMounted) return

        if (response.data?.success && response.data.data?.orders) {
          // Filter orders with 'preparing' status only
          // 'confirmed' orders should only appear in popup notification, not in preparing list
          // After accepting, order status changes to 'preparing' and then appears here
          const preparingOrders = response.data.data.orders.filter((order) => {
            const status = String(order?.status || "").toLowerCase()
            const deliveryStatus = String(order?.deliveryState?.status || "").toLowerCase()
            const deliveryPhase = String(order?.deliveryState?.currentPhase || "").toLowerCase()
            const movedAhead =
              status === "ready" ||
              status === "out_for_delivery" ||
              status === "delivered" ||
              status === "completed" ||
              deliveryStatus === "order_confirmed" ||
              deliveryStatus === "reached_pickup" ||
              deliveryStatus === "delivered" ||
              deliveryPhase === "at_pickup" ||
              deliveryPhase === "en_route_to_delivery" ||
              deliveryPhase === "at_delivery" ||
              deliveryPhase === "completed"

            return status === "preparing" && !movedAhead
          })

          const transformedOrders = preparingOrders.map(order => {
            const initialETA = order.estimatedDeliveryTime || 30 // in minutes
            const preparingTimestamp = order.tracking?.preparing?.timestamp
              ? new Date(order.tracking.preparing.timestamp)
              : new Date(order.createdAt) // Fallback to createdAt if preparing timestamp not available

            return {
              orderId: order.orderId || order._id,
              mongoId: order._id,
              status: String(order.status || 'preparing').toLowerCase(),
              customerName: order.userId?.name || 'Customer',
              type: order.deliveryFleet === 'standard' ? 'Home Delivery' : 'Express Delivery',
              tableOrToken: null,
              timePlaced: new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              initialETA, // Store initial ETA in minutes
              preparingTimestamp, // Store when order started preparing
              itemsSummary: order.items?.map(item => `${item.quantity}x ${item.name}`).join(', ') || 'No items',
              photoUrl: order.items?.[0]?.image || null,
              photoAlt: order.items?.[0]?.name || 'Order',
              deliveryPartnerId: order.deliveryPartnerId || null // Track if delivery partner is assigned
            }
          })

          if (isMounted) {
            setOrders(transformedOrders)
            setLoading(false)
          }
        } else {
          if (isMounted) {
            setOrders([])
            setLoading(false)
          }
        }
      } catch (error) {
        if (!isMounted) return

        // Don't log network errors, 404, or 401 errors
        // 401 is handled by axios interceptor (token refresh/redirect)
        // 404 means no orders found (normal)
        // ERR_NETWORK means backend is down (expected in dev)
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404 && error.response?.status !== 401) {
          console.error('Error fetching preparing orders:', error)
        }

        if (isMounted) {
          setOrders([])
          setLoading(false)
        }
      }
    }

    fetchOrders()

    // Refresh orders every 10 seconds
    intervalId = setInterval(() => {
      if (isMounted && !(typeof document !== "undefined" && document.hidden)) {
        fetchOrders()
      }
    }, 10000)

    // Update countdown every second
    countdownIntervalId = setInterval(() => {
      if (isMounted) {
        setCurrentTime(new Date())
      }
    }, 1000)

    return () => {
      isMounted = false
      if (intervalId) {
        clearInterval(intervalId)
      }
      if (countdownIntervalId) {
        clearInterval(countdownIntervalId)
      }
    }
  }, [orderAPI, refreshTick])

  // Track which orders have been marked as ready to avoid duplicate API calls
  const markedReadyOrdersRef = useRef(new Set())

  const handleMarkReady = async ({ orderId, mongoId }) => {
    const id = mongoId || orderId
    const orderKey = id
    if (!id || markingReadyById[orderKey]) return

    try {
      setMarkingReadyById((prev) => ({ ...prev, [orderKey]: true }))
      markedReadyOrdersRef.current.add(orderKey)
      await orderAPI.markOrderReady(id)
      setOrders((prev) => prev.filter((order) => (order.mongoId || order.orderId) !== orderKey))
      toast.success("Order marked as ready")
    } catch (error) {
      markedReadyOrdersRef.current.delete(orderKey)
      toast.error(error.response?.data?.message || "Failed to mark order as ready")
    } finally {
      setMarkingReadyById((prev) => {
        const next = { ...prev }
        delete next[orderKey]
        return next
      })
    }
  }

  // Auto-mark orders as ready when ETA reaches 0
  useEffect(() => {
    if (!currentTime || orders.length === 0) return

    const checkAndMarkReady = async () => {
      for (const order of orders) {
        const orderKey = order.mongoId || order.orderId

        // Skip if already marked as ready
        if (markedReadyOrdersRef.current.has(orderKey)) {
          continue
        }

        // Calculate remaining ETA
        const elapsedMs = currentTime - order.preparingTimestamp
        const elapsedMinutes = Math.floor(elapsedMs / 60000)
        const remainingMinutes = Math.max(0, order.initialETA - elapsedMinutes)

        // If ETA has reached 0 (or slightly past), mark as ready
        if (remainingMinutes <= 0 && order.status === 'preparing') {
          const elapsedSeconds = Math.floor(elapsedMs / 1000)
          const totalETASeconds = order.initialETA * 60

          // Mark as ready when ETA time has elapsed (with 2 second buffer)
          if (elapsedSeconds >= totalETASeconds - 2) {
            try {
              markedReadyOrdersRef.current.add(orderKey) // Mark as processing
              await orderAPI.markOrderReady(order.mongoId || order.orderId)
              // Order will be removed from preparing list on next fetch
            } catch (error) {
              const status = error.response?.status
              const msg = (error.response?.data?.message || error.message || '').toLowerCase()
              // If 400 and message says order cannot be marked ready (e.g. already ready),
              // treat as idempotent - backend cron or another client already marked it.
              if (status === 400 && (msg.includes('cannot be marked as ready') || msg.includes('current status'))) {
                // Keep in markedReadyOrdersRef so we don't retry; order will disappear on next fetch
              } else {
                console.error(`Γ¥î Failed to auto-mark order ${order.orderId} as ready:`, error)
                markedReadyOrdersRef.current.delete(orderKey)
              }
              // Don't show error toast - it will retry on next check (for non-idempotent errors)
            }
          }
        }
      }
    }

    // Check every 2 seconds for orders that need to be marked ready
    const readyCheckInterval = setInterval(checkAndMarkReady, 2000)

    return () => {
      clearInterval(readyCheckInterval)
    }
  }, [currentTime, orders])

  // Clear marked orders when orders list changes (orders moved to ready)
  useEffect(() => {
    const currentOrderKeys = new Set(orders.map(o => o.mongoId || o.orderId))
    // Remove keys that are no longer in the preparing orders list
    for (const key of markedReadyOrdersRef.current) {
      if (!currentOrderKeys.has(key)) {
        markedReadyOrdersRef.current.delete(key)
      }
    }
  }, [orders])

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">Preparing orders</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">
          Preparing orders
        </h2>
        <span className="text-xs text-gray-500">{filteredOrders.length} active</span>
      </div>
      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          {searchQuery ? "No orders match this ID" : "No orders in preparation"}
        </div>
      ) : (
        <div>
          {filteredOrders.map((order) => {
            // Calculate remaining ETA (countdown)
            const elapsedMs = currentTime - order.preparingTimestamp
            const elapsedMinutes = Math.floor(elapsedMs / 60000)
            const remainingMinutes = Math.max(0, order.initialETA - elapsedMinutes)

            // Format ETA display
            let etaDisplay = ''
            if (remainingMinutes <= 0) {
              const remainingSeconds = Math.max(0, Math.floor((order.initialETA * 60) - (elapsedMs / 1000)))
              if (remainingSeconds > 0) {
                etaDisplay = `${remainingSeconds} secs`
              } else {
                etaDisplay = '0 mins'
              }
            } else {
              etaDisplay = `${remainingMinutes} mins`
            }

            return (
              <OrderCard
                key={order.orderId || order.mongoId}
                orderId={order.orderId}
                mongoId={order.mongoId}
                status={order.status}
                customerName={order.customerName}
                type={order.type}
                tableOrToken={order.tableOrToken}
                timePlaced={order.timePlaced}
                eta={etaDisplay}
                itemsSummary={order.itemsSummary}
                photoUrl={order.photoUrl}
                photoAlt={order.photoAlt}
                deliveryPartnerId={order.deliveryPartnerId}
                onSelect={onSelectOrder}
                onCancel={onCancel}
                onMarkReady={handleMarkReady}
                isMarkingReady={Boolean(markingReadyById[order.mongoId || order.orderId])}
                orderAPI={orderAPI}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// Ready Orders List
function ReadyOrders({ onSelectOrder, orderAPI, searchQuery = "", refreshTick = 0 }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders
    const query = searchQuery.toLowerCase().trim()
    return orders.filter(order =>
      String(order.orderId || "").toLowerCase().includes(query)
    )
  }, [orders, searchQuery])

  useEffect(() => {
    let isMounted = true
    let intervalId = null

    const fetchOrders = async () => {
      try {
        // Fetch all orders and filter for 'ready' status on frontend
        const response = await orderAPI.getOrders()

        if (!isMounted) return

        if (response.data?.success && response.data.data?.orders) {
          // Filter orders with 'ready' status
          const readyOrders = response.data.data.orders.filter(
            order => order.status === 'ready'
          )

          const transformedOrders = readyOrders.map(order => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: String(order.status || 'ready').toLowerCase(),
            customerName: order.userId?.name || 'Customer',
            type: order.deliveryFleet === 'standard' ? 'Home Delivery' : 'Express Delivery',
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            eta: null, // Don't show ETA for ready orders
            itemsSummary: order.items?.map(item => `${item.quantity}x ${item.name}`).join(', ') || 'No items',
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || 'Order'
          }))

          if (isMounted) {
            setOrders(transformedOrders)
            setLoading(false)
          }
        } else {
          if (isMounted) {
            setOrders([])
            setLoading(false)
          }
        }
      } catch (error) {
        if (!isMounted) return

        // Don't log network errors repeatedly - they're expected if backend is down
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          console.error('Error fetching ready orders:', error)
        }

        if (isMounted) {
          setOrders([])
          setLoading(false)
        }
      }
    }

    fetchOrders()

    // Refresh every 10 seconds (reduced frequency to avoid spam if backend is down)
    intervalId = setInterval(() => {
      if (isMounted && !(typeof document !== "undefined" && document.hidden)) {
        fetchOrders()
      }
    }, 10000)

    return () => {
      isMounted = false
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [orderAPI, refreshTick])

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">Ready for pickup</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">
          Ready for pickup
        </h2>
        <span className="text-xs text-gray-500">{filteredOrders.length} active</span>
      </div>
      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          {searchQuery ? "No orders match this ID" : "No orders ready for pickup"}
        </div>
      ) : (
        <div>
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.orderId || order.mongoId}
              {...order}
              onSelect={onSelectOrder}
              orderAPI={orderAPI}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Out for Delivery Orders List
const OutForDeliveryOrders = ({ onSelectOrder, orderAPI, searchQuery = "", refreshTick = 0 }) => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders
    const query = searchQuery.toLowerCase().trim()
    return orders.filter(order =>
      String(order.orderId || "").toLowerCase().includes(query)
    )
  }, [orders, searchQuery])

  useEffect(() => {
    let isMounted = true
    let intervalId = null

    const fetchOrders = async () => {
      try {
        // Fetch all orders and filter for 'out_for_delivery' status on frontend
        const response = await orderAPI.getOrders()

        if (!isMounted) return

        if (response.data?.success && response.data.data?.orders) {
          // Filter orders with 'out_for_delivery' status
          const outForDeliveryOrders = response.data.data.orders.filter(
            order => order.status === 'out_for_delivery'
          )

          const transformedOrders = outForDeliveryOrders.map(order => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || 'out_for_delivery',
            customerName: order.userId?.name || 'Customer',
            type: order.deliveryFleet === 'standard' ? 'Home Delivery' : 'Express Delivery',
            tableOrToken: null,
            timePlaced: new Date(order.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            eta: null,
            itemsSummary: order.items?.map(item => `${item.quantity}x ${item.name}`).join(', ') || 'No items',
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || 'Order'
          }))

          if (isMounted) {
            setOrders(transformedOrders)
            setLoading(false)
          }
        } else {
          if (isMounted) {
            setOrders([])
            setLoading(false)
          }
        }
      } catch (error) {
        if (!isMounted) return

        // Don't log network errors repeatedly - they're expected if backend is down
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          console.error('Error fetching out for delivery orders:', error)
        }

        if (isMounted) {
          setOrders([])
          setLoading(false)
        }
      }
    }

    fetchOrders()

    // Refresh every 10 seconds
    intervalId = setInterval(() => {
      if (isMounted && !(typeof document !== "undefined" && document.hidden)) {
        fetchOrders()
      }
    }, 10000)

    return () => {
      isMounted = false
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [orderAPI, refreshTick])

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">Out for delivery</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">
          Out for delivery
        </h2>
        <span className="text-xs text-gray-500">{filteredOrders.length} active</span>
      </div>
      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          {searchQuery ? "No orders match this ID" : "No orders out for delivery"}
        </div>
      ) : (
        <div>
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.orderId || order.mongoId}
              {...order}
              onSelect={onSelectOrder}
              orderAPI={orderAPI}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Scheduled Orders List
function ScheduledOrders({ onSelectOrder, orderAPI, searchQuery = "", refreshTick = 0 }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders
    const query = searchQuery.toLowerCase().trim()
    return orders.filter(order =>
      String(order.orderId || "").toLowerCase().includes(query)
    )
  }, [orders, searchQuery])

  useEffect(() => {
    let isMounted = true
    let intervalId = null

    const fetchOrders = async () => {
      try {
        const response = await orderAPI.getOrders()

        if (!isMounted) return

        const rawOrders = response?.data?.data?.orders || []
        const now = new Date()
        const scheduledOrders = rawOrders.filter((order) => {
          if (order.status === "scheduled") return true
          if (order.scheduledDelivery?.isScheduled && order.scheduledDelivery?.scheduledFor) {
            return new Date(order.scheduledDelivery.scheduledFor) > now
          }
          return false
        })

        const transformedOrders = scheduledOrders
          .map((order) => ({
            orderId: order.orderId || order._id,
            mongoId: order._id,
            status: order.status || "scheduled",
            customerName: order.userId?.name || "Customer",
            type: order.deliveryFleet === "standard" ? "Home Delivery" : "Express Delivery",
            tableOrToken: null,
            timePlaced: order.scheduledDelivery?.scheduledFor
              ? new Date(order.scheduledDelivery.scheduledFor).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
              : new Date(order.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
            scheduledAt: order.scheduledDelivery?.scheduledFor || order.createdAt,
            eta: null,
            itemsSummary: order.items?.map((item) => `${item.quantity}x ${item.name}`).join(", ") || "No items",
            photoUrl: order.items?.[0]?.image || null,
            photoAlt: order.items?.[0]?.name || "Order",
          }))
          .sort((a, b) => {
            const aTime = new Date(a.scheduledAt)
            const bTime = new Date(b.scheduledAt)
            return aTime - bTime
          })

        if (isMounted) {
          setOrders(transformedOrders)
          setLoading(false)
        }
      } catch (error) {
        if (!isMounted) return
        if (error.code !== "ERR_NETWORK" && error.response?.status !== 404) {
          console.error("Error fetching scheduled orders:", error)
        }
        if (isMounted) {
          setOrders([])
          setLoading(false)
        }
      }
    }

    fetchOrders()
    intervalId = setInterval(() => {
      if (isMounted && !(typeof document !== "undefined" && document.hidden)) {
        fetchOrders()
      }
    }, 10000)

    return () => {
      isMounted = false
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [orderAPI, refreshTick])

  if (loading) {
    return (
      <div className="pt-4 pb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-black">Scheduled orders</h2>
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
        <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="pt-4 pb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-black">Scheduled orders</h2>
        <span className="text-xs text-gray-500">{filteredOrders.length} total</span>
      </div>
      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          {searchQuery ? "No orders match this ID" : "No scheduled orders"}
        </div>
      ) : (
        <div>
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.orderId || order.mongoId}
              {...order}
              onSelect={onSelectOrder}
              orderAPI={orderAPI}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Empty State Component
function EmptyState({ message = "Temporarily closed" }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12">
      {/* Store Illustration */}
      <div className="mb-6">
        <svg
          width="200"
          height="200"
          viewBox="0 0 200 200"
          className="text-gray-300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Storefront */}
          <rect x="40" y="80" width="120" height="80" stroke="currentColor" strokeWidth="2" fill="white" />
          {/* Awning */}
          <path d="M30 80 L100 50 L170 80" stroke="currentColor" strokeWidth="2" fill="white" />
          {/* Doors */}
          <rect x="60" y="100" width="30" height="60" stroke="currentColor" strokeWidth="2" fill="white" />
          <rect x="110" y="100" width="30" height="60" stroke="currentColor" strokeWidth="2" fill="white" />
          {/* Laptop */}
          <rect x="70" y="140" width="40" height="25" stroke="currentColor" strokeWidth="1.5" fill="white" />
          <text x="85" y="155" fontSize="8" fill="currentColor" textAnchor="middle">CLOSED</text>
          {/* Sign */}
          <rect x="80" y="170" width="40" height="20" stroke="currentColor" strokeWidth="1.5" fill="white" />
        </svg>
      </div>

      {/* Message */}
      <h2 className="text-lg font-semibold text-gray-600 mb-4 text-center">
        {message}
      </h2>

      {/* View Status Button */}
      <button className="bg-black text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors">
        View status
      </button>
    </div>
  )
}
