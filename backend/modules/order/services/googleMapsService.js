import axios from 'axios';
import { getGoogleMapsApiKey } from '../../../shared/utils/envService.js';

/**
 * Google Maps Distance Matrix API Service
 * Calculates travel time and distance between two points
 */
class GoogleMapsService {
  constructor() {
    this.apiKey = null; // Will be loaded from database when needed
    this.baseUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json';

    // In-memory optimization: dedupe repeated route calls and cache short-lived results.
    this.travelTimeCache = new Map(); // cacheKey -> { value, expiresAt }
    this.inFlightRequests = new Map(); // cacheKey -> Promise
    this.cacheCoordinatePrecision = 3; // ~110m precision improves cache hit rate
    this.maxCacheEntries = 2000;
  }

  /**
   * Get API key from database (lazy loading)
   */
  async getApiKey() {
    if (!this.apiKey) {
      this.apiKey = await getGoogleMapsApiKey();
      if (!this.apiKey) {
        console.warn('Google Maps API key not found in database. Please set it in Admin -> System -> Environment Variables');
      }
    }
    return this.apiKey;
  }

  /**
   * Get cache TTL by mode
   */
  getCacheTtlMs(mode) {
    if (mode === 'driving') {
      return 2 * 60 * 1000; // 2 minutes for traffic-sensitive routes
    }
    return 10 * 60 * 1000; // 10 minutes for other modes
  }

  /**
   * Build normalized cache key for route queries
   */
  buildCacheKey(origin, destination, mode, trafficModel) {
    const round = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return '0.000';
      const factor = 10 ** this.cacheCoordinatePrecision;
      return (Math.round(num * factor) / factor).toFixed(this.cacheCoordinatePrecision);
    };

    const normalizedTrafficModel = mode === 'driving' ? (trafficModel || 'best_guess') : 'na';
    return `${mode}|${normalizedTrafficModel}|${round(origin.latitude)},${round(origin.longitude)}|${round(destination.latitude)},${round(destination.longitude)}`;
  }

  /**
   * Get cached travel result when valid
   */
  getCachedTravelTime(cacheKey) {
    const cached = this.travelTimeCache.get(cacheKey);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.travelTimeCache.delete(cacheKey);
      return null;
    }

    return cached.value;
  }

  /**
   * Save travel result in cache with TTL
   */
  setCachedTravelTime(cacheKey, value, mode, ttlMs = null) {
    const effectiveTtl = ttlMs || this.getCacheTtlMs(mode);
    this.travelTimeCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + effectiveTtl
    });

    // Keep memory bounded.
    while (this.travelTimeCache.size > this.maxCacheEntries) {
      const oldestKey = this.travelTimeCache.keys().next().value;
      this.travelTimeCache.delete(oldestKey);
    }
  }

  /**
   * Get travel time and distance between two points
   * @param {Object} origin - { latitude, longitude }
   * @param {Object} destination - { latitude, longitude }
   * @param {String} mode - 'driving', 'walking', 'bicycling', 'transit'
   * @param {String} trafficModel - 'best_guess', 'pessimistic', 'optimistic'
   * @returns {Promise<Object>} - { distance (km), duration (minutes), trafficLevel }
   */
  async getTravelTime(origin, destination, mode = 'driving', trafficModel = 'best_guess') {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      // Fallback to haversine distance calculation if API key not available
      console.warn('Google Maps API key not available, using fallback calculation');
      return this.calculateHaversineDistance(origin, destination);
    }

    const cacheKey = this.buildCacheKey(origin, destination, mode, trafficModel);
    const cachedResult = this.getCachedTravelTime(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Avoid duplicate concurrent calls for the same route.
    const inFlight = this.inFlightRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = (async () => {
      try {
        const originStr = `${origin.latitude},${origin.longitude}`;
        const destStr = `${destination.latitude},${destination.longitude}`;

        const params = {
          origins: originStr,
          destinations: destStr,
          mode,
          key: apiKey,
          units: 'metric',
          departure_time: 'now' // For traffic-aware routing
        };

        // Add traffic model for driving mode
        if (mode === 'driving') {
          params.traffic_model = trafficModel;
        }

        const response = await axios.get(this.baseUrl, { params });

        if (response.data.status !== 'OK') {
          console.error('Google Maps API Error:', response.data.status, response.data.error_message);
          // Fallback to haversine
          const fallback = this.calculateHaversineDistance(origin, destination);
          this.setCachedTravelTime(cacheKey, fallback, mode, 60 * 1000); // short cache for API errors
          return fallback;
        }

        const element = response.data.rows[0].elements[0];

        if (element.status !== 'OK') {
          console.error('Google Maps Element Error:', element.status);
          const fallback = this.calculateHaversineDistance(origin, destination);
          this.setCachedTravelTime(cacheKey, fallback, mode, 60 * 1000); // short cache for API errors
          return fallback;
        }

        // Extract distance in km
        const distance = element.distance.value / 1000; // Convert meters to km

        // Extract duration in minutes
        let duration = element.duration.value / 60; // Convert seconds to minutes

        // Check if traffic duration is available (for driving mode)
        let trafficLevel = 'low';
        if (element.duration_in_traffic) {
          const trafficDuration = element.duration_in_traffic.value / 60; // minutes
          const trafficMultiplier = trafficDuration / duration;

          if (trafficMultiplier >= 1.4) {
            trafficLevel = 'high';
          } else if (trafficMultiplier >= 1.2) {
            trafficLevel = 'medium';
          }

          duration = trafficDuration; // Use traffic-aware duration
        }

        const result = {
          distance: parseFloat(distance.toFixed(2)),
          duration: Math.ceil(duration), // Round up to nearest minute
          trafficLevel,
          raw: {
            distance: element.distance,
            duration: element.duration,
            durationInTraffic: element.duration_in_traffic
          }
        };

        this.setCachedTravelTime(cacheKey, result, mode);
        return result;
      } catch (error) {
        console.error('Error calling Google Maps API:', error.message);
        // Fallback to haversine calculation
        const fallback = this.calculateHaversineDistance(origin, destination);
        this.setCachedTravelTime(cacheKey, fallback, mode, 60 * 1000); // short cache for transient failures
        return fallback;
      } finally {
        this.inFlightRequests.delete(cacheKey);
      }
    })();

    this.inFlightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  /**
   * Fallback: Calculate distance using Haversine formula
   * @param {Object} origin - { latitude, longitude }
   * @param {Object} destination - { latitude, longitude }
   * @returns {Object} - { distance (km), duration (minutes), trafficLevel }
   */
  calculateHaversineDistance(origin, destination) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(destination.latitude - origin.latitude);
    const dLon = this.toRad(destination.longitude - origin.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(origin.latitude)) * Math.cos(this.toRad(destination.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Estimate duration: assume average speed of 30 km/h in city
    const duration = Math.ceil((distance / 30) * 60); // Convert to minutes

    return {
      distance: parseFloat(distance.toFixed(2)),
      duration,
      trafficLevel: 'low' // Can't determine traffic without API
    };
  }

  /**
   * Convert degrees to radians
   */
  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Batch calculate travel times for multiple destinations
   * @param {Object} origin - { latitude, longitude }
   * @param {Array} destinations - [{ latitude, longitude }, ...]
   * @returns {Promise<Array>} - Array of travel time results
   */
  async getBatchTravelTimes(origin, destinations) {
    const promises = destinations.map((dest) => this.getTravelTime(origin, dest));
    return Promise.all(promises);
  }
}

export default new GoogleMapsService();
