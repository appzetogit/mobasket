/**
 * Frontend address geocoding utility
 * Converts addresses to lat/lng coordinates using Google Geocoder API.
 */

const normalizeAddressPart = (value) => String(value || "").replace(/\s+/g, " ").trim();

const isCoarseAddressPart = (value) => {
  const text = normalizeAddressPart(value).toLowerCase();
  if (!text) return true;
  if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(text)) return true;
  if (text.includes("district")) return true;
  if (text === "india" || text.endsWith(", india")) return true;
  return false;
};

const isCoarseFormattedAddress = (value) => {
  const text = normalizeAddressPart(value);
  if (!text) return true;
  const lower = text.toLowerCase();
  if (lower.includes("district")) return true;
  if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(text)) return true;
  const segments = text.split(",").map((part) => part.trim()).filter(Boolean);
  return segments.length < 3;
};

const dedupeAddressParts = (parts = []) => {
  const seen = new Set();
  return parts
    .map(normalizeAddressPart)
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/**
 * Geocode an address using Google Maps Geocoder.
 * @param {object} address - Address object with street/city/state/zipCode/formattedAddress
 * @param {string} apiKey - Google Maps API key
 * @returns {Promise<{latitude: number, longitude: number, formattedAddress?: string} | null>}
 */
export async function geocodeAddress(address, apiKey) {
  if (!address || !apiKey) {
    return null;
  }

  try {
    const hasValidCoordinates =
      (address?.location?.coordinates &&
        Number.isFinite(address.location.coordinates[1]) &&
        Number.isFinite(address.location.coordinates[0]) &&
        !(address.location.coordinates[0] === 0 && address.location.coordinates[1] === 0)) ||
      (Number.isFinite(address?.latitude) &&
        Number.isFinite(address?.longitude) &&
        !(address.latitude === 0 && address.longitude === 0));

    if (hasValidCoordinates) {
      return null;
    }

    const preferredFormattedAddress = normalizeAddressPart(address?.formattedAddress);
    const street = normalizeAddressPart(address?.street);
    const additionalDetails = normalizeAddressPart(address?.additionalDetails);
    const city = normalizeAddressPart(address?.city);
    const state = normalizeAddressPart(address?.state);
    const zipCode = normalizeAddressPart(address?.zipCode || address?.postalCode || address?.pincode);

    const streetParts = dedupeAddressParts([
      street,
      !isCoarseAddressPart(additionalDetails) ? additionalDetails : "",
    ]);

    const assembledAddressParts = dedupeAddressParts([
      ...streetParts,
      city,
      state,
      zipCode,
    ]);

    // Avoid geocoding broad locality-only queries like city/district/state.
    if (streetParts.length === 0 && !zipCode) {
      return null;
    }

    const fullAddress =
      preferredFormattedAddress &&
      preferredFormattedAddress.length >= 8 &&
      !isCoarseFormattedAddress(preferredFormattedAddress)
        ? preferredFormattedAddress
        : assembledAddressParts.join(", ");

    if (!fullAddress || fullAddress.length < 5) {
      return null;
    }

    if (window.google?.maps?.Geocoder) {
      return await geocodeWithGoogleMaps(fullAddress);
    }

    return await geocodeWithHttpApi(fullAddress, apiKey);
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

async function geocodeWithGoogleMaps(fullAddress) {
  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();

    geocoder.geocode({ address: fullAddress, region: "in" }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const result = results[0];
        const location = result.geometry?.location;

        if (location) {
          console.log("Geocoding successful (Google Maps API):", {
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

async function geocodeWithHttpApi(fullAddress, apiKey) {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}&region=in`,
      { signal: AbortSignal.timeout(5000) },
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.status !== "OK" || !data.results?.[0]) {
      return null;
    }

    const result = data.results[0];
    const location = result?.geometry?.location;

    if (!location?.lat || !location?.lng) {
      return null;
    }

    console.log("Geocoding successful (HTTP API):", {
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
    console.error("Geocoding HTTP error:", error.message);
    return null;
  }
}

/**
 * Ensure address has valid coordinates, geocoding if necessary.
 * @param {object} address
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
export async function ensureAddressCoordinates(address, apiKey) {
  if (!address) return address;

  const existingLat = address?.location?.coordinates?.[1] || address?.latitude;
  const existingLng = address?.location?.coordinates?.[0] || address?.longitude;

  if (Number.isFinite(existingLat) && Number.isFinite(existingLng) && !(existingLat === 0 && existingLng === 0)) {
    return address;
  }

  const geocoded = await geocodeAddress(address, apiKey);
  if (geocoded) {
    return {
      ...address,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      location: {
        type: "Point",
        coordinates: [geocoded.longitude, geocoded.latitude],
      },
      ...(geocoded.formattedAddress && { formattedAddress: geocoded.formattedAddress }),
    };
  }

  return address;
}
