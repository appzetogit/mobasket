import { Fragment, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, Save, Search } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { usePlatform } from "../../context/PlatformContext"

const normalizeStockState = (stockQuantity, inStock) => {
  const normalizedStockQuantity = Number.isFinite(Number(stockQuantity))
    ? Math.max(0, Number(stockQuantity))
    : 0

  return {
    stockQuantity: normalizedStockQuantity,
    inStock: normalizedStockQuantity > 0 ? Boolean(inStock) : false,
  }
}

export default function GroceryStockManagement() {
  const { platform, switchPlatform } = usePlatform()
  const [products, setProducts] = useState([])
  const [editedRows, setEditedRows] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingProductId, setSavingProductId] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (platform !== "mogrocery") {
      switchPlatform("mogrocery")
    }
  }, [platform, switchPlatform])

  const loadProducts = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getGroceryProducts({ limit: 2000 })
      const data = response?.data?.data || []
      setProducts(data)

      const initialEdits = {}
      data.forEach((product) => {
        const id = product?._id?.toString()
        if (!id) return
        const variants = Array.isArray(product?.variants)
          ? product.variants.map((variant, index) => ({
              name: variant?.name || "",
              mrp: Number(variant?.mrp || 0),
              sellingPrice: Number(variant?.sellingPrice || 0),
              stockQuantity: Number(variant?.stockQuantity || 0),
              inStock: Boolean(variant?.inStock),
              isDefault: variant?.isDefault === true,
              order: Number.isFinite(Number(variant?.order)) ? Number(variant.order) : index,
            }))
          : []

        initialEdits[id] = {
          stockQuantity: Number(product.stockQuantity || 0),
          inStock: Boolean(product.inStock),
          variants,
        }
      })
      setEditedRows(initialEdits)
    } catch (error) {
      console.error("Failed to load grocery products:", error)
      toast.error("Failed to load grocery products")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return products

    return products.filter((product) => {
      const name = (product?.name || "").toLowerCase()
      const categoryName = (product?.category?.name || "").toLowerCase()
      const hasMatchingVariant = Array.isArray(product?.variants)
        ? product.variants.some((variant) => String(variant?.name || "").toLowerCase().includes(query))
        : false
      return name.includes(query) || categoryName.includes(query) || hasMatchingVariant
    })
  }, [products, searchQuery])

  const setRowField = (productId, key, value) => {
    setEditedRows((prev) => ({
      ...prev,
      [productId]: {
        ...(() => {
          const currentStock = Number(prev[productId]?.stockQuantity || 0)
          const currentInStock = Boolean(prev[productId]?.inStock)
          const currentVariants = Array.isArray(prev[productId]?.variants) ? prev[productId].variants : []
          if (key === "stockQuantity") {
            const normalized = normalizeStockState(value, currentInStock)
            return {
              stockQuantity: normalized.stockQuantity,
              inStock: normalized.inStock,
              variants: currentVariants,
            }
          }
          return {
            stockQuantity: currentStock,
            inStock: value,
            variants: currentVariants,
          }
        })(),
      },
    }))
  }

  const setVariantField = (productId, variantIndex, key, value) => {
    setEditedRows((prev) => {
      const currentRow = prev[productId] || {}
      const currentVariants = Array.isArray(currentRow.variants) ? currentRow.variants : []

      const nextVariants = currentVariants.map((variant, index) => {
        if (index !== variantIndex) return variant

        if (key === "stockQuantity") {
          const normalized = normalizeStockState(value, variant?.inStock)
          return {
            ...variant,
            stockQuantity: normalized.stockQuantity,
            inStock: normalized.inStock,
          }
        }

        const normalized = normalizeStockState(variant?.stockQuantity, value)
        return {
          ...variant,
          inStock: normalized.inStock,
        }
      })

      return {
        ...prev,
        [productId]: {
          ...currentRow,
          stockQuantity: Number(currentRow?.stockQuantity || 0),
          inStock: Boolean(currentRow?.inStock),
          variants: nextVariants,
        },
      }
    })
  }

  const handleSave = async (productId) => {
    const edit = editedRows[productId]
    if (!edit) return

    const hasVariants = Array.isArray(edit.variants) && edit.variants.length > 0
    const normalizedBaseStock = normalizeStockState(edit.stockQuantity, edit.inStock)

    try {
      setSavingProductId(productId)
      let payload = {
        stockQuantity: normalizedBaseStock.stockQuantity,
        inStock: normalizedBaseStock.inStock,
      }

      if (hasVariants) {
        const normalizedVariants = edit.variants.map((variant, index) => {
          const normalized = normalizeStockState(variant?.stockQuantity, variant?.inStock)
          return {
            name: String(variant?.name || "").trim(),
            mrp: Number(variant?.mrp || 0),
            sellingPrice: Number(variant?.sellingPrice || 0),
            stockQuantity: normalized.stockQuantity,
            inStock: normalized.inStock,
            isDefault: variant?.isDefault === true,
            order: Number.isFinite(Number(variant?.order)) ? Number(variant.order) : index,
          }
        })

        const defaultVariant = normalizedVariants.find((variant) => variant.isDefault) || normalizedVariants[0]
        payload = {
          variants: normalizedVariants,
          stockQuantity: Number(defaultVariant?.stockQuantity || 0),
          inStock: Boolean(defaultVariant?.inStock),
        }
      }

      const response = await adminAPI.updateGroceryProduct(productId, payload)
      const updatedProduct = response?.data?.data?.product || response?.data?.data || null

      setProducts((prev) =>
        prev.map((product) =>
          String(product._id) === String(productId)
            ? (updatedProduct ? { ...product, ...updatedProduct } : {
                ...product,
                ...payload,
              })
            : product
        )
      )

      const syncedProduct = updatedProduct || payload
      const syncedVariants = Array.isArray(syncedProduct?.variants)
        ? syncedProduct.variants.map((variant, index) => ({
            name: variant?.name || "",
            mrp: Number(variant?.mrp || 0),
            sellingPrice: Number(variant?.sellingPrice || 0),
            stockQuantity: Number(variant?.stockQuantity || 0),
            inStock: Boolean(variant?.inStock),
            isDefault: variant?.isDefault === true,
            order: Number.isFinite(Number(variant?.order)) ? Number(variant.order) : index,
          }))
        : []

      setEditedRows((prev) => ({
        ...prev,
        [productId]: {
          stockQuantity: Number(syncedProduct?.stockQuantity || 0),
          inStock: Boolean(syncedProduct?.inStock),
          variants: syncedVariants,
        },
      }))
      toast.success("Stock updated")
    } catch (error) {
      console.error("Failed to update stock:", error)
      toast.error(error?.response?.data?.message || "Failed to update stock")
    } finally {
      setSavingProductId("")
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Stock Management</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage stock for all MoGrocery products.
            </p>
          </div>
          <button
            onClick={loadProducts}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="mt-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product or category"
            className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Current Stock</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">In Stock</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-14 text-center">
                    <div className="inline-flex items-center gap-2 text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Loading products...
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-14 text-center text-slate-500">
                    No products found.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const productId = String(product._id)
                  const hasVariants = Array.isArray(product?.variants) && product.variants.length > 0
                  const rowEdit = editedRows[productId] || {
                    stockQuantity: Number(product.stockQuantity || 0),
                    inStock: Boolean(product.inStock),
                    variants: [],
                  }
                  const isSaving = savingProductId === productId

                  return (
                    <Fragment key={productId}>
                      <tr>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{product.name || "Unnamed Product"}</div>
                          <div className="text-xs text-slate-500">{product.unit || "-"}</div>
                          {hasVariants ? (
                            <div className="mt-1 text-[11px] text-emerald-700 font-medium">
                              {rowEdit.variants?.length || product.variants.length} variants available
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {product?.category?.name || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            value={rowEdit.stockQuantity}
                            onChange={(e) => setRowField(productId, "stockQuantity", e.target.value)}
                            disabled={hasVariants}
                            className="w-28 px-2 py-1.5 border border-slate-300 rounded-md text-sm disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={rowEdit.inStock ? "yes" : "no"}
                            onChange={(e) => setRowField(productId, "inStock", e.target.value === "yes")}
                            disabled={hasVariants || Number(rowEdit.stockQuantity || 0) <= 0}
                            className="px-2 py-1.5 border border-slate-300 rounded-md text-sm disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            <option value="yes">In Stock</option>
                            <option value="no">Out of Stock</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleSave(productId)}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
                          >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Update
                          </button>
                        </td>
                      </tr>
                      {hasVariants ? (
                        <tr>
                          <td colSpan={5} className="px-4 pb-4 pt-0">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                Variant Stock
                              </div>
                              <div className="space-y-2">
                                {rowEdit.variants?.map((variant, variantIndex) => (
                                  <div
                                    key={`${productId}-variant-${variantIndex}`}
                                    className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 items-center bg-white border border-slate-200 rounded-md p-2"
                                  >
                                    <div className="text-sm text-slate-800 font-medium">
                                      {variant?.name || `Variant ${variantIndex + 1}`}
                                      {variant?.isDefault ? (
                                        <span className="ml-2 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                          Default
                                        </span>
                                      ) : null}
                                    </div>
                                    <input
                                      type="number"
                                      min={0}
                                      value={Number(variant?.stockQuantity || 0)}
                                      onChange={(e) => setVariantField(productId, variantIndex, "stockQuantity", e.target.value)}
                                      className="w-28 px-2 py-1.5 border border-slate-300 rounded-md text-sm"
                                    />
                                    <select
                                      value={variant?.inStock ? "yes" : "no"}
                                      onChange={(e) => setVariantField(productId, variantIndex, "inStock", e.target.value === "yes")}
                                      disabled={Number(variant?.stockQuantity || 0) <= 0}
                                      className="px-2 py-1.5 border border-slate-300 rounded-md text-sm disabled:bg-slate-100 disabled:text-slate-400"
                                    >
                                      <option value="yes">In Stock</option>
                                      <option value="no">Out of Stock</option>
                                    </select>
                                    <div className="text-xs text-slate-500">
                                      MRP {Number(variant?.mrp || 0)} / SP {Number(variant?.sellingPrice || 0)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
