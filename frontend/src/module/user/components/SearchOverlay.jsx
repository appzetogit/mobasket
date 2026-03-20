import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { X, Search, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { restaurantAPI } from "@/lib/api"
import { useLocation } from "../hooks/useLocation"
import { useZone } from "../hooks/useZone"

// Import shared food images - prevents duplication
import { foodImages } from "@/constants/images"

export default function SearchOverlay({ isOpen, onClose, searchValue, onSearchChange }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const { location } = useLocation()
  const { zoneId } = useZone(location, "mofood")
  const [allAvailableFoods, setAllAvailableFoods] = useState([])
  const [filteredFoods, setFilteredFoods] = useState([])
  const [loadingFoods, setLoadingFoods] = useState(false)
  const loadedZoneRef = useRef("")

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  useEffect(() => {
    const fetchAvailableFoods = async () => {
      if (!isOpen) return
      const zoneKey = String(zoneId || "no-zone")
      if (loadedZoneRef.current === zoneKey && allAvailableFoods.length > 0) return

      try {
        setLoadingFoods(true)
        const params = { platform: "mofood" }
        if (zoneId) params.zoneId = zoneId

        const restaurantsResponse = await restaurantAPI.getRestaurants(params)
        const restaurants =
          restaurantsResponse?.data?.data?.restaurants ||
          restaurantsResponse?.data?.data ||
          []

        const menuResponses = await Promise.all(
          restaurants.map(async (restaurant) => {
            try {
              const restaurantId = restaurant?._id || restaurant?.restaurantId || restaurant?.id
              if (!restaurantId) return null
              const menuResponse = await restaurantAPI.getMenuByRestaurantId(String(restaurantId))
              return {
                restaurant,
                menu: menuResponse?.data?.data?.menu || null,
              }
            } catch {
              return null
            }
          }),
        )

        const dishMap = new Map()
        const pushDish = (item, fallbackImage, restaurantName, restaurantId) => {
          if (!item?.name) return
          const isAvailable = item?.isAvailable !== false
          const isApproved = !item?.approvalStatus || item?.approvalStatus === "approved"
          if (!isAvailable || !isApproved) return

          const key = String(item.name).trim().toLowerCase()
          if (!key || dishMap.has(key)) return

          const image =
            item?.image?.url ||
            item?.image ||
            (Array.isArray(item?.images) ? item.images[0] : "") ||
            fallbackImage ||
            foodImages[0]

          const itemId = item?._id || item?.id || `${restaurantId}-${key}`
          dishMap.set(key, {
            id: `${restaurantId || "r"}-${String(itemId)}`,
            name: item.name,
            image,
            restaurantName: restaurantName || "",
          })
        }

        menuResponses.forEach((entry) => {
          if (!entry?.menu) return
          const sections = Array.isArray(entry.menu.sections) ? entry.menu.sections : []
          const fallbackImage =
            entry?.restaurant?.profileImage?.url ||
            (Array.isArray(entry?.restaurant?.menuImages) ? entry.restaurant.menuImages[0]?.url || entry.restaurant.menuImages[0] : "") ||
            ""
          const restaurantName = entry?.restaurant?.name || ""
          const restaurantId = entry?.restaurant?._id || entry?.restaurant?.restaurantId || entry?.restaurant?.id || ""

          sections.forEach((section) => {
            const sectionItems = Array.isArray(section?.items) ? section.items : []
            sectionItems.forEach((item) => pushDish(item, fallbackImage, restaurantName, restaurantId))

            const subsections = Array.isArray(section?.subsections) ? section.subsections : []
            subsections.forEach((subsection) => {
              const subsectionItems = Array.isArray(subsection?.items) ? subsection.items : []
              subsectionItems.forEach((item) => pushDish(item, fallbackImage, restaurantName, restaurantId))
            })
          })
        })

        const dishes = Array.from(dishMap.values())
        setAllAvailableFoods(dishes)
        setFilteredFoods(dishes)
        loadedZoneRef.current = zoneKey
      } catch {
        setAllAvailableFoods([])
        setFilteredFoods([])
      } finally {
        setLoadingFoods(false)
      }
    }

    fetchAvailableFoods()
  }, [isOpen, zoneId])

  useEffect(() => {
    if (searchValue.trim() === "") {
      setFilteredFoods(allAvailableFoods)
    } else {
      const filtered = allAvailableFoods.filter((food) =>
        food.name.toLowerCase().includes(searchValue.toLowerCase())
      )
      setFilteredFoods(filtered)
    }
  }, [searchValue, allAvailableFoods])

  const handleSuggestionClick = (suggestion) => {
    onSearchChange(suggestion)
    inputRef.current?.focus()
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchValue.trim()) {
      onClose({ restoreHistory: false })
      navigate(`/search?q=${encodeURIComponent(searchValue.trim())}`, { replace: true })
    }
  }

  const handleFoodClick = (food) => {
    onClose({ restoreHistory: false })
    navigate(`/search?q=${encodeURIComponent(food.name)}`, { replace: true })
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-[#0a0a0a]"
      style={{
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
        {/* Header with Search Bar */}
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground dark:text-gray-400 z-10" />
                <Input
                  ref={inputRef}
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search for food, restaurants..."
                  className="pl-12 pr-4 h-12 w-full bg-white dark:bg-[#1a1a1a] border-gray-100 dark:border-gray-800 focus:border-primary-orange dark:focus:border-primary-orange rounded-full text-lg dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </Button>
            </form>
          </div>
        </div>

          <div className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 scrollbar-hide bg-white dark:bg-[#0a0a0a]">
          {/* Suggestions Row */}
          <div
            className="mb-6"
            style={{
              animation: 'slideDown 0.3s ease-out 0.1s both'
            }}
          >
            <h3 className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-orange" />
              Recent Searches
            </h3>
            <div className="flex gap-2 sm:gap-3 flex-wrap">
              {allAvailableFoods.slice(0, 8).map((food, index) => (
                <button
                  key={food.id || food.name}
                  onClick={() => handleSuggestionClick(food.name)}
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 border border-orange-200 dark:border-orange-800 hover:border-orange-300 dark:hover:border-orange-700 text-gray-700 dark:text-gray-300 hover:text-primary-orange dark:hover:text-orange-400 transition-all duration-200 text-xs sm:text-sm font-medium shadow-sm hover:shadow-md"
                  style={{
                    animation: `scaleIn 0.3s ease-out ${0.1 + index * 0.02}s both`
                  }}
                >
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-primary-orange flex-shrink-0" />
                  <span>{food.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Food Grid */}
          <div
            style={{
              animation: 'fadeIn 0.3s ease-out 0.2s both'
            }}
          >
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
              {searchValue.trim() === "" ? "All Dishes" : `Search Results (${filteredFoods.length})`}
            </h3>
            {loadingFoods ? (
              <div className="text-center py-12 sm:py-16">
                <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg font-semibold">Loading available dishes...</p>
              </div>
            ) : filteredFoods.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
                {filteredFoods.map((food, index) => (
                  <div
                    key={food.id}
                    className="flex flex-col items-center gap-2 sm:gap-3 cursor-pointer group"
                    style={{
                      animation: `slideUp 0.3s ease-out ${0.25 + 0.05 * (index % 12)}s both`
                    }}
                    onClick={() => handleFoodClick(food)}
                  >
                    <div className="relative w-full aspect-square rounded-full overflow-hidden transition-all duration-200 shadow-md group-hover:shadow-lg bg-white dark:bg-[#1a1a1a] p-1 sm:p-1.5">
                        <img
                          src={food.image}
                          alt={food.name}
                        className="w-full h-full object-cover rounded-full"
                          loading="lazy"
                          onError={(e) => {
                            e.target.src = foodImages[0]
                          }}
                        />
                    </div>
                    <div className="px-1 sm:px-2 text-center">
                      <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-primary-orange dark:group-hover:text-orange-400 transition-colors line-clamp-2">
                          {food.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 sm:py-16">
                <Search className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg font-semibold">No results found for "{searchValue}"</p>
                <p className="text-sm sm:text-base text-gray-500 dark:text-gray-500 mt-2">Try a different search term</p>
              </div>
            )}
          </div>
        </div>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes scaleIn {
            from {
              opacity: 0;
              transform: scale(0.9);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
      </div>
  )
}

