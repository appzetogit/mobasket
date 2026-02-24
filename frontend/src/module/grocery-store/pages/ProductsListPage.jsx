import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowLeft, Search, Plus, Package } from "lucide-react"
import RestaurantNavbar from "@/module/restaurant/components/RestaurantNavbar"
import BottomNavOrders from "@/module/restaurant/components/BottomNavOrders"
import { groceryStoreAPI } from "@/lib/api"
import { toast } from "sonner"

export default function GroceryStoreProductsListPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true)
        const response = await groceryStoreAPI.getProducts({ activeOnly: 'false' })
        const products = response.data?.data?.products || response.data?.data || []
        setProducts(Array.isArray(products) ? products : [])
      } catch (error) {
        console.error("Error fetching products:", error)
        toast.error("Failed to load products")
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [])

  const filteredProducts = products.filter(product =>
    product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-24">
      <RestaurantNavbar />
      
      <div className="flex-1 px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">All Products</h1>
          <button
            onClick={() => navigate("/store/product/new")}
            className="flex items-center gap-2 px-4 py-2 bg-[#ff8100] text-white rounded-lg hover:bg-[#e67300] transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Add Product</span>
          </button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ff8100]"
            />
          </div>
        </div>

        {/* Products List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Loading products...</div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">No products found</p>
            <button
              onClick={() => navigate("/store/product/new")}
              className="px-4 py-2 bg-[#ff8100] text-white rounded-lg hover:bg-[#e67300] transition-colors"
            >
              Add Your First Product
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredProducts.map((product) => {
              const productId = product._id ?? product.id
              if (!productId) return null
              return (
              <motion.button
                key={productId}
                onClick={() => navigate(`/store/product/${productId}`)}
                className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow text-left"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {product.images && product.images.length > 0 && (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-full h-32 object-cover rounded-lg mb-3"
                  />
                )}
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                  {product.name}
                </h3>
                <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                  {product.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-[#ff8100]">
                    ₹{product.sellingPrice || product.price || 0}
                  </span>
                  {product.mrp && product.mrp > (product.sellingPrice || product.price) && (
                    <span className="text-sm text-gray-400 line-through">
                      ₹{product.mrp}
                    </span>
                  )}
                </div>
              </motion.button>
              )
            })}
          </div>
        )}
      </div>

      <BottomNavOrders />
    </div>
  )
}
