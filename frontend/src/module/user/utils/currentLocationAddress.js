/**
 * A temporary delivery address built from the device's detected location, used
 * by both checkouts when the customer picks "Detect current location".
 *
 * Returns null when the location has no coordinates or only a placeholder
 * label, so callers never select an address that cannot be delivered to.
 */
export const buildCurrentLocationAddress = (locationData) => {
  if (!locationData || typeof locationData !== "object") return null

  const latitude = Number(locationData.latitude ?? locationData.lat ?? locationData.location?.latitude)
  const longitude = Number(locationData.longitude ?? locationData.lng ?? locationData.location?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null
  }

  const formattedAddress = String(locationData.formattedAddress || locationData.address || "").trim()
  const blockedLabels = new Set(["", "select location", "current location"])
  if (blockedLabels.has(formattedAddress.toLowerCase())) {
    return null
  }

  const street = String(locationData.street || "").trim()
  const area = String(locationData.area || locationData.additionalDetails || "").trim()
  const city = String(locationData.city || "").trim()
  const state = String(locationData.state || "").trim()
  const zipCode = String(locationData.zipCode || locationData.postalCode || locationData.pincode || "").trim()
  const joined = [street, area, city, state, zipCode].filter(Boolean).join(", ")

  return {
    label: "Current Location",
    completeAddress: formattedAddress || joined,
    street,
    additionalDetails: area,
    city,
    state,
    zipCode,
    formattedAddress: formattedAddress || joined,
    latitude,
    longitude,
    location: {
      type: "Point",
      coordinates: [longitude, latitude],
    },
    isCurrentLocationTemporary: true,
  }
}
