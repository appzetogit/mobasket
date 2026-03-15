import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Image as ImageIcon, Upload, Clock, Calendar as CalendarIcon, Sparkles, ArrowLeft, Camera, Search, Loader2, MapPin } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { uploadAPI, api, restaurantAPI } from "@/lib/api"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { determineStepToShow } from "../utils/onboardingUtils"
import { toast } from "sonner"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { clearRestaurantSignupSession } from "@/lib/utils/auth"

const cuisinesOptions = [
  "North Indian",
  "South Indian",
  "Chinese",
  "Pizza",
  "Burgers",
  "Bakery",
  "Cafe",
]

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const DEFAULT_OPENING_TIME = "09:00"
const DEFAULT_CLOSING_TIME = "22:00"
const GOOGLE_MAP_ID = String(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "").trim()
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"]

const waitForGoogleMaps = (timeoutMs = 12000) =>
  new Promise((resolve, reject) => {
    if (window.google?.maps?.Map) {
      resolve(window.google)
      return
    }

    const startedAt = Date.now()
    const interval = window.setInterval(() => {
      if (window.google?.maps?.Map) {
        window.clearInterval(interval)
        resolve(window.google)
        return
      }

      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(interval)
        reject(new Error("Google Maps failed to load"))
      }
    }, 150)
  })

const parseAddressComponents = (components = []) => {
  const byType = (type) => components.find((component) => component.types?.includes(type))
  const streetNumber = byType("street_number")?.long_name || ""
  const route = byType("route")?.long_name || ""
  const sublocality =
    byType("sublocality_level_1")?.long_name ||
    byType("sublocality")?.long_name ||
    byType("neighborhood")?.long_name ||
    ""
  const city =
    byType("locality")?.long_name ||
    byType("administrative_area_level_2")?.long_name ||
    byType("administrative_area_level_3")?.long_name ||
    ""
  const state = byType("administrative_area_level_1")?.long_name || ""
  const zipCode = byType("postal_code")?.long_name || ""
  const landmark = byType("point_of_interest")?.long_name || ""

  return {
    addressLine1: [streetNumber, route].filter(Boolean).join(" ").trim(),
    addressLine2: "",
    area: sublocality || city,
    city,
    state,
    landmark,
    zipCode,
  }
}

// Helper function to convert "HH:mm" string to Date object
const stringToTime = (timeString) => {
  if (!timeString || !timeString.includes(":")) {
    return new Date(2000, 0, 1, 10, 0) // Default to 10:00 AM
  }
  const [hours, minutes] = timeString.split(":").map(Number)
  return new Date(2000, 0, 1, hours || 10, minutes || 0)
}

