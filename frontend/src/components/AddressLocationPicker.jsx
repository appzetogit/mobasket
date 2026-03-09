import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { MapPin, Navigation, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getGoogleMapsApiKey } from "@/lib/utils/googleMapsApiKey";
import { geocodeAddress } from "@/lib/utils/addressGeocoding";
import { locationAPI } from "@/lib/api";

const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasMeaningfulStreet(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const normalized = text.toLowerCase();
  if (text.includes(",")) return false;
  if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(text)) return false;
  if (!/[a-z]/i.test(text)) return false;
  if (["district", "state", "india"].some((token) => normalized.includes(token))) return false;
  return text.length >= 3;
}

function resolveStreetForForm(...candidates) {
  const cleaned = candidates
    .map((candidate) => String(candidate || "").trim())
    .filter(Boolean);

  const strict = cleaned.find((candidate) => hasMeaningfulStreet(candidate));
  if (strict) return strict;

  const relaxed = cleaned.find((candidate) => {
    const lower = candidate.toLowerCase();
    if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(candidate)) return false;
    if (lower === "india") return false;
    if (lower.includes("district") || lower.includes("division") || lower.includes("zone")) return false;
    return true;
  });
  return relaxed || "";
}

function pickBestGoogleResult(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const score = (entry) => {
    const types = Array.isArray(entry?.types) ? entry.types : [];
    let value = 0;
    if (types.includes("street_address")) value += 100;
    if (types.includes("premise")) value += 80;
    if (types.includes("subpremise")) value += 70;
    if (types.includes("route")) value += 60;
    if (types.includes("point_of_interest")) value += 40;
    if (types.includes("establishment")) value += 30;
    if (types.includes("sublocality")) value += 20;
    if (types.includes("locality")) value += 10;
    return value;
  };

  return [...results].sort((a, b) => score(b) - score(a))[0] || results[0];
}

function extractAddressFromGoogleResult(result, latitude, longitude) {
  const components = Array.isArray(result?.address_components) ? result.address_components : [];
  const byType = (type) => components.find((component) => component?.types?.includes(type))?.long_name || "";

  const streetNumber = byType("street_number");
  const route = byType("route");
  const premise = byType("premise") || byType("subpremise");
  const neighborhood = byType("sublocality_level_1") || byType("sublocality") || byType("neighborhood");
  const city = byType("locality") || byType("administrative_area_level_2");
  const state = byType("administrative_area_level_1");
  const zipCode = byType("postal_code");
  const formattedAddress = String(result?.formatted_address || "").trim();

  return {
    street: resolveStreetForForm([streetNumber, route].filter(Boolean).join(" "), route, premise, neighborhood),
    formattedAddress,
    additionalDetails: resolveStreetForForm(neighborhood, premise, route, ""),
    city,
    state,
    zipCode,
    latitude: String(latitude),
    longitude: String(longitude),
  };
}

function hasDeepLocationData(address = {}) {
  const street = String(address?.street || "").trim();
  const additional = String(address?.additionalDetails || "").trim();
  const zipCode = String(address?.zipCode || "").trim();
  const formatted = String(address?.formattedAddress || "").trim();

  return (
    hasMeaningfulStreet(street) ||
    (additional && !additional.toLowerCase().includes("district")) ||
    Boolean(zipCode) ||
    formatted.split(",").filter(Boolean).length >= 4
  );
}

function scoreAddressDetail(address = {}) {
  const street = String(address?.street || "").trim();
  const additional = String(address?.additionalDetails || "").trim();
  const city = String(address?.city || "").trim();
  const state = String(address?.state || "").trim();
  const zip = String(address?.zipCode || "").trim();
  const formatted = String(address?.formattedAddress || "").trim();
  return (
    (street ? 4 : 0) +
    (additional ? 3 : 0) +
    (city ? 2 : 0) +
    (state ? 2 : 0) +
    (zip ? 2 : 0) +
    (formatted.split(",").filter(Boolean).length >= 4 ? 3 : 0)
  );
}

