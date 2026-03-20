import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu,
  Search,
  User,
  ChevronDown,
  LogOut,
  Settings,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { adminAPI } from "@/lib/api";
import { clearModuleAuth } from "@/lib/utils/auth";
import { getCachedSettings, loadBusinessSettings } from "@/lib/utils/businessSettings";
import { sidebarMenuData, mogroceryMenuData } from "../data/sidebarMenu";
import { usePlatform } from "../context/PlatformContext";

const SEARCH_HISTORY_KEY = "adminUniversalSearchHistory";
const MAX_SEARCH_HISTORY = 8;

const getStoredAdminUser = () => {
  try {
    const adminUserStr = localStorage.getItem("admin_user");
    return adminUserStr ? JSON.parse(adminUserStr) : null;
  } catch {
    return null;
  }
};

const getStoredSearchHistory = () => {
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string" && item.trim())
      : [];
  } catch {
    return [];
  }
};

const buildAccessibleMenuData = (rawMenuData, adminUser) => {
  const role = String(adminUser?.role || "").toLowerCase();
  const isSuperAdmin = role === "super_admin";
  const allowedPaths = new Set(
    Array.isArray(adminUser?.sidebarAccess)
      ? adminUser.sidebarAccess.map((entry) => String(entry || "").trim())
      : []
  );
  const hasCustomAccess = allowedPaths.size > 0;

  const canAccessPath = (path) => {
    const normalized = String(path || "").trim();
    if (!normalized) return false;
    if (normalized === "/admin/manage-admin") return isSuperAdmin;
    if (normalized === "/admin" || normalized === "/admin/profile") return true;
    if (isSuperAdmin) return true;
    if (!hasCustomAccess) return true;
    return allowedPaths.has(normalized);
  };

  const filteredByAccess = rawMenuData.reduce((acc, entry) => {
    if (entry?.type === "link") {
      if (canAccessPath(entry.path)) acc.push(entry);
      return acc;
    }

    if (entry?.type !== "section" || !Array.isArray(entry.items)) return acc;

    const items = entry.items
      .map((item) => {
        if (item?.type === "link") {
          return canAccessPath(item.path) ? item : null;
        }
        if (item?.type === "expandable" && Array.isArray(item.subItems)) {
          const subItems = item.subItems.filter((subItem) => canAccessPath(subItem?.path));
          if (subItems.length === 0) return null;
          return { ...item, subItems };
        }
        return null;
      })
      .filter(Boolean);

    if (items.length > 0) {
      acc.push({ ...entry, items });
    }
    return acc;
  }, []);

  return filteredByAccess.map((entry) => {
    if (entry.type !== "section" || !Array.isArray(entry.items)) {
      return entry;
    }

    const items = entry.items.map((item) => {
      if (
        item.type === "expandable" &&
        item.label === "Pages & Social Media" &&
        Array.isArray(item.subItems)
      ) {
        const hasTerms = item.subItems.some(
          (sub) => sub.path === "/admin/pages-social-media/terms"
        );

        if (hasTerms) return item;

        return {
          ...item,
          subItems: [
            { label: "Terms of Service", path: "/admin/pages-social-media/terms" },
            ...item.subItems,
          ],
        };
      }

      return item;
    });

    return { ...entry, items };
  });
};

const flattenMenuForSearch = (menuData) => {
  const resultsByPath = new Map();

  menuData.forEach((entry) => {
    if (entry?.type === "link" && entry.path) {
      resultsByPath.set(entry.path, {
        title: entry.label,
        path: entry.path,
        type: "Navigation",
        description: "Main menu",
        sectionLabel: "",
        parentLabel: "",
      });
      return;
    }

    if (entry?.type !== "section" || !Array.isArray(entry.items)) return;

    entry.items.forEach((item) => {
      if (item?.type === "link" && item.path) {
        resultsByPath.set(item.path, {
          title: item.label,
          path: item.path,
          type: "Navigation",
          description: entry.label,
          sectionLabel: entry.label,
          parentLabel: "",
        });
        return;
      }

      if (item?.type === "expandable" && Array.isArray(item.subItems)) {
        item.subItems.forEach((subItem) => {
          if (!subItem?.path) return;
          resultsByPath.set(subItem.path, {
            title: subItem.label,
            path: subItem.path,
            type: item.label,
            description: entry.label,
            sectionLabel: entry.label,
            parentLabel: item.label,
          });
        });
      }
    });
  });

  return Array.from(resultsByPath.values());
};

const persistSearchHistory = (term) => {
  const normalizedTerm = String(term || "").trim();
  if (!normalizedTerm) return getStoredSearchHistory();

  const nextHistory = [
    normalizedTerm,
    ...getStoredSearchHistory().filter(
      (entry) => entry.toLowerCase() !== normalizedTerm.toLowerCase()
    ),
  ].slice(0, MAX_SEARCH_HISTORY);

  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(nextHistory));
  return nextHistory;
};

