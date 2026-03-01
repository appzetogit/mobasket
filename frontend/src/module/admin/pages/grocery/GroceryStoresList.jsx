import { useState, useMemo, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Search, Download, ChevronDown, Eye, Settings, ArrowUpDown, Loader2, X, MapPin, Phone, Mail, Star, Building2, User, FileText, ShieldX, Trash2, Plus } from "lucide-react"
import { adminAPI, uploadAPI } from "../../../../lib/api"
import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey"
import { Loader as GoogleMapsLoader } from "@googlemaps/js-api-loader"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { exportRestaurantsToPDF } from "../../components/restaurants/restaurantsExportUtils"

// Import icons from Dashboard-icons
import locationIcon from "../../assets/Dashboard-icons/image1.png"
import restaurantIcon from "../../assets/Dashboard-icons/image2.png"
import inactiveIcon from "../../assets/Dashboard-icons/image3.png"

export default function GroceryStoresList() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedStore, setSelectedStore] = useState(null)
  const [storeDetails, setStoreDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [banConfirmDialog, setBanConfirmDialog] = useState(null) // { store, action: 'ban' | 'unban' }
  const [banning, setBanning] = useState(false)
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(null) // { store }
  const [deleting, setDeleting] = useState(false)
  const [editStoreDialog, setEditStoreDialog] = useState(false)
  const [editingStore, setEditingStore] = useState(null)
  const [savingEditStore, setSavingEditStore] = useState(false)
  const [uploadingStoreImage, setUploadingStoreImage] = useState(false)
  const [editMapLoading, setEditMapLoading] = useState(false)
  const [editMapError, setEditMapError] = useState("")
  const [editStoreImageFile, setEditStoreImageFile] = useState(null)
  const [editStoreImagePreview, setEditStoreImagePreview] = useState("")
  const [editForm, setEditForm] = useState({
    name: "",
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    addressLine1: "",
    addressLine2: "",
    area: "",
    city: "",
    state: "",
    pincode: "",
    latitude: "",
    longitude: "",
    address: "",
  })

  const [mapInstances, setMapInstances] = useState({
    map: null,
    marker: null,
    geocoder: null,
  })
  const editMapRef = useRef(null)

  // Format Store ID (e.g., STOR000001)
  const formatStoreId = (id) => {
    if (!id) return "STOR000000"
    const idString = String(id)
    const hash = idString.split("").reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0) | 0
    }, 0)
    const lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0")
    return `STOR${lastDigits}`
  }

  // Fetch stores from backend API
  const fetchStores = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await adminAPI.getGroceryStores()
      
      if (response.data && response.data.success && response.data.data) {
        const storesData = response.data.data.stores || []
        
        const mappedStores = storesData.map((store, index) => ({
          id: store._id || store.id || index + 1,
          _id: store._id,
          name: store.name || "N/A",
          ownerName: store.ownerName || "N/A",
          ownerPhone: store.ownerPhone || store.phone || "N/A",
          zone: store.location?.area || store.location?.city || store.zone || "N/A",
          status: store.isActive !== false,
          rating: store.ratings?.average || store.rating || 0,
          logo: store.profileImage?.url || store.logo || "",
          originalData: store,
        }))
        
        setStores(mappedStores)
      } else {
        setStores([])
      }
    } catch (err) {
      console.error("Error fetching grocery stores:", err)
      setError(err.message || "Failed to fetch grocery stores")
      setStores([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStores()
  }, [])

  useEffect(() => {
    if (!editStoreDialog || !editingStore?._id) return
    const timer = setTimeout(() => {
      initializeEditMap(editingStore)
    }, 80)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editStoreDialog, editingStore?._id])

  const [filters, setFilters] = useState({
    all: "All",
    zone: "",
  })

  const filteredStores = useMemo(() => {
    let result = [...stores]
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(store =>
        store.name.toLowerCase().includes(query) ||
        store.ownerName.toLowerCase().includes(query) ||
        store.ownerPhone.includes(query)
      )
    }

    if (filters.all !== "All") {
      if (filters.all === "Active") {
        result = result.filter(store => store.status === true)
      } else if (filters.all === "Inactive") {
        result = result.filter(store => store.status === false)
      }
    }

    if (filters.zone) {
      result = result.filter(store => store.zone === filters.zone)
    }

    return result
  }, [stores, searchQuery, filters])

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

    return {
      addressLine1: [streetNumber, route].filter(Boolean).join(" ").trim(),
      area: sublocality || city,
      city,
      state,
      pincode,
    }
  }

  const reverseGeocodeAndFillAddress = (lat, lng, geocoderInstance = null) => {
    const geocoder = geocoderInstance || mapInstances.geocoder
    if (!geocoder || !window.google?.maps) return

    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== "OK" || !Array.isArray(results) || results.length === 0) return
      const best = results[0]
      const parsed = parseAddressComponents(best.address_components || [])
      setEditForm((prev) => ({
        ...prev,
        addressLine1: parsed.addressLine1 || prev.addressLine1 || "",
        area: parsed.area || prev.area || "",
        city: parsed.city || prev.city || "",
        state: parsed.state || prev.state || "",
        pincode: parsed.pincode || prev.pincode || "",
        address: best.formatted_address || prev.address || "",
      }))
    })
  }

  const setEditCoordinates = (lat, lng, shouldReverseGeocode = false, geocoderInstance = null) => {
    const normalizedLat = Number(lat)
    const normalizedLng = Number(lng)
    if (!Number.isFinite(normalizedLat) || !Number.isFinite(normalizedLng)) return

    setEditForm((prev) => ({
      ...prev,
      latitude: normalizedLat.toFixed(6),
      longitude: normalizedLng.toFixed(6),
    }))

    if (mapInstances.marker) {
      mapInstances.marker.setPosition({ lat: normalizedLat, lng: normalizedLng })
    }
    if (mapInstances.map) {
      mapInstances.map.panTo({ lat: normalizedLat, lng: normalizedLng })
    }

    if (shouldReverseGeocode) {
      reverseGeocodeAndFillAddress(normalizedLat, normalizedLng, geocoderInstance)
    }
  }

  const initializeEditMap = async (storeData) => {
    if (!editMapRef.current) return

    try {
      setEditMapLoading(true)
      setEditMapError("")

      let googleLib = window.google
      if (!googleLib?.maps) {
        const apiKey = await getGoogleMapsApiKey()
        if (!apiKey) {
          setEditMapError("Google Maps API key is missing")
          return
        }
        const loader = new GoogleMapsLoader({
          apiKey,
          version: "weekly",
          libraries: ["places"],
        })
        googleLib = await loader.load()
      }

      const lat = Number(storeData?.location?.latitude)
      const lng = Number(storeData?.location?.longitude)
      const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng)
      const center = hasCoordinates ? { lat, lng } : { lat: 22.7196, lng: 75.8577 }

      const map = new googleLib.maps.Map(editMapRef.current, {
        center,
        zoom: hasCoordinates ? 16 : 12,
        mapTypeControl: false,
        streetViewControl: false,
      })

      const geocoder = new googleLib.maps.Geocoder()
      const marker = new googleLib.maps.Marker({
        map,
        position: center,
        draggable: true,
      })

      map.addListener("click", (event) => {
        const clickedLat = event?.latLng?.lat?.()
        const clickedLng = event?.latLng?.lng?.()
        setEditCoordinates(clickedLat, clickedLng, true, geocoder)
      })

      marker.addListener("dragend", (event) => {
        const draggedLat = event?.latLng?.lat?.()
        const draggedLng = event?.latLng?.lng?.()
        setEditCoordinates(draggedLat, draggedLng, true, geocoder)
      })

      setMapInstances({ map, marker, geocoder })
      setEditCoordinates(center.lat, center.lng, !hasCoordinates, geocoder)
    } catch (error) {
      console.error("Failed to initialize edit map:", error)
      setEditMapError("Failed to load map")
    } finally {
      setEditMapLoading(false)
    }
  }

  const handleToggleStatus = async (id) => {
    const store = stores.find(s => s.id === id)
    if (!store) return

    try {
      const newStatus = !store.status
      await adminAPI.updateGroceryStoreStatus(store._id, newStatus)
      setStores(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s))
    } catch (err) {
      console.error("Error updating store status:", err)
      alert("Failed to update status")
    }
  }

  const handleViewDetails = async (store) => {
    setSelectedStore(store)
    setLoadingDetails(true)
    if (store.originalData) {
      setStoreDetails(store.originalData)
      setLoadingDetails(false)
    } else {
      try {
        const response = await adminAPI.getGroceryStoreById(store._id)
        if (response.data?.success) {
          setStoreDetails(response.data.data.store || response.data.data)
        }
      } catch (err) {
        console.error("Error fetching store details:", err)
        setStoreDetails(store)
      } finally {
        setLoadingDetails(false)
      }
    }
  }

  const handleEditStore = async (store) => {
    try {
      let storeData = store?.originalData
      if (!storeData?._id) {
        const response = await adminAPI.getGroceryStoreById(store._id)
        storeData = response?.data?.data?.store || response?.data?.data || store
      }

      setEditingStore(storeData)
      setEditStoreImageFile(null)
      setEditStoreImagePreview(storeData?.profileImage?.url || storeData?.logo || "")
      setEditForm({
        name: storeData?.name || "",
        ownerName: storeData?.ownerName || "",
        ownerPhone: storeData?.ownerPhone || storeData?.phone || "",
        ownerEmail: storeData?.ownerEmail || storeData?.email || "",
        addressLine1: storeData?.location?.addressLine1 || "",
        addressLine2: storeData?.location?.addressLine2 || "",
        area: storeData?.location?.area || "",
        city: storeData?.location?.city || "",
        state: storeData?.location?.state || "",
        pincode: storeData?.location?.pincode || storeData?.location?.zipCode || "",
        latitude: Number.isFinite(Number(storeData?.location?.latitude))
          ? Number(storeData.location.latitude).toFixed(6)
          : "",
        longitude: Number.isFinite(Number(storeData?.location?.longitude))
          ? Number(storeData.location.longitude).toFixed(6)
          : "",
        address: storeData?.location?.address || storeData?.location?.formattedAddress || "",
      })
      setEditStoreDialog(true)
    } catch (err) {
      console.error("Error loading store for edit:", err)
      alert("Failed to load store details for editing")
    }
  }

  const handleStoreImageSelection = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type?.startsWith("image/")) {
      alert("Please select an image file")
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      alert("Please select an image smaller than 10MB")
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setEditStoreImageFile(file)
    setEditStoreImagePreview(previewUrl)
  }

  const handleSaveStoreEdit = async () => {
    if (!editingStore?._id) return

    const lat = Number(editForm.latitude)
    const lng = Number(editForm.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert("Please select a valid map location")
      return
    }

    try {
      setSavingEditStore(true)
      let uploadedProfileImage = null

      if (editStoreImageFile) {
        setUploadingStoreImage(true)
        const uploadResponse = await uploadAPI.uploadMedia(editStoreImageFile, {
          folder: "mobasket/grocery/stores",
        })
        uploadedProfileImage = uploadResponse?.data?.data || null
      }

      const payload = {
        name: editForm.name,
        ownerName: editForm.ownerName,
        ownerPhone: editForm.ownerPhone,
        ownerEmail: editForm.ownerEmail,
        location: {
          addressLine1: editForm.addressLine1,
          addressLine2: editForm.addressLine2,
          area: editForm.area,
          city: editForm.city,
          state: editForm.state,
          pincode: editForm.pincode,
          zipCode: editForm.pincode,
          postalCode: editForm.pincode,
          address: editForm.address || [editForm.addressLine1, editForm.area, editForm.city, editForm.state, editForm.pincode].filter(Boolean).join(", "),
          formattedAddress: editForm.address || [editForm.addressLine1, editForm.area, editForm.city, editForm.state, editForm.pincode].filter(Boolean).join(", "),
          latitude: lat,
          longitude: lng,
          coordinates: [lng, lat],
        },
      }
      if (uploadedProfileImage?.url) {
        payload.profileImage = {
          url: uploadedProfileImage.url,
          publicId: uploadedProfileImage.publicId || "",
        }
      }

      const response = await adminAPI.updateGroceryStore(editingStore._id, payload)
      const updatedStore = response?.data?.data?.store || response?.data?.data

      setStores((prev) =>
        prev.map((store) =>
          store._id === editingStore._id
            ? {
                ...store,
                name: updatedStore?.name || store.name,
                ownerName: updatedStore?.ownerName || store.ownerName,
                ownerPhone: updatedStore?.ownerPhone || updatedStore?.phone || store.ownerPhone,
                zone: updatedStore?.location?.area || updatedStore?.location?.city || store.zone,
                logo: updatedStore?.profileImage?.url || updatedStore?.logo || store.logo,
                originalData: updatedStore || store.originalData,
              }
            : store
        )
      )

      if (selectedStore?._id === editingStore._id) {
        setStoreDetails(updatedStore || storeDetails)
      }

      setEditStoreDialog(false)
      setEditingStore(null)
      setEditStoreImageFile(null)
      setEditStoreImagePreview("")
      alert("Store updated successfully")
    } catch (err) {
      console.error("Error updating store:", err)
      alert(err?.response?.data?.message || "Failed to update store")
    } finally {
      setSavingEditStore(false)
      setUploadingStoreImage(false)
    }
  }

  const handleBanStore = (store) => {
    setBanConfirmDialog({ store, action: store.status ? 'ban' : 'unban' })
  }

  const confirmBanStore = async () => {
    if (!banConfirmDialog) return
    const { store, action } = banConfirmDialog
    const newStatus = action !== 'ban'
    
    try {
      setBanning(true)
      await adminAPI.updateGroceryStoreStatus(store._id, newStatus)
      setStores(prev => prev.map(s => s._id === store._id ? { ...s, status: newStatus } : s))
      setBanConfirmDialog(null)
    } catch (err) {
      console.error("Error banning store:", err)
    } finally {
      setBanning(false)
    }
  }

  const handleDeleteStore = (store) => {
    setDeleteConfirmDialog({ store })
  }

  const confirmDeleteStore = async () => {
    if (!deleteConfirmDialog) return
    const { store } = deleteConfirmDialog
    
    try {
      setDeleting(true)
      await adminAPI.deleteGroceryStore(store._id)
      setStores(prev => prev.filter(s => s._id !== store._id))
      setDeleteConfirmDialog(null)
    } catch (err) {
      console.error("Error deleting store:", err)
    } finally {
      setDeleting(false)
    }
  }

  const handleExport = () => {
    const dataToExport = filteredStores.length > 0 ? filteredStores : stores
    exportRestaurantsToPDF(dataToExport, "grocery_stores_list")
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h1 className="text-2xl font-bold text-slate-900">Grocery Stores List</h1>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Total Stores</p>
                <p className="text-2xl font-bold text-slate-900">{stores.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <img src={locationIcon} alt="Location" className="w-8 h-8" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Active Stores</p>
                <p className="text-2xl font-bold text-slate-900">{stores.filter(s => s.status).length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                <img src={restaurantIcon} alt="Store" className="w-8 h-8" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">Inactive Stores</p>
                <p className="text-2xl font-bold text-slate-900">{stores.filter(s => !s.status).length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                <img src={inactiveIcon} alt="Inactive" className="w-8 h-8" />
              </div>
            </div>
          </div>
        </div>

        {/* List Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-slate-900">Stores List</h2>
            <div className="flex items-center gap-3">
              {stores.length === 0 && (
                <button
                  onClick={() => navigate("/admin/grocery-stores/add")}
                  className="px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Store</span>
                </button>
              )}
              <div className="relative flex-1 sm:flex-initial min-w-[250px]">
                <input
                  type="text"
                  placeholder="Search by store name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              <button onClick={handleExport} className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-2 transition-all">
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span className="ml-3 text-slate-600">Loading stores...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20 text-red-600">
                <p className="font-semibold">Error Loading Data</p>
                <p className="text-sm">{error}</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">SL</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Store Info</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Owner Info</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Zone</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredStores.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-20 text-center text-slate-500">No stores found</td></tr>
                  ) : (
                    filteredStores.map((store, index) => (
                      <tr key={store.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">{index + 1}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <img src={store.logo} alt="" className="w-10 h-10 rounded-full object-cover" />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-900">{store.name}</span>
                              <span className="text-xs text-slate-500">{formatStoreId(store._id)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col text-sm">
                            <span className="font-medium">{store.ownerName}</span>
                            <span className="text-slate-500">{store.ownerPhone}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm">{store.zone}</td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleToggleStatus(store.id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${store.status ? "bg-blue-600" : "bg-slate-300"}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${store.status ? "translate-x-6" : "translate-x-1"}`} />
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center space-x-2">
                          <button onClick={() => handleViewDetails(store)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => handleEditStore(store)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"><Settings className="w-4 h-4" /></button>
                          <button onClick={() => handleBanStore(store)} className={`p-1.5 rounded ${store.status ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}><ShieldX className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteStore(store)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selectedStore && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedStore(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Store Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEditStore(selectedStore)}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <Settings className="w-4 h-4" />
                  Edit
                </button>
                <button onClick={() => setSelectedStore(null)} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-6">
              {loadingDetails ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-6 pb-6 border-b">
                    <img src={storeDetails?.profileImage?.url || storeDetails?.logo || ""} className="w-24 h-24 rounded-lg object-cover bg-slate-100" />
                    <div>
                      <h3 className="text-2xl font-bold">{storeDetails?.name}</h3>
                      <div className="flex gap-4 text-sm text-slate-600 mt-2">
                        <span className="flex items-center gap-1"><Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />{storeDetails?.rating || 0}</span>
                        <span className="flex items-center gap-1"><Building2 className="w-4 h-4" />{formatStoreId(storeDetails?._id)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="font-semibold">Owner Info</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2"><User className="w-4 h-4 text-slate-400" />{storeDetails?.ownerName}</div>
                        <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" />{storeDetails?.ownerPhone}</div>
                        <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" />{storeDetails?.email}</div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="font-semibold">Location</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-slate-400 mt-1" />{storeDetails?.location?.address || "N/A"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Store Modal */}
      {editStoreDialog && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => {
            if (!savingEditStore) {
              setEditStoreDialog(false)
              setEditingStore(null)
            }
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Edit Grocery Store</h2>
              <button
                onClick={() => {
                  if (!savingEditStore) {
                    setEditStoreDialog(false)
                    setEditingStore(null)
                  }
                }}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Store Image</h3>
                <div className="flex items-center gap-4">
                  <img
                    src={editStoreImagePreview || editingStore?.profileImage?.url || editingStore?.logo || ""}
                    alt={editingStore?.name || "Store"}
                    className="w-20 h-20 rounded-lg object-cover bg-slate-100 border border-slate-200"
                  />
                  <div>
                    <label className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">
                      Change Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleStoreImageSelection}
                        className="hidden"
                      />
                    </label>
                    <p className="mt-1.5 text-xs text-slate-500">PNG/JPG/WEBP, up to 10MB.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Store Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Owner Name</label>
                  <input
                    type="text"
                    value={editForm.ownerName}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, ownerName: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Owner Phone</label>
                  <input
                    type="text"
                    value={editForm.ownerPhone}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, ownerPhone: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Owner Email</label>
                  <input
                    type="email"
                    value={editForm.ownerEmail}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, ownerEmail: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="border-t pt-5">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Address</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Address Line 1</label>
                    <input
                      type="text"
                      value={editForm.addressLine1}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, addressLine1: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Address Line 2</label>
                    <input
                      type="text"
                      value={editForm.addressLine2}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, addressLine2: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Area</label>
                    <input
                      type="text"
                      value={editForm.area}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, area: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">City</label>
                    <input
                      type="text"
                      value={editForm.city}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, city: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">State</label>
                    <input
                      type="text"
                      value={editForm.state}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, state: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Pincode</label>
                    <input
                      type="text"
                      value={editForm.pincode}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, pincode: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={editForm.latitude}
                      onChange={(e) => setEditCoordinates(e.target.value, editForm.longitude)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={editForm.longitude}
                      onChange={(e) => setEditCoordinates(editForm.latitude, e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-5">
                <h3 className="text-sm font-bold text-slate-900 mb-2">Pin Location On Map</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Click on map or drag marker to change pinpoint location. Address fields auto-update from map.
                </p>
                <div className="w-full h-80 rounded-lg border border-slate-300 overflow-hidden bg-slate-100">
                  <div ref={editMapRef} className="w-full h-full" />
                </div>
                {editMapLoading && (
                  <p className="mt-2 text-xs text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading map...
                  </p>
                )}
                {editMapError && <p className="mt-2 text-xs text-red-600">{editMapError}</p>}
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={savingEditStore}
                onClick={() => {
                  setEditStoreDialog(false)
                  setEditingStore(null)
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEditStore}
                onClick={handleSaveStoreEdit}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {savingEditStore ? (uploadingStoreImage ? "Uploading image..." : "Saving...") : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban/Unban Confirm Dialog */}
      {banConfirmDialog && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => !banning && setBanConfirmDialog(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {banConfirmDialog.action === "ban" ? "Disable Store" : "Enable Store"}
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to {banConfirmDialog.action === "ban" ? "disable" : "enable"}{" "}
              <span className="font-semibold text-slate-900">{banConfirmDialog.store?.name}</span>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={banning}
                onClick={() => setBanConfirmDialog(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={banning}
                onClick={confirmBanStore}
                className={`px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50 ${
                  banConfirmDialog.action === "ban"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {banning
                  ? (banConfirmDialog.action === "ban" ? "Disabling..." : "Enabling...")
                  : (banConfirmDialog.action === "ban" ? "Disable" : "Enable")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {deleteConfirmDialog && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => !deleting && setDeleteConfirmDialog(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Store</h3>
            <p className="text-sm text-slate-600 mb-6">
              This action cannot be undone. Delete{" "}
              <span className="font-semibold text-slate-900">{deleteConfirmDialog.store?.name}</span>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteConfirmDialog(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDeleteStore}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


