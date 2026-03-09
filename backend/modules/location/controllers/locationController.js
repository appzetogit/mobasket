import axios from 'axios';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const reverseGeocodeCache = new Map(); // key -> { payload, expiresAt }
const nearbyLocationsCache = new Map(); // key -> { payload, expiresAt }
const REVERSE_GEOCODE_CACHE_TTL_MS = 15 * 60 * 1000;
const NEARBY_LOCATIONS_CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_COORD_PRECISION = 4; // ~11m precision
const MAX_LOCATION_CACHE_ENTRIES = 2000;

function normalizeAddressText(value) {
  return String(value || '').trim().replace(/,\s*India$/i, '').trim();
}

function hasLikelyCompleteAddress({ formattedAddress = '', area = '', postalCode = '' } = {}) {
  const normalized = normalizeAddressText(formattedAddress);
  const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  const hasPin = /\b\d{6}\b/.test(normalized) || Boolean(normalizeAddressText(postalCode));
  const hasArea = Boolean(normalizeAddressText(area)) &&
    !/district|division|zone/i.test(normalizeAddressText(area));
  return normalized && parts.length >= 4 && (hasPin || hasArea);
}

function pickGoogleGeocodeResult(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const ranked = [...results].sort((a, b) => {
    const score = (entry) => {
      const types = entry?.types || [];
      let value = 0;
      if (types.includes('street_address')) value += 6;
      if (types.includes('premise')) value += 5;
      if (types.includes('subpremise')) value += 4;
      if (types.includes('route')) value += 3;
      if (types.includes('plus_code')) value += 1;
      return value;
    };
    return score(b) - score(a);
  });
  return ranked[0] || results[0] || null;
}

