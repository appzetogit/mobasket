import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Search, Menu, ChevronRight, MapPin, X, Bell } from "lucide-react"
import { restaurantAPI, groceryStoreAPI } from "@/lib/api"
import { isOpenFromOutletTimingsMap } from "@/lib/utils/outletTimingsStatus"

export default function RestaurantNavbar({
  restaurantName: propRestaurantName,
  location: propLocation,
  showSearch = true,
  showOfflineOnlineTag = true,
  showNotifications = true,
  onSearchChange,
}) {
  const navigate = useNavigate()
  const routeLocation = useLocation()
  const isGroceryStore = routeLocation.pathname.startsWith('/store')
  const [isSearchActive, setIsSearchActive] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [status, setStatus] = useState("Offline")
  const [restaurantData, setRestaurantData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch restaurant/store data on mount
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        const response = isGroceryStore
          ? await groceryStoreAPI.getCurrentStore()
          : await restaurantAPI.getCurrentRestaurant()
        // Handle both restaurant and grocery store response formats
        const data = isGroceryStore
          ? (response?.data?.data?.store || response?.data?.store || response?.data?.data?.restaurant || response?.data?.restaurant)
          : (response?.data?.data?.restaurant || response?.data?.restaurant)
        if (data) {
          setRestaurantData(data)
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          console.error(`Error fetching ${isGroceryStore ? "store" : "restaurant"} data:`, error)
        }
        // Continue with default values if fetch fails
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantData()
  }, [isGroceryStore])

  // Format full address from location object - using stored data only, no live fetching
  const formatAddress = (location) => {
    if (!location) return ""

    // Priority 1: Use formattedAddress if available (stored address from database)
    if (location.formattedAddress && location.formattedAddress.trim() !== "" && location.formattedAddress !== "Select location") {
      // Check if it's just coordinates (latitude, longitude format)
      const isCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(location.formattedAddress.trim())
      if (!isCoordinates) {
        return location.formattedAddress.trim()
      }
    }

    // Priority 2: Use address field if available
    if (location.address && location.address.trim() !== "") {
      return location.address.trim()
    }

    // Priority 3: Build from individual components
    const parts = []

    // Add street address (addressLine1 or street)
    if (location.addressLine1) {
      parts.push(location.addressLine1.trim())
    } else if (location.street) {
      parts.push(location.street.trim())
    }

    // Add addressLine2 if available
    if (location.addressLine2) {
      parts.push(location.addressLine2.trim())
    }

    // Add area if available
    if (location.area) {
      parts.push(location.area.trim())
    }

    // Add landmark if available
    if (location.landmark) {
      parts.push(location.landmark.trim())
    }

    // Add city if available and not already in area
    if (location.city) {
      const city = location.city.trim()
      // Only add city if it's not already included in previous parts
      const cityAlreadyIncluded = parts.some(part => part.toLowerCase().includes(city.toLowerCase()))
      if (!cityAlreadyIncluded) {
        parts.push(city)
      }
    }

    // Add state if available
    if (location.state) {
      const state = location.state.trim()
      // Only add state if it's not already included
      const stateAlreadyIncluded = parts.some(part => part.toLowerCase().includes(state.toLowerCase()))
      if (!stateAlreadyIncluded) {
        parts.push(state)
      }
    }

    // Add zipCode/pincode if available
    if (location.zipCode || location.pincode || location.postalCode) {
      const zip = (location.zipCode || location.pincode || location.postalCode).trim()
      parts.push(zip)
    }

    return parts.length > 0 ? parts.join(", ") : ""
  }

  // Get restaurant/store name (use prop if provided, otherwise use fetched data)
  const restaurantName = propRestaurantName || restaurantData?.name || (isGroceryStore ? "Store" : "Restaurant")
  const displayName = isGroceryStore
    ? (String(restaurantName || "")
      .replace(/\brestaurant\b/gi, "Store")
      .replace(/\s{2,}/g, " ")
      .trim() || "Store")
    : restaurantName

  const [locationValue, setLocationValue] = useState("")

  // Update location when restaurantData or propLocation changes
  useEffect(() => {
    let newLocation = ""

    // Priority 1: Explicit prop takes highest priority
    if (propLocation && propLocation.trim() !== "") {
      newLocation = propLocation.trim()
    }
    // Priority 2: Check restaurantData location
    else if (restaurantData) {
      if (restaurantData.location) {
        // Use stored formattedAddress first (from database)
        if (restaurantData.location.formattedAddress &&
          restaurantData.location.formattedAddress.trim() !== "" &&
          restaurantData.location.formattedAddress !== "Select location") {
          newLocation = restaurantData.location.formattedAddress.trim()
        }
        // Fallback: Use coordinate fields if address is coordinates
        else if (restaurantData.location.latitude && restaurantData.location.longitude) {
          // If it's a raw object with coordinates, use our formatAddress helper
          newLocation = formatAddress(restaurantData.location)
        }
        // Fallback: Build from components
        else {
          newLocation = formatAddress(restaurantData.location)
        }
      }
      // Priority 3: Check deprecated top-level address fields
      else if (restaurantData.address && restaurantData.address.trim() !== "") {
        newLocation = restaurantData.address.trim()
      }
    }

    setLocationValue(newLocation)
  }, [restaurantData, propLocation])

  // Update status based on outletTimings
  useEffect(() => {
    if (restaurantData) {
      const isOpen = isOpenFromOutletTimingsMap(restaurantData.outletTimings)
      setStatus(isOpen ? "Online" : "Offline")
    }
  }, [restaurantData])

  const handleSearchToggle = () => {
    setIsSearchActive(!isSearchActive)
    if (isSearchActive) {
      setSearchValue("")
      if (onSearchChange) onSearchChange("")
    }
  }

  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchValue(value)
    if (onSearchChange) onSearchChange(value)
  }

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 flex flex-col px-4 py-3 gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(isGroceryStore ? "/store" : "/restaurant")}
            className="flex items-center gap-2 group transition-all"
          >
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg p-1.5 shadow-sm group-hover:shadow-md transition-all">
              <Menu size={18} className="text-white" />
            </div>
            <div className="flex flex-col items-start -space-y-0.5">
              <span className="font-bold text-gray-900 leading-tight">
                {displayName}
              </span>
              <div className="flex items-center text-[10px] text-gray-500 font-medium tracking-wide">
                <span>DASHBOARD</span>
                <ChevronRight size={10} className="mx-0.5 opacity-50" />
              </div>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          {showNotifications && (
            <button
              onClick={() => navigate(isGroceryStore ? "/store/notifications" : "/restaurant/notifications")}
              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all relative group"
            >
              <Bell size={20} className="group-hover:scale-110 transition-transform" />
              <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 border-2 border-white rounded-full"></span>
            </button>
          )}

          {showSearch && (
            <button
              onClick={handleSearchToggle}
              className={`p-2 rounded-full transition-all ${isSearchActive ? "bg-indigo-50 text-indigo-600" : "text-gray-400 hover:bg-gray-50"
                }`}
            >
              {isSearchActive ? <X size={20} /> : <Search size={20} />}
            </button>
          )}

          <div className="h-7 w-px bg-gray-200 mx-0.5" />

          {showOfflineOnlineTag && (
            <div
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm transition-all border ${status === "Online"
                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                : "bg-red-50 text-red-600 border-red-100"
                }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${status === "Online" ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                  }`} />
                {status}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {locationValue && (
          <div className="flex items-center gap-1.5 text-gray-400 overflow-hidden group">
            <MapPin size={12} className="flex-shrink-0 group-hover:text-amber-500 transition-colors" />
            <p className="text-[11px] font-medium truncate tracking-tight text-gray-500 group-hover:text-gray-900 transition-colors">
              {locationValue}
            </p>
          </div>
        )}
      </div>

      {isSearchActive && (
        <div className="mt-1 relative animate-in slide-in-from-top-2 duration-200">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            autoFocus
            type="text"
            value={searchValue}
            onChange={handleSearchChange}
            placeholder={`Search ${isGroceryStore ? "products" : "orders"}...`}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border-0 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
          />
        </div>
      )}
    </nav>
  )
}
