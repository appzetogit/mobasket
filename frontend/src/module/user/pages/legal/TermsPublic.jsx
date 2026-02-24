import { Link } from "react-router-dom"
import { useEffect, useState } from "react"
import { ArrowLeft, FileText, Loader2 } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"

export default function TermsPublic() {
  const [loading, setLoading] = useState(true)
  const [termsData, setTermsData] = useState({
    title: "Terms and Conditions",
    content: "<p>Loading...</p>",
  })

  useEffect(() => {
    const fetchTermsData = async () => {
      try {
        setLoading(true)
        const response = await api.get(API_ENDPOINTS.ADMIN.TERMS_PUBLIC)
        if (response.data?.success) {
          setTermsData(response.data.data)
        }
      } catch {
        setTermsData({
          title: "Terms and Conditions",
          content: "<p>Unable to load terms and conditions right now.</p>",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchTermsData()
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
          <h1 className="text-2xl font-bold text-gray-900">Terms and Conditions</h1>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500 mx-auto mb-3" />
            <p className="text-gray-600">Loading...</p>
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-gray-200 bg-white">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-600" />
              {termsData.title}
            </h2>
            <div
              className="prose max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: termsData.content }}
            />
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}

