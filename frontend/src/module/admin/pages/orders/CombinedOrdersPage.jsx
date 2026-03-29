import { useMemo, useState, useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import { BellRing, Loader2 } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import alertSound from "@/assets/audio/alert.mp3"
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
  const knownOrderIdsRef = useRef(new Set())
  const isMountedRef = useRef(true)
  const audioRef = useRef(null)
  const pendingSoundRef = useRef(false)
  const isAudioUnlockedRef = useRef(false)

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
    audioRef.current.pause()
    audioRef.current.currentTime = 0
  }

  const playIncomingSound = () => {
    if (!audioRef.current) {
      pendingSoundRef.current = true
      return
    }

    audioRef.current.loop = true
    audioRef.current.currentTime = 0
    audioRef.current.play().catch(() => {
      pendingSoundRef.current = true
    })
  }

  const updateAlertStateFromHighlightedIds = (ids = []) => {
    const alertCount = Array.isArray(ids) ? ids.length : 0

    if (alertCount > 0) {
      playIncomingSound()
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
        const previousIds = new Set((highlightedOrderIds || []).map((id) => String(id)))
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

        if (pendingSoundRef.current) {
          playIncomingSound()
        }
      } catch {
        // browser still waiting for a direct user gesture
      }
    }

    window.addEventListener("pointerdown", unlockAudio, { once: true })
    window.addEventListener("keydown", unlockAudio, { once: true })
    unlockAudio()

    return () => {
      window.removeEventListener("pointerdown", unlockAudio)
      window.removeEventListener("keydown", unlockAudio)
      if (audioRef.current) {
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
      await adminAPI.acceptStoreOrderFromAdmin(orderIdToUse)
      const nextHighlightedIds = highlightedOrderIds.filter((id) => String(id) !== String(orderIdToUse))
      setHighlightedOrderIds(nextHighlightedIds)
      updateAlertStateFromHighlightedIds(nextHighlightedIds)
      toast.success(
        String(order.restaurantPlatform || "").toLowerCase() === "mogrocery"
          ? `Order ${order.orderId} accepted by store and riders notified`
          : `Order ${order.orderId} accepted by restaurant and riders notified`
      )
      await fetchOrders({ showLoader: false })
    } catch (error) {
      console.error("Error accepting order from combined admin page:", error)
      toast.error(error?.response?.data?.message || "Failed to accept order")
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
      <OrdersTable
        orders={filteredOrders}
        visibleColumns={visibleColumns}
        onViewOrder={handleViewOrder}
        onPrintOrder={handlePrintOrder}
        onRefund={handleRefund}
        onAdminStoreAccept={handleAdminAcceptStoreOrder}
        onAdminStoreReject={handleAdminRejectStoreOrder}
        enableDirectAcceptAction
        onDeleteOrder={handleDeleteOrder}
        highlightedOrderIds={highlightedOrderIds}
      />
    </div>
  )
}
