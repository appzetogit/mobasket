import { useState, useEffect, useMemo } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  Search,
  FileText,
  Calendar,
  Clock,
  Receipt,
  MapPin,
  Link as LinkIcon,
  UtensilsCrossed,
  Building2,
  FolderTree,
  Plus,
  Utensils,
  Megaphone,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  LayoutDashboard,
  Gift,
  DollarSign,
  Image,
  Bell,
  MessageSquare,
  Mail,
  Users,
  Wallet,
  Award,
  Truck,
  Package,
  CreditCard,
  Settings,
  UserCog,
  User,
  Globe,
  Palette,
  Camera,
  LogIn,
  Database,
  Zap,
  Phone,
  IndianRupee,
  PiggyBank,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { sidebarMenuData, mogroceryMenuData } from "../data/sidebarMenu"
import { getCachedSettings, loadBusinessSettings } from "@/lib/utils/businessSettings"
import { usePlatform } from "../context/PlatformContext"

// Icon mapping
const iconMap = {
  LayoutDashboard,
  UtensilsCrossed,
  Building2,
  FileText,
  Calendar,
  Clock,
  Receipt,
  MapPin,
  Link: LinkIcon,
  FolderTree,
  Plus,
  Utensils,
  Megaphone,
  Gift,
  DollarSign,
  Image,
  Bell,
  MessageSquare,
  Mail,
  Users,
  Wallet,
  Award,
  Truck,
  Package,
  CreditCard,
  Settings,
  UserCog,
  User,
  Globe,
  Palette,
  Camera,
  LogIn,
  Database,
  Zap,
  Phone,
  IndianRupee,
  PiggyBank,
  CheckCircle2,
  AlertTriangle,
}

