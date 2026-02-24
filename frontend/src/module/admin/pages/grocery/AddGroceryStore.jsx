import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Building2, Info, Tag, Upload, Calendar, FileText, MapPin, CheckCircle2, X, Image as ImageIcon, Clock, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { adminAPI, uploadAPI } from "@/lib/api"
import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey"
import { Loader } from "@googlemaps/js-api-loader"
import { toast } from "sonner"

const normalizeRawCoordinates = (coords = []) =>
  coords
    .map((coord) => {
      if (Array.isArray(coord) && coord.length >= 2) {
        return { lat: Number(coord[1]), lng: Number(coord[0]) }
      }
      return {
        lat: Number(coord?.latitude ?? coord?.lat),
        lng: Number(coord?.longitude ?? coord?.lng),
      }
    })
    .filter((coord) => Number.isFinite(coord.lat) && Number.isFinite(coord.lng))

const getBoundsArea = (path) => {
  if (!Array.isArray(path) || path.length < 3) return Number.POSITIVE_INFINITY
  const lats = path.map((p) => p.lat)
  const lngs = path.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latSpan = Math.max(0, maxLat - minLat)
  const lngSpan = Math.max(0, maxLng - minLng)
  return latSpan * lngSpan
}

const normalizeZonePath = (zone) => {
  const coordinatesPath = normalizeRawCoordinates(Array.isArray(zone?.coordinates) ? zone.coordinates : [])
  const boundaryCoords = zone?.boundary?.coordinates?.[0] || []
  const boundaryPath = normalizeRawCoordinates(boundaryCoords)
  const candidates = [coordinatesPath, boundaryPath].filter((path) => path.length >= 3)
  if (!candidates.length) return []
  candidates.sort((a, b) => getBoundsArea(a) - getBoundsArea(b))
  return candidates[0]
}

const parseAddressComponents = (components = []) => {
  const byType = (type) => components.find((c) => c.types?.includes(type))
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
  const pincode = byType("postal_code")?.long_name || ""
  const landmark = byType("point_of_interest")?.long_name || ""

  return {
    addressLine1: [streetNumber, route].filter(Boolean).join(" ").trim(),
    area: sublocality || city,
    city,
    state,
    pincode,
    landmark,
  }
}

