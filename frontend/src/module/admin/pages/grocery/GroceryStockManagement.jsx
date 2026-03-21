import { useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, Save, Search } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { usePlatform } from "../../context/PlatformContext"

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
        initialEdits[id] = {
          stockQuantity: Number(product.stockQuantity || 0),
          inStock: Boolean(product.inStock),
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
      return name.includes(query) || categoryName.includes(query)
    })
  }, [products, searchQuery])

  const setRowField = (productId, key, value) => {
    setEditedRows((prev) => ({
      ...prev,
      [productId]: {
        ...(() => {
          const currentStock = Number(prev[productId]?.stockQuantity || 0)
          const currentInStock = Boolean(prev[productId]?.inStock)
          if (key === "stockQuantity") {
            const normalizedStock = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
            return {
              stockQuantity: normalizedStock,
              inStock: normalizedStock > 0 ? currentInStock : false,
            }
          }
          return {
            stockQuantity: currentStock,
            inStock: value,
          }
        })(),
      },
    }))
  }

  const handleSave = async (productId) => {
    const edit = editedRows[productId]
    if (!edit) return

    const stockQuantity = Number.isFinite(Number(edit.stockQuantity))
      ? Math.max(0, Number(edit.stockQuantity))
      : 0
    const effectiveInStock = stockQuantity > 0 ? Boolean(edit.inStock) : false

    try {
      setSavingProductId(productId)
      await adminAPI.updateGroceryProduct(productId, {
        stockQuantity,
        inStock: effectiveInStock,
      })

      setProducts((prev) =>
        prev.map((product) =>
          String(product._id) === String(productId)
            ? { ...product, stockQuantity, inStock: effectiveInStock }
            : product
        )
      )
      setEditedRows((prev) => ({
        ...prev,
        [productId]: {
          stockQuantity,
          inStock: effectiveInStock,
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
                  const rowEdit = editedRows[productId] || {
                    stockQuantity: Number(product.stockQuantity || 0),
                    inStock: Boolean(product.inStock),
                  }
                  const isSaving = savingProductId === productId

                  return (
                    <tr key={productId}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{product.name || "Unnamed Product"}</div>
                        <div className="text-xs text-slate-500">{product.unit || "-"}</div>
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
                          className="w-28 px-2 py-1.5 border border-slate-300 rounded-md text-sm"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={rowEdit.inStock ? "yes" : "no"}
                          onChange={(e) => setRowField(productId, "inStock", e.target.value === "yes")}
                          disabled={Number(rowEdit.stockQuantity || 0) <= 0}
                          className="px-2 py-1.5 border border-slate-300 rounded-md text-sm"
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
