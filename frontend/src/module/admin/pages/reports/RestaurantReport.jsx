import { useState, useMemo, useEffect } from "react"
import { Search, Download, ChevronDown, Filter, Briefcase, RefreshCw, Settings, ArrowUpDown, FileText, FileSpreadsheet, Code, Loader2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { exportReportsToCSV, exportReportsToExcel, exportReportsToPDF, exportReportsToJSON } from "../../components/reports/reportsExportUtils"
import { adminAPI } from "@/lib/api"
import { buildImageFallback } from "@/lib/utils/imageFallback"
import { toast } from "sonner"

export default function RestaurantReport({ platformOverride = "mofood", entityLabel = "Restaurant" }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    zone: "All Zones",
    all: "All",
    type: "All types",
    time: "All Time",
  })
  const [zones, setZones] = useState([])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Fetch zones for filter dropdown
  useEffect(() => {
    const fetchZones = async () => {
      try {
        const response = await adminAPI.getZones({ limit: 1000 })
        if (response?.data?.success && response.data.data?.zones) {
          setZones(response.data.data.zones)
        }
      } catch (error) {
        console.error("Error fetching zones:", error)
      }
    }
    fetchZones()
  }, [])

  // Fetch restaurant report data
  useEffect(() => {
    const fetchRestaurantReport = async () => {
      try {
        setLoading(true)
        
        const params = {
          zone: filters.zone !== "All Zones" ? filters.zone : undefined,
          all: filters.all !== "All" ? filters.all : undefined,
          type: filters.type !== "All types" ? filters.type : undefined,
          time: filters.time !== "All Time" ? filters.time : undefined,
          search: searchQuery || undefined
        }

        const response = await adminAPI.getRestaurantReport({
          ...params,
          platform: platformOverride,
        })

        if (response?.data?.success && response.data.data) {
          setRestaurants(response.data.data.restaurants || [])
        } else {
          setRestaurants([])
          if (response?.data?.message) {
            toast.error(response.data.message)
          }
        }
      } catch (error) {
        console.error("Error fetching restaurant report:", error)
        toast.error(`Failed to fetch ${entityLabel.toLowerCase()} report`)
        setRestaurants([])
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantReport()
  }, [filters, searchQuery])

  const filteredRestaurants = useMemo(() => {
    return restaurants // Backend already filters, so just return restaurants
  }, [restaurants])

  const totalRestaurants = filteredRestaurants.length

  const handleReset = () => {
    setFilters({
      zone: "All Zones",
      all: "All",
      type: "All types",
      time: "All Time",
    })
    setSearchQuery("")
  }

  const handleExport = (format) => {
    if (filteredRestaurants.length === 0) {
      alert("No data to export")
      return
    }
    const headers = [
      { key: "sl", label: "SL" },
      { key: "restaurantName", label: `${entityLabel} Name` },
      { key: "totalFood", label: "Total Food" },
      { key: "totalOrder", label: "Total Order" },
      { key: "totalOrderAmount", label: "Total Order Amount" },
      { key: "totalDiscountGiven", label: "Total Discount Given" },
      { key: "totalAdminCommission", label: "Total Admin Commission" },
      { key: "totalVATTAX", label: "Total VAT/TAX" },
      { key: "averageRatings", label: "Average Ratings" },
    ]
    const exportBaseName = platformOverride === "mogrocery" ? "grocery_store_report" : "restaurant_report"
    const exportTitle = `${entityLabel} Report`
    switch (format) {
      case "csv": exportReportsToCSV(filteredRestaurants, headers, exportBaseName); break
      case "excel": exportReportsToExcel(filteredRestaurants, headers, exportBaseName); break
      case "pdf": exportReportsToPDF(filteredRestaurants, headers, exportBaseName, exportTitle); break
      case "json": exportReportsToJSON(filteredRestaurants, exportBaseName); break
    }
  }

  const handleFilterApply = () => {
    toast.success("Filters applied")
  }

  const activeFiltersCount = (filters.zone !== "All Zones" ? 1 : 0) + (filters.all !== "All" ? 1 : 0) + (filters.type !== "All types" ? 1 : 0) + (filters.time !== "All Time" ? 1 : 0)

  const renderStars = (rating, reviews) => {
    const rawRating = Number(rating || 0)
    const safeRating = Number.isFinite(rawRating)
      ? Math.max(0, Math.min(5, rawRating))
      : 0
    const safeReviews = Number(reviews || 0)
    if (safeRating === 0) {
      return "★0"
    }
    const fullStars = Math.floor(safeRating)
    const hasHalfStar = safeRating % 1 !== 0
    return "★".repeat(fullStars) + (hasHalfStar ? "½" : "") + "☆".repeat(5 - Math.ceil(safeRating)) + ` (${safeReviews})`
  }

  const isNegativeAmount = (value) => {
    if (typeof value === "number") return value < 0
    const str = String(value ?? "").trim()
    return str.startsWith("₹-") || str.startsWith("-₹") || str.startsWith("-")
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-gray-600">Loading {entityLabel.toLowerCase()} report...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{entityLabel} Report</h1>
          </div>
        </div>

        {/* Search Data Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Search Data</h3>
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Zone
                </label>
                <select
                  value={filters.zone}
                  onChange={(e) => setFilters(prev => ({ ...prev, zone: e.target.value }))}
                  className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All Zones">All Zones</option>
                  {zones.map(zone => (
                    <option key={zone._id} value={zone.name}>{zone.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  All
                </label>
                <select
                  value={filters.all}
                  onChange={(e) => setFilters(prev => ({ ...prev, all: e.target.value }))}
                  className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Type
                </label>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All types">All types</option>
                  <option value="Commission">Commission</option>
                  <option value="Subscription">Subscription</option>
                </select>
                <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Time
                </label>
                <select
                  value={filters.time}
                  onChange={(e) => setFilters(prev => ({ ...prev, time: e.target.value }))}
                  className="w-full px-4 py-2.5 pr-8 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All Time">All Time</option>
                  <option value="Today">Today</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                  <option value="This Year">This Year</option>
                </select>
                <ChevronDown className="absolute right-2 bottom-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-end gap-3">
              <button
                onClick={handleReset}
                className="px-6 py-2.5 text-sm font-medium rounded-lg bg-slate-600 text-white hover:bg-slate-700 transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
              <button 
                onClick={handleFilterApply}
                className={`px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-all flex items-center gap-2 relative ${
                  activeFiltersCount > 0 ? "ring-2 ring-blue-300" : ""
                }`}
              >
                <Filter className="w-4 h-4" />
                Filter
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Restaurant Report Table Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-slate-900">{entityLabel} Report Table {totalRestaurants}</h2>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:flex-initial min-w-[250px]">
                <input
                  type="text"
                  placeholder="Ex: search restaurant nam"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                    }
                  }}
                  className="pl-4 pr-10 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all">
                    <Download className="w-4 h-4" />
                    <span className="text-black font-bold">Export</span>
                    <ChevronDown className="w-3 h-3" />
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
                onClick={() => setIsSettingsOpen(true)}
                className="p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>SL</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Restaurant Name</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Total Food</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Total Order</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Total Order Amount</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Total Discount Given</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Total Admin Commission</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Total VAT/TAX</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <span>Average Ratings</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredRestaurants.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                        <p className="text-sm text-slate-500">No restaurants match your search</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRestaurants.map((restaurant, index) => {
                    const safeName = String(restaurant?.restaurantName || restaurant?.name || `${entityLabel} ${index + 1}`)
                    const safeCommission = restaurant?.totalAdminCommission ?? "₹0"
                    return (
                    <tr key={restaurant?.sl ?? restaurant?._id ?? index} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{restaurant?.sl ?? index + 1}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0">
                            {restaurant?.icon ? (
                              <img
                                src={restaurant.icon}
                                alt={safeName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.src = buildImageFallback(32, "RES")
                                }}
                              />
                            ) : (
                              <div className="w-full h-full bg-slate-300 flex items-center justify-center text-xs text-slate-600 font-semibold">
                                {safeName.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium text-slate-900">{safeName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">{restaurant?.totalFood ?? 0}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">{restaurant?.totalOrder ?? 0}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-900">{restaurant?.totalOrderAmount ?? "₹0"}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">{restaurant?.totalDiscountGiven ?? "₹0"}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${
                          isNegativeAmount(safeCommission)
                            ? 'text-red-600'
                            : 'text-slate-900'
                        }`}>
                          {safeCommission}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">{restaurant?.totalVATTAX ?? "₹0"}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">{renderStars(restaurant?.averageRatings, restaurant?.reviews)}</span>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md bg-white p-0 opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:scale-100 data-[state=closed]:scale-100">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Report Settings
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-2 text-sm text-slate-700">
            <p>Current search: <span className="font-semibold">{searchQuery || "None"}</span></p>
            <p>Zone: <span className="font-semibold">{filters.zone}</span></p>
            <p>All: <span className="font-semibold">{filters.all}</span></p>
            <p>Type: <span className="font-semibold">{filters.type}</span></p>
            <p>Time: <span className="font-semibold">{filters.time}</span></p>
            <p>Total records: <span className="font-semibold">{filteredRestaurants.length}</span></p>
          </div>
          <div className="px-6 pb-6 flex items-center justify-end">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
