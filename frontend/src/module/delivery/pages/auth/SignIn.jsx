import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import api from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"
import { deliveryAPI } from "@/lib/api"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { loadBusinessSettings } from "@/lib/utils/businessSettings"
import PolicyModal from "@/components/legal/PolicyModal"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, Loader2, Phone } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getNativeMobilePushMetaForCurrentSession } from "@/lib/webPush"

const countryCodes = [
  { code: "+1", country: "US/CA" },
  { code: "+44", country: "UK" },
  { code: "+91", country: "IN" },
  { code: "+61", country: "AU" },
  { code: "+65", country: "SG" },
  { code: "+971", country: "AE" },
]

export default function DeliverySignIn() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [termsUrl, setTermsUrl] = useState("")
  const [formData, setFormData] = useState({
    countryCode: "+91",
    phone: "",
  })
  const [policyModal, setPolicyModal] = useState({
    open: false,
    title: "Terms and Conditions",
    loading: false,
    content: "",
    fallbackUrl: "",
  })

  useEffect(() => {
    const isAuthenticated = localStorage.getItem("delivery_authenticated") === "true"
    if (isAuthenticated) {
      navigate("/delivery", { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    const loadPolicyLinks = async () => {
      try {
        const settings = await loadBusinessSettings()
        setTermsUrl(settings?.policyLinks?.termsOfServiceUrl || "")
      } catch {
        // Keep fallback behavior.
      }
    }

    loadPolicyLinks()
  }, [])

  const displayCompanyName = useMemo(() => {
    const normalized = (companyName || "MoBasket").trim()
    if (!normalized) return "MoBasket"
    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
  }, [companyName])

  const validatePhone = (phone) => {
    if (!phone.trim()) return "Phone number is required"
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, "")
    if (!/^\d{7,15}$/.test(cleanPhone)) return "Phone number must be 7-15 digits"
    return ""
  }

  const handlePhoneChange = (event) => {
    const onlyDigits = event.target.value.replace(/[^\d]/g, "")
    setFormData((prev) => ({ ...prev, phone: onlyDigits }))
    if (error) setError("")
  }

  const openTermsModal = async () => {
    setPolicyModal({
      open: true,
      title: "Terms and Conditions",
      loading: true,
      content: "",
      fallbackUrl: termsUrl || "/delivery/terms-and-conditions",
    })

    try {
      const response = await api.get(API_ENDPOINTS.ADMIN.TERMS_PUBLIC, {
        params: { audience: "delivery" },
      })
      const data = response?.data?.data || {}
      setPolicyModal((prev) => ({
        ...prev,
        loading: false,
        title: data.title || prev.title,
        content: data.content || "<p>Content is not available right now.</p>",
      }))
    } catch {
      setPolicyModal((prev) => ({
        ...prev,
        loading: false,
        content: "<p>Unable to load terms right now.</p>",
      }))
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const phoneError = validatePhone(formData.phone)
    if (phoneError) {
      setError(phoneError)
      return
    }

    setIsLoading(true)
    setError("")

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      await deliveryAPI.sendOTP(fullPhone, "login")

      let mobilePushMeta = {}
      try {
        mobilePushMeta = await getNativeMobilePushMetaForCurrentSession("/delivery")
      } catch {
        mobilePushMeta = {}
      }

      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "delivery",
        mobilePushMeta,
      }
      const serializedAuthData = JSON.stringify(authData)
      sessionStorage.setItem("deliveryAuthData", serializedAuthData)
      localStorage.setItem("deliveryAuthData", serializedAuthData)

      navigate("/delivery/otp")
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to send OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-h-screen h-screen bg-white flex flex-col">
      <div className="flex flex-col items-center pt-8 pb-6 px-6">
        <div>
          <h1 className="text-3xl text-black font-extrabold italic tracking-tight">
            {displayCompanyName}
          </h1>
        </div>
        <div className="bg-black px-6 py-2 rounded mt-2">
          <span className="text-white font-semibold text-sm uppercase tracking-wide">
            DELIVERY
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-6">
        <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold text-black">Sign in with phone</h2>
            <p className="text-base text-gray-600">Enter your mobile number to receive OTP</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delivery-phone" className="text-sm text-gray-700">
              Mobile number
            </Label>
            <div className="flex items-stretch gap-2">
              <Select
                value={formData.countryCode}
                onValueChange={(value) => {
                  setFormData((prev) => ({ ...prev, countryCode: value }))
                  if (error) setError("")
                }}
              >
                <SelectTrigger className="h-12 w-[120px] rounded-lg border-gray-300 bg-white shadow-sm transition-colors focus-visible:border-primary-orange focus-visible:ring-2 focus-visible:ring-primary-orange/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countryCodes.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.code} ({item.country})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative flex-1">
                <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="delivery-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  placeholder="Enter phone number"
                  className={`h-12 rounded-lg border-gray-300 bg-white pl-10 shadow-sm transition-colors placeholder:text-gray-400 ${error
                      ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-2 focus-visible:ring-red-500/20"
                      : "focus-visible:border-primary-orange focus-visible:ring-2 focus-visible:ring-primary-orange/20"
                    }`}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-lg bg-black text-white font-semibold hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending OTP...
              </>
            ) : (
              "Continue"
            )}
          </button>

        </form>
      </div>

      <div className="px-6 pb-8 pt-4">
        <div className="w-full max-w-md mx-auto space-y-4">
          <p className="text-xs text-center text-gray-600 px-4">
            By continuing, you agree to our{" "}
            <button
              type="button"
              onClick={openTermsModal}
              className="text-blue-600 hover:underline"
            >
              Terms and Conditions
            </button>
          </p>
        </div>
      </div>

      <PolicyModal
        open={policyModal.open}
        onOpenChange={(open) => setPolicyModal((prev) => ({ ...prev, open }))}
        title={policyModal.title}
        loading={policyModal.loading}
        content={policyModal.content}
        fallbackUrl={policyModal.fallbackUrl}
      />
    </div>
  )
}
