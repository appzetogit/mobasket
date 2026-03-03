import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import Lenis from "lenis"
import { ArrowLeft, Settings, ChevronRight } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { groceryStoreAPI, restaurantAPI } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function RestaurantStatus() {
  const navigate = useNavigate()
  const routeLocation = useLocation()
  const isGroceryStore = routeLocation.pathname.startsWith("/store")
  const statusStorageKey = isGroceryStore ? "grocery-store_online_status" : "restaurant_online_status"
  const statusEventName = isGroceryStore ? "groceryStoreStatusChanged" : "restaurantStatusChanged"
  const entityLabel = isGroceryStore ? "store" : "restaurant"
  const EntityLabel = isGroceryStore ? "Store" : "Restaurant"
  const [deliveryStatus, setDeliveryStatus] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [isWithinTimings, setIsWithinTimings] = useState(null) // null = not calculated yet
  const [showOutletClosedDialog, setShowOutletClosedDialog] = useState(false)
  const [showOutsideTimingsDialog, setShowOutsideTimingsDialog] = useState(false)
  const [isDayClosed, setIsDayClosed] = useState(false)
  const [outletTimings, setOutletTimings] = useState(null)

  const parseTimeToMinutes = (timeValue) => {
    if (!timeValue || typeof timeValue !== "string") return null

    const normalized = timeValue.trim().toUpperCase()
    // Supports: "09:00", "9:00", "9:00 AM", "09:00 PM"
    const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/)
    if (!match) return null

    let hours = Number(match[1])
    const minutes = Number(match[2])
    const period = match[3] || null

    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
    if (minutes < 0 || minutes > 59) return null

    if (period) {
      if (hours < 1 || hours > 12) return null
      if (period === "PM" && hours !== 12) hours += 12
      if (period === "AM" && hours === 12) hours = 0
    } else if (hours < 0 || hours > 23) {
      return null
    }

    return hours * 60 + minutes
  }

  // Update current date/time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDateTime(new Date())
    }, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

  // Fetch restaurant data from backend
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        const response = isGroceryStore
          ? await groceryStoreAPI.getCurrentStore()
          : await restaurantAPI.getCurrentRestaurant()
        const data = isGroceryStore
          ? (response?.data?.data?.store || response?.data?.store || response?.data?.data?.restaurant || response?.data?.restaurant)
          : (response?.data?.data?.restaurant || response?.data?.restaurant)
        if (data) {
          setRestaurantData(data)
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          console.error(`Error fetching ${entityLabel} data:`, error)
        }
        // Continue with default values if fetch fails
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantData()
  }, [isGroceryStore])

  // Load outlet timings from localStorage
  useEffect(() => {
    const loadOutletTimings = () => {
      try {
        const saved = localStorage.getItem("restaurant_outlet_timings")
        if (saved) {
          const data = JSON.parse(saved)
          setOutletTimings(data)
        }
      } catch (error) {
        console.error("Error loading outlet timings:", error)
      }
    }

    loadOutletTimings()

    // Listen for outlet timings updates
    window.addEventListener("outletTimingsUpdated", loadOutletTimings)
    
    return () => {
      window.removeEventListener("outletTimingsUpdated", loadOutletTimings)
    }
  }, [])

  // Check if restaurant is currently open based on timings
  useEffect(() => {
    if (!restaurantData) return

    const checkIfOpen = () => {
      const now = new Date()
      const currentDayFull = now.toLocaleDateString('en-US', { weekday: 'long' }) // "Monday", "Tuesday", etc.
      const currentDay = now.toLocaleDateString('en-US', { weekday: 'short' }) // "Mon", "Tue", etc.
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const currentTimeInMinutes = currentHour * 60 + currentMinute

      // First check outlet timings from localStorage (OutletTimings.jsx stores it there)
      const STORAGE_KEY = "restaurant_outlet_timings"
      let outletTimingsData = null
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          outletTimingsData = JSON.parse(saved)
          setOutletTimings(outletTimingsData)
        }
      } catch (error) {
        console.error("Error loading outlet timings:", error)
      }

      // Check if current day is closed in outlet timings
      if (outletTimingsData && outletTimingsData[currentDayFull]) {
        const dayData = outletTimingsData[currentDayFull]
        if (dayData.isOpen === false) {
          // Day is closed in outlet timings
          setIsDayClosed(true)
          setIsWithinTimings(false)
          setShowOutletClosedDialog(true)
          return
        }
        
        // Check time range if day is open and has timings
        if (dayData.isOpen && dayData.openingTime && dayData.closingTime) {
          const openingTimeInMinutes = parseTimeToMinutes(dayData.openingTime)
          const closingTimeInMinutes = parseTimeToMinutes(dayData.closingTime)
          if (!Number.isFinite(openingTimeInMinutes) || !Number.isFinite(closingTimeInMinutes)) {
            // Avoid false "outside timings" if saved timing format is unexpected.
            setIsWithinTimings(true)
            setIsDayClosed(false)
            return
          }

          // Handle case where closing time is next day (e.g., 22:00 to 02:00)
          let isWithin = false
          if (closingTimeInMinutes > openingTimeInMinutes) {
            // Normal case: same day
            isWithin = currentTimeInMinutes >= openingTimeInMinutes && currentTimeInMinutes <= closingTimeInMinutes
          } else {
            // Overnight case: closing time is next day
            isWithin = currentTimeInMinutes >= openingTimeInMinutes || currentTimeInMinutes <= closingTimeInMinutes
          }

          setIsWithinTimings(isWithin)
          setIsDayClosed(false)
          return
        }
      }

      setIsDayClosed(false)

      // Check if current day is in openDays (from backend)
      const openDays = restaurantData.openDays || []
      const hasConfiguredOpenDays = Array.isArray(openDays) && openDays.length > 0
      const isDayOpen = hasConfiguredOpenDays
        ? openDays.some(day => {
            const dayAbbr = String(day || "").substring(0, 3).toLowerCase() // "Mon", "Tue", etc.
            return dayAbbr === currentDay.toLowerCase()
          })
        : true

      if (hasConfiguredOpenDays && !isDayOpen) {
        setIsWithinTimings(false)
        return
      }

      // Check if current time is within delivery timings
      const deliveryTimings = restaurantData.deliveryTimings
      if (!deliveryTimings || !deliveryTimings.openingTime || !deliveryTimings.closingTime) {
        setIsWithinTimings(true) // Default to open if no timings set
        return
      }

      const openingTimeInMinutes = parseTimeToMinutes(deliveryTimings.openingTime)
      const closingTimeInMinutes = parseTimeToMinutes(deliveryTimings.closingTime)
      if (!Number.isFinite(openingTimeInMinutes) || !Number.isFinite(closingTimeInMinutes)) {
        setIsWithinTimings(true)
        return
      }

      // Handle case where closing time is next day (e.g., 22:00 to 02:00)
      let isWithin = false
      if (closingTimeInMinutes > openingTimeInMinutes) {
        // Normal case: same day
        isWithin = currentTimeInMinutes >= openingTimeInMinutes && currentTimeInMinutes <= closingTimeInMinutes
      } else {
        // Overnight case: closing time is next day
        isWithin = currentTimeInMinutes >= openingTimeInMinutes || currentTimeInMinutes <= closingTimeInMinutes
      }

      setIsWithinTimings(isWithin)
    }

    checkIfOpen()
    // Recheck every minute
    const interval = setInterval(checkIfOpen, 60000)
    
    // Listen for outlet timings updates
    const handleOutletTimingsUpdate = () => {
      checkIfOpen()
    }
    window.addEventListener("outletTimingsUpdated", handleOutletTimingsUpdate)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener("outletTimingsUpdated", handleOutletTimingsUpdate)
    }
  }, [restaurantData, currentDateTime])

  // Note: Delivery status is now manually controlled by user via toggle
  // We don't automatically set it based on timings anymore
  // The isWithinTimings is only used to show warning messages

  // Load delivery status from backend and sync with localStorage
  useEffect(() => {
    const loadDeliveryStatus = async () => {
      try {
        // First try to get from backend
        const response = isGroceryStore
          ? await groceryStoreAPI.getCurrentStore()
          : await restaurantAPI.getCurrentRestaurant()
        const restaurant = isGroceryStore
          ? (response?.data?.data?.store || response?.data?.store || response?.data?.data?.restaurant || response?.data?.restaurant)
          : (response?.data?.data?.restaurant || response?.data?.restaurant)
        if (restaurant?.isAcceptingOrders !== undefined) {
          setDeliveryStatus(restaurant.isAcceptingOrders)
          // Sync localStorage with backend
          localStorage.setItem(statusStorageKey, JSON.stringify(restaurant.isAcceptingOrders))
          // Dispatch event to update navbar
          window.dispatchEvent(new CustomEvent(statusEventName, {
            detail: { isOnline: restaurant.isAcceptingOrders } 
          }))
        } else {
          // Fallback to localStorage
          const savedStatus = localStorage.getItem(statusStorageKey)
          if (savedStatus !== null) {
            const status = JSON.parse(savedStatus)
            setDeliveryStatus(status)
            // Dispatch event to update navbar
            window.dispatchEvent(new CustomEvent(statusEventName, {
              detail: { isOnline: status } 
            }))
          } else {
            // Default to false if not set
            setDeliveryStatus(false)
            // Dispatch event to update navbar
            window.dispatchEvent(new CustomEvent(statusEventName, {
              detail: { isOnline: false } 
            }))
          }
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          console.error("Error loading delivery status:", error)
        }
        // Fallback to localStorage
        try {
          const savedStatus = localStorage.getItem(statusStorageKey)
          if (savedStatus !== null) {
            const status = JSON.parse(savedStatus)
            setDeliveryStatus(status)
            window.dispatchEvent(new CustomEvent(statusEventName, {
              detail: { isOnline: status } 
            }))
          } else {
            setDeliveryStatus(false)
            window.dispatchEvent(new CustomEvent(statusEventName, {
              detail: { isOnline: false } 
            }))
          }
        } catch (localError) {
          setDeliveryStatus(false)
          window.dispatchEvent(new CustomEvent(statusEventName, {
            detail: { isOnline: false } 
          }))
        }
      }
    }

    loadDeliveryStatus()
  }, [isGroceryStore, statusEventName, statusStorageKey])

  // Handle delivery status change
  const handleDeliveryStatusChange = async (checked) => {
    // If day is closed in outlet timings, don't allow turning on
    if (checked && isDayClosed) {
      setShowOutletClosedDialog(true)
      return
    }
    
    // If outside scheduled delivery timings, show popup
    if (checked && isWithinTimings === false && !isDayClosed) {
      setShowOutsideTimingsDialog(true)
      return
    }
    
    setDeliveryStatus(checked)
    try {
      // Save to localStorage
      localStorage.setItem(statusStorageKey, JSON.stringify(checked))
      
      // Update backend
      try {
        await restaurantAPI.updateDeliveryStatus(checked)
        console.log('✅ Delivery status updated in backend:', checked)
      } catch (apiError) {
        console.error('Error updating delivery status in backend:', apiError)
        // Still continue with local update even if backend fails
      }
      
      // Dispatch custom event for navbar to listen
      window.dispatchEvent(new CustomEvent(statusEventName, {
        detail: { isOnline: checked } 
      }))
    } catch (error) {
      console.error("Error saving delivery status:", error)
    }
  }

  // Handle dialog close and navigate to outlet timings
  const handleGoToOutletTimings = () => {
    setShowOutletClosedDialog(false)
    navigate(isGroceryStore ? "/store/outlet-timings" : "/restaurant/outlet-timings")
  }

  // Format time from 24-hour to 12-hour format
  const formatTime12Hour = (time24) => {
    if (!time24) return ""
    const [hours, minutes] = time24.split(':').map(Number)
    const period = hours >= 12 ? 'pm' : 'am'
    const hours12 = hours % 12 || 12
    const minutesStr = minutes.toString().padStart(2, '0')
    return `${hours12}:${minutesStr} ${period}`
  }

  // Format current date and time
  const formatCurrentDateTime = () => {
    const now = currentDateTime
    const dateStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    const timeStr = now.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
    return `${dateStr}, ${timeStr}`
  }

  // Get delivery timings for current day (from outlet timings first, then backend)
  const getCurrentDayTimings = () => {
    const now = new Date()
    const currentDayFull = now.toLocaleDateString('en-US', { weekday: 'long' }) // "Monday", "Tuesday", etc.
    
    // First try to get from outlet timings (localStorage)
    if (outletTimings && outletTimings[currentDayFull]) {
      const dayData = outletTimings[currentDayFull]
      if (dayData.isOpen && dayData.openingTime && dayData.closingTime) {
        return {
          openingTime: formatTime12Hour(dayData.openingTime),
          closingTime: formatTime12Hour(dayData.closingTime)
        }
      }
    }
    
    // Fallback to backend delivery timings
    if (restaurantData?.deliveryTimings) {
      const openingTime = formatTime12Hour(restaurantData.deliveryTimings.openingTime)
      const closingTime = formatTime12Hour(restaurantData.deliveryTimings.closingTime)
      return { openingTime, closingTime }
    }
    
    return null
  }

  // Format address
  const formatAddress = (location) => {
    if (!location) return ""
    const parts = []
    if (location.area) parts.push(location.area.trim())
    if (location.city) parts.push(location.city.trim())
    return parts.join(", ") || ""
  }

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">
              {isGroceryStore ? "Store status" : "Restaurant status"}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isGroceryStore ? "You are mapped to 1 store" : "You are mapped to 1 restaurant"}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {/* Restaurant Information Card */}
        <Card className="bg-gray-50 border-none py-0 shadow-sm rounded-b-none rounded-t-lg">
          <CardContent className="p-4 gap-6 flex flex-col">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-gray-900 mb-1">
                  {loading
                    ? "Loading..."
                    : ((isGroceryStore
                      ? String(restaurantData?.name || "Store")
                        .replace(/\brestaurant\b/gi, "Store")
                        .replace(/\s{2,}/g, " ")
                        .trim()
                      : restaurantData?.name) || EntityLabel)}
                </h2>
                <p className="text-sm text-gray-500">
                  {loading ? "Loading..." : (
                    <>
                      {restaurantData?.id ? `ID: ${String(restaurantData.id).slice(-5)}` : ""}
                      {restaurantData?.location && formatAddress(restaurantData.location) ? (
                        <> | {formatAddress(restaurantData.location)}</>
                      ) : ""}
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={() => {
                  // Navigate to store/restaurant settings
                  navigate(isGroceryStore ? "/store/explore" : "/restaurant/explore")
                }}
                className="ml-3 p-2 bg-gray-200 hover:bg-gray-300 rounded-full transition-colors shrink-0"
                aria-label="Explore more"
              >
                <Settings className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-base font-bold text-gray-900 mb-1.5">Delivery status</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${deliveryStatus ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                <p className="text-sm text-gray-500">
                  {deliveryStatus ? 'Receiving orders' : 'Not receiving orders'}
                </p>
              </div>
            </div>
            <Switch
              checked={deliveryStatus}
              onCheckedChange={handleDeliveryStatusChange}
              className="ml-4 data-[state=unchecked]:bg-gray-300 data-[state=checked]:bg-green-600"
            />
          </div>

          <p className="text-sm text-gray-700 mb-2">Current delivery slot</p>
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-gray-900">
              {loading ? "Loading..." : (
                (() => {
                  // If current day is closed, show "Today is Off"
                  if (isDayClosed) {
                    return "Today is Off"
                  }
                  const timings = getCurrentDayTimings()
                  if (timings) {
                    const dateStr = currentDateTime.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                    return `${dateStr}, ${timings.openingTime} - ${timings.closingTime}`
                  }
                  return "Not configured"
                })()
              )}
            </p>
            {!isDayClosed && (
              <button
                onClick={() => navigate(isGroceryStore ? "/store/outlet-timings" : "/restaurant/outlet-timings")}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Details
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          

          </CardContent>
        </Card>

  {/* Warning Message - Only show if outside timings AND day is not closed */}
  {!isWithinTimings && restaurantData && !isDayClosed && (
        <div className="bg-pink-50 rounded-b-lg rounded-t-none p-4 flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-white text-xs font-bold">!</span>
          </div>
          <p className="text-sm text-gray-700 flex-1">
            You are currently outside your scheduled delivery timings.
          </p>
        </div>
      )}

      {/* Outlet Closed Dialog */}
      <Dialog open={showOutletClosedDialog} onOpenChange={setShowOutletClosedDialog}>
        <DialogContent className="sm:max-w-md p-4 w-[90%] gap-2 flex flex-col">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
              <span className="text-3xl">⚠️</span>
            </div>
            <DialogTitle className="text-lg font-semibold text-gray-900 text-center">
              Outlet Timings Closed
            </DialogTitle>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => setShowOutletClosedDialog(false)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGoToOutletTimings}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
            >
              Go to Outlet Timings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Outside Timings Dialog */}
      <Dialog open={showOutsideTimingsDialog} onOpenChange={setShowOutsideTimingsDialog}>
        <DialogContent className="sm:max-w-md p-4 w-[90%] gap-2 flex flex-col">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
              <span className="text-3xl">⚠️</span>
            </div>
            <DialogTitle className="text-lg font-semibold text-gray-900 text-center">
              Outside Delivery Timings
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-gray-600">
              You are currently outside your scheduled delivery timings. Please change outlet timings to enable delivery status.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => setShowOutsideTimingsDialog(false)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowOutsideTimingsDialog(false)
                navigate(isGroceryStore ? "/store/outlet-timings" : "/restaurant/outlet-timings")
              }}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
            >
              Change Outlet Timings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      </div>
    </div>
  )
}