function mergeAddressDetails(primary = null, secondary = null) {
  const first = primary || {};
  const second = secondary || {};

  const preferred = scoreAddressDetail(second) > scoreAddressDetail(first) ? second : first;
  const fallback = preferred === first ? second : first;
  const chosenStreet = resolveStreetForForm(preferred?.street, fallback?.street);
  const chosenAdditional = resolveStreetForForm(
    preferred?.additionalDetails,
    fallback?.additionalDetails,
  );

  return {
    street: chosenStreet,
    additionalDetails:
      chosenAdditional && chosenAdditional !== chosenStreet
        ? chosenAdditional
        : resolveStreetForForm(fallback?.additionalDetails, preferred?.formattedAddress),
    city: String(preferred?.city || fallback?.city || "").trim(),
    state: String(preferred?.state || fallback?.state || "").trim(),
    zipCode: String(preferred?.zipCode || fallback?.zipCode || "").trim(),
    formattedAddress: String(
      preferred?.formattedAddress || fallback?.formattedAddress || "",
    ).trim(),
    latitude: String(preferred?.latitude || fallback?.latitude || ""),
    longitude: String(preferred?.longitude || fallback?.longitude || ""),
  };
}

function extractReverseGeocodedAddress(response, latitude, longitude) {
  const results = response?.data?.data?.results || [];
  const firstResult = results[0] || {};
  const components = firstResult?.address_components || {};

  const fromArray = Array.isArray(components)
    ? {
        city:
          components.find((c) => c.types?.includes("locality"))?.long_name ||
          components.find((c) => c.types?.includes("administrative_area_level_2"))?.long_name ||
          "",
        state:
          components.find((c) => c.types?.includes("administrative_area_level_1"))?.long_name ||
          "",
        zipCode: components.find((c) => c.types?.includes("postal_code"))?.long_name || "",
      }
    : {
        city: components.city || "",
        state: components.state || "",
        zipCode: components.zipCode || components.postal_code || "",
      };

  const formattedAddress = String(firstResult?.formatted_address || "");
  const pincodeFromText =
    formattedAddress.match(/\b\d{6}\b/)?.[0] ||
    response?.data?.data?.formattedAddress?.match(/\b\d{6}\b/)?.[0] ||
    "";
  const parts = formattedAddress.split(",").map((part) => part.trim()).filter(Boolean);
  const route = Array.isArray(components)
    ? components.find((c) => c.types?.includes("route"))?.long_name || ""
    : "";
  const premise = Array.isArray(components)
    ? components.find((c) => c.types?.includes("premise"))?.long_name || ""
    : "";
  const fallbackStreet = resolveStreetForForm(
    firstResult?.street,
    route,
    premise,
    parts[0],
    firstResult?.area,
    firstResult?.sublocality,
  );

  return {
    street: fallbackStreet,
    formattedAddress,
    additionalDetails:
      firstResult?.area ||
      firstResult?.sublocality ||
      firstResult?.neighborhood ||
      (parts.length > 1 ? parts.slice(1, Math.min(parts.length - 2, 3)).join(", ") : "") ||
      formattedAddress,
    city: fromArray.city,
    state: fromArray.state,
    zipCode: fromArray.zipCode || pincodeFromText,
    latitude: String(latitude),
    longitude: String(longitude),
  };
}

