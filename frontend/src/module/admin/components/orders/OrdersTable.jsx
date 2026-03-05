import { useState, useEffect, useMemo } from "react"
import { Eye, Printer, ArrowUpDown, ArrowUp, ArrowDown, Loader2, CheckCircle2, XCircle, BellRing, Info } from "lucide-react"

const getStatusColor = (orderStatus, isGrocery = false) => {
  // Grocery (Blinkit-style) status colors
  if (isGrocery) {
    const groceryColors = {
      "Order Placed": "bg-blue-100 text-blue-700",
      "Store Accepted": "bg-green-100 text-green-700",
      "Packing": "bg-orange-100 text-orange-700",
      "Out for Delivery": "bg-yellow-100 text-yellow-700",
      "Delivered": "bg-emerald-100 text-emerald-700",
      "Cancelled by Store": "bg-red-100 text-red-700",
      "Cancelled by User": "bg-orange-100 text-orange-700",
      "Payment Failed": "bg-red-100 text-red-700",
      "Refunded": "bg-sky-100 text-sky-700",
      "Scheduled": "bg-blue-100 text-blue-700",
      "Canceled": "bg-rose-100 text-rose-700",
      "Offline Payments": "bg-slate-100 text-slate-700",
    }
    // Map backend status to grocery labels for color lookup
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

// Map food-style order status to Blinkit-style grocery labels
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

const getPaymentStatusColor = (paymentStatus) => {
  if (paymentStatus === "Paid") return "text-emerald-600"
  if (paymentStatus === "Unpaid" || paymentStatus === "Failed") return "text-red-600"
  return "text-slate-600"
}

const isAwaitingAdminApproval = (order) =>
  Boolean(order?.canAdminApprove) &&
  (order?.status === "confirmed" || order?.status === "pending" || order?.status === "scheduled") &&
  (order?.adminApprovalStatus === "pending" || !order?.adminApprovalStatus)

export default function OrdersTable({
  orders,
  visibleColumns,
  onViewOrder,
  onPrintOrder,
  onRefund,
  onAcceptOrder,
  onRejectOrder,
  enableApprovalActions = false,
  enableRiderActions = false,
  onResendRiderNotification,
  onShowRiderDetails,
  onCancelOrder,
  isGrocery = false,
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const itemsPerPage = 10
  const totalPages = Math.ceil(orders.length / itemsPerPage)

  // Reset to page 1 when orders change
  useEffect(() => {
    setCurrentPage(1)
  }, [orders.length])

  // Sort orders based on sortConfig
  const sortedOrders = useMemo(() => {
    if (!sortConfig.key) return orders

    const sorted = [...orders].sort((a, b) => {
      let aValue, bValue

      switch (sortConfig.key) {
        case 'si':
          // Sort by index (already sorted by default)
          return sortConfig.direction === 'asc' ? 0 : 0
        case 'orderId':
          aValue = a.orderId || ''
          bValue = b.orderId || ''
          break
        case 'orderDate':
          // Parse date format "02 MAR 2026"
          const parseDate = (dateStr) => {
            const months = {
              "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04", "MAY": "05", "JUN": "06",
              "JUL": "07", "AUG": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"
            }
            const parts = dateStr.split(" ")
            if (parts.length === 3) {
              const day = parts[0].padStart(2, "0")
              const month = months[parts[1].toUpperCase()] || "01"
              const year = parts[2]
              return new Date(`${year}-${month}-${day}`).getTime()
            }
            return new Date(dateStr).getTime()
          }
          aValue = parseDate(a.date || '')
          bValue = parseDate(b.date || '')
          break
        case 'customer':
          aValue = (a.customerName || '').toLowerCase()
          bValue = (b.customerName || '').toLowerCase()
          break
        case 'restaurant':
          aValue = (a.restaurant || '').toLowerCase()
          bValue = (b.restaurant || '').toLowerCase()
          break
        case 'totalAmount':
          aValue = parseFloat(a.totalAmount || 0)
          bValue = parseFloat(b.totalAmount || 0)
          break
        case 'paymentType':
          aValue = (a.paymentType || '').toLowerCase()
          bValue = (b.paymentType || '').toLowerCase()
          break
        case 'paymentStatus':
          aValue = (a.paymentStatus || '').toLowerCase()
          bValue = (b.paymentStatus || '').toLowerCase()
          break
        case 'orderStatus':
          aValue = (a.orderStatus || '').toLowerCase()
          bValue = (b.orderStatus || '').toLowerCase()
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [orders, sortConfig])

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    const end = start + itemsPerPage
    return sortedOrders.slice(start, end)
  }, [sortedOrders, currentPage])

  const handleSort = (key) => {
    setSortConfig(prevConfig => {
      if (prevConfig.key === key) {
        // Toggle direction if same column
        return {
          key,
          direction: prevConfig.direction === 'asc' ? 'desc' : 'asc'
        }
      }
      // New column, default to ascending
      return { key, direction: 'asc' }
    })
    setCurrentPage(1) // Reset to first page when sorting
  }

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="w-4 h-4 text-slate-400 cursor-pointer hover:text-slate-600" />
    }
    if (sortConfig.direction === 'asc') {
      return <ArrowUp className="w-4 h-4 text-blue-600 cursor-pointer hover:text-blue-700" />
    }
    return <ArrowDown className="w-4 h-4 text-blue-600 cursor-pointer hover:text-blue-700" />
  }

  const formatRestaurantName = (name) => {
    if (name === "Cafe Monarch") return "Café Monarch"
    return name
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-32 h-32 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
            <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center shadow-md">
              <span className="text-5xl text-orange-500 font-bold">!</span>
            </div>
          </div>
          <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
          <p className="text-sm text-slate-500">There are no orders matching your criteria</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full max-w-full">
      <div className="overflow-x-auto">
        <table className="w-full min-w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {visibleColumns.si && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>SI</span>
                    <button onClick={() => handleSort('si')} className="flex items-center">
                      {getSortIcon('si')}
                    </button>
                  </div>
                </th>
              )}
              {visibleColumns.orderId && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Order ID</span>
                    <button onClick={() => handleSort('orderId')} className="flex items-center">
                      {getSortIcon('orderId')}
                    </button>
                  </div>
                </th>
              )}
              {visibleColumns.orderDate && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Order Date</span>
                    <button onClick={() => handleSort('orderDate')} className="flex items-center">
                      {getSortIcon('orderDate')}
                    </button>
                  </div>
                </th>
              )}
              {visibleColumns.customer && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Customer Information</span>
                    <button onClick={() => handleSort('customer')} className="flex items-center">
                      {getSortIcon('customer')}
                    </button>
                  </div>
                </th>
              )}
              {visibleColumns.restaurant && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>{isGrocery ? "Store" : "Restaurant"}</span>
                    <button onClick={() => handleSort('restaurant')} className="flex items-center">
                      {getSortIcon('restaurant')}
                    </button>
                  </div>
                </th>
              )}
              {visibleColumns.foodItems && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span>{isGrocery ? "Items" : "Food Items"}</span>
                    <ArrowUpDown className="w-4 h-4 text-slate-400 opacity-50" />
                  </div>
                </th>
              )}
              {visibleColumns.totalAmount && (
                <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center justify-end gap-2">
                    <span>Total Amount</span>
                    <button onClick={() => handleSort('totalAmount')} className="flex items-center">
                      {getSortIcon('totalAmount')}
                    </button>
                  </div>
                </th>
              )}
              {(visibleColumns.paymentType !== false) && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Payment Type</span>
                    <button onClick={() => handleSort('paymentType')} className="flex items-center">
                      {getSortIcon('paymentType')}
                    </button>
                  </div>
                </th>
              )}
              {(visibleColumns.paymentCollectionStatus !== false) && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Payment Status</span>
                    <button onClick={() => handleSort('paymentStatus')} className="flex items-center">
                      {getSortIcon('paymentStatus')}
                    </button>
                  </div>
                </th>
              )}
              {visibleColumns.orderStatus && (
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Order Status</span>
                    <button onClick={() => handleSort('orderStatus')} className="flex items-center">
                      {getSortIcon('orderStatus')}
                    </button>
                  </div>
                </th>
              )}
              {visibleColumns.actions && (
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {paginatedOrders.map((order, index) => (
              <tr
                key={order.orderId}
                className="hover:bg-slate-50 transition-colors"
              >
                {visibleColumns.si && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{(currentPage - 1) * itemsPerPage + index + 1}</span>
                  </td>
                )}
                {visibleColumns.orderId && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-900">{order.orderId}</span>
                  </td>
                )}
                {visibleColumns.orderDate && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-700">{order.date}, {order.time}</span>
                      {(order.isScheduled || order.status === "scheduled" || order.orderStatus === "Scheduled") && (
                        <span className="text-xs text-blue-700 mt-0.5">
                          Scheduled: {order.scheduledDate || (order.scheduledFor ? new Date(order.scheduledFor).toLocaleDateString("en-GB") : "N/A")}
                          {order.scheduledTime || order.scheduledTimeSlot
                            ? `, ${order.scheduledTime || order.scheduledTimeSlot}`
                            : ""}
                        </span>
                      )}
                    </div>
                  </td>
                )}
                {visibleColumns.customer && (
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-700">{order.customerName}</span>
                      <span className="text-xs text-slate-500 mt-0.5">{order.customerPhone}</span>
                    </div>
                  </td>
                )}
                {visibleColumns.restaurant && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-slate-700">{formatRestaurantName(order.restaurant)}</span>
                  </td>
                )}
                {visibleColumns.foodItems && (
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2 min-w-[200px] max-w-md">
                      {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                        order.items.map((item, idx) => (
                          <div key={idx || item.itemId || idx} className="flex items-center gap-2 text-sm">
                            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded min-w-[2.5rem] text-center">
                              {item.quantity || 1}x
                            </span>
                            <span className="text-slate-800 font-medium flex-1">
                              {item.name || 'Unknown Item'}
                            </span>
                            {item.price && (
                              <span className="text-xs text-slate-500">
                                ₹{item.price}
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400 italic">No items found</span>
                      )}
                    </div>
                  </td>
                )}
                {visibleColumns.totalAmount && (
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-slate-900">
                      ₹{order.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-xs mt-0.5 ${getPaymentStatusColor(order.paymentStatus)}`}>
                      {order.paymentStatus}
                    </div>
                  </td>
                )}
                {(visibleColumns.paymentType !== false) && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(() => {
                      // Determine payment type display
                      let paymentTypeDisplay = order.paymentType;

                      if (!paymentTypeDisplay) {
                        const paymentMethod = order.payment?.method || order.paymentMethod;
                        if (paymentMethod === 'cash' || paymentMethod === 'cod') {
                          paymentTypeDisplay = 'Cash on Delivery';
                        } else if (paymentMethod === 'wallet') {
                          paymentTypeDisplay = 'Wallet';
                        } else {
                          paymentTypeDisplay = 'Online';
                        }
                      }

                      // Override if payment method is wallet but paymentType is not set correctly
                      const paymentMethod = order.payment?.method || order.paymentMethod;
                      if (paymentMethod === 'wallet' && paymentTypeDisplay !== 'Wallet') {
                        paymentTypeDisplay = 'Wallet';
                      }

                      const isCod = paymentTypeDisplay === 'Cash on Delivery';
                      const isWallet = paymentTypeDisplay === 'Wallet';

                      return (
                        <span className={`text-sm font-medium ${isCod ? 'text-amber-600' :
                            isWallet ? 'text-purple-600' :
                              'text-emerald-600'
                          }`}>
                          {paymentTypeDisplay}
                        </span>
                      );
                    })()}
                  </td>
                )}
                {(visibleColumns.paymentCollectionStatus !== false) && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(() => {
                      const isCod = order.paymentType === 'Cash on Delivery' || order.payment?.method === 'cash' || order.payment?.method === 'cod'
                      const status = order.paymentCollectionStatus ?? (isCod ? 'Not Collected' : 'Collected')
                      return (
                        <span className={`text-sm font-medium ${status === 'Collected' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {status}
                        </span>
                      )
                    })()}
                  </td>
                )}
                {visibleColumns.orderStatus && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.orderStatus, isGrocery)}`}>
                          {isGrocery ? getGroceryStatusLabel(order.orderStatus) : order.orderStatus}
                        </span>
                        <span className="text-xs text-slate-500">{order.deliveryType}</span>
                      </div>
                      {isAwaitingAdminApproval(order) && (
                        <div className="text-[11px] font-semibold text-amber-700">
                          Awaiting Admin Approval
                        </div>
                      )}
                      {order.cancellationReason && (
                        <div className="text-xs text-red-600 mt-1">
                          <span className="font-medium">
                            {order.cancelledBy === 'user' ? 'Cancelled by User - ' :
                              order.cancelledBy === 'restaurant' ? (isGrocery ? 'Cancelled by Store - ' : 'Cancelled by Restaurant - ') :
                                'Reason: '}
                          </span>
                          {order.cancellationReason}
                        </div>
                      )}
                    </div>
                  </td>
                )}
                {visibleColumns.actions && (
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onViewOrder(order)}
                        className="p-1.5 rounded text-orange-600 hover:bg-orange-50 transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onPrintOrder(order)}
                        className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Print Order"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {enableApprovalActions &&
                        typeof onAcceptOrder === "function" &&
                        typeof onRejectOrder === "function" &&
                        isAwaitingAdminApproval(order) && (
                          <>
                            <button
                              onClick={() => onAcceptOrder(order)}
                              className="p-1.5 rounded text-green-600 hover:bg-green-50 transition-colors"
                              title="Accept Order Request"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onRejectOrder(order)}
                              className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors"
                              title="Reject Order Request"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      {enableRiderActions &&
                        typeof onResendRiderNotification === "function" &&
                        Boolean(order.canAdminApprove) &&
                        String(order.adminApprovalStatus || "") === "approved" &&
                        !order.deliveryPartnerId &&
                        !order.deliveryPartnerName &&
                        order.status === "preparing" && (
                          <button
                            onClick={() => onResendRiderNotification(order)}
                            className="p-1.5 rounded text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Resend notification to riders"
                          >
                            <BellRing className="w-4 h-4" />
                          </button>
                        )}
                      {enableRiderActions &&
                        typeof onCancelOrder === "function" &&
                        Boolean(order.canAdminApprove) &&
                        String(order.adminApprovalStatus || "") === "approved" &&
                        order.status !== "cancelled" &&
                        order.status !== "delivered" && (
                          <button
                            onClick={() => onCancelOrder(order)}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors"
                            title="Cancel Order"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      {enableRiderActions &&
                        typeof onShowRiderDetails === "function" &&
                        Boolean(order.canAdminApprove) && (
                          <button
                            onClick={() => onShowRiderDetails(order)}
                            className="p-1.5 rounded text-sky-600 hover:bg-sky-50 transition-colors"
                            title="Show rider assignment details"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        )}
                      {/* Show Refund button or Refunded status for cancelled orders with Online/Wallet payment (restaurant or user cancelled) */}
                      {(() => {
                        // Check if order is cancelled by restaurant or user
                        const isCancelled = order.orderStatus === "Cancelled by Restaurant" ||
                          order.orderStatus === "Cancelled by Store" ||
                          order.orderStatus === "Cancelled" ||
                          order.orderStatus === "Cancelled by User" ||
                          (order.status === "cancelled" && (order.cancelledBy === "user" || order.cancelledBy === "restaurant"));

                        // Show refund only for non-COD/cash payments.
                        const paymentType = String(order.paymentType || "").toLowerCase();
                        const paymentMethod = String(order.payment?.method || order.paymentMethod || "").toLowerCase();
                        const paymentGatewayMethod = String(order.payment?.paymentMethod || "").toLowerCase();
                        const isCodPayment =
                          paymentType.includes("cash on delivery") ||
                          paymentType === "cod" ||
                          paymentType === "cash" ||
                          paymentMethod === "cash" ||
                          paymentMethod === "cod" ||
                          paymentGatewayMethod === "cash" ||
                          paymentGatewayMethod === "cod";

                        return isCancelled && !isCodPayment;
                      })() && (
                          <>
                            {order.refundStatus === 'processed' || order.refundStatus === 'initiated' ? (
                              <span className={`px-3 py-1.5 rounded-md text-xs font-medium ${order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-emerald-100 text-emerald-700"
                                }`}>
                                {order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                  ? "Wallet Refunded"
                                  : "Refunded"}
                              </span>
                            ) : onRefund ? (
                              <button
                                onClick={() => onRefund(order)}
                                className={`px-3 py-1.5 rounded-md text-white text-xs font-medium hover:opacity-90 transition-colors shadow-sm flex items-center gap-1.5 ${order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                    ? "bg-purple-600 hover:bg-purple-700"
                                    : "bg-blue-600 hover:bg-blue-700"
                                  }`}
                                title={order.paymentType === "Wallet" || order.payment?.method === "wallet"
                                  ? "Process Wallet Refund (Add to user wallet)"
                                  : "Process Refund via Razorpay"}
                              >
                                <span className="text-sm">₹</span>
                                <span>Refund</span>
                              </button>
                            ) : null}
                          </>
                        )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing <span className="font-semibold">{(currentPage - 1) * itemsPerPage + 1}</span> to{" "}
            <span className="font-semibold">{Math.min(currentPage * itemsPerPage, orders.length)}</span> of{" "}
            <span className="font-semibold">{orders.length}</span> orders
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${currentPage === pageNum
                        ? "bg-emerald-500 text-white shadow-md"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