export default function AdminSidebar({ isOpen = false, onClose, onCollapseChange }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")
  const [logoUrl, setLogoUrl] = useState(null)
  const [companyName, setCompanyName] = useState(null)
  const [adminUser] = useState(() => {
    try {
      const raw = localStorage.getItem("admin_user")
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const { platform, switchPlatform } = usePlatform()

  const handlePlatformSwitch = (nextPlatform) => {
    if (nextPlatform === platform) return
    const pathMapping = {
      "/admin/hero-banner-management": "/admin/grocery-hero-banner-management",
      "/admin/grocery-hero-banner-management": "/admin/hero-banner-management",
    }
    const nextPath =
      location.pathname === "/admin/product-sections-management"
        ? (nextPlatform === "mogrocery" ? "/admin/product-sections-management" : "/admin/hero-banner-management")
        : (pathMapping[location.pathname] || location.pathname)
    switchPlatform(nextPlatform)
    navigate(nextPath, {
      replace: true,
      state: { platformSwitchedAt: Date.now(), platform: nextPlatform },
    })
  }
  
  // Get menu data based on platform
  const rawMenuData = platform === "mogrocery" ? mogroceryMenuData : sidebarMenuData
  const menuData = useMemo(() => {
    const role = String(adminUser?.role || "").toLowerCase()
    const isSuperAdmin = role === "super_admin"
    const allowedPaths = new Set(
      Array.isArray(adminUser?.sidebarAccess) ? adminUser.sidebarAccess.map((entry) => String(entry || "").trim()) : []
    )
    const hasCustomAccess = allowedPaths.size > 0

    const canAccessPath = (path) => {
      const normalized = String(path || "").trim()
      if (!normalized) return false
      if (normalized === "/admin/manage-admin") return isSuperAdmin
      if (normalized === "/admin" || normalized === "/admin/profile") return true
      if (isSuperAdmin) return true
      if (!hasCustomAccess) return true
      return allowedPaths.has(normalized)
    }

    const filteredByAccess = rawMenuData.reduce((acc, entry) => {
      if (entry?.type === "link") {
        if (canAccessPath(entry.path)) acc.push(entry)
        return acc
      }

      if (entry?.type !== "section" || !Array.isArray(entry.items)) return acc

      const items = entry.items
        .map((item) => {
          if (item?.type === "link") {
            return canAccessPath(item.path) ? item : null
          }
          if (item?.type === "expandable" && Array.isArray(item.subItems)) {
            const subItems = item.subItems.filter((subItem) => canAccessPath(subItem?.path))
            if (subItems.length === 0) return null
            return { ...item, subItems }
          }
          return null
        })
        .filter(Boolean)

      if (items.length > 0) {
        acc.push({ ...entry, items })
      }
      return acc
    }, [])

    return filteredByAccess.map((entry) => {
      if (entry.type !== "section" || !Array.isArray(entry.items)) {
        return entry
      }

      const items = entry.items.map((item) => {
        if (
          item.type === "expandable" &&
          item.label === "Pages & Social Media" &&
          Array.isArray(item.subItems)
        ) {
          const hasTerms = item.subItems.some(
            (sub) => sub.path === "/admin/pages-social-media/terms"
          )

          if (hasTerms) return item

          return {
            ...item,
            subItems: [
              { label: "Terms of Service", path: "/admin/pages-social-media/terms" },
              ...item.subItems,
            ],
          }
        }

        return item
      })

      return { ...entry, items }
    })
  }, [adminUser, rawMenuData])

  // Load business settings logo
  useEffect(() => {
    const loadLogo = async () => {
      try {
        // First check cache
        let cached = getCachedSettings()
        if (cached) {
          if (cached.logo?.url) {
            setLogoUrl(cached.logo.url)
          }
          if (cached.companyName) {
            setCompanyName(cached.companyName)
          }
        }
        
        // Always try to load fresh data to ensure we have the latest
        const settings = await loadBusinessSettings()
        if (settings) {
          if (settings.logo?.url) {
            setLogoUrl(settings.logo.url)
          }
          if (settings.companyName) {
            setCompanyName(settings.companyName)
          }
        }
      } catch (error) {
        console.error('Error loading logo:', error)
      }
    }
    
    // Load immediately
    loadLogo()
    
    // Also try after a small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      loadLogo()
    }, 100)

    // Listen for business settings updates
    const handleSettingsUpdate = () => {
      const cached = getCachedSettings()
      if (cached) {
        if (cached.logo?.url) {
          setLogoUrl(cached.logo.url)
        }
        if (cached.companyName) {
          setCompanyName(cached.companyName)
        }
      }
    }
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate)
    
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate)
    }
  }, [])
  
  // Get initial collapsed state from localStorage
  const getInitialCollapsedState = () => {
    try {
      const saved = localStorage.getItem('adminSidebarCollapsed')
      if (saved !== null) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('Error loading sidebar collapsed state:', e)
    }
    return false
  }
  
  const [isCollapsed, setIsCollapsed] = useState(getInitialCollapsedState)
  
  // Save collapsed state to localStorage and notify parent
  useEffect(() => {
    try {
      localStorage.setItem('adminSidebarCollapsed', JSON.stringify(isCollapsed))
      if (onCollapseChange) {
        onCollapseChange(isCollapsed)
      }
    } catch (e) {
      console.error('Error saving sidebar collapsed state:', e)
    }
  }, [isCollapsed, onCollapseChange])
  
  // Notify parent on initial load
  useEffect(() => {
    if (onCollapseChange) {
      onCollapseChange(isCollapsed)
    }
  }, [])
  
  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev)
  }

  // Generate initial expanded state from menu data
  const getInitialExpandedState = () => {
    const storageKey = `adminSidebarExpanded:${platform}`
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('Error loading sidebar state:', e)
    }
    const state = {}
    menuData.forEach((item) => {
      if (item.type === "section") {
        item.items.forEach((subItem) => {
          if (subItem.type === "expandable") {
            state[subItem.label.toLowerCase().replace(/\s+/g, "")] = false
          }
        })
      }
    })
    return state
  }

  const [expandedSections, setExpandedSections] = useState(getInitialExpandedState)

  const buildCollapsedSectionsState = () => {
    const state = {}
    menuData.forEach((entry) => {
      if (entry.type === "section") {
        entry.items.forEach((subItem) => {
          if (subItem.type === "expandable") {
            state[subItem.label.toLowerCase().replace(/\s+/g, "")] = false
          }
        })
      }
    })
    return state
  }

  // Filter menu items based on search query
  const filteredMenuData = useMemo(() => {
    if (!searchQuery.trim()) {
      return menuData
    }

    const query = searchQuery.toLowerCase().trim()
    const filtered = []

    menuData.forEach((item) => {
      if (item.type === "link") {
        if (item.label.toLowerCase().includes(query)) {
          filtered.push(item)
        }
      } else if (item.type === "section") {
        const filteredItems = []
        
        item.items.forEach((subItem) => {
          if (subItem.type === "link") {
            if (subItem.label.toLowerCase().includes(query)) {
              filteredItems.push(subItem)
            }
          } else if (subItem.type === "expandable") {
            const matchesLabel = subItem.label.toLowerCase().includes(query)
            const matchingSubItems = subItem.subItems?.filter(
              (si) => si.label.toLowerCase().includes(query)
            ) || []
            
            if (matchesLabel || matchingSubItems.length > 0) {
              filteredItems.push({
                ...subItem,
                subItems: matchesLabel ? subItem.subItems : matchingSubItems,
              })
            }
          }
        })

        if (filteredItems.length > 0) {
          filtered.push({
            ...item,
            items: filteredItems,
          })
        }
      }
    })

    return filtered
  }, [searchQuery, menuData])

  // Auto-expand sections with matches when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      
      setExpandedSections((prev) => {
        const newExpandedState = { ...prev }
        
        menuData.forEach((item) => {
          if (item.type === "section") {
            item.items.forEach((subItem) => {
              if (subItem.type === "expandable") {
                const matchesLabel = subItem.label.toLowerCase().includes(query)
                const hasMatchingSubItems = subItem.subItems?.some(
                  (si) => si.label.toLowerCase().includes(query)
                )
                
                if (matchesLabel || hasMatchingSubItems) {
                  const sectionKey = subItem.label.toLowerCase().replace(/\s+/g, "")
                  newExpandedState[sectionKey] = true
                }
              }
            })
          }
        })
        
        return newExpandedState
      })
    }
  }, [searchQuery, menuData])

  const isActive = (path, allPaths = []) => {
    if (path === "/admin") {
      return location.pathname === path
    }
    
    // For subItems, check if this is the most specific match
    if (allPaths.length > 0) {
      // Sort paths by length (longest first) to find most specific match
      const sortedPaths = [...allPaths].sort((a, b) => b.length - a.length)
      const bestMatch = sortedPaths.find(p => location.pathname.startsWith(p))
      return bestMatch === path
    }
    
    return location.pathname.startsWith(path)
  }

  useEffect(() => {
    const storageKey = `adminSidebarExpanded:${platform}`
    try {
      localStorage.setItem(storageKey, JSON.stringify(expandedSections))
    } catch (e) {
      console.error('Error saving sidebar state:', e)
    }
  }, [expandedSections, platform])

  // Keep dashboard sidebar compact like the target layout
  useEffect(() => {
    if (location.pathname === "/admin") {
      setExpandedSections(buildCollapsedSectionsState())
    }
  }, [location.pathname, platform, menuData])

  const toggleSection = (sectionKey) => {
    // Only one section open at a time. clicking an already-open section will close it.
    setExpandedSections(prev => {
      const isCurrently = !!prev[sectionKey]
      const newState = {}
      Object.keys(prev).forEach(k => {
        newState[k] = false
      })
      if (!isCurrently) {
        newState[sectionKey] = true
      }
      return newState
    })
  }

  const renderMenuItem = (item, index, isInSection = false) => {
    if (item.type === "link") {
      const Icon = iconMap[item.icon] || Utensils
      return (
        <Link
          key={index}
          to={item.path}
          onClick={() => {
            if (window.innerWidth < 1024 && onClose) {
              onClose()
            }
          }}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-300 ease-out menu-item-animate text-left",
            isInSection ? "text-[12px] font-semibold" : "text-[12px]",
            isActive(item.path)
              ? "bg-white/10 text-white border border-white/15 font-semibold"
              : "text-neutral-300 hover:bg-white/5 hover:text-white",
            isCollapsed && "justify-center px-2"
          )}
          style={{ animationDelay: `${index * 0.05}s` }}
          title={isCollapsed ? item.label : undefined}
        >
          <Icon className={cn(
            "shrink-0 transition-all duration-300 text-left",
            isInSection ? "w-4 h-4" : "w-4 h-4",
            isActive(item.path) ? "text-white scale-110" : "text-neutral-300"
          )} />
          {!isCollapsed && (
            <span className={cn("text-left whitespace-nowrap", isInSection ? "font-semibold" : "font-medium")}>{item.label}</span>
          )}
        </Link>
      )
    }

    if (item.type === "expandable") {
      const Icon = iconMap[item.icon] || Utensils
      const sectionKey = item.label.toLowerCase().replace(/\s+/g, "")
      const isExpanded = expandedSections[sectionKey] || false

      if (isCollapsed) {
        return (
          <div key={index} className="menu-item-animate" style={{ animationDelay: `${index * 0.05}s` }}>
            <button
              onClick={() => toggleSection(sectionKey)}
              className={cn(
                "w-full flex items-center justify-center px-2 py-2 rounded-lg transition-all duration-300 ease-out text-[12px] font-medium",
                "text-white hover:bg-white/5"
              )}
              title={item.label}
            >
              <Icon className="w-4 h-4 shrink-0 text-neutral-300 transition-transform duration-300" />
            </button>
          </div>
        )
      }

      return (
        <div key={index} className="menu-item-animate" style={{ animationDelay: `${index * 0.05}s` }}>
          <button
            onClick={() => toggleSection(sectionKey)}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-all duration-300 ease-out text-[12px] font-medium text-left",
              "text-white hover:bg-white/5"
            )}
          >
            <div className="flex items-center gap-2.5 text-left">
              <Icon className="w-4 h-4 shrink-0 text-neutral-300 transition-transform duration-300" />
              <span className="font-medium text-left">{item.label}</span>
            </div>
            <div className="transition-transform duration-300" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
              <ChevronDown className="w-4 h-4 shrink-0 text-neutral-300" />
            </div>
          </button>
          {isExpanded && item.subItems && (
            <div className="ml-5 mt-1 space-y-1 border-neutral-800/60 pl-3 submenu-animate overflow-hidden">
              {item.subItems.map((subItem, subIndex) => {
                const allSubPaths = item.subItems.map(si => si.path)
                return (
                  <Link
                    key={subIndex}
                    to={subItem.path}
                    onClick={() => {
                      if (window.innerWidth < 1024 && onClose) {
                        onClose()
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-300 ease-out text-[11px] font-normal text-left",
                      isActive(subItem.path, allSubPaths)
                        ? "bg-white/10 text-white font-semibold"
                        : "text-neutral-300 hover:bg-white/5 hover:text-white"
                    )}
                    style={{ animationDelay: `${subIndex * 0.03}s` }}
                  >
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300",
                      isActive(subItem.path, allSubPaths) ? "bg-white scale-125" : "bg-neutral-400"
                    )}></span>
                    <span className="text-left">{subItem.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    return null
  }

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes expandDown {
          from {
            opacity: 0;
            max-height: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            max-height: 500px;
            transform: translateY(0);
          }
        }
        
        .menu-item-animate {
          animation: slideIn 0.3s ease-out forwards;
        }
        
        .submenu-animate {
          animation: expandDown 0.3s ease-out forwards;
        }
        
        .admin-sidebar-scroll {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
        }
        
        .admin-sidebar-scroll::-webkit-scrollbar {
          width: 2px;
        }
        .admin-sidebar-scroll::-webkit-scrollbar-track {
          background: rgba(17, 24, 39, 0.4);
        }
        .admin-sidebar-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          transition: background 0.2s ease;
        }
        .admin-sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.35);
        }
        .admin-sidebar-scroll:hover::-webkit-scrollbar {
          width: 6px;
        }
        .admin-sidebar-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.25) rgba(17, 24, 39, 0.4);
        }
      `}</style>
      <div
        className={cn(
          "admin-sidebar-scroll bg-neutral-950 border-r border-neutral-800/60 h-screen fixed left-0 top-0 overflow-y-auto z-50",
          "transform transition-all duration-300 ease-in-out",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-20" : "w-72"
        )}
      >
      {/* Header with Logo and Brand */}
      <div className="px-3 py-3 border-b border-neutral-800/60 bg-neutral-900 animate-[fadeIn_0.4s_ease-out]">
        <div className="flex items-center justify-between mb-3">
          {!isCollapsed && (
            <div className="flex items-center gap-2 animate-[slideIn_0.3s_ease-out]">
              <div className="w-24 h-12 rounded-lg flex items-center justify-center shadow-black/20">
                {logoUrl ? (
                  <img 
                    src={logoUrl} 
                    alt={companyName || "Company"} 
                    className="w-24 h-10 object-contain" 
                    loading="lazy"
                    onError={(e) => {
                      // Hide image if it fails to load
                      e.target.style.display = 'none'
                    }}
                  />
                ) : companyName ? (
                  <span className="text-xs font-semibold text-white px-2 truncate">
                    {companyName}
                  </span>
                ) : null}
              </div>
            </div>
          )}
          {isCollapsed && (
            <>
              <div className="w-full flex items-center justify-center mb-2">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shadow-lg shadow-black/20 ring-1 ring-white/10">
                  {logoUrl ? (
                    <img 
                      src={logoUrl} 
                      alt={companyName || "Company"} 
                      className="w-10 h-10 object-contain" 
                      loading="lazy"
                      onError={(e) => {
                        // Hide image if it fails to load
                        e.target.style.display = 'none'
                      }}
                    />
                  ) : companyName ? (
                    <span className="text-[10px] font-semibold text-white truncate px-1">
                      {companyName.charAt(0).toUpperCase()}
                    </span>
                  ) : null}
                </div>
              </div>
              {/* Platform Toggle for Collapsed State */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handlePlatformSwitch("mofood")}
                  className={cn(
                    "w-full px-2 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-200",
                    platform === "mofood"
                      ? "bg-white/10 text-white"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                  )}
                  title="MoFood"
                >
                  Food
                </button>
                <button
                  onClick={() => handlePlatformSwitch("mogrocery")}
                  className={cn(
                    "w-full px-2 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-200",
                    platform === "mogrocery"
                      ? "bg-white/10 text-white"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                  )}
                  title="MoGrocery"
                >
                  Grocery
                </button>
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleCollapse}
              className="text-neutral-300 hover:text-white transition-all duration-200 hover:scale-110 p-1.5 rounded-lg hover:bg-white/5"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={onClose}
              className="lg:hidden text-neutral-300 hover:text-white transition-all duration-200 hover:scale-110"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Admin Panel Label */}
        {!isCollapsed && (
          <div className="mb-3 animate-[slideIn_0.4s_ease-out_0.1s_both]">
            <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider text-left mb-2">
              Admin Panel
            </h2>
            {/* Platform Toggle */}
            <div className="bg-neutral-800/60 rounded-lg p-1 flex gap-1">
              <button
                onClick={() => handlePlatformSwitch("mofood")}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200",
                  platform === "mofood"
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                MoFood
              </button>
              <button
                onClick={() => handlePlatformSwitch("mogrocery")}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200",
                  platform === "mogrocery"
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                MoGrocery
              </button>
            </div>
          </div>
        )}

        {/* Search Bar */}
        {!isCollapsed && (
          <div className="relative animate-[slideIn_0.4s_ease-out_0.2s_both]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 w-4 h-4 z-10 transition-colors duration-200" />
            <Input
              type="text"
              placeholder="Search Menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "w-full pl-9 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 transition-all duration-200 text-left",
                searchQuery ? "pr-9" : "pr-3"
              )}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-white transition-all duration-200 hover:scale-110 z-10"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation Menu */}
      <nav className="px-3 py-3 space-y-2">
        {filteredMenuData.length === 0 && searchQuery.trim() ? (
        <div className="px-3 py-12 text-left animate-[fadeIn_0.4s_ease-out]">
            <p className="text-neutral-300 text-sm font-medium text-left">No menu items found</p>
            <p className="text-neutral-500 text-sm mt-2 text-left">Try a different search term</p>
          </div>
        ) : (
          filteredMenuData.map((item, index) => {
            if (item.type === "link") {
              return renderMenuItem(item, index)
            }

            if (item.type === "section") {
              return (
                <div 
                  key={index} 
                  className={cn(
                    index > 0 ? "mt-4 pt-4 border-t border-neutral-800/60" : "",
                    "animate-[fadeIn_0.4s_ease-out]"
                  )}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {!isCollapsed && (
                    <div className="px-3 py-2 mb-2">
                      <span className="text-neutral-400 font-bold text-[11px] uppercase tracking-wider text-left">
                        {item.label}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1">
                    {item.items.map((subItem, subIndex) => renderMenuItem(subItem, `${index}-${subIndex}`, true))}
                  </div>
                </div>
              )
            }

            return null
          })
        )}
      </nav>
    </div>

    {/* Always-visible expand handle when sidebar is collapsed */}
    {isCollapsed && (
      <button
        type="button"
        onClick={toggleCollapse}
        className="hidden lg:flex fixed left-20 top-6 -translate-x-1/2 z-[60] items-center justify-center w-7 h-10 rounded-r-md bg-neutral-900 border border-neutral-700 text-neutral-200 hover:text-white hover:bg-neutral-800 transition-all duration-200 shadow-lg"
        title="Expand sidebar"
        aria-label="Expand sidebar"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    )}
    </>
  )
}