export default function AddressLocationPicker({
  value,
  onChange,
  className = "",
  title = "Set delivery location",
  description = "Drag the pin or tap on the map to lock the exact delivery point.",
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const dragListenerRef = useRef(null);
  const clickListenerRef = useRef(null);
  const reverseGeocodeTimerRef = useRef(null);
  const typedAddressTimerRef = useRef(null);
  const lastTypedQueryRef = useRef("");
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [isLocatingTypedAddress, setIsLocatingTypedAddress] = useState(false);
  const [isReadingMapLocation, setIsReadingMapLocation] = useState(false);

  const latitude = toFiniteNumber(value?.latitude);
  const longitude = toFiniteNumber(value?.longitude);

  const targetPosition = useMemo(() => {
    if (latitude !== null && longitude !== null) {
      return { lat: latitude, lng: longitude };
    }
    return DEFAULT_CENTER;
  }, [latitude, longitude]);

  const typedAddressQuery = useMemo(() => {
    const preferredFormattedAddress = String(value?.formattedAddress || "").trim();
    if (preferredFormattedAddress && preferredFormattedAddress.length >= 8) {
      return preferredFormattedAddress;
    }

    const street = String(value?.street || "").trim();
    const additionalDetails = String(value?.additionalDetails || "").trim();
    const city = String(value?.city || "").trim();
    const state = String(value?.state || "").trim();
    const zipCode = String(value?.zipCode || "").trim();

    const parts = [
      hasMeaningfulStreet(street) ? street : "",
      hasMeaningfulStreet(additionalDetails) ? additionalDetails : "",
      city,
      state,
      zipCode,
    ]
      .map((part) => String(part || "").trim())
      .filter(Boolean);

    return [...new Set(parts.map((part) => part.toLowerCase()))]
      .map((normalized) => parts.find((part) => part.toLowerCase() === normalized))
      .filter(Boolean)
      .join(", ");
  }, [value?.formattedAddress, value?.street, value?.additionalDetails, value?.city, value?.state, value?.zipCode]);

  const updateMarkerPosition = useCallback((position, shouldPan = true) => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setPosition(position);
    if (shouldPan) {
      mapRef.current.panTo(position);
    }
  }, []);

  const syncLocationFields = useCallback(
    (partial) => {
      onChange((prev) => ({
        ...prev,
        ...partial,
      }));
    },
    [onChange],
  );

  const reverseGeocodeAt = useCallback(
    async (lat, lng) => {
      setIsReadingMapLocation(true);
      try {
        let googleParsed = null;
        let backendParsed = null;

        if (window.google?.maps?.Geocoder) {
          try {
            const geocoder = new window.google.maps.Geocoder();
            const googleResult = await new Promise((resolve) => {
              geocoder.geocode(
                { location: { lat: Number(lat), lng: Number(lng) }, region: "in" },
                (results, status) => {
                  const ok = status === "OK" || status === window.google?.maps?.GeocoderStatus?.OK;
                  if (!ok || !Array.isArray(results) || results.length === 0) {
                    resolve(null);
                    return;
                  }
                  resolve(pickBestGoogleResult(results));
                },
              );
            });

            if (googleResult) {
              googleParsed = extractAddressFromGoogleResult(googleResult, lat, lng);
            }
          } catch (googleError) {
            console.error("Google reverse geocoding from marker failed:", googleError);
          }
        }

        try {
          const response = await locationAPI.reverseGeocode(lat, lng);
          backendParsed = extractReverseGeocodedAddress(response, lat, lng);
        } catch (fallbackError) {
          console.error("Backend reverse geocoding from marker failed:", fallbackError);
        }

        const parsed = mergeAddressDetails(googleParsed, backendParsed);
        if (!hasDeepLocationData(parsed)) {
          // Keep coordinates even when deep fields are unavailable.
          parsed.latitude = String(lat);
          parsed.longitude = String(lng);
        }

        onChange((prev) => ({
          ...prev,
          ...parsed,
          // Keep manually typed street if reverse geocode gives only coarse locality text.
          street: parsed.street || prev?.street || "",
          additionalDetails: parsed.additionalDetails || prev?.additionalDetails || "",
          city: parsed.city || prev?.city || "",
          state: parsed.state || prev?.state || "",
          zipCode: parsed.zipCode || prev?.zipCode || "",
        }));
      } catch (error) {
        console.error("Map reverse geocoding failed:", error);
        syncLocationFields({
          latitude: String(lat),
          longitude: String(lng),
        });
      } finally {
        setIsReadingMapLocation(false);
      }
    },
    [onChange, syncLocationFields],
  );

  const scheduleReverseGeocode = useCallback(
    (lat, lng) => {
      const roundedLat = Number(lat.toFixed(6));
      const roundedLng = Number(lng.toFixed(6));

      syncLocationFields({
        latitude: String(roundedLat),
        longitude: String(roundedLng),
      });

      if (reverseGeocodeTimerRef.current) {
        clearTimeout(reverseGeocodeTimerRef.current);
      }

      reverseGeocodeTimerRef.current = window.setTimeout(() => {
        reverseGeocodeAt(roundedLat, roundedLng);
      }, 350);
    },
    [reverseGeocodeAt, syncLocationFields],
  );

  useEffect(() => {
    let isMounted = true;

    const initMap = async () => {
      if (!mapContainerRef.current || mapRef.current) return;
      setMapsLoading(true);
      try {
        const apiKey = await getGoogleMapsApiKey();
        if (!apiKey) {
          throw new Error("Google Maps API key is missing.");
        }

        const loader = new Loader({
          apiKey,
          version: "weekly",
          libraries: ["places"],
        });

        const google = await loader.load();
        if (!isMounted || !mapContainerRef.current) return;

        const map = new google.maps.Map(mapContainerRef.current, {
          center: targetPosition,
          zoom: latitude !== null && longitude !== null ? 16 : 12,
          disableDefaultUI: true,
          zoomControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeControl: false,
        });

        const marker = new google.maps.Marker({
          position: targetPosition,
          map,
          draggable: true,
          title: "Drag to set exact delivery location",
          icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/orange-dot.png",
            scaledSize: new google.maps.Size(38, 38),
            anchor: new google.maps.Point(19, 38),
          },
        });

        dragListenerRef.current = google.maps.event.addListener(marker, "dragend", () => {
          const next = marker.getPosition();
          if (!next) return;
          scheduleReverseGeocode(next.lat(), next.lng());
        });

        clickListenerRef.current = google.maps.event.addListener(map, "click", (event) => {
          const next = event?.latLng;
          if (!next) return;
          marker.setPosition(next);
          scheduleReverseGeocode(next.lat(), next.lng());
        });

        mapRef.current = map;
        markerRef.current = marker;
        setMapsReady(true);
      } catch (error) {
        console.error("Address map picker init failed:", error);
        toast.error("Map could not be loaded for manual location selection.");
      } finally {
        if (isMounted) {
          setMapsLoading(false);
        }
      }
    };

    initMap();

    return () => {
      isMounted = false;
      if (reverseGeocodeTimerRef.current) {
        clearTimeout(reverseGeocodeTimerRef.current);
      }
      if (typedAddressTimerRef.current) {
        clearTimeout(typedAddressTimerRef.current);
      }
      if (dragListenerRef.current && window.google?.maps?.event) {
        window.google.maps.event.removeListener(dragListenerRef.current);
      }
      if (clickListenerRef.current && window.google?.maps?.event) {
        window.google.maps.event.removeListener(clickListenerRef.current);
      }
    };
  }, [latitude, longitude, scheduleReverseGeocode, targetPosition]);

  useEffect(() => {
    if (!mapsReady) return;
    updateMarkerPosition(targetPosition, false);
  }, [mapsReady, targetPosition, updateMarkerPosition]);

  const locateTypedAddress = useCallback(async (options = {}) => {
    const { showToast = false } = options;
    try {
      const apiKey = await getGoogleMapsApiKey();
      const result = await geocodeAddress(
        {
          street: value?.street,
          additionalDetails: value?.additionalDetails,
          city: value?.city,
          state: value?.state,
          zipCode: value?.zipCode,
        },
        apiKey,
      );
      if (!result?.latitude || !result?.longitude) {
        if (showToast) {
          toast.error("Enter a more complete address to set its map location.");
        }
        return;
      }

      const nextPosition = {
        lat: Number(result.latitude),
        lng: Number(result.longitude),
      };

      if (!Number.isFinite(nextPosition.lat) || !Number.isFinite(nextPosition.lng)) {
        toast.error("Unable to resolve the typed address on the map.");
        return;
      }

      syncLocationFields({
        latitude: String(nextPosition.lat),
        longitude: String(nextPosition.lng),
      });
      lastTypedQueryRef.current = typedAddressQuery;

      updateMarkerPosition(nextPosition, true);
      if (mapRef.current) {
        mapRef.current.setZoom(16);
      }

      if (showToast) {
        await reverseGeocodeAt(nextPosition.lat, nextPosition.lng);
        toast.success("Map location updated from the typed address.");
      }
    } catch (error) {
      console.error("Typed address geocoding failed:", error);
      if (showToast) {
        toast.error("Unable to set map location from the typed address.");
      }
    } finally {
      if (showToast) {
        setIsLocatingTypedAddress(false);
      }
    }
  }, [reverseGeocodeAt, syncLocationFields, typedAddressQuery, updateMarkerPosition, value]);

  const handleLocateTypedAddress = useCallback(async () => {
    setIsLocatingTypedAddress(true);
    await locateTypedAddress({ showToast: true });
  }, [locateTypedAddress]);

  useEffect(() => {
    if (!mapsReady) return;

    const query = typedAddressQuery;
    const shouldAutoLocate =
      query.length >= 3 &&
      (String(value?.city || "").trim().length >= 2 ||
        String(value?.street || "").trim().length >= 3 ||
        String(value?.zipCode || "").trim().length >= 5);

    if (!shouldAutoLocate) return;
    if (query === lastTypedQueryRef.current) return;

    if (typedAddressTimerRef.current) {
      clearTimeout(typedAddressTimerRef.current);
    }

    typedAddressTimerRef.current = window.setTimeout(() => {
      locateTypedAddress({ showToast: false });
    }, 500);

    return () => {
      if (typedAddressTimerRef.current) {
        clearTimeout(typedAddressTimerRef.current);
      }
    };
  }, [locateTypedAddress, mapsReady, typedAddressQuery, value?.city, value?.street, value?.zipCode]);

  const handleUseCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported on this device.");
      return;
    }

    setIsReadingMapLocation(true);
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const nextLat = Number(position?.coords?.latitude);
      const nextLng = Number(position?.coords?.longitude);
      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
        throw new Error("Invalid geolocation coordinates.");
      }

      updateMarkerPosition({ lat: nextLat, lng: nextLng }, true);
      if (mapRef.current) {
        mapRef.current.setZoom(16);
      }

      await reverseGeocodeAt(nextLat, nextLng);
      toast.success("Pinned to your current location.");
    } catch (error) {
      console.error("Current location pinning failed:", error);
      toast.error("Unable to fetch current location for the map.");
    } finally {
      setIsReadingMapLocation(false);
    }
  }, [reverseGeocodeAt, updateMarkerPosition]);

  return (
    <div className={`space-y-2 rounded-xl border border-gray-200 bg-white p-3 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-900">{title}</p>
          <p className="text-[11px] leading-4 text-gray-500">{description}</p>
        </div>
        <MapPin className="mt-0.5 h-4 w-4 text-[#ff8100]" />
      </div>

      <div
        ref={mapContainerRef}
        className="h-44 w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
      />

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-8 text-xs"
          onClick={handleLocateTypedAddress}
          disabled={mapsLoading || isLocatingTypedAddress}
        >
          <Navigation className="mr-1 h-3.5 w-3.5" />
          {isLocatingTypedAddress ? "Setting..." : "Set from typed address"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 text-xs"
          onClick={handleUseCurrentLocation}
          disabled={mapsLoading || isReadingMapLocation}
        >
          <LocateFixed className="mr-1 h-3.5 w-3.5" />
          {isReadingMapLocation ? "Locating..." : "Use current location"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
        <span className="rounded-full bg-orange-50 px-2 py-1 text-[#c55f00]">
          {latitude !== null && longitude !== null
            ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            : "No coordinates pinned yet"}
        </span>
        {mapsLoading ? <span>Loading map...</span> : null}
        {!mapsLoading && isReadingMapLocation ? <span>Updating address from map...</span> : null}
      </div>
    </div>
  );
}
