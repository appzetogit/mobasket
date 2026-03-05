import { useMemo, useState, useEffect, useRef } from "react"
import { FileText, Calendar, Package, BellRing } from "lucide-react"
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
import { Loader2 } from "lucide-react"
import { usePlatform } from "../../context/PlatformContext"

// Status configuration with titles, colors, and icons
const statusConfig = {
  "all": { title: "All Orders", color: "emerald", icon: FileText },
  "scheduled": { title: "Scheduled Orders", color: "blue", icon: Calendar },
  "pending": { title: "Pending Orders", color: "amber", icon: Package },
  "accepted": { title: "Accepted Orders", color: "green", icon: Package },
  "processing": { title: "Processing Orders", color: "orange", icon: Package },
  "food-on-the-way": { title: "Food On The Way Orders", color: "amber", icon: Package },
  "delivered": { title: "Delivered Orders", color: "emerald", icon: Package },
  "canceled": { title: "Canceled Orders", color: "rose", icon: Package },
  "restaurant-cancelled": { title: "Restaurant Cancelled Orders", color: "red", icon: Package },
  "payment-failed": { title: "Payment Failed Orders", color: "red", icon: Package },
  "refunded": { title: "Refunded Orders", color: "sky", icon: Package },
  "offline-payments": { title: "Offline Payments", color: "slate", icon: Package },
}

