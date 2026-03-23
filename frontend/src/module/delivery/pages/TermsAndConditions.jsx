import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, FileText, Loader2 } from "lucide-react"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"
import { navigateBackWithinDelivery } from "@/module/delivery/utils/navigation"

export default function TermsAndConditions() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [termsData, setTermsData] = useState({
    title: "Terms and Conditions",
    content: "<p>Loading...</p>",
    updatedAt: null,
  })

  useEffect(() => {
    const fetchTermsData = async () => {
      try {
        setLoading(true)
        const response = await api.get(API_ENDPOINTS.ADMIN.TERMS_PUBLIC)
        if (response.data?.success) {
          setTermsData({
            title: response.data.data?.title || "Terms and Conditions",
            content: response.data.data?.content || "<p>No terms and conditions content available.</p>",
            updatedAt: response.data.data?.updatedAt || null,
          })
        }
      } catch {
        setTermsData({
          title: "Terms and Conditions",
          content: "<p>Unable to load terms and conditions right now.</p>",
          updatedAt: null,
        })
      } finally {
        setLoading(false)
      }
    }

    fetchTermsData()
  }, [])

  const lastUpdatedLabel = useMemo(() => {
    if (!termsData.updatedAt) return "Not available"
    const dt = new Date(termsData.updatedAt)
    if (Number.isNaN(dt.getTime())) return "Not available"
    return dt.toLocaleDateString()
  }, [termsData.updatedAt])

  const handleBack = () => {
    const fallbackPath = location.pathname.startsWith("/delivery/profile")
      ? "/delivery"
      : "/delivery/sign-in"
    navigateBackWithinDelivery(navigate, fallbackPath)
  }

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center gap-4 rounded-b-3xl md:rounded-b-none">
        <button 
          onClick={handleBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg md:text-xl font-bold text-gray-900">Terms and Conditions</h1>
      </div>

      {/* Main Content */}
      <div className="w-full px-4 py-6 pb-24 md:pb-6">
        <div className="w-full max-w-none">
          <p className="text-gray-600 text-sm md:text-base mb-6">
            Last updated: {lastUpdatedLabel}
          </p>

          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500 mx-auto mb-3" />
              <p className="text-gray-600">Loading...</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-gray-200"
            >
              <h2 className="text-gray-900 font-bold text-lg md:text-xl mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                {termsData.title}
              </h2>
              <div
                className="prose max-w-none text-gray-700"
                dangerouslySetInnerHTML={{ __html: termsData.content }}
              />
            </motion.div>
          )}
        </div>
      </div>

    </div>
  )
}

