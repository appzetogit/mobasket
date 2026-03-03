/**
 * Frontend address geocoding utility
 * Converts addresses to lat/lng coordinates using Google Geocoder API
 */

/**
 * Geocode an address using Google Maps Geocoder
 * @param {object} address - Address object with street, city, state, zipCode
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
export async function geocodeAddress(address, apiKey) {
  if (!address || !apiKey) {
    return null;
  }

  try {
    // Check if address already has valid coordinates
    const hasValidCoordinates = 
      (address?.location?.coordinates && 
       Number.isFinite(address.location.coordinates[1]) && 
       Number.isFinite(address.location.coordinates[0]) &&
       !(address.location.coordinates[0] === 0 && address.location.coordinates[1] === 0)) ||
      (Number.isFinite(address?.latitude) && Number.isFinite(address?.longitude) &&
       !(address.latitude === 0 && address.longitude === 0));
    
    if (hasValidCoordinates) {
      return null; // Don't need to geocode
    }

    const streetParts = [address?.street, address?.additionalDetails].filter(Boolean).join(' ');
    const addressParts = [streetParts, address?.city, address?.state, address?.zipCode].filter(Boolean);
    const fullAddress = addressParts.join(', ');

    if (!fullAddress || fullAddress.length < 5) {
      return null;
    }


    // Use Google Geocoder if available
    if (window.google?.maps?.Geocoder) {
      return await geocodeWithGoogleMaps(fullAddress);
    }

    // Fallback to HTTP API
    return await geocodeWithHttpApi(fullAddress, apiKey);
  } catch (error) {
    console.error('❌ Geocoding error:', error);
    return null;
  }
}

/**
 * Geocode using Google Maps Geocoder widget (if loaded)
 */
async function geocodeWithGoogleMaps(fullAddress) {
  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: fullAddress, region: 'in' }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const result = results[0];
        const location = result.geometry?.location;
        
        if (location) {
          console.log('✅ Geocoding successful (Google Maps API):', {
            address: fullAddress,
            latitude: location.lat(),
            longitude: location.lng(),
          });
          
          resolve({
            latitude: location.lat(),
            longitude: location.lng(),
            formattedAddress: result.formatted_address,
          });
          return;
        }
      }
      
      resolve(null);
    });
  });
}

/**
 * Geocode using HTTP Geocoding API
 */
async function geocodeWithHttpApi(fullAddress, apiKey) {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        fullAddress,
      )}&key=${apiKey}&region=in`,
      { signal: AbortSignal.timeout(5000) },
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results?.[0]) {
      return null;
    }

    const result = data.results[0];
    const location = result?.geometry?.location;

    if (!location?.lat || !location?.lng) {
      return null;
    }

    console.log('✅ Geocoding successful (HTTP API):', {
      address: fullAddress,
      latitude: location.lat,
      longitude: location.lng,
    });

    return {
      latitude: location.lat,
      longitude: location.lng,
      formattedAddress: result.formatted_address,
    };
  } catch (error) {
    console.error('❌ Geocoding HTTP error:', error.message);
    return null;
  }
}

/**
 * Ensure address has valid coordinates, geocoding if necessary
 * @param {object} address - Address object
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise<object>} Address with guaranteed coordinates
 */
export async function ensureAddressCoordinates(address, apiKey) {
  if (!address) return address;

  // Already has valid coordinates
  const existingLat = address?.location?.coordinates?.[1] || address?.latitude;
  const existingLng = address?.location?.coordinates?.[0] || address?.longitude;
  
  if (
    Number.isFinite(existingLat) &&
    Number.isFinite(existingLng) &&
    !(existingLat === 0 && existingLng === 0)
  ) {
    return address; // No geocoding needed
  }

  // Try to geocode
  const geocoded = await geocodeAddress(address, apiKey);
  
  if (geocoded) {
    // Merge geocoded coordinates with address
    return {
      ...address,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      location: {
        type: 'Point',
        coordinates: [geocoded.longitude, geocoded.latitude],
      },
      ...(geocoded.formattedAddress && { formattedAddress: geocoded.formattedAddress }),
    };
  }

  // Return address unchanged if geocoding failed
  return address;
}
