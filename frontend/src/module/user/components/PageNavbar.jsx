import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { ChevronDown, ShoppingCart, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "../hooks/useLocation";
import { useCart } from "../context/CartContext";
import { useProfile } from "../context/ProfileContext";
import { useLocationSelector } from "./UserLayout";
import { FaLocationDot } from "react-icons/fa6";
import {
  getCachedSettings,
  loadBusinessSettings,
} from "@/lib/utils/businessSettings";
import MoBasketLogo from "@/assets/mobasketlogo.png";

export default function PageNavbar({
  textColor = "white",
  zIndex = 20,
  showProfile = false,
  locationIconColor,
  onNavClick,
}) {
  const { location, loading } = useLocation();
  const { getFoodCartCount } = useCart();
  const { userProfile, addresses, getDefaultAddress } = useProfile();
  const { openLocationSelector } = useLocationSelector();
  const cartCount = getFoodCartCount();
  const [logoUrl, setLogoUrl] = useState(null);
  const [companyName, setCompanyName] = useState(null);
  // Keep navbar location stable. Location changes should come from explicit user action.
// Load business settings logo
  useEffect(() => {
    const loadLogo = async () => {
      try {
        // First check cache
        let cached = getCachedSettings();
        if (cached) {
          if (cached.logo?.url) {
            setLogoUrl(cached.logo.url);
          }
          if (cached.companyName) {
            setCompanyName(cached.companyName);
          }
        }

        // Always try to load fresh data to ensure we have the latest
        const settings = await loadBusinessSettings();
        if (settings) {
          if (settings.logo?.url) {
            setLogoUrl(settings.logo.url);
          }
          if (settings.companyName) {
            setCompanyName(settings.companyName);
          }
        }
      } catch (error) {
        console.error("Error loading logo:", error);
      }
    };

    // Load immediately
    loadLogo();

    // Also try after a small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      loadLogo();
    }, 100);

    // Listen for business settings updates
    const handleSettingsUpdate = () => {
      const cached = getCachedSettings();
      if (cached) {
        if (cached.logo?.url) {
          setLogoUrl(cached.logo.url);
        }
        if (cached.companyName) {
          setCompanyName(cached.companyName);
        }
      }
    };
    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener(
        "businessSettingsUpdated",
        handleSettingsUpdate,
      );
    };
  }, []);

  // Function to extract location parts for display
  // Main location: First 2 parts only (e.g., "Mama Loca, G-2")
  // Sub location: City and State (e.g., "New Palasia, Indore")
  const getLocationDisplay = (fullAddress, city, state, area) => {
    if (!fullAddress) {
      // Fallback: Use area and city/state if available
      if (area) {
        return {
          main: area,
          sub: city && state ? `${city}, ${state}` : city || state || "",
        };
      }
      if (city) {
        return {
          main: city,
          sub: state || "",
        };
      }
      return { main: "Select location", sub: "" };
    }

    // Split address by comma
    const parts = fullAddress
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    // Main location: First 2 parts only (e.g., "Mama Loca, G-2")
    let mainLocation = "";
    if (parts.length >= 2) {
      mainLocation = parts.slice(0, 2).join(", ");
    } else if (parts.length >= 1) {
      mainLocation = parts[0];
    }

    // Sub location: City and State (prefer from location object, fallback to address parts)
    let subLocation = "";
    if (city && state) {
      subLocation = `${city}, ${state}`;
    } else if (city) {
      subLocation = city;
    } else if (state) {
      subLocation = state;
    }

    return {
      main: mainLocation || "Select location",
      sub: subLocation,
    };
  };

  // Get display location parts
  // Priority: formattedAddress (complete) > address > area/city
  // IMPORTANT: Sub location ALWAYS uses city and state from location object, never from address parts
    const locationDisplay = (() => {
    const normalizeText = (value) => String(value || "").trim();
    const isCoordinates = (value) => /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(normalizeText(value));
    const isGeneric = (value, city, state) => {
      const text = normalizeText(value).toLowerCase();
      if (!text) return true;
      if (["select location", "current location", "home", "office", "work", "other", "india"].includes(text)) return true;
      if (text.includes("district") || text.includes("division") || text.includes("zone")) return true;
      if (city && text === normalizeText(city).toLowerCase()) return true;
      if (state && text === normalizeText(state).toLowerCase()) return true;
      return false;
    };

    const extractMain = (loc) => {
      if (!loc || typeof loc !== "object") return "";
      const city = normalizeText(loc?.city);
      const state = normalizeText(loc?.state);

      const directCandidates = [
        loc?.address,
        loc?.mainTitle,
        loc?.street,
        loc?.additionalDetails,
        loc?.area,
      ];

      for (const candidate of directCandidates) {
        const text = normalizeText(candidate);
        if (!text || isCoordinates(text) || isGeneric(text, city, state)) continue;
        return text;
      }

      const formatted = normalizeText(loc?.formattedAddress);
      if (formatted && !isCoordinates(formatted) && formatted !== "Select location") {
        const firstPart = normalizeText(formatted.split(",")[0]);
        if (firstPart && !isGeneric(firstPart, city, state)) {
          return firstPart;
        }
      }

      return city || "Select location";
    };

    let storedLocation = null;
    let storedAddresses = [];
    let defaultSavedAddress = null;
    let source = "";
    try {
      source = normalizeText(localStorage.getItem("userLocationSource")).toLowerCase();
      const raw = localStorage.getItem("userLocation");
      storedLocation = raw ? JSON.parse(raw) : null;
      const rawAddresses = localStorage.getItem("userAddresses");
      storedAddresses = rawAddresses ? JSON.parse(rawAddresses) : [];
    } catch {
      storedLocation = null;
      storedAddresses = [];
    }

    if (Array.isArray(addresses) && addresses.length > 0) {
      const fromContextDefault = typeof getDefaultAddress === "function" ? getDefaultAddress() : null;
      if (fromContextDefault && typeof fromContextDefault === "object") {
        defaultSavedAddress = fromContextDefault;
      } else {
        defaultSavedAddress =
          addresses.find((addr) => addr?.isDefault === true || addr?.default === true) || addresses[0] || null;
      }
    } else if (Array.isArray(storedAddresses) && storedAddresses.length > 0) {
      defaultSavedAddress =
        storedAddresses.find((addr) => addr?.isDefault === true || addr?.default === true) || storedAddresses[0] || null;
    }

    // Respect explicit user selection first (saved/current), then fall back.
    const explicitlySelectedLocation =
      (source === "saved" || source === "current") && storedLocation
        ? storedLocation
        : null;
    const preferredLocation =
      explicitlySelectedLocation ||
      location ||
      defaultSavedAddress ||
      storedLocation ||
      {};
    const mainLocation = extractMain(preferredLocation);

    const subParts = [normalizeText(preferredLocation?.city), normalizeText(preferredLocation?.state)].filter(Boolean);
    const subLocation = subParts.join(", ");

    return {
      main: mainLocation || "Select location",
      sub: subLocation,
    };
  })();

  const mainLocationName = locationDisplay.main;
  const subLocationName = locationDisplay.sub;

  const handleLocationClick = () => {
    // Open location selector overlay
    openLocationSelector();
  };

  const textColorClass = textColor === "white" ? "text-white" : "text-black";
  const iconFill =
    locationIconColor || (textColor === "white" ? "white" : "black");
  const ringColor =
    textColor === "white" ? "ring-white/30" : "ring-gray-800/30";

  const zIndexClass = zIndex === 50 ? "z-50" : "z-20";
  const profileImageUrl =
    (typeof userProfile?.profileImage === "string" &&
      userProfile.profileImage.trim()) ||
    (typeof userProfile?.profileImage?.url === "string" &&
      userProfile.profileImage.url.trim()) ||
    "";
  const profileInitial =
    userProfile?.name?.trim()?.charAt(0)?.toUpperCase() ||
    userProfile?.phone?.trim()?.charAt(0)?.toUpperCase() ||
    userProfile?.email?.trim()?.charAt(0)?.toUpperCase() ||
    "U";

  return (
    <nav
      className={`relative ${zIndexClass} w-full px-1 pr-2 sm:px-2 sm:pr-3 md:px-3 lg:px-6 xl:px-8 py-1.5 sm:py-3 lg:py-4`}
      onClick={onNavClick}
    >
      <div className="flex items-center justify-between gap-2 sm:gap-3 md:gap-4 lg:gap-6 max-w-7xl mx-auto">
        {/* Left: Location - Hidden on desktop, shown on mobile */}
        <div className="flex-1 flex md:hidden items-center gap-3 sm:gap-4 min-w-0">
          {/* Location Button */}
          <Button
            variant="ghost"
            onClick={handleLocationClick}
            disabled={loading}
            className="h-auto px-0 py-0 hover:bg-transparent transition-colors min-w-0 max-w-full"
          >
            {loading ? (
              <span
                className={`text-sm font-bold ${textColorClass} ${textColor === "white" ? "drop-shadow-lg" : ""}`}
              >
                Loading...
              </span>
            ) : (
              <div className="flex flex-col items-start min-w-0">
                <div className="flex items-start gap-1.5 w-full min-w-0">
                  <FaLocationDot
                    className={`h-6 w-6 sm:h-7 sm:w-7 ${textColorClass} flex-shrink-0 ${textColor === "white" ? "drop-shadow-lg" : ""}`}
                    fill={iconFill}
                    strokeWidth={2}
                  />
                  <span
                    className={`text-md sm:text-lg font-bold ${textColorClass} whitespace-normal break-words leading-tight text-left ${textColor === "white" ? "drop-shadow-lg" : ""}`}
                  >
                    {mainLocationName}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 sm:h-5 sm:w-5 mt-0.5 ${textColorClass} flex-shrink-0 ${textColor === "white" ? "drop-shadow-lg" : ""}`}
                    strokeWidth={2.5}
                  />
                </div>
                {/* Show sub location (city, state) in second line */}
                {subLocationName && (
                  <span
                    className={`text-xs font-bold ${textColorClass}${textColor === "white" ? "/90" : ""} whitespace-normal break-words mt-0.5 text-left ${textColor === "white" ? "drop-shadow-md" : ""}`}
                  >
                    {subLocationName}
                  </span>
                )}
              </div>
            )}
          </Button>
        </div>

        {/* Center: Company Logo or Name - Removed as per request (now in banner) */}
        {/* Center: Company Logo */}
        <div className="flex items-center justify-center">
          <img
            src={logoUrl || MoBasketLogo}
            alt="MoBasket"
            className="h-8 w-auto object-contain"
            onError={(e) => {
              if (e.target.src !== MoBasketLogo) {
                e.target.src = MoBasketLogo;
              }
            }}
          />
        </div>

        {/* Right: Actions - Hidden on desktop, shown on mobile */}
        <div className="flex md:hidden items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Wallet Icon */}
          <Link to="/user/wallet">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-full p-0 hover:opacity-80 transition-opacity"
              title="Wallet"
            >
              <div
                className={`h-full w-full rounded-full bg-white/20 flex items-center justify-center ring-2 ${ringColor}`}
              >
                <Wallet
                  className="h-4 w-4 sm:h-5 sm:w-5 text-gray-800"
                  strokeWidth={2}
                />
              </div>
            </Button>
          </Link>

          {/* Cart Icon */}
          <Link to="/user/cart">
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8 sm:h-9 sm:w-9 rounded-full p-0 hover:opacity-80 transition-opacity"
              title="Cart"
            >
              <div
                className={`h-full w-full rounded-full bg-white/20 flex items-center justify-center ring-2 ${ringColor}`}
              >
                <ShoppingCart
                  className="h-4 w-4 sm:h-5 sm:w-5 text-gray-800"
                  strokeWidth={2}
                />
              </div>
              {cartCount > 0 && (
                <span
                  className={`absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#EF4F5F] rounded-full flex items-center justify-center ring-2 ${textColor === "white" ? "ring-white/50" : "ring-gray-800/30"}`}
                >
                  <span className="text-[9px] font-bold text-white">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                </span>
              )}
            </Button>
          </Link>

          {/* Profile - Only shown if showProfile is true */}
          {showProfile && (
            <Link to="/user/profile">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-full p-0 hover:opacity-80 transition-opacity"
                title="Profile"
              >
                <div
                  className={`h-full w-full rounded-full bg-white flex items-center justify-center shadow-lg ring-2 ${ringColor}`}
                >
                  {profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt="Profile"
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-black text-xs sm:text-sm font-extrabold">
                      {profileInitial}
                    </span>
                  )}
                </div>
              </Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}