export default function AdminNavbar({ onMenuClick }) {
  const navigate = useNavigate();
  const { platform } = usePlatform();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [adminData, setAdminData] = useState(getStoredAdminUser);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [recentSearchHistory, setRecentSearchHistory] = useState(getStoredSearchHistory);
  const searchInputRef = useRef(null);

  // Load admin data from localStorage
  useEffect(() => {
    const loadAdminData = () => {
      setAdminData(getStoredAdminUser());
    };

    loadAdminData();

    // Listen for auth changes
    const handleAuthChange = () => {
      loadAdminData();
    };
    window.addEventListener('adminAuthChanged', handleAuthChange);
    
    return () => {
      window.removeEventListener('adminAuthChanged', handleAuthChange);
    };
  }, []);

  // Load business settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await loadBusinessSettings();
        if (settings) {
          setBusinessSettings(settings);
        } else {
          // Try to get from cache
          const cached = getCachedSettings();
          if (cached) {
            setBusinessSettings(cached);
          }
        }
      } catch (error) {
        console.warn('Error loading business settings in navbar:', error);
      }
    };

    loadSettings();

    // Listen for business settings updates
    const handleSettingsUpdate = () => {
      loadSettings();
    };
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate);
    
    return () => {
      window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate);
    };
  }, []);

  // Keyboard shortcut for search (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  // Focus search input when modal opens
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [searchOpen]);

  const searchableMenuItems = useMemo(() => {
    const rawMenuData = platform === "mogrocery" ? mogroceryMenuData : sidebarMenuData;
    return flattenMenuForSearch(buildAccessibleMenuData(rawMenuData, adminData));
  }, [adminData, platform]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const getMatchPriority = (item) => {
      const title = item.title.toLowerCase();
      const parentLabel = item.parentLabel.toLowerCase();
      const sectionLabel = item.sectionLabel.toLowerCase();
      const path = item.path.toLowerCase();

      if (title === query) return 0;
      if (title.startsWith(query)) return 1;
      if (title.includes(query)) return 2;
      if (parentLabel.startsWith(query)) return 3;
      if (parentLabel.includes(query)) return 4;
      if (sectionLabel.startsWith(query)) return 5;
      if (sectionLabel.includes(query)) return 6;
      if (path.includes(query)) return 7;
      return 8;
    };

    return searchableMenuItems
      .filter((item) => {
        const searchableText = [
          item.title,
          item.type,
          item.description,
          item.sectionLabel,
          item.parentLabel,
          item.path,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      })
      .sort((a, b) => {
        const priorityDiff = getMatchPriority(a) - getMatchPriority(b);
        if (priorityDiff !== 0) return priorityDiff;
        return a.title.localeCompare(b.title);
      });
  }, [searchQuery, searchableMenuItems]);

  const handleSearchResultSelect = (path) => {
    const normalizedQuery = searchQuery.trim();

    if (normalizedQuery) {
      setRecentSearchHistory(persistSearchHistory(normalizedQuery));
    }

    navigate(path);
    setSearchOpen(false);
    setSearchQuery("");
  };

  const handleSearchHistoryClick = (term) => {
    setSearchQuery(term);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter" && searchResults.length > 0) {
      event.preventDefault();
      handleSearchResultSelect(searchResults[0].path);
    }
  };


  // Handle logout
  const handleLogout = async () => {
    try {
      // Call backend logout API to clear refresh token cookie
      try {
        await adminAPI.logout();
      } catch (apiError) {
        // Continue with logout even if API call fails (network issues, etc.)
        console.warn("Logout API call failed, continuing with local cleanup:", apiError);
      }

      // Clear admin authentication data from localStorage
      clearModuleAuth('admin');
      localStorage.removeItem('admin_accessToken');
      localStorage.removeItem('admin_authenticated');
      localStorage.removeItem('admin_user');

      // Clear sessionStorage if any
      sessionStorage.removeItem('adminAuthData');

      // Dispatch auth change event to notify other components
      window.dispatchEvent(new Event('adminAuthChanged'));

      // Navigate to admin login page
      navigate('/admin/login', { replace: true });
    } catch (error) {
      // Even if there's an error, we should still clear local data and logout
      console.error("Error during logout:", error);
      
      // Clear local data anyway
      clearModuleAuth('admin');
      localStorage.removeItem('admin_accessToken');
      localStorage.removeItem('admin_authenticated');
      localStorage.removeItem('admin_user');
      sessionStorage.removeItem('adminAuthData');
      window.dispatchEvent(new Event('adminAuthChanged'));

      // Navigate to login
      navigate('/admin/login', { replace: true });
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b border-neutral-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-3">
          {/* Left: Logo and Mobile Menu */}
          <div className="flex items-center gap-3">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-md text-neutral-700 hover:bg-neutral-100 hover:text-black transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-36 h-16 rounded-lg bg-white flex items-center justify-center ring-neutral-200">
                {businessSettings?.logo?.url ? (
                  <img 
                    src={businessSettings.logo.url} 
                    alt={businessSettings.companyName || "Company"} 
                    className="w-36 h-14 object-contain" 
                    loading="lazy"
                    onError={(e) => {
                      // Hide broken image instead of showing a static fallback.
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  businessSettings?.companyName ? (
                    <span className="text-base font-semibold text-neutral-700 px-2 truncate">
                      {businessSettings.companyName}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          </div>

          {/* Center: Search Bar */}
          <div className="flex-1 flex justify-center max-w-md mx-8">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-100 text-neutral-600 cursor-pointer hover:bg-neutral-200 transition-colors w-full border border-neutral-200"
            >
              <Search className="w-4 h-4 text-neutral-700" />
              <span className="text-sm flex-1 text-left text-neutral-700">Search</span>
              <span className="text-xs px-2 py-0.5 rounded bg-white text-neutral-600 border border-neutral-200">
                Ctrl+K
              </span>
            </button>
          </div>

          {/* Right: Notifications and User Profile */}
          <div className="flex items-center gap-3">
            {/* User Profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-2 pl-3 border-l border-neutral-200 cursor-pointer hover:bg-neutral-100 rounded-md px-2 py-1 transition-colors">

                  <div className="hidden md:block">
                    <p className="text-sm font-medium text-neutral-900">
                      {adminData?.name || "Admin User"}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {adminData?.email
                        ? (() => {
                            const [local, domain] = adminData.email.split("@");
                            return (
                              local[0] +
                              "*".repeat(Math.min(local.length - 1, 5)) +
                              "@" +
                              domain
                            );
                          })()
                        : "admin@example.com"}
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-neutral-700 hidden md:block" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className="w-64 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 text-neutral-900 animate-in fade-in-0 zoom-in-95 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
              >
                <div className="p-4 border-b border-neutral-200">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center overflow-hidden border border-neutral-300">
                      {adminData?.profileImage ? (
                        <img
                          src={adminData.profileImage && adminData.profileImage.trim() ? adminData.profileImage : undefined}
                          alt={adminData.name || "Admin"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-semibold text-neutral-600">
                          {adminData?.name
                            ? adminData.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()
                                .substring(0, 2)
                            : "AD"}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">
                        {adminData?.name || "Admin User"}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {adminData?.email
                          ? (() => {
                              const [local, domain] = adminData.email.split("@");
                              return (
                                local[0] +
                                "*".repeat(Math.min(local.length - 1, 5)) +
                                "@" +
                                domain
                              );
                            })()
                          : "admin@example.com"}
                      </p>
                    </div>
                  </div>
                </div>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className="cursor-pointer hover:bg-neutral-100 focus:bg-neutral-100"
                    onClick={() => navigate("/admin/profile")}
                  >
                    <User className="mr-2 w-4 h-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer hover:bg-neutral-100 focus:bg-neutral-100"
                    onClick={() => navigate("/admin/settings")}
                  >
                    <Settings className="mr-2 w-4 h-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 w-4 h-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Search Modal */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-2xl p-0 bg-white opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 ease-in-out data-[state=open]:scale-100 data-[state=closed]:scale-100 border border-neutral-200">
          <DialogHeader className="p-6 pb-4 border-b border-neutral-200">
            <DialogTitle className="text-xl font-semibold text-neutral-900">
              Universal Search
            </DialogTitle>
          </DialogHeader>
          <div className="p-6">
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search sidebar sections and menu items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="pl-10 pr-4 py-3 text-base border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-500 focus:border-black focus:ring-black"
              />
            </div>

            {searchQuery.trim() === "" ? (
              <div className="space-y-4">
                {recentSearchHistory.length > 0 ? (
                  <div>
                    <p className="text-sm text-neutral-500 mb-3">Search History</p>
                    <div className="flex flex-wrap gap-2">
                      {recentSearchHistory.map((term, idx) => (
                        <button
                          key={`${term}-${idx}`}
                          onClick={() => handleSearchHistoryClick(term)}
                          className="px-3 py-1 text-xs bg-neutral-100 hover:bg-neutral-200 rounded-full text-neutral-700 transition-colors"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Search className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                    <p className="text-sm text-neutral-500">
                      Start typing to search sidebar sections and menu items
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertCircle className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                    <p className="text-sm text-neutral-500">No results found for "{searchQuery}"</p>
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-neutral-600 mb-3">
                      {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
                    </div>
                    {searchResults.map((result, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSearchResultSelect(result.path)}
                        className="w-full flex items-center gap-4 p-4 rounded-lg border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-all text-left"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-neutral-900">{result.title}</p>
                            <span className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded">
                              {result.type}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-600 mt-1">{result.description}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-neutral-400" />
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