// Helper function to convert Date object to "HH:mm" string
const timeToString = (date) => {
  if (!date) return ""
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

function TimeSelector({ label, value, onChange }) {
  const timeValue = stringToTime(value)

  const handleTimeChange = (newValue) => {
    if (newValue) {
      const timeString = timeToString(newValue)
      onChange(timeString)
    }
  }

  return (
    <div className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50/60">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-gray-800" />
        <span className="text-xs font-medium text-gray-900">{label}</span>
      </div>
      <MobileTimePicker
        value={timeValue}
        onChange={handleTimeChange}
        slotProps={{
          textField: {
            variant: "outlined",
            size: "small",
            placeholder: "Select time",
            sx: {
              "& .MuiOutlinedInput-root": {
                height: "36px",
                fontSize: "12px",
                backgroundColor: "white",
                "& fieldset": {
                  borderColor: "#e5e7eb",
                },
                "&:hover fieldset": {
                  borderColor: "#d1d5db",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#000",
                },
              },
              "& .MuiInputBase-input": {
                padding: "8px 12px",
                fontSize: "12px",
              },
            },
          },
        }}
        format="hh:mm a"
      />
    </div>
  )
}

export default function RestaurantOnboarding() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedStepParam = searchParams.get("step")
  const isFreshStepOne = requestedStepParam === "1"
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [signedInPhone, setSignedInPhone] = useState("")
  const [showBackPopup, setShowBackPopup] = useState(false)
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState("")
  const [locationSearch, setLocationSearch] = useState("")
  const [detectingLocation, setDetectingLocation] = useState(false)
  const hasResolvedInitialMapCenterRef = useRef(false)

  const [step1, setStep1] = useState({
    restaurantName: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
    location: {
      addressLine1: "",
      addressLine2: "",
      area: "",
      city: "",
      state: "",
      landmark: "",
      zipCode: "",
      formattedAddress: "",
      address: "",
      latitude: "",
      longitude: "",
      coordinates: [],
    },
  })

  const [step2, setStep2] = useState({
    menuImages: [],
    profileImage: null,
    cuisines: [],
    openingTime: DEFAULT_OPENING_TIME,
    closingTime: DEFAULT_CLOSING_TIME,
    openDays: [],
  })

  const [step3, setStep3] = useState({
    panNumber: "",
    nameOnPan: "",
    panImage: null,
    gstRegistered: false,
    gstNumber: "",
    gstLegalName: "",
    gstAddress: "",
    gstImage: null,
    fssaiNumber: "",
    fssaiExpiry: "",
    fssaiImage: null,
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: "",
  })

  const [step4, setStep4] = useState({
    estimatedDeliveryTime: "",
    featuredDish: "",
    featuredPrice: "",
    offer: "",
  })

  const getVerificationRedirectPath = (restaurant) => {
    const normalizedStatus = String(restaurant?.status || "").trim().toLowerCase()
    const completedSteps = Number(restaurant?.onboarding?.completedSteps || 0)
    const isApprovalPendingStatus = normalizedStatus === "pending" || normalizedStatus === "rejected" || normalizedStatus === "declined"

    if (restaurant?.isActive === true) {
      return "/restaurant"
    }

    if (completedSteps >= 4 || isApprovalPendingStatus) {
      return "/restaurant/pending-approval"
    }

    if (normalizedStatus && normalizedStatus !== "onboarding") {
      return "/restaurant"
    }

    return null
  }

  const normalizePhoneDigits = (value) => String(value || "").replace(/\D/g, "")

  const getMarkerCoordinates = (marker) => {
    if (!marker) return null

    const position =
      marker.position ||
      marker?.getPosition?.() ||
      null

    const lat =
      typeof position?.lat === "function"
        ? position.lat()
        : Number(position?.lat)
    const lng =
      typeof position?.lng === "function"
        ? position.lng()
        : Number(position?.lng)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null
    }

    return { lat, lng }
  }

  const updateStep1Location = (updater) => {
    setStep1((prev) => ({
      ...prev,
      location: updater(prev.location || {}),
    }))
  }

  const updateSelectedLocation = (lat, lng, address, components = []) => {
    const parsedAddress = parseAddressComponents(components)
    const normalizedLat = Number(Number(lat).toFixed(6))
    const normalizedLng = Number(Number(lng).toFixed(6))
    const resolvedAddress = String(address || "").trim() || `${normalizedLat}, ${normalizedLng}`

    setLocationSearch((prev) => (prev === resolvedAddress ? prev : resolvedAddress))
    updateStep1Location((prevLocation) => {
      const nextLocation = {
        ...prevLocation,
        addressLine1: parsedAddress.addressLine1 || prevLocation.addressLine1 || "",
        addressLine2: parsedAddress.addressLine2 || prevLocation.addressLine2 || "",
        area: parsedAddress.area || prevLocation.area || "",
        city: parsedAddress.city || prevLocation.city || "",
        state: parsedAddress.state || prevLocation.state || "",
        landmark: parsedAddress.landmark || prevLocation.landmark || "",
        zipCode: parsedAddress.zipCode || prevLocation.zipCode || "",
        formattedAddress: resolvedAddress,
        address: resolvedAddress,
        latitude: normalizedLat,
        longitude: normalizedLng,
        coordinates: [normalizedLng, normalizedLat],
      }

      const prevLat = Number(prevLocation?.latitude)
      const prevLng = Number(prevLocation?.longitude)
      const hasSameCoords =
        Number.isFinite(prevLat) &&
        Number.isFinite(prevLng) &&
        prevLat === normalizedLat &&
        prevLng === normalizedLng
      const hasSameAddress =
        String(prevLocation?.formattedAddress || "") === resolvedAddress &&
        String(prevLocation?.address || "") === resolvedAddress
      const hasSameLines =
        String(prevLocation?.addressLine1 || "") === String(nextLocation.addressLine1 || "") &&
        String(prevLocation?.addressLine2 || "") === String(nextLocation.addressLine2 || "") &&
        String(prevLocation?.area || "") === String(nextLocation.area || "") &&
        String(prevLocation?.city || "") === String(nextLocation.city || "") &&
        String(prevLocation?.state || "") === String(nextLocation.state || "") &&
        String(prevLocation?.landmark || "") === String(nextLocation.landmark || "") &&
        String(prevLocation?.zipCode || "") === String(nextLocation.zipCode || "")

      return hasSameCoords && hasSameAddress && hasSameLines ? prevLocation : nextLocation
    })

    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: normalizedLat, lng: normalizedLng })
      if (mapInstanceRef.current.getZoom() < 16) {
        mapInstanceRef.current.setZoom(16)
      }
    }

    if (!window.google?.maps || !mapInstanceRef.current) return

    if (!markerRef.current) {
      const canUseAdvancedMarker = Boolean(GOOGLE_MAP_ID)
      const AdvancedMarkerConstructor =
        canUseAdvancedMarker ? window.google?.maps?.marker?.AdvancedMarkerElement : null
      if (AdvancedMarkerConstructor) {
        markerRef.current = new AdvancedMarkerConstructor({
          map: mapInstanceRef.current,
          position: { lat: normalizedLat, lng: normalizedLng },
          title: resolvedAddress,
          gmpDraggable: true,
        })
      } else {
        markerRef.current = new window.google.maps.Marker({
          map: mapInstanceRef.current,
          draggable: true,
          animation: window.google.maps.Animation.DROP,
        })
      }

      markerRef.current.addListener("dragend", (event) => {
        const newLat = event.latLng.lat()
        const newLng = event.latLng.lng()
        const geocoder = new window.google.maps.Geocoder()
        geocoder.geocode({ location: { lat: newLat, lng: newLng } }, (results, status) => {
          if (status === "OK" && results?.length) {
            updateSelectedLocation(newLat, newLng, results[0].formatted_address, results[0].address_components || [])
          } else {
            updateSelectedLocation(newLat, newLng, `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`)
          }
        })
      })
    }

    if (typeof markerRef.current.setPosition === "function") {
      markerRef.current.setPosition({ lat: normalizedLat, lng: normalizedLng })
    } else {
      markerRef.current.position = { lat: normalizedLat, lng: normalizedLng }
    }

    if (typeof markerRef.current.setTitle === "function") {
      markerRef.current.setTitle(resolvedAddress)
    } else {
      markerRef.current.title = resolvedAddress
    }
  }

  const initializeMap = async (google) => {
    const mapElement = mapRef.current
    if (!(mapElement instanceof HTMLElement)) {
      return false
    }

    const MapConstructor = google?.maps?.Map
    if (
      GOOGLE_MAP_ID &&
      !google?.maps?.marker?.AdvancedMarkerElement &&
      typeof google?.maps?.importLibrary === "function"
    ) {
      await google.maps.importLibrary("marker")
    }
    if (!MapConstructor) {
      throw new Error("Google Maps Map library is unavailable")
    }

    if (!(mapElement instanceof HTMLElement)) {
      return false
    }

    const initialLat = Number(step1.location?.latitude)
    const initialLng = Number(step1.location?.longitude)
    const center =
      Number.isFinite(initialLat) && Number.isFinite(initialLng)
        ? { lat: initialLat, lng: initialLng }
        : { lat: 20.5937, lng: 78.9629 }

    const map = new MapConstructor(mapElement, {
      center,
      zoom: Number.isFinite(initialLat) && Number.isFinite(initialLng) ? 16 : 5,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      gestureHandling: "greedy",
      ...(GOOGLE_MAP_ID ? { mapId: GOOGLE_MAP_ID } : {}),
    })

    mapInstanceRef.current = map
    map.addListener("click", (event) => {
      const lat = event.latLng.lat()
      const lng = event.latLng.lng()
      const geocoder = new google.maps.Geocoder()
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && results?.length) {
          updateSelectedLocation(lat, lng, results[0].formatted_address, results[0].address_components || [])
        } else {
          updateSelectedLocation(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`)
        }
      })
    })

    if (Number.isFinite(initialLat) && Number.isFinite(initialLng)) {
      updateSelectedLocation(
        initialLat,
        initialLng,
        step1.location?.formattedAddress || step1.location?.address || `${initialLat}, ${initialLng}`
      )
    }

    setMapLoading(false)
    return true
  }

  const reverseGeocodeCurrentLocation = (lat, lng) => {
    if (!window.google?.maps) {
      updateSelectedLocation(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`)
      return
    }

    const geocoder = new window.google.maps.Geocoder()
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results?.length) {
        updateSelectedLocation(lat, lng, results[0].formatted_address, results[0].address_components || [])
      } else {
        updateSelectedLocation(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`)
      }
    })
  }

  const handleSavePinnedLocation = () => {
    const markerPosition = getMarkerCoordinates(markerRef.current)
    const mapCenter = mapInstanceRef.current?.getCenter?.()

    const lat = Number(
      markerPosition?.lat ??
      mapCenter?.lat?.() ??
      step1.location?.latitude
    )
    const lng = Number(
      markerPosition?.lng ??
      mapCenter?.lng?.() ??
      step1.location?.longitude
    )

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Move the map pin first, then save the location")
      return
    }

    reverseGeocodeCurrentLocation(lat, lng)
    toast.success("Pinned location saved")
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported on this device/browser")
      return
    }

    setDetectingLocation(true)
    setMapError("")

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position?.coords?.latitude)
        const lng = Number(position?.coords?.longitude)

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setDetectingLocation(false)
          toast.error("Unable to detect your current location")
          return
        }

        reverseGeocodeCurrentLocation(lat, lng)
        setDetectingLocation(false)
        toast.success("Current location selected")
      },
      (geoError) => {
        setDetectingLocation(false)
        const message =
          geoError?.code === 1
            ? "Location permission denied"
            : geoError?.code === 2
              ? "Current location is unavailable"
              : "Timed out while fetching current location"
        toast.error(message)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    )
  }

  const handleSearchLocation = () => {
    const query = String(locationSearch || "").trim()
    if (!query) {
      toast.error("Enter a location to search")
      return
    }

    if (!window.google?.maps) {
      toast.error("Google Maps is still loading")
      return
    }

    const geocoder = new window.google.maps.Geocoder()
    geocoder.geocode({ address: query, region: "IN" }, (results, status) => {
      if (status === "OK" && results?.length) {
        const location = results[0]?.geometry?.location
        if (!location) {
          toast.error("Could not resolve that location")
          return
        }

        updateSelectedLocation(
          location.lat(),
          location.lng(),
          results[0].formatted_address,
          results[0].address_components || []
        )
        toast.success("Location found")
        return
      }

      toast.error("No matching location found")
    })
  }

  // Read step only from URL/API, not from localStorage cache
  useEffect(() => {
    const stepParam = requestedStepParam
    if (stepParam) {
      const stepNum = parseInt(stepParam, 10)
      if (stepNum >= 1 && stepNum <= 4) {
        setStep(stepNum)
      }
    }

    if (isFreshStepOne) {
      return
    }
  }, [isFreshStepOne, requestedStepParam])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const profileResponse = await restaurantAPI.getCurrentRestaurant()
        const currentRestaurant =
          profileResponse?.data?.data?.restaurant ||
          profileResponse?.data?.restaurant ||
          null
        const redirectPath = getVerificationRedirectPath(currentRestaurant)

        if (redirectPath) {
          navigate(redirectPath, { replace: true })
          return
        }

        if (isFreshStepOne) {
          return
        }

        const res = await api.get("/restaurant/onboarding")
        const data = res?.data?.data?.onboarding
        if (data) {
          if (data.step1) {
            setStep1(() => ({
              restaurantName: data.step1.restaurantName || "",
              ownerName: data.step1.ownerName || "",
              ownerEmail: data.step1.ownerEmail || "",
              ownerPhone: data.step1.ownerPhone || "",
              primaryContactNumber: data.step1.primaryContactNumber || "",
              location: {
                addressLine1: data.step1.location?.addressLine1 || "",
                addressLine2: data.step1.location?.addressLine2 || "",
                area: data.step1.location?.area || "",
                city: data.step1.location?.city || "",
                state: data.step1.location?.state || "",
                landmark: data.step1.location?.landmark || "",
                zipCode: data.step1.location?.zipCode || "",
                formattedAddress: data.step1.location?.formattedAddress || "",
                address: data.step1.location?.address || "",
                latitude: data.step1.location?.latitude ?? "",
                longitude: data.step1.location?.longitude ?? "",
                coordinates: data.step1.location?.coordinates || [],
              },
            }))
            setLocationSearch(
              data.step1.location?.formattedAddress ||
              data.step1.location?.address ||
              ""
            )
          }
          if (data.step2) {
            setStep2({
              // Load menu images from URLs if available
              menuImages: data.step2.menuImageUrls || [],
              // Load profile image URL if available
              profileImage: data.step2.profileImageUrl || null,
              cuisines: data.step2.cuisines || [],
              openingTime: data.step2.deliveryTimings?.openingTime || DEFAULT_OPENING_TIME,
              closingTime: data.step2.deliveryTimings?.closingTime || DEFAULT_CLOSING_TIME,
              openDays: data.step2.openDays || [],
            })
          }
          if (data.step3) {
            setStep3({
              panNumber: data.step3.pan?.panNumber || "",
              nameOnPan: data.step3.pan?.nameOnPan || "",
              panImage: null, // Don't load images from API, user needs to re-upload
              gstRegistered: data.step3.gst?.isRegistered || false,
              gstNumber: data.step3.gst?.gstNumber || "",
              gstLegalName: data.step3.gst?.legalName || "",
              gstAddress: data.step3.gst?.address || "",
              gstImage: null, // Don't load images from API, user needs to re-upload
              fssaiNumber: data.step3.fssai?.registrationNumber || "",
              fssaiExpiry: data.step3.fssai?.expiryDate
                ? data.step3.fssai.expiryDate.slice(0, 10)
                : "",
              fssaiImage: null, // Don't load images from API, user needs to re-upload
              accountNumber: data.step3.bank?.accountNumber || "",
              confirmAccountNumber: data.step3.bank?.accountNumber || "",
              ifscCode: data.step3.bank?.ifscCode || "",
              accountHolderName: data.step3.bank?.accountHolderName || "",
              accountType: data.step3.bank?.accountType || "",
            })
          }

          if (data.step4) {
            setStep4({
              estimatedDeliveryTime: data.step4.estimatedDeliveryTime || "",
              featuredDish: data.step4.featuredDish || "",
              featuredPrice: data.step4.featuredPrice || "",
              offer: data.step4.offer || "",
            })
          }

          // Determine which step to show based on completeness
          const stepToShow = determineStepToShow(data)
          if (stepToShow) {
            setStep(stepToShow)
          } else {
            navigate("/restaurant", { replace: true })
            return
          }
        }
      } catch (err) {
        // Handle error gracefully - if it's a 401 (unauthorized), the user might need to login again
        // Otherwise, just continue with empty onboarding data
        if (err?.response?.status === 401) {
          console.error("Authentication error fetching onboarding:", err)
          // Don't show error to user, they can still fill the form
          // The error might be because restaurant is not yet active (pending verification)
        } else {
          console.error("Error fetching onboarding data:", err)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [isFreshStepOne])

  useEffect(() => {
    if (isFreshStepOne) {
      setSignedInPhone("")
      return
    }

    const resolveSignedInPhone = async () => {
      try {
        const cachedRaw = localStorage.getItem("restaurant_user")
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw)
          const cachedPhone = normalizePhoneDigits(
            cached?.ownerPhone || cached?.primaryContactNumber || cached?.phone
          )
          if (cachedPhone) {
            setSignedInPhone(cachedPhone)
            return
          }
        }
      } catch (error) {
        console.error("Failed to parse cached restaurant user:", error)
      }

      try {
        const response = await restaurantAPI.getCurrentRestaurant()
        const restaurant = response?.data?.data?.restaurant || response?.data?.data || {}
        const profilePhone = normalizePhoneDigits(
          restaurant?.ownerPhone || restaurant?.primaryContactNumber || restaurant?.phone
        )
        if (profilePhone) {
          setSignedInPhone(profilePhone)
        }
      } catch (error) {
        console.error("Failed to fetch signed-in restaurant phone:", error)
      }
    }

    resolveSignedInPhone()
  }, [isFreshStepOne])

  useEffect(() => {
    if (isFreshStepOne || !signedInPhone) return
    setStep1((prev) => {
      const next = { ...prev }
      let changed = false
      if (!normalizePhoneDigits(prev.ownerPhone)) {
        next.ownerPhone = signedInPhone
        changed = true
      }
      if (!normalizePhoneDigits(prev.primaryContactNumber)) {
        next.primaryContactNumber = signedInPhone
        changed = true
      }
      return changed ? next : prev
    })
  }, [isFreshStepOne, signedInPhone])

  useEffect(() => {
    let cancelled = false

    const loadMap = async () => {
      if (loading || step !== 1) {
        setMapLoading(false)
        return
      }

      try {
        setMapLoading(true)
        setMapError("")

        const googleLib = await waitForGoogleMaps()

        if (!cancelled) {
          const initialized = await initializeMap(googleLib)
          if (!initialized && !cancelled) {
            window.setTimeout(() => {
              if (!cancelled) {
                loadMap()
              }
            }, 50)
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load onboarding map:", err)
          setMapError(err?.message || "Failed to load map")
          setMapLoading(false)
        }
      }
    }

    loadMap()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, step])

  useEffect(() => {
    if (!mapInstanceRef.current) return

    const lat = Number(step1.location?.latitude)
    const lng = Number(step1.location?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    updateSelectedLocation(
      lat,
      lng,
      step1.location?.formattedAddress || step1.location?.address || `${lat}, ${lng}`
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step1.location?.latitude, step1.location?.longitude, step1.location?.formattedAddress, step1.location?.address])

  useEffect(() => {
    if (!mapInstanceRef.current || hasResolvedInitialMapCenterRef.current) return

    const existingLat = Number(step1.location?.latitude)
    const existingLng = Number(step1.location?.longitude)
    if (Number.isFinite(existingLat) && Number.isFinite(existingLng)) {
      hasResolvedInitialMapCenterRef.current = true
      return
    }

    if (!navigator.geolocation) {
      hasResolvedInitialMapCenterRef.current = true
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (hasResolvedInitialMapCenterRef.current) return
        hasResolvedInitialMapCenterRef.current = true

        const lat = Number(position?.coords?.latitude)
        const lng = Number(position?.coords?.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

        reverseGeocodeCurrentLocation(lat, lng)
      },
      () => {
        hasResolvedInitialMapCenterRef.current = true
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step1.location?.latitude, step1.location?.longitude])

  const handleUpload = async (file, folder) => {
    try {
      const res = await uploadAPI.uploadMedia(file, { folder })
      const d = res?.data?.data || res?.data
      return { url: d.url, publicId: d.publicId }
    } catch (err) {
      // Provide more informative error message for upload failures
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      console.error("Upload error:", errorMsg, err)
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  const handleCameraCapture = async (onSuccess) => {
    if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
      try {
        toast.loading("Capturing image...", { id: "cameraCapture" });
        const result = await window.flutter_inappwebview.callHandler('openCamera');
        if (result && result.success && result.base64) {
          const base64Data = result.base64;
          const mimeType = result.mimeType || 'image/jpeg';
          const filename = result.fileName || `camera_${Date.now()}.jpg`;

          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const file = new File([byteArray], filename, { type: mimeType });

          onSuccess(file);
          toast.success("Image captured successfully", { id: "cameraCapture" });
        } else {
          toast.error("Camera capture failed or cancelled", { id: "cameraCapture" });
        }
      } catch (error) {
        console.error('Camera error:', error);
        toast.error('Failed to capture image', { id: "cameraCapture" });
      }
    } else {
      toast.error("Camera is only available in the mobile app");
    }
  };

  const isAllowedImageFile = (file) => {
    if (!(file instanceof File)) return false
    const mime = String(file.type || "").toLowerCase()
    if (ALLOWED_IMAGE_MIME_TYPES.has(mime)) return true
    const name = String(file.name || "").toLowerCase()
    return ALLOWED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext))
  }

  const extractFirstFlutterGalleryFile = (result) => {
    if (!result) return null
    if (Array.isArray(result?.files) && result.files.length) return result.files[0]
    if (Array.isArray(result) && result.length) return result[0]
    if (result?.base64) return result
    return null
  }

  const buildFileFromFlutterResult = (fileData, fallbackPrefix = "gallery") => {
    if (!fileData?.base64) return null
    const cleanBase64 = String(fileData.base64).replace(/^data:[^;]+;base64,/, "")
    const mimeType = fileData.mimeType || "image/jpeg"
    const fileName = fileData.fileName || `${fallbackPrefix}_${Date.now()}.jpg`
    const byteCharacters = atob(cleanBase64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i += 1) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    return new File([new Uint8Array(byteNumbers)], fileName, { type: mimeType })
  }

  const handleGalleryPick = async (onSuccess, fallbackInputId, fallbackPrefix = "gallery") => {
    if (!window.flutter_inappwebview?.callHandler) {
      document.getElementById(fallbackInputId)?.click()
      return
    }

    try {
      toast.loading("Opening gallery...", { id: "galleryPick" })
      const result = await window.flutter_inappwebview.callHandler("openGallery")
      const fileData = extractFirstFlutterGalleryFile(result)
      const file = buildFileFromFlutterResult(fileData, fallbackPrefix)
      if (file) {
        onSuccess(file)
        toast.success("Image selected successfully", { id: "galleryPick" })
        return
      }

      toast.dismiss("galleryPick")
      document.getElementById(fallbackInputId)?.click()
    } catch (error) {
      console.error("Gallery pick failed:", error)
      toast.dismiss("galleryPick")
      document.getElementById(fallbackInputId)?.click()
    }
  }

  const openFallbackCameraInput = (onSuccess) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.setAttribute("capture", "environment")
    input.style.display = "none"
    input.onchange = (event) => {
      const file = event.target?.files?.[0] || null
      if (file) onSuccess(file)
      input.remove()
    }
    document.body.appendChild(input)
    input.click()
  }

  // Validation functions for each step
  const validateStep1 = () => {
    const errors = []

    if (!step1.restaurantName?.trim()) {
      errors.push("Restaurant name is required")
    }
    if (!step1.ownerName?.trim()) {
      errors.push("Owner name is required")
    } else if (!/^[A-Za-z\s-]+$/.test(step1.ownerName.trim())) {
      errors.push("Full name should contain only letters and spaces")
    }
    if (!step1.ownerEmail?.trim()) {
      errors.push("Owner email is required")
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step1.ownerEmail)) {
      errors.push("Please enter a valid email address")
    }
    if (!step1.ownerPhone?.trim()) {
      errors.push("Owner phone number is required")
    } else if (!/^\d{7,15}$/.test(step1.ownerPhone.trim())) {
      errors.push("Phone number must be 7-15 digits only")
    }
    if (!step1.primaryContactNumber?.trim()) {
      errors.push("Primary contact number is required")
    } else if (!/^\d{7,15}$/.test(step1.primaryContactNumber.trim())) {
      errors.push("Primary contact number must be 7-15 digits only")
    }
    if (!step1.location?.area?.trim()) {
      errors.push("Area/Sector/Locality is required")
    }
    if (!step1.location?.city?.trim()) {
      errors.push("City is required")
    }
    if (!Number.isFinite(Number(step1.location?.latitude)) || !Number.isFinite(Number(step1.location?.longitude))) {
      errors.push("Please pinpoint the restaurant location on the map")
    }

    return errors
  }

  const validateStep2 = () => {
    return []
  }

  const validateStep4 = () => {
    return []
  }

  const validateStep3 = () => {
    return []
  }

  // Fill dummy data for testing (development mode only)
  const fillDummyData = () => {
    if (step === 1) {
      setStep1({
        restaurantName: "Test Restaurant",
        ownerName: "John Doe",
        ownerEmail: "john.doe@example.com",
        ownerPhone: "+91 9876543210",
        primaryContactNumber: "+91 9876543210",
        location: {
          addressLine1: "123 Main Street",
          addressLine2: "Building A, Floor 2",
          area: "Downtown",
          city: "Mumbai",
          landmark: "Near Central Park",
        },
      })
      toast.success("Step 1 filled with dummy data", { duration: 2000 })
    } else if (step === 2) {
      setStep2({
        menuImages: [],
        profileImage: null,
        cuisines: ["North Indian", "Chinese"],
        openingTime: "09:00",
        closingTime: "22:00",
        openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      })
      toast.success("Step 2 filled with dummy data", { duration: 2000 })
    } else if (step === 3) {
      // Calculate expiry date 1 year from now
      const expiryDate = new Date()
      expiryDate.setFullYear(expiryDate.getFullYear() + 1)
      const expiryDateString = expiryDate.toISOString().split("T")[0]

      setStep3({
        panNumber: "ABCDE1234F",
        nameOnPan: "John Doe",
        panImage: null,
        gstRegistered: true,
        gstNumber: "27ABCDE1234F1Z5",
        gstLegalName: "Test Restaurant Private Limited",
        gstAddress: "123 Main Street, Mumbai, Maharashtra 400001",
        gstImage: null,
        fssaiNumber: "12345678901234",
        fssaiExpiry: expiryDateString,
        fssaiImage: null,
        accountNumber: "1234567890123",
        confirmAccountNumber: "1234567890123",
        ifscCode: "HDFC0001234",
        accountHolderName: "John Doe",
        accountType: "savings",
      })
      toast.success("Step 3 filled with dummy data", { duration: 2000 })
    } else if (step === 4) {
      setStep4({
        estimatedDeliveryTime: "25-30 mins",
        featuredDish: "Butter Chicken Special",
        featuredPrice: "249",
        offer: "Flat Rs50 OFF above Rs199",
      })
      toast.success("Step 4 filled with dummy data", { duration: 2000 })
    }
  }

  const handleNext = async () => {
    setError("")

    // Validate current step before proceeding
    let validationErrors = []
    if (step === 1) {
      validationErrors = validateStep1()
    } else if (step === 2) {
      validationErrors = validateStep2()
    } else if (step === 3) {
      validationErrors = validateStep3()
    } else if (step === 4) {
      validationErrors = validateStep4()
      console.log('Step 4 validation:', {
        step4,
        errors: validationErrors,
        estimatedDeliveryTime: step4.estimatedDeliveryTime || "",
        featuredDish: step4.featuredDish || "",
        featuredPrice: step4.featuredPrice,
        offer: step4.offer
      })
    }

    if (validationErrors.length > 0) {
      // Show error toast for each validation error
      validationErrors.forEach((error, index) => {
        setTimeout(() => {
          toast.error(error, {
            duration: 4000,
          })
        }, index * 100)
      })
      console.log('Validation failed:', validationErrors)
      return
    }

    setSaving(true)
    try {
      if (step === 1) {
        const payload = {
          step1,
          completedSteps: 1,
        }
        await api.put("/restaurant/onboarding", payload)
        setStep(2)
      } else if (step === 2) {
        const menuUploads = []
        // Upload menu images if they are File objects
        for (const file of step2.menuImages.filter((f) => f instanceof File)) {
          try {
            const uploaded = await handleUpload(file, "mobasket/restaurant/menu")
            // Verify upload was successful and has valid URL
            if (!uploaded || !uploaded.url) {
              throw new Error(`Failed to upload menu image: ${file.name}`)
            }
            menuUploads.push(uploaded)
          } catch (uploadError) {
            console.error('Menu image upload error:', uploadError)
            throw new Error(`Failed to upload menu image: ${uploadError.message}`)
          }
        }
        // If menuImages already have URLs (from previous save), include them
        const existingMenuUrls = step2.menuImages.filter((img) => !(img instanceof File) && (img?.url || (typeof img === 'string' && img.startsWith('http'))))
        const allMenuUrls = [...existingMenuUrls, ...menuUploads]

        // Upload profile image if it's a File object
        let profileUpload = null
        if (step2.profileImage instanceof File) {
          try {
            profileUpload = await handleUpload(step2.profileImage, "mobasket/restaurant/profile")
            // Verify upload was successful and has valid URL
            if (!profileUpload || !profileUpload.url) {
              throw new Error('Failed to upload profile image')
            }
          } catch (uploadError) {
            console.error('Profile image upload error:', uploadError)
            throw new Error(`Failed to upload profile image: ${uploadError.message}`)
          }
        } else if (step2.profileImage?.url) {
          // If profileImage already has a URL (from previous save), use it
          profileUpload = step2.profileImage
        } else if (typeof step2.profileImage === 'string' && step2.profileImage.startsWith('http')) {
          // If it's a direct URL string
          profileUpload = { url: step2.profileImage }
        }

        const payload = {
          step2: {
            menuImageUrls: allMenuUrls.length > 0 ? allMenuUrls : [],
            profileImageUrl: profileUpload,
            cuisines: step2.cuisines || [],
            deliveryTimings: {
              openingTime: step2.openingTime || "",
              closingTime: step2.closingTime || "",
            },
            openDays: step2.openDays || [],
          },
          completedSteps: 2,
        }
        console.log('Step2 payload:', {
          menuImageUrlsCount: payload.step2.menuImageUrls.length,
          hasProfileImage: !!payload.step2.profileImageUrl,
          cuisines: payload.step2.cuisines,
          openDays: payload.step2.openDays,
          deliveryTimings: payload.step2.deliveryTimings,
        })

        const response = await api.put("/restaurant/onboarding", payload)
        console.log('Step2 response:', response?.data)

        // Verify response is successful
        if (!response || !response.data) {
          throw new Error('Invalid response from server')
        }

        // After step2, also update restaurant schema with step2 data
        // This ensures data is saved immediately, not just in onboarding subdocument
        if (response?.data?.data?.restaurant) {
          console.log('Step2 data saved and restaurant updated')
        }

        // Only proceed to step 3 if save was successful
        if (response?.data?.data?.onboarding || response?.data?.data) {
          console.log('Step2 completed successfully, moving to step 3')
          setStep(3)
        } else {
          throw new Error('Failed to save step2 data')
        }
      } else if (step === 3) {
        // Upload PAN image if it's a File object
        let panImageUpload = null
        if (step3.panImage instanceof File) {
          try {
            panImageUpload = await handleUpload(step3.panImage, "mobasket/restaurant/pan")
            // Verify upload was successful and has valid URL
            if (!panImageUpload || !panImageUpload.url) {
              throw new Error('Failed to upload PAN image')
            }
          } catch (uploadError) {
            console.error('PAN image upload error:', uploadError)
            throw new Error(`Failed to upload PAN image: ${uploadError.message}`)
          }
        } else if (step3.panImage?.url) {
          // If panImage already has a URL (from previous save), use it
          panImageUpload = step3.panImage
        } else if (typeof step3.panImage === 'string' && step3.panImage.startsWith('http')) {
          // If it's a direct URL string
          panImageUpload = { url: step3.panImage }
        }

        // Upload GST image if it's a File object (only if GST registered)
        let gstImageUpload = null
        if (step3.gstRegistered) {
          if (step3.gstImage instanceof File) {
            try {
              gstImageUpload = await handleUpload(step3.gstImage, "mobasket/restaurant/gst")
              // Verify upload was successful and has valid URL
              if (!gstImageUpload || !gstImageUpload.url) {
                throw new Error('Failed to upload GST image')
              }
            } catch (uploadError) {
              console.error('GST image upload error:', uploadError)
              throw new Error(`Failed to upload GST image: ${uploadError.message}`)
            }
          } else if (step3.gstImage?.url) {
            // If gstImage already has a URL (from previous save), use it
            gstImageUpload = step3.gstImage
          } else if (typeof step3.gstImage === 'string' && step3.gstImage.startsWith('http')) {
            // If it's a direct URL string
            gstImageUpload = { url: step3.gstImage }
          }

        }

        // Upload FSSAI image if it's a File object
        let fssaiImageUpload = null
        if (step3.fssaiImage instanceof File) {
          try {
            fssaiImageUpload = await handleUpload(step3.fssaiImage, "mobasket/restaurant/fssai")
            // Verify upload was successful and has valid URL
            if (!fssaiImageUpload || !fssaiImageUpload.url) {
              throw new Error('Failed to upload FSSAI image')
            }
          } catch (uploadError) {
            console.error('FSSAI image upload error:', uploadError)
            throw new Error(`Failed to upload FSSAI image: ${uploadError.message}`)
          }
        } else if (step3.fssaiImage?.url) {
          // If fssaiImage already has a URL (from previous save), use it
          fssaiImageUpload = step3.fssaiImage
        } else if (typeof step3.fssaiImage === 'string' && step3.fssaiImage.startsWith('http')) {
          // If it's a direct URL string
          fssaiImageUpload = { url: step3.fssaiImage }
        }

        const payload = {
          step3: {
            pan: {
              panNumber: step3.panNumber || "",
              nameOnPan: step3.nameOnPan || "",
              image: panImageUpload || null,
            },
            gst: {
              isRegistered: step3.gstRegistered || false,
              gstNumber: step3.gstNumber || "",
              legalName: step3.gstLegalName || "",
              address: step3.gstAddress || "",
              image: gstImageUpload,
            },
            fssai: {
              registrationNumber: step3.fssaiNumber || "",
              expiryDate: step3.fssaiExpiry || null,
              image: fssaiImageUpload || null,
            },
            bank: {
              accountNumber: step3.accountNumber || "",
              ifscCode: step3.ifscCode || "",
              accountHolderName: step3.accountHolderName || "",
              accountType: step3.accountType || "",
            },
          },
          completedSteps: 3,
        }
        console.log('Step3 payload:', {
          hasPan: !!payload.step3.pan.panNumber,
          hasGst: payload.step3.gst.isRegistered,
          hasFssai: !!payload.step3.fssai.registrationNumber,
          hasBank: !!payload.step3.bank.accountNumber,
        })

        const response = await api.put("/restaurant/onboarding", payload)
        console.log('Step3 response:', response?.data)

        if (response?.data?.data?.onboarding) {
          console.log('Step3 data saved successfully')
        }
        setStep(4)
      } else if (step === 4) {
        console.log('Submitting Step 4:', step4)
        const payload = {
          step4: {
            estimatedDeliveryTime: step4.estimatedDeliveryTime || "",
            featuredDish: step4.featuredDish || "",
            featuredPrice: step4.featuredPrice === "" || step4.featuredPrice === null || step4.featuredPrice === undefined ? null : Number(step4.featuredPrice),
            offer: step4.offer || "",
          },
          completedSteps: 4,
        }
        console.log('Step 4 payload:', payload)
        const response = await api.put("/restaurant/onboarding", payload)
        console.log('Step4 completed, response:', response?.data)

        // Verify response is successful
        if (!response || !response.data) {
          throw new Error('Invalid response from server')
        }

        window.dispatchEvent(new Event("restaurantAuthChanged"))
        window.dispatchEvent(new Event("restaurantProfileRefresh"))
        toast.success("Onboarding submitted. Verification is pending.")

        // Show success message briefly, then navigate
        console.log('Onboarding completed successfully, redirecting to pending verification...')

        // Wait a moment to ensure data is saved, then navigate
        setTimeout(() => {
          // Navigate to pending approval page after onboarding completion
          console.log('Navigating to restaurant pending approval page...')
          navigate("/restaurant/pending-approval", { replace: true })
        }, 800)
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save onboarding data"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const toggleCuisine = (cuisine) => {
    setStep2((prev) => {
      const exists = prev.cuisines.includes(cuisine)
      if (exists) {
        return { ...prev, cuisines: prev.cuisines.filter((c) => c !== cuisine) }
      }
      if (prev.cuisines.length >= 3) return prev
      return { ...prev, cuisines: [...prev.cuisines, cuisine] }
    })
  }

  const toggleDay = (day) => {
    setStep2((prev) => {
      const exists = prev.openDays.includes(day)
      if (exists) {
        return { ...prev, openDays: prev.openDays.filter((d) => d !== day) }
      }
      return { ...prev, openDays: [...prev.openDays, day] }
    })
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Restaurant information</h2>
        <p className="text-sm text-gray-600 mb-4">Restaurant name</p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-700">Restaurant name*</Label>
            <Input
              value={step1.restaurantName || ""}
              onChange={(e) => setStep1({ ...step1, restaurantName: e.target.value })}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="Customers will see this name"
            />
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Owner details</h2>
        <p className="text-sm text-gray-600 mb-4">
          These details will be used for all business communications and updates.
        </p>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-700">Full name*</Label>
            <Input
              value={step1.ownerName || ""}
              onChange={(e) => {
                const val = e.target.value.replace(/[^A-Za-z\s-]/g, "")
                setStep1({ ...step1, ownerName: val })
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="Owner full name"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">Email address*</Label>
            <Input
              type="email"
              value={step1.ownerEmail || ""}
              onChange={(e) => setStep1({ ...step1, ownerEmail: e.target.value })}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="owner@example.com"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">Phone number*</Label>
            <Input
              type="tel"
              inputMode="numeric"
              value={step1.ownerPhone || ""}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "")
                setStep1({ ...step1, ownerPhone: val })
              }}
              className="mt-1 bg-white text-sm text-black placeholder-black"
              placeholder="9876543210"
            />
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant contact & location</h2>
        <div>
          <Label className="text-xs text-gray-700">Primary contact number*</Label>
          <Input
            type="tel"
            inputMode="numeric"
            value={step1.primaryContactNumber || ""}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "")
              setStep1({ ...step1, primaryContactNumber: val })
            }}
            className="mt-1 bg-white text-sm text-black placeholder-black"
            placeholder="Restaurant's primary contact number"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Customers, delivery partners and {companyName} may call on this number for order support.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs text-gray-700">Area / Sector / Locality*</Label>
            <Input
              value={step1.location?.area || ""}
              onChange={(e) => updateStep1Location((prev) => ({ ...prev, area: e.target.value }))}
              className="mt-1 bg-white text-sm"
              placeholder="Area / Sector / Locality"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">City*</Label>
            <Input
              value={step1.location?.city || ""}
              onChange={(e) => updateStep1Location((prev) => ({ ...prev, city: e.target.value }))}
              className="mt-1 bg-white text-sm"
              placeholder="City"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">State</Label>
            <Input
              value={step1.location?.state || ""}
              onChange={(e) => updateStep1Location((prev) => ({ ...prev, state: e.target.value }))}
              className="mt-1 bg-white text-sm"
              placeholder="State"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-gray-700">Address line 1</Label>
            <Input
              value={step1.location?.addressLine1 || ""}
              onChange={(e) => updateStep1Location((prev) => ({ ...prev, addressLine1: e.target.value }))}
              className="mt-1 bg-white text-sm"
              placeholder="Shop no. / building no."
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-gray-700">Address line 2</Label>
            <Input
              value={step1.location?.addressLine2 || ""}
              onChange={(e) => updateStep1Location((prev) => ({ ...prev, addressLine2: e.target.value }))}
              className="mt-1 bg-white text-sm"
              placeholder="Floor / tower"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">ZIP / postal code</Label>
            <Input
              value={step1.location?.zipCode || ""}
              onChange={(e) => updateStep1Location((prev) => ({ ...prev, zipCode: e.target.value }))}
              className="mt-1 bg-white text-sm"
              placeholder="Postal code"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-700">Nearby landmark</Label>
            <Input
              value={step1.location?.landmark || ""}
              onChange={(e) => updateStep1Location((prev) => ({ ...prev, landmark: e.target.value }))}
              className="mt-1 bg-white text-sm"
              placeholder="Nearby landmark"
            />
          </div>
          <div className="sm:col-span-2">
            <p className="text-[11px] text-gray-500 mt-1">
              Please ensure that this address is the same as mentioned on your FSSAI license.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-black">Pinpoint restaurant location</h2>
          <p className="text-xs text-gray-500 mt-1">
            Search for your restaurant, click on the map, or drag the pin to set the exact location.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                placeholder="Search for your restaurant location"
                className="pl-10"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleSearchLocation}
              className="sm:min-w-[120px]"
            >
              Search
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleUseCurrentLocation}
              disabled={detectingLocation}
              className="sm:min-w-[180px]"
            >
              {detectingLocation ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <MapPin className="mr-2 h-4 w-4" />
                  Use current location
                </>
              )}
            </Button>
          </div>

          {(step1.location?.formattedAddress || (Number.isFinite(Number(step1.location?.latitude)) && Number.isFinite(Number(step1.location?.longitude)))) && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              <div className="font-medium">{step1.location?.formattedAddress || "Pinned location selected"}</div>
              {Number.isFinite(Number(step1.location?.latitude)) && Number.isFinite(Number(step1.location?.longitude)) && (
                <div className="mt-1 text-green-700">
                  Coordinates: {Number(step1.location.latitude).toFixed(6)}, {Number(step1.location.longitude).toFixed(6)}
                </div>
              )}
            </div>
          )}

          <div className="relative overflow-hidden rounded-md border border-gray-200 bg-gray-50">
            <div ref={mapRef} className="h-[320px] w-full" />
            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading map...</span>
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-500">
            Tap anywhere on the map to drop a pin. You can drag the marker if the spot needs adjustment.
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSavePinnedLocation}
              variant="outline"
              className="sm:min-w-[160px]"
            >
              Save location
            </Button>
          </div>
          {mapError && <div className="text-xs text-red-600">{mapError}</div>}
        </div>
      </section>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Images section */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        <h2 className="text-lg font-semibold text-black">Menu & photos</h2>
        <p className="text-xs text-gray-500">
          Add clear photos of your printed menu and a primary profile image if you have them. All
          image uploads on this onboarding flow are optional.
        </p>

        {/* Menu images */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Menu images (optional)</Label>
          <div className="mt-1 border border-dashed border-gray-300 rounded-md bg-gray-50/70 px-4 py-3 flex items-center justify-between flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-white flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-gray-700" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-900">Upload menu images</span>
                <span className="text-[11px] text-gray-500">
                  JPG, PNG, WebP. You can skip this for now.
                </span>
              </div>
            </div>
            <div className="flex w-full gap-2">
              <button
                type="button"
                onClick={() => {
                  if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                    handleCameraCapture((file) => {
                      setStep2((prev) => ({
                        ...prev,
                        menuImages: [file],
                      }))
                    });
                  } else {
                    openFallbackCameraInput((file) => {
                      setStep2((prev) => ({
                        ...prev,
                        menuImages: [file],
                      }))
                    })
                  }
                }}
                className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-black text-xs font-medium cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Camera</span>
              </button>
              <button
                type="button"
                onClick={() => document.getElementById("menuImagesInput")?.click()}
                className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-black text-xs font-medium cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Gallery</span>
              </button>
            </div>
            <input
              id="menuImagesInput"
              type="file"
              accept="*/*"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (!files.length) return
                const selectedFile = files[0]
                if (!isAllowedImageFile(selectedFile)) {
                  toast.error("Please choose a JPG, PNG, or WEBP image")
                  e.target.value = ""
                  return
                }
                console.log('Menu image selected:', selectedFile?.name || '1 file')
                setStep2((prev) => ({
                  ...prev,
                  menuImages: [selectedFile],
                }))
                // Reset input to allow selecting same file again
                e.target.value = ''
              }}
            />
          </div>

          {/* Menu image previews */}
          {!!step2.menuImages.length && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {step2.menuImages.map((file, idx) => {
                // Handle both File objects and URL objects
                let imageUrl = null
                let imageName = `Image ${idx + 1}`

                if (file instanceof File) {
                  imageUrl = URL.createObjectURL(file)
                  imageName = file.name
                } else if (file?.url) {
                  // If it's an object with url property (from backend)
                  imageUrl = file.url
                  imageName = file.name || `Image ${idx + 1}`
                } else if (typeof file === 'string') {
                  // If it's a direct URL string
                  imageUrl = file
                }

                return (
                  <div
                    key={idx}
                    className="relative aspect-[4/5] rounded-md overflow-hidden bg-gray-100"
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`Menu ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-500 px-2 text-center">
                        Preview unavailable
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1">
                      <p className="text-[10px] text-white truncate">
                        {imageName}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Profile image */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Restaurant profile image (optional)</Label>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
              {step2.profileImage ? (
                (() => {
                  let imageSrc = null;

                  if (step2.profileImage instanceof File) {
                    imageSrc = URL.createObjectURL(step2.profileImage);
                  } else if (step2.profileImage?.url) {
                    // If it's an object with url property (from backend)
                    imageSrc = step2.profileImage.url;
                  } else if (typeof step2.profileImage === 'string') {
                    // If it's a direct URL string
                    imageSrc = step2.profileImage;
                  }

                  return imageSrc ? (
                    <img
                      src={imageSrc}
                      alt="Restaurant profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-gray-500" />
                  );
                })()
              ) : (
                <ImageIcon className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <div className="flex-1 flex-col flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-900">Upload profile image</span>
                <span className="text-[11px] text-gray-500">
                  This will be shown on your listing card and restaurant page if you upload one.
                </span>
              </div>

            </div>

          </div>
          <div className="flex w-full gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                  handleCameraCapture((file) => {
                    setStep2((prev) => ({
                      ...prev,
                      profileImage: file,
                    }))
                  });
                } else {
                  openFallbackCameraInput((file) => {
                    setStep2((prev) => ({
                      ...prev,
                      profileImage: file,
                    }))
                  })
                }
              }}
              className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-black text-xs font-medium cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Camera</span>
            </button>
            <button
              type="button"
              onClick={() => document.getElementById("profileImageInput")?.click()}
              className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-black text-xs font-medium cursor-pointer"
            >
              <ImageIcon className="w-4 h-4" />
              <span>Gallery</span>
            </button>
          </div>
          <input
            id="profileImageInput"
            type="file"
            accept="*/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              if (file) {
                if (!isAllowedImageFile(file)) {
                  toast.error("Please choose a JPG, PNG, or WEBP image")
                  e.target.value = ""
                  return
                }
                console.log('Profile image selected:', file.name)
                setStep2((prev) => ({
                  ...prev,
                  profileImage: file,
                }))
              }
              // Reset input to allow selecting same file again
              e.target.value = ''
            }}
          />
        </div>
      </section>

      {/* Operational details */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        {/* Cuisines */}
        <div>
          <Label className="text-xs text-gray-700">Select cuisines (up to 3)</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {cuisinesOptions.map((cuisine) => {
              const active = step2.cuisines.includes(cuisine)
              return (
                <button
                  key={cuisine}
                  type="button"
                  onClick={() => toggleCuisine(cuisine)}
                  className={`px-3 py-1.5 text-xs rounded-full ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"
                    }`}
                >
                  {cuisine}
                </button>
              )
            })}
          </div>
        </div>

        {/* Timings with popover time selectors */}
        <div className="space-y-3">
          <Label className="text-xs text-gray-700">Delivery timings</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimeSelector
              label="Opening time"
              value={step2.openingTime || ""}
              onChange={(val) => setStep2({ ...step2, openingTime: val || "" })}
            />
            <TimeSelector
              label="Closing time"
              value={step2.closingTime || ""}
              onChange={(val) => setStep2({ ...step2, closingTime: val || "" })}
            />
          </div>
        </div>

        {/* Open days in a calendar-like grid */}
        <div className="space-y-2">
          <Label className="text-xs text-gray-700 flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-800" />
            <span>Open days</span>
          </Label>
          <p className="text-[11px] text-gray-500">
            Select the days your restaurant accepts delivery orders.
          </p>
          <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
            {daysOfWeek.map((day) => {
              const active = step2.openDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`aspect-square flex items-center justify-center rounded-md text-[11px] font-medium ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"
                    }`}
                >
                  {day.charAt(0)}
                </button>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )

  const renderStep3 = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Reusable styled file upload box
    const FileUploadBox = ({ id, file, onFileChange, label }) => {
      const galleryInputId = `${id}Gallery`
      const cameraInputId = `${id}Camera`
      const fileName = file instanceof File ? file.name : (file?.name || null)
      return (
        <div>
          {label && <Label className="text-xs text-gray-700 mb-1 block">{label}</Label>}
          <div className="border border-dashed border-gray-300 rounded-md bg-gray-50/70 px-4 py-3 flex flex-col items-center gap-2">
            {fileName ? (
              <div className="flex items-center gap-2 w-full">
                <ImageIcon className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-xs text-gray-800 truncate flex-1">{fileName}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-gray-500" />
                <span className="text-xs text-gray-500">No file chosen</span>
              </div>
            )}
            <div className="flex w-full gap-2">
              <button
                type="button"
                onClick={() => {
                  if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
                    handleCameraCapture((f) => onFileChange(f));
                  } else {
                    document.getElementById(cameraInputId)?.click();
                  }
                }}
                className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-gray-300 text-xs font-medium cursor-pointer hover:bg-gray-50"
              >
                <Camera className="w-4 h-4" />
                <span>Camera</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleGalleryPick(
                    (f) => onFileChange(f),
                    galleryInputId,
                    "doc_gallery"
                  )
                }
                className="flex-1 inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-gray-300 text-xs font-medium cursor-pointer hover:bg-gray-50"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Gallery</span>
              </button>
            </div>
            <input
              id={galleryInputId}
              type="file"
              accept="*/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null
                if (f) {
                  if (!isAllowedImageFile(f)) {
                    toast.error("Please choose a JPG, PNG, or WEBP image")
                    e.target.value = ''
                    return
                  }
                  onFileChange(f)
                }
                e.target.value = ''
              }}
            />
            <input
              id={cameraInputId}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] || null
                if (f) onFileChange(f)
                e.target.value = ''
              }}
            />
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
          <h2 className="text-lg font-semibold text-black">PAN details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-700">PAN number (optional)</Label>
              <Input
                value={step3.panNumber || ""}
                onChange={(e) => {
                  // Uppercase, allow only A-Z and 0-9, max 10 chars
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)
                  setStep3({ ...step3, panNumber: val })
                }}
                className="mt-1 bg-white text-sm text-black placeholder-black"
                placeholder="ABCDE1234F"
                maxLength={10}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700">Name on PAN (optional)</Label>
              <Input
                value={step3.nameOnPan || ""}
                onChange={(e) => {
                  // Allow only letters, spaces, hyphens
                  const val = e.target.value.replace(/[^A-Za-z\s-]/g, "")
                  setStep3({ ...step3, nameOnPan: val })
                }}
                className="mt-1 bg-white text-sm text-black placeholder-black"
                placeholder="Name as on PAN card"
              />
            </div>
          </div>
          <FileUploadBox
            id="panImageInput"
            label="PAN image (optional)"
            file={step3.panImage}
            onFileChange={(f) => setStep3({ ...step3, panImage: f })}
          />
        </section>

        <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
          <h2 className="text-lg font-semibold text-black">GST details</h2>
          <div className="flex gap-4 items-center text-sm">
            <span className="text-gray-700">GST registered?</span>
            <button
              type="button"
              onClick={() => setStep3({ ...step3, gstRegistered: true })}
              className={`px-3 py-1.5 text-xs rounded-full ${step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"
                }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setStep3({ ...step3, gstRegistered: false })}
              className={`px-3 py-1.5 text-xs rounded-full ${!step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"
                }`}
            >
              No
            </button>
          </div>
          {step3.gstRegistered && (
            <div className="space-y-3">
              <Input
                value={step3.gstNumber || ""}
                onChange={(e) => setStep3({ ...step3, gstNumber: e.target.value })}
                className="bg-white text-sm"
                placeholder="GST number"
              />
              <Input
                value={step3.gstLegalName || ""}
                onChange={(e) => setStep3({ ...step3, gstLegalName: e.target.value })}
                className="bg-white text-sm"
                placeholder="Legal name"
              />
              <Input
                value={step3.gstAddress || ""}
                onChange={(e) => setStep3({ ...step3, gstAddress: e.target.value })}
                className="bg-white text-sm"
                placeholder="Registered address"
              />
              <FileUploadBox
                id="gstImageInput"
                label="GST certificate image (optional)"
                file={step3.gstImage}
                onFileChange={(f) => setStep3({ ...step3, gstImage: f })}
              />
            </div>
          )}
        </section>

        <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
          <h2 className="text-lg font-semibold text-black">FSSAI details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-700">FSSAI number (optional)</Label>
              <Input
                value={step3.fssaiNumber || ""}
                onChange={(e) => {
                  // Digits only, max 14 chars
                  const val = e.target.value.replace(/\D/g, "").slice(0, 14)
                  setStep3({ ...step3, fssaiNumber: val })
                }}
                className="bg-white text-sm"
                placeholder="14-digit FSSAI number"
                inputMode="numeric"
                maxLength={14}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700 mb-1 block">FSSAI expiry date (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md bg-white text-sm text-left flex items-center justify-between hover:bg-gray-50"
                  >
                    <span className={step3.fssaiExpiry ? "text-gray-900" : "text-gray-500"}>
                      {step3.fssaiExpiry
                        ? new Date(step3.fssaiExpiry).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                        : "Select expiry date"}
                    </span>
                    <CalendarIcon className="w-4 h-4 text-gray-500" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={step3.fssaiExpiry ? new Date(step3.fssaiExpiry) : undefined}
                    disabled={(date) => date < today}
                    onSelect={(date) => {
                      if (date) {
                        const formattedDate = date.toISOString().split("T")[0]
                        setStep3({ ...step3, fssaiExpiry: formattedDate })
                      }
                    }}
                    initialFocus
                    className="rounded-md border border-gray-200"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <FileUploadBox
            id="fssaiImageInput"
            label="FSSAI certificate image"
            file={step3.fssaiImage}
            onFileChange={(f) => setStep3({ ...step3, fssaiImage: f })}
          />
        </section>

        <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
          <h2 className="text-lg font-semibold text-black">Bank account details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-700">Account number (optional)</Label>
              <Input
                inputMode="numeric"
                value={step3.accountNumber || ""}
                onChange={(e) => {
                  // Digits only
                  const val = e.target.value.replace(/\D/g, "")
                  setStep3({ ...step3, accountNumber: val })
                }}
                className="bg-white text-sm"
                placeholder="Account number"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700">Re-enter account number (optional)</Label>
              <Input
                inputMode="numeric"
                value={step3.confirmAccountNumber || ""}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "")
                  setStep3({ ...step3, confirmAccountNumber: val })
                }}
                className="bg-white text-sm"
                placeholder="Confirm account number"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-700">IFSC code (optional)</Label>
              <Input
                value={step3.ifscCode || ""}
                onChange={(e) => {
                  // Uppercase, allow only A-Z and 0-9, max 11 chars
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11)
                  setStep3({ ...step3, ifscCode: val })
                }}
                className="bg-white text-sm"
                placeholder="HDFC0001234"
                maxLength={11}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700">Account type (optional)</Label>
              <Select
                value={step3.accountType || ""}
                onValueChange={(val) => setStep3({ ...step3, accountType: val })}
              >
                <SelectTrigger className="bg-white text-sm h-9">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="savings">Savings</SelectItem>
                  <SelectItem value="current">Current</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-700">Account holder name (optional)</Label>
            <Input
              value={step3.accountHolderName || ""}
              onChange={(e) => {
                // Allow only letters, spaces, hyphens
                const val = e.target.value.replace(/[^A-Za-z\s-]/g, "")
                setStep3({ ...step3, accountHolderName: val })
              }}
              className="bg-white text-sm"
              placeholder="Account holder name"
            />
          </div>
        </section>
      </div>
    )
  }


  const renderStep4 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant Display Information</h2>
        <p className="text-sm text-gray-600">
          Add information that will be displayed to customers on the home page
        </p>

        <div>
          <Label className="text-xs text-gray-700">Estimated Delivery Time (optional)</Label>
          <Input
            value={step4.estimatedDeliveryTime || ""}
            onChange={(e) => setStep4({ ...step4, estimatedDeliveryTime: e.target.value })}
            className="mt-1 bg-white text-sm"
            placeholder="e.g., 25-30 mins"
          />
        </div>

        <div>
          <Label className="text-xs text-gray-700">Featured Dish Name (optional)</Label>
          <Input
            value={step4.featuredDish || ""}
            onChange={(e) => setStep4({ ...step4, featuredDish: e.target.value })}
            className="mt-1 bg-white text-sm"
            placeholder="e.g., Butter Chicken Special"
          />
        </div>

        <div>
          <Label className="text-xs text-gray-700">Featured Dish Price (Rs) (optional)</Label>
          <Input
            type="number"
            value={step4.featuredPrice || ""}
            onChange={(e) => setStep4({ ...step4, featuredPrice: e.target.value })}
            className="mt-1 bg-white text-sm"
            placeholder="e.g., 249"
            min="0"
          />
        </div>

        <div>
          <Label className="text-xs text-gray-700">Special Offer/Promotion (optional)</Label>
          <Input
            value={step4.offer || ""}
            onChange={(e) => setStep4({ ...step4, offer: e.target.value })}
            className="mt-1 bg-white text-sm"
            placeholder="e.g., Flat Rs50 OFF above Rs199"
          />
        </div>
      </section>
    </div>
  )

  const renderStep = () => {
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    if (step === 3) return renderStep3()
    return renderStep4()
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <header className="px-4 py-4 sm:px-6 sm:py-5 bg-white flex items-center justify-between">
          <div className="text-sm font-semibold text-black">Restaurant onboarding</div>
          <div className="flex items-center gap-3">
            {import.meta.env.DEV && (
              <Button
                onClick={fillDummyData}
                variant="outline"
                size="sm"
                className="text-xs bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100 flex items-center gap-1.5"
                title="Fill with dummy data (Dev only)"
              >
                <Sparkles className="w-3 h-3" />
                Fill Dummy
              </Button>
            )}
            <div className="text-xs text-gray-600">
              Step {step} of 4
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-4 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : (
            renderStep()
          )}
        </main>

        {error && (
          <div className="px-4 sm:px-6 pb-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <footer className="px-4 sm:px-6 py-3 bg-white">
          <div className="flex justify-between items-center">
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setShowBackPopup(true)}
              className="text-sm text-gray-700 bg-transparent"
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={saving}
              className="text-sm bg-black text-white px-6"
            >
              {step === 4 ? (saving ? "Saving..." : "Finish") : saving ? "Saving..." : "Continue"}
            </Button>
          </div>
        </footer>

        {/* Confirmation Popup */}
        {showBackPopup && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-scale-95 duration-300">
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ArrowLeft className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Abandon Signup?</h3>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to go back without completing the signup process? Your progress will be cleared.
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setShowBackPopup(false)}
                    className="w-full py-3.5 bg-black text-white font-bold rounded-xl hover:bg-gray-900 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Continue Signup
                  </button>
                  <button
                    onClick={() => {
                      clearRestaurantSignupSession()
                      navigate("/restaurant/login", { replace: true })
                    }}
                    className="w-full py-3.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </LocalizationProvider>
  )
}




