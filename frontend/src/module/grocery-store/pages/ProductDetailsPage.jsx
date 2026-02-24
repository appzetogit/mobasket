import { useState, useRef, useEffect, useMemo } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import { ArrowLeft, X, Upload, Loader2, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { groceryStoreAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"

export default function GroceryStoreProductDetailsPage() {
  const navigate = useNavigate()
  const { id: idParam } = useParams()
  const location = useLocation()
  // Treat "new", "undefined", or missing id as new product
  const isNewProduct = !idParam || idParam === "new" || idParam === "undefined"
  const id = isNewProduct ? null : idParam
  const fileInputRef = useRef(null)

  const [productName, setProductName] = useState("")
  const [category, setCategory] = useState("")
  const [subcategories, setSubcategories] = useState([])
  const [description, setDescription] = useState("")
  const [mrp, setMrp] = useState("")
  const [sellingPrice, setSellingPrice] = useState("")
  const [unit, setUnit] = useState("")
  const [stockQuantity, setStockQuantity] = useState("0")
  const [inStock, setInStock] = useState(true)
  const [isActive, setIsActive] = useState(true)
  const [images, setImages] = useState([])
  const [imageFiles, setImageFiles] = useState(new Map())
  const [uploadingImages, setUploadingImages] = useState(false)
  const [saving, setSaving] = useState(false)

  const [categories, setCategories] = useState([])
  const [allSubcategoryOptions, setAllSubcategoryOptions] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingProduct, setLoadingProduct] = useState(false)

  // New category/subcategory names – submitted together with product (one request for approval)
  const [requestedNewCategoryName, setRequestedNewCategoryName] = useState("")
  const [requestedNewSubcategoryNamesText, setRequestedNewSubcategoryNamesText] = useState("")

  // Fetch categories and subcategories (public endpoints – no admin auth)
  const fetchCategoriesAndSubcategories = async () => {
    try {
      const [categoriesRes, subcategoriesRes] = await Promise.all([
        groceryStoreAPI.getCategories({ includeSubcategories: 'true' }),
        groceryStoreAPI.getSubcategories()
      ])

      const rawCats = categoriesRes?.data?.data ?? categoriesRes?.data
      const cats = Array.isArray(rawCats) ? rawCats : []
      if (cats.length > 0) {
        setCategories(cats.map((cat) => ({
          id: cat._id || cat.id,
          name: cat.name || '',
          subcategories: cat.subcategories || [],
        })))
      }

      const rawSubs = subcategoriesRes?.data?.data ?? subcategoriesRes?.data
      const allSubs = Array.isArray(rawSubs) ? rawSubs : []
      if (allSubs.length > 0) {
        const normalized = allSubs
          .filter((item) => item?._id && item?.name)
          .map((item) => ({
            id: item._id,
            name: item.name,
            categoryId: (item?.category?._id ?? item?.category ?? item?.categoryId)?.toString?.() ?? String(item?.category?._id ?? item?.category ?? item?.categoryId ?? ''),
          }))
        setAllSubcategoryOptions(normalized)
      }
    } catch (error) {
      console.error('Error fetching categories:', error)
      throw error
    }
  }

  // Fetch grocery categories and subcategories (same as admin)
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true)
        await fetchCategoriesAndSubcategories()
      } catch (error) {
        console.error('Error fetching grocery categories:', error)
        toast.error('Failed to load categories')
      } finally {
        setLoadingCategories(false)
      }
    }

    fetchCategories()
  }, [])

  // Subcategories for the selected category only (can be 0 or multiple – like admin)
  const subcategoryOptions = useMemo(() => {
    if (!category) return []
    const catId = String(category)
    return allSubcategoryOptions.filter(
      (sub) => String(sub.categoryId) === catId
    )
  }, [category, allSubcategoryOptions])

  // Clear selected subcategories when category changes
  useEffect(() => {
    if (!category) setSubcategories([])
  }, [category])

  // Fetch product data if editing
  useEffect(() => {
    if (!isNewProduct && id) {
      const fetchProduct = async () => {
        try {
          setLoadingProduct(true)
          const response = await groceryStoreAPI.getProductById(id)
          if (response?.data?.success && response.data.data) {
            const product = response.data.data
            setProductName(product.name || "")
            setCategory(product.category?._id || product.category || "")
            setSubcategories(Array.isArray(product.subcategories) 
              ? product.subcategories.map(s => s._id || s)
              : product.subcategory ? [product.subcategory._id || product.subcategory] : [])
            setDescription(product.description || "")
            setMrp(product.mrp?.toString() || "")
            setSellingPrice(product.sellingPrice?.toString() || "")
            setUnit(product.unit || "")
            setStockQuantity(product.stockQuantity?.toString() || "0")
            setInStock(product.inStock !== false)
            setIsActive(product.isActive !== false)
            setImages(product.images || [])
          }
        } catch (error) {
          console.error('Error fetching product:', error)
          toast.error('Failed to load product')
        } finally {
          setLoadingProduct(false)
        }
      }
      fetchProduct()
    }
  }, [id, isNewProduct])

  const handleImageAdd = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return

    try {
      setUploadingImages(true)
      const uploads = []
      for (const file of files) {
        const uploaded = await uploadAPI.uploadMedia(file, { folder: "appzeto/grocery-store/products" })
        const url = uploaded?.data?.data?.url || uploaded?.data?.url
        if (url) {
          uploads.push(url)
          setImages(prev => [...prev, url])
        }
      }
      toast.success(`${uploads.length} image(s) uploaded`)
    } catch (error) {
      toast.error('Failed to upload images')
    } finally {
      setUploadingImages(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!productName.trim()) {
      toast.error('Product name is required')
      return
    }
    if (!category) {
      toast.error('Category is required')
      return
    }
    if (!mrp || parseFloat(mrp) <= 0) {
      toast.error('MRP is required and must be greater than 0')
      return
    }
    if (!sellingPrice || parseFloat(sellingPrice) <= 0) {
      toast.error('Selling price is required and must be greater than 0')
      return
    }

    try {
      setSaving(true)
      const payload = {
        category,
        subcategories: subcategories.filter(Boolean),
        name: productName.trim(),
        description: description.trim(),
        mrp: parseFloat(mrp),
        sellingPrice: parseFloat(sellingPrice),
        unit: unit.trim(),
        stockQuantity: parseInt(stockQuantity) || 0,
        inStock,
        isActive,
        images: images.filter(Boolean)
      }

      if (isNewProduct || !id) {
        // Create: new product or invalid/missing id (e.g. /store/product/undefined)
        if (requestedNewCategoryName.trim()) {
          payload.requestedNewCategory = { name: requestedNewCategoryName.trim() }
        }
        if (requestedNewSubcategoryNamesText.trim() && category) {
          payload.requestedNewSubcategoryNames = requestedNewSubcategoryNamesText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        }
        await groceryStoreAPI.createProduct(payload)
        toast.success('Product and any category/subcategory requests submitted for approval.')
      } else {
        await groceryStoreAPI.updateProduct(id, payload)
        toast.success('Product updated successfully')
      }

      navigate("/store")
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Failed to save product'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (loadingProduct) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white px-4 py-4 border-b border-slate-200 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" onClick={() => navigate("/store")} className="hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {isNewProduct ? "Add Product" : "Edit Product"}
          </h1>
        </div>
      </header>

      <main className="p-4 lg:p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Category *
            </label>
            {loadingCategories ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-sm text-slate-500">Loading categories...</span>
              </div>
            ) : (
              <select
                required
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value)
                  setSubcategories([])
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            )}
            {isNewProduct && (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  New category? (submitted with product for approval)
                </label>
                <input
                  type="text"
                  value={requestedNewCategoryName}
                  onChange={(e) => setRequestedNewCategoryName(e.target.value)}
                  placeholder="e.g. Organic Foods — leave empty if using existing category above"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white"
                />
              </div>
            )}
          </div>

          {category && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Subcategories <span className="text-slate-400 font-normal">(optional, select none or multiple)</span>
              </label>
              <div className="border border-slate-300 rounded-lg p-3 max-h-48 overflow-y-auto bg-white">
                {subcategoryOptions.length === 0 ? (
                  <p className="text-xs text-slate-500 px-1 py-1">
                    No subcategories available for this category. You can save without subcategories or create a new one.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {subcategoryOptions.map((sub) => {
                      const isSelected = subcategories.includes(sub.id)
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSubcategories(subcategories.filter((id) => id !== sub.id))
                            } else {
                              setSubcategories([...subcategories, sub.id])
                            }
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                            isSelected
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                          }`}
                        >
                          {sub.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Tap/click to select one or multiple subcategories</p>
              {isNewProduct && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    New subcategories? (submitted with product for approval)
                  </label>
                  <input
                    type="text"
                    value={requestedNewSubcategoryNamesText}
                    onChange={(e) => setRequestedNewSubcategoryNamesText(e.target.value)}
                    placeholder="e.g. Organic, Premium, Local — comma-separated, leave empty if not needed"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Product Name *
            </label>
            <input
              type="text"
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Enter product name"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter product description"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                MRP *
              </label>
              <input
                type="number"
                min="0"
                required
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
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
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
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
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g., kg, piece, pack"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Stock Quantity
              </label>
              <input
                type="number"
                min="0"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <Switch
                checked={inStock}
                onCheckedChange={setInStock}
                className="data-[state=checked]:bg-blue-600"
              />
              <label className="text-sm font-medium text-slate-700">In Stock</label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                className="data-[state=checked]:bg-blue-600"
              />
              <label className="text-sm font-medium text-slate-700">Active</label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Product Images
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {images.map((img, idx) => (
                <div key={idx} className="relative aspect-square group">
                  <img
                    src={img}
                    alt={`Product ${idx + 1}`}
                    className="w-full h-full object-cover rounded-lg border border-slate-200"
                  />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <label className="aspect-square border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors bg-slate-50">
                <Upload className="w-6 h-6 text-slate-400 mb-1" />
                <span className="text-xs text-slate-500">Add Image</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageAdd}
                  disabled={uploadingImages}
                />
              </label>
            </div>
            {uploadingImages && (
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                Uploading images...
              </div>
            )}
            {images.length === 0 && !uploadingImages && (
              <p className="text-xs text-slate-500 mt-1">You can add multiple product images</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button 
            variant="outline" 
            onClick={() => navigate("/store")}
            className="px-6 border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={saving || uploadingImages}
            className="px-6 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : isNewProduct ? "Create Product" : "Update Product"}
          </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
