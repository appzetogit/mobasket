import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { MapPin, ArrowLeft, Save, X, Hand, Shapes, Search } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey"
import { Loader } from "@googlemaps/js-api-loader"
import { usePlatform } from "../../context/PlatformContext"

export default function AddZone() {
  const navigate = useNavigate()
  const { platform } = usePlatform()
  const { id } = useParams()
  const isEditMode = !!id && !window.location.pathname.includes('/view/')
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const polygonRef = useRef(null)
  const markersRef = useRef([])
  const pathMarkersRef = useRef([])
  
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("")
  const [mapLoading, setMapLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    country: "India",
    zoneName: "",
    unit: "kilometer",
  })
  
  const [coordinates, setCoordinates] = useState([])
  const [innerCoordinates, setInnerCoordinates] = useState([])
  const [outerCoordinates, setOuterCoordinates] = useState([])
  const [layerDeliveryCharges, setLayerDeliveryCharges] = useState({
    inner: "",
    outer: "",
    outermost: ""
  })
  const layerStyles = {
    zone: { fillColor: '#9333ea', strokeColor: '#9333ea', scale: 8, zIndex: 1 },
    outer: { fillColor: '#2563eb', strokeColor: '#2563eb', scale: 7, zIndex: 2 },
    inner: { fillColor: '#16a34a', strokeColor: '#16a34a', scale: 6, zIndex: 3 }
  }

  const [drawLayerMode, setDrawLayerMode] = useState(null) // null | 'zone' | 'outer' | 'inner'
  const [isDrawing, setIsDrawing] = useState(false)
  const [locationSearch, setLocationSearch] = useState("")
  const [existingZones, setExistingZones] = useState([])
  const autocompleteInputRef = useRef(null)
  const autocompleteRef = useRef(null)
  const existingZonesPolygonsRef = useRef([])
  const polygonOuterRef = useRef(null)
  const polygonInnerRef = useRef(null)
  const pathMarkersOuterRef = useRef([])
  const pathMarkersInnerRef = useRef([])
  const layersDrawnForEditRef = useRef(false)

  useEffect(() => {
    layersDrawnForEditRef.current = false
  }, [id])

  useEffect(() => {
    fetchExistingZones()
    loadGoogleMaps()
    if (isEditMode && id) {
      fetchZone()
    }
  }, [id, isEditMode, platform])

  // Center map on India when country is selected
  useEffect(() => {
    if (formData.country === "India" && mapInstanceRef.current) {
      const indiaCenter = { lat: 20.5937, lng: 78.9629 }
      mapInstanceRef.current.setCenter(indiaCenter)
      mapInstanceRef.current.setZoom(5)
    }
  }, [formData.country])

  // Initialize Places Autocomplete when map is loaded
  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && autocompleteInputRef.current && window.google?.maps?.places && !autocompleteRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(autocompleteInputRef.current, {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'in' } // Restrict to India
      })
      
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        if (place.geometry && place.geometry.location && mapInstanceRef.current) {
          const location = place.geometry.location
          mapInstanceRef.current.setCenter(location)
          mapInstanceRef.current.setZoom(15) // Zoom in when location is selected
          
          // Set the search input value
          setLocationSearch(place.formatted_address || place.name || "")
        }
      })
      
      autocompleteRef.current = autocomplete
    }
  }, [mapLoading])

  // Draw existing polygon when in edit mode and coordinates are loaded
  useEffect(() => {
    if (isEditMode && coordinates.length >= 3 && mapInstanceRef.current && window.google && !mapLoading) {
      console.log("Drawing existing polygon in edit mode, coordinates:", coordinates.length)
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          // Ensure drawing mode is off when editing existing polygon
          setDrawLayerMode(null)
          setIsDrawing(false)
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinates)
        }
      }, 500)
    }
  }, [isEditMode, coordinates.length, mapLoading])


  const fetchExistingZones = async () => {
    try {
      const response = await adminAPI.getZones({ limit: 1000, platform })
      if (response.data?.success && response.data.data?.zones) {
        // Filter out the current zone if in edit mode
        const zones = isEditMode && id 
          ? response.data.data.zones.filter(zone => zone._id !== id)
          : response.data.data.zones
        setExistingZones(zones)
      }
    } catch (error) {
      console.error("Error fetching existing zones:", error)
      setExistingZones([])
    }
  }

  const fetchZone = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getZoneById(id, { platform })
      if (response.data?.success && response.data.data?.zone) {
        const zoneData = response.data.data.zone
        setFormData({
          country: zoneData.country || "India",
          zoneName: zoneData.name || zoneData.zoneName || "",
          unit: zoneData.unit || "kilometer",
        })
        if (zoneData.coordinates && zoneData.coordinates.length > 0) {
          setCoordinates(zoneData.coordinates)
        }
        if (Array.isArray(zoneData.layers) && zoneData.layers.length > 0) {
          const charges = { inner: "", outer: "", outermost: "" }
          zoneData.layers.forEach((ly) => {
            if (ly.type === 'inner') {
              setInnerCoordinates(ly.coordinates || [])
              const charge = Number(ly.deliveryCharge)
              charges.inner = (!isNaN(charge) && charge > 0) ? charge : ""
            } else if (ly.type === 'outer') {
              setOuterCoordinates(ly.coordinates || [])
              const charge = Number(ly.deliveryCharge)
              charges.outer = (!isNaN(charge) && charge > 0) ? charge : ""
            } else if (ly.type === 'outermost') {
              const charge = Number(ly.deliveryCharge)
              charges.outermost = (!isNaN(charge) && charge > 0) ? charge : ""
            }
          })
          setLayerDeliveryCharges((prev) => ({ ...prev, ...charges }))
        }
      }
    } catch (error) {
      console.error("Error fetching zone:", error)
      alert("Failed to load zone")
      navigate("/admin/zone-setup")
    } finally {
      setLoading(false)
    }
  }

  const loadGoogleMaps = async () => {
    try {
      const apiKey = await getGoogleMapsApiKey()
      setGoogleMapsApiKey(apiKey ? "loaded" : "")
      
      // Wait for Google Maps to be loaded from main.jsx if it's loading
      let retries = 0
      const maxRetries = 50 // Wait up to 5 seconds (50 * 100ms)
      
      while (!window.google && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100))
        retries++
      }

      let google = null
      if (window.google && window.google.maps) {
        google = window.google
      } else if (apiKey) {
        const loader = new Loader({
          apiKey: apiKey,
          version: "weekly",
          libraries: ["places", "drawing", "geometry"]
        })
        google = await loader.load()
      }

      if (google) {
        // Defer init so mapRef is attached (DOM ready)
        await new Promise(resolve => setTimeout(resolve, 50))
        initializeMap(google)
      } else {
        setMapLoading(false)
      }
    } catch (error) {
      console.error("Error loading Google Maps:", error)
      setMapLoading(false)
    }
  }

  const setupPolygonWithEditListeners = useCallback((polygon, mode, style, setCoords, targetMarkersRef) => {
    if (!window.google || !mapInstanceRef.current) return;
    const google = window.google;
    const map = mapInstanceRef.current;

    const syncMarkersAndState = () => {
      const path = polygon.getPath();
      const nextCoords = [];
      for (let i = 0; i < path.getLength(); i++) {
        const latLng = path.getAt(i);
        nextCoords.push({
          latitude: parseFloat(latLng.lat().toFixed(6)),
          longitude: parseFloat(latLng.lng().toFixed(6))
        });
      }
      setCoords(nextCoords);

      targetMarkersRef.current.forEach((marker) => marker.setMap(null));
      targetMarkersRef.current = nextCoords.map((coord, index) => {
        return new google.maps.Marker({
          position: { lat: coord.latitude, lng: coord.longitude },
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: style.scale,
            fillColor: style.fillColor,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
          zIndex: 1000 - index,
          title: `${mode === 'outer' ? 'Outer' : mode === 'inner' ? 'Inner' : 'Point'} ${index + 1}`
        });
      });
    };

    google.maps.event.addListener(polygon.getPath(), "set_at", syncMarkersAndState);
    google.maps.event.addListener(polygon.getPath(), "insert_at", syncMarkersAndState);
    google.maps.event.addListener(polygon.getPath(), "remove_at", syncMarkersAndState);

    syncMarkersAndState();
  }, []);

  const drawExistingLayerPolygon = useCallback((google, map, coords, polygonRefVal, markersRefVal, setCoords, mode) => {
    if (!coords || coords.length < 3 || !map) return
    if (polygonRefVal.current) {
      polygonRefVal.current.setMap(null)
      polygonRefVal.current = null
    }
    markersRefVal.current.forEach(m => m.setMap(null))
    markersRefVal.current = []
    const path = coords.map((c) => {
      const lat = typeof c === 'object' ? (c.latitude ?? c.lat) : null
      const lng = typeof c === 'object' ? (c.longitude ?? c.lng) : null
      return lat != null && lng != null ? new google.maps.LatLng(lat, lng) : null
    }).filter(Boolean)
    if (path.length < 3) return

    const style = layerStyles[mode] || layerStyles.zone

    const polygon = new google.maps.Polygon({
      paths: path,
      strokeColor: style.strokeColor,
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: style.fillColor,
      fillOpacity: 0.35,
      editable: true,
      draggable: false,
      zIndex: style.zIndex
    })
    polygon.setMap(map)
    polygonRefVal.current = polygon

    setupPolygonWithEditListeners(polygon, mode, style, setCoords, markersRefVal)
  }, [setupPolygonWithEditListeners])

  const drawExistingPolygon = (google, map, coords) => {
    if (!coords || coords.length < 3) return

    if (polygonRef.current) {
      polygonRef.current.setMap(null)
    }
    pathMarkersRef.current.forEach(marker => marker.setMap(null))
    pathMarkersRef.current = []

    const path = coords.map(coord => {
      const lat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null
      const lng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null
      return lat !== null && lng !== null ? new google.maps.LatLng(lat, lng) : null;
    }).filter(Boolean)

    if (path.length < 3) return

    const polygon = new google.maps.Polygon({
      paths: path,
      strokeColor: layerStyles.zone.strokeColor,
      strokeOpacity: 0.8,
      strokeWeight: 3,
      fillColor: layerStyles.zone.fillColor,
      fillOpacity: 0.35,
      editable: true,
      draggable: false,
      clickable: false,
      zIndex: layerStyles.zone.zIndex
    })

    polygon.setMap(map)
    polygonRef.current = polygon

    const bounds = new google.maps.LatLngBounds()
    path.forEach(latLng => bounds.extend(latLng))
    map.fitBounds(bounds)

    setupPolygonWithEditListeners(polygon, "zone", layerStyles.zone, setCoordinates, pathMarkersRef)
  }

  const initializeMap = (google) => {
    if (!mapRef.current) {
      setMapLoading(false)
      return
    }

    const initialLocation = { lat: 20.5937, lng: 78.9629 }
    const map = new google.maps.Map(mapRef.current, {
      center: initialLocation,
      zoom: 5,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE]
      },
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      scrollwheel: true,
      gestureHandling: 'greedy',
      disableDoubleClickZoom: false,
    })

    mapInstanceRef.current = map

    setMapLoading(false)

    if (isEditMode && coordinates.length >= 3) {
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinates)
        }
      }, 500)
    }
  }

  const drawExistingZonesOnMap = (google, map) => {
    if (!existingZones || existingZones.length === 0) return

    existingZonesPolygonsRef.current.forEach(polygon => {
      if (polygon) polygon.setMap(null)
    })
    existingZonesPolygonsRef.current = []

    existingZones.forEach((zone, index) => {
      if (!zone.coordinates || zone.coordinates.length < 3) return

      const path = zone.coordinates.map(coord => {
        const lat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null
        const lng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null
        if (lat === null || lng === null) return null
        return new google.maps.LatLng(lat, lng)
      }).filter(Boolean)

      if (path.length < 3) return

      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.6,
        strokeWeight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.15,
        editable: false,
        draggable: false,
        clickable: true,
        zIndex: 0
      })

      polygon.setMap(map)
      existingZonesPolygonsRef.current.push(polygon)

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px;">
            <strong>${zone.name || zone.zoneName || 'Unnamed Zone'}</strong><br/>
            <small>Country: ${zone.country || 'N/A'}</small>
          </div>
        `
      })

      polygon.addListener('click', () => {
        infoWindow.setPosition(polygon.getPath().getAt(0))
        infoWindow.open(map)
      })
    })
  }

  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && existingZones.length > 0 && window.google) {
      drawExistingZonesOnMap(window.google, mapInstanceRef.current)
    }
  }, [existingZones, mapLoading])

  useEffect(() => {
    if (!isEditMode || mapLoading || !mapInstanceRef.current || !window.google || layersDrawnForEditRef.current) return
    const hasOuter = outerCoordinates.length >= 3
    const hasInner = innerCoordinates.length >= 3
    if (!hasOuter && !hasInner) return
    if (hasOuter) {
      drawExistingLayerPolygon(
        window.google,
        mapInstanceRef.current,
        outerCoordinates,
        polygonOuterRef,
        pathMarkersOuterRef,
        setOuterCoordinates,
        'outer'
      )
    }
    if (hasInner) {
      drawExistingLayerPolygon(
        window.google,
        mapInstanceRef.current,
        innerCoordinates,
        polygonInnerRef,
        pathMarkersInnerRef,
        setInnerCoordinates,
        'inner'
      )
    }
    layersDrawnForEditRef.current = true
  }, [isEditMode, mapLoading, outerCoordinates, innerCoordinates, drawExistingLayerPolygon])

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !drawLayerMode) return;

    const google = window.google;
    const map = mapInstanceRef.current;

    const clickListener = map.addListener('click', (event) => {
      const latLng = event.latLng;

      const style = layerStyles[drawLayerMode] || layerStyles.zone;
      const targetPolygonRef =
        drawLayerMode === 'outer' ? polygonOuterRef :
        drawLayerMode === 'inner' ? polygonInnerRef :
        polygonRef;

      const targetMarkersRef =
        drawLayerMode === 'outer' ? pathMarkersOuterRef :
        drawLayerMode === 'inner' ? pathMarkersInnerRef :
        pathMarkersRef;

      const setCoords =
        drawLayerMode === 'outer' ? setOuterCoordinates :
        drawLayerMode === 'inner' ? setInnerCoordinates :
        setCoordinates;

      let polygon = targetPolygonRef.current;

      if (!polygon) {
        polygon = new google.maps.Polygon({
          paths: [latLng],
          strokeColor: style.strokeColor,
          strokeOpacity: 0.8,
          strokeWeight: drawLayerMode === "zone" ? 3 : 2,
          fillColor: style.fillColor,
          fillOpacity: 0.35,
          editable: true,
          draggable: false,
          clickable: false,
          zIndex: style.zIndex
        });
        polygon.setMap(map);
        targetPolygonRef.current = polygon;

        setupPolygonWithEditListeners(polygon, drawLayerMode, style, setCoords, targetMarkersRef);
      } else {
        polygon.getPath().push(latLng);
      }
    });

    map.setOptions({ draggableCursor: 'crosshair' });

    return () => {
      google.maps.event.removeListener(clickListener);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setOptions({ draggableCursor: null });
      }
    };
  }, [drawLayerMode, setupPolygonWithEditListeners]);

  const syncDrawingUiState = (mode) => {
    setDrawLayerMode(mode)
    setIsDrawing(true)
  }

  const stopPolygonDrawing = () => {
    setDrawLayerMode(null)
    setIsDrawing(false)
  }

  const startDrawingForLayer = (mode) => {
    syncDrawingUiState(mode)
  }

  const toggleDrawingMode = () => {
    if (isDrawing) {
      stopPolygonDrawing()
    } else {
      startDrawingForLayer("zone")
    }
  }

  const clearDrawing = () => {
    if (drawLayerMode === "zone") {
      stopPolygonDrawing()
    }
    if (polygonRef.current) {
      polygonRef.current.setMap(null)
      polygonRef.current = null
    }
    if (pathMarkersRef.current && pathMarkersRef.current.length > 0) {
      pathMarkersRef.current.forEach(marker => marker.setMap(null))
      pathMarkersRef.current = []
    }
    setCoordinates([])
  }

  const clearOuterLayer = () => {
    if (drawLayerMode === "outer") {
      stopPolygonDrawing()
    }
    if (polygonOuterRef.current) {
      polygonOuterRef.current.setMap(null)
      polygonOuterRef.current = null
    }
    pathMarkersOuterRef.current.forEach(m => m.setMap(null))
    pathMarkersOuterRef.current = []
    setOuterCoordinates([])
  }

  const clearInnerLayer = () => {
    if (drawLayerMode === "inner") {
      stopPolygonDrawing()
    }
    if (polygonInnerRef.current) {
      polygonInnerRef.current.setMap(null)
      polygonInnerRef.current = null
    }
    pathMarkersInnerRef.current.forEach(m => m.setMap(null))
    pathMarkersInnerRef.current = []
    setInnerCoordinates([])
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.zoneName) {
      alert("Please enter a zone name")
      return
    }

    if (!formData.country) {
      alert("Please select a country")
      return
    }

    if (coordinates.length < 3) {
      alert("Please draw at least 3 points on the map to create a zone")
      return
    }

    try {
      setLoading(true)
      
      // Validate coordinates format
      if (!coordinates || coordinates.length < 3) {
        alert("Please draw at least 3 points on the map")
        setLoading(false)
        return
      }

      // Ensure coordinates have correct format (backend expects latitude/longitude)
      const validCoordinates = coordinates
        .map((coord) => {
          if (typeof coord !== 'object' || coord == null) return null
          const lat = Number(coord.latitude ?? coord.lat)
          const lng = Number(coord.longitude ?? coord.lng)
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
          return { latitude: lat, longitude: lng }
        })
        .filter(Boolean)

      if (validCoordinates.length < 3) {
        alert("Please draw at least 3 valid points on the map")
        setLoading(false)
        return
      }

      const layers = []
      if (validCoordinates.length >= 3) {
        layers.push({
          type: "outermost",
          coordinates: validCoordinates,
          deliveryCharge: Number(layerDeliveryCharges.outermost) || 0
        })
      }
      if (outerCoordinates.length >= 3) {
        const outerValid = outerCoordinates.map((c) => ({
          latitude: parseFloat(c.latitude ?? c.lat),
          longitude: parseFloat(c.longitude ?? c.lng)
        }))
        layers.push({ type: "outer", coordinates: outerValid, deliveryCharge: Number(layerDeliveryCharges.outer) || 0 })
      }
      if (innerCoordinates.length >= 3) {
        const innerValid = innerCoordinates.map((c) => ({
          latitude: parseFloat(c.latitude ?? c.lat),
          longitude: parseFloat(c.longitude ?? c.lng)
        }))
        layers.push({ type: "inner", coordinates: innerValid, deliveryCharge: Number(layerDeliveryCharges.inner) || 0 })
      }

      const zoneData = {
        name: formData.zoneName,
        zoneName: formData.zoneName,
        country: formData.country,
        unit: formData.unit || "kilometer",
        coordinates: validCoordinates,
        ...(layers.length > 0 && { layers }),
        isActive: true,
        platform
      }

      console.log("Sending zone data:", zoneData)

      if (isEditMode && id) {
        // Update existing zone
        const response = await adminAPI.updateZone(id, zoneData, { platform })
        console.log("Zone updated successfully:", response)
        alert("Zone updated successfully!")
      } else {
        // Create new zone
        const response = await adminAPI.createZone(zoneData)
        console.log("Zone created successfully:", response)
        alert("Zone created successfully!")
      }
      navigate("/admin/zone-setup")
    } catch (error) {
      console.error("Error creating zone:", error)
      
      // Handle different types of errors
      let errorMessage = "Failed to create zone. Please try again."
      
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || !error.response) {
        // Network error - backend not running or CORS issue
        errorMessage = "Cannot connect to server. Please make sure the backend server is running."
        console.error("Network error: Backend server might not be running")
      } else if (error.response) {
        // API error with response
        errorMessage = error.response.data?.message || 
                      error.response.data?.error || 
                      error.message || 
                      `Server error: ${error.response.status}`
        console.error("API error:", error.response.data)
        console.error("Error status:", error.response.status)
      } else {
        // Other errors
        errorMessage = error.message || errorMessage
      }
      
      alert(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate("/admin/zone-setup")}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {isEditMode ? "Edit Zone" : "Add New Zone"}
              </h1>
              <p className="text-sm text-slate-600">
                {isEditMode ? "Update delivery zone for customer" : "Create a delivery zone for customer"}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Panel - Form */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Zone Details</h2>
                
                <div className="space-y-4">
                  {/* Country Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.country}
                      onChange={(e) => handleInputChange("country", e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="India">India</option>
                    </select>
                  </div>

                  {/* Zone Name */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Create Zone name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.zoneName}
                      onChange={(e) => handleInputChange("zoneName", e.target.value)}
                      placeholder="Enter zone name"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  {/* Select Unit */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Select Unit <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.unit}
                      onChange={(e) => handleInputChange("unit", e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="kilometer">Kilometers (km)</option>
                      <option value="miles">Miles (mi)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Delivery charges by layer */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-2">Delivery charges by layer</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Set delivery charges per layer. The zone boundary is the outermost layer. Draw outer and inner polygons for middle and center areas. Delivery price is calculated from the layer the address falls in.
                </p>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 w-28">Outermost (entire zone)</span>
                    <span className="text-slate-500">₹</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={layerDeliveryCharges.outermost}
                      onChange={(e) => {
                        const value = e.target.value
                        // Allow empty string or valid number
                        if (value === "") {
                          setLayerDeliveryCharges((prev) => ({ ...prev, outermost: "" }))
                        } else {
                          const numValue = Number(value)
                          if (!isNaN(numValue) && numValue >= 0) {
                            setLayerDeliveryCharges((prev) => ({ ...prev, outermost: numValue }))
                          }
                        }
                      }}
                      placeholder="0"
                      className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 w-28">Outer (middle)</span>
                    <span className="text-slate-500">₹</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={layerDeliveryCharges.outer}
                      onChange={(e) => {
                        const value = e.target.value
                        // Allow empty string or valid number
                        if (value === "") {
                          setLayerDeliveryCharges((prev) => ({ ...prev, outer: "" }))
                        } else {
                          const numValue = Number(value)
                          if (!isNaN(numValue) && numValue >= 0) {
                            setLayerDeliveryCharges((prev) => ({ ...prev, outer: numValue }))
                          }
                        }
                      }}
                      placeholder="0"
                      className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => startDrawingForLayer("outer")}
                      className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Draw
                    </button>
                    {outerCoordinates.length >= 3 && (
                      <button type="button" onClick={clearOuterLayer} className="px-3 py-2 text-sm bg-slate-500 text-white rounded-lg hover:bg-slate-600">
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 w-28">Inner (center)</span>
                    <span className="text-slate-500">₹</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={layerDeliveryCharges.inner}
                      onChange={(e) => {
                        const value = e.target.value
                        // Allow empty string or valid number
                        if (value === "") {
                          setLayerDeliveryCharges((prev) => ({ ...prev, inner: "" }))
                        } else {
                          const numValue = Number(value)
                          if (!isNaN(numValue) && numValue >= 0) {
                            setLayerDeliveryCharges((prev) => ({ ...prev, inner: numValue }))
                          }
                        }
                      }}
                      placeholder="0"
                      className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => startDrawingForLayer("inner")}
                      className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Draw
                    </button>
                    {innerCoordinates.length >= 3 && (
                      <button type="button" onClick={clearInnerLayer} className="px-3 py-2 text-sm bg-slate-500 text-white rounded-lg hover:bg-slate-600">
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel - Map */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Draw Zone on Map</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleDrawingMode}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      isDrawing
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    <Shapes className="w-4 h-4" />
                    <span>{isDrawing ? "Stop Drawing" : "Start Drawing"}</span>
                  </button>
                  {coordinates.length > 0 && (
                    <button
                      type="button"
                      onClick={clearDrawing}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    ref={autocompleteInputRef}
                    type="text"
                    placeholder="Search location on map..."
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {coordinates.length > 0 && (
                  <p className="text-xs text-slate-600 mt-2">
                    Points drawn: <strong>{coordinates.length}</strong>
                    {coordinates.length < 3 && (
                      <span className="text-red-600 ml-2">(Minimum 3 points required)</span>
                    )}
                  </p>
                )}
              </div>

              <div className="relative w-full rounded-lg bg-slate-100" style={{ minHeight: "400px", height: "600px" }}>
                <div ref={mapRef} className="w-full h-full rounded-lg" style={{ minHeight: "400px" }} />
                
                {mapLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-slate-600">Loading map...</p>
                    </div>
                  </div>
                )}

                {!googleMapsApiKey && !mapLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
                    <div className="text-center p-6">
                      <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                      <p className="text-sm text-slate-600 mb-4">Google Maps API key not found. Set it in Admin → System → Environment Variables.</p>
                      <button
                        type="button"
                        onClick={() => { setGoogleMapsApiKey(""); loadGoogleMaps(); }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => navigate("/admin/zone-setup")}
              className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || coordinates.length < 3 || !formData.zoneName || !formData.country}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Zone</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

