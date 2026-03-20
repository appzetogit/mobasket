import { Outlet, useLocation } from "react-router-dom";
import {
  useEffect,
  useState,
  createContext,
  useContext,
  useRef,
  useCallback,
} from "react";
import Lenis from "lenis";
import { ProfileProvider } from "../context/ProfileContext";
import LocationPrompt from "./LocationPrompt";
import { CartProvider } from "../context/CartContext";
import { OrdersProvider } from "../context/OrdersContext";
import SearchOverlay from "./SearchOverlay";
import LocationSelectorOverlay from "./LocationSelectorOverlay";
import BottomNavigation from "./BottomNavigation";
import DesktopNavbar from "./DesktopNavbar";

const SearchOverlayContext = createContext({
  isSearchOpen: false,
  searchValue: "",
  setSearchValue: () => {},
  openSearch: () => {},
  closeSearch: () => {},
});

export function useSearchOverlay() {
  const context = useContext(SearchOverlayContext);
  return context;
}

function SearchOverlayProvider({ children }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const searchOverlayHistoryRef = useRef(false);

  const pushOverlayHistoryState = useCallback((overlayName) => {
    if (typeof window === "undefined" || searchOverlayHistoryRef.current) return;

    const currentUrl =
      window.location.pathname + window.location.search + window.location.hash;
    const currentState = window.history.state || {};

    window.history.pushState(
      { ...currentState, __userOverlay: overlayName },
      "",
      currentUrl,
    );
    searchOverlayHistoryRef.current = true;
  }, []);

  const openSearch = () => {
    if (!isSearchOpen) {
      pushOverlayHistoryState("search");
    }
    setIsSearchOpen(true);
  };

  const closeSearch = useCallback((options = {}) => {
    const { restoreHistory = true, clearValue = true } = options;

    if (
      restoreHistory &&
      searchOverlayHistoryRef.current &&
      typeof window !== "undefined"
    ) {
      window.history.back();
      return;
    }

    searchOverlayHistoryRef.current = false;
    setIsSearchOpen(false);
    if (clearValue) {
      setSearchValue("");
    }
  }, []);

  useEffect(() => {
    if (!isSearchOpen) return undefined;

    const handlePopState = () => {
      searchOverlayHistoryRef.current = false;
      setIsSearchOpen(false);
      setSearchValue("");
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isSearchOpen]);

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

const LocationSelectorContext = createContext({
  isLocationSelectorOpen: false,
  openLocationSelector: () => {},
  closeLocationSelector: () => {},
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
  const locationOverlayHistoryRef = useRef(false);

  const pushOverlayHistoryState = useCallback((overlayName) => {
    if (typeof window === "undefined" || locationOverlayHistoryRef.current) return;

    const currentUrl =
      window.location.pathname + window.location.search + window.location.hash;
    const currentState = window.history.state || {};

    window.history.pushState(
      { ...currentState, __userOverlay: overlayName },
      "",
      currentUrl,
    );
    locationOverlayHistoryRef.current = true;
  }, []);

  const openLocationSelector = () => {
    if (!isLocationSelectorOpen) {
      pushOverlayHistoryState("location-selector");
    }
    setIsLocationSelectorOpen(true);
  };

  const closeLocationSelector = useCallback((options = {}) => {
    const { restoreHistory = true } = options;

    if (
      restoreHistory &&
      locationOverlayHistoryRef.current &&
      typeof window !== "undefined"
    ) {
      window.history.back();
      return;
    }

    locationOverlayHistoryRef.current = false;
    setIsLocationSelectorOpen(false);
  }, []);

  useEffect(() => {
    if (!isLocationSelectorOpen) return undefined;

    const handlePopState = () => {
      locationOverlayHistoryRef.current = false;
      setIsLocationSelectorOpen(false);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isLocationSelectorOpen]);

  return (
    <LocationSelectorContext.Provider
      value={{
        isLocationSelectorOpen,
        openLocationSelector,
        closeLocationSelector,
      }}
    >
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
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname, location.search, location.hash]);

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
