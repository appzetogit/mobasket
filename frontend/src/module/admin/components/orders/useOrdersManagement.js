import { useState, useMemo } from "react"
import { exportToCSV, exportToExcel, exportToPDF, exportToJSON } from "./ordersExportUtils"
import { downloadOrderInvoicePdf } from "./invoicePdfUtils"

export function useOrdersManagement(orders, statusKey, title) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({
    paymentStatus: "",
    deliveryType: "",
    minAmount: "",
    maxAmount: "",
    fromDate: "",
    toDate: "",
    restaurant: "",
  })
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
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

  // Apply search and filters
  const filteredOrders = useMemo(() => {
    let result = [...orders]
    const normalize = (value) => String(value || "").toLowerCase().replace(/[\s_-]+/g, " ").trim()

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(order => {
        const orderId = (order.orderId || '').toLowerCase()
        const customerName = (order.customerName || '').toLowerCase()
        const restaurant = (order.restaurant || '').toLowerCase()
        const customerPhone = (order.customerPhone || '').toString()
        const totalAmount = (order.totalAmount || 0).toString()
        
        return orderId.includes(query) ||
               customerName.includes(query) ||
               restaurant.includes(query) ||
               customerPhone.includes(query) ||
               totalAmount.includes(query)
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
        const orderPaymentStatus = normalize(
          order.paymentStatus || 
          order.payment?.status || 
          order.paymentStatus || 
          ''
        )
        const filterPaymentStatus = normalize(filters.paymentStatus)
        if (filterPaymentStatus === "all") return true
        if (filterPaymentStatus === "unpaid") return orderPaymentStatus.includes("unpaid") || orderPaymentStatus.includes("not paid")
        if (filterPaymentStatus === "paid") return orderPaymentStatus.includes("paid") || orderPaymentStatus.includes("success") || orderPaymentStatus.includes("collected")
        return orderPaymentStatus === filterPaymentStatus || orderPaymentStatus.includes(filterPaymentStatus)
      })
    }

    if (filters.deliveryType && filters.deliveryType.trim() !== '') {
      result = result.filter(order => {
        // Check multiple possible delivery type fields
        const orderDeliveryType = normalize(
          order.deliveryType || 
          order.delivery?.type || 
          order.orderType ||
          ''
        )
        const filterDeliveryType = normalize(filters.deliveryType)
        if (filterDeliveryType === "all") return true
        if (filterDeliveryType === "home delivery") return orderDeliveryType.includes("delivery")
        if (filterDeliveryType === "take away") return orderDeliveryType.includes("take away") || orderDeliveryType.includes("takeaway") || orderDeliveryType.includes("pickup")
        return orderDeliveryType === filterDeliveryType || orderDeliveryType.includes(filterDeliveryType)
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
        const orderRestaurant = normalize(
          order.restaurant || 
          order.restaurantName || 
          order.restaurant?.name ||
          ''
        )
        const filterRestaurant = normalize(filters.restaurant)
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
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}


