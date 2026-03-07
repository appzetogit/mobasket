import { useState, useMemo, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Download, ChevronDown, Plus, Edit, Trash2, Info, MapPin, SlidersHorizontal, ArrowDownUp, Timer, Star, IndianRupee, UtensilsCrossed, BadgePercent, ShieldCheck, X, Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminAPI, uploadAPI } from "@/lib/api"
import { API_BASE_URL } from "@/lib/api/config"
import { buildImageFallback } from "@/lib/utils/imageFallback"
import { toast } from "sonner"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const STATIC_FOOD_CATEGORY_TYPES = ["Starters", "Main course", "Desserts", "Beverages", "Varieties"]
const DEFAULT_GROCERY_SECTIONS = ["Grocery & Kitchen", "Snacks & Drinks", "Beauty & Personal Care"]
const GROCERY_ENTITY_OPTIONS = [
  { value: "categories", label: "Categories" },
  { value: "subcategories", label: "Subcategories" },
  { value: "products", label: "Products" },
]
const DEFAULT_CATEGORY_IMAGE = buildImageFallback(40, "CAT")

const getInitialFormData = () => ({
  name: "",
  description: "",
  image: DEFAULT_CATEGORY_IMAGE,
  status: true,
  type: "",
  parentCategory: "",
  productCategory: "",
  productSubcategories: [],
  productStoreIds: [],
  mrp: "",
  sellingPrice: "",
  unit: "",
  stockQuantity: 0,
  inStock: true,
})

