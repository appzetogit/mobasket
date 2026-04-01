import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import { useLocation } from "react-router-dom"
import { BellRing, Loader2, Search, Bike } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import alertSound from "@/assets/audio/alert.mp3"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import OrdersTopbar from "../../components/orders/OrdersTopbar"
import OrdersTable from "../../components/orders/OrdersTable"
import FilterPanel from "../../components/orders/FilterPanel"
import ViewOrderDialog from "../../components/orders/ViewOrderDialog"
import SettingsDialog from "../../components/orders/SettingsDialog"
import RefundModal from "../../components/orders/RefundModal"
import { useOrdersManagement } from "../../components/orders/useOrdersManagement"

const AUTO_REFRESH_MS = 10000
const SIDEBAR_ALERT_KEY = "adminAllOrdersAttentionUntil"
const ORDERS_ALERT_COUNT_KEY = "adminAllOrdersAttentionState"

const isAwaitingStoreDecision = (order) => {
  const backendStatus = String(order?.status || "").toLowerCase()

  if (!backendStatus) return false
  if (order?.timedOutByRestaurant) return false

  return ["pending", "confirmed", "scheduled"].includes(backendStatus)
}

const hasRiderAcceptedOrder = (order) => {
  const deliveryStateStatus = String(order?.deliveryState?.status || "").toLowerCase()

  return Boolean(
    order?.deliveryState?.acceptedAt ||
    ["accepted", "en_route_to_pickup", "at_pickup", "en_route_to_delivery", "at_delivery", "completed"].includes(deliveryStateStatus) ||
    String(order?.assignmentInfo?.assignedBy || "").toLowerCase() === "delivery_accept" ||
    ["out_for_delivery", "delivered"].includes(String(order?.status || "").toLowerCase())
  )
}

const getOrderTrackingId = (order) =>
  String(order?.id || order?._id || order?.orderId || "").trim()