export default function AddGroceryStore() {
  const navigate = useNavigate()
  const mapRef = useRef(null)
  const autocompleteInputRef = useRef(null)
  const autocompleteRef = useRef(null)
  const geocoderRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const mapMarkerRef = useRef(null)
  const zonePolygonRef = useRef(null)
  const selectedZonePathRef = useRef([])
  const zonesRef = useRef([])
  const selectedZoneIdRef = useRef("")
  const lastValidPointRef = useRef(null)

  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [selectedZoneId, setSelectedZoneId] = useState("")
  const [mapReady, setMapReady] = useState(false)
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState("")
  const [locationSearch, setLocationSearch] = useState("")
  
  // Step 1: Basic Info
  const [step1, setStep1] = useState({
    name: "",
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
      pincode: "",
      landmark: "",
      latitude: null,
      longitude: null,
      coordinates: [],
    },
  })

  // Step 2: Images & Operational
  const [step2, setStep2] = useState({
    profileImage: null,
    cuisines: [], // We'll keep this as 'categories' for consistency in schema
    openingTime: "09:00",
    closingTime: "22:00",
    openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  })

  // Auth
  const [auth, setAuth] = useState({
    email: "",
    phone: "",
    signupMethod: "email",
  })

  const selectedZone = useMemo(
    () => zones.find((zone) => (zone._id || zone.id) === selectedZoneId) || null,
    [zones, selectedZoneId]
  )

  const selectedZonePath = useMemo(() => {
    return normalizeZonePath(selectedZone)
  }, [selectedZone])
  const hasPinnedLocation = Number.isFinite(step1.location?.latitude) && Number.isFinite(step1.location?.longitude)

  useEffect(() => {
    selectedZonePathRef.current = selectedZonePath
  }, [selectedZonePath])

  useEffect(() => {
    zonesRef.current = zones
  }, [zones])

  useEffect(() => {
    selectedZoneIdRef.current = selectedZoneId
  }, [selectedZoneId])

  useEffect(() => {
    fetchZones()
    loadGoogleMap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google?.maps) return
    drawSelectedZone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, selectedZonePath, selectedZoneId])

  useEffect(() => {
    if (!window.google?.maps?.places || !autocompleteInputRef.current || autocompleteRef.current) return
    const autocomplete = new window.google.maps.places.Autocomplete(autocompleteInputRef.current, {
      types: ["geocode", "establishment"],
    })
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace()
      if (!place?.geometry?.location) return
      const lat = place.geometry.location.lat()
      const lng = place.geometry.location.lng()
      const zoneId = resolveZoneIdForPoint(lat, lng)
      if (!zoneId) {
        toast.error("Selected place is outside all saved zones")
        return
      }
      if (zoneId !== selectedZoneId) {
        setSelectedZoneId(zoneId)
      }
      setStoreCoordinates(lat, lng)
      if (place.address_components?.length) {
        applyAddressFromComponents(place.address_components, place.formatted_address || "")
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo({ lat, lng })
        mapInstanceRef.current.setZoom(17)
      }
    })
    autocompleteRef.current = autocomplete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZoneId])

  const fetchZones = async () => {
    try {
      setZonesLoading(true)
      const response = await adminAPI.getZones({ platform: "mogrocery", limit: 1000 })
      const fetchedZones = response?.data?.data?.zones || []
      const validZones = fetchedZones.filter((zone) => normalizeZonePath(zone).length >= 3)
      setZones(validZones)
      if (validZones.length > 0) {
        setSelectedZoneId(validZones[0]._id || validZones[0].id)
      }
    } catch (error) {
      console.error("Failed to fetch zones:", error)
      toast.error("Failed to load zones")
    } finally {
      setZonesLoading(false)
    }
  }

  const loadGoogleMap = async () => {
    try {
      let googleLib = window.google

      // Wait briefly in case Google Maps script is still booting from app-level loader.
      let retries = 0
      while (!googleLib?.maps && retries < 40) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        googleLib = window.google
        retries += 1
      }

      if (!googleLib?.maps) {
        const apiKey = await getGoogleMapsApiKey()
        if (!apiKey) {
          setMapError("Google Maps API key is missing. Set it in Admin > System > Environment Variables.")
          setMapLoading(false)
          return
        }
        const loader = new Loader({
          apiKey,
          version: "weekly",
          libraries: ["geometry", "places"],
        })
        googleLib = await Promise.race([
          loader.load(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Google Maps load timeout")), 12000)),
        ])
      }
      initializeMap(googleLib)
    } catch (error) {
      console.error("Failed to load Google Maps:", error)
      setMapError("Failed to load map. Please refresh and try again.")
      setMapLoading(false)
    }
  }

  const initializeMap = (googleLib) => {
    if (!mapRef.current) {
      setMapLoading(false)
      return
    }

    const initialCenter = { lat: 20.5937, lng: 78.9629 }
    const map = new googleLib.maps.Map(mapRef.current, {
      center: initialCenter,
      zoom: 5,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      draggableCursor: "grab",
      draggingCursor: "grabbing",
    })
    mapInstanceRef.current = map
    geocoderRef.current = new googleLib.maps.Geocoder()

    map.addListener("click", (event) => {
      const lat = event?.latLng?.lat?.()
      const lng = event?.latLng?.lng?.()
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

      const zoneId = resolveZoneIdForPoint(lat, lng)
      if (zoneId && zoneId !== selectedZoneId) {
        setSelectedZoneId(zoneId)
      }
      setStoreCoordinates(lat, lng)
    })

    setMapReady(true)
    setMapLoading(false)
  }

  const drawSelectedZone = () => {
    const googleLib = window.google
    const map = mapInstanceRef.current
    if (!googleLib?.maps || !map) return

    if (zonePolygonRef.current) {
      zonePolygonRef.current.setMap(null)
      zonePolygonRef.current = null
    }

    if (!selectedZonePath.length) return

    zonePolygonRef.current = new googleLib.maps.Polygon({
      paths: selectedZonePath,
      strokeColor: "#2563eb",
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: "#3b82f6",
      fillOpacity: 0.2,
      clickable: false,
      map,
    })

    const bounds = new googleLib.maps.LatLngBounds()
    selectedZonePath.forEach((coord) => bounds.extend(coord))
    map.fitBounds(bounds)
    map.setOptions({ draggableCursor: "grab", draggingCursor: "grabbing" })

    // If marker exists but is outside the newly selected zone, clear it.
    if (hasPinnedLocation && !isPointInsidePolygon(step1.location.latitude, step1.location.longitude, selectedZonePath)) {
      if (mapMarkerRef.current) {
        mapMarkerRef.current.setMap(null)
        mapMarkerRef.current = null
      }
      lastValidPointRef.current = null
      setStep1((prev) => ({
        ...prev,
        location: {
          ...prev.location,
          latitude: null,
          longitude: null,
          coordinates: [],
        },
      }))
      toast.error("Pinned location was outside this zone and has been cleared")
    }
  }

  const isPointInsidePolygon = (lat, lng, polygonCoords) => {
    let inside = false
    for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
      const xi = polygonCoords[i].lng
      const yi = polygonCoords[i].lat
      const xj = polygonCoords[j].lng
      const yj = polygonCoords[j].lat

      const intersect = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }

  const resolveZoneIdForPoint = (lat, lng) => {
    const matched = zonesRef.current.find((zone) => {
      const path = normalizeZonePath(zone)
      return path.length >= 3 && isPointInsidePolygon(lat, lng, path)
    })
    if (matched) return matched._id || matched.id
    return null
  }

  const setStoreCoordinates = (lat, lng) => {
    const googleLib = window.google
    const map = mapInstanceRef.current
    if (!googleLib?.maps || !map) return

    const normalizedLat = Number(lat.toFixed(6))
    const normalizedLng = Number(lng.toFixed(6))

    if (!mapMarkerRef.current) {
      mapMarkerRef.current = new googleLib.maps.Marker({
        map,
        draggable: true,
        position: { lat: normalizedLat, lng: normalizedLng },
        title: "Store Location",
      })
      mapMarkerRef.current.addListener("dragend", (event) => {
        const dragLat = event?.latLng?.lat?.()
        const dragLng = event?.latLng?.lng?.()
        if (!Number.isFinite(dragLat) || !Number.isFinite(dragLng)) return
        const matchedZoneId = resolveZoneIdForPoint(dragLat, dragLng)
        if (matchedZoneId) {
          setSelectedZoneId(matchedZoneId)
        }
        setStoreCoordinates(dragLat, dragLng)
      })
    } else {
      mapMarkerRef.current.setPosition({ lat: normalizedLat, lng: normalizedLng })
    }

    lastValidPointRef.current = { lat: normalizedLat, lng: normalizedLng }
    map.panTo({ lat: normalizedLat, lng: normalizedLng })

    setStep1((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        latitude: normalizedLat,
        longitude: normalizedLng,
        coordinates: [normalizedLng, normalizedLat],
      },
    }))
    reverseGeocodeLocation(normalizedLat, normalizedLng)
  }

  const applyAddressFromComponents = (components, formattedAddress = "") => {
    const parsed = parseAddressComponents(components)
    setStep1((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        addressLine1: parsed.addressLine1 || prev.location.addressLine1 || "",
        area: parsed.area || prev.location.area || "",
        city: parsed.city || prev.location.city || "",
        state: parsed.state || prev.location.state || "",
        pincode: parsed.pincode || prev.location.pincode || "",
        landmark: parsed.landmark || prev.location.landmark || "",
        address: formattedAddress || prev.location.address || "",
        formattedAddress: formattedAddress || prev.location.formattedAddress || "",
      },
    }))
    if (formattedAddress) {
      setLocationSearch(formattedAddress)
    }
  }

  const reverseGeocodeLocation = (lat, lng) => {
    const geocoder = geocoderRef.current
    if (!geocoder) return
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== "OK" || !Array.isArray(results) || !results.length) return
      const best = results[0]
      applyAddressFromComponents(best.address_components || [], best.formatted_address || "")
    })
  }

  const pinToZoneCenter = () => {
    if (!selectedZonePath.length) {
      toast.error("Select a zone first")
      return
    }
    const total = selectedZonePath.reduce(
      (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
      { lat: 0, lng: 0 }
    )
    const centerLat = total.lat / selectedZonePath.length
    const centerLng = total.lng / selectedZonePath.length
    setStoreCoordinates(centerLat, centerLng)
  }

  const pinToMapCenter = () => {
    const map = mapInstanceRef.current
    if (!map) return
    const center = map.getCenter?.()
    const lat = center?.lat?.()
    const lng = center?.lng?.()
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    setStoreCoordinates(lat, lng)
  }

  const handleUpload = async (file, folder) => {
    try {
      const res = await uploadAPI.uploadMedia(file, { folder })
      const d = res?.data?.data || res?.data
      return { url: d.url, publicId: d.publicId }
    } catch (err) {
      throw new Error(`Upload failed: ${err.message}`)
    }
  }

  const validateStep1 = () => {
    const errors = []
    if (!step1.name?.trim()) errors.push("Store name is required")
    if (!step1.ownerName?.trim()) errors.push("Owner name is required")
    if (!step1.ownerEmail?.trim()) errors.push("Owner email is required")
    if (!step1.ownerPhone?.trim()) errors.push("Owner phone is required")
    if (!step1.location?.area?.trim()) errors.push("Area is required from map")
    if (!step1.location?.city?.trim()) errors.push("City is required from map")
    if (!Number.isFinite(step1.location?.latitude) || !Number.isFinite(step1.location?.longitude)) {
      errors.push("Please set store location on the map")
    }
    return errors
  }

  const handleNext = () => {
    let validationErrors = []
    
    if (step === 1) validationErrors = validateStep1()
    
    if (validationErrors.length > 0) {
      validationErrors.forEach(err => toast.error(err))
      return
    }
    
    if (step < 4) {
      setStep(step + 1)
    } else {
      handleSubmit()
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      // Simplistic upload for demo purposes - in real use, we'd upload all
      let profileImageData = null
      if (step2.profileImage instanceof File) {
        profileImageData = await handleUpload(step2.profileImage, "appzeto/grocery/profile")
      }

      const payload = {
        name: step1.name,
        restaurantName: step1.name, // Keep for backward compatibility if backend expects it
        ownerName: step1.ownerName,
        ownerEmail: step1.ownerEmail,
        ownerPhone: step1.ownerPhone,
        primaryContactNumber: step1.primaryContactNumber,
        location: step1.location,
        zoneId: selectedZoneId,
        profileImage: profileImageData,
        cuisines: step2.cuisines,
        openingTime: step2.openingTime,
        closingTime: step2.closingTime,
        openDays: step2.openDays,
        // Auth
        email: auth.email || null,
        phone: auth.phone || null,
        signupMethod: auth.email ? 'email' : 'phone',
      }

      const response = await adminAPI.createGroceryStore(payload)
      
      if (response.data.success) {
        toast.success("Store created successfully!")
        setShowSuccessDialog(true)
        setTimeout(() => navigate("/admin/grocery-stores"), 2000)
      }
    } catch (error) {
      toast.error(error.message || "Failed to create store")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="px-6 py-4 bg-white flex items-center justify-between border-b">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-blue-600" />
          <h1 className="font-semibold">Add New Grocery Store</h1>
        </div>
        <div className="text-xs text-slate-500">Step {step} of 4</div>
      </header>

      <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
        {step === 1 && (
          <div className="space-y-6">
            <section className="bg-white p-6 rounded-xl shadow-sm space-y-4">
              <h2 className="font-semibold">Store Information</h2>
              <div className="space-y-4">
                <div>
                  <Label>Store Name*</Label>
                  <Input value={step1.name} onChange={e => setStep1({...step1, name: e.target.value})} placeholder="Main Grocery Store" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Owner Name*</Label>
                    <Input value={step1.ownerName} onChange={e => setStep1({...step1, ownerName: e.target.value})} />
                  </div>
                  <div>
                    <Label>Owner Email*</Label>
                    <Input type="email" value={step1.ownerEmail} onChange={e => setStep1({...step1, ownerEmail: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Owner Phone*</Label>
                    <Input
                      type="tel"
                      value={step1.ownerPhone}
                      onChange={e => setStep1({...step1, ownerPhone: e.target.value})}
                      placeholder="Owner phone number"
                    />
                  </div>
                  <div>
                    <Label>Primary Contact Number</Label>
                    <Input
                      type="tel"
                      value={step1.primaryContactNumber}
                      onChange={e => setStep1({...step1, primaryContactNumber: e.target.value})}
                      placeholder="Store contact number"
                    />
                  </div>
                </div>
              </div>
            </section>
            <section className="bg-white p-6 rounded-xl shadow-sm space-y-4">
              <h2 className="font-semibold">Location</h2>
              <div className="space-y-2">
                <Label>Delivery Zone*</Label>
                <select
                  value={selectedZoneId}
                  onChange={(e) => {
                    const zoneId = e.target.value
                    setSelectedZoneId(zoneId)
                  }}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={zonesLoading}
                >
                  {zones.length === 0 && <option value="">{zonesLoading ? "Loading zones..." : "No zones found"}</option>}
                  {zones.map((zone) => (
                    <option key={zone._id || zone.id} value={zone._id || zone.id}>
                      {zone.name || zone.zoneName || "Unnamed zone"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input value={step1.location.area || ""} readOnly placeholder="Area (auto from map)*" />
                <Input value={step1.location.city || ""} readOnly placeholder="City (auto from map)*" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input value={step1.location.state || ""} readOnly placeholder="State (auto from map)" />
                <Input value={step1.location.pincode || ""} readOnly placeholder="Pincode (auto from map)" />
              </div>
              <div className="space-y-2">
                <Label>Search place in selected zone</Label>
                <Input
                  ref={autocompleteInputRef}
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  placeholder="Search address/place and pick from Google suggestions"
                />
              </div>
              <div className="space-y-2">
                <Label>Store pin in selected zone*</Label>
                <div className="h-72 rounded-lg border overflow-hidden bg-slate-50">
                  <div ref={mapRef} className="w-full h-full" />
                </div>
                {mapLoading && <p className="text-xs text-slate-500">Loading map...</p>}
                {mapError && <p className="text-xs text-red-600">{mapError}</p>}
                <div className="pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={pinToMapCenter}
                      disabled={!!mapError}
                    >
                      Set Pin At Map Center
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={pinToZoneCenter}
                      disabled={!selectedZonePath.length || !!mapError}
                    >
                      Use Zone Center as Store Pin
                    </Button>
                  </div>
                </div>
                {!mapError && Number.isFinite(step1.location?.latitude) && Number.isFinite(step1.location?.longitude) && (
                  <p className="text-xs text-slate-600">
                    Selected: {step1.location.latitude}, {step1.location.longitude}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  OLA-style: drag the map so your target is at center, then tap "Set Pin At Map Center". You can also click map or drag marker.
                </p>
              </div>
            </section>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
             <section className="bg-white p-6 rounded-xl shadow-sm space-y-4">
              <h2 className="font-semibold">Operational Details</h2>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border">
                  {step2.profileImage ? <img src={URL.createObjectURL(step2.profileImage)} className="w-full h-full object-cover" /> : <ImageIcon className="text-slate-400" />}
                </div>
                <label className="bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer text-sm">
                  Upload logo
                  <input type="file" className="hidden" onChange={e => setStep2({...step2, profileImage: e.target.files[0]})} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div><Label>Opening Time</Label><Input type="time" value={step2.openingTime} onChange={e => setStep2({...step2, openingTime: e.target.value})} /></div>
                <div><Label>Closing Time</Label><Input type="time" value={step2.closingTime} onChange={e => setStep2({...step2, closingTime: e.target.value})} /></div>
              </div>
            </section>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <section className="bg-white p-6 rounded-xl shadow-sm space-y-4">
              <h2 className="font-semibold">Authentication</h2>
              <div className="space-y-4">
                <div><Label>Login Email*</Label><Input type="email" value={auth.email} onChange={e => setAuth({...auth, email: e.target.value})} /></div>
                <div><Label>Login Phone</Label><Input type="tel" value={auth.phone} onChange={e => setAuth({...auth, phone: e.target.value})} /></div>
              </div>
            </section>
          </div>
        )}

        {step === 4 && (
          <div className="bg-white p-10 rounded-xl shadow-sm border text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">Ready to Launch!</h2>
            <p className="text-slate-500">Please review all information before creating the store.</p>
          </div>
        )}
      </main>

      <footer className="p-6 bg-white border-t">
        <div className="max-w-4xl mx-auto flex justify-between">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep(step - 1)}>Back</Button>
          <Button onClick={handleNext} disabled={isSubmitting}>
            {step === 4 ? (isSubmitting ? "Creating..." : "Create Store") : "Continue"}
          </Button>
        </div>
      </footer>

      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Store Created Successfully!</DialogTitle>
            <DialogDescription>Redirecting to stores list...</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  )
}
