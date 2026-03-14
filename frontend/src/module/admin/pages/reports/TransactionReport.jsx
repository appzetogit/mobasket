import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { BarChart3, ChevronDown, Info, FileText, FileSpreadsheet, Code, Loader2, Settings } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { exportTransactionReportToCSV, exportTransactionReportToExcel, exportTransactionReportToPDF, exportTransactionReportToJSON } from "../../components/reports/reportsExportUtils"
import { adminAPI } from "@/lib/api"
import { usePlatform } from "../../context/PlatformContext"
import { toast } from "sonner"

// Import icons from Transaction-report-icons
import completedIcon from "../../assets/Transaction-report-icons/trx1.png"
import refundedIcon from "../../assets/Transaction-report-icons/trx3.png"
import adminEarningIcon from "../../assets/Transaction-report-icons/admin-earning.png"
import restaurantEarningIcon from "../../assets/Transaction-report-icons/store-earning.png"
import deliverymanEarningIcon from "../../assets/Transaction-report-icons/deliveryman-earning.png"

// Import search and export icons from Dashboard-icons
import searchIcon from "../../assets/Dashboard-icons/image8.png"
import exportIcon from "../../assets/Dashboard-icons/image9.png"

export default function TransactionReport() {
  const PAGE_SIZE = 25
  const navigate = useNavigate()
  const { platform } = usePlatform()
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [transactions, setTransactions] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    pages: 1
  })
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    completedTransaction: 0,
    refundedTransaction: 0,
    adminEarning: 0,
    restaurantEarning: 0,
    deliverymanEarning: 0
  })
  const [draftFilters, setDraftFilters] = useState({
    zone: "All Zones",
    restaurant: `All ${platform === "mogrocery" ? "stores" : "restaurants"}`,
    time: "All Time",
  })
  const [filters, setFilters] = useState({
    zone: "All Zones",
    restaurant: `All ${platform === "mogrocery" ? "stores" : "restaurants"}`,
    time: "All Time",
  })
  const [zones, setZones] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const isGroceryPlatform = platform === "mogrocery"
  const outletLabel = isGroceryPlatform ? "stores" : "restaurants"

  useEffect(() => {
    const defaultRestaurant = `All ${outletLabel}`
    setDraftFilters({
      zone: "All Zones",
      restaurant: defaultRestaurant,
      time: "All Time",
    })
    setFilters((prev) => ({
      ...prev,
      restaurant: defaultRestaurant
    }))
    setSearchInput("")
    setSearchQuery("")
    setCurrentPage(1)
  }, [outletLabel])

  // Fetch zones and restaurants for filters
  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        // Fetch zones
        const zonesResponse = await adminAPI.getZones({ limit: 1000, platform })
        if (zonesResponse?.data?.success && zonesResponse.data.data?.zones) {
          setZones(zonesResponse.data.data.zones)
        }

        if (isGroceryPlatform) {
          const storesResponse = await adminAPI.getGroceryStores({ limit: 1000, isActive: true })
          const stores = storesResponse?.data?.data?.stores || storesResponse?.data?.stores || []
          setRestaurants(Array.isArray(stores) ? stores : [])
        } else {
          const restaurantsResponse = await adminAPI.getRestaurants({ limit: 1000, platform: "mofood" })
          if (restaurantsResponse?.data?.success && restaurantsResponse.data.data?.restaurants) {
            setRestaurants(restaurantsResponse.data.data.restaurants)
          } else {
            setRestaurants([])
          }
        }
      } catch (error) {
        console.error("Error fetching filter data:", error)
        setRestaurants([])
      }
    }
    fetchFilterData()
  }, [platform, isGroceryPlatform])

  // Fetch transaction report data
  useEffect(() => {
    const fetchTransactionReport = async () => {
      try {
        setLoading(true)
        
        // Build date range based on time filter
        let fromDate = null
        let toDate = null
        const now = new Date()
        
        if (filters.time === "Today") {
          fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
        } else if (filters.time === "This Week") {
          const dayOfWeek = now.getDay()
          const diff = now.getDate() - dayOfWeek
          fromDate = new Date(now.getFullYear(), now.getMonth(), diff)
          toDate = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59)
        } else if (filters.time === "This Month") {
          fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
          toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        }

        const params = {
          search: searchQuery || undefined,
          zone: filters.zone !== "All Zones" ? filters.zone : undefined,
          restaurant: filters.restaurant !== `All ${outletLabel}` ? filters.restaurant : undefined,
          fromDate: fromDate ? fromDate.toISOString() : undefined,
          toDate: toDate ? toDate.toISOString() : undefined,
          platform,
          page: currentPage,
          limit: PAGE_SIZE
        }

        const response = await adminAPI.getTransactionReport(params)

        if (response?.data?.success && response.data.data) {
          setTransactions(response.data.data.transactions || [])
          setPagination(response.data.data.pagination || {
            page: currentPage,
            limit: PAGE_SIZE,
            total: 0,
            pages: 1
          })
          setSummary(response.data.data.summary || {
            completedTransaction: 0,
            refundedTransaction: 0,
            adminEarning: 0,
            restaurantEarning: 0,
            deliverymanEarning: 0
          })
        } else {
          setTransactions([])
          if (response?.data?.message) {
            toast.error(response.data.message)
          }
        }
      } catch (error) {
        console.error("Error fetching transaction report:", error)
        toast.error("Failed to fetch transaction report")
        setTransactions([])
        setPagination({
          page: 1,
          limit: PAGE_SIZE,
          total: 0,
          pages: 1
        })
      } finally {
        setLoading(false)
      }
    }

    fetchTransactionReport()
  }, [searchQuery, filters, platform, currentPage])

  const filteredTransactions = useMemo(() => {
    return transactions // Backend already filters, so just return transactions
  }, [transactions])
  const totalPages = Math.max(1, Number(pagination?.pages || 1))

  const handleExport = (format) => {
    if (filteredTransactions.length === 0) {
      alert("No data to export")
      return
    }
    switch (format) {
      case "csv": exportTransactionReportToCSV(filteredTransactions); break
      case "excel": exportTransactionReportToExcel(filteredTransactions); break
      case "pdf": exportTransactionReportToPDF(filteredTransactions); break
      case "json": exportTransactionReportToJSON(filteredTransactions); break
    }
  }

  const handleFilterApply = () => {
    setFilters({ ...draftFilters })
    setCurrentPage(1)
    toast.success("Filters applied")
  }

  const handleResetFilters = () => {
    const resetFilters = {
      zone: "All Zones",
      restaurant: `All ${outletLabel}`,
      time: "All Time",
    }
    setDraftFilters(resetFilters)
    setFilters(resetFilters)
    setSearchInput("")
    setSearchQuery("")
    setCurrentPage(1)
  }
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return
    setCurrentPage(newPage)
  }

  const activeFiltersCount = (draftFilters.zone !== "All Zones" ? 1 : 0) + (draftFilters.restaurant !== `All ${outletLabel}` ? 1 : 0) + (draftFilters.time !== "All Time" ? 1 : 0)

  const formatCurrency = (amount = 0) => {
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(2)}K`
    }
    return Number(amount || 0).toFixed(2)
  }

  const formatFullCurrency = (amount = 0) => {
    return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const getPlatformOrdersPath = () => (
    platform === "mogrocery" ? "/admin/grocery-orders/all" : "/admin/orders/all"
  )

  const handleOrderIdClick = (orderId) => {
    navigate(getPlatformOrdersPath(), {
      state: { prefillOrderSearch: orderId }
    })
  }

  const goToOrdersStatus = (statusKey = "all") => {
    const basePath = platform === "mogrocery" ? "/admin/grocery-orders" : "/admin/orders"
    navigate(`${basePath}/${statusKey}`)
  }

  if (loading) {
    return (
      <div className="p-2 lg:p-3 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-gray-600">Loading transaction report...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen">
      <div className="w-full mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Transaction Report</h1>
          </div>
        </div>

        {/* Search Data Section */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <select
                value={draftFilters.zone}
                onChange={(e) => {
                  setDraftFilters(prev => ({ ...prev, zone: e.target.value }))
                }}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"
              >
                <option value="All Zones">All Zones</option>
                {zones.map(zone => (
                  <option key={zone._id} value={zone.name}>{zone.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative flex-1 min-w-0">
              <select
                value={draftFilters.restaurant}
                onChange={(e) => {
                  setDraftFilters(prev => ({ ...prev, restaurant: e.target.value }))
                }}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"
              >
                <option value={`All ${outletLabel}`}>{`All ${outletLabel}`}</option>
                {restaurants.map(restaurant => (
                  <option key={restaurant._id || restaurant.id || restaurant.restaurantId} value={restaurant.name || restaurant.storeName}>
                    {restaurant.name || restaurant.storeName}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative flex-1 min-w-0">
              <select
                value={draftFilters.time}
                onChange={(e) => {
                  setDraftFilters(prev => ({ ...prev, time: e.target.value }))
                }}
                className="w-full px-2.5 py-1.5 pr-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs appearance-none cursor-pointer"
              >
                <option value="All Time">All Time</option>
                <option value="Today">Today</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <button 
              onClick={handleFilterApply}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all whitespace-nowrap relative ${
                activeFiltersCount > 0 ? "ring-2 ring-blue-300" : ""
              }`}
            >
              Filter
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white rounded-full text-[8px] flex items-center justify-center font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>
            <button 
              onClick={handleResetFilters}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all whitespace-nowrap"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* Left Column - Large Cards */}
          <div className="space-y-3">
            {/* Completed Transaction - Green */}
            <button
              type="button"
              onClick={() => goToOrdersStatus("delivered")}
              className="w-full rounded-lg shadow-sm border border-slate-200 p-4 text-left hover:bg-slate-100 transition-colors cursor-pointer"
              style={{ backgroundColor: '#f1f5f9' }}
            >
              <div className="relative mb-3 flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <img src={completedIcon} alt="Completed" className="w-12 h-12" />
                </div>
                <div className="absolute top-0 right-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                  <Info className="w-3 h-3 text-white" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-green-600 mb-1">{formatCurrency(summary.completedTransaction)}</p>
                <p className="text-sm text-slate-600 leading-tight">Completed Transaction</p>
              </div>
            </button>

            {/* Refunded Transaction - Red */}
            <button
              type="button"
              onClick={() => goToOrdersStatus("refunded")}
              className="w-full rounded-lg shadow-sm border border-slate-200 p-4 text-left hover:bg-slate-100 transition-colors cursor-pointer"
              style={{ backgroundColor: '#f1f5f9' }}
            >
              <div className="relative mb-3 flex justify-center">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                  <img src={refundedIcon} alt="Refunded" className="w-12 h-12" />
                </div>
                <div className="absolute top-0 right-0 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                  <Info className="w-3 h-3 text-white" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-red-600 mb-1">{formatFullCurrency(summary.refundedTransaction)}</p>
                <p className="text-sm text-slate-600 leading-tight">Refunded Transaction</p>
              </div>
            </button>
          </div>

          {/* Right Column - Small Cards */}
          <div className="space-y-3">
            {/* Admin Earning */}
            <button
              type="button"
              onClick={() => goToOrdersStatus("all")}
              className="w-full rounded-lg shadow-sm border border-slate-200 p-3 text-left hover:bg-slate-100 transition-colors cursor-pointer"
              style={{ backgroundColor: '#f1f5f9' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <img src={adminEarningIcon} alt="Admin Earning" className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">Admin Earning</p>
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Info className="w-3 h-3 text-white" />
                    </div>
                  </div>
                </div>
                <p className="text-base font-bold text-slate-900">{formatCurrency(summary.adminEarning)}</p>
              </div>
            </button>

            {/* Restaurant Earning */}
            <button
              type="button"
              onClick={() => goToOrdersStatus("all")}
              className="w-full rounded-lg shadow-sm border border-slate-200 p-3 text-left hover:bg-slate-100 transition-colors cursor-pointer"
              style={{ backgroundColor: '#f1f5f9' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <img src={restaurantEarningIcon} alt="Restaurant Earning" className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">Restaurant Earning</p>
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <Info className="w-3 h-3 text-white" />
                    </div>
                  </div>
                </div>
                <p className="text-base font-bold text-green-600">{formatCurrency(summary.restaurantEarning)}</p>
              </div>
            </button>

            {/* Deliveryman Earning */}
            <button
              type="button"
              onClick={() => goToOrdersStatus("all")}
              className="w-full rounded-lg shadow-sm border border-slate-200 p-3 text-left hover:bg-slate-100 transition-colors cursor-pointer"
              style={{ backgroundColor: '#f1f5f9' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <img src={deliverymanEarningIcon} alt="Deliveryman Earning" className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">Deliveryman Earning</p>
                    <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                      <Info className="w-3 h-3 text-white" />
                    </div>
                  </div>
                </div>
                <p className="text-base font-bold text-orange-600">{formatCurrency(summary.deliverymanEarning)}</p>
              </div>
            </button>
          </div>
        </div>

        {/* Order Transactions Section */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-slate-900">Order Transactions {pagination.total || 0}</h2>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-initial min-w-[180px]">
                <input
                  type="text"
                  placeholder="Search by Order ID"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      setSearchQuery(searchInput.trim())
                      setCurrentPage(1)
                    }
                  }}
                  className="pl-7 pr-2 py-1.5 w-full text-[11px] rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <img src={searchIcon} alt="Search" className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1 transition-all">
                    <img src={exportIcon} alt="Export" className="w-3 h-3" />
                    <span>Export</span>
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("json")} className="cursor-pointer">
                    <Code className="w-4 h-4 mr-2" />
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
                title="Report settings"
              >
                <Settings className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full min-w-[980px]" style={{ tableLayout: "auto" }}>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '3%' }}>SI</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: "10%" }}>Order Id</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: "12%" }}>Restaurant</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '10%' }}>Customer Name</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '9%' }}>Total Item Amount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Item Discount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Coupon Discount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Referral Discount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Discounted Amount</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '7%' }}>Vat/Tax</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Delivery Charge</th>
                  <th className="px-1.5 py-1 text-left text-[8px] font-bold text-slate-700 uppercase tracking-wider" style={{ width: '8%' }}>Order Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                        <p className="text-sm text-slate-500">No transactions match your search</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((transaction, index) => (
                    <tr
                      key={transaction.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] font-medium text-slate-700">{((currentPage - 1) * PAGE_SIZE) + index + 1}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <button
                          type="button"
                          onClick={() => handleOrderIdClick(transaction.orderId)}
                          className="text-[10px] text-blue-600 hover:underline cursor-pointer truncate block"
                        >
                          {transaction.orderId}
                        </button>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700 truncate block">{transaction.restaurant}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className={`text-[10px] truncate block ${
                          transaction.customerName === "Invalid Customer Data" 
                            ? "text-red-600 font-semibold" 
                            : "text-slate-700"
                        }`}>
                          {transaction.customerName}
                        </span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.totalItemAmount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.itemDiscount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.couponDiscount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.referralDiscount)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">
                          {transaction.discountedAmount >= 1000 
                            ? formatCurrency(transaction.discountedAmount)
                            : formatFullCurrency(transaction.discountedAmount)
                          }
                        </span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.vatTax)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] text-slate-700">{formatFullCurrency(transaction.deliveryCharge)}</span>
                      </td>
                      <td className="px-1.5 py-1">
                        <span className="text-[10px] font-medium text-slate-900">{formatFullCurrency(transaction.orderAmount)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-slate-500">
              Showing{" "}
              <span className="font-semibold text-slate-700">
                {filteredTransactions.length === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1}
                {" - "}
                {((currentPage - 1) * PAGE_SIZE) + filteredTransactions.length}
              </span>{" "}
              of <span className="font-semibold text-slate-700">{pagination.total || 0}</span> transactions
            </p>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-[10px] rounded border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx + 1}
                  onClick={() => handlePageChange(idx + 1)}
                  className={`w-6 h-6 text-[10px] rounded border ${
                    currentPage === idx + 1
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-[10px] rounded border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Order Transactions Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p>Current search: <span className="font-semibold">{searchQuery || "None"}</span></p>
            <p>Zone: <span className="font-semibold">{filters.zone}</span></p>
            <p>{isGroceryPlatform ? "Store" : "Restaurant"}: <span className="font-semibold">{filters.restaurant}</span></p>
            <p>Time: <span className="font-semibold">{filters.time}</span></p>
            <p>Total records: <span className="font-semibold">{pagination.total || 0}</span></p>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
