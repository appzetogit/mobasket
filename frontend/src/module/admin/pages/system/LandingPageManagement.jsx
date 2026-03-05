import { useState, useEffect, useRef } from "react"
import { Upload, Trash2, Image as ImageIcon, Loader2, AlertCircle, CheckCircle2, ArrowUp, ArrowDown, Layout, Tag, Trophy, ChefHat, Megaphone, Search } from "lucide-react"
import api from "@/lib/api"
import { adminAPI } from "@/lib/api"
import { getModuleToken } from "@/lib/utils/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { usePlatform } from "@/module/admin/context/PlatformContext"

export default function LandingPageManagement({ forcedPlatform }) {
  const { platform: contextPlatform } = usePlatform()
  const platform =
    forcedPlatform === "mofood" || forcedPlatform === "mogrocery"
      ? forcedPlatform
      : contextPlatform === "mogrocery"
        ? "mogrocery"
        : "mofood"
  const [activeTab, setActiveTab] = useState('banners')
  const [exploreMoreSubTab, setExploreMoreSubTab] = useState(
    platform === 'mogrocery' ? 'best-sellers' : 'top-10'
  )

  // Hero Banners
  const [banners, setBanners] = useState([])
  const [bannersLoading, setBannersLoading] = useState(true)
  const [bannersUploading, setBannersUploading] = useState(false)
  const [bannersUploadProgress, setBannersUploadProgress] = useState({ current: 0, total: 0 })
  const [bannersDeleting, setBannersDeleting] = useState(null)
  const bannersFileInputRef = useRef(null)

  // Categories
  const [categories, setCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesUploading, setCategoriesUploading] = useState(false)
  const [categoriesDeleting, setCategoriesDeleting] = useState(null)
  const [pendingCategories, setPendingCategories] = useState([]) // {id, file, label, previewUrl}
  const categoriesFileInputRef = useRef(null)

  // Explore More
  const [exploreMore, setExploreMore] = useState([])
  const [exploreMoreLoading, setExploreMoreLoading] = useState(true)
  const [exploreMoreUploading, setExploreMoreUploading] = useState(false)
  const [exploreMoreDeleting, setExploreMoreDeleting] = useState(null)
  const [exploreMoreLabel, setExploreMoreLabel] = useState("")
  const [exploreMoreLink, setExploreMoreLink] = useState("")
  const exploreMoreFileInputRef = useRef(null)

  // Under 250 Banners
  const [under250Banners, setUnder250Banners] = useState([])
  const [under250BannersLoading, setUnder250BannersLoading] = useState(true)
  const [under250BannersUploading, setUnder250BannersUploading] = useState(false)
  const [under250BannersUploadProgress, setUnder250BannersUploadProgress] = useState({ current: 0, total: 0 })
  const [under250BannersDeleting, setUnder250BannersDeleting] = useState(null)
  const under250BannersFileInputRef = useRef(null)


  // Settings
  const [settings, setSettings] = useState({ exploreMoreHeading: "Explore More" })
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)

  // Top 10 Restaurants
  const [top10Restaurants, setTop10Restaurants] = useState([])
  const [top10Loading, setTop10Loading] = useState(true)
  const [top10Deleting, setTop10Deleting] = useState(null)
  const [selectedRestaurantTop10, setSelectedRestaurantTop10] = useState("")
  const [selectedRank, setSelectedRank] = useState(1)
  const [allRestaurants, setAllRestaurants] = useState([])
  const [restaurantsLoading, setRestaurantsLoading] = useState(false)

  // Gourmet Restaurants
  const [gourmetRestaurants, setGourmetRestaurants] = useState([])
  const [gourmetLoading, setGourmetLoading] = useState(true)
  const [gourmetDeleting, setGourmetDeleting] = useState(null)
  const [selectedRestaurantGourmet, setSelectedRestaurantGourmet] = useState("")

  // Grocery Best Sellers
  const [bestSellers, setBestSellers] = useState([])
  const [bestSellersLoading, setBestSellersLoading] = useState(true)
  const [bestSellersDeleting, setBestSellersDeleting] = useState(null)
  const [selectedBestSellerType, setSelectedBestSellerType] = useState("subcategory")
  const [selectedBestSellerItemId, setSelectedBestSellerItemId] = useState("")
  const [bestSellerSectionName, setBestSellerSectionName] = useState("")
  const [bestSellerSectionOrder, setBestSellerSectionOrder] = useState(0)
  const [groceryCategories, setGroceryCategories] = useState([])
  const [grocerySubcategories, setGrocerySubcategories] = useState([])
  const [groceryProducts, setGroceryProducts] = useState([])
  const [groceryCatalogLoading, setGroceryCatalogLoading] = useState(false)

  // Common
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Restaurant Selection Modal for Banner Advertising
  const [showRestaurantModal, setShowRestaurantModal] = useState(false)
  const [selectedBannerId, setSelectedBannerId] = useState(null)
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState([])
  const [restaurantSearchQuery, setRestaurantSearchQuery] = useState("")
  const [linkingRestaurants, setLinkingRestaurants] = useState(false)

  // Helper function to filter out token-related errors
  const setErrorSafely = (errorMessage) => {
    if (!errorMessage) {
      setError(null)
      return
    }
    const lowerMessage = errorMessage.toLowerCase()
    // Don't show token/unauthorized/auth errors
    if (lowerMessage.includes('token') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('no token') ||
      lowerMessage.includes('authentication') ||
      lowerMessage.includes('session expired')) {
      setError(null)
    } else {
      setError(errorMessage)
    }
  }

  // Helper function to get admin token and add to request config
  const getAuthConfig = (additionalConfig = {}) => {
    const adminToken = getModuleToken('admin')

    // Debug logging in development
    if (import.meta.env.DEV) {
      console.log('[LandingPageManagement] Token check:', {
        token: adminToken ? 'exists' : 'missing',
        tokenLength: adminToken?.length || 0,
        path: window.location.pathname
      })
    }

    if (!adminToken || adminToken.trim() === '' || adminToken === 'null' || adminToken === 'undefined') {
      // Token not found, return config without auth header (will be handled by error)
      console.warn('[LandingPageManagement] Admin token not found!')
      return additionalConfig
    }

    // Merge headers properly - ensure Authorization is always set
    const mergedHeaders = {
      ...additionalConfig.headers,
      Authorization: `Bearer ${adminToken.trim()}`,
    }
    const mergedParams = {
      ...additionalConfig.params,
      platform,
    }

    return {
      ...additionalConfig,
      headers: mergedHeaders,
      params: mergedParams,
    }
  }

  // Fetch data on mount (authentication is handled by ProtectedRoute)
  useEffect(() => {
    fetchBanners()
    fetchUnder250Banners()
    fetchAllRestaurants()
  }, [])

  // Fetch Top 10 and Gourmet when Explore More tab is active
  useEffect(() => {
    if (platform === 'mogrocery' && exploreMoreSubTab !== 'best-sellers') {
      setExploreMoreSubTab('best-sellers')
      return
    }

    if (activeTab === 'explore-more') {
      if (exploreMoreSubTab === 'top-10' && platform !== 'mogrocery') {
        fetchTop10Restaurants()
      } else if (exploreMoreSubTab === 'gourmet' && platform !== 'mogrocery') {
        fetchGourmetRestaurants()
      } else if (exploreMoreSubTab === 'best-sellers' && platform === 'mogrocery') {
        fetchGroceryCatalogData()
        fetchBestSellers()
      }
    } else if (activeTab === 'best-sellers' && platform === 'mogrocery') {
      fetchGroceryCatalogData()
      fetchBestSellers()
    }
  }, [activeTab, exploreMoreSubTab, platform])

  useEffect(() => {
    if (platform === 'mogrocery' && (activeTab === 'under-250' || activeTab === 'explore-more')) {
      setActiveTab('banners')
    }
  }, [platform, activeTab])

  // ==================== HERO BANNERS ====================
  const fetchBanners = async () => {
    try {
      setBannersLoading(true)
      setError(null)
      const response = await api.get('/hero-banners', getAuthConfig())
      if (response.data.success) {
        setBanners(response.data.data.banners || [])
      }
    } catch (err) {
      // Handle 401/404 errors gracefully - don't show error messages
      if (err.response?.status === 401) {
        // Token expired or invalid - will be handled by axios interceptor
        // Don't show error message or set banners
        setBanners([])
        setError(null)
      } else if (err.response?.status === 404) {
        // Endpoint doesn't exist, set empty array
        setBanners([])
        setError(null)
      } else {
        // Filter out token-related errors
        const errorMessage = err.response?.data?.message || 'Failed to load hero banners'
        setErrorSafely(errorMessage)
      }
    } finally {
      setBannersLoading(false)
    }
  }

  const handleBannerFileSelect = (e) => {
    const files = Array.from(e.target?.files || e.files || [])
    if (files.length === 0) return
    if (files.length > 5) {
      setError('You can upload a maximum of 5 images at once')
      return
    }
    uploadBanners(files)
  }

  const uploadBanners = async (files) => {
    try {
      // Check token first before proceeding
      const adminToken = getModuleToken('admin')
      if (!adminToken || adminToken.trim() === '' || adminToken === 'null' || adminToken === 'undefined') {
        setErrorSafely('Authentication required. Please login again.')
        return
      }

      setBannersUploading(true)
      setError(null)
      setSuccess(null)
      setBannersUploadProgress({ current: 0, total: files.length })

      // Use batch upload endpoint for multiple files
      const formData = new FormData()
      files.forEach((file) => {
        formData.append('images', file) // Field name must be 'images' for multiple upload
      })

      // Use getAuthConfig to ensure proper Authorization header
      // Don't set Content-Type - axios will set it automatically with boundary for FormData
      const config = getAuthConfig()

      // Debug: Log the config to verify Authorization header is set
      if (import.meta.env.DEV) {
        console.log('[uploadBanners] Request config:', {
          hasAuthHeader: !!config.headers?.Authorization,
          authHeaderPrefix: config.headers?.Authorization?.substring(0, 20),
          hasFormData: formData instanceof FormData
        })
      }

      const response = await api.post('/hero-banners/multiple', formData, config)

      if (response.data.success) {
        const uploadedBanners = response.data.data?.banners || []
        const errors = response.data.data?.errors || []
        const successCount = uploadedBanners.length
        const failCount = errors.length

        await fetchBanners()
        if (bannersFileInputRef.current) bannersFileInputRef.current.value = ''

        if (failCount === 0) {
          setSuccess(`${successCount} hero banner${successCount > 1 ? 's' : ''} uploaded successfully!`)
          setTimeout(() => setSuccess(null), 5000)
        } else if (successCount > 0) {
          setSuccess(`${successCount} banner${successCount > 1 ? 's' : ''} uploaded, ${failCount} failed.`)
          setErrorSafely(errors.join(', '))
          setTimeout(() => { setSuccess(null); setError(null) }, 5000)
        } else {
          setErrorSafely(`Failed to upload banners. ${errors.join(', ')}`)
        }
      } else {
        setErrorSafely(response.data.message || 'Failed to upload banners')
      }

      setBannersUploadProgress({ current: 0, total: 0 })
    } catch (err) {
      console.error('Error uploading banners:', err)

      // Handle 401 unauthorized errors - don't show token-related errors
      if (err.response?.status === 401 || err.message === 'Authentication token not found') {
        // Don't show error - let axios interceptor handle logout
        setError(null)
      } else {
        // Filter out token-related errors
        const errorMessage = err.response?.data?.message || 'Failed to upload banners'
        setErrorSafely(errorMessage)
      }

      setBannersUploadProgress({ current: 0, total: 0 })
    } finally {
      setBannersUploading(false)
    }
  }

  const handleDeleteBanner = async (id) => {
    if (!window.confirm('Are you sure you want to delete this hero banner?')) return
    try {
      setBannersDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Hero banner deleted successfully!')
        await fetchBanners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to delete banner.')
    } finally {
      setBannersDeleting(null)
    }
  }

  const handleToggleBannerStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Banner ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchBanners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update banner status.')
    }
  }

  const handleBannerOrderChange = async (id, direction) => {
    const banner = banners.find(b => b._id === id)
    if (!banner) return
    const newOrder = direction === 'up' ? banner.order - 1 : banner.order + 1
    const otherBanner = banners.find(b => b.order === newOrder && b._id !== id)
    if (!otherBanner && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherBanner) {
        await api.patch(`/hero-banners/${otherBanner._id}/order`, { order: banner.order }, getAuthConfig())
      }
      await fetchBanners()
    } catch (err) {
      setErrorSafely('Failed to update banner order.')
    }
  }

  // Handle restaurant selection for banner advertising
  const handleLinkRestaurants = async () => {
    if (!selectedBannerId) return

    try {
      setLinkingRestaurants(true)
      setError(null)
      setSuccess(null)

      const response = await api.patch(
        `/hero-banners/${selectedBannerId}/link-restaurants`,
        { restaurantIds: selectedRestaurantIds },
        getAuthConfig()
      )

      if (response.data.success) {
        setSuccess('Restaurants linked to banner successfully!')
        setShowRestaurantModal(false)
        setSelectedBannerId(null)
        setSelectedRestaurantIds([])
        setRestaurantSearchQuery("")
        await fetchBanners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to link restaurants to banner.')
    } finally {
      setLinkingRestaurants(false)
    }
  }

  const toggleRestaurantSelection = (restaurantId) => {
    setSelectedRestaurantIds(prev => {
      if (prev.includes(restaurantId)) {
        return prev.filter(id => id !== restaurantId)
      } else {
        return [...prev, restaurantId]
      }
    })
  }

  const filteredRestaurantsForModal = allRestaurants.filter(restaurant => {
    if (!restaurantSearchQuery.trim()) return true
    const query = restaurantSearchQuery.toLowerCase()
    return restaurant.name?.toLowerCase().includes(query) ||
           restaurant.restaurantId?.toLowerCase().includes(query)
  })

  // ==================== CATEGORIES ====================
  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/landing/categories', getAuthConfig())
      if (response.data.success) {
        setCategories(response.data.data.categories || [])
      }
    } catch (err) {
      // Silently handle 401/404 errors - endpoints may not exist yet
      if (err.response?.status === 401 || err.response?.status === 404) {
        setCategories([]) // Set empty array if endpoint doesn't exist
        setError(null) // Clear any previous error
      } else {
        // Filter out token-related errors
        const errorMessage = err.response?.data?.message || 'Failed to load categories'
        setErrorSafely(errorMessage)
      }
    } finally {
      setCategoriesLoading(false)
    }
  }

  const handleCategoryFileSelect = (e) => {
    const files = Array.from(e.target?.files || e.files || [])
    if (!files.length) return

    const newItems = files
      .filter((file) => {
        if (!file.type.startsWith('image/')) {
          setError('Only image files are allowed for categories')
          return false
        }
        if (file.size > 5 * 1024 * 1024) {
          setError('Each image must be smaller than 5MB')
          return false
        }
        return true
      })
      .map((file, index) => {
        const baseName = file.name.replace(/\.[^/.]+$/, '')
        const prettyName = baseName.replace(/[-_]+/g, ' ').trim()
        return {
          id: `${Date.now()}-${index}`,
          file,
          label: prettyName || '',
          previewUrl: URL.createObjectURL(file),
        }
      })

    if (!newItems.length) return

    setPendingCategories((prev) => [...prev, ...newItems])
    // Reset input so same files can be selected again if needed
    if (categoriesFileInputRef.current) {
      categoriesFileInputRef.current.value = ''
    }
  }

  const handlePendingCategoryLabelChange = (id, newLabel) => {
    setPendingCategories((prev) =>
      prev.map((item) => (item.id === id ? { ...item, label: newLabel } : item))
    )
  }

  const handleRemovePendingCategory = (id) => {
    setPendingCategories((prev) => {
      const toRemove = prev.find((item) => item.id === id)
      if (toRemove?.previewUrl) {
        URL.revokeObjectURL(toRemove.previewUrl)
      }
      return prev.filter((item) => item.id !== id)
    })
  }

  const handleUploadPendingCategories = async () => {
    if (!pendingCategories.length) {
      setError('Add at least one category image before uploading')
      return
    }

    try {
      setCategoriesUploading(true)
      setError(null)
      setSuccess(null)

      let successCount = 0
      let failCount = 0
      const errors = []

      for (let i = 0; i < pendingCategories.length; i++) {
        const item = pendingCategories[i]
        if (!item.label.trim()) {
          failCount++
          errors.push(`Item ${i + 1}: label is required`)
          continue
        }

        const formData = new FormData()
        formData.append('image', item.file)
        formData.append('label', item.label.trim())

        try {
          const response = await api.post('/hero-banners/landing/categories', formData, getAuthConfig({
            headers: { 'Content-Type': 'multipart/form-data' },
          }))
          if (response.data.success) {
            successCount++
          } else {
            failCount++
            errors.push(`Item ${i + 1}: upload failed`)
          }
        } catch (err) {
          failCount++
          errors.push(
            `Item ${i + 1}: ${err?.response?.data?.message || 'Failed to create category'}`
          )
        }
      }

      // Clean up previews
      pendingCategories.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl)
        }
      })
      setPendingCategories([])
      if (categoriesFileInputRef.current) categoriesFileInputRef.current.value = ''

      await fetchCategories()

      if (successCount > 0 && failCount === 0) {
        setSuccess(
          `${successCount} categor${successCount > 1 ? 'ies' : 'y'} created successfully!`
        )
        setTimeout(() => setSuccess(null), 4000)
      } else if (successCount > 0 && failCount > 0) {
        setSuccess(
          `${successCount} categor${successCount > 1 ? 'ies' : 'y'} created, ${failCount} failed.`
        )
        setError(errors.join(', '))
        setTimeout(() => {
          setSuccess(null)
          setError(null)
        }, 5000)
      } else {
        setErrorSafely(`Failed to create categories. ${errors.join(', ')}`)
      }
    } finally {
      setCategoriesUploading(false)
    }
  }

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return
    try {
      setCategoriesDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/landing/categories/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Category deleted successfully!')
        await fetchCategories()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to delete category.')
    } finally {
      setCategoriesDeleting(null)
    }
  }

  const handleToggleCategoryStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/landing/categories/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Category ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchCategories()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update category status.')
    }
  }

  const handleCategoryOrderChange = async (id, direction) => {
    const category = categories.find(c => c._id === id)
    if (!category) return
    const newOrder = direction === 'up' ? category.order - 1 : category.order + 1
    const otherCategory = categories.find(c => c.order === newOrder && c._id !== id)
    if (!otherCategory && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/landing/categories/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherCategory) {
        await api.patch(`/hero-banners/landing/categories/${otherCategory._id}/order`, { order: category.order }, getAuthConfig())
      }
      await fetchCategories()
    } catch (err) {
      setErrorSafely('Failed to update category order.')
    }
  }

  // ==================== EXPLORE MORE ====================
  const fetchExploreMore = async () => {
    try {
      setExploreMoreLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/landing/explore-more', getAuthConfig())
      if (response.data.success) {
        setExploreMore(response.data.data.items || [])
      }
    } catch (err) {
      // Silently handle 401/404 errors - endpoints may not exist yet
      if (err.response?.status === 401 || err.response?.status === 404) {
        setExploreMore([]) // Set empty array if endpoint doesn't exist
        setError(null) // Clear any previous error
      } else {
        // Filter out token-related errors
        const errorMessage = err.response?.data?.message || 'Failed to load explore more items'
        setErrorSafely(errorMessage)
      }
    } finally {
      setExploreMoreLoading(false)
    }
  }

  const handleExploreMoreFileSelect = async (e) => {
    const file = e.target?.files?.[0]
    if (!file) return
    if (!exploreMoreLabel.trim() || !exploreMoreLink.trim()) {
      setError('Please enter both label and link')
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size exceeds 5MB')
      return
    }

    try {
      setExploreMoreUploading(true)
      setError(null)
      setSuccess(null)
      const formData = new FormData()
      formData.append('image', file)
      formData.append('label', exploreMoreLabel.trim())
      formData.append('link', exploreMoreLink.trim())
      const response = await api.post('/hero-banners/landing/explore-more', formData, getAuthConfig({
        headers: { 'Content-Type': 'multipart/form-data' },
      }))
      if (response.data.success) {
        setSuccess('Explore more item created successfully!')
        setExploreMoreLabel("")
        setExploreMoreLink("")
        if (exploreMoreFileInputRef.current) exploreMoreFileInputRef.current.value = ''
        await fetchExploreMore()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to create explore more item.')
    } finally {
      setExploreMoreUploading(false)
    }
  }

  const handleDeleteExploreMore = async (id) => {
    if (!window.confirm('Are you sure you want to delete this explore more item?')) return
    try {
      setExploreMoreDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/landing/explore-more/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Explore more item deleted successfully!')
        await fetchExploreMore()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to delete explore more item.')
    } finally {
      setExploreMoreDeleting(null)
    }
  }

  const handleToggleExploreMoreStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/landing/explore-more/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Explore more item ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchExploreMore()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update explore more status.')
    }
  }

  const handleExploreMoreOrderChange = async (id, direction) => {
    const item = exploreMore.find(e => e._id === id)
    if (!item) return
    const newOrder = direction === 'up' ? item.order - 1 : item.order + 1
    const otherItem = exploreMore.find(e => e.order === newOrder && e._id !== id)
    if (!otherItem && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/landing/explore-more/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherItem) {
        await api.patch(`/hero-banners/landing/explore-more/${otherItem._id}/order`, { order: item.order }, getAuthConfig())
      }
      await fetchExploreMore()
    } catch (err) {
      setErrorSafely('Failed to update explore more order.')
    }
  }

  // ==================== UNDER 250 BANNERS ====================
  const fetchUnder250Banners = async () => {
    try {
      setUnder250BannersLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/under-250', getAuthConfig())
      if (response.data.success) {
        setUnder250Banners(response.data.data.banners || [])
      }
    } catch (err) {
      // Handle 401/404 errors gracefully - don't show error messages
      if (err.response?.status === 401) {
        setUnder250Banners([])
        setError(null)
      } else if (err.response?.status === 404) {
        setUnder250Banners([])
        setError(null)
      } else {
        const errorMessage = err.response?.data?.message || 'Failed to load under 250 banners'
        setErrorSafely(errorMessage)
      }
    } finally {
      setUnder250BannersLoading(false)
    }
  }

  const handleUnder250BannerFileSelect = (e) => {
    const files = Array.from(e.target?.files || e.files || [])
    if (files.length === 0) return
    if (files.length > 5) {
      setError('You can upload a maximum of 5 images at once')
      return
    }
    uploadUnder250Banners(files)
  }

  const uploadUnder250Banners = async (files) => {
    try {
      // Check token first before proceeding
      const adminToken = getModuleToken('admin')
      if (!adminToken || adminToken.trim() === '' || adminToken === 'null' || adminToken === 'undefined') {
        setErrorSafely('Authentication required. Please login again.')
        return
      }

      setUnder250BannersUploading(true)
      setError(null)
      setSuccess(null)
      setUnder250BannersUploadProgress({ current: 0, total: files.length })

      const formData = new FormData()
      files.forEach((file) => {
        formData.append('images', file)
      })

      const response = await api.post('/hero-banners/under-250/multiple', formData, getAuthConfig({
        headers: { 'Content-Type': 'multipart/form-data' },
      }))

      if (response.data.success) {
        setSuccess(`${response.data.data.banners?.length || files.length} under 250 banner(s) uploaded successfully!`)
        await fetchUnder250Banners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to upload under 250 banners'
      setErrorSafely(errorMessage)

      setUnder250BannersUploadProgress({ current: 0, total: 0 })
    } finally {
      setUnder250BannersUploading(false)
    }
  }

  const handleDeleteUnder250Banner = async (id) => {
    if (!window.confirm('Are you sure you want to delete this under 250 banner?')) return
    try {
      setUnder250BannersDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/under-250/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Under 250 banner deleted successfully!')
        await fetchUnder250Banners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to delete banner.')
    } finally {
      setUnder250BannersDeleting(null)
    }
  }

  const handleToggleUnder250BannerStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/under-250/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Banner ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchUnder250Banners()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update banner status.')
    }
  }

  const handleUnder250BannerOrderChange = async (id, direction) => {
    const banner = under250Banners.find(b => b._id === id)
    if (!banner) return
    const newOrder = direction === 'up' ? banner.order - 1 : banner.order + 1
    const otherBanner = under250Banners.find(b => b.order === newOrder && b._id !== id)
    if (!otherBanner && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/under-250/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherBanner) {
        await api.patch(`/hero-banners/under-250/${otherBanner._id}/order`, { order: banner.order }, getAuthConfig())
      }
      await fetchUnder250Banners()
    } catch (err) {
      setErrorSafely('Failed to update banner order.')
    }
  }


  // ==================== SETTINGS ====================
  const fetchSettings = async () => {
    try {
      setSettingsLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/landing/settings', getAuthConfig())
      if (response.data.success) {
        setSettings(response.data.data.settings || { exploreMoreHeading: "Explore More" })
      }
    } catch (err) {
      // Silently handle 401/404 errors - endpoints may not exist yet, use default settings
      if (err.response?.status === 401 || err.response?.status === 404) {
        setSettings({ exploreMoreHeading: "Explore More" }) // Use default settings
        setError(null) // Clear any previous error
      } else {
        // Filter out token-related errors
        const errorMessage = err.response?.data?.message || 'Failed to load settings'
        setErrorSafely(errorMessage)
      }
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      setSettingsSaving(true)
      setError(null)
      setSuccess(null)
      const response = await api.patch('/hero-banners/landing/settings', {
        exploreMoreHeading: settings.exploreMoreHeading
      }, getAuthConfig())
      if (response.data.success) {
        setSuccess('Settings saved successfully!')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to save settings.')
    } finally {
      setSettingsSaving(false)
    }
  }

  // ==================== ALL RESTAURANTS ====================
  const fetchAllRestaurants = async () => {
    try {
      setRestaurantsLoading(true)
      setError(null)
      const response = await adminAPI.getRestaurants({ limit: 1000 })
      if (response.data && response.data.success && response.data.data) {
        const restaurants = response.data.data.restaurants || response.data.data || []
        setAllRestaurants(restaurants)
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 404) {
        setAllRestaurants([])
        setError(null)
      } else {
        const errorMessage = err.response?.data?.message || 'Failed to load restaurants'
        setErrorSafely(errorMessage)
      }
    } finally {
      setRestaurantsLoading(false)
    }
  }

  // ==================== TOP 10 RESTAURANTS ====================
  const fetchTop10Restaurants = async () => {
    try {
      setTop10Loading(true)
      setError(null)
      const response = await api.get('/hero-banners/top-10', getAuthConfig())
      if (response.data.success) {
        setTop10Restaurants(response.data.data.restaurants || [])
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 404) {
        setTop10Restaurants([])
        setError(null)
      } else {
        const errorMessage = err.response?.data?.message || 'Failed to load Top 10 restaurants'
        setErrorSafely(errorMessage)
      }
    } finally {
      setTop10Loading(false)
    }
  }

  const handleAddTop10Restaurant = async () => {
    if (!selectedRestaurantTop10 || !selectedRank) {
      setError('Please select a restaurant and rank')
      return
    }

    try {
      setError(null)
      setSuccess(null)
      const response = await api.post('/hero-banners/top-10', {
        restaurantId: selectedRestaurantTop10,
        rank: parseInt(selectedRank)
      }, getAuthConfig())
      if (response.data.success) {
        setSuccess('Restaurant added to Top 10 successfully!')
        setSelectedRestaurantTop10("")
        setSelectedRank(1)
        await fetchTop10Restaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to add restaurant to Top 10.')
    }
  }

  const handleDeleteTop10Restaurant = async (id) => {
    if (!window.confirm('Are you sure you want to remove this restaurant from Top 10?')) return
    try {
      setTop10Deleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/top-10/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Restaurant removed from Top 10 successfully!')
        await fetchTop10Restaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to remove restaurant.')
    } finally {
      setTop10Deleting(null)
    }
  }

  const handleTop10OrderChange = async (id, direction) => {
    const restaurant = top10Restaurants.find(r => r._id === id)
    if (!restaurant) return
    const newOrder = direction === 'up' ? restaurant.order - 1 : restaurant.order + 1
    const otherRestaurant = top10Restaurants.find(r => r.order === newOrder && r._id !== id)
    if (!otherRestaurant && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/top-10/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherRestaurant) {
        await api.patch(`/hero-banners/top-10/${otherRestaurant._id}/order`, { order: restaurant.order }, getAuthConfig())
      }
      await fetchTop10Restaurants()
    } catch (err) {
      setErrorSafely('Failed to update Top 10 restaurant order.')
    }
  }

  const handleTop10RankChange = async (id, newRank) => {
    try {
      setError(null)
      await api.patch(`/hero-banners/top-10/${id}/rank`, { rank: parseInt(newRank) }, getAuthConfig())
      await fetchTop10Restaurants()
    } catch (err) {
      setErrorSafely('Failed to update Top 10 restaurant rank.')
    }
  }

  const handleToggleTop10Status = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/top-10/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Restaurant ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchTop10Restaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update restaurant status.')
    }
  }

  // ==================== GOURMET RESTAURANTS ====================
  const fetchGourmetRestaurants = async () => {
    try {
      setGourmetLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/gourmet', getAuthConfig())
      if (response.data.success) {
        setGourmetRestaurants(response.data.data.restaurants || [])
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 404) {
        setGourmetRestaurants([])
        setError(null)
      } else {
        const errorMessage = err.response?.data?.message || 'Failed to load Gourmet restaurants'
        setErrorSafely(errorMessage)
      }
    } finally {
      setGourmetLoading(false)
    }
  }

  const handleAddGourmetRestaurant = async () => {
    if (!selectedRestaurantGourmet) {
      setError('Please select a restaurant')
      return
    }

    try {
      setError(null)
      setSuccess(null)
      const response = await api.post('/hero-banners/gourmet', {
        restaurantId: selectedRestaurantGourmet
      }, getAuthConfig())
      if (response.data.success) {
        setSuccess('Restaurant added to Gourmet successfully!')
        setSelectedRestaurantGourmet("")
        await fetchGourmetRestaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to add restaurant to Gourmet.')
    }
  }

  const handleDeleteGourmetRestaurant = async (id) => {
    if (!window.confirm('Are you sure you want to remove this restaurant from Gourmet?')) return
    try {
      setGourmetDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/gourmet/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Restaurant removed from Gourmet successfully!')
        await fetchGourmetRestaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to remove restaurant.')
    } finally {
      setGourmetDeleting(null)
    }
  }

  const handleGourmetOrderChange = async (id, direction) => {
    const restaurant = gourmetRestaurants.find(r => r._id === id)
    if (!restaurant) return
    const newOrder = direction === 'up' ? restaurant.order - 1 : restaurant.order + 1
    const otherRestaurant = gourmetRestaurants.find(r => r.order === newOrder && r._id !== id)
    if (!otherRestaurant && newOrder < 0) return
    try {
      setError(null)
      await api.patch(`/hero-banners/gourmet/${id}/order`, { order: newOrder }, getAuthConfig())
      if (otherRestaurant) {
        await api.patch(`/hero-banners/gourmet/${otherRestaurant._id}/order`, { order: restaurant.order }, getAuthConfig())
      }
      await fetchGourmetRestaurants()
    } catch (err) {
      setErrorSafely('Failed to update Gourmet restaurant order.')
    }
  }

  const handleToggleGourmetStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/gourmet/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Restaurant ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchGourmetRestaurants()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update restaurant status.')
    }
  }

  // ==================== GROCERY BEST SELLERS ====================
  const fetchGroceryCatalogData = async () => {
    if (platform !== 'mogrocery') return
    try {
      setGroceryCatalogLoading(true)
      setError(null)
      const [categoriesRes, subcategoriesRes, productsRes] = await Promise.all([
        adminAPI.getGroceryCategories(),
        adminAPI.getGrocerySubcategories(),
        adminAPI.getGroceryProducts(),
      ])

      setGroceryCategories(Array.isArray(categoriesRes?.data?.data) ? categoriesRes.data.data : [])
      setGrocerySubcategories(Array.isArray(subcategoriesRes?.data?.data) ? subcategoriesRes.data.data : [])
      setGroceryProducts(Array.isArray(productsRes?.data?.data) ? productsRes.data.data : [])
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to load grocery catalog data.')
      setGroceryCategories([])
      setGrocerySubcategories([])
      setGroceryProducts([])
    } finally {
      setGroceryCatalogLoading(false)
    }
  }

  const fetchBestSellers = async () => {
    if (platform !== 'mogrocery') return
    try {
      setBestSellersLoading(true)
      setError(null)
      const response = await api.get('/hero-banners/grocery-best-sellers', getAuthConfig())
      if (response.data.success) {
        setBestSellers(response.data.data.items || [])
      }
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 404) {
        setBestSellers([])
        setError(null)
      } else {
        setErrorSafely(err.response?.data?.message || 'Failed to load best sellers.')
      }
    } finally {
      setBestSellersLoading(false)
    }
  }

  const availableBestSellerItems =
    selectedBestSellerType === 'category'
      ? groceryCategories
      : selectedBestSellerType === 'subcategory'
        ? grocerySubcategories
        : groceryProducts

  const selectedBestSellerTypeIds = new Set(
    bestSellers
      .filter((item) => item.itemType === selectedBestSellerType)
      .map((item) => String(item.itemId?._id || item.itemId || ""))
  )

  const selectableBestSellerItems = availableBestSellerItems.filter(
    (item) => !selectedBestSellerTypeIds.has(String(item?._id || ""))
  )

  const handleAddBestSeller = async () => {
    if (!selectedBestSellerType || !selectedBestSellerItemId) {
      setError('Please select type and item')
      return
    }
    if (selectedBestSellerType === 'product' && !bestSellerSectionName.trim()) {
      setError('Please enter section name for product')
      return
    }
    try {
      setError(null)
      setSuccess(null)
      const response = await api.post('/hero-banners/grocery-best-sellers', {
        itemType: selectedBestSellerType,
        itemId: selectedBestSellerItemId,
        sectionName: selectedBestSellerType === 'product' ? bestSellerSectionName.trim() : '',
        sectionOrder: selectedBestSellerType === 'product' ? Number(bestSellerSectionOrder || 0) : 0,
      }, getAuthConfig())
      if (response.data.success) {
        setSuccess('Best seller item added successfully!')
        setSelectedBestSellerItemId("")
        if (selectedBestSellerType === 'product') {
          setBestSellerSectionName("")
        }
        await fetchBestSellers()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to add best seller item.')
    }
  }

  const handleDeleteBestSeller = async (id) => {
    if (!window.confirm('Are you sure you want to remove this item from Best Sellers?')) return
    try {
      setBestSellersDeleting(id)
      setError(null)
      setSuccess(null)
      const response = await api.delete(`/hero-banners/grocery-best-sellers/${id}`, getAuthConfig())
      if (response.data.success) {
        setSuccess('Best seller item removed successfully!')
        await fetchBestSellers()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to remove best seller item.')
    } finally {
      setBestSellersDeleting(null)
    }
  }

  const handleBestSellerOrderChange = async (id, direction) => {
    const ordered = [...bestSellers].sort((a, b) => a.order - b.order)
    const currentItem = ordered.find((item) => item._id === id)
    if (!currentItem) return
    const newOrder = direction === 'up' ? currentItem.order - 1 : currentItem.order + 1
    const swapItem = ordered.find((item) => item.order === newOrder && item._id !== id)
    if (!swapItem && newOrder < 0) return

    try {
      setError(null)
      await api.patch(`/hero-banners/grocery-best-sellers/${id}/order`, { order: newOrder }, getAuthConfig())
      if (swapItem) {
        await api.patch(`/hero-banners/grocery-best-sellers/${swapItem._id}/order`, { order: currentItem.order }, getAuthConfig())
      }
      await fetchBestSellers()
    } catch (err) {
      setErrorSafely('Failed to update best seller order.')
    }
  }

  const handleToggleBestSellerStatus = async (id, currentStatus) => {
    try {
      setError(null)
      setSuccess(null)
      const response = await api.patch(`/hero-banners/grocery-best-sellers/${id}/status`, {}, getAuthConfig())
      if (response.data.success) {
        setSuccess(`Item ${currentStatus ? 'deactivated' : 'activated'} successfully!`)
        await fetchBestSellers()
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      setErrorSafely(err.response?.data?.message || 'Failed to update item status.')
    }
  }

  // ==================== RENDER ====================
  const tabs = [
    { id: 'banners', label: 'Hero Banners', icon: ImageIcon },
    ...(platform !== 'mogrocery' ? [{ id: 'under-250', label: '250 Banner', icon: Tag }] : []),
    ...(platform !== 'mogrocery' ? [{ id: 'explore-more', label: 'Explore More', icon: Layout }] : []),
    ...(platform === 'mogrocery' ? [{ id: 'best-sellers', label: 'Best Sellers', icon: Megaphone }] : []),
  ]

  const exploreMoreTabs = [
    ...(platform !== 'mogrocery' ? [{ id: 'top-10', label: 'Top 10', icon: Trophy }] : []),
    ...(platform !== 'mogrocery' ? [{ id: 'gourmet', label: 'Gourmet', icon: ChefHat }] : []),
    ...(platform === 'mogrocery' ? [{ id: 'best-sellers', label: 'Best Sellers', icon: Megaphone }] : []),
  ]
  const sortedBestSellers = [...bestSellers].sort((a, b) => {
    const sectionOrderA = Number(a?.sectionOrder || 0)
    const sectionOrderB = Number(b?.sectionOrder || 0)
    if (sectionOrderA !== sectionOrderB) return sectionOrderA - sectionOrderB
    const sectionNameA = String(a?.sectionName || '')
    const sectionNameB = String(b?.sectionName || '')
    if (sectionNameA !== sectionNameB) return sectionNameA.localeCompare(sectionNameB)
    return Number(a?.order || 0) - Number(b?.order || 0)
  })

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Page Title */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
              <Layout className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Landing Page Management</h1>
              <p className="text-sm text-slate-600 mt-1">Manage hero banners</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 mb-6">
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${activeTab === tab.id
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Hero Banners Tab */}
        {activeTab === 'banners' && (
          <>
            {/* Upload Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Upload New Banner(s)</h2>
              <div
                className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center bg-blue-50/30 cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50/50"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const files = Array.from(e.dataTransfer.files)
                  if (files.length > 0) handleBannerFileSelect({ files })
                }}
                onClick={() => bannersFileInputRef.current?.click()}
              >
                <input
                  ref={bannersFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleBannerFileSelect}
                  className="hidden"
                  disabled={bannersUploading}
                />
                {bannersUploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <p className="text-blue-600 font-medium">
                      Uploading image {bannersUploadProgress.current} of {bannersUploadProgress.total}...
                    </p>
                    {bannersUploadProgress.total > 0 && (
                      <div className="w-full max-w-xs">
                        <div className="w-full bg-blue-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(bannersUploadProgress.current / bannersUploadProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-8 h-8 text-blue-600" />
                    <div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); bannersFileInputRef.current?.click(); }}
                        className="text-blue-600 font-medium hover:text-blue-700 underline"
                      >
                        Click to upload
                      </button>
                      <span className="text-slate-600"> or drag and drop</span>
                    </div>
                    <p className="text-xs text-slate-500">PNG, JPG, WEBP up to 5MB each (Max 5 images at once)</p>
                  </div>
                )}
              </div>
            </div>

            {/* Banners List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Banner List ({banners.length})</h2>
              {bannersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
              ) : banners.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <ImageIcon className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                  <p>No banners uploaded yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {banners.map((banner, index) => (
                    <div key={banner._id} className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                      <div className="relative aspect-video bg-slate-100">
                        <img src={banner.imageUrl} alt={`Hero Banner ${index + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute top-2 right-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${banner.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {banner.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="absolute top-2 left-2">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">Order: {banner.order}</span>
                        </div>
                      </div>
                      <div className="p-4 bg-white">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleBannerOrderChange(banner._id, 'up')} disabled={index === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                              <ArrowUp className="w-4 h-4 text-slate-600" />
                            </button>
                            <button onClick={() => handleBannerOrderChange(banner._id, 'down')} disabled={index === banners.length - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                              <ArrowDown className="w-4 h-4 text-slate-600" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button 
                              onClick={() => {
                                setSelectedBannerId(banner._id)
                                setSelectedRestaurantIds(banner.linkedRestaurants?.map(r => r._id || r) || [])
                                setShowRestaurantModal(true)
                              }}
                              className="px-3 py-1.5 rounded text-sm font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 flex items-center gap-1"
                            >
                              <Megaphone className="w-4 h-4" />
                              Advertise
                            </button>
                            <button onClick={() => handleToggleBannerStatus(banner._id, banner.isActive)} className={`px-3 py-1.5 rounded text-sm font-medium ${banner.isActive ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                              {banner.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => handleDeleteBanner(banner._id)} disabled={bannersDeleting === banner._id} className="p-1.5 rounded hover:bg-red-100 text-red-600 disabled:opacity-50">
                              {bannersDeleting === banner._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        {banner.linkedRestaurants && banner.linkedRestaurants.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <p className="text-xs text-slate-600 mb-1">Linked Restaurants ({banner.linkedRestaurants.length}):</p>
                            <div className="flex flex-wrap gap-1">
                              {banner.linkedRestaurants.slice(0, 3).map((restaurant, index) => (
                                <span key={restaurant._id || restaurant?.restaurantId || `linked-restaurant-${banner._id}-${index}`} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                                  {restaurant.name || 'Restaurant'}
                                </span>
                              ))}
                              {banner.linkedRestaurants.length > 3 && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                                  +{banner.linkedRestaurants.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Under 250 Banner Tab */}
        {platform !== 'mogrocery' && activeTab === 'under-250' && (
          <>
            {/* Upload Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Upload New Banner(s)</h2>
              <div
                className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center bg-blue-50/30 cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50/50"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const files = Array.from(e.dataTransfer.files)
                  if (files.length > 0) handleUnder250BannerFileSelect({ files })
                }}
                onClick={() => under250BannersFileInputRef.current?.click()}
              >
                <input
                  ref={under250BannersFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUnder250BannerFileSelect}
                  className="hidden"
                  disabled={under250BannersUploading}
                />
                {under250BannersUploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <p className="text-blue-600 font-medium">
                      Uploading image {under250BannersUploadProgress.current} of {under250BannersUploadProgress.total}...
                    </p>
                    {under250BannersUploadProgress.total > 0 && (
                      <div className="w-full max-w-xs">
                        <div className="w-full bg-blue-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(under250BannersUploadProgress.current / under250BannersUploadProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-8 h-8 text-blue-600" />
                    <div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); under250BannersFileInputRef.current?.click(); }}
                        className="text-blue-600 font-medium hover:text-blue-700 underline"
                      >
                        Click to upload
                      </button>
                      <span className="text-slate-600"> or drag and drop</span>
                    </div>
                    <p className="text-xs text-slate-500">PNG, JPG, WEBP up to 5MB each (Max 5 images at once)</p>
                  </div>
                )}
              </div>
            </div>

            {/* Banners List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Banner List ({under250Banners.length})</h2>
              {under250BannersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
              ) : under250Banners.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Tag className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                  <p>No under 250 banners uploaded yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {under250Banners.map((banner, index) => (
                    <div key={banner._id} className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                      <div className="relative aspect-video bg-slate-100">
                        <img src={banner.imageUrl} alt={`Under 250 Banner ${index + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute top-2 right-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${banner.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {banner.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="absolute top-2 left-2">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">Order: {banner.order}</span>
                        </div>
                      </div>
                      <div className="p-4 bg-white">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleUnder250BannerOrderChange(banner._id, 'up')} disabled={index === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                              <ArrowUp className="w-4 h-4 text-slate-600" />
                            </button>
                            <button onClick={() => handleUnder250BannerOrderChange(banner._id, 'down')} disabled={index === under250Banners.length - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                              <ArrowDown className="w-4 h-4 text-slate-600" />
                            </button>
                          </div>
                          <button onClick={() => handleToggleUnder250BannerStatus(banner._id, banner.isActive)} className={`px-3 py-1.5 rounded text-sm font-medium ${banner.isActive ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                            {banner.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button onClick={() => handleDeleteUnder250Banner(banner._id)} disabled={under250BannersDeleting === banner._id} className="p-1.5 rounded hover:bg-red-100 text-red-600 disabled:opacity-50">
                            {under250BannersDeleting === banner._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}


        {/* Explore More / Best Sellers Tab */}
        {((platform !== 'mogrocery' && activeTab === 'explore-more') || (activeTab === 'best-sellers' && platform === 'mogrocery')) && (
          <>
            {/* Sub-tabs for Explore More */}
            {activeTab === 'explore-more' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-2 mb-6">
                <div className="flex gap-2 overflow-x-auto">
                  {exploreMoreTabs.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === 'explore-more' && (tab.id === 'top-10' ? top10Restaurants.length > 0 : tab.id === 'gourmet' ? gourmetRestaurants.length > 0 : false)
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setExploreMoreSubTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                          exploreMoreSubTab === tab.id
                            ? 'bg-blue-500 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Top 10 Tab Content */}
            {platform !== 'mogrocery' && exploreMoreSubTab === 'top-10' && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Add Restaurant to Top 10</h2>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="restaurant-top10">Select Restaurant</Label>
                      <select
                        id="restaurant-top10"
                        value={selectedRestaurantTop10}
                        onChange={(e) => setSelectedRestaurantTop10(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={restaurantsLoading}
                      >
                        <option value="">Select a restaurant...</option>
                        {allRestaurants
                          .filter(r => !top10Restaurants.some(tr => tr.restaurant?._id === r._id))
                          .map((restaurant, index) => (
                            <option key={restaurant._id || restaurant.restaurantId || `restaurant-${index}`} value={restaurant._id}>
                              {restaurant.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="rank">Rank (1-10)</Label>
                      <Input
                        id="rank"
                        type="number"
                        min="1"
                        max="10"
                        value={selectedRank}
                        onChange={(e) => setSelectedRank(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <Button 
                      onClick={handleAddTop10Restaurant} 
                      disabled={!selectedRestaurantTop10 || !selectedRank}
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      Add to Top 10
                    </Button>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Top 10 Restaurants ({top10Restaurants.length})</h2>
                  {top10Loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                  ) : top10Restaurants.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <Trophy className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                      <p>No restaurants added to Top 10 yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {top10Restaurants
                        .sort((a, b) => a.rank - b.rank)
                        .map((item, index) => (
                          <div key={item._id} className="border border-slate-200 rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <div className="w-12 h-12 rounded-lg bg-orange-500 text-white flex items-center justify-center font-bold text-lg">
                                {item.rank}
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold text-slate-900">{item.restaurant?.name || 'N/A'}</h3>
                                <p className="text-xs text-slate-500">Rating: {item.restaurant?.rating || 0}★</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs">Rank:</Label>
                                <select
                                  value={item.rank}
                                  onChange={(e) => handleTop10RankChange(item._id, e.target.value)}
                                  className="px-2 py-1 border border-slate-300 rounded text-sm"
                                >
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleTop10OrderChange(item._id, 'up')} disabled={index === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                                  <ArrowUp className="w-4 h-4 text-slate-600" />
                                </button>
                                <button onClick={() => handleTop10OrderChange(item._id, 'down')} disabled={index === top10Restaurants.length - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                                  <ArrowDown className="w-4 h-4 text-slate-600" />
                                </button>
                              </div>
                              <button onClick={() => handleToggleTop10Status(item._id, item.isActive)} className={`px-3 py-1.5 rounded text-sm font-medium ${item.isActive ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                {item.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button onClick={() => handleDeleteTop10Restaurant(item._id)} disabled={top10Deleting === item._id} className="p-1.5 rounded hover:bg-red-100 text-red-600 disabled:opacity-50">
                                {top10Deleting === item._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Gourmet Tab Content */}
            {platform !== 'mogrocery' && exploreMoreSubTab === 'gourmet' && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Add Restaurant to Gourmet</h2>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="restaurant-gourmet">Select Restaurant</Label>
                      <select
                        id="restaurant-gourmet"
                        value={selectedRestaurantGourmet}
                        onChange={(e) => setSelectedRestaurantGourmet(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={restaurantsLoading}
                      >
                        <option value="">Select a restaurant...</option>
                        {allRestaurants
                          .filter(r => !gourmetRestaurants.some(gr => gr.restaurant?._id === r._id))
                          .map((restaurant, index) => (
                            <option key={restaurant._id || restaurant.restaurantId || `restaurant-${index}`} value={restaurant._id}>
                              {restaurant.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <Button 
                      onClick={handleAddGourmetRestaurant} 
                      disabled={!selectedRestaurantGourmet}
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      Add to Gourmet
                    </Button>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Gourmet Restaurants ({gourmetRestaurants.length})</h2>
                  {gourmetLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                  ) : gourmetRestaurants.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <ChefHat className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                      <p>No restaurants added to Gourmet yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {gourmetRestaurants
                        .sort((a, b) => a.order - b.order)
                        .map((item, index) => {
                          // Get restaurant cover image with priority: coverImages > menuImages > profileImage
                          const coverImages = item.restaurant?.coverImages && item.restaurant.coverImages.length > 0
                            ? item.restaurant.coverImages.map(img => img.url || img).filter(Boolean)
                            : []
                          
                          const menuImages = item.restaurant?.menuImages && item.restaurant.menuImages.length > 0
                            ? item.restaurant.menuImages.map(img => img.url || img).filter(Boolean)
                            : []
                          
                          const restaurantImage = coverImages.length > 0
                            ? coverImages[0]
                            : (menuImages.length > 0
                                ? menuImages[0]
                                : (item.restaurant?.profileImage?.url || "https://via.placeholder.com/400"))

                          return (
                            <div key={item._id} className="border border-slate-200 rounded-lg overflow-hidden">
                              <div className="relative h-32 bg-slate-100">
                                <img src={restaurantImage} alt={item.restaurant?.name} className="w-full h-full object-cover" />
                                <div className="absolute top-1 right-1">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${item.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {item.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                              </div>
                              <div className="p-2">
                                <h3 className="font-semibold text-slate-900 mb-0.5 text-sm line-clamp-1">{item.restaurant?.name || 'N/A'}</h3>
                                <p className="text-[10px] text-slate-500 mb-2">Rating: {item.restaurant?.rating || 0}★</p>
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-0.5">
                                    <button onClick={() => handleGourmetOrderChange(item._id, 'up')} disabled={index === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-50">
                                      <ArrowUp className="w-3 h-3 text-slate-600" />
                                    </button>
                                    <button onClick={() => handleGourmetOrderChange(item._id, 'down')} disabled={index === gourmetRestaurants.length - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-50">
                                      <ArrowDown className="w-3 h-3 text-slate-600" />
                                    </button>
                                  </div>
                                  <button onClick={() => handleToggleGourmetStatus(item._id, item.isActive)} className={`px-2 py-1 rounded text-[10px] font-medium ${item.isActive ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                    {item.isActive ? 'Deactivate' : 'Activate'}
                                  </button>
                                  <button onClick={() => handleDeleteGourmetRestaurant(item._id)} disabled={gourmetDeleting === item._id} className="p-1 rounded hover:bg-red-100 text-red-600 disabled:opacity-50">
                                    {gourmetDeleting === item._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Best Sellers Tab Content (Grocery) */}
            {platform === 'mogrocery' && (activeTab === 'best-sellers' || (activeTab === 'explore-more' && exploreMoreSubTab === 'best-sellers')) && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Add Item to Best Sellers</h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <Label htmlFor="best-seller-type">Item Type</Label>
                      <select
                        id="best-seller-type"
                        value={selectedBestSellerType}
                        onChange={(e) => {
                          setSelectedBestSellerType(e.target.value)
                          setSelectedBestSellerItemId("")
                          if (e.target.value !== 'product') {
                            setBestSellerSectionName("")
                            setBestSellerSectionOrder(0)
                          }
                        }}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="category">Category</option>
                        <option value="subcategory">Subcategory</option>
                        <option value="product">Product</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="best-seller-item">Select Item</Label>
                      <select
                        id="best-seller-item"
                        value={selectedBestSellerItemId}
                        onChange={(e) => setSelectedBestSellerItemId(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={groceryCatalogLoading}
                      >
                        <option value="">Select an item...</option>
                        {selectableBestSellerItems.map((item) => (
                          <option key={item._id} value={item._id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedBestSellerType === 'product' && (
                      <>
                        <div>
                          <Label htmlFor="best-seller-section-name">Section Name</Label>
                          <Input
                            id="best-seller-section-name"
                            value={bestSellerSectionName}
                            onChange={(e) => setBestSellerSectionName(e.target.value)}
                            placeholder="Hot deals"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="best-seller-section-order">Section Sequence</Label>
                          <Input
                            id="best-seller-section-order"
                            type="number"
                            value={bestSellerSectionOrder}
                            onChange={(e) => setBestSellerSectionOrder(Number(e.target.value || 0))}
                            min={0}
                            className="mt-1"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="mt-4">
                    <Button
                      onClick={handleAddBestSeller}
                      disabled={!selectedBestSellerType || !selectedBestSellerItemId}
                      className="bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      Add to Best Sellers
                    </Button>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">Best Sellers ({bestSellers.length})</h2>
                  {bestSellersLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                  ) : bestSellers.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <Megaphone className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                      <p>No items added to Best Sellers yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sortedBestSellers
                        .map((item, index) => {
                          const displayName = item.itemId?.name || 'N/A'
                          const displayImage =
                            item.itemType === 'product'
                              ? (Array.isArray(item.itemId?.images) ? item.itemId.images[0] : '') || "https://via.placeholder.com/120"
                              : item.itemId?.image || "https://via.placeholder.com/120"
                          return (
                            <div key={item._id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <img src={displayImage} alt={displayName} className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
                                <div className="min-w-0">
                                  <h3 className="font-semibold text-slate-900 line-clamp-1">{displayName}</h3>
                                  <p className="text-xs text-slate-500 capitalize">{item.itemType}</p>
                                  {item.itemType === 'product' && item.sectionName && (
                                    <p className="text-xs text-blue-600">
                                      Section: {item.sectionName} (Seq: {Number(item.sectionOrder || 0)})
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleBestSellerOrderChange(item._id, 'up')} disabled={index === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                                  <ArrowUp className="w-4 h-4 text-slate-600" />
                                </button>
                                <button onClick={() => handleBestSellerOrderChange(item._id, 'down')} disabled={index === bestSellers.length - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-50">
                                  <ArrowDown className="w-4 h-4 text-slate-600" />
                                </button>
                                <button onClick={() => handleToggleBestSellerStatus(item._id, item.isActive)} className={`px-3 py-1.5 rounded text-sm font-medium ${item.isActive ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                  {item.isActive ? 'Deactivate' : 'Activate'}
                                </button>
                                <button onClick={() => handleDeleteBestSeller(item._id)} disabled={bestSellersDeleting === item._id} className="p-1.5 rounded hover:bg-red-100 text-red-600 disabled:opacity-50">
                                  {bestSellersDeleting === item._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Restaurant Selection Modal */}
        <Dialog open={showRestaurantModal} onOpenChange={setShowRestaurantModal}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
              <DialogTitle className="text-2xl font-bold text-slate-900">Select Restaurants to Link with Banner</DialogTitle>
              <DialogDescription className="text-slate-600 mt-2">
                Select restaurants that will be linked to this banner. When users click on this banner, they will be redirected to the selected restaurants.
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Search Bar and Selected Count */}
              <div className="px-6 pt-4 pb-3 space-y-3 bg-slate-50 border-b border-slate-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search restaurants by name or ID..."
                    value={restaurantSearchQuery}
                    onChange={(e) => setRestaurantSearchQuery(e.target.value)}
                    className="pl-10 h-11 bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                {selectedRestaurantIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
                      {selectedRestaurantIds.length} restaurant{selectedRestaurantIds.length > 1 ? 's' : ''} selected
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedRestaurantIds([])}
                      className="text-xs text-slate-600 hover:text-slate-900"
                    >
                      Clear selection
                    </Button>
                  </div>
                )}
              </div>

              {/* Restaurant List */}
              <div className="flex-1 overflow-y-auto bg-white">
                {restaurantsLoading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-3" />
                    <p className="text-slate-500">Loading restaurants...</p>
                  </div>
                ) : filteredRestaurantsForModal.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <ImageIcon className="w-16 h-16 text-slate-300 mb-4" />
                    <p className="text-slate-600 font-medium mb-1">No restaurants found</p>
                    <p className="text-sm text-slate-500">
                      {restaurantSearchQuery ? 'Try a different search term' : 'No restaurants available'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredRestaurantsForModal.map((restaurant, index) => {
                      const isSelected = selectedRestaurantIds.includes(restaurant._id)
                      const profileImageUrl = restaurant.profileImage?.url || restaurant.profileImage || null
                      
                      return (
                        <div
                          key={restaurant._id || restaurant.restaurantId || `modal-restaurant-${index}`}
                          className={`px-6 py-4 transition-all cursor-pointer ${
                            isSelected 
                              ? 'bg-blue-50 border-l-4 border-l-blue-500' 
                              : 'hover:bg-slate-50'
                          }`}
                          onClick={() => toggleRestaurantSelection(restaurant._id)}
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex-shrink-0">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleRestaurantSelection(restaurant._id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-5 h-5"
                              />
                            </div>
                            
                            {/* Restaurant Image */}
                            <div className="flex-shrink-0">
                              {profileImageUrl ? (
                                <img
                                  src={profileImageUrl}
                                  alt={restaurant.name}
                                  className="w-16 h-16 rounded-xl object-cover border-2 border-slate-200"
                                  onError={(e) => {
                                    e.target.style.display = 'none'
                                    e.target.nextSibling.style.display = 'flex'
                                  }}
                                />
                              ) : null}
                              <div 
                                className={`w-16 h-16 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg ${
                                  profileImageUrl ? 'hidden' : 'flex'
                                }`}
                              >
                                {restaurant.name?.charAt(0)?.toUpperCase() || 'R'}
                              </div>
                            </div>
                            
                            {/* Restaurant Info */}
                            <div className="flex-1 min-w-0">
                              <h3 className={`font-semibold text-base mb-1 ${
                                isSelected ? 'text-blue-900' : 'text-slate-900'
                              }`}>
                                {restaurant.name || 'Unnamed Restaurant'}
                              </h3>
                              <p className="text-sm text-slate-500 truncate">
                                ID: {restaurant.restaurantId || restaurant._id}
                              </p>
                              {restaurant.rating && (
                                <div className="flex items-center gap-1 mt-1">
                                  <span className="text-xs text-slate-400">★</span>
                                  <span className="text-xs text-slate-600">{restaurant.rating}</span>
                                </div>
                              )}
                            </div>
                            
                            {/* Selected Indicator */}
                            {isSelected && (
                              <div className="flex-shrink-0">
                                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                                  <CheckCircle2 className="w-5 h-5 text-white" />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
                <div className="text-sm text-slate-600">
                  {filteredRestaurantsForModal.length} restaurant{filteredRestaurantsForModal.length !== 1 ? 's' : ''} available
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRestaurantModal(false)
                      setSelectedBannerId(null)
                      setSelectedRestaurantIds([])
                      setRestaurantSearchQuery("")
                    }}
                    className="px-6"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleLinkRestaurants}
                    disabled={linkingRestaurants || selectedRestaurantIds.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 min-w-[140px]"
                  >
                    {linkingRestaurants ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Linking...
                      </>
                    ) : (
                      <>
                        <Megaphone className="w-4 h-4 mr-2" />
                        Link {selectedRestaurantIds.length > 0 ? `(${selectedRestaurantIds.length})` : ''} Restaurant{selectedRestaurantIds.length !== 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  )
}

