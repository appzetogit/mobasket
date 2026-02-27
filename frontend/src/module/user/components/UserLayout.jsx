import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState, createContext, useContext, useRef } from "react";
import Lenis from "lenis";
import { ProfileProvider } from "../context/ProfileContext";
import LocationPrompt from "./LocationPrompt";
import { CartProvider } from "../context/CartContext";
import { OrdersProvider } from "../context/OrdersContext";
import SearchOverlay from "./SearchOverlay";
import LocationSelectorOverlay from "./LocationSelectorOverlay";
import BottomNavigation from "./BottomNavigation";
import DesktopNavbar from "./DesktopNavbar";

// Create SearchOverlay context with default value
const SearchOverlayContext = createContext({
  isSearchOpen: false,
  searchValue: "",
  setSearchValue: () => {
    console.warn("SearchOverlayProvider not available");
  },
  openSearch: () => {
    console.warn("SearchOverlayProvider not available");
  },
  closeSearch: () => { },
});

export function useSearchOverlay() {
  const context = useContext(SearchOverlayContext);
  // Always return context, even if provider is not available (will use default values)
  return context;
}

function SearchOverlayProvider({ children }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const openSearch = () => {
    setIsSearchOpen(true);
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchValue("");
  };

  return (
    <SearchOverlayContext.Provider
      value={{
        isSearchOpen,
        searchValue,
        setSearchValue,
        openSearch,
        closeSearch,
      }}
    >
      {children}
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={closeSearch}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
      />
    </SearchOverlayContext.Provider>
  );
}

// Create LocationSelector context with default value
const LocationSelectorContext = createContext({
  isLocationSelectorOpen: false,
  openLocationSelector: () => {
    console.warn("LocationSelectorProvider not available");
  },
  closeLocationSelector: () => { },
});

export function useLocationSelector() {
  const context = useContext(LocationSelectorContext);
  if (!context) {
    throw new Error(
      "useLocationSelector must be used within LocationSelectorProvider",
    );
  }
  return context;
}

function LocationSelectorProvider({ children }) {
  const [isLocationSelectorOpen, setIsLocationSelectorOpen] = useState(false);

  const openLocationSelector = () => {
    setIsLocationSelectorOpen(true);
  };

  const closeLocationSelector = () => {
    setIsLocationSelectorOpen(false);
  };

  const value = {
    isLocationSelectorOpen,
    openLocationSelector,
    closeLocationSelector,
  };

  return (
    <LocationSelectorContext.Provider value={value}>
      {children}
      <LocationSelectorOverlay
        isOpen={isLocationSelectorOpen}
        onClose={closeLocationSelector}
      />
    </LocationSelectorContext.Provider>
  );
}

export default function UserLayout() {
  const location = useLocation();
  const rafRef = useRef(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: true,
    });

    const raf = (time) => {
      lenis.raf(time);
      rafRef.current = requestAnimationFrame(raf);
    };

    rafRef.current = requestAnimationFrame(raf);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lenis.destroy();
      rafRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Reset scroll to top whenever location changes (pathname, search, or hash)
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname, location.search, location.hash]);

  // Note: Authentication checks and redirects are handled by ProtectedRoute components
  // UserLayout should not interfere with authentication redirects

  // Show bottom navigation only on home page, under-250 page, and profile page
  const showBottomNav =
    location.pathname === "/home" ||
    location.pathname === "/user" ||
    location.pathname === "/under-250" ||
    location.pathname === "/user/under-250" ||
    location.pathname === "/profile" ||
    location.pathname === "/user/profile" ||
    location.pathname.startsWith("/user/profile");

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] transition-colors duration-200">
      <CartProvider>
        <ProfileProvider>
          <OrdersProvider>
            <SearchOverlayProvider>
              <LocationSelectorProvider>
                {/* <Navbar /> */}
                {showBottomNav && <DesktopNavbar />}
                <LocationPrompt />
                <Outlet />
                {showBottomNav && <BottomNavigation />}
              </LocationSelectorProvider>
            </SearchOverlayProvider>
          </OrdersProvider>
        </ProfileProvider>
      </CartProvider>
    </div>
  );
}
