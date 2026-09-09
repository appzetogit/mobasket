import { describe, it, expect } from 'vitest';
import {
  isPointInsideZone,
  findContainingZone,
  zoneCentroid,
  distanceKm,
} from '../modules/admin/utils/zoneResolution.js';

/** Axis-aligned square, given as {latitude, longitude} points. */
const square = (name, minLat, minLng, size) => ({
  _id: name,
  name,
  coordinates: [
    { latitude: minLat, longitude: minLng },
    { latitude: minLat, longitude: minLng + size },
    { latitude: minLat + size, longitude: minLng + size },
    { latitude: minLat + size, longitude: minLng },
  ],
});

describe('isPointInsideZone', () => {
  const zone = square('A', 20, 84, 1);

  it('detects a point inside and outside', () => {
    expect(isPointInsideZone(zone, 20.5, 84.5)).toBe(true);
    expect(isPointInsideZone(zone, 25, 84.5)).toBe(false);
    expect(isPointInsideZone(zone, 20.5, 90)).toBe(false);
  });

  it('accepts lat/lng as well as latitude/longitude', () => {
    const shorthand = { coordinates: [
      { lat: 20, lng: 84 }, { lat: 20, lng: 85 }, { lat: 21, lng: 85 }, { lat: 21, lng: 84 },
    ] };
    expect(isPointInsideZone(shorthand, 20.5, 84.5)).toBe(true);
  });

  it('returns false for degenerate or malformed zones', () => {
    expect(isPointInsideZone({ coordinates: [] }, 20.5, 84.5)).toBe(false);
    expect(isPointInsideZone({ coordinates: [{ latitude: 20, longitude: 84 }] }, 20.5, 84.5)).toBe(false);
    expect(isPointInsideZone(null, 20.5, 84.5)).toBe(false);
  });

  it('returns false for non-finite coordinates', () => {
    expect(isPointInsideZone(square('A', 20, 84, 1), NaN, 84.5)).toBe(false);
    expect(isPointInsideZone(square('A', 20, 84, 1), 20.5, undefined)).toBe(false);
  });
});

describe('zoneCentroid', () => {
  it('averages the ring', () => {
    expect(zoneCentroid(square('A', 20, 84, 2).coordinates)).toEqual({ lat: 21, lng: 85 });
  });

  it('returns the origin for an empty or malformed ring', () => {
    expect(zoneCentroid([])).toEqual({ lat: 0, lng: 0 });
    expect(zoneCentroid(null)).toEqual({ lat: 0, lng: 0 });
  });
});

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm(20, 84, 20, 84)).toBe(0);
  });

  it('grows with separation', () => {
    expect(distanceKm(20, 84, 21, 84)).toBeGreaterThan(distanceKm(20, 84, 20.5, 84));
  });
});

describe('findContainingZone', () => {
  it('returns null when the point is outside every zone', () => {
    expect(findContainingZone([square('A', 20, 84, 1)], 50, 50)).toBeNull();
  });

  it('returns the only matching zone', () => {
    expect(findContainingZone([square('A', 20, 84, 1)], 20.5, 84.5).name).toBe('A');
  });

  it('picks the nearest centroid when zones overlap, not the first listed', () => {
    // Both contain (20.1, 84.1). B is small and centred on it; A is large.
    const big = square('A', 20, 84, 4);
    const small = square('B', 20.0, 84.0, 0.2);
    expect(findContainingZone([big, small], 20.1, 84.1).name).toBe('B');
    // Order must not change the answer.
    expect(findContainingZone([small, big], 20.1, 84.1).name).toBe('B');
  });

  it('is stable regardless of document order for non-overlapping zones', () => {
    const a = square('A', 20, 84, 1);
    const b = square('B', 30, 84, 1);
    expect(findContainingZone([a, b], 30.5, 84.5).name).toBe('B');
    expect(findContainingZone([b, a], 30.5, 84.5).name).toBe('B');
  });

  it('handles a missing or malformed zone list', () => {
    expect(findContainingZone(null, 20, 84)).toBeNull();
    expect(findContainingZone([], 20, 84)).toBeNull();
  });
});
