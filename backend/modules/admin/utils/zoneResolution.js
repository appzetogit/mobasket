/**
 * Zone containment, shared between checkout and any pre-checkout lookup.
 *
 * Order creation resolves the delivery zone from the selected address. If a
 * serviceability check used different geometry, an address could pass the check
 * and then be rejected at checkout, so both use the functions here.
 *
 * Extracted verbatim from the order controller; behaviour is unchanged.
 */

/** Ray casting against a zone's coordinate ring. */
export const isPointInsideZone = (zone, latitude, longitude) => {
  const coordinates = Array.isArray(zone?.coordinates) ? zone.coordinates : [];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || coordinates.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
    const coordI = coordinates[i];
    const coordJ = coordinates[j];
    const xi = typeof coordI === 'object' ? (coordI.latitude || coordI.lat) : null;
    const yi = typeof coordI === 'object' ? (coordI.longitude || coordI.lng) : null;
    const xj = typeof coordJ === 'object' ? (coordJ.latitude || coordJ.lat) : null;
    const yj = typeof coordJ === 'object' ? (coordJ.longitude || coordJ.lng) : null;

    if (xi === null || yi === null || xj === null || yj === null) continue;

    const intersect = ((yi > longitude) !== (yj > longitude)) &&
      (latitude < ((xj - xi) * (longitude - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
};

/** Average of a zone's coordinate ring. */
export const zoneCentroid = (coordinates = []) => {
  let sumLat = 0;
  let sumLng = 0;
  let count = 0;

  for (const coord of Array.isArray(coordinates) ? coordinates : []) {
    const lat = typeof coord === 'object' ? Number(coord.latitude ?? coord.lat) : NaN;
    const lng = typeof coord === 'object' ? Number(coord.longitude ?? coord.lng) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      sumLat += lat;
      sumLng += lng;
      count += 1;
    }
  }

  return { lat: count > 0 ? sumLat / count : 0, lng: count > 0 ? sumLng / count : 0 };
};

/** Great-circle distance in kilometres. */
export const distanceKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * The active zone containing the point, or null.
 *
 * Zones overlap in practice - more than half of a sample of points fell inside
 * two of them - so which match wins matters. Taking the first match left that to
 * document order, while the public zone lookup already chose the nearest by
 * centroid. A customer could therefore be told they were in one zone and have
 * checkout resolve another, and be rejected for a zone mismatch. Both now pick
 * the nearest centroid, so the answer is the same and does not depend on the
 * order documents happen to come back in.
 */
export const findContainingZone = (zones, latitude, longitude) => {
  if (!Array.isArray(zones)) return null;

  let best = null;
  let bestDistance = Infinity;

  for (const zone of zones) {
    if (!isPointInsideZone(zone, latitude, longitude)) continue;

    const centroid = zoneCentroid(zone?.coordinates);
    const distance = distanceKm(latitude, longitude, centroid.lat, centroid.lng);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = zone;
    }
  }

  return best;
};
