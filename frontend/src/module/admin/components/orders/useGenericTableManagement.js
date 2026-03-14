import { useState, useMemo } from "react"
import { exportToExcel, exportToPDF } from "./ordersExportUtils"
import { downloadOrderInvoicePdf } from "./invoicePdfUtils"

export function useGenericTableManagement(data, title, searchFields = []) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({})
  const [visibleColumns, setVisibleColumns] = useState({})

  // Apply search
  const filteredData = useMemo(() => {
    let result = [...data]

    // Apply search query
    if (searchQuery.trim() && searchFields.length > 0) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(item => 
        searchFields.some(field => {
          const value = item[field]
          return value && value.toString().toLowerCase().includes(query)
        })
      )
    }

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "") {
        result = result.filter(item => {
          // Date range handling
          if (key === "fromDate" || key === "toDate") {
            const itemDateRaw = item.createdAt || item.orderDate || item.date || item.originalOrder?.createdAt
            if (!itemDateRaw) return false
            const itemDate = new Date(itemDateRaw)
            if (Number.isNaN(itemDate.getTime())) return false
            if (key === "fromDate") {
              const fromDate = new Date(value)
              fromDate.setHours(0, 0, 0, 0)
              return itemDate >= fromDate
            }
            const toDate = new Date(value)
            toDate.setHours(23, 59, 59, 999)
            return itemDate <= toDate
          }

          // Support common alias fields across different tables
          const itemValue = item[key] ?? (
            key === "restaurant" ? (item.restaurantName ?? item.restaurant) :
            key === "zone" ? (item.zoneName ?? item.zone) :
            undefined
          )

          // Partial matching for free-text filters
          if (typeof value === 'string' && (key === "restaurant" || key === "zone")) {
            return String(itemValue || "").toLowerCase().includes(value.toLowerCase())
          }

          if (typeof value === 'string') {
            return itemValue === value || String(itemValue || "").toLowerCase() === value.toLowerCase()
          }
          return itemValue === value
        })
      }
    })

    return result
  }, [data, searchQuery, filters, searchFields])

  const count = filteredData.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(value => value !== "" && value !== null && value !== undefined).length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({})
  }

  const handleExport = async (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "excel":
        exportToExcel(filteredData, filename)
        break
      case "pdf":
        await exportToPDF(filteredData, filename)
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

  const resetColumns = (defaultColumns) => {
    setVisibleColumns(defaultColumns || {})
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
    filters,
    setFilters,
    visibleColumns,
    filteredData,
    count,
    activeFiltersCount,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}


