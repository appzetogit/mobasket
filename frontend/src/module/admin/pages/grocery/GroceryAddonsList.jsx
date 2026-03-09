import { useState, useMemo, useEffect } from "react"
import { Search, Trash2, Loader2 } from "lucide-react"
import { adminAPI, restaurantAPI } from "@/lib/api"
import apiClient from "@/lib/api"
import { toast } from "sonner"
import { usePlatform } from "../../context/PlatformContext"

export default function GroceryAddonsList() {
  const { platform, switchPlatform } = usePlatform()
  const [searchQuery, setSearchQuery] = useState("")
  const [addons, setAddons] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [savingAddonId, setSavingAddonId] = useState(null)

  useEffect(() => {
    if (platform !== "mogrocery") {
      switchPlatform("mogrocery")
    }
  }, [platform, switchPlatform])

  // Fetch all addons from all stores
  useEffect(() => {
    const fetchAllAddons = async () => {
      try {
        setLoading(true)

        const [storesResponse, categoriesResponse] = await Promise.all([
          adminAPI.getGroceryStores({ limit: 1000 }),
          adminAPI.getGroceryCategories({ activeOnly: "false", limit: 1000 }),
        ])

        const groceryCategories =
          categoriesResponse?.data?.data ||
          categoriesResponse?.data?.categories ||
          []
        setCategories(Array.isArray(groceryCategories) ? groceryCategories : [])

        const restaurants = storesResponse?.data?.data?.stores || 
                          storesResponse?.data?.stores || 
                          []
        
        if (restaurants.length === 0) {
          setAddons([])
          setLoading(false)
          return
        }

        const allAddons = []
        
        for (const restaurant of restaurants) {
          try {
            const restaurantId = restaurant._id || restaurant.id
            const addonsResponse = await restaurantAPI.getAddonsByRestaurantId(restaurantId, {
              includeUnapproved: "true",
            })
            const restaurantAddons = addonsResponse?.data?.data?.addons || 
                                    addonsResponse?.data?.addons || 
                                    []
            
            restaurantAddons.forEach((addon) => {
              allAddons.push({
                id: addon.id || `${restaurantId}-${addon.name}`,
                _id: addon._id,
                name: addon.name || "Unnamed Addon",
                image: addon.image || addon.images?.[0] || "",
                price: addon.price || 0,
                description: addon.description || "",
                isAvailable: addon.isAvailable !== false,
                approvalStatus: addon.approvalStatus || 'pending',
                applicableCategoryIds: Array.isArray(addon.applicableCategoryIds)
                  ? addon.applicableCategoryIds.map((categoryId) => String(categoryId))
                  : [],
                restaurantId: restaurantId,
                restaurantName: restaurant.name || "Unknown Store",
                originalAddon: addon
              })
            })
          } catch (error) {
            console.warn(`Failed to fetch addons for store ${restaurant._id || restaurant.id}:`, error.message)
          }
        }
        
        setAddons(allAddons)
      } catch (error) {
        console.error("Error fetching addons:", error)
        toast.error("Failed to load addons from stores")
        setAddons([])
      } finally {
        setLoading(false)
      }
    }

    fetchAllAddons()
  }, [])

  const formatAddonId = (id) => {
    if (!id) return "ADDON000000"
    
    const idString = String(id)
    const parts = idString.split(/[-.]/)
    let lastDigits = ""
    
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1]
      const digits = lastPart.match(/\d+/g)
      if (digits && digits.length > 0) {
        const allDigits = digits.join("")
        lastDigits = allDigits.slice(-6).padStart(6, "0")
      } else {
        const allParts = parts.join("")
        const allDigits = allParts.match(/\d+/g)
        if (allDigits && allDigits.length > 0) {
          const combinedDigits = allDigits.join("")
          lastDigits = combinedDigits.slice(-6).padStart(6, "0")
        }
      }
    }
    
    if (!lastDigits) {
      const hash = idString.split("").reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0) | 0
      }, 0)
      lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0")
    }
    
    return `ADDON${lastDigits}`
  }

  const filteredAddons = useMemo(() => {
    let result = [...addons]
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(addon =>
        addon.name.toLowerCase().includes(query) ||
        addon.id.toString().includes(query) ||
        addon.restaurantName?.toLowerCase().includes(query)
      )
    }

    return result
  }, [addons, searchQuery])

  const categoryNameById = useMemo(() => {
    const map = new Map()
    categories.forEach((category) => {
      map.set(String(category?._id || ""), category?.name || "Category")
    })
    return map
  }, [categories])

  const handleDelete = async (id) => {
    const addon = addons.find(a => a.id === id)
    if (!addon) return

    if (!window.confirm(`Are you sure you want to delete "${addon.name}"? This action cannot be undone.`)) {
      return
    }

    try {
      setDeleting(true)
      
      const menuResponse = await restaurantAPI.getMenuByRestaurantId(addon.restaurantId)
      const menu = menuResponse?.data?.data?.menu || menuResponse?.data?.menu
      
      if (!menu) {
        throw new Error("Menu not found")
      }

      const addonIndex = menu.addons?.findIndex(a => 
        String(a.id) === String(addon.id) || 
        String(a.id) === String(addon.originalAddon?.id)
      )

      if (addonIndex === -1 || !menu.addons) {
        throw new Error("Addon not found in menu")
      }

      menu.addons.splice(addonIndex, 1)

      try {
        const response = await apiClient.put(
          `/restaurant/menu`,
          { 
            sections: menu.sections || [],
            addons: menu.addons
          }
        )
        
        if (!response.data || !response.data.success) {
          throw new Error(response.data?.message || "Failed to update menu")
        }
      } catch (apiError) {
        if (apiError.response?.status === 401 || apiError.response?.status === 403) {
          throw new Error("Admin cannot directly update store menus. Please contact developer to add admin menu update endpoint.")
        }
        throw apiError
      }

      setAddons(addons.filter(a => a.id !== id))
      toast.success("Addon deleted successfully")
    } catch (error) {
      console.error("Error deleting addon:", error)
      toast.error(error?.response?.data?.message || error?.message || "Failed to delete addon")
    } finally {
      setDeleting(false)
    }
  }

  const handleAddonCategorySelection = (addonId, selectedCategoryIds) => {
    setAddons((prev) =>
      prev.map((addon) =>
        addon.id === addonId
          ? { ...addon, applicableCategoryIds: selectedCategoryIds }
          : addon
      )
    )
  }

  const handleSaveAddonCategories = async (addon) => {
    try {
      setSavingAddonId(addon.id)
      await adminAPI.updateGroceryAddonCategories(
        addon.restaurantId,
        addon.id,
        Array.isArray(addon.applicableCategoryIds) ? addon.applicableCategoryIds : []
      )
      toast.success(`Categories updated for "${addon.name}"`)
    } catch (error) {
      console.error("Error updating addon categories:", error)
      toast.error(error?.response?.data?.message || "Failed to update categories")
    } finally {
      setSavingAddonId(null)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Grocery Product Addons</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Addons List</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {filteredAddons.length}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <input
                type="text"
                placeholder="Ex : Addons"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  SL
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Image
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Categories
                </th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                      <p className="text-sm text-slate-500">Loading addons from stores...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredAddons.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                      <p className="text-sm text-slate-500">No addons match your search</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAddons.map((addon, index) => (
                  <tr
                    key={addon.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{index + 1}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                        {addon.image ? (
                          <img
                            src={addon.image}
                            alt={addon.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-500 font-semibold">N/A</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">{addon.name}</span>
                        <span className="text-xs text-slate-500">ID #{formatAddonId(addon.id)}</span>
                        {addon.restaurantName && (
                          <span className="text-xs text-slate-400 mt-0.5">
                            {addon.restaurantName}
                          </span>
                        )}
                        {addon.description && (
                          <span className="text-xs text-slate-500 mt-0.5">
                            {addon.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-900">
                        ₹{addon.price.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 min-w-[260px]">
                      <div className="space-y-2">
                        <select
                          multiple
                          value={addon.applicableCategoryIds || []}
                          onChange={(e) => {
                            const selected = Array.from(e.target.selectedOptions).map((option) => option.value)
                            handleAddonCategorySelection(addon.id, selected)
                          }}
                          className="w-full min-h-[96px] text-xs rounded-md border border-slate-300 bg-white p-2"
                        >
                          {categories.map((category) => {
                            const categoryId = String(category?._id || "")
                            return (
                              <option key={categoryId} value={categoryId}>
                                {category?.name || "Category"}
                              </option>
                            )
                          })}
                        </select>
                        <p className="text-[11px] text-slate-500">
                          {addon.applicableCategoryIds?.length
                            ? addon.applicableCategoryIds.map((id) => categoryNameById.get(String(id)) || "Unknown").join(", ")
                            : "No categories selected (shows for all categories)."}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleSaveAddonCategories(addon)}
                          disabled={savingAddonId === addon.id}
                          className="px-2.5 py-1.5 rounded text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                          title="Save Categories"
                        >
                          {savingAddonId === addon.id ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => handleDelete(addon.id)}
                          disabled={deleting}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          {deleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

