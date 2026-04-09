import { useState, useMemo } from "react"
import { exportToCSV, exportToExcel, exportToPDF, exportToJSON } from "./ordersExportUtils"
import { downloadOrderInvoicePdf } from "./invoicePdfUtils"

const normalizeValue = (value) => String(value || "").toLowerCase().replace(/[\s_-]+/g, " ").trim()

const toTitleCase = (value) =>
  String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

const getOrderZoneLabel = (order) => {
  const candidates = [
    order?.zoneName,
    order?.zone,
    order?.zoneId?.name,
    order?.zoneId?.zoneName,
    order?.zoneId?.displayName,
    order?.restaurantZone,
    order?.deliveryZone,
  ]

  const label = candidates.find((value) => String(value || "").trim())
  return label ? String(label).trim() : ""
}

const getOrderDeliveryPartnerLabel = (order) => {
  const candidates = [
    order?.deliveryPartnerName,
    order?.assignmentInfo?.acceptedByName,
    order?.deliveryPartner?.name,
    order?.deliveryBoy?.name,
  ]

  const label = candidates.find((value) => String(value || "").trim())
  return label ? String(label).trim() : ""
}

const getOrderDeliveryStatusLabel = (order) => {
  const rawStatus = String(
    order?.deliveryState?.status ||
    order?.deliveryStatus ||
    ""
  ).trim()

  const rawPhase = String(order?.deliveryState?.currentPhase || "").trim()
  const backendOrderStatus = String(order?.status || "").trim().toLowerCase()

  const explicitState = rawStatus || rawPhase
  if (explicitState) {
    const normalized = normalizeValue(explicitState)
    const labelMap = {
      pending: "Pending",
      assigned: "Assigned",
      accepted: "Accepted",
      "en route to pickup": "En Route To Pickup",
      "at pickup": "At Pickup",
      "reached pickup": "At Pickup",
      "en route to delivery": "Out for Delivery",
      "at delivery": "At Delivery",
      "reached drop": "At Delivery",
      completed: "Delivered",
      delivered: "Delivered",
      cancelled: "Cancelled",
      canceled: "Cancelled",
      "order confirmed": "Accepted",
    }

    return labelMap[normalized] || toTitleCase(normalized)
  }

  if (backendOrderStatus === "out_for_delivery") return "Out for Delivery"
  if (backendOrderStatus === "delivered") return "Delivered"
  if (getOrderDeliveryPartnerLabel(order)) return "Assigned"

  return ""
}

