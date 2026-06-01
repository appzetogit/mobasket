import { useMemo, useState } from "react"
import { CheckCircle2, Eye, MapPin, Package, User, Phone, Mail, Calendar, Clock, Truck, CreditCard, X, Receipt, Edit3 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

const getItemKey = (item, index) => String(item?._id || item?.itemId || index)

const buildInitialAvailableItems = (order) => {
  if (!Array.isArray(order?.items)) return {}

  return order.items.reduce((acc, item, index) => {
    const itemKey = getItemKey(item, index)
    const totalQuantity = Math.max(1, Number(item?.quantity || 1))
    acc[itemKey] = {
      itemRef: itemKey,
      itemName: item?.name || "Unknown Item",
      reason: "Item unavailable",
      availableQuantity: totalQuantity,
      maxQuantity: totalQuantity,
      price: Number(item?.price || 0),
      checked: true,
    }
    return acc
  }, {})
}

const getGroceryStatusLabel = (orderStatus) => {
  const map = {
    "Pending": "Order Placed",
    "Scheduled": "Scheduled",
    "Accepted": "Store Accepted",
    "Processing": "Packing",
    "Food On The Way": "Out for Delivery",
    "Grocery On The Way": "Out for Delivery",
    "Delivered": "Delivered",
    "Cancelled by Restaurant": "Cancelled by Store",
    "Cancelled by User": "Cancelled by User",
    "Canceled": "Canceled",
    "Payment Failed": "Payment Failed",
    "Refunded": "Refunded",
    "Offline Payments": "Offline Payments",
  }
  return map[orderStatus] || orderStatus
}

const getStatusColor = (orderStatus, isGrocery = false) => {
  if (isGrocery) {
    const groceryColors = {
      "Order Placed": "bg-blue-100 text-blue-700",
      "Store Accepted": "bg-green-100 text-green-700",
      "Packing": "bg-orange-100 text-orange-700",
      "Out for Delivery": "bg-yellow-100 text-yellow-700",
      "Delivered": "bg-emerald-100 text-emerald-700",
      "Not Accepted in Time": "bg-red-100 text-red-700",
      "Cancelled by Store": "bg-red-100 text-red-700",
      "Cancelled by User": "bg-orange-100 text-orange-700",
      "Payment Failed": "bg-red-100 text-red-700",
      "Refunded": "bg-sky-100 text-sky-700",
      "Scheduled": "bg-blue-100 text-blue-700",
      "Canceled": "bg-rose-100 text-rose-700",
    }
    const mapped = getGroceryStatusLabel(orderStatus)
    return groceryColors[mapped] || "bg-slate-100 text-slate-700"
  }
  const colors = {
    "Delivered": "bg-emerald-100 text-emerald-700",
    "Pending": "bg-blue-100 text-blue-700",
    "Scheduled": "bg-blue-100 text-blue-700",
    "Accepted": "bg-green-100 text-green-700",
    "Processing": "bg-orange-100 text-orange-700",
    "Food On The Way": "bg-yellow-100 text-yellow-700",
    "Not Accepted in Time": "bg-red-100 text-red-700",
    "Canceled": "bg-rose-100 text-rose-700",
    "Cancelled by Restaurant": "bg-red-100 text-red-700",
    "Cancelled by User": "bg-orange-100 text-orange-700",
    "Payment Failed": "bg-red-100 text-red-700",
    "Refunded": "bg-sky-100 text-sky-700",
    "Dine In": "bg-indigo-100 text-indigo-700",
    "Offline Payments": "bg-slate-100 text-slate-700",
  }
  return colors[orderStatus] || "bg-slate-100 text-slate-700"
}

const getPaymentStatusColor = (paymentStatus) => {
  if (paymentStatus === "Paid" || paymentStatus === "Collected") return "text-emerald-600"
  if (paymentStatus === "Not Collected") return "text-amber-600"
  if (paymentStatus === "Unpaid" || paymentStatus === "Failed") return "text-red-600"
  return "text-slate-600"
}

export default function ViewOrderDialog({
  isOpen,
  onOpenChange,
  order,
  isGrocery = false,
  isLoading = false,
  isActionLoading = false,
  onAcceptOrder,
  onRejectOrder,
  onAcceptWithRejectedItems,
}) {
  const [selectedAvailableItems, setSelectedAvailableItems] = useState(() => buildInitialAvailableItems(order))
  const unavailableItemsPayload = useMemo(() => {
    if (!Array.isArray(order?.items)) return []

    return order.items.reduce((acc, item, index) => {
      const itemKey = getItemKey(item, index)
      const selection = selectedAvailableItems[itemKey]
      const orderedQuantity = Math.max(1, Number(item?.quantity || 1))
      const availableQuantity = selection?.checked
        ? Math.min(orderedQuantity, Math.max(0, Number(selection?.availableQuantity || 0)))
        : 0
      const rejectedQuantity = Math.max(0, orderedQuantity - availableQuantity)

      if (rejectedQuantity > 0) {
        acc.push({
          itemRef: itemKey,
          itemName: item?.name || "Unknown Item",
          reason: String(selection?.reason || "").trim() || "Item unavailable",
          quantity: rejectedQuantity,
          maxQuantity: orderedQuantity,
          price: Number(item?.price || 0),
        })
      }

      return acc
    }, [])
  }, [order, selectedAvailableItems])
  const rejectedItemsPreviewAmount = useMemo(
    () =>
      unavailableItemsPayload.reduce(
        (sum, item) => sum + (Number(item?.quantity || 0) * Number(item?.price || 0)),
        0
      ),
    [unavailableItemsPayload]
  )
  const totalRemainingItemUnits = useMemo(() => {
    if (!Array.isArray(order?.items)) return 0

    return order.items.reduce((sum, item, index) => {
      const itemKey = getItemKey(item, index)
      const selection = selectedAvailableItems[itemKey]
      if (!selection?.checked) return sum

      return sum + Math.min(
        Math.max(1, Number(item?.quantity || 1)),
        Math.max(0, Number(selection?.availableQuantity || 0))
      )
    }, 0)
  }, [order, selectedAvailableItems])
  const adjustedSubtotalPreview = Math.max(
    0,
    Number(order?.pricing?.subtotal || 0) - rejectedItemsPreviewAmount
  )
  const adjustedTotalPreview = Math.max(
    0,
    adjustedSubtotalPreview +
      Number(order?.pricing?.deliveryFee || 0) +
      Number(order?.pricing?.platformFee || 0) +
      Number(order?.pricing?.tax || 0) -
      Number(order?.pricing?.discount || 0)
  )

  if (!order) return null

  const deliveryStateStatus = String(order?.deliveryState?.status || "").toLowerCase()
  const hasAcceptedRider = Boolean(
    order?.deliveryState?.acceptedAt ||
    ["accepted", "en_route_to_pickup", "at_pickup", "en_route_to_delivery", "at_delivery", "completed"].includes(deliveryStateStatus) ||
    String(order?.assignmentInfo?.assignedBy || "").toLowerCase() === "delivery_accept" ||
    ["out_for_delivery", "delivered"].includes(String(order?.status || "").toLowerCase())
  )
  const assignedDeliveryPartnerId = String(order?.deliveryPartnerId || "")
  const lastRejectedById = String(order?.assignmentInfo?.lastRejectedBy || "")
  const wasDisplayedRiderLastRejected =
    assignedDeliveryPartnerId &&
    lastRejectedById &&
    assignedDeliveryPartnerId === lastRejectedById
  const showAcceptedRider = Boolean(order?.deliveryPartnerName) && hasAcceptedRider && !wasDisplayedRiderLastRejected
  const showAssignedRider = Boolean(order?.deliveryPartnerName) && !hasAcceptedRider && !wasDisplayedRiderLastRejected
  const canManageItemsBeforeAccept =
    typeof onAcceptWithRejectedItems === "function" &&
    ["pending", "confirmed"].includes(String(order?.status || "").toLowerCase())

  // Debug: Log order data to check billImageUrl
  if (order.billImageUrl) {
    console.log('📸 Bill Image URL found:', order.billImageUrl)
  } else {
    console.log('⚠️ Bill Image URL not found in order:', {
      orderId: order.orderId,
      hasBillImageUrl: !!order.billImageUrl,
      orderKeys: Object.keys(order)
    })
  }

  // Format address for display
  const formatAddress = (address) => {
    if (!address) return "N/A"

    const completeAddress = String(
      address.completeAddress || address.formattedAddress || ""
    ).trim()
    if (completeAddress) return completeAddress

    const parts = []
    if (address.label) parts.push(address.label)
    if (address.street) parts.push(address.street)
    if (address.additionalDetails) parts.push(address.additionalDetails)
    if (address.formattedAddress) {
      parts.push(address.formattedAddress)
    } else {
      if (address.city) parts.push(address.city)
      if (address.state) parts.push(address.state)
      if (address.zipCode) parts.push(address.zipCode)
    }

    return parts.length > 0 ? parts.join(", ") : "Address not available"
  }

  // Get coordinates if available
  const getCoordinates = (address) => {
    if (address?.location?.coordinates && Array.isArray(address.location.coordinates) && address.location.coordinates.length === 2) {
      const [lng, lat] = address.location.coordinates
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    }
    return null
  }

  const handleToggleItemAvailability = (item, index) => {
    const itemKey = getItemKey(item, index)
    const totalQuantity = Math.max(1, Number(item?.quantity || 1))

    setSelectedAvailableItems((prev) => ({
      ...prev,
      [itemKey]: {
        ...(prev[itemKey] || {}),
        itemRef: itemKey,
        itemName: item?.name || "Unknown Item",
        reason: prev[itemKey]?.reason || "Item unavailable",
        availableQuantity: prev[itemKey]?.checked ? 0 : totalQuantity,
        maxQuantity: totalQuantity,
        price: Number(item?.price || 0),
        checked: !prev[itemKey]?.checked,
      },
    }))
  }

  const handleUnavailableReasonChange = (item, index, nextReason) => {
    const itemKey = getItemKey(item, index)

    setSelectedAvailableItems((prev) => {
      if (!prev[itemKey]) return prev

      return {
        ...prev,
        [itemKey]: {
          ...prev[itemKey],
          reason: nextReason,
        },
      }
    })
  }

  const handleAvailableQuantityChange = (item, index, nextValue) => {
    const itemKey = getItemKey(item, index)
    const maxQuantity = Math.max(1, Number(item?.quantity || 1))
    const parsedValue = Number.parseInt(nextValue, 10)
    const sanitizedQuantity = Number.isFinite(parsedValue)
      ? Math.min(maxQuantity, Math.max(0, parsedValue))
      : 0

    setSelectedAvailableItems((prev) => {
      if (!prev[itemKey]) return prev

      return {
        ...prev,
        [itemKey]: {
          ...prev[itemKey],
          availableQuantity: sanitizedQuantity,
          maxQuantity,
          checked: sanitizedQuantity > 0,
        },
      }
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-white p-0 overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-orange-600" />
            Order Details
          </DialogTitle>
          <DialogDescription>
            View complete information about this order
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-6 space-y-6">
          {isLoading && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Loading full order details...
            </div>
          )}
          {/* Basic Order Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Order ID
                </p>
                <p className="text-sm font-medium text-slate-900">{order.orderId || order.id || order.subscriptionId}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Order Date
                </p>
                <p className="text-sm font-medium text-slate-900">{order.date}{order.time ? `, ${order.time}` : ""}</p>
              </div>
              {(order.isScheduled || order.status === "scheduled" || order.orderStatus === "Scheduled") && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Scheduled For
                  </p>
                  <p className="text-sm font-medium text-blue-700">
                    {order.scheduledDate || (order.scheduledFor ? new Date(order.scheduledFor).toLocaleDateString("en-GB") : "N/A")}
                    {(order.scheduledTime || order.scheduledTimeSlot)
                      ? `, ${order.scheduledTime || order.scheduledTimeSlot}`
                      : ""}
                  </p>
                </div>
              )}
              {order.estimatedDeliveryTime && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Estimated Delivery Time
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.estimatedDeliveryTime} minutes</p>
                </div>
              )}
              {order.deliveredAt && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Delivered At
                  </p>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(order.deliveredAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).toUpperCase()}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {order.orderStatus && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Status</p>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.orderStatus, isGrocery)}`}>
                    {isGrocery ? getGroceryStatusLabel(order.orderStatus) : order.orderStatus}
                  </span>
                  {order.cancellationReason && (
                    <p className="text-xs text-red-600 mt-1">
                      <span className="font-medium">
                        {order.cancelledBy === 'user' ? 'Cancelled by User - ' :
                          order.cancelledBy === 'restaurant' ? (isGrocery ? 'Cancelled by Store - ' : 'Cancelled by Restaurant - ') :
                            'Cancellation '}Reason:
                      </span> {order.cancellationReason}
                    </p>
                  )}
                  {order.timedOutByRestaurant && (
                    <p className="text-xs text-red-700 mt-1 font-medium">
                      {isGrocery ? "Store did not accept this order within 4 minutes." : "Restaurant did not accept this order within 4 minutes."}
                    </p>
                  )}
                  {order.cancelledAt && (
                    <p className="text-xs text-slate-500 mt-1">
                      Cancelled: {new Date(order.cancelledAt).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }).toUpperCase()}
                    </p>
                  )}
                </div>
              )}
              {(order.paymentStatus || order.paymentCollectionStatus != null) && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Payment Status
                  </p>
                  <p className={`text-sm font-medium ${getPaymentStatusColor(
                    order.paymentType === 'Cash on Delivery' || order.payment?.method === 'cash' || order.payment?.method === 'cod'
                      ? (order.paymentCollectionStatus ?? (order.status === 'delivered' ? 'Collected' : 'Not Collected'))
                      : order.paymentStatus
                  )}`}>
                    {order.paymentType === 'Cash on Delivery' || order.payment?.method === 'cash' || order.payment?.method === 'cod'
                      ? (order.paymentCollectionStatus ?? (order.status === 'delivered' ? 'Collected' : 'Not Collected'))
                      : order.paymentStatus}
                  </p>
                </div>
              )}
              {order.deliveryType && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Delivery Type
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.deliveryType}</p>
                </div>
              )}
              {/* 2-minute edit/cancel window (MoFood & MoGrocery) */}
              {(order.modificationWindow || order.postOrderActions) && order.status !== 'cancelled' && order.status !== 'delivered' && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Edit3 className="w-4 h-4" />
                    Customer edit/cancel window
                  </p>
                  {order.modificationWindow?.isOpen ? (
                    <p className="text-sm font-medium text-emerald-600">
                      Open — {Math.floor((order.modificationWindow.remainingSeconds || 0) / 60)}:{(order.modificationWindow.remainingSeconds % 60).toString().padStart(2, '0')} remaining
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-slate-500">
                      Expired (customer can no longer edit or cancel)
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Customer Information */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <User className="w-4 h-4" />
              Customer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Name</p>
                <p className="text-sm font-medium text-slate-900">{order.customerName || "N/A"}</p>
              </div>
              {order.customerPhone && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.customerPhone}</p>
                </div>
              )}
              {order.customerEmail && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.customerEmail}</p>
                </div>
              )}
            </div>
          </div>

          {/* Restaurant / Store Information */}
          {order.restaurant && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">{isGrocery ? "Store Information" : "Restaurant Information"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{isGrocery ? "Store Name" : "Restaurant Name"}</p>
                  <p className="text-sm font-medium text-slate-900">{order.restaurant}</p>
                </div>
                {order.restaurantPhone && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Phone
                    </p>
                    <p className="text-sm font-medium text-slate-900">{order.restaurantPhone}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Order Items */}
          {order.items && Array.isArray(order.items) && order.items.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Order Items ({order.items.length})
              </h3>
              <div className="space-y-3">
                {order.items.map((item, index) => (
                  <div key={index} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded">
                          {item.quantity || 1}x
                        </span>
                        <p className="text-sm font-medium text-slate-900">{item.name || "Unknown Item"}</p>
                        {item.isVeg !== undefined && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${item.isVeg ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {item.isVeg ? 'Veg' : 'Non-Veg'}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-1 ml-8">{item.description}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      ₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bill Image (Captured by Delivery Boy) */}
          {(order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl) && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-orange-600" />
                Bill Image (Captured by Delivery Boy)
              </h3>
              <div className="space-y-3">
                <div className="relative w-full max-w-2xl border-2 border-slate-300 rounded-xl overflow-hidden bg-white shadow-sm">
                  <img
                    src={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    alt="Order Bill"
                    className="w-full h-auto object-contain max-h-[500px] mx-auto block"
                    loading="lazy"
                    onError={(e) => {
                      console.error('❌ Failed to load bill image:', e.target.src)
                      e.target.style.display = 'none';
                      const errorDiv = e.target.parentElement.querySelector('.error-message');
                      if (errorDiv) errorDiv.style.display = 'block';
                    }}
                    onLoad={() => {
                      console.log('✅ Bill image loaded successfully')
                    }}
                  />
                  <div className="error-message hidden p-6 text-center text-slate-500 text-sm bg-slate-50">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    Failed to load bill image
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                  >
                    <Eye className="w-4 h-4" />
                    View Full Size
                  </a>
                </div>
              </div>
            </div>
          )}

          {(typeof onAcceptOrder === "function" || typeof onRejectOrder === "function" || canManageItemsBeforeAccept) && (
            <div className="border-t border-slate-200 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                {typeof onRejectOrder === "function" && (
                  <button
                    type="button"
                    onClick={() => onRejectOrder(order)}
                    disabled={isActionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                    <span>Reject Order</span>
                  </button>
                )}
                {typeof onAcceptOrder === "function" && (
                  <button
                    type="button"
                    onClick={() => onAcceptOrder(order)}
                    disabled={isActionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Accept Full Order</span>
                  </button>
                )}
              </div>
              {canManageItemsBeforeAccept && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Item Availability Actions</p>
                      <p className="text-xs text-amber-800 mt-1">
                        Keep checked items as available. Anything unchecked becomes unavailable automatically.
                      </p>
                    </div>
                    {unavailableItemsPayload.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          onAcceptWithRejectedItems(
                            order,
                            unavailableItemsPayload.map((value) => ({
                              ...value,
                              reason: String(value?.reason || "").trim() || "Item unavailable",
                            }))
                          )
                        }
                        disabled={isActionLoading || totalRemainingItemUnits <= 0}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>
                          {totalRemainingItemUnits <= 0
                            ? "Use full reject instead"
                            : "Accept Remaining Items"}
                        </span>
                      </button>
                    )}
                  </div>
                  {unavailableItemsPayload.length > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <span>Current subtotal</span>
                        <span className="font-semibold">₹{Number(order?.pricing?.subtotal || 0).toFixed(2)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-red-600">
                        <span>Unavailable items removed</span>
                        <span className="font-semibold">-₹{rejectedItemsPreviewAmount.toFixed(2)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span>Updated subtotal</span>
                        <span className="font-semibold">₹{adjustedSubtotalPreview.toFixed(2)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-emerald-700">
                        <span>Updated total</span>
                        <span className="font-semibold">₹{adjustedTotalPreview.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 space-y-2">
                    {order.items.map((item, index) => {
                      const itemKey = getItemKey(item, index)
                      const selectedItem = selectedAvailableItems[itemKey]
                      return (
                        <div key={`availability-${itemKey}`} className="rounded-lg bg-white/80 px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={Boolean(selectedItem?.checked)}
                                onChange={() => handleToggleItemAvailability(item, index)}
                                disabled={isActionLoading}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-600"
                              />
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {selectedItem?.checked ? "Available" : "Will be unavailable"}
                                </p>
                                <p className="text-sm font-semibold text-slate-900">
                                  {item.quantity || 1}x {item.name || "Unknown Item"}
                                </p>
                              </div>
                            </label>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-900">
                                ₹{(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}
                              </p>
                              <p className="text-xs text-slate-500">
                                ₹{Number(item.price || 0).toFixed(2)} each
                              </p>
                            </div>
                          </div>
                          {Number(item.quantity || 1) > 1 || !selectedItem?.checked ? (
                            <div className="mt-3 grid gap-3 md:grid-cols-[auto_auto_1fr]">
                              <label className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
                                <span>Available qty</span>
                                <input
                                  type="number"
                                  min="0"
                                  max={Math.max(1, Number(item.quantity || 1))}
                                  value={selectedItem?.checked ? selectedItem.availableQuantity : 0}
                                  onChange={(event) => handleAvailableQuantityChange(item, index, event.target.value)}
                                  disabled={isActionLoading}
                                  className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900"
                                />
                              </label>
                              <div className="text-[11px] font-medium text-slate-600">
                                Customer gets {selectedItem?.checked ? Number(selectedItem.availableQuantity || 0) : 0} of {item.quantity || 1}
                              </div>
                              <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                                <span>Reason shown to customer</span>
                                <input
                                  type="text"
                                  value={selectedItem?.reason || "Item unavailable"}
                                  onChange={(event) => handleUnavailableReasonChange(item, index, event.target.value)}
                                  disabled={isActionLoading}
                                  placeholder="Item unavailable"
                                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900"
                                />
                              </label>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {order.rejectedItems && Array.isArray(order.rejectedItems) && order.rejectedItems.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Rejected Items</h3>
              <div className="space-y-3">
                {order.rejectedItems.map((item, index) => (
                  <div key={`rejected-${getItemKey(item, index)}`} className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-red-900">
                          {item.quantity || 1}x {item.name || "Unknown Item"}
                        </p>
                        <p className="text-xs text-red-700 mt-1">
                          {item.rejectionReason || "Rejected as unavailable"}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-red-900">
                        â‚¹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delivery Address */}
          {order.address && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Delivery Address
              </h3>
              <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-900">{formatAddress(order.address)}</p>
                {getCoordinates(order.address) && (
                  <p className="text-xs text-slate-500 mt-2">
                    <span className="font-medium">Coordinates:</span> {getCoordinates(order.address)}
                  </p>
                )}
                {order.address.label && (
                  <p className="text-xs text-slate-500">
                    <span className="font-medium">Label:</span> {order.address.label}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Delivery Partner Information */}
          {(showAcceptedRider || showAssignedRider || order.assignmentInfo?.lastRejectedByName) && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Delivery Partner
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(showAcceptedRider || showAssignedRider) && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {showAcceptedRider ? "Accepted By" : "Assigned To"}
                    </p>
                    <p className="text-sm font-medium text-slate-900">{order.deliveryPartnerName}</p>
                  </div>
                )}
                {(showAcceptedRider || showAssignedRider) && order.deliveryPartnerPhone && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</p>
                    <p className="text-sm font-medium text-slate-900">{order.deliveryPartnerPhone}</p>
                  </div>
                )}
                {showAcceptedRider && order.deliveryState?.acceptedAt && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Accepted At</p>
                    <p className="text-sm font-medium text-slate-900">
                      {new Date(order.deliveryState.acceptedAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).toUpperCase()}
                    </p>
                  </div>
                )}
                {order.assignmentInfo?.assignedBy && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assignment Source</p>
                    <p className="text-sm font-medium text-slate-900">{order.assignmentInfo.assignedBy}</p>
                  </div>
                )}
                {order.assignmentInfo?.lastRejectedByName && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Declined By</p>
                    <p className="text-sm font-medium text-amber-700">{order.assignmentInfo.lastRejectedByName}</p>
                  </div>
                )}
                {order.assignmentInfo?.lastRejectedAt && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Declined At</p>
                    <p className="text-sm font-medium text-slate-900">
                      {new Date(order.assignmentInfo.lastRejectedAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).toUpperCase()}
                    </p>
                  </div>
                )}
                {order.assignmentInfo?.lastRejectionReason && (
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Decline Reason</p>
                    <p className="text-sm font-medium text-slate-900">{order.assignmentInfo.lastRejectionReason}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pricing Breakdown */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Pricing Breakdown</h3>
            <div className="space-y-2">
              {order.totalItemAmount !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium text-slate-900">₹{order.totalItemAmount.toFixed(2)}</span>
                </div>
              )}
              {order.itemDiscount !== undefined && order.itemDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-medium text-emerald-600">-₹{order.itemDiscount.toFixed(2)}</span>
                </div>
              )}
              {order.couponDiscount !== undefined && order.couponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Coupon Discount</span>
                  <span className="font-medium text-emerald-600">-₹{order.couponDiscount.toFixed(2)}</span>
                </div>
              )}
              {order.deliveryCharge !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Delivery Charge</span>
                  <span className="font-medium text-slate-900">
                    {order.deliveryCharge > 0 ? `₹${order.deliveryCharge.toFixed(2)}` : <span className="text-emerald-600">Free delivery</span>}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Platform Fee</span>
                <span className="font-medium text-slate-900">
                  {order.platformFee !== undefined && order.platformFee > 0
                    ? `₹${order.platformFee.toFixed(2)}`
                    : <span className="text-slate-400">₹0.00</span>}
                </span>
              </div>
              {order.vatTax !== undefined && order.vatTax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tax (GST)</span>
                  <span className="font-medium text-slate-900">₹{order.vatTax.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold text-slate-700">Total Amount</span>
                  <span className="text-xl font-bold text-emerald-600">
                    ₹{(order.totalAmount || order.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