export default function CombinedOrdersPage() {
  const location = useLocation()
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [viewOrderLoading, setViewOrderLoading] = useState(false)
  const [highlightedOrderIds, setHighlightedOrderIds] = useState([])
  const [processingRefund, setProcessingRefund] = useState(null)
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [selectedOrderForRefund, setSelectedOrderForRefund] = useState(null)
  const [isAssignRiderOpen, setIsAssignRiderOpen] = useState(false)
  const [selectedOrderForAssignment, setSelectedOrderForAssignment] = useState(null)
  const [deliveryPartners, setDeliveryPartners] = useState([])
  const [deliveryPartnersLoading, setDeliveryPartnersLoading] = useState(false)
  const [deliverySearchQuery, setDeliverySearchQuery] = useState("")
  const [assigningDeliveryPartnerId, setAssigningDeliveryPartnerId] = useState("")
  const [dismissedAssignmentOrderIds, setDismissedAssignmentOrderIds] = useState([])
  const [assignmentOrderLoading, setAssignmentOrderLoading] = useState(false)
  const knownOrderIdsRef = useRef(new Set())
  const isMountedRef = useRef(true)
  const audioRef = useRef(null)
  const pendingSoundRef = useRef(false)
  const isAudioUnlockedRef = useRef(false)
  const highlightedOrderIdsRef = useRef([])
  const isStoppingAudioRef = useRef(false)

  const {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    setSelectedOrder,
    filters,
    setFilters,
    visibleColumns,
    filteredOrders,
    count,
    activeFiltersCount,
    restaurants,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  } = useOrdersManagement(orders, "all", "All Platform Orders")

  const selectedOrderIsGrocery = useMemo(
    () => String(selectedOrder?.restaurantPlatform || "").toLowerCase() === "mogrocery",
    [selectedOrder]
  )

  const selectedAssignmentHasAcceptedRider = useMemo(
    () => hasRiderAcceptedOrder(selectedOrderForAssignment),
    [selectedOrderForAssignment]
  )

  const availableDeliveryPartnersForSelectedOrder = useMemo(() => {
    const requiredZoneId = String(selectedOrderForAssignment?.zoneId || "").trim()
    const normalizedSearch = String(deliverySearchQuery || "").trim().toLowerCase()

    return (Array.isArray(deliveryPartners) ? deliveryPartners : []).filter((partner) => {
      const isOnline = Boolean(partner?.availability?.isOnline)
      if (!isOnline) return false

      const partnerZoneIds = Array.isArray(partner?.availability?.zones)
        ? partner.availability.zones
            .map((zone) => String(zone?._id || zone?.id || zone || "").trim())
            .filter(Boolean)
        : []

      if (requiredZoneId && !partnerZoneIds.includes(requiredZoneId)) {
        return false
      }

      if (!normalizedSearch) return true

      const haystack = [
        partner?.name,
        partner?.phone,
        partner?.deliveryId,
        partner?.zone,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ")

      return haystack.includes(normalizedSearch)
    })
  }, [deliveryPartners, deliverySearchQuery, selectedOrderForAssignment])

  const syncSidebarAlertState = (count) => {
    const safeCount = Math.max(0, Number(count) || 0)
    try {
      const payload = JSON.stringify({
        active: safeCount > 0,
        count: safeCount,
        updatedAt: Date.now(),
      })
      localStorage.setItem(ORDERS_ALERT_COUNT_KEY, payload)
      if (safeCount > 0) {
        localStorage.setItem(SIDEBAR_ALERT_KEY, "active")
      } else {
        localStorage.removeItem(SIDEBAR_ALERT_KEY)
      }
    } catch {
      // Ignore storage sync failures.
    }
  }

  const stopIncomingSound = () => {
    pendingSoundRef.current = false
    if (!audioRef.current) return
    isStoppingAudioRef.current = true
    audioRef.current.pause()
    audioRef.current.currentTime = 0
  }

  const playIncomingSound = async () => {
    if (!audioRef.current) {
      pendingSoundRef.current = true
      return
    }

    isStoppingAudioRef.current = false
    audioRef.current.loop = true
    if (audioRef.current.paused || audioRef.current.ended) {
      audioRef.current.currentTime = 0
    }
    try {
      await audioRef.current.play()
      pendingSoundRef.current = false
    } catch {
      pendingSoundRef.current = true
    }
  }

  const ensureIncomingSound = async () => {
    if (!highlightedOrderIdsRef.current.length) {
      stopIncomingSound()
      return
    }

    await playIncomingSound()
  }

  const updateAlertStateFromHighlightedIds = (ids = []) => {
    const alertCount = Array.isArray(ids) ? ids.length : 0

    if (alertCount > 0) {
      ensureIncomingSound()
    } else {
      stopIncomingSound()
    }
    syncSidebarAlertState(alertCount)
  }

  const fetchOrders = async ({ showLoader = true } = {}) => {
    try {
      if (showLoader && isMountedRef.current) {
        setIsLoading(true)
      }

      const [mofoodResponse, mogroceryResponse] = await Promise.all([
        adminAPI.getOrders({ platform: "mofood", page: 1, limit: 100 }),
        adminAPI.getOrders({ platform: "mogrocery", page: 1, limit: 100 }),
      ])

      const mofoodOrders = mofoodResponse?.data?.data?.orders || []
      const mogroceryOrders = mogroceryResponse?.data?.data?.orders || []
      const combinedOrders = [...mofoodOrders, ...mogroceryOrders].sort(
        (a, b) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime()
      )

      const hasBaselineOrders = knownOrderIdsRef.current.size > 0
      const incomingIds = []
      if (hasBaselineOrders) {
        for (const order of combinedOrders) {
          const normalizedId = String(order.id || order._id || order.orderId)
          if (!knownOrderIdsRef.current.has(normalizedId)) {
            incomingIds.push(normalizedId)
          }
        }
      }

      const actionableIncomingIds = incomingIds.filter((incomingId) => {
        const matchingOrder = combinedOrders.find(
          (order) => String(order.id || order._id || order.orderId) === incomingId
        )
        return isAwaitingStoreDecision(matchingOrder)
      })
      const nextHighlightedIds = (() => {
        const previousIds = new Set((highlightedOrderIdsRef.current || []).map((id) => String(id)))
        const combinedIds = new Set([...previousIds, ...actionableIncomingIds])

        return combinedOrders
          .filter((order) => {
            const normalizedId = String(order.id || order._id || order.orderId)
            return combinedIds.has(normalizedId) && isAwaitingStoreDecision(order)
          })
          .map((order) => String(order.id || order._id || order.orderId))
      })()

      if (isMountedRef.current) {
        setHighlightedOrderIds(nextHighlightedIds)
      }
      highlightedOrderIdsRef.current = nextHighlightedIds

      updateAlertStateFromHighlightedIds(nextHighlightedIds)

      if (hasBaselineOrders && actionableIncomingIds.length > 0) {
        toast.info(`${actionableIncomingIds.length} new order${actionableIncomingIds.length > 1 ? "s" : ""} received`)
      }

      knownOrderIdsRef.current = new Set(
        combinedOrders.map((order) => String(order.id || order._id || order.orderId))
      )

      if (isMountedRef.current) {
        setOrders(combinedOrders)
        setLoadError("")
      }
    } catch (error) {
      console.error("Error fetching combined orders:", error)
      const message = error?.response?.data?.message || error.message || "Failed to fetch orders"
      if (showLoader) toast.error(message)
      if (isMountedRef.current) {
        setLoadError(message)
      }
    } finally {
      if (showLoader && isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }

  const mergeOrderIntoCollections = useCallback((nextOrder) => {
    if (!nextOrder) return

    const trackingId = getOrderTrackingId(nextOrder)
    if (!trackingId) return

    setOrders((prev) =>
      prev.map((order) =>
        getOrderTrackingId(order) === trackingId
          ? { ...order, ...nextOrder, restaurantPlatform: nextOrder.restaurantPlatform || order.restaurantPlatform }
          : order
      )
    )

    setSelectedOrder((prev) =>
      prev && getOrderTrackingId(prev) === trackingId
        ? { ...prev, ...nextOrder, restaurantPlatform: nextOrder.restaurantPlatform || prev.restaurantPlatform }
        : prev
    )

    setSelectedOrderForAssignment((prev) =>
      prev && getOrderTrackingId(prev) === trackingId
        ? { ...prev, ...nextOrder, restaurantPlatform: nextOrder.restaurantPlatform || prev.restaurantPlatform }
        : prev
    )
  }, [setSelectedOrder])

  const refreshAssignmentOrderDetails = useCallback(async (orderLike, { silent = false } = {}) => {
    const orderIdToUse = getOrderTrackingId(orderLike)
    if (!orderIdToUse) return null

    try {
      if (!silent) setAssignmentOrderLoading(true)
      const response = await adminAPI.getOrderById(orderIdToUse)
      const nextOrder = response?.data?.data?.order
      if (nextOrder) {
        mergeOrderIntoCollections(nextOrder)
        return nextOrder
      }
      return null
    } catch (error) {
      if (!silent) {
        console.error("Error refreshing assignment order details:", error)
      }
      return null
    } finally {
      if (!silent) setAssignmentOrderLoading(false)
    }
  }, [mergeOrderIntoCollections])

  useEffect(() => {
    isMountedRef.current = true
    fetchOrders({ showLoader: true })

    const intervalId = setInterval(() => {
      fetchOrders({ showLoader: false })
    }, AUTO_REFRESH_MS)

    return () => {
      isMountedRef.current = false
      clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    highlightedOrderIdsRef.current = Array.isArray(highlightedOrderIds) ? highlightedOrderIds : []
  }, [highlightedOrderIds])

  useEffect(() => {
    audioRef.current = new Audio(alertSound)
    audioRef.current.preload = "auto"
    audioRef.current.volume = 0.85

    const unlockAudio = async () => {
      if (!audioRef.current || isAudioUnlockedRef.current) return
      try {
        audioRef.current.muted = true
        await audioRef.current.play()
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current.muted = false
        isAudioUnlockedRef.current = true
        window.removeEventListener("pointerdown", unlockAudio)
        window.removeEventListener("keydown", unlockAudio)

        if (pendingSoundRef.current) {
          ensureIncomingSound()
        }
      } catch {
        // browser still waiting for a direct user gesture
      }
    }

    const handleAudioPaused = () => {
      if (isStoppingAudioRef.current) {
        isStoppingAudioRef.current = false
        return
      }
      if (highlightedOrderIdsRef.current.length > 0) {
        pendingSoundRef.current = true
      }
    }

    const handleAudioEnded = () => {
      if (highlightedOrderIdsRef.current.length > 0) {
        pendingSoundRef.current = true
      }
    }

    audioRef.current.addEventListener("pause", handleAudioPaused)
    audioRef.current.addEventListener("ended", handleAudioEnded)

    window.addEventListener("pointerdown", unlockAudio)
    window.addEventListener("keydown", unlockAudio)
    unlockAudio()

    const retryPendingSound = () => {
      if (pendingSoundRef.current && highlightedOrderIdsRef.current.length > 0) {
        ensureIncomingSound()
      }
    }

    window.addEventListener("focus", retryPendingSound)
    document.addEventListener("visibilitychange", retryPendingSound)
    const watchdogId = window.setInterval(() => {
      if (highlightedOrderIdsRef.current.length > 0) {
        const audioIsPaused = !audioRef.current || audioRef.current.paused || audioRef.current.ended
        if (pendingSoundRef.current || audioIsPaused) {
          ensureIncomingSound()
        }
      }
    }, 2500)

    return () => {
      window.removeEventListener("pointerdown", unlockAudio)
      window.removeEventListener("keydown", unlockAudio)
      window.removeEventListener("focus", retryPendingSound)
      document.removeEventListener("visibilitychange", retryPendingSound)
      window.clearInterval(watchdogId)
      if (audioRef.current) {
        audioRef.current.removeEventListener("pause", handleAudioPaused)
        audioRef.current.removeEventListener("ended", handleAudioEnded)
        stopIncomingSound()
        audioRef.current = null
      }
      pendingSoundRef.current = false
      isAudioUnlockedRef.current = false
    }
  }, [])

  useEffect(() => {
    const prefillOrderSearch = location.state?.prefillOrderSearch
    if (!prefillOrderSearch) return
    setSearchQuery(String(prefillOrderSearch))
  }, [location.state, setSearchQuery])

  useEffect(() => {
    if (!isAssignRiderOpen || !selectedOrderForAssignment) return

    refreshAssignmentOrderDetails(selectedOrderForAssignment)
    const intervalId = window.setInterval(() => {
      refreshAssignmentOrderDetails(selectedOrderForAssignment, { silent: true })
    }, 5000)

    return () => window.clearInterval(intervalId)
  }, [isAssignRiderOpen, refreshAssignmentOrderDetails, selectedOrderForAssignment])

  const handleViewOrder = async (order) => {
    setSelectedOrder(order)
    setIsViewOrderOpen(true)
    setViewOrderLoading(true)

    try {
      const orderIdToUse = order.id || order._id || order.orderId
      const response = await adminAPI.getOrderById(orderIdToUse)
      const detailedOrder = response?.data?.data?.order
      if (detailedOrder) {
        setSelectedOrder({
          ...order,
          ...detailedOrder,
          restaurantPlatform: order.restaurantPlatform || detailedOrder.restaurantPlatform,
        })
      }
    } catch (error) {
      console.error("Error fetching order details:", error)
    } finally {
      setViewOrderLoading(false)
    }
  }

  const handleAdminAcceptStoreOrder = async (order) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found")
      return
    }

    try {
      const response = await adminAPI.acceptStoreOrderFromAdmin(orderIdToUse)
      const nextHighlightedIds = highlightedOrderIds.filter((id) => String(id) !== String(orderIdToUse))
      setHighlightedOrderIds(nextHighlightedIds)
      highlightedOrderIdsRef.current = nextHighlightedIds
      updateAlertStateFromHighlightedIds(nextHighlightedIds)
      toast.success(
        String(order.restaurantPlatform || "").toLowerCase() === "mogrocery"
          ? `Order ${order.orderId} accepted by store`
          : `Order ${order.orderId} accepted by restaurant`
      )
      await fetchOrders({ showLoader: false })

      const assignedRider = response?.data?.data?.rider
      const acceptedAlreadyAssigned = Boolean(response?.data?.data?.accepted)
      if (!assignedRider && !acceptedAlreadyAssigned) {
        await openAssignRiderDialog(order)
      }
    } catch (error) {
      console.error("Error accepting order from combined admin page:", error)
      toast.error(error?.response?.data?.message || "Failed to accept order")
    }
  }

  const openAssignRiderDialog = async (order) => {
    setSelectedOrderForAssignment(order)
    setDeliverySearchQuery("")
    setIsAssignRiderOpen(true)
    setDeliveryPartnersLoading(true)

    try {
      const response = await adminAPI.getDeliveryPartners({
        limit: 300,
        includeAvailability: true,
        isActive: true,
      })

      const partners = response?.data?.data?.deliveryPartners || []
      setDeliveryPartners(Array.isArray(partners) ? partners : [])
      await refreshAssignmentOrderDetails(order, { silent: true })
    } catch (error) {
      console.error("Error fetching delivery partners for manual assignment:", error)
      toast.error(error?.response?.data?.message || "Failed to load delivery partners")
      setDeliveryPartners([])
    } finally {
      setDeliveryPartnersLoading(false)
    }
  }

  const handleAssignRider = async (deliveryPartner) => {
    const orderIdToUse =
      selectedOrderForAssignment?.id ||
      selectedOrderForAssignment?._id ||
      selectedOrderForAssignment?.orderId

    const deliveryPartnerId = deliveryPartner?._id || deliveryPartner?.id

    if (!orderIdToUse || !deliveryPartnerId) {
      toast.error("Order or delivery partner is missing")
      return
    }

    try {
      setAssigningDeliveryPartnerId(String(deliveryPartnerId))
      const response = await adminAPI.assignOrderToDeliveryPartner(orderIdToUse, deliveryPartnerId)
      toast.success(
        response?.data?.data?.reassigned
          ? `Reassigned ${selectedOrderForAssignment?.orderId} to ${deliveryPartner.name || "delivery partner"}`
          : `Assigned ${deliveryPartner.name || "delivery partner"} to order ${selectedOrderForAssignment?.orderId}`
      )
      setDismissedAssignmentOrderIds((prev) =>
        prev.filter((id) => id !== String(orderIdToUse))
      )
      await fetchOrders({ showLoader: false })
      await refreshAssignmentOrderDetails(selectedOrderForAssignment, { silent: true })
    } catch (error) {
      console.error("Error assigning delivery partner manually:", error)
      toast.error(error?.response?.data?.message || "Failed to assign rider")
    } finally {
      setAssigningDeliveryPartnerId("")
    }
  }

  const handleAdminRejectStoreOrder = async (order) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found")
      return
    }

    const reason = window.prompt(`Reject order ${order.orderId}\n\nEnter rejection reason:`)
    if (!reason || !reason.trim()) return

    try {
      await adminAPI.rejectStoreOrderFromAdmin(orderIdToUse, reason.trim())
      const nextHighlightedIds = highlightedOrderIds.filter((id) => String(id) !== String(orderIdToUse))
      setHighlightedOrderIds(nextHighlightedIds)
      highlightedOrderIdsRef.current = nextHighlightedIds
      updateAlertStateFromHighlightedIds(nextHighlightedIds)
      toast.success(
        String(order.restaurantPlatform || "").toLowerCase() === "mogrocery"
          ? `Order ${order.orderId} rejected by store`
          : `Order ${order.orderId} rejected by restaurant`
      )
      await fetchOrders({ showLoader: false })
    } catch (error) {
      console.error("Error rejecting order from combined admin page:", error)
      toast.error(error?.response?.data?.message || "Failed to reject order")
    }
  }

  const handleDeleteOrder = async (order) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found")
      return
    }

    if (!window.confirm(`Delete order ${order.orderId || orderIdToUse} permanently?`)) return

    try {
      await adminAPI.deleteOrder(orderIdToUse)
      toast.success(`Order ${order.orderId || orderIdToUse} deleted`)
      setOrders((prev) =>
        prev.filter(
          (currentOrder) => String(currentOrder.id || currentOrder._id || currentOrder.orderId) !== String(orderIdToUse)
        )
      )
      const nextHighlightedIds = highlightedOrderIds.filter((id) => String(id) !== String(orderIdToUse))
      setHighlightedOrderIds(nextHighlightedIds)
      highlightedOrderIdsRef.current = nextHighlightedIds
      knownOrderIdsRef.current.delete(String(orderIdToUse))
      updateAlertStateFromHighlightedIds(nextHighlightedIds)
    } catch (error) {
      console.error("Error deleting order:", error)
      toast.error(error?.response?.data?.message || "Failed to delete order")
    }
  }

  const handleRefund = (order) => {
    const isWalletPayment = order.paymentType === "Wallet" || order.payment?.method === "wallet"

    if (isWalletPayment) {
      setSelectedOrderForRefund(order)
      setRefundModalOpen(true)
      return
    }

    const confirmMessage = `Are you sure you want to process refund for order ${order.orderId}?`
    if (!window.confirm(confirmMessage)) return
    processRefund(order, null)
  }

  const processRefund = async (order, refundAmount = null) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found")
      return
    }

    try {
      setProcessingRefund(orderIdToUse)
      const requestData = refundAmount !== null ? { refundAmount: parseFloat(refundAmount) } : {}
      const response = await adminAPI.processRefund(orderIdToUse, requestData)

      if (response.data?.success) {
        toast.success(response.data?.message || `Refund processed for order ${order.orderId}`)
        await fetchOrders({ showLoader: false })
      } else {
        toast.error(response.data?.message || "Failed to process refund")
      }
    } catch (error) {
      console.error("Error processing refund:", error)
      toast.error(error?.response?.data?.message || "Failed to process refund")
    } finally {
      setProcessingRefund(null)
      setRefundModalOpen(false)
      setSelectedOrderForRefund(null)
    }
  }

  const handleRefundConfirm = (amount) => {
    if (selectedOrderForRefund) {
      processRefund(selectedOrderForRefund, amount)
    }
  }

  const handleAssignRiderDialogOpenChange = (open) => {
    if (!open && selectedOrderForAssignment) {
      const orderIdToTrack = String(
        selectedOrderForAssignment.id ||
        selectedOrderForAssignment._id ||
        selectedOrderForAssignment.orderId ||
        ""
      )

      if (orderIdToTrack) {
        setDismissedAssignmentOrderIds((prev) =>
          prev.includes(orderIdToTrack) ? prev : [...prev, orderIdToTrack]
        )
      }
    }

    setIsAssignRiderOpen(open)

    if (!open) {
      setSelectedOrderForAssignment(null)
      setDeliverySearchQuery("")
      setAssigningDeliveryPartnerId("")
      setDeliveryPartners([])
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-gray-600">Loading all platform orders...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden">
      <OrdersTopbar
        title="All Platform Orders"
        count={count}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFilterClick={() => setIsFilterOpen(true)}
        activeFiltersCount={activeFiltersCount}
        onExport={handleExport}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      {loadError ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      ) : null}
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-3">
        <BellRing className="w-5 h-5 text-blue-700 shrink-0" />
        <div className="text-sm text-blue-900">
          This list combines MoFoods and MoGrocery orders, auto-refreshes every 10 seconds, and keeps new orders blinking until they are accepted or rejected.
        </div>
      </div>
      <FilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        setFilters={setFilters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        restaurants={restaurants}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        visibleColumns={visibleColumns}
        toggleColumn={toggleColumn}
        resetColumns={resetColumns}
      />
      <ViewOrderDialog
        isOpen={isViewOrderOpen}
        onOpenChange={setIsViewOrderOpen}
        order={selectedOrder}
        isGrocery={selectedOrderIsGrocery}
        isLoading={viewOrderLoading}
      />
      <RefundModal
        isOpen={refundModalOpen}
        onOpenChange={setRefundModalOpen}
        order={selectedOrderForRefund}
        onConfirm={handleRefundConfirm}
        isProcessing={processingRefund !== null}
      />
      <Dialog
        open={isAssignRiderOpen}
        onOpenChange={handleAssignRiderDialogOpenChange}
      >
        <DialogContent
          className="max-w-2xl bg-white p-0 overflow-hidden"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Bike className="w-5 h-5 text-violet-600" />
              Assign Delivery Boy
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              {selectedOrderForAssignment?.orderId
                ? `Choose an online delivery boy for order ${selectedOrderForAssignment.orderId}. Only riders from the same zone are shown.`
                : "Choose an online delivery boy from the same zone."}
            </DialogDescription>
          </DialogHeader>

          {selectedOrderForAssignment && (
            <div className="px-6 py-4 border-b border-slate-200 bg-violet-50/60">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200">
                  Order {selectedOrderForAssignment.orderId}
                </span>
                {selectedAssignmentHasAcceptedRider ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    Accepted by {selectedOrderForAssignment.deliveryPartnerName || "rider"}
                  </span>
                ) : selectedOrderForAssignment.deliveryPartnerName ? (
                  <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                    Waiting for {selectedOrderForAssignment.deliveryPartnerName}
                  </span>
                ) : selectedOrderForAssignment.assignmentInfo?.lastRejectedByName ? (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    Last declined by {selectedOrderForAssignment.assignmentInfo.lastRejectedByName}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
                    No rider assigned yet
                  </span>
                )}
                {assignmentOrderLoading && <Loader2 className="w-4 h-4 animate-spin text-violet-600" />}
              </div>
            </div>
          )}

          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={deliverySearchQuery}
                onChange={(event) => setDeliverySearchQuery(event.target.value)}
                placeholder="Search rider by name, phone, ID..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-3">
            {deliveryPartnersLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
                <p className="text-sm text-slate-500">Loading available delivery boys...</p>
              </div>
            ) : availableDeliveryPartnersForSelectedOrder.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-slate-700">No online delivery boys found for this zone.</p>
                <p className="text-xs text-slate-500 mt-1">Try again when a rider comes online in this zone.</p>
              </div>
            ) : (
              availableDeliveryPartnersForSelectedOrder.map((partner) => {
                const partnerId = String(partner?._id || partner?.id || "")
                const isAssigning = assigningDeliveryPartnerId === partnerId
                const acceptedDeliveryPartnerId = String(selectedOrderForAssignment?.deliveryPartnerId || "")
                const isAcceptedPartner =
                  selectedAssignmentHasAcceptedRider &&
                  acceptedDeliveryPartnerId &&
                  acceptedDeliveryPartnerId === partnerId
                const isCurrentAssignedPartner =
                  String(selectedOrderForAssignment?.deliveryPartnerId || "") === partnerId &&
                  !selectedAssignmentHasAcceptedRider
                return (
                  <div
                    key={partnerId}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">{partner?.name || "Delivery Boy"}</p>
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Online
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{partner?.phone || "No phone"}</p>
                      <p className="text-xs text-slate-500">{partner?.deliveryId || "No rider ID"}</p>
                      <p className="text-xs text-slate-500">{partner?.zone || "Zone not available"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          Active orders: {Number(partner?.assignedOrders || 0)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          Total orders: {Number(partner?.totalOrders || 0)}
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => handleAssignRider(partner)}
                      disabled={Boolean(assigningDeliveryPartnerId) || selectedAssignmentHasAcceptedRider || isCurrentAssignedPartner}
                      className="bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      {isAssigning
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : selectedAssignmentHasAcceptedRider
                          ? (isAcceptedPartner ? "Accepted" : "Locked")
                          : isCurrentAssignedPartner
                            ? "Assigned"
                            : selectedOrderForAssignment?.deliveryPartnerId
                              ? "Reassign"
                              : "Assign"}
                    </Button>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
      <OrdersTable
        orders={filteredOrders}
        visibleColumns={visibleColumns}
        onViewOrder={handleViewOrder}
        onPrintOrder={handlePrintOrder}
        onRefund={handleRefund}
        onAdminStoreAccept={handleAdminAcceptStoreOrder}
        onAdminStoreReject={handleAdminRejectStoreOrder}
        enableDirectAcceptAction
        enableRiderActions
        onAssignRider={openAssignRiderDialog}
        reassignableOrderIds={dismissedAssignmentOrderIds}
        onDeleteOrder={handleDeleteOrder}
        highlightedOrderIds={highlightedOrderIds}
      />
    </div>
  )
}
