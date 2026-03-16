import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Image as ImageIcon, MapPin, Phone, Store, Upload, User, X, ArrowLeft, Search, Loader2, Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { uploadAPI, groceryStoreAPI } from "@/lib/api"
import { toast } from "sonner"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { clearStoreSignupSession } from "@/lib/utils/auth"
import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey"
import { Loader } from "@googlemaps/js-api-loader"

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

const createInitialForm = () => ({
  storeName: "",
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

const sanitizeInputByField = (field, value) => {
  const raw = String(value ?? "")
  switch (field) {
    case "storeName":
      return raw.replace(/[^a-zA-Z0-9 &-]/g, "").slice(0, 100)
    case "ownerName":
      return raw.replace(/[^a-zA-Z\s]/g, "").slice(0, 60)
    case "ownerEmail":
      return raw.replace(/\s+/g, "").replace(/[^a-zA-Z0-9@._+-]/g, "").slice(0, 120)
    case "ownerPhone":
    case "primaryContactNumber":
      return raw.replace(/\D/g, "").slice(0, 10)
    case "addressLine1":
      return raw.replace(/[^a-zA-Z0-9\s,./#-]/g, "").slice(0, 150)
    case "addressLine2":
      return raw.replace(/[^a-zA-Z0-9\s,./#-]/g, "").slice(0, 150)
    case "area":
    case "city":
    case "state":
      return raw.replace(/[^a-zA-Z\s]/g, "").slice(0, 80)
    case "zipCode":
      return raw.replace(/\D/g, "").slice(0, 6)
    case "landmark":
      return raw.replace(/[^a-zA-Z0-9\s,./#-]/g, "").slice(0, 120)
    default:
      return raw
  }
}

export default function GroceryStoreOnboarding() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const isFreshStepOne = searchParams.get("step") === "1"
  const isEditing = searchParams.get("edit") === "true"
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [showBackPopup, setShowBackPopup] = useState(false)
  const [form, setForm] = useState(createInitialForm)
  const [fieldErrors, setFieldErrors] = useState({})

  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const autocompleteInputRef = useRef(null)
  const autocompleteRef = useRef(null)
  const storeImageCameraInputRef = useRef(null)
  const storeImageGalleryInputRef = useRef(null)
  const additionalImagesCameraInputRef = useRef(null)
  const additionalImagesGalleryInputRef = useRef(null)
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState("")
  const [locationSearch, setLocationSearch] = useState("")
  const [detectingLocation, setDetectingLocation] = useState(false)
  const hasResolvedInitialMapCenterRef = useRef(false)

  const [images, setImages] = useState({
    storeImage: null,
    additionalImages: [],
  })

  const updateSelectedLocation = (lat, lng, address, components = []) => {
    const parsedAddress = parseAddressComponents(components)
    const normalizedLat = Number(Number(lat).toFixed(6))
    const normalizedLng = Number(Number(lng).toFixed(6))
    const resolvedAddress = String(address || "").trim() || `${normalizedLat}, ${normalizedLng}`

    setLocationSearch(resolvedAddress)
    setForm((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        addressLine1: parsedAddress.addressLine1 || prev.location.addressLine1 || "",
        addressLine2: parsedAddress.addressLine2 || prev.location.addressLine2 || "",
        area: parsedAddress.area || prev.location.area || "",
        city: parsedAddress.city || prev.location.city || "",
        state: parsedAddress.state || prev.location.state || "",
        landmark: parsedAddress.landmark || prev.location.landmark || "",
        zipCode: parsedAddress.zipCode || prev.location.zipCode || "",
        formattedAddress: resolvedAddress,
        address: resolvedAddress,
        latitude: normalizedLat,
        longitude: normalizedLng,
        coordinates: [normalizedLng, normalizedLat],
      },
    }))

    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: normalizedLat, lng: normalizedLng })
      if (mapInstanceRef.current.getZoom() < 16) {
        mapInstanceRef.current.setZoom(16)
      }
    }

    if (!window.google?.maps || !mapInstanceRef.current) return

    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        draggable: true,
        animation: window.google.maps.Animation.DROP,
      })

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

    markerRef.current.setPosition({ lat: normalizedLat, lng: normalizedLng })
    markerRef.current.setTitle(resolvedAddress)
  }

  const initializeMap = (google) => {
    if (!mapRef.current) return

    const initialLat = Number(form.location.latitude)
    const initialLng = Number(form.location.longitude)
    const center =
      Number.isFinite(initialLat) && Number.isFinite(initialLng)
        ? { lat: initialLat, lng: initialLng }
        : { lat: 20.5937, lng: 78.9629 }

    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: Number.isFinite(initialLat) && Number.isFinite(initialLng) ? 16 : 5,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      gestureHandling: "greedy",
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

    if (autocompleteInputRef.current && google.maps.places && !autocompleteRef.current) {
      const autocomplete = new google.maps.places.Autocomplete(autocompleteInputRef.current, {
        types: ["geocode", "establishment"],
        componentRestrictions: { country: "in" },
      })

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace()
        if (!place?.geometry?.location) return
        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        updateSelectedLocation(lat, lng, place.formatted_address || place.name || "", place.address_components || [])
      })

      autocompleteRef.current = autocomplete
    }

    if (Number.isFinite(initialLat) && Number.isFinite(initialLng)) {
      updateSelectedLocation(
        initialLat,
        initialLng,
        form.location.formattedAddress || form.location.address || `${initialLat}, ${initialLng}`
      )
    }

    setMapLoading(false)
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
    const markerPosition = markerRef.current?.getPosition?.()
    const mapCenter = mapInstanceRef.current?.getCenter?.()

    const lat = Number(
      markerPosition?.lat?.() ??
      mapCenter?.lat?.() ??
      form.location.latitude
    )
    const lng = Number(
      markerPosition?.lng?.() ??
      mapCenter?.lng?.() ??
      form.location.longitude
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

  useEffect(() => {
    let cancelled = false

    const loadMap = async () => {
      try {
        setMapLoading(true)
        setMapError("")

        let googleLib = window.google
        if (!googleLib?.maps) {
          const apiKey = await getGoogleMapsApiKey()
          if (!apiKey) {
            throw new Error("Google Maps API key is missing")
          }

          const loader = new Loader({
            apiKey,
            version: "weekly",
            libraries: ["places"],
          })
          googleLib = await loader.load()
        }

        if (!cancelled) {
          initializeMap(googleLib)
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
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      if (isFreshStepOne) {
        setForm(createInitialForm())
        setImages({
          storeImage: null,
          additionalImages: [],
        })
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const res = await groceryStoreAPI.getOnboarding()
        const data = res?.data?.data?.onboarding
        const store = res?.data?.data?.store

        if (data?.step1 || store) {
          const source = data?.step1 || {}
          setForm({
            storeName: source.storeName || store?.name || "",
            ownerName: source.ownerName || store?.ownerName || "",
            ownerEmail: source.ownerEmail || store?.ownerEmail || "",
            ownerPhone: source.ownerPhone || store?.ownerPhone || store?.phone || "",
            primaryContactNumber:
              source.primaryContactNumber || store?.primaryContactNumber || store?.phone || "",
            location: {
              addressLine1: source.location?.addressLine1 || store?.location?.addressLine1 || "",
              addressLine2: source.location?.addressLine2 || store?.location?.addressLine2 || "",
              area: source.location?.area || store?.location?.area || "",
              city: source.location?.city || store?.location?.city || "",
              state: source.location?.state || store?.location?.state || "",
              landmark: source.location?.landmark || store?.location?.landmark || "",
              zipCode:
                source.location?.zipCode ||
                store?.location?.zipCode ||
                store?.location?.postalCode ||
                store?.location?.pincode ||
                "",
              formattedAddress:
                source.location?.formattedAddress ||
                store?.location?.formattedAddress ||
                "",
              address:
                source.location?.address ||
                store?.location?.address ||
                "",
              latitude:
                source.location?.latitude ??
                store?.location?.latitude ??
                "",
              longitude:
                source.location?.longitude ??
                store?.location?.longitude ??
                "",
              coordinates:
                source.location?.coordinates ||
                store?.location?.coordinates ||
                [],
            },
          })
          setLocationSearch(
            source.location?.formattedAddress ||
            store?.location?.formattedAddress ||
            source.location?.address ||
            store?.location?.address ||
            ""
          )
        }

        if (data?.storeImage || store?.profileImage) {
          setImages((prev) => ({ ...prev, storeImage: data?.storeImage || store?.profileImage }))
        }
        if (Array.isArray(data?.additionalImages) && data.additionalImages.length > 0) {
          setImages((prev) => ({ ...prev, additionalImages: data.additionalImages }))
        } else if (Array.isArray(store?.menuImages) && store.menuImages.length > 0) {
          setImages((prev) => ({ ...prev, additionalImages: store.menuImages }))
        }
      } catch (err) {
        console.error("Error fetching onboarding data:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [isFreshStepOne])

  const validateImage = (file) => {
    if (!file) return "No file selected";

    const validFormats = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!validFormats.includes(file.type)) {
      return "Only JPG, JPEG, PNG, or WEBP formats are allowed";
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      return "Maximum file size is 2MB";
    }

    return "";
  };

  useEffect(() => {
    if (!mapInstanceRef.current) return

    const lat = Number(form.location.latitude)
    const lng = Number(form.location.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    updateSelectedLocation(
      lat,
      lng,
      form.location.formattedAddress || form.location.address || `${lat}, ${lng}`
    )
  }, [form.location.latitude, form.location.longitude, form.location.formattedAddress, form.location.address])

  useEffect(() => {
    if (!mapInstanceRef.current || hasResolvedInitialMapCenterRef.current) return

    const existingLat = Number(form.location.latitude)
    const existingLng = Number(form.location.longitude)
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
  }, [form.location.latitude, form.location.longitude])

  const handleUpload = async (file, folder) => {
    try {
      const res = await uploadAPI.uploadMedia(file, { folder })
      const d = res?.data?.data || res?.data
      return { url: d.url, publicId: d.publicId }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  const handleStoreImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const imageError = validateImage(file);
    if (imageError) {
      toast.error(imageError);
      e.target.value = "";
      return;
    }

    try {
      setSaving(true)
      const uploaded = await handleUpload(file, "mobasket/grocery-store/store")
      setImages((prev) => ({ ...prev, storeImage: uploaded }))
      toast.success("Store image uploaded successfully")
    } catch (err) {
      toast.error(err.message || "Failed to upload image")
    } finally {
      setSaving(false)
      e.target.value = ""
    }
  }

  const handleAdditionalImageChange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    for (const file of files) {
      const imageError = validateImage(file);
      if (imageError) {
        toast.error(imageError);
        e.target.value = "";
        return;
      }
    }

    try {
      setSaving(true)
      const uploads = []
      for (const file of files) {
        uploads.push(await handleUpload(file, "mobasket/grocery-store/additional"))
      }
      setImages((prev) => ({
        ...prev,
        additionalImages: [...prev.additionalImages, ...uploads],
      }))
      toast.success(`${uploads.length} image(s) uploaded successfully`)
    } catch (err) {
      toast.error(err.message || "Failed to upload images")
    } finally {
      setSaving(false)
      e.target.value = ""
    }
  }

  const uploadCapturedImage = async (base64Data, filename, mimeType, folder) => {
    const cleanBase64 = String(base64Data || "").replace(/^data:[^;]+;base64,/, "")
    const byteCharacters = atob(cleanBase64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i += 1) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const file = new File([byteArray], filename, { type: mimeType || "image/jpeg" })
    return handleUpload(file, folder)
  }

  const handleStoreImageCameraCapture = async () => {
    if (!window.flutter_inappwebview?.callHandler) {
      storeImageCameraInputRef.current?.click()
      return
    }

    try {
      setSaving(true)
      const result = await window.flutter_inappwebview.callHandler("openCamera")
      if (!result) {
        toast.error("Camera capture failed or cancelled")
        return
      }

      let uploaded = null
      if (result instanceof File) {
        uploaded = await handleUpload(result, "mobasket/grocery-store/store")
      } else if (result?.file instanceof File) {
        uploaded = await handleUpload(result.file, "mobasket/grocery-store/store")
      } else if (Array.isArray(result?.files) && result.files[0] instanceof File) {
        uploaded = await handleUpload(result.files[0], "mobasket/grocery-store/store")
      } else if (result?.base64) {
        uploaded = await uploadCapturedImage(
          result.base64,
          result.fileName || `store_${Date.now()}.jpg`,
          result.mimeType || "image/jpeg",
          "mobasket/grocery-store/store"
        )
      } else if (result?.success === false) {
        toast.error("Camera capture failed or cancelled")
        return
      }

      if (!uploaded) {
        toast.error("Camera capture failed or cancelled")
        return
      }

      setImages((prev) => ({ ...prev, storeImage: uploaded }))
      toast.success("Store image uploaded successfully")
    } catch (err) {
      toast.error(err?.message || "Failed to capture store image")
    } finally {
      setSaving(false)
    }
  }

  const handleStoreImageGalleryPick = async () => {
    if (!window.flutter_inappwebview?.callHandler) {
      storeImageGalleryInputRef.current?.click()
      return
    }

    try {
      setSaving(true)
      const result = await window.flutter_inappwebview.callHandler("openGallery")
      const files = normalizeGalleryResults(result)
      const first = files?.[0]

      if (!first) {
        storeImageGalleryInputRef.current?.click()
        return
      }

      let uploaded = null
      if (first instanceof File) {
        uploaded = await handleUpload(first, "mobasket/grocery-store/store")
      } else if (first?.file instanceof File) {
        uploaded = await handleUpload(first.file, "mobasket/grocery-store/store")
      } else if (first?.base64) {
        uploaded = await uploadCapturedImage(
          first.base64,
          first.fileName || `store_gallery_${Date.now()}.jpg`,
          first.mimeType || "image/jpeg",
          "mobasket/grocery-store/store"
        )
      }

      if (!uploaded) {
        storeImageGalleryInputRef.current?.click()
        return
      }

      setImages((prev) => ({ ...prev, storeImage: uploaded }))
      toast.success("Store image uploaded successfully")
    } catch {
      storeImageGalleryInputRef.current?.click()
    } finally {
      setSaving(false)
    }
  }

  const normalizeGalleryResults = (result) => {
    if (!result) return []
    if (result instanceof File) return [result]
    if (result?.file instanceof File) return [result.file]
    if (Array.isArray(result?.files)) return result.files
    if (Array.isArray(result)) return result
    if (result?.base64) return [result]
    return []
  }

  const handleAdditionalImagesGalleryPick = async () => {
    if (!window.flutter_inappwebview?.callHandler) {
      additionalImagesGalleryInputRef.current?.click()
      return
    }

    try {
      setSaving(true)
      const result = await window.flutter_inappwebview.callHandler("openGallery")
      const files = normalizeGalleryResults(result)
      if (!files.length) {
        additionalImagesGalleryInputRef.current?.click()
        return
      }

      const uploads = []
      for (const fileData of files) {
        if (fileData instanceof File) {
          uploads.push(await handleUpload(fileData, "mobasket/grocery-store/additional"))
          continue
        }
        if (fileData?.file instanceof File) {
          uploads.push(await handleUpload(fileData.file, "mobasket/grocery-store/additional"))
          continue
        }
        if (!fileData?.base64) continue
        const uploaded = await uploadCapturedImage(
          fileData.base64,
          fileData.fileName || `additional_gallery_${Date.now()}.jpg`,
          fileData.mimeType || "image/jpeg",
          "mobasket/grocery-store/additional"
        )
        uploads.push(uploaded)
      }

      if (uploads.length) {
        setImages((prev) => ({
          ...prev,
          additionalImages: [...prev.additionalImages, ...uploads],
        }))
        toast.success(`${uploads.length} image(s) uploaded successfully`)
      } else {
        additionalImagesGalleryInputRef.current?.click()
      }
    } catch {
      additionalImagesGalleryInputRef.current?.click()
    } finally {
      setSaving(false)
    }
  }

  const handleAdditionalImagesCameraCapture = async () => {
    if (!window.flutter_inappwebview?.callHandler) {
      additionalImagesCameraInputRef.current?.click()
      return
    }

    try {
      setSaving(true)
      const result = await window.flutter_inappwebview.callHandler("openCamera")
      if (!result) {
        toast.error("Camera capture failed or cancelled")
        return
      }

      let uploaded = null
      if (result instanceof File) {
        uploaded = await handleUpload(result, "mobasket/grocery-store/additional")
      } else if (result?.file instanceof File) {
        uploaded = await handleUpload(result.file, "mobasket/grocery-store/additional")
      } else if (Array.isArray(result?.files) && result.files[0] instanceof File) {
        uploaded = await handleUpload(result.files[0], "mobasket/grocery-store/additional")
      } else if (result?.base64) {
        uploaded = await uploadCapturedImage(
          result.base64,
          result.fileName || `additional_${Date.now()}.jpg`,
          result.mimeType || "image/jpeg",
          "mobasket/grocery-store/additional"
        )
      } else if (result?.success === false) {
        toast.error("Camera capture failed or cancelled")
        return
      }

      if (!uploaded) {
        toast.error("Camera capture failed or cancelled")
        return
      }

      setImages((prev) => ({
        ...prev,
        additionalImages: [...prev.additionalImages, uploaded],
      }))
      toast.success("Image uploaded successfully")
    } catch (err) {
      toast.error(err?.message || "Failed to capture additional image")
    } finally {
      setSaving(false)
    }
  }

  const validateFieldRealTime = (field, value) => {
    let error = "";
    const val = value ? value.trim() : "";

    switch (field) {
      case "storeName":
        if (!val) error = "Store name is required";
        else if (val.length < 3) error = "Minimum 3 characters required";
        else if (val.length > 100) error = "Maximum 100 characters allowed";
        else if (!/^[a-zA-Z0-9\s&-]+$/.test(val)) error = "Only letters, numbers, spaces, &, and - allowed";
        break;
      case "ownerName":
        if (!val) error = "Owner name is required";
        else if (val.length < 3) error = "Minimum 3 characters required";
        else if (val.length > 60) error = "Maximum 60 characters allowed";
        else if (!/^[a-zA-Z\s]+$/.test(val)) error = "Only alphabets and spaces allowed";
        break;
      case "ownerEmail": {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!val) error = "Owner email is required";
        else if (/\s/.test(val)) error = "No spaces allowed in email";
        else if (!emailRegex.test(val)) error = "Please enter a valid email";
        break;
      }
      case "ownerPhone":
      case "primaryContactNumber":
        if (!val) error = "Phone number is required";
        else if (!/^\d+$/.test(val)) error = "Only digits allowed";
        else if (val.length !== 10) error = "Must be exactly 10 digits";
        break;
      case "addressLine1":
        if (!val) error = "Address line 1 is required";
        else if (val.length < 5) error = "Minimum 5 characters required";
        else if (val.length > 150) error = "Maximum 150 characters allowed";
        break;
      case "addressLine2":
        if (val && val.length > 150) error = "Maximum 150 characters allowed";
        break;
      case "area":
      case "city":
      case "state":
        if (!val) error = `${field.charAt(0).toUpperCase() + field.slice(1)} is required`;
        else if (val.length < 2) error = "Minimum 2 characters required";
        else if (val.length > 80) error = "Maximum 80 characters allowed";
        else if (!/^[a-zA-Z\s]+$/.test(val)) error = "Only alphabets and spaces allowed";
        break;
      case "zipCode":
        if (!val) error = "ZIP / postal code is required";
        else if (!/^\d+$/.test(val)) error = "Only digits allowed";
        else if (val.length !== 6) error = "Must be exactly 6 digits";
        break;
      case "landmark":
        if (val && val.length > 120) error = "Maximum 120 characters allowed";
        break;
    }
    setFieldErrors(prev => ({ ...prev, [field]: error }));
  };

  const handleFieldChange = (field, value) => {
    const nextValue = sanitizeInputByField(field, value)

    setForm((prev) => ({ ...prev, [field]: nextValue }))
    validateFieldRealTime(field, nextValue);
  }

  const handleLocationChange = (field, value) => {
    const nextValue = sanitizeInputByField(field, value)

    setForm((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        [field]: nextValue,
      },
    }))
    validateFieldRealTime(field, nextValue);
  }

  const removeStoreImage = () => {
    setImages((prev) => ({ ...prev, storeImage: null }))
  }

  const removeAdditionalImage = (index) => {
    setImages((prev) => ({
      ...prev,
      additionalImages: prev.additionalImages.filter((_, i) => i !== index),
    }))
  }

  const validate = () => {
    const errors = {};
    const tr = (val) => val ? val.trim() : "";

    const sName = tr(form.storeName);
    if (!sName) errors.storeName = "Store name is required";
    else if (sName.length < 3) errors.storeName = "Minimum 3 characters required";
    else if (sName.length > 100) errors.storeName = "Maximum 100 characters allowed";
    else if (!/^[a-zA-Z0-9\s&-]+$/.test(sName)) errors.storeName = "Only letters, numbers, spaces, &, and - allowed";

    const oName = tr(form.ownerName);
    if (!oName) errors.ownerName = "Owner name is required";
    else if (oName.length < 3) errors.ownerName = "Minimum 3 characters required";
    else if (oName.length > 60) errors.ownerName = "Maximum 60 characters allowed";
    else if (!/^[a-zA-Z\s]+$/.test(oName)) errors.ownerName = "Only alphabets and spaces allowed";

    const oEmail = tr(form.ownerEmail);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!oEmail) errors.ownerEmail = "Owner email is required";
    else if (/\s/.test(oEmail)) errors.ownerEmail = "No spaces allowed in email";
    else if (!emailRegex.test(oEmail)) errors.ownerEmail = "Please enter a valid email";

    const oPhone = tr(form.ownerPhone);
    if (!oPhone) errors.ownerPhone = "Owner phone is required";
    else if (!/^\d+$/.test(oPhone)) errors.ownerPhone = "Only digits allowed";
    else if (oPhone.length !== 10) errors.ownerPhone = "Must be exactly 10 digits";

    const pPhone = tr(form.primaryContactNumber);
    if (!pPhone) errors.primaryContactNumber = "Primary contact number is required";
    else if (!/^\d+$/.test(pPhone)) errors.primaryContactNumber = "Only digits allowed";
    else if (pPhone.length !== 10) errors.primaryContactNumber = "Must be exactly 10 digits";

    const addr1 = tr(form.location.addressLine1);
    if (!addr1) errors.addressLine1 = "Address line 1 is required";
    else if (addr1.length < 5) errors.addressLine1 = "Minimum 5 characters required";
    else if (addr1.length > 150) errors.addressLine1 = "Maximum 150 characters allowed";

    const addr2 = tr(form.location.addressLine2);
    if (addr2 && addr2.length > 150) errors.addressLine2 = "Maximum 150 characters allowed";

    const area = tr(form.location.area);
    if (!area) errors.area = "Area is required";
    else if (area.length < 2) errors.area = "Minimum 2 characters required";
    else if (area.length > 80) errors.area = "Maximum 80 characters allowed";
    else if (!/^[a-zA-Z\s]+$/.test(area)) errors.area = "Only alphabets and spaces allowed";

    const city = tr(form.location.city);
    if (!city) errors.city = "City is required";
    else if (city.length < 2) errors.city = "Minimum 2 characters required";
    else if (city.length > 80) errors.city = "Maximum 80 characters allowed";
    else if (!/^[a-zA-Z\s]+$/.test(city)) errors.city = "Only alphabets and spaces allowed";

    const state = tr(form.location.state);
    if (!state) errors.state = "State is required";
    else if (state.length < 2) errors.state = "Minimum 2 characters required";
    else if (state.length > 80) errors.state = "Maximum 80 characters allowed";
    else if (!/^[a-zA-Z\s]+$/.test(state)) errors.state = "Only alphabets and spaces allowed";

    const zip = tr(form.location.zipCode);
    if (!zip) errors.zipCode = "ZIP / postal code is required";
    else if (!/^\d+$/.test(zip)) errors.zipCode = "Only digits allowed";
    else if (zip.length !== 6) errors.zipCode = "Must be exactly 6 digits";

    const landmark = tr(form.location.landmark);
    if (landmark && landmark.length > 120) errors.landmark = "Maximum 120 characters allowed";

    if (!Number.isFinite(Number(form.location.latitude)) || !Number.isFinite(Number(form.location.longitude))) {
      errors.location = "Please pinpoint the store location on the map"
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return Object.values(errors)[0]; // Return the first error string for the toast
    }
    return "";
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      toast.error(validationError)
      return
    }

    setError("")
    setSaving(true)

    try {
      const formattedAddress = [
        form.location.addressLine1,
        form.location.addressLine2,
        form.location.area,
        form.location.city,
        form.location.state,
        form.location.zipCode,
      ]
        .filter(Boolean)
        .join(", ")

      const payload = {
        step1: {
          storeName: form.storeName.trim(),
          ownerName: form.ownerName.trim(),
          ownerEmail: form.ownerEmail.trim(),
          ownerPhone: form.ownerPhone.trim(),
          primaryContactNumber: form.primaryContactNumber.trim(),
          location: {
            ...form.location,
            formattedAddress,
            address: formattedAddress,
            latitude: Number(form.location.latitude),
            longitude: Number(form.location.longitude),
            coordinates: [
              Number(form.location.longitude),
              Number(form.location.latitude),
            ],
          },
        },
        storeImage: images.storeImage,
        additionalImages: images.additionalImages,
        completedSteps: 1,
      }

      const response = await groceryStoreAPI.updateOnboarding(payload)
      if (response?.data) {
        window.dispatchEvent(new Event("groceryStoreAuthChanged"))
      }

      toast.success("Onboarding completed successfully!")
      setTimeout(() => {
        navigate("/store", { replace: true })
      }, 800)
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

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="px-4 py-4 sm:px-6 sm:py-5 bg-white flex items-center justify-between">
        <div className="text-sm font-semibold text-black">{isEditing ? "Edit Profile" : `${companyName || "Grocery Store"} onboarding`}</div>
        <div className="text-xs text-gray-600">{!isEditing && "Step 1 of 1"}</div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-4 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-600">Loading...</p>
        ) : (
          <div className="space-y-6">
            <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
              <h2 className="text-lg font-semibold text-black">Store details</h2>
              <p className="text-xs text-gray-500">
                Add the basic details customers and admins need to identify your store correctly.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">Store name <span className="text-red-500 ml-0.5">*</span></span>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={form.storeName} onChange={(e) => handleFieldChange("storeName", e.target.value)} className={`pl-10 ${fieldErrors.storeName ? "border-red-500 focus-visible:ring-red-500" : ""}`} />
                  </div>
                  {fieldErrors.storeName && <p className="text-xs text-red-500 mt-1">{fieldErrors.storeName}</p>}
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">Owner name <span className="text-red-500 ml-0.5">*</span></span>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={form.ownerName} onChange={(e) => handleFieldChange("ownerName", e.target.value)} className={`pl-10 ${fieldErrors.ownerName ? "border-red-500 focus-visible:ring-red-500" : ""}`} />
                  </div>
                  {fieldErrors.ownerName && <p className="text-xs text-red-500 mt-1">{fieldErrors.ownerName}</p>}
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">Owner email <span className="text-red-500 ml-0.5">*</span></span>
                  <Input type="email" value={form.ownerEmail} onChange={(e) => handleFieldChange("ownerEmail", e.target.value)} className={fieldErrors.ownerEmail ? "border-red-500 focus-visible:ring-red-500" : ""} />
                  {fieldErrors.ownerEmail && <p className="text-xs text-red-500 mt-1">{fieldErrors.ownerEmail}</p>}
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">Owner phone <span className="text-red-500 ml-0.5">*</span></span>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={form.ownerPhone} onChange={(e) => handleFieldChange("ownerPhone", e.target.value)} className={`pl-10 ${fieldErrors.ownerPhone ? "border-red-500 focus-visible:ring-red-500" : ""}`} />
                  </div>
                  {fieldErrors.ownerPhone && <p className="text-xs text-red-500 mt-1">{fieldErrors.ownerPhone}</p>}
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-medium text-gray-700">Primary contact number <span className="text-red-500 ml-0.5">*</span></span>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={form.primaryContactNumber} onChange={(e) => handleFieldChange("primaryContactNumber", e.target.value)} className={`pl-10 ${fieldErrors.primaryContactNumber ? "border-red-500 focus-visible:ring-red-500" : ""}`} />
                  </div>
                  {fieldErrors.primaryContactNumber && <p className="text-xs text-red-500 mt-1">{fieldErrors.primaryContactNumber}</p>}
                </label>
              </div>
            </section>

            <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
              <h2 className="text-lg font-semibold text-black">Store address</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-medium text-gray-700">Address line 1 <span className="text-red-500 ml-0.5">*</span></span>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input value={form.location.addressLine1} onChange={(e) => handleLocationChange("addressLine1", e.target.value)} className={`pl-10 ${fieldErrors.addressLine1 ? "border-red-500 focus-visible:ring-red-500" : ""}`} />
                  </div>
                  {fieldErrors.addressLine1 && <p className="text-xs text-red-500 mt-1">{fieldErrors.addressLine1}</p>}
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-medium text-gray-700">Address line 2</span>
                  <Input value={form.location.addressLine2} onChange={(e) => handleLocationChange("addressLine2", e.target.value)} className={fieldErrors.addressLine2 ? "border-red-500 focus-visible:ring-red-500" : ""} />
                  {fieldErrors.addressLine2 && <p className="text-xs text-red-500 mt-1">{fieldErrors.addressLine2}</p>}
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">Area <span className="text-red-500 ml-0.5">*</span></span>
                  <Input value={form.location.area} onChange={(e) => handleLocationChange("area", e.target.value)} className={fieldErrors.area ? "border-red-500 focus-visible:ring-red-500" : ""} />
                  {fieldErrors.area && <p className="text-xs text-red-500 mt-1">{fieldErrors.area}</p>}
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">City <span className="text-red-500 ml-0.5">*</span></span>
                  <Input value={form.location.city} onChange={(e) => handleLocationChange("city", e.target.value)} className={fieldErrors.city ? "border-red-500 focus-visible:ring-red-500" : ""} />
                  {fieldErrors.city && <p className="text-xs text-red-500 mt-1">{fieldErrors.city}</p>}
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">State <span className="text-red-500 ml-0.5">*</span></span>
                  <Input value={form.location.state} onChange={(e) => handleLocationChange("state", e.target.value)} className={fieldErrors.state ? "border-red-500 focus-visible:ring-red-500" : ""} />
                  {fieldErrors.state && <p className="text-xs text-red-500 mt-1">{fieldErrors.state}</p>}
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-gray-700">ZIP / postal code <span className="text-red-500 ml-0.5">*</span></span>
                  <Input value={form.location.zipCode} onChange={(e) => handleLocationChange("zipCode", e.target.value)} className={fieldErrors.zipCode ? "border-red-500 focus-visible:ring-red-500" : ""} />
                  {fieldErrors.zipCode && <p className="text-xs text-red-500 mt-1">{fieldErrors.zipCode}</p>}
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-medium text-gray-700">Landmark</span>
                  <Input value={form.location.landmark} onChange={(e) => handleLocationChange("landmark", e.target.value)} className={fieldErrors.landmark ? "border-red-500 focus-visible:ring-red-500" : ""} />
                  {fieldErrors.landmark && <p className="text-xs text-red-500 mt-1">{fieldErrors.landmark}</p>}
                </label>
              </div>
            </section>

            <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-black">Pinpoint store location</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Search for your store, click on the map, or drag the pin to set the exact location.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      ref={autocompleteInputRef}
                      value={locationSearch}
                      onChange={(e) => setLocationSearch(e.target.value)}
                      placeholder="Search for your store location"
                      className="pl-10"
                    />
                  </div>
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

                {(form.location.formattedAddress || (Number.isFinite(Number(form.location.latitude)) && Number.isFinite(Number(form.location.longitude)))) && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                    <div className="font-medium">{form.location.formattedAddress || "Pinned location selected"}</div>
                    {Number.isFinite(Number(form.location.latitude)) && Number.isFinite(Number(form.location.longitude)) && (
                      <div className="mt-1 text-green-700">
                        Coordinates: {Number(form.location.latitude).toFixed(6)}, {Number(form.location.longitude).toFixed(6)}
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

            <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
              <h2 className="text-lg font-semibold text-black">Store images</h2>
              <p className="text-xs text-gray-500">
                Upload your storefront image and any additional photos. These are optional but useful.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Store profile image</label>
                <div className="flex items-center gap-4">
                  {images.storeImage ? (
                    <div className="relative">
                      <img
                        src={images.storeImage.url || images.storeImage}
                        alt="Store"
                        className="w-24 h-24 rounded-lg object-cover"
                      />
                      <button onClick={removeStoreImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-gray-100 flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleStoreImageCameraCapture}
                      disabled={saving}
                      className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-black text-xs font-medium disabled:opacity-60"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Camera</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStoreImageGalleryPick}
                      disabled={saving}
                      className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-black text-xs font-medium disabled:opacity-60"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>Gallery</span>
                    </button>
                  </div>
                  <input
                    ref={storeImageCameraInputRef}
                    id="storeImageCameraInput"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleStoreImageChange}
                    disabled={saving}
                  />
                  <input
                    ref={storeImageGalleryInputRef}
                    id="storeImageGalleryInput"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleStoreImageChange}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Additional images</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {images.additionalImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square">
                      <img src={img.url || img} alt={`Additional ${idx + 1}`} className="w-full h-full rounded-lg object-cover" />
                      <button onClick={() => removeAdditionalImage(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAdditionalImagesCameraCapture}
                    disabled={saving}
                    className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 disabled:opacity-60"
                  >
                    <Upload className="w-6 h-6 text-gray-400 mb-1" />
                    <span className="text-xs text-gray-500">Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAdditionalImagesGalleryPick}
                    disabled={saving}
                    className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 disabled:opacity-60"
                  >
                    <ImageIcon className="w-6 h-6 text-gray-400 mb-1" />
                    <span className="text-xs text-gray-500">Gallery</span>
                  </button>
                  <input
                    ref={additionalImagesCameraInputRef}
                    id="additionalImagesCameraInput"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleAdditionalImageChange}
                    disabled={saving}
                  />
                  <input
                    ref={additionalImagesGalleryInputRef}
                    id="additionalImagesGalleryInput"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleAdditionalImageChange}
                    disabled={saving}
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {error && <div className="px-4 sm:px-6 pb-2 text-xs text-red-600">{error}</div>}

      <footer className="px-4 sm:px-6 py-3 bg-white border-t border-gray-100">
        <div className={`flex ${isEditing ? 'justify-end' : 'justify-between'} items-center`}>
          {!isEditing && (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setShowBackPopup(true)}
              className="text-sm text-gray-700 bg-transparent hover:bg-gray-50"
            >
              Back
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={saving} className="text-sm bg-black text-white px-6">
            {saving ? "Saving..." : (isEditing ? "Update" : "Complete onboarding")}
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
              <p className="text-gray-600 mb-6 px-2 text-sm leading-relaxed">
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
                    clearStoreSignupSession()
                    navigate("/store/login", { replace: true })
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
  )
}