export function useOrdersManagement(orders, statusKey, title) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({
    paymentStatus: "",
    deliveryType: "",
    deliveryPartner: "",
    deliveryStatus: "",
    zone: "",
    minAmount: "",
    maxAmount: "",
    fromDate: "",
    toDate: "",
    restaurant: "",
  })
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    zoneName: true,
    orderId: true,
    orderDate: true,
    customer: true,
    restaurant: true,
    foodItems: true,
    totalAmount: true,
    paymentType: true,
    paymentCollectionStatus: true,
    orderStatus: true,
    actions: true,
  })

  // Get unique restaurants from orders
  const restaurants = useMemo(() => {
    return [...new Set(orders.map(o => o.restaurant))]
  }, [orders])

  const zones = useMemo(() => {
    return [...new Set(
      orders
        .map((order) => getOrderZoneLabel(order))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b))
  }, [orders])

  const deliveryPartners = useMemo(() => {
    return [...new Set(
      orders
        .map((order) => getOrderDeliveryPartnerLabel(order))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b))
  }, [orders])

  const deliveryStatuses = useMemo(() => {
    return [...new Set(
      orders
        .map((order) => getOrderDeliveryStatusLabel(order))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b))
  }, [orders])

  // Apply search and filters
  const filteredOrders = useMemo(() => {
    let result = [...orders]

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(order => {
        const orderId = (order.orderId || '').toLowerCase()
        const customerName = (order.customerName || '').toLowerCase()
        const restaurant = (order.restaurant || '').toLowerCase()
        const customerPhone = (order.customerPhone || '').toString()
        const totalAmount = (order.totalAmount || 0).toString()
        const zoneName = getOrderZoneLabel(order).toLowerCase()
        const deliveryPartner = getOrderDeliveryPartnerLabel(order).toLowerCase()
        
        return orderId.includes(query) ||
               customerName.includes(query) ||
               restaurant.includes(query) ||
               customerPhone.includes(query) ||
               totalAmount.includes(query) ||
               zoneName.includes(query) ||
               deliveryPartner.includes(query)
      })
    }

    // Helper function to parse date format "16 JUL 2025" or ISO date
    const parseOrderDate = (dateStr) => {
      if (!dateStr) return null
      
      // Try parsing as ISO date first (backend might return ISO format)
      if (typeof dateStr === 'string' && (dateStr.includes('T') || dateStr.includes('-'))) {
        const isoDate = new Date(dateStr)
        if (!isNaN(isoDate.getTime())) {
          return isoDate
        }
      }
      
      // If it's already a Date object, return it
      if (dateStr instanceof Date) {
        return isNaN(dateStr.getTime()) ? null : dateStr
      }
      
      // Try parsing format "16 JUL 2025"
      if (typeof dateStr === 'string') {
        const months = {
          "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04", "MAY": "05", "JUN": "06",
          "JUL": "07", "AUG": "08", "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"
        }
        const parts = dateStr.split(" ")
        if (parts.length === 3) {
          const day = parts[0].padStart(2, "0")
          const month = months[parts[1].toUpperCase()] || "01"
          const year = parts[2]
          const parsedDate = new Date(`${year}-${month}-${day}`)
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate
          }
        }
        
        // Fallback: try direct Date parsing
        const fallbackDate = new Date(dateStr)
        if (!isNaN(fallbackDate.getTime())) {
          return fallbackDate
        }
      }
      
      return null
    }

    // Helper function to get order date from various possible fields
    const getOrderDate = (order) => {
      // Try different date fields that might exist (in order of preference)
      const dateStr = order.date || 
                     order.orderDate || 
                     order.createdAt || 
                     order.orderCreatedAt ||
                     order.orderDateCreated ||
                     (order.createdAt ? new Date(order.createdAt) : null)
      
      if (dateStr instanceof Date) {
        return isNaN(dateStr.getTime()) ? null : dateStr
      }
      
      return parseOrderDate(dateStr)
    }

    // Apply filters (only if filter value is not empty)
    if (filters.paymentStatus && filters.paymentStatus.trim() !== '') {
      result = result.filter(order => {
        // Check multiple possible payment status fields
        const orderPaymentStatus = normalizeValue(
          order.paymentStatus || 
          order.payment?.status || 
          order.paymentStatus || 
          ''
        )
        const filterPaymentStatus = normalizeValue(filters.paymentStatus)
        if (filterPaymentStatus === "all") return true
        if (filterPaymentStatus === "unpaid") return orderPaymentStatus.includes("unpaid") || orderPaymentStatus.includes("not paid")
        if (filterPaymentStatus === "paid") return orderPaymentStatus.includes("paid") || orderPaymentStatus.includes("success") || orderPaymentStatus.includes("collected")
        return orderPaymentStatus === filterPaymentStatus || orderPaymentStatus.includes(filterPaymentStatus)
      })
    }

    if (filters.deliveryType && filters.deliveryType.trim() !== '') {
        result = result.filter(order => {
          // Check multiple possible delivery type fields
        const orderDeliveryType = normalizeValue(
          order.deliveryType || 
          order.delivery?.type || 
          order.orderType ||
          ''
        )
        const filterDeliveryType = normalizeValue(filters.deliveryType)
        if (filterDeliveryType === "all") return true
        if (filterDeliveryType === "home delivery") return orderDeliveryType.includes("delivery")
        if (filterDeliveryType === "take away") return orderDeliveryType.includes("take away") || orderDeliveryType.includes("takeaway") || orderDeliveryType.includes("pickup")
        return orderDeliveryType === filterDeliveryType || orderDeliveryType.includes(filterDeliveryType)
      })
    }

    if (filters.deliveryPartner && filters.deliveryPartner.trim() !== '') {
      result = result.filter(order => {
        const orderDeliveryPartner = normalizeValue(getOrderDeliveryPartnerLabel(order))
        const filterDeliveryPartner = normalizeValue(filters.deliveryPartner)
        return orderDeliveryPartner.includes(filterDeliveryPartner)
      })
    }

    if (filters.deliveryStatus && filters.deliveryStatus.trim() !== '') {
      result = result.filter(order => {
        const orderDeliveryStatus = normalizeValue(getOrderDeliveryStatusLabel(order))
        const filterDeliveryStatus = normalizeValue(filters.deliveryStatus)
        return orderDeliveryStatus === filterDeliveryStatus || orderDeliveryStatus.includes(filterDeliveryStatus)
      })
    }

    if (filters.zone && filters.zone.trim() !== '') {
      result = result.filter(order => {
        const orderZone = normalizeValue(getOrderZoneLabel(order))
        const filterZone = normalizeValue(filters.zone)
        return orderZone.includes(filterZone)
      })
    }

    if (filters.minAmount && filters.minAmount.toString().trim() !== '') {
      const minAmount = parseFloat(filters.minAmount)
      if (!isNaN(minAmount) && minAmount > 0) {
        result = result.filter(order => {
          // Check multiple possible amount fields
          const orderAmount = parseFloat(
            order.totalAmount || 
            order.total || 
            order.pricing?.total ||
            order.amount ||
            0
          )
          return !isNaN(orderAmount) && orderAmount >= minAmount
        })
      }
    }

    if (filters.maxAmount && filters.maxAmount.toString().trim() !== '') {
      const maxAmount = parseFloat(filters.maxAmount)
      if (!isNaN(maxAmount) && maxAmount > 0) {
        result = result.filter(order => {
          // Check multiple possible amount fields
          const orderAmount = parseFloat(
            order.totalAmount || 
            order.total || 
            order.pricing?.total ||
            order.amount ||
            0
          )
          return !isNaN(orderAmount) && orderAmount <= maxAmount
        })
      }
    }

    if (filters.restaurant && filters.restaurant.trim() !== '') {
      result = result.filter(order => {
        // Check multiple possible restaurant fields
        const orderRestaurant = normalizeValue(
          order.restaurant || 
          order.restaurantName || 
          order.restaurant?.name ||
          ''
        )
        const filterRestaurant = normalizeValue(filters.restaurant)
        return orderRestaurant.includes(filterRestaurant)
      })
    }

    if (filters.fromDate) {
      const fromDate = new Date(filters.fromDate)
      fromDate.setHours(0, 0, 0, 0) // Start of day
      if (!isNaN(fromDate.getTime())) {
        result = result.filter(order => {
          const orderDate = getOrderDate(order)
          if (!orderDate) return false
          orderDate.setHours(0, 0, 0, 0) // Start of day for comparison
          return orderDate >= fromDate
        })
      }
    }

    if (filters.toDate) {
      const toDate = new Date(filters.toDate)
      toDate.setHours(23, 59, 59, 999) // End of day
      if (!isNaN(toDate.getTime())) {
        result = result.filter(order => {
          const orderDate = getOrderDate(order)
          if (!orderDate) return false
          orderDate.setHours(23, 59, 59, 999) // End of day for comparison
          return orderDate <= toDate
        })
      }
    }

    return result
  }, [orders, searchQuery, filters])

  const count = filteredOrders.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => value !== "").length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({
      paymentStatus: "",
      deliveryType: "",
      deliveryPartner: "",
      deliveryStatus: "",
      zone: "",
      minAmount: "",
      maxAmount: "",
      fromDate: "",
      toDate: "",
      restaurant: "",
    })
  }

  const handleExport = (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "csv":
        exportToCSV(filteredOrders, filename)
        break
      case "excel":
        exportToExcel(filteredOrders, filename)
        break
      case "pdf":
        exportToPDF(filteredOrders, filename)
        break
      case "json":
        exportToJSON(filteredOrders, filename)
        break
      default:
        break
    }
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
    setIsViewOrderOpen(true)
  }

  const handlePrintOrder = async (order) => {
    try {
      await downloadOrderInvoicePdf(order)
    } catch (error) {
      console.error("Error generating PDF invoice:", error)
      alert("Failed to download PDF invoice. Please try again.")
    }
  }

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      zoneName: true,
      orderId: true,
      orderDate: true,
      customer: true,
      restaurant: true,
      foodItems: true,
      totalAmount: true,
      paymentType: true,
      paymentCollectionStatus: true,
      orderStatus: true,
      actions: true,
    })
  }

  return {
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
    zones,
    deliveryPartners,
    deliveryStatuses,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}


