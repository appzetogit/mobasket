import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import io from 'socket.io-client';
import { SOCKET_BASE_URL } from '@/lib/api/config';
import bikeLogo from '@/assets/bikelogo.png';
import { RouteBasedAnimationController } from '@/module/user/utils/routeBasedAnimation';
import { decodePolyline, findNearestPointOnPolyline, trimPolylineBehindRider } from '@/module/delivery/utils/liveTrackingPolyline';
import { ref as rtdbRef, onValue } from 'firebase/database';
import { realtimeDb } from '@/lib/firebase';
import './DeliveryTrackingMap.css';

// Helper function to calculate Haversine distance
function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function offsetCoordinateByMeters(lat, lng, northMeters = 0, eastMeters = 0) {
  const earthRadius = 6378137; // meters
  const dLat = northMeters / earthRadius;
  const dLng = eastMeters / (earthRadius * Math.cos((Math.PI * lat) / 180));
  return {
    lat: lat + (dLat * 180) / Math.PI,
    lng: lng + (dLng * 180) / Math.PI
  };
}

const DeliveryTrackingMap = ({ 
  orderId, 
  restaurantCoords, 
  customerCoords,
  deliveryBoyData = null,
  order = null
}) => {
  const mapRef = useRef(null);
  const bikeMarkerRef = useRef(null);
  const mapInstance = useRef(null);
  const socketRef = useRef(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [deliveryBoyLocation, setDeliveryBoyLocation] = useState(null);
  const [hasLiveSocketLocation, setHasLiveSocketLocation] = useState(false);
  const routePolylineRef = useRef(null);
  const isCustomerLegRef = useRef(false);
  const routePolylinePointsRef = useRef(null); // Store decoded polyline points for route-based animation
  const visibleRoutePolylinePointsRef = useRef(null); // Store currently visible (trimmed) route points
  const animationControllerRef = useRef(null); // Route-based animation controller
  const lastRouteUpdateRef = useRef(null);
  const hasFirebaseRouteRef = useRef(false);
  const activeFirebaseAliasRef = useRef(null);
  const lastLiveLocationUpdateAtRef = useRef(0);
  const userHasInteractedRef = useRef(false);
  const isProgrammaticChangeRef = useRef(false);
  const mapInitializedRef = useRef(false);
  const directionsCacheRef = useRef(new Map()); // Cache for locally generated route paths
  const lastRouteRequestRef = useRef({ start: null, end: null, timestamp: 0 });
  const SOCKET_LOCATION_REFRESH_INTERVAL_MS = 1500;
  const SOCKET_LOCATION_STALE_THRESHOLD_MS = 2000;
  const ROUTE_RECALC_MIN_INTERVAL_MS = 2500;

  const backendUrl = SOCKET_BASE_URL;
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState("");
  const [hasFirebaseRoute, setHasFirebaseRoute] = useState(false);
  const [firebaseCustomerCoords, setFirebaseCustomerCoords] = useState(null);

  const effectiveCustomerCoords = useMemo(() => {
    if (
      customerCoords &&
      typeof customerCoords.lat === 'number' &&
      typeof customerCoords.lng === 'number'
    ) {
      return customerCoords;
    }

    if (
      firebaseCustomerCoords &&
      typeof firebaseCustomerCoords.lat === 'number' &&
      typeof firebaseCustomerCoords.lng === 'number'
    ) {
      return firebaseCustomerCoords;
    }

    return null;
  }, [firebaseCustomerCoords, customerCoords]);

  const renderPolylinePath = useCallback((points, isCustomerLeg = false) => {
    if (!mapInstance.current || !window.google?.maps || !Array.isArray(points) || points.length === 0) {
      return;
    }

    const normalizedPath = points
      .map((point) => ({
        lat: Number(point?.lat),
        lng: Number(point?.lng)
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

    if (normalizedPath.length === 0) return;

    routePolylinePointsRef.current = normalizedPath;
    visibleRoutePolylinePointsRef.current = normalizedPath;

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
    }

    const activeColor = isCustomerLeg ? '#2563eb' : '#10b981';
    routePolylineRef.current = new window.google.maps.Polyline({
      path: normalizedPath,
      geodesic: true,
      strokeColor: activeColor,
      strokeOpacity: 0.95,
      strokeWeight: 6,
      icons: [{
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: 1,
          strokeWeight: 2,
          strokeColor: activeColor,
          scale: 4
        },
        offset: '0%',
        repeat: '15px'
      }],
      map: mapInstance.current,
      zIndex: 10
    });

    if (bikeMarkerRef.current && !animationControllerRef.current) {
      animationControllerRef.current = new RouteBasedAnimationController(
        bikeMarkerRef.current,
        normalizedPath
      );
    } else if (animationControllerRef.current) {
      animationControllerRef.current.updatePolyline(normalizedPath);
    }
  }, []);
  
  // Load Google Maps API key from backend
  useEffect(() => {
    import('@/lib/utils/googleMapsApiKey.js').then(({ getGoogleMapsApiKey }) => {
      getGoogleMapsApiKey().then(key => {
        setGOOGLE_MAPS_API_KEY(key)
      })
    })
  }, [])

  const getInitialRiderLocationFromOrder = useCallback(() => {
    const toFiniteNumber = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const extractFromCoordinates = (coordinates) => {
      if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
      const lng = toFiniteNumber(coordinates[0]);
      const lat = toFiniteNumber(coordinates[1]);
      if (lat == null || lng == null) return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      return { lat, lng, heading: 0 };
    };

    const extractFromLatLng = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      const lat = toFiniteNumber(obj.lat ?? obj.latitude);
      const lng = toFiniteNumber(obj.lng ?? obj.longitude);
      if (lat == null || lng == null) return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      return { lat, lng, heading: toFiniteNumber(obj.heading ?? obj.bearing) ?? 0 };
    };

    const partnerCandidates = [
      order?.deliveryPartner,
      order?.deliveryPartnerId
    ];

    for (const partner of partnerCandidates) {
      if (!partner || typeof partner !== 'object') continue;

      const currentLocation = partner?.availability?.currentLocation || partner?.currentLocation || null;
      const fromCoords = extractFromCoordinates(currentLocation?.coordinates);
      if (fromCoords) return fromCoords;

      const fromLatLng = extractFromLatLng(currentLocation);
      if (fromLatLng) return fromLatLng;
    }

    return null;
  }, [order]);

  const parseSocketLocation = useCallback((data) => {
    if (!data || typeof data !== "object") return null;

    const toFinite = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const lat =
      toFinite(data.lat) ??
      toFinite(data.latitude) ??
      (Array.isArray(data.coordinates) ? toFinite(data.coordinates[1]) : null);
    const lng =
      toFinite(data.lng) ??
      toFinite(data.longitude) ??
      (Array.isArray(data.coordinates) ? toFinite(data.coordinates[0]) : null);
    const heading = toFinite(data.heading) ?? toFinite(data.bearing) ?? 0;

    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    return { lat, lng, heading };
  }, []);

  useEffect(() => {
    if (deliveryBoyLocation?.lat && deliveryBoyLocation?.lng) return;
    if (currentLocation?.lat && currentLocation?.lng) return;

    const seededLocation = getInitialRiderLocationFromOrder();
    if (seededLocation) {
      setDeliveryBoyLocation(seededLocation);
      setCurrentLocation(seededLocation);
    }
  }, [getInitialRiderLocationFromOrder, deliveryBoyLocation?.lat, deliveryBoyLocation?.lng, currentLocation?.lat, currentLocation?.lng]);

  // Draw road-snapped route from start/end coordinates, with interpolation fallback.
  const drawRoute = useCallback((start, end) => {
    if (!mapInstance.current || !window.google?.maps) return;

    if (!start || !end) {
      return;
    }

    const startLat = Number(start.lat);
    const startLng = Number(start.lng);
    const endLat = Number(end.lat);
    const endLng = Number(end.lng);

    if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
      return;
    }

    if (startLat < -90 || startLat > 90 || endLat < -90 || endLat > 90 ||
        startLng < -180 || startLng > 180 || endLng < -180 || endLng > 180) {
      return;
    }

    if (startLat === endLat && startLng === endLng) {
      return;
    }

    const roundCoord = (coord) => Math.round(coord * 10000) / 10000;
    const cacheKey = `${roundCoord(startLat)},${roundCoord(startLng)}|${roundCoord(endLat)},${roundCoord(endLng)}`;
    const now = Date.now();

    const cached = directionsCacheRef.current.get(cacheKey);
    if (cached && (now - cached.timestamp) < 300000) {
      renderPolylinePath(cached.points || [], isCustomerLegRef.current);
      return;
    }

    const lastRequest = lastRouteRequestRef.current;
    if (lastRequest.start && lastRequest.end &&
        Math.abs(lastRequest.start.lat - startLat) < 0.0001 &&
        Math.abs(lastRequest.start.lng - startLng) < 0.0001 &&
        Math.abs(lastRequest.end.lat - endLat) < 0.0001 &&
        Math.abs(lastRequest.end.lng - endLng) < 0.0001 &&
        (now - lastRequest.timestamp) < 2000) {
      return;
    }

    lastRouteRequestRef.current = {
      start: { lat: startLat, lng: startLng },
      end: { lat: endLat, lng: endLng },
      timestamp: now
    };

    const fallbackToInterpolatedPath = () => {
      const routeDistanceMeters = calculateHaversineDistance(startLat, startLng, endLat, endLng);
      const segmentCount = Math.max(1, Math.min(120, Math.ceil(routeDistanceMeters / 30)));
      const points = [];
      for (let i = 0; i <= segmentCount; i += 1) {
        const t = i / segmentCount;
        points.push({
          lat: startLat + (endLat - startLat) * t,
          lng: startLng + (endLng - startLng) * t
        });
      }

      directionsCacheRef.current.set(cacheKey, {
        points,
        timestamp: Date.now()
      });
      renderPolylinePath(points, isCustomerLegRef.current);
    };

    if (!window.google?.maps?.DirectionsService || !window.google?.maps?.TravelMode) {
      fallbackToInterpolatedPath();
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: startLat, lng: startLng },
        destination: { lat: endLat, lng: endLng },
        travelMode: window.google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false,
      },
      (result, status) => {
        if (status === 'OK' && result?.routes?.[0]) {
          const route = result.routes[0];
          const points = Array.isArray(route.overview_path)
            ? route.overview_path
                .map((point) => ({
                  lat: Number(point?.lat?.() ?? point?.lat),
                  lng: Number(point?.lng?.() ?? point?.lng)
                }))
                .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
            : [];

          if (points.length > 1) {
            directionsCacheRef.current.set(cacheKey, {
              points,
              timestamp: Date.now()
            });

            const tenMinutesAgo = Date.now() - 600000;
            for (const [key, value] of directionsCacheRef.current.entries()) {
              if (value.timestamp < tenMinutesAgo) {
                directionsCacheRef.current.delete(key);
              }
            }

            renderPolylinePath(points, isCustomerLegRef.current);
            return;
          }
        }

        fallbackToInterpolatedPath();
      }
    );
  }, [renderPolylinePath]);
  // Check if delivery partner is assigned (memoized to avoid dependency issues)
  // MUST be defined BEFORE any useEffect that uses it
  const hasDeliveryPartner = useMemo(() => {
    const deliveryStateStatus = String(order?.deliveryState?.status || '').toLowerCase();
    const currentPhase = String(order?.deliveryState?.currentPhase || '').toLowerCase();

    const hasPartnerId = Boolean(
      order?.deliveryPartnerId ||
      order?.deliveryPartner?._id ||
      order?.assignmentInfo?.deliveryPartnerId
    );

    const assignmentStatuses = new Set([
      'accepted',
      'reached_pickup',
      'order_confirmed',
      'en_route_to_delivery',
    ]);

    const assignmentPhases = new Set([
      'en_route_to_pickup',
      'at_pickup',
      'picked_up',
      'en_route_to_delivery',
      'at_delivery',
    ]);

    const orderStatus = String(order?.status || '').toLowerCase();
    const hasAssignedOrderStatus =
      orderStatus === 'out_for_delivery' ||
      orderStatus === 'picked_up' ||
      orderStatus === 'delivered' ||
      orderStatus === 'completed';

    const hasAssignedStatus = assignmentStatuses.has(deliveryStateStatus);
    const hasAssignedPhase = assignmentPhases.has(currentPhase);
    const hasPartner = hasPartnerId || hasAssignedStatus || hasAssignedPhase || hasAssignedOrderStatus;

    return hasPartner;
  }, [order?.deliveryPartnerId, order?.deliveryPartner?._id, order?.assignmentInfo?.deliveryPartnerId, order?.deliveryState?.status, order?.deliveryState?.currentPhase, order?.status]);

  // Determine which route to show based on order phase
  const getRouteToShow = useCallback(() => {
    const currentPhase = order?.deliveryState?.currentPhase || '';
    const status = order?.deliveryState?.status || 'pending';
    const orderStatus = order?.status || '';

    const liveRiderLocation = (
      (deliveryBoyLocation && typeof deliveryBoyLocation.lat === 'number' && typeof deliveryBoyLocation.lng === 'number')
        ? deliveryBoyLocation
        : (currentLocation && typeof currentLocation.lat === 'number' && typeof currentLocation.lng === 'number')
          ? currentLocation
          : null
    );
    const hasRiderLocation = Boolean(liveRiderLocation);
    const hasRestaurantCoords =
      !!restaurantCoords &&
      typeof restaurantCoords.lat === 'number' &&
      typeof restaurantCoords.lng === 'number';
    const hasCustomerCoords =
      !!effectiveCustomerCoords &&
      typeof effectiveCustomerCoords.lat === 'number' &&
      typeof effectiveCustomerCoords.lng === 'number';

    if (!hasCustomerCoords) {
      return { start: null, end: null };
    }

    const isCustomerLeg =
      currentPhase === 'en_route_to_delivery' ||
      status === 'order_confirmed' ||
      status === 'en_route_to_delivery' ||
      orderStatus === 'out_for_delivery';

    // If we already have live rider location, show rider -> customer route
    // so the user always sees where the driver is relative to their location.
    if (hasRiderLocation) {
      return {
        start: { lat: liveRiderLocation.lat, lng: liveRiderLocation.lng },
        end: effectiveCustomerCoords
      };
    }

    // After pickup/delivery leg, ONLY show rider -> customer.
    // Do not fallback to store route in this phase.
    if (isCustomerLeg) {
      return { start: null, end: null };
    }

    // Once a delivery partner is assigned, never fallback to customer<->store route
    // if rider location is missing. Wait for real rider coordinates instead.
    if (hasDeliveryPartner && !hasRiderLocation) {
      return { start: null, end: null };
    }

    // Initial stage: before rider accepts, show store -> saved order address route.
    if (
      !order ||
      (!hasRiderLocation && status === 'pending' && currentPhase === 'assigned' && orderStatus !== 'out_for_delivery')
    ) {
      if (hasRestaurantCoords) {
        return { start: restaurantCoords, end: effectiveCustomerCoords };
      }
      return { start: null, end: null };
    }

    // Fallback: no route (prevents incorrect line from default/invalid store coords)
    return { start: null, end: null };
  }, [order, deliveryBoyLocation, currentLocation, restaurantCoords, effectiveCustomerCoords, hasDeliveryPartner]);

  const getOrderStoredRoutePoints = useCallback(() => {
    const routePhase = order?.deliveryState?.currentPhase;
    const routeStatus = order?.deliveryState?.status;
    const isCustomerLeg =
      routePhase === 'en_route_to_delivery' ||
      routeStatus === 'order_confirmed' ||
      routeStatus === 'en_route_to_delivery' ||
      order?.status === 'out_for_delivery';

    const routeCoordinates = isCustomerLeg
      ? order?.deliveryState?.routeToDelivery?.coordinates
      : order?.deliveryState?.routeToPickup?.coordinates;

    if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
      return null;
    }

    const points = routeCoordinates
      .map((pair) => {
        if (!Array.isArray(pair) || pair.length < 2) return null;
        const lat = Number(pair[0]);
        const lng = Number(pair[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng };
      })
      .filter(Boolean);

    return points.length > 1 ? { points, isCustomerLeg } : null;
  }, [order]);

  // Move bike smoothly with rotation
  const moveBikeSmoothly = useCallback((lat, lng, heading) => {
    if (!mapInstance.current || !isMapLoaded) {
      setCurrentLocation({ lat, lng, heading });
      return;
    }

    try {
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        console.error('❌ Invalid coordinates:', { lat, lng });
        return;
      }

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.error('❌ Coordinates out of range:', { lat, lng });
        return;
      }

      const position = new window.google.maps.LatLng(lat, lng);

      if (!bikeMarkerRef.current) {
        // Create bike marker with the same icon as delivery boy's map
        console.log('🚴 Map instance:', !!mapInstance.current);
        
        // Create bike icon configuration
        let bikeIcon = {
          url: bikeLogo,
          scaledSize: new window.google.maps.Size(50, 50), // Slightly larger for better visibility
          anchor: new window.google.maps.Point(25, 25),
          rotation: heading || 0
        };

        try {
          // Test if image loads (but don't wait for it - create marker immediately)
          const img = new Image();
          img.onload = () => {
          };
          img.onerror = () => {
            console.error('❌ Bike logo image failed to load:', bikeLogo);
            // If image fails, update marker with fallback icon
            if (bikeMarkerRef.current) {
              bikeMarkerRef.current.setIcon({
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: '#FF6B00',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 3
              });
            }
          };
          img.src = bikeLogo;
          
          bikeMarkerRef.current = new window.google.maps.Marker({
            position: position,
            map: mapInstance.current,
            icon: bikeIcon,
            optimized: false,
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 3, // Above other markers
            title: 'Delivery Partner',
            visible: true,
            animation: window.google.maps.Animation.DROP // Add drop animation
          });

          // Force marker to be visible
          bikeMarkerRef.current.setVisible(true);
          
          // Initialize route-based animation controller if polyline is available
          if (routePolylinePointsRef.current && routePolylinePointsRef.current.length > 0) {
            animationControllerRef.current = new RouteBasedAnimationController(
              bikeMarkerRef.current,
              routePolylinePointsRef.current
            );
          }
          
          // Verify marker is on map
          const markerMap = bikeMarkerRef.current.getMap();
          const markerVisible = bikeMarkerRef.current.getVisible();
          const markerPosition = bikeMarkerRef.current.getPosition();
          
          console.log('✅✅✅ Bike marker created and visible at:', { 
            lat, 
            lng, 
            heading,
            marker: bikeMarkerRef.current,
            isVisible: markerVisible,
            position: markerPosition ? { lat: markerPosition.lat(), lng: markerPosition.lng() } : null,
            map: markerMap,
            iconUrl: bikeLogo,
            mapBounds: markerMap ? markerMap.getBounds() : null,
            hasRouteAnimation: !!animationControllerRef.current
          });
          
          if (!markerMap) {
            console.error('❌ Bike marker created but not on map! Re-adding...');
            bikeMarkerRef.current.setMap(mapInstance.current);
          }
          if (!markerVisible) {
            console.error('❌ Bike marker created but not visible! Making visible...');
            bikeMarkerRef.current.setVisible(true);
          }
          
          // Double check after a moment
          setTimeout(() => {
            if (bikeMarkerRef.current) {
              const finalMap = bikeMarkerRef.current.getMap();
              const finalVisible = bikeMarkerRef.current.getVisible();
              console.log('🔍 Bike marker verification after 500ms:', {
                exists: !!bikeMarkerRef.current,
                onMap: !!finalMap,
                visible: finalVisible,
                position: bikeMarkerRef.current.getPosition()
              });
            }
          }, 500);
        } catch (markerError) {
          console.error('❌ Error creating bike marker:', markerError);
          // Try fallback simple marker
          try {
            bikeMarkerRef.current = new window.google.maps.Marker({
              position: position,
              map: mapInstance.current,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: '#FF6B00',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 3
              },
              title: 'Delivery Partner',
              visible: true,
              zIndex: window.google.maps.Marker.MAX_ZINDEX + 3
            });
            console.log('✅ Created fallback marker (orange circle)');
          } catch (fallbackError) {
            console.error('❌ Even fallback marker failed:', fallbackError);
          }
        }
      } else {
        // RAPIDO/ZOMATO-STYLE: Bike MUST stay on route polyline, NEVER use raw GPS
        if (routePolylinePointsRef.current && routePolylinePointsRef.current.length > 0) {
          // Find nearest point on polyline (ensures marker stays on road)
          // Note: findNearestPointOnPolyline takes (polyline, riderPosition)
          const nearest = findNearestPointOnPolyline(routePolylinePointsRef.current, { lat, lng });
          
          if (nearest && nearest.nearestPoint) {
            const trimmedRoute = trimPolylineBehindRider(
              routePolylinePointsRef.current,
              nearest.nearestPoint,
              nearest.segmentIndex
            );
            if (routePolylineRef.current && Array.isArray(trimmedRoute) && trimmedRoute.length > 0) {
              let visibleRoute = trimmedRoute;
              if (visibleRoute.length < 2 && routePolylinePointsRef.current.length > 1) {
                const lastPoint = routePolylinePointsRef.current[routePolylinePointsRef.current.length - 1];
                if (lastPoint && (Number(lastPoint.lat) !== Number(visibleRoute[0]?.lat) || Number(lastPoint.lng) !== Number(visibleRoute[0]?.lng))) {
                  visibleRoute = [visibleRoute[0], lastPoint];
                }
              }
              visibleRoutePolylinePointsRef.current = visibleRoute;
              routePolylineRef.current.setPath(
                visibleRoute.map((point) => ({
                  lat: Number(point?.lat),
                  lng: Number(point?.lng)
                }))
              );
            }

            // Calculate progress on route (0 to 1) based on distance traveled
            const totalPoints = routePolylinePointsRef.current.length;
            
            // Calculate cumulative distance to nearest point for accurate progress
            let distanceToNearest = 0;
            for (let i = 0; i < nearest.segmentIndex; i++) {
              const p1 = routePolylinePointsRef.current[i];
              const p2 = routePolylinePointsRef.current[i + 1];
              distanceToNearest += calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
            }
            
            // Add distance within current segment
            const segmentStart = routePolylinePointsRef.current[nearest.segmentIndex];
            const segmentEnd = routePolylinePointsRef.current[nearest.segmentIndex + 1] || segmentStart;
            const segmentDistance = calculateHaversineDistance(segmentStart.lat, segmentStart.lng, segmentEnd.lat, segmentEnd.lng);
            const segmentProgress = calculateHaversineDistance(segmentStart.lat, segmentStart.lng, nearest.nearestPoint.lat, nearest.nearestPoint.lng) / (segmentDistance || 1);
            distanceToNearest += segmentDistance * segmentProgress;
            
            // Calculate total route distance
            let totalDistance = 0;
            for (let i = 0; i < routePolylinePointsRef.current.length - 1; i++) {
              const p1 = routePolylinePointsRef.current[i];
              const p2 = routePolylinePointsRef.current[i + 1];
              totalDistance += calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
            }
            
            // Calculate progress (0 to 1)
            let progress = totalDistance > 0 ? Math.min(1, Math.max(0, distanceToNearest / totalDistance)) : 0;
            
            // Ensure progress doesn't go backwards (only forward movement) - Rapido/Zomato style
            if (animationControllerRef.current && animationControllerRef.current.lastProgress !== undefined) {
              const lastProgress = animationControllerRef.current.lastProgress;
              // Allow small backward movement (GPS noise) but prevent large jumps
              if (progress < lastProgress - 0.05) {
                progress = lastProgress; // Don't go backwards more than 5%
              } else if (progress < lastProgress) {
                // Small backward movement - keep last progress
                progress = lastProgress;
              }
            }
            
            // Use route-based animation controller if available
            if (animationControllerRef.current) {
              console.log('🛵 Route-based animation (Rapido/Zomato style):', { 
                progress, 
                segmentIndex: nearest.segmentIndex,
                onRoute: true,
                snappedToRoad: true
              });
              animationControllerRef.current.updatePosition(progress, heading || 0);
              animationControllerRef.current.lastProgress = progress;
            } else {
              // Initialize animation controller if not exists
              if (bikeMarkerRef.current) {
                animationControllerRef.current = new RouteBasedAnimationController(
                  bikeMarkerRef.current,
                  routePolylinePointsRef.current
                );
                animationControllerRef.current.updatePosition(progress, heading || 0);
                animationControllerRef.current.lastProgress = progress;
              } else {
                // Fallback: Move to nearest point on polyline (STAY ON ROAD)
                const nearestPosition = new window.google.maps.LatLng(nearest.nearestPoint.lat, nearest.nearestPoint.lng);
                bikeMarkerRef.current.setPosition(nearestPosition);
                bikeMarkerRef.current.setRotation(heading || 0);
              }
            }
          } else {
            // If nearest point not found, use first point of polyline (don't use raw GPS)
            const firstPoint = routePolylinePointsRef.current[0];
            if (firstPoint && bikeMarkerRef.current) {
              const firstPosition = new window.google.maps.LatLng(firstPoint.lat, firstPoint.lng);
              bikeMarkerRef.current.setPosition(firstPosition);
            }
          }
        } else {
          // CRITICAL: If no polyline, DO NOT show bike at raw GPS location
          // Wait for route to be generated first
          // Don't update marker position - keep it at last known position on route
          // This prevents bike from jumping to buildings/footpaths
          return; // Exit early - don't update marker
        }
        
        // Prevent marker overlap: when rider reaches customer pin, keep bike icon slightly offset.
        if (bikeMarkerRef.current && effectiveCustomerCoords) {
          const currentMarkerPos = bikeMarkerRef.current.getPosition();
          if (currentMarkerPos && typeof currentMarkerPos.lat === 'function' && typeof currentMarkerPos.lng === 'function') {
            const markerLat = currentMarkerPos.lat();
            const markerLng = currentMarkerPos.lng();
            const distanceToCustomer = calculateHaversineDistance(
              markerLat,
              markerLng,
              effectiveCustomerCoords.lat,
              effectiveCustomerCoords.lng
            );

            const overlapThresholdMeters = 14;
            if (distanceToCustomer <= overlapThresholdMeters) {
              const sideAngleDegrees = (Number(heading) || 0) + 90;
              const sideAngleRadians = (sideAngleDegrees * Math.PI) / 180;
              const offsetMeters = 10;
              const northMeters = Math.cos(sideAngleRadians) * offsetMeters;
              const eastMeters = Math.sin(sideAngleRadians) * offsetMeters;
              const offsetPoint = offsetCoordinateByMeters(markerLat, markerLng, northMeters, eastMeters);

              bikeMarkerRef.current.setPosition(
                new window.google.maps.LatLng(offsetPoint.lat, offsetPoint.lng)
              );
            }
          }
        }

        // Ensure bike is visible
        bikeMarkerRef.current.setVisible(true);
        
        // Verify bike is on map
        if (!bikeMarkerRef.current.getMap()) {
          bikeMarkerRef.current.setMap(mapInstance.current);
        }

        // DO NOT auto-pan map - keep it stable
        // Map should remain at user's chosen view
      }
    } catch (error) {
      console.error('❌ Error moving bike:', error);
    }
  }, [isMapLoaded, bikeLogo, effectiveCustomerCoords?.lat, effectiveCustomerCoords?.lng]);

  // Initialize Socket.io connection
  useEffect(() => {
    if (!orderId) return;

    const orderAliases = Array.from(
      new Set(
        [
          String(orderId || '').trim(),
          String(order?.orderId || '').trim(),
          String(order?._id || '').trim(),
          String(order?.id || '').trim()
        ].filter(Boolean)
      )
    );

    socketRef.current = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionAttempts: 5,
      timeout: 5000
    });

    socketRef.current.on('connect', () => {
      console.log('Socket connected for order:', orderId);
      orderAliases.forEach((alias) => {
        socketRef.current.emit('join-order-tracking', alias);
        socketRef.current.emit('request-current-location', alias);
      });

      // Fallback sync: aggressively request current location so user map stays in sync with rider app.
      const locationRequestInterval = setInterval(() => {
        const now = Date.now();
        const isLiveUpdateStale = (now - (lastLiveLocationUpdateAtRef.current || 0)) > SOCKET_LOCATION_STALE_THRESHOLD_MS;
        if (socketRef.current && socketRef.current.connected && isLiveUpdateStale) {
          orderAliases.forEach((alias) => {
            socketRef.current.emit('request-current-location', alias);
          });
        }
      }, SOCKET_LOCATION_REFRESH_INTERVAL_MS);

      socketRef.current._locationRequestInterval = locationRequestInterval;
    });

    socketRef.current.on('disconnect', () => {
    });

    const handleLocationUpdate = (data) => {
      const location = parseSocketLocation(data);
      if (location) {
        lastLiveLocationUpdateAtRef.current = Date.now();
        setHasLiveSocketLocation(true);
        setCurrentLocation(location);
        setDeliveryBoyLocation(location);

        // RAPIDO-STYLE: Use route-based animation if progress is available
        if (isMapLoaded && mapInstance.current) {
          if (data.progress !== undefined && animationControllerRef.current && routePolylinePointsRef.current) {
            // Backend sent progress - use route-based animation
            animationControllerRef.current.updatePosition(data.progress, data.bearing || data.heading || 0);
          } else {
            // Fallback: Use moveBikeSmoothly (will use route-based if polyline available)
            moveBikeSmoothly(location.lat, location.lng, location.heading);
          }
        } else {
          // Store for when map loads
          setCurrentLocation(location);
        }
      } else {
      }
    };

    const handleCurrentLocation = (data) => {
      const location = parseSocketLocation(data);
      if (location) {
        lastLiveLocationUpdateAtRef.current = Date.now();
        setHasLiveSocketLocation(true);
        setCurrentLocation(location);
        setDeliveryBoyLocation(location);
        
        // RAPIDO-STYLE: Use route-based animation if progress is available
        if (isMapLoaded && mapInstance.current) {
          if (data.progress !== undefined && animationControllerRef.current && routePolylinePointsRef.current) {
            // Backend sent progress - use route-based animation
            animationControllerRef.current.updatePosition(data.progress, data.bearing || data.heading || 0);
          } else {
            // Fallback: Use moveBikeSmoothly (will use route-based if polyline available)
            moveBikeSmoothly(location.lat, location.lng, location.heading);
          }
        } else {
          // Store for when map loads
          setCurrentLocation(location);
        }
      } else {
      }
    };

    orderAliases.forEach((alias) => {
      socketRef.current.on(`location-receive-${alias}`, handleLocationUpdate);
      socketRef.current.on(`current-location-${alias}`, handleCurrentLocation);
    });
    
    // Listen for route initialization from backend
    socketRef.current.on(`route-initialized-${orderId}`, (data) => {
      if (data.points && Array.isArray(data.points) && data.points.length > 0) {
        routePolylinePointsRef.current = data.points;
        
        // Initialize animation controller if bike marker exists
        if (bikeMarkerRef.current && !animationControllerRef.current) {
          animationControllerRef.current = new RouteBasedAnimationController(
            bikeMarkerRef.current,
            data.points
          );
        } else if (animationControllerRef.current) {
          // Update existing controller with new polyline
          animationControllerRef.current.updatePolyline(data.points);
        }
      }
    });

    // Listen for order status updates (e.g., "Delivery partner on the way")
    socketRef.current.on('order_status_update', (data) => {
      console.log('Received order status update:', data);

      const incomingOrderId = data?.orderId ? String(data.orderId).trim() : '';
      if (incomingOrderId && !orderAliases.includes(incomingOrderId)) {
        return;
      }

      // Trigger custom event so OrderTracking component can handle notification
      // This avoids circular dependencies and keeps notification logic in OrderTracking
      if (window.dispatchEvent && data.message) {
        window.dispatchEvent(new CustomEvent('orderStatusNotification', {
          detail: {
            ...data,
            orderId: incomingOrderId || orderAliases[0]
          }
        }));
      }
    });

    return () => {
      if (socketRef.current) {
        // Clear location request interval if it exists
        if (socketRef.current._locationRequestInterval) {
          clearInterval(socketRef.current._locationRequestInterval);
        }
        orderAliases.forEach((alias) => {
          socketRef.current.off(`location-receive-${alias}`, handleLocationUpdate);
          socketRef.current.off(`current-location-${alias}`, handleCurrentLocation);
        });
        socketRef.current.off('order_status_update');
        socketRef.current.disconnect();
      }
    };
  }, [orderId, order?.orderId, order?._id, order?.id, backendUrl, moveBikeSmoothly, hasDeliveryPartner, parseSocketLocation]);

  // Prefer Firebase Realtime Database for route + live location updates.
  useEffect(() => {
    if (!orderId || !realtimeDb) return;

    const orderAliases = Array.from(
      new Set(
        [
          String(orderId || '').trim(),
          String(order?.orderId || '').trim(),
          String(order?._id || '').trim(),
          String(order?.id || '').trim()
        ].filter(Boolean)
      )
    );

    const unsubscribers = [];
    orderAliases.forEach((alias) => {
      const orderNodeRef = rtdbRef(realtimeDb, `active_orders/${alias}`);
      const unsubscribe = onValue(orderNodeRef, (snapshot) => {
        const value = snapshot.val();
        if (!value || typeof value !== 'object') return;

        const firebaseLastUpdated = Number(value?.last_updated || 0);
        const isFreshFirebaseStream =
          Number.isFinite(firebaseLastUpdated) &&
          (Date.now() - firebaseLastUpdated) <= 15000;
        activeFirebaseAliasRef.current = isFreshFirebaseStream ? alias : null;

        const isCustomerLeg =
          value?.status === 'en_route_to_delivery' ||
          value?.status === 'out_for_delivery' ||
          order?.status === 'out_for_delivery' ||
          order?.deliveryState?.currentPhase === 'en_route_to_delivery';
        isCustomerLegRef.current = isCustomerLeg;

        let points = [];
        if (Array.isArray(value.points) && value.points.length > 0) {
          points = value.points;
        } else if (typeof value.polyline === 'string' && value.polyline.trim()) {
          points = decodePolyline(value.polyline);
        }

        const customerLat = Number(value.customer_lat ?? value.user_lat);
        const customerLng = Number(value.customer_lng ?? value.user_lng);
        const restaurantLat = Number(value.restaurant_lat);
        const restaurantLng = Number(value.restaurant_lng);
        if (Number.isFinite(customerLat) && Number.isFinite(customerLng)) {
          setFirebaseCustomerCoords({ lat: customerLat, lng: customerLng });
        }

        const normalizePoint = (point) => {
          if (!point) return null;
          if (Array.isArray(point) && point.length >= 2) {
            const first = Number(point[0]);
            const second = Number(point[1]);
            if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
            if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
              return { lat: first, lng: second };
            }
            if (Math.abs(second) <= 90 && Math.abs(first) <= 180) {
              return { lat: second, lng: first };
            }
            return null;
          }
          const lat = Number(point.lat ?? point.latitude);
          const lng = Number(point.lng ?? point.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return { lat, lng };
        };

        const normalizedPoints = Array.isArray(points)
          ? points.map(normalizePoint).filter(Boolean)
          : [];

        const firebaseRestaurantCoords =
          Number.isFinite(restaurantLat) && Number.isFinite(restaurantLng)
            ? { lat: restaurantLat, lng: restaurantLng }
            : null;
        const firebaseCustomerCoordsValue =
          Number.isFinite(customerLat) && Number.isFinite(customerLng)
            ? { lat: customerLat, lng: customerLng }
            : null;
        const expectedDestination = isCustomerLeg
          ? (effectiveCustomerCoords || firebaseCustomerCoordsValue || null)
          : (firebaseRestaurantCoords || restaurantCoords || null);

        let pointsToRender = normalizedPoints;
        let canUseFirebaseRoute = pointsToRender.length > 1;
        if (canUseFirebaseRoute && expectedDestination) {
          const routeStart = pointsToRender[0];
          const routeEnd = pointsToRender[pointsToRender.length - 1];
          const endGap = calculateHaversineDistance(
            routeEnd.lat,
            routeEnd.lng,
            expectedDestination.lat,
            expectedDestination.lng
          );
          const startGap = calculateHaversineDistance(
            routeStart.lat,
            routeStart.lng,
            expectedDestination.lat,
            expectedDestination.lng
          );
          const maxEndpointGapMeters = 500;
          if (startGap < endGap && startGap <= maxEndpointGapMeters) {
            pointsToRender = [...pointsToRender].reverse();
            canUseFirebaseRoute = true;
          } else {
            canUseFirebaseRoute = endGap <= maxEndpointGapMeters;
          }
        }

        if (canUseFirebaseRoute) {
          hasFirebaseRouteRef.current = true;
          setHasFirebaseRoute(true);
          if (isMapLoaded) {
            renderPolylinePath(pointsToRender, isCustomerLeg);
          }
        } else {
          hasFirebaseRouteRef.current = false;
          setHasFirebaseRoute(false);
        }

        const lat = Number(value.boy_lat);
        const lng = Number(value.boy_lng);
        const heading = Number(value.bearing || 0);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const location = { lat, lng, heading: Number.isFinite(heading) ? heading : 0 };
          lastLiveLocationUpdateAtRef.current = Date.now();
          setHasLiveSocketLocation(true);
          setCurrentLocation(location);
          setDeliveryBoyLocation(location);

          if (isMapLoaded) {
            moveBikeSmoothly(location.lat, location.lng, location.heading);
          }
        }
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });
      hasFirebaseRouteRef.current = false;
      setHasFirebaseRoute(false);
      activeFirebaseAliasRef.current = null;
      setFirebaseCustomerCoords(null);
    };
  }, [
    orderId,
    order?.orderId,
    order?._id,
    order?.id,
    order?.status,
    order?.deliveryState?.currentPhase,
    effectiveCustomerCoords?.lat,
    effectiveCustomerCoords?.lng,
    restaurantCoords?.lat,
    restaurantCoords?.lng,
    isMapLoaded,
    moveBikeSmoothly,
    renderPolylinePath
  ]);

  // Initialize Google Map (only once - prevent re-initialization)
  useEffect(() => {
    if (!mapRef.current || !effectiveCustomerCoords || mapInitializedRef.current) return;

    const loadGoogleMapsIfNeeded = async () => {
      // Wait for Google Maps to load from main.jsx first
      if (!window.google || !window.google.maps) {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        while (!window.google && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        // If still not loaded, try loading it ourselves
        if (!window.google || !window.google.maps) {
          try {
            const { getGoogleMapsApiKey } = await import('@/lib/utils/googleMapsApiKey.js');
            const { Loader } = await import('@googlemaps/js-api-loader');
            const apiKey = await getGoogleMapsApiKey();
            if (apiKey) {
              const loader = new Loader({
                apiKey: apiKey,
                version: "weekly",
                libraries: ["places", "geometry", "drawing"]
              });
              await loader.load();
            } else {
              console.error('❌ No Google Maps API key found');
              return;
            }
          } catch (error) {
            console.error('❌ Error loading Google Maps:', error);
            return;
          }
        }
      }

      // Initialize map once Google Maps is loaded
      if (window.google && window.google.maps) {
        // Wait for MapTypeId to be available (sometimes it loads slightly after maps)
        let mapTypeIdAttempts = 0;
        const checkMapTypeId = () => {
          if (window.google?.maps?.MapTypeId) {
            initializeMap();
          } else if (mapTypeIdAttempts < 20) {
            mapTypeIdAttempts++;
            setTimeout(checkMapTypeId, 100);
          } else {
            // Use fallback - initialize with string instead of enum
            initializeMap();
          }
        };
        checkMapTypeId();
      } else {
        console.error('❌ Google Maps API still not available');
      }
    };

    loadGoogleMapsIfNeeded();

    function initializeMap() {
      try {
        // Verify Google Maps is fully loaded
        if (!window.google || !window.google.maps || !window.google.maps.Map) {
          console.error('❌ Google Maps API not fully loaded');
          return;
        }

        // Calculate center from available points (customer is required, restaurant/rider optional)
        const centerCandidates = [
          effectiveCustomerCoords,
          restaurantCoords,
          deliveryBoyLocation,
          currentLocation
        ].filter(
          (point) =>
            point &&
            typeof point.lat === 'number' &&
            typeof point.lng === 'number'
        );
        const centerLng =
          centerCandidates.reduce((sum, point) => sum + point.lng, 0) / centerCandidates.length;
        const centerLat =
          centerCandidates.reduce((sum, point) => sum + point.lat, 0) / centerCandidates.length;

        // Get MapTypeId safely
        const mapTypeId = window.google.maps.MapTypeId?.ROADMAP || 'roadmap';

        // Initialize map - center between user and restaurant, stable view
        mapInstance.current = new window.google.maps.Map(mapRef.current, {
          center: { lat: centerLat, lng: centerLng },
          zoom: 15,
          mapTypeId: mapTypeId,
          tilt: 0, // Flat 2D view for stability
          heading: 0,
          mapTypeControl: false, // Hide Map/Satellite selector
          fullscreenControl: false, // Hide fullscreen button
          streetViewControl: false, // Hide street view control
          zoomControl: false, // Hide zoom controls
          disableDefaultUI: true, // Hide all default UI controls
          gestureHandling: 'greedy', // Allow hand gestures for zoom and pan
          // Prevent automatic viewport changes
          restriction: null,
          // Keep map stable - no auto-fit bounds
          noClear: false,
          // Hide all default labels, POIs, and location markers
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi',
              elementType: 'geometry',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.business',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.attraction',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.place_of_worship',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.school',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.sports_complex',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit.station',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative.locality',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative.neighborhood',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative.land_parcel',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'road',
              elementType: 'labels.text',
              stylers: [{ visibility: 'on' }] // Keep road numbers visible
            },
            {
              featureType: 'road',
              elementType: 'labels.icon',
              stylers: [{ visibility: 'on' }] // Keep road icons visible
            }
          ]
        });

        // Track user interaction to prevent automatic zoom/pan interference
        mapInstance.current.addListener('dragstart', () => {
          userHasInteractedRef.current = true;
        });

        mapInstance.current.addListener('zoom_changed', () => {
          if (!isProgrammaticChangeRef.current) {
            userHasInteractedRef.current = true;
          }
        });

        // Add restaurant marker with home icon (only once, when coordinates exist)
        if (!mapInstance.current._restaurantMarker && restaurantCoords && typeof restaurantCoords.lat === 'number' && typeof restaurantCoords.lng === 'number') {
          const restaurantHomeIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
              <!-- Pin shape -->
              <path d="M20 0 C9 0 0 9 0 20 C0 35 20 50 20 50 C20 50 40 35 40 20 C40 9 31 0 20 0 Z" fill="#22c55e" stroke="#ffffff" stroke-width="2"/>
              <!-- Home icon -->
              <path d="M20 12 L12 18 L12 28 L16 28 L16 24 L24 24 L24 28 L28 28 L28 18 Z" fill="white" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16 24 L16 20 L20 17 L24 20 L24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `);
          
          mapInstance.current._restaurantMarker = new window.google.maps.Marker({
            position: { lat: restaurantCoords.lat, lng: restaurantCoords.lng },
            map: mapInstance.current,
            icon: {
              url: restaurantHomeIconUrl,
              scaledSize: new window.google.maps.Size(40, 50),
              anchor: new window.google.maps.Point(20, 50),
              origin: new window.google.maps.Point(0, 0)
            },
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 1
          });
        }

        // Add customer marker with clean user pin icon (MoFood-style)
        if (!mapInstance.current._customerMarker) {
          const customerUserPinIconUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
              <!-- Pin shape -->
              <path d="M18 0 C8.06 0 0 8.06 0 18 C0 30.5 18 46 18 46 C18 46 36 30.5 36 18 C36 8.06 27.94 0 18 0 Z" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
              <!-- User icon -->
              <circle cx="18" cy="14" r="4.2" fill="white"/>
              <path d="M10.5 24 C11.8 20.6 14.6 18.8 18 18.8 C21.4 18.8 24.2 20.6 25.5 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
            </svg>
          `);
          
          mapInstance.current._customerMarker = new window.google.maps.Marker({
            position: { lat: effectiveCustomerCoords.lat, lng: effectiveCustomerCoords.lng },
            map: mapInstance.current,
            icon: {
              url: customerUserPinIconUrl,
              scaledSize: new window.google.maps.Size(36, 46),
              anchor: new window.google.maps.Point(18, 46),
              origin: new window.google.maps.Point(0, 0)
            },
            zIndex: window.google.maps.Marker.MAX_ZINDEX + 1
          });
        } else {
          mapInstance.current._customerMarker.setPosition({
            lat: effectiveCustomerCoords.lat,
            lng: effectiveCustomerCoords.lng
          });
        }
        // Draw route based on order phase
        mapInstance.current.addListener('tilesloaded', () => {
          setIsMapLoaded(true);
          
          // Hide Google Maps footer elements (Keyboard shortcuts, Map data, Terms)
          const hideGoogleFooter = () => {
            const footerElements = mapRef.current?.querySelectorAll?.('.gm-style-cc, a[href*="keyboard"], a[href*="terms"]');
            footerElements?.forEach(el => {
              if (el instanceof HTMLElement) {
                el.style.display = 'none';
              }
            });
          };
          
          // Hide immediately and also set interval to catch dynamically added elements
          hideGoogleFooter();
          const footerHideInterval = setInterval(() => {
            hideGoogleFooter();
          }, 500);
          
          // Clear interval after 5 seconds
          setTimeout(() => clearInterval(footerHideInterval), 5000);
          
          // Check if delivery partner is assigned and show bike immediately
          const currentPhase = order?.deliveryState?.currentPhase;
          const deliveryStateStatus = order?.deliveryState?.status;
          const hasDeliveryPartnerOnLoad = currentPhase === 'en_route_to_pickup' || 
                                    currentPhase === 'at_pickup' || 
                                    currentPhase === 'en_route_to_delivery' ||
                                    deliveryStateStatus === 'accepted' ||
                                    (deliveryStateStatus && deliveryStateStatus !== 'pending');
          
          console.log('🚴 Map tiles loaded - Checking for delivery partner:', {
            currentPhase,
            deliveryStateStatus,
            hasDeliveryPartnerOnLoad,
            hasBikeMarker: !!bikeMarkerRef.current
          });
          
          // DO NOT create bike at restaurant on map load
          // Wait for real location from socket - bike will be created when real location is received
          if (hasDeliveryPartnerOnLoad && !bikeMarkerRef.current) {
            console.log('🚴 Map loaded - Delivery partner detected, waiting for REAL location from socket...');
            // Request current location immediately
            if (socketRef.current && socketRef.current.connected && hasDeliveryPartner) {
              socketRef.current.emit('request-current-location', orderId);
            }
            // Don't create bike at restaurant - wait for real location
          }
          
          // DO NOT draw default route - only draw when delivery partner is assigned
          // Route will be drawn when delivery partner accepts or when location updates arrive
        });

        mapInitializedRef.current = true; // Mark map as initialized
      } catch (error) {
        console.error('❌ Map initialization error:', error);
      }
    }
  }, [restaurantCoords, effectiveCustomerCoords]); // Removed dependencies that cause re-initialization

  // Memoize restaurant and customer coordinates to avoid dependency issues
  const restaurantLat = restaurantCoords?.lat;
  const restaurantLng = restaurantCoords?.lng;
  const deliveryBoyLat = deliveryBoyLocation?.lat;
  const deliveryBoyLng = deliveryBoyLocation?.lng;
  const deliveryBoyHeading = deliveryBoyLocation?.heading;
  const currentLat = currentLocation?.lat;
  const currentLng = currentLocation?.lng;

  // Keep customer marker pinned to saved order destination (Firebase coords preferred).
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current || !effectiveCustomerCoords) return;
    if (mapInstance.current._customerMarker) {
      mapInstance.current._customerMarker.setPosition({
        lat: effectiveCustomerCoords.lat,
        lng: effectiveCustomerCoords.lng
      });
    }
  }, [isMapLoaded, effectiveCustomerCoords?.lat, effectiveCustomerCoords?.lng]);

  // Update route when delivery boy location or order phase changes
  useEffect(() => {
    if (!isMapLoaded) return;
    
    // Check if delivery partner is assigned based on phase
    const currentPhase = order?.deliveryState?.currentPhase;
    const hasDeliveryPartnerByPhase = currentPhase === 'en_route_to_pickup' || 
                                     currentPhase === 'at_pickup' || 
                                     currentPhase === 'en_route_to_delivery';
    
    // If delivery partner is assigned but bike marker doesn't exist, create it
    if (hasDeliveryPartnerByPhase && !bikeMarkerRef.current && mapInstance.current) {
      console.log('🚴 Delivery partner detected by phase, creating bike marker:', currentPhase);
      // DO NOT show bike at restaurant - wait for real location from socket
      // Bike will be created when real location is received via socket
      if (socketRef.current && socketRef.current.connected && hasDeliveryPartner) {
        socketRef.current.emit('request-current-location', orderId);
      }
    }
    
    // Throttle route updates to avoid too many API calls
    const now = Date.now();
    if (lastRouteUpdateRef.current && (now - lastRouteUpdateRef.current) < ROUTE_RECALC_MIN_INTERVAL_MS) {
      return; // Skip if updated less than 10 seconds ago
    }
    
    // Prefer route geometry already stored in order payload before interpolation fallback.
    if (!hasFirebaseRouteRef.current && !hasFirebaseRoute) {
      const orderStoredRoute = getOrderStoredRoutePoints();
      if (orderStoredRoute?.points?.length > 1) {
        renderPolylinePath(orderStoredRoute.points, orderStoredRoute.isCustomerLeg);
        return;
      }
    }

    // Draw route when route endpoints are valid for the current phase.
    // Skip Google Directions if Firebase already has route polyline for this order.
    if (hasFirebaseRouteRef.current || hasFirebaseRoute) {
      return;
    }

    const routePhase = order?.deliveryState?.currentPhase;
    const routeStatus = order?.deliveryState?.status;
    
    const isCustomerLeg =
      routePhase === 'en_route_to_delivery' ||
      routeStatus === 'order_confirmed' ||
      routeStatus === 'en_route_to_delivery' ||
      order?.status === 'out_for_delivery';
    isCustomerLegRef.current = isCustomerLeg;

    const route = getRouteToShow();
    if (!route.start || !route.end) {
      // Keep the previously drawn route during transient location/state gaps.
      // This prevents rider->customer polyline flicker/disappearance while zooming/refreshing.
      return;
    }
    if (route.start && route.end) {
      lastRouteUpdateRef.current = now;
      drawRoute(route.start, route.end);
      console.log('🔄 Route updated:', {
        phase: order?.deliveryState?.currentPhase,
        status: order?.deliveryState?.status,
        from: route.start,
        to: route.end,
        hasBikeMarker: !!bikeMarkerRef.current
      });
      
      // Force show bike if delivery partner is assigned but bike marker doesn't exist
      if (hasDeliveryPartnerByPhase && !bikeMarkerRef.current && mapInstance.current) {
        console.log('🚴🚴🚴 FORCING bike marker creation after route update!', {
          phase: currentPhase,
          routeStart: route.start,
          routeEnd: route.end,
          restaurantCoords
        });
        
        // ONLY use real delivery boy location - NEVER use restaurant
        // Priority 1: Use delivery boy's REAL location from socket/state
        if (deliveryBoyLat && deliveryBoyLng) {
          moveBikeSmoothly(deliveryBoyLat, deliveryBoyLng, deliveryBoyHeading || 0);
        }
        // Priority 2: Use route start ONLY if it's the delivery boy's location (not restaurant)
        else if (route.start && route.start.lat && route.start.lng) {
          // Only use route.start if we don't have delivery boy location
          // But request real location from socket first
          if (socketRef.current && socketRef.current.connected && hasDeliveryPartner) {
            socketRef.current.emit('request-current-location', orderId);
          }
          moveBikeSmoothly(route.start.lat, route.start.lng, 0);
        }
        // DO NOT use restaurant or customer location - wait for real location
        else {
          if (socketRef.current && socketRef.current.connected && hasDeliveryPartner) {
            socketRef.current.emit('request-current-location', orderId);
          }
        }
      }
    }
  }, [isMapLoaded, deliveryBoyLat, deliveryBoyLng, currentLat, currentLng, order?.deliveryState?.currentPhase, order?.deliveryState?.status, restaurantLat, restaurantLng, effectiveCustomerCoords?.lat, effectiveCustomerCoords?.lng, moveBikeSmoothly, getRouteToShow, drawRoute, hasDeliveryPartner, hasFirebaseRoute, getOrderStoredRoutePoints, renderPolylinePath]);

  // Update bike when REAL location changes (from socket)
  useEffect(() => {
    if (isMapLoaded && currentLocation && currentLocation.lat && currentLocation.lng) {
      // Always update to real location - this takes priority over restaurant location
      moveBikeSmoothly(currentLocation.lat, currentLocation.lng, currentLocation.heading || 0);
    }
  }, [isMapLoaded, currentLocation?.lat, currentLocation?.lng, currentLocation?.heading, moveBikeSmoothly]);

  // Create bike marker when map loads if we have stored location
  useEffect(() => {
    if (isMapLoaded && mapInstance.current && currentLocation && !bikeMarkerRef.current) {
      moveBikeSmoothly(currentLocation.lat, currentLocation.lng, currentLocation.heading || 0);
    }
  }, [isMapLoaded, currentLocation, moveBikeSmoothly]);

  // Show bike marker when delivery partner is assigned (even without location yet)
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current) {
      return;
    }
    
    const currentPhase = order?.deliveryState?.currentPhase;
    const deliveryStateStatus = order?.deliveryState?.status;
    const shouldShowBike = hasDeliveryPartner || (Number.isFinite(Number(deliveryBoyLat)) && Number.isFinite(Number(deliveryBoyLng)));
    
    console.log('🚴🚴🚴 BIKE VISIBILITY CHECK:', {
      shouldShowBike,
      hasDeliveryPartner,
      deliveryStateStatus,
      currentPhase,
      hasBikeMarker: !!bikeMarkerRef.current
    });
    
    console.log('🔍 Checking delivery partner assignment:', {
      hasDeliveryPartner,
      shouldShowBike,
      currentPhase,
      deliveryStateStatus,
      deliveryPartnerId: order?.deliveryPartnerId,
      deliveryPartner: order?.deliveryPartner,
      assignmentInfo: order?.assignmentInfo,
      deliveryState: order?.deliveryState,
      hasBikeMarker: !!bikeMarkerRef.current,
      deliveryBoyLocation: { lat: deliveryBoyLat, lng: deliveryBoyLng, heading: deliveryBoyHeading },
      restaurantCoords: { lat: restaurantLat, lng: restaurantLng },
      mapInstance: !!mapInstance.current,
      isMapLoaded
    });
    
    if (shouldShowBike && !bikeMarkerRef.current) {
      console.log('🚴🚴🚴 CREATING BIKE MARKER - Delivery partner accepted!');
      console.log('🚴 Full order state:', JSON.stringify(order?.deliveryState, null, 2));
      
      // Priority 1: ALWAYS use delivery boy's REAL location if available (from socket)
      if (deliveryBoyLat && deliveryBoyLng) {
        moveBikeSmoothly(deliveryBoyLat, deliveryBoyLng, deliveryBoyHeading || 0);
      } 
      // Priority 2: DO NOT show at restaurant - ONLY wait for real location from socket
      // Bike should ONLY show at real delivery boy location, NEVER at restaurant
      else if (restaurantLat && restaurantLng) {
        // Request location immediately
        if (socketRef.current && socketRef.current.connected && hasDeliveryPartner) {
          socketRef.current.emit('request-current-location', orderId);
        }
        // DO NOT show at restaurant - only wait for real location
        // Real location will come via socket and bike will be created then
      } 
      else {
        console.error('❌ Cannot create bike marker - no coordinates available!', {
          restaurantCoords,
          customerCoords,
          deliveryBoyLocation
        });
      }
      
      // Verify marker was created after a short delay
      setTimeout(() => {
        if (bikeMarkerRef.current) {
          const marker = bikeMarkerRef.current;
          const markerPosition = marker.getPosition();
          const markerVisible = marker.getVisible();
          const markerMap = marker.getMap();
          
          console.log('✅✅✅ BIKE MARKER VERIFICATION:', {
            exists: true,
            visible: markerVisible,
            onMap: !!markerMap,
            position: markerPosition ? { 
              lat: markerPosition.lat(), 
              lng: markerPosition.lng() 
            } : null,
            iconUrl: bikeLogo
          });
          
          // Force visibility if needed
          if (!markerVisible) {
            marker.setVisible(true);
          }
          if (!markerMap) {
            marker.setMap(mapInstance.current);
          }
        } else {
          // Don't create fallback at restaurant - wait for real location
          // Real location will come via socket and bike will be created in moveBikeSmoothly
          if (socketRef.current && socketRef.current.connected && hasDeliveryPartner) {
            socketRef.current.emit('request-current-location', orderId);
            console.log('📡 Requested current location from socket for bike marker');
          }
        }
      }, 500);
    } else if (shouldShowBike && bikeMarkerRef.current) {
      // Bike marker exists, just update position if needed
      if (deliveryBoyLat && deliveryBoyLng) {
        moveBikeSmoothly(deliveryBoyLat, deliveryBoyLng, deliveryBoyHeading || 0);
      }
    } else {
      // Remove bike marker if delivery partner is not assigned
      if (bikeMarkerRef.current) {
        console.log('🗑️ Removing bike marker - no delivery partner');
        bikeMarkerRef.current.setMap(null);
        bikeMarkerRef.current = null;
      }
    }
  }, [isMapLoaded, hasDeliveryPartner, deliveryBoyLat, deliveryBoyLng, deliveryBoyHeading, restaurantLat, restaurantLng, moveBikeSmoothly, order]);

  // Emit live rider-to-destination distance for OrderTracking UI.
  // Destination must always be the order delivery address.
  useEffect(() => {
    if (!window?.dispatchEvent) return;
    if (!hasLiveSocketLocation) return;

    const riderLat = deliveryBoyLocation?.lat ?? currentLocation?.lat;
    const riderLng = deliveryBoyLocation?.lng ?? currentLocation?.lng;
    const targetLat = effectiveCustomerCoords?.lat;
    const targetLng = effectiveCustomerCoords?.lng;

    if (
      typeof riderLat !== 'number' || Number.isNaN(riderLat) ||
      typeof riderLng !== 'number' || Number.isNaN(riderLng) ||
      typeof targetLat !== 'number' || Number.isNaN(targetLat) ||
      typeof targetLng !== 'number' || Number.isNaN(targetLng)
    ) {
      return;
    }

    const distanceMeters = calculateHaversineDistance(riderLat, riderLng, targetLat, targetLng);
    const distanceKm = distanceMeters / 1000;

    window.dispatchEvent(new CustomEvent('driverDistanceUpdate', {
      detail: {
        orderId,
        distanceMeters,
        distanceKm,
        source: 'order-address'
      }
    }));
  }, [
    orderId,
    hasLiveSocketLocation,
    deliveryBoyLocation?.lat,
    deliveryBoyLocation?.lng,
    currentLocation?.lat,
    currentLocation?.lng,
    effectiveCustomerCoords?.lat,
    effectiveCustomerCoords?.lng
  ]);

  // Periodic check to ensure bike marker is created if it should be visible
  // DISABLED - prevents duplicate marker creation
  // useEffect(() => {
  //   if (!isMapLoaded || !mapInstance.current) return;
  //   
  //   const checkInterval = setInterval(() => {
  //     const currentPhase = order?.deliveryState?.currentPhase;
  //     const deliveryStateStatus = order?.deliveryState?.status;
  //     const shouldHaveBike = deliveryStateStatus === 'accepted' ||
  //                            currentPhase === 'en_route_to_pickup' ||
  //                            currentPhase === 'at_pickup' ||
  //                            currentPhase === 'en_route_to_delivery' ||
  //                            (deliveryStateStatus && deliveryStateStatus !== 'pending');
  //     
  //     if (shouldHaveBike && !bikeMarkerRef.current && restaurantCoords && restaurantCoords.lat && restaurantCoords.lng) {
  //       console.log('🔄 Periodic check: Bike should be visible but missing, creating now...');
  //       try {
  //         const position = new window.google.maps.LatLng(restaurantCoords.lat, restaurantCoords.lng);
  //         bikeMarkerRef.current = new window.google.maps.Marker({
  //           position: position,
  //           map: mapInstance.current,
  //           icon: {
  //             url: bikeLogo,
  //             scaledSize: new window.google.maps.Size(50, 50),
  //             anchor: new window.google.maps.Point(25, 25),
  //             rotation: 0
  //           },
  //           optimized: false,
  //           zIndex: window.google.maps.Marker.MAX_ZINDEX + 3,
  //           title: 'Delivery Partner',
  //           visible: true
  //         });
  //         console.log('✅✅✅ BIKE MARKER CREATED via periodic check!');
  //       } catch (err) {
  //         console.error('❌ Periodic bike creation failed:', err);
  //       }
  //     }
  //   }, 2000); // Check every 2 seconds
  //   
  //   return () => clearInterval(checkInterval);
  // }, [isMapLoaded, order?.deliveryState?.currentPhase, order?.deliveryState?.status, restaurantCoords, bikeLogo]);

  // Cleanup animation controller on unmount
  useEffect(() => {
    return () => {
      if (animationControllerRef.current) {
        animationControllerRef.current.destroy();
        animationControllerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="delivery-tracking-map" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default DeliveryTrackingMap;


