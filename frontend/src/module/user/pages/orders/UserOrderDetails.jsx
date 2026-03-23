import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  ShoppingBag,
  Phone,
  Copy,
  Download,
  User,
  CreditCard,
  Calendar,
  MapPin,
  RotateCcw,
  FileText,
  Star,
  Loader2,
} from "lucide-react"
import { orderAPI, restaurantAPI } from "@/lib/api"
import { toast } from "sonner"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { getCompanyNameAsync } from "@/lib/utils/businessSettings"

const toValidRating = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 5 ? numeric : 0
}

const getRestaurantRatingFromOrder = (orderData) => {
  const restaurantScoped = toValidRating(orderData?.review?.restaurant?.rating)
  if (restaurantScoped > 0) return restaurantScoped

  // Backward compatibility: use shared review.rating only when no delivery-scoped rating exists.
  const hasDeliveryScoped = toValidRating(orderData?.review?.delivery?.rating) > 0
  if (hasDeliveryScoped) return 0

  return toValidRating(orderData?.review?.rating)
}

const getDeliveryRatingFromOrder = (orderData) =>
  toValidRating(orderData?.review?.delivery?.rating)

export default function UserOrderDetails() {
  const navigate = useNavigate()
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [restaurantRating, setRestaurantRating] = useState(0)
  const [deliveryRating, setDeliveryRating] = useState(0)
  const [restaurantComment, setRestaurantComment] = useState("")
  const [deliveryComment, setDeliveryComment] = useState("")
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        setLoading(true)
        const response = await orderAPI.getOrderDetails(orderId)

        let orderData = null
        if (response?.data?.success && response.data.data?.order) {
          orderData = response.data.data.order
        } else if (response?.data?.order) {
          orderData = response.data.order
        } else {
          toast.error("Order not found")
          navigate("/user/orders")
          return
        }

        setOrder(orderData)
        const existingRestaurantRating = getRestaurantRatingFromOrder(orderData)
        const existingDeliveryRating = getDeliveryRatingFromOrder(orderData)
        setRestaurantRating(existingRestaurantRating > 0 ? existingRestaurantRating : 0)
        setDeliveryRating(existingDeliveryRating > 0 ? existingDeliveryRating : 0)
        setRestaurantComment(orderData?.review?.restaurant?.comment || orderData?.review?.comment || "")
        setDeliveryComment(orderData?.review?.delivery?.comment || "")

        // If restaurantId is just a string (not populated), fetch restaurant details separately
        const restaurantId = orderData.restaurantId
        if (restaurantId && typeof restaurantId === 'string' && !orderData.restaurant) {
          try {
            const restaurantResponse = await restaurantAPI.getRestaurantById(restaurantId)
            if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
              setRestaurant(restaurantResponse.data.data.restaurant)
            } else if (restaurantResponse?.data?.restaurant) {
              setRestaurant(restaurantResponse.data.restaurant)
            }
          } catch (restaurantError) {
            console.warn("Failed to fetch restaurant details:", restaurantError)
            // Don't show error toast, just log it - order details can still be shown
          }
        }
      } catch (error) {
        console.error("Error fetching order details:", error)
        toast.error(
          error?.response?.data?.message || "Failed to load order details"
        )
        navigate("/user/orders")
      } finally {
        setLoading(false)
      }
    }

    fetchOrderDetails()
  }, [orderId, navigate])

  const handleCopyOrderId = async () => {
    if (!order) return
    const id = order.orderId || order._id || orderId
    try {
      await navigator.clipboard.writeText(String(id))
      toast.success("Order ID copied")
    } catch {
      toast.error("Failed to copy Order ID")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center dark:bg-[#0b0b0b]">
        <p className="text-gray-600 text-sm dark:text-gray-400">Loading order details...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center dark:bg-[#0b0b0b]">
        <div className="text-center space-y-3">
          <p className="text-gray-700 text-sm font-medium dark:text-gray-200">Order not found</p>
          <button
            onClick={() => navigate("/user/orders")}
            className="px-4 py-2 rounded-lg bg-[#E23744] text-white text-sm font-semibold"
          >
            Back to Orders
          </button>
        </div>
      </div>
    )
  }

  const orderIdDisplay = order.orderId || order._id || orderId
  // Use fetched restaurant data if available, otherwise use order.restaurantId or order.restaurant
  const restaurantObj = restaurant || order.restaurantId || order.restaurant || {}
  const isGroceryOrder = order.restaurantId?.platform === 'mogrocery' || order.platform === 'mogrocery'
  const restaurantName =
    order.restaurantName || restaurantObj.name || (isGroceryOrder ? "Store" : "Restaurant")

  // Build restaurant address (try restaurant fields first, then fall back)
  const restaurantLocation = (() => {
    const loc = restaurantObj.location || {}

    // Priority 1: direct address on restaurant object
    if (restaurantObj.address) return restaurantObj.address

    // Priority 2: formattedAddress from location
    if (loc.formattedAddress) return loc.formattedAddress

    // Priority 3: generic address / street-style fields
    if (loc.address) return loc.address

    if (loc.street || loc.city) {
      const parts = [
        loc.street,
        loc.area,
        loc.city,
        loc.state,
        loc.zipCode || loc.pincode || loc.postalCode,
      ].filter(Boolean)
      if (parts.length) return parts.join(", ")
    }

    // Priority 4: addressLine1 / addressLine2 style
    if (loc.addressLine1) {
      const parts = [
        loc.addressLine1,
        loc.addressLine2,
        loc.city,
        loc.state,
      ].filter(Boolean)
      if (parts.length) return parts.join(", ")
    }

    // Priority 5: order-level restaurantAddress if present
    if (order.restaurantAddress) return order.restaurantAddress

    // Don't fallback to user delivery address - show empty or "Address not available"
    return "Address not available"
  })()

  const items = Array.isArray(order.items) ? order.items : []
  const pricing = order.pricing || {}
  const isDeliveredOrder = String(order.status || "").toLowerCase() === "delivered"
  const hasRatedRestaurant = getRestaurantRatingFromOrder(order) > 0
  const hasRatedDelivery = getDeliveryRatingFromOrder(order) > 0
  const canRateDelivery = isDeliveredOrder && !!order.deliveryPartnerId

  // Payment status flags
  const normalizedPaymentMethod = String(order.payment?.method || order.paymentMethod || "Online").trim().toLowerCase()
  const normalizedPaymentStatus = String(order.payment?.status || '').trim().toLowerCase()
  const isCashPayment = ['cash', 'cod', 'cash_on_delivery', 'cash on delivery'].includes(normalizedPaymentMethod) || normalizedPaymentMethod.includes('cash') || normalizedPaymentMethod.includes('cod')
  const isCompleted = ['delivered', 'completed', 'success'].includes(String(order.status || '').toLowerCase())
  const isRefunded = normalizedPaymentStatus === 'refunded' || normalizedPaymentStatus === 'refund'

  const userName = order.userName || ""
  const userPhone = order.userPhone || ""
  const paymentMethod = order.payment?.method || "Online"
  const paymentDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString("en-IN", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    : ""

  const addressText =
    order.address?.formattedAddress ||
    [order.address?.street, order.address?.city, order.address?.state, order.address?.zipCode]
      .filter(Boolean)
      .join(", ")

  const savings =
    (pricing.discount || 0) +
    (pricing.originalItemTotal || 0) -
    (pricing.subtotal || 0)

  // Restaurant phone (multiple fallbacks) - use fetched restaurant data first
  const restaurantPhone =
    restaurantObj.primaryContactNumber ||
    restaurantObj.phone ||
    restaurantObj.contactNumber ||
    order.restaurantPhone ||
    ""

  const handleCallRestaurant = () => {
    if (!restaurantPhone) {
      toast.error("Restaurant phone number not available")
      return
    }
    window.location.href = `tel:${restaurantPhone}`
  }

  const handleDownloadSummary = async () => {
    try {
      const companyName = await getCompanyNameAsync()
      // Create new PDF document
      const doc = new jsPDF()

      // Title
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(`${companyName} Order: Summary and Receipt`, 105, 20, { align: 'center' })

      // Order details section
      let yPos = 35
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')

      // Order ID
      doc.setFont('helvetica', 'bold')
      doc.text('Order ID:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(orderIdDisplay, 60, yPos)
      yPos += 7

      // Order Time
      doc.setFont('helvetica', 'bold')
      doc.text('Order Time:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const orderTimeLines = doc.splitTextToSize(paymentDate || 'N/A', 130)
      doc.text(orderTimeLines, 60, yPos)
      yPos += orderTimeLines.length * 7

      // Customer Name
      doc.setFont('helvetica', 'bold')
      doc.text('Customer Name:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(userName || 'Customer', 60, yPos)
      yPos += 7

      // Delivery Address
      doc.setFont('helvetica', 'bold')
      doc.text('Delivery Address:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const addressLines = doc.splitTextToSize(addressText || 'N/A', 130)
      doc.text(addressLines, 60, yPos)
      yPos += addressLines.length * 7

      // Restaurant Name
      doc.setFont('helvetica', 'bold')
      doc.text('Restaurant Name:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(restaurantName, 60, yPos)
      yPos += 7

      // Restaurant Address
      doc.setFont('helvetica', 'bold')
      doc.text('Restaurant Address:', 20, yPos)
      doc.setFont('helvetica', 'normal')
      const restaurantAddressLines = doc.splitTextToSize(restaurantLocation || 'N/A', 130)
      doc.text(restaurantAddressLines, 60, yPos)
      yPos += restaurantAddressLines.length * 7 + 5

      // Items table
      const tableData = items.map(item => [
        item.name || 'Item',
        String(item.quantity || item.qty || 1),
        `₹${Number(item.price || 0).toFixed(2)}`,
        `₹${Number((item.price || 0) * (item.quantity || item.qty || 1)).toFixed(2)}`
      ])

      autoTable(doc, {
        startY: yPos,
        head: [['Item', 'Quantity', 'Unit Price', 'Total Price']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold', fontSize: 10 },
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 30, halign: 'center' },
          2: { cellWidth: 35, halign: 'right' },
          3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
        }
      })

      // Get final Y position after table (autoTable adds lastAutoTable property)
      const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY : yPos + (tableData.length * 8) + 20

      // Total
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Total:', 145, finalY + 10, { align: 'right' })
      doc.text(`₹${Number(pricing.total || 0).toFixed(2)}`, 195, finalY + 10, { align: 'right' })

      // Save PDF instantly
      const fileName = `Order_Summary_${orderIdDisplay}_${Date.now()}.pdf`
      doc.save(fileName)

      toast.success("Summary downloaded successfully!")
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast.error("Failed to download summary")
    }
  }

  const handleSubmitReview = async () => {
    if (!order) return

    // Only submit rating blocks that are newly provided in this session.
    // If already rated earlier, avoid re-sending that field (backend rejects duplicates).
    const hasRestaurantReview = !hasRatedRestaurant && restaurantRating > 0
    const hasDeliveryReview = !hasRatedDelivery && deliveryRating > 0

    if (!hasRestaurantReview && !hasDeliveryReview) {
      toast.error("Please rate restaurant and/or delivery")
      return
    }

    try {
      setIsSubmittingReview(true)
      const payload = {}

      if (hasRestaurantReview) {
        payload.restaurantRating = restaurantRating
        if (restaurantComment.trim()) {
          payload.restaurantComment = restaurantComment.trim()
        }
      }

      if (hasDeliveryReview) {
        payload.deliveryRating = deliveryRating
        if (deliveryComment.trim()) {
          payload.deliveryComment = deliveryComment.trim()
        }
      }

      const orderIdForReview = order.orderId || order._id || orderId
      const response = await orderAPI.submitOrderReview(orderIdForReview, payload)
      const updatedOrder = response?.data?.data?.order

      if (updatedOrder) {
        setOrder(updatedOrder)
      }

      toast.success("Thanks for your ratings!")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to submit ratings")
    } finally {
      setIsSubmittingReview(false)
    }
  }

  const renderRatingStars = (current, onSelect, disabled = false) => (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, idx) => {
        const value = idx + 1
        const active = current >= value

        return (
          <button
            key={value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(value)}
            className={`transition-transform ${disabled ? "cursor-not-allowed opacity-70" : "hover:scale-110"}`}
          >
            <Star className={`w-6 h-6 ${active ? "text-yellow-400 fill-yellow-400" : "text-gray-300 dark:text-gray-500"}`} />
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans relative dark:bg-[#0b0b0b] dark:text-gray-100">
      <div className="max-w-[1100px] mx-auto md:pt-20 lg:pt-24 md:pb-6 lg:pb-8">
        {/* Header */}
        <div className="bg-white p-4 flex items-center sticky top-0 z-20 shadow-sm dark:bg-[#111827] dark:border-b dark:border-white/10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/10"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700 cursor-pointer dark:text-gray-200" />
            </button>
            <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Order Details</h1>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-4">
          {/* Status Card */}
          <div className="bg-white p-4 rounded-xl flex items-center gap-3 shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10">
            <div className="bg-gray-100 p-2 rounded-lg dark:bg-[#0f172a]">
              <ShoppingBag className="w-6 h-6 text-gray-600 dark:text-gray-300" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                {order.status === "delivered"
                  ? "Order was delivered"
                  : "Order status: " + (order.status || "Processing")}
              </h2>
            </div>
          </div>

          {/* Store / Restaurant Info Card */}
          <div className="bg-white p-4 rounded-xl shadow-sm dark:bg-[#151a23] dark:border dark:border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <img
                  src={
                    // Prefer the food image from the first ordered item
                    (Array.isArray(items) && items[0]?.image) ||
                    restaurantObj.profileImage?.url ||
                    restaurantObj.profileImage ||
                    order.restaurantImage ||
                    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=100&q=80"
                  }
                  alt={restaurantName}
                  className="w-10 h-10 rounded-lg object-cover"
                />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium dark:text-gray-500">
                    {isGroceryOrder ? "Store" : "Restaurant"}
                  </p>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-100">{restaurantName}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{restaurantLocation}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCallRestaurant}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[#E23744] hover:bg-red-50 dark:border-white/10 dark:hover:bg-white/10"
              >
                <Phone className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-gray-500 uppercase tracking-wide font-medium dark:text-gray-400">
                Order ID: #{orderIdDisplay}
              </span>
              <button type="button" onClick={handleCopyOrderId}>
                <Copy className="w-3 h-3 text-gray-400 cursor-pointer dark:text-gray-500" />
              </button>
            </div>

            <div className="border-t border-dashed border-gray-200 my-3 dark:border-white/10" />

            {/* Items */}
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start mt-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 border ${item.isVeg ? "border-green-600" : "border-red-600"
                      } flex items-center justify-center p-[1px]`}
                  >
                    <div
                      className={`w-full h-full rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-600"
                        }`}
                    />
                  </div>
                  <span className="text-sm text-gray-700 font-medium dark:text-gray-200">
                    {item.quantity || item.qty || 1} x {item.name}
                  </span>
                </div>
                <span className="text-sm text-gray-800 font-medium dark:text-gray-100">
                  ₹{(item.price || 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {/* Bill Summary Card */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden dark:bg-[#151a23] dark:border dark:border-white/10">
            <div className="p-4 flex justify-between items-center border-b border-gray-100 dark:border-white/10">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">Bill Summary</h3>
              </div>
              <button
                type="button"
                onClick={handleDownloadSummary}
                className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center text-[#E23744] hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Item total</span>
                <div>
                  {pricing.originalItemTotal && (
                    <span className="text-gray-400 line-through mr-1 dark:text-gray-500">
                      ₹{Number(pricing.originalItemTotal).toFixed(2)}
                    </span>
                  )}
                  <span className="text-gray-800 dark:text-gray-100">
                    ₹{Number(pricing.subtotal || pricing.total || 0).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">GST (govt. taxes)</span>
                <span className="text-gray-800 dark:text-gray-100">
                  ₹{Number(pricing.tax || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Delivery partner fee</span>
                <div>
                  {pricing.originalDeliveryFee && (
                    <span className="text-gray-400 line-through mr-1 dark:text-gray-500">
                      ₹{Number(pricing.originalDeliveryFee).toFixed(2)}
                    </span>
                  )}
                  <span className="text-blue-500 font-medium uppercase">
                    {pricing.deliveryFee ? `₹${Number(pricing.deliveryFee).toFixed(2)}` : "Free"}
                  </span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Platform fee</span>
                <span className="text-gray-800 dark:text-gray-100">
                  ₹{Number(pricing.platformFee || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Subscription / other fees</span>
                <span className="text-gray-800 dark:text-gray-100">
                  ₹{Number(pricing.subscriptionFee || 0).toFixed(2)}
                </span>
              </div>

              <div className="border-t border-gray-100 my-2 pt-2 flex justify-between items-center dark:border-white/10">
                <span className={`font-bold ${isRefunded ? "text-red-500" : isCashPayment && !isCompleted ? "text-orange-600" : "text-gray-800"} dark:text-gray-100`}>
                  {isRefunded ? "Refunded" : isCashPayment && !isCompleted ? "To be Paid (Cash)" : "Paid"}
                </span>
                <span className="font-bold text-gray-800 dark:text-gray-100">
                  ₹{Number(pricing.total || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Savings Banner */}
            {savings > 0 && (
              <div className="relative bg-blue-50 p-3 pb-4 mt-2 dark:bg-blue-500/10">
                <div className="absolute -top-1.5 left-0 w-full overflow-hidden leading-none">
                  <svg
                    className="relative block w-[calc(100%+1.3px)] h-[8px]"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 1200 120"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M0,0V46.29c47,0,47,69.5,94,69.5s47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5,47-69.5,94-69.5,47,69.5,94,69.5V0Z"
                      fill="#ffffff"
                      className="fill-white dark:fill-[#151a23]"
                    />
                  </svg>
                </div>

                <div className="flex items-center justify-center gap-2 pt-1 text-blue-600 font-bold text-sm dark:text-blue-200">
                  <span>🎉</span>
                  <span>
                    You saved ₹{Number(savings).toFixed(2)} on this order!
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* User & Delivery Details */}
          <div className="bg-white p-4 rounded-xl shadow-sm space-y-5 dark:bg-[#151a23] dark:border dark:border-white/10">
            {/* User */}
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center dark:bg-[#0f172a]">
                <User className="w-5 h-5 text-gray-500 dark:text-gray-300" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 text-sm dark:text-gray-100">
                  {userName || "Customer"}
                </h4>
                <p className="text-gray-500 text-xs dark:text-gray-400">{userPhone}</p>
              </div>
            </div>

            {/* Payment */}
            <div className="flex gap-3">
              <div className="mt-0.5">
                <CreditCard className="w-5 h-5 text-gray-500 dark:text-gray-300" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 text-sm dark:text-gray-100">
                  Payment method
                </h4>
                <div className="text-gray-500 text-xs mt-0.5 dark:text-gray-400">
                  {isRefunded ? (
                    <span className="text-red-500 font-bold uppercase">Refunded</span>
                  ) : (isCashPayment && !isCompleted) ? (
                    <span className="text-orange-600 font-bold uppercase text-[10px]">Payment not completed (CASH)</span>
                  ) : (
                    `Paid via: ${paymentMethod.toUpperCase()}`
                  )}
                </div>
              </div>
            </div>

            {/* Date */}
            <div className="flex gap-3">
              <div className="mt-0.5">
                <Calendar className="w-5 h-5 text-gray-500 dark:text-gray-300" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 text-sm dark:text-gray-100">
                  Payment date
                </h4>
                <p className="text-gray-500 text-xs mt-0.5 dark:text-gray-400">{paymentDate}</p>
              </div>
            </div>

            {/* Address */}
            <div className="flex gap-3">
              <div className="mt-0.5">
                <MapPin className="w-5 h-5 text-gray-500 dark:text-gray-300" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 text-sm dark:text-gray-100">
                  Delivery address
                </h4>
                <p className="text-gray-500 text-xs mt-0.5 leading-relaxed dark:text-gray-400">
                  {addressText || "Address not available"}
                </p>
              </div>
            </div>
          </div>

          {isDeliveredOrder && (
            <div className="bg-white p-4 rounded-xl shadow-sm space-y-4 dark:bg-[#151a23] dark:border dark:border-white/10">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">Rate this order</h3>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Restaurant (out of 5)</p>
                {renderRatingStars(
                  restaurantRating || getRestaurantRatingFromOrder(order),
                  setRestaurantRating,
                  hasRatedRestaurant
                )}
                <textarea
                  rows={2}
                  value={restaurantComment}
                  onChange={(e) => setRestaurantComment(e.target.value)}
                  disabled={hasRatedRestaurant}
                  placeholder="Write restaurant feedback (optional)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:bg-[#0f172a] dark:border-white/10 dark:text-gray-100"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Delivery Partner (out of 5)</p>
                {canRateDelivery ? (
                  <>
                    {renderRatingStars(
                      deliveryRating || getDeliveryRatingFromOrder(order),
                      setDeliveryRating,
                      hasRatedDelivery
                    )}
                    <textarea
                      rows={2}
                      value={deliveryComment}
                      onChange={(e) => setDeliveryComment(e.target.value)}
                      disabled={hasRatedDelivery}
                      placeholder="Write delivery feedback (optional)"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:bg-[#0f172a] dark:border-white/10 dark:text-gray-100"
                    />
                  </>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Delivery partner details are not available for this order.
                  </p>
                )}
              </div>

              {(!hasRatedRestaurant || (!hasRatedDelivery && canRateDelivery)) && (
                <button
                  type="button"
                  onClick={handleSubmitReview}
                  disabled={isSubmittingReview}
                  className="w-full bg-[#E23744] text-white py-2.5 rounded-lg font-semibold hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isSubmittingReview ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Ratings"
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Fixed Bottom Buttons */}
        <div className="fixed bottom-0 w-full bg-white border-t border-gray-200 p-4 flex gap-3 z-20 dark:bg-[#111827] dark:border-white/10">
          <button
            type="button"
            onClick={() => navigate(`/user/restaurants/${order.restaurantId || ""}`)}
            className="flex-1 bg-[#E23744] text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-red-600 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reorder
          </button>
          <button
            type="button"
            onClick={handleDownloadSummary}
            className="flex-1 bg-white border border-[#E23744] text-[#E23744] py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-red-50 transition-colors dark:bg-transparent dark:hover:bg-white/10"
          >
            <Download className="w-4 h-4" />
            Invoice
          </button>
        </div>

        {/* Restaurant Complaint Button - Below Order Details */}
        {order && (
          <div className="p-4 pb-24">
            <button
              type="button"
              onClick={() => {
                // Use MongoDB _id (ObjectId) for the API call - backend complaint controller expects ObjectId
                // Priority: order._id (MongoDB ObjectId) > orderId from route params
                const orderMongoId = order._id || orderId

                if (!orderMongoId) {
                  console.error("Order ID not available:", {
                    order: order ? { _id: order._id, orderId: order.orderId } : null,
                    routeOrderId: orderId
                  })
                  toast.error("Order ID not available. Please refresh the page.")
                  return
                }

                // Convert to string if it's an ObjectId object
                const orderIdString = typeof orderMongoId === 'object' && orderMongoId.toString
                  ? orderMongoId.toString()
                  : String(orderMongoId)

                console.log("Navigating to complaint page with orderId:", orderIdString)
                navigate(`/user/complaints/submit/${encodeURIComponent(orderIdString)}`)
              }}
              className="w-full bg-orange-50 border border-orange-200 text-orange-700 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-orange-100 transition-colors dark:bg-orange-500/10 dark:border-orange-500/30 dark:text-orange-200 dark:hover:bg-orange-500/20"
            >
              <FileText className="w-4 h-4" />
              Restaurant Complaint
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
