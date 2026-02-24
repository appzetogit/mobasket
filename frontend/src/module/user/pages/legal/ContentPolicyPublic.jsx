import { Link } from "react-router-dom"
import { useEffect, useState } from "react"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"

export default function ContentPolicyPublic() {
  const [contentPolicyUrl, setContentPolicyUrl] = useState("")

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await loadBusinessSettings()
      setContentPolicyUrl(settings?.policyLinks?.contentPolicyUrl || "")
    }

    loadSettings()
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
          <h1 className="text-2xl font-bold text-gray-900">Content Policy</h1>
        </div>

        <div className="p-6 rounded-xl border border-gray-200 bg-white">
          <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            Content Policy
          </h2>
          {contentPolicyUrl ? (
            <a
              href={contentPolicyUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-green-700 underline"
            >
              Open Content Policy
            </a>
          ) : (
            <p className="text-gray-700">
              Content Policy URL is not configured by admin yet.
            </p>
          )}
        </div>
      </div>
    </AnimatedPage>
  )
}