export default function OrdersPage({ statusKey = "all", platformOverride }) {
  const config = statusConfig[statusKey] || statusConfig["all"]
  const { platform } = usePlatform()
  const activePlatform = platformOverride || platform || "mofood"
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [processingRefund, setProcessingRefund] = useState(null)
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [selectedOrderForRefund, setSelectedOrderForRefund] = useState(null)
  const audioRef = useRef(null)
  const previousIncomingCountRef = useRef(null)
  const isAudioUnlockedRef = useRef(false)
  const pendingSoundRef = useRef(false)

  const playIncomingSound = () => {
    if (!audioRef.current) {
      pendingSoundRef.current = true
      return
    }
    audioRef.current.currentTime = 0
    audioRef.current.play().catch(() => {
      pendingSoundRef.current = true
    })
  }

  const getIncomingRequestCount = (ordersList = []) => {
    return ordersList.filter((order) =>
      order.canAdminApprove &&
      (order.status === "confirmed" || order.status === "pending" || order.status === "scheduled") &&
      (order.adminApprovalStatus === "pending" || !order.adminApprovalStatus)
    ).length
  }

  const fetchOrders = async ({ showLoader = true } = {}) => {
    try {
      if (showLoader) setIsLoading(true)
      const params = {
        page: 1,
        limit: 1000,
        status: statusKey === "all" ? undefined :
          statusKey === "restaurant-cancelled" ? "cancelled" : statusKey,
        cancelledBy: statusKey === "restaurant-cancelled" ? "restaurant" : undefined,
        platform: activePlatform,
      }

      const response = await adminAPI.getOrders(params)

      if (response.data?.success && response.data?.data?.orders) {
        const fetchedOrders = response.data.data.orders
        setOrders(fetchedOrders)
        setTotalCount(response.data.data.pagination?.total || fetchedOrders.length)

        // Play notification sound on new incoming requests in "All Orders" view.
        if (statusKey === "all") {
          const incomingCount = getIncomingRequestCount(fetchedOrders)
          const previousCount = previousIncomingCountRef.current
          if ((previousCount === null && incomingCount > 0) || (previousCount !== null && incomingCount > previousCount)) {
            playIncomingSound()
            toast.info("New incoming order request received")
          }
          previousIncomingCountRef.current = incomingCount
        }
      } else {
        console.error("Failed to fetch orders:", response.data)
        toast.error("Failed to fetch orders")
        setOrders([])
      }
    } catch (error) {
      console.error("Error fetching orders:", error)
      toast.error(error.response?.data?.message || "Failed to fetch orders")
      setOrders([])
    } finally {
      if (showLoader) setIsLoading(false)
    }
  }

  // Fetch orders from backend API
  useEffect(() => {
    fetchOrders({ showLoader: true })
  }, [statusKey, activePlatform])

  // Poll orders list and trigger sound even when tab is in background.
  useEffect(() => {
    audioRef.current = new Audio(alertSound)
    audioRef.current.preload = "auto"
    audioRef.current.volume = 0.8

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
          pendingSoundRef.current = false
          playIncomingSound()
        }
      } catch {
        // Ignore unlock failures; browser may still require direct user action.
      }
    }

    window.addEventListener("pointerdown", unlockAudio, { once: true })
    window.addEventListener("keydown", unlockAudio, { once: true })
    // Try immediate unlock once (works when browser already has prior user gesture).
    unlockAudio()

    const pollTimer = setInterval(() => {
      fetchOrders({ showLoader: false })
    }, 10000)

    return () => {
      window.removeEventListener("pointerdown", unlockAudio)
      window.removeEventListener("keydown", unlockAudio)
      clearInterval(pollTimer)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }
      isAudioUnlockedRef.current = false
      pendingSoundRef.current = false
    }
  }, [statusKey, activePlatform])

  const handleApproveOrderRequest = async (order) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found")
      return
    }

    try {
      await adminAPI.approveOrderRequest(orderIdToUse)
      toast.success(`Order ${order.orderId} approved`)
      await fetchOrders()
    } catch (error) {
      console.error("Error approving order request:", error)
      toast.error(error?.response?.data?.message || "Failed to approve order")
    }
  }

  const handleRejectOrderRequest = async (order) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found")
      return
    }

    const reason = prompt(`Reject order ${order.orderId}\n\nEnter rejection reason:`)
    if (!reason || !reason.trim()) return

    try {
      await adminAPI.rejectOrderRequest(orderIdToUse, reason.trim())
      toast.success(`Order ${order.orderId} rejected`)
      await fetchOrders()
    } catch (error) {
      console.error("Error rejecting order request:", error)
      toast.error(error?.response?.data?.message || "Failed to reject order")
    }
  }

  const handleResendRiderNotification = async (order) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found")
      return
    }

    try {
      const response = await adminAPI.resendOrderRiderNotification(orderIdToUse)
      const data = response?.data?.data || {}
      if (data.accepted) {
        toast.success("Order already accepted by a rider")
      } else {
        toast.success("Rider notification resent")
      }
      await fetchOrders({ showLoader: false })
    } catch (error) {
      console.error("Error resending rider notification:", error)
      toast.error(error?.response?.data?.message || "Failed to resend rider notification")
    }
  }

  const handleCancelApprovedOrder = async (order) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found")
      return
    }

    const reason = prompt(`Cancel order ${order.orderId}\n\nEnter cancellation reason:`)
    if (!reason || !reason.trim()) return

    try {
      await adminAPI.rejectOrderRequest(orderIdToUse, reason.trim())
      toast.success(`Order ${order.orderId} cancelled`)
      await fetchOrders({ showLoader: false })
    } catch (error) {
      console.error("Error cancelling approved order:", error)
      toast.error(error?.response?.data?.message || "Failed to cancel order")
    }
  }

  const handleShowRiderDetails = async (order) => {
    const orderIdToUse = order.id || order._id || order.orderId
    if (!orderIdToUse) {
      toast.error("Order ID not found")
      return
    }

    try {
      const response = await adminAPI.getOrderRiderAssignmentDetails(orderIdToUse)
      const data = response?.data?.data || {}

      if (data.accepted && data.rider) {
        const acceptedAt = data.acceptedAt ? new Date(data.acceptedAt).toLocaleString("en-IN") : "N/A"
        alert(
          `Rider Accepted\n\n` +
          `Name: ${data.rider.name || "N/A"}\n` +
          `Phone: ${data.rider.phone || "N/A"}\n` +
          `Delivery ID: ${data.rider.deliveryId || "N/A"}\n` +
          `Accepted At: ${acceptedAt}\n` +
          `Phase: ${data.currentPhase || "N/A"}\n` +
          `Status: ${data.deliveryStatus || "N/A"}`
        )
      } else {
        const notifiedAt = data.assignmentInfo?.expandedNotifiedAt || data.assignmentInfo?.priorityNotifiedAt
        alert(
          `No rider has accepted this order yet.\n\n` +
          `Approval Status: ${data.adminApprovalStatus || "N/A"}\n` +
          `Order Status: ${data.status || "N/A"}\n` +
          `Last Notify Phase: ${data.assignmentInfo?.notificationPhase || "N/A"}\n` +
          `Last Notified At: ${notifiedAt ? new Date(notifiedAt).toLocaleString("en-IN") : "N/A"}`
        )
      }
    } catch (error) {
      console.error("Error fetching rider assignment details:", error)
      toast.error(error?.response?.data?.message || "Failed to fetch rider details")
    }
  }

  // Handle refund button click - show modal for wallet payments, confirm dialog for others
  const handleRefund = (order) => {
    const isWalletPayment = order.paymentType === "Wallet" || order.payment?.method === "wallet";

    if (isWalletPayment) {
      // Show modal for wallet refunds
      setSelectedOrderForRefund(order)
      setRefundModalOpen(true)
    } else {
      // For non-wallet payments, use the old confirm dialog flow
      const confirmMessage = `Are you sure you want to process refund for order ${order.orderId}?\n\nThis will initiate a Razorpay refund to the customer's original payment method.`;

      if (!confirm(confirmMessage)) {
        return
      }

      processRefund(order, null) // null amount means use default
    }
  }

  // Process refund with amount
  const processRefund = async (order, refundAmount = null) => {
    // Try using MongoDB _id first (more reliable for route matching), then fallback to orderId string
    // Backend accepts either MongoDB ObjectId (24 chars) or orderId string
    // Using MongoDB _id is more reliable for route matching (no dashes/special chars)
    const orderIdToUse = order.id || order._id || order.orderId

    if (!orderIdToUse) {
      console.error('❌ No orderId found in order object:', order)
      toast.error('Order ID not found. Please refresh the page and try again.')
      return
    }

    console.log('🔍 Order details for refund:', {
      orderIdString: order.orderId,
      mongoId: order.id,
      orderIdToUse,
      willUse: order.orderId ? 'orderId string' : 'MongoDB _id',
      refundAmount
    })

    try {
      setProcessingRefund(orderIdToUse)

      console.log('🔍 Processing refund for order:', {
        orderId: order.orderId,
        id: order.id,
        _id: order._id,
        orderIdToUse,
        refundAmount,
        url: `/api/admin/orders/${orderIdToUse}/refund`
      })

      // Include refundAmount in request body if provided (ensure it's a number)
      const requestData = refundAmount !== null ? { refundAmount: parseFloat(refundAmount) } : {}
      console.log('📤 Request data being sent:', requestData)
      const response = await adminAPI.processRefund(orderIdToUse, requestData)

      if (response.data?.success) {
        const isWalletPayment = order.paymentType === "Wallet" || order.payment?.method === "wallet";
        toast.success(response.data?.message || (isWalletPayment
          ? `Wallet refund of ₹${refundAmount || order.totalAmount} processed successfully for order ${order.orderId}`
          : `Refund initiated successfully for order ${order.orderId}`))
        // Update the order in the local state immediately to show "Refunded" status
        setOrders(prevOrders =>
          prevOrders.map(o =>
            (o.id === order.id || o.orderId === order.orderId)
              ? { ...o, refundStatus: 'processed' } // Wallet refunds are instant, so mark as processed
              : o
          )
        )
        // Refresh the orders list to get updated data
        const params = {
          page: 1,
          limit: 1000,
          status: statusKey === "all" ? undefined :
            statusKey === "restaurant-cancelled" ? "cancelled" : statusKey,
          cancelledBy: statusKey === "restaurant-cancelled" ? "restaurant" : undefined,
          platform: activePlatform,
        }
        const refreshResponse = await adminAPI.getOrders(params)
        if (refreshResponse.data?.success && refreshResponse.data?.data?.orders) {
          setOrders(refreshResponse.data.data.orders)
          setTotalCount(refreshResponse.data.data.pagination?.total || refreshResponse.data.data.orders.length)
        }
      } else {
        toast.error(response.data?.message || "Failed to process refund")
      }
    } catch (error) {
      console.error("❌ Error processing refund:", error)

      // Log full error details for debugging
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: error.config?.baseURL + error.config?.url,
        orderId: orderIdToUse,
        refundAmount: refundAmount,
        order: {
          id: order.id,
          orderId: order.orderId,
          _id: order._id
        },
        stack: error.stack
      }
      console.error("❌ Error details:", JSON.stringify(errorDetails, null, 2))

      // Show more specific error message
      let errorMessage = "Failed to process refund"

      if (error.response) {
        // Server responded with error
        if (error.response.status === 404) {
          errorMessage = `Order not found (ID: ${orderIdToUse}). Please check if the order exists.`
        } else if (error.response.status === 400) {
          errorMessage = error.response.data?.message || "Invalid request. Please check the refund amount."
        } else if (error.response.status === 500) {
          errorMessage = error.response.data?.message || "Server error. Please try again later."
        } else if (error.response.data?.message) {
          errorMessage = error.response.data.message
        } else {
          errorMessage = `Error ${error.response.status}: ${error.response.statusText || "Unknown error"}`
        }
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = "Network error. Please check your internet connection and try again."
      } else {
        // Error in setting up the request
        errorMessage = error.message || "Failed to process refund"
      }

      console.error("❌ Final error message:", errorMessage)
      toast.error(errorMessage)
    } finally {
      setProcessingRefund(null)
      setRefundModalOpen(false)
      setSelectedOrderForRefund(null)
    }
  }

  // Handle refund confirmation from modal
  const handleRefundConfirm = (amount) => {
    if (selectedOrderForRefund) {
      processRefund(selectedOrderForRefund, amount)
    }
  }

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
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  } = useOrdersManagement(orders, statusKey, config.title)

  const pendingApprovalCount = useMemo(() => {
    if (activePlatform !== "mogrocery") return 0

    return filteredOrders.filter((order) =>
      order.canAdminApprove &&
      (order.status === "confirmed" || order.status === "pending" || order.status === "scheduled") &&
      (order.adminApprovalStatus === "pending" || !order.adminApprovalStatus)
    ).length
  }, [filteredOrders, activePlatform])

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-gray-600">Loading orders...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden">
      <OrdersTopbar
        title={config.title}
        count={count}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onFilterClick={() => setIsFilterOpen(true)}
        activeFiltersCount={activeFiltersCount}
        onExport={handleExport}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      {activePlatform === "mogrocery" && pendingApprovalCount > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <BellRing className="w-5 h-5 text-amber-700 shrink-0" />
          <div className="text-sm text-amber-900">
            <span className="font-bold">{pendingApprovalCount}</span>{" "}
            order{pendingApprovalCount > 1 ? "s are" : " is"} awaiting admin approval.
          </div>
        </div>
      )}
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
        isGrocery={activePlatform === "mogrocery"}
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
        onAcceptOrder={handleApproveOrderRequest}
        onRejectOrder={handleRejectOrderRequest}
        enableApprovalActions={activePlatform === "mogrocery" && (statusKey === "all" || statusKey === "scheduled")}
        enableRiderActions={activePlatform === "mogrocery" && statusKey === "all"}
        onResendRiderNotification={handleResendRiderNotification}
        onShowRiderDetails={handleShowRiderDetails}
        onCancelOrder={handleCancelApprovedOrder}
        isGrocery={activePlatform === "mogrocery"}
      />
    </div>
  )
}
