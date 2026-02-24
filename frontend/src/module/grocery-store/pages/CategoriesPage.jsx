import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowLeft, Plus, Grid3x3 } from "lucide-react"
import RestaurantNavbar from "@/module/restaurant/components/RestaurantNavbar"
import BottomNavOrders from "@/module/restaurant/components/BottomNavOrders"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

export default function GroceryStoreCategoriesPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true)
        const response = await adminAPI.getGroceryCategories({ activeOnly: 'false' })
        if (response.data?.success && response.data.data?.categories) {
          setCategories(response.data.data.categories)
        }
      } catch (error) {
        console.error("Error fetching categories:", error)
        toast.error("Failed to load categories")
      } finally {
        setLoading(false)
      }
    }

    fetchCategories()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-24">
      <RestaurantNavbar />
      
      <div className="flex-1 px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Loading categories...</div>
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Grid3x3 className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500">No categories found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {categories.map((category) => (
              <motion.div
                key={category._id}
                className="bg-white rounded-lg p-4 shadow-sm"
                whileHover={{ scale: 1.02 }}
              >
                <h3 className="font-semibold text-gray-900 mb-2">
                  {category.name}
                </h3>
                {category.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {category.description}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <BottomNavOrders />
    </div>
  )
}