export default function Category({ scope = "food", defaultGroceryEntity = "categories" }) {
  const isGroceryScope = scope === "grocery"
  const [searchQuery, setSearchQuery] = useState("")
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [sortBy, setSortBy] = useState(null)
  const [selectedCuisine, setSelectedCuisine] = useState(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const [activeScrollSection, setActiveScrollSection] = useState('sort')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeGroceryEntity, setActiveGroceryEntity] = useState(defaultGroceryEntity)
  const [editingCategory, setEditingCategory] = useState(null)
  const [formData, setFormData] = useState(getInitialFormData)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [groceryTypeOptions, setGroceryTypeOptions] = useState(DEFAULT_GROCERY_SECTIONS)
  const [groceryCategoryOptions, setGroceryCategoryOptions] = useState([])
  const [grocerySubcategoryOptions, setGrocerySubcategoryOptions] = useState([])
  const [groceryStoreOptions, setGroceryStoreOptions] = useState([])
  const [createProductCategoryInline, setCreateProductCategoryInline] = useState(false)
  const [inlineProductCategoryName, setInlineProductCategoryName] = useState("")
  const [createProductSubcategoryInline, setCreateProductSubcategoryInline] = useState(false)
  const [inlineProductSubcategoryNamesText, setInlineProductSubcategoryNamesText] = useState("")
  const [isCustomTypeMode, setIsCustomTypeMode] = useState(false)
  const [customTypeValue, setCustomTypeValue] = useState("")

  useEffect(() => {
    if (isGroceryScope) {
      setActiveGroceryEntity(defaultGroceryEntity)
    }
  }, [defaultGroceryEntity, isGroceryScope])
  const fileInputRef = useRef(null)
  const filterSectionRefs = useRef({})
  const rightContentRef = useRef(null)

  const categoryTypeOptions = useMemo(() => {
    if (!isGroceryScope) {
      const merged = new Set(STATIC_FOOD_CATEGORY_TYPES)
      categories.forEach((item) => {
        const normalized = typeof item?.type === "string" ? item.type.trim() : ""
        if (normalized && normalized.toLowerCase() !== "global") {
          merged.add(normalized)
        }
      })
      const formType = typeof formData.type === "string" ? formData.type.trim() : ""
      if (formType && formType.toLowerCase() !== "global") {
        merged.add(formType)
      }
      const customType = typeof customTypeValue === "string" ? customTypeValue.trim() : ""
      if (customType) {
        merged.add(customType)
      }
      return Array.from(merged)
    }

    const merged = new Set(DEFAULT_GROCERY_SECTIONS)
    groceryTypeOptions.forEach((value) => {
      const normalized = typeof value === "string" ? value.trim() : ""
      if (normalized) merged.add(normalized)
    })

    const formType = typeof formData.type === "string" ? formData.type.trim() : ""
    if (formType) merged.add(formType)

    return Array.from(merged)
  }, [categories, customTypeValue, formData.type, groceryTypeOptions, isGroceryScope])

  const activeEntityLabel = useMemo(() => {
    if (!isGroceryScope) return "Category"
    return GROCERY_ENTITY_OPTIONS.find((item) => item.value === activeGroceryEntity)?.label || "Categories"
  }, [activeGroceryEntity, isGroceryScope])

  const activeEntitySingularLabel = useMemo(() => {
    if (!isGroceryScope) return "Category"
    if (activeGroceryEntity === "subcategories") return "Subcategory"
    if (activeGroceryEntity === "products") return "Product"
    return "Category"
  }, [activeGroceryEntity, isGroceryScope])

  const filteredSubcategoryOptions = useMemo(() => {
    if (!isGroceryScope || activeGroceryEntity !== "products") {
      return grocerySubcategoryOptions
    }
    if (createProductCategoryInline) {
      return []
    }
    if (!formData.productCategory) {
      return grocerySubcategoryOptions
    }
    return grocerySubcategoryOptions.filter((item) => item.categoryId === formData.productCategory)
  }, [activeGroceryEntity, createProductCategoryInline, formData.productCategory, grocerySubcategoryOptions, isGroceryScope])

  const handleToggleProductSubcategory = (subcategoryId) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.productSubcategories) ? prev.productSubcategories : []
      const exists = current.includes(subcategoryId)
      return {
        ...prev,
        productSubcategories: exists
          ? current.filter((id) => id !== subcategoryId)
          : [...current, subcategoryId],
      }
    })
  }

  const handleToggleProductStore = (storeId) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.productStoreIds) ? prev.productStoreIds : []
      const exists = current.includes(storeId)
      return {
        ...prev,
        productStoreIds: exists
          ? current.filter((id) => id !== storeId)
          : [...current, storeId],
      }
    })
  }

  // Simple filter toggle function
  const toggleFilter = (filterId) => {
    setActiveFilters(prev => {
      const newSet = new Set(prev)
      if (newSet.has(filterId)) {
        newSet.delete(filterId)
      } else {
        newSet.add(filterId)
      }
      return newSet
    })
  }

  // Fetch categories from API
  useEffect(() => {
    fetchCategories()
    if (isGroceryScope) {
      fetchGroceryTypeOptions()
      fetchGrocerySubcategoryOptions()
      fetchGroceryStoreOptions()
    }
  }, [isGroceryScope, activeGroceryEntity])

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchCategories()
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [searchQuery, activeGroceryEntity, isGroceryScope])

  // Scroll tracking effect for filter modal
  useEffect(() => {
    if (!isFilterOpen || !rightContentRef.current) return

    const observerOptions = {
      root: rightContentRef.current,
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.getAttribute('data-section-id')
          if (sectionId) {
            setActiveScrollSection(sectionId)
            setActiveFilterTab(sectionId)
          }
        }
      })
    }, observerOptions)

    Object.values(filterSectionRefs.current).forEach(ref => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [isFilterOpen])

  // Fetch categories
  const fetchCategories = async () => {
    try {
      setLoading(true)
      const params = {}
      if (searchQuery) params.search = searchQuery

      const response = isGroceryScope
        ? activeGroceryEntity === "subcategories"
          ? await adminAPI.getGrocerySubcategories(params)
          : activeGroceryEntity === "products"
            ? await adminAPI.getGroceryProducts(params)
            : await adminAPI.getGroceryCategories(params)
        : await adminAPI.getCategories(params)

      if (response.data.success) {
        if (isGroceryScope) {
          const list = Array.isArray(response.data.data) ? response.data.data : []
          const normalized = list.map((item, index) => {
            if (activeGroceryEntity === "subcategories") {
              const categoryName = item?.category?.name || "Unassigned"
              return {
                id: item._id,
                sl: index + 1,
                name: item.name || "",
                image: item.image || DEFAULT_CATEGORY_IMAGE,
                status: item.isActive !== false,
                type: categoryName,
                parentCategoryId: item?.category?._id || "",
              }
            }

            if (activeGroceryEntity === "products") {
              const categoryName = item?.category?.name || "Unassigned"
              const firstImage = Array.isArray(item?.images) && item.images.length > 0 ? item.images[0] : ""
              const storeId = item?.storeId?._id || item?.storeId || ""
              const storeName = item?.storeId?.name || ""
              return {
                id: item._id,
                sl: index + 1,
                name: item.name || "",
                description: item.description || "",
                image: firstImage || DEFAULT_CATEGORY_IMAGE,
                status: item.isActive !== false,
                type: `${categoryName}${item?.unit ? ` (${item.unit})` : ""}${storeName ? ` - ${storeName}` : ""}`,
                productCategoryId: item?.category?._id || "",
                productSubcategoryIds: Array.isArray(item?.subcategories)
                  ? item.subcategories.map((sub) => sub?._id || sub).filter(Boolean)
                  : [],
                productStoreId: storeId ? String(storeId) : "",
                productStoreName: storeName,
                mrp: item?.mrp ?? "",
                sellingPrice: item?.sellingPrice ?? "",
                unit: item?.unit || "",
                stockQuantity: item?.stockQuantity ?? 0,
                inStock: item?.inStock !== false,
              }
            }

            return {
              id: item._id,
              sl: index + 1,
              name: item.name || "",
              image: item.image || DEFAULT_CATEGORY_IMAGE,
              status: item.isActive !== false,
              type: item.section || "",
            }
          })
          setCategories(normalized)
        } else {
          setCategories(response.data.data.categories || [])
        }
      } else {
        toast.error(response.data.message || `Failed to load ${activeEntityLabel.toLowerCase()}`)
        setCategories([])
      }
    } catch (error) {
      // More detailed error logging
      console.error('Error fetching categories:', error)
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        } : null,
        request: error.request ? {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL
        } : null
      })
      
      if (error.response) {
        // Server responded with error status
        const status = error.response.status
        const errorData = error.response.data
        
        if (status === 401) {
          toast.error('Authentication required. Please login again.')
        } else if (status === 403) {
          toast.error('Access denied. You do not have permission.')
        } else if (status === 404) {
          toast.error(`${activeEntityLabel} endpoint not found. Please check backend server.`)
        } else if (status >= 500) {
          toast.error('Server error. Please try again later.')
        } else {
          toast.error(errorData?.message || `Error ${status}: Failed to load categories`)
        }
      } else if (error.request) {
        // Request was made but no response received
        console.error('Network error - No response from server')
        console.error('Request URL:', error.config?.baseURL + error.config?.url)
        toast.error('Cannot connect to server. Please check if backend is running on ' + API_BASE_URL.replace('/api', ''))
      } else {
        // Something else happened
        console.error('Request setup error:', error.message)
        toast.error(error.message || 'Failed to load categories')
      }
      
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  const fetchGroceryTypeOptions = async () => {
    if (!isGroceryScope) {
      return
    }

    try {
      const response = await adminAPI.getGroceryCategories()
      if (!response?.data?.success) {
        return
      }

      const allCategories = Array.isArray(response.data.data) ? response.data.data : []
      const sectionSet = new Set(DEFAULT_GROCERY_SECTIONS)
      const normalizedCategoryOptions = []
      allCategories.forEach((item) => {
        const section = typeof item?.section === "string" ? item.section.trim() : ""
        if (section) {
          sectionSet.add(section)
        }
        if (item?._id && item?.name) {
          normalizedCategoryOptions.push({
            id: item._id,
            name: item.name,
            section: item.section || "",
          })
        }
      })
      setGroceryTypeOptions(Array.from(sectionSet))
      setGroceryCategoryOptions(normalizedCategoryOptions)
    } catch (error) {
      console.error('Error fetching grocery category types:', error)
      setGroceryTypeOptions(DEFAULT_GROCERY_SECTIONS)
      setGroceryCategoryOptions([])
    }
  }

  const fetchGrocerySubcategoryOptions = async () => {
    if (!isGroceryScope) return
    try {
      const response = await adminAPI.getGrocerySubcategories()
      if (!response?.data?.success) return
      const allSubcategories = Array.isArray(response.data.data) ? response.data.data : []
      const normalized = allSubcategories
        .filter((item) => item?._id && item?.name)
        .map((item) => ({
          id: item._id,
          name: item.name,
          categoryId: item?.category?._id || item?.category || "",
          categoryName: item?.category?.name || "",
        }))
      setGrocerySubcategoryOptions(normalized)
    } catch (error) {
      console.error('Error fetching grocery subcategory options:', error)
      setGrocerySubcategoryOptions([])
    }
  }

  const fetchGroceryStoreOptions = async () => {
    if (!isGroceryScope) return
    try {
      const response = await adminAPI.getGroceryStores({ page: 1, limit: 500 })
      if (!response?.data?.success) return

      const stores = Array.isArray(response?.data?.data?.stores) ? response.data.data.stores : []
      const normalized = stores
        .filter((store) => store?._id && store?.name)
        .map((store) => ({
          id: store._id,
          name: store.name,
          isActive: store.isActive !== false,
        }))
      setGroceryStoreOptions(normalized)
    } catch (error) {
      console.error('Error fetching grocery store options:', error)
      setGroceryStoreOptions([])
    }
  }

  const filteredCategories = useMemo(() => {
    let result = [...categories]
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(cat =>
        cat.name?.toLowerCase().includes(query) ||
        cat.id?.toString().includes(query)
      )
    }

    return result
  }, [categories, searchQuery])

  const handleToggleStatus = async (id) => {
    try {
      const currentCategory = categories.find(cat => cat.id === id)
      const nextStatus = !(currentCategory?.status)
      const response = isGroceryScope
        ? activeGroceryEntity === "subcategories"
          ? await adminAPI.toggleGrocerySubcategoryStatus(id, nextStatus)
          : activeGroceryEntity === "products"
            ? await adminAPI.toggleGroceryProductStatus(id, nextStatus)
            : await adminAPI.toggleGroceryCategoryStatus(id, nextStatus)
        : await adminAPI.toggleCategoryStatus(id)
      if (response.data.success) {
        toast.success('Status updated successfully')
        // Update local state immediately for better UX
        setCategories(prevCategories =>
          prevCategories.map(cat =>
            cat.id === id ? { ...cat, status: !cat.status } : cat
          )
        )
        // Refresh from server to ensure consistency
        setTimeout(() => fetchCategories(), 500)
      }
    } catch (error) {
      console.error('Error toggling status:', error)
      const errorMessage = error.response?.data?.message || 'Failed to update category status'
      toast.error(errorMessage)
    }
  }


  const handleDelete = async (id) => {
    const itemName = categories.find(cat => cat.id === id)?.name || 'this item'
    if (window.confirm(`Are you sure you want to delete "${itemName}"? This action cannot be undone.`)) {
      try {
        const response = isGroceryScope
          ? activeGroceryEntity === "subcategories"
            ? await adminAPI.deleteGrocerySubcategory(id)
            : activeGroceryEntity === "products"
              ? await adminAPI.deleteGroceryProduct(id)
              : await adminAPI.deleteGroceryCategory(id)
          : await adminAPI.deleteCategory(id)
        if (response.data.success) {
          toast.success('Deleted successfully')
          // Remove from local state immediately for better UX
          setCategories(prevCategories => prevCategories.filter(cat => cat.id !== id))
          // Refresh from server to ensure consistency
          setTimeout(() => fetchCategories(), 500)
          if (isGroceryScope && activeGroceryEntity === "categories") {
            setTimeout(() => fetchGroceryTypeOptions(), 500)
          }
          if (isGroceryScope) {
            setTimeout(() => fetchGrocerySubcategoryOptions(), 500)
          }
        }
      } catch (error) {
        console.error('Error deleting category:', error)
        const errorMessage = error.response?.data?.message || 'Failed to delete'
        toast.error(errorMessage)
      }
    }
  }

  const handleEdit = (category) => {
    setEditingCategory(category)
    setCreateProductCategoryInline(false)
    setInlineProductCategoryName("")
    setCreateProductSubcategoryInline(false)
    setInlineProductSubcategoryNamesText("")
    setIsCustomTypeMode(false)
    setCustomTypeValue("")
    if (isGroceryScope && activeGroceryEntity === "subcategories") {
      setFormData({
        ...getInitialFormData(),
        name: category.name || "",
        description: category.description || "",
        image: category.image || DEFAULT_CATEGORY_IMAGE,
        status: category.status !== undefined ? category.status : true,
        parentCategory: category.parentCategoryId || "",
      })
    } else if (isGroceryScope && activeGroceryEntity === "products") {
      setFormData({
        ...getInitialFormData(),
        name: category.name || "",
        description: category.description || "",
        image: category.image || DEFAULT_CATEGORY_IMAGE,
        status: category.status !== undefined ? category.status : true,
        productCategory: category.productCategoryId || "",
        productSubcategories: Array.isArray(category.productSubcategoryIds) ? category.productSubcategoryIds : [],
        productStoreIds: category.productStoreId ? [category.productStoreId] : [],
        mrp: category.mrp ?? "",
        sellingPrice: category.sellingPrice ?? "",
        unit: category.unit || "",
        stockQuantity: category.stockQuantity ?? 0,
        inStock: category.inStock !== false,
      })
    } else {
      setFormData({
        ...getInitialFormData(),
        name: category.name || "",
        image: category.image || DEFAULT_CATEGORY_IMAGE,
        status: category.status !== undefined ? category.status : true,
        type: category.type || ""
      })
    }
    setSelectedImageFile(null)
    setImagePreview(category.image || null)
    setIsModalOpen(true)
  }

  const handleAddNew = () => {
    setEditingCategory(null)
    setFormData(getInitialFormData())
    setCreateProductCategoryInline(false)
    setInlineProductCategoryName("")
    setCreateProductSubcategoryInline(false)
    setInlineProductSubcategoryNamesText("")
    setIsCustomTypeMode(false)
    setCustomTypeValue("")
    setSelectedImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    setIsModalOpen(true)
  }

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      })
      
      // Add title
      doc.setFontSize(18)
      doc.setTextColor(30, 30, 30)
      doc.text('Category List', 14, 20)
      
      // Add date
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
      doc.text(`Generated on: ${date}`, 14, 28)
      
      // Prepare table data
      const tableData = filteredCategories.map((category, index) => [
        category.sl || index + 1,
        category.name || 'N/A',
        category.type || 'N/A',
        category.status ? 'Active' : 'Inactive',
        category.id || 'N/A'
      ])
      
      // Add table
      autoTable(doc, {
        startY: 35,
        margin: { left: 10, right: 10, bottom: 15 },
        head: [['SL', 'Category Name', 'Type', 'Status', 'ID']],
        body: tableData,
        theme: 'striped',
        tableWidth: 'auto',
        headStyles: {
          fillColor: [59, 130, 246], // Blue color
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 10
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [30, 30, 30]
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250]
        },
        styles: {
          cellPadding: 3,
          overflow: 'linebreak',
          valign: 'middle',
          lineColor: [200, 200, 200],
          lineWidth: 0.5
        },
        columnStyles: {
          0: { cellWidth: 14, halign: 'center' }, // SL
          1: { cellWidth: 80 }, // Category Name
          2: { cellWidth: 55 }, // Type
          3: { cellWidth: 26, halign: 'center' }, // Status
          4: { cellWidth: 92 }  // ID
        }
      })
      
      // Add footer
      const pageCount = doc.internal.pages.length - 1
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(
          `Page ${i} of ${pageCount}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        )
      }
      
      // Save PDF
      const fileName = `Categories_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)
      
      toast.success('PDF exported successfully!')
    } catch (error) {
      console.error('Error exporting PDF:', error)
      toast.error('Failed to export PDF')
    }
  }

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.")
      return
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      toast.error("File size exceeds 5MB limit.")
      return
    }

    // Set file and create preview
    setSelectedImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = () => {
    setSelectedImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingCategory(null)
    setCreateProductCategoryInline(false)
    setInlineProductCategoryName("")
    setCreateProductSubcategoryInline(false)
    setInlineProductSubcategoryNamesText("")
    setIsCustomTypeMode(false)
    setCustomTypeValue("")
    setSelectedImageFile(null)
    setImagePreview(null)
    setFormData(getInitialFormData())
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setUploadingImage(true)

      let resolvedImageValue = formData.image
      if (isGroceryScope && selectedImageFile) {
        const uploadResponse = await uploadAPI.uploadMedia(selectedImageFile, {
          folder: "mobasket/grocery/categories",
        })
        resolvedImageValue = uploadResponse?.data?.data?.url || ""
      }

      if (!isGroceryScope) {
        const resolvedType = isCustomTypeMode
          ? String(customTypeValue || "").trim()
          : String(formData.type || "").trim()

        if (!resolvedType) {
          toast.error("Category type is required")
          return
        }

        const formDataToSend = new FormData()
        formDataToSend.append('name', formData.name)
        formDataToSend.append('type', resolvedType)
        formDataToSend.append('status', formData.status.toString())
        if (selectedImageFile) {
          formDataToSend.append('image', selectedImageFile)
        } else if (resolvedImageValue && resolvedImageValue !== DEFAULT_CATEGORY_IMAGE) {
          formDataToSend.append('image', resolvedImageValue)
        }

        if (editingCategory) {
          const response = await adminAPI.updateCategory(editingCategory.id, formDataToSend)
          if (response.data.success) {
            toast.success('Category updated successfully')
          }
        } else {
          const response = await adminAPI.createCategory(formDataToSend)
          if (response.data.success) {
            toast.success('Category created successfully')
          }
        }
      } else if (activeGroceryEntity === "subcategories") {
        const payload = {
          category: formData.parentCategory,
          name: formData.name,
          isActive: formData.status,
          image: resolvedImageValue && resolvedImageValue !== DEFAULT_CATEGORY_IMAGE ? resolvedImageValue : "",
        }
        if (editingCategory) {
          const response = await adminAPI.updateGrocerySubcategory(editingCategory.id, payload)
          if (response.data.success) toast.success('Subcategory updated successfully')
        } else {
          const response = await adminAPI.createGrocerySubcategory(payload)
          if (response.data.success) toast.success('Subcategory created successfully')
        }
      } else if (activeGroceryEntity === "products") {
        const normalizedStoreIds = Array.isArray(formData.productStoreIds)
          ? [...new Set(formData.productStoreIds.filter(Boolean).map((id) => String(id).trim()))]
          : []

        if (normalizedStoreIds.length === 0) {
          toast.error("Please select at least one grocery store for this product.")
          return
        }

        const parseEntityId = (response) => {
          const data = response?.data?.data
          return data?._id || data?.id || response?.data?._id || response?.data?.id || ""
        }

        let resolvedCategoryId = formData.productCategory
        if (createProductCategoryInline) {
          const categoryName = inlineProductCategoryName.trim()
          if (!categoryName) {
            toast.error("Please enter a new category name.")
            return
          }
          const categoryCreateResponse = await adminAPI.createGroceryCategory({
            name: categoryName,
            section: categoryName,
            isActive: true,
            image: "",
          })
          const createdCategoryId = parseEntityId(categoryCreateResponse)
          if (!createdCategoryId) {
            toast.error("Failed to create new category.")
            return
          }
          resolvedCategoryId = createdCategoryId
        }

        if (!resolvedCategoryId) {
          toast.error("Please select a category or create a new one.")
          return
        }

        const resolvedSubcategoryIds = Array.isArray(formData.productSubcategories)
          ? [...new Set(formData.productSubcategories.filter(Boolean).map((id) => String(id)))]
          : []

        if (createProductSubcategoryInline) {
          const names = inlineProductSubcategoryNamesText
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)

          if (names.length === 0) {
            toast.error("Please enter at least one new subcategory name.")
            return
          }

          for (const subcategoryName of names) {
            const subcategoryCreateResponse = await adminAPI.createGrocerySubcategory({
              category: resolvedCategoryId,
              name: subcategoryName,
              isActive: true,
              image: "",
            })
            const createdSubcategoryId = parseEntityId(subcategoryCreateResponse)
            if (createdSubcategoryId) {
              resolvedSubcategoryIds.push(String(createdSubcategoryId))
            }
          }
        }

        const uniqueResolvedSubcategoryIds = [...new Set(resolvedSubcategoryIds)]

        const payload = {
          category: resolvedCategoryId,
          subcategories: uniqueResolvedSubcategoryIds,
          name: formData.name,
          description: (formData.description || "").trim(),
          mrp: Number(formData.mrp || 0),
          sellingPrice: Number(formData.sellingPrice || 0),
          unit: formData.unit || "",
          stockQuantity: Number(formData.stockQuantity || 0),
          inStock: Boolean(formData.inStock),
          isActive: Boolean(formData.status),
          images: resolvedImageValue && resolvedImageValue !== DEFAULT_CATEGORY_IMAGE ? [resolvedImageValue] : [],
        }
        if (editingCategory) {
          if (normalizedStoreIds.length > 0) {
            payload.storeId = normalizedStoreIds[0]
          }
          const response = await adminAPI.updateGroceryProduct(editingCategory.id, payload)
          if (response.data.success) toast.success('Product updated successfully')
        } else {
          payload.storeIds = normalizedStoreIds
          const response = await adminAPI.createGroceryProduct(payload)
          if (response.data.success) {
            const createdCount = Number(response?.data?.count || normalizedStoreIds.length || 1)
            toast.success(createdCount > 1 ? `Product created for ${createdCount} stores` : 'Product created successfully')
          }
        }

        // Sync local options for newly created category/subcategory choices.
        await fetchGroceryTypeOptions()
        await fetchGrocerySubcategoryOptions()
      } else {
        const normalizedCategoryName = (formData.name || "").trim()
        const payload = {
          name: normalizedCategoryName,
          section: normalizedCategoryName,
          isActive: Boolean(formData.status),
          image: resolvedImageValue && resolvedImageValue !== DEFAULT_CATEGORY_IMAGE ? resolvedImageValue : "",
        }
        if (editingCategory) {
          const response = await adminAPI.updateGroceryCategory(editingCategory.id, payload)
          if (response.data.success) toast.success('Category updated successfully')
        } else {
          const response = await adminAPI.createGroceryCategory(payload)
          if (response.data.success) toast.success('Category created successfully')
        }
      }
      
      // Close modal and reset form
      handleCloseModal()
      
      // Refresh from server to ensure consistency
      setTimeout(() => fetchCategories(), 500)
      if (isGroceryScope) {
        setTimeout(() => fetchGroceryTypeOptions(), 500)
        setTimeout(() => fetchGrocerySubcategoryOptions(), 500)
      }
    } catch (error) {
      console.error('Error saving category:', error)
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        } : null,
        request: error.request ? {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL
        } : null
      })
      
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        toast.error('Cannot connect to server. Please check if backend is running on ' + API_BASE_URL.replace('/api', ''))
      } else if (error.response) {
        toast.error(error.response.data?.message || `Error ${error.response.status}: Failed to save category`)
      } else {
        toast.error(error.message || 'Failed to save category')
      }
    } finally {
      setUploadingImage(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{isGroceryScope ? "Grocery Catalog" : "Category"}</h1>
        </div>

        {isGroceryScope && (
          <div className="mb-4 flex flex-wrap gap-2">
            {GROCERY_ENTITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setActiveGroceryEntity(option.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  activeGroceryEntity === option.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{activeEntityLabel} List</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {filteredCategories.length}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <input
                type="text"
                placeholder="Ex : Categories"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>

            <button 
              onClick={handleExportPDF}
              disabled={filteredCategories.length === 0}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            <button 
              onClick={handleAddNew}
              className="px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add New {activeEntitySingularLabel}</span>
            </button>
          </div>
        </div>
      </div>


      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-hidden">
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
                  Title
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Status
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
                      <p className="text-sm text-slate-500">Loading categories...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                      <p className="text-sm text-slate-500">No categories match your search</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCategories.map((category, index) => (
                  <tr
                    key={category.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{category.sl || index + 1}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                        <img
                          src={category.image}
                          alt={category.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                                  e.target.src = DEFAULT_CATEGORY_IMAGE
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-900">{category.name}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{category.type || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleStatus(category.id)}
                        disabled={loading}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                          category.status
                            ? "bg-blue-600"
                            : "bg-slate-300"
                        }`}
                        title={category.status ? "Click to deactivate" : "Click to activate"}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            category.status ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(category)}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Filter Modal - Removed */}
      {false && typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {false && (
              <div className="fixed inset-0 z-[100]">
                {/* Backdrop */}
                <div 
                  className="absolute inset-0 bg-black/50" 
                  onClick={() => setIsFilterOpen(false)}
                />
                
                {/* Modal Content */}
                <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[85vh] flex flex-col animate-[slideUp_0.3s_ease-out]">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-4 border-b">
                    <h2 className="text-lg font-bold text-gray-900">Filters and sorting</h2>
                    <button 
                      onClick={() => {
                        setActiveFilters(new Set())
                        setSortBy(null)
                        setSelectedCuisine(null)
                      }}
                      className="text-green-600 font-medium text-sm"
                    >
                      Clear all
                    </button>
                  </div>
                  
                  {/* Body */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Left Sidebar - Tabs */}
                    <div className="w-24 sm:w-28 bg-gray-50 border-r flex flex-col">
                      {[
                        { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
                        { id: 'time', label: 'Time', icon: Timer },
                        { id: 'rating', label: 'Rating', icon: Star },
                        { id: 'distance', label: 'Distance', icon: MapPin },
                        { id: 'price', label: 'Dish Price', icon: IndianRupee },
                        { id: 'cuisine', label: 'Cuisine', icon: UtensilsCrossed },
                        { id: 'offers', label: 'Offers', icon: BadgePercent },
                        { id: 'trust', label: 'Trust', icon: ShieldCheck },
                      ].map((tab) => {
                        const Icon = tab.icon
                        const isActive = activeScrollSection === tab.id || activeFilterTab === tab.id
                        return (
                          <button
                            key={tab.id}
                            onClick={() => {
                              setActiveFilterTab(tab.id)
                              const section = filterSectionRefs.current[tab.id]
                              if (section) {
                                section.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              }
                            }}
                            className={`flex flex-col items-center gap-1 py-4 px-2 text-center relative transition-colors ${
                              isActive ? 'bg-white text-green-600' : 'text-gray-500 hover:bg-gray-100'
                            }`}
                          >
                            {isActive && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-600 rounded-r" />
                            )}
                            <Icon className="h-5 w-5" strokeWidth={1.5} />
                            <span className="text-xs font-medium leading-tight">{tab.label}</span>
                          </button>
                        )
                      })}
                    </div>
                    
                    {/* Right Content Area - Scrollable */}
                    <div ref={rightContentRef} className="flex-1 overflow-y-auto p-4">
                      {/* Sort By Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['sort'] = el}
                        data-section-id="sort"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Sort by</h3>
                        <div className="flex flex-col gap-3">
                          {[
                            { id: null, label: 'Relevance' },
                            { id: 'price-low', label: 'Price: Low to High' },
                            { id: 'price-high', label: 'Price: High to Low' },
                            { id: 'rating-high', label: 'Rating: High to Low' },
                            { id: 'rating-low', label: 'Rating: Low to High' },
                          ].map((option) => (
                            <button
                              key={option.id || 'relevance'}
                              onClick={() => setSortBy(option.id)}
                              className={`px-4 py-3 rounded-xl border text-left transition-colors ${
                                sortBy === option.id
                                  ? 'border-green-600 bg-green-50'
                                  : 'border-gray-200 hover:border-green-600'
                              }`}
                            >
                              <span className={`text-sm font-medium ${sortBy === option.id ? 'text-green-600' : 'text-gray-700'}`}>
                                {option.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Time Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['time'] = el}
                        data-section-id="time"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Delivery Time</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={() => toggleFilter('delivery-under-30')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('delivery-under-30') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-30') ? 'text-green-600' : 'text-gray-600'}`} strokeWidth={1.5} />
                            <span className={`text-sm font-medium ${activeFilters.has('delivery-under-30') ? 'text-green-600' : 'text-gray-700'}`}>Under 30 mins</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('delivery-under-45')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('delivery-under-45') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-45') ? 'text-green-600' : 'text-gray-600'}`} strokeWidth={1.5} />
                            <span className={`text-sm font-medium ${activeFilters.has('delivery-under-45') ? 'text-green-600' : 'text-gray-700'}`}>Under 45 mins</span>
                          </button>
                        </div>
                      </div>
                      
                      {/* Rating Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['rating'] = el}
                        data-section-id="rating"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Restaurant Rating</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={() => toggleFilter('rating-35-plus')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('rating-35-plus') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <Star className={`h-6 w-6 ${activeFilters.has('rating-35-plus') ? 'text-green-600 fill-green-600' : 'text-gray-400'}`} />
                            <span className={`text-sm font-medium ${activeFilters.has('rating-35-plus') ? 'text-green-600' : 'text-gray-700'}`}>Rated 3.5+</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('rating-4-plus')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('rating-4-plus') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <Star className={`h-6 w-6 ${activeFilters.has('rating-4-plus') ? 'text-green-600 fill-green-600' : 'text-gray-400'}`} />
                            <span className={`text-sm font-medium ${activeFilters.has('rating-4-plus') ? 'text-green-600' : 'text-gray-700'}`}>Rated 4.0+</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('rating-45-plus')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('rating-45-plus') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <Star className={`h-6 w-6 ${activeFilters.has('rating-45-plus') ? 'text-green-600 fill-green-600' : 'text-gray-400'}`} />
                            <span className={`text-sm font-medium ${activeFilters.has('rating-45-plus') ? 'text-green-600' : 'text-gray-700'}`}>Rated 4.5+</span>
                          </button>
                        </div>
                      </div>

                      {/* Distance Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['distance'] = el}
                        data-section-id="distance"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Distance</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={() => toggleFilter('distance-under-1km')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('distance-under-1km') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-1km') ? 'text-green-600' : 'text-gray-600'}`} strokeWidth={1.5} />
                            <span className={`text-sm font-medium ${activeFilters.has('distance-under-1km') ? 'text-green-600' : 'text-gray-700'}`}>Under 1 km</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('distance-under-2km')}
                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                              activeFilters.has('distance-under-2km') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-2km') ? 'text-green-600' : 'text-gray-600'}`} strokeWidth={1.5} />
                            <span className={`text-sm font-medium ${activeFilters.has('distance-under-2km') ? 'text-green-600' : 'text-gray-700'}`}>Under 2 km</span>
                          </button>
                        </div>
                      </div>
                      
                      {/* Price Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['price'] = el}
                        data-section-id="price"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Dish Price</h3>
                        <div className="flex flex-col gap-3">
                          <button 
                            onClick={() => toggleFilter('price-under-200')}
                            className={`px-4 py-3 rounded-xl border text-left transition-colors ${
                              activeFilters.has('price-under-200') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <span className={`text-sm font-medium ${activeFilters.has('price-under-200') ? 'text-green-600' : 'text-gray-700'}`}>Under ₹200</span>
                          </button>
                          <button 
                            onClick={() => toggleFilter('price-under-500')}
                            className={`px-4 py-3 rounded-xl border text-left transition-colors ${
                              activeFilters.has('price-under-500') 
                                ? 'border-green-600 bg-green-50' 
                                : 'border-gray-200 hover:border-green-600'
                            }`}
                          >
                            <span className={`text-sm font-medium ${activeFilters.has('price-under-500') ? 'text-green-600' : 'text-gray-700'}`}>Under ₹500</span>
                          </button>
                        </div>
                      </div>

                      {/* Cuisine Tab */}
                      <div 
                        ref={el => filterSectionRefs.current['cuisine'] = el}
                        data-section-id="cuisine"
                        className="space-y-4 mb-8"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cuisine</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {['Chinese', 'American', 'Japanese', 'Italian', 'Mexican', 'Indian', 'Asian', 'Seafood', 'Desserts', 'Cafe', 'Healthy'].map((cuisine) => (
                            <button
                              key={cuisine}
                              onClick={() => setSelectedCuisine(selectedCuisine === cuisine ? null : cuisine)}
                              className={`px-4 py-3 rounded-xl border text-center transition-colors ${
                                selectedCuisine === cuisine
                                  ? 'border-green-600 bg-green-50'
                                  : 'border-gray-200 hover:border-green-600'
                              }`}
                            >
                              <span className={`text-sm font-medium ${selectedCuisine === cuisine ? 'text-green-600' : 'text-gray-700'}`}>
                                {cuisine}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Trust Markers Tab */}
                      {activeFilterTab === 'trust' && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold text-gray-900">Trust Markers</h3>
                          <div className="flex flex-col gap-3">
                            <button className="px-4 py-3 rounded-xl border border-gray-200 hover:border-green-600 text-left transition-colors">
                              <span className="text-sm font-medium text-gray-700">Top Rated</span>
                            </button>
                            <button className="px-4 py-3 rounded-xl border border-gray-200 hover:border-green-600 text-left transition-colors">
                              <span className="text-sm font-medium text-gray-700">Trusted by 1000+ users</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Footer */}
                  <div className="flex items-center gap-4 px-4 py-4 border-t bg-white">
                    <button 
                      onClick={() => setIsFilterOpen(false)}
                      className="flex-1 py-3 text-center font-semibold text-gray-700"
                    >
                      Close
                    </button>
                    <button 
                      onClick={() => setIsFilterOpen(false)}
                      className={`flex-1 py-3 font-semibold rounded-xl transition-colors ${
                        activeFilters.size > 0 || sortBy || selectedCuisine
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {activeFilters.size > 0 || sortBy || selectedCuisine
                        ? 'Show results'
                        : 'Show results'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Create/Edit Category Modal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isModalOpen && (
              <div className="fixed inset-0 z-[200]">
                {/* Backdrop */}
                <div 
                  className="absolute inset-0 bg-black/50" 
                  onClick={handleCloseModal}
                />
                
                {/* Modal Content */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h2 className="text-xl font-bold text-slate-900">
                      {editingCategory ? `Edit ${activeEntitySingularLabel}` : `Add New ${activeEntitySingularLabel}`}
                    </h2>
                    <button 
                      onClick={handleCloseModal}
                      className="p-1 rounded hover:bg-slate-100 transition-colors"
                    >
                      <X className="w-5 h-5 text-slate-500" />
                    </button>
                  </div>
                  
                  {/* Form */}
                  <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {!isGroceryScope && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Category Type *
                        </label>
                        <select
                          required
                          value={isCustomTypeMode ? "__custom__" : formData.type}
                          onChange={(e) => {
                            const selected = e.target.value
                            if (selected === "__custom__") {
                              setIsCustomTypeMode(true)
                              setFormData({ ...formData, type: "" })
                              return
                            }
                            setIsCustomTypeMode(false)
                            setCustomTypeValue("")
                            setFormData({ ...formData, type: selected })
                          }}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">Select category type</option>
                          {categoryTypeOptions.map((typeOption) => (
                            <option key={typeOption} value={typeOption}>
                              {typeOption}
                            </option>
                          ))}
                          <option value="__custom__">Add new type</option>
                        </select>
                        {isCustomTypeMode && (
                          <input
                            type="text"
                            required
                            value={customTypeValue}
                            onChange={(e) => setCustomTypeValue(e.target.value)}
                            placeholder="Enter new category type"
                            className="w-full mt-2 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    )}

                    {isGroceryScope && activeGroceryEntity === "subcategories" && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Parent Category *
                        </label>
                        <select
                          required
                          value={formData.parentCategory}
                          onChange={(e) => setFormData({ ...formData, parentCategory: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">Select parent category</option>
                          {groceryCategoryOptions.map((categoryOption) => (
                            <option key={categoryOption.id} value={categoryOption.id}>
                              {categoryOption.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {isGroceryScope && activeGroceryEntity === "products" && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Grocery Stores *
                          </label>
                          <div className="border border-slate-300 rounded-lg p-2 max-h-48 overflow-y-auto bg-white">
                            {groceryStoreOptions.length === 0 && (
                              <p className="text-xs text-slate-500 px-1 py-1">
                                No grocery stores available.
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {groceryStoreOptions.map((storeOption) => {
                                const isSelected = formData.productStoreIds.includes(storeOption.id)
                                return (
                                  <button
                                    key={storeOption.id}
                                    type="button"
                                    onClick={() => handleToggleProductStore(storeOption.id)}
                                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                                      isSelected
                                        ? "bg-blue-600 text-white border-blue-600"
                                        : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                                    }`}
                                  >
                                    {storeOption.name}{storeOption.isActive ? "" : " (Inactive)"}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {editingCategory
                              ? "Select one store for this existing product."
                              : "Tap/click to select one or multiple stores for this product."}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Category *
                          </label>
                          <select
                            required={!createProductCategoryInline}
                            disabled={createProductCategoryInline}
                            value={formData.productCategory}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                productCategory: e.target.value,
                                productSubcategories: [],
                              })
                            }
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                          >
                            <option value="">Select category</option>
                            {groceryCategoryOptions.map((categoryOption) => (
                              <option key={categoryOption.id} value={categoryOption.id}>
                                {categoryOption.name}
                              </option>
                            ))}
                          </select>
                          {!editingCategory && (
                            <div className="mt-2 space-y-2">
                              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={createProductCategoryInline}
                                  onChange={(e) => {
                                    const checked = e.target.checked
                                    setCreateProductCategoryInline(checked)
                                    setFormData((prev) => ({
                                      ...prev,
                                      productCategory: checked ? "" : prev.productCategory,
                                      productSubcategories: checked ? [] : prev.productSubcategories,
                                    }))
                                    if (!checked) setInlineProductCategoryName("")
                                  }}
                                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                />
                                Create new category now
                              </label>
                              {createProductCategoryInline && (
                                <input
                                  type="text"
                                  value={inlineProductCategoryName}
                                  onChange={(e) => setInlineProductCategoryName(e.target.value)}
                                  placeholder="Enter new category name"
                                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                />
                              )}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Subcategories
                          </label>
                          <div className="border border-slate-300 rounded-lg p-2 max-h-48 overflow-y-auto bg-white">
                            {filteredSubcategoryOptions.length === 0 && (
                              <p className="text-xs text-slate-500 px-1 py-1">
                                No subcategories available for selected category.
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {filteredSubcategoryOptions.map((subcategoryOption) => {
                                const isSelected = formData.productSubcategories.includes(subcategoryOption.id)
                                return (
                                  <button
                                    key={subcategoryOption.id}
                                    type="button"
                                    onClick={() => handleToggleProductSubcategory(subcategoryOption.id)}
                                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                                      isSelected
                                        ? "bg-blue-600 text-white border-blue-600"
                                        : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                                    }`}
                                  >
                                    {subcategoryOption.name}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">Tap/click to select one or multiple subcategories</p>
                          {!editingCategory && (
                            <div className="mt-2 space-y-2">
                              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={createProductSubcategoryInline}
                                  onChange={(e) => {
                                    const checked = e.target.checked
                                    setCreateProductSubcategoryInline(checked)
                                    if (!checked) {
                                      setInlineProductSubcategoryNamesText("")
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                />
                                Create new subcategory now
                              </label>
                              {createProductSubcategoryInline && (
                                <input
                                  type="text"
                                  value={inlineProductSubcategoryNamesText}
                                  onChange={(e) => setInlineProductSubcategoryNamesText(e.target.value)}
                                  placeholder="Enter new subcategory name(s), comma separated"
                                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        {activeEntitySingularLabel} Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter category name"
                      />
                    </div>

                    {isGroceryScope && activeGroceryEntity === "products" && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                              MRP *
                            </label>
                            <input
                              type="number"
                              min="0"
                              required
                              value={formData.mrp}
                              onChange={(e) => setFormData({ ...formData, mrp: e.target.value })}
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                              Selling Price *
                            </label>
                            <input
                              type="number"
                              min="0"
                              required
                              value={formData.sellingPrice}
                              onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                              Unit
                            </label>
                            <input
                              type="text"
                              value={formData.unit}
                              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                              placeholder="eg. 1kg"
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                              Stock Qty
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={formData.stockQuantity}
                              onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="inStock"
                            checked={formData.inStock}
                            onChange={(e) => setFormData({ ...formData, inStock: e.target.checked })}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="inStock" className="text-sm font-medium text-slate-700">
                            In Stock
                          </label>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Product Details
                          </label>
                          <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Enter product details shown on product page"
                            rows={3}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        {activeEntitySingularLabel} Image
                      </label>
                      <div className="space-y-3">
                        {/* Image Preview */}
                        {(imagePreview || formData.image) && (
                          <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-slate-300">
                            <img
                              src={imagePreview || formData.image}
                              alt="Category preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.src = buildImageFallback(128, "CAT")
                              }}
                            />
                            {imagePreview && (
                              <button
                                type="button"
                                onClick={handleRemoveImage}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                        
                        {/* File Input */}
                        <div className="flex items-center gap-3">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp"
                            onChange={handleImageSelect}
                            className="hidden"
                            id="category-image-upload"
                          />
                          <label
                            htmlFor="category-image-upload"
                            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
                          >
                            <Upload className="w-4 h-4 text-slate-600" />
                            <span className="text-sm text-slate-700">
                              {imagePreview ? 'Change Image' : 'Upload Image'}
                            </span>
                          </label>
                          {uploadingImage && (
                            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Supported formats: PNG, JPG, JPEG, WEBP (Max 5MB)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="status"
                        checked={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="status" className="text-sm font-medium text-slate-700">
                        Active Status
                      </label>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-3 pt-4">
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        {editingCategory ? 'Update' : 'Create'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      <style>{`
        @keyframes slideUp {
          0% {
            transform: translateY(100%);
          }
          100% {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}