function toProcessedResultFromGoogle(result, latNum, lngNum) {
  const components = Array.isArray(result?.address_components) ? result.address_components : [];
  const byType = (types) => components.find((component) =>
    (component?.types || []).some((type) => types.includes(type))
  );

  const streetNumber = byType(['street_number'])?.long_name || '';
  const route = byType(['route'])?.long_name || '';
  const premise = byType(['premise', 'subpremise'])?.long_name || '';
  const neighborhood = byType(['sublocality_level_1', 'sublocality', 'neighborhood'])?.long_name || '';
  const city = byType(['locality', 'administrative_area_level_2'])?.long_name || '';
  const state = byType(['administrative_area_level_1'])?.long_name || '';
  const country = byType(['country'])?.long_name || '';
  const postalCode = byType(['postal_code'])?.long_name || '';

  const street = [streetNumber, route].filter(Boolean).join(' ').trim() || route || premise || neighborhood || '';
  const area = neighborhood || premise || route || '';
  const formattedAddress = normalizeAddressText(result?.formatted_address || '');

  return {
    formatted_address: formattedAddress || `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
    address_components: {
      city,
      state,
      country,
      area,
      street,
      streetNumber,
      pincode: postalCode,
      postalCode
    },
    geometry: result?.geometry || {
      location: {
        lat: latNum,
        lng: lngNum
      }
    }
  };
}

function buildLocationCacheKey(lat, lng, radius = null, query = '') {
  const round = (value) => Number.parseFloat(value).toFixed(CACHE_COORD_PRECISION);
  if (radius === null) {
    return `${round(lat)},${round(lng)}`;
  }
  return `${round(lat)},${round(lng)}|r:${Math.round(Number.parseFloat(radius) || 0)}|q:${String(query || '').trim().toLowerCase()}`;
}

function getCachedResponse(cacheStore, key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return entry.payload;
}

function setCachedResponse(cacheStore, key, payload, ttlMs) {
  cacheStore.set(key, {
    payload,
    expiresAt: Date.now() + ttlMs
  });

  while (cacheStore.size > MAX_LOCATION_CACHE_ENTRIES) {
    const oldestKey = cacheStore.keys().next().value;
    cacheStore.delete(oldestKey);
  }
}

/**
 * Reverse geocode coordinates to address using OLA Maps API
 */
export const reverseGeocode = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude'
      });
    }

    const cacheKey = buildLocationCacheKey(latNum, lngNum);
    const cachedPayload = getCachedResponse(reverseGeocodeCache, cacheKey);
    if (cachedPayload) {
      return res.json(cachedPayload);
    }

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      if (payload && payload.success === true) {
        setCachedResponse(reverseGeocodeCache, cacheKey, payload, REVERSE_GEOCODE_CACHE_TTL_MS);
      }
      return originalJson(payload);
    };

    const apiKey = process.env.OLA_MAPS_API_KEY;
    const projectId = process.env.OLA_MAPS_PROJECT_ID;
    const clientId = process.env.OLA_MAPS_CLIENT_ID;
    const clientSecret = process.env.OLA_MAPS_CLIENT_SECRET;

    try {
      let response = null;
      let lastError = null;
      let olaRateLimited = false;

      // Only try OLA Maps if API key is configured
      if (apiKey) {
        // Try Method 1a: API Key with latlng combined format (user's example format)
        // This matches the exact format from Ola Maps documentation
        try {
          const requestId = Date.now().toString();
          const url = `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${latNum},${lngNum}&api_key=${apiKey}`;
          
          response = await axios.get(url, {
            headers: {
              'X-Request-Id': requestId, // Unique ID for tracking
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 10000 // 10 seconds timeout
          });
          
          logger.info('OLA Maps reverse geocode successful (latlng format)', {
            lat: latNum,
            lng: lngNum,
            responseKeys: response.data ? Object.keys(response.data) : [],
            hasResults: !!(response.data?.results),
            resultsLength: response.data?.results?.length || 0
          });
          
          // Log first result for debugging
          if (response.data?.results?.[0]) {
            logger.info('OLA Maps first result:', {
              formatted_address: response.data.results[0].formatted_address,
              hasAddressComponents: !!response.data.results[0].address_components
            });
          }
        } catch (err1a) {
          lastError = err1a;
          if (err1a?.response?.status === 429) {
            olaRateLimited = true;
          }
          logger.warn('OLA Maps Method 1a failed:', {
            error: err1a.message,
            status: err1a.response?.status,
            data: err1a.response?.data
          });
          response = null;
          
          // Try Method 1b: API Key as query parameter (separate lat/lng)
          try {
            if (olaRateLimited) {
              throw new Error('OLA reverse geocode rate limited');
            }
            response = await axios.get(
              'https://api.olamaps.io/places/v1/reverse-geocode',
              {
                params: { 
                  lat: latNum, 
                  lng: lngNum,
                  key: apiKey,
                  // Add parameters for detailed response
                  include_sublocality: true,
                  include_neighborhood: true
                },
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'X-Request-Id': Date.now().toString()
                },
                timeout: 10000 // 10 seconds timeout
              }
            );
            logger.info('OLA Maps reverse geocode successful (query param)', {
              lat: latNum,
              lng: lngNum,
              responseKeys: response.data ? Object.keys(response.data) : []
            });
          } catch (err1b) {
            lastError = err1b;
            if (err1b?.response?.status === 429) {
              olaRateLimited = true;
            }
            response = null;
          }
        }
        
        // Try Method 2: Bearer token with project headers
        if (!response && !olaRateLimited) {
          try {
            const headers = {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'X-Request-Id': Date.now().toString()
            };
            
            if (projectId) {
              headers['X-Project-ID'] = projectId;
            }
            if (clientId) {
              headers['X-Client-ID'] = clientId;
            }

            response = await axios.get(
              'https://api.olamaps.io/places/v1/reverse-geocode',
              {
                params: { lat: latNum, lng: lngNum },
                headers,
                timeout: 10000 // 10 seconds timeout
              }
            );
            logger.info('OLA Maps reverse geocode successful (bearer token)', {
              lat: latNum,
              lng: lngNum
            });
          } catch (err2) {
            lastError = err2;
            if (err2?.response?.status === 429) {
              olaRateLimited = true;
            }
            response = null;
          }
        }
        
        // Try Method 3: API Key in X-API-Key header
        if (!response && !olaRateLimited) {
          try {
            response = await axios.get(
              'https://api.olamaps.io/places/v1/reverse-geocode',
              {
                params: { lat: latNum, lng: lngNum },
                headers: {
                  'X-API-Key': apiKey,
                  'Content-Type': 'application/json',
                  'X-Request-Id': Date.now().toString()
                },
                timeout: 10000 // 10 seconds timeout
              }
            );
            logger.info('OLA Maps reverse geocode successful (header)', {
              lat: latNum,
              lng: lngNum
            });
          } catch (err3) {
            lastError = err3;
            if (err3?.response?.status === 429) {
              olaRateLimited = true;
            }
            response = null;
          }
        }
      } else {
        // OLA Maps API key not configured, skip to fallback
        logger.warn('OLA_MAPS_API_KEY not configured, using fallback service');
      }
      
      // All OLA Maps methods failed or not configured, use fallback
      if (!response) {
        try {
          logger.warn('All OLA Maps authentication methods failed, using fallback service', {
            error: lastError?.message || 'All methods failed',
            status: lastError?.response?.status
          });
          
          try {
              // Cost-optimized fallback: use BigDataCloud only (no Google Geocoding fallback).
              let fallbackResponse = null;
              fallbackResponse = await axios.get(
                `https://api.bigdatacloud.net/data/reverse-geocode-client`,
                {
                  params: {
                    latitude: latNum,
                    longitude: lngNum,
                    localityLanguage: 'en'
                  },
                  timeout: 5000 // Reduced timeout to 5 seconds
                }
              );

              // Transform fallback response to match expected format
              const fallbackData = fallbackResponse.data;
              
              // Extract sublocality/area from bigdatacloud response
              // bigdatacloud provides localityInfo.administrative array with different levels
              let area = "";
              if (fallbackData.localityInfo?.administrative) {
                // Find sublocality (usually at index 2 or 3, not state which is at 1)
                const adminLevels = fallbackData.localityInfo.administrative;
                // Level 1 is usually state, level 2+ might be district/city, level 3+ is sublocality
                for (let i = 2; i < adminLevels.length && i < 5; i++) {
                  const level = adminLevels[i];
                  if (level?.name && 
                      level.name !== fallbackData.principalSubdivision && 
                      level.name !== fallbackData.city &&
                      level.name !== fallbackData.locality) {
                    area = level.name;
                    break;
                  }
                }
                // If no area found, try subLocality field directly
                if (!area && fallbackData.subLocality) {
                  area = fallbackData.subLocality;
                }
              }
              
              // Build formatted address with area if available
              let formattedAddress = fallbackData.formattedAddress;
              if (!formattedAddress) {
                const parts = [];
                if (area) parts.push(area);
                if (fallbackData.locality || fallbackData.city) parts.push(fallbackData.locality || fallbackData.city);
                if (fallbackData.principalSubdivision) parts.push(fallbackData.principalSubdivision);
                formattedAddress = parts.join(', ');
              }
              
              const transformedData = {
                results: [{
                  formatted_address: formattedAddress,
                  address_components: {
                    city: fallbackData.city || fallbackData.locality,
                    state: fallbackData.principalSubdivision || fallbackData.administrativeArea,
                    country: fallbackData.countryName,
                    area: area || "" // Use extracted area, not state!
                  },
                  geometry: {
                    location: {
                      lat: latNum,
                      lng: lngNum
                    }
                  }
                }]
              };

              return res.json({
                success: true,
                data: transformedData,
                source: 'fallback'
              });
            } catch (fallbackError) {
              // Even fallback failed, return minimal data
              logger.error('Fallback geocoding also failed', {
                error: fallbackError.message
              });
              
              const minimalData = {
                results: [{
                  formatted_address: `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
                  address_components: {
                    city: 'Current Location',
                    state: '',
                    country: '',
                    area: ''
                  },
                  geometry: {
                    location: {
                      lat: latNum,
                      lng: lngNum
                    }
                  }
                }]
              };

            return res.json({
              success: true,
              data: minimalData,
              source: 'coordinates_only'
            });
          }
        } catch (fallbackOuterError) {
          // Outer fallback error handler
          logger.error('Outer fallback error', {
            error: fallbackOuterError.message
          });
          
          const minimalData = {
            results: [{
              formatted_address: `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
              address_components: {
                city: 'Current Location',
                state: '',
                country: '',
                area: ''
              },
              geometry: {
                location: {
                  lat: latNum,
                  lng: lngNum
                }
              }
            }]
          };

          return res.json({
            success: true,
            data: minimalData,
            source: 'coordinates_only'
          });
        }
      }

      // Only return OLA Maps response if we have one
      if (response && response.data) {
        // Log OLA Maps response for debugging
        logger.info('OLA Maps raw response structure:', {
          hasResults: !!response.data.results,
          hasResult: !!response.data.result,
          keys: Object.keys(response.data)
        });
        
        // OLA Maps API might return data in different structures
        // Process and normalize the response to extract sublocality/area
        let olaData = response.data;
        let processedData = olaData;
        
        // If OLA Maps returns results array, process it
        if (olaData.results && Array.isArray(olaData.results) && olaData.results.length > 0) {
          const firstResult = olaData.results[0];
          
          // Check if it has address_components array (Google Maps style)
          if (firstResult.address_components && Array.isArray(firstResult.address_components)) {
            let area = "";
            let city = "";
            let state = "";
            let country = "";
            let street = "";
            let streetNumber = "";
            let postalCode = "";
            let formattedAddress = firstResult.formatted_address || "";
            
            // Extract from address_components array
            firstResult.address_components.forEach(comp => {
              const types = comp.types || [];
              if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
                area = comp.long_name || comp.short_name || "";
              } else if (types.includes('neighborhood') && !area) {
                area = comp.long_name || comp.short_name || "";
              } else if (types.includes('street_number')) {
                streetNumber = comp.long_name || comp.short_name || "";
              } else if (types.includes('route')) {
                street = comp.long_name || comp.short_name || "";
              } else if ((types.includes('premise') || types.includes('subpremise')) && !street) {
                street = comp.long_name || comp.short_name || "";
              } else if (types.includes('locality')) {
                city = comp.long_name || comp.short_name || "";
              } else if (types.includes('administrative_area_level_2') && !city) {
                city = comp.long_name || comp.short_name || "";
              } else if (types.includes('administrative_area_level_1')) {
                state = comp.long_name || comp.short_name || "";
              } else if (types.includes('country')) {
                country = comp.long_name || comp.short_name || "";
              } else if (types.includes('postal_code')) {
                postalCode = comp.long_name || comp.short_name || "";
              }
            });
            
            // If no sublocality found, try other levels
            if (!area) {
              const sublocality = firstResult.address_components.find(c => {
                const types = c.types || [];
                return types.includes('sublocality_level_2') || 
                       types.includes('sublocality_level_3') ||
                       (types.includes('political') && 
                        !types.includes('administrative_area_level_1') &&
                        !types.includes('locality') &&
                        !types.includes('country'));
              });
              if (sublocality) {
                area = sublocality.long_name || sublocality.short_name || "";
              }
            }
            
            // Reject generic area names
            if (area && (
                area.toLowerCase().includes('district') ||
                area.toLowerCase() === (state || "").toLowerCase() ||
                area.toLowerCase() === (city || "").toLowerCase()
              )) {
              area = "";
            }
            
            // If still no area, try to extract from formatted_address
            // This is CRITICAL for Indian addresses where area is in formatted_address
            if (!area && formattedAddress) {
              const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0);
              logger.info('Extracting area from formatted_address', { parts, city, state });
              
              if (parts.length >= 3) {
                // Format: "New Palasia, Indore, Madhya Pradesh"
                const potentialArea = parts[0];
                const cityPart = parts[1] || city;
                const statePart = parts[2] || state;
                
                if (potentialArea && 
                    potentialArea.toLowerCase() !== (cityPart || "").toLowerCase() &&
                    potentialArea.toLowerCase() !== (statePart || "").toLowerCase() &&
                    !potentialArea.toLowerCase().includes('district') &&
                    !potentialArea.toLowerCase().includes('city') &&
                    potentialArea.length > 2 &&
                    potentialArea.length < 50) {
                  area = potentialArea;
                  logger.info('✅ Extracted area from formatted_address (3+ parts):', area);
                  
                  // Update city and state from formatted_address if available
                  if (cityPart && (!city || cityPart.toLowerCase() !== city.toLowerCase())) {
                    city = cityPart;
                  }
                  if (statePart && (!state || statePart.toLowerCase() !== state.toLowerCase())) {
                    state = statePart;
                  }
                }
              } else if (parts.length === 2 && !area) {
                // Two parts: Could be "Area, City" or "City, State"
                // Try first part as area if it doesn't match city
                const firstPart = parts[0];
                const secondPart = parts[1];
                
                // If we already have city, check if first part is different
                if (city && firstPart.toLowerCase() !== city.toLowerCase() &&
                    firstPart.toLowerCase() !== (state || "").toLowerCase() &&
                    !firstPart.toLowerCase().includes('district') &&
                    !firstPart.toLowerCase().includes('city') &&
                    firstPart.length > 2 && firstPart.length < 50) {
                  area = firstPart;
                  logger.info('✅ Extracted area from formatted_address (2 parts):', area);
                }
              }
            }
            
            const normalizedStreet = [streetNumber, street].filter(Boolean).join(' ').trim() || street || "";
            if (!street && formattedAddress) {
              const parts = formattedAddress.split(',').map(p => p.trim()).filter(Boolean);
              const firstPart = parts[0] || "";
              const firstPartLower = firstPart.toLowerCase();
              if (
                firstPart &&
                !firstPartLower.includes('district') &&
                !firstPartLower.includes('city') &&
                firstPartLower !== (city || "").toLowerCase() &&
                firstPartLower !== (state || "").toLowerCase()
              ) {
                street = firstPart;
              }
            }

            // Transform to our expected format
            processedData = {
              results: [{
                formatted_address: formattedAddress,
                address_components: {
                  city: city,
                  state: state,
                  country: country,
                  area: area,
                  street: normalizedStreet || street || "",
                  streetNumber: streetNumber || "",
                  postalCode: postalCode || "",
                  pincode: postalCode || ""
                },
                geometry: firstResult.geometry || {
                  location: {
                    lat: latNum,
                    lng: lngNum
                  }
                }
              }]
            };
            
            logger.info('OLA Maps processed response:', {
              area,
              city,
              state,
              formattedAddress
            });
          }
        }
        
        const firstProcessed = processedData?.results?.[0] || {};
        const olaAddressComponents = firstProcessed?.address_components || {};
        const olaFormattedAddress = firstProcessed?.formatted_address || firstProcessed?.formattedAddress || '';
        const olaLooksComplete = hasLikelyCompleteAddress({
          formattedAddress: olaFormattedAddress,
          area: olaAddressComponents?.area,
          postalCode: olaAddressComponents?.postalCode || olaAddressComponents?.pincode
        });

        if (!olaLooksComplete) {
          try {
            const { getGoogleMapsApiKey } = await import('../../../shared/utils/envService.js');
            const googleApiKey = await getGoogleMapsApiKey();
            if (googleApiKey) {
              const googleResponse = await axios.get(
                'https://maps.googleapis.com/maps/api/geocode/json',
                {
                  params: {
                    latlng: `${latNum},${lngNum}`,
                    key: googleApiKey,
                    language: 'en'
                  },
                  timeout: 5000
                }
              );
              const bestGoogleResult = pickGoogleGeocodeResult(googleResponse?.data?.results || []);
              if (bestGoogleResult) {
                const googleProcessed = toProcessedResultFromGoogle(bestGoogleResult, latNum, lngNum);
                if (hasLikelyCompleteAddress({
                  formattedAddress: googleProcessed?.formatted_address,
                  area: googleProcessed?.address_components?.area,
                  postalCode: googleProcessed?.address_components?.postalCode || googleProcessed?.address_components?.pincode
                })) {
                  logger.info('Using Google reverse geocode fallback for coarse OLA result', {
                    lat: latNum,
                    lng: lngNum,
                    olaFormattedAddress,
                    googleFormattedAddress: googleProcessed?.formatted_address
                  });
                  processedData = { results: [googleProcessed] };
                  return res.json({
                    success: true,
                    data: processedData,
                    source: 'google_geocode_fallback'
                  });
                }
              }
            }
          } catch (googleFallbackError) {
            logger.warn('Google reverse geocode fallback failed', {
              error: googleFallbackError.message,
              lat: latNum,
              lng: lngNum
            });
          }
        }

        return res.json({
          success: true,
          data: processedData,
          source: 'olamaps'
        });
      }
      
      // If we reach here, all methods failed and fallback should have been used
      // But if fallback also failed, return coordinates-only response
      const minimalData = {
        results: [{
          formatted_address: `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
          address_components: {
            city: 'Current Location',
            state: '',
            country: '',
            area: ''
          },
          geometry: {
            location: {
              lat: latNum,
              lng: lngNum
            }
          }
        }]
      };

      return res.json({
        success: true,
        data: minimalData,
        source: 'coordinates_only'
      });
    } catch (apiError) {
      logger.error('Location service error (all methods failed)', {
        error: apiError.message,
        status: apiError.response?.status,
        data: apiError.response?.data
      });

      // Return error response
      if (apiError.response) {
        return res.status(apiError.response.status).json({
          success: false,
          message: 'Failed to get location details',
          error: apiError.response.data
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Location service unavailable',
        error: apiError.message
      });
    }
  } catch (error) {
    logger.error('Reverse geocode error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get nearby locations/places using OLA Maps or Google Places API
 * GET /location/nearby?lat=...&lng=...&radius=...
 */
export const getNearbyLocations = async (req, res) => {
  try {
    const { lat, lng, radius = 500, query = '' } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseFloat(radius);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude'
      });
    }

    const cacheKey = buildLocationCacheKey(latNum, lngNum, radiusNum, query);
    const cachedPayload = getCachedResponse(nearbyLocationsCache, cacheKey);
    if (cachedPayload) {
      return res.json(cachedPayload);
    }

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      if (payload && payload.success === true) {
        setCachedResponse(nearbyLocationsCache, cacheKey, payload, NEARBY_LOCATIONS_CACHE_TTL_MS);
      }
      return originalJson(payload);
    };

    const apiKey = process.env.OLA_MAPS_API_KEY;
    // Get Google Maps API key from database (NO FALLBACK)
    const { getGoogleMapsApiKey } = await import('../../../shared/utils/envService.js');
    const googleApiKey = await getGoogleMapsApiKey();

    let nearbyPlaces = [];

    // Google Places is optional because this endpoint can be high-frequency and expensive.
    if (googleApiKey && process.env.ENABLE_GOOGLE_PLACES_NEARBY === 'true') {
      try {
        const response = await axios.get(
          'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
          {
            params: {
              location: `${latNum},${lngNum}`,
              radius: radiusNum,
              type: 'establishment|point_of_interest',
              key: googleApiKey,
              ...(query && { keyword: query })
            },
            timeout: 5000
          }
        );

        if (response.data && response.data.results) {
          nearbyPlaces = response.data.results.slice(0, 10).map((place, index) => {
            // Calculate distance
            const placeLat = place.geometry.location.lat;
            const placeLng = place.geometry.location.lng;
            const distance = calculateDistance(latNum, lngNum, placeLat, placeLng);

            return {
              id: place.place_id || `place_${index}`,
              name: place.name || '',
              address: place.vicinity || place.formatted_address || '',
              distance: distance < 1000 
                ? `${Math.round(distance)} m` 
                : `${(distance / 1000).toFixed(2)} km`,
              distanceMeters: Math.round(distance),
              latitude: placeLat,
              longitude: placeLng,
              types: place.types || []
            };
          });

          // Sort by distance
          nearbyPlaces.sort((a, b) => a.distanceMeters - b.distanceMeters);

          return res.json({
            success: true,
            data: {
              locations: nearbyPlaces,
              source: 'google_places'
            }
          });
        }
      } catch (googleError) {
        logger.warn('Google Places API failed, trying OLA Maps', {
          error: googleError.message
        });
      }
    }

    // Fallback to OLA Maps (if available) or return empty
    if (apiKey) {
      try {
        // Note: OLA Maps might have different endpoint structure
        // This is a placeholder - adjust based on actual OLA Maps API
        const response = await axios.get(
          'https://api.olamaps.io/places/v1/nearby',
          {
            params: {
              lat: latNum,
              lng: lngNum,
              radius: radiusNum,
              key: apiKey
            },
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 5000
          }
        );

        if (response.data && response.data.results) {
          nearbyPlaces = response.data.results.slice(0, 10).map((place, index) => {
            const placeLat = place.geometry?.location?.lat || place.lat;
            const placeLng = place.geometry?.location?.lng || place.lng;
            const distance = calculateDistance(latNum, lngNum, placeLat, placeLng);

            return {
              id: place.place_id || place.id || `place_${index}`,
              name: place.name || '',
              address: place.vicinity || place.formatted_address || place.address || '',
              distance: distance < 1000 
                ? `${Math.round(distance)} m` 
                : `${(distance / 1000).toFixed(2)} km`,
              distanceMeters: Math.round(distance),
              latitude: placeLat,
              longitude: placeLng
            };
          });

          nearbyPlaces.sort((a, b) => a.distanceMeters - b.distanceMeters);

          return res.json({
            success: true,
            data: {
              locations: nearbyPlaces,
              source: 'olamaps'
            }
          });
        }
      } catch (olaError) {
        logger.warn('OLA Maps nearby search failed', {
          error: olaError.message
        });
      }
    }

    // Return empty results if all APIs fail
    return res.json({
      success: true,
      data: {
        locations: [],
        source: 'none'
      }
    });
  } catch (error) {
    logger.error('Get nearby locations error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

