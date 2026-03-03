import { useState, useEffect, useCallback, useRef } from 'react'
import { zoneAPI } from '@/lib/api'

function normalizePlatform(platform) {
  return platform === 'mogrocery' ? 'mogrocery' : 'mofood'
}

function getCacheKeys(platform) {
  const normalized = normalizePlatform(platform)
  return {
    zoneId: `userZoneId:${normalized}`,
    zone: `userZone:${normalized}`
  }
}

/**
 * Hook to detect and manage user's zone based on location
 * Automatically detects zone when location is available
 */
export function useZone(location, platform = 'mofood') {
  const [zoneId, setZoneId] = useState(null)
  const [zoneStatus, setZoneStatus] = useState('loading') // 'loading' | 'IN_SERVICE' | 'OUT_OF_SERVICE'
  const [zone, setZone] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const prevCoordsRef = useRef({ latitude: null, longitude: null })
  const cacheKeysRef = useRef(getCacheKeys(platform))
  cacheKeysRef.current = getCacheKeys(platform)

  // Detect zone when location is available
  const detectZone = useCallback(async (lat, lng) => {
    if (!lat || !lng) {
      setZoneStatus('OUT_OF_SERVICE')
      setZoneId(null)
      setZone(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const response = await zoneAPI.detectZone(lat, lng, platform)
      
      if (response.data?.success) {
        const data = response.data.data
        
        if (data.status === 'IN_SERVICE' && data.zoneId) {
          setZoneId(data.zoneId)
          setZone(data.zone)
          setZoneStatus('IN_SERVICE')
          
          // Store in localStorage for persistence
          localStorage.setItem(cacheKeysRef.current.zoneId, data.zoneId)
          localStorage.setItem(cacheKeysRef.current.zone, JSON.stringify(data.zone))
        } else {
          // Fallback: if not in selected platform zone, check the other platform zone.
          // This avoids false "out of zone" UI when user is inside any active service zone.
          const selectedPlatform = normalizePlatform(platform)
          const fallbackPlatform = selectedPlatform === 'mofood' ? 'mogrocery' : 'mofood'
          const fallbackResponse = await zoneAPI.detectZone(lat, lng, fallbackPlatform)
          const fallbackData = fallbackResponse?.data?.data

          if (
            fallbackResponse?.data?.success &&
            fallbackData?.status === 'IN_SERVICE' &&
            fallbackData?.zoneId
          ) {
            // Keep selected-platform zoneId unset so same-zone filtering remains strict.
            setZoneId(null)
            setZone({
              ...(fallbackData.zone || null),
              platform: fallbackPlatform,
            })
            setZoneStatus('IN_SERVICE')
            localStorage.removeItem(cacheKeysRef.current.zoneId)
            localStorage.removeItem(cacheKeysRef.current.zone)
          } else {
            // OUT_OF_SERVICE for both platforms
            setZoneId(null)
            setZone(null)
            setZoneStatus('OUT_OF_SERVICE')
            localStorage.removeItem(cacheKeysRef.current.zoneId)
            localStorage.removeItem(cacheKeysRef.current.zone)
          }
        }
      } else {
        throw new Error(response.data?.message || 'Failed to detect zone')
      }
    } catch (err) {
      console.error('Error detecting zone:', err)
      setError(err.response?.data?.message || err.message || 'Failed to detect zone')
      setZoneStatus('OUT_OF_SERVICE')
      setZoneId(null)
      setZone(null)
      
      // Try to use cached zone if available
      const cachedZoneId = localStorage.getItem(cacheKeysRef.current.zoneId)
      if (cachedZoneId) {
        const cachedZone = localStorage.getItem(cacheKeysRef.current.zone)
        setZoneId(cachedZoneId)
        setZone(cachedZone ? JSON.parse(cachedZone) : null)
        setZoneStatus('IN_SERVICE')
      }
    } finally {
      setLoading(false)
    }
  }, [platform])

  // Auto-detect zone when location changes
  useEffect(() => {
    const lat = location?.latitude
    const lng = location?.longitude

    // Check if coordinates have changed significantly (threshold: ~10 meters)
    const coordThreshold = 0.0001 // approximately 10 meters
    const coordsChanged = 
      !prevCoordsRef.current.latitude ||
      !prevCoordsRef.current.longitude ||
      Math.abs(prevCoordsRef.current.latitude - (lat || 0)) > coordThreshold ||
      Math.abs(prevCoordsRef.current.longitude - (lng || 0)) > coordThreshold

    if (lat && lng) {
      // Only detect zone if coordinates changed significantly
      if (coordsChanged) {
        prevCoordsRef.current = { latitude: lat, longitude: lng }
        detectZone(lat, lng)
      }
    } else {
      // Try to use cached zone if location not available
      const cachedZoneId = localStorage.getItem(cacheKeysRef.current.zoneId)
      if (cachedZoneId) {
        const cachedZone = localStorage.getItem(cacheKeysRef.current.zone)
        setZoneId(cachedZoneId)
        setZone(cachedZone ? JSON.parse(cachedZone) : null)
        setZoneStatus('IN_SERVICE')
      } else {
        setZoneStatus('OUT_OF_SERVICE')
        setZoneId(null)
        setZone(null)
      }
    }
  }, [location?.latitude, location?.longitude, detectZone])

  // Manual refresh zone
  const refreshZone = useCallback(() => {
    const lat = location?.latitude
    const lng = location?.longitude
    if (lat && lng) {
      detectZone(lat, lng)
    }
  }, [location?.latitude, location?.longitude, detectZone])

  return {
    zoneId,
    zone,
    zoneStatus,
    loading,
    error,
    isInService: zoneStatus === 'IN_SERVICE',
    isOutOfService: zoneStatus === 'OUT_OF_SERVICE',
    refreshZone
  }
}
