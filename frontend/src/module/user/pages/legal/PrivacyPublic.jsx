import { Link } from "react-router-dom"
import { useEffect, useState } from "react"
import { ArrowLeft, Lock, Loader2 } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"

export default function PrivacyPublic() {
  const [loading, setLoading] = useState(true)
  const [privacyData, setPrivacyData] = useState({
    title: "Privacy Policy",
    content: "<p>Loading...</p>",
  })

  useEffect(() => {
    const fetchPrivacyData = async () => {
      try {
        setLoading(true)
        const response = await api.get(API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC)
        if (response.data?.success) {
          setPrivacyData(response.data.data)
        }
      } catch {
        setPrivacyData({
          title: "Privacy Policy",
          content: "<p>Unable to load privacy policy right now.</p>",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchPrivacyData()
  }, [])

  return (
    <AnimatedPage className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/auth/sign-in">
            <Button variant="ghost" size="icon" className="h-9 w-9 p-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Privacy Policy</h1>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500 mx-auto mb-3" />
            <p className="text-gray-600">Loading...</p>
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-gray-200 bg-white">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-green-600" />
              {privacyData.title}
            </h2>
            <div
              className="prose max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: privacyData.content }}
            />
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}

