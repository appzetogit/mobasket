import { useState, useRef, useEffect, useMemo } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import { ArrowLeft, X, Upload, Loader2, Package, Plus, Trash2, Camera, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { groceryStoreAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"

const createEmptyVariant = () => ({
  name: "",
  mrp: "",
  sellingPrice: "",
  stockQuantity: 0,
  inStock: true,
  isDefault: false,
})

const normalizeVariantsForForm = (variants = []) => {
  if (!Array.isArray(variants) || variants.length === 0) {
    return []
  }

  const normalized = variants
    .map((variant, index) => ({
      name: String(variant?.name || "").trim(),
      mrp: variant?.mrp ?? "",
      sellingPrice: variant?.sellingPrice ?? "",
      stockQuantity: variant?.stockQuantity ?? 0,
      inStock: variant?.inStock !== false,
      isDefault: variant?.isDefault === true,
      order: variant?.order ?? index,
    }))
    .filter((variant) => String(variant.name || "").trim())

  if (normalized.length === 0) return []

  const defaultIndex = normalized.findIndex((variant) => variant.isDefault)
  const resolvedDefaultIndex = defaultIndex >= 0 ? defaultIndex : 0

  return normalized.map((variant, index) => ({
    ...variant,
    isDefault: index === resolvedDefaultIndex,
  }))
}

export default function GroceryStoreProductDetailsPage() {
  const navigate = useNavigate()
  const { id: idParam } = useParams()
  // Treat "new", "undefined", or missing id as new product
  const isNewProduct = !idParam || idParam === "new" || idParam === "undefined"
  const id = isNewProduct ? null : idParam
  const fileInputRef = useRef(null)
  const galleryInputRef = useRef(null)

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
  const [variants, setVariants] = useState([])
  const [images, setImages] = useState([])
  const [updatingImageIndex, setUpdatingImageIndex] = useState(null)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [saving, setSaving] = useState(false)

  const [categories, setCategories] = useState([])
  const [allSubcategoryOptions, setAllSubcategoryOptions] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingProduct, setLoadingProduct] = useState(false)

  // New category/subcategory names – submitted together with product (one request for approval)
  const [requestedNewCategoryName, setRequestedNewCategoryName] = useState("")
  const [requestedNewSubcategoryNamesText, setRequestedNewSubcategoryNamesText] = useState("")

  useEffect(() => {
    const parsedStock = Number(stockQuantity)
    if (Number.isFinite(parsedStock) && parsedStock <= 0 && inStock) {
      setInStock(false)
    }
  }, [inStock, stockQuantity])

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
            const product = response.data.data.product || response.data.data
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
            setVariants(normalizeVariantsForForm(product.variants))
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
    if (uploadingImages) return
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploadingImages(true)
      const uploaded = await uploadAPI.uploadMedia(file, { folder: "mobasket/grocery-store/products" })
      const url = uploaded?.data?.data?.url || uploaded?.data?.url
      if (url) {
        if (updatingImageIndex !== null) {
          setImages(prev => {
            const next = [...prev]
            next[updatingImageIndex] = url
            return next
          })
          toast.success("Image updated successfully")
        } else {
          setImages(prev => [...prev, url])
          toast.success("Image uploaded successfully")
        }
      }
    } catch (error) {
      console.error('Error uploading image:', error)
      toast.error('Failed to upload image')
    } finally {
      setUploadingImages(false)
      setUpdatingImageIndex(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      if (galleryInputRef.current) {
        galleryInputRef.current.value = ""
      }
    }
  }

  const handleCameraAdd = async (index) => {
    if (uploadingImages) return;

    if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
      try {
        setUploadingImages(true);
        const result = await window.flutter_inappwebview.callHandler('openCamera');
        if (result && result.success && result.base64) {
          const base64Data = result.base64;
          const mimeType = result.mimeType || 'image/jpeg';
          const filename = result.fileName || `camera_${Date.now()}.jpg`;

          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const file = new File([byteArray], filename, { type: mimeType });

          const uploaded = await uploadAPI.uploadMedia(file, { folder: "mobasket/grocery-store/products" });
          const url = uploaded?.data?.data?.url || uploaded?.data?.url;

          if (url) {
            if (index !== null) {
              setImages(prev => {
                const next = [...prev];
                next[index] = url;
                return next;
              });
              toast.success("Image updated successfully");
            } else {
              setImages(prev => [...prev, url]);
              toast.success("Image uploaded successfully");
            }
          }
        } else {
          toast.error("Camera capture failed or cancelled");
        }
      } catch (error) {
        console.error('Camera error:', error);
        toast.error('Failed to capture image');
      } finally {
        setUploadingImages(false);
        setUpdatingImageIndex(null);
      }
    } else {
      setUpdatingImageIndex(index);
      fileInputRef.current?.click();
    }
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const addVariant = () => {
    setVariants((prev) => {
      const next = [...prev, createEmptyVariant()]
      if (next.length === 1) {
        next[0].isDefault = true
      }
      return next
    })
  }

  const updateVariant = (index, key, value) => {
    setVariants((prev) => prev.map((variant, variantIndex) => (
      variantIndex === index
        ? { ...variant, [key]: value }
        : variant
    )))
  }

  const setDefaultVariant = (index) => {
    setVariants((prev) => prev.map((variant, variantIndex) => ({
      ...variant,
      isDefault: variantIndex === index,
    })))
  }

  const removeVariant = (index) => {
    setVariants((prev) => {
      const next = prev.filter((_, variantIndex) => variantIndex !== index)
      if (next.length > 0 && !next.some((variant) => variant.isDefault)) {
        next[0] = { ...next[0], isDefault: true }
      }
      return next
    })
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
    if (!unit.trim()) {
      toast.error('Unit is required')
      return
    }
    if (stockQuantity === "" || Number.isNaN(Number(stockQuantity))) {
      toast.error('Stock quantity is required')
      return
    }

    const normalizedVariants = normalizeVariantsForForm(variants).map((variant, index) => ({
      name: String(variant.name || "").trim(),
      mrp: Number(variant.mrp || 0),
      sellingPrice: Number(variant.sellingPrice || 0),
      stockQuantity: Number(variant.stockQuantity || 0),
      inStock: variant.inStock !== false,
      isDefault: variant.isDefault === true,
      order: Number(variant.order ?? index) || index,
    }))

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
        variants: normalizedVariants,
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

      navigate("/store/products/all")
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
        <Button variant="ghost" onClick={() => navigate(-1)} className="hover:bg-slate-100">
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
                          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${isSelected
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
                onChange={(e) => {
                  const val = e.target.value
                  // Strip leading zeros only if followed by another digit (prevents 080 but allows 0.5)
                  const cleaned = val.replace(/^0+(?=\d)/, '')
                  setMrp(cleaned)
                }}
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
                onChange={(e) => {
                  const val = e.target.value
                  const cleaned = val.replace(/^0+(?=\d)/, '')
                  setSellingPrice(cleaned)
                }}
                placeholder="0.00"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Variants
                </label>
                <p className="text-xs text-slate-500 mt-1">
                  Add custom variants like 500gm, 1kg, Family Pack. The default variant becomes the main price shown for the product.
                </p>
              </div>
              <Button type="button" onClick={addVariant} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4 mr-1" />
                Add Variant
              </Button>
            </div>

            {variants.length === 0 ? (
              <p className="text-xs text-slate-500">
                No variants added yet. Use the base MRP, selling price, unit, and stock fields above for a single-size product.
              </p>
            ) : (
              <div className="space-y-3">
                {variants.map((variant, index) => (
                  <div key={`product-variant-${index}`} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">Variant {index + 1}</p>
                      <button
                        type="button"
                        onClick={() => removeVariant(index)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Variant Name
                      </label>
                      <input
                        type="text"
                        value={variant.name}
                        onChange={(e) => updateVariant(index, "name", e.target.value)}
                        placeholder="e.g. 500gm, 1kg, Combo Pack"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          MRP
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={variant.mrp}
                          onChange={(e) => updateVariant(index, "mrp", e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Selling Price
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={variant.sellingPrice}
                          onChange={(e) => updateVariant(index, "sellingPrice", e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Stock Quantity
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={variant.stockQuantity}
                          onChange={(e) => updateVariant(index, "stockQuantity", e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-4 pt-6">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={variant.inStock}
                            onChange={(e) => updateVariant(index, "inStock", e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                          />
                          In stock
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="radio"
                            name={`default-store-variant-${index}`}
                            checked={variant.isDefault}
                            onChange={() => setDefaultVariant(index)}
                            className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                          />
                          Default
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Unit *
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
                Stock Quantity *
              </label>
              <input
                type="number"
                min="0"
                value={stockQuantity}
                onChange={(e) => {
                  const val = e.target.value
                  const cleaned = val.replace(/^0+(?=\d)/, '')
                  setStockQuantity(cleaned || '0')
                }}
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageAdd}
              disabled={uploadingImages}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageAdd}
              disabled={uploadingImages}
            />
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {images.map((img, idx) => (
                <div
                  key={idx}
                  className="relative aspect-square group cursor-pointer"
                >
                  <img
                    src={img}
                    alt={`Product ${idx + 1}`}
                    className="w-full h-full object-cover rounded-lg border border-slate-200"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setUpdatingImageIndex(idx)
                        handleCameraAdd(idx)
                      }}
                      className="p-1 rounded-full bg-white/20 hover:bg-white/40"
                    >
                      <Camera className="w-4 h-4 text-white" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setUpdatingImageIndex(idx)
                        galleryInputRef.current?.click()
                      }}
                      className="p-1 rounded-full bg-white/20 hover:bg-white/40"
                    >
                      <ImageIcon className="w-4 h-4 text-white" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeImage(idx)
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:bg-red-600 transition-colors z-10"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div
                onClick={() => {
                  setUpdatingImageIndex(null)
                  handleCameraAdd(null)
                }}
                className="aspect-square border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors bg-slate-50"
              >
                <Camera className="w-6 h-6 text-slate-400 mb-1" />
                <span className="text-xs text-slate-500">Camera</span>
              </div>
              <div
                onClick={() => {
                  setUpdatingImageIndex(null)
                  galleryInputRef.current?.click()
                }}
                className="aspect-square border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors bg-slate-50"
              >
                <ImageIcon className="w-6 h-6 text-slate-400 mb-1" />
                <span className="text-xs text-slate-500">Gallery</span>
              </div>
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
              onClick={() => navigate(-1)}
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
